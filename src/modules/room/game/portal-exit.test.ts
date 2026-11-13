import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { keptShare, keySprite } from "./sprite-key.ts";

const magenta = new Uint8ClampedArray([
  255, 0, 255, 255,
  248, 8, 246, 255,
  90, 92, 98, 255,
]);
assert.ok(keptShare(magenta) > 0.3);
const cut = new Uint8ClampedArray(magenta);
keySprite(cut);
assert.equal(cut[3], 0);
assert.equal(cut[7], 0);
assert.equal(cut[11], 255);

const stone = new Uint8ClampedArray([
  27, 26, 24, 255,
  40, 38, 36, 255,
  55, 52, 48, 255,
]);
assert.ok(keptShare(stone) < 0.01);

// Готовые спрайты собирает scripts/optimize-assets.py: фон уже вырезан, в WebP должен быть альфа-канал.
// Скрипт сам отказывается писать спрайт, у которого фон съел фигуру.
const assets = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../../assets");

/** Есть ли у WebP прозрачность: VP8L хранит её всегда, VP8X — флагом альфы. */
function webpHasAlpha(file: string): boolean {
  const bytes = readFileSync(file);
  assert.equal(bytes.toString("ascii", 0, 4), "RIFF", `${file}: не RIFF`);
  assert.equal(bytes.toString("ascii", 8, 12), "WEBP", `${file}: не WebP`);
  const chunk = bytes.toString("ascii", 12, 16);
  if (chunk === "VP8L") return true;
  if (chunk === "VP8X") return ((bytes[20] ?? 0) & 0x10) !== 0;
  return false;
}

for (const sprite of ["portal-exit.webp", "hero-rogue.webp", "monsters/1.webp", "items/belt.webp"]) {
  assert.ok(webpHasAlpha(path.join(assets, sprite)), `${sprite} без прозрачности`);
}
// Текстуры пола и стен непрозрачны: прозрачность в них — признак ошибки в правилах скрипта.
assert.equal(webpHasAlpha(path.join(assets, "dungeon-floor.webp")), false);
