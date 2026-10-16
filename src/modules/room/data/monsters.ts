import { SHIELD } from "../game/rules.ts";
import type { BodyKind } from "./rooms.ts";

/** Тип урона. Без подписи — физический. Damage землёй оставляет на клетке масло. */
export type DamageType = "physical" | "fire" | "earth" | "poison" | "water" | "ice";

/** Ручки вкладки «Abilities», строки «Стихии». */
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
  /** Новая лужа живёт столько ходов, потом клетка снова обычная. Было 7, дизайнер прибавил 2 всем типам, включая яд. */
  puddleTurns: 9,
} as const;

export type MonsterRole =
  | "dog"
  | "spider"
  | "corpse"
  | "golem"
  | "bat"
  | "slime"
  | "skeleton"
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
  | "spore"
  | "automaton";

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
 * Onадка «Abilities». КД, задержки, радиусы и урон — с листа, не подбирать.
 * Радиус 1 — квадрат 3×3 по Чебышёву. Кольца: центр с задержкой 1, каждое следующее на ход позже.
 */
export const KIT = {
  dog: { dash: 4, damage: 30, cooldown: 4, delay: 1 },
  spider: { range: 4, stacks: 1, cooldown: 3, delay: 1 },
  corpse: { reach: 6, delay: 2, radius: 1, stacks: 1, damage: 30 },
  golem: { delay: 1, damage: 25, cooldown: 3 },
  bat: { cooldown: 3, sleepBelow: 0.5, heal: 0.2 },
  slime: { steps: 2, stacks: 1 },
  skeleton: { reach: 2, depth: 2, width: 3, delay: 1, damage: 35, cooldown: 4 },
  spirit: { damage: 20, cooldown: 3, delay: 1 },
  goblin: { dash: 2, damage: 20, cooldown: 2, delay: 1 },
  mushroom: { keep: 4, cooldown: 3 },
  spore: { fuse: 1, radius: 1, stacks: 1, damage: 30 },
  ember: { pause: 1, delay: 1, radius: 1, damage: 40, cooldown: 7 },
  worm: { delay: 2, radius: 1, damage: 70, push: 2, cooldown: 6 },
  /** Аура — квадрат 15×15 вокруг послушника: так решил дизайнер, лист пишет 8×8. */
  acolyte: { delay: 2, radius: 1, root: 2, cooldown: 7, aura: 7, vampirism: 1 },
  hound: { dash: 4, damage: 30, cooldown: 4, delay: 1 },
  chest: { reach: 4, delay: 1, radius: 1, stun: 3 },
  gargoyle: { stones: 4, delay: 1, stone: 35, stonePush: 1, landDelay: 1, radius: 1, land: 90, landPush: 1, rest: 5 },
  drowned: { rings: 4, geyser: 40, geyserCooldown: 8, throwDelay: 1, radius: 1, throwDamage: 30, throwStun: 1, throwCooldown: 2 },
  whisper: { charmCooldown: 2, radius: 1, shards: 10, rings: 4, hail: 15, hailCooldown: 8, beamRange: 10, beamDelay: 1, beam: 60 },
  /** Бочка: КД 3, взрыв 80. Обмен: КД 4, задержка 1. Резист огня и яда 50% после брони. */
  automaton: { swapCooldown: 4, swapDelay: 1, kegCooldown: 3, blast: 80, resist: 0.5 },
} as const;

const BASE_HP = 400;
const RARE_HP = 800;
const BITE = 10;
const RARE_BITE = 20;
export const MONSTER_GOLD = 5;
export const RARE_GOLD = 10;
/** Сундук комнаты. Число временное, его поменяют отдельно. */
export const CHEST_GOLD = 5;

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
  const spawn = true;
  return { id, role, name, who, body, maxHp, bite, shield: SHIELD, immune, rare, spawn };
}

export const MONSTERS: readonly MonsterDef[] = [
  row("1", "dog", "Bone Hound", "Hound skeleton", "bone", BASE_HP, BITE),
  row("2", "spider", "Cave Spider", "Hairy spider with red eyes", "flesh", BASE_HP, BITE),
  row("3", "corpse", "Rotten Corpse", "Hunched zombie", "flesh", BASE_HP / 1.2, BITE, ["poison"]),
  row("4", "golem", "Golem Shard", "Small stone golem", "stone", BASE_HP / 1.35, BITE, ["earth"]),
  row("5", "bat", "Bloodsucker", "Bat", "flesh", BASE_HP / 1.05, BITE),
  row("6", "slime", "Crypt Slime", "Green slime with a skull inside", "flesh", BASE_HP, 0, ["poison"]),
  row("7", "skeleton", "Skeleton Guard", "Skeleton with a short sword", "bone", BASE_HP, BITE),
  row("9", "spirit", "Pale Spirit", "Tattered ghost", "flesh", BASE_HP / 1.25, BITE),
  row("10", "goblin", "Burrow Goblin", "Goblin with a dagger", "flesh", BASE_HP / 1.25, BITE),
  row("11", "mushroom", "Mushroom", "Toadstool creature", "flesh", BASE_HP, 0),
  row("12", "ember", "Ember", "Small fire imp", "flesh", BASE_HP, BITE, ["fire"]),
  row("13", "worm", "Grave Worm", "Segmented worm with a maw", "flesh", BASE_HP / 1.2, BITE, ["earth"]),
  row("14", "acolyte", "Acolyte", "Hooded cultist", "flesh", BASE_HP, 0),
  row("15", "hound", "Ash Hound", "Demon hound cracked with heat", "flesh", BASE_HP, BITE, ["fire"]),
  row("16", "chest", "False Chest", "Mimic", "flesh", RARE_HP, RARE_BITE),
  row("17", "gargoyle", "Gargoyle", "Small gargoyle", "stone", RARE_HP, RARE_BITE),
  row("18", "drowned", "Drowned", "Bloated drowned one tangled in weeds", "flesh", RARE_HP, RARE_BITE),
  row("19", "whisper", "Bone Whisper", "Skeleton with a staff", "bone", BASE_HP / 1.5, 0),
  row(
    "21",
    "automaton",
    "Riveted Automaton",
    "Small riveted robot of brass and iron, a glass eye, a barrel rack on its back",
    "iron",
    BASE_HP,
    0,
  ),
];

/** Mushroom spore — существо: 200 HP, щита и укуса нет. */
export const SPORE: MonsterDef = {
  id: "spore",
  role: "spore",
  name: "Spore",
  who: "Mushroom spore",
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

/**
 * Стихия основного удара. Физический укус не подменяет способность.
 * null — урона нет, только контроль.
 * Камни стража — земля, посадка один раз физическая, поэтому у стража земля.
 */
const STRIKE: Record<MonsterRole, DamageType | null> = {
  dog: "physical",
  spider: "poison",
  corpse: "poison",
  golem: "earth",
  bat: "physical",
  slime: "poison",
  skeleton: "physical",
  spirit: "physical",
  goblin: "physical",
  mushroom: "poison",
  ember: "fire",
  worm: "earth",
  acolyte: null,
  hound: "fire",
  chest: "physical",
  gargoyle: "earth",
  drowned: "water",
  whisper: "ice",
  spore: "poison",
  automaton: null,
};

export function strikeElement(role: MonsterRole): DamageType | null {
  return STRIKE[role];
}
