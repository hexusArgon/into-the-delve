import { HERO_HP, HERO_MP } from "../game/rules.ts";

/**
 * Имена из раздела «Атрибуты Crown Trick» в ГДД.
 * Это не числа монстров. Нет в объекте — дизайнер число не задавал.
 */
export const ATTR_IDS = [
  "Hp",
  "MaxHp",
  "ExtraMaxHP",
  "Mp",
  "MaxMp",
  "ExtraMaxMP",
  "ATK",
  "MATK",
  "DEF",
  "MDEF",
  "WpATK",
  "WpAttrATK",
  "CritOdds",
  "CritFactor",
  "Dodge",
  "NormalAttackDamage",
  "SkillDamage",
  "TotalDamage",
  "SufferDamage",
  "FireDamage",
  "SwordDamage",
  "GunDamage",
  "BlastDamage",
  "SkillMPFactor",
  "FireRes",
  "IceRes",
  "WaterRes",
  "WindRes",
  "EarthRes",
  "ElectyRes",
  "BlastRes",
  "PosionRes",
  "BurningEnhance",
  "BurningExtension",
  "FreezeExtension",
  "PoisoningEnhance",
] as const;

export type AttrId = (typeof ATTR_IDS)[number];

export type Attributes = Partial<Record<AttrId, number>>;

export interface AttrGroup {
  title: string;
  ids: readonly AttrId[];
}

/** Группы как в ГДД. */
export const ATTR_GROUPS: readonly AttrGroup[] = [
  { title: "Life and mana", ids: ["Hp", "MaxHp", "ExtraMaxHP", "Mp", "MaxMp", "ExtraMaxMP"] },
  { title: "Combat", ids: ["ATK", "MATK", "DEF", "MDEF", "WpATK", "WpAttrATK"] },
  { title: "Crit and dodge", ids: ["CritOdds", "CritFactor", "Dodge"] },
  {
    title: "Damage",
    ids: [
      "NormalAttackDamage",
      "SkillDamage",
      "TotalDamage",
      "SufferDamage",
      "FireDamage",
      "SwordDamage",
      "GunDamage",
      "BlastDamage",
    ],
  },
  { title: "Skill cost", ids: ["SkillMPFactor"] },
  {
    title: "Resistances",
    ids: ["FireRes", "IceRes", "WaterRes", "WindRes", "EarthRes", "ElectyRes", "BlastRes", "PosionRes"],
  },
  {
    title: "Status power",
    ids: ["BurningEnhance", "BurningExtension", "FreezeExtension", "PoisoningEnhance"],
  },
];

/** База героя. Damage удара в бою берётся у надетого оружия, не отсюда. Обе брони 0. */
export function heroAttributes(hit = 0): Attributes {
  return {
    Hp: HERO_HP,
    MaxHp: HERO_HP,
    MaxMp: HERO_MP,
    ATK: hit || undefined,
    SwordDamage: hit || undefined,
    DEF: 0,
    MDEF: 0,
  };
}

/** MaxHp и укус этой строки монстра. Колонка «Броня» уже сидит в MaxHp, поэтому обе брони 0. */
export function monsterAttributes(maxHp: number, bite: number): Attributes {
  return {
    Hp: maxHp,
    MaxHp: maxHp,
    ATK: bite || undefined,
    NormalAttackDamage: bite || undefined,
    DEF: 0,
    MDEF: 0,
  };
}

export function attrText(attrs: Attributes, id: AttrId): string {
  const value = attrs[id];
  return value === undefined ? "—" : String(value);
}

/** Удар героя. Weapons прибавляет атаку, но размер прибавки не задан. Защиту оружие не даёт. */
export function heroStrike(attrs: Attributes): number {
  return attrs.SwordDamage ?? attrs.ATK ?? 0;
}

/** Обычный удар врага. */
export function monsterStrike(attrs: Attributes): number {
  return attrs.NormalAttackDamage ?? attrs.ATK ?? 0;
}
