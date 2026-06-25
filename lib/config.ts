/** App-wide config — hardcoded, fail-fast (no env fallbacks). */

// Used by the mandatory "[NextFlow] Candidate LinkedIn: <url>" attribution log.
export const CANDIDATE_LINKEDIN_URL = "https://linkedin.com/in/deepakmodidev";

/**
 * Models offered in the node's header selector. Both are valid Gemini ids;
 * labels are honest (no aliasing one as the other). Flash is the default
 * because the free tier's quota is comfortable on it.
 */
export const GEMINI_MODELS = [
  { id: "gemini-flash-latest", label: "Gemini Flash (latest)" },
  { id: "gemini-3.1-pro-preview", label: "Gemini 3.1 Pro" },
] as const;

/** Default model when a node hasn't picked one. */
export const GEMINI_MODEL: string = GEMINI_MODELS[0].id;

/** Artificial processing delay on Crop Image, in seconds. */
export const CROP_DELAY_SECONDS = 3;
