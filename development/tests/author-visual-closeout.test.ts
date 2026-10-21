import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { closeoutAuthorPages, verifyAuthorPageChecks } from '../../scripts/src/author-visual-closeout.js';
const roots:string[]=[];
afterEach(()=>{for(const r of roots.splice(0))rmSync(r,{recursive:true,force:true});});
const sha=(b:any)=>createHash('sha256').update(b).digest('hex');
function fixture(){
 const root=mkdtempSync(join(tmpdir(),'author-closeout-'));roots.push(root);mkdirSync(join(root,'04-rendered'));
 const write=(n:string,v:any)=>{const p=join(root,n);writeFileSync(p,typeof v==='string'?v:JSON.stringify(v));return {path:p,sha256:sha(readFileSync(p))};};
 const tokens=JSON.parse(readFileSync(resolve('assets/design_tokens.json'),'utf8'));
 const token=write('tokens.json',tokens);
 const scene=write('scene.json',{elements:[{id:'bg',type:'rectangle',x:0,y:0,width:1200,height:1600,...tokens.stroke.role_settings.fill_only,customData:{stroke_role:'fill_only'}}],files:{}});
 const png=write('original.png','synthetic original'),phone=write('phone.png','synthetic phone'),gray=write('gray.png','synthetic gray');
 const preflight=write('preflight.json',{page_id:'P01',role:'cover',status:'completed_before_construction',inputs:{tokens:token}});
 const mechanical:any={kind:'mechanical_render_record',status:'pass',current:{scene,png,phone,gray},tokens:token,preflight,checks:['preconstruction_reference_plan','native_scene','typography_roles_sizes_strong_weight','stroke_roles','static_text_geometry','reader_facing_text','outline_alignment','current_input_bindings','same_scene_real_export'].map(name=>({name,status:'pass'})),outline_check:{status:'not_applicable',reason:'cover'}};
 const mech=write('mechanical.json',mechanical);
 const check:any={page_id:'P01',status:'self_check_passed',current:mechanical.current,mechanical_render_record:mech,checks:Object.fromEntries(['content_coverage','visual_explanation','reference_alignment','text_geometry','mobile_readability','cold_reader_check','layout_budget','margin_audit','cjk_glyph_audit'].map(name=>[name,{status:'pass',visible_evidence:'用于核验状态与绑定的合成证据，不是实际作图结论'}]))};
 const page=write('check.json',check);
 const manifest:any={schema_version:'1.0',kind:'render_manifest',status:'completed',scene_manifest_sha256:'a'.repeat(64),created_at:new Date().toISOString(),pages:[{page_id:'P01',scene_sha256:scene.sha256,png:'original.png',png_sha256:png.sha256,phone_png:'phone.png',phone_png_sha256:phone.sha256,grayscale_png:'gray.png',grayscale_png_sha256:gray.sha256}]};
 write('04-rendered/render_manifest.json',manifest);
 return {root,write,page,check,manifest,mechanical,png,preflight};
}
describe('无审核代理的页面登记',()=>{
 it('作者自检可直接submit，不需要独立报告或上下文',()=>{const f=fixture();const g=closeoutAuthorPages(f.root,[f.page.path],'submit',false);expect(g.status).toBe('needs_human_review');expect(g.independent_review_required).toBe(false);expect(existsSync(join(f.root,'04-rendered/independent_visual_review.json'))).toBe(false);expect(existsSync(join(f.root,'04-rendered/visual_page_human_approval.json'))).toBe(false);});
 it('默认CLI只接收作者自检即可输出',()=>{const f=fixture();const r=spawnSync(process.execPath,[resolve('dist/visual-closeout-cli.js'),'--workspace',f.root,'--page-check',f.page.path,'--action','submit'],{encoding:'utf8'});expect(r.status,r.stderr).toBe(0);expect(JSON.parse(r.stdout).status).toBe('needs_human_review');});
 it('只有明确的用户确认才能记录approve',()=>{const f=fixture();expect(()=>closeoutAuthorPages(f.root,[f.page.path],'approve',false)).toThrow('user-approved');expect(closeoutAuthorPages(f.root,[f.page.path],'approve',true).status).toBe('pass');});
 it('图片变化后拒绝沿用作者通过',()=>{const f=fixture();writeFileSync(f.png.path,'changed');expect(()=>verifyAuthorPageChecks(f.root,f.manifest,[f.page.path])).toThrow();});
 it('缺少陌生读者检查等本地必做项不能交付',()=>{for(const name of ['cold_reader_check','layout_budget','margin_audit','cjk_glyph_audit']){const f=fixture();delete f.check.checks[name];f.write('check.json',f.check);expect(()=>closeoutAuthorPages(f.root,[f.page.path],'submit',false)).toThrow(name);}});
 it('未完成自检不能交付',()=>{const f=fixture();f.check.checks.mobile_readability.status='fail';f.write('check.json',f.check);expect(()=>closeoutAuthorPages(f.root,[f.page.path],'submit',false)).toThrow('mobile_readability');});
 it('机械记录缺项仍阻断',()=>{const f=fixture();f.mechanical.checks.pop();const m=f.write('mechanical.json',f.mechanical);f.check.mechanical_render_record=m;f.write('check.json',f.check);expect(()=>closeoutAuthorPages(f.root,[f.page.path],'submit',false)).toThrow('机械');});
 it('页面遗漏或重复仍阻断',()=>{const f=fixture();expect(()=>verifyAuthorPageChecks(f.root,f.manifest,[])).toThrow();expect(()=>verifyAuthorPageChecks(f.root,f.manifest,[f.page.path,f.page.path])).toThrow();});
});
