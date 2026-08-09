import type { CreepId } from './creeps';

export interface SpawnGroup {
  creepId: CreepId;
  count: number;
  /** Seconds between two creeps of this group. Ignored by a formation. */
  interval: number;
  /** Seconds to wait after the wave starts before this group begins. */
  delay: number;
  /**
   * Send this group in as a block instead of in single file: `columns`
   * abreast across the road, ranks queued up behind. The whole group arrives
   * at once, so `interval` does not apply.
   */
  formation?: { columns: number; rankGap?: number };
}

export interface WaveDef {
  groups: SpawnGroup[];
  /** Bonus gold for clearing the wave. */
  reward: number;
}

/**
 * Twenty waves.
 *
 * Two rules run through the whole table:
 *
 * 1. **Slow first, fast last.** Delays are set so the slow groups leave
 *    early and the quick ones leave late, and everything lands on the
 *    defence at roughly the same time. Sending them in roster order meant
 *    the fast units arrived alone, died alone, and the slow ones turned up
 *    afterwards to be killed at leisure. As a rough guide, at the speeds in
 *    `creeps.ts` a group needs about this much of a head start over the
 *    quickest units: ram +11s, knights +7s, shieldmen +6s, pikemen +4s,
 *    peasants +3s, assassins/mounted +1s, marauders/riders/hounds 0.
 * 2. **Formations for pressure.** A `formation` group arrives as one block
 *    rather than a queue, which is far harder to chew through than the same
 *    count trickling past one at a time. Used deliberately, not everywhere.
 *
 * ### Rewards
 *
 * The clear bonus rises with the wave number, roughly 1.3–1.5x what it used to
 * be from wave 8 on. It was previously close to flat — 85 at wave 7, 280 at
 * wave 19 — while the cost of holding the line went up far faster than that,
 * so the back half of the game was spent unable to afford anything. The
 * balance runs made this unmissable: a realm would reach wave 19 with the
 * whole board built, nothing left it could pay for, and lose the finale for
 * want of income rather than for want of an answer.
 *
 * Bounties deliberately move the other way — see `waveBountyScale` in
 * `Game.ts`, which *reduces* what an individual kill pays as the waves go on.
 * Between them, gold comes from surviving waves rather than from farming the
 * ever-larger piles of enemies in them.
 */
export const WAVES: WaveDef[] = [
  {
    reward: 24,
    // The gentlest possible start: peasants with pitchforks, nothing more.
    groups: [{ creepId: 'peasant', count: 8, interval: 1.0, delay: 0 }],
  },
  {
    reward: 28,
    groups: [
      { creepId: 'grunt', count: 8, interval: 0.85, delay: 0 },
      { creepId: 'peasant', count: 6, interval: 0.9, delay: 1.5 },
    ],
  },
  {
    reward: 32,
    // The shieldbearer's debut — a single pair, so medium armour is a puzzle
    // to notice rather than a wall to break through.
    groups: [
      { creepId: 'shieldman', count: 2, interval: 1.2, delay: 0 },
      { creepId: 'grunt', count: 7, interval: 0.9, delay: 2 },
      { creepId: 'peasant', count: 6, interval: 0.7, delay: 4 },
      { creepId: 'hound', count: 4, interval: 0.8, delay: 6 },
    ],
  },
  {
    reward: 38,
    groups: [
      { creepId: 'shieldman', count: 3, interval: 1.1, delay: 0 },
      { creepId: 'grunt', count: 8, interval: 0.75, delay: 2 },
      { creepId: 'peasant', count: 8, interval: 0.6, delay: 4 },
      { creepId: 'hound', count: 5, interval: 0.6, delay: 6 },
    ],
  },
  {
    reward: 52,
    groups: [
      { creepId: 'shieldman', count: 4, interval: 1.0, delay: 0 },
      { creepId: 'grunt', count: 10, interval: 0.7, delay: 2 },
      { creepId: 'peasant', count: 8, interval: 0.55, delay: 5 },
      { creepId: 'hound', count: 6, interval: 0.7, delay: 7 },
      { creepId: 'assassin', count: 3, interval: 1.0, delay: 9 },
    ],
  },
  {
    reward: 70,
    // The warhammer knight's debut, sent out well ahead of everything else
    // so the escort catches up rather than dying first.
    groups: [
      { creepId: 'knight', count: 2, interval: 2.0, delay: 0 },
      { creepId: 'shieldman', count: 4, interval: 0.9, delay: 2 },
      { creepId: 'grunt', count: 10, interval: 0.6, delay: 4 },
      { creepId: 'peasant', count: 8, interval: 0.5, delay: 6 },
      { creepId: 'hound', count: 6, interval: 0.5, delay: 8 },
    ],
  },
  {
    reward: 95,
    // The first formation: a small block of pikemen, two ranks of three, to
    // introduce the idea before it starts arriving nine and twelve at a time.
    //
    // Also the bowman's debut, and deliberately only three of them: this is
    // the first wave that shoots back at your emplacements, and it should
    // teach the lesson rather than punish it.
    groups: [
      { creepId: 'knight', count: 3, interval: 1.8, delay: 0 },
      { creepId: 'grunt', count: 6, interval: 0, delay: 4, formation: { columns: 3 } },
      { creepId: 'grunt', count: 10, interval: 0.55, delay: 6 },
      { creepId: 'bowman', count: 3, interval: 1.2, delay: 7 },
      { creepId: 'assassin', count: 5, interval: 0.8, delay: 9 },
    ],
  },
  {
    reward: 115,
    // The assassin in force: little health each, but a wall of them.
    groups: [
      { creepId: 'shieldman', count: 6, interval: 0.9, delay: 0 },
      { creepId: 'grunt', count: 12, interval: 0.55, delay: 2 },
      { creepId: 'assassin', count: 6, interval: 0, delay: 6, formation: { columns: 3 } },
      { creepId: 'hound', count: 8, interval: 0.5, delay: 8 },
    ],
  },
  {
    reward: 135,
    // The lance rider's debut: quick, and tougher than its light armour
    // alone would suggest thanks to the horse. The stone slinger arrives with
    // them — blunt shot, so this is the wave that first threatens a catapult
    // or a rock thrower rather than merely a crossbowman.
    groups: [
      { creepId: 'knight', count: 3, interval: 1.8, delay: 0 },
      { creepId: 'shieldman', count: 8, interval: 0.7, delay: 3 },
      { creepId: 'stoneslinger', count: 4, interval: 1.1, delay: 5 },
      { creepId: 'assassin', count: 6, interval: 0.7, delay: 8 },
      { creepId: 'lancerider', count: 5, interval: 1.0, delay: 10 },
    ],
  },
  {
    reward: 155,
    // **Wave 10: the Morningstar Knight.** The campaign's midpoint boss, and
    // the first thing that cannot be held at all — no pike line stops him, and
    // the flail goes round whether or not anything is fighting him. He walks
    // in first and alone, so he arrives while the defence is still intact and
    // the wave behind him has to be dealt with afterwards.
    //
    // The battering ram debuts in the same wave, well behind him.
    groups: [
      { creepId: 'flailknight', count: 1, interval: 1, delay: 0 },
      { creepId: 'ram', count: 1, interval: 1, delay: 5 },
      { creepId: 'knight', count: 3, interval: 1.8, delay: 9 },
      { creepId: 'grunt', count: 12, interval: 0.55, delay: 12 },
      { creepId: 'assassin', count: 6, interval: 0.7, delay: 15 },
    ],
  },
  {
    reward: 185,
    // The sword-and-shield knight's debut, alongside its warhammer twin.
    groups: [
      { creepId: 'knight', count: 4, interval: 1.6, delay: 0 },
      { creepId: 'swordknight', count: 4, interval: 1.6, delay: 1 },
      { creepId: 'shieldman', count: 8, interval: 0.7, delay: 4 },
      { creepId: 'assassin', count: 6, interval: 0.7, delay: 9 },
      { creepId: 'hound', count: 8, interval: 0.45, delay: 11 },
    ],
  },
  {
    reward: 205,
    // The marauder's debut: it shrugs off being held and hurts whoever is
    // standing close when it dies, and it costs dearly if it slips through.
    groups: [
      { creepId: 'shieldman', count: 9, interval: 0, delay: 0, formation: { columns: 3 } },
      { creepId: 'grunt', count: 12, interval: 0.5, delay: 3 },
      { creepId: 'marauder', count: 8, interval: 0.55, delay: 7 },
      { creepId: 'lancerider', count: 4, interval: 1.0, delay: 9 },
    ],
  },
  {
    reward: 230,
    // The mounted knight's debut: the single tankiest thing yet, offset by
    // fighting at only medium armour.
    groups: [
      { creepId: 'knight', count: 4, interval: 1.5, delay: 0 },
      { creepId: 'shieldman', count: 8, interval: 0.7, delay: 3 },
      { creepId: 'mountedknight', count: 3, interval: 2.0, delay: 8 },
      { creepId: 'lancerider', count: 5, interval: 0.9, delay: 10 },
    ],
  },
  {
    reward: 255,
    // Full elite infantry: both knight variants and their mounted cousin,
    // with a marauder screen arriving at the same moment.
    groups: [
      { creepId: 'knight', count: 5, interval: 1.4, delay: 0 },
      { creepId: 'swordknight', count: 5, interval: 1.4, delay: 1 },
      { creepId: 'shieldman', count: 9, interval: 0, delay: 4, formation: { columns: 3 } },
      { creepId: 'mountedknight', count: 3, interval: 2.0, delay: 8 },
      { creepId: 'marauder', count: 7, interval: 0.55, delay: 10 },
    ],
  },
  {
    reward: 280,
    // A second ram, escorted this time, plus riders to punish anyone who
    // commits everything to the ram and forgets the flanks.
    groups: [
      { creepId: 'ram', count: 1, interval: 1, delay: 0 },
      { creepId: 'swordknight', count: 4, interval: 1.5, delay: 5 },
      { creepId: 'grunt', count: 12, interval: 0, delay: 8, formation: { columns: 4 } },
      { creepId: 'lancerider', count: 6, interval: 0.9, delay: 12 },
      { creepId: 'hound', count: 10, interval: 0.4, delay: 13 },
    ],
  },
  {
    reward: 310,
    // Everything on this wave is quick — no slow anchor to shoot at first.
    groups: [
      { creepId: 'assassin', count: 12, interval: 0, delay: 0, formation: { columns: 4 } },
      { creepId: 'marauder', count: 10, interval: 0.5, delay: 3 },
      { creepId: 'lancerider', count: 6, interval: 0.8, delay: 5 },
      { creepId: 'hound', count: 12, interval: 0.4, delay: 6 },
    ],
  },
  {
    reward: 340,
    // Heavy armour wall to wall: both knight types and the mounted knight,
    // led by a rank of shieldbearers.
    groups: [
      { creepId: 'knight', count: 6, interval: 1.3, delay: 0 },
      { creepId: 'swordknight', count: 6, interval: 1.3, delay: 1 },
      { creepId: 'shieldman', count: 12, interval: 0, delay: 4, formation: { columns: 4 } },
      { creepId: 'stoneslinger', count: 5, interval: 0.9, delay: 7 },
      { creepId: 'mountedknight', count: 4, interval: 1.8, delay: 9 },
      { creepId: 'hound', count: 10, interval: 0.4, delay: 11 },
    ],
  },
  {
    reward: 375,
    // A third ram with a marauder screen in front of it, drawing attention
    // away while it rolls up the road.
    groups: [
      { creepId: 'ram', count: 1, interval: 1, delay: 0 },
      { creepId: 'knight', count: 4, interval: 1.4, delay: 4 },
      { creepId: 'shieldman', count: 9, interval: 0, delay: 6, formation: { columns: 3 } },
      { creepId: 'marauder', count: 8, interval: 0.5, delay: 10 },
      { creepId: 'lancerider', count: 6, interval: 0.8, delay: 11 },
    ],
  },
  {
    reward: 420,
    // Nearly the whole roster at once — the last step before the finale.
    groups: [
      { creepId: 'knight', count: 5, interval: 1.3, delay: 0 },
      { creepId: 'swordknight', count: 5, interval: 1.3, delay: 1 },
      { creepId: 'shieldman', count: 12, interval: 0, delay: 4, formation: { columns: 4 } },
      { creepId: 'grunt', count: 12, interval: 0.45, delay: 6 },
      { creepId: 'bowman', count: 6, interval: 0.8, delay: 8 },
      { creepId: 'mountedknight', count: 4, interval: 1.6, delay: 9 },
      { creepId: 'assassin', count: 9, interval: 0, delay: 10, formation: { columns: 3 } },
      { creepId: 'marauder', count: 8, interval: 0.5, delay: 11 },
      { creepId: 'hound', count: 10, interval: 0.4, delay: 12 },
    ],
  },
  {
    reward: 560,
    // **Wave 20: the finale.** Two Morningstar Knights this time, one at each
    // end of it — the first walks in ahead of everything, the second arrives
    // in the middle of the crush when the defence is already committed. Two
    // rams behind them, then every line in the roster converging on the walls
    // together, with slingers and bowmen working on the emplacements
    // throughout.
    groups: [
      { creepId: 'flailknight', count: 1, interval: 1, delay: 0 },
      { creepId: 'ram', count: 2, interval: 5, delay: 4 },
      { creepId: 'knight', count: 6, interval: 1.2, delay: 6 },
      { creepId: 'swordknight', count: 6, interval: 1.2, delay: 7 },
      { creepId: 'shieldman', count: 16, interval: 0, delay: 10, formation: { columns: 4 } },
      { creepId: 'grunt', count: 12, interval: 0, delay: 12, formation: { columns: 4 } },
      { creepId: 'mountedknight', count: 5, interval: 1.5, delay: 15 },
      { creepId: 'assassin', count: 12, interval: 0, delay: 16, formation: { columns: 4 } },
      { creepId: 'marauder', count: 10, interval: 0.45, delay: 17 },
      { creepId: 'lancerider', count: 8, interval: 0.7, delay: 18 },
      { creepId: 'hound', count: 14, interval: 0.35, delay: 19 },
      { creepId: 'stoneslinger', count: 6, interval: 0.9, delay: 13 },
      { creepId: 'bowman', count: 8, interval: 0.7, delay: 16 },
      { creepId: 'flailknight', count: 1, interval: 1, delay: 20 },
    ],
  },
];
