/**
 * Warping a still photograph by pushing a lattice of points around.
 *
 * The presenter animates a photograph rather than rendering a head, so every
 * movement has to be expressed as "these pixels go over there". The mechanism
 * is the oldest one there is: lay a grid over a patch of the image, move some
 * of the grid points, and redraw each little triangle with the affine
 * transform that takes it from where it was to where it now is. Canvas can
 * only apply an affine transform to a whole image, so the triangle is used as
 * a clip and the whole photograph is drawn through it.
 *
 * Two properties make the result seamless rather than a mess of tears.
 *
 * Edges that are declared fixed never move, so the patch always meets the
 * untouched photograph exactly. Only the seam between the two mouth patches
 * is allowed to move, and it moves because that is the mouth opening.
 *
 * And triangles are drawn very slightly oversized. Canvas antialiases a clip
 * path, so two triangles sharing an edge each cover about half of the
 * boundary pixel and the background shows through as a hairline. Bleeding
 * each one outward by a fraction of a pixel costs nothing and removes the
 * grid of seams that is otherwise visible across the chin.
 *
 * Everything here is in normalised image coordinates — 0 to 1 across the
 * photograph — so a rig computed on a 960 px portrait keeps working when the
 * same portrait is drawn into a 240 px picker tile.
 */

export interface Point {
  x: number;
  y: number;
}

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Which sides of a lattice are pinned to the untouched photograph. */
export interface FixedEdges {
  top?: boolean;
  bottom?: boolean;
  left?: boolean;
  right?: boolean;
}

export type Triangle = readonly [number, number, number];

export interface Lattice {
  cols: number;
  rows: number;
  box: Box;
  /** Row-major, `(cols + 1) * (rows + 1)` of them. */
  vertices: Point[];
  triangles: Triangle[];
  fixed: boolean[];
}

/**
 * Build a lattice over a box.
 *
 * Resolution is a straight trade: every cell is two triangles and every
 * triangle is a clip plus a draw, which is the whole per-frame cost of the
 * presenter. Ten by eight over a mouth is enough that the curve of a lip does
 * not go polygonal, and cheap enough to leave room for two eyes as well.
 */
export function lattice(box: Box, cols: number, rows: number, fixedEdges: FixedEdges = {}): Lattice {
  const vertices: Point[] = [];
  const fixed: boolean[] = [];

  for (let row = 0; row <= rows; row++) {
    for (let col = 0; col <= cols; col++) {
      vertices.push({
        x: box.x + (box.w * col) / cols,
        y: box.y + (box.h * row) / rows,
      });
      fixed.push(
        (row === 0 && !!fixedEdges.top) ||
          (row === rows && !!fixedEdges.bottom) ||
          (col === 0 && !!fixedEdges.left) ||
          (col === cols && !!fixedEdges.right),
      );
    }
  }

  const triangles: Triangle[] = [];
  const at = (col: number, row: number) => row * (cols + 1) + col;
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const a = at(col, row);
      const b = at(col + 1, row);
      const c = at(col, row + 1);
      const d = at(col + 1, row + 1);
      triangles.push([a, b, d], [a, d, c]);
    }
  }

  return { cols, rows, box, vertices, triangles, fixed };
}

/** A displacement to add to a point, in normalised image coordinates. */
export type Field = (point: Point) => Point;

/**
 * Apply a field, leaving pinned vertices where they are.
 *
 * The clamp is belt and braces: every field here already falls to zero at the
 * patch boundary, but a field with an arithmetic slip in it would tear the
 * photograph rather than merely animate it oddly, and that is not a failure
 * worth risking on someone's face.
 */
export function displace(source: Lattice, field: Field): Point[] {
  return source.vertices.map((vertex, index) => {
    if (source.fixed[index]) return { ...vertex };
    const delta = field(vertex);
    return { x: vertex.x + delta.x, y: vertex.y + delta.y };
  });
}

/**
 * The affine transform taking one triangle onto another.
 *
 * Returned in the order `ctx.transform` wants: a, b, c, d, e, f, meaning
 * x' = a·x + c·y + e and y' = b·x + d·y + f. Degenerate source triangles
 * cannot happen in a lattice, but a null return is cheaper than a NaN
 * propagating into the canvas state.
 */
export function affine(
  from: readonly [Point, Point, Point],
  to: readonly [Point, Point, Point],
): [number, number, number, number, number, number] | null {
  const [s0, s1, s2] = from;
  const [d0, d1, d2] = to;

  const x1 = s1.x - s0.x;
  const y1 = s1.y - s0.y;
  const x2 = s2.x - s0.x;
  const y2 = s2.y - s0.y;

  const det = x1 * y2 - x2 * y1;
  if (Math.abs(det) < 1e-12) return null;

  const u1 = d1.x - d0.x;
  const v1 = d1.y - d0.y;
  const u2 = d2.x - d0.x;
  const v2 = d2.y - d0.y;

  const a = (u1 * y2 - u2 * y1) / det;
  const c = (u2 * x1 - u1 * x2) / det;
  const b = (v1 * y2 - v2 * y1) / det;
  const d = (v2 * x1 - v1 * x2) / det;

  return [a, b, c, d, d0.x - a * s0.x - c * s0.y, d0.y - b * s0.x - d * s0.y];
}

/** Push a triangle's corners outward from its centroid, in pixels. */
export function bleed(
  points: readonly [Point, Point, Point],
  amount: number,
): [Point, Point, Point] {
  const cx = (points[0].x + points[1].x + points[2].x) / 3;
  const cy = (points[0].y + points[1].y + points[2].y) / 3;
  return points.map((p) => {
    const dx = p.x - cx;
    const dy = p.y - cy;
    const length = Math.hypot(dx, dy);
    if (length < 1e-9) return { ...p };
    const scale = (length + amount) / length;
    return { x: cx + dx * scale, y: cy + dy * scale };
  }) as [Point, Point, Point];
}

/** Smooth 0-to-1 ramp, flat at both ends. */
export function smoothstep(edge0: number, edge1: number, value: number): number {
  if (edge1 === edge0) return value < edge0 ? 0 : 1;
  const t = Math.min(1, Math.max(0, (value - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

/** A bump: zero at `±width`, one at zero, smooth throughout. */
export function bump(value: number, width: number): number {
  const t = Math.min(1, Math.abs(value) / width);
  return 1 - smoothstep(0, 1, t);
}

/**
 * Draw a warped patch of an image onto a canvas.
 *
 * `frame` is where the whole photograph is being drawn in canvas pixels, so
 * normalised coordinates can be turned into positions on screen. The image is
 * redrawn once per triangle, which sounds extravagant and is in fact how
 * every 2D mesh warp on a canvas works: the draw is clipped, so the cost is
 * proportional to the triangle rather than the photograph.
 */
export function drawWarp(
  ctx: CanvasRenderingContext2D,
  image: CanvasImageSource,
  source: Lattice,
  target: Point[],
  frame: Box,
): number {
  const toCanvas = (p: Point): Point => ({
    x: frame.x + p.x * frame.w,
    y: frame.y + p.y * frame.h,
  });

  let drawn = 0;
  for (const [ia, ib, ic] of source.triangles) {
    const from: [Point, Point, Point] = [
      toCanvas(source.vertices[ia]),
      toCanvas(source.vertices[ib]),
      toCanvas(source.vertices[ic]),
    ];
    const to: [Point, Point, Point] = [
      toCanvas(target[ia]),
      toCanvas(target[ib]),
      toCanvas(target[ic]),
    ];

    const matrix = affine(from, to);
    if (!matrix) continue;

    const clip = bleed(to, 0.6);

    ctx.save();
    ctx.beginPath();
    ctx.moveTo(clip[0].x, clip[0].y);
    ctx.lineTo(clip[1].x, clip[1].y);
    ctx.lineTo(clip[2].x, clip[2].y);
    ctx.closePath();
    ctx.clip();
    ctx.transform(...matrix);
    ctx.drawImage(image, frame.x, frame.y, frame.w, frame.h);
    ctx.restore();
    drawn++;
  }
  return drawn;
}
