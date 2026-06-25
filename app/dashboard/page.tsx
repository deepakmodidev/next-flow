import { Suspense } from "react";
import { auth } from "@clerk/nextjs/server";
import { prisma, dbRetry } from "@/lib/db";
import { runIsStale, failStaleRun } from "@/lib/exec/engine";
import {
  DashboardHeader,
  DashboardList,
  type WorkflowItem,
} from "./DashboardClient";

/**
 * Dashboard. The static chrome (title + create buttons + section heading)
 * renders in the first paint with no skeleton — only the workflow list, which
 * needs the DB, sits behind a Suspense boundary and streams in. So a load never
 * blanks the header; just the list shows a skeleton until the query resolves.
 */
export default function DashboardPage() {
  return (
    <div className="mx-auto w-full max-w-3xl flex-1 px-6 py-10">
      <DashboardHeader />
      <Suspense fallback={<ListSkeleton />}>
        <WorkflowListSection />
      </Suspense>
    </div>
  );
}

/** Auth-scoped fetch of the user's workflows + each one's latest run status. */
async function WorkflowListSection() {
  const { userId } = await auth();
  if (!userId) return <DashboardList items={[]} />;

  const [workflows, latestRuns] = await dbRetry(() =>
    Promise.all([
      prisma.workflow.findMany({
        where: { userId },
        orderBy: { updatedAt: "desc" },
        select: { id: true, name: true, updatedAt: true },
      }),
      // One row per workflow: its most recent run (with node timestamps so the
      // watchdog can tell a live run from a stalled one).
      prisma.run.findMany({
        where: { userId },
        orderBy: { startedAt: "desc" },
        distinct: ["workflowId"],
        select: {
          id: true,
          workflowId: true,
          status: true,
          startedAt: true,
          finishedAt: true,
          nodeRuns: { select: { startedAt: true, finishedAt: true } },
        },
      }),
    ]),
  );

  // Watchdog: never show a phantom "Running" for a run whose worker has died.
  // The reconcile write is best-effort — if it fails (transient DB blip), we'd
  // rather degrade to showing a stale "Running" than error the whole page.
  for (const r of latestRuns) {
    if (r.status === "RUNNING" && runIsStale(r)) {
      try {
        await dbRetry(() => failStaleRun(r.id));
        r.status = "FAILED";
        r.finishedAt = new Date();
      } catch (e) {
        console.error("failStaleRun reconcile failed", e);
      }
    }
  }

  const byWorkflow = new Map(latestRuns.map((r) => [r.workflowId, r]));
  const items: WorkflowItem[] = workflows.map((w) => {
    const r = byWorkflow.get(w.id);
    return {
      id: w.id,
      name: w.name,
      updatedAt: w.updatedAt.getTime(),
      lastStatus: r?.status ?? null,
      lastRunAt: r ? (r.finishedAt ?? r.startedAt).getTime() : null,
    };
  });

  return <DashboardList items={items} />;
}

/** List-only skeleton — the header and headings are already on screen. */
function ListSkeleton() {
  return (
    <ul className="nf-elevate divide-y divide-node-border overflow-hidden rounded-xl border border-node-border bg-node">
      {Array.from({ length: 4 }).map((_, i) => (
        <li key={i} className="flex items-center gap-3 px-4 py-3.5">
          <div className="h-7 w-7 animate-pulse rounded-lg bg-canvas" />
          <div className="h-4 flex-1 animate-pulse rounded bg-canvas" />
          <div className="h-5 w-16 animate-pulse rounded-full bg-canvas" />
          <div className="h-3 w-14 animate-pulse rounded bg-canvas" />
        </li>
      ))}
    </ul>
  );
}
