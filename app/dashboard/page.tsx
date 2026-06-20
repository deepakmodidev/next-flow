import { Suspense } from "react";
import { auth } from "@clerk/nextjs/server";
import { prisma, dbRetry } from "@/lib/db";
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
      <h2 className="mb-3 text-sm font-medium text-muted">Your Workflows</h2>
      <Suspense fallback={<ListSkeleton />}>
        <WorkflowListSection />
      </Suspense>
    </div>
  );
}

/** Auth-scoped fetch of the user's workflows + which are currently running. */
async function WorkflowListSection() {
  const { userId } = await auth();
  const [rows, activeRuns] = userId
    ? await dbRetry(() =>
        Promise.all([
          prisma.workflow.findMany({
            where: { userId },
            orderBy: { updatedAt: "desc" },
            select: { id: true, name: true, updatedAt: true },
          }),
          prisma.run.findMany({
            where: { userId, status: "RUNNING" },
            select: { workflowId: true },
            distinct: ["workflowId"],
          }),
        ]),
      )
    : [[], []];

  const running = new Set(activeRuns.map((r) => r.workflowId));
  const items: WorkflowItem[] = rows.map((w) => ({
    id: w.id,
    name: w.name,
    updatedAt: w.updatedAt.getTime(),
    running: running.has(w.id),
  }));

  return <DashboardList items={items} />;
}

/** List-only skeleton — the header and headings are already on screen. */
function ListSkeleton() {
  return (
    <ul className="divide-y divide-node-border overflow-hidden rounded-node border border-node-border bg-node">
      {Array.from({ length: 4 }).map((_, i) => (
        <li key={i} className="flex items-center gap-3 px-4 py-3">
          <div className="h-4 w-4 animate-pulse rounded bg-canvas" />
          <div className="h-4 flex-1 animate-pulse rounded bg-canvas" />
          <div className="h-3 w-14 animate-pulse rounded bg-canvas" />
        </li>
      ))}
    </ul>
  );
}
