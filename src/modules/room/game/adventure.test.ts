import assert from "node:assert/strict";
import { monsterById } from "../data/monsters.ts";
import { DROP_STEP, dropOffer, rollDropCount, threatFactor } from "./adventure.ts";
import { monsterFighter } from "./sim.ts";

assert.deepEqual(dropOffer(0), { guaranteed: 1, chance: 0 });
assert.equal(dropOffer(1).guaranteed, 1);
assert.equal(dropOffer(1).chance, DROP_STEP);
assert.equal(dropOffer(2).chance, 2 * DROP_STEP);
assert.equal(dropOffer(3).chance, 3 * DROP_STEP);
assert.deepEqual(dropOffer(5), { guaranteed: 2, chance: 0 });
assert.equal(dropOffer(6).guaranteed, 2);
assert.equal(dropOffer(6).chance, DROP_STEP);
assert.deepEqual(dropOffer(10), { guaranteed: 3, chance: 0 });
assert.equal(rollDropCount(0, () => 0), 1);
assert.equal(rollDropCount(5, () => 0), 2);
assert.equal(rollDropCount(6, () => 0), 3);
assert.equal(rollDropCount(6, () => 0.2), 2);
assert.equal(threatFactor(0), 1);
assert.equal(threatFactor(1), 1.1);
assert.equal(threatFactor(6), 1.6);

const spec = monsterById("7");
assert.ok(spec);
const grown = monsterFighter(spec, { x: 1, y: 1, facing: "left" }, true, 1);
assert.equal(grown.maxHp, Math.round(spec.maxHp * 1.1));
assert.equal(grown.hp, grown.maxHp);
const plain = monsterFighter(spec, { x: 1, y: 1, facing: "left" }, true);
assert.equal(plain.maxHp, spec.maxHp);

console.log("adventure ok");
