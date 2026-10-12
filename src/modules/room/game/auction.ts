/** Сроки лота из разбора аукциона: 12, 24 и 48 часов. */
export const LOT_HOURS = [12, 24, 48] as const;

export type LotHours = (typeof LOT_HOURS)[number];

export type UniqueGoods = { kind: "unique"; key: string; name: string; text: string };

export type StackGoods = { kind: "stack"; key: string; name: string; text: string; count: number };

export type Goods = UniqueGoods | StackGoods;

export interface Lot {
  id: string;
  sellerId: string;
  goods: Goods;
  /** Уникальная вещь без ставок: только выкуп. На стопку ставки нет всегда. */
  buyoutOnly: boolean;
  /** Пол, с которого начинаются ставки. На стопке и в режиме выкупа пусто. */
  minBid: number | null;
  /** Выкуп уникальной вещи или цена одной штуки в стопке. */
  price: number | null;
  /** Только у продавца. Покупатель это поле не получает. */
  durationHours: LotHours | null;
  /** Только для расчёта конца. В окно покупателя не попадает. */
  endsAt: number | null;
  bid: number | null;
  bidderId: string | null;
}

export interface Watch {
  lotId: string;
  bidderId: string;
  winning: boolean;
}

export interface House {
  nextId: number;
  lots: Lot[];
  watches: Watch[];
}

export interface GoldMove {
  id: string;
  delta: number;
}

export interface ItemMove {
  to: string;
  goods: Goods;
}

export interface AuctionStep {
  error?: string;
  gold: GoldMove[];
  items: ItemMove[];
}

/** Лот так, как его видит покупатель: без срока и без момента конца. */
export interface PublicLot {
  id: string;
  sellerId: string;
  goods: Goods;
  buyoutOnly: boolean;
  minBid: number | null;
  price: number | null;
  bid: number | null;
  bidderId: string | null;
}

const HOUR_MS = 60 * 60 * 1000;

export function createHouse(): House {
  return { nextId: 1, lots: [], watches: [] };
}

export function toPublic(lot: Lot): PublicLot {
  return {
    id: lot.id,
    sellerId: lot.sellerId,
    goods: lot.goods.kind === "stack" ? { ...lot.goods } : { ...lot.goods },
    buyoutOnly: lot.buyoutOnly,
    minBid: lot.minBid,
    price: lot.price,
    bid: lot.bid,
    bidderId: lot.bidderId,
  };
}

export function listUnique(
  house: House,
  input: {
    sellerId: string;
    goods: UniqueGoods;
    buyoutOnly: boolean;
    minBid: number | null;
    buyout: number | null;
    hours: LotHours;
    now: number;
  },
): AuctionStep {
  if (!LOT_HOURS.includes(input.hours)) return fail("Выбери срок лота.");
  if (input.buyoutOnly) {
    if (!whole(input.buyout)) return fail("Нужна цена выкупа.");
    pushLot(house, {
      sellerId: input.sellerId,
      goods: { ...input.goods },
      buyoutOnly: true,
      minBid: null,
      price: input.buyout,
      durationHours: input.hours,
      endsAt: input.now + input.hours * HOUR_MS,
      bid: null,
      bidderId: null,
    });
    return ok();
  }
  if (!whole(input.minBid)) return fail("Нужна минимальная ставка.");
  if (input.buyout !== null && (!whole(input.buyout) || input.buyout < input.minBid)) {
    return fail("Выкуп не ниже минимальной ставки.");
  }
  pushLot(house, {
    sellerId: input.sellerId,
    goods: { ...input.goods },
    buyoutOnly: false,
    minBid: input.minBid,
    price: input.buyout,
    durationHours: input.hours,
    endsAt: input.now + input.hours * HOUR_MS,
    bid: null,
    bidderId: null,
  });
  return ok();
}

export function listStack(
  house: House,
  input: { sellerId: string; goods: Omit<StackGoods, "count">; count: number; unitPrice: number },
): AuctionStep {
  if (!Number.isInteger(input.count) || input.count < 1) return fail("Нужно количество.");
  if (!whole(input.unitPrice)) return fail("Нужна цена.");
  pushLot(house, {
    sellerId: input.sellerId,
    goods: { ...input.goods, kind: "stack", count: input.count },
    buyoutOnly: true,
    minBid: null,
    price: input.unitPrice,
    durationHours: null,
    endsAt: null,
    bid: null,
    bidderId: null,
  });
  return ok();
}

export function placeBid(house: House, lotId: string, bidderId: string, amount: number, purse: number): AuctionStep {
  const lot = openLot(house, lotId);
  if (!lot) return fail("Лот уже закрыт.");
  if (lot.goods.kind === "stack" || lot.buyoutOnly) return fail("На этот лот ставку поставить нельзя.");
  if (bidderId === lot.sellerId) return fail("На свой лот ставку поставить нельзя.");
  if (!whole(amount)) return fail("Нужна сумма ставки.");
  if (lot.minBid !== null && amount < lot.minBid) return fail("Ставка ниже минимума.");
  if (lot.bid !== null && amount < lot.bid + 1) return fail("Ставка должна перебить текущую.");
  if (lot.price !== null && amount >= lot.price) return fail("Такая сумма уже равна выкупу.");
  const escrow = lot.bidderId === bidderId ? (lot.bid ?? 0) : 0;
  if (purse + escrow < amount) return fail("Не хватает золота.");
  const gold: GoldMove[] = [];
  if (lot.bidderId && lot.bid !== null && lot.bidderId !== bidderId) {
    gold.push({ id: lot.bidderId, delta: lot.bid });
    markWatch(house, lot.id, lot.bidderId, false);
  }
  gold.push({ id: bidderId, delta: -(amount - escrow) });
  lot.bid = amount;
  lot.bidderId = bidderId;
  markWatch(house, lot.id, bidderId, true);
  return { gold, items: [] };
}

export function buyout(house: House, lotId: string, buyerId: string, purse: number): AuctionStep {
  const lot = openLot(house, lotId);
  if (!lot) return fail("Лот уже закрыт.");
  if (lot.goods.kind !== "unique") return fail("Стопка покупается по количеству.");
  if (lot.price === null) return fail("Выкупа нет.");
  if (buyerId === lot.sellerId) return fail("Свой лот выкупить нельзя.");
  if (purse < lot.price) return fail("Не хватает золота.");
  const gold: GoldMove[] = [
    { id: buyerId, delta: -lot.price },
    { id: lot.sellerId, delta: lot.price },
  ];
  if (lot.bidderId && lot.bid !== null) gold.push({ id: lot.bidderId, delta: lot.bid });
  const items: ItemMove[] = [{ to: buyerId, goods: lot.goods }];
  dropLot(house, lot.id);
  return { gold, items };
}

export function buyStack(house: House, lotId: string, buyerId: string, count: number, purse: number): AuctionStep {
  const lot = openLot(house, lotId);
  if (!lot || lot.goods.kind !== "stack" || lot.price === null) return fail("Это не стопка.");
  if (buyerId === lot.sellerId) return fail("Свой лот купить нельзя.");
  if (!Number.isInteger(count) || count < 1 || count > lot.goods.count) return fail("Такого количества нет.");
  const cost = count * lot.price;
  if (purse < cost) return fail("Не хватает золота.");
  const goods: StackGoods = { ...lot.goods, count };
  lot.goods.count -= count;
  if (lot.goods.count === 0) dropLot(house, lot.id);
  return {
    gold: [
      { id: buyerId, delta: -cost },
      { id: lot.sellerId, delta: cost },
    ],
    items: [{ to: buyerId, goods }],
  };
}

export function cancelLot(house: House, lotId: string, sellerId: string): AuctionStep {
  const lot = openLot(house, lotId);
  if (!lot) return fail("Лот уже закрыт.");
  if (lot.sellerId !== sellerId) return fail("Снять можно только свой лот.");
  const gold: GoldMove[] = [];
  if (lot.bidderId && lot.bid !== null) gold.push({ id: lot.bidderId, delta: lot.bid });
  const items: ItemMove[] = [{ to: sellerId, goods: cloneGoods(lot.goods) }];
  dropLot(house, lot.id);
  return { gold, items };
}

/** Закрывает лоты, у которых вышел срок. Стопки срока не имеют. */
export function settle(house: House, now: number): AuctionStep {
  const gold: GoldMove[] = [];
  const items: ItemMove[] = [];
  for (const lot of [...house.lots]) {
    if (lot.endsAt === null || lot.endsAt > now) continue;
    if (lot.bidderId && lot.bid !== null) {
      gold.push({ id: lot.sellerId, delta: lot.bid });
      items.push({ to: lot.bidderId, goods: cloneGoods(lot.goods) });
    } else {
      items.push({ to: lot.sellerId, goods: cloneGoods(lot.goods) });
    }
    dropLot(house, lot.id);
  }
  return { gold, items };
}

function pushLot(house: House, lot: Omit<Lot, "id">): void {
  house.lots.push({ ...lot, id: `lot-${house.nextId}` });
  house.nextId += 1;
}

function openLot(house: House, id: string): Lot | undefined {
  return house.lots.find((lot) => lot.id === id);
}

function dropLot(house: House, id: string): void {
  house.lots = house.lots.filter((lot) => lot.id !== id);
  house.watches = house.watches.filter((watch) => watch.lotId !== id);
}

function markWatch(house: House, lotId: string, bidderId: string, winning: boolean): void {
  const found = house.watches.find((watch) => watch.lotId === lotId && watch.bidderId === bidderId);
  if (found) found.winning = winning;
  else house.watches.push({ lotId, bidderId, winning });
}

function cloneGoods(goods: Goods): Goods {
  return goods.kind === "stack" ? { ...goods } : { ...goods };
}

function whole(value: number | null): value is number {
  return value !== null && Number.isInteger(value) && value >= 1;
}

function fail(error: string): AuctionStep {
  return { error, gold: [], items: [] };
}

function ok(): AuctionStep {
  return { gold: [], items: [] };
}
