/** Сетка хранилища. Пять строк видны сразу, дальше список растёт вниз. */

export const STORAGE_COLUMNS = 8;
const BASE_ROWS = 5;
const VIEW_ROWS = 5;
const CELL = 52;
const GAP = 8;

export function storageLayout(count: number): { rows: number; cells: number; scroll: boolean } {
  const occupied = count <= 0 ? 0 : Math.ceil(count / STORAGE_COLUMNS);
  const rows = Math.max(BASE_ROWS, occupied + 2);
  return { rows, cells: rows * STORAGE_COLUMNS, scroll: occupied >= 4 };
}

export function storageViewHeight(): number {
  return VIEW_ROWS * CELL + (VIEW_ROWS - 1) * GAP;
}

export function storageScroll(count: number): HTMLDivElement {
  const frame = document.createElement("div");
  frame.className = storageLayout(count).scroll ? "dungeon-storage-scroll is-live" : "dungeon-storage-scroll is-quiet";
  frame.style.maxHeight = `calc(${storageViewHeight()} * var(--hud))`;
  return frame;
}
