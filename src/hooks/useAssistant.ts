"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { mirrorLanguageInstructions } from "@/lib/avatar/languages";
import { speakReply, type SpokenReply } from "@/lib/avatar/say";
import type { SpeechAnalysis } from "@/lib/avatar/speechAudio";
import type { ConversationTurn } from "@/lib/conversation";
import { guideReply } from "@/lib/guide";
import type { SpeechFrame } from "./useConversation";
import { api, NO_SERVER } from "@/lib/paths";

/**
 * The assistant that sits over every page.
 *
 * Deliberately a separate hook from `useConversation` rather than a
 * configuration of it, because the two are doing different jobs and sharing
 * the code would mean bolting flags onto the harder one.
 *
 * `useConversation` runs a hands-free measurement session: it listens
 * continuously, decides on its own when a turn has ended using the
 * voice-activity detector, and stops the recogniser while the assistant talks
 * so the session cannot hear itself. That machinery exists because the person
 * is sitting still being measured and cannot be clicking things.
 *
 * This one is a chat window. Somebody opens it, asks a question, and closes
 * it. Turns end when they press send or stop talking to the microphone, and
 * there is no measurement running to protect. What it gains instead is
 * language: rather than answering in a language chosen in advance, it answers
 * in whatever language the question arrived in.
 */

export type AssistantStatus = "idle" | "listening" | "thinking" | "speaking";

export interface AssistantOptions {
  /** Manner instructions from the chosen companion. */
  persona?: string;
  /** BCP-47 tag the recogniser listens for. The reply follows the input. */
  listenLanguage: string;
  /** Whether replies should be spoken at all. */
  speechEnabled: boolean;
  /** Whether Polly is configured; when false the browser's own voice speaks. */
  cloudSpeech?: boolean;
  /** Where the answers come from when there is no model to ask. */
  source?: "model" | "guide";
  voiceId?: string;
  speechRate?: number;
}

export interface AssistantState {
  messages: ConversationTurn[];
  status: AssistantStatus;
  /** The reply as it streams in. */
  partial: string;
  /** What the recogniser currently thinks it is hearing. */
  interim: string;
  error: string | null;
  recognitionAvailable: boolean;
  listening: boolean;
  send: (text: string) => void;
  toggleListening: () => void;
  stopSpeaking: () => void;
  clear: () => void;
  readSpeech: () => SpeechFrame | null;
}

interface RecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult: ((event: RecognitionEventLike) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
}

interface RecognitionEventLike {
  resultIndex: number;
  results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }>;
}

type RecognitionCtor = new () => RecognitionLike;

function getConstructor(): RecognitionCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as {
    SpeechRecognition?: RecognitionCtor;
    webkitSpeechRecognition?: RecognitionCtor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

/** Long enough to be useful, short enough to stay inside the context window. */
const MAX_HISTORY = 16;

export function useAssistant(options: AssistantOptions): AssistantState {
  const {
    persona,
    listenLanguage,
    speechEnabled,
    cloudSpeech = false,
    source = "model",
    voiceId,
    speechRate = 100,
  } = options;

  const [messages, setMessages] = useState<ConversationTurn[]>([]);
  const [status, setStatus] = useState<AssistantStatus>("idle");
  const [partial, setPartial] = useState("");
  const [interim, setInterim] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [listening, setListening] = useState(false);
  const [recognitionAvailable, setRecognitionAvailable] = useState(false);

  const messagesRef = useRef<ConversationTurn[]>([]);
  messagesRef.current = messages;

  const sourceRef = useRef(source);
  sourceRef.current = source;

  const recognitionRef = useRef<RecognitionLike | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const speechRef = useRef<SpokenReply | null>(null);
  const analysisRef = useRef<SpeechAnalysis | null>(null);

  useEffect(() => {
    setRecognitionAvailable(getConstructor() !== null);
  }, []);

  const speak = useCallback(
    async (text: string) => {
      if (!speechEnabled || !text.trim()) return;
      try {
        const spoken = await speakReply(
          {
            text,
            voiceId,
            ratePercent: speechRate,
            languageCode: listenLanguage,
            cloud: cloudSpeech,
          },
          analysisRef,
        );
        if (!spoken) return;

        speechRef.current = spoken.reply;
        await spoken.done;
        if (speechRef.current === spoken.reply) speechRef.current = null;
      } catch {
        // A failed synthesis is not a failed answer; the text is on screen.
        speechRef.current = null;
      }
    },
    [speechEnabled, cloudSpeech, voiceId, speechRate, listenLanguage],
  );

  const send = useCallback(
    (raw: string) => {
      const text = raw.trim();
      if (!text || status === "thinking") return;

      setError(null);
      setInterim("");
      setStatus("thinking");

      const next = [...messagesRef.current, { role: "user" as const, text }].slice(-MAX_HISTORY);
      setMessages(next);

      void (async () => {
        const controller = new AbortController();
        abortRef.current = controller;

        let reply = "";
        try {
          if (sourceRef.current === "guide") {
            // No context: this window cannot see the sensors, so the guide
            // has nothing to read back and says so if it is asked to.
            reply = guideReply(text).text;
            setPartial(reply);
          } else {
            const converseUrl = api("/api/converse");
            if (!converseUrl) throw new Error(NO_SERVER);
            const response = await fetch(converseUrl, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                messages: next,
                // No sensors are running behind a floating chat window, and
                // saying so plainly is better than sending a snapshot of
                // nulls that reads like a failed measurement.
                context: { vitals: null, voice: null, sessionSeconds: 0 },
                persona: [persona, mirrorLanguageInstructions()].filter(Boolean).join("\n"),
              }),
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
          }
        } catch (err) {
          if (controller.signal.aborted) return;
          setError(err instanceof Error ? err.message : "The reply failed.");
          setStatus("idle");
          setPartial("");
          return;
        } finally {
          abortRef.current = null;
        }

        setMessages((prev) =>
          [...prev, { role: "assistant" as const, text: reply }].slice(-MAX_HISTORY),
        );
        setPartial("");

        setStatus("speaking");
        await speak(reply);
        setStatus("idle");
      })();
    },
    [persona, speak, status],
  );

  const sendRef = useRef(send);
  sendRef.current = send;

  const stopListening = useCallback(() => {
    const recognition = recognitionRef.current;
    recognitionRef.current = null;
    setListening(false);
    if (!recognition) return;
    recognition.onend = null;
    try {
      recognition.abort();
    } catch {
      // Already stopped.
    }
  }, []);

  const startListening = useCallback(() => {
    const Ctor = getConstructor();
    if (!Ctor || recognitionRef.current) return;

    const recognition = new Ctor();
    recognition.lang = listenLanguage;
    recognition.continuous = false;
    recognition.interimResults = true;

    let finalText = "";

    recognition.onresult = (event) => {
      let interimText = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        const transcript = result[0]?.transcript ?? "";
        if (result.isFinal) finalText += transcript;
        else interimText += transcript;
      }
      setInterim(finalText + interimText);
    };

    recognition.onerror = (event) => {
      if (event.error !== "aborted" && event.error !== "no-speech") {
        setError("The microphone could not be used. Type instead.");
      }
    };

    /**
     * Submitting on end rather than on a final result.
     *
     * Browser recognisers finalise on their own schedule and will happily
     * emit several final results for one sentence. Waiting for the recogniser
     * to close means one message per press of the button, which is what the
     * button appears to promise.
     */
    recognition.onend = () => {
      recognitionRef.current = null;
      setListening(false);
      setStatus((current) => (current === "listening" ? "idle" : current));
      const spoken = finalText.trim();
      setInterim("");
      if (spoken.length > 1) sendRef.current(spoken);
    };

    try {
      recognition.start();
      recognitionRef.current = recognition;
      setListening(true);
      setStatus("listening");
      setError(null);
    } catch {
      setError("The microphone could not be started.");
    }
  }, [listenLanguage]);

  const toggleListening = useCallback(() => {
    if (recognitionRef.current) stopListening();
    else startListening();
  }, [startListening, stopListening]);

  const stopSpeaking = useCallback(() => {
    speechRef.current?.stop();
    speechRef.current = null;
    setStatus("idle");
  }, []);

  const clear = useCallback(() => {
    abortRef.current?.abort();
    setMessages([]);
    setPartial("");
    setError(null);
  }, []);

  const readSpeech = useCallback((): SpeechFrame | null => {
    const current = speechRef.current;
    if (!current) return null;
    return { text: current.text, ...current.read() };
  }, []);

  useEffect(
    () => () => {
      abortRef.current?.abort();
      speechRef.current?.stop();
      recognitionRef.current?.abort();
    },
    [],
  );

  return {
    messages,
    status,
    partial,
    interim,
    error,
    recognitionAvailable,
    listening,
    send,
    toggleListening,
    stopSpeaking,
    clear,
    readSpeech,
  };
}
