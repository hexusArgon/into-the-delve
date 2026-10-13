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
