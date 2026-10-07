// 本集总览的同场景真实导出；完整包 construction 门禁另行关闭。
import {chromium} from 'playwright';
import {readFileSync,writeFileSync,mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {resolve,join} from 'node:path';
import {pathToFileURL} from 'node:url';
const out=resolve(process.argv[2]),root=process.cwd(),tmp=mkdtempSync(join(tmpdir(),'mianji-overview-'));
let browser;
try {
 const html=join(tmp,'preview.html');writeFileSync(html,`<!doctype html><meta charset="utf-8"><script src="${pathToFileURL(join(root,'dist/excalidraw-preview-browser.js')).href}"></script>`);
 browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
 const page=await browser.newPage({viewport:{width:1280,height:1800},deviceScaleFactor:1});await page.goto(pathToFileURL(html).href);
 const scene=JSON.parse(readFileSync(join(out,'P01-overview.excalidraw'),'utf8'));
 const png=await page.evaluate(s=>window.renderPersistedExcalidrawScene(s),scene);
 const save=(name,url)=>writeFileSync(join(out,name),Buffer.from(url.split(',')[1],'base64'));
 save('P01-overview.png',png);
 save('P01-overview-390.png',await page.evaluate(u=>window.deriveRenderedPng(u,390,false),png));
 save('P01-overview-gray.png',await page.evaluate(u=>window.deriveRenderedPng(u,1200,true),png));
 console.log(JSON.stringify({status:'exported',out}));
} finally {if(browser)await browser.close();rmSync(tmp,{recursive:true,force:true});}
