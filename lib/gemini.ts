import { GoogleGenAI } from "@google/genai";
import { GEMINI_MODEL } from "@/lib/config";
import { assertFetchableUrl } from "@/lib/transloadit";
import type { GeminiSettings } from "@/lib/contracts";

/**
 * Gemini wrapper using the current @google/genai SDK (the legacy
 * @google/generative-ai is EOL — see BUILD_PLAN.md §7).
 */

type Part = { text: string } | { inlineData: { mimeType: string; data: string } };

let client: GoogleGenAI | null = null;
function ai(): GoogleGenAI {
  if (!client) client = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  return client;
}

function guessMime(url: string): string {
  const ext = url.split("?")[0].split(".").pop()?.toLowerCase();
  switch (ext) {
    case "png":
      return "image/png";
    case "webp":
      return "image/webp";
    case "gif":
      return "image/gif";
    default:
      return "image/jpeg";
  }
}

async function imagePart(url: string): Promise<Part> {
  assertFetchableUrl(url, "Gemini image");
  // Bound the fetch (Node fetch has no default timeout, so a hung host would
  // otherwise stall the node past the task maxDuration) and reject non-OK
  // responses so a 404 HTML page isn't base64'd and sent to Gemini as an image.
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 15_000);
  let res: Response;
  try {
    res = await fetch(url, { signal: ctrl.signal });
  } finally {
    clearTimeout(timer);
  }
  if (!res.ok) throw new Error(`Failed to fetch image (${res.status}): ${url}`);
  const buf = Buffer.from(await res.arrayBuffer());
  return { inlineData: { mimeType: guessMime(url), data: buf.toString("base64") } };
}

export interface GeminiRunInput {
  prompt: string;
  systemPrompt?: string;
  imageUrls?: string[]; // Image (Vision) — multiple supported
  model?: string; // selected model id; falls back to GEMINI_MODEL
  settings?: GeminiSettings; // temperature / maxOutputTokens from the node
  apiKey?: string; // BYOK key; falls back to the server key
}

function retryDelayMs(message: string, attempt: number): number {
  // Gemini 429 errors often include `"retryDelay":"23s"`.
  const m = message.match(/retryDelay"?:\s*"?(\d+)s/i);
  if (m) return Math.min(15_000, Number(m[1]) * 1000 + 1000);
  return Math.min(12_000, 4_000 * 2 ** attempt); // 4s, 8s, 12s
}

// Bound a Gemini call so a hung/quota-stalled request fails the node cleanly
// instead of running past the task maxDuration (which leaves it stuck RUNNING).
function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`Gemini call timed out after ${ms}ms`)), ms),
    ),
  ]);
}

export async function runGemini(input: GeminiRunInput): Promise<{ response: string }> {
  const parts: Part[] = [];
  for (const url of input.imageUrls ?? []) parts.push(await imagePart(url));
  parts.push({ text: input.prompt });

  const config: Record<string, unknown> = {};
  if (input.systemPrompt) config.systemInstruction = input.systemPrompt;
  if (typeof input.settings?.temperature === "number")
    config.temperature = input.settings.temperature;
  if (typeof input.settings?.maxOutputTokens === "number")
    config.maxOutputTokens = input.settings.maxOutputTokens;

  const request = {
    model: input.model || GEMINI_MODEL,
    contents: parts,
    config: Object.keys(config).length ? config : undefined,
  };

  const client = input.apiKey ? new GoogleGenAI({ apiKey: input.apiKey }) : ai();

  // Retry transient Gemini errors — 429 rate-limit AND 503 "high demand"
  // (model overloaded). Both are temporary; failing fast on a 503 would skip
  // every downstream node. Fail fast on all other (real) errors.
  // Budget stays well under the task maxDuration: ≤3 attempts, each call capped
  // at 30s, backoff capped at 12s → worst case ~110s.
  const MAX_ATTEMPTS = 3;
  for (let attempt = 0; ; attempt++) {
    try {
      const res = await withTimeout(client.models.generateContent(request), 30_000);
      if (res.text === undefined) throw new Error("Gemini returned no text");
      return { response: res.text };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      const retryable =
        /\b429\b|\b503\b|RESOURCE_EXHAUSTED|UNAVAILABLE|exceeded your current quota|high demand|overloaded/i.test(
          msg,
        );
      if (!retryable || attempt >= MAX_ATTEMPTS - 1) throw e;
      await new Promise((r) => setTimeout(r, retryDelayMs(msg, attempt)));
    }
  }
}
