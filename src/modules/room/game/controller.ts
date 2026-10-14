import { RoomRenderer } from "./view.ts";
import { loadSprites, type Sprites } from "./sprites.ts";
import { abilityAim, arrowBeam, attack, blink, blinkCells, castHeroAbility, face, interactTarget, livingMonsters, nearestAim, reload, roomMonsters, step, useChest, wait, type Dir, type RoomState } from "./sim.ts";
import { abilityView } from "../data/hero-abilities.ts";
import { bindAbilityTip, bindTip } from "./tip.ts";
import { EMPTY_GEAR, type GearBonus } from "../data/items.ts";
import type { RunAbility } from "../data/hero-abilities.ts";
import type { WeaponId } from "../data/weapons.ts";
import { WEAPONS, weaponById } from "../data/weapons.ts";
import { createRun, syncRun, teleport, travel, type Run } from "./floor.ts";
import { METER_TURNS } from "./rules.ts";
import { playAbility } from "./ability-sfx.ts";
import { playFootstep, playHeroDeath, playMonsterCue, playReload, playShieldBreak, playWeaponSound, preloadSwordBlows } from "./sfx.ts";
import { installDungeonMusic } from "./music.ts";
import { openSettings } from "./settings-view.ts";
import { isSwingStep, lessonAdvance, lessonAllows, lessonText, lessonWeapon, tutorialRun, type LessonEvent, type LessonHooks, type LessonStep } from "./tutorial.ts";
import { paintWeaponIcon } from "./hub.ts";
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

function abilitySlotFromKey(event: KeyboardEvent): number {
  const digit = ["Digit1", "Digit2", "Digit3", "Digit4"].indexOf(event.code);
  if (digit >= 0) return digit;
  const pad = ["Numpad1", "Numpad2", "Numpad3", "Numpad4"].indexOf(event.code);
  if (pad >= 0) return pad;
  if (event.key === "1" || event.key === "2" || event.key === "3" || event.key === "4") {
    const target = event.target;
    if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) return -1;
    return Number(event.key) - 1;
  }
  return -1;
}

function paintAbilityIcon(canvas: HTMLCanvasElement, art: HTMLCanvasElement | undefined): void {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  if (!art) return;
  const fit = Math.min(canvas.width / art.width, canvas.height / art.height);
  const w = art.width * fit;
  const h = art.height * fit;
  ctx.drawImage(art, (canvas.width - w) / 2, (canvas.height - h) / 2, w, h);
}

function newSeed(): number {
  return Math.floor(Math.random() * 2 ** 31);
}

function prompt(key: string, label: string): HTMLElement {
  const row = document.createElement("div");
  row.className = "dungeon-prompt";
  const kbd = document.createElement("kbd");
  kbd.textContent = key;
  const text = document.createElement("span");
  text.textContent = label;
  row.append(kbd, text);
  return row;
}

function paintBlinkIcon(canvas: HTMLCanvasElement): void {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  const cx = canvas.width / 2;
  const cy = canvas.height / 2 - 2;
  const r = canvas.width * 0.26;
  ctx.beginPath();
  ctx.moveTo(cx, cy - r);
  ctx.lineTo(cx + r, cy);
  ctx.lineTo(cx, cy + r);
  ctx.lineTo(cx - r, cy);
  ctx.closePath();
  ctx.fillStyle = "#1f6f72";
  ctx.strokeStyle = "#d4bc82";
  ctx.lineWidth = 2;
  ctx.fill();
  ctx.stroke();
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
  private readonly weaponHit: number | null;
  private readonly abilities: (RunAbility | null)[];
  private abilitySlot: number | null = null;
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
  private readonly mpFill: HTMLElement;
  private readonly mpText: HTMLElement;
  private readonly listeners = new Set<() => void>();
  private readonly abilityButtons: HTMLButtonElement[] = [];
  private readonly weaponIcon: HTMLCanvasElement;
  private readonly ammoBadge: HTMLElement;
  private readonly blinkButton: HTMLButtonElement;
  private readonly blinkBadge: HTMLElement;
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
  private lessonPicks: HTMLElement | null = null;
  private readonly lostPanel: HTMLElement | null = null;

  constructor(
    host: HTMLElement,
    onHub?: () => void,
    weapon: WeaponId = "sword",
    gear: GearBonus = EMPTY_GEAR,
    lesson: LessonHooks | null = null,
    weaponHit: number | null = null,
    abilities: (RunAbility | null)[] = [],
    private readonly adventure = 0,
  ) {
    this.onHub = onHub;
    this.host = host;
    this.lesson = lesson;
    this.lessonStep = lesson?.step ?? "move";
    this.weapon = lesson ? lessonWeapon(this.lessonStep) : weapon;
    this.gear = lesson ? EMPTY_GEAR : gear;
    this.weaponHit = lesson ? null : weaponHit;
    this.abilities = lesson ? [] : abilities;
    this.run = lesson ? tutorialRun(this.lessonStep) : createRun(this.seed, weapon, gear, this.weaponHit, this.abilities, this.adventure);
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

    const left = document.createElement("div");
    left.className = "dungeon-hud-left";
    this.portrait = document.createElement("canvas");
    this.portrait.width = 192;
    this.portrait.height = 192;
    this.portrait.className = "dungeon-portrait-face";

    const bars = document.createElement("div");
    bars.className = "dungeon-bars";
    const barRow = (color: string): { row: HTMLElement; fill: HTMLElement; text: HTMLElement } => {
      const row = document.createElement("div");
      row.className = "dungeon-bar";
      const fill = document.createElement("div");
      fill.className = color;
      const text = document.createElement("span");
      text.className = "dungeon-bar-num";
      row.append(fill, text);
      return { row, fill, text };
    };
    const hp = barRow("dungeon-hp");
    const mp = barRow("dungeon-mp");
    this.hpFill = hp.fill;
    this.hpText = hp.text;
    this.mpFill = mp.fill;
    this.mpText = mp.text;
    this.stats = document.createElement("div");
    this.stats.className = "dungeon-hud-meta";
    bars.append(hp.row, mp.row, this.stats);

    const center = document.createElement("div");
    center.className = "dungeon-hud-center";
    this.note = document.createElement("div");
    this.note.className = "dungeon-hud-note";
    const prompts = document.createElement("div");
    prompts.className = "dungeon-prompts";
    prompts.append(prompt("Shift", "Turn"), prompt("X", "Wait"));
    center.append(this.note, prompts);

    const hands = this.mountGear();
    this.weaponIcon = hands.weaponIcon;
    this.ammoBadge = hands.ammoBadge;
    this.blinkButton = hands.blinkButton;
    this.blinkBadge = hands.blinkBadge;

    left.append(this.portrait, bars, this.mountAbilityBar());
    bar.append(left, center, hands.row);
    host.append(this.canvas, bar);
    const leave = lesson ? () => this.lesson?.dead(this.lessonStep) : onHub;
    if (leave) this.lostPanel = this.lostBanner(leave);
    if (this.lostPanel) host.append(this.lostPanel);
    if (lesson) this.mountLesson();

    this.canvas.addEventListener("pointerdown", (event) => this.onPointer(event));
    this.canvas.addEventListener("pointermove", (event) => this.onHover(event));
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
      if (portrait) {
        portrait.clearRect(0, 0, this.portrait.width, this.portrait.height);
        const art = sprites.hero;
        const crop = Math.min(art.width, art.height * 0.62);
        portrait.drawImage(art, (art.width - crop) / 2, 0, crop, crop, 0, 0, this.portrait.width, this.portrait.height);
      }
      this.paintLoadout();
      this.paintAbilityBar();
      this.paintLessonWeapons();
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

  /** Уровень, который выбрали в меню перед забегом. */
  get pickedLevel(): number {
    return this.adventure;
  }

  /** Портал в хаб уже открыт: этаж зачищен. */
  get floorCleared(): boolean {
    return this.run.exit !== null;
  }

  get carriedGold(): number {
    return this.state.carried;
  }

  /** Поднятые шмотки. С зачищенного этажа забирается и та, что ещё лежит на полу. */
  get spoils(): { kind: RoomState["found"][number]["kind"]; catalogId: string }[] {
    const list = this.state.found.map((item) => ({ kind: item.kind, catalogId: item.catalogId }));
    if (this.state.outcome === "won") {
      for (const loot of this.state.loot) list.push({ kind: loot.kind, catalogId: loot.catalogId });
    }
    return list;
  }

  private commit(): void {
    syncRun(this.run);
    if (!this.lesson || !this.run.exit) return;
    this.run.exit = null;
    this.state.note = this.state.note.replace("The hub portal is open.", "").trim();
  }

  private mountLesson(): void {
    const card = document.createElement("div");
    card.className = "dungeon-panel dungeon-lesson";
    const text = document.createElement("p");
    text.style.margin = "0";
    const picks = document.createElement("div");
    picks.style.display = "none";
    picks.style.flexWrap = "wrap";
    picks.style.gap = "8px";
    for (const weapon of WEAPONS) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "dungeon-button";
      button.style.padding = "6px";
      button.style.display = "flex";
      button.style.flexDirection = "column";
      button.style.alignItems = "center";
      button.style.gap = "4px";
      button.style.width = "88px";
      const canvas = document.createElement("canvas");
      canvas.width = 48;
      canvas.height = 48;
      canvas.style.width = "48px";
      canvas.style.height = "48px";
      const label = document.createElement("span");
      label.textContent = weapon.name;
      label.style.fontSize = "12px";
      button.append(canvas, label);
      button.addEventListener("click", () => {
        if (this.lessonStep !== "pick") return;
        this.lesson?.finish(weapon.id);
      });
      picks.append(button);
    }
    const skip = document.createElement("button");
    skip.type = "button";
    skip.className = "dungeon-button";
    skip.style.padding = "8px 12px";
    skip.style.alignSelf = "flex-start";
    skip.textContent = "Skip";
    skip.addEventListener("click", () => this.lesson?.skip());
    card.append(text, picks, skip);
    this.lessonCard = card;
    this.lessonText = text;
    this.lessonPicks = picks;
    this.host.append(card);
    this.renderLesson();
  }

  private renderLesson(): void {
    if (!this.lessonText) return;
    this.lessonText.textContent = lessonText(this.lessonStep);
    if (this.lessonPicks) this.lessonPicks.style.display = this.lessonStep === "pick" ? "flex" : "none";
    this.paintLessonWeapons();
  }

  private paintLessonWeapons(): void {
    if (!this.sprites || !this.lessonPicks) return;
    const buttons = this.lessonPicks.querySelectorAll("button");
    WEAPONS.forEach((weapon, index) => {
      const canvas = buttons[index]?.querySelector("canvas");
      if (canvas instanceof HTMLCanvasElement) paintWeaponIcon(canvas, this.sprites?.weapons[weapon.id]);
    });
  }

  /** Смена типа между шагами урока не тратит ход. На R магазин пистолета уже не полный. */
  private syncLessonWeapon(): void {
    const id = lessonWeapon(this.lessonStep);
    const def = weaponById(id);
    const changed = this.state.weapon !== id;
    this.state.weapon = id;
    this.run.weapon = id;
    if (this.lessonStep === "reload") {
      const magazine = def.magazine ?? 1;
      if ((this.state.ammo ?? magazine) >= magazine) this.state.ammo = magazine - 1;
    } else if (changed || isSwingStep(this.lessonStep)) {
      this.state.ammo = def.magazine;
    }
    this.run.ammo = this.state.ammo;
    this.refresh();
  }

  private lessonAfter(event: LessonEvent): void {
    if (!this.lesson || this.state.outcome === "lost") return;
    const won = this.state.outcome === "won";
    const signal = this.lessonStep === "finish" && won ? "won" : event;
    const next = lessonAdvance(this.lessonStep, signal, won);
    if (next === this.lessonStep) return;
    this.lessonStep = next;
    this.releaseMoves();
    this.choosingBlink = false;
    this.syncLessonWeapon();
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

  private dropAbilityAim(): void {
    this.abilitySlot = null;
    this.state.aim = null;
  }

  face(dir: Dir): void {
    if (this.locked()) return;
    if (this.lesson && !lessonAllows(this.lessonStep, "face") && !isSwingStep(this.lessonStep)) return;
    const facing = this.state.hero.facing;
    const x = this.state.hero.x;
    const y = this.state.hero.y;
    this.choosingBlink = false;
    this.dropAbilityAim();
    face(this.state, dir);
    this.refresh();
    if (this.state.hero.facing !== facing && this.state.hero.x === x && this.state.hero.y === y) this.lessonAfter("face");
  }

  attack(): void {
    if (this.locked() || this.state.outcome === "lost") return;
    if (this.lesson && !lessonAllows(this.lessonStep, "attack")) return;
    this.dropAbilityAim();
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
    this.dropAbilityAim();
    const places = this.places();
    wait(this.state);
    this.playMoves(places);
    this.commit();
    this.refresh();
    this.lessonAfter("wait");
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
    this.dropAbilityAim();
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
    title.textContent = "The run is over";
    title.style.fontSize = "22px";
    const button = document.createElement("button");
    button.type = "button";
    button.className = "dungeon-button dungeon-button-primary";
    button.textContent = "To the hub";
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

  private syncArrowAim(): void {
    const ability = this.abilitySlot === null ? null : this.state.abilities[this.abilitySlot];
    if (!ability || ability.cast !== "arrow") return;
    this.state.aim = this.state.look ? arrowBeam(this.state, this.state.look) : [];
  }

  private onHover(event: PointerEvent): void {
    if (this.pause || this.mapOpen || this.state.outcome === "lost") return;
    const cell = this.cellFromEvent(event);
    const look = cell ? nearestAim(this.state.hero, cell) : null;
    const prev = this.state.look;
    if (look?.x === prev?.x && look?.y === prev?.y) return;
    this.state.look = look;
    this.syncArrowAim();
  }

  private onPointer(event: PointerEvent): void {
    if (this.pause) return;
    if (this.mapOpen) {
      this.onMapPointer(event);
      return;
    }
    if (this.locked() || this.state.outcome === "lost") return;
    const cell = this.cellFromEvent(event);
    if (this.abilitySlot !== null) {
      if (event.button === 2) {
        event.preventDefault();
        this.abilitySlot = null;
        this.state.aim = null;
        this.state.note = "Ability cancelled.";
        this.refresh();
        return;
      }
      if (event.button !== 0) return;
      const armed = this.state.abilities[this.abilitySlot];
      if (armed?.cast === "arrow") {
        if (!cell || !nearestAim(this.state.hero, cell)) return;
        this.state.look = nearestAim(this.state.hero, cell);
        const places = this.places();
        const cast = castHeroAbility(this.state, this.abilitySlot, cell);
        this.abilitySlot = null;
        this.state.aim = null;
        if (cast) {
          this.playMoves(places);
          this.commit();
        }
        this.refresh();
        return;
      }
      const aim = this.state.aim ?? [];
      if (cell && aim.some((spot) => spot.x === cell.x && spot.y === cell.y)) {
        const places = this.places();
        const cast = castHeroAbility(this.state, this.abilitySlot, cell);
        this.abilitySlot = null;
        this.state.aim = null;
        if (cast) {
          this.playMoves(places);
          this.commit();
        }
        this.refresh();
      }
      return;
    }
    if (event.button === 2) {
      event.preventDefault();
      this.toggleBlink();
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
    if (cell) this.state.look = nearestAim(this.state.hero, cell);
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
    this.dropAbilityAim();
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
    title.textContent = "Menu";
    const resume = this.pauseButton("Resume", true, () => this.closePause());
    const settings = this.pauseButton("Settings", false, () => openSettings(this.host));
    const giveUp = this.pauseButton("Surrender", false, () => {
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

  private mountGear(): {
    row: HTMLElement;
    weaponIcon: HTMLCanvasElement;
    ammoBadge: HTMLElement;
    blinkButton: HTMLButtonElement;
    blinkBadge: HTMLElement;
  } {
    const row = document.createElement("div");
    row.className = "dungeon-hud-right";

    const weapon = document.createElement("div");
    weapon.className = "dungeon-slot dungeon-gear-slot";
    const weaponIcon = document.createElement("canvas");
    weaponIcon.width = 96;
    weaponIcon.height = 96;
    weaponIcon.className = "dungeon-ability-icon";
    const weaponKey = document.createElement("span");
    weaponKey.className = "dungeon-ability-key";
    weaponKey.textContent = "LMB";
    const ammoBadge = document.createElement("span");
    ammoBadge.className = "dungeon-slot-count";
    weapon.append(weaponIcon, weaponKey, ammoBadge);
    bindTip(
      weapon,
      () => weaponById(this.state.weapon).name,
      () => {
        const worn = weaponById(this.state.weapon);
        const ammo = worn.magazine === null ? "" : `\n${this.state.ammo ?? worn.magazine}/${worn.magazine}. R reloads.`;
        return `${worn.figure} Left-click a tile to attack.${ammo}`;
      },
    );

    const blinkButton = document.createElement("button");
    blinkButton.type = "button";
    blinkButton.className = "dungeon-slot dungeon-gear-slot";
    const blinkIcon = document.createElement("canvas");
    blinkIcon.width = 96;
    blinkIcon.height = 96;
    blinkIcon.className = "dungeon-ability-icon";
    paintBlinkIcon(blinkIcon);
    const blinkKey = document.createElement("span");
    blinkKey.className = "dungeon-ability-key";
    blinkKey.textContent = "RMB";
    const blinkBadge = document.createElement("span");
    blinkBadge.className = "dungeon-slot-count";
    blinkButton.append(blinkIcon, blinkKey, blinkBadge);
    blinkButton.addEventListener("click", () => this.toggleBlink());
    bindTip(
      blinkButton,
      "Blink",
      () => `${this.state.blink} charges. Right-click, then left-click a lit cell. Right-click again cancels.`,
    );

    row.append(weapon, blinkButton);
    return { row, weaponIcon, ammoBadge, blinkButton, blinkBadge };
  }

  private mountAbilityBar(): HTMLElement {
    const bar = document.createElement("div");
    bar.className = "dungeon-ability-bar";
    for (let slot = 0; slot < 4; slot += 1) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "dungeon-slot dungeon-ability";
      const icon = document.createElement("canvas");
      icon.width = 96;
      icon.height = 96;
      icon.className = "dungeon-ability-icon";
      const key = document.createElement("span");
      key.className = "dungeon-ability-key";
      key.textContent = String(slot + 1);
      const cd = document.createElement("span");
      cd.className = "dungeon-ability-cd";
      button.append(icon, key, cd);
      button.addEventListener("click", () => this.pressAbility(slot));
      bindAbilityTip(button, () => {
        const ability = this.state.abilities[slot];
        if (!ability) return null;
        return abilityView(ability.id, ability.damage, null, ability.splash);
      });
      this.abilityButtons.push(button);
      bar.append(button);
    }
    return bar;
  }

  private paintAbilityBar(): void {
    for (let slot = 0; slot < this.abilityButtons.length; slot += 1) {
      const button = this.abilityButtons[slot];
      if (!button) continue;
      const ability = this.state.abilities[slot] ?? null;
      const icon = button.querySelector("canvas");
      const cd = button.querySelector(".dungeon-ability-cd");
      if (icon instanceof HTMLCanvasElement) paintAbilityIcon(icon, ability ? this.sprites?.abilities[ability.id] : undefined);
      button.classList.toggle("dungeon-slot-empty", !ability);
      button.classList.toggle("is-armed", this.abilitySlot === slot);
      const left = ability ? (this.state.hero.cooldowns[ability.id] ?? 0) : 0;
      const wait = Math.max(0, left - 1);
      const storm = ability?.cast === "blizzard" && this.state.blizzard !== null;
      if (cd instanceof HTMLElement) {
        cd.textContent = storm ? "On" : wait > 0 ? String(wait) : "";
        cd.classList.toggle("is-on", storm || wait > 0);
      }
      button.setAttribute("aria-label", ability ? ability.name : `${slot + 1}: empty`);
    }
    this.paintLoadout();
  }

  private paintLoadout(): void {
    paintWeaponIcon(this.weaponIcon, this.sprites?.weapons[this.state.weapon]);
    const worn = weaponById(this.state.weapon);
    const shots = worn.magazine === null ? null : (this.state.ammo ?? worn.magazine);
    this.ammoBadge.hidden = shots === null;
    this.ammoBadge.textContent = shots === null ? "" : String(shots);
    this.blinkBadge.textContent = String(this.state.blink);
    this.blinkButton.classList.toggle("is-armed", this.choosingBlink);
    this.blinkButton.setAttribute("aria-label", `Blink ${this.state.blink}`);
  }

  private toggleBlink(): void {
    if (this.pause || this.mapOpen || this.host.querySelector(".dungeon-settings")) return;
    if (this.locked() || this.state.outcome === "lost") return;
    if (this.lesson && !lessonAllows(this.lessonStep, "blink")) return;
    if (this.choosingBlink) {
      this.choosingBlink = false;
      this.state.note = "Blink cancelled.";
      this.refresh();
      return;
    }
    if (this.state.blink <= 0) {
      this.choosingBlink = false;
      this.state.note = "Blink is spent.";
      this.refresh();
      return;
    }
    this.abilitySlot = null;
    this.state.aim = null;
    this.choosingBlink = true;
    this.state.note = "Pick a Blink cell with the left button.";
    this.refresh();
  }

  private pressAbility(slot: number): void {
    if (this.lesson || this.pause || this.mapOpen || this.host.querySelector(".dungeon-settings")) return;
    if (this.locked()) {
      this.state.note = "Wait until the turn finishes drawing.";
      this.refresh();
      return;
    }
    this.armAbility(slot);
  }

  private armAbility(slot: number): void {
    const ability = this.state.abilities[slot];
    if (!ability) {
      this.abilitySlot = null;
      this.state.aim = null;
      this.state.note = "Empty slot. Equip an ability in the inventory.";
      this.refresh();
      return;
    }
    if (ability.cast === "arrow") {
      if (this.abilitySlot === slot) {
        this.abilitySlot = null;
        this.state.aim = null;
        this.refresh();
        return;
      }
      this.choosingBlink = false;
      this.abilitySlot = slot;
      this.syncArrowAim();
      this.state.note = `${ability.name}: aim with the cursor.`;
      this.refresh();
      return;
    }
    const aimed = ability.cast === "bolt" || ability.cast === "quake" || ability.cast === "shard";
    if (aimed) {
      if (this.abilitySlot === slot) {
        this.abilitySlot = null;
        this.state.aim = null;
        this.refresh();
        return;
      }
      this.choosingBlink = false;
      const cells = abilityAim(this.state, ability.id);
      if (cells.length === 0) {
        this.abilitySlot = null;
        this.state.aim = null;
        this.state.note = ability.cast === "bolt" ? "No monster inside the Blink diamond." : "No cell in the Blink diamond.";
        this.refresh();
        return;
      }
      this.abilitySlot = slot;
      this.state.aim = cells;
      this.state.note = `${ability.name}: pick a cell.`;
      this.refresh();
      return;
    }
    this.abilitySlot = null;
    this.state.aim = null;
    const places = this.places();
    const cast = castHeroAbility(this.state, slot, null);
    if (cast) {
      this.playMoves(places);
      this.commit();
    }
    this.refresh();
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
      this.dropAbilityAim();
      this.refresh();
      return;
    }
    const dir = MOVE_KEYS[event.code];
    if (dir) {
      event.preventDefault();
      if (event.shiftKey || this.shiftHeld) {
        if (!event.repeat && !this.locked() && !this.mapOpen && (!this.lesson || lessonAllows(this.lessonStep, "face") || isSwingStep(this.lessonStep))) this.face(dir);
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
    const slotKey = abilitySlotFromKey(event);
    if (slotKey >= 0) {
      event.preventDefault();
      if (!event.repeat) this.pressAbility(slotKey);
      return;
    }
    if (event.repeat || this.locked() || this.mapOpen) return;
    if (event.code === "KeyR") {
      if (this.lesson && !lessonAllows(this.lessonStep, "reload")) return;
      this.choosingBlink = false;
      this.dropAbilityAim();
      const places = this.places();
      if (reload(this.state)) {
        playReload(this.state.weapon, this.state.hero.facing);
        this.playMoves(places);
        this.lessonAfter("reload");
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
      return;
    }
    if (event.code === "Space") {
      event.preventDefault();
      this.interact();
    }
  }

  private interact(): void {
    if (this.pause || this.mapOpen || this.locked() || this.state.outcome === "lost") return;
    if (this.choosingBlink || this.abilitySlot !== null) return;
    const exit = this.run.exit?.room === this.run.current ? this.run.exit.cell : null;
    const target = interactTarget(this.state, exit);
    if (!target) return;
    if (target.kind === "portal") {
      if (this.lesson) return;
      this.onHub?.();
      return;
    }
    if (useChest(this.state, target.cell.x, target.cell.y)) {
      this.commit();
      this.refresh();
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
    const meter = this.state.meterTurns > 0 ? ` · Meter ${this.state.meterTurns}/${METER_TURNS}` : "";
    this.hpText.textContent = `${shownHp(this.state.hero.hp)}/${shownHp(this.state.hero.maxHp)}`;
    this.hpFill.style.width = `${Math.max(0, this.state.hero.hp / this.state.hero.maxHp) * 100}%`;
    this.mpText.textContent = `${this.state.mp}/${this.state.maxMp}`;
    this.mpFill.style.width = `${Math.max(0, this.state.mp / this.state.maxMp) * 100}%`;
    const room = this.state.room;
    const visited = this.run.visited.filter(Boolean).length;
    const living = livingMonsters(this.state);
    const foe = living.length === 0 ? "" : living.length === 1 ? `${living[0]!.name} · ` : `${living.length} foes · `;
    this.stats.textContent = `${foe}${room.name} · ${visited}/${this.run.rooms.length} · gold ${this.state.carried}${meter}`;
    this.note.textContent = this.state.note;
    this.paintAbilityBar();
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
      ? "This room has no teleport"
        : this.state.outcome === "lost"
          ? "Teleport is unavailable"
          : this.state.outcome !== "won"
            ? "Teleport is shut while an enemy lives"
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
