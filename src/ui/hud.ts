import { ARMOR_LABEL, effectivenessRow } from '../data/armor';
import type { Creep } from '../game/Creep';
import { DOG_ARMOR } from '../game/Dog';
import { NATION_ORDER, NATIONS, type NationId } from '../data/nations';
import { TECH_ORDER, TECHS, type TechId } from '../data/tech';
import { DAMAGE_LABEL, towerDef, type TowerDef, type TowerId } from '../data/towers';
import {
  CASTLE_GATE_UPGRADE,
  FOOD_BUY_PRICE,
  FOOD_SELL_PRICE,
  FOOD_TRADE_LOT,
  type Game,
  type LotRef,
} from '../game/Game';
import type { GateSlotRef, Gatehouse } from '../game/Gatehouse';
import type { Tower } from '../game/Tower';

function required<T extends Element>(selector: string): T {
  const el = document.querySelector<T>(selector);
  if (!el) throw new Error(`Missing element in index.html: ${selector}`);
  return el;
}

export interface Hud {
  update(): void;
}

/** One buyable row in the tower panel: either an upgrade or a technology. */
interface Option {
  id: string;
  name: string;
  description: string;
  cost: number;
  owned: boolean;
  /** Reason it cannot be bought, or null when it can. */
  blocker: string | null;
  /** How deep in the prerequisite tree this sits; 0 is a root. */
  depth: number;
}

/**
 * Depth of each entry in a prerequisite tree, so the panel can indent
 * successors under the thing they unlock.
 */
function depthsOf<T extends { id: string; requires?: readonly string[] }>(
  entries: readonly T[],
): Map<string, number> {
  const byId = new Map(entries.map((e) => [e.id, e]));
  const depths = new Map<string, number>();

  const walk = (id: string, seen: Set<string>): number => {
    const cached = depths.get(id);
    if (cached !== undefined) return cached;
    if (seen.has(id)) return 0; // guard against a bad data cycle
    seen.add(id);

    const entry = byId.get(id);
    const parents = entry?.requires ?? [];
    const depth = parents.length === 0 ? 0 : 1 + Math.max(...parents.map((p) => walk(p, seen)));
    depths.set(id, depth);
    return depth;
  };

  for (const entry of entries) walk(entry.id, new Set());
  return depths;
}

/** House and ear-of-corn glyphs, matching the icons in the top bar. */
const HOUSING_ICON = '&#8962;';
const FOOD_ICON = '&#127805;';

/**
 * "⌂2 · 🌾3" — what a building costs besides gold. Empty for anything that
 * needs neither, so the row simply does not appear.
 */
function upkeepLabel(def: TowerDef): string {
  const parts: string[] = [];
  if (def.housing) parts.push(`${HOUSING_ICON}${def.housing}`);
  if (def.food) parts.push(`${FOOD_ICON}${def.food}`);
  return parts.join(' · ');
}

export function createHud(game: Game): Hud {
  const goldEl = required<HTMLElement>('#stat-gold');
  const livesEl = required<HTMLElement>('#stat-lives');
  const waveEl = required<HTMLElement>('#stat-wave');
  const housingEl = required<HTMLElement>('#stat-housing');
  const foodEl = required<HTMLElement>('#stat-food');
  const fpStore = required<HTMLElement>('#fp-store');
  const fpHarvest = required<HTMLElement>('#fp-harvest');
  const fpUpkeep = required<HTMLElement>('#fp-upkeep');
  const fpAfter = required<HTMLElement>('#fp-after');
  const fpNote = required<HTMLElement>('#fp-note');

  // Hover shows the forecast; clicking pins it open.
  required<HTMLElement>('#food-stat').addEventListener('click', (event) => {
    event.stopPropagation();
    (event.currentTarget as HTMLElement).classList.toggle('open');
  });
  const waveBtn = required<HTMLButtonElement>('#btn-wave');
  const shopEl = required<HTMLElement>('#shop-items');
  const overlay = required<HTMLElement>('#overlay');
  const overlayTitle = required<HTMLElement>('#overlay-title');
  const overlayText = required<HTMLElement>('#overlay-text');
  const restartBtn = required<HTMLButtonElement>('#btn-restart');

  const shopTitle = required<HTMLElement>('#shop-title');
  const shopPerks = required<HTMLElement>('#shop-perks');
  const buttons = new Map<TowerId, HTMLButtonElement>();

  /**
   * The build panel is the one part of the HUD that is nation-specific, so it
   * is rebuilt from the roster rather than written once. `lastRoster` is what
   * it was last built for, so `update` can notice a nation change.
   */
  let lastRoster = '';

  function buildShop(): void {
    shopEl.innerHTML = '';
    buttons.clear();
    shopTitle.textContent = game.nationDef.name;
    // The blurb plus whatever rules this nation bends, so the perk is
    // discoverable rather than something you have to notice in the numbers.
    shopTitle.title = [game.nationDef.blurb, ...(game.nationDef.perks ?? [])].join('\n');
    shopPerks.innerHTML = (game.nationDef.perks ?? [])
      .map((perk) => `<span>${perk}</span>`)
      .join('');

    for (const id of game.roster) {
      const def = towerDef(id);
      const btn = document.createElement('button');
      btn.className = 'shop-item';
      btn.title = def.blurb;
      btn.innerHTML =
        `<span class="swatch" style="background:${def.baseColor}"></span>` +
        `<span><span class="name">${def.name}</span><span class="cost">${game.costOf(def)} gold</span>` +
        `<span class="upkeep">${upkeepLabel(def)}</span>` +
        `<span class="lock"></span></span>`;
      btn.addEventListener('click', () => {
        game.selectedTowerId = game.selectedTowerId === id ? null : id;
        if (game.selectedTowerId) game.selected = null;
      });
      shopEl.appendChild(btn);
      buttons.set(id, btn);
    }
    lastRoster = game.roster.join(',');
  }

  buildShop();

  const towerPanel = required<HTMLElement>('#tower-panel');
  const tpName = required<HTMLElement>('#tp-name');
  const tpStats = required<HTMLElement>('#tp-stats');
  const tpOptions = required<HTMLElement>('#tp-options');
  const closeTowerBtn = required<HTMLButtonElement>('#btn-close-tower');

  // Testing aids: the purse a new game starts with, and which nation to play.
  // There is no pre-game chooser yet, so this dropdown is how the second
  // nation gets looked at at all.
  const devGold = required<HTMLInputElement>('#dev-gold');
  const devNation = required<HTMLSelectElement>('#dev-nation');
  const newGameBtn = required<HTMLButtonElement>('#btn-newgame');
  devGold.value = String(game.startingGold);

  devNation.innerHTML = NATION_ORDER.map((id) => {
    const nation = NATIONS[id];
    const label = nation.playable ? nation.name : `${nation.name} (unbalanced)`;
    return `<option value="${id}">${label}</option>`;
  }).join('');
  devNation.value = game.nation;

  newGameBtn.addEventListener('click', () => {
    const value = Number(devGold.value);
    if (Number.isFinite(value) && value >= 0) game.startingGold = Math.round(value);
    game.nation = devNation.value as NationId;
    game.reset();
  });

  waveBtn.addEventListener('click', () => game.startWave());
  restartBtn.addEventListener('click', () => game.reset());
  closeTowerBtn.addEventListener('click', () => {
    game.selected = null;
  });

  // One delegated listener, so rebuilding the list never loses its handlers.
  tpOptions.addEventListener('click', (event) => {
    const target = event.target as HTMLElement | null;
    const row = target?.closest<HTMLElement>('[data-buy]');
    if (!row) return;
    const id = row.dataset.buy;
    if (!id) return;

    if (game.selectedGate) {
      if (id === 'repair') game.repairSelectedGate();
      else if (id.startsWith('gate:')) game.buyGateUpgrade(id.slice(5));
      return;
    }

    if (game.selectedLot) {
      game.buildOnLot(game.selectedLot.lot);
      return;
    }

    if (game.selectedMarket) {
      if (id === 'market:buy') game.buyFood();
      else if (id === 'market:sell') game.sellFood();
      return;
    }

    if (game.selectedCastleGate) {
      game.reinforceKeepGate();
      return;
    }

    if (game.selectedSlot) {
      const [slot, towerId] = id.split(':');
      game.buildInSlot(Number(slot), towerId as TowerId);
      return;
    }

    if (game.selectedTower?.def.visual === 'research') game.startResearch(id);
    else game.buyUpgrade(id);
  });

  // ------------------------------------------------------------- panel data

  /** Rows for the gate itself: repair plus the upgrades that toughen it. */
  function gateOptions(gate: Gatehouse): Option[] {
    const cost = gate.repairCost;
    const rows: Option[] = [
      {
        id: 'repair',
        name: 'Repair Gate',
        description: 'Rebuild the gate to full. Damage is never repaired for free between waves.',
        cost,
        owned: cost === 0,
        blocker: cost === 0 ? null : game.gold < cost ? 'Not enough gold' : null,
        depth: 0,
      },
    ];

    const depths = depthsOf(gate.def.upgrades);
    for (const upgrade of gate.def.upgrades) {
      const owned = gate.purchased.has(upgrade.id);
      rows.push({
        id: `gate:${upgrade.id}`,
        name: upgrade.name,
        description: upgrade.description,
        cost: upgrade.cost,
        owned,
        blocker: owned
          ? null
          : (gate.blockerFor(upgrade, game.techs) ??
            (game.gold < upgrade.cost ? 'Not enough gold' : null)),
        depth: depths.get(upgrade.id) ?? 0,
      });
    }
    return rows;
  }

  /** Rows for an empty city plot: raise the one building it is set aside for. */
  function lotOptions(ref: LotRef): Option[] {
    const def = towerDef(ref.lot.accepts as TowerId);
    return [
      {
        id: `lot:${ref.lot.id}`,
        name: `Build ${def.name}`,
        description: def.blurb,
        cost: game.costOf(def),
        owned: false,
        blocker: game.lotBlocker(ref.lot),
        depth: 0,
      },
    ];
  }

  /** Rows for the market square: grain for coin and back again. */
  function marketOptions(): Option[] {
    return [
      {
        id: 'market:buy',
        name: `Buy ${FOOD_TRADE_LOT} grain`,
        description: `Pay ${FOOD_BUY_PRICE * FOOD_TRADE_LOT} gold for ${FOOD_TRADE_LOT} food, added to the stack.`,
        cost: FOOD_BUY_PRICE * FOOD_TRADE_LOT,
        owned: false,
        blocker: game.canBuyFood ? null : 'Not enough gold',
        depth: 0,
      },
      {
        id: 'market:sell',
        name: `Sell ${FOOD_TRADE_LOT} grain`,
        description: `Take ${FOOD_SELL_PRICE * FOOD_TRADE_LOT} gold for ${FOOD_TRADE_LOT} food from the stack.`,
        cost: 0,
        owned: false,
        blocker: game.canSellFood ? null : 'Not enough grain',
        depth: 0,
      },
    ];
  }

  /** The one thing that can be done to the city's own gate. */
  function castleGateOptions(): Option[] {
    const up = CASTLE_GATE_UPGRADE;
    return [
      {
        id: up.id,
        name: up.name,
        description: up.description,
        cost: up.cost,
        owned: game.keepGateReinforced,
        blocker: game.keepGateReinforced ? null : game.keepGateBlocker(),
        depth: 0,
      },
    ];
  }

  /** Rows for an empty emplacement: pick what to install in it. */
  function slotOptions(slot: GateSlotRef): Option[] {
    return game.gateSlotOptions.map((id) => {
      const def = towerDef(id);
      const locked = def.requiresTech && !game.techs.has(def.requiresTech);
      const techName = def.requiresTech ? (TECHS[def.requiresTech as TechId]?.name ?? '') : '';
      return {
        id: `${slot.index}:${id}`,
        name: def.name,
        description: def.blurb,
        cost: game.costOf(def),
        owned: false,
        blocker: locked
          ? `Needs ${techName}`
          : game.gold < game.costOf(def)
            ? 'Not enough gold'
            : null,
        depth: 0,
      };
    });
  }

  function optionsFor(tower: Tower): Option[] {
    if (tower.def.visual === 'research') {
      const techs = TECH_ORDER.map((id) => TECHS[id]);
      const depths = depthsOf(techs);
      return techs.map((tech) => {
        const owned = game.techs.has(tech.id);
        return {
          id: tech.id,
          name: tech.name,
          description: tech.description,
          cost: game.techCostOf(tech),
          owned,
          blocker: owned ? null : game.researchBlocker(tech),
          depth: depths.get(tech.id) ?? 0,
        };
      });
    }

    const depths = depthsOf(tower.def.upgrades);
    // Hide upgrades the building already effectively has — a farm inside the
    // walls needs no scarecrow.
    const offered = tower.def.upgrades.filter(
      (u) => tower.purchased.has(u.id) || !tower.isRedundant(u),
    );
    return offered.map((upgrade) => {
      const owned = tower.purchased.has(upgrade.id);
      return {
        id: upgrade.id,
        name: upgrade.name,
        description: upgrade.description,
        cost: upgrade.cost,
        owned,
        blocker: owned
          ? null
          : (tower.blockerFor(upgrade, game.techs) ??
            (game.gold < upgrade.cost ? 'Not enough gold' : null)),
        depth: depths.get(upgrade.id) ?? 0,
      };
    });
  }

  function creepStatRows(creep: Creep): Array<[string, string]> {
    const def = creep.def;
    const rows: Array<[string, string]> = [
      ['Health', `${Math.round(creep.hp)} / ${creep.maxHp}`],
      ['Armour', ARMOR_LABEL[def.armor]],
      ['Speed', `${Math.round(def.speed)}/s`],
    ];

    // Things that carry no weapon — a ram, the flail knight — should not show
    // a melee line reading zero.
    if (def.melee > 0) {
      rows.push(['Melee damage', `${def.melee}/hit, ${def.attackSpeed}/s`]);
      rows.push(['Damage type', DAMAGE_LABEL[def.meleeType]]);
      rows.push(['vs U·L·M·H', `${effectivenessRow(def.meleeType)}%`]);
    }

    if (def.bombard) {
      rows.push(['Shoots at', 'Your emplacements']);
      rows.push(['Shot', `${def.bombard.damage} ${DAMAGE_LABEL[def.bombard.type]}, ${def.bombard.rate}/s`]);
      rows.push(['Reach', String(def.bombard.range)]);
      rows.push(['vs U·L·M·H', `${effectivenessRow(def.bombard.type)}%`]);
    }

    if (def.sweep) {
      rows.push(['Sweep', `${def.sweep.damage} every ${def.sweep.interval}s`]);
      rows.push(['Sweep radius', String(def.sweep.radius)]);
      rows.push(['Damage type', DAMAGE_LABEL[def.sweep.type]]);
      rows.push(['vs U·L·M·H', `${effectivenessRow(def.sweep.type)}%`]);
    }

    if (def.ignoresBlock) rows.push(['Cannot be held', 'Walks on regardless']);
    rows.push(['Bounty', `${def.bounty} gold`]);
    rows.push(['Leak cost', `${def.leak} ${def.leak === 1 ? 'life' : 'lives'}`]);
    return rows;
  }

  function gateStatRows(gate: Gatehouse): Array<[string, string]> {
    return [
      ['Integrity', `${Math.round(gate.hp)} / ${gate.maxHp}`],
      ['Status', gate.isOpen ? 'Broken open' : 'Holding'],
      ['Turrets manned', `${gate.installed.length} / ${gate.slots.length}`],
    ];
  }

  /**
   * What the building costs to keep, and whether it is currently being kept.
   * Shown on every building that needs either, above its combat numbers.
   */
  function upkeepRows(tower: Tower): Array<[string, string]> {
    const rows: Array<[string, string]> = [];
    if (tower.def.housing) rows.push(['Housing', `${tower.def.housing} people`]);
    if (tower.def.food) rows.push(['Eats', `${tower.def.food} food per wave`]);
    if (tower.effectiveness < 1) {
      rows.push(['Hungry', `Fighting at ${Math.round(tower.effectiveness * 100)}%`]);
    }
    return rows;
  }

  /** How much punishment a shootable emplacement has left in it. */
  function structureRows(tower: Tower): Array<[string, string]> {
    if (!tower.isShootable) return [];
    const rows: Array<[string, string]> = [
      ['Structure', `${Math.round(tower.buildingHp)} / ${tower.stats.buildingHp}`],
    ];
    if (tower.stats.selfRepair > 0) {
      rows.push(['Crew repairs', `${Math.round(tower.stats.selfRepair)}/s`]);
      if (tower.repairing) rows.push(['Status', 'Mending — not shooting']);
    }
    return rows;
  }

  /** What this building has actually done, as opposed to what it promises. */
  function recordRows(tower: Tower): Array<[string, string]> {
    if (tower.def.attack === 'none') return [];
    const dealt = Math.round(tower.damageDealt);
    return [
      ['Damage dealt', dealt >= 10000 ? `${(dealt / 1000).toFixed(1)}k` : String(dealt)],
      ['Kills', String(tower.kills)],
    ];
  }

  function statRows(tower: Tower): Array<[string, string]> {
    const s = tower.stats;
    const rows: Array<[string, string]> = [...upkeepRows(tower)];

    if (tower.def.visual === 'research') {
      rows.push(['Researched', `${game.techs.size} / ${TECH_ORDER.length}`]);
      return rows;
    }
    if (tower.def.visual === 'house') {
      rows.push(['Shelters', String(s.houseCapacity)]);
      rows.push(['Realm housing', `${game.housingUsed} / ${game.housingCapacity}`]);
      return rows;
    }
    if (tower.def.visual === 'farm') {
      rows.push(['Harvest', `${Math.round(tower.harvest)} / ${s.foodOutput}`]);
      // Say why the harvest reads zero, rather than leaving it looking broken.
      if (tower.raisedMidWave) rows.push(['Sown late', 'Nothing to reap this wave']);
      rows.push(['Crows', s.crowProtection >= 1 ? 'Kept off' : tower.harvestSpoiled ? 'Spoiling it' : 'Unprotected']);
      rows.push(['Realm food', `${Math.round(game.foodProduction)} / ${game.foodUpkeep}`]);
      return rows;
    }
    if (tower.def.visual === 'hospital') {
      rows.push(['Healing', `${Math.round(s.healRate)}/s`]);
      rows.push(['Reach', String(Math.round(s.range))]);
      rows.push(['Ward radius', String(Math.round(tower.def.radius))]);
      rows.push(['Also mends', 'Damaged emplacements in reach']);
      return rows;
    }
    if (tower.def.attack === 'none') return rows;

    if (tower.def.attack === 'melee') {
      rows.push(['Range', String(Math.round(s.range))]);
      rows.push(['Damage', `${Math.round(s.unitDps)}/s`]);
      const hp = tower.units.reduce((sum, u) => sum + u.hp, 0);
      rows.push(['Health', `${Math.round(hp)} / ${s.unitHp * s.units}`]);
      rows.push(['Armour', ARMOR_LABEL[s.armor]]);
      rows.push(['Retreats at', `${Math.round(s.retreatAt * 100)}%`]);
      if (s.units > 1) rows.push(['Fighters', `${tower.units.length} / ${s.units}`]);
      if (s.whirlwindDamage > 0) {
        rows.push(['Sweep', `${s.whirlwindDamage} every ${s.whirlwindInterval}s`]);
      }
      rows.push(['Damage type', DAMAGE_LABEL[s.damageType]]);
      rows.push(['vs U·L·M·H', `${effectivenessRow(s.damageType)}%`]);
      rows.push(...recordRows(tower));
      return rows;
    }

    rows.push(['Range', String(Math.round(s.range))]);

    if (tower.def.attack === 'projectile') {
      rows.push(['Damage', String(Math.round(s.damage))]);
      rows.push(['Rate', `${s.fireRate.toFixed(2)}/s`]);
      const hit = Math.min(1, s.accuracy + game.accuracyBonus);
      rows.push(['Hit chance', `${Math.round(hit * 100)}%`]);
      if (s.splashRadius > 0) rows.push(['Blast', String(Math.round(s.splashRadius))]);
      rows.push(['Damage type', DAMAGE_LABEL[s.damageType]]);
      rows.push(['vs U·L·M·H', `${effectivenessRow(s.damageType)}%`]);
      if (s.burnDuration > 0) rows.push(['Burns', `${s.burnDps}/s for ${s.burnDuration}s`]);
    } else {
      rows.push(['Dogs', `${tower.dogs.length} / ${s.dogs}`]);
      rows.push(['Bite', `${Math.round(s.dogDps)}/s`]);
      rows.push(['Damage type', DAMAGE_LABEL.slash]);
      const left = tower.dogs.reduce((sum, dog) => sum + dog.hp, 0);
      rows.push(['Health', `${Math.round(left)} / ${s.dogHp * s.dogs}`]);
      rows.push(['Armour', ARMOR_LABEL[DOG_ARMOR]]);
    }
    rows.push(...structureRows(tower));
    rows.push(...recordRows(tower));
    return rows;
  }

  /** Rebuild the option rows only when something structural changed. */
  let lastSignature = '';

  function renderTowerPanel(): void {
    const selected = game.selected;
    towerPanel.classList.toggle('hidden', !selected);
    if (!selected) {
      lastSignature = '';
      return;
    }

    const gate = game.selectedGate;
    const slot = game.selectedSlot;
    const lot = game.selectedLot;
    const market = game.selectedMarket;
    const castleGate = game.selectedCastleGate;
    const tower = game.selectedTower;
    const creep = game.selectedCreep;

    if (creep) {
      tpName.textContent = creep.def.name;
      tpStats.innerHTML = creepStatRows(creep)
        .map(([k, v]) => `<span class="k">${k}</span><span class="v">${v}</span>`)
        .join('');
    } else if (lot) {
      const def = towerDef(lot.lot.accepts as TowerId);
      tpName.textContent = `Empty Plot — ${def.name}`;
      tpStats.innerHTML =
        `<span class="k">Reserved for</span><span class="v">${def.name}</span>` +
        `<span class="k">Cost</span><span class="v">${game.costOf(def)} gold</span>`;
    } else if (market) {
      const f = game.foodForecast;
      tpName.textContent = 'Market Square';
      tpStats.innerHTML =
        `<span class="k">Gold</span><span class="v">${game.gold}</span>` +
        `<span class="k">Grain in store</span><span class="v">${f.store}</span>` +
        `<span class="k">After this wave</span><span class="v">${f.after}</span>`;
    } else if (castleGate) {
      tpName.textContent = 'City Gate';
      tpStats.innerHTML =
        `<span class="k">Lives</span><span class="v">${game.lives}</span>` +
        `<span class="k">Keep gate</span><span class="v">${
          game.keepGateReinforced ? 'Reinforced' : 'As built'
        }</span>`;
    } else if (gate) {
      tpName.textContent = `${gate.def.name} — Gate`;
      tpStats.innerHTML = gateStatRows(gate)
        .map(([k, v]) => `<span class="k">${k}</span><span class="v">${v}</span>`)
        .join('');
    } else if (slot) {
      tpName.textContent = `${slot.index === 0 ? 'Left' : 'Right'} Turret`;
      tpStats.innerHTML =
        '<span class="k">Status</span><span class="v">Empty</span>';
    } else if (tower) {
      tpName.textContent =
        tower.purchased.size > 0
          ? `${tower.def.name} • ${tower.purchased.size} upgrade${tower.purchased.size > 1 ? 's' : ''}`
          : tower.def.name;
      tpStats.innerHTML = statRows(tower)
        .map(([k, v]) => `<span class="k">${k}</span><span class="v">${v}</span>`)
        .join('');
    }

    const options = lot
      ? lotOptions(lot)
      : market
        ? marketOptions()
        : castleGate
          ? castleGateOptions()
          : gate
            ? gateOptions(gate)
            : slot
              ? slotOptions(slot)
              : tower
                ? optionsFor(tower)
                : [];

    const signature = [
      selected.x,
      selected.y,
      lot
        ? `lot:${lot.lot.id}`
        : market
          ? `market:${game.gold}:${Math.round(game.foodStore)}`
          : gate
            ? `gate:${Math.round(gate.hp)}`
            : slot
              ? `slot:${slot.index}`
              : (tower?.def.id ?? ''),
      options.map((o) => `${o.id}:${o.owned}:${o.blocker ?? ''}:${o.cost}`).join('|'),
    ].join('#');

    if (signature === lastSignature) return;
    lastSignature = signature;

    // The price is always shown, even when it cannot be afforded; any reason it
    // is locked goes on its own line underneath.
    tpOptions.innerHTML = options
      .map((o) => {
        const disabled = o.owned || o.blocker !== null;
        const tag = o.owned
          ? `<span class="tp-opt-tag owned">${o.cost === 0 ? 'Built' : 'Owned'}</span>`
          : `<span class="tp-opt-tag${o.blocker ? ' unaffordable' : ''}">${o.cost} gold</span>`;
        const lock = o.blocker ? `<span class="tp-opt-lock">${o.blocker}</span>` : '';
        return (
          `<button class="tp-opt${o.owned ? ' owned' : ''}" data-buy="${o.id}"` +
          ` data-depth="${Math.min(o.depth, 3)}"${disabled ? ' disabled' : ''}>` +
          `<span class="tp-opt-head"><span class="tp-opt-name">${o.name}</span>${tag}</span>` +
          `<span class="tp-opt-desc">${o.description}</span>${lock}</button>`
        );
      })
      .join('');
  }

  return {
    update() {
      // Cheap string compare, so a nation swapped from the console or the dev
      // bar is picked up without anything having to tell the HUD about it.
      if (game.roster.join(',') !== lastRoster) buildShop();

      renderTowerPanel();

      goldEl.textContent = String(game.gold);
      livesEl.textContent = String(game.lives);
      waveEl.textContent = `${game.waveNumber} / ${game.totalWaves}`;

      housingEl.textContent = `${game.housingUsed} / ${game.housingCapacity}`;
      housingEl.classList.toggle('short', game.housingFree <= 0);

      // Food reads as a single stack; the breakdown lives in the popover.
      const f = game.foodForecast;
      foodEl.textContent = String(f.store);
      foodEl.classList.toggle('short', game.starving || f.after < 0);

      fpStore.textContent = String(f.store);
      fpHarvest.textContent = `+${f.harvest}`;
      fpUpkeep.textContent = `-${f.upkeep}`;
      fpAfter.textContent = String(f.after);
      fpAfter.className = f.after < 0 ? 'neg' : 'pos';
      fpNote.textContent =
        f.after < 0
          ? `Short by ${Math.abs(f.after)}. Your towers will fight at 60% until the harvest covers them.`
          : game.starving
            ? 'Hungry right now: towers fight at 60% until the next harvest.'
            : 'Surplus keeps for one wave only; the rest spoils.';

      waveBtn.disabled = !game.canStartWave;
      waveBtn.textContent = game.state === 'wave' ? 'Wave in progress' : 'Start Wave';

      for (const [id, btn] of buttons) {
        const def = towerDef(id);
        // Show why a building is unavailable, the same way upgrades do.
        const needsTech = def.requiresTech && !game.techs.has(def.requiresTech);
        const techName = def.requiresTech ? (TECHS[def.requiresTech as TechId]?.name ?? '') : '';

        btn.classList.toggle('selected', game.selectedTowerId === id);
        btn.classList.toggle('locked', Boolean(needsTech));
        btn.disabled = Boolean(needsTech) || game.gold < game.costOf(def);

        const lock = btn.querySelector<HTMLElement>('.lock');
        if (lock) lock.textContent = needsTech ? `Needs ${techName}` : '';
      }

      const finished = game.state === 'gameover' || game.state === 'victory';
      overlay.classList.toggle('hidden', !finished);
      if (finished) {
        const won = game.state === 'victory';
        overlayTitle.textContent = won ? 'The Realm Holds!' : 'The Keep Has Fallen';
        overlayText.textContent = won
          ? `You survived all ${game.totalWaves} waves with ${game.lives} lives to spare.`
          : `The enemy broke through on wave ${game.waveNumber}.`;
      }
    },
  };
}
