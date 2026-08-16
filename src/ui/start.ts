/**
 * The start screen: the rules, and the four choices a new game is made of.
 *
 * Everything offered here is read from `src/data/` — nations, maps and modes
 * all render themselves from their own definitions, including whether they have
 * actually been balanced. Adding a mode or a map should mean adding a data
 * entry and nothing else; if you find yourself editing this file to add
 * content, the shape of the data is wrong.
 *
 * It hands back a plain configuration object rather than touching the game, so
 * nothing here knows how a game is started.
 */

import { MAPS, type MapDef } from '../data/maps';
import { modeDef, MODE_ORDER, type GameModeId } from '../data/modes';
import { nationDef, NATION_ORDER, type NationId } from '../data/nations';
import { DESIGN_STARTING_GOLD } from '../game/Game';

export interface StartConfig {
  nation: NationId;
  map: MapDef;
  mode: GameModeId;
  startingGold: number;
}

export interface StartScreen {
  show(): void;
  hide(): void;
  readonly visible: boolean;
}

/** A card in one of the three choosers. */
interface Choice {
  id: string;
  name: string;
  blurb: string;
  /** Extra lines under the blurb — a nation's perks, a mode's rules. */
  notes?: readonly string[];
  /** Shown as a warning flag on the card, or null when there is nothing to say. */
  caution: string | null;
  /** Announced but not yet buildable: shown, greyed, and not selectable. */
  locked?: boolean;
}

/**
 * The rules, in the order a new player needs them. Written here rather than in
 * the markup so it sits next to the code that knows what the game actually
 * does — every number quoted below is one that is not tuned per nation.
 */
const RULES: Array<{ title: string; body: string }> = [
  {
    title: 'The way in, and the gate',
    body: 'Enemies march on your city. Every one that reaches a gate costs you a life; at zero lives the realm falls. Most maps give them a road, with hidden trails joining it partway along — but not all. On open ground they cross wherever they like, and a map may have more than one gate to hold.',
  },
  {
    title: 'Building',
    body: 'Click a building in the panel on the left, then click the ground to raise it. Right-click or Esc cancels. You may build during a wave. Click anything already standing to see its numbers, buy its upgrades, or sell it for half of what you have spent on it.',
  },
  {
    title: 'Where you may build',
    body: 'On a road map: anywhere clear of the road and the scenery. On open ground there is no road to keep clear of — instead only the hills will take a foundation, and a wall can only be thrown across a marked gap between them. The build panel tells you which map you are on.',
  },
  {
    title: 'Men, not turrets',
    body: 'Melee posts send real fighters onto the road who hold an enemy in place and are struck back. A post holds one enemy at a time — which is why a defence packed into one stretch of road beats the same buildings spread thin, every time.',
  },
  {
    title: 'Armour and damage',
    body: 'Damage is quoted against unarmoured targets; slash, pierce, blunt and fire each fare differently against light, medium and heavy armour. Blunt keeps its bite as armour thickens, which is what the armoured waves force on you. Every panel shows the four figures.',
  },
  {
    title: 'Housing and food',
    body: 'Every manned building needs somewhere to live and something to eat. Housing is a hard cap: without a spare place you cannot build. Food is a soft one: come up short and every tower fights at 60% until the harvest covers them again. The market inside the walls trades grain for coin at a deliberately poor rate.',
  },
  {
    title: 'Wounds and repairs',
    body: 'A field hospital treats wounded fighters and mends damaged emplacements within its reach — and a building being worked on is not shooting, which is the whole cost. Fighters fall back when badly hurt, and use a lull in the fighting to get patched up.',
  },
  {
    title: 'Research',
    body: 'A Scholars’ Hall on its plot inside the walls unlocks technologies: field medicine, husbandry, masonry and the rest. Research is bought once and applies to the whole realm.',
  },
  {
    title: 'Money',
    body: 'Enemies pay a bounty when killed, and clearing a wave pays more. Late waves pay a smaller share of their listed bounty than early ones, so getting ahead early does not stay ahead by itself.',
  },
];

function cardHtml(choice: Choice, selected: boolean): string {
  const notes = (choice.notes ?? []).map((n) => `<li>${n}</li>`).join('');
  const flag = choice.caution
    ? `<span class="start-card-flag${choice.locked ? ' soon' : ''}">${choice.caution}</span>`
    : '';
  return (
    `<button type="button" class="start-card${selected ? ' selected' : ''}` +
    `${choice.locked ? ' locked' : ''}" data-id="${choice.id}"${choice.locked ? ' disabled' : ''}>` +
    `<span class="start-card-head"><span class="start-card-name">${choice.name}</span>` +
    flag +
    '</span>' +
    `<span class="start-card-blurb">${choice.blurb}</span>` +
    (notes ? `<ul class="start-card-notes">${notes}</ul>` : '') +
    '</button>'
  );
}

function required<T extends Element>(selector: string): T {
  const el = document.querySelector<T>(selector);
  if (!el) throw new Error(`Missing ${selector} in index.html`);
  return el;
}

export function createStartScreen(onStart: (config: StartConfig) => void): StartScreen {
  const root = required<HTMLElement>('#start');
  const rulesBody = required<HTMLElement>('#start-rules-body');
  const modesEl = required<HTMLElement>('#start-modes');
  const nationsEl = required<HTMLElement>('#start-nations');
  const mapsEl = required<HTMLElement>('#start-maps');
  const goldInput = required<HTMLInputElement>('#start-gold');
  const presetsEl = required<HTMLElement>('#start-gold-presets');
  const goldNote = required<HTMLElement>('#start-gold-note');
  const summaryEl = required<HTMLElement>('#start-summary');
  const beginBtn = required<HTMLButtonElement>('#btn-begin');

  let mode: GameModeId = MODE_ORDER[0];
  let nation: NationId = NATION_ORDER[0];
  let map: MapDef = MAPS[0];
  let gold = DESIGN_STARTING_GOLD;

  rulesBody.innerHTML = RULES.map(
    (rule) => `<h3>${rule.title}</h3><p>${rule.body}</p>`,
  ).join('');

  const modeChoices = (): Choice[] =>
    MODE_ORDER.map((id) => {
      const def = modeDef(id);
      return {
        id,
        name: def.name,
        blurb: def.blurb,
        notes: def.rules,
        caution: def.comingSoon ? (def.soonLabel ?? 'coming soon') : def.playable ? null : 'unfinished',
        locked: def.comingSoon === true,
      };
    });

  const nationChoices = (): Choice[] =>
    NATION_ORDER.map((id) => {
      const def = nationDef(id);
      return {
        id,
        name: def.name,
        blurb: def.blurb,
        notes: def.perks,
        caution: def.playable ? null : 'not balanced',
      };
    });

  const mapChoices = (): Choice[] =>
    MAPS.map((def) => ({
      id: def.id,
      name: def.name,
      blurb: def.blurb,
      caution: def.balanced ? null : 'not balanced',
    }));

  function render(): void {
    modesEl.innerHTML = modeChoices().map((c) => cardHtml(c, c.id === mode)).join('');
    nationsEl.innerHTML = nationChoices().map((c) => cardHtml(c, c.id === nation)).join('');
    mapsEl.innerHTML = mapChoices().map((c) => cardHtml(c, c.id === map.id)).join('');

    // Only written back when it actually disagrees, so typing into the box is
    // not fought by the re-render it triggers.
    if (Number(goldInput.value) !== gold) goldInput.value = String(gold);
    goldNote.textContent =
      gold === DESIGN_STARTING_GOLD
        ? `${DESIGN_STARTING_GOLD} is what the game is designed and balanced around.`
        : gold > DESIGN_STARTING_GOLD
          ? `Above the designed ${DESIGN_STARTING_GOLD}: an easier opening than the waves expect.`
          : `Below the designed ${DESIGN_STARTING_GOLD}: the opening waves will be tight.`;

    const cautions = [
      modeDef(mode).playable ? null : 'this mode is unfinished',
      nationDef(nation).playable ? null : 'this nation has not been balanced',
      map.balanced ? null : 'this map has not been balanced',
    ].filter((c): c is string => c !== null);

    summaryEl.textContent =
      `${nationDef(nation).name} · ${map.name} · ${modeDef(mode).name} · ${gold} gold` +
      (cautions.length ? ` — ${cautions.join(', ')}.` : '');
    summaryEl.classList.toggle('caution', cautions.length > 0);
  }

  /** One delegated listener per chooser, so re-rendering never loses a handler. */
  function wireCards(host: HTMLElement, pick: (id: string) => void): void {
    host.addEventListener('click', (event) => {
      const card = (event.target as HTMLElement | null)?.closest<HTMLElement>('.start-card');
      const id = card?.dataset.id;
      if (!id) return;
      pick(id);
      render();
    });
  }

  wireCards(modesEl, (id) => {
    // A locked card is a promise, not an option. The button is disabled too;
    // this is the rule rather than the decoration of it.
    if (modeDef(id as GameModeId)?.comingSoon) return;
    mode = id as GameModeId;
    // A mode is designed around a purse; follow it unless the player has
    // already typed one of their own.
    if (gold === DESIGN_STARTING_GOLD) gold = modeDef(mode).designGold;
  });
  wireCards(nationsEl, (id) => {
    nation = id as NationId;
  });
  wireCards(mapsEl, (id) => {
    map = MAPS.find((m) => m.id === id) ?? map;
  });

  presetsEl.innerHTML = [
    { label: 'Designed', value: DESIGN_STARTING_GOLD },
    { label: 'Generous', value: 600 },
    { label: 'Sandbox', value: 3000 },
  ]
    .map((p) => `<button type="button" class="start-preset" data-gold="${p.value}">${p.label}</button>`)
    .join('');

  presetsEl.addEventListener('click', (event) => {
    const value = (event.target as HTMLElement | null)?.closest<HTMLElement>('.start-preset')
      ?.dataset.gold;
    if (!value) return;
    gold = Number(value);
    render();
  });

  goldInput.addEventListener('input', () => {
    const value = Number(goldInput.value);
    if (!Number.isFinite(value)) return;
    gold = Math.max(0, Math.round(value));
    render();
  });

  beginBtn.addEventListener('click', () => {
    onStart({ nation, map, mode, startingGold: gold });
  });

  render();

  return {
    show(): void {
      root.classList.remove('hidden');
    },
    hide(): void {
      root.classList.add('hidden');
    },
    get visible(): boolean {
      return !root.classList.contains('hidden');
    },
  };
}

