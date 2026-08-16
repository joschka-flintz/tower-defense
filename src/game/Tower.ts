import { TAU } from '../core/rng';
import { angleDiff, dist2, turnToward, TAU_QUARTER } from '../core/vec';
import { damageMultiplier } from '../data/armor';
import type { DamageType } from '../data/towers';
import {
  statsFor,
  upgradeBlocker,
  type TowerDef,
  type TowerStats,
  type TowerUpgrade,
} from '../data/towers';
import type { Creep, DamageSource } from './Creep';
import { Dog } from './Dog';
import type { FireField } from './FireField';
import { Projectile, type ProjectileSpec } from './Projectile';
import { Swordsman, type HospitalRef } from './Swordsman';

/**
 * Health a melee fighter recovers between waves, as a fraction of his maximum,
 * when his nation grants no better. See `NationTraits.meleeRecovery`.
 */
export const DEFAULT_MELEE_RECOVERY = 0.5;

/** How closely the turret must be aimed before it may fire (radians). */
const AIM_TOLERANCE = 0.12;

/** Seconds the firing animation takes to play out. */
const FLASH_TIME = 0.3;

/** Everything a tower needs from the wider game while updating. */
export interface TowerContext {
  creeps: Creep[];
  projectiles: Projectile[];
  fires: FireField[];
  /** Flat hit-chance bonus from researched technologies. */
  accuracyBonus: number;
  /** Field hospitals wounded fighters can withdraw to. */
  hospitals: HospitalRef[];
  /** True when the last harvest fell short; everything fights worse. */
  starving: boolean;
}

/** How much of its usual effectiveness a hungry tower manages. */
const STARVING_EFFECTIVENESS = 0.6;

/**
 * How far from the centre of a swinging flail head its blow still lands. The
 * ball is not a point — this is the spiked ball plus the arc it carries — but
 * it is small, and that is the whole reason a sweep tower threatens a *band*
 * of ground rather than a filled circle.
 */
const FLAIL_HEAD_REACH = 13;

export class Tower implements DamageSource {
  readonly def: TowerDef;
  readonly x: number;
  readonly y: number;

  /** Damage this building has actually landed, and enemies it has finished off. */
  damageDealt = 0;
  kills = 0;

  /**
   * Emplacements that can be shot at. `maxBuildingHp` is 0 for anything the
   * enemy cannot hurt — houses, farms, hospitals and melee posts, whose men
   * are the thing that dies rather than the stand they came from.
   */
  buildingHp = 0;
  /** True while a siege engine has stood down to mend itself and cannot fire. */
  repairing = false;

  /** Ids of the upgrades bought on this tower. */
  readonly purchased = new Set<string>();
  stats: TowerStats;

  /**
   * Gold actually spent on this building — what was paid to raise it, plus
   * every upgrade since. Recorded rather than recomputed from the price list
   * because it is what a refund is owed against: nation discounts, and any
   * future price change, must not turn a sale into a profit or a loss.
   */
  goldSpent = 0;

  angle = -Math.PI / 2;
  private cooldown = 0;
  /**
   * Sweep towers: where the head is on its circle right now, in radians. Public
   * because the renderer draws the ball at exactly this angle — the ball you
   * can see is the ball that hits, and that only holds if both read the same
   * number.
   */
  flailAngle = 0;
  /** Everyone the head has already caught on this revolution. */
  private readonly struckThisTurn = new Set<Creep>();
  /** Firing animation: set to 1 on each shot, decays back to 0. */
  flash = 0;
  target: Creep | null = null;

  /** Hound towers only: the dogs currently out. */
  dogs: Dog[] = [];
  /** Dogs die for good within a wave, so this counts how many are out. */
  private dogsSpawned = 0;

  /** Farms only: crows eat into this during a wave. */
  private harvestLost = 0;
  /**
   * True when this building was raised while a wave was already running, and so
   * takes no part in that wave's reckoning.
   *
   * Only farms notice, and it exists to close one specific hole: the books are
   * settled at the *end* of a wave, so without this a farm thrown up halfway
   * through still delivered a full harvest and retroactively cancelled a
   * shortage you could already see coming. Upkeep needs no equivalent — a
   * tower raised mid-wave is standing when the books are settled, so it eats.
   * The sanctioned way out of a shortage is the market, which charges for it.
   */
  raisedMidWave = false;
  /** 1 normally, less while the realm is hungry. */
  effectiveness = 1;

  /** Melee towers only: the fighters raised from this post. */
  units: Swordsman[] = [];
  /** Fighters are never replaced once killed, so this counts those raised. */
  private unitsRaised = 0;

  /** True when this building stands on a plot inside the city walls. */
  readonly sheltered: boolean;

  constructor(def: TowerDef, x: number, y: number, sheltered = false) {
    this.def = def;
    this.x = x;
    this.y = y;
    this.sheltered = sheltered;
    this.stats = statsFor(def, this.purchased);
    this.grantFreeUpgrades();
    this.applyShelter();
    this.buildingHp = this.stats.buildingHp;
    this.replenishPack();
    this.raiseFighters();
  }

  // ------------------------------------------------------- taking fire

  /** True when the enemy has anything worth shooting at here. */
  get isShootable(): boolean {
    return this.stats.buildingHp > 0;
  }

  get buildingHealthFraction(): number {
    return this.stats.buildingHp > 0 ? this.buildingHp / this.stats.buildingHp : 1;
  }

  /** True once the emplacement has been wrecked and should come off the board. */
  get isWrecked(): boolean {
    return this.isShootable && this.buildingHp <= 0;
  }

  /** An enemy shoots the emplacement itself. Armour applies as it does to anyone. */
  takeBuildingHit(damage: number, type: DamageType): void {
    if (!this.isShootable) return;
    this.buildingHp = Math.max(0, this.buildingHp - damage * damageMultiplier(type, this.stats.armor));
  }

  /** Mend it, by its own crew or by a hospital's people. Never past full. */
  mend(amount: number): void {
    if (!this.isShootable) return;
    this.buildingHp = Math.min(this.stats.buildingHp, this.buildingHp + amount);
  }

  /** The city walls do the work a scarecrow would. */
  private applyShelter(): void {
    if (!this.sheltered) return;
    if (this.stats.foodOutput > 0) this.stats.crowProtection = 1;
  }

  /**
   * Upgrades a building starts life with, free, because of where it stands.
   *
   * A house inside the walls is built properly from the outset — it comes with
   * its Timber Frame already up, and without needing the research. This used to
   * be a flat +3 capacity instead, which quietly bricked the house upgrade path:
   * a walled house at 8 already beat the Timber Frame's 7, so the panel hid it
   * as redundant, and Townhouse requires it, so a walled house could never be
   * improved at all.
   */
  private grantFreeUpgrades(): void {
    if (!this.sheltered) return;
    if (this.def.visual !== 'house') return;
    this.purchased.add('timber-frame');
    this.stats = statsFor(this.def, this.purchased);
  }

  // Credit for a hit, from `DamageSource`. Called by whatever actually landed
  // it — a shot, a burning patch of ground, a dog, a man with a pike.
  recordDamage(amount: number): void {
    this.damageDealt += amount;
  }

  recordKill(): void {
    this.kills++;
  }

  /**
   * True when an upgrade would change nothing, because the building already has
   * what it grants — a sheltered farm and its scarecrow, for instance.
   */
  isRedundant(upgrade: TowerUpgrade): boolean {
    const entries = Object.entries(upgrade.stats);
    if (entries.length === 0) return false;

    return entries.every(([key, want]) => {
      const have = (this.stats as unknown as Record<string, unknown>)[key];
      if (typeof want === 'number' && typeof have === 'number') return have >= want;
      return have === want;
    });
  }

  // ------------------------------------------------------------- upgrades

  /** Upgrades still available to buy, in declaration order. */
  get openUpgrades(): TowerUpgrade[] {
    return this.def.upgrades.filter((u) => !this.purchased.has(u.id));
  }

  get isFullyUpgraded(): boolean {
    return this.def.upgrades.length > 0 && this.purchased.size >= this.def.upgrades.length;
  }

  /** Why an upgrade is not buyable yet, or null when it is. */
  blockerFor(upgrade: TowerUpgrade, techs: ReadonlySet<string>): string | null {
    return upgradeBlocker(upgrade, this.purchased, techs, this.def.upgrades);
  }

  /** Apply an upgrade by id. Cost and prerequisites are checked by the caller. */
  applyUpgrade(id: string): void {
    if (this.purchased.has(id)) return;
    const before = this.stats;
    this.purchased.add(id);
    this.stats = statsFor(this.def, this.purchased);
    this.applyShelter();

    // A bigger damage pool also benefits dogs already in the field.
    const extra = this.stats.dogHp - before.dogHp;
    for (const dog of this.dogs) dog.grantExtraHealth(extra);

    // Better armour raises the ceiling for men already in the field too.
    const tougher = this.stats.unitHp - before.unitHp;
    if (tougher > 0) {
      for (const unit of this.units) {
        unit.maxHp = this.stats.unitHp;
        unit.hp += tougher;
      }
    }

    this.replenishPack();
    this.raiseFighters();
  }

  /** Raise any fighters the post is still owed. The dead are not replaced. */
  private raiseFighters(): void {
    while (this.unitsRaised < this.stats.units) {
      const a = -TAU_QUARTER + this.unitsRaised * 2.3;
      const spot = this.def.radius * 0.85;
      this.units.push(
        new Swordsman(
          this.x + Math.cos(a) * spot,
          this.y + Math.sin(a) * spot,
          this.stats.unitHp,
        ),
      );
      this.unitsRaised++;
    }
  }

  // ---------------------------------------------------------------- hounds

  /** Send out any dogs the tower is still owed. */
  private replenishPack(): void {
    while (this.dogsSpawned < this.stats.dogs) {
      const a = -TAU_QUARTER + this.dogsSpawned * 2.3;
      const spot = this.def.radius * 0.95;
      this.dogs.push(
        new Dog(this.x + Math.cos(a) * spot, this.y + Math.sin(a) * spot, this.stats.dogHp),
      );
      this.dogsSpawned++;
    }
  }

  /**
   * Called between waves: the pack rests up. Surviving dogs are healed to full
   * and any that died are replaced.
   */
  restorePack(meleeRecovery = DEFAULT_MELEE_RECOVERY): void {
    if (this.def.attack === 'melee') {
      for (const unit of this.units) {
        unit.recoverBetweenWaves(meleeRecovery, this.stats.unitHp);
      }

      // A post that still has someone standing fills its gaps from the levy
      // between waves. A post that was wiped out entirely does not come back —
      // `Game.removeFallenPosts` has already taken it off the board and freed
      // the ground.
      //
      // This asymmetry is the point. When the swordsman was the only melee
      // tower, "he dies and the post is gone" was a fair price for a cheap
      // gap-filler. A realm that leans on melee for most of its board cannot
      // pay it: under the old rule the balance runs spent their whole income
      // replacing what they had already bought, stalled at six buildings and
      // lost on wave 6 every time. Ranks refilling makes the multi-man posts
      // genuinely durable, while a lone swordsman or knight is still all or
      // nothing.
      if (this.units.length > 0) {
        this.unitsRaised = this.units.length;
        this.raiseFighters();
      }
      return;
    }

    if (this.def.attack !== 'hound') return;

    for (const dog of this.dogs) {
      dog.maxHp = this.stats.dogHp;
      dog.hp = this.stats.dogHp;
    }

    this.dogsSpawned = this.dogs.length;
    this.replenishPack();
  }

  /** True while a tower has no fighters left to send out. */
  get isSpent(): boolean {
    if (this.def.attack === 'hound') {
      return this.dogs.length === 0 && this.dogsSpawned >= this.stats.dogs;
    }
    if (this.def.attack === 'melee') {
      return this.units.length === 0 && this.unitsRaised >= this.stats.units;
    }
    return false;
  }

  // --------------------------------------------------------------- harvest

  /** What this farm will actually bring in, after crows have had their share. */
  get harvest(): number {
    if (this.stats.foodOutput <= 0) return 0;
    // Sown too late to be reaped this wave.
    if (this.raisedMidWave) return 0;
    return Math.max(0, this.stats.foodOutput - this.harvestLost);
  }

  /** True while crows have spoiled part of this field. */
  get harvestSpoiled(): boolean {
    return this.harvestLost > 0;
  }

  /**
   * Crows peck at the field. A scarecrow keeps them off entirely. Even a large
   * flock can only take half a harvest — they are a nuisance, not a famine.
   */
  spoilHarvest(amount: number): void {
    if (this.stats.foodOutput <= 0) return;
    if (this.stats.crowProtection >= 1) return;
    const worst = this.stats.foodOutput * 0.5;
    this.harvestLost = Math.min(worst, this.harvestLost + amount);
  }

  /** Called once the harvest has been counted, ready for the next wave. */
  resetHarvest(): void {
    this.harvestLost = 0;
    // Whatever it missed, it is part of the realm properly from now on.
    this.raisedMidWave = false;
  }

  // ---------------------------------------------------------------- update

  update(dt: number, ctx: TowerContext): void {
    if (this.flash > 0) this.flash = Math.max(0, this.flash - dt / FLASH_TIME);

    // Hungry crews are slower and weaker, but they stay at their posts.
    this.effectiveness = ctx.starving ? STARVING_EFFECTIVENESS : 1;

    this.updateRepairs(dt, ctx);

    if (this.def.attack === 'hound') this.updateHounds(dt, ctx.creeps);
    else if (this.def.attack === 'melee') this.updateFighters(dt, ctx);
    // A crew mending its engine has put its tools down and is not shooting.
    else if (this.def.attack === 'sweep' && !this.repairing) this.updateSweep(dt, ctx);
    else if (this.def.attack === 'projectile' && !this.repairing) this.updateProjectile(dt, ctx);
  }

  /**
   * A weapon on a chain, going round and round. There is **no target**.
   *
   * The head travels a circle of radius `whirlwindRadius`, one revolution every
   * `whirlwindInterval` seconds, and hurts whatever the ball itself passes
   * through — a creep is struck when the head reaches *it*, not when the timer
   * fires. Each one takes the blow once per revolution: `struckThisTurn` holds
   * everyone already caught, and empties as the head comes back round.
   *
   * This replaced a version that damaged everything inside the circle at once
   * every interval, which was far too strong for the price. It was not the
   * numbers that were wrong so much as the shape: a single 85-gold post landed
   * its full damage on a dozen enemies simultaneously. Now the ball has to
   * physically reach you, so what it threatens is a *band* of ground at arm's
   * length rather than a filled disc — and the enemies inside that band are hit
   * one after another as it comes round, not all in the same instant.
   */
  private updateSweep(dt: number, ctx: TowerContext): void {
    const period = this.stats.whirlwindInterval;
    const orbit = this.stats.whirlwindRadius;
    if (period <= 0 || orbit <= 0 || this.stats.whirlwindDamage <= 0) return;

    // Hungry crews swing slower, exactly as hungry crews shoot slower.
    this.flailAngle += ((TAU / period) * dt) / Math.max(0.01, 1 / this.effectiveness);
    if (this.flailAngle >= TAU) {
      this.flailAngle -= TAU;
      // Round again: everyone is a fresh target.
      this.struckThisTurn.clear();
    }

    const hx = this.x + Math.cos(this.flailAngle) * orbit;
    const hy = this.y + Math.sin(this.flailAngle) * orbit;

    for (const creep of ctx.creeps) {
      if (!creep.alive || this.struckThisTurn.has(creep)) continue;
      const reach = FLAIL_HEAD_REACH + creep.def.radius;
      if (dist2(hx, hy, creep.x, creep.y) > reach * reach) continue;

      creep.takeDamage(this.stats.whirlwindDamage, this.stats.damageType, this);
      this.struckThisTurn.add(creep);
      this.flash = 1;
    }
  }

  /**
   * Patching the emplacement back up, from two possible sources.
   *
   * **Being worked on means not shooting**, whichever source is doing it. You
   * cannot span the frame of an engine and crank it at the same time, and the
   * surgeons cannot dress a crossbowman's arm while he spans his bow. That is
   * the whole cost of repair, and it is what stops a hospital simply making a
   * line of emplacements unkillable.
   *
   * The two sources differ in when they start. A siege engine's own crew waits
   * until the damage is bad enough to be worth downing tools for (`retreatAt`)
   * and then works until the engine is whole — so it cannot flicker in and out
   * of action over a single point of damage. A hospital starts on anything
   * hurt at all, but heals fast, so the pause is brief.
   */
  private updateRepairs(dt: number, ctx: TowerContext): void {
    if (!this.isShootable) return;

    if (this.buildingHp >= this.stats.buildingHp) {
      this.repairing = false;
      return;
    }

    if (this.stats.selfRepair > 0) {
      if (this.buildingHealthFraction < this.stats.retreatAt) this.repairing = true;
      if (this.repairing) {
        this.mend(this.stats.selfRepair * dt);
        if (this.buildingHp >= this.stats.buildingHp) this.repairing = false;
        return;
      }
    }

    for (const ward of ctx.hospitals) {
      if (dist2(this.x, this.y, ward.x, ward.y) > ward.range * ward.range) continue;
      this.mend(ward.healRate * dt);
      // Under the surgeons' hands, and so not at his post.
      this.repairing = this.buildingHp < this.stats.buildingHp;
      return;
    }

    // Hurt, but nobody is working on it — back to the parapet.
    this.repairing = false;
  }

  private updateFighters(dt: number, ctx: TowerContext): void {
    const owner = {
      x: this.x,
      y: this.y,
      range: this.stats.range,
      dps: this.stats.unitDps * this.effectiveness,
      speed: this.stats.unitSpeed,
      retreatAt: this.stats.retreatAt,
      restAt: this.stats.restAt,
      whirlwindDamage: this.stats.whirlwindDamage,
      whirlwindRadius: this.stats.whirlwindRadius,
      whirlwindInterval: this.stats.whirlwindInterval,
      armor: this.stats.armor,
      damageType: this.stats.damageType,
      source: this,
    };

    for (const unit of this.units) unit.update(dt, ctx.creeps, owner, ctx.hospitals);
    this.units = this.units.filter((unit) => unit.alive);

    this.target = this.acquireTarget(ctx.creeps);
  }

  private updateHounds(dt: number, creeps: Creep[]): void {
    const owner = {
      x: this.x,
      y: this.y,
      range: this.stats.range,
      dps: this.stats.dogDps * this.effectiveness,
      speed: this.stats.dogSpeed,
      source: this,
    };

    for (const dog of this.dogs) dog.update(dt, creeps, owner);
    this.dogs = this.dogs.filter((dog) => dog.alive);

    this.target = this.acquireTarget(creeps);
    const watch = this.dogs.find((dog) => dog.state !== 'idle') ?? null;
    const lookAt = watch ?? this.target;
    if (lookAt) {
      const desired = Math.atan2(lookAt.y - this.y, lookAt.x - this.x);
      this.angle = turnToward(this.angle, desired, this.stats.turnSpeed * dt);
    }
  }

  private updateProjectile(dt: number, ctx: TowerContext): void {
    if (this.cooldown > 0) this.cooldown -= dt;

    this.target = this.acquireTarget(ctx.creeps);
    if (!this.target) return;

    const desired = Math.atan2(this.target.y - this.y, this.target.x - this.x);
    this.angle = turnToward(this.angle, desired, this.stats.turnSpeed * dt);

    if (this.cooldown <= 0 && Math.abs(angleDiff(this.angle, desired)) < AIM_TOLERANCE) {
      const chance = Math.min(1, this.stats.accuracy + ctx.accuracyBonus);
      const muzzle = this.def.radius * 0.9;

      ctx.projectiles.push(
        new Projectile(
          this.projectileSpec(),
          this.x + Math.cos(this.angle) * muzzle,
          this.y + Math.sin(this.angle) * muzzle,
          this.target,
          Math.random() < chance,
          this,
        ),
      );
      this.cooldown = 1 / (this.stats.fireRate * this.effectiveness);
      this.flash = 1;
    }
  }

  private projectileSpec(): ProjectileSpec {
    return {
      shape: this.def.projectileShape ?? 'arrow',
      ballistic: this.def.ballistic ?? false,
      radius: this.stats.projectileRadius,
      damage: this.stats.damage,
      speed: this.stats.projectileSpeed,
      damageType: this.stats.damageType,
      splashRadius: this.stats.splashRadius,
      burnDps: this.stats.burnDps,
      burnDuration: this.stats.burnDuration,
      burnRadius: this.stats.burnRadius,
      igniteDps: this.stats.igniteDps,
      igniteDuration: this.stats.igniteDuration,
    };
  }

  /** Bloons-style "first" targeting: the creep furthest along the route. */
  private acquireTarget(creeps: Creep[]): Creep | null {
    if (this.stats.range <= 0) return null;
    const rangeSq = this.stats.range * this.stats.range;
    let best: Creep | null = null;

    for (const creep of creeps) {
      if (!creep.alive) continue;
      if (dist2(this.x, this.y, creep.x, creep.y) > rangeSq) continue;
      if (!best || creep.distance > best.distance) best = creep;
    }
    return best;
  }
}
