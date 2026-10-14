#!/usr/bin/env python3
"""v0.6.0 pre-render layout budget. Run BEFORE the first render.
usage: layout_budget.py budget.json
budget.json: {"canvas_h":1600,"body_top":<y under header/thesis>,"footer_rule_y":1490,
              "min_gap":20,"footer_gap":14,
              "blocks":[{"name":"① heading","h":40},{"name":"① body","h":180,"gap_after":22}, ...]}
Each block: h (estimated: lines × line-height of its token + diagram height), optional gap_after (default min_gap).
Prints the y-plan, the slack, and fails (exit 1) if the plan overruns the footer gap or any gap < min_gap.
Then render and run audit_overlap_margins.py before showing anyone the page."""
import json, sys
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
