import assert from "node:assert/strict";
import { freshLoadout } from "../data/instances.ts";
import { higherBest, richerLoadout } from "./progress.ts";

const local = freshLoadout("sword");
const remote = freshLoadout("sword");
const sword = remote.items.find((item) => item.kind === "weapon");
assert.ok(sword);
sword.level = 3;
assert.equal(richerLoadout(local, remote), remote);
assert.equal(richerLoadout(remote, local), remote);
assert.equal(richerLoadout(local, null), local);

const extra = freshLoadout("sword");
extra.items.push({ id: "i99", catalogId: "sword", kind: "weapon", level: 0 });
assert.equal(richerLoadout(local, extra).items.length, extra.items.length);
assert.equal(richerLoadout(extra, local).items.length, extra.items.length);

const abilityOnly = freshLoadout("sword");
abilityOnly.items.push({ id: "i50", catalogId: "bolt", kind: "ability", level: 9 });
assert.equal(richerLoadout(abilityOnly, extra), extra);

assert.equal(higherBest(null, null), null);
assert.equal(higherBest(null, 2), 2);
assert.equal(higherBest(4, 2), 4);
assert.equal(higherBest(0, null), 0);
