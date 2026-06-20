import { defineConfig } from "@trigger.dev/sdk";

// Trigger.dev v4 config (see BUILD_PLAN.md §7). The Crop task uses the
// `ffmpeg-static` binary (kept external so its bundled path resolves at runtime).
export default defineConfig({
  project: "proj_riscdgeyhsqiugsflrdu",
  dirs: ["./trigger"],
  maxDuration: 120, // crop waits 30s+ — keep headroom
  build: {
    external: ["ffmpeg-static"],
  },
});
