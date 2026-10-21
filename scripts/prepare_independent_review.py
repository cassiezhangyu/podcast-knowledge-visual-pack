#!/usr/bin/env python3
"""生成不含创作者自评的只读视觉审核输入包。"""
from __future__ import annotations
import argparse
import hashlib
import json
from check_typography import validate_scene
from check_strokes import check as check_strokes
from pathlib import Path
from user_requirements import resolve_requirements, check_requirements


def asset(path_string: str) -> dict:
    path = Path(path_string).expanduser().resolve()
    if not path.is_file():
        raise SystemExit(f"审核输入不存在：{path}")
    return {"path": str(path), "sha256": hashlib.sha256(path.read_bytes()).hexdigest()}


def packet_page_ids(page_id: str, manifest_page_id: str | None) -> dict:
    """审核包页号：page_id 用于核对预检/自检（如 P01）；manifest_page_id 与渲染清单页号一致，供 closeout/import 匹配。"""
    return {"page_id": page_id, "manifest_page_id": manifest_page_id or page_id}


def require_text(value: object, field: str) -> None:
    if not isinstance(value, str) or len(value.strip()) < 8:
        raise SystemExit(f"联合预检缺少具体记录：{field}")


def check_prior_approval(args: argparse.Namespace) -> dict:
    if not args.prior_approval or not args.gray:
        raise SystemExit("冻结复核必须提供原始用户验收与灰度图。")
    approval_asset = asset(args.prior_approval)
    approval = json.loads(Path(approval_asset["path"]).read_text())
    accepted = any(approval.get(key) is True for key in
                   ("accepted", "user_accepted", "user_selection_confirmed"))
    if not accepted and approval.get("status") != "accepted":
        raise SystemExit("冻结复核缺少明确的原始用户验收。")
    if approval.get("page_id") != args.page_id:
        raise SystemExit("原始用户验收的页面编号不匹配。")
    current = approval.get("current", approval.get("shown"))
    if not isinstance(current, dict):
        raise SystemExit("原始用户验收缺少当前四工件绑定。")
    hashes = current.get("hashes", current)
    outputs = current.get("outputs", current)
    for key, path in (("scene", args.scene), ("png", args.png),
                      ("phone", args.phone), ("gray", args.gray)):
        declared = hashes.get(key, outputs.get(key))
        if isinstance(declared, dict):
            declared = declared.get("sha256")
        if declared != asset(path)["sha256"]:
            raise SystemExit(f"冻结复核工件与原始用户验收不一致：{key}")
    return approval_asset


def check_preflight(path_string: str, args: argparse.Namespace, references: list[dict], content: dict, taste: dict, tokens: dict) -> dict:
    preflight_asset = asset(path_string)
    if not args.revalidate_existing and Path(preflight_asset["path"]).stat().st_mtime > Path(args.scene).expanduser().resolve().stat().st_mtime:
        raise SystemExit("联合预检文件晚于当前 scene；不得在作图后补签。")
    preflight = json.loads(Path(preflight_asset["path"]).read_text())
    try:
        resolve_requirements(preflight.get('inputs', {}))
    except (OSError, ValueError) as exc:
        raise SystemExit(str(exc)) from exc
    for key, expected in {"page_id": args.page_id, "role": args.role, "content_sha256": content["sha256"], "taste_sha256": taste["sha256"], "design_tokens_sha256": tokens["sha256"]}.items():
        if preflight.get(key) != expected:
            raise SystemExit(f"联合预检与当前输入不一致：{key}")
    if args.role == 'overview':
        basis = preflight.get('inputs', {}).get('framework_basis')
        if not isinstance(basis, dict) or asset(basis.get('path', '')) != basis:
            raise SystemExit('总览预检缺少当前批准关系台账 inputs.framework_basis，或其绑定已失效。')
    expected_status = "completed_before_existing_artwork_review" if args.revalidate_existing else "completed_before_construction"
    if preflight.get("status") != expected_status:
        raise SystemExit("联合预检必须在构图前完成，不能事后补签。")
    if args.revalidate_existing and Path(preflight_asset["path"]).stat().st_mtime > Path(args.page_check).expanduser().resolve().stat().st_mtime:
        raise SystemExit("冻结复核预检必须早于本次成图自检。")
    observed = preflight.get("references")
    if not isinstance(observed, list) or len(observed) != len(references):
        raise SystemExit("联合预检的正反案例清单不完整。")
    expected_refs = {(item["path"], item["sha256"]) for item in references}
    observed_refs = {(str(Path(item["path"]).expanduser().resolve()), item.get("sha256")) for item in observed if isinstance(item, dict) and isinstance(item.get("path"), str)}
    if observed_refs != expected_refs:
        raise SystemExit(f"联合预检的案例路径或哈希与送审输入不一致：期望 {sorted(expected_refs)}；实际 {sorted(observed_refs)}")
    for index, item in enumerate(observed):
        require_text(item.get("observed"), f"references[{index}].observed")
        require_text(item.get("effect_on_page"), f"references[{index}].effect_on_page")
    for field in ("main_visual_explanation", "reading_path", "text_graphic_split", "mobile_type_plan"):
        require_text(preflight.get(field), field)
    if args.role in ("overview", "deep_dive"):
        relations = preflight.get("module_relations")
        if not isinstance(relations, list) or not relations:
            raise SystemExit("联合预检缺少页内模块关系。")
        for index, relation in enumerate(relations):
            if not isinstance(relation, dict):
                raise SystemExit(f"联合预检页内关系格式错误：module_relations[{index}]")
            for field in ("from", "to", "relation_type", "reader_question", "forbidden_reading"):
                value = relation.get(field)
                if field in ("from", "to", "relation_type", "forbidden_reading"):
                    if not isinstance(value, str) or not value.strip():
                        raise SystemExit(f"联合预检缺少页内模块名称：module_relations[{index}].{field}")
                else:
                    require_text(value, f"module_relations[{index}].{field}")
    color_roles = preflight.get("color_role_plan")
    if not isinstance(color_roles, dict):
        raise SystemExit("联合预检缺少本期颜色职责表。")
    for role in ("ink", "primary", "accent", "weak"):
        require_text(color_roles.get(role), f"color_role_plan.{role}")
    forbidden = preflight.get("forbidden_patterns")
    if not isinstance(forbidden, list) or not forbidden:
        raise SystemExit("联合预检必须列出本页禁用的失败画法。")
    for index, pattern in enumerate(forbidden):
        if not isinstance(pattern, str) or not pattern.strip():
            raise SystemExit(f"联合预检缺少失败画法：forbidden_patterns[{index}]")
    return preflight_asset


def check_rendered_page(path_string: str, args: argparse.Namespace, scene: dict, png: dict) -> dict:
    check_asset = asset(path_string)
    check = json.loads(Path(check_asset["path"]).read_text())
    for field, expected in {"page_id": args.page_id, "scene_sha256": scene["sha256"], "png_sha256": png["sha256"], "status": "submitted_for_independent_review"}.items():
        if check.get(field) != expected:
            raise SystemExit(f"成图自检未通过或与当前图片不一致：{field}")
    checks = check.get("checks")
    for field in ("content_coverage", "visual_explanation", "reference_alignment", "text_geometry", "mobile_readability"):
        item = checks.get(field) if isinstance(checks, dict) else None
        if not isinstance(item, dict) or item.get("status") != "pass":
            raise SystemExit(f"成图自检未通过：{field}")
        require_text(item.get("visible_evidence"), f"checks.{field}.visible_evidence")
    return check_asset


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--page-id", required=True)
    parser.add_argument("--manifest-page-id", default=None, help="渲染清单中的页号（如 edp_overview_…）；缺省同 --page-id")
    parser.add_argument("--role", required=True, choices=["cover", "overview", "deep_dive"])
    parser.add_argument("--creator-context-id", required=True)
    parser.add_argument("--scene", required=True)
    parser.add_argument("--png", required=True)
    parser.add_argument("--phone", required=True)
    parser.add_argument("--content", required=True)
    parser.add_argument("--positive", required=True, action="append")
    parser.add_argument("--negative", required=True, action="append")
    parser.add_argument("--taste", required=True)
    parser.add_argument("--design-tokens", required=True)
    parser.add_argument("--mechanical-check", required=True)
    parser.add_argument("--preflight", required=True)
    parser.add_argument("--page-check", required=True)
    parser.add_argument("--design-gates", required=True)
    parser.add_argument("--review-protocol", required=True)
    parser.add_argument("--output", required=True)
    parser.add_argument("--revalidate-existing", action="store_true")
    parser.add_argument("--prior-approval")
    parser.add_argument("--gray")
    args = parser.parse_args()

    if len(args.creator_context_id.strip()) < 2:
        raise SystemExit("必须记录真实的创作任务 ID。")
    if not args.revalidate_existing and args.prior_approval:
        raise SystemExit("原始用户验收参数仅用于明确的冻结复核分支。")
    prior_approval = check_prior_approval(args) if args.revalidate_existing else None

    scene_asset = asset(args.scene)
    scene = json.loads(Path(scene_asset["path"]).read_text())
    images = [item for item in scene.get("elements", []) if item.get("type") == "image"]
    if images or scene.get("files"):
        raise SystemExit("当前 scene 含 image 元素或嵌入文件，不能送审。")
    content = asset(args.content)
    taste = asset(args.taste)
    tokens = asset(args.design_tokens)
    typography = json.loads(Path(tokens["path"]).read_text())["typography"]
    _, type_errors = validate_scene(scene, typography["role_sizes"], set(typography["strong_inner_roles"]))
    if type_errors:
        raise SystemExit("字号层级检查失败：" + "; ".join(type_errors))
    stroke_roles = json.loads(Path(tokens["path"]).read_text())["stroke"]["role_settings"]
    stroke_errors = check_strokes(Path(scene_asset["path"]), stroke_roles)
    if stroke_errors:
        raise SystemExit("笔触角色检查失败：" + "; ".join(stroke_errors))
    positive = [asset(path) for path in args.positive]
    negative = [asset(path) for path in args.negative]
    preflight = check_preflight(args.preflight, args, positive + negative, content, taste, tokens)
    png = asset(args.png)
    mechanical = asset(args.mechanical_check)
    record = json.loads(Path(mechanical['path']).read_text())
    required = {'preconstruction_reference_plan', 'native_scene', 'typography_roles_sizes_strong_weight', 'stroke_roles', 'static_text_geometry', 'reader_facing_text', 'outline_alignment', 'current_input_bindings', 'same_scene_real_export'}
    passed = {c.get('name') for c in record.get('checks', []) if c.get('status') == 'pass'}
    if record.get('kind') != 'mechanical_render_record' or record.get('status') != 'pass' or not required <= passed:
        raise SystemExit('强制机械导出记录缺项或未通过')
    for key, expected in [('scene', scene_asset), ('png', png), ('phone', asset(args.phone)), ('gray', asset(args.gray) if args.gray else None)]:
        if expected is None or record.get('current', {}).get(key) != expected:
            raise SystemExit('强制导出记录与当前工件不一致：' + key)
    for key in ['tokens', 'preflight', 'renderer', 'brand_asset']:
        bound = record.get(key, {})
        if not bound.get('path') or asset(bound['path']) != bound:
            raise SystemExit('强制导出输入已变化：' + key)
    outline = record.get('outline_check', {})
    if args.role in ['overview', 'deep_dive']:
        bound = outline.get('regions', {})
        if outline.get('status') != 'pass' or not bound.get('path') or asset(bound['path']) != bound:
            raise SystemExit('提纲区域缺失、未检查或已变化')
    elif outline != {'status': 'not_applicable', 'reason': 'cover'}:
        raise SystemExit('提纲检查适用范围无效')
    if record['tokens'] != tokens or record['preflight'] != preflight:
        raise SystemExit('送审与导出使用的规范或预检不同')
    page_check = check_rendered_page(args.page_check, args, scene_asset, png)
    requirements = resolve_requirements(json.loads(Path(preflight['path']).read_text()).get('inputs', {}))
    try:
        check_requirements(requirements, json.loads(Path(page_check['path']).read_text()).get('user_requirements_check'))
    except (OSError, ValueError) as exc:
        raise SystemExit(str(exc)) from exc
    packet = {
        "kind": "independent_visual_review_packet",
        **packet_page_ids(args.page_id, args.manifest_page_id),
        "role": args.role,
        "creator_context_id": args.creator_context_id,
        "creator_notes_included": False,
        "current": {"scene": scene_asset, "png": png, "phone": asset(args.phone), "gray": asset(args.gray)},
        "content": content,
        "positive": positive,
        "negative": negative,
        "standards": {
            "quality_criteria": asset(Path(__file__).resolve().parents[1] / "rules/visual_reasoning.md"),
            "taste": taste,
            "design_tokens": tokens,
            "design_gates": asset(args.design_gates),
            "review_protocol": asset(args.review_protocol),
        },
        "mechanical_render_record": mechanical,
        "preflight_sha256": preflight["sha256"],
        "rendered_page_check_sha256": page_check["sha256"],
        "instruction": "独立只读审核。先打开原图与手机图固化读回，再对照内容、实际正反参考、quality_criteria第1节、taste及当前合同；使用与创作相同的标准判定TARGET/REJECT-A/REJECT-B。只作独立复核与兜底，不代替创作者完成基本设计。不读取作者方案、自评、预期答案或版本说明，不修改文件。",
    }
    if record.get('current', {}).get('delivery'):
        bound = record['current']['delivery']
        if asset(bound['path']) != bound:
            raise SystemExit('高清导出图已变化')
        packet['current']['delivery'] = bound
    if requirements:
        packet['standards']['user_requirements'] = requirements
    diagnostics = record.get('diagnostics', {})
    for key, bound in diagnostics.items():
        if asset(bound['path']) != bound:
            raise SystemExit('导出诊断已变化：' + key)
    if diagnostics:
        packet['diagnostics'] = diagnostics
    output = Path(args.output).expanduser().resolve()
    if args.role == 'overview':
        packet['framework_basis'] = json.loads(Path(preflight['path']).read_text())['inputs']['framework_basis']
    output.parent.mkdir(parents=True, exist_ok=True)
    color_path = output.with_name(output.stem + "-color-roles.json")
    color_path.write_text(json.dumps(json.loads(Path(preflight["path"]).read_text())["color_role_plan"], ensure_ascii=False, indent=2) + "\n")
    packet["standards"]["color_role_plan"] = asset(str(color_path))
    if prior_approval:
        packet["review_mode"] = "frozen_existing_artwork_revalidation"
        packet["prior_user_approval"] = prior_approval
        packet["current"]["gray"] = asset(args.gray)
    output.write_text(json.dumps(packet, ensure_ascii=False, indent=2) + "\n")
    print(json.dumps({"packet": str(output), "png_sha256": packet["current"]["png"]["sha256"]}, ensure_ascii=False))


if __name__ == "__main__":
    main()
