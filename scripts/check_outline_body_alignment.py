#!/usr/bin/env python3
"""检查提纲编号与正文入口对应；语义和视觉质量仍须人工审核。"""

from __future__ import annotations

import argparse
import json
import math
import re
from pathlib import Path


LEGACY_REGIONS = {
    "body_regions": [{"x": 60, "y": 350, "width": 840, "height": 1100}],
    "outline_regions": [{"x": 900, "y": 990, "width": 230, "height": 460}],
}


def text_elements(scene: dict) -> list[dict]:
    return [e for e in scene.get("elements", [])
            if e.get("type") == "text" and not e.get("isDeleted")]


def one_digit(e: dict) -> int | None:
    value = str(e.get("text", "")).strip()
    return int(value) if re.fullmatch(r"[1-9][0-9]*", value) else None


def body_number(e: dict) -> int | None:
    number = one_digit(e)
    if number is not None:
        return number
    match = re.match(r"^([①②③④⑤⑥⑦⑧⑨])\s*\S", str(e.get("text", "")).strip())
    return "①②③④⑤⑥⑦⑧⑨".index(match.group(1)) + 1 if match else None


def validate_regions(regions: dict) -> None:
    if not isinstance(regions, dict):
        raise ValueError("regions 必须是 JSON 对象")
    for key in ("body_regions", "outline_regions"):
        entries = regions.get(key)
        if not isinstance(entries, list) or not entries:
            raise ValueError(f"{key} 必须是非空区域数组")
        for index, region in enumerate(entries):
            if not isinstance(region, dict):
                raise ValueError(f"{key}[{index}] 必须是区域对象")
            for field in ("x", "y", "width", "height"):
                value = region.get(field)
                if (isinstance(value, bool) or not isinstance(value, (int, float))
                        or not math.isfinite(value)):
                    raise ValueError(f"{key}[{index}].{field} 必须是有限数字")
            if region["width"] <= 0 or region["height"] <= 0:
                raise ValueError(f"{key}[{index}] 的宽度和高度必须大于 0")
            if not all(math.isfinite(region[a] + region[b])
                       for a, b in (("x", "width"), ("y", "height"))):
                raise ValueError(f"{key}[{index}] 的区域边界必须有限")
    for body in regions["body_regions"]:
        for outline in regions["outline_regions"]:
            if (max(body["x"], outline["x"]) < min(body["x"] + body["width"], outline["x"] + outline["width"])
                    and max(body["y"], outline["y"]) < min(body["y"] + body["height"], outline["y"] + outline["height"])):
                raise ValueError("正文区域与提纲区域不得交叉")


def belongs(e: dict, region: dict) -> bool:
    """按文字左上角判断区域归属，右边界和下边界不含在内。"""
    return (region["x"] <= float(e.get("x", 0)) < region["x"] + region["width"]
            and region["y"] <= float(e.get("y", 0)) < region["y"] + region["height"])


def nearby_heading(elements: list[dict], number: dict, side: str, region: dict) -> dict | None:
    inline = re.match(r"^[①②③④⑤⑥⑦⑧⑨]\s*(.+)", str(number.get("text", "")).strip())
    if side == "body" and inline:
        return number
    x0, y0 = float(number.get("x", 0)), float(number.get("y", 0))
    choices = [
        e for e in elements
        if e is not number and body_number(e) is None and belongs(e, region)
        and float(e.get("x", 0)) > x0
        and y0 - 16 <= float(e.get("y", 0)) <= y0 + 48
        and str(e.get("text", "")).strip()
    ]
    # 数字与名称可有少量基线偏移；同一行先取最近右侧名称，避免底部跨条目绑定。
    def proximity(e: dict) -> tuple:
        dy = abs(float(e.get("y", 0)) - y0)
        dx = float(e.get("x", 0)) - x0
        return (0, dx, dy) if dy <= 16 else (1, dy, dx)

    return min(choices, key=proximity) if choices else None


def label(heading: dict | None, side: str) -> str | None:
    if heading is None:
        return None
    value = str(heading["text"]).strip()
    if side == "body":
        value = re.sub(r"^[①②③④⑤⑥⑦⑧⑨]\s*", "", value)
    return value.replace("\n", " / ")


def check(path: Path, regions: dict | None = None) -> dict:
    result = {"scene": str(path), "status": "fail", "mapping": [], "errors": [],
              "manual_semantic_review_required": True}
    regions = LEGACY_REGIONS if regions is None else regions
    try:
        validate_regions(regions)
    except (ValueError, OverflowError) as exc:
        result["errors"].append(f"区域配置无效：{exc}")
        return result
    scene = json.loads(path.read_text(encoding="utf-8"))
    elements = text_elements(scene)
    body: dict[int, list[tuple[dict, dict]]] = {}
    rail: dict[int, list[tuple[dict, dict]]] = {}
    for e in elements:
        for key, groups, parse in (("outline_regions", rail, one_digit),
                                   ("body_regions", body, body_number)):
            region = next((r for r in regions[key] if belongs(e, r)), None)
            if region is not None and (num := parse(e)) is not None:
                groups.setdefault(num, []).append((e, region))
    errors = result["errors"]
    expected = list(range(1, len(rail) + 1))
    if sorted(rail) != expected:
        errors.append(f"提纲编号应连续从 1 开始，实际为 {sorted(rail)}")
    for num in sorted(set(rail) | set(body)):
        if len(rail.get(num, [])) != 1:
            errors.append(f"提纲编号 {num} 出现 {len(rail.get(num, []))} 次")
        if len(body.get(num, [])) != 1:
            errors.append(f"正文编号 {num} 出现 {len(body.get(num, []))} 次")
    if not rail:
        errors.append("缺少提纲编号")
    headings = []
    for num in sorted(set(rail) | set(body)):
        r, b = rail.get(num, []), body.get(num, [])
        rh = nearby_heading(elements, r[0][0], "rail", r[0][1]) if r else None
        bh = nearby_heading(elements, b[0][0], "body", b[0][1]) if b else None
        row = {"number": num, "rail_label": label(rh, "rail"),
               "body_heading": label(bh, "body"),
               "body_y": round(float(b[0][0]["y"])) if b else None}
        if r and rh is None:
            errors.append(f"提纲编号 {num} 附近缺提纲文字")
        if b and bh is None:
            errors.append(f"正文编号 {num} 附近缺内容标题")
        if bh is not None:
            headings.append((num, bh.get("fontSize"), bh.get("customData", {}).get("typography_role")))
        result["mapping"].append(row)
    if len({(size, role) for _, size, role in headings}) > 1:
        errors.append(f"正文同级入口标题的 fontSize / typography_role 不一致：{headings}")
    result["status"] = "pass" if not errors else "fail"
    return result


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("scene", type=Path)
    parser.add_argument("--regions", type=Path, help="正文与提纲实际区域的 JSON 文件")
    args = parser.parse_args()
    try:
        regions = json.loads(args.regions.read_text(encoding="utf-8")) if args.regions else None
        if args.regions:
            validate_regions(regions)
        result = check(args.scene, regions)
    except (OSError, ValueError, OverflowError) as exc:
        result = {"scene": str(args.scene), "status": "fail", "mapping": [],
                  "errors": [f"读取或检查失败：{exc}"], "manual_semantic_review_required": True}
    print(json.dumps(result, ensure_ascii=False, indent=2))
    return 0 if result["status"] == "pass" else 1


if __name__ == "__main__":
    raise SystemExit(main())
