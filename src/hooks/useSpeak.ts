"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { api } from "@/lib/paths";

/**
 * Read a block of text aloud, once.
 *
 * Distinct from the conversation's speech, which is a turn loop with
 * interruption and lip-sync attached. This is for the places where there is
 * one piece of prepared text and someone may want to hear it rather than read
 * it — the weekly journal, chiefly, which is exactly the sort of thing a
 * person with low vision or reading difficulty should not have to squint at.
 *
 * Polly when it is configured, the browser's own synthesiser when it is not.
 * The browser voices are worse, but the feature working everywhere matters
 * more than it sounding good in the places that have AWS keys.
 */
export function useSpeak(options: { voiceId?: string; rate?: number; enabled?: boolean } = {}) {
  const [speaking, setSpeaking] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const urlRef = useRef<string | null>(null);

  const stop = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
    if (urlRef.current) {
      URL.revokeObjectURL(urlRef.current);
      urlRef.current = null;
    }
    if (typeof window !== "undefined" && window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }
    setSpeaking(false);
  }, []);

  useEffect(() => stop, [stop]);

  const speak = useCallback(
    async (text: string) => {
      stop();
      const trimmed = text.trim();
      if (!trimmed) return;
      setSpeaking(true);

      const speakUrl = api("/api/speak");
      if (options.enabled !== false && speakUrl) {
        try {
          const response = await fetch(speakUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              text: trimmed,
              voice: options.voiceId,
              rate: options.rate ?? 100,
            }),
          });
          if (response.ok) {
            const url = URL.createObjectURL(await response.blob());
            urlRef.current = url;
            const audio = new Audio(url);
            audioRef.current = audio;
            audio.onended = () => stop();
            await audio.play();
            return;
          }
        } catch {
          // Fall through to the browser's own synthesiser.
        }
      }

      if (typeof window === "undefined" || !window.speechSynthesis) {
        setSpeaking(false);
        return;
      }
      const utterance = new SpeechSynthesisUtterance(trimmed);
      utterance.rate = (options.rate ?? 100) / 100;
      utterance.onend = () => setSpeaking(false);
      utterance.onerror = () => setSpeaking(false);
      window.speechSynthesis.speak(utterance);
    },
    [options.enabled, options.rate, options.voiceId, stop],
  );

  return { speak, stop, speaking };
}
