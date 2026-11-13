/**
 * Поддельный сервер iDos для тестов рынка. Повторяет то, что показал живой DEV-тайтл:
 * depositGear выдаёт предмет с Level 1 и HONE, улучшение тратит HONE, лот уводит экземпляр
 * в эскроу, снятый с продажи предмет возвращается с НОВЫМ id и тем же Level.
 * Сам по себе тестов не содержит: его подключает market.test.ts.
 */
import type { IDosGamesClient } from "@idosgames/core";

type Ok<T> = { ok: true; data: T };
type Fail = { ok: false; reason: string; error: string };
const ok = <T,>(data: T): Ok<T> => ({ ok: true, data });
const fail = (error: string): Fail => ({ ok: false, reason: "server", error });

interface Instance {
  ItemInstanceID: string;
  ItemID: string;
  CatalogID: string;
  Quantity: number;
  Level: number;
  AcquiredAt: string;
}

interface Offer {
  OfferID: string;
  OfferType: "Listing" | "Auction";
  Status: string;
  CreatorUserID: string;
  CreatorPublicData: { Username: string };
  GoodsType: "Item";
  GoodsCatalogID: string;
  GoodsItemID: string;
  GoodsAmount: number;
  GoodsInstances?: Instance[];
  Price?: { Entries: { Type: string; CurrencyID: string; Amount: number }[] };
  Auction?: { StartingBid: number; CurrentBid: number; BidCount: number; CurrentBidderID?: string };
  ExpiresAt: string;
}

export interface FakeServer {
  client: IDosGamesClient;
  me: string;
  inventory: {
    UnstackableItems: Record<string, Instance>;
    Items: Record<string, { StackableAmount: number; UnstackableAmount: number; TotalAmount: number }>;
    VirtualCurrencies: Record<string, { Amount: number }>;
  };
  offers: Map<string, Offer>;
  /** Лот другого игрока, чтобы было что купить. */
  addForeignOffer(itemId: string, level: number, price: number, kind?: "Listing" | "Auction"): string;
}

export function fakeServer(): FakeServer {
  const me = "ME-DEV";
  let next = 1;
  const id = (): string => `x${next++}`;
  const inventory: FakeServer["inventory"] = {
    UnstackableItems: {},
    Items: {},
    VirtualCurrencies: { CO: { Amount: 1000 }, HONE: { Amount: 0 } },
  };
  const offers = new Map<string, Offer>();
  const later = new Date(Date.now() + 24 * 3600 * 1000).toISOString();

  const total = (itemId: string, delta: number, stack: boolean): void => {
    const row = (inventory.Items[itemId] ??= { StackableAmount: 0, UnstackableAmount: 0, TotalAmount: 0 });
    if (stack) row.StackableAmount += delta;
    else row.UnstackableAmount += delta;
    row.TotalAmount += delta;
  };
  const grantPiece = (itemId: string, level = 1): Instance => {
    const inst = { ItemInstanceID: id(), ItemID: itemId, CatalogID: "gear", Quantity: 1, Level: level, AcquiredAt: new Date().toISOString() };
    inventory.UnstackableItems[inst.ItemInstanceID] = inst;
    total(itemId, 1, false);
    return inst;
  };
  const takePiece = (instanceId: string): Instance | null => {
    const inst = inventory.UnstackableItems[instanceId];
    if (!inst) return null;
    delete inventory.UnstackableItems[instanceId];
    total(inst.ItemID, -1, false);
    return inst;
  };

  const client = {
    auth: { context: { userID: me } },
    data: {
      user: {
        get state() {
          return { InventoryV2: inventory };
        },
        getVirtualCurrencyAmount: (c: string) => inventory.VirtualCurrencies[c]?.Amount ?? 0,
        getCryptoCurrencyAmount: () => "0",
      },
    },
    user: { getClientState: async () => ok({}) },
    cloudCode: {
      execute: async (name: string, args: { pieces?: { catalogId: string; level: number }[]; gold?: number; amount?: number }) => {
        if (name === "depositGear") {
          for (const piece of args.pieces ?? []) {
            grantPiece(piece.catalogId);
            inventory.VirtualCurrencies.HONE!.Amount += piece.level;
          }
          if (args.gold) total("gold", args.gold, true);
          return ok({ FunctionResult: { ok: true } });
        }
        if (name === "withdrawGold") {
          const have = inventory.Items.gold?.StackableAmount ?? 0;
          if ((args.amount ?? 0) > have) return ok({ Error: { Error: "JavaScriptException", Message: "not enough gold" } });
          total("gold", -(args.amount ?? 0), true);
          return ok({ FunctionResult: { gold: args.amount } });
        }
        return ok({ Error: { Error: "HandlerNotFound" } });
      },
    },
    item: {
      upgradeLevelsBatch: async (ups: { ItemInstanceID: string; TargetLevel: number }[]) => {
        for (const up of ups) {
          const inst = inventory.UnstackableItems[up.ItemInstanceID];
          if (!inst) return fail("Instance not found");
          const cost = up.TargetLevel - inst.Level;
          if (inventory.VirtualCurrencies.HONE!.Amount < cost) return fail("Not enough HONE");
          inventory.VirtualCurrencies.HONE!.Amount -= cost;
          inst.Level = up.TargetLevel;
        }
        return ok([]);
      },
    },
    marketplace: {
      getDefinitions: async () => ok({ Definitions: { PricePolicy: { Allowed: [{ Kind: "VirtualCurrency", CurrencyID: "CO" }] } } }),
      getGroupedOffers: async () => {
        const ids = new Set([...offers.values()].filter((o) => o.Status === "Active").map((o) => o.GoodsItemID));
        return ok({ Groups: [...ids].map((itemId) => ({ GoodsType: "Item", GoodsCatalogID: "gear", GoodsItemID: itemId })) });
      },
      getOffersByItem: async (itemId: string) => ok({ Offers: [...offers.values()].filter((o) => o.GoodsItemID === itemId) }),
      getMyState: async () =>
        ok({
          MyOffers: [...offers.values()].filter((o) => o.CreatorUserID === me && o.Status === "Active"),
          MyBids: [...offers.values()].filter((o) => o.Auction?.CurrentBidderID === me && o.Status === "Active"),
          Claimables: [],
        }),
      createListing: async (itemId: string, _catalog: string, amount: number, price: Offer["Price"], _hours: number, instanceIds?: string[]) => {
        const offer: Offer = { OfferID: id(), OfferType: "Listing", Status: "Active", CreatorUserID: me, CreatorPublicData: { Username: "me" }, GoodsType: "Item", GoodsCatalogID: "gear", GoodsItemID: itemId, GoodsAmount: amount, Price: price, ExpiresAt: later };
        if (instanceIds?.length) {
          const inst = takePiece(instanceIds[0]!);
          if (!inst) return fail("Instance not found");
          offer.GoodsInstances = [inst];
        } else {
          if ((inventory.Items[itemId]?.StackableAmount ?? 0) < amount) return fail("Not enough goods");
          total(itemId, -amount, true);
        }
        offers.set(offer.OfferID, offer);
        return ok({ OfferID: offer.OfferID, Offer: offer });
      },
      createAuction: async (itemId: string, _catalog: string, _amount: number, _axis: string, startingBid: number, _hours: number, opts: { itemInstanceIDs?: string[] }) => {
        const inst = takePiece(opts.itemInstanceIDs?.[0] ?? "");
        if (!inst) return fail("Instance not found");
        const offer: Offer = { OfferID: id(), OfferType: "Auction", Status: "Active", CreatorUserID: me, CreatorPublicData: { Username: "me" }, GoodsType: "Item", GoodsCatalogID: "gear", GoodsItemID: itemId, GoodsAmount: 1, GoodsInstances: [inst], Auction: { StartingBid: startingBid, CurrentBid: 0, BidCount: 0 }, ExpiresAt: later };
        offers.set(offer.OfferID, offer);
        return ok({ OfferID: offer.OfferID, Offer: offer });
      },
      buy: async (offerId: string) => {
        const offer = offers.get(offerId);
        if (!offer || offer.Status !== "Active" || offer.OfferType !== "Listing") return fail("Offer not found.");
        if (offer.CreatorUserID === me) return fail("Cannot buy your own offer.");
        const price = offer.Price!.Entries[0]!.Amount;
        if (inventory.VirtualCurrencies.CO!.Amount < price) return fail("Not enough CO");
        inventory.VirtualCurrencies.CO!.Amount -= price;
        offer.Status = "Completed";
        if (offer.GoodsInstances?.[0]) grantPiece(offer.GoodsItemID, offer.GoodsInstances[0].Level);
        else total(offer.GoodsItemID, offer.GoodsAmount, true);
        return ok({ OfferID: offerId, Status: "Completed" });
      },
      placeBid: async (offerId: string, amount: number) => {
        const offer = offers.get(offerId);
        if (!offer?.Auction || offer.CreatorUserID === me) return fail("Cannot bid.");
        const min = offer.Auction.BidCount > 0 ? offer.Auction.CurrentBid + 1 : offer.Auction.StartingBid;
        if (amount < min) return fail(`Bid must be at least ${min}.`);
        inventory.VirtualCurrencies.CO!.Amount -= amount;
        offer.Auction.CurrentBid = amount;
        offer.Auction.BidCount += 1;
        offer.Auction.CurrentBidderID = me;
        return ok({ OfferID: offerId, CurrentBid: amount });
      },
      cancelListing: async (offerId: string) => {
        const offer = offers.get(offerId);
        if (!offer || offer.CreatorUserID !== me || offer.Status !== "Active") return fail("Offer not found.");
        offer.Status = "Cancelled";
        // Как на живом сервере: вещь возвращается новым экземпляром с тем же уровнем.
        if (offer.GoodsInstances?.[0]) grantPiece(offer.GoodsItemID, offer.GoodsInstances[0].Level);
        else total(offer.GoodsItemID, offer.GoodsAmount, true);
        return ok({ OfferID: offerId, Status: "Cancelled" });
      },
      claimAuction: async () => ok({}),
      claimBack: async () => ok({}),
    },
  } as unknown as IDosGamesClient;

  return {
    client,
    me,
    inventory,
    offers,
    addForeignOffer(itemId, level, price, kind = "Listing") {
      const offer: Offer = {
        OfferID: id(),
        OfferType: kind,
        Status: "Active",
        CreatorUserID: "OTHER",
        CreatorPublicData: { Username: "Rival" },
        GoodsType: "Item",
        GoodsCatalogID: "gear",
        GoodsItemID: itemId,
        GoodsAmount: 1,
        GoodsInstances: [{ ItemInstanceID: id(), ItemID: itemId, CatalogID: "gear", Quantity: 1, Level: level + 1, AcquiredAt: "" }],
        ExpiresAt: later,
      };
      if (kind === "Listing") offer.Price = { Entries: [{ Type: "VirtualCurrency", CurrencyID: "CO", Amount: price }] };
      else offer.Auction = { StartingBid: price, CurrentBid: 0, BidCount: 0 };
      offers.set(offer.OfferID, offer);
      return offer.OfferID;
    },
  };
}
