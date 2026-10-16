import type { Box } from "./dungeon.ts";
import type { AbilityFx, Cell, Fighter, Hazard, Windup } from "./sim.ts";

/** Сколько виден рисунок способности. */
export const ABILITY_MS = 420;

export type AbilityBurst = AbilityFx & { start: number };

export function burstAge(burst: AbilityBurst, time: number): number {
  return (time - burst.start) / ABILITY_MS;
}

function pt(box: Box, x: number, y: number): { x: number; y: number } {
  return { x: box.ox + (x + 0.5) * box.size, y: box.oy + (y + 0.55) * box.size };
}

function mix(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function fade(t: number, hold = 0.62): number {
  return t < hold ? 1 : Math.max(0, 1 - (t - hold) / (1 - hold));
}

function arc(box: Box, from: Cell, to: Cell, u: number, lift: number): { x: number; y: number } {
  const a = pt(box, from.x, from.y);
  const b = pt(box, to.x, to.y);
  return { x: mix(a.x, b.x, u), y: mix(a.y, b.y, u) - Math.sin(Math.min(1, u) * Math.PI) * box.size * lift };
}

function centroid(box: Box, cells: readonly Cell[]): { x: number; y: number } {
  let x = 0;
  let y = 0;
  for (const cell of cells) {
    const p = pt(box, cell.x, cell.y);
    x += p.x;
    y += p.y;
  }
  const n = Math.max(1, cells.length);
  return { x: x / n, y: y / n };
}

function puff(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, color: string, alpha: number): void {
  if (alpha <= 0.02) return;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawDash(ctx: CanvasRenderingContext2D, box: Box, from: Cell, to: Cell, fire: boolean, t: number): void {
  for (let i = 0; i < 6; i += 1) {
    const u = i / 5;
    if (t < u) continue;
    const p = arc(box, from, to, u, 0.04);
    const age = (t - u) / 0.55;
    puff(ctx, p.x, p.y, box.size * (0.06 + age * 0.08), fire ? "#e25822" : "#d9cbb4", (1 - age) * 0.8);
  }
}

function drawSwoop(ctx: CanvasRenderingContext2D, box: Box, from: Cell, to: Cell, t: number): void {
  const u = Math.min(1, t / 0.7);
  const p = arc(box, from, to, u, 0.28);
  const a = pt(box, from.x, from.y);
  const b = pt(box, to.x, to.y);
  const ang = Math.atan2(b.y - a.y, b.x - a.x);
  ctx.save();
  ctx.translate(p.x, p.y);
  ctx.rotate(ang);
  ctx.globalAlpha = fade(t, 0.7);
  ctx.strokeStyle = "#e7d7c2";
  ctx.lineWidth = Math.max(2, box.size * 0.04);
  ctx.beginPath();
  ctx.moveTo(-box.size * 0.05, 0);
  ctx.quadraticCurveTo(-box.size * 0.28, -box.size * 0.16, -box.size * 0.42, -box.size * 0.02);
  ctx.moveTo(-box.size * 0.05, 0);
  ctx.quadraticCurveTo(-box.size * 0.28, box.size * 0.16, -box.size * 0.42, box.size * 0.02);
  ctx.stroke();
  ctx.restore();
}

function drawBlob(
  ctx: CanvasRenderingContext2D,
  box: Box,
  from: Cell,
  to: Cell,
  t: number,
  color: string,
  lift: number,
  radius: number,
): void {
  const u = Math.min(1, t / 0.72);
  const p = arc(box, from, to, u, lift);
  puff(ctx, p.x, p.y, box.size * radius, color, u > 0.86 ? 1 - (u - 0.86) / 0.14 : 0.95);
  if (u > 0.82) {
    const land = pt(box, to.x, to.y);
    const ring = (u - 0.82) / 0.18;
    ctx.save();
    ctx.globalAlpha = 1 - ring;
    ctx.strokeStyle = color;
    ctx.lineWidth = Math.max(2, box.size * 0.03);
    ctx.beginPath();
    ctx.ellipse(land.x, land.y + box.size * 0.12, box.size * (0.12 + ring * 0.28), box.size * (0.05 + ring * 0.08), 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }
}

function drawTrail(ctx: CanvasRenderingContext2D, box: Box, from: Cell, to: Cell, t: number, color: string): void {
  for (let i = 0; i < 5; i += 1) {
    const u = (i + 1) / 5;
    if (t < u * 0.8) continue;
    const p = pt(box, mix(from.x, to.x, u), mix(from.y, to.y, u));
    puff(ctx, p.x, p.y + box.size * 0.12, box.size * 0.1, color, fade(t) * 0.55);
  }
}

function drawSlash(ctx: CanvasRenderingContext2D, box: Box, cells: readonly Cell[], t: number): void {
  const c = centroid(box, cells);
  const sweep = -1.15 + Math.min(1, t / 0.42) * 2.3;
  ctx.save();
  ctx.translate(c.x, c.y);
  ctx.rotate(sweep);
  ctx.globalAlpha = fade(t, 0.42) * 0.9;
  ctx.strokeStyle = "#f4efe4";
  ctx.lineWidth = Math.max(3, box.size * 0.09);
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.arc(0, 0, box.size * 0.7, -0.85, 0.85);
  ctx.stroke();
  ctx.restore();
}

function drawRings(ctx: CanvasRenderingContext2D, box: Box, cells: readonly Cell[], t: number, color: string, grow: number): void {
  const alpha = fade(t, 0.35);
  for (const cell of cells) {
    const p = pt(box, cell.x, cell.y);
    const span = Math.max(0.05, 0.16 + t * grow);
    ctx.save();
    ctx.globalAlpha = alpha * 0.75;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.ellipse(p.x, p.y + box.size * 0.08, box.size * span, box.size * span * 0.4, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}

function drawSpires(ctx: CanvasRenderingContext2D, box: Box, cells: readonly Cell[], t: number): void {
  const grow = Math.min(1, t / 0.38);
  const alpha = fade(t, 0.5);
  for (const cell of cells) {
    const p = pt(box, cell.x, cell.y);
    const h = box.size * 0.72 * grow;
    const foot = p.y + box.size * 0.22;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = "#c9b3ef";
    ctx.beginPath();
    ctx.moveTo(p.x - box.size * 0.07, foot);
    ctx.lineTo(p.x, foot - h);
    ctx.lineTo(p.x + box.size * 0.07, foot);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }
}

function drawColumns(ctx: CanvasRenderingContext2D, box: Box, cells: readonly Cell[], t: number, color: string, scale = 1): void {
  const h = Math.sin(Math.min(1, t) * Math.PI) * box.size * 0.9 * scale;
  for (const cell of cells) {
    const p = pt(box, cell.x, cell.y);
    ctx.save();
    ctx.globalAlpha = 0.8;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.ellipse(p.x, p.y + box.size * 0.16 - h, box.size * 0.16, box.size * 0.1, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillRect(p.x - box.size * 0.07, p.y + box.size * 0.16 - h, box.size * 0.14, h);
    ctx.restore();
  }
}

function drawHail(ctx: CanvasRenderingContext2D, box: Box, cells: readonly Cell[], t: number): void {
  for (const cell of cells) {
    const p = pt(box, cell.x, cell.y);
    for (let i = 0; i < 3; i += 1) {
      const u = Math.min(1, Math.max(0, (t - i * 0.08) / 0.55));
      const x = p.x + (i - 1) * box.size * 0.16;
      const y = p.y - (1 - u) * box.size * 0.85;
      ctx.save();
      ctx.globalAlpha = u < 1 ? 0.9 : fade(t, 0.7);
      ctx.fillStyle = "#e7f6ff";
      ctx.translate(x, y);
      ctx.rotate(0.4);
      ctx.fillRect(-box.size * 0.03, -box.size * 0.08, box.size * 0.06, box.size * 0.16);
      ctx.restore();
    }
  }
}

function drawLineGrow(
  ctx: CanvasRenderingContext2D,
  box: Box,
  from: Cell,
  to: Cell,
  t: number,
  color: string,
  width: number,
  reachAt: number,
): void {
  const a = pt(box, from.x, from.y);
  const b = pt(box, to.x, to.y);
  const u = Math.min(1, t / reachAt);
  ctx.save();
  ctx.globalAlpha = fade(t, reachAt);
  ctx.strokeStyle = color;
  ctx.lineWidth = Math.max(3, box.size * width);
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(a.x, a.y);
  ctx.lineTo(mix(a.x, b.x, u), mix(a.y, b.y, u));
  ctx.stroke();
  ctx.restore();
}

function drawFall(ctx: CanvasRenderingContext2D, box: Box, to: Cell, t: number): void {
  const p = pt(box, to.x, to.y);
  const u = Math.min(1, t / 0.62);
  const y = p.y - (1 - u) * box.size * 1.25;
  ctx.save();
  ctx.globalAlpha = 0.35 + u * 0.3;
  ctx.fillStyle = "#000";
  ctx.beginPath();
  ctx.ellipse(p.x, p.y + box.size * 0.16, box.size * (0.08 + u * 0.16), box.size * 0.05, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  puff(ctx, p.x, y, box.size * 0.12, "#8a7348", fade(t, 0.62));
}

function drawWisp(ctx: CanvasRenderingContext2D, box: Box, from: Cell, to: Cell, t: number, color = "#e4d8f6"): void {
  for (const [cell, out] of [
    [from, true],
    [to, false],
  ] as const) {
    const p = pt(box, cell.x, cell.y);
    const local = out ? t : Math.max(0, t - 0.35);
    ctx.save();
    ctx.globalAlpha = (out ? 1 - t : Math.min(1, local / 0.3)) * 0.8;
    ctx.strokeStyle = color;
    ctx.lineWidth = Math.max(2, box.size * 0.04);
    ctx.beginPath();
    ctx.ellipse(p.x, p.y, box.size * (0.1 + local * 0.35), box.size * (0.05 + local * 0.12), 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }
}

function drawBolt(ctx: CanvasRenderingContext2D, box: Box, cells: readonly Cell[], t: number): void {
  const alpha = fade(t, 0.22);
  for (const cell of cells) {
    const p = pt(box, cell.x, cell.y);
    const top = p.y - box.size * 0.95;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = "#fff1c2";
    ctx.lineWidth = Math.max(2, box.size * 0.055);
    ctx.lineJoin = "round";
    ctx.beginPath();
    ctx.moveTo(p.x, top);
    ctx.lineTo(p.x + box.size * 0.1, mix(top, p.y, 0.42));
    ctx.lineTo(p.x - box.size * 0.08, mix(top, p.y, 0.68));
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    ctx.restore();
    puff(ctx, p.x, p.y, box.size * (0.1 + t * 0.16), "#ffb15a", alpha * 0.75);
  }
}

function drawArrow(ctx: CanvasRenderingContext2D, box: Box, from: Cell, to: Cell, t: number): void {
  const a = pt(box, from.x, from.y);
  const b = pt(box, to.x, to.y);
  const u = Math.min(1, t / 0.55);
  const x = mix(a.x, b.x, u);
  const y = mix(a.y, b.y, u);
  const ang = Math.atan2(b.y - a.y, b.x - a.x);
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(ang);
  ctx.globalAlpha = fade(t, 0.55);
  ctx.strokeStyle = "#7ed34a";
  ctx.fillStyle = "#b6e36a";
  ctx.lineWidth = Math.max(2, box.size * 0.045);
  ctx.beginPath();
  ctx.moveTo(-box.size * 0.28, 0);
  ctx.lineTo(0, 0);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(box.size * 0.16, 0);
  ctx.lineTo(-box.size * 0.02, -box.size * 0.07);
  ctx.lineTo(-box.size * 0.02, box.size * 0.07);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function drawQuake(ctx: CanvasRenderingContext2D, box: Box, cells: readonly Cell[], t: number): void {
  const alpha = fade(t, 0.35);
  for (const cell of cells) {
    const p = pt(box, cell.x, cell.y);
    const kick = Math.sin(t * 18) * box.size * 0.03;
    ctx.save();
    ctx.globalAlpha = alpha * 0.85;
    ctx.strokeStyle = "#c4a15a";
    ctx.lineWidth = Math.max(1, box.size * 0.03);
    ctx.beginPath();
    ctx.moveTo(p.x - box.size * 0.28, p.y + box.size * 0.08 + kick);
    ctx.lineTo(p.x - box.size * 0.05, p.y - box.size * 0.04);
    ctx.lineTo(p.x + box.size * 0.22, p.y + box.size * 0.1);
    ctx.stroke();
    ctx.restore();
    puff(ctx, p.x, p.y - t * box.size * 0.2, box.size * 0.08, "#8a7348", alpha * 0.45);
  }
}

function drawShardBurst(ctx: CanvasRenderingContext2D, box: Box, cells: readonly Cell[], t: number): void {
  const alpha = fade(t, 0.3);
  for (const cell of cells) {
    const p = pt(box, cell.x, cell.y);
    for (let i = 0; i < 3; i += 1) {
      const ang = -0.8 + i * 0.8;
      const dist = box.size * (0.08 + t * 0.28);
      ctx.save();
      ctx.translate(p.x + Math.cos(ang) * dist, p.y - t * box.size * 0.35 + Math.sin(ang) * dist * 0.25);
      ctx.rotate(ang);
      ctx.globalAlpha = alpha;
      ctx.fillStyle = "#e7f6ff";
      ctx.fillRect(-box.size * 0.025, -box.size * 0.08, box.size * 0.05, box.size * 0.16);
      ctx.restore();
    }
  }
}

function drawSleep(ctx: CanvasRenderingContext2D, box: Box, cells: readonly Cell[], t: number): void {
  for (const cell of cells) {
    const p = pt(box, cell.x, cell.y);
    puff(ctx, p.x, p.y, box.size * (0.2 + t * 0.15), "#c9b3ef", fade(t, 0.4) * 0.35);
    ctx.save();
    ctx.globalAlpha = fade(t, 0.45);
    ctx.fillStyle = "#e4d8f6";
    ctx.font = `700 ${Math.max(12, Math.floor(box.size * 0.28))}px Arial`;
    ctx.textAlign = "center";
    ctx.fillText("z", p.x + box.size * 0.12, p.y - t * box.size * 0.45);
    ctx.restore();
  }
}

function drawFlakes(ctx: CanvasRenderingContext2D, box: Box, cells: readonly Cell[], t: number, time: number): void {
  for (const cell of cells) {
    const p = pt(box, cell.x, cell.y);
    for (let i = 0; i < 3; i += 1) {
      const phase = (time / 520 + t + i * 0.33) % 1;
      const x = p.x + (i - 1) * box.size * 0.18 + Math.sin(phase * Math.PI * 2) * box.size * 0.06;
      const y = p.y - box.size * 0.35 + phase * box.size * 0.55;
      puff(ctx, x, y, box.size * 0.035, i === 1 ? "#e7f6ff" : "#9ec8ee", (1 - phase) * 0.8);
    }
  }
}

function drawShards(ctx: CanvasRenderingContext2D, box: Box, cells: readonly Cell[], t: number): void {
  const alpha = fade(t, 0.3);
  for (const cell of cells) {
    const p = pt(box, cell.x, cell.y);
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = "#d7f1ff";
    ctx.lineWidth = Math.max(1, box.size * 0.03);
    for (let i = 0; i < 6; i += 1) {
      const ang = (i / 6) * Math.PI * 2;
      const len = box.size * (0.08 + t * 0.28);
      ctx.beginPath();
      ctx.moveTo(Math.cos(ang) * box.size * 0.04, Math.sin(ang) * box.size * 0.04);
      ctx.lineTo(Math.cos(ang) * len, Math.sin(ang) * len);
      ctx.stroke();
    }
    ctx.restore();
  }
}

/** Обмен автоматона: короткая металлическая вспышка на обеих клетках и искра по дуге. Не Blink. */
function drawSwap(ctx: CanvasRenderingContext2D, box: Box, from: Cell, to: Cell, t: number): void {
  const flash = fade(t, 0.2);
  for (const cell of [from, to]) {
    const p = pt(box, cell.x, cell.y);
    ctx.save();
    ctx.globalAlpha = flash;
    ctx.strokeStyle = "#e8dcc8";
    ctx.lineWidth = Math.max(2, box.size * 0.045);
    ctx.beginPath();
    ctx.moveTo(p.x - box.size * 0.18, p.y);
    ctx.lineTo(p.x + box.size * 0.18, p.y);
    ctx.moveTo(p.x, p.y - box.size * 0.18);
    ctx.lineTo(p.x, p.y + box.size * 0.18);
    ctx.stroke();
    ctx.restore();
    puff(ctx, p.x, p.y, box.size * (0.05 + t * 0.1), "#f4efe4", flash * 0.65);
  }
  if (from.x === to.x && from.y === to.y) return;
  const u = Math.min(1, t / 0.55);
  const spark = arc(box, from, to, u, 0.22);
  puff(ctx, spark.x, spark.y, box.size * 0.055, "#ffe7a8", fade(t, 0.55));
  for (let i = 0; i < 4; i += 1) {
    const along = (i + 1) / 5;
    if (u < along) continue;
    const mote = arc(box, from, to, along, 0.22);
    puff(ctx, mote.x, mote.y, box.size * 0.03, "#d7c48a", (1 - (u - along) / 0.5) * 0.7);
  }
}

/** Взрыв бочки. Цвет берётся из tone кадра, не из отдельного акта. */
function drawKeg(ctx: CanvasRenderingContext2D, box: Box, cells: readonly Cell[], tone: string, t: number): void {
  const alpha = fade(t, 0.28);
  for (const cell of cells) {
    const p = pt(box, cell.x, cell.y);
    if (tone === "fire") {
      puff(ctx, p.x, p.y - box.size * 0.08 * t, box.size * (0.08 + t * 0.28), "#e25822", alpha * 0.8);
      puff(ctx, p.x, p.y - box.size * 0.2 * t, box.size * (0.04 + t * 0.1), "#ffb15a", alpha);
    } else if (tone === "water") {
      ctx.save();
      ctx.globalAlpha = alpha * 0.85;
      ctx.strokeStyle = "#3a7fd4";
      ctx.lineWidth = Math.max(2, box.size * 0.04);
      ctx.beginPath();
      ctx.ellipse(p.x, p.y + box.size * 0.08, box.size * (0.08 + t * 0.36), box.size * (0.04 + t * 0.12), 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    } else if (tone === "ice") {
      for (let i = 0; i < 4; i += 1) {
        const ang = (i / 4) * Math.PI * 2 + 0.4;
        const dist = box.size * t * 0.28;
        ctx.save();
        ctx.translate(p.x + Math.cos(ang) * dist, p.y + Math.sin(ang) * dist * 0.45);
        ctx.rotate(ang);
        ctx.globalAlpha = alpha;
        ctx.fillStyle = "#e7f6ff";
        ctx.fillRect(-box.size * 0.02, -box.size * 0.07, box.size * 0.04, box.size * 0.14);
        ctx.restore();
      }
    } else if (tone === "poison") {
      for (let i = 0; i < 4; i += 1) {
        const ang = (i / 4) * Math.PI * 2;
        const dist = box.size * (0.06 + t * 0.22);
        puff(
          ctx,
          p.x + Math.cos(ang) * dist,
          p.y + Math.sin(ang) * dist * 0.55,
          box.size * (0.035 + (i % 2) * 0.02),
          i % 2 === 0 ? "#d6e36a" : "#7ed34a",
          alpha * 0.85,
        );
      }
    } else {
      puff(ctx, p.x, p.y + box.size * 0.06, box.size * (0.1 + t * 0.22), "#1a120c", alpha * 0.9);
      ctx.save();
      ctx.globalAlpha = alpha * 0.7;
      ctx.strokeStyle = "#6b4f1f";
      ctx.lineWidth = Math.max(1, box.size * 0.03);
      ctx.beginPath();
      ctx.ellipse(p.x, p.y + box.size * 0.08, box.size * (0.12 + t * 0.2), box.size * (0.05 + t * 0.06), 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
  }
}

function drawAct(ctx: CanvasRenderingContext2D, box: Box, burst: AbilityBurst, t: number): boolean {
  const act = burst.act as string | undefined;
  if (!act) return false;
  if (act === "swap") {
    if (burst.kind === "line") {
      drawSwap(ctx, box, burst.from, burst.to, t);
      return true;
    }
    if (burst.kind === "area" && burst.cells.length > 0) {
      const from = burst.cells[0]!;
      const to = burst.cells[burst.cells.length - 1] ?? from;
      drawSwap(ctx, box, from, to, t);
      return true;
    }
    return false;
  }
  if (act === "keg" && burst.kind === "area") {
    drawKeg(ctx, box, burst.cells, burst.tone, t);
    return true;
  }
  if (act === "dash" && burst.kind === "dash") {
    drawDash(ctx, box, burst.from, burst.to, burst.tone === "fire", t);
    return true;
  }
  if (act === "swoop" && burst.kind === "dash") {
    drawSwoop(ctx, box, burst.from, burst.to, t);
    return true;
  }
  if (act === "spit" && burst.kind === "shot") {
    drawBlob(ctx, box, burst.from, burst.to, t, "#6fbf45", 0.28, 0.09);
    return true;
  }
  if (act === "spore" && burst.kind === "shot") {
    drawBlob(ctx, box, burst.from, burst.to, t, "#b6e36a", 0.5, 0.07);
    return true;
  }
  if (act === "leap" && burst.kind === "shot") {
    drawBlob(ctx, box, burst.from, burst.to, t, "#8fbf62", 0.55, 0.16);
    return true;
  }
  if (act === "rock" && burst.kind === "shot") {
    drawBlob(ctx, box, burst.from, burst.to, t, "#8a7348", 0.45, 0.12);
    return true;
  }
  if (act === "throw" && burst.kind === "shot") {
    drawTrail(ctx, box, burst.from, burst.to, t, "#3a7fd4");
    return true;
  }
  if (act === "fall" && burst.kind === "shot") {
    drawFall(ctx, box, burst.to, t);
    return true;
  }
  if (act === "wisp" && burst.kind === "blink") {
    drawWisp(ctx, box, burst.from, burst.to, t);
    return true;
  }
  if (act === "flare" && burst.kind === "blink") {
    drawWisp(ctx, box, burst.from, burst.to, t, "#ffb15a");
    return true;
  }
  if (burst.kind !== "area" && burst.kind !== "line") return false;
  if (burst.kind === "line") {
    if (act === "tongue") drawLineGrow(ctx, box, burst.from, burst.to, t, "#c45b62", 0.11, 0.45);
    else if (act === "charm") {
      const u = Math.min(1, t / 0.75);
      const p = arc(box, burst.from, burst.to, u, 0.12);
      puff(ctx, p.x, p.y, box.size * 0.08, "#d7c6f2", fade(t, 0.75));
    } else if (act === "beam") drawLineGrow(ctx, box, burst.from, burst.to, t, "#bfe6f5", 0.1, 0.32);
    else if (act === "arrow") drawArrow(ctx, box, burst.from, burst.to, t);
    else return false;
    return true;
  }
  const cells = burst.cells;
  if (act === "slash") drawSlash(ctx, box, cells, t);
  else if (act === "pop") drawRings(ctx, box, cells, t, "#7ed34a", 0.42);
  else if (act === "vanish") drawRings(ctx, box, cells, t, "#e25822", -0.2);
  else if (act === "flare") drawRings(ctx, box, cells, t, "#ffb15a", 0.5);
  else if (act === "dig") drawRings(ctx, box, cells, t, "#8a7348", 0.15);
  else if (act === "emerge") drawColumns(ctx, box, cells, t, "#8a7348");
  else if (act === "spires") drawSpires(ctx, box, cells, t);
  else if (act === "land") drawRings(ctx, box, cells, t, "#f0e2c4", 0.55);
  else if (act === "geyser") drawColumns(ctx, box, cells, t, "#3a7fd4");
  else if (act === "splash") drawRings(ctx, box, cells, t, "#7eb6ee", 0.4);
  else if (act === "hail") drawHail(ctx, box, cells, t);
  else if (act === "shards") drawShards(ctx, box, cells, t);
  else if (act === "sleep") drawSleep(ctx, box, cells, t);
  else if (act === "bolt") drawBolt(ctx, box, cells, t);
  else if (act === "ward") drawRings(ctx, box, cells, t, "#ffb15a", 0.35);
  else if (act === "blizzard") drawFlakes(ctx, box, cells, t, t * 520);
  else if (act === "quake") drawQuake(ctx, box, cells, t);
  else if (act === "shard") drawShardBurst(ctx, box, cells, t);
  else return false;
  return true;
}

const TONE = {
  physical: "#f0e2c4",
  fire: "#e2582a",
  earth: "#9a7434",
  oil: "#6b4f1f",
  poison: "#5fae3a",
  water: "#3a7fd4",
  ice: "#bfe6f5",
  control: "#c9b3ef",
} as const;

/** Рисунок сработавшей способности. Метка выбирает вид, без неё остаётся вспышка стихии. */
export function drawAbilityBurst(ctx: CanvasRenderingContext2D, box: Box, burst: AbilityBurst, time: number): void {
  const t = burstAge(burst, time);
  if (t < 0 || t > 1) return;
  if (drawAct(ctx, box, burst, t)) return;
  if (burst.kind === "move") return;
  if (burst.kind === "area") {
    const { size, ox, oy } = box;
    ctx.save();
    ctx.globalAlpha = (1 - t) * 0.7;
    ctx.fillStyle = TONE[burst.tone];
    const grow = size * 0.12 * t;
    for (const cell of burst.cells) ctx.fillRect(ox + cell.x * size - grow, oy + cell.y * size - grow, size + grow * 2, size + grow * 2);
    ctx.restore();
    return;
  }
  if (burst.kind === "line") {
    drawLineGrow(ctx, box, burst.from, burst.to, t, TONE[burst.tone], 0.09, 0.2);
    return;
  }
  if (burst.kind === "shot") {
    drawBlob(ctx, box, burst.from, burst.to, t, TONE[burst.tone], 0.2, 0.08);
    return;
  }
  if (burst.kind === "dash") {
    drawDash(ctx, box, burst.from, burst.to, burst.tone === "fire", t);
    return;
  }
  drawWisp(ctx, box, burst.from, burst.to, t);
}

function pulse(time: number): number {
  return 0.45 + 0.55 * Math.sin(time / 180);
}

/** Намёк способности, пока на клетке висит цифра ходов. */
export function drawWindupHint(ctx: CanvasRenderingContext2D, box: Box, monster: Fighter, cast: Windup, time: number): void {
  const a = pulse(time) * 0.55;
  if (cast.kind === "swing") drawSlash(ctx, box, cast.cells, 0.2 + a * 0.15);
  else if (cast.kind === "stone") drawFall(ctx, box, cast.center, 0.35);
  else if (cast.kind === "jump" || cast.kind === "fuse") drawRings(ctx, box, cast.cells, a * 0.4, "#7ed34a", 0.2);
  else if (cast.kind === "tongue") drawLineGrow(ctx, box, monster, cast.center, 0.35 + a * 0.2, "#c45b62", 0.06, 1);
  else if (cast.kind === "spires") drawSpires(ctx, box, cast.cells, 0.25 + a * 0.2);
  else if (cast.kind === "beam") drawLineGrow(ctx, box, monster, cast.cells[cast.cells.length - 1] ?? cast.center, 0.45, "#bfe6f5", 0.04, 1);
  else if (cast.kind === "appear") drawRings(ctx, box, cast.cells, a * 0.35, "#ffb15a", 0.25);
  else if (cast.kind === "emerge") drawRings(ctx, box, cast.cells, a * 0.3, "#8a7348", 0.2);
  else if (cast.kind === "throw") drawRings(ctx, box, cast.cells, a * 0.3, "#7eb6ee", 0.25);
  else if (cast.kind === "land") drawRings(ctx, box, cast.cells, a * 0.35, "#f0e2c4", 0.3);
  else if (cast.kind === "pounce") {
    drawLineGrow(ctx, box, monster, cast.center, 0.4 + a * 0.2, "#d7c48a", 0.06, 1);
    drawRings(ctx, box, cast.cells, 0.25 + a * 0.2, "#e0a050", 0.4);
  } else if (cast.kind === "rush") {
    const end = cast.cells[cast.cells.length - 1] ?? cast.center;
    drawLineGrow(ctx, box, monster, end, 0.45 + a * 0.2, "#e25822", 0.07, 1);
    drawRings(ctx, box, cast.cells, 0.3 + a * 0.25, "#e07030", 0.4);
  } else if (cast.kind === "charge") {
    drawLineGrow(ctx, box, monster, cast.center, 0.4 + a * 0.2, "#e8dcc8", 0.07, 1);
    drawRings(ctx, box, cast.cells, 0.25 + a * 0.2, "#e07060", 0.35);
  } else if (cast.kind === "wisp") drawRings(ctx, box, cast.cells, 0.25 + a * 0.25, "#d7e4ff", 0.45);
  else if (cast.kind === "spit") {
    drawLineGrow(ctx, box, monster, cast.center, 0.4 + a * 0.2, "#b6e24a", 0.05, 1);
    drawRings(ctx, box, cast.cells, 0.25 + a * 0.2, "#b6e24a", 0.35);
  }
}

/** Гейзер, град и камень, пока они left ждут своего хода. */
export function drawHazardHint(ctx: CanvasRenderingContext2D, box: Box, hazard: Hazard, time: number): void {
  const a = pulse(time);
  if (hazard.kind === "rock") drawFall(ctx, box, hazard.center, 0.25 + a * 0.15);
  else if (hazard.kind === "geyser") drawColumns(ctx, box, hazard.cells, 0.15 + a * 0.2, "#3a7fd4", 0.35);
  else drawHail(ctx, box, hazard.cells, 0.2 + a * 0.25);
}

/** Щит, буран и землетрясение, пока они ещё держатся. */
export function drawHeroZones(
  ctx: CanvasRenderingContext2D,
  box: Box,
  zones: { ward: readonly Cell[]; storm: readonly Cell[]; quakes: readonly (readonly Cell[])[] },
  time: number,
): void {
  if (zones.ward.length > 0) {
    const center = centroid(box, zones.ward);
    ctx.save();
    ctx.globalAlpha = 0.35 + 0.15 * Math.sin(time / 220);
    ctx.strokeStyle = "#ffb15a";
    ctx.lineWidth = Math.max(2, box.size * 0.045);
    ctx.beginPath();
    ctx.ellipse(center.x, center.y + box.size * 0.1, box.size * 1.15, box.size * 0.42, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }
  if (zones.storm.length > 0) drawFlakes(ctx, box, zones.storm, 0.2, time);
  for (const cells of zones.quakes) {
    for (const cell of cells) {
      const p = pt(box, cell.x, cell.y);
      const kick = Math.sin(time / 90 + cell.x) * box.size * 0.03;
      ctx.save();
      ctx.globalAlpha = 0.45;
      ctx.strokeStyle = "#c4a15a";
      ctx.lineWidth = Math.max(1, box.size * 0.025);
      ctx.beginPath();
      ctx.moveTo(p.x - box.size * 0.22, p.y + box.size * 0.1 + kick);
      ctx.lineTo(p.x + box.size * 0.18, p.y + kick);
      ctx.stroke();
      ctx.restore();
    }
  }
}
