import { mix, mulberry32, TAU } from '../core/rng';
import type { TowerDef } from '../data/towers';

/** Static sprites are drawn at this multiple of world size, then scaled down. */
const SPRITE_SCALE = 4;

/**
 * Direction the sun comes from, as a unit vector pointing towards the light.
 * Everything in the game is lit from the upper left so the shading agrees.
 */
const LIGHT_X = -0.6;
const LIGHT_Y = -0.8;

export interface Sprite {
  canvas: HTMLCanvasElement;
  /** Edge length in world units. */
  size: number;
}

function createSprite(size: number): { sprite: Sprite; ctx: CanvasRenderingContext2D } {
  const canvas = document.createElement('canvas');
  canvas.width = Math.ceil(size * SPRITE_SCALE);
  canvas.height = Math.ceil(size * SPRITE_SCALE);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Could not create a sprite canvas');
  ctx.scale(SPRITE_SCALE, SPRITE_SCALE);
  ctx.translate(size / 2, size / 2);
  return { sprite: { canvas, size }, ctx };
}

export function drawSprite(ctx: CanvasRenderingContext2D, sprite: Sprite, x: number, y: number): void {
  const half = sprite.size / 2;
  ctx.drawImage(sprite.canvas, x - half, y - half, sprite.size, sprite.size);
}

/** How strongly a surface facing `angle` catches the light, 0..1. */
export function lightAt(angle: number): number {
  return Math.max(0, Math.cos(angle) * LIGHT_X + Math.sin(angle) * LIGHT_Y);
}

function groundShadow(ctx: CanvasRenderingContext2D, radius: number): void {
  const ox = radius * 0.14;
  const oy = radius * 0.2;
  const grad = ctx.createRadialGradient(ox, oy, radius * 0.5, ox, oy, radius * 1.35);
  grad.addColorStop(0, 'rgba(0, 0, 0, 0.5)');
  grad.addColorStop(0.6, 'rgba(0, 0, 0, 0.26)');
  grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(ox, oy, radius * 1.35, 0, TAU);
  ctx.fill();
}

// --------------------------------------------------------------- archer tower

/**
 * The patch of ground a bowman or crossbowman stands on. With `elevated` they
 * stand on a timber scaffold instead, which reads as a height advantage.
 */
export function makeGroundStandSprite(def: TowerDef, elevated: boolean): Sprite {
  const r = def.radius;
  const { sprite, ctx } = createSprite(r * 3.2);
  const rand = mulberry32(elevated ? 0x51a17 : 0x9204d);

  if (elevated) {
    // Legs of the scaffold, splayed out and catching the light.
    ctx.fillStyle = 'rgba(0, 0, 0, 0.42)';
    ctx.beginPath();
    ctx.ellipse(r * 0.22, r * 0.3, r * 1.28, r * 1.2, 0, 0, TAU);
    ctx.fill();

    for (let i = 0; i < 4; i++) {
      const a = Math.PI / 4 + (i / 4) * TAU;
      ctx.strokeStyle = mix('#3b2a17', '#8a6837', lightAt(a) * 0.9);
      ctx.lineWidth = r * 0.17;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(Math.cos(a) * r * 0.45, Math.sin(a) * r * 0.45);
      ctx.lineTo(Math.cos(a) * r * 1.16, Math.sin(a) * r * 1.16);
      ctx.stroke();
    }

    // The deck itself, raised and casting its own shadow.
    const deck = r * 0.92;
    ctx.save();
    ctx.beginPath();
    ctx.roundRect(-deck, -deck, deck * 2, deck * 2, r * 0.12);
    ctx.clip();

    const planks = ctx.createLinearGradient(-deck, -deck, deck, deck);
    planks.addColorStop(0, '#8a6a3e');
    planks.addColorStop(1, '#4a3620');
    ctx.fillStyle = planks;
    ctx.fillRect(-deck, -deck, deck * 2, deck * 2);

    ctx.strokeStyle = 'rgba(26, 18, 10, 0.55)';
    ctx.lineWidth = r * 0.05;
    for (let py = -deck; py <= deck; py += deck * 0.4) {
      ctx.beginPath();
      ctx.moveTo(-deck, py);
      ctx.lineTo(deck, py);
      ctx.stroke();
    }
    for (let i = 0; i < 26; i++) {
      ctx.strokeStyle = rand() < 0.5 ? 'rgba(26, 18, 10, 0.28)' : 'rgba(206, 180, 138, 0.16)';
      ctx.lineWidth = r * 0.02;
      const gy = -deck + rand() * deck * 2;
      const gx = -deck + rand() * deck * 2;
      ctx.beginPath();
      ctx.moveTo(gx, gy);
      ctx.lineTo(gx + r * (0.12 + rand() * 0.35), gy);
      ctx.stroke();
    }
    ctx.restore();

    ctx.strokeStyle = 'rgba(20, 14, 8, 0.8)';
    ctx.lineWidth = r * 0.08;
    ctx.beginPath();
    ctx.roundRect(-deck, -deck, deck * 2, deck * 2, r * 0.12);
    ctx.stroke();

    // A rail on two sides so it reads as something you climb onto.
    ctx.strokeStyle = '#6b4f2c';
    ctx.lineWidth = r * 0.09;
    ctx.beginPath();
    ctx.moveTo(-deck * 0.86, -deck * 0.86);
    ctx.lineTo(deck * 0.86, -deck * 0.86);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(-deck * 0.86, deck * 0.86);
    ctx.lineTo(deck * 0.86, deck * 0.86);
    ctx.stroke();

    return sprite;
  }

  // Ground level: no plinth or dirt patch — just the fighter, standing
  // straight on the grass.
  return sprite;
}

/**
 * The bowman on top, drawn from above and rotated to face his target.
 * Coordinates assume a tower radius of 20 and are scaled to fit.
 * `released` counts down from 1 immediately after loosing an arrow.
 */
export function drawArcherFigure(ctx: CanvasRenderingContext2D, radius: number, released: number): void {
  ctx.save();
  // Deliberately larger than life relative to the tower: at this scale a
  // realistically sized man would be an unreadable smudge.
  ctx.scale(radius / 16.5, radius / 16.5);
  // The body (torso + head) is drawn trailing slightly behind the bow and
  // arrow; nudge everything so the body itself — not the whole bow-and-arrow
  // reach — sits centred on the tower's actual position (and its clickbox).
  ctx.translate(1.2, 0);
  ctx.lineCap = 'round';

  // Shadow on the planks.
  ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
  ctx.beginPath();
  ctx.ellipse(0.9, 1.9, 7, 5.2, 0, 0, TAU);
  ctx.fill();

  // Quiver slung across his back.
  ctx.save();
  ctx.rotate(-0.5);
  ctx.fillStyle = '#3b2a17';
  ctx.beginPath();
  ctx.roundRect(-9, -1.7, 6.2, 3.4, 1.6);
  ctx.fill();
  ctx.strokeStyle = '#efe7d2';
  ctx.lineWidth = 0.5;
  for (let i = -1; i <= 1; i++) {
    ctx.beginPath();
    ctx.moveTo(-8.6, i * 0.9);
    ctx.lineTo(-10.9, i * 1.7);
    ctx.stroke();
  }
  ctx.restore();

  // Torso under a wool cloak.
  const cloak = ctx.createLinearGradient(-4, -4.5, 2.5, 4.5);
  cloak.addColorStop(0, '#514f37');
  cloak.addColorStop(1, '#1d1c11');
  ctx.fillStyle = cloak;
  ctx.strokeStyle = 'rgba(8, 7, 4, 0.75)';
  ctx.lineWidth = 0.55;
  ctx.beginPath();
  ctx.ellipse(-1.5, 0, 5.1, 4.3, 0, 0, TAU);
  ctx.fill();
  ctx.stroke();

  // Arms reaching out to the bow.
  ctx.fillStyle = '#3c3a26';
  for (const side of [-1, 1]) {
    ctx.beginPath();
    ctx.ellipse(1.7, side * 3.2, 2.9, 1.6, side * 0.25, 0, TAU);
    ctx.fill();
    ctx.stroke();
  }

  // Head, with a hood covering the back of it.
  ctx.fillStyle = '#cb9c6e';
  ctx.beginPath();
  ctx.arc(1.3, 0, 2.9, 0, TAU);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = '#2b2617';
  ctx.beginPath();
  ctx.arc(1.3, 0, 2.9, Math.PI * 0.4, Math.PI * 1.6);
  ctx.fill();

  // Longbow: dark stave with a lit outer edge.
  ctx.strokeStyle = '#3d2a12';
  ctx.lineWidth = 1.9;
  ctx.beginPath();
  ctx.arc(3.2, 0, 7.6, -1.35, 1.35);
  ctx.stroke();
  ctx.strokeStyle = '#a9814a';
  ctx.lineWidth = 0.6;
  ctx.beginPath();
  ctx.arc(3.2, 0, 8.05, -1.28, 1.28);
  ctx.stroke();

  const tipX = 3.2 + Math.cos(1.35) * 7.6;
  const tipY = Math.sin(1.35) * 7.6;

  // Bowstring: drawn back while aiming, snapped straight just after loosing.
  const draw = 1 - released;
  ctx.strokeStyle = '#f4f0e4';
  ctx.lineWidth = 0.55;
  ctx.beginPath();
  ctx.moveTo(tipX, -tipY);
  ctx.lineTo(tipX - 4.8 * draw, 0);
  ctx.lineTo(tipX, tipY);
  ctx.stroke();

  // Nocked arrow, hidden for a moment after the shot.
  if (released < 0.35) {
    ctx.strokeStyle = '#6b5230';
    ctx.lineWidth = 0.95;
    ctx.beginPath();
    ctx.moveTo(tipX - 4.8, 0);
    ctx.lineTo(10.2, 0);
    ctx.stroke();
    ctx.fillStyle = '#e3e7ec';
    ctx.beginPath();
    ctx.moveTo(11.4, 0);
    ctx.lineTo(9.6, -1);
    ctx.lineTo(9.6, 1);
    ctx.closePath();
    ctx.fill();
  }

  ctx.restore();
}

/**
 * A crossbowman. Same build as the archer but hunched over a stock: the prod
 * sits across the front and the weapon is held level rather than drawn.
 * `reloading` runs 1 to 0 after a shot, while he cranks the next bolt.
 */
export function drawCrossbowFigure(
  ctx: CanvasRenderingContext2D,
  radius: number,
  reloading: number,
): void {
  ctx.save();
  ctx.scale(radius / 13.5, radius / 13.5);
  // Same recentring as the archer: the body sits behind the weapon, so nudge
  // it forward to sit on the tower's actual position and its clickbox.
  ctx.translate(1.25, 0);
  ctx.lineCap = 'round';

  ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
  ctx.beginPath();
  ctx.ellipse(0.9, 1.8, 6.6, 5, 0, 0, TAU);
  ctx.fill();

  // Quiver of bolts on the hip.
  ctx.save();
  ctx.rotate(-0.6);
  ctx.fillStyle = '#3b2a17';
  ctx.beginPath();
  ctx.roundRect(-8.2, -1.5, 5.2, 3, 1.4);
  ctx.fill();
  ctx.restore();

  // Padded jack.
  const jack = ctx.createLinearGradient(-4, -4.5, 2.5, 4.5);
  jack.addColorStop(0, '#5d5340');
  jack.addColorStop(1, '#211c12');
  ctx.fillStyle = jack;
  ctx.strokeStyle = 'rgba(8, 7, 4, 0.75)';
  ctx.lineWidth = 0.55;
  ctx.beginPath();
  ctx.ellipse(-1.6, 0, 5, 4.2, 0, 0, TAU);
  ctx.fill();
  ctx.stroke();

  // Both arms forward on the stock.
  ctx.fillStyle = '#413a28';
  for (const side of [-1, 1]) {
    ctx.beginPath();
    ctx.ellipse(1.8, side * 2.6, 2.8, 1.5, side * 0.18, 0, TAU);
    ctx.fill();
    ctx.stroke();
  }

  // Head under a kettle helm.
  ctx.fillStyle = '#cb9c6e';
  ctx.beginPath();
  ctx.arc(1.2, 0, 2.8, 0, TAU);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = '#54585e';
  ctx.beginPath();
  ctx.arc(1.2, 0, 2.9, Math.PI * 0.36, Math.PI * 1.64);
  ctx.fill();

  // Stock, tilted down while cranking.
  ctx.save();
  ctx.rotate(reloading * 0.35);

  ctx.fillStyle = '#6b4f2c';
  ctx.strokeStyle = 'rgba(16, 11, 6, 0.8)';
  ctx.lineWidth = 0.5;
  ctx.beginPath();
  ctx.roundRect(0.5, -1.1, 9.6, 2.2, 0.8);
  ctx.fill();
  ctx.stroke();

  // The prod across the front, with its string.
  ctx.strokeStyle = '#3f3f45';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(7.6, 0, 5.6, -1.15, 1.15);
  ctx.stroke();
  ctx.strokeStyle = '#e6e0d0';
  ctx.lineWidth = 0.45;
  const tipX = 7.6 + Math.cos(1.15) * 5.6;
  const tipY = Math.sin(1.15) * 5.6;
  const pull = reloading > 0.4 ? 2.6 : 0;
  ctx.beginPath();
  ctx.moveTo(tipX, -tipY);
  ctx.lineTo(tipX - pull, 0);
  ctx.lineTo(tipX, tipY);
  ctx.stroke();

  // Loaded bolt, gone for a moment after the shot.
  if (reloading < 0.4) {
    ctx.strokeStyle = '#5a4326';
    ctx.lineWidth = 0.9;
    ctx.beginPath();
    ctx.moveTo(3.4, 0);
    ctx.lineTo(11.4, 0);
    ctx.stroke();
    ctx.fillStyle = '#dfe3e8';
    ctx.beginPath();
    ctx.moveTo(12.6, 0);
    ctx.lineTo(11, -1);
    ctx.lineTo(11, 1);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();

  ctx.restore();
}

/**
 * A swordsman seen from above, pointing along +x. `gait` drives his stride and
 * `fighting` makes him lunge with the blade rather than hold it at guard.
 */
export function drawSwordsman(
  ctx: CanvasRenderingContext2D,
  gait: number,
  fighting: boolean,
  resting: boolean,
): void {
  const swing = Math.sin(gait * 0.4);

  ctx.save();
  // A man should read noticeably larger than a dog beside him.
  ctx.scale(1.4, 1.4);
  ctx.lineCap = 'round';

  ctx.fillStyle = 'rgba(0, 0, 0, 0.45)';
  ctx.beginPath();
  ctx.ellipse(0.6, 1.8, 6, 4.8, 0, 0, TAU);
  ctx.fill();

  // Legs.
  ctx.strokeStyle = '#3c3626';
  ctx.lineWidth = 1.7;
  for (const side of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(-1, side * 1.8);
    ctx.lineTo(-1 + swing * side * 2.2, side * 3.9);
    ctx.stroke();
  }

  // Surcoat over mail.
  const coat = ctx.createLinearGradient(-4, -4, 2, 4);
  coat.addColorStop(0, '#8b8f97');
  coat.addColorStop(1, '#3b3f46');
  ctx.fillStyle = coat;
  ctx.strokeStyle = 'rgba(10, 11, 13, 0.8)';
  ctx.lineWidth = 0.55;
  ctx.beginPath();
  ctx.ellipse(-1.2, 0, 4.6, 3.9, 0, 0, TAU);
  ctx.fill();
  ctx.stroke();

  // Shield on the off arm.
  ctx.fillStyle = '#7d3b30';
  ctx.strokeStyle = 'rgba(18, 10, 7, 0.85)';
  ctx.lineWidth = 0.6;
  ctx.beginPath();
  ctx.ellipse(1.2, -3.6, 3.1, 2.2, -0.4, 0, TAU);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = 'rgba(232, 220, 190, 0.75)';
  ctx.beginPath();
  ctx.arc(1.2, -3.6, 0.8, 0, TAU);
  ctx.fill();

  // Helm.
  ctx.fillStyle = '#9aa0a8';
  ctx.beginPath();
  ctx.arc(1.1, 0, 2.6, 0, TAU);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = '#4a4f57';
  ctx.beginPath();
  ctx.arc(1.1, 0, 2.6, Math.PI * 0.4, Math.PI * 1.6);
  ctx.fill();

  // Sword arm: held at guard when idle, cut side to side when fighting
  // rather than poking straight ahead.
  const swingArc = fighting ? Math.sin(performance.now() * 0.009) * 0.75 : 0;
  const reach = resting ? 5.4 : 9.2;
  ctx.save();
  ctx.rotate(resting ? -0.9 : swingArc);
  ctx.strokeStyle = '#4a3520';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(2.4, 2.8);
  ctx.lineTo(4.4, 2.4);
  ctx.stroke();

  // Crossguard and blade.
  ctx.strokeStyle = '#6b5a3a';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(4.6, 1.1);
  ctx.lineTo(4.6, 3.7);
  ctx.stroke();

  const blade = ctx.createLinearGradient(4.6, 0, reach, 0);
  blade.addColorStop(0, '#cfd4da');
  blade.addColorStop(1, '#8d949c');
  ctx.strokeStyle = blade;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(4.6, 2.4);
  ctx.lineTo(reach, 2.4);
  ctx.stroke();
  ctx.restore();

  ctx.restore();
}

/*
 * ---------------------------------------------------------------------------
 * The Kingdom's other melee posts.
 *
 * These three are the enemy pikeman, warhammer knight and mounted knight of
 * `creeps.ts` redrawn as defenders: the same build and the same weapon, in the
 * Kingdom's livery — deep red over steel — so a glance tells friend from foe
 * even when both are on the road at once. They take the defender signature
 * `(ctx, gait, fighting, resting)`: `resting` is a man standing at his post
 * with the weapon down, which no enemy ever does.
 * ---------------------------------------------------------------------------
 */

/** The Kingdom's colours: a red surcoat over grey steel. */
const LIVERY_LIGHT = '#b0554a';
const LIVERY_DARK = '#5c231c';

/**
 * A pikeman of the Kingdom: light armour, a long levelled pike, a red surcoat
 * over the gambeson. Compare `drawPikemanFigure` — the enemy of the same name.
 */
export function drawDefenderPikeman(
  ctx: CanvasRenderingContext2D,
  gait: number,
  fighting: boolean,
  resting: boolean,
): void {
  const swing = Math.sin(gait * 0.42);
  const jab = fighting ? Math.sin(performance.now() * 0.02) * 1.2 : 0;

  ctx.save();
  ctx.scale(1.4, 1.4);
  ctx.lineCap = 'round';

  ctx.fillStyle = 'rgba(0, 0, 0, 0.42)';
  ctx.beginPath();
  ctx.ellipse(0.6, 1.9, 5.6, 4.5, 0, 0, TAU);
  ctx.fill();

  // Legs.
  ctx.strokeStyle = '#382f22';
  ctx.lineWidth = 1.6;
  for (const side of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(-0.6, side * 1.7);
    ctx.lineTo(-0.6 + swing * side * 2, side * 3.8);
    ctx.stroke();
  }

  // Surcoat in the Kingdom's red over a padded gambeson.
  const coat = ctx.createLinearGradient(-4, -4, 3, 4);
  coat.addColorStop(0, LIVERY_LIGHT);
  coat.addColorStop(1, LIVERY_DARK);
  ctx.fillStyle = coat;
  ctx.strokeStyle = 'rgba(20, 10, 8, 0.8)';
  ctx.lineWidth = 0.55;
  ctx.beginPath();
  ctx.ellipse(-0.8, 0, 4.3, 3.8, 0, 0, TAU);
  ctx.fill();
  ctx.stroke();

  // Quilting showing under the surcoat's hem.
  ctx.strokeStyle = 'rgba(30, 14, 10, 0.4)';
  ctx.lineWidth = 0.4;
  for (const dx of [-2.4, -0.4, 1.6]) {
    ctx.beginPath();
    ctx.moveTo(dx, -3);
    ctx.lineTo(dx, 3);
    ctx.stroke();
  }

  // Kettle helm — light armour, nothing more.
  ctx.fillStyle = '#9aa0a8';
  ctx.beginPath();
  ctx.arc(1, 0, 2.5, 0, TAU);
  ctx.fill();
  ctx.strokeStyle = 'rgba(18, 18, 20, 0.8)';
  ctx.lineWidth = 0.5;
  ctx.stroke();
  ctx.fillStyle = 'rgba(20, 16, 10, 0.5)';
  ctx.beginPath();
  ctx.ellipse(1.8, 0, 1, 2.1, 0, 0, TAU);
  ctx.fill();

  // The pike: levelled and jabbing while he fights, butt-down and upright
  // while he is stood at his post.
  ctx.save();
  ctx.rotate(resting ? -1.1 : 0);
  const reach = 12 + jab;
  ctx.strokeStyle = '#5c4527';
  ctx.lineWidth = 1.1;
  ctx.beginPath();
  ctx.moveTo(-2.6, 1.6);
  ctx.lineTo(reach - 2, -0.6);
  ctx.stroke();

  const head = ctx.createLinearGradient(reach - 3, 0, reach, 0);
  head.addColorStop(0, '#8d949c');
  head.addColorStop(1, '#e7ebef');
  ctx.fillStyle = head;
  ctx.beginPath();
  ctx.moveTo(reach, -0.6);
  ctx.lineTo(reach - 2.6, -1.6);
  ctx.lineTo(reach - 2.6, 0.4);
  ctx.closePath();
  ctx.fill();
  ctx.restore();

  ctx.restore();
}

/**
 * A warhammer knight of the Kingdom: full plate under a red surcoat, a great
 * helm, and a blocky hammer head that comes down on each blow. Compare
 * `drawKnightFigure` — the enemy of the same name.
 */
export function drawDefenderKnight(
  ctx: CanvasRenderingContext2D,
  gait: number,
  fighting: boolean,
  resting: boolean,
): void {
  const swing = Math.sin(gait * 0.36);
  const jab = fighting ? Math.sin(performance.now() * 0.011) * 1.3 : 0;

  ctx.save();
  ctx.scale(1.45, 1.45);
  ctx.lineCap = 'round';

  ctx.fillStyle = 'rgba(0, 0, 0, 0.48)';
  ctx.beginPath();
  ctx.ellipse(0.7, 2.2, 6.6, 5.1, 0, 0, TAU);
  ctx.fill();

  // Legs — heavier and slower than the lighter infantry.
  ctx.strokeStyle = '#2c2c30';
  ctx.lineWidth = 2;
  for (const side of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(-0.7, side * 2);
    ctx.lineTo(-0.7 + swing * side * 1.6, side * 4.2);
    ctx.stroke();
  }

  // Cuirass, with the Kingdom's surcoat worn over it: steel at the shoulders
  // and edges, red across the chest.
  const plate = ctx.createLinearGradient(-5, -5, 3.5, 5);
  plate.addColorStop(0, '#aab0ba');
  plate.addColorStop(0.5, '#6b7078');
  plate.addColorStop(1, '#33363c');
  ctx.fillStyle = plate;
  ctx.strokeStyle = 'rgba(10, 11, 13, 0.85)';
  ctx.lineWidth = 0.6;
  ctx.beginPath();
  ctx.ellipse(-0.9, 0, 4.9, 4.3, 0, 0, TAU);
  ctx.fill();
  ctx.stroke();

  const surcoat = ctx.createLinearGradient(-4, -3, 1, 3);
  surcoat.addColorStop(0, LIVERY_LIGHT);
  surcoat.addColorStop(1, LIVERY_DARK);
  ctx.fillStyle = surcoat;
  ctx.beginPath();
  ctx.ellipse(-1.4, 0, 3.2, 3.4, 0, 0, TAU);
  ctx.fill();

  // Pauldrons on both shoulders, left bare steel over the surcoat.
  ctx.fillStyle = '#7a808a';
  ctx.strokeStyle = 'rgba(10, 11, 13, 0.8)';
  ctx.lineWidth = 0.5;
  for (const side of [-1, 1]) {
    ctx.beginPath();
    ctx.ellipse(0.4, side * 3.6, 2, 1.7, side * 0.3, 0, TAU);
    ctx.fill();
    ctx.stroke();
  }

  // Great helm — fully enclosed, just a T-slit rather than an open face.
  ctx.fillStyle = '#8a8f97';
  ctx.beginPath();
  ctx.arc(1.2, 0, 2.9, 0, TAU);
  ctx.fill();
  ctx.strokeStyle = 'rgba(14, 15, 18, 0.85)';
  ctx.lineWidth = 0.55;
  ctx.stroke();
  ctx.fillStyle = 'rgba(10, 9, 8, 0.85)';
  ctx.fillRect(2.2, -1.9, 1.4, 0.6);
  ctx.fillRect(2.6, -0.35, 1.6, 0.7);
  // A red crest, so he reads as the Kingdom's even from directly above.
  ctx.fillStyle = LIVERY_LIGHT;
  ctx.fillRect(-0.6, -0.45, 2.4, 0.9);

  // The warhammer: levelled and coming down on each blow, or grounded at his
  // feet while he waits.
  ctx.save();
  ctx.rotate(resting ? -0.85 : 0);
  const reach = 10.5 + jab;
  const drop = fighting ? Math.abs(jab) * 0.3 : 0;
  ctx.strokeStyle = '#3c3226';
  ctx.lineWidth = 1.3;
  ctx.beginPath();
  ctx.moveTo(-2.8, 1.8);
  ctx.lineTo(reach - 2.6, -0.7 + drop);
  ctx.stroke();

  ctx.translate(reach - 2.2, -0.8 + drop);
  const head = ctx.createLinearGradient(-1.6, -1.8, 1.6, 1.8);
  head.addColorStop(0, '#9aa0a8');
  head.addColorStop(1, '#4c5058');
  ctx.fillStyle = head;
  ctx.strokeStyle = 'rgba(10, 11, 13, 0.85)';
  ctx.lineWidth = 0.5;
  ctx.beginPath();
  ctx.roundRect(-1.2, -2.1, 3.4, 2.6, 0.5);
  ctx.fill();
  ctx.stroke();
  // Back-spike.
  ctx.beginPath();
  ctx.moveTo(-1.2, -0.2);
  ctx.lineTo(-3, -0.2);
  ctx.lineTo(-1.2, 1.1);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.restore();

  ctx.restore();
}

/**
 * A mounted knight of the Kingdom: mail and a sabre on a barded warhorse, in
 * red rather than the enemy's plain leather. Compare `drawMountedKnightFigure`.
 */
export function drawDefenderMountedKnight(
  ctx: CanvasRenderingContext2D,
  gait: number,
  fighting: boolean,
  resting: boolean,
): void {
  const swingArc = fighting ? Math.sin(performance.now() * 0.011) * 0.6 : 0;

  ctx.save();
  ctx.scale(1.5, 1.5);
  drawHorse(ctx, gait, '#8e7a63', '#3c2f22');

  // Caparison in the Kingdom's red, over the shoulders and the rump. Kept
  // narrow on purpose: draped across the whole barrel it reads as a red blob
  // with legs rather than as a horse wearing a cloth.
  ctx.fillStyle = 'rgba(160, 66, 56, 0.9)';
  ctx.beginPath();
  ctx.ellipse(6, -0.5, 2.9, 2.5, -0.2, 0, TAU);
  ctx.fill();
  ctx.fillStyle = 'rgba(122, 46, 38, 0.85)';
  ctx.beginPath();
  ctx.ellipse(-6.2, 0.6, 3, 2.6, 0.1, 0, TAU);
  ctx.fill();

  ctx.save();
  ctx.translate(-0.5, -3.8);
  ctx.lineCap = 'round';

  // Mail under a red surcoat.
  const mail = ctx.createLinearGradient(-2.8, -2.8, 2.2, 2.8);
  mail.addColorStop(0, LIVERY_LIGHT);
  mail.addColorStop(1, LIVERY_DARK);
  ctx.fillStyle = mail;
  ctx.strokeStyle = 'rgba(12, 8, 6, 0.8)';
  ctx.lineWidth = 0.55;
  ctx.beginPath();
  ctx.ellipse(-0.7, 0, 3.5, 3, 0, 0, TAU);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = '#9aa0a8';
  ctx.beginPath();
  ctx.arc(1, 0, 2.4, 0, TAU);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = '#4a4f57';
  ctx.beginPath();
  ctx.arc(1, 0, 2.4, Math.PI * 0.4, Math.PI * 1.6);
  ctx.fill();

  // Sabre: swung side to side from the saddle, or rested across it.
  const reach = resting ? 5 : 8;
  ctx.save();
  ctx.rotate(resting ? -1 : swingArc);
  ctx.strokeStyle = '#4a3520';
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.moveTo(2, 2.2);
  ctx.lineTo(3.6, 1.9);
  ctx.stroke();
  const blade = ctx.createLinearGradient(3.6, 0, reach, 0);
  blade.addColorStop(0, '#cfd4da');
  blade.addColorStop(1, '#8d949c');
  ctx.strokeStyle = blade;
  ctx.lineWidth = 1.3;
  ctx.beginPath();
  ctx.moveTo(3.6, 1.9);
  ctx.lineTo(reach, 1.9);
  ctx.stroke();
  ctx.restore();

  ctx.restore();
  ctx.restore();
}

/*
 * ---------------------------------------------------------------------------
 * The Marches.
 *
 * The Kingdom wears deep red over steel; the border realm wears **green over
 * worn leather**, with far less plate on show. Two realms made mostly of melee
 * posts would be unreadable in one palette, and you may well want to look at
 * both — so the livery does the work the silhouettes cannot.
 * ---------------------------------------------------------------------------
 */

/** The Marches' colours: forest green over worn leather. */
const MARCH_LIGHT = '#6f8a4a';
const MARCH_DARK = '#2f4020';

/**
 * A man-at-arms: mail shirt, open kettle helm, sword and buckler. Lighter than
 * the Kingdom's swordsman on purpose — a retained soldier rather than a
 * household knight.
 */
export function drawMarchManAtArms(
  ctx: CanvasRenderingContext2D,
  gait: number,
  fighting: boolean,
  resting: boolean,
): void {
  const swing = Math.sin(gait * 0.44);

  ctx.save();
  ctx.scale(1.38, 1.38);
  ctx.lineCap = 'round';

  ctx.fillStyle = 'rgba(0, 0, 0, 0.42)';
  ctx.beginPath();
  ctx.ellipse(0.6, 1.9, 5.6, 4.5, 0, 0, TAU);
  ctx.fill();

  ctx.strokeStyle = '#3a3324';
  ctx.lineWidth = 1.6;
  for (const side of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(-0.8, side * 1.7);
    ctx.lineTo(-0.8 + swing * side * 2.1, side * 3.8);
    ctx.stroke();
  }

  // Green jack over a mail shirt.
  const jack = ctx.createLinearGradient(-4, -4, 3, 4);
  jack.addColorStop(0, MARCH_LIGHT);
  jack.addColorStop(1, MARCH_DARK);
  ctx.fillStyle = jack;
  ctx.strokeStyle = 'rgba(14, 18, 8, 0.8)';
  ctx.lineWidth = 0.55;
  ctx.beginPath();
  ctx.ellipse(-1, 0, 4.3, 3.7, 0, 0, TAU);
  ctx.fill();
  ctx.stroke();

  // Mail showing at the shoulders.
  ctx.fillStyle = 'rgba(150, 156, 162, 0.55)';
  for (const side of [-1, 1]) {
    ctx.beginPath();
    ctx.ellipse(-0.2, side * 3.2, 1.5, 1.1, side * 0.3, 0, TAU);
    ctx.fill();
  }

  // Small round buckler on the off hand.
  ctx.fillStyle = '#7c6a4a';
  ctx.strokeStyle = 'rgba(20, 14, 8, 0.85)';
  ctx.lineWidth = 0.55;
  ctx.beginPath();
  ctx.arc(1.6, -3.4, 2.3, 0, TAU);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = 'rgba(220, 216, 200, 0.7)';
  ctx.beginPath();
  ctx.arc(1.6, -3.4, 0.7, 0, TAU);
  ctx.fill();

  // Open kettle helm.
  ctx.fillStyle = '#9aa0a8';
  ctx.beginPath();
  ctx.arc(1.2, 0, 2.4, 0, TAU);
  ctx.fill();
  ctx.strokeStyle = 'rgba(18, 18, 20, 0.8)';
  ctx.lineWidth = 0.5;
  ctx.stroke();
  ctx.fillStyle = 'rgba(24, 20, 14, 0.45)';
  ctx.beginPath();
  ctx.arc(1.2, 0, 2.4, Math.PI * 0.42, Math.PI * 1.58);
  ctx.fill();

  // Sword: cutting side to side while fighting, lowered at the post.
  const swingArc = fighting ? Math.sin(performance.now() * 0.011) * 0.8 : 0;
  const reach = resting ? 5.2 : 8.6;
  ctx.save();
  ctx.rotate(resting ? -0.95 : swingArc);
  ctx.strokeStyle = '#4a3520';
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.moveTo(2.4, 2.7);
  ctx.lineTo(4.2, 2.4);
  ctx.stroke();
  const blade = ctx.createLinearGradient(4.2, 0, reach, 0);
  blade.addColorStop(0, '#cfd4da');
  blade.addColorStop(1, '#8d949c');
  ctx.strokeStyle = blade;
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.moveTo(4.2, 2.4);
  ctx.lineTo(reach, 2.4);
  ctx.stroke();
  ctx.restore();

  ctx.restore();
}

/**
 * A shieldbearer: pike levelled, kite shield up, in a mail hauberk. The
 * Marches' middle rank — heavier than the men-at-arms beside him and visibly
 * so, which is the point of the shield.
 */
export function drawMarchShieldbearer(
  ctx: CanvasRenderingContext2D,
  gait: number,
  fighting: boolean,
  resting: boolean,
): void {
  const swing = Math.sin(gait * 0.4);
  const jab = fighting ? Math.sin(performance.now() * 0.018) * 1.2 : 0;

  ctx.save();
  ctx.scale(1.4, 1.4);
  ctx.lineCap = 'round';

  ctx.fillStyle = 'rgba(0, 0, 0, 0.44)';
  ctx.beginPath();
  ctx.ellipse(0.6, 2, 5.8, 4.7, 0, 0, TAU);
  ctx.fill();

  ctx.strokeStyle = '#33301f';
  ctx.lineWidth = 1.7;
  for (const side of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(-0.7, side * 1.8);
    ctx.lineTo(-0.7 + swing * side * 1.8, side * 3.9);
    ctx.stroke();
  }

  // Mail hauberk under a green surcoat — heavier than the men-at-arms' jack.
  const coat = ctx.createLinearGradient(-4, -4, 3, 4);
  coat.addColorStop(0, MARCH_LIGHT);
  coat.addColorStop(1, MARCH_DARK);
  ctx.fillStyle = coat;
  ctx.strokeStyle = 'rgba(14, 18, 8, 0.82)';
  ctx.lineWidth = 0.6;
  ctx.beginPath();
  ctx.ellipse(-0.9, 0, 4.5, 3.9, 0, 0, TAU);
  ctx.fill();
  ctx.stroke();

  // Mail at the shoulders and hem.
  ctx.fillStyle = 'rgba(158, 164, 170, 0.6)';
  for (const side of [-1, 1]) {
    ctx.beginPath();
    ctx.ellipse(-0.4, side * 3.3, 1.7, 1.2, side * 0.3, 0, TAU);
    ctx.fill();
  }

  // The kite shield: the thing that tells him apart at a glance.
  ctx.save();
  ctx.translate(1.1, -3.7);
  ctx.rotate(-0.35);
  const face = ctx.createLinearGradient(-2.4, -3, 2.4, 3);
  face.addColorStop(0, '#7d8f57');
  face.addColorStop(1, '#374524');
  ctx.fillStyle = face;
  ctx.strokeStyle = 'rgba(16, 12, 6, 0.9)';
  ctx.lineWidth = 0.6;
  ctx.beginPath();
  ctx.moveTo(0, -3.3);
  ctx.quadraticCurveTo(2.5, -2.4, 2.2, 0.6);
  ctx.quadraticCurveTo(1.8, 2.9, 0, 3.6);
  ctx.quadraticCurveTo(-1.8, 2.9, -2.2, 0.6);
  ctx.quadraticCurveTo(-2.5, -2.4, 0, -3.3);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  // Steel rim and boss.
  ctx.strokeStyle = 'rgba(214, 218, 224, 0.55)';
  ctx.lineWidth = 0.4;
  ctx.stroke();
  ctx.fillStyle = 'rgba(226, 222, 206, 0.8)';
  ctx.beginPath();
  ctx.arc(0, 0.1, 0.75, 0, TAU);
  ctx.fill();
  ctx.restore();

  // Nasal helm.
  ctx.fillStyle = '#9aa0a8';
  ctx.beginPath();
  ctx.arc(1.2, 0, 2.5, 0, TAU);
  ctx.fill();
  ctx.strokeStyle = 'rgba(18, 18, 20, 0.82)';
  ctx.lineWidth = 0.5;
  ctx.stroke();
  ctx.fillStyle = 'rgba(22, 18, 12, 0.6)';
  ctx.beginPath();
  ctx.ellipse(2.1, 0, 0.9, 1.9, 0, 0, TAU);
  ctx.fill();

  // The pike: levelled and jabbing, or butt-down and upright at the post.
  ctx.save();
  ctx.rotate(resting ? -1.1 : 0);
  const reach = 12.5 + jab;
  ctx.strokeStyle = '#5c4527';
  ctx.lineWidth = 1.15;
  ctx.beginPath();
  ctx.moveTo(-2.8, 1.7);
  ctx.lineTo(reach - 2, -0.6);
  ctx.stroke();
  const head = ctx.createLinearGradient(reach - 3, 0, reach, 0);
  head.addColorStop(0, '#8d949c');
  head.addColorStop(1, '#e7ebef');
  ctx.fillStyle = head;
  ctx.beginPath();
  ctx.moveTo(reach, -0.6);
  ctx.lineTo(reach - 2.7, -1.7);
  ctx.lineTo(reach - 2.7, 0.5);
  ctx.closePath();
  ctx.fill();
  ctx.restore();

  ctx.restore();
}

/**
 * A sword knight of the Marches: full plate under a green surcoat, longsword.
 * The Kingdom's warhammer knight's opposite number — same harness, a blade
 * instead of a hammer.
 */
export function drawMarchSwordKnight(
  ctx: CanvasRenderingContext2D,
  gait: number,
  fighting: boolean,
  resting: boolean,
): void {
  const swing = Math.sin(gait * 0.36);

  ctx.save();
  ctx.scale(1.45, 1.45);
  ctx.lineCap = 'round';

  ctx.fillStyle = 'rgba(0, 0, 0, 0.48)';
  ctx.beginPath();
  ctx.ellipse(0.7, 2.2, 6.6, 5.1, 0, 0, TAU);
  ctx.fill();

  ctx.strokeStyle = '#2c2c30';
  ctx.lineWidth = 2;
  for (const side of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(-0.7, side * 2);
    ctx.lineTo(-0.7 + swing * side * 1.6, side * 4.2);
    ctx.stroke();
  }

  const plate = ctx.createLinearGradient(-5, -5, 3.5, 5);
  plate.addColorStop(0, '#aab0ba');
  plate.addColorStop(0.5, '#6b7078');
  plate.addColorStop(1, '#33363c');
  ctx.fillStyle = plate;
  ctx.strokeStyle = 'rgba(10, 11, 13, 0.85)';
  ctx.lineWidth = 0.6;
  ctx.beginPath();
  ctx.ellipse(-0.9, 0, 4.9, 4.3, 0, 0, TAU);
  ctx.fill();
  ctx.stroke();

  const surcoat = ctx.createLinearGradient(-4, -3, 1, 3);
  surcoat.addColorStop(0, MARCH_LIGHT);
  surcoat.addColorStop(1, MARCH_DARK);
  ctx.fillStyle = surcoat;
  ctx.beginPath();
  ctx.ellipse(-1.4, 0, 3.2, 3.4, 0, 0, TAU);
  ctx.fill();

  ctx.fillStyle = '#7a808a';
  ctx.strokeStyle = 'rgba(10, 11, 13, 0.8)';
  ctx.lineWidth = 0.5;
  for (const side of [-1, 1]) {
    ctx.beginPath();
    ctx.ellipse(0.4, side * 3.6, 2, 1.7, side * 0.3, 0, TAU);
    ctx.fill();
    ctx.stroke();
  }

  // Great helm with a green crest.
  ctx.fillStyle = '#8a8f97';
  ctx.beginPath();
  ctx.arc(1.2, 0, 2.9, 0, TAU);
  ctx.fill();
  ctx.strokeStyle = 'rgba(14, 15, 18, 0.85)';
  ctx.lineWidth = 0.55;
  ctx.stroke();
  ctx.fillStyle = 'rgba(10, 9, 8, 0.85)';
  ctx.fillRect(2.2, -1.9, 1.4, 0.6);
  ctx.fillRect(2.6, -0.35, 1.6, 0.7);
  ctx.fillStyle = MARCH_LIGHT;
  ctx.fillRect(-0.6, -0.45, 2.4, 0.9);

  // Longsword, two-handed, swept round while fighting.
  const swingArc = fighting ? Math.sin(performance.now() * 0.0095) * 0.9 : 0;
  const reach = resting ? 6 : 11.5;
  ctx.save();
  ctx.rotate(resting ? -0.85 : swingArc);
  ctx.strokeStyle = '#3f2e1b';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(2.6, 2.2);
  ctx.lineTo(4.8, 1.9);
  ctx.stroke();
  ctx.strokeStyle = '#7a6844';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(5, 0.3);
  ctx.lineTo(5, 3.5);
  ctx.stroke();
  const blade = ctx.createLinearGradient(5, 0, reach, 0);
  blade.addColorStop(0, '#dde2e8');
  blade.addColorStop(1, '#8d949c');
  ctx.strokeStyle = blade;
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.moveTo(5, 1.9);
  ctx.lineTo(reach, 1.9);
  ctx.stroke();
  ctx.restore();

  ctx.restore();
}

/**
 * A lancer: heavy horse, harness, and a lance couched under the arm. Longer
 * reach than anything else on the board, which is the point of him.
 */
export function drawMarchLancer(
  ctx: CanvasRenderingContext2D,
  gait: number,
  fighting: boolean,
  resting: boolean,
): void {
  const jab = fighting ? Math.sin(performance.now() * 0.013) * 1.6 : 0;

  ctx.save();
  ctx.scale(1.5, 1.5);
  drawHorse(ctx, gait, '#6b5f4e', '#2b2419');

  // Green caparison fore and aft, kept narrow so the horse still reads.
  ctx.fillStyle = 'rgba(96, 124, 62, 0.9)';
  ctx.beginPath();
  ctx.ellipse(6, -0.5, 2.9, 2.5, -0.2, 0, TAU);
  ctx.fill();
  ctx.fillStyle = 'rgba(58, 78, 36, 0.85)';
  ctx.beginPath();
  ctx.ellipse(-6.2, 0.6, 3, 2.6, 0.1, 0, TAU);
  ctx.fill();

  ctx.save();
  ctx.translate(-0.5, -3.8);
  ctx.lineCap = 'round';

  const harness = ctx.createLinearGradient(-2.8, -2.8, 2.2, 2.8);
  harness.addColorStop(0, '#9aa0a8');
  harness.addColorStop(1, '#43484f');
  ctx.fillStyle = harness;
  ctx.strokeStyle = 'rgba(10, 11, 13, 0.85)';
  ctx.lineWidth = 0.55;
  ctx.beginPath();
  ctx.ellipse(-0.7, 0, 3.6, 3.1, 0, 0, TAU);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = MARCH_DARK;
  ctx.beginPath();
  ctx.ellipse(-1.3, 0, 2.3, 2.4, 0, 0, TAU);
  ctx.fill();

  ctx.fillStyle = '#9aa0a8';
  ctx.beginPath();
  ctx.arc(1, 0, 2.4, 0, TAU);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = '#4a4f57';
  ctx.beginPath();
  ctx.arc(1, 0, 2.4, Math.PI * 0.4, Math.PI * 1.6);
  ctx.fill();

  // The lance: couched and levelled, or upright at the post.
  ctx.save();
  ctx.rotate(resting ? -1.15 : 0);
  const reach = 21 + jab;
  ctx.strokeStyle = '#5c4527';
  ctx.lineWidth = 1.15;
  ctx.beginPath();
  ctx.moveTo(-4.6, 1.5);
  ctx.lineTo(reach - 2.4, -1.3);
  ctx.stroke();
  // Vamplate, the guard over the grip.
  ctx.fillStyle = '#8d949c';
  ctx.beginPath();
  ctx.ellipse(-1.6, 0.6, 1.1, 1.5, -0.15, 0, TAU);
  ctx.fill();
  ctx.fillStyle = '#d5dae0';
  ctx.beginPath();
  ctx.moveTo(reach, -1.45);
  ctx.lineTo(reach - 3, -2.3);
  ctx.lineTo(reach - 3, -0.35);
  ctx.closePath();
  ctx.fill();
  ctx.restore();

  ctx.restore();
  ctx.restore();
}

/**
 * The Flail Guard on his post, swinging a morning star in a full circle.
 *
 * `sweepRadius` is the *actual* circle the game hits, in world units, and the
 * ball is drawn orbiting on exactly that line — so what you can see is what
 * gets hurt. `recoil` runs 1 to 0 just after a blow lands and drives the
 * bright ring that marks the swing connecting.
 *
 * Drawn live rather than baked, since none of it holds still.
 */
export function drawFlailGuard(
  ctx: CanvasRenderingContext2D,
  radius: number,
  recoil: number,
  sweepRadius: number,
): void {
  // The circle first, in world units, before the figure is scaled to his post.
  const spin = performance.now() * 0.0022;

  // The ring the ball travels, always faintly visible so the threatened ground
  // is legible even between blows.
  ctx.strokeStyle = `rgba(200, 196, 210, ${0.1 + recoil * 0.4})`;
  ctx.lineWidth = 1 + recoil * 3;
  ctx.beginPath();
  ctx.arc(0, 0, sweepRadius, 0, TAU);
  ctx.stroke();

  // A bright arc chasing the head round, so the direction of the swing reads.
  ctx.strokeStyle = `rgba(226, 232, 240, ${0.15 + recoil * 0.55})`;
  ctx.lineWidth = 2 + recoil * 4;
  ctx.beginPath();
  ctx.arc(0, 0, sweepRadius, spin - 1.5, spin);
  ctx.stroke();

  // The chain, out to the head on the ring.
  const hx = Math.cos(spin) * sweepRadius;
  const hy = Math.sin(spin) * sweepRadius;
  ctx.strokeStyle = 'rgba(172, 170, 182, 0.85)';
  ctx.lineWidth = 1.6;
  ctx.setLineDash([3, 2.6]);
  ctx.beginPath();
  ctx.moveTo(Math.cos(spin) * radius * 0.5, Math.sin(spin) * radius * 0.5);
  ctx.lineTo(hx, hy);
  ctx.stroke();
  ctx.setLineDash([]);

  // The head itself, out on the ring where it can actually reach.
  const headR = radius * 0.34;
  const ball = ctx.createRadialGradient(hx - headR * 0.4, hy - headR * 0.4, headR * 0.2, hx, hy, headR);
  ball.addColorStop(0, '#9a97a3');
  ball.addColorStop(1, '#2f2d36');
  ctx.fillStyle = ball;
  ctx.beginPath();
  ctx.arc(hx, hy, headR, 0, TAU);
  ctx.fill();
  ctx.strokeStyle = 'rgba(10, 9, 12, 0.85)';
  ctx.lineWidth = 0.8;
  ctx.stroke();
  ctx.strokeStyle = '#c2bfcb';
  ctx.lineWidth = 1.1;
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * TAU + spin * 3;
    ctx.beginPath();
    ctx.moveTo(hx + Math.cos(a) * headR * 0.85, hy + Math.sin(a) * headR * 0.85);
    ctx.lineTo(hx + Math.cos(a) * headR * 1.7, hy + Math.sin(a) * headR * 1.7);
    ctx.stroke();
  }

  ctx.save();
  ctx.scale(radius / 13, radius / 13);
  ctx.lineCap = 'round';

  ctx.fillStyle = 'rgba(0, 0, 0, 0.45)';
  ctx.beginPath();
  ctx.ellipse(0.6, 1.8, 5.6, 4.6, 0, 0, TAU);
  ctx.fill();

  // Braced stance, feet apart.
  ctx.strokeStyle = '#3a3324';
  ctx.lineWidth = 1.7;
  for (const side of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(-0.8, side * 1.8);
    ctx.lineTo(-2.2, side * 4);
    ctx.stroke();
  }

  const jack = ctx.createLinearGradient(-4, -4, 3, 4);
  jack.addColorStop(0, MARCH_LIGHT);
  jack.addColorStop(1, MARCH_DARK);
  ctx.fillStyle = jack;
  ctx.strokeStyle = 'rgba(14, 18, 8, 0.8)';
  ctx.lineWidth = 0.6;
  ctx.beginPath();
  ctx.ellipse(-1, 0, 4.5, 3.9, 0, 0, TAU);
  ctx.fill();
  ctx.stroke();

  // Plate at the shoulders — he is medium armour, not light.
  ctx.fillStyle = '#7f858d';
  ctx.strokeStyle = 'rgba(12, 12, 14, 0.8)';
  ctx.lineWidth = 0.5;
  for (const side of [-1, 1]) {
    ctx.beginPath();
    ctx.ellipse(-0.2, side * 3.4, 1.8, 1.4, side * 0.3, 0, TAU);
    ctx.fill();
    ctx.stroke();
  }

  ctx.fillStyle = '#9aa0a8';
  ctx.beginPath();
  ctx.arc(1.2, 0, 2.5, 0, TAU);
  ctx.fill();
  ctx.strokeStyle = 'rgba(18, 18, 20, 0.8)';
  ctx.lineWidth = 0.5;
  ctx.stroke();
  ctx.fillStyle = 'rgba(24, 20, 14, 0.5)';
  ctx.beginPath();
  ctx.arc(1.2, 0, 2.5, Math.PI * 0.42, Math.PI * 1.58);
  ctx.fill();

  // The grip: both hands out towards the chain, which leaves the post rather
  // than a weapon held close. The head itself is drawn out on the ring above,
  // in world units, because that is where it actually reaches.
  ctx.strokeStyle = '#4a3520';
  ctx.lineWidth = 1.3;
  ctx.beginPath();
  ctx.moveTo(1.6, 1.2);
  ctx.lineTo(4.4, 0.4);
  ctx.stroke();

  ctx.restore();
  ctx.restore();
}

/**
 * A field hospital: an open-fronted marquee with the wounded laid out inside,
 * a physician working over them, and the camp that comes with it.
 *
 * The old version was a closed rectangle with a cross painted on the roof,
 * which from directly above read as a first-aid box rather than a place where
 * anything happens. The point of this one is that you can see *into* it — the
 * open bay, the cots and the figure at work are what make it a hospital rather
 * than a crate. Nothing here is animated; it is all baked into one sprite.
 */
export function makeHospitalSprite(def: TowerDef): Sprite {
  const r = def.radius;
  const { sprite, ctx } = createSprite(r * 3.3);
  const rand = mulberry32(0x4e11ed);

  groundShadow(ctx, r);

  // Trodden, muddied ground — a lot of people have walked in and out.
  ctx.fillStyle = '#5b5340';
  ctx.beginPath();
  ctx.arc(0, 0, r * 1.04, 0, TAU);
  ctx.fill();
  for (let i = 0; i < 70; i++) {
    const a = rand() * TAU;
    const d = rand() * r;
    ctx.fillStyle = rand() < 0.5 ? 'rgba(24, 20, 12, 0.28)' : 'rgba(196, 182, 148, 0.14)';
    ctx.beginPath();
    ctx.arc(Math.cos(a) * d, Math.sin(a) * d, 0.4 + rand() * 1.4, 0, TAU);
    ctx.fill();
  }

  // ---- the marquee, peaked rather than boxy so it reads as a tent ----
  const w = r * 0.94;
  const h = r * 0.7;

  // Canvas, with the ridge running left to right and the eaves falling away.
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(-w, -h * 0.55);
  ctx.lineTo(-w * 0.62, -h);
  ctx.lineTo(w * 0.62, -h);
  ctx.lineTo(w, -h * 0.55);
  ctx.lineTo(w, h * 0.55);
  ctx.lineTo(w * 0.62, h);
  ctx.lineTo(-w * 0.62, h);
  ctx.lineTo(-w, h * 0.55);
  ctx.closePath();
  ctx.clip();

  const cloth = ctx.createLinearGradient(0, -h, 0, h);
  cloth.addColorStop(0, '#9b937d');
  cloth.addColorStop(0.44, '#ded7c3');
  cloth.addColorStop(0.5, '#efe9d8');
  cloth.addColorStop(0.56, '#c8c0aa');
  cloth.addColorStop(1, '#7e7764');
  ctx.fillStyle = cloth;
  ctx.fillRect(-w, -h, w * 2, h * 2);

  // Seams, and a few weather stains so the canvas is not flat.
  ctx.strokeStyle = 'rgba(120, 110, 88, 0.45)';
  ctx.lineWidth = r * 0.022;
  for (let x = -w; x < w; x += r * 0.26) {
    ctx.beginPath();
    ctx.moveTo(x, -h);
    ctx.lineTo(x, h);
    ctx.stroke();
  }
  for (let i = 0; i < 14; i++) {
    ctx.fillStyle = `rgba(120, 108, 82, ${0.05 + rand() * 0.09})`;
    ctx.beginPath();
    ctx.ellipse(
      (rand() - 0.5) * w * 1.9,
      (rand() - 0.5) * h * 1.9,
      r * (0.06 + rand() * 0.14),
      r * (0.05 + rand() * 0.1),
      rand() * TAU,
      0,
      TAU,
    );
    ctx.fill();
  }

  // ---- the open bay: the south wall is rolled up, and you can see in ----
  const bayTop = h * 0.06;
  ctx.fillStyle = 'rgba(30, 25, 17, 0.82)';
  ctx.fillRect(-w, bayTop, w * 2, h - bayTop);

  // Two cots, head to the back wall.
  for (const cx of [-w * 0.46, w * 0.16]) {
    ctx.fillStyle = '#6b5b3f';
    ctx.beginPath();
    ctx.roundRect(cx, bayTop + h * 0.16, w * 0.42, h * 0.6, r * 0.03);
    ctx.fill();
    // Blanket over the man on it.
    ctx.fillStyle = '#8d5148';
    ctx.beginPath();
    ctx.roundRect(cx + w * 0.03, bayTop + h * 0.3, w * 0.36, h * 0.4, r * 0.03);
    ctx.fill();
    // His head on the bolster.
    ctx.fillStyle = '#c8a682';
    ctx.beginPath();
    ctx.arc(cx + w * 0.21, bayTop + h * 0.26, r * 0.055, 0, TAU);
    ctx.fill();
  }

  // The physician, stooped between the cots in a pale apron.
  ctx.fillStyle = '#e8e2d2';
  ctx.beginPath();
  ctx.ellipse(-w * 0.03, bayTop + h * 0.44, r * 0.1, r * 0.13, 0, 0, TAU);
  ctx.fill();
  ctx.fillStyle = '#3b342a';
  ctx.beginPath();
  ctx.arc(-w * 0.03, bayTop + h * 0.3, r * 0.062, 0, TAU);
  ctx.fill();
  ctx.restore();

  // Tent outline and the ridge pole over the top of it all.
  ctx.strokeStyle = 'rgba(56, 48, 33, 0.8)';
  ctx.lineWidth = r * 0.05;
  ctx.beginPath();
  ctx.moveTo(-w, -h * 0.55);
  ctx.lineTo(-w * 0.62, -h);
  ctx.lineTo(w * 0.62, -h);
  ctx.lineTo(w, -h * 0.55);
  ctx.lineTo(w, h * 0.55);
  ctx.lineTo(w * 0.62, h);
  ctx.lineTo(-w * 0.62, h);
  ctx.lineTo(-w, h * 0.55);
  ctx.closePath();
  ctx.stroke();

  ctx.strokeStyle = 'rgba(74, 58, 34, 0.85)';
  ctx.lineWidth = r * 0.06;
  ctx.beginPath();
  ctx.moveTo(-w * 0.98, 0);
  ctx.lineTo(w * 0.98, 0);
  ctx.stroke();

  // Guy ropes out to their pegs.
  ctx.strokeStyle = 'rgba(198, 182, 140, 0.65)';
  ctx.lineWidth = r * 0.028;
  for (const [sx, sy] of [
    [-1, -1],
    [1, -1],
    [-1, 1],
    [1, 1],
  ] as const) {
    ctx.beginPath();
    ctx.moveTo(sx * w * 0.62, sy * h);
    ctx.lineTo(sx * r * 0.99, sy * r * 0.94);
    ctx.stroke();
    ctx.fillStyle = 'rgba(48, 38, 24, 0.8)';
    ctx.beginPath();
    ctx.arc(sx * r * 0.99, sy * r * 0.94, r * 0.035, 0, TAU);
    ctx.fill();
  }

  // ---- the camp around it ----

  // Water barrels and a crate of dressings by the north-west corner.
  for (const [bx, by, br] of [
    [-r * 0.88, -r * 0.62, r * 0.13],
    [-r * 0.66, -r * 0.8, r * 0.11],
  ] as const) {
    ctx.fillStyle = '#6d5433';
    ctx.beginPath();
    ctx.arc(bx, by, br, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = 'rgba(38, 28, 16, 0.8)';
    ctx.lineWidth = r * 0.025;
    ctx.stroke();
    ctx.strokeStyle = 'rgba(200, 186, 150, 0.4)';
    ctx.lineWidth = r * 0.02;
    ctx.beginPath();
    ctx.arc(bx, by, br * 0.6, 0, TAU);
    ctx.stroke();
  }

  ctx.fillStyle = '#7d6647';
  ctx.beginPath();
  ctx.roundRect(r * 0.6, -r * 0.86, r * 0.34, r * 0.26, r * 0.03);
  ctx.fill();
  ctx.strokeStyle = 'rgba(38, 28, 16, 0.75)';
  ctx.lineWidth = r * 0.025;
  ctx.stroke();

  // The banner: a pole off one corner with a red-cross pennant, which is what
  // actually names the building at a glance now the roof is plain canvas.
  const px = -r * 0.9;
  const py = r * 0.52;
  ctx.strokeStyle = '#5d4526';
  ctx.lineWidth = r * 0.05;
  ctx.beginPath();
  ctx.moveTo(px, py);
  ctx.lineTo(px + r * 0.05, py + r * 0.42);
  ctx.stroke();

  ctx.fillStyle = '#f0e8d6';
  ctx.beginPath();
  ctx.moveTo(px, py);
  ctx.lineTo(px + r * 0.46, py - r * 0.06);
  ctx.lineTo(px + r * 0.46, py + r * 0.3);
  ctx.lineTo(px + r * 0.03, py + r * 0.34);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = 'rgba(60, 52, 36, 0.6)';
  ctx.lineWidth = r * 0.022;
  ctx.stroke();

  ctx.fillStyle = '#9e3b32';
  const arm = r * 0.05;
  const span = r * 0.13;
  const cx = px + r * 0.24;
  const cy = py + r * 0.14;
  ctx.fillRect(cx - arm, cy - span, arm * 2, span * 2);
  ctx.fillRect(cx - span, cy - arm, span * 2, arm * 2);

  return sprite;
}

// -------------------------------------------------------------------- catapult

/** Only the earth bank the engine stands on; the machine itself rotates. */
export function makeCatapultSprite(def: TowerDef): Sprite {
  const r = def.radius;
  // Nothing under the engine at all: no dirt pad, no shadow. The machine
  // itself is drawn live by `drawCatapultArm`.
  const { sprite } = createSprite(r * 2.9);
  return sprite;
}

/** A crewman working the engine, drawn small and from above. */
function drawCrewman(ctx: CanvasRenderingContext2D, x: number, y: number, facing: number): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(facing);

  ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
  ctx.beginPath();
  ctx.ellipse(0.6, 1.6, 4.8, 3.9, 0, 0, TAU);
  ctx.fill();

  const tunic = ctx.createLinearGradient(-3.4, -3.4, 2, 3.4);
  tunic.addColorStop(0, '#6b6041');
  tunic.addColorStop(1, '#241f13');
  ctx.fillStyle = tunic;
  ctx.strokeStyle = 'rgba(8, 7, 4, 0.85)';
  ctx.lineWidth = 0.5;
  ctx.beginPath();
  ctx.ellipse(-0.9, 0, 3.9, 3.3, 0, 0, TAU);
  ctx.fill();
  ctx.stroke();

  // Arms reaching towards the frame.
  ctx.fillStyle = '#4f4429';
  for (const side of [-1, 1]) {
    ctx.beginPath();
    ctx.ellipse(1.4, side * 2.5, 2.2, 1.25, side * 0.3, 0, TAU);
    ctx.fill();
    ctx.stroke();
  }

  ctx.fillStyle = '#cb9c6e';
  ctx.beginPath();
  ctx.arc(1.1, 0, 2.25, 0, TAU);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = '#33291a';
  ctx.beginPath();
  ctx.arc(1.1, 0, 2.25, Math.PI * 0.4, Math.PI * 1.6);
  ctx.fill();

  ctx.restore();
}

/**
 * The whole siege engine — frame, throwing arm, sling and crew — turned bodily
 * towards the target. `recoil` counts down from 1 after each shot.
 */
export function drawCatapultArm(
  ctx: CanvasRenderingContext2D,
  radius: number,
  recoil: number,
  crew: number,
  onFire: boolean,
): void {
  ctx.save();
  ctx.scale(radius / 22, radius / 22);
  ctx.lineCap = 'round';

  // Crew stand to the side of the frame, leaning in to work it.
  drawCrewman(ctx, -3, 11.5, -TAU / 4);
  if (crew > 1) drawCrewman(ctx, -3, -11.5, TAU / 4);

  // Timber side rails.
  const rail = ctx.createLinearGradient(-12, 0, 14, 0);
  rail.addColorStop(0, '#3f2d18');
  rail.addColorStop(1, '#6b4f2c');
  for (const side of [-1, 1]) {
    ctx.fillStyle = rail;
    ctx.strokeStyle = 'rgba(16, 11, 6, 0.8)';
    ctx.lineWidth = 0.7;
    ctx.beginPath();
    ctx.roundRect(-13, side * 5.4 - 1.7, 27, 3.4, 1.2);
    ctx.fill();
    ctx.stroke();
  }

  // Cross braces.
  ctx.strokeStyle = '#4a3520';
  ctx.lineWidth = 2.4;
  for (const bx of [-11, 12]) {
    ctx.beginPath();
    ctx.moveTo(bx, -6.2);
    ctx.lineTo(bx, 6.2);
    ctx.stroke();
  }

  // Twisted skein the arm is sprung from.
  ctx.strokeStyle = '#8d7a55';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(-4, -5.4);
  ctx.lineTo(-4, 5.4);
  ctx.stroke();

  // Throwing arm: flung forward on release, then winched back.
  const lift = -recoil * 8;
  const beam = ctx.createLinearGradient(-6, 0, 20, 0);
  beam.addColorStop(0, '#6d5028');
  beam.addColorStop(1, '#ab8348');
  ctx.fillStyle = beam;
  ctx.strokeStyle = 'rgba(18, 12, 6, 0.85)';
  ctx.lineWidth = 0.8;
  ctx.beginPath();
  ctx.roundRect(-7, -2.1, 27 + lift, 4.2, 1.8);
  ctx.fill();
  ctx.stroke();

  // Iron banding on the arm.
  ctx.strokeStyle = '#3a3d42';
  ctx.lineWidth = 1.1;
  for (const bx of [2, 9]) {
    ctx.beginPath();
    ctx.moveTo(bx + lift * 0.4, -2.1);
    ctx.lineTo(bx + lift * 0.4, 2.1);
    ctx.stroke();
  }

  // Sling cup with a stone in it.
  ctx.fillStyle = '#2f2413';
  ctx.beginPath();
  ctx.arc(18 + lift, 0, 4.1, 0, TAU);
  ctx.fill();
  if (recoil < 0.3) {
    if (onFire) {
      const glow = ctx.createRadialGradient(18 + lift, 0, 0.5, 18 + lift, 0, 5.5);
      glow.addColorStop(0, 'rgba(255, 216, 130, 0.95)');
      glow.addColorStop(0.5, 'rgba(232, 132, 40, 0.6)');
      glow.addColorStop(1, 'rgba(190, 70, 20, 0)');
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(18 + lift, 0, 5.5, 0, TAU);
      ctx.fill();
    }
    const stone = ctx.createRadialGradient(17 + lift, -1, 0.4, 18 + lift, 0, 3);
    stone.addColorStop(0, onFire ? '#c98a4e' : '#9a938a');
    stone.addColorStop(1, onFire ? '#5c3218' : '#4f4a44');
    ctx.fillStyle = stone;
    ctx.beginPath();
    ctx.arc(18 + lift, 0, 2.7, 0, TAU);
    ctx.fill();
  }

  // Iron pivot pin.
  ctx.fillStyle = '#43464b';
  ctx.beginPath();
  ctx.arc(-4, 0, 2.4, 0, TAU);
  ctx.fill();

  ctx.restore();
}

// ---------------------------------------------------------------- houndmaster

/**
 * No base at all — the dogs live in `Dog` instances of their own, not painted
 * into this sprite, and the handler (`drawHoundmasterFigure`) already carries
 * its own contact shadow, so there is nothing left to draw here.
 */
export function makeHoundmasterSprite(def: TowerDef): Sprite {
  const r = def.radius;
  const { sprite } = createSprite(r * 2.9);
  return sprite;
}

/** The handler, watching whichever way the tower faces. */
export function drawHoundmasterFigure(ctx: CanvasRenderingContext2D, radius: number): void {
  ctx.save();
  ctx.scale(radius / 15, radius / 15);
  ctx.lineCap = 'round';

  ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
  ctx.beginPath();
  ctx.ellipse(0.8, 1.8, 6.2, 4.8, 0, 0, TAU);
  ctx.fill();

  // Long coat.
  const coat = ctx.createLinearGradient(-4, -4.5, 2.5, 4.5);
  coat.addColorStop(0, '#5c4a30');
  coat.addColorStop(1, '#241c11');
  ctx.fillStyle = coat;
  ctx.strokeStyle = 'rgba(8, 7, 4, 0.75)';
  ctx.lineWidth = 0.55;
  ctx.beginPath();
  ctx.ellipse(-1.2, 0, 4.7, 4, 0, 0, TAU);
  ctx.fill();
  ctx.stroke();

  // Arms; the leading one holds a staff.
  ctx.fillStyle = '#4a3b26';
  for (const side of [-1, 1]) {
    ctx.beginPath();
    ctx.ellipse(1.5, side * 3, 2.6, 1.5, side * 0.25, 0, TAU);
    ctx.fill();
    ctx.stroke();
  }

  // Head with a leather cap.
  ctx.fillStyle = '#cb9c6e';
  ctx.beginPath();
  ctx.arc(1.2, 0, 2.7, 0, TAU);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = '#3a2c1a';
  ctx.beginPath();
  ctx.arc(1.2, 0, 2.7, Math.PI * 0.4, Math.PI * 1.6);
  ctx.fill();

  // Staff held across the body.
  ctx.strokeStyle = '#4a3520';
  ctx.lineWidth = 1.3;
  ctx.beginPath();
  ctx.moveTo(3.2, -5.4);
  ctx.lineTo(1.4, 5.2);
  ctx.stroke();

  ctx.restore();
}

/**
 * A war dog seen from above, pointing along +x. `gait` is distance travelled and
 * drives the leg cycle; `fighting` makes it lunge and bare its teeth.
 */
export function drawDog(
  ctx: CanvasRenderingContext2D,
  gait: number,
  fighting: boolean,
  coatLight = '#7d6549',
  coatDark = '#413425',
): void {
  const swing = Math.sin(gait * 0.42);
  const lunge = fighting ? Math.sin(performance.now() * 0.021) * 0.9 : 0;

  ctx.save();
  ctx.translate(lunge, 0);
  ctx.lineCap = 'round';

  ctx.fillStyle = 'rgba(0, 0, 0, 0.42)';
  ctx.beginPath();
  ctx.ellipse(0.6, 2.4, 7.4, 3.6, 0, 0, TAU);
  ctx.fill();

  // Legs, alternating front and back.
  ctx.strokeStyle = '#3c3026';
  ctx.lineWidth = 1.5;
  for (const [lx, phase] of [
    [3.4, 1],
    [-3, -1],
  ] as const) {
    for (const side of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(lx, side * 2);
      ctx.lineTo(lx + swing * phase * side * 1.9, side * 4.3);
      ctx.stroke();
    }
  }

  // Tail.
  ctx.strokeStyle = '#4a3b2c';
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.moveTo(-6.4, 0);
  ctx.quadraticCurveTo(-9.4, swing * 2.2, -11, swing * 3.6);
  ctx.stroke();

  // Body.
  const coat = ctx.createLinearGradient(-3, -3.5, 3, 3.5);
  coat.addColorStop(0, coatLight);
  coat.addColorStop(1, coatDark);
  ctx.fillStyle = coat;
  ctx.strokeStyle = 'rgba(12, 9, 6, 0.8)';
  ctx.lineWidth = 0.55;
  ctx.beginPath();
  ctx.ellipse(-0.6, 0, 6.6, 3.5, 0, 0, TAU);
  ctx.fill();
  ctx.stroke();

  // Head and muzzle.
  ctx.fillStyle = '#8a7052';
  ctx.beginPath();
  ctx.ellipse(6.4, 0, 3.3, 2.7, 0, 0, TAU);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = '#5f4c37';
  ctx.beginPath();
  ctx.ellipse(9.1, 0, 2.1, 1.4, 0, 0, TAU);
  ctx.fill();
  ctx.stroke();

  // Ears.
  ctx.fillStyle = '#4d3d2c';
  for (const side of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(4.6, side * 1.8);
    ctx.lineTo(3.6, side * 4.2);
    ctx.lineTo(6, side * 3);
    ctx.closePath();
    ctx.fill();
  }

  // Bared teeth while fighting.
  if (fighting) {
    ctx.fillStyle = '#f2eee4';
    ctx.beginPath();
    ctx.moveTo(10.9, -1);
    ctx.lineTo(10.9, 1);
    ctx.lineTo(9.6, 0);
    ctx.closePath();
    ctx.fill();
  }

  ctx.restore();
}

/**
 * The plain vanilla enemy: a rank-and-file pikeman in a gambeson and kettle
 * helm, pike couched and levelled forward — the thing actually hurting
 * whatever is holding him on the road.
 */
export function drawPikemanFigure(ctx: CanvasRenderingContext2D, gait: number, fighting: boolean): void {
  const swing = Math.sin(gait * 0.42);
  const jab = fighting ? Math.sin(performance.now() * 0.02) * 1.2 : 0;

  ctx.save();
  ctx.lineCap = 'round';

  ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
  ctx.beginPath();
  ctx.ellipse(0.6, 2, 5.6, 4.4, 0, 0, TAU);
  ctx.fill();

  // Legs.
  ctx.strokeStyle = '#382f22';
  ctx.lineWidth = 1.6;
  for (const side of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(-0.6, side * 1.7);
    ctx.lineTo(-0.6 + swing * side * 2, side * 3.8);
    ctx.stroke();
  }

  // Gambeson: quilted, padded cloth armour rather than mail or plate.
  const coat = ctx.createLinearGradient(-4, -4, 3, 4);
  coat.addColorStop(0, '#9c8a5c');
  coat.addColorStop(1, '#584a2c');
  ctx.fillStyle = coat;
  ctx.strokeStyle = 'rgba(20, 16, 8, 0.8)';
  ctx.lineWidth = 0.55;
  ctx.beginPath();
  ctx.ellipse(-0.8, 0, 4.3, 3.8, 0, 0, TAU);
  ctx.fill();
  ctx.stroke();

  // Quilting seams.
  ctx.strokeStyle = 'rgba(30, 24, 12, 0.4)';
  ctx.lineWidth = 0.4;
  for (const dx of [-2.4, -0.4, 1.6]) {
    ctx.beginPath();
    ctx.moveTo(dx, -3);
    ctx.lineTo(dx, 3);
    ctx.stroke();
  }

  // Kettle helm — light armour, nothing more.
  ctx.fillStyle = '#8a8f95';
  ctx.beginPath();
  ctx.arc(1, 0, 2.5, 0, TAU);
  ctx.fill();
  ctx.strokeStyle = 'rgba(18, 18, 20, 0.8)';
  ctx.lineWidth = 0.5;
  ctx.stroke();
  ctx.fillStyle = 'rgba(20, 16, 10, 0.55)';
  ctx.beginPath();
  ctx.ellipse(1.8, 0, 1, 2.1, 0, 0, TAU);
  ctx.fill();

  // The pike itself: couched at the hip and levelled forward. It jabs
  // slightly on its own rhythm while he is actually fighting.
  const reach = 12 + jab;
  ctx.strokeStyle = '#5c4527';
  ctx.lineWidth = 1.1;
  ctx.beginPath();
  ctx.moveTo(-2.6, 1.6);
  ctx.lineTo(reach - 2, -0.6);
  ctx.stroke();

  const head = ctx.createLinearGradient(reach - 3, 0, reach, 0);
  head.addColorStop(0, '#8d949c');
  head.addColorStop(1, '#e7ebef');
  ctx.fillStyle = head;
  ctx.beginPath();
  ctx.moveTo(reach, -0.6);
  ctx.lineTo(reach - 2.6, -1.6);
  ctx.lineTo(reach - 2.6, 0.4);
  ctx.closePath();
  ctx.fill();

  ctx.restore();
}

/**
 * A pikeman with a shield strapped to the off arm: the same pike and stance,
 * but a steel-rimmed kite shield covering him and a duller, mail-toned coat
 * to read as sturdier than the plain gambeson.
 */
export function drawShieldmanFigure(ctx: CanvasRenderingContext2D, gait: number, fighting: boolean): void {
  const swing = Math.sin(gait * 0.42);
  const jab = fighting ? Math.sin(performance.now() * 0.02) * 1.2 : 0;

  ctx.save();
  ctx.lineCap = 'round';

  ctx.fillStyle = 'rgba(0, 0, 0, 0.42)';
  ctx.beginPath();
  ctx.ellipse(0.6, 2, 6.1, 4.7, 0, 0, TAU);
  ctx.fill();

  // Legs.
  ctx.strokeStyle = '#33302e';
  ctx.lineWidth = 1.7;
  for (const side of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(-0.6, side * 1.8);
    ctx.lineTo(-0.6 + swing * side * 1.9, side * 4);
    ctx.stroke();
  }

  // Mail-toned coat — sturdier reading than the plain gambeson.
  const coat = ctx.createLinearGradient(-4, -4, 3, 4);
  coat.addColorStop(0, '#7c8290');
  coat.addColorStop(1, '#3b3f49');
  ctx.fillStyle = coat;
  ctx.strokeStyle = 'rgba(14, 15, 18, 0.8)';
  ctx.lineWidth = 0.55;
  ctx.beginPath();
  ctx.ellipse(-0.8, 0, 4.5, 4, 0, 0, TAU);
  ctx.fill();
  ctx.stroke();

  // Kite shield on the off arm, opposite the pike.
  ctx.save();
  ctx.translate(1.3, 3.4);
  ctx.rotate(0.25);
  const shield = ctx.createLinearGradient(-2.4, -3.2, 2.4, 3.2);
  shield.addColorStop(0, '#8a4a3a');
  shield.addColorStop(1, '#4a241a');
  ctx.fillStyle = shield;
  ctx.strokeStyle = 'rgba(20, 12, 8, 0.85)';
  ctx.lineWidth = 0.6;
  ctx.beginPath();
  ctx.moveTo(0, -3.4);
  ctx.quadraticCurveTo(2.6, -1.4, 2.2, 1.8);
  ctx.quadraticCurveTo(0, 4, -2.2, 1.8);
  ctx.quadraticCurveTo(-2.6, -1.4, 0, -3.4);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.strokeStyle = 'rgba(216, 201, 141, 0.6)';
  ctx.lineWidth = 0.5;
  ctx.beginPath();
  ctx.moveTo(0, -2.6);
  ctx.lineTo(0, 3);
  ctx.stroke();
  ctx.restore();

  // Kettle helm.
  ctx.fillStyle = '#8a8f95';
  ctx.beginPath();
  ctx.arc(1, 0, 2.6, 0, TAU);
  ctx.fill();
  ctx.strokeStyle = 'rgba(18, 18, 20, 0.8)';
  ctx.lineWidth = 0.5;
  ctx.stroke();
  ctx.fillStyle = 'rgba(20, 16, 10, 0.55)';
  ctx.beginPath();
  ctx.ellipse(1.9, 0, 1, 2.2, 0, 0, TAU);
  ctx.fill();

  // The pike, couched and levelled forward.
  const reach = 12 + jab;
  ctx.strokeStyle = '#5c4527';
  ctx.lineWidth = 1.1;
  ctx.beginPath();
  ctx.moveTo(-2.6, 1.6);
  ctx.lineTo(reach - 2, -0.6);
  ctx.stroke();

  const head = ctx.createLinearGradient(reach - 3, 0, reach, 0);
  head.addColorStop(0, '#8d949c');
  head.addColorStop(1, '#e7ebef');
  ctx.fillStyle = head;
  ctx.beginPath();
  ctx.moveTo(reach, -0.6);
  ctx.lineTo(reach - 2.6, -1.6);
  ctx.lineTo(reach - 2.6, 0.4);
  ctx.closePath();
  ctx.fill();

  ctx.restore();
}

/**
 * The weakest thing on the road: a levied peasant in his own clothes, no
 * armour, carrying whatever was in the barn — a pitchfork.
 */
export function drawPeasantFigure(ctx: CanvasRenderingContext2D, gait: number, fighting: boolean): void {
  const swing = Math.sin(gait * 0.46);
  const jab = fighting ? Math.sin(performance.now() * 0.024) * 1 : 0;

  ctx.save();
  ctx.lineCap = 'round';

  ctx.fillStyle = 'rgba(0, 0, 0, 0.38)';
  ctx.beginPath();
  ctx.ellipse(0.5, 1.7, 4.4, 3.6, 0, 0, TAU);
  ctx.fill();

  // Legs — bare, no greaves.
  ctx.strokeStyle = '#5c4a34';
  ctx.lineWidth = 1.3;
  for (const side of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(-0.5, side * 1.4);
    ctx.lineTo(-0.5 + swing * side * 1.8, side * 3.2);
    ctx.stroke();
  }

  // A roughspun tunic, not armour of any kind.
  const tunic = ctx.createLinearGradient(-3.4, -3.4, 2.4, 3.4);
  tunic.addColorStop(0, '#8a7a52');
  tunic.addColorStop(1, '#4a3f26');
  ctx.fillStyle = tunic;
  ctx.strokeStyle = 'rgba(20, 16, 8, 0.7)';
  ctx.lineWidth = 0.5;
  ctx.beginPath();
  ctx.ellipse(-0.6, 0, 3.4, 3, 0, 0, TAU);
  ctx.fill();
  ctx.stroke();

  // Bare head with a plain cap — no helmet.
  ctx.fillStyle = '#c99b6e';
  ctx.beginPath();
  ctx.arc(0.8, 0, 2.1, 0, TAU);
  ctx.fill();
  ctx.strokeStyle = 'rgba(20, 16, 8, 0.5)';
  ctx.lineWidth = 0.4;
  ctx.stroke();
  ctx.fillStyle = '#6b5636';
  ctx.beginPath();
  ctx.arc(0.8, 0, 2.1, Math.PI * 0.55, Math.PI * 1.5);
  ctx.fill();

  // The pitchfork: a plain shaft ending in three tines, not a proper spear.
  const reach = 9.5 + jab;
  ctx.strokeStyle = '#5c4527';
  ctx.lineWidth = 0.9;
  ctx.beginPath();
  ctx.moveTo(-2.2, 1.3);
  ctx.lineTo(reach - 1.4, -0.5);
  ctx.stroke();

  ctx.strokeStyle = '#aeb2b8';
  ctx.lineWidth = 0.8;
  for (const off of [-1.1, 0, 1.1]) {
    ctx.beginPath();
    ctx.moveTo(reach - 1.8, -0.5 + off * 0.5);
    ctx.lineTo(reach, -0.5 + off * 0.9);
    ctx.stroke();
  }

  ctx.restore();
}

/**
 * A knight in full plate, a warhammer couched and levelled forward. The
 * strongest common infantry on the road: bulkier stance than the pikeman,
 * a great helm rather than a kettle helm, and a hammer instead of a blade.
 */
export function drawKnightFigure(ctx: CanvasRenderingContext2D, gait: number, fighting: boolean): void {
  const swing = Math.sin(gait * 0.36);
  const jab = fighting ? Math.sin(performance.now() * 0.011) * 1.3 : 0;

  ctx.save();
  ctx.lineCap = 'round';

  ctx.fillStyle = 'rgba(0, 0, 0, 0.46)';
  ctx.beginPath();
  ctx.ellipse(0.7, 2.2, 6.6, 5.1, 0, 0, TAU);
  ctx.fill();

  // Legs — heavier and slower than the lighter infantry.
  ctx.strokeStyle = '#2c2c30';
  ctx.lineWidth = 2;
  for (const side of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(-0.7, side * 2);
    ctx.lineTo(-0.7 + swing * side * 1.6, side * 4.2);
    ctx.stroke();
  }

  // Cuirass: a full steel breastplate, not cloth or mail.
  const plate = ctx.createLinearGradient(-5, -5, 3.5, 5);
  plate.addColorStop(0, '#aab0ba');
  plate.addColorStop(0.5, '#6b7078');
  plate.addColorStop(1, '#33363c');
  ctx.fillStyle = plate;
  ctx.strokeStyle = 'rgba(10, 11, 13, 0.85)';
  ctx.lineWidth = 0.6;
  ctx.beginPath();
  ctx.ellipse(-0.9, 0, 4.9, 4.3, 0, 0, TAU);
  ctx.fill();
  ctx.stroke();

  // A central fuller line and rivets, so it reads as plate rather than cloth.
  ctx.strokeStyle = 'rgba(20, 22, 26, 0.4)';
  ctx.lineWidth = 0.4;
  ctx.beginPath();
  ctx.moveTo(-0.9, -3.6);
  ctx.lineTo(-0.9, 3.6);
  ctx.stroke();
  ctx.fillStyle = 'rgba(220, 224, 230, 0.55)';
  for (const [rx, ry] of [
    [-3, -2],
    [-3, 2],
    [1.4, -2.4],
    [1.4, 2.4],
  ] as const) {
    ctx.beginPath();
    ctx.arc(rx, ry, 0.4, 0, TAU);
    ctx.fill();
  }

  // Pauldrons on both shoulders.
  ctx.fillStyle = '#7a808a';
  ctx.strokeStyle = 'rgba(10, 11, 13, 0.8)';
  ctx.lineWidth = 0.5;
  for (const side of [-1, 1]) {
    ctx.beginPath();
    ctx.ellipse(0.4, side * 3.6, 2, 1.7, side * 0.3, 0, TAU);
    ctx.fill();
    ctx.stroke();
  }

  // Great helm — fully enclosed, just a T-slit rather than an open face.
  ctx.fillStyle = '#8a8f97';
  ctx.beginPath();
  ctx.arc(1.2, 0, 2.9, 0, TAU);
  ctx.fill();
  ctx.strokeStyle = 'rgba(14, 15, 18, 0.85)';
  ctx.lineWidth = 0.55;
  ctx.stroke();
  ctx.fillStyle = 'rgba(10, 9, 8, 0.85)';
  ctx.fillRect(2.2, -1.9, 1.4, 0.6);
  ctx.fillRect(2.6, -0.35, 1.6, 0.7);

  // The warhammer: couched at the hip, a blocky head levelled forward, with
  // a back-spike. It comes down slightly on each blow rather than jabbing.
  const reach = 10.5 + jab;
  const drop = fighting ? Math.abs(jab) * 0.3 : 0;
  ctx.strokeStyle = '#3c3226';
  ctx.lineWidth = 1.3;
  ctx.beginPath();
  ctx.moveTo(-2.8, 1.8);
  ctx.lineTo(reach - 2.6, -0.7 + drop);
  ctx.stroke();

  ctx.save();
  ctx.translate(reach - 2.2, -0.8 + drop);
  const head = ctx.createLinearGradient(-1.6, -1.8, 1.6, 1.8);
  head.addColorStop(0, '#9aa0a8');
  head.addColorStop(1, '#4c5058');
  ctx.fillStyle = head;
  ctx.strokeStyle = 'rgba(10, 11, 13, 0.85)';
  ctx.lineWidth = 0.5;
  ctx.beginPath();
  ctx.roundRect(-1.2, -2.1, 3.4, 2.6, 0.5);
  ctx.fill();
  ctx.stroke();
  // Back-spike.
  ctx.beginPath();
  ctx.moveTo(-1.2, -0.2);
  ctx.lineTo(-3, -0.2);
  ctx.lineTo(-1.2, 1.1);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.restore();

  ctx.restore();
}

/**
 * A knight in plate with a sword and a kite shield — heavy armour, tanky, the
 * counterpart to the warhammer knight but built for cutting rather than
 * crushing.
 */
export function drawSwordKnightFigure(ctx: CanvasRenderingContext2D, gait: number, fighting: boolean): void {
  const swing = Math.sin(gait * 0.36);
  const jab = fighting ? Math.sin(performance.now() * 0.013) * 1.1 : 0;

  ctx.save();
  ctx.lineCap = 'round';

  ctx.fillStyle = 'rgba(0, 0, 0, 0.45)';
  ctx.beginPath();
  ctx.ellipse(0.7, 2, 6.3, 4.8, 0, 0, TAU);
  ctx.fill();

  ctx.strokeStyle = '#2c2c30';
  ctx.lineWidth = 1.9;
  for (const side of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(-0.6, side * 1.9);
    ctx.lineTo(-0.6 + swing * side * 1.8, side * 4);
    ctx.stroke();
  }

  // Cuirass, same steel as the warhammer knight.
  const plate = ctx.createLinearGradient(-5, -5, 3.5, 5);
  plate.addColorStop(0, '#aab0ba');
  plate.addColorStop(0.5, '#6b7078');
  plate.addColorStop(1, '#33363c');
  ctx.fillStyle = plate;
  ctx.strokeStyle = 'rgba(10, 11, 13, 0.85)';
  ctx.lineWidth = 0.58;
  ctx.beginPath();
  ctx.ellipse(-0.9, 0, 4.7, 4.1, 0, 0, TAU);
  ctx.fill();
  ctx.stroke();

  // Kite shield on the off arm.
  ctx.save();
  ctx.translate(1.2, 3.3);
  ctx.rotate(0.22);
  const shield = ctx.createLinearGradient(-2.4, -3.2, 2.4, 3.2);
  shield.addColorStop(0, '#3d5a8a');
  shield.addColorStop(1, '#1c2c48');
  ctx.fillStyle = shield;
  ctx.strokeStyle = 'rgba(12, 14, 20, 0.85)';
  ctx.lineWidth = 0.6;
  ctx.beginPath();
  ctx.moveTo(0, -3.4);
  ctx.quadraticCurveTo(2.6, -1.4, 2.2, 1.8);
  ctx.quadraticCurveTo(0, 4, -2.2, 1.8);
  ctx.quadraticCurveTo(-2.6, -1.4, 0, -3.4);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = 'rgba(216, 201, 141, 0.7)';
  ctx.beginPath();
  ctx.arc(0, -0.4, 0.8, 0, TAU);
  ctx.fill();
  ctx.restore();

  // Great helm.
  ctx.fillStyle = '#8a8f97';
  ctx.beginPath();
  ctx.arc(1.2, 0, 2.8, 0, TAU);
  ctx.fill();
  ctx.strokeStyle = 'rgba(14, 15, 18, 0.85)';
  ctx.lineWidth = 0.55;
  ctx.stroke();
  ctx.fillStyle = 'rgba(10, 9, 8, 0.85)';
  ctx.fillRect(2.1, -1.8, 1.3, 0.55);
  ctx.fillRect(2.5, -0.3, 1.5, 0.65);

  // Sword: shorter reach than the pike/hammer, a proper broad blade.
  const reach = 8.4 + jab;
  ctx.strokeStyle = '#4a3520';
  ctx.lineWidth = 1.3;
  ctx.beginPath();
  ctx.moveTo(2.2, 1.9);
  ctx.lineTo(4.2, 1.6);
  ctx.stroke();
  ctx.strokeStyle = '#6b5a3a';
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.moveTo(4.4, 0.3);
  ctx.lineTo(4.4, 2.9);
  ctx.stroke();
  const blade = ctx.createLinearGradient(4.4, 0, reach, 0);
  blade.addColorStop(0, '#cfd4da');
  blade.addColorStop(1, '#8d949c');
  ctx.strokeStyle = blade;
  ctx.lineWidth = 1.9;
  ctx.beginPath();
  ctx.moveTo(4.4, 1.6);
  ctx.lineTo(reach, 1.6);
  ctx.stroke();

  ctx.restore();
}

/**
 * An unarmoured raider fast enough and vicious enough to matter despite the
 * lack of any armour: a hood, a main sword and a stabbing dagger in the off
 * hand, and a leaner build than the disciplined infantry.
 */
export function drawAssassinFigure(ctx: CanvasRenderingContext2D, gait: number, fighting: boolean): void {
  const swing = Math.sin(gait * 0.5);
  const jab = fighting ? Math.sin(performance.now() * 0.03) * 1.4 : 0;

  ctx.save();
  ctx.lineCap = 'round';

  ctx.fillStyle = 'rgba(0, 0, 0, 0.36)';
  ctx.beginPath();
  ctx.ellipse(0.5, 1.6, 4.3, 3.4, 0, 0, TAU);
  ctx.fill();

  ctx.strokeStyle = '#232023';
  ctx.lineWidth = 1.2;
  for (const side of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(-0.5, side * 1.4);
    ctx.lineTo(-0.5 + swing * side * 2.4, side * 3.4);
    ctx.stroke();
  }

  // Dark leathers, not armour — speed is the only protection.
  const leather = ctx.createLinearGradient(-3.2, -3.2, 2.2, 3.2);
  leather.addColorStop(0, '#3a3436');
  leather.addColorStop(1, '#141214');
  ctx.fillStyle = leather;
  ctx.strokeStyle = 'rgba(4, 4, 5, 0.8)';
  ctx.lineWidth = 0.45;
  ctx.beginPath();
  ctx.ellipse(-0.7, 0, 3.3, 2.9, 0, 0, TAU);
  ctx.fill();
  ctx.stroke();

  // Hood, drawn over the whole head — no face to see.
  ctx.fillStyle = '#1c191b';
  ctx.beginPath();
  ctx.arc(0.9, 0, 2.4, 0, TAU);
  ctx.fill();
  ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
  ctx.beginPath();
  ctx.ellipse(1.6, 0, 1.1, 1.5, 0, 0, TAU);
  ctx.fill();

  // Dagger in the off hand, held low and back.
  ctx.strokeStyle = '#7a7d82';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(-1.6, -2.6);
  ctx.lineTo(-3.6, -3.8);
  ctx.stroke();

  // Sword, quick and light — thinner than the knight's blade.
  const reach = 8.6 + jab;
  ctx.strokeStyle = '#4a3520';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(1.8, 2);
  ctx.lineTo(3.4, 1.8);
  ctx.stroke();
  const blade = ctx.createLinearGradient(3.6, 0, reach, 0);
  blade.addColorStop(0, '#d8dce2');
  blade.addColorStop(1, '#9aa0a8');
  ctx.strokeStyle = blade;
  ctx.lineWidth = 1.1;
  ctx.beginPath();
  ctx.moveTo(3.6, 1.8);
  ctx.lineTo(reach, 1.8);
  ctx.stroke();

  ctx.restore();
}

/**
 * A horse at a canter, drawn first so a rider can sit on top of it. Facing
 * +x, same convention as every other figure.
 */
function drawHorse(ctx: CanvasRenderingContext2D, gait: number, coatLight: string, coatDark: string): void {
  // A trot, with the legs in diagonal pairs. The cycle is deliberately slow:
  // driving it straight off distance travelled at anything like 1:1 gives a
  // blur of insect-fast twitching rather than a stride you can read.
  const phase = gait * 0.11;
  const pair = [Math.sin(phase), Math.sin(phase + Math.PI)];
  // The body rises and falls twice per stride, once for each diagonal.
  const bob = Math.sin(phase * 2) * 0.4;

  ctx.save();
  ctx.lineCap = 'round';

  ctx.fillStyle = 'rgba(0, 0, 0, 0.36)';
  ctx.beginPath();
  ctx.ellipse(0.5, 4, 11, 5, 0, 0, TAU);
  ctx.fill();

  ctx.translate(0, bob);

  // Legs. Front-left swings with rear-right and vice versa, so the horse
  // reads as trotting rather than paddling all four at once.
  for (const [lx, front] of [
    [6.4, true],
    [-6, false],
  ] as const) {
    for (const side of [-1, 1]) {
      // Diagonal pairing: front-left goes with rear-right.
      const swing = pair[(front ? 0 : 1) ^ (side < 0 ? 0 : 1)];
      const reach = front ? 3 : 2.6;
      const hoofX = lx + swing * reach;
      const hoofY = side * (6.2 - Math.max(0, swing) * 1.1);

      ctx.strokeStyle = coatDark;
      ctx.lineWidth = 1.9;
      ctx.beginPath();
      ctx.moveTo(lx, side * 2.4);
      ctx.lineTo(hoofX, hoofY);
      ctx.stroke();

      // Hoof, so the end of the leg has some weight to it.
      ctx.fillStyle = '#1e1912';
      ctx.beginPath();
      ctx.arc(hoofX, hoofY, 0.85, 0, TAU);
      ctx.fill();
    }
  }

  // Barrel body.
  const body = ctx.createLinearGradient(-9, -4.4, 8, 4.4);
  body.addColorStop(0, coatLight);
  body.addColorStop(1, coatDark);
  ctx.fillStyle = body;
  ctx.strokeStyle = 'rgba(10, 8, 6, 0.7)';
  ctx.lineWidth = 0.6;
  ctx.beginPath();
  ctx.ellipse(-1, 0, 9.6, 4.5, 0, 0, TAU);
  ctx.fill();
  ctx.stroke();

  // Neck and head, reaching forward and down. The head nods gently with the
  // stride, which does more to sell the gait than the legs alone.
  const nod = Math.sin(phase) * 0.5;
  ctx.fillStyle = coatDark;
  ctx.beginPath();
  ctx.ellipse(9, -1.6 + nod, 3.7, 2.1, -0.35, 0, TAU);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(12.6, -2.7 + nod * 1.6, 2.2, 1.35, -0.2, 0, TAU);
  ctx.fill();

  // Mane.
  ctx.strokeStyle = '#241d16';
  ctx.lineWidth = 1.15;
  ctx.beginPath();
  ctx.moveTo(6.4, -3.3);
  ctx.quadraticCurveTo(9, -4.8 + nod, 11.2, -4.1 + nod * 1.4);
  ctx.stroke();

  // Tail, swaying opposite the head.
  ctx.beginPath();
  ctx.moveTo(-9.6, 0);
  ctx.quadraticCurveTo(-12.4, -nod * 1.4, -13.8, 1.8 - nod * 2.2);
  ctx.stroke();

  ctx.restore();
}

/**
 * A light rider on a fast horse, lance couched. Quick, and tougher than a
 * foot soldier of the same armour weight thanks to the horse under him.
 */
export function drawLanceRiderFigure(ctx: CanvasRenderingContext2D, gait: number, fighting: boolean): void {
  const jab = fighting ? Math.sin(performance.now() * 0.016) * 1.5 : 0;

  ctx.save();
  drawHorse(ctx, gait, '#a9895c', '#5c4526');

  // Rider, sitting forward on the horse's back.
  ctx.save();
  ctx.translate(-0.5, -3.6);
  ctx.lineCap = 'round';

  const tunic = ctx.createLinearGradient(-2.6, -2.6, 2, 2.6);
  tunic.addColorStop(0, '#7a6a3c');
  tunic.addColorStop(1, '#3a3018');
  ctx.fillStyle = tunic;
  ctx.strokeStyle = 'rgba(16, 12, 6, 0.75)';
  ctx.lineWidth = 0.5;
  ctx.beginPath();
  ctx.ellipse(-0.6, 0, 3.2, 2.8, 0, 0, TAU);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = '#8a8f95';
  ctx.beginPath();
  ctx.arc(1, -0.2, 2.2, 0, TAU);
  ctx.fill();
  ctx.strokeStyle = 'rgba(18, 18, 20, 0.8)';
  ctx.lineWidth = 0.5;
  ctx.stroke();

  // The lance: much the longest reach of anything on foot, couched under the arm.
  const reach = 19 + jab;
  ctx.strokeStyle = '#5c4527';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(-4.4, 1.4);
  ctx.lineTo(reach - 2.4, -1.2);
  ctx.stroke();
  ctx.fillStyle = '#c7ccd2';
  ctx.beginPath();
  ctx.moveTo(reach - 2.4, -1.2);
  ctx.lineTo(reach, -1.35);
  ctx.lineTo(reach - 2.8, -0.15);
  ctx.closePath();
  ctx.fill();

  ctx.restore();
  ctx.restore();
}

/**
 * A knight's build, mounted rather than on foot: the tankiest thing on the
 * road, but the weight goes into the horse and its own bulk rather than
 * plate, so it fights at medium armour.
 */
export function drawMountedKnightFigure(ctx: CanvasRenderingContext2D, gait: number, fighting: boolean): void {
  const swingArc = fighting ? Math.sin(performance.now() * 0.011) * 0.6 : 0;

  ctx.save();
  drawHorse(ctx, gait, '#5c5a58', '#262524');

  // Barding over the horse's shoulders.
  ctx.fillStyle = 'rgba(80, 40, 36, 0.85)';
  ctx.beginPath();
  ctx.ellipse(6, -0.4, 3.6, 3, -0.2, 0, TAU);
  ctx.fill();

  ctx.save();
  ctx.translate(-0.5, -3.8);
  ctx.lineCap = 'round';

  const mail = ctx.createLinearGradient(-2.8, -2.8, 2.2, 2.8);
  mail.addColorStop(0, '#8b8f97');
  mail.addColorStop(1, '#3b3f46');
  ctx.fillStyle = mail;
  ctx.strokeStyle = 'rgba(10, 11, 13, 0.8)';
  ctx.lineWidth = 0.55;
  ctx.beginPath();
  ctx.ellipse(-0.7, 0, 3.5, 3, 0, 0, TAU);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = '#9aa0a8';
  ctx.beginPath();
  ctx.arc(1, 0, 2.4, 0, TAU);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = '#4a4f57';
  ctx.beginPath();
  ctx.arc(1, 0, 2.4, Math.PI * 0.4, Math.PI * 1.6);
  ctx.fill();

  // Sword, swung side to side just like the swordsman's — the sabre of a horseman.
  const reach = 8;
  ctx.save();
  ctx.rotate(swingArc);
  ctx.strokeStyle = '#4a3520';
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.moveTo(2, 2.2);
  ctx.lineTo(3.6, 1.9);
  ctx.stroke();
  const blade = ctx.createLinearGradient(3.6, 0, reach, 0);
  blade.addColorStop(0, '#cfd4da');
  blade.addColorStop(1, '#8d949c');
  ctx.strokeStyle = blade;
  ctx.lineWidth = 1.3;
  ctx.beginPath();
  ctx.moveTo(3.6, 1.9);
  ctx.lineTo(reach, 1.9);
  ctx.stroke();
  ctx.restore();

  ctx.restore();
  ctx.restore();
}

/**
 * An enemy bowman. Unarmoured, a quiver at the hip, and the bow drawn across
 * the body — he is stationary and shooting far more often than he is walking,
 * so the drawn pose is the one that matters.
 */
export function drawBowmanFigure(ctx: CanvasRenderingContext2D, gait: number, fighting: boolean): void {
  const swing = Math.sin(gait * 0.44);
  // `fighting` is set while he has halted to loose; the draw cycles as he does.
  const draw = fighting ? (Math.sin(performance.now() * 0.006) + 1) * 0.5 : 0.15;

  ctx.save();
  ctx.lineCap = 'round';

  ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
  ctx.beginPath();
  ctx.ellipse(0.5, 1.9, 5.2, 4.2, 0, 0, TAU);
  ctx.fill();

  ctx.strokeStyle = '#3a3524';
  ctx.lineWidth = 1.5;
  for (const side of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(-0.6, side * 1.6);
    ctx.lineTo(-0.6 + swing * side * 1.9, side * 3.6);
    ctx.stroke();
  }

  // Rough woollen tunic, green-brown.
  const tunic = ctx.createLinearGradient(-3.6, -3.6, 2.6, 3.6);
  tunic.addColorStop(0, '#8a9459');
  tunic.addColorStop(1, '#414a25');
  ctx.fillStyle = tunic;
  ctx.strokeStyle = 'rgba(18, 20, 10, 0.8)';
  ctx.lineWidth = 0.5;
  ctx.beginPath();
  ctx.ellipse(-0.7, 0, 3.9, 3.4, 0, 0, TAU);
  ctx.fill();
  ctx.stroke();

  // Quiver slung across his back, arrows showing.
  ctx.strokeStyle = '#5a4326';
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.moveTo(-3.4, -2.4);
  ctx.lineTo(-1.4, 2.8);
  ctx.stroke();
  ctx.strokeStyle = '#d8d2c0';
  ctx.lineWidth = 0.4;
  for (const o of [-0.6, 0, 0.6]) {
    ctx.beginPath();
    ctx.moveTo(-3.6 + o * 0.4, -2.8 + o);
    ctx.lineTo(-4.6 + o * 0.4, -3.9 + o);
    ctx.stroke();
  }

  // Bare head, a hood pushed back.
  ctx.fillStyle = '#c8a682';
  ctx.beginPath();
  ctx.arc(0.9, 0, 2.2, 0, TAU);
  ctx.fill();
  ctx.strokeStyle = 'rgba(20, 16, 10, 0.7)';
  ctx.lineWidth = 0.45;
  ctx.stroke();

  // The bow, held across the front, string drawn back by however much.
  const bowX = 3.4;
  ctx.strokeStyle = '#6b4f2c';
  ctx.lineWidth = 0.8;
  ctx.beginPath();
  ctx.arc(bowX - 2.6, 0, 4.4, -1.0, 1.0);
  ctx.stroke();

  ctx.strokeStyle = 'rgba(235, 230, 214, 0.85)';
  ctx.lineWidth = 0.3;
  const nock = bowX - 2.6 + 4.4 * Math.cos(1.0);
  ctx.beginPath();
  ctx.moveTo(nock, -3.7);
  ctx.lineTo(nock - draw * 2.6, 0);
  ctx.lineTo(nock, 3.7);
  ctx.stroke();

  // The arrow on the string.
  ctx.strokeStyle = '#8a7350';
  ctx.lineWidth = 0.45;
  ctx.beginPath();
  ctx.moveTo(nock - draw * 2.6, 0);
  ctx.lineTo(nock + 4.5, 0);
  ctx.stroke();
  ctx.fillStyle = '#d5dae0';
  ctx.beginPath();
  ctx.moveTo(nock + 5.4, 0);
  ctx.lineTo(nock + 4.1, -0.7);
  ctx.lineTo(nock + 4.1, 0.7);
  ctx.closePath();
  ctx.fill();

  ctx.restore();
}

/**
 * A slinger. Light armour, a sack of stones at the belt, and the sling itself
 * whirled overhead — drawn as an arc above him, which reads from directly
 * above far better than a taut line would.
 */
export function drawStoneSlingerFigure(
  ctx: CanvasRenderingContext2D,
  gait: number,
  fighting: boolean,
): void {
  const swing = Math.sin(gait * 0.44);
  const whirl = fighting ? performance.now() * 0.011 : gait * 0.05;

  ctx.save();
  ctx.lineCap = 'round';

  ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
  ctx.beginPath();
  ctx.ellipse(0.5, 1.9, 5.2, 4.2, 0, 0, TAU);
  ctx.fill();

  ctx.strokeStyle = '#3a3020';
  ctx.lineWidth = 1.55;
  for (const side of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(-0.6, side * 1.7);
    ctx.lineTo(-0.6 + swing * side * 1.9, side * 3.7);
    ctx.stroke();
  }

  // Boiled-leather jerkin.
  const jerkin = ctx.createLinearGradient(-3.8, -3.8, 2.6, 3.8);
  jerkin.addColorStop(0, '#9c8768');
  jerkin.addColorStop(1, '#4a3d29');
  ctx.fillStyle = jerkin;
  ctx.strokeStyle = 'rgba(22, 17, 10, 0.8)';
  ctx.lineWidth = 0.5;
  ctx.beginPath();
  ctx.ellipse(-0.7, 0, 4, 3.5, 0, 0, TAU);
  ctx.fill();
  ctx.stroke();

  // The sack of stones on his hip.
  ctx.fillStyle = '#6b5b45';
  ctx.beginPath();
  ctx.ellipse(-2.6, 2.9, 1.7, 1.4, 0.3, 0, TAU);
  ctx.fill();
  ctx.strokeStyle = 'rgba(24, 18, 10, 0.7)';
  ctx.lineWidth = 0.4;
  ctx.stroke();

  // A simple leather cap.
  ctx.fillStyle = '#7b6446';
  ctx.beginPath();
  ctx.arc(0.9, 0, 2.2, 0, TAU);
  ctx.fill();
  ctx.strokeStyle = 'rgba(20, 16, 10, 0.75)';
  ctx.lineWidth = 0.45;
  ctx.stroke();

  // The sling, whirling overhead — an arc with the stone at its end. Drawn
  // boldly on purpose: at a thin, faint stroke the whole figure read as a
  // brown smudge with nothing to say what it was.
  ctx.strokeStyle = 'rgba(240, 232, 208, 0.9)';
  ctx.lineWidth = 0.75;
  ctx.beginPath();
  ctx.arc(1.4, 0, 6.2, whirl, whirl + Math.PI * 1.35);
  ctx.stroke();

  const sx = 1.4 + Math.cos(whirl + Math.PI * 1.35) * 6.2;
  const sy = Math.sin(whirl + Math.PI * 1.35) * 6.2;
  const stone = ctx.createRadialGradient(sx - 0.5, sy - 0.5, 0.2, sx, sy, 1.8);
  stone.addColorStop(0, '#a9a094');
  stone.addColorStop(1, '#4c463d');
  ctx.fillStyle = stone;
  ctx.beginPath();
  ctx.arc(sx, sy, 1.7, 0, TAU);
  ctx.fill();
  ctx.strokeStyle = 'rgba(20, 18, 14, 0.85)';
  ctx.lineWidth = 0.4;
  ctx.stroke();

  ctx.restore();
}

/**
 * The Morningstar Knight: the campaign's boss. Full black harness, half again
 * the bulk of an ordinary knight, and a spiked ball on a chain that he swings
 * in a full circle around himself.
 *
 * `fighting` is unused — he never duels anybody. The flail turns on its own
 * timer whatever else is happening, which is exactly what makes him frightening.
 */
export function drawFlailKnightFigure(ctx: CanvasRenderingContext2D, gait: number): void {
  const stride = Math.sin(gait * 0.3);
  const whirl = performance.now() * 0.004;

  ctx.save();
  ctx.lineCap = 'round';

  ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
  ctx.beginPath();
  ctx.ellipse(0.8, 2.6, 8.2, 6.4, 0, 0, TAU);
  ctx.fill();

  // Heavy legs, greaved.
  ctx.strokeStyle = '#25232a';
  ctx.lineWidth = 2.5;
  for (const side of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(-0.8, side * 2.4);
    ctx.lineTo(-0.8 + stride * side * 1.7, side * 5.1);
    ctx.stroke();
  }

  // Blackened cuirass with a dull sheen.
  const plate = ctx.createLinearGradient(-6, -6, 4, 6);
  plate.addColorStop(0, '#767282');
  plate.addColorStop(0.5, '#403d49');
  plate.addColorStop(1, '#1d1b22');
  ctx.fillStyle = plate;
  ctx.strokeStyle = 'rgba(8, 7, 10, 0.9)';
  ctx.lineWidth = 0.75;
  ctx.beginPath();
  ctx.ellipse(-1, 0, 6.1, 5.3, 0, 0, TAU);
  ctx.fill();
  ctx.stroke();

  // Heavy pauldrons.
  ctx.fillStyle = '#54505e';
  ctx.strokeStyle = 'rgba(8, 7, 10, 0.85)';
  ctx.lineWidth = 0.6;
  for (const side of [-1, 1]) {
    ctx.beginPath();
    ctx.ellipse(0.4, side * 4.4, 2.6, 2.2, side * 0.3, 0, TAU);
    ctx.fill();
    ctx.stroke();
  }

  // Great helm, with a crimson plume so he reads as somebody in particular.
  ctx.fillStyle = '#6d6979';
  ctx.beginPath();
  ctx.arc(1.5, 0, 3.5, 0, TAU);
  ctx.fill();
  ctx.strokeStyle = 'rgba(8, 7, 10, 0.9)';
  ctx.lineWidth = 0.6;
  ctx.stroke();
  ctx.fillStyle = 'rgba(6, 5, 6, 0.9)';
  ctx.fillRect(2.7, -2.2, 1.7, 0.7);
  ctx.fillRect(3.1, -0.4, 1.9, 0.8);
  ctx.fillStyle = '#8e2b2b';
  ctx.beginPath();
  ctx.ellipse(-0.4, 0, 1.1, 3, 0, 0, TAU);
  ctx.fill();

  // The morning star: a chain out to a spiked ball, going round and round.
  const armX = 1 + Math.cos(whirl) * 12.5;
  const armY = Math.sin(whirl) * 12.5;
  ctx.strokeStyle = 'rgba(150, 148, 158, 0.85)';
  ctx.lineWidth = 0.75;
  ctx.setLineDash([1.1, 1]);
  ctx.beginPath();
  ctx.moveTo(1, 0);
  ctx.lineTo(armX, armY);
  ctx.stroke();
  ctx.setLineDash([]);

  const ball = ctx.createRadialGradient(armX - 1, armY - 1, 0.4, armX, armY, 3);
  ball.addColorStop(0, '#8d8a96');
  ball.addColorStop(1, '#2a2830');
  ctx.fillStyle = ball;
  ctx.beginPath();
  ctx.arc(armX, armY, 2.6, 0, TAU);
  ctx.fill();
  ctx.strokeStyle = 'rgba(8, 7, 10, 0.9)';
  ctx.lineWidth = 0.5;
  ctx.stroke();

  // Spikes around the ball.
  ctx.strokeStyle = '#b9b6c2';
  ctx.lineWidth = 0.8;
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * TAU + whirl;
    ctx.beginPath();
    ctx.moveTo(armX + Math.cos(a) * 2.3, armY + Math.sin(a) * 2.3);
    ctx.lineTo(armX + Math.cos(a) * 4, armY + Math.sin(a) * 4);
    ctx.stroke();
  }

  ctx.restore();
}

/**
 * A ragged raider — no armour at all, twin curved blades, and a lean,
 * forward-leaning gait faster than any foot soldier's.
 */
export function drawMarauderFigure(ctx: CanvasRenderingContext2D, gait: number, fighting: boolean): void {
  const swing = Math.sin(gait * 0.56);
  const jab = fighting ? Math.sin(performance.now() * 0.032) * 1.3 : 0;

  ctx.save();
  ctx.lineCap = 'round';
  // Leans into the run.
  ctx.rotate(0.12);

  ctx.fillStyle = 'rgba(0, 0, 0, 0.36)';
  ctx.beginPath();
  ctx.ellipse(0.6, 1.6, 4.6, 3.4, 0, 0, TAU);
  ctx.fill();

  ctx.strokeStyle = '#4a3324';
  ctx.lineWidth = 1.3;
  for (const side of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(-0.5, side * 1.4);
    ctx.lineTo(-0.5 + swing * side * 2.8, side * 3.6);
    ctx.stroke();
  }

  // Furs and hide, not cloth or metal.
  const hide = ctx.createLinearGradient(-3.2, -3.4, 2.4, 3.4);
  hide.addColorStop(0, '#7a5a3a');
  hide.addColorStop(1, '#382718');
  ctx.fillStyle = hide;
  ctx.strokeStyle = 'rgba(18, 12, 6, 0.75)';
  ctx.lineWidth = 0.5;
  ctx.beginPath();
  ctx.ellipse(-0.6, 0, 3.5, 3, 0, 0, TAU);
  ctx.fill();
  ctx.stroke();

  // Wild hair, no helmet.
  ctx.fillStyle = '#caa06e';
  ctx.beginPath();
  ctx.arc(1, 0, 2.3, 0, TAU);
  ctx.fill();
  ctx.strokeStyle = 'rgba(18, 12, 6, 0.5)';
  ctx.lineWidth = 0.4;
  ctx.stroke();
  ctx.fillStyle = '#4a3018';
  for (let i = -1; i <= 1; i++) {
    ctx.beginPath();
    ctx.moveTo(0.3 + i * 0.7, -1.6);
    ctx.lineTo(-0.6 + i * 0.9, -3.2 - Math.abs(i) * 0.6);
    ctx.lineTo(1 + i * 0.7, -1.4);
    ctx.closePath();
    ctx.fill();
  }

  // Twin curved blades, one held back and one leading.
  for (const [ox, oy, len, backhand] of [
    [1.6, 2.4, 7.4, false],
    [-1.8, -1.8, 5, true],
  ] as const) {
    const reach = len + (backhand ? 0 : jab);
    ctx.strokeStyle = '#6b5a3a';
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.moveTo(ox, oy);
    ctx.lineTo(ox + Math.cos(backhand ? -2.3 : 0.15) * 1.6, oy + Math.sin(backhand ? -2.3 : 0.15) * 1.6);
    ctx.stroke();
    const blade = ctx.createLinearGradient(ox, oy, ox + reach, oy);
    blade.addColorStop(0, '#c7ccd2');
    blade.addColorStop(1, '#8d949c');
    ctx.strokeStyle = blade;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(ox, oy);
    ctx.quadraticCurveTo(ox + reach * 0.6, oy - 1.6, ox + reach, oy - 0.6);
    ctx.stroke();
  }

  ctx.restore();
}

/**
 * A battering ram: a peaked timber mantlet on wheels with an iron-capped
 * beam projecting from the front. It is a moving shield, not a fighter — no
 * weapon is drawn because it has none.
 */
export function drawRamFigure(ctx: CanvasRenderingContext2D): void {
  ctx.save();
  ctx.lineCap = 'round';

  ctx.fillStyle = 'rgba(0, 0, 0, 0.45)';
  ctx.beginPath();
  ctx.ellipse(1, 2.6, 12, 7, 0, 0, TAU);
  ctx.fill();

  // Wheels at the four corners.
  ctx.fillStyle = '#241c10';
  for (const [wx, wy] of [
    [-6, -6.6],
    [-6, 6.6],
    [5, -6.6],
    [5, 6.6],
  ] as const) {
    ctx.beginPath();
    ctx.arc(wx, wy, 2.1, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = 'rgba(70, 52, 28, 0.8)';
    ctx.lineWidth = 0.5;
    ctx.stroke();
  }

  // The shelter: a peaked roof of timber over the frame, seen from above.
  const roof = ctx.createLinearGradient(-9, -8, 9, 8);
  roof.addColorStop(0, '#7a5a34');
  roof.addColorStop(1, '#40301a');
  ctx.fillStyle = roof;
  ctx.strokeStyle = 'rgba(18, 12, 6, 0.85)';
  ctx.lineWidth = 0.8;
  ctx.beginPath();
  ctx.roundRect(-9, -7, 16, 14, 2);
  ctx.fill();
  ctx.stroke();

  // Ridge line and planking.
  ctx.strokeStyle = 'rgba(24, 16, 8, 0.5)';
  ctx.lineWidth = 0.6;
  ctx.beginPath();
  ctx.moveTo(-9, 0);
  ctx.lineTo(7, 0);
  ctx.stroke();
  for (let x = -8; x < 6; x += 2.6) {
    ctx.beginPath();
    ctx.moveTo(x, -7);
    ctx.lineTo(x, 7);
    ctx.stroke();
  }

  // Iron bands strapping the timber together.
  ctx.strokeStyle = 'rgba(60, 62, 68, 0.85)';
  ctx.lineWidth = 1.1;
  for (const x of [-6, 0, 5]) {
    ctx.beginPath();
    ctx.moveTo(x, -7.4);
    ctx.lineTo(x, 7.4);
    ctx.stroke();
  }

  // The ram beam itself, projecting from the front, capped in iron.
  ctx.strokeStyle = '#4a3520';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(6, 0);
  ctx.lineTo(13, 0);
  ctx.stroke();

  const head = ctx.createLinearGradient(11, -2.4, 16, 2.4);
  head.addColorStop(0, '#7a7e86');
  head.addColorStop(1, '#3a3c42');
  ctx.fillStyle = head;
  ctx.strokeStyle = 'rgba(12, 12, 14, 0.85)';
  ctx.lineWidth = 0.6;
  ctx.beginPath();
  ctx.moveTo(11.4, -2.6);
  ctx.lineTo(16.4, 0);
  ctx.lineTo(11.4, 2.6);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  ctx.restore();
}

// ------------------------------------------------------------- scholars' hall

/**
 * A university quadrangle: four tiled ranges around a cloister garden, with a
 * turret on each corner and a domed library over the gatehouse. Seen from
 * directly above, so it reads through roofs, ridges and courtyard rather than
 * facades.
 */
export function makeResearchSprite(def: TowerDef): Sprite {
  const r = def.radius;
  const { sprite, ctx } = createSprite(r * 2.9);
  const rand = mulberry32(0x5c401a);

  groundShadow(ctx, r);

  const outer = r * 0.92;
  const inner = r * 0.4;

  /** Tiled roof fill for a range running along the given axis. */
  const tiles = (x: number, y: number, w: number, h: number, along: 'x' | 'y') => {
    ctx.save();
    ctx.beginPath();
    ctx.rect(x, y, w, h);
    ctx.clip();

    const grad =
      along === 'x'
        ? ctx.createLinearGradient(0, y, 0, y + h)
        : ctx.createLinearGradient(x, 0, x + w, 0);
    // Slate laid over dressed stone: cool greys, no terracotta.
    grad.addColorStop(0, '#4b4e54');
    grad.addColorStop(0.47, '#868c94');
    grad.addColorStop(0.53, '#5e636b');
    grad.addColorStop(1, '#383b40');
    ctx.fillStyle = grad;
    ctx.fillRect(x, y, w, h);

    // Slate courses across the slope.
    ctx.strokeStyle = 'rgba(22, 24, 27, 0.34)';
    ctx.lineWidth = r * 0.028;
    if (along === 'x') {
      for (let t = x; t < x + w; t += r * 0.135) {
        ctx.beginPath();
        ctx.moveTo(t, y);
        ctx.lineTo(t, y + h);
        ctx.stroke();
      }
    } else {
      for (let t = y; t < y + h; t += r * 0.135) {
        ctx.beginPath();
        ctx.moveTo(x, t);
        ctx.lineTo(x + w, t);
        ctx.stroke();
      }
    }
    ctx.restore();

    // Ridge down the middle of the range.
    ctx.strokeStyle = 'rgba(18, 20, 23, 0.6)';
    ctx.lineWidth = r * 0.05;
    ctx.beginPath();
    if (along === 'x') {
      ctx.moveTo(x, y + h / 2);
      ctx.lineTo(x + w, y + h / 2);
    } else {
      ctx.moveTo(x + w / 2, y);
      ctx.lineTo(x + w / 2, y + h);
    }
    ctx.stroke();
  };

  // Courtyard: paving with a lawn and a well in the middle.
  ctx.fillStyle = '#8d8577';
  ctx.beginPath();
  ctx.rect(-inner, -inner, inner * 2, inner * 2);
  ctx.fill();
  ctx.fillStyle = '#5c6f3c';
  ctx.beginPath();
  ctx.roundRect(-inner * 0.68, -inner * 0.68, inner * 1.36, inner * 1.36, r * 0.06);
  ctx.fill();
  ctx.fillStyle = '#6b645a';
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.1, 0, TAU);
  ctx.fill();
  ctx.strokeStyle = 'rgba(20, 16, 11, 0.7)';
  ctx.lineWidth = r * 0.035;
  ctx.stroke();

  // The four ranges around it.
  const band = outer - inner;
  tiles(-outer, -outer, outer * 2, band, 'y'); // north
  tiles(-outer, inner, outer * 2, band, 'y'); // south
  tiles(-outer, -inner, band, inner * 2, 'x'); // west
  tiles(inner, -inner, band, inner * 2, 'x'); // east

  // Outer wall line.
  ctx.strokeStyle = 'rgba(24, 18, 12, 0.85)';
  ctx.lineWidth = r * 0.06;
  ctx.strokeRect(-outer, -outer, outer * 2, outer * 2);

  // Corner turrets with conical roofs.
  for (const sx of [-1, 1]) {
    for (const sy of [-1, 1]) {
      const cx = sx * outer;
      const cy = sy * outer;

      ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
      ctx.beginPath();
      ctx.arc(cx + r * 0.05, cy + r * 0.07, r * 0.24, 0, TAU);
      ctx.fill();

      ctx.fillStyle = '#8a8275';
      ctx.strokeStyle = 'rgba(24, 18, 12, 0.85)';
      ctx.lineWidth = r * 0.045;
      ctx.beginPath();
      ctx.arc(cx, cy, r * 0.22, 0, TAU);
      ctx.fill();
      ctx.stroke();

      // Cone read as radial segments, lit from the upper left.
      for (let i = 0; i < 10; i++) {
        const a0 = (i / 10) * TAU;
        const lit = lightAt(a0 + Math.PI / 10);
        ctx.fillStyle = mix('#3a3d43', '#a3a9b1', lit);
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.arc(cx, cy, r * 0.2, a0, a0 + TAU / 10);
        ctx.closePath();
        ctx.fill();
      }
      ctx.fillStyle = '#3b2318';
      ctx.beginPath();
      ctx.arc(cx, cy, r * 0.045, 0, TAU);
      ctx.fill();
    }
  }

  // Domed library over the gatehouse on the west range.
  const dx = -outer + band / 2;
  ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
  ctx.beginPath();
  ctx.arc(dx + r * 0.05, r * 0.06, r * 0.3, 0, TAU);
  ctx.fill();

  // Lead-covered dome over the library, still stone-grey rather than copper.
  const dome = ctx.createRadialGradient(dx - r * 0.11, -r * 0.12, r * 0.03, dx, 0, r * 0.28);
  dome.addColorStop(0, '#b6bcc4');
  dome.addColorStop(0.6, '#767d86');
  dome.addColorStop(1, '#41464c');
  ctx.fillStyle = dome;
  ctx.strokeStyle = 'rgba(22, 25, 29, 0.85)';
  ctx.lineWidth = r * 0.045;
  ctx.beginPath();
  ctx.arc(dx, 0, r * 0.28, 0, TAU);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = '#d8c98d';
  ctx.beginPath();
  ctx.arc(dx, 0, r * 0.06, 0, TAU);
  ctx.fill();

  // Weathering so the roofs are not flat colour.
  ctx.save();
  ctx.beginPath();
  ctx.rect(-outer, -outer, outer * 2, outer * 2);
  ctx.clip();
  for (let i = 0; i < 40; i++) {
    ctx.fillStyle = rand() < 0.5 ? 'rgba(30, 18, 12, 0.16)' : 'rgba(226, 208, 180, 0.1)';
    ctx.beginPath();
    ctx.ellipse(
      -outer + rand() * outer * 2,
      -outer + rand() * outer * 2,
      r * (0.04 + rand() * 0.09),
      r * (0.03 + rand() * 0.07),
      rand() * TAU,
      0,
      TAU,
    );
    ctx.fill();
  }
  ctx.restore();

  return sprite;
}

/** Ground set alight by a fire stone. `age` runs 0 to 1 as it burns out. */
export function drawFireField(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  radius: number,
  age: number,
): void {
  const fade = 1 - age;
  const now = performance.now();
  const flicker = 0.85 + Math.sin(now * 0.012 + x * 0.3) * 0.15;

  // Scorched earth stays dark and lingers as the fire dies down.
  const scorch = ctx.createRadialGradient(x, y, radius * 0.1, x, y, radius);
  scorch.addColorStop(0, `rgba(32, 20, 12, ${0.5 * (0.45 + fade * 0.55)})`);
  scorch.addColorStop(0.7, `rgba(32, 20, 12, ${0.28 * (0.45 + fade * 0.55)})`);
  scorch.addColorStop(1, 'rgba(32, 20, 12, 0)');
  ctx.fillStyle = scorch;
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, TAU);
  ctx.fill();

  // Flame is additive so overlapping embers brighten instead of stacking as
  // opaque blobs.
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';

  const glow = ctx.createRadialGradient(x, y, radius * 0.05, x, y, radius * 0.85);
  glow.addColorStop(0, `rgba(196, 92, 26, ${0.5 * fade * flicker})`);
  glow.addColorStop(0.45, `rgba(150, 58, 14, ${0.28 * fade * flicker})`);
  glow.addColorStop(1, 'rgba(90, 26, 6, 0)');
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(x, y, radius * 0.85, 0, TAU);
  ctx.fill();

  // Small embers drifting around inside the patch.
  const embers = 10;
  for (let i = 0; i < embers; i++) {
    const a = (i / embers) * TAU + now * 0.0007 + i;
    const wobble = (Math.sin(now * 0.005 + i * 2.1) + 1) / 2;
    const d = radius * (0.15 + wobble * 0.6);
    const s = radius * 0.055 * fade * (0.6 + wobble * 0.6);
    ctx.fillStyle = `rgba(226, ${104 + Math.round(70 * wobble)}, 34, ${0.34 * fade})`;
    ctx.beginPath();
    ctx.ellipse(x + Math.cos(a) * d, y + Math.sin(a) * d, s * 0.75, s, a, 0, TAU);
    ctx.fill();
  }
  ctx.restore();
}

// ------------------------------------------------------------ house and farm

/**
 * A dwelling, drawn from above. `stage` 0 is a thatched cottage, 1 adds a
 * jettied upper storey, 2 is a proper tiled townhouse — so the building visibly
 * grows as it is upgraded.
 */
export function makeHouseSprite(def: TowerDef, stage: 0 | 1 | 2): Sprite {
  const r = def.radius;
  const { sprite, ctx } = createSprite(r * 3.1);
  const rand = mulberry32(0x40a5e + stage);

  groundShadow(ctx, r);

  const w = r * (stage === 0 ? 0.78 : stage === 1 ? 0.9 : 0.98);
  const h = r * (stage === 0 ? 0.62 : stage === 1 ? 0.74 : 0.86);

  // Jettied upper storey overhangs the ground floor on the later stages.
  if (stage > 0) {
    ctx.fillStyle = 'rgba(0, 0, 0, 0.32)';
    ctx.beginPath();
    ctx.roundRect(-w - r * 0.08, -h - r * 0.08, (w + r * 0.08) * 2, (h + r * 0.08) * 2, r * 0.08);
    ctx.fill();
  }

  // Roof: thatch first, then tile.
  ctx.save();
  ctx.beginPath();
  ctx.roundRect(-w, -h, w * 2, h * 2, r * 0.08);
  ctx.clip();

  const roof = ctx.createLinearGradient(0, -h, 0, h);
  if (stage === 0) {
    roof.addColorStop(0, '#9a8446');
    roof.addColorStop(0.47, '#c4ab63');
    roof.addColorStop(0.53, '#96803f');
    roof.addColorStop(1, '#6b5a2b');
  } else {
    roof.addColorStop(0, '#7a4032');
    roof.addColorStop(0.47, '#a5654a');
    roof.addColorStop(0.53, '#7c4131');
    roof.addColorStop(1, '#552c21');
  }
  ctx.fillStyle = roof;
  ctx.fillRect(-w, -h, w * 2, h * 2);

  ctx.strokeStyle = stage === 0 ? 'rgba(90, 74, 34, 0.4)' : 'rgba(46, 22, 15, 0.36)';
  ctx.lineWidth = r * 0.035;
  for (let x = -w; x < w; x += r * (stage === 0 ? 0.1 : 0.14)) {
    ctx.beginPath();
    ctx.moveTo(x, -h);
    ctx.lineTo(x, h);
    ctx.stroke();
  }
  ctx.restore();

  ctx.strokeStyle = 'rgba(38, 28, 16, 0.8)';
  ctx.lineWidth = r * 0.07;
  ctx.beginPath();
  ctx.roundRect(-w, -h, w * 2, h * 2, r * 0.08);
  ctx.stroke();

  // Ridge.
  ctx.strokeStyle = 'rgba(30, 22, 12, 0.6)';
  ctx.lineWidth = r * 0.08;
  ctx.beginPath();
  ctx.moveTo(-w, 0);
  ctx.lineTo(w, 0);
  ctx.stroke();

  // Chimneys: one, then two.
  ctx.fillStyle = '#6b6459';
  ctx.strokeStyle = 'rgba(26, 22, 17, 0.85)';
  ctx.lineWidth = r * 0.05;
  const stacks = stage === 2 ? [-0.45, 0.45] : [0.4];
  for (const t of stacks) {
    ctx.beginPath();
    ctx.roundRect(w * t - r * 0.09, -h * 0.55, r * 0.18, r * 0.18, r * 0.04);
    ctx.fill();
    ctx.stroke();
  }

  // A little yard clutter so it reads as lived in.
  for (let i = 0; i < 8; i++) {
    ctx.fillStyle = rand() < 0.5 ? 'rgba(96, 78, 46, 0.5)' : 'rgba(140, 120, 78, 0.35)';
    const a = rand() * TAU;
    const d = r * (0.95 + rand() * 0.25);
    ctx.beginPath();
    ctx.arc(Math.cos(a) * d, Math.sin(a) * d, r * (0.05 + rand() * 0.06), 0, TAU);
    ctx.fill();
  }

  return sprite;
}

/** A shed beside a field of corn. `scarecrow` and `horse` show the upgrades. */
export function makeFarmSprite(def: TowerDef, scarecrow: boolean, horse: boolean): Sprite {
  // Drawn a little larger than the footprint it actually occupies. A field is
  // the one building that should look like it spills past its own edges, and
  // at exactly `def.radius` it read as small next to the houses beside it.
  // Placement still uses the honest radius, so nothing about building changes.
  const r = def.radius * 1.18;
  const { sprite, ctx } = createSprite(r * 2.9);
  const rand = mulberry32(0xfa12 + (scarecrow ? 7 : 0) + (horse ? 31 : 0));

  groundShadow(ctx, r);

  // Ploughed field.
  ctx.fillStyle = '#8a7038';
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, TAU);
  ctx.fill();

  ctx.save();
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, TAU);
  ctx.clip();

  // Furrows.
  ctx.strokeStyle = 'rgba(72, 54, 26, 0.55)';
  ctx.lineWidth = r * 0.055;
  for (let y = -r; y < r; y += r * 0.17) {
    ctx.beginPath();
    ctx.moveTo(-r, y);
    ctx.lineTo(r, y);
    ctx.stroke();
  }

  // Standing corn.
  for (let i = 0; i < 90; i++) {
    const x = -r + rand() * r * 2;
    const y = -r + rand() * r * 2;
    if (x < -r * 0.15 && y < -r * 0.1) continue; // leave room for the shed
    ctx.strokeStyle = rand() < 0.5 ? 'rgba(214, 184, 84, 0.85)' : 'rgba(178, 148, 58, 0.8)';
    ctx.lineWidth = r * 0.035;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + (rand() - 0.5) * r * 0.06, y - r * (0.1 + rand() * 0.08));
    ctx.stroke();
  }
  ctx.restore();

  ctx.strokeStyle = 'rgba(52, 40, 20, 0.6)';
  ctx.lineWidth = r * 0.07;
  ctx.beginPath();
  ctx.arc(0, 0, r - r * 0.035, 0, TAU);
  ctx.stroke();

  // The shed, tucked into one corner.
  const sx = -r * 0.48;
  const sy = -r * 0.44;
  const sw = r * 0.34;
  const sh = r * 0.27;
  ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
  ctx.beginPath();
  ctx.roundRect(sx - sw + r * 0.04, sy - sh + r * 0.05, sw * 2, sh * 2, r * 0.05);
  ctx.fill();

  const shed = ctx.createLinearGradient(sx - sw, sy - sh, sx + sw, sy + sh);
  shed.addColorStop(0, '#8a6a3e');
  shed.addColorStop(1, '#4a3620');
  ctx.fillStyle = shed;
  ctx.strokeStyle = 'rgba(26, 18, 10, 0.85)';
  ctx.lineWidth = r * 0.05;
  ctx.beginPath();
  ctx.roundRect(sx - sw, sy - sh, sw * 2, sh * 2, r * 0.05);
  ctx.fill();
  ctx.stroke();
  ctx.strokeStyle = 'rgba(28, 20, 11, 0.5)';
  ctx.lineWidth = r * 0.03;
  ctx.beginPath();
  ctx.moveTo(sx - sw, sy);
  ctx.lineTo(sx + sw, sy);
  ctx.stroke();

  if (scarecrow) {
    // Cross-pole with a straw head and a rag coat.
    const cx = r * 0.42;
    const cy = r * 0.3;
    ctx.strokeStyle = '#6b4f2c';
    ctx.lineWidth = r * 0.055;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(cx, cy - r * 0.24);
    ctx.lineTo(cx, cy + r * 0.2);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(cx - r * 0.2, cy - r * 0.08);
    ctx.lineTo(cx + r * 0.2, cy - r * 0.08);
    ctx.stroke();
    ctx.fillStyle = '#5d5540';
    ctx.beginPath();
    ctx.ellipse(cx, cy, r * 0.11, r * 0.14, 0, 0, TAU);
    ctx.fill();
    ctx.fillStyle = '#d9c27a';
    ctx.beginPath();
    ctx.arc(cx, cy - r * 0.22, r * 0.09, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = 'rgba(30, 22, 12, 0.7)';
    ctx.lineWidth = r * 0.02;
    ctx.stroke();
  }

  if (horse) {
    // A horse at the plough, seen from above.
    const hx = r * 0.1;
    const hy = r * 0.5;
    ctx.save();
    ctx.translate(hx, hy);
    ctx.rotate(-0.2);
    ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
    ctx.beginPath();
    ctx.ellipse(r * 0.02, r * 0.05, r * 0.24, r * 0.13, 0, 0, TAU);
    ctx.fill();

    const coat = ctx.createLinearGradient(-r * 0.2, -r * 0.1, r * 0.2, r * 0.1);
    coat.addColorStop(0, '#7c5a3c');
    coat.addColorStop(1, '#43301f');
    ctx.fillStyle = coat;
    ctx.strokeStyle = 'rgba(20, 14, 8, 0.8)';
    ctx.lineWidth = r * 0.025;
    ctx.beginPath();
    ctx.ellipse(0, 0, r * 0.22, r * 0.11, 0, 0, TAU);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#8a6642';
    ctx.beginPath();
    ctx.ellipse(r * 0.24, 0, r * 0.09, r * 0.07, 0, 0, TAU);
    ctx.fill();
    ctx.stroke();
    // Trace lines back to the plough.
    ctx.strokeStyle = 'rgba(60, 44, 24, 0.8)';
    ctx.lineWidth = r * 0.022;
    ctx.beginPath();
    ctx.moveTo(-r * 0.2, -r * 0.06);
    ctx.lineTo(-r * 0.4, -r * 0.03);
    ctx.moveTo(-r * 0.2, r * 0.06);
    ctx.lineTo(-r * 0.4, r * 0.03);
    ctx.stroke();
    ctx.restore();
  }

  return sprite;
}

/** A crow in flight, pointing along +x. Wings beat with `flap`. */
export function drawCrow(ctx: CanvasRenderingContext2D, flap: number, feeding: boolean): void {
  const beat = feeding ? 0.15 : Math.sin(flap) * 0.8;

  ctx.fillStyle = 'rgba(0, 0, 0, 0.22)';
  ctx.beginPath();
  ctx.ellipse(-1, 7, 5, 2, 0, 0, TAU);
  ctx.fill();

  // Wings, swept back and beating.
  ctx.fillStyle = '#1c1c20';
  for (const side of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.quadraticCurveTo(-3, side * (3 + beat * 4), -7.5, side * (6 + beat * 5));
    ctx.quadraticCurveTo(-3.5, side * (2 + beat * 2), 1, side * 1.4);
    ctx.closePath();
    ctx.fill();
  }

  // Body and head.
  ctx.fillStyle = '#26262c';
  ctx.beginPath();
  ctx.ellipse(-0.6, 0, 4.2, 2.1, 0, 0, TAU);
  ctx.fill();
  ctx.fillStyle = '#303038';
  ctx.beginPath();
  ctx.arc(3.4, 0, 1.6, 0, TAU);
  ctx.fill();
  ctx.fillStyle = '#c9a54a';
  ctx.beginPath();
  ctx.moveTo(5.6, 0);
  ctx.lineTo(4.4, -0.7);
  ctx.lineTo(4.4, 0.7);
  ctx.closePath();
  ctx.fill();

  // Tail.
  ctx.fillStyle = '#1c1c20';
  ctx.beginPath();
  ctx.moveTo(-4.4, 0);
  ctx.lineTo(-7.4, -1.5);
  ctx.lineTo(-7.4, 1.5);
  ctx.closePath();
  ctx.fill();
}

// ----------------------------------------------------------------- gatehouse

/**
 * The masonry of a gatehouse: two drum towers either side of the road joined by
 * a wall. Drawn in local space with +x along the road, so the structure sits
 * square across it. The gate itself is drawn separately since it gets smashed.
 */
export function makeGatehouseSprite(def: TowerDef, roadHalfWidth: number): Sprite {
  const r = def.radius;
  const depth = r * 0.62; // how far the structure reaches along the road
  const reach = roadHalfWidth + r * 1.28; // out to the centre of each drum

  // The canvas has to clear the far edge of the outer drums, or they get cut off.
  const { sprite, ctx } = createSprite((reach + r * 0.62) * 2 + r * 0.6);
  const rand = mulberry32(0x6a7e11);

  ctx.fillStyle = 'rgba(0, 0, 0, 0.45)';
  ctx.beginPath();
  ctx.roundRect(-depth + r * 0.1, -reach + r * 0.12, depth * 2, reach * 2, r * 0.16);
  ctx.fill();

  // The two wall blocks flanking the road.
  for (const side of [-1, 1]) {
    const inner = roadHalfWidth * side;
    const outer = reach * side;
    const y = Math.min(inner, outer);
    const h = Math.abs(outer - inner);

    const wall = ctx.createLinearGradient(-depth, 0, depth, 0);
    wall.addColorStop(0, '#a49c8e');
    wall.addColorStop(0.5, '#837b6e');
    wall.addColorStop(1, '#544e45');
    ctx.fillStyle = wall;
    ctx.beginPath();
    ctx.roundRect(-depth, y, depth * 2, h, r * 0.1);
    ctx.fill();

    ctx.strokeStyle = 'rgba(26, 22, 17, 0.75)';
    ctx.lineWidth = r * 0.07;
    ctx.stroke();

    // Masonry courses.
    ctx.save();
    ctx.beginPath();
    ctx.roundRect(-depth, y, depth * 2, h, r * 0.1);
    ctx.clip();
    ctx.strokeStyle = 'rgba(32, 27, 21, 0.32)';
    ctx.lineWidth = r * 0.03;
    for (let t = y; t < y + h; t += r * 0.19) {
      ctx.beginPath();
      ctx.moveTo(-depth, t);
      ctx.lineTo(depth, t);
      ctx.stroke();
    }
    for (let i = 0; i < 22; i++) {
      ctx.fillStyle = rand() < 0.5 ? 'rgba(30, 26, 20, 0.16)' : 'rgba(216, 208, 192, 0.12)';
      ctx.beginPath();
      ctx.ellipse(
        -depth + rand() * depth * 2,
        y + rand() * h,
        r * (0.04 + rand() * 0.07),
        r * (0.03 + rand() * 0.05),
        rand() * TAU,
        0,
        TAU,
      );
      ctx.fill();
    }
    ctx.restore();
  }

  // Drum towers over the emplacements.
  for (const side of [-1, 1]) {
    const cy = reach * side;

    ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
    ctx.beginPath();
    ctx.arc(r * 0.08, cy + r * 0.1, r * 0.66, 0, TAU);
    ctx.fill();

    const drum = ctx.createLinearGradient(-r * 0.5, cy - r * 0.5, r * 0.5, cy + r * 0.5);
    drum.addColorStop(0, '#b3aa9b');
    drum.addColorStop(1, '#565048');
    ctx.fillStyle = drum;
    ctx.beginPath();
    ctx.arc(0, cy, r * 0.62, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = 'rgba(24, 20, 15, 0.8)';
    ctx.lineWidth = r * 0.07;
    ctx.stroke();

    // Crenellated rim.
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * TAU;
      const lit = lightAt(a);
      ctx.beginPath();
      ctx.arc(0, cy, r * 0.62, a - 0.2, a + 0.2);
      ctx.arc(0, cy, r * 0.46, a + 0.2, a - 0.2, true);
      ctx.closePath();
      ctx.fillStyle = mix('#4c473f', '#c3bbab', lit * 0.85);
      ctx.fill();
    }

    // Open floor in the middle where the emplacement stands.
    ctx.fillStyle = '#3f3a32';
    ctx.beginPath();
    ctx.arc(0, cy, r * 0.42, 0, TAU);
    ctx.fill();
  }

  return sprite;
}

/**
 * The gate barring the road, drawn separately from the masonry so it can be
 * shown splintering and finally gone. `integrity` runs 1 (sound) to 0 (broken).
 */
export function drawGate(
  ctx: CanvasRenderingContext2D,
  roadHalfWidth: number,
  depth: number,
  integrity: number,
): void {
  if (integrity <= 0) {
    // Smashed open: only the ruined jambs and a litter of splinters remain.
    ctx.fillStyle = 'rgba(38, 26, 14, 0.55)';
    for (const side of [-1, 1]) {
      ctx.beginPath();
      ctx.roundRect(-depth * 0.5, side * roadHalfWidth * 0.82, depth, roadHalfWidth * 0.18, 2);
      ctx.fill();
    }
    return;
  }

  const wood = ctx.createLinearGradient(-depth, 0, depth, 0);
  wood.addColorStop(0, '#4e3a20');
  wood.addColorStop(0.5, '#6d5230');
  wood.addColorStop(1, '#3a2a17');
  ctx.fillStyle = wood;
  ctx.beginPath();
  ctx.roundRect(-depth * 0.62, -roadHalfWidth, depth * 1.24, roadHalfWidth * 2, 3);
  ctx.fill();
  ctx.strokeStyle = 'rgba(18, 12, 6, 0.85)';
  ctx.lineWidth = 2;
  ctx.stroke();

  // Vertical timbers.
  ctx.strokeStyle = 'rgba(22, 15, 8, 0.5)';
  ctx.lineWidth = 1.4;
  for (let t = -roadHalfWidth + 6; t < roadHalfWidth; t += 9) {
    ctx.beginPath();
    ctx.moveTo(-depth * 0.62, t);
    ctx.lineTo(depth * 0.62, t);
    ctx.stroke();
  }

  // Iron bands.
  ctx.fillStyle = '#3d4046';
  for (const t of [-0.5, 0.5]) {
    ctx.beginPath();
    ctx.roundRect(-depth * 0.62, t * roadHalfWidth - 2.2, depth * 1.24, 4.4, 1.5);
    ctx.fill();
  }

  // Damage: cracks appear and widen as the gate is beaten in.
  const damage = 1 - integrity;
  if (damage > 0.15) {
    ctx.strokeStyle = `rgba(16, 10, 5, ${Math.min(0.85, damage)})`;
    ctx.lineWidth = 1 + damage * 2.5;
    const cracks = Math.round(damage * 6);
    for (let i = 0; i < cracks; i++) {
      const t = -roadHalfWidth + ((i + 0.5) / cracks) * roadHalfWidth * 2;
      ctx.beginPath();
      ctx.moveTo(-depth * 0.6, t);
      ctx.lineTo(depth * 0.2 * (i % 2 === 0 ? 1 : -1), t + 5 - (i % 3) * 4);
      ctx.lineTo(depth * 0.6, t + (i % 2 === 0 ? 3 : -3));
      ctx.stroke();
    }
  }
}

/** A soldier heaving rocks over the parapet. */
export function drawRockThrower(ctx: CanvasRenderingContext2D, radius: number, recoil: number): void {
  ctx.save();
  ctx.scale(radius / 11, radius / 11);
  ctx.lineCap = 'round';

  ctx.fillStyle = 'rgba(0, 0, 0, 0.45)';
  ctx.beginPath();
  ctx.ellipse(0.6, 1.4, 5, 4, 0, 0, TAU);
  ctx.fill();

  const tunic = ctx.createLinearGradient(-3, -3, 2, 3);
  tunic.addColorStop(0, '#5f5744');
  tunic.addColorStop(1, '#251f14');
  ctx.fillStyle = tunic;
  ctx.strokeStyle = 'rgba(8, 7, 4, 0.8)';
  ctx.lineWidth = 0.5;
  ctx.beginPath();
  ctx.ellipse(-1, 0, 3.9, 3.3, 0, 0, TAU);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = '#cb9c6e';
  ctx.beginPath();
  ctx.arc(1, 0, 2.2, 0, TAU);
  ctx.fill();
  ctx.stroke();

  // Arms raised overhead, holding a stone that is hurled on the beat.
  const lift = 1 - recoil;
  ctx.fillStyle = '#4a4029';
  for (const side of [-1, 1]) {
    ctx.beginPath();
    ctx.ellipse(2 + lift * 1.4, side * 2.4, 2.3, 1.2, side * 0.3, 0, TAU);
    ctx.fill();
  }

  if (recoil < 0.5) {
    const stone = ctx.createRadialGradient(3.6, -0.8, 0.3, 4.2, 0, 2.4);
    stone.addColorStop(0, '#9a938a');
    stone.addColorStop(1, '#4f4a44');
    ctx.fillStyle = stone;
    ctx.beginPath();
    ctx.arc(4.2 + lift, 0, 2.2, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = 'rgba(20, 18, 15, 0.7)';
    ctx.lineWidth = 0.4;
    ctx.stroke();
  }

  ctx.restore();
}

/** A cauldron of boiling oil being tipped over the edge. */
export function drawOilCauldron(ctx: CanvasRenderingContext2D, radius: number, pour: number): void {
  ctx.save();
  ctx.scale(radius / 11, radius / 11);

  ctx.fillStyle = 'rgba(0, 0, 0, 0.45)';
  ctx.beginPath();
  ctx.ellipse(0.6, 1.4, 5.2, 4.2, 0, 0, TAU);
  ctx.fill();

  // The fire under the pot.
  const embers = ctx.createRadialGradient(-1, 0, 0.4, -1, 0, 4.2);
  embers.addColorStop(0, `rgba(255, 186, 92, ${0.5 + pour * 0.4})`);
  embers.addColorStop(1, 'rgba(160, 50, 12, 0)');
  ctx.fillStyle = embers;
  ctx.beginPath();
  ctx.arc(-1, 0, 4.2, 0, TAU);
  ctx.fill();

  // Iron cauldron, tipping forward as it pours.
  ctx.save();
  ctx.translate(pour * 1.6, 0);
  const pot = ctx.createLinearGradient(-3, -3, 2, 3);
  pot.addColorStop(0, '#5a5d63');
  pot.addColorStop(1, '#26282c');
  ctx.fillStyle = pot;
  ctx.strokeStyle = 'rgba(10, 11, 13, 0.85)';
  ctx.lineWidth = 0.6;
  ctx.beginPath();
  ctx.ellipse(0.4, 0, 3.6, 3.2, 0, 0, TAU);
  ctx.fill();
  ctx.stroke();

  // The oil itself, glowing in the pot.
  ctx.fillStyle = `rgba(${210 + Math.round(30 * pour)}, ${120 + Math.round(60 * pour)}, 40, 0.95)`;
  ctx.beginPath();
  ctx.ellipse(0.4, 0, 2.3, 2, 0, 0, TAU);
  ctx.fill();
  ctx.restore();

  // A crewman behind it.
  ctx.fillStyle = '#2f2a1c';
  ctx.beginPath();
  ctx.ellipse(-3.6, 0, 2.4, 2.1, 0, 0, TAU);
  ctx.fill();
  ctx.fillStyle = '#cb9c6e';
  ctx.beginPath();
  ctx.arc(-3.2, 0, 1.5, 0, TAU);
  ctx.fill();

  ctx.restore();
}

// ----------------------------------------------------------------- projectiles

/** Trailing flame drawn behind a burning shot, pointing along +x. */
export function drawFlameTrail(ctx: CanvasRenderingContext2D, size: number): void {
  const flicker = 0.8 + Math.sin(performance.now() * 0.03) * 0.2;

  const glow = ctx.createRadialGradient(0, 0, size * 0.2, 0, 0, size * 2.6);
  glow.addColorStop(0, `rgba(255, 224, 150, ${0.85 * flicker})`);
  glow.addColorStop(0.45, `rgba(238, 130, 40, ${0.5 * flicker})`);
  glow.addColorStop(1, 'rgba(180, 60, 20, 0)');
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(0, 0, size * 2.6, 0, TAU);
  ctx.fill();

  ctx.fillStyle = `rgba(240, 146, 46, ${0.55 * flicker})`;
  ctx.beginPath();
  ctx.moveTo(-size * 0.6, -size * 0.75);
  ctx.quadraticCurveTo(-size * 3.4, 0, -size * 0.6, size * 0.75);
  ctx.closePath();
  ctx.fill();
}

/** A real arrow: shaft, steel head, feather fletching. Drawn pointing along +x. */
export function drawArrow(ctx: CanvasRenderingContext2D): void {
  ctx.fillStyle = 'rgba(0, 0, 0, 0.25)';
  ctx.beginPath();
  ctx.ellipse(0, 3.2, 7, 1.1, 0, 0, TAU);
  ctx.fill();

  ctx.strokeStyle = '#5c4527';
  ctx.lineWidth = 1.15;
  ctx.lineCap = 'butt';
  ctx.beginPath();
  ctx.moveTo(-7, 0);
  ctx.lineTo(5.4, 0);
  ctx.stroke();

  ctx.fillStyle = '#c6cad0';
  ctx.beginPath();
  ctx.moveTo(8.6, 0);
  ctx.lineTo(5, -1.5);
  ctx.lineTo(5.9, 0);
  ctx.lineTo(5, 1.5);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = '#ddd6c6';
  for (const side of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(-7.2, 0);
    ctx.lineTo(-4.4, side * 1.9);
    ctx.lineTo(-3.2, 0);
    ctx.closePath();
    ctx.fill();
  }
}

/** A rough stone, drawn centred on the origin. */
/**
 * The head of a flail, mid-swing, with a length of chain trailing back towards
 * the man who threw it. The "projectile" is on screen for barely a tenth of a
 * second at the Flail Guard's speed, which is exactly the point: it reads as
 * the ball lashing out and coming back rather than as something thrown.
 */
export function drawFlailHead(ctx: CanvasRenderingContext2D, radius: number): void {
  // Chain, trailing behind the direction of travel.
  ctx.strokeStyle = 'rgba(168, 166, 176, 0.75)';
  ctx.lineWidth = radius * 0.28;
  ctx.setLineDash([radius * 0.5, radius * 0.42]);
  ctx.beginPath();
  ctx.moveTo(-radius * 4.5, 0);
  ctx.lineTo(-radius * 0.8, 0);
  ctx.stroke();
  ctx.setLineDash([]);

  const ball = ctx.createRadialGradient(-radius * 0.35, -radius * 0.35, radius * 0.15, 0, 0, radius);
  ball.addColorStop(0, '#9a97a3');
  ball.addColorStop(1, '#33313a');
  ctx.fillStyle = ball;
  ctx.beginPath();
  ctx.arc(0, 0, radius, 0, TAU);
  ctx.fill();
  ctx.strokeStyle = 'rgba(10, 9, 12, 0.85)';
  ctx.lineWidth = radius * 0.16;
  ctx.stroke();

  ctx.strokeStyle = '#c2bfcb';
  ctx.lineWidth = radius * 0.24;
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * TAU;
    ctx.beginPath();
    ctx.moveTo(Math.cos(a) * radius * 0.85, Math.sin(a) * radius * 0.85);
    ctx.lineTo(Math.cos(a) * radius * 1.65, Math.sin(a) * radius * 1.65);
    ctx.stroke();
  }
}

export function drawBoulder(ctx: CanvasRenderingContext2D, radius: number): void {
  ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
  ctx.beginPath();
  ctx.ellipse(radius * 0.3, radius * 0.5, radius, radius * 0.7, 0, 0, TAU);
  ctx.fill();

  const grad = ctx.createRadialGradient(-radius * 0.35, -radius * 0.4, radius * 0.15, 0, 0, radius);
  grad.addColorStop(0, '#9a938a');
  grad.addColorStop(1, '#4f4a44');
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(0, 0, radius, 0, TAU);
  ctx.fill();

  ctx.fillStyle = 'rgba(30, 26, 22, 0.35)';
  ctx.beginPath();
  ctx.arc(radius * 0.3, radius * 0.15, radius * 0.22, 0, TAU);
  ctx.fill();
}
