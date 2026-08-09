import { distToSegment, type Vec2 } from '../core/vec';

export interface PathPoint {
  x: number;
  y: number;
  /** Facing direction in radians, along the current segment. */
  angle: number;
}

/**
 * The route creeps walk, stored as a polyline.
 *
 * Creeps only track how far they have travelled (a single number); their world
 * position is derived from it. That keeps them exactly on the road forever and
 * makes "which creep is furthest ahead?" a simple number comparison.
 */
export class Path {
  readonly points: Vec2[];
  /** cumulative[i] = distance from the start to points[i]. */
  private readonly cumulative: number[];
  private readonly angles: number[];
  readonly length: number;

  constructor(points: Vec2[]) {
    if (points.length < 2) throw new Error('A path needs at least two points');
    this.points = points;
    this.cumulative = [0];
    this.angles = [];

    let total = 0;
    for (let i = 0; i < points.length - 1; i++) {
      const a = points[i];
      const b = points[i + 1];
      total += Math.hypot(b.x - a.x, b.y - a.y);
      this.cumulative.push(total);
      this.angles.push(Math.atan2(b.y - a.y, b.x - a.x));
    }
    this.length = total;
  }

  /** World position and facing at `d` units from the start. */
  positionAt(d: number): PathPoint {
    if (d <= 0) {
      // Extrapolate backwards along the first segment rather than clamping,
      // so the rear ranks of a formation queue up off the map and march in
      // instead of all piling onto the start point.
      const p = this.points[0];
      const a = this.angles[0];
      return { x: p.x + Math.cos(a) * d, y: p.y + Math.sin(a) * d, angle: a };
    }
    if (d >= this.length) {
      const p = this.points[this.points.length - 1];
      return { x: p.x, y: p.y, angle: this.angles[this.angles.length - 1] };
    }

    let seg = 0;
    while (seg < this.angles.length - 1 && this.cumulative[seg + 1] < d) seg++;

    const a = this.points[seg];
    const b = this.points[seg + 1];
    const segLength = this.cumulative[seg + 1] - this.cumulative[seg];
    const t = segLength === 0 ? 0 : (d - this.cumulative[seg]) / segLength;

    return {
      x: a.x + (b.x - a.x) * t,
      y: a.y + (b.y - a.y) * t,
      angle: this.angles[seg],
    };
  }

  /**
   * How far along the route the closest point to (x, y) lies. Used to work out
   * where on the road a structure has been dropped.
   */
  nearestDistance(x: number, y: number): number {
    let best = Infinity;
    let at = 0;

    for (let i = 0; i < this.points.length - 1; i++) {
      const a = this.points[i];
      const b = this.points[i + 1];
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const lenSq = dx * dx + dy * dy;
      const t = lenSq === 0 ? 0 : Math.max(0, Math.min(1, ((x - a.x) * dx + (y - a.y) * dy) / lenSq));
      const px = a.x + t * dx;
      const py = a.y + t * dy;
      const d = Math.hypot(x - px, y - py);
      if (d < best) {
        best = d;
        at = this.cumulative[i] + t * Math.hypot(dx, dy);
      }
    }
    return at;
  }

  /**
   * The corner points from `d` units in to the end, with the first one
   * interpolated so the result starts exactly at that spot. Used to splice a
   * side trail onto the tail of the main road at the point it joins.
   */
  pointsFrom(d: number): Vec2[] {
    if (d <= 0) return [...this.points];
    if (d >= this.length) return [this.points[this.points.length - 1]];

    let seg = 0;
    while (seg < this.angles.length - 1 && this.cumulative[seg + 1] < d) seg++;

    const p = this.positionAt(d);
    return [{ x: p.x, y: p.y }, ...this.points.slice(seg + 1)];
  }

  /** Shortest distance from a world point to the centre line of the route. */
  distanceToPoint(x: number, y: number): number {
    let best = Infinity;
    for (let i = 0; i < this.points.length - 1; i++) {
      const a = this.points[i];
      const b = this.points[i + 1];
      const d = distToSegment(x, y, a.x, a.y, b.x, b.y);
      if (d < best) best = d;
    }
    return best;
  }
}
