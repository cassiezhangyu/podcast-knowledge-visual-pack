import {describe,expect,it} from 'vitest';
import {mkdtempSync,writeFileSync} from 'node:fs';import {tmpdir} from 'node:os';import {join} from 'node:path';import {createHash} from 'node:crypto';
import {validateArtifact} from '../../scripts/src/validate.js';
import {checkReview2x} from '../../scripts/src/review-2x.js';
const h='a'.repeat(64);
const png=(w:number,h:number)=>{const b=Buffer.alloc(33);Buffer.from('89504e470d0a1a0a','hex').copy(b);b.writeUInt32BE(w,16);b.writeUInt32BE(h,20);return b;};
const sha=(b:Buffer)=>createHash('sha256').update(b).digest('hex');
function setup(w=2400,hh=3200){const d=mkdtempSync(join(tmpdir(),'r2x-'));const p1=join(d,'P01.png'),p2=join(d,'P01@2x.png');const b1=png(1200,1600),b2=png(w,hh);writeFileSync(p1,b1);writeFileSync(p2,b2);
 const mech:any={current:{scene:{path:'s',sha256:h},png:{path:p1,sha256:sha(b1)},review2x:{path:p2,sha256:sha(b2)}},review_2x:{scale:2,scene_sha256:h}};
 const page:any={scene_sha256:h,review_png:p2,review_png_sha256:sha(b2),review_scale:2};return {mech,page};}
describe('@2x 看图与交付',()=>{
 it('同 scene、2400×3200 通过',()=>{const {mech,page}=setup();expect(checkReview2x(mech,page).status).toBe('pass');});
 it('尺寸错误拒绝',()=>{const {mech,page}=setup(2880,3840);expect(()=>checkReview2x(mech,page)).toThrow();});
 it('scene 不一致拒绝',()=>{const {mech,page}=setup();mech.review_2x.scene_sha256='b'.repeat(64);expect(()=>checkReview2x(mech,page)).toThrow();});
 it('清单漏登记拒绝',()=>{const {mech,page}=setup();delete page.review_png;expect(()=>checkReview2x(mech,page)).toThrow();});
 it('旧记录无 @2x 放行为 legacy',()=>{expect(checkReview2x({current:{}},{}).status).toBe('legacy_1x_only');});
 it('schema：review 三字段成组，比例只能是 2',()=>{
  const m:any={schema_version:'1.0',kind:'render_manifest',status:'completed',scene_manifest_sha256:h,pages:[{page_id:'p',scene_sha256:h,png:'a.png',png_sha256:h,phone_png:'b',phone_png_sha256:h,grayscale_png:'c',grayscale_png_sha256:h,review_png:'P01@2x.png',review_png_sha256:h,review_scale:2}],created_at:new Date().toISOString()};
  expect(()=>validateArtifact('render_manifest',m)).not.toThrow();
  m.pages[0].review_scale=2.4;expect(()=>validateArtifact('render_manifest',m)).toThrow();
  m.pages[0].review_scale=2;delete m.pages[0].review_png_sha256;expect(()=>validateArtifact('render_manifest',m)).toThrow();
 });
});
