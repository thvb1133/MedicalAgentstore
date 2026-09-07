/**
 * Drawing the hand.
 *
 * Split out from the animated component so the same code produces the moving
 * avatar and the static alphabet chart. If they diverged, the chart would be
 * teaching one shape and the avatar showing another, which is worse than
 * having no chart.
 */

import type { HandGeometry, Joint } from "@/lib/sign/hand";

export interface SkinTone {
  base: string;
  shade: string;
  /** Outline colour. Without it the digits dissolve into the palm. */
  line: string;
}

/**
 * Four tones, offered because a hand is a picture of a person's hand and
 * defaulting everybody to one shade is a choice, not a neutral position.
 */
export const SKIN_TONES: Array<{ id: string; label: string; tone: SkinTone }> = [
  { id: "light", label: "Light", tone: { base: "#f4d3b8", shade: "#dcae8e", line: "#a9754f" } },
  { id: "medium", label: "Medium", tone: { base: "#e3ac7c", shade: "#c2865a", line: "#8c5730" } },
  { id: "tan", label: "Tan", tone: { base: "#c68b5d", shade: "#a06a42", line: "#6d4326" } },
  { id: "deep", label: "Deep", tone: { base: "#8f5e3e", shade: "#6f452b", line: "#472a19" } },
];

export const DEFAULT_TONE = SKIN_TONES[1].tone;

/**
 * One phalanx, as a filled and outlined capsule.
 *
 * The outline is what makes the difference between a legible handshape and a
 * mitten. Six letters are the same fist distinguished only by the thumb, and
 * without a line around it the thumb is the same colour as the palm it lies
 * against and simply vanishes.
 */
function drawCapsule(
  ctx: CanvasRenderingContext2D,
  a: Joint,
  b: Joint,
  width: number,
  fill: string,
  line: string,
  lineWidth: number,
) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const length = Math.hypot(dx, dy);
  if (length < 0.0001) return;
  ctx.save();
  ctx.translate(a.x, a.y);
  ctx.rotate(Math.atan2(dy, dx));
  ctx.beginPath();
  // Extend back past the joint so consecutive segments overlap and the seam
  // between them does not show as a gap in the outline.
  ctx.roundRect(-width * 0.35, -width / 2, length + width * 0.35, width, width / 2);
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.lineWidth = lineWidth;
  ctx.strokeStyle = line;
  ctx.stroke();
  ctx.restore();
}

export function drawHand(
  ctx: CanvasRenderingContext2D,
  geometry: HandGeometry,
  scale: number,
  origin: Joint,
  accent: string,
  tone: SkinTone = DEFAULT_TONE,
) {
  // Showing the back of the hand mirrors the drawing, which is what actually
  // happens when a signer turns their wrist over.
  const mirrored = geometry.facing === "back";
  const anchor = {
    x: origin.x + geometry.anchorOffset.x * scale,
    y: origin.y + geometry.anchorOffset.y * scale,
  };
  const place = (p: Joint): Joint => {
    const x = anchor.x + (mirrored ? -p.x : p.x) * scale;
    return { x, y: anchor.y + p.y * scale };
  };

  ctx.save();
  ctx.lineJoin = "round";
  const lineWidth = Math.max(1, scale * 0.016);

  // Anything behind the palm goes down first, dimmed. It is the only depth
  // cue a flat model has, and without it a thumb tucked inside a fist appears
  // to float in front of the fingers.
  for (const digit of geometry.digits) {
    if (!digit.behind) continue;
    for (let i = 0; i < digit.joints.length - 1; i++) {
      drawCapsule(
        ctx,
        place(digit.joints[i]),
        place(digit.joints[i + 1]),
        digit.widths[i] * scale,
        tone.shade,
        tone.line,
        lineWidth,
      );
    }
  }

  // A forearm stub, so the hand is attached to something.
  const wrist = place(geometry.wrist);
  ctx.beginPath();
  ctx.roundRect(
    wrist.x - 0.185 * scale,
    wrist.y - 0.04 * scale,
    0.37 * scale,
    0.46 * scale,
    0.1 * scale,
  );
  ctx.fillStyle = tone.shade;
  ctx.fill();
  ctx.lineWidth = lineWidth;
  ctx.strokeStyle = tone.line;
  ctx.stroke();

  ctx.beginPath();
  const palm = geometry.palm.map(place);
  ctx.moveTo(palm[0].x, palm[0].y);
  for (let i = 1; i < palm.length; i++) {
    const previous = palm[i - 1];
    const point = palm[i];
    ctx.quadraticCurveTo(
      previous.x,
      previous.y,
      (previous.x + point.x) / 2,
      (previous.y + point.y) / 2,
    );
    ctx.lineTo(point.x, point.y);
  }
  ctx.closePath();
  const gradient = ctx.createLinearGradient(wrist.x, wrist.y, wrist.x, wrist.y - 0.75 * scale);
  gradient.addColorStop(0, tone.shade);
  gradient.addColorStop(1, tone.base);
  ctx.fillStyle = gradient;
  ctx.fill();
  ctx.lineWidth = lineWidth;
  ctx.strokeStyle = tone.line;
  ctx.stroke();

  for (const digit of geometry.digits) {
    if (digit.behind) continue;
    for (let i = 0; i < digit.joints.length - 1; i++) {
      drawCapsule(
        ctx,
        place(digit.joints[i]),
        place(digit.joints[i + 1]),
        digit.widths[i] * scale,
        tone.base,
        tone.line,
        lineWidth,
      );
    }

    // A nail on the fingertip. Small, but it is what tells the reader which
    // way round a finger is when it is pointing at them.
    const tip = place(digit.joints[digit.joints.length - 1]);
    const previous = place(digit.joints[digit.joints.length - 2]);
    const angle = Math.atan2(tip.y - previous.y, tip.x - previous.x);
    ctx.save();
    ctx.translate(tip.x, tip.y);
    ctx.rotate(angle);
    ctx.beginPath();
    ctx.ellipse(-0.022 * scale, 0, 0.034 * scale, 0.027 * scale, 0, 0, Math.PI * 2);
    ctx.fillStyle = accent;
    ctx.globalAlpha = 0.3;
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.restore();
  }

  ctx.restore();
}
