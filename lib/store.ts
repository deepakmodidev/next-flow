import { create } from "zustand";
import {
  addEdge,
  applyEdgeChanges,
  applyNodeChanges,
  type Connection,
  type Edge,
  type EdgeChange,
  type Node,
  type NodeChange,
} from "@xyflow/react";
import { parseHandleId, isTypeCompatible, EDGE_COLOR } from "@/lib/handles";
import { wouldCreateCycle } from "@/lib/dag";
import { seedNodes, type AppNode } from "@/lib/nodeFactory";
import { saveGraph } from "@/lib/workflows";
import { getLocalGeminiKey } from "@/lib/geminiKey";
import type { RunScope } from "@/lib/contracts";

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
  isValidConnection: (conn: Connection | Edge) => boolean;

  // mutations
  setGraph: (nodes: AppNode[], edges: Edge[], name?: string) => void;
  setName: (name: string) => void;
  setCurrentRunId: (id: string | null) => void;
  setNodeState: (state: Record<string, NodeRunState>) => void;
  setWorkflowId: (id: string) => void;
  setRunActive: (active: boolean) => void;
  runScoped: (scope: RunScope, targetNodeIds: string[]) => Promise<void>;
  initIfEmpty: () => void;
  addNode: (node: AppNode) => void;
  updateNodeData: (id: string, patch: Record<string, unknown>) => void;
  removeNode: (id: string) => void;

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
    // React Flow respects node.deletable=false, so pre-placed nodes are safe.
    set({ nodes: applyNodeChanges(changes, get().nodes) as AppNode[] });
  },

  onEdgesChange: (changes) => {
    set({ edges: applyEdgeChanges(changes, get().edges) });
  },

  isValidConnection: (conn) => {
    const src = parseHandleId(conn.sourceHandle);
    const tgt = parseHandleId(conn.targetHandle);
    if (!src || !tgt) return false;
    if (src.dir !== "out" || tgt.dir !== "in") return false;
    if (!isTypeCompatible(src.type, tgt.type)) return false;
    if (!conn.source || !conn.target) return false;
    if (wouldCreateCycle(get().edges, conn.source, conn.target)) return false;
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

  setGraph: (nodes, edges, name) =>
    set((s) => ({
      nodes,
      edges,
      name: name ?? s.name,
      past: [],
      future: [],
      dirty: false,
    })),

  setName: (name) => set({ name, dirty: true }),

  setCurrentRunId: (id) => set({ currentRunId: id, nodeState: {} }),
  setNodeState: (nodeState) => set({ nodeState }),
  setWorkflowId: (id) => set({ workflowId: id }),
  setRunActive: (active) => set({ runActive: active }),

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
