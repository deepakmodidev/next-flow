import { WorkflowCanvas } from "@/components/canvas/WorkflowCanvas";

/**
 * Workflow builder canvas. In Next 16 `params` is a Promise (see BUILD_PLAN
 * breaking-changes notes). DB loading + Clerk auth wrap this once keys exist;
 * for now it opens a fresh canvas with the pre-placed nodes.
 */
export default async function WorkflowPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <main className="h-dvh w-full">
      <WorkflowCanvas workflowId={id} />
    </main>
  );
}
