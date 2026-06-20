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

export async function listWorkflows(): Promise<WorkflowMeta[]> {
  const res = await fetch("/api/workflows");
  if (!res.ok) return [];
  const data = await res.json();
  return data.workflows ?? [];
}

export async function getWorkflow(id: string): Promise<StoredWorkflow | null> {
  const res = await fetch(`/api/workflows/${id}`);
  if (!res.ok) return null;
  return (await res.json()) as StoredWorkflow;
}

export async function createWorkflow(
  name = "Untitled workflow",
): Promise<StoredWorkflow> {
  const res = await fetch("/api/workflows", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name }),
  });
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
  await fetch(`/api/workflows/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(name ? { graph: clean, name } : { graph: clean }),
  });
}

export async function renameWorkflow(id: string, name: string): Promise<void> {
  await fetch(`/api/workflows/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name }),
  });
}

export async function deleteWorkflow(id: string): Promise<void> {
  await fetch(`/api/workflows/${id}`, { method: "DELETE" });
}
