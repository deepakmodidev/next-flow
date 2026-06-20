import { notFound } from "next/navigation";
import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/db";
import { WorkflowCanvas } from "@/components/canvas/WorkflowCanvas";
import type { WorkflowGraph } from "@/lib/workflows";

/**
 * Workflow builder canvas. The graph is fetched server-side (auth-scoped) and
 * passed to the canvas as initial props, so it renders fully on first paint —
 * no empty-canvas flash, no client round-trip. In Next 16 `params` is a Promise.
 */
export default async function WorkflowPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { userId } = await auth();
  const wf = userId
    ? await prisma.workflow.findFirst({ where: { id, userId } })
    : null;
  if (!wf) notFound();

  const graph = wf.graph as unknown as WorkflowGraph;
  return (
    <main className="h-dvh w-full">
      <WorkflowCanvas
        workflowId={id}
        initialGraph={{ nodes: graph.nodes ?? [], edges: graph.edges ?? [] }}
        initialName={wf.name}
      />
    </main>
  );
}
