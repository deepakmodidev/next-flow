import { GoogleGenAI } from "@google/genai";
import { GEMINI_MODEL } from "@/lib/config";

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
  const buf = Buffer.from(await (await fetch(url)).arrayBuffer());
  return { inlineData: { mimeType: guessMime(url), data: buf.toString("base64") } };
}

export interface GeminiRunInput {
  prompt: string;
  systemPrompt?: string;
  imageUrls?: string[]; // Image (Vision) — multiple supported
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

  const request = {
    model: GEMINI_MODEL,
    contents: parts,
    config: input.systemPrompt
      ? { systemInstruction: input.systemPrompt }
      : undefined,
  };

  const client = input.apiKey ? new GoogleGenAI({ apiKey: input.apiKey }) : ai();

  // Retry ONLY on rate-limit (429); fail fast on every other error.
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
      const rateLimited =
        /\b429\b|RESOURCE_EXHAUSTED|exceeded your current quota/i.test(msg);
      if (!rateLimited || attempt >= MAX_ATTEMPTS - 1) throw e;
      await new Promise((r) => setTimeout(r, retryDelayMs(msg, attempt)));
    }
  }
}
