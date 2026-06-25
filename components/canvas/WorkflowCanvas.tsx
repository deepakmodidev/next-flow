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

  // After hydrate, load the workflow's most recent run so finished node outputs
  // show on the canvas even after a reload or when a run completed in the
  // background (hydrate wipes nodeState, and the live poll only fills it while a
  // run is active). If that run is still RUNNING, resume live polling.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/runs?workflowId=${workflowId}`);
        if (!res.ok) return;
        const { runs } = await res.json();
        const latest = runs?.[0];
        if (!latest || cancelled) return;
        const map: Record<
          string,
          { status: string; output?: unknown; error?: string | null }
        > = {};
        for (const n of latest.nodeRuns ?? []) {
          map[n.nodeId] = { status: n.status, output: n.output, error: n.error };
        }
        const store = useWorkflowStore.getState();
        if (latest.status === "RUNNING") {
          store.setRunActive(true);
          store.setCurrentRunId(latest.id); // resumes the poll (clears nodeState)
        }
        store.setNodeState(map); // set after so the latest outputs show immediately
      } catch {
        /* no recent run / offline — nodes stay blank until the next run */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [workflowId]);

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
    <div className="flex h-full w-full">
      {/* Canvas area shrinks when the history panel opens (it's a flex sibling,
          not an overlay) so the panel never covers the graph. */}
      <div className="relative min-w-0 flex-1 bg-canvas">
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
        <TopBar
          historyOpen={historyOpen}
          onToggleHistory={() => setHistoryOpen((o) => !o)}
          onOpenHistory={() => setHistoryOpen(true)}
        />
        <BottomToolbar />
      </div>
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
