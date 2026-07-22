import { wait } from "@trigger.dev/sdk";

/**
 * Transloadit assembly helpers. The assembly *status* wait lives here and is
 * task-only (it uses Trigger.dev `wait.for`), so no browser code ever polls an
 * upload — the UI subscribes to the task with Realtime instead.
 */

export interface Assembly {
  ok?: string;
  error?: string;
  message?: string;
  assembly_ssl_url?: string;
  results?: Record<string, Array<{ ssl_url?: string; url?: string }>>;
}

/** Pass-through upload: keep the original file and return its CDN URL. */
export const UPLOAD_STEPS = {
  ":original": { robot: "/upload/handle", result: true },
};

// Checks, not seconds — each one is a 1s wait plus a round trip.
const MAX_CHECKS = 60;

/** States that mean the assembly is still working; anything else is terminal. */
const IN_PROGRESS = new Set([
  "ASSEMBLY_UPLOADING",
  "ASSEMBLY_EXECUTING",
  "ASSEMBLY_REPLAYING",
]);

export function assemblyResultUrl(a: Assembly): string {
  const result = a.results?.[":original"]?.[0];
  const url = result?.ssl_url ?? result?.url;
  if (!url) throw new Error("Transloadit returned no URL for the upload");
  return url;
}

/**
 * Guard for URLs that come out of the graph (crop input image, Gemini media).
 * They're user-typed, and the worker fetches them, so block anything that isn't
 * plain http(s) or that points back at the private network.
 */
export function assertFetchableUrl(raw: string, label: string): void {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    throw new Error(`${label}: "${raw}" is not a valid URL`);
  }
  if (u.protocol !== "http:" && u.protocol !== "https:")
    throw new Error(`${label}: only http(s) URLs are allowed`);
  const h = u.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  const blocked =
    h === "localhost" ||
    h.endsWith(".localhost") ||
    h === "::1" ||
    /^127\./.test(h) ||
    /^10\./.test(h) ||
    /^192\.168\./.test(h) ||
    /^169\.254\./.test(h) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(h) ||
    /^(fc|fd|fe80)/.test(h);
  if (blocked) throw new Error(`${label}: private addresses are not allowed`);
}

/** Reject anything that isn't a real Transloadit status URL (client-supplied). */
export function isAssemblyStatusUrl(url: string): boolean {
  try {
    const u = new URL(url);
    return (
      u.protocol === "https:" &&
      (u.hostname === "transloadit.com" || u.hostname.endsWith(".transloadit.com"))
    );
  } catch {
    return false;
  }
}

/** Await an assembly from inside a Trigger.dev task; returns the CDN URL. */
export async function awaitAssembly(statusUrl: string): Promise<string> {
  for (let i = 0; i < MAX_CHECKS; i++) {
    const res = await fetch(statusUrl);
    if (!res.ok) throw new Error(`Transloadit status ${res.status}`);
    const a: Assembly = await res.json();
    if (a.error) throw new Error("Transloadit: " + (a.message || a.error));
    if (a.ok === "ASSEMBLY_COMPLETED") return assemblyResultUrl(a);
    // A canceled/expired assembly reports through `ok`, not `error` — without
    // this the loop burns its whole budget then blames a timeout.
    if (a.ok && !IN_PROGRESS.has(a.ok))
      throw new Error(`Transloadit: assembly ended as ${a.ok}`);
    await wait.for({ seconds: 1 });
  }
  throw new Error("Transloadit: upload timed out before completing");
}

/** Upload bytes and wait for the CDN URL. Task-only (see awaitAssembly). */
export async function uploadToTransloadit(
  file: Blob,
  filename: string,
): Promise<string> {
  const key = process.env.NEXT_PUBLIC_TRANSLOADIT_KEY;
  if (!key) throw new Error("TRANSLOADIT key not configured");
  const form = new FormData();
  form.append(
    "params",
    JSON.stringify({ auth: { key }, steps: UPLOAD_STEPS }),
  );
  form.append("file", file, filename);

  const res = await fetch("https://api2.transloadit.com/assemblies", {
    method: "POST",
    body: form,
  });
  const a: Assembly = await res.json();
  if (a.error) throw new Error("Transloadit: " + (a.message || a.error));
  if (a.ok === "ASSEMBLY_COMPLETED") return assemblyResultUrl(a);
  if (!a.assembly_ssl_url)
    throw new Error("Transloadit did not return an assembly URL");
  return awaitAssembly(a.assembly_ssl_url);
}
