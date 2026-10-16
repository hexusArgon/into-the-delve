/** Потолок плотности холста. Выше тройной кадр на телефоне уже не держит 60. */
export const PIXEL_CAP = 3;

/** Кадр должен оставить запас браузеру, иначе 60 срывается. */
export const FRAME_BUSY_MS = 13.5;

const PIXEL_STEP = 0.25;

/** Плотность экрана, но не ниже 1 и не выше потолка. */
export function pixelCeiling(dpr: number): number {
  if (!Number.isFinite(dpr) || dpr <= 1) return 1;
  return Math.min(PIXEL_CAP, dpr);
}

/** Сторона иконки в пикселях холста при этой плотности. */
export function bitmapSize(cssPixels: number, dpr: number): number {
  return Math.max(1, Math.round(cssPixels * pixelCeiling(dpr)));
}

function roundStep(value: number): number {
  return Math.round(Math.round(value / PIXEL_STEP) * PIXEL_STEP * 100) / 100;
}

/**
 * Следующая плотность. Выше текущей не идём, если оценка кадра уже не укладывается,
 * и не возвращаемся на плотность, которая уже не успевала (`blocked`).
 */
export function nextPixelScale(current: number, ceiling: number, blocked: number, p90: number): number {
  if (p90 > FRAME_BUSY_MS && current > 1) return Math.max(1, roundStep(current - PIXEL_STEP));
  const up = Math.min(ceiling, roundStep(current + PIXEL_STEP));
  if (up <= current + 1e-6 || up >= blocked - 1e-6) return current;
  const estimate = p90 * (up / current) ** 2;
  if (estimate < FRAME_BUSY_MS) return up;
  return current;
}
