"use client";

import { useRef } from "react";
import Link from "next/link";
import { ArrowLeft, Download, Upload, Play, Loader2, History } from "lucide-react";
import { useWorkflowStore } from "@/lib/store";
import { exportWorkflow, parseWorkflowImport } from "@/lib/graphIO";
import type { AppNode } from "@/lib/nodeFactory";

export function TopBar({
  onOpenHistory,
  onToggleHistory,
  historyOpen,
}: {
  onOpenHistory: () => void;
  onToggleHistory: () => void;
  historyOpen: boolean;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const name = useWorkflowStore((s) => s.name);
  const setName = useWorkflowStore((s) => s.setName);
  const nodes = useWorkflowStore((s) => s.nodes);
  const edges = useWorkflowStore((s) => s.edges);
  const setGraph = useWorkflowStore((s) => s.setGraph);
  const runScoped = useWorkflowStore((s) => s.runScoped);
  const runActive = useWorkflowStore((s) => s.runActive);

  const onImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const wf = parseWorkflowImport(await file.text());
      setGraph(wf.nodes as AppNode[], wf.edges, wf.name);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Invalid workflow file");
    }
    e.target.value = "";
  };

  const runWorkflow = async () => {
    // Selected nodes → partial run; otherwise the whole workflow.
    const selected = nodes.filter((n) => n.selected).map((n) => n.id);
    onOpenHistory();
    await runScoped(selected.length ? "PARTIAL" : "FULL", selected);
  };

  return (
    <div className="absolute left-0 right-0 top-0 z-10 flex items-center gap-3 border-b border-node-border bg-node/90 px-4 py-2 backdrop-blur">
      <Link href="/dashboard" className="text-muted hover:text-foreground" aria-label="Back">
        <ArrowLeft size={18} />
      </Link>
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        className="min-w-0 flex-1 bg-transparent text-sm font-medium outline-none"
        aria-label="Workflow name"
      />

      <input
        ref={fileRef}
        type="file"
        accept="application/json"
        onChange={onImport}
        className="hidden"
      />
      <button
        type="button"
        onClick={() => fileRef.current?.click()}
        className="flex items-center gap-1 rounded-md border border-node-border px-2.5 py-1.5 text-xs text-muted hover:text-foreground"
      >
        <Upload size={13} /> Import
      </button>
      <button
        type="button"
        onClick={() => exportWorkflow(name, nodes, edges)}
        className="flex items-center gap-1 rounded-md border border-node-border px-2.5 py-1.5 text-xs text-muted hover:text-foreground"
      >
        <Download size={13} /> Export
      </button>
      <button
        type="button"
        onClick={onToggleHistory}
        title="Toggle run history"
        className={`flex items-center gap-1 rounded-md border px-2.5 py-1.5 text-xs ${
          historyOpen
            ? "border-accent text-accent"
            : "border-node-border text-muted hover:text-foreground"
        }`}
      >
        <History size={13} /> History
      </button>
      <button
        type="button"
        onClick={runWorkflow}
        disabled={runActive}
        title="Run selected nodes, or the whole workflow"
        className="flex items-center gap-1 rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-white hover:opacity-90 disabled:opacity-50"
      >
        {runActive ? (
          <Loader2 size={13} className="animate-spin" />
        ) : (
          <Play size={13} fill="currentColor" />
        )}
        {runActive ? "Running" : "Run"}
      </button>
    </div>
  );
}
