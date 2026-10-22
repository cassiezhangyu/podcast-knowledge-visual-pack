#!/usr/bin/env python3
"""构图前参考硬门禁：正例与反例都须实际打开并写出观察，且列明允许/禁用的图形语言（v0.4.2-local）。"""
from __future__ import annotations

BAN_WORDS = ("简笔画", "火柴人")


def _text(value, field, minimum=20):
    if not isinstance(value, str) or len(value.strip()) < minimum:
        raise SystemExit(f"参考硬门禁：{field} 缺少具体文字（至少{minimum}字）。")


def check_reference_notes(plan: dict) -> None:
    inputs = plan.get("inputs") or {}
    refs = plan.get("references")
    if not isinstance(refs, list) or not refs:
        raise SystemExit("参考硬门禁：预检没有逐图参考记录。")
    for kind in ("positive", "negative"):
        listed = inputs.get(kind)
        if not isinstance(listed, list) or not listed:
            raise SystemExit(f"参考硬门禁：必须至少实际打开一张{'正例' if kind == 'positive' else '反例'}（inputs.{kind}）。")
    kinds = {r.get("kind") for r in refs if isinstance(r, dict)}
    for kind in ("positive", "negative"):
        if kind not in kinds:
            raise SystemExit(f"参考硬门禁：references 中缺少 kind={kind} 的逐图观察。")
    for i, r in enumerate(refs):
        if not isinstance(r, dict):
            raise SystemExit(f"参考硬门禁：references[{i}] 格式错误。")
        _text(r.get("observed"), f"references[{i}].observed")
        _text(r.get("effect_on_page"), f"references[{i}].effect_on_page", 10)
    if plan.get("role") == "overview":
        # 2026-10-22：正式总览基准为 EP88 三案与／或另辟西径 VOL69 三案；e248-overview 已 retired。
        overview_markers = ("ep88-overview-abc", "lingpixijing-vol69-overview-abc")
        if not any(any(m in str(r.get("path", "")) for m in overview_markers) for r in refs if r.get("kind") == "positive"):
            raise SystemExit(
                "参考硬门禁：总览必须实际查看正式基准 ep88-overview-abc 或 lingpixijing-vol69-overview-abc。"
            )
    if plan.get("role") == "cover":
        if not any("ep88-cover-user-confirmed-positive" in str(r.get("path", "")) for r in refs if r.get("kind") == "positive"):
            raise SystemExit("参考硬门禁：封面必须实际查看正式基准 ep88-cover-user-confirmed-positive。")
    for field in ("allowed_graphic_language", "forbidden_graphic_language"):
        value = plan.get(field)
        if not isinstance(value, list) or not value or not all(isinstance(v, str) and v.strip() for v in value):
            raise SystemExit(f"参考硬门禁：缺少 {field}。")
    if not any(w in v for v in plan["forbidden_graphic_language"] for w in BAN_WORDS):
        raise SystemExit("参考硬门禁：forbidden_graphic_language 必须明确禁用简笔画/火柴人。")
