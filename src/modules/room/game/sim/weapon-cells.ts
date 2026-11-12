/** Клетки удара надетого оружия: прицел, линия, веер, квадрат вокруг. Часть симуляции комнаты, вход — ../sim.ts. */
import { type WeaponDef, weaponById } from "../../data/weapons.ts";
import { isBlocked } from "./geometry.ts";
import { monsterAt } from "./hero-actions.ts";
import { AROUND, type AimStep, type Cell, DIRS, type RoomState } from "./types.ts";

export function swordCells(state: RoomState): Cell[] {
  return fanCells(state, 1, DIRS[state.hero.facing]);
}

/** Ближайшее из восьми направлений от героя к клетке. На герое — пусто. */
export function nearestAim(from: Cell, to: Cell): AimStep | null {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  if (dx === 0 && dy === 0) return null;
  const sector = Math.round(Math.atan2(dy, dx) / (Math.PI / 4));
  const oct = ((sector % 8) + 8) % 8;
  const steps: readonly AimStep[] = [
    { x: 1, y: 0 },
    { x: 1, y: 1 },
    { x: 0, y: 1 },
    { x: -1, y: 1 },
    { x: -1, y: 0 },
    { x: -1, y: -1 },
    { x: 0, y: -1 },
    { x: 1, y: -1 },
  ];
  return steps[oct] ?? null;
}

/** Прицел оружия: только вверх, вниз, влево или вправо. Диагональ берёт более близкую сторону. */
export function weaponAim(from: Cell, to: Cell): AimStep | null {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  if (dx === 0 && dy === 0) return null;
  if (Math.abs(dx) >= Math.abs(dy)) return { x: dx > 0 ? 1 : -1, y: 0 };
  return { x: 0, y: dy > 0 ? 1 : -1 };
}

export function cardinalStep(step: Cell): Cell {
  if (step.x !== 0 && step.y !== 0) {
    if (Math.abs(step.x) >= Math.abs(step.y)) return { x: Math.sign(step.x), y: 0 };
    return { x: 0, y: Math.sign(step.y) };
  }
  return { x: Math.sign(step.x), y: Math.sign(step.y) };
}

/** Сколько выстрелов осталось. Empty — это не огнестрел. */
export function shotsLeft(state: RoomState): number | null {
  const magazine = weaponById(state.weapon).magazine;
  if (magazine === null) return null;
  return state.ammo ?? magazine;
}

/** Клетки удара надетого оружия. Курсор, если он есть, важнее поворота. */
export function attackCells(state: RoomState): Cell[] {
  const cells = patternCells(state);
  const weapon = weaponById(state.weapon);
  if (!stopsOnFirst(weapon)) return cells;
  const cut: Cell[] = [];
  for (const cell of cells) {
    cut.push(cell);
    if (monsterAt(state, cell)) break;
  }
  return cut;
}

export function patternCells(state: RoomState): Cell[] {
  if (shotsLeft(state) === 0) return [];
  const weapon = weaponById(state.weapon);
  const step = attackStep(state);
  if (weapon.id === "shotgun") return shotgunCells(state, step);
  if (weapon.shape === "fan") return fanCells(state, weapon.range, step);
  if (weapon.shape === "around") return aroundCells(state);
  return lineCells(state, weapon.range, step);
}

/** Посох и пистолет не проходят дальше первой цели. */
export function stopsOnFirst(weapon: WeaponDef): boolean {
  return weapon.element !== undefined || weapon.id === "pistol";
}

export function attackStep(state: RoomState): Cell {
  return cardinalStep(state.look ?? DIRS[state.hero.facing]);
}

/** Пирамида: клетка прямо перед героем и три клетки на следующем шаге. */
export function shotgunCells(state: RoomState, step: Cell): Cell[] {
  const hero = state.hero;
  const left = { x: step.y, y: -step.x };
  const marks = [
    { f: 1, l: 0 },
    { f: 2, l: 1 },
    { f: 2, l: 0 },
    { f: 2, l: -1 },
  ];
  const cells: Cell[] = [];
  for (const mark of marks) {
    const x = hero.x + step.x * mark.f + left.x * mark.l;
    const y = hero.y + step.y * mark.f + left.y * mark.l;
    if (isBlocked(state.room, x, y)) continue;
    cells.push({ x, y });
  }
  return cells;
}

/** Веер шириной 3 вдоль одной стороны. Диагонального клина нет. */
export function fanCells(state: RoomState, depth: number, step: Cell): Cell[] {
  const hero = state.hero;
  const side = step.y === 0 ? { x: 0, y: 1 } : { x: 1, y: 0 };
  const cells: Cell[] = [];
  for (const offset of [-1, 0, 1]) {
    for (let i = 1; i <= depth; i += 1) {
      const x = hero.x + step.x * i + side.x * offset;
      const y = hero.y + step.y * i + side.y * offset;
      if (isBlocked(state.room, x, y)) break;
    cells.push({ x, y });
    }
  }
  return cells;
}

export function aroundCells(state: RoomState): Cell[] {
  const cells: Cell[] = [];
  for (const step of AROUND) {
    const x = state.hero.x + step.x;
    const y = state.hero.y + step.y;
    if (isBlocked(state.room, x, y)) continue;
    cells.push({ x, y });
  }
  return cells;
}

export function lineCells(state: RoomState, reach: number, step: Cell): Cell[] {
  const cells: Cell[] = [];
  for (let i = 1; i <= reach; i += 1) {
    const x = state.hero.x + step.x * i;
    const y = state.hero.y + step.y * i;
    if (isBlocked(state.room, x, y)) break;
    cells.push({ x, y });
  }
  return cells;
}
