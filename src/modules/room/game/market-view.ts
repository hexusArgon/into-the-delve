/**
 * Торговый дом, пока рынок игроков переезжает на сервер iDos. Прежняя доска жила в памяти
 * вкладки: покупка сохранялась без списания токена, выставленная вещь терялась при перезагрузке.
 */
export function paintMarketClosed(host: HTMLElement, onBack: () => void): void {
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
  title.textContent = "Trading House";

  const lead = document.createElement("p");
  lead.className = "dungeon-guild-lead";
  lead.textContent = "Closed while the player market moves to the server.";

  const body = document.createElement("p");
  body.className = "dungeon-guild-lead";
  body.textContent =
    "Lots, bids and payouts in Into the Delve tokens will be held by the server, so every trade is final and fair. Your gear and tokens are untouched.";

  const back = document.createElement("button");
  back.type = "button";
  back.textContent = "Back";
  back.className = "dungeon-button dungeon-back";
  back.addEventListener("click", onBack);

  page.append(title, lead, body);
  host.append(back, page);
}
