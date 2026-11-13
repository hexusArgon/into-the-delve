import { itemById, type Rarity } from "../data/items.ts";
import { weaponVersion } from "../data/weapons.ts";
import { hash01 } from "./juice.ts";
import type { InstanceKind } from "../data/instances.ts";

/**
 * Выпадение добычи: вещь подпрыгивает из клетки, падает с отскоком и вспыхивает цветом
 * редкости, после чего под ней остаётся мягкое свечение. Только рисунок.
 */

/** Сколько длится выпадение, мс. */
export const LOOT_DROP_MS = 720;

/** Цвета рамок редкости из инвентаря. Обычная вещь светится тёплым белым. */
const RARITY_GLOW: Record<Rarity, string> = {
  common: "255, 236, 200",
  uncommon: "95, 200, 110",
  rare: "90, 150, 235",
  epic: "175, 105, 230",
};

export function lootRarity(kind: InstanceKind, catalogId: string): Rarity {
  if (kind === "gear") return itemById(catalogId)?.rarity ?? "common";
  if (kind === "weapon") return weaponVersion(catalogId)?.rarity ?? "common";
  return "common";
}

export interface LootPose {
  /** Подъём над клеткой в долях клетки. */
  lift: number;
  /** Масштаб иконки. */
  scale: number;
  /** Сила вспышки 0..1. */
  burst: number;
}

const RESTING: LootPose = { lift: 0, scale: 1, burst: 0 };

/** Положение вещи через t мс после появления: взлёт, падение и два затухающих отскока. */
export function lootPose(age: number): LootPose {
  if (age < 0 || age >= LOOT_DROP_MS) return RESTING;
  const t = age / LOOT_DROP_MS;
  let lift: number;
  if (t < 0.5) {
    const u = t / 0.5;
    lift = 0.75 * Math.sin(u * Math.PI);
  } else if (t < 0.78) {
    const u = (t - 0.5) / 0.28;
    lift = 0.18 * Math.sin(u * Math.PI);
  } else {
    const u = (t - 0.78) / 0.22;
    lift = 0.05 * Math.sin(u * Math.PI);
  }
  const scale = t < 0.12 ? 0.4 + (t / 0.12) * 0.7 : 1 + 0.1 * Math.max(0, 1 - (t - 0.12) / 0.3);
  const burst = t < 0.5 ? 0 : Math.max(0, 1 - (t - 0.5) / 0.5);
  return { lift, scale, burst };
}

/** Свечение под вещью: пульсирует постоянно, на приземлении вспыхивает и разлетается искрами. */
export function drawLootGlow(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  size: number,
  rarity: Rarity,
  burst: number,
  time: number,
  seed: number,
): void {
  const rgb = RARITY_GLOW[rarity];
  const calm = rarity === "common" ? 0.12 : 0.22;
  const pulse = calm * (0.8 + 0.2 * Math.sin(time / 420 + seed));
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  const radius = size * (0.42 + 0.25 * burst);
  const glow = ctx.createRadialGradient(cx, cy + size * 0.12, 0, cx, cy + size * 0.12, radius);
  glow.addColorStop(0, `rgba(${rgb}, ${pulse + 0.55 * burst})`);
  glow.addColorStop(1, `rgba(${rgb}, 0)`);
  ctx.fillStyle = glow;
  ctx.fillRect(cx - radius, cy + size * 0.12 - radius, radius * 2, radius * 2);
  if (burst > 0) {
    // Искры разлетаются кольцом от точки падения.
    const spread = (1 - burst) * size * 0.55;
    for (let k = 0; k < 8; k += 1) {
      const angle = (k / 8) * Math.PI * 2 + hash01(seed, k, 3) * 0.6;
      const sx = cx + Math.cos(angle) * spread;
      const sy = cy + size * 0.12 + Math.sin(angle) * spread * 0.45;
      ctx.fillStyle = `rgba(${rgb}, ${burst})`;
      ctx.beginPath();
      ctx.arc(sx, sy, Math.max(1, size * 0.022 * burst), 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.restore();
}
