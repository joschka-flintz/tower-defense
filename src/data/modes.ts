/**
 * Play modes.
 *
 * A mode is the *shape of the contest* — how many lives you hold, how many
 * waves you are asked to survive, and what the mode says about itself on the
 * start screen. It is deliberately a separate axis from the nation (which is a
 * roster) and the map (which is ground): any mode should be playable by any
 * nation on any map.
 *
 * There is exactly one mode today, the one the game has always been. It is a
 * data file rather than three constants in `Game.ts` because the next one is
 * meant to be an entry here and nothing else — anything a future mode needs to
 * bend belongs in `GameModeDef`, so `Game` never grows a switch on mode id.
 */

export type GameModeId = 'siege' | 'campaign';

export interface GameModeDef {
  id: GameModeId;
  name: string;
  /** One line, shown under the name on the start screen. */
  blurb: string;
  /** The handful of things that make this mode what it is, for the chooser. */
  rules: readonly string[];
  /** Lives the realm holds at the start. */
  lives: number;
  /**
   * Waves to survive, or `null` for "the whole wave table". A mode that ends
   * early or runs on past the table sets this.
   */
  waves: number | null;
  /** The purse the mode is designed around, and what the gold box starts at. */
  designGold: number;
  /** False for a mode that exists but has not been made to work yet. */
  playable: boolean;
  /**
   * A mode that is announced but cannot be started yet. The chooser shows it,
   * greyed, with `soonLabel` where the caution flag goes — it is a promise
   * rather than a warning, and `start.ts` refuses to select it.
   */
  comingSoon?: boolean;
  soonLabel?: string;
}

export const MODES = {
  siege: {
    id: 'siege',
    name: 'The Long Siege',
    blurb: 'Twenty waves. Hold the road to the city gate, or lose the realm.',
    rules: [
      'Twenty waves, each harder than the last, ending with a boss.',
      'Every enemy that reaches the city gate costs you a life. At zero, the realm falls.',
      'You keep whatever you build; nothing resets between waves.',
    ],
    lives: 20,
    waves: null,
    designGold: 260,
    playable: true,
  },

  /**
   * Announced, not built. It is listed so the shape of what is coming is
   * visible from the start screen, and locked so it cannot be picked — see
   * `comingSoon`. Nothing in `Game` reads it yet; when it is built, what it
   * bends should become fields here.
   */
  campaign: {
    id: 'campaign',
    name: 'Campaign',
    blurb: 'A war of several battles, one map after another, with what you win carried forward.',
    rules: [
      'A run of linked battles rather than a single stand.',
      'What survives a battle — and what you learned — comes with you to the next.',
    ],
    lives: 20,
    waves: null,
    designGold: 260,
    playable: false,
    comingSoon: true,
    soonLabel: 'coming soon',
  },
} as const satisfies Record<GameModeId, GameModeDef>;

export const MODE_ORDER: GameModeId[] = ['siege', 'campaign'];

export const DEFAULT_MODE: GameModeId = 'siege';

export function modeDef(id: GameModeId): GameModeDef {
  return MODES[id];
}
