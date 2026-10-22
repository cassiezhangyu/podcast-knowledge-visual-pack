"""v0.4.7-local 死白审计：在正文区（默认 1200×1600 坐标的 x80–1120, y330–1470，即标题/结论块以下、页脚以上）
找无墨的最大矩形。浅色底纹（纸色、#EDF2F7 一类面板色）算空。面积≥45000px² 且两边都≥90px 的空块判为死白。
任意尺寸 PNG（含 @2x）都先缩回 1200 宽坐标再算；标题/结论行尾的参差空白在正文区以外，不计。
用法：python3 scripts/audit_dead_space.py <png> [--out record.json] [--body x0,y0,x1,y1] [--exclude x,y,w,h ...]"""
import argparse, hashlib, json, sys
from pathlib import Path
import numpy as np
from PIL import Image

MIN_AREA, MIN_SIDE, CELL, BASE_W = 45000, 90, 10, 1200

def ink_mask(rgb: np.ndarray) -> np.ndarray:
    """深于 215 或饱和度差 >45 才算墨；纸色与浅色底纹不算。"""
    return (rgb.min(2) < 215) | ((rgb.max(2) - rgb.min(2)) > 45)

def empty_rects(grid: np.ndarray, top: int = 6):
    H, W = grid.shape; used = np.zeros_like(grid); out = []
    for _ in range(top):
        h = np.zeros(W, int); best = (0, 0, 0, 0, 0)
        for i in range(H):
            h = np.where(grid[i] | used[i], 0, h + 1); st = []
            for j in range(W + 1):
                cur = h[j] if j < W else 0; s = j
                while st and st[-1][1] >= cur:
                    s, hh = st.pop(); area = hh * (j - s)
                    if area > best[0]: best = (area, i - hh + 1, s, hh, j - s)
                st.append((s, cur))
        if best[0] == 0: break
        _, r, c, hh, ww = best; used[r:r + hh, c:c + ww] = True; out.append((r, c, hh, ww))
    return out

def audit(png: Path, body=(80, 330, 1120, 1470), exclude=()) -> dict:
    im = Image.open(png).convert("RGB"); scale = im.width / BASE_W
    if abs(scale - 1) > 1e-6: im = im.resize((BASE_W, round(im.height / scale)), Image.LANCZOS)
    a = np.asarray(im).astype(int); X0, Y0, X1, Y1 = body
    ink = ink_mask(a[Y0:Y1, X0:X1]).copy()
    for (x, y, w, h) in exclude:  # 显式排除区（如标题行尾）按"有墨"处理，不参与死白
        ink[max(0, y - Y0):max(0, y - Y0 + h), max(0, x - X0):max(0, x - X0 + w)] = True
    H, W = (Y1 - Y0) // CELL, (X1 - X0) // CELL
    grid = ink[:H * CELL, :W * CELL].reshape(H, CELL, W, CELL).any(axis=(1, 3))
    rects = [{"x": X0 + c * CELL, "y": Y0 + r * CELL, "w": ww * CELL, "h": hh * CELL, "area": ww * hh * CELL * CELL} for r, c, hh, ww in ((int(v) for v in t) for t in empty_rects(grid))]
    dead = [r for r in rects if r["area"] >= MIN_AREA and r["w"] >= MIN_SIDE and r["h"] >= MIN_SIDE]
    return {"kind": "dead_whitespace_audit", "version": "0.4.7-local", "png": str(png), "png_sha256": hashlib.sha256(png.read_bytes()).hexdigest(),
            "source_scale": round(scale, 4), "coordinate_space": "1200x1600", "body_region": dict(zip(["x0", "y0", "x1", "y1"], body)), "excluded": [list(e) for e in exclude],
            "thresholds": {"min_area_px2": MIN_AREA, "min_side_px": MIN_SIDE, "light_tint_is_empty": True},
            "largest_empty": rects[:4], "dead_zones": dead, "status": "fail" if dead else "pass"}

def main() -> int:
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("png", type=Path); p.add_argument("--out", type=Path)
    p.add_argument("--body", default="80,330,1120,1470"); p.add_argument("--exclude", action="append", default=[])
    a = p.parse_args()
    rec = audit(a.png, tuple(int(v) for v in a.body.split(",")), [tuple(int(v) for v in e.split(",")) for e in a.exclude])
    text = json.dumps(rec, ensure_ascii=False, indent=2)
    if a.out: a.out.write_text(text + "\n", encoding="utf-8")
    print(text); return 0 if rec["status"] == "pass" else 1

if __name__ == "__main__": sys.exit(main())
