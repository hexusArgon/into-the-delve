export type ShelfFilter = "all" | "weapon" | "gear" | "ability";
export type ShelfSort = "kept" | "name" | "rarity";
export type ShelfKind = "gold" | "weapon" | "gear" | "ability" | "stack";

export interface ShelfBar {
  query: string;
  filter: ShelfFilter;
  sort: ShelfSort;
  search: boolean;
}

const FILTERS: readonly ShelfFilter[] = ["all", "weapon", "gear", "ability"];
const SORTS: readonly ShelfSort[] = ["kept", "name", "rarity"];

const FILTER_LABEL: Record<ShelfFilter, string> = {
  all: "All",
  weapon: "Weapons",
  gear: "Gear",
  ability: "Abilities",
};

const SORT_LABEL: Record<ShelfSort, string> = {
  kept: "As stored",
  name: "Name",
  rarity: "Rarity",
};

export function freshShelf(): ShelfBar {
  return { query: "", filter: "all", sort: "kept", search: false };
}

export function rarityRank(rarity: string | undefined): number {
  if (rarity === "common") return 0;
  if (rarity === "uncommon") return 1;
  if (rarity === "rare") return 2;
  if (rarity === "epic") return 3;
  return 4;
}

export function shelfMatch(kind: ShelfKind, name: string, bar: ShelfBar): boolean {
  if (bar.filter !== "all" && kind !== bar.filter) return false;
  const query = bar.query.trim().toLowerCase();
  return query === "" || name.toLowerCase().includes(query);
}

export function shelfOrder<T>(items: readonly T[], bar: ShelfBar, name: (item: T) => string, rarity: (item: T) => string | undefined): T[] {
  const indexed = items.map((item, index) => ({ item, index }));
  if (bar.sort === "name") {
    indexed.sort((a, b) => name(a.item).localeCompare(name(b.item), "ru") || a.index - b.index);
  } else if (bar.sort === "rarity") {
    indexed.sort(
      (a, b) =>
        rarityRank(rarity(a.item)) - rarityRank(rarity(b.item)) ||
        name(a.item).localeCompare(name(b.item), "ru") ||
        a.index - b.index,
    );
  }
  return indexed.map((entry) => entry.item);
}

/** Кнопки фильтра, сортировки и поиска. Search открывает поле. */
export function shelfBar(bar: ShelfBar, redraw: () => void): HTMLElement {
  const row = document.createElement("div");
  row.className = "dungeon-shelf-bar";
  row.append(
    cycleButton(`Filter: ${FILTER_LABEL[bar.filter]}`, () => {
      bar.filter = FILTERS[(FILTERS.indexOf(bar.filter) + 1) % FILTERS.length] ?? "all";
      redraw();
    }),
    cycleButton(`Sort: ${SORT_LABEL[bar.sort]}`, () => {
      bar.sort = SORTS[(SORTS.indexOf(bar.sort) + 1) % SORTS.length] ?? "kept";
      redraw();
    }),
    cycleButton("Search", () => {
      bar.search = !bar.search;
      if (!bar.search) bar.query = "";
      redraw();
      if (bar.search) document.querySelector<HTMLInputElement>(".dungeon-shelf-search")?.focus();
    }, bar.search),
  );
  if (bar.search) {
    const input = document.createElement("input");
    input.type = "search";
    input.className = "dungeon-input dungeon-shelf-search";
    input.placeholder = "Name";
    input.value = bar.query;
    input.addEventListener("input", () => {
      bar.query = input.value;
      const caret = input.selectionStart ?? input.value.length;
      redraw();
      const next = document.querySelector<HTMLInputElement>(".dungeon-shelf-search");
      if (!next) return;
      next.focus();
      next.setSelectionRange(caret, caret);
    });
    row.append(input);
  }
  return row;
}

function cycleButton(label: string, onClick: () => void, primary = false): HTMLButtonElement {
  const button = document.createElement("button");
  button.type = "button";
  button.className = primary ? "dungeon-button dungeon-button-primary" : "dungeon-button";
  button.textContent = label;
  button.addEventListener("click", onClick);
  return button;
}
