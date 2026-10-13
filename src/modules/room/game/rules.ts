/** Числа, которые задал дизайнер. */
export const BLINK_CHARGES = 3;
/** Мана на комнату. В новой комнате шкала снова полная. Оружие её не тратит. Лист давал 100, дизайнер утроил. */
export const HERO_MP = 300;
/** Короткий телепорт. Выбор клетки — ромб: сумма шагов по осям не больше 3. */
export const BLINK_RANGE = 3;
export const SHIELD = 4;
export const STUN_TURNS = 2;
export const METER_TURNS = 5;

/** HP героя из листа, клетка Sheet1!Z42. Не возвращать 40. */
export const HERO_HP = 400;
/**
 * Ступень шкалы срыва в ГДД пустая, поэтому прибавка к урону равна нулю.
 * Damage удара берётся у оружия, урон монстра — у его строки.
 */
export const METER_STEP = 0;
/** Комнат на этаже, считая стартовую. */
export const FLOOR_ROOMS = 6;
/** Доля rooms этажа с телепортом. В комнате не больше одного. */
export const PORTAL_SHARE = 0.33;
/** Доля максимального здоровья, которую герой теряет, шагнув в обрыв. */
export const PIT_HP_SHARE = 0.25;

/** Броня по формуле Warcraft 3: множитель урона. Физический урон режет DEF, остальной — MDEF. */
export function armorFactor(armor: number): number {
  return armor >= 0 ? 1 / (1 + 0.06 * armor) : 2 - Math.pow(0.94, -armor);
}
