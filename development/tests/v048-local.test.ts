import { describe, it, expect } from 'vitest';
import { assertSentenceColdRead, geometryHash } from '../../scripts/src/sentence-cold-read.js';
const scene=(texts:string[],extra:any[]=[])=>({elements:[...texts.map((t,i)=>({type:'text',id:'t'+i,text:t,x:i,y:i})),{type:'arrow',id:'a1',x:10,y:10,width:50,height:0,points:[[0,0],[50,0]]},...extra]});
const good=(texts:string[])=>({checks:{sentence_cold_read:{status:'pass',items:texts.map(t=>({text:t,flagged:false,resolution:'plain',reason:'直白可懂'})),metaphor_body_plain:{status:'pass',evidence:'土壤只在主图，正文直说'},number_trace:[{text:'每次最多记一到三个点',quote:'每一期每一本最多一到三个',timestamp:'01:12:30'}],label_collision:{status:'pass',findings:[]},outline_items:['破','立','行','知识体系']}}});
describe('v0.4.8 逐句冷读',()=>{
 const T=['知识要自己长成网，不是先搭框架再往里填','每次最多记一到三个点'];
 it('完整记录通过',()=>{expect(()=>assertSentenceColdRead(good(T),scene(T))).not.toThrow();});
 it('缺记录或漏句拒绝',()=>{expect(()=>assertSentenceColdRead({checks:{}},scene(T))).toThrow('sentence_cold_read');const c=good(T);c.checks.sentence_cold_read.items.pop();expect(()=>assertSentenceColdRead(c,scene(T))).toThrow('漏句');});
 it('节目内部说法（像森林，不像房子）拒绝',()=>{const t=['像森林，不像房子','每次最多记一到三个点'];expect(()=>assertSentenceColdRead(good(t),scene(t))).toThrow('节目内部说法');});
 it('flagged 未解释拒绝',()=>{const c=good(T);c.checks.sentence_cold_read.items[0].flagged=true;expect(()=>assertSentenceColdRead(c,scene(T))).toThrow('未改白话');});
 it('数字缺原句拒绝（每周一到三粒）',()=>{const t=['每周一到三粒'];const c=good(t);expect(()=>assertSentenceColdRead(c,scene(t))).toThrow('number_trace');});
 it('标签撞名（木心）拒绝',()=>{const t=['人生体验（木心）'];expect(()=>assertSentenceColdRead(good(t),scene(t))).toThrow('人名');});
 it('提纲带括号拒绝',()=>{const c=good(T);c.checks.sentence_cold_read.outline_items=['行（回到破）'];expect(()=>assertSentenceColdRead(c,scene(T))).toThrow('括号');});
 it('几何指纹不受改字影响、受线条移动影响',()=>{const a=scene(['像森林']),b=scene(['知识要自己长成网']);expect(geometryHash(a)).toBe(geometryHash(b));const c=scene(['x']);c.elements[1].x=99;expect(geometryHash(c)).not.toBe(geometryHash(a));});
});
