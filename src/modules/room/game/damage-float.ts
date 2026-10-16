import type { DamageType } from "../data/monsters.ts";

/** Потеря здоровья, которую вид забирает и рисует вылетом из фигуры. */
export interface DamageHit {
  x: number;
  y: number;
  amount: number;
  type: DamageType;
  crit: boolean;
}

/** Цвета строк на карточке стихий дизайнера. */
export const DAMAGE_INK: Record<DamageType, string> = {
  physical: "#BCAC94",
  fire: "#F34418",
  earth: "#A35918",
  poison: "#5BC437",
  water: "#2197F1",
  ice: "#84DBF8",
};

/**
 * Угол вылета в градусах: 0 — вверх, плюс — вправо.
 * Шаг 30°. Одно число идёт вверх, три — на −30, 0 и 30.
 */
export function damageFan(index: number, count: number): number {
  if (count <= 1) return 0;
  return (index - (count - 1) / 2) * 30;
}

/** Целое число. Крит дописывает восклицательный знак. Ноль не показывается. */
export function damageLabel(amount: number, crit: boolean): string {
  const shown = Math.round(amount);
  if (shown <= 0) return "";
  return crit ? `${shown}!` : String(shown);
}
