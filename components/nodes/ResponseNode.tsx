"use client";

import { Position, type NodeProps } from "@xyflow/react";
import { Flag } from "lucide-react";
import { ColoredHandle } from "./ColoredHandle";
import { NodeShell, FieldLabel } from "./NodeShell";
import { makeHandleId } from "@/lib/handles";
import { useWorkflowStore } from "@/lib/store";

const IN_RESULT = makeHandleId("in", "any", "result");

export function ResponseNode({ id }: NodeProps) {
  const state = useWorkflowStore((s) => s.nodeState[id]);
  const result = (state?.output as { result?: unknown } | undefined)?.result;
  const text =
    result == null
      ? ""
      : typeof result === "string"
        ? result
        : JSON.stringify(result);

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
        <div className="max-h-40 overflow-y-auto rounded border border-node-border bg-canvas px-2 py-2 text-xs">
          {text ? (
            <span className="whitespace-pre-wrap text-foreground">{text}</span>
          ) : (
            <span className="text-muted">No output yet</span>
          )}
        </div>
        <ColoredHandle id={IN_RESULT} type="target" position={Position.Left} />
      </div>
    </NodeShell>
  );
}
