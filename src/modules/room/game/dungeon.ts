import type { Door, RoomTheme, Stamp } from "../data/rooms.ts";
import { doorway, isFloor, isWallCell, type Cell, type RoomLayout } from "./sim.ts";
import { FLAT_PROPS, scatterInterior, type PropKind } from "./interior.ts";
import { FLOOR_STONES, WALL_ROWS, type Sprites } from "./sprites.ts";

export interface Box {
  size: number;
  ox: number;
  oy: number;
}

/** Задняя стена выше клетки на эту долю: вид сверху под углом. */
const BACK_CAP = 0.24;
const WALL_LIFT = 0.4;
const TORCH_GAP = 4;

/** Сколько клеток по вертикали видно на экране. Камера держит героя в центре. */
const VIEW_ROWS = 12;
const VIEW_COLS_MIN = 9;

const RIM = "#2b3242";

export function cellSize(width: number, height: number): number {
  return Math.max(24, Math.floor(Math.min(height / VIEW_ROWS, width / VIEW_COLS_MIN)));
}

/** Положение сетки на экране, когда камера смотрит в центр клетки `camera`. */
export function boxAt(width: number, height: number, size: number, camera: Cell): Box {
  return {
    size,
    ox: Math.round(width / 2 - (camera.x + 0.5) * size),
    oy: Math.round(height / 2 - (camera.y + 0.5) * size),
  };
}

/** Картинка фона: сетка, кольцо стен вокруг неё, верх задней стены и запас под обводку. */
export function backgroundFrame(room: RoomLayout, size: number): { box: Box; width: number; height: number } {
  const margin = Math.ceil(size * 0.1);
  const ox = size + margin;
  const oy = size + Math.ceil(size * BACK_CAP) + margin;
  return {
    box: { size, ox, oy },
    width: ox + (room.w + 1) * size + margin,
    height: oy + (room.h + 1) * size + margin,
  };
}

function hash(x: number, y: number, salt: number): number {
  let n = Math.imul(x, 374761393) ^ Math.imul(y, 668265263) ^ Math.imul(salt, 1274126177);
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  n ^= n >>> 16;
  return (n >>> 0) / 4294967296;
}

const key = (x: number, y: number): string => `${x},${y}`;

export function createWallPattern(ctx: CanvasRenderingContext2D, sprites: Sprites): CanvasPattern | null {
  return ctx.createPattern(sprites.wall, "repeat");
}

/** Высота ряда кладки в долях клетки. Не кратна клетке, чтобы швы не совпали с полом. */
const COURSE = 0.37;

/** Кладка едет вместе со стенами, но её швы не стоят на границах клеток. */
export function alignWallPattern(pattern: CanvasPattern, box: Box, sprites: Sprites): void {
  const scale = (box.size * COURSE) / (sprites.wall.naturalHeight / WALL_ROWS);
  const shift = box.size * 0.2;
  pattern.setTransform(new DOMMatrix([scale, 0, 0, scale, box.ox - shift, box.oy - shift]));
}

function fillMasonry(
  ctx: CanvasRenderingContext2D,
  pattern: CanvasPattern | null,
  fallback: string,
  px: number,
  py: number,
  w: number,
  h: number,
  shade: number,
): void {
  ctx.fillStyle = pattern ?? fallback;
  ctx.fillRect(px, py, w, h);
  if (shade <= 0) return;
  ctx.fillStyle = `rgba(6, 8, 12, ${shade})`;
  ctx.fillRect(px, py, w, h);
}

/** Модель стены. Ряды и стойки сдвинуты, чтобы швы не вставали на границы клеток. */
interface WallLook {
  model: "masonry" | "rock" | "courses" | "plaster" | "timber" | "panels";
  base: string;
  alt: string;
  joint: string;
  course: number;
  block: number;
  /** Железная полоса поверх крупного камня. */
  band: boolean;
  /** Копоть снизу, у кухонной кладки. */
  soot: boolean;
  /** Деревянная панель по низу лицевой стены. */
  dado: boolean;
}

const WALLS: Record<RoomTheme, WallLook> = {
  crypt: { model: "masonry", base: "#4a5568", alt: "#5c677a", joint: "#1c212b", course: 0.37, block: 0.86, band: false, soot: false, dado: false },
  cave: { model: "rock", base: "#4a5344", alt: "#3a4236", joint: "#1a1e18", course: 0, block: 1.4, band: false, soot: false, dado: false },
  prison: { model: "courses", base: "#3e4654", alt: "#525b6c", joint: "#141820", course: 0.58, block: 1.22, band: true, soot: false, dado: false },
  chapel: { model: "courses", base: "#d4cec0", alt: "#c2baa8", joint: "#6a655c", course: 0.46, block: 1.48, band: false, soot: false, dado: false },
  hall: { model: "plaster", base: "#b7a890", alt: "#c8bba2", joint: "#5c4630", course: 0, block: 0, band: false, soot: false, dado: true },
  quarters: { model: "timber", base: "#d7c7aa", alt: "#c9b794", joint: "#4a301c", course: 0.86, block: 1.62, band: false, soot: false, dado: false },
  kitchen: { model: "courses", base: "#8a4636", alt: "#a85a42", joint: "#2c1612", course: 0.21, block: 0.48, band: false, soot: true, dado: false },
  library: { model: "panels", base: "#6a432c", alt: "#7c5338", joint: "#24160e", course: 0, block: 0.36, band: false, soot: false, dado: false },
};

/** Cave: та же каменная фактура, что у склепа, но темнее и с трещинами. Не овалы. */
function drawRockWall(
  ctx: CanvasRenderingContext2D,
  box: Box,
  pattern: CanvasPattern | null,
  px: number,
  py: number,
  w: number,
  h: number,
): void {
  ctx.fillStyle = pattern ?? "#3a4038";
  ctx.fillRect(px, py, w, h);
  ctx.fillStyle = "rgba(18, 24, 16, 0.55)";
  ctx.fillRect(px, py, w, h);
  const { size } = box;
  const step = size * 0.73;
  const x0 = box.ox - size * 0.2;
  const y0 = box.oy - size * 0.17;
  const c0 = Math.floor((px - x0) / step) - 1;
  const c1 = Math.floor((px + w - x0) / step) + 1;
  const r0 = Math.floor((py - y0) / step) - 1;
  const r1 = Math.floor((py + h - y0) / step) + 1;
  ctx.strokeStyle = "rgba(8, 10, 8, 0.9)";
  ctx.lineWidth = Math.max(1, size * 0.03);
  ctx.beginPath();
  for (let row = r0; row <= r1; row += 1) {
    for (let col = c0; col <= c1; col += 1) {
      if (hash(col, row, 4) > 0.42) continue;
      const x = x0 + col * step;
      const y = y0 + row * step;
      const len = step * (0.22 + hash(col, row, 5) * 0.28);
      const ang = hash(col, row, 6) * Math.PI;
      ctx.moveTo(x, y);
      ctx.lineTo(x + Math.cos(ang) * len, y + Math.sin(ang) * len);
    }
  }
  ctx.stroke();
}

function drawCourseWall(ctx: CanvasRenderingContext2D, box: Box, look: WallLook, px: number, py: number, w: number, h: number): void {
  const { size } = box;
  const courseH = size * look.course;
  const blockW = size * look.block;
  const y0 = box.oy - size * 0.2;
  const x0 = box.ox - size * 0.23;
  const firstRow = Math.floor((py - y0) / courseH) - 1;
  const lastRow = Math.floor((py + h - y0) / courseH) + 1;
  for (let row = firstRow; row <= lastRow; row += 1) {
    const y = y0 + row * courseH;
    const stagger = row % 2 === 0 ? 0 : blockW / 2;
    const firstCol = Math.floor((px - x0 - stagger) / blockW) - 1;
    const lastCol = Math.floor((px + w - x0 - stagger) / blockW) + 1;
    for (let col = firstCol; col <= lastCol; col += 1) {
      const x = x0 + stagger + col * blockW;
      ctx.fillStyle = hash(col, row, 8) > 0.78 ? look.alt : look.base;
      ctx.fillRect(x, y, blockW + 1, courseH + 1);
    }
  }
  ctx.strokeStyle = look.joint;
  ctx.lineWidth = Math.max(1, size * (look.course < 0.3 ? 0.025 : 0.04));
  ctx.beginPath();
  for (let row = firstRow; row <= lastRow; row += 1) {
    const y = y0 + row * courseH;
    ctx.moveTo(px, y);
    ctx.lineTo(px + w, y);
    const stagger = row % 2 === 0 ? 0 : blockW / 2;
    const firstCol = Math.floor((px - x0 - stagger) / blockW) - 1;
    const lastCol = Math.floor((px + w - x0 - stagger) / blockW) + 1;
    for (let col = firstCol; col <= lastCol; col += 1) {
      const x = x0 + stagger + col * blockW;
      ctx.moveTo(x, y);
      ctx.lineTo(x, y + courseH);
    }
  }
  ctx.stroke();
  if (!look.band) return;
  const period = size * 1.85;
  const bandY = box.oy + size * 0.15;
  ctx.fillStyle = "#12151c";
  for (let y = bandY + Math.floor((py - bandY) / period) * period; y < py + h; y += period) {
    ctx.fillRect(px, y, w, Math.max(2, size * 0.055));
  }
}

function drawPlasterWall(ctx: CanvasRenderingContext2D, look: WallLook, px: number, py: number, w: number, h: number, facade: boolean): void {
  ctx.fillStyle = look.base;
  ctx.fillRect(px, py, w, h);
  if (!facade || !look.dado) return;
  const rail = py + h * 0.64;
  ctx.fillStyle = "#6b4428";
  ctx.fillRect(px, rail, w, py + h - rail);
  ctx.fillStyle = look.joint;
  ctx.fillRect(px, rail, w, Math.max(2, h * 0.055));
}

function drawTimberWall(ctx: CanvasRenderingContext2D, box: Box, look: WallLook, px: number, py: number, w: number, h: number): void {
  const { size } = box;
  ctx.fillStyle = look.base;
  ctx.fillRect(px, py, w, h);
  const span = size * look.block;
  const post = size * 0.1;
  const x0 = box.ox - size * 0.31;
  const railSpan = size * look.course;
  const rail = size * 0.08;
  const y0 = box.oy - size * 0.17;
  ctx.fillStyle = look.joint;
  const firstRow = Math.floor((py - y0) / railSpan) - 1;
  const lastRow = Math.floor((py + h - y0) / railSpan) + 1;
  for (let row = firstRow; row <= lastRow; row += 1) ctx.fillRect(px, y0 + row * railSpan, w, rail);
  const firstCol = Math.floor((px - x0) / span) - 1;
  const lastCol = Math.floor((px + w - x0) / span) + 1;
  for (let col = firstCol; col <= lastCol; col += 1) ctx.fillRect(x0 + col * span, py, post, h);
}

/** Библиотека: доски с фактурой пола. Шаг не кратен клетке, швы не встают на сетку. */
function drawPanelWall(
  ctx: CanvasRenderingContext2D,
  box: Box,
  wood: HTMLImageElement | null,
  px: number,
  py: number,
  w: number,
  h: number,
): void {
  if (!wood) {
    ctx.fillStyle = "#6a432c";
    ctx.fillRect(px, py, w, h);
    return;
  }
  const span = box.size * 1.7;
  const x0 = box.ox - box.size * 0.4;
  const y0 = box.oy - box.size * 0.25;
  const startX = x0 + Math.floor((px - x0) / span) * span;
  const startY = y0 + Math.floor((py - y0) / span) * span;
  for (let y = startY; y < py + h; y += span) {
    for (let x = startX; x < px + w; x += span) {
      ctx.drawImage(wood, 0, 0, wood.naturalWidth, wood.naturalHeight, x, y, span, span);
    }
  }
  ctx.fillStyle = "rgba(24, 12, 6, 0.4)";
  ctx.fillRect(px, py, w, h);
}

function fillWall(
  ctx: CanvasRenderingContext2D,
  box: Box,
  theme: RoomTheme,
  pattern: CanvasPattern | null,
  px: number,
  py: number,
  w: number,
  h: number,
  shade: number,
  facade: boolean,
  wood: HTMLImageElement | null,
): void {
  const look = WALLS[theme];
  ctx.save();
  ctx.beginPath();
  ctx.rect(px, py, w, h);
  ctx.clip();
  if (look.model === "masonry") fillMasonry(ctx, pattern, look.base, px, py, w, h, 0);
  else if (look.model === "rock") drawRockWall(ctx, box, pattern, px, py, w, h);
  else if (look.model === "courses") drawCourseWall(ctx, box, look, px, py, w, h);
  else if (look.model === "plaster") drawPlasterWall(ctx, look, px, py, w, h, facade);
  else if (look.model === "timber") drawTimberWall(ctx, box, look, px, py, w, h);
  else drawPanelWall(ctx, box, wood, px, py, w, h);
  if (look.soot && facade) {
    const soot = ctx.createLinearGradient(0, py + h * 0.4, 0, py + h);
    soot.addColorStop(0, "rgba(18, 10, 8, 0)");
    soot.addColorStop(1, "rgba(18, 10, 8, 0.62)");
    ctx.fillStyle = soot;
    ctx.fillRect(px, py + h * 0.4, w, h * 0.6);
  }
  if (shade > 0) {
    ctx.fillStyle = `rgba(6, 8, 12, ${shade})`;
    ctx.fillRect(px, py, w, h);
  }
  ctx.restore();
}

/** Стены вокруг силуэта комнаты, проёмы дверей и факелы. Считается один раз на комнату. */
export interface Dressing {
  rim: readonly Cell[];
  rimKeys: ReadonlySet<string>;
  /** Клетки стены, у которых видна кирпичная грань: пол прямо под ними или внешний угол над полом. */
  back: ReadonlySet<string>;
  doorways: readonly { door: Door; cell: Cell }[];
  torches: readonly Cell[];
  theme: RoomTheme;
}

export function dressRoom(room: RoomLayout, exits: readonly Door[]): Dressing {
  const doorways = exits.map((door) => ({ door, cell: doorway(door) }));
  const gaps = new Set(doorways.map(({ cell }) => key(cell.x, cell.y)));
  const rim: Cell[] = [];
  const rimKeys = new Set<string>();
  const back = new Set<string>();
  for (let y = -1; y <= room.h; y += 1) {
    for (let x = -1; x <= room.w; x += 1) {
      if (isFloor(room, x, y) || gaps.has(key(x, y))) continue;
      let near = false;
      for (let dy = -1; dy <= 1 && !near; dy += 1) {
        for (let dx = -1; dx <= 1 && !near; dx += 1) near = isFloor(room, x + dx, y + dy);
      }
      if (!near) continue;
      rim.push({ x, y });
      rimKeys.add(key(x, y));
      const below = isFloor(room, x, y + 1);
      const corner =
        (isFloor(room, x - 1, y + 1) || isFloor(room, x + 1, y + 1)) &&
        !isFloor(room, x - 1, y) &&
        !isFloor(room, x + 1, y) &&
        !isFloor(room, x, y - 1);
      if (below || corner) back.add(key(x, y));
    }
  }

  const torches: Cell[] = [];
  for (const cell of rim) {
    if (!isFloor(room, cell.x, cell.y + 1)) continue;
    if (!back.has(key(cell.x - 1, cell.y)) || !back.has(key(cell.x + 1, cell.y))) continue;
    if (torches.some((t) => Math.abs(t.x - cell.x) + Math.abs(t.y - cell.y) < TORCH_GAP)) continue;
    torches.push(cell);
  }
  return { rim, rimKeys, back, doorways, torches, theme: room.theme };
}

function drawFloor(ctx: CanvasRenderingContext2D, box: Box, room: RoomLayout, sprites: Sprites): void {
  const { size, ox, oy } = box;
  const living = room.theme === "hall" || room.theme === "quarters" || room.theme === "kitchen" || room.theme === "library";
  const tex = living ? sprites.woodFloor : sprites.floor;
  const sw = tex.naturalWidth / FLOOR_STONES;
  const sh = tex.naturalHeight / FLOOR_STONES;
  for (let y = 0; y < room.h; y += 1) {
    for (let x = 0; x < room.w; x += 1) {
      if (!isFloor(room, x, y)) continue;
      const col = Math.floor(hash(x, y, 1) * FLOOR_STONES);
      const row = Math.floor(hash(x, y, 2) * FLOOR_STONES);
      ctx.drawImage(tex, col * sw, row * sh, sw, sh, ox + x * size, oy + y * size, size, size);
    }
  }
  ctx.strokeStyle = "rgba(10, 12, 18, 0.65)";
  ctx.lineWidth = Math.max(1, Math.round(size * 0.03));
  ctx.beginPath();
  for (let y = 0; y < room.h; y += 1) {
    for (let x = 0; x < room.w; x += 1) {
      if (!isFloor(room, x, y)) continue;
      const px = ox + x * size + 0.5;
      const py = oy + y * size + 0.5;
      ctx.moveTo(px, py);
      ctx.lineTo(px + size, py);
      ctx.moveTo(px, py);
      ctx.lineTo(px, py + size);
      if (!isFloor(room, x + 1, y)) {
        ctx.moveTo(px + size, py);
        ctx.lineTo(px + size, py + size);
      }
      if (!isFloor(room, x, y + 1)) {
        ctx.moveTo(px, py + size);
        ctx.lineTo(px + size, py + size);
      }
    }
  }
  ctx.stroke();
}

/** Тень стен на пол: от задней стены вниз, от боковых внутрь. */
function drawWallShade(ctx: CanvasRenderingContext2D, box: Box, room: RoomLayout): void {
  const { size, ox, oy } = box;
  for (let y = 0; y < room.h; y += 1) {
    for (let x = 0; x < room.w; x += 1) {
      if (!isFloor(room, x, y)) continue;
      const px = ox + x * size;
      const py = oy + y * size;
      if (!isFloor(room, x, y - 1)) {
        const shade = ctx.createLinearGradient(0, py, 0, py + size * 0.8);
        shade.addColorStop(0, "rgba(0, 0, 0, 0.5)");
        shade.addColorStop(1, "rgba(0, 0, 0, 0)");
        ctx.fillStyle = shade;
        ctx.fillRect(px, py, size, size * 0.8);
      }
      if (!isFloor(room, x - 1, y)) {
        const shade = ctx.createLinearGradient(px, 0, px + size * 0.4, 0);
        shade.addColorStop(0, "rgba(0, 0, 0, 0.32)");
        shade.addColorStop(1, "rgba(0, 0, 0, 0)");
        ctx.fillStyle = shade;
        ctx.fillRect(px, py, size * 0.4, size);
      }
      if (!isFloor(room, x + 1, y)) {
        const shade = ctx.createLinearGradient(px + size, 0, px + size * 0.6, 0);
        shade.addColorStop(0, "rgba(0, 0, 0, 0.32)");
        shade.addColorStop(1, "rgba(0, 0, 0, 0)");
        ctx.fillStyle = shade;
        ctx.fillRect(px + size * 0.6, py, size * 0.4, size);
      }
    }
  }
}

function drawPit(ctx: CanvasRenderingContext2D, box: Box, pattern: CanvasPattern | null, theme: RoomTheme, stamp: Stamp): void {
  const { size, ox, oy } = box;
  const px = ox + stamp.x * size;
  const py = oy + stamp.y * size;
  const w = stamp.w * size;
  const h = stamp.h * size;
  ctx.fillStyle = "#040507";
  ctx.fillRect(px, py, w, h);
  const depth = Math.min(h, size * 0.6);
  fillWall(ctx, box, theme, pattern, px, py, w, depth, 0, false, null);
  const fall = ctx.createLinearGradient(0, py, 0, py + depth);
  fall.addColorStop(0, "rgba(4, 5, 7, 0.35)");
  fall.addColorStop(1, "rgba(4, 5, 7, 1)");
  ctx.fillStyle = fall;
  ctx.fillRect(px, py, w, depth);
  const edge = Math.max(2, Math.round(size * 0.06));
  ctx.strokeStyle = "#4a5367";
  ctx.lineWidth = edge;
  ctx.strokeRect(px + edge / 2, py + edge / 2, w - edge, h - edge);
}

function drawShadows(ctx: CanvasRenderingContext2D, box: Box, room: RoomLayout): void {
  const { size, ox, oy } = box;
  ctx.fillStyle = "rgba(0, 0, 0, 0.34)";
  for (const stamp of room.stamps) {
    if (stamp.kind === "pit" || stamp.kind === "sarcophagus") continue;
    ctx.fillRect(
      ox + stamp.x * size + size * 0.18,
      oy + stamp.y * size + size * 0.24,
      stamp.w * size,
      stamp.h * size,
    );
  }
}

const PROP_SCALE = {
  bones: 0.62,
  blood: 0.72,
  web: 0.5,
  chain: 0.55,
  candle: 0.46,
  barrel: 0.94,
} as const;

function legacyProp(sprites: Sprites, kind: PropKind): HTMLCanvasElement | undefined {
  if (kind === "bones") return sprites.bones;
  if (kind === "candle") return sprites.candle;
  if (kind === "web") return sprites.web;
  if (kind === "blood") return sprites.blood;
  if (kind === "barrel") return sprites.barrel;
  if (kind === "chain") return sprites.chain;
  return undefined;
}

const solidBox = new WeakMap<HTMLCanvasElement, { x: number; y: number; w: number; h: number }>();

/** Плотная рамка рисунка: обрезанный холст всё left держит полупрозрачную кайму. */
function solidBounds(sprite: HTMLCanvasElement): { x: number; y: number; w: number; h: number } {
  const cached = solidBox.get(sprite);
  if (cached) return cached;
  const source = sprite.getContext("2d");
  if (!source) return { x: 0, y: 0, w: sprite.width, h: sprite.height };
  const data = source.getImageData(0, 0, sprite.width, sprite.height).data;
  let left = sprite.width;
  let top = sprite.height;
  let right = -1;
  let bottom = -1;
  for (let y = 0; y < sprite.height; y += 1) {
    for (let x = 0; x < sprite.width; x += 1) {
      if ((data[(y * sprite.width + x) * 4 + 3] ?? 0) < 128) continue;
      if (x < left) left = x;
      if (x > right) right = x;
      if (y < top) top = y;
      if (y > bottom) bottom = y;
    }
  }
  const bounds =
    right < left
      ? { x: 0, y: 0, w: sprite.width, h: sprite.height }
      : { x: left, y: top, w: right - left + 1, h: bottom - top + 1 };
  solidBox.set(sprite, bounds);
  return bounds;
}

function drawPropSprite(
  ctx: CanvasRenderingContext2D,
  box: Box,
  sprite: HTMLCanvasElement,
  x: number,
  y: number,
  scale: number,
  upright: boolean,
  contain = false,
): void {
  const { size, ox, oy } = box;
  const src = contain ? solidBounds(sprite) : { x: 0, y: 0, w: sprite.width, h: sprite.height };
  const fit = (size * scale) / Math.max(src.w, src.h);
  const w = src.w * fit;
  const h = src.h * fit;
  ctx.save();
  if (contain) {
    ctx.drawImage(sprite, src.x, src.y, src.w, src.h, ox + x * size + (size - w) / 2, oy + y * size + (size - h) / 2, w, h);
  } else if (upright) {
    ctx.translate(ox + (x + 0.5) * size, oy + (y + 1) * size - size * 0.12);
    ctx.drawImage(sprite, -w / 2, -h, w, h);
  } else {
    ctx.globalAlpha = 0.88;
    ctx.translate(ox + (x + 0.5) * size, oy + (y + 0.55) * size);
    ctx.rotate(hash(x, y, 7) * Math.PI * 2);
    ctx.drawImage(sprite, -w / 2, -h / 2, w, h);
  }
  ctx.restore();
}

function drawDecor(ctx: CanvasRenderingContext2D, box: Box, room: RoomLayout, sprites: Sprites, doors: readonly { x: number; y: number }[]): void {
  for (const decor of room.decor) drawPropSprite(ctx, box, sprites.bones, decor.x, decor.y, 0.62, false);
  const props = scatterInterior(room, doors).filter((prop) => prop.kind !== "barrel" && prop.kind !== "chest" && prop.kind !== "cellchest");
  const flat = props.filter((prop) => prop.kind === "blood" || prop.kind === "web");
  const rest = props.filter((prop) => prop.kind !== "blood" && prop.kind !== "web");
  for (const prop of [...flat, ...rest]) {
    const fresh = sprites.props[prop.kind];
    if (fresh) {
      drawPropSprite(ctx, box, fresh, prop.x, prop.y, FLAT_PROPS.has(prop.kind) ? 0.74 : 0.84, false, true);
      continue;
    }
    const sprite = legacyProp(sprites, prop.kind);
    if (!sprite || !(prop.kind in PROP_SCALE)) continue;
    drawPropSprite(ctx, box, sprite, prop.x, prop.y, PROP_SCALE[prop.kind as keyof typeof PROP_SCALE], prop.kind === "candle", false);
  }
}

function drawBackWall(
  ctx: CanvasRenderingContext2D,
  box: Box,
  face: CanvasPattern | null,
  theme: RoomTheme,
  wood: HTMLImageElement | null,
  cell: Cell,
): void {
  const { size, ox, oy } = box;
  const px = ox + cell.x * size;
  const py = oy + cell.y * size;
  fillWall(ctx, box, theme, face, px, py, size, size, 0.12, true, wood);
  const shade = ctx.createLinearGradient(0, py + size * 0.72, 0, py + size);
  shade.addColorStop(0, "rgba(6, 8, 12, 0)");
  shade.addColorStop(1, "rgba(6, 8, 12, 0.4)");
  ctx.fillStyle = shade;
  ctx.fillRect(px, py + size * 0.72, size, size * 0.28);
}

function drawRimCell(
  ctx: CanvasRenderingContext2D,
  box: Box,
  face: CanvasPattern | null,
  theme: RoomTheme,
  wood: HTMLImageElement | null,
  cell: Cell,
): void {
  const { size, ox, oy } = box;
  const px = ox + cell.x * size;
  const py = oy + cell.y * size;
  fillWall(ctx, box, theme, face, px, py, size, size, 0.12, false, wood);
}

/** Как выглядит проём. Форма и материал зависят от типа комнаты. */
interface DoorLook {
  shape: "arch" | "point" | "rect" | "cave";
  frame: string;
  inner: string;
  /** Толщина косяка, доля клетки. */
  jamb: number;
  /** Ширина отверстия, доля клетки. */
  mouth: number;
  /** Верх отверстия: для арки линия пят, для прямоугольника притолока, для стрельчатой — остриё. */
  crown: number;
  rivets: boolean;
  passage: "stone" | "wood" | "dirt";
  gate: "iron" | "wood";
}

const DOORS: Record<RoomTheme, DoorLook> = {
  crypt: { shape: "arch", frame: "#6d7688", inner: "#3e4656", jamb: 0.13, mouth: 0.66, crown: 0.46, rivets: false, passage: "stone", gate: "iron" },
  cave: { shape: "cave", frame: "#2a3128", inner: "#141814", jamb: 0.2, mouth: 0.72, crown: 0.18, rivets: false, passage: "dirt", gate: "iron" },
  prison: { shape: "rect", frame: "#5c6574", inner: "#1c2028", jamb: 0.14, mouth: 0.6, crown: 0.2, rivets: true, passage: "stone", gate: "iron" },
  hall: { shape: "rect", frame: "#8d5a32", inner: "#3d2414", jamb: 0.1, mouth: 0.78, crown: 0.14, rivets: false, passage: "wood", gate: "wood" },
  quarters: { shape: "rect", frame: "#c4894e", inner: "#5a3418", jamb: 0.16, mouth: 0.52, crown: 0.32, rivets: false, passage: "wood", gate: "wood" },
  chapel: { shape: "point", frame: "#d5d0c4", inner: "#6a655c", jamb: 0.11, mouth: 0.56, crown: 0.14, rivets: false, passage: "stone", gate: "iron" },
  kitchen: { shape: "rect", frame: "#6b3e22", inner: "#2a160c", jamb: 0.18, mouth: 0.56, crown: 0.38, rivets: false, passage: "wood", gate: "wood" },
  library: { shape: "arch", frame: "#5c3d28", inner: "#2a1a10", jamb: 0.12, mouth: 0.58, crown: 0.44, rivets: false, passage: "wood", gate: "wood" },
};

function traceOpening(ctx: CanvasRenderingContext2D, px: number, py: number, size: number, look: DoorLook, cell: Cell): void {
  const left = px + ((1 - look.mouth) / 2) * size;
  const right = left + look.mouth * size;
  const mid = px + size / 2;
  const bottom = py + size;
  if (look.shape === "point") {
    ctx.beginPath();
    ctx.moveTo(left, bottom);
    ctx.lineTo(left, py + size * 0.58);
    ctx.lineTo(mid, py + look.crown * size);
    ctx.lineTo(right, py + size * 0.58);
    ctx.lineTo(right, bottom);
    ctx.closePath();
    return;
  }
  if (look.shape === "cave") {
    const rough = [
      [0.18, 1], [0.08, 0.76], [0.24, 0.52], [0.1, 0.3], [0.36, 0.12], [0.58, 0.2], [0.74, 0.08], [0.92, 0.3], [0.78, 0.54], [0.9, 0.78], [0.78, 1],
    ];
    ctx.beginPath();
    rough.forEach((point, index) => {
      const fx = point[0] ?? 0.5;
      const fy = point[1] ?? 0.5;
      const jx = Math.min(0.94, Math.max(0.06, fx + (hash(cell.x, cell.y, index) - 0.5) * 0.06));
      const jy = Math.min(0.98, Math.max(0.06, fy + (hash(cell.x, cell.y, index + 20) - 0.5) * 0.05));
      const x = px + jx * size;
      const y = py + jy * size;
      if (index === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.closePath();
    return;
  }
  if (look.shape === "arch") {
    const spring = py + look.crown * size;
    const radius = (look.mouth * size) / 2;
    ctx.beginPath();
    ctx.moveTo(left, bottom);
    ctx.lineTo(left, spring);
    ctx.arc(mid, spring, radius, Math.PI, 0);
    ctx.lineTo(right, bottom);
    ctx.closePath();
    return;
  }
  const top = py + look.crown * size;
  ctx.beginPath();
  ctx.rect(left, top, right - left, bottom - top);
}

function drawCaveRock(ctx: CanvasRenderingContext2D, px: number, py: number, size: number, cell: Cell): void {
  ctx.fillStyle = "#3c4338";
  ctx.fillRect(px, py, size, size);
  ctx.fillStyle = "#2a3128";
  for (let i = 0; i < 4; i += 1) {
    ctx.beginPath();
    ctx.ellipse(
      px + hash(cell.x, cell.y, i) * size,
      py + hash(cell.x, cell.y, i + 4) * size,
      size * 0.16,
      size * 0.09,
      hash(cell.x, cell.y, i + 8) * 3,
      0,
      Math.PI * 2,
    );
    ctx.fill();
  }
}

function drawNorthDoor(
  ctx: CanvasRenderingContext2D,
  box: Box,
  face: CanvasPattern | null,
  theme: RoomTheme,
  wood: HTMLImageElement | null,
  cell: Cell,
): void {
  const { size, ox, oy } = box;
  const px = ox + cell.x * size;
  const py = oy + cell.y * size;
  const look = DOORS[theme];
  ctx.save();
  ctx.beginPath();
  ctx.rect(px, py, size, size);
  ctx.clip();
  if (look.shape === "cave") drawCaveRock(ctx, px, py, size, cell);
  else drawBackWall(ctx, box, face, theme, wood, cell);
  traceOpening(ctx, px, py, size, look, cell);
  ctx.fillStyle = "#050608";
  ctx.fill();
  ctx.lineJoin = "round";
  ctx.strokeStyle = look.frame;
  ctx.lineWidth = Math.max(2, size * look.jamb);
  ctx.stroke();
  if (look.shape === "arch" || look.shape === "rect" || look.shape === "point") {
    ctx.save();
    traceOpening(ctx, px, py, size, look, cell);
    ctx.clip();
    ctx.strokeStyle = look.inner;
    ctx.lineWidth = Math.max(1, size * 0.04);
    ctx.stroke();
    ctx.restore();
  }
  if (look.rivets) {
    const left = px + ((1 - look.mouth) / 2) * size;
    const right = left + look.mouth * size;
    const top = py + look.crown * size;
    const spots: readonly (readonly [number, number])[] = [
      [left, top],
      [right, top],
      [left, py + size * 0.92],
      [right, py + size * 0.92],
    ];
    for (const [sx, sy] of spots) {
      ctx.beginPath();
      ctx.arc(sx, sy, Math.max(1.5, size * 0.035), 0, Math.PI * 2);
      ctx.fillStyle = "#c5cad3";
      ctx.fill();
      ctx.strokeStyle = look.inner;
      ctx.lineWidth = 1;
      ctx.stroke();
    }
  }
  if (theme === "hall") {
    const mid = px + size / 2;
    const y = py + look.crown * size * 0.55;
    ctx.beginPath();
    ctx.moveTo(mid, y - size * 0.05);
    ctx.lineTo(mid + size * 0.05, y);
    ctx.lineTo(mid, y + size * 0.05);
    ctx.lineTo(mid - size * 0.05, y);
    ctx.closePath();
    ctx.fillStyle = look.inner;
    ctx.fill();
  }
  if (theme === "chapel") {
    const mid = px + size / 2;
    const y = py + look.crown * size * 0.45;
    ctx.strokeStyle = look.inner;
    ctx.lineWidth = Math.max(1, size * 0.03);
    ctx.beginPath();
    ctx.moveTo(mid, y - size * 0.05);
    ctx.lineTo(mid, y + size * 0.05);
    ctx.moveTo(mid - size * 0.035, y - size * 0.01);
    ctx.lineTo(mid + size * 0.035, y - size * 0.01);
    ctx.stroke();
  }
  ctx.restore();
}

function drawPassageFloor(ctx: CanvasRenderingContext2D, sprites: Sprites, look: DoorLook, px: number, py: number, size: number): void {
  if (look.passage === "dirt") {
    ctx.fillStyle = "#241e18";
    ctx.fillRect(px, py, size, size);
    return;
  }
  const tex = look.passage === "wood" ? sprites.woodFloor : sprites.floor;
  const sw = tex.naturalWidth / FLOOR_STONES;
  ctx.drawImage(tex, 0, 0, sw, sw, px, py, size, size);
}

function drawSideDoor(
  ctx: CanvasRenderingContext2D,
  box: Box,
  sprites: Sprites,
  theme: RoomTheme,
  door: Door,
  cell: Cell,
): void {
  const { size, ox, oy } = box;
  const px = ox + cell.x * size;
  const py = oy + cell.y * size;
  const look = DOORS[theme];
  ctx.save();
  ctx.beginPath();
  ctx.rect(px, py, size, size);
  ctx.clip();
  drawPassageFloor(ctx, sprites, look, px, py, size);
  const away =
    door.side === "south"
      ? ctx.createLinearGradient(0, py, 0, py + size)
      : door.side === "east"
        ? ctx.createLinearGradient(px, 0, px + size, 0)
        : ctx.createLinearGradient(px + size, 0, px, 0);
  away.addColorStop(0, "rgba(5, 6, 8, 0.2)");
  away.addColorStop(1, "rgba(5, 6, 8, 1)");
  ctx.fillStyle = away;
  ctx.fillRect(px, py, size, size);
  const jamb = size * look.jamb;
  if (look.shape === "cave") {
    ctx.fillStyle = look.frame;
    ctx.beginPath();
    if (door.side === "south") {
      ctx.moveTo(px, py);
      ctx.lineTo(px + size * 0.26, py + size * 0.2);
      ctx.lineTo(px + size * 0.1, py + size * 0.55);
      ctx.lineTo(px + size * 0.28, py + size * 0.85);
      ctx.lineTo(px, py + size);
      ctx.moveTo(px + size, py);
      ctx.lineTo(px + size * 0.74, py + size * 0.18);
      ctx.lineTo(px + size * 0.9, py + size * 0.5);
      ctx.lineTo(px + size * 0.7, py + size * 0.82);
      ctx.lineTo(px + size, py + size);
    } else if (door.side === "east") {
      ctx.moveTo(px, py);
      ctx.lineTo(px + size * 0.2, py + size * 0.26);
      ctx.lineTo(px + size * 0.55, py + size * 0.1);
      ctx.lineTo(px + size * 0.85, py + size * 0.28);
      ctx.lineTo(px + size, py);
      ctx.moveTo(px, py + size);
      ctx.lineTo(px + size * 0.18, py + size * 0.74);
      ctx.lineTo(px + size * 0.5, py + size * 0.9);
      ctx.lineTo(px + size * 0.82, py + size * 0.7);
      ctx.lineTo(px + size, py + size);
    } else {
      ctx.moveTo(px + size, py);
      ctx.lineTo(px + size * 0.8, py + size * 0.26);
      ctx.lineTo(px + size * 0.45, py + size * 0.1);
      ctx.lineTo(px + size * 0.15, py + size * 0.28);
      ctx.lineTo(px, py);
      ctx.moveTo(px + size, py + size);
      ctx.lineTo(px + size * 0.82, py + size * 0.74);
      ctx.lineTo(px + size * 0.5, py + size * 0.9);
      ctx.lineTo(px + size * 0.18, py + size * 0.7);
      ctx.lineTo(px, py + size);
    }
    ctx.fill();
    ctx.restore();
    return;
  }
  ctx.fillStyle = look.frame;
  if (door.side === "south") {
    ctx.fillRect(px, py, jamb, size);
    ctx.fillRect(px + size - jamb, py, jamb, size);
    ctx.fillRect(px, py + size - jamb * 0.7, size, jamb * 0.7);
  } else {
    ctx.fillRect(px, py, size, jamb);
    ctx.fillRect(px, py + size - jamb, size, jamb);
    const band = door.side === "west" ? px : px + size - jamb * 0.7;
    ctx.fillRect(band, py, jamb * 0.7, size);
  }
  ctx.restore();
}

function drawDoorway(
  ctx: CanvasRenderingContext2D,
  box: Box,
  face: CanvasPattern | null,
  sprites: Sprites,
  theme: RoomTheme,
  door: Door,
  cell: Cell,
): void {
  if (door.side === "north") drawNorthDoor(ctx, box, face, theme, sprites.woodFloor, cell);
  else drawSideDoor(ctx, box, sprites, theme, door, cell);
}

export function drawBarrel(ctx: CanvasRenderingContext2D, box: Box, sprites: Sprites, x: number, y: number): void {
  drawPropSprite(ctx, box, sprites.barrel, x, y, PROP_SCALE.barrel, true, true);
}

export function drawKeg(ctx: CanvasRenderingContext2D, box: Box, sprite: HTMLCanvasElement, x: number, y: number): void {
  drawPropSprite(ctx, box, sprite, x, y, PROP_SCALE.barrel, true, true);
}

export function drawChair(ctx: CanvasRenderingContext2D, box: Box, sprites: Sprites, x: number, y: number): void {
  drawPropSprite(ctx, box, sprites.chair, x, y, 0.86, true, true);
}

export function drawFurniture(
  ctx: CanvasRenderingContext2D,
  box: Box,
  sprites: Sprites,
  piece: { kind: "table" | "shelf"; x: number; y: number; w: number; h: number },
): void {
  const sprite = piece.kind === "table" ? sprites.table : sprites.shelf;
  const src = solidBounds(sprite);
  const px = box.ox + piece.x * box.size;
  const py = box.oy + piece.y * box.size;
  const w = piece.w * box.size;
  const h = piece.h * box.size;
  const fit = Math.min((w * 0.92) / src.w, (h * 0.92) / src.h);
  ctx.drawImage(
    sprite,
    src.x,
    src.y,
    src.w,
    src.h,
    px + (w - src.w * fit) / 2,
    py + (h - src.h * fit) / 2,
    src.w * fit,
    src.h * fit,
  );
}

function drawTorches(ctx: CanvasRenderingContext2D, box: Box, dressing: Dressing, sprites: Sprites): void {
  const sprite = sprites.torch;
  const h = box.size * 0.9;
  const w = h * (sprite.width / sprite.height);
  for (const cell of dressing.torches) {
    const cx = box.ox + (cell.x + 0.5) * box.size;
    const top = box.oy + cell.y * box.size + box.size * 0.05;
    ctx.drawImage(sprite, cx - w / 2, top, w, h);
  }
}

export function paintBackground(
  ctx: CanvasRenderingContext2D,
  box: Box,
  room: RoomLayout,
  dressing: Dressing,
  sprites: Sprites,
): void {
  const face = createWallPattern(ctx, sprites);
  if (face) alignWallPattern(face, box, sprites);
  drawFloor(ctx, box, room, sprites);
  for (const stamp of room.stamps) if (stamp.kind === "pit") drawPit(ctx, box, face, room.theme, stamp);
  drawWallShade(ctx, box, room);
  drawShadows(ctx, box, room);
  drawDecor(
    ctx,
    box,
    room,
    sprites,
    dressing.doorways.map(({ door }) => door),
  );
  for (const cell of dressing.rim) {
    if (dressing.back.has(key(cell.x, cell.y))) drawBackWall(ctx, box, face, room.theme, sprites.woodFloor, cell);
    else drawRimCell(ctx, box, face, room.theme, sprites.woodFloor, cell);
  }
  for (const { door, cell } of dressing.doorways) drawDoorway(ctx, box, face, sprites, room.theme, door, cell);
  drawTorches(ctx, box, dressing, sprites);
}

function drawWoodGate(ctx: CanvasRenderingContext2D, px: number, py: number, w: number, h: number, look: DoorLook): void {
  const gap = Math.max(2, w * 0.06);
  const leaf = (w - gap) / 2;
  ctx.fillStyle = look.frame;
  ctx.fillRect(px, py, leaf, h);
  ctx.fillRect(px + leaf + gap, py, leaf, h);
  ctx.strokeStyle = look.inner;
  ctx.lineWidth = Math.max(2, Math.min(w, h) * 0.08);
  ctx.beginPath();
  ctx.moveTo(px + w * 0.12, py + h * 0.8);
  ctx.lineTo(px + w * 0.88, py + h * 0.2);
  ctx.stroke();
}

function drawIronGate(
  ctx: CanvasRenderingContext2D,
  px: number,
  py: number,
  w: number,
  h: number,
  vertical: boolean,
): void {
  const bar = Math.max(2, Math.round(Math.min(w, h) * 0.08));
  ctx.fillStyle = "#1a1d24";
  if (vertical) {
    for (let i = 1; i <= 4; i += 1) ctx.fillRect(px + (w * i) / 5 - bar / 2, py, bar, h);
    ctx.fillRect(px, py + h * 0.55, w, bar);
    return;
  }
  ctx.fillRect(px, py, w, h);
  ctx.fillStyle = "#4b5568";
  for (let i = 1; i <= 4; i += 1) {
    if (w < h) ctx.fillRect(px, py + (h * i) / 5 - bar / 2, w, bar);
    else ctx.fillRect(px + (w * i) / 5 - bar / 2, py, bar, h);
  }
}

/** Закрытая дверь, пока в комнате жив монстр. Жилые комнаты — деревянная створка, остальные — решётка. */
export function drawDoorBars(ctx: CanvasRenderingContext2D, box: Box, dressing: Dressing): void {
  const { size, ox, oy } = box;
  const look = DOORS[dressing.theme];
  for (const { door, cell } of dressing.doorways) {
    const px = ox + cell.x * size;
    const py = oy + cell.y * size;
    if (door.side === "north") {
      const left = px + ((1 - look.mouth) / 2) * size;
      const width = look.mouth * size;
      const top = py + (look.shape === "cave" ? 0.28 : look.crown) * size;
      const height = py + size - top;
      ctx.save();
      traceOpening(ctx, px, py, size, look, cell);
      ctx.clip();
      if (look.gate === "wood") drawWoodGate(ctx, left, top, width, height, look);
      else drawIronGate(ctx, left, top, width, height, true);
      ctx.restore();
      continue;
    }
    const thick = size * 0.28;
    if (door.side === "south") {
      if (look.gate === "wood") drawWoodGate(ctx, px + size * 0.12, py, size * 0.76, thick, look);
      else drawIronGate(ctx, px, py, size, thick, false);
      continue;
    }
    const gx = door.side === "east" ? px : px + size - thick;
    if (look.gate === "wood") drawWoodGate(ctx, gx, py + size * 0.12, thick, size * 0.76, look);
    else drawIronGate(ctx, gx, py, thick, size, false);
  }
}

function drawWallCell(
  ctx: CanvasRenderingContext2D,
  box: Box,
  room: RoomLayout,
  face: CanvasPattern | null,
  wood: HTMLImageElement | null,
  x: number,
  y: number,
): void {
  const { size, ox, oy } = box;
  const px = ox + x * size;
  const py = oy + y * size;
  const lift = size * WALL_LIFT;
  const below = isWallCell(room, x, y + 1);
  const edge = Math.max(1, Math.round(size * 0.04));

  if (!below) {
    fillWall(ctx, box, room.theme, face, px, py + size - lift, size, lift, 0, false, wood);
    const shade = ctx.createLinearGradient(0, py + size - lift, 0, py + size);
    shade.addColorStop(0, "rgba(8, 10, 16, 0.12)");
    shade.addColorStop(1, "rgba(8, 10, 16, 0.48)");
    ctx.fillStyle = shade;
    ctx.fillRect(px, py + size - lift, size, lift);
  }

  const left = !isWallCell(room, x - 1, y);
  const right = !isWallCell(room, x + 1, y);
  const bodyH = below ? size : size - lift;
  fillWall(ctx, box, room.theme, face, px, py, size, bodyH, 0.2, !below, wood);

  ctx.strokeStyle = "#151920";
  ctx.lineWidth = edge;
  ctx.beginPath();
  if (left) {
    ctx.moveTo(px, py);
    ctx.lineTo(px, py + size);
  }
  if (right) {
    ctx.moveTo(px + size, py);
    ctx.lineTo(px + size, py + size);
  }
  if (!below) {
    ctx.moveTo(px, py + size - lift);
    ctx.lineTo(px + size, py + size - lift);
    ctx.moveTo(px, py + size);
    ctx.lineTo(px + size, py + size);
  }
  ctx.stroke();
}

function fitSprite(
  sprite: HTMLCanvasElement,
  maxW: number,
  maxH: number,
): { w: number; h: number } {
  const scale = Math.min(maxW / sprite.width, maxH / sprite.height);
  return { w: sprite.width * scale, h: sprite.height * scale };
}

function drawProp(ctx: CanvasRenderingContext2D, box: Box, sprites: Sprites, stamp: Stamp): void {
  const { size, ox, oy } = box;
  const px = ox + stamp.x * size;
  const py = oy + stamp.y * size;
  const w = stamp.w * size;
  const h = stamp.h * size;

  if (stamp.kind === "pillar") {
    const sprite = sprites.pillar;
    const scale = Math.min((w * 0.78) / sprite.width, h / sprite.height);
    const dw = sprite.width * scale;
    const dh = sprite.height * scale;
    ctx.drawImage(sprite, px + (w - dw) / 2, py + h - dh, dw, dh);
    return;
  }

  if (stamp.kind === "sarcophagus") {
    const vertical = stamp.h > stamp.w;
    const fit = vertical
      ? fitSprite(sprites.sarcophagus, h * 0.92, w * 0.92)
      : fitSprite(sprites.sarcophagus, w * 0.92, h * 0.92);
    const dh = vertical ? fit.w : fit.h;
    ctx.save();
    ctx.translate(px + w / 2, py + h - dh / 2);
    if (vertical) ctx.rotate(Math.PI / 2);
    ctx.drawImage(sprites.sarcophagus, -fit.w / 2, -fit.h / 2, fit.w, fit.h);
    ctx.restore();
    return;
  }
}

/** Высокие препятствия ряда рисуются вместе с героем и монстром этого ряда, чтобы ближний ряд перекрывал дальний. */
export function drawRowObstacles(
  ctx: CanvasRenderingContext2D,
  box: Box,
  room: RoomLayout,
  sprites: Sprites,
  face: CanvasPattern | null,
  row: number,
): void {
  for (const stamp of room.stamps) {
    if (stamp.kind === "pit") continue;
    if (stamp.kind === "wall") {
      if (row < stamp.y || row >= stamp.y + stamp.h) continue;
      for (let x = stamp.x; x < stamp.x + stamp.w; x += 1) drawWallCell(ctx, box, room, face, sprites.woodFloor, x, row);
      continue;
    }
    if (stamp.y + stamp.h - 1 === row) drawProp(ctx, box, sprites, stamp);
  }
}

export function drawLighting(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  box: Box,
  torches: readonly Cell[],
  hero: Cell,
): void {
  const { size, ox, oy } = box;
  const reach = Math.hypot(width, height) * 0.55;
  const vignette = ctx.createRadialGradient(width / 2, height / 2, reach * 0.4, width / 2, height / 2, reach);
  vignette.addColorStop(0, "rgba(4, 5, 9, 0)");
  vignette.addColorStop(1, "rgba(4, 5, 9, 0.65)");
  ctx.fillStyle = vignette;
  ctx.fillRect(0, 0, width, height);

  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  torches.forEach((cell) => {
    const radius = size * 3.2;
    const fx = ox + (cell.x + 0.5) * size;
    const fy = oy + cell.y * size + size * 0.2;
    const light = ctx.createRadialGradient(fx, fy, 0, fx, fy, radius);
    light.addColorStop(0, "rgba(255, 170, 80, 0.3)");
    light.addColorStop(0.45, "rgba(255, 130, 50, 0.1)");
    light.addColorStop(1, "rgba(255, 120, 40, 0)");
    ctx.fillStyle = light;
    ctx.fillRect(fx - radius, fy - radius, radius * 2, radius * 2);
  });
  const hx = ox + (hero.x + 0.5) * size;
  const hy = oy + (hero.y + 0.5) * size;
  const glow = ctx.createRadialGradient(hx, hy, 0, hx, hy, size * 2.6);
  glow.addColorStop(0, "rgba(255, 225, 180, 0.12)");
  glow.addColorStop(1, "rgba(255, 225, 180, 0)");
  ctx.fillStyle = glow;
  ctx.fillRect(hx - size * 2.6, hy - size * 2.6, size * 5.2, size * 5.2);
  ctx.restore();
}
