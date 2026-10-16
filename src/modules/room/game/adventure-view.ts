import { adventureSummary } from "./adventure.ts";

/** Выбор уровня перед забегом. Открыты пройденные и следующий. Список от большего к меньшему. */
export function paintAdventure(
  host: HTMLElement,
  best: number | null,
  onPick: (level: number) => void,
  onBack: () => void,
): void {
  host.replaceChildren();
  host.className = "dungeon";
  host.style.display = "flex";
  host.style.flexDirection = "column";
  host.style.height = "100%";
  host.style.overflow = "auto";

  const page = document.createElement("div");
  page.className = "dungeon-adventure-page";

  const title = document.createElement("h1");
  title.className = "dungeon-title";
  title.textContent = "Delve";

  const row = document.createElement("div");
  row.className = "dungeon-adventure";

  const pick = document.createElement("select");
  pick.className = "dungeon-level-pick";
  pick.setAttribute("aria-label", "Level");
  const cleared = best ?? 0;
  const top = best === null ? 0 : best + 1;
  for (let level = top; level >= 0; level -= 1) {
    const option = document.createElement("option");
    option.value = String(level);
    option.textContent = `Level ${level}`;
    pick.append(option);
  }
  pick.value = String(cleared);

  const copy = document.createElement("div");
  copy.className = "dungeon-level-copy";
  const name = document.createElement("div");
  name.className = "dungeon-level-name";
  const loot = document.createElement("div");
  loot.className = "dungeon-level-line";
  const threat = document.createElement("div");
  threat.className = "dungeon-level-line";
  const start = document.createElement("button");
  start.type = "button";
  start.className = "dungeon-button dungeon-button-primary dungeon-delve";
  start.textContent = "Into the Delve";
  copy.append(name, loot, threat, start);

  const show = (): void => {
    const summary = adventureSummary(Number(pick.value));
    name.textContent = summary.title;
    loot.textContent = summary.loot;
    threat.textContent = summary.threat;
  };
  show();
  pick.addEventListener("change", show);
  start.addEventListener("click", () => onPick(Number(pick.value)));

  row.append(pick, copy);

  const back = document.createElement("button");
  back.type = "button";
  back.textContent = "Back";
  back.className = "dungeon-button dungeon-back";
  back.addEventListener("click", onBack);

  page.append(title, row);
  host.append(back, page);
}
