"use client";

import { useEffect, useMemo, useRef } from "react";
import { useRealtimeRunsWithTag } from "@trigger.dev/react-hooks";
import { useWorkflowStore } from "@/lib/store";
import {
  deriveRunState,
  mapTriggerStatus,
  type TaskRunState,
} from "@/lib/exec/realtime";

const STALL_MS = 180_000; // matches the server watchdog's STUCK_MS

/**
 * Live canvas state over Trigger.dev Realtime. Every node task is triggered with
 * a `wfrun:<runId>` tag, so one tag subscription streams the whole DAG — status,
 * metadata phase, and output — with no run-status polling anywhere.
 */
export function RunRealtime({
  runId,
  accessToken,
}: {
  runId: string;
  accessToken: string;
}) {
  const nodes = useWorkflowStore((s) => s.nodes);
  const edges = useWorkflowStore((s) => s.edges);
  const setNodeState = useWorkflowStore((s) => s.setNodeState);
  const setRunActive = useWorkflowStore((s) => s.setRunActive);

  const { runs, error } = useRealtimeRunsWithTag(`wfrun:${runId}`, {
    accessToken,
  });

  // Trigger runs are keyed by their `node:<id>` tag back onto canvas nodes.
  const tasks = useMemo(() => {
    const byNode: Record<string, TaskRunState> = {};
    for (const run of runs) {
      const nodeId = run.tags
        ?.find((t: string) => t.startsWith("node:"))
        ?.slice("node:".length);
      if (!nodeId) continue;
      const meta = run.metadata as { phase?: string } | undefined;
      byNode[nodeId] = {
        status: mapTriggerStatus(run.status),
        output: run.output,
        error: (run.error as { message?: string } | undefined)?.message ?? null,
        phase: meta?.phase,
      };
    }
    return byNode;
  }, [runs]);

  const derived = useMemo(
    () => deriveRunState(nodes, edges, tasks),
    [nodes, edges, tasks],
  );

  useEffect(() => {
    setNodeState(derived.nodeState);
    if (derived.done) setRunActive(false);
  }, [derived, setNodeState, setRunActive]);

  // A dead subscription would otherwise leave Run disabled forever.
  useEffect(() => {
    if (error) setRunActive(false);
  }, [error, setRunActive]);

  // If the stream goes quiet for longer than a node can legitimately take, the
  // worker died and no task will ever report. Read the run once — that hits the
  // server-side watchdog, which fails it with a real reason. One shot, not a poll.
  const reconciled = useRef(false);
  useEffect(() => {
    if (derived.done || reconciled.current) return;
    const t = setTimeout(async () => {
      reconciled.current = true;
      const res = await fetch(`/api/runs/${runId}`);
      if (!res.ok) return;
      const run = await res.json();
      const map: Record<string, { status: string; output?: unknown; error?: string | null }> = {};
      for (const n of run.nodeRuns ?? [])
        map[n.nodeId] = { status: n.status, output: n.output, error: n.error };
      setNodeState(map);
      if (run.status !== "RUNNING") setRunActive(false);
    }, STALL_MS);
    return () => clearTimeout(t);
  }, [derived, runId, setNodeState, setRunActive]);

  if (!error) return null;
  return (
    <div className="absolute left-1/2 top-16 z-20 max-w-md -translate-x-1/2 rounded-lg border border-node-border bg-node px-3 py-2 text-xs text-error shadow">
      Realtime: {error.message}
    </div>
  );
}
