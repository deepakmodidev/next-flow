"use client";

import { useState } from "react";
import { useReactFlow } from "@xyflow/react";
import { Plus, Undo2, Redo2 } from "lucide-react";
import { NodePicker } from "./NodePicker";
import { useWorkflowStore } from "@/lib/store";
import { makeNode } from "@/lib/nodeFactory";
import type { NodeKind } from "@/lib/contracts";

/**
 * Bottom-center floating toolbar with the "+" picker — matches Magica (no left
 * node sidebar). README §"Adding nodes".
 */
export function BottomToolbar() {
  const [open, setOpen] = useState(false);
  const addNode = useWorkflowStore((s) => s.addNode);
  const undo = useWorkflowStore((s) => s.undo);
  const redo = useWorkflowStore((s) => s.redo);
  const { screenToFlowPosition } = useReactFlow();

  const handlePick = (kind: Exclude<NodeKind, "request-inputs" | "response">) => {
    // Drop the new node roughly in the center of the viewport.
    const pos = screenToFlowPosition({
      x: window.innerWidth / 2,
      y: window.innerHeight / 2,
    });
    addNode(makeNode(kind, pos));
    setOpen(false);
  };

  return (
    <div className="absolute bottom-6 left-1/2 z-10 -translate-x-1/2">
      {open && (
        <div className="absolute bottom-14 left-1/2 -translate-x-1/2">
          <NodePicker onPick={handlePick} onClose={() => setOpen(false)} />
        </div>
      )}
      <div className="flex items-center gap-1 rounded-full border border-node-border bg-node px-2 py-1.5 shadow-md">
        <button
          type="button"
          onClick={undo}
          className="rounded-full p-2 text-muted hover:bg-canvas"
          aria-label="Undo"
        >
          <Undo2 size={16} />
        </button>
        <button
          type="button"
          onClick={redo}
          className="rounded-full p-2 text-muted hover:bg-canvas"
          aria-label="Redo"
        >
          <Redo2 size={16} />
        </button>
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="flex items-center gap-1 rounded-full bg-accent px-3 py-2 text-sm font-medium text-white hover:opacity-90"
        >
          <Plus size={16} /> Add node
        </button>
      </div>
    </div>
  );
}
