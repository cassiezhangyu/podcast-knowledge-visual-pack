#!/usr/bin/env python3
"""Pixel-level overlap/margin audit (v0.5.1 standard QA). Exit 1 on fail. usage: audit.py scene.excalidraw [scale]
- text vs graphics: renders text-only and graphics-only layers, ANDs dilated text ink with graphic ink
  (fill-only/surface rectangles excluded; hatch lines reported separately as 'hatch')
- text vs text: texts split into non-adjacent groups, rendered separately, pairwise AND of dilated ink
- margins: ink outside x∈[80,1120] (except full-bleed bg/album slot), gap from body ink to footer rule
- header/side (v0.6.2): left/right margin symmetry (|left−right| ≤ 6px), top ink ≥ 40px from page top,
  gap from header rule (long rule above y=400) to first body ink below it ≥ 12px"""
import json, sys, subprocess, tempfile, os, itertools, argparse
import numpy as np
from PIL import Image

class ndimage:
  @staticmethod
  def binary_dilation(m, iterations=1):
    r=iterations; o=m.copy()
    for dy in range(-r,r+1):
      for dx in range(-r,r+1):
        if dx*dx+dy*dy<=r*r: o|=np.roll(np.roll(m,dy,0),dx,1)
    return o
  @staticmethod
  def label(m):
    import collections
    h,w=m.shape; lab=np.zeros((h,w),int); n=0; ys,xs=np.nonzero(m)
    for y,x in zip(ys,xs):
      if lab[y,x]: continue
      n+=1; q=collections.deque([(y,x)]); lab[y,x]=n
      while q:
        cy,cx=q.popleft()
        for ny,nx in ((cy+1,cx),(cy-1,cx),(cy,cx+1),(cy,cx-1)):
          if 0<=ny<h and 0<=nx<w and m[ny,nx] and not lab[ny,nx]: lab[ny,nx]=n; q.append((ny,nx))
    return lab,n
  @staticmethod
  def find_objects(lab):
    out=[]
    for i in range(1,lab.max()+1):
      ys,xs=np.nonzero(lab==i); out.append((slice(ys.min(),ys.max()+1),slice(xs.min(),xs.max()+1)))
    return out
from pathlib import Path
SK = str(Path(__file__).resolve().parents[1])
RUNTIME = os.environ.get("PKVP_RUNTIME") or (SK if (Path(SK) / "dist").exists() else None)
if RUNTIME is None and (Path(SK) / "RUNTIME_ROOT.json").exists():  # workflow mirror: no node runtime here
  RUNTIME = json.load(open(Path(SK) / "RUNTIME_ROOT.json"))["runtime_root"]
RENDERER = str(Path(RUNTIME or SK) / "scripts" / "render_scene.mjs")
parser = argparse.ArgumentParser()
parser.add_argument("scene"); parser.add_argument("scale", nargs="?", type=float, default=2.0)
parser.add_argument("--design-tokens", default=str(Path(SK) / "assets/design_tokens.json"))
opts = parser.parse_args(); src = opts.scene; sc = opts.scale
canvas = json.load(open(opts.design_tokens))["canvas"]
D = json.load(open(src)); E = D["elements"]
tmp = tempfile.mkdtemp()
CANVAS = [e for e in E if e["type"] == "rectangle" and e["x"] == 0 and e["y"] == 0 and e["width"] >= 1200]
def render(elems, name):
  d = dict(D); d["elements"] = CANVAS + [e for e in elems if e not in CANVAS]; p = f"{tmp}/{name}.excalidraw"; json.dump(d, open(p, "w"))
  return p, f"{tmp}/{name}.png"
def ink(png, thr=40):
  a = np.asarray(Image.open(png).convert("RGB")).astype(int); return (765 - a.sum(2)) > thr
def light(c):
  try: r, g, b = (int(c[i:i + 2], 16) for i in (1, 3, 5)); return (max(r, g, b) + min(r, g, b)) / 510
  except Exception: return 0
texts = [e for e in E if e["type"] == "text"]
def role(e): return (e.get("customData") or {}).get("stroke_role", "")
bgfill = [e for e in E if e["type"] == "rectangle" and e["strokeColor"] == "transparent" and light(e["backgroundColor"]) > 0.88]
def is_hatch(e): return e["type"] == "line" and (e.get("customData") or {}).get("stroke_role") == "detail" and light(e["strokeColor"]) > 0.62
graph = [e for e in E if e["type"] != "text" and e not in bgfill and not is_hatch(e)]
hatch = [e for e in E if e["type"] != "text" and e not in bgfill and is_hatch(e)]
# group texts so that texts in same group are far apart (>40px)
def box(e, pad=40): return (e["x"] - pad, e["y"] - pad, e["x"] + e["width"] + pad, e["y"] + e["height"] + pad)
def near(a, b):
  A, B = box(a), box(b); return not (A[2] < B[0] or B[2] < A[0] or A[3] < B[1] or B[3] < A[1])
groups = []
for t in texts:
  twin = [g for g in groups if any(u["text"] == t["text"] and abs(u["x"] - t["x"]) <= 2 and abs(u["y"] - t["y"]) <= 2 for u in g)]
  if twin: twin[0].append(t); continue
  for g in groups:
    if not any(near(t, u) for u in g): g.append(t); break
  else: groups.append([t])
jobs = [render(graph, "G"), render(hatch, "H")] + [render(g, f"T{i}") for i, g in enumerate(groups)]
args = []
for i, o in jobs: args += [i, o, str(sc)]
subprocess.run(["node", RENDERER] + args, cwd=RUNTIME or SK, env=dict(os.environ, PKVP_RUNTIME=RUNTIME or SK, PKVP_AUDIT_LAYER="1"), check=True, stdout=subprocess.DEVNULL)
G, H = ink(jobs[0][1]), ink(jobs[1][1]); Ts = [ink(o) for _, o in jobs[2:]]
dil = lambda m, r: ndimage.binary_dilation(m, iterations=max(1, int(r * sc)))
T = np.any(Ts, 0); Td = dil(T, 2)
def report(mask, label):
  lab, n = ndimage.label(dil(mask, 2)); out = []
  for sl in ndimage.find_objects(lab):
    y0, y1 = sl[0].start / sc, sl[0].stop / sc; x0, x1 = sl[1].start / sc, sl[1].stop / sc
    who = [t["text"].split("\n")[0][:14] for t in texts if t["x"] - 6 < x1 and t["x"] + t["width"] + 6 > x0 and t["y"] - 6 < y1 and t["y"] + t["height"] + 6 > y0]
    out.append({"kind": label, "x": round(x0), "y": round(y0), "w": round(x1 - x0), "h": round(y1 - y0), "texts": who})
  return out
issues = report(Td & G, "text×line") + report(Td & H, "text×hatch")
tt = np.zeros_like(T)
for a, b in itertools.combinations(range(len(Ts)), 2): tt |= dil(Ts[a], 2) & Ts[b]
issues += report(tt, "text×text")
# margins on full composite (text + graph), ignore album-art slot and canvas bg
full = T | G | H; h, w = full.shape
art = np.zeros_like(full); art[int(60 * sc):int(212 * sc), int(972 * sc):int(1124 * sc)] = True
xs = np.where((full & ~art).any(0))[0]; ys = np.where(full.any(1))[0]
L, R = xs.min() / sc, (xs.max() + 1) / sc
rule_y = max([e["y"] for e in E if e["type"] == "line" and e.get("width", 0) > 900], default=1490)
above = full[: int((rule_y - 5) * sc)]; body_bottom = np.where(above.any(1))[0].max() / sc
W_PAGE = canvas["width"]
sym = abs(L - (W_PAGE - R))
top_ink = ys.min() / sc
hrules = [e["y"] for e in E if e["type"] == "line" and e.get("width", 0) > 900 and e["y"] < 400]
head_gap = None
if hrules:
  hy = max(hrules); below = full[int((hy + 5) * sc):]
  rows = np.where(below.any(1))[0]
  if len(rows): head_gap = float(round(rows.min() / sc + 5, 1))
res = {"scene": os.path.basename(src), "ink_left": float(round(L, 1)), "ink_right": float(round(R, 1)), "footer_rule_y": rule_y,
       "gap_body_to_footer_rule": float(round(rule_y - body_bottom, 1)), "issues": issues,
       "side_margin_asymmetry": float(round(sym, 1)), "top_ink": float(round(top_ink, 1)),
       "header_rule_y": max(hrules) if hrules else None, "gap_header_rule_to_body": head_gap,
       "pass": bool(not issues and L >= canvas["safe_left"] - canvas["ink_boundary_tolerance"] and R <= canvas["safe_right"] + canvas["ink_boundary_tolerance"] and rule_y - body_bottom >= 12
                    and sym <= canvas["side_margin_tolerance"] and top_ink >= 40 and (head_gap is None or head_gap >= 12))}
print(json.dumps(res, ensure_ascii=False, indent=1))
sys.exit(0 if res["pass"] else 1)
