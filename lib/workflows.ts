"use client";

import type { Edge } from "@xyflow/react";
import type { AppNode } from "@/lib/nodeFactory";

/**
 * Workflow persistence — backed by the Prisma/Neon API (auth-scoped via Clerk).
 * See app/api/workflows. All calls are async.
 */

export interface WorkflowGraph {
  nodes: AppNode[];
  edges: Edge[];
}
export interface WorkflowMeta {
  id: string;
  name: string;
  updatedAt: number;
}
export interface StoredWorkflow extends WorkflowMeta {
  graph: WorkflowGraph;
}

export async function createWorkflow(
  name = "Untitled workflow",
): Promise<StoredWorkflow> {
  const res = await fetch("/api/workflows", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name }),
  });
  if (!res.ok) throw new Error(`Create failed (${res.status})`);
  return (await res.json()) as StoredWorkflow;
}

export async function createWorkflowFromGraph(
  name: string,
  graph: WorkflowGraph,
): Promise<StoredWorkflow> {
  const res = await fetch("/api/workflows", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, graph }),
  });
  if (!res.ok) throw new Error(`Create failed (${res.status})`);
  return (await res.json()) as StoredWorkflow;
}

export async function saveGraph(
  id: string,
  graph: WorkflowGraph,
  name?: string,
): Promise<void> {
  // Never persist transient UI state (selection / drag flags).
  const nodes = graph.nodes.map((n) => {
    const { selected, dragging, ...rest } = n as AppNode & {
      selected?: boolean;
      dragging?: boolean;
    };
    void selected;
    void dragging;
    return rest;
  });
  const clean = { nodes, edges: graph.edges };
  const res = await fetch(`/api/workflows/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(name ? { graph: clean, name } : { graph: clean }),
  });
  // Don't let a failed save resolve silently — the caller marks it saved.
  if (!res.ok) throw new Error(`Save failed (${res.status})`);
}

export async function renameWorkflow(id: string, name: string): Promise<void> {
  const res = await fetch(`/api/workflows/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name }),
  });
  // Don't swallow the failure — a silent no-op looks like "rename doesn't work".
  if (!res.ok) throw new Error(`Rename failed (${res.status})`);
}

export async function deleteWorkflow(id: string): Promise<void> {
  const res = await fetch(`/api/workflows/${id}`, { method: "DELETE" });
  if (!res.ok) throw new Error(`Delete failed (${res.status})`);
}
