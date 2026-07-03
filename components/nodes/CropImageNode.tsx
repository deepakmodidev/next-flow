"use client";

import { Position, type NodeProps } from "@xyflow/react";
import { Crop } from "lucide-react";
import { ColoredHandle } from "./ColoredHandle";
import { NodeShell, FieldLabel } from "./NodeShell";
import { useWorkflowStore } from "@/lib/store";
import { makeHandleId } from "@/lib/handles";
import type { CropImageData } from "@/lib/contracts";

const IN_IMAGE = makeHandleId("in", "image", "inputImage");
const OUT_IMAGE = makeHandleId("out", "image", "outputImage");

// Typed input handle per crop param so x/y/w/h can be driven by a connection.
const PARAM_HANDLE: Record<"x" | "y" | "w" | "h", string> = {
  x: makeHandleId("in", "text", "x"),
  y: makeHandleId("in", "text", "y"),
  w: makeHandleId("in", "text", "w"),
  h: makeHandleId("in", "text", "h"),
};

export function CropImageNode({ id, data }: NodeProps) {
  const d = data as unknown as CropImageData;
  const updateNodeData = useWorkflowStore((s) => s.updateNodeData);
  const edges = useWorkflowStore((s) => s.edges);
  const connected = (h: string) =>
    edges.some((e) => e.target === id && e.targetHandle === h);
  const imageConnected = connected(IN_IMAGE);
  const state = useWorkflowStore((s) => s.nodeState[id]);
  const outputImage = (state?.output as { outputImage?: string } | undefined)
    ?.outputImage;

  const num = (k: "x" | "y" | "w" | "h") => {
    const handle = PARAM_HANDLE[k];
    const isConn = connected(handle);
    return (
      <div key={k} className="relative">
        <FieldLabel>{k.toUpperCase()} %</FieldLabel>
        <input
          type="number"
          min={0}
          max={100}
          disabled={isConn}
          value={isConn ? "" : d[k]}
          onChange={(e) =>
            updateNodeData(id, {
              [k]: Math.max(0, Math.min(100, Number(e.target.value))),
            })
          }
          placeholder={isConn ? "Connected" : undefined}
          className="w-full rounded border border-node-border bg-node px-2 py-1 text-xs outline-none focus:border-accent disabled:bg-canvas disabled:text-muted"
        />
        <ColoredHandle id={handle} type="target" position={Position.Left} />
      </div>
    );
  };

  return (
    <NodeShell
      nodeId={id}
      title="Crop Image"
      icon={<Crop size={14} />}
      running={state?.status === "RUNNING"}
    >
      {/* Input Image */}
      <div className="relative">
        <FieldLabel required>Input Image</FieldLabel>
        <input
          disabled={imageConnected}
          value={imageConnected ? "" : (d.inputImage ?? "")}
          onChange={(e) => updateNodeData(id, { inputImage: e.target.value })}
          placeholder={imageConnected ? "Connected" : "Image URL..."}
          className="w-full rounded border border-node-border bg-node px-2 py-1 text-xs outline-none focus:border-accent disabled:bg-canvas disabled:text-muted"
        />
        <ColoredHandle id={IN_IMAGE} type="target" position={Position.Left} />
      </div>

      {/* full-width rows so each param handle lines up on the left edge */}
      {num("x")}
      {num("y")}
      {num("w")}
      {num("h")}

      {/* Output */}
      <div className="relative">
        <FieldLabel>Output Image</FieldLabel>
        {outputImage ? (
          <div className="overflow-hidden rounded border border-node-border">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={outputImage}
              alt="crop output"
              className="h-16 w-full object-cover"
            />
          </div>
        ) : (
          <div className="rounded border border-node-border bg-canvas px-2 py-2 text-xs text-muted">
            {state?.error ? (
              <span className="block max-h-24 overflow-y-auto whitespace-pre-wrap break-words text-error">
                {state.error}
              </span>
            ) : (
              "No output yet"
            )}
          </div>
        )}
        <ColoredHandle id={OUT_IMAGE} type="source" position={Position.Right} />
      </div>
    </NodeShell>
  );
}
