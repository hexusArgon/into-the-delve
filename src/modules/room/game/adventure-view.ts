import { adventureBlurb } from "./adventure.ts";

/** Выбор уровня перед забегом. Открыты пройденные и следующий. */
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
  page.style.maxWidth = "calc(720 * var(--hud))";
  page.style.margin = "0 auto";
  page.style.padding = "calc(28 * var(--hud)) calc(20 * var(--hud)) calc(48 * var(--hud))";
  page.style.display = "flex";
  page.style.flexDirection = "column";
  page.style.gap = "calc(14 * var(--hud))";

  const title = document.createElement("h1");
  title.className = "dungeon-title";
  title.textContent = "Adventure";

  const lead = document.createElement("p");
  lead.style.margin = "0";
  lead.style.opacity = "0.75";
  lead.textContent = "Each level adds 20% to an extra last-room drop and 10% to monster HP and damage. Every fifth level makes that extra drop certain.";

  const list = document.createElement("div");
  list.style.display = "flex";
  list.style.flexDirection = "column";
  list.style.gap = "calc(8 * var(--hud))";
  const top = best === null ? 0 : best + 1;
  for (let level = 0; level <= top; level += 1) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "dungeon-button";
    button.style.display = "flex";
    button.style.flexDirection = "column";
    button.style.alignItems = "flex-start";
    button.style.gap = "calc(4 * var(--hud))";
    button.style.padding = "calc(12 * var(--hud)) calc(16 * var(--hud))";
    button.style.cursor = "pointer";
    button.style.textAlign = "left";
    const name = document.createElement("span");
    name.textContent = `Level ${level}`;
    name.style.fontSize = "calc(18 * var(--hud))";
    const detail = document.createElement("span");
    detail.textContent = adventureBlurb(level);
    detail.style.opacity = "0.75";
    button.append(name, detail);
    button.addEventListener("click", () => onPick(level));
    list.append(button);
  }

  const back = document.createElement("button");
  back.type = "button";
  back.textContent = "Back";
  back.className = "dungeon-button dungeon-back";
  back.style.fontSize = "calc(18 * var(--hud))";
  back.style.padding = "calc(14 * var(--hud)) calc(22 * var(--hud))";
  back.style.cursor = "pointer";
  back.addEventListener("click", onBack);

  page.append(title, lead, list);
  host.append(back, page);
}
