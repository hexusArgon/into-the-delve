import { attrText, heroAttributes } from "../data/attributes.ts";
import { abilityView, heroAbilityById } from "../data/hero-abilities.ts";
import { EQUIPMENT_SLOTS, critFactor, formatStat, itemById, statKeysOf, type GearBonus, type Rarity } from "../data/items.ts";
import { abilityAmount, abilitySplash, instanceById, pointChance, scaled, type Loadout } from "../data/instances.ts";
import { weaponBaseId, weaponById, weaponName, weaponOf, weaponVersion, type WeaponId } from "../data/weapons.ts";
import { HERO_HP, HERO_CRIT_CHANCE } from "./rules.ts";
import type { Sprites } from "./sprites.ts";
import { bindAbilityTip, bindTip, hideTip, moveTip, tipBox } from "./tip.ts";

const ABILITY_SLOTS = 4;

/** Лист героя поверх боя. Только просмотр: атрибуты, надетое, способности. */
export function openCharacter(
  host: HTMLElement,
  bonus: GearBonus,
  weaponId: WeaponId,
  loadout: Loadout | null,
  sprites: Sprites | null,
  onClose: () => void,
): HTMLElement {
  const veil = document.createElement("div");
  veil.className = "dungeon-character";
  const panel = document.createElement("div");
  panel.className = "dungeon-panel dungeon-character-panel";
  panel.addEventListener("click", (event) => event.stopPropagation());

  const title = document.createElement("h1");
  title.className = "dungeon-title";
  title.textContent = "Character";

  const close = document.createElement("button");
  close.type = "button";
  close.className = "dungeon-button";
  close.textContent = "Close";
  close.addEventListener("click", onClose);
  veil.addEventListener("click", onClose);

  const body = document.createElement("div");
  body.className = "dungeon-character-body";
  const gear = document.createElement("div");
  gear.className = "dungeon-character-gear";
  gear.append(equipmentBlock(weaponId, loadout, sprites), abilityBlock(loadout, sprites));
  body.append(heroCard(bonus, sprites), gear);
  panel.append(title, body, close);
  veil.append(panel);
  host.append(veil);
  return veil;
}

function heroCard(bonus: GearBonus, sprites: Sprites | null): HTMLElement {
  const box = document.createElement("section");
  box.className = "dungeon-panel dungeon-hero-panel";
  box.append(heading("Hero"));
  const row = document.createElement("div");
  row.className = "dungeon-hero";
  const portrait = document.createElement("canvas");
  portrait.width = 96;
  portrait.height = 96;
  portrait.className = "dungeon-icon dungeon-hero-portrait";
  if (sprites) {
    const ctx = portrait.getContext("2d");
    ctx?.drawImage(sprites.hero, 8, 4, 80, 88);
  }
  const sheet = document.createElement("div");
  sheet.className = "dungeon-hero-sheet";
  const attrs = heroAttributes();
  const critChance = Math.min(1, HERO_CRIT_CHANCE + pointChance(bonus.critChance));
  const groups = [
    heroGroup("Body", [
      { name: "Max HP", value: String(HERO_HP + bonus.maxHp) },
      { name: "Max MP", value: String(Number(attrText(attrs, "MaxMp")) + bonus.maxMp) },
    ]),
    heroGroup("Power", [
      { name: "Weapon Power", value: shown(bonus.weaponPower) },
      { name: "Ability Power", value: shown(bonus.abilityPower) },
    ]),
    heroGroup("Resistance", [
      { name: "Physical", value: shown(bonus.phys), tip: resistTip(bonus.phys) },
      { name: "Fire", value: shown(bonus.fireRes), color: "#e2582a", tip: resistTip(bonus.fireRes) },
      { name: "Earth", value: shown(bonus.earthRes), color: "#9a7434", tip: resistTip(bonus.earthRes) },
      { name: "Poison", value: shown(bonus.poisonRes), color: "#5fae3a", tip: resistTip(bonus.poisonRes) },
      { name: "Water", value: shown(bonus.waterRes), color: "#3a7fd4", tip: resistTip(bonus.waterRes) },
      { name: "Ice", value: shown(bonus.iceRes), color: "#bfe6f5", tip: resistTip(bonus.iceRes) },
    ]),
    heroGroup("Chance", [
      { name: "Dodge", value: shown(bonus.dodge), tip: `Dodge: ${gamePercent(pointChance(bonus.dodge))}` },
      {
        name: "Crit chance",
        value: gamePercent(critChance),
        tip: `Crit chance: ${gamePercent(critChance)}`,
      },
      {
        name: "Crit damage",
        value: shown(bonus.critShare),
        tip: `Crit damage: ${gamePercent(critFactor(critChance, bonus.critShare) - 1)}`,
      },
    ]),
    heroGroup("Bonus Damage", [
      { name: "Physical", value: `${shown(bonus.physDmg)}%`, color: "#bcac94" },
      { name: "Fire", value: `${shown(bonus.fireDmg)}%`, color: "#e2582a" },
      { name: "Earth", value: `${shown(bonus.earthDmg)}%`, color: "#9a7434" },
      { name: "Poison", value: `${shown(bonus.poisonDmg)}%`, color: "#5fae3a" },
      { name: "Water", value: `${shown(bonus.waterDmg)}%`, color: "#3a7fd4" },
      { name: "Ice", value: `${shown(bonus.iceDmg)}%`, color: "#bfe6f5" },
    ]),
  ].filter((group) => group !== null);
  sheet.append(...groups);
  row.append(portrait, sheet);
  box.append(row);
  return box;
}

function equipmentBlock(weaponId: WeaponId, loadout: Loadout | null, sprites: Sprites | null): HTMLElement {
  const box = document.createElement("section");
  box.className = "dungeon-panel";
  box.append(heading("Equipment"));
  const row = document.createElement("div");
  row.className = "dungeon-character-row";
  const weaponInst = loadout ? instanceById(loadout, loadout.weapon) : null;
  const weapon = weaponInst?.kind === "weapon" ? weaponOf(weaponInst.catalogId) : weaponById(weaponId);
  const weaponSlot = slot(true);
  paintIcon(weaponSlot, sprites?.weapons[weaponInst?.kind === "weapon" ? weaponBaseId(weaponInst.catalogId) : weapon.id], weaponInst?.kind === "weapon" ? weaponInst.level : null);
  const version = weaponInst?.kind === "weapon" ? weaponVersion(weaponInst.catalogId) : undefined;
  const weaponStats = version && weaponInst
    ? statKeysOf(version.bonus).map((key) => formatStat(key, scaled(version.bonus[key], weaponInst.level))).join("\n")
    : "";
  bindTip(weaponSlot, weaponInst?.kind === "weapon" ? weaponName(weaponInst.catalogId) : weapon.name, [weapon.figure, weaponStats].filter((line) => line.length > 0).join("\n"));
  row.append(weaponSlot);
  for (let i = 0; i < EQUIPMENT_SLOTS; i += 1) {
    const wornId = loadout?.worn[i] ?? null;
    const wornInst = loadout ? instanceById(loadout, wornId) : null;
    const gear = wornInst?.kind === "gear" ? itemById(wornInst.catalogId) : undefined;
    const cell = slot(Boolean(gear), gear?.rarity);
    if (gear && wornInst) {
      paintIcon(cell, sprites?.items[gear.id], wornInst.level);
      bindTip(cell, gear.name, statKeysOf(gear).map((key) => formatStat(key, scaled(gear[key], wornInst.level))).join("\n"));
    } else emptyLabel(cell);
    row.append(cell);
  }
  box.append(row);
  return box;
}

function abilityBlock(loadout: Loadout | null, sprites: Sprites | null): HTMLElement {
  const box = document.createElement("section");
  box.className = "dungeon-panel";
  box.append(heading("Abilities"));
  const row = document.createElement("div");
  row.className = "dungeon-character-row";
  for (let i = 0; i < ABILITY_SLOTS; i += 1) {
    const wornId = loadout?.wornAbilities[i] ?? null;
    const wornInst = loadout ? instanceById(loadout, wornId) : null;
    const cell = slot(Boolean(wornInst));
    if (wornInst?.kind === "ability") {
      paintIcon(cell, sprites?.abilities[wornInst.catalogId], wornInst.level);
      const known = heroAbilityById(wornInst.catalogId);
      if (known) {
        bindAbilityTip(cell, () => abilityView(wornInst.catalogId, abilityAmount(wornInst), wornInst.level, abilitySplash(wornInst)));
      } else bindTip(cell, "Ability", "");
    } else emptyLabel(cell);
    row.append(cell);
  }
  box.append(row);
  return box;
}

function slot(filled: boolean, rarity?: Rarity): HTMLElement {
  const cell = document.createElement("div");
  cell.className = filled ? "dungeon-slot dungeon-slot-worn" : "dungeon-slot";
  if (rarity && rarity !== "common") cell.classList.add(`dungeon-rarity-${rarity}`);
  return cell;
}

function emptyLabel(cell: HTMLElement): void {
  cell.textContent = "Empty";
  cell.classList.add("dungeon-character-empty");
}

function paintIcon(cell: HTMLElement, art: HTMLCanvasElement | undefined, level: number | null): void {
  const canvas = document.createElement("canvas");
  canvas.width = 72;
  canvas.height = 72;
  canvas.className = "dungeon-character-icon";
  const ctx = canvas.getContext("2d");
  if (ctx && art) {
    const fit = (Math.min(canvas.width, canvas.height) - 8) / Math.max(art.width, art.height);
    const w = art.width * fit;
    const h = art.height * fit;
    ctx.drawImage(art, (canvas.width - w) / 2, (canvas.height - h) / 2, w, h);
  }
  if (level !== null && ctx) {
    ctx.fillStyle = "#f4f7fb";
    ctx.font = "700 12px Palatino Linotype, Palatino, serif";
    ctx.textAlign = "left";
    ctx.textBaseline = "top";
    ctx.fillText(String(level), 2, 2);
  }
  cell.append(canvas);
}

function heading(text: string): HTMLElement {
  const el = document.createElement("h2");
  el.textContent = text;
  el.className = "dungeon-heading";
  return el;
}

function resistTip(points: number): string {
  return `Resist: ${gamePercent(pointChance(points))}`;
}

function shown(value: number): string {
  return String(Math.round(value * 1e10) / 1e10);
}

function gamePercent(fraction: number): string {
  return `${Math.round(fraction * 1000) / 10}%`;
}

function heroGroup(title: string, rows: readonly { name: string; value: string; color?: string; tip?: string }[]): HTMLElement | null {
  if (rows.length === 0) return null;
  const group = document.createElement("section");
  group.className = "dungeon-hero-group";
  const label = document.createElement("h3");
  label.className = "dungeon-hero-group-title";
  label.textContent = title;
  group.append(label);
  for (const row of rows) {
    const line = document.createElement("div");
    line.className = "dungeon-hero-row";
    const key = document.createElement("span");
    key.textContent = row.name;
    if (row.color) key.style.color = row.color;
    const number = document.createElement("b");
    number.textContent = row.value;
    if (row.tip) bindStatTip(number, row.tip);
    line.append(key, number);
    group.append(line);
  }
  return group;
}

/** Курсор показывает сразу. Палец — пока число зажато. */
function bindStatTip(el: HTMLElement, text: string): void {
  el.classList.add("dungeon-stat-tip");
  let timer = 0;
  let open = false;
  const show = (event: PointerEvent): void => {
    const node = tipBox();
    node.replaceChildren();
    const body = document.createElement("div");
    body.textContent = text;
    body.style.color = "#f3e6c4";
    node.append(body);
    node.style.pointerEvents = "none";
    node.style.display = "block";
    moveTip(event);
    open = true;
  };
  const close = (): void => {
    window.clearTimeout(timer);
    timer = 0;
    if (!open) return;
    open = false;
    hideTip();
  };
  el.addEventListener("pointerenter", (event) => {
    if (event.pointerType === "touch") return;
    show(event);
  });
  el.addEventListener("pointermove", (event) => {
    if (open && event.pointerType !== "touch") moveTip(event);
  });
  el.addEventListener("pointerleave", () => {
    if (timer !== 0 || open) close();
  });
  el.addEventListener("pointerdown", (event) => {
    if (event.pointerType !== "touch") return;
    const originX = event.clientX;
    const originY = event.clientY;
    timer = window.setTimeout(() => show(event), 400);
    const move = (ev: PointerEvent): void => {
      if (Math.hypot(ev.clientX - originX, ev.clientY - originY) > 12) close();
    };
    const up = (): void => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
      close();
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
  });
}
