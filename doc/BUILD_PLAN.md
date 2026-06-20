# NextFlow — Build Plan (v3, build-ready)

A verified, build-ready plan to ship the **Magica / galaxy.ai workflow-builder clone** (full spec in [README.md](./README.md)) in **3 days**.

> **The reference is Magica.** `try.galaxy.ai/clone` now redirects to `magica.com/app/...` (galaxy.ai → Magica). §4 was **measured from the signed-in builder** — screenshots in [`./reference/`](./reference/).

---

## What changed (read this first)

| # | Correction | Impact |
|---|---|---|
| 1 | **Execution engine redesigned.** Trigger.dev v4 **forbids `Promise.all` around `triggerAndWait`/`batchTriggerAndWait`**. The original promise-per-node fan-out would not run. Replaced with an **event-driven dependency-counter** engine (§6) — still satisfies "never block on unrelated siblings." | High |
| 2 | **`@google/generative-ai` is end-of-life (2025-11-30).** Spec is stale. Use **`@google/genai`** (unified GenAI SDK, GA). | High |
| 3 | **Model id pinned.** UI label "Gemini 3.1 Pro" → API `gemini-3.1-pro-preview` (preview) or GA `gemini-2.5-pro`. Decouple label from id in config. | Medium |
| 4 | **v3: §4 design system re-measured from the live signed-in builder.** Canvas is **LIGHT** (not dark), handles/edges are **type-colored**, font is **"Google Sans Flex"**, nodes are white 12px-radius cards. Replaced the inferred dark `--wf-*` tokens with measured values + node/picker/toolbar anatomy. Screenshots in `./reference/`. | High |
| 5 | **TypeScript contracts (§8) + env/setup (§10) added.** | Medium |

Verified against current docs (fetched 2026-06-20): trigger.dev/docs (v4), ai.google.dev. §4 measured live from the authenticated Magica builder.

---

## 0. Guiding constraints (don't lose these)

| Constraint | Where it bites |
|---|---|
| **Only 3 pages** — Clerk auth, Dashboard, Canvas. No marketing/landing. | Routing + middleware |
| **Bottom-center `+` picker** to add nodes (NOT a left sidebar). | Canvas UI |
| **Request-Inputs + Response pre-placed & undeletable.** | Canvas init + delete guard |
| **Every executable node runs as a Trigger.dev task.** Request-Inputs/Response are local-only. | Execution engine |
| **Crop Image must await ≥ 30s** before returning (hard requirement). | `wait.for({ seconds: 30 })` |
| **Parallel fan-out:** a finished node proceeds immediately; never blocks on unrelated siblings at the same DAG level. | Execution engine (§6) |
| **`console.log("[NextFlow] Candidate LinkedIn: <url>")` exactly once on initial client render of every page.** | Root client component |
| Type-safe connections, connected-input greyed out, DAG-only (no cycles). | Connection validation |
| Selective execution (single / multi-select / full), each = a history entry. | Run API + history |
| Match Magica pixel-perfect for anything unspecified. | Use tokens in §4 |

---

## 1. Architecture overview

```
Browser (Next.js client)
  ├─ React Flow canvas → Zustand store (nodes, edges, selection, dirty, undo/redo)
  │     • bottom + picker, node UIs, animated edges, minimap, dot grid
  │     • Trigger.dev Realtime hook (subscribe by tag) → live node status → glow
  │
  ├─ Server Actions / Route Handlers (Zod-validated)
  │     • workflows CRUD, runs CRUD, JSON import/export
  │     • POST /api/runs → seeds Run + NodeRun rows, triggers root node tasks
  │
  └─ Clerk (auth, middleware-protected)

Trigger.dev (server)
  ├─ crop-image-node  (FFmpeg, wait.for(30s), output URL)   — one task per node invocation
  └─ gemini-node      (@google/genai, vision)               — one task per node invocation
        each task, on finish: writes output → decrements dependents' counters → triggers any that hit 0

PostgreSQL (Neon) via Prisma  — Workflow, Run, NodeRun (with pendingDeps counter)
```

**Core idea:** no single long-lived orchestrator. Each node is its own Trigger.dev task run; on completion it **atomically decrements a `pendingDeps` counter** on each downstream node and triggers the ones that reach 0. This is the only design that (a) keeps every node a real Trigger.dev task, (b) runs siblings concurrently, and (c) never blocks a fast branch on a slow one — all within v4's constraints.

---

## 2. Pages & routes

```
/sign-in, /sign-up        Clerk (catch-all). Only public routes.
/dashboard                List user workflows; create / open / rename / delete; empty state.
/workflow/[id]            The builder (canvas + bottom picker + history sidebar).
/  → redirect to /dashboard (or /sign-in if signed out).  No marketing page.
```
Clerk `middleware.ts` protects everything except `/sign-in`, `/sign-up`.

---

## 3. Data model (Prisma)

```prisma
model Workflow {
  id        String   @id @default(cuid())
  userId    String   // Clerk user id
  name      String   @default("Untitled workflow")
  graph     Json     // { nodes: RFNode[], edges: RFEdge[] }
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  runs      Run[]
  @@index([userId])
}

model Run {
  id           String    @id @default(cuid())
  workflowId   String
  userId       String
  scope        RunScope  // FULL | PARTIAL | SINGLE
  status       RunStatus // RUNNING | SUCCESS | FAILED | PARTIAL
  startedAt    DateTime  @default(now())
  finishedAt   DateTime?
  durationMs   Int?
  workflow     Workflow  @relation(fields: [workflowId], references: [id], onDelete: Cascade)
  nodeRuns     NodeRun[]
  @@index([workflowId])
}

model NodeRun {
  id           String     @id @default(cuid())
  runId        String
  nodeId       String     // React Flow node id
  type         String     // request-inputs | crop-image | gemini | response
  status       NodeStatus // PENDING | RUNNING | SUCCESS | FAILED | SKIPPED
  pendingDeps  Int        @default(0)   // # upstream executable deps not yet done — the scheduler counter
  triggerRunId String?    // Trigger.dev run id for this node task (for debugging / direct subscribe)
  inputs       Json?
  output       Json?
  error        String?
  startedAt    DateTime?
  finishedAt   DateTime?
  durationMs   Int?
  run          Run        @relation(fields: [runId], references: [id], onDelete: Cascade)
  @@unique([runId, nodeId])
  @@index([runId])
}

enum RunScope  { FULL PARTIAL SINGLE }
enum RunStatus { RUNNING SUCCESS FAILED PARTIAL }
enum NodeStatus{ PENDING RUNNING SUCCESS FAILED SKIPPED }
```

`@@unique([runId, nodeId])` lets the scheduler target a node row atomically. `pendingDeps` is the heart of the engine (§6).

---

## 4. Design system — measured from the live builder

> **Measured directly from the signed-in Magica canvas** (`magica.com/app/workflows/.../canvas`), not inferred. Reference screenshots saved in [`./reference/`](./reference/): `magica-workflow-canvas.jpeg` (populated DAG), `magica-add-node-picker.jpeg` (the `+` picker).

**⚠️ Correction vs v2:** the builder canvas is **LIGHT**, not dark. White node cards on a light grey **dot-grid** canvas. Handles and edges are **type-colored** (not pink/indigo). Primary font is **"Google Sans Flex"** (Inter fallback). The dark `--wf-*` / `--xy-*` variables present in Magica's CSS are *declared* design-system tokens but are **not** what the canvas actually renders — build to the measured values below.

```css
:root {
  --font-ui: "Google Sans Flex", Inter, system-ui, sans-serif;

  /* ---- Canvas (light) ---- */
  --canvas-bg: #f5f5f5;          /* light grey pane */
  --canvas-dot: #d4d4d8;         /* dot-grid dots (zinc-300-ish) */

  /* ---- Node card ---- */
  --node-bg: #ffffff;
  --node-border: #e5e7eb;        /* 0.8px solid (gray-200) */
  --node-radius: 12px;
  --node-shadow: 0 1px 3px rgba(0,0,0,.06), 0 1px 2px rgba(0,0,0,.04);
  --node-shadow-selected: 0 0 0 2px rgba(99,102,241,.5);
  --node-input-bg: #ffffff;
  --node-input-border: #e5e7eb;
  --text-primary: #1b1b18;       /* near-black */
  --text-secondary: #6b7280;     /* gray-500 */

  /* ---- Type-colored handles + edges (match source port type) ---- */
  --port-text:   #f59e0b;        /* amber  — text / prompt / system-prompt */
  --port-image:  #3b82f6;        /* blue   — image */
  --port-any:    #6366f1;        /* indigo — generic / multi */
  --port-number: #ec4899;        /* pink   — number / settings */
  --port-result: #22c55e;        /* green  — final result into Response */
  /* handle: ~10px circle, border-radius:50%, 1.6px border of same hue @50% alpha */

  /* ---- Accents / status ---- */
  --accent: #4f46e6;             /* indigo-600 — Run button, primary actions, active tab */
  --accent-90: rgba(79,70,229,.9);
  --required: #f87171;           /* red-400 — the "*" on required fields */
  --success: #22c55e; --warning: #f59e0b; --error: #ef4444;  /* history badges */

  /* ---- MiniMap (dark, even on light canvas) ---- */
  --minimap-bg: #18181b;         /* zinc-900 */ --minimap-radius: 8px;   /* 140×100 */

  /* ---- Scale ---- */
  --radius-pill: 9999px;         /* Run button + bottom toolbar are pills */
  --space-1:4px; --space-2:8px; --space-3:12px; --space-4:16px; --space-6:24px;
}
body { font-family: var(--font-ui); }
```

### Canvas chrome (measured layout)
- **Bottom-center toolbar** = a white rounded **pill** holding a document/duplicate icon + the **`+` "Add node"** button. This *is* the spec's "bottom-center floating toolbar" (no left node sidebar). ✅
- **`+` picker** = white rounded popover, **"Search nodes or models…"** field at top, then category sections each with an icon header: **IMAGE** (Generate Image, Edit Image, 3D) · **VIDEO** (Generate Video, Enhance Video, BG Remover) · **AUDIO** (Text to Speech, Music Generation, Sound Effects…) · **OTHERS** (Input, Utility, **LLM Call**). Each row has a trailing chevron `>` opening a **model submenu**. → *Crop Image* maps under **IMAGE → Edit Image** (or Utility); *Gemini/LLM* under **OTHERS → LLM Call**.
- **Top-right floating cluster:** indigo **Run/play** button + **`Est X M`** and **`Bal X M`** credit counters + a **history/clock** icon.
- **Bottom-right:** **"Show minimap"** toggle (map icon) → dark MiniMap.
- **MiniMap:** dark `#18181b`, 140×100, 8px radius.
- Workflow **name is editable inline** at top-left ("Untitled" placeholder).

### Node anatomy (all 4 share this shell)
- **Header:** small type icon + **model name** (e.g. "GPT 5.4") + **Run** button (indigo pill = single-node execution) + **`…` menu** (rename / delete / duplicate).
- **Mode tabs** where relevant: e.g. *Text to Image / Image to Image*, *Text to Video / Image to Video*.
- **Fields:** label + optional red **`*`** (required). **Connected inputs are disabled/greyed** (confirmed: a wired Prompt textarea renders `disabled`). Manual entry otherwise. A **`+`** next to an input adds/links a connection.
- **Collapsible "Settings"** (chevron) section for advanced params.
- **Output section** ("Response" / "Generated Images" / "Generated Video") showing **"No output yet"** until run; rendered inline.
- **Per-node cost** footer: `~ X M`.
- Each **input/output port** is a small colored dot on the card edge (color = port type above).

### Node-specific (from the reference DAG)
- **Request-Inputs** (pre-placed, `node_<ts>_request`): each field has a name (e.g. "Car prompt") with rename, **Copy value**, **Delete**, an "Enter text…" textarea, **Expand**, and a menu/`+` to **add fields**. Each field exposes its **own colored output handle**.
- **Response** (pre-placed, `node_<ts>_response`): a **`result`** collector listing named incoming outputs (e.g. `gpt_image_2`, `seedance_2_0`), each with **Rename / Disconnect** and "No output yet". Accepts **multiple** inputs.
- **LLM node** ("GPT 5.4" here → our **Gemini**): Prompt* / System Prompt / Image (Vision) / Settings / Response.
- **Image node** ("GPT Image 2" → our **Crop Image** equivalent surface): mode tabs + params + Generated output.
- Node id format: `node_<timestamp>_<suffix>`; pre-placed use `_request` / `_response`.

> **Spec vs reference conflict to decide:** the spec's deliverables say *"animated **purple** edges"*, but the live reference colors edges **by source port type** (amber/blue/green). Recommendation: default edges to **animated indigo `#6366f1`** to satisfy the explicit spec checklist, but keep **type-colored handles** (clearly in the reference). Easy to flip edge coloring to type-based if graders favor the reference.

---

## 5. Frontend structure

```
app/
  layout.tsx                  // <LinkedInLog/> (the mandatory console.log, once per page)
  middleware.ts               // Clerk: protect all except /sign-in,/sign-up
  sign-in/[[...rest]]/page.tsx
  sign-up/[[...rest]]/page.tsx
  dashboard/page.tsx
  workflow/[id]/page.tsx
  api/
    workflows/route.ts        // CRUD (Zod)
    workflows/[id]/route.ts
    runs/route.ts             // POST start run; GET list
    runs/[id]/route.ts        // GET expanded node-level detail
components/
  canvas/ (ReactFlowCanvas, BottomToolbar+Picker, MiniMap, AnimatedEdge)
  nodes/  (RequestInputsNode, CropImageNode, GeminiNode, ResponseNode)
  history/(HistorySidebar, RunRow, NodeRunDetail)
  dashboard/(WorkflowCard, CreateButton, RowActions)
lib/
  store.ts                    // Zustand
  dag.ts                      // buildDeps, hasCycle, topo helpers
  handles.ts                  // handle type map + isValidConnection
  schemas.ts                  // Zod
  gemini.ts                   // @google/genai wrapper
trigger/
  crop-image.ts, gemini.ts
  trigger.config.ts
prisma/schema.prisma
```

### Node UX rules
- **Request-Inputs** (local): `+` adds `text_field` (textarea) or `image_field` (Transloadit upload, preview, jpg/jpeg/png/webp/gif). Each field = its own output handle; renamable; `image_field_2`, etc.
- **Crop Image** (executable): Input Image (required) + X/Y/W/H % (0–100, default 0/0/100/100) → Output Image.
- **Gemini** (executable): model selector in header; Prompt (required), System Prompt, Image (Vision, multi-connect), Video, Audio, File, collapsed Settings; Response rendered inline.
- **Response** (local): single `result` input handle, no output.
- Every input accepts a **connection OR manual entry**; when connected, the manual field is **greyed out/disabled**.
- **Type-safe edges** via React Flow `isValidConnection` (image-out→image-in, text-out→text-in); invalid drag visually rejected. **DAG-only** (reject cycles).

---

## 6. Execution engine (event-driven dependency counter) — the core

### Why not the obvious approaches
- ❌ `Promise.all(nodes.map(n => n.triggerAndWait()))` — **unsupported in v4** (durable checkpoint can't be raced).
- ❌ `batchTriggerAndWait` per topological wave — **blocks the whole wave on its slowest sibling**, so Gemini#2 would wait on the 30s crops. Violates the spec.
- ✅ **Event-driven:** each finished node decrements a counter on its dependents and triggers any that reach 0. Exact required semantics, no barriers.

### Flow
**`POST /api/runs`** (server action):
1. Load + validate graph (DAG, types). Resolve target set (single / multi-select / full).
2. **Pre-resolve local nodes** (Request-Inputs field values) into a map.
3. Create `Run` + one `NodeRun` per target node. For each **executable** node set `pendingDeps = # of its upstream executable nodes in the target set`.
4. **Trigger every executable node with `pendingDeps === 0`**, tagged `wfrun:<runId>` and `node:<nodeId>`, passing its resolved static inputs.
5. Return `{ runId }` to the client → it subscribes for the glow (§7).

**Each node task** (`crop-image`, `gemini`):
```ts
export const geminiNode = task({
  id: "gemini-node",
  run: async (p: NodeTaskPayload) => {
    await nodeStart(p);                          // NodeRun → RUNNING, startedAt
    const inputs = await resolveInputs(p);       // static inputs + upstream outputs (from DB)
    const output = await runGemini(inputs);      // @google/genai
    await nodeFinish(p, output);                 // NodeRun → SUCCESS, output, durationMs
    await scheduleDependents(p.runId, p.nodeId); // fan out
    return output;
  },
  onFailure: async ({ payload }) => {            // v4: single-object param
    await skipDependents(payload.runId, payload.nodeId); // mark transitive dependents SKIPPED
    await maybeFinalizeRun(payload.runId);
  },
});
```

**The scheduler (atomic counter — the correctness crux):**
```ts
async function scheduleDependents(runId: string, nodeId: string) {
  for (const dep of downstreamOf(runId, nodeId)) {       // direct dependents in target set
    if (isLocal(dep.type)) {                              // Response: resolve inline, no task
      await resolveLocalNode(runId, dep.nodeId);
      continue;
    }
    // atomic decrement; Prisma update returns the NEW value → exactly one caller sees 0
    const updated = await prisma.nodeRun.update({
      where: { runId_nodeId: { runId, nodeId: dep.nodeId } },
      data: { pendingDeps: { decrement: 1 } },
    });
    if (updated.pendingDeps === 0) {
      await triggerNodeTask(runId, dep);                 // .trigger() fire-and-forget, tagged
    }
  }
  await maybeFinalizeRun(runId);
}
```

`prisma.nodeRun.update({ data: { pendingDeps: { decrement: 1 } } })` is a single atomic SQL `UPDATE ... SET pendingDeps = pendingDeps - 1 ... RETURNING`. When three upstreams of *Final Gemini* finish concurrently, each decrements; only the one that observes `0` triggers it. **No double-trigger, no missed trigger.**

**Crop task (the 30s rule):**
```ts
export const cropImageNode = task({
  id: "crop-image-node",
  run: async (p: NodeTaskPayload) => {
    await nodeStart(p);
    await wait.for({ seconds: 30 });             // MANDATORY durable wait (checkpointed, not billed)
    const url = await ffmpegCrop(await resolveInputs(p)); // FFmpeg via build extension
    await nodeFinish(p, { outputImage: url });
    await scheduleDependents(p.runId, p.nodeId);
    return { outputImage: url };
  },
});
```

**Finalize:** `maybeFinalizeRun` — if all NodeRuns are terminal, set `Run.status` (SUCCESS / FAILED / PARTIAL), `finishedAt`, `durationMs`.

### Maps to the spec's timing example
- Crop#1, Crop#2, Gemini#1 → `pendingDeps 0` → triggered at **T=0**, concurrent. ✅
- Gemini#2 (`pendingDeps 1`, only Gemini#1) → fires the instant Gemini#1 ends, **does not wait on crops**. ✅
- Final Gemini (`pendingDeps 3`) → fires only after both crops **and** Gemini#2. ✅

---

## 7. Verified library reference (copy-paste)

> Sources fetched 2026-06-20: trigger.dev/docs (v4), ai.google.dev. All imports below are current.

### Trigger.dev v4 (`@trigger.dev/sdk`)
- **Packages:** `@trigger.dev/sdk`, `@trigger.dev/build`, `@trigger.dev/react-hooks`. (v3's `@trigger.dev/sdk/v3` import path is deprecated — use bare `@trigger.dev/sdk`.)
- **Task:** `import { task } from "@trigger.dev/sdk"` → `task({ id, run: async (payload, { ctx }) => {...} })`.
- **Durable wait:** `import { wait } from "@trigger.dev/sdk"` → `await wait.for({ seconds: 30 })`.
- **Trigger from another task:** `await child.triggerAndWait(payload)` → returns `{ ok, output, error }`; `.unwrap()` returns output or throws. **Never `Promise.all` these.**
- **Fire-and-forget (used by our scheduler):** `await child.trigger(payload, { tags: ["wfrun:"+runId, "node:"+nodeId] })` → returns `{ id, publicAccessToken }`.
- **From a Next.js route/action (type-only import):** `import { tasks } from "@trigger.dev/sdk"; import type { geminiNode } from "@/trigger/gemini"` → `await tasks.trigger<typeof geminiNode>("gemini-node", payload)`.
- **`trigger.config.ts` + FFmpeg extension:**
  ```ts
  import { defineConfig } from "@trigger.dev/sdk";
  import { ffmpeg } from "@trigger.dev/build/extensions/core";
  export default defineConfig({
    project: "<project ref>",
    dirs: ["./trigger"],
    maxDuration: 120,                  // crop waits 30s+ — keep headroom
    build: { extensions: [ffmpeg()] }, // sets FFMPEG_PATH/FFPROBE_PATH
  });
  ```

### Realtime glow → React (`@trigger.dev/react-hooks`)
Each node task is triggered with tag `wfrun:<runId>`. Subscribe to all node runs for a workflow run by tag:
```tsx
"use client";
import { useRealtimeRunsWithTag } from "@trigger.dev/react-hooks";
// token minted server-side: auth.createPublicToken({ scopes: { read: { tags: ["wfrun:"+runId] } } })
export function useGlow(runId: string, token: string) {
  const { runs } = useRealtimeRunsWithTag(`wfrun:${runId}`, { accessToken: token });
  // map run.tags (node:<id>) + run.status → per-node glow state
  return runs;
}
```
- Mint the public token in the same server action that starts the run (`import { auth } from "@trigger.dev/sdk"`), scoped to the tag; pass `{ runId, token }` to the client.
- **Flag:** confirm the exact hook name (`useRealtimeRunsWithTag`) against your installed `@trigger.dev/react-hooks` version. **Fallback:** short-poll `GET /api/runs/[id]` (reads `NodeRun.status`) and drive the glow from that — simpler, always works.

### Gemini (`@google/genai`) — NOT the legacy SDK
- **Install:** `npm i @google/genai` (Node ≥ 20). Legacy `@google/generative-ai` is EOL (2025-11-30) — do not use.
- **Model ids:** label "Gemini 3.1 Pro" → `gemini-3.1-pro-preview` (Preview; tighter limits, may change) **or** GA `gemini-2.5-pro` (recommended default for stability). Map label→id in config so you can swap later.
- **Text:**
  ```ts
  import { GoogleGenAI } from "@google/genai";
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  const res = await ai.models.generateContent({
    model: process.env.GEMINI_MODEL ?? "gemini-2.5-pro",
    contents: prompt,
    config: { systemInstruction: systemPrompt },
  });
  const text = res.text;
  ```
- **Vision (multiple images, our handles supply URLs):** fetch each URL → base64 → `inlineData` part (keep total request < 20 MB; use Files API for big/many images):
  ```ts
  async function imagePart(url: string) {
    const buf = Buffer.from(await (await fetch(url)).arrayBuffer());
    return { inlineData: { mimeType: "image/jpeg", data: buf.toString("base64") } };
  }
  const res = await ai.models.generateContent({
    model: process.env.GEMINI_MODEL ?? "gemini-2.5-pro",
    contents: [ ...(await Promise.all(imageUrls.map(imagePart))), { text: prompt } ],
    config: { systemInstruction: systemPrompt },
  });
  ```
- **Free tier:** Google AI Studio key. 2.5-pro free tier ≈ 5 RPM / 100 RPD — fine for a demo; confirm 3.x limits in the AI Studio dashboard.

---

## 8. TypeScript contracts (write these first on Day 2)

```ts
// Handle/port type system — drives isValidConnection + greying
export type PortType = "text" | "image" | "video" | "audio" | "file" | "any";

export interface PortDef { id: string; label: string; type: PortType; required?: boolean; }

export type NodeKind = "request-inputs" | "crop-image" | "gemini" | "response";

// Per-node config persisted in the React Flow node.data
export interface RequestInputsData {
  kind: "request-inputs";
  fields: { id: string; name: string; type: "text_field" | "image_field"; value?: string }[];
}
export interface CropImageData {
  kind: "crop-image";
  x: number; y: number; w: number; h: number;            // 0..100, default 0/0/100/100
  inputImage?: string;                                    // manual URL if not connected
}
export interface GeminiData {
  kind: "gemini";
  model: string;                                          // mapped from label
  prompt?: string; systemPrompt?: string;                // manual values if not connected
  settings?: { temperature?: number; maxOutputTokens?: number };
}
export interface ResponseData { kind: "response"; result?: unknown; }

export type NodeData = RequestInputsData | CropImageData | GeminiData | ResponseData;

// What a node task receives
export interface NodeTaskPayload {
  runId: string;
  nodeId: string;
  kind: NodeKind;
  staticInputs: Record<string, unknown>;                 // manual field values
  upstream: { nodeId: string; targetPort: string }[];    // where to read connected inputs from
}

// Run start request (Zod-validated)
export interface StartRunRequest {
  workflowId: string;
  scope: "FULL" | "PARTIAL" | "SINGLE";
  targetNodeIds: string[];                               // [] = full
}
```
Add Zod schemas mirroring these in `lib/schemas.ts`; validate at every API boundary.

---

## 9. Connection type matrix (type-safe edges)

| Source output | Allowed target inputs |
|---|---|
| `text` (e.g. Gemini.Response, Request.text_field) | Gemini.Prompt, Gemini.System Prompt, Response.result |
| `image` (Request.image_field, Crop.Output Image) | Crop.Input Image, Gemini.Image (Vision), Response.result |
| Any | Response.result (collector accepts anything) |

`isValidConnection(conn)` looks up source/target `PortType` from `handles.ts` and returns `src === tgt || tgt === "any"`. Reject + visually flash on mismatch. Reject any edge that would create a cycle (`hasCycle` in `dag.ts`).

---

## 10. Environment & setup

```bash
npx create-next-app@latest nextflow --ts --tailwind --app --eslint
cd nextflow
npm i @clerk/nextjs @prisma/client @reactflow/core reactflow zustand zod \
      @google/genai lucide-react @trigger.dev/sdk @trigger.dev/react-hooks
npm i -D prisma @trigger.dev/build
npx prisma init               # set DATABASE_URL to Neon
npx trigger.dev@latest init   # creates trigger.config.ts, links project
```

`.env.local`:
```
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=
CLERK_SECRET_KEY=
DATABASE_URL=                 # Neon pooled connection string
GEMINI_API_KEY=               # Google AI Studio
GEMINI_MODEL=gemini-2.5-pro   # or gemini-3.1-pro-preview to match the "3.1 Pro" label
TRIGGER_SECRET_KEY=           # Trigger.dev
TRANSLOADIT_KEY=              # Transloadit auth key
TRANSLOADIT_TEMPLATE_ID=      # upload template (jpg/jpeg/png/webp/gif)
```

---

## 11. Day-by-day plan

### Day 1 — Foundation, design system, dashboard, canvas shell
- [ ] Scaffold (§10). Paste tokens (§4) into `globals.css`; wire Tailwind to the vars.
- [ ] Clerk + middleware; sign-in/up pages only. `<LinkedInLog/>` → mandatory `console.log`.
- [ ] Neon + Prisma; migrate `Workflow / Run / NodeRun`.
- [ ] Dashboard: list / create / open / rename / delete / empty state (Magica styling).
- [ ] Canvas renders React Flow: dark theme, **dot grid, MiniMap, pan/zoom/fit-view**, **Request-Inputs + Response pre-placed & undeletable**.
- [ ] Bottom-center **`+` picker** (searchable, categories) adding Crop Image + Gemini.
- [ ] **Sign in to Magica and inspect the real builder**; tighten node dimensions/picker details in §4.

### Day 2 — Nodes, connections, persistence, execution engine
- [ ] TS contracts (§8) + Zod schemas first.
- [ ] All 4 node UIs: handles, manual-vs-connected greying, model selector, inline Response.
- [ ] `isValidConnection` type matrix (§9) + cycle rejection + **animated indigo edges**; pink handles.
- [ ] Transloadit upload inside `image_field` (preview).
- [ ] Save/load graph (autosave dirty) + JSON **import/export**.
- [ ] Trigger.dev init; `crop-image-node` (`wait.for(30s)` + FFmpeg) and `gemini-node` (`@google/genai`).
- [ ] **`POST /api/runs`** seeding + the **event-driven scheduler** (§6); single / multi / full.

### Day 3 — Realtime, history, sample workflow, polish, deploy
- [ ] Realtime glow by tag (`useRealtimeRunsWithTag`) → pulsating CSS; siblings pulse together. Poll fallback ready.
- [ ] **History sidebar:** runs (timestamp, status, duration, scope, color badge) + expand → node-level (inputs/output/time/error).
- [ ] Undo/redo for node ops.
- [ ] **Pre-build the exact sample workflow** (2 crops + 3 chained Geminis → Response); verify timing matches §6.
- [ ] Pixel-polish vs Magica; empty/error states.
- [ ] Deploy **Vercel** + deploy Trigger.dev; end-to-end smoke test.
- [ ] Record 3–5 min demo video (every spec checklist item).

---

## 12. Risk register

| Risk | Mitigation |
|---|---|
| **Parallel semantics** (the graded crux) | Event-driven `pendingDeps` counter (§6), atomic Prisma decrement. **Not** `Promise.all`, **not** per-wave batch. Verify against the sample workflow timing. |
| Double/missed trigger on shared dependents | Atomic `{ decrement: 1 }` returning new value — exactly one observer sees 0. Unit-test with a fan-in node. |
| Realtime hook name/version mismatch | Confirm `useRealtimeRunsWithTag`; keep the `GET /api/runs/[id]` poll fallback wired. |
| Wrong Gemini SDK/model (spec is stale) | `@google/genai`; `GEMINI_MODEL` env; default GA `gemini-2.5-pro`, optional `gemini-3.1-pro-preview`. |
| FFmpeg in Trigger.dev env | `ffmpeg()` build extension; validate crop output URL early Day 2. |
| Forgetting `console.log` / 30s / undeletable nodes | On the Day 1–2 checklist; cheap but graded. |
| Pixel-perfect scope creep | Tokens in §4 + sign-in inspection; time-box polish to Day 3. |

---

## 13. Definition of done (maps to spec deliverables)

Auth (sign-in/up only) · Dashboard CRUD · Canvas with pre-placed Request-Inputs+Response · `+` picker adds Crop/Gemini · type-safe + DAG-validated **animated indigo** edges · Transloadit upload · all executions via Trigger.dev tasks · Crop ≥30s · pulsating glow (parallel siblings together) · selective execution (single/multi/full) · history sidebar with node-level expand (persisted) · undo/redo · MiniMap/dot grid/fit-view · JSON import/export · pre-built sample workflow · the LinkedIn `console.log` · TS strict · deployed on Vercel · 3–5 min demo video.
