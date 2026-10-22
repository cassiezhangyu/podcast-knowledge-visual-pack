import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { applyErratum } from '../../scripts/src/erratum.js';
import { cachedTranscriptReady } from '../../scripts/src/transcript-cache.js';
import { registerDeliveryVersions } from '../../scripts/src/delivery-versions.js';
const roots:string[]=[];afterEach(()=>{for(const r of roots.splice(0))rmSync(r,{recursive:true,force:true});});
const h=(v:unknown)=>createHash('sha256').update(JSON.stringify(v)).digest('hex');
const ht=(s:string)=>createHash('sha256').update(s).digest('hex');
function ws(){const r=mkdtempSync(join(tmpdir(),'v047-'));roots.push(r);mkdirSync(join(r,'01-understanding'));mkdirSync(join(r,'00-source'));return r;}
describe('批准后勘误通道',()=>{
 it('改原词后批准链哈希跟着更新，批准不作废',()=>{
  const r=ws(),u=join(r,'01-understanding');
  const inv={kind:'episode_content_inventory',items:[{id:'x_狐狸',statement:'狐狸训练早起即练'}]};
  writeFileSync(join(u,'episode_content_inventory.json'),JSON.stringify(inv));const doc='# 梳理\n狐狸训练\n';writeFileSync(join(u,'内容梳理.md'),doc);
  const appr={kind:'human_approval',artifact_hashes:{episode_content_inventory:h(inv),content_review_document:ht(doc)}};writeFileSync(join(u,'content_review_human_approval.json'),JSON.stringify(appr));
  writeFileSync(join(u,'content_review_gate.json'),JSON.stringify({episode_content_inventory_sha256:h(inv),human_review:{approval_sha256:h(appr)}}));
  const e=applyErratum(r,{kind:'original_word',replacements:[{old:'狐狸训练',new:'壶铃训练'}],confirmed_by:'Cassie',confirmed_at:'2026-10-22T10:00:00+08:00'});
  const inv2=JSON.parse(readFileSync(join(u,'episode_content_inventory.json'),'utf8'));expect(inv2.items[0].statement).toBe('壶铃训练早起即练');expect(inv2.items[0].id).toBe('x_狐狸');
  const appr2=JSON.parse(readFileSync(join(u,'content_review_human_approval.json'),'utf8'));expect(appr2.artifact_hashes.episode_content_inventory).toBe(h(inv2));expect(appr2.artifact_hashes.content_review_document).toBe(ht(readFileSync(join(u,'内容梳理.md'),'utf8')));
  const gate=JSON.parse(readFileSync(join(u,'content_review_gate.json'),'utf8'));expect(gate.human_review.approval_sha256).toBe(h(appr2));expect(gate.episode_content_inventory_sha256).toBe(h(inv2));
  expect(e.approvals_preserved).toBe(true);expect(JSON.parse(readFileSync(join(u,'errata.json'),'utf8')).entries).toHaveLength(1);
 });
 it('没有用户确认、改得太长或找不到原文都拒绝',()=>{const r=ws();writeFileSync(join(r,'01-understanding','a.json'),JSON.stringify({s:'狐狸'}));
  expect(()=>applyErratum(r,{kind:'original_word',replacements:[{old:'狐狸',new:'壶铃'}],confirmed_by:'',confirmed_at:'2026-10-22'})).toThrow('确认');
  expect(()=>applyErratum(r,{kind:'original_word',replacements:[{old:'狐狸',new:'壶'.repeat(30)}],confirmed_by:'C',confirmed_at:'2026-10-22'})).toThrow('重新审批');
  expect(()=>applyErratum(r,{kind:'typo',replacements:[{old:'不存在',new:'x'}],confirmed_by:'C',confirmed_at:'2026-10-22'})).toThrow('没有找到');
  expect(()=>applyErratum(r,{kind:'rewrite' as any,replacements:[{old:'狐狸',new:'壶铃'}],confirmed_by:'C',confirmed_at:'2026-10-22'})).toThrow('typo');});
});
describe('转写缓存跳过 provider-python',()=>{
 it('有 grounded 转写与 QA 即视为可用',()=>{const r=ws();expect(cachedTranscriptReady(r)).toBe(false);writeFileSync(join(r,'00-source','grounded_transcript.json'),'{}');writeFileSync(join(r,'00-source','grounded_transcript_qa.json'),JSON.stringify({status:'pass'}));expect(cachedTranscriptReady(r)).toBe(true);writeFileSync(join(r,'00-source','grounded_transcript_qa.json'),JSON.stringify({status:'fail'}));expect(cachedTranscriptReady(r)).toBe(false);});
});
describe('一页多交付版本登记',()=>{
 it('没有用户批准或草图路线记录则拒绝',()=>{const r=ws();
  expect(()=>registerDeliveryVersions(r,{page_id:'OV01',versions:[{version_id:'A',scene:'s',png:'p',review_png:'q',self_check:'c'}],approved_by:'Cassie',approved_at:'2026-10-22',approval_source:'sketch_route_selection',route_approval_record:'x',userApproved:false})).toThrow('user-approved');
  expect(()=>registerDeliveryVersions(r,{page_id:'OV01',versions:[{version_id:'A',scene:'s',png:'p',review_png:'q',self_check:'c'}],approved_by:'Cassie',approved_at:'2026-10-22',approval_source:'sketch_route_selection',userApproved:true})).toThrow('route-approval');
  expect(()=>registerDeliveryVersions(r,{page_id:'OV01',versions:[{version_id:'A',scene:'s',png:'p',review_png:'q',self_check:'c'},{version_id:'A',scene:'s',png:'p',review_png:'q',self_check:'c'}],approved_by:'Cassie',approved_at:'2026-10-22',approval_source:'rendered_page_review',userApproved:true})).toThrow('重复');});
});
