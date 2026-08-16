import { alpha, mix, mulberry32, TAU } from '../core/rng';
import { clamp } from '../core/vec';
import { ALL_TOWERS, TOWERS, towerDef } from '../data/towers';
import type { CastleBlock, CastleDef, MapDef } from '../data/maps';
import type { Creep } from '../game/Creep';
import type { Game } from '../game/Game';
import type { Path } from '../game/Path';
import { corridorAt } from '../game/GameMap';
import { chokeNear } from '../game/placement';
import type { Tower } from '../game/Tower';
import {
  drawArcherFigure,
  drawArrow,
  drawBoulder,
  drawCatapultArm,
  drawCrossbowFigure,
  drawDog,
  drawCrow,
  lightAt,
  drawFireField,
  drawFlameTrail,
  drawGate,
  drawHoundmasterFigure,
  drawOilCauldron,
  drawRockThrower,
  drawSprite,
  drawSwordsman,
  drawDefenderKnight,
  drawDefenderMountedKnight,
  drawDefenderPikeman,
  drawFlailGuard,
  drawFlailHead,
  drawMarchLancer,
  drawMarchManAtArms,
  drawMarchShieldbearer,
  drawMarchSwordKnight,
  makeCatapultSprite,
  makeFarmSprite,
  makeGatehouseSprite,
  makeGroundStandSprite,
  makeHospitalSprite,
  makeHouseSprite,
  makeHoundmasterSprite,
  makeResearchSprite,
  drawAssassinFigure,
  drawBowmanFigure,
  drawFlailKnightFigure,
  drawStoneSlingerFigure,
  drawKnightFigure,
  drawLanceRiderFigure,
  drawMarauderFigure,
  drawMountedKnightFigure,
  drawPeasantFigure,
  drawPikemanFigure,
  drawRamFigure,
  drawShieldmanFigure,
  drawSwordKnightFigure,
  type Sprite,
} from './sprites';

/** Supersampling factor for the pre-rendered terrain. */
const GROUND_SCALE = 2;

/**
 * Every creep figure other than the hound and the ram (both special cases —
 * one has four legs, the other has none) is a person drawn facing +x with
 * the same `(ctx, gait, fighting)` signature, just at a different scale so
 * bulkier creeps read as bulkier.
 */
const FIGURE_DRAWERS: Partial<
  Record<string, { draw: (ctx: CanvasRenderingContext2D, gait: number, fighting: boolean) => void; scale: number }>
> = {
  pikeman: { draw: drawPikemanFigure, scale: 1.4 },
  shieldman: { draw: drawShieldmanFigure, scale: 1.4 },
  peasant: { draw: drawPeasantFigure, scale: 1.4 },
  knight: { draw: drawKnightFigure, scale: 1.55 },
  swordknight: { draw: drawSwordKnightFigure, scale: 1.55 },
  assassin: { draw: drawAssassinFigure, scale: 1.3 },
  marauder: { draw: drawMarauderFigure, scale: 1.35 },
  lancerider: { draw: drawLanceRiderFigure, scale: 1.5 },
  mountedknight: { draw: drawMountedKnightFigure, scale: 1.6 },
  bowman: { draw: drawBowmanFigure, scale: 1.35 },
  stoneslinger: { draw: drawStoneSlingerFigure, scale: 1.35 },
  // The boss, and drawn to look like one — half again the bulk of a knight.
  flailknight: { draw: (ctx, gait) => drawFlailKnightFigure(ctx, gait), scale: 1.75 },
};

/**
 * The fighter a melee post sends onto the road, keyed by the post's `visual`.
 * Unlike the creep drawers above these take a fourth argument — whether the
 * man is stood idle at his post — and they scale themselves, so there is no
 * separate scale to apply here.
 */
const DEFENDER_DRAWERS: Record<
  string,
  (ctx: CanvasRenderingContext2D, gait: number, fighting: boolean, resting: boolean) => void
> = {
  swordsman: drawSwordsman,
  pikeman: drawDefenderPikeman,
  'heavy-knight': drawDefenderKnight,
  'mounted-knight': drawDefenderMountedKnight,
  'men-at-arms': drawMarchManAtArms,
  shieldbearer: drawMarchShieldbearer,
  'sword-knight': drawMarchSwordKnight,
  lancer: drawMarchLancer,
};

/**
 * Everything that draws lives here. The game logic never knows what it looks
 * like, so a different art style only changes this file and `sprites.ts`.
 *
 * The terrain never changes, so it is painted once into an offscreen canvas and
 * then blitted every frame. That buys a lot of detail for almost no cost.
 */
export class Renderer {
  private readonly ctx: CanvasRenderingContext2D;
  private readonly canvas: HTMLCanvasElement;
  private readonly game: Game;
  private ground: HTMLCanvasElement;
  private readonly towerSprites = new Map<string, Sprite>();
  /** Which map the pre-rendered terrain was painted for. */
  private tiledFor: MapDef;

  /**
   * Draw where the enemy will actually walk, and how much room it has there.
   *
   * A working tool rather than decoration: on a map whose ground is drawn by
   * hand, the fronts are *found* in that ground, so the only way to see what a
   * change to a patch did to the enemy's path is to look at the path. Toggled
   * with `P`.
   */
  showRoutes = false;

  constructor(canvas: HTMLCanvasElement, game: Game) {
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('This browser cannot create a 2D canvas context');
    this.canvas = canvas;
    this.ctx = ctx;
    this.game = game;

    // Sprites are built for every tower in the catalogue, not just the ones
    // the current nation fields — cheap, and it means switching nation never
    // has to rebuild anything.
    for (const id of ALL_TOWERS) {
      const def: (typeof TOWERS)[keyof typeof TOWERS] = TOWERS[id];

      if (def.visual === 'hospital') {
        this.towerSprites.set(def.id, makeHospitalSprite(def));
        continue;
      }
      if (def.visual === 'house') {
        // One sprite per upgrade stage, so the building visibly grows.
        this.towerSprites.set(def.id, makeHouseSprite(def, 0));
        this.towerSprites.set(`${def.id}:1`, makeHouseSprite(def, 1));
        this.towerSprites.set(`${def.id}:2`, makeHouseSprite(def, 2));
        continue;
      }
      if (def.visual === 'farm') {
        for (const scarecrow of [false, true]) {
          for (const horse of [false, true]) {
            this.towerSprites.set(
              `${def.id}${scarecrow ? ':s' : ''}${horse ? ':h' : ''}`,
              makeFarmSprite(def, scarecrow, horse),
            );
          }
        }
        continue;
      }
      if (
        def.visual === 'archer' ||
        def.visual === 'crossbow' ||
        def.visual === 'swordsman' ||
        def.visual === 'pikeman' ||
        def.visual === 'heavy-knight' ||
        def.visual === 'mounted-knight' ||
        def.visual === 'men-at-arms' ||
        def.visual === 'shieldbearer' ||
        def.visual === 'sword-knight' ||
        def.visual === 'lancer'
      ) {
        // These stand on the ground, and gain a scaffold when upgraded.
        this.towerSprites.set(def.id, makeGroundStandSprite(def, false));
        this.towerSprites.set(`${def.id}:elevated`, makeGroundStandSprite(def, true));
        continue;
      }

      if (def.visual === 'gatehouse') {
        this.towerSprites.set(def.id, makeGatehouseSprite(def, game.map.gateHalfWidth));
        continue;
      }
      // The two gate emplacements are drawn live, with no base sprite.
      if (def.visual === 'rock-thrower' || def.visual === 'hot-oil' || def.visual === 'flail-guard') continue;

      const sprite =
        def.visual === 'houndmaster'
          ? makeHoundmasterSprite(def)
          : def.visual === 'research'
            ? makeResearchSprite(def)
            : makeCatapultSprite(def);
      this.towerSprites.set(def.id, sprite);
    }

    this.ground = this.buildGround();
    this.tiledFor = this.game.map.def;
  }

  /**
   * Repaint everything that was baked for one particular map.
   *
   * The terrain is pre-rendered once because it never changes *during* a game —
   * but the map itself can now be chosen, so "never changes" became "changes
   * only when the game does". Called automatically when `render` notices the
   * ground underfoot is not the ground it painted.
   */
  retile(): void {
    this.ground = this.buildGround();
    this.tiledFor = this.game.map.def;
    // The gatehouse sprite is cut to the width of the road it straddles.
    const gate = TOWERS.gatehouse;
    this.towerSprites.set(gate.id, makeGatehouseSprite(gate, this.game.map.gateHalfWidth));
  }

  render(): void {
    const { ctx, game } = this;
    if (game.map.def !== this.tiledFor) this.retile();
    const scale = this.canvas.width / game.map.width;

    ctx.setTransform(scale, 0, 0, scale, 0, 0);
    ctx.drawImage(this.ground, 0, 0, game.map.width, game.map.height);

    this.drawFires();
    this.drawEmptyLots();
    this.drawChokeMarks();
    if (this.showRoutes) this.drawRouteOverlay();
    this.drawSelection();
    this.drawGates();
    this.drawTowers();
    this.drawCreeps();
    this.drawDogs();
    this.drawFighters();
    this.drawProjectiles();
    this.drawCrows();
    this.drawGhost();

    if (import.meta.env.DEV) this.assertTransformIntact(scale);
  }

  /**
   * Check the canvas transform survived the frame, and say so loudly if not.
   *
   * Every figure here draws inside a matched `save`/`restore` pair. Get that
   * wrong by one — a stray `restore()` — and the extra pop unwinds the
   * whole-canvas transform set up at the top of this method, so *everything
   * drawn after the offending figure* lands at the wrong scale or rotation.
   * That has happened once already, and the symptom is baffling: towers
   * vanish, enemies appear to walk off in a straight line at the wrong angle,
   * and it only shows up when one particular building is on the board.
   *
   * A leak is a programming error rather than a state to recover from, so this
   * complains rather than repairing anything — and only once, or a broken
   * frame would fill the console sixty times a second.
   */
  private transformWarned = false;
  private assertTransformIntact(scale: number): void {
    if (this.transformWarned) return;
    const m = this.ctx.getTransform();
    const off = Math.abs(m.a - scale) + Math.abs(m.d - scale) + Math.abs(m.b) + Math.abs(m.c);
    if (off < 1e-6) return;

    this.transformWarned = true;
    console.error(
      'Renderer: the canvas transform did not survive the frame — some draw function has ' +
        'an unbalanced ctx.save()/ctx.restore(). Expected scale ' +
        `${scale}, got a=${m.a} b=${m.b} c=${m.c} d=${m.d}.`,
    );
  }

  /**
   * Every front, and the band of ground its creeps may occupy — which is the
   * corridor the ground actually leaves them, not a fixed width. Where the
   * band pinches to nothing the enemy is coming through single file, and that
   * is a place worth either walling or widening.
   */
  private drawRouteOverlay(): void {
    const { ctx, game } = this;
    const colours = ['#ff5a3c', '#4d8bff', '#4bd06a'];

    game.map.routes.forEach((route, i) => {
      const colour = colours[i % colours.length];
      const len = route.path.length;

      ctx.save();
      ctx.fillStyle = `${colour}33`;
      ctx.beginPath();
      // Out along one side of the corridor and back along the other.
      for (let d = 0; d <= len; d += 6) {
        const p = route.path.positionAt(d);
        const room = corridorAt(route, d);
        const x = p.x - Math.sin(p.angle) * room;
        const y = p.y + Math.cos(p.angle) * room;
        if (d === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      for (let d = len; d >= 0; d -= 6) {
        const p = route.path.positionAt(d);
        const room = corridorAt(route, d);
        ctx.lineTo(p.x + Math.sin(p.angle) * room, p.y - Math.cos(p.angle) * room);
      }
      ctx.closePath();
      ctx.fill();

      ctx.strokeStyle = colour;
      ctx.lineWidth = 2.5;
      ctx.setLineDash([10, 7]);
      ctx.beginPath();
      for (let d = 0; d <= len; d += 6) {
        const p = route.path.positionAt(d);
        if (d === 0) ctx.moveTo(p.x, p.y);
        else ctx.lineTo(p.x, p.y);
      }
      ctx.stroke();
      ctx.restore();
    });
  }

  /** Crows drift over the top of everything; they are in the air. */
  private drawCrows(): void {
    const { ctx } = this;
    for (const crow of this.game.crows) {
      ctx.save();
      ctx.translate(crow.x, crow.y);
      ctx.rotate(crow.angle);
      drawCrow(ctx, crow.flap, crow.isFeeding);
      ctx.restore();
    }
  }

  // ================================================================= terrain

  private buildGround(): HTMLCanvasElement {
    const { def, width, height } = this.game.map;

    const canvas = document.createElement('canvas');
    canvas.width = width * GROUND_SCALE;
    canvas.height = height * GROUND_SCALE;
    const g = canvas.getContext('2d');
    if (!g) throw new Error('Could not create the terrain canvas');
    g.scale(GROUND_SCALE, GROUND_SCALE);

    const rand = mulberry32(0x2025_0805);

    // Open sand is a different job from a meadow with a road on it: there is
    // no road to paint, and the only thing worth reading on the ground is
    // which parts of it can be built on.
    if (def.terrain === 'sand') {
      this.paintSand(g, rand);
      this.paintKeep(g);
      this.paintVignette(g);
      return canvas;
    }

    // Base meadow with soft patches of lighter and darker growth.
    g.fillStyle = def.grass;
    g.fillRect(0, 0, width, height);

    for (let i = 0; i < 120; i++) {
      const x = rand() * width;
      const y = rand() * height;
      const r = 45 + rand() * 155;
      const colour = rand() < 0.5 ? def.grassAlt : def.grassLight;
      const grad = g.createRadialGradient(x, y, 0, x, y, r);
      grad.addColorStop(0, alpha(colour, 0.72));
      grad.addColorStop(1, alpha(colour, 0));
      g.fillStyle = grad;
      g.beginPath();
      g.arc(x, y, r, 0, TAU);
      g.fill();
    }

    // Clumps of taller growth. These are what actually reads as texture when
    // the whole board is on screen; single blades vanish at that scale.
    for (let i = 0; i < 420; i++) {
      const x = rand() * width;
      const y = rand() * height;
      if (this.nearAnyLane(x, y, 6)) continue;
      const dark = rand() < 0.55;
      g.fillStyle = dark ? alpha(def.grassAlt, 0.5) : alpha(def.grassLight, 0.4);
      for (let b = 0; b < 4; b++) {
        g.beginPath();
        g.ellipse(
          x + (rand() - 0.5) * 11,
          y + (rand() - 0.5) * 9,
          2.4 + rand() * 3.4,
          1.8 + rand() * 2.4,
          rand() * TAU,
          0,
          TAU,
        );
        g.fill();
      }
    }

    // Individual blades of grass.
    g.lineCap = 'round';
    for (let i = 0; i < 3200; i++) {
      const x = rand() * width;
      const y = rand() * height;
      if (this.nearAnyLane(x, y, 3)) continue;
      const light = rand();
      g.strokeStyle =
        light < 0.45
          ? alpha(def.grassAlt, 0.55)
          : light < 0.85
            ? alpha(def.grassLight, 0.5)
            : 'rgba(196, 199, 132, 0.35)';
      g.lineWidth = 0.7;
      g.beginPath();
      g.moveTo(x, y);
      g.lineTo(x + (rand() - 0.5) * 2.4, y - 2 - rand() * 3);
      g.stroke();
    }

    this.paintRoad(g, rand, this.game.map.path, this.game.map.pathRadius, true);
    for (const trail of this.game.map.trails) this.paintRoad(g, rand, trail.path, trail.radius, false);
    this.paintRocks(g, rand);
    this.paintKeep(g);
    for (const lane of this.game.map.lanes) {
      this.paintForestEntrance(g, rand, lane.path, lane.radius, lane.id === 'main');
    }

    this.paintVignette(g);

    return canvas;
  }

  /** Settles the whole board down and pulls the eye to the middle. */
  private paintVignette(g: CanvasRenderingContext2D): void {
    const { width, height } = this.game.map;
    const vig = g.createRadialGradient(width / 2, height / 2, height * 0.42, width / 2, height / 2, height * 0.95);
    vig.addColorStop(0, 'rgba(0, 0, 0, 0)');
    vig.addColorStop(1, 'rgba(12, 16, 8, 0.26)');
    g.fillStyle = vig;
    g.fillRect(0, 0, width, height);
  }

  /**
   * Open desert: dunes, drift, scattered stones — and the hills, which are the
   * only ground a building can stand on and so have to be unmistakable.
   *
   * No route is drawn. There is nothing to draw: the enemy is not following
   * anything, it is crossing the sand, and a line painted on it would be a lie
   * about where it has to walk.
   */
  private paintSand(g: CanvasRenderingContext2D, rand: () => number): void {
    const { width, height, def } = this.game.map;

    g.fillStyle = def.grass;
    g.fillRect(0, 0, width, height);

    // Broad drifts of lighter and darker sand.
    for (let i = 0; i < 150; i++) {
      const x = rand() * width;
      const y = rand() * height;
      const r = 60 + rand() * 190;
      const colour = rand() < 0.5 ? def.grassAlt : def.grassLight;
      const grad = g.createRadialGradient(x, y, 0, x, y, r);
      grad.addColorStop(0, alpha(colour, 0.5));
      grad.addColorStop(1, alpha(colour, 0));
      g.fillStyle = grad;
      g.beginPath();
      g.ellipse(x, y, r, r * (0.4 + rand() * 0.3), rand() * TAU, 0, TAU);
      g.fill();
    }

    // Wind ripples: long shallow arcs, all lying the same way.
    g.lineCap = 'round';
    for (let i = 0; i < 900; i++) {
      const x = rand() * width;
      const y = rand() * height;
      const len = 14 + rand() * 40;
      const lift = 3 + rand() * 5;
      g.strokeStyle = rand() < 0.5 ? alpha(def.grassAlt, 0.3) : alpha(def.grassLight, 0.35);
      g.lineWidth = 0.9 + rand() * 0.8;
      g.beginPath();
      g.moveTo(x, y);
      g.quadraticCurveTo(x + len / 2, y - lift, x + len, y);
      g.stroke();
    }

    // Grit and pebbles.
    for (let i = 0; i < 1400; i++) {
      const x = rand() * width;
      const y = rand() * height;
      g.fillStyle = rand() < 0.6 ? 'rgba(90, 76, 52, 0.22)' : 'rgba(255, 246, 218, 0.3)';
      g.beginPath();
      g.arc(x, y, 0.5 + rand() * 1.3, 0, TAU);
      g.fill();
    }

    this.paintHills(g, rand);
    this.paintRocks(g, rand);
  }

  /**
   * The hills, drawn as one merged mass rather than as separate circles.
   *
   * They are drawn from the same list the build rule tests against, so what
   * looks like buildable ground is buildable ground — the two cannot drift
   * apart. Overlapping circles are painted into an offscreen layer first so
   * their shared edges do not show as seams inside the mass.
   */
  private paintHills(g: CanvasRenderingContext2D, rand: () => number): void {
    const hills = this.game.map.def.hills;
    if (!hills || hills.length === 0) return;
    const { width, height } = this.game.map;

    const layer = document.createElement('canvas');
    layer.width = width;
    layer.height = height;
    const h = layer.getContext('2d');
    if (!h) return;

    /*
     * One patch, as a closed path.
     *
     * A circle becomes a wobbled ellipse, so a knoll does not read as a coin.
     * A traced outline is run through a Catmull-Rom spline, which **passes
     * through every point it was given**. That matters: the first version cut
     * corners between the points instead, and every bay, notch and narrow
     * finger in the traced shapes was rounded away into the same fat oval.
     */
    const patch = (
      c: CanvasRenderingContext2D,
      hill: (typeof hills)[number],
      seed: number,
    ) => {
      if (!('r' in hill)) {
        const p = hill.points;
        const n = p.length;
        const at = (i: number) => p[((i % n) + n) % n];

        c.beginPath();
        c.moveTo(p[0].x, p[0].y);
        for (let i = 0; i < n; i++) {
          const p0 = at(i - 1);
          const p1 = at(i);
          const p2 = at(i + 1);
          const p3 = at(i + 2);
          c.bezierCurveTo(
            p1.x + (p2.x - p0.x) / 6,
            p1.y + (p2.y - p0.y) / 6,
            p2.x - (p3.x - p1.x) / 6,
            p2.y - (p3.y - p1.y) / 6,
            p2.x,
            p2.y,
          );
        }
        c.closePath();
        return;
      }

      const wobble = mulberry32(seed);
      c.beginPath();
      const steps = 26;
      for (let i = 0; i <= steps; i++) {
        const a = (i / steps) * TAU;
        const r = hill.r * (0.9 + wobble() * 0.2);
        const px = hill.x + Math.cos(a) * r;
        const py = hill.y + Math.sin(a) * r * 0.88;
        if (i === 0) c.moveTo(px, py);
        else c.lineTo(px, py);
      }
      c.closePath();
    };

    /*
     * Green, against sand that is anything but.
     *
     * This is a legibility decision before it is an aesthetic one: the hills
     * are the only ground a building can stand on, and a player has to be able
     * to see that from across the board without hovering anything. Sand-on-sand
     * looked better and told you nothing.
     */
    /*
     * The slope is a thick stroke of the patch's own outline rather than a
     * second, larger copy of it. Growing a shape by pushing its points away
     * from its middle only works on a round one — on a lobed patch it pulls
     * the lobes apart and closes up the bays.
     */
    h.lineJoin = 'round';
    h.lineCap = 'round';
    h.strokeStyle = '#6a7a3c';
    h.lineWidth = 13;
    hills.forEach((hill, i) => {
      patch(h, hill, 0x51_00 + i);
      h.stroke();
    });

    // The flat top — this is what reads as "you can build here".
    h.fillStyle = '#8ba055';
    hills.forEach((hill, i) => {
      patch(h, hill, 0x51_00 + i);
      h.fill();
    });

    // Scrub and stones on top, clipped to the mass so nothing spills onto sand.
    h.save();
    h.beginPath();
    hills.forEach((hill, i) => patch(h, hill, 0x51_00 + i));
    h.clip();
    for (let i = 0; i < 1500; i++) {
      const x = rand() * width;
      const y = rand() * height;
      const dark = rand() < 0.5;
      h.fillStyle = dark ? 'rgba(74, 88, 40, 0.45)' : 'rgba(176, 194, 118, 0.4)';
      h.beginPath();
      h.ellipse(x, y, 1 + rand() * 3, 0.8 + rand() * 2, rand() * TAU, 0, TAU);
      h.fill();
    }
    for (let i = 0; i < 420; i++) {
      const x = rand() * width;
      const y = rand() * height;
      h.strokeStyle = 'rgba(58, 72, 32, 0.5)';
      h.lineWidth = 1;
      for (let b = 0; b < 3; b++) {
        h.beginPath();
        h.moveTo(x, y);
        h.lineTo(x + (rand() - 0.5) * 7, y - 3 - rand() * 5);
        h.stroke();
      }
    }
    h.restore();

    // Drop shadow under the whole mass, then the mass itself.
    g.save();
    g.globalAlpha = 0.3;
    g.drawImage(layer, 4, 6);
    g.globalAlpha = 1;
    g.restore();
    g.drawImage(layer, 0, 0);
  }

  /**
   * The gaps a wall can be thrown across, shown **only while a gatehouse is
   * being placed**.
   *
   * They were painted onto the terrain at first and that was a mistake: a
   * player looking at the board saw markings with no evident meaning, on
   * ground they were not currently doing anything with. A legal-placement hint
   * belongs to the act of placing, so it appears with the cursor that needs it
   * and vanishes again afterwards.
   */
  private drawChokeMarks(): void {
    const { ctx, game } = this;
    const chokes = game.map.chokes;
    if (chokes.length === 0 || !game.selectedTowerId) return;
    if (towerDef(game.selectedTowerId).placement !== 'path') return;

    const taken = (choke: { x: number; y: number }) =>
      game.gates.some((gate) => Math.hypot(gate.x - choke.x, gate.y - choke.y) < 8);

    for (const choke of chokes) {
      if (taken(choke)) continue;
      // The wall would stand *across* the line of march, so the mark does too.
      const facing = game.map.chokeStance(choke).angle;
      const nx = -Math.sin(facing);
      const ny = Math.cos(facing);
      const half = game.map.gateHalfWidth;

      ctx.save();
      ctx.setLineDash([10, 8]);
      ctx.strokeStyle = 'rgba(232, 180, 74, 0.85)';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(choke.x - nx * half, choke.y - ny * half);
      ctx.lineTo(choke.x + nx * half, choke.y + ny * half);
      ctx.stroke();
      ctx.setLineDash([]);

      // A bracket at each end, so the span it would seal is unmistakable.
      const tick = 12;
      ctx.beginPath();
      for (const side of [-1, 1]) {
        const ex = choke.x + nx * half * side;
        const ey = choke.y + ny * half * side;
        ctx.moveTo(ex - ny * tick, ey + nx * tick);
        ctx.lineTo(ex + ny * tick, ey - nx * tick);
      }
      ctx.stroke();
      ctx.restore();
    }
  }

  /**
   * Paints one road onto the terrain. The main road is a wide, well-kept
   * highway with cart ruts; a trail is a narrower, more overgrown footpath —
   * no ruts (nothing but feet has ever used it), a mossier edge, and it lets
   * more grass spill across it.
   */
  private paintRoad(
    g: CanvasRenderingContext2D,
    rand: () => number,
    path: Path,
    radius: number,
    isMain: boolean,
  ): void {
    const { def } = this.game.map;
    const roadColour = isMain ? def.road : mix(def.road, def.grassAlt, 0.4);
    const edgeColour = isMain ? def.roadEdge : mix(def.roadEdge, def.grassAlt, 0.35);

    const trace = () => {
      g.beginPath();
      g.moveTo(path.points[0].x, path.points[0].y);
      for (let i = 1; i < path.points.length; i++) g.lineTo(path.points[i].x, path.points[i].y);
    };

    g.lineCap = 'round';
    g.lineJoin = 'round';

    // Trodden verge, then the packed earth (or beaten dirt) itself.
    trace();
    g.strokeStyle = edgeColour;
    g.lineWidth = radius * 2 + (isMain ? 11 : 6);
    g.stroke();

    trace();
    g.strokeStyle = roadColour;
    g.lineWidth = radius * 2;
    g.stroke();

    // Cart ruts worn into the middle — only the main road ever saw a cart.
    if (isMain) {
      for (const side of [-1, 1]) {
        g.beginPath();
        for (let d = 0; d <= path.length; d += 5) {
          const p = path.positionAt(d);
          const nx = -Math.sin(p.angle) * radius * 0.42 * side;
          const ny = Math.cos(p.angle) * radius * 0.42 * side;
          if (d === 0) g.moveTo(p.x + nx, p.y + ny);
          else g.lineTo(p.x + nx, p.y + ny);
        }
        g.strokeStyle = 'rgba(74, 56, 32, 0.28)';
        g.lineWidth = 3.4;
        g.stroke();
      }
    }

    // Grit and stones scattered over the surface.
    for (let d = 0; d < path.length; d += 1.3) {
      const p = path.positionAt(d);
      const off = (rand() * 2 - 1) * radius * 0.95;
      const x = p.x - Math.sin(p.angle) * off;
      const y = p.y + Math.cos(p.angle) * off;
      const pick = rand();
      g.fillStyle =
        pick < 0.45
          ? 'rgba(56, 42, 24, 0.16)'
          : pick < 0.82
            ? 'rgba(232, 220, 195, 0.12)'
            : 'rgba(120, 94, 58, 0.22)';
      g.beginPath();
      g.arc(x, y, 0.5 + rand() * 1.7, 0, TAU);
      g.fill();
    }

    // Grass — and on a trail, fallen leaves and twigs too — spilling over the
    // edges so the road is never a hard band.
    for (let d = 0; d < path.length; d += 2.4) {
      const p = path.positionAt(d);
      for (const side of [-1, 1]) {
        const off = (radius + 1) * side * (0.9 + rand() * 0.22);
        const x = p.x - Math.sin(p.angle) * off;
        const y = p.y + Math.cos(p.angle) * off;
        g.strokeStyle = rand() < 0.5 ? alpha(def.grassAlt, 0.7) : alpha(def.grassLight, 0.6);
        g.lineWidth = 0.8;
        g.beginPath();
        g.moveTo(x, y);
        g.lineTo(x + (rand() - 0.5) * 2, y - 1.5 - rand() * 3);
        g.stroke();
      }
      if (!isMain && rand() < 0.5) {
        const off = (rand() * 2 - 1) * radius * 0.8;
        const x = p.x - Math.sin(p.angle) * off;
        const y = p.y + Math.cos(p.angle) * off;
        g.fillStyle = rand() < 0.5 ? 'rgba(120, 90, 40, 0.3)' : alpha(def.grassAlt, 0.4);
        g.beginPath();
        g.ellipse(x, y, 2 + rand() * 1.6, 1 + rand(), rand() * TAU, 0, TAU);
        g.fill();
      }
    }
  }

  /**
   * True when a point is close enough to any road — main or trail — that
   * ground clutter there would just be hidden underneath it anyway.
   */
  private nearAnyLane(x: number, y: number, margin: number): boolean {
    const { lanes } = this.game.map;
    for (const lane of lanes) {
      if (lane.path.distanceToPoint(x, y) < lane.radius + margin) return true;
    }
    return false;
  }

  private paintRocks(g: CanvasRenderingContext2D, rand: () => number): void {
    const { def } = this.game.map;

    for (const rect of this.game.map.def.obstacles) {
      const cx = rect.x + rect.w / 2;
      const cy = rect.y + rect.h / 2;
      const rx = rect.w / 2;
      const ry = rect.h / 2;

      const outline = (inset: number, offX = 0, offY = 0) => {
        g.beginPath();
        const steps = 13;
        for (let i = 0; i < steps; i++) {
          const a = (i / steps) * TAU;
          const wobble = 0.76 + ((Math.sin(i * 2.7) + 1) / 2) * 0.24;
          const x = cx + offX + Math.cos(a) * rx * wobble * inset;
          const y = cy + offY + Math.sin(a) * ry * wobble * inset;
          if (i === 0) g.moveTo(x, y);
          else g.lineTo(x, y);
        }
        g.closePath();
      };

      // Contact shadow.
      g.fillStyle = 'rgba(0, 0, 0, 0.38)';
      outline(1.02, 4, 6);
      g.fill();

      // Body.
      const grad = g.createLinearGradient(rect.x, rect.y, rect.x + rect.w, rect.y + rect.h);
      grad.addColorStop(0, mix(def.rock, '#a49c90', 0.5));
      grad.addColorStop(0.55, def.rock);
      grad.addColorStop(1, mix(def.rock, '#26241f', 0.55));
      g.fillStyle = grad;
      outline(1);
      g.fill();

      // Upper face catching the light.
      g.fillStyle = 'rgba(206, 199, 184, 0.1)';
      outline(0.62, -rx * 0.14, -ry * 0.18);
      g.fill();

      // Cracks.
      g.strokeStyle = 'rgba(38, 34, 28, 0.4)';
      g.lineWidth = 1.2;
      for (let i = 0; i < 4; i++) {
        const a = rand() * TAU;
        g.beginPath();
        g.moveTo(cx + Math.cos(a) * rx * 0.15, cy + Math.sin(a) * ry * 0.15);
        g.lineTo(cx + Math.cos(a) * rx * 0.8, cy + Math.sin(a) * ry * 0.8);
        g.stroke();
      }

      // Moss on the shaded side.
      g.fillStyle = alpha(def.grassAlt, 0.5);
      for (let i = 0; i < 14; i++) {
        const a = Math.PI * (0.05 + rand() * 0.8);
        const d = 0.55 + rand() * 0.35;
        g.beginPath();
        g.arc(cx + Math.cos(a) * rx * d, cy + Math.sin(a) * ry * d, 1.5 + rand() * 3.5, 0, TAU);
        g.fill();
      }
    }
  }

  /**
   * The city the creeps are marching on: a curtain wall with a gatehouse and
   * two drum towers, and behind it a corner of the town — houses, a market and
   * the royal hall. Only the near corner is shown; the rest runs off the map,
   * which is what makes it read as a city rather than a single keep.
   */
  private paintKeep(g: CanvasRenderingContext2D): void {
    const { width, def } = this.game.map;
    const castle = def.castle;
    const rand = mulberry32(0xc17e);

    // Every block's ground first, then every block's walls, so where two
    // blocks meet the second one's cobbles cannot paint over the first one's
    // wall.
    for (const block of castle.blocks) {
      const { left, top, bottom } = block;

      // ---- Ground inside the walls: cobbled streets.
      g.fillStyle = '#6f6450';
      g.fillRect(left, top, width - left, bottom - top);
      const flecks = Math.round(340 * ((bottom - top) / 275) * ((width - left) / 270));
      for (let i = 0; i < flecks; i++) {
        const x = left + rand() * (width - left);
        const y = top + rand() * (bottom - top);
        g.fillStyle = rand() < 0.5 ? 'rgba(40, 33, 22, 0.2)' : 'rgba(210, 196, 164, 0.11)';
        g.beginPath();
        g.arc(x, y, 0.7 + rand() * 2, 0, TAU);
        g.fill();
      }

      // A street running in from each gate.
      g.strokeStyle = 'rgba(120, 106, 80, 0.55)';
      g.lineWidth = 26;
      g.lineCap = 'round';
      for (const gate of block.gates) {
        g.beginPath();
        g.moveTo(left, gate.y);
        g.lineTo(width, gate.y);
        g.stroke();
      }
    }

    // The town goes in whichever block has room for it.
    const townBlock = castle.blocks.find((b) => b.town);
    if (townBlock) this.paintCastleTown(g, castle, townBlock);

    for (const block of castle.blocks) {
      this.paintCastleWalls(g, block, width, castle.blocks);
    }
  }

  /** The royal hall and the market square inside the walls. */
  private paintCastleTown(
    g: CanvasRenderingContext2D,
    castle: CastleDef,
    block: CastleBlock,
  ): void {
    // Royal hall along the eastern edge, clear of the market and the plots.
    // Placed against the block rather than at fixed coordinates, so a city
    // whose walled quarter sits somewhere else still has its hall inside it.
    // A map may do without one entirely.
    if (castle.hall === false) {
      this.paintMarket(g, castle);
      return;
    }

    const rx = this.game.map.width - 22;
    const ry = block.top + (block.bottom - block.top) * 0.44;
    g.fillStyle = 'rgba(0, 0, 0, 0.42)';
    g.beginPath();
    g.roundRect(rx - 34, ry - 52, 80, 110, 7);
    g.fill();

    const hall = g.createLinearGradient(rx - 40, ry - 60, rx + 40, ry + 60);
    hall.addColorStop(0, '#a49c8e');
    hall.addColorStop(1, '#4f4a43');
    g.fillStyle = hall;
    g.strokeStyle = 'rgba(24, 20, 14, 0.85)';
    g.lineWidth = 3;
    g.beginPath();
    g.roundRect(rx - 40, ry - 60, 84, 120, 7);
    g.fill();
    g.stroke();

    const slate = g.createLinearGradient(0, ry - 44, 0, ry + 44);
    slate.addColorStop(0, '#464a50');
    slate.addColorStop(0.47, '#7f858d');
    slate.addColorStop(0.53, '#565b62');
    slate.addColorStop(1, '#33363b');
    g.fillStyle = slate;
    g.beginPath();
    g.roundRect(rx - 30, ry - 46, 66, 92, 5);
    g.fill();
    g.strokeStyle = 'rgba(20, 22, 25, 0.7)';
    g.lineWidth = 2;
    g.stroke();
    g.beginPath();
    g.moveTo(rx - 30, ry);
    g.lineTo(rx + 36, ry);
    g.lineWidth = 3;
    g.stroke();

    for (const sy of [-1, 1]) {
      const tx = rx - 36;
      const ty = ry + sy * 52;
      g.fillStyle = 'rgba(0, 0, 0, 0.4)';
      g.beginPath();
      g.arc(tx + 3, ty + 4, 15, 0, TAU);
      g.fill();
      const turret = g.createRadialGradient(tx - 5, ty - 6, 2, tx, ty, 14);
      turret.addColorStop(0, '#bcb4a5');
      turret.addColorStop(1, '#514c44');
      g.fillStyle = turret;
      g.beginPath();
      g.arc(tx, ty, 14, 0, TAU);
      g.fill();
      g.strokeStyle = 'rgba(24, 20, 15, 0.85)';
      g.lineWidth = 2.4;
      g.stroke();
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * TAU;
        g.fillStyle = mix('#3c3f44', '#a3a9b1', lightAt(a));
        g.beginPath();
        g.arc(tx + Math.cos(a) * 11.5, ty + Math.sin(a) * 11.5, 3, 0, TAU);
        g.fill();
      }
    }

    g.strokeStyle = '#2e2a24';
    g.lineWidth = 3;
    g.beginPath();
    g.moveTo(rx + 2, ry - 26);
    g.lineTo(rx + 2, ry - 58);
    g.stroke();
    g.fillStyle = '#8f3a30';
    g.beginPath();
    g.moveTo(rx + 2, ry - 58);
    g.lineTo(rx + 28, ry - 52);
    g.lineTo(rx + 2, ry - 40);
    g.closePath();
    g.fill();
    g.fillStyle = '#d8c98d';
    g.beginPath();
    g.arc(rx + 11, ry - 50, 3.2, 0, TAU);
    g.fill();

    this.paintMarket(g, castle);
  }

  /** Market square: stalls ringing an open cobbled space. */
  private paintMarket(g: CanvasRenderingContext2D, castle: CastleDef): void {
    const mx = castle.market.x;
    const my = castle.market.y;
    g.fillStyle = 'rgba(126, 112, 82, 0.55)';
    g.beginPath();
    g.roundRect(mx - 38, my - 36, 76, 72, 6);
    g.fill();
    g.strokeStyle = 'rgba(58, 48, 30, 0.5)';
    g.lineWidth = 2;
    g.stroke();

    const awnings = ['#b4553f', '#4f6f8a', '#9a7f3c', '#6b8a4f'];
    let stall = 0;
    for (const [sx, sy, horiz] of [
      [mx - 27, my - 19, false],
      [mx - 27, my + 17, false],
      [mx + 25, my - 19, false],
      [mx + 25, my + 17, false],
      [mx - 2, my - 28, true],
      [mx - 2, my + 28, true],
    ] as const) {
      const w = horiz ? 15 : 9;
      const h = horiz ? 7 : 12;
      g.fillStyle = 'rgba(0, 0, 0, 0.35)';
      g.beginPath();
      g.roundRect(sx - w + 2, sy - h + 3, w * 2, h * 2, 3);
      g.fill();

      g.fillStyle = awnings[stall++ % awnings.length];
      g.beginPath();
      g.roundRect(sx - w, sy - h, w * 2, h * 2, 3);
      g.fill();
      g.strokeStyle = 'rgba(30, 22, 14, 0.7)';
      g.lineWidth = 1.3;
      g.stroke();

      g.strokeStyle = 'rgba(240, 232, 210, 0.45)';
      g.lineWidth = 2.2;
      if (horiz) {
        for (let t = sx - w + 4; t < sx + w; t += 6) {
          g.beginPath();
          g.moveTo(t, sy - h);
          g.lineTo(t, sy + h);
          g.stroke();
        }
      } else {
        for (let t = sy - h + 4; t < sy + h; t += 6) {
          g.beginPath();
          g.moveTo(sx - w, t);
          g.lineTo(sx + w, t);
          g.stroke();
        }
      }
    }

    // Scales in the middle of the square, so it reads as a place of trade.
    g.strokeStyle = '#4a4038';
    g.lineWidth = 2.6;
    g.beginPath();
    g.moveTo(mx, my + 9);
    g.lineTo(mx, my - 9);
    g.moveTo(mx - 11, my - 7);
    g.lineTo(mx + 11, my - 7);
    g.stroke();
    g.fillStyle = '#c9a54a';
    for (const sx of [-11, 11]) {
      g.beginPath();
      g.ellipse(mx + sx, my - 3, 5, 2.6, 0, 0, TAU);
      g.fill();
    }
  }

  /**
   * One walled block: curtain wall down the west face broken by its gates,
   * runs along the north and south, drum towers at the corners and beside
   * every opening. The east side always runs off the map edge.
   */
  private paintCastleWalls(
    g: CanvasRenderingContext2D,
    block: CastleBlock,
    width: number,
    all: readonly CastleBlock[],
  ): void {
    const { left, top, bottom } = block;
    const gates = block.gates;
    const thickness = 24;

    /*
     * Where one block ends and the next begins there is no wall: the two are
     * the same castle, and the outline steps rather than doubling back on
     * itself. So a north or south face is only drawn as far as the neighbour
     * that continues from it.
     *
     * Without this the L-shaped city reads as two walled compounds with a
     * curtain between them, which is not what a stepped city wall looks like.
     */
    const neighbourAt = (edge: number): number | null => {
      let nearest: number | null = null;
      for (const other of all) {
        if (other === block) continue;
        if (other.top !== edge && other.bottom !== edge) continue;
        // Every block runs east to the map edge, so a neighbour covers this
        // face from its own left edge onwards — including all of it, when that
        // edge is further west than ours. Skipping those was what drew a wall
        // straight across the inside of the city at the step.
        if (nearest === null || other.left < nearest) nearest = other.left;
      }
      return nearest;
    };

    const wallFill = (x: number, y: number, w: number, h: number) => {
      g.fillStyle = 'rgba(22, 18, 13, 0.9)';
      g.fillRect(x - 2, y - 2, w + 4, h + 4);
      const stone = g.createLinearGradient(x, y, x + (w < h ? w : 0), y + (h < w ? h : 0));
      stone.addColorStop(0, '#b3ab9c');
      stone.addColorStop(0.55, '#8e8779');
      stone.addColorStop(1, '#575249');
      g.fillStyle = stone;
      g.fillRect(x, y, w, h);
    };

    // West wall, in the runs between one gate and the next.
    const openings = [...gates].sort((a, b) => a.y - b.y);
    let run = top;
    for (const gate of openings) {
      wallFill(left, run, thickness, gate.y - gate.half - run);
      run = gate.y + gate.half;
    }
    wallFill(left, run, thickness, bottom - run);

    // North and south walls; the east side runs off the map edge, and either
    // face stops where the next block of the same castle carries on from it.
    const northEnd = neighbourAt(top) ?? width;
    const southEnd = neighbourAt(bottom) ?? width;
    if (northEnd > left) wallFill(left, top, northEnd - left, thickness);
    if (southEnd > left) wallFill(left, bottom - thickness, southEnd - left, thickness);

    const inGateway = (y: number, margin: number) =>
      openings.some((gate) => Math.abs(y - gate.y) < gate.half + margin);

    // Merlons along the three outer faces.
    g.fillStyle = mix('#4c473f', '#c3bbab', 0.55);
    g.strokeStyle = 'rgba(26, 22, 16, 0.6)';
    g.lineWidth = 1.5;
    for (let y = top + 8; y < bottom; y += 19) {
      if (inGateway(y, 8)) continue;
      g.beginPath();
      g.roundRect(left - 5, y - 5, 10, 10, 2);
      g.fill();
      g.stroke();
    }
    for (const [edge, end] of [
      [top, northEnd],
      [bottom, southEnd],
    ] as const) {
      for (let x = left + 8; x < end; x += 19) {
        g.beginPath();
        g.roundRect(x - 5, edge - 5, 10, 10, 2);
        g.fill();
        g.stroke();
      }
    }

    // Corner tower where the two runs meet.
    const drum = (tx: number, ty: number, r: number) => {
      g.fillStyle = 'rgba(0, 0, 0, 0.45)';
      g.beginPath();
      g.arc(tx + 4, ty + 5, r, 0, TAU);
      g.fill();
      const body = g.createRadialGradient(tx - r * 0.4, ty - r * 0.4, 3, tx, ty, r);
      body.addColorStop(0, '#c0b8a8');
      body.addColorStop(1, '#524d45');
      g.fillStyle = body;
      g.beginPath();
      g.arc(tx, ty, r, 0, TAU);
      g.fill();
      g.strokeStyle = 'rgba(22, 18, 13, 0.9)';
      g.lineWidth = 3;
      g.stroke();
      for (let i = 0; i < 10; i++) {
        const a = (i / 10) * TAU;
        g.fillStyle = mix('#494440', '#c8c0b0', lightAt(a) * 0.9);
        g.beginPath();
        g.arc(tx + Math.cos(a) * (r - 5), ty + Math.sin(a) * (r - 5), 4.4, 0, TAU);
        g.fill();
      }
      g.fillStyle = '#3f3a32';
      g.beginPath();
      g.arc(tx, ty, r * 0.42, 0, TAU);
      g.fill();
    };

    // Both corners where the west wall meets the north and south runs.
    drum(left + thickness / 2, top + thickness / 2, 23);
    drum(left + thickness / 2, bottom - thickness / 2, 23);

    // Gate towers either side of every opening.
    for (const gate of openings) {
      for (const sy of [-1, 1]) {
        drum(left + thickness / 2, gate.y + sy * (gate.half + 16), 20);
      }
    }

    // Banners on the west wall, in the stretches between the gates.
    const banners = openings.flatMap((gate) => [gate.y - 78, gate.y + 74]);
    for (const by of banners) {
      if (by < top + 34 || by > bottom - 34) continue;
      if (inGateway(by, 26)) continue;
      g.fillStyle = '#8f3a30';
      g.beginPath();
      g.moveTo(left + thickness, by - 11);
      g.lineTo(left + thickness + 15, by - 8);
      g.lineTo(left + thickness + 15, by + 8);
      g.lineTo(left + thickness, by + 11);
      g.closePath();
      g.fill();
      g.strokeStyle = 'rgba(30, 20, 16, 0.6)';
      g.lineWidth = 1.3;
      g.stroke();
      g.fillStyle = '#d8c98d';
      g.beginPath();
      g.arc(left + thickness + 7, by, 3, 0, TAU);
      g.fill();
    }

    // Each gate passage and its open doors.
    for (const gate of openings) {
      const cy = gate.y;
      const gateHalf = gate.half;

      g.fillStyle = '#15100a';
      g.beginPath();
      g.roundRect(left - 6, cy - gateHalf + 3, thickness + 16, gateHalf * 2 - 6, 4);
      g.fill();

      g.fillStyle = '#3b2a17';
      g.strokeStyle = 'rgba(18, 12, 6, 0.9)';
      g.lineWidth = 2;
      for (const sy of [-1, 1]) {
        g.beginPath();
        g.roundRect(left - 2, cy + sy * (gateHalf - 13) - 6, thickness + 8, 12, 3);
        g.fill();
        g.stroke();
      }

      g.strokeStyle = 'rgba(120, 126, 134, 0.7)';
      g.lineWidth = 2;
      for (let t = cy - gateHalf + 8; t < cy + gateHalf - 4; t += 8) {
        g.beginPath();
        g.moveTo(left - 4, t);
        g.lineTo(left + thickness + 6, t);
        g.stroke();
      }
    }
  }

  /**
   * Where a route enters the map: the road fades into tree shadow instead of
   * stopping dead, flanked by a loose stand of trees that leaves the road
   * itself clear. The main road gets a proper treeline; a trail — a much
   * smaller path — only gets a token gap in the undergrowth.
   *
   * Trees are kept clear of the road by `radius` (that lane's own half-width)
   * plus a margin, not a fixed distance — otherwise a narrow trail's trees
   * would loom over it, or the main road's could crowd its wider verge.
   */
  private paintForestEntrance(
    g: CanvasRenderingContext2D,
    rand: () => number,
    path: Path,
    radius: number,
    isMain: boolean,
  ): void {
    const reach = isMain ? 65 : 36;
    const at = Math.min(reach, path.length * 0.4);
    // The shaded patch sits right at the map edge, not partway up the road —
    // units walk the visible stretch of road in full light, only the treeline
    // itself is dim.
    const back = path.positionAt(0);

    const shadeRadius = isMain ? 34 : 16;
    const shade = g.createRadialGradient(back.x, back.y, 2, back.x, back.y, shadeRadius);
    shade.addColorStop(0, 'rgba(8, 12, 5, 0.65)');
    shade.addColorStop(0.55, 'rgba(10, 14, 6, 0.32)');
    shade.addColorStop(1, 'rgba(16, 20, 10, 0)');
    g.fillStyle = shade;
    g.beginPath();
    g.ellipse(back.x, back.y, shadeRadius, shadeRadius * 0.78, 0, 0, TAU);
    g.fill();

    // A loose stand of trees either side of the opening. Alternating sides
    // and randomised offsets keep it from reading as a planted double row.
    const count = isMain ? 8 + Math.floor(rand() * 3) : 3 + Math.floor(rand() * 2);
    const along0 = isMain ? -46 : -20;
    const spread = isMain ? 130 : 54;
    const clearance = radius + (isMain ? 14 : 7);
    const scatter = isMain ? 46 : 16;
    const treeR = () => (isMain ? 16 + rand() * 12 : 8 + rand() * 5);

    for (let i = 0; i < count; i++) {
      const side = i % 2 === 0 ? 1 : -1;
      const along = along0 + rand() * spread;
      const across = (clearance + rand() * scatter) * side;
      const q = path.positionAt(Math.max(0, at + along));
      const tx = q.x - Math.sin(q.angle) * across;
      const ty = q.y + Math.cos(q.angle) * across;
      this.drawTree(g, tx, ty, treeR(), rand);
    }
  }

  /** One procedural tree: a trunk and a few overlapping canopy blobs. */
  private drawTree(g: CanvasRenderingContext2D, x: number, y: number, r: number, rand: () => number): void {
    const { def } = this.game.map;

    g.fillStyle = 'rgba(0, 0, 0, 0.3)';
    g.beginPath();
    g.ellipse(x + r * 0.15, y + r * 0.5, r * 0.8, r * 0.36, 0, 0, TAU);
    g.fill();

    g.strokeStyle = '#4a3a24';
    g.lineWidth = Math.max(1.5, r * 0.16);
    g.lineCap = 'round';
    g.beginPath();
    g.moveTo(x, y + r * 0.15);
    g.lineTo(x, y + r * 0.7);
    g.stroke();

    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * TAU + rand() * 0.8;
      const cx = x + Math.cos(a) * r * 0.28;
      const cy = y + Math.sin(a) * r * 0.22 - r * 0.28;
      const rad = r * (0.5 + rand() * 0.28);
      const grad = g.createRadialGradient(cx - rad * 0.3, cy - rad * 0.35, rad * 0.15, cx, cy, rad);
      grad.addColorStop(0, mix(def.grassLight, '#4f6a2d', 0.5));
      grad.addColorStop(1, mix(def.grassAlt, '#131d0a', 0.55));
      g.fillStyle = grad;
      g.beginPath();
      g.arc(cx, cy, rad, 0, TAU);
      g.fill();
    }
  }

  // ================================================================ entities

  private drawGates(): void {
    const { ctx } = this;
    const halfWidth = this.game.map.gateHalfWidth;

    for (const gate of this.game.gates) {
      const sprite = this.towerSprites.get(gate.def.id);

      ctx.save();
      ctx.translate(gate.x, gate.y);
      ctx.rotate(gate.angle);
      if (sprite) {
        const half = sprite.size / 2;
        ctx.drawImage(sprite.canvas, -half, -half, sprite.size, sprite.size);
      }
      drawGate(ctx, halfWidth, gate.def.radius * 0.62, gate.hp / gate.maxHp);
      ctx.restore();

      // Gate integrity bar, laid alongside the road.
      if (gate.hp < gate.maxHp) {
        const w = halfWidth * 2;
        const x = gate.x - w / 2;
        const y = gate.y - gate.def.radius * 1.9;
        const ratio = clamp(gate.hp / gate.maxHp, 0, 1);
        ctx.fillStyle = 'rgba(14, 11, 7, 0.65)';
        ctx.fillRect(x - 1, y - 1, w + 2, 6);
        ctx.fillStyle = ratio > 0.5 ? '#9aa3ad' : ratio > 0.2 ? '#d8b13a' : '#c4483a';
        ctx.fillRect(x, y, w * ratio, 4);
      }

      for (const slot of gate.installed) this.drawTower(slot);
    }
  }

  private drawTowers(): void {
    for (const tower of this.game.towers) this.drawTower(tower);
  }

  /** Which sprite variant a tower currently shows, given its upgrades. */
  private spriteKey(tower: Tower): string {
    const id = tower.def.id;
    if (tower.def.visual === 'house') {
      // Keyed off the upgrades themselves, not the capacity they grant: the
      // numbers are balance figures and have been re-tuned once already.
      if (tower.purchased.has('townhouse')) return `${id}:2`;
      return tower.purchased.has('timber-frame') ? `${id}:1` : id;
    }
    if (tower.def.visual === 'farm') {
      const s = tower.stats.crowProtection >= 1 ? ':s' : '';
      const h = tower.stats.foodOutput > (tower.def.foodOutput ?? 0) ? ':h' : '';
      return `${id}${s}${h}`;
    }
    if (tower.stats.elevated > 0) return `${id}:elevated`;
    return id;
  }

  private drawTower(tower: Tower): void {
    const { ctx } = this;
    // The plot marking goes down before the building, so it reads as ground
    // the building stands on rather than a hoop painted over its roof.
    this.drawSlotRing(tower);

    const sprite = this.towerSprites.get(this.spriteKey(tower)) ?? this.towerSprites.get(tower.def.id);
    if (sprite) drawSprite(ctx, sprite, tower.x, tower.y);

    ctx.save();
    ctx.translate(tower.x, tower.y);
    ctx.rotate(tower.angle);
    if (DEFENDER_DRAWERS[tower.def.visual]) {
      // A melee post is empty once its men are out on the road; the fighters
      // themselves are drawn in `drawFighters`.
    } else if (tower.def.visual === 'archer') {
      drawArcherFigure(ctx, tower.def.radius * 1.35, tower.flash);
    } else if (tower.def.visual === 'crossbow') {
      drawCrossbowFigure(ctx, tower.def.radius * 1.35, tower.flash);
    } else if (tower.def.visual === 'flail-guard') {
      // Drawn *un*rotated: the head's position comes from the tower's own
      // sweep angle, not from a turret facing, so the ball on screen is the
      // ball the rules move. `range` minus the orbit is the head's reach.
      ctx.rotate(-tower.angle);
      drawFlailGuard(
        ctx,
        tower.def.radius,
        tower.flash,
        tower.stats.whirlwindRadius,
        tower.flailAngle,
        tower.stats.range - tower.stats.whirlwindRadius,
      );
      ctx.rotate(tower.angle);
    } else if (tower.def.visual === 'rock-thrower') {
      drawRockThrower(ctx, tower.def.radius, tower.flash);
    } else if (tower.def.visual === 'hot-oil') {
      drawOilCauldron(ctx, tower.def.radius, tower.flash);
    } else if (tower.def.visual === 'houndmaster') {
      drawHoundmasterFigure(ctx, tower.def.radius);
    } else if (tower.def.visual === 'catapult') {
      drawCatapultArm(
        ctx,
        tower.def.radius,
        tower.flash,
        tower.stats.crew,
        tower.stats.damageType === 'fire',
      );
    }
    ctx.restore();

    // A spent hound tower has nothing left to give; mark it so.
    if (tower.isSpent) {
      ctx.strokeStyle = 'rgba(196, 72, 58, 0.75)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(tower.x, tower.y, tower.def.radius * 1.12, 0, TAU);
      ctx.stroke();
    }

    // How badly knocked about a shootable emplacement is.
    if (tower.isShootable && tower.buildingHp < tower.stats.buildingHp) {
      const w = tower.def.radius * 1.6;
      const x = tower.x - w / 2;
      const y = tower.y - tower.def.radius - 7;
      const ratio = clamp(tower.buildingHealthFraction, 0, 1);
      ctx.fillStyle = 'rgba(14, 11, 7, 0.65)';
      ctx.fillRect(x - 1, y - 1, w + 2, 5.4);
      ctx.fillStyle = ratio > 0.5 ? '#9aa3ad' : ratio > 0.25 ? '#d8b13a' : '#c4483a';
      ctx.fillRect(x, y, w * ratio, 3.4);

      // A crew that has downed tools to mend the engine says so.
      if (tower.repairing) {
        ctx.fillStyle = 'rgba(120, 196, 128, 0.95)';
        ctx.fillRect(tower.x - 1.2, y - 8, 2.4, 6.4);
        ctx.fillRect(tower.x - 3.2, y - 5.8, 6.4, 2.4);
      }
    }
  }

  /**
   * The ring on the ground marking the plot a building stands on.
   *
   * There is exactly one of these per tower and it is the same ring in every
   * state — it just changes colour. Amber means the realm is hungry and this
   * building is working at reduced effectiveness. Drawing a second ring for
   * that instead read as clutter, and made two circles compete for the same
   * meaning.
   */
  private drawSlotRing(tower: Tower): void {
    const { ctx } = this;
    const hungry = tower.effectiveness < 1;
    const r = tower.def.radius * 0.98;

    ctx.strokeStyle = hungry ? 'rgba(216, 158, 48, 0.9)' : 'rgba(226, 217, 190, 0.26)';
    ctx.lineWidth = hungry ? 2 : 1.4;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.arc(tower.x, tower.y, r, 0, TAU);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.fillStyle = hungry ? 'rgba(216, 158, 48, 0.15)' : 'rgba(226, 217, 190, 0.05)';
    ctx.beginPath();
    ctx.arc(tower.x, tower.y, r, 0, TAU);
    ctx.fill();
  }

  /** Melee fighters out on the road, with a health bar and a mark when retreating. */
  private drawFighters(): void {
    const { ctx } = this;
    for (const tower of this.game.towers) {
      const drawFigure = DEFENDER_DRAWERS[tower.def.visual] ?? drawSwordsman;
      for (const unit of tower.units) {
        // The Wirbelattacke: a bright arc sweeping outward as the blade comes round.
        if (unit.spin > 0 && tower.stats.whirlwindRadius > 0) {
          const r = tower.stats.whirlwindRadius;
          const sweep = 1 - unit.spin;
          ctx.save();
          ctx.translate(unit.x, unit.y);
          ctx.rotate(sweep * TAU * 1.4);
          ctx.strokeStyle = `rgba(226, 232, 240, ${0.75 * unit.spin})`;
          ctx.lineWidth = 4.5 * unit.spin + 1;
          ctx.beginPath();
          ctx.arc(0, 0, r * (0.55 + sweep * 0.45), -1.5, 1.5);
          ctx.stroke();
          ctx.strokeStyle = `rgba(180, 196, 214, ${0.3 * unit.spin})`;
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.arc(0, 0, r * (0.55 + sweep * 0.45) - 6, -1.3, 1.3);
          ctx.stroke();
          ctx.restore();
        }

        ctx.save();
        ctx.translate(unit.x, unit.y);
        ctx.rotate(unit.angle);
        drawFigure(ctx, unit.gait, unit.state === 'fighting', unit.state === 'idle');
        ctx.restore();

        if (unit.hp < unit.maxHp) {
          const w = 20;
          const x = unit.x - w / 2;
          const y = unit.y + 12;
          const ratio = clamp(unit.healthFraction, 0, 1);
          ctx.fillStyle = 'rgba(14, 11, 7, 0.6)';
          ctx.fillRect(x - 0.8, y - 0.8, w + 1.6, 4.6);
          ctx.fillStyle = ratio > 0.5 ? '#68b545' : ratio > 0.25 ? '#d8b13a' : '#c4483a';
          ctx.fillRect(x, y, w * ratio, 3);
        }

        // A red cross while he is falling back or being treated.
        if (unit.state === 'retreating' || unit.state === 'healing') {
          ctx.fillStyle = 'rgba(200, 74, 62, 0.9)';
          ctx.fillRect(unit.x - 1.2, unit.y - 19, 2.4, 7);
          ctx.fillRect(unit.x - 3.5, unit.y - 16.7, 7, 2.4);
        }
      }
    }
  }

  private drawDogs(): void {
    const { ctx } = this;
    for (const tower of this.game.towers) {
      for (const dog of tower.dogs) {
        ctx.save();
        ctx.translate(dog.x, dog.y);
        ctx.rotate(dog.angle);
        drawDog(ctx, dog.gait, dog.state === 'fighting');
        ctx.restore();

        // The dog's health. Kept small and slung below it so it does not sit on
        // top of whatever it is biting.
        if (dog.hp < dog.maxHp) {
          const w = 13;
          const x = dog.x - w / 2;
          const y = dog.y + 11;
          const ratio = clamp(dog.healthFraction, 0, 1);
          ctx.fillStyle = 'rgba(14, 11, 7, 0.6)';
          ctx.fillRect(x - 0.8, y - 0.8, w + 1.6, 3.6);
          ctx.fillStyle = ratio > 0.4 ? '#b0873a' : '#b03e33';
          ctx.fillRect(x, y, w * ratio, 2);
        }
      }
    }
  }

  /** Reserved city plots that are still empty, marked out with stakes. */
  private drawEmptyLots(): void {
    const { ctx, game } = this;
    const pulse = 0.55 + Math.sin(performance.now() * 0.003) * 0.2;

    for (const lot of game.map.def.castle.lots) {
      if (game.towers.some((t) => Math.hypot(t.x - lot.x, t.y - lot.y) < 4)) continue;

      const r = lot.accepts === 'farm' ? 20 : lot.accepts === 'research' ? 25 : 15;

      ctx.fillStyle = 'rgba(70, 60, 40, 0.35)';
      ctx.beginPath();
      ctx.roundRect(lot.x - r, lot.y - r, r * 2, r * 2, 4);
      ctx.fill();

      ctx.strokeStyle = `rgba(232, 217, 181, ${0.35 * pulse + 0.2})`;
      ctx.lineWidth = 1.6;
      ctx.setLineDash([5, 4]);
      ctx.beginPath();
      ctx.roundRect(lot.x - r, lot.y - r, r * 2, r * 2, 4);
      ctx.stroke();
      ctx.setLineDash([]);

      // Corner stakes so it reads as a marked-out plot.
      ctx.fillStyle = '#6b4f2c';
      for (const sx of [-1, 1]) {
        for (const sy of [-1, 1]) {
          ctx.beginPath();
          ctx.arc(lot.x + sx * r, lot.y + sy * r, 2.4, 0, TAU);
          ctx.fill();
        }
      }

      // A hint of what belongs here.
      ctx.fillStyle = `rgba(240, 230, 200, ${0.5 * pulse + 0.25})`;
      ctx.font = `${Math.round(r * 0.62)}px Georgia, serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(
        lot.accepts === 'farm' ? '🌾' : lot.accepts === 'research' ? '✎' : '⌂',
        lot.x,
        lot.y,
      );
      ctx.textAlign = 'start';
      ctx.textBaseline = 'alphabetic';
    }
  }

  /** Range ring for whatever the player has clicked. */
  private drawSelection(): void {
    const selected = this.game.selected;
    if (!selected) return;
    const tower = this.game.selectedTower;
    const radius = tower
      ? tower.stats.range
      : 'def' in selected
        ? selected.def.radius * 1.5
        : 34;
    if (radius <= 0) return;

    const { ctx } = this;
    ctx.fillStyle = 'rgba(232, 180, 74, 0.1)';
    ctx.strokeStyle = 'rgba(232, 180, 74, 0.6)';
    ctx.lineWidth = 2;
    ctx.setLineDash([9, 7]);
    ctx.beginPath();
    ctx.arc(selected.x, selected.y, radius, 0, TAU);
    ctx.fill();
    ctx.stroke();
    ctx.setLineDash([]);
  }

  private drawCreeps(): void {
    for (const creep of this.game.creeps) this.drawCreep(creep);
  }

  private drawCreep(creep: Creep): void {
    const { ctx } = this;
    const { def } = creep;

    // Enemy war dogs get the four-legged treatment rather than a blob.
    if (def.visual === 'hound') {
      ctx.save();
      ctx.translate(creep.x, creep.y);
      ctx.rotate(creep.angle);
      ctx.scale(1.05, 1.05);
      drawDog(ctx, creep.distance, creep.blocked, def.color, def.outline);
      ctx.restore();

      if (creep.burns.length > 0) this.drawBurning(creep);
      if (creep.hp < creep.maxHp) this.drawHealthBar(creep);
      return;
    }

    // The battering ram: not a person, so no gait to animate — it just sits
    // there and gets bigger or smaller with damage the way any figure does.
    if (def.visual === 'ram') {
      ctx.save();
      ctx.translate(creep.x, creep.y);
      ctx.rotate(creep.angle);
      ctx.scale(1.7, 1.7);
      drawRamFigure(ctx);
      ctx.restore();

      if (creep.burns.length > 0) this.drawBurning(creep);
      if (creep.hp < creep.maxHp) this.drawHealthBar(creep);
      return;
    }

    const figure = def.visual ? FIGURE_DRAWERS[def.visual] : undefined;
    if (figure) {
      ctx.save();
      ctx.translate(creep.x, creep.y);
      ctx.rotate(creep.angle);
      ctx.scale(figure.scale, figure.scale);
      // "Fighting" covers standing still to shoot as well as being held: an
      // archer halted to loose should be drawing his bow, not strolling.
      figure.draw(ctx, creep.distance, creep.blocked || creep.bombarding);
      ctx.restore();

      if (creep.burns.length > 0) this.drawBurning(creep);
      if (creep.hp < creep.maxHp) this.drawHealthBar(creep);
      return;
    }

    ctx.fillStyle = 'rgba(0, 0, 0, 0.34)';
    ctx.beginPath();
    ctx.ellipse(creep.x + 1.5, creep.y + def.radius * 0.45, def.radius * 0.95, def.radius * 0.5, 0, 0, TAU);
    ctx.fill();

    const body = ctx.createRadialGradient(
      creep.x - def.radius * 0.4,
      creep.y - def.radius * 0.45,
      def.radius * 0.15,
      creep.x,
      creep.y,
      def.radius,
    );
    body.addColorStop(0, mix(def.color, '#ffffff', 0.32));
    body.addColorStop(1, mix(def.color, def.outline, 0.55));
    ctx.fillStyle = body;
    ctx.beginPath();
    ctx.arc(creep.x, creep.y, def.radius, 0, TAU);
    ctx.fill();

    ctx.strokeStyle = alpha(def.outline, 0.75);
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // A notch showing which way it faces.
    ctx.fillStyle = alpha(def.outline, 0.8);
    ctx.beginPath();
    ctx.arc(
      creep.x + Math.cos(creep.angle) * def.radius * 0.55,
      creep.y + Math.sin(creep.angle) * def.radius * 0.55,
      def.radius * 0.24,
      0,
      TAU,
    );
    ctx.fill();

    if (creep.burns.length > 0) this.drawBurning(creep);
    if (creep.hp < creep.maxHp) this.drawHealthBar(creep);
  }

  /** Anything set alight glows and smoulders. */
  private drawBurning(creep: Creep): void {
    const { ctx } = this;
    const r = creep.def.radius;
    const flicker = 0.75 + Math.sin(performance.now() * 0.02 + creep.x) * 0.25;

    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const glow = ctx.createRadialGradient(creep.x, creep.y, r * 0.2, creep.x, creep.y, r * 1.5);
    const strength = creep.burns.length > 1 ? 0.55 : 0.35;
    glow.addColorStop(0, `rgba(214, 104, 26, ${strength * flicker})`);
    glow.addColorStop(1, 'rgba(150, 40, 10, 0)');
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(creep.x, creep.y, r * 1.5, 0, TAU);
    ctx.fill();
    ctx.restore();
  }

  private drawHealthBar(creep: Creep): void {
    const { ctx } = this;
    const w = creep.def.radius * 2;
    const h = 3;
    const x = creep.x - w / 2;
    const y = creep.y - creep.def.radius - 8;
    const ratio = clamp(creep.hp / creep.maxHp, 0, 1);

    ctx.fillStyle = 'rgba(18, 14, 10, 0.55)';
    ctx.fillRect(x - 1, y - 1, w + 2, h + 2);
    ctx.fillStyle = ratio > 0.5 ? '#68b545' : ratio > 0.25 ? '#d8b13a' : '#c4483a';
    ctx.fillRect(x, y, w * ratio, h);
  }

  private drawProjectiles(): void {
    const { ctx } = this;
    for (const p of this.game.projectiles) {
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.angle);
      if (p.spec.damageType === 'fire') drawFlameTrail(ctx, p.spec.radius);
      if (p.spec.shape === 'arrow') drawArrow(ctx);
      else if (p.spec.shape === 'flail') drawFlailHead(ctx, p.spec.radius);
      else drawBoulder(ctx, p.spec.radius);
      ctx.restore();
    }
  }

  private drawFires(): void {
    for (const fire of this.game.fires) {
      drawFireField(this.ctx, fire.x, fire.y, fire.radius, fire.age);
    }
  }

  // ============================================================ build preview

  private drawGhost(): void {
    const { ctx, game } = this;
    if (!game.selectedTowerId || !game.hover) return;
    if (game.state === 'gameover' || game.state === 'victory') return;

    const def = towerDef(game.selectedTowerId);
    const { x, y } = game.hover;
    const ok = game.placementStatus(x, y) === 'ok';
    const tint = ok ? '104, 181, 69' : '196, 72, 58';
    const sprite = this.towerSprites.get(def.id);

    // A structure that goes on the road previews snapped and squared to it —
    // or, where the map names its chokes, snapped into the gap it will seal.
    if (def.placement === 'path') {
      const choke = game.map.chokes.length > 0 ? chokeNear(game.map, x, y) : null;
      const route = game.map.lane(choke?.route ?? 'main');
      const stance = choke
        ? game.map.chokeStance(choke)
        : route.path.positionAt(route.path.nearestDistance(x, y));

      ctx.save();
      ctx.translate(stance.x, stance.y);
      ctx.rotate(stance.angle + game.gateRotation);
      if (sprite) {
        ctx.globalAlpha = 0.7;
        const half = sprite.size / 2;
        ctx.drawImage(sprite.canvas, -half, -half, sprite.size, sprite.size);
        ctx.globalAlpha = 1;
      }
      ctx.strokeStyle = `rgba(${tint}, 0.95)`;
      ctx.lineWidth = 3;
      ctx.setLineDash([8, 6]);
      const reach = game.map.gateHalfWidth + def.radius * 1.28;
      ctx.strokeRect(-def.radius * 0.7, -reach, def.radius * 1.4, reach * 2);
      ctx.setLineDash([]);
      ctx.restore();
      return;
    }

    ctx.fillStyle = `rgba(${tint}, 0.12)`;
    ctx.strokeStyle = `rgba(${tint}, 0.65)`;
    ctx.lineWidth = 2;
    ctx.setLineDash([9, 7]);
    ctx.beginPath();
    ctx.arc(x, y, def.range, 0, TAU);
    ctx.fill();
    ctx.stroke();
    ctx.setLineDash([]);

    if (sprite) {
      ctx.globalAlpha = 0.7;
      drawSprite(ctx, sprite, x, y);
      ctx.globalAlpha = 1;
    }

    ctx.strokeStyle = `rgba(${tint}, 0.95)`;
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.arc(x, y, def.radius * 1.1, 0, TAU);
    ctx.stroke();
  }
}
