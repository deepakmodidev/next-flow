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
  if (m) return Number(m[1]) * 1000 + 1000;
  return Math.min(30_000, 5_000 * 2 ** attempt); // 5s, 10s, 20s, 30s…
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
  const MAX_ATTEMPTS = 4;
  for (let attempt = 0; ; attempt++) {
    try {
      const res = await client.models.generateContent(request);
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
