import type { NextRequest } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { prisma, dbRetry } from "@/lib/db";
import { runIsStale, failStaleRun, runAccessToken } from "@/lib/exec/engine";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { userId } = await auth();
  if (!userId) return new Response("Unauthorized", { status: 401 });
  const { id } = await params;
  let run = await dbRetry(() =>
    prisma.run.findFirst({
      where: { id, userId },
      include: { nodeRuns: true },
    }),
  );
  if (!run) return new Response("Not found", { status: 404 });

  // Watchdog: if the run has stalled (worker died/unavailable), fail it now so
  // the canvas stops polling and shows a real error instead of hanging. The
  // write is best-effort — a transient blip should not 500 the poll.
  if (runIsStale(run)) {
    const staleId = run.id;
    try {
      await dbRetry(() => failStaleRun(staleId));
      run =
        (await dbRetry(() =>
          prisma.run.findFirst({
            where: { id, userId },
            include: { nodeRuns: true },
          }),
        )) ?? run;
    } catch (e) {
      console.error("failStaleRun reconcile failed", e);
    }
  }
  return Response.json({
    id: run.id,
    // Lets the canvas re-subscribe over Realtime to a run that was already
    // going when the page loaded (reload / started in another tab).
    publicAccessToken:
      run.status === "RUNNING" ? await runAccessToken(run.id) : undefined,
    status: run.status,
    scope: run.scope,
    startedAt: run.startedAt,
    durationMs: run.durationMs,
    nodeRuns: run.nodeRuns.map((n) => ({
      nodeId: n.nodeId,
      type: n.type,
      status: n.status,
      inputs: n.inputs,
      output: n.output,
      error: n.error,
      durationMs: n.durationMs,
    })),
  });
}
