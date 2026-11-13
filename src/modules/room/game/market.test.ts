import assert from "node:assert/strict";
import { addInstance, freshLoadout } from "../data/instances.ts";
import { bid, buy, cancel, loadMarket, mirrorServerPieces, priceRule, sell, takeGold } from "./market.ts";
import { fakeServer } from "./market-fake.test.ts";

// Паузы между запросами в тесте не нужны.
const realTimeout = globalThis.setTimeout;
globalThis.setTimeout = ((fn: () => void) => realTimeout(fn, 0)) as typeof setTimeout;

const server = fakeServer();
const { client } = server;
const loadout = freshLoadout();
const kit = { gold: 120 };
const rule = await priceRule(client);
assert.deepEqual(rule, { type: "VirtualCurrency", currencyId: "CO" });

// Продажа вещи из мешка: она уходит на сервер с уровнем и сразу в лот, локальная копия пропадает.
const belt = addInstance(loadout, "gear", "belt", 3);
const sold = await sell(client, loadout, kit, rule, { piece: belt, gold: 0, mode: "fixed", price: 40, hours: 24 });
assert.ok(sold.ok, sold.ok ? "" : sold.error);
assert.equal(loadout.items.some((item) => item.id === belt.id), false, "локальная копия должна уйти");
const lot = server.offers.get(sold.ok ? sold.value : "");
assert.equal(lot?.GoodsInstances?.[0]?.Level, 4, "уровень 3 в игре — Level 4 на сервере");
assert.equal(server.inventory.VirtualCurrencies.HONE?.Amount, 0, "HONE весь ушёл на уровень");
assert.equal(loadout.items.some((item) => item.id.startsWith("srv:")), false, "вещь в лоте не лежит в мешке");

// Свой лот виден в «моих», чужих лотов пока нет.
let market = await loadMarket(client);
assert.ok(market.ok);
assert.equal(market.ok && market.value.mine.length, 1);
assert.equal(market.ok && market.value.offers.filter((o) => !o.mine).length, 0);

// Снятие с продажи: вещь возвращается новым экземпляром того же уровня и видна в мешке.
const back = await cancel(client, loadout, sold.ok ? sold.value : "");
assert.ok(back.ok);
const returned = loadout.items.filter((item) => item.id.startsWith("srv:"));
assert.equal(returned.length, 1);
assert.equal(returned[0]?.catalogId, "belt");
assert.equal(returned[0]?.level, 3);

// Серверную вещь можно выставить снова без повторного переноса.
const again = await sell(client, loadout, kit, rule, { piece: returned[0]!, gold: 0, mode: "auction", price: 10, hours: 12 });
assert.ok(again.ok);
assert.equal(loadout.items.some((item) => item.id.startsWith("srv:")), false);

// Покупка чужого лота: токены списаны, вещь с уровнем в мешке.
const foreign = server.addForeignOffer("rib", 5, 70);
market = await loadMarket(client);
assert.ok(market.ok && market.value.offers.some((o) => o.id === foreign && o.level === 5 && o.seller === "Rival"));
const coinsBefore = server.inventory.VirtualCurrencies.CO!.Amount;
const bought = await buy(client, loadout, foreign);
assert.ok(bought.ok);
assert.equal(server.inventory.VirtualCurrencies.CO!.Amount, coinsBefore - 70);
const rib = loadout.items.find((item) => item.catalogId === "rib" && item.id.startsWith("srv:"));
assert.equal(rib?.level, 5);

// Ставка ниже минимальной отклоняется сервером, нормальная проходит.
const auction = server.addForeignOffer("fang", 0, 15, "Auction");
const low = await bid(client, loadout, auction, 5);
assert.equal(low.ok, false);
const fair = await bid(client, loadout, auction, 15);
assert.ok(fair.ok);
market = await loadMarket(client);
assert.ok(market.ok && market.value.bids.some((o) => o.id === auction && o.leading));

// Золото: стопка уходит из мешка на сервер и выставляется, остаток можно вернуть.
const goldLot = await sell(client, loadout, kit, rule, { piece: null, gold: 50, mode: "fixed", price: 30, hours: 24 });
assert.ok(goldLot.ok);
assert.equal(kit.gold, 70);
await cancel(client, loadout, goldLot.ok ? goldLot.value : "");
const taken = await takeGold(client, kit);
assert.ok(taken.ok);
assert.equal(kit.gold, 120);

// Золота больше, чем в мешке, продать нельзя; оружие на рынок не идёт.
const tooMuch = await sell(client, loadout, kit, rule, { piece: null, gold: 999, mode: "fixed", price: 30, hours: 24 });
assert.equal(tooMuch.ok, false);
const sword = loadout.items.find((item) => item.kind === "weapon")!;
const weaponSale = await sell(client, loadout, kit, rule, { piece: sword, gold: 0, mode: "fixed", price: 30, hours: 24 });
assert.equal(weaponSale.ok, false);

// Сверка мешка с сервером не плодит копий.
assert.equal(mirrorServerPieces(client, loadout), false);

globalThis.setTimeout = realTimeout;
console.log("market ok");
