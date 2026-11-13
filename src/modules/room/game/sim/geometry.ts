/** Сетка комнаты: стены, ямы, расстояния, ромб и волна дистанций. Часть симуляции комнаты, вход — ../sim.ts. */
import type { RoomPattern } from "../../data/rooms.ts";
import { type Cell, ORTHO, type RoomLayout } from "./types.ts";

export function buildLayout(pattern: RoomPattern): RoomLayout {
  const floor = new Uint8Array(pattern.w * pattern.h).fill(1);
  const blocked = new Uint8Array(pattern.w * pattern.h);
  const walls = new Uint8Array(pattern.w * pattern.h);
  const pits = new Uint8Array(pattern.w * pattern.h);
  if (pattern.shape) {
    for (let y = 0; y < pattern.h; y += 1) {
      const row = pattern.shape[y] ?? "";
      for (let x = 0; x < pattern.w; x += 1) {
        if (row[x] === ".") continue;
        floor[y * pattern.w + x] = 0;
        blocked[y * pattern.w + x] = 1;
      }
    }
  }
  for (const stamp of pattern.stamps) {
    for (let y = stamp.y; y < stamp.y + stamp.h; y += 1) {
      for (let x = stamp.x; x < stamp.x + stamp.w; x += 1) {
        if (x < 0 || y < 0 || x >= pattern.w || y >= pattern.h) continue;
        blocked[y * pattern.w + x] = 1;
        if (stamp.kind === "wall") walls[y * pattern.w + x] = 1;
        if (stamp.kind === "pit") pits[y * pattern.w + x] = 1;
      }
    }
  }
  return {
    id: pattern.id,
    name: pattern.name,
    w: pattern.w,
    h: pattern.h,
    floor,
    blocked,
    walls,
    pits,
    stamps: pattern.stamps,
    decor: pattern.decor,
    theme: pattern.theme ?? "crypt",
    spawns: [pattern.hero, pattern.monster],
  };
}

export function inRoom(room: RoomLayout, x: number, y: number): boolean {
  return x >= 0 && y >= 0 && x < room.w && y < room.h;
}

export function isBlocked(room: RoomLayout, x: number, y: number): boolean {
  return !inRoom(room, x, y) || room.blocked[y * room.w + x] === 1;
}

/** Пол комнаты, включая клетки под штампами. Пустота силуэта и всё за краем — не пол. */
export function isFloor(room: RoomLayout, x: number, y: number): boolean {
  return inRoom(room, x, y) && room.floor[y * room.w + x] === 1;
}

export function isWallCell(room: RoomLayout, x: number, y: number): boolean {
  return inRoom(room, x, y) && room.walls[y * room.w + x] === 1;
}

export function isPit(room: RoomLayout, x: number, y: number): boolean {
  return inRoom(room, x, y) && room.pits[y * room.w + x] === 1;
}

export function chebyshev(a: Cell, b: Cell): number {
  return Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
}

export function manhattan(a: Cell, b: Cell): number {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
}

export function sameCell(a: Cell, b: Cell): boolean {
  return a.x === b.x && a.y === b.y;
}

export function hasCell(cells: readonly Cell[], cell: Cell): boolean {
  return cells.some((item) => sameCell(item, cell));
}

export function spot(cell: Cell): Cell {
  return { x: cell.x, y: cell.y };
}

/** Выбор клетки Blink: ромб, не круг и не квадрат. */
export function inDiamond(a: Cell, b: Cell, range: number): boolean {
  return manhattan(a, b) <= range;
}

/** Шагов до цели в обход препятствий, -1 если не дойти. extra — клетки, которые держат бочки автоматона. */
export function distancesTo(room: RoomLayout, target: Cell, extra?: (x: number, y: number) => boolean): Int16Array {
  const blocked = (x: number, y: number): boolean => isBlocked(room, x, y) || extra?.(x, y) === true;
  const dist = new Int16Array(room.w * room.h).fill(-1);
  if (blocked(target.x, target.y)) return dist;
  const start = target.y * room.w + target.x;
  dist[start] = 0;
  const queue = [start];
  for (let head = 0; head < queue.length; head += 1) {
    const current = queue[head]!;
    const cx = current % room.w;
    const cy = (current - cx) / room.w;
    for (const step of ORTHO) {
      const nx = cx + step.x;
      const ny = cy + step.y;
      if (blocked(nx, ny)) continue;
      const next = ny * room.w + nx;
      if (dist[next] !== -1) continue;
      dist[next] = dist[current]! + 1;
      queue.push(next);
    }
  }
  return dist;
}
