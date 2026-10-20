"""复用现有输入绑定传递用户验收条件；只核记录，不判断视觉有效性。"""
import hashlib
import json
from pathlib import Path


def checked_asset(bound):
    if not isinstance(bound, dict) or not isinstance(bound.get('path'), str):
        raise ValueError('用户条件链缺少文件绑定')
    path = Path(bound['path']).resolve()
    data = path.read_bytes()
    if hashlib.sha256(data).hexdigest() != bound.get('sha256'):
        raise ValueError('用户条件链文件已变化：' + str(path))
    return {'path': str(path), 'sha256': bound['sha256']}, json.loads(data)


def requirement_ids(data):
    outcomes = data.get('required_outcomes') if isinstance(data, dict) else None
    if not isinstance(outcomes, list) or not outcomes:
        raise ValueError('用户验收条件缺少 required_outcomes')
    ids = []
    for item in outcomes:
        if not isinstance(item, dict) or not all(isinstance(item.get(k), str) and item[k].strip()
                                                 for k in ['id', 'requirement', 'verification']):
            raise ValueError('用户验收条件须有 id、requirement、verification')
        ids.append(item['id'])
    if len(set(ids)) != len(ids):
        raise ValueError('用户验收条件ID重复')
    return ids


def resolve_requirements(inputs):
    """取直接绑定及已携带的创作包/页面合同，拒绝漏传或不同版本。"""
    candidates = []
    if inputs.get('user_requirements'):
        candidates.append(inputs['user_requirements'])
    for key in ['creation_packet', 'page_contract']:
        if inputs.get(key):
            _, data = checked_asset(inputs[key])
            bound = (data.get('inputs', {}) if key == 'creation_packet' else data).get('user_requirements')
            if bound:
                candidates.append(bound)
    if not candidates:
        return None
    resolved = [checked_asset(item) for item in candidates]
    asset, data = resolved[0]
    if any(other != asset for other, _ in resolved):
        raise ValueError('用户验收条件在创作包、页面合同或预检之间版本不一致')
    if inputs.get('user_requirements') is None:
        raise ValueError('预检/创作输入漏传已登记的 user_requirements')
    requirement_ids(data)
    return asset


def check_requirements(bound, result):
    if bound is None:
        if result is not None:
            raise ValueError('用户条件审核结果缺少对应输入')
        return
    asset, data = checked_asset(bound)
    if not isinstance(result, dict) or result.get('basis') != asset:
        raise ValueError('用户条件审核未绑定当前版本')
    outcomes = result.get('results')
    ids = requirement_ids(data)
    if not isinstance(outcomes, list) or len(outcomes) != len(ids) or {x.get('id') for x in outcomes if isinstance(x, dict)} != set(ids):
        raise ValueError('用户条件未逐项审核或ID重复')
    if any(not isinstance(x, dict) or x.get('status') != 'pass' or
           not isinstance(x.get('visible_evidence'), str) or not x['visible_evidence'].strip() for x in outcomes):
        raise ValueError('用户条件存在未通过项或缺少可见证据')
