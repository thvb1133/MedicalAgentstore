/**
 * What the companion can say with no language model behind it.
 *
 * The published copy of this application has no server, so Claude is not
 * reachable from it. The tempting response is to leave the conversation dead
 * and put an apology where the replies go. The better one is to answer the
 * questions that can be answered without a model at all: what a reading
 * means, what the app is doing, why a number is missing, what it will not
 * claim. Those answers are the same every time, which is exactly what makes
 * them safe to write down.
 *
 * Two rules hold this together and neither is negotiable.
 *
 * It never pretends to be the model. Every reply is announced as coming from
 * a scripted guide, and the interface labels the whole mode. Somebody must
 * not come away believing they had a conversation with an intelligence that
 * was not there.
 *
 * It never interprets. It will read back what the sensors currently say,
 * because those numbers were genuinely measured, and it will explain what a
 * quantity is in general terms. It will not tell anybody what their reading
 * means for them, which is the one thing a scripted answer cannot possibly
 * know and the one thing a person most wants to hear.
 */

import { type LiveContext } from "./conversation";

export interface GuideAnswer {
  text: string;
  /** True when this came from the topic list rather than a generic fallback. */
  matched: boolean;
}

interface Topic {
  id: string;
  /** Any of these in the question selects the topic. */
  cues: string[];
  answer: string;
}

/**
 * Ordered: the first match wins, so put the specific before the general.
 * "blood pressure" has to be tested before "pressure" or "blood".
 *
 * Crisis is first for a reason that is not tidiness. "I have chest pain and
 * cannot breathe" contains the word "breath", and a list ordered by subject
 * answers it with a paragraph about the breathing coach.
 */
const TOPICS: Topic[] = [
  {
    id: "emergency",
    cues: ["chest pain", "can't breathe", "cannot breathe", "suicid", "kill myself", "harm myself"],
    answer:
      "Please stop using this and get help from a person now. If you are in immediate danger or having chest pain or difficulty breathing, call your local emergency number. If you are thinking about harming yourself, contact a crisis line in your country or someone you trust. This is a measurement tool and it is not the right thing to be talking to.",
  },
  {
    id: "blood-pressure",
    cues: ["blood pressure", "bp", "systolic", "diastolic"],
    answer:
      "A camera cannot measure blood pressure directly. It measures the shape and timing of your pulse wave, and pressure is inferred from that shape — and the relationship differs from person to person. So this shows nothing until you have calibrated against a real arm cuff, and after that it tracks change from your own anchor rather than claiming an absolute figure. Anything promising a cuff-free blood pressure to within a point or two is describing something that does not exist.",
  },
  {
    id: "heart-rate",
    cues: ["heart rate", "pulse", "bpm", "heartbeat"],
    answer:
      "Your heart rate comes from tiny colour changes in your skin as blood moves through it — a few parts in a thousand of brightness, which is why lighting matters so much. Three separate methods run at once on three regions of your face, and they have to agree before a number is shown. A resting adult is usually somewhere between fifty and ninety beats a minute, but your own usual range matters far more than that average.",
  },
  {
    id: "hrv",
    cues: ["hrv", "variability", "sdnn", "rmssd"],
    answer:
      "Heart rate variability is the variation in the gaps between beats, not in the rate itself. A heart that beats a little irregularly at rest is generally a sign of a responsive nervous system. It is very sensitive to how still you are and how good the signal is, so treat a single reading as rough and look at the trend across days instead.",
  },
  {
    id: "quality",
    cues: ["quality", "confidence", "low signal", "no signal", "why is it blank", "not showing"],
    answer:
      "Signal quality is the product of eight separate things — how visible your face is, how much you are moving, the frame rate, the timing jitter, how sharp the pulse peak is, how much data has been collected, whether the methods agree, and the lighting. One bad term drags the whole score down instead of being averaged away. When the score is too low the number is withheld rather than guessed, and the interface names whichever term is holding it back.",
  },
  {
    id: "lighting",
    cues: ["light", "lighting", "dark", "bright", "window"],
    answer:
      "Even, front-on light is what this needs. Light from one side is worse than light that is merely dim, because it puts half your face in shadow and the two sides then disagree. Sitting facing a window, or with a lamp behind the screen rather than behind you, is usually the single biggest improvement anybody can make.",
  },
  {
    id: "breathing",
    cues: ["breath", "breathing", "coherence", "pacer"],
    answer:
      "Breathing rate is read from the small rise and fall of your head rather than from your chest. The breathing coach goes further: it measures how closely your heart rhythm is following your breath, which is a real biofeedback measure. Breathing slowly and evenly at about six breaths a minute is what pulls the two into step. It is interesting to watch and it is not a therapy.",
  },
  {
    id: "voice",
    cues: ["voice", "jitter", "shimmer", "acoustic", "hoarse", "pitch"],
    answer:
      "The voice measures here are standard clinical phonetics — pitch, cycle-to-cycle variation in period and amplitude, the ratio of periodic to noisy energy, speech rate and pausing. They are shown against published reference ranges and deliberately not combined into a single wellness score. There is research linking these measures to various conditions at a population level, and applying that to one person in one conversation is exactly the step this refuses to take.",
  },
  {
    id: "privacy",
    cues: ["privacy", "private", "data", "stored", "upload", "server", "share"],
    answer:
      "No video frame and no audio sample ever leaves your device. All of the measurement happens in your browser. Your history is stored in this browser's local storage, and the cloud mirror is optional and off unless it has been configured. Your photograph, if you upload one, is re-encoded here — which also strips the GPS coordinates a phone writes into a picture — and is never sent anywhere.",
  },
  {
    id: "accuracy",
    cues: ["accurate", "accuracy", "reliable", "trust", "how good"],
    answer:
      "The engines are tested against synthetic signals whose correct answer is known in advance, and the application is driven end to end in a real browser on every change. What has not been done is a clinical trial against ECG and a reference cuff on real people, and there is no CE mark or FDA clearance. The evidence page says all of that in more detail, including what is missing.",
  },
  {
    id: "diagnosis",
    cues: ["diagnos", "do i have", "am i ill", "is it serious", "disease", "condition"],
    answer:
      "I cannot tell you that, and neither can this application. It produces wellness and research estimates from a camera, and it does not diagnose, treat or rule out anything. If something is worrying you, or you feel unwell, please speak to a clinician — that is not a formality, it is the correct next step.",
  },
  {
    id: "sign-language",
    cues: ["sign language", "asl", "deaf", "fingerspell", "signing"],
    answer:
      "The signing page shows key signs beside a full caption, never instead of one, and the manual alphabet is drawn from a hand rig rather than a set of pictures. It is not fluent ASL and the interface says so wherever it appears. You can also spell to the camera and it will read the letters back — and the same frames measure your pulse at the same time.",
  },
  {
    id: "what-is-this",
    cues: ["what is this", "what are you", "who are you", "how does this work", "what can you do"],
    answer:
      "This turns an ordinary camera into a measurement instrument: heart rate and its variability, breathing, alertness from your eyelids, tremor from your fingertips, and the acoustics of your voice. Everything is computed on your own device, and any number the software cannot stand behind is withheld rather than guessed at.",
  },
  {
    id: "keys",
    cues: ["claude", "api key", "anthropic", "polly", "why can't you talk", "no reply"],
    answer:
      "The full conversation needs a language model, and this published copy has no server to hold the key, so you are getting me instead — a short list of written answers. Everything you can measure here is unaffected by that, because none of it ever needed a key. Run the project with an Anthropic key and the real assistant takes over, with far better answers than mine.",
  },
];

const FALLBACK =
  "I only have a short list of written answers here, and that one is not on it. Try asking about heart rate, heart rate variability, breathing, blood pressure, voice measures, signal quality, lighting or privacy. For anything beyond that, the full assistant needs an Anthropic key — this published copy has no server to keep one in.";

const PREFIX = "Scripted guide";

/**
 * Answer from the topic list, and say plainly where the answer came from.
 *
 * The prefix is part of the text rather than a separate badge because this
 * string is also what gets spoken aloud, and the spoken version is the one
 * where a missing disclaimer matters most — there is no screen to look at.
 */
export function guideReply(question: string, context?: LiveContext): GuideAnswer {
  const asked = question.toLowerCase();

  // Only when there is something to read. Asked "what is my blood pressure"
  // with no session running, the useful answer is what the measurement is,
  // not an instruction to sit still in front of a camera nobody has opened.
  if (context?.vitals && wantsReadings(asked)) {
    return { text: `${PREFIX}: ${readingsSentence(context)}`, matched: true };
  }

  for (const topic of TOPICS) {
    if (topic.cues.some((cue) => asked.includes(cue))) {
      return { text: `${PREFIX}: ${topic.answer}`, matched: true };
    }
  }

  return { text: `${PREFIX}: ${FALLBACK}`, matched: false };
}

function wantsReadings(asked: string): boolean {
  return (
    /\b(my|current|right now|reading|readings|numbers?|vitals)\b/.test(asked) &&
    /\b(what|show|tell|read|how)\b/.test(asked)
  );
}

/**
 * Read the live numbers back, and nothing else.
 *
 * This is the one place the guide touches real measurements, so it states
 * them and stops. No comparison to a normal range, no reassurance, no
 * concern — those are interpretations, and a lookup table has no business
 * making them about somebody's body.
 */
function readingsSentence(context?: LiveContext): string {
  const vitals = context?.vitals;
  if (!vitals || vitals.quality < 0.15) {
    return "Nothing is measurable yet. Sit so your whole face is in frame, hold reasonably still, and give it about half a minute — I will not read out a number before there is one.";
  }

  const parts: string[] = [];
  if (vitals.heartRateBpm !== null) {
    parts.push(`heart rate ${Math.round(vitals.heartRateBpm)} beats per minute`);
  }
  if (vitals.breathingRateBpm !== null) {
    parts.push(`breathing ${Math.round(vitals.breathingRateBpm)} breaths per minute`);
  }
  if (vitals.hrvSdnnMs !== null) {
    parts.push(`heart rate variability ${Math.round(vitals.hrvSdnnMs)} milliseconds`);
  }
  if (vitals.bloodPressure) {
    parts.push(
      `blood pressure about ${vitals.bloodPressure.systolic} over ${vitals.bloodPressure.diastolic}`,
    );
  }

  if (parts.length === 0) {
    return `The signal is there but nothing has settled yet — quality is ${Math.round(vitals.quality * 100)} per cent${vitals.limiting ? `, held back by ${vitals.limiting.toLowerCase()}` : ""}.`;
  }

  const quality = `Signal quality ${Math.round(vitals.quality * 100)} per cent${vitals.limiting ? `, limited by ${vitals.limiting.toLowerCase()}` : ""}.`;
  return `Right now: ${parts.join(", ")}. ${quality} I can read these back but I am not able to interpret them for you.`;
}
