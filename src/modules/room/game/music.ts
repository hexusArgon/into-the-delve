import { soundContext } from "./sfx.ts";
import fogUrl from "../../../../assets/music/whispers-in-the-fog.mp3";
import deepUrl from "../../../../assets/music/dungeon-deep.mp3";
import pianoUrl from "../../../../assets/music/vampires-piano.mp3";
import placeUrl from "../../../../assets/music/dark-place.mp3";
import cavernsUrl from "../../../../assets/music/ancient-caverns.mp3";
import ambienceUrl from "../../../../assets/music/dungeon-ambience.mp3";
import cavernUrl from "../../../../assets/music/dark-cavern.mp3";

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

const CROSSFADE = 1.6;

/** Два последних трека: [только что, перед ним]. Следующий выбор их пропускает. */
const recent: string[] = [];
const decoded = new Map<string, Promise<AudioBuffer | null>>();
let generation = 0;
let current: { source: AudioBufferSourceNode; gain: GainNode } | null = null;

/**
 * Следующий трек, выбранный заранее. Он декодируется, пока играет текущий, поэтому смена
 * треков не ждёт сети. В памяти держатся только текущий и следующий: семь треков целиком —
 * это около 230 МБ несжатого звука, на телефоне вкладка от такого падает.
 */
let upcoming: string | null = null;

/** Декодирует первый трек до начала боя, чтобы это не попадало на первые секунды. */
export function preloadTracks(onProgress?: (ratio: number) => void): Promise<void> {
  if (typeof AudioContext === "undefined" || started) {
    onProgress?.(1);
    return Promise.resolve();
  }
  upcoming ??= chooseTrack();
  if (!upcoming) {
    onProgress?.(1);
    return Promise.resolve();
  }
  return loadTrack(soundContext(), upcoming).then(() => onProgress?.(1));
}

/** Случайный трек из семи. По окончании — другой, не из двух предыдущих. */
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
  await playNext(ctx, master);
}

async function playNext(ctx: AudioContext, master: GainNode): Promise<void> {
  const token = ++generation;
  const picked = await takeTrack(ctx);
  if (!picked || token !== generation || musicGain !== master) return;
  recent.unshift(picked.url);
  if (recent.length > 2) recent.pop();
  upcoming = chooseTrack();
  forgetExcept(picked.url, upcoming);
  if (upcoming) void loadTrack(ctx, upcoming);

  const now = ctx.currentTime;
  const fade = Math.min(CROSSFADE, Math.max(0.4, picked.buffer.duration * 0.12));
  fadeOut(current, now, fade);

  const source = ctx.createBufferSource();
  const gain = ctx.createGain();
  source.buffer = picked.buffer;
  source.loop = false;
  source.connect(gain);
  gain.connect(master);
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(1, now + fade);
  source.start(now);
  current = { source, gain };

  let handed = false;
  let timer = 0;
  const go = (): void => {
    if (handed || token !== generation) return;
    handed = true;
    window.clearTimeout(timer);
    void playNext(ctx, master);
  };
  source.onended = () => {
    try {
      source.disconnect();
      gain.disconnect();
    } catch {
      /* узел уже снят */
    }
    go();
  };
  const lead = Math.max(0.3, picked.buffer.duration - fade);
  timer = window.setTimeout(go, lead * 1000);
}

function fadeOut(playing: { source: AudioBufferSourceNode; gain: GainNode } | null, now: number, fade: number): void {
  if (!playing) return;
  playing.gain.gain.cancelScheduledValues(now);
  playing.gain.gain.setValueAtTime(Math.max(0.0001, playing.gain.gain.value), now);
  playing.gain.gain.exponentialRampToValueAtTime(0.0001, now + fade);
  try {
    playing.source.stop(now + fade);
  } catch {
    /* трек уже доиграл */
  }
}

/** Случайный трек, кроме двух последних и уже опробованных. Пусто — хотя бы не предыдущий. */
function chooseTrack(skip: ReadonlySet<string> = new Set()): string | null {
  const last = recent[0];
  const before = recent[1];
  const open = TRACKS.filter((url) => !skip.has(url));
  const fresh = open.filter((url) => url !== last && url !== before);
  const notLast = open.filter((url) => url !== last);
  const pool = fresh.length > 0 ? fresh : notLast.length > 0 ? notLast : open;
  return pool[Math.floor(Math.random() * pool.length)] ?? null;
}

/** Заранее выбранный трек; если он не скачался, другой из тех же правил. */
async function takeTrack(ctx: AudioContext): Promise<{ url: string; buffer: AudioBuffer } | null> {
  const tried = new Set<string>();
  let url = upcoming ?? chooseTrack();
  upcoming = null;
  while (url) {
    tried.add(url);
    const buffer = await loadTrack(ctx, url);
    if (buffer) return { url, buffer };
    url = chooseTrack(tried);
  }
  return null;
}

/** Отпускает декодированные треки, кроме названных. Играющий буфер держит сам источник звука. */
function forgetExcept(...keep: (string | null)[]): void {
  for (const url of decoded.keys()) if (!keep.includes(url)) decoded.delete(url);
}

function loadTrack(ctx: AudioContext, url: string): Promise<AudioBuffer | null> {
  const cached = decoded.get(url);
  if (cached) return cached;
  const pending = fetch(url)
    .then((response) => {
      if (!response.ok) throw new Error(response.statusText);
      return response.arrayBuffer();
    })
    .then((bytes) => ctx.decodeAudioData(bytes))
    .catch(() => {
      decoded.delete(url);
      return null;
    });
  decoded.set(url, pending);
  return pending;
}
