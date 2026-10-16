import assert from "node:assert/strict";
import { bitmapSize, nextPixelScale, pixelCeiling } from "./pixel-scale.ts";

assert.equal(pixelCeiling(1), 1);
assert.equal(pixelCeiling(0.5), 1);
assert.equal(pixelCeiling(2), 2);
assert.equal(pixelCeiling(3), 3);
assert.equal(pixelCeiling(4), 3);
assert.equal(bitmapSize(96, 1), 96);
assert.equal(bitmapSize(96, 3), 288);

assert.equal(nextPixelScale(3, 3, Infinity, 20), 2.75);
assert.equal(nextPixelScale(2, 3, Infinity, 8), 2.25);
assert.equal(nextPixelScale(2.75, 3, Infinity, 12), 2.75);
assert.equal(nextPixelScale(2, 3, 2.25, 4), 2);
assert.equal(nextPixelScale(3, 3, Infinity, 5), 3);
assert.equal(nextPixelScale(1, 3, Infinity, 20), 1);
