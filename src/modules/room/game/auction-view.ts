import { weaponById, WEAPONS, type WeaponId } from "../data/weapons.ts";
import { itemById } from "../data/items.ts";
import { addInstance, abilityAmount, abilitySplash, instanceById, saveLoadout, unworn, type Loadout } from "../data/instances.ts";
import { abilityView, heroAbilityById } from "../data/hero-abilities.ts";
import { bindAbilityTip, hideTip } from "./tip.ts";
import { freshShelf, shelfBar, shelfMatch, shelfOrder, type ShelfKind } from "./shelf-bar.ts";
import { storageLayout, storageScroll } from "./storage.ts";
import {
  buyout,
  buyStack,
  cancelLot,
  listStack,
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

type SellPick =
  | { kind: "weapon" | "gear" | "ability"; instanceId: string; catalogId: string }
  | { kind: "gold" };

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
    abilities?: Readonly<Record<string, HTMLCanvasElement>>;
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
    hideTip();
    host.replaceChildren();
    host.className = "dungeon";
    host.style.display = "flex";
    host.style.flexDirection = "column";
    host.style.height = "100%";
    host.style.overflow = "hidden";

    const page = document.createElement("div");
    page.className = "dungeon-auction";

    const head = document.createElement("div");
    head.className = "dungeon-auction-head";
    const title = document.createElement("h1");
    title.textContent = "Auction";
    title.className = "dungeon-title";
    title.style.margin = "0";
    const purse = document.createElement("div");
    purse.className = "dungeon-purse";
    const coin = document.createElement("canvas");
    coin.width = 28;
    coin.height = 28;
    coin.className = "dungeon-purse-coin";
    drawArt(coin, art.gold);
    const gold = document.createElement("b");
    gold.textContent = String(kit.gold);
    purse.append(coin, gold);
    const tabs = document.createElement("div");
    tabs.className = "dungeon-auction-tabs";
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
    head.append(title, purse, tabs);

    const status = document.createElement("div");
    status.className = "dungeon-auction-note";
    status.textContent = note;

    const body = document.createElement("div");
    body.className = "dungeon-auction-body";
    if (tab === "browse") body.append(browse());
    if (tab === "sell") body.append(sell());
    if (tab === "bids") body.append(bids());
    if (tab === "mine") body.append(mine());

    page.append(head, shelfBar(shelf, redraw), status, body);
    const back = button("Back", onBack, false);
    back.classList.add("dungeon-back");
    host.append(back, page);
  };

  const browse = (): HTMLElement => {
    const wrap = document.createElement("div");
    wrap.className = "dungeon-auction-board";
    const list = document.createElement("div");
    list.className = "dungeon-lots";
    const lots = shownLots();
    if (lots.length === 0) list.append(muted("No lots."));
    for (const lot of lots) list.append(lotCard(lot, lot.id === selectedId, () => {
      selectedId = lot.id;
      redraw();
    }));
    wrap.append(list, detail(house.lots.map(toPublic).find((lot) => lot.id === selectedId) ?? null));
    return wrap;
  };

  const detail = (lot: PublicLot | null): HTMLElement => {
    const box = column();
    box.classList.add("dungeon-auction-detail");
    if (!lot) {
      box.append(heading("Lot"), muted("Pick a lot."));
      return box;
    }
    const icon = document.createElement("canvas");
    icon.width = 72;
    icon.height = 72;
    icon.className = "dungeon-lot-icon";
    paintLot(icon, lot);
    box.append(icon, heading(lot.goods.name), muted(sellerName(lot.sellerId)), muted(lot.goods.text));
    const facts = document.createElement("div");
    facts.className = "dungeon-ability-stats";
    if (lot.goods.kind === "stack") facts.append(fact("Each", String(lot.price ?? "—"), "#d4bc82"), fact("Count", String(lot.goods.count), "#f4efe4"));
    else {
      if (!lot.buyoutOnly && lot.minBid !== null) facts.append(fact("Minimum", String(lot.minBid), "#f4efe4"));
      facts.append(fact("Bid", lot.bid === null ? "None" : String(lot.bid), "#e7c98a"));
      facts.append(fact("Buyout", lot.price === null ? "None" : String(lot.price), "#d4bc82"));
    }
    box.append(facts);
    if (lot.sellerId === ME) {
      box.append(muted("This is your lot."));
      box.append(button("Cancel", () => {
        const step = cancelLot(house, lot.id, ME);
        note = apply(kit, loadout, step) ?? "Lot cancelled.";
        selectedId = null;
        redraw();
      }, false));
    }
    if (lot.goods.kind === "stack") {
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
    const wrap = document.createElement("div");
    wrap.className = "dungeon-auction-board";
    const box = column();
    box.classList.add("dungeon-bank");
    box.append(heading("Storage"));
    const stored = shownStorage();
    const grid = document.createElement("div");
    grid.className = "dungeon-storage";
    const cells = storageLayout(stored.length).cells;
    const frame = storageScroll(stored.length);
    for (let i = 0; i < cells; i += 1) {
      const item = stored[i];
      const picked = item ? samePick(sellPick, item) : false;
      const slot = document.createElement("button");
      slot.type = "button";
      slot.className = picked ? "dungeon-slot dungeon-slot-worn" : "dungeon-slot";
      slot.style.boxSizing = "border-box";
      slot.style.padding = "calc(4 * var(--hud))";
      slot.style.cursor = "pointer";
      const canvas = document.createElement("canvas");
      canvas.width = 44;
      canvas.height = 44;
      slot.append(canvas);
      if (item?.kind === "gold") {
        drawArt(canvas, art.gold);
        if (item.count > 1) stampCount(canvas, item.count);
        slot.title = "Gold";
        if (sellPick?.kind === "gold") slot.className = "dungeon-slot dungeon-slot-worn";
        slot.addEventListener("click", () => {
          readDraft();
          sellPick = { kind: "gold" };
          redraw();
        });
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
        drawArt(canvas, art.abilities?.[item.id]);
        stampLevel(canvas, item.level);
        bindAbilityTip(slot, () => abilityView(item.id, inst ? abilityAmount(inst) : 0, item.level, inst ? abilitySplash(inst) : 0));
        slot.addEventListener("click", () => {
          readDraft();
          sellPick = { kind: "ability", instanceId: item.instanceId, catalogId: item.id };
          redraw();
        });
      }
      grid.append(slot);
    }
    frame.style.maxHeight = "none";
    frame.style.flex = "1";
    frame.style.minHeight = "0";
    frame.append(grid);
    box.append(frame);
    const form = sellPick && stillStored(kit, loadout, sellPick) ? sellForm(sellPick) : column();
    if (!sellPick || !stillStored(kit, loadout, sellPick)) {
      form.append(heading("List"), muted("Pick an item in storage."));
    }
    wrap.append(box, form);
    return wrap;
  };

  const sellForm = (pick: SellPick): HTMLElement => {
    if (pick.kind === "gold") return goldForm();
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
    times.style.gap = "calc(8 * var(--hud))";
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
        const goods = pickGoods(loadout, pick);
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

  const goldForm = (): HTMLElement => {
    const form = column();
    const countInput = document.createElement("input");
    countInput.type = "number";
    countInput.min = "1";
    countInput.value = "1";
    countInput.placeholder = "Quantity";
    fieldStyle(countInput);
    const priceInput = document.createElement("input");
    priceInput.placeholder = "Price each";
    fieldStyle(priceInput);
    form.append(
      heading("Sell gold"),
      countInput,
      priceInput,
      button("List", () => {
        const count = Number(countInput.value);
        const unitPrice = parseMoney(priceInput.value);
        if (!Number.isInteger(count) || count < 1 || count > kit.gold) {
          note = "That quantity is not available.";
          redraw();
          return;
        }
        if (unitPrice === null) {
          note = "A price is required.";
          redraw();
          return;
        }
        const step = listStack(house, {
          sellerId: ME,
          goods: { kind: "stack", key: "gold", name: "Gold", text: "Coins." },
          count,
          unitPrice,
        });
        const error = apply(kit, loadout, step);
        if (error) {
          note = error;
          redraw();
          return;
        }
        kit.gold -= count;
        sellPick = null;
        note = "Lot listed.";
        tab = "mine";
        redraw();
      }, true),
    );
    return form;
  };

  const bids = (): HTMLElement => {
    const box = column();
    box.classList.add("dungeon-auction-fill");
    const grid = document.createElement("div");
    grid.className = "dungeon-lots";
    const mine = house.watches.filter((watch) => watch.bidderId === ME && shownLots().some((lot) => lot.id === watch.lotId));
    if (mine.length === 0) grid.append(muted("No bids."));
    for (const watch of mine) {
      const lot = house.lots.find((item) => item.id === watch.lotId);
      if (!lot) continue;
      const card = lotCard(toPublic(lot), false, () => {
        selectedId = lot.id;
        tab = "browse";
        redraw();
      });
      card.classList.add(watch.winning ? "is-winning" : "is-losing");
      grid.append(card);
    }
    box.append(grid);
    return box;
  };

  const mine = (): HTMLElement => {
    const wrap = document.createElement("div");
    wrap.className = "dungeon-auction-board";
    const left = column();
    const right = column();
    left.append(heading("Matching lots"));
    const visible = new Set(shownLots().map((lot) => lot.id));
    const own = house.lots.filter((lot) => lot.sellerId === ME && visible.has(lot.id));
    const keys = new Set(own.map((lot) => lot.goods.key));
    const peers = house.lots.filter((lot) => keys.has(lot.goods.key) && visible.has(lot.id));
    const peerGrid = document.createElement("div");
    peerGrid.className = "dungeon-lots";
    if (peers.length === 0) peerGrid.append(muted("Nothing to compare."));
    for (const lot of peers) {
      peerGrid.append(lotCard(toPublic(lot), false, () => {
        selectedId = lot.id;
        tab = "browse";
        redraw();
      }));
    }
    left.append(peerGrid);
    right.append(heading("Your lots"));
    const ownGrid = document.createElement("div");
    ownGrid.className = "dungeon-lots";
    if (own.length === 0) ownGrid.append(muted("No lots."));
    for (const lot of own) {
      const card = lotCard(toPublic(lot), false, () => {
        selectedId = lot.id;
        tab = "browse";
        redraw();
      });
      const cancel = button("Cancel", () => {
        const step = cancelLot(house, lot.id, ME);
        note = apply(kit, loadout, step) ?? "Lot cancelled.";
        redraw();
      }, false);
      cancel.addEventListener("click", (event) => event.stopPropagation());
      card.append(cancel);
      if (lot.durationHours !== null) {
        const time = document.createElement("div");
        time.className = "dungeon-lot-price";
        time.textContent = `${lot.durationHours}h`;
        card.append(time);
      }
      ownGrid.append(card);
    }
    right.append(ownGrid);
    wrap.append(left, right);
    return wrap;
  };

  function lotCard(lot: PublicLot, picked: boolean, onClick: () => void): HTMLElement {
    const card = document.createElement("div");
    card.tabIndex = 0;
    card.setAttribute("role", "button");
    card.className = picked ? "dungeon-lot is-picked" : "dungeon-lot";
    const canvas = document.createElement("canvas");
    canvas.width = 64;
    canvas.height = 64;
    paintLot(canvas, lot);
    const name = document.createElement("div");
    name.className = "dungeon-lot-name";
    name.textContent = lot.goods.name;
    const price = document.createElement("div");
    price.className = "dungeon-lot-price";
    price.textContent = lotPrice(lot);
    const who = document.createElement("div");
    who.className = "dungeon-lot-price";
    who.textContent = sellerName(lot.sellerId);
    card.append(canvas, name, who, price);
    card.addEventListener("click", onClick);
    return card;
  }

  function paintLot(canvas: HTMLCanvasElement, lot: PublicLot): void {
    const key = lot.goods.key;
    if (WEAPONS.some((weapon) => weapon.id === key)) drawArt(canvas, art.weapons[key as WeaponId]);
    else if (itemById(key)) drawArt(canvas, art.items[key]);
    else drawArt(canvas, art.abilities?.[key]);
    if (lot.goods.kind === "stack" && lot.goods.count > 1) stampCount(canvas, lot.goods.count);
  }

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

function sellerName(id: string): string {
  if (id === ME) return "You";
  if (id === "trader") return "Trader";
  return id;
}

function apply(kit: AuctionKit, loadout: Loadout, step: AuctionStep): string | null {
  if (step.error) return step.error;
  for (const move of step.gold) {
    if (move.id === ME) kit.gold += move.delta;
  }
  for (const item of step.items) {
    if (item.to !== ME) continue;
    if (item.goods.kind === "stack") {
      grantStack(kit, loadout, item.goods.key, item.goods.count);
      continue;
    }
    grantUnique(kit, loadout, item.goods.key, item.goods.level ?? 0);
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

function grantUnique(kit: AuctionKit, loadout: Loadout, key: string, level: number): void {
  if (key === "gold") {
    kit.gold += 1;
    return;
  }
  if (WEAPONS.some((weapon) => weapon.id === key)) {
    const id = key as WeaponId;
    addInstance(loadout, "weapon", id, level);
    if (!kit.owned.includes(id)) kit.owned.push(id);
    return;
  }
  if (itemById(key)) {
    addInstance(loadout, "gear", key, level);
    return;
  }
  addInstance(loadout, "ability", key, level);
}

function grantStack(kit: AuctionKit, loadout: Loadout, key: string, count: number): void {
  if (key === "gold") {
    kit.gold += count;
    return;
  }
  for (let n = 0; n < count; n += 1) grantUnique(kit, loadout, key, 0);
}

function samePick(pick: SellPick | null, item: StoredCell): boolean {
  if (!pick || pick.kind === "gold" || item.kind === "gold" || pick.kind !== item.kind) return false;
  return pick.instanceId === item.instanceId;
}

function stillStored(kit: AuctionKit, loadout: Loadout, pick: SellPick): boolean {
  if (pick.kind === "gold") return kit.gold > 0;
  return storageCells(kit, loadout).some((item) => samePick(pick, item));
}

function pickGoods(loadout: Loadout, pick: Exclude<SellPick, { kind: "gold" }>): { kind: "unique"; key: string; name: string; text: string; level: number } {
  const level = instanceById(loadout, pick.instanceId)?.level ?? 0;
  if (pick.kind === "weapon") {
    const weapon = weaponById(pick.catalogId as WeaponId);
    return { kind: "unique", key: pick.catalogId, name: weapon.name, text: weapon.figure, level };
  }
  if (pick.kind === "gear") {
    const gear = itemById(pick.catalogId);
    return { kind: "unique", key: pick.catalogId, name: gear?.name ?? "Item", text: gear?.name ?? "", level };
  }
  const row = heroAbilityById(pick.catalogId);
  return { kind: "unique", key: pick.catalogId, name: row?.name ?? "Ability", text: row?.text ?? "", level };
}

function takeStored(kit: AuctionKit, loadout: Loadout, pick: Exclude<SellPick, { kind: "gold" }>): void {
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
  const fit = (Math.min(canvas.width, canvas.height) - 8) / Math.max(art.width, art.height);
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
  ctx.fillText(String(count), canvas.width - 2, canvas.height - 2);
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

function lotPrice(lot: PublicLot): string {
  if (lot.goods.kind === "stack") return `${lot.goods.count} · ${lot.price}`;
  if (lot.buyoutOnly) return `Buyout ${lot.price}`;
  const bid = lot.bid === null ? "No bids" : `Bid ${lot.bid}`;
  const price = lot.price === null ? "No buyout" : `Buyout ${lot.price}`;
  return `${bid} · ${price}`;
}

function fact(label: string, value: string, color: string): HTMLElement {
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
  wrap.style.gap = "calc(16 * var(--hud))";
  wrap.style.alignItems = "flex-start";
  wrap.style.flexWrap = "wrap";
  return wrap;
}

function column(): HTMLElement {
  const box = document.createElement("section");
  box.className = "dungeon-panel";
  box.style.flex = "1";
  box.style.minWidth = "calc(260 * var(--hud))";
  box.style.display = "flex";
  box.style.flexDirection = "column";
  box.style.gap = "calc(8 * var(--hud))";
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
  node.style.padding = "calc(10 * var(--hud)) calc(14 * var(--hud))";
  node.style.cursor = "pointer";
  node.addEventListener("click", onClick);
  return node;
}

function fieldStyle(input: HTMLInputElement): void {
  input.className = "dungeon-input";
  input.style.padding = "calc(10 * var(--hud)) calc(12 * var(--hud))";
}
