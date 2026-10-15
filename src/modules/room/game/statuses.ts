import { vampirism, type Fighter, type RoomState } from "./sim.ts";

export interface Aura {
  id: string;
  name: string;
  text: string;
  tone: "buff" | "debuff";
  counts: number[];
  mark: string;
}

interface AuraRow {
  id: string;
  name: string;
  text: string;
  tone: "buff" | "debuff";
}

const STUN: AuraRow = {
  id: "stun",
  tone: "debuff",
  name: "Stun",
  text: "Skip the turn. Cooldowns stand still. A new stun does not stack: the longer one is kept. The turn a shield breaks does not spend stun.",
};
const ROOT: AuraRow = {
  id: "root",
  tone: "debuff",
  name: "Root",
  text: "Cannot step or Blink. Attacks and casts are allowed. This is not stun. It ticks while the unit is stunned.",
};
const BURN: AuraRow = {
  id: "burn",
  tone: "debuff",
  name: "Fire",
  text: "At the end of the round, fire damage, then the counter −1. Standing on a fire cell refreshes the duration.",
};
const POISON: AuraRow = {
  id: "poison",
  tone: "debuff",
  name: "Poison",
  text: "Stacks. At the end of the round, 1 poison damage. A stack drops once every 2 turns. A new dose and a poison cell add stacks and open the window again. At the end of the window the stacks burn away.",
};
const OIL: AuraRow = {
  id: "oil",
  tone: "debuff",
  name: "Oil",
  text: "Non-physical damage is stronger while this lasts. Oil itself deals no damage. Standing on an oil cell refreshes the duration.",
};
const WET: AuraRow = {
  id: "wet",
  tone: "debuff",
  name: "Water",
  text: "Physical damage is stronger while this lasts. Standing on a water cell refreshes the duration.",
};
const HELD: AuraRow = {
  id: "held",
  tone: "debuff",
  name: "Grab",
  text: "The turn is skipped until the drowned one throws. It does not grab the hero. Stun on the target, or the drowned one's death, ends the grab.",
};
const CHARM: AuraRow = {
  id: "charm",
  tone: "debuff",
  name: "Charm",
  text: "Bone Whisper marks the target. When the target dies, the whisper hits with ice around the corpse.",
};
const WARD: AuraRow = {
  id: "ward",
  tone: "buff",
  name: "Fire Shield",
  text: "Incoming damage is taken before health. Fire does not spend durability and does not reach health. Water spends double. Anything else is one for one. At zero, the rest of the hit goes to health. It ends when durability or the ticks run out.",
};
const BLIZZARD: AuraRow = {
  id: "blizzard",
  tone: "buff",
  name: "Blizzard",
  text: "A toggle with no duration. At the end of the round, monsters in a 5×5 square take water damage and the cells become water. The tick spends mana. Without enough mana the blizzard goes out and does not hit that time.",
};
const METER: AuraRow = {
  id: "meter",
  tone: "buff",
  name: "Meter",
  text: "The level rises by 1 when a shield breaks. Damage gains level × step. The step is 0 right now, so damage does not change.",
};
const SLEEP: AuraRow = {
  id: "sleep",
  tone: "buff",
  name: "Sleep",
  text: "Heals until health is full. Breaking the shield wakes it. It falls asleep once, when health drops below half.",
};
const VAMP: AuraRow = {
  id: "vamp",
  tone: "buff",
  name: "Vampirism",
  text: "Heals for a share of the damage just dealt. One stack from each acolyte whose aura covers the attacker. While an acolyte is placing spires, its aura is not counted.",
};

function row(spec: AuraRow, counts: number[] = [], mark = ""): Aura {
  return { ...spec, counts, mark };
}

function shared(unit: Fighter): Aura[] {
  const auras: Aura[] = [];
  if (unit.stun > 0) auras.push(row(STUN, [unit.stun]));
  if (unit.root > 0) auras.push(row(ROOT, [unit.root]));
  if (unit.burn > 0) auras.push(row(BURN, [unit.burn]));
  if (unit.poison > 0) auras.push(row(POISON, [unit.poison, unit.poisonWindow]));
  if (unit.oil > 0) auras.push(row(OIL, [unit.oil]));
  if (unit.wet > 0) auras.push(row(WET, [unit.wet]));
  return auras;
}

/** Иконки нижней панели. Щит, сон, захват, очарование и вампиризм сюда не входят. */
export function heroAuras(state: RoomState): Aura[] {
  const auras = shared(state.hero);
  const ward = state.ward;
  if (ward) auras.push(row(WARD, [ward.hp, ward.left]));
  if (state.blizzard) auras.push(row(BLIZZARD, [], "on"));
  if (state.meterLevel > 0 || state.meterTurns > 0) auras.push(row(METER, [state.meterLevel, state.meterTurns]));
  return auras;
}

/** Иконки полосы монстра под курсором. Щит сюда не входит: это очки над фигурой, не баф. */
export function monsterAuras(state: RoomState, monster: Fighter): Aura[] {
  const auras = shared(monster);
  if (monster.mode === "held") auras.push(row(HELD));
  if (monster.charmers.length > 0) auras.push(row(CHARM, [monster.charmers.length]));
  if (monster.role === "bat" && monster.mode === "sleep") auras.push(row(SLEEP));
  const vamp = vampirism(state, monster);
  if (vamp > 0) auras.push(row(VAMP, [vamp]));
  return auras;
}
