/** Onадка «Предметы». Величины — блок «Расчёт», не округление в строке вещи. */

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
  gear("fang", "Cracked Fang", "common"),
  gear("rib", "Rib Fragment", "common"),
  gear("buckle", "Worn Buckle", "common"),
  gear("badge", "Dull Badge", "common"),
  gear("sinew", "Dry Sinew", "common"),
  gear("cloak-scrap", "Cloak Scrap", "common"),
  gear("clay", "Clay Shard", "common"),
  gear("rivet", "Rusty Rivet", "common"),
  gear("token", "Worn Token", "common"),
  gear("button", "Bone Button", "common"),
  gear("splinter", "Coffin Splinter", "common"),
  gear("pebble", "Cloudy Pebble", "common"),
  gear("belt", "Sinew Belt", "uncommon", { maxHp: U.maxHp }),
  gear("vial", "Vial of Rot", "uncommon", { phys: U.phys }),
  gear("fang-ring", "Fang Ring", "uncommon", { weaponPower: U.weaponPower }),
  gear("whisper-bead", "Whisper Bead", "uncommon", { elem: U.elem }),
  gear("bone-plate", "Bone Plate", "uncommon", { phys: U.phys }),
  gear("wax", "Wax Seal", "uncommon", { elem: U.elem }),
  gear("spirit-ribbon", "Spirit Ribbon", "uncommon", { dodge: U.dodge }),
  gear("spike", "Honed Spike", "uncommon", { weaponPower: U.weaponPower }),
  gear("earring", "Heavy Earring", "uncommon", { dodge: U.dodge }),
  gear("coal", "Coal Grit", "uncommon", { elem: U.elem }),
  gear("crypt-hoop", "Crypt Hoop", "uncommon", { maxHp: U.maxHp }),
  gear("guard-bracer", "Guard Bracer", "uncommon", { weaponPower: U.weaponPower }),
  gear("spider-hood", "Spider Hood", "uncommon", { dodge: U.dodge }),
  gear("golem-shard", "Golem Shard", "uncommon", { phys: U.phys }),
  gear("acolyte-beads", "Acolyte Beads", "uncommon", { maxHp: U.maxHp }),
  gear("hound-ash", "Hound Ash", "uncommon", { elem: U.elem }),
  gear("bone-shell", "Bone Shell", "rare", { maxHp: U.maxHp, phys: U.phys }),
  gear("spiked-hide", "Spiked Hide", "rare", { weaponPower: U.weaponPower, dodge: U.dodge }),
  gear("ember-cloak", "Ember Cloak", "rare", { weaponPower: U.weaponPower, elem: U.elem }),
  gear("burrow-boots", "Burrow Boots", "rare", { maxHp: U.maxHp, dodge: U.dodge }),
  gear("hone-gloves", "Hone Gloves", "rare", { maxHp: U.maxHp, weaponPower: U.weaponPower }),
  gear("bone-amulet", "Bone Amulet", "rare", { maxHp: U.maxHp, phys: U.phys }),
  gear("sinew-ring", "Sinew Ring", "rare", { maxHp: U.maxHp, elem: U.elem }),
  gear("spirit-mask", "Spirit Mask", "rare", { elem: U.elem, dodge: U.dodge }),
  gear("dog-collar", "Dog Collar", "rare", { weaponPower: U.weaponPower, phys: U.phys }),
  gear("mushroom-pouch", "Mushroom Pouch", "rare", { phys: U.phys, elem: U.elem }),
  gear("worm-wraps", "Worm Wraps", "rare", { phys: U.phys, dodge: U.dodge }),
  gear("whisper-mirror", "Whisper Mirror", "rare", { critChance: U.critChance, critShare: U.critShare }),
  gear("drowned-scale", "Drowned Scale", "rare", { maxHp: U.maxHp, elem: U.elem }),
  gear("goblin-earring", "Goblin Earring", "rare", { weaponPower: U.weaponPower, dodge: U.dodge }),
  gear("crypt-crown", "Crypt Crown", "epic", { maxHp: U.maxHp, weaponPower: U.weaponPower, phys: U.phys }),
  gear("ember-heart", "Ember Heart", "epic", { maxHp: U.maxHp, elem: U.elem, dodge: U.dodge }),
  gear("mimic-fang", "Mimic Fang", "epic", { maxHp: U.maxHp, phys: U.phys, elem: U.elem }),
  gear("guard-wing", "Guard Wing", "epic", { maxHp: U.maxHp, phys: U.phys, dodge: U.dodge }),
  gear("whisper-staff", "Whisper Staff", "epic", { weaponPower: U.weaponPower, elem: U.elem, dodge: U.dodge }),
  gear("drowned-shell", "Drowned Shell", "epic", { maxHp: U.maxHp, phys: U.phys, elem: U.elem }),
  gear("spider-eye", "Spider Eye", "epic", { weaponPower: U.weaponPower, elem: U.elem, dodge: U.dodge }),
  gear("golem-core", "Golem Core", "epic", { weaponPower: U.weaponPower, phys: U.phys, elem: U.elem }),
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
