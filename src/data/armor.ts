import type { DamageType } from './towers';

/**
 * What someone is wearing. Heavier armour is better on average, but it is not a
 * single dial: each damage type falls off through the scale at its own rate,
 * and blunt force actually gets *better* the heavier the target is dressed.
 */
export type ArmorType = 'unarmored' | 'light' | 'medium' | 'heavy';

export const ARMOR_LABEL: Record<ArmorType, string> = {
  unarmored: 'Unarmoured',
  light: 'Light',
  medium: 'Medium',
  heavy: 'Heavy',
};

export const ARMOR_ORDER: ArmorType[] = ['unarmored', 'light', 'medium', 'heavy'];

/**
 * Damage multiplier for each attack type against each armour type.
 *
 * All damage numbers elsewhere are quoted as if against unarmoured targets, and
 * this table adjusts from there. The design intent:
 *
 * - **Pierce** shreds the unprotected but skids off plate — the steepest fall.
 * - **Slash** cuts flesh and leather well, poorly through mail and plate.
 * - **Blunt** wastes its force on a nimble unarmoured target, and is the only
 *   thing that reliably hurts heavy armour.
 * - **Fire** barely cares what you are wearing, so it is the safe answer when
 *   you have guessed the enemy's armour wrong.
 *
 * Averaged over the four attack types, the armour tiers come out at roughly
 * 106% / 104% / 89% / 75%, so heavier armour is still better overall.
 */
export const DAMAGE_MATRIX: Record<DamageType, Record<ArmorType, number>> = {
  pierce: { unarmored: 1.25, light: 1.1, medium: 0.7, heavy: 0.4 },
  slash: { unarmored: 1.15, light: 1.1, medium: 0.85, heavy: 0.55 },
  blunt: { unarmored: 0.85, light: 0.95, medium: 1.05, heavy: 1.2 },
  fire: { unarmored: 1.0, light: 1.0, medium: 0.95, heavy: 0.85 },
};

/** How much of a hit actually lands, given the attack and what it strikes. */
export function damageMultiplier(type: DamageType, armor: ArmorType): number {
  return DAMAGE_MATRIX[type][armor];
}

/** Compact "125 · 100 · 70 · 40" string for a damage type, for the HUD. */
export function effectivenessRow(type: DamageType): string {
  return ARMOR_ORDER.map((armor) => Math.round(DAMAGE_MATRIX[type][armor] * 100)).join(' · ');
}
