"""检查原生场景的文字角色、固定字号、强层级与潜在单行越界。"""
import argparse,json,sys,unicodedata
from pathlib import Path

def estimated_line_width(line,font_size):
 """保守估算 Excalidraw sans 单行宽度；最终仍以真实 PNG 为准。"""
 return sum(font_size*(1 if unicodedata.east_asian_width(char) in 'WF' else .56 if char.isalnum() else .5) for char in line)

def validate_scene(scene,sizes,strong_roles):
 errors=[];count=0
 texts=[e for e in scene['elements'] if e['type']=='text' and not e.get('isDeleted')]
 for e in texts:
  if e['type']!='text' or e.get('isDeleted'):continue
  count+=1;r=e.get('customData',{}).get('typography_role')
  if r not in sizes or e['fontSize']!=sizes.get(r):errors.append(f'{e["id"]}: role={r}, size={e["fontSize"]}, expected={sizes.get(r)}')
  for line_number,line in enumerate(e.get('text','').split('\n'),1):
   if estimated_line_width(line,e['fontSize']) > e.get('width',0)+e['fontSize']*.35:
    errors.append(f'{e["id"]}: 第{line_number}行可能超出文本宽度；请显式换行并检查真实 PNG 的边框间距')
  if r in strong_roles and not any(
   other is not e
   and other.get('text')==e.get('text')
   and other.get('strokeColor')==e.get('strokeColor')
   and other.get('fontSize')==e.get('fontSize')
   and other.get('customData',{}).get('typography_role')==r
   and 0.5<=abs(other.get('x',0)-e.get('x',0))<=1.5
   and abs(other.get('y',0)-e.get('y',0))<=0.5
   for other in texts
  ):errors.append(f'{e["id"]}: role={r} 缺少约 1px 的同角色重字副本')
 return count,errors

def scale_errors(scene,max_levels=5,min_step=2,phone_width=390,min_phone_px=7.1,canvas_width=1200):
 """v0.4.5-local：整页最多5级字号、相邻级至少差2px；390px手机预览上最小字高不低于min_phone_px。放不下就删字，不缩字。"""
 errors=[]
 sizes=sorted({e['fontSize'] for e in scene['elements'] if e.get('type')=='text' and not e.get('isDeleted')},reverse=True)
 if len(sizes)>max_levels:errors.append(f'字号层级{len(sizes)}级 {sizes}，超过{max_levels}级：合并相近层级')
 for a,b in zip(sizes,sizes[1:]):
  if a-b<min_step:errors.append(f'相邻字号 {a}/{b} 相差不足{min_step}px：读者分不清层级，合并为同一级')
 if sizes:
  phone=sizes[-1]*phone_width/canvas_width
  if phone<min_phone_px:errors.append(f'最小字号{sizes[-1]}px 在{phone_width}px手机预览上约{phone:.1f}px，低于{min_phone_px}px：删字或重排，不要缩字')
 return errors

def main():
 parser=argparse.ArgumentParser(description=__doc__)
 parser.add_argument('scene',type=Path,help='场景文件或场景目录')
 parser.add_argument('--design-tokens',type=Path,default=Path(__file__).resolve().parents[1]/'design_tokens.json',help='当前已批准参数；省略时使用Skill内置默认参数')
 parser.add_argument('--legacy-scale',action='store_true',help='仅用于v0.4.4之前已验收的历史参考：跳过5级/2px/手机最小字高检查')
 args=parser.parse_args()
 typography=json.loads(args.design_tokens.read_text())['typography']
 sizes=typography['role_sizes'];strong_roles=set(typography['strong_inner_roles'])
 path=args.scene;files=sorted(path.glob('*.excalidraw')) if path.is_dir() else [path];errors=[];count=0
 if not files:raise SystemExit('没有可检查的场景')
 for f in files:
  sc=json.loads(f.read_text());n,issues=validate_scene(sc,sizes,strong_roles)
  if not args.legacy_scale:issues+=scale_errors(sc)
 count+=n;errors += [f'{f.name}/{x}' for x in issues]
 print(json.dumps({'text_elements':count,'errors':errors,'passed':not errors},ensure_ascii=False,indent=2));sys.exit(bool(errors))
if __name__=='__main__':main()
