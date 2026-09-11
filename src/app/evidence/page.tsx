import type { Metadata } from "next";
import Link from "next/link";

import { SiteHeader } from "@/components/SiteHeader";

export const metadata: Metadata = {
  title: "Accuracy and evidence — Sanjivani",
  description:
    "What has been validated, how, and what has not. Measured errors against synthetic ground truth, the state of camera-based blood pressure, and the regulatory position stated plainly.",
};

const VALIDATED = [
  {
    what: "Heart rate",
    how: "Synthetic pulse signals at known rates, with noise swept across five orders of magnitude.",
    result:
      "Either the correct rate or nothing. The test asserts that no noise level makes the engine confidently report a wrong rate.",
  },
  {
    what: "Jitter (local)",
    how: "A synthetic voice built one glottal cycle at a time, with jitter imposed to a known value.",
    result: "Within 0.8 percentage points across the whole range.",
  },
  {
    what: "Shimmer (local)",
    how: "The same synthetic voice, with amplitude perturbation imposed to a known value.",
    result: "Within 1.0 percentage point across the whole range.",
  },
  {
    what: "Harmonics-to-noise ratio",
    how: "Periodic and turbulent energy mixed in known proportion.",
    result: "Within 3 dB.",
  },
  {
    what: "Signal quality gating",
    how: "Faceless video, dark rooms, one-sided lighting and heavy motion, driven through a real browser.",
    result:
      "The application reports nothing rather than inventing a plausible number, and names which term is binding.",
  },
];

export default function EvidencePage() {
  return (
    <div className="min-h-screen">
      <SiteHeader />

      <main className="mx-auto max-w-4xl px-5 pb-24 pt-14">
        <section>
          <span className="inline-flex items-center gap-2 rounded-full border border-[var(--border)] bg-[var(--surface)] px-3 py-1 text-[11px] text-[var(--muted)]">
            <span className="h-1.5 w-1.5 rounded-full bg-[var(--accent)]" />
            Accuracy and evidence
          </span>

          <h1 className="mt-6 text-4xl font-semibold leading-[1.1] tracking-tight text-[var(--foreground)]">
            What has been validated,
            <br />
            <span className="text-[var(--accent)]">and what has not.</span>
          </h1>

          <p className="mt-5 text-[15px] leading-relaxed text-[var(--muted)]">
            This page exists because the usual version of it does not. A measurement product
            that publishes only the numbers flattering to it is asking to be believed rather
            than checked, and anybody buying one should read the gaps first.
          </p>
        </section>

        <section className="mt-12">
          <h2 className="text-[13px] font-medium uppercase tracking-[0.16em] text-[var(--faint)]">
            Measured against known ground truth
          </h2>
          <p className="mt-3 text-[13px] leading-relaxed text-[var(--muted)]">
            488 automated tests run the engines against synthetic signals whose correct answer
            is known in advance, and 131 further checks drive the real application in a real
            browser with the camera fed from a canvas and the microphone from an oscillator at a
            known frequency. A regression therefore appears as a heart rate drifting from the
            rate we asked for, rather than as something a person has to notice by eye.
          </p>

          <div className="mt-4 overflow-hidden rounded-[var(--radius)] border border-[var(--border)]">
            <table className="w-full border-collapse text-left">
              <thead>
                <tr className="bg-[var(--surface-raised)]">
                  <th className="px-4 py-2.5 text-[11px] font-medium uppercase tracking-[0.1em] text-[var(--faint)]">
                    Quantity
                  </th>
                  <th className="px-4 py-2.5 text-[11px] font-medium uppercase tracking-[0.1em] text-[var(--faint)]">
                    How it is tested
                  </th>
                  <th className="px-4 py-2.5 text-[11px] font-medium uppercase tracking-[0.1em] text-[var(--faint)]">
                    Result
                  </th>
                </tr>
              </thead>
              <tbody>
                {VALIDATED.map((row) => (
                  <tr key={row.what} className="border-t border-[var(--border)]">
                    <td className="px-4 py-3 align-top text-[12.5px] font-medium text-[var(--foreground)]">
                      {row.what}
                    </td>
                    <td className="px-4 py-3 align-top text-[12px] leading-relaxed text-[var(--muted)]">
                      {row.how}
                    </td>
                    <td className="px-4 py-3 align-top text-[12px] leading-relaxed text-[var(--muted)]">
                      {row.result}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="mt-12">
          <h2 className="text-[13px] font-medium uppercase tracking-[0.16em] text-[var(--faint)]">
            What has not been done
          </h2>
          <div className="mt-4 space-y-3">
            {[
              [
                "No clinical trial",
                "Nothing here has been measured against ECG, a reference cuff or impedance pneumography in a human study. Synthetic ground truth proves the mathematics is right; it says nothing about how the engine behaves on a hundred real faces in real rooms. That study has not been run.",
              ],
              [
                "No regulatory clearance",
                "No CE mark, no FDA clearance, no ANVISA registration. This is not a medical device and is not offered as one. Products that carry those marks have earned them through exactly the studies listed above as missing.",
              ],
              [
                "No Deaf signer reviewed the signing",
                "The sign-language output was built from written descriptions of ASL without a fluent signer in the room. It runs as key signs beside a full caption, never instead of one, and the interface says so wherever it appears.",
              ],
              [
                "No population-level claims",
                "There is a real literature linking voice measures to depression, Parkinson's and cognitive decline. Those findings are population-level, and applied to one person in one conversation their error bars swallow the result. The engine returns acoustics and stops.",
              ],
            ].map(([title, body]) => (
              <div key={title} className="panel p-5">
                <h3 className="text-[14px] font-semibold text-[var(--foreground)]">{title}</h3>
                <p className="mt-2 text-[12.5px] leading-relaxed text-[var(--muted)]">{body}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="mt-12">
          <h2 className="text-[13px] font-medium uppercase tracking-[0.16em] text-[var(--faint)]">
            Blood pressure, honestly
          </h2>
          <div className="panel mt-4 p-6">
            <p className="text-[13px] leading-relaxed text-[var(--muted)]">
              A camera cannot measure blood pressure. It measures the shape and timing of the
              pulse wave, and pressure is <em>inferred</em> from that shape. The relationship
              varies enormously between people — arterial stiffness, height, age and vascular
              tone all move it — so a model fitted to a population produces a number that looks
              plausible for everyone and is right for almost nobody.
            </p>
            <p className="mt-3 text-[13px] leading-relaxed text-[var(--muted)]">
              This is not a limitation peculiar to us. The most prominent commercial camera-BP
              SDK, which does hold medical device certification, publishes its own clinical
              validation over 132 adults: systolic mean absolute error <strong>10.18 mmHg</strong>{" "}
              with a correlation of <strong>0.38</strong>, and diastolic{" "}
              <strong>6.22 mmHg</strong> at <strong>0.34</strong>. Their documentation also
              requires a calibration mode in which the user enters readings from a real cuff.
              Anybody promising 99% accuracy from a face scan is describing something that does
              not exist.
            </p>
            <p className="mt-3 text-[13px] leading-relaxed text-[var(--muted)]">
              So this behaves the way every cleared product in the field behaves. With no
              calibration it returns <strong>nothing</strong>, and explains why, rather than a
              population-average guess. With one or two cuff readings it solves for the
              intercept that reproduces your own anchor exactly and then tracks change from it.
              With three or more it fits a ridge-regularised personal model. The uncertainty
              widens with calibration age, thinness of calibration and current signal quality,
              is never reported as better than the reference cuff achieves, and goes stale after
              thirty days.
            </p>
          </div>
        </section>

        <section className="mt-12">
          <h2 className="text-[13px] font-medium uppercase tracking-[0.16em] text-[var(--faint)]">
            Where it works less well
          </h2>
          <div className="panel mt-4 p-6">
            <p className="text-[13px] leading-relaxed text-[var(--muted)]">
              Melanin sits above the vessels and absorbs strongly at exactly the wavelengths the
              green-channel contrast lives at, so on darker skin less light reaches the blood
              and less of what returns survives the trip out. The pulse is still there; there is
              less of it above the noise floor. This is documented in the literature and is not
              something anybody fixes in a weekend.
            </p>
            <p className="mt-3 text-[13px] leading-relaxed text-[var(--muted)]">
              What can be done is refusing to hide it. Skin tone is estimated per reading and
              used to add a sentence saying the confidence will run lower and why. Two
              constraints are load-bearing: the estimate <strong>never</strong> changes a
              reported value, because a correction fitted to nobody&rsquo;s data would be an
              invented number dressed up as fairness — and it is <strong>never stored</strong>,
              never attached to a report and never transmitted. It is computed from pixels
              already in memory, used to choose a sentence, and discarded.
            </p>
          </div>
        </section>

        <section className="mt-12">
          <div className="panel p-6">
            <h2 className="text-[15px] font-semibold text-[var(--foreground)]">
              Check it yourself
            </h2>
            <p className="mt-3 text-[13px] leading-relaxed text-[var(--muted)]">
              Every claim above is reproducible from the source. The tests run with{" "}
              <code className="rounded bg-[var(--surface-raised)] px-1.5 py-0.5 text-[12px]">
                npm test
              </code>{" "}
              and the browser suite with{" "}
              <code className="rounded bg-[var(--surface-raised)] px-1.5 py-0.5 text-[12px]">
                npm run verify:browser
              </code>
              . The most useful check needs no code at all: measure yourself here, then measure
              yourself with a real cuff or a chest strap, and see whether what appears on screen
              earns your trust.
            </p>
            <div className="mt-5 flex flex-wrap gap-2.5">
              <Link
                href="/agents/vitals"
                className="rounded-lg px-4 py-2.5 text-[13px] font-semibold transition-opacity hover:opacity-90"
                style={{ background: "var(--accent)", color: "#141414" }}
              >
                Measure yourself
              </Link>
              <a
                href="https://github.com/thvb1133/MedicalAgentstore"
                target="_blank"
                rel="noreferrer"
                className="rounded-lg border border-[var(--border)] bg-[var(--surface-raised)] px-4 py-2.5 text-[13px] font-medium text-[var(--muted)] transition-colors hover:text-[var(--foreground)]"
              >
                Read the source
              </a>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
