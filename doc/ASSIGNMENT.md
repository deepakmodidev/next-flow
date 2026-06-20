# [Web] Workflow Builder 2.0 — NextFlow

> Source: [Google Doc](https://docs.google.com/document/d/1mzzR0Jj-tLc7gT-F6h10IFCEiH9KI0iH36FXYnsuwqI/edit) (link-view only). Full content captured below.

---

## Project Overview

Build **NextFlow** — a pixel-perfect clone of the Galaxy.ai workflow builder, focused exclusively on LLM workflows. Use **React Flow** for the canvas, **Google Gemini** for LLM execution, and **Trigger.dev** for all node execution.

**Scope of pages — only these three. Nothing else.**

1. **Clerk Sign-In / Sign-Up** — auth entry point.
2. **Dashboard** — post-login landing page listing all of the signed-in user's workflows (name, last-edited timestamp, status). Supports create-new, open, rename, and delete.
3. **Workflow Canvas** — the main builder page (sidebar + canvas + history panel).

Do **not** build a marketing page, landing page, pricing page, or any other public-facing surface. Unauthenticated traffic should be redirected straight to Clerk.

---

## 🎯 Your Reference (We've Got You Covered)

So you're not guessing at any UI/UX detail:

- Sign up for a free account at **galaxy.ai**.
- Visit **try.galaxy.ai/clone** and click **Clone Workflow**.
- You'll get full access to the canvas, sidebar, node UI, history panel, and animations. You won't have credits to run it, but you can inspect every interaction and visual detail.

**Running workflow ref:** https://drive.google.com/file/d/14D2052n6b3IfMRHYxavDbOaRP0vj6FR8/view?usp=drive_link

This is the **source of truth** for the UI/UX. Match it pixel-perfect — do not deviate. Anything not explicitly listed in this document should mirror the Galaxy.ai reference exactly (spacing, fonts, colors, hover states, animations, scroll behavior, edge styling, MiniMap, dot grid, etc.).

---

## ⏱️ Timeline

**3 days.** Scope your work to ship a polished, working demo of the core flow — don't over-extend.

---

## 💫 A Note to Applicants

We're transforming the way people work with AI. Millions of creators and teams at the world's most ambitious companies already build with us — but we have much more work to do.

We obsess over talent to an unusual degree and are building a company that's a haven for self-motivated individual contributors.

We understand this is a significant time investment and it is deliberate by design. We're looking for people who enjoy building things like this, not people who see it as a chore.

And no, this is not a sneaky attempt to get free engineering work. We're perfectly capable of building our own tools. This is purely to see how you think, build, and ship.

So bring your A-game. This could be the beginning of a highly rewarding journey. We can't wait to see what you build.

---

## 📋 Functional Requirements

### Adding nodes — match Galaxy.ai exactly

Galaxy.ai does **not** have a left sidebar of node buttons. Instead:

- A new workflow canvas opens with two nodes already placed: **Request-Inputs** (top/left) and **Response** (right). The user cannot delete these.
- All other nodes are added via the **`+` button in the bottom-center floating toolbar**, which opens a searchable picker with categories (Recent, Image, Video, Audio, Others). For this trial only **Crop Image** and **Gemini 3.1 Pro** need to be functional — match the picker UI/UX of the live reference.

### The 4 node types

- **Request-Inputs** (pre-placed on canvas) — single node with a `+` to add configurable fields. Supported field types: `text_field` (textarea) and `image_field` (Transloadit upload, jpg/jpeg/png/webp/gif, with preview). Each field exposes its own output handle so it can be wired into downstream nodes. The user can rename fields and add as many as needed (e.g., `text_field`, `image_field`, `image_field_2`).
- **Crop Image** (added via `+` picker) — inputs: **Input Image** (required) + **X Position (%)**, **Y Position (%)**, **Width (%)**, **Height (%)** (0-100, defaults 0/0/100/100). FFmpeg via Trigger.dev. Output: **Output Image** (cropped image URL).
- **Gemini 3.1 Pro** (added via `+` picker — LLM) — model selector in node header. Inputs: **Prompt** (required), **System Prompt**, **Image (Vision)**, **Video**, **Audio**, **File**, plus a collapsed **Settings** section. Output: **Response** (text), rendered inline on the node.
- **Response** (pre-placed on canvas) — single result input handle. Collects the final workflow output for display/export. No output handle.

### ⚠️ MANDATORY: 30+ second artificial delay on Crop Image

The Crop Image Trigger.dev task **must await at least 30 seconds** before returning. This is a **hard requirement** — do not skip it.

### Authentication

- **Clerk** for everything. All workflow routes protected. Workflows + history scoped to the authenticated user.

### Dashboard Page

- Lists all workflows belonging to the signed-in user (name, last-edited timestamp, status badge if a run is in progress).
- **Create New Workflow** button → opens a blank canvas.
- Per-row actions: **Open, Rename, Delete**.
- Empty state when the user has no workflows yet.
- Match Galaxy.ai's dashboard styling (same sidebar, same card/list pattern).

### LLM Integration

- **Provider:** Google Gemini (`@google/generative-ai`). Free tier via Google AI Studio.
- **Execution:** All LLM calls run as **Trigger.dev tasks. No exceptions.**
- **Vision:** multimodal images supported (the Image (Vision) handle accepts multiple connections).
- **Models:** see Gemini models. Default to **Gemini 3.1 Pro** to match the reference.
- **Result display:** rendered inline on the Gemini node's Response section. The standalone Response node is a separate node type used to collect a final workflow result, not a substitute for inline LLM output.

### Workflow Features

- Add nodes via the bottom `+` picker (Crop Image, Gemini 3.1 Pro). Request-Inputs and Response are pre-placed and not deletable.
- Animated edges between handles.
- **Configurable inputs:** every parameter accepts either a connection OR manual entry. When a handle is connected, the manual field is greyed out / disabled.
- **Type-safe connections:** image outputs cannot connect to text inputs, etc. Invalid drags are visually rejected.
- **DAG-only:** cycles disallowed.
- **Delete:** menu button + Delete/Backspace keyboard (Request-Inputs and Response are exempt — they cannot be deleted).
- **Canvas:** pan, zoom, fit-view, MiniMap (bottom-right), dot grid background.
- **Undo/Redo** for node operations.
- **Selective execution:** run a single node, run a multi-select, or run the whole workflow. Each creates a history entry.
- **Parallel execution:** independent nodes trigger concurrently. A finished node fans out to its dependents immediately — it must never block on unrelated siblings at the same DAG level.
- **Pulsating glow** on every node currently executing.
- **Persistence:** workflows + history saved to PostgreSQL.
- **Export/Import** workflows as JSON.

### Workflow History (Right Sidebar)

- List of all runs with timestamp, status (success / failed / partial), duration, scope (full / partial / single).
- Color-coded badges (green / red / yellow).
- Click a run → expand to node-level details: per-node status, inputs used, output, execution time, error if failed.
- Persisted to PostgreSQL.

**Example expanded view:**

```
Run #123 — Apr 25, 2026 3:45 PM (Full Workflow)

├── Request-Inputs    ✅ 0.1s   → text_field, image_field
├── Crop Image #1     ✅ 31.8s  → https://cdn.transloadit.com/...
├── Crop Image #2     ✅ 32.1s  → https://cdn.transloadit.com/...
├── Gemini #1         ✅ 4.2s   → "Introducing our premium..."
├── Gemini #2         ✅ 3.9s   → "Silence the world. 30 hrs..."
├── Final Gemini      ✅ 4.5s   → "Hear what matters..."
└── Response          ✅ 0.1s   → final result captured
```

---

## 🏗️ Tech Stack (Required)

Next.js (App Router) · TypeScript (strict) · PostgreSQL (Neon) · Prisma · Clerk · React Flow · Trigger.dev · Transloadit · FFmpeg (via Trigger.dev) · Tailwind · Zustand · Zod · `@google/generative-ai` · Lucide React.

**Trigger.dev rule:** Every executable node (Gemini, Crop Image) runs as a Trigger.dev task. Request-Inputs and Response are local-only (no Trigger.dev task — they just resolve values and capture the final result). Independent tasks fire concurrently; each task only awaits its direct upstream dependencies. **On the initial client render of every page, also emit exactly one `console.log` in the format `[NextFlow] Candidate LinkedIn: <full-linkedin-profile-url>`** so we can attribute the build.

---

## 🎯 Required Sample Workflow

Pre-build this **exact** workflow in your submission.

> Reference screenshot — match this layout, node placement, and edge routing.

### Nodes

| # | Type | Notes |
|---|------|-------|
| 1 | **Request-Inputs** | Two fields: `text_field` = "Product: Wireless Bluetooth Headphones. Features: Noise cancellation, 30-hour battery, foldable design." and `image_field` = uploaded product photo |
| 2 | **Crop Image #1** | x=20, y=20, w=60, h=60 (tight product crop) |
| 3 | **Crop Image #2** | x=0, y=0, w=100, h=50 (wide banner crop) |
| 4 | **Gemini 3.1 Pro #1** | System Prompt: "You are a marketing copywriter. Write a one-paragraph product description." — Prompt ← Request-Inputs.text_field |
| 5 | **Gemini 3.1 Pro #2** | System Prompt: "Condense the following product description into a tweet-length hook (under 240 characters)." — Prompt ← Gemini #1.Response |
| 6 | **Gemini 3.1 Pro #3 (Final)** | System Prompt: "You are a social media manager. Combine the tweet hook and the two product crops into a final marketing post." — Prompt ← Gemini #2.Response, Image (Vision) ← Crop #1 + Crop #2 |
| 7 | **Response** | result ← Final Gemini.Response |

### Edges

- `Request-Inputs.image_field` → `Crop #1.Input Image`, `Crop #2.Input Image` (single source fans out)
- `Request-Inputs.text_field` → `Gemini #1.Prompt`
- `Gemini #1.Response` → `Gemini #2.Prompt`
- `Crop #1.Output Image`, `Crop #2.Output Image` → `Final Gemini.Image (Vision)`
- `Gemini #2.Response` → `Final Gemini.Prompt`
- `Final Gemini.Response` → `Response.result`

### Expected execution behavior

When the workflow runs:

- **Crop #1, Crop #2, and Gemini #1 all start at T=0** (same DAG level → concurrent fan-out).
- **Gemini #2 starts as soon as Gemini #1 finishes** — it must not wait for the Crop nodes.
- **Final Gemini only starts once all of its upstream dependencies** (both Crops + Gemini #2) have completed.
- Single-node and multi-select runs execute only the targeted nodes.

---

## 🧪 Deliverables

- Pixel-perfect clone of the Galaxy.ai workflow builder
- Clerk auth + protected routes (sign-in/up only — no marketing/home page)
- Dashboard page listing user's workflows (open / rename / delete / create-new)
- Canvas opens with Request-Inputs + Response pre-placed; Crop Image and Gemini 3.1 Pro added via the bottom `+` picker
- Right-sidebar workflow history with node-level expand
- React Flow canvas: dot grid, MiniMap, pan/zoom/fit-view, undo/redo
- All node executions via Trigger.dev tasks
- Crop Image: 30+ second artificial delay (mandatory)
- Pulsating glow on running nodes
- Parallel siblings pulsate simultaneously; first-to-finish proceeds without blocking on others
- Type-safe connections + connected-input greyed-out state + DAG validation
- Selective execution (single / multi-select / full)
- Pre-built sample workflow as specified above
- Gemini integration with vision
- Animated purple edges
- API routes with Zod validation
- PostgreSQL via Prisma; workflows + history persisted
- Workflow export/import as JSON
- TypeScript strict mode
- Deployed on Vercel

---

## 🔑 API Keys

- **Google AI:** Google AI Studio
- **Clerk:** clerk.com
- **Trigger.dev:** trigger.dev
- **Transloadit:** transloadit.com
- **PostgreSQL:** Neon

---

## 🚀 Submission

- **GitHub** — private repo, access granted to `bluerocketinfo@gmail.com`.
- **Vercel** — live demo URL.
- **Demo Video (3-5 min)** — must clearly show:
  - Auth flow
  - Dashboard page → create / open / rename / delete workflow
  - Building a workflow with all 4 node types (Request-Inputs, Crop Image, Gemini 3.1 Pro, Response)
  - Image upload via Transloadit (inside a Request-Inputs image_field)
  - Running the sample workflow end-to-end with the pulsating glow visible on every executing node
  - Single-node + multi-select runs
  - History panel with all run types + node-level expand
  - JSON export/import

---

## 📚 Resources

- **try.galaxy.ai/clone** — the reference workflow (clone this UI exactly)
- React Flow
- Trigger.dev · Realtime · Wait Patterns
- Clerk · Transloadit · Prisma
- Gemini API · Google AI Studio
- Zustand · Zod · FFmpeg
