"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import {
  fileToPortrait,
  loadPortrait,
  savePortrait,
  validateFile,
} from "@/lib/avatar/portrait";
import {
  detectRig,
  writeCachedRig,
  type RigFailure,
} from "@/lib/avatar/detectRig";
import type { FaceRig } from "@/lib/avatar/faceRig";

export type PortraitStage = "idle" | "reading" | "finding-face";

/**
 * The uploaded portrait, and the rig that lets it talk.
 *
 * Loaded in an effect rather than during render so the server-rendered markup
 * and the first client render agree; localStorage does not exist on the
 * server and reading it during render is the classic hydration mismatch.
 *
 * Finding the face is a second, slower step after reading the file, and it is
 * reported separately because the two fail for completely different reasons
 * and only one of them is fatal. A picture that cannot be read is not usable
 * at all. A picture with no findable face is perfectly usable — it simply
 * gets shown still, which is what the earlier build did with every uploaded
 * photograph anyway.
 */
export function usePortrait() {
  const [portrait, setPortrait] = useState<string | null>(null);
  const [rig, setRig] = useState<FaceRig | null>(null);
  const [rigFailure, setRigFailure] = useState<RigFailure | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [stage, setStage] = useState<PortraitStage>("idle");

  /**
   * Guards against a slow detection landing after the picture it belongs to
   * has been replaced or removed, which would attach one person's mesh to
   * another person's face.
   */
  const currentRef = useRef<string | null>(null);

  const analyse = useCallback(async (dataUrl: string) => {
    currentRef.current = dataUrl;
    setStage("finding-face");
    const result = await detectRig(dataUrl);
    if (currentRef.current !== dataUrl) return;
    setRig(result.rig);
    setRigFailure(result.failure);
    setStage("idle");
  }, []);

  useEffect(() => {
    const stored = loadPortrait();
    setPortrait(stored);
    if (stored) void analyse(stored);
  }, [analyse]);

  const upload = useCallback(
    async (file: File) => {
      setError(null);
      setRigFailure(null);
      const invalid = validateFile(file);
      if (invalid) {
        setError(invalid.message);
        return;
      }

      setStage("reading");
      let dataUrl: string;
      try {
        dataUrl = await fileToPortrait(file);
      } catch {
        setError("That image could not be read. Try a different one.");
        setStage("idle");
        return;
      }

      setRig(null);
      if (!savePortrait(dataUrl)) {
        // Applied for this session, but say so rather than let them find out
        // when it disappears on the next visit.
        setError("Saved for this session only — there was no room in this browser's storage.");
      }
      setPortrait(dataUrl);
      await analyse(dataUrl);
    },
    [analyse],
  );

  const clear = useCallback(() => {
    currentRef.current = null;
    savePortrait(null);
    writeCachedRig("", null);
    setPortrait(null);
    setRig(null);
    setRigFailure(null);
    setError(null);
    setStage("idle");
  }, []);

  return {
    portrait,
    rig,
    rigFailure,
    error,
    stage,
    busy: stage !== "idle",
    upload,
    clear,
  };
}
