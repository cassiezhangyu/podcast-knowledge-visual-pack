import {describe,expect,it} from 'vitest';
import {validateArtifact} from '../../scripts/src/validate.js';
const hash='a'.repeat(64);
const manifest=()=>({schema_version:'1.0',kind:'render_manifest',status:'completed',scene_manifest_sha256:hash,
  pages:[{page_id:'测试页',scene_sha256:hash,png:'page.png',png_sha256:hash,phone_png:'phone.png',phone_png_sha256:hash,
    grayscale_png:'gray.png',grayscale_png_sha256:hash,delivery_png:'page-hd.png',delivery_png_sha256:hash,delivery_scale:2.4}],created_at:new Date().toISOString()});
describe('高清交付绑定',()=>{
 it('路径、哈希和比例必须完整，不能只登记生成文件',()=>{
  expect(()=>validateArtifact('render_manifest',manifest())).not.toThrow();
  for(const key of ['delivery_png','delivery_png_sha256','delivery_scale']){
   const m=manifest();delete (m.pages[0] as any)[key];expect(()=>validateArtifact('render_manifest',m)).toThrow();
  }
 });
 it('非法比例与哈希被拒绝，历史三视图不被自动追认为高清',()=>{
  const m=manifest();m.pages[0].delivery_scale=0;expect(()=>validateArtifact('render_manifest',m)).toThrow();
  m.pages[0].delivery_scale=2.4;m.pages[0].delivery_png_sha256='失效';expect(()=>validateArtifact('render_manifest',m)).toThrow();
  for(const key of ['delivery_png','delivery_png_sha256','delivery_scale'])delete (m.pages[0] as any)[key];
  expect(()=>validateArtifact('render_manifest',m)).not.toThrow();
 });
});
