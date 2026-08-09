/** Logic runs at a constant rate so the game plays identically on every machine. */
export const STEP = 1 / 60;

/** If the tab was backgrounded, never simulate more than this much time at once. */
const MAX_FRAME_TIME = 0.25;

export interface LoopHandle {
  stop(): void;
}

/**
 * Fixed-timestep game loop: `update` is called in constant STEP increments,
 * `render` once per animation frame.
 */
export function startLoop(
  update: (dt: number) => void,
  render: () => void,
): LoopHandle {
  let last = performance.now();
  let accumulator = 0;
  let running = true;
  let handle = 0;

  const frame = (now: number) => {
    if (!running) return;
    handle = requestAnimationFrame(frame);

    accumulator += Math.min((now - last) / 1000, MAX_FRAME_TIME);
    last = now;

    while (accumulator >= STEP) {
      update(STEP);
      accumulator -= STEP;
    }

    render();
  };

  handle = requestAnimationFrame(frame);

  return {
    stop() {
      running = false;
      cancelAnimationFrame(handle);
    },
  };
}
