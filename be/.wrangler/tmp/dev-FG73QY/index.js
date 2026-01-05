var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// src/chat-do.ts
var MODEL = "@cf/meta/llama-3.3-70b-instruct-fp8-fast";
var corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type"
};
function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" }
  });
}
__name(json, "json");
var ChatDO = class {
  static {
    __name(this, "ChatDO");
  }
  state;
  env;
  data;
  constructor(state, env) {
    this.state = state;
    this.env = env;
    this.data = { history: [], summary: "" };
  }
  async load() {
    const stored = await this.state.storage.get("state");
    if (stored) this.data = stored;
  }
  async save() {
    await this.state.storage.put("state", this.data);
  }
  buildPrompt(latestUser) {
    const summary = this.data.summary?.trim();
    const history = this.data.history.slice(-16);
    const system = [
      "You are an AI agent running on Cloudflare.",
      "Be accurate and helpful.",
      "If you are unsure, ask a clarifying question.",
      summary ? `Long-term memory summary:
${summary}` : ""
    ].filter(Boolean).join("\n\n");
    return [
      { role: "system", content: system },
      ...history.filter((m) => m.role !== "system").map((m) => ({ role: m.role, content: m.content })),
      { role: "user", content: latestUser }
    ];
  }
  shouldCompact() {
    return this.data.history.length >= 24;
  }
  async fetch(req) {
    const url = new URL(req.url);
    if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
    if (url.pathname === "/update-summary" && req.method === "POST") {
      await this.load();
      const { summary } = await req.json();
      if (typeof summary === "string") {
        this.data.summary = summary.slice(0, 2e3);
        this.data.history = this.data.history.slice(-12);
        await this.save();
      }
      return json({ ok: true });
    }
    if (url.pathname !== "/chat") return new Response("Not Found", { status: 404, headers: corsHeaders });
    if (req.method !== "POST") return new Response("Method Not Allowed", { status: 405, headers: corsHeaders });
    await this.load();
    let body;
    try {
      body = await req.json();
    } catch {
      return json({ error: "Invalid JSON" }, 400);
    }
    if (!Array.isArray(body.messages)) return json({ error: "`messages` must be an array" }, 400);
    const lastUser = [...body.messages].reverse().find((m) => m.role === "user")?.content?.trim();
    if (!lastUser) return json({ message: "Send a message to start." });
    this.data.history.push({ role: "user", content: lastUser });
    const messages = this.buildPrompt(lastUser);
    const result = await this.env.AI.run(MODEL, {
      messages,
      temperature: 0.3,
      max_tokens: 700
    });
    const assistant = result?.response ?? result?.result?.response ?? "I could not generate a response.";
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
      }).catch(() => {
      });
    }
    return json({ message: assistant });
  }
};

// src/workflows.ts
import { WorkflowEntrypoint } from "cloudflare:workers";
var MODEL2 = "@cf/meta/llama-3.3-70b-instruct-fp8-fast";
var MemoryCompactionWorkflow = class extends WorkflowEntrypoint {
  static {
    __name(this, "MemoryCompactionWorkflow");
  }
  async run(event, step) {
    const { doId, history, existingSummary } = event.params;
    const summary = await step.do("summarize", async () => {
      const prompt = [
        "Create a concise long-term memory summary for an AI chat agent.",
        "Only include stable preferences, ongoing goals, and recurring context.",
        "Do not include sensitive personal data.",
        "Keep it under 1200 characters.",
        "",
        existingSummary ? `Existing summary:
${existingSummary}
` : "",
        "Recent conversation turns:",
        history.slice(-30).map((m) => `${m.role.toUpperCase()}: ${m.content}`).join("\n")
      ].join("\n");
      const resp = await this.env.AI.run(MODEL2, {
        messages: [
          { role: "system", content: "You write short durable memory summaries." },
          { role: "user", content: prompt }
        ],
        temperature: 0.2,
        max_tokens: 400
      });
      return resp?.response ?? resp?.result?.response ?? "";
    });
    await step.do("write-back", async () => {
      const ns = this.env.CHAT_DO;
      const id = ns.idFromString(doId);
      const stub = ns.get(id);
      await stub.fetch("https://internal/update-summary", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ summary })
      });
    });
    return { ok: true };
  }
};

// src/index.ts
var corsHeaders2 = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type"
};
function json2(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders2, "Content-Type": "application/json" }
  });
}
__name(json2, "json");
var src_default = {
  async fetch(req, env) {
    const url = new URL(req.url);
    if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders2 });
    if (url.pathname === "/health") return json2({ ok: true });
    if (url.pathname !== "/chat") {
      return new Response("Not Found", { status: 404, headers: corsHeaders2 });
    }
    if (req.method !== "POST") {
      return new Response("Method Not Allowed", { status: 405, headers: corsHeaders2 });
    }
    const userId = req.headers.get("x-user-id") || "demo-user";
    const id = env.CHAT_DO.idFromName(userId);
    const stub = env.CHAT_DO.get(id);
    const res = await stub.fetch(req);
    return res;
  }
};

// ../../../../AppData/Roaming/npm/node_modules/wrangler/templates/middleware/middleware-ensure-req-body-drained.ts
var drainBody = /* @__PURE__ */ __name(async (request, env, _ctx, middlewareCtx) => {
  try {
    return await middlewareCtx.next(request, env);
  } finally {
    try {
      if (request.body !== null && !request.bodyUsed) {
        const reader = request.body.getReader();
        while (!(await reader.read()).done) {
        }
      }
    } catch (e) {
      console.error("Failed to drain the unused request body.", e);
    }
  }
}, "drainBody");
var middleware_ensure_req_body_drained_default = drainBody;

// ../../../../AppData/Roaming/npm/node_modules/wrangler/templates/middleware/middleware-miniflare3-json-error.ts
function reduceError(e) {
  return {
    name: e?.name,
    message: e?.message ?? String(e),
    stack: e?.stack,
    cause: e?.cause === void 0 ? void 0 : reduceError(e.cause)
  };
}
__name(reduceError, "reduceError");
var jsonError = /* @__PURE__ */ __name(async (request, env, _ctx, middlewareCtx) => {
  try {
    return await middlewareCtx.next(request, env);
  } catch (e) {
    const error = reduceError(e);
    return Response.json(error, {
      status: 500,
      headers: { "MF-Experimental-Error-Stack": "true" }
    });
  }
}, "jsonError");
var middleware_miniflare3_json_error_default = jsonError;

// .wrangler/tmp/bundle-mJWDIw/middleware-insertion-facade.js
var __INTERNAL_WRANGLER_MIDDLEWARE__ = [
  middleware_ensure_req_body_drained_default,
  middleware_miniflare3_json_error_default
];
var middleware_insertion_facade_default = src_default;

// ../../../../AppData/Roaming/npm/node_modules/wrangler/templates/middleware/common.ts
var __facade_middleware__ = [];
function __facade_register__(...args) {
  __facade_middleware__.push(...args.flat());
}
__name(__facade_register__, "__facade_register__");
function __facade_invokeChain__(request, env, ctx, dispatch, middlewareChain) {
  const [head, ...tail] = middlewareChain;
  const middlewareCtx = {
    dispatch,
    next(newRequest, newEnv) {
      return __facade_invokeChain__(newRequest, newEnv, ctx, dispatch, tail);
    }
  };
  return head(request, env, ctx, middlewareCtx);
}
__name(__facade_invokeChain__, "__facade_invokeChain__");
function __facade_invoke__(request, env, ctx, dispatch, finalMiddleware) {
  return __facade_invokeChain__(request, env, ctx, dispatch, [
    ...__facade_middleware__,
    finalMiddleware
  ]);
}
__name(__facade_invoke__, "__facade_invoke__");

// .wrangler/tmp/bundle-mJWDIw/middleware-loader.entry.ts
var __Facade_ScheduledController__ = class ___Facade_ScheduledController__ {
  constructor(scheduledTime, cron, noRetry) {
    this.scheduledTime = scheduledTime;
    this.cron = cron;
    this.#noRetry = noRetry;
  }
  static {
    __name(this, "__Facade_ScheduledController__");
  }
  #noRetry;
  noRetry() {
    if (!(this instanceof ___Facade_ScheduledController__)) {
      throw new TypeError("Illegal invocation");
    }
    this.#noRetry();
  }
};
function wrapExportedHandler(worker) {
  if (__INTERNAL_WRANGLER_MIDDLEWARE__ === void 0 || __INTERNAL_WRANGLER_MIDDLEWARE__.length === 0) {
    return worker;
  }
  for (const middleware of __INTERNAL_WRANGLER_MIDDLEWARE__) {
    __facade_register__(middleware);
  }
  const fetchDispatcher = /* @__PURE__ */ __name(function(request, env, ctx) {
    if (worker.fetch === void 0) {
      throw new Error("Handler does not export a fetch() function.");
    }
    return worker.fetch(request, env, ctx);
  }, "fetchDispatcher");
  return {
    ...worker,
    fetch(request, env, ctx) {
      const dispatcher = /* @__PURE__ */ __name(function(type, init) {
        if (type === "scheduled" && worker.scheduled !== void 0) {
          const controller = new __Facade_ScheduledController__(
            Date.now(),
            init.cron ?? "",
            () => {
            }
          );
          return worker.scheduled(controller, env, ctx);
        }
      }, "dispatcher");
      return __facade_invoke__(request, env, ctx, dispatcher, fetchDispatcher);
    }
  };
}
__name(wrapExportedHandler, "wrapExportedHandler");
function wrapWorkerEntrypoint(klass) {
  if (__INTERNAL_WRANGLER_MIDDLEWARE__ === void 0 || __INTERNAL_WRANGLER_MIDDLEWARE__.length === 0) {
    return klass;
  }
  for (const middleware of __INTERNAL_WRANGLER_MIDDLEWARE__) {
    __facade_register__(middleware);
  }
  return class extends klass {
    #fetchDispatcher = /* @__PURE__ */ __name((request, env, ctx) => {
      this.env = env;
      this.ctx = ctx;
      if (super.fetch === void 0) {
        throw new Error("Entrypoint class does not define a fetch() function.");
      }
      return super.fetch(request);
    }, "#fetchDispatcher");
    #dispatcher = /* @__PURE__ */ __name((type, init) => {
      if (type === "scheduled" && super.scheduled !== void 0) {
        const controller = new __Facade_ScheduledController__(
          Date.now(),
          init.cron ?? "",
          () => {
          }
        );
        return super.scheduled(controller);
      }
    }, "#dispatcher");
    fetch(request) {
      return __facade_invoke__(
        request,
        this.env,
        this.ctx,
        this.#dispatcher,
        this.#fetchDispatcher
      );
    }
  };
}
__name(wrapWorkerEntrypoint, "wrapWorkerEntrypoint");
var WRAPPED_ENTRY;
if (typeof middleware_insertion_facade_default === "object") {
  WRAPPED_ENTRY = wrapExportedHandler(middleware_insertion_facade_default);
} else if (typeof middleware_insertion_facade_default === "function") {
  WRAPPED_ENTRY = wrapWorkerEntrypoint(middleware_insertion_facade_default);
}
var middleware_loader_entry_default = WRAPPED_ENTRY;
export {
  ChatDO,
  MemoryCompactionWorkflow,
  __INTERNAL_WRANGLER_MIDDLEWARE__,
  middleware_loader_entry_default as default
};
//# sourceMappingURL=index.js.map
