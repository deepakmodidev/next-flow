import type { NextRequest } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { GoogleGenAI } from "@google/genai";
import { GEMINI_MODEL } from "@/lib/config";

// Verify a BYOK Gemini key by making a tiny live call with it.
export async function POST(request: NextRequest) {
  const { userId } = await auth();
  if (!userId) return new Response("Unauthorized", { status: 401 });

  const body = await request.json().catch(() => ({}));
  const apiKey = typeof body.apiKey === "string" ? body.apiKey.trim() : "";
  if (!apiKey) {
    return Response.json({ ok: false, error: "No key provided" }, { status: 400 });
  }

  try {
    const ai = new GoogleGenAI({ apiKey });
    const res = await ai.models.generateContent({
      model: GEMINI_MODEL,
      contents: "ping",
    });
    if (res.text === undefined) throw new Error("Empty response");
    return Response.json({ ok: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    // Quota exhaustion means the key authenticated (it reached the quota check)
    // → valid, just rate-limited. Match the explicit quota markers only; a bare
    // "429" appears in unrelated messages and would save an unverified key.
    if (/RESOURCE_EXHAUSTED|exceeded your current quota/i.test(msg)) {
      return Response.json({
        ok: true,
        warning: "Key is valid, but it's currently rate-limited (free-tier quota).",
      });
    }
    // Surface the raw upstream error verbatim — no friendly decoration. Status
    // must be non-2xx so callers checking res.ok don't read this as success.
    return Response.json({ ok: false, error: msg }, { status: 502 });
  }
}
