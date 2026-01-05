import { WorkflowEntrypoint } from "cloudflare:workers";
import type { DurableObjectNamespace } from "@cloudflare/workers-types";

type Role = "user" | "assistant" | "system";
type ChatMessage = { role: Role; content: string };

type Params = {
  doId: string;
  history: ChatMessage[];
  existingSummary: string;
};

const MODEL = "@cf/meta/llama-3.3-70b-instruct-fp8-fast";

export class MemoryCompactionWorkflow extends WorkflowEntrypoint<any> {
  async run(event: any, step: any) {
    const { doId, history, existingSummary } = event.params as Params;

    const summary = await step.do("summarize", async () => {
      const prompt = [
        "Create a concise long-term memory summary for an AI chat agent.",
        "Only include stable preferences, ongoing goals, and recurring context.",
        "Do not include sensitive personal data.",
        "Keep it under 1200 characters.",
        "",
        existingSummary ? `Existing summary:\n${existingSummary}\n` : "",
        "Recent conversation turns:",
        history.slice(-30).map(m => `${m.role.toUpperCase()}: ${m.content}`).join("\n")
      ].join("\n");

      const resp = (await this.env.AI.run(MODEL, {
        messages: [
          { role: "system", content: "You write short durable memory summaries." },
          { role: "user", content: prompt }
        ],
        temperature: 0.2,
        max_tokens: 400
      })) as any;

      return resp?.response ?? resp?.result?.response ?? "";
    });

    await step.do("write-back", async () => {
      // Write the summary back into the DO state
      // Use the DO namespace binding available in env
      const ns = this.env.CHAT_DO as DurableObjectNamespace;
      const id = ns.idFromString(doId);
      const stub = ns.get(id);

      // Call the DO on an internal endpoint to update summary
      await stub.fetch("https://internal/update-summary", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ summary })
      });
    });

    return { ok: true };
  }
}
