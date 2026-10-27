#!/usr/bin/env python3
"""给用户看图用：把 @2x 图复制成文件名不含 @ 的副本，多张时生成并排对比图。

用法：python3 scripts/make_preview_copies.py --out <目录> A=<P01@2x.png> [B=<P01@2x.png> ...] [--compare-width 2400]
"""
import argparse
import json
import re
import shutil
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

FONT_CANDIDATES = [
    "/System/Library/Fonts/PingFang.ttc",
    "/System/Library/Fonts/STHeiti Medium.ttc",
    "/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc",
    "/usr/share/fonts/noto-cjk/NotoSansCJK-Regular.ttc",
    "C:/Windows/Fonts/msyh.ttc",
]


def safe_label(label):
    return re.sub(r"[^0-9A-Za-z_\-\u4e00-\u9fff]+", "-", label).strip("-") or "img"


def label_font(size):
    for path in FONT_CANDIDATES:
        if Path(path).exists():
            try:
                return ImageFont.truetype(path, size)
            except OSError:
                continue
    return ImageFont.load_default()


def side_by_side(images, labels, width, out):
    gap, band = 24, 72
    cell_w = (width - gap * (len(images) + 1)) // len(images)
    scaled = [im.resize((cell_w, round(im.height * cell_w / im.width))) for im in images]
    height = band + max(im.height for im in scaled) + gap
    canvas = Image.new("RGB", (width, height), "white")
    draw = ImageDraw.Draw(canvas)
    font = label_font(40)
    x = gap
    for im, label in zip(scaled, labels):
        draw.text((x, 16), label, fill="#273348", font=font)
        canvas.paste(im, (x, band))
        x += cell_w + gap
    canvas.save(out)


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--out", required=True, type=Path)
    parser.add_argument("--compare-width", type=int, default=2400)
    parser.add_argument("images", nargs="+", help="标签=图片路径")
    args = parser.parse_args(argv)
    args.out.mkdir(parents=True, exist_ok=True)
    labels, sources, copies = [], [], []
    for item in args.images:
        if "=" not in item:
            parser.error(f"参数须为 标签=路径：{item}")
        label, path = item.split("=", 1)
        src = Path(path)
        if not src.is_file():
            parser.error(f"图片不存在：{src}")
        name = f"{safe_label(label)}-2x.png"
        dst = args.out / name
        shutil.copyfile(src, dst)
        labels.append(label)
        sources.append(src)
        copies.append(str(dst.resolve()))
    result = {"copies": copies}
    if len(sources) > 1:
        out = args.out / ("compare-" + "-vs-".join(safe_label(x) for x in labels) + ".png")
        side_by_side([Image.open(s).convert("RGB") for s in sources], labels, args.compare_width, out)
        result["compare"] = str(out.resolve())
    print(json.dumps(result, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
