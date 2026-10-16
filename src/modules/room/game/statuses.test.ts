import assert from "node:assert/strict";
import { monsterById, strikeElement } from "../data/monsters.ts";
import { createRoom, monsterFighter, vampirism, type RoomPattern } from "./sim.ts";
import { heroAuras, monsterAuras } from "./statuses.ts";

const OPEN: RoomPattern = {
  id: "test_open",
  name: "test",
  w: 12,
  h: 12,
  hero: { x: 2, y: 6, facing: "right" },
  monster: { x: 8, y: 6, facing: "left" },
  doors: [],
  stamps: [],
  decor: [],
};

const state = createRoom(OPEN, { monsterKind: "7" });
state.hero.stun = 2;
state.hero.root = 2;
state.hero.burn = 3;
state.hero.poison = 2;
state.hero.poisonWindow = 5;
state.hero.oil = 4;
state.hero.wet = 1;
state.hero.shield = 4;
state.hero.maxShield = 4;
state.ward = { hp: 80, left: 4, damage: 20 };
state.blizzard = { damage: 40, mp: 30 };
state.meterLevel = 1;
state.meterTurns = 5;

assert.deepEqual(
  heroAuras(state).map((aura) => [aura.id, aura.counts, aura.mark]),
  [
    ["stun", [2], ""],
    ["root", [2], ""],
    ["burn", [3], ""],
    ["poison", [2, 5], ""],
    ["oil", [4], ""],
    ["wet", [1], ""],
    ["ward", [80, 4], ""],
    ["blizzard", [], "on"],
    ["meter", [1, 5], ""],
  ],
);
assert.equal(heroAuras(state).some((aura) => aura.id === "shield" || aura.id === "vamp" || aura.id === "sleep"), false);
assert.equal(heroAuras(state).find((aura) => aura.id === "burn")?.name, "Fire");
assert.match(heroAuras(state).find((aura) => aura.id === "ward")?.text ?? "", /Incoming damage is taken before health/);

const monster = state.monsters[0]!;
monster.stun = 2;
monster.poison = 1;
monster.poisonWindow = 3;
monster.shield = 2;
monster.maxShield = 4;
monster.charmers = [monster];
assert.deepEqual(
  monsterAuras(state, monster).filter((aura) => ["stun", "poison", "charm", "shield"].includes(aura.id)).map((aura) => [aura.id, aura.counts]),
  [
    ["stun", [2]],
    ["poison", [1, 3]],
    ["charm", [1]],
  ],
);
assert.equal(monsterAuras(state, monster).some((aura) => aura.id === "shield"), false);

const spec = monsterById("14");
assert.ok(spec);
const acolyte = monsterFighter(spec, { x: 8, y: 7, facing: "left" }, true);
state.monsters.push(acolyte);
assert.equal(monsterAuras(state, monster).find((aura) => aura.id === "vamp")?.counts[0], vampirism(state, monster));
acolyte.stun = 2;
assert.equal(vampirism(state, monster), 0);
acolyte.stun = 0;
acolyte.silence = 2;
assert.equal(vampirism(state, monster), 0);
acolyte.silence = 0;
acolyte.windup = { kind: "spires", turns: 1, cells: [], center: { x: 8, y: 7 }, target: null };
assert.equal(monsterAuras(state, monster).some((aura) => aura.id === "vamp"), false);
acolyte.windup = null;
assert.equal(vampirism(state, monster) > 0, true);

const batSpec = monsterById("5");
assert.ok(batSpec);
const bat = monsterFighter(batSpec, { x: 4, y: 6, facing: "left" }, true);
bat.mode = "sleep";
assert.equal(monsterAuras(state, bat).some((aura) => aura.id === "sleep"), true);
assert.equal(monsterAuras(state, bat).find((aura) => aura.id === "sleep")?.counts.length, 0);

assert.equal(strikeElement("golem"), "earth");
assert.equal(strikeElement("ember"), "fire");
assert.equal(strikeElement("drowned"), "water");
assert.equal(strikeElement("whisper"), "ice");
assert.equal(strikeElement("acolyte"), null);
assert.deepEqual(monsterById("12")?.immune, ["fire"]);
assert.deepEqual(monsterById("7")?.immune, []);
