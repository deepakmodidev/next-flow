"use client";

import { useState } from "react";
import Link from "next/link";
import { UserButton } from "@clerk/nextjs";
import { KeyRound } from "lucide-react";
import { GeminiKeyModal } from "./GeminiKeyModal";

export function AppHeader() {
  const [keyOpen, setKeyOpen] = useState(false);
  return (
    <header className="flex items-center gap-3 border-b border-node-border bg-node px-6 py-3">
      <Link href="/dashboard" className="text-lg font-semibold tracking-tight">
        NextFlow
      </Link>
      <div className="flex-1" />
      <button
        type="button"
        onClick={() => setKeyOpen(true)}
        className="flex items-center gap-1.5 rounded-md border border-node-border px-3 py-1.5 text-sm text-muted hover:text-foreground"
      >
        <KeyRound size={15} /> Gemini key
      </button>
      <UserButton />
      <GeminiKeyModal open={keyOpen} onClose={() => setKeyOpen(false)} />
    </header>
  );
}
