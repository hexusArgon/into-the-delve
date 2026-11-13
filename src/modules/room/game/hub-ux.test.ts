import assert from "node:assert/strict";
import { addInstance, freshLoadout, SHARPEN_RATE } from "../data/instances.ts";
import { itemById } from "../data/items.ts";
import { equipDiff, pieceScore, swapFor } from "./compare.ts";
import { feeOf, sellerNet } from "./market-fee.ts";
import { nextLevelLines } from "./hone-preview.ts";
import { freshCount, isFresh, markFresh, seeFresh } from "./fresh.ts";
import { knockScale, reduceMotion, setReduceMotion, setShakeSetting, shakeScale } from "./comfort.ts";

// Сравнение: пустой слот — чистая прибавка.
const bag = freshLoadout("sword");
bag.worn = bag.worn.map(() => null);
const belt = bag.items.find((item) => item.catalogId === "belt");
assert.ok(belt);
const open = equipDiff(bag, belt);
assert.ok(open);
assert.equal(open.swap.replaces, null);
assert.equal(open.changes.length, 1);
assert.equal(open.changes[0]?.key, "maxHp");
assert.ok((open.changes[0]?.delta ?? 0) > 0);

// Все шесть слотов заняты: новая вещь сравнивается с самой слабой надетой.
const full = freshLoadout("sword");
const worn = Array.from({ length: full.worn.length }, (_, index) => addInstance(full, "gear", "belt", index + 1));
full.worn = worn.map((item) => item.id);
const weakest = worn[0];
assert.ok(weakest);
const spare = addInstance(full, "gear", "belt", 9);
const swap = swapFor(full, spare);
assert.equal(swap?.replaces?.id, weakest.id);
const better = equipDiff(full, spare);
assert.ok(better && better.changes.every((change) => change.delta > 0));
assert.ok(pieceScore(spare) > pieceScore(weakest));

// Надетая вещь не сравнивается сама с собой.
assert.equal(equipDiff(full, weakest), null);

// Оружие: разница удара видна.
const arms = freshLoadout("sword");
const spear = addInstance(arms, "weapon", "spear");
const armed = equipDiff(arms, spear);
assert.ok(armed);
assert.equal(armed.swap.slot, "weapon");
assert.ok(armed.changes.some((change) => change.key === "hit" && change.delta !== 0));

// Сбор маркетплейса: доля, минимум и потолок, как у сервера.
assert.equal(feeOf(100, { share: 0.05, min: 0, whole: true }), 5);
assert.equal(feeOf(3, { share: 0.05, min: 0, whole: true }), 1);
assert.equal(feeOf(10, { share: 0.05, min: 2, whole: true }), 2);
assert.equal(feeOf(1, { share: 0.05, min: 5, whole: true }), 1);
assert.equal(sellerNet(100, { share: 0.05, min: 0, whole: true }), 95);
assert.equal(sellerNet(10, { share: 0.025, min: 0, whole: false }), 9.75);
assert.equal(sellerNet(0, { share: 0.05, min: 0, whole: true }), 0);

// Заточка: следующий уровень множит атрибуты на 1,2.
const ring = itemById("fang-ring");
assert.ok(ring);
const lines = nextLevelLines({ id: "x", catalogId: "fang-ring", kind: "gear", level: 0 });
assert.equal(lines.length, 1);
assert.notEqual(lines[0]?.now, lines[0]?.next);
assert.ok(SHARPEN_RATE > 0 && SHARPEN_RATE < 1);

// Новые вещи: точка снимается один раз, проданные вычёркиваются.
const fresh = freshLoadout("sword");
const found = addInstance(fresh, "gear", "fang");
markFresh([found.id, "gone"]);
assert.equal(isFresh(found.id), true);
assert.equal(freshCount(fresh), 1);
assert.equal(seeFresh(found.id), true);
assert.equal(seeFresh(found.id), false);
assert.equal(freshCount(fresh), 0);

// Меньше движения гасит дрожь и отброс; ползунок дрожи масштабирует толчок.
setReduceMotion(false);
setShakeSetting(0.5);
assert.equal(reduceMotion(), false);
assert.equal(shakeScale(), 0.5);
assert.equal(knockScale(), 1);
setReduceMotion(true);
assert.equal(shakeScale(), 0);
assert.equal(knockScale(), 0);
setReduceMotion(false);
setShakeSetting(9);
assert.equal(shakeScale(), 1.5);
