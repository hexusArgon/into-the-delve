import type { Cell } from "./sim.ts";

/** Leap на соседнюю клетку. 210 мс замедлены left на 40% по просьбе дизайнера. */
const STEP_MS = 294;
/** Пауза, после которой юнит начинает ход следом за шагом героя. */
const REACT_MS = 100;
/** Выпад монстра к герою и возврат на свою клетку. */
const STRIKE_MS = 420;
/** Вспышка исчезновения и появления. Сам перенос клетки мгновенный. */
const BLINK_FX_MS = 220;

export interface Pose {
  x: number;
  y: number;
  /** 0..1, пока фигура идёт между клетками. */
  travel: number | null;
  /** Обычный шаг: дуга вверх. Падение в яму этим не пользуется. */
  jump: boolean;
}

/** 0 в момент переноса, 1 когда вспышки погасли. Фигура в это время уже в клетке посадки. */
export interface BlinkMark {
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
  t: number;
}

export interface StrikeFlash {
  x: number;
  y: number;
  rot: number;
  /** 0..1, яркость вспышки в момент попадания. */
  a: number;
}

interface Slide {
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
  start: number;
  ms: number;
  jump: boolean;
}

interface BlinkFx {
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
  start: number;
}

function smoothstep(t: number): number {
  const x = Math.max(0, Math.min(1, t));
  return x * x * (3 - 2 * x);
}

function isOneStep(from: Cell, to: Cell): boolean {
  const dx = Math.abs(to.x - from.x);
  const dy = Math.abs(to.y - from.y);
  return (dx === 1 && dy === 0) || (dx === 0 && dy === 1);
}

function sample(slide: Slide | null, fallback: Cell, time: number): Cell {
  if (!slide) return fallback;
  if (time <= slide.start) return { x: slide.fromX, y: slide.fromY };
  const raw = (time - slide.start) / slide.ms;
  if (raw >= 1) return { x: slide.toX, y: slide.toY };
  const eased = smoothstep(raw);
  return {
    x: slide.fromX + (slide.toX - slide.fromX) * eased,
    y: slide.fromY + (slide.toY - slide.fromY) * eased,
  };
}

function poseAt(slide: Slide | null, at: Cell, time: number): Pose {
  const pos = sample(slide, at, time);
  if (!slide || time <= slide.start || time >= slide.start + slide.ms) {
    return { x: pos.x, y: pos.y, travel: null, jump: false };
  }
  return {
    x: pos.x,
    y: pos.y,
    travel: (time - slide.start) / slide.ms,
    jump: slide.jump,
  };
}

/**
 * Рисуемое положение фигур. Симуляция по-прежнему переставляет клетку сразу,
 * а здесь шаг на соседнюю клетку доезжает. Монстр выходит, когда герой уже встал.
 */
export class Motion {
  private heroSlide: Slide | null = null;
  private heroNext: Slide | null = null;
  /** Падение в обрыв: логическая клетка уже конечная, слайд в яму и обратно задан отдельно. */
  private scripted = false;
  private monsterSlides: (Slide | null)[] = [];
  private rushes: { fromX: number; fromY: number; toX: number; toY: number; arc: boolean }[] = [];
  private blinkFx: BlinkFx | null = null;
  private pendingStrike: { ax: number; ay: number; tx: number; ty: number } | null = null;
  private strike: { ax: number; ay: number; tx: number; ty: number; start: number } | null = null;
  private seenHero: Cell | null = null;
  private seenMonsters: Cell[] | null = null;

  moving(): boolean {
    return this.heroSlide !== null || this.heroNext !== null || this.monsterSlides.some((slide) => slide !== null) || this.blinkFx !== null || this.pendingStrike !== null || this.strike !== null;
  }

  /** Hero заходит в обрыв. Если падение не убило, выходит на клетку посадки. */
  fall(from: Cell, pit: Cell, land: Cell, time: number): void {
    this.scripted = true;
    this.heroSlide = { fromX: from.x, fromY: from.y, toX: pit.x, toY: pit.y, start: time, ms: STEP_MS, jump: false };
    const climb = land.x !== pit.x || land.y !== pit.y;
    this.heroNext = climb
      ? {
          fromX: pit.x,
          fromY: pit.y,
          toX: land.x,
          toY: land.y,
          start: time + STEP_MS,
          ms: STEP_MS,
          jump: false,
        }
      : null;
    this.seenHero = { x: land.x, y: land.y };
  }

  /** Рывок: фигура пролетает весь путь. arc — дуга, как у налёта и броска. */
  queueRush(from: Cell, to: Cell, arc = false): void {
    if (from.x === to.x && from.y === to.y) return;
    this.rushes.push({ fromX: from.x, fromY: from.y, toX: to.x, toY: to.y, arc });
  }

  /** Удар вплотную: выпад после шага героя, если тот left рисуется. */
  queueStrike(from: Cell, to: Cell): void {
    this.pendingStrike = { ax: from.x, ay: from.y, tx: to.x, ty: to.y };
  }
  blinkTo(from: Cell, to: Cell, time: number): void {
    this.heroSlide = null;
    this.heroNext = null;
    this.scripted = false;
    this.blinkFx = { fromX: from.x, fromY: from.y, toX: to.x, toY: to.y, start: time };
    this.seenHero = { x: to.x, y: to.y };
  }

  blinkMark(time: number): BlinkMark | null {
    if (!this.blinkFx) return null;
    const t = (time - this.blinkFx.start) / BLINK_FX_MS;
    if (t >= 1) {
      this.blinkFx = null;
      return null;
    }
    return {
      fromX: this.blinkFx.fromX,
      fromY: this.blinkFx.fromY,
      toX: this.blinkFx.toX,
      toY: this.blinkFx.toY,
      t: Math.max(0, t),
    };
  }

  /** Поставить фигуры сразу в логические клетки, без доезда. */
  snap(): void {
    this.heroSlide = null;
    this.heroNext = null;
    this.scripted = false;
    this.monsterSlides = [];
    this.rushes = [];
    this.blinkFx = null;
    this.pendingStrike = null;
    this.strike = null;
    this.seenHero = null;
    this.seenMonsters = null;
  }

  private advanceFall(time: number): void {
    if (!this.scripted) return;
    if (this.heroSlide && time >= this.heroSlide.start + this.heroSlide.ms) {
      this.heroSlide = this.heroNext;
      this.heroNext = null;
    }
    if (this.heroSlide && time >= this.heroSlide.start + this.heroSlide.ms) this.heroSlide = null;
    if (!this.heroSlide && !this.heroNext) this.scripted = false;
  }

  present(hero: Cell, monsters: readonly Cell[], time: number, holdMs = 0): { hero: Pose; monsters: Pose[] } {
    const still = (cell: Cell): Pose => ({ x: cell.x, y: cell.y, travel: null, jump: false });
    if (!this.seenHero || !this.seenMonsters || this.seenMonsters.length !== monsters.length) {
      if (!this.seenHero) this.seenHero = { x: hero.x, y: hero.y };
      this.seenMonsters = monsters.map((monster) => ({ x: monster.x, y: monster.y }));
      if (!this.scripted) this.heroSlide = null;
      this.monsterSlides = monsters.map(() => null);
      this.rushes = [];
      return { hero: still(hero), monsters: monsters.map(still) };
    }

    this.advanceFall(time);
    const heroMoved = !this.scripted && (this.seenHero.x !== hero.x || this.seenHero.y !== hero.y);
    const monsterMoved = monsters.some((monster, index) => {
      const seen = this.seenMonsters?.[index];
      return !seen || seen.x !== monster.x || seen.y !== monster.y;
    });

    if (heroMoved || monsterMoved) {
      const heroFrom = sample(this.heroSlide, this.seenHero, time);
      const heroOne = heroMoved && isOneStep(this.seenHero, hero);
      if (!this.scripted) {
        this.heroSlide = heroOne
          ? { fromX: heroFrom.x, fromY: heroFrom.y, toX: hero.x, toY: hero.y, start: time, ms: STEP_MS, jump: true }
          : null;
        this.seenHero = { x: hero.x, y: hero.y };
      }
      const delay = this.scripted ? STEP_MS * 2 : holdMs > 0 ? holdMs : heroOne ? REACT_MS : 0;
      this.monsterSlides = monsters.map((monster, index) => {
        const seen = this.seenMonsters?.[index] ?? monster;
        const from = sample(this.monsterSlides[index] ?? null, seen, time);
        const moved = seen.x !== monster.x || seen.y !== monster.y;
        const rush = this.rushes.find((item) => item.fromX === seen.x && item.fromY === seen.y);
        if (moved && rush) {
          const cells = Math.max(Math.abs(monster.x - seen.x), Math.abs(monster.y - seen.y));
          return { fromX: from.x, fromY: from.y, toX: monster.x, toY: monster.y, start: time + delay, ms: Math.min(340, 90 * cells), jump: rush.arc };
        }
        return moved && isOneStep(seen, monster)
          ? { fromX: from.x, fromY: from.y, toX: monster.x, toY: monster.y, start: time + delay, ms: STEP_MS, jump: true }
          : null;
      });
      this.rushes = [];
      this.seenMonsters = monsters.map((monster) => ({ x: monster.x, y: monster.y }));
    } else {
      if (!this.scripted && this.heroSlide && time >= this.heroSlide.start + this.heroSlide.ms) this.heroSlide = null;
      this.monsterSlides = this.monsterSlides.map((slide) => (slide && time >= slide.start + slide.ms ? null : slide));
    }

    this.armStrike(time);
    const heroPose = poseAt(this.heroSlide, this.seenHero, time);
    const foePoses = monsters.map((monster, index) => poseAt(this.monsterSlides[index] ?? null, this.seenMonsters?.[index] ?? monster, time));
    return this.applyStrikeMany(heroPose, foePoses, time);
  }

  private armStrike(time: number): void {
    if (!this.pendingStrike) return;
    let start = time;
    if (this.heroSlide) start = Math.max(start, this.heroSlide.start + this.heroSlide.ms);
    if (this.heroNext) start = Math.max(start, this.heroNext.start + this.heroNext.ms);
    this.strike = { ...this.pendingStrike, start };
    this.pendingStrike = null;
  }

  private applyStrikeMany(hero: Pose, monsters: Pose[], time: number): { hero: Pose; monsters: Pose[] } {
    if (!this.strike || monsters.length === 0) return { hero, monsters };
    let index = 0;
    let best = Infinity;
    monsters.forEach((pose, place) => {
      const gap = Math.hypot(pose.x - (this.strike?.ax ?? pose.x), pose.y - (this.strike?.ay ?? pose.y));
      if (gap < best) {
        best = gap;
        index = place;
      }
    });
    const struck = this.applyStrike(hero, monsters[index]!, time);
    const next = monsters.slice();
    next[index] = struck.monster;
    return { hero: struck.hero, monsters: next };
  }

  private applyStrike(hero: Pose, monster: Pose, time: number): { hero: Pose; monster: Pose } {
    if (!this.strike) return { hero, monster };
    const u = (time - this.strike.start) / STRIKE_MS;
    if (u >= 1) {
      this.strike = null;
      return { hero, monster };
    }
    if (u < 0) return { hero, monster };
    const out = 0.42;
    const phase = u < out ? u / out : (u - out) / (1 - out);
    const reach = u < out ? smoothstep(phase) : 1 - smoothstep(phase);
    const dx = this.strike.tx - this.strike.ax;
    const dy = this.strike.ty - this.strike.ay;
    const flinch = u < 0.36 || u > 0.82 ? 0 : Math.sin(((u - 0.36) / 0.46) * Math.PI);
    return {
      hero: {
        ...hero,
        x: hero.x + dx * 0.16 * flinch,
        y: hero.y + dy * 0.16 * flinch,
      },
      monster: {
        x: this.strike.ax + dx * 0.4 * reach,
        y: this.strike.ay + dy * 0.4 * reach,
        travel: phase,
        jump: true,
      },
    };
  }

  strikeFlash(time: number): StrikeFlash | null {
    if (!this.strike) return null;
    const u = (time - this.strike.start) / STRIKE_MS;
    if (u < 0.32 || u > 0.58) return null;
    const dx = this.strike.tx - this.strike.ax;
    const dy = this.strike.ty - this.strike.ay;
    return {
      x: this.strike.ax + dx * 0.62,
      y: this.strike.ay + dy * 0.62,
      rot: Math.atan2(dy, dx) + Math.PI / 2,
      a: Math.sin(((u - 0.32) / 0.26) * Math.PI),
    };
  }
}
