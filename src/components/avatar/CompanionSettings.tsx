"use client";

import { useEffect, useRef, useState } from "react";

import { AvatarPresence } from "@/components/AvatarPresence";
import { PortraitPresence } from "@/components/avatar/PortraitPresence";
import {
  AGE_BANDS,
  avatarOr,
  avatarsForAge,
  voicesForAge,
  type AgeBand,
  type AvatarPreset,
} from "@/lib/avatar/presets";
import { ACCEPTED_TYPES } from "@/lib/avatar/portrait";
import { SKIN_TONES } from "@/components/sign/render";
import type { usePortrait } from "@/hooks/usePortrait";
import { LANGUAGES, languageOr } from "@/lib/avatar/languages";
import type { CaptionMode, CompanionProfile, PresenceStyle } from "@/lib/avatar/profile";
import {
  clampRate,
  describeRate,
  RATE_MAX,
  RATE_MIN,
  voiceForLanguage,
  type VoiceOption,
} from "@/lib/avatar/voices";

/**
 * Choosing and editing the companion.
 *
 * Two things drove the layout. The avatar previews are live rather than static
 * images, because these are animated presences and a still frame of one tells
 * you almost nothing about what you are picking. And the voice options can be
 * heard before they are chosen, because no written description of a voice —
 * "warm and unhurried" — is a substitute for two seconds of hearing it.
 *
 * The access settings sit in the same panel as everything else rather than
 * behind a separate "accessibility" door. They are ordinary preferences that
 * plenty of people want, and filing them away implies they are for somebody
 * else.
 */

const PREVIEW_LINE =
  "Hello. I can see your pulse from the camera while we talk, and I will tell you when the signal is not good enough to trust.";

export function CompanionSettings({
  profile,
  onChange,
  onClose,
  speechAvailable,
  portrait,
}: {
  profile: CompanionProfile;
  onChange: (next: CompanionProfile) => void;
  onClose: () => void;
  speechAvailable: boolean;
  portrait: ReturnType<typeof usePortrait>;
}) {
  const [previewing, setPreviewing] = useState<string | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const dialogRef = useRef<HTMLDivElement>(null);

  const avatar = avatarOr(profile.avatarId);
  const avatars = avatarsForAge(profile.ageBand);
  const voices = voicesForAge(profile.ageBand, profile.languageCode);
  const language = languageOr(profile.languageCode);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    dialogRef.current?.focus();
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  useEffect(
    () => () => {
      audioRef.current?.pause();
      audioRef.current = null;
    },
    [],
  );

  const set = (patch: Partial<CompanionProfile>) => onChange({ ...profile, ...patch });

  /**
   * Choosing an avatar also moves the voice to that avatar's own, but only
   * when the person has not already picked a voice for themselves. Overriding
   * a deliberate voice choice because they wanted to try a different look
   * would be infuriating.
   */
  const chooseAvatar = (next: AvatarPreset) => {
    const currentIsDefault = profile.voiceId === avatar.defaultVoiceId;
    set({
      avatarId: next.id,
      voiceId: currentIsDefault ? next.defaultVoiceId : profile.voiceId,
    });
  };

  const previewVoice = async (voice: VoiceOption) => {
    if (!speechAvailable) return;
    setPreviewError(null);
    audioRef.current?.pause();
    setPreviewing(voice.id);
    try {
      const response = await fetch("/api/speak", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: PREVIEW_LINE,
          voice: voice.polly ?? voice.id,
          rate: profile.speechRate,
        }),
      });
      if (!response.ok) throw new Error("Preview failed");
      const url = URL.createObjectURL(await response.blob());
      const audio = new Audio(url);
      audioRef.current = audio;
      audio.onended = () => {
        setPreviewing(null);
        URL.revokeObjectURL(url);
      };
      await audio.play();
    } catch {
      setPreviewError("Could not play the preview. Check the AWS credentials.");
      setPreviewing(null);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/70 p-4 backdrop-blur-sm sm:p-8"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label="Companion settings"
        tabIndex={-1}
        className="panel w-full max-w-3xl outline-none"
      >
        <header className="flex items-center justify-between border-b border-[var(--border)] px-5 py-4">
          <div>
            <h2 className="text-[15px] font-semibold text-[var(--foreground)]">
              Your companion
            </h2>
            <p className="mt-0.5 text-[12px] text-[var(--muted)]">
              Saved on this device only. Nothing here is sent anywhere.
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-[12px] text-[var(--muted)] transition-colors hover:text-[var(--foreground)]"
          >
            Done
          </button>
        </header>

        <div className="space-y-7 px-5 py-5">
          <Section
            title="Who is this for"
            detail="Only changes which options are suggested first. Everything stays available."
          >
            <div className="flex flex-wrap gap-2">
              {AGE_BANDS.map((band) => (
                <Choice
                  key={band.id}
                  selected={profile.ageBand === band.id}
                  onClick={() => set({ ageBand: band.id as AgeBand })}
                  accent={avatar.palette.core}
                >
                  <span className="font-medium">{band.label}</span>
                  <span className="ml-1.5 text-[var(--faint)]">{band.detail}</span>
                </Choice>
              ))}
            </div>
          </Section>

          <Section title="Name" detail="What the companion should call you. Optional.">
            <input
              value={profile.displayName}
              onChange={(e) => set({ displayName: e.target.value.slice(0, 40) })}
              placeholder="Leave blank to stay anonymous"
              className="w-full max-w-xs rounded-lg border border-[var(--border)] bg-[var(--surface-raised)] px-3 py-2 text-[13px] text-[var(--foreground)] outline-none placeholder:text-[var(--faint)] focus:border-[var(--border-strong)]"
            />
          </Section>

          <Section
            title="Look"
            detail="A drawn face, or a shape that moves with your pulse and your voice."
          >
            <div className="mb-3 flex flex-wrap gap-2">
              {(
                [
                  ["portrait", "A face"],
                  ["abstract", "A shape"],
                ] as Array<[PresenceStyle, string]>
              ).map(([style, label]) => (
                <Choice
                  key={style}
                  selected={profile.presence === style}
                  onClick={() => set({ presence: style })}
                  accent={avatar.palette.core}
                >
                  {label}
                </Choice>
              ))}
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              {avatars.map((option) => {
                const selected = option.id === profile.avatarId;
                return (
                  <button
                    key={option.id}
                    onClick={() => chooseAvatar(option)}
                    aria-pressed={selected}
                    className="group rounded-xl border p-2 text-left transition-all hover:-translate-y-0.5"
                    style={{
                      borderColor: selected ? option.palette.core : "var(--border)",
                      background: selected ? `${option.palette.core}12` : "var(--surface-raised)",
                      boxShadow: selected ? `0 0 0 1px ${option.palette.core}55` : "none",
                    }}
                  >
                    <div className="pointer-events-none overflow-hidden rounded-lg">
                      {profile.presence === "portrait" ? (
                        <PortraitPresence
                          avatar={option}
                          status="listening"
                          level={0.35}
                          heartRateBpm={72}
                          height={92}
                          compact
                          customImage={selected ? portrait.portrait : null}
                        />
                      ) : (
                        <AvatarPresence
                          avatar={option}
                          status="listening"
                          level={0.35}
                          heartRateBpm={72}
                          height={92}
                          compact
                        />
                      )}
                    </div>
                    <div className="mt-2 px-1 pb-1">
                      <div
                        className="text-[13px] font-semibold"
                        style={{ color: selected ? option.palette.core : "var(--foreground)" }}
                      >
                        {option.name}
                      </div>
                      <div className="mt-0.5 text-[11px] leading-snug text-[var(--muted)]">
                        {option.tagline}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>

            {profile.presence === "portrait" && (
              <PortraitUpload avatar={avatar} portrait={portrait} />
            )}
          </Section>

          <Section
            title="Language"
            detail="What you speak, and what the companion answers in. Changing this also changes which voices are available."
          >
            <div className="flex flex-wrap gap-1.5">
              {LANGUAGES.map((option) => {
                const selected = option.code === profile.languageCode;
                return (
                  <Choice
                    key={option.code}
                    selected={selected}
                    onClick={() =>
                      set({
                        languageCode: option.code,
                        // A voice cannot follow the language across; it would
                        // read the new one with the wrong phonology.
                        voiceId: voiceForLanguage(option.code, profile.voiceId),
                      })
                    }
                    accent={avatar.palette.core}
                  >
                    <span className="font-medium">{option.endonym}</span>
                    {option.endonym !== option.name && (
                      <span className="ml-1.5 text-[var(--faint)]">{option.name}</span>
                    )}
                  </Choice>
                );
              })}
            </div>
            <p className="mt-2.5 text-[11.5px] leading-relaxed text-[var(--muted)]">
              Someone describing chest pain reaches for the words they learned
              as a child. Measurements stay as digits and standard units in
              every language, because those are what a clinician will ask you
              to repeat.
            </p>
          </Section>

          <Section
            title={`Voice — ${language.endonym}`}
            detail={
              speechAvailable
                ? "Press play to hear each one before you choose."
                : "Add AWS credentials to hear the replies spoken aloud."
            }
          >
            <div className="grid gap-2 sm:grid-cols-2">
              {voices.map((voice) => {
                const selected = voice.id === profile.voiceId;
                return (
                  <div
                    key={voice.id}
                    className="flex items-center gap-2 rounded-lg border px-3 py-2 transition-colors"
                    style={{
                      borderColor: selected ? avatar.palette.core : "var(--border)",
                      background: selected
                        ? `${avatar.palette.core}12`
                        : "var(--surface-raised)",
                    }}
                  >
                    <button
                      onClick={() => set({ voiceId: voice.id })}
                      aria-pressed={selected}
                      className="min-w-0 flex-1 text-left"
                    >
                      <div className="flex items-baseline gap-2">
                        <span
                          className="text-[13px] font-medium"
                          style={{
                            color: selected ? avatar.palette.core : "var(--foreground)",
                          }}
                        >
                          {voice.name}
                        </span>
                        <span className="truncate text-[11px] text-[var(--faint)]">
                          {voice.accent}
                        </span>
                      </div>
                      <div className="mt-0.5 truncate text-[11px] text-[var(--muted)]">
                        {voice.character}
                      </div>
                    </button>
                    <button
                      onClick={() => void previewVoice(voice)}
                      disabled={!speechAvailable}
                      aria-label={`Hear ${voice.name}`}
                      className="shrink-0 rounded-md border border-[var(--border)] px-2 py-1 text-[11px] text-[var(--muted)] transition-colors hover:text-[var(--foreground)] disabled:opacity-30"
                    >
                      {previewing === voice.id ? "…" : "▶"}
                    </button>
                  </div>
                );
              })}
            </div>
            {previewError && (
              <p className="mt-2 text-[12px]" style={{ color: "var(--bad)" }}>
                {previewError}
              </p>
            )}
          </Section>

          <Section
            title="Speaking speed"
            detail="Slower is easier to follow, and easier to read along with."
          >
            <div className="flex items-center gap-4">
              <input
                type="range"
                min={RATE_MIN}
                max={RATE_MAX}
                step={5}
                value={profile.speechRate}
                onChange={(e) => set({ speechRate: clampRate(Number(e.target.value)) })}
                className="w-full max-w-xs accent-[var(--accent)]"
                aria-label="Speaking speed"
              />
              <span className="tabular w-28 shrink-0 text-[12px] text-[var(--muted)]">
                {describeRate(profile.speechRate)} · {profile.speechRate}%
              </span>
            </div>
          </Section>

          <Section
            title="Reading and hearing"
            detail="Turn on the access mode if you are Deaf, hard of hearing, or would rather type than speak."
          >
            <div className="space-y-2">
              <Toggle
                label="Access mode"
                detail="Large captions, typing put first, and every sound cue given a visible equivalent."
                checked={profile.accessMode}
                onChange={(v) =>
                  set({ accessMode: v, captions: v ? "large" : profile.captions })
                }
                accent={avatar.palette.core}
              />
              <Toggle
                label="Speak the replies out loud"
                detail={
                  speechAvailable
                    ? "Uses Amazon Polly."
                    : "Needs AWS credentials before it can be turned on."
                }
                checked={profile.speakReplies && speechAvailable}
                disabled={!speechAvailable}
                onChange={(v) => set({ speakReplies: v })}
                accent={avatar.palette.core}
              />
              <Toggle
                label="Plain language"
                detail="Short sentences and everyday words, with no clinical terms left unexplained."
                checked={profile.simpleLanguage}
                onChange={(v) => set({ simpleLanguage: v })}
                accent={avatar.palette.core}
              />
            </div>

            {/*
              Fingerspelling is offered as what it is and nothing more.

              A signing avatar is a linguistics problem, not a rendering one:
              BSL, ASL and ISL are separate languages whose grammar lives in
              facial expression, body shift and the space in front of the
              signer as much as in the hands. That is not built without Deaf
              signers in the room. The manual alphabet is a different and much
              smaller thing, it is genuinely what signers use for names,
              numbers and medical terms, and it can be done properly — so it
              is here, under its own name.
            */}
            <div className="mt-3 rounded-lg border border-[var(--border)] bg-[var(--surface-raised)] p-3">
              <Toggle
                label="Fingerspell numbers and names"
                detail="A drawn hand spells the measurements and names out of each reply, next to the caption."
                checked={profile.fingerspelling}
                onChange={(v) => set({ fingerspelling: v })}
                accent={avatar.palette.core}
              />

              {profile.fingerspelling && (
                <div className="mt-3 flex items-center gap-3 border-t border-[var(--border)] pt-3">
                  <span className="text-[11.5px] text-[var(--muted)]">Skin tone</span>
                  {SKIN_TONES.map((option) => (
                    <button
                      key={option.id}
                      onClick={() => set({ signTone: option.id })}
                      aria-pressed={profile.signTone === option.id}
                      aria-label={option.label}
                      className="h-7 w-7 rounded-full border-2 transition-transform hover:scale-105"
                      style={{
                        background: option.tone.base,
                        borderColor:
                          profile.signTone === option.id ? "var(--foreground)" : "transparent",
                      }}
                    />
                  ))}
                </div>
              )}

              <p className="mt-3 border-t border-[var(--border)] pt-3 text-[11.5px] leading-relaxed text-[var(--muted)]">
                This is the ASL manual alphabet, not sign language. ASL, BSL
                and ISL are full languages whose grammar lives in movement,
                facial expression and the space in front of the signer, and a
                single drawn hand cannot produce any of it — calling this
                signing would be a promise of access we could not keep. What
                fingerspelling genuinely carries is names, numbers and medical
                terms, which is what it is used for here.{" "}
                <a href="/sign" className="underline underline-offset-2 hover:text-[var(--foreground)]">
                  See the full alphabet
                </a>
                .
              </p>
            </div>

            <div className="mt-3">
              <div className="mb-1.5 text-[12px] text-[var(--muted)]">Captions</div>
              <div className="flex flex-wrap gap-2">
                {(
                  [
                    ["off", "Off"],
                    ["on", "On"],
                    ["large", "Large"],
                  ] as Array<[CaptionMode, string]>
                ).map(([mode, label]) => (
                  <Choice
                    key={mode}
                    selected={profile.captions === mode}
                    onClick={() => set({ captions: mode, accessMode: mode === "off" ? false : profile.accessMode })}
                    accent={avatar.palette.core}
                  >
                    {label}
                  </Choice>
                ))}
              </div>
            </div>
          </Section>
        </div>
      </div>
    </div>
  );
}

function Section({
  title,
  detail,
  children,
}: {
  title: string;
  detail?: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <h3 className="text-[11px] font-medium uppercase tracking-[0.14em] text-[var(--faint)]">
        {title}
      </h3>
      {detail && (
        <p className="mt-1 text-[12px] leading-relaxed text-[var(--muted)]">{detail}</p>
      )}
      <div className="mt-3">{children}</div>
    </section>
  );
}

function Choice({
  selected,
  onClick,
  accent,
  children,
}: {
  selected: boolean;
  onClick: () => void;
  accent: string;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      aria-pressed={selected}
      className="rounded-lg border px-3 py-1.5 text-[12px] transition-colors"
      style={{
        borderColor: selected ? accent : "var(--border)",
        background: selected ? `${accent}14` : "var(--surface-raised)",
        color: selected ? accent : "var(--muted)",
      }}
    >
      {children}
    </button>
  );
}

function Toggle({
  label,
  detail,
  checked,
  onChange,
  accent,
  disabled = false,
}: {
  label: string;
  detail: string;
  checked: boolean;
  onChange: (value: boolean) => void;
  accent: string;
  disabled?: boolean;
}) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className="flex w-full items-start gap-3 rounded-lg border border-[var(--border)] bg-[var(--surface-raised)] px-3 py-2.5 text-left transition-colors hover:border-[var(--border-strong)] disabled:opacity-40"
    >
      <span
        className="mt-0.5 flex h-4 w-7 shrink-0 items-center rounded-full p-0.5 transition-colors"
        style={{ background: checked ? accent : "var(--border)" }}
      >
        <span
          className="h-3 w-3 rounded-full bg-white transition-transform"
          style={{ transform: checked ? "translateX(12px)" : "translateX(0)" }}
        />
      </span>
      <span className="min-w-0">
        <span className="block text-[12.5px] font-medium text-[var(--foreground)]">
          {label}
        </span>
        <span className="mt-0.5 block text-[11px] leading-snug text-[var(--muted)]">
          {detail}
        </span>
      </span>
    </button>
  );
}

/**
 * Uploading your own picture.
 *
 * The note is the point of this control as much as the button is. People
 * upload a photograph of their own doctor, or of a relative, expecting the
 * face to talk — and there is a real line between animating an illustration
 * and animating a photograph of a person who never agreed to say any of this.
 * Saying so here is more use than discovering it later and assuming the
 * feature is broken.
 */
function PortraitUpload({
  avatar,
  portrait,
}: {
  avatar: AvatarPreset;
  portrait: ReturnType<typeof usePortrait>;
}) {
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <div className="mt-3 rounded-lg border border-[var(--border)] bg-[var(--surface-raised)] p-3.5">
      <div className="flex flex-wrap items-center gap-3">
        <button
          onClick={() => inputRef.current?.click()}
          disabled={portrait.busy}
          className="rounded-lg border px-3 py-1.5 text-[12px] font-medium transition-colors disabled:opacity-40"
          style={{ borderColor: `${avatar.palette.core}66`, color: avatar.palette.core }}
        >
          {portrait.busy ? "Working…" : portrait.portrait ? "Use a different picture" : "Use my own picture"}
        </button>
        {portrait.portrait && (
          <button
            onClick={portrait.clear}
            className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-[12px] text-[var(--muted)] transition-colors hover:text-[var(--foreground)]"
          >
            Remove
          </button>
        )}
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPTED_TYPES.join(",")}
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void portrait.upload(file);
            e.target.value = "";
          }}
        />
      </div>

      {portrait.error && (
        <p className="mt-2 text-[11.5px]" style={{ color: "var(--bad)" }}>
          {portrait.error}
        </p>
      )}

      <p className="mt-2.5 text-[11.5px] leading-relaxed text-[var(--muted)]">
        The picture is cropped and stored in this browser. It is never
        uploaded, and the re-encoding strips the location your phone recorded
        with it.
      </p>
      <p className="mt-1.5 text-[11.5px] leading-relaxed text-[var(--faint)]">
        The face stays still and does not move its mouth. Driving a mouth from
        the audio is the technique behind deepfakes, and on something that
        says &ldquo;your blood pressure looks raised&rdquo; it would put words in
        the mouth of a person who never said them. The pulse ring and the rim
        carry the movement instead.
      </p>
    </div>
  );
}
