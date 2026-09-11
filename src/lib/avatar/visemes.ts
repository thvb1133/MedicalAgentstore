/**
 * Turning a written reply into mouth shapes.
 *
 * A mouth driven only by how loud the audio is opens and shuts on every
 * syllable and looks like a glove puppet, because loudness carries no
 * information about shape: "ee" and "oo" are the same volume and could not
 * look less alike. So the shape comes from the text, which we have in full
 * before a word of it is spoken, and the loudness is used only to decide how
 * far to commit to that shape at each instant.
 *
 * What this is not is a phonemiser. It reads spelling, not pronunciation, and
 * English spelling is a poor guide to either. "though" gets a rounded vowel
 * it does not deserve and "colonel" is hopeless. That is an acceptable trade
 * at this size: the eye is looking for the mouth to be open on open sounds
 * and shut on "m", "b" and "p", and grapheme rules get those right most of
 * the time. Where they are wrong they are wrong by a degree, not by being
 * shut through a vowel.
 *
 * The rules are Latin-script and broadly English. For a language written in
 * another script there is nothing here to read, and rather than animate
 * confident nonsense `supportsVisemes` says so and the presenter falls back
 * to loudness alone.
 */

export type VisemeId =
  | "rest"
  | "closed"
  | "ah"
  | "ee"
  | "ih"
  | "oh"
  | "oo"
  | "eh"
  | "fv"
  | "th"
  | "sh"
  | "rr"
  | "consonant";

export interface Viseme {
  jaw: number;
  spread: number;
  /** Relative time this shape occupies. Vowels hold; stops do not. */
  weight: number;
}

/**
 * The shapes themselves.
 *
 * Twelve is far fewer than a phonetic inventory and about the number a
 * cartoon uses, for the same reason: past a dozen the extra distinctions are
 * not legible at the size a face is actually drawn.
 */
export const VISEMES: Record<VisemeId, Viseme> = {
  rest: { jaw: 0, spread: 0, weight: 1 },
  closed: { jaw: 0, spread: 0.05, weight: 0.75 },
  ah: { jaw: 0.95, spread: 0.2, weight: 1.5 },
  eh: { jaw: 0.55, spread: 0.55, weight: 1.3 },
  ee: { jaw: 0.28, spread: 1, weight: 1.3 },
  ih: { jaw: 0.32, spread: 0.5, weight: 1.1 },
  oh: { jaw: 0.62, spread: -0.65, weight: 1.4 },
  oo: { jaw: 0.3, spread: -1, weight: 1.3 },
  fv: { jaw: 0.14, spread: 0.35, weight: 0.9 },
  th: { jaw: 0.22, spread: 0.3, weight: 0.9 },
  sh: { jaw: 0.3, spread: -0.45, weight: 1 },
  rr: { jaw: 0.3, spread: -0.25, weight: 1 },
  consonant: { jaw: 0.24, spread: 0.25, weight: 0.85 },
};

/** Digraphs, longest first so "sh" is never read as "s" then "h". */
const DIGRAPHS: Array<[string, VisemeId]> = [
  ["oo", "oo"],
  ["ou", "oh"],
  ["ow", "oh"],
  ["oi", "oh"],
  ["oy", "oh"],
  ["oa", "oh"],
  ["ee", "ee"],
  ["ea", "ee"],
  ["ie", "ee"],
  ["ai", "eh"],
  ["ay", "eh"],
  ["au", "ah"],
  ["aw", "ah"],
  ["th", "th"],
  ["sh", "sh"],
  ["ch", "sh"],
  ["ph", "fv"],
  ["wh", "oo"],
  ["qu", "oo"],
  ["ck", "consonant"],
  ["ng", "consonant"],
  ["gh", "consonant"],
];

const LETTERS: Record<string, VisemeId> = {
  a: "ah",
  e: "eh",
  i: "ih",
  o: "oh",
  u: "oo",
  y: "ih",
  m: "closed",
  b: "closed",
  p: "closed",
  f: "fv",
  v: "fv",
  w: "oo",
  r: "rr",
  j: "sh",
  l: "consonant",
  n: "consonant",
  t: "consonant",
  d: "consonant",
  s: "consonant",
  z: "consonant",
  c: "consonant",
  k: "consonant",
  g: "consonant",
  h: "consonant",
  x: "consonant",
};

const VOWELS = new Set(["a", "e", "i", "o", "u", "y"]);

export function supportsVisemes(languageCode: string): boolean {
  // Latin-script languages the catalogue offers. The rules are tuned for
  // English but a Latin-script vowel is still a vowel, and an approximate
  // open mouth on an open sound is far better than none.
  return !/^(hi|ar|cmn|ja|ko)-/.test(languageCode);
}

export interface VisemeStep {
  id: VisemeId;
  /** Relative duration, before the whole sequence is fitted to the audio. */
  weight: number;
}

/**
 * Read a word into shapes.
 *
 * A trailing "e" is dropped because in English it is usually silent and the
 * mouth should not finish "make" on a vowel. Doubled consonants collapse for
 * the same reason: "letter" has one "t" sound and two "t"s would put a stall
 * in the middle of the word.
 */
export function wordToVisemes(word: string): VisemeStep[] {
  let letters = word.toLowerCase().replace(/[^a-z]/g, "");
  if (letters.length > 2 && letters.endsWith("e") && !VOWELS.has(letters[letters.length - 2])) {
    letters = letters.slice(0, -1);
  }

  const steps: VisemeStep[] = [];
  let i = 0;
  while (i < letters.length) {
    const pair = letters.slice(i, i + 2);
    const digraph = DIGRAPHS.find(([g]) => g === pair);
    if (digraph) {
      push(steps, digraph[1]);
      i += 2;
      continue;
    }
    if (pair.length === 2 && pair[0] === pair[1] && !VOWELS.has(pair[0])) {
      push(steps, LETTERS[pair[0]] ?? "consonant");
      i += 2;
      continue;
    }
    push(steps, LETTERS[letters[i]] ?? "consonant");
    i += 1;
  }
  return steps;
}

function push(steps: VisemeStep[], id: VisemeId) {
  // A shape repeated back to back is one longer shape, not two identical
  // ones with an invisible boundary between them.
  const last = steps[steps.length - 1];
  if (last && last.id === id) {
    last.weight += VISEMES[id].weight * 0.55;
    return;
  }
  steps.push({ id, weight: VISEMES[id].weight });
}

/** How long the mouth rests, relative to a shape, at each kind of break. */
const GAP = { word: 0.35, clause: 1.1, sentence: 1.8 } as const;

/**
 * Read a whole reply into shapes, with the mouth closing at the gaps.
 *
 * Digits are spoken as words, so they are spelled out first — otherwise a
 * reply that is mostly measurements would animate as silence.
 */
export function textToVisemes(text: string): VisemeStep[] {
  const steps: VisemeStep[] = [];
  const tokens = expandDigits(text).split(/(\s+|[,;:—–]|[.!?]+)/);

  for (const token of tokens) {
    if (!token || /^\s+$/.test(token)) continue;
    if (/^[.!?]+$/.test(token)) {
      rest(steps, GAP.sentence);
      continue;
    }
    if (/^[,;:—–]$/.test(token)) {
      rest(steps, GAP.clause);
      continue;
    }
    const word = wordToVisemes(token);
    if (!word.length) continue;
    if (steps.length) rest(steps, GAP.word);
    steps.push(...word);
  }

  return steps;
}

function rest(steps: VisemeStep[], weight: number) {
  const last = steps[steps.length - 1];
  if (last && last.id === "rest") {
    last.weight = Math.max(last.weight, weight);
    return;
  }
  if (!steps.length) return;
  steps.push({ id: "rest", weight });
}

const DIGIT_WORDS = [
  "zero",
  "one",
  "two",
  "three",
  "four",
  "five",
  "six",
  "seven",
  "eight",
  "nine",
];

function expandDigits(text: string): string {
  return text.replace(/\d/g, (d) => ` ${DIGIT_WORDS[Number(d)]} `);
}

export interface MouthShape {
  jaw: number;
  spread: number;
}

export interface VisemeTrack {
  /** Time in seconds of the centre of each shape. */
  times: number[];
  shapes: MouthShape[];
  duration: number;
}

/**
 * Fit a sequence of shapes to the length of the audio.
 *
 * The result is a set of control points at the centre of each shape rather
 * than a set of intervals, because what the mouth does between two shapes
 * matters as much as the shapes: interpolating centre to centre gives a
 * mouth that is always travelling, which is what a real one does. Holding
 * each shape and then snapping to the next gives a mouth that ticks.
 *
 * A rest is added at each end so the face starts and finishes shut rather
 * than beginning mid-vowel.
 */
export function visemeTrack(text: string, duration: number): VisemeTrack {
  const steps = textToVisemes(text);
  const safeDuration = Math.max(duration, 0.001);
  if (!steps.length) {
    return { times: [0, safeDuration], shapes: [rested(), rested()], duration: safeDuration };
  }

  const total = steps.reduce((sum, s) => sum + s.weight, 0);
  const scale = safeDuration / total;

  const times: number[] = [0];
  const shapes: MouthShape[] = [rested()];

  let cursor = 0;
  for (const step of steps) {
    const span = step.weight * scale;
    times.push(cursor + span / 2);
    shapes.push({ jaw: VISEMES[step.id].jaw, spread: VISEMES[step.id].spread });
    cursor += span;
  }

  times.push(safeDuration);
  shapes.push(rested());

  return { times, shapes, duration: safeDuration };
}

function rested(): MouthShape {
  return { jaw: 0, spread: 0 };
}

/** Sample the track. Before the start and after the end the mouth is shut. */
export function shapeAt(track: VisemeTrack, time: number): MouthShape {
  const { times, shapes } = track;
  if (time <= times[0]) return { ...shapes[0] };
  if (time >= times[times.length - 1]) return { ...shapes[shapes.length - 1] };

  let i = 1;
  while (i < times.length && times[i] < time) i++;

  const t0 = times[i - 1];
  const t1 = times[i];
  const span = t1 - t0;
  const raw = span <= 0 ? 1 : (time - t0) / span;
  // Ease rather than ramp linearly: a mouth accelerates out of one shape and
  // decelerates into the next, and a linear crossfade reads as mechanical.
  const t = raw * raw * (3 - 2 * raw);

  return {
    jaw: shapes[i - 1].jaw + (shapes[i].jaw - shapes[i - 1].jaw) * t,
    spread: shapes[i - 1].spread + (shapes[i].spread - shapes[i - 1].spread) * t,
  };
}
