import { create } from "zustand";
import {
  addEdge,
  applyEdgeChanges,
  applyNodeChanges,
  reconnectEdge,
  type Connection,
  type Edge,
  type EdgeChange,
  type NodeChange,
} from "@xyflow/react";
import { parseHandleId, isTypeCompatible, EDGE_COLOR } from "@/lib/handles";
import { wouldCreateCycle } from "@/lib/dag";
import { seedNodes, type AppNode } from "@/lib/nodeFactory";
import { saveGraph } from "@/lib/workflows";
import { getLocalGeminiKey } from "@/lib/geminiKey";
import type { RequestInputsData, RunScope } from "@/lib/contracts";

interface Snapshot {
  nodes: AppNode[];
  edges: Edge[];
}

export interface NodeRunState {
  status: string;
  output?: unknown;
  error?: string | null;
}

interface WorkflowState {
  nodes: AppNode[];
  edges: Edge[];
  name: string;
  dirty: boolean;
  past: Snapshot[];
  future: Snapshot[];
  // live execution state (driven by polling the active run)
  workflowId: string | null;
  currentRunId: string | null;
  runActive: boolean;
  nodeState: Record<string, NodeRunState>;

  // React Flow handlers
  onNodesChange: (changes: NodeChange[]) => void;
  onEdgesChange: (changes: EdgeChange[]) => void;
  onConnect: (conn: Connection) => void;
  onReconnect: (oldEdge: Edge, conn: Connection) => void;
  removeEdge: (id: string) => void;
  isValidConnection: (conn: Connection | Edge) => boolean;

  // mutations
  hydrate: (
    workflowId: string,
    nodes: AppNode[],
    edges: Edge[],
    name: string,
  ) => void;
  setGraph: (nodes: AppNode[], edges: Edge[], name?: string) => void;
  setName: (name: string) => void;
  setCurrentRunId: (id: string | null) => void;
  setNodeState: (state: Record<string, NodeRunState>) => void;
  setWorkflowId: (id: string) => void;
  setRunActive: (active: boolean) => void;
  markSaved: () => void;
  runScoped: (scope: RunScope, targetNodeIds: string[]) => Promise<void>;
  initIfEmpty: () => void;
  addNode: (node: AppNode) => void;
  updateNodeData: (id: string, patch: Record<string, unknown>) => void;
  removeNode: (id: string) => void;
  removeRequestField: (nodeId: string, fieldId: string) => void;

  // history
  undo: () => void;
  redo: () => void;
}

function snapshot(s: Pick<WorkflowState, "nodes" | "edges">): Snapshot {
  return { nodes: structuredClone(s.nodes), edges: structuredClone(s.edges) };
}

export const useWorkflowStore = create<WorkflowState>((set, get) => ({
  nodes: [],
  edges: [],
  name: "Untitled workflow",
  dirty: false,
  past: [],
  future: [],
  workflowId: null,
  currentRunId: null,
  runActive: false,
  nodeState: {},

  onNodesChange: (changes) => {
    // Mark dirty only for persistable changes (position/remove/add) — not pure
    // selection or measurement — so autosave doesn't fire on every selection.
    // React Flow respects node.deletable=false, so pre-placed nodes are safe.
    const meaningful = changes.some(
      (c) => c.type !== "select" && c.type !== "dimensions",
    );
    set((s) => ({
      nodes: applyNodeChanges(changes, s.nodes) as AppNode[],
      dirty: s.dirty || meaningful,
    }));
  },

  onEdgesChange: (changes) => {
    const meaningful = changes.some((c) => c.type !== "select");
    set((s) => ({
      edges: applyEdgeChanges(changes, s.edges),
      dirty: s.dirty || meaningful,
    }));
  },

  isValidConnection: (conn) => {
    const src = parseHandleId(conn.sourceHandle);
    const tgt = parseHandleId(conn.targetHandle);
    if (!src || !tgt) return false;
    if (src.dir !== "out" || tgt.dir !== "in") return false;
    if (!isTypeCompatible(src.type, tgt.type)) return false;
    if (!conn.source || !conn.target) return false;
    if (wouldCreateCycle(get().edges, conn.source, conn.target)) return false;
    // One edge per input handle — a second source makes the input ambiguous.
    const occupied = get().edges.some(
      (e) => e.target === conn.target && e.targetHandle === conn.targetHandle,
    );
    if (occupied) return false;
    return true;
  },

  onConnect: (conn) => {
    if (!get().isValidConnection(conn)) return;
    const past = [...get().past, snapshot(get())];
    set({
      edges: addEdge(
        {
          ...conn,
          animated: true,
          style: { stroke: EDGE_COLOR, strokeWidth: 1.5 },
        },
        get().edges,
      ),
      past,
      future: [],
      dirty: true,
    });
  },

  // Re-route an existing edge to a new handle (drag an endpoint). Validated like
  // onConnect but excluding the edge being moved, so re-attaching to the same
  // target isn't rejected as "occupied".
  onReconnect: (oldEdge, conn) => {
    const src = parseHandleId(conn.sourceHandle);
    const tgt = parseHandleId(conn.targetHandle);
    if (!src || !tgt || src.dir !== "out" || tgt.dir !== "in") return;
    if (!isTypeCompatible(src.type, tgt.type)) return;
    if (!conn.source || !conn.target) return;
    const others = get().edges.filter((e) => e.id !== oldEdge.id);
    if (wouldCreateCycle(others, conn.source, conn.target)) return;
    if (
      others.some(
        (e) => e.target === conn.target && e.targetHandle === conn.targetHandle,
      )
    )
      return;
    set({
      edges: reconnectEdge(oldEdge, conn, get().edges),
      past: [...get().past, snapshot(get())],
      future: [],
      dirty: true,
    });
  },

  removeEdge: (id) => {
    set({
      edges: get().edges.filter((e) => e.id !== id),
      past: [...get().past, snapshot(get())],
      future: [],
      dirty: true,
    });
  },

  // Seed the store from server-fetched data on canvas mount. Resets transient
  // run state too, so navigating between workflows never carries over glow or a
  // stale run id from the previous one.
  hydrate: (workflowId, nodes, edges, name) =>
    set({
      workflowId,
      nodes,
      edges,
      name,
      past: [],
      future: [],
      dirty: false,
      currentRunId: null,
      runActive: false,
      nodeState: {},
    }),

  // Import replaces the graph; mark dirty so autosave persists it.
  setGraph: (nodes, edges, name) =>
    set((s) => ({
      nodes,
      edges,
      name: name ?? s.name,
      past: [],
      future: [],
      dirty: true,
    })),

  setName: (name) => set({ name, dirty: true, future: [] }),

  setCurrentRunId: (id) => set({ currentRunId: id, nodeState: {} }),
  setNodeState: (nodeState) => set({ nodeState }),
  setWorkflowId: (id) => set({ workflowId: id }),
  setRunActive: (active) => set({ runActive: active }),
  markSaved: () => set({ dirty: false }),

  // Start a run (full / multi-select / single). Saves the graph first so the
  // engine reads current state, then triggers and switches into live mode.
  runScoped: async (scope, targetNodeIds) => {
    const { workflowId, nodes, edges, name, runActive } = get();
    if (!workflowId || runActive) return;
    set({ runActive: true, nodeState: {} });
    try {
      await saveGraph(workflowId, { nodes, edges }, name);
      const res = await fetch("/api/runs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workflowId,
          scope,
          targetNodeIds,
          geminiApiKey: getLocalGeminiKey() ?? undefined,
        }),
      });
      if (!res.ok) throw new Error(await res.text());
      const { runId } = await res.json();
      set({ currentRunId: runId });
    } catch (e) {
      set({ runActive: false });
      alert("Run failed: " + (e instanceof Error ? e.message : String(e)));
    }
  },

  initIfEmpty: () => {
    if (get().nodes.length === 0) {
      set({ nodes: seedNodes(), edges: [], dirty: false });
    }
  },

  addNode: (node) => {
    set({
      nodes: [...get().nodes, node],
      past: [...get().past, snapshot(get())],
      future: [],
      dirty: true,
    });
  },

  updateNodeData: (id, patch) => {
    set({
      nodes: get().nodes.map((n) =>
        n.id === id ? { ...n, data: { ...n.data, ...patch } } : n,
      ),
      dirty: true,
      future: [],
    });
  },

  removeNode: (id) => {
    const node = get().nodes.find((n) => n.id === id);
    if (node?.deletable === false) return; // guard pre-placed nodes
    set({
      nodes: get().nodes.filter((n) => n.id !== id),
      edges: get().edges.filter((e) => e.source !== id && e.target !== id),
      past: [...get().past, snapshot(get())],
      future: [],
      dirty: true,
    });
  },

  // Delete a field and prune edges from its handle — a leftover edge keeps the
  // downstream target handle occupied and blocks reconnection.
  removeRequestField: (nodeId, fieldId) => {
    const nodes = get().nodes.map((n) => {
      if (n.id !== nodeId) return n;
      const data = n.data as unknown as RequestInputsData;
      const fields = (data.fields ?? []).filter((f) => f.id !== fieldId);
      return { ...n, data: { ...n.data, fields } };
    });
    const edges = get().edges.filter(
      (e) =>
        !(
          e.source === nodeId &&
          parseHandleId(e.sourceHandle)?.key === fieldId
        ),
    );
    set({
      nodes,
      edges,
      past: [...get().past, snapshot(get())],
      future: [],
      dirty: true,
    });
  },

  undo: () => {
    const past = get().past;
    if (past.length === 0) return;
    const prev = past[past.length - 1];
    set({
      nodes: prev.nodes,
      edges: prev.edges,
      past: past.slice(0, -1),
      future: [...get().future, snapshot(get())],
      dirty: true,
    });
  },

  redo: () => {
    const future = get().future;
    if (future.length === 0) return;
    const next = future[future.length - 1];
    set({
      nodes: next.nodes,
      edges: next.edges,
      future: future.slice(0, -1),
      past: [...get().past, snapshot(get())],
      dirty: true,
    });
  },
}));
