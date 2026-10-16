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
  page.className = "dungeon-guild";

  const title = document.createElement("h1");
  title.className = "dungeon-title";
  title.textContent = "Guild";

  const lead = document.createElement("p");
  lead.className = "dungeon-guild-lead";
  lead.textContent = status || "Highest delve level. Every player of the game is listed.";

  const table = document.createElement("div");
  table.className = "dungeon-guild-table";
  for (const heading of ["Rank", "Name", "Level"]) {
    const cell = document.createElement("div");
    cell.className = "dungeon-guild-head";
    cell.textContent = heading;
    table.append(cell);
  }
  if (rows.length === 0 && !status) {
    const empty = document.createElement("p");
    empty.className = "dungeon-guild-empty";
    empty.textContent = "No cleared delve yet.";
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
  back.addEventListener("click", onBack);

  page.append(title, lead, table);
  host.append(back, page);
}
