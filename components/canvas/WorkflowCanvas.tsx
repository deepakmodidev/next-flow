"use client";

import { useEffect, useRef, useState } from "react";
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
import { getWorkflow, saveGraph } from "@/lib/workflows";
import { seedNodes } from "@/lib/nodeFactory";

function CanvasInner({ workflowId }: { workflowId: string }) {
  const nodes = useWorkflowStore((s) => s.nodes);
  const edges = useWorkflowStore((s) => s.edges);
  const name = useWorkflowStore((s) => s.name);
  const onNodesChange = useWorkflowStore((s) => s.onNodesChange);
  const onEdgesChange = useWorkflowStore((s) => s.onEdgesChange);
  const onConnect = useWorkflowStore((s) => s.onConnect);
  const isValidConnection = useWorkflowStore((s) => s.isValidConnection);
  const setGraph = useWorkflowStore((s) => s.setGraph);
  const currentRunId = useWorkflowStore((s) => s.currentRunId);
  const setNodeState = useWorkflowStore((s) => s.setNodeState);
  const setWorkflowId = useWorkflowStore((s) => s.setWorkflowId);
  const setRunActive = useWorkflowStore((s) => s.setRunActive);

  const loadedFor = useRef<string | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);

  // Load the workflow graph (or seed a fresh one) on mount / id change.
  useEffect(() => {
    let active = true;
    loadedFor.current = null; // block autosave until THIS workflow has loaded
    getWorkflow(workflowId).then((wf) => {
      if (!active) return;
      if (wf) {
        setGraph(wf.graph.nodes, wf.graph.edges, wf.name);
      } else {
        setGraph(seedNodes(), [], "Untitled workflow");
      }
      loadedFor.current = workflowId;
    });
    return () => {
      active = false;
    };
  }, [workflowId, setGraph]);

  // Expose the active workflow id to the store (for run actions).
  useEffect(() => {
    setWorkflowId(workflowId);
  }, [workflowId, setWorkflowId]);

  // Debounced autosave — only once this workflow has loaded, and never persist
  // an empty graph (a valid workflow always has the 2 pre-placed nodes).
  useEffect(() => {
    if (loadedFor.current !== workflowId || nodes.length === 0) return;
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

export function WorkflowCanvas({ workflowId }: { workflowId: string }) {
  return (
    <ReactFlowProvider>
      <CanvasInner workflowId={workflowId} />
    </ReactFlowProvider>
  );
}
