/** Монстры с отложенными ударами, бочки автоматона и обмен местами. Часть симуляции комнаты, вход — ../sim.ts. */
import { type DamageType, KIT } from "../../data/monsters.ts";
import { beside, cancelWindup, groundAt, holdsGround, hurt, ring, square, writeGround } from "./combat.ts";
import { chebyshev, distancesTo, isBlocked, manhattan, spot } from "./geometry.ts";
import { beamCells, biteOrStep, windup } from "./monster-moves.ts";
import { type Cell, type Fighter, type GroundKind, type Keg, ORTHO, type RoomState } from "./types.ts";
import { boardUnits, faceToward, onBoard, pick, ready, taken, unitsIn, vacant } from "./units.ts";
import { breakObject } from "./world.ts";

export function acolyteTurn(state: RoomState, monster: Fighter): string {
  if (ready(monster, "spires")) {
    monster.windup = windup("spires", KIT.acolyte.delay, square(state, state.hero, KIT.acolyte.radius), state.hero);
    monster.cooldowns.spires = KIT.acolyte.cooldown;
    return "The acolyte raises spires.";
  }
  return "";
}

export function chestTurn(state: RoomState, monster: Fighter, rng: () => number): string {
  const hero = state.hero;
  if (manhattan(monster, hero) > KIT.chest.reach) {
    monster.windup = windup("tongue", KIT.chest.delay, square(state, hero, KIT.chest.radius), hero);
    faceToward(monster, hero);
    return "The chest lashed its tongue.";
  }
  return biteOrStep(state, monster, rng);
}

export function markRock(state: RoomState, monster: Fighter): void {
  const target = spot(state.hero);
  state.hazards.push({ owner: monster, kind: "rock", turns: KIT.gargoyle.delay, cells: [target], center: target });
}

export function gargoyleTurn(state: RoomState, monster: Fighter, rng: () => number): string {
  if (ready(monster, "flight") && monster.root === 0) {
    monster.mode = "air";
    monster.anchor = spot(monster);
    monster.phase = 0;
    gargoyleAir(state, monster);
    return "The gargoyle took off.";
  }
  return biteOrStep(state, monster, rng);
}

/** Полёт: каждый ход метит клетку героя под камень. После четырёх камней — посадка. */
export function gargoyleAir(state: RoomState, monster: Fighter): string {
  if (monster.phase < KIT.gargoyle.stones) {
    markRock(state, monster);
    monster.phase += 1;
    return "The gargoyle marks a stone.";
  }
  monster.windup = windup("land", KIT.gargoyle.landDelay, square(state, state.hero, KIT.gargoyle.radius), state.hero);
  return "The gargoyle comes in to land.";
}

/** Кольца вокруг клетки героя: центр с задержкой 1, каждое следующее кольцо на ход позже. */
export function castRings(state: RoomState, owner: Fighter, kind: "geyser" | "hail", count: number): void {
  const center = spot(state.hero);
  for (let radius = 0; radius < count; radius += 1) {
    const cells = ring(state, center, radius);
    if (cells.length > 0) state.hazards.push({ owner, kind, turns: radius + 1, cells, center });
  }
}

export function throwTarget(state: RoomState, monster: Fighter, rng: () => number): Fighter | null {
  const pool = state.monsters.filter(
    (unit) => unit !== monster && onBoard(unit) && unit.mode !== "held" && unit.role !== "gargoyle" && unit.role !== "chest",
  );
  if (pool.length === 0) return null;
  const best = Math.min(...pool.map((unit) => chebyshev(unit, monster)));
  return pick(
    pool.filter((unit) => chebyshev(unit, monster) === best),
    rng,
  );
}

export function drownedTurn(state: RoomState, monster: Fighter, rng: () => number): string {
  if (ready(monster, "geyser")) {
    castRings(state, monster, "geyser", KIT.drowned.rings);
    monster.cooldowns.geyser = KIT.drowned.geyserCooldown;
    return "The drowned raised geysers.";
  }
  if (ready(monster, "throw")) {
    const target = throwTarget(state, monster, rng);
    const landing = target ? beside(state, state.hero, target) : null;
    if (target && landing) {
      cancelWindup(target);
      target.mode = "held";
      monster.windup = windup("throw", KIT.drowned.throwDelay, square(state, landing, KIT.drowned.radius), landing, target);
      monster.cooldowns.throw = KIT.drowned.throwCooldown;
      return "The drowned grabbed a creature.";
    }
  }
  return biteOrStep(state, monster, rng);
}

export function whisperTurn(state: RoomState, monster: Fighter, rng: () => number): string {
  if (ready(monster, "charm")) {
    const pool = state.monsters.filter(
      (unit) => unit !== monster && onBoard(unit) && unit.role !== "spore" && !unit.charmers.includes(monster),
    );
    if (pool.length > 0) {
      const best = Math.min(...pool.map((unit) => chebyshev(unit, monster)));
      const target = pick(
        pool.filter((unit) => chebyshev(unit, monster) === best),
        rng,
      );
      if (target) {
        target.charmers.push(monster);
        monster.cooldowns.charm = KIT.whisper.charmCooldown;
        state.fx.push({ kind: "line", from: spot(monster), to: spot(target), tone: "ice", act: "charm" });
        return "The whisper charmed a monster.";
      }
    }
  }
  if (ready(monster, "hail")) {
    castRings(state, monster, "hail", KIT.whisper.rings);
    monster.cooldowns.hail = KIT.whisper.hailCooldown;
    return "The whisper called down hail.";
  }
  const aligned = state.hero.x === monster.x || state.hero.y === monster.y;
  const line = aligned ? beamCells(state, monster, state.hero, KIT.whisper.beamRange) : [];
  if (line.length > 0 && ready(monster, "beam")) {
    monster.windup = windup("beam", KIT.whisper.beamDelay, line, state.hero);
    faceToward(monster, state.hero);
    return "The whisper aims a beam.";
  }
  return "";
}

export function automatonTurn(state: RoomState, monster: Fighter, rng: () => number): string {
  if (ready(monster, "swap")) {
    const cell = spot(state.hero);
    monster.windup = windup("swap", KIT.automaton.swapDelay, [cell], cell);
    monster.cooldowns.swap = KIT.automaton.swapCooldown;
    faceToward(monster, cell);
    return "The automaton marks a swap.";
  }
  if (ready(monster, "keg")) {
    const spots = ORTHO.map((step) => ({ x: monster.x + step.x, y: monster.y + step.y })).filter(
      (cell) => vacant(state, cell.x, cell.y) && !kegAt(state, cell.x, cell.y),
    );
    const place = pick(spots, rng);
    if (place) {
      const element = pick(KEG_ELEMENTS, rng);
      if (element) {
        state.kegs.push({ x: place.x, y: place.y, element, owner: monster });
        monster.cooldowns.keg = KIT.automaton.kegCooldown;
        faceToward(monster, place);
        return "The automaton sets a barrel.";
      }
    }
  }
  return stepToDanger(state, monster, rng);
}

/** Опасность клетки: лужи и чужие монстры в квадрате 3×3, включая её саму. */
export function dangerAt(state: RoomState, monster: Fighter, cell: Cell): number {
  let score = 0;
  for (let dy = -1; dy <= 1; dy += 1) {
    for (let dx = -1; dx <= 1; dx += 1) {
      const x = cell.x + dx;
      const y = cell.y + dy;
      if (groundAt(state, x, y)) score += 1;
      for (const other of state.monsters) {
        if (other === monster || !onBoard(other)) continue;
        if (other.x === x && other.y === y) score += 1;
      }
    }
  }
  return score;
}

export function stepToDanger(state: RoomState, monster: Fighter, rng: () => number): string {
  if (monster.root > 0) return "";
  let best: Cell | null = null;
  let bestScore = -1;
  let bestDist = Number.POSITIVE_INFINITY;
  for (let y = 0; y < state.room.h; y += 1) {
    for (let x = 0; x < state.room.w; x += 1) {
      if (!holdsGround(state, x, y)) continue;
      const cell = { x, y };
      const score = dangerAt(state, monster, cell);
      const dist = manhattan(monster, cell);
      if (score > bestScore || (score === bestScore && dist < bestDist)) {
        best = cell;
        bestScore = score;
        bestDist = dist;
      }
    }
  }
  if (!best || (best.x === monster.x && best.y === monster.y)) return "";
  const dist = distancesTo(state.room, best, (x, y) => kegAt(state, x, y) !== undefined);
  const here = dist[monster.y * state.room.w + monster.x] ?? -1;
  if (here <= 0) return "";
  const options = ORTHO.map((step) => ({ x: monster.x + step.x, y: monster.y + step.y })).filter(
    (cell) => !isBlocked(state.room, cell.x, cell.y) && !taken(state, cell.x, cell.y) && !kegAt(state, cell.x, cell.y) && dist[cell.y * state.room.w + cell.x] === here - 1,
  );
  const next = pick(options, rng);
  if (!next) return "";
  faceToward(monster, next);
  monster.x = next.x;
  monster.y = next.y;
  return breakObject(state, next, rng) ? "Object broken." : "";
}

export const KEG_ELEMENTS: readonly GroundKind[] = ["fire", "water", "ice", "poison", "oil"];
export let detonating = false;

export function kegAt(state: RoomState, x: number, y: number): Keg | undefined {
  return state.kegs.find((keg) => keg.x === x && keg.y === y);
}

export function explodeKeg(state: RoomState, keg: Keg, rng: () => number, seen: Set<Keg>): void {
  if (seen.has(keg)) return;
  seen.add(keg);
  state.kegs = state.kegs.filter((item) => item !== keg);
  const cells = square(state, keg, 1);
  const type: DamageType = keg.element === "oil" ? "earth" : keg.element;
  for (const unit of unitsIn(state, cells)) hurt(state, unit, KIT.automaton.blast, type, keg.owner, rng, false, type === "poison");
  for (const cell of cells) writeGround(state, cell, keg.element, keg.element === "poison" ? 1 : 0, rng);
  state.fx.push({ kind: "area", cells, tone: type, act: "keg" });
  for (const other of state.kegs.filter((item) => cells.some((cell) => cell.x === item.x && cell.y === item.y))) {
    explodeKeg(state, other, rng, seen);
  }
}

export function touchKegs(state: RoomState, cells: readonly Cell[], rng: () => number): void {
  if (detonating) return;
  const hits = state.kegs.filter((keg) => cells.some((cell) => cell.x === keg.x && cell.y === keg.y));
  if (hits.length === 0) return;
  detonating = true;
  const seen = new Set<Keg>();
  for (const keg of hits) explodeKeg(state, keg, rng, seen);
  detonating = false;
}

export function resolveSwap(state: RoomState, monster: Fighter, cell: Cell, rng: () => number): string {
  const occupant = boardUnits(state).find((unit) => unit !== monster && unit.x === cell.x && unit.y === cell.y) ?? null;
  if (!occupant) return "The swap finds nobody.";
  if (occupant.root > 0 || occupant.stun > 0) return "The swap fails. The target cannot move.";
  const from = spot(monster);
  monster.x = occupant.x;
  monster.y = occupant.y;
  occupant.x = from.x;
  occupant.y = from.y;
  hurt(state, occupant, KIT.automaton.swapDamage, "physical", monster, rng);
  faceToward(monster, from);
  state.fx.push({ kind: "line", from, to: spot(monster), tone: "control", act: "swap" });
  return "The automaton swapped places.";
}
