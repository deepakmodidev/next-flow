"use client";

import type { Edge } from "@xyflow/react";
import type { AppNode } from "@/lib/nodeFactory";

/** Export/import workflows as JSON (README §"Workflow Features"). */

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
  const payload: WorkflowExport = { version: 1, name, nodes, edges };
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

export function parseWorkflowImport(text: string): WorkflowExport {
  const data = JSON.parse(text);
  if (!Array.isArray(data?.nodes) || !Array.isArray(data?.edges)) {
    throw new Error("Invalid workflow file: missing nodes/edges.");
  }
  return {
    version: 1,
    name: typeof data.name === "string" ? data.name : "Imported workflow",
    nodes: data.nodes as AppNode[],
    edges: data.edges as Edge[],
  };
}
