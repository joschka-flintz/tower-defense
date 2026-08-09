import { startLoop } from './core/loop';
import { Game } from './game/Game';
import { Renderer } from './render/Renderer';
import { createHud } from './ui/hud';
import { makePanelsMovable } from './ui/panels';

const found = document.querySelector<HTMLCanvasElement>('#game');
if (!found) throw new Error('Missing <canvas id="game"> in index.html');
const canvas: HTMLCanvasElement = found;

const game = new Game();
const renderer = new Renderer(canvas, game);
const hud = createHud(game);
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
});

startLoop(
  (dt) => game.update(dt),
  () => {
    renderer.render();
    hud.update();
  },
);

// Dev-only handle so the game can be inspected or driven from the browser console.
if (import.meta.env.DEV) {
  Object.assign(window, { td: { game, renderer, hud } });
}
