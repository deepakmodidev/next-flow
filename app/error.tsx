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
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  const isDb = /reach database|ETIMEDOUT|connection|Closed the connection/i.test(
    error.message,
  );

  return (
    <main className="flex h-dvh w-full flex-col items-center justify-center gap-3 bg-canvas px-6 text-center">
      <AlertTriangle size={28} className="text-warning" />
      <p className="text-sm font-medium">
        {isDb ? "Couldn't reach the database" : "Something went wrong"}
      </p>
      <p className="max-w-sm text-xs text-muted">
        {isDb
          ? "The database may be waking up or temporarily unavailable. Try again in a moment."
          : "An unexpected error occurred while loading this page."}
      </p>
      <button
        type="button"
        onClick={reset}
        className="mt-1 rounded-lg bg-accent px-3.5 py-2 text-sm font-medium text-white hover:opacity-90"
      >
        Try again
      </button>
    </main>
  );
}
