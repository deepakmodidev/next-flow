"use client";

import { Play, MoreHorizontal, Trash2 } from "lucide-react";
import { useState } from "react";
import { useWorkflowStore } from "@/lib/store";

/**
 * Shared white card chrome for every node: header (title + Run + menu) and body.
 * Matches the measured Magica node anatomy (BUILD_PLAN.md §4).
 */
export function NodeShell({
  nodeId,
  title,
  icon,
  running,
  executable = true,
  deletable = true,
  headerExtra,
  children,
  width = 260,
}: {
  nodeId: string;
  title: string;
  icon?: React.ReactNode;
  running?: boolean;
  executable?: boolean;
  deletable?: boolean;
  headerExtra?: React.ReactNode;
  children: React.ReactNode;
  width?: number;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const removeNode = useWorkflowStore((s) => s.removeNode);
  const runScoped = useWorkflowStore((s) => s.runScoped);
  const runActive = useWorkflowStore((s) => s.runActive);

  return (
    <div
      className={`rounded-node border border-node-border bg-node text-foreground shadow-sm ${
        running ? "nf-node-running" : ""
      }`}
      style={{ width }}
    >
      {/* Header */}
      <div className="flex items-center gap-2 border-b border-node-border px-3 py-2">
        {icon}
        <span className="flex-1 truncate text-sm font-medium">{title}</span>
        {executable && (
          <button
            type="button"
            onClick={() => runScoped("SINGLE", [nodeId])}
            disabled={runActive}
            title="Run just this node"
            className="inline-flex items-center gap-1 rounded-full bg-accent px-2.5 py-1 text-xs font-medium text-white hover:opacity-90 disabled:opacity-50"
          >
            <Play size={11} fill="currentColor" />
            Run
          </button>
        )}
        <div className="relative">
          <button
            type="button"
            onClick={() => setMenuOpen((o) => !o)}
            className="rounded p-1 text-muted hover:bg-canvas"
            aria-label="Node menu"
          >
            <MoreHorizontal size={16} />
          </button>
          {menuOpen && (
            <div className="absolute right-0 top-7 z-10 w-32 rounded-lg border border-node-border bg-node py-1 shadow-md">
              {deletable ? (
                <button
                  type="button"
                  onClick={() => {
                    setMenuOpen(false);
                    removeNode(nodeId);
                  }}
                  className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs text-error hover:bg-canvas"
                >
                  <Trash2 size={13} /> Delete
                </button>
              ) : (
                <span className="block px-3 py-1.5 text-xs text-muted">
                  Cannot delete
                </span>
              )}
            </div>
          )}
        </div>
      </div>

      {headerExtra}

      {/* Body */}
      <div className="flex flex-col gap-3 px-3 py-3">{children}</div>
    </div>
  );
}

/** A field label with an optional required asterisk. */
export function FieldLabel({
  children,
  required,
}: {
  children: React.ReactNode;
  required?: boolean;
}) {
  return (
    <label className="text-xs font-medium text-muted">
      {children}
      {required && <span className="text-required"> *</span>}
    </label>
  );
}
