import type { NextRequest } from "next/server";
import { auth as clerkAuth } from "@clerk/nextjs/server";
import { auth, tasks } from "@trigger.dev/sdk";
import { z } from "zod";
import { isAssemblyStatusUrl } from "@/lib/transloadit";

const Schema = z.object({ statusUrl: z.string().url() });

/**
 * Hands a browser-started Transloadit assembly to a Trigger.dev task and returns
 * a run-scoped token so the uploader can watch it with Realtime.
 */
export async function POST(request: NextRequest) {
  const { userId } = await clerkAuth();
  if (!userId) return new Response("Unauthorized", { status: 401 });

  const parsed = Schema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return new Response("Invalid request", { status: 400 });
  const { statusUrl } = parsed.data;
  // The URL comes from the client — only ever fetch Transloadit with it.
  if (!isAssemblyStatusUrl(statusUrl))
    return new Response("Not a Transloadit assembly URL", { status: 400 });

  const handle = await tasks.trigger("upload-image-watch", { statusUrl });
  const publicAccessToken = await auth.createPublicToken({
    scopes: { read: { runs: [handle.id] } },
    expirationTime: "1hr",
  });
  return Response.json({ runId: handle.id, publicAccessToken });
}
