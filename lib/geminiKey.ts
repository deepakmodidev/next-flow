"use client";

// BYOK Gemini key — stored locally in the browser only (never in our DB at rest;
// it's sent with a run so the task can use it). See GeminiKeyModal.
const STORAGE_KEY = "nf:gemini-key";

export function getLocalGeminiKey(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(STORAGE_KEY);
}

export function setLocalGeminiKey(key: string): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEY, key);
}

export function clearLocalGeminiKey(): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem(STORAGE_KEY);
}
