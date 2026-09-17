"""把「图标」目录里的 1000px PNG 做成 Android 桌面图标。"""
from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent.parent
SOURCE = ROOT / "图标" / "web_asset_1000dp_1F1F1F_FILL0_wght400_GRAD0_opsz48.png"
RES = ROOT / "android" / "app" / "src" / "main" / "res"
WHITE = (255, 255, 255, 255)

MIPMAP_SIZES = {
    "mipmap-mdpi": 48,
    "mipmap-hdpi": 72,
    "mipmap-xhdpi": 96,
    "mipmap-xxhdpi": 144,
    "mipmap-xxxhdpi": 192,
}
FOREGROUND_SIZES = {
    "drawable-mdpi": 108,
    "drawable-hdpi": 162,
    "drawable-xhdpi": 216,
    "drawable-xxhdpi": 324,
    "drawable-xxxhdpi": 432,
}


def content_glyph(src: Image.Image) -> Image.Image:
    alpha = src.split()[-1]
    bbox = alpha.getbbox()
    if not bbox:
        raise SystemExit("源图没有可见内容")
    return src.crop(bbox)


def fit_glyph(glyph: Image.Image, canvas_size: int, target: int) -> Image.Image:
    canvas = Image.new("RGBA", (canvas_size, canvas_size), (0, 0, 0, 0))
    scale = min(target / glyph.width, target / glyph.height)
    new_size = (
        max(1, round(glyph.width * scale)),
        max(1, round(glyph.height * scale)),
    )
    resized = glyph.resize(new_size, Image.Resampling.LANCZOS)
    x = (canvas_size - resized.width) // 2
    y = (canvas_size - resized.height) // 2
    canvas.paste(resized, (x, y), resized)
    return canvas


def make_legacy(glyph: Image.Image, size: int, round_icon: bool) -> Image.Image:
    canvas = Image.new("RGBA", (size, size), WHITE)
    # 四周约 18% 边距，避免圆角裁切
    icon = fit_glyph(glyph, size, int(size * 0.64))
    canvas = Image.alpha_composite(canvas, icon)
    if round_icon:
        mask = Image.new("L", (size, size), 0)
        ImageDraw.Draw(mask).ellipse((0, 0, size - 1, size - 1), fill=255)
        canvas.putalpha(mask)
    return canvas


def save_png(image: Image.Image, path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    image.save(path, format="PNG")


def main() -> None:
    if not SOURCE.exists():
        raise SystemExit(f"找不到源图：{SOURCE}")

    glyph = content_glyph(Image.open(SOURCE).convert("RGBA"))
    vector = RES / "drawable" / "ic_launcher_foreground.xml"
    if vector.exists():
        vector.unlink()

    for folder, size in FOREGROUND_SIZES.items():
        safe = int(size * 72 / 108)
        foreground = fit_glyph(glyph, size, int(safe * 0.88))
        save_png(foreground, RES / folder / "ic_launcher_foreground.png")

    for folder, size in MIPMAP_SIZES.items():
        save_png(make_legacy(glyph, size, False), RES / folder / "ic_launcher.png")
        save_png(make_legacy(glyph, size, True), RES / folder / "ic_launcher_round.png")

    print(f"已从 {SOURCE.name} 生成桌面图标")


if __name__ == "__main__":
    main()
