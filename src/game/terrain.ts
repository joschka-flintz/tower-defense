import type { Vec2 } from '../core/vec';
import type { MapDef } from '../data/maps';

/**
 * The ground as the enemy sees it: which squares can be walked on, how much
 * room there is at each of them, and how to get from one place to another
 * without leaving the sand.
 *
 * This exists for maps with **hills**. On those the hills are not decoration
 * and not merely where you may build — they are solid ground the enemy walks
 * *around*, so a route cannot be a line drawn by hand between two points and
 * hoped for. It is found here, through the gaps, and it is found again
 * whenever the hills change. Redraw a patch and the fronts move to suit; there
 * is no second copy of the map's shape to keep in step with the first.
 *
 * Everything is measured in world units. The grid is an implementation detail
 * and nothing outside this file sees a cell.
 */

/** Grid resolution. Fine enough for a 30-unit gap to exist, coarse enough to be instant. */
const CELL = 8;

/**
 * The room a front would like on either side of it. Below this the router
 * starts paying to squeeze through, so it prefers the middle of a corridor and
 * takes a narrow gap only when the detour costs more than the squeeze.
 */
const PREFERRED_CLEARANCE = 70;

/** How much dearer the tightest possible squeeze is than open sand. */
const SQUEEZE_PENALTY = 5;

/**
 * Gaps a route will consider threading, widest requirement first.
 *
 * A front tries to keep enough room to be a front. Failing that it will take
 * something tighter, and the last rung accepts any gap at all rather than
 * report no way through — a map whose hills have been redrawn into a near-solid
 * wall should still be playable, even if the enemy has to come at you in single
 * file.
 *
 * Both ends of the ladder earn their place. Without the wide rungs a single
 * narrow slot becomes the way in for the whole army, because the router has no
 * reason to prefer the open ground beside it. Without the zero rung a map with
 * no comfortable way through gives up and falls back to the straight line the
 * map declares — which walks the enemy over the hills, the exact thing this is
 * here to prevent, and silently.
 */
const CLEARANCE_LADDER = [30, 20, 13, 0];

/**
 * How much of the run-in at each end of a route is excused the minimum. Wide
 * enough to cover a gateway and the wall either side of it.
 */
const END_GRACE = 56;

export class Terrain {
  readonly width: number;
  readonly height: number;
  private readonly cols: number;
  private readonly rows: number;
  /** 1 where the ground can be walked on. */
  private readonly open: Uint8Array;
  /** Distance from each cell to the nearest thing that cannot be walked on. */
  private readonly clear: Float32Array;

  constructor(def: MapDef) {
    this.width = def.width;
    this.height = def.height;
    this.cols = Math.ceil(def.width / CELL);
    this.rows = Math.ceil(def.height / CELL);

    const n = this.cols * this.rows;
    this.open = new Uint8Array(n).fill(1);
    this.clear = new Float32Array(n);

    this.blockHills(def);
    this.blockRects(def);
    this.blockCastle(def);
    this.measureClearance();
  }

  // ------------------------------------------------------------- what blocks

  private blockHills(def: MapDef): void {
    const hills = def.hills;
    if (!hills) return;

    /*
     * A cell is blocked if *any* of it is hill, not merely its middle.
     *
     * Testing only the centre leaves the walkable area overlapping every
     * hillside by up to half a cell, and since a creep's body is then placed
     * relative to that optimistic edge, the front ends up walking visibly over
     * the grass. Erring the other way costs a few units of sand nobody misses.
     */
    for (let cy = 0; cy < this.rows; cy++) {
      for (let cx = 0; cx < this.cols; cx++) {
        const probes: Array<[number, number]> = [
          [(cx + 0.5) * CELL, (cy + 0.5) * CELL],
          [cx * CELL, cy * CELL],
          [(cx + 1) * CELL, cy * CELL],
          [cx * CELL, (cy + 1) * CELL],
          [(cx + 1) * CELL, (cy + 1) * CELL],
        ];

        let blocked = false;
        for (const hill of hills) {
          for (const [x, y] of probes) {
            const inside =
              'r' in hill
                ? (x - hill.x) ** 2 + (y - hill.y) ** 2 <= hill.r * hill.r
                : pointInPolygon(x, y, hill.points);
            if (inside) {
              blocked = true;
              break;
            }
          }
          if (blocked) break;
        }
        if (blocked) this.open[cy * this.cols + cx] = 0;
      }
    }
  }

  private blockRects(def: MapDef): void {
    for (const rect of def.obstacles) {
      for (let y = rect.y; y < rect.y + rect.h; y += CELL / 2) {
        for (let x = rect.x; x < rect.x + rect.w; x += CELL / 2) {
          this.set(x, y, 0);
        }
      }
    }
  }

  /**
   * The city is not walked through, it is walked *at*. Every block is solid,
   * gates included — a route ends at its gate rather than passing through it,
   * and leaving the opening walkable would let the router slip inside the
   * walls and come at a gate from behind.
   */
  private blockCastle(def: MapDef): void {
    for (const block of def.castle.blocks) {
      for (let y = block.top; y < block.bottom; y += CELL / 2) {
        for (let x = block.left; x < def.width; x += CELL / 2) {
          this.set(x, y, 0);
        }
      }
    }
  }

  private set(x: number, y: number, value: number): void {
    const cx = Math.floor(x / CELL);
    const cy = Math.floor(y / CELL);
    if (cx < 0 || cy < 0 || cx >= this.cols || cy >= this.rows) return;
    this.open[cy * this.cols + cx] = value;
  }

  /**
   * Distance from every walkable cell to the nearest blocked one, by the usual
   * two-pass chamfer — close enough to a true Euclidean distance for deciding
   * how wide a corridor is, and far cheaper.
   *
   * The map edges deliberately do not count as blocking. A front spreading off
   * the side of the board is how every map already begins.
   */
  private measureClearance(): void {
    const { cols, rows, open, clear } = this;
    const FAR = 1e6;
    const D1 = CELL;
    const D2 = CELL * Math.SQRT2;

    for (let i = 0; i < clear.length; i++) clear[i] = open[i] ? FAR : 0;

    const at = (x: number, y: number) =>
      x < 0 || y < 0 || x >= cols || y >= rows ? FAR : clear[y * cols + x];

    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        const i = y * cols + x;
        if (clear[i] === 0) continue;
        clear[i] = Math.min(
          clear[i],
          at(x - 1, y) + D1,
          at(x, y - 1) + D1,
          at(x - 1, y - 1) + D2,
          at(x + 1, y - 1) + D2,
        );
      }
    }
    for (let y = rows - 1; y >= 0; y--) {
      for (let x = cols - 1; x >= 0; x--) {
        const i = y * cols + x;
        if (clear[i] === 0) continue;
        clear[i] = Math.min(
          clear[i],
          at(x + 1, y) + D1,
          at(x, y + 1) + D1,
          at(x + 1, y + 1) + D2,
          at(x - 1, y + 1) + D2,
        );
      }
    }
  }

  // ------------------------------------------------------------------ asking

  /** True where the ground can be walked on. Off-map counts as walkable. */
  isOpen(x: number, y: number): boolean {
    const cx = Math.floor(x / CELL);
    const cy = Math.floor(y / CELL);
    if (cx < 0 || cy < 0 || cx >= this.cols || cy >= this.rows) return true;
    return this.open[cy * this.cols + cx] === 1;
  }

  /**
   * How much room there is at a point before the nearest hill or wall.
   *
   * A cell's worth is taken off what the grid measured. Clearance is the
   * distance to the nearest blocked cell's *centre*, so it is optimistic by
   * about that much, and anything that positions a body against it — a front
   * spreading out to fill its corridor — would otherwise sit that far into the
   * hillside.
   */
  clearanceAt(x: number, y: number): number {
    // Off the board, answer for the nearest cell on it rather than waving the
    // question away. A front forms up off-map and walks on; telling it the
    // going is clear out there let it spread into a hillside that reaches the
    // map edge before it had taken a step.
    const cx = Math.min(this.cols - 1, Math.max(0, Math.floor(x / CELL)));
    const cy = Math.min(this.rows - 1, Math.max(0, Math.floor(y / CELL)));
    return Math.max(0, this.clear[cy * this.cols + cx] - CELL);
  }

  // ---------------------------------------------------------------- routing

  /**
   * A way from `from` to `to` that never leaves the sand, as a short list of
   * corners.
   *
   * Dijkstra over the grid, with every step priced by how tight the going is,
   * so a front walks down the middle of a corridor rather than scraping along
   * a hillside, and takes a narrow gap only when going round would cost more
   * than squeezing through. Returns null when there is genuinely no way.
   */
  route(from: Vec2, to: Vec2): Vec2[] | null {
    /*
     * Where a front walks on is a *rough* instruction — "they come in about
     * here" — so try a spread of points along that edge and keep whichever
     * gives the army most room to start with.
     *
     * Pinning it to the exact declared spot means that a patch drawn against
     * the map edge near it squeezes the whole front through the gap beside it
     * before it has taken a step, which looks like a bug in the pathing rather
     * than what it is: a hill in the doorway.
     */
    const starts = this.entryCandidates(from);

    for (const minimum of CLEARANCE_LADDER) {
      let best: Vec2[] | null = null;
      let bestRoom = -1;

      for (const start of starts) {
        const found = this.search(start, to, minimum);
        if (!found) continue;
        const room = this.roomAlong(found, 180);
        if (room > bestRoom) {
          bestRoom = room;
          best = found;
        }
      }
      if (best) return best;
    }
    return null;
  }

  /** Points along the map edge a front might reasonably walk on at. */
  private entryCandidates(from: Vec2): Vec2[] {
    const inside = (p: Vec2) => ({
      x: Math.min(this.width - 4, Math.max(4, p.x)),
      y: Math.min(this.height - 4, Math.max(4, p.y)),
    });

    const nearSide = from.x <= 8 || from.x >= this.width - 8;
    const spread = [0, -50, 50, -100, 100, -150, 150];
    return spread.map((offset) =>
      inside(nearSide ? { x: from.x, y: from.y + offset } : { x: from.x + offset, y: from.y }),
    );
  }

  /** The tightest spot in the first stretch of a route. */
  private roomAlong(points: Vec2[], span: number): number {
    let travelled = 0;
    let tightest = Infinity;
    for (let i = 0; i < points.length - 1 && travelled < span; i++) {
      const a = points[i];
      const b = points[i + 1];
      const leg = Math.hypot(b.x - a.x, b.y - a.y);
      const steps = Math.max(1, Math.ceil(leg / CELL));
      for (let s = 0; s <= steps && travelled < span; s++) {
        const t = s / steps;
        tightest = Math.min(tightest, this.clearanceAt(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t));
        travelled += leg / steps;
      }
    }
    return tightest;
  }

  private search(from: Vec2, to: Vec2, minClearance: number): Vec2[] | null {
    const start = this.nearestOpenCell(from);
    const goal = this.nearestOpenCell(to);
    if (start < 0 || goal < 0) return null;

    const n = this.cols * this.rows;
    const dist = new Float64Array(n).fill(Infinity);
    const prev = new Int32Array(n).fill(-1);
    const done = new Uint8Array(n);
    const heap = new MinHeap();

    dist[start] = 0;
    heap.push(start, 0);

    while (heap.size > 0) {
      const cell = heap.pop();
      if (cell === goal) break;
      if (done[cell]) continue;
      done[cell] = 1;

      const cx = cell % this.cols;
      const cy = (cell - cx) / this.cols;

      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (dx === 0 && dy === 0) continue;
          const nx = cx + dx;
          const ny = cy + dy;
          if (nx < 0 || ny < 0 || nx >= this.cols || ny >= this.rows) continue;

          const next = ny * this.cols + nx;
          if (!this.open[next] || done[next]) continue;
          // No cutting a diagonal past the corner of a hill.
          if (dx !== 0 && dy !== 0) {
            if (!this.open[cy * this.cols + nx] || !this.open[ny * this.cols + cx]) continue;
          }

          /*
           * The ground at either end of a route is exempt from the minimum.
           *
           * A gate is a hole in a wall: the sand outside it is hard against
           * stone and can never be as open as a corridor, and the spot on the
           * map edge where a front forms up is much the same. Holding the
           * approaches to the full clearance failed every rung of the ladder —
           * not merely the last cell but the whole run-in — so every front
           * quietly dropped to squeezing through whatever slot it could find,
           * which is the exact thing this is here to prevent.
           */
          // The same corrected figure the rest of the game sees, so a rung of
          // the ladder means the same room a front will actually get.
          const room = Math.max(0, this.clear[next] - CELL);
          if (room < minClearance && !this.nearEnd(next, start, goal)) continue;

          const step = dx !== 0 && dy !== 0 ? CELL * Math.SQRT2 : CELL;
          const squeeze = Math.max(0, 1 - room / PREFERRED_CLEARANCE);
          const cost = dist[cell] + step * (1 + SQUEEZE_PENALTY * squeeze * squeeze);

          if (cost < dist[next]) {
            dist[next] = cost;
            prev[next] = cell;
            heap.push(next, cost);
          }
        }
      }
    }

    if (dist[goal] === Infinity) return null;

    const cells: number[] = [];
    for (let cell = goal; cell !== -1; cell = prev[cell]) cells.push(cell);
    cells.reverse();

    const points = cells.map((cell) => {
      const cx = cell % this.cols;
      const cy = (cell - cx) / this.cols;
      return { x: (cx + 0.5) * CELL, y: (cy + 0.5) * CELL };
    });
    // Finish exactly at the gate rather than at the middle of the last cell.
    points[points.length - 1] = { x: to.x, y: to.y };

    return this.simplify(points);
  }

  /**
   * Straighten the staircase a grid always produces: keep a corner only where
   * the line would otherwise leave the sand.
   */
  private simplify(points: Vec2[]): Vec2[] {
    if (points.length <= 2) return points;

    const out: Vec2[] = [points[0]];
    let anchor = 0;

    while (anchor < points.length - 1) {
      let best = anchor + 1;
      for (let j = points.length - 1; j > anchor + 1; j--) {
        if (this.walkable(points[anchor], points[j])) {
          best = j;
          break;
        }
      }
      out.push(points[best]);
      anchor = best;
    }
    return out;
  }

  /**
   * Whether a straight line between two points stays on walkable ground.
   *
   * Only walkability, deliberately — the route this straightens was already
   * costed to keep its distance from the hills, and re-imposing a clearance
   * floor here would refuse to straighten the last few paces into a gate.
   */
  private walkable(a: Vec2, b: Vec2): boolean {
    const span = Math.hypot(b.x - a.x, b.y - a.y);
    const steps = Math.ceil(span / (CELL / 2));
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const x = a.x + (b.x - a.x) * t;
      const y = a.y + (b.y - a.y) * t;
      if (!this.isOpen(x, y)) return false;
    }
    return true;
  }

  /** Whether a cell is close enough to either end of a route to be excused. */
  private nearEnd(cell: number, start: number, goal: number): boolean {
    const grace = Math.ceil(END_GRACE / CELL);
    for (const end of [start, goal]) {
      const dx = (cell % this.cols) - (end % this.cols);
      const dy = Math.floor(cell / this.cols) - Math.floor(end / this.cols);
      if (dx * dx + dy * dy <= grace * grace) return true;
    }
    return false;
  }

  private nearestOpenCell(p: Vec2): number {
    const clampCol = Math.min(this.cols - 1, Math.max(0, Math.floor(p.x / CELL)));
    const clampRow = Math.min(this.rows - 1, Math.max(0, Math.floor(p.y / CELL)));
    if (this.open[clampRow * this.cols + clampCol]) return clampRow * this.cols + clampCol;

    // Spiral outwards for the closest walkable cell, so a start or gate placed
    // a few units inside a hill or wall still finds the sand beside it.
    for (let ring = 1; ring < Math.max(this.cols, this.rows); ring++) {
      for (let dy = -ring; dy <= ring; dy++) {
        for (let dx = -ring; dx <= ring; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== ring) continue;
          const cx = clampCol + dx;
          const cy = clampRow + dy;
          if (cx < 0 || cy < 0 || cx >= this.cols || cy >= this.rows) continue;
          if (this.open[cy * this.cols + cx]) return cy * this.cols + cx;
        }
      }
    }
    return -1;
  }
}

/** Ray casting: is the point inside this outline? */
export function pointInPolygon(x: number, y: number, points: readonly Vec2[]): boolean {
  let inside = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const a = points[i];
    const b = points[j];
    if (a.y > y !== b.y > y && x < ((b.x - a.x) * (y - a.y)) / (b.y - a.y) + a.x) {
      inside = !inside;
    }
  }
  return inside;
}

/** The smallest binary heap that will do, so routing is not O(n²). */
class MinHeap {
  private readonly items: number[] = [];
  private readonly keys: number[] = [];

  get size(): number {
    return this.items.length;
  }

  push(item: number, key: number): void {
    this.items.push(item);
    this.keys.push(key);
    let i = this.items.length - 1;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (this.keys[parent] <= this.keys[i]) break;
      this.swap(i, parent);
      i = parent;
    }
  }

  pop(): number {
    const top = this.items[0];
    const lastItem = this.items.pop() as number;
    const lastKey = this.keys.pop() as number;
    if (this.items.length > 0) {
      this.items[0] = lastItem;
      this.keys[0] = lastKey;
      let i = 0;
      for (;;) {
        const left = i * 2 + 1;
        const right = left + 1;
        let smallest = i;
        if (left < this.items.length && this.keys[left] < this.keys[smallest]) smallest = left;
        if (right < this.items.length && this.keys[right] < this.keys[smallest]) smallest = right;
        if (smallest === i) break;
        this.swap(i, smallest);
        i = smallest;
      }
    }
    return top;
  }

  private swap(a: number, b: number): void {
    [this.items[a], this.items[b]] = [this.items[b], this.items[a]];
    [this.keys[a], this.keys[b]] = [this.keys[b], this.keys[a]];
  }
}
