import{qualityDraft,PHASES}from'../../scripts/src/visual-quality.js';
export function qualityFixture(write:any,current:any,inputs:any={}){
 const ref=write('reference.png','参考图像文件，仅作绑定测试'),reduced=write('reduced.png','缩小主位对照文件，仅作绑定测试');
 const reports:any={};
 for(const phase of PHASES){const r=qualityDraft(current,phase,inputs);Object.assign(r,{status:'author_review_passed',core_explanation_sufficient:true,core_explanation_evidence:'同一条件下左右状态变化支持主要判断，限定在正文紧邻。',composition_passed:true,full_build_ready:true});
 for(const k of Object.keys(r.composition_evidence))r.composition_evidence[k]='此测试字段'+k+'指向当前主体、证据与阅读方向，测试仅验证合同。';
 for(const k of Object.keys(r.full_build_readiness_evidence))r.full_build_readiness_evidence[k]='此测试字段'+k+'说明当前解释与剩余精修路径，非真实审美判定。';
 r.reference_comparisons=[{reference:ref,reference_region:'参考图中央同一对象的状态变化',current_region:'当前左侧条件和右侧结果相互对应',achieved:'当前同基准配对减少读者自行匹配',gap:'局部细节仍比参考少但主关系完整',decision:'保留配对并在精修补齐对象部件'}];
 r.key_expression={needed:false,reason:'本次已有简单且可读的条件对照，无未解决表达难点。',alternatives:[],selected:null};
 r.dominant_object={region:'中央跨两侧的完整比较区域',specific_contribution:'状态变化和限定共同承担主要判断',reduced_alternative:reduced,decision:'keep',reason:'缩小后状态标签更难配对，当前主位有贡献'};
 r.series_repetition_check={scope:'测试首图尚无相邻图，仅校准当前参考',comparisons:[]};r.strongest_gap={status:'resolved',observation:'原条件标签离对象过远易误配',resolution:'已移动至各自对象旁并在当前图复核'};
 r.revision={previous:null,affected_checks:[],rechecked:[],basis:'本测试为首张构图，无上一版可继承结论。'};reports[phase]=r;}
 const refs=Object.fromEntries(PHASES.map(p=>[p,write(p+'.json',reports[p])]));
 return{reports,ref,reduced,trial:{status:'author_review_passed',...refs}};
}
