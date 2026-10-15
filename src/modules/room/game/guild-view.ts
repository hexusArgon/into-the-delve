import type { GuildRow } from "./cloud.ts";

/** Доска гильдии: все игроки тайтла, по лучшему пройденному уровню. */
export function paintGuild(host: HTMLElement, rows: readonly GuildRow[], onBack: () => void, status = ""): void {
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
  title.textContent = "Guild";

  const lead = document.createElement("p");
  lead.style.margin = "0";
  lead.style.opacity = "0.75";
  lead.textContent = status || "Highest adventure level. Every player of the game is listed.";

  const table = document.createElement("div");
  table.style.display = "grid";
  table.style.gridTemplateColumns = "calc(72 * var(--hud)) 1fr calc(120 * var(--hud))";
  table.style.gap = "calc(8 * var(--hud)) calc(16 * var(--hud))";
  table.style.alignItems = "center";
  for (const heading of ["Rank", "Name", "Level"]) {
    const cell = document.createElement("div");
    cell.textContent = heading;
    cell.style.opacity = "0.6";
    cell.style.letterSpacing = "0.08em";
    cell.style.textTransform = "uppercase";
    table.append(cell);
  }
  if (rows.length === 0 && !status) {
    const empty = document.createElement("p");
    empty.style.margin = "0";
    empty.textContent = "No cleared adventure yet.";
    table.append(empty);
  } else {
    for (const row of rows) {
      for (const value of [String(row.rank), row.name, String(row.level)]) {
        const cell = document.createElement("div");
        cell.textContent = value;
        if (row.you) cell.style.fontWeight = "700";
        table.append(cell);
      }
    }
  }

  const back = document.createElement("button");
  back.type = "button";
  back.textContent = "Back";
  back.className = "dungeon-button dungeon-back";
  back.style.fontSize = "calc(18 * var(--hud))";
  back.style.padding = "calc(14 * var(--hud)) calc(22 * var(--hud))";
  back.style.cursor = "pointer";
  back.addEventListener("click", onBack);

  page.append(title, lead, table);
  host.append(back, page);
}
