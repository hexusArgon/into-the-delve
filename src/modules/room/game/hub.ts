import { attrText, heroAttributes, type AttrId } from "../data/attributes.ts";
import {
  EQUIPMENT_SLOTS,
  GEAR,
  freshLoadout,
  gearBonus,
  itemById,
  EMPTY_GEAR,
  type GearBonus,
  type Loadout,
  type Rarity,
} from "../data/items.ts";
import { WEAPONS, weaponById, type WeaponDef, type WeaponId } from "../data/weapons.ts";
import { createHouse } from "./auction.ts";
import { paintAuction, type AuctionKit } from "./auction-view.ts";
import { paintGuild } from "./guild-view.ts";
import { RoomController } from "./controller.ts";
import { installDungeonMusic } from "./music.ts";
import { openSettings } from "./settings-view.ts";
import { BLINK_CHARGES, HERO_HP } from "./rules.ts";
import { HUB_COPY, tutorialMark, tutorialPending, type LessonStep } from "./tutorial.ts";
import { loadSprites } from "./sprites.ts";
import menuUrl from "../../../../assets/menu-depart.jpg";
import "./ui.css";

const spritesReady = loadSprites();

const SLOTS = 4;

/** Классическое меню: забег, инвентарь, аукцион. Оружие и слоты — окно инвентаря. */
export function mountGame(host: HTMLElement): { setRunning: (running: boolean) => void; destroy: () => void } {
  let room: RoomController | null = null;
  let wantRun = false;
  let alive = true;
  const kit: AuctionKit = { weapon: "sword", gold: 0, owned: WEAPONS.map((weapon) => weapon.id) };
  let level = 0;
  const loadout = freshLoadout();
  const house = createHouse();
  let lesson: "hub" | LessonStep | null = tutorialPending() ? "hub" : null;

  const endLesson = (): void => {
    tutorialMark();
    lesson = null;
    const current = room;
    room = null;
    current?.destroy();
    showMenu();
  };

  const openLesson = (step: LessonStep): void => {
    lesson = step;
    room?.destroy();
    room = new RoomController(host, showMenu, "sword", EMPTY_GEAR, {
      step,
      skip: endLesson,
      finish: endLesson,
      dead: (same) => openLesson(same),
    });
    if (import.meta.env.DEV) {
      (globalThis as typeof globalThis & { roomController?: RoomController }).roomController = room;
    }
    if (wantRun) room.setRunning(true);
  };

  const showMenu = (): void => {
    if (!alive) return;
    if (room && !room.isLesson) {
      kit.gold += room.carriedGold;
      level = Math.max(level, room.adventureLevel);
    }
    room?.destroy();
    room = null;
    hideTip();
    paintMenu(
      host,
      {
        onPlay: () => {
          if (lesson === "hub") openLesson("move");
          else showRoom();
        },
        onInventory: () => {
          void spritesReady.then((sprites) => {
            if (alive) paintInventory(host, kit, loadout, showMenu, sprites.gold, sprites.weapons);
          });
        },
        onAuction: () => paintAuction(host, kit, house, showMenu),
        onGuild: () => paintGuild(host, level, showMenu),
      },
      lesson === "hub" ? endLesson : undefined,
    );
  };

  const showRoom = (): void => {
    if (!alive) return;
    room = new RoomController(host, showMenu, kit.weapon, gearBonus(loadout.worn));
    if (import.meta.env.DEV) {
      (globalThis as typeof globalThis & { roomController?: RoomController }).roomController = room;
    }
    if (wantRun) room.setRunning(true);
  };

  showMenu();
  installDungeonMusic();

  return {
    setRunning(running: boolean) {
      wantRun = running;
      room?.setRunning(running);
    },
    destroy() {
      alive = false;
      room?.destroy();
      room = null;
    },
  };
}

function paintShell(host: HTMLElement): void {
  hideTip();
  host.replaceChildren();
  host.className = "dungeon";
  host.style.display = "flex";
  host.style.flexDirection = "column";
  host.style.height = "100%";
  host.style.overflow = "auto";
}

function paintMenu(
  host: HTMLElement,
  actions: { onPlay: () => void; onInventory: () => void; onAuction: () => void; onGuild: () => void },
  skipLesson?: () => void,
): void {
  paintShell(host);
  host.style.overflow = "hidden";
  const scene = document.createElement("div");
  scene.className = "dungeon-scene";
  const frame = document.createElement("div");
  frame.className = "dungeon-scene-frame";
  const picture = document.createElement("img");
  picture.src = menuUrl;
  picture.alt = "";
  const map = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  map.setAttribute("viewBox", "0 0 100 100");
  map.setAttribute("preserveAspectRatio", "none");
  map.classList.add("dungeon-hotmap");
  const quiet = (): void => {};
  const play = hotShape("В приключение", actions.onPlay, "70,0 71,8 76,30 76,50 76,65 78,78 87,95 93,99 100,99 100,40 100,0");
  if (skipLesson) play.classList.add("dungeon-shape-lesson");
  map.append(menuGlow(), 
    hotShape("Аукцион", skipLesson ? quiet : actions.onAuction, "8,1 6,10 5,20 4,32 6,48 6,64 27,66 28,74 31,78 36,78 46,77 50,70 50,48 48,25 45,18 42,12 38,4 22,0 8,1"),
    hotShape("Гильдия", skipLesson ? quiet : actions.onGuild, "47,4 45,16 45,32 48,42 48,66 49,74 51,76 68,77 76,66 79,50 79,16 73,5 60,0 47,4"),
    play,
    hotShape("Инвентарь", skipLesson ? quiet : actions.onInventory, "15,53 10,60 2,64 1,78 0,88 2,93 6,96 27,96 30,80 32,63 28,55 15,53"),
  );
  frame.append(
    picture,
    map,
    hotLabel("Аукцион", "38%", "62%"),
    hotLabel("Гильдия", "61%", "42%"),
    hotLabel("В приключение", "86%", "68%"),
    hotLabel("Инвентарь", "8%", "84%"),
  );
  scene.append(frame);
  const gear = document.createElement("button");
  gear.type = "button";
  gear.className = "dungeon-gear";
  gear.setAttribute("aria-label", "Настройки");
  gear.innerHTML =
    '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path fill="currentColor" d="M19.14 12.94c.04-.31.06-.63.06-.94s-.02-.63-.06-.94l2.03-1.58a.5.5 0 0 0 .12-.64l-1.92-3.32a.5.5 0 0 0-.6-.22l-2.39.96a7.1 7.1 0 0 0-1.63-.94l-.36-2.54a.5.5 0 0 0-.5-.42h-3.84a.5.5 0 0 0-.5.42l-.36 2.54c-.59.22-1.14.54-1.63.94l-2.39-.96a.5.5 0 0 0-.6.22L2.71 8.84a.5.5 0 0 0 .12.64l2.03 1.58c-.04.31-.06.63-.06.94s.02.63.06.94l-2.03 1.58a.5.5 0 0 0-.12.64l1.92 3.32c.13.22.39.31.6.22l2.39-.96c.49.4 1.04.72 1.63.94l.36 2.54c.05.24.26.42.5.42h3.84c.24 0 .45-.18.5-.42l.36-2.54c.59-.22 1.14-.54 1.63-.94l2.39.96c.22.09.47 0 .6-.22l1.92-3.32a.5.5 0 0 0-.12-.64l-2.03-1.58zM12 15.5A3.5 3.5 0 1 1 12 8.5a3.5 3.5 0 0 1 0 7z"/></svg>';
  gear.addEventListener("click", () => openSettings(scene));
  scene.append(gear);
  if (skipLesson) scene.append(lessonCard(HUB_COPY, skipLesson));
  host.append(scene);
}

function menuGlow(): SVGDefsElement {
  const ns = "http://www.w3.org/2000/svg";
  const defs = document.createElementNS(ns, "defs");
  const glow = document.createElementNS(ns, "radialGradient");
  glow.id = "menu-glow";
  glow.setAttribute("cx", "50%");
  glow.setAttribute("cy", "50%");
  glow.setAttribute("r", "46%");
  for (const stop of [
    ["0%", "#fff6e4", "0.9"],
    ["32%", "#ffe7c2", "0.28"],
    ["68%", "#ffe7c2", "0"],
    ["100%", "#ffe7c2", "0"],
  ] as const) {
    const node = document.createElementNS(ns, "stop");
    node.setAttribute("offset", stop[0]);
    node.setAttribute("stop-color", stop[1]);
    node.setAttribute("stop-opacity", stop[2]);
    glow.append(node);
  }
  const soft = document.createElementNS(ns, "filter");
  soft.id = "menu-soft";
  soft.setAttribute("x", "-40%");
  soft.setAttribute("y", "-40%");
  soft.setAttribute("width", "180%");
  soft.setAttribute("height", "180%");
  const blur = document.createElementNS(ns, "feGaussianBlur");
  blur.setAttribute("stdDeviation", "1.6");
  soft.append(blur);
  defs.append(glow, soft);
  return defs;
}

function lessonCard(text: string, skip: () => void): HTMLElement {
  const card = document.createElement("div");
  card.className = "dungeon-panel dungeon-lesson";
  const copy = document.createElement("p");
  copy.style.margin = "0";
  copy.textContent = text;
  const button = document.createElement("button");
  button.type = "button";
  button.className = "dungeon-button";
  button.style.padding = "8px 12px";
  button.style.alignSelf = "flex-start";
  button.textContent = "Пропустить";
  button.addEventListener("click", skip);
  card.append(copy, button);
  return card;
}

function hotShape(label: string, onClick: () => void, points: string): SVGPolygonElement {
  const poly = document.createElementNS("http://www.w3.org/2000/svg", "polygon");
  poly.setAttribute("points", points);
  poly.setAttribute("role", "button");
  poly.setAttribute("tabindex", "0");
  poly.setAttribute("aria-label", label);
  poly.classList.add("dungeon-shape");
  poly.addEventListener("click", onClick);
  poly.addEventListener("keydown", (event) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    onClick();
  });
  return poly;
}

function hotLabel(label: string, x: string, y: string): HTMLSpanElement {
  const text = document.createElement("span");
  text.className = "dungeon-hot-label";
  text.style.left = x;
  text.style.top = y;
  text.textContent = label;
  return text;
}

function paintInventory(
  host: HTMLElement,
  kit: AuctionKit,
  loadout: Loadout,
  onBack: () => void,
  gold: HTMLCanvasElement,
  weapons: Readonly<Partial<Record<WeaponId, HTMLCanvasElement>>>,
): void {
  paintShell(host);
  const page = document.createElement("div");
  page.style.maxWidth = "1080px";
  page.style.margin = "0 auto";
  page.style.padding = "36px 20px 48px";
  page.style.display = "flex";
  page.style.flexDirection = "column";
  page.style.gap = "18px";
  const note = document.createElement("div");
  note.style.minHeight = "1.2em";
  note.style.opacity = "0.85";
  const redraw = (): void => paintInventory(host, kit, loadout, onBack, gold, weapons);
  const columns = document.createElement("div");
  columns.className = "dungeon-columns";
  const left = document.createElement("div");
  left.className = "dungeon-stack";
  const right = document.createElement("div");
  right.className = "dungeon-stack";
  left.append(heroCard(gearBonus(loadout.worn)), equipmentRow(kit, loadout, weapons, note, redraw), slotRow(note));
  right.append(weaponCard(kit.weapon, weapons), gearBag(loadout, note, redraw), bankRow(kit, gold, weapons, redraw));
  columns.append(left, right);
  const back = menuButton("Назад", onBack, false);
  back.classList.add("dungeon-back");
  page.append(screenTitle("Инвентарь"), columns, note);
  host.append(back, page);
}

function screenTitle(text: string): HTMLElement {
  const title = document.createElement("h1");
  title.textContent = text;
  title.className = "dungeon-title";
  title.style.margin = "0";
  title.style.fontSize = "32px";
  return title;
}

function panel(): HTMLElement {
  const box = document.createElement("section");
  box.className = "dungeon-panel";
  return box;
}

function heading(text: string): HTMLElement {
  const el = document.createElement("h2");
  el.textContent = text;
  el.className = "dungeon-heading";
  el.style.margin = "0 0 12px";
  return el;
}

function weaponCard(id: WeaponId, weapons: Readonly<Partial<Record<WeaponId, HTMLCanvasElement>>>): HTMLElement {
  const weapon = weaponById(id);
  const box = panel();
  box.append(heading("Оружие"));
  const row = document.createElement("div");
  row.style.display = "flex";
  row.style.gap = "14px";
  row.style.alignItems = "center";
  const icon = document.createElement("canvas");
  icon.width = 96;
  icon.height = 96;
  icon.className = "dungeon-icon";
  icon.style.width = "96px";
  icon.style.height = "96px";
  const text = document.createElement("div");
  const name = document.createElement("div");
  name.textContent = weapon.name;
  name.style.fontSize = "20px";
  const figure = document.createElement("div");
  figure.textContent = weapon.figure;
  figure.style.opacity = "0.75";
  figure.style.marginTop = "4px";
  text.append(name, figure);
  row.append(icon, text);
  bindWeaponTip(icon, weapon);
  box.append(row);
  const ctx = icon.getContext("2d");
  const art = weapons[id];
  if (ctx && art) {
    const fit = Math.min(84 / art.width, 56 / art.height);
    const w = art.width * fit;
    const h = art.height * fit;
    ctx.drawImage(art, (96 - w) / 2, (96 - h) / 2, w, h);
  }
  return box;
}

function equipmentRow(
  kit: AuctionKit,
  loadout: Loadout,
  weapons: Readonly<Partial<Record<WeaponId, HTMLCanvasElement>>>,
  note: HTMLElement,
  redraw: () => void,
): HTMLElement {
  const box = panel();
  box.append(heading("Экипировка"));
  const row = document.createElement("div");
  row.style.display = "flex";
  row.style.gap = "10px";
  row.style.flexWrap = "wrap";
  const worn = weaponById(kit.weapon);
  const weaponSlot = document.createElement("button");
  weaponSlot.type = "button";
  weaponSlot.className = "dungeon-slot dungeon-slot-worn";
  weaponSlot.style.width = "108px";
  weaponSlot.style.height = "88px";
  weaponSlot.style.padding = "8px";
  weaponSlot.style.cursor = "pointer";
  const icon = document.createElement("canvas");
  icon.width = 72;
  icon.height = 72;
  icon.style.width = "72px";
  icon.style.height = "72px";
  weaponSlot.append(icon);
  paintWeaponIcon(icon, weapons[kit.weapon]);
  bindWeaponTip(weaponSlot, worn);
  weaponSlot.addEventListener("click", () => {
    note.textContent = `Надето: ${worn.name}.`;
  });
  row.append(weaponSlot);
  for (let i = 0; i < EQUIPMENT_SLOTS; i += 1) {
    const wornId = loadout.worn[i] ?? null;
    const wornItem = wornId ? itemById(wornId) : undefined;
    const slot = document.createElement("button");
    slot.type = "button";
    slot.textContent = wornItem?.name ?? "Пусто";
    slot.className = wornItem ? "dungeon-slot dungeon-slot-worn" : "dungeon-slot";
    slot.style.font = "inherit";
    slot.style.width = "108px";
    slot.style.height = "88px";
    slot.style.cursor = "pointer";
    slot.style.fontSize = "13px";
    slot.addEventListener("click", () => {
      if (!wornId) {
        note.textContent = "Слот пуст. Надень вещь из списка.";
        return;
      }
      loadout.worn[i] = null;
      loadout.bag.push(wornId);
      note.textContent = `${wornItem?.name ?? "Вещь"} снята.`;
      redraw();
    });
    bindTip(slot, wornItem?.name ?? "Экипировка", wornItem ? gearLine(wornItem) : "Пустой слот.");
    row.append(slot);
  }
  box.append(row);
  return box;
}

const RARITY_LABEL: Record<Rarity, string> = {
  common: "Обычные",
  uncommon: "Необычные",
  rare: "Редкие",
  epic: "Эпические",
};

function gearBag(loadout: Loadout, note: HTMLElement, redraw: () => void): HTMLElement {
  const box = panel();
  box.append(heading("Снаряжение"));
  const owned = new Set(loadout.bag);
  for (const rarity of ["common", "uncommon", "rare", "epic"] as const) {
    const items = GEAR.filter((item) => item.rarity === rarity && owned.has(item.id));
    if (items.length === 0) continue;
    const title = document.createElement("div");
    title.textContent = RARITY_LABEL[rarity];
    title.style.opacity = "0.6";
    title.style.fontSize = "12px";
    title.style.margin = "8px 0 6px";
    box.append(title);
    const row = document.createElement("div");
    row.style.display = "flex";
    row.style.flexWrap = "wrap";
    row.style.gap = "8px";
    for (const item of items) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "dungeon-slot";
      button.textContent = item.name;
      button.style.font = "inherit";
      button.style.width = "148px";
      button.style.height = "64px";
      button.style.cursor = "pointer";
      button.style.fontSize = "13px";
      bindTip(button, item.name, gearLine(item));
      button.addEventListener("click", () => {
        const slot = loadout.worn.findIndex((worn) => worn === null);
        if (slot < 0) {
          note.textContent = "Все шесть слотов заняты.";
          return;
        }
        loadout.worn[slot] = item.id;
        loadout.bag = loadout.bag.filter((id) => id !== item.id);
        note.textContent = `Надето: ${item.name}.`;
        redraw();
      });
      row.append(button);
    }
    box.append(row);
  }
  return box;
}

function gearLine(item: { name: string; maxHp?: number; weaponPower?: number; phys?: number; elem?: number; dodge?: number; critChance?: number; critShare?: number }): string {
  const parts: string[] = [];
  if (item.maxHp) parts.push(`MaxHP +${plain(item.maxHp)}`);
  if (item.weaponPower) parts.push(`Weapon Power +${plain(item.weaponPower)}`);
  if (item.phys) parts.push(`физ. ${plain(item.phys)}`);
  if (item.elem) parts.push(`стихии ${plain(item.elem)}`);
  if (item.dodge) parts.push(`уклонение ${percent(item.dodge)}`);
  if (item.critChance) parts.push(`крит шанс ${percent(item.critChance)}`);
  if (item.critShare) parts.push(`крит урон ${percent(item.critShare)}`);
  return parts.length > 0 ? parts.join(", ") : "Без атрибутов.";
}

function plain(value: number): string {
  return String(Math.round(value * 1e10) / 1e10);
}

function percent(value: number): string {
  return `${plain(value * 100)}%`;
}

function bankRow(
  kit: AuctionKit,
  gold: HTMLCanvasElement,
  weapons: Readonly<Partial<Record<WeaponId, HTMLCanvasElement>>>,
  redraw: () => void,
): HTMLElement {
  const box = panel();
  box.append(heading("Хранилище"));
  const lead = document.createElement("p");
  lead.textContent = "Предметы на базе. Надетое оружие лежит в экипировке.";
  lead.style.margin = "0 0 12px";
  lead.style.opacity = "0.7";
  const row = document.createElement("div");
  row.style.display = "grid";
  row.style.gridTemplateColumns = "repeat(6, 52px)";
  row.style.gap = "8px";
  const items: { name: string; text: string; count: number; paint: (ctx: CanvasRenderingContext2D) => void }[] = [];
  if (kit.gold > 0) {
    items.push({
      name: "Золото",
      text: "Монеты, принесённые из подземелья на базу.",
      count: kit.gold,
      paint: (ctx) => paintGoldIcon(ctx, gold),
    });
  }
  for (const weapon of WEAPONS) {
    if (!kit.owned.includes(weapon.id) || weapon.id === kit.weapon) continue;
    items.push({
      name: weapon.name,
      text: weapon.figure,
      count: 1,
      paint: (ctx) => {
        ctx.clearRect(0, 0, 44, 44);
        const art = weapons[weapon.id];
        if (!art) return;
        const fit = 36 / Math.max(art.width, art.height);
        const w = art.width * fit;
        const h = art.height * fit;
        ctx.drawImage(art, (44 - w) / 2, (44 - h) / 2, w, h);
      },
    });
  }
  const cells = 30;
  for (let i = 0; i < cells; i += 1) {
    const item = items[i];
    const slot = iconButton(() => {
      if (!item || item.name === "Золото") return;
      const weapon = WEAPONS.find((entry) => entry.name === item.name);
      if (!weapon) return;
      kit.weapon = weapon.id;
      redraw();
    }, false);
    if (item) {
      item.paint(slot.canvas.getContext("2d")!);
      if (item.count > 1) stampCount(slot.canvas, item.count);
      const weapon = WEAPONS.find((entry) => entry.name === item.name);
      if (weapon) bindWeaponTip(slot.button, weapon);
      else bindTip(slot.button, item.name, item.text);
    }
    row.append(slot.button);
  }
  box.append(lead, row);
  return box;
}

function iconButton(onClick: () => void, worn: boolean): { button: HTMLButtonElement; canvas: HTMLCanvasElement } {
  const button = document.createElement("button");
  button.type = "button";
  button.className = worn ? "dungeon-slot dungeon-slot-worn" : "dungeon-slot";
  button.style.width = "52px";
  button.style.height = "52px";
  button.style.padding = "4px";
  button.style.cursor = "pointer";
  const canvas = document.createElement("canvas");
  canvas.width = 44;
  canvas.height = 44;
  canvas.style.width = "44px";
  canvas.style.height = "44px";
  button.append(canvas);
  button.addEventListener("click", onClick);
  return { button, canvas };
}

function paintWeaponIcon(canvas: HTMLCanvasElement, art: HTMLCanvasElement | undefined): void {
  const ctx = canvas.getContext("2d");
  if (!ctx || !art) return;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  const fit = (Math.min(canvas.width, canvas.height) - 8) / Math.max(art.width, art.height);
  const w = art.width * fit;
  const h = art.height * fit;
  ctx.drawImage(art, (canvas.width - w) / 2, (canvas.height - h) / 2, w, h);
}

function paintGoldIcon(ctx: CanvasRenderingContext2D, gold: HTMLCanvasElement): void {
  const pad = 3;
  const side = 44 - pad * 2;
  const fit = side / Math.max(gold.width, gold.height);
  const w = gold.width * fit;
  const h = gold.height * fit;
  ctx.drawImage(gold, (44 - w) / 2, (44 - h) / 2, w, h);
}

function stampCount(canvas: HTMLCanvasElement, count: number): void {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.fillStyle = "#f4f7fb";
  ctx.font = "700 12px Palatino Linotype, Palatino, serif";
  ctx.textAlign = "right";
  ctx.textBaseline = "bottom";
  ctx.fillText(String(count), 42, 42);
}

let tip: HTMLElement | null = null;

function bindWeaponTip(el: HTMLElement, weapon: WeaponDef): void {
  el.style.cursor = "pointer";
  const show = (event: PointerEvent): void => {
    const node = tipBox();
    node.replaceChildren();
    const title = document.createElement("div");
    title.textContent = weapon.name;
    title.style.color = "#f4f7fb";
    title.style.fontWeight = "700";
    const diagram = document.createElement("canvas");
    const cell = 14;
    const gap = 3;
    diagram.width = 3 * cell + 2 * gap;
    diagram.height = 6 * cell + 5 * gap;
    diagram.style.display = "block";
    diagram.style.marginTop = "8px";
    paintStrike(diagram, weapon);
    const body = document.createElement("div");
    body.textContent = weapon.figure;
    body.style.marginTop = "6px";
    body.style.color = "#d4bc82";
    node.append(title, diagram, body);
    node.style.display = "block";
    moveTip(event);
  };
  el.addEventListener("pointerenter", show);
  el.addEventListener("pointermove", moveTip);
  el.addEventListener("pointerleave", hideTip);
}

/** Схема удара: герой смотрит вверх, подсвечены клетки попадания. */
function paintStrike(canvas: HTMLCanvasElement, weapon: WeaponDef): void {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const cell = 14;
  const gap = 3;
  const hero = { x: 1, y: 4 };
  const hit = new Set<string>();
  if (weapon.shape === "around") {
    for (let dy = -1; dy <= 1; dy += 1) {
      for (let dx = -1; dx <= 1; dx += 1) {
        if (dx === 0 && dy === 0) continue;
        hit.add(`${hero.x + dx},${hero.y + dy}`);
      }
    }
  } else if (weapon.shape === "fan") {
    for (const offset of [-1, 0, 1]) {
      for (let i = 1; i <= weapon.range; i += 1) hit.add(`${hero.x + offset},${hero.y - i}`);
    }
  } else {
    for (let i = 1; i <= weapon.range; i += 1) hit.add(`${hero.x},${hero.y - i}`);
  }
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  for (let y = 0; y < 6; y += 1) {
    for (let x = 0; x < 3; x += 1) {
      const px = x * (cell + gap);
      const py = y * (cell + gap);
      const isHero = x === hero.x && y === hero.y;
      const isHit = hit.has(`${x},${y}`);
      ctx.fillStyle = isHero ? "#d4bc82" : isHit ? "#8d5a32" : "#1a1612";
      ctx.fillRect(px, py, cell, cell);
      if (isHit && weapon.twice) {
        ctx.strokeStyle = "#f0e2c4";
        ctx.lineWidth = 2;
        ctx.strokeRect(px + 2, py + 2, cell - 4, cell - 4);
      }
    }
  }
}

function bindTip(el: HTMLElement, name: string, text: string): void {
  const show = (event: PointerEvent): void => {
    const node = tipBox();
    node.replaceChildren();
    const title = document.createElement("div");
    title.textContent = name;
    title.style.color = "#f4f7fb";
    title.style.fontWeight = "700";
    const body = document.createElement("div");
    body.textContent = text;
    body.style.marginTop = "4px";
    body.style.color = "#d4bc82";
    node.append(title, body);
    node.style.display = "block";
    moveTip(event);
  };
  el.addEventListener("pointerenter", show);
  el.addEventListener("pointermove", moveTip);
  el.addEventListener("pointerleave", hideTip);
}

function tipBox(): HTMLElement {
  if (tip) return tip;
  tip = document.createElement("div");
  tip.className = "dungeon-tip";
  tip.style.position = "fixed";
  tip.style.zIndex = "30";
  tip.style.display = "none";
  tip.style.maxWidth = "240px";
  tip.style.padding = "8px 10px";
  tip.style.pointerEvents = "none";
  tip.style.font = "14px Palatino Linotype, Palatino, serif";
  document.body.append(tip);
  return tip;
}

function moveTip(event: PointerEvent): void {
  const node = tipBox();
  const width = node.offsetWidth || 240;
  const height = node.offsetHeight || 80;
  const x = Math.min(Math.max(8, event.clientX + 14), window.innerWidth - width - 8);
  const y = Math.min(Math.max(8, event.clientY + 16), window.innerHeight - height - 8);
  node.style.left = `${x}px`;
  node.style.top = `${y}px`;
}

function hideTip(): void {
  if (tip) tip.style.display = "none";
}

function slotRow(note: HTMLElement): HTMLElement {
  const box = panel();
  box.append(heading("Способности"));
  const row = document.createElement("div");
  row.style.display = "flex";
  row.style.gap = "10px";
  row.style.flexWrap = "wrap";
  for (let i = 0; i < SLOTS; i += 1) {
    const slot = document.createElement("button");
    slot.type = "button";
    slot.textContent = "Пусто";
    slot.className = "dungeon-slot-empty";
    slot.style.font = "inherit";
    slot.style.width = "120px";
    slot.style.height = "88px";
    slot.style.cursor = "pointer";
    slot.addEventListener("click", () => {
      note.textContent = "Слот пустой. Сначала оружие, способности пока не надеваются.";
    });
    bindTip(slot, "Способность", "Пустой слот.");
    row.append(slot);
  }
  box.append(row);
  return box;
}

const HERO_STATS: readonly { label: string; id?: AttrId }[] = [
  { label: "MaxHP", id: "MaxHp" },
  { label: "MaxMP", id: "MaxMp" },
  { label: "Weapon Power", id: "WpATK" },
  { label: "Ability Power", id: "SkillDamage" },
  { label: "Сопротивление к физ. урону", id: "DEF" },
  { label: "Сопротивление прочим типам стихий" },
  { label: "Вероятность уклонения", id: "Dodge" },
  { label: "Крит шанс", id: "CritOdds" },
  { label: "Крит урон", id: "CritFactor" },
  { label: "Модификатор урона стихий" },
];

function heroCard(bonus: GearBonus): HTMLElement {
  const box = panel();
  box.append(heading("Герой"));
  const row = document.createElement("div");
  row.style.display = "flex";
  row.style.gap = "16px";
  row.style.alignItems = "flex-start";
  const portrait = document.createElement("canvas");
  portrait.width = 96;
  portrait.height = 96;
  portrait.className = "dungeon-icon";
  portrait.style.width = "96px";
  portrait.style.height = "96px";
  const list = document.createElement("div");
  list.style.display = "flex";
  list.style.flexDirection = "column";
  list.style.gap = "12px";
  list.style.flex = "1";
  const attrs = heroAttributes();
  const grid = document.createElement("div");
  grid.style.display = "grid";
  grid.style.gridTemplateColumns = "repeat(auto-fill, minmax(180px, 1fr))";
  grid.style.gap = "8px 16px";
  for (const stat of HERO_STATS) {
    const item = document.createElement("div");
    const name = document.createElement("div");
    name.textContent = stat.label;
    name.style.opacity = "0.6";
    name.style.fontSize = "12px";
    const number = document.createElement("div");
    number.textContent = heroStat(stat, attrs, bonus);
    item.append(name, number);
    grid.append(item);
  }
  list.append(grid);
  const blink = document.createElement("div");
  blink.textContent = `Blink ${BLINK_CHARGES}`;
  blink.style.opacity = "0.75";
  list.append(blink);
  row.append(portrait, list);
  box.append(row);
  void loadSprites().then((sprites) => {
    const ctx = portrait.getContext("2d");
    ctx?.drawImage(sprites.hero, 8, 4, 80, 88);
  });
  return box;
}

function heroStat(
  stat: { label: string; id?: AttrId },
  attrs: ReturnType<typeof heroAttributes>,
  bonus: GearBonus,
): string {
  if (stat.id === "MaxHp") return String(HERO_HP + bonus.maxHp);
  if (stat.id === "WpATK") return bonus.weaponPower > 0 ? plain(bonus.weaponPower) : "—";
  if (stat.id === "DEF") return plain(bonus.phys);
  if (stat.label.startsWith("Сопротивление прочим")) return bonus.elem > 0 ? plain(bonus.elem) : "—";
  if (stat.id === "Dodge") return bonus.dodge > 0 ? percent(bonus.dodge) : "—";
  if (stat.id === "CritOdds") return bonus.critChance > 0 ? percent(bonus.critChance) : "—";
  if (stat.id === "CritFactor") return bonus.critShare > 0 ? percent(bonus.critShare) : "—";
  return stat.id ? attrText(attrs, stat.id) : "—";
}

function menuButton(label: string, onClick: () => void, primary: boolean): HTMLButtonElement {
  const button = document.createElement("button");
  button.type = "button";
  button.textContent = label;
  button.className = primary ? "dungeon-button dungeon-button-primary" : "dungeon-button";
  button.style.fontSize = "18px";
  button.style.padding = "14px 22px";
  button.style.cursor = "pointer";
  button.addEventListener("click", onClick);
  return button;
}
