/**
 * Headless balance test.
 *
 * Runs a full twenty-wave game per nation with no browser, no rendering and no
 * player, and prints what happened wave by wave. It exists so a change to a
 * tower's numbers can be judged in a few seconds instead of by playing the game
 * through by hand.
 *
 *   npm run balance                 every playable nation
 *   npm run balance -- kingdom      just that one
 *   npm run balance -- --all        include nations still marked unplayable
 *   npm run balance -- --gold=4000  diagnostic: run at a purse the design does
 *                                   not give you, to tell "this roster cannot
 *                                   hold" apart from "it cannot afford to"
 *   npm run balance -- --debug      print why a purchase could not be made
 *   npm run balance -- --spread     diagnostic: build along the whole road
 *                                   instead of packing one stretch of it
 *
 * The process exits non-zero if a nation marked `playable` loses a run.
 *
 * Two rules, both learned the hard way (see HANDOFF.md):
 *
 * 1. **Always test at `DESIGN_STARTING_GOLD`.** The HUD's start-gold box is a
 *    convenience for playing, never a balance baseline.
 * 2. **Build towards the road, not into a corner.** Candidate spots are sorted
 *    by distance to the path ascending, so the fake player fills the ground
 *    that actually covers the route first. Filling the map corner-first
 *    produces numbers that mean nothing.
 *
 * The fake player is deliberately competent but not clever: it follows a fixed
 * shopping list per nation, keeps housing and food ahead of what it is about to
 * build, researches in a set order, and puts anything spare into upgrades. It
 * is a floor, not a ceiling — a human who plays well should beat these numbers,
 * so a nation that *loses* here is genuinely undertuned.
 */

/**
 * This is the only file in the project that runs under Node rather than in the
 * browser, and `@types/node` is deliberately not a dependency — the machine
 * this is developed on has no reliable way to install one. Declaring the two
 * things actually used is cheaper than a package.
 */
declare const process: {
  argv: string[];
  exitCode?: number;
};

import { mulberry32 } from '../src/core/rng';
import type { BuildLot } from '../src/data/maps';
import { NATION_ORDER, NATIONS, type NationId } from '../src/data/nations';
import { TECHS, type TechId } from '../src/data/tech';
import { statsFor, towerDef, type TowerDef, type TowerId } from '../src/data/towers';
import { DESIGN_STARTING_GOLD, Game } from '../src/game/Game';
import { Tower } from '../src/game/Tower';

/** Fixed timestep, matching what the real loop feeds the simulation. */
const DT = 1 / 60;

/** A wave that has not resolved after this many simulated seconds is stuck. */
const WAVE_TIMEOUT = 400;

/** How many seeds each nation is run on, so one lucky game cannot pass it. */
const RUNS_PER_NATION = 5;

/**
 * How many buildings ahead the fake player saves for before it will spend
 * anything on upgrades. This is the breadth-versus-depth dial, and the runs are
 * genuinely sensitive to it — see `reserve()`.
 */
const RESERVE_DEPTH = 2;

/** Print why a purchase could not be made. Diagnostic only. */
const DEBUG = process.argv.includes('--debug');

/**
 * Diagnostic: build along the whole length of the road instead of packing the
 * defence into one stretch of it.
 *
 * This is not a tuning knob, it is a measurement. For the Kingdom the two
 * layouts are worlds apart — 5/5 clustered against 0/5 spread, on identical
 * numbers — because a melee post holds exactly *one* enemy. Spread out, each
 * post grabs one and the rest of the wave walks past; packed together, the
 * whole front of the wave piles into the same twelve men with every crossbow
 * shooting into the jam. Any change that narrows that gap makes the Kingdom
 * more forgiving to play; anything that widens it makes it more of a puzzle.
 */
const SPREAD = process.argv.includes('--spread');

// ---------------------------------------------------------------- strategies

/**
 * One line of a nation's shopping list: "I want `count` of these, and not
 * before wave `fromWave`."
 *
 * The list is scanned in order every buying round and the first unmet entry
 * that can be built is bought. An entry that is unmet only because it is too
 * expensive *stops the scan* — the player saves up for it rather than
 * frittering the money away on whatever further down the list is affordable.
 */
interface BuildStep {
  tower: TowerId;
  count: number;
  fromWave?: number;
}

/**
 * A technology, and the wave from which the player judges it worth the money.
 *
 * Research is scheduled rather than bought out of whatever is left over. It
 * cannot come out of the surplus: the shopping list always wants more towers
 * than there is gold, so a "spend the surplus" rule means a hall is never
 * raised and nothing is ever researched at all. A player does not think that
 * way either — they decide a technology is worth a wave of towers, and buy it.
 */
interface TechStep {
  id: TechId;
  fromWave: number;
}

interface Strategy {
  /** Order and timing of research, once a hall is standing. */
  techOrder: TechStep[];
  /** Wave from which it is worth putting 150 gold into a Scholars' Hall. */
  hallFromWave: number;
  plan: BuildStep[];
}

const STRATEGIES: Record<NationId, Strategy> = {
  /**
   * The Kingdom fights in the road, so the shopping list is bodies first —
   * cheap pikemen while the enemy is unarmoured — then the crossbows that
   * cover them, then a hospital to stop the losses being permanent, and
   * finally the blunt damage that armour forces on it.
   */
  kingdom: {
    // Deliberately late. A hall is 150 gold and the first technology another
    // 90–150, which in the opening waves is four or five posts the Kingdom
    // badly needs on the board. Its wave-6 answer to armour — the rock
    // thrower — needs no research at all, so it can afford to wait.
    hallFromWave: 6,
    techOrder: [
      // Field Medicine first now: it is cheap, and it turns the losses the
      // Kingdom takes in the road from permanent into temporary.
      { id: 'field-medicine', fromWave: 6 },
      // Then the gate, which is what makes the enemy stop and be fought.
      { id: 'advanced-construction', fromWave: 8 },
      { id: 'husbandry', fromWave: 11 },
      { id: 'marksmanship', fromWave: 13 },
      { id: 'ballistics', fromWave: 15 },
      { id: 'fire-projectiles', fromWave: 17 },
    ],
    /**
     * The one-off keystones sit at the top of the list, not in wave order.
     * A step that cannot be afforded stops the scan, so anything above it is
     * funded first — and the cheap top-up steps below have to be *below*,
     * because a post that gets wiped out drops its count and re-triggers
     * them. With the gate listed after the pikemen, every spare coin went
     * into replacing losses and the gate was never built at all.
     */
    plan: [
      // One-off keystones first, so they are funded before the cheap top-up
      // lines below — a post that gets wiped out drops its count and
      // re-triggers those, and with the gate listed after them every spare
      // coin went into replacing losses and the gate was never built at all.
      { tower: 'gatehouse', count: 1, fromWave: 8 },
      { tower: 'hospital', count: 1, fromWave: 7 },
      { tower: 'catapult', count: 1, fromWave: 9 },
      { tower: 'hospital', count: 2, fromWave: 13 },

      // Then breadth, in the order the waves demand it. Wave 6 is where the
      // warhammer knights arrive and pierce stops working — pikes and
      // crossbows both land at 40% on heavy armour. Blunt has to be on the
      // board before then, and rock throwers are the cheapest there is: 60
      // gold, never miss, and 120% against exactly what is coming.
      { tower: 'pikeman', count: 4 },
      { tower: 'crossbow', count: 2 },
      { tower: 'pikeman', count: 6, fromWave: 2 },
      { tower: 'crossbow', count: 3, fromWave: 3 },
      { tower: 'pikeman', count: 8, fromWave: 3 },
      { tower: 'rock-thrower', count: 2, fromWave: 4 },
      { tower: 'crossbow', count: 4, fromWave: 4 },
      { tower: 'rock-thrower', count: 4, fromWave: 5 },
      { tower: 'pikeman', count: 10, fromWave: 5 },
      { tower: 'heavy-knight', count: 1, fromWave: 6 },
      { tower: 'rock-thrower', count: 6, fromWave: 7 },
      { tower: 'crossbow', count: 6, fromWave: 8 },
      { tower: 'heavy-knight', count: 2, fromWave: 9 },
      { tower: 'catapult', count: 2, fromWave: 10 },
      { tower: 'pikeman', count: 13, fromWave: 10 },
      { tower: 'swordsman', count: 2, fromWave: 11 },
      { tower: 'mounted-knight', count: 1, fromWave: 11 },
      { tower: 'catapult', count: 3, fromWave: 12 },
      { tower: 'heavy-knight', count: 3, fromWave: 12 },
      { tower: 'crossbow', count: 8, fromWave: 13 },
      { tower: 'mounted-knight', count: 3, fromWave: 14 },
      { tower: 'catapult', count: 4, fromWave: 15 },
      // The late list has to keep going. Left ending here, the run reached
      // wave 18 with everything on it already built and a thousand gold it
      // had nowhere to put — which reads as the finale being unbeatable when
      // it is really the shopping list running out.
      // The finale is not more armour, it is more *bodies* — and marauders,
      // which shrug off being held and are unarmoured, so blunt is at its
      // worst against them. Crossbows and pikes are what answer that.
      //
      // The counts stop deliberately. Left open-ended the run reached wave 20
      // with a hundred and four buildings and not one upgrade bought, because
      // there was always another tower on the list to save for — and a Third
      // File or a Crushing Blow on what is already there is worth far more
      // per coin than a ninetieth building on the far side of the map.
      { tower: 'crossbow', count: 12, fromWave: 15 },
      { tower: 'rock-thrower', count: 10, fromWave: 15 },
      { tower: 'pikeman', count: 18, fromWave: 16 },
      { tower: 'heavy-knight', count: 6, fromWave: 16 },
      { tower: 'catapult', count: 8, fromWave: 17 },
      { tower: 'crossbow', count: 18, fromWave: 17 },
      { tower: 'rock-thrower', count: 14, fromWave: 18 },
      { tower: 'mounted-knight', count: 6, fromWave: 18 },
      { tower: 'pikeman', count: 22, fromWave: 19 },
    ],
  },

  /**
   * Placeholder. The Wardens' roster has not been designed yet, so this is
   * only enough of a list to make the harness run against them and report a
   * number — do not read it as an intended build order.
   */
  wardens: {
    hallFromWave: 4,
    techOrder: [
      { id: 'marksmanship', fromWave: 4 },
      { id: 'advanced-construction', fromWave: 7 },
      { id: 'field-medicine', fromWave: 10 },
      { id: 'ballistics', fromWave: 12 },
      { id: 'fire-projectiles', fromWave: 15 },
      { id: 'husbandry', fromWave: 17 },
    ],
    plan: [
      { tower: 'gatehouse', count: 1, fromWave: 9 },
      { tower: 'hospital', count: 1, fromWave: 10 },

      { tower: 'archer', count: 5 },
      { tower: 'archer', count: 8, fromWave: 2 },
      { tower: 'houndmaster', count: 1, fromWave: 3 },
      { tower: 'archer', count: 11, fromWave: 3 },
      { tower: 'crossbow', count: 2, fromWave: 4 },
      { tower: 'archer', count: 14, fromWave: 4 },
      { tower: 'houndmaster', count: 3, fromWave: 5 },
      { tower: 'archer', count: 18, fromWave: 6 },
      { tower: 'crossbow', count: 4, fromWave: 7 },
      { tower: 'houndmaster', count: 5, fromWave: 8 },
      { tower: 'archer', count: 24, fromWave: 9 },
      { tower: 'crossbow', count: 7, fromWave: 11 },
      { tower: 'houndmaster', count: 8, fromWave: 12 },
      { tower: 'archer', count: 30, fromWave: 13 },
      { tower: 'crossbow', count: 11, fromWave: 15 },
      { tower: 'houndmaster', count: 11, fromWave: 16 },
      { tower: 'archer', count: 36, fromWave: 17 },
    ],
  },
};

// ------------------------------------------------------------- valuing towers

/** Rough worth of the armour a defender is wearing, averaged over attack types. */
const ARMOR_WORTH: Record<string, number> = {
  unarmored: 1,
  light: 1.05,
  medium: 1.2,
  heavy: 1.35,
};

/**
 * A crude single number for "how much fighting this building does", used only
 * to compare one upgrade against another. It does not have to be accurate in
 * absolute terms — only monotonic in the things that actually matter, so that
 * "a third man at the post" outranks "a longer pike".
 */
function combatPower(def: TowerDef, purchased: ReadonlySet<string>): number {
  const s = statsFor(def, purchased);

  if (def.attack === 'melee') {
    const sweep = s.whirlwindInterval > 0 ? (s.whirlwindDamage * 10) / s.whirlwindInterval : 0;
    const perMan = s.unitHp * 0.5 * (ARMOR_WORTH[s.armor] ?? 1) + s.unitDps * 9 + sweep;
    return s.units * perMan * (1 + s.range / 500);
  }

  if (def.attack === 'hound') {
    return s.dogs * (s.dogHp * 0.5 + s.dogDps * 9) * (1 + s.range / 500);
  }

  if (def.attack === 'projectile') {
    // Burn is damage *per shot*, so it has to be multiplied by the rate of
    // fire before it can be added to a per-second figure. Adding the raw
    // totals instead made Fire Bolts score about ten times its real worth,
    // and the late game spent every spare coin on it while a warhammer
    // knight's Crushing Blow — the actual answer to a crowd — went unbought.
    const perShot = s.damage + s.igniteDps * s.igniteDuration + s.burnDps * s.burnDuration;
    return perShot * s.fireRate * s.accuracy * (1 + s.splashRadius / 50) * (1 + s.range / 500);
  }

  // Support: a hospital's healing, a farm's harvest, a house's shelter. Kept
  // on the same scale as the rest so the comparison is not swamped by it.
  return s.healRate * 3 + s.foodOutput * 8 + s.houseCapacity * 8 + s.gateHp * 0.1;
}

// ------------------------------------------------------------- the fake player

interface WaveRecord {
  wave: number;
  lives: number;
  gold: number;
  towers: number;
  housing: string;
  food: string;
  bought: string[];
}

class FakePlayer {
  private readonly game: Game;
  private readonly strategy: Strategy;
  /** Spots to try for a tower that wants to cover the road, nearest first. */
  private readonly combatSpots: Array<{ x: number; y: number }>;
  /** Spots for houses and farms, which want to be out of the way instead. */
  private readonly economySpots: Array<{ x: number; y: number }>;
  /** What was bought this round, for the report. */
  private bought: string[] = [];

  /**
   * The wave the player is shopping *for*. Buying happens before `startWave`,
   * so `game.waveNumber` is still the wave just finished — reading it directly
   * makes every `fromWave` gate fire one wave late, which is subtle enough to
   * look like the roster being weak rather than the plan being slow.
   */
  private get nextWave(): number {
    return this.game.waveNumber + 1;
  }

  constructor(game: Game) {
    this.game = game;
    this.strategy = STRATEGIES[game.nation];

    const spots: Array<{ x: number; y: number; toPath: number }> = [];
    for (let x = 30; x < game.map.width - 30; x += 16) {
      for (let y = 30; y < game.map.height - 30; y += 16) {
        // Inside the city walls is reserved for plots, not free building.
        if (x > game.map.def.castle.left - 10) continue;
        const toPath = game.map.path.distanceToPoint(x, y);
        spots.push({ x, y, toPath });
      }
    }

    // Nearest the road first, then everything else still within reach of it.
    // The tight band saturates: by wave 18 a winning run has seventy-odd
    // buildings and nowhere left to put one, and the surplus gold quietly
    // stops becoming defence — which looks like the finale being unbeatable.
    //
    // Sorting by distance-to-road rather than by position along it is what
    // makes the defence pack itself into one stretch: the nearest free spot to
    // the road is always right beside the last one taken. That is not a
    // detail, it is most of why these runs win — see SPREAD.
    const inBand = spots.filter((s) => s.toPath >= 42 && s.toPath <= 190);
    this.combatSpots = (
      SPREAD
        ? inBand.sort(
            (a, b) =>
              game.map.path.nearestDistance(a.x, a.y) - game.map.path.nearestDistance(b.x, b.y),
          )
        : inBand.sort((a, b) => a.toPath - b.toPath)
    ).map(({ x, y }) => ({ x, y }));

    this.economySpots = spots
      .filter((s) => s.toPath > 110)
      .sort((a, b) => b.toPath - a.toPath)
      .map(({ x, y }) => ({ x, y }));
  }

  /** Everything the player does between two waves. */
  shop(): string[] {
    this.bought = [];

    // Repeat until a whole pass buys nothing: one purchase often unlocks the
    // next (a house frees housing, a hall makes research possible).
    //
    // The order is the priority order. Towers first, because breadth is what
    // actually stops a wave; the hall, research and upgrades only get what is
    // left over once the shopping list for the next wave is fully funded.
    // Phase one: the shopping list, until it stops being able to buy anything.
    // The hall and research are scheduled commitments and come first; towers
    // take the rest.
    for (let pass = 0; pass < 60; pass++) {
      const before = this.bought.length;
      this.raiseHall();
      this.research();
      this.followPlan();
      this.manGatehouses();
      if (this.bought.length === before) break;
    }

    // Phase two, and only then: whatever is left goes into upgrades. Run
    // interleaved with phase one instead, an upgrade got bought after every
    // single tower, and a 170-gold gatehouse two lines down the list was
    // never reached — the purse was always 100 short of it.
    for (let pass = 0; pass < 40; pass++) {
      if (!this.spendSpareOnUpgrades()) break;
    }
    return this.bought;
  }

  // ------------------------------------------------------------- economy

  private freeLot(accepts: BuildLot['accepts']): BuildLot | null {
    const { game } = this;
    for (const lot of game.map.def.castle.lots) {
      if (lot.accepts !== accepts) continue;
      if (game.towers.some((t) => Math.hypot(t.x - lot.x, t.y - lot.y) < 4)) continue;
      if (game.lotBlocker(lot)) continue;
      return lot;
    }
    return null;
  }

  /** Research needs somewhere to happen, and it is worth a lot of gold later. */
  private raiseHall(): void {
    const { game } = this;
    if (game.hasResearchBuilding) return;
    if (this.nextWave < this.strategy.hallFromWave) return;

    const lot = this.freeLot('research');
    if (lot && game.buildOnLot(lot)) this.bought.push("Scholars' Hall");
  }

  /** Put up a house, on a walled plot if one is free. Plots shelter more. */
  private buildHouse(): boolean {
    const { game } = this;
    const lot = this.freeLot('house');
    if (lot && game.buildOnLot(lot)) {
      this.bought.push('House (walled)');
      return true;
    }
    return this.place('house', this.economySpots);
  }

  private buildFarm(): boolean {
    const { game } = this;
    // A farm needs a farmer, so housing has to come first.
    if (game.housingFree < 1 && !this.buildHouse()) return false;

    const lot = this.freeLot('farm');
    if (lot && game.buildOnLot(lot)) {
      this.bought.push('Farm (walled)');
      return true;
    }
    return this.place('farm', this.economySpots);
  }

  /**
   * Make room for a building before committing to it: housing is a hard cap,
   * and running the food store negative drops every tower to 60%.
   */
  private makeRoomFor(id: TowerId): boolean {
    const { game } = this;
    const def = towerDef(id);

    // One loop over both, not a housing pass followed by a food pass: a farm
    // needs a farmer, so building one *spends* the housing the first pass had
    // just cleared. Done sequentially this reports success and then every
    // candidate spot comes back 'no-housing', which looks from the outside
    // like the roster being unaffordable rather than the planner miscounting.
    for (let guard = 0; guard < 30; guard++) {
      if (game.housingFree < (def.housing ?? 0)) {
        if (!this.buildHouse()) return false;
        continue;
      }
      // Against production, not against the forecast: the forecast counts the
      // store, and a store that covers one wave leaves the realm hungry the next.
      if (game.foodProduction < game.foodUpkeep + (def.food ?? 0)) {
        if (!this.buildFarm()) return false;
        continue;
      }
      return true;
    }
    return false;
  }

  // -------------------------------------------------------------- research

  private research(): void {
    const { game } = this;
    if (!game.hasResearchBuilding) return;

    for (const step of this.strategy.techOrder) {
      if (game.techs.has(step.id)) continue;
      if (this.nextWave < step.fromWave) return;
      const tech = TECHS[step.id];
      // Save up for the next technology in the order rather than skipping
      // ahead to a cheaper one further down it.
      if (game.researchBlocker(tech)) return;
      if (game.startResearch(step.id)) this.bought.push(`Research: ${tech.name}`);
      return;
    }
  }

  // ----------------------------------------------------------------- towers

  private countBuilt(id: TowerId): number {
    const { game } = this;
    if (towerDef(id).placement === 'path') return game.gates.length;
    return game.towers.filter((t) => t.def.id === id).length;
  }

  private followPlan(): void {
    const { game } = this;

    for (const step of this.strategy.plan) {
      if (this.nextWave < (step.fromWave ?? 0)) continue;
      if (this.countBuilt(step.tower) >= step.count) continue;

      const def = towerDef(step.tower);
      // Locked behind research it has not reached yet: skip, do not stall.
      if (def.requiresTech && !game.techs.has(def.requiresTech)) continue;

      if (game.gold < def.cost) {
        // Nearly affordable: stop here and save the rest of the purse for it.
        // Otherwise keep shopping down the list. Saving up unconditionally
        // meant waves 3–5 bought nothing at all while the run held out for a
        // gatehouse it was still 100 gold short of, and bled lives doing it.
        if (game.gold >= def.cost * 0.6) return;
        continue;
      }
      if (!this.makeRoomFor(step.tower)) return;
      if (game.gold < def.cost) return;

      if (def.placement === 'path') {
        if (this.placeGatehouse(step.tower)) return;
        if (DEBUG) console.log(`      [no spot for ${step.tower}]`);
        continue;
      }
      if (this.place(step.tower, this.combatSpots)) return;
      if (DEBUG) {
        const previous = game.selectedTowerId;
        game.selectedTowerId = step.tower;
        const why = new Map<string, number>();
        for (const s of this.combatSpots) {
          const r = game.placementStatus(s.x, s.y) ?? 'null';
          why.set(r, (why.get(r) ?? 0) + 1);
        }
        game.selectedTowerId = previous;
        console.log(`      [no spot for ${step.tower}] ${[...why].map(([k, v]) => `${k}:${v}`).join(' ')}`);
      }
      // Nowhere left to put one; move on to the rest of the list.
    }
  }

  private place(id: TowerId, spots: Array<{ x: number; y: number }>): boolean {
    const { game } = this;
    const previous = game.selectedTowerId;
    game.selectedTowerId = id;

    let placed = false;
    for (const spot of spots) {
      if (game.placementStatus(spot.x, spot.y) !== 'ok') continue;
      if (game.tryPlaceTower(spot.x, spot.y)) {
        this.bought.push(towerDef(id).name);
        placed = true;
        break;
      }
    }

    game.selectedTowerId = previous;
    return placed;
  }

  /** A gate wants to sit late on the road, where everything has to pass it. */
  private placeGatehouse(id: TowerId): boolean {
    const { game } = this;
    const previous = game.selectedTowerId;
    game.selectedTowerId = id;

    let placed = false;
    for (const fraction of [0.82, 0.74, 0.66, 0.58, 0.5, 0.42]) {
      const point = game.map.path.positionAt(game.map.path.length * fraction);
      if (game.placementStatus(point.x, point.y) !== 'ok') continue;
      if (game.tryPlaceTower(point.x, point.y)) {
        this.bought.push(towerDef(id).name);
        placed = true;
        break;
      }
    }

    game.selectedTowerId = previous;
    return placed;
  }

  /** An empty gatehouse turret is wasted stone. Fill both, cheapest option first. */
  private manGatehouses(): void {
    const { game } = this;
    const options = [...game.gateSlotOptions].sort(
      (a, b) => towerDef(a).cost - towerDef(b).cost,
    );

    for (const gate of game.gates) {
      for (let i = 0; i < gate.slots.length; i++) {
        if (gate.slots[i]) continue;
        for (const id of options) {
          const def = towerDef(id);
          if (def.requiresTech && !game.techs.has(def.requiresTech)) continue;
          if (game.gold < def.cost) continue;
          // A turret needs housing and food like any other emplacement.
          if (!this.makeRoomFor(id)) continue;
          if (game.gold < def.cost) continue;
          if (game.buildInSlot(i, id, gate)) {
            this.bought.push(`${def.name} (turret)`);
            break;
          }
        }
      }
    }
  }

  // --------------------------------------------------------------- upgrades

  /**
   * What is still outstanding on the shopping list for now and the next wave.
   * Everything else — the hall, research, upgrades — is only bought with money
   * above this, so the player always finishes buying breadth before it starts
   * buying depth.
   *
   * It covers the next `RESERVE_DEPTH` outstanding buildings, not all of them.
   * Reserving only the very next one left a surplus after every purchase, so
   * the run bought a range upgrade between each pair of towers; reserving the
   * whole outstanding list went to the other extreme and never upgraded
   * anything at all, which costs far more — a pikeman post with Third File
   * holds three enemies instead of two for less than a new post costs.
   */
  private reserve(): number {
    const { game } = this;
    const costs: number[] = [];

    for (const step of this.strategy.plan) {
      if (this.nextWave + 1 < (step.fromWave ?? 0)) continue;
      const missing = step.count - this.countBuilt(step.tower);
      if (missing <= 0) continue;
      const def = towerDef(step.tower);
      if (def.requiresTech && !game.techs.has(def.requiresTech)) continue;
      for (let i = 0; i < missing && costs.length < RESERVE_DEPTH; i++) costs.push(def.cost);
      if (costs.length >= RESERVE_DEPTH) break;
    }
    return costs.reduce((sum, c) => sum + c, 0);
  }

  private spendSpareOnUpgrades(): boolean {
    const { game } = this;
    const spare = game.gold - this.reserve();
    if (spare <= 0) return false;

    // Best value per coin, judged by how much the tower's own numbers move.
    // Cheapest-first was tried first and is actively misleading: it buys a
    // range upgrade before a second crossbow every time, because range is
    // cheap, and a run built that way looks like the roster is undertuned.
    let best: { tower: Tower; id: string; name: string; score: number } | null = null;

    for (const tower of game.allTowers) {
      const before = combatPower(tower.def, tower.purchased);
      if (before <= 0) continue;

      for (const upgrade of tower.openUpgrades) {
        if (tower.blockerFor(upgrade, game.techs)) continue;
        if (tower.isRedundant(upgrade)) continue;
        if (upgrade.cost > spare) continue;

        const after = combatPower(tower.def, new Set([...tower.purchased, upgrade.id]));
        const score = (after / before - 1) / upgrade.cost;
        if (score <= 0) continue;
        if (!best || score > best.score) {
          best = {
            tower,
            id: upgrade.id,
            name: `${tower.def.name}: ${upgrade.name}`,
            score,
          };
        }
      }
    }
    if (!best) return false;

    const previous = game.selected;
    game.selected = best.tower;
    const done = game.buyUpgrade(best.id);
    if (done) this.bought.push(best.name);
    game.selected = previous;
    return done;
  }
}

// ------------------------------------------------------------------ the run

interface RunResult {
  seed: number;
  won: boolean;
  livesLeft: number;
  reachedWave: number;
  waves: WaveRecord[];
}

function runGame(nation: NationId, seed: number, startingGold = DESIGN_STARTING_GOLD): RunResult {
  // Seed the world. Everything random in the simulation — crow flocks, which
  // trails open, whether a shot connects — goes through Math.random, so
  // replacing it is enough to make a run reproducible.
  const rand = mulberry32(seed);
  const realRandom = Math.random;
  Math.random = rand;

  try {
    const game = new Game(nation);
    game.startingGold = startingGold;
    game.reset();

    const player = new FakePlayer(game);
    const waves: WaveRecord[] = [];

    while (game.canStartWave) {
      const bought = player.shop();

      game.startWave();
      let elapsed = 0;
      while (game.state === 'wave' && elapsed < WAVE_TIMEOUT) {
        game.update(DT);
        elapsed += DT;
      }

      waves.push({
        wave: game.waveNumber,
        lives: game.lives,
        gold: game.gold,
        towers: game.towers.length + game.gates.length,
        housing: `${game.housingUsed}/${game.housingCapacity}`,
        food: `${Math.round(game.foodProduction)}/${game.foodUpkeep}`,
        bought,
      });

      if (game.state === 'gameover') break;
    }

    return {
      seed,
      won: game.state === 'victory',
      livesLeft: game.lives,
      reachedWave: game.waveNumber,
      waves,
    };
  } finally {
    Math.random = realRandom;
  }
}

// -------------------------------------------------------------------- report

function pad(value: string | number, width: number): string {
  return String(value).padStart(width);
}

function printRun(result: RunResult): void {
  console.log(`  seed ${result.seed}`);
  console.log('    wave  lives   gold  built  house    food  purchases');
  for (const w of result.waves) {
    const bought = w.bought.length > 0 ? w.bought.join(', ') : '—';
    console.log(
      `    ${pad(w.wave, 4)}  ${pad(w.lives, 5)}  ${pad(w.gold, 5)}  ${pad(w.towers, 5)}  ` +
        `${pad(w.housing, 5)}  ${pad(w.food, 6)}  ${bought}`,
    );
  }
  console.log(
    result.won
      ? `    => held all ${result.reachedWave} waves with ${result.livesLeft} lives left\n`
      : `    => LOST on wave ${result.reachedWave}\n`,
  );
}

function main(): void {
  const args = process.argv.slice(2);
  const includeUnplayable = args.includes('--all');
  // Diagnostic only: run at a purse the design does not actually give you, to
  // separate "this roster cannot hold" from "this roster cannot afford to".
  const goldArg = args.find((a) => a.startsWith('--gold='));
  const startingGold = goldArg ? Number(goldArg.slice(7)) : DESIGN_STARTING_GOLD;
  const named = args.filter((a) => !a.startsWith('--')) as NationId[];

  const nations = named.length
    ? named
    : NATION_ORDER.filter((id) => includeUnplayable || NATIONS[id].playable);

  const unknown = nations.filter((id) => !NATION_ORDER.includes(id));
  if (unknown.length > 0) {
    console.error(`Unknown nation: ${unknown.join(', ')}`);
    console.error(`Known: ${NATION_ORDER.join(', ')}`);
    process.exitCode = 1;
    return;
  }

  console.log(`Balance test — starting gold ${DESIGN_STARTING_GOLD}, ${RUNS_PER_NATION} seeds each\n`);

  let anyLost = false;

  for (const nation of nations) {
    const def = NATIONS[nation];
    console.log(`${def.name}${def.playable ? '' : '  (roster not balanced yet)'}`);
    console.log('─'.repeat(78));

    const results: RunResult[] = [];
    for (let i = 0; i < RUNS_PER_NATION; i++) {
      const result = runGame(nation, 0x5eed_0000 + i * 7919, startingGold);
      results.push(result);
      printRun(result);
    }

    const wins = results.filter((r) => r.won);
    const avgLives = wins.length
      ? Math.round((wins.reduce((s, r) => s + r.livesLeft, 0) / wins.length) * 10) / 10
      : 0;

    console.log(
      `  ${def.name}: won ${wins.length}/${results.length}` +
        (wins.length ? `, average ${avgLives} lives left` : '') +
        (wins.length < results.length
          ? `, lost on wave ${results.filter((r) => !r.won).map((r) => r.reachedWave).join(', ')}`
          : ''),
    );
    console.log();

    // A nation that is meant to be finished must actually hold.
    if (def.playable && wins.length < results.length) anyLost = true;
  }

  if (anyLost) {
    console.log('At least one playable nation lost a run — that roster is undertuned.');
    process.exitCode = 1;
  }
}

main();
