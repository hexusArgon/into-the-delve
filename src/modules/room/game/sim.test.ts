import assert from "node:assert/strict";
import { MONSTER_DOOR_GAP, ROOM_SIZES, ROOMS, STAMP_SIZES, type RoomPattern } from "../data/rooms.ts";
import { HERO_HP } from "./rules.ts";
import { monsterById } from "../data/monsters.ts";
import {
  attack,
  attackCells,
  blink,
  blinkCells,
  buildLayout,
  createRoom,
  distancesTo,
  doorway,
  isBlocked,
  isFloor,
  isPit,
  monsterFighter,
  reload,
  step,
  swordCells,
  wait,
} from "./sim.ts";

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

const room = createRoom(OPEN);
assert.deepEqual(
  swordCells(room).map((cell) => `${cell.x},${cell.y}`),
  ["3,5", "3,6", "3,7"],
);

const poked = createRoom(OPEN);
poked.hero.x = 7;
poked.hero.facing = "right";
poked.monster.cooldowns.swing = 99;
attack(poked, () => 0);
assert.equal(poked.monster.shield, 4);
assert.equal(poked.monster.hp, poked.monster.maxHp);
assert.equal(poked.monster.x, 8);

const broke = createRoom(OPEN);
broke.hero.x = 8;
broke.monster.shield = 2;
attack(broke, () => 0);
assert.equal(broke.monster.shield, 0);
assert.equal(broke.monster.stun, 2);
assert.equal(broke.hero.hp, HERO_HP);
assert.equal(broke.blink, 4);
assert.equal(broke.meterTurns, 5);
assert.equal(broke.note.includes("стане"), true);

const safe = createRoom(OPEN);
assert.equal(blink(safe, 4, 6), true);
assert.equal(safe.hero.x, 4);
assert.equal(safe.blink, 2);
assert.equal(safe.monster.x, 9);

const diamond = createRoom(OPEN);
assert.equal(blink(diamond, 5, 6), true);
diamond.hero.x = 2;
diamond.hero.y = 6;
diamond.blink = 3;
const aim = blinkCells(diamond);
assert.equal(aim.some((cell) => cell.x === 4 && cell.y === 8), false);
assert.equal(aim.some((cell) => cell.x === 4 && cell.y === 7), true);
assert.equal(aim.some((cell) => cell.x === 5 && cell.y === 6), true);
assert.equal(blink(diamond, 5, 9), false);

const hopped = createRoom(OPEN);
hopped.hero.x = 2;
hopped.hero.y = 6;
hopped.barrels = [{ x: 4, y: 6 }];
hopped.chairs = [{ x: 3, y: 6 }];
const stood = hopped.monster.x;
assert.equal(blink(hopped, 4, 6, () => 0), true);
assert.equal(hopped.barrels.length, 0);
assert.equal(hopped.broken.includes("4,6"), true);
assert.equal(hopped.piles.length, 1);
assert.equal(hopped.monster.x, stood);
assert.equal(blink(hopped, 3, 6, () => 0), true);
assert.equal(hopped.chairs.length, 0);
assert.equal(hopped.broken.includes("3,6"), true);

const far = createRoom(OPEN);
step(far, "right", () => 0);
assert.equal(far.hero.x, 3);
assert.equal(far.monster.x, 8);

const cleared = createRoom(OPEN);
cleared.hero.x = 8;
cleared.monster.hp = 1;
attack(cleared, () => 0);
assert.equal(cleared.outcome, "won");
assert.equal(step(cleared, "left", () => 0), true);
assert.equal(cleared.hero.x, 7);

const regen = createRoom(OPEN);
regen.hero.x = 8;
regen.monster.shield = 2;
regen.monster.cooldowns.swing = 99;
attack(regen, () => 0);
assert.equal(regen.monster.stun, 2);
assert.equal(regen.monster.x, 9);
wait(regen, () => 0);
assert.equal(regen.monster.stun, 1);
assert.equal(regen.monster.shield, 0);
assert.equal(regen.hero.hp, HERO_HP);
wait(regen, () => 0);
assert.equal(regen.monster.stun, 0);
assert.equal(regen.monster.shield, regen.monster.maxShield);
assert.equal(regen.hero.hp, HERO_HP);
wait(regen, () => 0);
assert.equal(regen.hero.hp, HERO_HP - 10);

const walled = createRoom({
  id: "test_wall",
  name: "test",
  w: 7,
  h: 6,
  hero: { x: 1, y: 2, facing: "right" },
  monster: { x: 5, y: 2, facing: "left" },
  doors: [],
  stamps: [{ kind: "wall", x: 3, y: 0, w: 1, h: 4 }],
  decor: [],
});
assert.equal(step(walled, "right", () => 0), true);
assert.equal(step(walled, "right", () => 0), false);
let reached = false;
for (let turn = 0; turn < 12 && !reached; turn += 1) {
  const before = walled.hero.hp;
  wait(walled, () => 0.99);
  reached = walled.hero.hp < before;
}
assert.equal(reached, true);

const sizeIn = (list: readonly (readonly [number, number])[], w: number, h: number): boolean =>
  list.some(([lw, lh]) => lw === w && lh === h);

const ids = new Set<string>();
for (const pattern of ROOMS) {
  const label = pattern.id;
  assert.equal(ids.has(label), false, `${label} повторяется`);
  ids.add(label);
  assert.match(label, new RegExp(`^cp1_20_${pattern.w}X${pattern.h}_9\\d{3}$`), `${label} имя`);
  assert.ok(sizeIn(ROOM_SIZES, pattern.w, pattern.h), `${label} размер комнаты`);
  if (pattern.shape) {
    assert.equal(pattern.shape.length, pattern.h, `${label} рядов в силуэте`);
    for (const row of pattern.shape) assert.match(row, new RegExp(`^[.x]{${pattern.w}}$`), `${label} ряд силуэта`);
  }

  const layout = buildLayout(pattern);
  const taken = new Set<string>();
  for (const stamp of pattern.stamps) {
    assert.ok(sizeIn(STAMP_SIZES, stamp.w, stamp.h), `${label} штамп ${stamp.w}x${stamp.h}`);
    for (let y = stamp.y; y < stamp.y + stamp.h; y += 1) {
      for (let x = stamp.x; x < stamp.x + stamp.w; x += 1) {
        assert.ok(isFloor(layout, x, y), `${label} штамп вне пола в ${x},${y}`);
        assert.equal(taken.has(`${x},${y}`), false, `${label} штампы пересекаются в ${x},${y}`);
        taken.add(`${x},${y}`);
      }
    }
  }

  assert.equal(isBlocked(layout, pattern.hero.x, pattern.hero.y), false, `${label} герой в стене`);
  assert.equal(isBlocked(layout, pattern.monster.x, pattern.monster.y), false, `${label} монстр в стене`);
  const doorCells = new Set(pattern.doors.map((door) => `${door.x},${door.y}`));
  for (const decor of pattern.decor) {
    assert.equal(isBlocked(layout, decor.x, decor.y), false, `${label} декор в стене`);
    assert.equal(doorCells.has(`${decor.x},${decor.y}`), false, `${label} декор на двери`);
  }

  assert.ok(pattern.doors.length > 0, `${label} без дверей`);
  const sides = new Set<string>();
  for (const door of pattern.doors) {
    assert.equal(sides.has(door.side), false, `${label} две двери на стороне ${door.side}`);
    sides.add(door.side);
    assert.equal(isBlocked(layout, door.x, door.y), false, `${label} дверь ${door.side} не на свободном полу`);
    const gap = doorway(door);
    assert.equal(isFloor(layout, gap.x, gap.y), false, `${label} проём ${door.side} ведёт в пол`);
    const reach = Math.abs(door.x - pattern.monster.x) + Math.abs(door.y - pattern.monster.y);
    assert.ok(reach >= MONSTER_DOOR_GAP, `${label} монстр в ${reach} шагах от двери ${door.side}`);
  }

  const dist = distancesTo(layout, pattern.hero);
  for (let y = 0; y < pattern.h; y += 1) {
    for (let x = 0; x < pattern.w; x += 1) {
      if (isBlocked(layout, x, y)) continue;
      assert.notEqual(dist[y * pattern.w + x], -1, `${label} клетка ${x},${y} отрезана`);
    }
  }
}

const cliff = createRoom({
  ...OPEN,
  w: 8,
  h: 8,
  hero: { x: 2, y: 2, facing: "right" },
  monster: { x: 6, y: 6, facing: "left" },
  stamps: [{ kind: "pit", x: 3, y: 2, w: 1, h: 1 }],
});
assert.equal(isPit(cliff.room, 3, 2), true);
assert.equal(isBlocked(cliff.room, 3, 2), true);
assert.equal(blinkCells(cliff).some((cell) => cell.x === 3 && cell.y === 2), false);
assert.equal(step(cliff, "right", () => 0), true);
assert.equal(cliff.hero.x, 2);
assert.equal(cliff.hero.y, 2);
assert.equal(cliff.hero.hp, HERO_HP * 0.75);
assert.equal(cliff.monster.x === 3 && cliff.monster.y === 2, false);

const blockedRim = createRoom({
  ...OPEN,
  w: 8,
  h: 8,
  hero: { x: 2, y: 2, facing: "right" },
  monster: { x: 2, y: 2, facing: "left" },
  stamps: [{ kind: "pit", x: 3, y: 2, w: 1, h: 1 }],
});
assert.equal(step(blockedRim, "right", () => 0), true);
assert.equal(blockedRim.hero.x, 3);
assert.equal(blockedRim.hero.y, 1);
assert.equal(isPit(blockedRim.room, blockedRim.hero.x, blockedRim.hero.y), false);

const lethal = createRoom({
  ...OPEN,
  hero: { x: 2, y: 2, facing: "right" },
  monster: { x: 9, y: 9, facing: "left" },
  stamps: [{ kind: "pit", x: 3, y: 2, w: 1, h: 1 }],
});
lethal.hero.hp = HERO_HP * 0.25;
assert.equal(step(lethal, "right", () => 0), true);
assert.equal(lethal.hero.hp, 0);
assert.equal(lethal.outcome, "lost");
assert.equal(lethal.hero.x, 3);
assert.equal(lethal.hero.y, 2);
assert.equal(step(lethal, "left", () => 0), false);
assert.equal(lethal.hero.x, 3);

const clearedPit = createRoom({
  ...OPEN,
  hero: { x: 2, y: 2, facing: "right" },
  monster: { x: 6, y: 2, facing: "left" },
  stamps: [{ kind: "pit", x: 3, y: 2, w: 1, h: 1 }],
});
clearedPit.monster.hp = 0;
clearedPit.outcome = "won";
clearedPit.hero.hp = HERO_HP * 0.25;
assert.equal(step(clearedPit, "right", () => 0), true);
assert.equal(clearedPit.hero.hp, 0);
assert.equal(clearedPit.outcome, "lost");
assert.equal(clearedPit.hero.x, 3);
assert.equal(clearedPit.hero.y, 2);
const fallenX = clearedPit.hero.x;
const fallenY = clearedPit.hero.y;
assert.equal(step(clearedPit, "down", () => 0), false);
assert.equal(clearedPit.hero.x, fallenX);
assert.equal(clearedPit.hero.y, fallenY);

const smashed = createRoom(OPEN);
smashed.hero.x = 2;
smashed.hero.y = 6;
smashed.hero.facing = "right";
smashed.barrels = [{ x: 3, y: 6 }];
attack(smashed, () => 0);
assert.equal(smashed.barrels.length, 0);
assert.equal(smashed.piles.length, 1);
assert.equal(smashed.piles[0]!.x, 3);
assert.equal(smashed.piles[0]!.y, 6);
assert.equal(smashed.carried, 0);

const chopped = createRoom(OPEN);
chopped.hero.x = 2;
chopped.hero.y = 6;
chopped.hero.facing = "right";
chopped.chairs = [{ x: 3, y: 6 }];
attack(chopped, () => 0);
assert.equal(chopped.chairs.length, 0);
assert.equal(chopped.broken.includes("3,6"), true);
assert.equal(chopped.piles.length, 1);

const stepped = createRoom(OPEN);
stepped.hero.x = 2;
stepped.hero.y = 6;
stepped.barrels = [{ x: 3, y: 6 }];
assert.equal(step(stepped, "right", () => 0), true);
assert.equal(stepped.hero.x, 3);
assert.equal(stepped.barrels.length, 0);
assert.equal(stepped.piles.length, 1);
assert.equal(stepped.piles[0]!.x === 3 && stepped.piles[0]!.y === 6, false);
assert.equal(Math.abs(stepped.piles[0]!.x - 3) + Math.abs(stepped.piles[0]!.y - 6), 1);

const sat = createRoom(OPEN);
sat.hero.x = 2;
sat.hero.y = 6;
sat.hero.facing = "right";
sat.chairs = [{ x: 3, y: 6 }];
assert.equal(step(sat, "right", () => 0), true);
assert.equal(sat.hero.x, 3);
assert.equal(sat.chairs.length, 0);
assert.equal(sat.broken.includes("3,6"), true);
assert.equal(sat.piles.length, 1);
assert.equal(sat.piles[0]!.x === 3 && sat.piles[0]!.y === 6, false);
const pile = stepped.piles[0]!;
stepped.hero.x = pile.x;
stepped.hero.y = pile.y === 0 ? 1 : pile.y - 1;
assert.equal(step(stepped, pile.y > stepped.hero.y ? "down" : "up", () => 0), true);
assert.equal(stepped.carried, 1);
assert.equal(stepped.piles.length, 0);

const reach = createRoom(OPEN);
reach.hero.x = 4;
reach.hero.y = 4;
reach.hero.facing = "right";
reach.weapon = "axe";
const axe = attackCells(reach).map((cell) => `${cell.x},${cell.y}`);
assert.equal(axe.includes("5,4"), true);
assert.equal(axe.includes("5,5"), true);
assert.equal(axe.includes("6,6"), false);
reach.weapon = "spear";
assert.deepEqual(
  attackCells(reach).map((cell) => `${cell.x},${cell.y}`),
  ["5,4", "6,4"],
);
reach.weapon = "gloves";
assert.deepEqual(
  attackCells(reach).map((cell) => `${cell.x},${cell.y}`),
  ["5,4", "6,4", "7,4"],
);
reach.weapon = "pistol";
assert.deepEqual(
  attackCells(reach).map((cell) => `${cell.x},${cell.y}`),
  ["5,4", "6,4", "7,4"],
);
reach.weapon = "rifle";
assert.deepEqual(
  attackCells(reach).map((cell) => `${cell.x},${cell.y}`),
  ["5,4", "6,4", "7,4", "8,4"],
);
reach.weapon = "shotgun";
assert.deepEqual(
  attackCells(reach).map((cell) => `${cell.x},${cell.y}`).sort(),
  ["5,3", "5,4", "5,5", "6,3", "6,4", "6,5", "7,3", "7,4", "7,5"],
);

const dual = createRoom(OPEN);
dual.weapon = "dual";
dual.hero.x = 8;
dual.hero.y = 6;
dual.hero.facing = "right";
attack(dual, () => 0);
assert.equal(dual.monster.hp, dual.monster.maxHp - 100);
assert.equal(dual.monster.shield, 0);

const diagonal = createRoom(OPEN);
diagonal.hero.x = 8;
diagonal.hero.y = 5;
diagonal.hero.facing = "up";
diagonal.weapon = "sword";
attack(diagonal, () => 0);
assert.equal(diagonal.monster.hp, diagonal.monster.maxHp);
assert.match(diagonal.note, /Меч/);

const axeHit = createRoom(OPEN);
axeHit.hero.x = 8;
axeHit.hero.y = 5;
axeHit.weapon = "axe";
axeHit.monster.cooldowns.swing = 99;
attack(axeHit, () => 0);
assert.equal(axeHit.monster.hp < axeHit.monster.maxHp, true);
assert.equal(axeHit.monster.shield, 2);

const farSpear = createRoom(OPEN, { weapon: "spear", monsterKind: "7" });
farSpear.hero.x = 7;
farSpear.hero.y = 6;
farSpear.hero.facing = "right";
farSpear.monster.x = 9;
farSpear.monster.y = 6;
farSpear.monster.cooldowns.swing = 99;
attack(farSpear, () => 0);
assert.equal(farSpear.monster.shield, 2);

const farGun = createRoom(OPEN, { weapon: "pistol", monsterKind: "7" });
farGun.hero.x = 6;
farGun.hero.y = 6;
farGun.hero.facing = "right";
farGun.monster.x = 9;
farGun.monster.y = 6;
farGun.monster.cooldowns.swing = 99;
attack(farGun, () => 0);
assert.equal(farGun.monster.shield, 3);
farGun.hero.x = 8;
farGun.hero.y = 6;
farGun.monster.x = 9;
farGun.monster.y = 6;
farGun.monster.shield = 4;
farGun.monster.hp = farGun.monster.maxHp;
attack(farGun, () => 0);
assert.equal(farGun.monster.shield, 2);

const kicked = createRoom(OPEN);
kicked.chairs = [{ x: 8, y: 6 }];
wait(kicked, () => 0);
assert.equal(kicked.monster.x, 8);
assert.equal(kicked.chairs.length, 0);
assert.equal(kicked.broken.includes("8,6"), true);
assert.equal(kicked.piles.length, 1);
assert.equal(kicked.piles[0]!.x === 8 && kicked.piles[0]!.y === 6, false);

const crushed = createRoom(OPEN);
crushed.barrels = [{ x: 8, y: 6 }];
wait(crushed, () => 0);
assert.equal(crushed.monster.x, 8);
assert.equal(crushed.monster.y, 6);
assert.equal(crushed.barrels.length, 0);
assert.equal(crushed.broken.includes("8,6"), true);
assert.equal(crushed.piles.length, 1);
assert.equal(crushed.piles[0]!.x === 8 && crushed.piles[0]!.y === 6, false);
assert.match(crushed.note, /Объект разбит/);

const gun = createRoom(OPEN, { weapon: "pistol" });
gun.hero.x = 8;
gun.hero.y = 6;
gun.hero.facing = "right";
gun.ammo = 1;
attack(gun, () => 0);
assert.equal(gun.ammo, 0);
assert.equal(gun.monster.hp < gun.monster.maxHp, true);
assert.equal(attack(gun, () => 0), true);
assert.equal(gun.ammo, 3);
assert.match(gun.note, /Перезарядка/);
const rifle = createRoom(OPEN, { weapon: "rifle" });
rifle.ammo = 0;
assert.equal(attack(rifle, () => 0), false);
assert.equal(rifle.ammo, 0);
assert.equal(rifle.note, "Магазин пуст.");
assert.equal(reload(gun, () => 0), false);
assert.equal(gun.note, "Магазин полон.");

const crowd = createRoom(OPEN, { monsterKind: "7" });
crowd.monster.x = 3;
crowd.monster.y = 6;
const back = monsterFighter(monsterById("4"), { x: 4, y: 6, facing: "left" }, true);
crowd.monsters.push(back);
wait(crowd, () => 0);
assert.equal(back.x === crowd.monster.x && back.y === crowd.monster.y, false);
assert.equal(back.x === crowd.hero.x && back.y === crowd.hero.y, false);
assert.equal(crowd.monster.x === crowd.hero.x && crowd.monster.y === crowd.hero.y, false);

const dog = createRoom(OPEN, { monsterKind: "1" });
dog.hero.x = 1;
dog.hero.y = 2;
dog.monster.x = 5;
dog.monster.y = 2;
wait(dog, () => 0);
assert.equal(dog.monster.x, 5);
assert.equal(dog.monster.windup?.turns, 1);
assert.equal(dog.monster.windup?.center.x, 1);
assert.equal(dog.monster.windup?.center.y, 2);
assert.equal(dog.monster.cooldowns.dash, 4);
assert.equal(dog.hero.hp, HERO_HP);
wait(dog, () => 0);
assert.equal(dog.monster.x, 1);
assert.equal(dog.monster.y, 2);
assert.equal(dog.hero.x === 1 && dog.hero.y === 2, false);
assert.equal(dog.hero.hp, HERO_HP - 30);
assert.equal(dog.monster.windup, null);

const goblin = createRoom(OPEN, { monsterKind: "10" });
goblin.hero.x = 1;
goblin.hero.y = 2;
goblin.monster.x = 5;
goblin.monster.y = 2;
wait(goblin, () => 0);
assert.equal(goblin.monster.x, 3);
assert.equal(goblin.monster.cooldowns.dash, 2);
assert.equal(goblin.hero.hp, HERO_HP);

const blocked = createRoom(
  {
    id: "hall",
    name: "hall",
    w: 12,
    h: 1,
    hero: { x: 1, y: 0, facing: "right" },
    monster: { x: 6, y: 0, facing: "left" },
    doors: [],
    stamps: [],
    decor: [],
  },
  { monsterKind: "1" },
);
blocked.monsters.push(monsterFighter(monsterById("7"), { x: 3, y: 0, facing: "left" }, true));
wait(blocked, () => 0);
assert.equal(blocked.monster.x, 6);
assert.equal(blocked.monster.windup?.turns, 1);
assert.equal(blocked.monster.windup?.center.x, 1);
assert.equal(blocked.hero.hp, HERO_HP);

const fallen = createRoom(OPEN, { monsterKind: "7" });
fallen.monster.hp = 1;
fallen.monster.x = 3;
fallen.monster.y = 6;
const behind = monsterFighter(monsterById("4"), { x: 4, y: 6, facing: "left" }, true);
fallen.monsters.push(behind);
attack(fallen, () => 0);
assert.equal(fallen.monster.hp <= 0, true);
assert.equal(behind.x === 3 && behind.y === 6, false);

console.log("sim ok");
