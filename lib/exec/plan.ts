import { isLocalKind, type NodeKind, type RunScope } from "@/lib/contracts";

/**
 * Pure run-planning: given a workflow graph + scope, compute which nodes run,
 * their dependency counters, and the roots to trigger first. This is the heart
 * of the parallel-DAG semantics (BUILD_PLAN.md §6) and is kept side-effect-free
 * so it can be unit-tested without a DB or Trigger.dev.
 */

export interface PlanNode {
  id: string;
  data?: { kind?: NodeKind } & Record<string, unknown>;
}
export interface PlanEdge {
  source: string;
  target: string;
}
export interface PlanGraph {
  nodes: PlanNode[];
  edges: PlanEdge[];
}

export interface PlanRow {
  id: string;
  kind: NodeKind;
  /** # of upstream EXECUTABLE deps in the run set not yet done. */
  pendingDeps: number;
}

export interface ExecPlan {
  /** Local source nodes (Request-Inputs) — pre-resolved to SUCCESS up front. */
  localSources: string[];
  /** Executable + local-sink (Response) nodes to create as PENDING rows. */
  rows: PlanRow[];
  /** Executable nodes with no executable upstream — triggered at T=0. */
  roots: string[];
}

export function planRun(
  graph: PlanGraph,
  scope: RunScope,
  targetNodeIds: string[],
): ExecPlan {
  const allIds = graph.nodes.map((n) => n.id);
  const targetSet = new Set(
    scope === "FULL" || targetNodeIds.length === 0 ? allIds : targetNodeIds,
  );
  const kindOf = (id: string): NodeKind =>
    (graph.nodes.find((n) => n.id === id)?.data?.kind ?? "gemini") as NodeKind;

  const localSources: string[] = [];
  const rows: PlanRow[] = [];
  const roots: string[] = [];

  for (const id of targetSet) {
    const kind = kindOf(id);

    if (kind === "request-inputs") {
      localSources.push(id);
      continue;
    }

    // Count DISTINCT upstream deps in the run set — including local sources.
    // The local source's completion (via scheduleDependents) is what releases
    // this node, so it must be counted; otherwise the node is also triggered as
    // a "root" AND decremented by the local fan-out → double-trigger.
    const pendingDeps = new Set(
      graph.edges
        .filter((e) => e.target === id && targetSet.has(e.source))
        .map((e) => e.source),
    ).size;

    rows.push({ id, kind, pendingDeps });

    // A true task root: executable node with NO upstream at all in the set.
    if (pendingDeps === 0 && !isLocalKind(kind)) roots.push(id);
  }

  return { localSources, rows, roots };
}
