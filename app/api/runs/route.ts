import type { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { startRun } from "@/lib/exec/engine";

const StartRunSchema = z.object({
  workflowId: z.string().min(1),
  scope: z.enum(["FULL", "PARTIAL", "SINGLE"]),
  targetNodeIds: z.array(z.string()).default([]),
  geminiApiKey: z.string().optional(), // BYOK — passed straight to the run, not stored
});

export async function POST(request: NextRequest) {
  const parsed = StartRunSchema.safeParse(await request.json());
  if (!parsed.success) {
    return Response.json(
      { error: "Invalid request", issues: parsed.error.issues },
      { status: 400 },
    );
  }
  const { workflowId, scope, targetNodeIds, geminiApiKey } = parsed.data;
  const { runId } = await startRun(workflowId, scope, targetNodeIds, geminiApiKey);
  return Response.json({ runId });
}

export async function GET(request: NextRequest) {
  const workflowId = request.nextUrl.searchParams.get("workflowId");
  const runs = await prisma.run.findMany({
    where: workflowId ? { workflowId } : undefined,
    orderBy: { startedAt: "desc" },
    take: 50,
    include: { nodeRuns: true },
  });
  return Response.json({ runs });
}
