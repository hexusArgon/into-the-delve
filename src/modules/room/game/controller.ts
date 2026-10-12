import { RoomRenderer } from "./view.ts";
import { loadSprites, type Sprites } from "./sprites.ts";
import { attack, blink, blinkCells, face, livingMonsters, reload, roomMonsters, step, wait, type Dir, type RoomState } from "./sim.ts";
import { EMPTY_GEAR, type GearBonus } from "../data/items.ts";
import type { WeaponId } from "../data/weapons.ts";
import { weaponById } from "../data/weapons.ts";
import { createRun, syncRun, teleport, travel, type Run } from "./floor.ts";
import { METER_TURNS } from "./rules.ts";
import { playAbility } from "./ability-sfx.ts";
import { playFootstep, playHeroDeath, playMonsterCue, playReload, playShieldBreak, playWeaponSound, preloadSwordBlows } from "./sfx.ts";
import { installDungeonMusic } from "./music.ts";
import { openSettings } from "./settings-view.ts";
import { LESSON_COPY, lessonAdvance, lessonAllows, tutorialRun, type LessonEvent, type LessonHooks, type LessonStep } from "./tutorial.ts";
import "./ui.css";

/** Повтор шага, пока зажаты WASD или стрелки. */
const HOLD_STEP_MS = 200;

function shownHp(value: number): string {
  const rounded = Math.round(value * 100) / 100;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(2);
}

const MOVE_KEYS: Record<string, Dir> = {
  KeyW: "up",
  KeyA: "left",
  KeyS: "down",
  KeyD: "right",
  ArrowUp: "up",
  ArrowLeft: "left",
  ArrowDown: "down",
  ArrowRight: "right",
};

function newSeed(): number {
  return Math.floor(Math.random() * 2 ** 31);
}

export class RoomController {
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly note: HTMLElement;
  private readonly stats: HTMLElement;
  private readonly renderer = new RoomRenderer();
  private sprites: Sprites | null = null;
  private seed = newSeed();
  private readonly weapon: WeaponId;
  private readonly gear: GearBonus;
  private run: Run;
  private running = false;
  private swinging = false;
  private heroRattled = false;
  private diedByFall = false;
  private choosingBlink = false;
  private mapOpen = false;
  private swing: number | null = null;
  private readonly heldMoves = new Map<string, Dir>();
  private shiftHeld = false;
  private lastMoveAt = 0;
  private moveTimer = 0;
  private readonly portrait: HTMLCanvasElement;
  private readonly hpFill: HTMLElement;
  private readonly hpText: HTMLElement;
  private readonly listeners = new Set<() => void>();
  private readonly onKey: (event: KeyboardEvent) => void;
  private readonly onKeyUp: (event: KeyboardEvent) => void;
  private readonly onBlur: () => void;
  private readonly onResize: () => void;
  private readonly onHub?: () => void;
  private readonly host: HTMLElement;
  private floorsCleared = 0;
  private pause: HTMLElement | null = null;
  private readonly lesson: LessonHooks | null;
  private lessonStep: LessonStep = "move";
  private lessonCard: HTMLElement | null = null;
  private lessonText: HTMLElement | null = null;
  private lessonHub: HTMLButtonElement | null = null;
  private readonly lostPanel: HTMLElement | null = null;

  constructor(
    host: HTMLElement,
    onHub?: () => void,
    weapon: WeaponId = "sword",
    gear: GearBonus = EMPTY_GEAR,
    lesson: LessonHooks | null = null,
  ) {
    this.onHub = onHub;
    this.host = host;
    this.lesson = lesson;
    this.lessonStep = lesson?.step ?? "move";
    this.weapon = lesson ? "sword" : weapon;
    this.gear = lesson ? EMPTY_GEAR : gear;
    this.run = lesson ? tutorialRun() : createRun(this.seed, weapon, gear);
    host.replaceChildren();
    host.className = "dungeon";
    host.style.display = "flex";
    host.style.flexDirection = "column";
    host.style.height = "100%";
    host.style.position = "relative";

    this.canvas = document.createElement("canvas");
    this.canvas.style.flex = "1";
    this.canvas.style.width = "100%";
    this.canvas.style.minHeight = "0";
    this.canvas.style.touchAction = "none";
    this.canvas.addEventListener("contextmenu", (event) => event.preventDefault());
    const ctx = this.canvas.getContext("2d");
    if (!ctx) throw new Error("canvas");
    this.ctx = ctx;

    const bar = document.createElement("div");
    bar.className = "dungeon-hud";
    bar.style.display = "flex";
    bar.style.flexWrap = "wrap";
    bar.style.gap = "8px";
    bar.style.alignItems = "center";
    bar.style.padding = "10px";
    bar.style.paddingLeft = "340px";

    this.stats = document.createElement("div");
    this.stats.style.flex = "1 1 180px";
    this.note = document.createElement("div");
    this.note.style.flexBasis = "100%";

    const button = (label: string, run: () => void): HTMLButtonElement => {
      const el = document.createElement("button");
      el.type = "button";
      el.textContent = label;
      el.className = "dungeon-button";
      el.style.padding = "8px 12px";
      el.style.cursor = "pointer";
      el.addEventListener("click", run);
      return el;
    };

    const portrait = document.createElement("div");
    portrait.className = "dungeon-portrait";
    portrait.style.position = "absolute";
    portrait.style.left = "16px";
    portrait.style.bottom = "16px";
    portrait.style.zIndex = "2";
    portrait.style.display = "flex";
    portrait.style.alignItems = "center";
    portrait.style.gap = "10px";
    portrait.style.padding = "12px 16px";

    this.portrait = document.createElement("canvas");
    this.portrait.width = 144;
    this.portrait.height = 144;
    this.portrait.className = "dungeon-icon";
    this.portrait.style.width = "144px";
    this.portrait.style.height = "144px";

    const meters = document.createElement("div");
    meters.style.display = "flex";
    meters.style.flexDirection = "column";
    meters.style.gap = "6px";
    meters.style.minWidth = "120px";

    const meterRow = (label: string, color: string): { row: HTMLElement; fill: HTMLElement; text: HTMLElement } => {
      const row = document.createElement("div");
      const title = document.createElement("div");
      title.textContent = label;
      title.style.fontSize = "11px";
      title.style.letterSpacing = "0.12em";
      title.style.textTransform = "uppercase";
      title.style.color = "#9a8d78";
      const track = document.createElement("div");
      track.className = "dungeon-meter";
      const fill = document.createElement("div");
      fill.className = color;
      fill.style.width = "100%";
      track.append(fill);
      const text = document.createElement("div");
      text.style.fontSize = "12px";
      row.append(title, track, text);
      return { row, fill, text };
    };

    const hp = meterRow("HP", "dungeon-hp");
    const mp = meterRow("MP", "dungeon-mp");
    mp.text.textContent = "MP";
    this.hpFill = hp.fill;
    this.hpText = hp.text;
    meters.append(hp.row, mp.row);
    portrait.append(this.portrait, meters);

    const hint = document.createElement("div");
    hint.style.flexBasis = "100%";
    hint.style.opacity = "0.75";
    hint.textContent = "WASD или стрелки зажать — идти · Shift+WASD или стрелки — поворот · ЛКМ удар · ПКМ Blink, повтор — отмена · R перезарядка · X ждать · Tab карта · Esc меню";

    const back = onHub && !lesson ? button("В хаб", () => onHub()) : null;
    if (lesson) bar.append(this.stats, hint, this.note);
    else {
      bar.append(
        this.stats,
        button("Новый этаж", () => this.newFloor()),
        button("Заново", () => this.restart()),
        ...(back ? [back] : []),
        hint,
        this.note,
      );
    }
    host.append(this.canvas, bar, portrait);
    const leave = lesson ? () => this.lesson?.dead(this.lessonStep) : onHub;
    if (leave) this.lostPanel = this.lostBanner(leave);
    if (this.lostPanel) host.append(this.lostPanel);
    if (lesson) this.mountLesson();

    this.canvas.addEventListener("pointerdown", (event) => this.onPointer(event));
    this.onKey = (event) => this.handleKey(event);
    this.onKeyUp = (event) => this.handleKeyUp(event);
    this.onBlur = () => this.releaseMoves();
    this.onResize = () => this.resize();
    window.addEventListener("keydown", this.onKey);
    window.addEventListener("keyup", this.onKeyUp);
    window.addEventListener("blur", this.onBlur);
    window.addEventListener("resize", this.onResize);
    this.resize();
    void loadSprites().then((sprites) => {
      this.sprites = sprites;
      const portrait = this.portrait.getContext("2d");
      portrait?.clearRect(0, 0, this.portrait.width, this.portrait.height);
      portrait?.drawImage(sprites.hero, 16, 8, 112, 128);
      this.draw();
    });
    preloadSwordBlows();
    installDungeonMusic();
    this.refresh();
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  getState(): RoomState {
    return this.state;
  }

  get isLesson(): boolean {
    return this.lesson !== null;
  }

  /** Этажи, которые уже полностью зачищены. Текущий засчитан, если портал в хаб уже открыт. */
  get adventureLevel(): number {
    return this.floorsCleared + (this.run.exit ? 1 : 0);
  }

  get carriedGold(): number {
    return this.state.carried;
  }

  private commit(): void {
    syncRun(this.run);
    if (!this.lesson || !this.run.exit) return;
    this.run.exit = null;
    this.state.note = this.state.note.replace("Портал в хаб открылся.", "").trim();
  }

  private mountLesson(): void {
    const card = document.createElement("div");
    card.className = "dungeon-panel dungeon-lesson";
    const text = document.createElement("p");
    text.style.margin = "0";
    const row = document.createElement("div");
    row.style.display = "flex";
    row.style.gap = "8px";
    row.style.flexWrap = "wrap";
    const skip = document.createElement("button");
    skip.type = "button";
    skip.className = "dungeon-button";
    skip.style.padding = "8px 12px";
    skip.textContent = "Пропустить";
    skip.addEventListener("click", () => this.lesson?.skip());
    const hub = document.createElement("button");
    hub.type = "button";
    hub.className = "dungeon-button dungeon-button-primary";
    hub.style.padding = "8px 12px";
    hub.textContent = "В хаб";
    hub.addEventListener("click", () => this.lesson?.finish());
    row.append(skip, hub);
    card.append(text, row);
    this.lessonCard = card;
    this.lessonText = text;
    this.lessonHub = hub;
    this.host.append(card);
    this.renderLesson();
  }

  private renderLesson(): void {
    if (!this.lessonText || !this.lessonHub) return;
    this.lessonText.textContent = LESSON_COPY[this.lessonStep];
    this.lessonHub.style.display = this.lessonStep === "done" ? "" : "none";
  }

  private lessonAfter(event: LessonEvent): void {
    if (!this.lesson || this.state.outcome === "lost") return;
    const signal = this.lessonStep === "finish" && this.state.outcome === "won" ? "won" : event;
    const next = lessonAdvance(this.lessonStep, signal);
    if (next === this.lessonStep) return;
    this.lessonStep = next;
    this.releaseMoves();
    this.choosingBlink = false;
    this.renderLesson();
  }

  private get state(): RoomState {
    return this.run.state;
  }

  setRunning(running: boolean): void {
    this.running = running;
    if (running) this.loop();
  }

  destroy(): void {
    this.running = false;
    this.releaseMoves();
    window.removeEventListener("keydown", this.onKey);
    window.removeEventListener("keyup", this.onKeyUp);
    window.removeEventListener("blur", this.onBlur);
    window.removeEventListener("resize", this.onResize);
  }

  face(dir: Dir): void {
    if (this.locked()) return;
    if (this.lesson && !lessonAllows(this.lessonStep, "face") && this.lessonStep !== "attack") return;
    const facing = this.state.hero.facing;
    const x = this.state.hero.x;
    const y = this.state.hero.y;
    this.choosingBlink = false;
    face(this.state, dir);
    this.refresh();
    if (this.state.hero.facing !== facing && this.state.hero.x === x && this.state.hero.y === y) this.lessonAfter("face");
  }

  attack(): void {
    if (this.locked() || this.state.outcome === "lost") return;
    if (this.lesson && !lessonAllows(this.lessonStep, "attack")) return;
    const worn = weaponById(this.state.weapon);
    if (worn.id === "pistol" && (this.state.ammo ?? worn.magazine ?? 0) === 0) {
      this.choosingBlink = false;
      const places = this.places();
      if (reload(this.state)) {
        playReload(worn.id, this.state.hero.facing);
        this.playMoves(places);
      }
      this.commit();
      this.refresh();
      return;
    }
    if (worn.magazine !== null && (this.state.ammo ?? worn.magazine) === 0) {
      attack(this.state);
      this.refresh();
      return;
    }
    playWeaponSound(worn.id, this.state.hero.facing);
    this.swinging = true;
    const started = performance.now();
    const duration = worn.id === "dual" ? 380 : worn.magazine !== null ? 240 : worn.id === "axe" ? 340 : 300;
    const tick = (now: number): void => {
      const t = Math.min(1, (now - started) / duration);
      this.swing = t;
      this.draw();
      if (t < 1) {
        requestAnimationFrame(tick);
        return;
      }
      this.swing = null;
      this.swinging = false;
      const beforeHit = roomMonsters(this.state).map((monster) => ({ monster, hp: monster.hp, shield: monster.shield }));
      const places = this.places();
      const swung = attack(this.state);
      this.playMoves(places);
      let broke = false;
      for (const place of beforeHit) {
        const died = place.hp > 0 && place.monster.hp <= 0;
        if (died) playMonsterCue(place.monster.kind, "death", place.monster.facing);
        if (place.shield > 0 && place.monster.shield === 0) {
          if (!died) playMonsterCue(place.monster.kind, "pain", place.monster.facing);
          broke = true;
        }
      }
      if (broke) {
        playShieldBreak(this.state.hero.facing);
        this.renderer.shake();
      }
      this.commit();
      this.refresh();
      if (swung) this.lessonAfter("attack");
    };
    requestAnimationFrame(tick);
  }

  wait(): void {
    if (this.locked()) return;
    if (this.lesson && !lessonAllows(this.lessonStep, "wait")) return;
    this.choosingBlink = false;
    const places = this.places();
    wait(this.state);
    this.playMoves(places);
    this.commit();
    this.refresh();
    this.lessonAfter("wait");
  }

  /** Тот же этаж с начала: та же раскладка комнат, полное HP. */
  restart(): void {
    if (this.swinging) return;
    if (this.run.exit) this.floorsCleared += 1;
    this.run = createRun(this.seed, this.weapon, this.gear);
    this.choosingBlink = false;
    this.mapOpen = false;
    this.renderer.resetCamera();
    this.renderer.flash();
    this.refresh();
  }

  newFloor(): void {
    if (this.swinging) return;
    this.seed = newSeed();
    this.restart();
  }

  private locked(): boolean {
    return this.swinging || this.renderer.moving();
  }

  private handleKeyUp(event: KeyboardEvent): void {
    if (event.key === "Shift") this.shiftHeld = false;
    this.heldMoves.delete(event.code);
  }

  private releaseMoves(): void {
    this.heldMoves.clear();
    this.shiftHeld = false;
    if (this.moveTimer !== 0) {
      window.clearTimeout(this.moveTimer);
      this.moveTimer = 0;
    }
  }

  private moveDir(): Dir | null {
    let dir: Dir | null = null;
    for (const value of this.heldMoves.values()) dir = value;
    return dir;
  }

  /** Первый шаг сразу. Пока клавиша зажата, следующий — не раньше чем через 0,2 с и после конца анимации хода. */
  private holdStep(immediate: boolean): void {
    const dir = this.moveDir();
    if (!dir || this.pause || this.mapOpen || this.shiftHeld || this.locked() || this.state.outcome === "lost") return;
    if (this.lesson && !lessonAllows(this.lessonStep, "step")) return;
    const now = performance.now();
    if (!immediate && now - this.lastMoveAt < HOLD_STEP_MS) return;
    this.lastMoveAt = now;
    this.walk(dir);
  }

  private pumpMove(): void {
    if (this.moveTimer !== 0 || !this.moveDir()) return;
    const tick = (): void => {
      this.moveTimer = 0;
      if (!this.moveDir() || this.state.outcome === "lost") return;
      this.holdStep(false);
      if (!this.moveDir()) return;
      const since = performance.now() - this.lastMoveAt;
      const wait = this.locked() || this.shiftHeld || this.mapOpen ? 32 : Math.max(32, HOLD_STEP_MS - since);
      this.moveTimer = window.setTimeout(tick, wait);
    };
    this.moveTimer = window.setTimeout(tick, 32);
  }

  private walk(dir: Dir): void {
    if (this.locked()) return;
    this.choosingBlink = false;
    const from = { x: this.state.hero.x, y: this.state.hero.y };
    const places = this.places();
    step(this.state, dir);
    if (this.state.outcome === "lost") this.releaseMoves();
    this.commit();
    if (travel(this.run)) {
      this.renderer.resetCamera();
      this.renderer.flash();
      this.voiceAggro();
    } else if (this.state.pitDrop) {
      if (this.state.outcome === "lost") this.diedByFall = true;
      this.renderer.playFall(from, this.state.pitDrop, { x: this.state.hero.x, y: this.state.hero.y });
      this.state.pitDrop = null;
    }
    this.playMoves(places);
    this.refresh();
    if (this.state.hero.x !== from.x || this.state.hero.y !== from.y || this.state.outcome === "won") this.lessonAfter("step");
  }

  private lostBanner(onHub: () => void): HTMLElement {
    const panel = document.createElement("div");
    panel.className = "dungeon-lost";
    panel.style.display = "none";
    panel.style.position = "absolute";
    panel.style.inset = "0";
    panel.style.zIndex = "8";
    panel.style.alignItems = "center";
    panel.style.justifyContent = "center";
    const card = document.createElement("div");
    card.className = "dungeon-lost-card";
    card.style.padding = "24px";
    card.style.display = "flex";
    card.style.flexDirection = "column";
    card.style.gap = "12px";
    card.style.alignItems = "flex-start";
    const title = document.createElement("div");
    title.className = "dungeon-title";
    title.textContent = "Забег оборвался";
    title.style.fontSize = "22px";
    const button = document.createElement("button");
    button.type = "button";
    button.className = "dungeon-button dungeon-button-primary";
    button.textContent = "В хаб";
    button.style.padding = "10px 16px";
    button.style.cursor = "pointer";
    button.addEventListener("click", onHub);
    card.append(title, button);
    panel.append(card);
    return panel;
  }

  private voiceAggro(): void {
    const foe = livingMonsters(this.state)[0];
    if (!foe) return;
    playMonsterCue(foe.kind, "aggro", foe.facing);
  }

  private places(): { heroX: number; heroY: number; spots: { x: number; y: number }[] } {
    return {
      heroX: this.state.hero.x,
      heroY: this.state.hero.y,
      spots: roomMonsters(this.state).map((monster) => ({ x: monster.x, y: monster.y })),
    };
  }

  private playMoves(before: { heroX: number; heroY: number; spots: { x: number; y: number }[] }): void {
    if (before.heroX !== this.state.hero.x || before.heroY !== this.state.hero.y) {
      playFootstep(this.state.hero.facing, 0.13);
    }
    const now = roomMonsters(this.state);
    before.spots.forEach((spot, index) => {
      const monster = now[index];
      if (monster && (monster.x !== spot.x || monster.y !== spot.y)) playFootstep(monster.facing, 0.08);
    });
  }

  private onPointer(event: PointerEvent): void {
    if (this.pause) return;
    if (this.mapOpen) {
      this.onMapPointer(event);
      return;
    }
    if (this.locked() || this.state.outcome === "lost") return;
    const cell = this.cellFromEvent(event);
    if (event.button === 2) {
      event.preventDefault();
      if (this.lesson && !lessonAllows(this.lessonStep, "blink")) return;
      if (this.choosingBlink) {
        this.choosingBlink = false;
        this.state.note = "Blink отменён.";
        this.refresh();
        return;
      }
      if (this.state.blink <= 0) {
        this.choosingBlink = false;
        this.state.note = "Blink кончился.";
        this.refresh();
        return;
      }
      this.choosingBlink = true;
      this.state.note = "Выбери клетку Blink левой кнопкой.";
      this.refresh();
      return;
    }
    if (event.button !== 0) return;
    const exit = this.run.exit;
    if (cell && exit && exit.room === this.run.current && cell.x === exit.cell.x && cell.y === exit.cell.y) {
      this.choosingBlink = false;
      this.onHub?.();
      return;
    }
    if (this.lesson && this.lessonStep === "blink") {
      if (this.choosingBlink && cell && blinkCells(this.state).some((spot) => spot.x === cell.x && spot.y === cell.y)) {
        this.choosingBlink = false;
        const from = { x: this.state.hero.x, y: this.state.hero.y };
        const before = this.state.blink;
        if (blink(this.state, cell.x, cell.y) && (this.state.hero.x !== from.x || this.state.hero.y !== from.y) && this.state.blink < before) {
          this.renderer.playBlink(from, { x: this.state.hero.x, y: this.state.hero.y });
          this.refresh();
          this.lessonAfter("blink");
        } else this.refresh();
      }
      return;
    }
    if (this.lesson && !lessonAllows(this.lessonStep, "attack")) return;
    if (this.choosingBlink && cell && blinkCells(this.state).some((spot) => spot.x === cell.x && spot.y === cell.y)) {
      this.choosingBlink = false;
      const from = { x: this.state.hero.x, y: this.state.hero.y };
      if (blink(this.state, cell.x, cell.y)) {
        this.renderer.playBlink(from, { x: this.state.hero.x, y: this.state.hero.y });
        this.lessonAfter("blink");
      }
      this.refresh();
      return;
    }
    this.choosingBlink = false;
    const dir = cell ? this.dirToward(cell.x, cell.y) : null;
    if (dir) face(this.state, dir);
    this.attack();
  }

  private onMapPointer(event: PointerEvent): void {
    if (event.button !== 0 || this.locked()) return;
    const point = this.canvasPoint(event);
    const index = this.renderer.mapRoomAt(point.x, point.y);
    if (index === null) return;
    if (teleport(this.run, index)) {
      this.mapOpen = false;
      this.choosingBlink = false;
      this.renderer.resetCamera();
      this.renderer.flash();
      this.voiceAggro();
    }
    this.refresh();
  }

  private canvasPoint(event: PointerEvent): { x: number; y: number } {
    const rect = this.canvas.getBoundingClientRect();
    return {
      x: (event.clientX - rect.left) * (this.canvas.width / rect.width),
      y: (event.clientY - rect.top) * (this.canvas.height / rect.height),
    };
  }

  private cellFromEvent(event: PointerEvent): { x: number; y: number } | null {
    const point = this.canvasPoint(event);
    return this.renderer.cellAt(point.x, point.y);
  }

  private dirToward(x: number, y: number): Dir | null {
    const dx = x - this.state.hero.x;
    const dy = y - this.state.hero.y;
    if (dx === 0 && dy === 0) return null;
    if (Math.abs(dx) >= Math.abs(dy)) return dx > 0 ? "right" : "left";
    return dy > 0 ? "down" : "up";
  }

  private openPause(): void {
    if (this.pause) return;
    this.releaseMoves();
    this.choosingBlink = false;
    this.mapOpen = false;
    const veil = document.createElement("div");
    veil.className = "dungeon-pause";
    const panel = document.createElement("div");
    panel.className = "dungeon-panel dungeon-pause-panel";
    panel.addEventListener("click", (event) => event.stopPropagation());
    const title = document.createElement("h1");
    title.className = "dungeon-title";
    title.style.fontSize = "28px";
    title.style.margin = "0";
    title.textContent = "Меню";
    const resume = this.pauseButton("Вернуться в игру", true, () => this.closePause());
    const settings = this.pauseButton("Настройки", false, () => openSettings(this.host));
    const giveUp = this.pauseButton("Сдаться", false, () => {
      this.closePause();
      this.onHub?.();
    });
    panel.append(title, resume, settings, giveUp);
    veil.addEventListener("click", () => this.closePause());
    veil.append(panel);
    this.pause = veil;
    this.host.append(veil);
    this.refresh();
  }

  private closePause(): void {
    this.pause?.remove();
    this.pause = null;
    this.refresh();
  }

  private pauseButton(label: string, primary: boolean, run: () => void): HTMLButtonElement {
    const button = document.createElement("button");
    button.type = "button";
    button.className = primary ? "dungeon-button dungeon-button-primary" : "dungeon-button";
    button.textContent = label;
    button.addEventListener("click", run);
    return button;
  }

  private handleKey(event: KeyboardEvent): void {
    if (event.key === "Shift") this.shiftHeld = true;
    if (event.code === "Escape") {
      event.preventDefault();
      if (this.lesson || event.repeat || this.host.querySelector(".dungeon-settings")) return;
      if (this.pause) {
        this.closePause();
        return;
      }
      this.openPause();
      return;
    }
    if (this.pause) return;
    if (event.code === "Tab") {
      event.preventDefault();
      if (this.lesson && !lessonAllows(this.lessonStep, "map")) return;
      if (event.repeat || this.locked()) return;
      this.mapOpen = !this.mapOpen;
      this.choosingBlink = false;
      this.refresh();
      return;
    }
    const dir = MOVE_KEYS[event.code];
    if (dir) {
      event.preventDefault();
      if (event.shiftKey || this.shiftHeld) {
        if (!event.repeat && !this.locked() && !this.mapOpen && (!this.lesson || lessonAllows(this.lessonStep, "face"))) this.face(dir);
        return;
      }
      if (this.lesson && !lessonAllows(this.lessonStep, "step")) return;
      if (event.repeat) return;
      this.heldMoves.delete(event.code);
      this.heldMoves.set(event.code, dir);
      this.holdStep(true);
      this.pumpMove();
      return;
    }
    if (event.repeat || this.locked() || this.mapOpen) return;
    if (event.code === "KeyR") {
      if (this.lesson) return;
      this.choosingBlink = false;
      const places = this.places();
      if (reload(this.state)) {
        playReload(this.state.weapon, this.state.hero.facing);
        this.playMoves(places);
      }
      this.commit();
      this.refresh();
      event.preventDefault();
      return;
    }
    if (event.code === "KeyX") {
      if (this.lesson && !lessonAllows(this.lessonStep, "wait")) return;
      this.wait();
      event.preventDefault();
    }
  }

  private resize(): void {
    const rect = this.canvas.getBoundingClientRect();
    const width = Math.max(1, Math.floor(rect.width));
    const height = Math.max(1, Math.floor(rect.height));
    if (this.canvas.width !== width || this.canvas.height !== height) {
      this.canvas.width = width;
      this.canvas.height = height;
    }
    this.draw();
  }

  private refresh(): void {
    const meter =
      this.state.meterTurns > 0
        ? `Шкала ${this.state.meterTurns}/${METER_TURNS}`
        : "Шкала спит";
    this.hpText.textContent = `${shownHp(this.state.hero.hp)}/${shownHp(this.state.hero.maxHp)}`;
    this.hpFill.style.width = `${Math.max(0, this.state.hero.hp / this.state.hero.maxHp) * 100}%`;
    const room = this.state.room;
    const visited = this.run.visited.filter(Boolean).length;
    const living = livingMonsters(this.state);
    const foe = living.length === 0 ? "" : living.length === 1 ? `${living[0]!.name} · ` : `${living.length} монстра · `;
    const worn = weaponById(this.state.weapon);
    const rounds = worn.magazine === null ? "" : ` ${this.state.ammo ?? worn.magazine}/${worn.magazine}`;
    this.stats.textContent = `${foe}${worn.name}${rounds} · ${room.name} · комнат ${visited}/${this.run.rooms.length} · Blink ${this.state.blink} · золото ${this.state.carried} · ${meter}`;
    this.note.textContent = this.state.note;
    if (this.state.strike) {
      const from = this.state.strike.from;
      const striker = roomMonsters(this.state).find((monster) => monster.hp > 0 && monster.x === from.x && monster.y === from.y);
      if (striker) playMonsterCue(striker.kind, "attack", striker.facing);
    }
    if (this.state.outcome === "lost") {
      if (!this.heroRattled) {
        this.heroRattled = true;
        playHeroDeath(this.state.hero.facing, this.diedByFall);
      }
    } else {
      this.heroRattled = false;
      this.diedByFall = false;
    }
    if (this.lostPanel) this.lostPanel.style.display = this.showLost() ? "flex" : "none";
    this.playAbilities();
    this.draw();
    this.listeners.forEach((listener) => listener());
  }

  private playAbilities(): void {
    const heard = new Set<string>();
    for (const fx of this.state.fx) {
      if (!fx.act || heard.has(fx.act)) continue;
      heard.add(fx.act);
      playAbility(fx.act);
    }
  }

  private mapView() {
    const room = this.run.rooms[this.run.current];
    const teleportBlock = !room?.portal
      ? "В этой комнате нет телепорта"
      : this.state.outcome === "lost"
        ? "Телепорт недоступен"
        : this.state.outcome !== "won"
          ? "Телепорт закрыт, пока враг жив"
          : null;
    return {
      rooms: this.run.rooms,
      visited: this.run.visited,
      cleared: this.run.cleared,
      current: this.run.current,
      teleportBlock,
      exit: this.run.exit?.room === this.run.current ? this.run.exit.cell : null,
    };
  }

  private draw(): void {
    if (!this.sprites) return;
    this.renderer.paint(
      this.ctx,
      this.canvas.width,
      this.canvas.height,
      this.state,
      this.sprites,
      this.swing,
      this.choosingBlink,
      this.mapView(),
      this.mapOpen,
    );
  }

  private loop = (): void => {
    if (!this.running) return;
    this.draw();
    if (this.lostPanel) this.lostPanel.style.display = this.showLost() ? "flex" : "none";
    requestAnimationFrame(this.loop);
  };

  private showLost(): boolean {
    return this.state.outcome === "lost" && this.renderer.lostReady();
  }
}
