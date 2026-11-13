import { equippedWeaponHit, instanceById, scaled, wornGearBonus, type ItemInstance, type Loadout } from "../data/instances.ts";
import { grantBonus, itemById, STAT_KEYS, statKeysOf, UNIT, type StatBonus, type StatKey } from "../data/items.ts";
import { weaponName, weaponVersion } from "../data/weapons.ts";
import { CHIP_LABEL } from "./stat-labels.ts";

/**
 * Сравнение вещи из мешка с надетым. Снаряжение встаёт в пустой слот, а если все шесть заняты —
 * сравнивается с самой слабой надетой вещью (по сумме атрибутов в единицах UNIT листа «Предметы»).
 * Оружие сравнивается с надетым оружием. Разница — то, как изменится карточка героя.
 */

export interface Swap {
  slot: "weapon" | number;
  /** Надетая вещь, которую заменит новая. null — слот пустой. */
  replaces: ItemInstance | null;
}

export interface StatChange {
  key: StatKey | "hit";
  label: string;
  delta: number;
  /** Число — проценты урона. */
  percent: boolean;
}

function bonusOf(inst: ItemInstance): StatBonus | undefined {
  if (inst.kind === "gear") return itemById(inst.catalogId);
  if (inst.kind === "weapon") return weaponVersion(inst.catalogId)?.bonus;
  return undefined;
}

/** Сила вещи в единицах атрибутов: 1 — одна клетка листа. */
export function pieceScore(inst: ItemInstance): number {
  const bonus = bonusOf(inst);
  if (!bonus) return 0;
  let score = 0;
  for (const key of statKeysOf(bonus)) score += scaled(bonus[key], inst.level) / UNIT[key];
  return score;
}

export function swapFor(loadout: Loadout, piece: ItemInstance): Swap | null {
  if (piece.kind === "weapon") return { slot: "weapon", replaces: instanceById(loadout, loadout.weapon) ?? null };
  if (piece.kind !== "gear") return null;
  const empty = loadout.worn.indexOf(null);
  if (empty >= 0) return { slot: empty, replaces: null };
  let weakest = -1;
  let low = Infinity;
  loadout.worn.forEach((id, index) => {
    const inst = instanceById(loadout, id);
    const score = inst ? pieceScore(inst) : 0;
    if (score < low) {
      low = score;
      weakest = index;
    }
  });
  if (weakest < 0) return null;
  return { slot: weakest, replaces: instanceById(loadout, loadout.worn[weakest] ?? null) ?? null };
}

function trial(loadout: Loadout, id: string, slot: Swap["slot"]): Loadout {
  const worn = [...loadout.worn];
  if (slot !== "weapon") worn[slot] = id;
  return { ...loadout, worn, weapon: slot === "weapon" ? id : loadout.weapon };
}

/** Как изменится герой, если надеть вещь. null — вещь не надевается (способность, уже надета). */
export function equipDiff(loadout: Loadout, piece: ItemInstance): { swap: Swap; changes: StatChange[] } | null {
  if (loadout.weapon === piece.id || loadout.worn.includes(piece.id)) return null;
  const swap = swapFor(loadout, piece);
  if (!swap) return null;
  const next = trial(loadout, piece.id, swap.slot);
  const before = wornGearBonus(loadout);
  const after = wornGearBonus(next);
  const changes: StatChange[] = [];
  if (swap.slot === "weapon") {
    const hit = equippedWeaponHit(next) - equippedWeaponHit(loadout);
    if (hit !== 0) changes.push({ key: "hit", label: "Hit damage", delta: hit, percent: false });
  }
  for (const key of STAT_KEYS) {
    const delta = grantBonus(after[key] - before[key]);
    if (delta === 0) continue;
    changes.push({ key, label: CHIP_LABEL[key][0], delta, percent: key.endsWith("Dmg") });
  }
  return { swap, changes };
}

function swapName(inst: ItemInstance): string {
  const name = inst.kind === "weapon" ? weaponName(inst.catalogId) : (itemById(inst.catalogId)?.name ?? "a piece");
  return inst.level > 0 ? `${name} Lv ${inst.level}` : name;
}

function signed(change: StatChange): string {
  const value = String(Math.round(Math.abs(change.delta) * 100) / 100);
  return `${change.delta > 0 ? "+" : "−"}${value}${change.percent ? "%" : ""}`;
}

/** Блок «Если надеть» для карточки вещи в мешке. Стрелки дублируют цвет: рост ▲, падение ▼. */
export function compareSection(loadout: Loadout, piece: ItemInstance): HTMLElement | null {
  const diff = equipDiff(loadout, piece);
  if (!diff) return null;
  const box = document.createElement("div");
  box.className = "dungeon-compare";
  const head = document.createElement("div");
  head.className = "dungeon-compare-head";
  head.textContent = diff.swap.replaces ? `If equipped instead of ${swapName(diff.swap.replaces)}` : "If equipped";
  box.append(head);
  if (diff.changes.length === 0) {
    const same = document.createElement("div");
    same.className = "dungeon-compare-row";
    same.textContent = "No change to the hero.";
    box.append(same);
    return box;
  }
  for (const change of diff.changes) {
    const row = document.createElement("div");
    row.className = `dungeon-compare-row ${change.delta > 0 ? "is-up" : "is-down"}`;
    const mark = document.createElement("span");
    mark.className = "dungeon-compare-mark";
    mark.textContent = change.delta > 0 ? "▲" : "▼";
    mark.setAttribute("aria-hidden", "true");
    const name = document.createElement("span");
    name.textContent = change.label;
    const value = document.createElement("b");
    value.textContent = signed(change);
    row.append(mark, name, value);
    box.append(row);
  }
  return box;
}
