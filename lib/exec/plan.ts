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

    // count upstream EXECUTABLE deps that are also in the run set
    const pendingDeps = graph.edges.filter(
      (e) =>
        e.target === id &&
        targetSet.has(e.source) &&
        !isLocalKind(kindOf(e.source)),
    ).length;

    rows.push({ id, kind, pendingDeps });

    // a real task root: executable (not a local sink) with no executable upstream
    if (pendingDeps === 0 && !isLocalKind(kind)) roots.push(id);
  }

  return { localSources, rows, roots };
}
