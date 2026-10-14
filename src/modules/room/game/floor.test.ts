import assert from "node:assert/strict";
import { FLOOR_ROOMS, BLINK_CHARGES } from "./rules.ts";
import { MONSTERS } from "../data/monsters.ts";
import { EMPTY_GEAR } from "../data/items.ts";
import { MONSTER_DOOR_GAP, type Side } from "../data/rooms.ts";
import { assignLoot, buildFloor, createRun, portalRoomCount, syncRun, teleport, travel } from "./floor.ts";
import { DIRS, OPPOSITE, SIDE_FACING, buildLayout, distancesTo, isBlocked, isPit, livingMonsters, step } from "./sim.ts";

function doorDist(rooms: { links: Partial<Record<Side, number>> }[]): number[] {
  const dist = rooms.map(() => -1);
  dist[0] = 0;
  const queue = [0];
  for (let head = 0; head < queue.length; head += 1) {
    const index = queue[head]!;
    for (const next of Object.values(rooms[index]!.links)) {
      if (next === undefined || dist[next] !== -1) continue;
      dist[next] = dist[index]! + 1;
      queue.push(next);
    }
  }
  return dist;
}

function pathTo(rooms: { links: Partial<Record<Side, number>> }[], goal: number): Set<number> {
  const prev = new Map<number, number>();
  const queue = [0];
  const seen = new Set([0]);
  while (queue.length > 0) {
    const index = queue.shift()!;
    if (index === goal) break;
    for (const next of Object.values(rooms[index]!.links)) {
      if (next === undefined || seen.has(next)) continue;
      seen.add(next);
      prev.set(next, index);
      queue.push(next);
    }
  }
  const path = new Set<number>();
  let cursor = goal;
  while (cursor !== 0) {
    path.add(cursor);
    cursor = prev.get(cursor) ?? 0;
  }
  path.add(0);
  return path;
}

function walkTo(run: ReturnType<typeof createRun>, goal: number): void {
  const rooms = run.rooms;
  const prev = new Map<number, { from: number; side: Side }>();
  const queue = [run.current];
  const seen = new Set(queue);
  while (queue.length > 0) {
    const index = queue.shift()!;
    if (index === goal) break;
    for (const [side, next] of Object.entries(rooms[index]!.links) as [Side, number][]) {
      if (seen.has(next)) continue;
      seen.add(next);
      prev.set(next, { from: index, side });
      queue.push(next);
    }
  }
  const hops: Side[] = [];
  let cursor = goal;
  while (cursor !== run.current) {
    const hop = prev.get(cursor);
    if (!hop) throw new Error("нет пути к порталу");
    hops.push(hop.side);
    cursor = hop.from;
  }
  hops.reverse();
  for (const side of hops) {
    for (const monster of run.state.monsters) monster.hp = 0;
    run.state.outcome = "won";
    syncRun(run);
    const door = run.state.exits.find((exit) => exit.side === side);
    if (!door) throw new Error(`нет двери ${side}`);
    run.state.hero.x = door.x;
    run.state.hero.y = door.y;
    assert.equal(step(run.state, SIDE_FACING[side]), true);
    assert.equal(travel(run), true);
  }
}

const rareIds = new Set(MONSTERS.filter((monster) => monster.rare).map((monster) => monster.id));
let sawRare = false;
for (let seed = 1; seed <= 200; seed += 1) {
  const rooms = buildFloor(seed);
  assert.equal(rooms.length, FLOOR_ROOMS, `seed ${seed}: комнат`);
  assert.equal(rooms[0]!.role, "start");
  assert.deepEqual(rooms[0]!.monsterIds, []);
  const ids = new Set(MONSTERS.map((monster) => monster.id));
  for (const room of rooms) {
    if (room.role !== "fight") continue;
    assert.ok(room.monsterIds.length >= 2 && room.monsterIds.length <= 6, `seed ${seed}: в бою ${room.monsterIds.length}`);
    const rares = room.monsterIds.filter((id) => rareIds.has(id));
    if (rares.length === 1) sawRare = true;
    assert.ok(rares.length <= 1, `seed ${seed}: рарников ${rares.length}`);
    for (const id of room.monsterIds) {
      assert.equal(ids.has(id), true, `seed ${seed}: монстр не из таблицы`);
      assert.equal(id === "8" || id === "20", false, `seed ${seed}: крыса или многоножка в пуле`);
    }
  }
  const slots = new Set(rooms.map((room) => `${room.slot.x},${room.slot.y}`));
  assert.equal(slots.size, rooms.length, `seed ${seed}: комнаты на одном месте`);
  rooms.forEach((room, index) => {
    for (const [side, next] of Object.entries(room.links) as [keyof typeof room.links, number][]) {
      const other = rooms[next]!;
      assert.equal(other.links[OPPOSITE[side]], index, `seed ${seed}: связь ${index}→${next} не взаимна`);
      const step = DIRS[SIDE_FACING[side]];
      assert.equal(other.slot.x, room.slot.x + step.x, `seed ${seed}: сосед не рядом по x`);
      assert.equal(other.slot.y, room.slot.y + step.y, `seed ${seed}: сосед не рядом по y`);
      assert.ok(room.pattern.doors.some((door) => door.side === side), `seed ${seed}: нет двери ${side}`);
    }
  });
  const seen = new Set([0]);
  const queue = [0];
  while (queue.length > 0) {
    const index = queue.shift()!;
    for (const next of Object.values(rooms[index]!.links)) {
      if (next === undefined || seen.has(next)) continue;
      seen.add(next);
      queue.push(next);
    }
  }
  assert.equal(seen.size, rooms.length, `seed ${seed}: часть этажа отрезана`);
  const portals = rooms.filter((room) => room.portal);
  assert.equal(portals.length, portalRoomCount(rooms.length), `seed ${seed}: доля телепортов`);
  for (const room of portals) {
    const pad = room.portal!;
    const layout = buildLayout(room.pattern);
    assert.equal(isBlocked(layout, pad.x, pad.y), false, `seed ${seed}: телепорт в стене`);
    assert.equal(
      room.pattern.doors.some((door) => door.x === pad.x && door.y === pad.y),
      false,
      `seed ${seed}: телепорт на двери`,
    );
    const reach = distancesTo(layout, room.pattern.hero);
    assert.ok(reach[pad.y * layout.w + pad.x]! >= 0, `seed ${seed}: до телепорта не дойти`);
  }
}
assert.equal(sawRare, true);

const run = createRun(7);
const span = doorDist(run.rooms);
assert.equal(span[run.hub], Math.max(...span));
assert.equal(run.state.outcome, "won");
assert.equal(run.state.monster.hp, 0);
assert.equal(run.state.exits.length, Object.keys(run.rooms[0]!.links).length);

const exit = run.state.exits[0]!;
run.state.hero.x = exit.x;
run.state.hero.y = exit.y;
run.state.hero.hp = 3;
run.state.blink = 0;
assert.equal(step(run.state, SIDE_FACING[exit.side]), true);
assert.equal(travel(run), true);
const target = run.rooms[0]!.links[exit.side]!;
assert.equal(run.current, target);
assert.equal(run.visited[target], true);
const arrival = run.rooms[target]!.pattern.doors.find((door) => door.side === OPPOSITE[exit.side])!;
assert.equal(run.state.hero.x, arrival.x);
assert.equal(run.state.hero.y, arrival.y);
assert.equal(run.state.hero.facing, SIDE_FACING[exit.side]);
assert.equal(run.state.hero.hp, 3);
assert.equal(run.state.blink, BLINK_CHARGES);
assert.equal(run.state.outcome, "play");
assert.ok(livingMonsters(run.state).length >= 2 && livingMonsters(run.state).length <= 6);
const spots = new Set(run.state.monsters.map((monster) => `${monster.x},${monster.y}`));
assert.equal(spots.size, run.state.monsters.length);
const hero = run.state.hero;
const banned = new Set([`${hero.x},${hero.y}`, ...run.state.barrels.map((cell) => `${cell.x},${cell.y}`), ...run.state.chairs.map((cell) => `${cell.x},${cell.y}`), ...run.state.chests.filter((chest) => !chest.open).map((chest) => `${chest.x},${chest.y}`)]);
let far = 0;
for (let y = 0; y < run.state.room.h; y += 1) {
  for (let x = 0; x < run.state.room.w; x += 1) {
    if (isBlocked(run.state.room, x, y) || isPit(run.state.room, x, y) || banned.has(`${x},${y}`)) continue;
    if (run.state.exits.some((door) => Math.abs(door.x - x) + Math.abs(door.y - y) < MONSTER_DOOR_GAP)) continue;
    if (Math.max(Math.abs(x - hero.x), Math.abs(y - hero.y)) > 4) far += 1;
  }
}
const pack = livingMonsters(run.state);
if (far >= pack.length) {
  for (const monster of pack) {
    assert.ok(Math.max(Math.abs(monster.x - hero.x), Math.abs(monster.y - hero.y)) > 4, "монстр ближе 4 клеток");
  }
}

const back = run.state.exits.find((door) => door.side === OPPOSITE[exit.side])!;
assert.equal(step(run.state, SIDE_FACING[back.side]), false);
assert.equal(travel(run), false);
assert.equal(run.current, target);

for (const monster of run.state.monsters) monster.hp = 0;
run.state.outcome = "won";
syncRun(run);
assert.equal(run.cleared[target], true);
if (target === run.hub) {
  assert.equal(run.exit?.room, run.hub);
  assert.equal(isBlocked(run.state.room, run.exit!.cell.x, run.exit!.cell.y), false);
} else assert.equal(run.exit, null);
assert.equal(run.parcels.length, 1);
assert.equal(["gear", "weapon", "ability"].includes(run.parcels[0]!.item.kind), true);
const parcelKey = run.parcels[0]!.chest
  ? `c${run.parcels[0]!.room}:${run.parcels[0]!.chest!.x},${run.parcels[0]!.chest!.y}`
  : `m${run.parcels[0]!.room}:${run.parcels[0]!.monster}`;
syncRun(run);
const again = run.parcels[0]!.chest
  ? `c${run.parcels[0]!.room}:${run.parcels[0]!.chest!.x},${run.parcels[0]!.chest!.y}`
  : `m${run.parcels[0]!.room}:${run.parcels[0]!.monster}`;
assert.equal(again, parcelKey);
assert.equal(run.state.loot.length, 0);
assert.equal(step(run.state, SIDE_FACING[back.side]), true);
assert.equal(travel(run), true);
assert.equal(run.current, 0);
assert.equal(run.state.monster.hp, 0);
walkTo(run, run.hub);
for (const monster of run.state.monsters) monster.hp = 0;
run.state.outcome = "won";
syncRun(run);
assert.equal(run.exit?.room, run.hub);
assert.equal(isBlocked(run.state.room, run.exit!.cell.x, run.exit!.cell.y), false);
const aside = run.rooms.findIndex((_, index) => !pathTo(run.rooms, run.hub).has(index));
if (aside >= 0) assert.equal(run.cleared[aside], false);

const hop = createRun(3);
const pads = hop.rooms.flatMap((room, index) => (room.portal ? [index] : []));
assert.equal(pads.length, portalRoomCount(FLOOR_ROOMS));
const idle = hop.rooms.findIndex((room) => !room.portal);
const from = pads[0]!;
const to = pads[1]!;
hop.visited[from] = true;
hop.visited[to] = true;
hop.cleared[from] = true;
hop.cleared[to] = true;
hop.current = from;
hop.state.outcome = "won";
hop.state.hero.hp = 3;
hop.state.blink = 0;
assert.equal(teleport(hop, to), true);
assert.equal(hop.current, to);
assert.equal(hop.state.hero.x, hop.rooms[to]!.portal!.x);
assert.equal(hop.state.hero.y, hop.rooms[to]!.portal!.y);
assert.equal(hop.state.hero.hp, 3);
assert.equal(hop.state.blink, BLINK_CHARGES);

hop.current = idle;
hop.state.outcome = "won";
assert.equal(teleport(hop, to), false);
assert.equal(hop.current, idle);

hop.current = from;
hop.state.outcome = "play";
assert.equal(teleport(hop, to), false);
assert.equal(hop.current, from);

hop.state.outcome = "won";
hop.visited[to] = false;
assert.equal(teleport(hop, to), false);
assert.equal(hop.current, from);

const hard = createRun(4, "sword", EMPTY_GEAR, null, [], 5);
assert.equal(hard.parcels.length, 2);

const stacked = assignLoot(
  [
    { kind: "gear", catalogId: "a" },
    { kind: "weapon", catalogId: "b" },
    { kind: "ability", catalogId: "c" },
  ],
  [{ room: 1, monster: 0 }, { room: 2, chest: { x: 3, y: 4 } }],
  [{ room: 1, monster: 0 }, { room: 1, monster: 1 }],
);
assert.equal(stacked.length, 3);
const rareItems = stacked.filter((parcel) => parcel.monster === 0 && parcel.room === 1);
assert.equal(rareItems.length, 2);
assert.equal(stacked.filter((parcel) => parcel.chest).length, 1);

console.log("floor ok");
