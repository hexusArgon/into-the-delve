import type { Side } from "../data/rooms.ts";
import type { Box } from "./dungeon.ts";
import type { Cell } from "./sim.ts";

/** Карта этажа: где какая комната, что уже пройдено и где стоит телепорт. */
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
  /** Почему клик по карте не переносит. Пусто — переход доступен. */
  teleportBlock: string | null;
  /** Портал в хаб в текущей комнате. Пусто, пока этаж не пройден. */
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

/** Портал домой. Тот же круг, но золотой, чтобы не спутать с телепортом между комнатами. */
export function drawExitPad(ctx: CanvasRenderingContext2D, box: Box, cell: Cell, time: number): void {
  const cx = box.ox + (cell.x + 0.5) * box.size;
  const cy = box.oy + (cell.y + 0.5) * box.size;
  const pulse = 0.5 + 0.5 * Math.sin(time / 420);
  const radius = box.size * 0.36;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.fillStyle = `rgba(196, 154, 74, ${0.2 + 0.12 * pulse})`;
  ctx.beginPath();
  ctx.arc(0, 0, radius, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = `rgba(244, 214, 140, ${0.6 + 0.35 * pulse})`;
  ctx.lineWidth = Math.max(2, box.size * 0.06);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(0, 0, radius * 0.42, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
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

export function drawMinimap(ctx: CanvasRenderingContext2D, width: number, map: MapView): void {
  const known = knownRooms(map);
  if (known.length === 0) return;
  const xs = known.map(({ room }) => room.slot.x);
  const ys = known.map(({ room }) => room.slot.y);
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  const cell = 32;
  const step = cell + 18;
  const pad = 18;
  const panelW = (Math.max(...xs) - minX) * step + cell + pad * 2;
  const panelH = (Math.max(...ys) - minY) * step + cell + pad * 2;
  const left = width - panelW - 16;
  const top = 16;
  const center = (slot: Cell): Cell => ({
    x: left + pad + (slot.x - minX) * step + cell / 2,
    y: top + pad + (slot.y - minY) * step + cell / 2,
  });

  ctx.save();
  ctx.fillStyle = "rgba(12, 10, 8, 0.88)";
  ctx.strokeStyle = "#6e5830";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.roundRect(left, top, panelW, panelH, 2);
  ctx.fill();
  ctx.stroke();

  ctx.strokeStyle = "rgba(110, 88, 48, 0.75)";
  ctx.lineWidth = 5;
  drawLinks(ctx, map, known, center);

  known.forEach(({ room, index }) => {
    const c = center(room.slot);
    ctx.fillStyle = index === map.current ? "#b8965a" : map.cleared[index] ? "#4a4034" : "#241e18";
    ctx.strokeStyle = "#6e5830";
    ctx.lineWidth = 2;
    ctx.fillRect(c.x - cell / 2, c.y - cell / 2, cell, cell);
    ctx.strokeRect(c.x - cell / 2, c.y - cell / 2, cell, cell);
    if (room.role === "start") {
      ctx.fillStyle = index === map.current ? "#1a140e" : "#8a3030";
      const mark = 12;
      ctx.fillRect(c.x - mark / 2, c.y - mark / 2, mark, mark);
    }
    if (room.portal) drawPortalMark(ctx, c.x, c.y, cell * 0.34, index === map.current);
  });
  ctx.restore();
}

/** Большая карта на весь экран. Возвращает квадраты комнат для клика. */
export function drawMapOverlay(ctx: CanvasRenderingContext2D, width: number, height: number, map: MapView): MapHit[] {
  const known = knownRooms(map);
  if (known.length === 0) return [];
  const xs = known.map(({ room }) => room.slot.x);
  const ys = known.map(({ room }) => room.slot.y);
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  const spanX = Math.max(...xs) - minX;
  const spanY = Math.max(...ys) - minY;
  const pad = Math.max(20, Math.round(Math.min(width, height) * 0.045));
  const panelW = width - pad * 2;
  const panelH = height - pad * 2;
  const left = pad;
  const top = pad;
  const margin = 48;
  const header = 84;
  const footer = 72;
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
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.roundRect(left, top, panelW, panelH, 2);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = "#d4bc82";
  ctx.font = "600 28px Palatino Linotype, Palatino, serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("Карта этажа", left + panelW / 2, top + 32);
  ctx.fillStyle = "rgba(230, 220, 200, 0.72)";
  ctx.font = "18px Palatino Linotype, Palatino, serif";
  ctx.fillText(`Открыто телепортов: ${portals}`, left + panelW / 2, top + 62);

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
    ctx.lineWidth = canGo ? 3 : 2;
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
  ctx.font = "18px Palatino Linotype, Palatino, serif";
  const hint = map.teleportBlock ?? (canLeave ? "Кликни по другой комнате с телепортом" : "Найди ещё комнату с телепортом");
  ctx.fillText(hint, left + panelW / 2, top + panelH - 46);
  ctx.fillStyle = "rgba(154, 141, 120, 0.7)";
  ctx.fillText("Tab — закрыть", left + panelW / 2, top + panelH - 22);
  ctx.restore();
  return hits;
}
