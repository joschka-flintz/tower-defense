import { dist2 } from '../core/vec';
import { CREEPS, type CreepId } from '../data/creeps';
import { CLASSIC_MEADOW, type BuildLot } from '../data/maps';
import { DEFAULT_NATION, nationDef, type NationDef, type NationId } from '../data/nations';
import { TECHS, techEffects, type TechDef, type TechId } from '../data/tech';
import { towerDef, type TowerDef, type TowerId } from '../data/towers';
import { WAVES } from '../data/waves';
import { Creep } from './Creep';
import { FireField } from './FireField';
import { GameMap } from './GameMap';
import { Crow } from './Crow';
import { Gatehouse, type GateSlotRef } from './Gatehouse';
import type { Path } from './Path';
import { checkPlacement, type PlacementError } from './placement';
import { Projectile } from './Projectile';
import type { HospitalRef } from './Swordsman';
import { DEFAULT_MELEE_RECOVERY, Tower } from './Tower';

/**
 * Anything the player can click on and inspect. A gatehouse is three separate
 * things: the gate in the middle and the two turrets at either end.
 */
export type Selection =
  | Tower
  | Gatehouse
  | GateSlotRef
  | LotRef
  | MarketRef
  | CastleGateRef
  | Creep
  | null;

/** The city's own gate, at the end of the road. Not a building you put up. */
export interface CastleGateRef {
  readonly kind: 'castle-gate';
  x: number;
  y: number;
}

/**
 * Reinforcing the city's own gate. Bought once, from the gate itself rather
 * than from the build panel, and it raises the realm's lives by 10 — the only
 * thing in the game that does.
 *
 * It is gated behind Advanced Construction because that is the technology that
 * covers masonry, and priced as a serious late decision: 10 lives is a whole
 * extra Morningstar Knight's worth of leaks absorbed.
 */
export const CASTLE_GATE_UPGRADE = {
  id: 'reinforced-keep-gate',
  name: 'Reinforced Keep Gate',
  description:
    'Oak banded with iron, a second portcullis, and the wall around it thickened. What gets past your line has to break this too. Lives 20 to 30.',
  cost: 320,
  requiresTech: 'advanced-construction',
  extraLives: 10,
} as const;

/** An empty reserved plot inside the city walls. */
export interface LotRef {
  readonly kind: 'lot';
  lot: BuildLot;
  x: number;
  y: number;
}

/** The market square, where coins and grain change hands. */
export interface MarketRef {
  readonly kind: 'market';
  x: number;
  y: number;
}

/** Gold paid for one unit of grain, and gold received for selling one. */
export const FOOD_BUY_PRICE = 6;
export const FOOD_SELL_PRICE = 3;
/** How much grain changes hands per trade. */
export const FOOD_TRADE_LOT = 5;

/** How far to either side of the centre line creeps may wander, as a fraction. */
const LANE_SPREAD = 0.58;

/** Click grace around a fighter out on the road. He is small and he moves. */
const FIGHTER_PICK_RADIUS = 14;

/**
 * How long a shooting enemy stands still to take its shot. It walks for the
 * rest of the reload, so it always makes ground down the road — see
 * `Game.bombardTowers`.
 */
const BOMBARD_AIM_TIME = 0.5;

export type GameState = 'idle' | 'wave' | 'gameover' | 'victory';

/**
 * The intended starting purse. Balance is always tested against this. It went
 * up when housing and food arrived: a realm now has to fund its economy as well
 * as its defence.
 */
export const DESIGN_STARTING_GOLD = 260;
const STARTING_LIVES = 20;
/**
 * How much tougher creeps get as the waves go on. The growth is deliberately
 * curved rather than a flat percentage per wave: a linear ramp steep enough
 * to make wave 20 dangerous also makes waves 2–4 brutal before the player has
 * anything built. This stays gentle through the opening and accelerates
 * through the back half — roughly 1.4x by wave 5, 2.2x by wave 10, 4.7x by
 * wave 20.
 */
function waveHpScale(wave: number): number {
  const n = Math.max(0, wave - 1);
  return 1 + n * 0.08 + n * n * 0.0075;
}

/**
 * How much of its listed bounty a creep actually pays out, by wave.
 *
 * Plunder does not keep pace with how tough the enemy gets. Without this the
 * late waves are worth far more gold than they cost to beat — a wave of forty
 * enemies pays forty bounties whether or not each one is five times the
 * creature it was at wave one — so getting ahead once meant staying ahead
 * with money to spare. Holding the line should stay the hard part.
 */
function waveBountyScale(wave: number): number {
  const over = Math.max(0, wave - BOUNTY_FULL_UNTIL_WAVE);
  return Math.max(0.55, 1 - over * 0.035);
}

/** Up to this wave, enemies pay their full listed bounty. */
const BOUNTY_FULL_UNTIL_WAVE = 6;

interface PendingGroup {
  creepId: CreepId;
  remaining: number;
  interval: number;
  timer: number;
  /** Which route these creeps walk — the main road, or a trail. */
  path: Path;
  laneSpread: number;
  joinRemaining: number;
  /** When set, the whole group arrives at once as a block rather than in file. */
  formation?: { columns: number; rankGap?: number };
}

/** No trail carries anyone before this wave — the player gets a few clean waves first. */
const TRAIL_UNLOCK_WAVE = 3;
/** How many waves after unlocking it takes for one more trail to become eligible. */
const TRAIL_GROWTH_WAVES = 1;
/** Chance an eligible trail actually carries creeps on a given wave. Not every wave uses them. */
const TRAIL_ACTIVATION_CHANCE = 0.5;
/** Trail scouts are a light, staggered trickle rather than a full group. */
const TRAIL_SCOUT_IDS: CreepId[] = ['peasant', 'grunt', 'assassin'];

export class Game {
  readonly map = new GameMap(CLASSIC_MEADOW);

  /**
   * Which nation the player is fighting as. It decides the build panel and
   * nothing else — the wave table, the map and the economy are shared. There
   * is no pre-game chooser yet, so this is set once at construction; change it
   * with `setNation`, which necessarily starts the game over.
   */
  nation: NationId;

  creeps: Creep[] = [];
  towers: Tower[] = [];
  projectiles: Projectile[] = [];
  fires: FireField[] = [];

  gates: Gatehouse[] = [];
  crows: Crow[] = [];

  /** Technologies bought so far. Global, not per tower. Research is immediate. */
  readonly techs = new Set<string>();

  /** True once the city gate itself has been reinforced. */
  keepGateReinforced = false;

  /**
   * Food left over from last wave's harvest. Surplus keeps for exactly one
   * wave — anything beyond a single harvest's worth spoils before it can be
   * eaten, so you cannot stockpile your way out of building farms.
   */
  foodStore = 0;
  /** True when the last wave's harvest did not feed everyone. */
  starving = false;
  /** Food short by, at the last reckoning. Shown in the HUD. */
  foodShortfall = 0;

  /**
   * What a new game starts with. Adjustable from the HUD for testing; the
   * design target remains DESIGN_STARTING_GOLD.
   */
  startingGold = DESIGN_STARTING_GOLD;

  gold = this.startingGold;
  lives = STARTING_LIVES;
  /** 0 before the first wave; otherwise the number of the wave running or last cleared. */
  waveNumber = 0;
  state: GameState = 'idle';

  /** Tower type picked in the build panel, or null when not building. */
  selectedTowerId: TowerId | null = null;
  /** A placed tower or gatehouse the player clicked. */
  selected: Selection = null;
  /** Cursor position in world coordinates, or null when off-canvas. */
  hover: { x: number; y: number } | null = null;
  /**
   * Extra rotation applied to a gatehouse being placed. It squares itself to
   * the road automatically, but corners and junctions sometimes want a nudge.
   */
  gateRotation = 0;

  private pending: PendingGroup[] = [];

  constructor(nation: NationId = DEFAULT_NATION) {
    this.nation = nation;
    this.reset();
  }

  /** The roster the current nation fields. */
  get nationDef(): NationDef {
    return nationDef(this.nation);
  }

  /** Towers the build panel offers, in order. */
  get roster(): readonly TowerId[] {
    return this.nationDef.towers;
  }

  /** What this nation may install in a gatehouse emplacement. */
  get gateSlotOptions(): readonly TowerId[] {
    return this.nationDef.gateSlots;
  }

  /** How much of his health a melee fighter binds up between waves. */
  get meleeRecovery(): number {
    return this.nationDef.traits?.meleeRecovery ?? DEFAULT_MELEE_RECOVERY;
  }

  /**
   * What this nation actually pays for a building. Every price shown and every
   * price charged goes through here, so a nation discount cannot be honoured
   * in one place and forgotten in another.
   */
  costOf(def: TowerDef): number {
    return Math.round(def.cost * (this.nationDef.traits?.costs?.[def.id] ?? 1));
  }

  /** The same, for a technology. */
  techCostOf(tech: TechDef): number {
    return Math.round(tech.cost * (this.nationDef.traits?.costs?.[tech.id] ?? 1));
  }

  /** Switching nation changes what can be built, so the board has to start over. */
  setNation(nation: NationId): void {
    if (this.nation === nation) return;
    this.nation = nation;
    this.reset();
  }

  get totalWaves(): number {
    return WAVES.length;
  }

  get canStartWave(): boolean {
    return this.state === 'idle' && this.waveNumber < WAVES.length;
  }

  /**
   * Now and then a flock drifts across the fields. Crows are an occurrence
   * rather than an enemy: nothing can shoot them, and only farms care.
   */
  private releaseCrows(): void {
    const fields = this.towers.filter((tower) => tower.stats.foodOutput > 0);
    if (fields.length === 0) return;
    if (Math.random() > 0.55) return;

    const flock = 2 + Math.floor(Math.random() * 3);
    for (let i = 0; i < flock; i++) {
      const field = fields[Math.floor(Math.random() * fields.length)];
      const fromLeft = Math.random() < 0.5;
      const x = fromLeft ? -30 : this.map.width + 30;
      const y = 40 + Math.random() * (this.map.height - 80);
      const exitX = fromLeft ? this.map.width + 40 : -40;
      const exitY = 40 + Math.random() * (this.map.height - 80);
      this.crows.push(new Crow(x, y, exitX, exitY, field));
    }
  }

  startWave(): void {
    if (!this.canStartWave) return;

    this.releaseCrows();
    this.waveNumber++;
    this.state = 'wave';
    this.pending = WAVES[this.waveNumber - 1].groups.map((group) => ({
      creepId: group.creepId,
      remaining: group.count,
      interval: group.interval,
      timer: group.delay,
      path: this.map.path,
      laneSpread: this.map.pathRadius * LANE_SPREAD,
      joinRemaining: this.map.path.length,
      formation: group.formation,
    }));
    this.releaseTrailScouts();
  }

  /**
   * Trails stay closed for the first couple of waves, then open up one at a
   * time as the waves go on. Even once a trail is eligible it only has a
   * chance to carry a small, staggered trickle of creeps that wave — never
   * guaranteed, so the hidden ways stay a threat to watch rather than a
   * fixture.
   */
  private releaseTrailScouts(): void {
    if (this.waveNumber < TRAIL_UNLOCK_WAVE) return;

    const eligible = Math.min(
      this.map.trails.length,
      1 + Math.floor((this.waveNumber - TRAIL_UNLOCK_WAVE) / TRAIL_GROWTH_WAVES),
    );
    // Which trails are in play is randomised too, not just always the first N.
    const candidates = [...this.map.trails].sort(() => Math.random() - 0.5).slice(0, eligible);

    for (const trail of candidates) {
      if (Math.random() > TRAIL_ACTIVATION_CHANCE) continue;

      const creepId = TRAIL_SCOUT_IDS[Math.floor(Math.random() * TRAIL_SCOUT_IDS.length)];
      this.pending.push({
        creepId,
        remaining: 2 + Math.floor(Math.random() * 3),
        interval: 0.6 + Math.random() * 0.5,
        timer: 1 + Math.random() * 4,
        path: trail.path,
        laneSpread: trail.radius * LANE_SPREAD,
        joinRemaining: trail.joinRemaining,
      });
    }
  }

  update(dt: number): void {
    if (this.state === 'gameover' || this.state === 'victory') return;

    if (this.state === 'wave') this.spawn(dt);

    // Order matters: dogs and gates decide who is held before creeps move.
    for (const creep of this.creeps) {
      creep.blocked = false;
      creep.claimed = false;
      creep.bombarding = false;
      creep.engagedBy = null;
    }
    this.bombardTowers();
    this.swingFlails(dt);

    const ctx = {
      creeps: this.creeps,
      projectiles: this.projectiles,
      fires: this.fires,
      accuracyBonus: this.accuracyBonus,
      hospitals: this.hospitals,
      starving: this.starving,
    };
    for (const tower of this.towers) tower.update(dt, ctx);
    for (const gate of this.gates) {
      for (const slot of gate.installed) slot.update(dt, ctx);
    }
    this.besiegeGates(dt);
    for (const creep of this.creeps) creep.update(dt);
    for (const projectile of this.projectiles) projectile.update(dt, this.creeps, this.fires);
    for (const fire of this.fires) fire.update(dt, this.creeps);
    for (const crow of this.crows) crow.update(dt);
    this.crows = this.crows.filter((crow) => crow.alive);

    this.collectDead();
    this.removeFallenPosts();
    this.projectiles = this.projectiles.filter((p) => p.alive);
    this.fires = this.fires.filter((f) => f.alive);

    if (this.lives <= 0) {
      this.lives = 0;
      this.state = 'gameover';
      return;
    }

    if (this.state === 'wave' && this.pending.length === 0 && this.creeps.length === 0) {
      this.gold += WAVES[this.waveNumber - 1].reward;
      for (const tower of this.allTowers) tower.restorePack(this.meleeRecovery);
      this.settleFood();
      for (const tower of this.towers) tower.resetHarvest();
      this.state = this.waveNumber >= WAVES.length ? 'victory' : 'idle';
    }
  }

  /**
   * Enemy archers and slingers halt and shoot at your emplacements.
   *
   * **Only emplacements that shoot back are targets**, and that is a design
   * decision rather than an oversight. It makes the exchange a duel — they
   * shoot at the things shooting at them — which gives them one legible job
   * instead of being a flat increase in incoming damage. It also falls out
   * differently for each nation, which is the real reason: a realm that holds
   * the road with men has almost nothing for them to aim at, while one built
   * on massed bows has a line of targets. The same enemy is a nuisance to the
   * Kingdom and a genuine problem to the Wardens, without a single
   * nation-specific rule anywhere.
   *
   * Fighters out on the road are deliberately not targets. They already have a
   * counterplay loop — get hurt, fall back, be healed — and adding a second
   * source of damage to it would only make hospitals more mandatory. Buildings
   * had no such loop at all until now, which is exactly why they are the ones
   * worth threatening.
   */
  private bombardTowers(): void {
    const targets = this.allTowers.filter((tower) => tower.isShootable);
    if (targets.length === 0) return;

    for (const creep of this.creeps) {
      const gun = creep.def.bombard;
      if (!gun || !creep.alive) continue;

      // The nearest emplacement in reach, so they engage what is in front of
      // them rather than all converging on one unlucky building.
      let best: Tower | null = null;
      let bestDist = gun.range * gun.range;
      for (const tower of targets) {
        const d = dist2(creep.x, creep.y, tower.x, tower.y);
        if (d <= bestDist) {
          bestDist = d;
          best = tower;
        }
      }
      if (!best) continue;

      /*
       * It halts to *loose*, and only for as long as that takes — then it
       * shoulders the bow and walks on until the next shot is ready.
       *
       * This has to be a brief pause rather than "stop while a target is in
       * range", which is what it was at first and which soft-locked the game:
       * six bowmen parked out of reach of anything that could kill them,
       * whittling at an emplacement a hospital was mending just as fast, and
       * the wave simply never ended. A besieger must always make ground.
       */
      creep.bombarding = creep.bombardCooldown <= BOMBARD_AIM_TIME;
      if (creep.bombardCooldown > 0) continue;

      best.takeBuildingHit(gun.damage, gun.type);
      creep.bombardCooldown = 1 / gun.rate;
      creep.strike = 1;
    }
  }

  /**
   * The morning star. Everything the swinger can reach takes the blow at once:
   * fighters, dogs and emplacements alike. It never stops him walking.
   */
  private swingFlails(dt: number): void {
    for (const creep of this.creeps) {
      const flail = creep.def.sweep;
      if (!flail || !creep.alive) continue;

      creep.sweepCooldown -= dt;
      if (creep.sweepCooldown > 0) continue;
      creep.sweepCooldown = flail.interval;
      creep.sweptRecently = 1;

      const reachSq = flail.radius * flail.radius;
      for (const tower of this.allTowers) {
        for (const unit of tower.units) {
          if (unit.alive && dist2(unit.x, unit.y, creep.x, creep.y) <= reachSq) {
            unit.takeHit(flail.damage, flail.type);
          }
        }
        for (const dog of tower.dogs) {
          if (dog.alive && dist2(dog.x, dog.y, creep.x, creep.y) <= reachSq) {
            dog.takeHit(flail.damage, flail.type);
          }
        }
        if (tower.isShootable && dist2(tower.x, tower.y, creep.x, creep.y) <= reachSq) {
          tower.takeBuildingHit(flail.damage, flail.type);
        }
      }
    }
  }

  /**
   * Enemies that have walked up to a standing gate stop there and hack at it.
   * They are held at the gate's stopping line until the gate gives way.
   *
   * Creeps coming off a trail walk a different `Path` object than the main
   * road, so `blockDistance` (measured from the *start* of the main road)
   * cannot be compared to their `distance` directly. Distance remaining to
   * the *end* of the road is comparable instead: every trail is spliced onto
   * the same tail as the main road, so that tail measures identically no
   * matter which route a creep is on.
   */
  private besiegeGates(dt: number): void {
    if (this.gates.length === 0) return;

    for (const gate of this.gates) {
      if (gate.isOpen) continue;
      const remainingAtGate = this.map.path.length - gate.blockDistance;

      for (const creep of this.creeps) {
        if (!creep.alive) continue;
        // A gate built before this creep's trail joins the main road is not
        // on its route at all — the trail bypasses it entirely.
        if (remainingAtGate > creep.joinRemaining) continue;

        const remaining = creep.path.length - creep.distance;
        if (remaining > remainingAtGate) continue;

        creep.distance = creep.path.length - remainingAtGate;
        creep.blocked = true;
        gate.damageGate(creep.def.siege * dt);
      }
    }
  }

  private spawn(dt: number): void {
    const hpScale = waveHpScale(this.waveNumber);

    for (const group of this.pending) {
      group.timer -= dt;
      if (group.timer > 0 || group.remaining <= 0) continue;

      if (group.formation) {
        this.spawnFormation(group, hpScale);
        continue;
      }

      while (group.timer <= 0 && group.remaining > 0) {
        this.creeps.push(
          new Creep(CREEPS[group.creepId], group.path, hpScale, group.laneSpread, group.joinRemaining),
        );
        group.remaining--;
        group.timer += group.interval;
      }
    }
    this.pending = this.pending.filter((group) => group.remaining > 0);
  }

  /**
   * A block of troops that marches in together rather than trickling down the
   * road in single file: `columns` abreast across the width of the road, with
   * each successive rank queued up behind the last (off the map to begin
   * with, so they walk on rather than appearing all at once on the spot).
   */
  private spawnFormation(group: PendingGroup, hpScale: number): void {
    const def = CREEPS[group.creepId];
    const columns = Math.max(1, group.formation?.columns ?? 1);
    const rankGap = group.formation?.rankGap ?? 26;

    for (let i = 0; i < group.remaining; i++) {
      const column = i % columns;
      const rank = Math.floor(i / columns);
      // Spread the columns evenly across the road, centred on the middle.
      const offset = columns > 1 ? (column / (columns - 1) - 0.5) * 2 : 0;
      this.creeps.push(
        new Creep(def, group.path, hpScale, 0, group.joinRemaining, {
          lane: offset * group.laneSpread,
          startDistance: -rank * rankGap,
        }),
      );
    }
    group.remaining = 0;
  }

  /**
   * Buildings that are gone: a melee post whose last man was killed, and an
   * emplacement that has been shot to pieces. Either way the thing comes off
   * the board and the ground is free to build on again.
   */
  private removeFallenPosts(): void {
    const fallen = this.towers.filter(
      (tower) => (tower.def.attack === 'melee' && tower.units.length === 0) || tower.isWrecked,
    );

    // Turrets are wrecked in place rather than removed — the gatehouse they
    // sit in is still standing, and the emplacement can simply be rebuilt.
    for (const gate of this.gates) {
      for (let i = 0; i < gate.slots.length; i++) {
        const slot = gate.slots[i];
        if (!slot?.isWrecked) continue;
        if (this.selected === slot) this.selected = null;
        gate.slots[i] = null;
      }
    }

    if (fallen.length === 0) return;
    this.towers = this.towers.filter((tower) => !fallen.includes(tower));
    if (this.selected && fallen.includes(this.selected as Tower)) this.selected = null;
  }

  /** Pay out bounties, subtract leaked lives, and drop dead creeps from the list. */
  private collectDead(): void {
    const survivors: Creep[] = [];
    for (const creep of this.creeps) {
      if (creep.alive) {
        survivors.push(creep);
        continue;
      }
      if (creep.leaked) {
        this.lives -= creep.def.leak;
        continue;
      }
      // Only an actual kill triggers a death effect — walking off the end of
      // the road is not "destroyed", so nothing spills out or blows up.
      this.gold += Math.max(1, Math.round(creep.def.bounty * waveBountyScale(this.waveNumber)));
      this.applyDeathEffects(creep, survivors);
    }
    this.creeps = survivors;
    // Nothing to inspect once the thing on the other end of the panel is dead.
    if (this.selectedCreep && !this.selectedCreep.alive) this.selected = null;
  }

  /**
   * What happens at the exact spot a creep was killed: a marauder scorches
   * whoever is standing close, and a ram's escort spills out and keeps
   * marching on foot from right where it fell.
   */
  private applyDeathEffects(creep: Creep, survivors: Creep[]): void {
    const def = creep.def;

    if (def.deathBlastDamage && def.deathBlastRadius) {
      for (const tower of this.towers) {
        for (const unit of tower.units) {
          if (unit.alive && Math.hypot(unit.x - creep.x, unit.y - creep.y) <= def.deathBlastRadius) {
            unit.takeHit(def.deathBlastDamage, 'blunt');
          }
        }
        for (const dog of tower.dogs) {
          if (dog.alive && Math.hypot(dog.x - creep.x, dog.y - creep.y) <= def.deathBlastRadius) {
            dog.takeHit(def.deathBlastDamage, 'blunt');
          }
        }
      }
    }

    if (def.spawnOnDeath) {
      const spawnDef = CREEPS[def.spawnOnDeath.creepId as CreepId];
      if (spawnDef) {
        const hpScale = waveHpScale(this.waveNumber);
        const laneSpread = this.map.pathRadius * LANE_SPREAD;
        for (let i = 0; i < def.spawnOnDeath.count; i++) {
          const child = new Creep(spawnDef, creep.path, hpScale, laneSpread, creep.joinRemaining);
          // Staggered slightly behind one another rather than stacked exactly.
          child.warpTo(creep.distance - i * 7);
          survivors.push(child);
        }
      }
    }
  }

  private get placementWorld() {
    return {
      map: this.map,
      towers: this.towers,
      gates: this.gates,
      gold: this.gold,
      techs: this.techs,
      housingFree: this.housingFree,
      costOf: (def: TowerDef) => this.costOf(def),
    };
  }

  /** Why the currently hovered spot can or cannot take the selected tower. */
  placementStatus(x: number, y: number): PlacementError | null {
    if (!this.selectedTowerId) return null;
    return checkPlacement(this.placementWorld, towerDef(this.selectedTowerId), x, y);
  }

  tryPlaceTower(x: number, y: number): boolean {
    if (!this.selectedTowerId) return false;
    if (this.state === 'gameover' || this.state === 'victory') return false;
    // A nation can only raise what is on its own roster.
    if (!this.roster.includes(this.selectedTowerId)) return false;

    const def = towerDef(this.selectedTowerId);
    if (checkPlacement(this.placementWorld, def, x, y) !== 'ok') return false;

    this.gold -= this.costOf(def);

    if (def.placement === 'path') {
      // Snap the gatehouse onto the road and square it across the route.
      const at = this.map.path.nearestDistance(x, y);
      const point = this.map.path.positionAt(at);
      this.gates.push(
        new Gatehouse(
          def,
          point.x,
          point.y,
          point.angle + this.gateRotation,
          at,
          this.map.pathRadius,
        ),
      );
    } else {
      this.towers.push(this.raise(def, x, y));
    }
    return true;
  }

  /**
   * Put a building up, flagging it if a wave is already running. Everything
   * that creates a `Tower` goes through here so the flag can never be missed.
   */
  private raise(def: TowerDef, x: number, y: number, sheltered = false): Tower {
    const tower = new Tower(def, x, y, sheltered);
    tower.raisedMidWave = this.state === 'wave';
    return tower;
  }

  /** Every tower on the board, including those installed in gatehouse slots. */
  get allTowers(): Tower[] {
    return [...this.towers, ...this.gates.flatMap((gate) => gate.installed)];
  }

  /**
   * What sits under a point. A gatehouse is picked apart into three: whichever
   * turret was clicked (built or empty) wins over the gate in the middle.
   */
  pick(x: number, y: number): Selection {
    // City plots, the market and the city gate sit inside the walls, away from
    // everything else.
    const castle = this.map.def.castle;
    const gate = this.castleGatePosition;
    if (Math.hypot(gate.x - x, gate.y - y) <= castle.gateHalf + 12) {
      return { kind: 'castle-gate', x: gate.x, y: gate.y };
    }
    if (Math.hypot(castle.market.x - x, castle.market.y - y) <= 46) {
      return { kind: 'market', x: castle.market.x, y: castle.market.y };
    }
    for (const lot of castle.lots) {
      if (Math.hypot(lot.x - x, lot.y - y) > 26) continue;
      const built = this.towers.find((t) => Math.hypot(t.x - lot.x, t.y - lot.y) < 4);
      return built ?? { kind: 'lot', lot, x: lot.x, y: lot.y };
    }

    for (const gate of this.gates) {
      for (let i = 0; i < gate.slots.length; i++) {
        const spot = gate.slotPosition(i);
        if (Math.hypot(spot.x - x, spot.y - y) > gate.turretRadius) continue;
        return gate.slots[i] ?? gate.slotRef(i);
      }
      if (Math.hypot(gate.x - x, gate.y - y) <= gate.turretReach) return gate;
    }

    for (const tower of this.towers) {
      if (Math.hypot(tower.x - x, tower.y - y) <= tower.def.radius) return tower;
    }

    // A melee post's men are usually nowhere near it — they are out on the
    // road. Clicking one selects the post that raised him, so you can inspect
    // and upgrade the unit you are actually looking at instead of having to
    // remember which empty stand it came from.
    for (const tower of this.towers) {
      for (const unit of tower.units) {
        if (!unit.alive) continue;
        if (Math.hypot(unit.x - x, unit.y - y) <= FIGHTER_PICK_RADIUS) return tower;
      }
    }

    // Enemies last: small and moving, so give the click a little extra grace.
    for (const creep of this.creeps) {
      if (Math.hypot(creep.x - x, creep.y - y) <= creep.def.radius + 4) return creep;
    }
    return null;
  }

  /** Click handling for a click that is not placing a new tower. */
  selectAt(x: number, y: number): boolean {
    this.selected = this.pick(x, y);
    return this.selected !== null;
  }

  /** The selected object, but only when it is a tower. */
  get selectedTower(): Tower | null {
    return this.selected instanceof Tower ? this.selected : null;
  }

  /** The selected object, but only when it is an enemy on the road. */
  get selectedCreep(): Creep | null {
    return this.selected instanceof Creep ? this.selected : null;
  }

  /** The selected object, but only when it is a gate. */
  get selectedGate(): Gatehouse | null {
    return this.selected instanceof Gatehouse ? this.selected : null;
  }

  /** The selected object, but only when it is an empty emplacement. */
  get selectedSlot(): GateSlotRef | null {
    return this.selected && 'kind' in this.selected && this.selected.kind === 'slot'
      ? this.selected
      : null;
  }

  /** The selected object, but only when it is an empty city plot. */
  get selectedLot(): LotRef | null {
    return this.selected && 'kind' in this.selected && this.selected.kind === 'lot'
      ? this.selected
      : null;
  }

  /** True when the market square is open. */
  get selectedMarket(): MarketRef | null {
    return this.selected && 'kind' in this.selected && this.selected.kind === 'market'
      ? this.selected
      : null;
  }

  /** True when the city's own gate is open for inspection. */
  get selectedCastleGate(): CastleGateRef | null {
    return this.selected && 'kind' in this.selected && this.selected.kind === 'castle-gate'
      ? this.selected
      : null;
  }

  /** Where the road meets the city wall. */
  get castleGatePosition(): { x: number; y: number } {
    const castle = this.map.def.castle;
    return { x: castle.left, y: (castle.top + castle.bottom) / 2 };
  }

  /** Why the keep gate cannot be reinforced yet, or null when it can be. */
  keepGateBlocker(): string | null {
    if (this.keepGateReinforced) return 'Reinforced';
    if (!this.techs.has(CASTLE_GATE_UPGRADE.requiresTech)) return 'Needs research';
    if (this.gold < CASTLE_GATE_UPGRADE.cost) return 'Not enough gold';
    return null;
  }

  /** Reinforce the city gate. The extra lives are granted immediately. */
  reinforceKeepGate(): boolean {
    if (this.keepGateBlocker()) return false;
    this.gold -= CASTLE_GATE_UPGRADE.cost;
    this.keepGateReinforced = true;
    this.lives += CASTLE_GATE_UPGRADE.extraLives;
    return true;
  }

  // ------------------------------------------------------- plots and trade

  /** Whether the building a plot accepts can be raised right now. */
  lotBlocker(lot: BuildLot): string | null {
    const def = towerDef(lot.accepts as TowerId);
    if (def.requiresTech && !this.techs.has(def.requiresTech)) return 'Needs research';
    if ((def.housing ?? 0) > this.housingFree) return 'No housing';
    if (this.gold < this.costOf(def)) return 'Not enough gold';
    return null;
  }

  /** Raise the building a reserved plot is set aside for. */
  buildOnLot(lot: BuildLot): boolean {
    if (this.lotBlocker(lot)) return false;
    if (this.towers.some((t) => Math.hypot(t.x - lot.x, t.y - lot.y) < 4)) return false;

    const def = towerDef(lot.accepts as TowerId);
    this.gold -= this.costOf(def);
    const tower = this.raise(def, lot.x, lot.y, true);
    this.towers.push(tower);
    this.selected = tower;
    return true;
  }

  get canBuyFood(): boolean {
    return this.gold >= FOOD_BUY_PRICE * FOOD_TRADE_LOT;
  }

  get canSellFood(): boolean {
    return this.foodStore >= FOOD_TRADE_LOT;
  }

  /** Buy grain at the market. */
  buyFood(): boolean {
    if (!this.canBuyFood) return false;
    this.gold -= FOOD_BUY_PRICE * FOOD_TRADE_LOT;
    this.foodStore += FOOD_TRADE_LOT;
    return true;
  }

  /** Sell grain at the market. */
  sellFood(): boolean {
    if (!this.canSellFood) return false;
    this.foodStore -= FOOD_TRADE_LOT;
    this.gold += FOOD_SELL_PRICE * FOOD_TRADE_LOT;
    return true;
  }

  /** What the grain store will look like once this wave is settled. */
  get foodForecast(): { store: number; harvest: number; upkeep: number; after: number } {
    const harvest = Math.round(this.foodProduction);
    const upkeep = this.foodUpkeep;
    const after = this.foodStore + harvest - upkeep;
    return { store: Math.round(this.foodStore), harvest, upkeep, after: Math.round(after) };
  }

  // ---------------------------------------------------------------- gates

  repairSelectedGate(): boolean {
    const gate = this.selectedGate;
    if (!gate) return false;

    const cost = gate.repairCost;
    if (cost === 0 || this.gold < cost) return false;

    this.gold -= cost;
    gate.repair();
    return true;
  }

  /** Whether a gate upgrade on the selected gate can be bought right now. */
  canBuyGateUpgrade(id: string): boolean {
    const gate = this.selectedGate;
    if (!gate || gate.purchased.has(id)) return false;

    const upgrade = gate.def.upgrades.find((u) => u.id === id);
    if (!upgrade || gate.blockerFor(upgrade, this.techs)) return false;
    return this.gold >= upgrade.cost;
  }

  buyGateUpgrade(id: string): boolean {
    const gate = this.selectedGate;
    if (!gate || !this.canBuyGateUpgrade(id)) return false;

    const upgrade = gate.def.upgrades.find((u) => u.id === id);
    if (!upgrade) return false;

    this.gold -= upgrade.cost;
    gate.applyUpgrade(id);
    return true;
  }

  /**
   * Install a rock thrower or oil cauldron. Works on whichever emplacement is
   * currently selected; once built it behaves as an ordinary tower.
   */
  buildInSlot(index: number, towerId: TowerId, target?: Gatehouse): boolean {
    const gate = target ?? this.selectedSlot?.gate ?? this.selectedGate;
    if (!gate || index < 0 || index >= gate.slots.length) return false;
    if (gate.slots[index]) return false;
    if (!this.gateSlotOptions.includes(towerId)) return false;

    const def = towerDef(towerId);
    if (def.requiresTech && !this.techs.has(def.requiresTech)) return false;
    // A turret is manned like anything else. This check only started to matter
    // once `housingUsed` began counting emplacements — before that they were
    // free, and without it you can overdraw housing and strand the realm.
    if ((def.housing ?? 0) > this.housingFree) return false;
    if (this.gold < this.costOf(def)) return false;

    const spot = gate.slotPosition(index);
    this.gold -= this.costOf(def);
    const tower = this.raise(def, spot.x, spot.y);
    gate.slots[index] = tower;
    // Keep the player on the thing they just built.
    if (this.selectedSlot?.gate === gate) this.selected = tower;
    return true;
  }

  /** Whether a particular upgrade on the selected tower can be bought right now. */
  canBuyUpgrade(id: string): boolean {
    const tower: Tower | null = this.selectedTower;
    if (!tower || tower.purchased.has(id)) return false;

    const upgrade = tower.def.upgrades.find((u) => u.id === id);
    if (!upgrade) return false;
    if (tower.blockerFor(upgrade, this.techs)) return false;
    return this.gold >= upgrade.cost;
  }

  buyUpgrade(id: string): boolean {
    const tower = this.selectedTower;
    if (!tower || !this.canBuyUpgrade(id)) return false;

    const upgrade = tower.def.upgrades.find((u) => u.id === id);
    if (!upgrade) return false;

    this.gold -= upgrade.cost;
    tower.applyUpgrade(id);
    return true;
  }

  // ------------------------------------------------------------- research

  // -------------------------------------------------------------- economy

  /** People your houses can shelter. */
  get housingCapacity(): number {
    return this.towers.reduce((sum, tower) => sum + tower.stats.houseCapacity, 0);
  }

  /**
   * People currently needed to man everything you have built.
   *
   * `allTowers`, not `towers`: a rock thrower or oil cauldron installed in a
   * gatehouse turret is a manned emplacement like any other and declares its
   * own housing and food. Counting only `towers` quietly made both of them
   * free, which is a real saving of two people and two grain a turret.
   */
  get housingUsed(): number {
    return this.allTowers.reduce((sum, tower) => sum + (tower.def.housing ?? 0), 0);
  }

  get housingFree(): number {
    return this.housingCapacity - this.housingUsed;
  }

  /** Food harvested per wave, after crows have had their share. */
  get foodProduction(): number {
    return this.towers.reduce((sum, tower) => sum + tower.harvest, 0);
  }

  /** Food eaten per wave by everything you have built, turrets included. */
  get foodUpkeep(): number {
    return this.allTowers.reduce((sum, tower) => sum + (tower.def.food ?? 0), 0);
  }

  /**
   * Settle the books after a wave. Anything the harvest cannot cover leaves the
   * realm hungry, and hungry towers fight at reduced effectiveness until the
   * farms catch up.
   */
  private settleFood(): void {
    const production = this.foodProduction;
    const available = production + this.foodStore;
    const needed = this.foodUpkeep;

    if (available < needed) {
      this.starving = true;
      this.foodShortfall = Math.round((needed - available) * 10) / 10;
      this.foodStore = 0;
      return;
    }

    this.starving = false;
    this.foodShortfall = 0;
    // Surplus keeps for one wave only; the rest spoils.
    this.foodStore = Math.min(available - needed, Math.max(production, 1));
  }

  /** Every field hospital on the board, for wounded fighters to withdraw to. */
  get hospitals(): HospitalRef[] {
    return this.towers
      .filter((tower) => tower.stats.healRate > 0)
      .map((tower) => ({
        x: tower.x,
        y: tower.y,
        radius: tower.def.radius,
        range: tower.stats.range,
        healRate: tower.stats.healRate,
      }));
  }

  /** Research needs somewhere to happen. */
  get hasResearchBuilding(): boolean {
    return this.towers.some((tower) => tower.def.visual === 'research');
  }

  get accuracyBonus(): number {
    return techEffects(this.techs).accuracy;
  }

  /** Why a technology cannot be bought right now, or null when it can be. */
  researchBlocker(tech: TechDef): string | null {
    // Ordered most informative first: a missing prerequisite is more useful to
    // show than a shortage of gold.
    if (this.techs.has(tech.id)) return 'Researched';
    for (const id of tech.requires ?? []) {
      if (!this.techs.has(id)) return `Needs ${TECHS[id as TechId]?.name ?? id}`;
    }
    if (!this.hasResearchBuilding) return "Needs a Scholars' Hall";
    if (this.gold < this.techCostOf(tech)) return 'Not enough gold';
    return null;
  }

  /** Technologies are developed instantly; there is no waiting. */
  startResearch(id: string): boolean {
    const tech = TECHS[id as TechId];
    if (!tech || this.researchBlocker(tech)) return false;

    this.gold -= this.techCostOf(tech);
    this.techs.add(tech.id);
    return true;
  }

  reset(): void {
    this.creeps = [];
    this.towers = [];
    this.gates = [];
    this.crows = [];
    this.projectiles = [];
    this.fires = [];
    this.pending = [];
    this.techs.clear();
    this.keepGateReinforced = false;
    this.gold = this.startingGold;
    this.lives = STARTING_LIVES;
    this.waveNumber = 0;
    this.state = 'idle';
    this.selectedTowerId = null;
    this.selected = null;
    this.foodStore = 0;
    this.starving = false;
    this.foodShortfall = 0;

    // The realm begins with one house and one field already standing on their
    // plots inside the walls; the remaining plots are left for the player.
    const lots = this.map.def.castle.lots;
    for (const id of ['house-1', 'farm-1']) {
      const lot = lots.find((l) => l.id === id);
      if (lot) this.towers.push(this.raise(towerDef(lot.accepts as TowerId), lot.x, lot.y, true));
    }
    this.settleFood();
  }
}
