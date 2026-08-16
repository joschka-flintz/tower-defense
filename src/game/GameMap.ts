import type { Vec2 } from '../core/vec';
import type { ChokeDef, HillDef, MapDef } from '../data/maps';
import { Path } from './Path';
import { pointInPolygon, Terrain } from './terrain';

/** The widest a gatehouse ever gets, however broad the front it stands on. */
const MAX_GATE_HALF = 74;

/** How often a route's corridor width is sampled along its length. */
const CORRIDOR_STEP = 6;

/** A gap this tight or tighter is worth naming as a place to build a wall. */
const CHOKE_WIDTH = 96;

/** Two chokes on one front closer together than this are the same decision. */
const CHOKE_SPACING = 230;

/** How far off the board a front forms up before it walks on. */
const WALK_ON = 90;

/** A walkable route creeps can be spawned onto, with its own road width. */
export interface Lane {
  id: string;
  path: Path;
  radius: number;
  /**
   * Which independent route this lane belongs to. A trail belongs to the route
   * it joins; a route belongs to itself.
   *
   * It exists because "how far is left to walk" is only a shared coordinate
   * between lanes that end in the same place. Trails do — they are spliced onto
   * the main road's tail — which is what lets a gatehouse on that tail stop
   * their creeps too. Two routes making for two different gates do not, so a
   * gate on one must ignore the other's creeps however similar the numbers look.
   */
  routeId: string;
  /** The wave this way in opens on. 1 for anything open from the start. */
  fromWave: number;
  /**
   * Distance-remaining-to-the-end at the point this lane joins its route.
   * Below this threshold a creep on this lane is physically walking the shared
   * tail, so it can be measured against `blockDistance` on that route (see
   * `Game.besiegeGates`). A route's own value is its full length, which never
   * restricts anything — the whole lane is its own road. A gate built before a
   * trail's junction sits above this threshold for that trail, so its creeps
   * correctly never encounter it at all.
   */
  joinRemaining: number;
  /**
   * How much room there is either side of the centre line, sampled along the
   * lane, or null where nothing constrains it.
   *
   * On a map where the enemy has to keep to the sand this is what stops a
   * front from spilling over a hill: a creep's wander to one side is clamped
   * to the room actually available where it currently stands, so the column
   * broadens across open ground and squeezes together at a gap.
   */
  corridor: Float32Array | null;
}

/** How wide a lane is at a distance along it, from its sampled corridor. */
export function corridorAt(lane: Lane, distance: number): number {
  const samples = lane.corridor;
  if (!samples || samples.length === 0) return lane.radius;
  const i = Math.max(0, Math.min(samples.length - 1, Math.round(distance / CORRIDOR_STEP)));
  return samples[i];
}

/** A map definition plus the derived data the game needs at runtime. */
export class GameMap {
  readonly def: MapDef;
  /** The first route's path. Still "the road" on every one-route map. */
  readonly path: Path;
  /**
   * The walkable ground, on maps where the enemy has to go round things.
   * Null on road maps, which have nothing to go round.
   */
  readonly terrain: Terrain | null;
  /** Every place a wall may be built: named on the map, or found in the ground. */
  readonly chokes: ChokeDef[];
  /**
   * Every independent way in, the main one first. One gate per route, in the
   * same order as the map's gates.
   */
  readonly routes: Lane[];
  /** Every side trail, already spliced onto the tail of the route it joins. */
  readonly trails: Lane[];
  /** Routes plus trails, for anything that needs to sweep all of them. */
  readonly lanes: Lane[];

  constructor(def: MapDef) {
    this.def = def;

    /*
     * On a map with hills the enemy has to go *round* them, so a route is not
     * the line the map draws — it is found through the sand between the first
     * waypoint and the last, and the corners in between are ignored.
     *
     * This is what makes the ground and the enemy's path the same fact rather
     * than two hand-kept copies of it. Redraw a patch and the fronts move to
     * suit; nothing has to be re-authored to match.
     */
    this.terrain = def.hills ? new Terrain(def) : null;

    this.path = new Path(this.trace(def.waypoints));

    const main: Lane = {
      id: 'main',
      path: this.path,
      radius: def.pathRadius,
      routeId: 'main',
      fromWave: 1,
      joinRemaining: this.path.length,
      corridor: null,
    };

    this.routes = [
      main,
      ...(def.routes ?? []).map((route) => {
        const path = new Path(this.trace(route.waypoints));
        return {
          id: route.id,
          path,
          radius: route.radius ?? def.pathRadius,
          routeId: route.id,
          fromWave: route.fromWave ?? 1,
          joinRemaining: path.length,
          corridor: null,
        };
      }),
    ];

    // Trails always join the main road; nothing else has ever grown one.
    this.trails = def.trails.map((trail) => {
      const junction = trail.waypoints[trail.waypoints.length - 1];
      const at = this.path.nearestDistance(junction.x, junction.y);
      // Drop the trail's own last point and pick the join back up from the
      // main road's interpolated point at that distance, so the seam is exact.
      const points = [...trail.waypoints.slice(0, -1), ...this.path.pointsFrom(at)];
      return {
        id: trail.id,
        path: new Path(points),
        radius: trail.radius ?? def.pathRadius * 0.3,
        routeId: 'main',
        fromWave: 1,
        joinRemaining: this.path.length - at,
        corridor: null,
      };
    });

    this.lanes = [...this.routes, ...this.trails];

    if (this.terrain) {
      for (const lane of this.lanes) lane.corridor = this.measureCorridor(lane);
    }
    this.chokes = def.chokes ?? this.findChokes();
  }

  /**
   * The actual line a front walks between the ends of what the map declares.
   *
   * On a road map that is the declared line itself. On a map with hills only
   * the first and last points are used — where the enemy comes in and which
   * gate it makes for — and the way between them is found through the sand.
   * Failing that (a gate walled off entirely by a redrawn hill, say) it falls
   * back to the declared line rather than leaving the map unplayable.
   */
  private trace(waypoints: Vec2[]): Vec2[] {
    if (!this.terrain || waypoints.length < 2) return waypoints;

    const entry = waypoints[0];
    const gate = waypoints[waypoints.length - 1];

    // The declared entry sits off the map so creeps walk on rather than
    // appearing; route from the first point actually on the board.
    const inside = {
      x: Math.min(this.def.width - 4, Math.max(4, entry.x)),
      y: Math.min(this.def.height - 4, Math.max(4, entry.y)),
    };

    const found = this.terrain.route(inside, gate);
    if (!found) return waypoints;

    /*
     * Walk on from off the board along the line the route already takes,
     * rather than from the point the map declares.
     *
     * The declared entry is a rough "they come in about here"; drawing a
     * straight segment from it to wherever the route actually starts can cross
     * a patch that reaches the map edge, and the front walks on *through* a
     * hill before it has taken a step of its proper route.
     */
    const first = found[0];
    const next = found[1] ?? gate;
    const dx = first.x - next.x;
    const dy = first.y - next.y;
    const span = Math.hypot(dx, dy) || 1;
    const walkOn = { x: first.x + (dx / span) * WALK_ON, y: first.y + (dy / span) * WALK_ON };

    return [walkOn, ...found];
  }

  /** Room either side of the centre line, sampled the length of a lane. */
  private measureCorridor(lane: Lane): Float32Array | null {
    if (!this.terrain) return null;

    const count = Math.ceil(lane.path.length / CORRIDOR_STEP) + 1;
    const samples = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      const p = lane.path.positionAt(i * CORRIDOR_STEP);
      samples[i] = Math.min(lane.radius, this.terrain.clearanceAt(p.x, p.y));
    }
    return samples;
  }

  /**
   * Where each front is narrow enough to be worth walling, found in the ground
   * rather than named by hand.
   *
   * Hand-placed chokes were the first version and they rot: move a hill and a
   * gap that no longer exists is still offered as a place to build a gate.
   * These are the tightest points along each route, spaced far enough apart to
   * be separate decisions.
   */
  private findChokes(): ChokeDef[] {
    if (!this.terrain) return [];

    const found: ChokeDef[] = [];
    for (const route of this.routes) {
      const samples = route.corridor;
      if (!samples) continue;

      const candidates: Array<{ at: number; width: number }> = [];
      for (let i = 2; i < samples.length - 2; i++) {
        const width = samples[i];
        if (width > CHOKE_WIDTH) continue;
        // A local minimum: the tightest point of this particular gap.
        if (samples[i - 1] < width || samples[i + 1] < width) continue;
        candidates.push({ at: i * CORRIDOR_STEP, width });
      }

      candidates.sort((a, b) => a.width - b.width);
      const taken: number[] = [];
      for (const candidate of candidates) {
        if (taken.some((at) => Math.abs(at - candidate.at) < CHOKE_SPACING)) continue;
        // Never right on top of the gate; a wall there defends nothing.
        if (route.path.length - candidate.at < 90) continue;
        // Nor out where the front is still walking on: the ground at the map
        // edge is pinched by whatever patch reaches it, and a wall built off
        // the board defends nothing either.
        if (candidate.at < WALK_ON + 60) continue;

        const p = route.path.positionAt(candidate.at);
        if (p.x < 30 || p.y < 30 || p.x > this.def.width - 30 || p.y > this.def.height - 30) {
          continue;
        }
        taken.push(candidate.at);
        found.push({
          id: `${route.routeId}-gap-${taken.length}`,
          x: p.x,
          y: p.y,
          angle: p.angle,
          route: route.id,
        });
        if (taken.length >= 2) break;
      }
    }
    return found;
  }

  /** The lane with this id, or the main road when there is no such lane. */
  lane(id: string): Lane {
    return this.lanes.find((l) => l.id === id) ?? this.routes[0];
  }

  /**
   * Where a wall built in this gap would stand and which way it would face —
   * the one place that answers it, so the marker on the ground, the ghost
   * under the cursor and the gate that ends up there cannot disagree.
   */
  chokeStance(choke: ChokeDef): { x: number; y: number; angle: number; at: number } {
    const route = this.lane(choke.route);
    const at = route.path.nearestDistance(choke.x, choke.y);
    return {
      x: choke.x,
      y: choke.y,
      angle: choke.angle ?? route.path.positionAt(at).angle,
      at,
    };
  }

  get width(): number {
    return this.def.width;
  }

  get height(): number {
    return this.def.height;
  }

  get pathRadius(): number {
    return this.def.pathRadius;
  }

  /**
   * How wide a gatehouse built here is — the span of road or front it seals,
   * which its sprite, its turret positions and its ghost all have to agree on.
   *
   * On a road map that is simply the road's half-width. On open ground a front
   * is far wider than any wall could be, so it is capped: a gatehouse in a gap
   * between hills is a wall across the gap, not across the whole desert.
   */
  get gateHalfWidth(): number {
    return this.chokes.length > 0 ? Math.min(this.def.pathRadius, MAX_GATE_HALF) : this.def.pathRadius;
  }

  /** Ground raised enough to build on, or null on a map that has no such rule. */
  get hills(): readonly HillDef[] | null {
    return this.def.hills ?? null;
  }

  /**
   * Whether a point stands on buildable high ground, with `margin` to spare.
   *
   * A patch is either a circle or a traced outline. The margin is exact for a
   * circle and sampled for an outline — the point and four others a margin out
   * from it must all be inside the same patch. Sampling is enough here: it is
   * the difference between a building sitting on the lip of a patch and safely
   * on it, not a physics question.
   */
  onHill(x: number, y: number, margin = 0): boolean {
    const hills = this.def.hills;
    if (!hills) return true;

    for (const hill of hills) {
      if ('r' in hill) {
        const reach = hill.r - margin;
        if (reach > 0 && (x - hill.x) ** 2 + (y - hill.y) ** 2 <= reach * reach) return true;
        continue;
      }

      if (!pointInPolygon(x, y, hill.points)) continue;
      if (margin <= 0) return true;
      const clear = ([
        [margin, 0],
        [-margin, 0],
        [0, margin],
        [0, -margin],
      ] as const).every(([dx, dy]) => pointInPolygon(x + dx, y + dy, hill.points));
      if (clear) return true;
    }
    return false;
  }
}
