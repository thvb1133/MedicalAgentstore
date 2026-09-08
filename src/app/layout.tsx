import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

import { AssistantDock } from "@/components/assistant/AssistantDock";
import { THEME_INIT_SCRIPT } from "@/components/ThemeToggle";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Sanjivani Setu — camera as a clinical instrument",
  description:
    "Contactless vitals, alertness, tremor and stroke screening from an ordinary laptop camera. Every measurement carries a confidence score.",
};

// Light is the default the app actually ships with, so the browser chrome
// should match it rather than following the operating system into dark and
// leaving a black bar above a white page.
export const viewport: Viewport = {
  themeColor: "#f6f7f9",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    // suppressHydrationWarning because the inline script below sets
    // data-theme before React runs, so the served markup and the DOM React
    // hydrates against will legitimately differ on this one attribute.
    <html lang="en" suppressHydrationWarning>
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
        {/*
          Theme applied before first paint.

          A toggle that waits for React has already let the browser paint one
          frame of the wrong theme, which is the white flash every dark site
          with a client-side toggle gets wrong. A blocking inline script is
          the right answer here, and as the first child of the body it runs
          before anything below it renders without Next warning about a
          hand-written head.
        */}
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
        {children}
        {/*
          Mounted in the root layout rather than on each page, so it is
          genuinely on every route including ones added later, and so its
          conversation survives navigation instead of being unmounted and
          rebuilt every time somebody clicks a link.
        */}
        <AssistantDock />
      </body>
    </html>
  );
}
