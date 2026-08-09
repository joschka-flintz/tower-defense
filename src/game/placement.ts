import { distToRect } from '../core/vec';
import type { TowerDef } from '../data/towers';
import type { GameMap } from './GameMap';
import type { Tower } from './Tower';

export type PlacementError =
  | 'ok'
  | 'off-map'
  | 'on-path'
  | 'off-path'
  | 'blocked'
  | 'occupied'
  | 'too-expensive'
  | 'needs-research'
  | 'no-housing';

/** Extra breathing room so towers never look like they touch the road. */
const PATH_CLEARANCE = 3;

/**
 * Bloons-style free placement: anywhere that is on the map, clear of the road,
 * clear of scenery and not overlapping another tower.
 */
export interface PlacementWorld {
  map: GameMap;
  towers: Tower[];
  /** Existing gatehouses, which also occupy space. */
  gates: Array<{ x: number; y: number; def: TowerDef }>;
  gold: number;
  techs: ReadonlySet<string>;
  /** Spare housing, for buildings that need people to man them. */
  housingFree: number;
  /**
   * What this nation actually pays for the building, which is not always what
   * the table says — see `NationTraits.costs`. Passed in rather than read off
   * the def so the affordability check here can never disagree with the price
   * charged at purchase.
   */
  costOf: (def: TowerDef) => number;
}

export function checkPlacement(
  world: PlacementWorld,
  def: TowerDef,
  x: number,
  y: number,
): PlacementError {
  const { map, towers, gates, gold, techs, housingFree, costOf } = world;
  const r = def.radius;

  if (def.requiresTech && !techs.has(def.requiresTech)) return 'needs-research';
  if ((def.housing ?? 0) > housingFree) return 'no-housing';

  if (x - r < 0 || y - r < 0 || x + r > map.width || y + r > map.height) return 'off-map';

  const toPath = map.path.distanceToPoint(x, y);

  if (def.placement === 'path') {
    // A gatehouse has to straddle the main road, not sit beside it or on a trail.
    if (toPath > map.pathRadius * 0.6) return 'off-path';
  } else {
    if (toPath < map.pathRadius + r + PATH_CLEARANCE) return 'on-path';
    for (const trail of map.trails) {
      if (trail.path.distanceToPoint(x, y) < trail.radius + r + PATH_CLEARANCE) return 'on-path';
    }
  }

  for (const obstacle of map.def.obstacles) {
    if (distToRect(x, y, obstacle) < r) return 'blocked';
  }

  for (const tower of towers) {
    if (Math.hypot(tower.x - x, tower.y - y) < r + tower.def.radius) return 'occupied';
  }

  for (const gate of gates) {
    // Gatehouses are wide, so keep them well apart along the road.
    if (Math.hypot(gate.x - x, gate.y - y) < (r + gate.def.radius) * 1.6) return 'occupied';
  }

  if (gold < costOf(def)) return 'too-expensive';

  return 'ok';
}
