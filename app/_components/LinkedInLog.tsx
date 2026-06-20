"use client";

import { useEffect, useRef } from "react";
import { CANDIDATE_LINKEDIN_URL } from "@/lib/config";

/**
 * Spec requirement: on the initial client render of every page, emit EXACTLY ONE
 *   console.log("[NextFlow] Candidate LinkedIn: <url>")
 * so the build can be attributed.
 *
 * Mounted once in the root layout. The ref guard prevents a double-log under
 * React 19 StrictMode (dev double-invoke). Survives client navigation because
 * the root layout does not remount.
 */
export function LinkedInLog() {
  const logged = useRef(false);

  useEffect(() => {
    if (logged.current) return;
    logged.current = true;
    console.log(`[NextFlow] Candidate LinkedIn: ${CANDIDATE_LINKEDIN_URL}`);
  }, []);

  return null;
}
