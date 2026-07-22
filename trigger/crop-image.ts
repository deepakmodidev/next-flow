import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import ffmpegStatic from "ffmpeg-static";
import { task, wait, metadata, AbortTaskRunError } from "@trigger.dev/sdk";
import { CROP_DELAY_SECONDS } from "@/lib/config";
import { uploadToTransloadit } from "@/lib/transloadit";
import {
  alreadySucceeded,
  onNodeStart,
  onNodeSuccess,
  onNodeFailure,
  resolveNodeInputs,
  recordNodeInputs,
  scheduleDependents,
  maybeFinalizeRun,
} from "@/lib/exec/engine";

interface NodePayload {
  runId: string;
  nodeId: string;
  geminiApiKey?: string; // threaded through the DAG (transits Trigger.dev payloads; not stored in our DB)
}

export const cropImageNode = task({
  id: "crop-image-node",
  run: async ({ runId, nodeId, geminiApiKey }: NodePayload) => {
    // Retry-after-success guard: don't re-run ffmpeg + re-upload on a replay.
    const done = await alreadySucceeded(runId, nodeId);
    if (done) return done.output as { outputImage: string };

    await onNodeStart(runId, nodeId);

    // Phases stream to the canvas over Realtime, so the mandatory 30s delay
    // reads as live progress instead of a frozen node.
    metadata.set("phase", "waiting");
    metadata.set("delaySeconds", CROP_DELAY_SECONDS);
    await wait.for({ seconds: CROP_DELAY_SECONDS });

    metadata.set("phase", "cropping");
    const inputs = await resolveNodeInputs(runId, nodeId);
    await recordNodeInputs(runId, nodeId, inputs);
    const outputImage = await cropImage(inputs);
    const output = { outputImage };

    await onNodeSuccess(runId, nodeId, output);
    await scheduleDependents(runId, nodeId, geminiApiKey);
    return output;
  },
  onFailure: async ({ payload, error }) => {
    await onNodeFailure(payload.runId, payload.nodeId, error);
    await maybeFinalizeRun(payload.runId);
  },
});

/** FFmpeg crop using x/y/w/h percentages (0–100), then re-upload → URL. */
async function cropImage(inputs: Record<string, unknown>): Promise<string> {
  const url = inputs.inputImage as string | undefined;
  // Missing input is deterministic — abort instead of burning the retry budget.
  if (!url) throw new AbortTaskRunError("Crop Image: no input image provided");
  const x = clamp(Number(inputs.x ?? 0));
  const y = clamp(Number(inputs.y ?? 0));
  // Keep the region inside the frame (x+w, y+h ≤ 100) so ffmpeg doesn't fail
  // with "Invalid too big or non positive size".
  const w = Math.min(clamp(Number(inputs.w ?? 100)), 100 - x);
  const h = Math.min(clamp(Number(inputs.h ?? 100)), 100 - y);

  const dir = await mkdtemp(join(tmpdir(), "nf-crop-"));
  const inPath = join(dir, "in.jpg");
  const outPath = join(dir, "out.jpg");
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 15_000);
    let res: Response;
    try {
      res = await fetch(url, { signal: ctrl.signal });
    } finally {
      clearTimeout(timer);
    }
    if (!res.ok)
      throw new Error(`Crop Image: couldn't fetch input image (${res.status})`);
    const buf = Buffer.from(await res.arrayBuffer());
    await writeFile(inPath, buf);

    // crop filter as % expressions of input dimensions
    const filter = `crop=in_w*${w}/100:in_h*${h}/100:in_w*${x}/100:in_h*${y}/100`;
    await runFfmpeg(["-y", "-i", inPath, "-vf", filter, outPath]);

    metadata.set("phase", "uploading");
    const out = await readFile(outPath);
    return await uploadToTransloadit(
      new Blob([new Uint8Array(out)], { type: "image/jpeg" }),
      "crop.jpg",
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

function clamp(n: number): number {
  return Number.isFinite(n) ? Math.max(0, Math.min(100, n)) : 0;
}

function runFfmpeg(args: string[]): Promise<void> {
  const bin = ffmpegStatic || process.env.FFMPEG_PATH || "ffmpeg";
  return new Promise((resolve, reject) => {
    const p = spawn(bin, args);
    let err = "";
    p.stderr.on("data", (d) => (err += d.toString()));
    p.on("error", reject);
    p.on("close", (code) =>
      code === 0
        ? resolve()
        : reject(new Error("ffmpeg failed: " + err.slice(-300))),
    );
  });
}
