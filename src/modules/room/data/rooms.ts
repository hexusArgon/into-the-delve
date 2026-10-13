export type Facing = "up" | "down" | "left" | "right";

export type Side = "north" | "south" | "east" | "west";

export type StampKind = "wall" | "pillar" | "sarcophagus" | "pit";

/** Тип облика. Сейчас в каталоге только тёмное подземелье. */
export type RoomTheme = "crypt" | "cave" | "prison" | "hall" | "quarters" | "chapel" | "kitchen" | "library";

export interface Stamp {
  kind: StampKind;
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Во что попадает меч, если щита уже нет. */
export type BodyKind = "flesh" | "iron" | "bone" | "stone";

export interface Spawn {
  x: number;
  y: number;
  facing: Facing;
  body?: BodyKind;
}

export interface Decor {
  kind: "bones";
  x: number;
  y: number;
}

/** Клетка пола у проёма и сторона, в которую из неё выходят. Одна дверь на сторону. */
export interface Door {
  side: Side;
  x: number;
  y: number;
}

export interface RoomPattern {
  id: string;
  name: string;
  /** Сейчас у всех паттернов тёмное подземелье (`crypt`). Другие типы в коде есть, на комнаты не назначены. */
  theme?: RoomTheme;
  w: number;
  h: number;
  /** Силуэт по рядам: `.` — пол, `x` — пусто. Без силуэта комната — весь прямоугольник. */
  shape?: readonly string[];
  /** Где стоит герой, если комната — начало этажа. */
  hero: Spawn;
  monster: Spawn;
  doors: readonly Door[];
  stamps: readonly Stamp[];
  decor: readonly Decor[];
}

/**
 * Комнаты и штампы бывают только этих размеров (ширина, высота).
 * Списки повторяют каталог обычного боя cp1 и не расширяются без нового размера в каталоге.
 */
export const ROOM_SIZES: readonly (readonly [number, number])[] = [
  [6, 12], [8, 8], [8, 12], [10, 10], [10, 12], [10, 14], [10, 20],
  [12, 6], [12, 10], [12, 12], [12, 18], [13, 13], [13, 15],
  [14, 8], [14, 10], [14, 14], [15, 15], [16, 8], [18, 10], [18, 12], [24, 18],
];

export const STAMP_SIZES: readonly (readonly [number, number])[] = [
  [1, 2], [1, 3], [1, 4], [2, 1], [2, 2], [2, 3], [3, 1], [3, 2], [3, 3], [4, 1], [4, 3],
];

/** До двери монстр стартует не ближе этого числа шагов: вошедший не получает удар в первый же ход. */
export const MONSTER_DOOR_GAP = 4;

const wall = (x: number, y: number, w: number, h: number): Stamp => ({ kind: "wall", x, y, w, h });
const pillar = (x: number, y: number): Stamp => ({ kind: "pillar", x, y, w: 2, h: 2 });
const sarcophagus = (x: number, y: number): Stamp => ({ kind: "sarcophagus", x, y, w: 3, h: 2 });
const pit = (x: number, y: number, w: number, h: number): Stamp => ({ kind: "pit", x, y, w, h });
const bones = (x: number, y: number): Decor => ({ kind: "bones", x, y });
const door = (side: Side, x: number, y: number): Door => ({ side, x, y });

export const ROOMS: readonly RoomPattern[] = [
  {
    id: "cp1_20_12X12_9001",
    name: "Column Hall",
    theme: "crypt",
    w: 12,
    h: 12,
    hero: { x: 1, y: 6, facing: "right" },
    monster: { x: 6, y: 4, facing: "down" },
    doors: [door("north", 6, 0), door("south", 5, 11), door("west", 0, 6), door("east", 11, 5)],
    stamps: [pillar(2, 2), pillar(8, 2), pillar(2, 8), pillar(8, 8)],
    decor: [bones(4, 1), bones(7, 10)],
  },
  {
    id: "cp1_20_10X10_9001",
    name: "Crypt",
    theme: "crypt",
    w: 10,
    h: 10,
    hero: { x: 4, y: 9, facing: "up" },
    monster: { x: 4, y: 4, facing: "down" },
    doors: [door("north", 4, 0), door("south", 5, 9), door("west", 0, 4), door("east", 9, 5)],
    stamps: [sarcophagus(1, 2), sarcophagus(6, 2), sarcophagus(1, 6), sarcophagus(6, 6)],
    decor: [bones(0, 8), bones(9, 1)],
  },
  {
    id: "cp1_20_13X13_9001",
    name: "Cave-in",
    theme: "crypt",
    w: 13,
    h: 13,
    shape: [
      "xxxxxx.xxxxxx",
      "xx.........xx",
      ".............",
      ".............",
      "xx.........xx",
      "xxxxxx.xxxxxx",
      "xxxxxx.xxxxxx",
      "xx.........xx",
      "xx.........xx",
      "x...........x",
      "x............",
      "xx.........xx",
      "xxxxxx.xxxxxx",
    ],
    hero: { x: 3, y: 3, facing: "down" },
    monster: { x: 9, y: 9, facing: "left" },
    doors: [door("north", 6, 0), door("south", 6, 12), door("west", 0, 2), door("east", 12, 10)],
    stamps: [sarcophagus(2, 8), pit(8, 10, 2, 2)],
    decor: [bones(10, 3), bones(4, 11)],
  },
  {
    id: "cp1_20_14X10_9001",
    name: "Catacombs",
    theme: "crypt",
    w: 14,
    h: 10,
    hero: { x: 0, y: 5, facing: "right" },
    monster: { x: 9, y: 5, facing: "left" },
    doors: [door("north", 3, 0), door("south", 10, 9), door("west", 0, 4), door("east", 13, 5)],
    stamps: [
      wall(2, 0, 1, 3),
      wall(5, 0, 1, 3),
      wall(8, 0, 1, 3),
      wall(11, 0, 1, 3),
      wall(2, 7, 1, 3),
      wall(5, 7, 1, 3),
      wall(8, 7, 1, 3),
      wall(11, 7, 1, 3),
    ],
    decor: [bones(0, 0), bones(4, 9), bones(10, 0), bones(13, 8)],
  },
  {
    id: "cp1_20_14X14_9001",
    name: "Crossroads",
    theme: "crypt",
    w: 14,
    h: 14,
    hero: { x: 1, y: 6, facing: "right" },
    monster: { x: 7, y: 7, facing: "left" },
    doors: [door("north", 6, 0), door("south", 7, 13), door("west", 0, 6), door("east", 13, 7)],
    stamps: [wall(3, 3, 3, 3), wall(8, 3, 3, 3), wall(3, 8, 3, 3), wall(8, 8, 3, 3)],
    decor: [bones(0, 0), bones(13, 13), bones(6, 12)],
  },
  {
    id: "cp1_20_12X12_9002",
    name: "Oubliette",
    theme: "crypt",
    w: 12,
    h: 12,
    hero: { x: 5, y: 10, facing: "up" },
    monster: { x: 5, y: 1, facing: "down" },
    doors: [door("north", 1, 0), door("south", 5, 11), door("west", 0, 8), door("east", 11, 8)],
    stamps: [
      wall(3, 0, 1, 3),
      wall(7, 0, 1, 3),
      wall(0, 3, 2, 1),
      wall(3, 3, 3, 1),
      wall(7, 3, 2, 1),
      wall(10, 3, 2, 1),
      pillar(2, 7),
      pillar(8, 7),
    ],
    decor: [bones(0, 2), bones(11, 1)],
  },
  {
    id: "cp1_20_13X13_9002",
    name: "Rotunda",
    theme: "crypt",
    w: 13,
    h: 13,
    shape: [
      "xxxx.....xxxx",
      "xxx.......xxx",
      "xx.........xx",
      "x...........x",
      ".............",
      ".............",
      ".............",
      ".............",
      ".............",
      "x...........x",
      "xx.........xx",
      "xxx.......xxx",
      "xxxx.....xxxx",
    ],
    hero: { x: 6, y: 10, facing: "up" },
    monster: { x: 9, y: 3, facing: "left" },
    doors: [door("north", 6, 0), door("south", 6, 12), door("west", 0, 6), door("east", 12, 6)],
    stamps: [wall(5, 5, 3, 3)],
    decor: [bones(2, 8), bones(10, 4)],
  },
  {
    id: "cp1_20_14X14_9002",
    name: "Cross Hall",
    theme: "crypt",
    w: 14,
    h: 14,
    shape: [
      "xxxxx....xxxxx",
      "xxxxx....xxxxx",
      "xxxxx....xxxxx",
      "xxxxx....xxxxx",
      "xxxxx....xxxxx",
      "..............",
      "..............",
      "..............",
      "..............",
      "xxxxx....xxxxx",
      "xxxxx....xxxxx",
      "xxxxx....xxxxx",
      "xxxxx....xxxxx",
      "xxxxx....xxxxx",
    ],
    hero: { x: 6, y: 11, facing: "up" },
    monster: { x: 10, y: 8, facing: "left" },
    doors: [door("north", 6, 0), door("south", 7, 13), door("west", 0, 6), door("east", 13, 7)],
    stamps: [pit(6, 6, 2, 2)],
    decor: [bones(2, 8), bones(11, 5)],
  },
  {
    id: "cp1_20_12X12_9003",
    name: "Fracture",
    theme: "crypt",
    w: 12,
    h: 12,
    shape: [
      ".....xxxxxxx",
      ".....xxxxxxx",
      ".....xxxxxxx",
      ".....xxxxxxx",
      ".....xxxxxxx",
      ".....xxxxxxx",
      ".....xxxxxxx",
      "............",
      "............",
      "............",
      "............",
      "............",
    ],
    hero: { x: 3, y: 10, facing: "right" },
    monster: { x: 2, y: 5, facing: "down" },
    doors: [door("north", 2, 0), door("south", 5, 11), door("west", 0, 9), door("east", 11, 9)],
    stamps: [sarcophagus(7, 9)],
    decor: [bones(4, 0), bones(11, 11)],
  },
  {
    id: "cp1_20_15X15_9001",
    name: "Cave",
    theme: "crypt",
    w: 15,
    h: 15,
    shape: [
      "xxxxx.....xxxxx",
      "xxx.........xxx",
      "xx...........xx",
      "xx............x",
      "x.............x",
      "x..............",
      "...............",
      "...............",
      "x..............",
      "x.............x",
      "xx............x",
      "xx...........xx",
      "xxx.........xxx",
      "xxxx.......xxxx",
      "xxxxxx...xxxxxx",
    ],
    hero: { x: 7, y: 12, facing: "up" },
    monster: { x: 10, y: 4, facing: "left" },
    doors: [door("north", 7, 0), door("south", 7, 14), door("west", 0, 7), door("east", 14, 6)],
    stamps: [],
    decor: [bones(3, 9), bones(12, 11)],
  },
  {
    id: "cp1_20_18X10_9001",
    name: "Niche Gallery",
    theme: "crypt",
    w: 18,
    h: 10,
    shape: [
      "x..xxx..xxx..xx..x",
      "x..xxx..xxx..xx..x",
      "x..xxx..xxx..xx..x",
      "..................",
      "..................",
      "..................",
      "..................",
      "xxx..xxx..xxx..xxx",
      "xxx..xxx..xxx..xxx",
      "xxx..xxx..xxx..xxx",
    ],
    hero: { x: 1, y: 5, facing: "right" },
    monster: { x: 14, y: 4, facing: "left" },
    doors: [door("north", 6, 0), door("south", 8, 9), door("west", 0, 4), door("east", 17, 5)],
    stamps: [pillar(5, 4), pillar(11, 4)],
    decor: [bones(1, 0), bones(16, 1), bones(3, 9), bones(13, 8)],
  },
  {
    id: "cp1_20_13X13_9003",
    name: "Diamond",
    theme: "crypt",
    w: 13,
    h: 13,
    shape: [
      "xxxxxx.xxxxxx",
      "xxxxx...xxxxx",
      "xxxx.....xxxx",
      "xxx.......xxx",
      "xx.........xx",
      "x...........x",
      ".............",
      "x...........x",
      "xx.........xx",
      "xxx.......xxx",
      "xxxx.....xxxx",
      "xxxxx...xxxxx",
      "xxxxxx.xxxxxx",
    ],
    hero: { x: 6, y: 10, facing: "up" },
    monster: { x: 8, y: 8, facing: "left" },
    doors: [door("north", 6, 0), door("south", 6, 12), door("west", 0, 6), door("east", 12, 6)],
    stamps: [sarcophagus(5, 5)],
    decor: [bones(3, 6), bones(9, 4)],
  },
  {
    id: "cp1_20_12X12_9004",
    name: "Well",
    theme: "crypt",
    w: 12,
    h: 12,
    shape: [
      "xx........xx",
      "x..........x",
      "............",
      "............",
      "............",
      "............",
      "............",
      "............",
      "............",
      "............",
      "x..........x",
      "xx........xx",
    ],
    hero: { x: 5, y: 9, facing: "up" },
    monster: { x: 9, y: 2, facing: "left" },
    doors: [door("north", 5, 0), door("south", 6, 11), door("west", 0, 5), door("east", 11, 6)],
    stamps: [pit(4, 4, 4, 3)],
    decor: [bones(2, 2), bones(9, 10)],
  },
  {
    id: "cp1_20_14X8_9001",
    name: "Ledges",
    theme: "crypt",
    w: 14,
    h: 8,
    shape: [
      "xxxxxxxx......",
      "xxxxxx........",
      "xxxx..........",
      "xx............",
      "............xx",
      "..........xxxx",
      "........xxxxxx",
      "......xxxxxxxx",
    ],
    hero: { x: 2, y: 5, facing: "right" },
    monster: { x: 9, y: 3, facing: "left" },
    doors: [door("north", 10, 0), door("south", 3, 7), door("west", 0, 5), door("east", 13, 1)],
    stamps: [pillar(6, 3)],
    decor: [bones(12, 2), bones(1, 6)],
  },
];
