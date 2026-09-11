"use client";

import { useMemo, useState } from "react";

import { LEXICON } from "@/lib/sign/lexicon";
import { compose, coverage, glossOf } from "@/lib/sign/compose";
import { SigningAvatar } from "./SigningAvatar";
import { SKIN_TONES } from "./render";

/**
 * The signing page.
 *
 * Same principle as the fingerspelling page: type anything, watch what comes
 * out, and judge it for yourself. The whole lexicon is listed with a written
 * description of how each sign is really made, so a signer can check the
 * avatar against what they know rather than taking it on trust.
 */

/*
 * The first three are a minimal triple.
 *
 * Same words, three grammars: a statement, a yes/no question and a
 * wh-question. Only the face changes between them, which is the whole point
 * — in ASL the brows are doing the work that a question mark and word order
 * do in English. Put side by side as one-click examples, the contrast is
 * visible in about ten seconds without anyone having to type.
 */
const EXAMPLES = [
  "You feel tired.",
  "Do you feel tired?",
  "How do you feel?",
  "Hello. How do you feel now?",
  "Your heart rate is 72.",
  "Breathe slowly with me.",
  "Take your medicine and rest.",
  "Do you have pain? Show me where.",
];

export function SigningStudio() {
  const [text, setText] = useState("Hello. How do you feel now?");
  const [speed, setSpeed] = useState(1);
  const [toneId, setToneId] = useState(SKIN_TONES[1].id);
  const [spellUnknown, setSpellUnknown] = useState(false);

  const tone = SKIN_TONES.find((t) => t.id === toneId)?.tone ?? SKIN_TONES[1].tone;
  const stats = useMemo(() => coverage(text), [text]);
  const segments = useMemo(() => compose(text, { spellUnknown }), [text, spellUnknown]);

  return (
    <div className="space-y-7">
      <div className="grid gap-4 lg:grid-cols-[380px_1fr]">
        <SigningAvatar
          text={text}
          accent="#f0a04b"
          tone={tone}
          speed={speed}
          spellUnknown={spellUnknown}
          loop
          height={340}
        />

        <div className="panel space-y-5 p-5">
          <label className="block">
            <span className="text-[11px] font-medium uppercase tracking-[0.14em] text-[var(--faint)]">
              Sign this
            </span>
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value.slice(0, 200))}
              rows={2}
              className="mt-2 w-full resize-none rounded-lg border border-[var(--border)] bg-[var(--surface-raised)] px-3 py-2.5 text-[15px] text-[var(--foreground)] outline-none focus:border-[var(--border-strong)]"
            />
            <span className="mt-1.5 block text-[11px] text-[var(--faint)]">
              The first three are the same words in three grammars. Only the
              face changes between them, which is where ASL keeps the
              difference between a statement and a question.
            </span>
            <span className="mt-2 flex flex-wrap gap-1.5">
              {EXAMPLES.map((example) => (
                <button
                  key={example}
                  onClick={() => setText(example)}
                  className="rounded-md border border-[var(--border)] bg-[var(--surface-raised)] px-2 py-1 text-[11.5px] text-[var(--muted)] transition-colors hover:text-[var(--foreground)]"
                >
                  {example}
                </button>
              ))}
            </span>
          </label>

          <label className="block">
            <span className="text-[11px] font-medium uppercase tracking-[0.14em] text-[var(--faint)]">
              Speed
            </span>
            <span className="mt-2 flex items-center gap-4">
              <input
                type="range"
                min={0.4}
                max={2}
                step={0.1}
                value={speed}
                onChange={(e) => setSpeed(Number(e.target.value))}
                className="w-full max-w-xs accent-[var(--accent)]"
              />
              <span className="tabular w-16 shrink-0 text-[12px] text-[var(--muted)]">
                {speed.toFixed(1)}×
              </span>
            </span>
          </label>

          <div>
            <span className="text-[11px] font-medium uppercase tracking-[0.14em] text-[var(--faint)]">
              Skin tone
            </span>
            <div className="mt-2 flex gap-2">
              {SKIN_TONES.map((option) => (
                <button
                  key={option.id}
                  onClick={() => setToneId(option.id)}
                  aria-pressed={toneId === option.id}
                  aria-label={option.label}
                  className="h-8 w-8 rounded-full border-2 transition-transform hover:scale-105"
                  style={{
                    background: option.tone.base,
                    borderColor: toneId === option.id ? "var(--foreground)" : "transparent",
                  }}
                />
              ))}
            </div>
          </div>

          <label className="flex items-start gap-2.5">
            <input
              type="checkbox"
              checked={spellUnknown}
              onChange={(e) => setSpellUnknown(e.target.checked)}
              className="mt-0.5 accent-[var(--accent)]"
            />
            <span>
              <span className="text-[13px] text-[var(--foreground)]">
                Fingerspell everything without a sign
              </span>
              <span className="mt-0.5 block text-[11.5px] leading-snug text-[var(--muted)]">
                Complete, but much slower to watch. Off, only names, numbers and
                medical terms are spelled — which is what a signer would spell
                anyway.
              </span>
            </span>
          </label>

          <div className="rounded-lg border border-[var(--border)] bg-[var(--surface-raised)] p-3.5">
            <p className="text-[12px] font-medium text-[var(--foreground)]">
              What came out
            </p>
            <p className="tabular mt-1.5 text-[12px] leading-relaxed text-[var(--muted)]">
              {glossOf(segments) || "—"}
            </p>
            <p className="mt-2 text-[11.5px] text-[var(--faint)]">
              {stats.signed} signed · {stats.spelled} spelled · {stats.skipped} skipped
            </p>
          </div>

          <div className="rounded-lg border border-[var(--border)] bg-[var(--surface-raised)] p-3.5">
            <p className="text-[12px] font-medium text-[var(--foreground)]">
              These are real signs. This is not fluent ASL.
            </p>
            <p className="mt-1.5 text-[11.5px] leading-relaxed text-[var(--muted)]">
              Every sign below is a genuine lexical sign, placed on the body
              where it belongs and moving the way it moves. What the system
              cannot do is put them together into ASL. ASL is not English with
              the words swapped: it orders a sentence topic first, moves verbs
              through space to show who did what to whom, uses classifiers that
              no English word triggers, and carries whole pieces of grammar on
              the face. Walking an English sentence left to right produces
              something closer to Signed Exact English, which fluent signers
              find laborious to read.
            </p>
            <p className="mt-2 text-[11.5px] leading-relaxed text-[var(--muted)]">
              So this runs as key signs <em>next to</em> the full caption, not
              instead of it. It is a support, not an interpreter.
            </p>
            <p className="mt-2 text-[11.5px] leading-relaxed text-[var(--faint)]">
              It was also built without a Deaf signer in the room, which is the
              largest caveat of all. Every sign here should be checked by one
              before anybody relies on it.
            </p>
          </div>
        </div>
      </div>

      <section>
        <h2 className="text-[11px] font-medium uppercase tracking-[0.14em] text-[var(--faint)]">
          The lexicon · {LEXICON.length} signs
        </h2>
        <p className="mt-1.5 max-w-2xl text-[12px] leading-relaxed text-[var(--muted)]">
          How each one is really made, so you can check the avatar against it.
          Pick one to watch it on its own.
        </p>
        <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {LEXICON.map((sign) => (
            <button
              key={sign.gloss}
              onClick={() => setText(sign.triggers[0])}
              className="panel px-3.5 py-3 text-left transition-colors hover:border-[var(--border-strong)]"
            >
              <span className="flex items-center gap-1.5">
                <span className="text-[13px] font-semibold text-[var(--foreground)]">
                  {sign.gloss}
                </span>
                {sign.approximate && (
                  <span
                    title="Approximate: the real sign needs a palm orientation this flat drawing cannot show"
                    className="text-[10px] text-[var(--fair)]"
                  >
                    ≈
                  </span>
                )}
              </span>
              <span className="mt-1 block text-[11.5px] leading-snug text-[var(--muted)]">
                {sign.description}
              </span>
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}
