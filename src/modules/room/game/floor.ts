import { MONSTER_DOOR_GAP, ROOMS, type Door, type RoomPattern, type Side } from "../data/rooms.ts";
import { placeFurniture, scatterInterior } from "./interior.ts";
import { FLOOR_ROOMS, HERO_HP, PORTAL_SHARE } from "./rules.ts";
import { ELEMENTS, KIT, MONSTERS, monsterById } from "../data/monsters.ts";
import { GEAR } from "../data/items.ts";
import { HERO_ABILITIES } from "../data/hero-abilities.ts";
import { WEAPONS } from "../data/weapons.ts";
import type { RunAbility } from "../data/hero-abilities.ts";
import { EMPTY_GEAR, type GearBonus } from "../data/items.ts";
import { weaponById, type WeaponId } from "../data/weapons.ts";
import { rollDropCount } from "./adventure.ts";
import {
  DIRS,
  OPPOSITE,
  SIDE_FACING,
  buildLayout,
  claimFloorLoot,
  createRoom,
  onBoard,
  type CarryLoot,
  distancesTo,
  isBlocked,
  isFloor,
  isPit,
  monsterFighter,
  roomMonsters,
  type Cell,
  type GroundKind,
  type LootParcel,
  type RoomState,
} from "./sim.ts";

export type RoomRole = "start" | "fight";

export interface FloorRoom {
  /** Rank комнаты на карте этажа. Соседи по карте соединены дверью. */
  slot: Cell;
  pattern: RoomPattern;
  role: RoomRole;
  links: Partial<Record<Side, number>>;
  /** Клетка круга на полу. Из такой комнаты можно уйти в другую с кругом. */
  portal: Cell | null;
  /** Id из таблицы монстров. В стартовой комнате список пуст. */
  monsterIds: string[];
}

/** В боевой комнате от 2 до 6 монстров. Тип каждый раз заново, повторы можно. Рарников не больше одного. */
const FIGHT_PACK_MIN = 2;
const FIGHT_PACK_MAX = 6;

/** Разбитые бочки и золото, которое ещё лежит на полу этой комнаты. */
export interface RoomGoods {
  broken: string[];
  piles: Cell[];
  /** Шмотки последней комнаты. Пусто, пока этаж не зачищен или их уже подняли. */
  loot: (Cell & CarryLoot)[];
  /** Ключи открытых сундуков, x,y. */
  opened: string[];
}

export interface Run {
  seed: number;
  rooms: readonly FloorRoom[];
  goods: RoomGoods[];
  weapon: WeaponId;
  /** Надетая экипировка на весь забег. */
  gear: GearBonus;
  /** Damage попадания надетого экземпляра. Empty — база каталога. */
  weaponHit: number | null;
  abilities: (RunAbility | null)[];
  abilityCd: Record<string, number>;
  /** Остаток магазина на весь забег. Empty у оружия без магазина. */
  ammo: number | null;
  visited: boolean[];
  cleared: boolean[];
  current: number;
  /** Комната портала в хаб. Самая дальняя от старта, при равенстве — случайная. */
  hub: number;
  /** Портал в хаб. Появляется, когда зачищена комната hub. */
  exit: { room: number; cell: Cell } | null;
  /** Выбранный уровень. 0 — без прибавки к монстрам и с одной вещью. */
  adventure: number;
  /** Вещи забега и кто их уронит. Считается один раз, в начале. */
  parcels: LootParcel[];
  state: RoomState;
}

const SIDES: readonly Side[] = ["north", "east", "south", "west"];

/** Комната портала: максимальная дистанция по дверям от старта. Несколько таких — одна случайная. */
export function pickHubRoom(rooms: readonly { links: Partial<Record<Side, number>> }[], rng: () => number): number {
  if (rooms.length <= 1) return 0;
  const dist = rooms.map(() => -1);
  dist[0] = 0;
  const queue = [0];
  for (let head = 0; head < queue.length; head += 1) {
    const index = queue[head]!;
    for (const next of Object.values(rooms[index]!.links)) {
      if (next === undefined || dist[next] !== -1) continue;
      dist[next] = dist[index]! + 1;
      queue.push(next);
    }
  }
  const max = Math.max(...dist);
  const far = dist.flatMap((step, index) => (step === max ? [index] : []));
  return far[Math.floor(rng() * far.length)] ?? 0;
}

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
  const roster = MONSTERS.filter((monster) => monster.spawn);
  for (const room of rooms) {
    if (room.role !== "fight") continue;
    const count = FIGHT_PACK_MIN + Math.floor(rng() * (FIGHT_PACK_MAX - FIGHT_PACK_MIN + 1));
    room.monsterIds = [];
    let rare = false;
    for (let n = 0; n < count; n += 1) {
      const pool = rare ? roster.filter((monster) => !monster.rare) : roster;
      const pick = pool[Math.floor(rng() * pool.length)];
      if (!pick) continue;
      room.monsterIds.push(pick.id);
      if (pick.rare) rare = true;
    }
  }
}

/** Сколько rooms этажа получают телепорт: доля PORTAL_SHARE, округление до целого. */
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

/** Не ближе 4 клеток по Чебышёву от места, где появился герой. Если таких клеток меньше стаи — остальные берутся дальше всех. */
const SPAWN_GAP = 4;

function scatterMonsters(state: RoomState, rng: () => number): void {
  const pack = state.monsters.filter(onBoard);
  if (pack.length === 0) return;
  const hero = state.hero;
  const room = state.room;
  const banned = new Set<string>([`${hero.x},${hero.y}`]);
  for (const door of state.exits) banned.add(`${door.x},${door.y}`);
  for (const barrel of state.barrels) banned.add(`${barrel.x},${barrel.y}`);
  for (const chair of state.chairs) banned.add(`${chair.x},${chair.y}`);
  for (const chest of state.chests) if (!chest.open) banned.add(`${chest.x},${chest.y}`);
  const reach = distancesTo(room, hero);
  const far: Cell[] = [];
  const rest: Cell[] = [];
  for (let y = 0; y < room.h; y += 1) {
    for (let x = 0; x < room.w; x += 1) {
      if (isBlocked(room, x, y) || isPit(room, x, y) || banned.has(`${x},${y}`)) continue;
      if ((reach[y * room.w + x] ?? -1) < 0) continue;
      const cell = { x, y };
      if (state.exits.some((door) => Math.abs(cell.x - door.x) + Math.abs(cell.y - door.y) < MONSTER_DOOR_GAP)) continue;
      const gap = Math.max(Math.abs(cell.x - hero.x), Math.abs(cell.y - hero.y));
      if (gap > SPAWN_GAP) far.push(cell);
      else rest.push(cell);
    }
  }
  const pool = far.length >= pack.length ? far.slice() : [...far, ...rest];
  for (let i = pool.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    const swap = pool[i]!;
    pool[i] = pool[j]!;
    pool[j] = swap;
  }
  pack.forEach((monster, index) => {
    const cell = pool[index];
    if (!cell) return;
    monster.x = cell.x;
    monster.y = cell.y;
  });
}

function stateChestsOpen(state: RoomState): string[] {
  return state.chests.filter((chest) => chest.open).map((chest) => `${chest.x},${chest.y}`);
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
  run: Pick<Run, "seed" | "adventure" | "parcels" | "rooms" | "cleared" | "goods" | "weapon" | "ammo" | "gear" | "weaponHit" | "abilities" | "abilityCd">,
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
    weaponHit: run.weaponHit,
    abilities: run.abilities,
    abilityCd: run.abilityCd,
    monsterKind: room.monsterIds[0],
    adventure: run.adventure,
  });
  const goods = run.goods[index] ?? { broken: [], piles: [], loot: [], opened: [] };
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
  state.loot = goods.loot.map((item) => ({ ...item }));
  state.pending = run.parcels
    .filter((parcel) => parcel.room === index)
    .map((parcel) => ({
      room: parcel.room,
      monster: parcel.monster,
      chest: parcel.chest ? { x: parcel.chest.x, y: parcel.chest.y } : undefined,
      item: { kind: parcel.item.kind, catalogId: parcel.item.catalogId },
    }));
  const opened = new Set(goods.opened ?? []);
  state.chests = scatterInterior(state.room, state.exits).flatMap((prop) =>
    prop.kind === "chest" || prop.kind === "cellchest"
      ? [{ kind: prop.kind, x: prop.x, y: prop.y, open: opened.has(`${prop.x},${prop.y}`) }]
      : [],
  );
  if (!cleared && room.monsterIds.length > 0) {
    const first = state.monsters[0];
    if (first && first.hp > 0) first.packIndex = 0;
    room.monsterIds.slice(1).forEach((id, offset) => {
      const spec = monsterById(id);
      const cell = spareMonsterCell(state);
      if (!spec || !cell) return;
      const monster = monsterFighter(spec, { x: cell.x, y: cell.y, facing: room.pattern.monster.facing }, true, run.adventure);
      monster.packIndex = offset + 1;
      state.monsters.push(monster);
    });
    scatterMonsters(state, seeded((run.seed + 1) * 1000 + index * 17));
  }
  state.carried = carried;
  const prize = claimFloorLoot(state);
  if (prize) state.note = `${state.note} ${prize}.`.trim();
  if (room.role === "fight") seedGround(state);
  if (room.role === "start" && !via) state.note = "Start of the floor. Exits are the gaps in the walls.";
  else if (!cleared) state.note = "The doors slammed shut. Defeat the monsters to leave.";
  return state;
}

export function createRun(
  seed: number,
  weapon: WeaponId = "sword",
  gear: GearBonus = EMPTY_GEAR,
  weaponHit: number | null = null,
  abilities: (RunAbility | null)[] = [],
  adventure = 0,
): Run {
  const rooms = buildFloor(seed);
  const parcels = planParcels(rooms, seed, adventure);
  const cleared = rooms.map((room) => room.role === "start");
  const visited = rooms.map((_, index) => index === 0);
  const goods = rooms.map(() => ({ broken: [], piles: [], loot: [] as (Cell & CarryLoot)[], opened: [] }));
  const run = {
    seed,
    rooms,
    goods,
    weapon,
    gear,
    weaponHit,
    abilities,
    abilityCd: {},
    ammo: weaponById(weapon).magazine,
    visited,
    cleared,
    current: 0,
    hub: pickHubRoom(rooms, seeded((seed ^ 0x51ed1234) >>> 0)),
    exit: null,
    adventure,
    parcels,
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
    loot: run.state.loot.map((item) => ({ ...item })),
    opened: stateChestsOpen(run.state),
  };
  run.parcels = run.parcels
    .filter((parcel) => parcel.room !== run.current)
    .concat(run.state.pending.map((parcel) => ({ ...parcel, chest: parcel.chest ? { ...parcel.chest } : undefined, item: { ...parcel.item } })));
  if (!run.exit && run.rooms.length > 1 && run.current === run.hub && run.cleared[run.current]) {
    const portal = exitCell(run.state);
    run.exit = { room: run.current, cell: portal };
    run.state.note = `${run.state.note} The hub portal is open.`.trim();
    const prize = claimFloorLoot(run.state);
    if (prize) run.state.note = `${run.state.note} ${prize}.`.trim();
    run.goods[run.current]!.loot = run.state.loot.map((item) => ({ ...item }));
  }
  run.abilityCd = {};
  for (const ability of run.abilities) {
    if (!ability) continue;
    run.abilityCd[ability.id] = run.state.hero.cooldowns[ability.id] ?? 0;
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

interface LootHost {
  room: number;
  monster?: number;
  chest?: Cell;
}

/** Сначала по одной вещи на разных рарников и сундуков. Остаток — на монстров, при нехватке по несколько на одного. */
export function assignLoot(items: readonly CarryLoot[], primary: readonly LootHost[], monsters: readonly LootHost[]): LootParcel[] {
  const parcels: LootParcel[] = [];
  let cursor = 0;
  for (const host of primary) {
    if (cursor >= items.length) break;
    parcels.push({ ...host, item: items[cursor]! });
    cursor += 1;
  }
  let turn = 0;
  while (cursor < items.length && monsters.length > 0) {
    parcels.push({ ...monsters[turn % monsters.length]!, item: items[cursor]! });
    cursor += 1;
    turn += 1;
  }
  return parcels;
}

function shuffle<T>(items: readonly T[], rng: () => number): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    const swap = copy[i]!;
    copy[i] = copy[j]!;
    copy[j] = swap;
  }
  return copy;
}

/** Три равные ветки: экипировка, оружие, способность. Внутри ветки — любой id каталога. */
function rollOne(rng: () => number): CarryLoot {
  const roll = rng();
  const kind = roll < 1 / 3 ? "gear" : roll < 2 / 3 ? "weapon" : "ability";
  const pool =
    kind === "gear" ? GEAR.map((item) => item.id) : kind === "weapon" ? WEAPONS.map((weapon) => weapon.id) : HERO_ABILITIES.map((row) => row.id);
  return { kind, catalogId: pool[Math.floor(rng() * pool.length)]! };
}

function planParcels(rooms: readonly FloorRoom[], seed: number, level: number): LootParcel[] {
  const rng = seeded(seed ^ 0x9e3779b9);
  const items = Array.from({ length: rollDropCount(level, rng) }, () => rollOne(rng));
  const rares: LootHost[] = [];
  const chests: LootHost[] = [];
  const grunts: LootHost[] = [];
  rooms.forEach((room, roomIndex) => {
    room.monsterIds.forEach((id, monster) => {
      const host = { room: roomIndex, monster };
      if (monsterById(id)?.rare) rares.push(host);
      else grunts.push(host);
    });
    const props = scatterInterior(buildLayout(room.pattern), exitsOf(room));
    for (const prop of props) {
      if (prop.kind !== "chest" && prop.kind !== "cellchest") continue;
      chests.push({ room: roomIndex, chest: { x: prop.x, y: prop.y } });
    }
  });
  return assignLoot(items, shuffle([...rares, ...chests], rng), shuffle([...rares, ...grunts], rng));
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
  const kept = run.state.found.map((item) => ({ kind: item.kind, catalogId: item.catalogId }));
  const hp = run.state.hero.hp;
  run.ammo = run.state.ammo;
  run.current = next;
  run.visited[next] = true;
  run.state = enter(run, next, OPPOSITE[side], hp, carried);
  run.state.found = [...kept, ...run.state.found];
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
    run.state.note = "That room is not open yet.";
    return false;
  }
  if (!from.portal) {
    run.state.note = "Teleport only works from a room that has one.";
    return false;
  }
  if (run.state.outcome !== "won") {
    run.state.note = run.state.outcome === "lost" ? "Teleport is unavailable." : "Teleport is shut while an enemy lives.";
    return false;
  }
  if (!dest.portal) {
    run.state.note = "This room has no teleport.";
    return false;
  }
  const hp = run.state.hero.hp;
  const facing = run.state.hero.facing;
  const carried = run.state.carried;
  const kept = run.state.found.map((item) => ({ kind: item.kind, catalogId: item.catalogId }));
  run.ammo = run.state.ammo;
  syncRun(run);
  run.current = to;
  run.visited[to] = true;
  run.state = enter(run, to, null, hp, carried);
  run.state.found = [...kept, ...run.state.found];
  run.state.hero.x = dest.portal.x;
  run.state.hero.y = dest.portal.y;
  run.state.hero.facing = facing;
  run.state.note = "The teleport moved you to another room.";
  return true;
}
