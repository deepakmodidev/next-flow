"use client";

import { useId } from "react";

/**
 * Google Gemini "spark" mark — a four-pointed star with the brand
 * blue→purple→coral gradient. Inline SVG (no network/CORS dependency); a
 * per-instance gradient id avoids duplicate-id collisions when several Gemini
 * nodes render at once.
 */
export function GeminiIcon({
  size = 14,
  className,
}: {
  size?: number;
  className?: string;
}) {
  const id = useId();
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      className={className}
      aria-hidden="true"
    >
      <defs>
        <linearGradient
          id={id}
          x1="2"
          y1="4"
          x2="22"
          y2="20"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor="#4285F4" />
          <stop offset="0.52" stopColor="#9B72CB" />
          <stop offset="1" stopColor="#D96570" />
        </linearGradient>
      </defs>
      <path
        d="M12 0C12 6.627 6.627 12 0 12C6.627 12 12 17.373 12 24C12 17.373 17.373 12 24 12C17.373 12 12 6.627 12 0Z"
        fill={`url(#${id})`}
      />
    </svg>
  );
}
