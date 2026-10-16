import { ROOMS } from "../data/rooms.ts";
import { EMPTY_GEAR } from "../data/items.ts";
import { WEAPONS, weaponById, type WeaponId } from "../data/weapons.ts";
import { createRoom } from "./sim.ts";
import type { FloorRoom, Run } from "./floor.ts";

export const TUTORIAL_KEY = "dungeon-tutorial";
export const WEAPON_KEY = "dungeon-weapon";
export const TUTORIAL_ROOM = "cp1_20_12X12_9001";

export type LessonStep =
  | "move"
  | "turn"
  | "attack"
  | "axe"
  | "dual"
  | "spear"
  | "staff"
  | "gloves"
  | "pistol"
  | "reload"
  | "rifle"
  | "shotgun"
  | "blink"
  | "wait"
  | "finish"
  | "pick";

export type LessonAction = "step" | "face" | "attack" | "blink" | "wait" | "reload" | "map";

export type LessonEvent = "step" | "face" | "attack" | "blink" | "wait" | "reload" | "won";

const STATIC_COPY: Partial<Record<LessonStep, string>> = {
  move: "Hold WASD or the arrows. Let go to stop. After a step, the monster moves.",
  turn: "Shift with WASD or the arrows. Turning is not a turn, and the monster does not move.",
  reload: "R reloads. The pistol is not full, so this spends the turn. A later empty pistol also reloads on left-click. The rifle and shotgun do not.",
  blink: "Right-click to pick a cell. Only legal cells are lit. Left-click one. Right-click again cancels and does not spend a charge.",
  wait: "X skips your action. The world still moves.",
  finish: "A skeleton's bite is not drawn ahead of time. It hits the orthogonal neighbor, not a diagonal. Finish it.",
  pick: "Pick a weapon to try it. The doors open when the enemy is dead. Tab opens the floor map. This lesson is one room.",
};

/** Удары урока в порядке WEAPONS. Меч — шаг attack. Сразу после пистолета — R. */
function swingChain(): LessonStep[] {
  const steps: LessonStep[] = [];
  for (const weapon of WEAPONS) {
    steps.push(weapon.id === "sword" ? "attack" : (weapon.id as LessonStep));
    if (weapon.id === "pistol") steps.push("reload");
  }
  return steps;
}

const CHAIN: readonly LessonStep[] = ["move", "turn", ...swingChain(), "blink", "wait", "finish", "pick"];

const CREDIT: Partial<Record<LessonStep, LessonEvent>> = {
  move: "step",
  turn: "face",
  reload: "reload",
  blink: "blink",
  wait: "wait",
  finish: "won",
};

export function tutorialPending(): boolean {
  return localStorage.getItem(TUTORIAL_KEY) !== "1";
}

export function tutorialMark(): void {
  localStorage.setItem(TUTORIAL_KEY, "1");
}

/** Нет ключа или в нём не id оружия — стартовый меч. */
export function tutorialWeapon(): WeaponId {
  const id = localStorage.getItem(WEAPON_KEY);
  if (id && WEAPONS.some((weapon) => weapon.id === id)) return id as WeaponId;
  return "sword";
}

export function isSwingStep(step: LessonStep): boolean {
  return step === "attack" || WEAPONS.some((weapon) => weapon.id === step);
}

export function lessonWeapon(step: LessonStep): WeaponId {
  if (step === "attack") return "sword";
  if (step === "reload") return "pistol";
  if (WEAPONS.some((weapon) => weapon.id === step)) return step as WeaponId;
  if (step === "blink" || step === "wait" || step === "finish" || step === "pick") return "shotgun";
  return "sword";
}

const PHONE_COPY: Partial<Record<LessonStep, string>> = {
  move: "Tap an arrow. The hero steps one tile that way. After a step, the monster moves.",
  turn: "Tap Turn. The hero turns 90 degrees clockwise. Turning is not a turn, and the monster does not move.",
  reload: "The pistol is not full. Tap the weapon to reload. This spends the turn. An empty pistol reloads when you confirm an attack. The rifle and shotgun do not.",
  blink: "Tap Blink, then tap a lit tile. Tap Blink again to cancel. A cancel does not spend a charge.",
  wait: "Tap Wait. The world still moves.",
  pick: "Pick a weapon to try it. The doors open when the enemy is dead. Tap the minimap to open the floor map, and × to close it. This lesson is one room.",
};

const PHONE_SWING = "Tap the weapon, then tap a tile. Tap the weapon again to cancel. A miss still spends the turn.";
const PHONE_HUB = "Tap the path on the right. That starts a run.";

export function coarsePointer(): boolean {
  if (typeof matchMedia !== "function") return false;
  if (matchMedia("(pointer: coarse)").matches) return true;
  return matchMedia("(hover: none)").matches && matchMedia("(max-width: 900px)").matches;
}

export function lessonText(step: LessonStep, phone = false): string {
  if (isSwingStep(step)) {
    const weapon = weaponById(lessonWeapon(step));
    const tail = phone ? PHONE_SWING : "Left-click. A miss still spends the turn.";
    return `${weapon.name}. ${weapon.figure} ${tail}`;
  }
  if (phone && PHONE_COPY[step]) return PHONE_COPY[step];
  return STATIC_COPY[step] ?? "";
}

export const HUB_COPY = "Press the path on the right. That starts a run.";

export function hubCopy(phone = false): string {
  return phone ? PHONE_HUB : HUB_COPY;
}

/** Пока шаг не закрыт, остальные боевые действия не вызываются. На «добить» бой уже обычный. */
export function lessonAllows(step: LessonStep, action: LessonAction): boolean {
  if (step === "move") return action === "step";
  if (step === "turn") return action === "face";
  if (step === "blink") return action === "blink";
  if (step === "wait") return action === "wait";
  if (step === "reload") return action === "reload";
  if (step === "finish") return action !== "map";
  if (step === "pick") return action === "map";
  if (isSwingStep(step)) return action === "attack";
  return false;
}

/**
 * Шаг сменяется только указанным действием.
 * Если к «добить» комната уже выиграна, шаг сам переходит к выбору.
 */
export function lessonAdvance(step: LessonStep, event: LessonEvent, won = false): LessonStep {
  const credit = isSwingStep(step) ? "attack" : CREDIT[step];
  if (event !== credit) return step;
  const index = CHAIN.indexOf(step);
  const next = CHAIN[index + 1] ?? step;
  if (next === "finish" && won) return "pick";
  return next;
}

/** Одна комната из каталога. Двери никуда не ведут. Оружие — оружие этого шага. Скелет только с укусом. */
export function tutorialRun(step: LessonStep = "move"): Run {
  const pattern = ROOMS.find((room) => room.id === TUTORIAL_ROOM);
  if (!pattern) throw new Error("lesson room is missing");
  const room: FloorRoom = {
    slot: { x: 0, y: 0 },
    pattern,
    role: "fight",
    links: {},
    portal: null,
    monsterIds: ["7"],
  };
  const weapon = lessonWeapon(step);
  const magazine = weaponById(weapon).magazine;
  const ammo = step === "reload" && magazine !== null ? magazine - 1 : magazine;
  const state = createRoom(pattern, {
    exits: [],
    monster: true,
    weapon,
    ammo,
    gear: EMPTY_GEAR,
    monsterKind: "7",
  });
  state.monster.cooldowns.swing = 99;
  return {
    seed: 0,
    rooms: [room],
    goods: [{ broken: [], piles: [], loot: [], opened: [] }],
    weapon,
    gear: EMPTY_GEAR,
    weaponHit: null,
    abilities: [],
    abilityCd: {},
    ammo,
    visited: [true],
    cleared: [false],
    current: 0,
    hub: 0,
    exit: null,
    adventure: 0,
    parcels: [],
    state,
  };
}

export interface LessonHooks {
  step: LessonStep;
  skip: () => void;
  finish: (weapon: WeaponId) => void;
  dead: (step: LessonStep) => void;
}
