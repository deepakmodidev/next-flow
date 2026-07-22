"use client";

import type { Edge } from "@xyflow/react";
import type { AppNode } from "@/lib/nodeFactory";
import { hasCycle } from "@/lib/dag";

/** Export/import workflows as JSON (README §"Workflow Features"). */

const NODE_TYPES = ["request-inputs", "crop-image", "gemini", "response"];

export interface WorkflowExport {
  version: 1;
  name: string;
  nodes: AppNode[];
  edges: Edge[];
}

export function exportWorkflow(
  name: string,
  nodes: AppNode[],
  edges: Edge[],
): void {
  // Drop transient UI state, same as saveGraph. A serialized `selected` flag
  // comes back on import and silently turns the next Run into a partial run.
  const clean = nodes.map((n) => {
    const { selected, dragging, ...rest } = n as AppNode & {
      selected?: boolean;
      dragging?: boolean;
    };
    void selected;
    void dragging;
    return rest;
  });
  const payload: WorkflowExport = { version: 1, name, nodes: clean, edges };
  const blob = new Blob([JSON.stringify(payload, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${name.replace(/[^\w.-]+/g, "_") || "workflow"}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

/**
 * Validate before the graph reaches the canvas. Autosave writes an import to
 * the database 600ms later, so a malformed file corrupts the workflow for good
 * rather than just breaking the current view.
 */
export function parseWorkflowImport(text: string): WorkflowExport {
  const data = JSON.parse(text);
  if (!Array.isArray(data?.nodes) || !Array.isArray(data?.edges)) {
    throw new Error("Invalid workflow file: missing nodes/edges.");
  }

  const ids = new Set<string>();
  data.nodes.forEach((n: unknown, i: number) => {
    const node = n as Record<string, unknown> | null;
    if (!node || typeof node !== "object") throw new Error(`Invalid node ${i}.`);
    if (typeof node.id !== "string" || !node.id)
      throw new Error(`Invalid node ${i}: missing id.`);
    if (ids.has(node.id)) throw new Error(`Duplicate node id "${node.id}".`);
    ids.add(node.id);
    if (typeof node.type !== "string" || !NODE_TYPES.includes(node.type))
      throw new Error(`Invalid node ${i}: unknown type "${String(node.type)}".`);
    const pos = node.position as { x?: unknown; y?: unknown } | undefined;
    if (!pos || typeof pos.x !== "number" || typeof pos.y !== "number")
      throw new Error(`Invalid node ${i}: missing position.`);
    if (!node.data || typeof node.data !== "object")
      throw new Error(`Invalid node ${i}: missing data.`);
  });

  data.edges.forEach((e: unknown, i: number) => {
    const edge = e as Record<string, unknown> | null;
    if (!edge || typeof edge !== "object") throw new Error(`Invalid edge ${i}.`);
    if (typeof edge.id !== "string" || !edge.id)
      throw new Error(`Invalid edge ${i}: missing id.`);
    for (const end of ["source", "target"] as const) {
      const v = edge[end];
      if (typeof v !== "string" || !ids.has(v))
        throw new Error(`Invalid edge ${i}: ${end} "${String(v)}" is not a node.`);
    }
  });

  // The canvas rejects cycles on every drag; an imported graph skips that. A
  // cycle leaves every node with a pending dependency, so nothing is ever
  // triggered and the run is later mislabelled a worker timeout.
  if (hasCycle(data.nodes as AppNode[], data.edges as Edge[]))
    throw new Error("Invalid workflow file: the graph contains a cycle.");

  return {
    version: 1,
    name: typeof data.name === "string" ? data.name : "Imported workflow",
    nodes: data.nodes as AppNode[],
    edges: data.edges as Edge[],
  };
}
