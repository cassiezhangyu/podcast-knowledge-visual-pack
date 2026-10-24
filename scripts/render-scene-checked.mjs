#!/usr/bin/env node
// 原型与局部重画统一入口：先机械检查，再真实导出；无跳过检查参数。
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, mkdirSync, statSync, rmSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { launchZh, newZhPage, ZH_HTML_HEAD } from './lib/zh_browser.mjs';
import { findEpisodeMetadata, checkAlbumCoverSource, checkAlbumCoverFile } from './album-cover-check.mjs';
import { auditRenderedGeometry } from './lib/rendered-geometry.mjs';
import { assertSceneMechanics } from '../dist/scene-mechanics.js';
if(process.env.PKVP_GLYPH_NEGATIVE_CONTROL==='1')throw new Error('字形负向对照仅可用于审计验证，禁止正式导出');
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const args=process.argv.slice(2), value=k=>args[args.indexOf(k)+1];
for(const key of ['--scene','--preflight','--output'])if(!args.includes(key)||!value(key)||value(key).startsWith('--'))throw new Error('缺少必需参数 '+key);
const scenePath=resolve(value('--scene')),preflightPath=resolve(value('--preflight')),out=resolve(value('--output'));
const tokensPath=args.includes('--design-tokens')?resolve(value('--design-tokens')):join(root,'design_tokens.json'),sha=b=>createHash('sha256').update(b).digest('hex'),bind=p=>({path:p,sha256:sha(readFileSync(p))});
const build=JSON.parse(readFileSync(join(root,'dist/render-build.json')));
for(const file of build.files)if(sha(readFileSync(join(root,file.path)))!==file.sha256)throw new Error('渲染代码或构建产物过期：请先npm run build');
const sceneBytes=readFileSync(scenePath),scene=JSON.parse(sceneBytes),tokens=JSON.parse(readFileSync(tokensPath)),preflight=JSON.parse(readFileSync(preflightPath));
if(preflight.status!=='completed_before_construction'||!preflight.page_id||!preflight.inputs||statSync(preflightPath).mtimeMs>statSync(scenePath).mtimeMs)throw new Error('联合预检缺失、未完成或晚于scene');
if(preflight.design_tokens_sha256!==sha(readFileSync(tokensPath)))throw new Error('预检所用tokens过期');
if(resolve(preflight.inputs.tokens?.path||'')!==tokensPath)throw new Error('导出参数与预检tokens路径不一致');
for(const key of ['content','tokens','palette','taste','positive','negative','page_contract','creation_rules'])if(!preflight.inputs[key]||(Array.isArray(preflight.inputs[key])&&!preflight.inputs[key].length))throw new Error('联合预检缺少输入：'+key);
let bindings=0;
function checkBindings(node){if(!node||typeof node!=='object')return;if(node.path&&node.sha256){bindings++;if(sha(readFileSync(node.path))!==node.sha256)throw new Error('预检输入已变化：'+node.path);}else for(const v of Object.values(node))checkBindings(v);}
checkBindings(preflight.inputs);if(!bindings)throw new Error('联合预检未绑定实际输入');
// 非 skill 默认参数必须在 02-visual-plan/project_overrides.json 登记。
{const meta=findEpisodeMetadata(dirname(scenePath));if(meta){const ws=dirname(dirname(meta));const po=spawnSync('python3',[join(root,'scripts/check_project_overrides.py'),'--workspace',ws,'--tokens',tokensPath],{cwd:root,encoding:'utf8'});if(po.error||po.status!==0)throw new Error('项目覆盖未登记或已变化：'+(po.stdout||po.stderr||po.error));}}
const planCheck=spawnSync('python3',[join(root,'scripts/check_reference_preflight.py'),'--scene',scenePath,'--preflight',preflightPath],{cwd:root,encoding:'utf8'});
if(planCheck.error||planCheck.status!==0)throw new Error('绘图前预检缺项或无效：'+(planCheck.stderr||planCheck.stdout||planCheck.error));
assertSceneMechanics(scene,tokens);
const chromeRun=spawnSync('python3',[join(root,'scripts/check_fixed_chrome.py'),scenePath,'--contract',preflight.inputs.page_contract.path],{cwd:root,encoding:'utf8'});
if(chromeRun.error||chromeRun.status!==0)throw new Error('固定外围合同阻断导出：'+(chromeRun.stderr||chromeRun.stdout||chromeRun.error));
const chromeCheck=JSON.parse(chromeRun.stdout);
const episodeMetadataPath=findEpisodeMetadata(dirname(scenePath));
for(const [script,extra] of [['check_typography.py',['--design-tokens',tokensPath]],['check_strokes.py',[]],['check_reader_facing_text.py',episodeMetadataPath?['--metadata',episodeMetadataPath]:[]]]){
 const result=spawnSync('python3',[join(root,'scripts',script),scenePath,...extra],{cwd:root,encoding:'utf8'});
 if(result.error||result.status!==0)throw new Error(`${script}阻断导出：${result.stderr||result.stdout||result.error}`);
}
if(!['overview','deep_dive','cover'].includes(preflight.role))throw new Error('预检缺少有效页面角色');
let outlineRegions;
if(['overview','deep_dive'].includes(preflight.role)){
 // 默认从 scene 自动推导区域；手工区域须写原因并附叠框截图。
 const manual=args.includes('--outline-regions')&&value('--outline-regions')!=='auto';
 mkdirSync(out,{recursive:true});
 outlineRegions=manual?resolve(value('--outline-regions')):join(out,'outline_regions.auto.json');
 const result=spawnSync('python3',[join(root,'scripts/check_outline_body_alignment.py'),scenePath,'--regions',manual?outlineRegions:'auto','--write-regions',manual?join(out,'outline_regions.used.json'):outlineRegions,...(manual?['--require-manual-provenance']:[])],{cwd:root,encoding:'utf8'});
 if(result.error||result.status!==0)throw new Error('提纲/正文编号检查阻断：'+(result.stderr||result.stdout||result.error));
}
mkdirSync(out,{recursive:true});
const budgetPath=join(out,'LAYOUT_BUDGET.txt'),overlapPath=join(out,'OVERLAP_MARGIN_AUDIT.json');
if(preflight.role!=='cover'){
 const budget=spawnSync('python3',[join(root,'scripts/layout_budget.py'),'--scene',scenePath],{cwd:root,encoding:'utf8'});
 writeFileSync(budgetPath,(budget.stdout||'')+(budget.stderr||''));
 if(budget.error||budget.status!==0)throw new Error('版面预算未通过，未生成候选图（删字或重排，不缩字号）：\n'+(budget.stdout||budget.stderr||budget.error));
}
{
 const overlap=spawnSync('python3',[join(root,'scripts/audit_overlap_margins.py'),scenePath],{cwd:root,encoding:'utf8'});
 writeFileSync(overlapPath,overlap.stdout||JSON.stringify({pass:false,error:overlap.stderr||String(overlap.error)}));
 if(overlap.error||overlap.status!==0)throw new Error('压线/边距审计未通过，未生成候选图（文字下的底色须足够浅；手绘图形离安全区边缘留3–5px）：\n'+(overlap.stdout||overlap.stderr||overlap.error).slice(0,4000));
}
const html=join(out,'.checked-export.html');
const layoutPath=join(out,'SCENE_LAYOUT_DIAGNOSTIC.json'),glyphPath=join(out,'CJK_GLYPH_AUDIT.json');
for(const command of [['python3',[join(root,'scripts/audit_scene_layout.py'),scenePath,'--design-tokens',tokensPath,'--output',layoutPath]],
 ['node',[join(root,'scripts/audit_cjk_glyphs.mjs'),scenePath,glyphPath]]]){
 const result=spawnSync(command[0],command[1],{cwd:root,encoding:'utf8'});
 if(result.error||result.status!==0)throw new Error('诊断或字形审计执行失败：'+(result.stderr||result.stdout||result.error));
}
const bundle=join(root,'dist/excalidraw-preview-browser.js');writeFileSync(html,`${ZH_HTML_HEAD}<script src="${pathToFileURL(bundle).href}"></script>`);
let browser;
try{
 const macChrome='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
 const executablePath=process.env.PODCAST_MAP_CHROME_PATH||(process.platform==='darwin'&&existsSync(macChrome)?macChrome:undefined);
 try{browser=await launchZh({... (executablePath?{executablePath}:{})});}catch(error){const m=String(error?.message??error);throw new Error((/Executable doesn't exist/.test(m)?'找不到浏览器：安装 Google Chrome、运行 npx playwright install chromium，或设置 PODCAST_MAP_CHROME_PATH。':/SIGABRT|SIGTRAP|kill EPERM|MachPortRendezvousServer|Permission denied/.test(m)?'命令沙箱不允许启动浏览器：用宿主权限重跑同一命令（Cursor: required_permissions ["all"]；Codex: require_escalated）。':'浏览器启动失败。')+'详见 references/environment/RENDER_BROWSER_ENVIRONMENT.md。原始错误：'+m.split('\n')[0]);}
 const page=await newZhPage(browser,{viewport:{width:1200,height:1600},deviceScaleFactor:1});await page.goto(pathToFileURL(html).href);
 let original=await page.evaluate(async({scene,tokens})=>window.renderPersistedExcalidrawScene(scene,tokens),{scene,tokens});
 const assetArg=args.includes('--brand')?value('--brand'):null;
 if(!assetArg)throw new Error('缺少官方专辑封面--brand');
 const assetPath=resolve(assetArg),contract=JSON.parse(readFileSync(preflight.inputs.page_contract.path));
 if(resolve(contract.brand_asset?.path||'')!==assetPath)throw new Error('官方专辑素材不匹配当前页面合同');
 const metadataPath=findEpisodeMetadata(dirname(assetPath));
 if(!metadataPath)throw new Error('找不到 00-source/episode_metadata.json，无法核对专辑封面');
 const albumCoverCheck=checkAlbumCoverSource({metadata:JSON.parse(readFileSync(metadataPath,'utf8')),sourceUrl:contract.brand_asset?.source_url});
 const assetBytes=readFileSync(assetPath),box=tokens.cover.brand_asset.box;
 {const rec=join(dirname(metadataPath),'brand','album_cover.json');albumCoverCheck.file_check=checkAlbumCoverFile({record:existsSync(rec)?JSON.parse(readFileSync(rec,'utf8')):null,assetSha256:sha(assetBytes)});}
 if(contract.brand_asset?.sha256&&createHash('sha256').update(assetBytes).digest('hex')!==contract.brand_asset.sha256)throw new Error('专辑封面文件hash与页面合同不一致');
 const deliveryScale=tokens.export.scale,[deliveryWidth,deliveryHeight]=tokens.export.delivery_size;
 if(deliveryWidth!==Math.round(tokens.canvas.width*deliveryScale)||deliveryHeight!==Math.round(tokens.canvas.height*deliveryScale))throw new Error('高清导出尺寸与比例不一致');
 const assetUrl='data:image/'+(/\.jpe?g$/i.test(assetPath)?'jpeg':'png')+';base64,'+assetBytes.toString('base64');
 const assetSize=await page.evaluate(async u=>{const image=new Image();image.src=u;await image.decode();return {width:image.naturalWidth,height:image.naturalHeight};},assetUrl);
 if(assetSize.width<box.width*deliveryScale||assetSize.height<box.height*deliveryScale)throw new Error('官方封面分辨率不足以支持高清交付');
 let delivery=await page.evaluate(async({scene,tokens,scale})=>window.renderPersistedExcalidrawScene(scene,tokens,scale),{scene,tokens,scale:deliveryScale});
 delivery=await page.evaluate(async o=>window.composeBrandAsset(o.base,o.asset,o.box),{base:delivery,asset:assetUrl,box:Object.fromEntries(Object.entries(box).map(([k,v])=>[k,v*deliveryScale]))});
 original=await page.evaluate(async o=>window.composeBrandAsset(o.base,o.asset,o.box),{base:original,asset:'data:image/'+(/\.jpe?g$/i.test(assetPath)?'jpeg':'png')+';base64,'+assetBytes.toString('base64'),box});
 const reviewScale=2;if(Math.round(tokens.canvas.width*reviewScale)!==2400||Math.round(tokens.canvas.height*reviewScale)!==3200)throw new Error('@2x看图尺寸必须为2400×3200');
 let review2x=await page.evaluate(async({scene,tokens,scale})=>window.renderPersistedExcalidrawScene(scene,tokens,scale),{scene,tokens,scale:reviewScale});
 review2x=await page.evaluate(async o=>window.composeBrandAsset(o.base,o.asset,o.box),{base:review2x,asset:assetUrl,box:Object.fromEntries(Object.entries(box).map(([k,v])=>[k,v*reviewScale]))});
 const phone=await page.evaluate(async u=>window.deriveRenderedPng(u,390,false),original),gray=await page.evaluate(async u=>window.deriveRenderedPng(u,1200,true),original);
 const geometryPath=join(out,'RENDERED_GEOMETRY_DIAGNOSTIC.json');
 writeFileSync(geometryPath,JSON.stringify(await page.evaluate(auditRenderedGeometry,{scene,tokens}),null,2)+'\n');
 if(sha(readFileSync(scenePath))!==sha(sceneBytes))throw new Error('导出期间scene已变化，禁止保存混合版本');
 const artifacts={scene:bind(scenePath)};
 for(const[k,name,url,width,height]of[['png','P01.png',original,1200,1600],['phone','P01-phone.png',phone,390,520],['gray','P01-grayscale.png',gray,1200,1600],['delivery','P01-hd.png',delivery,deliveryWidth,deliveryHeight],['review2x','P01@2x.png',review2x,2400,3200]]){
  const bytes=Buffer.from(url.split(',')[1],'base64');if(bytes.toString('hex',0,8)!=='89504e470d0a1a0a'||bytes.readUInt32BE(16)!==width||bytes.readUInt32BE(20)!==height)throw new Error('真实导出尺寸异常：'+k);
  const p=join(out,name);writeFileSync(p,bytes);artifacts[k]=bind(p);
 }
 const record={kind:'mechanical_render_record',status:'pass',page_id:preflight.page_id,created_at:new Date().toISOString(),checks:['preconstruction_reference_plan','native_scene','typography_roles_sizes_strong_weight','stroke_roles','static_text_geometry','reader_facing_text','outline_alignment','current_input_bindings','same_scene_real_export'].map(name=>({name,status:'pass'})),outline_check: outlineRegions ? {status:'pass',regions:bind(outlineRegions)} : {status:'not_applicable',reason:'cover'},tokens:bind(tokensPath),preflight:bind(preflightPath),renderer:bind(bundle),brand_asset:{...bind(assetPath),source_url:albumCoverCheck.source_url,album_cover_check:albumCoverCheck},current:artifacts,visual_quality:'needs_independent_review',pixel_geometry:'needs_rendered_review',semantic_roles:'needs_rendered_review'};
 record.diagnostics={layout:bind(layoutPath),glyphs:bind(glyphPath),geometry:bind(geometryPath)};
 record.overlap_margin_audit={status:'pass',command:'python3 scripts/audit_overlap_margins.py <scene>',record:bind(overlapPath)};
 record.checks.push({name:'overlap_margin_audit',status:'pass'});
 if(preflight.role!=='cover'){record.layout_budget={status:'pass',command:'python3 scripts/layout_budget.py --scene <scene>',record:bind(budgetPath)};record.checks.push({name:'layout_budget',status:'pass'});}
 record.chrome_check=chromeCheck;
 if(chromeCheck.status==='pass')record.checks.push({name:'declared_fixed_chrome',status:'pass'});
 record.delivery_scale=deliveryScale;
 record.review_2x={scale:2,size:[2400,3200],scene_sha256:artifacts.scene.sha256,role:'user_review_and_delivery',note:'给用户看图与交付用@2x；P01.png仅内部检查'};
 if(preflight.role!=='cover'){const dp=join(out,'DEAD_SPACE_AUDIT.json');const dr=spawnSync('python3',[join(root,'scripts/audit_dead_space.py'),artifacts.review2x.path,'--out',dp],{cwd:root,encoding:'utf8'});record.dead_whitespace_audit={status:dr.status===0?'pass':'fail',record:existsSync(dp)?bind(dp):null,note:'作者自检 checks.dead_whitespace_audit 须绑定此记录；fail 须先改图再交'};}
 writeFileSync(join(out,'MECHANICAL_RENDER_RECORD.json'),JSON.stringify(record,null,2)+'\n');console.log(JSON.stringify({status:'rendered_needs_review',output:out,record:join(out,'MECHANICAL_RENDER_RECORD.json')}));
}finally{if(browser)await browser.close();rmSync(html,{force:true});}
