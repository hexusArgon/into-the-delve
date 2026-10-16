import { heroAttributes, monsterAttributes, type Attributes } from "../data/attributes.ts";
import { CHEST_GOLD, ELEMENTS, KIT, MONSTER_GOLD, RARE_GOLD, SPORE, monsterById, type DamageType, type MonsterDef, type MonsterRole } from "../data/monsters.ts";
import type { DamageHit } from "./damage-float.ts";
import { threatFactor } from "./adventure.ts";
import type { BodyKind, Decor, Door, Facing, RoomPattern, RoomTheme, Side, Spawn, Stamp } from "../data/rooms.ts";
import { EMPTY_GEAR, critFactor, itemById, type GearBonus } from "../data/items.ts";
import { heroAbilityById, type RunAbility } from "../data/hero-abilities.ts";
import type { InstanceKind } from "../data/instances.ts";
import { pointChance } from "../data/instances.ts";
import { weaponById, weaponName, type WeaponDef, type WeaponId } from "../data/weapons.ts";
import {
  BLINK_CHARGES,
  HERO_MP,
  BLINK_RANGE,
  HERO_HP,
  HERO_CRIT_CHANCE,
  METER_STEP,
  PIT_HP_SHARE,
  METER_TURNS,
  STUN_TURNS,
  armorFactor,
} from "./rules.ts";

export type Dir = Facing;

/** Восемь направлений прицела. Ноль по оси — прямая, оба не нули — диагональ. */
export interface AimStep {
  x: -1 | 0 | 1;
  y: -1 | 0 | 1;
}

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
  | "charge"
  | "pounce"
  | "rush"
  | "wisp"
  | "spit"
  | "swap";

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

/** Бочка автоматона. Не обычная бочка комнаты и не монстр. */
export interface Keg {
  x: number;
  y: number;
  element: GroundKind;
  owner: Fighter;
}

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
  /** Id из таблицы монстров. Empty у героя. */
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
  /** Немота: каст ауры не идёт. */
  silence: number;
  /** Кулдаун ледяного стана. */
  iceGuard: number;
  cooldowns: Record<string, number>;
  /** Номер в стае комнаты. По нему находится заранее назначенный лут. */
  packIndex?: number;
  windup: Windup | null;
  mode: Mode;
  /** Bloodsucker уже спал, мертвец уже прыгнул. */
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

/** Вещь с пола. Уровень при выдаче — 0. */
export interface CarryLoot {
  kind: InstanceKind;
  catalogId: string;
}

/** Вещь, заранее назначенная рарнику, сундуку или монстру. */
export interface LootParcel {
  room: number;
  monster?: number;
  chest?: Cell;
  item: CarryLoot;
}

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
  | "sleep"
  | "bolt"
  | "ward"
  | "blizzard"
  | "arrow"
  | "quake"
  | "shard"
  | "keg"
  | "swap";

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
  /** Стихия клетки, индекс y·w+x. На клетке одна стихия. Новая лужа живёт 9 ходов. */
  ground: (GroundCell | null)[];
  /** Клетки, где в этот ход монстра уже убили. Пока герой не походил снова, сюда не встают. */
  bodies: Cell[];
  blink: number;
  /** Остаток маны. Полная шкала в начале комнаты. */
  mp: number;
  maxMp: number;
  meterTurns: number;
  meterLevel: number;
  outcome: Outcome;
  note: string;
  /** Рисунок только что сработавших способностей. Вид забирает и очищает. */
  fx: AbilityFx[];
  /** Потеря здоровья за этот ход. Вид забирает и пускает числа вверх. */
  hits: DamageHit[];
  /** Клетка обрыва, в которую герой только что шагнул. Вид проигрывает падение. */
  pitDrop: Cell | null;
  /** Бочки, которые ещё можно разбить шагом или ударом по клетке. */
  barrels: Cell[];
  /** Бочки автоматона. Взрываются от урона по клетке, обычные бочки комнаты сюда не входят. */
  kegs: Keg[];
  /** Столы и полки. Не ломаются. */
  furniture: { kind: "table" | "shelf"; x: number; y: number; w: number; h: number }[];
  /** Стулья. Как бочки: шаг или удар по клетке ломает стул. */
  chairs: Cell[];
  /** Сундуки комнаты. Открытый уже отдал золото. */
  chests: { kind: "chest" | "cellchest"; x: number; y: number; open: boolean }[];
  /** Ключи уже разбитых бочек, чтобы комната помнила их после ухода. */
  broken: string[];
  /** Gold на полу. Каждая запись — одна монета. */
  piles: Cell[];
  /** Шмотки на полу этой комнаты. */
  loot: (Cell & CarryLoot)[];
  /** Назначенный лут этой комнаты, который ещё не выпал. */
  pending: LootParcel[];
  /** Имена вещей, выпавших в этот ход. */
  spoilNames: string[];
  /** Выбранный уровень приключения. 0 — числа гайда. */
  adventure: number;
  /** Уже поднятые шмотки. Живут до хаба. */
  found: CarryLoot[];
  /** Монеты, которые только что вылетели из бочки. Вид забирает их в кадр полёта. */
  drops: { from: Cell; to: Cell }[];
  /** Укус монстра вплотную. Вид проигрывает выпад и отшат. */
  strike: { from: Cell; to: Cell } | null;
  /** Подобранное золото. Живёт весь забег. */
  carried: number;
  weapon: WeaponId;
  /** Патроны в магазине. Empty у оружия без магазина. */
  ammo: number | null;
  /** Damage попадания уже с уровнем оружия. Empty — брать базу каталога. */
  weaponHit: number | null;
  /** Прибавка к каждому попаданию оружия. Уже умножена уровнем экипировки. */
  weaponPower: number;
  /** Плоская прибавка к урону умения. */
  abilityPower: number;
  /** Проценты к урону героя этого типа. 10 значит +10%. */
  bonusDamage: Partial<Record<DamageType, number>>;
  /** Шанс полностью избежать удара, уже посчитанный из очков. */
  dodge: number;
  critChance: number;
  critShare: number;
  /** Надетые способности героя. Damage уже с уровнем экземпляра. */
  abilities: (RunAbility | null)[];
  /** Клетки выбора способности. Empty, когда игрок не целится. Пустой список — способность выбрана, луча ещё нет. */
  aim: Cell[] | null;
  /** Куда смотрит курсор от героя. Пусто — удар туда, куда повёрнут герой. */
  look: AimStep | null;
  /** Огненный щит. Прочность 100 не растёт от заточки. Урон тика — уже с уровнем. */
  ward: { hp: number; left: number; damage: number } | null;
  /** Буран. Пусто — выключен. Мана тика не растёт от заточки. */
  blizzard: { damage: number; mp: number } | null;
  /** Зоны землетрясения. Новая комната начинает без них. */
  quakes: { x: number; y: number; left: number; damage: number }[];
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

/** Шагов до цели в обход препятствий, -1 если не дойти. extra — клетки, которые держат бочки автоматона. */
export function distancesTo(room: RoomLayout, target: Cell, extra?: (x: number, y: number) => boolean): Int16Array {
  const blocked = (x: number, y: number): boolean => isBlocked(room, x, y) || extra?.(x, y) === true;
  const dist = new Int16Array(room.w * room.h).fill(-1);
  if (blocked(target.x, target.y)) return dist;
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
      if (blocked(nx, ny)) continue;
      const next = ny * room.w + nx;
      if (dist[next] !== -1) continue;
      dist[next] = dist[current]! + 1;
      queue.push(next);
    }
  }
  return dist;
}

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

function cardinalStep(step: Cell): Cell {
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

function patternCells(state: RoomState): Cell[] {
  if (shotsLeft(state) === 0) return [];
  const weapon = weaponById(state.weapon);
  const step = attackStep(state);
  if (weapon.id === "shotgun") return shotgunCells(state, step);
  if (weapon.shape === "fan") return fanCells(state, weapon.range, step);
  if (weapon.shape === "around") return aroundCells(state);
  return lineCells(state, weapon.range, step);
}

/** Посох и пистолет не проходят дальше первой цели. */
function stopsOnFirst(weapon: WeaponDef): boolean {
  return weapon.element !== undefined || weapon.id === "pistol";
}

function attackStep(state: RoomState): Cell {
  return cardinalStep(state.look ?? DIRS[state.hero.facing]);
}

/** Пирамида: клетка прямо перед героем и три клетки на следующем шаге. */
function shotgunCells(state: RoomState, step: Cell): Cell[] {
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
function fanCells(state: RoomState, depth: number, step: Cell): Cell[] {
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

function lineCells(state: RoomState, reach: number, step: Cell): Cell[] {
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

function boardUnits(state: RoomState): Fighter[] {
  const units: Fighter[] = [];
  if (state.hero.hp > 0) units.push(state.hero);
  for (const monster of state.monsters) if (onBoard(monster)) units.push(monster);
  return units;
}

function unitsIn(state: RoomState, cells: readonly Cell[], except: Fighter | null = null): Fighter[] {
  return boardUnits(state).filter((unit) => unit !== except && hasCell(cells, unit));
}

/** Diamond Blink без траты заряда. Leap садится сюда же. */
function landingCells(state: RoomState): Cell[] {
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
  return isFloor(state.room, x, y) && !isBlocked(state.room, x, y) && !taken(state, x, y) && !kegAt(state, x, y);
}

/** Dungeon пройдена, когда не осталось живых монстров. Споры дверь не держат. */
function cleared(state: RoomState): boolean {
  return state.monsters.every((monster) => monster.hp <= 0 || monster.role === "spore");
}

function finish(state: RoomState): Outcome {
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

function tickMeter(state: RoomState, refreshed: boolean): void {
  if (refreshed || state.meterTurns <= 0) return;
  state.meterTurns -= 1;
  if (state.meterTurns === 0) state.meterLevel = 0;
}

/** Число пассивки до щита, крита, силы оружия и процента урона. */
function passiveAmount(state: RoomState, target: Fighter, targets: readonly Fighter[]): number {
  const weapon = weaponById(state.weapon);
  const base = state.weaponHit === null ? weapon.hitDamage : state.weaponHit;
  if (weapon.id === "axe") return base - 10 * (targets.length - 1);
  if (weapon.id === "spear") return inFront(state, target) ? 60 : 100;
  if (weapon.id === "shotgun") return inFront(state, target) ? 180 : 80;
  return base;
}

function dealtHit(state: RoomState, passive: number): number {
  const hit = passive + state.weaponPower + state.meterLevel * METER_STEP;
  return hit * critFactor(state.critChance, state.critShare);
}

function inFront(state: RoomState, target: Fighter): boolean {
  const step = attackStep(state);
  return target.x === state.hero.x + step.x && target.y === state.hero.y + step.y;
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

/** Новая лужа. Повторная запись на ту же клетку начинает срок заново. */
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
  if (burst.length > 0) {
    state.fx.push({ kind: "area", cells: burst, tone: "fire" });
    touchKegs(state, burst, rng);
  }
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
  let factor = armorFactor(armorRating(unit, type));
  if (type !== "physical" && unit.oil > 0) factor *= ELEMENTS.oilFactor;
  if (type === "physical" && unit.wet > 0) factor *= ELEMENTS.wetFactor;
  return factor;
}

/** Физическое — DEF. У героя стихия сидит в своём сопротивлении, у монстра — в MDEF. */
function armorRating(unit: Fighter, type: DamageType): number {
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

function heroOutgoing(state: RoomState, amount: number, type: DamageType, ability: boolean): number {
  let value = amount;
  if (ability) value += state.abilityPower;
  const percent = state.bonusDamage[type] ?? 0;
  if (percent) value *= 1 + percent / 100;
  return value;
}

/** Огонь и яд по автоматону режутся пополам уже после брони. Это не иммунитет. */
function resistFactor(unit: Fighter, type: DamageType): number {
  if (unit.role === "automaton" && (type === "fire" || type === "poison")) return KIT.automaton.resist;
  return 1;
}

function markHit(state: RoomState, cell: Cell, dealt: number, type: DamageType, crit = false): void {
  if (dealt <= 0) return;
  state.hits.push({ x: cell.x, y: cell.y, amount: dealt, type, crit });
}

/** Удар способностью, укусом или оружием. Возвращает урон после брони, стихий и иммунитета. */
function hurt(
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
function wardAbsorb(state: RoomState, dealt: number, type: DamageType): number {
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
function dose(state: RoomState, target: Fighter, stacks: number, source: Fighter | null, rng: () => number, ability = false): void {
  if (target.hp <= 0 || immuneTo(target, "poison")) return;
  target.poison += stacks;
  target.poisonWindow = ELEMENTS.poisonWindow;
  landed(state, target, 0, source, rng, ability);
}

function landed(state: RoomState, target: Fighter, dealt: number, source: Fighter | null, rng: () => number, ability = false): void {
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
function heroShieldPoints(state: RoomState, target: Fighter): number {
  const id = state.weapon;
  if (id === "sword" || id === "axe" || id === "dual" || id === "spear") return 2;
  return inFront(state, target) ? 2 : 1;
}

/** Damage монстра по монстру снимает 1. */
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
  const kegBlocked = (x: number, y: number): boolean => kegAt(state, x, y) !== undefined;
  const dist = distancesTo(room, state.hero, kegBlocked);
  const here = dist[monster.y * room.w + monster.x] ?? -1;
  if (here <= 0) return "";
  const options = ORTHO.map((step) => ({ x: monster.x + step.x, y: monster.y + step.y })).filter(
    (cell) => !isBlocked(room, cell.x, cell.y) && !taken(state, cell.x, cell.y) && !kegAt(state, cell.x, cell.y) && dist[cell.y * room.w + cell.x] === here - 1,
  );
  const next = pick(options, rng);
  if (!next) return "";
  faceToward(monster, next);
  monster.x = next.x;
  monster.y = next.y;
  return breakObject(state, next, rng) ? "Object broken." : "";
}

/** Укус вплотную по ортогонали, иначе шаг к герою. Без автоатаки монстр не подходит. */
function biteOrStep(state: RoomState, monster: Fighter, rng: () => number): string {
  const bite = specOf(monster)?.bite ?? 0;
  if (bite <= 0) return "";
  if (manhattan(monster, state.hero) === 1) {
    faceToward(monster, state.hero);
    hurt(state, state.hero, bite, "physical", monster, rng);
    state.strike = { from: spot(monster), to: spot(state.hero) };
    return "The monster bites in melee.";
  }
  return stepToward(state, monster, rng);
}

/** Прямая до клетки игрока включительно. Стена или яма — рывка нет. */
function rushLine(state: RoomState, monster: Fighter): Cell[] {
  const hero = state.hero;
  if (hero.hp <= 0 || (hero.x !== monster.x && hero.y !== monster.y)) return [];
  const stepX = Math.sign(hero.x - monster.x);
  const stepY = Math.sign(hero.y - monster.y);
  const cells: Cell[] = [];
  let x = monster.x;
  let y = monster.y;
  while (x !== hero.x || y !== hero.y) {
    x += stepX;
    y += stepY;
    if (isBlocked(state.room, x, y) || isPit(state.room, x, y) || kegAt(state, x, y)) return [];
    cells.push({ x, y });
  }
  return cells;
}

/** Тело проходит всю помеченную линию. Чужая клетка останавливает. Клетка игрока — место прибытия. */
function houndStop(state: RoomState, monster: Fighter, line: readonly Cell[]): Cell | null {
  let land: Cell | null = null;
  for (const cell of line) {
    if (kegAt(state, cell.x, cell.y)) break;
    const other = state.monsters.some((unit) => unit !== monster && onBoard(unit) && sameCell(unit, cell));
    if (other) break;
    land = cell;
    if (state.hero.hp > 0 && sameCell(state.hero, cell)) break;
  }
  return land;
}

function planDash(state: RoomState, monster: Fighter, max: number, rng: () => number): Cell[] {
  const hero = state.hero;
  const room = state.room;
  const dist = distancesTo(room, hero, (x, y) => kegAt(state, x, y) !== undefined);
  let at = spot(monster);
  const path: Cell[] = [];
  for (let step = 0; step < max && manhattan(hero, at) > 1; step += 1) {
    const here = dist[at.y * room.w + at.x] ?? -1;
    if (here <= 1) break;
    const options = ORTHO.map((move) => ({ x: at.x + move.x, y: at.y + move.y })).filter(
      (cell) => !isBlocked(room, cell.x, cell.y) && !taken(state, cell.x, cell.y) && !kegAt(state, cell.x, cell.y) && dist[cell.y * room.w + cell.x] === here - 1,
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

/** Клетка игрока, если он на одной линии. Иначе пёс идёт шагом. */
function dogTurn(state: RoomState, monster: Fighter, rng: () => number): string {
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
function goblinTurn(state: RoomState, monster: Fighter, rng: () => number): string {
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
function houndTurn(state: RoomState, monster: Fighter, rng: () => number): string {
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

function spiderTurn(state: RoomState, monster: Fighter, rng: () => number): string {
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

function corpseTurn(state: RoomState, monster: Fighter, rng: () => number): string {
  const hero = state.hero;
  if (!monster.spent && manhattan(monster, hero) <= KIT.corpse.reach && monster.root === 0) {
    monster.spent = true;
    monster.windup = windup("jump", KIT.corpse.delay, square(state, hero, KIT.corpse.radius), hero);
    faceToward(monster, hero);
    return "The corpse readies a leap.";
  }
  return biteOrStep(state, monster, rng);
}

function golemTurn(state: RoomState, monster: Fighter, rng: () => number): string {
  if (ready(monster, "stone")) {
    const target = spot(state.hero);
    monster.windup = windup("stone", KIT.golem.delay, [target], target);
    monster.cooldowns.stone = KIT.golem.cooldown;
    faceToward(monster, target);
    return "The golem winds up a stone.";
  }
  return biteOrStep(state, monster, rng);
}

function sleepTurn(monster: Fighter): string {
  monster.hp = Math.min(monster.maxHp, monster.hp + monster.maxHp * KIT.bat.heal);
  if (monster.hp >= monster.maxHp) monster.mode = "ground";
  return "The bloodsucker sleeps and heals.";
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
      return "The bloodsucker swooped.";
    }
  }
  return biteOrStep(state, monster, rng);
}

function slimeTurn(state: RoomState, monster: Fighter, rng: () => number): string {
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

function roomHasCleanFloor(state: RoomState): boolean {
  for (let y = 0; y < state.room.h; y += 1) {
    for (let x = 0; x < state.room.w; x += 1) {
      if (holdsGround(state, x, y) && groundAt(state, x, y)?.kind !== "poison") return true;
    }
  }
  return false;
}

/** След до KIT.slime.steps клеток. Между шагами можно повернуть. Яд пол не закрывает. */
function slimePaths(state: RoomState, monster: Fighter): Cell[][] {
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
function slimeCover(state: RoomState, paths: Cell[][]): Cell[][] {
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

function nearestClean(state: RoomState, from: Cell): number {
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
      return "The skeleton raises its sword.";
    }
  }
  return biteOrStep(state, monster, rng);
}

function spiritTurn(state: RoomState, monster: Fighter, _rng: () => number): string {
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

function mushroomTurn(state: RoomState, monster: Fighter, rng: () => number): string {
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

function sporeTurn(state: RoomState, monster: Fighter, rng: () => number): string {
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

function emberTurn(state: RoomState, monster: Fighter, rng: () => number): string {
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
function emberGone(state: RoomState, monster: Fighter, rng: () => number): string {
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

function wormTurn(state: RoomState, monster: Fighter, rng: () => number): string {
  if (ready(monster, "dig") && monster.root === 0) {
    state.fx.push({ kind: "area", cells: [spot(monster)], tone: "earth", act: "dig" });
    monster.mode = "under";
    return "The worm burrowed.";
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
    return "The ground shakes under the hero.";
  }
  return "";
}

function acolyteTurn(state: RoomState, monster: Fighter): string {
  if (ready(monster, "spires")) {
    monster.windup = windup("spires", KIT.acolyte.delay, square(state, state.hero, KIT.acolyte.radius), state.hero);
    monster.cooldowns.spires = KIT.acolyte.cooldown;
    return "The acolyte raises spires.";
  }
  return "";
}

function chestTurn(state: RoomState, monster: Fighter, rng: () => number): string {
  const hero = state.hero;
  if (manhattan(monster, hero) > KIT.chest.reach) {
    monster.windup = windup("tongue", KIT.chest.delay, square(state, hero, KIT.chest.radius), hero);
    faceToward(monster, hero);
    return "The chest lashed its tongue.";
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
    return "The gargoyle took off.";
  }
  return biteOrStep(state, monster, rng);
}

/** Полёт: каждый ход метит клетку героя под камень. После четырёх камней — посадка. */
function gargoyleAir(state: RoomState, monster: Fighter): string {
  if (monster.phase < KIT.gargoyle.stones) {
    markRock(state, monster);
    monster.phase += 1;
    return "The gargoyle marks a stone.";
  }
  monster.windup = windup("land", KIT.gargoyle.landDelay, square(state, state.hero, KIT.gargoyle.radius), state.hero);
  return "The gargoyle comes in to land.";
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

function automatonTurn(state: RoomState, monster: Fighter, rng: () => number): string {
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
function dangerAt(state: RoomState, monster: Fighter, cell: Cell): number {
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

function stepToDanger(state: RoomState, monster: Fighter, rng: () => number): string {
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

const KEG_ELEMENTS: readonly GroundKind[] = ["fire", "water", "ice", "poison", "oil"];
let detonating = false;

function kegAt(state: RoomState, x: number, y: number): Keg | undefined {
  return state.kegs.find((keg) => keg.x === x && keg.y === y);
}

function explodeKeg(state: RoomState, keg: Keg, rng: () => number, seen: Set<Keg>): void {
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

function touchKegs(state: RoomState, cells: readonly Cell[], rng: () => number): void {
  if (detonating) return;
  const hits = state.kegs.filter((keg) => cells.some((cell) => cell.x === keg.x && cell.y === keg.y));
  if (hits.length === 0) return;
  detonating = true;
  const seen = new Set<Keg>();
  for (const keg of hits) explodeKeg(state, keg, rng, seen);
  detonating = false;
}

function resolveSwap(state: RoomState, monster: Fighter, cell: Cell, rng: () => number): string {
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

function roleTurn(state: RoomState, monster: Fighter, rng: () => number): string {
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

function resolveWindup(state: RoomState, monster: Fighter, cast: Windup, rng: () => number): string {
  const note = resolveCast(state, monster, cast, rng);
  if (cast.kind !== "swap" && cast.kind !== "tongue" && cast.kind !== "spires") touchKegs(state, cast.cells, rng);
  return note;
}

function resolveCast(state: RoomState, monster: Fighter, cast: Windup, rng: () => number): string {
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
  const raw = resistFactor(unit, type) * amount * damageFactor(unit, type);
  const dealt = unit === state.hero ? wardAbsorb(state, raw, type) : raw;
  if (dealt <= 0) return;
  unit.hp -= dealt;
  markHit(state, unit, dealt, type);
  touchKegs(state, [unit], rng);
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
function round(state: RoomState, rng: () => number): string {
  const world = monsterPhase(state, rng);
  if (state.hero.hp > 0) {
    if (!cleared(state)) tickWorld(state, rng);
    heroZones(state, rng);
  }
  return world;
}

/* ---------- ход героя ---------- */

function cellKey(cell: Cell): string {
  return `${cell.x},${cell.y}`;
}

/** Свободная для героя клетка: монстр и тело её держат, сам герой — нет. */
function openForHero(state: RoomState, x: number, y: number): boolean {
  return isFloor(state.room, x, y) && !isBlocked(state.room, x, y) && !occupied(state, x, y) && !kegAt(state, x, y);
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

function openChest(state: RoomState, cell: Cell, rng: () => number): boolean {
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

function openChests(state: RoomState, cells: readonly Cell[], rng: () => number): number {
  let count = 0;
  for (const cell of cells) if (openChest(state, cell, rng)) count += 1;
  return count;
}

function breakChairs(state: RoomState, cells: readonly Cell[], rng: () => number): number {
  let count = 0;
  for (const cell of cells) if (breakChair(state, cell, rng)) count += 1;
  return count;
}

/** Ближайшая клетка пола. Золото может лежать стопкой, вещь клетку уже занимает. */
function goldCell(state: RoomState, origin: Cell, rng: () => number): Cell | null {
  return nearestDropCell(state, origin, lootTaken(state), rng);
}

function lootTaken(state: RoomState): Set<string> {
  return new Set(state.loot.map((loot) => `${loot.x},${loot.y}`));
}

function dropTaken(state: RoomState): Set<string> {
  const taken = lootTaken(state);
  for (const pile of state.piles) taken.add(`${pile.x},${pile.y}`);
  return taken;
}

function nearestDropCell(state: RoomState, origin: Cell, taken: ReadonlySet<string>, rng: (() => number) | null): Cell | null {
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

function releaseParcels(state: RoomState, origin: Cell, match: (parcel: LootParcel) => boolean): void {
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

function takeGold(state: RoomState): number {
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

function doorsNote(state: RoomState): string {
  return ` Enemy down. Blink +1.${state.exits.length > 0 ? " Doors are open." : ""}`;
}

/**
 * После действия героя ходит мир: монстры, потом тики.
 * Пока герой в стане, мир не даёт ему ход: раунды идут дальше, его кулдауны стоят.
 */
function flushSpoils(state: RoomState): void {
  if (state.spoilNames.length === 0) return;
  const names = state.spoilNames.splice(0).join(", ");
  state.note = `${state.note} ${names} dropped.`.trim();
}

function afterAction(state: RoomState, refreshed: boolean, rng: () => number): void {
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

function struck(state: RoomState): Fighter[] {
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

function swordHit(state: RoomState): number {
  return state.weaponHit === null ? weaponById(state.weapon).hitDamage : state.weaponHit;
}

function facingRay(state: RoomState): Cell[] {
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

function sameSpot(a: Cell, b: Cell): boolean {
  return a.x === b.x && a.y === b.y;
}

function monsterAt(state: RoomState, cell: Cell): Fighter | undefined {
  return state.monsters.find((monster) => onBoard(monster) && monster.x === cell.x && monster.y === cell.y);
}

const BOLT_CAP = 5;
const WARD_TURNS = 5;
const WARD_HP = 100;
const QUAKE_TURNS = 4;
const ARROW_STACKS = 1;
const BLIZZARD_REACH = 2;
const NEAR = 1;

/** Ромб Blink, включая занятые клетки. Заряд Blink не нужен. */
function diamondCells(state: RoomState): Cell[] {
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

function castReady(state: RoomState, ability: RunAbility, cell: Cell | null): boolean {
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
function poisonHp(state: RoomState, target: Fighter, amount: number, rng: () => number): void {
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

function castBolt(state: RoomState, ability: RunAbility, cell: Cell, rng: () => number): void {
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

function castWard(state: RoomState, ability: RunAbility): void {
  state.ward = { hp: WARD_HP, left: WARD_TURNS, damage: ability.damage };
  state.fx.push({ kind: "area", cells: square(state, state.hero, NEAR), tone: "fire", act: "ward" });
  state.note = "Fire Shield.";
}

function castArrow(state: RoomState, ability: RunAbility, cell: Cell, rng: () => number): void {
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

function castQuake(state: RoomState, ability: RunAbility, cell: Cell): void {
  state.quakes.push({ x: cell.x, y: cell.y, left: QUAKE_TURNS, damage: ability.damage });
  state.fx.push({ kind: "area", cells: square(state, cell, NEAR), tone: "earth", act: "quake" });
  state.note = "Earthquake.";
}

function castShard(state: RoomState, ability: RunAbility, cell: Cell, rng: () => number): void {
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

function tickWard(state: RoomState, rng: () => number): void {
  const ward = state.ward;
  if (!ward) return;
  const cells = square(state, state.hero, NEAR);
  for (const unit of unitsIn(state, cells, state.hero)) hurt(state, unit, ward.damage, "fire", state.hero, rng, true);
  touchKegs(state, cells, rng);
  ward.left -= 1;
  if (ward.left <= 0) state.ward = null;
  if (cells.length > 0) state.fx.push({ kind: "area", cells, tone: "fire", act: "ward" });
}

function tickBlizzard(state: RoomState, rng: () => number): void {
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

function tickQuakes(state: RoomState, rng: () => number): void {
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
function heroZones(state: RoomState, rng: () => number): void {
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
