"use client";

import {
  BaseEdge,
  EdgeLabelRenderer,
  getBezierPath,
  type EdgeProps,
} from "@xyflow/react";
import { X } from "lucide-react";
import { useWorkflowStore } from "@/lib/store";
import { EDGE_COLOR } from "@/lib/handles";

/**
 * Default edge renderer for every connection: click to select (thickens for
 * feedback), then a × appears at the midpoint to delete it. Reconnect (drag an
 * endpoint) is wired at the canvas level.
 */
export function DeletableEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  markerEnd,
  selected,
}: EdgeProps) {
  const removeEdge = useWorkflowStore((s) => s.removeEdge);
  const [edgePath, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  });

  return (
    <>
      <BaseEdge
        id={id}
        path={edgePath}
        markerEnd={markerEnd}
        style={{ stroke: EDGE_COLOR, strokeWidth: selected ? 3 : 1.5 }}
        interactionWidth={26}
      />
      {selected && (
        <EdgeLabelRenderer>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              removeEdge(id);
            }}
            className="nodrag nopan absolute flex h-5 w-5 items-center justify-center rounded-full border border-node-border bg-white text-error shadow-sm hover:bg-error hover:text-white"
            style={{
              transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
              pointerEvents: "all",
            }}
            aria-label="Delete connection"
          >
            <X size={12} />
          </button>
        </EdgeLabelRenderer>
      )}
    </>
  );
}
