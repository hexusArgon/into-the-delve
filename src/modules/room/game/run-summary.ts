import { heroAbilityById } from "../data/hero-abilities.ts";
import type { ItemInstance } from "../data/instances.ts";
import { itemById, type Rarity } from "../data/items.ts";
import { weaponBaseId, weaponName, type WeaponId } from "../data/weapons.ts";
import { lootRarity } from "./loot-fx.ts";
import { enterScreen } from "./transition.ts";

/**
 * Итог забега: что вынесено из подземелья. Показывается между забегом и меню, чтобы находки не
 * падали в мешок молча. Новые вещи остаются помеченными в хранилище (fresh.ts).
 */

export type RunEnd = "cleared" | "fell" | "left";

export interface RunSummary {
  end: RunEnd;
  /** Уровень приключения, выбранный перед забегом. */
  level: number;
  gold: number;
  /** Золото в мешке после забега. */
  bagGold: number;
  drops: readonly ItemInstance[];
}

export interface SummaryArt {
  gold: HTMLCanvasElement;
  weapons: Readonly<Partial<Record<WeaponId, HTMLCanvasElement>>>;
  items: Readonly<Record<string, HTMLCanvasElement>>;
  abilities: Readonly<Record<string, HTMLCanvasElement>>;
}

const RARITY_INK: Record<Rarity, string> = {
  common: "#e6dcc8",
  uncommon: "#7dce88",
  rare: "#7eb6e8",
  epic: "#c48ae0",
};

function headline(summary: RunSummary): string {
  if (summary.end === "cleared") return `Level ${summary.level} cleared`;
  if (summary.end === "fell") return `You fell on level ${summary.level}`;
  return `You left level ${summary.level}`;
}

function lead(summary: RunSummary): string {
  const found = summary.drops.length;
  if (summary.gold === 0 && found === 0) return "You carried nothing out this time.";
  const parts: string[] = [];
  if (found > 0) parts.push(found === 1 ? "one piece" : `${found} pieces`);
  if (summary.gold > 0) parts.push(`${summary.gold} gold`);
  return `You carried out ${parts.join(" and ")}.`;
}

export function dropName(item: ItemInstance): string {
  if (item.kind === "weapon") return weaponName(item.catalogId);
  if (item.kind === "gear") return itemById(item.catalogId)?.name ?? "Piece";
  return heroAbilityById(item.catalogId)?.name ?? "Ability";
}

export function dropRarity(item: ItemInstance): Rarity {
  return lootRarity(item.kind, item.catalogId);
}

function drawFit(canvas: HTMLCanvasElement, art: HTMLCanvasElement | undefined, pad: number): void {
  const ctx = canvas.getContext("2d");
  if (!ctx || !art) return;
  const side = Math.min(canvas.width, canvas.height) - pad * 2;
  const fit = side / Math.max(art.width, art.height);
  const w = art.width * fit;
  const h = art.height * fit;
  ctx.drawImage(art, (canvas.width - w) / 2, (canvas.height - h) / 2, w, h);
}

function dropArt(item: ItemInstance, art: SummaryArt): HTMLCanvasElement | undefined {
  if (item.kind === "weapon") return art.weapons[weaponBaseId(item.catalogId)];
  if (item.kind === "gear") return art.items[item.catalogId];
  return art.abilities[item.catalogId];
}

/** Экран итога. onDone — дальше в меню, onBag — сразу в инвентарь. */
export function paintRunSummary(host: HTMLElement, summary: RunSummary, art: SummaryArt, onDone: () => void, onBag: () => void): void {
  host.replaceChildren();
  host.className = "dungeon";
  host.style.display = "flex";
  host.style.flexDirection = "column";
  host.style.height = "100%";
  host.style.overflow = "auto";
  enterScreen(host, "summary");

  const page = document.createElement("div");
  page.className = `dungeon-summary is-${summary.end}`;
  const title = document.createElement("h1");
  title.className = "dungeon-title";
  title.textContent = headline(summary);
  const copy = document.createElement("p");
  copy.className = "dungeon-summary-lead";
  copy.textContent = lead(summary);
  page.append(title, copy);

  if (summary.gold > 0) {
    const purse = document.createElement("div");
    purse.className = "dungeon-summary-gold";
    const coin = document.createElement("canvas");
    coin.width = 64;
    coin.height = 64;
    drawFit(coin, art.gold, 4);
    const amount = document.createElement("b");
    amount.textContent = `+${summary.gold} gold`;
    const total = document.createElement("span");
    total.textContent = `${summary.bagGold} in the bag`;
    purse.append(coin, amount, total);
    page.append(purse);
  }

  if (summary.drops.length > 0) {
    const grid = document.createElement("div");
    grid.className = "dungeon-summary-drops";
    summary.drops.forEach((item, index) => {
      const card = document.createElement("div");
      const rarity = dropRarity(item);
      card.className = `dungeon-summary-drop dungeon-rarity-${rarity}`;
      card.style.setProperty("--delay", `${Math.min(index, 12) * 70}ms`);
      const icon = document.createElement("canvas");
      icon.width = 96;
      icon.height = 96;
      drawFit(icon, dropArt(item, art), 6);
      const name = document.createElement("span");
      name.className = "dungeon-summary-name";
      name.textContent = dropName(item);
      name.style.color = RARITY_INK[rarity];
      const tag = document.createElement("span");
      tag.className = "dungeon-summary-tag";
      tag.textContent = rarity === "common" ? "New" : `New · ${rarity}`;
      card.append(icon, name, tag);
      grid.append(card);
    });
    page.append(grid);
  }

  const actions = document.createElement("div");
  actions.className = "dungeon-summary-actions";
  const next = document.createElement("button");
  next.type = "button";
  next.className = "dungeon-button dungeon-button-primary";
  next.textContent = "Continue";
  const bag = document.createElement("button");
  bag.type = "button";
  bag.className = "dungeon-button";
  bag.textContent = "Open inventory";
  let left = false;
  const leave = (then: () => void): void => {
    if (left) return;
    left = true;
    window.removeEventListener("keydown", onKey);
    then();
  };
  const onKey = (event: KeyboardEvent): void => {
    if (!host.isConnected || host.dataset.screen !== "summary") {
      window.removeEventListener("keydown", onKey);
      return;
    }
    if (event.key === "Enter" || event.key === " " || event.key === "Escape") {
      event.preventDefault();
      leave(onDone);
    } else if (event.key === "i" || event.key === "I") {
      event.preventDefault();
      leave(onBag);
    }
  };
  next.addEventListener("click", () => leave(onDone));
  bag.addEventListener("click", () => leave(onBag));
  window.addEventListener("keydown", onKey);
  actions.append(next, bag);
  page.append(actions);
  host.append(page);
  next.focus({ preventScroll: true });
}
