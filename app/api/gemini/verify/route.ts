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
    // A 429 means the key authenticated (it reached the quota check) → valid,
    // just rate-limited right now. Treat as success with a heads-up.
    if (/\b429\b|RESOURCE_EXHAUSTED|exceeded your current quota/i.test(msg)) {
      return Response.json({
        ok: true,
        warning: "Key is valid, but it's currently rate-limited (free-tier quota).",
      });
    }
    // Surface the raw upstream error verbatim — no friendly decoration.
    return Response.json({ ok: false, error: msg });
  }
}
