import type { Loadout } from "../data/instances.ts";

function gearScore(loadout: Loadout): { levels: number; count: number } {
  const gear = loadout.items.filter((item) => item.kind !== "ability");
  return { levels: gear.reduce((sum, item) => sum + item.level, 0), count: gear.length };
}

/** Мешок с большей суммой уровней вещей. При равенстве — тот, где вещей больше. Способности не считаются: их добавляет каталог. */
export function richerLoadout(local: Loadout, remote: Loadout | null): Loadout {
  if (!remote) return local;
  const here = gearScore(local);
  const there = gearScore(remote);
  if (there.levels !== here.levels) return there.levels > here.levels ? remote : local;
  if (there.count !== here.count) return there.count > here.count ? remote : local;
  return local;
}

export function higherBest(local: number | null, remote: number | null): number | null {
  if (local === null) return remote;
  if (remote === null) return local;
  return Math.max(local, remote);
}
