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
  // Images sit outside the scroll box so a long text result can't push them
  // out of sight.
  const texts = items.filter((i) => !isImageUrl(i));
  const images = items.filter(isImageUrl);

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
        <div className="flex flex-col gap-2">
          {items.length === 0 ? (
            <div className="rounded border border-node-border bg-canvas px-2 py-2 text-xs text-muted">
              No output yet
            </div>
          ) : (
            <>
              {texts.length > 0 && (
                <div className="nodrag nowheel max-h-40 cursor-text select-text overflow-y-auto rounded border border-node-border bg-canvas px-2 py-2 text-xs">
                  {texts.map((item, i) => (
                    <span
                      key={i}
                      className="block whitespace-pre-wrap text-foreground"
                    >
                      {typeof item === "string" ? item : JSON.stringify(item)}
                    </span>
                  ))}
                </div>
              )}
              {images.map((src, i) => (
                <div
                  key={i}
                  className="overflow-hidden rounded border border-node-border bg-canvas"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={src}
                    alt={`result image ${i + 1}`}
                    className="max-h-40 w-full object-contain"
                  />
                </div>
              ))}
            </>
          )}
        </div>
        <ColoredHandle id={IN_RESULT} type="target" position={Position.Left} />
      </div>
    </NodeShell>
  );
}
