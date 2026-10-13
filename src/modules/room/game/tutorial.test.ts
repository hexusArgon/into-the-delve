import assert from "node:assert/strict";
import { WEAPONS, weaponById } from "../data/weapons.ts";
import { isSwingStep, lessonAdvance, lessonAllows, lessonText, lessonWeapon, tutorialRun, type LessonStep } from "./tutorial.ts";

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
