/**
 * Global technologies developed at a Scholars' Hall. Unlike tower upgrades a
 * technology is bought once and then applies to the whole realm: it can unlock
 * upgrades on several different towers, unlock a new building, or hand out a
 * flat bonus. Research is immediate — there is no development time.
 */
export interface TechEffects {
  /** Added to the hit chance of every projectile tower. */
  accuracy?: number;
}

export interface TechDef {
  id: string;
  name: string;
  description: string;
  cost: number;
  /** Technologies that must be bought first. */
  requires?: readonly string[];
  effects?: TechEffects;
}

export const TECHS = {
  'fire-projectiles': {
    id: 'fire-projectiles',
    name: 'Fire Projectiles',
    description:
      'Pitch and tinder for the ammunition. Unlocks flaming shot on towers that can carry it, and burning oil at a gatehouse.',
    cost: 200,
  },
  'advanced-construction': {
    id: 'advanced-construction',
    name: 'Advanced Construction',
    description:
      'Masonry, mortar, joinery and the mathematics of leverage. Unlocks the Stone Gatehouse, siege engines such as the Catapult, and the larger houses.',
    // Was 240, and at that price it was a trap: 150 for the hall plus 240 for
    // the technology, to unlock buildings that then cost 120–220 each. In
    // testing, researching it lost and ignoring it won.
    //
    // It matters far more now. A realm that fights in the road cannot stop
    // volume — a melee post holds exactly one enemy while the rest walk past —
    // so the gate that makes the enemy stop and the siege engine that hits a
    // crowd are not luxuries for the Kingdom, they are how it works at all.
    cost: 170,
  },
  'field-medicine': {
    id: 'field-medicine',
    name: 'Field Medicine',
    description:
      'Bandages, bone-setting and boiled wine. Unlocks the Field Hospital, where wounded fighters are patched up.',
    // Was 180. A realm that fights in the road loses men rather than arrows,
    // so for the Kingdom this is not a luxury technology — it is the
    // difference between attrition it can absorb and attrition that bankrupts
    // it. At 180, on top of 150 for the hall, it simply never got bought in
    // testing: the gold always went to another post instead, which is the
    // definition of a technology priced wrong.
    cost: 110,
  },
  husbandry: {
    id: 'husbandry',
    name: 'Husbandry',
    description:
      'Breeding, stabling and the working harness. Lets a farm put a horse to the plough for a much larger harvest.',
    cost: 190,
  },
  marksmanship: {
    id: 'marksmanship',
    name: 'Marksmanship',
    description: 'Drill and better fletching. Every projectile tower gains 7% hit chance.',
    cost: 160,
    effects: { accuracy: 0.07 },
  },
  ballistics: {
    id: 'ballistics',
    name: 'Ballistics',
    description: 'Range tables and windage. A further 8% hit chance for every projectile tower.',
    cost: 280,
    requires: ['marksmanship'],
    effects: { accuracy: 0.08 },
  },
} as const satisfies Record<string, TechDef>;

export type TechId = keyof typeof TECHS;

/** Order the technologies are listed in the Scholars' Hall. */
export const TECH_ORDER: TechId[] = [
  'advanced-construction',
  'fire-projectiles',
  'field-medicine',
  'husbandry',
  'marksmanship',
  'ballistics',
];

/** Sum of every flat bonus granted by the technologies bought so far. */
export function techEffects(unlocked: ReadonlySet<string>): Required<TechEffects> {
  let accuracy = 0;
  for (const id of unlocked) {
    const tech = TECHS[id as TechId];
    if (tech && 'effects' in tech && tech.effects) accuracy += tech.effects.accuracy ?? 0;
  }
  return { accuracy };
}
