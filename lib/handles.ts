/**
 * Handle/port type system: drives type-safe connections, the connected-input
 * grey-out, and handle/edge color. See BUILD_PLAN.md §9.
 */
import type { PortType } from "@/lib/contracts";

/** Animated edges are purple (README deliverable); handles stay type-colored. */
export const EDGE_COLOR = "#8b5cf6";

/** Tailwind token color per port type (matches @theme in globals.css). */
export const PORT_COLOR: Record<PortType, string> = {
  text: "var(--color-port-text)",
  image: "var(--color-port-image)",
  video: "var(--color-port-any)",
  audio: "var(--color-port-any)",
  file: "var(--color-port-any)",
  any: "var(--color-port-any)",
};

/**
 * A connection is valid when the source output type is assignable to the
 * target input type. `any` on either side accepts everything (the Response
 * collector uses `any`).
 */
export function isTypeCompatible(
  source: PortType,
  target: PortType,
): boolean {
  return source === target || source === "any" || target === "any";
}

/**
 * Static handle type lookup by `${nodeKind}:${handleId}`. Per-field handles on
 * Request-Inputs are resolved dynamically from the field type, so they are not
 * listed here.
 */
const STATIC_HANDLE_TYPES: Record<string, PortType> = {
  // crop-image
  "crop-image:in:inputImage": "image",
  "crop-image:in:x": "text",
  "crop-image:in:y": "text",
  "crop-image:in:w": "text",
  "crop-image:in:h": "text",
  "crop-image:out:outputImage": "image",
  // gemini
  "gemini:in:prompt": "text",
  "gemini:in:systemPrompt": "text",
  "gemini:in:image": "image",
  "gemini:in:video": "video",
  "gemini:in:audio": "audio",
  "gemini:in:file": "file",
  "gemini:out:response": "text",
  // response (collector accepts anything)
  "response:in:result": "any",
};

export function handleKey(
  nodeKind: string,
  direction: "in" | "out",
  handleId: string,
): string {
  return `${nodeKind}:${direction}:${handleId}`;
}

export function lookupHandleType(
  nodeKind: string,
  direction: "in" | "out",
  handleId: string,
): PortType | undefined {
  return STATIC_HANDLE_TYPES[handleKey(nodeKind, direction, handleId)];
}

/**
 * Handle ids encode their direction + port type + key, so connection validation
 * and handle coloring are self-contained: `out:text:response`, `in:image:image`,
 * `out:image:<fieldId>` (Request-Inputs fields).
 */
export type HandleDir = "in" | "out";

export function makeHandleId(
  dir: HandleDir,
  type: PortType,
  key: string,
): string {
  return `${dir}:${type}:${key}`;
}

export function parseHandleId(
  id: string | null | undefined,
): { dir: HandleDir; type: PortType; key: string } | null {
  if (!id) return null;
  const parts = id.split(":");
  if (parts.length < 3) return null;
  const [dir, type, ...rest] = parts;
  if (dir !== "in" && dir !== "out") return null;
  return { dir, type: type as PortType, key: rest.join(":") };
}
