/** Действия героя: шаг, удар, перезарядка, ожидание, Blink. Часть симуляции комнаты, вход — ../sim.ts. */
import { critFactor } from "../../data/items.ts";
import { weaponById } from "../../data/weapons.ts";
import { damageFactor, hurt, pour } from "./combat.ts";
import { hasCell, isBlocked, isFloor, isPit } from "./geometry.ts";
import { kegAt, touchKegs } from "./monster-casters.ts";
import { type Cell, DIRS, type Dir, type Fighter, type RoomState, SIDE_FACING } from "./types.ts";
import { blinkCells, dealtHit, occupied, onBoard, passiveAmount } from "./units.ts";
import { attackCells, attackStep, lineCells, shotsLeft } from "./weapon-cells.ts";
import { afterAction, beginHeroTurn, breakBarrels, breakChairs, breakObject, canControl, fallIntoPit, openChest, openChests, takeGold } from "./world.ts";

export function face(state: RoomState, dir: Dir): void {
  if (!canControl(state)) return;
  state.hero.facing = dir;
  state.note = "Turn.";
}

export function step(state: RoomState, dir: Dir, rng: () => number = Math.random): boolean {
  if (!canControl(state)) return false;
  beginHeroTurn(state);
  const delta = DIRS[dir];
  const x = state.hero.x + delta.x;
  const y = state.hero.y + delta.y;
  if (!isFloor(state.room, x, y)) {
    const exit = state.exits.find(
      (door) => door.x === state.hero.x && door.y === state.hero.y && SIDE_FACING[door.side] === dir,
    );
    if (!exit) return false;
    state.hero.facing = dir;
    if (state.outcome !== "won") {
      state.note = "The doors stay shut while any monster lives.";
      return false;
    }
    state.leaving = exit.side;
    return true;
  }
  if (state.hero.root > 0) {
    state.hero.facing = dir;
    state.note = "Spires pin your legs. You cannot step.";
    return false;
  }
  if (isPit(state.room, x, y)) {
    return fallIntoPit(state, { x, y }, { x: state.hero.x, y: state.hero.y }, dir, rng);
  }
  if (isBlocked(state.room, x, y) || occupied(state, x, y) || kegAt(state, x, y)) return false;
  state.hero.facing = dir;
  state.hero.x = x;
  state.hero.y = y;
  const broke = breakObject(state, { x, y }, rng);
  const opened = openChest(state, { x, y }, rng);
  const got = takeGold(state);
  state.note = broke ? "Object broken." : "Step.";
  if (opened) state.note = `${state.note} The chest opens.`;
  if (got > 0) state.note = `${state.note} Gold.`;
  afterAction(state, false, rng);
  return true;
}

export function struck(state: RoomState): Fighter[] {
  const cells = attackCells(state);
  return state.monsters.filter((monster) => onBoard(monster) && hasCell(cells, monster));
}

export function swordWillKill(state: RoomState): boolean {
  if (state.outcome === "lost") return false;
  const weapon = weaponById(state.weapon);
  const targets = struck(state);
  const times = weapon.twice ? 2 : 1;
  const type = weapon.element ?? "physical";
  return targets.some((monster) => monster.hp - times * dealtHit(state, passiveAmount(state, monster, targets)) * damageFactor(monster, type) <= 0);
}

export function attack(state: RoomState, rng: () => number = Math.random): boolean {
  if (!canControl(state)) return false;
  const weapon = weaponById(state.weapon);
  if (weapon.magazine !== null && shotsLeft(state) === 0) return reload(state, rng);
  beginHeroTurn(state);
  const swingCells = attackCells(state);
  const smashed = breakBarrels(state, swingCells, rng) + breakChairs(state, swingCells, rng);
  const opened = openChests(state, swingCells, rng);
  const smashedNote = `${smashed > 0 ? " Object broken." : ""}${opened > 0 ? " The chest opens." : ""}`;
  const targets = struck(state);
  const times = targets.length === 0 ? 0 : weapon.twice ? 2 : 1;
  if (weapon.magazine !== null) state.ammo = (shotsLeft(state) ?? weapon.magazine) - 1;
  const kegsBefore = state.kegs.length;
  if (times === 0) {
    if (weapon.element) pour(state, lineCells(state, 2, attackStep(state)), weapon.element, weapon.element === "poison" ? 1 : 0, rng);
    touchKegs(state, swingCells, rng);
    const burst = state.kegs.length < kegsBefore ? " The barrel bursts." : "";
    state.note = `${weapon.name} hit nothing. The turn is still spent.${burst}${smashedNote}`;
    afterAction(state, false, rng);
    return true;
  }
  const shields = targets.map((target) => target.shield);
  const weaponCrit = critFactor(state.critChance, state.critShare) > 1;
  const type = weapon.element ?? "physical";
  for (const target of targets) {
    const amount = dealtHit(state, passiveAmount(state, target, targets));
    for (let hit = 0; hit < times; hit += 1)     hurt(state, target, amount, type, state.hero, rng, false, type === "poison", weaponCrit);
  }
  if (weapon.element) pour(state, lineCells(state, 2, attackStep(state)), weapon.element, weapon.element === "poison" ? 1 : 0, rng);
  touchKegs(state, swingCells, rng);
  const broke = targets.some((target, index) => (shields[index] ?? 0) > 0 && target.shield === 0);
  state.note = `${broke ? "Shield broken. The monster is stunned, and Blink is back." : "Hit."}${smashedNote}`;
  afterAction(state, broke, rng);
  return true;
}

/** Reload на R. Полный магазин или оружие без магазина ход не тратит. */
export function reload(state: RoomState, rng: () => number = Math.random): boolean {
  if (!canControl(state)) return false;
  beginHeroTurn(state);
  const weapon = weaponById(state.weapon);
  if (weapon.magazine === null) {
    state.note = "This weapon does not reload.";
    return false;
  }
  const left = shotsLeft(state) ?? 0;
  if (left >= weapon.magazine) {
    state.note = "Magazine full.";
    return false;
  }
  state.ammo = weapon.magazine;
  state.note = "Reload.";
  afterAction(state, false, rng);
  return true;
}

export function wait(state: RoomState, rng: () => number = Math.random): void {
  if (!canControl(state)) return;
  beginHeroTurn(state);
  state.note = "Wait.";
  afterAction(state, false, rng);
}

export function blink(state: RoomState, x: number, y: number, rng: () => number = Math.random): boolean {
  if (!canControl(state) || state.blink <= 0 || state.hero.root > 0) return false;
  const allowed = blinkCells(state).some((cell) => cell.x === x && cell.y === y);
  if (!allowed) return false;
  state.hero.x = x;
  state.hero.y = y;
  state.blink -= 1;
  const broke = breakObject(state, { x, y }, rng);
  const got = takeGold(state);
  const bits = ["Blink."];
  if (broke) bits.push("Object broken.");
  if (got > 0) bits.push("Gold.");
  bits.push("The world did not move.");
  state.note = bits.join(" ");
  return true;
}

export function swordHit(state: RoomState): number {
  return state.weaponHit === null ? weaponById(state.weapon).hitDamage : state.weaponHit;
}

export function facingRay(state: RoomState): Cell[] {
  const step = DIRS[state.hero.facing];
  const cells: Cell[] = [];
  let x = state.hero.x + step.x;
  let y = state.hero.y + step.y;
  while (isFloor(state.room, x, y) && !isBlocked(state.room, x, y) && !isPit(state.room, x, y)) {
    cells.push({ x, y });
    x += step.x;
    y += step.y;
  }
  return cells;
}

export function sameSpot(a: Cell, b: Cell): boolean {
  return a.x === b.x && a.y === b.y;
}

export function monsterAt(state: RoomState, cell: Cell): Fighter | undefined {
  return state.monsters.find((monster) => onBoard(monster) && monster.x === cell.x && monster.y === cell.y);
}
