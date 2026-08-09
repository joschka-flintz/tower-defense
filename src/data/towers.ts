/**
 * Tower stat tables. Adding a new tower type = adding an entry here.
 * No game logic lives in this file.
 */

import type { ArmorType } from './armor';

/**
 * What kind of harm an attack does. How much of it lands depends on what the
 * target is wearing — see the matrix in `armor.ts`.
 *
 * - `slash`  — blades and teeth: swords, the houndmaster's dogs
 * - `pierce` — pointed shot: bows and crossbows
 * - `fire`   — burning ammunition and the ground it leaves alight
 * - `blunt`  — sheer weight: catapult stones, sledgehammers
 */
export type DamageType = 'slash' | 'pierce' | 'fire' | 'blunt';

/** Human-readable label for a damage type. */
export const DAMAGE_LABEL: Record<DamageType, string> = {
  slash: 'Slash',
  pierce: 'Pierce',
  fire: 'Fire',
  blunt: 'Blunt',
};

/** Every number a placed tower actually runs on, after upgrades are applied. */
export interface TowerStats {
  /** Targets are acquired within this radius, measured from the tower centre. */
  range: number;
  damage: number;
  /** Shots per second. */
  fireRate: number;
  /** World units per second for the fired projectile. */
  projectileSpeed: number;
  /** Radians per second the turret can swivel. */
  turnSpeed: number;
  /** Chance from 0 to 1 that a shot connects. Area weapons sit at 1. */
  accuracy: number;
  /** Damage is dealt to everything within this radius of the impact. 0 = single target. */
  splashRadius: number;
  damageType: DamageType;
  /** Drawn size of the projectile. */
  projectileRadius: number;
  /** Ground fire left behind on impact. 0 duration means none. */
  burnDps: number;
  burnDuration: number;
  burnRadius: number;
  /** Fire left burning on the struck creep itself. 0 duration means none. */
  igniteDps: number;
  igniteDuration: number;
  /** How many people are drawn working the engine. */
  crew: number;
  /** 0 stands on the ground, 1 stands on a raised wooden platform. */
  elevated: number;
  /** Gatehouses: how much punishment the gate itself can take. */
  gateHp: number;
  /** Melee towers: how many fighters the tower sends out. */
  units: number;
  /** Hit points of each fighter. Unlike a dog's stamina, this can be healed. */
  unitHp: number;
  unitDps: number;
  unitSpeed: number;
  /** Health fraction at which a fighter breaks off and seeks a hospital. */
  retreatAt: number;
  /** Hospitals: hit points restored per second to a wounded fighter. */
  healRate: number;
  /**
   * Buildings that can be shot at: how much punishment the emplacement itself
   * takes before it is wrecked. 0 means nothing can hurt it.
   */
  buildingHp: number;
  /**
   * Health per second a building mends under its own crew, with no hospital
   * involved. Only the siege engines have a crew that can do it.
   */
  selfRepair: number;
  /** Whirlwind attack: area damage on a timer. 0 damage means untrained. */
  whirlwindDamage: number;
  whirlwindRadius: number;
  whirlwindInterval: number;
  /** What the tower's own fighters wear. */
  armor: ArmorType;
  /** People this building houses. Only houses have any. */
  houseCapacity: number;
  /** Food this building brings in each wave. Only farms have any. */
  foodOutput: number;
  /** Harvest kept safe from crows, as a fraction. */
  crowProtection: number;
  /** Hound towers: how many dogs this tower may have at once. */
  dogs: number;
  /** Hit points of a single dog. Enemies bite back. */
  dogHp: number;
  /** Damage per second a dog deals while fighting. */
  dogDps: number;
  /** How fast a dog runs, in world units per second. */
  dogSpeed: number;
}

/**
 * One purchasable improvement. Upgrades are independent by default: list them
 * in any order and buy them in any order. Use `requires` to chain one behind
 * another, and `requiresTech` to gate one behind a researched technology.
 */
export interface TowerUpgrade {
  id: string;
  name: string;
  description: string;
  cost: number;
  stats: Partial<TowerStats>;
  /** Other upgrade ids on this same tower that must be bought first. */
  requires?: readonly string[];
  /** A technology that must be researched first. */
  requiresTech?: string;
}

export interface TowerDef {
  id: string;
  name: string;
  /** One-line pitch shown in the build panel. */
  blurb: string;
  cost: number;
  /** Footprint radius: blocks placement and defines the drawn base. */
  radius: number;
  /** How this tower hurts things. 'none' is a support building. */
  attack: 'projectile' | 'hound' | 'melee' | 'none';
  /**
   * Which sprite the renderer draws for this tower. For a melee post this also
   * picks the figure drawn for the fighters it sends onto the road — the post
   * itself is just an empty stand once they have marched off.
   */
  visual:
    | 'archer'
    | 'crossbow'
    | 'catapult'
    | 'houndmaster'
    | 'research'
    | 'gatehouse'
    | 'rock-thrower'
    | 'hot-oil'
    | 'swordsman'
    | 'pikeman'
    | 'heavy-knight'
    | 'mounted-knight'
    | 'men-at-arms'
    | 'sword-knight'
    | 'lancer'
    | 'flail-guard'
    | 'hospital'
    | 'house'
    | 'farm';
  /** Colour used for the shop swatch and the placement ghost. */
  baseColor: string;
  /** 'ground' must stay clear of the road; 'path' must sit on it. */
  placement?: 'ground' | 'path';
  /** A technology that must be researched before this can be built at all. */
  requiresTech?: string;

  range: number;
  turnSpeed: number;

  // Projectile towers only.
  damage?: number;
  fireRate?: number;
  projectileSpeed?: number;
  projectileShape?: 'arrow' | 'boulder' | 'flail';
  /**
   * A lobbed shot, aimed at a patch of ground rather than at the enemy: it
   * lands where it was aimed whatever the target does afterwards, so quick
   * enemies can walk out from under it.
   */
  ballistic?: boolean;
  projectileRadius?: number;
  accuracy?: number;
  splashRadius?: number;
  damageType?: DamageType;
  crew?: number;

  /** Gatehouses only. */
  gateHp?: number;

  // Hound towers only.
  dogs?: number;
  dogHp?: number;
  dogDps?: number;
  dogSpeed?: number;

  /** What this tower's own fighters wear, if it has any. */
  armor?: ArmorType;

  /** People it takes to man this building. Support buildings cost none. */
  housing?: number;
  /** Food eaten every wave. Farms eat nothing. */
  food?: number;
  /** Houses only: how many people it shelters. */
  houseCapacity?: number;
  /** Farms only: food harvested each wave. */
  foodOutput?: number;
  crowProtection?: number;

  // Melee towers and hospitals.
  units?: number;
  unitHp?: number;
  unitDps?: number;
  unitSpeed?: number;
  retreatAt?: number;
  healRate?: number;

  /** Shootable buildings: how much the emplacement itself can take. */
  buildingHp?: number;
  /** Health per second the crew mends unaided. Siege engines only. */
  selfRepair?: number;

  readonly upgrades: readonly TowerUpgrade[];
}

export const TOWERS = {
  archer: {
    id: 'archer',
    name: 'Archer',
    housing: 1,
    food: 1,
    blurb: 'Cheap, long reach, light damage. Build lots.',
    cost: 30,
    radius: 13,
    attack: 'projectile',
    visual: 'archer',
    baseColor: '#6a6a4a',
    range: 185,
    turnSpeed: 9,
    // Steady, deliberate shots. The archer's edge is reach: a long arc means
    // every enemy spends far longer under fire than a short-ranged tower can
    // manage, which is what its damage per shot is balanced around.
    damage: 16,
    fireRate: 0.85,
    projectileSpeed: 520,
    projectileShape: 'arrow',
    projectileRadius: 3,
    accuracy: 0.82,
    damageType: 'pierce',
    // Shootable, and with nothing to hide behind.
    buildingHp: 160,
    armor: 'unarmored',
    upgrades: [
      {
        id: 'platform',
        name: 'Shooting Platform',
        description:
          'A timber scaffold to shoot from. Range 185 to 250, a steadier aim, and a clearer line to loose from.',
        cost: 70,
        stats: { range: 250, accuracy: 0.88, fireRate: 1, elevated: 1 },
      },
      {
        id: 'strongbow',
        name: 'Yew Longbow',
        description: 'Heavier draw weight. Damage 16 to 30.',
        cost: 65,
        stats: { damage: 30 },
      },
      {
        id: 'bodkin',
        name: 'Bodkin Points',
        description:
          'Needle-headed shafts made to punch through mail. Damage 30 to 40 — the answer to armour the longbow alone glances off.',
        cost: 105,
        requires: ['strongbow'],
        stats: { damage: 40 },
      },
      {
        id: 'fire-arrows',
        name: 'Fire Arrows',
        description:
          'Pitch-soaked heads. Fire damage, and the target keeps burning afterwards. Burns stack twice at most.',
        cost: 90,
        requiresTech: 'fire-projectiles',
        stats: { damageType: 'fire', igniteDps: 7, igniteDuration: 4 },
      },
    ],
  },

  crossbow: {
    id: 'crossbow',
    name: 'Crossbowman',
    housing: 1,
    food: 1,
    blurb: 'Short reach, slow to crank, hits hard.',
    cost: 45,
    radius: 13,
    attack: 'projectile',
    visual: 'crossbow',
    baseColor: '#5d4a38',
    // Was 130. Short is the crossbow's character, but for the Kingdom it is
    // the *only* thing that shoots, standing in for an archer with 185 — and
    // at 130 the nation simply could not put enough time on target to hold the
    // late waves.
    range: 145,
    turnSpeed: 7,
    // One heavy bolt at a time; the crank is the price of the punch. Short
    // reach, so it wants to sit on a corner where the road doubles back.
    //
    // 0.45 was over two and a quarter seconds between bolts, which read as
    // broken rather than as deliberate — you would watch a crossbowman stand
    // idle while a wave walked past him.
    damage: 46,
    fireRate: 0.5,
    projectileSpeed: 620,
    projectileShape: 'arrow',
    projectileRadius: 3,
    accuracy: 0.92,
    damageType: 'pierce',
    // Shootable. A crossbowman works from behind a pavise, which is why he is
    // light armour rather than none, but he is still a man standing in a field.
    buildingHp: 200,
    armor: 'light',
    upgrades: [
      {
        id: 'windlass',
        name: 'Windlass Crank',
        description: 'A geared crank instead of a belt hook. Reloads much faster.',
        cost: 85,
        stats: { fireRate: 0.72 },
      },
      {
        id: 'steel-prod',
        name: 'Steel Prod',
        description: 'A steel bow in place of horn and sinew. Damage 46 to 80.',
        cost: 110,
        stats: { damage: 80 },
      },
      {
        // The Kingdom has no archers, so this is the only way it ever reaches
        // past 130 units. Priced as the significant purchase that makes it.
        id: 'ranging-sight',
        name: 'Ranging Sight',
        description:
          'A notched sight and a rest to shoot from. Range 145 to 195 — still short, but no longer only the corner it stands on.',
        cost: 95,
        stats: { range: 195, accuracy: 0.95 },
      },
      {
        id: 'fire-bolts',
        name: 'Fire Bolts',
        description:
          'Pitch-wrapped bolts. Fire damage, and the target keeps burning afterwards. Burns stack twice at most.',
        cost: 95,
        requiresTech: 'fire-projectiles',
        stats: { damageType: 'fire', igniteDps: 10, igniteDuration: 4 },
      },
    ],
  },

  catapult: {
    id: 'catapult',
    name: 'Catapult',
    housing: 1,
    food: 2,
    blurb: 'Slow arcing stones. Always hits, damages an area.',
    // Was 120, and badly underpriced at it. A catapult never misses, hits a
    // 58-unit circle, and does blunt damage — which is to say it answers a
    // crowd and armour at the same time, the two problems everything else in
    // the roster only solves one of. Once a couple were up the late waves
    // stopped being a fight. The engine is left exactly as strong; it simply
    // has to be earned.
    //
    // The runs are very sensitive here: at 200 they lose from wave 14, at 180
    // they win with about seven lives left — where at 120 they won with
    // seventeen. Seven is the right kind of margin.
    cost: 180,
    radius: 19,
    attack: 'projectile',
    visual: 'catapult',
    baseColor: '#6b4f2f',
    requiresTech: 'advanced-construction',
    range: 210,
    turnSpeed: 3.2,
    damage: 55,
    fireRate: 0.28,
    projectileSpeed: 190,
    projectileShape: 'boulder',
    ballistic: true,
    projectileRadius: 7,
    accuracy: 1,
    splashRadius: 58,
    damageType: 'blunt',
    crew: 1,
    /**
     * A big timber machine with a crew who can mend it. Below `retreatAt` the
     * crew stops shooting and works on the engine instead — that is the whole
     * cost of its self-sufficiency, and it is why an engine under fire is not
     * simply invulnerable.
     */
    buildingHp: 400,
    armor: 'medium',
    selfRepair: 14,
    retreatAt: 0.5,
    upgrades: [
      {
        // Fire and burning ground used to be two purchases, and the first of
        // them alone was a trap: swapping blunt for fire is not an upgrade,
        // it is a sideways move — better against light armour, worse against
        // the heavy targets a catapult is usually aimed at. Nobody should pay
        // 140 gold to make their stones *worse* against knights on the promise
        // of a second upgrade later. One purchase, one clear decision.
        id: 'fire-stones',
        name: 'Burning Pitch',
        description:
          'Stones wrapped in burning pitch. Fire damage instead of blunt — kinder to armour, harsher to everything else — and the pitch keeps burning where it lands, scorching whatever walks through.',
        cost: 300,
        requiresTech: 'fire-projectiles',
        stats: { damageType: 'fire', burnDps: 20, burnDuration: 5, burnRadius: 58 },
      },
      {
        id: 'second-crew',
        name: 'Second Crewman',
        description: 'Two on the windlass. Reloads far quicker. The stone flies no faster.',
        cost: 130,
        stats: { fireRate: 0.46, crew: 2 },
      },
      {
        id: 'carpenters',
        name: "Carpenter's Tools",
        description:
          'Spare timber, rope and a saw kept under the frame. The crew mends the engine more than twice as fast, so it is back in action far sooner.',
        cost: 120,
        stats: { selfRepair: 34 },
      },
      {
        id: 'bigger-stone',
        name: 'Bigger Stone',
        description: 'A heavier boulder. Damage 55 to 95 and a wider blast.',
        cost: 170,
        stats: { damage: 95, splashRadius: 78, projectileRadius: 10 },
      },
    ],
  },

  swordsman: {
    id: 'swordsman',
    name: 'Swordsman',
    housing: 1,
    food: 2,
    blurb: 'Steps onto the road and holds an enemy in place. Can be killed.',
    cost: 60,
    radius: 13,
    attack: 'melee',
    visual: 'swordsman',
    baseColor: '#7c7f86',
    range: 150,
    turnSpeed: 7,
    units: 1,
    unitHp: 220,
    unitDps: 20,
    unitSpeed: 105,
    retreatAt: 0.35,
    armor: 'medium',
    damageType: 'slash',
    upgrades: [
      {
        id: 'chainmail',
        name: 'Chainmail Hauberk',
        description: 'Riveted mail under the surcoat. Health 220 to 380.',
        cost: 90,
        stats: { unitHp: 380 },
      },
      {
        id: 'plate-armour',
        name: 'Plate Armour',
        description:
          'Full harness over the mail. Heavy armour: arrows and blades glance off, but hammers and clubs still tell — and he moves noticeably slower.',
        cost: 150,
        requires: ['chainmail'],
        stats: { armor: 'heavy', unitSpeed: 72 },
      },
      {
        id: 'arming-sword',
        name: 'Arming Sword',
        description: 'A properly forged blade. Damage 20 to 32 per second.',
        cost: 100,
        stats: { unitDps: 32 },
      },
      {
        id: 'whirlwind',
        name: 'Whirling Strike',
        description:
          'A full turn with the blade every 3 seconds, cutting everything within reach rather than just the man in front.',
        cost: 160,
        requires: ['arming-sword'],
        stats: { whirlwindDamage: 26, whirlwindRadius: 52, whirlwindInterval: 3 },
      },
    ],
  },

  /**
   * The cheap body of the Kingdom's line, and the reason a nation with no
   * archers can hold a road at all.
   *
   * A melee post only ever holds *one* enemy at a time, so what a melee-only
   * realm is really buying per coin is hold-points, not damage. The pikeman is
   * built around that: **two** men to a post, each of them flimsy, so 50 gold
   * stops two enemies rather than one. Pierce shreds the unarmoured rabble of
   * the early waves and skids off plate later, which is the whole shape of the
   * unit — bought in numbers early, propped up rather than relied on late.
   *
   * Modelled on the enemy Pikeman (`grunt` in `creeps.ts`) with roughly half
   * again its health each: a post is bought once and must last twenty waves,
   * while an enemy only has to survive the walk.
   */
  pikeman: {
    id: 'pikeman',
    name: 'Pikemen',
    housing: 1,
    food: 1,
    blurb: 'Two spearmen to a post. Cheap hold-points; deadly to the unarmoured, useless against plate.',
    cost: 40,
    radius: 13,
    attack: 'melee',
    visual: 'pikeman',
    baseColor: '#8c7a4a',
    // The pike is why the post covers more road than a swordsman does.
    range: 165,
    turnSpeed: 7,
    units: 2,
    unitHp: 115,
    unitDps: 20,
    unitSpeed: 110,
    // Pulls out earlier than anyone else. He is not built to trade blows, and
    // with a hospital behind him a live pikeman is worth far more than the few
    // seconds of holding he would buy by staying.
    retreatAt: 0.45,
    armor: 'light',
    damageType: 'pierce',
    upgrades: [
      {
        id: 'brigandine',
        name: 'Brigandine',
        description:
          'Steel plates riveted inside a canvas coat. Health 95 to 165 each — still light armour, so pierce and blades still find them.',
        cost: 80,
        stats: { unitHp: 165 },
      },
      {
        // Was 150, which was simply a bad deal: 150 gold buys three whole new
        // posts — six men — instead of one extra man here. It has to be priced
        // against a *pikeman*, not against what an upgrade "usually" costs.
        // What it still charges a premium for is real, though: the third man
        // needs no housing and no food of his own, and he stands where you
        // already decided you wanted men.
        id: 'third-file',
        name: 'Third File',
        description:
          'Pikes work in ranks. A third man holds the post with them, with his own health — and he needs no housing or food of his own.',
        cost: 80,
        requires: ['brigandine'],
        stats: { units: 3 },
      },
      {
        id: 'long-pike',
        name: 'Long Pike',
        description: 'Eighteen feet of ash instead of twelve. They hold a wider stretch: range 165 to 215.',
        cost: 75,
        stats: { range: 215 },
      },
      {
        id: 'drill',
        name: 'Drilled Company',
        description: 'Daily drill at the levelled pike. Damage 20 to 34 per second each.',
        cost: 95,
        stats: { unitDps: 34 },
      },
    ],
  },

  /**
   * Plate and a warhammer: the Kingdom's answer to armour. Blunt is the only
   * damage type that gets *better* the heavier the target is dressed, so this
   * is what stops knights and rams. Slow, expensive, and eats two people's
   * worth of housing — a knight does not go to war alone.
   *
   * The enemy Warhammer Knight (`knight`) is the same man on the other side.
   */
  'heavy-knight': {
    id: 'heavy-knight',
    name: 'Warhammer Knight',
    housing: 2,
    food: 3,
    blurb: 'Plate and a warhammer. Slow and costly, and the only thing that reliably breaks armour.',
    cost: 160,
    radius: 15,
    attack: 'melee',
    visual: 'heavy-knight',
    baseColor: '#6b7078',
    // He does not chase: a short leash keeps him planted where he was put.
    range: 140,
    turnSpeed: 5,
    units: 1,
    unitHp: 420,
    unitDps: 30,
    unitSpeed: 62,
    retreatAt: 0.4,
    armor: 'heavy',
    damageType: 'blunt',
    upgrades: [
      {
        id: 'great-helm',
        name: 'Great Helm',
        description: 'A fully enclosed helm over the mail coif. Health 420 to 620.',
        cost: 150,
        stats: { unitHp: 620 },
      },
      {
        id: 'oath-sworn',
        name: 'Sworn Oath',
        description:
          'He has sworn not to give ground. Health 620 to 820, and he holds the line down to 20% before falling back.',
        cost: 220,
        requires: ['great-helm'],
        stats: { unitHp: 820, retreatAt: 0.2 },
      },
      {
        id: 'spiked-head',
        name: 'Spiked Hammer Head',
        description: 'A back-spike for punching through plate. Damage 30 to 46 per second.',
        cost: 140,
        stats: { unitDps: 46 },
      },
      {
        id: 'crushing-blow',
        name: 'Crushing Blow',
        description:
          'A two-handed sweep every 3.5 seconds that crushes everything within reach rather than just the man in front.',
        cost: 210,
        requires: ['spiked-head'],
        stats: { whirlwindDamage: 40, whirlwindRadius: 46, whirlwindInterval: 3.5 },
      },
    ],
  },

  /**
   * A knight on a warhorse. He rides far out from his post, which makes his
   * effective coverage the widest of anything the Kingdom fields, and he
   * cuts rather than crushes. Only medium armour, though: the weight is in
   * the horse and his own bulk rather than a full harness.
   *
   * Gated behind Husbandry — no stables, no cavalry.
   */
  'mounted-knight': {
    id: 'mounted-knight',
    name: 'Mounted Knight',
    housing: 2,
    food: 3,
    blurb: 'Rides far out from his post to cut down whatever is furthest along. Needs stables.',
    cost: 190,
    radius: 16,
    attack: 'melee',
    visual: 'mounted-knight',
    baseColor: '#5c5a58',
    requiresTech: 'husbandry',
    // By far the longest leash of any post: he covers ground nothing else can.
    range: 230,
    turnSpeed: 7,
    units: 1,
    unitHp: 340,
    unitDps: 34,
    unitSpeed: 150,
    retreatAt: 0.35,
    armor: 'medium',
    damageType: 'slash',
    upgrades: [
      {
        id: 'destrier',
        name: 'Destrier',
        description: 'A bred warhorse in place of a rouncey. Health 340 to 520.',
        cost: 180,
        stats: { unitHp: 520 },
      },
      {
        id: 'barding',
        name: 'Steel Barding',
        description:
          'Plate over the horse as well as the man. Heavy armour — but the weight tells, and he rides noticeably slower.',
        cost: 230,
        requires: ['destrier'],
        stats: { armor: 'heavy', unitSpeed: 118 },
      },
      {
        id: 'sabre',
        name: 'Sharpened Sabre',
        description: 'A curved blade made for cutting down from the saddle. Damage 34 to 50 per second.',
        cost: 150,
        stats: { unitDps: 50 },
      },
      {
        id: 'trample',
        name: 'Trample',
        description:
          'He rides straight through the press every 2.5 seconds, cutting everything he passes rather than just the man in front.',
        cost: 200,
        requires: ['sabre'],
        stats: { whirlwindDamage: 34, whirlwindRadius: 56, whirlwindInterval: 2.5 },
      },
    ],
  },

  /*
   * ------------------------------------------------------------------------
   * The Marches. Slash, pierce and one blunt emplacement, all of it reaching
   * rather than blocking — this realm has no gatehouse and nothing that halts
   * a crowd, so it has to kill things on the way in.
   * ------------------------------------------------------------------------
   */

  /**
   * The Marches' cheap body, and the mirror of the Kingdom's pikemen: two men
   * to a post again, but with sword and buckler rather than a pike. Shorter
   * reach and no formation, so they hold a narrower stretch — but they cut,
   * and slash keeps far more of its bite against mail than pierce does.
   *
   * Lighter than a swordsman on purpose. He is a retained soldier in a mail
   * shirt, not a knight's household man in a surcoat.
   */
  'men-at-arms': {
    id: 'men-at-arms',
    name: 'Men-at-Arms',
    housing: 1,
    food: 1,
    blurb: 'Two swordsmen to a post. Cheap hold-points that cut rather than skewer.',
    cost: 50,
    radius: 13,
    attack: 'melee',
    visual: 'men-at-arms',
    baseColor: '#5f7148',
    // No pike, so a shorter leash than the Kingdom's equivalent.
    range: 150,
    turnSpeed: 7,
    units: 2,
    unitHp: 130,
    unitDps: 24,
    unitSpeed: 108,
    retreatAt: 0.4,
    armor: 'light',
    damageType: 'slash',
    upgrades: [
      {
        id: 'mail-shirts',
        name: 'Mail Shirts',
        description: 'Riveted mail under the jack. Health 130 to 200 each.',
        cost: 85,
        stats: { unitHp: 200 },
      },
      {
        id: 'third-man',
        name: 'Third Retainer',
        description:
          'A third man takes the post with them, with his own health — and needs no housing or food of his own.',
        cost: 90,
        requires: ['mail-shirts'],
        stats: { units: 3 },
      },
      {
        id: 'arming-swords',
        name: 'Arming Swords',
        description: 'Properly forged blades in place of falchions. Damage 24 to 38 per second each.',
        cost: 100,
        stats: { unitDps: 38 },
      },
      {
        id: 'back-and-breast',
        name: 'Back-and-Breast',
        description:
          'Plate over the mail, front and back. Medium armour — but the weight tells and they move slower.',
        cost: 140,
        requires: ['mail-shirts'],
        stats: { armor: 'medium', unitSpeed: 88 },
      },
    ],
  },

  /**
   * A flail on a chain, swung from a fixed post at whatever comes past.
   *
   * Mechanically a shooting emplacement with an absurdly short reach — the
   * "shot" is the head of the flail lashing out and coming back. That reach is
   * the whole design: it covers almost nothing from open ground, so it wants
   * an inside corner where the road doubles back on itself and the same
   * stretch passes it twice. Put it in a straight and it is wasted.
   *
   * It is also the Marches' only blunt damage, which is what makes finding it
   * a corner worth doing at all: slash and pierce both fall apart on plate.
   */
  'flail-guard': {
    id: 'flail-guard',
    name: 'Flail Guard',
    housing: 1,
    food: 1,
    blurb: 'Very short reach, never misses, blunt. Wants an inside corner — useless on a straight.',
    cost: 85,
    radius: 13,
    attack: 'projectile',
    visual: 'flail-guard',
    baseColor: '#6a6470',
    range: 95,
    turnSpeed: 8,
    damage: 44,
    fireRate: 0.7,
    projectileSpeed: 900,
    projectileShape: 'flail',
    projectileRadius: 4,
    accuracy: 1,
    damageType: 'blunt',
    buildingHp: 220,
    armor: 'medium',
    upgrades: [
      {
        id: 'heavier-head',
        name: 'Heavier Head',
        description: 'A bigger ball on a shorter haft. Damage 44 to 72.',
        cost: 130,
        stats: { damage: 72 },
      },
      {
        id: 'spiked-head',
        name: 'Spiked Head',
        description:
          'Flanges welded round the ball. The blow carries through to anything standing close by.',
        cost: 180,
        requires: ['heavier-head'],
        stats: { splashRadius: 32 },
      },
      {
        id: 'longer-chain',
        name: 'Longer Chain',
        description: 'Another two feet of chain. Reach 95 to 135 — enough to matter on a gentler corner.',
        cost: 110,
        stats: { range: 135 },
      },
      {
        id: 'second-flail',
        name: 'Second Flail',
        description: 'One in each hand, swung alternately. Strikes far more often.',
        cost: 150,
        stats: { fireRate: 1.1 },
      },
    ],
  },

  /**
   * The longest reach in the game by a wide margin, and the least damage per
   * arrow to pay for it.
   *
   * Where the Wardens' archer is a good tower, this is a *coverage* tower:
   * one of these watches a stretch of road three others could not, and its
   * worth is measured in how long an enemy spends inside it rather than in
   * what any single shaft does. It is drawn as an archer because that is what
   * it is; the two never appear in the same game.
   */
  longbowman: {
    id: 'longbowman',
    name: 'Longbowman',
    housing: 1,
    food: 1,
    blurb: 'Enormous reach, feeble arrows. Buys time under fire rather than kills.',
    cost: 55,
    radius: 13,
    attack: 'projectile',
    visual: 'archer',
    baseColor: '#4f6b3a',
    range: 300,
    turnSpeed: 9,
    damage: 12,
    fireRate: 0.75,
    projectileSpeed: 560,
    projectileShape: 'arrow',
    projectileRadius: 3,
    accuracy: 0.78,
    damageType: 'pierce',
    buildingHp: 130,
    armor: 'unarmored',
    upgrades: [
      {
        id: 'war-bow',
        name: 'War Bow',
        description: 'A heavier stave and a longer draw. Damage 12 to 22.',
        cost: 95,
        stats: { damage: 22 },
      },
      {
        id: 'arrow-storm',
        name: 'Arrow Storm',
        description: 'Loosing on the count rather than aiming each shaft. Shoots far more often.',
        cost: 120,
        stats: { fireRate: 1.15 },
      },
      {
        id: 'ranging-marks',
        name: 'Ranging Marks',
        description:
          'Stakes driven at known distances down the road. Reach 300 to 380, and a steadier aim.',
        cost: 130,
        stats: { range: 380, accuracy: 0.86 },
      },
      {
        id: 'fire-arrows',
        name: 'Fire Arrows',
        description:
          'Pitch-soaked heads. Fire damage, and the target keeps burning afterwards. Burns stack twice at most.',
        cost: 90,
        requiresTech: 'fire-projectiles',
        stats: { damageType: 'fire', igniteDps: 6, igniteDuration: 4 },
      },
    ],
  },

  /**
   * The Marches' heavy foot: full harness and a sword. The Kingdom's warhammer
   * knight crushes, this one cuts — same plate, same price bracket, opposite
   * answer. Slash is merely poor against plate rather than useless, so he is
   * a good general soldier who is never the *right* one against a knight.
   */
  'sword-knight': {
    id: 'sword-knight',
    name: 'Sword Knight',
    housing: 2,
    food: 3,
    blurb: 'Plate and a longsword. The anvil of the Marches line, and its best all-rounder.',
    cost: 165,
    radius: 15,
    attack: 'melee',
    visual: 'sword-knight',
    baseColor: '#3d5a8a',
    range: 145,
    turnSpeed: 5,
    units: 1,
    unitHp: 400,
    unitDps: 34,
    unitSpeed: 66,
    retreatAt: 0.4,
    armor: 'heavy',
    damageType: 'slash',
    upgrades: [
      {
        id: 'great-helm',
        name: 'Great Helm',
        description: 'A fully enclosed helm over the coif. Health 400 to 600.',
        cost: 150,
        stats: { unitHp: 600 },
      },
      {
        id: 'oath-sworn',
        name: 'Sworn Oath',
        description:
          'He has sworn not to give ground. Health 600 to 800, and he holds down to 20% before falling back.',
        cost: 220,
        requires: ['great-helm'],
        stats: { unitHp: 800, retreatAt: 0.2 },
      },
      {
        id: 'honed-blade',
        name: 'Honed Longsword',
        description: 'A blade kept to a razor and a half-sword grip for the gaps. Damage 34 to 52 per second.',
        cost: 145,
        stats: { unitDps: 52 },
      },
      {
        id: 'sweeping-cut',
        name: 'Sweeping Cut',
        description:
          'A full turn of the blade every 3.2 seconds, opening up everything within reach rather than the man in front.',
        cost: 210,
        requires: ['honed-blade'],
        stats: { whirlwindDamage: 38, whirlwindRadius: 48, whirlwindInterval: 3.2 },
      },
    ],
  },

  /**
   * A knight on a warhorse with a couched lance — the Marches' pierce, and
   * deliberately not a late-game armour-breaker.
   *
   * Pierce is the worst thing in the game to bring to a plate fight (40%), so
   * making a heavy elite out of it needs care: his damage is set high enough
   * that even at 40% he is worth his place, but what he is genuinely *for* is
   * the light and unarmoured mass, where pierce is at its best and his long
   * leash lets him ride out and meet it well before it reaches the line.
   * Against the wave-6 knights, that is what the Flail Guard is for.
   *
   * Gated behind Husbandry — no stables, no cavalry.
   */
  lancer: {
    id: 'lancer',
    name: 'Lancer',
    housing: 2,
    food: 3,
    blurb: 'Heavy horse with a couched lance. Rides far out to break the mass before it arrives.',
    cost: 200,
    radius: 16,
    attack: 'melee',
    visual: 'lancer',
    baseColor: '#6a5a3e',
    requiresTech: 'husbandry',
    range: 215,
    turnSpeed: 7,
    units: 1,
    unitHp: 380,
    // High on purpose: pierce lands at 40% on the plate he will meet late, so
    // a merely respectable figure here would make him useless by wave 12.
    unitDps: 44,
    unitSpeed: 120,
    retreatAt: 0.35,
    armor: 'heavy',
    damageType: 'pierce',
    upgrades: [
      {
        id: 'destrier',
        name: 'Destrier',
        description: 'A bred warhorse under the harness. Health 380 to 560.',
        cost: 190,
        stats: { unitHp: 560 },
      },
      {
        id: 'bodkin-lance',
        name: 'Bodkin Lance',
        description:
          'A needle head made to find the gaps in plate. Damage 44 to 66 per second — the answer to armour turning his point.',
        cost: 165,
        stats: { unitDps: 66 },
      },
      {
        id: 'couched-charge',
        name: 'Couched Charge',
        description:
          'He rides straight through the press every 2.8 seconds, running through everything he passes.',
        cost: 200,
        requires: ['bodkin-lance'],
        stats: { whirlwindDamage: 30, whirlwindRadius: 58, whirlwindInterval: 2.8 },
      },
      {
        id: 'swift-remount',
        name: 'Spare Mounts',
        description: 'A second horse kept saddled. He rides further out and gets there faster.',
        cost: 150,
        stats: { range: 265, unitSpeed: 152 },
      },
    ],
  },

  hospital: {
    id: 'hospital',
    name: 'Field Hospital',
    housing: 1,
    food: 1,
    blurb: 'Does not attack. Wounded fighters withdraw here; damaged emplacements nearby are mended.',
    cost: 100,
    radius: 17,
    attack: 'none',
    visual: 'hospital',
    baseColor: '#c9c3b2',
    requiresTech: 'field-medicine',
    /**
     * How far the surgeons will work. A wounded fighter will only fall back to
     * a hospital inside this radius, and only shot-up emplacements inside it
     * get mended. Before this existed a single hospital anywhere on the map
     * served the whole realm, which made where you put it meaningless.
     */
    range: 210,
    turnSpeed: 0,
    healRate: 30,
    upgrades: [
      {
        id: 'surgeons',
        name: 'Trained Surgeons',
        description: 'Proper physicians rather than camp followers. Healing 30 to 58 per second.',
        cost: 130,
        stats: { healRate: 58 },
      },
      {
        id: 'stretcher-bearers',
        name: 'Stretcher Bearers',
        description:
          'Runners who go out and fetch the wounded in. The hospital reaches 210 to 320 — far enough to cover a second stretch of the line.',
        cost: 150,
        stats: { range: 320 },
      },
    ],
  },

  houndmaster: {
    id: 'houndmaster',
    name: 'Houndmaster',
    housing: 1,
    food: 2,
    blurb: 'Sends a dog to hold the road.',
    cost: 90,
    radius: 17,
    attack: 'hound',
    visual: 'houndmaster',
    baseColor: '#6d5a45',
    range: 165,
    turnSpeed: 6,
    dogs: 1,
    dogHp: 190,
    dogDps: 30,
    dogSpeed: 135,
    upgrades: [
      // Priced against what they actually deliver: a dog does not merely add
      // damage, it stops the enemy dead while everything else keeps firing,
      // and the pack is restored in full between waves at no cost. That is
      // worth a good deal more per coin than a tower that only shoots.
      {
        id: 'second-hound',
        name: 'Second Hound',
        description: 'A second dog joins the pack, with its own health.',
        cost: 155,
        stats: { dogs: 2 },
      },
      {
        id: 'war-hounds',
        name: 'War Hounds',
        description: 'Bigger, meaner dogs. They bite harder and take far more punishment.',
        cost: 245,
        requires: ['second-hound'],
        stats: { dogDps: 48, dogHp: 420 },
      },
    ],
  },

  /**
   * A man heaving dressed stones. Installable in a gatehouse turret, and — for
   * a nation whose roster says so — buildable in the open field as well.
   *
   * Its reason to exist is blunt damage at a price anyone can pay. Blunt is
   * the only type that gets *better* the heavier the target is armoured, so
   * this is what a realm without a catapult puts in front of the wave-6
   * knights. It never misses, and its short reach is what keeps that honest.
   */
  'rock-thrower': {
    id: 'rock-thrower',
    name: 'Rock Thrower',
    housing: 1,
    food: 1,
    blurb: 'Short reach, always hits, and blunt — the cheap answer to armour.',
    cost: 70,
    radius: 11,
    attack: 'projectile',
    visual: 'rock-thrower',
    baseColor: '#7a7268',
    // In a gatehouse the emplacements sit out to the side of the road, so the
    // reach has to cover the crossing plus the gap out to the turret.
    range: 135,
    turnSpeed: 7,
    damage: 28,
    fireRate: 0.75,
    projectileSpeed: 260,
    projectileShape: 'boulder',
    projectileRadius: 5,
    accuracy: 1,
    damageType: 'blunt',
    // Shootable. A stack of dressed blocks and the man behind them.
    buildingHp: 220,
    armor: 'medium',
    upgrades: [
      {
        id: 'heavier-stones',
        name: 'Heavier Stones',
        description: 'Dressed blocks hauled up from the mason’s yard. Damage 28 to 52.',
        cost: 110,
        stats: { damage: 52 },
      },
      {
        // Worded to make sense both in a gatehouse vault and out in a field,
        // since the same tower is now raised in either place.
        id: 'murder-holes',
        name: 'Shattering Stones',
        description:
          'Blocks scored so they burst on landing. The rubble scatters, hurting everything close by.',
        cost: 185,
        requires: ['heavier-stones'],
        stats: { splashRadius: 34 },
      },
      {
        id: 'winch-crew',
        name: 'Winch Crew',
        description: 'A team on the hoist keeping the platform stocked. Drops stones far more often.',
        cost: 130,
        stats: { fireRate: 1 },
      },
    ],
  },

  'hot-oil': {
    id: 'hot-oil',
    name: 'Hot Oil',
    housing: 1,
    food: 1,
    blurb: 'Pours boiling oil over the wall.',
    cost: 80,
    radius: 13,
    attack: 'projectile',
    visual: 'hot-oil',
    baseColor: '#8a5a24',
    requiresTech: 'fire-projectiles',
    range: 118,
    turnSpeed: 7,
    damage: 16,
    fireRate: 1.1,
    projectileSpeed: 200,
    projectileShape: 'boulder',
    projectileRadius: 5,
    accuracy: 1,
    splashRadius: 40,
    damageType: 'fire',
    buildingHp: 220,
    armor: 'medium',
    upgrades: [
      {
        id: 'great-cauldron',
        name: 'Great Cauldron',
        description: 'A far larger vessel over a proper fire. Damage 16 to 30, and it spills wider.',
        cost: 120,
        stats: { damage: 30, splashRadius: 52 },
      },
      {
        id: 'boiling-pitch',
        name: 'Boiling Pitch',
        description:
          'Pitch instead of oil. It clings and keeps burning on the ground, scorching whatever crosses after.',
        cost: 150,
        requires: ['great-cauldron'],
        stats: { burnDps: 16, burnDuration: 4, burnRadius: 48 },
      },
    ],
  },

  gatehouse: {
    id: 'gatehouse',
    name: 'Stone Gatehouse',
    blurb: 'Built across the road. Enemies must break the gate to pass.',
    cost: 180,
    radius: 24,
    attack: 'none',
    visual: 'gatehouse',
    baseColor: '#8c8478',
    placement: 'path',
    requiresTech: 'advanced-construction',
    range: 0,
    turnSpeed: 0,
    gateHp: 700,
    upgrades: [
      {
        id: 'iron-bands',
        name: 'Iron-Banded Gate',
        description: 'Wrought straps across the timbers. The gate holds 700 to 1200 damage.',
        cost: 170,
        stats: { gateHp: 1200 },
      },
      {
        id: 'portcullis',
        name: 'Portcullis',
        description: 'A second barrier of iron behind the doors. Holds 1200 to 2000 damage.',
        cost: 260,
        requires: ['iron-bands'],
        stats: { gateHp: 2000 },
      },
    ],
  },

  house: {
    id: 'house',
    name: 'House',
    blurb: 'Shelters the people who man your towers. Costs no housing itself.',
    cost: 80,
    radius: 15,
    attack: 'none',
    visual: 'house',
    baseColor: '#9a7550',
    range: 0,
    turnSpeed: 0,
    houseCapacity: 5,
    upgrades: [
      {
        id: 'timber-frame',
        name: 'Timber Frame',
        description: 'A second storey jettied over the street. Shelters 7 people instead of 5.',
        cost: 110,
        requiresTech: 'advanced-construction',
        stats: { houseCapacity: 7 },
      },
      {
        id: 'townhouse',
        name: 'Townhouse',
        description: 'A tiled roof, a proper hearth and an attic. Shelters 10 people.',
        cost: 180,
        requires: ['timber-frame'],
        stats: { houseCapacity: 10 },
      },
    ],
  },

  farm: {
    id: 'farm',
    name: 'Farm',
    blurb: 'A shed and a corn field. Feeds your towers; needs housing for its farmer.',
    cost: 70,
    radius: 20,
    attack: 'none',
    visual: 'farm',
    baseColor: '#b79a4a',
    range: 0,
    turnSpeed: 0,
    housing: 1,
    foodOutput: 6,
    upgrades: [
      {
        id: 'scarecrow',
        name: 'Scarecrow',
        description: 'A straw man on a pole. Crows no longer spoil this field’s harvest.',
        cost: 60,
        stats: { crowProtection: 1 },
      },
      {
        id: 'plough-horse',
        name: 'Plough Horse',
        description: 'A horse at the plough turns far more ground. Harvest 6 to 11.',
        cost: 140,
        requiresTech: 'husbandry',
        stats: { foodOutput: 11 },
      },
    ],
  },

  research: {
    id: 'research',
    name: "Scholars' Hall",
    food: 1,
    blurb: 'Develops technologies. Does not attack.',
    cost: 150,
    radius: 25,
    attack: 'none',
    visual: 'research',
    baseColor: '#8f8676',
    range: 0,
    turnSpeed: 0,
    upgrades: [],
  },
} as const satisfies Record<string, TowerDef>;

export type TowerId = keyof typeof TOWERS;

/**
 * Look a tower up as a plain `TowerDef`. Indexing `TOWERS` directly gives the
 * narrow literal type of that one entry, which does not carry the optional
 * fields other entries declare.
 */
export function towerDef(id: TowerId): TowerDef {
  return TOWERS[id];
}

/**
 * Every tower id there is, in declaration order.
 *
 * Which of them a player may actually build is a property of their nation, not
 * of this file — see `nations.ts`. This list exists for things that have to
 * cover the whole catalogue regardless of nation, such as pre-rendering sprites.
 */
export const ALL_TOWERS = Object.keys(TOWERS) as TowerId[];

/**
 * Resolve a tower's live numbers from the upgrades it has actually bought.
 * Upgrades are applied in the order they are declared, so a later entry that
 * touches the same stat wins regardless of the order they were purchased in.
 */
export function statsFor(def: TowerDef, purchased: ReadonlySet<string>): TowerStats {
  const stats: TowerStats = {
    range: def.range,
    damage: def.damage ?? 0,
    fireRate: def.fireRate ?? 0,
    projectileSpeed: def.projectileSpeed ?? 0,
    turnSpeed: def.turnSpeed,
    accuracy: def.accuracy ?? 1,
    splashRadius: def.splashRadius ?? 0,
    damageType: def.damageType ?? 'slash',
    projectileRadius: def.projectileRadius ?? 5,
    burnDps: 0,
    burnDuration: 0,
    burnRadius: 0,
    igniteDps: 0,
    igniteDuration: 0,
    crew: def.crew ?? 0,
    elevated: 0,
    gateHp: def.gateHp ?? 0,
    units: def.units ?? 0,
    unitHp: def.unitHp ?? 0,
    unitDps: def.unitDps ?? 0,
    unitSpeed: def.unitSpeed ?? 0,
    retreatAt: def.retreatAt ?? 0,
    healRate: def.healRate ?? 0,
    buildingHp: def.buildingHp ?? 0,
    selfRepair: def.selfRepair ?? 0,
    dogs: def.dogs ?? 0,
    dogHp: def.dogHp ?? 0,
    dogDps: def.dogDps ?? 0,
    dogSpeed: def.dogSpeed ?? 0,
    whirlwindDamage: 0,
    whirlwindRadius: 0,
    whirlwindInterval: 0,
    armor: def.armor ?? 'unarmored',
    houseCapacity: def.houseCapacity ?? 0,
    foodOutput: def.foodOutput ?? 0,
    crowProtection: def.crowProtection ?? 0,
  };

  for (const upgrade of def.upgrades) {
    if (purchased.has(upgrade.id)) Object.assign(stats, upgrade.stats);
  }
  return stats;
}

/** Why an upgrade cannot be bought yet, or null when it can. */
export function upgradeBlocker(
  upgrade: TowerUpgrade,
  purchased: ReadonlySet<string>,
  techs: ReadonlySet<string>,
  allUpgrades: readonly TowerUpgrade[],
): string | null {
  if (upgrade.requiresTech && !techs.has(upgrade.requiresTech)) {
    return 'Needs research';
  }
  for (const id of upgrade.requires ?? []) {
    if (!purchased.has(id)) {
      const dep = allUpgrades.find((u) => u.id === id);
      return `Needs ${dep?.name ?? id}`;
    }
  }
  return null;
}

