"use client";

import { Position, type NodeProps } from "@xyflow/react";
import { Sparkles } from "lucide-react";
import { ColoredHandle } from "./ColoredHandle";
import { NodeShell, FieldLabel } from "./NodeShell";
import { useWorkflowStore } from "@/lib/store";
import { makeHandleId } from "@/lib/handles";
import { GEMINI_MODEL } from "@/lib/config";
import type { GeminiData } from "@/lib/contracts";

const IN_PROMPT = makeHandleId("in", "text", "prompt");
const IN_SYSTEM = makeHandleId("in", "text", "systemPrompt");
const IN_IMAGE = makeHandleId("in", "image", "image");
const OUT_RESPONSE = makeHandleId("out", "text", "response");

export function GeminiNode({ id, data }: NodeProps) {
  const d = data as unknown as GeminiData;
  const updateNodeData = useWorkflowStore((s) => s.updateNodeData);
  const edges = useWorkflowStore((s) => s.edges);
  const connected = (h: string) =>
    edges.some((e) => e.target === id && e.targetHandle === h);
  const state = useWorkflowStore((s) => s.nodeState[id]);
  const response = (state?.output as { response?: string } | undefined)?.response;

  return (
    <NodeShell
      nodeId={id}
      title="Gemini"
      icon={<Sparkles size={14} />}
      running={state?.status === "RUNNING"}
      headerExtra={
        <div className="border-b border-node-border px-3 py-1.5 text-xs text-muted">
          {GEMINI_MODEL}
        </div>
      }
    >
      {/* Prompt */}
      <div className="relative">
        <FieldLabel required>Prompt</FieldLabel>
        <textarea
          disabled={connected(IN_PROMPT)}
          value={connected(IN_PROMPT) ? "" : (d.prompt ?? "")}
          onChange={(e) => updateNodeData(id, { prompt: e.target.value })}
          placeholder={connected(IN_PROMPT) ? "Connected" : "Enter your prompt..."}
          rows={2}
          className="w-full resize-none rounded border border-node-border bg-node px-2 py-1 text-xs outline-none focus:border-accent disabled:bg-canvas disabled:text-muted"
        />
        <ColoredHandle id={IN_PROMPT} type="target" position={Position.Left} />
      </div>

      {/* System Prompt */}
      <div className="relative">
        <FieldLabel>System Prompt</FieldLabel>
        <textarea
          disabled={connected(IN_SYSTEM)}
          value={connected(IN_SYSTEM) ? "" : (d.systemPrompt ?? "")}
          onChange={(e) => updateNodeData(id, { systemPrompt: e.target.value })}
          placeholder={connected(IN_SYSTEM) ? "Connected" : "You are a helpful assistant..."}
          rows={2}
          className="w-full resize-none rounded border border-node-border bg-node px-2 py-1 text-xs outline-none focus:border-accent disabled:bg-canvas disabled:text-muted"
        />
        <ColoredHandle id={IN_SYSTEM} type="target" position={Position.Left} />
      </div>

      {/* Image (Vision) */}
      <div className="relative">
        <FieldLabel>Image (Vision)</FieldLabel>
        <div className="rounded border border-dashed border-node-border px-2 py-2 text-xs text-muted">
          Connect image output(s)
        </div>
        <ColoredHandle id={IN_IMAGE} type="target" position={Position.Left} />
      </div>

      {/* Response */}
      <div className="relative">
        <FieldLabel>Response</FieldLabel>
        <div className="max-h-32 overflow-y-auto rounded border border-node-border bg-canvas px-2 py-2 text-xs">
          {state?.error ? (
            <span className="text-error">{state.error.slice(0, 240)}</span>
          ) : response ? (
            <span className="whitespace-pre-wrap text-foreground">{response}</span>
          ) : (
            <span className="text-muted">No output yet</span>
          )}
        </div>
        <ColoredHandle id={OUT_RESPONSE} type="source" position={Position.Right} />
      </div>
    </NodeShell>
  );
}
