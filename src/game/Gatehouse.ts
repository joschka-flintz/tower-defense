import {
  statsFor,
  upgradeBlocker,
  type TowerDef,
  type TowerStats,
  type TowerUpgrade,
} from '../data/towers';
import type { Tower } from './Tower';

/** Gold to repair a gate from nothing back to full. Scales with damage taken. */
const FULL_REPAIR_COST = 160;

/** How far in front of the gate an enemy stops to hack at it. */
const STANDOFF = 24;

/** An empty emplacement on a gatehouse, clickable so it can be filled. */
export interface GateSlotRef {
  readonly kind: 'slot';
  gate: Gatehouse;
  index: number;
  x: number;
  y: number;
  def: TowerDef;
}

/**
 * A stone gatehouse straddling the road. Enemies cannot walk past while the
 * gate still stands, so they stop and break it down instead.
 *
 * Only the gate itself is destroyed. The masonry, and anything installed in the
 * two turrets on top of it, are untouched — which is why the emplacements keep
 * firing long after the gate has been smashed in.
 */
export class Gatehouse {
  readonly kind = 'gate' as const;
  readonly def: TowerDef;
  readonly x: number;
  readonly y: number;
  /** Facing along the road, so the structure sits square across it. */
  readonly angle: number;
  /** Where along the route the gate sits. */
  readonly pathDistance: number;
  /**
   * Which route it stands on. A map can have several, each making for its own
   * gate, and a wall across one of them is no obstacle at all to the others.
   */
  readonly routeId: string;

  readonly purchased = new Set<string>();
  stats: TowerStats;
  hp: number;

  /** Gold spent on the gate itself, for what a sale refunds. Repairs do not count. */
  goldSpent = 0;

  /** The two emplacements on top, left and right of the road. */
  slots: Array<Tower | null> = [null, null];

  /** Half-width of the road it straddles; the turrets sit just beyond it. */
  private readonly roadHalfWidth: number;

  constructor(
    def: TowerDef,
    x: number,
    y: number,
    angle: number,
    pathDistance: number,
    roadHalfWidth: number,
    routeId = 'main',
  ) {
    this.def = def;
    this.x = x;
    this.y = y;
    this.angle = angle;
    this.pathDistance = pathDistance;
    this.roadHalfWidth = roadHalfWidth;
    this.routeId = routeId;
    this.stats = statsFor(def, this.purchased);
    this.hp = this.stats.gateHp;
  }

  get maxHp(): number {
    return this.stats.gateHp;
  }

  /** True once the gate has been broken open and the road is clear again. */
  get isOpen(): boolean {
    return this.hp <= 0;
  }

  /** Distance along the route at which enemies are stopped. */
  get blockDistance(): number {
    return this.pathDistance - STANDOFF;
  }

  /** How far out from the centre line each turret stands. */
  get turretReach(): number {
    return this.roadHalfWidth + this.def.radius * 1.28;
  }

  /** World position of emplacement `i`. */
  slotPosition(i: number): { x: number; y: number } {
    const offset = this.turretReach * (i === 0 ? -1 : 1);
    return {
      x: this.x - Math.sin(this.angle) * offset,
      y: this.y + Math.cos(this.angle) * offset,
    };
  }

  /** A clickable handle for slot `i`, whether or not anything is in it. */
  slotRef(i: number): GateSlotRef {
    const spot = this.slotPosition(i);
    return { kind: 'slot', gate: this, index: i, x: spot.x, y: spot.y, def: this.def };
  }

  /** Radius of the clickable turret at each end. */
  get turretRadius(): number {
    return this.def.radius * 0.62;
  }

  damageGate(amount: number): void {
    if (this.hp <= 0) return;
    this.hp = Math.max(0, this.hp - amount);
  }

  // ------------------------------------------------------------- upgrades

  blockerFor(upgrade: TowerUpgrade, techs: ReadonlySet<string>): string | null {
    return upgradeBlocker(upgrade, this.purchased, techs, this.def.upgrades);
  }

  /** Reinforcing the gate also adds the new capacity to what is standing now. */
  applyUpgrade(id: string): void {
    if (this.purchased.has(id)) return;
    const before = this.stats.gateHp;
    this.purchased.add(id);
    this.stats = statsFor(this.def, this.purchased);
    this.hp += Math.max(0, this.stats.gateHp - before);
  }

  // --------------------------------------------------------------- repair

  /** Gold needed to put the gate back to full, or 0 when it is undamaged. */
  get repairCost(): number {
    if (this.hp >= this.maxHp) return 0;
    return Math.max(1, Math.ceil((1 - this.hp / this.maxHp) * FULL_REPAIR_COST));
  }

  repair(): void {
    this.hp = this.maxHp;
  }

  /** Installed emplacements, for updating and drawing. */
  get installed(): Tower[] {
    return this.slots.filter((slot): slot is Tower => slot !== null);
  }
}
