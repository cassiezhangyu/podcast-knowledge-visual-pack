# coding: utf-8
"""从当前已审批内容及页面提案组装正式产物，不包含节目专属语义。"""
import argparse
import hashlib
import json
import subprocess
from pathlib import Path
from content_plan_mapping import check_overview_count, component_role, connector_kind, build_relationships

parser=argparse.ArgumentParser()
parser.add_argument('--workspace',required=True)
args=parser.parse_args()
root=Path(__file__).resolve().parents[1];w=Path(args.workspace).resolve();out=w/'01-understanding'
def read(name):return json.loads((out/name).read_text())
def sha(x):return hashlib.sha256(json.dumps(x,ensure_ascii=False,separators=(',',':')).encode()).hexdigest()
def check(condition,message):
    if not condition:raise ValueError(message)
# 复算源QA，拒绝只信旧文件的pass。
subprocess.run(['node','--input-type=module','-e','import {assertCurrentGroundedTranscriptQa} from "./dist/grounded-transcript-qa.js";assertCurrentGroundedTranscriptQa(process.argv[1]);',str(w)],cwd=root,check=True)
i=read('episode_content_inventory.json');s=read('content_split.json');sc=read('content_split_coverage.json');p=read('page_content_plan_proposal.json');pc=read('page_content_coverage_proposal.json')
check_overview_count(p)
visual_page_count=1+len(p['overview_pages'])+len(p['deep_dive_proposals'])+(1 if p.get('companion_appendix') else 0)
check(visual_page_count<=18,f'整包页数超上限：当前 {visual_page_count} 张，最多 18 张；须先重排并重新审批页面规划')
a=read('page_content_plan_human_approval.json');ia=read('content_review_human_approval.json');sa=read('content_split_human_approval.json')
grounded=json.loads((w/'00-source/transcript_grounded.json').read_text());meta=json.loads((w/'00-source/episode_metadata.json').read_text());manifest=json.loads((w/'00-source/audio_manifest.json').read_text())
for name in ['content_review_gate.json','content_split_gate.json']:check(read(name)['status']=='pass','上游内容未通过')
for approval in [a,ia,sa]:check(approval['status']=='accepted','缺少人工审批')
for name,value in [('episode_content_inventory',i),('grounded_transcript',grounded)]:check(ia['artifact_hashes'][name]==sha(value),'梳理审批过时')
check(ia['artifact_hashes']['content_review_document']==hashlib.sha256((out/'内容梳理.md').read_bytes()).hexdigest(),'梳理文档审批过时')
for name,value in [('episode_content_inventory',i),('content_split',s),('content_split_coverage',sc)]:check(sa['artifact_hashes'][name]==sha(value),'拆分审批过时')
check(sa['artifact_hashes']['content_split_document']==hashlib.sha256((out/'内容拆分.md').read_bytes()).hexdigest(),'拆分文档审批过时')
for name,value in [('page_content_plan_proposal',p),('page_content_coverage_proposal',pc)]:check(a['artifact_hashes'][name]==sha(value),'规划审批过时')
for key,name in [('episode_content_inventory_sha256','episode_content_inventory.json'),('content_split_sha256','content_split.json'),('content_split_coverage_sha256','content_split_coverage.json'),('content_review_gate_sha256','content_review_gate.json'),('content_split_gate_sha256','content_split_gate.json'),('content_review_human_approval_sha256','content_review_human_approval.json'),('content_split_human_approval_sha256','content_split_human_approval.json')]:check(p['input'][key]==sha(read(name)),'规划上游绑定过时')
check(pc['page_content_plan_sha256']==sha(p),'覆盖绑定过时')
units={u['id']:u for u in i['content_units']};details={d['id']:(u['id'],d) for u in units.values() for d in u['supporting_details']}
placements={e['detail_id']:e['page_id'] for e in pc['entries']};check(len(pc['entries'])==len(placements)==len(details) and set(placements)==set(details),'主去向缺失或重复')
anchor_ids={a['id'] for a in i['evidence_anchors']}
slug=meta['episode']['id'];prefix='edp_'+slug;cover_id='edp_cover_'+slug
overview_ids=['edp_overview_'+slug+('_'+str(k+1).zfill(2) if k else '') for k in range(len(p['overview_pages']))]
page_map={p['cover']['page_id']:cover_id,**{x['page_id']:overview_ids[k] for k,x in enumerate(p['overview_pages'])},**{x['page_id']:'edp_dd_'+slug+'_'+x['page_id'].lower() for x in p['deep_dive_proposals']}}
check(len(page_map)==1+len(p['overview_pages'])+len(p['deep_dive_proposals']),'页面提案 ID 缺失或重复')
overview_source_ids={x['page_id'] for x in p['overview_pages']}
for relation in p['overview_relation_ledger']:
    check(relation.get('page_id',next(iter(overview_source_ids)) if len(overview_source_ids)==1 else None) in overview_source_ids,'总览关系缺少有效 page_id')
appendix_ids={p['companion_appendix']['page_id']} if p.get('companion_appendix') else set()
check(all(pid in page_map or pid in appendix_ids for pid in placements.values()),'未知页面去向')
now=a['reviewed_at'];date=now[:10];execution={'kind':'current_skill_execution_model','model_id':None,'runtime_id':None,'identity_status':'not_exposed_by_host'}
base={'schema_version':'1.0','kind':'knowledge_base','status':'completed','cache_key':sha({'inventory':sha(i),'split':sha(s),'approval':sha(a)}),'input':{'audio_sha256':manifest['content_identity']['sha256'],'grounded_transcript_sha256':sha(grounded),'corrections_sha256':grounded['corrections_sha256']},'execution':execution,'windows':[{'id':'approved_inventory','span_count':len(grounded['spans']),'source':'episode_content_inventory.json'}],'units':i['content_units'],'coverage_audit':{'total_spans':len(grounded['spans']),'bands':i['coverage_segments']}}
prefixes={'claim':'clm','mechanism':'mech','example':'ex','boundary':'bnd','counterpoint':'ctr'}
nodes=[];node_map={};module_map={}
for did,(uid,d) in details.items():
    check(all(x in anchor_ids for x in d['evidence_anchor_ids']),'悬空证据锚点')
    kind=d['kind'] if d['kind'] in prefixes else 'observation';nid=prefixes.get(kind,'obs')+'_'+did;node_map[did]=nid
    nodes.append({'id':nid,'kind':kind,'statement':d['statement'],'epistemic_status':'source_explicit','speaker_ref':None,'evidence_anchor_ids':d['evidence_anchor_ids'],'derived_from_ids':[uid,did],'confidence':'medium','uncertainty':'已审批源梳理的转述；不自动认定逐句说话人，数字、事件与概念继续保留来源边界。','review_status':'accepted','high_impact':False})
def anchors_for(dids):return list(dict.fromkeys(a for did in dids for a in details[did][1]['evidence_anchor_ids']))
for m in s['modules']:
    nid='clm_'+m['id'];module_map[m['id']]=nid
    nodes.append({'id':nid,'kind':'claim','statement':m['conclusion'],'epistemic_status':'episode_synthesis','speaker_ref':None,'evidence_anchor_ids':anchors_for(m['required_detail_ids']),'derived_from_ids':m['source_unit_ids'],'confidence':'medium','uncertainty':'用户确认的内容重组，非原文逐字陈述或已证实普遍因果。','review_status':'accepted','high_impact':False})
all_anchors=anchors_for(list(details))
source_nodes={**node_map,**module_map}
relationships,relation_map=build_relationships(p['overview_relation_ledger'],source_nodes,anchor_ids)
graph={'schema_version':'1.0','kind':'knowledge_graph','status':'completed','knowledge_base_sha256':sha(base),'episode_thesis':{'id':'clm_episode_thesis','statement':s['thesis'],'epistemic_status':'episode_synthesis','evidence_anchor_ids':all_anchors,'confidence':'medium','review_status':'accepted'},'core_questions':[m['question'] for m in s['modules']],'evidence_anchors':i['evidence_anchors'],'nodes':nodes,'relationships':relationships,'coverage_audit':{'bands':i['coverage_segments'],'unit_dispositions':sc['unit_dispositions']},'relationship_decisions':[{'candidate_id':'rel_guardrail_'+str(k+1),'status':'rejected','reason':r['forbidden_reading']} for k,r in enumerate(p['overview_relation_ledger'])]}
kgate={'schema_version':'1.0','kind':'knowledge_gate','status':'pass','knowledge_graph_sha256':sha(graph),'checks':[{'name':'approved_source_chain','status':'pass','details':{'inventory':sha(i),'split':sha(s),'grounded':sha(grounded)}},{'name':'detail_and_anchor_resolution','status':'pass','details':{'details':len(details)}}],'high_impact_inference_ids':[],'human_review_required':False,'human_review':{'status':'pass','reviewed_on':date,'scope':'已批准内容的重排与身份校验，不证明全音频人工听证或外部事实成立。'}}
overview_pages=[]
for overview_index,ov in enumerate(p['overview_pages']):
    components=[];component_map={};component_unit_map={}
    for k,x in enumerate(ov['mental_model_components'],1):
        check(x['id'] not in component_map,'总览组件 ID 重复')
        cid='omc_'+str(overview_index+1)+'_'+str(k);component_map[x['id']]=cid;component_unit_map[cid]=set(x['source_unit_ids'])
        dids=[d['id'] for uid in x['source_unit_ids'] for d in units[uid]['supporting_details'] if d['kind'] in ['claim','mechanism','boundary']]
        check(bool(dids),'总览组件缺少可映射的知识细节')
        components.append({'id':cid,'role':component_role(x),'knowledge_ids':[node_map[d] for d in dids],'evidence_anchor_ids':anchors_for(dids),'statement':x['statement']})
    connectors=[]
    for k,r in enumerate(p['overview_relation_ledger'],1):
        relation_page=r.get('page_id')
        if len(p['overview_pages'])>1:check(relation_page is not None,'多页总览的关系台账须明确 page_id')
        if relation_page is not None and relation_page!=ov['page_id']:continue
        check(r['from_component'] in component_map and r['to_component'] in component_map,'总览关系引用未知组件')
        connectors.append({'from_component_id':component_map[r['from_component']],'to_component_id':component_map[r['to_component']],'kind':connector_kind(r),'relationship_id':relation_map.get(k),'reason':r['relation_type']+'；'+r['forbidden_reading']})
    overview_pages.append({'page_id':page_map[ov['page_id']],'display_order':overview_index+1,'role':'whole_picture','page_question':ov['question'],'takeaway':ov['takeaway'],'mental_model_statement':ov['reader_recall'],'model_components':components,'model_connectors':connectors,'deep_dive_map':[{'deep_dive_page_id':page_map[x['page_id']],'component_ids':[cid for cid,us in component_unit_map.items() if us.intersection(x['required_unit_ids']) or {m['id'] for m in s['modules'] if us.intersection(m['source_unit_ids'])}.intersection(x['module_ids'])],'reason':'批准页面问题与总览维度的交叉位置，不假定一一对应。'} for x in p['deep_dive_proposals'] if any(us.intersection(x['required_unit_ids']) or {m['id'] for m in s['modules'] if us.intersection(m['source_unit_ids'])}.intersection(x['module_ids']) for us in component_unit_map.values())],'derived_from_ids':['clm_episode_thesis']+list(module_map.values()),'evidence_anchor_ids':all_anchors,'information_budget':{'primary_proposition_max':1,'max_independent_ideas':5,'required_elements':['question','claim','mechanism','relationship','boundary']}})
deep=[]
for order,x in enumerate(p['deep_dive_proposals'],1+len(overview_pages)):
    check(set(x['required_detail_ids'])=={d for step in x['argument_path'] for field in ['claim_and_mechanism_detail_ids','case_detail_ids','boundary_detail_ids'] for d in step[field]},'页内论证映射不完整')
    deep.append({'page_id':page_map[x['page_id']],'display_order':order,'role':'opening' if order==1+len(overview_pages) else 'closing' if order==len(p['deep_dive_proposals'])+len(overview_pages) else 'deepen','page_question':x['question'],'takeaway':x['takeaway'],'primary_knowledge_ids':[module_map[mid] for mid in x['module_ids']],'primary_relationship_ids':[],'supporting_knowledge_ids':[node_map[d] for d in x['required_detail_ids']],'evidence_anchor_ids':x['evidence_anchor_ids'],'coverage':[{'page_id':page_map[x['page_id']],'coverage':'explain','reason':x['preservation_contract']}],'argument_preconditions':overview_ids,'order_rationale':x['page_necessity']['versus_previous'],'information_budget':{'primary_proposition_max':1,'max_independent_ideas':4,'required_elements':['claim','mechanism','example','boundary','question']}})
package={'package_thesis':{'statement':s['thesis'],'epistemic_status':'episode_synthesis','derived_from_ids':['clm_episode_thesis'],'evidence_anchor_ids':all_anchors,'confidence':'medium','uncertainty':'已批准的节目级综合判断；不把未证实的关系表述为普遍事实。'},'cover':{'page_id':cover_id,'display_order':0,'role':'package_entry','title':meta['episode']['title'],'subtitle':p['cover']['subtitle'],'derived_from_ids':list(module_map.values()),'evidence_anchor_ids':all_anchors,'epistemic_status':'episode_synthesis','confidence':'medium','uncertainty':'原标题保留完整；副标题是已批准编辑提炼。'},'overview':overview_pages[0],'overview_continuations':overview_pages[1:],'deep_dives':deep}
matrix_entries=[]
def entry(kind,nid,role,status,confidence,disposition,pids,reason):
    matrix_entries.append({'target':{'kind':kind,'id':nid},'argument_role':role,'input_epistemic_status':status,'input_confidence':confidence,'disposition':disposition,'rationale':reason,'placements':[{'page_id':pid,'coverage':'boundary' if role=='boundary' else 'explain','reason':reason} for pid in pids],'review_status':'accepted'})
entry('thesis','clm_episode_thesis','central','episode_synthesis','medium','overview_core',overview_ids,'批准的节目主命题及明确归因的开放收束。')
for m in s['modules']:
    pids=[page_map[x['page_id']] for x in p['deep_dive_proposals'] if m['id'] in x['module_ids']]
    entry('core_question','cq_'+sha(m['question'])[:16],'central','episode_synthesis','medium','deep_dive_primary',pids,'按批准页面分工展开模块的独立问题。')
for n in nodes:
    if n['id'] in module_map.values():
        mid=next(mid for mid,nid in module_map.items() if nid==n['id']);pids=[page_map[x['page_id']] for x in p['deep_dive_proposals'] if mid in x['module_ids']];entry('node',n['id'],'central',n['epistemic_status'],'medium','deep_dive_primary',pids,'批准模块的结论与各页具体解释。');continue
    did=n['derived_from_ids'][1];pid=placements[did];role='boundary' if n['kind']=='boundary' else 'example' if n['kind']=='example' else 'supporting'
    entry('node',n['id'],role,n['epistemic_status'],'medium','not_paged_with_reason' if pid in appendix_ids else 'boundary_retained' if role=='boundary' else 'overview_core' if pid in overview_source_ids else 'deep_dive_support',[] if pid in appendix_ids else [page_map[pid]],'已批准伴读附录保留：'+pid+'，不是删除。' if pid in appendix_ids else '批准细节的唯一主去向；二次提及见页面规划。')
for r in graph['relationship_decisions']:entry('relationship_decision',r['candidate_id'],'boundary','not_applicable','not_applicable','guardrail_reference',[],r['reason'])
for k,r in enumerate(p['overview_relation_ledger'],1):
    if k in relation_map:
        relation=next(item for item in relationships if item['id']==relation_map[k])
        pid=r.get('page_id',p['overview_pages'][0]['page_id'])
        entry('relationship',relation['id'],'supporting',relation['epistemic_status'],relation['confidence'],'overview_core',[page_map[pid]],'已审批的组件间知识关系。')
matrix={'schema_version':'1.0','kind':'coverage_matrix','editorial_plan_id':prefix+'_approved','knowledge_graph_sha256':sha(graph),'entries':matrix_entries}
inputs={'knowledge_graph_sha256':sha(graph),'knowledge_gate_sha256':sha(kgate),'knowledge_base_sha256':sha(base),'audio_sha256':manifest['content_identity']['sha256'],'episode_metadata_sha256':sha(meta)}
editorial={'schema_version':'1.0','kind':'editorial_plan','status':'completed','editorial_plan_id':matrix['editorial_plan_id'],'editorial_cache_key':sha({'input':inputs,'plan':sha(p),'approval':sha(a)}),'pipeline_version':'approved-content-neutral-1.0','input':inputs,'execution':execution,'policy':{'focus':None,'audience':None,'max_deep_dive_pages':None,'output_language':'zh-CN','selection_policy_version':'approved-content-neutral-1.0'},'package':package,'coverage_matrix_sha256':sha(matrix),'review_status':'accepted','created_at':now}
egate={'schema_version':'1.0','kind':'editorial_gate','status':'pass','editorial_plan_sha256':sha(editorial),'coverage_matrix_sha256':sha(matrix),'knowledge_graph_sha256':sha(graph),'knowledge_gate_sha256':sha(kgate),'checks':[{'name':'approved_page_plan_identity','status':'pass','details':{'plan':sha(p),'approval':sha(a)}},{'name':'complete_primary_disposition','status':'pass','details':{'details':len(details),'appendix_details':sum(x in appendix_ids for x in placements.values()),'images':len(deep)+1+len(overview_pages)}}],'human_review_required':False,'human_review':{'status':'pass','reviewed_on':date,'scope':'用户确认当前规划；内容映射与版本完整，不代表成图或视觉验收。'}}
artifacts={'knowledge_base':base,'knowledge_graph':graph,'knowledge_gate':kgate,'editorial_plan':editorial,'coverage_matrix':matrix,'editorial_gate':egate}
staging=w/'05-qa/approved-package-staging';staging.mkdir(exist_ok=True)
for name,value in artifacts.items():(staging/(name+'.json')).write_text(json.dumps(value,ensure_ascii=False,indent=2)+'\n')
code='import {readFileSync} from "node:fs";import {join} from "node:path";import {validateArtifact} from "./dist/validate.js";for(const n of process.argv.slice(2))validateArtifact(n,JSON.parse(readFileSync(join(process.argv[1],n+".json"),"utf8")));'
subprocess.run(['node','--input-type=module','-e',code,str(staging),*artifacts],cwd=root,check=True)
for name in artifacts:(out/(name+'.json')).write_bytes((staging/(name+'.json')).read_bytes())
print(json.dumps({'status':'pass','nodes':len(nodes),'images':len(deep)+1+len(overview_pages),'details':len(details),'appendix_details':sum(x in appendix_ids for x in placements.values()),'scene_produced':False},ensure_ascii=False))
