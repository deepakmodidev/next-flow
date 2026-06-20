"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Workflow, Pencil, Trash2, Check, X } from "lucide-react";
import {
  createWorkflow,
  createWorkflowFromGraph,
  renameWorkflow,
  deleteWorkflow,
} from "@/lib/workflows";
import { buildSampleWorkflow } from "@/lib/sampleWorkflow";

export interface WorkflowItem {
  id: string;
  name: string;
  updatedAt: number;
}

function timeAgo(ts: number): string {
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60) return "just now";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export function DashboardClient({ items }: { items: WorkflowItem[] }) {
  const router = useRouter();
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [pending, startTransition] = useTransition();

  const onCreate = async () => {
    const wf = await createWorkflow();
    router.push(`/workflow/${wf.id}`);
  };

  const onCreateSample = async () => {
    const { name, nodes, edges } = buildSampleWorkflow();
    const wf = await createWorkflowFromGraph(name, { nodes, edges });
    router.push(`/workflow/${wf.id}`);
  };

  const onDelete = async (id: string) => {
    if (!confirm("Delete this workflow?")) return;
    await deleteWorkflow(id);
    startTransition(() => router.refresh());
  };

  const startRename = (m: WorkflowItem) => {
    setEditing(m.id);
    setDraft(m.name);
  };
  const commitRename = async (id: string) => {
    if (draft.trim()) await renameWorkflow(id, draft.trim());
    setEditing(null);
    startTransition(() => router.refresh());
  };

  return (
    <div className="mx-auto w-full max-w-3xl flex-1 px-6 py-10">
      <div className="mb-8 flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Flow</h1>
          <p className="mt-1 text-sm text-muted">
            Build workflows or run models directly.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onCreateSample}
            className="rounded-lg border border-node-border px-3.5 py-2 text-sm font-medium text-foreground hover:bg-canvas"
          >
            Sample workflow
          </button>
          <button
            type="button"
            onClick={onCreate}
            className="flex items-center gap-1.5 rounded-lg bg-accent px-3.5 py-2 text-sm font-medium text-white hover:opacity-90"
          >
            <Plus size={16} /> New Workflow
          </button>
        </div>
      </div>

      <h2 className="mb-3 text-sm font-medium text-muted">Your Workflows</h2>

      {items.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-node border border-dashed border-node-border py-16 text-center">
          <Workflow size={28} className="text-muted" />
          <p className="mt-3 text-sm font-medium">No workflows yet</p>
          <p className="mt-1 text-xs text-muted">
            Create your first workflow to get started.
          </p>
          <button
            type="button"
            onClick={onCreate}
            className="mt-4 flex items-center gap-1.5 rounded-lg bg-accent px-3.5 py-2 text-sm font-medium text-white hover:opacity-90"
          >
            <Plus size={16} /> New Workflow
          </button>
        </div>
      ) : (
        <ul
          className={`divide-y divide-node-border overflow-hidden rounded-node border border-node-border bg-node ${pending ? "opacity-60" : ""}`}
        >
          {items.map((m) => (
            <li
              key={m.id}
              className="flex items-center gap-3 px-4 py-3 hover:bg-canvas"
            >
              {editing === m.id ? (
                <>
                  <input
                    autoFocus
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && commitRename(m.id)}
                    className="flex-1 rounded border border-node-border bg-node px-2 py-1 text-sm outline-none focus:border-accent"
                  />
                  <button
                    type="button"
                    onClick={() => commitRename(m.id)}
                    className="text-success"
                    aria-label="Save"
                  >
                    <Check size={16} />
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditing(null)}
                    className="text-muted"
                    aria-label="Cancel"
                  >
                    <X size={16} />
                  </button>
                </>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={() => router.push(`/workflow/${m.id}`)}
                    className="flex flex-1 items-center gap-2 text-left"
                  >
                    <Workflow size={16} className="text-accent" />
                    <span className="text-sm font-medium">{m.name}</span>
                  </button>
                  <span className="text-xs text-muted">{timeAgo(m.updatedAt)}</span>
                  <button
                    type="button"
                    onClick={() => startRename(m)}
                    className="text-muted hover:text-foreground"
                    aria-label="Rename"
                  >
                    <Pencil size={15} />
                  </button>
                  <button
                    type="button"
                    onClick={() => onDelete(m.id)}
                    className="text-muted hover:text-error"
                    aria-label="Delete"
                  >
                    <Trash2 size={15} />
                  </button>
                </>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
