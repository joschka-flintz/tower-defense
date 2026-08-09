export interface Vec2 {
  x: number;
  y: number;
}

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export function dist(ax: number, ay: number, bx: number, by: number): number {
  return Math.hypot(bx - ax, by - ay);
}

export function dist2(ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax;
  const dy = by - ay;
  return dx * dx + dy * dy;
}

export function clamp(v: number, min: number, max: number): number {
  return v < min ? min : v > max ? max : v;
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** Shortest distance from point p to the line segment a-b. */
export function distToSegment(
  px: number,
  py: number,
  ax: number,
  ay: number,
  bx: number,
  by: number,
): number {
  const dx = bx - ax;
  const dy = by - ay;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return dist(px, py, ax, ay);
  const t = clamp(((px - ax) * dx + (py - ay) * dy) / lenSq, 0, 1);
  return dist(px, py, ax + t * dx, ay + t * dy);
}

/** Shortest distance from point p to a rectangle (0 if inside). */
export function distToRect(px: number, py: number, r: Rect): number {
  const dx = Math.max(r.x - px, 0, px - (r.x + r.w));
  const dy = Math.max(r.y - py, 0, py - (r.y + r.h));
  return Math.hypot(dx, dy);
}

/** A quarter turn, i.e. straight up on screen. */
export const TAU_QUARTER = Math.PI / 2;

/** Signed shortest rotation from angle `a` to angle `b`, in (-PI, PI]. */
export function angleDiff(a: number, b: number): number {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}

/**
 * Rotate `from` toward `to` by at most `maxStep` radians, taking the shorter way
 * around. Used to make turrets swivel instead of snapping.
 */
export function turnToward(from: number, to: number, maxStep: number): number {
  const diff = angleDiff(from, to);
  if (Math.abs(diff) <= maxStep) return to;
  return from + Math.sign(diff) * maxStep;
}
