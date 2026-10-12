import { heroAttributes, monsterAttributes, type Attributes } from "../data/attributes.ts";
import { ELEMENTS, KIT, MONSTER_GOLD, RARE_GOLD, SPORE, monsterById, type DamageType, type MonsterDef, type MonsterRole } from "../data/monsters.ts";
import type { BodyKind, Decor, Door, Facing, RoomPattern, RoomTheme, Side, Spawn, Stamp } from "../data/rooms.ts";
import { EMPTY_GEAR, critFactor, type GearBonus } from "../data/items.ts";
import { weaponById, type WeaponId } from "../data/weapons.ts";
import {
  BLINK_CHARGES,
  BLINK_RANGE,
  HERO_HP,
  METER_STEP,
  PIT_HP_SHARE,
  METER_TURNS,
  STUN_TURNS,
  armorFactor,
} from "./rules.ts";

export type Dir = Facing;

export interface Cell {
  x: number;
  y: number;
}

export const DIRS: Record<Dir, Cell> = {
  up: { x: 0, y: -1 },
  down: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
};

const BACK: Record<Dir, Dir> = { up: "down", down: "up", left: "right", right: "left" };

export const SIDE_FACING: Record<Side, Dir> = { north: "up", south: "down", east: "right", west: "left" };
export const OPPOSITE: Record<Side, Side> = { north: "south", south: "north", east: "west", west: "east" };

/** Клетка проёма двери: за краем пола в сторону двери. */
export function doorway(door: Door): Cell {
  const step = DIRS[SIDE_FACING[door.side]];
  return { x: door.x + step.x, y: door.y + step.y };
}

/**
 * Где сейчас юнит. Пассивный сундук ждёт, кровосос спит, уголёк исчез,
 * червь под землёй, страж в полёте, утопленник держит существо для броска.
 */
export type Mode = "ground" | "passive" | "sleep" | "gone" | "under" | "air" | "held";

export type WindupKind =
  | "swing"
  | "stone"
  | "jump"
  | "tongue"
  | "spires"
  | "beam"
  | "throw"
  | "fuse"
  | "appear"
  | "emerge"
  | "land"
  | "charge";

/** Отложенный удар. Владелец ждёт, срабатывание — его ход. Стан или смерть владельца удар отменяют. */
export interface Windup {
  kind: WindupKind;
  /** Ходов владельца до срабатывания. Цифра на клетках. */
  turns: number;
  cells: Cell[];
  center: Cell;
  /** Кого держит утопленник до броска. */
  target: Fighter | null;
}

/** Удар, который идёт сам, пока владелец свободен: кольца гейзеров и града, камни стража. */
export interface Hazard {
  owner: Fighter;
  kind: "geyser" | "hail" | "rock";
  turns: number;
  cells: Cell[];
  center: Cell;
}

export type GroundKind = "fire" | "oil" | "poison" | "water" | "ice";

export interface GroundCell {
  kind: GroundKind;
  /** Стаки яда. У других стихий 0. */
  stacks: number;
  /** Ходов, пока лужа ещё лежит. В конце хода, когда стало 0, клетка пустеет. */
  turns: number;
}

export interface Fighter {
  x: number;
  y: number;
  facing: Dir;
  hp: number;
  maxHp: number;
  shield: number;
  maxShield: number;
  stun: number;
  /** Тело под щитом. Пока щит цел, удар звучит как железо. */
  body: BodyKind;
  /** Id из таблицы монстров. Пусто у героя. */
  kind: string;
  name: string;
  attrs: Attributes;
  role: MonsterRole | "hero";
  /** Ход срыва щита не списывает стан: иначе из двух ходов остаётся один. */
  freshStun: boolean;
  burn: number;
  oil: number;
  wet: number;
  poison: number;
  /** Тиков до сгорания стаков яда. */
  poisonWindow: number;
  /** Ходов с прошлого снятия стака яда. Стак −1 раз в poisonStep ходов. */
  poisonPace: number;
  /** Обездвиживание шпилей: бить и кастовать можно, шагать и блинковать нельзя. Это не стан. */
  root: number;
  /** Кулдаун ледяного стана. */
  iceGuard: number;
  cooldowns: Record<string, number>;
  windup: Windup | null;
  mode: Mode;
  /** Кровосос уже спал, мертвец уже прыгнул. */
  spent: boolean;
  /** Ходы паузы уголька, камни стража в этом полёте. */
  phase: number;
  /** Клетка, откуда исчез уголёк или взлетел страж. */
  anchor: Cell | null;
  /** Шёпоты, очаровавшие этого монстра. */
  charmers: Fighter[];
}

export interface RoomLayout {
  id: string;
  name: string;
  w: number;
  h: number;
  floor: Uint8Array;
  blocked: Uint8Array;
  walls: Uint8Array;
  pits: Uint8Array;
  stamps: readonly Stamp[];
  decor: readonly Decor[];
  theme: RoomTheme;
  spawns: readonly Cell[];
}

export type Outcome = "play" | "won" | "lost";

export type FxTone = DamageType | "control";

/** Какая способность рисуется. Без метки остаётся общий рисунок стихии. */
export type AbilityAct =
  | "dash"
  | "spit"
  | "leap"
  | "rock"
  | "swoop"
  | "slime"
  | "slash"
  | "wisp"
  | "spore"
  | "pop"
  | "vanish"
  | "flare"
  | "dig"
  | "emerge"
  | "spires"
  | "tongue"
  | "fall"
  | "land"
  | "geyser"
  | "throw"
  | "splash"
  | "charm"
  | "hail"
  | "beam"
  | "shards"
  | "sleep";

/** Короткий рисунок способности. Укус сюда не входит. */
export type AbilityFx =
  | { kind: "shot"; from: Cell; to: Cell; tone: FxTone; act?: AbilityAct }
  | { kind: "dash"; from: Cell; to: Cell; tone: FxTone; act?: AbilityAct }
  | { kind: "move"; from: Cell; to: Cell; act?: AbilityAct }
  | { kind: "blink"; from: Cell; to: Cell; act?: AbilityAct }
  | { kind: "area"; cells: Cell[]; tone: FxTone; act?: AbilityAct }
  | { kind: "line"; from: Cell; to: Cell; tone: FxTone; act?: AbilityAct };

export interface RoomState {
  room: RoomLayout;
  /** Двери, которые на этом этаже ведут в соседние комнаты. */
  exits: readonly Door[];
  /** Сторона двери, в которую герой только что вышел. Этаж переводит его в соседнюю комнату. */
  leaving: Side | null;
  hero: Fighter;
  /** Первый монстр комнаты: тот же объект, что monsters[0]. */
  monster: Fighter;
  /** Монстры в порядке появления. Ходят в этом порядке, споры дописываются в конец. */
  monsters: Fighter[];
  hazards: Hazard[];
  /** Стихия клетки, индекс y·w+x. На клетке одна стихия. Новая лужа живёт 5 ходов. */
  ground: (GroundCell | null)[];
  /** Клетки, где в этот ход монстра уже убили. Пока герой не походил снова, сюда не встают. */
  bodies: Cell[];
  blink: number;
  meterTurns: number;
  meterLevel: number;
  outcome: Outcome;
  note: string;
  /** Рисунок только что сработавших способностей. Вид забирает и очищает. */
  fx: AbilityFx[];
  /** Клетка обрыва, в которую герой только что шагнул. Вид проигрывает падение. */
  pitDrop: Cell | null;
  /** Бочки, которые ещё можно разбить шагом или ударом по клетке. */
  barrels: Cell[];
  /** Столы и полки. Не ломаются. */
  furniture: { kind: "table" | "shelf"; x: number; y: number; w: number; h: number }[];
  /** Стулья. Как бочки: шаг или удар по клетке ломает стул. */
  chairs: Cell[];
  /** Ключи уже разбитых бочек, чтобы комната помнила их после ухода. */
  broken: string[];
  /** Золото на полу. Каждая запись — одна монета. */
  piles: Cell[];
  /** Монеты, которые только что вылетели из бочки. Вид забирает их в кадр полёта. */
  drops: { from: Cell; to: Cell }[];
  /** Укус монстра вплотную. Вид проигрывает выпад и отшат. */
  strike: { from: Cell; to: Cell } | null;
  /** Подобранное золото. Живёт весь забег. */
  carried: number;
  weapon: WeaponId;
  /** Патроны в магазине. Пусто у оружия без магазина. */
  ammo: number | null;
  /** Прибавка к каждому попаданию оружия. */
  weaponPower: number;
  /** Шанс полностью избежать удара. Складывается, выше 1 не растёт. */
  dodge: number;
  critChance: number;
  critShare: number;
}

const ORTHO: Cell[] = [
  { x: 1, y: 0 },
  { x: -1, y: 0 },
  { x: 0, y: 1 },
  { x: 0, y: -1 },
];

const DIAGONAL: Cell[] = [
  { x: 1, y: 1 },
  { x: -1, y: 1 },
  { x: 1, y: -1 },
  { x: -1, y: -1 },
];

const AROUND: Cell[] = [...ORTHO, ...DIAGONAL];

export function buildLayout(pattern: RoomPattern): RoomLayout {
  const floor = new Uint8Array(pattern.w * pattern.h).fill(1);
  const blocked = new Uint8Array(pattern.w * pattern.h);
  const walls = new Uint8Array(pattern.w * pattern.h);
  const pits = new Uint8Array(pattern.w * pattern.h);
  if (pattern.shape) {
    for (let y = 0; y < pattern.h; y += 1) {
      const row = pattern.shape[y] ?? "";
      for (let x = 0; x < pattern.w; x += 1) {
        if (row[x] === ".") continue;
        floor[y * pattern.w + x] = 0;
        blocked[y * pattern.w + x] = 1;
      }
    }
  }
  for (const stamp of pattern.stamps) {
    for (let y = stamp.y; y < stamp.y + stamp.h; y += 1) {
      for (let x = stamp.x; x < stamp.x + stamp.w; x += 1) {
        if (x < 0 || y < 0 || x >= pattern.w || y >= pattern.h) continue;
        blocked[y * pattern.w + x] = 1;
        if (stamp.kind === "wall") walls[y * pattern.w + x] = 1;
        if (stamp.kind === "pit") pits[y * pattern.w + x] = 1;
      }
    }
  }
  return {
    id: pattern.id,
    name: pattern.name,
    w: pattern.w,
    h: pattern.h,
    floor,
    blocked,
    walls,
    pits,
    stamps: pattern.stamps,
    decor: pattern.decor,
    theme: pattern.theme ?? "crypt",
    spawns: [pattern.hero, pattern.monster],
  };
}

export function inRoom(room: RoomLayout, x: number, y: number): boolean {
  return x >= 0 && y >= 0 && x < room.w && y < room.h;
}

export function isBlocked(room: RoomLayout, x: number, y: number): boolean {
  return !inRoom(room, x, y) || room.blocked[y * room.w + x] === 1;
}

/** Пол комнаты, включая клетки под штампами. Пустота силуэта и всё за краем — не пол. */
export function isFloor(room: RoomLayout, x: number, y: number): boolean {
  return inRoom(room, x, y) && room.floor[y * room.w + x] === 1;
}

export function isWallCell(room: RoomLayout, x: number, y: number): boolean {
  return inRoom(room, x, y) && room.walls[y * room.w + x] === 1;
}

export function isPit(room: RoomLayout, x: number, y: number): boolean {
  return inRoom(room, x, y) && room.pits[y * room.w + x] === 1;
}

function chebyshev(a: Cell, b: Cell): number {
  return Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
}

function manhattan(a: Cell, b: Cell): number {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
}

function sameCell(a: Cell, b: Cell): boolean {
  return a.x === b.x && a.y === b.y;
}

function hasCell(cells: readonly Cell[], cell: Cell): boolean {
  return cells.some((item) => sameCell(item, cell));
}

function spot(cell: Cell): Cell {
  return { x: cell.x, y: cell.y };
}

/** Выбор клетки Blink: ромб, не круг и не квадрат. */
export function inDiamond(a: Cell, b: Cell, range: number): boolean {
  return manhattan(a, b) <= range;
}

/** Шагов до цели в обход препятствий, -1 если не дойти. */
export function distancesTo(room: RoomLayout, target: Cell): Int16Array {
  const dist = new Int16Array(room.w * room.h).fill(-1);
  if (isBlocked(room, target.x, target.y)) return dist;
  const start = target.y * room.w + target.x;
  dist[start] = 0;
  const queue = [start];
  for (let head = 0; head < queue.length; head += 1) {
    const current = queue[head]!;
    const cx = current % room.w;
    const cy = (current - cx) / room.w;
    for (const step of ORTHO) {
      const nx = cx + step.x;
      const ny = cy + step.y;
      if (isBlocked(room, nx, ny)) continue;
      const next = ny * room.w + nx;
      if (dist[next] !== -1) continue;
      dist[next] = dist[current]! + 1;
      queue.push(next);
    }
  }
  return dist;
}

export function swordCells(state: RoomState): Cell[] {
  return fanCells(state, 1);
}

/** Сколько выстрелов осталось. Пусто — это не огнестрел. */
export function shotsLeft(state: RoomState): number | null {
  const magazine = weaponById(state.weapon).magazine;
  if (magazine === null) return null;
  return state.ammo ?? magazine;
}

/** Клетки удара надетого оружия. Пустой магазин не стреляет, пока его не перезарядят. */
export function attackCells(state: RoomState): Cell[] {
  if (shotsLeft(state) === 0) return [];
  const weapon = weaponById(state.weapon);
  if (weapon.shape === "fan") return fanCells(state, weapon.range);
  if (weapon.shape === "around") return aroundCells(state);
  return lineCells(state, weapon.range);
}

/** Веер шириной 3 на `depth` клеток вперёд. Стена обрывает свой луч. */
function fanCells(state: RoomState, depth: number): Cell[] {
  const hero = state.hero;
  const step = DIRS[hero.facing];
  const side = hero.facing === "up" || hero.facing === "down" ? { x: 1, y: 0 } : { x: 0, y: 1 };
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

function aroundCells(state: RoomState): Cell[] {
  const cells: Cell[] = [];
  for (const step of AROUND) {
    const x = state.hero.x + step.x;
    const y = state.hero.y + step.y;
    if (isBlocked(state.room, x, y)) continue;
    cells.push({ x, y });
  }
  return cells;
}

function lineCells(state: RoomState, reach: number): Cell[] {
  const step = DIRS[state.hero.facing];
  const cells: Cell[] = [];
  for (let i = 1; i <= reach; i += 1) {
    const x = state.hero.x + step.x * i;
    const y = state.hero.y + step.y * i;
    if (isBlocked(state.room, x, y)) break;
    cells.push({ x, y });
  }
  return cells;
}

type FighterBase = Pick<
  Fighter,
  "x" | "y" | "facing" | "hp" | "maxHp" | "shield" | "maxShield" | "body" | "kind" | "name" | "attrs" | "role"
>;

function fighter(base: FighterBase, mode: Mode): Fighter {
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

export function monsterFighter(spec: MonsterDef | undefined, at: Spawn, alive: boolean): Fighter {
  const live = Boolean(spec) && alive;
  return fighter(
    {
      x: at.x,
      y: at.y,
      facing: at.facing,
      hp: spec && live ? spec.maxHp : 0,
      maxHp: spec?.maxHp ?? 0,
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

function boardUnits(state: RoomState): Fighter[] {
  const units: Fighter[] = [];
  if (state.hero.hp > 0) units.push(state.hero);
  for (const monster of state.monsters) if (onBoard(monster)) units.push(monster);
  return units;
}

function unitsIn(state: RoomState, cells: readonly Cell[], except: Fighter | null = null): Fighter[] {
  return boardUnits(state).filter((unit) => unit !== except && hasCell(cells, unit));
}

export function blinkCells(state: RoomState): Cell[] {
  if (state.blink <= 0 || state.outcome === "lost" || state.hero.root > 0) return [];
  const cells: Cell[] = [];
  for (let y = 0; y < state.room.h; y += 1) {
    for (let x = 0; x < state.room.w; x += 1) {
      if (isBlocked(state.room, x, y)) continue;
      if (x === state.hero.x && y === state.hero.y) continue;
      if (occupied(state, x, y)) continue;
      if (inDiamond(state.hero, { x, y }, BLINK_RANGE)) cells.push({ x, y });
    }
  }
  return cells;
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
  /** Надетая экипировка. Пусто — герой без прибавок. */
  gear?: GearBonus;
}

export function createRoom(pattern: RoomPattern, entry: RoomEntry = {}): RoomState {
  const spawn = entry.hero ?? pattern.hero;
  const alive = entry.monster ?? true;
  const gear = entry.gear ?? EMPTY_GEAR;
  const maxHp = HERO_HP + gear.maxHp;
  const hp = entry.heroHp ?? maxHp;
  const spec = (entry.monsterKind ? monsterById(entry.monsterKind) : undefined) ?? monsterById("7");
  const monster = monsterFighter(spec, pattern.monster, alive);
  const room = buildLayout(pattern);
  const attrs = heroAttributes();
  attrs.MaxHp = maxHp;
  attrs.Hp = hp;
  attrs.DEF = gear.phys;
  attrs.MDEF = gear.elem;
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
    meterTurns: 0,
    meterLevel: 0,
    outcome: alive ? "play" : "won",
    fx: [],
    pitDrop: null,
    barrels: [],
    furniture: [],
    chairs: [],
    broken: [],
    piles: [],
    drops: [],
    strike: null,
    carried: 0,
    weapon: entry.weapon ?? "sword",
    ammo: entry.ammo !== undefined ? entry.ammo : weaponById(entry.weapon ?? "sword").magazine,
    weaponPower: gear.weaponPower,
    dodge: gear.dodge,
    critChance: gear.critChance,
    critShare: gear.critShare,
    note: alive ? weaponById(entry.weapon ?? "sword").figure : "Здесь пусто. Двери открыты.",
  };
}

/** Клетку держит живой монстр на поле или тело, убитое в этот ход. */
function occupied(state: RoomState, x: number, y: number): boolean {
  if (state.bodies.some((body) => body.x === x && body.y === y)) return true;
  return state.monsters.some((monster) => onBoard(monster) && monster.x === x && monster.y === y);
}

/** Клетка героя, другого монстра или тела, которое ещё лежит в этом ходу. */
function taken(state: RoomState, x: number, y: number): boolean {
  return (state.hero.hp > 0 && state.hero.x === x && state.hero.y === y) || occupied(state, x, y);
}

/** Свободный пол: сюда можно встать, сюда можно отбросить. */
function vacant(state: RoomState, x: number, y: number): boolean {
  return isFloor(state.room, x, y) && !isBlocked(state.room, x, y) && !taken(state, x, y);
}

/** Комната пройдена, когда не осталось живых монстров. Споры дверь не держат. */
function cleared(state: RoomState): boolean {
  return state.monsters.every((monster) => monster.hp <= 0 || monster.role === "spore");
}

function finish(state: RoomState): Outcome {
  if (state.hero.hp <= 0) {
    state.hero.hp = 0;
    state.outcome = "lost";
    state.note = "Забег оборвался.";
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

function tickMeter(state: RoomState, refreshed: boolean): void {
  if (refreshed || state.meterTurns <= 0) return;
  state.meterTurns -= 1;
  if (state.meterTurns === 0) state.meterLevel = 0;
}

function swordDamage(state: RoomState): number {
  const hit = weaponById(state.weapon).hitDamage + state.weaponPower + state.meterLevel * METER_STEP;
  return hit * critFactor(state.critChance, state.critShare);
}

function faceToward(unit: Fighter, target: Cell): void {
  if (target.x < unit.x) unit.facing = "left";
  else if (target.x > unit.x) unit.facing = "right";
}

function specOf(unit: Fighter): MonsterDef | undefined {
  return unit.kind ? monsterById(unit.kind) : undefined;
}

function immuneTo(unit: Fighter, type: DamageType): boolean {
  return specOf(unit)?.immune.includes(type) ?? false;
}

function ready(unit: Fighter, ability: string): boolean {
  return (unit.cooldowns[ability] ?? 0) === 0;
}

function pick<T>(items: readonly T[], rng: () => number): T | null {
  if (items.length === 0) return null;
  return items[Math.floor(rng() * items.length)] ?? items[0] ?? null;
}

/* ---------- клетки стихий ---------- */

export function groundAt(state: RoomState, x: number, y: number): GroundCell | null {
  if (!inRoom(state.room, x, y)) return null;
  return state.ground[y * state.room.w + x] ?? null;
}

function holdsGround(state: RoomState, x: number, y: number): boolean {
  return isFloor(state.room, x, y) && !isBlocked(state.room, x, y);
}

const SPILL: Partial<Record<DamageType, GroundKind>> = {
  fire: "fire",
  earth: "oil",
  poison: "poison",
  water: "water",
  ice: "ice",
};

/** Новая лужа. Повторная запись на ту же клетку начинает пять ходов заново. */
function puddle(kind: GroundKind, stacks: number): GroundCell {
  return { kind, stacks: kind === "poison" ? stacks : 0, turns: ELEMENTS.puddleTurns };
}
function pour(state: RoomState, cells: readonly Cell[], type: DamageType, stacks: number, rng: () => number): void {
  const kind = SPILL[type];
  if (!kind) return;
  for (const cell of cells) writeGround(state, cell, kind, stacks, rng);
}

/** Обычная запись заменяет прежний тип. Особые встречи: огонь и масло, лёд и вода, огонь и вода, огонь и лёд. */
function writeGround(state: RoomState, cell: Cell, kind: GroundKind, stacks: number, rng: () => number): void {
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
function blast(state: RoomState, start: Cell, rng: () => number): void {
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
  if (burst.length > 0) state.fx.push({ kind: "area", cells: burst, tone: "fire" });
}

/** Лёд по воде замораживает клетку и соседние водяные домино. Кто стоит на них — стан. */
function freeze(state: RoomState, start: Cell): void {
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
function damageFactor(unit: Fighter, type: DamageType): number {
  const physical = type === "physical";
  let factor = armorFactor((physical ? unit.attrs.DEF : unit.attrs.MDEF) ?? 0);
  if (!physical && unit.oil > 0) factor *= ELEMENTS.oilFactor;
  if (physical && unit.wet > 0) factor *= ELEMENTS.wetFactor;
  return factor;
}

/** Удар способностью, укусом или оружием. Возвращает урон после брони, стихий и иммунитета. */
function hurt(state: RoomState, target: Fighter, amount: number, type: DamageType, source: Fighter | null, rng: () => number): number {
  if (target.hp <= 0) return 0;
  if (target !== state.hero && !onBoard(target)) return 0;
  if (target === state.hero && state.dodge > 0 && rng() < Math.min(1, state.dodge)) return 0;
  if (type === "poison") {
    dose(state, target, amount, source, rng);
    return 0;
  }
  if (immuneTo(target, type)) return 0;
  if (type === "ice" && groundAt(state, target.x, target.y)?.kind === "ice" && target.iceGuard === 0) {
    stunUnit(state, target, ELEMENTS.iceStun);
    target.iceGuard = ELEMENTS.iceStunCooldown;
  }
  const dealt = amount * damageFactor(target, type);
  target.hp -= dealt;
  if (type === "fire") target.burn = ELEMENTS.fireTurns;
  if (type === "earth") target.oil = ELEMENTS.oilTurns;
  if (type === "water") target.wet = ELEMENTS.wetTurns;
  landed(state, target, dealt, source, rng);
  return dealt;
}

/** Порция яда: стаки прибавляются, окно снова полное. */
function dose(state: RoomState, target: Fighter, stacks: number, source: Fighter | null, rng: () => number): void {
  if (target.hp <= 0 || immuneTo(target, "poison")) return;
  target.poison += stacks;
  target.poisonWindow = ELEMENTS.poisonWindow;
  landed(state, target, 0, source, rng);
}

function landed(state: RoomState, target: Fighter, dealt: number, source: Fighter | null, rng: () => number): void {
  if (target !== state.hero && source) {
    if (source === state.hero) {
      if (target.mode === "passive") target.mode = "ground";
      chip(state, target, heroShieldPoints(state, target), true);
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

/** Меч, топор, клинки, копьё и перчатки снимают 2. Посох и огнестрел — 1, и 2, если цель в клетке прямо перед героем. */
function heroShieldPoints(state: RoomState, target: Fighter): number {
  const id = state.weapon;
  if (id === "sword" || id === "axe" || id === "dual" || id === "spear" || id === "gloves") return 2;
  const step = DIRS[state.hero.facing];
  const inFace = target.x === state.hero.x + step.x && target.y === state.hero.y + step.y;
  return inFace ? 2 : 1;
}

/** Урон монстра по монстру снимает 1. */
function chip(state: RoomState, target: Fighter, points: number, byHero: boolean): void {
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
function stunUnit(state: RoomState, unit: Fighter, turns: number): void {
  if (unit.hp <= 0) return;
  if (unit !== state.hero && !onBoard(unit)) return;
  unit.stun = Math.max(unit.stun, turns);
  cancelWindup(unit);
}

function cancelWindup(unit: Fighter): void {
  const target = unit.windup?.target;
  if (target && target.mode === "held") target.mode = "ground";
  unit.windup = null;
}

function kill(state: RoomState, unit: Fighter, rng: () => number): void {
  unit.hp = 0;
  if (unit === state.hero) return;
  cancelWindup(unit);
  if (unit.mode === "held") unit.mode = "ground";
  if (!state.bodies.some((body) => sameCell(body, unit))) state.bodies.push(spot(unit));
  const charmers = unit.charmers;
  unit.charmers = [];
  for (const charmer of charmers) {
    if (charmer.hp > 0) shatter(state, charmer, spot(unit), rng);
  }
  if (unit.role !== "spore") spillGold(state, spot(unit), rng, specOf(unit)?.rare ? RARE_GOLD : MONSTER_GOLD);
}

/** Стаки вампиризма: по одному от каждого послушника, чья аура накрывает монстра. */
function vampirism(state: RoomState, unit: Fighter): number {
  let stacks = 0;
  for (const other of state.monsters) {
    if (other.role !== "acolyte" || !onBoard(other) || other.windup?.kind === "spires") continue;
    if (chebyshev(other, unit) <= KIT.acolyte.aura) stacks += KIT.acolyte.vampirism;
  }
  return stacks;
}

/** Осколки очарованного: 3×3 на его клетке, урон льдом всем, кроме шёпота. */
function shatter(state: RoomState, charmer: Fighter, at: Cell, rng: () => number): void {
  const cells = square(state, at, KIT.whisper.radius);
  for (const unit of unitsIn(state, cells, charmer)) hurt(state, unit, KIT.whisper.shards, "ice", charmer, rng);
  pour(state, cells, "ice", 0, rng);
  state.fx.push({ kind: "area", cells, tone: "ice", act: "shards" });
}

/* ---------- геометрия и перемещения ---------- */

/** Квадрат по Чебышёву. Радиус 1 — 3×3. Стены и ямы в область не входят. */
function square(state: RoomState, center: Cell, radius: number): Cell[] {
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

function ring(state: RoomState, center: Cell, radius: number): Cell[] {
  return square(state, center, radius).filter((cell) => chebyshev(cell, center) === radius);
}

function nearestVacant(state: RoomState, origin: Cell): Cell | null {
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
function beside(state: RoomState, center: Cell, prefer: Cell | null): Cell | null {
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

/**
 * Телепорт или появление на клетке. Если там игрок, уходит тот, кто не обездвижен,
 * а если могут оба — игрок. Иначе входящий встаёт на ближайшую свободную клетку.
 */
function arrive(state: RoomState, unit: Fighter, cell: Cell, rng: () => number): void {
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
function knock(state: RoomState, unit: Fighter, from: Cell, distance: number, rng: () => number, fallback: Cell | null = null): void {
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

function stepToward(state: RoomState, monster: Fighter, rng: () => number): string {
  if (monster.root > 0) return "";
  const room = state.room;
  const dist = distancesTo(room, state.hero);
  const here = dist[monster.y * room.w + monster.x] ?? -1;
  if (here <= 0) return "";
  const options = ORTHO.map((step) => ({ x: monster.x + step.x, y: monster.y + step.y })).filter(
    (cell) => !isBlocked(room, cell.x, cell.y) && !taken(state, cell.x, cell.y) && dist[cell.y * room.w + cell.x] === here - 1,
  );
  const next = pick(options, rng);
  if (!next) return "";
  faceToward(monster, next);
  monster.x = next.x;
  monster.y = next.y;
  return breakObject(state, next, rng) ? "Объект разбит." : "";
}

/** Укус вплотную по ортогонали, иначе шаг к герою. Без автоатаки монстр не подходит. */
function biteOrStep(state: RoomState, monster: Fighter, rng: () => number): string {
  const bite = specOf(monster)?.bite ?? 0;
  if (bite <= 0) return "";
  if (manhattan(monster, state.hero) === 1) {
    faceToward(monster, state.hero);
    hurt(state, state.hero, bite, "physical", monster, rng);
    state.strike = { from: spot(monster), to: spot(state.hero) };
    return "Монстр бьёт вплотную.";
  }
  return stepToward(state, monster, rng);
}

/** Путь рывка по ортогонали к герою, не дальше `max` и до клетки вплотную. */
function planDash(state: RoomState, monster: Fighter, max: number, rng: () => number): Cell[] {
  const hero = state.hero;
  const room = state.room;
  const dist = distancesTo(room, hero);
  let at = spot(monster);
  const path: Cell[] = [];
  for (let step = 0; step < max && manhattan(hero, at) > 1; step += 1) {
    const here = dist[at.y * room.w + at.x] ?? -1;
    if (here <= 1) break;
    const options = ORTHO.map((move) => ({ x: at.x + move.x, y: at.y + move.y })).filter(
      (cell) => !isBlocked(room, cell.x, cell.y) && !taken(state, cell.x, cell.y) && dist[cell.y * room.w + cell.x] === here - 1,
    );
    const next = pick(options, rng);
    if (!next) break;
    path.push(next);
    at = next;
  }
  return path;
}

/** Луч через клетку цели. Стена обрывает, яму он пролетает. */
function beamCells(state: RoomState, from: Cell, through: Cell, range: number): Cell[] {
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

function windup(kind: WindupKind, turns: number, cells: Cell[], center: Cell, target: Fighter | null = null): Windup {
  return { kind, turns, cells, center: spot(center), target };
}

/** Клетка, где игрок стоит в момент каста. Пёс метит её и приходит туда через ход. */
function dogTurn(state: RoomState, monster: Fighter, rng: () => number): string {
  const cell = spot(state.hero);
  if (manhattan(monster, cell) > 1 && ready(monster, "dash") && monster.root === 0) {
    monster.windup = windup("charge", KIT.dog.delay, [cell], cell);
    monster.cooldowns.dash = KIT.dog.cooldown;
    faceToward(monster, cell);
    return "Пёс готовит рывок.";
  }
  return biteOrStep(state, monster, rng);
}

function dashTurn(
  state: RoomState,
  monster: Fighter,
  kit: { dash: number; damage: number; cooldown: number },
  type: DamageType,
  rng: () => number,
): string {
  const hero = state.hero;
  if (manhattan(monster, hero) > 1 && ready(monster, "dash") && monster.root === 0) {
    const path = planDash(state, monster, kit.dash, rng);
    if (path.length > 0) {
      const from = spot(monster);
      for (const cell of path) {
        faceToward(monster, cell);
        monster.x = cell.x;
        monster.y = cell.y;
        breakObject(state, cell, rng);
        if (type === "fire") writeGround(state, cell, "fire", 0, rng);
      }
      monster.cooldowns.dash = kit.cooldown;
      state.fx.push({ kind: "dash", from, to: spot(monster), tone: type, act: "dash" });
      if (manhattan(monster, hero) === 1) {
        faceToward(monster, hero);
        hurt(state, hero, kit.damage, type, monster, rng);
        return "Рывок ударил.";
      }
      return "Рывок.";
    }
  }
  return biteOrStep(state, monster, rng);
}

function spiderTurn(state: RoomState, monster: Fighter, rng: () => number): string {
  const hero = state.hero;
  if (ready(monster, "shot") && manhattan(monster, hero) <= KIT.spider.range) {
    const target = spot(hero);
    faceToward(monster, target);
    for (const unit of unitsIn(state, [target], monster)) hurt(state, unit, KIT.spider.stacks, "poison", monster, rng);
    writeGround(state, target, "poison", KIT.spider.stacks, rng);
    monster.cooldowns.shot = KIT.spider.cooldown;
    state.fx.push({ kind: "shot", from: spot(monster), to: target, tone: "poison", act: "spit" });
    return "Паук плюнул ядом.";
  }
  return biteOrStep(state, monster, rng);
}

function corpseTurn(state: RoomState, monster: Fighter, rng: () => number): string {
  const hero = state.hero;
  if (!monster.spent && manhattan(monster, hero) <= KIT.corpse.reach && monster.root === 0) {
    monster.spent = true;
    monster.windup = windup("jump", KIT.corpse.delay, square(state, hero, KIT.corpse.radius), hero);
    faceToward(monster, hero);
    return "Мертвец готовит прыжок.";
  }
  return biteOrStep(state, monster, rng);
}

function golemTurn(state: RoomState, monster: Fighter, rng: () => number): string {
  if (ready(monster, "stone")) {
    const target = spot(state.hero);
    monster.windup = windup("stone", KIT.golem.delay, [target], target);
    monster.cooldowns.stone = KIT.golem.cooldown;
    faceToward(monster, target);
    return "Голем замахнулся камнем.";
  }
  return biteOrStep(state, monster, rng);
}

function sleepTurn(monster: Fighter): string {
  monster.hp = Math.min(monster.maxHp, monster.hp + monster.maxHp * KIT.bat.heal);
  if (monster.hp >= monster.maxHp) monster.mode = "ground";
  return "Кровосос спит и лечится.";
}

function batTurn(state: RoomState, monster: Fighter, rng: () => number): string {
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
      return "Кровосос налетел.";
    }
  }
  return biteOrStep(state, monster, rng);
}

function slimeTurn(state: RoomState, monster: Fighter, rng: () => number): string {
  if (monster.root > 0) return "";
  const dirs = ORTHO.slice();
  for (let i = dirs.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [dirs[i], dirs[j]] = [dirs[j]!, dirs[i]!];
  }
  for (const dir of dirs) {
    const path: Cell[] = [];
    for (let i = 1; i <= KIT.slime.steps; i += 1) {
      const cell = { x: monster.x + dir.x * i, y: monster.y + dir.y * i };
      if (!vacant(state, cell.x, cell.y)) break;
      path.push(cell);
    }
    if (path.length === 0) continue;
    const from = spot(monster);
    for (const cell of path) {
      faceToward(monster, cell);
      monster.x = cell.x;
      monster.y = cell.y;
      breakObject(state, cell, rng);
      writeGround(state, cell, "poison", KIT.slime.stacks, rng);
    }
    state.fx.push({ kind: "move", from, to: spot(monster), act: "slime" });
    return "";
  }
  return "";
}

/** Прямоугольник 2 в глубину и 3 в ширину перед скелетом, в сторону героя. */
function swingCells(state: RoomState, monster: Fighter): Cell[] {
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

function skeletonTurn(state: RoomState, monster: Fighter, rng: () => number): string {
  if (ready(monster, "swing") && manhattan(monster, state.hero) <= KIT.skeleton.reach) {
    const cells = swingCells(state, monster);
    if (cells.length > 0) {
      monster.windup = windup("swing", KIT.skeleton.delay, cells, monster);
      monster.cooldowns.swing = KIT.skeleton.cooldown;
      faceToward(monster, state.hero);
      return "Скелет заносит меч.";
    }
  }
  return biteOrStep(state, monster, rng);
}

function spiritTurn(state: RoomState, monster: Fighter, rng: () => number): string {
  const hero = state.hero;
  if (ready(monster, "blink") && monster.root === 0) {
    const cell = beside(state, hero, monster);
    if (cell) {
      const from = spot(monster);
      arrive(state, monster, cell, rng);
      faceToward(monster, hero);
      monster.cooldowns.blink = KIT.spirit.cooldown;
      state.fx.push({ kind: "blink", from, to: spot(monster), act: "wisp" });
      hurt(state, hero, KIT.spirit.damage, "physical", monster, rng);
      if (hero.hp <= 0) return "Дух ударил из блинка.";
      return `Дух ударил из блинка. ${biteOrStep(state, monster, rng)}`.trim();
    }
  }
  return biteOrStep(state, monster, rng);
}

function mushroomTurn(state: RoomState, monster: Fighter, rng: () => number): string {
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
  if (ready(monster, "spore")) {
    const open: Cell[] = [];
    for (let y = 0; y < state.room.h; y += 1) {
      for (let x = 0; x < state.room.w; x += 1) if (vacant(state, x, y)) open.push({ x, y });
    }
    const cell = pick(open, rng);
    if (cell) {
      state.monsters.push(monsterFighter(SPORE, { x: cell.x, y: cell.y, facing: monster.facing }, true));
      monster.cooldowns.spore = KIT.mushroom.cooldown;
      state.fx.push({ kind: "shot", from: spot(monster), to: cell, tone: "poison", act: "spore" });
      return "Грибник выпустил спору.";
    }
  }
  return "";
}

function sporeTurn(state: RoomState, monster: Fighter, rng: () => number): string {
  const near = boardUnits(state).some(
    (unit) => unit !== monster && unit.role !== "mushroom" && chebyshev(unit, monster) <= KIT.spore.radius,
  );
  if (near) {
    monster.windup = windup("fuse", KIT.spore.fuse, square(state, monster, KIT.spore.radius), monster);
    return "Спора набухает.";
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

function emberTurn(state: RoomState, monster: Fighter, rng: () => number): string {
  if (ready(monster, "vanish") && monster.root === 0) {
    monster.mode = "gone";
    monster.anchor = spot(monster);
    monster.phase = KIT.ember.pause;
    monster.cooldowns.vanish = KIT.ember.cooldown;
    state.fx.push({ kind: "area", cells: [spot(monster)], tone: "fire", act: "vanish" });
    return "Уголёк исчез.";
  }
  return biteOrStep(state, monster, rng);
}

/** Исчезнувший уголёк: пауза, затем метит клетку рядом с героем. */
function emberGone(state: RoomState, monster: Fighter, rng: () => number): string {
  if (monster.phase > 0) {
    monster.phase -= 1;
    return "";
  }
  const cell = beside(state, state.hero, null);
  if (!cell) {
    monster.mode = "ground";
    arrive(state, monster, monster.anchor ?? monster, rng);
    return "Уголёк вернулся на своё место.";
  }
  monster.windup = windup("appear", KIT.ember.delay, square(state, cell, KIT.ember.radius), cell);
  return "Уголёк метит клетку.";
}

function wormTurn(state: RoomState, monster: Fighter, rng: () => number): string {
  if (ready(monster, "dig") && monster.root === 0) {
    state.fx.push({ kind: "area", cells: [spot(monster)], tone: "earth", act: "dig" });
    monster.mode = "under";
    return "Червь закопался.";
  }
  return biteOrStep(state, monster, rng);
}

/** Червь ползёт под землёй к герою. Дойдя до его клетки, метит её. */
function wormUnder(state: RoomState, monster: Fighter, rng: () => number): string {
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
    return "Земля дрожит под героем.";
  }
  return "";
}

function acolyteTurn(state: RoomState, monster: Fighter): string {
  if (ready(monster, "spires")) {
    monster.windup = windup("spires", KIT.acolyte.delay, square(state, state.hero, KIT.acolyte.radius), state.hero);
    monster.cooldowns.spires = KIT.acolyte.cooldown;
    return "Послушник поднимает шпили.";
  }
  return "";
}

function chestTurn(state: RoomState, monster: Fighter, rng: () => number): string {
  const hero = state.hero;
  if (manhattan(monster, hero) > KIT.chest.reach) {
    monster.windup = windup("tongue", KIT.chest.delay, square(state, hero, KIT.chest.radius), hero);
    faceToward(monster, hero);
    return "Сундук выбросил язык.";
  }
  return biteOrStep(state, monster, rng);
}

function markRock(state: RoomState, monster: Fighter): void {
  const target = spot(state.hero);
  state.hazards.push({ owner: monster, kind: "rock", turns: KIT.gargoyle.delay, cells: [target], center: target });
}

function gargoyleTurn(state: RoomState, monster: Fighter, rng: () => number): string {
  if (ready(monster, "flight") && monster.root === 0) {
    monster.mode = "air";
    monster.anchor = spot(monster);
    monster.phase = 0;
    gargoyleAir(state, monster);
    return "Страж взлетел.";
  }
  return biteOrStep(state, monster, rng);
}

/** Полёт: каждый ход метит клетку героя под камень. После четырёх камней — посадка. */
function gargoyleAir(state: RoomState, monster: Fighter): string {
  if (monster.phase < KIT.gargoyle.stones) {
    markRock(state, monster);
    monster.phase += 1;
    return "Страж метит камень.";
  }
  monster.windup = windup("land", KIT.gargoyle.landDelay, square(state, state.hero, KIT.gargoyle.radius), state.hero);
  return "Страж идёт на посадку.";
}

/** Кольца вокруг клетки героя: центр с задержкой 1, каждое следующее кольцо на ход позже. */
function castRings(state: RoomState, owner: Fighter, kind: "geyser" | "hail", count: number): void {
  const center = spot(state.hero);
  for (let radius = 0; radius < count; radius += 1) {
    const cells = ring(state, center, radius);
    if (cells.length > 0) state.hazards.push({ owner, kind, turns: radius + 1, cells, center });
  }
}

function throwTarget(state: RoomState, monster: Fighter, rng: () => number): Fighter | null {
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

function drownedTurn(state: RoomState, monster: Fighter, rng: () => number): string {
  if (ready(monster, "geyser")) {
    castRings(state, monster, "geyser", KIT.drowned.rings);
    monster.cooldowns.geyser = KIT.drowned.geyserCooldown;
    return "Утопленник поднял гейзеры.";
  }
  if (ready(monster, "throw")) {
    const target = throwTarget(state, monster, rng);
    const landing = target ? beside(state, state.hero, target) : null;
    if (target && landing) {
      cancelWindup(target);
      target.mode = "held";
      monster.windup = windup("throw", KIT.drowned.throwDelay, square(state, landing, KIT.drowned.radius), landing, target);
      monster.cooldowns.throw = KIT.drowned.throwCooldown;
      return "Утопленник схватил существо.";
    }
  }
  return biteOrStep(state, monster, rng);
}

function whisperTurn(state: RoomState, monster: Fighter, rng: () => number): string {
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
        return "Шёпот очаровал монстра.";
      }
    }
  }
  if (ready(monster, "hail")) {
    castRings(state, monster, "hail", KIT.whisper.rings);
    monster.cooldowns.hail = KIT.whisper.hailCooldown;
    return "Шёпот вызвал град.";
  }
  const line = beamCells(state, monster, state.hero, KIT.whisper.beamRange);
  if (line.length > 0) {
    monster.windup = windup("beam", KIT.whisper.beamDelay, line, state.hero);
    faceToward(monster, state.hero);
    return "Шёпот целится лучом.";
  }
  return "";
}

function roleTurn(state: RoomState, monster: Fighter, rng: () => number): string {
  switch (monster.role) {
    case "dog":
      return dogTurn(state, monster, rng);
    case "hound":
      return dashTurn(state, monster, KIT.hound, "fire", rng);
    case "goblin":
      return dashTurn(state, monster, KIT.goblin, "physical", rng);
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
    default:
      return biteOrStep(state, monster, rng);
  }
}

function resolveWindup(state: RoomState, monster: Fighter, cast: Windup, rng: () => number): string {
  switch (cast.kind) {
    case "swing": {
      for (const unit of unitsIn(state, cast.cells, monster)) hurt(state, unit, KIT.skeleton.damage, "physical", monster, rng);
      state.fx.push({ kind: "area", cells: cast.cells, tone: "physical", act: "slash" });
      return "Скелет рубанул.";
    }
    case "stone": {
      for (const unit of unitsIn(state, cast.cells, monster)) hurt(state, unit, KIT.golem.damage, "earth", monster, rng);
      pour(state, cast.cells, "earth", 0, rng);
      state.fx.push({ kind: "shot", from: spot(monster), to: cast.center, tone: "earth", act: "rock" });
      return "Камень голема упал.";
    }
    case "jump": {
      const from = spot(monster);
      monster.x = cast.center.x;
      monster.y = cast.center.y;
      for (const unit of unitsIn(state, cast.cells, monster)) hurt(state, unit, KIT.corpse.stacks, "poison", monster, rng);
      pour(state, cast.cells, "poison", KIT.corpse.stacks, rng);
      state.fx.push({ kind: "shot", from, to: spot(monster), tone: "poison", act: "leap" });
      state.fx.push({ kind: "area", cells: cast.cells, tone: "poison", act: "pop" });
      kill(state, monster, rng);
      return "Мертвец лопнул ядом.";
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
      if (!target) return "Язык схватил пустоту.";
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
      return target === hero ? "Язык схватил героя." : "Язык схватил монстра.";
    }
    case "spires": {
      for (const unit of unitsIn(state, cast.cells, monster)) unit.root = Math.max(unit.root, KIT.acolyte.root);
      state.fx.push({ kind: "area", cells: cast.cells, tone: "control", act: "spires" });
      return "Шпили сковали.";
    }
    case "beam": {
      for (const unit of unitsIn(state, cast.cells, monster)) hurt(state, unit, KIT.whisper.beam, "ice", monster, rng);
      pour(state, cast.cells, "ice", 0, rng);
      const end = cast.cells[cast.cells.length - 1] ?? cast.center;
      state.fx.push({ kind: "line", from: spot(monster), to: end, tone: "ice", act: "beam" });
      return "Ледяной луч.";
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
      return "Утопленник швырнул существо.";
    }
    case "fuse": {
      for (const unit of unitsIn(state, cast.cells, monster)) {
        if (unit.role !== "mushroom") hurt(state, unit, KIT.spore.stacks, "poison", monster, rng);
      }
      pour(state, cast.cells, "poison", KIT.spore.stacks, rng);
      state.fx.push({ kind: "area", cells: cast.cells, tone: "poison", act: "pop" });
      kill(state, monster, rng);
      return "Спора лопнула.";
    }
    case "appear": {
      const from = monster.anchor ?? spot(monster);
      monster.mode = "ground";
      arrive(state, monster, cast.center, rng);
      for (const unit of unitsIn(state, cast.cells, monster)) hurt(state, unit, KIT.ember.damage, "fire", monster, rng);
      pour(state, cast.cells, "fire", 0, rng);
      state.fx.push({ kind: "blink", from, to: spot(monster), act: "flare" });
      state.fx.push({ kind: "area", cells: cast.cells, tone: "fire", act: "flare" });
      return "Уголёк вспыхнул рядом.";
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
      return "Червь вынырнул.";
    }
    case "charge": {
      const from = spot(monster);
      const cell = spot(cast.center);
      for (const unit of unitsIn(state, [cell], monster)) hurt(state, unit, KIT.dog.damage, "physical", monster, rng);
      arrive(state, monster, cell, rng);
      faceToward(monster, cell);
      state.fx.push({ kind: "dash", from, to: spot(monster), tone: "physical", act: "dash" });
      return "Пёс ворвался.";
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
      return "Страж приземлился.";
    }
  }
}

function resolveHazard(state: RoomState, hazard: Hazard, rng: () => number): string {
  const owner = hazard.owner;
  if (hazard.kind === "rock") {
    const hero = state.hero;
    const heroHit = hero.hp > 0 && hasCell(hazard.cells, hero);
    for (const unit of unitsIn(state, hazard.cells, owner)) hurt(state, unit, KIT.gargoyle.stone, "earth", owner, rng);
    pour(state, hazard.cells, "earth", 0, rng);
    const from = owner.anchor ?? spot(owner);
    if (heroHit && hero.hp > 0) knock(state, hero, from, KIT.gargoyle.stonePush, rng, DIRS[BACK[hero.facing]]);
    state.fx.push({ kind: "shot", from, to: hazard.center, tone: "earth", act: "fall" });
    return "Камень с неба.";
  }
  const water = hazard.kind === "geyser";
  const type: DamageType = water ? "water" : "ice";
  const amount = water ? KIT.drowned.geyser : KIT.whisper.hail;
  for (const unit of unitsIn(state, hazard.cells, owner)) hurt(state, unit, amount, type, owner, rng);
  pour(state, hazard.cells, type, 0, rng);
  state.fx.push({ kind: "area", cells: hazard.cells, tone: type, act: water ? "geyser" : "hail" });
  return water ? "Гейзер." : "Град.";
}

/* ---------- ход монстров и тики ---------- */

function tickRoot(unit: Fighter): void {
  if (unit.root > 0) unit.root -= 1;
}

function actTurn(state: RoomState, monster: Fighter, rng: () => number): string {
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
function monsterTurn(state: RoomState, monster: Fighter, rng: () => number): string {
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
        return "Стан кончился. Щит восстановлен.";
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

function tickHazards(state: RoomState, owner: Fighter, rng: () => number): string[] {
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

function monsterPhase(state: RoomState, rng: () => number): string {
  const notes: string[] = [];
  for (const monster of state.monsters.slice()) {
    if (state.hero.hp <= 0 || cleared(state)) break;
    notes.push(...tickHazards(state, monster, rng));
    if (state.hero.hp <= 0) break;
    notes.push(monsterTurn(state, monster, rng));
  }
  return notes.filter((note) => note.length > 0).join(" ");
}

/** Тик в конце раунда без брони источника, щита и вампиризма. */
function tickHit(state: RoomState, unit: Fighter, amount: number, type: DamageType, rng: () => number): void {
  if (amount <= 0 || immuneTo(unit, type)) return;
  unit.hp -= amount * damageFactor(unit, type);
  if (unit.hp <= 0) kill(state, unit, rng);
}

/** Тики яда, огня, масла и воды. Стояние на клетке в начале тика обновляет дебаф. */
function tickWorld(state: RoomState, rng: () => number): void {
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
      tickHit(state, unit, 1, "poison", rng);
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
function round(state: RoomState, rng: () => number): string {
  const world = monsterPhase(state, rng);
  if (state.hero.hp > 0 && !cleared(state)) tickWorld(state, rng);
  return world;
}

/* ---------- ход героя ---------- */

function cellKey(cell: Cell): string {
  return `${cell.x},${cell.y}`;
}

/** Свободная для героя клетка: монстр и тело её держат, сам герой — нет. */
function openForHero(state: RoomState, x: number, y: number): boolean {
  return isFloor(state.room, x, y) && !isBlocked(state.room, x, y) && !occupied(state, x, y);
}

/** Ближайшая свободная клетка к обрыву. При равной дистанции — клетка, с которой герой шагнул. */
function landingAfterFall(state: RoomState, pit: Cell, from: Cell): Cell {
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

function fallIntoPit(state: RoomState, pit: Cell, from: Cell, dir: Dir, rng: () => number): boolean {
  state.hero.facing = dir;
  state.hero.hp -= state.hero.maxHp * PIT_HP_SHARE;
  state.pitDrop = pit;
  const dead = state.hero.hp <= 0;
  const place = dead ? pit : landingAfterFall(state, pit, from);
  state.hero.x = place.x;
  state.hero.y = place.y;
  const got = dead ? 0 : takeGold(state);
  state.note = got > 0 ? "Обрыв. Золото." : "Обрыв.";
  if (finish(state) === "lost") return true;
  afterAction(state, false, rng);
  return true;
}

function breakBarrel(state: RoomState, cell: Cell, rng: () => number): boolean {
  const index = state.barrels.findIndex((barrel) => barrel.x === cell.x && barrel.y === cell.y);
  if (index < 0) return false;
  const [barrel] = state.barrels.splice(index, 1);
  state.broken.push(cellKey(barrel!));
  spillGold(state, barrel!, rng);
  return true;
}

function spillGold(state: RoomState, from: Cell, rng: () => number, count = 1): void {
  for (let i = 0; i < count; i += 1) {
    const place = goldCell(state, from, rng);
    if (!place) return;
    state.piles.push(place);
    state.drops.push({ from: { x: from.x, y: from.y }, to: place });
  }
}

function breakBarrels(state: RoomState, cells: readonly Cell[], rng: () => number): number {
  let count = 0;
  for (const cell of cells) if (breakBarrel(state, cell, rng)) count += 1;
  return count;
}

function breakChair(state: RoomState, cell: Cell, rng: () => number): boolean {
  const index = state.chairs.findIndex((chair) => chair.x === cell.x && chair.y === cell.y);
  if (index < 0) return false;
  const [chair] = state.chairs.splice(index, 1);
  state.broken.push(cellKey(chair!));
  spillGold(state, chair!, rng);
  return true;
}

function breakObject(state: RoomState, cell: Cell, rng: () => number): boolean {
  return breakBarrel(state, cell, rng) || breakChair(state, cell, rng);
}

function breakChairs(state: RoomState, cells: readonly Cell[], rng: () => number): number {
  let count = 0;
  for (const cell of cells) if (breakChair(state, cell, rng)) count += 1;
  return count;
}

/** Случайная ближайшая клетка пола, не под героем и не под монстром. */
function goldCell(state: RoomState, origin: Cell, rng: () => number): Cell | null {
  let best = Number.POSITIVE_INFINITY;
  const options: Cell[] = [];
  for (let y = 0; y < state.room.h; y += 1) {
    for (let x = 0; x < state.room.w; x += 1) {
      if (x === state.hero.x && y === state.hero.y) continue;
      if (state.monsters.some((monster) => onBoard(monster) && monster.x === x && monster.y === y)) continue;
      if (!isFloor(state.room, x, y) || isBlocked(state.room, x, y)) continue;
      const distance = Math.abs(x - origin.x) + Math.abs(y - origin.y);
      if (distance < best) {
        best = distance;
        options.length = 0;
        options.push({ x, y });
      } else if (distance === best) options.push({ x, y });
    }
  }
  return pick(options, rng);
}

function takeGold(state: RoomState): number {
  const before = state.piles.length;
  state.piles = state.piles.filter((pile) => pile.x !== state.hero.x || pile.y !== state.hero.y);
  const got = before - state.piles.length;
  state.carried += got;
  return got;
}

function canControl(state: RoomState): boolean {
  if (state.hero.hp <= 0) {
    finish(state);
    return false;
  }
  return state.outcome !== "lost";
}

/** Начало хода героя: тела, убитые в прошлый ход, больше не держат клетку. */
function beginHeroTurn(state: RoomState): void {
  state.bodies = [];
}

function doorsNote(state: RoomState): string {
  return ` Враг пал. Blink +1.${state.exits.length > 0 ? " Двери открыты." : ""}`;
}

/**
 * После действия героя ходит мир: монстры, потом тики.
 * Пока герой в стане, мир не даёт ему ход: раунды идут дальше, его кулдауны стоят.
 */
function afterAction(state: RoomState, refreshed: boolean, rng: () => number): void {
  const heroNote = state.note;
  if (state.outcome === "won" || state.outcome === "lost") return;
  const hero = state.hero;
  tickRoot(hero);
  if (hero.iceGuard > 0) hero.iceGuard -= 1;
  if (hero.hp <= 0) {
    finish(state);
    return;
  }
  if (cleared(state)) {
    finish(state);
    state.note = `${heroNote}${doorsNote(state)}`;
    return;
  }
  tickMeter(state, refreshed);
  const parts = [heroNote, round(state, rng)];
  while (state.outcome === "play" && hero.hp > 0 && hero.stun > 0 && !cleared(state)) {
    hero.stun -= 1;
    tickRoot(hero);
    parts.push("Герой в стане.", round(state, rng));
  }
  const outcome = finish(state);
  if (outcome === "lost") return;
  state.note = parts.filter((part) => part.length > 0).join(" ");
  if (outcome === "won") state.note += doorsNote(state);
}

export function face(state: RoomState, dir: Dir): void {
  if (!canControl(state)) return;
  state.hero.facing = dir;
  state.note = "Поворот.";
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
      state.note = "Двери закрыты, пока жив хоть один монстр.";
      return false;
    }
    state.leaving = exit.side;
    return true;
  }
  if (state.hero.root > 0) {
    state.hero.facing = dir;
    state.note = "Шпили держат ноги: шагнуть нельзя.";
    return false;
  }
  if (isPit(state.room, x, y)) {
    return fallIntoPit(state, { x, y }, { x: state.hero.x, y: state.hero.y }, dir, rng);
  }
  if (isBlocked(state.room, x, y) || occupied(state, x, y)) return false;
  state.hero.facing = dir;
  state.hero.x = x;
  state.hero.y = y;
  const broke = breakObject(state, { x, y }, rng);
  const got = takeGold(state);
  state.note = broke ? "Объект разбит." : "Шаг.";
  if (got > 0) state.note = `${state.note} Золото.`;
  afterAction(state, false, rng);
  return true;
}

function struck(state: RoomState): Fighter[] {
  const cells = attackCells(state);
  return state.monsters.filter((monster) => onBoard(monster) && hasCell(cells, monster));
}

export function swordWillKill(state: RoomState): boolean {
  if (state.outcome === "lost") return false;
  const times = weaponById(state.weapon).twice ? 2 : 1;
  const damage = swordDamage(state);
  return struck(state).some((monster) => monster.hp - times * damage * damageFactor(monster, "physical") <= 0);
}

export function attack(state: RoomState, rng: () => number = Math.random): boolean {
  if (!canControl(state)) return false;
  beginHeroTurn(state);
  const weapon = weaponById(state.weapon);
  if (weapon.magazine !== null && shotsLeft(state) === 0) {
    if (weapon.id === "pistol") return reload(state, rng);
    state.note = "Магазин пуст.";
    return false;
  }
  const smashed = breakBarrels(state, attackCells(state), rng) + breakChairs(state, attackCells(state), rng);
  const smashedNote = smashed > 0 ? " Объект разбит." : "";
  const targets = struck(state);
  const times = targets.length === 0 ? 0 : weapon.twice ? 2 : 1;
  if (weapon.magazine !== null) state.ammo = (shotsLeft(state) ?? weapon.magazine) - 1;
  if (times === 0) {
    state.note = `${weapon.name} никого не задел. Ход всё равно потрачен.${smashedNote}`;
    afterAction(state, false, rng);
    return true;
  }
  const shields = targets.map((target) => target.shield);
  for (const target of targets) {
    for (let hit = 0; hit < times; hit += 1) hurt(state, target, swordDamage(state), "physical", state.hero, rng);
  }
  const broke = targets.some((target, index) => (shields[index] ?? 0) > 0 && target.shield === 0);
  state.note = `${broke ? "Щит сорван. Монстр в стане, Blink вернулся." : "Удар."}${smashedNote}`;
  afterAction(state, broke, rng);
  return true;
}

/** Перезарядка на R. Полный магазин или оружие без магазина ход не тратит. */
export function reload(state: RoomState, rng: () => number = Math.random): boolean {
  if (!canControl(state)) return false;
  beginHeroTurn(state);
  const weapon = weaponById(state.weapon);
  if (weapon.magazine === null) {
    state.note = "Это оружие не перезаряжается.";
    return false;
  }
  const left = shotsLeft(state) ?? 0;
  if (left >= weapon.magazine) {
    state.note = "Магазин полон.";
    return false;
  }
  state.ammo = weapon.magazine;
  state.note = "Перезарядка.";
  afterAction(state, false, rng);
  return true;
}

export function wait(state: RoomState, rng: () => number = Math.random): void {
  if (!canControl(state)) return;
  beginHeroTurn(state);
  state.note = "Пропуск хода.";
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
  if (broke) bits.push("Объект разбит.");
  if (got > 0) bits.push("Золото.");
  bits.push("Мир не ходил.");
  state.note = bits.join(" ");
  return true;
}
