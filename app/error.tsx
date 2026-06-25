"use client";

import { useEffect } from "react";
import { AlertTriangle } from "lucide-react";

/**
 * Route-level error boundary. Catches errors thrown while rendering the
 * server components (e.g. a transient Neon connection drop after dbRetry has
 * exhausted its attempts) and shows a graceful retry instead of a raw crash.
 */
export default function Error({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  // This Next version replaces `reset` with `unstable_retry`, which actually
  // re-fetches + re-renders the server component — required to recover from the
  // transient DB errors this boundary exists for (`reset` would not re-fetch).
  unstable_retry: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="flex h-dvh w-full flex-col items-center justify-center gap-3 bg-canvas px-6 text-center">
      <AlertTriangle size={28} className="text-error" />
      <p className="text-sm font-medium">Something went wrong</p>
      {/* Surface the raw error verbatim — no friendly decoration. */}
      <pre className="max-h-64 max-w-2xl overflow-auto whitespace-pre-wrap rounded border border-node-border bg-node p-3 text-left text-xs text-error">
        {error.message}
        {error.digest ? `\n\ndigest: ${error.digest}` : ""}
      </pre>
      <button
        type="button"
        onClick={() => unstable_retry()}
        className="mt-1 rounded-lg bg-accent px-3.5 py-2 text-sm font-medium text-white hover:opacity-90"
      >
        Try again
      </button>
    </main>
  );
}
