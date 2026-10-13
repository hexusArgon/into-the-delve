/** Вкладка «Способности героя». Числа листа. Секунда в тексте — ход. */

export type HeroCast = "bolt" | "ward" | "blizzard" | "arrow" | "quake" | "shard";

export interface HeroAbility {
  id: string;
  name: string;
  /** Колонка «КД». 0 — переключение без кулдауна. */
  cooldown: number;
  /** Урон, который умножает заточка. У разряда это 100. */
  damage: number;
  /** Второй урон разряда, 40. Тоже умножает заточка. */
  splash?: number;
  /** Мана за каст. У бурана — мана за тик. Не умножается. */
  mp: number;
  cast: HeroCast;
  /** Колонка «Как работает». */
  text: string;
  playable: boolean;
}

export const HERO_ABILITIES: readonly HeroAbility[] = [
  {
    id: "bolt",
    name: "Discharge",
    cooldown: 2,
    damage: 100,
    splash: 40,
    mp: 40,
    cast: "bolt",
    playable: true,
    text: "A monster in the Blink diamond. If no other monster is one square from it, it takes the full fire hit. If any are, it and those neighbors take the smaller fire hit, five monsters at most. Extra neighbors are skipped. No elemental cells.",
  },
  {
    id: "ward",
    name: "Fire Shield",
    cooldown: 8,
    damage: 20,
    mp: 40,
    cast: "ward",
    playable: true,
    text: "On you for five round-ends. Each end, every monster one square from you takes fire damage. The first tick is the end of the cast turn, and ticks continue while you are stunned. The shield takes incoming damage before your health. Durability 100. Water spends it twice, fire spends none, other types one for one. At zero the rest of that hit reaches you. It ends after the fifth tick even if durability remains.",
  },
  {
    id: "blizzard",
    name: "Blizzard",
    cooldown: 0,
    damage: 40,
    mp: 30,
    cast: "blizzard",
    playable: true,
    text: "Toggle. Does not spend the turn and has no cooldown. While on, at the end of each round every monster in the 5×5 around you takes water damage and those cells become water. The tick spends mana. If you cannot pay, the storm ends and does not hit. Toggle again to end it at once. You can still attack or step on the turn you switch it.",
  },
  {
    id: "arrow",
    name: "Poison Arrow",
    cooldown: 2,
    damage: 100,
    mp: 40,
    cast: "arrow",
    playable: true,
    text: "Pick one of four directions, not a cell. The beam runs that way until the first monster or a cell with no floor. It does not pierce. The monster takes poison damage to health and one poison stack, the same window as standing on a poison cell. The damage does not become stacks, and the beam leaves no poison cell. An empty beam still spends the turn. Poison immunity stops both the hit and the stack.",
  },
  {
    id: "quake",
    name: "Earthquake",
    cooldown: 8,
    damage: 30,
    mp: 40,
    cast: "quake",
    playable: true,
    text: "A cell in the Blink diamond. For four round-ends, every monster in the 3×3 takes earth damage, then those cells become oil. The first tick is the end of the cast turn, and ticks continue while you are stunned. There is no mana per tick. Oil's bonus applies from the next hit, not inside this damage. A new room clears the zone.",
  },
  {
    id: "shard",
    name: "Ice Shard",
    cooldown: 4,
    damage: 25,
    mp: 30,
    cast: "shard",
    playable: true,
    text: "A cell in the Blink diamond. Remove every ice cell in the 3×3 around it. Do not place new ice. If a monster stands on the chosen cell, it takes ice damage for each ice cell removed. Neighbors are not hit. The ice is gone before the hit, so standing on ice does not stun. If there was no ice, the turn is still spent and the hit is zero.",
  },
];

const BY_ID = new Map(HERO_ABILITIES.map((row) => [row.id, row]));

export function heroAbilityById(id: string): HeroAbility | undefined {
  return BY_ID.get(id);
}

/** Текст подсказки: как работает, затем числа экземпляра. Мана и кулдаун не растут от заточки. */
export function abilityTip(id: string, damage: number, level: number | null, splash = 0): { name: string; text: string } {
  const row = heroAbilityById(id);
  if (!row) return { name: "Ability", text: "" };
  const harm = splash > 0 ? `Damage ${damage} or ${splash}.` : `Damage ${damage}.`;
  const cool = row.cooldown > 0 ? `Cooldown ${row.cooldown}.` : "Cooldown none.";
  const stats = `${harm} Mana ${row.mp}. ${cool}`;
  return {
    name: row.name,
    text: level === null ? `${row.text} ${stats}` : `${row.text} ${stats} Level ${level}.`,
  };
}

export interface RunAbility {
  id: string;
  name: string;
  cooldown: number;
  /** Уже умноженный уровнем экземпляра. */
  damage: number;
  /** Второй урон разряда, уже умноженный. У остальных 0. */
  splash: number;
  mp: number;
  cast: HeroCast;
  playable: boolean;
}
