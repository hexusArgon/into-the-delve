import { sfxOutput } from "./sfx.ts";

export type MonsterCue = "aggro" | "attack" | "pain" | "death";

type Shape = "bark" | "click" | "moan" | "thud" | "squeak" | "gurgle" | "clack" | "wisp" | "yelp" | "crackle" | "chant" | "creak";

interface Voice {
  shape: Shape;
  /** Атака. */
  bite: number;
  /** Смерть, ниже атаки. */
  fall: number;
  air: number;
  form: number;
  wave: OscillatorType;
}

/** Отдельный голос на id из таблицы монстров. Спора — отдельное существо. */
const VOICE: Record<string, Voice> = {
  "1": { shape: "bark", bite: 280, fall: 180, air: 0.25, form: 820, wave: "sawtooth" },
  "2": { shape: "click", bite: 920, fall: 640, air: 0.7, form: 2600, wave: "square" },
  "3": { shape: "moan", bite: 105, fall: 70, air: 0.5, form: 380, wave: "sawtooth" },
  "4": { shape: "thud", bite: 78, fall: 48, air: 0.75, form: 240, wave: "triangle" },
  "5": { shape: "squeak", bite: 1480, fall: 900, air: 0.3, form: 3100, wave: "square" },
  "6": { shape: "gurgle", bite: 95, fall: 55, air: 0.85, form: 320, wave: "sine" },
  "7": { shape: "clack", bite: 240, fall: 140, air: 0.35, form: 980, wave: "square" },
  "8": { shape: "squeak", bite: 1100, fall: 620, air: 0.4, form: 2100, wave: "square" },
  "9": { shape: "wisp", bite: 540, fall: 280, air: 0.8, form: 1300, wave: "sine" },
  "10": { shape: "yelp", bite: 360, fall: 210, air: 0.28, form: 1100, wave: "sawtooth" },
  "11": { shape: "gurgle", bite: 160, fall: 90, air: 0.72, form: 480, wave: "sine" },
  "12": { shape: "crackle", bite: 680, fall: 320, air: 0.45, form: 1700, wave: "sawtooth" },
  "13": { shape: "gurgle", bite: 72, fall: 42, air: 0.7, form: 260, wave: "sawtooth" },
  "14": { shape: "chant", bite: 196, fall: 130, air: 0.2, form: 700, wave: "triangle" },
  "15": { shape: "bark", bite: 210, fall: 120, air: 0.4, form: 640, wave: "sawtooth" },
  "16": { shape: "creak", bite: 125, fall: 70, air: 0.55, form: 460, wave: "square" },
  "17": { shape: "thud", bite: 150, fall: 80, air: 0.55, form: 860, wave: "square" },
  "18": { shape: "moan", bite: 98, fall: 58, air: 0.82, form: 340, wave: "sine" },
  "19": { shape: "wisp", bite: 310, fall: 170, air: 0.65, form: 1500, wave: "sine" },
  "20": { shape: "click", bite: 740, fall: 420, air: 0.6, form: 2000, wave: "square" },
  spore: { shape: "gurgle", bite: 220, fall: 120, air: 0.8, form: 600, wave: "sine" },
};

const DEFAULT_VOICE: Voice = { shape: "moan", bite: 160, fall: 90, air: 0.4, form: 600, wave: "triangle" };

interface Cry {
  pitch: number;
  air: number;
  form: number;
  wave: OscillatorType;
  pulses: number;
}

const CRIES: Record<string, Cry> = {
  "1": { pitch: 260, air: 0.22, form: 780, wave: "sawtooth", pulses: 3 },
  "2": { pitch: 880, air: 0.62, form: 2600, wave: "square", pulses: 5 },
  "3": { pitch: 110, air: 0.45, form: 420, wave: "sawtooth", pulses: 2 },
  "4": { pitch: 70, air: 0.7, form: 280, wave: "triangle", pulses: 2 },
  "5": { pitch: 1400, air: 0.35, form: 3200, wave: "square", pulses: 4 },
  "6": { pitch: 90, air: 0.8, form: 360, wave: "sine", pulses: 2 },
  "7": { pitch: 220, air: 0.3, form: 900, wave: "square", pulses: 2 },
  "8": { pitch: 980, air: 0.4, form: 2200, wave: "square", pulses: 4 },
  "9": { pitch: 520, air: 0.75, form: 1400, wave: "sine", pulses: 1 },
  "10": { pitch: 340, air: 0.28, form: 1100, wave: "sawtooth", pulses: 3 },
  "11": { pitch: 150, air: 0.72, form: 500, wave: "sine", pulses: 2 },
  "12": { pitch: 640, air: 0.4, form: 1800, wave: "sawtooth", pulses: 3 },
  "13": { pitch: 80, air: 0.65, form: 300, wave: "sawtooth", pulses: 2 },
  "14": { pitch: 190, air: 0.2, form: 700, wave: "triangle", pulses: 2 },
  "15": { pitch: 200, air: 0.35, form: 650, wave: "sawtooth", pulses: 3 },
  "16": { pitch: 130, air: 0.55, form: 480, wave: "square", pulses: 2 },
  "17": { pitch: 160, air: 0.5, form: 900, wave: "square", pulses: 2 },
  "18": { pitch: 100, air: 0.78, form: 380, wave: "sine", pulses: 2 },
  "19": { pitch: 300, air: 0.6, form: 1600, wave: "sine", pulses: 2 },
  "20": { pitch: 760, air: 0.58, form: 2100, wave: "square", pulses: 6 },
};

const DEFAULT_CRY: Cry = { pitch: 170, air: 0.4, form: 600, wave: "triangle", pulses: 2 };

function voiceOf(kind: string): Voice {
  return VOICE[kind] ?? DEFAULT_VOICE;
}

function cryOf(kind: string): Cry {
  return CRIES[kind] ?? DEFAULT_CRY;
}

function noise(ctx: AudioContext, seconds: number): AudioBuffer {
  const length = Math.max(1, Math.floor(ctx.sampleRate * seconds));
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < length; i += 1) data[i] = Math.random() * 2 - 1;
  return buffer;
}

/** Голос монстра из таблицы: агро, атака, вой от боли, смерть. */
export function playMonsterVoice(ctx: AudioContext, kind: string, cue: MonsterCue, pan: number): void {
  if (cue === "attack") {
    strike(ctx, voiceOf(kind), pan);
    return;
  }
  if (cue === "death") {
    perish(ctx, voiceOf(kind), pan);
    return;
  }
  const cry = cryOf(kind);
  const dur = cue === "aggro" ? 0.36 : 0.46;
  const pulses = cue === "aggro" ? cry.pulses : 1;
  const loud = cue === "aggro" ? 0.3 : 0.34;
  const end = cry.pitch * (cue === "aggro" ? 0.92 : 0.62);
  utter(ctx, ctx.currentTime, dur, cry.pitch, end, cry.form, cry.wave, cry.air, loud, pulses, pan);
}

function strike(ctx: AudioContext, voice: Voice, pan: number): void {
  const hits = voice.shape === "click" ? 4 : voice.shape === "bark" || voice.shape === "clack" ? 2 : 1;
  const dur = voice.shape === "click" ? 0.16 : voice.shape === "thud" ? 0.12 : 0.18;
  utter(ctx, ctx.currentTime, dur, voice.bite, voice.bite * 1.25, voice.form, voice.wave, voice.air, 0.36, hits, pan);
}

function perish(ctx: AudioContext, voice: Voice, pan: number): void {
  const pulses = voice.shape === "click" ? 5 : voice.shape === "clack" ? 3 : 1;
  utter(
    ctx,
    ctx.currentTime,
    1.1,
    voice.bite,
    voice.fall,
    voice.form * 0.7,
    voice.wave,
    Math.min(1, voice.air + 0.2),
    0.28,
    pulses,
    pan,
  );
}

function utter(
  ctx: AudioContext,
  t: number,
  dur: number,
  from: number,
  to: number,
  form: number,
  wave: OscillatorType,
  air: number,
  loud: number,
  pulses: number,
  pan: number,
): void {
  const osc = ctx.createOscillator();
  osc.type = wave;
  osc.frequency.setValueAtTime(Math.max(40, from), t);
  osc.frequency.exponentialRampToValueAtTime(Math.max(40, to), t + dur);
  const toneGain = ctx.createGain();
  toneGain.gain.setValueAtTime(1 - air * 0.85, t);
  const breath = ctx.createBufferSource();
  breath.buffer = noise(ctx, dur);
  const filter = ctx.createBiquadFilter();
  filter.type = "bandpass";
  filter.frequency.setValueAtTime(Math.max(80, form), t);
  filter.Q.setValueAtTime(1.3, t);
  const airGain = ctx.createGain();
  airGain.gain.setValueAtTime(air * 0.8, t);
  const master = ctx.createGain();
  const step = dur / pulses;
  for (let i = 0; i < pulses; i += 1) {
    const at = t + i * step;
    const peak = at + Math.min(0.03, step * 0.22);
    const end = at + step * 0.9;
    master.gain.setValueAtTime(0.001, at);
    master.gain.exponentialRampToValueAtTime(loud, Math.max(peak, at + 0.01));
    master.gain.exponentialRampToValueAtTime(0.001, Math.max(end, peak + 0.02));
  }
  const stereo = ctx.createStereoPanner();
  stereo.pan.setValueAtTime(pan, t);
  osc.connect(toneGain);
  toneGain.connect(master);
  breath.connect(filter);
  filter.connect(airGain);
  airGain.connect(master);
  master.connect(stereo);
  stereo.connect(sfxOutput(ctx));
  osc.start(t);
  osc.stop(t + dur + 0.02);
  breath.start(t);
  breath.stop(t + dur + 0.02);
}
