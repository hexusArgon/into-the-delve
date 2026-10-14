import assert from "node:assert/strict";
import { HERO_ABILITIES, heroAbilityById, type RunAbility } from "../data/hero-abilities.ts";
import { ELEMENTS, KIT, monsterById } from "../data/monsters.ts";
import type { RoomPattern } from "../data/rooms.ts";
import { HERO_MP } from "./rules.ts";
import { attack, castHeroAbility, createRoom, groundAt, monsterFighter, wait, type RoomState } from "./sim.ts";

const OPEN: RoomPattern = {
  id: "test_open",
  name: "test",
  w: 12,
  h: 12,
  hero: { x: 2, y: 6, facing: "right" },
  monster: { x: 9, y: 6, facing: "left" },
  doors: [],
  stamps: [],
  decor: [],
};

function quiet(): number {
  return 0;
}

function ability(id: string): RunAbility {
  const row = heroAbilityById(id);
  if (!row) throw new Error(id);
  return {
    id: row.id,
    name: row.name,
    cooldown: row.cooldown,
    damage: row.damage,
    splash: row.splash ?? 0,
    mp: row.mp,
    cast: row.cast,
    playable: row.playable,
  };
}

function cast(state: RoomState, cell: { x: number; y: number } | null): boolean {
  return castHeroAbility(state, 0, cell, quiet);
}

function spawn(id: string, x: number, y: number, stun = 99) {
  const unit = monsterFighter(monsterById(id), { x, y, facing: "left" }, true);
  unit.stun = stun;
  return unit;
}

function open(id: string, units: { id: string; x: number; y: number; stun?: number }[]): RoomState {
  const state = createRoom(OPEN, { abilities: [ability(id)] });
  const made = units.map((unit) => spawn(unit.id, unit.x, unit.y, unit.stun ?? 99));
  state.monsters = made;
  state.monster = made[0]!;
  return state;
}

function ice(state: RoomState, x: number, y: number): void {
  state.ground[y * state.room.w + x] = { kind: "ice", stacks: 0, turns: 7 };
}

assert.deepEqual(
  HERO_ABILITIES.map((row) => [row.id, row.cooldown, row.mp, row.damage, row.splash ?? 0]),
  [
    ["bolt", 2, 40, 100, 40],
    ["ward", 8, 40, 20, 0],
    ["blizzard", 0, 30, 40, 0],
    ["arrow", 2, 40, 100, 0],
    ["quake", 8, 40, 30, 0],
    ["shard", 4, 30, 25, 0],
  ],
);
assert.equal(heroAbilityById("ram"), undefined);
assert.equal(heroAbilityById("gaff"), undefined);
assert.equal(heroAbilityById("bite"), undefined);

const fresh = createRoom(OPEN);
assert.equal(fresh.mp, HERO_MP);
assert.equal(fresh.maxMp, HERO_MP);
assert.equal(fresh.ward, null);
assert.equal(fresh.blizzard, null);
assert.equal(fresh.quakes.length, 0);
wait(fresh, quiet);
attack(fresh, quiet);
assert.equal(fresh.mp, HERO_MP);

const alone = open("bolt", [{ id: "7", x: 5, y: 6 }]);
const aloneHp = alone.monsters[0]!.hp;
assert.equal(cast(alone, { x: 5, y: 6 }), true);
assert.equal(alone.monsters[0]!.hp, aloneHp - 100 - ELEMENTS.fireTick);
assert.equal(alone.mp, HERO_MP - 40);
assert.equal(alone.hero.cooldowns.bolt, 2);
assert.equal(groundAt(alone, 5, 6), null);
assert.equal(cast(alone, { x: 5, y: 6 }), false);
assert.equal(alone.mp, HERO_MP - 40);

const pair = open("bolt", [
  { id: "7", x: 5, y: 6 },
  { id: "7", x: 4, y: 6 },
]);
assert.equal(cast(pair, { x: 5, y: 6 }), true);
assert.equal(pair.monsters[0]!.hp, pair.monsters[0]!.maxHp - 40 - ELEMENTS.fireTick);
assert.equal(pair.monsters[1]!.hp, pair.monsters[1]!.maxHp - 40 - ELEMENTS.fireTick);

const crowd = open("bolt", [
  { id: "7", x: 5, y: 6 },
  { id: "7", x: 4, y: 5 },
  { id: "7", x: 5, y: 5 },
  { id: "7", x: 6, y: 5 },
  { id: "7", x: 4, y: 6 },
  { id: "7", x: 6, y: 6 },
]);
assert.equal(cast(crowd, { x: 5, y: 6 }), true);
assert.equal(crowd.monsters[0]!.hp, crowd.monsters[0]!.maxHp - 40 - ELEMENTS.fireTick);
assert.equal(crowd.monsters[5]!.hp, crowd.monsters[5]!.maxHp);
for (const unit of crowd.monsters.slice(1, 5)) assert.equal(unit.hp, unit.maxHp - 40 - ELEMENTS.fireTick);

const sharp = open("bolt", [{ id: "7", x: 5, y: 6 }]);
sharp.abilities[0]!.damage = 120;
sharp.abilities[0]!.splash = 48;
const sharpHp = sharp.monsters[0]!.hp;
assert.equal(cast(sharp, { x: 5, y: 6 }), true);
assert.equal(sharp.monsters[0]!.hp, sharpHp - 120 - ELEMENTS.fireTick);

const sharpPair = open("bolt", [
  { id: "7", x: 5, y: 6 },
  { id: "7", x: 5, y: 5 },
]);
sharpPair.abilities[0]!.damage = 120;
sharpPair.abilities[0]!.splash = 48;
assert.equal(cast(sharpPair, { x: 5, y: 6 }), true);
assert.equal(sharpPair.monsters[0]!.hp, sharpPair.monsters[0]!.maxHp - 48 - ELEMENTS.fireTick);
assert.equal(sharpPair.monsters[1]!.hp, sharpPair.monsters[1]!.maxHp - 48 - ELEMENTS.fireTick);

const ember = open("bolt", [{ id: "12", x: 5, y: 6 }]);
assert.equal(cast(ember, { x: 5, y: 6 }), true);
assert.equal(ember.monsters[0]!.hp, ember.monsters[0]!.maxHp);

const poor = open("bolt", [{ id: "7", x: 5, y: 6, stun: 0 }]);
poor.mp = 10;
const poorX = poor.monsters[0]!.x;
const poorHp = poor.monsters[0]!.hp;
assert.equal(cast(poor, { x: 5, y: 6 }), false);
assert.equal(poor.mp, 10);
assert.equal(poor.monsters[0]!.x, poorX);
assert.equal(poor.monsters[0]!.hp, poorHp);
assert.equal(poor.hero.cooldowns.bolt ?? 0, 0);
assert.equal(poor.note, "Not enough mana.");

const frozen = open("bolt", [{ id: "7", x: 5, y: 6 }]);
assert.equal(cast(frozen, { x: 5, y: 6 }), true);
frozen.hero.stun = 2;
wait(frozen, quiet);
assert.equal(frozen.hero.cooldowns.bolt, 2);

const ward = open("ward", [{ id: "1", x: 3, y: 6, stun: 0 }]);
const bite = monsterById("1")!.bite;
assert.equal(cast(ward, null), true);
assert.equal(ward.mp, HERO_MP - 40);
assert.equal(ward.hero.cooldowns.ward, 8);
assert.equal(ward.hero.hp, 400);
assert.equal(ward.ward?.hp, 100 - bite);
assert.equal(ward.monsters[0]!.hp, ward.monsters[0]!.maxHp - 20);
ward.ward!.hp = 4;
wait(ward, quiet);
assert.equal(ward.hero.hp, 400 - (bite - 4));
assert.equal(ward.ward, null);

const fireCell = open("ward", [{ id: "7", x: 9, y: 9 }]);
fireCell.ward = { hp: 100, left: 5, damage: 20 };
fireCell.ground[6 * fireCell.room.w + 2] = { kind: "fire", stacks: 0, turns: 7 };
wait(fireCell, quiet);
assert.equal(fireCell.hero.hp, 400);
assert.equal(fireCell.ward?.hp, 100);

const soaked = open("ward", [{ id: "18", x: 9, y: 9 }]);
const drowned = soaked.monsters[0]!;
soaked.ward = { hp: 100, left: 5, damage: 20 };
soaked.hazards = [{ owner: drowned, kind: "geyser", turns: 1, cells: [{ x: 2, y: 6 }], center: { x: 2, y: 6 } }];
wait(soaked, quiet);
assert.equal(soaked.hero.hp, 400);
assert.equal(soaked.ward?.hp, 100 - KIT.drowned.geyser * 2);

const burst = open("ward", [{ id: "18", x: 9, y: 9 }]);
burst.ward = { hp: KIT.drowned.geyser, left: 5, damage: 20 };
burst.hazards = [{ owner: burst.monsters[0]!, kind: "geyser", turns: 1, cells: [{ x: 2, y: 6 }], center: { x: 2, y: 6 } }];
wait(burst, quiet);
assert.equal(burst.hero.hp, 400 - KIT.drowned.geyser / 2);
assert.equal(burst.ward, null);

const lasting = open("ward", [{ id: "7", x: 9, y: 9 }]);
assert.equal(cast(lasting, null), true);
assert.equal(lasting.ward?.left, 4);
lasting.hero.stun = 1;
wait(lasting, quiet);
assert.equal(lasting.ward?.left, 2);
assert.equal(lasting.hero.cooldowns.ward, 8);
wait(lasting, quiet);
assert.equal(lasting.ward?.hp, 100);
assert.equal(lasting.ward?.left, 1);
wait(lasting, quiet);
assert.equal(lasting.ward, null);

const toggle = open("blizzard", [{ id: "7", x: 9, y: 6, stun: 0 }]);
const toggleX = toggle.monsters[0]!.x;
assert.equal(cast(toggle, null), false);
assert.equal(toggle.monsters[0]!.x, toggleX);
assert.equal(toggle.mp, HERO_MP);
assert.ok(toggle.blizzard);
assert.equal(cast(toggle, null), false);
assert.equal(toggle.blizzard, null);
wait(toggle, quiet);
assert.equal(toggle.mp, HERO_MP);
assert.equal(groundAt(toggle, 2, 6), null);

const storm = open("blizzard", [
  { id: "7", x: 4, y: 6 },
  { id: "7", x: 5, y: 6 },
]);
assert.equal(cast(storm, null), false);
wait(storm, quiet);
assert.equal(storm.mp, HERO_MP - 30);
assert.equal(storm.monsters[0]!.hp, storm.monsters[0]!.maxHp - 40);
assert.equal(storm.monsters[1]!.hp, storm.monsters[1]!.maxHp);
assert.equal(storm.hero.hp, 400);
assert.equal(groundAt(storm, 2, 6)?.kind, "water");
assert.equal(groundAt(storm, 4, 6)?.kind, "water");
storm.mp = 20;
const held = storm.monsters[0]!.hp;
wait(storm, quiet);
assert.equal(storm.blizzard, null);
assert.equal(storm.mp, 20);
assert.equal(storm.monsters[0]!.hp, held);

const arrow = open("arrow", [
  { id: "7", x: 6, y: 6 },
  { id: "7", x: 8, y: 6 },
]);
assert.equal(cast(arrow, { x: 3, y: 6 }), true);
assert.equal(arrow.monsters[0]!.hp, arrow.monsters[0]!.maxHp - 100 - 1);
assert.equal(arrow.monsters[0]!.poison, 1);
assert.equal(arrow.monsters[0]!.shield, arrow.monsters[0]!.maxShield - 1);
assert.equal(arrow.monsters[1]!.hp, arrow.monsters[1]!.maxHp);
assert.equal(arrow.monsters[1]!.poison, 0);
assert.equal(groundAt(arrow, 6, 6), null);
assert.equal(arrow.mp, HERO_MP - 40);
assert.equal(arrow.hero.cooldowns.arrow, 2);

const emptyBeam = open("arrow", [{ id: "7", x: 6, y: 8 }]);
assert.equal(cast(emptyBeam, { x: 2, y: 5 }), true);
assert.equal(emptyBeam.mp, HERO_MP - 40);
assert.equal(emptyBeam.hero.cooldowns.arrow, 2);
assert.equal(emptyBeam.monsters[0]!.hp, emptyBeam.monsters[0]!.maxHp);
assert.equal(emptyBeam.monsters[0]!.poison, 0);
assert.equal(emptyBeam.ground.every((cell) => cell?.kind !== "poison"), true);

const slime = open("arrow", [{ id: "6", x: 6, y: 6 }]);
assert.equal(cast(slime, { x: 3, y: 6 }), true);
assert.equal(slime.monsters[0]!.hp, slime.monsters[0]!.maxHp);
assert.equal(slime.monsters[0]!.poison, 0);

const blocked = open("arrow", [{ id: "7", x: 6, y: 6 }]);
blocked.room.blocked[6 * blocked.room.w + 4] = 1;
assert.equal(cast(blocked, { x: 3, y: 6 }), true);
assert.equal(blocked.monsters[0]!.hp, blocked.monsters[0]!.maxHp);
assert.equal(blocked.mp, HERO_MP - 40);

const quake = open("quake", [{ id: "7", x: 5, y: 6 }]);
const quakeHp = quake.monsters[0]!.hp;
assert.equal(cast(quake, { x: 5, y: 6 }), true);
assert.equal(quake.monsters[0]!.hp, quakeHp - 30);
assert.equal(quake.hero.hp, 400);
assert.equal(groundAt(quake, 5, 6)?.kind, "oil");
assert.equal(quake.quakes[0]?.left, 3);
assert.equal(quake.mp, HERO_MP - 40);
const oiled = quake.monsters[0]!.hp;
wait(quake, quiet);
assert.equal(oiled - quake.monsters[0]!.hp, 30 * ELEMENTS.oilFactor);
wait(quake, quiet);
wait(quake, quiet);
assert.equal(quake.quakes.length, 0);

const golem = open("quake", [{ id: "4", x: 5, y: 6 }]);
assert.equal(cast(golem, { x: 5, y: 6 }), true);
assert.equal(golem.monsters[0]!.hp, golem.monsters[0]!.maxHp);
assert.equal(groundAt(golem, 5, 6)?.kind, "oil");

const shard = open("shard", [
  { id: "7", x: 5, y: 6, stun: 0 },
  { id: "7", x: 6, y: 6, stun: 0 },
]);
ice(shard, 5, 6);
ice(shard, 6, 6);
ice(shard, 8, 6);
assert.equal(cast(shard, { x: 5, y: 6 }), true);
assert.equal(shard.monsters[0]!.hp, shard.monsters[0]!.maxHp - 50);
assert.equal(shard.monsters[0]!.stun, 0);
assert.equal(shard.monsters[1]!.hp, shard.monsters[1]!.maxHp);
assert.equal(groundAt(shard, 5, 6), null);
assert.equal(groundAt(shard, 6, 6), null);
assert.equal(groundAt(shard, 8, 6)?.kind, "ice");
assert.equal(shard.mp, HERO_MP - 30);
assert.equal(shard.hero.cooldowns.shard, 4);

const bareIce = open("shard", [{ id: "7", x: 5, y: 6 }]);
const bareHp = bareIce.monsters[0]!.hp;
assert.equal(cast(bareIce, { x: 5, y: 6 }), true);
assert.equal(bareIce.monsters[0]!.hp, bareHp);
assert.equal(bareIce.mp, HERO_MP - 30);
assert.equal(bareIce.hero.cooldowns.shard, 4);

const clearIce = open("shard", [{ id: "7", x: 9, y: 9 }]);
ice(clearIce, 5, 6);
assert.equal(cast(clearIce, { x: 5, y: 6 }), true);
assert.equal(groundAt(clearIce, 5, 6), null);
assert.equal(clearIce.monsters[0]!.hp, clearIce.monsters[0]!.maxHp);

console.log("hero abilities ok");
