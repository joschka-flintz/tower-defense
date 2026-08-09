/**
 * Makes the HUD panels movable, resizable and collapsible.
 *
 * - `data-drag="<panel id>"` turns an element into that panel's grab handle.
 * - `data-min="<panel id>"` turns a button into its collapse toggle.
 * - `data-resize` on a panel gives it a corner grip.
 *
 * Dragging works in percentages of the stage so a panel stays where it was put
 * when the window is resized. Resizing works by scaling the panel's own unit
 * (`--panel-scale`) rather than setting a width, so the whole panel — text,
 * padding, swatches and all — grows and shrinks together instead of the box
 * changing while the contents stay the same size.
 */

/** How small and how large a panel may be scaled by its corner grip. */
const MIN_SCALE = 0.45;
const MAX_SCALE = 2;

export function makePanelsMovable(): void {
  const stage = document.querySelector<HTMLElement>('#stage');
  if (!stage) return;

  for (const handle of document.querySelectorAll<HTMLElement>('[data-drag]')) {
    const panel = document.getElementById(handle.dataset.drag ?? '');
    if (panel) attachDrag(stage, panel, handle);
  }

  for (const panel of document.querySelectorAll<HTMLElement>('[data-resize]')) {
    attachResize(panel);
  }

  for (const button of document.querySelectorAll<HTMLElement>('[data-min]')) {
    button.addEventListener('click', (event) => {
      event.stopPropagation();
      const panel = document.getElementById(button.dataset.min ?? '');
      if (!panel) return;
      const collapsed = panel.classList.toggle('minimised');
      button.innerHTML = collapsed ? '&plus;' : '&minus;';
      button.title = collapsed ? 'Expand' : 'Minimise';
    });
  }

  // A panel parked near an edge can end up off-stage when the window shrinks.
  new ResizeObserver(() => {
    for (const panel of document.querySelectorAll<HTMLElement>('.panel.draggable')) {
      keepOnStage(stage, panel);
    }
  }).observe(stage);
}

function attachDrag(stage: HTMLElement, panel: HTMLElement, handle: HTMLElement): void {
  handle.addEventListener('pointerdown', (event) => {
    // Let the buttons in the header do their own job.
    if ((event.target as HTMLElement).closest('button')) return;
    event.preventDefault();

    const stageBox = stage.getBoundingClientRect();
    const panelBox = panel.getBoundingClientRect();
    const grabX = event.clientX - panelBox.left;
    const grabY = event.clientY - panelBox.top;

    // Switch to explicit top/left so the panel can go anywhere on the stage.
    panel.style.right = 'auto';
    panel.style.bottom = 'auto';
    panel.style.transform = 'none';

    const move = (e: PointerEvent) => {
      // Re-measure: a panel whose body scrolls can change height mid-drag.
      const box = panel.getBoundingClientRect();
      const maxX = stageBox.width - box.width;
      const maxY = stageBox.height - box.height;
      const x = Math.min(Math.max(e.clientX - stageBox.left - grabX, 0), Math.max(maxX, 0));
      const y = Math.min(Math.max(e.clientY - stageBox.top - grabY, 0), Math.max(maxY, 0));
      panel.style.left = `${(x / stageBox.width) * 100}%`;
      panel.style.top = `${(y / stageBox.height) * 100}%`;
    };

    const stop = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', stop);
    };

    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', stop);
  });
}

/**
 * Adds the corner grip. Dragging it away from the panel's top-left corner
 * makes the panel bigger, towards it smaller; double-clicking resets it.
 */
function attachResize(panel: HTMLElement): void {
  const grip = document.createElement('div');
  grip.className = 'panel-resize';
  grip.title = 'Drag to resize, double-click to reset';
  panel.appendChild(grip);

  grip.addEventListener('dblclick', (event) => {
    event.stopPropagation();
    panel.style.removeProperty('--panel-scale');
  });

  grip.addEventListener('pointerdown', (event) => {
    event.preventDefault();
    event.stopPropagation();
    grip.setPointerCapture(event.pointerId);

    const startBox = panel.getBoundingClientRect();
    const startScale = currentScale(panel);
    const startX = event.clientX;
    const startY = event.clientY;

    const move = (e: PointerEvent) => {
      // Project the drag onto the panel's diagonal, so pulling right and down
      // both enlarge it and the panel keeps its proportions.
      const delta = ((e.clientX - startX) + (e.clientY - startY)) / 2;
      const grown = (startBox.width + delta * 2) / startBox.width;
      const scale = clamp(startScale * grown, MIN_SCALE, MAX_SCALE);
      panel.style.setProperty('--panel-scale', String(round(scale)));
    };

    const stop = () => {
      grip.releasePointerCapture(event.pointerId);
      grip.removeEventListener('pointermove', move);
      grip.removeEventListener('pointerup', stop);
    };

    grip.addEventListener('pointermove', move);
    grip.addEventListener('pointerup', stop);
  });
}

function currentScale(panel: HTMLElement): number {
  const raw = getComputedStyle(panel).getPropertyValue('--panel-scale').trim();
  const value = Number.parseFloat(raw);
  return Number.isFinite(value) && value > 0 ? value : 1;
}

/** Nudge a panel back inside the stage after the window has changed size. */
function keepOnStage(stage: HTMLElement, panel: HTMLElement): void {
  if (panel.classList.contains('hidden')) return;
  // Only panels the player has actually moved carry an explicit position.
  if (!panel.style.left && !panel.style.top) return;

  const stageBox = stage.getBoundingClientRect();
  const box = panel.getBoundingClientRect();
  if (stageBox.width === 0 || stageBox.height === 0) return;

  const x = clamp(box.left - stageBox.left, 0, Math.max(stageBox.width - box.width, 0));
  const y = clamp(box.top - stageBox.top, 0, Math.max(stageBox.height - box.height, 0));
  panel.style.left = `${(x / stageBox.width) * 100}%`;
  panel.style.top = `${(y / stageBox.height) * 100}%`;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function round(value: number): number {
  return Math.round(value * 1000) / 1000;
}
