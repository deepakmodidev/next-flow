import type { NextRequest } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { z } from "zod";
import { prisma, dbRetry } from "@/lib/db";
import { startRun } from "@/lib/exec/engine";

const StartRunSchema = z
  .object({
    workflowId: z.string().min(1),
    scope: z.enum(["FULL", "PARTIAL", "SINGLE"]),
    targetNodeIds: z.array(z.string()).default([]),
    // BYOK — passed straight to the run. Not persisted in our own DB, though it
    // does transit the Trigger.dev task payload in order to reach the worker.
    geminiApiKey: z.string().optional(),
  })
  // A PARTIAL/SINGLE run with no target nodes would silently fall back to
  // running the whole graph — require an explicit target list for those scopes.
  .refine((d) => d.scope === "FULL" || d.targetNodeIds.length > 0, {
    message: "targetNodeIds must be non-empty when scope is not FULL",
    path: ["targetNodeIds"],
  });

export async function POST(request: NextRequest) {
  const { userId } = await auth();
  if (!userId) return new Response("Unauthorized", { status: 401 });

  const parsed = StartRunSchema.safeParse(
    await request.json().catch(() => ({})),
  );
  if (!parsed.success) {
    return Response.json(
      { error: "Invalid request", issues: parsed.error.issues },
      { status: 400 },
    );
  }
  const { workflowId, scope, targetNodeIds, geminiApiKey } = parsed.data;

  // Only the workflow's owner may run it.
  const owns = await dbRetry(() =>
    prisma.workflow.findFirst({
      where: { id: workflowId, userId },
      select: { id: true },
    }),
  );
  if (!owns) return new Response("Not found", { status: 404 });

  try {
    const { runId } = await startRun(
      workflowId,
      scope,
      targetNodeIds,
      geminiApiKey,
    );
    return Response.json({ runId });
  } catch (e) {
    // Surface the raw error (Next hides 500 details in prod, so return it
    // explicitly); the client shows res.text() verbatim.
    const msg = e instanceof Error ? e.message : String(e);
    return new Response(msg, { status: 503 });
  }
}

export async function GET(request: NextRequest) {
  const { userId } = await auth();
  if (!userId) return new Response("Unauthorized", { status: 401 });

  const workflowId = request.nextUrl.searchParams.get("workflowId");
  // Scope to the signed-in user's own runs (history is per-user). Wrapped in
  // dbRetry so a Neon cold-start/connection blip doesn't 500 the poll.
  const runs = await dbRetry(() =>
    prisma.run.findMany({
      where: { userId, ...(workflowId ? { workflowId } : {}) },
      orderBy: { startedAt: "desc" },
      take: 50,
      include: { nodeRuns: true },
    }),
  );
  return Response.json({ runs });
}
