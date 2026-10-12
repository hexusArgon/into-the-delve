import { weaponById, WEAPONS, type WeaponId } from "../data/weapons.ts";
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

export function paintAuction(host: HTMLElement, kit: AuctionKit, house: House, onBack: () => void): void {
  let tab: Tab = "browse";
  let selectedId: string | null = null;
  let sellId: WeaponId | null = null;
  let buyoutOnly = false;
  let hours: LotHours | null = null;
  let draftBid = "";
  let draftBuyout = "";
  let query = "";
  let note = "";

  const redraw = (): void => {
    const settled = settle(house, Date.now());
    const settledNote = apply(kit, settled);
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
    title.textContent = "Аукцион";
    title.className = "dungeon-title";
    title.style.margin = "0";

    const purse = document.createElement("div");
    purse.textContent = `Золото ${kit.gold}`;

    const lead = document.createElement("p");
    lead.textContent =
      "Игроки торгуют экипировкой и способностями. Хаб ничего не продаёт. Покупатель не видит, когда лот кончится.";
    lead.style.margin = "0";
    lead.style.opacity = "0.75";

    const tabs = document.createElement("div");
    tabs.style.display = "flex";
    tabs.style.gap = "8px";
    tabs.style.flexWrap = "wrap";
    for (const item of [
      ["browse", "Лоты"],
      ["sell", "Продажа"],
      ["bids", "Мои ставки"],
      ["mine", "Мои лоты"],
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

    page.append(title, purse, lead, tabs, status);
    if (tab === "browse") page.append(browse());
    if (tab === "sell") page.append(sell());
    if (tab === "bids") page.append(bids());
    if (tab === "mine") page.append(mine());
    const back = button("Назад", onBack, false);
    back.classList.add("dungeon-back");
    host.append(back, page);
  };

  const browse = (): HTMLElement => {
    const wrap = row();
    const left = column();
    const search = document.createElement("input");
    search.type = "search";
    search.value = query;
    search.placeholder = "Название";
    fieldStyle(search);
    const find = button("Найти", () => {
      query = search.value.trim();
      redraw();
    }, false);
    const bar = document.createElement("div");
    bar.style.display = "flex";
    bar.style.gap = "8px";
    bar.append(search, find);
    left.append(bar);
    const lots = house.lots.map(toPublic).filter((lot) => lot.goods.name.toLowerCase().includes(query.toLowerCase()));
    if (lots.length === 0) left.append(muted("Лотов нет."));
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
      box.append(muted("Выбери лот."));
      return box;
    }
    box.append(heading(lot.goods.name), muted(lot.goods.text));
    if (lot.sellerId === ME) box.append(muted("Это твой лот."));
    if (lot.goods.kind === "stack") {
      box.append(muted(`${lot.goods.count} шт. по ${lot.price}`));
      if (lot.sellerId !== ME) {
        const count = document.createElement("input");
        count.type = "number";
        count.min = "1";
        count.value = "1";
        fieldStyle(count);
        box.append(
          count,
          button("Купить", () => {
            const step = buyStack(house, lot.id, ME, Number(count.value), kit.gold);
            note = apply(kit, step) ?? "Куплено.";
            redraw();
          }, true),
        );
      }
      return box;
    }
    if (!lot.buyoutOnly) {
      box.append(muted(lot.bid === null ? "Ставок нет." : `Ставка ${lot.bid}`));
      if (lot.sellerId !== ME) {
        const amount = document.createElement("input");
        amount.type = "number";
        amount.placeholder = "Ставка";
        fieldStyle(amount);
        box.append(
          amount,
          button("Поставить ставку", () => {
            const step = placeBid(house, lot.id, ME, Number(amount.value), kit.gold);
            note = apply(kit, step) ?? "Ставка поставлена.";
            redraw();
          }, true),
        );
      }
    } else {
      box.append(muted("Только выкуп."));
    }
    if (lot.price !== null) box.append(muted(`Выкуп ${lot.price}`));
    if (lot.sellerId !== ME && lot.price !== null) {
      box.append(
        button("Выкупить", () => {
          const step = buyout(house, lot.id, ME, kit.gold);
          note = apply(kit, step) ?? "Выкуплено.";
          selectedId = null;
          redraw();
        }, true),
      );
    }
    return box;
  };

  const sell = (): HTMLElement => {
    const box = column();
    box.append(heading("Уникальные вещи"), muted("Ставка или галочка «только выкуп». Одинаковые копии не складываются."));
    if (kit.owned.length === 0) box.append(muted("Нечего выставить."));
    const icons = document.createElement("div");
    icons.style.display = "flex";
    icons.style.gap = "8px";
    icons.style.flexWrap = "wrap";
    for (const weapon of WEAPONS) {
      if (!kit.owned.includes(weapon.id)) continue;
      const id = weapon.id;
      icons.append(
        button(weapon.name, () => {
          readDraft();
          sellId = id;
          redraw();
        }, sellId === id),
      );
    }
    box.append(icons);
    if (sellId && kit.owned.includes(sellId)) box.append(sellForm(sellId));
    box.append(
      heading("Стопки"),
      muted("Расходуемые предметы продаются количеством и ценой, без ставки. Таких предметов нет."),
    );
    return box;
  };

  const sellForm = (id: WeaponId): HTMLElement => {
    const form = column();
    const toggle = button(buyoutOnly ? "Только выкуп: да" : "Только выкуп: нет", () => {
      readDraft();
      buyoutOnly = !buyoutOnly;
      redraw();
    }, buyoutOnly);
    form.append(toggle);
    let bidInput: HTMLInputElement | null = null;
    if (!buyoutOnly) {
      bidInput = document.createElement("input");
      bidInput.placeholder = "Минимальная ставка";
      bidInput.value = draftBid;
      fieldStyle(bidInput);
      form.append(bidInput);
    }
    const buyoutInput = document.createElement("input");
    buyoutInput.placeholder = buyoutOnly ? "Выкуп" : "Выкуп, можно пустым";
    buyoutInput.value = draftBuyout;
    fieldStyle(buyoutInput);
    const times = document.createElement("div");
    times.style.display = "flex";
    times.style.gap = "8px";
    for (const span of LOT_HOURS) {
      times.append(
        button(`${span} ч`, () => {
          readDraft();
          hours = span;
          redraw();
        }, hours === span),
      );
    }
    form.append(
      buyoutInput,
      times,
      button("Выставить", () => {
        if (kit.owned.length < 2) {
          note = "Нужно оставить одно оружие в руках.";
          redraw();
          return;
        }
        if (!kit.owned.includes(id)) return;
        if (hours === null) {
          note = "Выбери срок лота.";
          redraw();
          return;
        }
        const weapon = weaponById(id);
        const step = listUnique(house, {
          sellerId: ME,
          goods: { kind: "unique", key: id, name: weapon.name, text: weapon.figure },
          buyoutOnly,
          minBid: buyoutOnly ? null : parseMoney(bidInput?.value ?? ""),
          buyout: parseMoney(buyoutInput.value),
          hours,
          now: Date.now(),
        });
        const error = apply(kit, step);
        if (error) {
          note = error;
          redraw();
          return;
        }
        kit.owned = kit.owned.filter((owned) => owned !== id);
        if (kit.weapon === id) kit.weapon = kit.owned[0] ?? kit.weapon;
        sellId = null;
        draftBid = "";
        draftBuyout = "";
        note = "Лот выставлен.";
        tab = "mine";
        redraw();
      }, true),
    );
    return form;
  };

  const bids = (): HTMLElement => {
    const box = column();
    const mine = house.watches.filter((watch) => watch.bidderId === ME);
    if (mine.length === 0) box.append(muted("Ставок нет."));
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
    left.append(heading("Такие же лоты"));
    const own = house.lots.filter((lot) => lot.sellerId === ME);
    const keys = new Set(own.map((lot) => lot.goods.key));
    const peers = house.lots.filter((lot) => keys.has(lot.goods.key));
    if (peers.length === 0) left.append(muted("Сравнивать не с чем."));
    for (const lot of peers) {
      left.append(button(lotLine(toPublic(lot)), () => {
        selectedId = lot.id;
        tab = "browse";
        redraw();
      }, false));
    }
    right.append(heading("Твои лоты"));
    if (own.length === 0) right.append(muted("Лотов нет."));
    for (const lot of own) {
      const label = lot.durationHours === null ? lotLine(toPublic(lot)) : `${lotLine(toPublic(lot))} · ${lot.durationHours} ч`;
      right.append(
        button(`Снять · ${label}`, () => {
          const step = cancelLot(house, lot.id, ME);
          note = apply(kit, step) ?? "Лот снят.";
          redraw();
        }, false),
      );
    }
    wrap.append(left, right);
    return wrap;
  };

  const readDraft = (): void => {
    const bid = document.querySelector<HTMLInputElement>("input[placeholder='Минимальная ставка']");
    const buy = document.querySelector<HTMLInputElement>("input[placeholder='Выкуп'], input[placeholder='Выкуп, можно пустым']");
    if (bid) draftBid = bid.value;
    if (buy) draftBuyout = buy.value;
  };

  redraw();
}

function apply(kit: AuctionKit, step: AuctionStep): string | null {
  if (step.error) return step.error;
  for (const move of step.gold) {
    if (move.id === ME) kit.gold += move.delta;
  }
  for (const item of step.items) {
    if (item.to !== ME || item.goods.kind !== "unique") continue;
    if (!WEAPONS.some((weapon) => weapon.id === item.goods.key)) continue;
    const id = item.goods.key as WeaponId;
    if (!kit.owned.includes(id)) kit.owned.push(id);
  }
  if (!kit.owned.includes(kit.weapon)) kit.weapon = kit.owned[0] ?? kit.weapon;
  return null;
}

function lotLine(lot: PublicLot): string {
  if (lot.goods.kind === "stack") return `${lot.goods.name} · ${lot.goods.count} · ${lot.price}`;
  if (lot.buyoutOnly) return `${lot.goods.name} · выкуп ${lot.price}`;
  const bid = lot.bid === null ? "ставок нет" : `ставка ${lot.bid}`;
  const price = lot.price === null ? "без выкупа" : `выкуп ${lot.price}`;
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
