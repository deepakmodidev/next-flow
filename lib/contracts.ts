/**
 * Core type contracts for the workflow graph and execution.
 * See BUILD_PLAN.md §8. Pure types — safe to import anywhere.
 */

/** Port/handle data type — drives type-safe connections + handle color. */
export type PortType = "text" | "image" | "video" | "audio" | "file" | "any";

export interface PortDef {
  id: string;
  label: string;
  type: PortType;
  required?: boolean;
}

export type NodeKind = "request-inputs" | "crop-image" | "gemini" | "response";

/** Executable nodes run as Trigger.dev tasks; locals resolve inline. */
export const LOCAL_KINDS: ReadonlySet<NodeKind> = new Set<NodeKind>([
  "request-inputs",
  "response",
]);

export function isLocalKind(kind: NodeKind): boolean {
  return LOCAL_KINDS.has(kind);
}

// ---- Per-node config persisted in React Flow node.data ----

export type RequestInputFieldType = "text_field" | "image_field";

export interface RequestInputField {
  id: string;
  name: string;
  type: RequestInputFieldType;
  value?: string; // text content, or uploaded image URL
}

export interface RequestInputsData {
  kind: "request-inputs";
  fields: RequestInputField[];
}

export interface CropImageData {
  kind: "crop-image";
  x: number; // 0..100
  y: number; // 0..100
  w: number; // 0..100 (default 100)
  h: number; // 0..100 (default 100)
  inputImage?: string; // manual URL when not connected
}

export interface GeminiSettings {
  temperature?: number;
  maxOutputTokens?: number;
}

export interface GeminiData {
  kind: "gemini";
  model?: string; // selected model id; defaults to GEMINI_MODEL when unset
  prompt?: string;
  systemPrompt?: string;
  settings?: GeminiSettings;
}

export interface ResponseData {
  kind: "response";
  result?: unknown;
}

export type NodeData =
  | RequestInputsData
  | CropImageData
  | GeminiData
  | ResponseData;

// ---- Execution ----

export type RunScope = "FULL" | "PARTIAL" | "SINGLE";
export type RunStatus = "RUNNING" | "SUCCESS" | "FAILED" | "PARTIAL";
export type NodeStatus =
  | "PENDING"
  | "RUNNING"
  | "SUCCESS"
  | "FAILED"
  | "SKIPPED";

/** Payload handed to a node task. */
export interface NodeTaskPayload {
  runId: string;
  nodeId: string;
  kind: NodeKind;
  staticInputs: Record<string, unknown>;
  upstream: { nodeId: string; targetPort: string }[];
}

export interface StartRunRequest {
  workflowId: string;
  scope: RunScope;
  targetNodeIds: string[]; // [] = full workflow
}

export const CROP_DEFAULTS: Pick<CropImageData, "x" | "y" | "w" | "h"> = {
  x: 0,
  y: 0,
  w: 100,
  h: 100,
};
