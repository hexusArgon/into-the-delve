import { SHIELD } from "../game/rules.ts";
import type { BodyKind } from "./rooms.ts";

/** Тип урона. Без подписи — физический. Урон землёй оставляет на клетке масло. */
export type DamageType = "physical" | "fire" | "earth" | "poison" | "water" | "ice";

/** Ручки вкладки «Способности», строки «Стихии». */
export const ELEMENTS = {
  fireTick: 10,
  fireTurns: 3,
  /** В конце окна остаток стаков яда сгорает. */
  poisonWindow: 5,
  /** Стак яда −1 раз в столько ходов, не каждый ход. */
  poisonStep: 2,
  oilTurns: 3,
  /** Масло: любой урон, кроме физического. */
  oilFactor: 1.5,
  /** Взрыв масла от огня. Это урон огнём. */
  oilBlast: 80,
  wetTurns: 3,
  /** Вода: физический урон. */
  wetFactor: 1.5,
  iceStun: 1,
  iceStunCooldown: 3,
  /** Новая лужа живёт столько ходов, потом клетка снова обычная. */
  puddleTurns: 5,
} as const;

export type MonsterRole =
  | "dog"
  | "spider"
  | "corpse"
  | "golem"
  | "bat"
  | "slime"
  | "skeleton"
  | "rat"
  | "spirit"
  | "goblin"
  | "mushroom"
  | "ember"
  | "worm"
  | "acolyte"
  | "hound"
  | "chest"
  | "gargoyle"
  | "drowned"
  | "whisper"
  | "centipede"
  | "spore";

/** Строка таблицы монстров. MaxHp — точная дробь колонки U, у рарных 800. */
export interface MonsterDef {
  id: string;
  role: MonsterRole;
  name: string;
  who: string;
  body: BodyKind;
  maxHp: number;
  /** Укус вплотную. 0 — автоатаки нет. */
  bite: number;
  shield: number;
  /** 0 урона и отказ дебафа этой стихии. Иммунитет к земле включает масло. */
  immune: readonly DamageType[];
  rare: boolean;
  /** Входит в пул боевых комнат. */
  spawn: boolean;
}

/**
 * Вкладка «Способности». КД, задержки, радиусы и урон — с листа, не подбирать.
 * Радиус 1 — квадрат 3×3 по Чебышёву. Кольца: центр с задержкой 1, каждое следующее на ход позже.
 */
export const KIT = {
  dog: { dash: 4, damage: 30, cooldown: 4, delay: 1 },
  spider: { range: 4, stacks: 1, cooldown: 3 },
  corpse: { reach: 6, delay: 2, radius: 1, stacks: 1 },
  golem: { delay: 1, damage: 25, cooldown: 3 },
  bat: { cooldown: 3, sleepBelow: 0.5, heal: 0.2 },
  slime: { steps: 2, stacks: 1 },
  skeleton: { reach: 2, depth: 2, width: 3, delay: 1, damage: 35, cooldown: 4 },
  spirit: { damage: 20, cooldown: 3 },
  goblin: { dash: 2, damage: 20, cooldown: 2 },
  mushroom: { keep: 4, cooldown: 2 },
  spore: { fuse: 1, radius: 1, stacks: 1 },
  ember: { pause: 1, delay: 1, radius: 1, damage: 40, cooldown: 4 },
  worm: { delay: 2, radius: 1, damage: 70, push: 2, cooldown: 3 },
  /** Аура — квадрат 15×15 вокруг послушника: так решил дизайнер, лист пишет 8×8. */
  acolyte: { delay: 2, radius: 1, root: 2, cooldown: 7, aura: 7, vampirism: 1 },
  hound: { dash: 4, damage: 30, cooldown: 4 },
  chest: { reach: 4, delay: 1, radius: 1, stun: 3 },
  gargoyle: { stones: 4, delay: 1, stone: 35, stonePush: 1, landDelay: 1, radius: 1, land: 90, landPush: 1, rest: 5 },
  drowned: { rings: 4, geyser: 40, geyserCooldown: 8, throwDelay: 1, radius: 1, throwDamage: 30, throwStun: 1, throwCooldown: 2 },
  whisper: { charmCooldown: 2, radius: 1, shards: 10, rings: 4, hail: 15, hailCooldown: 8, beamRange: 10, beamDelay: 1, beam: 60 },
} as const;

const BASE_HP = 400;
const RARE_HP = 800;
const BITE = 10;
const RARE_BITE = 20;
export const MONSTER_GOLD = 5;
export const RARE_GOLD = 10;

function row(
  id: string,
  role: MonsterRole,
  name: string,
  who: string,
  body: BodyKind,
  maxHp: number,
  bite: number,
  immune: readonly DamageType[] = [],
): MonsterDef {
  const rare = role === "chest" || role === "gargoyle" || role === "drowned";
  const spawn = role !== "rat" && role !== "centipede";
  return { id, role, name, who, body, maxHp, bite, shield: SHIELD, immune, rare, spawn };
}

export const MONSTERS: readonly MonsterDef[] = [
  row("1", "dog", "Костяной пёс", "Скелет гончей", "bone", BASE_HP, BITE),
  row("2", "spider", "Пещерный паук", "Мохнатый паук с красными глазами", "flesh", BASE_HP, BITE),
  row("3", "corpse", "Гнилой мертвец", "Сгорбленный зомби", "flesh", BASE_HP / 1.2, BITE, ["poison"]),
  row("4", "golem", "Осколок голема", "Маленький каменный голем", "stone", BASE_HP / 1.35, BITE, ["earth"]),
  row("5", "bat", "Кровосос", "Летучая мышь", "flesh", BASE_HP / 1.05, BITE),
  row("6", "slime", "Слизь склепа", "Зелёная слизь с черепом внутри", "flesh", BASE_HP, 0, ["poison"]),
  row("7", "skeleton", "Скелет-страж", "Скелет с коротким мечом", "bone", BASE_HP, BITE),
  row("8", "rat", "Чумная крыса", "Крупная крыса", "flesh", BASE_HP, BITE),
  row("9", "spirit", "Бледный дух", "Потрёпанное привидение", "flesh", BASE_HP / 1.25, BITE),
  row("10", "goblin", "Норный гоблин", "Гоблин с кинжалом", "flesh", BASE_HP / 1.25, BITE),
  row("11", "mushroom", "Грибник", "Существо-поганка", "flesh", BASE_HP, 0),
  row("12", "ember", "Уголёк", "Маленький огненный имп", "flesh", BASE_HP, BITE, ["fire"]),
  row("13", "worm", "Могильный червь", "Сегментный червь с пастью", "flesh", BASE_HP / 1.2, BITE, ["earth"]),
  row("14", "acolyte", "Послушник", "Культист в капюшоне", "flesh", BASE_HP, 0),
  row("15", "hound", "Пепельная гончая", "Демон-пёс с трещинами жара", "flesh", BASE_HP, BITE, ["fire"]),
  row("16", "chest", "Ложный сундук", "Мимик", "flesh", RARE_HP, RARE_BITE),
  row("17", "gargoyle", "Карнизный страж", "Маленькая гаргулья", "stone", RARE_HP, RARE_BITE),
  row("18", "drowned", "Утопленник", "Раздутый утопленник с водорослями", "flesh", RARE_HP, RARE_BITE),
  row("19", "whisper", "Костяной шёпот", "Скелет с посохом", "bone", BASE_HP / 1.5, 0),
  row("20", "centipede", "Теневая многоножка", "Чёрная сколопендра", "flesh", BASE_HP, BITE),
];

/** Спора грибника — существо: 200 HP, щита и укуса нет. */
export const SPORE: MonsterDef = {
  id: "spore",
  role: "spore",
  name: "Спора",
  who: "Спора грибника",
  body: "flesh",
  maxHp: 200,
  bite: 0,
  shield: 0,
  immune: [],
  rare: false,
  spawn: false,
};

export function monsterById(id: string): MonsterDef | undefined {
  if (id === SPORE.id) return SPORE;
  return MONSTERS.find((monster) => monster.id === id);
}
