/**
 * The agent catalogue.
 *
 * Each entry is a self-contained measurement that a laptop camera can
 * genuinely perform. The `evidence` and `limits` fields are not decoration:
 * they are rendered in the UI so that anyone using the tool can see what the
 * measurement is based on and where it stops being trustworthy.
 */

export type AgentStatus = "ready" | "research" | "planned";

export type Sensor = "camera" | "microphone" | "camera+optics";

export interface AgentDefinition {
  slug: string;
  name: string;
  /** One line, plain language, no jargon. */
  summary: string;
  /** What the camera physically measures, before any interpretation. */
  measures: string[];
  sensors: Sensor[];
  status: AgentStatus;
  /** The published basis for the method. */
  evidence: string;
  /** The honest failure mode. Always shown next to results. */
  limits: string;
  /** Roughly how long a measurement takes. */
  durationSeconds: number;
  accent: string;
  icon: AgentIcon;
}

export type AgentIcon =
  | "heart"
  | "eye"
  | "hand"
  | "face"
  | "strip"
  | "dish"
  | "leaf"
  | "waveform";

export const AGENTS: AgentDefinition[] = [
  {
    slug: "companion",
    name: "Live Wellness Companion",
    summary:
      "A spoken conversation with an assistant that can see your pulse and hear the acoustics of your voice while you talk.",
    measures: [
      "Heart rate, breathing and HRV from the camera, continuously",
      "Pitch, jitter, shimmer and harmonics-to-noise from the microphone",
      "Speech rate and how much of the time is spent pausing",
      "All of it passed to Claude as context for the conversation",
    ],
    sensors: ["camera", "microphone"],
    status: "research",
    evidence:
      "Combines the rPPG chain used by the vitals agent with the standard clinical-phonetics measures — F0, jitter, shimmer and harmonics-to-noise ratio as defined by Boersma (1993) and implemented in Praat. The conversation layer is Claude, given the measurements as sensor context with its limits stated in the system prompt.",
    limits:
      "The acoustic measures describe the sound of a voice and nothing more. Published links between them and depression, Parkinson's or cognitive decline are population-level findings that do not transfer to one person in one conversation, and the assistant is instructed never to apply them. It is not a therapist and cannot diagnose anything.",
    durationSeconds: 300,
    accent: "#c084fc",
    icon: "waveform",
  },
  {
    slug: "vitals",
    name: "Contactless Vitals",
    summary:
      "Heart rate, variability, breathing and stress from tiny colour changes in your face.",
    measures: [
      "Pulse waveform from forehead and cheek skin colour",
      "Beat-to-beat intervals for HRV",
      "Breathing from head movement",
      "Blood pressure, once calibrated against a cuff",
    ],
    sensors: ["camera"],
    status: "ready",
    evidence:
      "Remote photoplethysmography using the POS projection (Wang et al., IEEE TBME 2017) with CHROM (de Haan & Jeanne, 2013) as a cross-check. Both are the standard non-learned baselines in the rPPG literature.",
    limits:
      "Needs even lighting and a still head. Melanin absorbs much of the green-channel signal, so darker skin gives a weaker trace and a lower confidence score — the number is not hidden, but the uncertainty is real and shown.",
    durationSeconds: 30,
    accent: "#f0705b",
    icon: "heart",
  },
  {
    slug: "alertness",
    name: "Alertness & Gaze",
    summary:
      "Blink rate, eye closure, head nodding and where you are looking, combined into a fatigue score.",
    measures: [
      "Eye aspect ratio and blink duration",
      "PERCLOS — proportion of time the eyes are closed",
      "Head pitch for nodding",
      "Horizontal gaze from iris position",
    ],
    sensors: ["camera"],
    status: "ready",
    evidence:
      "PERCLOS is the measure used in driver-drowsiness research and in deployed vehicle safety systems; eye aspect ratio follows Soukupová & Čech (2016).",
    limits:
      "Spectacles with strong reflections break iris tracking. Gaze here is a direction estimate, not a calibrated screen-coordinate eye tracker.",
    durationSeconds: 60,
    accent: "#60a5fa",
    icon: "eye",
  },
  {
    slug: "motor",
    name: "Tremor & Finger Tapping",
    summary:
      "Quantifies hand tremor frequency and finger-tapping rhythm, the way a neurological exam does by eye.",
    measures: [
      "Fingertip trajectory at camera frame rate",
      "Dominant tremor frequency by FFT",
      "Tap frequency, amplitude and amplitude decrement",
      "Rhythm irregularity and left-right asymmetry",
    ],
    sensors: ["camera"],
    status: "ready",
    evidence:
      "Finger tapping, amplitude decrement and rhythm are scored items in the MDS-UPDRS motor examination. Rest tremor characteristically sits at 4–6 Hz, which separates it from essential tremor at 6–12 Hz.",
    limits:
      "This measures motor features. It does not diagnose Parkinson's disease or any other condition, and a single session cannot distinguish disease from fatigue, caffeine or anxiety.",
    durationSeconds: 20,
    accent: "#a78bfa",
    icon: "hand",
  },
  {
    slug: "fast",
    name: "FAST Stroke Check",
    summary:
      "Face symmetry, arm drift and speech — a triage prompt to seek emergency care, never a diagnosis.",
    measures: [
      "Mouth-corner and eye-opening asymmetry",
      "Arm drift over a ten-second hold",
      "Speech clarity from the microphone",
    ],
    sensors: ["camera", "microphone"],
    status: "research",
    evidence:
      "Follows the FAST protocol (Face, Arms, Speech, Time) used in public stroke-awareness campaigns and by emergency dispatchers.",
    limits:
      "Tuned for high sensitivity, so false alarms are expected and intended — a missed stroke costs far more than an unnecessary check. Never use this to decide against calling emergency services.",
    durationSeconds: 25,
    accent: "#f87171",
    icon: "face",
  },
  {
    slug: "strip",
    name: "Test Strip Reader",
    summary:
      "Reads lateral-flow and urinalysis strips quantitatively using a printed colour reference card.",
    measures: [
      "Strip location and orientation",
      "Test and control line intensity",
      "White balance corrected against a reference card",
    ],
    sensors: ["camera"],
    status: "planned",
    evidence:
      "Colorimetric assay reading with a reference card is the established way to make phone-camera measurements comparable across devices and lighting.",
    limits:
      "Without the reference card in frame the result is not quantitative. Different strip brands need their own calibration curve.",
    durationSeconds: 5,
    accent: "#4ade80",
    icon: "strip",
  },
  {
    slug: "colony",
    name: "Colony Counter",
    summary:
      "Counts bacterial colonies on a Petri dish and measures antibiotic inhibition zones.",
    measures: [
      "Plate boundary detection",
      "Colony segmentation and count",
      "Colony size distribution",
      "Zone-of-inhibition diameter",
    ],
    sensors: ["camera"],
    status: "planned",
    evidence:
      "Classical segmentation is sufficient for well-separated colonies; this is routine, tedious manual work in every microbiology lab.",
    limits: "Crowded or overlapping colonies need a learned segmenter to count reliably.",
    durationSeconds: 3,
    accent: "#22d3ee",
    icon: "dish",
  },
];

export function getAgent(slug: string): AgentDefinition | undefined {
  return AGENTS.find((a) => a.slug === slug);
}

export const READY_AGENTS = AGENTS.filter((a) => a.status !== "planned");
