#!/usr/bin/env node
// 核对集中查看包中的小红书伴读文案是否与当前 06-delivery 一致。
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {join} from 'node:path';

const args=process.argv.slice(2);
const value=name=>{const i=args.indexOf(name);return i<0?undefined:args[i+1];};
const workspace=value('--workspace'),bundleCopyDir=value('--bundle-copy-dir');
if(!workspace||!bundleCopyDir){
 console.error('用法：npm run public-copy:bundle-check -- --workspace <节目目录> --bundle-copy-dir <集中包伴读文案目录>');
 process.exit(2);
}
const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
const source=join(workspace,'06-delivery');
const names=['xiaohongshu-draft.md','xiaohongshu.md','xiaohongshu-review.md','public_copy_record.json','public_copy_gate.json'];
try{
 const record=JSON.parse(readFileSync(join(source,'public_copy_record.json'),'utf8'));
 const gate=JSON.parse(readFileSync(join(source,'public_copy_gate.json'),'utf8'));
 const approval=readFileSync(join(workspace,'01-understanding','content_split_human_approval.json'));
 if(gate.status!=='pass'||!Array.isArray(gate.checks)||!gate.checks.length||gate.checks.some(c=>c.status!=='pass'))throw new Error('小红书文案门禁未通过');
 if(gate.public_copy_record_sha256!==digest(JSON.stringify(record)))throw new Error('小红书文案门禁与当前记录不一致');
 if(record.content_split_human_approval_sha256!==digest(approval))throw new Error('《内容拆分》审批已变化');
 if(record.draft_sha256!==digest(readFileSync(join(source,names[0])))||record.final_sha256!==digest(readFileSync(join(source,names[1]))))throw new Error('文案文件已在门禁通过后变化');
 if(!readFileSync(join(source,names[2]),'utf8').trim())throw new Error('缺少有效的文案复核记录');
 const mismatches=names.filter(name=>{
  try{return digest(readFileSync(join(source,name)))!==digest(readFileSync(join(bundleCopyDir,name)));}
  catch{return true;}
 });
 if(mismatches.length)throw new Error(`集中包缺失或使用旧版伴读文件：${mismatches.join('、')}`);
 console.log(JSON.stringify({status:'pass',files:names.length,bundle_copy_dir:bundleCopyDir}));
}catch(error){
 console.error(JSON.stringify({status:'fail',reason:error instanceof Error?error.message:String(error)}));
 process.exitCode=1;
}
