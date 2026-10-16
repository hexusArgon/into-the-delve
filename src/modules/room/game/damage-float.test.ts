import assert from "node:assert/strict";
import { damageFan, damageLabel } from "./damage-float.ts";

assert.equal(damageFan(0, 1), 0);
assert.equal(damageFan(0, 3), -30);
assert.equal(damageFan(1, 3), 0);
assert.equal(damageFan(2, 3), 30);
assert.equal(damageFan(0, 2), -15);
assert.equal(damageFan(1, 2), 15);
assert.equal(damageLabel(10, false), "10");
assert.equal(damageLabel(10.4, false), "10");
assert.equal(damageLabel(10.6, true), "11!");
assert.equal(damageLabel(0, true), "");

console.log("damage float ok");
