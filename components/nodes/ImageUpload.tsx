"use client";

import { useState } from "react";
import { ImageIcon, Loader2 } from "lucide-react";

const KEY = process.env.NEXT_PUBLIC_TRANSLOADIT_KEY;

interface Assembly {
  ok?: string;
  error?: string;
  message?: string;
  assembly_ssl_url?: string;
  results?: Record<string, Array<{ ssl_url?: string; url?: string }>>;
}

/**
 * Transloadit image uploader for the Request-Inputs image_field (README:
 * jpg/jpeg/png/webp/gif, with preview). Uploads directly to the Transloadit
 * REST API; the resulting CDN URL is stored as the field value and flows
 * downstream (crop / vision). No signature (dev) — see Transloadit settings.
 */
export function ImageUpload({
  value,
  onUploaded,
}: {
  value?: string;
  onUploaded: (url: string) => void;
}) {
  const [uploading, setUploading] = useState(false);

  const upload = async (file: File) => {
    setUploading(true);
    try {
      const params = {
        auth: { key: KEY },
        steps: { ":original": { robot: "/upload/handle", result: true } },
      };
      const form = new FormData();
      form.append("params", JSON.stringify(params));
      form.append("file", file);

      const res = await fetch("https://api2.transloadit.com/assemblies", {
        method: "POST",
        body: form,
      });
      let assembly: Assembly = await res.json();

      // Poll until the assembly completes.
      while (
        assembly.assembly_ssl_url &&
        assembly.ok !== "ASSEMBLY_COMPLETED" &&
        !assembly.error
      ) {
        await new Promise((r) => setTimeout(r, 1000));
        assembly = await (await fetch(assembly.assembly_ssl_url)).json();
      }
      if (assembly.error) throw new Error(assembly.message ?? assembly.error);

      const url = assembly.results?.[":original"]?.[0]?.ssl_url;
      if (!url) throw new Error("Upload finished but no URL was returned");
      onUploaded(url);
    } catch (e) {
      alert("Upload failed: " + (e instanceof Error ? e.message : String(e)));
    } finally {
      setUploading(false);
    }
  };

  return (
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
      {uploading ? (
        <div className="flex w-full items-center justify-center gap-1 rounded border border-dashed border-node-border py-2 text-xs text-muted">
          <Loader2 size={12} className="animate-spin" /> Uploading…
        </div>
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
  );
}
