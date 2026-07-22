"use client";

import { useState } from "react";
import { useRealtimeRun } from "@trigger.dev/react-hooks";
import { ImageIcon, Loader2 } from "lucide-react";

const KEY = process.env.NEXT_PUBLIC_TRANSLOADIT_KEY;

interface Assembly {
  ok?: string;
  error?: string;
  message?: string;
  assembly_ssl_url?: string;
  results?: Record<string, Array<{ ssl_url?: string; url?: string }>>;
}

function resultUrl(a: Assembly): string | undefined {
  const r = a.results?.[":original"]?.[0];
  return r?.ssl_url ?? r?.url;
}

function Spinner({ label }: { label: string }) {
  return (
    <div className="flex w-full items-center justify-center gap-1 rounded border border-dashed border-node-border py-2 text-xs text-muted">
      <Loader2 size={12} className="animate-spin" /> {label}
    </div>
  );
}

/**
 * Watches one upload task over Realtime. Mounted with a key per run: the hook
 * only fires onComplete once per instance, so reusing it across uploads would
 * leave the second one spinning forever.
 */
function UploadWatch({
  runId,
  token,
  onDone,
}: {
  runId: string;
  token: string;
  onDone: (url: string | undefined, error: string | undefined) => void;
}) {
  const { run } = useRealtimeRun(runId, {
    accessToken: token,
    onComplete: (finished, err) => {
      onDone((finished?.output as { url?: string } | undefined)?.url, err?.message);
    },
  });
  const phase = (run?.metadata as { phase?: string } | undefined)?.phase;
  return <Spinner label={phase ? `Uploading — ${phase}…` : "Uploading…"} />;
}

/**
 * Transloadit image uploader for the Request-Inputs image_field (README:
 * jpg/jpeg/png/webp/gif, with preview). The file goes to Transloadit in one
 * request; if the assembly is still running, a Trigger.dev task watches it and
 * this component subscribes with Realtime — so the browser never polls an
 * assembly status URL.
 */
export function ImageUpload({
  value,
  onUploaded,
}: {
  value?: string;
  onUploaded: (url: string) => void;
}) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [watch, setWatch] = useState<{ runId: string; token: string } | null>(
    null,
  );

  const finish = (url: string | undefined, err: string | undefined) => {
    setWatch(null);
    setUploading(false);
    if (err) setError(err);
    else if (url) onUploaded(url);
    else setError("Upload finished but no URL was returned");
  };

  const upload = async (file: File) => {
    setUploading(true);
    setError(null);
    setWatch(null);
    try {
      const form = new FormData();
      form.append(
        "params",
        JSON.stringify({
          auth: { key: KEY },
          steps: { ":original": { robot: "/upload/handle", result: true } },
        }),
      );
      form.append("file", file);

      const res = await fetch("https://api2.transloadit.com/assemblies", {
        method: "POST",
        body: form,
      });
      const assembly: Assembly = await res.json();
      if (assembly.error) throw new Error(assembly.message ?? assembly.error);

      // Small files usually come back already done — no task needed.
      if (assembly.ok === "ASSEMBLY_COMPLETED") {
        const url = resultUrl(assembly);
        if (!url) throw new Error("Upload finished but no URL was returned");
        setUploading(false);
        onUploaded(url);
        return;
      }
      if (!assembly.assembly_ssl_url)
        throw new Error("Transloadit did not return an assembly URL");

      const watchRes = await fetch("/api/uploads/watch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ statusUrl: assembly.assembly_ssl_url }),
      });
      if (!watchRes.ok) throw new Error(await watchRes.text());
      const { runId, publicAccessToken } = await watchRes.json();
      setWatch({ runId, token: publicAccessToken });
    } catch (e) {
      // Surface the raw error inline, not a blocking alert.
      setError(e instanceof Error ? e.message : String(e));
      setUploading(false);
    }
  };

  return (
    <div className="flex flex-col gap-1">
      <label className="block cursor-pointer">
        <input
          type="file"
          accept=".jpg,.jpeg,.png,.webp,.gif"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) upload(f);
            e.target.value = "";
          }}
        />
        {watch ? (
          <UploadWatch
            key={watch.runId}
            runId={watch.runId}
            token={watch.token}
            onDone={finish}
          />
        ) : uploading ? (
          <Spinner label="Uploading…" />
        ) : value ? (
          <div className="overflow-hidden rounded border border-node-border bg-canvas">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={value}
              alt="uploaded"
              className="max-h-48 w-full object-contain"
            />
          </div>
        ) : (
          <div className="flex w-full items-center justify-center gap-1 rounded border border-dashed border-node-border py-2 text-xs text-muted hover:border-accent">
            <ImageIcon size={12} /> Upload Image
          </div>
        )}
      </label>
      {error && (
        <div className="whitespace-pre-wrap break-words rounded border border-node-border bg-canvas px-2 py-1 text-xs text-error">
          {error}
        </div>
      )}
    </div>
  );
}
