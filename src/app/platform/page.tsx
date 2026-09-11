import type { Metadata } from "next";
import Link from "next/link";

import { SiteHeader } from "@/components/SiteHeader";

export const metadata: Metadata = {
  title: "Platform — Sanjivani",
  description:
    "Camera-based physiological measurement that runs in the browser: heart rate, HRV, breathing, alertness, tremor, voice acoustics and calibrated blood pressure, each reported with its own confidence.",
};

const MEASURES = [
  {
    group: "Cardiovascular",
    items: [
      "Heart rate, from rPPG across three facial regions",
      "Heart rate variability — SDNN and RMSSD",
      "Breathing rate, from head movement",
      "Beat-to-beat regularity",
      "Breath-to-heart coherence",
      "Blood pressure, after cuff calibration",
    ],
  },
  {
    group: "Ocular and neurological",
    items: [
      "PERCLOS, blink rate and blink duration",
      "Gaze direction and scan pattern",
      "Pupil dilation, measured from pixels",
      "Cognitive load, from the three combined",
      "Tremor frequency and amplitude, by FFT",
      "Finger-tapping rate and decrement",
    ],
  },
  {
    group: "Voice",
    items: [
      "Fundamental frequency",
      "Jitter and shimmer, cycle by cycle",
      "Harmonics-to-noise ratio",
      "Speech rate and pause ratio",
      "Pitch range in semitones",
    ],
  },
];

const PROPERTIES = [
  {
    title: "The video never leaves the device",
    body: "Every measurement is computed in the browser. Only derived numbers are transmitted, and only when a cloud feature is switched on. There is no frame of video or second of audio on any server of ours, because there is no pipeline that could put one there.",
  },
  {
    title: "It works with the network off",
    body: "The runtime and the three vision models are served from your own origin. A venue's wifi failing does not take a demonstration down, and a clinic with poor connectivity is still a place this runs.",
  },
  {
    title: "No per-minute vendor bill",
    body: "The signal processing is ours, not a licensed SDK. Two optional keys — Claude for conversation, Polly for speech — buy the parts that genuinely need a model behind them. Measurement itself costs nothing per user.",
  },
  {
    title: "Numbers disappear when they should",
    body: "Signal quality is the product of eight independent terms rather than their average, so one serious failure drags the whole score down instead of being averaged away. Below the bar, the number is withheld and the binding constraint is named.",
  },
  {
    title: "Accessibility is the same code path",
    body: "The eye tracking built for drowsiness is also a switch interface for somebody who cannot speak or sign. The hand tracking that renders sign language also reads fingerspelling back. One camera pass, several uses.",
  },
  {
    title: "It reads back in your language",
    body: "Twenty-four languages, each offered only where recognition, reply and voice all work. Measurements stay in digits and standard units in every one of them, because that is what a person can repeat to a clinician.",
  },
];

export default function PlatformPage() {
  return (
    <div className="min-h-screen">
      <SiteHeader />

      <main className="mx-auto max-w-6xl px-5 pb-24 pt-14">
        <section className="max-w-3xl">
          <span className="inline-flex items-center gap-2 rounded-full border border-[var(--border)] bg-[var(--surface)] px-3 py-1 text-[11px] text-[var(--muted)]">
            <span className="h-1.5 w-1.5 rounded-full bg-[var(--accent)]" />
            Platform
          </span>

          <h1 className="mt-6 text-4xl font-semibold leading-[1.1] tracking-tight text-[var(--foreground)] sm:text-5xl">
            Physiology from a camera,
            <br />
            <span className="text-[var(--accent)]">computed where the camera is.</span>
          </h1>

          <p className="mt-5 text-[15px] leading-relaxed text-[var(--muted)]">
            Sanjivani turns an ordinary laptop or phone camera into a measurement
            instrument. Over twenty physiological quantities, extracted in the browser, each
            reported with the confidence it has earned and withheld when it has not.
          </p>

          <div className="mt-7 flex flex-wrap gap-2.5">
            <Link
              href="/agents/vitals"
              className="rounded-lg px-4 py-2.5 text-[13px] font-semibold transition-opacity hover:opacity-90"
              style={{ background: "var(--accent)", color: "#141414" }}
            >
              Measure yourself now
            </Link>
            <Link
              href="/get-started"
              className="rounded-lg border border-[var(--border)] bg-[var(--surface-raised)] px-4 py-2.5 text-[13px] font-medium text-[var(--muted)] transition-colors hover:text-[var(--foreground)]"
            >
              Run it yourself
            </Link>
            <Link
              href="/evidence"
              className="rounded-lg border border-[var(--border)] bg-[var(--surface-raised)] px-4 py-2.5 text-[13px] font-medium text-[var(--muted)] transition-colors hover:text-[var(--foreground)]"
            >
              See the accuracy
            </Link>
          </div>
        </section>

        <section className="mt-14">
          <h2 className="text-[13px] font-medium uppercase tracking-[0.16em] text-[var(--faint)]">
            What it measures
          </h2>
          <div className="mt-4 grid gap-4 lg:grid-cols-3">
            {MEASURES.map((column) => (
              <div key={column.group} className="panel p-5">
                <h3 className="text-[14px] font-semibold text-[var(--foreground)]">
                  {column.group}
                </h3>
                <ul className="mt-3 space-y-2">
                  {column.items.map((item) => (
                    <li
                      key={item}
                      className="flex gap-2 text-[12.5px] leading-snug text-[var(--muted)]"
                    >
                      <span className="text-[var(--accent)]">·</span>
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </section>

        <section className="mt-14">
          <h2 className="text-[13px] font-medium uppercase tracking-[0.16em] text-[var(--faint)]">
            Why it is built this way
          </h2>
          <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {PROPERTIES.map((property) => (
              <div key={property.title} className="panel p-5">
                <h3 className="text-[14px] font-semibold text-[var(--foreground)]">
                  {property.title}
                </h3>
                <p className="mt-2 text-[12.5px] leading-relaxed text-[var(--muted)]">
                  {property.body}
                </p>
              </div>
            ))}
          </div>
        </section>

        <section className="mt-14 grid gap-4 lg:grid-cols-2">
          <div className="panel p-6">
            <h2 className="text-[15px] font-semibold text-[var(--foreground)]">
              What integrating it involves
            </h2>
            <p className="mt-3 text-[13px] leading-relaxed text-[var(--muted)]">
              The whole application is a Next.js project, and the measurement engines underneath
              it are plain TypeScript with no dependency on React or the DOM. That is the part
              worth reusing: the same functions run in a browser, in a worker, or in Node, which
              is what makes them testable against signals whose answer is known in advance.
            </p>
            <ul className="mt-4 space-y-2 text-[12.5px] leading-relaxed text-[var(--muted)]">
              <li>· Deploy the whole product, server included, for the conversational layer.</li>
              <li>· Or publish it as a static site, which needs no keys and no server at all.</li>
              <li>· Or import the engines and put your own interface on top of them.</li>
            </ul>
          </div>

          <div className="panel p-6">
            <h2 className="text-[15px] font-semibold text-[var(--foreground)]">
              Where the camera stops
            </h2>
            <p className="mt-3 text-[13px] leading-relaxed text-[var(--muted)]">
              A camera sees colour, motion and geometry. That is enough for a pulse, for
              eyelids, for fingertips and for reading something that already carries a result.
              It is not enough for anything needing a different sensing modality, and no amount
              of software changes that.
            </p>
            <div className="mt-4 grid gap-2 sm:grid-cols-2">
              {[
                ["Retina and optic nerve", "needs fundus optics"],
                ["Blood chemistry, glucose", "needs a chemical assay"],
                ["Deep tissue and tumours", "needs X-ray, CT or ultrasound"],
                ["Brain and cardiac electrics", "needs EEG or ECG electrodes"],
              ].map(([what, why]) => (
                <div
                  key={what}
                  className="rounded-lg border border-[var(--border)] bg-[var(--surface-raised)] px-3 py-2"
                >
                  <div className="text-[12px] font-medium text-[var(--foreground)]">{what}</div>
                  <div className="mt-0.5 text-[11px] text-[var(--faint)]">{why}</div>
                </div>
              ))}
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
