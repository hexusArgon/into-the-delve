import type { StatKey } from "../data/items.ts";

/** Имя атрибута в карточках и его цвет. */
export const CHIP_LABEL: Record<StatKey, [string, string]> = {
  maxHp: ["Max HP", "#f4efe4"],
  maxMp: ["Max MP", "#8eb7e8"],
  weaponPower: ["Weapon Power", "#d4bc82"],
  abilityPower: ["Ability Power", "#d4bc82"],
  phys: ["Physical resist", "#f0e2c4"],
  fireRes: ["Fire resist", "#e2582a"],
  earthRes: ["Earth resist", "#9a7434"],
  poisonRes: ["Poison resist", "#5fae3a"],
  waterRes: ["Water resist", "#3a7fd4"],
  iceRes: ["Ice resist", "#bfe6f5"],
  dodge: ["Dodge", "#c9b3ef"],
  critChance: ["Crit chance", "#e7c98a"],
  critShare: ["Crit damage", "#e2582a"],
  physDmg: ["Physical damage", "#f0e2c4"],
  fireDmg: ["Fire damage", "#e2582a"],
  earthDmg: ["Earth damage", "#9a7434"],
  poisonDmg: ["Poison damage", "#5fae3a"],
  waterDmg: ["Water damage", "#3a7fd4"],
  iceDmg: ["Ice damage", "#bfe6f5"],
};
