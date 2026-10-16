import type { AbilityAct } from "./sim.ts";
import { sfxOutput, soundContext } from "./sfx.ts";

interface Cue {
  f0: number;
  f1: number;
  dur: number;
  loud: number;
  /** Тон поверх шума. */
  tone: OscillatorType | null;
}

const CUE: Record<Exclude<AbilityAct, "keg" | "swap">, Cue> = {
  dash: { f0: 420, f1: 1600, dur: 0.22, loud: 0.34, tone: null },
  spit: { f0: 1800, f1: 500, dur: 0.12, loud: 0.3, tone: null },
  leap: { f0: 220, f1: 780, dur: 0.2, loud: 0.32, tone: "triangle" },
  rock: { f0: 240, f1: 70, dur: 0.18, loud: 0.4, tone: null },
  swoop: { f0: 900, f1: 1500, dur: 0.16, loud: 0.28, tone: "square" },
  slime: { f0: 280, f1: 180, dur: 0.22, loud: 0.2, tone: null },
  slash: { f0: 2100, f1: 640, dur: 0.14, loud: 0.32, tone: null },
  wisp: { f0: 740, f1: 380, dur: 0.3, loud: 0.22, tone: "sine" },
  spore: { f0: 900, f1: 420, dur: 0.16, loud: 0.24, tone: null },
  pop: { f0: 700, f1: 180, dur: 0.1, loud: 0.3, tone: null },
  vanish: { f0: 2000, f1: 280, dur: 0.2, loud: 0.26, tone: null },
  flare: { f0: 360, f1: 1700, dur: 0.2, loud: 0.36, tone: "sawtooth" },
  dig: { f0: 200, f1: 120, dur: 0.24, loud: 0.28, tone: null },
  emerge: { f0: 110, f1: 520, dur: 0.22, loud: 0.36, tone: null },
  spires: { f0: 180, f1: 560, dur: 0.28, loud: 0.3, tone: "triangle" },
  tongue: { f0: 280, f1: 1400, dur: 0.12, loud: 0.32, tone: null },
  fall: { f0: 880, f1: 110, dur: 0.26, loud: 0.3, tone: "sine" },
  land: { f0: 160, f1: 60, dur: 0.16, loud: 0.42, tone: null },
  geyser: { f0: 180, f1: 980, dur: 0.24, loud: 0.34, tone: null },
  throw: { f0: 480, f1: 1500, dur: 0.16, loud: 0.3, tone: null },
  splash: { f0: 500, f1: 220, dur: 0.18, loud: 0.32, tone: null },
  charm: { f0: 440, f1: 660, dur: 0.32, loud: 0.2, tone: "sine" },
  hail: { f0: 1800, f1: 900, dur: 0.18, loud: 0.26, tone: null },
  beam: { f0: 980, f1: 720, dur: 0.34, loud: 0.28, tone: "sine" },
  shards: { f0: 2600, f1: 1400, dur: 0.14, loud: 0.3, tone: null },
  sleep: { f0: 220, f1: 160, dur: 0.4, loud: 0.16, tone: "sine" },
  bolt: { f0: 480, f1: 1500, dur: 0.12, loud: 0.3, tone: "sawtooth" },
  ward: { f0: 180, f1: 760, dur: 0.22, loud: 0.26, tone: null },
  blizzard: { f0: 1500, f1: 620, dur: 0.2, loud: 0.16, tone: null },
  arrow: { f0: 720, f1: 240, dur: 0.12, loud: 0.22, tone: null },
  quake: { f0: 120, f1: 42, dur: 0.2, loud: 0.36, tone: "triangle" },
  shard: { f0: 3000, f1: 1400, dur: 0.04, loud: 0.22, tone: "sine" },
};

function noise(ctx: AudioContext, seconds: number): AudioBuffer {
  const length = Math.max(1, Math.floor(ctx.sampleRate * seconds));
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < length; i += 1) data[i] = Math.random() * 2 - 1;
  return buffer;
}

/** Короткий звук сработавшей способности. */
export function playAbility(act: AbilityAct): void {
  if (act === "keg" || act === "swap") return;
  if (typeof AudioContext === "undefined") return;
  const cue = CUE[act];
  const ctx = soundContext();
  const t = ctx.currentTime;
  if (act === "hail") {
    for (let i = 0; i < 4; i += 1) burst(ctx, t + i * 0.05, cue, 0.05);
    return;
  }
  if (act === "bolt") {
    burst(ctx, t, { f0: 2600, f1: 900, dur: 0.05, loud: 0.22, tone: "square" }, 0.05);
    burst(ctx, t + 0.05, { f0: 1700, f1: 420, dur: 0.06, loud: 0.24, tone: "square" }, 0.06);
    burst(ctx, t + 0.07, cue, cue.dur);
    return;
  }
  if (act === "ward") {
    burst(ctx, t, cue, cue.dur);
    burst(ctx, t + 0.05, { f0: 420, f1: 1100, dur: 0.14, loud: 0.14, tone: "triangle" }, 0.14);
    return;
  }
  if (act === "arrow") {
    burst(ctx, t, { f0: 2200, f1: 1400, dur: 0.09, loud: 0.18, tone: "sine" }, 0.09);
    burst(ctx, t + 0.07, cue, cue.dur);
    return;
  }
  if (act === "quake") {
    burst(ctx, t, cue, 0.16);
    burst(ctx, t + 0.1, { f0: 78, f1: 40, dur: 0.16, loud: 0.32, tone: "triangle" }, 0.16);
    return;
  }
  if (act === "blizzard") {
    for (let i = 0; i < 3; i += 1) burst(ctx, t + i * 0.07, cue, 0.16);
    return;
  }
  if (act === "shard") {
    for (let i = 0; i < 5; i += 1) burst(ctx, t + i * 0.028, cue, 0.04);
    return;
  }
  burst(ctx, t, cue, cue.dur);
}

function burst(ctx: AudioContext, t: number, cue: Cue, dur: number): void {
  const source = ctx.createBufferSource();
  source.buffer = noise(ctx, dur);
  const filter = ctx.createBiquadFilter();
  filter.type = "bandpass";
  filter.Q.setValueAtTime(cue.tone ? 0.7 : 1.2, t);
  filter.frequency.setValueAtTime(Math.max(40, cue.f0), t);
  filter.frequency.exponentialRampToValueAtTime(Math.max(40, cue.f1), t + dur);
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(cue.loud, t);
  gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
  source.connect(filter);
  filter.connect(gain);
  gain.connect(sfxOutput(ctx));
  source.start(t);
  source.stop(t + dur + 0.02);
  if (!cue.tone) return;
  const osc = ctx.createOscillator();
  osc.type = cue.tone;
  osc.frequency.setValueAtTime(Math.max(40, cue.f0), t);
  osc.frequency.exponentialRampToValueAtTime(Math.max(40, cue.f1), t + dur);
  const tone = ctx.createGain();
  tone.gain.setValueAtTime(cue.loud * 0.45, t);
  tone.gain.exponentialRampToValueAtTime(0.001, t + dur);
  osc.connect(tone);
  tone.connect(sfxOutput(ctx));
  osc.start(t);
  osc.stop(t + dur + 0.02);
}
