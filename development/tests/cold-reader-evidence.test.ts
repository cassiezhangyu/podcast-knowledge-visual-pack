import {describe,it,expect,afterEach} from 'vitest';
import {mkdtempSync,mkdirSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {COMPREHENSION_ITEMS} from '../../scripts/src/author-visual-closeout.js';
import {checkVersion} from '../../scripts/src/delivery-versions.js';
// @ts-ignore 共享合成PNG，仅用于入口回归。
import {marginPng} from './margin-fixture.mjs';
import {assertPlainRestatements, assertSentenceColdRead} from '../../scripts/src/sentence-cold-read.js';
const scene=(texts:string[])=>({elements:texts.map((text,i)=>({id:'t'+i,type:'text',text,x:80,y:400+i*40,width:300,height:30,fontSize:24,fontFamily:2,customData:{typography_role:'body'}}))});
const check=(texts:string[])=>({checks:{
 cold_reader_check:{plain_restatement:texts.map((page_text,i)=>({page_text,stranger_restatement:'这是第'+i+'处内容的直白说明',clear:true}))},
 sentence_cold_read:{status:'pass',items:texts.map((text,i)=>({text,flagged:false,resolution:'plain',reason:'第'+i+'处直接说明对象和动作'})),metaphor_body_plain:{status:'pass',evidence:'正文直接说明实际含义'},number_trace:[],label_collision:{status:'pass',findings:[]},outline_items:[]}
}});
describe('首读证据与当前页面绑定',()=>{
 const texts=['副标题','核心结论','案例说明','末尾短标签'];
 it('不再允许用足三条记录替代全量覆盖',()=>{
  const c=check(texts);c.checks.cold_reader_check.plain_restatement.pop();
  expect(()=>assertPlainRestatements(c,scene(texts))).toThrow('漏句');
 });
 it('超过十二条的后半页、单字和编号也须覆盖',()=>{
  const t=[...Array.from({length:16},(_,i)=>'说明'+i),'1','甲'];const c=check(t);
  expect(()=>assertPlainRestatements(c,scene(t))).not.toThrow();
  c.checks.cold_reader_check.plain_restatement.pop();expect(()=>assertPlainRestatements(c,scene(t))).toThrow('漏句');
 });
 it('不接受多填重复句、旧页面句子或已删除文字充数',()=>{
  const c=check(texts);c.checks.cold_reader_check.plain_restatement.push({...c.checks.cold_reader_check.plain_restatement[0]});
  expect(()=>assertPlainRestatements(c,scene(texts))).toThrow('重复');
  c.checks.cold_reader_check.plain_restatement.pop();c.checks.cold_reader_check.plain_restatement[0].page_text='旧页面句子';
  expect(()=>assertPlainRestatements(c,scene(texts))).toThrow('非当前');
 });
 it('加粗重字和换行副本共用一组复述',()=>{
  const c=check(texts);expect(()=>assertPlainRestatements(c,scene([...texts,'副\n标题']))).not.toThrow();
 });
 it('去掉标点后照抄原句仍拒绝',()=>{
  const t=['先付出，盼以后更好。'],c=check(t);c.checks.cold_reader_check.plain_restatement[0].stranger_restatement='先付出盼以后更好';
  expect(()=>assertPlainRestatements(c,scene(t))).toThrow('重复原句');
 });
 it('历史失败：用资本和算力吸收增长复述资本与算力仍拒绝',()=>{
  const t=['财富流向资本与算力，就业收入未必同幅增加。'],c=check(t);c.checks.cold_reader_check.plain_restatement[0].stranger_restatement='资本和算力吸收增长，就业和收入不一定同幅增加。';
  expect(()=>assertPlainRestatements(c,scene(t),['算力'])).toThrow('疑难词');
  c.checks.cold_reader_check.plain_restatement[0].stranger_restatement='更多投入用于计算设备，未必带来更多岗位和工资。';
  expect(()=>assertPlainRestatements(c,scene(t),['算力'])).not.toThrow();
 });
 it('有疑问或作者未裁定不通过',()=>{
  const c=check(texts);c.checks.cold_reader_check.plain_restatement[0].stranger_restatement='这里说的是哪一种回报？';
  expect(()=>assertPlainRestatements(c,scene(texts))).toThrow('追问');
  c.checks.cold_reader_check.plain_restatement[0].clear=false;expect(()=>assertPlainRestatements(c,scene(texts))).toThrow('读不懂');
 });
 it('逐句记录不可沿用旧句或缺少裁定',()=>{
  const c:any=check(texts);c.checks.sentence_cold_read.items[0].flagged=null;
  expect(()=>assertSentenceColdRead(c,scene(texts))).toThrow('flagged');
  c.checks.sentence_cold_read.items[0].flagged=false;c.checks.sentence_cold_read.items[0].resolution='not_reviewed';
  expect(()=>assertSentenceColdRead(c,scene(texts))).toThrow('裁定');
 });
 const explain=()=>{const t=['寻找瓶颈','瓶颈是流程最慢的一处'],c:any=check(t);
  c.checks.sentence_cold_read.items.forEach((x:any)=>Object.assign(x,{flagged:true,resolution:'explained_on_page',explanation:'旁边说明它指流程最慢的一处',explanation_refs:[{element_id:'t1',quote:'流程最慢的一处'}]}));return {t,c};};
 it('仅在报告写已解释，页面无可核对引用则拒绝',()=>{
  const {t,c}=explain();delete c.checks.sentence_cold_read.items[0].explanation_refs;
  expect(()=>assertSentenceColdRead(c,scene(t),['瓶颈'])).toThrow('explanation_refs');
 });
 it('引用不存在、伪造片段、已删除说明均拒绝',()=>{
  for(const mode of ['missing','quote','deleted']){
   const {t,c}=explain(),s:any=scene(t);const ref=c.checks.sentence_cold_read.items[0].explanation_refs[0];
   if(mode==='missing')ref.element_id='missing';if(mode==='quote')ref.quote='并不存在的白话解释';if(mode==='deleted')s.elements[1].isDeleted=true;
   expect(()=>assertSentenceColdRead(c,s,['瓶颈'])).toThrow();
  }
 });
 it('同句后半段或相邻真实文字说明可以通过',()=>{
  const {t,c}=explain();expect(()=>assertSentenceColdRead(c,scene(t),['瓶颈'])).not.toThrow();
 });
 it('仅引用原句作为自身解释仍拒绝',()=>{
  const {t,c}=explain();c.checks.sentence_cold_read.items[0].explanation_refs=[{element_id:'t0',quote:t[0]}];
  expect(()=>assertSentenceColdRead(c,scene(t),['瓶颈'])).toThrow('自证');
 });
});

describe('版本登记入口执行同一首读门禁',()=>{
 const roots:string[]=[];afterEach(()=>{for(const r of roots.splice(0))rmSync(r,{recursive:true,force:true});});
 it('旧记录有逐句判定但复述只覆盖前三条，登记仍拒绝',()=>{
  const root=mkdtempSync(join(tmpdir(),'cold-register-'));roots.push(root);mkdirSync(join(root,'01-understanding'));
  writeFileSync(join(root,'01-understanding/READER_JARGON.json'),JSON.stringify({kind:'reader_jargon',terms:[],empty_reason:'合成页面无专业术语'}));
  const t=['正文第一处','正文第二处','正文第三处','末尾案例说明'],c:any=check(t);c.checks.cold_reader_check.plain_restatement.pop();
  c.status='self_check_passed';c.checks.cold_reader_check.status='pass';
  c.checks.arrow_audit={status:'not_applicable',reason:'合成场景没有箭头'};
  c.checks.cold_reader_check.comprehension_checklist=Object.fromEntries(COMPREHENSION_ITEMS.map(k=>[k,{status:'pass',evidence:'本条仅用于版本登记入口的合成检查'}]));
  writeFileSync(join(root,'scene.json'),JSON.stringify({...scene(t),files:{}}));writeFileSync(join(root,'check.json'),JSON.stringify(c));
  writeFileSync(join(root,'page.png'),marginPng(1));writeFileSync(join(root,'page2.png'),marginPng(2));
  const result=checkVersion(root,{version_id:'候选',scene:'scene.json',png:'page.png',review_png:'page2.png',self_check:'check.json'});
  expect(result.status).toBe('fail');expect(result.errors.join(' ')).toContain('plain_restatement漏句');
 });
});
