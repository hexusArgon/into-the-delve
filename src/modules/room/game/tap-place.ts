import type { InstanceKind } from "../data/instances.ts";

/**
 * Инвентарь пальцем без перетаскивания. Первый тап по вещи выбирает её, второй тап по слоту,
 * клетке заточки или хранилищу кладёт туда. Повторный тап по той же вещи делает быстрое
 * действие, как раньше: надеть из мешка или снять со слота. Перетаскивание тоже работает.
 * На экране с мышью не включается: там клик надевает сразу.
 */

export interface TapHooks {
  /** Включено ли (сенсорный экран). */
  enabled: () => boolean;
  /** Только что закончилось перетаскивание: его клик не считается тапом. */
  dragging: () => boolean;
  accepts: (hit: HTMLElement, kind: InstanceKind) => boolean;
  place: (id: string, hit: HTMLElement) => void;
  hone: (slot: "target" | "copy", id: string) => void;
  worn: (id: string) => boolean;
  name: (id: string) => string;
  note: (text: string) => void;
  redraw: () => void;
}

let picked: { id: string; kind: InstanceKind } | null = null;

export function clearPick(): void {
  picked = null;
}

function kindOf(el: HTMLElement): InstanceKind | null {
  const kind = el.dataset.kind;
  return kind === "weapon" || kind === "gear" || kind === "ability" ? kind : null;
}

/** Подсветить выбранную вещь и места, куда её можно положить. Внизу экрана — полоса с отменой. */
export function showPick(page: HTMLElement, hooks: Pick<TapHooks, "accepts" | "name" | "redraw">): void {
  if (!picked) return;
  const chosen = picked;
  const bar = document.createElement("div");
  bar.className = "dungeon-pick-bar";
  bar.setAttribute("role", "status");
  const text = document.createElement("span");
  text.textContent = `${hooks.name(chosen.id)}: tap where it goes`;
  const cancel = document.createElement("button");
  cancel.type = "button";
  cancel.className = "dungeon-button";
  cancel.textContent = "Cancel";
  cancel.addEventListener("click", (event) => {
    event.stopPropagation();
    picked = null;
    hooks.redraw();
  });
  bar.append(text, cancel);
  page.append(bar);
  page.querySelectorAll<HTMLElement>("[data-piece]").forEach((el) => {
    if (el.dataset.piece === chosen.id) el.classList.add("is-picked");
  });
  page.querySelectorAll<HTMLElement>("[data-hone='target'], [data-hone='copy'], [data-drop]").forEach((el) => {
    if (el.dataset.piece === chosen.id) return;
    if (el.dataset.drop === "storage") return;
    if (hooks.accepts(el, chosen.kind)) el.classList.add("is-target");
  });
}

export function armTapPlace(page: HTMLElement, hooks: TapHooks): void {
  page.addEventListener(
    "click",
    (event) => {
      if (!hooks.enabled() || hooks.dragging()) return;
      const hit = (event.target as Element | null)?.closest<HTMLElement>("[data-piece], [data-hone], [data-drop]") ?? null;
      const stop = (): void => {
        event.preventDefault();
        event.stopPropagation();
      };
      if (!picked) {
        const id = hit?.dataset.piece;
        const kind = hit ? kindOf(hit) : null;
        if (!id || !kind) return;
        stop();
        picked = { id, kind };
        hooks.note(`${hooks.name(id)} picked. Tap a slot or a sharpen cell, or tap it again to ${hooks.worn(id) ? "take it off" : "equip it"}.`);
        hooks.redraw();
        return;
      }
      const chosen = picked;
      if (!hit) {
        // Тап мимо слотов (фильтр, поиск, фон) снимает выбор и делает своё.
        picked = null;
        hooks.redraw();
        return;
      }
      if (hit.dataset.piece === chosen.id) {
        // Вторая подряд: обычный клик — быстрое действие.
        picked = null;
        return;
      }
      stop();
      const role = hit.dataset.hone;
      if (role === "target" || role === "copy") {
        picked = null;
        hooks.hone(role, chosen.id);
        return;
      }
      const other = hit.dataset.piece;
      const otherKind = kindOf(hit);
      if (other && otherKind && hit.dataset.drop === "storage" && !hooks.worn(chosen.id)) {
        // Из мешка выбрана другая вещь мешка: выбор переходит на неё.
        picked = { id: other, kind: otherKind };
        hooks.note(`${hooks.name(other)} picked.`);
        hooks.redraw();
        return;
      }
      if (hit.dataset.drop && hooks.accepts(hit, chosen.kind)) {
        picked = null;
        hooks.place(chosen.id, hit);
        return;
      }
      picked = null;
      hooks.note("That does not fit there.");
      hooks.redraw();
    },
    true,
  );
}
