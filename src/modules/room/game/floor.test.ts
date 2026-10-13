import assert from "node:assert/strict";
import { FLOOR_ROOMS, BLINK_CHARGES } from "./rules.ts";
import { MONSTERS } from "../data/monsters.ts";
import { buildFloor, createRun, portalRoomCount, syncRun, teleport, travel } from "./floor.ts";
import { DIRS, OPPOSITE, SIDE_FACING, buildLayout, distancesTo, isBlocked, livingMonsters, step } from "./sim.ts";

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

const back = run.state.exits.find((door) => door.side === OPPOSITE[exit.side])!;
assert.equal(step(run.state, SIDE_FACING[back.side]), false);
assert.equal(travel(run), false);
assert.equal(run.current, target);

run.state.monster.hp = 0;
run.state.outcome = "won";
syncRun(run);
assert.equal(run.cleared[target], true);
run.cleared.fill(true);
run.state.outcome = "won";
syncRun(run);
assert.equal(run.exit?.room, target);
assert.equal(isBlocked(run.state.room, run.exit!.cell.x, run.exit!.cell.y), false);
assert.equal(step(run.state, SIDE_FACING[back.side]), true);
assert.equal(travel(run), true);
assert.equal(run.current, 0);
assert.equal(run.state.monster.hp, 0);

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

console.log("floor ok");
