import { task, metadata, AbortTaskRunError } from "@trigger.dev/sdk";
import { runGemini } from "@/lib/gemini";
import type { GeminiSettings } from "@/lib/contracts";
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
  geminiApiKey?: string; // BYOK, threaded through the DAG (transits Trigger.dev payloads; not stored in our DB)
}

export const geminiNode = task({
  id: "gemini-node",
  run: async ({ runId, nodeId, geminiApiKey }: NodePayload) => {
    // Retry-after-success guard: if this task already succeeded and is replaying
    // on a transient retry, return the stored output instead of re-running the
    // (paid) Gemini call.
    const done = await alreadySucceeded(runId, nodeId);
    if (done) return done.output;

    await onNodeStart(runId, nodeId);

    metadata.set("phase", "resolving inputs");
    const inputs = await resolveNodeInputs(runId, nodeId);
    await recordNodeInputs(runId, nodeId, inputs);
    const raw = inputs.image;
    const imageUrls = (Array.isArray(raw) ? raw : raw ? [raw] : []).map(String);

    // Missing prompt is a deterministic error — abort instead of retrying 3×.
    if (inputs.prompt === undefined)
      throw new AbortTaskRunError("Gemini node requires a prompt input");

    metadata.set("phase", "generating");
    const output = await runGemini({
      prompt: String(inputs.prompt),
      systemPrompt: inputs.systemPrompt
        ? String(inputs.systemPrompt)
        : undefined,
      imageUrls,
      model: inputs.model ? String(inputs.model) : undefined,
      settings: inputs.settings as GeminiSettings | undefined,
      apiKey: geminiApiKey,
    });

    await onNodeSuccess(runId, nodeId, output);
    await scheduleDependents(runId, nodeId, geminiApiKey);
    return output;
  },
  onFailure: async ({ payload, error }) => {
    await onNodeFailure(payload.runId, payload.nodeId, error);
    await maybeFinalizeRun(payload.runId);
  },
});
