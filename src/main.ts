import { startLoop } from './core/loop';
import { Game } from './game/Game';
import { Renderer } from './render/Renderer';
import { createHud } from './ui/hud';
import { makePanelsMovable } from './ui/panels';
import { createStartScreen } from './ui/start';

const found = document.querySelector<HTMLCanvasElement>('#game');
if (!found) throw new Error('Missing <canvas id="game"> in index.html');
const canvas: HTMLCanvasElement = found;

/**
 * One game, one renderer and one HUD for the life of the page.
 *
 * The start screen configures this game rather than building a new one. That
 * matters: the HUD binds itself to DOM elements once, and the renderer bakes
 * its sprites once, so making a fresh set per game would double up every
 * listener and repeat several seconds of sprite work. `Game.configure` swaps
 * the map and resets the board; `Renderer.render` notices the new ground and
 * repaints its terrain.
 */
const game = new Game();
const renderer = new Renderer(canvas, game);
const startScreen = createStartScreen((config) => {
  game.configure(config);
  startScreen.hide();
});
const hud = createHud(game, { onMenu: () => startScreen.show() });
makePanelsMovable();

/** Match the canvas pixel buffer to its on-screen size so nothing looks blurry. */
function resize(): void {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const rect = canvas.getBoundingClientRect();
  if (rect.width === 0 || rect.height === 0) return;
  canvas.width = Math.round(rect.width * dpr);
  canvas.height = Math.round(rect.height * dpr);
}

resize();
new ResizeObserver(resize).observe(canvas);

/** Convert a browser event position into world coordinates. */
function toWorld(event: MouseEvent): { x: number; y: number } {
  const rect = canvas.getBoundingClientRect();
  return {
    x: ((event.clientX - rect.left) / rect.width) * game.map.width,
    y: ((event.clientY - rect.top) / rect.height) * game.map.height,
  };
}

canvas.addEventListener('mousemove', (event) => {
  game.hover = toWorld(event);
});

canvas.addEventListener('mouseleave', () => {
  game.hover = null;
});

canvas.addEventListener('click', (event) => {
  const { x, y } = toWorld(event);
  game.hover = { x, y };

  // In build mode a click places a tower; otherwise it inspects one.
  if (game.selectedTowerId) {
    game.tryPlaceTower(x, y);
  } else {
    game.selectAt(x, y);
  }
});

canvas.addEventListener('contextmenu', (event) => {
  event.preventDefault();
  game.selectedTowerId = null;
  game.selected = null;
});

window.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') {
    game.selectedTowerId = null;
    game.selected = null;
  }
  // Nudge a gatehouse round for corners where squaring to the road is wrong.
  if (event.key === 'r' || event.key === 'R') {
    game.gateRotation += (event.shiftKey ? -1 : 1) * (Math.PI / 12);
  }
  // Show where the enemy actually walks, and how much room it has. On a map
  // whose ground is drawn by hand this is how you see what moving a hill did.
  if (event.key === 'p' || event.key === 'P') {
    renderer.showRoutes = !renderer.showRoutes;
  }
});

startLoop(
  // The world stands still behind the start screen — the board on show there
  // is the last game's, and it should not quietly play on without a player.
  (dt) => {
    if (!startScreen.visible) game.update(dt);
  },
  () => {
    renderer.render();
    hud.update();
  },
);

// Dev-only handle so the game can be inspected or driven from the browser console.
if (import.meta.env.DEV) {
  Object.assign(window, { td: { game, renderer, hud, startScreen } });
}
