import {deflateSync} from 'node:zlib';
export function marginPng(scale=1,bottom=68){
 const w=1200*scale,h=1600*scale,raw=Buffer.alloc((w*3+1)*h,255);
 for(let y=0;y<h;y++){
  const row=y*(w*3+1);raw[row]=0;
  if(y===64*scale||y===Math.round((1600-bottom)*scale)-1){for(let x=80*scale;x<1120*scale;x++)raw.fill(0,row+1+x*3,row+4+x*3);}
 }
 const crc=b=>{let c=0xffffffff;for(const v of b){c^=v;for(let i=0;i<8;i++)c=(c>>>1)^((c&1)?0xedb88320:0);}return(c^0xffffffff)>>>0;};
 const chunk=(type,data)=>{const t=Buffer.from(type),n=Buffer.alloc(4),c=Buffer.alloc(4);n.writeUInt32BE(data.length);c.writeUInt32BE(crc(Buffer.concat([t,data])));return Buffer.concat([n,t,data,c]);};
 const ihdr=Buffer.alloc(13);ihdr.writeUInt32BE(w);ihdr.writeUInt32BE(h,4);ihdr[8]=8;ihdr[9]=2;
 return Buffer.concat([Buffer.from('89504e470d0a1a0a','hex'),chunk('IHDR',ihdr),chunk('IDAT',deflateSync(raw)),chunk('IEND',Buffer.alloc(0))]);
}
