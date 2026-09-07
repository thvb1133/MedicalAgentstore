"use client";

import { useCallback, useEffect, useState } from "react";

export type Theme = "night" | "morning";

export const THEME_KEY = "sanjivani-setu.theme";

/**
 * The script that runs before first paint.
 *
 * This has to be inlined in the document head and run synchronously, because
 * anything that waits for React has already let the browser paint one frame
 * of the wrong theme — the white flash that every dark-mode site with a
 * client-side toggle gets wrong. It is small and deliberately dependency-free
 * for that reason.
 *
 * It also honours the operating system preference when nothing has been
 * chosen, which is the only correct default: someone who has set their whole
 * machine to light mode has already told us what they want.
 */
export const THEME_INIT_SCRIPT = `
(function () {
  try {
    var saved = localStorage.getItem(${JSON.stringify(THEME_KEY)});
    var theme = saved === "morning" || saved === "night"
      ? saved
      : (window.matchMedia && window.matchMedia("(prefers-color-scheme: light)").matches
          ? "morning"
          : "night");
    document.documentElement.setAttribute("data-theme", theme);
  } catch (e) {
    document.documentElement.setAttribute("data-theme", "night");
  }
})();
`;

function currentTheme(): Theme {
  if (typeof document === "undefined") return "night";
  return document.documentElement.getAttribute("data-theme") === "morning"
    ? "morning"
    : "night";
}

export function ThemeToggle() {
  // Starts as null so the first render matches the server, which cannot know
  // the theme. The real value arrives in the effect below.
  const [theme, setTheme] = useState<Theme | null>(null);

  useEffect(() => {
    setTheme(currentTheme());
  }, []);

  const toggle = useCallback(() => {
    const next: Theme = currentTheme() === "morning" ? "night" : "morning";
    const root = document.documentElement;

    root.classList.add("theme-switching");
    root.setAttribute("data-theme", next);
    try {
      localStorage.setItem(THEME_KEY, next);
    } catch {
      // Private browsing. The theme still applies for this session.
    }
    requestAnimationFrame(() => root.classList.remove("theme-switching"));

    setTheme(next);
  }, []);

  const morning = theme === "morning";

  return (
    <button
      onClick={toggle}
      role="switch"
      aria-checked={morning}
      aria-label={`Switch to ${morning ? "night" : "morning"} theme`}
      title={`Switch to ${morning ? "night" : "morning"}`}
      className="flex h-8 w-8 items-center justify-center rounded-lg border border-[var(--border)] bg-[var(--surface-raised)] text-[var(--muted)] transition-colors hover:text-[var(--foreground)]"
    >
      {/* Rendered only once the theme is known, so the icon never flips. */}
      {theme === null ? (
        <span className="h-4 w-4" />
      ) : morning ? (
        <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" aria-hidden>
          <path
            d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z"
            stroke="currentColor"
            strokeWidth="1.7"
            strokeLinejoin="round"
          />
        </svg>
      ) : (
        <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" aria-hidden>
          <circle cx="12" cy="12" r="4" stroke="currentColor" strokeWidth="1.7" />
          <path
            d="M12 2v2.5M12 19.5V22M2 12h2.5M19.5 12H22M4.9 4.9l1.8 1.8M17.3 17.3l1.8 1.8M19.1 4.9l-1.8 1.8M6.7 17.3l-1.8 1.8"
            stroke="currentColor"
            strokeWidth="1.7"
            strokeLinecap="round"
          />
        </svg>
      )}
    </button>
  );
}
