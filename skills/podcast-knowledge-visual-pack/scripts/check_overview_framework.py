"""校验总览关系读回的完整性与绑定；不自动判断图上的语义充分性。"""
import hashlib
import json
from pathlib import Path


def relation_key(item):
    return (item.get('from_component', item.get('from')),
            item.get('to_component', item.get('to')), item.get('relation_type'))


def unified_carrier_error(carrier):
    if not isinstance(carrier, dict):
        return '批准关系台账缺少 unified_carrier（全期放在同一个什么对象或系统上看）'
    if not isinstance(carrier.get('statement'), str) or not carrier['statement'].strip():
        return 'unified_carrier.statement 为空'
    if carrier.get('basis') not in ('source', 'synthesis'):
        return 'unified_carrier.basis 须为 source 或 synthesis'
    parts = carrier.get('parts')
    if not isinstance(parts, list) or len(parts) < 2 or any(
            not isinstance(p, dict) or not all(isinstance(p.get(k), str) and p[k].strip() for k in ('part', 'content'))
            for p in parts):
        return 'unified_carrier.parts 须至少两项，每项写明 part 与 content'
    if carrier.get('user_confirmed') is not True:
        return 'unified_carrier 尚未经用户在三案前确认（user_confirmed 须为 true）'
    return None


def framework_errors(check, basis, page_id):
    try:
        if not isinstance(basis, dict):
            raise ValueError('缺少构图前绑定的批准关系台账')
        raw = Path(basis['path']).read_bytes()
        if hashlib.sha256(raw).hexdigest() != basis['sha256']:
            raise ValueError('批准关系台账已变化')
        data = json.loads(raw)
        ledger = data.get('overview_relation_ledger', data.get('relations')) if isinstance(data, dict) else data
        if not isinstance(ledger, list):
            raise ValueError('批准关系台账格式无效')
        carrier_error = unified_carrier_error(data.get('unified_carrier') if isinstance(data, dict) else None)
        if carrier_error:
            raise ValueError(carrier_error)
        expected = [relation_key(r) for r in ledger if r.get('page_id', page_id) == page_id]
        if not expected or any(not all(isinstance(v, str) and v.strip() for v in k) for k in expected) or len(set(expected)) != len(expected):
            raise ValueError('本页批准关系缺失、重复或标识无效')
        if not isinstance(check, dict) or check.get('basis') != basis:
            raise ValueError('整体框架检查缺失或与批准台账绑定不同')
        if check.get('status') != 'pass' or not isinstance(check.get('framework_readback'), str) or not check['framework_readback'].strip():
            raise ValueError('整体框架未通过或缺少独立首读复述')
        rows = check.get('relations')
        if not isinstance(rows, list) or any(not isinstance(r, dict) for r in rows):
            raise ValueError('缺少必要关系逐条读回')
        actual = [relation_key(r) for r in rows]
        if len(actual) != len(expected) or set(actual) != set(expected):
            raise ValueError('必要关系读回存在遗漏、重复或额外关系')
        if any(r.get('match') is not True or any(not isinstance(r.get(k), str) or not r[k].strip() for k in ('observed', 'visible_evidence')) for r in rows):
            raise ValueError('必要关系未读出、证据缺失或存在误读')
        if check.get('missing_relations') != [] or check.get('misread_relations') != []:
            raise ValueError('整体框架仍有未解决缺口或误读')
        return []
    except (OSError, ValueError, KeyError, TypeError, AttributeError) as exc:
        return ['整体框架检查失败：' + str(exc)]
