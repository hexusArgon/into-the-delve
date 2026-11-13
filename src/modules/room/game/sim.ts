/**
 * Симуляция комнаты: чистые правила боя без отрисовки. Код разложен по файлам в ./sim/,
 * этот файл — единственный вход для остального кода и тестов. Публичный API прежний.
 */
export { DIRS, OPPOSITE, SIDE_FACING, doorway } from "./sim/types.ts";
export type { AbilityAct, AbilityFx, AimStep, CarryLoot, Cell, Dir, Fighter, FxTone, GroundCell, GroundKind, Hazard, Keg, LootParcel, Mode, Outcome, RoomLayout, RoomState, Windup, WindupKind } from "./sim/types.ts";
export { buildLayout, distancesTo, inDiamond, inRoom, isBlocked, isFloor, isPit, isWallCell } from "./sim/geometry.ts";
export { attackCells, nearestAim, shotsLeft, swordCells, weaponAim } from "./sim/weapon-cells.ts";
export { blinkCells, createRoom, livingMonsters, monsterFighter, onBoard, roomMonsters } from "./sim/units.ts";
export type { RoomEntry } from "./sim/units.ts";
export { acolyteAuraCells, acolyteChanneling, groundAt, vampirism } from "./sim/combat.ts";
export { interactTarget, lootName, useChest, usePickup, usePortal } from "./sim/world.ts";
export { attack, blink, face, reload, step, swordWillKill, wait } from "./sim/hero-actions.ts";
export { abilityAim, activeHeroZones, arrowBeam, castHeroAbility } from "./sim/hero-abilities.ts";
