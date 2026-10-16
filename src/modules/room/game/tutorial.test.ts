import assert from "node:assert/strict";
import { WEAPONS, weaponById } from "../data/weapons.ts";
import { HUB_COPY, hubCopy, isSwingStep, lessonAdvance, lessonAllows, lessonText, lessonWeapon, tutorialRun, type LessonStep } from "./tutorial.ts";

assert.equal(lessonAllows("move", "step"), true);
assert.equal(lessonAllows("move", "face"), false);
assert.equal(lessonAllows("move", "attack"), false);
assert.equal(lessonAllows("turn", "face"), true);
assert.equal(lessonAllows("turn", "step"), false);
assert.equal(lessonAllows("attack", "attack"), true);
assert.equal(lessonAllows("blink", "blink"), true);
assert.equal(lessonAllows("wait", "wait"), true);
assert.equal(lessonAllows("finish", "step"), true);
assert.equal(lessonAllows("finish", "attack"), true);
assert.equal(lessonAllows("finish", "map"), false);
assert.equal(lessonAllows("pick", "map"), true);
assert.equal(lessonAllows("pick", "attack"), false);
assert.equal(lessonAllows("reload", "reload"), true);
assert.equal(lessonAllows("reload", "attack"), false);
assert.equal(lessonAllows("axe", "attack"), true);
assert.equal(lessonAllows("axe", "step"), false);

assert.equal(lessonAdvance("move", "step"), "turn");
assert.equal(lessonAdvance("move", "face"), "move");
assert.equal(lessonAdvance("move", "attack"), "move");
assert.equal(lessonAdvance("turn", "face"), "attack");
assert.equal(lessonAdvance("turn", "step"), "turn");
assert.equal(lessonAdvance("blink", "blink"), "wait");
assert.equal(lessonAdvance("blink", "attack"), "blink");
assert.equal(lessonAdvance("wait", "wait"), "finish");
assert.equal(lessonAdvance("wait", "wait", true), "pick");
assert.equal(lessonAdvance("finish", "attack"), "finish");
assert.equal(lessonAdvance("finish", "won"), "pick");
assert.equal(lessonAdvance("pick", "won"), "pick");

let step: LessonStep = "attack";
for (const weapon of WEAPONS) {
  assert.equal(lessonWeapon(step), weapon.id);
  assert.equal(isSwingStep(step), true);
  assert.equal(lessonText(step).startsWith(`${weapon.name}. ${weapon.figure}`), true);
  step = lessonAdvance(step, "attack");
  if (weapon.id === "pistol") {
    assert.equal(step, "reload");
    assert.equal(lessonWeapon(step), "pistol");
    assert.equal(lessonAdvance(step, "attack"), "reload");
    step = lessonAdvance(step, "reload");
  }
}
assert.equal(step, "blink");

assert.equal(lessonText("move"), "Hold WASD or the arrows. Let go to stop. After a step, the monster moves.");
assert.equal(lessonText("turn"), "Shift with WASD or the arrows. Turning is not a turn, and the monster does not move.");
assert.equal(lessonText("reload"), "R reloads. The pistol is not full, so this spends the turn. A later empty pistol also reloads on left-click. The rifle and shotgun do not.");
assert.equal(lessonText("blink"), "Right-click to pick a cell. Only legal cells are lit. Left-click one. Right-click again cancels and does not spend a charge.");
assert.equal(lessonText("wait"), "X skips your action. The world still moves.");
assert.equal(lessonText("finish"), "A skeleton's bite is not drawn ahead of time. It hits the orthogonal neighbor, not a diagonal. Finish it.");
assert.equal(lessonText("pick"), "Pick the weapon you start with. The doors open when the enemy is dead. Tab opens the floor map. This lesson is one room.");
assert.equal(lessonText("finish", true), lessonText("finish"));
assert.equal(lessonText("move", true), "Tap an arrow. The hero steps one tile that way. After a step, the monster moves.");
assert.equal(lessonText("turn", true), "Tap Turn. The hero turns 90 degrees clockwise. Turning is not a turn, and the monster does not move.");
assert.equal(lessonText("reload", true), "The pistol is not full. Tap the weapon to reload. This spends the turn. An empty pistol reloads when you confirm an attack. The rifle and shotgun do not.");
assert.equal(lessonText("blink", true), "Tap Blink, then tap a lit tile. Tap Blink again to cancel. A cancel does not spend a charge.");
assert.equal(lessonText("wait", true), "Tap Wait. The world still moves.");
assert.equal(lessonText("pick", true), "Pick the weapon you start with. The doors open when the enemy is dead. Tap the minimap to open the floor map, and × to close it. This lesson is one room.");
assert.equal(hubCopy(false), HUB_COPY);
assert.equal(hubCopy(true), "Tap the path on the right. That starts a run.");
for (const weapon of WEAPONS) {
  const phoneStep = weapon.id === "sword" ? "attack" : weapon.id;
  assert.equal(
    lessonText(phoneStep as LessonStep, true),
    `${weapon.name}. ${weapon.figure} Tap the weapon, then tap a tile. Tap the weapon again to cancel. A miss still spends the turn.`,
  );
}

const sword = tutorialRun();
assert.equal(sword.weapon, "sword");
assert.equal(sword.state.weapon, "sword");
assert.equal(sword.state.ammo, null);
assert.equal(sword.state.monsters.length, 1);
assert.equal(sword.state.monster.cooldowns.swing, 99);

const pistol = tutorialRun("reload");
assert.equal(pistol.state.weapon, "pistol");
assert.equal(pistol.state.ammo, (weaponById("pistol").magazine ?? 0) - 1);
assert.equal(pistol.state.monsters.length, 1);

const rifle = tutorialRun("rifle");
assert.equal(rifle.state.weapon, "rifle");
assert.equal(rifle.state.ammo, weaponById("rifle").magazine);
assert.equal(rifle.state.monsters.length, 1);

const late = tutorialRun("finish");
assert.equal(late.state.weapon, "shotgun");
assert.equal(late.state.monsters.length, 1);

console.log("tutorial ok");
