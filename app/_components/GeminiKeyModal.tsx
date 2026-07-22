"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { X, Check, Loader2, KeyRound } from "lucide-react";
import {
  getLocalGeminiKey,
  setLocalGeminiKey,
  clearLocalGeminiKey,
} from "@/lib/geminiKey";

type Status = "idle" | "verifying" | "ok" | "error";

export function GeminiKeyModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const [key, setKey] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [msg, setMsg] = useState("");

  useEffect(() => {
    if (open) {
      setKey(getLocalGeminiKey() ?? "");
      setStatus("idle");
      setMsg("");
    }
  }, [open]);

  if (!open) return null;

  const verifyAndSave = async () => {
    setStatus("verifying");
    setMsg("");
    try {
      const res = await fetch("/api/gemini/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apiKey: key.trim() }),
      });
      const data = await res.json();
      if (data.ok) {
        setLocalGeminiKey(key.trim());
        setStatus("ok");
        setMsg(data.warning || "Verified and saved. Your runs will use this key.");
      } else {
        setStatus("error");
        setMsg(data.error || "Verification failed.");
      }
    } catch {
      setStatus("error");
      setMsg("Verification request failed.");
    }
  };

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-xl border border-node-border bg-node p-5 shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center gap-2">
          <KeyRound size={18} className="text-accent" />
          <h2 className="flex-1 text-base font-semibold">Gemini API key (BYOK)</h2>
          <button type="button" onClick={onClose} aria-label="Close">
            <X size={18} className="text-muted hover:text-foreground" />
          </button>
        </div>
        <p className="mb-3 text-xs text-muted">
          Bring your own Google AI Studio key. It&apos;s stored locally in your
          browser and sent with your runs. We verify it with a live call before
          saving.
        </p>
        <input
          type="password"
          value={key}
          onChange={(e) => {
            setKey(e.target.value);
            setStatus("idle");
            setMsg("");
          }}
          placeholder="AIza… or AQ…"
          className="w-full rounded-md border border-node-border bg-background px-3 py-2 text-sm outline-none focus:border-accent"
        />
        {msg && (
          <p
            className={`mt-2 text-xs ${
              status === "ok"
                ? "text-success"
                : status === "error"
                  ? "text-error"
                  : "text-muted"
            }`}
          >
            {msg}
          </p>
        )}
        <div className="mt-4 flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={() => {
              clearLocalGeminiKey();
              setKey("");
              setStatus("idle");
              setMsg("Key removed — runs fall back to the server key.");
            }}
            className="text-xs text-muted hover:text-error"
          >
            Remove key
          </button>
          <button
            type="button"
            onClick={verifyAndSave}
            disabled={!key.trim() || status === "verifying"}
            className="flex items-center gap-1.5 rounded-md bg-accent px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
          >
            {status === "verifying" ? (
              <Loader2 size={15} className="animate-spin" />
            ) : status === "ok" ? (
              <Check size={15} />
            ) : null}
            {status === "verifying" ? "Verifying…" : "Verify & Save"}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
