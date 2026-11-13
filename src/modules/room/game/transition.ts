import { reduceMotion } from "./comfort.ts";

/**
 * Плавный вход экрана хаба: новый экран проявляется из темноты с лёгким приближением.
 * Анимация идёт только при смене экрана. Перерисовка того же экрана (клик в инвентаре,
 * обновление таблицы гильдии) её не повторяет.
 */

const ENTER_MS = 300;


/**
 * Отмечает, что в host открыт экран name. Если это другой экран, он проявляется.
 * zoom false — для поля боя: там масштаб сбил бы попадание тапа по клетке.
 */
export function enterScreen(host: HTMLElement, name: string, zoom = true): void {
  if (host.dataset.screen === name) return;
  host.dataset.screen = name;
  if (reduceMotion() || typeof host.animate !== "function") return;
  const frames: Keyframe[] = zoom
    ? [
        { opacity: 0, filter: "brightness(0.35)", transform: "scale(1.02)" },
        { opacity: 1, filter: "brightness(1)", transform: "scale(1)" },
      ]
    : [
        { opacity: 0, filter: "brightness(0.35)" },
        { opacity: 1, filter: "brightness(1)" },
      ];
  host.animate(frames, { duration: ENTER_MS, easing: "cubic-bezier(0.2, 0.7, 0.2, 1)" });
}
