import { attrText, heroAttributes } from "../data/attributes.ts";
import {
  EQUIPMENT_SLOTS,
  itemById,
  EMPTY_GEAR,
  type GearBonus,
  type GearItem,
  type Rarity,
} from "../data/items.ts";
import { heroAbilityById, abilityView, type RunAbility } from "../data/hero-abilities.ts";
import {
  abilityAmount,
  abilitySplash,
  addInstance,
  removeInstance,
  equippedWeaponHit,
  equippedWeaponId,
  fillEmptyWear,
  grantHeroAbilities,
  saveLoadout,
  storedLoadout,
  instanceById,
  placeInstance,
  pointChance,
  scaled,
  sharpen,
  unworn,
  wornGearBonus,
  type ItemInstance,
  type Loadout,
} from "../data/instances.ts";
import { WEAPONS, weaponById, type WeaponDef, type WeaponId } from "../data/weapons.ts";
import { createHouse, stockHouse } from "./auction.ts";
import { paintAuction, type AuctionKit } from "./auction-view.ts";
import { paintGuild } from "./guild-view.ts";
import { paintAdventure } from "./adventure-view.ts";
import { bestAdventure, recordAdventure } from "./adventure.ts";
import { loadBoard, openCloud } from "./cloud.ts";
import { grantPersonalGear, keepPersonalGear } from "./personal-gear.ts";
import { storageLayout, storageScroll } from "./storage.ts";
import { RoomController } from "./controller.ts";
import { installDungeonMusic } from "./music.ts";
import { openSettings } from "./settings-view.ts";
import { HERO_HP } from "./rules.ts";
import { coarsePointer, hubCopy, tutorialMark, tutorialPending, tutorialWeapon, WEAPON_KEY, type LessonStep } from "./tutorial.ts";
import { loadSprites } from "./sprites.ts";
import { freshShelf, shelfBar, shelfMatch, shelfOrder, type ShelfBar, type ShelfKind } from "./shelf-bar.ts";
import { bindAbilityTip, bindCardTip, bindTip, hideTip } from "./tip.ts";
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
  const loadout = storedLoadout(startWeapon);
  grantHeroAbilities(loadout);
  grantPersonalGear(loadout);
  if (coarsePointer()) fillEmptyWear(loadout);
  syncKit(kit, loadout);
  saveLoadout(loadout);
  void openCloud(loadout, startWeapon).then(() => {
    if (!alive) return;
    keepPersonalGear(loadout);
    grantHeroAbilities(loadout);
    if (coarsePointer()) fillEmptyWear(loadout);
    syncKit(kit, loadout);
    saveLoadout(loadout);
  });
  const shelf = freshShelf();
  const hone = { target: null as string | null, copy: null as string | null, made: null as string | null, result: "" };
  const house = createHouse();
  stockHouse(house, Date.now());
  if (import.meta.env.DEV) {
    (globalThis as typeof globalThis & { dungeonKit?: AuctionKit }).dungeonKit = kit;
  }
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
    saveLoadout(loadout);
    endLesson();
  };

  const openLesson = (step: LessonStep): void => {
    keepRun();
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

  const keepRun = (): void => {
    if (!room || room.isLesson) return;
    kit.gold += room.carriedGold;
    for (const drop of room.spoils) addInstance(loadout, drop.kind, drop.catalogId);
    syncKit(kit, loadout);
    if (room.floorCleared) recordAdventure(room.pickedLevel);
    saveLoadout(loadout);
  };

  const showMenu = (): void => {
    if (!alive) return;
    keepRun();
    room?.destroy();
    room = null;
    hideTip();
    paintMenu(
      host,
      {
        onPlay: () => {
          if (lesson === "hub") openLesson("move");
          else paintAdventure(host, bestAdventure(), (picked) => showRoom(picked), showMenu);
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
        onGuild: () => {
          paintGuild(host, [], showMenu, "Loading the board.");
          void loadBoard().then(({ rows, online }) => {
            if (!alive) return;
            if (rows.length > 0) {
              paintGuild(host, rows, showMenu);
              return;
            }
            if (online) {
              paintGuild(host, [], showMenu);
              return;
            }
            const best = bestAdventure();
            const shown = best === null ? [] : [{ rank: 1, name: "You", level: best, you: true }];
            paintGuild(host, shown, showMenu, "Showing this browser until the server answers.");
          });
        },
        onTutorial: () => openLesson("move"),
      },
      lesson === "hub" ? endLesson : undefined,
    );
  };

  const showRoom = (picked = 0): void => {
    if (!alive) return;
    room = new RoomController(
      host,
      showMenu,
      equippedWeaponId(loadout) ?? "sword",
      wornGearBonus(loadout),
      null,
      equippedWeaponHit(loadout),
      wornAbilities(loadout),
      picked,
      () => openLesson("move"),
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
  actions: { onPlay: () => void; onInventory: () => void; onAuction: () => void; onGuild: () => void; onTutorial: () => void },
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
  const play = hotShape("Delve", actions.onPlay, "70,0 71,8 76,30 76,50 76,65 78,78 87,95 93,99 100,99 100,40 100,0");
  map.append(menuGlow(),
    ...(skipLesson ? [lessonGlow(play)] : []), 
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
    hotLabel("Delve", "86%", "68%"),
    hotLabel("Inventory", "8%", "84%"),
  );
  scene.append(frame);
  const gear = document.createElement("button");
  gear.type = "button";
  gear.className = "dungeon-gear";
  gear.setAttribute("aria-label", "Settings");
  gear.innerHTML =
    '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path fill="currentColor" d="M19.14 12.94c.04-.31.06-.63.06-.94s-.02-.63-.06-.94l2.03-1.58a.5.5 0 0 0 .12-.64l-1.92-3.32a.5.5 0 0 0-.6-.22l-2.39.96a7.1 7.1 0 0 0-1.63-.94l-.36-2.54a.5.5 0 0 0-.5-.42h-3.84a.5.5 0 0 0-.5.42l-.36 2.54c-.59.22-1.14.54-1.63.94l-2.39-.96a.5.5 0 0 0-.6.22L2.71 8.84a.5.5 0 0 0 .12.64l2.03 1.58c-.04.31-.06.63-.06.94s.02.63.06.94l-2.03 1.58a.5.5 0 0 0-.12.64l1.92 3.32c.13.22.39.31.6.22l2.39-.96c.49.4 1.04.72 1.63.94l.36 2.54c.05.24.26.42.5.42h3.84c.24 0 .45-.18.5-.42l.36-2.54c.59-.22 1.14-.54 1.63-.94l2.39.96c.22.09.47 0 .6-.22l1.92-3.32a.5.5 0 0 0-.12-.64l-2.03-1.58zM12 15.5A3.5 3.5 0 1 1 12 8.5a3.5 3.5 0 0 1 0 7z"/></svg>';
  gear.addEventListener("click", () => openSettings(scene, actions.onTutorial));
  scene.append(gear);
  if (skipLesson) scene.append(lessonCard(hubCopy(coarsePointer()), skipLesson));
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
  button.style.padding = "calc(8 * var(--hud)) calc(12 * var(--hud))";
  button.style.alignSelf = "flex-start";
  button.textContent = "Skip";
  button.addEventListener("click", skip);
  card.append(copy, button);
  return card;
}

/** Подсветка тропы урока. Заливка — атрибут SVG, не CSS: на проде стили лежат на другом домене и url(#…) туда не доходит. */
function lessonGlow(play: SVGPolygonElement): SVGPolygonElement {
  const glow = document.createElementNS("http://www.w3.org/2000/svg", "polygon");
  glow.setAttribute("points", play.getAttribute("points") ?? "");
  glow.setAttribute("fill", "url(#menu-glow)");
  glow.setAttribute("filter", "url(#menu-soft)");
  glow.setAttribute("pointer-events", "none");
  glow.style.mixBlendMode = "screen";
  return glow;
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
  /** Экземпляр, который остался после удачной заточки. */
  made: string | null;
  result: string;
}

type HoneSlot = "target" | "copy";

let dragMoved = false;
let carryNote = "";
let honeDrop: ((slot: HoneSlot, id: string) => void) | null = null;
let placeDrop: ((id: string, hit: HTMLElement) => void) | null = null;
let dragGhost: HTMLElement | null = null;

function flashNote(text: string): void {
  carryNote = text;
}

function dragTarget(x: number, y: number): HTMLElement | null {
  return document.elementFromPoint(x, y)?.closest<HTMLElement>("[data-hone], [data-drop]") ?? null;
}

function dragAccepts(hit: HTMLElement, kind: ItemInstance["kind"]): boolean {
  const hone = hit.dataset.hone;
  if (hone === "target" || hone === "copy") return true;
  const drop = hit.dataset.drop;
  return drop === "storage" || drop === kind;
}

function placeHone(loadout: Loadout, hone: Hone, slot: HoneSlot, id: string): void {
  const item = instanceById(loadout, id);
  if (!item) return;
  hone.made = null;
  if (slot === "target") {
    if (hone.copy === id) {
      hone.result = "The same piece cannot be picked twice.";
      return;
    }
    hone.target = id;
    const copy = instanceById(loadout, hone.copy);
    if (copy && (copy.catalogId !== item.catalogId || copy.kind !== item.kind)) hone.copy = null;
    hone.result = "";
    return;
  }
  if (id === hone.target) {
    hone.result = "The same piece cannot be picked twice.";
    return;
  }
  const target = instanceById(loadout, hone.target);
  if (target && (target.catalogId !== item.catalogId || target.kind !== item.kind)) {
    hone.result = "That is not a copy.";
    return;
  }
  hone.copy = id;
  hone.result = "";
}

function armDrag(el: HTMLElement, id: string, kind: ItemInstance["kind"]): void {
  el.style.cursor = "grab";
  el.addEventListener("pointerdown", (event) => {
    if (event.button !== 0) return;
    const sx = event.clientX;
    const sy = event.clientY;
    let moving = false;
    const move = (ev: PointerEvent): void => {
      if (!moving && Math.hypot(ev.clientX - sx, ev.clientY - sy) < 8) return;
      if (!moving) {
        moving = true;
        dragMoved = true;
        const canvas = el.querySelector("canvas");
        dragGhost = document.createElement("div");
        dragGhost.className = "dungeon-drag-ghost";
        if (canvas instanceof HTMLCanvasElement) dragGhost.append(cloneCanvas(canvas));
        document.body.append(dragGhost);
      }
      if (dragGhost) {
        dragGhost.style.left = `${ev.clientX}px`;
        dragGhost.style.top = `${ev.clientY}px`;
      }
      const hit = dragTarget(ev.clientX, ev.clientY);
      document.querySelectorAll(".is-over").forEach((node) => node.classList.remove("is-over"));
      if (hit && dragAccepts(hit, kind)) hit.classList.add("is-over");
    };
    const up = (ev: PointerEvent): void => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      document.querySelectorAll(".is-over").forEach((node) => node.classList.remove("is-over"));
      const hit = moving ? dragTarget(ev.clientX, ev.clientY) : null;
      const role = hit?.dataset.hone;
      dragGhost?.remove();
      dragGhost = null;
      if (hit && (role === "target" || role === "copy")) honeDrop?.(role, id);
      else if (hit?.dataset.drop) placeDrop?.(id, hit);
      window.setTimeout(() => {
        dragMoved = false;
      }, 0);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  });
}

function cloneCanvas(source: HTMLCanvasElement): HTMLCanvasElement {
  const copy = document.createElement("canvas");
  copy.width = source.width;
  copy.height = source.height;
  copy.style.width = source.style.width || `${source.width}px`;
  copy.style.height = source.style.height || `${source.height}px`;
  copy.getContext("2d")?.drawImage(source, 0, 0);
  return copy;
}

function heroAbilityName(id: string): string {
  return heroAbilityById(id)?.name ?? "Ability";
}

function honePanel(
  kit: AuctionKit,
  loadout: Loadout,
  hone: Hone,
  weapons: Readonly<Partial<Record<WeaponId, HTMLCanvasElement>>>,
  items: Readonly<Record<string, HTMLCanvasElement>>,
  abilities: Readonly<Record<string, HTMLCanvasElement>>,
  redraw: () => void,
): HTMLElement {
  const box = panel();
  box.append(heading("Sharpen"));
  const row = document.createElement("div");
  row.className = "dungeon-hone";
  row.append(
    honeCell("target", "Item", instanceById(loadout, hone.target), weapons, items, abilities),
    honeCell("copy", "Copy", instanceById(loadout, hone.copy), weapons, items, abilities),
    honeCell("made", "Result", instanceById(loadout, hone.made), weapons, items, abilities),
  );
  const button = menuButton("Sharpen", () => {
    if (!hone.target || !hone.copy) {
      hone.result = "Drag an item and a copy into the slots.";
      redraw();
      return;
    }
    const kept = hone.target;
    const outcome = sharpen(loadout, hone.target, hone.copy, Math.random);
    if (!outcome.ok) {
      hone.result = outcome.reason;
      redraw();
      return;
    }
    hone.target = null;
    hone.copy = null;
    if (outcome.success) {
      hone.made = kept;
      hone.result = `Success. Level ${outcome.level}.`;
    } else {
      hone.made = null;
      hone.result = "Failed. Target and copy are gone.";
    }
    syncKit(kit, loadout);
    redraw();
  }, false);
  button.classList.add("dungeon-hone-act");
  box.append(row, button);
  return box;
}

function honeCell(
  role: "target" | "copy" | "made",
  label: string,
  item: ItemInstance | null | undefined,
  weapons: Readonly<Partial<Record<WeaponId, HTMLCanvasElement>>>,
  items: Readonly<Record<string, HTMLCanvasElement>>,
  abilities: Readonly<Record<string, HTMLCanvasElement>>,
): HTMLElement {
  const wrap = document.createElement("div");
  wrap.className = "dungeon-hone-cell";
  const slot = document.createElement("div");
  slot.dataset.hone = role;
  slot.className = item ? "dungeon-slot dungeon-hone-slot" : "dungeon-slot dungeon-slot-empty dungeon-hone-slot";
  if (item?.kind === "gear") {
    const gear = itemById(item.catalogId);
    if (gear) slot.className += rarityClass(gear.rarity);
  }
  if (item) {
    const canvas = document.createElement("canvas");
    canvas.width = 72;
    canvas.height = 72;
    canvas.style.width = "calc(72 * var(--hud))";
    canvas.style.height = "calc(72 * var(--hud))";
    paintInstanceIcon(canvas, item, weapons, items, abilities);
    stampLevel(canvas, item.level);
    slot.append(canvas);
    if (item.kind === "weapon") bindWeaponTip(slot, weaponById(item.catalogId as WeaponId));
    else if (item.kind === "gear") {
      const gear = itemById(item.catalogId);
      if (gear) bindGearTip(slot, gear, item.level);
      else bindTip(slot, "Item", "");
    } else {
      bindAbilityTip(slot, () => abilityView(item.catalogId, abilityAmount(item), item.level, abilitySplash(item)));
    }
  }
  const caption = document.createElement("span");
  caption.className = "dungeon-hone-label";
  caption.textContent = label;
  wrap.append(slot, caption);
  return wrap;
}

function paintInstanceIcon(
  canvas: HTMLCanvasElement,
  item: ItemInstance,
  weapons: Readonly<Partial<Record<WeaponId, HTMLCanvasElement>>>,
  items: Readonly<Record<string, HTMLCanvasElement>>,
  abilities: Readonly<Record<string, HTMLCanvasElement>>,
): void {
  if (item.kind === "weapon") paintWeaponIcon(canvas, weapons[item.catalogId as WeaponId]);
  else if (item.kind === "gear") paintItemIcon(canvas, items[item.catalogId]);
  else paintItemIcon(canvas, abilities[item.catalogId]);
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
  host.style.overflow = "auto";
  const page = document.createElement("div");
  page.className = "dungeon-inventory";
  const note = document.createElement("div");
  note.style.minHeight = "1.2em";
  note.style.opacity = "0.85";
  const redraw = (): void => {
    saveLoadout(loadout);
    paintInventory(host, kit, loadout, shelf, hone, onBack, gold, weapons, items, abilities);
  };
  honeDrop = (slot, id) => {
    placeHone(loadout, hone, slot, id);
    redraw();
  };
  placeDrop = (id, hit) => {
    const drop = hit.dataset.drop;
    if (drop !== "weapon" && drop !== "gear" && drop !== "ability" && drop !== "storage") return;
    const index = Number(hit.dataset.slot ?? "0");
    const result = drop === "storage"
      ? placeInstance(loadout, id, "storage")
      : drop === "weapon"
        ? placeInstance(loadout, id, { kind: "weapon" })
        : placeInstance(loadout, id, { kind: drop, index });
    if (result === "fit") flashNote("That does not fit this slot.");
    else if (result === "ok") flashNote(drop === "storage" ? "Unequipped." : "Equipped.");
    else return;
    syncKit(kit, loadout);
    redraw();
  };
  const columns = document.createElement("div");
  columns.className = "dungeon-inventory-board";
  const heroCol = document.createElement("div");
  heroCol.className = "dungeon-stack";
  const gearCol = document.createElement("div");
  gearCol.className = "dungeon-stack";
  const storeCol = document.createElement("div");
  storeCol.className = "dungeon-stack dungeon-inventory-side";
  heroCol.append(heroCard(wornGearBonus(loadout)));
  gearCol.append(equipmentRow(kit, loadout, hone, weapons, items, redraw), slotRow(loadout, abilities, redraw));
  storeCol.append(bankRow(kit, loadout, shelf, hone, gold, weapons, items, abilities, redraw), honePanel(kit, loadout, hone, weapons, items, abilities, redraw));
  columns.append(heroCol, gearCol, storeCol);
  const back = menuButton("Back", onBack, false);
  back.classList.add("dungeon-back");
  if (hone.result) note.textContent = hone.result;
  else if (carryNote) note.textContent = carryNote;
  carryNote = "";
  page.append(screenTitle("Inventory"), columns, note);
  host.append(back, page);
}

function screenTitle(text: string): HTMLElement {
  const title = document.createElement("h1");
  title.textContent = text;
  title.className = "dungeon-title";
  title.style.margin = "0";
  title.style.fontSize = "calc(32 * var(--hud))";
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
  el.style.margin = "0 0 calc(12 * var(--hud))";
  return el;
}

function equipmentRow(
  kit: AuctionKit,
  loadout: Loadout,
  hone: Hone,
  weapons: Readonly<Partial<Record<WeaponId, HTMLCanvasElement>>>,
  items: Readonly<Record<string, HTMLCanvasElement>>,
  redraw: () => void,
): HTMLElement {
  const box = panel();
  box.append(heading("Equipment"));
  const row = document.createElement("div");
  row.style.display = "flex";
  row.style.gap = "calc(10 * var(--hud))";
  row.style.flexWrap = "wrap";
  const weaponInst = instanceById(loadout, loadout.weapon);
  const worn = weaponInst?.kind === "weapon" ? weaponById(weaponInst.catalogId as WeaponId) : weaponById(kit.weapon);
  const weaponSlot = document.createElement("button");
  weaponSlot.type = "button";
  weaponSlot.className = weaponInst && (hone.target === weaponInst.id || hone.copy === weaponInst.id)
    ? "dungeon-slot dungeon-slot-worn"
    : "dungeon-slot dungeon-slot-worn";
  weaponSlot.style.width = "calc(108 * var(--hud))";
  weaponSlot.style.height = "calc(88 * var(--hud))";
  weaponSlot.style.padding = "calc(8 * var(--hud))";
  weaponSlot.dataset.drop = "weapon";
  weaponSlot.style.cursor = "pointer";
  const icon = document.createElement("canvas");
  icon.width = 72;
  icon.height = 72;
  icon.style.width = "calc(72 * var(--hud))";
  icon.style.height = "calc(72 * var(--hud))";
  weaponSlot.append(icon);
  if (weaponInst) {
    paintWeaponIcon(icon, weapons[weaponInst.catalogId as WeaponId]);
    stampLevel(icon, weaponInst.level);
    bindWeaponTip(weaponSlot, worn);
    armDrag(weaponSlot, weaponInst.id, "weapon");
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
    slot.dataset.drop = "gear";
    slot.dataset.slot = String(i);
    slot.style.font = "inherit";
    slot.style.width = "calc(88 * var(--hud))";
    slot.style.height = "calc(88 * var(--hud))";
    slot.style.cursor = "pointer";
    slot.style.padding = "calc(6 * var(--hud))";
    if (wornItem) {
      const canvas = document.createElement("canvas");
      canvas.width = 72;
      canvas.height = 72;
      canvas.style.width = "calc(72 * var(--hud))";
      canvas.style.height = "calc(72 * var(--hud))";
      paintItemIcon(canvas, items[wornItem.id]);
      if (wornInst) stampLevel(canvas, wornInst.level);
      slot.append(canvas);
    } else {
      slot.textContent = "Empty";
      slot.style.fontSize = "calc(13 * var(--hud))";
    }
    slot.addEventListener("click", () => {
      if (dragMoved) return;
      if (!wornId || !wornInst) {
        flashNote("Empty slot. Equip an item from storage.");
        redraw();
        return;
      }
      loadout.worn[i] = null;
      flashNote(`${wornItem?.name ?? "Item"} unequipped.`);
      redraw();
    });
    if (wornItem && wornInst) bindGearTip(slot, wornItem, wornInst.level);
    else bindTip(slot, "Equipment", "Empty slot.");
    if (wornInst) armDrag(slot, wornInst.id, "gear");
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
  redraw: () => void,
): HTMLElement {
  const box = panel();
  box.classList.add("dungeon-bank");
  box.append(heading("Storage"), shelfBar(shelf, redraw));
  const lead = document.createElement("p");
  lead.textContent = "Gear and abilities sit here. Equipped pieces stay in the slots on the left.";
  lead.style.margin = "0 0 calc(12 * var(--hud))";
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
  const layout = storageLayout(stored.length);
  const frame = storageScroll(stored.length);
  frame.style.maxHeight = "none";
  frame.style.flex = "1";
  frame.style.minHeight = "0";
  const cells = layout.cells;
  for (let i = 0; i < cells; i += 1) {
    const item = visible[i];
    const slot = iconButton(() => {
      if (dragMoved) return;
      if (!item || item.kind === "gold") return;
      if (item.kind === "weapon") {
        loadout.weapon = item.id;
        syncKit(kit, loadout);
        redraw();
        return;
      }
      if (item.kind === "gear") {
        const index = loadout.worn.findIndex((worn) => worn === null);
        if (index < 0) {
          flashNote("All six slots are full.");
          redraw();
          return;
        }
        loadout.worn[index] = item.id;
        redraw();
        return;
      }
      const index = loadout.wornAbilities.findIndex((worn) => worn === null);
      if (index < 0) {
        flashNote("All ability slots are full.");
        redraw();
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
      if (gear) {
        slot.button.className += rarityClass(gear.rarity);
        bindGearTip(slot.button, gear, item.level);
      } else bindTip(slot.button, "Item", "");
    } else if (item?.kind === "ability") {
      paintItemIcon(slot.canvas, abilities[item.catalogId]);
      stampLevel(slot.canvas, item.level);
      const worn = instanceById(loadout, item.id);
      bindAbilityTip(slot.button, () => abilityView(item.catalogId, worn ? abilityAmount(worn) : 0, item.level, worn ? abilitySplash(worn) : 0));
    }
    slot.button.dataset.drop = "storage";
    if (item && item.kind !== "gold") armDrag(slot.button, item.id, item.kind);
    row.append(slot.button);
  }
  frame.append(row);
  box.append(lead, frame);
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

function bindGearTip(el: HTMLElement, gear: GearItem, level: number): void {
  bindCardTip(el, () => gearCard(gear, level));
}

function gearCard(gear: GearItem, level: number): HTMLElement {
  const root = document.createElement("div");
  root.className = "dungeon-ability-card";
  const head = document.createElement("div");
  head.className = "dungeon-ability-head";
  const title = document.createElement("div");
  title.className = "dungeon-ability-name";
  title.textContent = gear.name;
  title.style.color = rarityNameColor(gear.rarity) ?? "#f4f7fb";
  const pill = document.createElement("div");
  pill.className = "dungeon-ability-element";
  pill.textContent = gear.rarity;
  const tone = rarityNameColor(gear.rarity) ?? "#9a8d78";
  pill.style.color = tone;
  pill.style.borderColor = tone;
  const lv = document.createElement("div");
  lv.className = "dungeon-ability-level";
  lv.textContent = `Lv ${level}`;
  head.append(title, pill, lv);
  const chips = gearChips(gear, level);
  root.append(head);
  if (chips.length === 0) {
    const empty = document.createElement("p");
    empty.className = "dungeon-ability-rule";
    empty.style.borderLeftColor = tone;
    empty.textContent = "No bonus.";
    root.append(empty);
  } else {
    const stats = document.createElement("div");
    stats.className = "dungeon-ability-stats";
    for (const chip of chips) stats.append(chip);
    root.append(stats);
  }
  return root;
}

function gearChips(gear: GearItem, level: number): HTMLElement[] {
  const chips: HTMLElement[] = [];
  const add = (label: string, value: string, color: string): void => {
    const chip = document.createElement("div");
    chip.className = "dungeon-ability-stat";
    const name = document.createElement("span");
    name.textContent = label;
    const number = document.createElement("b");
    number.textContent = value;
    number.style.color = color;
    chip.append(name, number);
    chips.push(chip);
  };
  const maxHp = scaled(gear.maxHp, level);
  const weaponPower = scaled(gear.weaponPower, level);
  const phys = scaled(gear.phys, level);
  const elem = scaled(gear.elem, level);
  const dodge = scaled(gear.dodge, level);
  const critChance = scaled(gear.critChance, level);
  const critShare = scaled(gear.critShare, level);
  if (maxHp) add("Max HP", `+${plain(maxHp)}`, "#f4efe4");
  if (weaponPower) add("Weapon Power", `+${plain(weaponPower)}`, "#d4bc82");
  if (phys) add("Physical resist", `+${plain(phys)}`, "#f0e2c4");
  if (elem) add("Element resist", `+${plain(elem)}`, "#7eb6ee");
  if (dodge) add("Dodge", percent(pointChance(dodge)), "#c9b3ef");
  if (critChance) add("Crit chance", percent(pointChance(critChance)), "#e7c98a");
  if (critShare) add("Crit damage", `+${percent(critShare)}`, "#e2582a");
  return chips;
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
  button.style.boxSizing = "border-box";
  button.style.padding = "calc(4 * var(--hud))";
  button.style.cursor = "pointer";
  const canvas = document.createElement("canvas");
  canvas.width = 44;
  canvas.height = 44;
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
  bindCardTip(el, () => weaponCard(weapon));
}

function weaponCard(weapon: WeaponDef): HTMLElement {
  const root = document.createElement("div");
  root.className = "dungeon-ability-card";
  const head = document.createElement("div");
  head.className = "dungeon-ability-head";
    const title = document.createElement("div");
  title.className = "dungeon-ability-name";
  title.textContent = weapon.name;
  head.append(title);
  const stats = document.createElement("div");
  stats.className = "dungeon-ability-stats";
  stats.append(
    weaponChip("Damage", String(weapon.hitDamage), "#e7c98a"),
    weaponChip("Range", String(weapon.range), "#f4efe4"),
    weaponChip("Magazine", weapon.magazine === null ? "None" : String(weapon.magazine), "#d4bc82"),
  );
  if (weapon.twice) stats.append(weaponChip("Hits", "2", "#f0e2c4"));
  const diagram = document.createElement("canvas");
  const cell = 14;
  const gap = 3;
  diagram.width = 3 * cell + 2 * gap;
  diagram.height = 6 * cell + 5 * gap;
  diagram.className = "dungeon-weapon-diagram";
  paintStrike(diagram, weapon);
  const rules = document.createElement("div");
  rules.className = "dungeon-ability-rules";
  for (const line of weapon.figure.split(/(?<=\.)\s+/)) {
    const row = document.createElement("p");
    row.className = "dungeon-ability-rule";
    row.style.borderLeftColor = "#d4bc82";
    row.textContent = line;
    rules.append(row);
  }
  root.append(head, stats, diagram, rules);
  return root;
}

function weaponChip(label: string, value: string, color: string): HTMLElement {
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
  abilities: Readonly<Record<string, HTMLCanvasElement>>,
  redraw: () => void,
): HTMLElement {
  const box = panel();
  box.append(heading("Abilities"));
  const row = document.createElement("div");
  row.style.display = "flex";
  row.style.gap = "calc(10 * var(--hud))";
  row.style.flexWrap = "wrap";
  for (let i = 0; i < SLOTS; i += 1) {
    const wornId = loadout.wornAbilities[i] ?? null;
    const wornInst = instanceById(loadout, wornId);
    const slot = document.createElement("button");
    slot.type = "button";
    slot.className = wornInst ? "dungeon-slot dungeon-slot-worn" : "dungeon-slot-empty";
    slot.dataset.drop = "ability";
    slot.dataset.slot = String(i);
    slot.style.font = "inherit";
    slot.style.width = "calc(88 * var(--hud))";
    slot.style.height = "calc(88 * var(--hud))";
    slot.style.cursor = "pointer";
    slot.style.padding = "calc(6 * var(--hud))";
    if (wornInst) {
      const canvas = document.createElement("canvas");
      canvas.width = 72;
      canvas.height = 72;
      canvas.style.width = "calc(72 * var(--hud))";
      canvas.style.height = "calc(72 * var(--hud))";
      paintItemIcon(canvas, abilities[wornInst.catalogId]);
      stampLevel(canvas, wornInst.level);
      slot.append(canvas);
      bindAbilityTip(slot, () => abilityView(wornInst.catalogId, abilityAmount(wornInst), wornInst.level, abilitySplash(wornInst)));
      armDrag(slot, wornInst.id, "ability");
    } else {
      slot.textContent = "Empty";
      slot.style.fontSize = "calc(13 * var(--hud))";
      bindTip(slot, "Ability", "Empty slot.");
    }
    slot.addEventListener("click", () => {
      if (dragMoved) return;
      if (!wornInst) {
        flashNote("Empty slot. Take an ability from storage.");
        redraw();
        return;
      }
      loadout.wornAbilities[i] = null;
      flashNote("Ability unequipped.");
      redraw();
    });
    row.append(slot);
  }
  box.append(row);
  return box;
}

const HERO_ELEMENTS: readonly { name: string; color: string }[] = [
  { name: "Fire", color: "#e2582a" },
  { name: "Earth", color: "#9a7434" },
  { name: "Poison", color: "#5fae3a" },
  { name: "Water", color: "#3a7fd4" },
  { name: "Ice", color: "#bfe6f5" },
];

function heroCard(bonus: GearBonus): HTMLElement {
  const box = panel();
  box.classList.add("dungeon-hero-panel");
  box.append(heading("Hero"));
  const row = document.createElement("div");
  row.className = "dungeon-hero";
  const portrait = document.createElement("canvas");
  portrait.width = 96;
  portrait.height = 96;
  portrait.className = "dungeon-icon dungeon-hero-portrait";
  const sheet = document.createElement("div");
  sheet.className = "dungeon-hero-sheet";
  const attrs = heroAttributes();
  sheet.append(
    heroGroup("Body", [
      ["Max HP", String(HERO_HP + bonus.maxHp)],
      ["Max MP", attrText(attrs, "MaxMp")],
    ]),
    heroGroup("Power", [
      ["Weapon Power", withGear("100%", bonus.weaponPower)],
      ["Ability Power", "100%"],
    ]),
    heroGroup("Resistance", [
      ["Physical", plain(bonus.phys)],
      ...HERO_ELEMENTS.map((element) => [element.name, withGear("0%", bonus.elem), element.color] as const),
    ]),
    heroGroup("Chance", [
      ["Dodge", percent(pointChance(bonus.dodge))],
      ["Crit chance", percent(pointChance(bonus.critChance))],
      ["Crit damage", percent(2 + bonus.critShare)],
    ]),
    heroGroup(
      "Element damage",
      HERO_ELEMENTS.map((element) => [element.name, "0%", element.color] as const),
    ),
  );
  row.append(portrait, sheet);
  box.append(row);
  void loadSprites().then((sprites) => {
    const ctx = portrait.getContext("2d");
    ctx?.drawImage(sprites.hero, 8, 4, 80, 88);
  });
  return box;
}

function withGear(base: string, bonus: number): string {
  return bonus > 0 ? `${base} + ${plain(bonus)}` : base;
}

function heroGroup(title: string, rows: readonly (readonly [string, string, string?])[]): HTMLElement {
  const group = document.createElement("section");
  group.className = "dungeon-hero-group";
  const label = document.createElement("h3");
  label.className = "dungeon-hero-group-title";
  label.textContent = title;
  group.append(label);
  for (const [name, value, color] of rows) {
    const line = document.createElement("div");
    line.className = "dungeon-hero-row";
    const key = document.createElement("span");
    key.textContent = name;
    if (color) key.style.color = color;
    const number = document.createElement("b");
    number.textContent = value;
    line.append(key, number);
    group.append(line);
  }
  return group;
}

function menuButton(label: string, onClick: () => void, primary: boolean): HTMLButtonElement {
  const button = document.createElement("button");
  button.type = "button";
  button.textContent = label;
  button.className = primary ? "dungeon-button dungeon-button-primary" : "dungeon-button";
  button.style.fontSize = "calc(18 * var(--hud))";
  button.style.padding = "calc(14 * var(--hud)) calc(22 * var(--hud))";
  button.style.cursor = "pointer";
  button.addEventListener("click", onClick);
  return button;
}
