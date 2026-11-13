/**
 * Ощущение удара и жизни на поле: вспышка и отброс фигуры при попадании, дыхание в покое,
 * растворение монстра при смерти. Только рисунок: правила боя и ходы это не трогает.
 */

/** Сколько длится отдача попадания, мс. */
export const IMPACT_MS = 230;
/** Насколько далеко фигуру отбрасывает от бьющего, в долях клетки. */
const KNOCK_CELLS = 0.15;
/** Растворение монстра при смерти, мс. Прежнее «осело и погасло» шло 320 мс. */
export const DISSOLVE_MS = 640;

export interface ImpactSample {
  /** Сдвиг фигуры в долях клетки. */
  dx: number;
  dy: number;
  /** Сила вспышки 0..1. */
  flash: number;
  color: string;
}

const CALM: ImpactSample = { dx: 0, dy: 0, flash: 0, color: "#fff" };

interface Impact {
  start: number;
  dx: number;
  dy: number;
  color: string;
  knock: number;
}

/** Последнее попадание по каждой фигуре. Ключ — объект бойца. */
export class Impacts {
  private hits = new WeakMap<object, Impact>();

  /** Удар пришёл с направления (dx, dy) — фигуру толкает дальше по нему. knock 0 — только вспышка. */
  mark(target: object, dx: number, dy: number, color: string, knock: number, time: number): void {
    const len = Math.hypot(dx, dy);
    this.hits.set(target, {
      start: time,
      dx: len > 0 ? dx / len : 0,
      dy: len > 0 ? dy / len : 0,
      color,
      knock: len > 0 ? knock : 0,
    });
  }

  sample(target: object, time: number): ImpactSample {
    const hit = this.hits.get(target);
    if (!hit) return CALM;
    const t = (time - hit.start) / IMPACT_MS;
    if (t < 0 || t >= 1) {
      this.hits.delete(target);
      return CALM;
    }
    // Резкий выброс за первую пятую, затем мягкий возврат на клетку.
    const push = t < 0.2 ? t / 0.2 : (1 - (t - 0.2) / 0.8) ** 2;
    const reach = push * KNOCK_CELLS * hit.knock;
    return { dx: hit.dx * reach, dy: hit.dy * reach, flash: (1 - t) ** 2, color: hit.color };
  }

  clear(): void {
    this.hits = new WeakMap();
  }
}

/** Затухающая дрожь камеры. Новый толчок не гасит более сильный текущий. */
export class Shake {
  private start = 0;
  private power = 0;
  private readonly ms = 260;

  /** power 1 — прежний толчок срыва брони (8 пикселей в пике). */
  hit(power: number, time: number): void {
    if (this.start !== 0 && this.power * this.left(time) >= power) return;
    this.start = time;
    this.power = power;
  }

  offset(time: number): { x: number; y: number } {
    if (this.start === 0) return { x: 0, y: 0 };
    const left = this.left(time);
    if (left <= 0) {
      this.start = 0;
      return { x: 0, y: 0 };
    }
    const elapsed = time - this.start;
    const amp = left * left * 8 * this.power;
    return { x: Math.sin(elapsed / 22) * amp, y: Math.cos(elapsed / 17) * amp * 0.65 };
  }

  reset(): void {
    this.start = 0;
  }

  private left(time: number): number {
    return Math.max(0, 1 - (time - this.start) / this.ms);
  }
}

const silhouettes = new WeakMap<HTMLCanvasElement, Map<string, HTMLCanvasElement>>();

/** Силуэт спрайта одним цветом: им фигура вспыхивает при попадании. Считается один раз. */
export function silhouette(sprite: HTMLCanvasElement, color: string): HTMLCanvasElement {
  let byColor = silhouettes.get(sprite);
  if (!byColor) {
    byColor = new Map();
    silhouettes.set(sprite, byColor);
  }
  const cached = byColor.get(color);
  if (cached) return cached;
  const out = document.createElement("canvas");
  out.width = sprite.width;
  out.height = sprite.height;
  const ctx = out.getContext("2d");
  if (ctx) {
    ctx.drawImage(sprite, 0, 0);
    ctx.globalCompositeOperation = "source-in";
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, out.width, out.height);
  }
  byColor.set(color, out);
  return out;
}

/** Цвет вспышки: физический удар — белый, стихия — светлый оттенок её цвета. */
export function flashColor(ink: string, physical: boolean): string {
  if (physical) return "#fff7ec";
  const n = Number.parseInt(ink.slice(1), 16);
  const mix = (c: number): number => Math.round(c + (255 - c) * 0.45);
  const r = mix((n >> 16) & 255);
  const g = mix((n >> 8) & 255);
  const b = mix(n & 255);
  return `rgb(${r}, ${g}, ${b})`;
}

const phases = new WeakMap<object, number>();

/** Свой сдвиг фазы дыхания у каждой фигуры, чтобы комната не дышала хором. */
export function breathPhase(target: object): number {
  let phase = phases.get(target);
  if (phase === undefined) {
    phase = Math.random() * Math.PI * 2;
    phases.set(target, phase);
  }
  return phase;
}

/** Вдох в покое: тело чуть вытягивается вверх и сужается, ступни на месте. */
export function breath(time: number, phase: number, rate = 1): { sx: number; sy: number } {
  const s = Math.sin((time / 560) * rate + phase);
  return { sx: 1 - s * 0.012, sy: 1 + s * 0.026 };
}

/** Детерминированный шум 0..1: одна и та же клетка растворяется одинаково в обоих слоях кадра. */
export function hash01(a: number, b: number, c: number): number {
  let h = Math.imul(a | 0, 374761393) ^ Math.imul(b | 0, 668265263) ^ Math.imul(c | 0, 2147483647);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

const DISSOLVE_GRID = 16;
let scratch: { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } | null = null;

function scratchCanvas(w: number, h: number): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } | null {
  if (!scratch) {
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    scratch = { canvas, ctx };
  }
  if (scratch.canvas.width < w || scratch.canvas.height < h) {
    scratch.canvas.width = Math.max(scratch.canvas.width, w);
    scratch.canvas.height = Math.max(scratch.canvas.height, h);
  }
  return scratch;
}

/**
 * Монстр рассыпается: клетки шума гаснут сверху вниз, на кромке тлеют угли.
 * progress 0 — целый, 1 — исчез. paint рисует фигуру в координатах кадра.
 */
export function drawDissolving(
  ctx: CanvasRenderingContext2D,
  bounds: { x: number; y: number; w: number; h: number },
  progress: number,
  seed: number,
  paint: (target: CanvasRenderingContext2D) => void,
): void {
  if (progress >= 1) return;
  const w = Math.ceil(bounds.w);
  const h = Math.ceil(bounds.h);
  const pad = scratchCanvas(w, h);
  if (!pad || w <= 0 || h <= 0) return;
  const p = pad.ctx;
  p.save();
  p.setTransform(1, 0, 0, 1, 0, 0);
  p.clearRect(0, 0, w, h);
  p.translate(-bounds.x, -bounds.y);
  paint(p);
  p.setTransform(1, 0, 0, 1, 0, 0);
  const cw = w / DISSOLVE_GRID;
  const ch = h / DISSOLVE_GRID;
  // Порог клетки: шум плюс высота — верх уходит первым, пепел летит вверх.
  const edge = 0.09;
  p.globalCompositeOperation = "destination-out";
  for (let j = 0; j < DISSOLVE_GRID; j += 1) {
    for (let i = 0; i < DISSOLVE_GRID; i += 1) {
      const gate = hash01(seed, i, j) * 0.72 + (j / DISSOLVE_GRID) * 0.28;
      if (gate < progress) p.fillRect(Math.floor(i * cw), Math.floor(j * ch), Math.ceil(cw) + 1, Math.ceil(ch) + 1);
    }
  }
  p.globalCompositeOperation = "source-atop";
  for (let j = 0; j < DISSOLVE_GRID; j += 1) {
    for (let i = 0; i < DISSOLVE_GRID; i += 1) {
      const gate = hash01(seed, i, j) * 0.72 + (j / DISSOLVE_GRID) * 0.28;
      if (gate < progress || gate > progress + edge) continue;
      const heat = 1 - (gate - progress) / edge;
      p.fillStyle = `rgba(255, ${Math.round(150 + 70 * heat)}, 90, ${0.75 * heat})`;
      p.fillRect(Math.floor(i * cw), Math.floor(j * ch), Math.ceil(cw) + 1, Math.ceil(ch) + 1);
    }
  }
  p.restore();
  ctx.drawImage(pad.canvas, 0, 0, w, h, bounds.x, bounds.y, w, h);
}

/** Пепел и искры, поднимающиеся над растворяющимся монстром. */
export function drawAsh(
  ctx: CanvasRenderingContext2D,
  bounds: { x: number; y: number; w: number; h: number },
  progress: number,
  seed: number,
): void {
  if (progress <= 0 || progress >= 1) return;
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  const count = 14;
  for (let k = 0; k < count; k += 1) {
    const born = hash01(seed, k, 91) * 0.55;
    const t = (progress - born) / (1 - born);
    if (t <= 0 || t >= 1) continue;
    const x0 = bounds.x + bounds.w * (0.2 + 0.6 * hash01(seed, k, 17));
    const y0 = bounds.y + bounds.h * (0.25 + 0.6 * hash01(seed, k, 29));
    const drift = (hash01(seed, k, 43) - 0.5) * bounds.w * 0.35;
    const x = x0 + drift * t;
    const y = y0 - bounds.h * 0.55 * t;
    const r = Math.max(1, bounds.w * 0.018 * (1 - t * 0.6));
    const alpha = Math.sin(t * Math.PI) * 0.85;
    ctx.fillStyle = hash01(seed, k, 61) < 0.55 ? `rgba(255, 170, 90, ${alpha})` : `rgba(190, 180, 170, ${alpha * 0.6})`;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}
