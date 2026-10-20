import {createHash} from 'node:crypto';
import {mkdtempSync,mkdirSync,readFileSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {spawnSync} from 'node:child_process';
import {describe,it,expect} from 'vitest';
import {assertUserRequirementsCheck} from '../../scripts/src/review-packet.js';
import {validateArtifact} from '../../scripts/src/validate.js';

type R=Record<string,any>;
const digest=(x:string|Buffer)=>createHash('sha256').update(x).digest('hex');
const data={required_outcomes:[{id:'U1',requirement:'依据对应具体判断',verification:'指认当前对应双方'}]};
const basis={path:'/test/requirements.json',sha256:'a'.repeat(64)};
const checked=()=>({basis,results:[{id:'U1',status:'pass',visible_evidence:'当前图中的具体比较对象'}]});
describe('用户验收条件记录',()=>{
 it('无补充条件兼容，存在条件必须逐项有当前证据',()=>{
  expect(()=>assertUserRequirementsCheck(undefined,undefined,undefined)).not.toThrow();
  expect(()=>assertUserRequirementsCheck(basis,data,checked())).not.toThrow();
  expect(()=>assertUserRequirementsCheck(basis,data,undefined)).toThrow();
  for(const results of [[],[{id:'U2',status:'pass',visible_evidence:'对应证据'}],[{id:'U1',status:'fail',visible_evidence:'仍有缺口'}],[{id:'U1',status:'pass',visible_evidence:' '}]] ) expect(()=>assertUserRequirementsCheck(basis,data,{basis,results})).toThrow();
  expect(()=>assertUserRequirementsCheck(basis,data,{...checked(),basis:{...basis,sha256:'b'.repeat(64)}})).toThrow();
 });
 it('正式submit实际拒绝漏传、漏审、失败和条件变更，不自动验收用户',()=>{
  const root=mkdtempSync(join(tmpdir(),'pkvp-user-conditions-'));
  const write=(name:string,value:unknown)=>{const path=join(root,name);writeFileSync(path,typeof value==='string'?value:JSON.stringify(value));return {path,sha256:digest(readFileSync(path))};};
  const inputs=Object.fromEntries(['scene','png','phone','gray','content','renderer','brand','tokens'].map(k=>[k,write(k+'.txt','仅测试绑定，不模拟真实视觉质量')]));
  const req=write('requirements.json',data);
  const creation=write('creation.json',{inputs:{user_requirements:req}});
  const plan:R={role:'cover',inputs:{creation_packet:creation,user_requirements:req}};
  const preflight=write('preflight.json',plan);
  const names=['preconstruction_reference_plan','native_scene','typography_roles_sizes_strong_weight','stroke_roles','static_text_geometry','reader_facing_text','outline_alignment','current_input_bindings','same_scene_real_export'];
  const mechanical:R={kind:'mechanical_render_record',status:'pass',checks:names.map(name=>({name,status:'pass'})),preflight,tokens:inputs.tokens,renderer:inputs.renderer,brand_asset:inputs.brand,outline_check:{status:'not_applicable',reason:'cover'},current:{scene:inputs.scene,png:inputs.png,phone:inputs.phone,gray:inputs.gray}};
  let mech=write('mechanical.json',mechanical);
  const packet:R={kind:'independent_visual_review_packet',page_id:'P01',role:'cover',creator_context_id:'creator',current:mechanical.current,content:inputs.content,positive:[],negative:[],standards:{user_requirements:req},mechanical_render_record:mech,preflight_sha256:preflight.sha256,rendered_page_check_sha256:'0'.repeat(64)};
  mkdirSync(join(root,'04-rendered'));
  const manifest={schema_version:'1.0',kind:'render_manifest',status:'completed',scene_manifest_sha256:'0'.repeat(64),created_at:new Date().toISOString(),pages:[{page_id:'P01',scene_sha256:inputs.scene.sha256,png:inputs.png.path,png_sha256:inputs.png.sha256,phone_png:inputs.phone.path,phone_png_sha256:inputs.phone.sha256,grayscale_png:inputs.gray.path,grayscale_png_sha256:inputs.gray.sha256}]};
  write('04-rendered/render_manifest.json',manifest);
  const reader={status:'pass',entry_and_path:'仅测试当前入口路径的记录',graphic_text_gain:'仅测试当前图文收益的记录',whole_page_summary:'仅测试当前整页复述的记录',summary_matches_approved_content:true,block_readback:[{block:'主体',observed:'对应',expected:'对应',match:true}],breakpoints:[],repairs:[]};
  const review:R={schema_version:'1.0',kind:'independent_visual_review',status:'completed',reviewer_context:'isolated_read_only',reviewer_context_id:'reader',render_manifest_sha256:digest(JSON.stringify(manifest)),reviewed_at:new Date().toISOString(),pages:[{page_id:'P01',png_sha256:inputs.png.sha256,review_packet_sha256:'',verdict:'TARGET',findings:[],unfamiliar_reader_check:reader,user_requirements_check:{...checked(),basis:req}}]};
  const run=()=>{
   const bound=write('packet.json',packet);review.pages[0].review_packet_sha256=bound.sha256;
   write('review.json',review);validateArtifact('independent_visual_review',review);
   return spawnSync('node',['dist/visual-closeout-cli.js','--workspace',root,'--review',join(root,'review.json'),'--packet',bound.path,'--action','submit'],{cwd:resolve('.'),encoding:'utf8'});
  };
  try {
   let result=run();expect(result.status,result.stderr).toBe(0);expect(JSON.parse(result.stdout).status).toBe('needs_human_review');
   delete review.pages[0].user_requirements_check;expect(run().stderr).toContain('用户条件审核未绑定');
   review.pages[0].user_requirements_check={...checked(),basis:req};
   review.pages[0].user_requirements_check.results[0].status='fail';expect(run().stderr).toContain('用户条件未逐项通过');
   review.pages[0].user_requirements_check.results[0].status='pass';
   delete packet.standards.user_requirements;expect(run().stderr).toContain('漏传或版本不一致');packet.standards.user_requirements=req;
   delete plan.inputs.user_requirements;mechanical.preflight=write('preflight.json',plan);mech=write('mechanical.json',mechanical);packet.mechanical_render_record=mech;expect(run().stderr).toContain('预检漏传');
   plan.inputs.user_requirements=req;mechanical.preflight=write('preflight.json',plan);mech=write('mechanical.json',mechanical);packet.mechanical_render_record=mech;
   writeFileSync(req.path,'{}');expect(run().stderr).toContain('输入文件已变化');
  } finally {rmSync(root,{recursive:true,force:true});}
 });
});
