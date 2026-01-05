# cf_AI Agent

An AI-powered chat application built on **Cloudflare’s edge platform**, showcasing how to build **stateful AI agents** using Workers AI, Durable Objects, and Workflows.

This project demonstrates production-grade system design, real-time inference with **Llama 3.3**, and scalable per-user memory — all running globally on Cloudflare’s network.

---

## ✨ Features

- 🤖 AI chat powered by **Llama 3.3** (Cloudflare Workers AI)
- 🧠 Per-user persistent memory using **Durable Objects**
- 🔁 Background memory compaction with **Cloudflare Workflows**
- ⚡ Low-latency API deployed on Cloudflare Workers
- 💬 React frontend deployed on Cloudflare Pages
- 🌍 Globally distributed on Cloudflare’s edge network

---

## 🧩 Architecture
React (Pages)
|
v
Worker API (/chat)
|
v
Durable Object (Agent Runtime)
| |
| └── Durable State (Memory)
|
└── Workers AI (Llama 3.3)
|
└── Workflow (Memory Compaction)


---

## 🛠️ Tech Stack

**Backend**
- Cloudflare Workers
- Durable Objects
- Cloudflare Workflows
- Workers AI (Llama 3.3)
- TypeScript

**Frontend**
- React + TypeScript
- Vite
- Cloudflare Pages

---

## 🧠 AI Agent Design

**Short-Term Memory**
- Recent conversation turns stored in a Durable Object
- Provides fast, context-aware responses

**Long-Term Memory**
- Asynchronously summarized using a Workflow
- Stored as compact text and injected into future prompts
- Keeps context relevant while controlling memory growth

---

## 🔄 Why Durable Objects?

Durable Objects provide strongly consistent, low-latency state for each user.  
Each user is deterministically routed to a single agent instance, ensuring reliable memory persistence across requests.

---

## 🔁 Why Workflows?

Workflows handle expensive summarization outside the request path, preventing user-facing latency and enabling clean background coordination.

---

