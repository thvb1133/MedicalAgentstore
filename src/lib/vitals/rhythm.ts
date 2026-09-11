/**
 * Irregularity in the beat-to-beat intervals.
 *
 * Average heart rate hides the thing most worth noticing. A run of intervals
 * going 800, 810, 795, 640, 980, 805 averages out to something unremarkable,
 * and the irregularity is the whole of the finding.
 *
 * What this is not: a diagnosis, a detector, or a screening test. Atrial
 * fibrillation is diagnosed on an ECG, and the studies that put photo-
 * plethysmographic AF detection anywhere near useful used a wrist sensor
 * against the skin, minutes of data, and a trained classifier. A webcam at
 * arm's length has a fraction of that signal quality, and every artefact it
 * suffers — a swallow, a small head movement, one missed beat — looks exactly
 * like an ectopic one.
 *
 * So the output is deliberately blunt: an interval pattern that is regular,
 * or one that is not. "Not regular" is worth telling somebody, because it is
 * a reason to mention it to a doctor who can put a real lead on them. It is
 * not worth naming a rhythm over.
 *
 * Two measures, both standard in HRV work and both chosen because they
 * respond to different things:
 *
 *   pNN50   the share of successive intervals differing by over 50 ms. Long
 *           used as a vagal-tone index; a high value under a *low* RMSSD is
 *           the signature of scattered ectopics rather than smooth variation.
 *   RMSSD/mean   beat-to-beat scatter relative to the rate itself, so a fast
 *           heart is not called irregular merely for having short intervals.
 */

import { median } from "../signal/filters";

export type Rhythm = "unknown" | "regular" | "some-variation" | "irregular";

export interface RhythmReport {
  rhythm: Rhythm;
  /** Share of successive intervals differing by more than 50 ms, 0-1. */
  pnn50: number | null;
  /** Beat-to-beat scatter as a fraction of the mean interval. */
  scatter: number | null;
  /** Intervals more than 20% away from the local median. */
  ectopicLike: number;
  /** How many intervals this was computed from. */
  intervals: number;
  /** What to say on screen, or null when there is nothing to say. */
  note: string | null;
}

/**
 * Fewer than this and the measure is noise.
 *
 * Twenty intervals is around twenty seconds at a resting rate. Below that a
 * single mis-detected beat moves pNN50 by five percentage points, which is
 * more than the difference between the categories below.
 */
const MIN_INTERVALS = 20;

/** Normal beat-to-beat scatter at rest, as a fraction of the mean interval. */
const SCATTER_SOME = 0.06;
const SCATTER_HIGH = 0.12;

/** A run this irregular is worth mentioning even when the scatter is modest. */
const ECTOPIC_SHARE = 0.12;

export function assessRhythm(intervalsMs: number[]): RhythmReport {
  const empty: RhythmReport = {
    rhythm: "unknown",
    pnn50: null,
    scatter: null,
    ectopicLike: 0,
    intervals: intervalsMs.length,
    note: null,
  };

  if (intervalsMs.length < MIN_INTERVALS) return empty;

  const centre = median(intervalsMs);
  if (!Number.isFinite(centre) || centre <= 0) return empty;

  let over50 = 0;
  let sumSquares = 0;
  for (let i = 1; i < intervalsMs.length; i++) {
    const diff = intervalsMs[i] - intervalsMs[i - 1];
    if (Math.abs(diff) > 50) over50++;
    sumSquares += diff * diff;
  }
  const successive = intervalsMs.length - 1;
  const pnn50 = over50 / successive;
  const rmssd = Math.sqrt(sumSquares / successive);
  const scatter = rmssd / centre;

  // Compared against the local median rather than the mean, so that a run of
  // genuinely odd intervals does not lift the reference and hide itself.
  const ectopicLike = intervalsMs.filter((v) => Math.abs(v - centre) / centre > 0.2).length;
  const ectopicShare = ectopicLike / intervalsMs.length;

  const rhythm: Rhythm =
    scatter >= SCATTER_HIGH || ectopicShare >= ECTOPIC_SHARE
      ? "irregular"
      : scatter >= SCATTER_SOME || pnn50 > 0.3
        ? "some-variation"
        : "regular";

  return { rhythm, pnn50, scatter, ectopicLike, intervals: intervalsMs.length, note: NOTES[rhythm] };
}

/**
 * The wording matters as much as the threshold.
 *
 * "Irregular" has to prompt a conversation with a clinician without implying
 * one has already happened, and without naming a condition. It also has to
 * say the most likely explanation first — which, on a webcam, is genuinely
 * that the person moved.
 */
const NOTES: Record<Rhythm, string | null> = {
  unknown: null,
  regular: null,
  "some-variation":
    "Your beat-to-beat timing varies a little. That is normal and generally a good sign — it usually tracks breathing.",
  irregular:
    "The spacing between beats was uneven in this reading. On a camera that is most often caused by movement or by a beat being missed, so try again while sitting still. If it keeps happening, it is worth mentioning to a doctor, who can check it properly with an ECG. This is not a diagnosis and cannot rule anything in or out.",
};
