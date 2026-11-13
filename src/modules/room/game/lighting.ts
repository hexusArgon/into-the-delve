import type { Box } from "./dungeon.ts";
import type { Cell, RoomState } from "./sim.ts";

/**
 * Свет комнаты. Поверх кадра ложится полутьма, в которой источники света вырезают пятна:
 * факелы мерцают и освещают пол вокруг, горящие лужи светят слабее, вокруг героя — ровный свет.
 * Края комнаты, куда свет не достаёт, уходят в темноту. Сверху добавляется тёплое свечение.
 */

/** Насколько тёмен угол, куда не достаёт ни один источник. */
const DARK = 0.6;
/** Карта света считается в четверть разрешения: градиенты при растяжке не теряют вида. */
const LIGHT_SCALE = 0.25;

let lightLayer: { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } | null = null;

function layer(w: number, h: number): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } | null {
  if (!lightLayer) {
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    lightLayer = { canvas, ctx };
  }
  if (lightLayer.canvas.width !== w || lightLayer.canvas.height !== h) {
    lightLayer.canvas.width = w;
    lightLayer.canvas.height = h;
  }
  return lightLayer;
}

/** Мерцание пламени: сумма трёх несвязанных колебаний, у каждого факела своя фаза. */
export function flicker(time: number, seed: number): number {
  return (
    0.86 +
    0.07 * Math.sin(time * 0.0113 + seed * 1.7) +
    0.05 * Math.sin(time * 0.0271 + seed * 4.1) +
    0.03 * Math.sin(time * 0.0613 + seed * 9.3)
  );
}

interface Light {
  x: number;
  y: number;
  radius: number;
  strength: number;
}

export function drawLighting(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  box: Box,
  torches: readonly Cell[],
  hero: Cell,
  state: RoomState,
  time: number,
): void {
  const { size, ox, oy } = box;
  const lights: Light[] = [];
  torches.forEach((cell, index) => {
    const f = flicker(time, index + cell.x * 3 + cell.y * 7);
    lights.push({
      x: ox + (cell.x + 0.5) * size,
      y: oy + cell.y * size + size * 0.45,
      radius: size * 3.6 * f,
      strength: 0.95 * f,
    });
  });
  const w = state.room.w;
  for (let i = 0; i < state.ground.length; i += 1) {
    if (state.ground[i]?.kind !== "fire") continue;
    const x = i % w;
    const y = Math.floor(i / w);
    lights.push({
      x: ox + (x + 0.5) * size,
      y: oy + (y + 0.5) * size,
      radius: size * 1.7 * flicker(time, 50 + i),
      strength: 0.7,
    });
  }
  const hx = ox + (hero.x + 0.5) * size;
  const hy = oy + (hero.y + 0.5) * size;
  lights.push({ x: hx, y: hy, radius: size * 3.4, strength: 0.85 });

  // Полутьма с вырезанными пятнами света.
  const lw = Math.max(1, Math.ceil(width * LIGHT_SCALE));
  const lh = Math.max(1, Math.ceil(height * LIGHT_SCALE));
  const dark = layer(lw, lh);
  if (dark) {
    const d = dark.ctx;
    d.globalCompositeOperation = "source-over";
    d.clearRect(0, 0, lw, lh);
    d.fillStyle = `rgba(3, 4, 9, ${DARK})`;
    d.fillRect(0, 0, lw, lh);
    d.globalCompositeOperation = "destination-out";
    for (const light of lights) {
      const x = light.x * LIGHT_SCALE;
      const y = light.y * LIGHT_SCALE;
      const r = light.radius * LIGHT_SCALE;
      const hole = d.createRadialGradient(x, y, 0, x, y, r);
      hole.addColorStop(0, `rgba(0, 0, 0, ${light.strength})`);
      hole.addColorStop(0.55, `rgba(0, 0, 0, ${light.strength * 0.55})`);
      hole.addColorStop(1, "rgba(0, 0, 0, 0)");
      d.fillStyle = hole;
      d.fillRect(x - r, y - r, r * 2, r * 2);
    }
    ctx.save();
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(dark.canvas, 0, 0, lw, lh, 0, 0, width, height);
    ctx.restore();
  }

  // Мягкая виньетка экрана поверх: взгляд держится в центре.
  const reach = Math.hypot(width, height) * 0.55;
  const vignette = ctx.createRadialGradient(width / 2, height / 2, reach * 0.45, width / 2, height / 2, reach);
  vignette.addColorStop(0, "rgba(4, 5, 9, 0)");
  vignette.addColorStop(1, "rgba(4, 5, 9, 0.45)");
  ctx.fillStyle = vignette;
  ctx.fillRect(0, 0, width, height);

  // Тёплый свет факелов и огня ложится на пол сложением цветов.
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  torches.forEach((cell, index) => {
    const f = flicker(time, index + cell.x * 3 + cell.y * 7);
    const radius = size * 3.2 * f;
    const fx = ox + (cell.x + 0.5) * size;
    const fy = oy + cell.y * size + size * 0.2;
    const light = ctx.createRadialGradient(fx, fy, 0, fx, fy, radius);
    light.addColorStop(0, `rgba(255, 170, 80, ${0.32 * f})`);
    light.addColorStop(0.45, `rgba(255, 130, 50, ${0.11 * f})`);
    light.addColorStop(1, "rgba(255, 120, 40, 0)");
    ctx.fillStyle = light;
    ctx.fillRect(fx - radius, fy - radius, radius * 2, radius * 2);
    // Ядро пламени: маленький яркий ореол прямо у факела.
    const core = size * 0.38 * f;
    const flame = ctx.createRadialGradient(fx, fy, 0, fx, fy, core);
    flame.addColorStop(0, `rgba(255, 220, 150, ${0.5 * f})`);
    flame.addColorStop(1, "rgba(255, 160, 70, 0)");
    ctx.fillStyle = flame;
    ctx.fillRect(fx - core, fy - core, core * 2, core * 2);
  });
  const glow = ctx.createRadialGradient(hx, hy, 0, hx, hy, size * 2.6);
  glow.addColorStop(0, "rgba(255, 225, 180, 0.12)");
  glow.addColorStop(1, "rgba(255, 225, 180, 0)");
  ctx.fillStyle = glow;
  ctx.fillRect(hx - size * 2.6, hy - size * 2.6, size * 5.2, size * 5.2);
  ctx.restore();
}
