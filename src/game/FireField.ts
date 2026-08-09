import { dist2 } from '../core/vec';
import type { Creep, DamageSource } from './Creep';

/** Burning ground left by a fire stone. Scorches anything standing in it. */
export class FireField {
  readonly x: number;
  readonly y: number;
  readonly radius: number;
  readonly dps: number;
  readonly duration: number;
  remaining: number;
  /** The engine whose stone started it, so the burn counts towards its total. */
  private readonly source: DamageSource | null;

  constructor(
    x: number,
    y: number,
    radius: number,
    dps: number,
    duration: number,
    source: DamageSource | null = null,
  ) {
    this.source = source;
    this.x = x;
    this.y = y;
    this.radius = radius;
    this.dps = dps;
    this.duration = duration;
    this.remaining = duration;
  }

  get alive(): boolean {
    return this.remaining > 0;
  }

  /** How far through its life it is, 0 when fresh and 1 when burnt out. */
  get age(): number {
    return 1 - this.remaining / this.duration;
  }

  update(dt: number, creeps: Creep[]): void {
    this.remaining -= dt;
    const radiusSq = this.radius * this.radius;

    for (const creep of creeps) {
      if (!creep.alive) continue;
      if (dist2(this.x, this.y, creep.x, creep.y) > radiusSq) continue;
      creep.takeDamage(this.dps * dt, 'fire', this.source);
    }
  }
}
