import type { ArmorType } from './armor';
import type { DamageType } from './towers';

export interface CreepDef {
  id: string;
  name: string;
  /** What it wears. Decides how much each attack type actually hurts it. */
  armor: ArmorType;
  /** Hit points at wave 1. */
  maxHp: number;
  /** World units travelled per second along the route. */
  speed: number;
  /** Damage per second dealt to a gate blocking the road. */
  siege: number;
  /** Damage dealt per blow to a defender fighting it hand to hand. */
  melee: number;
  /** What kind of blow it lands, so the defender's armour matters. */
  meleeType: DamageType;
  /** Blows per second against a defender. */
  attackSpeed: number;
  /** Gold paid out when killed. */
  bounty: number;
  /** Lives lost if it reaches the keep. */
  leak: number;
  /** Drawing radius in world units. */
  radius: number;
  /** How the renderer draws it. */
  visual?:
    | 'blob'
    | 'hound'
    | 'pikeman'
    | 'shieldman'
    | 'peasant'
    | 'knight'
    | 'swordknight'
    | 'assassin'
    | 'lancerider'
    | 'mountedknight'
    | 'marauder'
    | 'ram'
    | 'bowman'
    | 'stoneslinger'
    | 'flailknight';
  color: string;
  outline: string;
  /**
   * A dog or swordsman holding this creep does not actually stop it — it
   * keeps advancing (and can still be hit and can still hit back) rather
   * than being pinned in place.
   */
  ignoresBlock?: boolean;
  /**
   * Never turns to face whatever is attacking it — it just keeps pointing
   * up the road. For things that do not fight back at all.
   */
  neverTurns?: boolean;
  /** Damage dealt to every defender near this creep's position when it dies. */
  deathBlastDamage?: number;
  deathBlastRadius?: number;
  /**
   * When this creep dies (not when it leaks past — only when it is actually
   * destroyed), this many of the named creep spawn at its position and
   * continue the march on foot. `creepId` is a plain string rather than
   * `CreepId` to avoid a circular type — it is looked up the same way.
   */
  spawnOnDeath?: { creepId: string; count: number };

  /**
   * Shoots at the defence rather than only fighting whatever grabs it.
   *
   * It halts to shoot, which is the whole trade: a besieger that stops is not
   * advancing. Only *emplacements that shoot back* are targets — see
   * `Game.bombardTowers` for why that restriction is deliberate rather than
   * arbitrary.
   */
  bombard?: {
    range: number;
    /** Damage per shot, before the target's armour is applied. */
    damage: number;
    type: DamageType;
    /** Shots per second. */
    rate: number;
  };

  /**
   * Swings something heavy on a timer, hurting every defender within reach —
   * fighters, dogs and emplacements alike. Unlike `bombard` this never stops
   * it walking; it lashes out as it goes.
   */
  sweep?: {
    radius: number;
    damage: number;
    type: DamageType;
    /** Seconds between swings. */
    interval: number;
  };
}

/**
 * Speeds are deliberately kept in a narrow band (roughly 40–90). A wide
 * spread meant the quick enemies of a wave arrived alone, died alone, and
 * the slow ones turned up afterwards to be killed at leisure — the wave
 * fought the defence in installments instead of all at once. Wave delays in
 * `waves.ts` do the rest: the slowest groups are sent first so everything
 * converges on the defence together.
 */
export const CREEPS = {
  /**
   * The weakest thing that walks the road: a levied farmer with a pitchfork,
   * no armour to speak of. Cheap fodder, meant to die to almost anything.
   */
  peasant: {
    id: 'peasant',
    name: 'Peasant',
    armor: 'unarmored',
    maxHp: 24,
    speed: 62,
    siege: 6,
    melee: 5,
    meleeType: 'pierce',
    attackSpeed: 0.7,
    bounty: 5,
    leak: 1,
    // Sized to match the pikeman/shieldman rather than read as a lesser blob.
    radius: 13,
    visual: 'peasant',
    color: '#a89468',
    outline: '#4a3f22',
  },
  /** The plain vanilla opponent: a rank-and-file pikeman. */
  grunt: {
    id: 'grunt',
    name: 'Pikeman',
    armor: 'light',
    maxHp: 64,
    speed: 55,
    siege: 15,
    melee: 13,
    meleeType: 'pierce',
    attackSpeed: 0.8,
    bounty: 8,
    leak: 1,
    // Sized to read alongside a swordsman post (radius 13) rather than the
    // other, smaller creeps.
    radius: 13,
    visual: 'pikeman',
    color: '#8c9a52',
    outline: '#3f4a1e',
  },
  /**
   * A pikeman with a shield on the off arm: medium armour and more health
   * for it, at the cost of nothing else — still the same pike, same pace.
   */
  shieldman: {
    id: 'shieldman',
    name: 'Shieldbearer',
    armor: 'medium',
    maxHp: 100,
    speed: 50,
    siege: 16,
    melee: 13,
    meleeType: 'pierce',
    attackSpeed: 0.8,
    bounty: 13,
    leak: 1,
    radius: 13,
    visual: 'shieldman',
    color: '#6f7a8c',
    outline: '#2c3340',
  },
  /** Enemy war dogs: quick and flimsy, but they bite hard and often. */
  hound: {
    id: 'hound',
    name: 'Feral Hound',
    armor: 'unarmored',
    maxHp: 46,
    speed: 88,
    siege: 5,
    melee: 11,
    meleeType: 'pierce',
    attackSpeed: 1.5,
    bounty: 12,
    leak: 1,
    radius: 9,
    visual: 'hound',
    color: '#6b5240',
    outline: '#2e241a',
  },
  /**
   * Light armour, high burst melee, very little health — a raider built to
   * savage whatever is holding it before it dies to almost anything.
   */
  assassin: {
    id: 'assassin',
    name: 'Assassin',
    armor: 'light',
    maxHp: 32,
    speed: 72,
    siege: 10,
    melee: 26,
    meleeType: 'slash',
    attackSpeed: 1.3,
    bounty: 16,
    leak: 1,
    radius: 10,
    visual: 'assassin',
    color: '#2b262a',
    outline: '#0c0a0b',
  },
  /**
   * A rider on a fast horse: light armour, a couched lance, and — thanks to
   * the horse under him — more health than a foot soldier in the same
   * armour would have.
   */
  lancerider: {
    id: 'lancerider',
    name: 'Lance Rider',
    armor: 'light',
    maxHp: 92,
    speed: 85,
    siege: 18,
    melee: 18,
    meleeType: 'pierce',
    attackSpeed: 0.9,
    bounty: 19,
    leak: 2,
    radius: 13,
    visual: 'lancerider',
    color: '#8a6a3a',
    outline: '#3a2a12',
  },
  /**
   * The strongest common infantry: full plate and a warhammer. Tankier and
   * harder-hitting than anything else on foot, and slow with it.
   */
  knight: {
    id: 'knight',
    name: 'Warhammer Knight',
    armor: 'heavy',
    maxHp: 260,
    speed: 44,
    siege: 34,
    melee: 46,
    meleeType: 'blunt',
    attackSpeed: 0.55,
    bounty: 35,
    leak: 3,
    radius: 14,
    visual: 'knight',
    color: '#6b7078',
    outline: '#24262c',
  },
  /**
   * The warhammer knight's counterpart: same plate, same toughness, but a
   * sword and shield instead — cuts rather than crushes.
   */
  swordknight: {
    id: 'swordknight',
    name: 'Knight',
    armor: 'heavy',
    maxHp: 245,
    speed: 46,
    siege: 30,
    melee: 42,
    meleeType: 'slash',
    attackSpeed: 0.6,
    bounty: 33,
    leak: 3,
    radius: 14,
    visual: 'swordknight',
    color: '#3d5a8a',
    outline: '#161c2c',
  },
  /**
   * A knight mounted rather than on foot: the tankiest thing on the road by
   * raw health, but the horse and his own bulk carry the weight rather than
   * a full harness, so he only fights at medium armour.
   */
  mountedknight: {
    id: 'mountedknight',
    name: 'Mounted Knight',
    armor: 'medium',
    maxHp: 330,
    speed: 72,
    siege: 36,
    melee: 36,
    meleeType: 'slash',
    attackSpeed: 0.65,
    bounty: 38,
    leak: 4,
    radius: 15,
    visual: 'mountedknight',
    color: '#5c5a58',
    outline: '#201f1e',
  },
  /**
   * Unarmoured and built to get through: a dog or swordsman holding it does
   * not actually slow it down, and dying next to a defender still hurts
   * them on the way out. Its real threat is what it does to the castle if
   * nothing stops it outright.
   */
  marauder: {
    id: 'marauder',
    name: 'Marauder',
    armor: 'unarmored',
    maxHp: 46,
    speed: 78,
    siege: 18,
    melee: 10,
    meleeType: 'slash',
    attackSpeed: 1.0,
    bounty: 14,
    leak: 5,
    radius: 10,
    visual: 'marauder',
    color: '#7a5a3a',
    outline: '#2c1c0e',
    ignoresBlock: true,
    deathBlastDamage: 18,
    deathBlastRadius: 34,
  },
  /**
   * An enemy bowman. He stops when your shooting emplacements come within
   * reach and puts arrows into them instead of walking on.
   *
   * He is not a threat by damage — he is a threat by *making you spend*. A
   * line of crossbows with nothing behind it will be whittled down; the same
   * line with a hospital covering it will not. Flimsy, and anything that gets
   * to him kills him.
   */
  bowman: {
    id: 'bowman',
    name: 'Bowman',
    armor: 'unarmored',
    maxHp: 40,
    speed: 58,
    siege: 6,
    melee: 7,
    meleeType: 'slash',
    attackSpeed: 0.8,
    bounty: 15,
    leak: 1,
    radius: 12,
    visual: 'bowman',
    color: '#6d7a4a',
    outline: '#2c331a',
    // Deliberately a slow grind rather than a burst. At 14 damage per shot,
    // three of them levelled an unprotected crossbowman inside a single wave,
    // which is not "you should think about a hospital", it is "your building
    // is gone". This whittles instead.
    bombard: { range: 165, damage: 9, type: 'pierce', rate: 0.6 },
  },

  /**
   * A slinger with a sack of stones. Shorter reach than the bowman and slower
   * to loose, but blunt — so it is the one that actually threatens a catapult
   * or a rock thrower rather than merely annoying a crossbowman.
   */
  stoneslinger: {
    id: 'stoneslinger',
    name: 'Stone Slinger',
    armor: 'light',
    maxHp: 58,
    speed: 54,
    siege: 12,
    melee: 9,
    meleeType: 'blunt',
    attackSpeed: 0.7,
    bounty: 17,
    leak: 1,
    radius: 12,
    visual: 'stoneslinger',
    color: '#7a6a52',
    outline: '#332a1c',
    bombard: { range: 130, damage: 18, type: 'blunt', rate: 0.4 },
  },

  /**
   * The morning star: a knight in full harness who does not stop for anybody.
   *
   * Nothing holds him — he walks through a pike line as if it were not there —
   * and every few seconds he swings the flail, crushing every defender around
   * him at once, emplacements included. Blunt, so armour is no answer, and
   * heavy harness, so pierce is no answer either. What he *is* answerable to
   * is weight of numbers and fire, and to being killed before he arrives.
   *
   * He turns up twice in the campaign, at waves 10 and 20.
   */
  flailknight: {
    id: 'flailknight',
    name: 'Morningstar Knight',
    armor: 'heavy',
    maxHp: 700,
    speed: 40,
    siege: 60,
    // He never duels; the flail does all his work, so his melee is nothing.
    melee: 0,
    meleeType: 'blunt',
    attackSpeed: 0.5,
    bounty: 120,
    leak: 8,
    radius: 20,
    visual: 'flailknight',
    color: '#4a4650',
    outline: '#1a181e',
    ignoresBlock: true,
    // Enough to make standing next to him a mistake, not enough to erase a
    // line on one pass. At 46 every 2.2s he killed six pikemen in sixteen
    // seconds, which left nothing to decide — you had already lost them before
    // you could react.
    sweep: { radius: 76, damage: 34, type: 'blunt', interval: 2.6 },
  },

  /**
   * A battering ram: a wooden mantlet on wheels carrying six pikemen. Heavy
   * armour gives it a lot of natural resistance to anything but brute
   * force, it is never held in place, it never turns to face an attacker and
   * it never strikes one — it is a rolling shield for the men underneath,
   * nothing more. Against a gate it is exactly what it looks like, so it
   * still carries heavy siege damage. Break it and the escort spills out and
   * keeps marching on foot.
   */
  ram: {
    id: 'ram',
    name: 'Battering Ram',
    armor: 'heavy',
    maxHp: 420,
    speed: 34,
    siege: 70,
    melee: 0,
    meleeType: 'blunt',
    attackSpeed: 0.5,
    bounty: 50,
    leak: 6,
    radius: 26,
    visual: 'ram',
    color: '#5a4426',
    outline: '#241a0c',
    ignoresBlock: true,
    neverTurns: true,
    spawnOnDeath: { creepId: 'grunt', count: 6 },
  },
} as const satisfies Record<string, CreepDef>;

export type CreepId = keyof typeof CREEPS;
