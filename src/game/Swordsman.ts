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
  /**
   * The gentler threshold: health below this is worth walking off during a
   * lull, but not worth abandoning a fight for.
   */
  restAt: number;
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
 * How long his post must have nothing in reach before he counts it a lull and
 * walks off to the surgeons.
 *
 * Without this he dithers. A wave arrives as a trickle, not a block, so "no
 * target right now" flickers on and off every second or so; measured, he
 * alternated between `fighting` and `retreating` twice a second and never got
 * more than a few paces from his post. Requiring the quiet to hold means he
 * only leaves in a gap actually long enough to be worth something.
 */
const LULL = 2.5;

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

  /**
   * True when this trip to the hospital is a lull-time visit rather than a
   * retreat. He gives it up the moment anything comes into his post's reach.
   */
  private resting = false;

  /**
   * Whether he has been in the fight at all this wave. Nobody walks off to the
   * surgeons before a blow has been struck — a post that starts a wave under
   * strength should stand in the line, not queue at the ward.
   */
  private hasFought = false;

  /** Seconds his post has had nothing in reach. See `LULL`. */
  private quiet = 0;

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
    this.hasFought = false;
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

    // A lull-time visit to the ward is given up the instant the post has
    // something to do again. A retreat is not: he is too hurt to be useful.
    if (this.resting && (this.state === 'healing' || this.state === 'retreating')) {
      if (this.healthFraction < owner.retreatAt) {
        this.resting = false;
      } else if (this.acquire(creeps, owner)) {
        this.resting = false;
        this.quiet = 0;
        this.hospital = null;
        this.state = 'returning';
      }
    }

    // Being treated: stay put until fit, then walk back to the post.
    if (this.state === 'healing') {
      const ward = this.hospital;
      if (ward) {
        this.hp = Math.min(this.maxHp, this.hp + ward.healRate * dt);
        if (this.healthFraction >= FIT_AGAIN) {
          this.hospital = null;
          this.resting = false;
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
        this.resting = false;
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

    this.quiet = this.target ? 0 : this.quiet + dt;

    if (this.target) {
      // Never claim something unstoppable — other defenders should stay free
      // to deal with enemies they can actually pin down.
      if (!this.target.def.ignoresBlock) this.target.claimed = true;
      const reach = this.target.def.radius + REACH;
      const gap = dist(this.x, this.y, this.target.x, this.target.y);

      if (gap <= reach) {
        this.state = 'fighting';
        this.hasFought = true;
        this.duel(dt, owner);
      } else {
        this.state = 'advancing';
        this.moveTowards(this.target.x, this.target.y, owner.speed, dt);
      }
      return;
    }

    // Nothing to fight. If he has been in it and is carrying wounds, the lull
    // is worth spending on the surgeons rather than standing at his post — he
    // rides straight back the moment anything comes into the post's reach.
    if (this.hasFought && this.quiet >= LULL && this.healthFraction < owner.restAt) {
      const ward = this.nearestHospital(hospitals);
      if (ward) {
        this.hospital = ward;
        this.resting = true;
        this.state = 'retreating';
        return;
      }
    }

    if (dist2(this.x, this.y, this.homeX, this.homeY) > 4) {
      this.state = 'returning';
      this.moveTowards(this.homeX, this.homeY, owner.speed * 0.75, dt);
    } else {
      this.state = 'idle';
    }
  }

  /**
   * The nearest hospital that will actually have him.
   *
   * A hospital's reach covers **posts**, not wandering men: it takes him if
   * either he or the post he was raised from stands inside it. Measuring only
   * from where he happens to be standing looks equivalent and is not — a
   * mounted knight rides 230 out from his post, further than a hospital's own
   * 210 reach, so he was hurt out of range of the ward that covers his own
   * stable and fought on at a sliver of health while every other post, none of
   * which strays more than 175, fell back and was patched up. The lancer at
   * 215 had the same problem.
   *
   * Out of reach of every hospital by both measures he has nowhere to go and
   * holds where he stands, which is still the point of placing them well.
   */
  private nearestHospital(hospitals: HospitalRef[]): HospitalRef | null {
    let best: HospitalRef | null = null;
    let bestDist = Infinity;
    for (const ward of hospitals) {
      const reachSq = ward.range * ward.range;
      const d = dist2(this.x, this.y, ward.x, ward.y);
      if (d > reachSq && dist2(this.homeX, this.homeY, ward.x, ward.y) > reachSq) continue;
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
