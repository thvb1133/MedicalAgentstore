/**
 * Combining the forehead and both cheeks into one pulse.
 *
 * Averaging the three regions' pixels before extraction — which is the
 * obvious thing, and what this did first — throws away the most useful piece
 * of information available: the three regions fail *independently*. A hand
 * resting against one cheek, a window lighting one side, a fringe over the
 * forehead — each ruins one region and leaves the others intact. Averaging
 * first mixes the ruined one back in at full weight.
 *
 * So each region is extracted separately and weighted by how much it looks
 * like a pulse rather than by how big it is. Weighting is the whole point:
 * three regions equally weighted is barely better than one, while three
 * regions weighted by quality recovers most of what a clean single region
 * would have given even when two of them are unusable.
 *
 * The other thing this buys is a second, independent agreement check. Two
 * extraction methods agreeing on one patch of skin can both be fooled by the
 * same artefact, because they are looking at the same pixels. Two *regions*
 * agreeing cannot be, unless whatever caused it moved the whole face — which
 * is exactly the case the motion term already catches.
 */

import { dominantPeak, magnitudeSpectrum, correctForHarmonic, type SpectralPeak } from "./fft";
import { normalise } from "./filters";
import { extractPulse, PULSE_BAND_HZ, type RgbTrace, type RppgMethod } from "./rppg";

export type RegionName = "forehead" | "left cheek" | "right cheek";

export interface RegionTrace {
  name: RegionName;
  trace: RgbTrace;
  /** Fraction of the region's pixels that were usable skin, 0-1. */
  coverage: number;
}

export interface RegionPulse {
  name: RegionName;
  waveform: Float64Array;
  peak: SpectralPeak | null;
  /** 0-1. Coverage and spectral prominence together. */
  weight: number;
}

export interface FusedPulse {
  waveform: Float64Array;
  peak: SpectralPeak | null;
  regions: RegionPulse[];
  /**
   * How many regions found the same rate, over how many had a rate at all.
   * Reported rather than folded into a score so the UI can say "two of three".
   */
  concurring: number;
  contributing: number;
  /** 0-1 agreement between regions, for the confidence product. */
  agreement: number;
}

/** Two regions count as agreeing within this many BPM. */
const AGREEMENT_TOLERANCE_BPM = 5;

/**
 * A region has to be at least this prominent to vote.
 *
 * Below it the peak is indistinguishable from the tallest bin of noise, and
 * letting it vote would mean a third region full of hair could break a real
 * agreement between the two good ones.
 */
const MIN_PROMINENCE = 0.12;

export function fusePulse(
  regions: RegionTrace[],
  fs: number,
  method: RppgMethod = "pos",
): FusedPulse {
  const analysed: RegionPulse[] = regions.map((region) => {
    const waveform = extractPulse(region.trace, fs, method);
    const spectrum = magnitudeSpectrum(waveform, fs);
    const raw = dominantPeak(spectrum, PULSE_BAND_HZ.lo, PULSE_BAND_HZ.hi);
    const peak = raw
      ? correctForHarmonic(spectrum, raw, PULSE_BAND_HZ.lo, PULSE_BAND_HZ.hi)
      : null;

    // Prominence squared, so a clearly pulsatile region dominates a
    // marginal one rather than merely outvoting it. Coverage enters
    // linearly: it says how much skin the average was taken over, which
    // affects the noise floor but not whether the signal is real.
    const prominence = peak?.prominence ?? 0;
    const weight = region.coverage * prominence * prominence;

    return { name: region.name, waveform, peak, weight };
  });

  const voters = analysed.filter(
    (r) => r.peak !== null && (r.peak as SpectralPeak).prominence >= MIN_PROMINENCE,
  );

  if (voters.length === 0) {
    const fallback = analysed.find((r) => r.peak !== null) ?? analysed[0];
    return {
      waveform: fallback?.waveform ?? new Float64Array(0),
      peak: fallback?.peak ?? null,
      regions: analysed,
      concurring: 0,
      contributing: 0,
      agreement: 0,
    };
  }

  // The heaviest region proposes the rate and the others corroborate it.
  const lead = voters.reduce((best, r) => (r.weight > best.weight ? r : best), voters[0]);
  const leadBpm = (lead.peak as SpectralPeak).freq * 60;

  const concurring = voters.filter(
    (r) => Math.abs((r.peak as SpectralPeak).freq * 60 - leadBpm) <= AGREEMENT_TOLERANCE_BPM,
  );

  // Only the regions that agree are summed. A dissenting region is not noise
  // to be averaged down — it is measuring something else, and adding it in
  // would drag the fused waveform's peak towards a rate nothing observed.
  const waveform = weightedSum(concurring);

  const spectrum = magnitudeSpectrum(waveform, fs);
  const raw = dominantPeak(spectrum, PULSE_BAND_HZ.lo, PULSE_BAND_HZ.hi);
  const peak = raw ? correctForHarmonic(spectrum, raw, PULSE_BAND_HZ.lo, PULSE_BAND_HZ.hi) : null;

  return {
    waveform,
    peak: peak ?? lead.peak,
    regions: analysed,
    concurring: concurring.length,
    contributing: voters.length,
    agreement: agreementFrom(concurring.length, voters.length),
  };
}

/**
 * How much three regions agreeing is worth.
 *
 * One region alone is not corroborated by anything and cannot be scored as
 * though it were; it gets a middling value rather than zero, because a single
 * clean forehead trace is a perfectly ordinary way to measure a pulse. Two of
 * two is strong. One of three is a warning: two regions looked at the same
 * face and saw different rates, and at that point the honest thing is to let
 * the confidence collapse.
 */
export function agreementFrom(concurring: number, contributing: number): number {
  if (contributing === 0) return 0;
  if (contributing === 1) return 0.5;
  const share = concurring / contributing;
  if (share < 0.5) return 0.15;
  if (share < 1) return 0.65;
  return contributing >= 3 ? 1 : 0.9;
}

function weightedSum(regions: RegionPulse[]): Float64Array {
  const usable = regions.filter((r) => r.waveform.length > 0);
  if (usable.length === 0) return new Float64Array(0);

  const length = Math.min(...usable.map((r) => r.waveform.length));
  const total = usable.reduce((sum, r) => sum + r.weight, 0);
  const out = new Float64Array(length);

  // With no weight anywhere — every region flat — fall back to an equal
  // average rather than dividing by zero.
  const share = (r: RegionPulse) => (total > 0 ? r.weight / total : 1 / usable.length);

  for (const region of usable) {
    const w = share(region);
    for (let i = 0; i < length; i++) out[i] += region.waveform[i] * w;
  }

  return normalise(out);
}
