import assert from "node:assert/strict";
import { storageLayout } from "./storage.ts";

assert.deepEqual(storageLayout(0), { rows: 5, cells: 40, scroll: false });
assert.equal(storageLayout(24).rows, 5);
assert.equal(storageLayout(24).scroll, false);
assert.equal(storageLayout(25).rows, 6);
assert.equal(storageLayout(25).scroll, true);
assert.equal(storageLayout(32).rows, 6);
assert.equal(storageLayout(33).rows, 7);
assert.equal(storageLayout(40).cells, 7 * 8);
assert.equal(storageLayout(200).rows, Math.ceil(200 / 8) + 2);
