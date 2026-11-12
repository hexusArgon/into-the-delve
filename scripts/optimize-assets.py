#!/usr/bin/env python3
"""Собирает игровые ассеты из исходников art/ в assets/.

Исходники — картинки 1024×1024 на пурпурном фоне и музыка в OGG/MP3. Раньше фон вырезался в браузере
при каждом запуске забега, а игрок качал 37 МБ. Здесь то же самое делается один раз:

- спрайт: фон вырезается тем же правилом, что `keySprite` в src/modules/room/game/sprite-key.ts,
  пустые поля обрезаются (как `trimmed` в sprites.ts), картинка уменьшается и пишется в WebP
  с прозрачностью;
- текстуры пола и стен, экран меню и загрузки: только WebP без прозрачности;
- музыка: MP3 112 кбит/с. OGG Vorbis не декодируется в Safari на старых iOS.

Запуск: `npm run assets` (нужны Python 3 с Pillow и numpy, ffmpeg с libmp3lame).
Новый спрайт кладётся в art/ на пурпурном фоне, затем скрипт запускается снова.
"""

from __future__ import annotations

import shutil
import subprocess
import sys
from dataclasses import dataclass
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "art"
OUT = ROOT / "assets"

# Пороги совпадают с sprite-key.ts: ближе KEY_SOLID — фон, дальше KEY_EDGE — фигура, между — тающий край.
KEY_SOLID = 60
KEY_EDGE = 120
# Порог прозрачности при обрезке полей, как в trimmed() из sprites.ts.
TRIM_ALPHA = 24
WEBP_QUALITY = 82


@dataclass(frozen=True)
class Rule:
    """Как готовить картинку: вырезать фон, обрезать поля, до какой стороны уменьшить."""

    key: bool
    trim: bool
    max_side: int


# Герой, меч и запасной монстр рисуются целым кадром: их поля задают посадку фигуры в клетке.
FULL_FRAME = {"hero-rogue.jpg", "sword.jpg", "monster.jpg"}
# Плоские картинки без прозрачности: текстуры и экраны.
OPAQUE = {"dungeon-floor.jpg", "dungeon-wall.jpg", "wood-floor.jpg", "menu-depart.jpg", "loading-castle.jpg"}
# Иконки в интерфейсе мельче фигур на поле.
ICON_DIRS = {"items", "abilities", "status"}


def rule_for(path: Path) -> Rule:
    rel = path.relative_to(SRC)
    name = rel.name
    if name in OPAQUE:
        return Rule(key=False, trim=False, max_side=1280)
    if name in FULL_FRAME:
        return Rule(key=True, trim=False, max_side=512)
    if path.suffix.lower() == ".png":
        # Уже с прозрачностью (горсть золота): вырезать нечего, поля обрезаются.
        return Rule(key=False, trim=True, max_side=256)
    if rel.parts[0] in ICON_DIRS:
        return Rule(key=True, trim=True, max_side=320)
    return Rule(key=True, trim=True, max_side=448)


def key_sprite(rgba: np.ndarray) -> np.ndarray:
    """Порт keySprite: фон по цвету левого верхнего пикселя, край тает, розовый отлив снимается."""
    out = rgba.astype(np.float64)
    key = out[0, 0, :3]
    r, g, b = out[..., 0], out[..., 1], out[..., 2]
    dist = np.sqrt((r - key[0]) ** 2 + (g - key[1]) ** 2 + (b - key[2]) ** 2)
    alpha = out[..., 3]
    solid = dist < KEY_SOLID
    edge = (dist >= KEY_SOLID) & (dist < KEY_EDGE)
    alpha[solid] = 0
    alpha[edge] = np.round((dist[edge] - KEY_SOLID) / (KEY_EDGE - KEY_SOLID) * 255)
    spill = np.minimum(r, b) - g
    fix = edge & (spill > 0)
    r[fix] -= spill[fix]
    b[fix] -= spill[fix]
    return np.clip(np.round(out), 0, 255).astype(np.uint8)


def trim(rgba: np.ndarray) -> np.ndarray:
    mask = rgba[..., 3] >= TRIM_ALPHA
    if not mask.any():
        return rgba
    rows = np.flatnonzero(mask.any(axis=1))
    cols = np.flatnonzero(mask.any(axis=0))
    return rgba[rows[0] : rows[-1] + 1, cols[0] : cols[-1] + 1]


def shrink(image: Image.Image, max_side: int) -> Image.Image:
    side = max(image.size)
    if side <= max_side:
        return image
    scale = max_side / side
    size = (max(1, round(image.width * scale)), max(1, round(image.height * scale)))
    if image.mode == "RGBA":
        # Уменьшение с домноженной альфой: иначе по краям фигуры проступает вырезанный пурпур.
        return image.convert("RGBa").resize(size, Image.Resampling.LANCZOS).convert("RGBA")
    return image.resize(size, Image.Resampling.LANCZOS)


def kept_share(rgba: np.ndarray) -> float:
    return float((rgba[..., 3] > 0).mean())


def build_image(src: Path) -> tuple[Path, float | None]:
    rule = rule_for(src)
    dest = (OUT / src.relative_to(SRC)).with_suffix(".webp")
    dest.parent.mkdir(parents=True, exist_ok=True)
    with Image.open(src) as opened:
        if not rule.key and not rule.trim:
            image = shrink(opened.convert("RGB"), rule.max_side)
            image.save(dest, "WEBP", quality=WEBP_QUALITY, method=4)
            return dest, None
        rgba = np.asarray(opened.convert("RGBA"))
    share = None
    if rule.key:
        rgba = key_sprite(rgba)
        share = kept_share(rgba)
    if rule.trim:
        rgba = trim(rgba)
    image = shrink(Image.fromarray(rgba, "RGBA"), rule.max_side)
    image.save(dest, "WEBP", quality=WEBP_QUALITY, method=4, exact=False)
    return dest, share


def build_music(src: Path) -> Path:
    dest = (OUT / src.relative_to(SRC)).with_suffix(".mp3")
    dest.parent.mkdir(parents=True, exist_ok=True)
    subprocess.run(
        ["ffmpeg", "-loglevel", "error", "-y", "-i", str(src), "-vn", "-codec:a", "libmp3lame", "-b:a", "112k", str(dest)],
        check=True,
    )
    return dest


def main() -> int:
    if not SRC.is_dir():
        print(f"нет исходников: {SRC}", file=sys.stderr)
        return 1
    images = sorted(p for p in SRC.rglob("*") if p.suffix.lower() in {".jpg", ".jpeg", ".png"})
    music = sorted(p for p in (SRC / "music").glob("*") if p.suffix.lower() in {".ogg", ".mp3", ".wav"})

    # Старые результаты удаляются, чтобы переименованный исходник не оставил сироту.
    for old in OUT.rglob("*.webp"):
        old.unlink()
    music_out = OUT / "music"
    if music_out.is_dir():
        shutil.rmtree(music_out)

    lost: list[str] = []
    for src in images:
        dest, share = build_image(src)
        # Фигура, которая почти целиком ушла вместе с фоном, значит неверный цвет ключа в углу.
        if share is not None and share < 0.01:
            lost.append(f"{src.relative_to(SRC)} (осталось {share:.1%})")
        print(f"{src.relative_to(SRC)} → {dest.relative_to(ROOT)} {dest.stat().st_size // 1024} КБ")
    for src in music:
        dest = build_music(src)
        print(f"{src.relative_to(SRC)} → {dest.relative_to(ROOT)} {dest.stat().st_size // 1024} КБ")

    if lost:
        print("Фон съел фигуру:", *lost, sep="\n  ", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
