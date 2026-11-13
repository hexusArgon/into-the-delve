import { abilityAmount, scaled, SHARPEN_CAP, SHARPEN_RATE, type ItemInstance } from "../data/instances.ts";
import { itemById, statKeysOf, type StatBonus } from "../data/items.ts";
import { weaponVersion } from "../data/weapons.ts";
import { dropName } from "./run-summary.ts";
import { CHIP_LABEL } from "./stat-labels.ts";

/**
 * Заточка до нажатия: шанс, что вещь получит при успехе, и цена провала. Числа — те же, что
 * считает sharpen() в data/instances.ts: SHARPEN_RATE и множитель уровня.
 */

export interface PreviewLine {
  label: string;
  now: string;
  next: string;
}

function num(value: number): string {
  return String(Math.round(value * 100) / 100);
}

/** Как изменятся числа вещи на следующем уровне. */
export function nextLevelLines(item: ItemInstance): PreviewLine[] {
  const up = { ...item, level: item.level + 1 };
  if (item.kind === "ability") {
    return [{ label: "Damage", now: num(abilityAmount(item)), next: num(abilityAmount(up)) }];
  }
  const bonus: StatBonus | undefined = item.kind === "gear" ? itemById(item.catalogId) : weaponVersion(item.catalogId)?.bonus;
  if (!bonus) return [];
  const lines: PreviewLine[] = [];
  for (const key of statKeysOf(bonus)) {
    const now = scaled(bonus[key], item.level);
    const next = scaled(bonus[key], up.level);
    if (!now && !next) continue;
    const tail = key.endsWith("Dmg") ? "%" : "";
    lines.push({ label: CHIP_LABEL[key][0], now: `${num(now)}${tail}`, next: `${num(next)}${tail}` });
  }
  return lines;
}

/** Подсказка под клетками заточки. */
export function sharpenPreview(target: ItemInstance | undefined, copy: ItemInstance | undefined): HTMLElement {
  const box = document.createElement("div");
  box.className = "dungeon-hone-preview";
  const say = (text: string, className = ""): HTMLElement => {
    const line = document.createElement("p");
    line.textContent = text;
    if (className) line.className = className;
    box.append(line);
    return line;
  };
  if (!target) {
    say("Put a piece in Item and a copy of the same piece in Copy.");
    return box;
  }
  if (target.level >= SHARPEN_CAP) {
    say(`${dropName(target)} is at level ${SHARPEN_CAP}, the cap.`);
    return box;
  }
  if (!copy) {
    say(`Now add a copy of ${dropName(target)}. The copy is used up.`);
    return box;
  }
  const odds = say(`Chance ${Math.round(SHARPEN_RATE * 100)}%`, "dungeon-hone-odds");
  odds.setAttribute("aria-label", `Success chance ${Math.round(SHARPEN_RATE * 100)} percent`);
  say(`Success: level ${target.level} → ${target.level + 1}`, "dungeon-hone-win");
  const lines = nextLevelLines(target);
  if (lines.length > 0) {
    const table = document.createElement("div");
    table.className = "dungeon-hone-lines";
    for (const line of lines) {
      const row = document.createElement("div");
      const name = document.createElement("span");
      name.textContent = line.label;
      const value = document.createElement("b");
      value.textContent = `${line.now} → ${line.next}`;
      row.append(name, value);
      table.append(row);
    }
    box.append(table);
  }
  say("Failure: both pieces are lost.", "dungeon-hone-lose");
  return box;
}
