import type { NextRequest } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { z } from "zod";
import { prisma, dbRetry } from "@/lib/db";
import { seedNodes } from "@/lib/nodeFactory";

const GraphSchema = z.object({
  nodes: z.array(z.any()),
  edges: z.array(z.any()),
});
const CreateSchema = z.object({
  name: z.string().max(200).optional(),
  graph: GraphSchema.optional(),
});

export async function GET() {
  const { userId } = await auth();
  if (!userId) return new Response("Unauthorized", { status: 401 });
  const workflows = await dbRetry(() =>
    prisma.workflow.findMany({
      where: { userId },
      orderBy: { updatedAt: "desc" },
      select: { id: true, name: true, updatedAt: true },
    }),
  );
  return Response.json({
    workflows: workflows.map((w) => ({
      id: w.id,
      name: w.name,
      updatedAt: w.updatedAt.getTime(),
    })),
  });
}

export async function POST(request: NextRequest) {
  const { userId } = await auth();
  if (!userId) return new Response("Unauthorized", { status: 401 });

  const parsed = CreateSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return Response.json({ error: "Invalid body" }, { status: 400 });
  }
  const graph = parsed.data.graph ?? { nodes: seedNodes(), edges: [] };
  // Not wrapped in dbRetry: create is non-idempotent — a retry after a
  // committed-but-dropped insert would create a duplicate workflow.
  const w = await prisma.workflow.create({
    data: {
      userId,
      name: parsed.data.name ?? "Untitled workflow",
      graph: graph as object,
    },
  });
  return Response.json({
    id: w.id,
    name: w.name,
    updatedAt: w.updatedAt.getTime(),
    graph: w.graph,
  });
}
