import { weaponById, WEAPONS, type WeaponId } from "../data/weapons.ts";
import { itemById } from "../data/items.ts";
import { addInstance, abilityAmount, abilitySplash, instanceById, saveLoadout, unworn, type Loadout } from "../data/instances.ts";
import { abilityTip, heroAbilityById } from "../data/hero-abilities.ts";
import { bindTip } from "./tip.ts";
import { freshShelf, shelfBar, shelfMatch, shelfOrder, type ShelfKind } from "./shelf-bar.ts";
import {
  buyout,
  buyStack,
  cancelLot,
  listUnique,
  LOT_HOURS,
  placeBid,
  settle,
  toPublic,
  type AuctionStep,
  type House,
  type LotHours,
  type PublicLot,
} from "./auction.ts";

const ME = "you";

export interface AuctionKit {
  weapon: WeaponId;
  gold: number;
  owned: WeaponId[];
}

type Tab = "browse" | "sell" | "bids" | "mine";

type SellPick = { kind: "weapon" | "gear" | "ability"; instanceId: string; catalogId: string };

export function paintAuction(
  host: HTMLElement,
  kit: AuctionKit,
  loadout: Loadout,
  house: House,
  onBack: () => void,
  art: {
    gold: HTMLCanvasElement;
    weapons: Readonly<Partial<Record<WeaponId, HTMLCanvasElement>>>;
    items: Readonly<Record<string, HTMLCanvasElement>>;
  },
): void {
  let tab: Tab = "browse";
  let selectedId: string | null = null;
  let sellPick: SellPick | null = null;
  let buyoutOnly = false;
  let hours: LotHours | null = null;
  let draftBid = "";
  let draftBuyout = "";
  let note = "";
  const shelf = freshShelf();

  const redraw = (): void => {
    const settled = settle(house, Date.now());
    const settledNote = apply(kit, loadout, settled);
    if (settledNote) note = settledNote;
    paint();
  };

  const paint = (): void => {
    host.replaceChildren();
    host.className = "dungeon";
    host.style.display = "flex";
    host.style.flexDirection = "column";
    host.style.height = "100%";
    host.style.overflow = "auto";

    const page = document.createElement("div");
    page.style.maxWidth = "980px";
    page.style.margin = "0 auto";
    page.style.padding = "28px 20px 48px";
    page.style.display = "flex";
    page.style.flexDirection = "column";
    page.style.gap = "14px";

    const title = document.createElement("h1");
    title.textContent = "Auction";
    title.className = "dungeon-title";
    title.style.margin = "0";

    const purse = document.createElement("div");
    purse.textContent = `Gold ${kit.gold}`;

    const lead = document.createElement("p");
    lead.textContent =
      "Players trade gear and abilities. The hub sells nothing. Buyers do not see when a lot ends.";
    lead.style.margin = "0";
    lead.style.opacity = "0.75";

    const tabs = document.createElement("div");
    tabs.style.display = "flex";
    tabs.style.gap = "8px";
    tabs.style.flexWrap = "wrap";
    for (const item of [
      ["browse", "Lots"],
      ["sell", "Sell"],
      ["bids", "My bids"],
      ["mine", "My lots"],
    ] as const) {
      tabs.append(
        button(item[1], () => {
          tab = item[0];
          redraw();
        }, tab === item[0]),
      );
    }

    const status = document.createElement("div");
    status.textContent = note;
    status.style.minHeight = "1.2em";

    page.append(title, purse, lead, tabs, shelfBar(shelf, redraw), status);
    if (tab === "browse") page.append(browse());
    if (tab === "sell") page.append(sell());
    if (tab === "bids") page.append(bids());
    if (tab === "mine") page.append(mine());
    const back = button("Back", onBack, false);
    back.classList.add("dungeon-back");
    host.append(back, page);
  };

  const browse = (): HTMLElement => {
    const wrap = row();
    const left = column();
    const lots = shownLots();
    if (lots.length === 0) left.append(muted("No lots."));
    for (const lot of lots) {
      left.append(
        button(lotLine(lot), () => {
          selectedId = lot.id;
          redraw();
        }, lot.id === selectedId),
      );
    }
    wrap.append(left, detail(house.lots.map(toPublic).find((lot) => lot.id === selectedId) ?? null));
    return wrap;
  };

  const detail = (lot: PublicLot | null): HTMLElement => {
    const box = column();
    if (!lot) {
      box.append(muted("Pick a lot."));
      return box;
    }
    box.append(heading(lot.goods.name), muted(lot.goods.text));
    if (lot.sellerId === ME) box.append(muted("This is your lot."));
    if (lot.goods.kind === "stack") {
      box.append(muted(`${lot.goods.count} pcs at ${lot.price}`));
      if (lot.sellerId !== ME) {
        const count = document.createElement("input");
        count.type = "number";
        count.min = "1";
        count.value = "1";
        fieldStyle(count);
        box.append(
          count,
          button("Buy", () => {
            const step = buyStack(house, lot.id, ME, Number(count.value), kit.gold);
            note = apply(kit, loadout, step) ?? "Bought.";
            redraw();
          }, true),
        );
      }
      return box;
    }
    if (!lot.buyoutOnly) {
      box.append(muted(lot.bid === null ? "No bids." : `Bid ${lot.bid}`));
      if (lot.sellerId !== ME) {
        const amount = document.createElement("input");
        amount.type = "number";
        amount.placeholder = "Bid";
        fieldStyle(amount);
        box.append(
          amount,
          button("Place bid", () => {
            const step = placeBid(house, lot.id, ME, Number(amount.value), kit.gold);
            note = apply(kit, loadout, step) ?? "Bid placed.";
            redraw();
          }, true),
        );
      }
    } else {
      box.append(muted("Buyout only."));
    }
    if (lot.price !== null) box.append(muted(`Buyout ${lot.price}`));
    if (lot.sellerId !== ME && lot.price !== null) {
      box.append(
        button("Buy out", () => {
          const step = buyout(house, lot.id, ME, kit.gold);
          note = apply(kit, loadout, step) ?? "Bought out.";
          selectedId = null;
          redraw();
        }, true),
      );
    }
    return box;
  };

  const sell = (): HTMLElement => {
    const box = column();
    box.append(heading("Storage"));
    const stored = shownStorage();
    const grid = document.createElement("div");
    grid.className = "dungeon-storage";
    const cells = Math.max(30, Math.ceil(stored.length / 6) * 6);
    for (let i = 0; i < cells; i += 1) {
      const item = stored[i];
      const picked = item ? samePick(sellPick, item) : false;
      const slot = document.createElement("button");
      slot.type = "button";
      slot.className = picked ? "dungeon-slot dungeon-slot-worn" : "dungeon-slot";
      slot.style.width = "52px";
      slot.style.height = "52px";
      slot.style.padding = "4px";
      slot.style.cursor = "pointer";
      const canvas = document.createElement("canvas");
      canvas.width = 44;
      canvas.height = 44;
      canvas.style.width = "44px";
      canvas.style.height = "44px";
      slot.append(canvas);
      if (item?.kind === "gold") {
        drawArt(canvas, art.gold);
        if (item.count > 1) stampCount(canvas, item.count);
        slot.title = "Gold";
      } else if (item?.kind === "weapon") {
        const weapon = weaponById(item.id);
        drawArt(canvas, art.weapons[item.id]);
        stampLevel(canvas, item.level);
        slot.title = weapon.name;
        slot.addEventListener("click", () => {
          readDraft();
          sellPick = { kind: "weapon", instanceId: item.instanceId, catalogId: item.id };
          redraw();
        });
      } else if (item?.kind === "gear") {
        const gear = itemById(item.id);
        drawArt(canvas, art.items[item.id]);
        stampLevel(canvas, item.level);
        if (gear && gear.rarity !== "common") slot.classList.add(`dungeon-rarity-${gear.rarity}`);
        slot.title = gear?.name ?? "Item";
        slot.addEventListener("click", () => {
          readDraft();
          sellPick = { kind: "gear", instanceId: item.instanceId, catalogId: item.id };
          redraw();
        });
      } else if (item?.kind === "ability") {
        const inst = instanceById(loadout, item.instanceId);
        const tip = abilityTip(item.id, inst ? abilityAmount(inst) : 0, item.level, inst ? abilitySplash(inst) : 0);
        bindTip(slot, tip.name, tip.text);
        slot.addEventListener("click", () => {
          readDraft();
          sellPick = { kind: "ability", instanceId: item.instanceId, catalogId: item.id };
          redraw();
        });
      }
      grid.append(slot);
    }
    box.append(grid);
    if (sellPick && stillStored(kit, loadout, sellPick)) box.append(sellForm(sellPick));
    return box;
  };

  const sellForm = (pick: SellPick): HTMLElement => {
    const form = column();
    const toggle = button(buyoutOnly ? "Buyout only: yes" : "Buyout only: no", () => {
      readDraft();
      buyoutOnly = !buyoutOnly;
      redraw();
    }, buyoutOnly);
    form.append(toggle);
    let bidInput: HTMLInputElement | null = null;
    if (!buyoutOnly) {
      bidInput = document.createElement("input");
      bidInput.placeholder = "Minimum bid";
      bidInput.value = draftBid;
      fieldStyle(bidInput);
      form.append(bidInput);
    }
    const buyoutInput = document.createElement("input");
    buyoutInput.placeholder = buyoutOnly ? "Buyout" : "Buyout, optional";
    buyoutInput.value = draftBuyout;
    fieldStyle(buyoutInput);
    const times = document.createElement("div");
    times.style.display = "flex";
    times.style.gap = "8px";
    for (const span of LOT_HOURS) {
      times.append(
        button(`${span}h`, () => {
          readDraft();
          hours = span;
          redraw();
        }, hours === span),
      );
    }
    form.append(
      buyoutInput,
      times,
      button("List", () => {
        if (pick.kind === "weapon" && kit.owned.length < 2) {
          note = "You must keep one weapon equipped.";
          redraw();
          return;
        }
        if (!stillStored(kit, loadout, pick)) return;
        if (hours === null) {
          note = "Pick how long the lot lasts.";
          redraw();
          return;
        }
        const goods = pickGoods(pick);
        const step = listUnique(house, {
          sellerId: ME,
          goods,
          buyoutOnly,
          minBid: buyoutOnly ? null : parseMoney(bidInput?.value ?? ""),
          buyout: parseMoney(buyoutInput.value),
          hours,
          now: Date.now(),
        });
        const error = apply(kit, loadout, step);
        if (error) {
          note = error;
          redraw();
          return;
        }
        takeStored(kit, loadout, pick);
        sellPick = null;
        draftBid = "";
        draftBuyout = "";
        note = "Lot listed.";
        tab = "mine";
        redraw();
      }, true),
    );
    return form;
  };

  const bids = (): HTMLElement => {
    const box = column();
    const mine = house.watches.filter((watch) => watch.bidderId === ME && shownLots().some((lot) => lot.id === watch.lotId));
    if (mine.length === 0) box.append(muted("No bids."));
    for (const watch of mine) {
      const lot = house.lots.find((item) => item.id === watch.lotId);
      if (!lot) continue;
      const rowButton = button(`${lot.goods.name} · ${lot.bid ?? "—"}`, () => {
        selectedId = lot.id;
        tab = "browse";
        redraw();
      }, false);
      rowButton.style.color = watch.winning ? "#7ddea0" : "#ff8d8d";
      box.append(rowButton);
    }
    return box;
  };

  const mine = (): HTMLElement => {
    const wrap = row();
    const left = column();
    const right = column();
    left.append(heading("Matching lots"));
    const visible = new Set(shownLots().map((lot) => lot.id));
    const own = house.lots.filter((lot) => lot.sellerId === ME && visible.has(lot.id));
    const keys = new Set(own.map((lot) => lot.goods.key));
    const peers = house.lots.filter((lot) => keys.has(lot.goods.key) && visible.has(lot.id));
    if (peers.length === 0) left.append(muted("Nothing to compare."));
    for (const lot of peers) {
      left.append(button(lotLine(toPublic(lot)), () => {
        selectedId = lot.id;
        tab = "browse";
        redraw();
      }, false));
    }
    right.append(heading("Your lots"));
    if (own.length === 0) right.append(muted("No lots."));
    for (const lot of own) {
      const label = lot.durationHours === null ? lotLine(toPublic(lot)) : `${lotLine(toPublic(lot))} · ${lot.durationHours}h`;
      right.append(
        button(`Cancel · ${label}`, () => {
          const step = cancelLot(house, lot.id, ME);
          note = apply(kit, loadout, step) ?? "Lot cancelled.";
          redraw();
        }, false),
      );
    }
    wrap.append(left, right);
    return wrap;
  };

  const readDraft = (): void => {
    const bid = document.querySelector<HTMLInputElement>("input[placeholder='Minimum bid']");
    const buy = document.querySelector<HTMLInputElement>("input[placeholder='Buyout'], input[placeholder='Buyout, optional']");
    if (bid) draftBid = bid.value;
    if (buy) draftBuyout = buy.value;
  };

  const shownLots = (): PublicLot[] =>
    shelfOrder(
      house.lots.map(toPublic).filter((lot) => shelfMatch(lotKind(lot), lot.goods.name, shelf)),
      shelf,
      (lot) => lot.goods.name,
      (lot) => itemById(lot.goods.key)?.rarity,
    );

  const shownStorage = (): StoredCell[] =>
    shelfOrder(
      storageCells(kit, loadout).filter((item) => shelfMatch(item.kind, storedName(item), shelf)),
      shelf,
      storedName,
      (item) => (item.kind === "gear" ? itemById(item.id)?.rarity : undefined),
    );

  redraw();
}

function lotKind(lot: PublicLot): ShelfKind {
  if (lot.goods.kind === "stack") return "stack";
  if (WEAPONS.some((weapon) => weapon.id === lot.goods.key)) return "weapon";
  if (itemById(lot.goods.key)) return "gear";
  return "ability";
}

function storedName(item: StoredCell): string {
  if (item.kind === "gold") return "Gold";
  if (item.kind === "weapon") return weaponById(item.id).name;
  if (item.kind === "gear") return itemById(item.id)?.name ?? "Item";
  return "Ability";
}

function apply(kit: AuctionKit, loadout: Loadout, step: AuctionStep): string | null {
  if (step.error) return step.error;
  for (const move of step.gold) {
    if (move.id === ME) kit.gold += move.delta;
  }
  for (const item of step.items) {
    if (item.to !== ME || item.goods.kind !== "unique") continue;
    const key = item.goods.key;
    if (WEAPONS.some((weapon) => weapon.id === key)) {
      const id = key as WeaponId;
      addInstance(loadout, "weapon", id);
      if (!kit.owned.includes(id)) kit.owned.push(id);
      continue;
    }
    if (itemById(key)) {
      addInstance(loadout, "gear", key);
      continue;
    }
    addInstance(loadout, "ability", key);
  }
  if (!kit.owned.includes(kit.weapon)) kit.weapon = kit.owned[0] ?? kit.weapon;
  saveLoadout(loadout);
  return null;
}

type StoredCell =
  | { kind: "gold"; count: number }
  | { kind: "weapon"; id: WeaponId; instanceId: string; level: number }
  | { kind: "gear"; id: string; instanceId: string; level: number }
  | { kind: "ability"; id: string; instanceId: string; level: number };

function storageCells(kit: AuctionKit, loadout: Loadout): StoredCell[] {
  const stored: StoredCell[] = [];
  if (kit.gold > 0) stored.push({ kind: "gold", count: kit.gold });
  for (const item of unworn(loadout)) {
    if (item.kind === "weapon") stored.push({ kind: "weapon", id: item.catalogId as WeaponId, instanceId: item.id, level: item.level });
    else if (item.kind === "gear") stored.push({ kind: "gear", id: item.catalogId, instanceId: item.id, level: item.level });
    else stored.push({ kind: "ability", id: item.catalogId, instanceId: item.id, level: item.level });
  }
  return stored;
}

function samePick(pick: SellPick | null, item: StoredCell): boolean {
  if (!pick || item.kind === "gold" || pick.kind !== item.kind) return false;
  return pick.instanceId === item.instanceId;
}

function stillStored(kit: AuctionKit, loadout: Loadout, pick: SellPick): boolean {
  return storageCells(kit, loadout).some((item) => samePick(pick, item));
}

function pickGoods(pick: SellPick): { kind: "unique"; key: string; name: string; text: string } {
  if (pick.kind === "weapon") {
    const weapon = weaponById(pick.catalogId as WeaponId);
    return { kind: "unique", key: pick.catalogId, name: weapon.name, text: weapon.figure };
  }
  if (pick.kind === "gear") {
    const gear = itemById(pick.catalogId);
    return { kind: "unique", key: pick.catalogId, name: gear?.name ?? "Item", text: gear?.name ?? "" };
  }
  const row = heroAbilityById(pick.catalogId);
  return { kind: "unique", key: pick.catalogId, name: row?.name ?? "Ability", text: row?.text ?? "" };
}

function takeStored(kit: AuctionKit, loadout: Loadout, pick: SellPick): void {
  loadout.items = loadout.items.filter((item) => item.id !== pick.instanceId);
  if (loadout.weapon === pick.instanceId) loadout.weapon = null;
  loadout.worn = loadout.worn.map((worn) => (worn === pick.instanceId ? null : worn));
  loadout.wornAbilities = loadout.wornAbilities.map((worn) => (worn === pick.instanceId ? null : worn));
  if (pick.kind === "weapon") {
    const at = kit.owned.indexOf(pick.catalogId as WeaponId);
    if (at >= 0) kit.owned.splice(at, 1);
    const left = equippedWeaponLeft(loadout);
    if (left) kit.weapon = left;
  }
  saveLoadout(loadout);
}

function equippedWeaponLeft(loadout: Loadout): WeaponId | null {
  const worn = loadout.items.find((item) => item.id === loadout.weapon && item.kind === "weapon");
  return worn ? (worn.catalogId as WeaponId) : null;
}

function drawArt(canvas: HTMLCanvasElement, art: HTMLCanvasElement | undefined): void {
  const ctx = canvas.getContext("2d");
  if (!ctx || !art) return;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  const fit = 36 / Math.max(art.width, art.height);
  const w = art.width * fit;
  const h = art.height * fit;
  ctx.drawImage(art, (canvas.width - w) / 2, (canvas.height - h) / 2, w, h);
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

function stampLevel(canvas: HTMLCanvasElement, level: number): void {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.fillStyle = "#f4f7fb";
  ctx.font = "700 12px Palatino Linotype, Palatino, serif";
  ctx.textAlign = "left";
  ctx.textBaseline = "top";
  ctx.fillText(String(level), 2, 2);
}

function lotLine(lot: PublicLot): string {
  if (lot.goods.kind === "stack") return `${lot.goods.name} · ${lot.goods.count} · ${lot.price}`;
  if (lot.buyoutOnly) return `${lot.goods.name} · buyout ${lot.price}`;
  const bid = lot.bid === null ? "no bids" : `bid ${lot.bid}`;
  const price = lot.price === null ? "no buyout" : `buyout ${lot.price}`;
  return `${lot.goods.name} · ${bid} · ${price}`;
}

function parseMoney(raw: string): number | null {
  const text = raw.trim();
  if (text === "") return null;
  if (!/^\d+$/.test(text)) return null;
  const value = Number(text);
  return value >= 1 ? value : null;
}

function row(): HTMLElement {
  const wrap = document.createElement("div");
  wrap.style.display = "flex";
  wrap.style.gap = "16px";
  wrap.style.alignItems = "flex-start";
  wrap.style.flexWrap = "wrap";
  return wrap;
}

function column(): HTMLElement {
  const box = document.createElement("section");
  box.className = "dungeon-panel";
  box.style.flex = "1";
  box.style.minWidth = "260px";
  box.style.display = "flex";
  box.style.flexDirection = "column";
  box.style.gap = "8px";
  return box;
}

function heading(text: string): HTMLElement {
  const el = document.createElement("h2");
  el.textContent = text;
  el.className = "dungeon-heading";
  el.style.margin = "0";
  return el;
}

function muted(text: string): HTMLElement {
  const el = document.createElement("p");
  el.textContent = text;
  el.style.margin = "0";
  el.style.opacity = "0.75";
  return el;
}

function button(label: string, onClick: () => void, primary: boolean): HTMLButtonElement {
  const node = document.createElement("button");
  node.type = "button";
  node.textContent = label;
  node.className = primary ? "dungeon-button dungeon-button-primary" : "dungeon-button";
  node.style.textAlign = "left";
  node.style.padding = "10px 14px";
  node.style.cursor = "pointer";
  node.addEventListener("click", onClick);
  return node;
}

function fieldStyle(input: HTMLInputElement): void {
  input.className = "dungeon-input";
  input.style.padding = "10px 12px";
}
