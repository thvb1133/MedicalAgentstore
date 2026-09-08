/**
 * Eyes as an input device.
 *
 * The eye tracking in this app exists for health reasons — blink duration for
 * drowsiness, gaze for the neurological checks. The same landmarks, with
 * nothing added, are also a usable switch interface for somebody who cannot
 * speak, sign or use their hands. That is not a coincidence to be pleased
 * about; it is the argument for building the accessibility path and the
 * sensing path out of one camera pass instead of two.
 *
 * Two ways in, because the right one depends on what the person can control:
 *
 *   Gaze. Look left or right to move the highlight, then hold still on a
 *   choice to take it. Fast, and needs reliable horizontal eye control.
 *
 *   Scanning. The highlight steps through the choices by itself and a single
 *   deliberate action takes the one that is lit. This is the standard
 *   assistive-technology fallback, and it needs exactly one reliable movement
 *   — here, holding the eyes shut.
 *
 * The one thing that makes a blink switch usable is telling a deliberate
 * closure from an ordinary one. Spontaneous blinks run 100 to 300 ms; a
 * closure held past half a second is almost never accidental. Everything
 * shorter is ignored rather than debated.
 */

export type SwitchMode = "gaze" | "scan";

export interface SwitchOption {
  id: string;
  label: string;
}

export interface SwitchFrame {
  timestampMs: number;
  /** Mean eye aspect ratio, or null when the face is not visible. */
  ear: number | null;
  /** Horizontal gaze, -1 to 1, 0 centred. */
  gazeX: number | null;
}

export interface SwitchState {
  /** Index of the highlighted option, or -1 before anything is highlighted. */
  focus: number;
  /** 0-1 towards taking the highlighted option. */
  progress: number;
  /** True while the eyes are held shut past the accidental range. */
  holding: boolean;
  /** Set for exactly one frame when a choice is taken. */
  chosen: SwitchOption | null;
  /** Whether the open-eye baseline has been learnt yet. */
  ready: boolean;
  /** What the person should do next, in plain language. */
  prompt: string;
}

export interface SwitchSettings {
  mode: SwitchMode;
  /** How long to hold a gaze on one choice before it is taken. */
  dwellMs: number;
  /** How long each choice stays lit while scanning. */
  scanMs: number;
  /** How long the eyes must stay shut for it to count as deliberate. */
  holdMs: number;
}

export const DEFAULT_SWITCH: SwitchSettings = {
  mode: "scan",
  dwellMs: 1200,
  scanMs: 1800,
  holdMs: 600,
};

/** Seconds of open eyes used to learn this person's eye aspect ratio. */
const CALIBRATION_MS = 2000;
/** Below this fraction of the open baseline, the eye counts as shut. */
const CLOSED_FRACTION = 0.62;
/** Gaze past this counts as looking to one side. */
const GAZE_EDGE = 0.28;
/** After a choice, ignore everything for this long so one act is not two. */
const REFRACTORY_MS = 900;

export class SwitchInput {
  private settings: SwitchSettings;
  private options: SwitchOption[] = [];
  private openEar = 0;
  private calibrationSum = 0;
  private calibrationCount = 0;
  private firstTimestamp: number | null = null;
  private ready = false;

  private focus = -1;
  private dwellStart: number | null = null;
  private closedSince: number | null = null;
  private lastStep = 0;
  private mutedUntil = 0;
  private lastGazeSide: "left" | "right" | "centre" = "centre";
  /** Set after a choice: the eyes must open before they can choose again. */
  private needsRelease = false;

  constructor(settings: Partial<SwitchSettings> = {}) {
    this.settings = { ...DEFAULT_SWITCH, ...settings };
  }

  configure(settings: Partial<SwitchSettings>): void {
    const modeChanged = settings.mode !== undefined && settings.mode !== this.settings.mode;
    this.settings = { ...this.settings, ...settings };
    if (modeChanged) {
      this.focus = this.options.length > 0 ? 0 : -1;
      this.dwellStart = null;
    }
  }

  setOptions(options: SwitchOption[]): void {
    const same =
      options.length === this.options.length &&
      options.every((o, i) => o.id === this.options[i].id);
    if (same) return;
    this.options = options;
    this.focus = options.length > 0 ? 0 : -1;
    this.dwellStart = null;
  }

  reset(): void {
    this.openEar = 0;
    this.calibrationSum = 0;
    this.calibrationCount = 0;
    this.firstTimestamp = null;
    this.ready = false;
    this.focus = this.options.length > 0 ? 0 : -1;
    this.dwellStart = null;
    this.closedSince = null;
    this.mutedUntil = 0;
    this.needsRelease = false;
  }

  push(frame: SwitchFrame): SwitchState {
    const now = frame.timestampMs;
    if (this.firstTimestamp === null) {
      this.firstTimestamp = now;
      this.lastStep = now;
    }

    if (frame.ear === null) {
      // A lost face must not be read as a closed eye, or looking away would
      // press the button.
      this.closedSince = null;
      this.dwellStart = null;
      return this.state("Move back into the camera's view");
    }

    if (!this.ready) {
      this.calibrationSum += frame.ear;
      this.calibrationCount++;
      this.openEar = this.calibrationSum / this.calibrationCount;
      if (now - this.firstTimestamp >= CALIBRATION_MS && this.calibrationCount >= 20) {
        this.ready = this.openEar > 0.05;
        this.lastStep = now;
      }
      if (!this.ready) return this.state("Look at the screen with your eyes open");
    }

    const shut = frame.ear < this.openEar * CLOSED_FRACTION;
    if (!shut) {
      this.closedSince = null;
      this.needsRelease = false;
    } else if (!this.needsRelease && this.closedSince === null) {
      this.closedSince = now;
    }
    const heldFor = this.closedSince === null ? 0 : now - this.closedSince;
    const holding = heldFor > 0;
    const deliberate = heldFor >= this.settings.holdMs;

    if (now < this.mutedUntil) {
      return { ...this.state("Taken"), holding };
    }
    if (this.options.length === 0) return this.state("Nothing to choose from");

    if (this.settings.mode === "scan") {
      return this.scan(now, deliberate, holding, heldFor);
    }
    return this.gaze(now, frame.gazeX, deliberate, holding);
  }

  /** Highlight steps along on a timer; a held closure takes what is lit. */
  private scan(
    now: number,
    deliberate: boolean,
    holding: boolean,
    heldFor: number,
  ): SwitchState {
    if (deliberate) return this.take(now);

    // Scanning pauses the moment the eyes shut, so the highlight cannot move
    // out from under a choice already being taken.
    if (!holding && now - this.lastStep >= this.settings.scanMs) {
      this.focus = (this.focus + 1) % this.options.length;
      this.lastStep = now;
    }

    const progress = holding
      ? Math.min(1, heldFor / this.settings.holdMs)
      : Math.min(1, (now - this.lastStep) / this.settings.scanMs);

    return {
      focus: this.focus,
      progress,
      holding,
      chosen: null,
      ready: true,
      prompt: holding ? "Keep your eyes shut to take it" : "Close your eyes to choose",
    };
  }

  /** Glance to move, hold your gaze to take. */
  private gaze(
    now: number,
    gazeX: number | null,
    deliberate: boolean,
    holding: boolean,
  ): SwitchState {
    if (deliberate) return this.take(now);
    if (gazeX === null) return this.state("Looking for your eyes");

    const side = gazeX < -GAZE_EDGE ? "left" : gazeX > GAZE_EDGE ? "right" : "centre";

    // A glance moves the highlight once. Holding a glance must not run the
    // highlight along the whole list, so the move only fires on the way in.
    if (side !== this.lastGazeSide && side !== "centre") {
      const step = side === "right" ? 1 : -1;
      this.focus = (this.focus + step + this.options.length) % this.options.length;
      this.dwellStart = null;
    }
    this.lastGazeSide = side;

    if (side === "centre") {
      if (this.dwellStart === null) this.dwellStart = now;
      const dwelt = now - this.dwellStart;
      if (dwelt >= this.settings.dwellMs) return this.take(now);
      return {
        focus: this.focus,
        progress: Math.min(1, dwelt / this.settings.dwellMs),
        holding,
        chosen: null,
        ready: true,
        prompt: "Hold still to take this one",
      };
    }

    this.dwellStart = null;
    return {
      focus: this.focus,
      progress: 0,
      holding,
      chosen: null,
      ready: true,
      prompt: "Look ahead to take it, or glance again to move on",
    };
  }

  private take(now: number): SwitchState {
    const chosen = this.options[this.focus] ?? null;
    this.mutedUntil = now + REFRACTORY_MS;
    this.dwellStart = null;
    this.closedSince = null;
    // Eyes still shut after a choice is one act, not the start of the next.
    this.needsRelease = true;
    this.lastStep = now + REFRACTORY_MS;
    return {
      focus: this.focus,
      progress: 1,
      holding: false,
      chosen,
      ready: true,
      prompt: chosen ? `Taken: ${chosen.label}` : "Taken",
    };
  }

  private state(prompt: string): SwitchState {
    return {
      focus: this.focus,
      progress: 0,
      holding: false,
      chosen: null,
      ready: this.ready,
      prompt,
    };
  }
}

/**
 * The answers worth having on a switch board.
 *
 * Short, unambiguous, and enough to hold up one side of a conversation
 * without typing. "Say that again" and "Slow down" are here because the
 * commonest thing a person needs from a talking system is control over its
 * pace, and having to spell that out one letter at a time is the failure.
 */
export const QUICK_REPLIES: SwitchOption[] = [
  { id: "yes", label: "Yes" },
  { id: "no", label: "No" },
  { id: "repeat", label: "Say that again" },
  { id: "slower", label: "Please slow down" },
  { id: "unsure", label: "I am not sure" },
  { id: "help", label: "I need help" },
];
