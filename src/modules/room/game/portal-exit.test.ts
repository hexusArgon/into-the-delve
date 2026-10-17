import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
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

const file = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../../assets/portal-exit.jpg");
const probe = `
Add-Type -AssemblyName System.Drawing
$bmp = New-Object System.Drawing.Bitmap '${file.replaceAll("'", "''")}'
$c = $bmp.GetPixel(0, 0)
$kr = $c.R; $kg = $c.G; $kb = $c.B
$keep = 0; $n = 0
for ($y = 0; $y -lt $bmp.Height; $y += 8) {
  for ($x = 0; $x -lt $bmp.Width; $x += 8) {
    $p = $bmp.GetPixel($x, $y)
    $n++
    $d = [Math]::Sqrt(($p.R - $kr) * ($p.R - $kr) + ($p.G - $kg) * ($p.G - $kg) + ($p.B - $kb) * ($p.B - $kb))
    if ($d -ge 60) { $keep++ }
  }
}
$bmp.Dispose()
Write-Output "$kr,$kg,$kb,$keep,$n"
`;
const line = execFileSync("powershell", ["-NoProfile", "-Command", probe], { encoding: "utf8" }).trim().split(/\r?\n/).at(-1) ?? "";
const [red, green, blue, keep, total] = line.split(",").map(Number);
assert.ok(red > 160 && blue > 140 && green < 80, `угол портала не малиновый: ${line}`);
assert.ok(keep / total > 0.25, `арка вырезается вместе с фоном: ${line}`);
