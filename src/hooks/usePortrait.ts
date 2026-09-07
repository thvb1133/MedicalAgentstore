"use client";

import { useCallback, useEffect, useState } from "react";

import {
  fileToPortrait,
  loadPortrait,
  savePortrait,
  validateFile,
} from "@/lib/avatar/portrait";

/**
 * The uploaded portrait, if there is one.
 *
 * Loaded in an effect rather than during render so the server-rendered markup
 * and the first client render agree; localStorage does not exist on the
 * server and reading it during render is the classic hydration mismatch.
 */
export function usePortrait() {
  const [portrait, setPortrait] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setPortrait(loadPortrait());
  }, []);

  const upload = useCallback(async (file: File) => {
    setError(null);
    const invalid = validateFile(file);
    if (invalid) {
      setError(invalid.message);
      return;
    }

    setBusy(true);
    try {
      const dataUrl = await fileToPortrait(file);
      if (!savePortrait(dataUrl)) {
        // Applied for this session, but say so rather than let them find out
        // when it disappears on the next visit.
        setPortrait(dataUrl);
        setError("Saved for this session only — there was no room in this browser's storage.");
        return;
      }
      setPortrait(dataUrl);
    } catch {
      setError("That image could not be read. Try a different one.");
    } finally {
      setBusy(false);
    }
  }, []);

  const clear = useCallback(() => {
    savePortrait(null);
    setPortrait(null);
    setError(null);
  }, []);

  return { portrait, error, busy, upload, clear };
}
