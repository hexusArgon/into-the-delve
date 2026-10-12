import assert from "node:assert/strict";
import { lessonAdvance, lessonAllows } from "./tutorial.ts";

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
assert.equal(lessonAllows("done", "map"), true);
assert.equal(lessonAllows("done", "attack"), false);

assert.equal(lessonAdvance("move", "step"), "turn");
assert.equal(lessonAdvance("move", "face"), "move");
assert.equal(lessonAdvance("move", "attack"), "move");
assert.equal(lessonAdvance("turn", "face"), "attack");
assert.equal(lessonAdvance("turn", "step"), "turn");
assert.equal(lessonAdvance("attack", "attack"), "blink");
assert.equal(lessonAdvance("blink", "blink"), "wait");
assert.equal(lessonAdvance("blink", "attack"), "blink");
assert.equal(lessonAdvance("wait", "wait"), "finish");
assert.equal(lessonAdvance("finish", "attack"), "finish");
assert.equal(lessonAdvance("finish", "won"), "done");
assert.equal(lessonAdvance("done", "won"), "done");

console.log("tutorial ok");
