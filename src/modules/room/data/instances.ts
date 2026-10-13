import { itemById, EQUIPMENT_SLOTS, type GearBonus, EMPTY_GEAR } from "./items.ts";
import { HERO_ABILITIES, heroAbilityById } from "./hero-abilities.ts";
import { weaponById, type WeaponId } from "./weapons.ts";
import { armorFactor } from "../game/rules.ts";

/** Успех одной попытки. Провал — остаток. Накопления нет. */
export const SHARPEN_RATE = 0.7;
export const SHARPEN_CAP = 20;
/** Level 0 — база. Level n — база × 1,2^n, не сложение процентов. */
export const LEVEL_STEP = 1.2;

export type InstanceKind = "gear" | "weapon" | "ability";

export interface ItemInstance {
  id: string;
  catalogId: string;
  kind: InstanceKind;
  level: number;
}

export interface Loadout {
  nextId: number;
  items: ItemInstance[];
  /** Надетый экземпляр оружия. Empty — оружия нет. */
  weapon: string | null;
  worn: (string | null)[];
  wornAbilities: (string | null)[];
}

export function levelFactor(level: number): number {
  return LEVEL_STEP ** level;
}

/** Положительный бонус каталога. Ноль остаётся нулём. */
export function scaled(base: number | undefined, level: number): number {
  if (base === undefined || base <= 0) return 0;
  return base * levelFactor(level);
}

/** Шанс из очков: 1 − множитель брони Warcraft 3. Процент на 1,2 не умножается. */
export function pointChance(points: number): number {
  if (points <= 0) return 0;
  return 1 - armorFactor(points);
}

export function instanceById(loadout: Loadout, id: string | null): ItemInstance | undefined {
  if (!id) return undefined;
  return loadout.items.find((item) => item.id === id);
}

export function unworn(loadout: Loadout): ItemInstance[] {
  const held = new Set(
    [loadout.weapon, ...loadout.worn, ...loadout.wornAbilities].filter((id): id is string => id !== null),
  );
  return loadout.items.filter((item) => !held.has(item.id));
}

export function addInstance(loadout: Loadout, kind: InstanceKind, catalogId: string, level = 0): ItemInstance {
  const item: ItemInstance = { id: `i${loadout.nextId}`, catalogId, kind, level };
  loadout.nextId += 1;
  loadout.items.push(item);
  return item;
}

export function removeInstance(loadout: Loadout, id: string): void {
  loadout.items = loadout.items.filter((item) => item.id !== id);
  if (loadout.weapon === id) loadout.weapon = null;
  loadout.worn = loadout.worn.map((worn) => (worn === id ? null : worn));
  loadout.wornAbilities = loadout.wornAbilities.map((worn) => (worn === id ? null : worn));
}

/** Одно оружие в руках и две копии пояса жил. Весь каталог в мешок не кладётся. Без id — меч. */
export function freshLoadout(weapon: WeaponId = "sword"): Loadout {
  const loadout: Loadout = {
    nextId: 1,
    items: [],
    weapon: null,
    worn: Array.from({ length: EQUIPMENT_SLOTS }, () => null),
    wornAbilities: Array.from({ length: 4 }, () => null),
  };
  loadout.weapon = addInstance(loadout, "weapon", weapon).id;
  addInstance(loadout, "gear", "belt");
  addInstance(loadout, "gear", "belt");
  return loadout;
}

export function wornGearBonus(loadout: Loadout): GearBonus {
  const bonus: GearBonus = { ...EMPTY_GEAR };
  for (const id of loadout.worn) {
    const inst = instanceById(loadout, id);
    const row = inst?.kind === "gear" ? itemById(inst.catalogId) : undefined;
    if (!inst || !row) continue;
    bonus.maxHp += scaled(row.maxHp, inst.level);
    bonus.weaponPower += scaled(row.weaponPower, inst.level);
    bonus.phys += scaled(row.phys, inst.level);
    bonus.elem += scaled(row.elem, inst.level);
    bonus.dodge += scaled(row.dodge, inst.level);
    bonus.critChance += scaled(row.critChance, inst.level);
    bonus.critShare += scaled(row.critShare, inst.level);
  }
  return bonus;
}

/** Damage попадания надетого оружия. Пустые руки — 0, запасной меч не выдаётся. */
export function equippedWeaponHit(loadout: Loadout): number {
  const inst = instanceById(loadout, loadout.weapon);
  if (!inst || inst.kind !== "weapon") return 0;
  return scaled(weaponById(inst.catalogId as WeaponId).hitDamage, inst.level);
}

export function equippedWeaponId(loadout: Loadout): WeaponId | null {
  const inst = instanceById(loadout, loadout.weapon);
  if (!inst || inst.kind !== "weapon") return null;
  return inst.catalogId as WeaponId;
}

/** По экземпляру каждой способности героя. В freshLoadout не входит: там меч и два пояса. */
export function grantHeroAbilities(loadout: Loadout): void {
  for (const row of HERO_ABILITIES) {
    if (loadout.items.some((item) => item.kind === "ability" && item.catalogId === row.id)) continue;
    addInstance(loadout, "ability", row.id);
  }
}

/** Damage экземпляра способности. Мана, кулдаун и второй пул сюда не входят. */
export function abilityAmount(inst: ItemInstance): number {
  return scaled(heroAbilityById(inst.catalogId)?.damage, inst.level);
}

/** Второй урон разряда. У остальных способностей 0. */
export function abilitySplash(inst: ItemInstance): number {
  return scaled(heroAbilityById(inst.catalogId)?.splash, inst.level);
}

export type SharpenOutcome =
  | { ok: false; reason: string }
  | { ok: true; success: true; level: number }
  | { ok: true; success: false };

export function sharpen(loadout: Loadout, targetId: string, copyId: string, rng: () => number): SharpenOutcome {
  if (targetId === copyId) return { ok: false, reason: "The same piece cannot be picked twice." };
  const target = instanceById(loadout, targetId);
  const copy = instanceById(loadout, copyId);
  if (!target || !copy) return { ok: false, reason: "That piece is gone." };
  if (target.kind !== copy.kind || target.catalogId !== copy.catalogId) return { ok: false, reason: "That is not a copy." };
  if (target.level >= SHARPEN_CAP) return { ok: false, reason: "Level 20. Sharpening is closed." };
  const success = rng() < SHARPEN_RATE;
  removeInstance(loadout, copyId);
  if (!success) {
    removeInstance(loadout, targetId);
    return { ok: true, success: false };
  }
  target.level += 1;
  return { ok: true, success: true, level: target.level };
}
