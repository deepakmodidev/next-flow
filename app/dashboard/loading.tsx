// Shown while the dashboard server component fetches workflows. Mirrors the real
// layout (header lives in the layout, above) so navigation never blanks out.
export default function DashboardLoading() {
  return (
    <div className="mx-auto w-full max-w-3xl flex-1 px-6 py-10">
      <div className="mb-8 flex items-end justify-between">
        <div>
          <div className="h-7 w-24 animate-pulse rounded bg-canvas" />
          <div className="mt-2 h-4 w-56 animate-pulse rounded bg-canvas" />
        </div>
        <div className="flex items-center gap-2">
          <div className="h-9 w-32 animate-pulse rounded-lg bg-canvas" />
          <div className="h-9 w-36 animate-pulse rounded-lg bg-canvas" />
        </div>
      </div>

      <div className="mb-3 h-4 w-28 animate-pulse rounded bg-canvas" />

      <ul className="divide-y divide-node-border overflow-hidden rounded-node border border-node-border bg-node">
        {Array.from({ length: 4 }).map((_, i) => (
          <li key={i} className="flex items-center gap-3 px-4 py-3">
            <div className="h-4 w-4 animate-pulse rounded bg-canvas" />
            <div className="h-4 flex-1 animate-pulse rounded bg-canvas" />
            <div className="h-3 w-14 animate-pulse rounded bg-canvas" />
          </li>
        ))}
      </ul>
    </div>
  );
}
