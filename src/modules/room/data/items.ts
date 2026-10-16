/**
 * Вкладка «Предметы». Клетка вещи — ссылка на единицу AA4:AB22.
 * Выданный бонус хранится не точнее сотых.
 */

export type Rarity = "common" | "uncommon" | "rare" | "epic";

export const STAT_KEYS = [
  "maxHp",
  "maxMp",
  "weaponPower",
  "abilityPower",
  "phys",
  "fireRes",
  "earthRes",
  "poisonRes",
  "waterRes",
  "iceRes",
  "dodge",
  "critChance",
  "critShare",
  "physDmg",
  "fireDmg",
  "earthDmg",
  "poisonDmg",
  "waterDmg",
  "iceDmg",
] as const;

export type StatKey = (typeof STAT_KEYS)[number];

export type StatBonus = Partial<Record<StatKey, number>>;

/** Сотые. 1.005 не раздувает хвост двоичной дроби. */
export function grantBonus(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function bonusPlaces(value: number): number {
  const text = grantBonus(value).toString();
  const dot = text.indexOf(".");
  return dot < 0 ? 0 : text.length - dot - 1;
}

/**
 * Единица атрибута.
 * Max HP — 10. Max MP — 4: комната 300, удар меча 100, типичный каст 40, десятая доля каста.
 * Сила оружия — 2.5 за попадание, четыре попадания меча дают 10.
 * Сила умений — 10 к одному касту.
 * Сопр. физ. — очки брони Warcraft 3, снимают 10 с среднего физического входа.
 * Стихийное сопротивление — те же очки, снимают 10 с среднего урона монстров этой стихии.
 * Уклонение — очки той же кривой, шанс снять 10 со среднего входа 83.34.
 * Крит шанс — очки на 10%. Доля крита 0.5. Вместе это +5% урона меча, две единицы за четыре удара.
 * Урон физ. — 2.5% к удару, четыре удара дают 10. Урон стихией — 10% к одному касту этой стихии.
 */
export const UNIT: Record<StatKey, number> = {
  maxHp: 10,
  maxMp: 4,
  weaponPower: 2.5,
  abilityPower: 10,
  phys: 5.44,
  fireRes: 2.37,
  earthRes: 2.59,
  poisonRes: 10.27,
  waterRes: 1.14,
  iceRes: 1.46,
  dodge: 2.27,
  critChance: 1.85,
  critShare: 0.5,
  physDmg: 2.5,
  fireDmg: 10,
  earthDmg: 10,
  poisonDmg: 10,
  waterDmg: 10,
  iceDmg: 10,
};

export interface GearItem extends StatBonus {
  id: string;
  name: string;
  rarity: Rarity;
}

function piece(id: string, name: string, rarity: Rarity, keys: readonly StatKey[]): GearItem {
  const row: GearItem = { id, name, rarity };
  for (const key of keys) row[key] = UNIT[key];
  return row;
}

export const GEAR: readonly GearItem[] = [
  piece("fang", "Cracked Fang", "common", []),
  piece("rib", "Rib Fragment", "common", []),
  piece("buckle", "Worn Buckle", "common", []),
  piece("badge", "Dull Badge", "common", []),
  piece("sinew", "Dry Sinew", "common", []),
  piece("cloak-scrap", "Cloak Scrap", "common", []),
  piece("clay", "Clay Shard", "common", []),
  piece("rivet", "Rusty Rivet", "common", []),
  piece("token", "Worn Token", "common", []),
  piece("button", "Bone Button", "common", []),
  piece("splinter", "Coffin Splinter", "common", []),
  piece("pebble", "Cloudy Pebble", "common", []),
  piece("belt", "Sinew Belt", "uncommon", ["maxHp"]),
  piece("ether", "Ether Flask", "uncommon", ["maxMp"]),
  piece("fang-ring", "Fang Ring", "uncommon", ["weaponPower"]),
  piece("spell-bead", "Spell Bead", "uncommon", ["abilityPower"]),
  piece("bone-plate", "Bone Plate", "uncommon", ["phys"]),
  piece("hearth-coal", "Hearth Coal", "uncommon", ["fireRes"]),
  piece("clay-seal", "Clay Seal", "uncommon", ["earthRes"]),
  piece("wax-stop", "Wax Stopper", "uncommon", ["poisonRes"]),
  piece("scale-chip", "Scale Chip", "uncommon", ["waterRes"]),
  piece("rime-bead", "Rime Bead", "uncommon", ["iceRes"]),
  piece("spirit-ribbon", "Spirit Ribbon", "uncommon", ["dodge"]),
  piece("crit-odds", "Odds Shard", "uncommon", ["critChance"]),
  piece("crit-share", "Share Shard", "uncommon", ["critShare"]),
  piece("hit-spike", "Strike Spike", "uncommon", ["physDmg"]),
  piece("fire-spark", "Fire Spark", "uncommon", ["fireDmg"]),
  piece("earth-pebble", "Vein Pebble", "uncommon", ["earthDmg"]),
  piece("poison-tooth", "Bile Tooth", "uncommon", ["poisonDmg"]),
  piece("water-drop", "Water Drop", "uncommon", ["waterDmg"]),
  piece("ice-chip", "Ice Chip", "uncommon", ["iceDmg"]),
  piece("rare-maxHp-poisonRes", "Sinew Wax", "rare", ["maxHp", "poisonRes"]),
  piece("rare-maxMp-waterRes", "Ether Scale", "rare", ["maxMp", "waterRes"]),
  piece("rare-weaponPower-iceRes", "Fang Rime", "rare", ["weaponPower", "iceRes"]),
  piece("rare-abilityPower-dodge", "Spell Ribbon", "rare", ["abilityPower", "dodge"]),
  piece("rare-phys-critChance", "Bone Odds", "rare", ["phys", "critChance"]),
  piece("rare-fireRes-critShare", "Hearth Share", "rare", ["fireRes", "critShare"]),
  piece("rare-earthRes-physDmg", "Clay Spike", "rare", ["earthRes", "physDmg"]),
  piece("rare-poisonRes-fireDmg", "Wax Spark", "rare", ["poisonRes", "fireDmg"]),
  piece("rare-waterRes-earthDmg", "Scale Pebble", "rare", ["waterRes", "earthDmg"]),
  piece("rare-iceRes-poisonDmg", "Rime Bile", "rare", ["iceRes", "poisonDmg"]),
  piece("rare-dodge-waterDmg", "Ribbon Drop", "rare", ["dodge", "waterDmg"]),
  piece("rare-critChance-iceDmg", "Odds Chip", "rare", ["critChance", "iceDmg"]),
  piece("rare-maxHp-critShare", "Sinew Share", "rare", ["maxHp", "critShare"]),
  piece("rare-maxMp-physDmg", "Ether Spike", "rare", ["maxMp", "physDmg"]),
  piece("rare-weaponPower-fireDmg", "Fang Spark", "rare", ["weaponPower", "fireDmg"]),
  piece("rare-abilityPower-earthDmg", "Spell Pebble", "rare", ["abilityPower", "earthDmg"]),
  piece("rare-phys-poisonDmg", "Bone Bile", "rare", ["phys", "poisonDmg"]),
  piece("rare-fireRes-waterDmg", "Hearth Drop", "rare", ["fireRes", "waterDmg"]),
  piece("rare-earthRes-iceDmg", "Clay Chip", "rare", ["earthRes", "iceDmg"]),
  piece("rare-maxHp-iceRes", "Sinew Rime", "rare", ["maxHp", "iceRes"]),
  piece("epic-maxHp-earthRes-physDmg", "Sinew Clay Spike", "epic", ["maxHp", "earthRes", "physDmg"]),
  piece("epic-maxMp-poisonRes-fireDmg", "Ether Wax Spark", "epic", ["maxMp", "poisonRes", "fireDmg"]),
  piece("epic-weaponPower-waterRes-earthDmg", "Fang Scale Pebble", "epic", ["weaponPower", "waterRes", "earthDmg"]),
  piece("epic-abilityPower-iceRes-poisonDmg", "Spell Rime Bile", "epic", ["abilityPower", "iceRes", "poisonDmg"]),
  piece("epic-phys-dodge-waterDmg", "Bone Ribbon Drop", "epic", ["phys", "dodge", "waterDmg"]),
  piece("epic-fireRes-critChance-iceDmg", "Hearth Odds Chip", "epic", ["fireRes", "critChance", "iceDmg"]),
  piece("epic-maxHp-earthRes-critShare", "Sinew Clay Share", "epic", ["maxHp", "earthRes", "critShare"]),
  piece("epic-maxMp-poisonRes-physDmg", "Ether Wax Spike", "epic", ["maxMp", "poisonRes", "physDmg"]),
  piece("epic-weaponPower-waterRes-fireDmg", "Fang Scale Spark", "epic", ["weaponPower", "waterRes", "fireDmg"]),
  piece("epic-abilityPower-iceRes-earthDmg", "Spell Rime Pebble", "epic", ["abilityPower", "iceRes", "earthDmg"]),
  piece("epic-phys-dodge-poisonDmg", "Bone Ribbon Bile", "epic", ["phys", "dodge", "poisonDmg"]),
  piece("epic-fireRes-critChance-waterDmg", "Hearth Odds Drop", "epic", ["fireRes", "critChance", "waterDmg"]),
  piece("epic-earthRes-critShare-iceDmg", "Clay Share Chip", "epic", ["earthRes", "critShare", "iceDmg"]),
  piece("epic-maxHp-poisonRes-physDmg", "Sinew Wax Spike", "epic", ["maxHp", "poisonRes", "physDmg"]),
  piece("epic-maxMp-waterRes-fireDmg", "Ether Scale Spark", "epic", ["maxMp", "waterRes", "fireDmg"]),
  piece("epic-weaponPower-iceRes-earthDmg", "Fang Rime Pebble", "epic", ["weaponPower", "iceRes", "earthDmg"]),
  piece("epic-abilityPower-dodge-poisonDmg", "Spell Ribbon Bile", "epic", ["abilityPower", "dodge", "poisonDmg"]),
  piece("epic-phys-critChance-waterDmg", "Bone Odds Drop", "epic", ["phys", "critChance", "waterDmg"]),
  piece("epic-fireRes-critShare-iceDmg", "Hearth Share Chip", "epic", ["fireRes", "critShare", "iceDmg"]),
  piece("epic-weaponPower-iceRes-poisonDmg", "Fang Rime Bile", "epic", ["weaponPower", "iceRes", "poisonDmg"]),
  piece("vial", "Vial of Rot", "uncommon", ["phys"]),
  piece("whisper-bead", "Whisper Bead", "uncommon", ["iceRes"]),
  piece("wax", "Wax Seal", "uncommon", ["earthRes"]),
  piece("spike", "Honed Spike", "uncommon", ["weaponPower"]),
  piece("earring", "Heavy Earring", "uncommon", ["dodge"]),
  piece("coal", "Coal Grit", "uncommon", ["fireRes"]),
  piece("crypt-hoop", "Crypt Hoop", "uncommon", ["maxHp"]),
  piece("guard-bracer", "Guard Bracer", "uncommon", ["weaponPower"]),
  piece("spider-hood", "Spider Hood", "uncommon", ["dodge"]),
  piece("golem-shard", "Golem Shard", "uncommon", ["phys"]),
  piece("acolyte-beads", "Acolyte Beads", "uncommon", ["maxHp"]),
  piece("hound-ash", "Hound Ash", "uncommon", ["fireRes"]),
  piece("bone-shell", "Bone Shell", "rare", ["maxHp", "phys"]),
  piece("spiked-hide", "Spiked Hide", "rare", ["weaponPower", "dodge"]),
  piece("ember-cloak", "Ember Cloak", "rare", ["weaponPower", "fireRes"]),
  piece("burrow-boots", "Burrow Boots", "rare", ["maxHp", "dodge"]),
  piece("hone-gloves", "Hone Gloves", "rare", ["maxHp", "weaponPower"]),
  piece("bone-amulet", "Bone Amulet", "rare", ["maxHp", "phys"]),
  piece("sinew-ring", "Sinew Ring", "rare", ["maxHp", "waterRes"]),
  piece("spirit-mask", "Spirit Mask", "rare", ["iceRes", "dodge"]),
  piece("dog-collar", "Dog Collar", "rare", ["weaponPower", "phys"]),
  piece("mushroom-pouch", "Mushroom Pouch", "rare", ["phys", "poisonRes"]),
  piece("worm-wraps", "Worm Wraps", "rare", ["phys", "dodge"]),
  piece("whisper-mirror", "Whisper Mirror", "rare", ["critChance", "critShare"]),
  piece("drowned-scale", "Drowned Scale", "rare", ["maxHp", "waterRes"]),
  piece("goblin-earring", "Goblin Earring", "rare", ["weaponPower", "dodge"]),
  piece("crypt-crown", "Crypt Crown", "epic", ["maxHp", "weaponPower", "phys"]),
  piece("ember-heart", "Ember Heart", "epic", ["maxHp", "fireRes", "dodge"]),
  piece("mimic-fang", "Mimic Fang", "epic", ["maxHp", "phys", "earthRes"]),
  piece("guard-wing", "Guard Wing", "epic", ["maxHp", "phys", "dodge"]),
  piece("whisper-staff", "Whisper Staff", "epic", ["weaponPower", "iceRes", "dodge"]),
  piece("drowned-shell", "Drowned Shell", "epic", ["maxHp", "phys", "waterRes"]),
  piece("spider-eye", "Spider Eye", "epic", ["weaponPower", "poisonRes", "dodge"]),
  piece("golem-core", "Golem Core", "epic", ["weaponPower", "phys", "earthRes"]),
];

export const EQUIPMENT_SLOTS = 6;

export type GearBonus = Record<StatKey, number>;

export const EMPTY_GEAR: GearBonus = {
  maxHp: 0,
  maxMp: 0,
  weaponPower: 0,
  abilityPower: 0,
  phys: 0,
  fireRes: 0,
  earthRes: 0,
  poisonRes: 0,
  waterRes: 0,
  iceRes: 0,
  dodge: 0,
  critChance: 0,
  critShare: 0,
  physDmg: 0,
  fireDmg: 0,
  earthDmg: 0,
  poisonDmg: 0,
  waterDmg: 0,
  iceDmg: 0,
};

const BY_ID = new Map(GEAR.map((item) => [item.id, item]));

export function itemById(id: string): GearItem | undefined {
  return BY_ID.get(id);
}

export function formatStat(key: StatKey, value: number): string {
  const name = {
    maxHp: "Max HP",
    maxMp: "Max MP",
    weaponPower: "Weapon Power",
    abilityPower: "Ability Power",
    phys: "Physical resist",
    fireRes: "Fire resist",
    earthRes: "Earth resist",
    poisonRes: "Poison resist",
    waterRes: "Water resist",
    iceRes: "Ice resist",
    dodge: "Dodge",
    critChance: "Crit chance",
    critShare: "Crit damage",
    physDmg: "Physical damage",
    fireDmg: "Fire damage",
    earthDmg: "Earth damage",
    poisonDmg: "Poison damage",
    waterDmg: "Water damage",
    iceDmg: "Ice damage",
  }[key];
  const shown = grantBonus(value);
  return key.endsWith("Dmg") ? `${name} +${shown}%` : `${name} +${shown}`;
}

export function describeStats(bonus: StatBonus, amount: (base: number) => number = (base) => base): string {
  return statKeysOf(bonus).map((key) => formatStat(key, amount(bonus[key] ?? 0))).join(", ");
}

export function statKeysOf(bonus: StatBonus): StatKey[] {
  return STAT_KEYS.filter((key) => bonus[key] !== undefined);
}

export function addStats(into: GearBonus, bonus: StatBonus, amount: (base: number) => number = (base) => base): void {
  for (const key of STAT_KEYS) {
    const base = bonus[key];
    if (base === undefined) continue;
    into[key] = grantBonus(into[key] + amount(base));
  }
}

export function gearBonus(ids: readonly (string | null)[]): GearBonus {
  const bonus: GearBonus = { ...EMPTY_GEAR };
  for (const id of ids) {
    const item = id ? itemById(id) : undefined;
    if (item) addStats(bonus, item);
  }
  return bonus;
}

/** Базы крита нет: без шанса или без доли множитель остаётся 1. */
export function critFactor(chance: number, share: number): number {
  if (chance <= 0 || share <= 0) return 1;
  return 1 + chance * share;
}
