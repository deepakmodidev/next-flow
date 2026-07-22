"use client";

import { Position, type NodeProps } from "@xyflow/react";
import { Flag } from "lucide-react";
import { ColoredHandle } from "./ColoredHandle";
import { NodeShell, FieldLabel } from "./NodeShell";
import { makeHandleId } from "@/lib/handles";
import { useWorkflowStore } from "@/lib/store";

const IN_RESULT = makeHandleId("in", "any", "result");

function isImageUrl(v: unknown): v is string {
  return typeof v === "string" && /^https?:\/\//.test(v) && /\.(jpe?g|png|webp|gif)(\?|$)/i.test(v);
}

export function ResponseNode({ id }: NodeProps) {
  const state = useWorkflowStore((s) => s.nodeState[id]);
  const result = (state?.output as { result?: unknown } | undefined)?.result;
  // The collector handle takes several upstreams (e.g. Final Gemini + Crop #2),
  // so the result is an array whenever more than one edge feeds it.
  const items = Array.isArray(result)
    ? result
    : result == null || result === ""
      ? []
      : [result];

  return (
    <NodeShell
      nodeId={id}
      title="Response"
      icon={<Flag size={14} />}
      executable={false}
      deletable={false}
      running={state?.status === "RUNNING"}
      width={240}
    >
      <div className="relative">
        <FieldLabel>result</FieldLabel>
        <div className="nodrag nowheel flex max-h-64 cursor-text select-text flex-col gap-2 overflow-y-auto rounded border border-node-border bg-canvas px-2 py-2 text-xs">
          {items.length === 0 ? (
            <span className="text-muted">No output yet</span>
          ) : (
            items.map((item, i) =>
              isImageUrl(item) ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  key={i}
                  src={item}
                  alt={`result ${i + 1}`}
                  className="w-full rounded border border-node-border object-contain"
                />
              ) : (
                <span key={i} className="whitespace-pre-wrap text-foreground">
                  {typeof item === "string" ? item : JSON.stringify(item)}
                </span>
              ),
            )
          )}
        </div>
        <ColoredHandle id={IN_RESULT} type="target" position={Position.Left} />
      </div>
    </NodeShell>
  );
}
