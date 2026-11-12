/** Ход каждого вида монстров — от пса до гнилого мертвеца. Часть симуляции комнаты, вход — ../sim.ts. */
import { KIT, SPORE } from "../../data/monsters.ts";
import { beside, groundAt, holdsGround, square, writeGround } from "./combat.ts";
import { chebyshev, distancesTo, isBlocked, manhattan, sameCell, spot } from "./geometry.ts";
import { arrive, biteOrStep, planDash, rushLine, windup } from "./monster-moves.ts";
import { type Cell, type Fighter, ORTHO, type RoomState } from "./types.ts";
import { boardUnits, faceToward, monsterFighter, pick, ready, vacant } from "./units.ts";
import { breakObject } from "./world.ts";

/** Клетка игрока, если он на одной линии. Иначе пёс идёт шагом. */
export function dogTurn(state: RoomState, monster: Fighter, rng: () => number): string {
  const cell = spot(state.hero);
  const aligned = cell.x === monster.x || cell.y === monster.y;
  if (aligned && manhattan(monster, cell) > 1 && ready(monster, "dash") && monster.root === 0) {
    monster.windup = windup("charge", KIT.dog.delay, [cell], cell);
    monster.cooldowns.dash = KIT.dog.cooldown;
    faceToward(monster, cell);
    return "The hound lines up a charge.";
  }
  return biteOrStep(state, monster, rng);
}

/** Прыжок с задержкой в ход. Подсвечена только клетка посадки, и только она получает удар. */
export function goblinTurn(state: RoomState, monster: Fighter, rng: () => number): string {
  const hero = state.hero;
  if (manhattan(monster, hero) > 1 && ready(monster, "dash") && monster.root === 0) {
    const path = planDash(state, monster, KIT.goblin.dash, rng);
    const land = path[path.length - 1];
    if (land) {
      monster.windup = windup("pounce", KIT.goblin.delay, [land], land);
      monster.cooldowns.dash = KIT.goblin.cooldown;
      faceToward(monster, land);
      return "The goblin marks a leap.";
    }
  }
  return biteOrStep(state, monster, rng);
}

/** Линия до игрока включительно. Через ход урон и огонь на ней, не на клетке перед гончей. */
export function houndTurn(state: RoomState, monster: Fighter, rng: () => number): string {
  const hero = state.hero;
  const line = rushLine(state, monster);
  if (line.length > 1 && ready(monster, "dash") && monster.root === 0) {
    monster.windup = windup("rush", KIT.hound.delay, line, hero);
    monster.cooldowns.dash = KIT.hound.cooldown;
    faceToward(monster, hero);
    return "The ash hound marks a rush.";
  }
  return biteOrStep(state, monster, rng);
}

export function spiderTurn(state: RoomState, monster: Fighter, rng: () => number): string {
  const hero = state.hero;
  if (ready(monster, "shot") && manhattan(monster, hero) <= KIT.spider.range) {
    const target = spot(hero);
    monster.windup = windup("spit", KIT.spider.delay, [target], target);
    monster.cooldowns.shot = KIT.spider.cooldown;
    faceToward(monster, target);
    return "The spider marks a spit.";
  }
  return biteOrStep(state, monster, rng);
}

export function corpseTurn(state: RoomState, monster: Fighter, rng: () => number): string {
  const hero = state.hero;
  if (!monster.spent && manhattan(monster, hero) <= KIT.corpse.reach && monster.root === 0) {
    monster.spent = true;
    monster.windup = windup("jump", KIT.corpse.delay, square(state, hero, KIT.corpse.radius), hero);
    faceToward(monster, hero);
    return "The corpse readies a leap.";
  }
  return biteOrStep(state, monster, rng);
}

export function golemTurn(state: RoomState, monster: Fighter, rng: () => number): string {
  if (ready(monster, "stone")) {
    const target = spot(state.hero);
    monster.windup = windup("stone", KIT.golem.delay, [target], target);
    monster.cooldowns.stone = KIT.golem.cooldown;
    faceToward(monster, target);
    return "The golem winds up a stone.";
  }
  return biteOrStep(state, monster, rng);
}

export function sleepTurn(monster: Fighter): string {
  monster.hp = Math.min(monster.maxHp, monster.hp + monster.maxHp * KIT.bat.heal);
  if (monster.hp >= monster.maxHp) monster.mode = "ground";
  return "The bloodsucker sleeps and heals.";
}

export function batTurn(state: RoomState, monster: Fighter, rng: () => number): string {
  const hero = state.hero;
  if (!monster.spent && monster.hp < monster.maxHp * KIT.bat.sleepBelow) {
    monster.spent = true;
    monster.mode = "sleep";
    state.fx.push({ kind: "area", cells: [spot(monster)], tone: "control", act: "sleep" });
    return sleepTurn(monster);
  }
  if (manhattan(monster, hero) > 1 && ready(monster, "swoop") && monster.root === 0) {
    const cell = beside(state, hero, monster);
    if (cell) {
      const from = spot(monster);
      arrive(state, monster, cell, rng);
      faceToward(monster, hero);
      monster.cooldowns.swoop = KIT.bat.cooldown;
      state.fx.push({ kind: "dash", from, to: spot(monster), tone: "physical", act: "swoop" });
      return "The bloodsucker swooped.";
    }
  }
  return biteOrStep(state, monster, rng);
}

export function slimeTurn(state: RoomState, monster: Fighter, rng: () => number): string {
  if (monster.root > 0) return "";
  const clean = roomHasCleanFloor(state);
  const paths = slimePaths(state, monster);
  const pool = clean ? slimeCover(state, paths) : paths;
  const path = pick(pool, rng);
  if (!path) return "";
  const from = spot(monster);
  for (const cell of path) {
    faceToward(monster, cell);
    monster.x = cell.x;
    monster.y = cell.y;
    breakObject(state, cell, rng);
    writeGround(state, cell, "poison", KIT.slime.stacks, rng);
  }
  state.fx.push({ kind: "move", from, to: spot(monster) });
  return "";
}

export function roomHasCleanFloor(state: RoomState): boolean {
  for (let y = 0; y < state.room.h; y += 1) {
    for (let x = 0; x < state.room.w; x += 1) {
      if (holdsGround(state, x, y) && groundAt(state, x, y)?.kind !== "poison") return true;
    }
  }
  return false;
}

/** След до KIT.slime.steps клеток. Между шагами можно повернуть. Яд пол не закрывает. */
export function slimePaths(state: RoomState, monster: Fighter): Cell[][] {
  const paths: Cell[][] = [];
  const walk = (path: Cell[]): void => {
    if (path.length > 0) paths.push(path.slice());
    if (path.length >= KIT.slime.steps) return;
    const here = path[path.length - 1] ?? spot(monster);
    for (const step of ORTHO) {
      const next = { x: here.x + step.x, y: here.y + step.y };
      if (next.x === monster.x && next.y === monster.y) continue;
      if (path.some((cell) => cell.x === next.x && cell.y === next.y)) continue;
      if (!vacant(state, next.x, next.y)) continue;
      path.push(next);
      walk(path);
      path.pop();
    }
  };
  walk([]);
  return paths;
}

/** Среди следов берёт те, что красят больше чистого пола. При равенстве — ближе к оставшемуся чистому полу. */
export function slimeCover(state: RoomState, paths: Cell[][]): Cell[][] {
  let bestPaint = -1;
  let bestDist = Number.POSITIVE_INFINITY;
  let chosen: Cell[][] = [];
  for (const path of paths) {
    const painted = path.filter((cell) => groundAt(state, cell.x, cell.y)?.kind !== "poison").length;
    const end = path[path.length - 1]!;
    const dist = nearestClean(state, end);
    const better = painted > bestPaint || (painted === bestPaint && dist < bestDist);
    if (better) {
      bestPaint = painted;
      bestDist = dist;
      chosen = [path];
    } else if (painted === bestPaint && dist === bestDist) chosen.push(path);
  }
  return chosen;
}

export function nearestClean(state: RoomState, from: Cell): number {
  let best = Number.POSITIVE_INFINITY;
  for (let y = 0; y < state.room.h; y += 1) {
    for (let x = 0; x < state.room.w; x += 1) {
      if (!holdsGround(state, x, y) || groundAt(state, x, y)?.kind === "poison") continue;
      const dist = Math.abs(x - from.x) + Math.abs(y - from.y);
      if (dist < best) best = dist;
    }
  }
  return best;
}

/** Прямоугольник 2 в глубину и 3 в ширину перед скелетом, в сторону героя. */
export function swingCells(state: RoomState, monster: Fighter): Cell[] {
  const dx = state.hero.x - monster.x;
  const dy = state.hero.y - monster.y;
  const along = Math.abs(dx) >= Math.abs(dy) ? { x: Math.sign(dx), y: 0 } : { x: 0, y: Math.sign(dy) };
  const across = along.x !== 0 ? { x: 0, y: 1 } : { x: 1, y: 0 };
  const half = Math.floor(KIT.skeleton.width / 2);
  const cells: Cell[] = [];
  for (let depth = 1; depth <= KIT.skeleton.depth; depth += 1) {
    for (let offset = -half; offset <= half; offset += 1) {
      const x = monster.x + along.x * depth + across.x * offset;
      const y = monster.y + along.y * depth + across.y * offset;
      if (holdsGround(state, x, y)) cells.push({ x, y });
    }
  }
  return cells;
}

export function skeletonTurn(state: RoomState, monster: Fighter, rng: () => number): string {
  if (ready(monster, "swing") && manhattan(monster, state.hero) <= KIT.skeleton.reach) {
    const cells = swingCells(state, monster);
    if (cells.length > 0) {
      monster.windup = windup("swing", KIT.skeleton.delay, cells, monster);
      monster.cooldowns.swing = KIT.skeleton.cooldown;
      faceToward(monster, state.hero);
      return "The skeleton raises its sword.";
    }
  }
  return biteOrStep(state, monster, rng);
}

export function spiritTurn(state: RoomState, monster: Fighter, _rng: () => number): string {
  if (ready(monster, "blink") && monster.root === 0) {
    const cell = beside(state, state.hero, monster);
    if (cell) {
      monster.windup = windup("wisp", KIT.spirit.delay, [cell], cell);
      monster.cooldowns.blink = KIT.spirit.cooldown;
      faceToward(monster, cell);
      return "The spirit marks a cell.";
    }
  }
  return biteOrStep(state, monster, _rng);
}

export function mushroomTurn(state: RoomState, monster: Fighter, rng: () => number): string {
  if (ready(monster, "spore")) {
    const open: Cell[] = [];
    for (let y = 0; y < state.room.h; y += 1) {
      for (let x = 0; x < state.room.w; x += 1) if (vacant(state, x, y)) open.push({ x, y });
    }
    const cell = pick(open, rng);
    if (cell) {
      state.monsters.push(monsterFighter(SPORE, { x: cell.x, y: cell.y, facing: monster.facing }, true, state.adventure));
      monster.cooldowns.spore = KIT.mushroom.cooldown;
      state.fx.push({ kind: "shot", from: spot(monster), to: cell, tone: "poison", act: "spore" });
      return "The mushroom released a spore.";
    }
  }
  const hero = state.hero;
  const gap = manhattan(monster, hero);
  if (gap <= KIT.mushroom.keep && monster.root === 0) {
    const away = ORTHO.map((step) => ({ x: monster.x + step.x, y: monster.y + step.y })).filter(
      (cell) => vacant(state, cell.x, cell.y) && manhattan(cell, hero) > gap,
    );
    const next = pick(away, rng);
    if (next) {
      faceToward(monster, next);
      monster.x = next.x;
      monster.y = next.y;
      breakObject(state, next, rng);
      return "";
    }
  }
  return "";
}

export function sporeTurn(state: RoomState, monster: Fighter, rng: () => number): string {
  const near = boardUnits(state).some(
    (unit) => unit !== monster && unit.role !== "mushroom" && chebyshev(unit, monster) <= KIT.spore.radius,
  );
  if (near) {
    monster.windup = windup("fuse", KIT.spore.fuse, square(state, monster, KIT.spore.radius), monster);
    return "The spore swells.";
  }
  if (monster.root > 0) return "";
  const gap = manhattan(monster, state.hero);
  const options = ORTHO.map((step) => ({ x: monster.x + step.x, y: monster.y + step.y })).filter(
    (cell) => vacant(state, cell.x, cell.y) && manhattan(cell, state.hero) >= gap,
  );
  const next = pick(options, rng);
  if (!next) return "";
  faceToward(monster, next);
  monster.x = next.x;
  monster.y = next.y;
  breakObject(state, next, rng);
  return "";
}

export function emberTurn(state: RoomState, monster: Fighter, rng: () => number): string {
  if (ready(monster, "vanish") && monster.root === 0) {
    monster.mode = "gone";
    monster.anchor = spot(monster);
    monster.phase = KIT.ember.pause;
    monster.cooldowns.vanish = KIT.ember.cooldown;
    state.fx.push({ kind: "area", cells: [spot(monster)], tone: "fire", act: "vanish" });
    return "The ember vanished.";
  }
  return biteOrStep(state, monster, rng);
}

/** Исчезнувший уголёк: пауза, затем метит клетку рядом с героем. */
export function emberGone(state: RoomState, monster: Fighter, rng: () => number): string {
  if (monster.phase > 0) {
    monster.phase -= 1;
    return "";
  }
  const cell = beside(state, state.hero, null);
  if (!cell) {
    monster.mode = "ground";
    arrive(state, monster, monster.anchor ?? monster, rng);
    return "The ember returned to its spot.";
  }
  monster.windup = windup("appear", KIT.ember.delay, square(state, cell, KIT.ember.radius), cell);
  return "The ember marks a cell.";
}

export function wormTurn(state: RoomState, monster: Fighter, rng: () => number): string {
  if (ready(monster, "dig") && monster.root === 0) {
    state.fx.push({ kind: "area", cells: [spot(monster)], tone: "earth", act: "dig" });
    monster.mode = "under";
    return "The worm burrowed.";
  }
  return biteOrStep(state, monster, rng);
}

/** Червь ползёт под землёй к герою. Дойдя до его клетки, метит её. */
export function wormUnder(state: RoomState, monster: Fighter, rng: () => number): string {
  const hero = state.hero;
  if (!sameCell(monster, hero)) {
    const room = state.room;
    const dist = distancesTo(room, hero);
    const here = dist[monster.y * room.w + monster.x] ?? -1;
    if (here > 0) {
  const options = ORTHO.map((step) => ({ x: monster.x + step.x, y: monster.y + step.y })).filter(
    (cell) => !isBlocked(room, cell.x, cell.y) && dist[cell.y * room.w + cell.x] === here - 1,
  );
      const next = pick(options, rng);
      if (next) {
        monster.x = next.x;
        monster.y = next.y;
      }
    }
  }
  if (sameCell(monster, hero)) {
    monster.windup = windup("emerge", KIT.worm.delay, square(state, hero, KIT.worm.radius), hero);
    return "The ground shakes under the hero.";
  }
  return "";
}
