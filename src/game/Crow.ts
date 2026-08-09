import type { Tower } from './Tower';

/** How much of a field's harvest one crow spoils if it gets to feed. */
const SPOIL_PER_CROW = 1.2;

/** Seconds a crow spends feeding on a field before moving on. */
const FEEDING_TIME = 2.2;

/**
 * A crow. Not really an enemy: it ignores the road, ignores your towers and
 * cannot be fought. It simply flies across the field, and if it finds an
 * unprotected farm it settles for a moment and eats into the harvest.
 *
 * A scarecrow does not kill crows — it just keeps them off that field.
 */
export class Crow {
  x: number;
  y: number;
  /** Where it is heading once it has finished, off the far edge. */
  private readonly exitX: number;
  private readonly exitY: number;

  private readonly speed: number;
  private feeding = 0;
  private fed = false;
  target: Tower | null;
  alive = true;

  /** Advances constantly; drives the wingbeat. */
  flap = Math.random() * 10;

  constructor(x: number, y: number, exitX: number, exitY: number, target: Tower | null) {
    this.x = x;
    this.y = y;
    this.exitX = exitX;
    this.exitY = exitY;
    this.target = target;
    this.speed = 78 + Math.random() * 26;
  }

  get isFeeding(): boolean {
    return this.feeding > 0;
  }

  update(dt: number): void {
    if (!this.alive) return;
    this.flap += dt * 9;

    if (this.feeding > 0) {
      this.feeding -= dt;
      if (this.feeding <= 0) this.target = null;
      return;
    }

    // Head for the field if there is one worth robbing, otherwise fly on.
    const goal = this.target && !this.fed ? this.target : null;
    const tx = goal ? goal.x : this.exitX;
    const ty = goal ? goal.y : this.exitY;

    const dx = tx - this.x;
    const dy = ty - this.y;
    const gap = Math.hypot(dx, dy);

    if (gap < 4) {
      if (goal) {
        goal.spoilHarvest(SPOIL_PER_CROW);
        this.fed = true;
        this.feeding = FEEDING_TIME;
        return;
      }
      this.alive = false;
      return;
    }

    const travel = Math.min(this.speed * dt, gap);
    this.x += (dx / gap) * travel;
    this.y += (dy / gap) * travel;
  }

  /** Direction of travel, for drawing. */
  get angle(): number {
    const goal = this.target && !this.fed ? this.target : null;
    return Math.atan2(
      (goal ? goal.y : this.exitY) - this.y,
      (goal ? goal.x : this.exitX) - this.x,
    );
  }
}
