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

def main():
 parser=argparse.ArgumentParser(description=__doc__)
 parser.add_argument('scene',type=Path,help='场景文件或场景目录')
 parser.add_argument('--design-tokens',type=Path,default=Path(__file__).resolve().parents[1]/'design_tokens.json',help='当前已批准参数；省略时使用Skill内置默认参数')
 args=parser.parse_args()
 typography=json.loads(args.design_tokens.read_text())['typography']
 sizes=typography['role_sizes'];strong_roles=set(typography['strong_inner_roles'])
 path=args.scene;files=sorted(path.glob('*.excalidraw')) if path.is_dir() else [path];errors=[];count=0
 if not files:raise SystemExit('没有可检查的场景')
 for f in files:
  n,issues=validate_scene(json.loads(f.read_text()),sizes,strong_roles);count+=n;errors += [f'{f.name}/{x}' for x in issues]
 print(json.dumps({'text_elements':count,'errors':errors,'passed':not errors},ensure_ascii=False,indent=2));sys.exit(bool(errors))
if __name__=='__main__':main()
