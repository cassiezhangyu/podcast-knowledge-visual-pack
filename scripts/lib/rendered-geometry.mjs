// 在正式浏览器适配器内分层重渲，只诊断像素接触，不判语义或 TARGET。
export async function auditRenderedGeometry({scene,tokens}) {
  const elements=scene.elements.filter(e=>!e.isDeleted);
  const backgrounds=elements.filter(e=>e.type==='rectangle'&&e.x===0&&e.y===0&&e.width===tokens.canvas.width&&e.height===tokens.canvas.height);
  if(backgrounds.length!==1)throw new Error('像素诊断需要唯一的全幅画布以保持分层坐标一致');
  const texts=elements.filter(e=>e.type==='text');
  const strong=tokens.typography.strong_inner_roles;
  const twin=(a,b)=>a.text===b.text&&a.strokeColor===b.strokeColor&&a.fontSize===b.fontSize&&a.customData?.typography_role===b.customData?.typography_role&&strong.includes(a.customData?.typography_role)&&Math.abs(a.x-b.x)>=.5&&Math.abs(a.x-b.x)<=1.5&&Math.abs(a.y-b.y)<=.5;
  const near=(a,b)=>a.x-4<b.x+b.width+4&&b.x-4<a.x+a.width+4&&a.y-4<b.y+b.height+4&&b.y-4<a.y+a.height+4;
  const groups=[];
  for(const t of texts){let group=groups.find(g=>g.some(u=>twin(t,u)));if(!group)group=groups.find(g=>g.every(u=>!near(t,u)));if(group)group.push(t);else groups.push([t]);}
  const graphics=elements.filter(e=>e.type!=='text'&&!backgrounds.includes(e)&&!['fill_only','surface'].includes(e.customData?.stroke_role)).map(e=>({...e,backgroundColor:'transparent'}));
  const width=tokens.canvas.width,height=tokens.canvas.height;
  async function mask(items){
    const url=await window.renderPersistedExcalidrawScene({...scene,elements:[...backgrounds,...items]},tokens);
    const img=new Image();img.src=url;await img.decode();
    if(img.width!==width||img.height!==height)throw new Error('分层导出尺寸改变，像素诊断不可用');
    const cv=document.createElement('canvas');cv.width=width;cv.height=height;
    const ctx=cv.getContext('2d');ctx.drawImage(img,0,0);
    const data=ctx.getImageData(0,0,width,height).data,out=new Uint8Array(width*height);
    for(let i=0;i<out.length;i++)out[i]=765-data[4*i]-data[4*i+1]-data[4*i+2]>40?1:0;
    return out;
  }
  const gm=await mask(graphics),tm=[];
  for(const group of groups)tm.push(await mask(group));
  const findings=[];
  function intersection(a,b,kind,ids){
    let x0=width,y0=height,x1=-1,y1=-1,pixels=0;
    for(let i=0;i<a.length;i++)if(a[i]&&b[i]){pixels++;const x=i%width,y=Math.floor(i/width);x0=Math.min(x0,x);y0=Math.min(y0,y);x1=Math.max(x1,x);y1=Math.max(y1,y);}
    if(pixels)findings.push({kind,pixels,bounds:{x:x0,y:y0,width:x1-x0+1,height:y1-y0+1},text_ids:ids});
  }
  for(let i=0;i<tm.length;i++){
    intersection(tm[i],gm,'text_line_contact',groups[i].map(e=>e.id));
    for(let j=i+1;j<tm.length;j++)intersection(tm[i],tm[j],'text_text_contact',[...groups[i],...groups[j]].map(e=>e.id));
  }
  return {kind:'rendered_geometry_diagnostic',status:findings.length?'needs_rendered_review':'no_pixel_contacts_detected',findings,
    limits:'检查当前字形与去填色轮廓的实际接触；未检查文字到线条间距、容器留白、图形解释及视觉质量。合法叠放需按真实PNG判断。'};
}
