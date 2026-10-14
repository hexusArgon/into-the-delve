/** Шанс лишней вещи с последней комнаты за один уровень. Пять уровней закрывают шанс в гарантию. */
export const DROP_STEP = 0.2;
/** Прибавка HP и урона монстров за один уровень. Уровень 0 — числа гайда. */
export const THREAT_STEP = 0.1;

const BEST_KEY = "dungeon-best";

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

export function adventureBlurb(level: number): string {
  const offer = dropOffer(level);
  const items = offer.guaranteed === 1 ? "1 item" : `${offer.guaranteed} items`;
  const extra = offer.chance > 0 ? `, ${Math.round(offer.chance * 100)}% chance of another` : "";
  const threat = Math.round((threatFactor(level) - 1) * 100);
  const monsters = threat === 0 ? "Monsters at normal strength." : `Monsters +${threat}% HP and damage.`;
  return `${items} from the last room${extra}. ${monsters}`;
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
  return next;
}
