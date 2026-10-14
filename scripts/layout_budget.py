#!/usr/bin/env python3
"""Pre-render layout budget. Run BEFORE the first render.
usage: layout_budget.py budget.json
       layout_budget.py --scene draft.excalidraw [--min-gap 12] [--footer-gap 12]
  --scene: estimates every text block's real height from its own font size × line height × line count
  (no rendering), then checks vertical gaps between horizontally overlapping blocks and the gap
  above the footer rule (longest rule below y=1200, default 1490). Exit 1 on fail.
budget.json: {"canvas_h":1600,"body_top":<y under header/thesis>,"footer_rule_y":1490,
              "min_gap":20,"footer_gap":14,
              "blocks":[{"name":"① heading","h":40},{"name":"① body","h":180,"gap_after":22}, ...]}
Each block: h (estimated: lines × line-height of its token + diagram height), optional gap_after (default min_gap).
Prints the y-plan, the slack, and fails (exit 1) if the plan overruns the footer gap or any gap < min_gap.
Then render and run audit_overlap_margins.py before showing anyone the page."""
import json, sys
def scene_mode(path, min_gap, footer_gap):
  E = [e for e in json.load(open(path))["elements"] if not e.get("isDeleted")]
  rules = [e["y"] for e in E if e["type"] == "line" and e.get("width", 0) > 900 and e["y"] > 1200]
  foot = max(rules, default=1490); bad = []
  T = [e for e in E if e["type"] == "text" and e["y"] < foot - 5]
  for e in T:
    n = max(1, str(e.get("text", "")).count("\n") + 1)
    e["_h"] = n * e.get("fontSize", 20) * e.get("lineHeight", 1.25)
  T.sort(key=lambda e: e["y"])
  for i, a in enumerate(T):
    for b in T[i + 1:]:
      if b["x"] >= a["x"] + a["width"] or a["x"] >= b["x"] + b["width"]: continue
      if b["y"] < a["y"] + 1: continue
      gap = b["y"] - (a["y"] + a["_h"])
      if gap < 0: bad.append(f"estimated overlap {gap:.0f}px: '{a['text'][:12]}' → '{b['text'][:12]}'")
      break
  bottom = max((e["y"] + e["_h"] for e in T), default=0)
  print(f"text blocks {len(T)}  estimated body bottom {bottom:.0f}  footer rule {foot}  slack {foot - footer_gap - bottom:.0f}px")
  if bottom > foot - footer_gap: bad.append(f"body overruns footer gap by {bottom - (foot - footer_gap):.0f}px: trim text (do not shrink type) or recompose")
  for m in bad: print("FAIL", m)
  sys.exit(1 if bad else 0)
if len(sys.argv) > 2 and sys.argv[1] == "--scene":
  a = sys.argv; g = lambda k, d: float(a[a.index(k) + 1]) if k in a else d
  scene_mode(a[2], g("--min-gap", 12), g("--footer-gap", 12))
b = json.load(open(sys.argv[1])); y = b["body_top"]; bad = []
for i, k in enumerate(b["blocks"]):
  g = k.get("gap_after", b.get("min_gap", 20)); print(f"{y:6.0f}–{y + k['h']:6.0f}  {k['name']}  (+gap {g})")
  if g < b.get("min_gap", 20) and i < len(b["blocks"]) - 1: bad.append(f"gap after {k['name']} = {g}")
  y += k["h"] + (g if i < len(b["blocks"]) - 1 else 0)
limit = b["footer_rule_y"] - b.get("footer_gap", 14); slack = limit - y
print(f"end {y:.0f}  limit {limit}  slack {slack:.0f}px")
if slack < 0: bad.append(f"overrun by {-slack:.0f}px: trim text (do not shrink type) or recompose")
for m in bad: print("FAIL", m)
sys.exit(1 if bad else 0)
