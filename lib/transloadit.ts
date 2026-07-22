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

const MAX_WAIT_SECONDS = 60;

export function assemblyResultUrl(a: Assembly): string {
  const result = a.results?.[":original"]?.[0];
  const url = result?.ssl_url ?? result?.url;
  if (!url) throw new Error("Transloadit returned no URL for the upload");
  return url;
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
  for (let i = 0; i < MAX_WAIT_SECONDS; i++) {
    const res = await fetch(statusUrl);
    if (!res.ok) throw new Error(`Transloadit status ${res.status}`);
    const a: Assembly = await res.json();
    if (a.error) throw new Error("Transloadit: " + (a.message || a.error));
    if (a.ok === "ASSEMBLY_COMPLETED") return assemblyResultUrl(a);
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
