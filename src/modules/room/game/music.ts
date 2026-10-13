import { soundContext } from "./sfx.ts";
import fogUrl from "../../../../assets/music/whispers-in-the-fog.ogg";
import deepUrl from "../../../../assets/music/dungeon-deep.mp3";
import pianoUrl from "../../../../assets/music/vampires-piano.mp3";
import placeUrl from "../../../../assets/music/dark-place.ogg";
import cavernsUrl from "../../../../assets/music/ancient-caverns.ogg";
import ambienceUrl from "../../../../assets/music/dungeon-ambience.ogg";
import cavernUrl from "../../../../assets/music/dark-cavern.ogg";

/**
 * Потолок громкости записанных треков. Ползунок в настройках умножает его.
 * Старый синтезатор был тише на уровне осцилляторов, поэтому его 0.154 сюда не переносится.
 */
const MUSIC_PEAK = 0.384;

const TRACKS = [fogUrl, deepUrl, pianoUrl, placeUrl, cavernsUrl, ambienceUrl, cavernUrl];

let armed = false;
let started = false;
let musicGain: GainNode | null = null;
let musicOn = readMusic();
let musicVol = readPercent("dungeon-music-volume");

function readMusic(): boolean {
  try {
    return localStorage.getItem("dungeon-music") !== "0";
  } catch {
    return true;
  }
}

function readPercent(key: string): number {
  try {
    const raw = localStorage.getItem(key);
    if (raw === null) return 1;
    const n = Number(raw);
    if (!Number.isFinite(n)) return 1;
    return clamp01(n / 100);
  } catch {
    return 1;
  }
}

function writePercent(key: string, level: number): void {
  try {
    localStorage.setItem(key, String(Math.round(clamp01(level) * 100)));
  } catch {
    /* приватный режим браузера */
  }
}

function clamp01(level: number): number {
  if (!Number.isFinite(level)) return 1;
  return Math.min(1, Math.max(0, level));
}

export function musicEnabled(): boolean {
  return musicOn;
}

export function setMusicEnabled(on: boolean): void {
  musicOn = on;
  try {
    localStorage.setItem("dungeon-music", on ? "1" : "0");
  } catch {
    /* приватный режим браузера */
  }
  applyMusic();
}

export function musicVolume(): number {
  return musicVol;
}

export function setMusicVolume(level: number): void {
  musicVol = clamp01(level);
  writePercent("dungeon-music-volume", musicVol);
  applyMusic();
}

function applyMusic(): void {
  if (!musicGain) return;
  const now = musicGain.context.currentTime;
  const target = musicOn ? Math.max(0.0001, MUSIC_PEAK * musicVol) : 0.0001;
  musicGain.gain.cancelScheduledValues(now);
  musicGain.gain.setValueAtTime(Math.max(0.0001, musicGain.gain.value), now);
  musicGain.gain.exponentialRampToValueAtTime(target, now + 0.2);
}

/** Один случайный трек из семи CC0. Включается с первого клика или клавиши. */
export function installDungeonMusic(): void {
  if (armed || started) return;
  armed = true;
  const arm = (): void => {
    if (started) return;
    started = true;
    window.removeEventListener("pointerdown", arm);
    window.removeEventListener("keydown", arm);
    void begin(soundContext());
  };
  window.addEventListener("pointerdown", arm);
  window.addEventListener("keydown", arm);
}

async function begin(ctx: AudioContext): Promise<void> {
  const now = ctx.currentTime;
  const master = ctx.createGain();
  musicGain = master;
  master.gain.setValueAtTime(0.0001, now);
  if (musicOn && musicVol > 0) {
    master.gain.exponentialRampToValueAtTime(Math.max(0.0001, MUSIC_PEAK * musicVol), now + 2);
  }
  master.connect(ctx.destination);

  const buffer = await loadRandom(ctx);
  if (!buffer || musicGain !== master) return;
  const source = ctx.createBufferSource();
  source.buffer = buffer;
  source.loop = true;
  source.connect(master);
  source.start();
}

async function loadRandom(ctx: AudioContext): Promise<AudioBuffer | null> {
  const left = [...TRACKS];
  while (left.length > 0) {
    const pick = Math.floor(Math.random() * left.length);
    const url = left.splice(pick, 1)[0];
    if (!url) continue;
    const buffer = await loadTrack(ctx, url);
    if (buffer) return buffer;
  }
  return null;
}

function loadTrack(ctx: AudioContext, url: string): Promise<AudioBuffer | null> {
  return fetch(url)
    .then((response) => {
      if (!response.ok) throw new Error(response.statusText);
      return response.arrayBuffer();
    })
    .then((bytes) => ctx.decodeAudioData(bytes))
    .catch(() => null);
}
