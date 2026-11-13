/**
 * Удобство движения: сила дрожи экрана и «меньше движения». Без выбора игрока «меньше движения»
 * берётся из системной настройки (prefers-reduced-motion). Выбор помнится в браузере.
 *
 * При «меньше движения» не дрожит экран, фигуры не отбрасывает и они не дышат, факелы горят
 * ровно, частицы стихий не летят, добыча не подпрыгивает, экраны хаба сменяются без проявления.
 * Вспышки, цвета и звук остаются: по ним видно, что произошло.
 */

const SHAKE_KEY = "dungeon-shake";
const CALM_KEY = "dungeon-calm";
/** Верх ползунка дрожи: полтора прежнего толчка. */
export const SHAKE_MAX = 1.5;

function read(key: string): string | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* приватный режим: выбор живёт до перезагрузки */
  }
}

function systemCalm(): boolean {
  try {
    return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return false;
  }
}

function readShake(): number {
  const raw = Number(read(SHAKE_KEY));
  if (read(SHAKE_KEY) === null || !Number.isFinite(raw)) return 1;
  return Math.max(0, Math.min(SHAKE_MAX, raw));
}

function readCalm(): boolean | null {
  const raw = read(CALM_KEY);
  return raw === "on" ? true : raw === "off" ? false : null;
}

let shake = readShake();
let calm = readCalm();

function markRoot(): void {
  if (typeof document === "undefined") return;
  document.documentElement.classList.toggle("dungeon-calm", reduceMotion());
}

/** Меньше движения: выбор игрока, а без него — системная настройка. */
export function reduceMotion(): boolean {
  return calm ?? systemCalm();
}

export function setReduceMotion(on: boolean): void {
  calm = on;
  write(CALM_KEY, on ? "on" : "off");
  markRoot();
}

/** Ползунок дрожи 0..SHAKE_MAX, 1 — как задумано. */
export function shakeSetting(): number {
  return shake;
}

export function setShakeSetting(level: number): void {
  shake = Math.max(0, Math.min(SHAKE_MAX, level));
  write(SHAKE_KEY, String(shake));
}

/** Множитель дрожи экрана в кадре. */
export function shakeScale(): number {
  return reduceMotion() ? 0 : shake;
}

/** Множитель отброса фигуры при попадании. */
export function knockScale(): number {
  return reduceMotion() ? 0 : 1;
}

markRoot();
