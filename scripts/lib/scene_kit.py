"""Excalidraw 场景绘制工具：读取现行字号、笔触与色卡，提供页面合同件与出图前碰撞检查。

只提供基本图元、页眉页脚等合同件和少量多部件物件示范；不提供任何构图模板。
用法见 references/rules/scene_kit_usage.md。
"""
import json
import math
from pathlib import Path

SKILL = Path(__file__).resolve().parents[2]
TOKENS_PATH = SKILL / "assets" / "design_tokens.json"
COLOR_LIBRARY_PATH = SKILL / "assets" / "color-library.json"

CANVAS_W, CANVAS_H = 1200, 1600
SAFE_LEFT, SAFE_RIGHT = 80, 1120
# roughness ≥1.6 的图形会越过坐标 2–4px，坐标须离安全区边缘至少 ROUGH_INSET。
# roughness ≤1.4（徽章、细节、信息框、排版线）放在 x=80 时实测墨迹约 77.5，正好达标，可以贴边。
ROUGH_INSET = 3
EDGE_SAFE_ROUGHNESS = 1.4
# text_width() 对中文按 1.04em 估算，比实际渲染宽约 3%；判断文字越界时扣除这部分。
TEXT_WIDTH_SLACK = 0.03
# audit_overlap_margins 把 765-(R+G+B) > 40 的像素算作墨迹；文字下的底色必须低于此值。
UNDER_TEXT_INK_LIMIT = 36
HEADER = {"meta_y": 64, "title_y": 100, "subtitle_y": 162, "rule_y": 206, "conclusion_y": 220}
def footer_positions(canvas, font_size):
    # 按底部可见目标预留一行字高；最终字形边界仍由真实PNG审计确认。
    line2_y = canvas["height"] - canvas["bottom_visible_target"] - font_size
    return {"rule_y": line2_y - 40, "line1_y": line2_y - 28, "line2_y": line2_y}


_DEFAULT_TOKENS = json.loads(TOKENS_PATH.read_text(encoding="utf-8"))
FOOTER = footer_positions(_DEFAULT_TOKENS["canvas"], _DEFAULT_TOKENS["typography"]["role_sizes"]["footer_meta"])


def _hex(c):
    c = c.lstrip("#")
    return tuple(int(c[i:i + 2], 16) for i in (0, 2, 4))


def _to_hex(rgb):
    return "#" + "".join(f"{max(0, min(255, round(v))):02X}" for v in rgb)


def mix(color, other, t):
    """t=0 返回 color，t=1 返回 other。"""
    a, b = _hex(color), _hex(other)
    return _to_hex([a[i] + (b[i] - a[i]) * t for i in range(3)])


def ink_value(color):
    if color in (None, "transparent"):
        return 0
    return 765 - sum(_hex(color))


def under_text_ok(color):
    return ink_value(color) <= UNDER_TEXT_INK_LIMIT


def _lightest_under_text(color):
    t = 0.85
    while t < 0.995:
        candidate = mix(color, "#FFFFFF", t)
        if under_text_ok(candidate):
            return candidate
        t += 0.01
    return "#FFFFFF"


class Palette:
    """由色卡主色、辅色派生同族色阶；under_text_* 保证放在文字下不被判为压线。"""

    def __init__(self, primary, accent, ink="#273348", weak="#5E6A78"):
        self.ink, self.weak, self.white = ink, weak, "#FFFFFF"
        self.primary, self.accent = primary, accent
        self.primary_dark = mix(primary, "#000000", 0.27)
        self.primary_mid = mix(primary, "#FFFFFF", 0.42)
        self.primary_tint = mix(primary, "#FFFFFF", 0.72)
        self.primary_soft = mix(primary, "#FFFFFF", 0.89)
        self.accent_dark = mix(accent, "#000000", 0.25)
        self.accent_tint = mix(accent, "#FFFFFF", 0.70)
        self.accent_soft = mix(accent, "#FFFFFF", 0.89)
        self.under_text_primary = _lightest_under_text(primary)
        self.under_text_accent = _lightest_under_text(accent)

    @classmethod
    def from_library(cls, card_id, path=COLOR_LIBRARY_PATH):
        lib = json.loads(Path(path).read_text(encoding="utf-8"))
        for card in lib["palettes"]:
            if card["id"] == str(card_id).zfill(2):
                return cls(card["primary"], card["accent"], ink=lib.get("ink", "#273348"))
        raise KeyError(f"色卡 {card_id} 不在 color-library.json")


def text_width(s, font_size):
    return sum(font_size * (0.62 if ord(ch) < 128 else 1.04) for ch in s) + 2


class SceneKitError(Exception):
    pass


class Board:
    def __init__(self, prefix, palette, tokens_path=TOKENS_PATH):
        tokens = json.loads(Path(tokens_path).read_text(encoding="utf-8"))
        self.roles = {k: (v["strokeWidth"], v["roughness"]) for k, v in tokens["stroke"]["role_settings"].items()}
        self.sizes = dict(tokens["typography"]["role_sizes"])
        self.footer_positions = footer_positions(tokens["canvas"], self.sizes["footer_meta"])
        self.min_size = tokens["typography"]["min_readable"]
        self.strong = set(tokens["typography"]["strong_inner_roles"])
        self.ellipse_limit = tokens["stroke"]["path_limits"]["large_ellipse_px"]
        self.p = palette
        self.prefix = prefix
        self.els = []
        self.n = 0

    # ---------- 基本图元 ----------
    def _id(self, kind):
        self.n += 1
        return f"{self.prefix}_{kind}_{self.n:04d}", self.n

    def _base(self, kind, x, y, w, h, stroke, bg, role, roundness=None, solid=True, opacity=100,
              under_text=False, allow_outside=False):
        if role not in self.roles:
            raise SceneKitError(f"未知笔触角色 {role}")
        if under_text and not under_text_ok(bg):
            raise SceneKitError(f"{bg} 太深，不能放在文字下；改用 palette.under_text_*")
        i, s = self._id(kind)
        sw, ro = self.roles[role]
        e = {
            "id": i, "type": kind, "x": float(x), "y": float(y), "width": float(max(w, 1)), "height": float(max(h, 1)),
            "angle": 0.0, "strokeColor": "transparent" if role == "fill_only" else stroke,
            "backgroundColor": bg, "fillStyle": "solid", "strokeWidth": sw, "strokeStyle": "solid",
            "roughness": ro, "opacity": opacity, "groupIds": [], "roundness": roundness, "version": 1,
            "versionNonce": s, "isDeleted": False, "boundElements": None, "link": None, "locked": False,
            "updated": 1, "seed": s * 7 + 11, "customData": {"stroke_role": role},
        }
        e["_solid"] = solid and not under_text
        e["_outside_ok"] = allow_outside
        self.els.append(e)
        return e

    def rect(self, x, y, w, h, stroke=None, bg="transparent", role="object_simple", rounded=False, solid=True,
             opacity=100, under_text=False, allow_outside=False):
        return self._base("rectangle", x, y, w, h, stroke or self.p.ink, bg, role, {"type": 3} if rounded else None,
                          solid, opacity, under_text, allow_outside)

    def ellipse(self, x, y, w, h, stroke=None, bg="transparent", role="object_simple", solid=True, opacity=100,
                under_text=False):
        if max(w, h) > self.ellipse_limit and self.roles[role][1] > 1.0:
            role = "curve"
        return self._base("ellipse", x, y, w, h, stroke or self.p.ink, bg, role, None, solid, opacity, under_text)

    def poly(self, pts, stroke=None, bg="transparent", role="detail", closed=True, smooth=False, arrow=False,
             solid=True, opacity=100, eid=None, start_arrow=False, under_text=False):
        pts = [tuple(p) for p in pts]
        if closed and pts[0] != pts[-1]:
            pts.append(pts[0])
        x0, y0 = pts[0]
        rel = [[round(px - x0, 2), round(py - y0, 2)] for px, py in pts]
        xs, ys = [p[0] for p in rel], [p[1] for p in rel]
        e = self._base("arrow" if arrow else "line", x0, y0, max(xs) - min(xs), max(ys) - min(ys),
                       stroke or self.p.ink, bg if closed else "transparent", role,
                       {"type": 2} if smooth else None, solid, opacity, under_text)
        e.update({"points": rel, "lastCommittedPoint": None, "startBinding": None, "endBinding": None,
                  "startArrowhead": "arrow" if start_arrow else None, "endArrowhead": "arrow" if arrow else None})
        e["_bbox"] = (min(p[0] for p in pts), min(p[1] for p in pts), max(p[0] for p in pts), max(p[1] for p in pts))
        if eid:
            e["id"] = eid
        return e

    def line(self, pts, stroke=None, role="detail", smooth=False, arrow=False, solid=True, eid=None, opacity=100,
             start_arrow=False):
        return self.poly(pts, stroke, "transparent", role, closed=False, smooth=smooth, arrow=arrow,
                         solid=solid, eid=eid, opacity=opacity, start_arrow=start_arrow)

    def text(self, x, y, s, role, color=None, func=None, extra=None):
        if role not in self.sizes:
            raise SceneKitError(f"未知字号角色 {role}")
        fs = self.sizes[role]
        if fs < self.min_size:
            raise SceneKitError(f"{role} 字号 {fs} 低于最小可读 {self.min_size}")
        rows = s.split("\n")
        w = max(text_width(r, fs) for r in rows)
        h = len(rows) * fs * 1.25
        first = None
        for dx in ([0, 0.8] if role in self.strong else [0]):
            i, sd = self._id("t")
            cd = {"typography_role": role}
            if func:
                cd["text_function"] = func
            if extra:
                cd.update(extra)
            e = {
                "id": i, "type": "text", "x": round(x + dx, 2), "y": float(y), "width": round(w, 2), "height": h,
                "angle": 0, "strokeColor": color or self.p.ink, "backgroundColor": "transparent",
                "fillStyle": "solid", "strokeWidth": 1, "strokeStyle": "solid", "roughness": 0, "opacity": 100,
                "groupIds": [], "roundness": None, "version": 1, "versionNonce": sd, "isDeleted": False,
                "boundElements": None, "link": None, "locked": False, "updated": 1, "seed": sd, "text": s,
                "fontSize": fs, "fontFamily": 2, "textAlign": "left", "verticalAlign": "top", "containerId": None,
                "originalText": s, "autoResize": False, "lineHeight": 1.25, "customData": cd,
            }
            self.els.append(e)
            first = first or e
        return first

    def text_box(self, x, y, s, role):
        """返回文字外框 (x0, y0, x1, y1)，用于排布前估算。"""
        fs = self.sizes[role]
        rows = s.split("\n")
        return (x, y, x + max(text_width(r, fs) for r in rows), y + len(rows) * fs * 1.25)

    # ---------- 页面合同件 ----------
    def badge(self, x, y, n):
        self.ellipse(x, y + 2, 30, 30, self.p.primary, self.p.primary, "object_simple", solid=False)
        self.text(x + 10, y + 5, str(n), "annotation", self.p.white, func="navigation",
                  extra={"navigation_number": n})

    def section(self, x, y, n, title, color=None):
        self.badge(x, y, n)
        return self.text(x + 38, y, title, "overview_section", color or self.p.primary_dark)

    def chrome(self, meta, title, subtitle, conclusion, title_role="overview_title"):
        """页眉：栏目标签、主标题、副标题、页眉线、整页结论。副标题只写内容陈述，不写节目或专辑名。"""
        self.rect(0, 0, CANVAS_W, CANVAS_H, self.p.white, self.p.white, "fill_only", solid=False, allow_outside=True)
        self.rect(SAFE_LEFT, HEADER["meta_y"] + 8, 28, 8, self.p.primary, self.p.primary, "fill_only", solid=False)
        self.text(SAFE_LEFT + 38, HEADER["meta_y"], meta, "header_meta", self.p.weak, func="chrome")
        self.text(SAFE_LEFT, HEADER["title_y"], title, title_role, self.p.ink)
        self.text(SAFE_LEFT, HEADER["subtitle_y"], subtitle, "overview_thesis", self.p.primary,
                  extra={"text_function": "subtitle"})
        self.line([(SAFE_LEFT, HEADER["rule_y"]), (SAFE_RIGHT, HEADER["rule_y"])], self.p.primary_mid, "rule",
                  eid="header_rule", solid=False)
        self.text(SAFE_LEFT, HEADER["conclusion_y"], conclusion, "page_conclusion", self.p.primary_dark)

    def outline(self, y, items, h=52):
        self.rect(SAFE_LEFT, y, SAFE_RIGHT - SAFE_LEFT, h, self.p.primary_mid, self.p.under_text_primary, "frame",
                  under_text=True)
        self.text(SAFE_LEFT + 16, y + 10, "本页提纲", "subheading", self.p.primary_dark)
        self.text(SAFE_LEFT + 150, y + 14, items, "annotation", self.p.ink, func="navigation")

    def footer(self, source_lines, page_label):
        self.line([(SAFE_LEFT, self.footer_positions["rule_y"]), (SAFE_RIGHT, self.footer_positions["rule_y"])], self.p.primary_mid, "rule",
                  eid="footer_rule", solid=False)
        for k, line in enumerate(source_lines[:2]):
            self.text(SAFE_LEFT, self.footer_positions["line1_y"] + 28 * k, line, "footer_meta", self.p.ink, func="source")
        self.text(SAFE_RIGHT - text_width(page_label, self.sizes["footer_meta"]), self.footer_positions["line1_y"], page_label,
                  "footer_meta", self.p.ink, func="chrome")

    # ---------- 多部件物件示范（校准完成度用，不是构图模板） ----------
    def wobble(self, x0, y0, x1, y1, amp=2.0, step=40, phase=0.0):
        n = max(2, int(math.hypot(x1 - x0, y1 - y0) / step))
        pts = []
        dx, dy = x1 - x0, y1 - y0
        length = math.hypot(dx, dy) or 1
        for i in range(n + 1):
            t = i / n
            off = amp * math.sin(t * math.pi * n * 0.7 + phase) if 0 < i < n else 0
            pts.append((x0 + dx * t - dy / length * off, y0 + dy * t + dx / length * off))
        return pts

    def crate(self, x, y, w=26, h=22):
        self.rect(x, y, w, h, self.p.accent, self.p.accent_tint, "object_simple")
        self.line([(x + 3, y + h * 0.5), (x + w - 3, y + h * 0.5)], self.p.accent, "detail")
        self.line([(x + w * 0.5, y + 3), (x + w * 0.5, y + h * 0.5)], self.p.accent, "detail")

    def folder(self, x, y, w=54, h=38, paper=True):
        self.poly([(x, y + 6), (x + 16, y + 6), (x + 20, y), (x + 34, y), (x + 38, y + 6), (x + w, y + 6),
                   (x + w, y + h), (x, y + h)], self.p.ink, self.p.accent_soft, "object_simple")
        if paper:
            self.rect(x + 6, y - 6, w - 18, 14, self.p.primary_mid, self.p.white, "detail")
        self.line([(x + 8, y + 18), (x + w - 10, y + 18)], self.p.primary_mid, "detail")
        self.line([(x + 8, y + 26), (x + w - 18, y + 26)], self.p.primary_mid, "detail")

    def cup(self, x, y, s=1.0):
        k = lambda px, py: (x + px * s, y + py * s)
        self.poly([k(0, 0), k(26, 0), k(22, 22), k(4, 22)], self.p.ink, self.p.white, "object_simple")
        self.line([k(26, 5), k(32, 8), k(31, 15), k(24, 16)], self.p.ink, "detail", smooth=True)

    def parcel(self, x, y, w=96, h=72):
        d = 16
        a, tint = self.p.accent, self.p.accent_tint
        self.poly([(x, y + d), (x + d, y), (x + w + d, y), (x + w, y + d)], a, tint, "object_simple")
        self.poly([(x + w, y + d), (x + w + d, y), (x + w + d, y + h), (x + w, y + h + d)], a, tint, "object_simple")
        self.rect(x, y + d, w, h, a, self.p.accent_soft, "object")
        self.rect(x + w / 2 - 6, y + d, 12, h, a, a, "detail")

    def book(self, x, y):
        self.poly([(x, y + 4), (x + 22, y), (x + 22, y + 30), (x, y + 34)], self.p.primary_dark, self.p.primary_tint,
                  "object_simple")
        self.poly([(x + 22, y), (x + 44, y + 4), (x + 44, y + 34), (x + 22, y + 30)], self.p.primary_dark,
                  self.p.white, "object_simple")
        self.line([(x + 27, y + 10), (x + 39, y + 12)], self.p.primary_mid, "detail")
        self.line([(x + 27, y + 18), (x + 39, y + 20)], self.p.primary_mid, "detail")

    # ---------- 出图前检查 ----------
    @staticmethod
    def _box(e):
        if "_bbox" in e:
            return e["_bbox"]
        return (e["x"], e["y"], e["x"] + e["width"], e["y"] + e["height"])

    @staticmethod
    def _hit(a, b, pad=0):
        return a[0] < b[2] - pad and b[0] < a[2] - pad and a[1] < b[3] - pad and b[1] < a[3] - pad

    def problems(self):
        texts = [e for e in self.els if e["type"] == "text"]
        out = []
        for i, a in enumerate(texts):
            ba = self._box(a)
            slack = (ba[2] - ba[0]) * TEXT_WIDTH_SLACK
            if ba[0] < SAFE_LEFT - 0.5 or ba[2] - slack > SAFE_RIGHT + 0.5 or ba[1] < 0 or ba[3] > CANVAS_H:
                out.append(f"文字出安全区 {a['text'][:16]!r} {tuple(round(v) for v in ba)}")
            for b in texts[i + 1:]:
                if a["text"] == b["text"] and abs(a["y"] - b["y"]) < .5 and .5 <= abs(a["x"] - b["x"]) <= 1.5:
                    continue
                if self._hit(ba, self._box(b)):
                    out.append(f"文字互叠 {a['text'][:12]!r}@{a['y']:.0f} × {b['text'][:12]!r}@{b['y']:.0f}")
            for s in self.els:
                if s["type"] != "text" and s.get("_solid") and self._hit(ba, self._box(s), pad=1):
                    out.append(f"文字压图形 {a['text'][:12]!r}@{a['y']:.0f} × {s['id']} "
                               f"{tuple(round(v) for v in self._box(s))}")
        for s in self.els:
            if s["type"] == "text" or s.get("_outside_ok") or s["strokeColor"] == "transparent" \
                    or s["roughness"] <= EDGE_SAFE_ROUGHNESS:
                continue
            b = self._box(s)
            if b[0] < SAFE_LEFT + ROUGH_INSET or b[2] > SAFE_RIGHT - ROUGH_INSET:
                out.append(f"图形贴近或越出安全区（手绘笔触会外溢）{s['id']} x={b[0]:.0f}–{b[2]:.0f}")
        return out

    def finish(self, path):
        found = self.problems()
        if found:
            raise SceneKitError("出图前检查未通过：\n" + "\n".join(found[:60]) + f"\n共 {len(found)} 项")
        for e in self.els:
            for k in ("_solid", "_bbox", "_outside_ok"):
                e.pop(k, None)
        scene = {"type": "excalidraw", "version": 2, "source": "podcast-knowledge-visual-pack", "elements": self.els,
                 "appState": {"viewBackgroundColor": "#FFFFFF", "gridSize": None, "width": CANVAS_W,
                              "height": CANVAS_H}, "files": {}}
        out = Path(path)
        out.parent.mkdir(parents=True, exist_ok=True)
        out.write_text(json.dumps(scene, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
        return out
