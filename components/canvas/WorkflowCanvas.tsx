"use client";

import { useEffect, useLayoutEffect, useState } from "react";
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { History } from "lucide-react";
import { useWorkflowStore } from "@/lib/store";
import { EDGE_COLOR } from "@/lib/handles";
import { nodeTypes } from "@/components/nodes/nodeTypes";
import { BottomToolbar } from "./BottomToolbar";
import { TopBar } from "./TopBar";
import { HistorySidebar } from "@/components/history/HistorySidebar";
import { saveGraph, type WorkflowGraph } from "@/lib/workflows";

// Run before the browser paints on the client (so the canvas never shows an
// empty frame); fall back to useEffect on the server to avoid React's
// "useLayoutEffect does nothing on the server" warning.
const useBrowserLayoutEffect =
  typeof window !== "undefined" ? useLayoutEffect : useEffect;

function CanvasInner({
  workflowId,
  initialGraph,
  initialName,
}: {
  workflowId: string;
  initialGraph: WorkflowGraph;
  initialName: string;
}) {
  // Seed the store from server-fetched data before the first visible frame, so
  // the canvas renders with its nodes immediately — no empty-canvas flash, no
  // client round-trip. CanvasInner is keyed by workflowId upstream, so this
  // runs exactly once per workflow.
  useBrowserLayoutEffect(() => {
    useWorkflowStore
      .getState()
      .hydrate(workflowId, initialGraph.nodes, initialGraph.edges, initialName);
  }, []);

  const nodes = useWorkflowStore((s) => s.nodes);
  const edges = useWorkflowStore((s) => s.edges);
  const name = useWorkflowStore((s) => s.name);
  const onNodesChange = useWorkflowStore((s) => s.onNodesChange);
  const onEdgesChange = useWorkflowStore((s) => s.onEdgesChange);
  const onConnect = useWorkflowStore((s) => s.onConnect);
  const isValidConnection = useWorkflowStore((s) => s.isValidConnection);
  const currentRunId = useWorkflowStore((s) => s.currentRunId);
  const setNodeState = useWorkflowStore((s) => s.setNodeState);
  const setRunActive = useWorkflowStore((s) => s.setRunActive);

  const [historyOpen, setHistoryOpen] = useState(false);

  // Debounced autosave. Data is present from first render (hydrated), so the
  // only guard needed is never persisting an empty graph.
  useEffect(() => {
    if (nodes.length === 0) return;
    const t = setTimeout(
      () => saveGraph(workflowId, { nodes, edges }, name),
      600,
    );
    return () => clearTimeout(t);
  }, [workflowId, nodes, edges, name]);

  // Poll the active run → live node status (glow) + inline output.
  useEffect(() => {
    if (!currentRunId) return;
    let active = true;
    (async () => {
      while (active) {
        try {
          const res = await fetch(`/api/runs/${currentRunId}`);
          if (res.ok) {
            const run = await res.json();
            const map: Record<
              string,
              { status: string; output?: unknown; error?: string | null }
            > = {};
            for (const n of run.nodeRuns ?? []) {
              map[n.nodeId] = {
                status: n.status,
                output: n.output,
                error: n.error,
              };
            }
            setNodeState(map);
            if (run.status !== "RUNNING") {
              setRunActive(false);
              break;
            }
          }
        } catch {
          /* keep polling */
        }
        await new Promise((r) => setTimeout(r, 1200));
      }
    })();
    return () => {
      active = false;
    };
  }, [currentRunId, setNodeState, setRunActive]);

  return (
    <div className="relative h-full w-full bg-canvas">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        isValidConnection={isValidConnection}
        nodeTypes={nodeTypes}
        defaultEdgeOptions={{
          animated: true,
          style: { stroke: EDGE_COLOR, strokeWidth: 1.5 },
        }}
        deleteKeyCode={["Delete", "Backspace"]}
        fitView
        proOptions={{ hideAttribution: true }}
      >
        <Background
          variant={BackgroundVariant.Dots}
          gap={20}
          size={1.5}
          color="var(--color-canvas-dot)"
        />
        <MiniMap pannable zoomable />
        <Controls />
      </ReactFlow>
      <TopBar onOpenHistory={() => setHistoryOpen(true)} />
      <BottomToolbar />

      {!historyOpen && (
        <button
          type="button"
          onClick={() => setHistoryOpen(true)}
          className="absolute right-4 top-14 z-10 flex items-center gap-1.5 rounded-md border border-node-border bg-node px-2.5 py-1.5 text-xs text-muted shadow-sm hover:text-foreground"
        >
          <History size={14} /> History
        </button>
      )}
      <HistorySidebar
        workflowId={workflowId}
        open={historyOpen}
        onClose={() => setHistoryOpen(false)}
      />
    </div>
  );
}

export function WorkflowCanvas({
  workflowId,
  initialGraph,
  initialName,
}: {
  workflowId: string;
  initialGraph: WorkflowGraph;
  initialName: string;
}) {
  return (
    <ReactFlowProvider>
      <CanvasInner
        key={workflowId}
        workflowId={workflowId}
        initialGraph={initialGraph}
        initialName={initialName}
      />
    </ReactFlowProvider>
  );
}
