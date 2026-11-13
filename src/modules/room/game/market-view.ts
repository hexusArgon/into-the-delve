import type { IDosGamesClient } from "@idosgames/core";
import { enterScreen } from "./transition.ts";
import type { AuctionKit } from "./kit.ts";
import { unworn, type ItemInstance, type Loadout } from "../data/instances.ts";
import { MARKET_GOLD, MARKET_HOURS } from "../data/market-ids.ts";
import {
  balanceOf,
  bid,
  buy,
  cancel,
  claim,
  claimRefunds,
  isServerPiece,
  loadMarket,
  marketName,
  mirrorServerPieces,
  priceRule,
  sell,
  sellable,
  takeGold,
  timeLeft,
  type MarketOffer,
  type MarketResult,
  type MarketState,
  type PriceRule,
} from "./market.ts";

/**
 * Торговый дом: рынок игроков на сервере iDos. Три вкладки — лоты всех игроков, продажа из
 * мешка и свои лоты со ставками. Деньги, вещи и итог каждой сделки держит сервер; экран только
 * показывает его ответ и после каждого действия перечитывает рынок.
 */

export interface MarketArt {
  gold: HTMLCanvasElement;
  items: Readonly<Record<string, HTMLCanvasElement>>;
  abilities: Readonly<Record<string, HTMLCanvasElement>>;
}

export interface MarketScreen {
  host: HTMLElement;
  client: IDosGamesClient;
  kit: AuctionKit;
  loadout: Loadout;
  art: MarketArt;
  onBack: () => void;
  /** Мешок или золото изменились: сохранить. */
  onChange: () => void;
}

type Tab = "market" | "sell" | "mine";
const TOKEN_ICON = "https://cloud.idosgames.com/drive/img/H406PWM7/hard-token.png";

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className = "", text = ""): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text) node.textContent = text;
  return node;
}

function button(label: string, onClick: () => void, primary = false): HTMLButtonElement {
  const node = el("button", primary ? "dungeon-button dungeon-button-primary" : "dungeon-button", label);
  node.type = "button";
  node.addEventListener("click", onClick);
  return node;
}

function icon(art: MarketArt, catalogId: string): HTMLCanvasElement {
  const canvas = el("canvas", "dungeon-lot-icon");
  canvas.width = 96;
  canvas.height = 96;
  const sprite = catalogId === MARKET_GOLD ? art.gold : (art.items[catalogId] ?? art.abilities[catalogId]);
  const ctx = canvas.getContext("2d");
  if (ctx && sprite) {
    const fit = 84 / Math.max(sprite.width, sprite.height);
    const w = sprite.width * fit;
    const h = sprite.height * fit;
    ctx.drawImage(sprite, (96 - w) / 2, (96 - h) / 2, w, h);
  } else if (ctx) {
    // Не у каждой вещи есть иконка в assets/items: карточка не остаётся пустой.
    ctx.strokeStyle = "#6e5830";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(48, 48, 34, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = "#d4bc82";
    ctx.font = "600 36px Palatino Linotype, Palatino, serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(marketName(catalogId).charAt(0).toUpperCase(), 48, 50);
  }
  return canvas;
}

function title(catalogId: string, level: number | null, amount: number): string {
  if (catalogId === MARKET_GOLD) return `Gold ×${amount}`;
  return level && level > 0 ? `${marketName(catalogId)} +${level}` : marketName(catalogId);
}

function priceLine(offer: MarketOffer): string {
  if (offer.kind === "Listing") return `Price ${offer.price ?? "?"}`;
  if (offer.currentBid !== null) return `Bid ${offer.currentBid} · ${offer.bids} bid${offer.bids === 1 ? "" : "s"}`;
  return `Starts at ${offer.startingBid ?? "?"}`;
}

/** Наименьшая ставка, которую примет сервер при шаге ставки в 1. */
function nextBid(offer: MarketOffer): number {
  return offer.currentBid !== null ? offer.currentBid + 1 : (offer.startingBid ?? 1);
}

export function paintMarket(screen: MarketScreen): void {
  const { host, client, kit, loadout, art } = screen;
  let tab: Tab = "market";
  let state: MarketState | null = null;
  let rule: PriceRule | null = null;
  let picked: string | null = null;
  let sellPick: string | null = null;
  let mode: "fixed" | "auction" = "fixed";
  let hours: number = MARKET_HOURS[1];
  let draftPrice = "";
  let draftGold = "";
  let draftBid = "";
  let note = "Loading the market.";
  let busy = false;

  const reload = async (): Promise<void> => {
    rule ??= await priceRule(client);
    const loaded = await loadMarket(client);
    if (loaded.ok) state = loaded.value;
    else note = loaded.error;
    if (mirrorServerPieces(client, loadout)) screen.onChange();
  };

  /** Одно действие за раз: кнопки молчат, пока сервер отвечает. */
  const act = async (label: string, run: () => Promise<MarketResult<unknown>>, done: string): Promise<void> => {
    if (busy) return;
    busy = true;
    note = label;
    paint();
    try {
      const result = await run();
      note = result.ok ? done : result.error;
      screen.onChange();
      await reload();
    } finally {
      busy = false;
      paint();
    }
  };

  const paint = (): void => {
    host.replaceChildren();
    host.className = "dungeon";
    host.style.display = "flex";
    host.style.flexDirection = "column";
    host.style.height = "100%";
    host.style.overflow = "auto";
    enterScreen(host, "market");

    const page = el("div", "dungeon-auction");
    const head = el("div", "dungeon-auction-head");
    head.append(button("Back", screen.onBack), el("h1", "dungeon-title", "Trading House"));
    const purse = el("div", "dungeon-purse");
    if (rule?.type === "CryptoCurrency") {
      const coin = el("img", "dungeon-purse-coin");
      coin.src = TOKEN_ICON;
      coin.alt = "";
      purse.append(coin);
    }
    const balance = rule ? balanceOf(client, rule) : null;
    purse.append(el("span", "", balance === null ? "…" : `${formatAmount(balance)}${rule?.type === "VirtualCurrency" ? ` ${rule.currencyId}` : ""}`));
    head.append(purse);
    const tabs = el("div", "dungeon-auction-tabs");
    const claims = state?.claimables.length ?? 0;
    for (const [id, label] of [
      ["market", "Market"],
      ["sell", "Sell"],
      ["mine", claims > 0 ? `My lots (${claims})` : "My lots"],
    ] as const) {
      const tabButton = button(label, () => {
        tab = id;
        paint();
      }, tab === id);
      tabs.append(tabButton);
    }
    head.append(tabs);
    page.append(head, el("div", "dungeon-auction-note", note));
    const body = el("div", "dungeon-auction-body");
    if (state && rule) body.append(tab === "market" ? marketBoard(state) : tab === "sell" ? sellBoard(rule) : mineBoard(state));
    page.append(body);
    host.append(page);
  };

  const board = (left: HTMLElement, right: HTMLElement): HTMLElement => {
    const grid = el("div", "dungeon-auction-board");
    grid.append(left, right);
    return grid;
  };

  const lotCard = (catalogId: string, name: string, line: string, isPicked: boolean, onPick: () => void, tone = ""): HTMLElement => {
    const card = el("button", `dungeon-lot${isPicked ? " is-picked" : ""}${tone ? ` ${tone}` : ""}`);
    card.type = "button";
    card.append(icon(art, catalogId), el("div", "dungeon-lot-name", name), el("div", "dungeon-lot-price", line));
    card.addEventListener("click", onPick);
    return card;
  };

  const marketBoard = (data: MarketState): HTMLElement => {
    const list = el("div", "dungeon-panel");
    list.append(el("h2", "dungeon-heading", "Lots of other players"));
    const lots = el("div", "dungeon-lots");
    const others = data.offers.filter((offer) => !offer.mine);
    if (others.length === 0) lots.append(el("p", "", "No lots yet. Be the first to sell."));
    for (const offer of others) {
      lots.append(
        lotCard(offer.catalogId, title(offer.catalogId, offer.level, offer.amount), priceLine(offer), picked === offer.id, () => {
          picked = offer.id;
          draftBid = "";
          paint();
        }, offer.leading ? "is-winning" : ""),
      );
    }
    list.append(lots);
    const detail = el("div", "dungeon-panel dungeon-auction-detail");
    const offer = others.find((item) => item.id === picked) ?? null;
    if (!offer) {
      detail.append(el("h2", "dungeon-heading", "Pick a lot"), el("p", "", "Fixed-price lots sell at once. Auctions go to the highest bid when time runs out."));
      return board(list, detail);
    }
    detail.append(
      el("h2", "dungeon-heading", title(offer.catalogId, offer.level, offer.amount)),
      icon(art, offer.catalogId),
      el("p", "", `Seller: ${offer.seller}`),
      el("p", "", priceLine(offer)),
      el("p", "", `Ends in ${timeLeft(offer.expiresAt)}`),
    );
    if (offer.kind === "Listing") {
      detail.append(button(busy ? "…" : `Buy for ${offer.price}`, () => void act("Buying.", () => buy(client, loadout, offer.id), "Bought. The piece is in your bag."), true));
    } else {
      const min = nextBid(offer);
      const input = el("input");
      input.type = "number";
      input.min = String(min);
      input.placeholder = `At least ${min}`;
      input.value = draftBid;
      input.className = "dungeon-input";
      input.addEventListener("input", () => {
        draftBid = input.value;
      });
      if (offer.leading) detail.append(el("p", "", "Your bid leads."));
      detail.append(
        input,
        button("Place bid", () => {
          const amount = Number(draftBid || min);
          void act("Placing the bid.", () => bid(client, loadout, offer.id, amount), "Bid placed. An outbid bid comes back to you.");
        }, true),
      );
    }
    return board(list, detail);
  };

  const sellBoard = (price: PriceRule): HTMLElement => {
    const list = el("div", "dungeon-panel");
    list.append(el("h2", "dungeon-heading", "From your bag"));
    const lots = el("div", "dungeon-lots");
    const pieces = unworn(loadout).filter(sellable);
    if (kit.gold > 0) {
      lots.append(lotCard(MARKET_GOLD, `Gold ×${kit.gold}`, "Sells in a stack", sellPick === MARKET_GOLD, () => {
        sellPick = MARKET_GOLD;
        mode = "fixed";
        paint();
      }));
    }
    for (const piece of pieces) {
      lots.append(lotCard(piece.catalogId, title(piece.catalogId, piece.level, 1), isServerPiece(piece.id) ? "Bought on the market" : "In your bag", sellPick === piece.id, () => {
        sellPick = piece.id;
        paint();
      }));
    }
    if (pieces.length === 0 && kit.gold <= 0) lots.append(el("p", "", "Nothing to sell. Worn pieces and weapons stay with you."));
    list.append(lots);

    const detail = el("div", "dungeon-panel dungeon-auction-detail");
    const piece: ItemInstance | null = sellPick && sellPick !== MARKET_GOLD ? (pieces.find((item) => item.id === sellPick) ?? null) : null;
    const gold = sellPick === MARKET_GOLD;
    if (!piece && !gold) {
      detail.append(el("h2", "dungeon-heading", "Pick something to sell"), el("p", "", "The piece leaves your bag for the market. Sharpening carries over."));
      return board(list, detail);
    }
    detail.append(el("h2", "dungeon-heading", piece ? title(piece.catalogId, piece.level, 1) : "Gold"), icon(art, piece ? piece.catalogId : MARKET_GOLD));
    if (piece) {
      const modes = el("div", "dungeon-auction-tabs");
      modes.append(
        button("Fixed price", () => {
          mode = "fixed";
          paint();
        }, mode === "fixed"),
        button("Auction", () => {
          mode = "auction";
          paint();
        }, mode === "auction"),
      );
      detail.append(modes);
    } else {
      const amount = el("input");
      amount.type = "number";
      amount.min = "1";
      amount.max = String(kit.gold);
      amount.placeholder = `Gold, up to ${kit.gold}`;
      amount.value = draftGold;
      amount.className = "dungeon-input";
      amount.addEventListener("input", () => {
        draftGold = amount.value;
      });
      detail.append(amount);
    }
    const value = el("input");
    value.type = "number";
    value.min = "1";
    value.placeholder = mode === "auction" ? "Starting bid" : piece ? "Price" : "Price for the stack";
    value.value = draftPrice;
    value.className = "dungeon-input";
    value.addEventListener("input", () => {
      draftPrice = value.value;
    });
    const durations = el("div", "dungeon-auction-tabs");
    for (const h of MARKET_HOURS) {
      durations.append(button(`${h} h`, () => {
        hours = h;
        paint();
      }, hours === h));
    }
    detail.append(
      value,
      durations,
      el("p", "", price.type === "CryptoCurrency" ? "Paid in Into the Delve tokens. The trade fee is taken from the sale." : `Paid in ${price.currencyId}.`),
      button("Put on the market", () => {
        const request = { piece, gold: Number(draftGold), mode, price: Number(draftPrice), hours };
        void act("Putting it on the market.", () => sell(client, loadout, kit, price, request), "On the market.").then(() => {
          sellPick = null;
          draftPrice = "";
          draftGold = "";
          paint();
        });
      }, true),
    );
    return board(list, detail);
  };

  const mineBoard = (data: MarketState): HTMLElement => {
    const list = el("div", "dungeon-panel");
    const lots = el("div", "dungeon-lots");
    list.append(el("h2", "dungeon-heading", "Your lots and bids"));
    for (const offer of data.claimables) {
      const card = lotCard(offer.catalogId, title(offer.catalogId, offer.level, offer.amount), "Auction ended", false, () => undefined, "is-winning");
      card.append(button("Claim", () => void act("Claiming.", () => claim(client, loadout, offer.id), "Claimed."), true));
      lots.append(card);
    }
    for (const offer of data.mine) {
      const card = lotCard(offer.catalogId, title(offer.catalogId, offer.level, offer.amount), `${priceLine(offer)} · ${timeLeft(offer.expiresAt)}`, false, () => undefined);
      if (offer.kind === "Listing" || offer.bids === 0) {
        card.append(button("Take back", () => void act("Taking the lot back.", () => cancel(client, loadout, offer.id), "The lot is back with you.")));
      }
      lots.append(card);
    }
    for (const offer of data.bids) {
      lots.append(
        lotCard(offer.catalogId, title(offer.catalogId, offer.level, offer.amount), offer.leading ? "Your bid leads" : "Outbid", false, () => undefined, offer.leading ? "is-winning" : "is-losing"),
      );
    }
    if (data.claimables.length + data.mine.length + data.bids.length === 0) lots.append(el("p", "", "No lots and no bids."));
    list.append(lots);

    const detail = el("div", "dungeon-panel dungeon-auction-detail");
    detail.append(
      el("h2", "dungeon-heading", "Returns"),
      el("p", "", "Outbid bids and lots that ran out of time come back here."),
      button("Collect returns", () => void act("Collecting.", () => claimRefunds(client, loadout), "Returns collected.")),
    );
    if (data.serverGold > 0) {
      detail.append(
        el("p", "", `Gold waiting on the market: ${data.serverGold}.`),
        button("Take gold to bag", () => void act("Taking the gold.", () => takeGold(client, kit), "The gold is in your bag."), true),
      );
    }
    return board(list, detail);
  };

  paint();
  void reload().then(() => {
    note = "";
    paint();
  });
}

function formatAmount(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(2);
}

/**
 * Торговый дом без сессии iDos (локальный запуск без входа): рынок живёт на сервере,
 * поэтому без входа торговать нечем.
 */
export function paintMarketClosed(host: HTMLElement, onBack: () => void): void {
  host.replaceChildren();
  host.className = "dungeon";
  host.style.display = "flex";
  host.style.flexDirection = "column";
  host.style.height = "100%";
  host.style.overflow = "auto";
  enterScreen(host, "market");

  const page = el("div", "dungeon-guild");
  page.append(
    el("h1", "dungeon-title", "Trading House"),
    el("p", "dungeon-guild-lead", "The player market lives on the server."),
    el("p", "dungeon-guild-lead", "Sign in to trade with other players. Your gear and tokens are untouched."),
  );
  const back = button("Back", onBack);
  back.classList.add("dungeon-back");
  host.append(back, page);
}
