import { dist2 } from '../core/vec';
import type { DamageType } from '../data/towers';
import type { Creep, DamageSource } from './Creep';
import { FireField } from './FireField';

/** Everything a shot carries with it, snapshotted when it is fired. */
export interface ProjectileSpec {
  shape: 'arrow' | 'boulder' | 'flail';
  radius: number;
  damage: number;
  speed: number;
  damageType: DamageType;
  /** 0 means the shot only hurts the creep it strikes. */
  splashRadius: number;
  /**
   * A lobbed shot: it is aimed at a patch of ground when it leaves the engine
   * and lands there whatever the target does afterwards. A tracking shot
   * instead follows its victim until it connects.
   */
  ballistic: boolean;
  burnDps: number;
  burnDuration: number;
  burnRadius: number;
  /** Fire left burning on whatever it strikes. */
  igniteDps: number;
  igniteDuration: number;
}

/**
 * A shot in flight. A shot that was rolled as a miss still flies, but lands
 * beside its target and does nothing, so a whiff is visible rather than silent.
 */
export class Projectile {
  readonly spec: ProjectileSpec;
  /** The tower that fired it, so hits are credited back to it. */
  private readonly source: DamageSource | null;
  private readonly target: Creep;
  private readonly willHit: boolean;

  /** Where a missed shot is headed. Unused when the shot connects. */
  private readonly missX: number;
  private readonly missY: number;

  x: number;
  y: number;
  angle: number;
  alive = true;

  /** Where a lobbed shot was aimed, fixed at the moment it was loosed. */
  private readonly aimX: number;
  private readonly aimY: number;

  constructor(
    spec: ProjectileSpec,
    x: number,
    y: number,
    target: Creep,
    willHit: boolean,
    source: DamageSource | null = null,
  ) {
    this.spec = spec;
    this.source = source;
    this.target = target;
    this.willHit = willHit;
    this.x = x;
    this.y = y;
    this.angle = Math.atan2(target.y - y, target.x - x);

    // A lobbed stone commits to a patch of ground the instant it is thrown.
    this.aimX = target.x;
    this.aimY = target.y;

    // Scatter a miss to one side, a little ahead or behind.
    const spread = target.def.radius + 12;
    const away = Math.random() < 0.5 ? -1 : 1;
    this.missX = target.x + Math.cos(target.angle + Math.PI / 2) * spread * away;
    this.missY = target.y + Math.sin(target.angle + Math.PI / 2) * spread * away;
  }

  update(dt: number, creeps: Creep[], fires: FireField[]): void {
    // A lobbed shot never chases: it flies to the spot it was aimed at and
    // damages whatever happens to be standing there when it lands.
    if (this.spec.ballistic) {
      this.flyTo(this.aimX, this.aimY, dt, creeps, fires, false);
      return;
    }

    const chasing = this.willHit && this.target.alive;
    const tx = chasing ? this.target.x : this.missX;
    const ty = chasing ? this.target.y : this.missY;

    // A single-target shot whose victim died elsewhere simply vanishes.
    if (this.willHit && !this.target.alive && this.spec.splashRadius <= 0) {
      this.alive = false;
      return;
    }

    this.flyTo(tx, ty, dt, creeps, fires, chasing, this.target.def.radius);
  }

  /** Advance towards a point, and resolve the hit once close enough. */
  private flyTo(
    tx: number,
    ty: number,
    dt: number,
    creeps: Creep[],
    fires: FireField[],
    chasing: boolean,
    contactRadius = 2,
  ): void {
    const dx = tx - this.x;
    const dy = ty - this.y;
    const remaining = Math.hypot(dx, dy);
    const travel = this.spec.speed * dt;
    this.angle = Math.atan2(dy, dx);

    const contact = chasing ? contactRadius : 2;
    if (remaining <= travel + contact) {
      this.x = tx;
      this.y = ty;
      this.impact(creeps, fires, chasing);
      this.alive = false;
      return;
    }

    this.x += (dx / remaining) * travel;
    this.y += (dy / remaining) * travel;
  }

  private impact(creeps: Creep[], fires: FireField[], struckTarget: boolean): void {
    const { splashRadius, damage, damageType, burnDuration, burnDps, burnRadius } = this.spec;
    const { igniteDps, igniteDuration } = this.spec;

    if (splashRadius > 0) {
      // Area weapons hurt everything nearby whether or not the intended victim
      // is still standing, so they never truly miss.
      const radiusSq = splashRadius * splashRadius;
      for (const creep of creeps) {
        if (!creep.alive) continue;
        if (dist2(this.x, this.y, creep.x, creep.y) > radiusSq) continue;
        creep.takeDamage(damage, damageType, this.source);
        creep.ignite(igniteDps, igniteDuration, this.source);
      }
    } else if (struckTarget) {
      this.target.takeDamage(damage, damageType, this.source);
      this.target.ignite(igniteDps, igniteDuration, this.source);
    }

    if (burnDuration > 0 && burnRadius > 0) {
      fires.push(new FireField(this.x, this.y, burnRadius, burnDps, burnDuration, this.source));
    }
  }
}
