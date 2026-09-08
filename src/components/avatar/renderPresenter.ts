/**
 * Drawing the presenter.
 *
 * The order matters more than anything else here, because the illusion is
 * built out of layers rather than out of geometry:
 *
 *   1. the photograph, drawn whole;
 *   2. the inside of the mouth, painted into the gap that is about to open;
 *   3. the face above the lips, warped upward a little;
 *   4. the jaw below the lips, warped downward;
 *   5. the eyes, squashed shut if this is a blink.
 *
 * Steps 3 and 4 paint over almost all of step 2. What survives is exactly the
 * band between the parted lips, which is the only place the inside of a mouth
 * should ever be visible. Painting the dark first and then covering it up is
 * far more robust than trying to compute the aperture and fill only that: the
 * lips themselves define the hole, so the hole can never be the wrong shape.
 */

import {
  blinkField,
  eyeAnchors,
  eyePatches,
  lowerField,
  mouthPatches,
  openAmount,
  upperField,
  type EyeAnchors,
  type Expression,
  type FaceRig,
  type MouthPatches,
} from "@/lib/avatar/faceRig";
import type { HeadPose } from "@/lib/avatar/life";
import { displace, drawWarp, type Box, type Lattice } from "@/lib/avatar/warp";

export interface PresenterScene {
  rig: FaceRig;
  mouth: MouthPatches;
  eyes: Array<{ patch: Lattice; anchors: EyeAnchors }>;
}

/**
 * Build the meshes once per portrait.
 *
 * Rebuilding them every frame would be pure waste: the lattices only depend
 * on where the face is, and the face is a photograph.
 */
export function buildScene(rig: FaceRig): PresenterScene {
  const patches = eyePatches(rig);
  return {
    rig,
    mouth: mouthPatches(rig),
    eyes: eyeAnchors(rig).map((anchors, i) => ({ anchors, patch: patches[i] })),
  };
}

/**
 * Where the photograph goes in the canvas.
 *
 * Cover rather than contain — a letterboxed presenter would look like a
 * mistake — with a little overscan on top so the drift in `headPose` cannot
 * pull an edge of the photograph into view.
 */
export function coverFrame(
  rig: FaceRig,
  width: number,
  height: number,
  overscan = 1.035,
): Box {
  const scale = Math.max(width / rig.width, height / rig.height) * overscan;
  const w = rig.width * scale;
  const h = rig.height * scale;
  return { x: (width - w) / 2, y: (height - h) / 2, w, h };
}

/** Fixed because the inside of a mouth is dark whoever it belongs to. */
const MOUTH_VOID = "#0d0708";
const MOUTH_DARK = "#1b0e10";
const MOUTH_DEEP = "#3a2023";
const TEETH = "#f0e7d8";

export interface DrawStats {
  triangles: number;
  aperture: number;
}

export function drawPresenter(
  ctx: CanvasRenderingContext2D,
  scene: PresenterScene,
  image: CanvasImageSource,
  expression: Expression,
  pose: HeadPose,
  width: number,
  height: number,
): DrawStats {
  const frame = coverFrame(scene.rig, width, height);
  const { anchors } = scene.mouth;

  ctx.clearRect(0, 0, width, height);
  ctx.save();

  // The drift, applied about the middle of the face rather than the middle
  // of the canvas, so a tilt rotates the head and not the room around it.
  const pivotX = frame.x + anchors.centre.x * frame.w;
  const pivotY = frame.y + anchors.centre.y * frame.h * 0.6;
  ctx.translate(pivotX + pose.dx * frame.w, pivotY + pose.dy * frame.h);
  ctx.rotate(pose.tilt);
  ctx.scale(pose.scale, pose.scale);
  ctx.translate(-pivotX, -pivotY);

  ctx.drawImage(image, frame.x, frame.y, frame.w, frame.h);

  const aperture = openAmount(anchors, expression);
  if (aperture > 1e-4) {
    drawMouthInterior(ctx, scene.mouth, expression, aperture, frame);
  }

  let triangles = 0;
  triangles += drawWarp(
    ctx,
    image,
    scene.mouth.upper,
    displace(scene.mouth.upper, upperField(scene.mouth, expression)),
    frame,
  );
  triangles += drawWarp(
    ctx,
    image,
    scene.mouth.lower,
    displace(scene.mouth.lower, lowerField(scene.mouth, expression)),
    frame,
  );

  // Eyes are only redrawn while a blink is actually in progress, which is a
  // few frames every few seconds. The rest of the time they cost nothing.
  if (expression.blink > 0.01) {
    for (const eye of scene.eyes) {
      triangles += drawWarp(
        ctx,
        image,
        eye.patch,
        displace(eye.patch, blinkField(eye.anchors, eye.patch, expression.blink)),
        frame,
      );
    }
  }

  ctx.restore();
  return { triangles, aperture };
}

/**
 * The inside of the mouth.
 *
 * An ellipse a little narrower than the lips and a little shallower than the
 * gap, so that however the warp lands, the dark stays behind the lips instead
 * of appearing as a smudge on the chin. The teeth are a band across the top
 * of it, fading in as the mouth opens: without them a wide open mouth reads
 * as a hole rather than as speech, and with them at full strength on a small
 * opening the face looks like it is grimacing.
 */
function drawMouthInterior(
  ctx: CanvasRenderingContext2D,
  mouth: MouthPatches,
  expression: Expression,
  aperture: number,
  frame: Box,
) {
  const { anchors } = mouth;

  // The lips part asymmetrically — the jaw does most of it — so the middle of
  // the hole sits below where the lips met.
  const centreY = anchors.lipLine + aperture * 0.28;
  // Narrows as it opens, and narrows further for a rounded vowel. Without
  // this the dark reaches the corners of the mouth, where the lips have
  // barely parted, and shows as a line running out of either side.
  const width = 0.9 - expression.jaw * 0.3 - Math.max(0, -expression.spread) * 0.16;
  const rx = anchors.halfWidth * width * frame.w;
  const ry = aperture * 0.46 * frame.h;

  const cx = frame.x + anchors.centre.x * frame.w;
  const cy = frame.y + centreY * frame.h;

  ctx.save();
  // Work in a space where the aperture is the unit circle, so a radial
  // gradient comes out elliptical and the teeth can be positioned as
  // fractions of the opening rather than in pixels.
  ctx.translate(cx, cy);
  ctx.scale(rx, ry);

  ctx.beginPath();
  ctx.arc(0, 0, 1, 0, Math.PI * 2);
  ctx.clip();

  /**
   * Feathered rather than a hard-edged fill.
   *
   * The lips are what should define the edge of the hole, and they very
   * nearly do — but the warp and the ellipse are two different approximations
   * of the same opening and they do not agree to the pixel. A hard edge makes
   * every pixel of disagreement visible as a dark rim on the lip. Fading the
   * last fifth of the radius hides it completely.
   */
  const fill = ctx.createRadialGradient(0, 0.15, 0, 0, 0, 1);
  fill.addColorStop(0, MOUTH_VOID);
  fill.addColorStop(0.6, MOUTH_DARK);
  fill.addColorStop(0.86, MOUTH_DEEP);
  fill.addColorStop(1, `${MOUTH_DEEP}00`);
  ctx.fillStyle = fill;
  ctx.fillRect(-1, -1, 2, 2);

  /**
   * A suggestion of upper teeth.
   *
   * They fade in as the mouth opens and fade back out for a rounded vowel,
   * where the lips would cover them. Drawn as a soft band across the top of
   * the opening rather than as teeth: at the size a face is actually shown,
   * anything more detailed reads as a grimace.
   */
  const teeth = Math.max(0, Math.min(1, expression.jaw * 1.8 - 0.25)) * roundedFade(expression);
  if (teeth > 0.01) {
    const band = ctx.createLinearGradient(0, -1, 0, -0.42);
    band.addColorStop(0, `${TEETH}00`);
    band.addColorStop(0.22, TEETH);
    band.addColorStop(1, `${TEETH}00`);
    ctx.globalAlpha = teeth * 0.5;
    ctx.fillStyle = band;
    ctx.fillRect(-1, -1, 2, 0.58);
    ctx.globalAlpha = 1;
  }

  ctx.restore();
}

/** Rounded lips hide the teeth; wide ones show them. */
function roundedFade(expression: Expression): number {
  return Math.max(0, Math.min(1, 1 + expression.spread * 0.9));
}
