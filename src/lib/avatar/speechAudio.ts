/**
 * Measuring how loud the spoken reply is, while it plays.
 *
 * Used by anything that has to move in time with the assistant's voice — the
 * presenter's mouth, chiefly. Shared rather than duplicated because the one
 * genuinely dangerous part is easy to get subtly wrong twice: routing an
 * audio element into Web Audio replaces its own output with the graph's, so
 * if the context will not start, the person hears nothing at all.
 *
 * That failure is much worse than an unanimated mouth, so the connection is
 * only made once the context is confirmed running, and every step falls
 * quietly back to plain playback.
 */

export interface SpeechAnalysis {
  context: AudioContext;
  analyser: AnalyserNode;
  samples: Uint8Array<ArrayBuffer>;
}

export interface AnalysisRef {
  current: SpeechAnalysis | null;
}

export async function routeForAnalysis(
  ref: AnalysisRef,
  audio: HTMLAudioElement,
): Promise<void> {
  try {
    if (!ref.current) {
      const Ctor =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return;
      const context = new Ctor();
      const analyser = context.createAnalyser();
      analyser.fftSize = 1024;
      // Enough smoothing that a plosive does not make the jaw snap, little
      // enough that the mouth still shuts between words.
      analyser.smoothingTimeConstant = 0.35;
      analyser.connect(context.destination);
      ref.current = { context, analyser, samples: new Uint8Array(analyser.fftSize) };
    }

    const analysis = ref.current;
    if (analysis.context.state !== "running") await analysis.context.resume();
    if (analysis.context.state !== "running") return;

    analysis.context.createMediaElementSource(audio).connect(analysis.analyser);
  } catch {
    // No analysis. Anything watching falls back to the text track alone.
  }
}

export function measureLevel(analysis: SpeechAnalysis | null): number | null {
  if (!analysis) return null;
  analysis.analyser.getByteTimeDomainData(analysis.samples);

  let sum = 0;
  for (let i = 0; i < analysis.samples.length; i++) {
    const deviation = (analysis.samples[i] - 128) / 128;
    sum += deviation * deviation;
  }
  const rms = Math.sqrt(sum / analysis.samples.length);
  // Conversational speech sits around 0.2 RMS, so this puts an ordinary
  // sentence near the top of the range without clipping every vowel.
  return Math.min(1, rms * 4.5);
}
