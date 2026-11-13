/** Ход монстра целиком: выбор роли, срабатывание замахов, фаза монстров. Часть симуляции комнаты, вход — ../sim.ts. */
import { type DamageType, KIT } from "../../data/monsters.ts";
import { beside, hurt, kill, pour, stunUnit, writeGround } from "./combat.ts";
import { hasCell, manhattan, sameCell, spot } from "./geometry.ts";
import { acolyteTurn, automatonTurn, chestTurn, drownedTurn, gargoyleAir, gargoyleTurn, resolveSwap, touchKegs, whisperTurn } from "./monster-casters.ts";
import { batTurn, corpseTurn, dogTurn, emberGone, emberTurn, goblinTurn, golemTurn, houndTurn, mushroomTurn, skeletonTurn, sleepTurn, slimeTurn, spiderTurn, spiritTurn, sporeTurn, wormTurn, wormUnder } from "./monster-kinds.ts";
import { arrive, biteOrStep, houndStop, knock } from "./monster-moves.ts";
import { BACK, DIRS, type Fighter, type Hazard, type RoomState, type Windup } from "./types.ts";
import { cleared, faceToward, pick, specOf, unitsIn } from "./units.ts";
import { breakObject, takeGold } from "./world.ts";

export function roleTurn(state: RoomState, monster: Fighter, rng: () => number): string {
  switch (monster.role) {
    case "dog":
      return dogTurn(state, monster, rng);
    case "hound":
      return houndTurn(state, monster, rng);
    case "goblin":
      return goblinTurn(state, monster, rng);
    case "spider":
      return spiderTurn(state, monster, rng);
    case "corpse":
      return corpseTurn(state, monster, rng);
    case "golem":
      return golemTurn(state, monster, rng);
    case "bat":
      return batTurn(state, monster, rng);
    case "slime":
      return slimeTurn(state, monster, rng);
    case "skeleton":
      return skeletonTurn(state, monster, rng);
    case "spirit":
      return spiritTurn(state, monster, rng);
    case "mushroom":
      return mushroomTurn(state, monster, rng);
    case "spore":
      return sporeTurn(state, monster, rng);
    case "ember":
      return emberTurn(state, monster, rng);
    case "worm":
      return wormTurn(state, monster, rng);
    case "acolyte":
      return acolyteTurn(state, monster);
    case "chest":
      return chestTurn(state, monster, rng);
    case "gargoyle":
      return gargoyleTurn(state, monster, rng);
    case "drowned":
      return drownedTurn(state, monster, rng);
    case "whisper":
      return whisperTurn(state, monster, rng);
    case "automaton":
      return automatonTurn(state, monster, rng);
    default:
      return biteOrStep(state, monster, rng);
  }
}

export function resolveWindup(state: RoomState, monster: Fighter, cast: Windup, rng: () => number): string {
  const note = resolveCast(state, monster, cast, rng);
  if (cast.kind !== "swap" && cast.kind !== "tongue" && cast.kind !== "spires") touchKegs(state, cast.cells, rng);
  return note;
}

export function resolveCast(state: RoomState, monster: Fighter, cast: Windup, rng: () => number): string {
  switch (cast.kind) {
    case "swing": {
      for (const unit of unitsIn(state, cast.cells, monster)) hurt(state, unit, KIT.skeleton.damage, "physical", monster, rng);
      state.fx.push({ kind: "area", cells: cast.cells, tone: "physical", act: "slash" });
      return "The skeleton swung.";
    }
    case "stone": {
      for (const unit of unitsIn(state, cast.cells, monster)) hurt(state, unit, KIT.golem.damage, "earth", monster, rng);
      pour(state, cast.cells, "earth", 0, rng);
      state.fx.push({ kind: "shot", from: spot(monster), to: cast.center, tone: "earth", act: "rock" });
      return "The golem's stone landed.";
    }
    case "spit": {
      const cell = spot(cast.center);
      for (const unit of unitsIn(state, [cell], monster)) hurt(state, unit, KIT.spider.stacks, "poison", monster, rng);
      writeGround(state, cell, "poison", KIT.spider.stacks, rng);
      state.fx.push({ kind: "shot", from: spot(monster), to: cell, tone: "poison", act: "spit" });
      return "The spider spat poison.";
    }
    case "swap":
      return resolveSwap(state, monster, cast.center, rng);
    case "jump": {
      const from = spot(monster);
      monster.x = cast.center.x;
      monster.y = cast.center.y;
      for (const unit of unitsIn(state, cast.cells, monster)) hurt(state, unit, KIT.corpse.damage, "poison", monster, rng, false, true);
      pour(state, cast.cells, "poison", KIT.corpse.stacks, rng);
      state.fx.push({ kind: "shot", from, to: spot(monster), tone: "poison", act: "leap" });
      state.fx.push({ kind: "area", cells: cast.cells, tone: "poison", act: "pop" });
      kill(state, monster, rng);
      return "The corpse burst into poison.";
    }
    case "tongue": {
      const hero = state.hero;
      let target: Fighter | null = null;
      if (hero.hp > 0 && hasCell(cast.cells, hero)) target = hero;
      else {
        const caught = unitsIn(state, cast.cells, monster).filter((unit) => unit !== hero);
        const plain = caught.filter((unit) => !specOf(unit)?.rare);
        target = pick(plain.length > 0 ? plain : caught, rng);
      }
      if (!target) return "The tongue caught nothing.";
      const from = spot(target);
      stunUnit(state, target, KIT.chest.stun);
      if (target.root === 0) {
        const pull = beside(state, monster, target);
        if (pull) {
          target.x = pull.x;
          target.y = pull.y;
          if (target === hero) takeGold(state);
        }
      }
      state.fx.push({ kind: "line", from: spot(monster), to: from, tone: "control", act: "tongue" });
      return target === hero ? "The tongue caught the hero." : "The tongue caught a monster.";
    }
    case "spires": {
      for (const unit of unitsIn(state, cast.cells, monster)) {
        hurt(state, unit, KIT.acolyte.damage, "physical", monster, rng);
        if (unit.hp > 0) unit.root = Math.max(unit.root, KIT.acolyte.root);
      }
      state.fx.push({ kind: "area", cells: cast.cells, tone: "physical", act: "spires" });
      return "Spires locked the ground.";
    }
    case "beam": {
      for (const unit of unitsIn(state, cast.cells, monster)) hurt(state, unit, KIT.whisper.beam, "ice", monster, rng);
      pour(state, cast.cells, "ice", 0, rng);
      monster.cooldowns.beam = KIT.whisper.beamCooldown + 1;
      const end = cast.cells[cast.cells.length - 1] ?? cast.center;
      state.fx.push({ kind: "line", from: spot(monster), to: end, tone: "ice", act: "beam" });
      return "Ice beam.";
    }
    case "throw": {
      const target = cast.target;
      if (!target || target.hp <= 0 || target.mode !== "held") return "";
      const from = spot(target);
      target.mode = "ground";
      arrive(state, target, cast.center, rng);
      const before = state.hero.hp;
      for (const unit of unitsIn(state, cast.cells, monster)) hurt(state, unit, KIT.drowned.throwDamage, "water", monster, rng);
      if (state.hero.hp > 0 && state.hero.hp < before) stunUnit(state, state.hero, KIT.drowned.throwStun);
      pour(state, cast.cells, "water", 0, rng);
      state.fx.push({ kind: "shot", from, to: spot(target), tone: "water", act: "throw" });
      state.fx.push({ kind: "area", cells: cast.cells, tone: "water", act: "splash" });
      return "The drowned threw the creature.";
    }
    case "fuse": {
      for (const unit of unitsIn(state, cast.cells, monster)) {
        if (unit.role !== "mushroom") hurt(state, unit, KIT.spore.damage, "poison", monster, rng, false, true);
      }
      pour(state, cast.cells, "poison", KIT.spore.stacks, rng);
      state.fx.push({ kind: "area", cells: cast.cells, tone: "poison", act: "pop" });
      kill(state, monster, rng);
      return "The spore burst.";
    }
    case "appear": {
      const from = monster.anchor ?? spot(monster);
      monster.mode = "ground";
      arrive(state, monster, cast.center, rng);
      for (const unit of unitsIn(state, cast.cells, monster)) hurt(state, unit, KIT.ember.damage, "fire", monster, rng);
      pour(state, cast.cells, "fire", 0, rng);
      state.fx.push({ kind: "blink", from, to: spot(monster), act: "flare" });
      state.fx.push({ kind: "area", cells: cast.cells, tone: "fire", act: "flare" });
      return "The ember flared nearby.";
    }
    case "emerge": {
      monster.mode = "ground";
      arrive(state, monster, cast.center, rng);
      const hit = unitsIn(state, cast.cells, monster);
      for (const unit of hit) hurt(state, unit, KIT.worm.damage, "earth", monster, rng);
      pour(state, cast.cells, "earth", 0, rng);
      for (const unit of hit) knock(state, unit, cast.center, KIT.worm.push, rng);
      monster.cooldowns.dig = KIT.worm.cooldown;
      state.fx.push({ kind: "area", cells: cast.cells, tone: "earth", act: "emerge" });
      return "The worm surfaced.";
    }
    case "charge": {
      const from = spot(monster);
      const cell = spot(cast.center);
      for (const unit of unitsIn(state, [cell], monster)) hurt(state, unit, KIT.dog.damage, "physical", monster, rng);
      arrive(state, monster, cell, rng);
      faceToward(monster, cell);
      state.fx.push({ kind: "dash", from, to: spot(monster), tone: "physical", act: "dash" });
      return "The hound crashed in.";
    }
    case "rush": {
      const from = spot(monster);
      for (const cell of cast.cells) {
        for (const unit of unitsIn(state, [cell], monster)) hurt(state, unit, KIT.hound.damage, "fire", monster, rng);
      }
      pour(state, cast.cells, "fire", 0, rng);
      const land = houndStop(state, monster, cast.cells);
      if (land) {
        for (const cell of cast.cells) {
          breakObject(state, cell, rng);
          if (sameCell(cell, land)) break;
        }
        arrive(state, monster, land, rng);
      }
      state.fx.push({ kind: "dash", from, to: spot(monster), tone: "fire", act: "dash" });
      state.fx.push({ kind: "area", cells: [...cast.cells], tone: "fire", act: "flare" });
      return "The ash hound rushed.";
    }
    case "pounce": {
      const from = spot(monster);
      const hit = unitsIn(state, cast.cells, monster);
      for (const unit of hit) hurt(state, unit, KIT.goblin.damage, "physical", monster, rng);
      arrive(state, monster, cast.center, rng);
      state.fx.push({ kind: "dash", from, to: spot(monster), tone: "physical", act: "dash" });
      return hit.length > 0 ? "The goblin struck." : "The goblin leaped.";
    }
    case "wisp": {
      const from = spot(monster);
      const cell = spot(cast.center);
      const hit = unitsIn(state, cast.cells, monster);
      for (const unit of hit) hurt(state, unit, KIT.spirit.damage, "physical", monster, rng);
      arrive(state, monster, cell, rng);
      faceToward(monster, state.hero);
      state.fx.push({ kind: "blink", from, to: spot(monster), act: "wisp" });
      return hit.length > 0 ? "The spirit struck from its blink." : "The spirit appeared.";
    }
    case "land": {
      monster.mode = "ground";
      monster.phase = 0;
      arrive(state, monster, cast.center, rng);
      const hit = unitsIn(state, cast.cells, monster);
      for (const unit of hit) hurt(state, unit, KIT.gargoyle.land, "physical", monster, rng);
      for (const unit of hit) knock(state, unit, cast.center, KIT.gargoyle.landPush, rng);
      monster.cooldowns.flight = KIT.gargoyle.rest;
      state.fx.push({ kind: "area", cells: cast.cells, tone: "physical", act: "land" });
      return "The gargoyle landed.";
    }
  }
}

export function resolveHazard(state: RoomState, hazard: Hazard, rng: () => number): string {
  const owner = hazard.owner;
  if (hazard.kind === "rock") {
    const hero = state.hero;
    const heroHit = hero.hp > 0 && hasCell(hazard.cells, hero);
    for (const unit of unitsIn(state, hazard.cells, owner)) hurt(state, unit, KIT.gargoyle.stone, "earth", owner, rng);
    pour(state, hazard.cells, "earth", 0, rng);
    const from = owner.anchor ?? spot(owner);
    if (heroHit && hero.hp > 0) knock(state, hero, from, KIT.gargoyle.stonePush, rng, DIRS[BACK[hero.facing]]);
    state.fx.push({ kind: "shot", from, to: hazard.center, tone: "earth", act: "fall" });
    touchKegs(state, hazard.cells, rng);
    return "A stone from above.";
  }
  const water = hazard.kind === "geyser";
  const type: DamageType = water ? "water" : "ice";
  const amount = water ? KIT.drowned.geyser : KIT.whisper.hail;
  for (const unit of unitsIn(state, hazard.cells, owner)) hurt(state, unit, amount, type, owner, rng);
  pour(state, hazard.cells, type, 0, rng);
  state.fx.push({ kind: "area", cells: hazard.cells, tone: type, act: water ? "geyser" : "hail" });
  touchKegs(state, hazard.cells, rng);
  return water ? "Geyser." : "Hail.";
}

/* ---------- ход монстров и тики ---------- */

export function tickRoot(unit: Fighter): void {
  if (unit.root > 0) unit.root -= 1;
}

export function actTurn(state: RoomState, monster: Fighter, rng: () => number): string {
  if (monster.windup) {
    monster.windup.turns -= 1;
    if (monster.windup.turns > 0) return "";
    const cast = monster.windup;
    monster.windup = null;
    return resolveWindup(state, monster, cast, rng);
  }
  if (monster.mode === "sleep") return sleepTurn(monster);
  if (monster.mode === "gone") return emberGone(state, monster, rng);
  if (monster.mode === "under") return wormUnder(state, monster, rng);
  if (monster.mode === "air") return gargoyleAir(state, monster);
  return roleTurn(state, monster, rng);
}

/** Стан пропускает ход и замораживает кулдауны. Иначе кулдауны −1 в начале своего хода. */
export function monsterTurn(state: RoomState, monster: Fighter, rng: () => number): string {
  if (monster.hp <= 0) return "";
  if (monster.mode === "passive") {
    if (manhattan(monster, state.hero) !== 1) return "";
    monster.mode = "ground";
  }
  if (monster.stun > 0) {
    if (monster.freshStun) monster.freshStun = false;
    else {
      monster.stun -= 1;
      if (monster.stun === 0 && monster.maxShield > 0 && monster.shield === 0) {
        monster.shield = monster.maxShield;
        tickRoot(monster);
        return "Stun ended. Shield restored.";
      }
    }
    tickRoot(monster);
    return "";
  }
  for (const ability of Object.keys(monster.cooldowns)) {
    const left = monster.cooldowns[ability] ?? 0;
    if (left > 0) monster.cooldowns[ability] = left - 1;
  }
  if (monster.iceGuard > 0) monster.iceGuard -= 1;
  if (monster.mode === "held") {
    tickRoot(monster);
    return "";
  }
  const note = actTurn(state, monster, rng);
  tickRoot(monster);
  return note;
}

export function tickHazards(state: RoomState, owner: Fighter, rng: () => number): string[] {
  const notes: string[] = [];
  for (const hazard of state.hazards.filter((item) => item.owner === owner)) {
    hazard.turns -= 1;
    if (hazard.turns > 0) continue;
    state.hazards.splice(state.hazards.indexOf(hazard), 1);
    notes.push(resolveHazard(state, hazard, rng));
    if (state.hero.hp <= 0) break;
  }
  return notes;
}

export function monsterPhase(state: RoomState, rng: () => number): string {
  const notes: string[] = [];
  for (const monster of state.monsters.slice()) {
    if (state.hero.hp <= 0 || cleared(state)) break;
    notes.push(...tickHazards(state, monster, rng));
    if (state.hero.hp <= 0) break;
    notes.push(monsterTurn(state, monster, rng));
  }
  return notes.filter((note) => note.length > 0).join(" ");
}
