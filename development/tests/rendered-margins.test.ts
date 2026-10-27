import {describe,it,expect,afterEach} from 'vitest';
import {mkdtempSync,readFileSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';import {join,resolve} from 'node:path';import {createHash} from 'node:crypto';import {spawnSync} from 'node:child_process';
import {assertRenderedMargins,measureRenderedMargins} from '../../scripts/src/rendered-margins.js';
import {buildManifests} from '../../scripts/src/render-manifest-cli.js';
// @ts-ignore 测试PNG工具与node --test共用。
import {marginPng} from './margin-fixture.mjs';
const roots:string[]=[];afterEach(()=>roots.splice(0).forEach(r=>rmSync(r,{recursive:true,force:true})));
function fixture(bottom=68){
 const root=mkdtempSync(join(tmpdir(),'margin-gate-'));roots.push(root);
 const write=(n:string,v:any)=>{const path=join(root,n);writeFileSync(path,Buffer.isBuffer(v)?v:JSON.stringify(v));return {path,sha256:createHash('sha256').update(readFileSync(path)).digest('hex')};};
 const scene=write('scene.json',{elements:[],files:{}}),tokens=write('tokens.json',JSON.parse(readFileSync(resolve('assets/design_tokens.json'),'utf8')));
 const review2x=write('review.png',marginPng(2,bottom)),delivery=write('delivery.png',marginPng(1,bottom));
 const res=spawnSync('python3',['scripts/audit_rendered_margins.py','--scene',scene.path,'--design-tokens',tokens.path,'--review-png',review2x.path,'--delivery-png',delivery.path],{encoding:'utf8'});
 const rec=JSON.parse(res.stdout),ref=write('margins.json',rec);
 const mechanical:any={kind:'mechanical_render_record',status:'pass',tokens,current:{scene,review2x,delivery},rendered_margin_audit:{status:'pass',record:ref}};
 const author:any={checks:{rendered_margin_audit:{status:'pass',record:ref}}};
 return {root,write,scene,tokens,mechanical,author,rec,ref};
}
describe('真实交付图边距门禁',()=>{
 it('合规图实际重测后通过',()=>{const f=fixture();expect(assertRenderedMargins(f.mechanical,f.author).status).toBe('pass');});
 it('旧记录和缺少底部测量均拒绝',()=>{const f=fixture();delete f.mechanical.rendered_margin_audit;expect(()=>assertRenderedMargins(f.mechanical)).toThrow('旧记录');
 f.mechanical.rendered_margin_audit={status:'pass',record:f.write('old.json',{kind:'rendered_margin_audit',status:'pass'})};expect(()=>assertRenderedMargins(f.mechanical)).toThrow();});
 it('错误图手填pass和伪造正确数值仍拒绝',()=>{const f=fixture(26);f.rec.status='pass';for(const i of Object.values(f.rec.images) as any[]){i.status='pass';i.margins.bottom=68;for(const v of Object.values(i.checks) as any[])v.pass=true;}
 f.mechanical.rendered_margin_audit.record=f.write('forged.json',f.rec);expect(()=>assertRenderedMargins(f.mechanical)).toThrow('真实图片边距未通过');});
 it('PNG更换后即使更新机械哈希，旧边距记录仍拒绝',()=>{const f=fixture();f.mechanical.current.review2x=f.write('review.png',marginPng(2,26));expect(()=>assertRenderedMargins(f.mechanical)).toThrow('过期');});
 it('scene、参数或作者引用改变后必须重检',()=>{for(const k of ['scene','tokens']){const f=fixture();const changed=f.write(k+'.json',{changed:true});if(k==='scene')f.mechanical.current.scene=changed;else f.mechanical.tokens=changed;expect(()=>assertRenderedMargins(f.mechanical)).toThrow('过期');}
 const f=fixture();delete f.author.checks.rendered_margin_audit;expect(()=>assertRenderedMargins(f.mechanical,f.author)).toThrow('作者记录');});
 it('数值篡改为另一组仍合规数值也拒绝',()=>{const f=fixture();f.rec.images.review2x.margins.top=65;f.mechanical.rendered_margin_audit.record=f.write('altered.json',f.rec);expect(()=>assertRenderedMargins(f.mechanical)).toThrow('重新测量不一致');});
 it('正式导出复制到最终位置后必须重新测量绑定',()=>{const f=fixture();f.mechanical.current.delivery=f.write('final-hd.png',marginPng(1));expect(()=>assertRenderedMargins(f.mechanical)).toThrow('过期');
 f.mechanical.rendered_margin_audit.record=f.write('relocated.json',measureRenderedMargins(f.mechanical));expect(assertRenderedMargins(f.mechanical).status).toBe('pass');});
 it('生成交付清单不接受缺少边距的新旧记录',()=>{const f=fixture();delete f.mechanical.rendered_margin_audit;const r=f.write('mechanical.json',f.mechanical);expect(()=>buildManifests(f.root,[r.path])).toThrow('完整边距');});
});
