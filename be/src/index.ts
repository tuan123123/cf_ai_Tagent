import type { DurableObjectNamespace } from "@cloudflare/workers-types";
import { ChatDO } from "./chat-do";
import { MemoryCompactionWorkflow } from "./workflows";

type WorkersAI = {
  run: (model: string, input: any) => Promise<any>;
};

type WorkflowRunner = {
  create: (opts: { id: string; params: unknown }) => Promise<unknown>;
};

export interface Env {
  AI: WorkersAI;
  CHAT_DO: DurableObjectNamespace;
  MEMORY_COMPACTION: WorkflowRunner;
}


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

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);

    if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

    if (url.pathname === "/health") return json({ ok: true });

    if (url.pathname !== "/chat") {
      return new Response("Not Found", { status: 404, headers: corsHeaders });
    }
    if (req.method !== "POST") {
      return new Response("Method Not Allowed", { status: 405, headers: corsHeaders });
    }

    
    const userId = req.headers.get("x-user-id") || "demo-user";

    const id = env.CHAT_DO.idFromName(userId);
    const stub = env.CHAT_DO.get(id);

    
    const res = await stub.fetch(req);
    return res;
  },
};

export { ChatDO, MemoryCompactionWorkflow };
