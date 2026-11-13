/** Способности героя: прицел, касты и их тики. Часть симуляции комнаты, вход — ../sim.ts. */
import { type RunAbility, heroAbilityById } from "../../data/hero-abilities.ts";
import { BLINK_RANGE } from "../rules.ts";
import { damageFactor, dose, groundAt, heroOutgoing, holdsGround, hurt, kill, markHit, resistFactor, square, writeGround } from "./combat.ts";
import { chebyshev, inDiamond, isBlocked, isFloor, manhattan, spot } from "./geometry.ts";
import { monsterAt, sameSpot } from "./hero-actions.ts";
import { touchKegs } from "./monster-casters.ts";
import type { AimStep, Cell, Fighter, RoomState } from "./types.ts";
import { immuneTo, onBoard, unitsIn } from "./units.ts";
import { nearestAim } from "./weapon-cells.ts";
import { afterAction, beginHeroTurn, canControl } from "./world.ts";

export const BOLT_CAP = 5;
export const WARD_TURNS = 5;
export const WARD_HP = 100;
export const QUAKE_TURNS = 4;
export const ARROW_STACKS = 1;
export const BLIZZARD_REACH = 2;
export const NEAR = 1;

/** Ромб Blink, включая занятые клетки. Заряд Blink не нужен. */
export function diamondCells(state: RoomState): Cell[] {
  const cells: Cell[] = [];
  for (let y = 0; y < state.room.h; y += 1) {
    for (let x = 0; x < state.room.w; x += 1) {
      if (!holdsGround(state, x, y)) continue;
      if (!inDiamond(state.hero, { x, y }, BLINK_RANGE)) continue;
      cells.push({ x, y });
    }
  }
  return cells;
}

/** Луч стрелы в одну сторону: до первого монстра или стены, включая клетку попадания. */
export function arrowBeam(state: RoomState, step: AimStep): Cell[] {
  const cells: Cell[] = [];
  let x = state.hero.x + step.x;
  let y = state.hero.y + step.y;
  while (isFloor(state.room, x, y) && !isBlocked(state.room, x, y)) {
    const spotCell = { x, y };
    cells.push(spotCell);
    if (monsterAt(state, spotCell)) break;
    x += step.x;
    y += step.y;
  }
  return cells;
}

export function abilityAim(state: RoomState, id: string): Cell[] {
  const row = heroAbilityById(id);
  if (!row?.playable) return [];
  if (row.cast === "bolt") {
    return state.monsters
      .filter((monster) => onBoard(monster) && manhattan(monster, state.hero) <= BLINK_RANGE)
      .map((monster) => spot(monster));
  }
  if (row.cast === "quake" || row.cast === "shard") return diamondCells(state);
  if (row.cast === "arrow") return state.look ? arrowBeam(state, state.look) : [];
  return [];
}

export function castReady(state: RoomState, ability: RunAbility, cell: Cell | null): boolean {
  if (ability.cast === "ward") return true;
  if (!cell) return false;
  if (ability.cast === "bolt") {
    const monster = monsterAt(state, cell);
    return Boolean(monster) && manhattan(monster!, state.hero) <= BLINK_RANGE;
  }
  if (ability.cast === "arrow") return nearestAim(state.hero, cell) !== null;
  if (ability.cast === "quake" || ability.cast === "shard") return diamondCells(state).some((spotCell) => sameSpot(spotCell, cell));
  return false;
}

/** 100 ядом в HP, затем ровно 1 стак. hurt(poison) по-прежнему только стак, без этого удара. */
export function poisonHp(state: RoomState, target: Fighter, amount: number, rng: () => number): void {
  if (target.hp <= 0 || !onBoard(target)) return;
  if (immuneTo(target, "poison")) return;
  const dealt = resistFactor(target, "poison") * heroOutgoing(state, amount, "poison", true) * damageFactor(target, "poison");
  target.hp -= dealt;
  markHit(state, target, dealt, "poison");
  touchKegs(state, [target], rng);
  if (target.hp <= 0) {
    kill(state, target, rng);
    return;
  }
  dose(state, target, ARROW_STACKS, state.hero, rng, true);
}

export function castBolt(state: RoomState, ability: RunAbility, cell: Cell, rng: () => number): void {
  const main = monsterAt(state, cell);
  if (!main) return;
  const near = state.monsters.filter((monster) => onBoard(monster) && monster !== main && chebyshev(monster, main) <= NEAR);
  const hit: Fighter[] = [main];
  if (near.length === 0) hurt(state, main, ability.damage, "fire", state.hero, rng, true);
  else {
    hurt(state, main, ability.splash, "fire", state.hero, rng, true);
    near.sort((a, b) => a.y - b.y || a.x - b.x);
    for (const unit of near.slice(0, BOLT_CAP - 1)) {
      hurt(state, unit, ability.splash, "fire", state.hero, rng, true);
      hit.push(unit);
    }
  }
  state.fx.push({ kind: "area", cells: hit.map((unit) => spot(unit)), tone: "fire", act: "bolt" });
  state.note = "Discharge.";
}

export function castWard(state: RoomState, ability: RunAbility): void {
  state.ward = { hp: WARD_HP, left: WARD_TURNS, damage: ability.damage };
  state.fx.push({ kind: "area", cells: square(state, state.hero, NEAR), tone: "fire", act: "ward" });
  state.note = "Fire Shield.";
}

export function castArrow(state: RoomState, ability: RunAbility, cell: Cell, rng: () => number): void {
  const aim = nearestAim(state.hero, cell);
  if (!aim) return;
  const line = arrowBeam(state, aim);
  const hit = line.find((spotCell) => monsterAt(state, spotCell));
  const unit = hit ? monsterAt(state, hit) : undefined;
  if (unit) poisonHp(state, unit, ability.damage, rng);
  const end = line[line.length - 1];
  if (end) state.fx.push({ kind: "line", from: spot(state.hero), to: end, tone: "poison", act: "arrow" });
  state.note = "Poison Arrow.";
}

export function castQuake(state: RoomState, ability: RunAbility, cell: Cell): void {
  state.quakes.push({ x: cell.x, y: cell.y, left: QUAKE_TURNS, damage: ability.damage });
  state.fx.push({ kind: "area", cells: square(state, cell, NEAR), tone: "earth", act: "quake" });
  state.note = "Earthquake.";
}

export function castShard(state: RoomState, ability: RunAbility, cell: Cell, rng: () => number): void {
  const zone = square(state, cell, NEAR);
  let removed = 0;
  for (const spotCell of zone) {
    if (groundAt(state, spotCell.x, spotCell.y)?.kind !== "ice") continue;
    state.ground[spotCell.y * state.room.w + spotCell.x] = null;
    removed += 1;
  }
  const unit = monsterAt(state, cell);
  if (unit && removed > 0) hurt(state, unit, ability.damage * removed, "ice", state.hero, rng, true);
  if (zone.length > 0) state.fx.push({ kind: "area", cells: zone, tone: "ice", act: "shard" });
  state.note = "Ice Shard.";
}

export function tickWard(state: RoomState, rng: () => number): void {
  const ward = state.ward;
  if (!ward) return;
  const cells = square(state, state.hero, NEAR);
  for (const unit of unitsIn(state, cells, state.hero)) hurt(state, unit, ward.damage, "fire", state.hero, rng, true);
  touchKegs(state, cells, rng);
  ward.left -= 1;
  if (ward.left <= 0) state.ward = null;
  if (cells.length > 0) state.fx.push({ kind: "area", cells, tone: "fire", act: "ward" });
}

export function tickBlizzard(state: RoomState, rng: () => number): void {
  const storm = state.blizzard;
  if (!storm) return;
  if (state.mp < storm.mp) {
    state.blizzard = null;
    return;
  }
  state.mp -= storm.mp;
  const cells = square(state, state.hero, BLIZZARD_REACH);
  for (const unit of unitsIn(state, cells, state.hero)) hurt(state, unit, storm.damage, "water", state.hero, rng, true);
  touchKegs(state, cells, rng);
  for (const cell of cells) writeGround(state, cell, "water", 0, rng);
  if (cells.length > 0) state.fx.push({ kind: "area", cells, tone: "water", act: "blizzard" });
}

export function tickQuakes(state: RoomState, rng: () => number): void {
  const next: RoomState["quakes"] = [];
  for (const zone of state.quakes) {
    const center = { x: zone.x, y: zone.y };
    const cells = square(state, center, NEAR);
    for (const unit of unitsIn(state, cells, state.hero)) hurt(state, unit, zone.damage, "earth", state.hero, rng, true);
    touchKegs(state, cells, rng);
    for (const cell of cells) writeGround(state, cell, "oil", 0, rng);
    zone.left -= 1;
    if (zone.left > 0) next.push(zone);
    if (cells.length > 0) state.fx.push({ kind: "area", cells, tone: "earth", act: "quake" });
  }
  state.quakes = next;
}

/** Тики щита, бурана и землетрясения в конце раунда, в том числе пока герой в стане. */
export function heroZones(state: RoomState, rng: () => number): void {
  if (state.hero.hp <= 0) return;
  tickWard(state, rng);
  tickBlizzard(state, rng);
  tickQuakes(state, rng);
}

/** Клетки, где щит, буран и землетрясение ещё держатся. Радиусы те же, что у удара. */
export function activeHeroZones(state: RoomState): { ward: Cell[]; storm: Cell[]; quakes: Cell[][] } {
  return {
    ward: state.ward ? square(state, state.hero, NEAR) : [],
    storm: state.blizzard ? square(state, state.hero, BLIZZARD_REACH) : [],
    quakes: state.quakes.map((zone) => square(state, zone, NEAR)),
  };
}

export function castHeroAbility(state: RoomState, slot: number, cell: Cell | null, rng: () => number = Math.random): boolean {
  if (!canControl(state)) return false;
  const ability = state.abilities[slot];
  if (!ability) {
    state.note = "Slot empty.";
    return false;
  }
  if (state.hero.stun > 0) return false;
  if (ability.cast === "blizzard") {
    const on = state.blizzard === null;
    state.blizzard = on ? { damage: ability.damage, mp: ability.mp } : null;
    if (on) state.fx.push({ kind: "area", cells: square(state, state.hero, BLIZZARD_REACH), tone: "water", act: "blizzard" });
    state.aim = null;
    state.note = state.blizzard ? "Blizzard on." : "Blizzard off.";
    return false;
  }
  const left = state.hero.cooldowns[ability.id] ?? 0;
  if (left > 1) {
    state.note = `${ability.name}: ${left - 1} left.`;
    return false;
  }
  if (!ability.playable) {
    state.aim = null;
    state.note = "The sheet does not name an element.";
    return false;
  }
  if (!castReady(state, ability, cell)) {
    state.note = ability.cast === "bolt" ? "No monster inside the Blink diamond." : ability.cast === "arrow" ? "Pick a direction." : "That cell is not valid.";
    return false;
  }
  if (state.mp < ability.mp) {
    state.note = "Not enough mana.";
    return false;
  }
  beginHeroTurn(state);
  state.mp -= ability.mp;
  if (ability.cast === "bolt" && cell) castBolt(state, ability, cell, rng);
  else if (ability.cast === "ward") castWard(state, ability);
  else if (ability.cast === "arrow" && cell) castArrow(state, ability, cell, rng);
  else if (ability.cast === "quake" && cell) castQuake(state, ability, cell);
  else if (ability.cast === "shard" && cell) castShard(state, ability, cell, rng);
  state.hero.cooldowns[ability.id] = ability.cooldown;
  state.aim = null;
  afterAction(state, false, rng);
  return true;
}
