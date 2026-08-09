import { damageMultiplier } from '../data/armor';
import type { CreepDef } from '../data/creeps';
import type { DamageType } from '../data/towers';
import type { Path } from './Path';

/**
 * Whatever gets the credit for a hit. A tower implements this so its panel can
 * report what it has actually contributed.
 *
 * It is deliberately this narrow rather than a `Tower`: the creep would then
 * have to import the tower, which already imports the creep.
 */
export interface DamageSource {
  recordDamage(amount: number): void;
  recordKill(): void;
}

/** A fire burning on a creep, ticking damage until it goes out. */
export interface Burn {
  dps: number;
  remaining: number;
  /** Who set it alight, so the ticks are credited to them too. */
  source: DamageSource | null;
}

/** Burning refuses to stack beyond this; a third hit refreshes instead. */
export const MAX_BURN_STACKS = 2;

/**
 * Anything a creep can trade blows with. Dogs and swordsmen implement this, so
 * the creep can strike back at whoever is holding it. Position is exposed too,
 * so the creep can turn to actually face whoever it is fighting.
 */
export interface MeleeDefender {
  x: number;
  y: number;
  takeHit(damage: number, type: DamageType): void;
}

export class Creep {
  readonly def: CreepDef;
  readonly maxHp: number;
  hp: number;
  /** The route this particular creep walks — the main road, or a trail spliced onto it. */
  readonly path: Path;
  /**
   * Distance-remaining-to-the-end below which this creep is walking the
   * shared tail of the main road, and so can be stopped by a gate on it. See
   * `Lane.joinRemaining`.
   */
  readonly joinRemaining: number;

  /** Distance travelled along the route. Position is derived from this. */
  distance = 0;
  x: number;
  y: number;
  angle = 0;

  alive = true;
  /** True when it walked off the end of the route instead of being killed. */
  leaked = false;
  /**
   * Set every frame by any dog currently holding this creep. While true the
   * creep stops advancing. Cleared by the game at the start of each step.
   */
  blocked = false;
  /**
   * Set by any dog that has picked this creep, including while still running
   * towards it. Lets a pack spread out instead of all chasing the same enemy.
   */
  claimed = false;

  /** Fires burning on this creep. Never more than MAX_BURN_STACKS of them. */
  burns: Burn[] = [];

  /**
   * Whoever currently has hold of this creep. Set each frame by that defender,
   * and used here so the creep hits back on its own attack rhythm rather than
   * bleeding the defender continuously.
   */
  engagedBy: MeleeDefender | null = null;
  /** Seconds until it can swing again. */
  private attackCooldown = 0;
  /** Counts up briefly after a blow so the renderer can show the strike. */
  strike = 0;

  /**
   * Set each frame by the game while this creep has halted to shoot at an
   * emplacement. Like `blocked` it stops the creep advancing, but it is its
   * own flag so the renderer can tell "pinned by a pikeman" from "standing
   * still and loosing arrows".
   */
  bombarding = false;
  /** Seconds until it can loose again. */
  bombardCooldown = 0;
  /** Seconds until the next swing of a flail. */
  sweepCooldown = 0;
  /** Runs 1 to 0 just after a swing, purely for the animation. */
  sweptRecently = 0;

  /**
   * How far to one side of the centre line this creep walks, in world units.
   * Without it the whole wave marches in a single file down the middle.
   */
  readonly lane: number;

  constructor(
    def: CreepDef,
    path: Path,
    hpScale = 1,
    laneSpread = 0,
    joinRemaining = Infinity,
    placement: { lane?: number; startDistance?: number } = {},
  ) {
    this.def = def;
    this.path = path;
    this.joinRemaining = joinRemaining;
    this.maxHp = Math.round(def.maxHp * hpScale);
    this.hp = this.maxHp;
    // A formation places each rank and file deliberately; everything else
    // just wanders somewhere within the width of the road.
    this.lane = placement.lane ?? (Math.random() * 2 - 1) * laneSpread;
    this.distance = placement.startDistance ?? 0;

    const start = path.positionAt(this.distance);
    this.x = start.x - Math.sin(start.angle) * this.lane;
    this.y = start.y + Math.cos(start.angle) * this.lane;
    this.angle = start.angle;
  }

  /**
   * Set the creep alight. Two fires may burn at once; a third hit refreshes the
   * one closest to going out rather than adding another.
   */
  ignite(dps: number, duration: number, source: DamageSource | null = null): void {
    if (dps <= 0 || duration <= 0 || !this.alive) return;

    if (this.burns.length < MAX_BURN_STACKS) {
      this.burns.push({ dps, remaining: duration, source });
      return;
    }

    let weakest = 0;
    for (let i = 1; i < this.burns.length; i++) {
      if (this.burns[i].remaining < this.burns[weakest].remaining) weakest = i;
    }
    this.burns[weakest] = { dps, remaining: duration, source };
  }

  private burn(dt: number): void {
    if (this.burns.length === 0) return;

    for (const fire of this.burns) {
      fire.remaining -= dt;
      this.takeDamage(fire.dps * dt, 'fire', fire.source);
    }
    this.burns = this.burns.filter((fire) => fire.remaining > 0);
  }

  /** Swing at whoever is holding this creep, on the creep's own rhythm. */
  private fightBack(dt: number): void {
    if (this.strike > 0) this.strike = Math.max(0, this.strike - dt / 0.25);
    if (this.attackCooldown > 0) this.attackCooldown -= dt;

    const foe = this.engagedBy;
    if (!foe || !this.alive) return;
    // Some things carry no weapon at all — a ram is a rolling shield, not a
    // fighter, and should never land a blow on anybody.
    if (this.def.melee <= 0) return;

    if (this.attackCooldown <= 0) {
      foe.takeHit(this.def.melee, this.def.meleeType);
      this.attackCooldown = 1 / this.def.attackSpeed;
      this.strike = 1;
    }
  }

  update(dt: number): void {
    this.burn(dt);
    this.fightBack(dt);
    if (this.bombardCooldown > 0) this.bombardCooldown -= dt;
    if (this.sweptRecently > 0) this.sweptRecently = Math.max(0, this.sweptRecently - dt / 0.4);
    // Standing to shoot costs it the same ground as being held does.
    if (!this.blocked && !this.bombarding) this.distance += this.def.speed * dt;

    if (this.distance >= this.path.length) {
      this.alive = false;
      this.leaked = true;
    }

    const p = this.path.positionAt(this.distance);
    this.x = p.x - Math.sin(p.angle) * this.lane;
    this.y = p.y + Math.cos(p.angle) * this.lane;
    this.angle = p.angle;

    // While actually trading blows, face whoever is holding it rather than
    // blindly forward — an attacker to the side or behind turns it to meet.
    // Things that never fight back (a ram) just keep rolling up the road.
    if (this.engagedBy && !this.def.neverTurns) {
      this.angle = Math.atan2(this.engagedBy.y - this.y, this.engagedBy.x - this.x);
    }
  }

  /**
   * Jump straight to a distance along the route and snap position to match,
   * instead of walking there over time. Used to spawn a ram's escort already
   * part-way down the road, at the spot the ram itself just died.
   */
  warpTo(distance: number): void {
    this.distance = Math.max(0, distance);
    const p = this.path.positionAt(this.distance);
    this.x = p.x - Math.sin(p.angle) * this.lane;
    this.y = p.y + Math.cos(p.angle) * this.lane;
    this.angle = p.angle;
  }

  /**
   * Hurt this creep. `source` gets the credit, if anyone does.
   *
   * What is credited is the damage that actually *landed*, after armour and
   * after clamping to whatever health was left — so a tower's total is what it
   * really contributed, not the sum of the numbers on its stat card. An
   * overkill hit on a creep with 3 health left counts as 3.
   */
  takeDamage(amount: number, type: DamageType, source: DamageSource | null = null): void {
    if (!this.alive) return;
    // Damage is quoted against unarmoured targets; armour adjusts from there.
    const landed = Math.min(this.hp, amount * damageMultiplier(type, this.def.armor));
    this.hp -= landed;
    source?.recordDamage(landed);

    if (this.hp <= 0) {
      this.hp = 0;
      this.alive = false;
      source?.recordKill();
    }
  }
}
