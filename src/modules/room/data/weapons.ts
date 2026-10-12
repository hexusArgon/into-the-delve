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
  /** Урон одного попадания. Колонка листа «Урон попадания». */
  hitDamage: number;
}

export const WEAPONS: readonly WeaponDef[] = [
  { id: "sword", name: "Меч", figure: "Три клетки прямо перед собой.", range: 1, shape: "fan", twice: false, magazine: null, hitDamage: 100 },
  { id: "axe", name: "Топор", figure: "Все восемь соседних клеток, включая диагональ.", range: 1, shape: "around", twice: false, magazine: null, hitDamage: 100 },
  { id: "dual", name: "Парные клинки", figure: "Одна соседняя клетка, два удара.", range: 1, shape: "line", twice: true, magazine: null, hitDamage: 50 },
  { id: "spear", name: "Копьё", figure: "Линия вперёд, пробивает двоих.", range: 2, shape: "line", twice: false, magazine: null, hitDamage: 80 },
  { id: "staff", name: "Посох", figure: "Та же линия, что у копья.", range: 2, shape: "line", twice: false, magazine: null, hitDamage: 80 },
  { id: "gloves", name: "Перчатки", figure: "Одна линия вперёд.", range: 3, shape: "line", twice: false, magazine: null, hitDamage: 80 },
  { id: "pistol", name: "Пистолет", figure: "Одна линия вперёд. Магазин 3, потом перезарядка.", range: 3, shape: "line", twice: false, magazine: 3, hitDamage: 100 },
  { id: "rifle", name: "Винтовка", figure: "Одна линия вперёд, на клетку дальше пистолета. Магазин 3.", range: 4, shape: "line", twice: false, magazine: 3, hitDamage: 80 },
  { id: "shotgun", name: "Дробовик", figure: "Веер на три клетки перед собой. Магазин 2.", range: 3, shape: "fan", twice: false, magazine: 2, hitDamage: 100 },
];

export function weaponById(id: WeaponId): WeaponDef {
  const found = WEAPONS.find((weapon) => weapon.id === id);
  if (!found) throw new Error(`нет оружия ${id}`);
  return found;
}
