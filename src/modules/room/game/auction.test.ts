import assert from "node:assert/strict";
import {
  buyout,
  buyStack,
  cancelLot,
  createHouse,
  listStack,
  listUnique,
  placeBid,
  settle,
  toPublic,
} from "./auction.ts";

const now = 1_000_000;
const sword = { kind: "unique" as const, key: "sword", name: "Sword", text: "Weapon." };
const axe = { kind: "unique" as const, key: "axe", name: "Axe", text: "Weapon." };

const house = createHouse();
const stack = listStack(house, {
  sellerId: "ann",
  goods: { kind: "stack", key: "oil", name: "Oil", text: "Stack." },
  count: 47,
  unitPrice: 2,
});
assert.equal(stack.error, undefined);
assert.equal(placeBid(house, house.lots[0]!.id, "bob", 3, 10).error, "This lot does not take bids.");

const bought = buyStack(house, house.lots[0]!.id, "bob", 10, 20);
assert.equal(bought.error, undefined);
assert.deepEqual(bought.gold, [
  { id: "bob", delta: -20 },
  { id: "ann", delta: 20 },
]);
assert.equal(bought.items[0]?.goods.kind === "stack" ? bought.items[0].goods.count : 0, 10);
assert.equal(house.lots[0]?.goods.kind === "stack" ? house.lots[0].goods.count : 0, 37);

const listed = listUnique(house, {
  sellerId: "ann",
  goods: sword,
  buyoutOnly: false,
  minBid: 320,
  buyout: 400,
  hours: 48,
  now,
});
assert.equal(listed.error, undefined);
const copy = listUnique(house, {
  sellerId: "ann",
  goods: sword,
  buyoutOnly: false,
  minBid: 10,
  buyout: null,
  hours: 12,
  now,
});
assert.equal(copy.error, undefined);
assert.equal(house.lots.filter((lot) => lot.goods.key === "sword").length, 2);

const lot = house.lots.find((item) => item.goods.key === "sword" && item.minBid === 320)!;
assert.equal("endsAt" in toPublic(lot), false);
assert.equal(placeBid(house, lot.id, "bob", 319, 1000).error, "Bid is below the minimum.");
const first = placeBid(house, lot.id, "bob", 320, 320);
assert.equal(first.error, undefined);
assert.deepEqual(first.gold, [{ id: "bob", delta: -320 }]);
const raised = placeBid(house, lot.id, "cam", 321, 321);
assert.equal(raised.error, undefined);
assert.deepEqual(raised.gold, [
  { id: "bob", delta: 320 },
  { id: "cam", delta: -321 },
]);
assert.equal(house.watches.find((watch) => watch.bidderId === "bob")?.winning, false);
assert.equal(house.watches.find((watch) => watch.bidderId === "cam")?.winning, true);
assert.equal(placeBid(house, lot.id, "ann", 322, 999).error, "You cannot bid on your own lot.");

const only = listUnique(house, {
  sellerId: "ann",
  goods: axe,
  buyoutOnly: true,
  minBid: null,
  buyout: 15,
  hours: 24,
  now,
});
assert.equal(only.error, undefined);
const axeLot = house.lots.find((item) => item.goods.key === "axe")!;
assert.equal(placeBid(house, axeLot.id, "bob", 15, 20).error, "This lot does not take bids.");
const taken = buyout(house, axeLot.id, "bob", 15);
assert.equal(taken.error, undefined);
assert.deepEqual(taken.gold, [
  { id: "bob", delta: -15 },
  { id: "ann", delta: 15 },
]);
assert.equal(house.lots.some((item) => item.id === axeLot.id), false);

const sniped = buyout(house, lot.id, "dee", 400);
assert.equal(sniped.error, undefined);
assert.deepEqual(sniped.gold, [
  { id: "dee", delta: -400 },
  { id: "ann", delta: 400 },
  { id: "cam", delta: 321 },
]);

const quiet = listUnique(house, {
  sellerId: "ann",
  goods: axe,
  buyoutOnly: false,
  minBid: 5,
  buyout: 9,
  hours: 12,
  now,
});
assert.equal(quiet.error, undefined);
const quietLot = house.lots.find((item) => item.goods.key === "axe")!;
placeBid(house, quietLot.id, "bob", 5, 5);
const closed = settle(house, now + 12 * 60 * 60 * 1000);
assert.equal(closed.items.some((item) => item.to === "bob" && item.goods.key === "axe"), true);
assert.equal(closed.gold.some((move) => move.id === "ann" && move.delta === 5), true);

const unsold = listUnique(house, {
  sellerId: "ann",
  goods: sword,
  buyoutOnly: true,
  minBid: null,
  buyout: 3,
  hours: 12,
  now,
});
assert.equal(unsold.error, undefined);
const returned = settle(house, now + 12 * 60 * 60 * 1000);
assert.equal(returned.items.some((item) => item.to === "ann" && item.goods.key === "sword"), true);

const held = listUnique(house, {
  sellerId: "ann",
  goods: sword,
  buyoutOnly: false,
  minBid: 4,
  buyout: 8,
  hours: 24,
  now,
});
assert.equal(held.error, undefined);
const heldLot = house.lots.find((item) => item.minBid === 4)!;
placeBid(house, heldLot.id, "bob", 4, 4);
const pulled = cancelLot(house, heldLot.id, "ann");
assert.deepEqual(pulled.gold, [{ id: "bob", delta: 4 }]);
assert.equal(pulled.items[0]?.to, "ann");
assert.equal(house.lots.some((item) => item.id === heldLot.id), false);

console.log("auction ok");
