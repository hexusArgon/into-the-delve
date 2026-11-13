/** Урон, стихии на полу, щит, стан, смерть и поиск соседней клетки. Часть симуляции комнаты, вход — ../sim.ts. */
import { type DamageType, ELEMENTS, KIT, MONSTER_GOLD, RARE_GOLD } from "../../data/monsters.ts";
import { threatFactor } from "../adventure.ts";
import { METER_TURNS, STUN_TURNS, armorFactor } from "../rules.ts";
import { chebyshev, inRoom, isBlocked, isFloor, manhattan, sameCell, spot } from "./geometry.ts";
import { touchKegs } from "./monster-casters.ts";
import { AROUND, type Cell, DIAGONAL, type Fighter, type GroundCell, type GroundKind, ORTHO, type RoomState } from "./types.ts";
import { finish, immuneTo, inFront, onBoard, specOf, unitsIn, vacant } from "./units.ts";
import { cellKey, releaseParcels, spillGold } from "./world.ts";

export function groundAt(state: RoomState, x: number, y: number): GroundCell | null {
  if (!inRoom(state.room, x, y)) return null;
  return state.ground[y * state.room.w + x] ?? null;
}

export function holdsGround(state: RoomState, x: number, y: number): boolean {
  return isFloor(state.room, x, y) && !isBlocked(state.room, x, y);
}

export const SPILL: Partial<Record<DamageType, GroundKind>> = {
  fire: "fire",
  earth: "oil",
  poison: "poison",
  water: "water",
  ice: "ice",
};

/** Новая лужа. Повторная запись на ту же клетку начинает срок заново. */
export function puddle(kind: GroundKind, stacks: number): GroundCell {
  return { kind, stacks: kind === "poison" ? stacks : 0, turns: ELEMENTS.puddleTurns };
}
export function pour(state: RoomState, cells: readonly Cell[], type: DamageType, stacks: number, rng: () => number): void {
  const kind = SPILL[type];
  if (!kind) return;
  for (const cell of cells) writeGround(state, cell, kind, stacks, rng);
}

/** Обычная запись заменяет прежний тип. Особые встречи: огонь и масло, лёд и вода, огонь и вода, огонь и лёд. */
export function writeGround(state: RoomState, cell: Cell, kind: GroundKind, stacks: number, rng: () => number): void {
  if (!holdsGround(state, cell.x, cell.y)) return;
  const index = cell.y * state.room.w + cell.x;
  const current = state.ground[index]?.kind;
  if (kind === "fire") {
    if (current === "oil") {
      blast(state, cell, rng);
      return;
    }
    if (current === "water") {
      state.ground[index] = null;
      return;
    }
    if (current === "ice") {
      state.ground[index] = puddle("water", 0);
      return;
    }
  }
  if (kind === "water" && current === "fire") {
    state.ground[index] = null;
    return;
  }
  if (kind === "ice" && current === "water") {
    freeze(state, cell);
    return;
  }
  state.ground[index] = puddle(kind, stacks);
}

/** Огонь по маслу взрывает клетку и соседние масляные домино. Каждая бьёт стоящих на ней огнём и горит. */
export function blast(state: RoomState, start: Cell, rng: () => number): void {
  const queue: Cell[] = [start];
  const seen = new Set([cellKey(start)]);
  const burst: Cell[] = [];
  while (queue.length > 0) {
    const cell = queue.shift()!;
    if (groundAt(state, cell.x, cell.y)?.kind !== "oil") continue;
    state.ground[cell.y * state.room.w + cell.x] = puddle("fire", 0);
    burst.push(cell);
    for (const unit of unitsIn(state, [cell])) hurt(state, unit, ELEMENTS.oilBlast, "fire", null, rng);
    for (const step of AROUND) {
      const next = { x: cell.x + step.x, y: cell.y + step.y };
      const key = cellKey(next);
      if (seen.has(key)) continue;
      seen.add(key);
      if (groundAt(state, next.x, next.y)?.kind === "oil") queue.push(next);
    }
  }
  if (burst.length > 0) {
    state.fx.push({ kind: "area", cells: burst, tone: "fire" });
    touchKegs(state, burst, rng);
  }
}

/** Лёд по воде замораживает клетку и соседние водяные домино. Кто стоит на них — стан. */
export function freeze(state: RoomState, start: Cell): void {
  const queue: Cell[] = [start];
  const seen = new Set([cellKey(start)]);
  const frozen: Cell[] = [];
  while (queue.length > 0) {
    const cell = queue.shift()!;
    if (groundAt(state, cell.x, cell.y)?.kind !== "water") continue;
    state.ground[cell.y * state.room.w + cell.x] = puddle("ice", 0);
    frozen.push(cell);
    for (const unit of unitsIn(state, [cell])) stunUnit(state, unit, ELEMENTS.iceStun);
    for (const step of AROUND) {
      const next = { x: cell.x + step.x, y: cell.y + step.y };
      const key = cellKey(next);
      if (seen.has(key)) continue;
      seen.add(key);
      if (groundAt(state, next.x, next.y)?.kind === "water") queue.push(next);
    }
  }
  if (frozen.length > 0) state.fx.push({ kind: "area", cells: frozen, tone: "ice" });
}

/* ---------- урон, щит, стан ---------- */

/** Броня Warcraft 3, масло для нефизического урона, вода для физического. */
export function damageFactor(unit: Fighter, type: DamageType): number {
  let factor = armorFactor(armorRating(unit, type));
  if (type !== "physical" && unit.oil > 0) factor *= ELEMENTS.oilFactor;
  if (type === "physical" && unit.wet > 0) factor *= ELEMENTS.wetFactor;
  return factor;
}

/** Физическое — DEF. У героя стихия сидит в своём сопротивлении, у монстра — в MDEF. */
export function armorRating(unit: Fighter, type: DamageType): number {
  if (type === "physical") return unit.attrs.DEF ?? 0;
  if (unit.role === "hero") {
    if (type === "fire") return unit.attrs.FireRes ?? 0;
    if (type === "earth") return unit.attrs.EarthRes ?? 0;
    if (type === "poison") return unit.attrs.PosionRes ?? 0;
    if (type === "water") return unit.attrs.WaterRes ?? 0;
    if (type === "ice") return unit.attrs.IceRes ?? 0;
  }
  return unit.attrs.MDEF ?? 0;
}

export function heroOutgoing(state: RoomState, amount: number, type: DamageType, ability: boolean): number {
  let value = amount;
  if (ability) value += state.abilityPower;
  const percent = state.bonusDamage[type] ?? 0;
  if (percent) value *= 1 + percent / 100;
  return value;
}

/** Огонь и яд по автоматону режутся пополам уже после брони. Это не иммунитет. */
export function resistFactor(unit: Fighter, type: DamageType): number {
  if (unit.role === "automaton" && (type === "fire" || type === "poison")) return KIT.automaton.resist;
  return 1;
}

export function markHit(state: RoomState, cell: Cell, dealt: number, type: DamageType, crit = false): void {
  if (dealt <= 0) return;
  state.hits.push({ x: cell.x, y: cell.y, amount: dealt, type, crit });
}

/** Удар способностью, укусом или оружием. Возвращает урон после брони, стихий и иммунитета. */
export function hurt(
  state: RoomState,
  target: Fighter,
  amount: number,
  type: DamageType,
  source: Fighter | null,
  rng: () => number,
  ability = false,
  directPoison = false,
  crit = false,
): number {
  if (target.hp <= 0) return 0;
  if (target !== state.hero && !onBoard(target)) return 0;
  if (target === state.hero && state.dodge > 0 && rng() < Math.min(1, state.dodge)) return 0;
  if (type === "poison" && !directPoison) {
    dose(state, target, amount, source, rng, ability);
    return 0;
  }
  if (source === state.hero) amount = heroOutgoing(state, amount, type, ability);
  if (source && source !== state.hero) amount *= threatFactor(state.adventure);
  if (immuneTo(target, type)) return 0;
  if (type === "ice" && groundAt(state, target.x, target.y)?.kind === "ice" && target.iceGuard === 0) {
    stunUnit(state, target, ELEMENTS.iceStun);
    target.iceGuard = ELEMENTS.iceStunCooldown;
  }
  const raw = resistFactor(target, type) * amount * damageFactor(target, type);
  const dealt = target === state.hero ? wardAbsorb(state, raw, type) : raw;
  if (dealt > 0) {
    target.hp -= dealt;
    markHit(state, target, dealt, type, crit);
    touchKegs(state, [target], rng);
    if (type === "fire") target.burn = ELEMENTS.fireTurns;
    if (type === "earth") target.oil = ELEMENTS.oilTurns;
    if (type === "water") target.wet = ELEMENTS.wetTurns;
  }
  landed(state, target, dealt, source, rng, ability);
  if (directPoison && target.hp > 0) {
    target.poison += 1;
    target.poisonWindow = ELEMENTS.poisonWindow;
  }
  return dealt;
}

/**
 * Огненный щит принимает удар раньше HP.
 * Огонь прочность не снимает и до HP не доходит. Вода снимает вдвое. Остальное один к одному.
 * На нуле щит спадает, в HP идёт недопоглощённый остаток этого удара.
 */
export function wardAbsorb(state: RoomState, dealt: number, type: DamageType): number {
  const ward = state.ward;
  if (!ward || dealt <= 0) return dealt;
  if (type === "fire") return 0;
  const rate = type === "water" ? 2 : 1;
  const cost = dealt * rate;
  if (cost <= ward.hp) {
    ward.hp -= cost;
    if (ward.hp <= 0) state.ward = null;
    return 0;
  }
  const absorbed = ward.hp / rate;
  state.ward = null;
  return dealt - absorbed;
}

/** Порция яда: стаки прибавляются, окно снова полное. */
export function dose(state: RoomState, target: Fighter, stacks: number, source: Fighter | null, rng: () => number, ability = false): void {
  if (target.hp <= 0 || immuneTo(target, "poison")) return;
  target.poison += stacks;
  target.poisonWindow = ELEMENTS.poisonWindow;
  landed(state, target, 0, source, rng, ability);
}

export function landed(state: RoomState, target: Fighter, dealt: number, source: Fighter | null, rng: () => number, ability = false): void {
  if (target !== state.hero && source) {
    if (source === state.hero) {
      if (target.mode === "passive") target.mode = "ground";
      chip(state, target, ability ? 1 : heroShieldPoints(state, target), true);
    } else {
      chip(state, target, 1, false);
    }
  }
  if (source && source !== state.hero && dealt > 0 && source.hp > 0) {
    const stacks = vampirism(state, source);
    if (stacks > 0) source.hp = Math.min(source.maxHp, source.hp + stacks * dealt);
  }
  if (target.hp <= 0) kill(state, target, rng);
}

/** Оружие. Способность всегда снимает 1. Меч, топор, клинки и копьё снимают 2. Посох и огнестрел — 1, и 2, если цель стоит в клетке прямо перед героем. */
export function heroShieldPoints(state: RoomState, target: Fighter): number {
  const id = state.weapon;
  if (id === "sword" || id === "axe" || id === "dual" || id === "spear") return 2;
  return inFront(state, target) ? 2 : 1;
}

/** Damage монстра по монстру снимает 1. */
export function chip(state: RoomState, target: Fighter, points: number, byHero: boolean): void {
  if (target.maxShield <= 0 || target.shield <= 0) return;
  target.shield = Math.max(0, target.shield - points);
  if (target.shield > 0) return;
  stunUnit(state, target, Math.max(2, STUN_TURNS));
  target.freshStun = true;
  if (target.mode === "sleep") target.mode = "ground";
  if (byHero) {
      state.meterTurns = METER_TURNS;
      state.meterLevel += 1;
      state.blink += 1;
    }
  }

/** Стан пропускает ход целиком и отменяет отложенный удар. Два стана не складываются. */
export function stunUnit(state: RoomState, unit: Fighter, turns: number): void {
  if (unit.hp <= 0) return;
  if (unit !== state.hero && !onBoard(unit)) return;
  unit.stun = Math.max(unit.stun, turns);
  cancelWindup(unit);
}

export function cancelWindup(unit: Fighter): void {
  const target = unit.windup?.target;
  if (target && target.mode === "held") target.mode = "ground";
  unit.windup = null;
}

export function kill(state: RoomState, unit: Fighter, rng: () => number): void {
  unit.hp = 0;
  if (unit === state.hero) {
    finish(state);
    return;
  }
  cancelWindup(unit);
  if (unit.mode === "held") unit.mode = "ground";
  if (!state.bodies.some((body) => sameCell(body, unit))) state.bodies.push(spot(unit));
  const charmers = unit.charmers;
  unit.charmers = [];
  for (const charmer of charmers) {
    if (charmer.hp > 0) shatter(state, charmer, spot(unit), rng);
  }
  if (unit.role !== "spore") spillGold(state, spot(unit), rng, specOf(unit)?.rare ? RARE_GOLD : MONSTER_GOLD);
  if (unit.packIndex !== undefined) releaseParcels(state, spot(unit), (parcel) => parcel.monster === unit.packIndex && !parcel.chest);
}

/** Аура идёт, только пока послушник её кастует. Стан, немота и другой каст её снимают. */
export function acolyteChanneling(unit: Fighter): boolean {
  return unit.role === "acolyte" && onBoard(unit) && unit.stun === 0 && unit.silence === 0 && unit.windup === null;
}

/** Клетки ауры: тот же квадрат, что и стаки вампиризма. */
export function acolyteAuraCells(state: RoomState): Cell[] {
  const marked = new Set<string>();
  const cells: Cell[] = [];
  const reach = KIT.acolyte.aura;
  for (const acolyte of state.monsters) {
    if (!acolyteChanneling(acolyte)) continue;
    for (let dy = -reach; dy <= reach; dy += 1) {
      for (let dx = -reach; dx <= reach; dx += 1) {
        const x = acolyte.x + dx;
        const y = acolyte.y + dy;
        if (!isFloor(state.room, x, y)) continue;
        const key = `${x},${y}`;
        if (marked.has(key)) continue;
        marked.add(key);
        cells.push({ x, y });
      }
    }
  }
  return cells;
}

/** Стаки вампиризма: по одному от каждого послушника, чья аура накрывает монстра. */
export function vampirism(state: RoomState, unit: Fighter): number {
  let stacks = 0;
  for (const other of state.monsters) {
    if (!acolyteChanneling(other)) continue;
    if (chebyshev(other, unit) <= KIT.acolyte.aura) stacks += KIT.acolyte.vampirism;
  }
  return stacks;
}

/** Осколки очарованного: 3×3 на его клетке, урон льдом всем, кроме шёпота. */
export function shatter(state: RoomState, charmer: Fighter, at: Cell, rng: () => number): void {
  const cells = square(state, at, KIT.whisper.radius);
  for (const unit of unitsIn(state, cells, charmer)) hurt(state, unit, KIT.whisper.shards, "ice", charmer, rng);
  pour(state, cells, "ice", 0, rng);
  state.fx.push({ kind: "area", cells, tone: "ice", act: "shards" });
}

/* ---------- геометрия и перемещения ---------- */

/** Квадрат по Чебышёву. Радиус 1 — 3×3. Стены и ямы в область не входят. */
export function square(state: RoomState, center: Cell, radius: number): Cell[] {
  const cells: Cell[] = [];
  for (let dy = -radius; dy <= radius; dy += 1) {
    for (let dx = -radius; dx <= radius; dx += 1) {
      const x = center.x + dx;
      const y = center.y + dy;
      if (holdsGround(state, x, y)) cells.push({ x, y });
    }
  }
  return cells;
}

export function ring(state: RoomState, center: Cell, radius: number): Cell[] {
  return square(state, center, radius).filter((cell) => chebyshev(cell, center) === radius);
}

export function nearestVacant(state: RoomState, origin: Cell): Cell | null {
  let best: Cell | null = null;
  let bestKey = Number.POSITIVE_INFINITY;
  for (let y = 0; y < state.room.h; y += 1) {
    for (let x = 0; x < state.room.w; x += 1) {
      if (!vacant(state, x, y)) continue;
      const key = chebyshev({ x, y }, origin) * 10000 + manhattan({ x, y }, origin);
      if (key < bestKey) {
        bestKey = key;
        best = { x, y };
      }
    }
  }
  return best;
}

/** Свободная клетка рядом: сначала по ортогонали, потом по диагонали. Ближе к `prefer`. */
export function beside(state: RoomState, center: Cell, prefer: Cell | null): Cell | null {
  const choose = (steps: readonly Cell[]): Cell | null => {
    const options = steps
      .map((step) => ({ x: center.x + step.x, y: center.y + step.y }))
      .filter((cell) => vacant(state, cell.x, cell.y));
    if (options.length === 0) return null;
    if (!prefer) return options[0] ?? null;
    return options.reduce((best, cell) => (manhattan(cell, prefer) < manhattan(best, prefer) ? cell : best));
  };
  return choose(ORTHO) ?? choose(DIAGONAL);
}
