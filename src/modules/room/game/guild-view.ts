/** Доска гильдии. Чужих имён в этой сборке нет: тайтл не подключён, места не выдумываются. */
export function paintGuild(host: HTMLElement, level: number, onBack: () => void): void {
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
  title.textContent = "Гильдия";

  const lead = document.createElement("p");
  lead.style.margin = "0";
  lead.style.opacity = "0.75";
  lead.textContent = "Доска пройденных уровней. Чужие забеги на неё не записаны.";

  const table = document.createElement("div");
  table.style.display = "grid";
  table.style.gridTemplateColumns = "72px 1fr 120px";
  table.style.gap = "8px 16px";
  table.style.alignItems = "center";
  for (const heading of ["Место", "Имя", "Уровень"]) {
    const cell = document.createElement("div");
    cell.textContent = heading;
    cell.style.opacity = "0.6";
    cell.style.letterSpacing = "0.08em";
    cell.style.textTransform = "uppercase";
    table.append(cell);
  }
  for (const value of ["1", "Вы", String(level)]) {
    const cell = document.createElement("div");
    cell.textContent = value;
    table.append(cell);
  }

  const back = document.createElement("button");
  back.type = "button";
  back.textContent = "Назад";
  back.className = "dungeon-button dungeon-back";
  back.style.fontSize = "18px";
  back.style.padding = "14px 22px";
  back.style.cursor = "pointer";
  back.addEventListener("click", onBack);

  page.append(title, lead, table);
  host.append(back, page);
}
