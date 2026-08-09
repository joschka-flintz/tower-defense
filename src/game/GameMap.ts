import type { MapDef } from '../data/maps';
import { Path } from './Path';

/** A walkable route creeps can be spawned onto, with its own road width. */
export interface Lane {
  id: string;
  path: Path;
  radius: number;
  /**
   * Distance-remaining-to-the-end at the point this lane joins the main
   * road. Below this threshold a creep on this lane is physically walking
   * the shared tail, so it can be measured against `blockDistance` on the
   * main road (see `Game.besiegeGates`). The main lane's value is its own
   * full length, which never restricts anything — the whole lane is main
   * road. A gate built before a trail's junction sits above this threshold
   * for that trail, so its creeps correctly never encounter it at all.
   */
  joinRemaining: number;
}

/** A map definition plus the derived data the game needs at runtime. */
export class GameMap {
  readonly def: MapDef;
  readonly path: Path;
  /** Every side trail, already spliced onto the tail of the main road. */
  readonly trails: Lane[];
  /** The main road plus every trail, for anything that needs to sweep all of them. */
  readonly lanes: Lane[];

  constructor(def: MapDef) {
    this.def = def;
    this.path = new Path(def.waypoints);

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
        joinRemaining: this.path.length - at,
      };
    });

    this.lanes = [
      { id: 'main', path: this.path, radius: def.pathRadius, joinRemaining: this.path.length },
      ...this.trails,
    ];
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
}
