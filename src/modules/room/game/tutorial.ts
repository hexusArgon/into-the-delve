import { ROOMS } from "../data/rooms.ts";
import { EMPTY_GEAR } from "../data/items.ts";
import { createRoom } from "./sim.ts";
import type { FloorRoom, Run } from "./floor.ts";

export const TUTORIAL_KEY = "dungeon-tutorial";
export const TUTORIAL_ROOM = "cp1_20_12X12_9001";

export type LessonStep = "move" | "turn" | "attack" | "blink" | "wait" | "finish" | "done";

export type LessonAction = "step" | "face" | "attack" | "blink" | "wait" | "map";

export type LessonEvent = "step" | "face" | "attack" | "blink" | "wait" | "won";

export function tutorialPending(): boolean {
  return localStorage.getItem(TUTORIAL_KEY) !== "1";
}

export function tutorialMark(): void {
  localStorage.setItem(TUTORIAL_KEY, "1");
}

export const LESSON_COPY: Record<LessonStep, string> = {
  move: "Зажми WASD или стрелки. Отпустишь — остановишься. После шага ходит монстр.",
  turn: "Shift и WASD или стрелки. Поворот ход не тратит, монстр от него не ходит.",
  attack: "На полу клетки меча. ЛКМ в сторону скелета.",
  blink: "ПКМ — выбор клетки. Подсвечены только допустимые. ЛКМ по одной из них. Ещё раз ПКМ отменяет и заряд не снимает.",
  wait: "X — пропуск хода. Мир всё равно ходит.",
  finish: "Обычный укус скелета заранее не рисуется. Бьёт соседнюю клетку по стороне, не по диагонали. Добей его.",
  done: "Двери открываются, когда враг мёртв. Tab — карта этажа. Сейчас комната одна. R перезаряжает пистолет, винтовку и дробовик. Меч — нет.",
};

export const HUB_COPY = "Нажми тропу справа. Так начинается забег.";

/** Пока шаг не закрыт, остальные боевые действия не вызываются. На «добить» бой уже обычный. */
export function lessonAllows(step: LessonStep, action: LessonAction): boolean {
  if (step === "move") return action === "step";
  if (step === "turn") return action === "face";
  if (step === "attack") return action === "attack";
  if (step === "blink") return action === "blink";
  if (step === "wait") return action === "wait";
  if (step === "finish") return action !== "map";
  return action === "map";
}

/** Шаг сменяется только указанным действием. Клик мимо и отмена Blink сюда не приходят. */
export function lessonAdvance(step: LessonStep, event: LessonEvent): LessonStep {
  if (step === "move" && event === "step") return "turn";
  if (step === "turn" && event === "face") return "attack";
  if (step === "attack" && event === "attack") return "blink";
  if (step === "blink" && event === "blink") return "wait";
  if (step === "wait" && event === "wait") return "finish";
  if (step === "finish" && event === "won") return "done";
  return step;
}

/** Одна комната из каталога. Двери никуда не ведут. Меч, пустая экипировка, скелет только с укусом. */
export function tutorialRun(): Run {
  const pattern = ROOMS.find((room) => room.id === TUTORIAL_ROOM);
  if (!pattern) throw new Error("нет комнаты урока");
  const room: FloorRoom = {
    slot: { x: 0, y: 0 },
    pattern,
    role: "fight",
    links: {},
    portal: null,
    monsterIds: ["7"],
  };
  const state = createRoom(pattern, {
    exits: [],
    monster: true,
    weapon: "sword",
    gear: EMPTY_GEAR,
    monsterKind: "7",
  });
  state.monster.cooldowns.swing = 99;
  return {
    seed: 0,
    rooms: [room],
    goods: [{ broken: [], piles: [] }],
    weapon: "sword",
    gear: EMPTY_GEAR,
    ammo: null,
    visited: [true],
    cleared: [false],
    current: 0,
    exit: null,
    state,
  };
}

export interface LessonHooks {
  step: LessonStep;
  skip: () => void;
  finish: () => void;
  dead: (step: LessonStep) => void;
}
