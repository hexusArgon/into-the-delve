import { isOk, type IDosGamesClient } from "@idosgames/core";
import { itemById } from "../data/items.ts";
import { heroAbilityById } from "../data/hero-abilities.ts";
import { addInstance, removeInstance, type InstanceKind, type ItemInstance, type Loadout } from "../data/instances.ts";
import { MARKET_CATALOG, MARKET_GOLD, MARKET_TOKEN, SERVER_PIECE_PREFIX } from "../data/market-ids.ts";

/**
 * Рынок игроков на сервере iDos (client.marketplace). Сервер держит лоты, ставки, эскроу и
 * комиссию. Продать можно только вещь из серверного инвентаря, поэтому вещь из мешка сначала
 * кладётся на сервер скриптом depositGear (scripts/market-cloud-code.js), а её уровень заточки
 * переносится в Level предмета: уровень игры L — это Level L + 1.
 *
 * Серверные вещи видны в мешке как обычные, с id `srv:<экземпляр>`: их можно надеть и продать,
 * но не точить — заточка остаётся в игре. После каждого действия мешок сверяется с инвентарём.
 */

export interface PriceRule {
  /** Тип позиции цены: токен тайтла или виртуальная валюта (в DEV — монеты). */
  type: "CryptoCurrency" | "VirtualCurrency";
  currencyId: string;
}

export interface MarketOffer {
  id: string;
  kind: "Listing" | "Auction";
  catalogId: string;
  /** Штук в лоте: у вещи 1, у золота — размер стопки. */
  amount: number;
  /** Уровень заточки в единицах игры. null — у стопки. */
  level: number | null;
  seller: string;
  mine: boolean;
  /** Цена выкупа лота с фиксированной ценой. */
  price: number | null;
  /** Аукцион: стартовая и текущая ставка, число ставок. */
  startingBid: number | null;
  currentBid: number | null;
  bids: number;
  leading: boolean;
  expiresAt: number | null;
}

export interface MarketState {
  offers: MarketOffer[];
  mine: MarketOffer[];
  bids: MarketOffer[];
  claimables: MarketOffer[];
  /** Золото, лежащее на сервере (куплено или снято с продажи). */
  serverGold: number;
}

export type MarketResult<T> = { ok: true; value: T } | { ok: false; error: string };

const ok = <T,>(value: T): MarketResult<T> => ({ ok: true, value });
const err = <T,>(error: string): MarketResult<T> => ({ ok: false, error });

function failure(result: { ok: false; reason?: string; error?: string | null }): string {
  return result.error || result.reason || "The market did not answer.";
}

/** Уникальный ключ попытки: сервер не выдаст вещь дважды, если вызов повторится после обрыва. */
function requestId(): string {
  try {
    return crypto.randomUUID().replace(/-/g, "");
  } catch {
    return `r${Date.now().toString(36)}${Math.random().toString(36).slice(2, 12)}`;
  }
}

function pause(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Вещь каталога рынка: снаряжение или способность героя. Оружие и неизвестное — null. */
export function marketKind(catalogId: string): InstanceKind | null {
  if (itemById(catalogId)) return "gear";
  if (heroAbilityById(catalogId)) return "ability";
  return null;
}

export function isServerPiece(id: string): boolean {
  return id.startsWith(SERVER_PIECE_PREFIX);
}

export function marketName(catalogId: string): string {
  if (catalogId === MARKET_GOLD) return "Gold";
  return itemById(catalogId)?.name ?? heroAbilityById(catalogId)?.name ?? catalogId;
}

interface ServerPiece {
  instanceId: string;
  catalogId: string;
  kind: InstanceKind;
  level: number;
}

function serverInventory(client: IDosGamesClient): { pieces: ServerPiece[]; gold: number } {
  const inventory = client.data.user.state?.InventoryV2;
  const pieces: ServerPiece[] = [];
  for (const row of Object.values(inventory?.UnstackableItems ?? {})) {
    if (row.CatalogID !== MARKET_CATALOG) continue;
    const kind = marketKind(row.ItemID);
    if (!kind) continue;
    const copies = Math.max(1, row.Quantity ?? 1);
    for (let i = 0; i < copies; i += 1) {
      pieces.push({ instanceId: row.ItemInstanceID, catalogId: row.ItemID, kind, level: Math.max(0, (row.Level ?? 1) - 1) });
    }
  }
  const gold = inventory?.Items?.[MARKET_GOLD]?.StackableAmount ?? 0;
  return { pieces, gold };
}

async function refresh(client: IDosGamesClient): Promise<boolean> {
  const state = await client.user.getClientState();
  return isOk(state);
}

/**
 * Серверные вещи в мешке: добавляются купленные и снятые с продажи, убираются проданные и
 * выставленные. Надетая серверная вещь остаётся надетой, пока её id не сменился.
 */
export function mirrorServerPieces(client: IDosGamesClient, loadout: Loadout): boolean {
  const { pieces } = serverInventory(client);
  const wanted = new Map<string, ServerPiece>();
  for (const piece of pieces) {
    const id = SERVER_PIECE_PREFIX + piece.instanceId;
    if (!wanted.has(id)) wanted.set(id, piece);
  }
  let changed = false;
  for (const item of [...loadout.items]) {
    if (!isServerPiece(item.id)) continue;
    const piece = wanted.get(item.id);
    if (!piece) {
      removeInstance(loadout, item.id);
      changed = true;
      continue;
    }
    if (item.level !== piece.level) {
      item.level = piece.level;
      changed = true;
    }
    wanted.delete(item.id);
  }
  for (const [id, piece] of wanted) {
    loadout.items.push({ id, catalogId: piece.catalogId, kind: piece.kind, level: piece.level });
    changed = true;
  }
  return changed;
}

/** Валюта цены рынка из настроек тайтла. В живой игре это токен, в DEV — то, что там разрешено. */
export async function priceRule(client: IDosGamesClient): Promise<PriceRule> {
  const defs = await client.marketplace.getDefinitions();
  if (isOk(defs)) {
    const rule = defs.data.Definitions?.PricePolicy?.Allowed?.[0];
    // В типах SDK 0.21 у правила нет вида CryptoCurrency, а сервер его присылает.
    const kind = String(rule?.Kind ?? "");
    if (kind === "VirtualCurrency" && rule?.CurrencyID) return { type: "VirtualCurrency", currencyId: rule.CurrencyID };
    if (kind === "CryptoCurrency" && rule?.CurrencyID) return { type: "CryptoCurrency", currencyId: rule.CurrencyID };
  }
  return { type: "CryptoCurrency", currencyId: MARKET_TOKEN };
}

export function balanceOf(client: IDosGamesClient, rule: PriceRule): number {
  if (rule.type === "VirtualCurrency") return client.data.user.getVirtualCurrencyAmount(rule.currencyId);
  const value = Number(client.data.user.getCryptoCurrencyAmount(rule.currencyId));
  return Number.isFinite(value) ? value : 0;
}

/**
 * Кладёт вещь из мешка на сервер и возвращает id её серверного экземпляра. Уже серверная
 * вещь возвращается как есть. Мешок теряет локальную копию только после успеха.
 */
async function toServer(client: IDosGamesClient, loadout: Loadout, piece: ItemInstance): Promise<MarketResult<string>> {
  if (isServerPiece(piece.id)) return ok(piece.id.slice(SERVER_PIECE_PREFIX.length));
  if (piece.kind === "weapon" || !marketKind(piece.catalogId)) return err("Weapons stay in your bag.");
  if (!(await refresh(client))) return err("The market did not answer.");
  const before = new Set(serverInventory(client).pieces.map((p) => p.instanceId));
  const run = await client.cloudCode.execute("depositGear", {
    requestId: requestId(),
    pieces: [{ catalogId: piece.catalogId, level: piece.level }],
  });
  if (!isOk(run)) return err(failure(run));
  if (run.data.Error) return err(run.data.Error.Message ?? run.data.Error.Error ?? "The market refused the piece.");
  if (!(await refresh(client))) return err("The market did not answer.");
  const fresh = serverInventory(client).pieces.find(
    (p) => p.catalogId === piece.catalogId && p.level === 0 && !before.has(p.instanceId),
  );
  if (!fresh) return err("The piece did not reach the market.");
  // Локальная копия уходит сразу: дальше вещь живёт на сервере, даже если уровень не встанет.
  removeInstance(loadout, piece.id);
  if (piece.level > 0) {
    await pause(600);
    const up = await client.item.upgradeLevelsBatch([{ ItemInstanceID: fresh.instanceId, TargetLevel: piece.level + 1 }]);
    if (!isOk(up)) return err(`The piece is on the market at level 0: ${failure(up)}`);
    await refresh(client);
  }
  mirrorServerPieces(client, loadout);
  const placed = serverInventory(client).pieces.find((p) => p.catalogId === piece.catalogId && p.level === piece.level && !before.has(p.instanceId));
  return ok(placed?.instanceId ?? fresh.instanceId);
}

export interface SellRequest {
  piece: ItemInstance | null;
  /** Золото: сколько положить в стопку. Используется, когда piece пустой. */
  gold: number;
  mode: "fixed" | "auction";
  price: number;
  hours: number;
}

export async function sell(client: IDosGamesClient, loadout: Loadout, kit: { gold: number }, rule: PriceRule, request: SellRequest): Promise<MarketResult<string>> {
  const price = Math.floor(request.price);
  if (!(price >= 1)) return err("Name a price of at least 1.");
  if (request.piece) {
    const placed = await toServer(client, loadout, request.piece);
    if (!placed.ok) return placed;
    await pause(600);
    const result =
      request.mode === "fixed"
        ? await client.marketplace.createListing(request.piece.catalogId, MARKET_CATALOG, 1, { Entries: [{ Type: rule.type, CurrencyID: rule.currencyId, Amount: price }] }, request.hours, [placed.value])
        : await client.marketplace.createAuction(request.piece.catalogId, MARKET_CATALOG, 1, rule.type, price, request.hours, {
            bidCurrencyID: rule.currencyId,
            itemInstanceIDs: [placed.value],
          });
    await refresh(client);
    mirrorServerPieces(client, loadout);
    if (!isOk(result)) return err(`${failure(result)} The piece waits in your bag.`);
    return ok(result.data.OfferID ?? "");
  }
  const amount = Math.floor(request.gold);
  if (!(amount >= 1)) return err("Pick how much gold to sell.");
  if (request.mode !== "fixed") return err("Gold sells in stacks at a fixed price.");
  await refresh(client);
  const onServer = serverInventory(client).gold;
  const missing = Math.max(0, amount - onServer);
  if (missing > kit.gold) return err("Not enough gold.");
  if (missing > 0) {
    const run = await client.cloudCode.execute("depositGear", { requestId: requestId(), pieces: [], gold: missing });
    if (!isOk(run)) return err(failure(run));
    if (run.data.Error) return err(run.data.Error.Message ?? "The market refused the gold.");
    kit.gold -= missing;
    await pause(600);
  }
  const result = await client.marketplace.createListing(MARKET_GOLD, MARKET_CATALOG, amount, { Entries: [{ Type: rule.type, CurrencyID: rule.currencyId, Amount: price }] }, request.hours);
  await refresh(client);
  if (!isOk(result)) return err(`${failure(result)} The gold waits on the market; take it back from My lots.`);
  return ok(result.data.OfferID ?? "");
}

function readOffer(view: Record<string, unknown>, me: string): MarketOffer | null {
  const v = view as {
    OfferID?: string | null;
    OfferType?: string | null;
    GoodsItemID?: string | null;
    GoodsAmount?: number | null;
    GoodsInstances?: { Level?: number | null }[] | null;
    CreatorUserID?: string | null;
    CreatorPublicData?: { Username?: string | null } | null;
    Price?: { Entries?: { Amount?: number | null }[] | null } | null;
    Auction?: { StartingBid?: number | null; CurrentBid?: number | null; BidCount?: number | null; CurrentBidderID?: string | null } | null;
    ExpiresAt?: string | null;
  };
  if (!v.OfferID || !v.GoodsItemID) return null;
  if (v.OfferType !== "Listing" && v.OfferType !== "Auction") return null;
  const level = v.GoodsItemID === MARKET_GOLD ? null : Math.max(0, (v.GoodsInstances?.[0]?.Level ?? 1) - 1);
  const expires = v.ExpiresAt ? Date.parse(v.ExpiresAt) : NaN;
  return {
    id: v.OfferID,
    kind: v.OfferType,
    catalogId: v.GoodsItemID,
    amount: v.GoodsAmount ?? 1,
    level,
    seller: v.CreatorPublicData?.Username?.trim() || `Player ${String(v.CreatorUserID ?? "").slice(-4)}`,
    mine: v.CreatorUserID === me,
    price: v.OfferType === "Listing" ? (v.Price?.Entries?.[0]?.Amount ?? null) : null,
    startingBid: v.Auction?.StartingBid ?? null,
    currentBid: v.Auction && (v.Auction.BidCount ?? 0) > 0 ? (v.Auction.CurrentBid ?? null) : null,
    bids: v.Auction?.BidCount ?? 0,
    leading: !!v.Auction?.CurrentBidderID && v.Auction.CurrentBidderID === me,
    expiresAt: Number.isFinite(expires) ? expires : null,
  };
}

/** Всё, что видно на рынке, плюс свои лоты, ставки и то, что пора забрать. */
export async function loadMarket(client: IDosGamesClient): Promise<MarketResult<MarketState>> {
  const me = client.auth.context?.userID ?? "";
  const grouped = await client.marketplace.getGroupedOffers();
  if (!isOk(grouped)) return err(failure(grouped));
  const offers: MarketOffer[] = [];
  for (const group of grouped.data.Groups ?? []) {
    if (group.GoodsCatalogID !== MARKET_CATALOG || !group.GoodsItemID) continue;
    const page = await client.marketplace.getOffersByItem(group.GoodsItemID, undefined, undefined, 30);
    if (!isOk(page)) continue;
    for (const view of page.data.Offers ?? []) {
      const offer = readOffer(view as Record<string, unknown>, me);
      if (offer && (view as { Status?: string }).Status === "Active") offers.push(offer);
    }
  }
  const mineState = await client.marketplace.getMyState("Live", { forceRefresh: true });
  const pick = (list: unknown[] | null | undefined): MarketOffer[] =>
    (list ?? []).map((view) => readOffer(view as Record<string, unknown>, me)).filter((o): o is MarketOffer => o !== null);
  await refresh(client);
  const now = Date.now();
  return ok({
    offers: offers.filter((o) => o.expiresAt === null || o.expiresAt > now).sort((a, b) => (a.expiresAt ?? 0) - (b.expiresAt ?? 0)),
    mine: isOk(mineState) ? pick(mineState.data.MyOffers) : [],
    bids: isOk(mineState) ? pick(mineState.data.MyBids) : [],
    claimables: isOk(mineState) ? pick(mineState.data.Claimables) : [],
    serverGold: serverInventory(client).gold,
  });
}

async function settle<T>(client: IDosGamesClient, loadout: Loadout, call: Promise<{ ok: true; data: T } | { ok: false; reason?: string; error?: string | null }>): Promise<MarketResult<T>> {
  const result = await call;
  await refresh(client);
  mirrorServerPieces(client, loadout);
  return result.ok ? ok(result.data) : err(failure(result));
}

export function buy(client: IDosGamesClient, loadout: Loadout, offerId: string): Promise<MarketResult<unknown>> {
  return settle(client, loadout, client.marketplace.buy(offerId));
}

export function bid(client: IDosGamesClient, loadout: Loadout, offerId: string, amount: number): Promise<MarketResult<unknown>> {
  return settle(client, loadout, client.marketplace.placeBid(offerId, Math.floor(amount)));
}

export function cancel(client: IDosGamesClient, loadout: Loadout, offerId: string): Promise<MarketResult<unknown>> {
  return settle(client, loadout, client.marketplace.cancelListing(offerId));
}

/** Закончившийся аукцион: победитель забирает вещь, продавец — выручку за вычетом комиссии. */
export function claim(client: IDosGamesClient, loadout: Loadout, offerId: string): Promise<MarketResult<unknown>> {
  return settle(client, loadout, client.marketplace.claimAuction(offerId));
}

/** Возвраты перебитых ставок и эскроу истёкших лотов. */
export function claimRefunds(client: IDosGamesClient, loadout: Loadout): Promise<MarketResult<unknown>> {
  return settle(client, loadout, client.marketplace.claimBack());
}

/** Золото с сервера — обратно в мешок. */
export async function takeGold(client: IDosGamesClient, kit: { gold: number }): Promise<MarketResult<number>> {
  await refresh(client);
  const amount = serverInventory(client).gold;
  if (amount <= 0) return err("No gold waits on the market.");
  const run = await client.cloudCode.execute("withdrawGold", { requestId: requestId(), amount });
  if (!isOk(run)) return err(failure(run));
  if (run.data.Error) return err(run.data.Error.Message ?? "The market kept the gold.");
  kit.gold += amount;
  await refresh(client);
  return ok(amount);
}

/** Удобство для экрана: можно ли выставить эту вещь мешка. */
export function sellable(piece: ItemInstance): boolean {
  return piece.kind !== "weapon" && marketKind(piece.catalogId) !== null;
}

/** Оставшееся время лота словами. */
export function timeLeft(expiresAt: number | null, now = Date.now()): string {
  if (expiresAt === null) return "";
  const minutes = Math.max(0, Math.round((expiresAt - now) / 60000));
  if (minutes <= 0) return "ended";
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  return `${hours} h ${minutes % 60} min`;
}

export { addInstance };
