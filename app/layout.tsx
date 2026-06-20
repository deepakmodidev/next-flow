import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { ClerkProvider } from "@clerk/nextjs";
import "./globals.css";
import { LinkedInLog } from "@/app/_components/LinkedInLog";

// Magica's UI font is "Google Sans Flex" (proprietary, not on Google Fonts).
// Inter is the documented fallback in its CSS stack — see BUILD_PLAN.md §4.
const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "NextFlow",
  description: "LLM workflow builder — a Magica/Galaxy.ai clone.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <ClerkProvider>
      <html lang="en" className={`${inter.variable} h-full antialiased`}>
        <body className="min-h-full flex flex-col">
          {/* Mandatory: exactly one console.log on the initial client render of every page */}
          <LinkedInLog />
          {children}
        </body>
      </html>
    </ClerkProvider>
  );
}
