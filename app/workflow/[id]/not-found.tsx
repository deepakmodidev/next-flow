import Link from "next/link";

// Rendered when a workflow id doesn't exist or isn't owned by the signed-in
// user (the server page calls notFound()).
export default function WorkflowNotFound() {
  return (
    <main className="flex h-dvh w-full flex-col items-center justify-center gap-3 bg-canvas text-center">
      <p className="text-sm font-medium">Workflow not found</p>
      <p className="text-xs text-muted">
        It may have been deleted, or you don&apos;t have access to it.
      </p>
      <Link
        href="/dashboard"
        className="mt-1 rounded-lg bg-accent px-3.5 py-2 text-sm font-medium text-white hover:opacity-90"
      >
        Back to dashboard
      </Link>
    </main>
  );
}
