import type { Edge } from "@xyflow/react";
import type { AppNode } from "@/lib/nodeFactory";
import { parseHandleId } from "@/lib/handles";
import type { NodeKind, NodeStatus, RunStatus } from "@/lib/contracts";

/**
 * Turns the Trigger.dev Realtime stream into canvas state.
 *
 * Realtime only carries the executable nodes (Crop / Gemini each run as a task).
 * Request-Inputs and Response are local, so their state is derived here from the
 * graph plus the streamed outputs — which is what lets the canvas run entirely
 * off the subscription with no status polling. Pure function, no I/O.
 */

/** One streamed task run, already keyed to the node it belongs to. */
export interface TaskRunState {
  status: NodeStatus;
  output?: unknown;
  error?: string | null;
  phase?: string;
}

export interface NodeRunState {
  status: string;
  output?: unknown;
  error?: string | null;
  phase?: string;
}

const FAILED_STATUSES = new Set([
  "FAILED",
  "CRASHED",
  "SYSTEM_FAILURE",
  "TIMED_OUT",
  "CANCELED",
  "EXPIRED",
]);

/**
 * Trigger.dev run status → our node status. Anything mid-flight reads RUNNING,
 * which includes WAITING — that's the crop node sitting in its mandatory delay.
 */
export function mapTriggerStatus(status: string): NodeStatus {
  if (status === "COMPLETED") return "SUCCESS";
  if (FAILED_STATUSES.has(status)) return "FAILED";
  return "RUNNING";
}

function kindOf(node: AppNode): NodeKind {
  return ((node.data as { kind?: NodeKind })?.kind ??
    (node.type as NodeKind)) as NodeKind;
}

function isTerminal(status: string): boolean {
  return status === "SUCCESS" || status === "FAILED" || status === "SKIPPED";
}

/** Value a downstream handle reads off an upstream node's output. */
function outputValue(state: NodeRunState | undefined, sourceHandle?: string | null) {
  const src = parseHandleId(sourceHandle);
  if (!src || !state?.output || typeof state.output !== "object") return undefined;
  return (state.output as Record<string, unknown>)[src.key];
}

export interface DerivedRun {
  nodeState: Record<string, NodeRunState>;
  done: boolean;
  status: RunStatus;
}

export function deriveRunState(
  allNodes: AppNode[],
  allEdges: Edge[],
  tasks: Record<string, TaskRunState>,
  /** Nodes actually in the run — empty means the whole graph (a FULL run). */
  runNodeIds: string[] = [],
): DerivedRun {
  // A SINGLE/PARTIAL run only covers its targets; the rest of the graph never
  // executes, so counting it would leave the run permanently unfinished.
  const inRun = new Set(runNodeIds);
  const nodes = inRun.size ? allNodes.filter((n) => inRun.has(n.id)) : allNodes;
  const edges = inRun.size
    ? allEdges.filter((e) => inRun.has(e.source) && inRun.has(e.target))
    : allEdges;
  const state: Record<string, NodeRunState> = {};

  for (const node of nodes) {
    const kind = kindOf(node);
    if (kind === "request-inputs") {
      // Pre-resolved by the engine before anything is triggered.
      const fields =
        ((node.data as { fields?: { id: string; value?: string }[] }).fields ??
          []);
      const output: Record<string, unknown> = {};
      for (const f of fields) output[f.id] = f.value ?? "";
      state[node.id] = { status: "SUCCESS", output };
    } else if (kind === "response") {
      state[node.id] = { status: "PENDING" };
    } else {
      state[node.id] = tasks[node.id] ?? { status: "PENDING" };
    }
  }

  // A failed node's dependents never get triggered, so they never appear in the
  // stream — mark them SKIPPED the same way the engine does server-side.
  const queue = nodes
    .filter((n) => state[n.id].status === "FAILED")
    .map((n) => n.id);
  const seen = new Set(queue);
  while (queue.length) {
    const id = queue.shift()!;
    for (const e of edges.filter((e) => e.source === id)) {
      if (state[e.target]?.status !== "PENDING") continue;
      state[e.target] = { status: "SKIPPED" };
      if (!seen.has(e.target)) {
        seen.add(e.target);
        queue.push(e.target);
      }
    }
  }

  // Response collects from every edge into it, once all of them have landed.
  for (const node of nodes) {
    if (kindOf(node) !== "response") continue;
    if (state[node.id].status !== "PENDING") continue;
    // Judge against ALL its edges, not just the in-run ones. On a scoped run an
    // upstream may sit outside the run, and collecting without it would show a
    // partial result that disagrees with what the server records.
    const incoming = allEdges.filter((e) => e.target === node.id);
    if (incoming.some((e) => !state[e.source])) {
      delete state[node.id]; // leave its previous result on the canvas
      continue;
    }
    if (!incoming.every((e) => state[e.source]?.status === "SUCCESS")) continue;
    const values = incoming
      .map((e) => outputValue(state[e.source], e.sourceHandle))
      .filter((v) => v !== undefined);
    state[node.id] = {
      status: "SUCCESS",
      output: { result: values.length === 1 ? values[0] : values },
    };
  }

  const all = Object.values(state);
  const done = all.every((s) => isTerminal(s.status));
  const anyFailed = all.some((s) => s.status === "FAILED");
  const anySuccess = nodes.some(
    (n) => kindOf(n) !== "request-inputs" && state[n.id]?.status === "SUCCESS",
  );
  const status: RunStatus = !done
    ? "RUNNING"
    : anyFailed
      ? anySuccess
        ? "PARTIAL"
        : "FAILED"
      : "SUCCESS";

  return { nodeState: state, done, status };
}
