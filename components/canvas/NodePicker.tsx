"use client";

import { useState } from "react";
import { Search, X, Crop, Sparkles, ChevronRight } from "lucide-react";
import type { NodeKind } from "@/lib/contracts";

interface PickerItem {
  kind: Exclude<NodeKind, "request-inputs" | "response">;
  label: string;
  category: string;
  icon: React.ReactNode;
}

// For this trial only Crop Image + Gemini need to be functional (README §Functional
// Requirements). Categories mirror Magica's picker (IMAGE / OTHERS).
const ITEMS: PickerItem[] = [
  { kind: "crop-image", label: "Crop Image", category: "IMAGE", icon: <Crop size={15} /> },
  { kind: "gemini", label: "Gemini 3.1 Pro", category: "OTHERS", icon: <Sparkles size={15} /> },
];

export function NodePicker({
  onPick,
  onClose,
}: {
  onPick: (kind: PickerItem["kind"]) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  const filtered = ITEMS.filter((i) =>
    i.label.toLowerCase().includes(query.toLowerCase()),
  );
  const categories = [...new Set(filtered.map((i) => i.category))];

  return (
    <div className="w-72 rounded-xl border border-node-border bg-node shadow-lg">
      <div className="flex items-center gap-2 border-b border-node-border px-3 py-2">
        <Search size={15} className="text-muted" />
        <input
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search nodes or models..."
          className="flex-1 bg-transparent text-sm outline-none"
        />
        <button type="button" onClick={onClose} aria-label="Close">
          <X size={15} className="text-muted hover:text-foreground" />
        </button>
      </div>
      <div className="max-h-80 overflow-y-auto py-1">
        {categories.map((cat) => (
          <div key={cat}>
            <div className="px-3 py-1 text-[10px] font-semibold tracking-wide text-muted">
              {cat}
            </div>
            {filtered
              .filter((i) => i.category === cat)
              .map((i) => (
                <button
                  key={i.kind}
                  type="button"
                  onClick={() => onPick(i.kind)}
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-canvas"
                >
                  {i.icon}
                  <span className="flex-1">{i.label}</span>
                  <ChevronRight size={14} className="text-muted" />
                </button>
              ))}
          </div>
        ))}
        {filtered.length === 0 && (
          <div className="px-3 py-4 text-center text-xs text-muted">
            No matches
          </div>
        )}
      </div>
    </div>
  );
}
