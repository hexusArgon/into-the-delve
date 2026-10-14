import assert from "node:assert/strict";
import { addInstance, freshLoadout, placeInstance } from "./instances.ts";

const loadout = freshLoadout("sword");
const belts = loadout.items.filter((item) => item.catalogId === "belt");
const sword = loadout.items.find((item) => item.kind === "weapon");
assert.equal(belts.length, 2);
assert.ok(sword);
const belt = belts[0]!;
const other = belts[1]!;

assert.equal(placeInstance(loadout, belt.id, { kind: "gear", index: 2 }), "ok");
assert.equal(loadout.worn[2], belt.id);
assert.equal(placeInstance(loadout, other.id, { kind: "gear", index: 2 }), "ok");
assert.equal(loadout.worn[2], other.id);
assert.equal(loadout.worn.includes(belt.id), false);

assert.equal(placeInstance(loadout, belt.id, { kind: "gear", index: 0 }), "ok");
assert.equal(placeInstance(loadout, belt.id, { kind: "gear", index: 2 }), "ok");
assert.equal(loadout.worn[0], other.id);
assert.equal(loadout.worn[2], belt.id);

assert.equal(placeInstance(loadout, belt.id, { kind: "ability", index: 0 }), "fit");
assert.equal(loadout.worn[2], belt.id);
assert.equal(placeInstance(loadout, sword.id, { kind: "gear", index: 0 }), "fit");
assert.equal(loadout.weapon, sword.id);

assert.equal(placeInstance(loadout, belt.id, "storage"), "ok");
assert.equal(loadout.worn[2], null);
assert.equal(placeInstance(loadout, belt.id, "storage"), "same");

const bolt = addInstance(loadout, "ability", "bolt");
assert.equal(placeInstance(loadout, bolt.id, { kind: "ability", index: 3 }), "ok");
assert.equal(loadout.wornAbilities[3], bolt.id);
assert.equal(placeInstance(loadout, bolt.id, { kind: "ability", index: 3 }), "same");
assert.equal(placeInstance(loadout, "missing", { kind: "gear", index: 0 }), "missing");
