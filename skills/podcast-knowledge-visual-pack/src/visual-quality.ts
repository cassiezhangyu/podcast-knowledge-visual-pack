/** 试验版仅核验证据、阶段和绑定；不把记录通过声称为视觉质量已被机器证明。 */
import {readFileSync, realpathSync} from "node:fs";
import {createHash} from "node:crypto";
type R=Record<string,any>;
export const PHASES=["sketch","pre_refinement","pre_delivery"] as const;
const hash=(p:string)=>createHash("sha256").update(readFileSync(p)).digest("hex");
const text=(v:any)=>typeof v==="string"&&v.trim().length>=8&&!/待作者填写|TODO|待检查/.test(v);
const fail=(s:string):never=>{throw new Error("视觉质量试验检查："+s);};
export const bindQuality=(path:string)=>({path:realpathSync(path),sha256:hash(path)});
function binding(v:R,expected?:R){if(!v?.path||!v.sha256||hash(v.path)!==v.sha256||(expected&&(realpathSync(v.path)!==realpathSync(expected.path)||v.sha256!==expected.sha256)))fail("证据过期或不是当前工件");}
export function qualityDraft(current:R,phase:string,inputs:R={}):R{
 if(!PHASES.includes(phase as any))fail("未知检查时点");
 return {kind:"visual_quality_trial",phase,status:"not_reviewed",current,input_bindings:Object.fromEntries(["content","tokens","framework_basis","user_requirements"].filter(k=>inputs[k]).map(k=>[k,inputs[k]])),
 core_explanation_sufficient:null,core_explanation_evidence:"待作者填写",
 composition_passed:null,composition_evidence:Object.fromEntries(["main_organization","evidence_placement","reading_path","content_fit"].map(k=>[k,"待作者填写"])),
 full_build_ready:null,full_build_readiness_evidence:Object.fromEntries(["visual_responsibility","composition","reference_gap_and_plan"].map(k=>[k,"待作者填写"])),
 reference_comparisons:[],key_expression:{needed:null,reason:"待作者填写",alternatives:[],selected:null},
 dominant_object:{region:"待作者填写",specific_contribution:"待作者填写",reduced_alternative:null,decision:null,reason:"待作者填写"},
 series_repetition_check:{scope:"待作者填写",comparisons:[]},strongest_gap:{status:"not_reviewed",observation:"待作者填写",resolution:"待作者填写"},
 revision:{previous:null,affected_checks:[],rechecked:[],basis:"新图时说明；改版时列出位置/大小/范围变化影响，不继承受影响判断。"}};
}
export function assertQualityContext(r:R,inputs:R){
 for(const k of ["content","tokens","framework_basis","user_requirements"])if(inputs?.[k])binding(r.input_bindings?.[k],inputs[k]);
}
export function assertQualityReport(r:R,current?:R){
 if(r?.kind!=="visual_quality_trial"||!PHASES.includes(r.phase)||r.status!=="author_review_passed")fail("缺少当前时点作者判断");
 for(const ref of Object.values(r.input_bindings??{}))binding(ref as R);
 for(const k of ["scene","review2x","phone","gray"]){binding(r.current?.[k],current?.[k]);}
 for(const k of ["core_explanation_sufficient","composition_passed","full_build_ready"])if(r[k]!==true)fail(k+"未通过");
 if(!text(r.core_explanation_evidence))fail("核心解释证据缺失");
 for(const [key,fields]of Object.entries({composition_evidence:["main_organization","evidence_placement","reading_path","content_fit"],full_build_readiness_evidence:["visual_responsibility","composition","reference_gap_and_plan"]}))for(const f of fields)if(!text(r[key]?.[f]))fail(key+"."+f+"缺失");
 if(!r.reference_comparisons?.length)fail("缺少具体参考差距");
 const seen=new Set();for(const x of r.reference_comparisons){binding(x.reference);for(const f of ["reference_region","current_region","achieved","gap","decision"])if(!text(x[f]))fail("参考比较缺少"+f);const k=JSON.stringify([x.current_region,x.achieved,x.gap]);if(seen.has(k))fail("参考比较复用同一判断");seen.add(k);}
 const e=r.key_expression;if(typeof e?.needed!=="boolean"||!text(e.reason))fail("未判断关键表达探索");
 if(e.needed){if(e.alternatives?.length<2)fail("同一难点缺少真实替代表达");for(const a of e.alternatives){binding(a.image);if(!text(a.encoding)||!text(a.reader_gain))fail("替代表达缺少读者收益");}if(new Set(e.alternatives.map((a:R)=>a.image.sha256)).size<2||new Set(e.alternatives.map((a:R)=>a.encoding)).size<2)fail("重复草图不算替代表达");if(!e.alternatives.some((a:R)=>a.id===e.selected))fail("尚未选择表达");}
 const d=r.dominant_object;if(!text(d?.region)||!text(d.specific_contribution)||!text(d.reason)||!["keep","reduce","reorganize","not_applicable"].includes(d.decision))fail("主位贡献未核对");
 if(d.decision!=="not_applicable")binding(d.reduced_alternative);else if(!text(d.specific_contribution))fail("文字型组织仍需说明主位贡献");
 const rep=r.series_repetition_check;if(!text(rep?.scope)||!Array.isArray(rep.comparisons))fail("未核构图重复");for(const x of rep.comparisons){binding(x.image);if(!text(x.observation))fail("相邻比较缺观察");}
 if(r.strongest_gap?.status!=="resolved"||!text(r.strongest_gap.observation)||!text(r.strongest_gap.resolution))fail("最强差距未解决");
 const rev=r.revision;if(!Array.isArray(rev?.affected_checks)||!Array.isArray(rev.rechecked)||!text(rev.basis))fail("返修影响未记录");
 if(rev.previous){binding(rev.previous);for(const k of ["composition","reference_alignment","mobile_readability"])if(!rev.affected_checks.includes(k)||!rev.rechecked.includes(k))fail("返修不可继承"+k);}
}
export function assertVisualTrial(c:R){
 const v=c.visual_quality_trial;if(!v||v.status!=="author_review_passed")fail("缺少三时点视觉证据");
 const phases=PHASES.map(p=>{binding(v[p]);const r=JSON.parse(readFileSync(v[p].path,"utf8"));if(r.phase!==p)fail("检查时点错配");assertQualityReport(r,p==="pre_delivery"?c.current:undefined);return r;});
 const refs=JSON.parse(readFileSync(c.preflight.path,"utf8")).inputs;
 const expected=[...(refs?.positive??[]),...(refs?.negative??[])];
 for(const r of phases){assertQualityContext(r,refs);}
 for(const r of phases)for(const ref of expected)if(!r.reference_comparisons.some((x:R)=>x.reference.sha256===ref.sha256))fail("参考比较遗漏绑定输入");
}
