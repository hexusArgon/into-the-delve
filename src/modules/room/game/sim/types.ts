/** Типы комнаты, бойца и хода; направления и соседние клетки. Часть симуляции комнаты, вход — ../sim.ts. */
import type { Attributes } from "../../data/attributes.ts";
import type { RunAbility } from "../../data/hero-abilities.ts";
import type { InstanceKind } from "../../data/instances.ts";
import type { DamageType, MonsterRole } from "../../data/monsters.ts";
import type { BodyKind, Decor, Door, Facing, RoomTheme, Side, Stamp } from "../../data/rooms.ts";
import type { WeaponId } from "../../data/weapons.ts";
import type { DamageHit } from "../damage-float.ts";

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

export const BACK: Record<Dir, Dir> = { up: "down", down: "up", left: "right", right: "left" };

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

export const ORTHO: Cell[] = [
  { x: 1, y: 0 },
  { x: -1, y: 0 },
  { x: 0, y: 1 },
  { x: 0, y: -1 },
];

export const DIAGONAL: Cell[] = [
  { x: 1, y: 1 },
  { x: -1, y: 1 },
  { x: 1, y: -1 },
  { x: -1, y: -1 },
];

export const AROUND: Cell[] = [...ORTHO, ...DIAGONAL];
