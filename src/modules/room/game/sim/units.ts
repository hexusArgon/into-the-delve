/** Бойцы на поле и создание комнаты: кто где стоит и что свободно. Часть симуляции комнаты, вход — ../sim.ts. */
import { heroAttributes, monsterAttributes } from "../../data/attributes.ts";
import type { RunAbility } from "../../data/hero-abilities.ts";
import { pointChance } from "../../data/instances.ts";
import { EMPTY_GEAR, type GearBonus, critFactor } from "../../data/items.ts";
import { type DamageType, type MonsterDef, monsterById } from "../../data/monsters.ts";
import type { Door, RoomPattern, Spawn } from "../../data/rooms.ts";
import { type WeaponId, weaponById } from "../../data/weapons.ts";
import { threatFactor } from "../adventure.ts";
import { BLINK_CHARGES, BLINK_RANGE, HERO_CRIT_CHANCE, HERO_HP, HERO_MP, METER_STEP } from "../rules.ts";
import { buildLayout, hasCell, inDiamond, isBlocked, isFloor } from "./geometry.ts";
import { kegAt } from "./monster-casters.ts";
import type { Cell, Fighter, GroundCell, Mode, Outcome, RoomState } from "./types.ts";
import { attackStep } from "./weapon-cells.ts";

export type FighterBase = Pick<
  Fighter,
  "x" | "y" | "facing" | "hp" | "maxHp" | "shield" | "maxShield" | "body" | "kind" | "name" | "attrs" | "role"
>;

export function fighter(base: FighterBase, mode: Mode): Fighter {
  return {
    ...base,
    stun: 0,
    freshStun: false,
    burn: 0,
    oil: 0,
    wet: 0,
    poison: 0,
    poisonWindow: 0,
    poisonPace: 0,
    root: 0,
    silence: 0,
    iceGuard: 0,
    cooldowns: {},
    windup: null,
    mode,
    spent: false,
    phase: 0,
    anchor: null,
    charmers: [],
  };
}

export function monsterFighter(spec: MonsterDef | undefined, at: Spawn, alive: boolean, adventure = 0): Fighter {
  const live = Boolean(spec) && alive;
  const factor = threatFactor(adventure);
  const maxHp = spec ? Math.round(spec.maxHp * factor) : 0;
  return fighter(
    {
      x: at.x,
      y: at.y,
      facing: at.facing,
      hp: spec && live ? maxHp : 0,
      maxHp,
      shield: spec && live ? spec.shield : 0,
      maxShield: spec?.shield ?? 0,
      body: spec?.body ?? "flesh",
      kind: spec && live ? spec.id : "",
      name: spec && live ? spec.name : "",
      attrs: monsterAttributes(spec?.maxHp ?? 0, spec?.bite ?? 0),
      role: spec?.role ?? "skeleton",
    },
    spec?.role === "chest" ? "passive" : "ground",
  );
}

export function roomMonsters(state: RoomState): Fighter[] {
  return state.monsters;
}

export function livingMonsters(state: RoomState): Fighter[] {
  return state.monsters.filter((monster) => monster.hp > 0);
}

/** Юнит на поле: его можно ударить, он занимает клетку. Червь под землёй, исчезнувший уголёк и страж в полёте — нет. */
export function onBoard(unit: Fighter): boolean {
  return unit.hp > 0 && unit.mode !== "under" && unit.mode !== "gone" && unit.mode !== "air";
}

export function boardUnits(state: RoomState): Fighter[] {
  const units: Fighter[] = [];
  if (state.hero.hp > 0) units.push(state.hero);
  for (const monster of state.monsters) if (onBoard(monster)) units.push(monster);
  return units;
}

export function unitsIn(state: RoomState, cells: readonly Cell[], except: Fighter | null = null): Fighter[] {
  return boardUnits(state).filter((unit) => unit !== except && hasCell(cells, unit));
}

/** Diamond Blink без траты заряда. Leap садится сюда же. */
export function landingCells(state: RoomState): Cell[] {
  if (state.outcome === "lost" || state.hero.root > 0) return [];
  const cells: Cell[] = [];
  for (let y = 0; y < state.room.h; y += 1) {
    for (let x = 0; x < state.room.w; x += 1) {
      if (isBlocked(state.room, x, y) || kegAt(state, x, y)) continue;
      if (x === state.hero.x && y === state.hero.y) continue;
      if (occupied(state, x, y)) continue;
      if (inDiamond(state.hero, { x, y }, BLINK_RANGE)) cells.push({ x, y });
    }
  }
  return cells;
}

export function blinkCells(state: RoomState): Cell[] {
  if (state.blink <= 0) return [];
  return landingCells(state);
}

export interface RoomEntry {
  exits?: readonly Door[];
  /** Где встаёт герой. Без этого — точка начала этажа из паттерна. */
  hero?: Spawn;
  heroHp?: number;
  /** Есть ли в комнате живой монстр. В зачищенной комнате его нет. */
  monster?: boolean;
  weapon?: WeaponId;
  /** Остаток магазина. Без поля огнестрел входит с полным магазином. */
  ammo?: number | null;
  /** Id из таблицы монстров. В стартовой комнате монстр мёртв, id не нужен. */
  monsterKind?: string;
  /** Надетая экипировка. Empty — герой без прибавок. Очки уклонения и крита, не готовый шанс. */
  gear?: GearBonus;
  /** Damage попадания надетого экземпляра. Без поля — база каталога. */
  weaponHit?: number | null;
  abilities?: readonly (RunAbility | null)[];
  abilityCd?: Readonly<Record<string, number>>;
  /** Уровень приключения. Множит HP и урон монстров. */
  adventure?: number;
}

export function createRoom(pattern: RoomPattern, entry: RoomEntry = {}): RoomState {
  const spawn = entry.hero ?? pattern.hero;
  const alive = entry.monster ?? true;
  const gear = entry.gear ?? EMPTY_GEAR;
  const maxHp = HERO_HP + gear.maxHp;
  const hp = entry.heroHp ?? maxHp;
  const spec = (entry.monsterKind ? monsterById(entry.monsterKind) : undefined) ?? monsterById("7");
  const adventure = entry.adventure ?? 0;
  const monster = monsterFighter(spec, pattern.monster, alive, adventure);
  const room = buildLayout(pattern);
  const attrs = heroAttributes();
  attrs.MaxHp = maxHp;
  attrs.Hp = hp;
  attrs.MaxMp = HERO_MP + gear.maxMp;
  attrs.DEF = gear.phys;
  attrs.MDEF = 0;
  attrs.FireRes = gear.fireRes;
  attrs.EarthRes = gear.earthRes;
  attrs.PosionRes = gear.poisonRes;
  attrs.WaterRes = gear.waterRes;
  attrs.IceRes = gear.iceRes;
  const hero = fighter(
    {
      x: spawn.x,
      y: spawn.y,
      facing: spawn.facing,
      hp,
      maxHp,
      shield: 0,
      maxShield: 0,
      body: "flesh",
      kind: "",
      name: "",
      attrs,
      role: "hero",
    },
    "ground",
  );
  for (const ability of entry.abilities ?? []) {
    if (!ability) continue;
    hero.cooldowns[ability.id] = entry.abilityCd?.[ability.id] ?? 0;
  }
  return {
    room,
    exits: entry.exits ?? [],
    leaving: null,
    hero,
    monster,
    monsters: [monster],
    hazards: [],
    ground: new Array<GroundCell | null>(room.w * room.h).fill(null),
    bodies: [],
    blink: BLINK_CHARGES,
    mp: HERO_MP + gear.maxMp,
    maxMp: HERO_MP + gear.maxMp,
    meterTurns: 0,
    meterLevel: 0,
    outcome: alive ? "play" : "won",
    fx: [],
    hits: [],
    pitDrop: null,
    barrels: [],
    kegs: [],
    furniture: [],
    chairs: [],
    chests: [],
    broken: [],
    piles: [],
    loot: [],
    pending: [],
    spoilNames: [],
    adventure,
    found: [],
    drops: [],
    strike: null,
    carried: 0,
    weapon: entry.weapon ?? "sword",
    ammo: entry.ammo !== undefined ? entry.ammo : weaponById(entry.weapon ?? "sword").magazine,
    weaponPower: gear.weaponPower,
    abilityPower: gear.abilityPower,
    bonusDamage: {
      physical: gear.physDmg,
      fire: gear.fireDmg,
      earth: gear.earthDmg,
      poison: gear.poisonDmg,
      water: gear.waterDmg,
      ice: gear.iceDmg,
    },
    dodge: pointChance(gear.dodge),
    critChance: Math.min(1, HERO_CRIT_CHANCE + pointChance(gear.critChance)),
    critShare: gear.critShare,
    weaponHit: entry.weaponHit === undefined ? null : entry.weaponHit,
    abilities: [...(entry.abilities ?? [])],
    aim: null,
    look: null,
    ward: null,
    blizzard: null,
    quakes: [],
    note: alive ? weaponById(entry.weapon ?? "sword").figure : "Nothing here. The doors are open.",
  };
}

/** Клетку держит живой монстр на поле или тело, убитое в этот ход. */
export function occupied(state: RoomState, x: number, y: number): boolean {
  if (state.bodies.some((body) => body.x === x && body.y === y)) return true;
  return state.monsters.some((monster) => onBoard(monster) && monster.x === x && monster.y === y);
}

/** Клетка героя, другого монстра или тела, которое ещё лежит в этом ходу. */
export function taken(state: RoomState, x: number, y: number): boolean {
  return (state.hero.hp > 0 && state.hero.x === x && state.hero.y === y) || occupied(state, x, y);
}

/** Свободный пол: сюда можно встать, сюда можно отбросить. */
export function vacant(state: RoomState, x: number, y: number): boolean {
  return isFloor(state.room, x, y) && !isBlocked(state.room, x, y) && !taken(state, x, y) && !kegAt(state, x, y);
}

/** Dungeon пройдена, когда не осталось живых монстров. Споры дверь не держат. */
export function cleared(state: RoomState): boolean {
  return state.monsters.every((monster) => monster.hp <= 0 || monster.role === "spore");
}

export function finish(state: RoomState): Outcome {
  if (state.hero.hp <= 0) {
    state.hero.hp = 0;
    state.outcome = "lost";
    state.note = "The run is over.";
    return state.outcome;
  }
  if (cleared(state)) {
    const fresh = state.outcome !== "won";
    for (const monster of state.monsters) {
      monster.hp = 0;
      monster.windup = null;
      monster.charmers = [];
    }
    state.hazards = [];
    state.ground.fill(null);
    state.outcome = "won";
    if (fresh) state.blink += 1;
  }
  return state.outcome;
}

export function tickMeter(state: RoomState, refreshed: boolean): void {
  if (refreshed || state.meterTurns <= 0) return;
  state.meterTurns -= 1;
  if (state.meterTurns === 0) state.meterLevel = 0;
}

/** Число пассивки до щита, крита, силы оружия и процента урона. */
export function passiveAmount(state: RoomState, target: Fighter, targets: readonly Fighter[]): number {
  const weapon = weaponById(state.weapon);
  const base = state.weaponHit === null ? weapon.hitDamage : state.weaponHit;
  if (weapon.id === "axe") return base - 10 * (targets.length - 1);
  if (weapon.id === "spear") return inFront(state, target) ? 60 : 100;
  if (weapon.id === "shotgun") return inFront(state, target) ? 180 : 80;
  return base;
}

export function dealtHit(state: RoomState, passive: number): number {
  const hit = passive + state.weaponPower + state.meterLevel * METER_STEP;
  return hit * critFactor(state.critChance, state.critShare);
}

export function inFront(state: RoomState, target: Fighter): boolean {
  const step = attackStep(state);
  return target.x === state.hero.x + step.x && target.y === state.hero.y + step.y;
}

export function faceToward(unit: Fighter, target: Cell): void {
  if (target.x < unit.x) unit.facing = "left";
  else if (target.x > unit.x) unit.facing = "right";
}

export function specOf(unit: Fighter): MonsterDef | undefined {
  return unit.kind ? monsterById(unit.kind) : undefined;
}

export function immuneTo(unit: Fighter, type: DamageType): boolean {
  return specOf(unit)?.immune.includes(type) ?? false;
}

export function ready(unit: Fighter, ability: string): boolean {
  return (unit.cooldowns[ability] ?? 0) === 0;
}

export function pick<T>(items: readonly T[], rng: () => number): T | null {
  if (items.length === 0) return null;
  return items[Math.floor(rng() * items.length)] ?? items[0] ?? null;
}

/* ---------- клетки стихий ---------- */
