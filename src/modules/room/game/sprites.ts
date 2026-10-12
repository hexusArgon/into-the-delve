import heroUrl from "../../../../assets/hero-rogue.jpg";
import swordUrl from "../../../../assets/sword.jpg";
import monsterUrl from "../../../../assets/monster.jpg";
import floorUrl from "../../../../assets/dungeon-floor.jpg";
import wallUrl from "../../../../assets/dungeon-wall.jpg";
import pillarUrl from "../../../../assets/pillar-front.jpg";
import sarcophagusUrl from "../../../../assets/sarcophagus-front.jpg";
import torchUrl from "../../../../assets/torch.jpg";
import bonesUrl from "../../../../assets/bones.jpg";
import candleUrl from "../../../../assets/candle.jpg";
import cobwebUrl from "../../../../assets/cobweb.jpg";
import bloodUrl from "../../../../assets/blood.jpg";
import barrelUrl from "../../../../assets/barrel.jpg";
import chainUrl from "../../../../assets/chain.jpg";
import shelfUrl from "../../../../assets/shelf.jpg";
import tableUrl from "../../../../assets/table.jpg";
import chairUrl from "../../../../assets/chair.jpg";
import woodFloorUrl from "../../../../assets/wood-floor.jpg";
import goldUrl from "../../../../assets/gold.png";
import { WEAPONS, type WeaponId } from "../data/weapons.ts";

/** Спрайт каждого типа оружия. Имя файла — id из таблицы. */
const weaponFiles = import.meta.glob("../../../../assets/weapons/*.jpg", {
  eager: true,
  import: "default",
}) as Record<string, string>;

const propFiles = import.meta.glob("../../../../assets/props/*.jpg", {
  eager: true,
  import: "default",
}) as Record<string, string>;

/** Спрайты из колонки «Спрайт» таблицы монстров. Имя файла — номер строки. */
const monsterFiles = import.meta.glob("../../../../assets/monsters/*.jpg", {
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
  chain: HTMLCanvasElement;
  shelf: HTMLCanvasElement;
  table: HTMLCanvasElement;
  chair: HTMLCanvasElement;
  woodFloor: HTMLImageElement;
  /** Горсть монет на полу и в хранилище. */
  gold: HTMLCanvasElement;
  /** Спрайты монстров из таблицы, ключ — номер строки. */
  monsters: Readonly<Record<string, HTMLCanvasElement>>;
  /** Спрайт каждого типа оружия. */
  weapons: Readonly<Partial<Record<WeaponId, HTMLCanvasElement>>>;
  /** Новые предметы комнат. Ключ — имя файла в assets/props. */
  props: Readonly<Record<string, HTMLCanvasElement>>;
}

export const FLOOR_STONES = 6;
export const WALL_ROWS = 6;

const KEY_SOLID = 60;
const KEY_EDGE = 120;

/** Картинка уже с прозрачностью, фон вырезать не нужно. */
function plain(source: HTMLImageElement): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = source.naturalWidth;
  canvas.height = source.naturalHeight;
  canvas.getContext("2d")?.drawImage(source, 0, 0);
  return canvas;
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`sprite ${url}`));
    image.src = url;
  });
}

/** Убирает фон по цвету угла картинки, края смягчает и снимает с них розовый отлив. */
function keyed(source: HTMLImageElement): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = source.naturalWidth;
  canvas.height = source.naturalHeight;
  const ctx = canvas.getContext("2d");
  if (!ctx) return canvas;
  ctx.drawImage(source, 0, 0);
  const frame = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const data = frame.data;
  const kr = data[0] ?? 255;
  const kg = data[1] ?? 0;
  const kb = data[2] ?? 255;
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i] ?? 0;
    const g = data[i + 1] ?? 0;
    const b = data[i + 2] ?? 0;
    const dist = Math.hypot(r - kr, g - kg, b - kb);
    if (dist < KEY_SOLID) {
      data[i + 3] = 0;
      continue;
    }
    if (dist >= KEY_EDGE) continue;
    data[i + 3] = Math.round(((dist - KEY_SOLID) / (KEY_EDGE - KEY_SOLID)) * 255);
    const spill = Math.min(r, b) - g;
    if (spill > 0) {
      data[i] = r - spill;
      data[i + 2] = b - spill;
    }
  }
  ctx.putImageData(frame, 0, 0);
  return canvas;
}

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

export async function loadSprites(): Promise<Sprites> {
  const [hero, sword, monster, floor, wall, pillar, sarcophagus, torch, bones, candle, web, blood, barrel, chain, shelf, table, chair, woodFloor, gold] =
    await Promise.all(
      [
        heroUrl,
        swordUrl,
        monsterUrl,
        floorUrl,
        wallUrl,
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
        woodFloorUrl,
        goldUrl,
      ].map(loadImage),
    );
  return {
    hero: keyed(hero!),
    sword: keyed(sword!),
    monster: keyed(monster!),
    floor: floor!,
    wall: wall!,
    pillar: trimmed(keyed(pillar!)),
    sarcophagus: trimmed(keyed(sarcophagus!)),
    torch: trimmed(keyed(torch!)),
    bones: trimmed(keyed(bones!)),
    candle: trimmed(keyed(candle!)),
    web: trimmed(keyed(web!)),
    blood: trimmed(keyed(blood!)),
    barrel: trimmed(keyed(barrel!)),
    chain: trimmed(keyed(chain!)),
    shelf: trimmed(keyed(shelf!)),
    table: trimmed(keyed(table!)),
    chair: trimmed(keyed(chair!)),
    woodFloor: woodFloor!,
    gold: trimmed(plain(gold!)),
    monsters: await loadMonsterSprites(),
    weapons: await loadWeaponSprites(),
    props: await loadPropSprites(),
  };
}

async function loadPropSprites(): Promise<Record<string, HTMLCanvasElement>> {
  const props: Record<string, HTMLCanvasElement> = {};
  await Promise.all(
    Object.entries(propFiles).map(async ([path, url]) => {
      const id = /[/\\]([a-z]+)\.jpg$/.exec(path)?.[1];
      if (!id) return;
      props[id] = trimmed(keyed(await loadImage(url)));
    }),
  );
  return props;
}

async function loadWeaponSprites(): Promise<Partial<Record<WeaponId, HTMLCanvasElement>>> {
  const weapons: Partial<Record<WeaponId, HTMLCanvasElement>> = {};
  await Promise.all(
    Object.entries(weaponFiles).map(async ([path, url]) => {
      const id = /\/([a-z]+)\.jpg$/.exec(path)?.[1];
      if (!id || !WEAPONS.some((weapon) => weapon.id === id)) return;
      weapons[id as WeaponId] = trimmed(keyed(await loadImage(url)));
    }),
  );
  return weapons;
}

async function loadMonsterSprites(): Promise<Record<string, HTMLCanvasElement>> {
  const monsters: Record<string, HTMLCanvasElement> = {};
  await Promise.all(
    Object.entries(monsterFiles).map(async ([path, url]) => {
      const id = /\/(\d+)\.jpg$/.exec(path)?.[1];
      if (!id) return;
      monsters[id] = trimmed(keyed(await loadImage(url)));
    }),
  );
  return monsters;
}
