#!/usr/bin/env python3
"""按本页合同核对固定外围图元；不推导布局，不判断像素或审美。"""
import argparse
import json
import sys
from pathlib import Path


def check_fixed_chrome(scene, contract):
    if "fixed_chrome" not in contract:
        return {"status": "not_declared", "reason": "本页合同未声明固定外围图元；未执行该项检查"}
    chrome = contract["fixed_chrome"]
    if not isinstance(chrome, dict) or not isinstance(chrome.get("elements"), list) or not chrome["elements"]:
        raise ValueError("fixed_chrome.elements须为非空列表；没有固定项时省略fixed_chrome")
    active = [e for e in scene.get("elements", []) if not e.get("isDeleted")]
    checked, seen, errors = [], set(), []
    for item in chrome["elements"]:
        if not isinstance(item, dict):
            raise ValueError("固定图元条目须为对象")
        element_id, purpose, expected = item.get("id"), item.get("purpose"), item.get("expected")
        if not isinstance(element_id, str) or not element_id.strip() or element_id in seen:
            raise ValueError("固定图元ID须非空且不重复")
        seen.add(element_id)
        if not isinstance(purpose, str) or not purpose.strip() or not isinstance(expected, dict) or not isinstance(expected.get("type"), str):
            raise ValueError(f"{element_id}: 须声明purpose与包含type的expected")
        matches = [e for e in active if e.get("id") == element_id]
        if len(matches) != 1:
            errors.append(f"{purpose}({element_id}): 预期1个有效图元，实际{len(matches)}个")
            continue
        element = matches[0]
        if element.get("opacity", 100) <= 0:
            errors.append(f"{purpose}({element_id}): 固定图元不可隐藏")
        for key, value in expected.items():
            if key not in element or element[key] != value:
                errors.append(f"{purpose}({element_id}): {key}与本页固定合同不符")
        checked.append({"id": element_id, "purpose": purpose, "attributes": list(expected)})
    if errors:
        raise ValueError("；".join(errors))
    return {"status": "pass", "elements": checked, "scope": "仅合同中声明的存在性与属性；真实可见性和文字间隔仍须看图"}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("scene", type=Path)
    parser.add_argument("--contract", type=Path, required=True)
    args = parser.parse_args()
    try:
        result = check_fixed_chrome(json.loads(args.scene.read_text()), json.loads(args.contract.read_text()))
    except (ValueError, OSError, TypeError) as error:
        print(json.dumps({"status": "fail", "error": str(error)}, ensure_ascii=False), file=sys.stderr)
        return 1
    print(json.dumps(result, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    sys.exit(main())
