import { task, metadata } from "@trigger.dev/sdk";
import { awaitAssembly } from "@/lib/transloadit";

/**
 * Watches a Transloadit assembly the browser already started. The browser does
 * a single POST to upload the bytes, then subscribes to this task with
 * `useRealtimeRun` — so the upload's progress reaches the UI over Realtime
 * instead of the client polling the assembly status URL.
 */
export const uploadImageWatch = task({
  id: "upload-image-watch",
  maxDuration: 120,
  run: async ({ statusUrl }: { statusUrl: string }) => {
    metadata.set("phase", "processing");
    const url = await awaitAssembly(statusUrl);
    metadata.set("phase", "done");
    return { url };
  },
});
