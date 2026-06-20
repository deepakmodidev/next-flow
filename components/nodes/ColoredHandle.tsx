"use client";

import { Handle, Position, type HandleType } from "@xyflow/react";
import { parseHandleId, PORT_COLOR } from "@/lib/handles";

/**
 * A React Flow handle whose color is derived from the port type encoded in its
 * id (see makeHandleId). Rendered inside a `position: relative` row so React
 * Flow measures its connection point at the row.
 */
export function ColoredHandle({
  id,
  type,
  position,
}: {
  id: string;
  type: HandleType;
  position: Position;
}) {
  const parsed = parseHandleId(id);
  const color = parsed ? PORT_COLOR[parsed.type] : "var(--color-port-any)";
  const side = position === Position.Left ? { left: -6 } : { right: -6 };
  return (
    <Handle
      id={id}
      type={type}
      position={position}
      style={{
        width: 10,
        height: 10,
        borderRadius: "50%",
        background: color,
        border: "1.5px solid #ffffff",
        top: "50%",
        transform: "translateY(-50%)",
        ...side,
      }}
    />
  );
}
