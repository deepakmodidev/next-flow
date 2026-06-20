import type { NextRequest } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { z } from "zod";
import { prisma } from "@/lib/db";

const PatchSchema = z.object({
  name: z.string().optional(),
  graph: z
    .object({ nodes: z.array(z.any()), edges: z.array(z.any()) })
    .optional(),
});

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { userId } = await auth();
  if (!userId) return new Response("Unauthorized", { status: 401 });
  const { id } = await params;
  const w = await prisma.workflow.findFirst({ where: { id, userId } });
  if (!w) return new Response("Not found", { status: 404 });
  return Response.json({
    id: w.id,
    name: w.name,
    updatedAt: w.updatedAt.getTime(),
    graph: w.graph,
  });
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { userId } = await auth();
  if (!userId) return new Response("Unauthorized", { status: 401 });
  const { id } = await params;
  const parsed = PatchSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return Response.json({ error: "Invalid body" }, { status: 400 });
  }
  const data: { name?: string; graph?: object } = {};
  if (typeof parsed.data.name === "string") data.name = parsed.data.name;
  if (parsed.data.graph) data.graph = parsed.data.graph;
  await prisma.workflow.updateMany({ where: { id, userId }, data });
  return Response.json({ ok: true });
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { userId } = await auth();
  if (!userId) return new Response("Unauthorized", { status: 401 });
  const { id } = await params;
  await prisma.workflow.deleteMany({ where: { id, userId } });
  return Response.json({ ok: true });
}
