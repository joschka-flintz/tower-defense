import type { Rect, Vec2 } from '../core/vec';

/** A reserved plot inside the city walls that only takes one kind of building. */
export interface BuildLot {
  id: string;
  x: number;
  y: number;
  accepts: 'house' | 'farm' | 'research';
}

/**
 * One walled block of the city. Its east side always runs off the map edge, so
 * three walls are visible: west, north and south.
 *
 * A castle is a list of these. One block is the ordinary case — a walled
 * quarter with the town inside it. Several blocks let the walls step: a roomy
 * quarter with the buildings in it, and a narrow strip of curtain wall running
 * on from it with nothing behind but a yard. Blocks are drawn in order and are
 * allowed to share an edge, which reads as an inner wall between two baileys.
 */
export interface CastleBlock {
  left: number;
  top: number;
  bottom: number;
  /**
   * Openings in this block's west wall, as centre y and half-height. Every
   * gate is a way in that has to be defended — a route ends at each one.
   */
  gates: Array<{ y: number; half: number }>;
  /**
   * False for a block that is only walls and a yard. The town — hall, market,
   * plots — is drawn in the first block that wants it.
   */
  town?: boolean;
}

/** The walled corner of the city, drawn behind the gates the routes run into. */
export interface CastleDef {
  blocks: CastleBlock[];
  lots: BuildLot[];
  /** Where coins and grain change hands. */
  market: { x: number; y: number };
  /**
   * The royal hall inside the walls. Drawn unless a map says otherwise — a
   * city that is only a wall and a yard has no seat of government in it, and
   * the building is decoration rather than anything the game reads.
   */
  hall?: boolean;
}

/**
 * A hill: ground raised enough to build on. Towers may stand nowhere else.
 *
 * Two shapes, because hand-drawn ground is not made of circles. A circle is
 * the quick way to say "a knoll here"; an outline is a traced patch, and it is
 * the only way to get the shapes a person actually draws — long fingers
 * reaching in from a map edge, masses with concave bays, a ring around a
 * hollow. Both are tested the same way and drawn the same way, so a patch can
 * be either without anything downstream caring.
 *
 * An outline may run off the edge of the map; it is simply clipped there.
 */
export type HillDef = { x: number; y: number; r: number } | { points: Vec2[] };

/**
 * A gap between hills narrow enough to wall off. On a map with no roads there
 * is no "across the road" for a gatehouse to straddle, so the places one can
 * be built are named outright rather than derived.
 */
export interface ChokeDef {
  id: string;
  x: number;
  y: number;
  /** Which route it stands on, so the right creeps are stopped by it. */
  route: string;
  /**
   * Which way the enemy is travelling here, in radians — the same convention
   * as a road's own angle, so a wall is drawn square across it. Left unset it
   * is taken from the route itself, which is right unless the gap runs at an
   * angle to the line of march.
   */
  angle?: number;
}

/**
 * An independent route from a map edge to a gate. Unlike a trail, it never
 * rejoins anything: it is a way in of its own, with its own gate at the end.
 */
export interface RouteDef {
  id: string;
  waypoints: Vec2[];
  /**
   * Half-width of the band this route's creeps spread across. On open ground
   * this is deliberately wide — it is a front, not a column.
   */
  radius?: number;
  /**
   * The wave this front opens on. Before it, nothing comes this way at all.
   *
   * Three fronts from wave one is not three times the enemy — the wave table
   * is split between them — but it is three places to be at once with a
   * wave-one purse, and the opening becomes a lottery over which gate you
   * guessed. Opening them one at a time gives the player the same few waves to
   * find their feet that a one-road map does, and turns the map into a
   * question of what to abandon as the war widens.
   */
  fromWave?: number;
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
  /** One line for the map chooser: what playing this ground is like. */
  blurb: string;
  /**
   * True once the wave table has actually been balanced against this ground.
   * The chooser says so, because a route with different junctions is a
   * different game however similar the numbers look.
   */
  balanced: boolean;
  /** World size in game units. The canvas is scaled to fit this. */
  width: number;
  height: number;
  /** Route corner points. The first and last sit off-screen so creeps walk in and out. */
  waypoints: Vec2[];
  /** Half-width of the walkable road; towers may not be built inside it. */
  pathRadius: number;
  /** Side trails that enter from elsewhere on the map edge and rejoin the main road. */
  trails: TrailDef[];
  /**
   * Further ways in, each with its own gate. The map's `waypoints` are the
   * first route; these are the rest. A map with none is the ordinary
   * one-road-one-gate case.
   */
  routes?: RouteDef[];
  /**
   * How the ground is painted and, with it, how it plays.
   *
   * `meadow` is the original: grass, and a road drawn on it that towers must
   * keep clear of. `sand` is open desert — no road is drawn at all, because
   * there is nothing to draw. The enemy crosses it wherever it likes and the
   * only ground worth standing on is the hills.
   */
  terrain?: 'meadow' | 'sand';
  /**
   * Where towers may be built. When a map declares hills, they are the *only*
   * buildable ground and the road-clearance rule does not apply — the two
   * rules are alternatives, not layers.
   */
  hills?: HillDef[];
  /** Where a gatehouse may be walled in. Only used by maps with hills. */
  chokes?: ChokeDef[];
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
  blurb: 'Open pasture and a road with four long straights. The ground everything was tuned on.',
  balanced: true,
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
    blocks: [{ left: 1010, top: 430, bottom: 705, gates: [{ y: 565, half: 30 }], town: true }],
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

/**
 * The second ground: the same city in the same corner, a completely different
 * road to it.
 *
 * The city is deliberately identical — same walls, same plots, same market, and
 * the route still arrives at the gate from due west. That corner of the drawing
 * is composed by hand around those coordinates, and a map is its *route*
 * anyway: where the road runs is what a tower defence map actually is.
 *
 * Where the Meadow gives you four long straights, the Hollow Way coils. The
 * road enters from the north, doubles back on itself twice, and its two halves
 * run within a hundred units of each other down the middle of the board — so a
 * cluster placed in that corridor covers two stretches of road at once, which
 * is the strongest thing you can do here and has no equivalent on the Meadow.
 * The price is that the junctions are meaner: the northern lane joins barely a
 * sixth of the way along, ahead of almost anything you can afford early.
 */
export const HOLLOW_WAY: MapDef = {
  id: 'hollow-way',
  name: 'The Hollow Way',
  blurb: 'A coiling sunken road that doubles back on itself. One good cluster can cover two stretches.',
  balanced: false,
  width: 1280,
  height: 720,
  waypoints: [
    { x: 170, y: -50 },
    { x: 170, y: 150 },
    { x: 600, y: 150 },
    { x: 600, y: 320 },
    { x: 330, y: 320 },
    { x: 330, y: 560 },
    { x: 700, y: 560 },
    { x: 700, y: 240 },
    { x: 860, y: 240 },
    { x: 860, y: 565 },
    // Same approach to the same gate as every other map.
    { x: 1010, y: 565 },
  ],
  pathRadius: 28,
  trails: [
    {
      // Off the northern moor onto the first straight — about a sixth of the
      // way along, which is early enough to hurt.
      id: 'moor-lane',
      waypoints: [
        { x: 350, y: -40 },
        { x: 350, y: 40 },
        { x: 400, y: 150 },
      ],
    },
    {
      // Down the old mill track from the west, joining the road where it turns
      // south for the second time.
      id: 'mill-track',
      waypoints: [
        { x: -50, y: 470 },
        { x: 90, y: 470 },
        { x: 200, y: 440 },
        { x: 330, y: 440 },
      ],
    },
    {
      // Up out of the fen, onto the long southern straight.
      id: 'fen-path',
      waypoints: [
        { x: 620, y: 760 },
        { x: 620, y: 660 },
        { x: 560, y: 560 },
      ],
    },
  ],
  obstacles: [
    { x: 745, y: 380, w: 70, h: 110 },
    { x: 400, y: 380, w: 140, h: 100 },
    { x: 210, y: 190, w: 100, h: 80 },
    { x: 900, y: 90, w: 130, h: 80 },
  ],
  grass: '#4a6141',
  grassAlt: '#3a4f33',
  grassLight: '#63795a',
  road: '#9b8a6d',
  roadEdge: '#63533a',
  rock: '#5d6068',

  // Identical to the Meadow's: the city is the same city.
  castle: {
    blocks: [{ left: 1010, top: 430, bottom: 705, gates: [{ y: 565, half: 30 }], town: true }],
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

/**
 * The third ground, and the first that is not a road at all.
 *
 * Open sand from edge to edge. Nothing is drawn for the enemy to walk along
 * because it does not walk along anything: three broad fronts cross the desert
 * from the west, each making for one of the three gates in the city's wall, and
 * each spreads across a band far wider than any road on the other maps. You do
 * not defend a line here, you defend three of them.
 *
 * **Towers may only be built on the hills.** Sand takes no foundation, and it
 * is the whole design of the map: the hills are where the defence can be, so
 * where they sit decides what can be covered. Several of them sit between two
 * routes and cover both; several cover one and nothing else. Choosing which
 * hills to hold is the game.
 *
 * The city is the same city, in two pieces. The north-east corner is the walled
 * quarter with the town in it, exactly as on the other maps. The rest is a
 * narrow strip of curtain wall running south along the map edge with nothing
 * behind it but a yard — the two southern gates are ways in and nothing more.
 */
export const DUNE_THRONE: MapDef = {
  id: 'dune-throne',
  name: 'Sand of the Three Gates',
  blurb: 'Open desert, no roads, three gates. Towers stand only on the hills — pick which fronts they cover.',
  balanced: false,
  width: 1280,
  height: 720,
  terrain: 'sand',

  /*
   * The three fronts, each given only two points: where it walks on to the
   * board, and the gate it is making for. **The way between is found through
   * the sand**, because the hills here are solid ground that has to be walked
   * around rather than over.
   *
   * That is deliberate and it is the whole reason this map can be edited. Move
   * a patch, add one, cut one in half, and the fronts re-route themselves the
   * next time the map is loaded. Nothing here has to be kept in step with the
   * shapes above by hand.
   */
  waypoints: [
    { x: -60, y: 170 },
    { x: 1190, y: 360 },
  ],
  pathRadius: 66,
  trails: [],
  routes: [
    {
      // The middle front, opening once the player has had a few waves to get
      // a defence up.
      id: 'middle',
      waypoints: [
        { x: -60, y: 400 },
        { x: 1190, y: 500 },
      ],
      radius: 68,
      fromWave: 4,
    },
    {
      // The southern front: the last of the three, and the one that decides
      // whether the realm has overreached.
      id: 'south',
      waypoints: [
        { x: -60, y: 640 },
        { x: 1190, y: 640 },
      ],
      radius: 64,
      fromWave: 7,
    },
  ],

  /*
   * The hills. Drawn as overlapping circles so a run of them reads as one
   * ridge — which is also exactly how the build test works: a spot is
   * buildable if it is inside any circle, so a chain of them is one continuous
   * piece of ground with no seams to fall down.
   *
   * Roughly a third sit between two fronts. Those are the valuable ones.
   */
  /*
   * Traced from the sketch this map was drawn from, patch by patch.
   *
   * Most are outlines rather than circles, because the drawn shapes are not
   * round: fingers hang from the top and bottom edges, lobes reach in from the
   * west, and the big masses have bays bitten out of them. The sand left
   * between them is what the enemy walks through, so the gaps are as much a
   * part of the drawing as the patches.
   *
   * Coordinates are the sketch's, scaled to the board. Where a patch ran off
   * the paper it runs off the map, which is what makes those ones read as
   * ground continuing past the edge rather than as islands.
   */
  hills: [
    // --- Hanging from the top edge, west to east.

    // Top left corner.
    { points: [
      { x: 0, y: -20 }, { x: 120, y: -20 }, { x: 150, y: 58 },
      { x: 150, y: 118 }, { x: 96, y: 158 }, { x: 90, y: 148 },
      { x: 0, y: 140 },
    ] },

    // The broad one, with a bay bitten out of its underside.
    { points: [
      { x: 225, y: -20 }, { x: 580, y: -20 }, { x: 560, y: 48 },
      { x: 520, y: 96 }, { x: 515, y: 105 }, { x: 525, y: 122 },
      { x: 532, y: 130 }, { x: 525, y: 135 }, { x: 480, y: 140 }, 
      { x: 440, y: 80 }, { x: 430, y: 90 }, { x: 380, y: 80 },
      { x: 300, y: 95}, { x: 280, y: 70 }, { x: 250, y: 60 },
    ] },

    // The long finger, the deepest of them.
    { points: [
      { x: 688, y: -20 }, { x: 1000, y: -20 }, { x: 784, y: 74 },
      { x: 758, y: 136 }, { x: 718, y: 182 }, { x: 682, y: 156 },
      { x: 676, y: 82 },
    ] },

    // --- The ring: a rim of high ground around a hollow of sand.
    { x: 345, y: 200, r: 80 },

    // --- The west, between the first and second fronts.

    // Long spur running south, and the lobe reaching in from the west edge.
    { points: [
      { x: 40, y: 168 }, { x: 232, y: 196 }, { x: 236, y: 262 },
      { x: 208, y: 318 }, { x: 166, y: 304 }, { x: 156, y: 246 },
      { x: 162, y: 198 },
    ] },

    { points: [
      { x: -20, y: 206 }, { x: 42, y: 214 }, { x: 45, y: 256 },
      { x: 40, y: 302 }, { x: 8, y: 306 }, { x: -20, y: 272 },
    ] },

    // A knoll on its own, and the round island south of the ring.
    { x: 406, y: 360, r: 60 },

    // --- The great central mass. Lobed, and the one piece of ground that
    // reaches both the first and second fronts, which makes it the best on
    // the map.
    { points: [
      { x: 598, y: 252 }, { x: 682, y: 236 }, { x: 762, y: 264 },
      { x: 812, y: 316 }, { x: 788, y: 378 }, { x: 716, y: 402 },
      { x: 646, y: 426 }, { x: 592, y: 388 }, { x: 566, y: 318 },
    ] },

    // --- Reaching towards the wall, between the gates.
    { points: [
      { x: 922, y: 300 }, { x: 1000, y: 292 }, { x: 1078, y: 312 },
      { x: 1072, y: 352 }, { x: 984, y: 362 }, { x: 922, y: 344 },
    ] },
    { points: [
      { x: 930, y: 462 }, { x: 1008, y: 452 }, { x: 1086, y: 474 },
      { x: 1080, y: 516 }, { x: 992, y: 528 }, { x: 930, y: 508 },
    ] },
    { points: [
      { x: 950, y: 622 }, { x: 1028, y: 612 }, { x: 1092, y: 634 },
      { x: 1086, y: 676 }, { x: 998, y: 688 }, { x: 946, y: 666 },
    ] },

    // --- The south-west: a lobe off the west edge and a big lobed mass.
    { points: [
      { x: -20, y: 418 }, { x: 66, y: 412 }, { x: 138, y: 452 },
      { x: 122, y: 510 }, { x: 42, y: 526 }, { x: -20, y: 502 },
    ] },
    { points: [
      { x: 198, y: 466 }, { x: 282, y: 450 }, { x: 354, y: 486 },
      { x: 376, y: 546 }, { x: 322, y: 602 }, { x: 238, y: 620 },
      { x: 180, y: 578 }, { x: 168, y: 512 },
    ] },

    // The round island in the middle of the south.
    { x: 452, y: 506, r: 46 },

    // The long mass east of it.
    { points: [
      { x: 606, y: 482 }, { x: 698, y: 466 }, { x: 782, y: 492 },
      { x: 804, y: 542 }, { x: 742, y: 586 }, { x: 658, y: 592 },
      { x: 596, y: 546 },
    ] },

    // --- Rising from the bottom edge.
    { points: [
      { x: 380, y: 740 }, { x: 468, y: 740 }, { x: 476, y: 664 },
      { x: 442, y: 610 }, { x: 392, y: 626 }, { x: 366, y: 682 },
    ] },
    { points: [
      { x: 618, y: 740 }, { x: 706, y: 740 }, { x: 712, y: 672 },
      { x: 668, y: 622 }, { x: 620, y: 658 },
    ] },
    { points: [
      { x: 838, y: 740 }, { x: 924, y: 740 }, { x: 930, y: 664 },
      { x: 884, y: 616 }, { x: 838, y: 656 },
    ] },
  ],

  // No `chokes` listed: the places a wall can go are the tightest points of
  // each front, found in the ground itself. Naming them by hand meant that
  // moving a hill left a gap on offer that no longer existed.

  // Sand has no boulders to speak of; a couple of rock outcrops for the eye.
  // Both sit clear of the fronts and of every choke.
  obstacles: [
    { x: 760, y: 40, w: 90, h: 55 },
    { x: 250, y: 680, w: 110, h: 40 },
  ],

  // Sun-bleached sand rather than grass: the same three slots, read as dune,
  // shadow and glare.
  grass: '#c9ab72',
  grassAlt: '#ad8d58',
  grassLight: '#e0c795',
  road: '#c2a068',
  roadEdge: '#a08350',
  rock: '#8a7a63',

  /*
   * The city: a walled quarter in the north-east corner with the plots in it,
   * and a strip of curtain wall running south from it down the map edge.
   *
   * **Every gate is on the strip.** The quarter is sealed — the enemy has no
   * business up there and a gate in its west wall would be a fourth way in
   * that nothing is making for. All three fronts arrive on the one stretch of
   * wall, which is what the sketch shows and what makes the three gates read
   * as one defence problem rather than three unrelated ones.
   *
   * There is no royal hall here (`hall: false`) and the strip is deliberately
   * shallow: this city is walls and gates, with just enough yard behind them
   * to look inhabited.
   */
  castle: {
    hall: false,
    blocks: [
      // The walled quarter. No gate at all — the plots live here, nothing more.
      { left: 1040, top: -30, bottom: 250, gates: [], town: true },
      // The strip, carrying all three gates. Its west wall is the whole
      // defence, and there is little behind it.
      {
        left: 1190,
        top: 250,
        bottom: 750,
        /*
         * Spaced so no two drum towers touch. Each gate carries one either
         * side at 46 from its middle with a radius of 20, and the corner tower
         * at the step has a radius of 23 — so the first gate has to sit at
         * least 90 below the top of the strip, and the gates at least 92 apart.
         */
        gates: [
          { y: 360, half: 30 },
          { y: 500, half: 30 },
          { y: 640, half: 30 },
        ],
      },
    ],
    market: { x: 1160, y: 182 },
    // All well clear of the west wall, which is 24 thick from x=1040.
    lots: [
      { id: 'house-1', x: 1100, y: 40, accepts: 'house' },
      { id: 'house-2', x: 1163, y: 40, accepts: 'house' },
      { id: 'house-3', x: 1226, y: 40, accepts: 'house' },
      { id: 'farm-1', x: 1102, y: 110, accepts: 'farm' },
      { id: 'farm-2', x: 1226, y: 110, accepts: 'farm' },
      { id: 'hall-1', x: 1164, y: 110, accepts: 'research' },
    ],
  },
};

export const MAPS: MapDef[] = [CLASSIC_MEADOW, HOLLOW_WAY, DUNE_THRONE];

export const DEFAULT_MAP: MapDef = CLASSIC_MEADOW;

/** Look a map up by id, falling back to the default rather than throwing. */
export function mapById(id: string): MapDef {
  return MAPS.find((m) => m.id === id) ?? DEFAULT_MAP;
}
