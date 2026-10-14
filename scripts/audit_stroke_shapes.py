#!/usr/bin/env python3
"""v0.6.0 stroke-shape audit. usage: audit_stroke_shapes.py scene.excalidraw
Limits come from design_tokens.json stroke.path_limits (no hard-coded workaround):
non-solid strokes; paths with > max_points; roughness > long_path_max_roughness on paths longer than long_path_px;
ellipses wider than large_ellipse_px with roughness > large_ellipse_max_roughness. Exit 1 if anything is flagged."""
import json, sys, math
from pathlib import Path
L_ = json.load(open(Path(__file__).resolve().parents[1] / "design_tokens.json"))["stroke"]["path_limits"]
BAD = []
for e in json.load(open(sys.argv[1]))["elements"]:
  if e["type"] == "text": continue
  r = (e.get("customData") or {}).get("stroke_role"); pts = e.get("points") or []
  L = sum(math.dist(a, b) for a, b in zip(pts, pts[1:])) if pts else 2 * (e["width"] + e["height"])
  f = []
  if e.get("strokeStyle") != "solid": f.append("style")
  if len(pts) > L_["max_points_per_path"]: f.append(f"{len(pts)}pts")
  if pts and r not in L_.get("long_path_exempt_roles", []) and e["roughness"] > L_["long_path_max_roughness"] and L > L_["long_path_px"]: f.append(f"rough{e['roughness']}xlen{int(L)}")
  if e["type"] == "ellipse" and e["roughness"] > L_["large_ellipse_max_roughness"] and e["width"] > L_["large_ellipse_px"]: f.append(f"ellipse r{e['roughness']}")
  if f: print(e["type"], r, round(e["x"]), round(e["y"]), f); BAD.append(1)
sys.exit(1 if BAD else 0)
