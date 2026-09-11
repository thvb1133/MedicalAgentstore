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
 * Light is the default, and deliberately not the operating system's
 * preference. This is a product decision rather than a technical one: the
 * light theme is the face of the thing, it is what the screenshots and the
 * demo show, and a first-time visitor arriving on a machine set to dark mode
 * should still see the interface as it was designed. Anyone who prefers dark
 * is one click away and the choice is remembered from then on.
 */
export const THEME_INIT_SCRIPT = `
(function () {
  try {
    var saved = localStorage.getItem(${JSON.stringify(THEME_KEY)});
    var theme = saved === "night" ? "night" : "morning";
    document.documentElement.setAttribute("data-theme", theme);
  } catch (e) {
    document.documentElement.setAttribute("data-theme", "morning");
  }
})();
`;

function currentTheme(): Theme {
  if (typeof document === "undefined") return "morning";
  return document.documentElement.getAttribute("data-theme") === "night"
    ? "night"
    : "morning";
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
