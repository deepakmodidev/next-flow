"use client";

import { useEffect, useState } from "react";
import { X, ChevronRight, ChevronDown, History } from "lucide-react";

interface NodeRunDTO {
  id: string;
  nodeId: string;
  type: string;
  status: string;
  durationMs?: number | null;
  inputs?: unknown;
  output?: unknown;
  error?: string | null;
}
interface RunDTO {
  id: string;
  status: string;
  scope: string;
  startedAt: string;
  durationMs?: number | null;
  nodeRuns: NodeRunDTO[];
}

const BADGE: Record<string, string> = {
  SUCCESS: "bg-success/15 text-success",
  FAILED: "bg-error/15 text-error",
  PARTIAL: "bg-warning/15 text-warning",
  RUNNING: "bg-accent/15 text-accent",
};

function badge(status: string) {
  return BADGE[status] ?? "bg-canvas text-muted";
}
function ms(d?: number | null) {
  return d == null ? "—" : d < 1000 ? `${d}ms` : `${(d / 1000).toFixed(1)}s`;
}
function fmtTime(iso?: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

// "inputs used" for the expanded node detail — a compact one-liner of the
// resolved input values (keys + short values), matching the spec's example.
function summarizeInputs(inputs: unknown): string {
  if (inputs == null || typeof inputs !== "object") return "";
  const entries = Object.entries(inputs as Record<string, unknown>);
  if (entries.length === 0) return "";
  return entries
    .map(([k, v]) => {
      if (v == null) return k;
      if (Array.isArray(v)) return `${k}: [${v.length}]`;
      if (typeof v === "string") {
        const s = v.length > 40 ? `${v.slice(0, 40)}…` : v;
        return `${k}: ${s}`;
      }
      if (typeof v === "object") return k;
      return `${k}: ${String(v)}`;
    })
    .join(", ");
}

function summarizeOutput(output: unknown): string {
  if (output == null) return "";
  if (typeof output === "object") {
    const o = output as Record<string, unknown>;
    if (typeof o.response === "string") return o.response;
    if (typeof o.outputImage === "string") return `image → ${o.outputImage}`;
    if ("result" in o)
      return typeof o.result === "string" ? o.result : JSON.stringify(o.result);
    return JSON.stringify(o);
  }
  return String(output);
}

export function HistorySidebar({
  workflowId,
  open,
  onClose,
}: {
  workflowId: string;
  open: boolean;
  onClose: () => void;
}) {
  const [runs, setRuns] = useState<RunDTO[]>([]);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [err, setErr] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!open) return;
    let active = true;
    // Reset is done in the fetch callbacks (not synchronously here) so the panel
    // shows a loader until the first response — never an empty-state flash.
    const load = () => {
      fetch(`/api/runs?workflowId=${encodeURIComponent(workflowId)}`)
        .then((r) => (r.ok ? r.json() : Promise.reject()))
        .then((d) => {
          if (!active) return;
          setRuns(d.runs ?? []);
          setErr(false);
          setLoaded(true);
        })
        .catch(() => {
          if (active) {
            setRuns([]);
            setErr(true);
            setLoaded(true);
          }
        });
    };
    load();
    const t = setInterval(load, 2000); // live-refresh while a run progresses
    return () => {
      active = false;
      clearInterval(t);
    };
  }, [open, workflowId]);

  if (!open) return null;

  return (
    <aside className="absolute right-0 top-0 z-20 flex h-full w-80 flex-col border-l border-node-border bg-node shadow-lg">
      <div className="flex items-center gap-2 border-b border-node-border px-4 py-3">
        <History size={16} />
        <span className="flex-1 text-sm font-medium">History</span>
        <button type="button" onClick={onClose} aria-label="Close">
          <X size={16} className="text-muted hover:text-foreground" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-3">
        {!loaded ? (
          <ul className="flex flex-col gap-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <li
                key={i}
                className="h-9 animate-pulse rounded-lg border border-node-border bg-canvas"
              />
            ))}
          </ul>
        ) : runs.length === 0 ? (
          <div className="mt-10 text-center text-xs text-muted">
            {err
              ? "Run history needs the database wired (DATABASE_URL)."
              : "No runs yet. Run the workflow to see history."}
          </div>
        ) : (
          <ul className="flex flex-col gap-2">
            {runs.map((run) => (
              <li
                key={run.id}
                className="rounded-lg border border-node-border"
              >
                <button
                  type="button"
                  onClick={() =>
                    setExpanded((e) => (e === run.id ? null : run.id))
                  }
                  className="flex w-full items-center gap-2 px-3 py-2 text-left"
                >
                  {expanded === run.id ? (
                    <ChevronDown size={14} />
                  ) : (
                    <ChevronRight size={14} />
                  )}
                  <span
                    className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${badge(run.status)}`}
                  >
                    {run.status}
                  </span>
                  <span className="flex flex-1 flex-col">
                    <span className="text-xs text-muted">{run.scope}</span>
                    <span className="text-[10px] text-muted/80">
                      {fmtTime(run.startedAt)}
                    </span>
                  </span>
                  <span className="text-xs text-muted">{ms(run.durationMs)}</span>
                </button>
                {expanded === run.id && (
                  <ul className="border-t border-node-border px-3 py-2">
                    {run.nodeRuns.map((nr) => (
                      <li key={nr.id} className="py-1.5 text-xs">
                        <div className="flex items-center gap-2">
                          <span
                            className={`rounded px-1 py-0.5 text-[10px] ${badge(nr.status)}`}
                          >
                            {nr.status}
                          </span>
                          <span className="flex-1 truncate font-medium">
                            {nr.type}
                          </span>
                          <span className="text-muted">{ms(nr.durationMs)}</span>
                        </div>
                        {summarizeInputs(nr.inputs) && (
                          <p className="mt-1 line-clamp-2 break-words text-[11px] text-muted">
                            <span className="text-foreground/60">inputs: </span>
                            {summarizeInputs(nr.inputs)}
                          </p>
                        )}
                        {nr.error ? (
                          <p className="mt-1 line-clamp-3 break-words text-[11px] text-error">
                            {nr.error}
                          </p>
                        ) : nr.output != null ? (
                          <p className="mt-1 line-clamp-3 break-words text-[11px] text-muted">
                            {summarizeOutput(nr.output)}
                          </p>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </aside>
  );
}
