import { damageMultiplier, type ArmorType } from '../data/armor';
import type { DamageType } from '../data/towers';
import { dist, dist2 } from '../core/vec';
import type { Creep, DamageSource, MeleeDefender } from './Creep';

export type SwordsmanState =
  | 'idle'
  | 'advancing'
  | 'fighting'
  | 'retreating'
  | 'healing'
  | 'returning';

/** What the fighter needs to know about the post he was raised from. */
export interface SwordsmanOwner {
  x: number;
  y: number;
  range: number;
  dps: number;
  speed: number;
  /** Health fraction below which he breaks off and looks for a hospital. */
  retreatAt: number;
  /** Whirlwind: damage to everything around him, 0 when not trained for it. */
  whirlwindDamage: number;
  whirlwindRadius: number;
  /** Seconds between spins. */
  whirlwindInterval: number;
  /** What he is wearing, which decides how much each blow actually hurts. */
  armor: ArmorType;
  /**
   * What kind of blow he lands — a sword cuts, a pike punches through, a
   * warhammer crushes. Applies to the whirlwind as well as the duel.
   */
  damageType: DamageType;
  /** The post these fighters were raised from, so its panel can total them up. */
  source: DamageSource | null;
}

/** A field hospital he can withdraw to. */
export interface HospitalRef {
  x: number;
  y: number;
  /** How close he must get before the surgeons can start on him. */
  radius: number;
  /**
   * How far out the hospital will take patients from. A man hurt beyond this
   * has no one to fall back to and holds where he stands. Placing a hospital
   * is a real decision because of this.
   */
  range: number;
  healRate: number;
}

/** How close he must get before he can swing. */
const REACH = 8;

/** He returns to the line once patched back up to this fraction of health. */
const FIT_AGAIN = 0.95;

/**
 * A fighter who steps onto the road and holds an enemy there, exactly as a
 * dog does — but he has real health and the enemy hits back.
 *
 * This one class backs *every* melee post, not just the swordsman it is named
 * after: a pikeman, a warhammer knight and a mounted knight are the same code
 * with different numbers, a different armour class and a different damage type,
 * all of which arrive through `SwordsmanOwner`.
 *
 * Wounded below his retreat threshold he disengages and walks to the nearest
 * field hospital. With no hospital built he has nowhere to go, keeps fighting,
 * and can be killed outright.
 */
export class Swordsman implements MeleeDefender {
  x: number;
  y: number;
  angle = 0;
  state: SwordsmanState = 'idle';
  target: Creep | null = null;

  hp: number;
  maxHp: number;
  alive = true;

  /** Advances while moving, so the renderer can animate his stride. */
  gait = 0;

  readonly homeX: number;
  readonly homeY: number;
  private hospital: HospitalRef | null = null;

  /** Seconds until the next whirlwind. */
  private spinCooldown = 0;
  /** Runs 1 to 0 right after a spin, purely for the animation. */
  spin = 0;

  /** Mirrored from the post's stats each tick, so `takeHit` can use it. */
  armor: ArmorType = 'medium';

  constructor(homeX: number, homeY: number, maxHp: number) {
    this.homeX = homeX;
    this.homeY = homeY;
    this.x = homeX;
    this.y = homeY;
    this.maxHp = maxHp;
    this.hp = maxHp;
  }

  get healthFraction(): number {
    return this.maxHp > 0 ? this.hp / this.maxHp : 0;
  }

  /** Called between waves: he binds his wounds but only partly recovers. */
  recoverBetweenWaves(fraction: number, newMaxHp: number): void {
    this.maxHp = newMaxHp;
    this.hp = Math.min(this.maxHp, this.hp + this.maxHp * fraction);
  }

  takeHit(damage: number, type: DamageType): void {
    if (!this.alive) return;
    this.hp -= damage * damageMultiplier(type, this.armor);
    if (this.hp <= 0) {
      this.hp = 0;
      this.alive = false;
      this.target = null;
    }
  }

  /**
   * The Wirbelattacke: a full turn with the blade that hits everything within
   * reach, on its own timer, independent of whoever he is duelling.
   */
  private whirlwind(dt: number, creeps: Creep[], owner: SwordsmanOwner): void {
    if (this.spin > 0) this.spin = Math.max(0, this.spin - dt / 0.35);
    if (owner.whirlwindDamage <= 0 || owner.whirlwindInterval <= 0) return;

    this.spinCooldown -= dt;
    if (this.spinCooldown > 0) return;

    // Only worth swinging when something is actually in reach.
    const radiusSq = owner.whirlwindRadius * owner.whirlwindRadius;
    let struck = false;
    for (const creep of creeps) {
      if (!creep.alive) continue;
      if (dist2(this.x, this.y, creep.x, creep.y) > radiusSq) continue;
      creep.takeDamage(owner.whirlwindDamage, owner.damageType, owner.source);
      struck = true;
    }

    if (struck) {
      this.spinCooldown = owner.whirlwindInterval;
      this.spin = 1;
    }
  }

  update(dt: number, creeps: Creep[], owner: SwordsmanOwner, hospitals: HospitalRef[]): void {
    if (!this.alive) return;
    this.armor = owner.armor;

    if (this.state === 'fighting' || this.state === 'advancing') {
      this.whirlwind(dt, creeps, owner);
    } else if (this.spin > 0) {
      this.spin = Math.max(0, this.spin - dt / 0.35);
    }

    // Being treated: stay put until fit, then walk back to the post.
    if (this.state === 'healing') {
      const ward = this.hospital;
      if (ward) {
        this.hp = Math.min(this.maxHp, this.hp + ward.healRate * dt);
        if (this.healthFraction >= FIT_AGAIN) {
          this.hospital = null;
          this.state = 'returning';
        }
        return;
      }
      this.state = 'returning';
    }

    if (this.state === 'retreating') {
      const ward = this.hospital;
      if (!ward) {
        this.state = 'idle';
      } else if (dist(this.x, this.y, ward.x, ward.y) <= ward.radius) {
        this.state = 'healing';
        return;
      } else {
        this.moveTowards(ward.x, ward.y, owner.speed, dt);
        return;
      }
    }

    // Too badly hurt to stay in the line, and somewhere to go.
    if (this.healthFraction < owner.retreatAt && this.state !== 'returning') {
      const ward = this.nearestHospital(hospitals);
      if (ward) {
        this.hospital = ward;
        this.target = null;
        this.state = 'retreating';
        return;
      }
      // No hospital: he holds the line and takes his chances.
    }

    if (this.target && !this.target.alive) this.target = null;
    // An enemy that cannot be held walks on regardless. Break off once it has
    // drawn him past his post's reach instead of being led away from it.
    if (this.target && this.target.def.ignoresBlock) {
      const leash = owner.range * 1.25;
      if (dist2(owner.x, owner.y, this.target.x, this.target.y) > leash * leash) {
        this.target = null;
      }
    }
    if (!this.target || this.state !== 'fighting') {
      this.target = this.acquire(creeps, owner);
    }

    if (this.target) {
      // Never claim something unstoppable — other defenders should stay free
      // to deal with enemies they can actually pin down.
      if (!this.target.def.ignoresBlock) this.target.claimed = true;
      const reach = this.target.def.radius + REACH;
      const gap = dist(this.x, this.y, this.target.x, this.target.y);

      if (gap <= reach) {
        this.state = 'fighting';
        this.duel(dt, owner);
      } else {
        this.state = 'advancing';
        this.moveTowards(this.target.x, this.target.y, owner.speed, dt);
      }
      return;
    }

    if (dist2(this.x, this.y, this.homeX, this.homeY) > 4) {
      this.state = 'returning';
      this.moveTowards(this.homeX, this.homeY, owner.speed * 0.75, dt);
    } else {
      this.state = 'idle';
    }
  }

  /**
   * The nearest hospital that will actually have him — one whose reach covers
   * where he is standing. Out of everyone's reach he simply has nowhere to go.
   */
  private nearestHospital(hospitals: HospitalRef[]): HospitalRef | null {
    let best: HospitalRef | null = null;
    let bestDist = Infinity;
    for (const ward of hospitals) {
      const d = dist2(this.x, this.y, ward.x, ward.y);
      if (d > ward.range * ward.range) continue;
      if (d < bestDist) {
        bestDist = d;
        best = ward;
      }
    }
    return best;
  }

  /** Prefer the enemy furthest along, and one nobody else is already holding. */
  private acquire(creeps: Creep[], owner: SwordsmanOwner): Creep | null {
    const rangeSq = owner.range * owner.range;
    let best: Creep | null = null;
    let bestFree = false;

    for (const creep of creeps) {
      if (!creep.alive) continue;
      if (dist2(owner.x, owner.y, creep.x, creep.y) > rangeSq) continue;

      const free = !creep.claimed;
      if (!best || (free && !bestFree) || (free === bestFree && creep.distance > best.distance)) {
        best = creep;
        bestFree = free;
      }
    }
    return best;
  }

  /** Trading blows: he holds the enemy in place, and both take damage. */
  private duel(dt: number, owner: SwordsmanOwner): void {
    const creep = this.target;
    if (!creep) return;

    // He holds the enemy in place; it strikes back on its own attack rhythm —
    // unless it simply doesn't stop for a hold at all.
    if (!creep.def.ignoresBlock) creep.blocked = true;
    creep.engagedBy = this;
    this.angle = Math.atan2(creep.y - this.y, creep.x - this.x);

    creep.takeDamage(owner.dps * dt, owner.damageType, owner.source);
  }

  private moveTowards(tx: number, ty: number, speed: number, dt: number): void {
    const dx = tx - this.x;
    const dy = ty - this.y;
    const gap = Math.hypot(dx, dy);
    if (gap < 0.001) return;

    const travel = Math.min(speed * dt, gap);
    this.x += (dx / gap) * travel;
    this.y += (dy / gap) * travel;
    this.angle = Math.atan2(dy, dx);
    this.gait += travel;
  }
}
