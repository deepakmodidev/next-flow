import { defineConfig } from "@trigger.dev/sdk";

// Trigger.dev v4 config (see BUILD_PLAN.md §7). The Crop task uses the
// `ffmpeg-static` binary (kept external so its bundled path resolves at runtime).
export default defineConfig({
  project: "proj_riscdgeyhsqiugsflrdu",
  dirs: ["./trigger"],
  maxDuration: 120, // crop waits 30s+ — keep headroom
  // Auto-retry transient task failures — including Trigger.dev infra evictions
  // (the "Error (0ms)" case) that otherwise leave a node stuck until the
  // watchdog. Enabled in dev too, since the local worker occasionally evicts a
  // run under concurrent load.
  retries: {
    enabledInDev: true,
    default: {
      maxAttempts: 3,
      factor: 2,
      minTimeoutInMs: 1000,
      maxTimeoutInMs: 10000,
      randomize: true,
    },
  },
  build: {
    external: ["ffmpeg-static"],
  },
});
