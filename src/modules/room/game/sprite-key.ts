/** Порог, ближе которого пиксель считается фоном. */
export const KEY_SOLID = 60;
/** Дальше этого порога пиксель остаётся как есть. Между порогами край тает. */
export const KEY_EDGE = 120;

/** Вырезает фон по цвету первого пикселя. Буфер RGBA меняется на месте. */
export function keySprite(data: Uint8ClampedArray): void {
  const kr = data[0] ?? 255;
  const kg = data[1] ?? 0;
  const kb = data[2] ?? 255;
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i] ?? 0;
    const g = data[i + 1] ?? 0;
    const b = data[i + 2] ?? 0;
    const dist = Math.hypot(r - kr, g - kg, b - kb);
    if (dist < KEY_SOLID) {
      data[i + 3] = 0;
      continue;
    }
    if (dist >= KEY_EDGE) continue;
    data[i + 3] = Math.round(((dist - KEY_SOLID) / (KEY_EDGE - KEY_SOLID)) * 255);
    const spill = Math.min(r, b) - g;
    if (spill > 0) {
      data[i] = r - spill;
      data[i + 2] = b - spill;
    }
  }
}

/** Доля пикселей, которые не стираются полностью. Угол — цвет ключа. */
export function keptShare(data: Uint8ClampedArray): number {
  const kr = data[0] ?? 255;
  const kg = data[1] ?? 0;
  const kb = data[2] ?? 255;
  let keep = 0;
  const pixels = data.length / 4;
  for (let i = 0; i < data.length; i += 4) {
    const dist = Math.hypot((data[i] ?? 0) - kr, (data[i + 1] ?? 0) - kg, (data[i + 2] ?? 0) - kb);
    if (dist >= KEY_SOLID) keep += 1;
  }
  return pixels === 0 ? 0 : keep / pixels;
}
