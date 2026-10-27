import {readFileSync,writeFileSync,existsSync} from "node:fs";
import {qualityDraft,assertQualityReport} from "./visual-quality.js";
const args=process.argv.slice(2),v=(s:string)=>args[args.indexOf(s)+1];
try{const action=v("--action"),record=v("--record");if(!record)throw Error("须提供--record机械记录或质量报告");const data=JSON.parse(readFileSync(record,"utf8"));
if(action==="init"){const out=v("--out");if(!out||existsSync(out))throw Error("输出须为新文件");writeFileSync(out,JSON.stringify(qualityDraft(data.current,v("--phase")||"pre_delivery",JSON.parse(readFileSync(data.preflight.path,"utf8")).inputs),null,2)+"\n");console.log(JSON.stringify({status:"not_reviewed",out}));}
else if(action==="check"){assertQualityReport(data);console.log(JSON.stringify({status:"evidence_valid",visual_quality:"requires_author_judgment_and_user_validation"}));}else throw Error("action须为init或check");
}catch(e){console.error(String(e));process.exitCode=1;}
