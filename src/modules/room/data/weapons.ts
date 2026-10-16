import type { Rarity, StatBonus } from "./items.ts";
import { UNIT } from "./items.ts";

/** Девять типов. Дальность, фигура и магазин — из таблицы оружия. */
export type WeaponId =
  | "sword"
  | "axe"
  | "dual"
  | "gloves"
  | "spear"
  | "staff"
  | "pistol"
  | "rifle"
  | "shotgun";

export type WeaponShape = "fan" | "around" | "line";

export interface WeaponDef {
  id: WeaponId;
  name: string;
  figure: string;
  /** Дальность в клетках. */
  range: number;
  shape: WeaponShape;
  /** Второй удар по той же клетке. */
  twice: boolean;
  /** Выстрелов до перезарядки. Нет числа — не огнестрел. */
  magazine: number | null;
  /** Damage одного попадания. Колонка листа «Damage попадания». */
  hitDamage: number;
}

export const WEAPONS: readonly WeaponDef[] = [
  { id: "sword", name: "Sword", figure: "Three cells straight ahead.", range: 1, shape: "fan", twice: false, magazine: null, hitDamage: 100 },
  { id: "axe", name: "Axe", figure: "All eight neighboring cells, diagonals included.", range: 1, shape: "around", twice: false, magazine: null, hitDamage: 100 },
  { id: "dual", name: "Dual Blades", figure: "One adjacent cell, two hits.", range: 1, shape: "line", twice: true, magazine: null, hitDamage: 50 },
  { id: "spear", name: "Spear", figure: "A line ahead. It pierces two.", range: 2, shape: "line", twice: false, magazine: null, hitDamage: 80 },
  { id: "staff", name: "Staff", figure: "The same line as the spear.", range: 2, shape: "line", twice: false, magazine: null, hitDamage: 80 },
  { id: "gloves", name: "Gloves", figure: "One line ahead.", range: 3, shape: "line", twice: false, magazine: null, hitDamage: 80 },
  { id: "pistol", name: "Pistol", figure: "One line ahead. Magazine 3, then reload.", range: 3, shape: "line", twice: false, magazine: 3, hitDamage: 100 },
  { id: "rifle", name: "Rifle", figure: "One line ahead, one cell farther than the pistol. Magazine 3.", range: 4, shape: "line", twice: false, magazine: 3, hitDamage: 80 },
  { id: "shotgun", name: "Shotgun", figure: "A fan of three cells ahead. Magazine 2.", range: 3, shape: "fan", twice: false, magazine: 2, hitDamage: 100 },
];

export function weaponById(id: WeaponId): WeaponDef {
  const found = WEAPONS.find((weapon) => weapon.id === id);
  if (!found) throw new Error(`no weapon ${id}`);
  return found;
}

export interface WeaponVersion {
  id: string;
  base: WeaponId;
  rarity: Exclude<Rarity, "common">;
  bonus: StatBonus;
}

/** Версии с строки 16 вкладки «Оружие». Урон попадания — у базы. */
export const WEAPON_VERSIONS: readonly WeaponVersion[] = [
{ id: "sword-uncommon", base: "sword", rarity: "uncommon", bonus: { maxHp: UNIT.maxHp } },
  { id: "sword-rare", base: "sword", rarity: "rare", bonus: { maxMp: UNIT.maxMp, weaponPower: UNIT.weaponPower } },
  { id: "sword-epic", base: "sword", rarity: "epic", bonus: { abilityPower: UNIT.abilityPower, phys: UNIT.phys, fireRes: UNIT.fireRes } },
  { id: "axe-uncommon", base: "axe", rarity: "uncommon", bonus: { earthRes: UNIT.earthRes } },
  { id: "axe-rare", base: "axe", rarity: "rare", bonus: { poisonRes: UNIT.poisonRes, waterRes: UNIT.waterRes } },
  { id: "axe-epic", base: "axe", rarity: "epic", bonus: { iceRes: UNIT.iceRes, dodge: UNIT.dodge, critChance: UNIT.critChance } },
  { id: "dual-uncommon", base: "dual", rarity: "uncommon", bonus: { critShare: UNIT.critShare } },
  { id: "dual-rare", base: "dual", rarity: "rare", bonus: { physDmg: UNIT.physDmg, fireDmg: UNIT.fireDmg } },
  { id: "dual-epic", base: "dual", rarity: "epic", bonus: { earthDmg: UNIT.earthDmg, poisonDmg: UNIT.poisonDmg, waterDmg: UNIT.waterDmg } },
  { id: "spear-uncommon", base: "spear", rarity: "uncommon", bonus: { iceDmg: UNIT.iceDmg } },
  { id: "spear-rare", base: "spear", rarity: "rare", bonus: { maxHp: UNIT.maxHp, maxMp: UNIT.maxMp } },
  { id: "spear-epic", base: "spear", rarity: "epic", bonus: { weaponPower: UNIT.weaponPower, abilityPower: UNIT.abilityPower, phys: UNIT.phys } },
  { id: "staff-uncommon", base: "staff", rarity: "uncommon", bonus: { fireRes: UNIT.fireRes } },
  { id: "staff-rare", base: "staff", rarity: "rare", bonus: { earthRes: UNIT.earthRes, poisonRes: UNIT.poisonRes } },
  { id: "staff-epic", base: "staff", rarity: "epic", bonus: { waterRes: UNIT.waterRes, iceRes: UNIT.iceRes, dodge: UNIT.dodge } },
  { id: "gloves-uncommon", base: "gloves", rarity: "uncommon", bonus: { critChance: UNIT.critChance } },
  { id: "gloves-rare", base: "gloves", rarity: "rare", bonus: { critShare: UNIT.critShare, physDmg: UNIT.physDmg } },
  { id: "gloves-epic", base: "gloves", rarity: "epic", bonus: { fireDmg: UNIT.fireDmg, earthDmg: UNIT.earthDmg, poisonDmg: UNIT.poisonDmg } },
  { id: "pistol-uncommon", base: "pistol", rarity: "uncommon", bonus: { waterDmg: UNIT.waterDmg } },
  { id: "pistol-rare", base: "pistol", rarity: "rare", bonus: { maxHp: UNIT.maxHp, iceDmg: UNIT.iceDmg } },
  { id: "pistol-epic", base: "pistol", rarity: "epic", bonus: { maxMp: UNIT.maxMp, weaponPower: UNIT.weaponPower, abilityPower: UNIT.abilityPower } },
  { id: "rifle-uncommon", base: "rifle", rarity: "uncommon", bonus: { phys: UNIT.phys } },
  { id: "rifle-rare", base: "rifle", rarity: "rare", bonus: { fireRes: UNIT.fireRes, earthRes: UNIT.earthRes } },
  { id: "rifle-epic", base: "rifle", rarity: "epic", bonus: { poisonRes: UNIT.poisonRes, waterRes: UNIT.waterRes, iceRes: UNIT.iceRes } },
  { id: "shotgun-uncommon", base: "shotgun", rarity: "uncommon", bonus: { dodge: UNIT.dodge } },
  { id: "shotgun-rare", base: "shotgun", rarity: "rare", bonus: { critChance: UNIT.critChance, critShare: UNIT.critShare } },
  { id: "shotgun-epic", base: "shotgun", rarity: "epic", bonus: { physDmg: UNIT.physDmg, fireDmg: UNIT.fireDmg, earthDmg: UNIT.earthDmg } },
];

const VERSION_BY_ID = new Map(WEAPON_VERSIONS.map((row) => [row.id, row]));

export function weaponVersion(id: string): WeaponVersion | undefined {
  return VERSION_BY_ID.get(id);
}

/** Базовый тип. Редкая версия бьёт тем же узором и тем же уроном. */
export function weaponBaseId(id: string): WeaponId {
  return weaponVersion(id)?.base ?? (id as WeaponId);
}

export function weaponOf(id: string): WeaponDef {
  return weaponById(weaponBaseId(id));
}

export function weaponName(id: string): string {
  const version = weaponVersion(id);
  const base = weaponOf(id);
  if (!version) return base.name;
  const rank = version.rarity === "uncommon" ? "Uncommon" : version.rarity === "rare" ? "Rare" : "Epic";
  return `${rank} ${base.name}`;
}
