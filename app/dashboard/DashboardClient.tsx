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
import type { RunStatus } from "@/lib/contracts";

export interface WorkflowItem {
  id: string;
  name: string;
  updatedAt: number;
  lastStatus: RunStatus | null;
  lastRunAt: number | null;
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

const STATUS_STYLES: Record<
  RunStatus,
  { label: string; text: string; bg: string; dot: string; pulse?: boolean }
> = {
  RUNNING: { label: "Running", text: "text-accent", bg: "bg-accent/10", dot: "bg-accent", pulse: true },
  SUCCESS: { label: "Success", text: "text-success", bg: "bg-success/10", dot: "bg-success" },
  FAILED: { label: "Failed", text: "text-error", bg: "bg-error/10", dot: "bg-error" },
  PARTIAL: { label: "Partial", text: "text-warning", bg: "bg-warning/10", dot: "bg-warning" },
};

/** Latest-run status pill shown on each workflow row. */
function StatusBadge({ status }: { status: RunStatus | null }) {
  if (!status) {
    return <span className="text-[11px] text-muted/70">Not run yet</span>;
  }
  const s = STATUS_STYLES[status];
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-medium ${s.bg} ${s.text}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${s.dot} ${s.pulse ? "animate-pulse" : ""}`} />
      {s.label}
    </span>
  );
}

/**
 * Static header (title + create buttons). Renders immediately — it doesn't
 * depend on the workflow list, so it must NOT sit behind the data Suspense
 * boundary, or the buttons would skeleton needlessly on every load.
 */
export function DashboardHeader() {
  const router = useRouter();

  const onCreate = async () => {
    try {
      const wf = await createWorkflow();
      router.push(`/workflow/${wf.id}`);
    } catch (e) {
      alert(e instanceof Error ? e.message : String(e));
    }
  };

  const onCreateSample = async () => {
    try {
      const { name, nodes, edges } = buildSampleWorkflow();
      const wf = await createWorkflowFromGraph(name, { nodes, edges });
      router.push(`/workflow/${wf.id}`);
    } catch (e) {
      alert(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Workflows</h1>
        <p className="mt-1 text-sm text-muted">
          Build node-based AI workflows and run them live.
        </p>
      </div>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onCreateSample}
          className="rounded-lg border border-node-border bg-node px-3.5 py-2 text-sm font-medium text-foreground shadow-sm transition-colors hover:border-accent/40 hover:bg-canvas"
        >
          Sample workflow
        </button>
        <button
          type="button"
          onClick={onCreate}
          className="flex items-center gap-1.5 rounded-lg bg-accent px-3.5 py-2 text-sm font-medium text-white shadow-sm transition-opacity hover:opacity-90"
        >
          <Plus size={16} /> New Workflow
        </button>
      </div>
    </div>
  );
}

/**
 * The data-dependent list. Receives server-fetched items and owns the
 * mutations (rename / delete), revalidating via the router. This is the only
 * piece that should sit behind a Suspense/skeleton boundary.
 */
export function DashboardList({ items }: { items: WorkflowItem[] }) {
  const router = useRouter();
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [pending, startTransition] = useTransition();

  const onCreate = async () => {
    try {
      const wf = await createWorkflow();
      router.push(`/workflow/${wf.id}`);
    } catch (e) {
      alert(e instanceof Error ? e.message : String(e));
    }
  };

  const onDelete = async (id: string) => {
    if (!confirm("Delete this workflow?")) return;
    try {
      await deleteWorkflow(id);
      startTransition(() => router.refresh());
    } catch (e) {
      alert(e instanceof Error ? e.message : String(e));
    }
  };

  const startRename = (m: WorkflowItem) => {
    setEditing(m.id);
    setDraft(m.name);
  };
  const commitRename = async (id: string) => {
    const name = draft.trim();
    if (!name) {
      setEditing(null);
      return;
    }
    try {
      await renameWorkflow(id, name);
      setEditing(null); // only leave edit mode once the write actually succeeded
      startTransition(() => router.refresh());
    } catch (e) {
      alert(e instanceof Error ? e.message : String(e));
    }
  };

  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-node-border bg-node/50 py-16 text-center">
        <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-accent/10 text-accent">
          <Workflow size={24} />
        </span>
        <p className="mt-4 text-sm font-medium">No workflows yet</p>
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
    );
  }

  return (
    <ul
      className={`nf-elevate divide-y divide-node-border overflow-hidden rounded-xl border border-node-border bg-node ${pending ? "opacity-60" : ""}`}
    >
      {items.map((m) => (
        <li
          key={m.id}
          className="flex items-center gap-3 px-4 py-3.5 transition-colors hover:bg-canvas/60"
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
                className="flex flex-1 items-center gap-2.5 text-left"
              >
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-accent/10 text-accent">
                  <Workflow size={15} />
                </span>
                <span className="truncate text-sm font-medium">{m.name}</span>
              </button>
              <StatusBadge status={m.lastStatus} />
              <span className="w-24 shrink-0 text-right text-xs text-muted">
                {m.lastRunAt ? `ran ${timeAgo(m.lastRunAt)}` : `edited ${timeAgo(m.updatedAt)}`}
              </span>
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
  );
}
