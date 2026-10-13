import type { WeaponId } from "../data/weapons.ts";
import type { Dir, Fighter, RoomState } from "./sim.ts";
import { attackCells, livingMonsters } from "./sim.ts";
import { playMonsterVoice, type MonsterCue } from "./voices.ts";
import airUrl from "../../../../assets/sfx/sword-air.mp3";
import oneUrl from "../../../../assets/sfx/sword-one.mp3";
import manyUrl from "../../../../assets/sfx/sword-many.mp3";
import fleshUrl from "../../../../assets/sfx/sword-flesh.mp3";
import ironUrl from "../../../../assets/sfx/sword-iron.mp3";
import boneUrl from "../../../../assets/sfx/sword-bone.mp3";
import stoneUrl from "../../../../assets/sfx/sword-stone.mp3";
import breakIronUrl from "../../../../assets/sfx/break-hot-iron.mp3";
import breakBladeUrl from "../../../../assets/sfx/break-blade.mp3";
import breakIceUrl from "../../../../assets/sfx/break-ice.mp3";
import heroFallUrl from "../../../../assets/sfx/hero-fall.mp3";
import heroDeath1Url from "../../../../assets/sfx/hero-death-1.mp3";
import heroDeath2Url from "../../../../assets/sfx/hero-death-2.mp3";
import heroDeath3Url from "../../../../assets/sfx/hero-death-3.mp3";
import heroImpactUrl from "../../../../assets/sfx/hero-impact.mp3";
import weaponSwordUrl from "../../../../assets/sfx/weapon-sword.mp3";
import weaponAxeUrl from "../../../../assets/sfx/weapon-axe.mp3";
import weaponDualUrl from "../../../../assets/sfx/weapon-dual.mp3";
import weaponSpearUrl from "../../../../assets/sfx/weapon-spear.mp3";
import weaponStaffUrl from "../../../../assets/sfx/weapon-staff.mp3";
import weaponGlovesUrl from "../../../../assets/sfx/weapon-gloves.mp3";
import weaponPistolUrl from "../../../../assets/sfx/weapon-pistol.mp3";
import weaponRifleUrl from "../../../../assets/sfx/weapon-rifle.mp3";
import weaponShotgunUrl from "../../../../assets/sfx/weapon-shotgun.mp3";

const SWING_SECONDS = 0.28;

const PAN: Record<Dir, number> = { left: -0.55, right: 0.55, up: 0, down: 0 };

let context: AudioContext | null = null;

function audio(): AudioContext {
  if (!context) context = new AudioContext();
  if (context.state === "suspended") void context.resume();
  return context;
}

export function soundContext(): AudioContext {
  return audio();
}

let sfxBus: GainNode | null = null;
let sfxOn = readFlag("dungeon-sfx");
let sfxVol = readPercent("dungeon-sfx-volume");

function readFlag(key: string): boolean {
  try {
    return localStorage.getItem(key) !== "0";
  } catch {
    return true;
  }
}

function writeFlag(key: string, on: boolean): void {
  try {
    localStorage.setItem(key, on ? "1" : "0");
  } catch {
    /* приватный режим браузера */
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

/** Общая шина эффектов. Выключенный звук глушит её, не каждый ролик отдельно. */
export function sfxOutput(ctx: AudioContext): GainNode {
  if (!sfxBus || sfxBus.context !== ctx) {
    sfxBus = ctx.createGain();
    sfxBus.gain.value = sfxLevel();
    sfxBus.connect(ctx.destination);
  }
  return sfxBus;
}

export function sfxEnabled(): boolean {
  return sfxOn;
}

export function setSfxEnabled(on: boolean): void {
  sfxOn = on;
  writeFlag("dungeon-sfx", on);
  applySfx();
}

export function sfxVolume(): number {
  return sfxVol;
}

export function setSfxVolume(level: number): void {
  sfxVol = clamp01(level);
  writePercent("dungeon-sfx-volume", sfxVol);
  applySfx();
}

function sfxLevel(): number {
  return sfxOn ? sfxVol : 0;
}

function applySfx(): void {
  if (sfxBus) sfxBus.gain.value = sfxLevel();
}

function noise(ctx: AudioContext, seconds: number): AudioBuffer {
  const length = Math.floor(ctx.sampleRate * seconds);
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < length; i += 1) data[i] = Math.random() * 2 - 1;
  return buffer;
}

/** Взмах: воздух проходит мимо уха в середине удара, сверху короткий шип клинка. */
export function playSwordSwing(facing: Dir): void {
  if (typeof AudioContext === "undefined") return;
  const ctx = audio();
  const t = ctx.currentTime;

  const source = ctx.createBufferSource();
  source.buffer = noise(ctx, SWING_SECONDS);

  const air = ctx.createBiquadFilter();
  air.type = "bandpass";
  air.Q.setValueAtTime(0.85, t);
  air.frequency.setValueAtTime(280, t);
  air.frequency.exponentialRampToValueAtTime(1900, t + 0.14);
  air.frequency.exponentialRampToValueAtTime(240, t + SWING_SECONDS);

  const edge = ctx.createBiquadFilter();
  edge.type = "highpass";
  edge.frequency.setValueAtTime(900, t);
  edge.frequency.exponentialRampToValueAtTime(2400, t + 0.1);
  edge.frequency.exponentialRampToValueAtTime(700, t + 0.2);

  const body = ctx.createGain();
  body.gain.setValueAtTime(0.001, t);
  body.gain.exponentialRampToValueAtTime(0.35, t + 0.04);
  body.gain.exponentialRampToValueAtTime(0.85, t + 0.14);
  body.gain.exponentialRampToValueAtTime(0.001, t + SWING_SECONDS);

  const hiss = ctx.createGain();
  hiss.gain.setValueAtTime(0.001, t);
  hiss.gain.exponentialRampToValueAtTime(0.16, t + 0.08);
  hiss.gain.exponentialRampToValueAtTime(0.001, t + 0.2);

  const pan = ctx.createStereoPanner();
  pan.pan.setValueAtTime(PAN[facing], t);

  source.connect(air);
  air.connect(body);
  source.connect(edge);
  edge.connect(hiss);
  body.connect(pan);
  hiss.connect(pan);
  pan.connect(sfxOutput(ctx));

  source.start(t);
  source.stop(t + SWING_SECONDS);
}

/**
 * Записи с zvukogram.com/category/zvuki-mecha/.
 * Воздух — «Несильный удар мечом по воздуху».
 * Одна цель — «Одиночный точный удар по цели».
 * Несколько — «Массивный удар мечом».
 * Плоть — «Насаживающий проникающий удар», железо — «Точное попадание стальным мечом»,
 * кость — «Удар меча по кости», камень — «мечом ударили по стене».
 */
export type SwordBlow = "air" | "one" | "many" | "flesh" | "iron" | "bone" | "stone";

/** Запись из листа «Weapons», столбец ссылки. Dual Blades — та же запись дважды за ход. */
const WEAPON_CLIP: Record<WeaponId, string> = {
  sword: weaponSwordUrl,
  axe: weaponAxeUrl,
  dual: weaponDualUrl,
  spear: weaponSpearUrl,
  staff: weaponStaffUrl,
  gloves: weaponGlovesUrl,
  pistol: weaponPistolUrl,
  rifle: weaponRifleUrl,
  shotgun: weaponShotgunUrl,
};

const CLIP: Record<SwordBlow, string> = {
  air: airUrl,
  one: oneUrl,
  many: manyUrl,
  flesh: fleshUrl,
  iron: ironUrl,
  bone: boneUrl,
  stone: stoneUrl,
};

const clips = new Map<SwordBlow, AudioBuffer>();
const loading = new Map<string, Promise<AudioBuffer>>();

const BREAKS = [breakIronUrl, breakBladeUrl, breakIceUrl];
let lastBreak = -1;

const HERO_DEATHS = [heroDeath1Url, heroDeath2Url, heroDeath3Url];
let lastHeroDeath = -1;

function targetsInArc(state: RoomState): Fighter[] {
  const cells = attackCells(state);
  return livingMonsters(state).filter((monster) => cells.some((cell) => cell.x === monster.x && cell.y === monster.y));
}

/** Воздух, если дуга пустая. Несколько целей — один разруб. Иначе материал: щит звучит как железо. */
export function swordBlowFor(state: RoomState): SwordBlow {
  const targets = targetsInArc(state);
  if (targets.length === 0) return "air";
  if (targets.length > 1) return "many";
  const foe = targets[0]!;
  if (foe.shield > 0) return "iron";
  return foe.body;
}

export function playWeaponSound(id: WeaponId, facing: Dir): void {
  if (typeof AudioContext === "undefined") return;
  audio();
  const times = id === "dual" ? 2 : 1;
  const cached = weaponClips.get(id);
  const start = (buffer: AudioBuffer): void => {
    for (let i = 0; i < times; i += 1) startClip(buffer, facing, i * 0.16);
  };
  if (cached) {
    start(cached);
    return;
  }
  void loadUrl(WEAPON_CLIP[id])
    .then((buffer) => {
      weaponClips.set(id, buffer);
      start(buffer);
    })
    .catch(() => undefined);
}

/** Магазин и затвор. Rifle и дробовик чуть тяжелее пистолета. */
export function playReload(id: WeaponId, facing: Dir): void {
  if (typeof AudioContext === "undefined") return;
  const ctx = audio();
  const t = ctx.currentTime;
  const heavy = id === "rifle" || id === "shotgun";
  metalClick(ctx, t, facing, heavy ? 1600 : 2200, heavy ? 0.4 : 0.3);
  metalClick(ctx, t + (heavy ? 0.16 : 0.1), facing, heavy ? 700 : 1100, heavy ? 0.48 : 0.34);
  slideRack(ctx, t + (heavy ? 0.34 : 0.22), facing, heavy);
}

function metalClick(ctx: AudioContext, t: number, facing: Dir, freq: number, loud: number): void {
  const source = ctx.createBufferSource();
  source.buffer = noise(ctx, 0.04);
  const filter = ctx.createBiquadFilter();
  filter.type = "bandpass";
  filter.frequency.setValueAtTime(freq, t);
  filter.Q.setValueAtTime(1.4, t);
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(loud, t);
  gain.gain.exponentialRampToValueAtTime(0.001, t + 0.04);
  const pan = ctx.createStereoPanner();
  pan.pan.setValueAtTime(PAN[facing] * 0.25, t);
  source.connect(filter);
  filter.connect(gain);
  gain.connect(pan);
  pan.connect(sfxOutput(ctx));
  source.start(t);
  source.stop(t + 0.045);
}

function slideRack(ctx: AudioContext, t: number, facing: Dir, heavy: boolean): void {
  const dur = heavy ? 0.16 : 0.1;
  const source = ctx.createBufferSource();
  source.buffer = noise(ctx, dur);
  const filter = ctx.createBiquadFilter();
  filter.type = "bandpass";
  filter.Q.setValueAtTime(0.8, t);
  filter.frequency.setValueAtTime(heavy ? 1400 : 1800, t);
  filter.frequency.exponentialRampToValueAtTime(heavy ? 380 : 520, t + dur);
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(heavy ? 0.42 : 0.32, t);
  gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
  const pan = ctx.createStereoPanner();
  pan.pan.setValueAtTime(PAN[facing] * 0.25, t);
  source.connect(filter);
  filter.connect(gain);
  gain.connect(pan);
  pan.connect(sfxOutput(ctx));
  source.start(t);
  source.stop(t + dur);
}

const weaponClips = new Map<WeaponId, AudioBuffer>();

export function preloadSwordBlows(): void {
  if (typeof AudioContext === "undefined") return;
  (Object.keys(WEAPON_CLIP) as WeaponId[]).forEach((id) => {
    void loadUrl(WEAPON_CLIP[id]).then((buffer) => {
      weaponClips.set(id, buffer);
    });
  });
  (Object.keys(CLIP) as SwordBlow[]).forEach((kind) => {
    void loadClip(kind);
  });
  BREAKS.forEach((url) => {
    void loadUrl(url);
  });
  void loadUrl(heroFallUrl);
  void loadUrl(heroImpactUrl);
  HERO_DEATHS.forEach((url) => {
    void loadUrl(url);
  });
}

function loadUrl(url: string): Promise<AudioBuffer> {
  const pending = loading.get(url);
  if (pending) return pending;
  const request = fetch(url)
    .then((response) => {
      if (!response.ok) throw new Error(response.statusText);
      return response.arrayBuffer();
    })
    .then((bytes) => audio().decodeAudioData(bytes))
    .catch((error: unknown) => {
      loading.delete(url);
      throw error;
    });
  loading.set(url, request);
  return request;
}

function loadClip(kind: SwordBlow): Promise<AudioBuffer> {
  const cached = clips.get(kind);
  if (cached) return Promise.resolve(cached);
  return loadUrl(CLIP[kind]).then((buffer) => {
    clips.set(kind, buffer);
    return buffer;
  });
}

function startClip(buffer: AudioBuffer, facing: Dir, delay = 0): void {
  const ctx = audio();
  const t = ctx.currentTime + delay;
  const source = ctx.createBufferSource();
  source.buffer = buffer;
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.9, t);
  const pan = ctx.createStereoPanner();
  pan.pan.setValueAtTime(PAN[facing], t);
  source.connect(gain);
  gain.connect(pan);
  pan.connect(sfxOutput(ctx));
  source.start(t);
}

export function playMonsterCue(kind: string, cue: MonsterCue, facing: Dir): void {
  if (typeof AudioContext === "undefined") return;
  playMonsterVoice(audio(), kind, cue, PAN[facing] * 0.35);
}

/** Смерть героя. Обрыв — крик с эхом. Иначе случайный вопль, в конце глухой удар о землю. */
export function playHeroDeath(facing: Dir, fell: boolean): void {
  if (typeof AudioContext === "undefined") return;
  audio();
  if (fell) {
    void loadUrl(heroFallUrl)
      .then((buffer) => startShout(buffer, facing, 0.48))
      .catch(() => undefined);
    return;
  }
  let index = Math.floor(Math.random() * HERO_DEATHS.length);
  if (index === lastHeroDeath) index = (index + 1) % HERO_DEATHS.length;
  lastHeroDeath = index;
  const url = HERO_DEATHS[index] ?? HERO_DEATHS[0];
  if (!url) return;
  void Promise.all([loadUrl(url), loadUrl(heroImpactUrl)])
    .then(([voice, impact]) => {
      const heard = startShout(voice, facing, 0.5);
      startImpact(impact, heard);
    })
    .catch(() => undefined);
}

function startShout(buffer: AudioBuffer, facing: Dir, loud: number): number {
  const ctx = audio();
  const t = ctx.currentTime;
  const heard = Math.min(2, buffer.duration);
  const fade = Math.min(0.2, heard * 0.12);
  const source = ctx.createBufferSource();
  source.buffer = buffer;
  const low = ctx.createBiquadFilter();
  low.type = "highpass";
  low.frequency.setValueAtTime(120, t);
  const body = ctx.createBiquadFilter();
  body.type = "peaking";
  body.frequency.setValueAtTime(1400, t);
  body.Q.setValueAtTime(0.8, t);
  body.gain.setValueAtTime(2, t);
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(loud, t);
  if (heard > fade) gain.gain.setValueAtTime(loud, t + heard - fade);
  gain.gain.exponentialRampToValueAtTime(0.001, t + heard);
  const pan = ctx.createStereoPanner();
  pan.pan.setValueAtTime(PAN[facing] * 0.12, t);
  source.connect(low);
  low.connect(body);
  body.connect(gain);
  gain.connect(pan);
  pan.connect(sfxOutput(ctx));
  source.start(t);
  source.stop(t + heard);
  return heard;
}

/** Глухой удар о землю в конце вопля. */
function startImpact(buffer: AudioBuffer, after: number): void {
  const ctx = audio();
  const heard = buffer.duration;
  const fade = Math.min(0.2, heard * 0.15);
  const t = ctx.currentTime + Math.max(0, after - 0.12);
  const source = ctx.createBufferSource();
  source.buffer = buffer;
  const mud = ctx.createBiquadFilter();
  mud.type = "lowpass";
  mud.frequency.setValueAtTime(420, t);
  mud.Q.setValueAtTime(0.6, t);
  const thump = ctx.createBiquadFilter();
  thump.type = "peaking";
  thump.frequency.setValueAtTime(90, t);
  thump.Q.setValueAtTime(0.8, t);
  thump.gain.setValueAtTime(4, t);
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.22, t);
  if (heard > fade) gain.gain.setValueAtTime(0.22, t + heard - fade);
  gain.gain.exponentialRampToValueAtTime(0.001, t + heard);
  source.connect(mud);
  mud.connect(thump);
  thump.connect(gain);
  gain.connect(sfxOutput(ctx));
  source.start(t);
}

/** Мягкий шаг по камню. Громкость нарочно ниже ударов. */
export function playFootstep(facing: Dir, loud = 0.13): void {
  if (typeof AudioContext === "undefined") return;
  const ctx = audio();
  const t = ctx.currentTime;
  const source = ctx.createBufferSource();
  source.buffer = noise(ctx, 0.06);
  source.playbackRate.setValueAtTime(0.88 + Math.random() * 0.24, t);

  const body = ctx.createBiquadFilter();
  body.type = "lowpass";
  body.frequency.setValueAtTime(380 + Math.random() * 160, t);

  const gain = ctx.createGain();
  gain.gain.setValueAtTime(loud, t);
  gain.gain.exponentialRampToValueAtTime(0.001, t + 0.06);

  const pan = ctx.createStereoPanner();
  pan.pan.setValueAtTime(PAN[facing] * 0.2, t);

  source.connect(body);
  body.connect(gain);
  gain.connect(pan);
  pan.connect(sfxOutput(ctx));
  source.start(t);
  source.stop(t + 0.07);
}

export function playSwordBlow(kind: SwordBlow, facing: Dir): void {
  if (typeof AudioContext === "undefined") return;
  audio();
  const cached = clips.get(kind);
  if (cached) {
    startClip(cached, facing);
    return;
  }
  void loadClip(kind)
    .then((buffer) => startClip(buffer, facing))
    .catch(() => {
      if (kind === "air") playSwordSwing(facing);
    });
}

/** Звонкий удар по броне: запись светлее, сверху короткий металлический хвост. Каждый срыв — случайный из трёх. */
export function playShieldBreak(facing: Dir): void {
  if (typeof AudioContext === "undefined") return;
  audio();
  let index = Math.floor(Math.random() * BREAKS.length);
  if (index === lastBreak) index = (index + 1) % BREAKS.length;
  lastBreak = index;
  const url = BREAKS[index] ?? BREAKS[0];
  if (!url) return;
  void loadUrl(url)
    .then((buffer) => startBreak(buffer, facing))
    .catch(() => undefined);
}

function startBreak(buffer: AudioBuffer, facing: Dir): void {
  const ctx = audio();
  const t = ctx.currentTime;
  const source = ctx.createBufferSource();
  source.buffer = buffer;

  const mud = ctx.createBiquadFilter();
  mud.type = "highpass";
  mud.frequency.setValueAtTime(380, t);
  mud.Q.setValueAtTime(0.7, t);

  const ring = ctx.createBiquadFilter();
  ring.type = "peaking";
  ring.frequency.setValueAtTime(3200, t);
  ring.Q.setValueAtTime(1.1, t);
  ring.gain.setValueAtTime(6, t);

  const air = ctx.createBiquadFilter();
  air.type = "highshelf";
  air.frequency.setValueAtTime(5400, t);
  air.gain.setValueAtTime(4, t);

  const delay = ctx.createDelay(0.05);
  delay.delayTime.setValueAtTime(0.0048, t);
  const feedback = ctx.createGain();
  feedback.gain.setValueAtTime(0.28, t);
  const bright = ctx.createBiquadFilter();
  bright.type = "highpass";
  bright.frequency.setValueAtTime(1600, t);

  const wet = ctx.createGain();
  wet.gain.setValueAtTime(0.35, t);
  const level = ctx.createGain();
  level.gain.setValueAtTime(0.72, t);
  const pan = ctx.createStereoPanner();
  pan.pan.setValueAtTime(PAN[facing], t);

  source.connect(mud);
  mud.connect(ring);
  ring.connect(air);
  air.connect(level);
  air.connect(delay);
  delay.connect(bright);
  bright.connect(feedback);
  feedback.connect(delay);
  bright.connect(wet);
  wet.connect(level);
  level.connect(pan);
  pan.connect(sfxOutput(ctx));

  source.start(t);
}
