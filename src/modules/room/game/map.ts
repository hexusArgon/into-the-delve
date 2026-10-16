import type { Side } from "../data/rooms.ts";
import type { Box } from "./dungeon.ts";
import type { Cell } from "./sim.ts";

/** Floor map: где какая комната, что уже пройдено и где стоит телепорт. */
export interface MapView {
  rooms: readonly {
    slot: Cell;
    links: Partial<Record<Side, number>>;
    role: string;
    portal: Cell | null;
  }[];
  visited: readonly boolean[];
  cleared: readonly boolean[];
  current: number;
  /** Почему клик по карте не переносит. Empty — переход доступен. */
  teleportBlock: string | null;
  /** Портал в хаб в текущей комнате. Empty, пока этаж не пройден. */
  exit: Cell | null;
}

export interface MapHit {
  index: number;
  x: number;
  y: number;
  half: number;
}

export function hitMapRoom(hits: readonly MapHit[], px: number, py: number): number | null {
  for (let i = hits.length - 1; i >= 0; i -= 1) {
    const hit = hits[i]!;
    if (Math.abs(px - hit.x) <= hit.half && Math.abs(py - hit.y) <= hit.half) return hit.index;
  }
  return null;
}

/** Круг телепорта на полу комнаты. */
export function drawPortalPad(ctx: CanvasRenderingContext2D, box: Box, cell: Cell, time: number): void {
  const cx = box.ox + (cell.x + 0.5) * box.size;
  const cy = box.oy + (cell.y + 0.5) * box.size;
  const pulse = 0.5 + 0.5 * Math.sin(time / 420);
  const radius = box.size * 0.36;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.fillStyle = `rgba(36, 168, 160, ${0.16 + 0.1 * pulse})`;
  ctx.beginPath();
  ctx.arc(0, 0, radius, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = `rgba(110, 240, 226, ${0.55 + 0.4 * pulse})`;
  ctx.lineWidth = Math.max(2, box.size * 0.06);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(0, 0, radius * 0.42, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

/** Выход из приключения: железная рама с цепями. */
export function drawExitPad(ctx: CanvasRenderingContext2D, box: Box, cell: Cell, art: HTMLCanvasElement): void {
  const { size, ox, oy } = box;
  const scale = 0.92;
  const fit = (size * scale) / Math.max(art.width, art.height);
  const w = art.width * fit;
  const h = art.height * fit;
  ctx.drawImage(art, ox + cell.x * size + (size - w) / 2, oy + cell.y * size + (size - h) / 2, w, h);
}

function knownRooms(map: MapView): { room: MapView["rooms"][number]; index: number }[] {
  return map.rooms.flatMap((room, index) => (map.visited[index] ? [{ room, index }] : []));
}

function drawLinks(
  ctx: CanvasRenderingContext2D,
  map: MapView,
  known: readonly { room: MapView["rooms"][number]; index: number }[],
  center: (slot: Cell) => Cell,
): void {
  ctx.beginPath();
  known.forEach(({ room, index }) => {
    for (const next of Object.values(room.links)) {
      if (next === undefined || next < index || !map.visited[next]) continue;
      const a = center(room.slot);
      const b = center(map.rooms[next]!.slot);
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
    }
  });
  ctx.stroke();
}

function drawPortalMark(ctx: CanvasRenderingContext2D, x: number, y: number, radius: number, bright: boolean): void {
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.strokeStyle = bright ? "#7af6ea" : "rgba(122, 246, 234, 0.55)";
  ctx.lineWidth = bright ? 3 : 2;
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(x, y, radius * 0.42, 0, Math.PI * 2);
  ctx.stroke();
}

const MINIMAP_CELL = 32;
const MINIMAP_STEP = MINIMAP_CELL + 18;
const MINIMAP_PAD = 18;
export const MINIMAP_MARGIN = 16;

/** Ширина и высота миникарты по уже открытым комнатам. */
export function minimapPanel(map: MapView): { width: number; height: number } | null {
  const known = knownRooms(map);
  if (known.length === 0) return null;
  const xs = known.map(({ room }) => room.slot.x);
  const ys = known.map(({ room }) => room.slot.y);
  const spanX = Math.max(...xs) - Math.min(...xs);
  const spanY = Math.max(...ys) - Math.min(...ys);
  return {
    width: spanX * MINIMAP_STEP + MINIMAP_CELL + MINIMAP_PAD * 2,
    height: spanY * MINIMAP_STEP + MINIMAP_CELL + MINIMAP_PAD * 2,
  };
}

function backingScale(canvas: HTMLCanvasElement): number {
  const css = canvas.clientWidth;
  if (css <= 0) return 1;
  const ratio = canvas.width / css;
  return Number.isFinite(ratio) && ratio > 0 ? ratio : 1;
}

function minimapScale(ctx: CanvasRenderingContext2D): number {
  return canvasScale(ctx.canvas);
}

export function hudScale(node: Element | null): number {
  const host = node?.closest(".dungeon") ?? node;
  const parsed = host ? Number.parseFloat(getComputedStyle(host).getPropertyValue("--hud")) : Number.NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
}

export function canvasScale(canvas: HTMLCanvasElement): number {
  return hudScale(canvas) * backingScale(canvas);
}

/** Прямоугольник миникарты в координатах холста. Тот же расчёт, что у рисунка. */
export function minimapFrame(width: number, map: MapView, scale: number): { x: number; y: number; w: number; h: number } | null {
  const panel = minimapPanel(map);
  if (!panel) return null;
  const margin = MINIMAP_MARGIN * scale;
  return { x: width - panel.width * scale - margin, y: margin, w: panel.width * scale, h: panel.height * scale };
}

export function drawMinimap(ctx: CanvasRenderingContext2D, width: number, map: MapView): void {
  const panel = minimapPanel(map);
  if (!panel) return;
  const known = knownRooms(map);
  const xs = known.map(({ room }) => room.slot.x);
  const ys = known.map(({ room }) => room.slot.y);
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  const scale = minimapScale(ctx);
  const frame = minimapFrame(width, map, scale);
  if (!frame) return;
  const cell = MINIMAP_CELL * scale;
  const step = MINIMAP_STEP * scale;
  const pad = MINIMAP_PAD * scale;
  const left = frame.x;
  const top = frame.y;
  const center = (slot: Cell): Cell => ({
    x: left + pad + (slot.x - minX) * step + cell / 2,
    y: top + pad + (slot.y - minY) * step + cell / 2,
  });

  ctx.save();
  ctx.fillStyle = "rgba(12, 10, 8, 0.88)";
  ctx.strokeStyle = "#6e5830";
  ctx.lineWidth = Math.max(1, scale);
  ctx.beginPath();
  ctx.roundRect(left, top, frame.w, frame.h, 2 * scale);
  ctx.fill();
  ctx.stroke();

  ctx.strokeStyle = "rgba(110, 88, 48, 0.75)";
  ctx.lineWidth = Math.max(1, 5 * scale);
  drawLinks(ctx, map, known, center);

  known.forEach(({ room, index }) => {
    const c = center(room.slot);
    ctx.fillStyle = index === map.current ? "#b8965a" : map.cleared[index] ? "#4a4034" : "#241e18";
    ctx.strokeStyle = "#6e5830";
    ctx.lineWidth = Math.max(1, 2 * scale);
    ctx.fillRect(c.x - cell / 2, c.y - cell / 2, cell, cell);
    ctx.strokeRect(c.x - cell / 2, c.y - cell / 2, cell, cell);
    if (room.role === "start") {
      ctx.fillStyle = index === map.current ? "#1a140e" : "#8a3030";
      const mark = 12 * scale;
      ctx.fillRect(c.x - mark / 2, c.y - mark / 2, mark, mark);
    }
    if (room.portal) drawPortalMark(ctx, c.x, c.y, cell * 0.34, index === map.current);
  });
  ctx.restore();
}

/** Большая карта на весь экран. Возвращает квадраты rooms для клика. */
export function drawMapOverlay(ctx: CanvasRenderingContext2D, width: number, height: number, map: MapView): MapHit[] {
  const known = knownRooms(map);
  if (known.length === 0) return [];
  const xs = known.map(({ room }) => room.slot.x);
  const ys = known.map(({ room }) => room.slot.y);
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  const spanX = Math.max(...xs) - minX;
  const spanY = Math.max(...ys) - minY;
  const pad = Math.max(20 * minimapScale(ctx), Math.round(Math.min(width, height) * 0.045));
  const panelW = width - pad * 2;
  const panelH = height - pad * 2;
  const left = pad;
  const top = pad;
  const scale = minimapScale(ctx);
  const margin = 48 * scale;
  const header = 84 * scale;
  const footer = 72 * scale;
  const innerW = Math.max(1, panelW - margin * 2);
  const innerH = Math.max(1, panelH - header - footer);
  const step = Math.min(innerW / (spanX + 1), innerH / (spanY + 1));
  const cell = step * 0.62;
  const gridW = spanX * step + cell;
  const gridH = spanY * step + cell;
  const originX = left + (panelW - gridW) / 2;
  const originY = top + header + (innerH - gridH) / 2;
  const center = (slot: Cell): Cell => ({
    x: originX + (slot.x - minX) * step + cell / 2,
    y: originY + (slot.y - minY) * step + cell / 2,
  });
  const portals = known.filter(({ room }) => room.portal).length;

  ctx.save();
  ctx.fillStyle = "rgba(12, 10, 8, 0.82)";
  ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = "rgba(16, 13, 10, 0.96)";
  ctx.strokeStyle = "#6e5830";
  ctx.lineWidth = Math.max(1, 2 * scale);
  ctx.beginPath();
  ctx.roundRect(left, top, panelW, panelH, 2 * scale);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = "#d4bc82";
  ctx.font = `600 ${28 * scale}px Palatino Linotype, Palatino, serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("Floor map", left + panelW / 2, top + 32 * scale);
  ctx.fillStyle = "rgba(230, 220, 200, 0.72)";
  ctx.font = `${18 * scale}px Palatino Linotype, Palatino, serif`;
  ctx.fillText(`Teleports open: ${portals}`, left + panelW / 2, top + 62 * scale);

  ctx.strokeStyle = "rgba(110, 88, 48, 0.75)";
  ctx.lineWidth = Math.max(4, cell * 0.16);
  drawLinks(ctx, map, known, center);

  const hits: MapHit[] = [];
  const canLeave = map.teleportBlock === null && known.some(({ room, index }) => room.portal !== null && index !== map.current);
  known.forEach(({ room, index }) => {
    const c = center(room.slot);
    const half = cell / 2;
    const canGo = map.teleportBlock === null && room.portal !== null && index !== map.current;
    ctx.fillStyle = index === map.current ? "#b8965a" : map.cleared[index] ? "#4a4034" : "#241e18";
    ctx.strokeStyle = canGo ? "#d4bc82" : "#6e5830";
    ctx.lineWidth = canGo ? Math.max(1, 3 * scale) : Math.max(1, 2 * scale);
    ctx.fillRect(c.x - half, c.y - half, cell, cell);
    ctx.strokeRect(c.x - half, c.y - half, cell, cell);
    if (room.role === "start") {
      ctx.fillStyle = index === map.current ? "#1a140e" : "#8a3030";
      const mark = Math.max(8, cell * 0.28);
      ctx.fillRect(c.x - mark / 2, c.y - mark / 2, mark, mark);
    }
    if (room.portal) drawPortalMark(ctx, c.x, c.y, cell * 0.32, canGo || index === map.current);
    hits.push({ index, x: c.x, y: c.y, half });
  });

  ctx.fillStyle = "rgba(230, 220, 200, 0.78)";
  ctx.font = `${18 * scale}px Palatino Linotype, Palatino, serif`;
  const hint = map.teleportBlock ?? (canLeave ? "Click another room that has a teleport" : "Find another room with a teleport");
  ctx.fillText(hint, left + panelW / 2, top + panelH - 46 * scale);
  ctx.fillStyle = "rgba(154, 141, 120, 0.7)";
  ctx.fillText("Tab — close", left + panelW / 2, top + panelH - 22 * scale);
  ctx.restore();
  return hits;
}
