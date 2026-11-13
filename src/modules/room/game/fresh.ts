/**
 * Новые вещи в мешке: принесённые из забега, на которые игрок ещё не посмотрел. В хранилище у
 * такой вещи точка; наведение, фокус или тап её снимают. Список помнится в браузере.
 */

import type { Loadout } from "../data/instances.ts";

const FRESH_KEY = "dungeon-fresh";

function load(): Set<string> {
  try {
    const raw = typeof localStorage === "undefined" ? null : localStorage.getItem(FRESH_KEY);
    const list: unknown = raw ? JSON.parse(raw) : [];
    return new Set(Array.isArray(list) ? list.filter((id): id is string => typeof id === "string") : []);
  } catch {
    return new Set();
  }
}

const fresh = load();

function store(): void {
  try {
    localStorage.setItem(FRESH_KEY, JSON.stringify([...fresh]));
  } catch {
    /* приватный режим */
  }
}

export function markFresh(ids: readonly string[]): void {
  for (const id of ids) fresh.add(id);
  store();
}

export function isFresh(id: string): boolean {
  return fresh.has(id);
}

/** Игрок посмотрел на вещь. true — точка была. */
export function seeFresh(id: string): boolean {
  if (!fresh.delete(id)) return false;
  store();
  return true;
}

/** Сколько новых вещей ещё лежит в мешке. Проданные и сгоревшие при заточке вычёркиваются. */
export function freshCount(loadout: Loadout): number {
  const known = new Set(loadout.items.map((item) => item.id));
  let dropped = false;
  for (const id of fresh) {
    if (known.has(id)) continue;
    fresh.delete(id);
    dropped = true;
  }
  if (dropped) store();
  return fresh.size;
}
