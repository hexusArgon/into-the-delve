import { itemById, EQUIPMENT_SLOTS, type GearBonus, EMPTY_GEAR } from "./items.ts";
import { HERO_ABILITIES, heroAbilityById } from "./hero-abilities.ts";
import { WEAPONS, weaponById, type WeaponId } from "./weapons.ts";
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

export type WearSlot = { kind: "weapon" } | { kind: "gear" | "ability"; index: number };

function readSlot(loadout: Loadout, slot: WearSlot): string | null {
  if (slot.kind === "weapon") return loadout.weapon;
  const list = slot.kind === "gear" ? loadout.worn : loadout.wornAbilities;
  return list[slot.index] ?? null;
}

function writeSlot(loadout: Loadout, slot: WearSlot, id: string | null): void {
  if (slot.kind === "weapon") loadout.weapon = id;
  else if (slot.kind === "gear") loadout.worn[slot.index] = id;
  else loadout.wornAbilities[slot.index] = id;
}

export function wornSlot(loadout: Loadout, id: string): WearSlot | null {
  if (loadout.weapon === id) return { kind: "weapon" };
  const gear = loadout.worn.indexOf(id);
  if (gear >= 0) return { kind: "gear", index: gear };
  const ability = loadout.wornAbilities.indexOf(id);
  if (ability >= 0) return { kind: "ability", index: ability };
  return null;
}

/** Надеть, снять или поменять два слота. Чужая вещь в слот не встаёт. */
export function placeInstance(loadout: Loadout, id: string, to: WearSlot | "storage"): "ok" | "missing" | "fit" | "same" {
  const item = instanceById(loadout, id);
  if (!item) return "missing";
  if (to === "storage") {
    const from = wornSlot(loadout, id);
    if (!from) return "same";
    writeSlot(loadout, from, null);
    return "ok";
  }
  if (item.kind !== to.kind) return "fit";
  if (to.kind !== "weapon") {
    const list = to.kind === "gear" ? loadout.worn : loadout.wornAbilities;
    if (to.index < 0 || to.index >= list.length) return "fit";
  }
  const previous = readSlot(loadout, to);
  if (previous === id) return "same";
  const from = wornSlot(loadout, id);
  writeSlot(loadout, to, id);
  if (from) writeSlot(loadout, from, previous);
  return "ok";
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

const LOADOUT_KEY = "dungeon-loadout";

function catalogOk(kind: InstanceKind, catalogId: string): boolean {
  if (kind === "weapon") return WEAPONS.some((weapon) => weapon.id === catalogId);
  if (kind === "gear") return itemById(catalogId) !== undefined;
  return heroAbilityById(catalogId) !== undefined;
}

let afterSave: ((loadout: Loadout) => void) | null = null;

/** Сервер подписывается после входа, чтобы не затереть чужое сохранение своим. */
export function onLoadoutSaved(listener: (loadout: Loadout) => void): void {
  afterSave = listener;
}

/** Надетое и мешок. Без хранилища остаётся стартовый набор. */
export function saveLoadout(loadout: Loadout): void {
  try {
    localStorage.setItem(LOADOUT_KEY, JSON.stringify(loadout));
  } catch {
    /* приватный режим или тест без браузера */
  }
  afterSave?.(loadout);
}

export function copyLoadout(from: Loadout, to: Loadout): void {
  to.nextId = from.nextId;
  to.items = from.items.map((item) => ({ ...item }));
  to.weapon = from.weapon;
  to.worn = [...from.worn];
  to.wornAbilities = [...from.wornAbilities];
}

export function loadoutFromJson(raw: string, weapon: WeaponId = "sword"): Loadout | null {
  try {
    return parseLoadout(JSON.parse(raw), weapon);
  } catch {
    return null;
  }
}

export function storedLoadout(weapon: WeaponId = "sword"): Loadout {
  try {
    const raw = localStorage.getItem(LOADOUT_KEY);
    if (!raw) return freshLoadout(weapon);
    return parseLoadout(JSON.parse(raw), weapon);
  } catch {
    return freshLoadout(weapon);
  }
}

function parseLoadout(data: unknown, weapon: WeaponId): Loadout {
  if (!data || typeof data !== "object") return freshLoadout(weapon);
  const row = data as Partial<Loadout>;
  if (!Array.isArray(row.items)) return freshLoadout(weapon);
  const items: ItemInstance[] = [];
  for (const item of row.items) {
    if (!item || typeof item !== "object") continue;
    const piece = item as Partial<ItemInstance>;
    if (typeof piece.id !== "string" || typeof piece.catalogId !== "string") continue;
    if (piece.kind !== "gear" && piece.kind !== "weapon" && piece.kind !== "ability") continue;
    if (!catalogOk(piece.kind, piece.catalogId)) continue;
    const level = typeof piece.level === "number" && piece.level >= 0 ? Math.min(SHARPEN_CAP, Math.floor(piece.level)) : 0;
    if (items.some((have) => have.id === piece.id)) continue;
    items.push({ id: piece.id, catalogId: piece.catalogId, kind: piece.kind, level });
  }
  if (items.length === 0) return freshLoadout(weapon);
  const known = new Set(items.map((item) => item.id));
  const slot = (id: unknown): string | null => (typeof id === "string" && known.has(id) ? id : null);
  const worn = Array.from({ length: EQUIPMENT_SLOTS }, (_, index) => slot(Array.isArray(row.worn) ? row.worn[index] : null));
  const wornAbilities = Array.from({ length: 4 }, (_, index) => slot(Array.isArray(row.wornAbilities) ? row.wornAbilities[index] : null));
  for (let index = 0; index < worn.length; index += 1) {
    const inst = items.find((item) => item.id === worn[index]);
    if (inst && inst.kind !== "gear") worn[index] = null;
  }
  for (let index = 0; index < wornAbilities.length; index += 1) {
    const inst = items.find((item) => item.id === wornAbilities[index]);
    if (inst && inst.kind !== "ability") wornAbilities[index] = null;
  }
  let held = slot(row.weapon);
  const heldInst = items.find((item) => item.id === held);
  if (!heldInst || heldInst.kind !== "weapon") held = null;
  let nextId = typeof row.nextId === "number" && row.nextId > 0 ? Math.floor(row.nextId) : 1;
  for (const item of items) {
    const n = Number(item.id.slice(1));
    if (Number.isFinite(n) && n >= nextId) nextId = n + 1;
  }
  return { nextId, items, weapon: held, worn, wornAbilities };
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
