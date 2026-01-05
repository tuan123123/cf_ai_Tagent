import type {
  DurableObject,
  DurableObjectState,
} from "@cloudflare/workers-types";

type Role = "user" | "assistant" | "system";
type ChatMessage = { role: Role; content: string };

type ChatRequest = {
  messages: ChatMessage[];
};

type DOState = {
  history: ChatMessage[];
  summary: string;
};

const MODEL = "@cf/meta/llama-3.3-70b-instruct-fp8-fast";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

export class ChatDO implements DurableObject {
  private state: DurableObjectState;
  private env: any;
  private data: DOState;

  constructor(state: DurableObjectState, env: any) {
    this.state = state;
    this.env = env;
    this.data = { history: [], summary: "" };
  }

  private async load() {
    const stored = await this.state.storage.get<DOState>("state");
    if (stored) this.data = stored;
  }

  private async save() {
    await this.state.storage.put("state", this.data);
  }

  private buildPrompt(latestUser: string) {
    const summary = this.data.summary?.trim();
    const history = this.data.history.slice(-16);

    const system = [
      "You are an AI agent running on Cloudflare.",
      "Be accurate and helpful.",
      "If you are unsure, ask a clarifying question.",
      summary ? `Long-term memory summary:\n${summary}` : "",
    ]
      .filter(Boolean)
      .join("\n\n");

    return [
      { role: "system" as const, content: system },
      ...history.filter(m => m.role !== "system").map((m) => ({ role: m.role as any, content: m.content })),
      { role: "user" as const, content: latestUser },
    ];
  }

  private shouldCompact() {
    return this.data.history.length >= 24;
  }

  async fetch(req: Request): Promise<Response> {
    const url = new URL(req.url);

    if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
    if (url.pathname === "/update-summary" && req.method === "POST") {
      await this.load();
      const { summary } = (await req.json()) as { summary?: string };
      if (typeof summary === "string") {
        this.data.summary = summary.slice(0, 2000);
        this.data.history = this.data.history.slice(-12);
        await this.save();
      }
      return json({ ok: true });
    }
    if (url.pathname !== "/chat") return new Response("Not Found", { status: 404, headers: corsHeaders });
    if (req.method !== "POST") return new Response("Method Not Allowed", { status: 405, headers: corsHeaders });

    await this.load();

    let body: ChatRequest;
    try {
      body = (await req.json()) as ChatRequest;
    } catch {
      return json({ error: "Invalid JSON" }, 400);
    }

    if (!Array.isArray(body.messages)) return json({ error: "`messages` must be an array" }, 400);

    const lastUser = [...body.messages].reverse().find((m) => m.role === "user")?.content?.trim();
    if (!lastUser) return json({ message: "Send a message to start." });

    this.data.history.push({ role: "user", content: lastUser });

    const messages = this.buildPrompt(lastUser);

    const result = (await this.env.AI.run(MODEL, {
      messages,
      temperature: 0.3,
      max_tokens: 700
    })) as any;

    const assistant =
      result?.response ?? result?.result?.response ?? "I could not generate a response.";

    this.data.history.push({ role: "assistant", content: assistant });

    
    this.data.history = this.data.history.slice(-40);

    await this.save();

    
    if (this.shouldCompact()) {
      
      this.env.MEMORY_COMPACTION.create({
        id: this.state.id.toString(),
        params: {
          doId: this.state.id.toString(),
          history: this.data.history,
          existingSummary: this.data.summary || ""
        }
      }).catch(() => {});
    }

    return json({ message: assistant });
  }
}
