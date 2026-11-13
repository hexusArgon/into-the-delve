import assert from "node:assert/strict";
import { copyLoadout, freshLoadout, loadoutFromJson } from "../data/instances.ts";
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

// Золото сохраняется вместе с мешком и переживает перезапуск.
const purse = freshLoadout("sword");
purse.gold = 345;
const reread = loadoutFromJson(JSON.stringify(purse), "sword");
assert.ok(reread);
assert.equal(reread.gold, 345);
const old = JSON.parse(JSON.stringify(purse)) as Record<string, unknown>;
delete old.gold;
assert.equal(loadoutFromJson(JSON.stringify(old), "sword")?.gold, 0);
assert.equal(loadoutFromJson(JSON.stringify({ ...purse, gold: -5 }), "sword")?.gold, 0);
assert.equal(loadoutFromJson(JSON.stringify({ ...purse, gold: 12.9 }), "sword")?.gold, 12);
const target = freshLoadout("sword");
copyLoadout(purse, target);
assert.equal(target.gold, 345);

// Новый браузер с пустым мешком не затирает золото аккаунта при равных вещах.
const blank = freshLoadout("sword");
assert.equal(richerLoadout(blank, purse), purse);
assert.equal(richerLoadout(purse, blank), purse);
