import { tasks } from "@trigger.dev/sdk";
import { prisma } from "@/lib/db";
import { parseHandleId } from "@/lib/handles";
import { isLocalKind, type NodeKind, type RunScope } from "@/lib/contracts";
import { planRun } from "@/lib/exec/plan";

/**
 * Event-driven dependency-counter execution engine (BUILD_PLAN.md §6).
 *
 * No long-lived orchestrator: each node task, on completion, atomically
 * decrements `pendingDeps` on its dependents and triggers any that reach 0.
 * This satisfies the spec's "never block on unrelated siblings" rule within
 * Trigger.dev v4's constraints (no Promise.all around triggerAndWait).
 *
 * Crop (real FFmpeg + Transloadit upload) and Gemini (real @google/genai) are
 * fully implemented. Running the engine requires DATABASE_URL, GEMINI_API_KEY,
 * NEXT_PUBLIC_TRANSLOADIT_KEY, and a running/deployed `trigger.dev` worker.
 */

// ---- Graph shape stored in Workflow.graph (React Flow JSON) ----
interface GNode {
  id: string;
  type?: string;
  data: Record<string, unknown> & { kind?: NodeKind };
}
interface GEdge {
  source: string;
  target: string;
  sourceHandle?: string | null;
  targetHandle?: string | null;
}
interface StoredGraph {
  nodes: GNode[];
  edges: GEdge[];
}

function taskIdForKind(kind: NodeKind): string {
  return kind === "crop-image" ? "crop-image-node" : "gemini-node";
}

async function loadGraph(
  runId: string,
): Promise<{ graph: StoredGraph; workflowId: string }> {
  const run = await prisma.run.findUniqueOrThrow({
    where: { id: runId },
    include: { workflow: true },
  });
  return {
    graph: run.workflow.graph as unknown as StoredGraph,
    workflowId: run.workflowId,
  };
}

/** Whether a node is part of this run (a NodeRun row was created for it). */
async function inRun(runId: string, nodeId: string): Promise<boolean> {
  const row = await prisma.nodeRun.findUnique({
    where: { runId_nodeId: { runId, nodeId } },
  });
  return !!row;
}

// ---- Input resolution -------------------------------------------------------

/**
 * Resolve a node's inputs keyed by target-handle key, merging connected upstream
 * outputs (which win) over the node's manual/static field values.
 */
export async function resolveNodeInputs(
  runId: string,
  nodeId: string,
): Promise<Record<string, unknown>> {
  const { graph, workflowId } = await loadGraph(runId);
  const node = graph.nodes.find((n) => n.id === nodeId);
  const inputs: Record<string, unknown> = {};

  // 1. static values from node.data
  const data = node?.data ?? {};
  if (data.kind === "crop-image") {
    if (data.inputImage) inputs.inputImage = data.inputImage;
    inputs.x = data.x ?? 0;
    inputs.y = data.y ?? 0;
    inputs.w = data.w ?? 100;
    inputs.h = data.h ?? 100;
  }
  if (data.kind === "gemini") {
    if (data.model) inputs.model = data.model;
    if (data.prompt) inputs.prompt = data.prompt;
    if (data.systemPrompt) inputs.systemPrompt = data.systemPrompt;
    if (data.settings) inputs.settings = data.settings;
  }

  // 2. connected upstream outputs (override static)
  const incoming = graph.edges.filter((e) => e.target === nodeId);
  const byTargetKey = new Map<string, unknown[]>();
  for (const e of incoming) {
    const tgt = parseHandleId(e.targetHandle);
    const src = parseHandleId(e.sourceHandle);
    if (!tgt) continue;
    const srcNode = graph.nodes.find((n) => n.id === e.source);
    let out: Record<string, unknown>;
    if (srcNode?.data?.kind === "request-inputs") {
      // Request-Inputs source: always derive from the LIVE graph field values
      // so an edited input WINS over any cached prior-run output. (A stale
      // cached value would otherwise shadow the field the user just changed,
      // and it also lets a single/partial run work straight from the graph —
      // no prior full run required to have cached it.)
      const fields =
        (srcNode.data.fields as { id: string; value?: string }[]) ?? [];
      out = {};
      for (const f of fields) out[f.id] = f.value ?? "";
    } else {
      // Prefer the source's output from THIS run. If the source isn't part of
      // this run (single-node or partial run that excludes the upstream node),
      // fall back to its most recent successful output on this workflow — so a
      // single node runs against the latest cached upstream values instead of
      // failing on a missing connected input.
      let sourceRun = await prisma.nodeRun.findUnique({
        where: { runId_nodeId: { runId, nodeId: e.source } },
      });
      if (!sourceRun) {
        sourceRun = await prisma.nodeRun.findFirst({
          where: { nodeId: e.source, status: "SUCCESS", run: { workflowId } },
          orderBy: { finishedAt: "desc" },
        });
      }
      out = (sourceRun?.output ?? {}) as Record<string, unknown>;
    }
    const value = src ? out[src.key] : undefined;
    if (value === undefined) continue;
    const arr = byTargetKey.get(tgt.key) ?? [];
    arr.push(value);
    byTargetKey.set(tgt.key, arr);
  }
  for (const [key, values] of byTargetKey) {
    inputs[key] = values.length === 1 ? values[0] : values;
  }

  return inputs;
}

// ---- Node lifecycle ---------------------------------------------------------

/**
 * Idempotency guard for retryable task bodies. Returns the stored output if
 * this NodeRun already reached SUCCESS, else null. Trigger.dev retries run the
 * whole task body, so a transient throw AFTER onNodeSuccess would otherwise
 * re-run the expensive work and re-trigger dependents; callers short-circuit on
 * a non-null result to make retry-after-success a no-op.
 */
export async function alreadySucceeded(
  runId: string,
  nodeId: string,
): Promise<{ output: unknown } | null> {
  const row = await prisma.nodeRun.findUnique({
    where: { runId_nodeId: { runId, nodeId } },
  });
  return row?.status === "SUCCESS" ? { output: row.output } : null;
}

export async function onNodeStart(runId: string, nodeId: string): Promise<void> {
  await prisma.nodeRun.update({
    where: { runId_nodeId: { runId, nodeId } },
    data: { status: "RUNNING", startedAt: new Date() },
  });
}

/**
 * Persist the resolved inputs a node actually ran with, so the history sidebar
 * can show "inputs used". Called right after resolveNodeInputs (before the work
 * runs) so the inputs are recorded even if the node then fails.
 */
export async function recordNodeInputs(
  runId: string,
  nodeId: string,
  inputs: Record<string, unknown>,
): Promise<void> {
  await prisma.nodeRun.update({
    where: { runId_nodeId: { runId, nodeId } },
    data: { inputs: inputs as object },
  });
}

export async function onNodeSuccess(
  runId: string,
  nodeId: string,
  output: unknown,
): Promise<void> {
  const row = await prisma.nodeRun.findUniqueOrThrow({
    where: { runId_nodeId: { runId, nodeId } },
  });
  const startedAt = row.startedAt ?? new Date();
  await prisma.nodeRun.update({
    where: { runId_nodeId: { runId, nodeId } },
    data: {
      status: "SUCCESS",
      output: output as object,
      finishedAt: new Date(),
      durationMs: Date.now() - startedAt.getTime(),
    },
  });
}

/**
 * Pull the RAW message out of whatever a failed node throws, so the UI shows
 * the real cause (Gemini/FFmpeg/Trigger.dev) instead of a generic
 * "[object Object]". Handles Error, Trigger.dev's serialized `{ message }`
 * shape, and falls back to JSON for anything else.
 */
function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (error && typeof error === "object") {
    const msg = (error as { message?: unknown }).message;
    if (typeof msg === "string" && msg.trim()) return msg;
    try {
      return JSON.stringify(error);
    } catch {
      /* fall through to String() */
    }
  }
  return String(error);
}

export async function onNodeFailure(
  runId: string,
  nodeId: string,
  error: unknown,
): Promise<void> {
  await prisma.nodeRun.update({
    where: { runId_nodeId: { runId, nodeId } },
    data: {
      status: "FAILED",
      error: errorMessage(error),
      finishedAt: new Date(),
    },
  });
  await skipDependents(runId, nodeId);
}

// ---- Scheduling (the dependency counter) ------------------------------------

/**
 * After `nodeId` completes: resolve local dependents inline, and for executable
 * dependents atomically decrement `pendingDeps`, triggering any that reach 0.
 */
export async function scheduleDependents(
  runId: string,
  nodeId: string,
  geminiApiKey?: string,
): Promise<void> {
  const { graph } = await loadGraph(runId);
  const dependents = [
    ...new Set(
      graph.edges.filter((e) => e.source === nodeId).map((e) => e.target),
    ),
  ];

  for (const depId of dependents) {
    if (!(await inRun(runId, depId))) continue;
    const depNode = graph.nodes.find((n) => n.id === depId);
    const kind = (depNode?.data?.kind ?? "gemini") as NodeKind;

    if (isLocalKind(kind)) {
      // Response (local): collect inputs, mark done.
      const inputs = await resolveNodeInputs(runId, depId);
      await prisma.nodeRun.update({
        where: { runId_nodeId: { runId, nodeId: depId } },
        data: {
          status: "SUCCESS",
          inputs: inputs as object,
          output: { result: inputs.result ?? inputs } as object,
          finishedAt: new Date(),
        },
      });
      continue;
    }

    const updated = await prisma.nodeRun.update({
      where: { runId_nodeId: { runId, nodeId: depId } },
      data: { pendingDeps: { decrement: 1 } },
    });
    if (updated.pendingDeps <= 0) {
      await tasks.trigger(
        taskIdForKind(kind),
        { runId, nodeId: depId, geminiApiKey },
        {
          tags: [`wfrun:${runId}`, `node:${depId}`],
          // Dedupe: if a sibling's task body replays on retry it could decrement
          // and re-trigger this dependent twice — the key makes the 2nd a no-op.
          idempotencyKey: `${runId}:${depId}`,
        },
      );
    }
  }

  await maybeFinalizeRun(runId);
}

/** Mark all not-yet-started dependents (transitively) as SKIPPED on failure. */
async function skipDependents(runId: string, nodeId: string): Promise<void> {
  const { graph } = await loadGraph(runId);
  const queue = graph.edges
    .filter((e) => e.source === nodeId)
    .map((e) => e.target);
  const seen = new Set<string>();
  while (queue.length) {
    const id = queue.shift()!;
    if (seen.has(id)) continue;
    seen.add(id);
    const row = await prisma.nodeRun.findUnique({
      where: { runId_nodeId: { runId, nodeId: id } },
    });
    if (row && row.status === "PENDING") {
      await prisma.nodeRun.update({
        where: { runId_nodeId: { runId, nodeId: id } },
        data: { status: "SKIPPED", finishedAt: new Date() },
      });
    }
    for (const e of graph.edges.filter((e) => e.source === id))
      queue.push(e.target);
  }
}

// ---- Watchdog --------------------------------------------------------------

/**
 * A run is "stale" if it's still RUNNING but nothing has progressed for longer
 * than a node could legitimately take. Each node task is capped at maxDuration
 * (120s) and writes to the DB on start AND on finish/fail, so a live worker
 * always produces a DB write within that window. No write for STUCK_MS ⇒ the
 * worker died or was never reachable (the exact "nodes never started, no error,
 * no timeout" failure from the review). We detect it lazily at read time so it
 * works even when no worker is running to enforce a timeout itself.
 */
const STUCK_MS = 180_000; // > task maxDuration (120s) + comfortable buffer

type StaleRun = {
  status: string;
  startedAt: Date;
  nodeRuns: { startedAt: Date | null; finishedAt: Date | null }[];
};

export function runIsStale(run: StaleRun): boolean {
  if (run.status !== "RUNNING") return false;
  let last = run.startedAt.getTime();
  for (const n of run.nodeRuns) {
    if (n.startedAt) last = Math.max(last, n.startedAt.getTime());
    if (n.finishedAt) last = Math.max(last, n.finishedAt.getTime());
  }
  return Date.now() - last > STUCK_MS;
}

const TIMEOUT_MSG =
  "Execution timed out — the task worker became unavailable. Re-run once the worker is online.";

/** Force a stuck run to a terminal FAILED state with a clear per-node reason. */
export async function failStaleRun(runId: string): Promise<void> {
  await prisma.nodeRun.updateMany({
    where: { runId, status: { in: ["PENDING", "RUNNING"] } },
    data: { status: "FAILED", error: TIMEOUT_MSG, finishedAt: new Date() },
  });
  const run = await prisma.run.findUnique({ where: { id: runId } });
  if (!run || run.status !== "RUNNING") return;
  await prisma.run.update({
    where: { id: runId },
    data: {
      status: "FAILED",
      finishedAt: new Date(),
      durationMs: Date.now() - run.startedAt.getTime(),
    },
  });
}

export async function maybeFinalizeRun(runId: string): Promise<void> {
  const rows = await prisma.nodeRun.findMany({ where: { runId } });
  const pending = rows.some(
    (r) => r.status === "PENDING" || r.status === "RUNNING",
  );
  if (pending) return;

  const anyFailed = rows.some((r) => r.status === "FAILED");
  // Exclude pre-resolved Request-Inputs rows — they aren't real work, so an
  // all-failed run reports FAILED instead of PARTIAL.
  const anySuccess = rows.some(
    (r) => r.status === "SUCCESS" && r.type !== "request-inputs",
  );
  const status = anyFailed
    ? anySuccess
      ? "PARTIAL"
      : "FAILED"
    : "SUCCESS";

  const run = await prisma.run.findUniqueOrThrow({ where: { id: runId } });
  if (run.status !== "RUNNING") return; // already terminal (e.g. failed by the watchdog)
  await prisma.run.update({
    where: { id: runId },
    data: {
      status,
      finishedAt: new Date(),
      durationMs: Date.now() - run.startedAt.getTime(),
    },
  });
}

// ---- Run starter ------------------------------------------------------------

export async function startRun(
  workflowId: string,
  scope: RunScope,
  targetNodeIds: string[],
  geminiApiKey?: string,
): Promise<{ runId: string }> {
  const workflow = await prisma.workflow.findUniqueOrThrow({
    where: { id: workflowId },
  });
  const graph = workflow.graph as unknown as StoredGraph;
  const plan = planRun(graph, scope, targetNodeIds);

  const run = await prisma.run.create({
    data: { workflowId, userId: workflow.userId, scope, status: "RUNNING" },
  });

  // Pre-resolve local source nodes (Request-Inputs) to SUCCESS with their values.
  for (const id of plan.localSources) {
    const node = graph.nodes.find((n) => n.id === id);
    const fields =
      (node?.data?.fields as { id: string; value?: string }[]) ?? [];
    const output: Record<string, unknown> = {};
    for (const f of fields) output[f.id] = f.value ?? "";
    await prisma.nodeRun.create({
      data: {
        runId: run.id,
        nodeId: id,
        type: "request-inputs",
        status: "SUCCESS",
        output: output as object,
        finishedAt: new Date(),
      },
    });
  }

  // Create PENDING rows for executable + local-sink (Response) nodes.
  for (const row of plan.rows) {
    await prisma.nodeRun.create({
      data: {
        runId: run.id,
        nodeId: row.id,
        type: row.kind,
        status: "PENDING",
        pendingDeps: row.pendingDeps,
      },
    });
  }

  // Resolve local sinks with no in-run upstream up front — nothing else ever
  // triggers them, so they'd otherwise hang the run until the watchdog.
  for (const row of plan.rows) {
    if (isLocalKind(row.kind) && row.pendingDeps === 0) {
      const inputs = await resolveNodeInputs(run.id, row.id);
      await prisma.nodeRun.update({
        where: { runId_nodeId: { runId: run.id, nodeId: row.id } },
        data: {
          status: "SUCCESS",
          inputs: inputs as object,
          output: { result: inputs.result ?? inputs } as object,
          finishedAt: new Date(),
        },
      });
    }
  }

  // Trigger executable roots; Response resolves later via scheduleDependents.
  for (const id of plan.roots) {
    const kind = (graph.nodes.find((n) => n.id === id)?.data?.kind ??
      "gemini") as NodeKind;
    await tasks.trigger(
      taskIdForKind(kind),
      { runId: run.id, nodeId: id, geminiApiKey },
      {
        tags: [`wfrun:${run.id}`, `node:${id}`],
        idempotencyKey: `${run.id}:${id}`,
      },
    );
  }

  // Fan out from the pre-resolved local sources.
  for (const id of plan.localSources)
    await scheduleDependents(run.id, id, geminiApiKey);

  // Safety net for runs with no local-source fan-out (e.g. a lone Response);
  // triggered roots are still PENDING, so this won't finalize prematurely.
  await maybeFinalizeRun(run.id);

  return { runId: run.id };
}
