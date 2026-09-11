"use client";

import { useCallback, useEffect, useState } from "react";

import {
  defaultProfile,
  loadProfile,
  saveProfile,
  type CompanionProfile,
} from "@/lib/avatar/profile";

/**
 * The saved companion settings, loaded once on mount.
 *
 * Deliberately not read during the first render. localStorage does not exist
 * on the server, so reading it in the initial state would make the server and
 * client markup disagree and React would throw away the whole tree on
 * hydration. Starting from the defaults and swapping in the saved profile in
 * an effect costs one extra paint and is the only way to do this correctly.
 *
 * `ready` tells callers which of the two they are looking at, so a page can
 * avoid flashing the default avatar for a frame before the chosen one appears.
 */
export function useCompanionProfile(): {
  profile: CompanionProfile;
  update: (next: CompanionProfile) => void;
  ready: boolean;
} {
  const [profile, setProfile] = useState<CompanionProfile>(defaultProfile);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const loaded = loadProfile();
    setProfile(loaded);
    // Write it straight back so a profile that has only ever existed as a
    // default gets a stable id, rather than a fresh one on every visit — the
    // id is what history is filed under.
    saveProfile(loaded);
    setReady(true);
  }, []);

  const update = useCallback((next: CompanionProfile) => {
    setProfile(saveProfile(next));
  }, []);

  return { profile, update, ready };
}
