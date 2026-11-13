/**
 * Главное меню без мыши и с подписями: подпись и фигура на картинке подсвечиваются вместе,
 * подпись нажимается сама, клавиши 1–4 открывают пункт, стрелки и Tab переводят фокус.
 */

export interface MenuEntry {
  shape: SVGPolygonElement;
  label: HTMLElement;
  key: string;
  run: () => void;
}

function blocked(): boolean {
  // Поверх меню открыто окно (настройки) или фокус в поле ввода: клавиши меню молчат.
  if (document.querySelector(".dungeon-settings")) return true;
  const active = document.activeElement;
  return active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement || active instanceof HTMLSelectElement;
}

export function armMenu(frame: HTMLElement, entries: readonly MenuEntry[], showKeys: boolean): void {
  for (const entry of entries) {
    const lit = (on: boolean): void => {
      entry.label.classList.toggle("is-lit", on);
    };
    entry.shape.addEventListener("pointerenter", () => lit(true));
    entry.shape.addEventListener("pointerleave", () => lit(document.activeElement === entry.shape));
    entry.shape.addEventListener("focus", () => lit(true));
    entry.shape.addEventListener("blur", () => lit(false));
    entry.label.classList.add("is-live");
    entry.label.addEventListener("click", entry.run);
    entry.label.addEventListener("pointerenter", () => {
      lit(true);
      entry.shape.classList.add("is-lit");
    });
    entry.label.addEventListener("pointerleave", () => {
      lit(false);
      entry.shape.classList.remove("is-lit");
    });
    if (showKeys) {
      const key = document.createElement("kbd");
      key.className = "dungeon-hot-key";
      key.textContent = entry.key;
      entry.label.prepend(key);
    }
  }

  const onKey = (event: KeyboardEvent): void => {
    if (!frame.isConnected) {
      window.removeEventListener("keydown", onKey);
      return;
    }
    if (event.altKey || event.ctrlKey || event.metaKey || blocked()) return;
    const hit = entries.find((entry) => entry.key === event.key);
    if (hit) {
      event.preventDefault();
      hit.run();
      return;
    }
    const moves: Record<string, number> = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 };
    const step = moves[event.key];
    if (step === undefined) return;
    event.preventDefault();
    const at = entries.findIndex((entry) => entry.shape === document.activeElement);
    const next = at < 0 ? 0 : (at + step + entries.length) % entries.length;
    entries[next]?.shape.focus();
  };
  window.addEventListener("keydown", onKey);
}
