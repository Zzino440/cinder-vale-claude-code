"""Build the small HD Ashford runtime pack from approved source artwork.

The source files stay untouched. Runtime images are normalized to predictable
sizes and transparency so the browser renderer can load them as a stable atlas.
"""

from __future__ import annotations

from collections import deque
from pathlib import Path

from PIL import Image


ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "assets" / "hd" / "source"
OUT = ROOT / "assets" / "hd" / "runtime"
OUT.mkdir(parents=True, exist_ok=True)


def trim(image: Image.Image, pad: int = 2) -> Image.Image:
    image = image.convert("RGBA")
    alpha = image.getchannel("A")
    box = alpha.getbbox()
    if not box:
        return image
    left = max(0, box[0] - pad)
    top = max(0, box[1] - pad)
    right = min(image.width, box[2] + pad)
    bottom = min(image.height, box[3] + pad)
    return image.crop((left, top, right, bottom))


def remove_light_background(image: Image.Image) -> Image.Image:
    """Remove only the pale connected checkerboard surrounding a prop.

    Flooding from the cell boundary avoids erasing isolated stone highlights
    inside the object itself.
    """
    image = image.convert("RGBA")
    px = image.load()
    w, h = image.size
    seen = bytearray(w * h)
    queue: deque[tuple[int, int]] = deque()

    def candidate(x: int, y: int) -> bool:
        r, g, b, _ = px[x, y]
        return min(r, g, b) >= 205 and max(r, g, b) - min(r, g, b) <= 24

    for x in range(w):
        if candidate(x, 0):
            queue.append((x, 0))
        if candidate(x, h - 1):
            queue.append((x, h - 1))
    for y in range(h):
        if candidate(0, y):
            queue.append((0, y))
        if candidate(w - 1, y):
            queue.append((w - 1, y))

    while queue:
        x, y = queue.popleft()
        i = y * w + x
        if seen[i] or not candidate(x, y):
            continue
        seen[i] = 1
        r, g, b, _ = px[x, y]
        px[x, y] = (r, g, b, 0)
        if x:
            queue.append((x - 1, y))
        if x + 1 < w:
            queue.append((x + 1, y))
        if y:
            queue.append((x, y - 1))
        if y + 1 < h:
            queue.append((x, y + 1))
    return image


def fit(image: Image.Image, size: tuple[int, int], margin: int = 2) -> Image.Image:
    image = trim(image)
    max_w, max_h = size[0] - margin * 2, size[1] - margin * 2
    scale = min(max_w / image.width, max_h / image.height)
    dst = (
        max(1, round(image.width * scale)),
        max(1, round(image.height * scale)),
    )
    image = image.resize(dst, Image.Resampling.LANCZOS)
    canvas = Image.new("RGBA", size, (0, 0, 0, 0))
    x = (size[0] - dst[0]) // 2
    y = size[1] - margin - dst[1]
    canvas.alpha_composite(image, (x, y))
    return canvas


def fit_frame_group(
    sheet: Image.Image,
    cols: int,
    rows: int,
    frame_size: tuple[int, int],
    alpha_threshold: int = 24,
) -> Image.Image:
    """Normalize a generated grid without changing scale between frames."""
    sheet = sheet.convert("RGBA")
    cell_w, cell_h = sheet.width // cols, sheet.height // rows
    cells: list[tuple[Image.Image, tuple[int, int, int, int]]] = []
    max_w = max_h = 1
    for row in range(rows):
        for col in range(cols):
            cell = sheet.crop((col * cell_w, row * cell_h, (col + 1) * cell_w, (row + 1) * cell_h))
            mask = cell.getchannel("A").point(lambda a: 255 if a >= alpha_threshold else 0)
            box = mask.getbbox() or (0, 0, cell.width, cell.height)
            cells.append((cell, box))
            max_w = max(max_w, box[2] - box[0])
            max_h = max(max_h, box[3] - box[1])

    fw, fh = frame_size
    margin = 2
    scale = min((fw - margin * 2) / max_w, (fh - margin * 2) / max_h)
    atlas = Image.new("RGBA", (fw * cols, fh * rows), (0, 0, 0, 0))
    for index, (cell, box) in enumerate(cells):
        crop = cell.crop(box)
        size = (max(1, round(crop.width * scale)), max(1, round(crop.height * scale)))
        crop = crop.resize(size, Image.Resampling.LANCZOS)
        x = (index % cols) * fw + (fw - size[0]) // 2
        y = (index // cols) * fh + fh - margin - size[1]
        atlas.alpha_composite(crop, (x, y))
    return atlas


def build_house() -> None:
    image = Image.open(SOURCE / "ashford-house.png")
    fit(image, (176, 160), 1).save(OUT / "ashford-house.png", optimize=True)


def build_hero() -> None:
    sheet = Image.open(SOURCE / "traveler-sheet.png").convert("RGBA")
    cell_w, cell_h = sheet.width // 4, sheet.height // 2
    # down, left/side, up for idle and walk-contact
    source_cells = [(0, 0), (1, 0), (2, 0), (0, 1), (1, 1), (2, 1)]
    frame_w, frame_h = 40, 56
    atlas = Image.new("RGBA", (frame_w * 3, frame_h * 2), (0, 0, 0, 0))
    for index, (cx, cy) in enumerate(source_cells):
        cell = sheet.crop((cx * cell_w, cy * cell_h, (cx + 1) * cell_w, (cy + 1) * cell_h))
        frame = fit(cell, (frame_w, frame_h), 1)
        atlas.alpha_composite(frame, ((index % 3) * frame_w, (index // 3) * frame_h))
    atlas.save(OUT / "traveler-atlas.png", optimize=True)


def build_props() -> None:
    sheet = Image.open(SOURCE / "ashford-props.png")
    cell_w, cell_h = sheet.width // 3, sheet.height // 2
    specs = [
        ("hearth-shrine.png", 0, 0, (120, 110)),
        ("handcart.png", 1, 0, (96, 64)),
        ("woodpile.png", 2, 0, (72, 56)),
        ("stone-wall.png", 0, 1, (128, 48)),
        ("barrel.png", 1, 1, (48, 56)),
        ("crate.png", 2, 1, (48, 48)),
    ]
    for filename, cx, cy, size in specs:
        cell = sheet.crop((cx * cell_w, cy * cell_h, (cx + 1) * cell_w, (cy + 1) * cell_h))
        cell = remove_light_background(cell)
        fit(cell, size, 1).save(OUT / filename, optimize=True)


def build_terrain() -> None:
    sheet = Image.open(SOURCE / "ashford-terrain.png").convert("RGB")
    cell_w, cell_h = sheet.width // 2, sheet.height // 2
    names = ["mud", "ash-grass", "cobble", "dark-earth"]
    atlas = Image.new("RGB", (128 * 4, 128), (40, 38, 38))
    for index, name in enumerate(names):
        cx, cy = index % 2, index // 2
        margin = 9
        cell = sheet.crop((
            cx * cell_w + margin,
            cy * cell_h + margin,
            (cx + 1) * cell_w - margin,
            (cy + 1) * cell_h - margin,
        ))
        cell = cell.resize((128, 128), Image.Resampling.LANCZOS)
        atlas.paste(cell, (index * 128, 0))
    atlas.save(OUT / "ashford-terrain-atlas.jpg", quality=91, optimize=True, subsampling=0)


def build_combat() -> None:
    specs = [
        ("traveler-attack-v2.png", "traveler-attack-atlas.png", 4, 1, (96, 64)),
        ("traveler-defense-v2.png", "traveler-defense-atlas.png", 4, 1, (80, 64)),
        ("traveler-mobility-magic-v2.png", "traveler-mobility-magic-atlas.png", 3, 2, (80, 64)),
        ("traveler-defeat-v2.png", "traveler-defeat-atlas.png", 3, 1, (96, 64)),
    ]
    for source_name, output_name, cols, rows, frame_size in specs:
        sheet = Image.open(SOURCE / source_name)
        fit_frame_group(sheet, cols, rows, frame_size).save(OUT / output_name, optimize=True)

    # Otto direzioni reali, senza specchiare spada e scudo. Ogni sorgente e'
    # una griglia 4x2: quattro fotogrammi d'attacco sopra, tre di difesa sotto.
    directions = ("e", "se", "s", "sw", "w", "nw", "n", "ne")
    frame_w, frame_h = 96, 64
    directional = Image.new(
        "RGBA", (frame_w * 7, frame_h * len(directions)), (0, 0, 0, 0)
    )
    for row, direction in enumerate(directions):
        source = Image.open(SOURCE / f"traveler-combat-{direction}-v3.png")
        # ImageGen puo' incorporare il motivo a scacchi nella bitmap: viene
        # rimosso prima di cercare il contorno effettivo del personaggio.
        source = remove_light_background(source)
        normalized = fit_frame_group(source, 4, 2, (frame_w, frame_h), alpha_threshold=24)
        for col in range(4):
            frame = normalized.crop(
                (col * frame_w, 0, (col + 1) * frame_w, frame_h)
            )
            directional.alpha_composite(frame, (col * frame_w, row * frame_h))
        for col in range(3):
            frame = normalized.crop(
                (col * frame_w, frame_h, (col + 1) * frame_w, frame_h * 2)
            )
            directional.alpha_composite(
                frame, ((col + 4) * frame_w, row * frame_h)
            )
    directional.save(OUT / "traveler-combat-directions-atlas.png", optimize=True)


def build_vegetation() -> None:
    trees = Image.open(SOURCE / "vegetation-trees-v2.png")
    fit_frame_group(trees, 4, 1, (128, 144), alpha_threshold=32).save(
        OUT / "vegetation-trees-atlas.png", optimize=True
    )
    ground = Image.open(SOURCE / "vegetation-ground-v2.png")
    fit_frame_group(ground, 3, 2, (64, 64), alpha_threshold=32).save(
        OUT / "vegetation-ground-atlas.png", optimize=True
    )
    stumps = Image.open(SOURCE / "vegetation-stumps-v2.png")
    fit_frame_group(stumps, 3, 1, (72, 64), alpha_threshold=32).save(
        OUT / "vegetation-stumps-atlas.png", optimize=True
    )


if __name__ == "__main__":
    build_house()
    build_hero()
    build_props()
    build_terrain()
    build_combat()
    build_vegetation()
    print(f"HD assets written to {OUT}")
