// Shown while the workflow graph is fetched server-side. A canvas-colored
// placeholder keeps navigation seamless — no blank screen before the editor.
export default function WorkflowLoading() {
  return (
    <main className="flex h-dvh w-full items-center justify-center bg-canvas">
      <div className="flex items-center gap-2 text-sm text-muted">
        <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-node-border border-t-accent" />
        Loading workflow…
      </div>
    </main>
  );
}
