/** Вкладка «Предметы». Величины — блок «Расчёт», не округление в строке вещи. */

export type Rarity = "common" | "uncommon" | "rare" | "epic";

export interface GearItem {
  id: string;
  name: string;
  rarity: Rarity;
  maxHp?: number;
  weaponPower?: number;
  phys?: number;
  elem?: number;
  dodge?: number;
  critChance?: number;
  critShare?: number;
}

/** Одна единица атрибута. Жёлтая ручка крит-урона — 50%. */
export const UNIT = {
  maxHp: 10,
  weaponPower: 2.5,
  phys: 5.437245129,
  elem: 3.09533636,
  dodge: 0.09569632367,
  critChance: 0.1,
  critShare: 0.5,
} as const;

const U = UNIT;

function gear(
  id: string,
  name: string,
  rarity: Rarity,
  bonus: Omit<GearItem, "id" | "name" | "rarity"> = {},
): GearItem {
  return { id, name, rarity, ...bonus };
}

export const GEAR: readonly GearItem[] = [
  gear("fang", "Треснувший клык", "common"),
  gear("rib", "Обломок ребра", "common"),
  gear("buckle", "Потёртая пряжка", "common"),
  gear("badge", "Тусклая бляха", "common"),
  gear("sinew", "Сухая жила", "common"),
  gear("cloak-scrap", "Обрывок плаща", "common"),
  gear("clay", "Глиняный осколок", "common"),
  gear("rivet", "Ржавая заклёпка", "common"),
  gear("token", "Стертый жетон", "common"),
  gear("button", "Костяная пуговица", "common"),
  gear("splinter", "Щепка гроба", "common"),
  gear("pebble", "Мутный камешек", "common"),
  gear("belt", "Пояс жил", "uncommon", { maxHp: U.maxHp }),
  gear("vial", "Флакон тлена", "uncommon", { phys: U.phys }),
  gear("fang-ring", "Кольцо клыка", "uncommon", { weaponPower: U.weaponPower }),
  gear("whisper-bead", "Бусина шёпота", "uncommon", { elem: U.elem }),
  gear("bone-plate", "Пластина кости", "uncommon", { phys: U.phys }),
  gear("wax", "Восковая печать", "uncommon", { elem: U.elem }),
  gear("spirit-ribbon", "Лента духа", "uncommon", { dodge: U.dodge }),
  gear("spike", "Заточенный шип", "uncommon", { weaponPower: U.weaponPower }),
  gear("earring", "Тяжёлая серьга", "uncommon", { dodge: U.dodge }),
  gear("coal", "Угольная крошка", "uncommon", { elem: U.elem }),
  gear("crypt-hoop", "Обруч склепа", "uncommon", { maxHp: U.maxHp }),
  gear("guard-bracer", "Наруч стража", "uncommon", { weaponPower: U.weaponPower }),
  gear("spider-hood", "Капюшон паука", "uncommon", { dodge: U.dodge }),
  gear("golem-shard", "Осколок голема", "uncommon", { phys: U.phys }),
  gear("acolyte-beads", "Чётки послушника", "uncommon", { maxHp: U.maxHp }),
  gear("hound-ash", "Пепел гончей", "uncommon", { elem: U.elem }),
  gear("bone-shell", "Панцирь костей", "rare", { maxHp: U.maxHp, phys: U.phys }),
  gear("spiked-hide", "Шкура с шипами", "rare", { weaponPower: U.weaponPower, dodge: U.dodge }),
  gear("ember-cloak", "Плащ уголька", "rare", { weaponPower: U.weaponPower, elem: U.elem }),
  gear("burrow-boots", "Сапоги норы", "rare", { maxHp: U.maxHp, dodge: U.dodge }),
  gear("hone-gloves", "Перчатки заточки", "rare", { maxHp: U.maxHp, weaponPower: U.weaponPower }),
  gear("bone-amulet", "Амулет кости", "rare", { maxHp: U.maxHp, phys: U.phys }),
  gear("sinew-ring", "Кольцо жил", "rare", { maxHp: U.maxHp, elem: U.elem }),
  gear("spirit-mask", "Маска духа", "rare", { elem: U.elem, dodge: U.dodge }),
  gear("dog-collar", "Ошейник пса", "rare", { weaponPower: U.weaponPower, phys: U.phys }),
  gear("mushroom-pouch", "Грибной мешочек", "rare", { phys: U.phys, elem: U.elem }),
  gear("worm-wraps", "Обмотки червя", "rare", { phys: U.phys, dodge: U.dodge }),
  gear("whisper-mirror", "Зеркальце шёпота", "rare", { critChance: U.critChance, critShare: U.critShare }),
  gear("drowned-scale", "Чешуя утопленника", "rare", { maxHp: U.maxHp, elem: U.elem }),
  gear("goblin-earring", "Серьга гоблина", "rare", { weaponPower: U.weaponPower, dodge: U.dodge }),
  gear("crypt-crown", "Корона склепа", "epic", { maxHp: U.maxHp, weaponPower: U.weaponPower, phys: U.phys }),
  gear("ember-heart", "Сердце уголька", "epic", { maxHp: U.maxHp, elem: U.elem, dodge: U.dodge }),
  gear("mimic-fang", "Клык мимика", "epic", { maxHp: U.maxHp, phys: U.phys, elem: U.elem }),
  gear("guard-wing", "Крыло стража", "epic", { maxHp: U.maxHp, phys: U.phys, dodge: U.dodge }),
  gear("whisper-staff", "Посох шёпота", "epic", { weaponPower: U.weaponPower, elem: U.elem, dodge: U.dodge }),
  gear("drowned-shell", "Панцирь утопленника", "epic", { maxHp: U.maxHp, phys: U.phys, elem: U.elem }),
  gear("spider-eye", "Глаз паука", "epic", { weaponPower: U.weaponPower, elem: U.elem, dodge: U.dodge }),
  gear("golem-core", "Ядро голема", "epic", { weaponPower: U.weaponPower, phys: U.phys, elem: U.elem }),
];

export const EQUIPMENT_SLOTS = 6;

export interface GearBonus {
  maxHp: number;
  weaponPower: number;
  phys: number;
  elem: number;
  dodge: number;
  critChance: number;
  critShare: number;
}

export const EMPTY_GEAR: GearBonus = {
  maxHp: 0,
  weaponPower: 0,
  phys: 0,
  elem: 0,
  dodge: 0,
  critChance: 0,
  critShare: 0,
};

const BY_ID = new Map(GEAR.map((item) => [item.id, item]));

export function itemById(id: string): GearItem | undefined {
  return BY_ID.get(id);
}

export function gearBonus(ids: readonly (string | null)[]): GearBonus {
  const bonus: GearBonus = { ...EMPTY_GEAR };
  for (const id of ids) {
    const item = id ? itemById(id) : undefined;
    if (!item) continue;
    bonus.maxHp += item.maxHp ?? 0;
    bonus.weaponPower += item.weaponPower ?? 0;
    bonus.phys += item.phys ?? 0;
    bonus.elem += item.elem ?? 0;
    bonus.dodge += item.dodge ?? 0;
    bonus.critChance += item.critChance ?? 0;
    bonus.critShare += item.critShare ?? 0;
  }
  return bonus;
}

/** Базы крита нет: без шанса или без доли множитель остаётся 1. */
export function critFactor(chance: number, share: number): number {
  if (chance <= 0 || share <= 0) return 1;
  return 1 + chance * share;
}

export interface Loadout {
  bag: string[];
  worn: (string | null)[];
}

export function freshLoadout(): Loadout {
  return {
    bag: GEAR.map((item) => item.id),
    worn: Array.from({ length: EQUIPMENT_SLOTS }, () => null),
  };
}
