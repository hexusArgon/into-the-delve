import loadingUrl from "../../../../assets/loading-castle.jpg";

/** Экран с замком и синей полосой. Закрывает хаб, урок и комнату, пока иконки не нарисованы. */
export function loadingVeil(): { root: HTMLElement; setRatio: (ratio: number) => void } {
  const root = document.createElement("div");
  root.className = "dungeon-loading";
  const img = document.createElement("img");
  img.src = loadingUrl;
  img.alt = "";
  const bar = document.createElement("div");
  bar.className = "dungeon-load-bar";
  const track = document.createElement("div");
  track.className = "dungeon-load-track";
  const fill = document.createElement("div");
  fill.className = "dungeon-load-fill";
  track.append(fill);
  bar.append(track);
  root.append(img, bar);
  return {
    root,
    setRatio(ratio: number) {
      fill.style.width = `${Math.max(0, Math.min(1, ratio)) * 100}%`;
    },
  };
}
