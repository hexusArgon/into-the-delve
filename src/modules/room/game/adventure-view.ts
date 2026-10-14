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
  page.style.maxWidth = "720px";
  page.style.margin = "0 auto";
  page.style.padding = "28px 20px 48px";
  page.style.display = "flex";
  page.style.flexDirection = "column";
  page.style.gap = "14px";

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
  list.style.gap = "8px";
  const top = best === null ? 0 : best + 1;
  for (let level = 0; level <= top; level += 1) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "dungeon-button";
    button.style.display = "flex";
    button.style.flexDirection = "column";
    button.style.alignItems = "flex-start";
    button.style.gap = "4px";
    button.style.padding = "12px 16px";
    button.style.cursor = "pointer";
    button.style.textAlign = "left";
    const name = document.createElement("span");
    name.textContent = `Level ${level}`;
    name.style.fontSize = "18px";
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
  back.style.fontSize = "18px";
  back.style.padding = "14px 22px";
  back.style.cursor = "pointer";
  back.addEventListener("click", onBack);

  page.append(title, lead, list);
  host.append(back, page);
}
