import { attrText, heroAttributes, type AttrId } from "../data/attributes.ts";
import {
  EQUIPMENT_SLOTS,
  itemById,
  EMPTY_GEAR,
  type GearBonus,
  type Rarity,
} from "../data/items.ts";
import { heroAbilityById, abilityTip, type RunAbility } from "../data/hero-abilities.ts";
import {
  abilityAmount,
  abilitySplash,
  addInstance,
  removeInstance,
  equippedWeaponHit,
  equippedWeaponId,
  freshLoadout,
  grantHeroAbilities,
  instanceById,
  pointChance,
  scaled,
  sharpen,
  unworn,
  wornGearBonus,
  type ItemInstance,
  type Loadout,
} from "../data/instances.ts";
import { WEAPONS, weaponById, type WeaponDef, type WeaponId } from "../data/weapons.ts";
import { createHouse } from "./auction.ts";
import { paintAuction, type AuctionKit } from "./auction-view.ts";
import { paintGuild } from "./guild-view.ts";
import { RoomController } from "./controller.ts";
import { installDungeonMusic } from "./music.ts";
import { openSettings } from "./settings-view.ts";
import { BLINK_CHARGES, HERO_HP } from "./rules.ts";
import { HUB_COPY, tutorialMark, tutorialPending, tutorialWeapon, WEAPON_KEY, type LessonStep } from "./tutorial.ts";
import { loadSprites } from "./sprites.ts";
import { freshShelf, shelfBar, shelfMatch, shelfOrder, type ShelfBar, type ShelfKind } from "./shelf-bar.ts";
import { bindTip, hideTip, moveTip, tipBox } from "./tip.ts";
import menuUrl from "../../../../assets/menu-depart.jpg";
import "./ui.css";

const spritesReady = loadSprites();

function wornAbilities(loadout: Loadout): (RunAbility | null)[] {
  return loadout.wornAbilities.map((id) => {
    const inst = instanceById(loadout, id);
    const row = inst?.kind === "ability" ? heroAbilityById(inst.catalogId) : undefined;
    if (!inst || !row) return null;
    return {
      id: row.id,
      name: row.name,
      cooldown: row.cooldown,
      damage: abilityAmount(inst),
      splash: abilitySplash(inst),
      mp: row.mp,
      cast: row.cast,
      playable: row.playable,
    };
  });
}

const SLOTS = 4;

/** Классическое меню: забег, инвентарь, аукцион. Weapons и слоты — окно инвентаря. */
export function mountGame(host: HTMLElement): { setRunning: (running: boolean) => void; destroy: () => void } {
  let room: RoomController | null = null;
  let wantRun = false;
  let alive = true;
  const startWeapon = tutorialWeapon();
  const kit: AuctionKit = { weapon: startWeapon, gold: 0, owned: [startWeapon] };
  let level = 0;
  const loadout = freshLoadout(startWeapon);
  grantHeroAbilities(loadout);
  const shelf = freshShelf();
  const hone = { target: null as string | null, copy: null as string | null, pick: null as "target" | "copy" | null, result: "" };
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

  const chooseWeapon = (id: WeaponId): void => {
    localStorage.setItem(WEAPON_KEY, id);
    const held = loadout.weapon;
    if (held) removeInstance(loadout, held);
    loadout.weapon = addInstance(loadout, "weapon", id).id;
    kit.weapon = id;
    kit.owned = [id];
    endLesson();
  };

  const openLesson = (step: LessonStep): void => {
    lesson = step;
    room?.destroy();
    room = new RoomController(host, showMenu, "sword", EMPTY_GEAR, {
      step,
      skip: endLesson,
      finish: chooseWeapon,
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
            if (alive) paintInventory(host, kit, loadout, shelf, hone, showMenu, sprites.gold, sprites.weapons, sprites.items, sprites.abilities);
          });
        },
        onAuction: () => {
          void spritesReady.then((sprites) => {
            if (alive) paintAuction(host, kit, loadout, house, showMenu, sprites);
          });
        },
        onGuild: () => paintGuild(host, level, showMenu),
      },
      lesson === "hub" ? endLesson : undefined,
    );
  };

  const showRoom = (): void => {
    if (!alive) return;
    room = new RoomController(
      host,
      showMenu,
      equippedWeaponId(loadout) ?? "sword",
      wornGearBonus(loadout),
      null,
      equippedWeaponHit(loadout),
      wornAbilities(loadout),
    );
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
  const play = hotShape("Adventure", actions.onPlay, "70,0 71,8 76,30 76,50 76,65 78,78 87,95 93,99 100,99 100,40 100,0");
  if (skipLesson) play.classList.add("dungeon-shape-lesson");
  map.append(menuGlow(), 
    hotShape("Auction", skipLesson ? quiet : actions.onAuction, "8,1 6,10 5,20 4,32 6,48 6,64 27,66 28,74 31,78 36,78 46,77 50,70 50,48 48,25 45,18 42,12 38,4 22,0 8,1"),
    hotShape("Guild", skipLesson ? quiet : actions.onGuild, "47,4 45,16 45,32 48,42 48,66 49,74 51,76 68,77 76,66 79,50 79,16 73,5 60,0 47,4"),
    play,
    hotShape("Inventory", skipLesson ? quiet : actions.onInventory, "15,53 10,60 2,64 1,78 0,88 2,93 6,96 27,96 30,80 32,63 28,55 15,53"),
  );
  frame.append(
    picture,
    map,
    hotLabel("Auction", "38%", "62%"),
    hotLabel("Guild", "61%", "42%"),
    hotLabel("Adventure", "86%", "68%"),
    hotLabel("Inventory", "8%", "84%"),
  );
  scene.append(frame);
  const gear = document.createElement("button");
  gear.type = "button";
  gear.className = "dungeon-gear";
  gear.setAttribute("aria-label", "Settings");
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
  button.textContent = "Skip";
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

interface Hone {
  target: string | null;
  copy: string | null;
  pick: "target" | "copy" | null;
  result: string;
}

function claim(loadout: Loadout, hone: Hone, id: string): boolean {
  if (!hone.pick) return false;
  const item = instanceById(loadout, id);
  if (!item) return false;
  if (hone.pick === "target") {
    if (hone.copy === id) hone.copy = null;
    hone.target = id;
    hone.result = "";
  } else if (id === hone.target) {
    hone.result = "The same piece cannot be picked twice.";
  } else {
    const target = instanceById(loadout, hone.target);
    if (!target || target.catalogId !== item.catalogId || target.kind !== item.kind) hone.result = "That is not a copy.";
    else {
      hone.copy = id;
      hone.result = "";
    }
  }
  hone.pick = null;
  return true;
}

function instanceName(item: ItemInstance): string {
  if (item.kind === "weapon") return weaponById(item.catalogId as WeaponId).name;
  if (item.kind === "gear") return itemById(item.catalogId)?.name ?? "Item";
  return heroAbilityName(item.catalogId);
}

function heroAbilityName(id: string): string {
  return heroAbilityById(id)?.name ?? "Ability";
}

function line(text: string): HTMLElement {
  const el = document.createElement("p");
  el.textContent = text;
  el.style.margin = "0";
  el.style.opacity = "0.8";
  return el;
}

function honePanel(kit: AuctionKit, loadout: Loadout, hone: Hone, note: HTMLElement, redraw: () => void): HTMLElement {
  const box = panel();
  box.append(heading("Sharpen"));
  const target = instanceById(loadout, hone.target);
  const copy = instanceById(loadout, hone.copy);
  const lines = document.createElement("div");
  lines.style.display = "flex";
  lines.style.flexDirection = "column";
  lines.style.gap = "6px";
  lines.append(
    line(`Target: ${target ? `${instanceName(target)}, level ${target.level}` : "none"}.`),
    line(`Copy: ${copy ? `${instanceName(copy)}, level ${copy.level}` : "none"}. The copy's level is not transferred.`),
    line("Failure destroys both the target and the copy."),
  );
  if (hone.result) lines.append(line(hone.result));
  const row = document.createElement("div");
  row.style.display = "flex";
  row.style.gap = "8px";
  row.style.flexWrap = "wrap";
  row.append(
    menuButton("Target", () => {
      hone.pick = "target";
      redraw();
    }, hone.pick === "target"),
    menuButton("Copy", () => {
      hone.pick = "copy";
      redraw();
    }, hone.pick === "copy"),
    menuButton("Sharpen", () => {
      if (!hone.target || !hone.copy) {
        hone.result = "Pick a target and a copy.";
        redraw();
        return;
      }
      const outcome = sharpen(loadout, hone.target, hone.copy, Math.random);
      hone.target = null;
      hone.copy = null;
      hone.pick = null;
      hone.result = outcome.ok
        ? outcome.success
          ? `Success. Level ${outcome.level}.`
          : "Failed. Target and copy are gone."
        : outcome.reason;
      note.textContent = hone.result;
      syncKit(kit, loadout);
      redraw();
    }, false),
  );
  box.append(lines, row);
  return box;
}

function syncKit(kit: AuctionKit, loadout: Loadout): void {
  kit.owned = loadout.items.filter((item) => item.kind === "weapon").map((item) => item.catalogId as WeaponId);
  const worn = equippedWeaponId(loadout);
  if (worn) kit.weapon = worn;
}

function paintInventory(
  host: HTMLElement,
  kit: AuctionKit,
  loadout: Loadout,
  shelf: ShelfBar,
  hone: Hone,
  onBack: () => void,
  gold: HTMLCanvasElement,
  weapons: Readonly<Partial<Record<WeaponId, HTMLCanvasElement>>>,
  items: Readonly<Record<string, HTMLCanvasElement>>,
  abilities: Readonly<Record<string, HTMLCanvasElement>>,
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
  const redraw = (): void => paintInventory(host, kit, loadout, shelf, hone, onBack, gold, weapons, items, abilities);
  const columns = document.createElement("div");
  columns.className = "dungeon-columns";
  const left = document.createElement("div");
  left.className = "dungeon-stack";
  const right = document.createElement("div");
  right.className = "dungeon-stack";
  left.append(heroCard(wornGearBonus(loadout)), equipmentRow(kit, loadout, hone, weapons, items, note, redraw), slotRow(loadout, hone, abilities, note, redraw));
  right.append(bankRow(kit, loadout, shelf, hone, gold, weapons, items, abilities, note, redraw), honePanel(kit, loadout, hone, note, redraw));
  columns.append(left, right);
  const back = menuButton("Back", onBack, false);
  back.classList.add("dungeon-back");
  page.append(screenTitle("Inventory"), columns, note);
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

function equipmentRow(
  kit: AuctionKit,
  loadout: Loadout,
  hone: Hone,
  weapons: Readonly<Partial<Record<WeaponId, HTMLCanvasElement>>>,
  items: Readonly<Record<string, HTMLCanvasElement>>,
  note: HTMLElement,
  redraw: () => void,
): HTMLElement {
  const box = panel();
  box.append(heading("Equipment"));
  const row = document.createElement("div");
  row.style.display = "flex";
  row.style.gap = "10px";
  row.style.flexWrap = "wrap";
  const weaponInst = instanceById(loadout, loadout.weapon);
  const worn = weaponInst?.kind === "weapon" ? weaponById(weaponInst.catalogId as WeaponId) : weaponById(kit.weapon);
  const weaponSlot = document.createElement("button");
  weaponSlot.type = "button";
  weaponSlot.className = weaponInst && (hone.target === weaponInst.id || hone.copy === weaponInst.id)
    ? "dungeon-slot dungeon-slot-worn"
    : "dungeon-slot dungeon-slot-worn";
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
  if (weaponInst) {
    paintWeaponIcon(icon, weapons[weaponInst.catalogId as WeaponId]);
    stampLevel(icon, weaponInst.level);
    bindWeaponTip(weaponSlot, worn);
    weaponSlot.addEventListener("click", () => {
      if (claim(loadout, hone, weaponInst.id)) redraw();
    });
  }
  row.append(weaponSlot);
  for (let i = 0; i < EQUIPMENT_SLOTS; i += 1) {
    const wornId = loadout.worn[i] ?? null;
    const wornInst = instanceById(loadout, wornId);
    const wornItem = wornInst?.kind === "gear" ? itemById(wornInst.catalogId) : undefined;
    const picked = wornInst && (hone.target === wornInst.id || hone.copy === wornInst.id);
    const slot = document.createElement("button");
    slot.type = "button";
    slot.className = wornItem ? `dungeon-slot dungeon-slot-worn${rarityClass(wornItem.rarity)}` : "dungeon-slot";
    slot.style.font = "inherit";
    slot.style.width = "88px";
    slot.style.height = "88px";
    slot.style.cursor = "pointer";
    slot.style.padding = "6px";
    if (wornItem) {
      const canvas = document.createElement("canvas");
      canvas.width = 72;
      canvas.height = 72;
      canvas.style.width = "72px";
      canvas.style.height = "72px";
      paintItemIcon(canvas, items[wornItem.id]);
      if (wornInst) stampLevel(canvas, wornInst.level);
      slot.append(canvas);
    } else {
      slot.textContent = "Empty";
      slot.style.fontSize = "13px";
    }
    slot.addEventListener("click", () => {
      if (!wornId || !wornInst) {
        note.textContent = "Empty slot. Equip an item from storage.";
        return;
      }
      if (claim(loadout, hone, wornInst.id)) {
        redraw();
        return;
      }
      loadout.worn[i] = null;
      note.textContent = `${wornItem?.name ?? "Item"} unequipped.`;
      redraw();
    });
    bindTip(slot, wornItem?.name ?? "Equipment", wornItem && wornInst ? gearLine(wornItem, wornInst.level) : "Empty slot.", rarityNameColor(wornItem?.rarity));
    row.append(slot);
  }
  box.append(row);
  return box;
}

function bankRow(
  kit: AuctionKit,
  loadout: Loadout,
  shelf: ShelfBar,
  hone: Hone,
  gold: HTMLCanvasElement,
  weapons: Readonly<Partial<Record<WeaponId, HTMLCanvasElement>>>,
  items: Readonly<Record<string, HTMLCanvasElement>>,
  abilities: Readonly<Record<string, HTMLCanvasElement>>,
  note: HTMLElement,
  redraw: () => void,
): HTMLElement {
  const box = panel();
  box.append(heading("Storage"), shelfBar(shelf, redraw));
  const lead = document.createElement("p");
  lead.textContent = "Gear and abilities sit here. Equipped pieces stay in the slots on the left.";
  lead.style.margin = "0 0 12px";
  lead.style.opacity = "0.7";
  const row = document.createElement("div");
  row.className = "dungeon-storage";
  type Cell =
    | { kind: "gold"; count: number }
    | { kind: "weapon" | "gear" | "ability"; id: string; catalogId: string; level: number };
  const stored: Cell[] = [];
  if (kit.gold > 0) stored.push({ kind: "gold", count: kit.gold });
  for (const item of unworn(loadout)) {
    stored.push({ kind: item.kind, id: item.id, catalogId: item.catalogId, level: item.level });
  }
  const visible = shelfOrder(
    stored.filter((item) => shelfMatch(item.kind, cellName(item), shelf)),
    shelf,
    cellName,
    (item) => (item.kind === "gear" ? itemById(item.catalogId)?.rarity : undefined),
  );
  const cells = Math.max(30, Math.ceil(visible.length / 6) * 6);
  for (let i = 0; i < cells; i += 1) {
    const item = visible[i];
    const slot = iconButton(() => {
      if (!item || item.kind === "gold") return;
      if (claim(loadout, hone, item.id)) {
        redraw();
        return;
      }
      if (item.kind === "weapon") {
        loadout.weapon = item.id;
        syncKit(kit, loadout);
        redraw();
        return;
      }
      if (item.kind === "gear") {
        const index = loadout.worn.findIndex((worn) => worn === null);
        if (index < 0) {
          note.textContent = "All six slots are full.";
          return;
        }
        loadout.worn[index] = item.id;
        redraw();
        return;
      }
      const index = loadout.wornAbilities.findIndex((worn) => worn === null);
      if (index < 0) {
        note.textContent = "All ability slots are full.";
        return;
      }
      loadout.wornAbilities[index] = item.id;
      redraw();
    }, item !== undefined && item.kind !== "gold" && (hone.target === item.id || hone.copy === item.id));
    if (item?.kind === "gold") {
      itemPaint(slot.canvas, (ctx) => paintGoldIcon(ctx, gold));
      if (item.count > 1) stampCount(slot.canvas, item.count);
      bindTip(slot.button, "Gold", "Coins carried out of the dungeon to the base.");
    } else if (item?.kind === "weapon") {
      const weapon = weaponById(item.catalogId as WeaponId);
      paintWeaponIcon(slot.canvas, weapons[item.catalogId as WeaponId]);
      stampLevel(slot.canvas, item.level);
      bindWeaponTip(slot.button, weapon);
    } else if (item?.kind === "gear") {
      const gear = itemById(item.catalogId);
      paintItemIcon(slot.canvas, items[item.catalogId]);
      stampLevel(slot.canvas, item.level);
      if (gear) slot.button.className += rarityClass(gear.rarity);
      bindTip(slot.button, gear?.name ?? "Item", gear ? gearLine(gear, item.level) : "", rarityNameColor(gear?.rarity));
    } else if (item?.kind === "ability") {
      paintItemIcon(slot.canvas, abilities[item.catalogId]);
      stampLevel(slot.canvas, item.level);
      const worn = instanceById(loadout, item.id);
      const tip = abilityTip(item.catalogId, worn ? abilityAmount(worn) : 0, item.level, worn ? abilitySplash(worn) : 0);
      bindTip(slot.button, tip.name, tip.text);
    }
    row.append(slot.button);
  }
  box.append(lead, row);
  return box;
}

function cellName(item: { kind: ShelfKind; catalogId?: string }): string {
  if (item.kind === "gold") return "Gold";
  if (item.kind === "weapon" && item.catalogId) return weaponById(item.catalogId as WeaponId).name;
  if (item.kind === "gear" && item.catalogId) return itemById(item.catalogId)?.name ?? "Item";
  if (item.kind === "ability" && item.catalogId) return heroAbilityName(item.catalogId);
  return "Ability";
}

function itemPaint(canvas: HTMLCanvasElement, paint: (ctx: CanvasRenderingContext2D) => void): void {
  const ctx = canvas.getContext("2d");
  if (ctx) paint(ctx);
}

function gearLine(item: { name: string; maxHp?: number; weaponPower?: number; phys?: number; elem?: number; dodge?: number; critChance?: number; critShare?: number }, level: number): string {
  const parts = [`Level ${level}`];
  const maxHp = scaled(item.maxHp, level);
  const weaponPower = scaled(item.weaponPower, level);
  const phys = scaled(item.phys, level);
  const elem = scaled(item.elem, level);
  const dodge = scaled(item.dodge, level);
  const critChance = scaled(item.critChance, level);
  const critShare = scaled(item.critShare, level);
  if (maxHp) parts.push(`MaxHP +${plain(maxHp)}`);
  if (weaponPower) parts.push(`Weapon Power +${plain(weaponPower)}`);
  if (phys) parts.push(`phys ${plain(phys)}`);
  if (elem) parts.push(`elem ${plain(elem)}`);
  if (dodge) parts.push(`dodge ${plain(dodge)}`);
  if (critChance) parts.push(`crit chance ${plain(critChance)}`);
  if (critShare) parts.push(`crit damage ${percent(critShare)}`);
  return parts.join(", ");
}

function plain(value: number): string {
  return String(Math.round(value * 1e10) / 1e10);
}

function percent(value: number): string {
  return `${plain(value * 100)}%`;
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

function paintItemIcon(canvas: HTMLCanvasElement, art: HTMLCanvasElement | undefined): void {
  const ctx = canvas.getContext("2d");
  if (!ctx || !art) return;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  const fit = Math.min(canvas.width, canvas.height) / Math.max(art.width, art.height);
  const w = art.width * fit;
  const h = art.height * fit;
  ctx.drawImage(art, (canvas.width - w) / 2, (canvas.height - h) / 2, w, h);
}

export function paintWeaponIcon(canvas: HTMLCanvasElement, art: HTMLCanvasElement | undefined): void {
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

function stampLevel(canvas: HTMLCanvasElement, level: number): void {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.fillStyle = "#f4f7fb";
  ctx.font = "700 12px Palatino Linotype, Palatino, serif";
  ctx.textAlign = "left";
  ctx.textBaseline = "top";
  ctx.fillText(String(level), 2, 2);
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

const RARITY_NAME: Partial<Record<Rarity, string>> = {
  uncommon: "#7dce88",
  rare: "#7eb6e8",
  epic: "#c48ae0",
};

function rarityClass(rarity: Rarity): string {
  if (rarity === "common") return "";
  return ` dungeon-rarity-${rarity}`;
}

function rarityNameColor(rarity: Rarity | undefined): string | undefined {
  return rarity ? RARITY_NAME[rarity] : undefined;
}

function slotRow(
  loadout: Loadout,
  hone: Hone,
  abilities: Readonly<Record<string, HTMLCanvasElement>>,
  note: HTMLElement,
  redraw: () => void,
): HTMLElement {
  const box = panel();
  box.append(heading("Abilities"));
  const row = document.createElement("div");
  row.style.display = "flex";
  row.style.gap = "10px";
  row.style.flexWrap = "wrap";
  for (let i = 0; i < SLOTS; i += 1) {
    const wornId = loadout.wornAbilities[i] ?? null;
    const wornInst = instanceById(loadout, wornId);
    const slot = document.createElement("button");
    slot.type = "button";
    slot.className = wornInst ? "dungeon-slot dungeon-slot-worn" : "dungeon-slot-empty";
    slot.style.font = "inherit";
    slot.style.width = "88px";
    slot.style.height = "88px";
    slot.style.cursor = "pointer";
    slot.style.padding = "6px";
    if (wornInst) {
      const canvas = document.createElement("canvas");
      canvas.width = 72;
      canvas.height = 72;
      canvas.style.width = "72px";
      canvas.style.height = "72px";
      paintItemIcon(canvas, abilities[wornInst.catalogId]);
      stampLevel(canvas, wornInst.level);
      slot.append(canvas);
      const tip = abilityTip(wornInst.catalogId, abilityAmount(wornInst), wornInst.level, abilitySplash(wornInst));
      bindTip(slot, tip.name, tip.text);
    } else {
      slot.textContent = "Empty";
      slot.style.fontSize = "13px";
      bindTip(slot, "Ability", "Empty slot.");
    }
    slot.addEventListener("click", () => {
      if (!wornInst) {
        note.textContent = "Empty slot. Take an ability from storage.";
        return;
      }
      if (claim(loadout, hone, wornInst.id)) {
        redraw();
        return;
      }
      loadout.wornAbilities[i] = null;
      note.textContent = "Ability unequipped.";
      redraw();
    });
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
  { label: "Physical resistance", id: "DEF" },
  { label: "Elemental resistance" },
  { label: "Dodge chance", id: "Dodge" },
  { label: "Crit chance", id: "CritOdds" },
  { label: "Crit damage", id: "CritFactor" },
  { label: "Elemental damage modifier" },
];

function heroCard(bonus: GearBonus): HTMLElement {
  const box = panel();
  box.append(heading("Hero"));
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
  if (stat.label.startsWith("Elemental resistance")) return bonus.elem > 0 ? plain(bonus.elem) : "—";
  if (stat.id === "Dodge") return bonus.dodge > 0 ? percent(pointChance(bonus.dodge)) : "—";
  if (stat.id === "CritOdds") return bonus.critChance > 0 ? percent(pointChance(bonus.critChance)) : "—";
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
