import { itemById } from "../data/items.ts";

/** Подсказка торгового дома и цвет редкости лота. */

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className = "", text = ""): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text) node.textContent = text;
  return node;
}

function button(label: string, onClick: () => void, primary = true): HTMLButtonElement {
  const node = el("button", primary ? "dungeon-button dungeon-button-primary" : "dungeon-button", label);
  node.type = "button";
  node.addEventListener("click", onClick);
  return node;
}

const INTRO_KEY = "dungeon-market-intro";

export function introSeen(): boolean {
  try {
    return localStorage.getItem(INTRO_KEY) === "seen";
  } catch {
    return false;
  }
}

export function markIntroSeen(): void {
  try {
    localStorage.setItem(INTRO_KEY, "seen");
  } catch {
    /* приватный режим */
  }
}

/** Как попасть на рынок, в трёх строках. Показывается при первом входе и по кнопке «?». */
export function introPanel(onClose: () => void): HTMLElement {
  const box = el("section", "dungeon-panel dungeon-market-intro");
  box.append(el("h2", "dungeon-heading", "How the market works"));
  const list = el("ol", "dungeon-market-steps");
  for (const step of [
    "Sell: pick a piece from your bag. It moves to the market with its sharpening; worn pieces and weapons stay with you.",
    "Set a fixed price, or start an auction that goes to the highest bid. Lots run 12, 24 or 48 hours.",
    "Buyers pay in Into the Delve tokens. Bought pieces land in your bag; ended auctions and returns are collected in My lots.",
  ]) {
    list.append(el("li", "", step));
  }
  box.append(list, button("Got it", onClose));
  return box;
}

export function rarityTone(catalogId: string): string {
  const rarity = itemById(catalogId)?.rarity;
  return rarity && rarity !== "common" ? `dungeon-rarity-${rarity}` : "";
}

/** Шаг подтверждения перед тратой: вопрос, предупреждение, «Подтвердить» и «Отмена». */
export function confirmBox(question: string, warn: string | null, onYes: () => void, onNo: () => void): HTMLElement {
  const box = el("div", "dungeon-confirm");
  box.setAttribute("role", "alertdialog");
  box.append(el("p", "dungeon-confirm-ask", question));
  if (warn) box.append(el("p", "dungeon-confirm-warn", warn));
  const row = el("div", "dungeon-confirm-row");
  const yes = button("Confirm", onYes);
  row.append(yes, button("Cancel", onNo, false));
  box.append(row);
  queueMicrotask(() => yes.focus({ preventScroll: true }));
  return box;
}
