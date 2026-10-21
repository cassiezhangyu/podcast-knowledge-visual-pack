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
    candidates = [e for e in scene.get("elements", [])
                  if e.get("type") == "text" and not e.get("isDeleted")]
    strong = set(json.loads((Path(__file__).resolve().parents[1] / "design_tokens.json").read_text())["typography"]["strong_inner_roles"])
    unique = []
    for e in sorted(candidates, key=lambda e: (e.get("y", 0), e.get("x", 0))):
        role = e.get("customData", {}).get("typography_role")
        copy = role in strong and any(
            b.get("text") == e.get("text") and b.get("fontSize") == e.get("fontSize")
            and b.get("strokeColor") == e.get("strokeColor")
            and b.get("customData", {}).get("typography_role") == role
            and .5 <= abs(b.get("x", 0) - e.get("x", 0)) <= 1.5
            and abs(b.get("y", 0) - e.get("y", 0)) <= .5 for b in unique)
        if not copy:
            unique.append(e)
    return unique


def one_digit(e: dict) -> int | None:
    value = str(e.get("text", "")).strip()
    return int(value) if re.fullmatch(r"0*[1-9][0-9]*", value) else None


CIRCLED = "①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮⑯⑰⑱⑲⑳"
PREFIX = re.compile(r"^(?:([" + CIRCLED + r"])\s*|[（(](0*[1-9][0-9]*)[)）]\s*|(0*[1-9][0-9]*)[.、．:：)）](?![0-9])\s*)(.*)$", re.S)


def prefix(value: str) -> tuple[int, str] | None:
    match = PREFIX.match(value.strip())
    if not match:
        return None
    number = CIRCLED.index(match[1]) + 1 if match[1] else int(match[2] or match[3])
    return number, match[4].strip()


def explicit_number(e: dict) -> int | None:
    data = e.get("customData", {})
    if 'navigation_number' not in data:
        return None
    number = data['navigation_number']
    if isinstance(number, bool) or not isinstance(number, int) or number < 1:
        raise ValueError("navigation_number 必须为正整数")
    if e.get('opacity', 100) == 0 or not str(e.get('text', '')).strip():
        raise ValueError("navigation_number 必须绑定可见文字标记")
    title = data.get('navigation_label')
    if title is not None and (not isinstance(title, str) or not title.strip()
                              or title not in str(e.get('text', ''))):
        raise ValueError("navigation_label 必须是当前可见文字中的真实标题")
    visible = prefix(str(e.get('text', ''))) or ((one_digit(e), '') if one_digit(e) else None)
    if visible and visible[0] != number:
        raise ValueError("navigation_number 与可见数字不一致")
    return number


def body_number(e: dict) -> int | None:
    explicit = explicit_number(e)
    if explicit is not None:
        return explicit
    number = one_digit(e)
    if number is not None:
        return number
    parsed = prefix(str(e.get("text", "")))
    return parsed[0] if parsed else None


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
    declared_label = number.get('customData', {}).get('navigation_label')
    if declared_label:
        return {**number, "text": declared_label}
    inline = prefix(str(number.get("text", "")))
    if side == "rail" and number.get("_inline_outline_label"):
        return {**number, "text": number["_inline_outline_label"]}
    if inline and inline[1]:
        return {**number, "text": inline[1]}
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
    try:
        for element in elements:
            explicit_number(element)
    except ValueError as exc:
        result['errors'].append(str(exc))
        return result
    body: dict[int, list[tuple[dict, dict]]] = {}
    rail: dict[int, list[tuple[dict, dict]]] = {}
    for e in elements:
        for key, groups, parse in (("outline_regions", rail, body_number),
                                   ("body_regions", body, body_number)):
            region = next((r for r in regions[key] if belongs(e, r)), None)
            inline_entries = list(re.finditer(r"([" + CIRCLED + r"])\s*([^" + CIRCLED + r"]+)", str(e.get("text", "")))) if key == 'outline_regions' and explicit_number(e) is None else []
            if region is not None and len(inline_entries) > 1:
                for match in inline_entries:
                    num = CIRCLED.index(match[1]) + 1
                    part = {**e, "_inline_outline_label": match[2].strip()}
                    groups.setdefault(num, []).append((part, region))
            elif region is not None and (num := parse(e)) is not None:
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


OUTLINE_TITLE = "本页提纲"


def derive_regions(scene: dict, canvas_w: float = 1200, margin: float = 60) -> dict:
    """v0.4.5-local：从 scene 自动推导区域。提纲区＝包住“本页提纲”的最小矩形；
    正文区＝核心结论下方到页脚线上方、去掉提纲区后的上下左右四块。"""
    els = [e for e in scene.get("elements", []) if not e.get("isDeleted")]
    title = next((e for e in els if e.get("type") == "text" and str(e.get("text", "")).strip() == OUTLINE_TITLE), None)
    if title is None:
        raise ValueError("scene 中没有“本页提纲”标题，无法自动推导区域")
    boxes = [e for e in els if e.get("type") == "rectangle"
             and e["x"] <= title["x"] and e["y"] <= title["y"]
             and e["x"] + e["width"] >= title["x"] + title.get("width", 0)
             and e["y"] + e["height"] >= title["y"] + title.get("height", 0)
             and e["width"] < canvas_w - 2 * margin + 1 or False]
    boxes = [b for b in boxes if b["width"] * b["height"] < canvas_w * 1600 * 0.5]
    if not boxes:
        raise ValueError("“本页提纲”没有外框矩形，无法自动推导区域")
    nav = min(boxes, key=lambda b: b["width"] * b["height"])
    ox, oy, ow, oh = nav["x"] - 4, nav["y"] - 4, nav["width"] + 8, nav["height"] + 8
    rules = [e for e in els if e.get("type") == "line" and e.get("width", 0) > 900]
    foot = max((r["y"] for r in rules if r["y"] > 1200), default=1490)
    heads = [e["y"] for e in els if e.get("type") == "text"
             and e.get("customData", {}).get("typography_role") in ("section_entry", "overview_section")]
    top = min(min(heads, default=330) - 20, oy)
    right = canvas_w - margin
    cand = [(margin, top, right - margin, oy - top),
            (margin, oy + oh, right - margin, foot - oy - oh),
            (margin, oy, ox - margin, oh),
            (ox + ow, oy, right - ox - ow, oh)]
    body = [{"x": x, "y": y, "width": w, "height": h} for x, y, w, h in cand if w > 1 and h > 1]
    return {"derived": "auto", "outline_regions": [{"x": ox, "y": oy, "width": ow, "height": oh}], "body_regions": body}


def manual_region_errors(regions: dict, base: Path) -> list[str]:
    """手工区域须写明原因并附叠框截图；自动推导结果不需要。"""
    if regions.get("derived") == "auto":
        return []
    errs = []
    if not isinstance(regions.get("manual_reason"), str) or len(regions["manual_reason"].strip()) < 8:
        errs.append("手工区域缺少 manual_reason（为什么不能用自动推导）")
    shot = regions.get("overlay_screenshot")
    if not isinstance(shot, str) or not (base / shot).is_file():
        errs.append("手工区域缺少 overlay_screenshot（区域叠在原图上的截图）或文件不存在")
    return errs


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("scene", type=Path)
    parser.add_argument("--regions", help="正文与提纲实际区域的 JSON 文件；写 auto 则从 scene 自动推导")
    parser.add_argument("--write-regions", type=Path, help="把实际使用的区域写到此文件")
    parser.add_argument("--require-manual-provenance", action="store_true", help="手工区域必须有 manual_reason 与 overlay_screenshot")
    args = parser.parse_args()
    try:
        if args.regions == "auto":
            regions = derive_regions(json.loads(args.scene.read_text(encoding="utf-8")))
        else:
            regions = json.loads(Path(args.regions).read_text(encoding="utf-8")) if args.regions else None
        if regions is not None:
            validate_regions(regions)
        prov = manual_region_errors(regions, Path(args.regions).parent) if (args.require_manual_provenance and regions and args.regions != "auto") else []
        result = check(args.scene, regions)
        if prov:
            result["errors"] += prov; result["status"] = "fail"
        if args.write_regions and regions is not None:
            args.write_regions.write_text(json.dumps(regions, ensure_ascii=False, indent=1), encoding="utf-8")
        result["regions_mode"] = "auto" if args.regions == "auto" else ("manual" if args.regions else "legacy")
    except (OSError, ValueError, OverflowError) as exc:
        result = {"scene": str(args.scene), "status": "fail", "mapping": [],
                  "errors": [f"读取或检查失败：{exc}"], "manual_semantic_review_required": True}
    print(json.dumps(result, ensure_ascii=False, indent=2))
    return 0 if result["status"] == "pass" else 1


if __name__ == "__main__":
    raise SystemExit(main())
