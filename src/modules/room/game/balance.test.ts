import assert from "node:assert/strict";
import type { RoomPattern } from "../data/rooms.ts";
import { EMPTY_GEAR, GEAR, UNIT, critFactor, gearBonus } from "../data/items.ts";
import { pointChance } from "../data/instances.ts";
import { ELEMENTS, KIT, MONSTER_GOLD, RARE_GOLD, MONSTERS, SPORE, monsterById } from "../data/monsters.ts";
import { buildFloor } from "./floor.ts";
import { BLINK_CHARGES, HERO_HP, armorFactor } from "./rules.ts";
import { attack, createRoom, groundAt, monsterFighter, step, wait, type RoomState } from "./sim.ts";

const OPEN: RoomPattern = {
  id: "check",
  name: "check",
  w: 12,
  h: 12,
  hero: { x: 2, y: 6, facing: "right" },
  monster: { x: 9, y: 6, facing: "left" },
  doors: [],
  stamps: [],
  decor: [],
};

function room(kind: string): RoomState {
  return createRoom(OPEN, { monsterKind: kind, weapon: "sword" });
}

/** Монстр, который держит комнату открытой и ничего не делает. */
function keeper(state: RoomState): void {
  const idle = monsterFighter(monsterById("14"), { x: 11, y: 11, facing: "left" }, true);
  idle.cooldowns.spires = 99;
  state.monsters.push(idle);
}

assert.equal(HERO_HP, 400);
assert.equal(armorFactor(0), 1);
for (const id of ["16", "17", "18"]) {
  assert.equal(monsterById(id)?.maxHp, 800);
  assert.equal(monsterById(id)?.bite, 20);
}
for (const id of ["6", "11", "14", "19"]) assert.equal(monsterById(id)?.bite, 0);
assert.equal(SPORE.maxHp, 200);
assert.equal(SPORE.shield, 0);

// Hero входит с 400 HP. Sword бьёт на 100. Укус рядового — 10.
const fresh = room("7");
assert.equal(fresh.hero.hp, HERO_HP);
fresh.monster.cooldowns.swing = 99;
fresh.monster.x = 3;
attack(fresh, () => 0);
assert.equal(fresh.monster.hp, fresh.monster.maxHp - 100);
assert.equal(fresh.hero.hp, HERO_HP - 10);

// Зачистка комнаты даёт 1 заряд Blink. Повторный ход его не добавляет.
const clearedRoom = room("7");
clearedRoom.monster.cooldowns.swing = 99;
clearedRoom.monster.x = 3;
clearedRoom.monster.hp = 100;
clearedRoom.monster.shield = 0;
clearedRoom.monster.maxShield = 0;
attack(clearedRoom, () => 0);
assert.equal(clearedRoom.outcome, "won");
assert.equal(clearedRoom.blink, BLINK_CHARGES + 1);
wait(clearedRoom, () => 0);
assert.equal(clearedRoom.blink, BLINK_CHARGES + 1);

// Spore умирает от двух ударов меча и не взрывается, если убита до запала.
const spored = room("7");
spored.monster.cooldowns.swing = 99;
const spore = monsterFighter(SPORE, { x: 3, y: 6, facing: "left" }, true);
spored.monsters.push(spore);
attack(spored, () => 0);
assert.equal(spore.hp, 100);
assert.equal(spore.windup?.kind, "fuse");
attack(spored, () => 0);
assert.equal(spore.hp, 0);
assert.equal(spored.hero.poison, 0);
assert.equal(groundAt(spored, 3, 6), null);

// Стан игрока пропускает его ход, кулдауны за пропуск не тикают.
const grabbed = room("16");
grabbed.monster.mode = "ground";
grabbed.hero.iceGuard = 3;
wait(grabbed, () => 0);
assert.equal(grabbed.monster.windup?.kind, "tongue");
assert.equal(grabbed.hero.iceGuard, 2);
wait(grabbed, () => 0);
assert.equal(grabbed.hero.stun, 0);
assert.equal(grabbed.hero.iceGuard, 1);
assert.equal(grabbed.hero.x, 8);
assert.equal(grabbed.hero.hp, HERO_HP - 3 * 20);

// Damage монстра по щиту другого монстра снимает 1.
const friendly = room("7");
friendly.monster.x = 4;
const acolyte = monsterFighter(monsterById("14"), { x: 3, y: 5, facing: "left" }, true);
acolyte.cooldowns.spires = 99;
friendly.monsters.push(acolyte);
wait(friendly, () => 0);
assert.equal(friendly.monster.windup?.kind, "swing");
wait(friendly, () => 0);
assert.equal(acolyte.shield, 3);
assert.equal(acolyte.hp, acolyte.maxHp - KIT.skeleton.damage);
assert.equal(friendly.hero.hp, HERO_HP - KIT.skeleton.damage);

// Leap мертвеца взрывается на клетке каста, даже если игрок ушёл.
const leap = room("3");
leap.monster.x = 8;
keeper(leap);
wait(leap, () => 0);
assert.equal(leap.monster.windup?.kind, "jump");
step(leap, "up", () => 0);
step(leap, "up", () => 0);
assert.equal(leap.monster.hp, 0);
assert.equal(groundAt(leap, 2, 6)?.kind, "poison");
assert.equal(groundAt(leap, 2, 6)?.stacks, KIT.corpse.stacks);
assert.equal(leap.hero.poison, 0);

// Под клеткой червя можно стоять. Удар по его клетке червя под землёй не задевает.
const over = room("13");
over.monster.mode = "under";
over.monster.x = 3;
assert.equal(step(over, "right", () => 0), true);
assert.equal(over.hero.x, 3);
const dig = room("13");
dig.weapon = "spear";
dig.monster.mode = "under";
dig.monster.x = 4;
attack(dig, () => 0);
assert.equal(dig.monster.hp, dig.monster.maxHp);

// Паук метит клетку на ход. Плевок кладёт порцию, тик той же клетки добавляет left одну.
const spit = room("2");
spit.monster.x = 6;
wait(spit, () => 0);
assert.equal(spit.monster.windup?.kind, "spit");
assert.equal(spit.monster.windup?.turns, 1);
assert.equal(spit.monster.windup?.center.x, spit.hero.x);
assert.equal(spit.monster.windup?.center.y, spit.hero.y);
assert.equal(groundAt(spit, spit.hero.x, spit.hero.y), null);
assert.equal(spit.hero.hp, HERO_HP);
wait(spit, () => 0);
assert.equal(groundAt(spit, 2, 6)?.stacks, KIT.spider.stacks);
assert.equal(spit.hero.hp, HERO_HP - 1);
assert.equal(spit.hero.poison, 2 * KIT.spider.stacks);

const purse = room("7");
purse.monster.cooldowns.swing = 99;
purse.monster.x = 3;
purse.monster.hp = 100;
purse.monster.shield = 0;
purse.monster.maxShield = 0;
attack(purse, () => 0);
assert.equal(purse.piles.length, MONSTER_GOLD);
assert.equal(step(purse, "right", () => 0), true);
assert.equal(purse.carried, MONSTER_GOLD);

const hoard = room("16");
hoard.monster.mode = "ground";
hoard.monster.cooldowns.tongue = 99;
hoard.monster.x = 3;
hoard.monster.hp = 100;
hoard.monster.shield = 0;
hoard.monster.maxShield = 0;
attack(hoard, () => 0);
assert.equal(hoard.piles.length, RARE_GOLD);

// Новая лужа лежит puddleTurns ходов. Ход появления уже списывает один.
const fade = room("2");
fade.monster.x = 6;
wait(fade, () => 0);
wait(fade, () => 0);
fade.monster.cooldowns.shot = 99;
assert.equal(groundAt(fade, 2, 6)?.turns, ELEMENTS.puddleTurns - 1);
for (let turn = 0; turn < ELEMENTS.puddleTurns - 1; turn += 1) wait(fade, () => 0);
assert.equal(groundAt(fade, 2, 6), null);

// Гейзеры: центр и кольца с задержками 1–4.
const geysers = room("18");
geysers.monster.x = 9;
wait(geysers, () => 0);
assert.deepEqual(
  geysers.hazards.map((hazard) => hazard.turns),
  [1, 2, 3, 4],
);

// Крыса и многоножка в забеге не появляются.
assert.equal(
  MONSTERS.filter((monster) => monster.spawn).some((monster) => monster.id === "8" || monster.id === "20"),
  false,
);
for (let seed = 1; seed <= 200; seed += 1) {
  for (const floorRoom of buildFloor(seed)) {
    assert.equal(
      floorRoom.monsterIds.some((id) => id === "8" || id === "20"),
      false,
      `seed ${seed}: крыса или многоножка`,
    );
  }
}

const rarityCount: Record<GearItem["rarity"], number> = { common: 0, uncommon: 1, rare: 2, epic: 3 };
assert.equal(GEAR.length, 50);
for (const item of GEAR) {
  const filled = [item.maxHp, item.weaponPower, item.phys, item.elem, item.dodge, item.critChance, item.critShare].filter(
    (value) => value !== undefined,
  ).length;
  assert.equal(filled, rarityCount[item.rarity], item.name);
}

const powered = room("7");
powered.monster.cooldowns.swing = 99;
powered.monster.x = 3;
powered.weaponPower = UNIT.weaponPower;
attack(powered, () => 0);
assert.equal(powered.monster.hp, powered.monster.maxHp - (100 + UNIT.weaponPower));

const mirrored = room("7");
mirrored.monster.cooldowns.swing = 99;
mirrored.monster.x = 3;
mirrored.critChance = UNIT.critChance;
mirrored.critShare = UNIT.critShare;
attack(mirrored, () => 0);
assert.equal(mirrored.monster.hp, mirrored.monster.maxHp - 100 * critFactor(UNIT.critChance, UNIT.critShare));

const chanceOnly = room("7");
chanceOnly.monster.cooldowns.swing = 99;
chanceOnly.monster.x = 3;
chanceOnly.critChance = UNIT.critChance;
attack(chanceOnly, () => 0);
assert.equal(chanceOnly.monster.hp, chanceOnly.monster.maxHp - 100);

const armored = room("7");
armored.monster.cooldowns.swing = 99;
armored.monster.x = 3;
armored.hero.attrs.DEF = UNIT.phys;
attack(armored, () => 0);
assert.equal(armored.hero.hp, HERO_HP - 10 * armorFactor(UNIT.phys));

const dodging = room("7");
dodging.monster.cooldowns.swing = 99;
dodging.monster.x = 3;
dodging.dodge = UNIT.dodge;
attack(dodging, () => 0);
assert.equal(dodging.hero.hp, HERO_HP);

const pair = gearBonus(["whisper-mirror", "whisper-mirror"]);
const pairChance = pointChance(pair.critChance);
assert.equal(critFactor(pairChance, pair.critShare), 1 + pairChance * pair.critShare);
assert.equal(gearBonus([null]).maxHp, EMPTY_GEAR.maxHp);

console.log("balance ok");
