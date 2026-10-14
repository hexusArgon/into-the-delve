import {
  alignWallPattern,
  backgroundFrame,
  boxAt,
  cellSize,
  createWallPattern,
  dressRoom,
  drawBarrel,
  drawChair,
  drawDoorBars,
  drawFurniture,
  drawLighting,
  drawRowObstacles,
  paintBackground,
  type Box,
  type Dressing,
} from "./dungeon.ts";
import { drawBlinkFx } from "./blink-draw.ts";
import { burstAge, drawAbilityBurst, drawHazardHint, drawHeroZones, drawWindupHint, type AbilityBurst } from "./ability-draw.ts";
import { drawExitPad, drawMapOverlay, drawMinimap, drawPortalPad, hitMapRoom, type MapHit, type MapView } from "./map.ts";
import { Motion, type Pose } from "./motion.ts";
import { weaponById, type WeaponId } from "../data/weapons.ts";
import {
  DIRS,
  attackCells,
  interactTarget,
  blinkCells,
  isBlocked,
  isPit,
  activeHeroZones,
  roomMonsters,
  type Cell,
  type Dir,
  type Fighter,
  type GroundKind,
  type RoomLayout,
  type RoomState,
} from "./sim.ts";
import type { Sprites } from "./sprites.ts";

/** Затемнение при входе в комнату, мс. */
const FADE_MS = 320;
/** Как быстро камера догоняет героя. Меньше — дольше и мягче. */
const CAMERA_FOLLOW = 5;
/** Смерть монстра: осел и погас на своей клетке. */
const DEATH_MS = 320;
/** Падение героя и затягивание экрана кровью. Замедлено на 40% по просьбе дизайнера. */
const HERO_FALL_MS = 952;
const BLOOD_DELAY_MS = 280;
const BLOOD_MS = 1820;

export type { MapView };

/** Насколько видны сквозь высокий объект фигуры и эффекты пола, которые он закрывает. */
const BLEND_ACTOR_ALPHA = 0.5;
const BLEND_FLOOR_ALPHA = 0.85;

interface Layer {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
}

interface BloodSplat {
  x: number;
  y: number;
  r: number;
  rot: number;
  delay: number;
  /** 1 — круглая капля, больше — вытянутая, с хвостиком. */
  stretch: number;
}

function bloodRand(i: number): number {
  let n = Math.imul(i ^ 0x9e3779b9, 0x85ebca6b);
  n = Math.imul(n ^ (n >>> 13), 0xc2b2ae35);
  n ^= n >>> 16;
  return (n >>> 0) / 4294967296;
}

/** Плотное пятно справа снизу и россыпь капель к левому верхнему углу. Один набор, чтобы не мигало. */
const BLOOD_SPLATS: BloodSplat[] = (() => {
  const origin = { x: 0.82, y: 0.78 };
  const spots: BloodSplat[] = [];
  for (let i = 0; i < 36; i += 1) {
    const angle = bloodRand(i + 3) * Math.PI * 2;
    const dist = Math.pow(bloodRand(i + 50), 0.42) * 0.2;
    spots.push({
      x: origin.x + Math.cos(angle) * dist,
      y: origin.y + Math.sin(angle) * dist * 0.72,
      r: 0.012 + bloodRand(i + 90) * 0.05,
      rot: angle,
      delay: dist * 0.2,
      stretch: 1 + bloodRand(i + 130) * 0.8,
    });
  }
  for (let i = 0; i < 180; i += 1) {
    const angle = -2.7 + bloodRand(i + 200) * 2.5;
    const dist = 0.06 + Math.pow(bloodRand(i + 280), 0.72) * 0.95;
    const fine = bloodRand(i + 360) < 0.62;
    const drip = !fine && bloodRand(i + 440) < 0.22;
    spots.push({
      x: origin.x + Math.cos(angle) * dist,
      y: origin.y + Math.sin(angle) * dist,
      r: fine ? 0.0012 + bloodRand(i + 520) * 0.0035 : 0.004 + bloodRand(i + 600) * 0.013,
      rot: angle + Math.PI,
      delay: 0.04 + dist * 0.5,
      stretch: drip ? 2.4 + bloodRand(i + 680) * 2.2 : fine ? 1 : 1.15 + bloodRand(i + 740) * 0.6,
    });
  }
  return spots;
})();

function drawBloodVeil(ctx: CanvasRenderingContext2D, width: number, height: number, amount: number): void {
  if (amount <= 0) return;
  const unit = Math.min(width, height);
  ctx.save();
  ctx.fillStyle = `rgba(10, 0, 0, ${amount * 0.5})`;
  ctx.fillRect(0, 0, width, height);
  for (const spot of BLOOD_SPLATS) {
    const grow = (amount - spot.delay) / Math.max(0.08, 1 - spot.delay);
    if (grow <= 0) continue;
    const shown = Math.min(1, grow);
    const rx = spot.r * unit * (0.35 + 0.65 * shown);
    const ry = rx * spot.stretch;
    ctx.fillStyle = spot.r > 0.02 ? "rgba(196, 0, 4, 0.94)" : "rgba(230, 6, 8, 0.92)";
    ctx.beginPath();
    ctx.ellipse(spot.x * width, spot.y * height, rx, ry, spot.rot, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function drawStrikeFlash(
  ctx: CanvasRenderingContext2D,
  box: Box,
  flash: { x: number; y: number; rot: number; a: number },
): void {
  const { size, ox, oy } = box;
  const cx = ox + (flash.x + 0.5) * size;
  const cy = oy + (flash.y + 0.42) * size;
  const len = size * 0.42 * (0.65 + 0.35 * flash.a);
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(flash.rot);
  ctx.strokeStyle = `rgba(255, 236, 214, ${0.35 + 0.65 * flash.a})`;
  ctx.lineWidth = Math.max(2, size * 0.055);
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(-len, -len * 0.2);
  ctx.lineTo(len, len * 0.2);
  ctx.moveTo(-len * 0.62, len * 0.38);
  ctx.lineTo(len * 0.48, -len * 0.28);
  ctx.stroke();
  ctx.restore();
}

function drawGroundShadow(ctx: CanvasRenderingContext2D, px: number, py: number, size: number): void {
  ctx.fillStyle = "rgba(0, 0, 0, 0.38)";
  ctx.beginPath();
  ctx.ellipse(px + size / 2, py + size * 0.86, size * 0.3, size * 0.1, 0, 0, Math.PI * 2);
  ctx.fill();
}

/** Leap шага: тело вверх, в воздухе вытянуто, на земле чуть прижато. Тень остаётся на клетке. */
function stepJump(pose: Pose, size: number): { lift: number; sx: number; sy: number; shadow: number } {
  if (!pose.jump || pose.travel === null) return { lift: 0, sx: 1, sy: 1, shadow: 1 };
  const air = Math.sin(pose.travel * Math.PI);
  const squash = Math.cos(pose.travel * Math.PI * 2);
  return {
    lift: air * size * 0.22,
    sx: 1 + squash * 0.1,
    sy: 1 - squash * 0.12,
    shadow: 1 - air * 0.45,
  };
}

function drawSprite(
  ctx: CanvasRenderingContext2D,
  sprite: HTMLCanvasElement,
  x: number,
  y: number,
  size: number,
  facing: Dir,
): void {
  ctx.save();
  ctx.translate(x + size / 2, y + size / 2);
  if (facing === "left") ctx.scale(-1, 1);
  const pad = size * 0.08;
  ctx.drawImage(sprite, -size / 2 + pad, -size / 2 + pad, size - pad * 2, size - pad * 2);
  ctx.restore();
}

interface AttackPose {
  reach: number;
  along: number;
  rot: number;
  flash: number;
}

/** Жест удара на прогрессе 0..1. Покой рисуется отдельно. */
function attackPose(weapon: WeaponId, t: number): AttackPose {
  const wave = Math.sin(t * Math.PI);
  if (weapon === "sword") {
    const along = -1 + t * 2;
    return { reach: 0.72, along, rot: along * 0.55, flash: 0 };
  }
  if (weapon === "dual") {
    const half = t < 0.5 ? t * 2 : (t - 0.5) * 2;
    const poke = Math.sin(half * Math.PI);
    return { reach: 0.4 + poke * 0.72, along: 0.22, rot: -0.22, flash: poke };
  }
  if (weapon === "spear") return { reach: 0.48 + wave * 0.74, along: 0, rot: 0, flash: wave };
  if (weapon === "staff") return { reach: 0.44 + wave * 0.5, along: 0, rot: -1.05 + wave * 1.45, flash: wave };
  if (weapon === "gloves") {
    const jab = t < 0.3 ? Math.sin((t / 0.3) * Math.PI * 0.5) : Math.max(0, Math.cos(((t - 0.3) / 0.7) * Math.PI * 0.5));
    return { reach: 0.24 + jab * 0.5, along: 0, rot: 0, flash: jab };
  }
  const kick = t < 0.16 ? 0 : Math.sin(Math.min(1, (t - 0.16) / 0.22) * Math.PI);
  if (weapon === "rifle") return { reach: 0.74 - kick * 0.28, along: 0, rot: -kick * 0.42, flash: kick };
  if (weapon === "shotgun") return { reach: 0.58 - kick * 0.22, along: 0, rot: -kick * 0.5, flash: kick };
  return { reach: 0.5 - kick * 0.16, along: 0, rot: -kick * 0.28, flash: kick };
}

/** Патрон летит по линии удара. Shotgun — три дробины, по одной на каждый луч веера. */
function drawFlyingRound(
  ctx: CanvasRenderingContext2D,
  box: Box,
  room: RoomLayout,
  pose: Pose,
  facing: Dir,
  weapon: WeaponId,
  t: number,
): void {
  if (weapon !== "pistol" && weapon !== "rifle" && weapon !== "shotgun") return;
  const fly = Math.min(1, Math.max(0, (t - 0.04) / 0.72));
  if (fly <= 0) return;
  const fade = fly > 0.84 ? 1 - (fly - 0.84) / 0.16 : 1;
  const step = DIRS[facing];
  const side = facing === "up" || facing === "down" ? { x: 1, y: 0 } : { x: 0, y: 1 };
  const range = weaponById(weapon).range;
  const lanes = weapon === "shotgun" ? [-1, 0, 1] : [0];
  const hop = stepJump(pose, box.size);
  const ox = box.ox + (pose.x + 0.5) * box.size;
  const oy = box.oy + (pose.y + 0.5) * box.size - hop.lift;
  const hx = Math.round(pose.x);
  const hy = Math.round(pose.y);
  for (const lane of lanes) {
    let open = range;
    for (let i = 1; i <= range; i += 1) {
      const x = hx + step.x * i + side.x * lane;
      const y = hy + step.y * i + side.y * lane;
      if (isBlocked(room, x, y)) {
        open = i - 1;
        break;
      }
    }
    const travel = Math.max(0.55, open);
    const along = 0.28 + fly * travel;
    const spread = lane * Math.min(1, along / Math.max(1, travel));
    const px = ox + (step.x * along + side.x * spread) * box.size;
    const py = oy + (step.y * along + side.y * spread) * box.size;
    const tail = box.size * (weapon === "shotgun" ? 0.16 : 0.28);
    ctx.save();
    ctx.globalAlpha = fade;
    ctx.lineCap = "round";
    ctx.strokeStyle = weapon === "shotgun" ? "#f4efe4" : "#e7c98a";
    ctx.lineWidth = Math.max(2, box.size * (weapon === "shotgun" ? 0.035 : 0.055));
    ctx.beginPath();
    ctx.moveTo(px - step.x * tail, py - step.y * tail);
    ctx.lineTo(px, py);
    ctx.stroke();
    ctx.fillStyle = "#fff8ea";
    ctx.beginPath();
    ctx.arc(px, py, Math.max(2.2, box.size * (weapon === "shotgun" ? 0.04 : 0.055)), 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}

function drawAttackFlash(ctx: CanvasRenderingContext2D, weapon: WeaponId, flash: number, size: number): void {
  if (flash < 0.05 || weapon === "sword") return;
  const gun = weapon === "pistol" || weapon === "rifle" || weapon === "shotgun";
  ctx.save();
  ctx.globalAlpha = flash;
  ctx.strokeStyle = gun ? "#f6e2b8" : "#f4f1ea";
  ctx.fillStyle = gun ? "rgba(255, 214, 140, 0.85)" : "rgba(244, 241, 234, 0.9)";
  ctx.lineWidth = Math.max(2, size * 0.045);
  ctx.lineCap = "round";
  if (weapon === "shotgun") {
    ctx.beginPath();
    ctx.moveTo(size * 0.16, 0);
    ctx.lineTo(size * 0.7, -size * 0.28);
    ctx.moveTo(size * 0.16, 0);
    ctx.lineTo(size * 0.78, 0);
    ctx.moveTo(size * 0.16, 0);
    ctx.lineTo(size * 0.7, size * 0.28);
    ctx.stroke();
  } else if (gun) {
    ctx.beginPath();
    ctx.arc(size * 0.28, 0, size * 0.1, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(size * 0.32, 0);
    ctx.lineTo(size * (weapon === "rifle" ? 0.7 : 0.52), 0);
    ctx.stroke();
  } else if (weapon === "spear" || weapon === "staff" || weapon === "gloves" || weapon === "dual") {
    ctx.beginPath();
    ctx.moveTo(size * 0.12, 0);
    ctx.lineTo(size * (weapon === "gloves" ? 0.38 : 0.58), 0);
    ctx.stroke();
  } else {
    ctx.beginPath();
    ctx.arc(0, 0, size * 0.26, -1.05, 1.05);
    ctx.stroke();
  }
  ctx.restore();
}

function drawWeapon(
  ctx: CanvasRenderingContext2D,
  weapons: Readonly<Partial<Record<WeaponId, HTMLCanvasElement>>>,
  sword: HTMLCanvasElement,
  x: number,
  y: number,
  size: number,
  facing: Dir,
  swing: number | null,
  weapon: WeaponId,
): void {
  const art = weapon === "dual" ? sword : (weapons[weapon] ?? sword);
  const place = (pose: AttackPose | null, mirror: number, spread = 0): void => {
    const step = DIRS[facing];
    const side = facing === "up" || facing === "down" ? { x: 1, y: 0 } : { x: 0, y: 1 };
    const along = (pose?.along ?? 0) * mirror + spread;
    const reach = pose?.reach ?? 0.46;
    const rot = (pose?.rot ?? 0) * mirror;
    const floatY = pose ? 0 : Math.sin(Date.now() / 240) * size * 0.1;
    ctx.save();
    ctx.translate(
      x + size / 2 + (step.x * reach + side.x * along * 0.85) * size,
      y + size / 2 + (step.y * reach + side.y * along * 0.85) * size + floatY,
    );
    if (facing === "left") ctx.scale(-1, 1);
    if (facing === "up") ctx.rotate(-Math.PI / 2);
    if (facing === "down") ctx.rotate(Math.PI / 2);
    if (weapon === "gloves") ctx.rotate(Math.PI / 2);
    ctx.rotate(rot);
    const held = weapon === "pistol" ? 0.5 : weapon === "gloves" ? 0.45 : weapon === "dual" ? 0.82 : 1;
    const w = size * (pose ? 1.05 : 0.92) * held;
    const fit = w / Math.max(art.width, art.height);
    ctx.drawImage(art, (-art.width * fit) / 2, (-art.height * fit) / 2, art.width * fit, art.height * fit);
    if (pose && pose.flash > 0) drawAttackFlash(ctx, weapon, pose.flash, size);
    ctx.restore();
  };
  if (weapon === "dual") {
    const spread = 0.34;
    if (swing === null) {
      place(null, 1, spread);
      place(null, 1, -spread);
      return;
    }
    const pose = attackPose(weapon, swing);
    place({ ...pose, along: 0 }, 1, spread);
    place({ ...pose, along: 0, rot: -pose.rot }, 1, -spread);
    return;
  }
  if (swing === null) {
    place(null, 1);
    return;
  }
  if (weapon === "axe") {
    drawAxeSpin(ctx, art, x, y, size, swing);
    return;
  }
  place(attackPose(weapon, swing), 1);
}

function drawAxeSpin(
  ctx: CanvasRenderingContext2D,
  art: HTMLCanvasElement,
  x: number,
  y: number,
  size: number,
  t: number,
): void {
  const cx = x + size / 2;
  const cy = y + size / 2;
  const angle = -Math.PI / 2 + t * Math.PI * 2;
  const radius = size * 0.78;
  ctx.save();
  ctx.strokeStyle = "rgba(244, 241, 234, 0.55)";
  ctx.lineWidth = Math.max(2, size * 0.045);
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.arc(cx, cy, radius, angle - 0.9, angle);
  ctx.stroke();
  ctx.translate(cx + Math.cos(angle) * radius, cy + Math.sin(angle) * radius);
  ctx.rotate(angle);
  const w = size * 1.05;
  const fit = w / Math.max(art.width, art.height);
  ctx.drawImage(art, (-art.width * fit) / 2, (-art.height * fit) / 2, art.width * fit, art.height * fit);
  ctx.restore();
}

/** Круги над головой: закрашенный — патрон в магазине, пустой — уже потрачен. */
function drawAmmoPips(ctx: CanvasRenderingContext2D, box: Box, pose: Pose, magazine: number, ammo: number): void {
  const hop = stepJump(pose, box.size);
  const r = Math.max(3.5, box.size * 0.075);
  const gap = r * 2.7;
  const cx = box.ox + (pose.x + 0.5) * box.size;
  const y = box.oy + pose.y * box.size - hop.lift - box.size * 0.2;
  const start = cx - ((magazine - 1) * gap) / 2;
  for (let i = 0; i < magazine; i += 1) {
    const x = start + i * gap;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fillStyle = i < ammo ? "#f0e2c4" : "rgba(12, 10, 8, 0.72)";
    ctx.fill();
    ctx.lineWidth = Math.max(1.5, box.size * 0.028);
    ctx.strokeStyle = i < ammo ? "#8a7044" : "#8d8678";
    ctx.stroke();
  }
}

function drawArmorBadge(ctx: CanvasRenderingContext2D, cx: number, cy: number, size: number, value: number): void {
  const s = size * 0.5;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.beginPath();
  ctx.moveTo(0, -s * 0.46);
  ctx.lineTo(s * 0.48, -s * 0.26);
  ctx.lineTo(s * 0.4, s * 0.16);
  ctx.quadraticCurveTo(0, s * 0.52, -s * 0.4, s * 0.16);
  ctx.lineTo(-s * 0.48, -s * 0.26);
  ctx.closePath();
  ctx.fillStyle = "#3a414a";
  ctx.fill();
  ctx.lineWidth = Math.max(1.5, size * 0.035);
  ctx.strokeStyle = "#24282e";
  ctx.stroke();
  ctx.fillStyle = "#f6f3ec";
  ctx.font = `700 ${Math.max(11, Math.floor(s * 0.5))}px Palatino Linotype, Palatino, serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(String(value), 0, s * 0.02);
  ctx.restore();
}

function drawHpBar(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  size: number,
  hp: number,
  maxHp: number,
): void {
  const w = size * 0.78;
  const h = Math.max(5, size * 0.1);
  const left = cx - w / 2;
  ctx.fillStyle = "#1a1f27";
  ctx.fillRect(left, cy, w, h);
  const ratio = maxHp <= 0 ? 0 : Math.max(0, Math.min(1, hp / maxHp));
  ctx.fillStyle = "#d24a38";
  ctx.fillRect(left, cy, w * ratio, h);
}

/** Эффекты на полу: фигура оружия, клетки Blink и круг телепорта. Лежат под высокими объектами и просвечивают сквозь них. */
function drawFloorEffects(
  ctx: CanvasRenderingContext2D,
  box: Box,
  attacks: readonly Cell[],
  blinks: readonly Cell[],
  portal: Cell | null,
  time: number,
  exit: Cell | null = null,
): void {
  paintCells(ctx, box, attacks, time, (pulse) => `rgba(242, 193, 78, ${0.28 + 0.14 * pulse})`);
  paintCells(ctx, box, blinks, time, (pulse) => `rgba(42, 190, 170, ${0.3 + 0.12 * pulse})`);
  if (portal) drawPortalPad(ctx, box, portal, time);
  if (exit) drawExitPad(ctx, box, exit, time);
}

/** Цифра на клетке способности: сколько ходов монстра до удара. */
function drawAbilityMarks(
  ctx: CanvasRenderingContext2D,
  box: Box,
  telegraph: { turns: number; cells: readonly Cell[] } | null,
): void {
  if (!telegraph) return;
  const { size, ox, oy } = box;
  for (const cell of telegraph.cells) {
    const x = ox + cell.x * size;
    const y = oy + cell.y * size;
    const inset = Math.max(2, Math.round(size * 0.08));
    ctx.fillStyle = "rgba(176, 42, 36, 0.42)";
    ctx.fillRect(x + inset, y + inset, size - inset * 2, size - inset * 2);
    ctx.fillStyle = "#fff4e8";
    ctx.font = `700 ${Math.max(14, Math.floor(size * 0.52))}px Arial`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(String(telegraph.turns), x + size / 2, y + size / 2);
  }
}

function paintCells(
  ctx: CanvasRenderingContext2D,
  box: Box,
  cells: readonly Cell[],
  time: number,
  color: (pulse: number) => string,
): void {
  if (cells.length === 0) return;
  const { size, ox, oy } = box;
  const pulse = 0.5 + 0.5 * Math.sin(time / 260);
  const inset = Math.max(2, Math.round(size * 0.05));
  ctx.fillStyle = color(pulse);
  for (const cell of cells) {
    ctx.fillRect(ox + cell.x * size + inset, oy + cell.y * size + inset, size - inset * 2, size - inset * 2);
  }
}

/** Горсть монет. Доля клетки: куча остаётся внутри тайла. */
const GOLD_SCALE = 0.68;

function drawCoin(ctx: CanvasRenderingContext2D, sprite: HTMLCanvasElement, cx: number, cy: number, size: number): void {
  const fit = (size * GOLD_SCALE) / Math.max(sprite.width, sprite.height);
  const w = sprite.width * fit;
  const h = sprite.height * fit;
  ctx.drawImage(sprite, cx - w / 2, cy - h / 2, w, h);
}

function drawInteractHint(ctx: CanvasRenderingContext2D, box: Box, cell: Cell): void {
  const font = Math.max(13, Math.floor(box.size * 0.28));
  ctx.save();
  ctx.font = `700 ${font}px Arial`;
  ctx.textBaseline = "middle";
  const key = "Space";
  const label = "Interact";
  const pad = font * 0.45;
  const keyW = ctx.measureText(key).width + pad * 2;
  const gap = font * 0.4;
  const labelW = ctx.measureText(label).width;
  const h = font + pad;
  const total = keyW + gap + labelW;
  const x = box.ox + (cell.x + 0.5) * box.size - total / 2;
  const y = box.oy + cell.y * box.size - h - Math.max(4, box.size * 0.12);
  ctx.fillStyle = "rgba(12, 14, 18, 0.9)";
  ctx.fillRect(x, y, keyW, h);
  ctx.strokeStyle = "rgba(232, 214, 176, 0.75)";
  ctx.lineWidth = 1;
  ctx.strokeRect(x + 0.5, y + 0.5, keyW - 1, h - 1);
  ctx.fillStyle = "#f6f1e6";
  ctx.textAlign = "center";
  ctx.fillText(key, x + keyW / 2, y + h / 2);
  ctx.textAlign = "left";
  ctx.fillText(label, x + keyW + gap, y + h / 2);
  ctx.restore();
}

function drawChest(
  ctx: CanvasRenderingContext2D,
  box: Box,
  sprites: Sprites,
  chest: RoomState["chests"][number],
): void {
  const art = sprites.props[chest.kind];
  if (!art) return;
  const { size, ox, oy } = box;
  const fit = (size * (chest.open ? 0.62 : 0.84)) / Math.max(art.width, art.height);
  const w = art.width * fit;
  const h = art.height * fit;
  ctx.save();
  ctx.globalAlpha = chest.open ? 0.45 : 1;
  ctx.drawImage(art, ox + chest.x * size + (size - w) / 2, oy + chest.y * size + (size - h) / 2, w, h);
  ctx.restore();
}

function drawLoot(
  ctx: CanvasRenderingContext2D,
  box: Box,
  sprites: Sprites,
  loot: RoomState["loot"],
): void {
  for (const drop of loot) {
    const art =
      drop.kind === "weapon"
        ? sprites.weapons[drop.catalogId as WeaponId]
        : drop.kind === "ability"
          ? sprites.abilities[drop.catalogId]
          : sprites.items[drop.catalogId];
    if (!art) continue;
    const { size, ox, oy } = box;
    const cx = ox + (drop.x + 0.5) * size;
    const cy = oy + (drop.y + 0.55) * size;
    const fit = (size * 0.72) / Math.max(art.width, art.height);
    ctx.drawImage(art, cx - (art.width * fit) / 2, cy - (art.height * fit) / 2, art.width * fit, art.height * fit);
  }
}

function drawGold(
  ctx: CanvasRenderingContext2D,
  box: Box,
  sprite: HTMLCanvasElement,
  piles: readonly Cell[],
  hidden: (cell: Cell) => boolean,
): void {
  const { size, ox, oy } = box;
  for (const pile of piles) {
    if (hidden(pile)) continue;
    drawCoin(ctx, sprite, ox + (pile.x + 0.5) * size, oy + (pile.y + 0.58) * size, size);
  }
}

/** Сколько летит монета из бочки на клетку. */
const COIN_MS = 280;

interface CoinToss {
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
  start: number;
}

function drawCoinToss(ctx: CanvasRenderingContext2D, box: Box, sprite: HTMLCanvasElement, coin: CoinToss, time: number): void {
  const raw = (time - coin.start) / COIN_MS;
  if (raw <= 0 || raw >= 1) return;
  const t = 1 - (1 - raw) * (1 - raw);
  const x = coin.fromX + (coin.toX - coin.fromX) * t;
  const y = coin.fromY + (coin.toY - coin.fromY) * t;
  const dist = Math.hypot(coin.toX - coin.fromX, coin.toY - coin.fromY);
  const lift = Math.sin(raw * Math.PI) * (0.42 + 0.2 * dist);
  const { size, ox, oy } = box;
  const gx = ox + (x + 0.5) * size;
  const gy = oy + (y + 0.58) * size;
  ctx.save();
  ctx.globalAlpha = 0.35;
  ctx.fillStyle = "#000";
  ctx.beginPath();
  ctx.ellipse(gx, gy + size * 0.16, size * 0.22, size * 0.07, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  drawCoin(ctx, sprite, gx, gy - lift * size, size);
}

const SPORE_SCALE = 0.6;

function tileHash(x: number, y: number, salt: number): number {
  let n = Math.imul(x + salt * 17, 374761393) ^ Math.imul(y, 668265263);
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  n ^= n >>> 16;
  return (n >>> 0) / 4294967296;
}

function surfacePath(
  ctx: CanvasRenderingContext2D,
  px: number,
  py: number,
  size: number,
  x: number,
  y: number,
  salt: number,
): void {
  const count = 12;
  const points: { x: number; y: number }[] = [];
  for (let i = 0; i < count; i += 1) {
    const angle = (i / count) * Math.PI * 2;
    const wobble = 0.78 + tileHash(x, y, salt + i) * 0.28;
    points.push({
      x: px + size * 0.5 + Math.cos(angle) * size * 0.44 * wobble,
      y: py + size * 0.54 + Math.sin(angle) * size * 0.38 * wobble,
    });
  }
  const first = points[0]!;
  const last = points[count - 1]!;
  ctx.beginPath();
  ctx.moveTo((first.x + last.x) / 2, (first.y + last.y) / 2);
  for (let i = 0; i < count; i += 1) {
    const point = points[i]!;
    const next = points[(i + 1) % count]!;
    ctx.quadraticCurveTo(point.x, point.y, (point.x + next.x) / 2, (point.y + next.y) / 2);
  }
  ctx.closePath();
}

function drawIceCell(ctx: CanvasRenderingContext2D, px: number, py: number, size: number, x: number, y: number): void {
  ctx.save();
  ctx.beginPath();
  ctx.rect(px, py, size, size);
  ctx.clip();
  const sheet = ctx.createLinearGradient(px, py, px + size, py + size);
  sheet.addColorStop(0, "rgba(244, 252, 255, 0.72)");
  sheet.addColorStop(0.4, "rgba(168, 214, 232, 0.34)");
  sheet.addColorStop(1, "rgba(72, 128, 160, 0.5)");
  ctx.fillStyle = sheet;
  ctx.fillRect(px, py, size, size);
  const gloss = ctx.createRadialGradient(px + size * 0.32, py + size * 0.28, 0, px + size * 0.4, py + size * 0.4, size * 0.7);
  gloss.addColorStop(0, "rgba(255, 255, 255, 0.45)");
  gloss.addColorStop(1, "rgba(255, 255, 255, 0)");
  ctx.fillStyle = gloss;
  ctx.fillRect(px, py, size, size);
  ctx.strokeStyle = "rgba(236, 248, 255, 0.32)";
  ctx.lineWidth = Math.max(1, size * 0.01);
  ctx.beginPath();
  for (let i = 0; i < 4; i += 1) {
    let sx = 0.2 + tileHash(x, y, 10 + i) * 0.6;
    let sy = 0.16 + tileHash(x, y, 20 + i) * 0.35;
    ctx.moveTo(px + size * sx, py + size * sy);
    for (let step = 0; step < 2; step += 1) {
      sx += (tileHash(x, y, 40 + i * 3 + step) - 0.5) * 0.16;
      sy += 0.07 + tileHash(x, y, 60 + i * 3 + step) * 0.08;
      ctx.lineTo(px + size * sx, py + size * sy);
    }
  }
  ctx.stroke();
  ctx.fillStyle = "rgba(255, 255, 255, 0.55)";
  for (let i = 0; i < 10; i += 1) {
    const fx = px + tileHash(x, y, 80 + i) * size;
    const fy = py + tileHash(x, y, 100 + i) * size;
    ctx.fillRect(fx, fy, Math.max(1, size * 0.03), Math.max(1, size * 0.03));
  }
  ctx.restore();
}

function drawFlameTongue(
  ctx: CanvasRenderingContext2D,
  x: number,
  base: number,
  width: number,
  height: number,
): void {
  ctx.save();
  ctx.beginPath();
  ctx.ellipse(x, base - height * 0.45, width, height * 0.55, 0, 0, Math.PI * 2);
  ctx.clip();
  const body = ctx.createLinearGradient(x, base, x, base - height);
  body.addColorStop(0, "rgba(140, 28, 0, 0.15)");
  body.addColorStop(0.25, "rgba(230, 70, 10, 0.95)");
  body.addColorStop(0.62, "rgba(255, 170, 40, 0.9)");
  body.addColorStop(1, "rgba(255, 236, 180, 0.05)");
  ctx.fillStyle = body;
  ctx.fillRect(x - width, base - height, width * 2, height);
  ctx.restore();
}

function drawFireCell(
  ctx: CanvasRenderingContext2D,
  px: number,
  py: number,
  size: number,
  time: number,
  x: number,
  y: number,
): void {
  ctx.save();
  ctx.beginPath();
  ctx.rect(px, py - size * 0.7, size, size * 1.7);
  ctx.clip();
  ctx.fillStyle = "rgba(12, 6, 3, 0.62)";
  ctx.fillRect(px, py, size, size);
  const bed = ctx.createRadialGradient(px + size * 0.5, py + size * 0.72, size * 0.05, px + size * 0.5, py + size * 0.7, size * 0.55);
  bed.addColorStop(0, "rgba(255, 120, 30, 0.55)");
  bed.addColorStop(1, "rgba(120, 20, 0, 0)");
  ctx.fillStyle = bed;
  ctx.fillRect(px, py, size, size);
  const flames = [0.28, 0.46, 0.62, 0.78];
  for (let i = 0; i < flames.length; i += 1) {
    const flicker = 0.84 + 0.16 * Math.sin(time / 90 + x + y + i * 1.7);
    const lean = (tileHash(x, y, 30 + i) - 0.5) * size * 0.08;
    const tall = 0.42 + tileHash(x, y, 50 + i) * 0.38;
    drawFlameTongue(ctx, px + size * flames[i]! + lean, py + size * 0.82, size * 0.16, size * tall * flicker);
  }
  for (let i = 0; i < 4; i += 1) {
    const rise = (time / 480 + tileHash(x, y, 9 + i)) % 1;
    ctx.globalAlpha = 1 - rise;
    ctx.fillStyle = "#ffd27a";
    ctx.fillRect(px + size * (0.2 + i * 0.18), py + size * (0.7 - rise * 0.9), Math.max(1.5, size * 0.03), Math.max(1.5, size * 0.03));
  }
  ctx.restore();
}

function drawOilCell(
  ctx: CanvasRenderingContext2D,
  px: number,
  py: number,
  size: number,
  time: number,
  x: number,
  y: number,
): void {
  ctx.save();
  ctx.beginPath();
  ctx.rect(px, py, size, size);
  ctx.clip();
  ctx.fillStyle = "rgba(10, 8, 6, 0.82)";
  surfacePath(ctx, px, py, size, x, y, 3);
  ctx.fill();
  ctx.strokeStyle = "rgba(160, 120, 60, 0.35)";
  ctx.lineWidth = Math.max(1, size * 0.02);
  surfacePath(ctx, px, py, size, x, y, 3);
  ctx.stroke();
  const drift = Math.sin(time / 500 + x) * size * 0.012;
  const gloss = ctx.createRadialGradient(
    px + size * 0.38,
    py + size * 0.4 + drift,
    0,
    px + size * 0.38,
    py + size * 0.4,
    size * 0.22,
  );
  gloss.addColorStop(0, "rgba(255, 220, 150, 0.45)");
  gloss.addColorStop(1, "rgba(255, 220, 150, 0)");
  ctx.fillStyle = gloss;
  ctx.fillRect(px, py, size, size);
  ctx.restore();
}

function drawPoisonCell(
  ctx: CanvasRenderingContext2D,
  px: number,
  py: number,
  size: number,
  time: number,
  x: number,
  y: number,
): void {
  ctx.save();
  ctx.beginPath();
  ctx.rect(px, py - size * 0.35, size, size * 1.35);
  ctx.clip();
  ctx.fillStyle = "rgba(90, 140, 18, 0.62)";
  surfacePath(ctx, px, py, size, x, y, 7);
  ctx.fill();
  ctx.strokeStyle = "rgba(210, 240, 90, 0.35)";
  ctx.lineWidth = Math.max(1, size * 0.02);
  surfacePath(ctx, px, py, size, x, y, 7);
  ctx.stroke();
  const deep = ctx.createRadialGradient(px + size * 0.5, py + size * 0.58, size * 0.05, px + size * 0.5, py + size * 0.55, size * 0.42);
  deep.addColorStop(0, "rgba(40, 70, 8, 0.35)");
  deep.addColorStop(1, "rgba(40, 70, 8, 0)");
  ctx.fillStyle = deep;
  ctx.fillRect(px, py, size, size);
  for (let i = 0; i < 3; i += 1) {
    const rise = (time / 900 + i * 0.33) % 1;
    const mist = ctx.createRadialGradient(
      px + size * (0.35 + i * 0.15),
      py + size * (0.55 - rise * 0.4),
      0,
      px + size * (0.35 + i * 0.15),
      py + size * (0.5 - rise * 0.4),
      size * 0.22,
    );
    mist.addColorStop(0, `rgba(190, 230, 70, ${0.28 * (1 - rise)})`);
    mist.addColorStop(1, "rgba(120, 170, 20, 0)");
    ctx.fillStyle = mist;
    ctx.fillRect(px, py - size * 0.35, size, size * 1.35);
  }
  for (let i = 0; i < 3; i += 1) {
    const bx = px + size * (0.3 + tileHash(x, y, 90 + i) * 0.4);
    const by = py + size * (0.46 + tileHash(x, y, 110 + i) * 0.22) + Math.sin(time / 280 + i) * size * 0.015;
    ctx.fillStyle = "rgba(220, 240, 110, 0.75)";
    ctx.beginPath();
    ctx.arc(bx, by, size * (0.018 + tileHash(x, y, 130 + i) * 0.016), 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function drawWaterCell(
  ctx: CanvasRenderingContext2D,
  px: number,
  py: number,
  size: number,
  time: number,
  x: number,
  y: number,
): void {
  ctx.save();
  ctx.beginPath();
  ctx.rect(px, py, size, size);
  ctx.clip();
  const pool = ctx.createRadialGradient(px + size * 0.5, py + size * 0.56, size * 0.08, px + size * 0.5, py + size * 0.54, size * 0.5);
  pool.addColorStop(0, "rgba(18, 70, 140, 0.55)");
  pool.addColorStop(0.72, "rgba(50, 120, 190, 0.38)");
  pool.addColorStop(1, "rgba(50, 120, 190, 0.12)");
  ctx.fillStyle = pool;
  surfacePath(ctx, px, py, size, x, y, 11);
  ctx.fill();
  ctx.strokeStyle = "rgba(210, 236, 255, 0.55)";
  ctx.lineWidth = Math.max(1, size * 0.018);
  surfacePath(ctx, px, py, size, x, y, 11);
  ctx.stroke();
  const shine = ctx.createRadialGradient(px + size * 0.4, py + size * 0.42, 0, px + size * 0.42, py + size * 0.48, size * 0.2);
  shine.addColorStop(0, "rgba(230, 246, 255, 0.45)");
  shine.addColorStop(1, "rgba(230, 246, 255, 0)");
  ctx.fillStyle = shine;
  ctx.fillRect(px, py, size, size);
  ctx.strokeStyle = "rgba(220, 240, 255, 0.35)";
  ctx.lineWidth = Math.max(1, size * 0.012);
  for (let i = 0; i < 2; i += 1) {
    const phase = (time / 700 + i / 2) % 1;
    ctx.globalAlpha = 0.45 * (1 - phase);
    ctx.beginPath();
    ctx.ellipse(px + size * 0.5, py + size * 0.55, size * (0.12 + phase * 0.2), size * (0.045 + phase * 0.05), 0, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.restore();
}

function drawGround(ctx: CanvasRenderingContext2D, box: Box, state: RoomState, time: number): void {
  const { size, ox, oy } = box;
  for (let y = 0; y < state.room.h; y += 1) {
    for (let x = 0; x < state.room.w; x += 1) {
      const cell = state.ground[y * state.room.w + x];
      if (!cell) continue;
      const px = ox + x * size;
      const py = oy + y * size;
      if (cell.kind === "ice") drawIceCell(ctx, px, py, size, x, y);
      else if (cell.kind === "fire") drawFireCell(ctx, px, py, size, time, x, y);
      else if (cell.kind === "oil") drawOilCell(ctx, px, py, size, time, x, y);
      else if (cell.kind === "poison") drawPoisonCell(ctx, px, py, size, time, x, y);
      else drawWaterCell(ctx, px, py, size, time, x, y);
    }
  }
}

/** Яд, огонь, стан и шпили над юнитом. */
function drawStatus(ctx: CanvasRenderingContext2D, box: Box, pose: Pose, unit: Fighter, time: number): void {
  const hop = stepJump(pose, box.size);
  const x = box.ox + (pose.x + 0.5) * box.size;
  const y = box.oy + (pose.y + 0.42) * box.size - hop.lift;
  if (unit.mode === "sleep") {
    for (let i = 0; i < 3; i += 1) {
      const phase = (time / 700 + i / 3) % 1;
      ctx.save();
      ctx.globalAlpha = 0.35 + (1 - phase) * 0.45;
      ctx.fillStyle = "#8fd36a";
      ctx.beginPath();
      ctx.arc(x + (i - 1) * box.size * 0.14, y - phase * box.size * 0.35, Math.max(2, box.size * 0.04), 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }
  if (unit.root > 0) {
    ctx.save();
    ctx.strokeStyle = "rgba(201, 179, 239, 0.9)";
    ctx.lineWidth = Math.max(1.5, box.size * 0.035);
    ctx.beginPath();
    ctx.ellipse(x, box.oy + (pose.y + 0.86) * box.size, box.size * 0.32, box.size * 0.1, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }
  if (unit.poison > 0) {
    for (let i = 0; i < 4; i += 1) {
      const phase = (time / 520 + i / 4) % 1;
      ctx.save();
      ctx.globalAlpha = 0.35 + (1 - phase) * 0.55;
      ctx.fillStyle = "#7ed34a";
      ctx.beginPath();
      ctx.arc(x + Math.sin(i * 1.7) * box.size * 0.16, y - phase * box.size * 0.45, Math.max(2, box.size * 0.045), 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }
  if (unit.burn > 0) {
    for (let i = 0; i < 3; i += 1) {
      const flick = 0.55 + Math.sin(time / 70 + i) * 0.45;
      ctx.save();
      ctx.globalAlpha = 0.55 + flick * 0.4;
      ctx.fillStyle = i === 1 ? "#ffd27a" : "#e25822";
      ctx.beginPath();
      ctx.ellipse(x + (i - 1) * box.size * 0.12, y - box.size * 0.05 * flick, box.size * 0.05, box.size * (0.12 + flick * 0.1), 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }
  if (unit.stun > 0) {
    for (let i = 0; i < 3; i += 1) {
      const angle = time / 260 + (i * Math.PI * 2) / 3;
      ctx.save();
      ctx.fillStyle = "#f4e3a2";
      ctx.beginPath();
      ctx.arc(x + Math.cos(angle) * box.size * 0.22, y - box.size * 0.42 + Math.sin(angle) * box.size * 0.07, Math.max(2, box.size * 0.045), 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }
}

export class RoomRenderer {
  private background: { key: string; canvas: HTMLCanvasElement; box: Box; dressing: Dressing } | null = null;
  private pattern: { ctx: CanvasRenderingContext2D; value: CanvasPattern | null } | null = null;
  private readonly motion = new Motion();
  private camera: Cell | null = null;
  private lastTime = 0;
  private fadeStart = 0;
  private shakeStart = 0;
  private deaths: { monster: Fighter; x: number; y: number; start: number }[] = [];
  private sawAlive = new Set<Fighter>();
  private heroDeathAt: number | null = null;
  private coins: CoinToss[] = [];
  private ability: AbilityBurst[] = [];
  private view: { box: Box; room: RoomLayout } | null = null;
  private mapHits: MapHit[] = [];
  private readonly layers = new Map<string, Layer>();

  /** Следующий кадр ставит фигуры и камеру сразу. Переход между комнатами и Blink. */
  resetCamera(): void {
    this.motion.snap();
    this.camera = null;
    this.shakeStart = 0;
    this.deaths = [];
    this.sawAlive.clear();
    this.heroDeathAt = null;
    this.coins = [];
    this.ability = [];
  }

  /** Плашка поражения появляется, когда кровь уже закрыла экран. */
  lostReady(time = performance.now()): boolean {
    return this.bloodAmount(time) >= 0.75;
  }

  moving(): boolean {
    return this.motion.moving();
  }

  /** Мгновенный перенос. Камера встаёт на клетку посадки, вспышки гаснут сами. */
  playBlink(from: Cell, to: Cell): void {
    this.motion.blinkTo(from, to, performance.now());
    this.camera = null;
  }

  /** Падение в обрыв и выход на ближайшую свободную клетку. */
  playFall(from: Cell, pit: Cell, land: Cell): void {
    this.motion.fall(from, pit, land, performance.now());
  }

  /** Короткое затемнение: герой прошёл в другую комнату. */
  flash(): void {
    this.fadeStart = performance.now();
  }

  /** Короткий толчок камеры. Срыв брони. */
  shake(): void {
    this.shakeStart = performance.now();
  }

  mapRoomAt(px: number, py: number): number | null {
    return hitMapRoom(this.mapHits, px, py);
  }

  cellAt(px: number, py: number): Cell | null {
    if (!this.view) return null;
    const { box, room } = this.view;
    const x = Math.floor((px - box.ox) / box.size);
    const y = Math.floor((py - box.oy) / box.size);
    if (x < 0 || y < 0 || x >= room.w || y >= room.h) return null;
    return { x, y };
  }

  paint(
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number,
    state: RoomState,
    sprites: Sprites,
    swing: number | null,
    aimBlink: boolean,
    map: MapView | null = null,
    mapOpen = false,
  ): void {
    const room = state.room;
    const time = performance.now();
    if (state.strike) {
      this.motion.queueStrike(state.strike.from, state.strike.to);
      state.strike = null;
    }
    for (const fx of state.fx) {
      if (fx.kind === "dash" || fx.kind === "move") this.motion.queueRush(fx.from, fx.to, fx.act === "swoop");
      else if (fx.kind === "shot" && fx.act === "throw") this.motion.queueRush(fx.from, fx.to, true);
      this.ability.push({ ...fx, start: time });
    }
    state.fx = [];
    this.ability = this.ability.filter((burst) => burstAge(burst, time) < 1);
    const bodies = roomMonsters(state);
    const poses = this.motion.present(state.hero, bodies, time);
    const blink = this.motion.blinkMark(time);
    const pop = blink ? Math.min(1, blink.t / 0.4) : null;
    const dying = this.noteDeaths(state, time);
    this.trackHeroDeath(state, time);
    this.takeCoins(state, time);
    const size = cellSize(width, height);
    const box = boxAt(width, height, size, this.follow(poses.hero, time));
    this.view = { box, room };

    ctx.fillStyle = "#0b0d12";
    ctx.fillRect(0, 0, width, height);
    const kick = this.kick(time);
    ctx.save();
    ctx.translate(kick.x, kick.y);
    const background = this.backgroundFor(state, size, sprites);
    ctx.drawImage(background.canvas, box.ox - background.box.ox, box.oy - background.box.oy);
    if (state.outcome !== "won") drawDoorBars(ctx, box, background.dressing);
    const pattern = this.patternFor(ctx, sprites);
    if (pattern) alignWallPattern(pattern, box, sprites);
    const blinks = aimBlink ? blinkCells(state) : (state.aim ?? []);
    const abilityAiming = !aimBlink && state.aim !== null;
    const attacks = state.outcome !== "lost" && !aimBlink && !abilityAiming ? attackCells(state) : [];
    const portal = map?.rooms[map.current]?.portal ?? null;
    const exit = map?.exit ?? null;
    drawGround(ctx, box, state, time);
    drawFloorEffects(ctx, box, attacks, blinks, portal, time, exit);
    for (const barrel of state.barrels) drawBarrel(ctx, box, sprites, barrel.x, barrel.y);
    for (const chest of state.chests) drawChest(ctx, box, sprites, chest);
    drawGold(ctx, box, sprites.gold, state.piles, (pile) => this.coinInFlight(pile, time));
    drawLoot(ctx, box, sprites, state.loot);
    for (const coin of this.coins) drawCoinToss(ctx, box, sprites.gold, coin, time);

    const heroRow = Math.round(poses.hero.y);
    for (let row = 0; row < room.h; row += 1) {
      drawRowObstacles(ctx, box, room, sprites, pattern, row);
      for (const piece of state.furniture) {
        if (piece.y + piece.h - 1 === row) drawFurniture(ctx, box, sprites, piece);
      }
      for (const chair of state.chairs) {
        if (chair.y === row) drawChair(ctx, box, sprites, chair.x, chair.y);
      }
      bodies.forEach((monster, index) => {
        const pose = poses.monsters[index];
        if (monster.hp > 0 && pose && Math.round(pose.y) === row) this.drawMonster(ctx, box, monster, pose, sprites, true);
      });
      for (const dead of dying) {
        if (Math.round(dead.pose.y) === row) this.drawMonster(ctx, box, dead.monster, dead.pose, sprites, true, dead.life);
      }
      if (heroRow === row) {
        this.drawHero(ctx, box, state.hero, poses.hero, sprites, state.weapon, swing, time, true, pop, isPit(room, Math.round(poses.hero.x), Math.round(poses.hero.y)));
      }
    }
    if (swing !== null) drawFlyingRound(ctx, box, room, poses.hero, state.hero.facing, state.weapon, swing);
    drawHeroZones(ctx, box, activeHeroZones(state), time);
    for (const burst of this.ability) drawAbilityBurst(ctx, box, burst, time);
    this.blendOccluded(ctx, width, height, box, state, sprites, swing, time, attacks, blinks, portal, exit, poses.hero, poses.monsters, pop, dying);
    if (blink) drawBlinkFx(ctx, box, state.hero, blink, sprites);
    const flash = this.motion.strikeFlash(time);
    if (flash) drawStrikeFlash(ctx, box, flash);

    for (const hazard of state.hazards) {
      drawHazardHint(ctx, box, hazard, time);
      drawAbilityMarks(ctx, box, hazard);
    }
    for (const monster of bodies) {
      if (monster.hp > 0 && monster.windup) drawWindupHint(ctx, box, monster, monster.windup, time);
      if (monster.hp > 0) drawAbilityMarks(ctx, box, monster.windup);
    }
    drawLighting(ctx, width, height, box, background.dressing.torches, poses.hero);
    bodies.forEach((monster, index) => {
      const pose = poses.monsters[index];
      if (monster.hp <= 0 || !pose || monster.mode === "gone" || monster.mode === "under" || monster.mode === "air") return;
      const cx = box.ox + (pose.x + 0.5) * box.size;
      const my = box.oy + pose.y * box.size;
      if (monster.mode !== "passive") {
        if (monster.maxShield > 0) drawArmorBadge(ctx, cx, my - box.size * 0.16, box.size, monster.shield);
        drawHpBar(ctx, cx, my + box.size * 0.84, box.size, monster.hp, monster.maxHp);
      }
      drawStatus(ctx, box, pose, monster, time);
    });
    if (state.hero.hp > 0) {
      drawStatus(ctx, box, poses.hero, state.hero, time);
      const worn = weaponById(state.weapon);
      if (worn.magazine !== null) drawAmmoPips(ctx, box, poses.hero, worn.magazine, state.ammo ?? worn.magazine);
    }
    const interact = interactTarget(state, exit);
    if (interact) drawInteractHint(ctx, box, interact.cell);
    ctx.restore();
    if (map && !mapOpen) drawMinimap(ctx, width, map);
    const fade = this.fadeStart ? 1 - (time - this.fadeStart) / FADE_MS : 0;
    if (fade > 0) {
      ctx.fillStyle = `rgba(5, 6, 10, ${fade})`;
      ctx.fillRect(0, 0, width, height);
    }
    this.mapHits = map && mapOpen ? drawMapOverlay(ctx, width, height, map) : [];
    drawBloodVeil(ctx, width, height, this.bloodAmount(time));
  }

  /**
   * Где высокий объект закрывает героя, монстра или эффект пола, они просвечивают сквозь него.
   * Объекты рисуются в маску, фигуры и эффекты — в отдельный слой, слой обрезается по маске и ложится поверх.
   * Там, где фигура стоит перед объектом, слой совпадает с уже нарисованной фигурой и ничего не меняет.
   */
  private blendOccluded(
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number,
    box: Box,
    state: RoomState,
    sprites: Sprites,
    swing: number | null,
    time: number,
    attacks: readonly Cell[],
    blinks: readonly Cell[],
    portal: Cell | null,
    exit: Cell | null,
    heroPose: Pose,
    monsterPoses: readonly Pose[],
    pop: number | null,
    dying: readonly { monster: Fighter; pose: Pose; life: number }[],
  ): void {
    const room = state.room;
    const mask = this.layer("mask", width, height);
    const blend = this.layer("blend", width, height);
    mask.ctx.clearRect(0, 0, width, height);
    for (let row = 0; row < room.h; row += 1) drawRowObstacles(mask.ctx, box, room, sprites, null, row);

    blend.ctx.clearRect(0, 0, width, height);
    blend.ctx.globalAlpha = BLEND_FLOOR_ALPHA;
    drawFloorEffects(blend.ctx, box, attacks, blinks, portal, time, exit);
    blend.ctx.globalAlpha = BLEND_ACTOR_ALPHA;
    roomMonsters(state).forEach((monster, index) => {
      const pose = monsterPoses[index];
      if (monster.hp > 0 && pose) this.drawMonster(blend.ctx, box, monster, pose, sprites, false);
    });
    for (const dead of dying) this.drawMonster(blend.ctx, box, dead.monster, dead.pose, sprites, false, dead.life);
    this.drawHero(
      blend.ctx,
      box,
      state.hero,
      heroPose,
      sprites,
      state.weapon,
      swing,
      time,
      false,
      pop,
      isPit(room, Math.round(heroPose.x), Math.round(heroPose.y)),
    );
    blend.ctx.globalAlpha = 1;
    blend.ctx.globalCompositeOperation = "destination-in";
    blend.ctx.drawImage(mask.canvas, 0, 0);
    blend.ctx.globalCompositeOperation = "source-over";
    ctx.drawImage(blend.canvas, 0, 0);
  }

  private layer(name: string, width: number, height: number): Layer {
    let layer = this.layers.get(name);
    if (!layer) {
      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("canvas");
      layer = { canvas, ctx };
      this.layers.set(name, layer);
    }
    if (layer.canvas.width !== width || layer.canvas.height !== height) {
      layer.canvas.width = width;
      layer.canvas.height = height;
    }
    return layer;
  }

  private drawHero(
    ctx: CanvasRenderingContext2D,
    box: Box,
    hero: Fighter,
    pose: Pose,
    sprites: Sprites,
    weapon: WeaponId,
    swing: number | null,
    time: number,
    shadow: boolean,
    pop: number | null,
    sinking: boolean,
  ): void {
    const px = box.ox + pose.x * box.size;
    const groundY = box.oy + pose.y * box.size;
    const py = groundY + (sinking ? 0.22 : 0) * box.size;
    const hop = stepJump(pose, box.size);
    if (shadow && (pop === null || pop > 0)) {
      ctx.save();
      ctx.globalAlpha = (pop ?? 1) * (0.5 + 0.5 * hop.shadow);
      const cx = px + box.size / 2;
      const cy = groundY + box.size * 0.86;
      ctx.translate(cx, cy);
      ctx.scale(hop.shadow, hop.shadow);
      ctx.translate(-cx, -cy);
      drawGroundShadow(ctx, px, groundY, box.size);
      ctx.restore();
    }
    if (pop === 0) return;
    const bob = pose.jump ? 0 : Math.sin(time / 320) * box.size * 0.04;
    const drawY = py - hop.lift + bob;
    ctx.save();
    if (pop !== null) {
      const anchorX = px + box.size / 2;
      const anchorY = py + box.size * 0.82;
      ctx.globalAlpha = pop;
      ctx.translate(anchorX, anchorY);
      ctx.scale(0.25 + 0.75 * pop, 0.25 + 0.75 * pop);
      ctx.translate(-anchorX, -anchorY);
    }
    if (sinking) {
      const anchorX = px + box.size / 2;
      const anchorY = py + box.size * 0.7;
      ctx.translate(anchorX, anchorY);
      ctx.scale(0.62, 0.62);
      ctx.translate(-anchorX, -anchorY);
      ctx.globalAlpha *= 0.75;
    }
    if (pose.jump) {
      const anchorX = px + box.size / 2;
      const anchorY = drawY + box.size * 0.86;
      ctx.translate(anchorX, anchorY);
      ctx.scale(hop.sx, hop.sy);
      ctx.translate(-anchorX, -anchorY);
    }
    const fall = this.heroFall(time);
    if (fall > 0) {
      const anchorX = px + box.size / 2;
      const anchorY = drawY + box.size * 0.9;
      ctx.translate(anchorX, anchorY);
      ctx.rotate(fall * 1.15);
      ctx.translate(0, fall * box.size * 0.12);
      ctx.translate(-anchorX, -anchorY);
      ctx.globalAlpha *= 1 - fall * 0.2;
    }
    drawSprite(ctx, sprites.hero, px, drawY, box.size * 1.1, hero.facing);
    drawWeapon(ctx, sprites.weapons, sprites.sword, px, drawY, box.size, hero.facing, swing, weapon);
    ctx.restore();
  }

  private drawMonster(
    ctx: CanvasRenderingContext2D,
    box: Box,
    monster: Fighter,
    pose: Pose,
    sprites: Sprites,
    shadow: boolean,
    life = 1,
  ): void {
    if ((monster.mode === "gone" || monster.mode === "air") && life === 1) return;
    const px = box.ox + pose.x * box.size;
    const groundY = box.oy + pose.y * box.size;
    if (monster.mode === "under" && life === 1) {
      ctx.save();
      ctx.fillStyle = "rgba(74, 58, 40, 0.9)";
      ctx.beginPath();
      ctx.ellipse(px + box.size / 2, groundY + box.size * 0.72, box.size * 0.32, box.size * 0.13, 0, Math.PI, 0);
      ctx.fill();
      ctx.restore();
      return;
    }
    const hop = stepJump(pose, box.size);
    const py = groundY + (1 - life) * box.size * 0.22 - hop.lift;
    if (shadow) {
      ctx.save();
      ctx.globalAlpha = life * (0.5 + 0.5 * hop.shadow);
      const cx = px + box.size / 2;
      const cy = groundY + box.size * 0.86;
      ctx.translate(cx, cy);
      ctx.scale(hop.shadow, hop.shadow);
      ctx.translate(-cx, -cy);
      drawGroundShadow(ctx, px, groundY, box.size);
      ctx.restore();
    }
    ctx.save();
    ctx.globalAlpha = life;
    if (monster.stun > 0 && life === 1) ctx.globalAlpha *= 0.55;
    if (monster.mode === "sleep" && life === 1) ctx.globalAlpha *= 0.75;
    if (pose.jump) {
      const anchorX = px + box.size / 2;
      const anchorY = py + box.size * 0.86;
      ctx.translate(anchorX, anchorY);
      ctx.scale(hop.sx, hop.sy);
      ctx.translate(-anchorX, -anchorY);
    }
    const spore = monster.role === "spore";
    const closedChest = monster.role === "chest" && monster.mode === "passive";
    const art = closedChest
      ? (sprites.props.chest ?? sprites.monsters["16"] ?? sprites.monster)
      : (spore ? sprites.monsters["11"] : monster.kind ? sprites.monsters[monster.kind] : undefined) ?? sprites.monster;
    const scale = spore ? SPORE_SCALE : closedChest ? 0.84 : 1;
    const inset = (box.size * (1 - scale)) / 2;
    drawSprite(ctx, art, px + inset, py + inset * 1.6, box.size * scale, closedChest ? "right" : monster.facing);
    ctx.restore();
  }

  /** Пока монстр был жив, запоминаем его. В кадр смерти он оседает и гаснет. */
  private noteDeaths(state: RoomState, time: number): { monster: Fighter; pose: Pose; life: number }[] {
    for (const monster of roomMonsters(state)) {
      if (monster.hp > 0) this.sawAlive.add(monster);
      else if (this.sawAlive.has(monster) && !this.deaths.some((death) => death.monster === monster)) {
        this.sawAlive.delete(monster);
        this.deaths.push({ monster, x: monster.x, y: monster.y, start: time });
      }
    }
    this.deaths = this.deaths.filter((death) => time - death.start < DEATH_MS);
    return this.deaths.map((death) => ({
      monster: death.monster,
      pose: { x: death.x, y: death.y, travel: null, jump: false },
      life: 1 - (time - death.start) / DEATH_MS,
    }));
  }

  private trackHeroDeath(state: RoomState, time: number): void {
    if (state.outcome !== "lost" && state.hero.hp > 0) {
      this.heroDeathAt = null;
      return;
    }
    if (this.heroDeathAt === null) this.heroDeathAt = time;
  }

  private heroFall(time: number): number {
    if (this.heroDeathAt === null) return 0;
    return Math.min(1, (time - this.heroDeathAt) / HERO_FALL_MS);
  }

  private bloodAmount(time: number): number {
    if (this.heroDeathAt === null) return 0;
    return Math.max(0, Math.min(1, (time - this.heroDeathAt - BLOOD_DELAY_MS) / BLOOD_MS));
  }

  private takeCoins(state: RoomState, time: number): void {
    for (const drop of state.drops) {
      this.coins.push({
        fromX: drop.from.x,
        fromY: drop.from.y,
        toX: drop.to.x,
        toY: drop.to.y,
        start: time,
      });
    }
    state.drops.length = 0;
    this.coins = this.coins.filter((coin) => time - coin.start < COIN_MS);
  }

  private coinInFlight(cell: Cell, time: number): boolean {
    return this.coins.some(
      (coin) => coin.toX === cell.x && coin.toY === cell.y && time - coin.start < COIN_MS,
    );
  }

  /** Затухающая дрожь в пикселях. Не сдвигает клетку под курсором. */
  private kick(time: number): { x: number; y: number } {
    if (this.shakeStart === 0) return { x: 0, y: 0 };
    const elapsed = time - this.shakeStart;
    const ms = 260;
    if (elapsed >= ms) {
      this.shakeStart = 0;
      return { x: 0, y: 0 };
    }
    const fade = 1 - elapsed / ms;
    const amp = fade * fade * 8;
    return {
      x: Math.sin(elapsed / 22) * amp,
      y: Math.cos(elapsed / 17) * amp * 0.65,
    };
  }

  /** Камера догоняет нарисованного героя, а не прыгает вместе с началом шага. */
  private follow(hero: Cell, time: number): Cell {
    const dt = this.lastTime ? Math.min(0.05, (time - this.lastTime) / 1000) : 0;
    this.lastTime = time;
    if (!this.camera) {
      this.camera = { x: hero.x, y: hero.y };
      return this.camera;
    }
    const k = 1 - Math.exp(-dt * CAMERA_FOLLOW);
    this.camera.x += (hero.x - this.camera.x) * k;
    this.camera.y += (hero.y - this.camera.y) * k;
    if (Math.abs(hero.x - this.camera.x) < 0.002) this.camera.x = hero.x;
    if (Math.abs(hero.y - this.camera.y) < 0.002) this.camera.y = hero.y;
    return this.camera;
  }

  private backgroundFor(
    state: RoomState,
    size: number,
    sprites: Sprites,
  ): { canvas: HTMLCanvasElement; box: Box; dressing: Dressing } {
    const room = state.room;
    const exits = state.exits.map((door) => door.side).join(",");
    const key = `${room.id}|${room.theme}|${exits}|${size}`;
    if (this.background?.key === key) return this.background;
    const frame = backgroundFrame(room, size);
    const dressing = dressRoom(room, state.exits);
    const canvas = document.createElement("canvas");
    canvas.width = frame.width;
    canvas.height = frame.height;
    const ctx = canvas.getContext("2d");
    if (ctx) paintBackground(ctx, frame.box, room, dressing, sprites);
    this.background = { key, canvas, box: frame.box, dressing };
    return this.background;
  }

  private patternFor(ctx: CanvasRenderingContext2D, sprites: Sprites): CanvasPattern | null {
    if (this.pattern?.ctx === ctx) return this.pattern.value;
    this.pattern = { ctx, value: createWallPattern(ctx, sprites) };
    return this.pattern.value;
  }

}
