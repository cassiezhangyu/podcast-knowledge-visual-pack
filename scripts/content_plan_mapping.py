"""将已审批页面提案中的显式语义映射到正式编辑合同。"""

OUT_OF_SCOPE = 'OUT_OF_SCOPE'
PAGE_KINDS = ('cover', 'overview', 'deep_dive')


def resolve_production_scope(plan, module_ids=None, unit_ids=None):
    """读取用户指定的生产范围；缺省为整包，保持原有行为。

    pages 为 cover/overview/deep_dive 的非空子集；deep_dive_targets 可把 Deep Dive
    限定到用户点名的模块或内容单元（自由文本主题须由规划者映射到 module_ids/unit_ids
    并经用户审批）。范围外页面的细节记为 deferred_out_of_scope，不计页数。
    """
    scope = plan.get('production_scope')
    if scope is None:
        return {'pages': list(PAGE_KINDS), 'source': 'default_full_pack', 'user_words': None, 'deep_dive_targets': []}
    pages = scope.get('pages')
    if not isinstance(pages, list) or not pages or len(set(pages)) != len(pages) or any(x not in PAGE_KINDS for x in pages):
        raise ValueError('production_scope.pages 须为 cover/overview/deep_dive 的非空无重复子集。')
    if scope.get('source') != 'user_specified':
        raise ValueError('显式 production_scope 须来自用户指定（source=user_specified）。')
    targets = scope.get('deep_dive_targets') or []
    if targets and 'deep_dive' not in pages:
        raise ValueError('deep_dive_targets 只能与包含 deep_dive 的生产范围同时使用。')
    for target in targets:
        mods, units = target.get('module_ids') or [], target.get('unit_ids') or []
        if not target.get('topic') or not (mods or units):
            raise ValueError('每个 deep_dive_target 须写明 topic，并映射到至少一个 module_id 或 unit_id。')
        if module_ids is not None and any(m not in module_ids for m in mods):
            raise ValueError('deep_dive_target 引用了不存在的模块。')
        if unit_ids is not None and any(u not in unit_ids for u in units):
            raise ValueError('deep_dive_target 引用了不存在的内容单元。')
    return {'pages': [x for x in PAGE_KINDS if x in pages], 'source': 'user_specified', 'user_words': scope.get('user_words'), 'deep_dive_targets': targets}


def check_deep_dive_targets(scope, proposals, module_units):
    """有定向主题时，每张 Deep Dive 须落在某个已批准目标内。"""
    targets = scope['deep_dive_targets']
    if not targets:
        return
    for proposal in proposals:
        mods = set(proposal.get('module_ids', []))
        units = set(proposal.get('required_unit_ids', [])) | {u for m in mods for u in module_units.get(m, [])}
        if not any(mods & set(t.get('module_ids') or []) or units & set(t.get('unit_ids') or []) for t in targets):
            raise ValueError(f"Deep Dive {proposal.get('page_id')} 不在用户指定的 deep_dive_targets 内。")


def page_kind_in_scope(scope, kind):
    return kind in scope['pages']


ROLES = {'question', 'signal', 'process', 'judgment', 'practice', 'boundary', 'new_context', 'conclusion'}


def check_overview_count(plan):
    count = len(plan.get('overview_pages', []))
    if count < 1:
        raise ValueError('页面提案至少需要一张总览页。')
    ids = [page.get('page_id') for page in plan['overview_pages']]
    if not all(ids) or len(ids) != len(set(ids)):
        raise ValueError('总览页 ID 缺失或重复。')


def component_role(component):
    role = component.get('model_role')
    if role not in ROLES:
        raise ValueError(f"总览组件 {component.get('id', '<缺失 ID>')} 缺少有效 model_role；须在页面提案中明确并重新审批。")
    return role


def connector_kind(relation):
    kind = relation.get('connector_kind')
    if kind not in {'parallel_context', 'relationship'}:
        raise ValueError(f"总览关系 {relation.get('from_component')} → {relation.get('to_component')} 缺少有效 connector_kind；须在页面提案中明确并重新审批。")
    if kind == 'relationship' and not relation.get('accepted_relationship'):
        raise ValueError('确定关系须提供已审批的 accepted_relationship；不得把解释性关系静默降为并列背景。')
    return kind


def build_relationships(ledger, source_nodes, anchor_ids):
    relationships = []
    relation_map = {}
    allowed_types = {'supports', 'explains', 'illustrates', 'qualifies', 'counters', 'contrasts', 'prerequisite', 'application', 'part_of', 'evolution'}
    for index, relation in enumerate(ledger, 1):
        if connector_kind(relation) != 'relationship':
            continue
        accepted = relation['accepted_relationship']
        source_from, source_to = accepted.get('from_source_id'), accepted.get('to_source_id')
        if source_from not in source_nodes or source_to not in source_nodes:
            raise ValueError('已审批关系的端点不在知识图中')
        if accepted.get('type') not in allowed_types or accepted.get('direction') not in {'directed', 'symmetric'}:
            raise ValueError('已审批关系的类型或方向无效')
        evidence = accepted.get('evidence_anchor_ids', [])
        if not evidence or any(anchor not in anchor_ids for anchor in evidence):
            raise ValueError('已审批关系缺少有效证据锚点')
        relationship_id = 'rel_approved_' + str(index)
        relation_map[index] = relationship_id
        relationships.append({'id': relationship_id, 'from_id': source_nodes[source_from], 'to_id': source_nodes[source_to], 'type': accepted['type'], 'direction': accepted['direction'], 'epistemic_status': 'episode_synthesis', 'evidence_anchor_ids': evidence, 'confidence': 'medium', 'review_status': 'accepted'})
    return relationships, relation_map
