import type { Box } from "./dungeon.ts";
import type { BlinkMark } from "./motion.ts";
import type { Dir, Fighter } from "./sim.ts";
import type { Sprites } from "./sprites.ts";

const MOTES: { x: number; y: number }[] = [
  { x: -0.22, y: 0.05 },
  { x: 0.18, y: -0.08 },
  { x: 0.02, y: 0.16 },
  { x: 0.28, y: 0.1 },
  { x: -0.12, y: -0.14 },
];

function drawSprite(
  ctx: CanvasRenderingContext2D,
  sprite: HTMLCanvasElement,
  x: number,
  y: number,
  size: number,
  facing: Dir,
): void {
  ctx.save();
  ctx.translate(x + size / 2, y + size / 2);
  if (facing === "left") ctx.scale(-1, 1);
  const pad = size * 0.08;
  ctx.drawImage(sprite, -size / 2 + pad, -size / 2 + pad, size - pad * 2, size - pad * 2);
  ctx.restore();
}

function burst(ctx: CanvasRenderingContext2D, cx: number, cy: number, size: number, t: number, out: boolean): void {
  const a = out ? 1 - t : Math.min(1, t / 0.35);
  if (a <= 0.02) return;
  const spread = out ? t : 1 - t;
  ctx.save();
  ctx.globalAlpha = 0.7 * a;
  ctx.strokeStyle = "#2abeaa";
  ctx.lineWidth = Math.max(2, size * 0.045);
  ctx.beginPath();
  ctx.ellipse(cx, cy, size * (0.12 + 0.5 * spread), size * (0.05 + 0.16 * spread), 0, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

/** Hero уже в новой клетке. Здесь гаснущий силуэт на старой и вспышка на обеих. */
export function drawBlinkFx(
  ctx: CanvasRenderingContext2D,
  box: Box,
  hero: Fighter,
  mark: BlinkMark,
  sprites: Sprites,
): void {
  const { size } = box;
  const t = mark.t;
  const fade = Math.max(0, 1 - t / 0.55);
  const fromX = box.ox + mark.fromX * size;
  const fromY = box.oy + mark.fromY * size;
  const toX = box.ox + (mark.toX + 0.5) * size;
  const toY = box.oy + mark.toY * size + size * 0.72;

  burst(ctx, fromX + size / 2, fromY + size * 0.72, size, t, true);
  burst(ctx, toX, toY, size, t, false);

  if (fade > 0.02) {
    const scale = 1 - 0.8 * (1 - fade);
    const anchorX = fromX + size / 2;
    const anchorY = fromY + size * 0.82;
    ctx.save();
    ctx.globalAlpha = fade;
    ctx.translate(anchorX, anchorY - (1 - fade) * size * 0.35);
    ctx.scale(scale, scale);
    ctx.translate(-anchorX, -anchorY);
    drawSprite(ctx, sprites.hero, fromX, fromY, size * 1.1, hero.facing);
    ctx.restore();
  }

  for (const mote of MOTES) {
    const rise = t * 0.9;
    const alpha = Math.max(0, 1 - t) * 0.85;
    if (alpha <= 0.02) continue;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = "#7ef0dc";
    ctx.beginPath();
    ctx.arc(fromX + (0.5 + mote.x) * size, fromY + (0.55 + mote.y - rise) * size, Math.max(1.5, size * 0.035), 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}
