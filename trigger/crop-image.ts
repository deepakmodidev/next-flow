import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import ffmpegStatic from "ffmpeg-static";
import { task, wait } from "@trigger.dev/sdk";
import { CROP_DELAY_SECONDS } from "@/lib/config";
import {
  onNodeStart,
  onNodeSuccess,
  onNodeFailure,
  resolveNodeInputs,
  scheduleDependents,
  maybeFinalizeRun,
} from "@/lib/exec/engine";

interface NodePayload {
  runId: string;
  nodeId: string;
  geminiApiKey?: string; // threaded through the DAG; never persisted
}

export const cropImageNode = task({
  id: "crop-image-node",
  run: async ({ runId, nodeId, geminiApiKey }: NodePayload) => {
    await onNodeStart(runId, nodeId);

    // MANDATORY: ≥30s durable wait before returning (README hard requirement).
    await wait.for({ seconds: CROP_DELAY_SECONDS });

    const inputs = await resolveNodeInputs(runId, nodeId);
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
  if (!url) throw new Error("Crop Image: no input image provided");
  const x = clamp(Number(inputs.x ?? 0));
  const y = clamp(Number(inputs.y ?? 0));
  const w = clamp(Number(inputs.w ?? 100));
  const h = clamp(Number(inputs.h ?? 100));

  const dir = await mkdtemp(join(tmpdir(), "nf-crop-"));
  const inPath = join(dir, "in.jpg");
  const outPath = join(dir, "out.jpg");
  try {
    const buf = Buffer.from(await (await fetch(url)).arrayBuffer());
    await writeFile(inPath, buf);

    // crop filter as % expressions of input dimensions
    const filter = `crop=in_w*${w}/100:in_h*${h}/100:in_w*${x}/100:in_h*${y}/100`;
    await runFfmpeg(["-y", "-i", inPath, "-vf", filter, outPath]);

    return await uploadImage(await readFile(outPath));
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

/** Re-upload the cropped image to Transloadit, return the CDN URL. */
async function uploadImage(buf: Buffer): Promise<string> {
  const key = process.env.NEXT_PUBLIC_TRANSLOADIT_KEY;
  if (!key) throw new Error("Crop Image: TRANSLOADIT key not configured");
  const params = {
    auth: { key },
    steps: { ":original": { robot: "/upload/handle", result: true } },
  };
  const form = new FormData();
  form.append("params", JSON.stringify(params));
  form.append("file", new Blob([new Uint8Array(buf)], { type: "image/jpeg" }), "crop.jpg");

  const res = await fetch("https://api2.transloadit.com/assemblies", {
    method: "POST",
    body: form,
  });
  let a = await res.json();
  let i = 0;
  while (a.assembly_ssl_url && a.ok !== "ASSEMBLY_COMPLETED" && !a.error && i++ < 30) {
    await new Promise((r) => setTimeout(r, 1000));
    a = await (await fetch(a.assembly_ssl_url)).json();
  }
  if (a.error) throw new Error("Transloadit: " + (a.message || a.error));
  const out = a.results?.[":original"]?.[0]?.ssl_url;
  if (!out) throw new Error("Transloadit returned no URL for cropped image");
  return out;
}
