"use client";

import { useEffect, useRef, useState } from "react";
import { Position, type NodeProps } from "@xyflow/react";
import { ChevronRight, ChevronDown, Check } from "lucide-react";
import { GeminiIcon } from "@/components/icons/GeminiIcon";
import { ColoredHandle } from "./ColoredHandle";
import { NodeShell, FieldLabel } from "./NodeShell";
import { useWorkflowStore } from "@/lib/store";
import { makeHandleId } from "@/lib/handles";
import { GEMINI_MODEL, GEMINI_MODELS } from "@/lib/config";
import type { GeminiData, PortType } from "@/lib/contracts";

const IN_PROMPT = makeHandleId("in", "text", "prompt");
const IN_SYSTEM = makeHandleId("in", "text", "systemPrompt");
const IN_IMAGE = makeHandleId("in", "image", "image");
const IN_VIDEO = makeHandleId("in", "video", "video");
const IN_AUDIO = makeHandleId("in", "audio", "audio");
const IN_FILE = makeHandleId("in", "file", "file");
const OUT_RESPONSE = makeHandleId("out", "text", "response");

// Multimodal inputs shown to match the reference. Only Image (Vision) is wired
// into execution for this trial; the rest are connectable, type-safe handles.
const MEDIA_INPUTS: { handle: string; type: PortType; label: string }[] = [
  { handle: IN_IMAGE, type: "image", label: "Image (Vision)" },
  { handle: IN_VIDEO, type: "video", label: "Video" },
  { handle: IN_AUDIO, type: "audio", label: "Audio" },
  { handle: IN_FILE, type: "file", label: "File" },
];

export function GeminiNode({ id, data }: NodeProps) {
  const d = data as unknown as GeminiData;
  const updateNodeData = useWorkflowStore((s) => s.updateNodeData);
  const edges = useWorkflowStore((s) => s.edges);
  const connected = (h: string) =>
    edges.some((e) => e.target === id && e.targetHandle === h);
  const state = useWorkflowStore((s) => s.nodeState[id]);
  const response = (state?.output as { response?: string } | undefined)?.response;

  const [settingsOpen, setSettingsOpen] = useState(false);
  const settings = d.settings ?? {};
  const patchSettings = (patch: Record<string, number | undefined>) =>
    updateNodeData(id, { settings: { ...settings, ...patch } });
  const numOrUndef = (v: string) => (v === "" ? undefined : Number(v));

  // Custom model dropdown (native <select> can't be styled). Close on an
  // outside click; clicks inside the ref are ignored so option-select still fires.
  const [modelOpen, setModelOpen] = useState(false);
  const modelRef = useRef<HTMLDivElement>(null);
  const currentModel = d.model ?? GEMINI_MODEL;
  const currentLabel =
    GEMINI_MODELS.find((m) => m.id === currentModel)?.label ?? currentModel;
  useEffect(() => {
    if (!modelOpen) return;
    const onDown = (e: MouseEvent) => {
      if (!modelRef.current?.contains(e.target as Node)) setModelOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [modelOpen]);

  return (
    <NodeShell
      nodeId={id}
      title="Gemini"
      icon={<GeminiIcon size={14} />}
      running={state?.status === "RUNNING"}
      headerExtra={
        <div
          ref={modelRef}
          className="nodrag relative border-b border-node-border px-3 py-1.5"
        >
          <button
            type="button"
            onClick={() => setModelOpen((o) => !o)}
            className="flex w-full cursor-pointer items-center justify-between gap-2 rounded border border-node-border bg-node px-2 py-1 text-xs text-foreground hover:border-accent"
          >
            <span className="truncate">{currentLabel}</span>
            <ChevronDown
              size={13}
              className={`shrink-0 text-muted transition-transform ${modelOpen ? "rotate-180" : ""}`}
            />
          </button>
          {modelOpen && (
            <ul className="absolute inset-x-3 top-full z-20 mt-1 overflow-hidden rounded-lg border border-node-border bg-node py-1 shadow-lg">
              {GEMINI_MODELS.map((m) => {
                const active = m.id === currentModel;
                return (
                  <li key={m.id}>
                    <button
                      type="button"
                      onClick={() => {
                        updateNodeData(id, { model: m.id });
                        setModelOpen(false);
                      }}
                      className={`flex w-full cursor-pointer items-center justify-between gap-2 px-2.5 py-1.5 text-left text-xs hover:bg-canvas ${
                        active ? "font-medium text-accent" : "text-foreground"
                      }`}
                    >
                      <span className="truncate">{m.label}</span>
                      {active && <Check size={12} className="shrink-0" />}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
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
          className="nodrag max-h-60 w-full resize-none rounded border border-node-border bg-node px-2 py-1 text-xs outline-none [field-sizing:content] focus:border-accent disabled:bg-canvas disabled:text-muted"
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
          className="nodrag max-h-60 w-full resize-none rounded border border-node-border bg-node px-2 py-1 text-xs outline-none [field-sizing:content] focus:border-accent disabled:bg-canvas disabled:text-muted"
        />
        <ColoredHandle id={IN_SYSTEM} type="target" position={Position.Left} />
      </div>

      {/* Multimodal inputs (Image wired; Video/Audio/File for parity) */}
      {MEDIA_INPUTS.map((m) => (
        <div key={m.handle} className="relative">
          <FieldLabel>{m.label}</FieldLabel>
          <div className="rounded border border-dashed border-node-border px-2 py-2 text-xs text-muted">
            {connected(m.handle) ? "Connected" : `Connect ${m.label.toLowerCase()} output`}
          </div>
          <ColoredHandle id={m.handle} type="target" position={Position.Left} />
        </div>
      ))}

      {/* Settings (collapsed) */}
      <div className="rounded border border-node-border">
        <button
          type="button"
          onClick={() => setSettingsOpen((o) => !o)}
          className="flex w-full items-center gap-1 px-2 py-1.5 text-xs text-muted"
        >
          {settingsOpen ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
          Settings
        </button>
        {settingsOpen && (
          <div className="grid grid-cols-2 gap-2 px-2 pb-2">
            <div>
              <FieldLabel>Temperature</FieldLabel>
              <input
                type="number"
                min={0}
                max={2}
                step={0.1}
                value={settings.temperature ?? ""}
                onChange={(e) =>
                  patchSettings({ temperature: numOrUndef(e.target.value) })
                }
                placeholder="default"
                className="w-full rounded border border-node-border bg-node px-2 py-1 text-xs outline-none focus:border-accent"
              />
            </div>
            <div>
              <FieldLabel>Max tokens</FieldLabel>
              <input
                type="number"
                min={1}
                value={settings.maxOutputTokens ?? ""}
                onChange={(e) =>
                  patchSettings({ maxOutputTokens: numOrUndef(e.target.value) })
                }
                placeholder="default"
                className="w-full rounded border border-node-border bg-node px-2 py-1 text-xs outline-none focus:border-accent"
              />
            </div>
          </div>
        )}
      </div>

      {/* Response */}
      <div className="relative">
        <FieldLabel>Response</FieldLabel>
        <div className="max-h-32 overflow-y-auto rounded border border-node-border bg-canvas px-2 py-2 text-xs">
          {state?.error ? (
            <span className="whitespace-pre-wrap break-words text-error">
              {state.error}
            </span>
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
