"use client";

import { useState } from "react";

import { SIGNS } from "@/lib/sign/alphabet";
import { SignAvatar } from "./SignAvatar";
import { SignGlyph } from "./SignGlyph";
import { SKIN_TONES } from "./render";

/**
 * The fingerspelling page.
 *
 * It exists to be honest as much as to be useful. Anyone can type a word and
 * watch every handshape, compare it against the chart below, and judge for
 * themselves whether this is worth reading — which is the only fair way to
 * offer a Deaf user something built without a Deaf signer in the room.
 */

const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");
const DIGITS = "0123456789".split("");

const EXAMPLES = ["72 BPM", "118/76", "MEERA", "PARACETAMOL"];

export function SignStudio() {
  const [text, setText] = useState("72 BPM");
  const [rate, setRate] = useState(2.2);
  const [toneId, setToneId] = useState(SKIN_TONES[1].id);

  const tone = SKIN_TONES.find((t) => t.id === toneId)?.tone ?? SKIN_TONES[1].tone;
  const accent = "var(--accent)";

  return (
    <div className="space-y-7">
      <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
        <SignAvatar text={text} rate={rate} accent="#f0a04b" tone={tone} loop height={260} />

        <div className="panel space-y-5 p-5">
          <label className="block">
            <span className="text-[11px] font-medium uppercase tracking-[0.14em] text-[var(--faint)]">
              Spell this
            </span>
            <input
              value={text}
              onChange={(e) => setText(e.target.value.slice(0, 60))}
              className="mt-2 w-full rounded-lg border border-[var(--border)] bg-[var(--surface-raised)] px-3 py-2.5 text-[15px] text-[var(--foreground)] outline-none focus:border-[var(--border-strong)]"
            />
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
                min={0.8}
                max={4}
                step={0.2}
                value={rate}
                onChange={(e) => setRate(Number(e.target.value))}
                className="w-full max-w-xs accent-[var(--accent)]"
              />
              <span className="tabular w-32 shrink-0 text-[12px] text-[var(--muted)]">
                {rate.toFixed(1)} letters/sec
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

          <div className="rounded-lg border border-[var(--border)] bg-[var(--surface-raised)] p-3.5">
            <p className="text-[12px] font-medium text-[var(--foreground)]">
              What this is, and what it is not
            </p>
            <p className="mt-1.5 text-[11.5px] leading-relaxed text-[var(--muted)]">
              This is <span className="text-[var(--foreground)]">fingerspelling</span>,
              not American Sign Language. ASL is a full language: meaning lives
              in movement, in facial expression, in where a sign is placed, and
              in both hands at once. A single drawn hand cannot produce any of
              that, and calling it sign language would be a false promise of
              access.
            </p>
            <p className="mt-2 text-[11.5px] leading-relaxed text-[var(--muted)]">
              What fingerspelling genuinely carries is names, medical terms and
              numbers — exactly the things this application produces, and the
              things Deaf signers fingerspell in ordinary conversation. So the
              companion spells those alongside a full caption rather than
              grinding out whole sentences at two letters a second.
            </p>
            <p className="mt-2 text-[11.5px] leading-relaxed text-[var(--faint)]">
              M, N, R and T need one finger to cross behind or lie under
              another, which a hand flexed in a single plane cannot draw. Those
              four are approximations and are marked as such wherever they
              appear.
            </p>
          </div>
        </div>
      </div>

      <section>
        <h2 className="text-[11px] font-medium uppercase tracking-[0.14em] text-[var(--faint)]">
          The alphabet
        </h2>
        <div className="mt-3 grid grid-cols-4 gap-2 sm:grid-cols-7 lg:grid-cols-9">
          {ALPHABET.map((glyph) => (
            <Chart key={glyph} glyph={glyph} accent={accent} tone={tone} />
          ))}
        </div>
      </section>

      <section>
        <h2 className="text-[11px] font-medium uppercase tracking-[0.14em] text-[var(--faint)]">
          Numbers
        </h2>
        <div className="mt-3 grid grid-cols-4 gap-2 sm:grid-cols-7 lg:grid-cols-9">
          {DIGITS.map((glyph) => (
            <Chart key={glyph} glyph={glyph} accent={accent} tone={tone} />
          ))}
        </div>
      </section>
    </div>
  );
}

function Chart({
  glyph,
  accent,
  tone,
}: {
  glyph: string;
  accent: string;
  tone: (typeof SKIN_TONES)[number]["tone"];
}) {
  const entry = SIGNS[glyph];
  if (!entry) return null;

  return (
    <div className="panel flex flex-col items-center px-1 pb-2 pt-1">
      <SignGlyph pose={entry.pose} accent={accent} tone={tone} label={glyph} size={84} />
      <div className="flex items-center gap-1">
        <span className="tabular text-[13px] font-semibold text-[var(--foreground)]">
          {glyph}
        </span>
        {entry.approximate && (
          <span
            title="Approximate: this shape needs one finger behind another"
            className="text-[10px] text-[var(--fair)]"
          >
            ≈
          </span>
        )}
        {entry.motion && (
          <span title="This letter is defined by its movement" className="text-[10px] text-[var(--info)]">
            ↝
          </span>
        )}
      </div>
    </div>
  );
}
