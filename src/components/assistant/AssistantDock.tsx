"use client";

import { useEffect, useRef, useState } from "react";

import { CompanionSettings } from "@/components/avatar/CompanionSettings";
import { TalkingPresenter, canPresent } from "@/components/avatar/TalkingPresenter";
import { useAssistant } from "@/hooks/useAssistant";
import { usePortrait } from "@/hooks/usePortrait";
import { useCompanionProfile } from "@/hooks/useCompanionProfile";
import { useServices } from "@/hooks/useServices";
import { browserSpeechAvailable } from "@/lib/avatar/browserSpeech";
import { avatarOr } from "@/lib/avatar/presets";
import { personaInstructions } from "@/lib/avatar/profile";
import { STATIC_BUILD } from "@/lib/paths";

/**
 * The assistant that follows you around the site.
 *
 * Every page here measures one thing and explains that one thing. The
 * question people actually have is rarely scoped that neatly — "is 118 over
 * 76 alright", "why does it keep saying low confidence", "what does HRV even
 * mean" — and making them finish a reading to ask it is the wrong shape. So
 * this sits in the corner of every page instead.
 *
 * Bottom left rather than the usual bottom right. Support widgets live on the
 * right and this is not one; more practically, the right-hand side is where
 * this app puts its own controls and a floating panel over them would cover
 * the thing being asked about.
 *
 * It has no access to the sensors. That is a deliberate limit rather than an
 * omission: a panel that can be opened from the reports page while a
 * measurement runs on another tab should not be narrating numbers it cannot
 * see. It answers questions; the agents interpret readings.
 */
export function AssistantDock() {
  const [open, setOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const { profile, update: updateProfile, ready } = useCompanionProfile();
  const { services, loaded: servicesLoaded } = useServices();
  const portrait = usePortrait();

  const [browserVoice, setBrowserVoice] = useState(false);
  useEffect(() => setBrowserVoice(browserSpeechAvailable()), []);

  // The dock is on every page, including pages loaded before the service
  // check has come back, so treat "not yet known" as having a model. A brief
  // wrong guess is better than answering the first question from the guide
  // when Claude was there all along.
  const guideOnly = servicesLoaded && !services.claude;

  const avatar = avatarOr(profile.avatarId);
  const assistant = useAssistant({
    persona: personaInstructions(profile),
    listenLanguage: profile.languageCode,
    speechEnabled: (services.polly || browserVoice) && profile.speakReplies,
    cloudSpeech: services.polly,
    source: guideOnly ? "guide" : "model",
    voiceId: profile.voiceId,
    speechRate: profile.speechRate,
  });

  const logRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  // Follow the conversation down as it grows, including while a reply streams.
  useEffect(() => {
    const log = logRef.current;
    if (log) log.scrollTop = log.scrollHeight;
  }, [assistant.messages, assistant.partial, open]);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  // Escape closes, from anywhere. A floating panel that can only be dismissed
  // by finding its small close button is a trap for keyboard users.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      // The settings dialog closes itself on Escape, and closing the panel
      // underneath at the same time would take the person two steps back.
      if (settingsOpen) return;
      if (e.key === "Escape") {
        setOpen(false);
        assistant.stopSpeaking();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, settingsOpen, assistant]);

  if (!ready) return null;

  const showFace =
    profile.presence === "presenter" &&
    canPresent(avatar.id, portrait.portrait, portrait.rig);

  const busy = assistant.status === "thinking";

  return (
    <>
      {settingsOpen && (
        <CompanionSettings
          profile={profile}
          onChange={updateProfile}
          onClose={() => setSettingsOpen(false)}
          speechAvailable={services.polly || browserVoice}
          cloudSpeech={services.polly}
          portrait={portrait}
        />
      )}

      {!open && (
        <button
          onClick={() => setOpen(true)}
          aria-label={`Ask ${avatar.name} a question`}
          className="fixed bottom-5 left-5 z-40 flex h-14 items-center gap-2.5 rounded-full border border-[var(--border)] bg-[var(--surface-raised)] pl-3 pr-4 shadow-lg backdrop-blur transition-transform hover:-translate-y-0.5"
        >
          <Spark color={avatar.palette.core} />
          <span className="text-[13px] font-medium text-[var(--foreground)]">
            Ask {avatar.name}
          </span>
        </button>
      )}

      {open && (
        <div
          ref={panelRef}
          role="dialog"
          aria-label={`Ask ${avatar.name}`}
          className="fixed bottom-5 left-5 z-40 flex max-h-[min(600px,calc(100dvh-2.5rem))] w-[min(380px,calc(100vw-2.5rem))] flex-col overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--surface)] shadow-2xl"
        >
          <header className="flex items-center gap-2.5 border-b border-[var(--border)] px-3.5 py-2.5">
            <Spark color={avatar.palette.core} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-[13px] font-medium text-[var(--foreground)]">
                {avatar.name}
              </p>
              <p className="truncate text-[11px] text-[var(--faint)]">
                {STATUS_LINE[assistant.status]}
              </p>
            </div>
            {/*
              The companion is chosen from here as well as from the session
              page. Somebody looking at a face in the corner of every page and
              wanting a different one — or their own — should not have to
              discover that the only way to change it is inside a measurement
              they have not started.
            */}
            <button
              onClick={() => setSettingsOpen(true)}
              aria-label="Change avatar"
              className="rounded-md px-2 py-1 text-[11px] text-[var(--faint)] transition-colors hover:text-[var(--foreground)]"
            >
              Change
            </button>

            {assistant.messages.length > 0 && (
              <button
                onClick={assistant.clear}
                className="rounded-md px-2 py-1 text-[11px] text-[var(--faint)] transition-colors hover:text-[var(--foreground)]"
              >
                Clear
              </button>
            )}
            <button
              onClick={() => {
                setOpen(false);
                assistant.stopSpeaking();
              }}
              aria-label="Close"
              className="flex h-7 w-7 items-center justify-center rounded-md text-[var(--muted)] transition-colors hover:text-[var(--foreground)]"
            >
              <svg viewBox="0 0 16 16" className="h-4 w-4" aria-hidden>
                <path
                  d="M4 4l8 8M12 4l-8 8"
                  stroke="currentColor"
                  strokeWidth="1.6"
                  strokeLinecap="round"
                />
              </svg>
            </button>
          </header>

          {showFace && (
            // Narrow on purpose. The face is here to make the panel feel
            // answered rather than to be looked at, and at full width it
            // pushes the conversation itself off the bottom of the panel.
            <div className="mx-auto w-[200px] border-b border-[var(--border)] p-3">
              <TalkingPresenter
                avatar={avatar}
                status={PRESENTER_STATUS[assistant.status]}
                readSpeech={assistant.readSpeech}
                languageCode={profile.languageCode}
                customImage={portrait.portrait}
                customRig={portrait.rig}
                compact
              />
            </div>
          )}

          <div ref={logRef} className="flex-1 space-y-2.5 overflow-y-auto px-3.5 py-3">
            {assistant.messages.length === 0 && !assistant.partial && (
              <Welcome
                name={avatar.name}
                guide={guideOnly}
                onPick={(q) => assistant.send(q)}
              />
            )}

            {assistant.messages.map((message, i) => (
              <Bubble key={i} role={message.role} accent={avatar.palette.core}>
                {message.text}
              </Bubble>
            ))}

            {assistant.partial && (
              <Bubble role="assistant" accent={avatar.palette.core}>
                {assistant.partial}
              </Bubble>
            )}

            {busy && !assistant.partial && (
              <p className="text-[12px] text-[var(--faint)]">Thinking…</p>
            )}

            {assistant.interim && (
              <Bubble role="user" accent={avatar.palette.core} faint>
                {assistant.interim}
              </Bubble>
            )}

            {assistant.error && (
              <p className="text-[11.5px]" style={{ color: "var(--bad)" }}>
                {assistant.error}
              </p>
            )}
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              assistant.send(draft);
              setDraft("");
            }}
            className="flex items-center gap-2 border-t border-[var(--border)] px-2.5 py-2.5"
          >
            {assistant.recognitionAvailable && (
              <button
                type="button"
                onClick={assistant.toggleListening}
                aria-label={assistant.listening ? "Stop listening" : "Speak your question"}
                aria-pressed={assistant.listening}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border transition-colors"
                style={
                  assistant.listening
                    ? {
                        borderColor: avatar.palette.core,
                        background: avatar.palette.glow,
                        color: avatar.palette.core,
                      }
                    : { borderColor: "var(--border)", color: "var(--muted)" }
                }
              >
                <Mic listening={assistant.listening} />
              </button>
            )}

            <input
              ref={inputRef}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="Ask anything, in any language"
              aria-label="Your question"
              className="min-w-0 flex-1 rounded-lg border border-[var(--border)] bg-[var(--surface-raised)] px-3 py-2 text-[13px] text-[var(--foreground)] outline-none placeholder:text-[var(--faint)] focus:border-[var(--accent)]"
            />

            <button
              type="submit"
              disabled={!draft.trim() || busy}
              aria-label="Send"
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-[var(--surface)] transition-opacity disabled:opacity-30"
              style={{ background: avatar.palette.core }}
            >
              <svg viewBox="0 0 16 16" className="h-4 w-4" aria-hidden>
                <path
                  d="M2.5 8h10M8.5 3.5L13 8l-4.5 4.5"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.7"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </button>
          </form>

          <p className="border-t border-[var(--border)] px-3.5 py-2 text-[10.5px] leading-snug text-[var(--faint)]">
            General information, not medical advice, and it cannot see your measurements.{" "}
            {guideOnly
              ? "Answers come from a written list, in English."
              : "Replies come back in the language you write in."}
          </p>
        </div>
      )}
    </>
  );
}

const STATUS_LINE: Record<string, string> = {
  idle: "Type or talk, in any language",
  listening: "Listening…",
  thinking: "Thinking…",
  speaking: "Speaking",
};

const PRESENTER_STATUS = {
  idle: "idle",
  listening: "listening",
  thinking: "thinking",
  speaking: "speaking",
} as const;

const OPENERS = [
  "What does HRV actually mean?",
  "Why is my confidence score low?",
  "How should I sit for a good reading?",
];

function Welcome({
  name,
  guide,
  onPick,
}: {
  name: string;
  guide: boolean;
  onPick: (q: string) => void;
}) {
  return (
    <div className="py-1">
      <p className="text-[12.5px] leading-relaxed text-[var(--muted)]">
        Hello — I&rsquo;m {name}. Ask me about anything on this site, or about what a reading
        means.{" "}
        {guide
          ? "The three below are the sort of thing I can answer."
          : "Write or speak in whatever language you like."}
      </p>
      {/*
        Said before the first question rather than after it fails. Somebody
        who types into a chat window and gets an answer from a list, without
        being told, has been misled about what they are talking to.
      */}
      {guide && (
        <p className="mt-2 rounded-lg bg-[var(--surface-raised)] px-2.5 py-2 text-[11.5px] leading-relaxed text-[var(--faint)]">
          There is no language model behind this copy, so my answers come from a written list
          and only cover the common questions — in English, whatever language you ask in.{" "}
          {STATIC_BUILD
            ? "This is the free public copy, a static site with no server, so no key can be kept here."
            : "Set an Anthropic key and restart to have the real conversation."}{" "}
          Every measurement on the site is real and runs in your browser.
        </p>
      )}
      <div className="mt-2.5 flex flex-col items-start gap-1.5">
        {OPENERS.map((question) => (
          <button
            key={question}
            onClick={() => onPick(question)}
            className="rounded-lg border border-[var(--border)] px-2.5 py-1.5 text-left text-[11.5px] text-[var(--muted)] transition-colors hover:text-[var(--foreground)]"
          >
            {question}
          </button>
        ))}
      </div>
    </div>
  );
}

function Bubble({
  role,
  accent,
  faint = false,
  children,
}: {
  role: "user" | "assistant";
  accent: string;
  faint?: boolean;
  children: React.ReactNode;
}) {
  const mine = role === "user";
  return (
    <div className={mine ? "flex justify-end" : "flex justify-start"}>
      <p
        className="max-w-[85%] whitespace-pre-wrap rounded-xl px-3 py-2 text-[12.5px] leading-relaxed"
        style={
          mine
            ? {
                background: `${accent}1f`,
                color: "var(--foreground)",
                opacity: faint ? 0.55 : 1,
              }
            : { background: "var(--surface-raised)", color: "var(--foreground)" }
        }
      >
        {children}
      </p>
    </div>
  );
}

function Spark({ color }: { color: string }) {
  return (
    <span
      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full"
      style={{ background: `${color}26` }}
    >
      <svg viewBox="0 0 20 20" className="h-4.5 w-4.5" aria-hidden>
        <path
          d="M10 2.5l1.6 4.4 4.4 1.6-4.4 1.6L10 14.5l-1.6-4.4L4 8.5l4.4-1.6z"
          fill={color}
        />
        <circle cx="15.5" cy="15" r="1.6" fill={color} opacity="0.6" />
      </svg>
    </span>
  );
}

function Mic({ listening }: { listening: boolean }) {
  return (
    <svg viewBox="0 0 16 16" className="h-4 w-4" aria-hidden>
      <rect x="6" y="2" width="4" height="7.5" rx="2" fill="currentColor" />
      <path
        d="M3.75 7.5a4.25 4.25 0 008.5 0M8 11.75V14"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
      {listening && <circle cx="13" cy="3" r="2" fill="currentColor" />}
    </svg>
  );
}
