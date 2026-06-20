import type { NodeTypes } from "@xyflow/react";
import { RequestInputsNode } from "./RequestInputsNode";
import { CropImageNode } from "./CropImageNode";
import { GeminiNode } from "./GeminiNode";
import { ResponseNode } from "./ResponseNode";

export const nodeTypes: NodeTypes = {
  "request-inputs": RequestInputsNode,
  "crop-image": CropImageNode,
  gemini: GeminiNode,
  response: ResponseNode,
};
