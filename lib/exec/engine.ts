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
 * NOTE: authored against the verified Trigger.dev v4 / Prisma 7 APIs but not yet
 * run end-to-end — needs DATABASE_URL + TRIGGER_SECRET_KEY + a real FFmpeg/upload
 * implementation for Crop. Marked TODO where a live integration is required.
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

async function loadGraph(runId: string): Promise<{ graph: StoredGraph }> {
  const run = await prisma.run.findUniqueOrThrow({
    where: { id: runId },
    include: { workflow: true },
  });
  return { graph: run.workflow.graph as unknown as StoredGraph };
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
  const { graph } = await loadGraph(runId);
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
    const sourceRun = await prisma.nodeRun.findUnique({
      where: { runId_nodeId: { runId, nodeId: e.source } },
    });
    const out = (sourceRun?.output ?? {}) as Record<string, unknown>;
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

export async function onNodeFailure(
  runId: string,
  nodeId: string,
  error: unknown,
): Promise<void> {
  await prisma.nodeRun.update({
    where: { runId_nodeId: { runId, nodeId } },
    data: {
      status: "FAILED",
      error: error instanceof Error ? error.message : String(error),
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
        { tags: [`wfrun:${runId}`, `node:${depId}`] },
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

export async function maybeFinalizeRun(runId: string): Promise<void> {
  const rows = await prisma.nodeRun.findMany({ where: { runId } });
  const pending = rows.some(
    (r) => r.status === "PENDING" || r.status === "RUNNING",
  );
  if (pending) return;

  const anyFailed = rows.some((r) => r.status === "FAILED");
  const anySuccess = rows.some((r) => r.status === "SUCCESS");
  const status = anyFailed
    ? anySuccess
      ? "PARTIAL"
      : "FAILED"
    : "SUCCESS";

  const run = await prisma.run.findUniqueOrThrow({ where: { id: runId } });
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

  // Trigger executable roots; Response resolves later via scheduleDependents.
  for (const id of plan.roots) {
    const kind = (graph.nodes.find((n) => n.id === id)?.data?.kind ??
      "gemini") as NodeKind;
    await tasks.trigger(
      taskIdForKind(kind),
      { runId: run.id, nodeId: id, geminiApiKey },
      { tags: [`wfrun:${run.id}`, `node:${id}`] },
    );
  }

  // Fan out from the pre-resolved local sources.
  for (const id of plan.localSources)
    await scheduleDependents(run.id, id, geminiApiKey);

  return { runId: run.id };
}
