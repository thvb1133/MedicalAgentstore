/**
 * Drawing the signer.
 *
 * A deliberately simple figure: a head, a torso, two arms and two hands. It is
 * not trying to look like a person, and that is the right call for two
 * reasons. A stylised figure sidesteps the uncanny valley, which is
 * unpleasant on a health tool. And an unmistakably drawn figure cannot be
 * confused with footage of a real interpreter, which matters when the thing
 * it produces is not fluent ASL.
 *
 * What the figure does need to be is *legible*: high contrast between hands
 * and torso, so a hand in front of the chest reads as a hand rather than
 * merging into the body. That drives most of the choices here.
 */

import {
  HAND_SCALE,
  HEAD_CENTER,
  HEAD_RADIUS,
  SHOULDER_LEFT,
  SHOULDER_RIGHT,
  solveArm,
  type FaceState,
  type Point,
} from "@/lib/sign/body";
import { buildHand } from "@/lib/sign/hand";
import type { ResolvedFrame } from "@/lib/sign/lexicon";
import { drawHand, type SkinTone } from "./render";

export interface BodyTheme {
  tone: SkinTone;
  /** Torso and sleeves. Sits behind the hands, so it must contrast with them. */
  garment: string;
  /** The sleeves, kept distinct from the torso so arms stay visible over it. */
  sleeve: string;
  garmentShade: string;
  accent: string;
  ink: string;
}

export function bodyTheme(tone: SkinTone, accent: string, dark: boolean): BodyTheme {
  return {
    tone,
    // A cool garment behind warm hands. The contrast is what keeps a hand
    // signing over the chest from disappearing into the chest.
    garment: dark ? "#25405c" : "#3f6d99",
    sleeve: dark ? "#33587c" : "#5487b6",
    garmentShade: dark ? "#16263a" : "#2a4d70",
    accent,
    ink: dark ? "#0b1119" : "#16202c",
  };
}

interface Projector {
  (p: Point): Point;
}

/**
 * Depth, faked by size.
 *
 * A hand held out toward the viewer is nearer and therefore larger. Without
 * some cue, every sign whose movement is straight forward — THANK-YOU, YOU,
 * FINE — is a hand that simply stops moving.
 */
function depthScale(z: number): number {
  return 1 + Math.min(1, Math.max(0, z)) * 0.28;
}

/**
 * The small movements a person makes while not doing anything.
 *
 * A signer between signs is not a statue: they breathe, they shift, they
 * blink. Held perfectly still the figure stops reading as a person and starts
 * reading as a frozen render, which is also the failure mode that makes
 * people ask whether the page has crashed.
 */
export interface Idle {
  /** Seconds since the avatar mounted. */
  time: number;
}

export function idleSway(time: number): number {
  // Two periods that do not divide into each other, so the motion never
  // settles into an obvious loop. Amplitude is a few pixels at typical sizes:
  // enough that the figure is visibly alive, small enough that it never
  // competes with the signing for attention.
  return Math.sin(time * 0.9) * 0.017 + Math.sin(time * 0.37) * 0.009;
}

/**
 * 0 open, 1 shut. A blink every few seconds.
 *
 * A real blink is around a tenth of a second, which at this scale is over
 * before anyone registers it. Drawn slightly longer than life so it actually
 * does the job of making the figure look awake.
 */
export function idleBlink(time: number): number {
  const period = 4.3;
  const shut = 0.22;
  const phase = time % period;
  if (phase > shut) return 0;
  return Math.sin((phase / shut) * Math.PI);
}

export function drawSigner(
  ctx: CanvasRenderingContext2D,
  frame: ResolvedFrame,
  width: number,
  height: number,
  theme: BodyTheme,
  idle: Idle = { time: 0 },
) {
  // Fit the body box into the canvas with a margin, so a hand raised to the
  // forehead stays inside the frame.
  const unit = Math.min(width / 2.5, height / 2.9);
  const breath = idleSway(idle.time);
  const project: Projector = (p) => ({
    x: width / 2 + p.x * unit,
    y: height * 0.56 + (p.y + breath) * unit,
  });

  ctx.save();
  ctx.lineJoin = "round";
  ctx.lineCap = "round";

  drawTorso(ctx, project, unit, theme);

  const rightWrist = project(frame.right.at);
  const leftWrist = project(frame.left.at);

  // Arms behind the hands, so a wrist is covered by its own hand rather than
  // the sleeve ending in mid-air next to it.
  drawArm(ctx, project(SHOULDER_RIGHT), rightWrist, "right", project, unit, theme);
  drawArm(ctx, project(SHOULDER_LEFT), leftWrist, "left", project, unit, theme);

  drawHead(ctx, project, unit, frame.face, theme, idleBlink(idle.time));

  // The non-dominant hand first: when the two overlap, the dominant hand is
  // almost always the one in front.
  //
  // A shadow under each, because a hand signing over the chest is skin on
  // skin and the outline alone is not enough separation to read it quickly.
  ctx.save();
  ctx.shadowColor = "rgba(0,0,0,0.45)";
  ctx.shadowBlur = unit * 0.09;
  ctx.shadowOffsetY = unit * 0.03;
  drawSigningHand(ctx, frame, "left", leftWrist, unit, theme);
  drawSigningHand(ctx, frame, "right", rightWrist, unit, theme);
  ctx.restore();

  ctx.restore();
}

function drawSigningHand(
  ctx: CanvasRenderingContext2D,
  frame: ResolvedFrame,
  side: "left" | "right",
  wrist: Point,
  unit: number,
  theme: BodyTheme,
) {
  const handFrame = side === "right" ? frame.right : frame.left;
  const geometry = buildHand(handFrame.shape);
  const scale = unit * HAND_SCALE * depthScale(handFrame.z ?? 0);
  drawHand(ctx, geometry, scale, wrist, theme.accent, theme.tone, side === "left");
}

function drawTorso(
  ctx: CanvasRenderingContext2D,
  project: Projector,
  unit: number,
  theme: BodyTheme,
) {
  const neck = project({ x: 0, y: -0.62 });
  ctx.beginPath();
  ctx.roundRect(neck.x - 0.13 * unit, neck.y - 0.1 * unit, 0.26 * unit, 0.3 * unit, 0.08 * unit);
  ctx.fillStyle = theme.tone.shade;
  ctx.fill();

  const left = project({ x: -0.5, y: 1.1 });
  const right = project({ x: 0.5, y: 1.1 });
  const shoulderL = project({ x: -0.52, y: -0.48 });
  const shoulderR = project({ x: 0.52, y: -0.48 });

  ctx.beginPath();
  ctx.moveTo(shoulderL.x, shoulderL.y);
  ctx.quadraticCurveTo(project({ x: 0, y: -0.66 }).x, project({ x: 0, y: -0.6 }).y, shoulderR.x, shoulderR.y);
  ctx.lineTo(right.x, right.y);
  ctx.lineTo(left.x, left.y);
  ctx.closePath();
  ctx.fillStyle = theme.garment;
  ctx.fill();

  // A collar, purely so the neck reads as a neck rather than a gap.
  ctx.beginPath();
  ctx.moveTo(project({ x: -0.17, y: -0.5 }).x, project({ x: 0, y: -0.5 }).y);
  ctx.lineTo(project({ x: 0, y: -0.3 }).x, project({ x: 0, y: -0.3 }).y);
  ctx.lineTo(project({ x: 0.17, y: -0.5 }).x, project({ x: 0, y: -0.5 }).y);
  ctx.strokeStyle = theme.garmentShade;
  ctx.lineWidth = unit * 0.035;
  ctx.stroke();
}

function drawArm(
  ctx: CanvasRenderingContext2D,
  shoulder: Point,
  wrist: Point,
  side: "right" | "left",
  project: Projector,
  unit: number,
  theme: BodyTheme,
) {
  // Solve in body units, where the bone lengths are defined, then project.
  const toUnits = (p: Point): Point => ({
    x: (p.x - project({ x: 0, y: 0 }).x) / unit,
    y: (p.y - project({ x: 0, y: 0 }).y) / unit,
  });
  const arm = solveArm(
    side === "right" ? SHOULDER_RIGHT : SHOULDER_LEFT,
    toUnits(wrist),
    side,
  );

  const elbow = project(arm.elbow);
  const shoulderPoint = project(arm.shoulder);

  const sleeve = unit * 0.132;
  const forearm = unit * 0.1;

  // Forearm first, in skin: a short sleeve, so the forearm and the hand read
  // as one limb rather than two objects that happen to touch.
  ctx.beginPath();
  ctx.moveTo(elbow.x, elbow.y);
  ctx.lineTo(wrist.x, wrist.y);
  ctx.strokeStyle = theme.tone.base;
  ctx.lineWidth = forearm;
  ctx.stroke();
  ctx.strokeStyle = theme.tone.line;
  ctx.lineWidth = Math.max(1, unit * 0.01);
  ctx.stroke();

  // Upper arm over it, so the sleeve covers the elbow join.
  //
  // In a shade of its own rather than the torso's. Drawn in the same colour,
  // a sleeve lying across the chest disappears into it, and the forearm below
  // is left looking like a bar floating in front of the body with nothing
  // holding it up.
  ctx.beginPath();
  ctx.moveTo(shoulderPoint.x, shoulderPoint.y);
  ctx.lineTo(elbow.x, elbow.y);
  ctx.strokeStyle = theme.sleeve;
  ctx.lineWidth = sleeve;
  ctx.stroke();
  ctx.strokeStyle = theme.garmentShade;
  ctx.lineWidth = Math.max(1, unit * 0.012);
  ctx.stroke();

  // Caps at the shoulder and the elbow. Without them the joints are two
  // rectangles meeting at an angle, and the corner shows.
  ctx.fillStyle = theme.sleeve;
  for (const [point, radius] of [
    [shoulderPoint, sleeve * 0.62],
    [elbow, sleeve * 0.5],
  ] as const) {
    ctx.beginPath();
    ctx.arc(point.x, point.y, radius, 0, Math.PI * 2);
    ctx.fill();
  }
}

/**
 * The face.
 *
 * Not cosmetic. Raised brows mark a yes/no question in ASL, drawn-together
 * brows mark a wh-question, and a head shake negates the clause it runs
 * across. A blank face does not produce neutral sentences, it produces
 * sentences with the grammar removed — so the small set of markers the
 * lexicon uses are drawn even though the figure is otherwise minimal.
 */
function drawHead(
  ctx: CanvasRenderingContext2D,
  project: Projector,
  unit: number,
  face: FaceState,
  theme: BodyTheme,
  blink: number,
) {
  const center = project({
    x: HEAD_CENTER.x + face.headTurn * 0.06,
    y: HEAD_CENTER.y + face.headNod * 0.04,
  });
  const r = HEAD_RADIUS * unit;

  ctx.save();
  ctx.translate(center.x, center.y);
  ctx.rotate(face.headTurn * 0.12);

  ctx.beginPath();
  ctx.ellipse(0, 0, r * 0.92, r, 0, 0, Math.PI * 2);
  ctx.fillStyle = theme.tone.base;
  ctx.fill();
  ctx.strokeStyle = theme.tone.line;
  ctx.lineWidth = Math.max(1, unit * 0.014);
  ctx.stroke();

  // Hair, as a simple cap.
  //
  // The hairline has to clear the brows at their highest. Drawn lower, a
  // raised brow lands on the hair — dark on dark — and the single most
  // important non-manual marker in the language becomes invisible while
  // still technically being rendered.
  ctx.beginPath();
  ctx.ellipse(0, -r * 0.46, r * 0.94, r * 0.5, 0, Math.PI, Math.PI * 2);
  ctx.fillStyle = theme.ink;
  ctx.fill();

  const eyeY = r * 0.1;
  const eyeX = r * 0.36;
  // The head turn shifts the features, which is what sells a shake at this
  // level of detail far better than rotating the whole ellipse.
  const shift = face.headTurn * r * 0.16;

  // A blink closes the eyes on top of whatever the sign already asked for,
  // so it cannot re-open eyes a sign deliberately shut.
  const openness = 1 - Math.min(1, Math.max(0, Math.max(face.squint, blink)));
  ctx.fillStyle = theme.ink;
  for (const sign of [-1, 1]) {
    ctx.beginPath();
    if (openness < 0.15) {
      // Closed: a line rather than a dot, which is what a shut eye looks like.
      ctx.roundRect(sign * eyeX + shift - r * 0.13, eyeY - r * 0.02, r * 0.26, r * 0.045, r * 0.02);
    } else {
      ctx.ellipse(sign * eyeX + shift, eyeY, r * 0.1, r * 0.13 * openness, 0, 0, Math.PI * 2);
    }
    ctx.fill();
  }

  /*
   * Brows.
   *
   * Height carries raised versus neutral; the inner-end tilt carries the
   * drawn-together shape of a wh-question. Both directions are grammar in
   * ASL rather than mood, so they have to be legible at this size.
   *
   * Raising travels further than furrowing, because a brow has room to go up
   * toward the hairline and very little room to go down before it sits on
   * the eye.
   */
  const browLift = face.brows > 0 ? -face.brows * r * 0.17 : -face.brows * r * 0.07;
  const browTilt = face.brows < 0 ? -face.brows * r * 0.13 : 0;
  ctx.strokeStyle = theme.ink;
  ctx.lineWidth = r * 0.085;
  for (const sign of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(sign * (eyeX + r * 0.2) + shift, eyeY - r * 0.26 + browLift);
    ctx.lineTo(sign * (eyeX - r * 0.14) + shift, eyeY - r * 0.3 + browLift + browTilt);
    ctx.stroke();
  }

  drawMouth(ctx, shift, r, face, theme);

  ctx.restore();
}

function drawMouth(
  ctx: CanvasRenderingContext2D,
  shift: number,
  r: number,
  face: FaceState,
  theme: BodyTheme,
) {
  const y = r * 0.46;
  ctx.strokeStyle = theme.ink;
  ctx.fillStyle = theme.ink;
  ctx.lineWidth = r * 0.06;

  switch (face.mouth) {
    case "open":
      ctx.beginPath();
      ctx.ellipse(shift, y, r * 0.15, r * 0.13, 0, 0, Math.PI * 2);
      ctx.fill();
      break;
    case "oo":
      ctx.beginPath();
      ctx.ellipse(shift, y, r * 0.09, r * 0.12, 0, 0, Math.PI * 2);
      ctx.fill();
      break;
    case "smile":
      ctx.beginPath();
      ctx.arc(shift, y - r * 0.1, r * 0.22, 0.25 * Math.PI, 0.75 * Math.PI);
      ctx.stroke();
      break;
    case "frown":
      ctx.beginPath();
      ctx.arc(shift, y + r * 0.16, r * 0.22, 1.25 * Math.PI, 1.75 * Math.PI);
      ctx.stroke();
      break;
    case "tight":
      ctx.beginPath();
      ctx.moveTo(shift - r * 0.17, y);
      ctx.lineTo(shift + r * 0.17, y);
      ctx.stroke();
      break;
    default:
      ctx.beginPath();
      ctx.moveTo(shift - r * 0.13, y);
      ctx.lineTo(shift + r * 0.13, y);
      ctx.stroke();
  }
}
