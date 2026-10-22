"""v0.4.7-local 每轮改动核验：上一版与本版并排图 + 可见改动清单。
声称"已改"却没有改动清单，或两图几乎无像素差，判 fail（防止"说改了其实没改"）。
用法：python3 scripts/round_diff.py --previous prev.png --current cur.png --side-by-side out.png --out record.json \
        [--diff "A：睡眠例子移到各步正文下方" ...] [--claims-changed]"""
import argparse, hashlib, json, sys
from pathlib import Path
import numpy as np
from PIL import Image, ImageDraw

MIN_CHANGED_RATIO = 0.001
sha = lambda p: hashlib.sha256(Path(p).read_bytes()).hexdigest()

def changed_ratio(a: Image.Image, b: Image.Image) -> float:
    w = 600; a = a.convert("RGB").resize((w, round(a.height * w / a.width))); b = b.convert("RGB").resize(a.size)
    d = np.abs(np.asarray(a).astype(int) - np.asarray(b).astype(int)).max(2)
    return float((d > 24).mean())

def run(prev: Path, cur: Path, sbs: Path, diffs: list[str], claims_changed: bool) -> dict:
    A, B = Image.open(prev).convert("RGB"), Image.open(cur).convert("RGB")
    h = 1600; A2 = A.resize((round(A.width * h / A.height), h)); B2 = B.resize((round(B.width * h / B.height), h))
    canvas = Image.new("RGB", (A2.width + B2.width + 40, h + 60), "white"); canvas.paste(A2, (0, 60)); canvas.paste(B2, (A2.width + 40, 60))
    dr = ImageDraw.Draw(canvas); dr.text((10, 20), f"previous: {prev.name}", fill="black"); dr.text((A2.width + 50, 20), f"current: {cur.name}", fill="black")
    sbs.parent.mkdir(parents=True, exist_ok=True); canvas.save(sbs)
    ratio = changed_ratio(A, B); diffs = [d.strip() for d in diffs if d.strip()]
    errors = []
    if claims_changed and not diffs: errors.append("声称已改，但可见改动清单为空")
    if claims_changed and ratio < MIN_CHANGED_RATIO: errors.append(f"声称已改，但两版像素差仅 {ratio:.4%}，肉眼看不出改动")
    return {"kind": "round_diff", "version": "0.4.7-local", "previous": {"path": str(prev.resolve()), "sha256": sha(prev)}, "current": {"path": str(cur.resolve()), "sha256": sha(cur)},
            "side_by_side": {"path": str(sbs.resolve()), "sha256": sha(sbs)}, "changed_pixel_ratio": round(ratio, 6), "claims_changed": claims_changed,
            "visible_diffs": diffs, "errors": errors, "status": "fail" if errors else "pass"}

def main() -> int:
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--previous", type=Path, required=True); p.add_argument("--current", type=Path, required=True)
    p.add_argument("--side-by-side", type=Path, required=True); p.add_argument("--out", type=Path)
    p.add_argument("--diff", action="append", default=[]); p.add_argument("--claims-changed", action="store_true")
    a = p.parse_args(); rec = run(a.previous, a.current, a.side_by_side, a.diff, a.claims_changed)
    t = json.dumps(rec, ensure_ascii=False, indent=2)
    if a.out: a.out.write_text(t + "\n", encoding="utf-8")
    print(t); return 0 if rec["status"] == "pass" else 1

if __name__ == "__main__": sys.exit(main())
