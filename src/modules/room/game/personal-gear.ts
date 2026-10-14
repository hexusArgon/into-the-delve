import { GEAR } from "../data/items.ts";
import { addInstance, type Loadout } from "../data/instances.ts";

const KEY = "dungeon-personal-gear";
const COPIES = 4;

let given: string[] | null = null;

function addCopies(loadout: Loadout): string[] {
  const ids: string[] = [];
  for (const item of GEAR) {
    for (let copy = 0; copy < COPIES; copy += 1) ids.push(addInstance(loadout, "gear", item.id).id);
  }
  return ids;
}

function marked(): boolean {
  try {
    return localStorage.getItem(KEY) === "1";
  } catch {
    return true;
  }
}

/** Четыре копии каждой вещи каталога. Только эта сборка разработки, один раз. */
export function grantPersonalGear(loadout: Loadout): void {
  if (!import.meta.env.DEV || marked() || given) return;
  given = addCopies(loadout);
  try {
    localStorage.setItem(KEY, "1");
  } catch {
    /* мешок всё равно уже пополнен */
  }
}

/** Если серверное сохранение затёрло выдачу в этом же заходе, копии кладутся снова. */
export function keepPersonalGear(loadout: Loadout): void {
  if (!import.meta.env.DEV || !given) return;
  if (given.every((id) => loadout.items.some((item) => item.id === id))) return;
  given = addCopies(loadout);
}
