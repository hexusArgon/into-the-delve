import heroUrl from "../../../../assets/hero-rogue.webp";
import swordUrl from "../../../../assets/sword.webp";
import monsterUrl from "../../../../assets/monster.webp";
import floorUrl from "../../../../assets/dungeon-floor.webp";
import wallUrl from "../../../../assets/dungeon-wall.webp";
import pillarUrl from "../../../../assets/pillar-front.webp";
import sarcophagusUrl from "../../../../assets/sarcophagus-front.webp";
import torchUrl from "../../../../assets/torch.webp";
import bonesUrl from "../../../../assets/bones.webp";
import candleUrl from "../../../../assets/candle.webp";
import cobwebUrl from "../../../../assets/cobweb.webp";
import bloodUrl from "../../../../assets/blood.webp";
import barrelUrl from "../../../../assets/barrel.webp";
import chainUrl from "../../../../assets/chain.webp";
import shelfUrl from "../../../../assets/shelf.webp";
import tableUrl from "../../../../assets/table.webp";
import chairUrl from "../../../../assets/chair.webp";
import woodFloorUrl from "../../../../assets/wood-floor.webp";
import goldUrl from "../../../../assets/gold.webp";
import exitUrl from "../../../../assets/portal-exit.webp";
import { WEAPONS, type WeaponId } from "../data/weapons.ts";
import { keySprite } from "./sprite-key.ts";

/** Спрайт каждого типа оружия. Name файла — id из таблицы. */
const weaponFiles = import.meta.glob("../../../../assets/weapons/*.{webp,jpg}", {
  eager: true,
  import: "default",
}) as Record<string, string>;

const propFiles = import.meta.glob("../../../../assets/props/*.{webp,jpg}", {
  eager: true,
  import: "default",
}) as Record<string, string>;

const itemFiles = import.meta.glob("../../../../assets/items/*.{webp,jpg}", {
  eager: true,
  import: "default",
}) as Record<string, string>;

const abilityFiles = import.meta.glob("../../../../assets/abilities/*.{webp,jpg}", {
  eager: true,
  import: "default",
}) as Record<string, string>;

const statusFiles = import.meta.glob("../../../../assets/status/icon-*.{webp,jpg}", {
  eager: true,
  import: "default",
}) as Record<string, string>;

/** Спрайты из колонки «Спрайт» таблицы монстров. Name файла — номер строки. */
const monsterFiles = import.meta.glob("../../../../assets/monsters/*.{webp,jpg}", {
  eager: true,
  import: "default",
}) as Record<string, string>;

const kegFiles = import.meta.glob("../../../../assets/barrels/*.{webp,jpg}", {
  eager: true,
  import: "default",
}) as Record<string, string>;

export interface Sprites {
  hero: HTMLCanvasElement;
  sword: HTMLCanvasElement;
  monster: HTMLCanvasElement;
  /** Плиты пола, сетка 6×6 камней. */
  floor: HTMLImageElement;
  /** Лицо стены: кладка с фасада, около 6 рядов. Швы не совпадают с клетками пола. */
  wall: HTMLImageElement;
  pillar: HTMLCanvasElement;
  sarcophagus: HTMLCanvasElement;
  torch: HTMLCanvasElement;
  bones: HTMLCanvasElement;
  candle: HTMLCanvasElement;
  web: HTMLCanvasElement;
  blood: HTMLCanvasElement;
  barrel: HTMLCanvasElement;
  /** Бочки автоматона. Ключ — стихия: fire, water, ice, poison, oil. */
  kegs: Readonly<Record<string, HTMLCanvasElement>>;
  chain: HTMLCanvasElement;
  shelf: HTMLCanvasElement;
  table: HTMLCanvasElement;
  chair: HTMLCanvasElement;
  woodFloor: HTMLImageElement;
  /** Горсть монет на полу и в хранилище. */
  gold: HTMLCanvasElement;
  /** Железная рама выхода из приключения. */
  exit: HTMLCanvasElement;
  /** Спрайты монстров из таблицы, ключ — номер строки. */
  monsters: Readonly<Record<string, HTMLCanvasElement>>;
  /** Спрайт каждого типа оружия. */
  weapons: Readonly<Partial<Record<WeaponId, HTMLCanvasElement>>>;
  /** Новые предметы комнат. Ключ — имя файла в assets/props. */
  props: Readonly<Record<string, HTMLCanvasElement>>;
  /** Иконки снаряжения. Ключ — id вещи. */
  items: Readonly<Record<string, HTMLCanvasElement>>;
  /** Иконки способностей героя. Ключ — id способности. */
  abilities: Readonly<Record<string, HTMLCanvasElement>>;
  /** Иконки бафов и дебафов. Ключ — имя файла без icon-. */
  status: Readonly<Record<string, HTMLCanvasElement>>;
}

export const FLOOR_STONES = 6;
export const WALL_ROWS = 6;

/**
 * Убирает фон по цвету угла картинки, края смягчает и снимает с них розовый отлив.
 * Нужен только исходнику JPG на пурпурном фоне: WebP из scripts/optimize-assets.py уже вырезан.
 */
function keyed(source: HTMLImageElement): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = source.naturalWidth;
  canvas.height = source.naturalHeight;
  const ctx = canvas.getContext("2d");
  if (!ctx) return canvas;
  ctx.drawImage(source, 0, 0);
  const frame = ctx.getImageData(0, 0, canvas.width, canvas.height);
  keySprite(frame.data);
  ctx.putImageData(frame, 0, 0);
  return canvas;
}

/** Картинка уже с прозрачностью, фон вырезать не нужно. */
function plain(source: HTMLImageElement): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = source.naturalWidth;
  canvas.height = source.naturalHeight;
  canvas.getContext("2d")?.drawImage(source, 0, 0);
  return canvas;
}

/**
 * Бандл на static.idos.games, страница — на домене игры. Картинка с чужого домена без CORS
 * портит холст, и комната остаётся чёрной. Тот же файл есть рядом со страницей.
 */
function assetOnPage(url: string): string {
  try {
    const parsed = new URL(url, window.location.href);
    if (parsed.origin === window.location.origin) return parsed.href;
    const file = parsed.pathname.split("/").pop();
    if (!file) return parsed.href;
    return new URL(`assets/${file}`, new URL("./", window.location.href)).href;
  } catch {
    return url;
  }
}

function loadImage(url: string): Promise<HTMLImageElement> {
  const src = assetOnPage(url);
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => {
      spriteProgress?.();
      resolve(image);
    };
    image.onerror = () => reject(new Error(`sprite ${src}`));
    image.src = src;
  });
}

let spriteProgress: (() => void) | null = null;

/** WebP и PNG собраны скриптом: фон вырезан, поля обрезаны. */
function prepared(url: string): boolean {
  return /\.(webp|png)(?:[?#].*)?$/i.test(url);
}

/** Готовый спрайт: WebP берётся как есть, JPG на пурпурном фоне вырезается здесь. */
async function cutout(url: string, trim = true): Promise<HTMLCanvasElement> {
  const image = await loadImage(url);
  if (prepared(url)) return plain(image);
  const canvas = keyed(image);
  return trim ? trimmed(canvas) : canvas;
}

/** Id спрайта — имя файла без расширения. */
function fileId(path: string, pattern = /[/\\]([a-z0-9-]+)\.(?:webp|jpg)$/): string | undefined {
  return pattern.exec(path)?.[1];
}

let cached: Promise<Sprites> | null = null;

function trimmed(source: HTMLCanvasElement): HTMLCanvasElement {
  const ctx = source.getContext("2d");
  if (!ctx) return source;
  const { width, height } = source;
  const data = ctx.getImageData(0, 0, width, height).data;
  let left = width;
  let top = height;
  let right = -1;
  let bottom = -1;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if ((data[(y * width + x) * 4 + 3] ?? 0) < 24) continue;
      if (x < left) left = x;
      if (x > right) right = x;
      if (y < top) top = y;
      if (y > bottom) bottom = y;
    }
  }
  if (right < left || bottom < top) return source;
  const out = document.createElement("canvas");
  out.width = right - left + 1;
  out.height = bottom - top + 1;
  out.getContext("2d")?.drawImage(source, left, top, out.width, out.height, 0, 0, out.width, out.height);
  return out;
}

/**
 * Все спрайты игры. Грузятся один раз за сессию: каждый новый забег берёт уже готовые.
 * Повторный вызов сразу сообщает полную полосу.
 */
export function loadSprites(onProgress?: (ratio: number) => void): Promise<Sprites> {
  if (cached) {
    if (onProgress) void cached.then(() => onProgress(1));
    return cached;
  }
  const pending = readSprites(onProgress);
  cached = pending;
  // Сбой сети не должен навсегда закрыть загрузку: следующий забег попробует снова.
  pending.catch(() => {
    if (cached === pending) cached = null;
  });
  return pending;
}

async function readSprites(onProgress?: (ratio: number) => void): Promise<Sprites> {
  const total =
    20 +
    Object.keys(monsterFiles).length +
    Object.keys(weaponFiles).length +
    Object.keys(propFiles).length +
    Object.keys(statusFiles).length +
    Object.keys(kegFiles).length +
    Object.keys(itemFiles).length +
    Object.keys(abilityFiles).length;
  let done = 0;
  spriteProgress = () => {
    done += 1;
    onProgress?.(Math.min(1, done / total));
  };
  try {
    // Всё грузится разом: этапы друг друга не ждут.
    const textures = Promise.all([floorUrl, wallUrl, woodFloorUrl].map(loadImage));
    const frames = Promise.all([heroUrl, swordUrl, monsterUrl].map((url) => cutout(url, false)));
    const decor = Promise.all(
      [
        pillarUrl,
        sarcophagusUrl,
        torchUrl,
        bonesUrl,
        candleUrl,
        cobwebUrl,
        bloodUrl,
        barrelUrl,
        chainUrl,
        shelfUrl,
        tableUrl,
        chairUrl,
        goldUrl,
        exitUrl,
      ].map((url) => cutout(url)),
    );
    const sets = Promise.all([
      loadMonsterSprites(),
      loadWeaponSprites(),
      collect(propFiles, /[/\\]([a-z]+)\.(?:webp|jpg)$/),
      collect(statusFiles, /icon-([a-z0-9-]+)\.(?:webp|jpg)$/),
      collect(kegFiles, /[/\\]([a-z]+)\.(?:webp|jpg)$/),
      collect(itemFiles),
      collect(abilityFiles),
    ]);
    const [[floor, wall, woodFloor], [hero, sword, monster], decorList, [monsters, weapons, props, status, kegs, items, abilities]] =
      await Promise.all([textures, frames, decor, sets]);
    const [pillar, sarcophagus, torch, bones, candle, web, blood, barrel, chain, shelf, table, chair, gold, exit] = decorList;
    onProgress?.(1);
    return {
      hero: hero!,
      sword: sword!,
      monster: monster!,
      floor: floor!,
      wall: wall!,
      pillar: pillar!,
      sarcophagus: sarcophagus!,
      torch: torch!,
      bones: bones!,
      candle: candle!,
      web: web!,
      blood: blood!,
      barrel: barrel!,
      kegs,
      chain: chain!,
      shelf: shelf!,
      table: table!,
      chair: chair!,
      woodFloor: woodFloor!,
      gold: gold!,
      exit: exit!,
      monsters,
      weapons,
      props,
      items,
      abilities,
      status,
    };
  } finally {
    spriteProgress = null;
  }
}

/** Папка спрайтов по id из имени файла. */
async function collect(files: Record<string, string>, pattern?: RegExp): Promise<Record<string, HTMLCanvasElement>> {
  const out: Record<string, HTMLCanvasElement> = {};
  await Promise.all(
    Object.entries(files).map(async ([path, url]) => {
      const id = fileId(path, pattern);
      if (!id || out[id]) return;
      out[id] = await cutout(url);
    }),
  );
  return out;
}

async function loadWeaponSprites(): Promise<Partial<Record<WeaponId, HTMLCanvasElement>>> {
  const weapons: Partial<Record<WeaponId, HTMLCanvasElement>> = {};
  const found = await collect(weaponFiles, /[/\\]([a-z]+)\.(?:webp|jpg)$/);
  for (const [id, sprite] of Object.entries(found)) {
    // Один спрайт посоха на все стихии.
    if (id === "staff") {
      for (const weapon of WEAPONS) if (weapon.id.startsWith("staff")) weapons[weapon.id] = sprite;
      continue;
    }
    if (WEAPONS.some((weapon) => weapon.id === id)) weapons[id as WeaponId] = sprite;
  }
  return weapons;
}

/** Спрайты из колонки «Спрайт» таблицы монстров. Ключ — номер строки. */
function loadMonsterSprites(): Promise<Record<string, HTMLCanvasElement>> {
  return collect(monsterFiles, /[/\\](\d+)\.(?:webp|jpg)$/);
}
