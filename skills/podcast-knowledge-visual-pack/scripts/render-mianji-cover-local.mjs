// 本期封面原型的同场景导出；正式整包建设门禁仍需另行关闭。
import {chromium} from 'playwright';
import {readFileSync,writeFileSync,mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {resolve,join} from 'node:path';
import {pathToFileURL} from 'node:url';
const out=resolve(process.argv[2]),root=process.cwd(),tmp=mkdtempSync(join(tmpdir(),'mianji-cover-'));
let b;try{
 const html=join(tmp,'preview.html');writeFileSync(html,`<!doctype html><meta charset="utf-8"><script src="${pathToFileURL(join(root,'dist/excalidraw-preview-browser.js')).href}"></script>`);
 b=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
 const p=await b.newPage({viewport:{width:1280,height:1800},deviceScaleFactor:1});await p.goto(pathToFileURL(html).href);
 for(const [name,stem] of [['P00-structure.excalidraw','P00-structure'],['P00-cover.excalidraw','P00-cover']]){
  const scene=JSON.parse(readFileSync(join(out,name),'utf8'));let png=await p.evaluate(s=>window.renderPersistedExcalidrawScene(s),scene);
  if(stem==='P00-cover' && (out.includes('P00-v2') || out.includes('P00-v3') || out.includes('P00-v4'))){ const asset='data:image/png;base64,'+readFileSync(join(out,'../../00-source/official-album.png')).toString('base64');png=await p.evaluate(async v=>window.composeBrandAsset(v.png,v.asset,{x:994,y:64,width:126,height:126}),{png,asset}); }
  const save=(n,u)=>writeFileSync(join(out,n),Buffer.from(u.split(',')[1],'base64'));
  save(stem+'.png',png);
  if(stem==='P00-cover'){
   save(stem+'-390.png',await p.evaluate(u=>window.deriveRenderedPng(u,390,false),png));
   save(stem+'-gray.png',await p.evaluate(u=>window.deriveRenderedPng(u,1200,true),png));
  }
 }
 console.log(JSON.stringify({status:'exported',out,browser:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'}));
}finally{if(b)await b.close();rmSync(tmp,{recursive:true,force:true});}
