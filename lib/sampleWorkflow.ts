import type { Edge } from "@xyflow/react";
import type { AppNode } from "@/lib/nodeFactory";
import { makeHandleId, EDGE_COLOR } from "@/lib/handles";

const C_TEXT = EDGE_COLOR;
const C_IMAGE = EDGE_COLOR;
const C_RESULT = EDGE_COLOR;

/**
 * The exact required sample workflow from the README (§"Required Sample
 * Workflow"): Request-Inputs → 2 Crops + 3 chained Geminis → Response.
 * Demonstrates parallel fan-out and the type-safe DAG.
 */

const F_TEXT = "f_text";
const F_IMAGE = "f_image";

function edge(
  id: string,
  source: string,
  sourceHandle: string,
  target: string,
  targetHandle: string,
  color: string,
): Edge {
  return {
    id,
    source,
    sourceHandle,
    target,
    targetHandle,
    animated: true,
    style: { stroke: color, strokeWidth: 1.5 },
  };
}

export function buildSampleWorkflow(): {
  name: string;
  nodes: AppNode[];
  edges: Edge[];
} {
  const data = (d: Record<string, unknown>) =>
    d as unknown as Record<string, unknown>;

  const nodes: AppNode[] = [
    {
      id: "req",
      type: "request-inputs",
      position: { x: 40, y: 300 },
      deletable: false,
      data: data({
        kind: "request-inputs",
        fields: [
          {
            id: F_TEXT,
            name: "text_field",
            type: "text_field",
            value:
              "Product: Wireless Bluetooth Headphones. Features: Noise cancellation, 30-hour battery, foldable design.",
          },
          { id: F_IMAGE, name: "image_field", type: "image_field", value: "" },
        ],
      }),
    },
    {
      id: "crop1",
      type: "crop-image",
      position: { x: 440, y: 40 },
      data: data({ kind: "crop-image", x: 20, y: 20, w: 60, h: 60 }),
    },
    {
      id: "crop2",
      type: "crop-image",
      position: { x: 440, y: 360 },
      data: data({ kind: "crop-image", x: 0, y: 0, w: 100, h: 50 }),
    },
    {
      id: "gem1",
      type: "gemini",
      position: { x: 440, y: 680 },
      data: data({
        kind: "gemini",        systemPrompt:
          "You are a marketing copywriter. Write a one-paragraph product description.",
      }),
    },
    {
      id: "gem2",
      type: "gemini",
      position: { x: 840, y: 680 },
      data: data({
        kind: "gemini",        systemPrompt:
          "Condense the following product description into a tweet-length hook (under 240 characters).",
      }),
    },
    {
      id: "gem3",
      type: "gemini",
      position: { x: 1240, y: 320 },
      data: data({
        kind: "gemini",        systemPrompt:
          "You are a social media manager. Combine the tweet hook and the two product crops into a final marketing post.",
      }),
    },
    {
      id: "res",
      type: "response",
      position: { x: 1640, y: 360 },
      deletable: false,
      data: data({ kind: "response" }),
    },
  ];

  const oImg = (k: string) => makeHandleId("out", "image", k);
  const oTxt = makeHandleId("out", "text", "response");
  const inPrompt = makeHandleId("in", "text", "prompt");
  const inImage = makeHandleId("in", "image", "image");
  const inCrop = makeHandleId("in", "image", "inputImage");
  const edges: Edge[] = [
    // image_field fans out to both crops
    edge("e1", "req", makeHandleId("out", "image", F_IMAGE), "crop1", inCrop, C_IMAGE),
    edge("e2", "req", makeHandleId("out", "image", F_IMAGE), "crop2", inCrop, C_IMAGE),
    // text_field -> Gemini #1 prompt
    edge("e3", "req", makeHandleId("out", "text", F_TEXT), "gem1", inPrompt, C_TEXT),
    // Gemini #1 -> Gemini #2 prompt
    edge("e4", "gem1", oTxt, "gem2", inPrompt, C_TEXT),
    // both crops -> Final Gemini image (vision)
    edge("e5", "crop1", oImg("outputImage"), "gem3", inImage, C_IMAGE),
    edge("e6", "crop2", oImg("outputImage"), "gem3", inImage, C_IMAGE),
    // Gemini #2 -> Final Gemini prompt
    edge("e7", "gem2", oTxt, "gem3", inPrompt, C_TEXT),
    // Final Gemini -> Response
    edge("e8", "gem3", oTxt, "res", makeHandleId("in", "any", "result"), C_RESULT),
  ];

  return { name: "Sample — Headphones Marketing", nodes, edges };
}
