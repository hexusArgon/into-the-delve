import { MONSTER_DOOR_GAP, ROOMS, type Door, type RoomPattern, type Side } from "../data/rooms.ts";
import { placeFurniture, scatterInterior } from "./interior.ts";
import { FLOOR_ROOMS, HERO_HP, PORTAL_SHARE } from "./rules.ts";
import { ELEMENTS, KIT, MONSTERS, monsterById } from "../data/monsters.ts";
import { EMPTY_GEAR, type GearBonus } from "../data/items.ts";
import { weaponById, type WeaponId } from "../data/weapons.ts";
import {
  DIRS,
  OPPOSITE,
  SIDE_FACING,
  buildLayout,
  createRoom,
  distancesTo,
  isBlocked,
  isFloor,
  isPit,
  monsterFighter,
  roomMonsters,
  type Cell,
  type GroundKind,
  type RoomState,
} from "./sim.ts";

export type RoomRole = "start" | "fight";

export interface FloorRoom {
  /** Место комнаты на карте этажа. Соседи по карте соединены дверью. */
  slot: Cell;
  pattern: RoomPattern;
  role: RoomRole;
  links: Partial<Record<Side, number>>;
  /** Клетка круга на полу. Из такой комнаты можно уйти в другую с кругом. */
  portal: Cell | null;
  /** Id из таблицы монстров. В стартовой комнате список пуст. */
  monsterIds: string[];
}

/** В боевой комнате от 2 до 6 монстров. Тип каждый раз заново, повторы можно. */
const FIGHT_PACK_MIN = 2;
const FIGHT_PACK_MAX = 6;

/** Разбитые бочки и золото, которое ещё лежит на полу этой комнаты. */
export interface RoomGoods {
  broken: string[];
  piles: Cell[];
}

export interface Run {
  seed: number;
  rooms: readonly FloorRoom[];
  goods: RoomGoods[];
  weapon: WeaponId;
  /** Надетая экипировка на весь забег. */
  gear: GearBonus;
  /** Остаток магазина на весь забег. Пусто у оружия без магазина. */
  ammo: number | null;
  visited: boolean[];
  cleared: boolean[];
  current: number;
  /** Портал в хаб. Появляется в комнате, где зачистили последнюю. */
  exit: { room: number; cell: Cell } | null;
  state: RoomState;
}

const SIDES: readonly Side[] = ["north", "east", "south", "west"];

function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hasDoors(pattern: RoomPattern, sides: readonly Side[]): boolean {
  return sides.every((side) => pattern.doors.some((door) => door.side === side));
}

function doorOn(pattern: RoomPattern, side: Side): Door {
  const door = pattern.doors.find((item) => item.side === side);
  if (!door) throw new Error(`${pattern.id}: нет двери на стороне ${side}`);
  return door;
}

/**
 * Этаж растёт от стартовой комнаты: к случайной уже стоящей комнате пристраивается соседняя.
 * Каждой комнате достаётся паттерн из пула, у которого есть двери на все нужные стороны.
 */
export function buildFloor(seed: number, count: number = FLOOR_ROOMS): FloorRoom[] {
  const rng = seeded(seed);
  const placed: { slot: Cell; links: Partial<Record<Side, number>> }[] = [{ slot: { x: 0, y: 0 }, links: {} }];
  const taken = new Set(["0,0"]);
  for (let guard = 0; placed.length < count && guard < 2000; guard += 1) {
    const fromIndex = Math.floor(rng() * placed.length);
    const from = placed[fromIndex]!;
    const side = SIDES[Math.floor(rng() * SIDES.length)]!;
    const step = DIRS[SIDE_FACING[side]];
    const slot = { x: from.slot.x + step.x, y: from.slot.y + step.y };
    const key = `${slot.x},${slot.y}`;
    if (taken.has(key)) continue;
    taken.add(key);
    from.links[side] = placed.length;
    placed.push({ slot, links: { [OPPOSITE[side]]: fromIndex } });
  }

  const pool = ROOMS.slice();
  for (let i = pool.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [pool[i], pool[j]] = [pool[j]!, pool[i]!];
  }
  const used = new Set<string>();
  const rooms: FloorRoom[] = placed.map((room, index) => {
    const sides = SIDES.filter((side) => room.links[side] !== undefined);
    const fits = pool.filter((pattern) => hasDoors(pattern, sides));
    const pattern = fits.find((item) => !used.has(item.id)) ?? fits[0];
    if (!pattern) throw new Error(`нет паттерна с дверями ${sides.join(", ")}`);
    used.add(pattern.id);
    return {
      slot: room.slot,
      pattern,
      role: index === 0 ? "start" : "fight",
      links: room.links,
      portal: null,
      monsterIds: [],
    };
  });
  placePortals(rooms, rng);
  placeMonsters(rooms, rng);
  return rooms;
}

function placeMonsters(rooms: FloorRoom[], rng: () => number): void {
  const ids = MONSTERS.filter((monster) => monster.id !== "8" && monster.id !== "20").map((monster) => monster.id);
  for (const room of rooms) {
    if (room.role !== "fight") continue;
    const count = FIGHT_PACK_MIN + Math.floor(rng() * (FIGHT_PACK_MAX - FIGHT_PACK_MIN + 1));
    room.monsterIds = [];
    for (let n = 0; n < count; n += 1) {
      room.monsterIds.push(ids[Math.floor(rng() * ids.length)]!);
    }
  }
}

/** Сколько комнат этажа получают телепорт: доля PORTAL_SHARE, округление до целого. */
export function portalRoomCount(rooms: number): number {
  return Math.round(rooms * PORTAL_SHARE);
}

function portalCell(pattern: RoomPattern, rng: () => number): Cell {
  const layout = buildLayout(pattern);
  const doors = new Set(pattern.doors.map((door) => `${door.x},${door.y}`));
  const reach = distancesTo(layout, pattern.hero);
  const preferred: Cell[] = [];
  const fallback: Cell[] = [];
  for (let y = 0; y < pattern.h; y += 1) {
    for (let x = 0; x < pattern.w; x += 1) {
      if (isBlocked(layout, x, y) || doors.has(`${x},${y}`)) continue;
      if (reach[y * pattern.w + x]! < 0) continue;
      const cell = { x, y };
      const spawn =
        (x === pattern.hero.x && y === pattern.hero.y) ||
        (x === pattern.monster.x && y === pattern.monster.y);
      if (spawn) fallback.push(cell);
      else preferred.push(cell);
    }
  }
  const pool = preferred.length > 0 ? preferred : fallback;
  if (pool.length === 0) throw new Error(`нет клетки для телепорта в ${pattern.id}`);
  const cx = (pattern.w - 1) / 2;
  const cy = (pattern.h - 1) / 2;
  const ranked = pool
    .map((cell) => ({ cell, d: (cell.x - cx) ** 2 + (cell.y - cy) ** 2 }))
    .sort((a, b) => a.d - b.d);
  const band = ranked.slice(0, Math.max(1, Math.ceil(ranked.length * 0.25)));
  return band[Math.floor(rng() * band.length)]!.cell;
}

function placePortals(rooms: FloorRoom[], rng: () => number): void {
  const order = rooms.map((_, index) => index);
  for (let i = order.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [order[i], order[j]] = [order[j]!, order[i]!];
  }
  for (const index of order.slice(0, portalRoomCount(rooms.length))) {
    rooms[index]!.portal = portalCell(rooms[index]!.pattern, rng);
  }
}

function spareMonsterCell(state: RoomState): Cell | null {
  const room = state.room;
  const taken = new Set<string>([`${state.hero.x},${state.hero.y}`]);
  for (const monster of roomMonsters(state)) taken.add(`${monster.x},${monster.y}`);
  for (const door of state.exits) taken.add(`${door.x},${door.y}`);
  for (const barrel of state.barrels) taken.add(`${barrel.x},${barrel.y}`);
  for (const chair of state.chairs) taken.add(`${chair.x},${chair.y}`);
  const reach = distancesTo(room, state.hero);
  const preferred: Cell[] = [];
  const fallback: Cell[] = [];
  for (let y = 0; y < room.h; y += 1) {
    for (let x = 0; x < room.w; x += 1) {
      if (isBlocked(room, x, y) || isPit(room, x, y) || taken.has(`${x},${y}`)) continue;
      if ((reach[y * room.w + x] ?? -1) < 0) continue;
      const cell = { x, y };
      const nearDoor = state.exits.some((door) => Math.abs(cell.x - door.x) + Math.abs(cell.y - door.y) < MONSTER_DOOR_GAP);
      if (nearDoor) fallback.push(cell);
      else preferred.push(cell);
    }
  }
  const pool = preferred.length > 0 ? preferred : fallback;
  pool.sort((a, b) => {
    const far = Math.abs(b.x - state.hero.x) + Math.abs(b.y - state.hero.y) - (Math.abs(a.x - state.hero.x) + Math.abs(a.y - state.hero.y));
    return far || b.x - a.x || b.y - a.y;
  });
  return pool[0] ?? null;
}

const GROUND_KINDS: readonly GroundKind[] = ["ice", "fire", "oil", "poison", "water"];

/** В каждой боевой комнате по луже каждой стихии, в стороне от входа и дверей. */
function seedGround(state: RoomState): void {
  const room = state.room;
  const banned = new Set<string>();
  const ban = (x: number, y: number): void => {
    banned.add(`${x},${y}`);
  };
  ban(state.hero.x, state.hero.y);
  for (const monster of roomMonsters(state)) ban(monster.x, monster.y);
  for (const door of state.exits) {
    ban(door.x, door.y);
    for (const step of Object.values(DIRS)) ban(door.x + step.x, door.y + step.y);
  }
  for (const barrel of state.barrels) ban(barrel.x, barrel.y);
  for (const chair of state.chairs) ban(chair.x, chair.y);
  const free: Cell[] = [];
  for (let y = 0; y < room.h; y += 1) {
    for (let x = 0; x < room.w; x += 1) {
      if (isBlocked(room, x, y) || isPit(room, x, y) || banned.has(`${x},${y}`)) continue;
      free.push({ x, y });
    }
  }
  free.sort((a, b) => {
    const da = Math.abs(a.x - state.hero.x) + Math.abs(a.y - state.hero.y);
    const db = Math.abs(b.x - state.hero.x) + Math.abs(b.y - state.hero.y);
    return db - da || a.x - b.x || a.y - b.y;
  });
  const used = new Set<string>();
  const open = (cell: Cell): boolean =>
    !used.has(`${cell.x},${cell.y}`) &&
    free.some((spot) => spot.x === cell.x && spot.y === cell.y);
  for (const kind of GROUND_KINDS) {
    const first = free.find((cell) => open(cell));
    if (!first) break;
    used.add(`${first.x},${first.y}`);
    const neighbor = Object.values(DIRS)
      .map((step) => ({ x: first.x + step.x, y: first.y + step.y }))
      .find(open);
    const patch = neighbor ? [first, neighbor] : [first];
    if (neighbor) used.add(`${neighbor.x},${neighbor.y}`);
    for (const cell of patch) {
      state.ground[cell.y * room.w + cell.x] = {
        kind,
        stacks: kind === "poison" ? KIT.slime.stacks : 0,
        turns: ELEMENTS.puddleTurns,
      };
    }
  }
}

function exitsOf(room: FloorRoom): Door[] {
  return SIDES.flatMap((side) => (room.links[side] === undefined ? [] : [doorOn(room.pattern, side)]));
}

function enter(
  run: Pick<Run, "rooms" | "cleared" | "goods" | "weapon" | "ammo" | "gear">,
  index: number,
  via: Side | null,
  heroHp: number,
  carried: number,
): RoomState {
  const room = run.rooms[index]!;
  const arrival = via ? doorOn(room.pattern, via) : null;
  const hero = arrival ? { x: arrival.x, y: arrival.y, facing: SIDE_FACING[OPPOSITE[via!]] } : room.pattern.hero;
  const cleared = run.cleared[index] ?? false;
  const state = createRoom(room.pattern, {
    exits: exitsOf(room),
    hero,
    heroHp,
    monster: !cleared,
    weapon: run.weapon,
    ammo: run.ammo,
    gear: run.gear,
    monsterKind: room.monsterIds[0],
  });
  const goods = run.goods[index] ?? { broken: [], piles: [] };
  const broken = new Set(goods.broken);
  const furn = placeFurniture(state.room, state.exits);
  state.furniture = furn.pieces;
  state.chairs = furn.chairs.filter((chair) => !broken.has(`${chair.x},${chair.y}`));
  const block = (x: number, y: number): void => {
    state.room.blocked[y * state.room.w + x] = 1;
  };
  for (const piece of state.furniture) {
    for (let y = piece.y; y < piece.y + piece.h; y += 1) {
      for (let x = piece.x; x < piece.x + piece.w; x += 1) block(x, y);
    }
  }
  state.barrels = scatterInterior(state.room, state.exits)
    .filter((prop) => prop.kind === "barrel" && !broken.has(`${prop.x},${prop.y}`))
    .map((prop) => ({ x: prop.x, y: prop.y }));
  state.broken = [...goods.broken];
  state.piles = goods.piles.map((pile) => ({ x: pile.x, y: pile.y }));
  if (!cleared) {
    for (const id of room.monsterIds.slice(1)) {
      const spec = monsterById(id);
      const cell = spareMonsterCell(state);
      if (!spec || !cell) continue;
      state.monsters.push(monsterFighter(spec, { x: cell.x, y: cell.y, facing: room.pattern.monster.facing }, true));
    }
  }
  state.carried = carried;
  if (room.role === "fight") seedGround(state);
  if (room.role === "start" && !via) state.note = "Начало этажа. Выходы — проёмы в стенах.";
  else if (!cleared) state.note = "Двери захлопнулись. Победи монстров, чтобы выйти.";
  return state;
}

export function createRun(seed: number, weapon: WeaponId = "sword", gear: GearBonus = EMPTY_GEAR): Run {
  const rooms = buildFloor(seed);
  const cleared = rooms.map((room) => room.role === "start");
  const visited = rooms.map((_, index) => index === 0);
  const goods = rooms.map(() => ({ broken: [], piles: [] }));
  const run = {
    seed,
    rooms,
    goods,
    weapon,
    gear,
    ammo: weaponById(weapon).magazine,
    visited,
    cleared,
    current: 0,
    exit: null,
    state: null as unknown as RoomState,
  };
  run.state = enter(run, 0, null, HERO_HP + gear.maxHp, 0);
  return run;
}

/** Отмечает комнату зачищенной, как только в ней пал монстр. */
export function syncRun(run: Run): void {
  if (run.state.outcome === "won") run.cleared[run.current] = true;
  run.goods[run.current] = {
    broken: [...run.state.broken],
    piles: run.state.piles.map((pile) => ({ x: pile.x, y: pile.y })),
  };
  if (!run.exit && run.cleared.every(Boolean)) {
    run.exit = { room: run.current, cell: exitCell(run.state) };
    run.state.note = `${run.state.note} Портал в хаб открылся.`.trim();
  }
}

/** Ближайшая свободная клетка, не дверь и не та, где стоит герой. */
function exitCell(state: RoomState): Cell {
  const skip = new Set<string>([`${state.hero.x},${state.hero.y}`]);
  for (const door of state.exits) skip.add(`${door.x},${door.y}`);
  const pool: Cell[] = [];
  for (let y = 0; y < state.room.h; y += 1) {
    for (let x = 0; x < state.room.w; x += 1) {
      if (isBlocked(state.room, x, y) || isPit(state.room, x, y) || !isFloor(state.room, x, y)) continue;
      if (skip.has(`${x},${y}`)) continue;
      pool.push({ x, y });
    }
  }
  pool.sort(
    (a, b) =>
      Math.abs(a.x - state.hero.x) + Math.abs(a.y - state.hero.y) - (Math.abs(b.x - state.hero.x) + Math.abs(b.y - state.hero.y)) ||
      a.x - b.x ||
      a.y - b.y,
  );
  return pool[0] ?? { x: state.hero.x, y: state.hero.y };
}

/** Если герой вышел в дверь, переносит его в соседнюю комнату. HP сохраняется, Blink и шкала — новые. */
export function travel(run: Run): boolean {
  const side = run.state.leaving;
  if (!side) return false;
  run.state.leaving = null;
  const next = run.rooms[run.current]?.links[side];
  if (next === undefined) return false;
  syncRun(run);
  const carried = run.state.carried;
  const hp = run.state.hero.hp;
  run.ammo = run.state.ammo;
  run.current = next;
  run.visited[next] = true;
  run.state = enter(run, next, OPPOSITE[side], hp, carried);
  return true;
}

/**
 * Переход между уже открытыми комнатами с телепортом.
 * Пока враг жив, круг молчит. HP сохраняется, Blink и шкала — как при входе в дверь.
 */
export function teleport(run: Run, to: number): boolean {
  if (to < 0 || to >= run.rooms.length || to === run.current) return false;
  const from = run.rooms[run.current]!;
  const dest = run.rooms[to]!;
  if (!run.visited[to]) {
    run.state.note = "Эта комната ещё не открыта.";
    return false;
  }
  if (!from.portal) {
    run.state.note = "Телепорт работает только из комнаты с телепортом.";
    return false;
  }
  if (run.state.outcome !== "won") {
    run.state.note = run.state.outcome === "lost" ? "Телепорт недоступен." : "Телепорт закрыт, пока враг жив.";
    return false;
  }
  if (!dest.portal) {
    run.state.note = "В этой комнате нет телепорта.";
    return false;
  }
  const hp = run.state.hero.hp;
  const facing = run.state.hero.facing;
  const carried = run.state.carried;
  run.ammo = run.state.ammo;
  syncRun(run);
  run.current = to;
  run.visited[to] = true;
  run.state = enter(run, to, null, hp, carried);
  run.state.hero.x = dest.portal.x;
  run.state.hero.y = dest.portal.y;
  run.state.hero.facing = facing;
  run.state.note = "Телепорт перенёс тебя в другую комнату.";
  return true;
}
