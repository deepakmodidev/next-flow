import type { Node } from "@xyflow/react";
import {
  CROP_DEFAULTS,
  type CropImageData,
  type GeminiData,
  type NodeKind,
  type RequestInputsData,
  type ResponseData,
} from "@/lib/contracts";

/** App node: a React Flow node whose `data` carries one of our discriminated shapes. */
export type AppNode = Node;

function rand(): string {
  return Math.random().toString(36).slice(2, 11);
}

export function genNodeId(suffix?: string): string {
  return `node_${Date.now()}_${suffix ?? rand()}`;
}

export function genFieldId(): string {
  return `f_${Date.now()}_${rand()}`;
}

/** Pre-placed Request-Inputs node (left). Cannot be deleted. */
export function makeRequestInputsNode(id?: string): AppNode {
  const data: RequestInputsData = {
    kind: "request-inputs",
    fields: [
      { id: genFieldId(), name: "text_field", type: "text_field", value: "" },
    ],
  };
  return {
    id: id ?? genNodeId("request"),
    type: "request-inputs",
    position: { x: 80, y: 200 },
    deletable: false,
    data: data as unknown as Record<string, unknown>,
  };
}

/** Pre-placed Response node (right). Cannot be deleted. */
export function makeResponseNode(id?: string): AppNode {
  const data: ResponseData = { kind: "response" };
  return {
    id: id ?? genNodeId("response"),
    type: "response",
    position: { x: 760, y: 220 },
    deletable: false,
    data: data as unknown as Record<string, unknown>,
  };
}

export function makeCropImageNode(position: { x: number; y: number }): AppNode {
  const data: CropImageData = { kind: "crop-image", ...CROP_DEFAULTS };
  return {
    id: genNodeId(),
    type: "crop-image",
    position,
    data: data as unknown as Record<string, unknown>,
  };
}

export function makeGeminiNode(position: { x: number; y: number }): AppNode {
  const data: GeminiData = { kind: "gemini" };
  return {
    id: genNodeId(),
    type: "gemini",
    position,
    data: data as unknown as Record<string, unknown>,
  };
}

export function makeNode(
  kind: Exclude<NodeKind, "request-inputs" | "response">,
  position: { x: number; y: number },
): AppNode {
  return kind === "crop-image"
    ? makeCropImageNode(position)
    : makeGeminiNode(position);
}

/** The two pre-placed nodes a fresh canvas opens with. */
export function seedNodes(): AppNode[] {
  return [makeRequestInputsNode(), makeResponseNode()];
}
