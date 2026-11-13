/** Тики мира, предметы комнаты, добыча и конец действия героя. Часть симуляции комнаты, вход — ../sim.ts. */
import { heroAbilityById } from "../../data/hero-abilities.ts";
import { itemById } from "../../data/items.ts";
import { CHEST_GOLD, type DamageType, ELEMENTS } from "../../data/monsters.ts";
import { weaponName } from "../../data/weapons.ts";
import { PIT_HP_SHARE } from "../rules.ts";
import { damageFactor, groundAt, kill, markHit, resistFactor, wardAbsorb } from "./combat.ts";
import { isBlocked, isFloor, isPit } from "./geometry.ts";
import { heroZones } from "./hero-abilities.ts";
import { kegAt, touchKegs } from "./monster-casters.ts";
import { monsterPhase, tickRoot } from "./turns.ts";
import { type CarryLoot, type Cell, DIRS, type Dir, type Fighter, type LootParcel, type RoomState } from "./types.ts";
import { boardUnits, cleared, finish, immuneTo, occupied, onBoard, pick, tickMeter } from "./units.ts";

/** Тик в конце раунда без брони источника, щита и вампиризма. */
export function tickHit(state: RoomState, unit: Fighter, amount: number, type: DamageType, rng: () => number): void {
  if (amount <= 0 || immuneTo(unit, type)) return;
  const raw = resistFactor(unit, type) * amount * damageFactor(unit, type);
  const dealt = unit === state.hero ? wardAbsorb(state, raw, type) : raw;
  if (dealt <= 0) return;
  unit.hp -= dealt;
  markHit(state, unit, dealt, type);
  touchKegs(state, [unit], rng);
  if (unit.hp <= 0) kill(state, unit, rng);
}

/** Тики яда, огня, масла и воды. Стояние на клетке в начале тика обновляет дебаф. */
export function tickWorld(state: RoomState, rng: () => number): void {
  const units = boardUnits(state);
  for (const unit of units) {
    if (unit.hp <= 0) continue;
    const cell = groundAt(state, unit.x, unit.y);
    if (cell?.kind === "poison" && !immuneTo(unit, "poison")) {
      unit.poison += cell.stacks;
      unit.poisonWindow = ELEMENTS.poisonWindow;
    }
    if (unit.poisonWindow <= 0) continue;
    if (unit.poison > 0) {
      tickHit(state, unit, unit.poison, "poison", rng);
      unit.poisonPace += 1;
      if (unit.poisonPace >= ELEMENTS.poisonStep) {
        unit.poison -= 1;
        unit.poisonPace = 0;
      }
    }
    unit.poisonWindow -= 1;
    if (unit.poisonWindow === 0) unit.poison = 0;
    if (unit.poison <= 0) unit.poisonPace = 0;
  }
  for (const unit of units) {
    if (unit.hp <= 0) continue;
    if (groundAt(state, unit.x, unit.y)?.kind === "fire" && !immuneTo(unit, "fire")) unit.burn = ELEMENTS.fireTurns;
    if (unit.burn <= 0) continue;
    tickHit(state, unit, ELEMENTS.fireTick, "fire", rng);
    unit.burn -= 1;
  }
  for (const unit of units) {
    if (unit.hp <= 0) continue;
    if (groundAt(state, unit.x, unit.y)?.kind === "oil" && !immuneTo(unit, "earth")) unit.oil = ELEMENTS.oilTurns;
    if (unit.oil > 0) unit.oil -= 1;
  }
  for (const unit of units) {
    if (unit.hp <= 0) continue;
    if (groundAt(state, unit.x, unit.y)?.kind === "water") unit.wet = ELEMENTS.wetTurns;
    if (unit.wet > 0) unit.wet -= 1;
  }
  for (let i = 0; i < state.ground.length; i += 1) {
    const cell = state.ground[i];
    if (!cell) continue;
    cell.turns -= 1;
    if (cell.turns <= 0) state.ground[i] = null;
  }
}

/** Раунд после хода героя: живые монстры в порядке появления, затем тики. */
export function round(state: RoomState, rng: () => number): string {
  const world = monsterPhase(state, rng);
  if (state.hero.hp > 0) {
    if (!cleared(state)) tickWorld(state, rng);
    heroZones(state, rng);
  }
  return world;
}

/* ---------- ход героя ---------- */

export function cellKey(cell: Cell): string {
  return `${cell.x},${cell.y}`;
}

/** Свободная для героя клетка: монстр и тело её держат, сам герой — нет. */
export function openForHero(state: RoomState, x: number, y: number): boolean {
  return isFloor(state.room, x, y) && !isBlocked(state.room, x, y) && !occupied(state, x, y) && !kegAt(state, x, y);
}

/** Ближайшая свободная клетка к обрыву. При равной дистанции — клетка, с которой герой шагнул. */
export function landingAfterFall(state: RoomState, pit: Cell, from: Cell): Cell {
  let best: Cell | null = null;
  let bestKey = Number.POSITIVE_INFINITY;
  for (let y = 0; y < state.room.h; y += 1) {
    for (let x = 0; x < state.room.w; x += 1) {
      if (!openForHero(state, x, y)) continue;
      const cheb = Math.max(Math.abs(x - pit.x), Math.abs(y - pit.y));
      const man = Math.abs(x - pit.x) + Math.abs(y - pit.y);
      const origin = x === from.x && y === from.y ? 0 : 1;
      const key = cheb * 10000 + man * 100 + origin;
      if (key < bestKey) {
        bestKey = key;
        best = { x, y };
      }
    }
  }
  return best ?? from;
}

export function fallIntoPit(state: RoomState, pit: Cell, from: Cell, dir: Dir, rng: () => number): boolean {
  state.hero.facing = dir;
  const dropped = state.hero.maxHp * PIT_HP_SHARE;
  state.hero.hp -= dropped;
  markHit(state, pit, dropped, "physical");
  state.pitDrop = pit;
  const dead = state.hero.hp <= 0;
  const place = dead ? pit : landingAfterFall(state, pit, from);
  state.hero.x = place.x;
  state.hero.y = place.y;
  const got = dead ? 0 : takeGold(state);
  state.note = got > 0 ? "The drop. Gold." : "The drop.";
  if (finish(state) === "lost") return true;
  afterAction(state, false, rng);
  return true;
}

export function breakBarrel(state: RoomState, cell: Cell, rng: () => number): boolean {
  const index = state.barrels.findIndex((barrel) => barrel.x === cell.x && barrel.y === cell.y);
  if (index < 0) return false;
  const [barrel] = state.barrels.splice(index, 1);
  state.broken.push(cellKey(barrel!));
  spillGold(state, barrel!, rng);
  return true;
}

export function spillGold(state: RoomState, from: Cell, rng: () => number, count = 1): void {
  for (let i = 0; i < count; i += 1) {
    const place = goldCell(state, from, rng);
    if (!place) return;
    state.piles.push(place);
    state.drops.push({ from: { x: from.x, y: from.y }, to: place });
  }
}

export function breakBarrels(state: RoomState, cells: readonly Cell[], rng: () => number): number {
  let count = 0;
  for (const cell of cells) if (breakBarrel(state, cell, rng)) count += 1;
  return count;
}

export function breakChair(state: RoomState, cell: Cell, rng: () => number): boolean {
  const index = state.chairs.findIndex((chair) => chair.x === cell.x && chair.y === cell.y);
  if (index < 0) return false;
  const [chair] = state.chairs.splice(index, 1);
  state.broken.push(cellKey(chair!));
  spillGold(state, chair!, rng);
  return true;
}

export function breakObject(state: RoomState, cell: Cell, rng: () => number): boolean {
  return breakBarrel(state, cell, rng) || breakChair(state, cell, rng);
}

export function openChest(state: RoomState, cell: Cell, rng: () => number): boolean {
  const chest = state.chests.find((item) => !item.open && item.x === cell.x && item.y === cell.y);
  if (!chest) return false;
  chest.open = true;
  spillGold(state, cell, rng, CHEST_GOLD);
  releaseParcels(state, cell, (parcel) => parcel.chest?.x === cell.x && parcel.chest?.y === cell.y);
  return true;
}

/** Рядом: клетка объекта или любая из восьми соседних. Ближе — важнее, при равенстве — клетка перед героем, затем портал, сундук, вещь. */
export function interactTarget(state: RoomState, exit: Cell | null): { kind: "chest" | "portal" | "loot"; cell: Cell } | null {
  if (state.hero.hp <= 0 || state.outcome === "lost") return null;
  const hero = state.hero;
  const face = DIRS[hero.facing];
  const options: { kind: "chest" | "portal" | "loot"; cell: Cell; cheb: number; man: number; front: number }[] = [];
  const push = (kind: "chest" | "portal" | "loot", cell: Cell): void => {
    const dx = Math.abs(cell.x - hero.x);
    const dy = Math.abs(cell.y - hero.y);
    const cheb = Math.max(dx, dy);
    if (cheb > 1) return;
    options.push({
      kind,
      cell,
      cheb,
      man: dx + dy,
      front: cell.x === hero.x + face.x && cell.y === hero.y + face.y ? 0 : 1,
    });
  };
  if (exit) push("portal", exit);
  for (const chest of state.chests) if (!chest.open) push("chest", chest);
  for (const loot of state.loot) push("loot", loot);
  const rank = { portal: 0, chest: 1, loot: 2 };
  options.sort((a, b) => a.cheb - b.cheb || a.man - b.man || a.front - b.front || rank[a.kind] - rank[b.kind]);
  const pick = options[0];
  return pick ? { kind: pick.kind, cell: pick.cell } : null;
}

/** Space у сундука. Ход тратится, мир ходит. */
export function useChest(state: RoomState, x: number, y: number, rng: () => number = Math.random): boolean {
  if (!canControl(state)) return false;
  if (!state.chests.some((item) => !item.open && item.x === x && item.y === y)) return false;
  beginHeroTurn(state);
  if (!openChest(state, { x, y }, rng)) return false;
  state.note = "The chest opens.";
  if (state.spoilNames.length > 0) state.note = `${state.note} ${state.spoilNames.splice(0).join(", ")} dropped.`.trim();
  afterAction(state, false, rng);
  return true;
}

/** Space у вещи в квадрате 3×3. Ход тратится. Шаг и Blink вещь не забирают. */
export function usePickup(state: RoomState, x: number, y: number, rng: () => number = Math.random): boolean {
  if (!canControl(state)) return false;
  const dx = Math.abs(x - state.hero.x);
  const dy = Math.abs(y - state.hero.y);
  if (Math.max(dx, dy) > 1) return false;
  const index = state.loot.findIndex((loot) => loot.x === x && loot.y === y);
  if (index < 0) return false;
  beginHeroTurn(state);
  const [loot] = state.loot.splice(index, 1);
  if (!loot) return false;
  state.found.push({ kind: loot.kind, catalogId: loot.catalogId });
  state.note = lootName(loot);
  afterAction(state, false, rng);
  return true;
}

/** Space у портала. Ход тратится. В хаб можно уйти, только если герой после этого жив. */
export function usePortal(state: RoomState, rng: () => number = Math.random): boolean {
  if (!canControl(state)) return false;
  beginHeroTurn(state);
  state.note = "The portal opens.";
  afterAction(state, false, rng);
  return state.hero.hp > 0 && state.outcome !== "lost";
}

export function openChests(state: RoomState, cells: readonly Cell[], rng: () => number): number {
  let count = 0;
  for (const cell of cells) if (openChest(state, cell, rng)) count += 1;
  return count;
}

export function breakChairs(state: RoomState, cells: readonly Cell[], rng: () => number): number {
  let count = 0;
  for (const cell of cells) if (breakChair(state, cell, rng)) count += 1;
  return count;
}

/** Ближайшая клетка пола. Золото может лежать стопкой, вещь клетку уже занимает. */
export function goldCell(state: RoomState, origin: Cell, rng: () => number): Cell | null {
  return nearestDropCell(state, origin, lootTaken(state), rng);
}

export function lootTaken(state: RoomState): Set<string> {
  return new Set(state.loot.map((loot) => `${loot.x},${loot.y}`));
}

export function dropTaken(state: RoomState): Set<string> {
  const taken = lootTaken(state);
  for (const pile of state.piles) taken.add(`${pile.x},${pile.y}`);
  return taken;
}

export function nearestDropCell(state: RoomState, origin: Cell, taken: ReadonlySet<string>, rng: (() => number) | null): Cell | null {
  let best = Number.POSITIVE_INFINITY;
  const options: Cell[] = [];
  for (let y = 0; y < state.room.h; y += 1) {
    for (let x = 0; x < state.room.w; x += 1) {
      if (taken.has(`${x},${y}`)) continue;
      if (x === state.hero.x && y === state.hero.y) continue;
      if (state.monsters.some((monster) => onBoard(monster) && monster.x === x && monster.y === y)) continue;
      if (!isFloor(state.room, x, y) || isBlocked(state.room, x, y) || isPit(state.room, x, y)) continue;
      const distance = Math.abs(x - origin.x) + Math.abs(y - origin.y);
      if (distance < best) {
        best = distance;
        options.length = 0;
        options.push({ x, y });
      } else if (distance === best) options.push({ x, y });
    }
  }
  if (options.length === 0) return null;
  return rng ? pick(options, rng) : options[0]!;
}

export function releaseParcels(state: RoomState, origin: Cell, match: (parcel: LootParcel) => boolean): void {
  const due = state.pending.filter(match);
  if (due.length === 0) return;
  state.pending = state.pending.filter((parcel) => !match(parcel));
  const taken = dropTaken(state);
  for (const parcel of due) {
    const cell = nearestDropCell(state, origin, taken, null);
    if (!cell) {
      state.pending.push(parcel);
      continue;
    }
    taken.add(`${cell.x},${cell.y}`);
    state.loot.push({ ...parcel.item, x: cell.x, y: cell.y });
    state.spoilNames.push(lootName(parcel.item));
  }
}

export function takeGold(state: RoomState): number {
  const before = state.piles.length;
  state.piles = state.piles.filter((pile) => pile.x !== state.hero.x || pile.y !== state.hero.y);
  const got = before - state.piles.length;
  state.carried += got;
  return got;
}

export function lootName(loot: CarryLoot): string {
  if (loot.kind === "weapon") return weaponName(loot.catalogId);
  if (loot.kind === "ability") return heroAbilityById(loot.catalogId)?.name ?? "Ability";
  return itemById(loot.catalogId)?.name ?? "Item";
}

export function canControl(state: RoomState): boolean {
  if (state.hero.hp <= 0) {
    finish(state);
    return false;
  }
  return state.outcome !== "lost";
}

/** Начало хода героя: тела, убитые в прошлый ход, больше не держат клетку. */
export function beginHeroTurn(state: RoomState): void {
  state.bodies = [];
  state.spoilNames = [];
  if (state.hero.stun > 0) return;
  const seen = new Set<string>();
  for (const ability of state.abilities) {
    if (!ability || seen.has(ability.id)) continue;
    seen.add(ability.id);
    const left = state.hero.cooldowns[ability.id] ?? 0;
    if (left > 0) state.hero.cooldowns[ability.id] = left - 1;
  }
}

export function doorsNote(state: RoomState): string {
  return ` Enemy down. Blink +1.${state.exits.length > 0 ? " Doors are open." : ""}`;
}

/**
 * После действия героя ходит мир: монстры, потом тики.
 * Пока герой в стане, мир не даёт ему ход: раунды идут дальше, его кулдауны стоят.
 */
export function flushSpoils(state: RoomState): void {
  if (state.spoilNames.length === 0) return;
  const names = state.spoilNames.splice(0).join(", ");
  state.note = `${state.note} ${names} dropped.`.trim();
}

export function afterAction(state: RoomState, refreshed: boolean, rng: () => number): void {
  const heroNote = state.note;
  if (state.outcome === "won" || state.outcome === "lost") {
    flushSpoils(state);
    return;
  }
  const hero = state.hero;
  tickRoot(hero);
  if (hero.iceGuard > 0) hero.iceGuard -= 1;
  if (hero.hp <= 0) {
    finish(state);
    flushSpoils(state);
    return;
  }
  if (cleared(state)) {
    finish(state);
    state.note = `${heroNote}${doorsNote(state)}`;
    flushSpoils(state);
    return;
  }
  tickMeter(state, refreshed);
  round(state, rng);
  let stunned = false;
  while (state.outcome === "play" && hero.hp > 0 && hero.stun > 0 && !cleared(state)) {
    hero.stun -= 1;
    tickRoot(hero);
    stunned = true;
    round(state, rng);
  }
  const parts = [heroNote];
  if (stunned) parts.push("Hero is stunned.");
  const outcome = finish(state);
  if (outcome === "lost") {
    flushSpoils(state);
    return;
  }
  state.note = parts.filter((part) => part.length > 0).join(" ");
  if (outcome === "won") state.note += doorsNote(state);
  flushSpoils(state);
}
