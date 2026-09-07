"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import type { ConversationTurn, LiveContext } from "@/lib/conversation";

/**
 * The turn-taking loop.
 *
 * Four things have to be choreographed: speech recognition, the end-of-turn
 * decision, a streamed reply from Claude, and speech synthesis. The hackathon
 * project this mirrors handed the whole problem to Agora's orchestration
 * service. Doing it in the browser is not much more code and removes a paid
 * dependency, at the cost of having to be explicit about the two things that
 * service was quietly handling: deciding when the person has finished
 * speaking, and stopping the assistant from hearing itself.
 *
 * End of turn is decided by the voice-activity detector in useVoiceBiomarkers
 * rather than by the recogniser, because browser recognisers finalise results
 * on their own schedule and can sit on a phrase for a second or more after
 * the room has gone quiet.
 *
 * Self-hearing is prevented by stopping recognition outright while the
 * assistant talks. Browser echo cancellation is good but not perfect, and a
 * recogniser transcribing the assistant's own sentence back as a new user
 * turn puts the conversation into a loop that is very hard to break out of.
 */

export type ConversationStatus =
  | "idle"
  | "listening"
  | "thinking"
  | "speaking"
  | "error";

export interface ConversationOptions {
  /** Read the current sensor snapshot. Called once per turn, at submission. */
  getContext: () => LiveContext;
  /** Whether Polly is configured; when false the reply is shown but not spoken. */
  speechEnabled: boolean;
  /** Voice for the spoken reply. */
  voiceId?: string;
}

export interface ConversationState {
  status: ConversationStatus;
  turns: ConversationTurn[];
  /** The assistant's reply as it streams in. */
  partial: string;
  /** What the recogniser currently thinks the person is saying. */
  interim: string;
  error: string | null;
  /** False in browsers without the Web Speech API, where typing is the fallback. */
  recognitionAvailable: boolean;
  start: () => void;
  stop: () => void;
  /** Submit a typed turn, for browsers without speech recognition. */
  sendText: (text: string) => void;
  /** Cut off the spoken reply and start listening again. */
  interrupt: () => void;
  /**
   * Hand this to the voice-activity detector. It submits whatever has been
   * transcribed so far, and does nothing unless the loop is actively
   * listening — so it is safe to call on every detected silence.
   */
  onTurnEnd: () => void;
}

interface SpeechRecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
}

interface SpeechRecognitionEventLike {
  resultIndex: number;
  results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }>;
}

type RecognitionCtor = new () => SpeechRecognitionLike;

function getConstructor(): RecognitionCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as {
    SpeechRecognition?: RecognitionCtor;
    webkitSpeechRecognition?: RecognitionCtor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export function useConversation(options: ConversationOptions): ConversationState {
  const { getContext, speechEnabled, voiceId } = options;

  const [status, setStatus] = useState<ConversationStatus>("idle");
  const [turns, setTurns] = useState<ConversationTurn[]>([]);
  const [partial, setPartial] = useState("");
  const [interim, setInterim] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [recognitionAvailable, setRecognitionAvailable] = useState(false);

  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const finalTextRef = useRef("");
  const interimTextRef = useRef("");
  const turnsRef = useRef<ConversationTurn[]>([]);
  turnsRef.current = turns;
  const statusRef = useRef<ConversationStatus>("idle");
  statusRef.current = status;
  const runningRef = useRef(false);

  const getContextRef = useRef(getContext);
  getContextRef.current = getContext;

  useEffect(() => {
    setRecognitionAvailable(getConstructor() !== null);
  }, []);

  const startRecognition = useCallback(() => {
    const Ctor = getConstructor();
    if (!Ctor) return;

    try {
      recognitionRef.current?.abort();
    } catch {
      // Already stopped.
    }

    const recognition = new Ctor();
    recognition.lang = "en-GB";
    recognition.continuous = true;
    recognition.interimResults = true;

    recognition.onresult = (event) => {
      // Only walk the results that arrived with this event. Re-reading the
      // whole list would re-append every finalised phrase each time.
      let interimText = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        const text = result[0]?.transcript ?? "";
        if (result.isFinal) finalTextRef.current += `${text} `;
        else interimText += text;
      }
      interimTextRef.current = interimText;
      setInterim((finalTextRef.current + interimText).trim());
    };

    recognition.onerror = (event) => {
      // "no-speech" and "aborted" are routine in a conversation with pauses,
      // and surfacing them as errors would make the interface look broken.
      if (event.error === "no-speech" || event.error === "aborted") return;
      if (event.error === "not-allowed") {
        setError("Microphone permission was refused.");
        setStatus("error");
        runningRef.current = false;
        return;
      }
      setError(`Speech recognition error: ${event.error}`);
    };

    recognition.onend = () => {
      // Chrome ends the session on its own after a stretch of silence. If the
      // conversation is still meant to be listening, start it again.
      if (runningRef.current && statusRef.current === "listening") {
        try {
          recognition.start();
        } catch {
          // Racing a manual stop; the next state change will recover.
        }
      }
    };

    try {
      recognition.start();
    } catch {
      // Starting an already-started recogniser throws; harmless.
    }
    recognitionRef.current = recognition;
  }, []);

  const stopRecognition = useCallback(() => {
    const recognition = recognitionRef.current;
    if (!recognition) return;
    recognition.onend = null;
    try {
      recognition.abort();
    } catch {
      // Ignore.
    }
    recognitionRef.current = null;
  }, []);

  /** Speak a reply through Polly, resolving when playback finishes. */
  const speak = useCallback(
    async (text: string): Promise<void> => {
      if (!speechEnabled || !text.trim()) return;

      const response = await fetch("/api/speak", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, voice: voiceId }),
      });
      if (!response.ok) throw new Error("Speech synthesis failed.");

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const audio = new Audio(url);
      audioRef.current = audio;

      await new Promise<void>((resolve) => {
        audio.onended = () => resolve();
        audio.onerror = () => resolve();
        audio.play().catch(() => resolve());
      });

      URL.revokeObjectURL(url);
      audioRef.current = null;
    },
    [speechEnabled, voiceId],
  );

  const submit = useCallback(
    async (utterance: string) => {
      const text = utterance.trim();
      if (!text) return;

      stopRecognition();
      setInterim("");
      setPartial("");
      setStatus("thinking");

      const nextTurns: ConversationTurn[] = [...turnsRef.current, { role: "user", text }];
      setTurns(nextTurns);

      const controller = new AbortController();
      abortRef.current = controller;

      let reply = "";
      try {
        const response = await fetch("/api/converse", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ messages: nextTurns, context: getContextRef.current() }),
          signal: controller.signal,
        });

        if (!response.ok) {
          const detail = await response.json().catch(() => ({ error: "Request failed." }));
          throw new Error(detail.error ?? "Request failed.");
        }
        if (!response.body) throw new Error("No response body.");

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          reply += decoder.decode(value, { stream: true });
          setPartial(reply);
        }
      } catch (err) {
        if (controller.signal.aborted) return;
        setError(err instanceof Error ? err.message : "The reply failed.");
        setStatus(runningRef.current ? "listening" : "idle");
        if (runningRef.current) startRecognition();
        return;
      } finally {
        abortRef.current = null;
      }

      setTurns([...nextTurns, { role: "assistant", text: reply }]);
      setPartial("");

      if (!runningRef.current) {
        setStatus("idle");
        return;
      }

      setStatus("speaking");
      try {
        await speak(reply);
      } catch {
        // A failed synthesis should not end the conversation; the reply is
        // already on screen, so fall through to listening again.
      }

      if (runningRef.current) {
        setStatus("listening");
        startRecognition();
      } else {
        setStatus("idle");
      }
    },
    [speak, startRecognition, stopRecognition],
  );

  /**
   * Called by the voice-activity detector when the person has been quiet long
   * enough to count as finished. Exposed through a ref rather than returned,
   * so the detector can call the latest version without being re-created.
   */
  const handleTurnEnd = useCallback(() => {
    if (statusRef.current !== "listening") return;
    const utterance = (finalTextRef.current + interimTextRef.current).trim();
    finalTextRef.current = "";
    interimTextRef.current = "";
    if (utterance.length < 2) {
      setInterim("");
      return;
    }
    void submit(utterance);
  }, [submit]);

  const start = useCallback(() => {
    runningRef.current = true;
    finalTextRef.current = "";
    interimTextRef.current = "";
    setError(null);
    setStatus("listening");
    startRecognition();
  }, [startRecognition]);

  const stop = useCallback(() => {
    runningRef.current = false;
    abortRef.current?.abort();
    stopRecognition();
    audioRef.current?.pause();
    audioRef.current = null;
    setStatus("idle");
    setInterim("");
    setPartial("");
  }, [stopRecognition]);

  const interrupt = useCallback(() => {
    if (statusRef.current !== "speaking") return;
    audioRef.current?.pause();
    audioRef.current = null;
    if (runningRef.current) {
      setStatus("listening");
      startRecognition();
    }
  }, [startRecognition]);

  const sendText = useCallback(
    (text: string) => {
      runningRef.current = true;
      void submit(text);
    },
    [submit],
  );

  useEffect(
    () => () => {
      runningRef.current = false;
      abortRef.current?.abort();
      stopRecognition();
      audioRef.current?.pause();
    },
    [stopRecognition],
  );

  return {
    status,
    turns,
    partial,
    interim,
    error,
    recognitionAvailable,
    start,
    stop,
    sendText,
    interrupt,
    onTurnEnd: handleTurnEnd,
  };
}
