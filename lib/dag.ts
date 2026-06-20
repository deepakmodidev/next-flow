/**
 * DAG utilities for the workflow graph: cycle detection, dependency maps, and
 * topological ordering. Framework-agnostic — takes plain node/edge shapes.
 * See BUILD_PLAN.md §6.
 */

export interface GraphNode {
  id: string;
}
export interface GraphEdge {
  source: string;
  target: string;
}

/** Direct upstream dependencies (sources) for every node id. */
export function buildDeps(
  nodes: GraphNode[],
  edges: GraphEdge[],
): Map<string, string[]> {
  const deps = new Map<string, string[]>();
  for (const n of nodes) deps.set(n.id, []);
  for (const e of edges) {
    if (!deps.has(e.target)) deps.set(e.target, []);
    deps.get(e.target)!.push(e.source);
  }
  return deps;
}

/** Direct downstream dependents (targets) for every node id. */
export function buildDependents(
  nodes: GraphNode[],
  edges: GraphEdge[],
): Map<string, string[]> {
  const out = new Map<string, string[]>();
  for (const n of nodes) out.set(n.id, []);
  for (const e of edges) {
    if (!out.has(e.source)) out.set(e.source, []);
    out.get(e.source)!.push(e.target);
  }
  return out;
}

/**
 * Returns true if adding edge (source -> target) would create a cycle, i.e. if
 * `source` is already reachable from `target`. Use to reject invalid drags.
 */
export function wouldCreateCycle(
  edges: GraphEdge[],
  source: string,
  target: string,
): boolean {
  if (source === target) return true;
  const adj = new Map<string, string[]>();
  for (const e of edges) {
    if (!adj.has(e.source)) adj.set(e.source, []);
    adj.get(e.source)!.push(e.target);
  }
  // DFS from target; if we reach source, a cycle would form.
  const stack = [target];
  const seen = new Set<string>();
  while (stack.length) {
    const cur = stack.pop()!;
    if (cur === source) return true;
    if (seen.has(cur)) continue;
    seen.add(cur);
    for (const next of adj.get(cur) ?? []) stack.push(next);
  }
  return false;
}

/** True if the whole graph already contains a cycle. */
export function hasCycle(nodes: GraphNode[], edges: GraphEdge[]): boolean {
  const dependents = buildDependents(nodes, edges);
  const WHITE = 0,
    GRAY = 1,
    BLACK = 2;
  const color = new Map<string, number>();
  for (const n of nodes) color.set(n.id, WHITE);

  const visit = (id: string): boolean => {
    color.set(id, GRAY);
    for (const next of dependents.get(id) ?? []) {
      const c = color.get(next) ?? WHITE;
      if (c === GRAY) return true;
      if (c === WHITE && visit(next)) return true;
    }
    color.set(id, BLACK);
    return false;
  };

  for (const n of nodes) {
    if ((color.get(n.id) ?? WHITE) === WHITE && visit(n.id)) return true;
  }
  return false;
}

/**
 * Kahn topological order over the given node set. Throws on cycle.
 * Restricting to `targetIds` (when provided) supports partial runs.
 */
export function topoOrder(
  nodes: GraphNode[],
  edges: GraphEdge[],
  targetIds?: Set<string>,
): string[] {
  const inSet = (id: string) => !targetIds || targetIds.has(id);
  const ids = nodes.map((n) => n.id).filter(inSet);
  const relevant = edges.filter((e) => inSet(e.source) && inSet(e.target));

  const indegree = new Map<string, number>();
  for (const id of ids) indegree.set(id, 0);
  for (const e of relevant) indegree.set(e.target, (indegree.get(e.target) ?? 0) + 1);

  const dependents = new Map<string, string[]>();
  for (const e of relevant) {
    if (!dependents.has(e.source)) dependents.set(e.source, []);
    dependents.get(e.source)!.push(e.target);
  }

  const queue = ids.filter((id) => (indegree.get(id) ?? 0) === 0);
  const order: string[] = [];
  while (queue.length) {
    const id = queue.shift()!;
    order.push(id);
    for (const next of dependents.get(id) ?? []) {
      const d = (indegree.get(next) ?? 0) - 1;
      indegree.set(next, d);
      if (d === 0) queue.push(next);
    }
  }

  if (order.length !== ids.length) {
    throw new Error("Workflow graph contains a cycle; cannot topologically order.");
  }
  return order;
}
