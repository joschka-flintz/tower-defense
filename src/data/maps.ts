import type { Rect, Vec2 } from '../core/vec';

/** A reserved plot inside the city walls that only takes one kind of building. */
export interface BuildLot {
  id: string;
  x: number;
  y: number;
  accepts: 'house' | 'farm' | 'research';
}

/** The walled corner of the city, drawn behind the gate the road runs into. */
export interface CastleDef {
  /**
   * The walls run down the west side and along the north and south, with the
   * fourth side continuing off the map edge — so three walls are visible.
   */
  left: number;
  top: number;
  bottom: number;
  /** Half-height of the gate opening in the west wall. */
  gateHalf: number;
  lots: BuildLot[];
  /** Where coins and grain change hands. */
  market: { x: number; y: number };
}

/**
 * A minor path: a hidden trail that starts off its own edge of the map and
 * rejoins the main road partway along. Its last point must land exactly on a
 * segment of the main route's `waypoints` — that is where the two are spliced
 * together, so give it a coordinate that actually sits on that segment rather
 * than merely near it.
 */
export interface TrailDef {
  id: string;
  waypoints: Vec2[];
  /** Half-width of this trail's road. Defaults to a fraction of the main one. */
  radius?: number;
}

export interface MapDef {
  id: string;
  name: string;
  /** World size in game units. The canvas is scaled to fit this. */
  width: number;
  height: number;
  /** Route corner points. The first and last sit off-screen so creeps walk in and out. */
  waypoints: Vec2[];
  /** Half-width of the walkable road; towers may not be built inside it. */
  pathRadius: number;
  /** Side trails that enter from elsewhere on the map edge and rejoin the main road. */
  trails: TrailDef[];
  /** Scenery that also blocks building. */
  obstacles: Rect[];
  /** Base meadow colour. */
  grass: string;
  /** Darker patches blended over the base. */
  grassAlt: string;
  /** Lighter, sun-bleached patches blended over the base. */
  grassLight: string;
  /** Packed earth of the road. */
  road: string;
  /** Trodden, darker rim of the road. */
  roadEdge: string;
  /** Stone colour for boulders and structures. */
  rock: string;
  castle: CastleDef;
}

export const CLASSIC_MEADOW: MapDef = {
  id: 'classic-meadow',
  name: 'Classic Meadow',
  width: 1280,
  height: 720,
  waypoints: [
    { x: -50, y: 170 },
    { x: 300, y: 170 },
    { x: 300, y: 430 },
    { x: 620, y: 430 },
    { x: 620, y: 145 },
    { x: 880, y: 145 },
    { x: 880, y: 565 },
    // The route ends at the city gate in the west wall.
    { x: 1010, y: 565 },
  ],
  pathRadius: 28,
  trails: [
    {
      // Drops out of the northern treeline and joins the main road on its
      // climb up the eastern side, roughly a third of the way along.
      id: 'north-fork',
      waypoints: [
        { x: 520, y: -40 },
        { x: 520, y: 90 },
        { x: 585, y: 195 },
        { x: 620, y: 300 },
      ],
    },
    {
      // Climbs out of the southern fields between the two boulder fields and
      // meets the road on the middle stretch.
      id: 'south-fork',
      waypoints: [
        { x: 150, y: 760 },
        { x: 150, y: 600 },
        { x: 300, y: 500 },
        { x: 450, y: 430 },
      ],
    },
    {
      // A short cut-through from the western treeline, joining the road
      // almost as soon as it turns south.
      id: 'west-fork',
      waypoints: [
        { x: -50, y: 350 },
        { x: 60, y: 350 },
        { x: 150, y: 260 },
        { x: 150, y: 170 },
      ],
    },
  ],
  obstacles: [
    { x: 700, y: 240, w: 120, h: 80 },
    { x: 380, y: 540, w: 150, h: 90 },
    { x: 700, y: 470, w: 110, h: 90 },
  ],
  grass: '#546b38',
  grassAlt: '#42552b',
  grassLight: '#697d4a',
  road: '#a08662',
  roadEdge: '#6b5638',
  rock: '#655f56',

  // The city sits in the bottom-right corner only, so it takes about a third of
  // the space the old full-height wall did and leaves the field open to build on.
  // A walled quarter on the eastern side rather than a corner, so the north,
  // west and south walls all show. Sized to the buildings inside it.
  castle: {
    left: 1010,
    top: 430,
    bottom: 705,
    gateHalf: 30,
    market: { x: 1163, y: 638 },
    lots: [
      { id: 'house-1', x: 1070, y: 485, accepts: 'house' },
      { id: 'house-2', x: 1140, y: 485, accepts: 'house' },
      { id: 'house-3', x: 1210, y: 485, accepts: 'house' },
      { id: 'farm-1', x: 1070, y: 565, accepts: 'farm' },
      { id: 'farm-2', x: 1070, y: 645, accepts: 'farm' },
      { id: 'hall-1', x: 1155, y: 570, accepts: 'research' },
    ],
  },
};

export const MAPS: MapDef[] = [CLASSIC_MEADOW];
