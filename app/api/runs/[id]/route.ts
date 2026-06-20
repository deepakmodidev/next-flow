import type { NextRequest } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/db";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { userId } = await auth();
  if (!userId) return new Response("Unauthorized", { status: 401 });
  const { id } = await params;
  const run = await prisma.run.findFirst({
    where: { id, userId },
    include: { nodeRuns: true },
  });
  if (!run) return new Response("Not found", { status: 404 });
  return Response.json({
    id: run.id,
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
