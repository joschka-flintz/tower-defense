/**
 * The two nations a player can take into the field.
 *
 * A nation is nothing but a roster: which of the towers in `towers.ts` its
 * build panel offers, and what it may install in a gatehouse turret. Every
 * tower definition stays in `towers.ts` whichever nation can build it — a
 * tower that no nation lists is simply not offered, never deleted.
 *
 * The Kingdom is finished and balanced. The Wardens exist so the towers the
 * Kingdom no longer builds have somewhere to live; their roster is a
 * placeholder and has not been balanced against the wave table.
 */

import type { TowerId } from './towers';

export type NationId = 'kingdom' | 'marches' | 'wardens';

/**
 * Rules that bend for one nation only.
 *
 * These are deliberately *rule* differences rather than stat differences — a
 * nation that merely had cheaper towers would be the same nation with a
 * discount. Anything left unset falls back to the game-wide default.
 */
export interface NationTraits {
  /**
   * Fraction of his maximum health a melee fighter binds up between waves.
   * The game-wide default is 0.5 (`DEFAULT_MELEE_RECOVERY` in `Tower.ts`).
   *
   * Applies to *fighters* only. A shot-up emplacement mends at the same rate
   * for everybody — see `Tower.updateRepairs`.
   */
  meleeRecovery?: number;

  /**
   * Price multipliers, keyed by tower id **or** technology id. 0.6 means this
   * nation pays 60% of the listed price. Anything not named costs full price.
   *
   * Every price the player ever sees or pays goes through `Game.costOf` and
   * `Game.techCostOf`, so a discount cannot be honoured in the shop and
   * forgotten at the till.
   */
  costs?: Readonly<Record<string, number>>;
}

export interface NationDef {
  id: NationId;
  name: string;
  /** One-line pitch, shown above the build panel. */
  blurb: string;
  /** Order the towers appear in the build panel. */
  towers: readonly TowerId[];
  /** What this nation may install in a gatehouse emplacement. */
  gateSlots: readonly TowerId[];
  /** Buildings that only ever go on a reserved plot inside the walls. */
  lotBuildings: readonly TowerId[];
  /** Rules this nation bends. */
  traits?: NationTraits;
  /** Human-readable list of those bent rules, for the build panel. */
  perks?: readonly string[];
  /** True once the roster has actually been balanced against the waves. */
  playable: boolean;
}

export const NATIONS = {
  /**
   * Steel, stone and men who close with the enemy. The Kingdom has no archers
   * and no dogs: its ranged arm is the short, heavy crossbow and the rock
   * thrower, and everything else about it is built to make the enemy stop and
   * be fought. It pays for that with housing, food and field hospitals.
   */
  kingdom: {
    id: 'kingdom',
    name: 'The Kingdom',
    blurb: 'Men-at-arms and stone walls. Makes the enemy stop, then stands in the road with them.',
    towers: [
      'pikeman',
      'swordsman',
      'crossbow',
      // Also installable in a gatehouse turret, but the Kingdom can raise one
      // in the open field too — it is the only blunt damage it has, and blunt
      // is what armour forces on it.
      'rock-thrower',
      'heavy-knight',
      'mounted-knight',
      'house',
      'farm',
      'hospital',
      'gatehouse',
    ],
    gateSlots: ['rock-thrower', 'hot-oil'],
    lotBuildings: ['research'],
    traits: {
      // The Kingdom's men are professionals with surgeons and a baggage train
      // behind them: they come back from a mauling far better than a levy
      // does. This is the counterweight to a roster that takes its casualties
      // in the road rather than at two hundred paces — it does not make a
      // fighter stronger than he was, it makes a bad wave survivable.
      meleeRecovery: 0.75,
    },
    perks: ['Melee posts recover 75% of their health between waves, not 50%.'],
    playable: true,
  },

  /**
   * The border country: the other melee realm, and the Kingdom's opposite
   * number in almost every respect.
   *
   * Where the Kingdom makes the enemy *stop* — a gate across the road, short
   * weapons, blunt for the armour that follows — the Marches never stop
   * anybody. They have no gatehouse at all. Instead they reach: the longest
   * bow in the game, a catapult, and riders with a long leash, backed by a
   * flail emplacement tucked into a corner for the armour their slash and
   * pierce cannot answer.
   *
   * The gatehouse/catapult split is the whole point of the pair. Having both
   * — a wall that halts a crowd *and* the artillery to shell it while it
   * stands there — was the single strongest thing in the game, and giving
   * each realm one of the two is what stops them playing the same way.
   */
  marches: {
    id: 'marches',
    name: 'The Marches',
    blurb: 'Longbows, lances and the open field. Never stops the enemy — reaches them first.',
    towers: [
      'men-at-arms',
      'shieldbearer',
      'longbowman',
      'flail-guard',
      'sword-knight',
      'lancer',
      'catapult',
      'house',
      'farm',
      'hospital',
    ],
    // No gatehouse, so nothing to install in one.
    gateSlots: [],
    lotBuildings: ['research'],
    traits: {
      // The Marches keep hospitals the way other realms keep granaries — the
      // borderers have been patching each other up for generations. This is
      // the counterweight to a roster whose shooting line can be shot at:
      // cheap medicine is what lets them afford the hospitals that keep those
      // emplacements standing.
      costs: { 'field-medicine': 0.55, hospital: 0.7 },
    },
    perks: ['Field Medicine costs 45% less, and a Field Hospital 30% less.'],
    // The roster exists and runs; none of it has been balanced against the
    // wave table yet.
    playable: false,
  },

  /**
   * Not finished. Everything neither kingdom fields is parked here so it stays
   * in the game and keeps type-checking: bows, hounds, and whatever else a
   * third nation ends up being built around.
   */
  wardens: {
    id: 'wardens',
    name: 'The Wardens',
    blurb: 'Bows, hounds and the long watch. Kills at a distance rather than holding the road.',
    towers: ['archer', 'houndmaster', 'crossbow', 'house', 'farm', 'hospital', 'gatehouse'],
    gateSlots: ['rock-thrower', 'hot-oil'],
    lotBuildings: ['research'],
    // Intended, not built: nothing in the code gives them any of this yet. It
    // is written down so the design is visible on the start screen while the
    // specifics are still being argued about.
    perks: ['Planned: a housing and farming realm — cheaper shelter, richer fields. Not built yet.'],
    playable: false,
  },
} as const satisfies Record<NationId, NationDef>;

export const NATION_ORDER: NationId[] = ['kingdom', 'marches', 'wardens'];

/** The nation a new game starts as, until a pre-game chooser exists. */
export const DEFAULT_NATION: NationId = 'kingdom';

/** Look a nation up as a plain `NationDef`, not as its own narrow literal type. */
export function nationDef(id: NationId): NationDef {
  return NATIONS[id];
}
