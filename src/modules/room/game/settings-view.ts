import { musicEnabled, musicVolume, setMusicEnabled, setMusicVolume } from "./music.ts";
import { playFootstep, setSfxEnabled, setSfxVolume, sfxEnabled, sfxVolume } from "./sfx.ts";

/** Окно настроек поверх меню. Закрывается крестом, фоном и Escape. */
export function openSettings(host: HTMLElement): void {
  const veil = document.createElement("div");
  veil.className = "dungeon-settings";

  const panel = document.createElement("div");
  panel.className = "dungeon-panel dungeon-settings-panel";
  panel.addEventListener("click", (event) => event.stopPropagation());

  const title = document.createElement("h1");
  title.className = "dungeon-title";
  title.textContent = "Настройки";

  const close = (): void => {
    veil.remove();
    window.removeEventListener("keydown", onKey);
  };
  const onKey = (event: KeyboardEvent): void => {
    if (event.key === "Escape") close();
  };
  window.addEventListener("keydown", onKey);
  veil.addEventListener("click", close);

  const done = document.createElement("button");
  done.type = "button";
  done.className = "dungeon-button";
  done.textContent = "Закрыть";
  done.addEventListener("click", close);

  panel.append(
    title,
    channelRow("Музыка", musicEnabled, setMusicEnabled, musicVolume, setMusicVolume),
    channelRow("Звуки", sfxEnabled, setSfxEnabled, sfxVolume, setSfxVolume, () => {
      if (sfxEnabled()) playFootstep("right", 0.2);
    }),
    done,
  );
  veil.append(panel);
  host.append(veil);
}

function channelRow(
  label: string,
  readOn: () => boolean,
  writeOn: (on: boolean) => void,
  readVolume: () => number,
  writeVolume: (level: number) => void,
  preview?: () => void,
): HTMLElement {
  const row = document.createElement("div");
  row.className = "dungeon-setting";
  const name = document.createElement("span");
  name.textContent = label;

  const slider = document.createElement("input");
  slider.type = "range";
  slider.min = "0";
  slider.max = "100";
  slider.step = "1";
  slider.className = "dungeon-setting-slider";
  slider.setAttribute("aria-label", `Громкость: ${label}`);

  const value = document.createElement("span");
  value.className = "dungeon-setting-value";

  const button = document.createElement("button");
  button.type = "button";
  button.className = "dungeon-button";

  const paint = (): void => {
    const on = readOn();
    const pct = Math.round(readVolume() * 100);
    slider.value = String(pct);
    value.textContent = `${pct}%`;
    button.textContent = on ? "Вкл" : "Выкл";
    button.setAttribute("aria-pressed", on ? "true" : "false");
  };
  slider.addEventListener("input", () => {
    writeVolume(Number(slider.value) / 100);
    paint();
  });
  slider.addEventListener("change", () => preview?.());
  button.addEventListener("click", () => {
    writeOn(!readOn());
    paint();
  });
  paint();
  row.append(name, slider, value, button);
  return row;
}
