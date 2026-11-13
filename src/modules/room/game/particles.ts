import { reduceMotion } from "./comfort.ts";
import { hash01 } from "./juice.ts";
import type { Box } from "./dungeon.ts";
import type { RoomState } from "./sim.ts";

/**
 * Частицы над лужами стихий: искры над огнём, пузыри яда, пар над водой, блёстки инея.
 * Без состояния: положение каждой частицы — функция времени и клетки, поэтому кадр не копит
 * объекты и одинаков после паузы.
 */
export function drawElementParticles(ctx: CanvasRenderingContext2D, box: Box, state: RoomState, time: number): void {
  // Меньше движения: лужи видны и без летящих искр и пара.
  if (reduceMotion()) return;
  const { size, ox, oy } = box;
  const w = state.room.w;
  ctx.save();
  for (let y = 0; y < state.room.h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const cell = state.ground[y * w + x];
      if (!cell) continue;
      const px = ox + x * size;
      const py = oy + y * size;
      if (cell.kind === "fire") embers(ctx, px, py, size, time, x, y);
      else if (cell.kind === "poison") bubbles(ctx, px, py, size, time, x, y);
      else if (cell.kind === "water") steam(ctx, px, py, size, time, x, y);
      else if (cell.kind === "ice") frost(ctx, px, py, size, time, x, y);
    }
  }
  ctx.restore();
}

/** Доля цикла частицы k клетки (x, y): своя длительность и сдвиг. */
function cycle(time: number, x: number, y: number, k: number, base: number, spread: number): number {
  const period = base + hash01(x, y, k * 7 + 1) * spread;
  return (time / period + hash01(x, y, k * 7 + 2)) % 1;
}

/** Искры: поднимаются от огня, виляют и гаснут. */
function embers(ctx: CanvasRenderingContext2D, px: number, py: number, size: number, time: number, x: number, y: number): void {
  ctx.globalCompositeOperation = "lighter";
  for (let k = 0; k < 4; k += 1) {
    const t = cycle(time, x, y, k, 900, 700);
    const sx = px + size * (0.18 + 0.64 * hash01(x, y, k * 7 + 3));
    const wiggle = Math.sin(t * 9 + hash01(x, y, k * 7 + 4) * 6) * size * 0.05;
    const cx = sx + wiggle;
    const cy = py + size * 0.78 - t * size * 1.05;
    const r = Math.max(0.8, size * 0.024 * (1 - t * 0.6));
    const alpha = Math.sin(t * Math.PI) * 0.9;
    ctx.fillStyle = `rgba(255, ${Math.round(200 - t * 110)}, ${Math.round(90 - t * 60)}, ${alpha})`;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();
  }
}

/** Пузыри: всплывают над ядом, растут и лопаются кольцом. */
function bubbles(ctx: CanvasRenderingContext2D, px: number, py: number, size: number, time: number, x: number, y: number): void {
  ctx.globalCompositeOperation = "source-over";
  for (let k = 0; k < 3; k += 1) {
    const t = cycle(time, x, y, k, 1300, 900);
    const cx = px + size * (0.2 + 0.6 * hash01(x, y, k * 7 + 3));
    const cy = py + size * (0.75 - 0.3 * t) - size * 0.05 * hash01(x, y, k * 7 + 5);
    if (t < 0.85) {
      const r = size * (0.025 + 0.04 * t);
      const alpha = Math.min(1, t * 4) * 0.8;
      ctx.fillStyle = `rgba(110, 210, 70, ${alpha * 0.35})`;
      ctx.strokeStyle = `rgba(170, 245, 120, ${alpha})`;
      ctx.lineWidth = Math.max(1, size * 0.012);
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = `rgba(235, 255, 220, ${alpha * 0.8})`;
      ctx.beginPath();
      ctx.arc(cx - r * 0.35, cy - r * 0.35, r * 0.28, 0, Math.PI * 2);
      ctx.fill();
    } else {
      // Лопнул: тонкое кольцо расходится и тает.
      const u = (t - 0.85) / 0.15;
      ctx.strokeStyle = `rgba(170, 245, 120, ${(1 - u) * 0.7})`;
      ctx.lineWidth = Math.max(1, size * 0.01);
      ctx.beginPath();
      ctx.arc(cx, cy, size * (0.06 + 0.06 * u), 0, Math.PI * 2);
      ctx.stroke();
    }
  }
}

/** Пар: мягкие клубы поднимаются над водой, расширяются и растворяются. */
function steam(ctx: CanvasRenderingContext2D, px: number, py: number, size: number, time: number, x: number, y: number): void {
  ctx.globalCompositeOperation = "source-over";
  for (let k = 0; k < 2; k += 1) {
    const t = cycle(time, x, y, k, 2400, 1400);
    const cx = px + size * (0.25 + 0.5 * hash01(x, y, k * 7 + 3)) + Math.sin(t * 4 + k) * size * 0.06;
    const cy = py + size * 0.7 - t * size * 0.7;
    const r = size * (0.08 + 0.16 * t);
    const alpha = Math.sin(t * Math.PI) * 0.13;
    ctx.fillStyle = `rgba(225, 238, 250, ${alpha})`;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();
  }
}

/** Иней: острые блёстки вспыхивают и гаснут на льду. */
function frost(ctx: CanvasRenderingContext2D, px: number, py: number, size: number, time: number, x: number, y: number): void {
  ctx.globalCompositeOperation = "lighter";
  ctx.strokeStyle = "rgba(232, 250, 255, 1)";
  ctx.lineCap = "round";
  for (let k = 0; k < 3; k += 1) {
    const pulse = Math.sin(time / (380 + 260 * hash01(x, y, k * 7 + 1)) + hash01(x, y, k * 7 + 2) * 6.28);
    const glint = Math.max(0, pulse) ** 6;
    if (glint < 0.02) continue;
    const cx = px + size * (0.15 + 0.7 * hash01(x, y, k * 7 + 3));
    const cy = py + size * (0.2 + 0.65 * hash01(x, y, k * 7 + 4));
    const arm = size * 0.07 * glint;
    ctx.globalAlpha = glint;
    ctx.lineWidth = Math.max(1, size * 0.012);
    ctx.beginPath();
    ctx.moveTo(cx - arm, cy);
    ctx.lineTo(cx + arm, cy);
    ctx.moveTo(cx, cy - arm);
    ctx.lineTo(cx, cy + arm);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
}
