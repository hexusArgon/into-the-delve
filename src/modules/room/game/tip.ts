import type { AbilityView } from "../data/hero-abilities.ts";
import { coarsePointer } from "./tutorial.ts";

let tip: HTMLElement | null = null;
let tipHover = false;
let hideTimer = 0;

const ABILITY_TONE = {
  fire: "#e2582a",
  earth: "#9a7434",
  oil: "#6b4f1f",
  poison: "#5fae3a",
  water: "#3a7fd4",
  ice: "#bfe6f5",
} as const;

const ELEMENT_NAME: Record<AbilityView["element"], string> = {
  fire: "Fire",
  earth: "Earth",
  poison: "Poison",
  water: "Water",
  ice: "Ice",
};

const WORD_TONE: Record<string, string> = {
  fire: ABILITY_TONE.fire,
  earth: ABILITY_TONE.earth,
  oil: ABILITY_TONE.oil,
  poison: ABILITY_TONE.poison,
  water: ABILITY_TONE.water,
  ice: ABILITY_TONE.ice,
};

export function bindTip(
  el: HTMLElement,
  name: string | (() => string),
  text: string | (() => string),
  nameColor?: string | (() => string | undefined),
  press = false,
): void {
  const show = (anchor: HTMLElement | null, event: PointerEvent | null): void => {
    const node = tipBox();
    node.replaceChildren();
    const title = document.createElement("div");
    title.textContent = typeof name === "function" ? name() : name;
    const color = typeof nameColor === "function" ? nameColor() : nameColor;
    title.style.color = color ?? "#f4f7fb";
    title.style.fontWeight = "700";
    const body = document.createElement("div");
    body.textContent = typeof text === "function" ? text() : text;
    body.style.marginTop = "4px";
    body.style.color = "#d4bc82";
    body.style.whiteSpace = "pre-wrap";
    node.append(title, body);
    node.style.pointerEvents = "none";
    node.style.display = "block";
    if (press && anchor) placeTouchTip(anchor);
    else if (event) {
      node.style.maxWidth = "calc(320 * var(--hud))";
      node.classList.remove("is-side");
      moveTip(event);
    }
  };
  if (press) {
    el.addEventListener("pointerdown", (event) => {
      if (event.button !== 0) return;
      event.preventDefault();
      show(el, null);
    });
    return;
  }
  el.addEventListener("pointerenter", (event) => show(null, event));
  el.addEventListener("pointermove", moveTip);
  el.addEventListener("pointerleave", hideTip);
}

export function tipBox(): HTMLElement {
  if (tip) return tip;
  tip = document.createElement("div");
  tip.className = "dungeon-tip";
  tip.style.position = "fixed";
  tip.style.zIndex = "30";
  tip.style.display = "none";
  tip.style.maxWidth = "calc(320 * var(--hud))";
  tip.style.padding = "calc(8 * var(--hud)) calc(10 * var(--hud))";
  tip.style.pointerEvents = "none";
  tip.style.font = "calc(14 * var(--hud)) Palatino Linotype, Palatino, serif";
  tip.addEventListener("pointerenter", () => {
    tipHover = true;
    window.clearTimeout(hideTimer);
  });
  tip.addEventListener("pointerleave", () => {
    tipHover = false;
    scheduleHide();
  });
  document.body.append(tip);
  return tip;
}

function placeTip(clientX: number, clientY: number): void {
  const node = tipBox();
  const gap = 18;
  const margin = 8;
  const width = node.offsetWidth || 280;
  const height = node.offsetHeight || 120;
  const spots = [
    { x: clientX + gap, y: clientY + gap },
    { x: clientX - gap - width, y: clientY + gap },
    { x: clientX + gap, y: clientY - gap - height },
    { x: clientX - gap - width, y: clientY - gap - height },
  ];
  const onScreen = (spot: { x: number; y: number }): boolean =>
    spot.x >= margin &&
    spot.y >= margin &&
    spot.x + width <= window.innerWidth - margin &&
    spot.y + height <= window.innerHeight - margin;
  const spot = spots.find(onScreen);
  let x = spot?.x ?? clientX + gap;
  let y = spot?.y ?? clientY + gap;
  const clamp = (value: number, size: number, limit: number): number =>
    Math.min(Math.max(margin, value), Math.max(margin, limit - size - margin));
  x = clamp(x, width, window.innerWidth);
  y = clamp(y, height, window.innerHeight);
  const covers = clientX >= x && clientX <= x + width && clientY >= y && clientY <= y + height;
  if (covers) {
    const left = clientX - gap - width;
    x = left >= margin ? left : clientX + gap;
    x = clamp(x, width, window.innerWidth);
  }
  node.style.left = `${x}px`;
  node.style.top = `${y}px`;
}

/** Сбоку от поля: иконка слева — карточка справа, и наоборот. */
function placeTouchTip(anchor: HTMLElement): void {
  const node = tipBox();
  node.classList.add("is-side");
  node.style.font = "14px Palatino Linotype, Palatino, serif";
  node.style.maxWidth = "min(230px, 46vw)";
  const width = node.offsetWidth || 230;
  const height = node.offsetHeight || 80;
  const rect = anchor.getBoundingClientRect();
  const focus = document.querySelector(".dungeon-focus:not([hidden])");
  const focusBox = focus instanceof HTMLElement ? focus.getBoundingClientRect() : null;
  const onLeft = rect.left + rect.width / 2 < window.innerWidth / 2;
  const x = onLeft ? Math.max(8, window.innerWidth - width - 8) : 8;
  let y = 8;
  const overlaps = focusBox !== null && focusBox.width > 0 && x < focusBox.right && x + width > focusBox.left;
  if (overlaps) y = focusBox.bottom + 8;
  if (y + height > window.innerHeight - 8) y = Math.max(8, window.innerHeight - height - 8);
  node.style.left = `${x}px`;
  node.style.top = `${y}px`;
}

export function moveTip(event: PointerEvent): void {
  placeTip(event.clientX, event.clientY);
}

export function hideTip(): void {
  window.clearTimeout(hideTimer);
  tipHover = false;
  if (!tip) return;
  tip.style.display = "none";
  tip.style.pointerEvents = "none";
  tip.style.maxWidth = "calc(320 * var(--hud))";
  tip.style.font = "calc(14 * var(--hud)) Palatino Linotype, Palatino, serif";
  tip.classList.remove("is-side");
}

/** Карточка стоит на месте, пока курсор на ней или на иконке. */
export function bindCardTip(el: HTMLElement, render: () => HTMLElement, press = false): void {
  const show = (anchor: HTMLElement | null, event: PointerEvent | null): void => {
    window.clearTimeout(hideTimer);
    const node = tipBox();
    node.replaceChildren(render());
    node.style.pointerEvents = "none";
    node.style.display = "block";
    if (press && anchor) placeTouchTip(anchor);
    else if (event) {
      node.style.maxWidth = "calc(340 * var(--hud))";
      node.classList.remove("is-side");
      placeTip(event.clientX, event.clientY);
    }
  };
  if (press) {
    el.addEventListener("pointerdown", (event) => {
      if (event.button !== 0) return;
      event.preventDefault();
      show(el, null);
    });
    return;
  }
  el.addEventListener("pointerenter", (event) => show(null, event));
  el.addEventListener("pointermove", (event) => {
    if (tipBox().style.display === "none") return;
    placeTip(event.clientX, event.clientY);
  });
  el.addEventListener("pointerleave", () => scheduleHide());
}

export function bindAbilityTip(el: HTMLElement, read: () => AbilityView | null, press = false): void {
  bindCardTip(el, () => {
    const card = read();
    if (card) return abilityCard(card);
    const empty = document.createElement("div");
    const title = document.createElement("div");
    title.textContent = "Empty";
    title.style.color = "#f4f7fb";
    title.style.fontWeight = "700";
    const body = document.createElement("div");
    body.textContent = "Empty slot.";
    body.style.marginTop = "calc(4 * var(--hud))";
    body.style.color = "#d4bc82";
    empty.append(title, body);
    return empty;
  }, press);
}

/** На телефоне кнопка вне поля закрывает прошлое описание. Карточка откроется своим кликом следом. */
export function dismissTipsOnPress(host: HTMLElement, board: HTMLElement): void {
  if (!coarsePointer()) return;
  host.addEventListener("pointerdown", (event) => {
    const target = event.target;
    if (!(target instanceof Node)) return;
    if (tipBox().contains(target)) return;
    if (target === board) return;
    hideTip();
  }, true);
}

function scheduleHide(): void {
  window.clearTimeout(hideTimer);
  hideTimer = window.setTimeout(() => {
    if (!tipHover) hideTip();
  }, 140);
}

function abilityCard(view: AbilityView): HTMLElement {
  const root = document.createElement("div");
  root.className = "dungeon-ability-card";
  const head = document.createElement("div");
  head.className = "dungeon-ability-head";
  const title = document.createElement("div");
  title.className = "dungeon-ability-name";
  title.textContent = view.level === null ? view.name : `${view.name}`;
  const element = document.createElement("div");
  element.className = "dungeon-ability-element";
  element.textContent = ELEMENT_NAME[view.element];
  const tone = ABILITY_TONE[view.element];
  element.style.color = tone;
  element.style.borderColor = tone;
  head.append(title, element);
  if (view.level !== null) {
    const level = document.createElement("div");
    level.className = "dungeon-ability-level";
    level.textContent = `Lv ${view.level}`;
    head.append(level);
  }

  const stats = document.createElement("div");
  stats.className = "dungeon-ability-stats";
  stats.append(
    statChip("Damage", damageText(view), tone),
    statChip("Mana", String(view.mp), "#7eb6ee"),
    statChip("Cooldown", view.cooldown > 0 ? String(view.cooldown) : "None", "#d4bc82"),
  );

  const rules = document.createElement("div");
  rules.className = "dungeon-ability-rules";
  for (const line of view.lines) {
    const row = document.createElement("p");
    row.className = "dungeon-ability-rule";
    row.style.borderLeftColor = tone;
    row.append(ruleText(line, view.damage, view.splash, tone));
    rules.append(row);
  }
  root.append(head, stats, rules);
  return root;
}

function statChip(label: string, value: string, color: string): HTMLElement {
  const chip = document.createElement("div");
  chip.className = "dungeon-ability-stat";
  const name = document.createElement("span");
  name.textContent = label;
  const number = document.createElement("b");
  number.textContent = value;
  number.style.color = color;
  chip.append(name, number);
  return chip;
}

function damageText(view: AbilityView): string {
  return view.splash > 0 ? `${view.damage} / ${view.splash}` : String(view.damage);
}

function ruleText(line: string, damage: number, splash: number, tone: string): DocumentFragment {
  const fragment = document.createDocumentFragment();
  const token = /(\d+\s*[×x]\s*\d+|\d+|\b(?:fire|water|poison|earth|oil|ice)\b)/gi;
  let cursor = 0;
  for (const match of line.matchAll(token)) {
    const index = match.index ?? 0;
    if (index > cursor) fragment.append(line.slice(cursor, index));
    const word = match[0];
    const mark = document.createElement("span");
    const toneWord = WORD_TONE[word.toLowerCase()];
    const range = /[×x]/i.test(word);
    const amount = Number(word);
    if (toneWord) {
      mark.style.color = toneWord;
      mark.style.fontWeight = "700";
    } else if (!range && (amount === damage || (splash > 0 && amount === splash))) {
      mark.className = "dungeon-ability-num";
      mark.style.color = tone;
    } else {
      mark.className = "dungeon-ability-num";
    }
    mark.textContent = word;
    fragment.append(mark);
    cursor = index + word.length;
  }
  if (cursor < line.length) fragment.append(line.slice(cursor));
  return fragment;
}
