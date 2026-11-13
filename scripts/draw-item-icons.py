"""Рисует недостающие иконки вещей в art/items/: тот же формат, что у нарисованных, — 1024², пурпурный фон.

Простые и необычные вещи — векторные фигуры с заливкой, светом слева сверху, тенью справа снизу и тёмным
контуром. Редкие и эпические вещи названы по материалам (Sinew Wax = Sinew + Wax): их иконка — железный
оберег, в котором лежат иконки этих материалов, камень внизу — цвет редкости.

Существующие файлы не трогаются: нарисованная вручную иконка всегда важнее. Запуск:
    python3 scripts/draw-item-icons.py && python3 scripts/optimize-assets.py
"""

from __future__ import annotations

import re
import subprocess
import sys
import tempfile
from dataclasses import dataclass
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
ART = ROOT / "art" / "items"
ITEMS_TS = ROOT / "src" / "modules" / "room" / "data" / "items.ts"

SIZE = 1024
KEY = (218, 26, 128)
INK = (42, 28, 20)
OUTLINE = 15
SHADE_SHIFT = 34
LIGHT_SHIFT = 16

Color = tuple[int, int, int]


def hexc(value: str) -> Color:
    value = value.lstrip("#")
    return (int(value[0:2], 16), int(value[2:4], 16), int(value[4:6], 16))


def render(body: str) -> np.ndarray:
    """SVG-фрагмент 1024² → float RGBA 0..1."""
    svg = (
        f'<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" '
        f'width="{SIZE}" height="{SIZE}" viewBox="0 0 {SIZE} {SIZE}">{body}</svg>'
    )
    with tempfile.TemporaryDirectory() as tmp:
        src = Path(tmp) / "a.svg"
        out = Path(tmp) / "a.png"
        src.write_text(svg)
        subprocess.run(["rsvg-convert", "-w", str(SIZE), "-h", str(SIZE), str(src), "-o", str(out)], check=True)
        with Image.open(out) as image:
            return np.asarray(image.convert("RGBA")).astype(np.float64) / 255.0


def mask_of(el: str, width: float) -> np.ndarray:
    """Силуэт элемента: заливка плюс обводка ширины width (0 — только заливка)."""
    stroke = f'stroke="#fff" stroke-width="{width}"' if width > 0 else 'stroke="none"'
    body = f'<g fill="#fff" {stroke} stroke-linejoin="round" stroke-linecap="round">{el}</g>'
    return render(body)[..., 3]


def shifted(mask: np.ndarray, dx: int, dy: int) -> np.ndarray:
    """mask(x + dx, y + dy), за краем — пусто."""
    out = np.zeros_like(mask)
    h, w = mask.shape
    xs = slice(max(0, -dx), min(w, w - dx))
    ys = slice(max(0, -dy), min(h, h - dy))
    xd = slice(max(0, dx), min(w, w + dx))
    yd = slice(max(0, dy), min(h, h + dy))
    out[ys, xs] = mask[yd, xd]
    return out


def over(canvas: np.ndarray, color: np.ndarray, alpha: np.ndarray) -> None:
    a = alpha[..., None]
    canvas[..., :3] = canvas[..., :3] * (1 - a) + color * a
    canvas[..., 3] = canvas[..., 3] * (1 - alpha) + alpha


@dataclass
class Shape:
    """Залитая фигура: el — SVG без краски; stroke — ширина, если фигура сама линия (кольцо, шнур)."""

    el: str
    color: str
    stroke: float = 0
    outline: bool = True
    shade: float = 0.42
    light: float = 0.28


@dataclass
class Line:
    """Деталь поверх: трещина, шов, прожилка."""

    el: str
    color: str = "#2a1c14"
    width: float = 12


@dataclass
class Raw:
    """Готовый SVG с краской (свечение, блик), без контура и света."""

    body: str


Layer = Shape | Line | Raw


def paint(layers: list[Layer]) -> np.ndarray:
    canvas = np.zeros((SIZE, SIZE, 4))
    for layer in layers:
        if isinstance(layer, Shape):
            el = layer.el
            fill_el = el if layer.stroke == 0 else el.replace("/>", f' fill="none" stroke-width="{layer.stroke}"/>')
            if layer.stroke > 0:
                body = f'<g stroke="#fff" fill="none" stroke-linecap="round" stroke-linejoin="round">{fill_el}</g>'
                inner = render(body)[..., 3]
                edge_body = f'<g stroke="#fff" fill="none" stroke-linecap="round" stroke-linejoin="round">' + el.replace(
                    "/>", f' fill="none" stroke-width="{layer.stroke + 2 * OUTLINE}"/>'
                ) + "</g>"
                edge = render(edge_body)[..., 3]
            else:
                inner = mask_of(el, 0)
                edge = mask_of(el, 2 * OUTLINE)
            if layer.outline:
                over(canvas, np.array(INK) / 255.0, edge)
            base = np.array(hexc(layer.color)) / 255.0
            dark = inner * (1 - shifted(inner, SHADE_SHIFT, SHADE_SHIFT))
            lit = inner * (1 - shifted(inner, -LIGHT_SHIFT, -LIGHT_SHIFT)) * (1 - dark)
            tone = np.broadcast_to(base, inner.shape + (3,)).copy()
            tone = tone * (1 - layer.shade * dark[..., None])
            tone = tone + (1 - tone) * (layer.light * lit[..., None])
            a = inner[..., None]
            canvas[..., :3] = canvas[..., :3] * (1 - a) + tone * a
            canvas[..., 3] = canvas[..., 3] * (1 - inner) + inner
        elif isinstance(layer, Line):
            body = (
                f'<g fill="none" stroke="#fff" stroke-width="{layer.width}" stroke-linecap="round" '
                f'stroke-linejoin="round">{layer.el}</g>'
            )
            over(canvas, np.array(hexc(layer.color)) / 255.0, render(body)[..., 3])
        else:
            layer_rgba = render(layer.body)
            over(canvas, layer_rgba[..., :3], layer_rgba[..., 3])
    return canvas


def save(canvas: np.ndarray, dest: Path) -> None:
    bg = np.array(KEY) / 255.0
    a = canvas[..., 3:4]
    rgb = canvas[..., :3] * a + bg * (1 - a)
    Image.fromarray(np.clip(np.round(rgb * 255), 0, 255).astype(np.uint8), "RGB").save(dest, "JPEG", quality=95)


def glow(cx: float, cy: float, r: float, color: str, strength: float = 0.75) -> Raw:
    return Raw(
        f'<defs><radialGradient id="g{cx:.0f}{cy:.0f}"><stop offset="0" stop-color="{color}" stop-opacity="{strength}"/>'
        f'<stop offset="1" stop-color="{color}" stop-opacity="0"/></radialGradient></defs>'
        f'<circle cx="{cx}" cy="{cy}" r="{r}" fill="url(#g{cx:.0f}{cy:.0f})"/>'
    )


def gleam(cx: float, cy: float, rx: float, ry: float, angle: float = -35, opacity: float = 0.85) -> Raw:
    return Raw(f'<ellipse cx="{cx}" cy="{cy}" rx="{rx}" ry="{ry}" transform="rotate({angle} {cx} {cy})" fill="#ffffff" opacity="{opacity}"/>')


def spots(points: list[tuple[float, float, float]], color: str, opacity: float = 0.55) -> Raw:
    return Raw("".join(f'<circle cx="{x}" cy="{y}" r="{r}" fill="{color}" opacity="{opacity}"/>' for x, y, r in points))


# ---------------------------------------------------------------- простые вещи (common)

BASE: dict[str, list[Layer]] = {
    "fang": [
        Shape('<path d="M 418 238 C 520 196 650 214 704 262 C 676 430 572 650 372 812 C 420 650 444 488 404 336 C 396 296 398 256 418 238 Z"/>', "#e4d6ae"),
        Shape('<path d="M 418 238 C 520 196 650 214 704 262 L 694 312 C 620 270 520 262 430 296 Z"/>', "#a8865a", outline=False),
        Line('<path d="M 612 312 L 566 392 L 600 440 L 540 534 L 556 590"/>', width=11),
    ],
    "rib": [
        Shape('<path d="M 248 742 C 288 452 498 300 772 318"/>', "#ddd1b0", stroke=104),
        Shape('<circle cx="790" cy="300" r="70"/><circle cx="742" cy="262" r="56"/>', "#d3c49f"),
        Line('<path d="M 230 790 L 262 738 L 226 712 L 270 690"/>', width=12),
        Line('<path d="M 430 470 C 470 430 520 405 560 395"/>', color="#b9a77f", width=10),
    ],
    "buckle": [
        Shape('<path fill-rule="evenodd" d="M 300 280 H 724 Q 790 280 790 346 V 678 Q 790 744 724 744 H 300 Q 234 744 234 678 V 346 Q 234 280 300 280 Z M 340 380 V 644 H 684 V 380 Z"/>', "#9c6d3e"),
        Shape('<rect x="486" y="282" width="52" height="460" rx="18"/>', "#8a5e34"),
        Shape('<path d="M 512 486 L 740 498 L 760 512 L 740 526 L 512 538 Z"/>', "#b58b55"),
        spots([(300, 330, 18), (700, 700, 22), (270, 600, 14), (640, 320, 12)], "#5a3a22"),
    ],
    "badge": [
        Shape('<path d="M 430 160 L 594 160 L 566 300 L 458 300 Z"/>', "#7a2f2f"),
        Shape('<circle cx="512" cy="560" r="270"/>', "#a3a7a3"),
        Line('<circle cx="512" cy="560" r="206"/>', color="#6e726e", width=14),
        Shape('<path d="M 512 410 L 552 512 L 662 516 L 576 584 L 606 690 L 512 628 L 418 690 L 448 584 L 362 516 L 472 512 Z"/>', "#868b87", shade=0.3),
        spots([(390, 450, 20), (640, 700, 26), (600, 420, 14)], "#5c5f52", 0.45),
    ],
    "sinew": [
        Shape('<ellipse cx="500" cy="560" rx="250" ry="150" transform="rotate(-18 500 560)"/>', "#b0835a", stroke=46),
        Shape('<ellipse cx="530" cy="500" rx="230" ry="140" transform="rotate(12 530 500)"/>', "#bf9266", stroke=46),
        Shape('<path d="M 720 430 C 790 360 800 290 760 230"/>', "#b0835a", stroke=42),
        Line('<path d="M 300 520 L 320 540 M 420 420 L 440 440 M 640 600 L 660 620 M 560 400 L 580 420"/>', color="#7d5634", width=10),
    ],
    "cloak-scrap": [
        Shape('<path d="M 276 270 L 744 244 C 762 380 752 520 772 646 L 700 700 L 652 660 L 600 744 L 540 682 L 470 764 L 420 692 L 348 744 L 308 652 C 290 520 298 400 276 270 Z"/>', "#566142"),
        Line('<path d="M 420 300 C 430 440 410 560 440 680 M 600 290 C 590 420 620 540 600 660"/>', color="#3a422b", width=13),
        Line('<path d="M 300 320 L 730 296"/>', color="#c9b98a", width=8),
    ],
    "clay": [
        Shape('<path d="M 256 404 C 420 330 620 322 782 384 L 704 560 L 640 600 L 560 766 L 470 652 L 360 704 L 330 562 Z"/>', "#b8643a"),
        Shape('<path d="M 256 404 C 420 330 620 322 782 384 L 766 436 C 610 380 420 388 276 454 Z"/>', "#d08a5c", outline=False, shade=0.2),
        Line('<path d="M 330 520 L 380 480 L 430 520 L 480 480 L 530 520 L 580 480 L 630 520 L 680 480"/>', color="#5e2f1a", width=13),
    ],
    "rivet": [
        Shape('<path d="M 452 520 H 572 V 770 Q 572 806 512 806 Q 452 806 452 770 Z"/>', "#6e7173"),
        Shape('<path d="M 262 560 C 270 400 754 400 762 560 Q 762 600 512 600 Q 262 600 262 560 Z"/>', "#73777a"),
        spots([(380, 500, 28), (600, 470, 22), (690, 560, 18), (500, 720, 16), (330, 570, 14)], "#b3582a", 0.75),
        Line('<path d="M 452 640 H 572 M 452 690 H 572"/>', color="#4b4e50", width=10),
        gleam(420, 470, 70, 20, -12, 0.55),
    ],
    "token": [
        Shape('<path fill-rule="evenodd" d="M 512 240 A 272 272 0 1 1 511.9 240 Z M 466 466 V 558 H 558 V 466 Z"/>', "#a8803f"),
        Line('<circle cx="512" cy="512" r="212"/>', color="#7b5a26", width=12),
        Line('<path d="M 512 330 V 400 M 512 624 V 694 M 330 512 H 400 M 624 512 H 694"/>', color="#7b5a26", width=14),
        spots([(330, 360, 12), (700, 640, 16), (640, 330, 10)], "#5b4220", 0.5),
    ],
    "button": [
        Shape('<circle cx="512" cy="512" r="262"/>', "#dccfa9"),
        Line('<circle cx="512" cy="512" r="196"/>', color="#b3a37a", width=16),
        Shape('<circle cx="462" cy="462" r="34"/><circle cx="562" cy="462" r="34"/><circle cx="462" cy="562" r="34"/><circle cx="562" cy="562" r="34"/>', "#4a3a2a", shade=0.1, light=0),
        Line('<path d="M 640 300 L 600 360 L 630 400"/>', color="#8d7d58", width=9),
    ],
    "splinter": [
        Shape('<path d="M 214 806 L 262 742 L 690 300 L 730 214 L 772 268 L 812 250 L 784 320 L 352 776 L 296 790 Z"/>', "#62452f"),
        Line('<path d="M 300 740 L 700 320 M 340 760 C 480 610 600 480 740 330"/>', color="#3d2a1b", width=10),
        Shape('<path d="M 488 470 L 560 540"/>', "#5d5f60", stroke=26),
        Shape('<circle cx="478" cy="460" r="30"/>', "#6c6e70"),
    ],
    "pebble": [
        Shape('<path d="M 268 540 C 248 400 380 286 540 292 C 700 298 790 400 772 530 C 754 660 640 742 500 738 C 360 734 286 660 268 540 Z"/>', "#8e99a2"),
        Raw('<path d="M 340 520 C 400 460 470 470 520 500 C 580 535 640 520 690 470" fill="none" stroke="#e4ebee" stroke-width="30" stroke-linecap="round" opacity="0.6"/>'
            '<path d="M 380 620 C 450 590 540 610 620 590" fill="none" stroke="#e4ebee" stroke-width="22" stroke-linecap="round" opacity="0.45"/>'),
        gleam(420, 380, 70, 30, -20, 0.55),
    ],
    # ------------------------------------------------------------ необычные (uncommon): материалы
    "ether": [
        Shape('<path d="M 456 210 H 568 V 400 C 690 436 770 520 770 620 C 770 750 650 830 512 830 C 374 830 254 750 254 620 C 254 520 334 436 456 400 Z"/>', "#c7dbe2"),
        Shape('<path d="M 284 600 C 380 560 640 660 740 600 C 750 730 640 806 512 806 C 384 806 274 730 284 600 Z"/>', "#3f8fd8", outline=False, shade=0.35, light=0.4),
        glow(512, 690, 120, "#9fd8ff", 0.55),
        Shape('<rect x="438" y="168" width="148" height="82" rx="20"/>', "#a87b4e"),
        gleam(380, 560, 34, 90, 20, 0.7),
    ],
    "spell-bead": [
        Shape('<path d="M 200 300 C 380 360 640 360 830 300"/>', "#8a6b4a", stroke=22),
        Shape('<circle cx="512" cy="540" r="236"/>', "#7650ae"),
        glow(512, 560, 180, "#e2c9ff", 0.45),
        Line('<path d="M 452 450 L 572 450 L 512 560 L 572 640 L 452 640"/>', color="#f3e9ff", width=18),
        gleam(420, 420, 60, 28, -35, 0.75),
    ],
    "hearth-coal": [
        Shape('<path d="M 262 560 L 300 400 L 420 318 L 580 330 L 720 400 L 776 540 L 712 690 L 560 752 L 380 730 Z"/>', "#33292a", shade=0.3, light=0.18),
        Line('<path d="M 360 470 L 450 520 L 430 610 M 520 400 L 560 500 L 660 540 M 560 500 L 520 640 L 600 700"/>', color="#ff9a33", width=16),
        Line('<path d="M 450 520 L 520 560 M 660 540 L 720 520"/>', color="#ffd36a", width=8),
    ],
    "clay-seal": [
        Shape('<ellipse cx="512" cy="600" rx="290" ry="170"/>', "#8e4d2c"),
        Shape('<ellipse cx="512" cy="540" rx="290" ry="170"/>', "#b5683e"),
        Line('<path d="M 380 600 L 460 480 L 512 540 L 570 450 L 650 600 Z"/>', color="#6a3519", width=16),
        Line('<ellipse cx="512" cy="540" rx="220" ry="118"/>', color="#8e4d2c", width=12),
    ],
    "wax-stop": [
        Shape('<path d="M 400 420 H 624 L 596 790 Q 512 820 428 790 Z"/>', "#b88d5a"),
        Shape('<path d="M 370 330 Q 370 240 512 236 Q 654 240 654 330 V 450 L 626 520 L 600 460 L 572 560 L 540 470 L 500 600 L 470 470 L 436 540 L 410 460 L 370 470 Z"/>', "#5d8a3a"),
        gleam(450, 300, 50, 22, -20, 0.6),
        spots([(480, 680, 10), (550, 740, 12), (520, 620, 8)], "#8a6438"),
    ],
    "scale-chip": [
        Shape('<path d="M 512 820 C 360 700 260 560 268 400 C 276 280 388 214 512 214 C 636 214 748 280 756 400 C 764 560 664 700 512 820 Z"/>', "#3d7f9b"),
        Line('<path d="M 340 380 C 420 330 604 330 684 380 M 370 500 C 440 450 584 450 654 500 M 420 620 C 470 580 554 580 604 620"/>', color="#235468", width=13),
        Raw('<path d="M 360 300 C 420 260 520 250 600 270" fill="none" stroke="#9fe0e6" stroke-width="22" stroke-linecap="round" opacity="0.7"/>'),
    ],
    "rime-bead": [
        Shape('<path d="M 200 300 C 380 360 640 360 830 300"/>', "#8a6b4a", stroke=22),
        Shape('<circle cx="512" cy="540" r="236"/>', "#b6deee", shade=0.3),
        Line('<path d="M 512 380 V 700 M 374 460 L 650 620 M 374 620 L 650 460 M 512 380 L 480 420 M 512 380 L 544 420 M 512 700 L 480 660 M 512 700 L 544 660"/>', color="#ffffff", width=12),
        gleam(420, 420, 56, 26, -35, 0.85),
    ],
    "crit-odds": [
        Shape('<path d="M 512 220 L 790 360 L 512 500 L 234 360 Z"/>', "#ece2c4", shade=0.15),
        Shape('<path d="M 234 360 L 512 500 L 512 820 L 234 680 Z"/>', "#cdbf98", shade=0.2),
        Shape('<path d="M 512 500 L 790 360 L 790 680 L 512 820 Z"/>', "#ae9f78", shade=0.2),
        Raw('<g fill="#3a2a1c"><ellipse cx="512" cy="360" rx="34" ry="20"/>'
            '<circle cx="320" cy="470" r="26"/><circle cx="426" cy="700" r="26"/><circle cx="373" cy="585" r="26"/>'
            '<circle cx="600" cy="560" r="26"/><circle cx="700" cy="520" r="26"/><circle cx="600" cy="700" r="26"/><circle cx="700" cy="660" r="26"/></g>'),
    ],
    "crit-share": [
        Shape('<path d="M 300 760 L 252 470 L 380 238 L 470 300 L 440 520 L 480 700 Z"/>', "#b2363e"),
        Shape('<path d="M 560 280 L 660 232 L 780 470 L 726 770 L 556 700 L 594 500 Z"/>', "#c4464c"),
        Line('<path d="M 300 470 L 380 300 M 700 460 L 650 300"/>', color="#ffb2b0", width=12),
        Raw('<path d="M 512 180 L 526 230 L 576 244 L 526 258 L 512 308 L 498 258 L 448 244 L 498 230 Z" fill="#fff4d6"/>'),
    ],
    "hit-spike": [
        Shape('<path d="M 300 330 L 350 280 L 790 720 L 800 800 L 720 790 Z"/>', "#6f7478"),
        Shape('<path d="M 220 330 L 330 220 L 390 280 L 280 390 Z"/>', "#5a5e62"),
        Line('<path d="M 350 330 L 760 740"/>', color="#a7adb1", width=10),
    ],
    "fire-spark": [
        Shape('<path d="M 512 200 C 590 330 720 420 712 580 C 704 720 620 800 512 800 C 404 800 320 720 312 580 C 306 470 380 420 420 330 C 450 400 470 430 500 440 C 500 360 490 280 512 200 Z"/>', "#e8702a"),
        Shape('<path d="M 512 470 C 560 540 620 590 612 670 C 606 730 566 764 512 764 C 458 764 418 730 412 670 C 406 610 460 580 512 470 Z"/>', "#ffd25a", outline=False, shade=0.15),
        spots([(330, 320, 14), (720, 330, 12), (760, 470, 10), (280, 470, 9)], "#ffb03a", 0.9),
    ],
    "earth-pebble": [
        Shape('<path d="M 262 560 C 250 420 360 300 520 296 C 680 292 786 400 772 540 C 760 680 640 750 500 748 C 360 746 274 690 262 560 Z"/>', "#7c5a3e"),
        Line('<path d="M 300 600 C 380 540 430 590 500 520 C 560 460 620 520 700 430 M 500 520 L 540 640"/>', color="#e2b648", width=16),
        gleam(420, 390, 60, 24, -20, 0.4),
    ],
    "poison-tooth": [
        Shape('<path d="M 380 220 C 470 196 560 196 650 222 C 660 360 620 520 560 690 C 540 740 500 760 482 700 C 430 540 380 380 380 220 Z"/>', "#e2d4ad"),
        Shape('<path d="M 430 560 C 480 580 560 580 600 560 C 584 620 572 660 560 690 C 540 740 500 760 482 700 C 468 660 450 620 430 560 Z"/>', "#7cb23a", outline=False, shade=0.3),
        Shape('<path d="M 512 770 C 540 810 552 836 540 858 C 528 878 496 878 484 858 C 472 836 486 810 512 770 Z"/>', "#7cb23a"),
        Shape('<path d="M 380 220 C 470 196 560 196 650 222 L 646 270 C 560 248 470 248 384 272 Z"/>', "#a8865a", outline=False),
    ],
    "water-drop": [
        Shape('<path d="M 512 196 C 600 340 742 480 742 620 C 742 750 640 830 512 830 C 384 830 282 750 282 620 C 282 480 424 340 512 196 Z"/>', "#2f6eb8"),
        Raw('<path d="M 400 560 C 400 480 440 420 480 360" fill="none" stroke="#bfe3ff" stroke-width="34" stroke-linecap="round" opacity="0.8"/>'),
        gleam(420, 660, 26, 44, 10, 0.55),
    ],
    "ice-chip": [
        Shape('<path d="M 300 760 L 250 520 L 380 250 L 560 210 L 760 380 L 730 640 L 520 800 Z"/>', "#a7dbee", shade=0.3),
        Line('<path d="M 380 250 L 470 520 L 300 760 M 470 520 L 760 380 M 470 520 L 520 800 M 560 210 L 470 520"/>', color="#e9f8ff", width=11),
        Raw('<path d="M 640 290 L 650 326 L 686 336 L 650 346 L 640 382 L 630 346 L 594 336 L 630 326 Z" fill="#ffffff"/>'),
    ],
}

# Слово в названии вещи → иконка материала. Редкие и эпические вещи собираются из них.
MATERIAL = {
    "Sinew": "belt",
    "Ether": "ether",
    "Fang": "fang-ring",
    "Spell": "spell-bead",
    "Bone": "bone-plate",
    "Hearth": "hearth-coal",
    "Clay": "clay-seal",
    "Wax": "wax-stop",
    "Scale": "scale-chip",
    "Rime": "rime-bead",
    "Ribbon": "spirit-ribbon",
    "Odds": "crit-odds",
    "Share": "crit-share",
    "Spike": "hit-spike",
    "Spark": "fire-spark",
    "Pebble": "earth-pebble",
    "Bile": "poison-tooth",
    "Drop": "water-drop",
    "Chip": "ice-chip",
}

GEM = {"rare": "#3f80d6", "epic": "#9a52d8"}


def talisman(rarity: str) -> np.ndarray:
    """Железное кольцо оберега с камнем редкости внизу."""
    tint = GEM[rarity]
    return paint(
        [
            Raw(f'<defs><radialGradient id="back" cx="0.45" cy="0.4" r="0.65"><stop offset="0" stop-color="{tint}" stop-opacity="0.55"/>'
                f'<stop offset="0.55" stop-color="#2e2622"/><stop offset="1" stop-color="#1f1a17"/></radialGradient></defs>'
                f'<circle cx="512" cy="512" r="392" fill="#1f1a17"/><circle cx="512" cy="512" r="392" fill="url(#back)"/>'),
            Shape('<circle cx="512" cy="512" r="400"/>', "#4b4842", stroke=46, shade=0.35, light=0.22),
            Shape('<path d="M 452 116 Q 512 60 572 116"/>', "#4b4842", stroke=30),
            Raw('<g fill="#6d6a63"><circle cx="230" cy="230" r="16"/><circle cx="794" cy="230" r="16"/><circle cx="230" cy="794" r="16"/><circle cx="794" cy="794" r="16"/></g>'),
            Shape('<path d="M 512 852 L 572 912 L 512 972 L 452 912 Z"/>', GEM[rarity], shade=0.3, light=0.35),
            gleam(498, 892, 14, 8, -35, 0.85),
        ]
    )


def key_and_trim(rgb: Image.Image) -> np.ndarray:
    """Порт key_sprite из optimize-assets: фон по углу, край тает."""
    out = np.asarray(rgb.convert("RGBA")).astype(np.float64)
    key = out[0, 0, :3]
    dist = np.sqrt(((out[..., :3] - key) ** 2).sum(axis=2))
    alpha = np.clip((dist - 60) / (140 - 60), 0, 1)
    out[..., 3] = alpha * 255
    spill = np.minimum(out[..., 0], out[..., 2]) - out[..., 1]
    fix = (alpha > 0) & (alpha < 1) & (spill > 0)
    out[..., 0][fix] -= spill[fix]
    out[..., 2][fix] -= spill[fix]
    mask = alpha > 0.1
    rows = np.flatnonzero(mask.any(axis=1))
    cols = np.flatnonzero(mask.any(axis=0))
    out = out[rows[0] : rows[-1] + 1, cols[0] : cols[-1] + 1]
    return np.clip(out, 0, 255) / 255.0


def place(canvas: np.ndarray, piece: np.ndarray, cx: float, cy: float, box: float) -> None:
    h, w = piece.shape[:2]
    scale = box / max(h, w)
    size = (max(1, round(w * scale)), max(1, round(h * scale)))
    image = Image.fromarray(np.round(piece * 255).astype(np.uint8), "RGBA").convert("RGBa").resize(size, Image.Resampling.LANCZOS).convert("RGBA")
    small = np.asarray(image).astype(np.float64) / 255.0
    x0 = round(cx - size[0] / 2)
    y0 = round(cy - size[1] / 2)
    region = canvas[y0 : y0 + size[1], x0 : x0 + size[0]]
    a = small[..., 3:4]
    region[..., :3] = region[..., :3] * (1 - a) + small[..., :3] * a
    region[..., 3] = region[..., 3] * (1 - small[..., 3]) + small[..., 3]


def material(name: str) -> np.ndarray:
    with Image.open(ART / f"{name}.jpg") as image:
        return key_and_trim(image.convert("RGB"))


def items_table() -> list[tuple[str, str, str]]:
    """(id, название, редкость) из data/items.ts."""
    text = ITEMS_TS.read_text()
    return re.findall(r'piece\("([^"]+)",\s*"([^"]+)",\s*"(\w+)"', text)


def main() -> int:
    ART.mkdir(parents=True, exist_ok=True)
    made: list[str] = []
    for item_id, layers in BASE.items():
        dest = ART / f"{item_id}.jpg"
        if dest.exists():
            continue
        save(paint(layers), dest)
        made.append(item_id)
    rings: dict[str, np.ndarray] = {}
    for item_id, name, rarity in items_table():
        dest = ART / f"{item_id}.jpg"
        if dest.exists() or rarity not in GEM:
            continue
        words = name.split()
        if not all(word in MATERIAL for word in words):
            continue
        canvas = rings.setdefault(rarity, talisman(rarity)).copy()
        parts = [material(MATERIAL[word]) for word in words]
        if len(parts) == 2:
            spots_at = [(395, 420, 400), (630, 610, 400)]
        else:
            spots_at = [(512, 330, 340), (350, 630, 340), (674, 630, 340)]
        for piece, (cx, cy, box) in zip(parts, spots_at):
            place(canvas, piece, cx, cy, box)
        save(canvas, dest)
        made.append(item_id)
    missing = [item_id for item_id, _, _ in items_table() if not (ART / f"{item_id}.jpg").exists()]
    print(f"нарисовано: {len(made)}")
    if missing:
        print("без иконки:", ", ".join(missing), file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
