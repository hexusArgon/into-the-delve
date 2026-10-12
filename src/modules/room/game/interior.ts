import type { RoomTheme } from "../data/rooms.ts";
import { isFloor, type Cell, type RoomLayout } from "./sim.ts";

export type PropKind =
  | "bones"
  | "candle"
  | "web"
  | "blood"
  | "barrel"
  | "chain"
  | "urn"
  | "wreath"
  | "slab"
  | "shroud"
  | "bowl"
  | "brazier"
  | "circle"
  | "chalice"
  | "incense"
  | "idol"
  | "shield"
  | "helmet"
  | "banner"
  | "spear"
  | "blade"
  | "shackles"
  | "cage"
  | "straw"
  | "bucket"
  | "whip"
  | "mushroom"
  | "root"
  | "puddle"
  | "crystal"
  | "moss"
  | "tome"
  | "scroll"
  | "hourglass"
  | "bell"
  | "candelabra"
  | "throne"
  | "bench"
  | "longtable"
  | "armchair"
  | "stool"
  | "coffin"
  | "pew"
  | "altar"
  | "chest"
  | "font"
  | "stocks"
  | "torture"
  | "cot"
  | "ironshelf"
  | "cellchest"
  | "desk"
  | "bookcase"
  | "highchair"
  | "cabinet"
  | "lectern"
  | "anvil"
  | "forge"
  | "workbench"
  | "weaponrack"
  | "armorstand"
  | "bed"
  | "wardrobe"
  | "cupboard"
  | "nightstand"
  | "bunk";

/** Плоские пятна на полу. Остальные предметы стоят и рисуются целиком в клетке. */
export const FLAT_PROPS = new Set<PropKind>([
  "wreath",
  "shroud",
  "circle",
  "blade",
  "shackles",
  "straw",
  "whip",
  "root",
  "puddle",
  "moss",
]);

const GRAVE: readonly PropKind[] = ["urn", "wreath", "slab", "shroud", "bowl"];
const RITUAL: readonly PropKind[] = ["brazier", "circle", "chalice", "incense", "idol"];
const ARMORY: readonly PropKind[] = ["shield", "helmet", "banner", "spear", "blade"];
const PRISON: readonly PropKind[] = ["shackles", "cage", "straw", "bucket", "whip"];
const RUIN: readonly PropKind[] = ["mushroom", "root", "puddle", "crystal", "moss"];
const SCRIPT: readonly PropKind[] = ["tome", "scroll", "hourglass", "bell", "candelabra"];

const HALL_FURN: readonly PropKind[] = ["throne", "bench", "longtable", "armchair", "stool"];
const GRAVE_FURN: readonly PropKind[] = ["coffin", "pew", "altar", "chest", "font"];
const PRISON_FURN: readonly PropKind[] = ["stocks", "torture", "cot", "ironshelf", "cellchest"];
const STUDY_FURN: readonly PropKind[] = ["desk", "bookcase", "highchair", "cabinet", "lectern"];
const FORGE_FURN: readonly PropKind[] = ["anvil", "forge", "workbench", "weaponrack", "armorstand"];
const ROOM_FURN: readonly PropKind[] = ["bed", "wardrobe", "cupboard", "nightstand", "bunk"];

/** Мебель стоит у другой стены, не вперемешку с мелким реквизитом. */
const FURN_BY_ROOM: Readonly<Record<string, readonly PropKind[]>> = {
  "Колонный зал": HALL_FURN,
  Перекрёсток: HALL_FURN,
  Излом: HALL_FURN,
  Склеп: GRAVE_FURN,
  Катакомбы: GRAVE_FURN,
  "Галерея ниш": GRAVE_FURN,
  Темница: PRISON_FURN,
  Ротонда: STUDY_FURN,
  "Крестовый зал": STUDY_FURN,
  Колодец: STUDY_FURN,
  Обвал: FORGE_FURN,
  Пещера: FORGE_FURN,
  Уступы: FORGE_FURN,
  Ромб: ROOM_FURN,
};

/** Один набор на комнату, чтобы вещи читались как обстановка, а не как свалка. */
const KIT_BY_ROOM: Readonly<Record<string, readonly PropKind[]>> = {
  "Колонный зал": ARMORY,
  Склеп: GRAVE,
  Обвал: RUIN,
  Катакомбы: GRAVE,
  Перекрёсток: ARMORY,
  Темница: PRISON,
  Ротонда: RITUAL,
  "Крестовый зал": RITUAL,
  Излом: ARMORY,
  Пещера: RUIN,
  "Галерея ниш": GRAVE,
  Ромб: SCRIPT,
  Колодец: RITUAL,
  Уступы: RUIN,
};

export interface Furniture {
  kind: "table" | "shelf";
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface FloorProp {
  kind: PropKind;
  x: number;
  y: number;
}

function hash(x: number, y: number, salt: number): number {
  let n = Math.imul(x, 374761393) ^ Math.imul(y, 668265263) ^ Math.imul(salt, 1274126177);
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  n ^= n >>> 16;
  return (n >>> 0) / 4294967296;
}

function byWall(room: RoomLayout, x: number, y: number): boolean {
  return (
    !isFloor(room, x - 1, y) ||
    !isFloor(room, x + 1, y) ||
    !isFloor(room, x, y - 1) ||
    !isFloor(room, x, y + 1)
  );
}

function pick(theme: RoomTheme, edge: boolean, n: number): PropKind | null {
  if (theme === "hall" || theme === "quarters" || theme === "library") return n < 0.75 ? "candle" : null;
  if (theme === "kitchen") {
    if (n < 0.5) return "barrel";
    if (n < 0.85) return "candle";
    return null;
  }
  if (theme === "chapel") return n < 0.8 ? "candle" : "chain";
  if (theme === "cave") {
    if (edge && n < 0.45) return "web";
    if (n < 0.7) return "bones";
    return "barrel";
  }
  if (theme === "prison") {
    if (n < 0.4) return "chain";
    if (n < 0.75) return "bones";
    return "barrel";
  }
  if (edge) {
    if (n < 0.3) return "web";
    if (n < 0.52) return "chain";
    if (n < 0.74) return "candle";
    if (n < 0.88) return "barrel";
    return "bones";
  }
  if (n < 0.34) return "blood";
  if (n < 0.58) return "bones";
  if (n < 0.76) return "candle";
  if (n < 0.9) return "chain";
  return "barrel";
}

function nameSalt(name: string): number {
  let n = 2166136261;
  for (let i = 0; i < name.length; i += 1) n = Math.imul(n ^ name.charCodeAt(i), 16777619);
  return n >>> 0;
}

function touchSide(room: RoomLayout, x: number, y: number): "n" | "s" | "e" | "w" | null {
  const sides: ("n" | "s" | "e" | "w")[] = [];
  if (!isFloor(room, x, y - 1)) sides.push("n");
  if (!isFloor(room, x, y + 1)) sides.push("s");
  if (!isFloor(room, x - 1, y)) sides.push("w");
  if (!isFloor(room, x + 1, y)) sides.push("e");
  if (sides.length === 0) return null;
  return sides[Math.floor(hash(x, y, 31) * sides.length)] ?? sides[0]!;
}

/** Набор комнаты выстраивается вдоль одной стены. Одна бочка остаётся в другом углу. */
function placeAlongWall(room: RoomLayout, doors: readonly Cell[], kit: readonly PropKind[]): FloorProp[] {
  const banned = new Set<string>();
  for (const door of doors) {
    for (let dy = -1; dy <= 1; dy += 1) {
      for (let dx = -1; dx <= 1; dx += 1) banned.add(`${door.x + dx},${door.y + dy}`);
    }
  }
  for (const decor of room.decor) banned.add(`${decor.x},${decor.y}`);
  for (const spawn of room.spawns) banned.add(`${spawn.x},${spawn.y}`);
  const furn = placeFurniture(room, doors);
  for (const piece of furn.pieces) {
    for (let y = piece.y; y < piece.y + piece.h; y += 1) {
      for (let x = piece.x; x < piece.x + piece.w; x += 1) banned.add(`${x},${y}`);
    }
  }
  for (const chair of furn.chairs) banned.add(`${chair.x},${chair.y}`);

  const free: Cell[] = [];
  for (let y = 0; y < room.h; y += 1) {
    for (let x = 0; x < room.w; x += 1) {
      if (!isFloor(room, x, y) || room.blocked[y * room.w + x]) continue;
      if (banned.has(`${x},${y}`)) continue;
      free.push({ x, y });
    }
  }

  const groups = new Map<string, Cell[]>();
  for (const cell of free) {
    const side = touchSide(room, cell.x, cell.y);
    if (!side) continue;
    const list = groups.get(side) ?? [];
    list.push(cell);
    groups.set(side, list);
  }
  const salt = nameSalt(room.name);
  const ranked = [...groups.entries()].sort((a, b) => b[1].length - a[1].length || hash(a[1][0]?.x ?? 0, salt, 5) - hash(b[1][0]?.x ?? 0, salt, 5));
  const chosen = ranked[0];
  const side = chosen?.[0] ?? "n";
  const line = [...(chosen?.[1] ?? free)].sort((a, b) =>
    side === "e" || side === "w" ? a.y - b.y || a.x - b.x : a.x - b.x || a.y - b.y,
  );
  const stride = line.length >= kit.length * 2 ? 2 : 1;
  const span = Math.max(0, (kit.length - 1) * stride);
  const startMax = Math.max(0, line.length - span - 1);
  const start = line.length === 0 ? 0 : Math.floor(hash(room.w, room.h, salt) * (startMax + 1));
  const used = new Set<string>();
  const spots: Cell[] = [];
  for (let i = 0; i < kit.length; i += 1) {
    const cell = line[start + i * stride];
    if (!cell || used.has(`${cell.x},${cell.y}`)) continue;
    spots.push(cell);
    used.add(`${cell.x},${cell.y}`);
  }
  const rest = [
    ...free.filter((cell) => byWall(room, cell.x, cell.y) && !used.has(`${cell.x},${cell.y}`)),
    ...free.filter((cell) => !byWall(room, cell.x, cell.y) && !used.has(`${cell.x},${cell.y}`)),
  ];
  for (const cell of rest) {
    if (spots.length >= kit.length) break;
    spots.push(cell);
    used.add(`${cell.x},${cell.y}`);
  }

  const placed: FloorProp[] = kit.slice(0, spots.length).map((kind, index) => {
    const cell = spots[index]!;
    return { kind, x: cell.x, y: cell.y };
  });
  const barrel = free.find(
    (cell) =>
      !used.has(`${cell.x},${cell.y}`) &&
      byWall(room, cell.x, cell.y) &&
      placed.every((prop) => Math.max(Math.abs(prop.x - cell.x), Math.abs(prop.y - cell.y)) >= 2),
  );
  if (barrel) {
    placed.push({ kind: "barrel", x: barrel.x, y: barrel.y });
    used.add(`${barrel.x},${barrel.y}`);
  }
  const furnKit = FURN_BY_ROOM[room.name];
  if (furnKit) {
    const alt = ranked.find((entry) => entry[0] !== side);
    const altSide = alt?.[0] ?? side;
    const altLine = [...(alt?.[1] ?? free)]
      .filter((cell) => !used.has(`${cell.x},${cell.y}`))
      .sort((a, b) => (altSide === "e" || altSide === "w" ? a.y - b.y || a.x - b.x : a.x - b.x || a.y - b.y));
    for (const kind of furnKit) {
      const freeSpot = (gap: number): Cell | undefined =>
        altLine.find(
          (spot) =>
            !used.has(`${spot.x},${spot.y}`) &&
            placed.every((prop) => Math.max(Math.abs(prop.x - spot.x), Math.abs(prop.y - spot.y)) >= gap),
        ) ??
        free.find(
          (spot) =>
            byWall(room, spot.x, spot.y) &&
            !used.has(`${spot.x},${spot.y}`) &&
            placed.every((prop) => Math.max(Math.abs(prop.x - spot.x), Math.abs(prop.y - spot.y)) >= gap),
        );
      const cell = freeSpot(2) ?? freeSpot(1);
      if (!cell) break;
      placed.push({ kind, x: cell.x, y: cell.y });
      used.add(`${cell.x},${cell.y}`);
    }
  }
  return placed;
}

/** Реквизит комнаты по её типу. Не на дверях, мебели и вплотную к дверям. */
export function scatterInterior(room: RoomLayout, doors: readonly Cell[]): FloorProp[] {
  const kit = KIT_BY_ROOM[room.name];
  if (kit) return placeAlongWall(room, doors, kit);
  const theme = room.theme;
  const banned = new Set<string>();
  for (const door of doors) {
    for (let dy = -1; dy <= 1; dy += 1) {
      for (let dx = -1; dx <= 1; dx += 1) banned.add(`${door.x + dx},${door.y + dy}`);
    }
  }
  for (const decor of room.decor) banned.add(`${decor.x},${decor.y}`);
  const furn = placeFurniture(room, doors);
  for (const piece of furn.pieces) {
    for (let y = piece.y; y < piece.y + piece.h; y += 1) {
      for (let x = piece.x; x < piece.x + piece.w; x += 1) banned.add(`${x},${y}`);
    }
  }
  for (const chair of furn.chairs) banned.add(`${chair.x},${chair.y}`);

  const free: Cell[] = [];
  let floorCount = 0;
  for (let y = 0; y < room.h; y += 1) {
    for (let x = 0; x < room.w; x += 1) {
      if (!isFloor(room, x, y) || room.blocked[y * room.w + x]) continue;
      floorCount += 1;
      if (banned.has(`${x},${y}`)) continue;
      free.push({ x, y });
    }
  }
  free.sort((a, b) => hash(a.x, a.y, 3) - hash(b.x, b.y, 3));

  const placed: FloorProp[] = [];
  const cap = Math.max(4, Math.floor(floorCount / 5));
  for (const cell of free) {
    if (placed.length >= cap) break;
    if (placed.some((prop) => Math.max(Math.abs(prop.x - cell.x), Math.abs(prop.y - cell.y)) < 2)) continue;
    if (hash(cell.x, cell.y, 9) > 0.62) continue;
    const kind = pick(theme, byWall(room, cell.x, cell.y), hash(cell.x, cell.y, 11));
    if (!kind) continue;
    placed.push({ kind, x: cell.x, y: cell.y });
  }
  return placed;
}

const LIVING = new Set<RoomTheme>(["hall", "quarters", "kitchen", "library", "chapel"]);

function keyOf(x: number, y: number): string {
  return `${x},${y}`;
}

function doorBan(doors: readonly Cell[]): Set<string> {
  const banned = new Set<string>();
  for (const door of doors) {
    for (let dy = -1; dy <= 1; dy += 1) {
      for (let dx = -1; dx <= 1; dx += 1) banned.add(keyOf(door.x + dx, door.y + dy));
    }
  }
  return banned;
}

function walkable(room: RoomLayout, extra: Set<string>, x: number, y: number): boolean {
  return isFloor(room, x, y) && room.blocked[y * room.w + x] === 0 && !extra.has(keyOf(x, y));
}

function staysOpen(room: RoomLayout, extra: Set<string>): boolean {
  let start: Cell | null = null;
  let total = 0;
  for (let y = 0; y < room.h; y += 1) {
    for (let x = 0; x < room.w; x += 1) {
      if (!walkable(room, extra, x, y)) continue;
      total += 1;
      if (!start) start = { x, y };
    }
  }
  if (!start || total === 0) return true;
  const seen = new Set<string>([keyOf(start.x, start.y)]);
  const queue = [start];
  for (let i = 0; i < queue.length; i += 1) {
    const cell = queue[i]!;
    for (const step of [
      { x: 1, y: 0 },
      { x: -1, y: 0 },
      { x: 0, y: 1 },
      { x: 0, y: -1 },
    ]) {
      const x = cell.x + step.x;
      const y = cell.y + step.y;
      const id = keyOf(x, y);
      if (seen.has(id) || !walkable(room, extra, x, y)) continue;
      seen.add(id);
      queue.push({ x, y });
    }
  }
  return seen.size === total;
}

function cellFree(room: RoomLayout, extra: Set<string>, banned: Set<string>, x: number, y: number): boolean {
  if (!isFloor(room, x, y) || room.blocked[y * room.w + x]) return false;
  if (extra.has(keyOf(x, y)) || banned.has(keyOf(x, y))) return false;
  return !room.spawns.some((spawn) => spawn.x === x && spawn.y === y);
}

/** Столы, полки и стулья жилых комнат замка. Стул потом можно разбить. */
export function placeFurniture(room: RoomLayout, doors: readonly Cell[]): { pieces: Furniture[]; chairs: Cell[] } {
  if (!LIVING.has(room.theme)) return { pieces: [], chairs: [] };
  const banned = doorBan(doors);
  const extra = new Set<string>();
  const pieces: Furniture[] = [];
  const chairs: Cell[] = [];
  const shelves = room.theme === "library" ? 2 : 1;
  const tableW = room.theme === "hall" ? 3 : 2;
  const chairCount = room.theme === "hall" || room.theme === "quarters" ? 2 : room.theme === "chapel" ? 0 : 1;

  const shelfSpots: Cell[] = [];
  for (let y = 0; y < room.h; y += 1) {
    for (let x = 0; x < room.w - 1; x += 1) {
      if (!cellFree(room, extra, banned, x, y) || !cellFree(room, extra, banned, x + 1, y)) continue;
      if (isFloor(room, x, y - 1) || isFloor(room, x + 1, y - 1)) continue;
      shelfSpots.push({ x, y });
    }
  }
  shelfSpots.sort((a, b) => hash(a.x, a.y, 21) - hash(b.x, b.y, 21));
  for (const spot of shelfSpots) {
    if (pieces.filter((piece) => piece.kind === "shelf").length >= shelves) break;
    const cells = [spot, { x: spot.x + 1, y: spot.y }];
    if (!cells.every((cell) => cellFree(room, extra, banned, cell.x, cell.y))) continue;
    const next = new Set(extra);
    for (const cell of cells) next.add(keyOf(cell.x, cell.y));
    if (!staysOpen(room, next)) continue;
    pieces.push({ kind: "shelf", x: spot.x, y: spot.y, w: 2, h: 1 });
    for (const cell of cells) extra.add(keyOf(cell.x, cell.y));
  }

  const tableSpots: Cell[] = [];
  for (let y = 0; y < room.h; y += 1) {
    for (let x = 0; x <= room.w - tableW; x += 1) {
      let ok = true;
      for (let i = 0; i < tableW; i += 1) if (!cellFree(room, extra, banned, x + i, y)) ok = false;
      if (ok) tableSpots.push({ x, y });
    }
  }
  tableSpots.sort((a, b) => hash(a.x, a.y, 22) - hash(b.x, b.y, 22));
  let table: Furniture | null = null;
  for (const spot of tableSpots) {
    const cells = Array.from({ length: tableW }, (_, i) => ({ x: spot.x + i, y: spot.y }));
    if (!cells.every((cell) => cellFree(room, extra, banned, cell.x, cell.y))) continue;
    const next = new Set(extra);
    for (const cell of cells) next.add(keyOf(cell.x, cell.y));
    if (!staysOpen(room, next)) continue;
    table = { kind: "table", x: spot.x, y: spot.y, w: tableW, h: 1 };
    pieces.push(table);
    for (const cell of cells) extra.add(keyOf(cell.x, cell.y));
    break;
  }

  if (table) {
    const seats: Cell[] = [];
    for (let i = 0; i < table.w; i += 1) seats.push({ x: table.x + i, y: table.y + 1 });
    seats.sort((a, b) => hash(a.x, a.y, 23) - hash(b.x, b.y, 23));
    for (const seat of seats) {
      if (chairs.length >= chairCount) break;
      if (!cellFree(room, extra, banned, seat.x, seat.y)) continue;
      const next = new Set(extra);
      next.add(keyOf(seat.x, seat.y));
      if (!staysOpen(room, next)) continue;
      chairs.push(seat);
      extra.add(keyOf(seat.x, seat.y));
    }
  }
  return { pieces, chairs };
}
