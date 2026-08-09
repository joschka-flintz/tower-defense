import { damageMultiplier, type ArmorType } from '../data/armor';
import type { DamageType } from '../data/towers';
import { dist, dist2 } from '../core/vec';
import type { Creep, DamageSource, MeleeDefender } from './Creep';

export type DogState = 'idle' | 'chasing' | 'fighting' | 'returning';

/** What a dog wears into a fight — nothing at all, however it's upgraded. */
export const DOG_ARMOR: ArmorType = 'unarmored';

/** What the dog needs to know about the handler who sent it. */
export interface DogOwner {
  x: number;
  y: number;
  range: number;
  dps: number;
  speed: number;
  /** The tower the pack belongs to, so its bites count towards that tower. */
  source: DamageSource | null;
}

/** How close the dog must get before it can bite. */
const REACH = 7;

/**
 * A war dog. It runs from its handler onto the road, latches onto an enemy and
 * holds it in place while biting.
 *
 * The dog has real health and the enemy bites back, so it dies when it runs out
 * of health rather than wearing out after a fixed amount of work.
 */
export class Dog implements MeleeDefender {
  x: number;
  y: number;
  angle = 0;
  state: DogState = 'idle';
  target: Creep | null = null;

  hp: number;
  maxHp: number;
  alive = true;

  /** What it wears, which decides how much each blow actually hurts it. */
  readonly armor: ArmorType = DOG_ARMOR;

  /** Advances while the dog moves, so the renderer can animate its legs. */
  gait = 0;

  readonly homeX: number;
  readonly homeY: number;

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

  takeHit(damage: number, type: DamageType): void {
    if (!this.alive) return;
    this.hp -= damage * damageMultiplier(type, this.armor);
    if (this.hp <= 0) {
      this.hp = 0;
      this.alive = false;
      this.target = null;
    }
  }

  /** Called when an upgrade makes the pack hardier. */
  grantExtraHealth(extra: number): void {
    if (extra <= 0) return;
    this.maxHp += extra;
    this.hp += extra;
  }

  update(dt: number, creeps: Creep[], owner: DogOwner): void {
    if (!this.alive) return;

    if (this.target && !this.target.alive) this.target = null;
    // An enemy that cannot be held will simply walk on with the dog trailing
    // behind it. Let go once it has pulled the dog past its handler's reach,
    // rather than being towed across the whole map.
    if (this.target && this.target.def.ignoresBlock && !this.withinLeash(this.target, owner)) {
      this.target = null;
    }

    // Until it actually has hold of something the dog keeps re-evaluating. That
    // is what lets a second dog peel off onto a different enemy instead of both
    // piling onto whichever one happened to be closest when they set off.
    if (!this.target || this.state !== 'fighting') {
      this.target = this.acquire(creeps, owner);
    }

    if (this.target) {
      // Claim it so a second dog picks a different enemy, even mid-chase —
      // but never claim something unstoppable, or the rest of the pack would
      // ignore enemies they could actually stop.
      if (!this.target.def.ignoresBlock) this.target.claimed = true;

      const reach = this.target.def.radius + REACH;
      const gap = dist(this.x, this.y, this.target.x, this.target.y);

      if (gap <= reach) {
        this.state = 'fighting';
        this.bite(dt, owner);
      } else {
        this.state = 'chasing';
        this.moveTowards(this.target.x, this.target.y, owner.speed, dt);
      }
      return;
    }

    // Nothing to fight: trot back to the handler.
    if (dist2(this.x, this.y, this.homeX, this.homeY) > 4) {
      this.state = 'returning';
      this.moveTowards(this.homeX, this.homeY, owner.speed * 0.7, dt);
    } else {
      this.state = 'idle';
    }
  }

  /** Still close enough to the handler for the dog to keep working on it. */
  private withinLeash(creep: Creep, owner: DogOwner): boolean {
    const leash = owner.range * 1.25;
    return dist2(owner.x, owner.y, creep.x, creep.y) <= leash * leash;
  }

  /**
   * Prefer the enemy furthest along the road, and prefer one that another dog
   * is not already holding, so a pack spreads out instead of piling on.
   */
  private acquire(creeps: Creep[], owner: DogOwner): Creep | null {
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

  private bite(dt: number, owner: DogOwner): void {
    const creep = this.target;
    if (!creep) return;

    // Held in place, and now able to bite back on its own rhythm — unless it
    // simply doesn't stop for a hold at all.
    if (!creep.def.ignoresBlock) creep.blocked = true;
    creep.engagedBy = this;
    this.angle = Math.atan2(creep.y - this.y, creep.x - this.x);

    // Teeth count as slashing damage.
    creep.takeDamage(owner.dps * dt, 'slash', owner.source);
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
