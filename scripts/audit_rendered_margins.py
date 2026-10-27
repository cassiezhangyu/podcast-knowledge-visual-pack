#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""测量最终合成图外留白；参数与当前scene、PNG均绑定，失败退出1。"""
import argparse
import hashlib
import json
from pathlib import Path
import numpy as np
from PIL import Image


def bound(path):
    p = Path(path).resolve()
    return {"path": str(p), "sha256": hashlib.sha256(p.read_bytes()).hexdigest()}


def measure(path, canvas):
    required = ["width", "height", "safe_left", "safe_right", "top_visible_target",
                "bottom_visible_target", "outer_vertical_tolerance", "ink_boundary_tolerance", "side_margin_tolerance"]
    if any(k not in canvas or not isinstance(canvas[k], (int, float)) or not np.isfinite(canvas[k]) for k in required):
        raise ValueError("边距参数缺项或无效，必须使用完整的当前design_tokens")
    if not (canvas["width"] > 0 and canvas["height"] > 0 and 0 <= canvas["safe_left"] < canvas["safe_right"] < canvas["width"]):
        raise ValueError("画布或安全区参数无效")
    for k in required[4:]:
        if canvas[k] < 0:
            raise ValueError("留白目标及容差不能为负")
    a = np.asarray(Image.open(path).convert("RGB")).astype(int)
    height, width = a.shape[:2]
    scale = width / canvas["width"]
    if scale <= 0 or abs(height - canvas["height"] * scale) > 0.01:
        raise ValueError("PNG尺寸比例与当前画布不符")
    mask = 765 - a.sum(axis=2) > 40
    ys, xs = np.where(mask)
    if not len(xs):
        raise ValueError("空白图不能通过边距检查")
    # 像素区间按左闭右开计，所有距离换算回画布单位。
    actual = {"left": float(xs.min() / scale), "right": float((width - xs.max() - 1) / scale),
              "top": float(ys.min() / scale), "bottom": float((height - ys.max() - 1) / scale)}
    actual["vertical_difference"] = abs(actual["top"] - actual["bottom"])
    actual["side_difference"] = abs(actual["left"] - actual["right"])
    tol = canvas["outer_vertical_tolerance"]
    tests = {
        "left_safe": {"actual": actual["left"], "minimum": canvas["safe_left"] - canvas["ink_boundary_tolerance"]},
        "right_safe": {"actual": actual["right"], "minimum": canvas["width"] - canvas["safe_right"] - canvas["ink_boundary_tolerance"]},
        "top_target": {"actual": actual["top"], "target": canvas["top_visible_target"], "tolerance": tol},
        "bottom_target": {"actual": actual["bottom"], "target": canvas["bottom_visible_target"], "tolerance": tol},
        "vertical_balance": {"actual": actual["vertical_difference"], "maximum": tol},
        "side_balance": {"actual": actual["side_difference"], "maximum": canvas["side_margin_tolerance"]},
    }
    for v in tests.values():
        v["pass"] = (abs(v["actual"] - v["target"]) <= v["tolerance"] if "target" in v
                     else v["actual"] >= v["minimum"] if "minimum" in v else v["actual"] <= v["maximum"])
    return {"size": [width, height], "scale": scale, "margins": actual, "checks": tests,
            "status": "pass" if all(v["pass"] for v in tests.values()) else "fail"}


def audit(scene, tokens, review, delivery):
    params = json.loads(Path(tokens).read_text())
    images = {key: {"artifact": bound(path), **measure(path, params["canvas"])}
              for key, path in [("review2x", review), ("delivery", delivery)]}
    return {"kind": "rendered_margin_audit", "schema_version": "1.0", "scene": bound(scene), "tokens": bound(tokens),
            "coordinate_space": "canvas", "images": images,
            "status": "pass" if all(i["status"] == "pass" for i in images.values()) else "fail"}


def main():
    p = argparse.ArgumentParser(description=__doc__)
    for name in ["scene", "design-tokens", "review-png", "delivery-png"]:
        p.add_argument("--" + name, required=True)
    p.add_argument("--out")
    a = p.parse_args()
    try:
        result = audit(a.scene, a.design_tokens, a.review_png, a.delivery_png)
    except (ValueError, KeyError, OSError) as e:
        result = {"kind": "rendered_margin_audit", "schema_version": "1.0", "status": "fail", "error": str(e)}
    body = json.dumps(result, ensure_ascii=False, indent=2) + "\n"
    if a.out:
        Path(a.out).write_text(body)
    print(body, end="")
    return 0 if result["status"] == "pass" else 1


if __name__ == "__main__":
    raise SystemExit(main())
