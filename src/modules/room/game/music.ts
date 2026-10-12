import { soundContext } from "./sfx.ts";

/** Полная громкость фона. Осцилляторы уже тихие, ползунок умножает этот потолок. */
const MUSIC_PEAK = 0.11;

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

/** Тихий мрачный фон: низкие струны, далёкий хор, редкий колокол. Включается с первого жеста. */
export function installDungeonMusic(): void {
  if (armed || started) return;
  armed = true;
  const arm = (): void => {
    if (started) return;
    started = true;
    window.removeEventListener("pointerdown", arm);
    window.removeEventListener("keydown", arm);
    begin(soundContext());
  };
  window.addEventListener("pointerdown", arm);
  window.addEventListener("keydown", arm);
}

function begin(ctx: AudioContext): void {
  const now = ctx.currentTime;
  const master = ctx.createGain();
  musicGain = master;
  master.gain.setValueAtTime(0.0001, now);
  if (musicOn && musicVol > 0) master.gain.exponentialRampToValueAtTime(Math.max(0.0001, MUSIC_PEAK * musicVol), now + 3);
  master.connect(ctx.destination);

  const strings = ctx.createBiquadFilter();
  strings.type = "lowpass";
  strings.frequency.setValueAtTime(240, now);
  strings.connect(master);
  const bow = ctx.createOscillator();
  bow.frequency.value = 0.07;
  const bowDepth = ctx.createGain();
  bowDepth.gain.value = 30;
  bow.connect(bowDepth);
  bowDepth.connect(strings.frequency);
  bow.start();

  tone(ctx, strings, 110, "sawtooth", 0.16);
  tone(ctx, strings, 130.81, "triangle", 0.05);
  tone(ctx, strings, 164.81, "triangle", 0.045);

  const choir = ctx.createGain();
  choir.gain.value = 0.22;
  const mouth = ctx.createBiquadFilter();
  mouth.type = "bandpass";
  mouth.frequency.value = 640;
  mouth.Q.value = 0.8;
  choir.connect(mouth);
  mouth.connect(master);
  tone(ctx, choir, 220, "sine", 0.05, 4.5, 8);
  tone(ctx, choir, 261.63, "sine", 0.035, 4.2, 7);
  tone(ctx, choir, 329.63, "sine", 0.028, 5, 6);
  tone(ctx, choir, 440, "sine", 0.016, 3.8, 5);

  bells(ctx, master, now + 6);
}

function tone(
  ctx: AudioContext,
  dest: AudioNode,
  freq: number,
  type: OscillatorType,
  level: number,
  vibrato = 0,
  depth = 0,
): void {
  const osc = ctx.createOscillator();
  osc.type = type;
  osc.frequency.value = freq;
  const gain = ctx.createGain();
  gain.gain.value = level;
  if (vibrato > 0) {
    const lfo = ctx.createOscillator();
    lfo.frequency.value = vibrato;
    const amount = ctx.createGain();
    amount.gain.value = depth;
    lfo.connect(amount);
    amount.connect(osc.detune);
    lfo.start();
  }
  osc.connect(gain);
  gain.connect(dest);
  osc.start();
}

function bells(ctx: AudioContext, dest: AudioNode, when: number): void {
  const notes = [523.25, 659.25, 880, 493.88];
  const freq = notes[Math.floor(when / 9) % notes.length] ?? 523.25;
  const osc = ctx.createOscillator();
  osc.type = "sine";
  osc.frequency.setValueAtTime(freq, when);
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.0001, when);
  gain.gain.exponentialRampToValueAtTime(0.035, when + 0.03);
  gain.gain.exponentialRampToValueAtTime(0.0001, when + 3.4);
  osc.connect(gain);
  gain.connect(dest);
  osc.start(when);
  osc.stop(when + 3.6);
  const next = when + 9;
  const wait = Math.max(0, (next - ctx.currentTime - 0.5) * 1000);
  window.setTimeout(() => bells(ctx, dest, next), wait);
}
