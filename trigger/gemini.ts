import { task } from "@trigger.dev/sdk";
import { runGemini } from "@/lib/gemini";
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
  geminiApiKey?: string; // BYOK, threaded through the DAG; never persisted
}

export const geminiNode = task({
  id: "gemini-node",
  run: async ({ runId, nodeId, geminiApiKey }: NodePayload) => {
    await onNodeStart(runId, nodeId);

    const inputs = await resolveNodeInputs(runId, nodeId);
    const raw = inputs.image;
    const imageUrls = (Array.isArray(raw) ? raw : raw ? [raw] : []).map(String);

    if (inputs.prompt === undefined)
      throw new Error("Gemini node requires a prompt input");

    const output = await runGemini({
      prompt: String(inputs.prompt),
      systemPrompt: inputs.systemPrompt
        ? String(inputs.systemPrompt)
        : undefined,
      imageUrls,
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
