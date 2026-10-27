import{describe,it,expect,afterEach}from'vitest';import{mkdtempSync,readFileSync,writeFileSync,rmSync}from'node:fs';import{join}from'node:path';import{tmpdir}from'node:os';import{createHash}from'node:crypto';
import{qualityDraft,assertQualityReport,assertVisualTrial,PHASES}from'../../scripts/src/visual-quality.js';import{qualityFixture}from'./visual-quality-fixture.js';
const roots:string[]=[];afterEach(()=>roots.splice(0).forEach(p=>rmSync(p,{recursive:true,force:true})));
function fixture(){const root=mkdtempSync(join(tmpdir(),'quality-trial-'));roots.push(root);const write=(n:string,x:any)=>{const path=join(root,n);writeFileSync(path,typeof x==='string'?x:JSON.stringify(x));return{path,sha256:createHash('sha256').update(readFileSync(path)).digest('hex')};};const current=Object.fromEntries(['scene','review2x','phone','gray'].map(k=>[k,write(k+'.txt','工件'+k)]));const q=qualityFixture(write,current);const c:any={current,visual_quality_trial:q.trial,preflight:write('preflight.json',{inputs:{positive:[q.ref],negative:[]}})};return{...q,root,write,current,c,r:q.reports.pre_delivery};}
describe('视觉质量试验：证据合同，不冒充审美测量',()=>{
 it('默认报告全部待审，不能自动放行',()=>{const f=fixture(),r=qualityDraft(f.current,'sketch');expect(r.composition_passed).toBeNull();expect(()=>assertQualityReport(r)).toThrow();});
 it('核心、构图与准备度分别阻断',()=>{for(const k of ['core_explanation_sufficient','composition_passed','full_build_ready']){const f=fixture();f.r[k]=false;expect(()=>assertQualityReport(f.r)).toThrow(k);}});
 it('完整证据可验证但仍非用户验收',()=>{const f=fixture();expect(()=>assertVisualTrial(f.c)).not.toThrow();expect(f.c.user_visual_approval).toBeUndefined();});
 it('构图证据缺项被拒绝',()=>{const f=fixture();delete f.r.composition_evidence.content_fit;expect(()=>assertQualityReport(f.r)).toThrow('content_fit');});
 it('泛化参考比较与复用同一判断被拒绝',()=>{const f=fixture();delete f.r.reference_comparisons[0].current_region;expect(()=>assertQualityReport(f.r)).toThrow('current_region');const g=fixture();g.r.reference_comparisons.push(g.r.reference_comparisons[0]);expect(()=>assertQualityReport(g.r)).toThrow('复用');});
 it('关键难点要画真实不同表达，重复图不算',()=>{const f=fixture();f.r.key_expression.needed=true;expect(()=>assertQualityReport(f.r)).toThrow('替代表达');f.r.key_expression.alternatives=[{id:'a',image:f.ref,encoding:'同一条件用范围包含进行表达',reader_gain:'读者直接看到共同条件的作用域'},{id:'b',image:f.ref,encoding:'同一条件用左右状态进行表达',reader_gain:'读者直接比较变化和前提差别'}];f.r.key_expression.selected='a';expect(()=>assertQualityReport(f.r)).toThrow('重复草图');});
 it('没有难点可说明理由，不强制多画',()=>{const f=fixture();expect(()=>assertQualityReport(f.r)).not.toThrow();});
 it('主位贡献须有实际对照证据',()=>{const f=fixture();delete f.r.dominant_object.reduced_alternative;expect(()=>assertQualityReport(f.r)).toThrow();});
 it('文字型关系图不因没有大物件被拒',()=>{const f=fixture();f.r.dominant_object.decision='not_applicable';f.r.dominant_object.reason='此图主位由文字关系组织，没有独立大物件。';delete f.r.dominant_object.reduced_alternative;expect(()=>assertQualityReport(f.r)).not.toThrow();});
 it('尚未解决最强不足不能进入完整精修',()=>{const f=fixture();f.r.strongest_gap.status='open';expect(()=>assertQualityReport(f.r)).toThrow('最强差距');});
 it('返修继承旧判断被拒，明确重查后可过',()=>{const f=fixture();f.r.revision.previous=f.write('prior.json',{status:'历史作者判断'});expect(()=>assertQualityReport(f.r)).toThrow('不可继承');f.r.revision.affected_checks=f.r.revision.rechecked=['composition','reference_alignment','mobile_readability'];expect(()=>assertQualityReport(f.r)).not.toThrow();});
 it('改图后旧视觉证据失效',()=>{const f=fixture();writeFileSync(f.current.review2x.path,'新版图像');expect(()=>assertQualityReport(f.r)).toThrow('过期');});
 it('三时点缺失和错配均拒绝',()=>{const f=fixture();delete f.c.visual_quality_trial.sketch;expect(()=>assertVisualTrial(f.c)).toThrow();const g=fixture();g.c.visual_quality_trial.sketch=g.c.visual_quality_trial.pre_delivery;expect(()=>assertVisualTrial(g.c)).toThrow('错配');});
 it('绑定参考未逐图核验被拒绝',()=>{const f=fixture();f.c.preflight=f.write('preflight.json',{inputs:{positive:[f.write('another.png','另一参考图文件')],negative:[]}});expect(()=>assertVisualTrial(f.c)).toThrow('遗漏');});
 it('准备度不能借用别期内容与参数',()=>{const f=fixture();f.c.preflight=f.write('preflight.json',{inputs:{content:f.write('content.txt','本期批准内容与关系'),positive:[f.ref],negative:[]}});expect(()=>assertVisualTrial(f.c)).toThrow();});
 it('即使全局写通过，旧作者记录缺试验字段仍拒绝',()=>{expect(()=>assertVisualTrial({status:'self_check_passed'})).toThrow('三时点');});
});
