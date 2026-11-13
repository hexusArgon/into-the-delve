/** Общие движения монстров: шаг, рывок, отбрасывание, укус, замах. Часть симуляции комнаты, вход — ../sim.ts. */
import { hurt, nearestVacant } from "./combat.ts";
import { distancesTo, inRoom, isBlocked, isPit, manhattan, sameCell, spot } from "./geometry.ts";
import { kegAt } from "./monster-casters.ts";
import { type Cell, type Fighter, ORTHO, type RoomState, type Windup, type WindupKind } from "./types.ts";
import { faceToward, onBoard, pick, specOf, taken, vacant } from "./units.ts";
import { breakObject, takeGold } from "./world.ts";

/**
 * Телепорт или появление на клетке. Если там игрок, уходит тот, кто не обездвижен,
 * а если могут оба — игрок. Иначе входящий встаёт на ближайшую свободную клетку.
 */
export function arrive(state: RoomState, unit: Fighter, cell: Cell, rng: () => number): void {
  const hero = state.hero;
  let place = spot(cell);
  const heroThere = unit !== hero && hero.hp > 0 && sameCell(hero, cell);
  const otherThere = state.monsters.some((monster) => monster !== unit && onBoard(monster) && sameCell(monster, cell));
  if (heroThere && hero.root === 0) {
    const away = nearestVacant(state, cell);
    if (away) {
      hero.x = away.x;
      hero.y = away.y;
      takeGold(state);
    } else {
      place = nearestVacant(state, cell) ?? place;
    }
  } else if (heroThere || otherThere) {
    place = nearestVacant(state, cell) ?? place;
  }
  faceToward(unit, place);
  unit.x = place.x;
  unit.y = place.y;
  breakObject(state, place, rng);
}

/** Отбрасывание от эпицентра по направлению клетки, по диагонали тоже. Обездвиженного не сдвинуть. */
export function knock(state: RoomState, unit: Fighter, from: Cell, distance: number, rng: () => number, fallback: Cell | null = null): void {
  if (unit.hp <= 0 || unit.root > 0) return;
  let dx = Math.sign(unit.x - from.x);
  let dy = Math.sign(unit.y - from.y);
  if (dx === 0 && dy === 0) {
    if (!fallback) return;
    dx = fallback.x;
    dy = fallback.y;
  }
  for (let i = 0; i < distance; i += 1) {
    const x = unit.x + dx;
    const y = unit.y + dy;
    if (!vacant(state, x, y)) break;
    unit.x = x;
    unit.y = y;
    breakObject(state, { x, y }, rng);
  }
  if (unit === state.hero) takeGold(state);
}

export function stepToward(state: RoomState, monster: Fighter, rng: () => number): string {
  if (monster.root > 0) return "";
  const room = state.room;
  const kegBlocked = (x: number, y: number): boolean => kegAt(state, x, y) !== undefined;
  const dist = distancesTo(room, state.hero, kegBlocked);
  const here = dist[monster.y * room.w + monster.x] ?? -1;
  if (here <= 0) return "";
  const options = ORTHO.map((step) => ({ x: monster.x + step.x, y: monster.y + step.y })).filter(
    (cell) => !isBlocked(room, cell.x, cell.y) && !taken(state, cell.x, cell.y) && !kegAt(state, cell.x, cell.y) && dist[cell.y * room.w + cell.x] === here - 1,
  );
  const next = pick(options, rng);
  if (!next) return "";
  faceToward(monster, next);
  monster.x = next.x;
  monster.y = next.y;
  return breakObject(state, next, rng) ? "Object broken." : "";
}

/** Укус вплотную по ортогонали, иначе шаг к герою. Без автоатаки монстр не подходит. */
export function biteOrStep(state: RoomState, monster: Fighter, rng: () => number): string {
  const bite = specOf(monster)?.bite ?? 0;
  if (bite <= 0) return "";
  if (manhattan(monster, state.hero) === 1) {
    faceToward(monster, state.hero);
    hurt(state, state.hero, bite, "physical", monster, rng);
    state.strike = { from: spot(monster), to: spot(state.hero) };
    return "The monster bites in melee.";
  }
  return stepToward(state, monster, rng);
}

/** Прямая до клетки игрока включительно. Стена или яма — рывка нет. */
export function rushLine(state: RoomState, monster: Fighter): Cell[] {
  const hero = state.hero;
  if (hero.hp <= 0 || (hero.x !== monster.x && hero.y !== monster.y)) return [];
  const stepX = Math.sign(hero.x - monster.x);
  const stepY = Math.sign(hero.y - monster.y);
  const cells: Cell[] = [];
  let x = monster.x;
  let y = monster.y;
  while (x !== hero.x || y !== hero.y) {
    x += stepX;
    y += stepY;
    if (isBlocked(state.room, x, y) || isPit(state.room, x, y) || kegAt(state, x, y)) return [];
    cells.push({ x, y });
  }
  return cells;
}

/** Тело проходит всю помеченную линию. Чужая клетка останавливает. Клетка игрока — место прибытия. */
export function houndStop(state: RoomState, monster: Fighter, line: readonly Cell[]): Cell | null {
  let land: Cell | null = null;
  for (const cell of line) {
    if (kegAt(state, cell.x, cell.y)) break;
    const other = state.monsters.some((unit) => unit !== monster && onBoard(unit) && sameCell(unit, cell));
    if (other) break;
    land = cell;
    if (state.hero.hp > 0 && sameCell(state.hero, cell)) break;
  }
  return land;
}

export function planDash(state: RoomState, monster: Fighter, max: number, rng: () => number): Cell[] {
  const hero = state.hero;
  const room = state.room;
  const dist = distancesTo(room, hero, (x, y) => kegAt(state, x, y) !== undefined);
  let at = spot(monster);
  const path: Cell[] = [];
  for (let step = 0; step < max && manhattan(hero, at) > 1; step += 1) {
    const here = dist[at.y * room.w + at.x] ?? -1;
    if (here <= 1) break;
    const options = ORTHO.map((move) => ({ x: at.x + move.x, y: at.y + move.y })).filter(
      (cell) => !isBlocked(room, cell.x, cell.y) && !taken(state, cell.x, cell.y) && !kegAt(state, cell.x, cell.y) && dist[cell.y * room.w + cell.x] === here - 1,
    );
    const next = pick(options, rng);
    if (!next) break;
    path.push(next);
    at = next;
  }
  return path;
}

/** Луч через клетку цели. Стена обрывает, яму он пролетает. */
export function beamCells(state: RoomState, from: Cell, through: Cell, range: number): Cell[] {
  const dx = through.x - from.x;
  const dy = through.y - from.y;
  const span = Math.max(Math.abs(dx), Math.abs(dy));
  if (span === 0) return [];
  const round = (value: number): number => Math.sign(value) * Math.round(Math.abs(value));
  const cells: Cell[] = [];
  for (let i = 1; i <= range; i += 1) {
    const x = from.x + round((dx * i) / span);
    const y = from.y + round((dy * i) / span);
    if (!inRoom(state.room, x, y)) break;
    if (isPit(state.room, x, y)) continue;
    if (isBlocked(state.room, x, y)) break;
    cells.push({ x, y });
  }
  return cells;
}

/* ---------- способности ---------- */

export function windup(kind: WindupKind, turns: number, cells: Cell[], center: Cell, target: Fighter | null = null): Windup {
  return { kind, turns, cells, center: spot(center), target };
}
