# NextFlow

An LLM workflow builder — a clone of the Galaxy.ai / Magica workflow canvas. Build node-based AI workflows on a React Flow canvas where **every node executes as a Trigger.dev task**, with live status, a 30s-delayed FFmpeg crop, and Gemini (with vision).

## Stack

Next.js 16 (App Router) · TypeScript (strict) · Tailwind v4 · React Flow (`@xyflow/react`) · Zustand · Clerk (auth) · Prisma + Neon Postgres · Trigger.dev (execution) · Google Gemini (`@google/genai`) · Transloadit + FFmpeg (image crop) · Zod.

## Features

- **3 pages only:** Clerk sign-in/up, Dashboard (list / create / open / rename / delete), Workflow Canvas.
- **4 node types:** Request-Inputs & Response (pre-placed), Crop Image (FFmpeg, mandatory 30s delay), Gemini (multimodal / vision) — added via the bottom `+` picker.
- **Parallel DAG execution** via Trigger.dev (dependency-counter engine; siblings run concurrently, never blocking).
- **Live** pulsating glow, inline node output, and run history.
- Type-safe connections, connected-input grey-out, DAG (no-cycle) validation, undo/redo, MiniMap, dot grid.
- Selective execution (single node / multi-select / full), JSON import/export, per-user persistence.
- **BYOK:** bring your own Gemini key (verified, stored locally, never persisted to the DB).

## Setup

```bash
npm install
cp .example.env .env.local      # fill: Clerk, DATABASE_URL (Neon), Gemini, Trigger.dev, Transloadit
npx prisma migrate dev
npm run dev                      # app  → http://localhost:3000
npx trigger.dev@latest dev       # task worker (separate terminal)
```
