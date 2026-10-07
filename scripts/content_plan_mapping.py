"""将已审批页面提案中的显式语义映射到正式编辑合同。"""

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
