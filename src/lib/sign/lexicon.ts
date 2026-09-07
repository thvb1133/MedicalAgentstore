/**
 * A lexicon of ASL signs.
 *
 * Each entry is a real sign: a handshape, a place on or near the body, a
 * movement, and where it matters a facial marker. They are written as
 * keyframes against the named anchors in `body.ts`, in the same terms a
 * signer would use to describe them — "flat hand, fingertips at the chin,
 * moves forward and down" — so that someone who knows ASL can check the
 * lexicon without reading a single joint angle. Every entry carries that
 * description in `description`, and the fingerspelling page prints it.
 *
 * ## What this is, and what it is not
 *
 * These are genuine lexical signs, and the ones here are among the most
 * frequent in a health conversation. What this system does **not** do is
 * produce fluent ASL.
 *
 * ASL is not English with the words swapped. It has its own grammar: topic
 * comment ordering, verbs that agree by moving between points in space,
 * classifiers that describe shape and motion, and non-manual markers that
 * carry syntax rather than mood. Mapping English words onto signs one at a
 * time — which is what any system driven by English text must do — produces
 * something much closer to Signed Exact English than to ASL, and a fluent
 * signer will read it as broken.
 *
 * So this is offered as *key signs alongside the full caption*, which is a
 * genuinely useful thing and an honest one, rather than as interpretation. It
 * was also built without a Deaf signer in the room, which is the single
 * largest caveat on the whole file: every sign here should be checked by one
 * before anybody relies on it.
 */

import { blendPoses, type HandPose } from "./hand";
import { at, blendFace, blendPoint, face, NEUTRAL_FACE, type FaceState, type Point } from "./body";
import { HANDSHAPES, type HandshapeName } from "./handshapes";

export interface HandFrame {
  shape: HandPose;
  at: Point;
  /**
   * How far the hand is held out from the body, 0 to 1.
   *
   * A plane has no depth, and several signs are defined by movement straight
   * toward the person being addressed — THANK-YOU travels forward, and
   * without some cue it is a hand that simply stops. Drawing the hand larger
   * as it comes forward is the same cue a drawing uses, and it is enough to
   * read the direction.
   */
  z?: number;
}

export interface SignFrame {
  /** Position in the sign, 0 at the start and 1 at the end. */
  t: number;
  /** The signer's dominant hand. Null leaves it at rest. */
  right: HandFrame | null;
  left: HandFrame | null;
  face?: FaceState;
}

export interface Sign {
  /** The conventional gloss, in the small capitals signers write signs in. */
  gloss: string;
  /** English words and phrases that select this sign. */
  triggers: string[];
  frames: SignFrame[];
  /** Seconds. Signs with more movement need longer. */
  duration: number;
  /** How the sign is actually made, in a signer's terms. */
  description: string;
  /**
   * True where a hand flexed in one plane cannot reproduce the real sign —
   * usually because palm orientation or a crossing of the hands carries part
   * of the meaning. Shown in the interface rather than hidden.
   */
  approximate?: boolean;
}

function hand(
  shape: HandshapeName,
  point: Point,
  options: { facing?: HandPose["facing"]; rotation?: number; z?: number } = {},
): HandFrame {
  const base = HANDSHAPES[shape];
  return {
    shape: {
      ...base,
      facing: options.facing ?? base.facing,
      rotation: options.rotation ?? base.rotation,
    },
    at: point,
    z: options.z ?? 0,
  };
}

/** Shift a hand frame, for the many signs built from repeated small moves. */
function moved(frame: HandFrame, dx: number, dy: number, dz = 0): HandFrame {
  return {
    shape: frame.shape,
    at: { x: frame.at.x + dx, y: frame.at.y + dy },
    z: (frame.z ?? 0) + dz,
  };
}

const CONCERNED = face({ brows: -0.5, squint: 0.4, mouth: "frown" });
const WARM = face({ brows: 0.25, mouth: "smile" });

export const LEXICON: Sign[] = [
  {
    gloss: "HELLO",
    triggers: ["hello", "hi", "hey", "greetings"],
    duration: 0.85,
    description:
      "Flat hand, fingertips at the temple like a casual salute, swings outward and forward away from the head.",
    frames: [
      { t: 0, right: hand("FLAT", at("templeRight", 0.02, 0.04), { rotation: -12 }), left: null, face: WARM },
      { t: 1, right: hand("FLAT", at("templeRight", -0.34, 0.08), { rotation: -34, z: 0.5 }), left: null, face: WARM },
    ],
  },
  {
    gloss: "THANK-YOU",
    triggers: ["thank you", "thanks", "thank"],
    duration: 0.9,
    description:
      "Flat hand, fingertips touch the chin, then move forward and down toward the person being addressed.",
    frames: [
      { t: 0, right: hand("FLAT", at("chin", -0.04), { facing: "back" }), left: null, face: WARM },
      { t: 1, right: hand("FLAT", at("chin", -0.04, 0.4), { facing: "back", rotation: -18, z: 0.9 }), left: null, face: WARM },
    ],
  },
  {
    gloss: "YES",
    triggers: ["yes", "yeah", "yep", "correct", "right"],
    duration: 0.8,
    description: "Fist held up in neutral space, nodding at the wrist like a head saying yes.",
    frames: [
      { t: 0, right: hand("S", at("neutralHigh", -0.1)), left: null },
      { t: 0.3, right: hand("S", at("neutralHigh", -0.1, 0.05), { rotation: 34 }), left: null, face: face({ headNod: 0.6 }) },
      { t: 0.6, right: hand("S", at("neutralHigh", -0.1)), left: null },
      { t: 1, right: hand("S", at("neutralHigh", -0.1, 0.05), { rotation: 34 }), left: null, face: face({ headNod: 0.6 }) },
    ],
  },
  {
    gloss: "NO",
    triggers: ["no", "nope", "not", "never"],
    duration: 0.7,
    description:
      "Index and middle fingers snap down onto the thumb, once, like a beak closing. Accompanied by a head shake.",
    frames: [
      { t: 0, right: hand("V", at("neutralHigh", -0.12)), left: null, face: face({ headTurn: -0.4 }) },
      { t: 1, right: hand("FLAT_O", at("neutralHigh", -0.12)), left: null, face: face({ headTurn: 0.4, brows: -0.3 }) },
    ],
  },
  {
    gloss: "PLEASE",
    triggers: ["please"],
    duration: 1,
    description: "Flat hand flat on the chest, circling.",
    frames: [
      { t: 0, right: hand("FLAT", at("chest", -0.08, -0.1), { facing: "back" }), left: null, face: WARM },
      { t: 0.25, right: hand("FLAT", at("chest", 0.06, -0.02), { facing: "back" }), left: null },
      { t: 0.5, right: hand("FLAT", at("chest", -0.08, 0.08), { facing: "back" }), left: null },
      { t: 0.75, right: hand("FLAT", at("chest", -0.2, -0.02), { facing: "back" }), left: null },
      { t: 1, right: hand("FLAT", at("chest", -0.08, -0.1), { facing: "back" }), left: null, face: WARM },
    ],
  },
  {
    gloss: "SORRY",
    triggers: ["sorry", "apologise", "apologize", "apologies"],
    duration: 1,
    description: "Fist against the chest, circling.",
    frames: [
      { t: 0, right: hand("A", at("chest", -0.08, -0.1), { facing: "back" }), left: null, face: CONCERNED },
      { t: 0.25, right: hand("A", at("chest", 0.04, -0.02), { facing: "back" }), left: null },
      { t: 0.5, right: hand("A", at("chest", -0.08, 0.08), { facing: "back" }), left: null },
      { t: 0.75, right: hand("A", at("chest", -0.2, -0.02), { facing: "back" }), left: null },
      { t: 1, right: hand("A", at("chest", -0.08, -0.1), { facing: "back" }), left: null, face: CONCERNED },
    ],
  },
  {
    gloss: "HELP",
    triggers: ["help", "assist", "support"],
    duration: 0.9,
    description:
      "Fist with the thumb up rests on the flat upturned palm of the other hand; both rise together.",
    frames: [
      {
        t: 0,
        right: hand("A", at("neutral", -0.02, 0.16)),
        left: hand("FLAT", at("neutral", 0.02, 0.26), { facing: "back", rotation: 88 }),
      },
      {
        t: 1,
        right: hand("A", at("neutral", -0.02, -0.14)),
        left: hand("FLAT", at("neutral", 0.02, -0.04), { facing: "back", rotation: 88 }),
      },
    ],
  },
  {
    gloss: "FINE",
    triggers: ["fine", "well", "alright", "all right"],
    duration: 0.85,
    description:
      "Open hand with the fingers spread, thumb touching the centre of the chest, then the hand moves forward off the chest.",
    frames: [
      { t: 0, right: hand("FIVE", at("chest", -0.14, -0.06), { rotation: -30 }), left: null, face: WARM },
      { t: 1, right: hand("FIVE", at("chest", -0.2, -0.14), { rotation: -30, z: 0.7 }), left: null, face: WARM },
    ],
  },
  {
    gloss: "GOOD",
    triggers: ["good", "great", "nice", "healthy"],
    duration: 0.9,
    description:
      "Flat hand, fingertips at the chin, then comes down to land palm-up in the other flat palm.",
    frames: [
      {
        t: 0,
        right: hand("FLAT", at("chin", -0.04), { facing: "back" }),
        left: hand("FLAT", at("neutral", 0.04, 0.24), { facing: "back", rotation: 88 }),
        face: WARM,
      },
      {
        t: 1,
        right: hand("FLAT", at("neutral", -0.04, 0.16), { facing: "back", rotation: -88 }),
        left: hand("FLAT", at("neutral", 0.04, 0.24), { facing: "back", rotation: 88 }),
        face: WARM,
      },
    ],
  },
  {
    gloss: "BAD",
    triggers: ["bad", "poor", "unwell", "worse"],
    duration: 0.85,
    description:
      "Flat hand, fingertips at the chin, then the hand turns over and moves down and away.",
    frames: [
      { t: 0, right: hand("FLAT", at("chin", -0.04), { facing: "back" }), left: null, face: CONCERNED },
      { t: 1, right: hand("FLAT", at("neutral", -0.16, 0.3), { facing: "front", rotation: 150 }), left: null, face: CONCERNED },
    ],
  },
  {
    gloss: "HURT",
    triggers: ["hurt", "pain", "painful", "ache", "sore"],
    duration: 0.9,
    description:
      "Two index fingers point toward each other in neutral space and jab together twice. Made at the place that hurts.",
    frames: [
      {
        t: 0,
        right: hand("ONE", at("neutral", -0.26, 0.02), { rotation: 84 }),
        left: hand("ONE", at("neutral", 0.26, 0.02), { rotation: -84 }),
        face: CONCERNED,
      },
      {
        t: 0.3,
        right: hand("ONE", at("neutral", -0.13, 0.02), { rotation: 84 }),
        left: hand("ONE", at("neutral", 0.13, 0.02), { rotation: -84 }),
        face: CONCERNED,
      },
      {
        t: 0.6,
        right: hand("ONE", at("neutral", -0.26, 0.02), { rotation: 84 }),
        left: hand("ONE", at("neutral", 0.26, 0.02), { rotation: -84 }),
      },
      {
        t: 1,
        right: hand("ONE", at("neutral", -0.13, 0.02), { rotation: 84 }),
        left: hand("ONE", at("neutral", 0.13, 0.02), { rotation: -84 }),
        face: CONCERNED,
      },
    ],
  },
  {
    gloss: "HEADACHE",
    triggers: ["headache", "migraine"],
    duration: 0.9,
    description: "The sign for hurt, made at the forehead.",
    frames: [
      {
        t: 0,
        right: hand("ONE", at("forehead", -0.24, 0.06), { rotation: 84 }),
        left: hand("ONE", at("forehead", 0.24, 0.06), { rotation: -84 }),
        face: CONCERNED,
      },
      {
        t: 0.3,
        right: hand("ONE", at("forehead", -0.11, 0.06), { rotation: 84 }),
        left: hand("ONE", at("forehead", 0.11, 0.06), { rotation: -84 }),
        face: CONCERNED,
      },
      {
        t: 0.6,
        right: hand("ONE", at("forehead", -0.24, 0.06), { rotation: 84 }),
        left: hand("ONE", at("forehead", 0.24, 0.06), { rotation: -84 }),
      },
      {
        t: 1,
        right: hand("ONE", at("forehead", -0.11, 0.06), { rotation: 84 }),
        left: hand("ONE", at("forehead", 0.11, 0.06), { rotation: -84 }),
        face: CONCERNED,
      },
    ],
  },
  {
    gloss: "SICK",
    triggers: ["sick", "ill", "illness", "poorly"],
    duration: 0.9,
    description:
      "Middle finger of the open hand touches the forehead while the middle finger of the other touches the stomach.",
    frames: [
      {
        t: 0,
        right: hand("MIDDLE", at("forehead", -0.02, 0.14)),
        left: hand("MIDDLE", at("stomach", 0.06, -0.06)),
        face: CONCERNED,
      },
      {
        t: 1,
        right: hand("MIDDLE", at("forehead", -0.02, 0.06)),
        left: hand("MIDDLE", at("stomach", 0.06, -0.14)),
        face: CONCERNED,
      },
    ],
  },
  {
    gloss: "DOCTOR",
    triggers: ["doctor", "physician", "gp", "clinician"],
    duration: 0.9,
    description:
      "Fingertips of the D-hand tap the pulse point on the inside of the other wrist, twice.",
    frames: [
      {
        t: 0,
        right: hand("D", at("neutral", -0.06, 0.06), { rotation: 70 }),
        left: hand("FLAT", at("neutral", 0.12, 0.16), { facing: "back", rotation: 84 }),
      },
      {
        t: 0.35,
        right: hand("D", at("neutral", 0.02, 0.13), { rotation: 70 }),
        left: hand("FLAT", at("neutral", 0.12, 0.16), { facing: "back", rotation: 84 }),
      },
      {
        t: 0.7,
        right: hand("D", at("neutral", -0.06, 0.06), { rotation: 70 }),
        left: hand("FLAT", at("neutral", 0.12, 0.16), { facing: "back", rotation: 84 }),
      },
      {
        t: 1,
        right: hand("D", at("neutral", 0.02, 0.13), { rotation: 70 }),
        left: hand("FLAT", at("neutral", 0.12, 0.16), { facing: "back", rotation: 84 }),
      },
    ],
  },
  {
    gloss: "NURSE",
    triggers: ["nurse"],
    duration: 0.9,
    description: "Fingertips of the N-hand tap the pulse point of the other wrist, twice.",
    frames: [
      {
        t: 0,
        right: hand("N", at("neutral", -0.06, 0.06), { rotation: 70 }),
        left: hand("FLAT", at("neutral", 0.12, 0.16), { facing: "back", rotation: 84 }),
      },
      {
        t: 0.35,
        right: hand("N", at("neutral", 0.02, 0.13), { rotation: 70 }),
        left: hand("FLAT", at("neutral", 0.12, 0.16), { facing: "back", rotation: 84 }),
      },
      {
        t: 0.7,
        right: hand("N", at("neutral", -0.06, 0.06), { rotation: 70 }),
        left: hand("FLAT", at("neutral", 0.12, 0.16), { facing: "back", rotation: 84 }),
      },
      {
        t: 1,
        right: hand("N", at("neutral", 0.02, 0.13), { rotation: 70 }),
        left: hand("FLAT", at("neutral", 0.12, 0.16), { facing: "back", rotation: 84 }),
      },
    ],
  },
  {
    gloss: "HOSPITAL",
    triggers: ["hospital", "clinic", "a and e", "emergency room"],
    duration: 1,
    description: "The H-hand draws a cross on the upper arm near the shoulder.",
    frames: [
      { t: 0, right: hand("H", at("shoulderLeft", -0.06, -0.08), { rotation: 62 }), left: null },
      { t: 0.4, right: hand("H", at("shoulderLeft", -0.06, 0.12), { rotation: 62 }), left: null },
      { t: 0.6, right: hand("H", at("shoulderLeft", -0.16, 0.02), { rotation: 62 }), left: null },
      { t: 1, right: hand("H", at("shoulderLeft", 0.06, 0.02), { rotation: 62 }), left: null },
    ],
  },
  {
    gloss: "MEDICINE",
    triggers: ["medicine", "medication", "drug", "tablet", "pill", "prescription"],
    duration: 1,
    description:
      "The bent middle finger touches the flat upturned palm of the other hand and rocks from side to side.",
    frames: [
      {
        t: 0,
        right: hand("MIDDLE", at("neutral", -0.1, 0.06), { rotation: -22 }),
        left: hand("FLAT", at("neutral", 0.06, 0.2), { facing: "back", rotation: 88 }),
      },
      {
        t: 0.33,
        right: hand("MIDDLE", at("neutral", 0.02, 0.06), { rotation: 22 }),
        left: hand("FLAT", at("neutral", 0.06, 0.2), { facing: "back", rotation: 88 }),
      },
      {
        t: 0.66,
        right: hand("MIDDLE", at("neutral", -0.1, 0.06), { rotation: -22 }),
        left: hand("FLAT", at("neutral", 0.06, 0.2), { facing: "back", rotation: 88 }),
      },
      {
        t: 1,
        right: hand("MIDDLE", at("neutral", 0.02, 0.06), { rotation: 22 }),
        left: hand("FLAT", at("neutral", 0.06, 0.2), { facing: "back", rotation: 88 }),
      },
    ],
  },
  {
    gloss: "HEART",
    triggers: ["heart", "cardiac"],
    duration: 0.8,
    description: "The bent middle finger taps the chest over the heart, twice.",
    frames: [
      { t: 0, right: hand("MIDDLE", at("heart", 0, -0.12), { facing: "back" }), left: null },
      { t: 0.3, right: hand("MIDDLE", at("heart"), { facing: "back" }), left: null },
      { t: 0.65, right: hand("MIDDLE", at("heart", 0, -0.12), { facing: "back" }), left: null },
      { t: 1, right: hand("MIDDLE", at("heart"), { facing: "back" }), left: null },
    ],
  },
  {
    gloss: "BREATHE",
    triggers: ["breathe", "breathing", "breath", "inhale", "exhale"],
    duration: 1.3,
    description:
      "Both flat hands rest on the chest and move outward and back in, following the breath.",
    frames: [
      {
        t: 0,
        right: hand("FLAT", at("chest", -0.16, -0.04), { facing: "back" }),
        left: hand("FLAT", at("chest", 0.16, -0.04), { facing: "back" }),
      },
      {
        t: 0.35,
        right: hand("FLAT", at("chest", -0.24, -0.12), { facing: "back", z: 0.6 }),
        left: hand("FLAT", at("chest", 0.24, -0.12), { facing: "back", z: 0.6 }),
        face: face({ mouth: "oo" }),
      },
      {
        t: 0.7,
        right: hand("FLAT", at("chest", -0.16, -0.04), { facing: "back" }),
        left: hand("FLAT", at("chest", 0.16, -0.04), { facing: "back" }),
      },
      {
        t: 1,
        right: hand("FLAT", at("chest", -0.24, -0.12), { facing: "back", z: 0.6 }),
        left: hand("FLAT", at("chest", 0.24, -0.12), { facing: "back", z: 0.6 }),
        face: face({ mouth: "oo" }),
      },
    ],
  },
  {
    gloss: "FEEL",
    triggers: ["feel", "feeling", "felt"],
    duration: 0.85,
    description: "The bent middle finger of the open hand brushes upward on the centre of the chest.",
    frames: [
      { t: 0, right: hand("MIDDLE", at("chest", -0.06, 0.14), { facing: "back" }), left: null },
      { t: 1, right: hand("MIDDLE", at("chest", -0.06, -0.18), { facing: "back" }), left: null },
    ],
  },
  {
    gloss: "TIRED",
    triggers: ["tired", "exhausted", "fatigue", "fatigued", "weary"],
    duration: 1,
    description:
      "Both bent hands, fingertips against the chest below the shoulders, drop and rotate downward.",
    frames: [
      {
        t: 0,
        right: hand("BENT", at("upperChest", -0.2), { facing: "back" }),
        left: hand("BENT", at("upperChest", 0.2), { facing: "back" }),
        face: face({ squint: 0.5, brows: -0.2 }),
      },
      {
        t: 1,
        right: hand("BENT", at("upperChest", -0.18, 0.2), { facing: "back", rotation: -28 }),
        left: hand("BENT", at("upperChest", 0.18, 0.2), { facing: "back", rotation: 28 }),
        face: face({ squint: 0.7, brows: -0.3, headNod: 0.3 }),
      },
    ],
  },
  {
    gloss: "SLEEP",
    triggers: ["sleep", "asleep", "sleeping", "rest"],
    duration: 1,
    description:
      "The open hand draws down in front of the face, closing to a flattened O as the head tilts and the eyes close.",
    frames: [
      { t: 0, right: hand("FIVE", at("forehead", -0.02, 0.1), { facing: "back" }), left: null },
      {
        t: 1,
        right: hand("FLAT_O", at("chin", -0.02, 0.02), { facing: "back" }),
        left: null,
        face: face({ squint: 1, headNod: 0.4, headTurn: 0.2 }),
      },
    ],
  },
  {
    gloss: "EAT",
    triggers: ["eat", "eating", "food", "meal", "ate"],
    duration: 0.85,
    description: "The flattened O hand taps the mouth, twice.",
    frames: [
      { t: 0, right: hand("FLAT_O", at("mouth", -0.02, 0.16), { rotation: -22 }), left: null },
      { t: 0.3, right: hand("FLAT_O", at("mouth", -0.02, 0.02), { rotation: -22 }), left: null, face: face({ mouth: "open" }) },
      { t: 0.65, right: hand("FLAT_O", at("mouth", -0.02, 0.16), { rotation: -22 }), left: null },
      { t: 1, right: hand("FLAT_O", at("mouth", -0.02, 0.02), { rotation: -22 }), left: null, face: face({ mouth: "open" }) },
    ],
  },
  {
    gloss: "DRINK",
    triggers: ["drink", "drinking", "water", "fluid", "hydrate"],
    duration: 0.85,
    description: "The C-hand at the mouth tilts upward, as if raising a glass.",
    frames: [
      { t: 0, right: hand("C", at("mouth", -0.04, 0.12), { rotation: -8 }), left: null },
      { t: 1, right: hand("C", at("mouth", -0.04, 0.04), { rotation: -48 }), left: null, face: face({ mouth: "oo", headNod: -0.2 }) },
    ],
  },
  {
    gloss: "STOP",
    triggers: ["stop", "halt", "cease"],
    duration: 0.7,
    description: "The blade of the flat hand chops down onto the flat upturned palm of the other.",
    frames: [
      {
        t: 0,
        right: hand("FLAT", at("neutral", -0.08, -0.2), { facing: "side" }),
        left: hand("FLAT", at("neutral", 0.04, 0.22), { facing: "back", rotation: 88 }),
      },
      {
        t: 1,
        right: hand("FLAT", at("neutral", -0.02, 0.1), { facing: "side" }),
        left: hand("FLAT", at("neutral", 0.04, 0.22), { facing: "back", rotation: 88 }),
        face: face({ brows: -0.4 }),
      },
    ],
  },
  {
    gloss: "SLOW",
    triggers: ["slow", "slowly", "gently", "gentle"],
    duration: 1.2,
    description: "The flat hand strokes slowly up the back of the other hand.",
    frames: [
      {
        t: 0,
        right: hand("FLAT", at("neutral", -0.02, 0.24), { facing: "back", rotation: -70 }),
        left: hand("FLAT", at("neutral", 0.12, 0.16), { facing: "front", rotation: 74 }),
      },
      {
        t: 1,
        right: hand("FLAT", at("neutral", 0.18, 0.04), { facing: "back", rotation: -70 }),
        left: hand("FLAT", at("neutral", 0.12, 0.16), { facing: "front", rotation: 74 }),
      },
    ],
  },
  {
    gloss: "AGAIN",
    triggers: ["again", "repeat", "once more"],
    duration: 0.8,
    description:
      "The bent hand arcs over and its fingertips land in the flat upturned palm of the other.",
    frames: [
      {
        t: 0,
        right: hand("BENT", at("neutral", -0.3, -0.02), { facing: "side", rotation: -50 }),
        left: hand("FLAT", at("neutral", 0.06, 0.2), { facing: "back", rotation: 88 }),
      },
      {
        t: 0.5,
        right: hand("BENT", at("neutral", -0.14, -0.18), { facing: "side" }),
        left: hand("FLAT", at("neutral", 0.06, 0.2), { facing: "back", rotation: 88 }),
      },
      {
        t: 1,
        right: hand("BENT", at("neutral", 0, 0.12), { facing: "side", rotation: 40 }),
        left: hand("FLAT", at("neutral", 0.06, 0.2), { facing: "back", rotation: 88 }),
      },
    ],
  },
  {
    gloss: "NAME",
    triggers: ["name", "called"],
    duration: 0.8,
    description:
      "Both H-hands; the dominant one taps across the top of the other, twice, forming a cross.",
    frames: [
      {
        t: 0,
        right: hand("H", at("neutral", -0.16, -0.08), { rotation: 26 }),
        left: hand("H", at("neutral", 0.06, 0.06), { rotation: -66 }),
      },
      {
        t: 0.35,
        right: hand("H", at("neutral", -0.02, 0.0), { rotation: 26 }),
        left: hand("H", at("neutral", 0.06, 0.06), { rotation: -66 }),
      },
      {
        t: 0.7,
        right: hand("H", at("neutral", -0.16, -0.08), { rotation: 26 }),
        left: hand("H", at("neutral", 0.06, 0.06), { rotation: -66 }),
      },
      {
        t: 1,
        right: hand("H", at("neutral", -0.02, 0.0), { rotation: 26 }),
        left: hand("H", at("neutral", 0.06, 0.06), { rotation: -66 }),
      },
    ],
  },
  {
    gloss: "MY",
    triggers: ["my", "mine"],
    duration: 0.6,
    description: "The flat hand pats the centre of the chest.",
    frames: [
      { t: 0, right: hand("FLAT", at("chest", -0.08, -0.04), { facing: "back", rotation: 66 }), left: null },
      { t: 1, right: hand("FLAT", at("chest", -0.02, -0.04), { facing: "back", rotation: 78 }), left: null },
    ],
  },
  {
    gloss: "ME",
    triggers: ["i", "me", "myself"],
    duration: 0.6,
    description: "The index finger points at the signer's own chest.",
    frames: [
      { t: 0, right: hand("ONE", at("chest", -0.22, -0.06), { rotation: 62, z: 0.4 }), left: null },
      { t: 1, right: hand("ONE", at("chest", -0.06, -0.04), { rotation: 74 }), left: null },
    ],
  },
  {
    gloss: "YOU",
    triggers: ["you", "your", "yours"],
    duration: 0.6,
    description: "The index finger points forward at the person being addressed.",
    frames: [
      { t: 0, right: hand("ONE", at("neutralHigh", -0.14, 0.06), { rotation: 40 }), left: null },
      { t: 1, right: hand("ONE", at("neutralHigh", -0.08, 0.02), { rotation: 48, z: 1 }), left: null },
    ],
  },
  {
    gloss: "UNDERSTAND",
    triggers: ["understand", "understood", "i see", "makes sense"],
    duration: 0.7,
    description: "Fist at the temple; the index finger flicks up.",
    frames: [
      { t: 0, right: hand("S", at("templeRight", -0.06, 0.02)), left: null },
      { t: 1, right: hand("ONE", at("templeRight", -0.06, -0.02)), left: null, face: face({ brows: 0.5 }) },
    ],
  },
  {
    gloss: "KNOW",
    triggers: ["know", "knew", "aware"],
    duration: 0.7,
    description: "The fingertips of the bent hand tap the forehead.",
    frames: [
      { t: 0, right: hand("BENT", at("forehead", -0.14, 0.16), { facing: "back" }), left: null },
      { t: 1, right: hand("BENT", at("forehead", -0.06, 0.06), { facing: "back" }), left: null },
    ],
  },
  {
    gloss: "THINK",
    triggers: ["think", "thought", "consider", "wondering"],
    duration: 0.9,
    description: "The index finger touches the temple and makes a small circle.",
    frames: [
      { t: 0, right: hand("ONE", at("templeRight", -0.04, 0.02)), left: null, face: face({ brows: -0.3 }) },
      { t: 0.33, right: hand("ONE", at("templeRight", 0.04, 0.06)), left: null },
      { t: 0.66, right: hand("ONE", at("templeRight", -0.02, 0.12)), left: null },
      { t: 1, right: hand("ONE", at("templeRight", -0.04, 0.02)), left: null, face: face({ brows: -0.3 }) },
    ],
  },
  {
    gloss: "CALM",
    triggers: ["calm", "relax", "relaxed", "settle", "steady", "peaceful"],
    duration: 1.1,
    description: "Both flat hands cross in front of the chest and press downward.",
    approximate: true,
    frames: [
      {
        t: 0,
        right: hand("FLAT", at("upperChest", -0.06, -0.08), { facing: "back", rotation: 42 }),
        left: hand("FLAT", at("upperChest", 0.06, -0.08), { facing: "back", rotation: -42 }),
      },
      {
        t: 1,
        right: hand("FLAT", at("neutral", -0.3, 0.16), { facing: "back", rotation: 74 }),
        left: hand("FLAT", at("neutral", 0.3, 0.16), { facing: "back", rotation: -74 }),
        face: face({ squint: 0.3, mouth: "oo" }),
      },
    ],
  },
  {
    gloss: "BETTER",
    triggers: ["better", "improving", "improved", "improvement"],
    duration: 0.9,
    description:
      "The flat hand at the chin sweeps up and to the side, closing into a fist with the thumb up.",
    frames: [
      { t: 0, right: hand("FLAT", at("chin", -0.04), { facing: "back" }), left: null, face: WARM },
      { t: 1, right: hand("A", at("templeRight", -0.16, -0.06)), left: null, face: WARM },
    ],
  },
  {
    gloss: "HOME",
    triggers: ["home", "house"],
    duration: 0.85,
    description: "The flattened O hand touches the cheek, then moves back toward the ear.",
    frames: [
      { t: 0, right: hand("FLAT_O", at("cheekRight", 0.08, 0.04), { rotation: -20 }), left: null },
      { t: 1, right: hand("FLAT_O", at("earRight", -0.02, -0.02), { rotation: -20 }), left: null },
    ],
  },
  {
    gloss: "WAIT",
    triggers: ["wait", "hold on", "one moment", "just a moment"],
    duration: 1,
    description: "Both open hands, palms up, fingers wiggling.",
    frames: [
      {
        t: 0,
        right: hand("FIVE", at("neutral", -0.24, 0.14), { facing: "back", rotation: 52 }),
        left: hand("FIVE", at("neutral", 0.06, 0.2), { facing: "back", rotation: 44 }),
      },
      {
        t: 0.5,
        right: hand("CLAW", at("neutral", -0.24, 0.12), { facing: "back", rotation: 52 }),
        left: hand("CLAW", at("neutral", 0.06, 0.18), { facing: "back", rotation: 44 }),
      },
      {
        t: 1,
        right: hand("FIVE", at("neutral", -0.24, 0.14), { facing: "back", rotation: 52 }),
        left: hand("FIVE", at("neutral", 0.06, 0.2), { facing: "back", rotation: 44 }),
      },
    ],
  },
  {
    gloss: "FINISH",
    triggers: ["finish", "finished", "done", "complete", "over", "end"],
    duration: 0.8,
    description: "Both open hands, palms inward, flip outward and down.",
    frames: [
      {
        t: 0,
        right: hand("FIVE", at("neutral", -0.24, -0.06), { facing: "back" }),
        left: hand("FIVE", at("neutral", 0.24, -0.06), { facing: "back" }),
      },
      {
        t: 1,
        right: hand("FIVE", at("neutral", -0.32, 0.14), { facing: "front", rotation: -34 }),
        left: hand("FIVE", at("neutral", 0.32, 0.14), { facing: "front", rotation: 34 }),
      },
    ],
  },
  {
    gloss: "WHAT",
    triggers: ["what", "which"],
    duration: 0.8,
    description:
      "The index finger of the dominant hand brushes down the open palm of the other. The brows draw together, which is what marks a wh-question.",
    frames: [
      {
        t: 0,
        right: hand("ONE", at("neutral", -0.12, -0.12), { rotation: 34 }),
        left: hand("FLAT", at("neutral", 0.12, 0.08), { facing: "back", rotation: 22 }),
        face: face({ brows: -1 }),
      },
      {
        t: 1,
        right: hand("ONE", at("neutral", 0.02, 0.16), { rotation: 34 }),
        left: hand("FLAT", at("neutral", 0.12, 0.08), { facing: "back", rotation: 22 }),
        face: face({ brows: -1 }),
      },
    ],
  },
  {
    gloss: "HOW",
    triggers: ["how"],
    duration: 0.85,
    description:
      "The backs of both bent hands are together and roll forward and up. Brows drawn together for the wh-question.",
    approximate: true,
    frames: [
      {
        t: 0,
        right: hand("BENT", at("neutral", -0.12, 0.1), { facing: "front", rotation: 150 }),
        left: hand("BENT", at("neutral", 0.12, 0.1), { facing: "front", rotation: -150 }),
        face: face({ brows: -1 }),
      },
      {
        t: 1,
        right: hand("BENT", at("neutral", -0.14, -0.02), { facing: "back", rotation: 20 }),
        left: hand("BENT", at("neutral", 0.14, -0.02), { facing: "back", rotation: -20 }),
        face: face({ brows: -1 }),
      },
    ],
  },
  {
    gloss: "PHONE",
    triggers: ["call", "phone", "ring", "telephone"],
    duration: 0.7,
    description: "The Y-hand is held at the ear, thumb to the ear and little finger to the mouth.",
    frames: [
      { t: 0, right: hand("Y", at("cheekRight", -0.06, 0.1), { rotation: -18 }), left: null },
      { t: 1, right: hand("Y", at("cheekRight", -0.1, 0.02), { rotation: -14 }), left: null },
    ],
  },
  {
    gloss: "EMERGENCY",
    triggers: ["emergency", "urgent", "999", "911", "ambulance"],
    duration: 0.9,
    description: "The E-hand is held up and shaken from side to side.",
    frames: [
      { t: 0, right: hand("E", at("shoulderRight", -0.06, -0.24)), left: null, face: face({ brows: 1, mouth: "tight" }) },
      { t: 0.25, right: hand("E", at("shoulderRight", 0.06, -0.24)), left: null },
      { t: 0.5, right: hand("E", at("shoulderRight", -0.06, -0.24)), left: null },
      { t: 0.75, right: hand("E", at("shoulderRight", 0.06, -0.24)), left: null },
      { t: 1, right: hand("E", at("shoulderRight", -0.06, -0.24)), left: null, face: face({ brows: 1, mouth: "tight" }) },
    ],
  },
  {
    gloss: "LOOK",
    triggers: ["look", "see", "watch", "looking", "seeing"],
    duration: 0.8,
    description: "The V-hand starts below the eyes and moves outward, following the line of sight.",
    frames: [
      { t: 0, right: hand("V", at("eyeRight", 0.04, 0.14), { rotation: 8 }), left: null },
      { t: 1, right: hand("V", at("neutralHigh", -0.16, -0.14), { rotation: 22, z: 0.8 }), left: null },
    ],
  },
  {
    gloss: "STRESS",
    triggers: ["stress", "stressed", "pressure", "tense", "anxious", "anxiety"],
    duration: 0.9,
    description: "The fist presses down on the back of the other hand and drags forward.",
    approximate: true,
    frames: [
      {
        t: 0,
        right: hand("A", at("neutral", -0.06, -0.06), { facing: "back" }),
        left: hand("FLAT", at("neutral", 0.06, 0.14), { facing: "front", rotation: 80 }),
        face: face({ brows: -0.6, mouth: "tight" }),
      },
      {
        t: 1,
        right: hand("A", at("neutral", -0.06, 0.06), { facing: "back", z: 0.5 }),
        left: hand("FLAT", at("neutral", 0.06, 0.14), { facing: "front", rotation: 80 }),
        face: face({ brows: -0.6, mouth: "tight" }),
      },
    ],
  },
  {
    gloss: "NOW",
    triggers: ["now", "today", "currently", "right now"],
    duration: 0.6,
    description: "Both Y-hands, palms up, drop sharply in neutral space.",
    frames: [
      {
        t: 0,
        right: hand("Y", at("neutral", -0.24, -0.1), { facing: "back", rotation: 30 }),
        left: hand("Y", at("neutral", 0.24, -0.1), { facing: "back", rotation: -30 }),
      },
      {
        t: 1,
        right: hand("Y", at("neutral", -0.24, 0.14), { facing: "back", rotation: 30 }),
        left: hand("Y", at("neutral", 0.24, 0.14), { facing: "back", rotation: -30 }),
      },
    ],
  },
];

/** The hands hanging at rest, between signs and before anything starts. */
export const REST_FRAME: SignFrame = {
  t: 0,
  right: hand("REST", at("restRight")),
  left: hand("REST", at("restLeft")),
  face: NEUTRAL_FACE,
};

const BY_TRIGGER = new Map<string, Sign>();
for (const sign of LEXICON) {
  for (const trigger of sign.triggers) {
    // First definition wins, so an earlier, more common sense of a word is
    // not silently replaced by a later entry that happens to share it.
    if (!BY_TRIGGER.has(trigger)) BY_TRIGGER.set(trigger, sign);
  }
}

/** The longest trigger, in words. Multi-word triggers must be matched first. */
export const MAX_TRIGGER_WORDS = Math.max(
  ...LEXICON.flatMap((s) => s.triggers.map((t) => t.split(" ").length)),
);

export function signFor(phrase: string): Sign | undefined {
  return BY_TRIGGER.get(phrase.toLowerCase().trim());
}

export function signByGloss(gloss: string): Sign | undefined {
  return LEXICON.find((s) => s.gloss === gloss);
}

/**
 * Interpolate a sign's keyframes at a moment.
 *
 * Hands that are null in a frame are at rest, and a hand that appears or
 * disappears between frames travels to and from the rest position rather than
 * popping — a hand that blinks out mid-sign reads as a rendering fault.
 */
export function frameOf(sign: Sign, progress: number): ResolvedFrame {
  const t = Math.min(1, Math.max(0, progress));
  const frames = sign.frames;

  let previous = frames[0];
  let next = frames[frames.length - 1];
  for (let i = 0; i < frames.length - 1; i++) {
    if (t >= frames[i].t && t <= frames[i + 1].t) {
      previous = frames[i];
      next = frames[i + 1];
      break;
    }
  }

  const span = next.t - previous.t;
  const local = span <= 0 ? 0 : (t - previous.t) / span;
  // Ease within each segment so movement starts and stops rather than
  // running at constant speed, which is what makes a sign look mechanical.
  const eased = local * local * (3 - 2 * local);

  return {
    right: blendHands(previous.right, next.right, eased, REST_FRAME.right!),
    left: blendHands(previous.left, next.left, eased, REST_FRAME.left!),
    face: blendFace(previous.face ?? NEUTRAL_FACE, next.face ?? NEUTRAL_FACE, eased),
  };
}

export interface ResolvedFrame {
  right: HandFrame;
  left: HandFrame;
  face: FaceState;
}

function blendHands(
  a: HandFrame | null,
  b: HandFrame | null,
  t: number,
  rest: HandFrame,
): HandFrame {
  const from = a ?? rest;
  const to = b ?? rest;
  return {
    shape: blendPoses(from.shape, to.shape, t),
    at: blendPoint(from.at, to.at, t),
    z: (from.z ?? 0) + ((to.z ?? 0) - (from.z ?? 0)) * t,
  };
}

export { moved };
