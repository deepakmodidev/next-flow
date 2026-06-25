"use client";

import { useState } from "react";
import Link from "next/link";
import { UserButton } from "@clerk/nextjs";
import { KeyRound } from "lucide-react";
import { GeminiKeyModal } from "./GeminiKeyModal";

export function AppHeader() {
  const [keyOpen, setKeyOpen] = useState(false);
  return (
    <header className="sticky top-0 z-30 flex items-center gap-3 border-b border-node-border bg-node/80 px-6 py-3 backdrop-blur-md">
      <Link href="/dashboard" className="flex items-center gap-2">
        <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-accent text-sm font-bold text-white shadow-sm">
          N
        </span>
        <span className="text-lg font-semibold tracking-tight">NextFlow</span>
      </Link>
      <div className="flex-1" />
      <button
        type="button"
        onClick={() => setKeyOpen(true)}
        className="flex items-center gap-1.5 rounded-lg border border-node-border px-3 py-1.5 text-sm text-muted transition-colors hover:border-accent/40 hover:text-foreground"
      >
        <KeyRound size={15} /> Gemini key
      </button>
      <UserButton />
      <GeminiKeyModal open={keyOpen} onClose={() => setKeyOpen(false)} />
    </header>
  );
}
