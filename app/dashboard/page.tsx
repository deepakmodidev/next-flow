import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/db";
import { DashboardClient, type WorkflowItem } from "./DashboardClient";

/**
 * Dashboard — workflows are fetched server-side (auth-scoped) and rendered into
 * the first paint, so there is no empty-state flash. The client island only
 * handles mutations (create / rename / delete) and re-validates via the router.
 */
export default async function DashboardPage() {
  const { userId } = await auth();
  const rows = userId
    ? await prisma.workflow.findMany({
        where: { userId },
        orderBy: { updatedAt: "desc" },
        select: { id: true, name: true, updatedAt: true },
      })
    : [];

  const items: WorkflowItem[] = rows.map((w) => ({
    id: w.id,
    name: w.name,
    updatedAt: w.updatedAt.getTime(),
  }));

  return <DashboardClient items={items} />;
}
