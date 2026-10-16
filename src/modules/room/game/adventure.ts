/** Шанс лишней вещи с последней комнаты за один уровень. Пять уровней закрывают шанс в гарантию. */
export const DROP_STEP = 0.2;
/** Прибавка HP и урона монстров за один уровень. Уровень 0 — числа гайда. Было 10%, дизайнер поставил 20%. */
export const THREAT_STEP = 0.2;

const BEST_KEY = "dungeon-best";

let afterRecord: ((level: number) => void) | null = null;

/** Сервер подписывается после входа. */
export function onAdventureRecorded(listener: (level: number) => void): void {
  afterRecord = listener;
}

export function threatFactor(level: number): number {
  return 1 + Math.max(0, Math.floor(level)) * THREAT_STEP;
}

/** Одна вещь всегда. Каждые 5 уровней ещё одна гарантирована, остаток — шанс следующей. */
export function dropOffer(level: number): { guaranteed: number; chance: number } {
  const safe = Math.max(0, Math.floor(level));
  return { guaranteed: 1 + Math.floor(safe / 5), chance: (safe % 5) * DROP_STEP };
}

export function rollDropCount(level: number, rng: () => number): number {
  const offer = dropOffer(level);
  return offer.guaranteed + (rng() < offer.chance ? 1 : 0);
}

/** Три строки справа от выбранного уровня. */
export function adventureSummary(level: number): { title: string; loot: string; threat: string } {
  const offer = dropOffer(level);
  const chance = Math.round(offer.chance * 100);
  const modifier = Math.round((threatFactor(level) - 1) * 100);
  return {
    title: `Level ${Math.max(0, Math.floor(level))}`,
    loot: `${offer.guaranteed} items + 1 item with ${chance}% chance`,
    threat: `+${modifier}% HP & Damage modifier`,
  };
}

/** Самый высокий зачищенный уровень. Пусто, пока портал в хаб ни разу не открывали. */
export function bestAdventure(): number | null {
  try {
    const raw = localStorage.getItem(BEST_KEY);
    if (raw === null) return null;
    const level = Number(raw);
    return Number.isInteger(level) && level >= 0 ? level : null;
  } catch {
    return null;
  }
}

export function recordAdventure(level: number): number {
  const safe = Math.max(0, Math.floor(level));
  const prev = bestAdventure();
  const next = prev === null ? safe : Math.max(prev, safe);
  try {
    localStorage.setItem(BEST_KEY, String(next));
  } catch {
    /* приватный режим */
  }
  afterRecord?.(next);
  return next;
}
