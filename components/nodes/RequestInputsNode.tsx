"use client";

import { Position, type NodeProps } from "@xyflow/react";
import { Plus, Type, ImageIcon, Trash2, FormInput } from "lucide-react";
import { ColoredHandle } from "./ColoredHandle";
import { NodeShell } from "./NodeShell";
import { ImageUpload } from "./ImageUpload";
import { useWorkflowStore } from "@/lib/store";
import { makeHandleId } from "@/lib/handles";
import { genFieldId } from "@/lib/nodeFactory";
import type {
  RequestInputField,
  RequestInputsData,
} from "@/lib/contracts";

export function RequestInputsNode({ id, data }: NodeProps) {
  const d = data as unknown as RequestInputsData;
  const updateNodeData = useWorkflowStore((s) => s.updateNodeData);
  const removeRequestField = useWorkflowStore((s) => s.removeRequestField);
  const fields = d.fields ?? [];

  const setFields = (next: RequestInputField[]) =>
    updateNodeData(id, { fields: next });

  const addField = (type: RequestInputField["type"]) => {
    const base = type === "image_field" ? "image_field" : "text_field";
    const count = fields.filter((f) => f.type === type).length;
    setFields([
      ...fields,
      {
        id: genFieldId(),
        name: count === 0 ? base : `${base}_${count + 1}`,
        type,
        value: "",
      },
    ]);
  };

  return (
    <NodeShell
      nodeId={id}
      title="Request-Inputs"
      icon={<FormInput size={14} />}
      executable={false}
      deletable={false}
    >
      {fields.map((f) => (
        <div key={f.id} className="relative rounded-lg border border-node-border p-2">
          <div className="mb-1 flex items-center gap-1">
            {f.type === "image_field" ? <ImageIcon size={12} /> : <Type size={12} />}
            <input
              value={f.name}
              onChange={(e) =>
                setFields(
                  fields.map((x) =>
                    x.id === f.id ? { ...x, name: e.target.value } : x,
                  ),
                )
              }
              className="flex-1 bg-transparent text-xs font-medium outline-none"
            />
            <button
              type="button"
              onClick={() => removeRequestField(id, f.id)}
              className="text-muted hover:text-error"
              aria-label="Delete field"
            >
              <Trash2 size={12} />
            </button>
          </div>
          {f.type === "text_field" ? (
            <textarea
              value={f.value ?? ""}
              onChange={(e) =>
                setFields(
                  fields.map((x) =>
                    x.id === f.id ? { ...x, value: e.target.value } : x,
                  ),
                )
              }
              placeholder="Enter text..."
              rows={2}
              className="nodrag max-h-60 w-full resize-none rounded border border-node-border bg-node px-2 py-1 text-xs outline-none [field-sizing:content] focus:border-accent"
            />
          ) : (
            <ImageUpload
              value={f.value}
              onUploaded={(url) =>
                setFields(
                  fields.map((x) => (x.id === f.id ? { ...x, value: url } : x)),
                )
              }
            />
          )}
          <ColoredHandle
            id={makeHandleId("out", f.type === "image_field" ? "image" : "text", f.id)}
            type="source"
            position={Position.Right}
          />
        </div>
      ))}

      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => addField("text_field")}
          className="flex flex-1 items-center justify-center gap-1 rounded border border-node-border py-1 text-xs text-muted hover:border-accent"
        >
          <Plus size={12} /> Text
        </button>
        <button
          type="button"
          onClick={() => addField("image_field")}
          className="flex flex-1 items-center justify-center gap-1 rounded border border-node-border py-1 text-xs text-muted hover:border-accent"
        >
          <Plus size={12} /> Image
        </button>
      </div>
    </NodeShell>
  );
}
