# 原生手绘线条固定规则

每次出图读取本规则与 design_tokens.json → stroke.role_settings。1200×1600画布使用角色参数，其他画布整体同比例缩放。

## 已通过的校准

线感基准：`../examples/positive/ep88-p13-rough-stroke-accepted-2026-09-26/`。数值只看 design_tokens.json → stroke.role_settings；历次调参过程见该目录的 `CALIBRATION_HISTORY.md`。目标是稳定的手绘线（R11）：不颤抖，也不退成平直几何线。

## 角色
数值以design_tokens.json为唯一来源：object为较大的具体对象轮廓；object_simple为小幅、简单物件的单线轮廓；detail为对象内部部件；accent_detail为需更明显笔触的内圈、进度线等局部细节；relation为有来源且需要较强动态笔触的短关系箭头（≤220px；更长的用 curve，见 stroke.path_limits）；connector为抽象对象之间的简单直线连接；emphasis为批注或划除；heavy_detail为有动作含义的粗段；rule为排版分隔；surface为弱背景底板；frame为信息框及显示区域；fill_only为无描边色块。物件轮廓保持object或object_simple，不因元素类型为line而降级。纸张、衣物、镜子等允许局部自然复描；信息框不应与真实物件使用同样强的复描。

**易错分配：抽象标签框、信息框和导航框用 `frame`，不能因其画成矩形就套 `object` 的高 roughness；简单直线语义连接用 `connector`，需要明显动作感的箭头才用 `relation`。不得在单页脚本中为了消除双线而全局覆盖 token 到近乎机械直线。构图前先明确角色，scene 生成后先运行 `check_strokes.py`，角色或参数错误必须修复，再渲染实图。**

**默认画法：一条原生路径形成一条可见手绘线。** 信息框、抽象结果框、导航边界、长横线和页脚分隔线用 `frame`／`rule` 的轻微 roughness，保留笔触起伏，但在原尺寸应读成单线；若能沿边缘持续追出两条平行轮廓，就降低该线的复描感并重渲。不要通过再叠一条偏移线、同尺寸框或闭合描边副本制造手绘。具体物件的局部自然复描可保留，但不能扩散成全页双线框。所谓“单线”不是 roughness=0 的机械直线，也不是人为弯曲的光滑线。

小幅物件若因 `object` 的复描在原图里出现持续的双轮廓，改用 `object_simple` 并重渲核对；这仍是物件轮廓角色，不能用 `detail` 冒名规避检查。识别物件时先画清外形、提手或其他必要部件及装配位置，再决定填色。大块深色实心剪影若压过文字、让部件糊成一团，优先换成同系列浅底与单线轮廓。仅在实物识别和信息主次都因此更清楚时使用实心填充。检查原图与 390px 图：遮住物件旁标签仍应认出对象；画面应保留自然笔触，不能退化成机械图标。

## 执行与检查
- 保留点列、seed、真实曲线、闭合轮廓和部件接触；不追加波浪控制点、平移重描副本或随机噪声。圆弧来自对象本身。
- 共用边只绘制一次，避免相邻矩形叠线。拆边时保留填充与对象身份；按边角色声明参数。
- 同一信息框含浅底或表头时，先绘无描边底板与局部填充，再用一个 `frame` 图元绘外轮廓；不要让后画的填充压淡某一边。原图和灰度图都要比较同一外框的上、下、左、右边：角色参数相同仍可能因叠放顺序产生可见的颜色或粗细差异。
- 用户已通过的局部样稿优先作为本包校准，参数更高不等于手绘感更好。
- 运行python3 scripts/check_strokes.py <scene或目录>；角色合规后真实导出全尺寸、390px和灰度。参数合规不证明单线和手绘感同时成立；若原图出现平行双线，先检查是否将抽象框错分为 `object` 或将简单连接错分为 `relation`；若原图像机械直线，检查是否私自把 roughness 调得过低。修正后再次运行角色检查与实图审查。逐项检查信息框、长横线、导航边界和页脚：在原尺寸读成一条有笔触的线，局部放大也没有第二条完整平行描边；再检查插图自然、无穿字/断裂/错误连接。机器检查不能替代实际图片或独立审核。
- 修改只影响获准范围，冻结内容、布局和文字；需要改布局时说明具体碰撞证据，禁止借笔触返工重做已认可构图。


## v0.6.0：规则已写进 token

下面 v0.5.1 的规则现在就是 `design_tokens.json` 的 `stroke.path_limits`（≤6 点；>220px 路径与 >60px 椭圆 roughness ≤1.0），`relation`／`emphasis` 下调到 1.4；`audit_stroke_shapes.py` 直接读 token。按 token 选角色即可，不需要另作绕行。手绘感保留：curve 0.9、frame 1.1、短 object 2.0。

## v0.5.1 抖线根因（ETF E177 总览，Cassie 2026-10-13）

A-V7 的“抖、颤”不是 token 数值错，而是**路径形状和角色分配**错：飞轮四段弧各 11 点且用 `relation`（roughness 2.0）、成分股大椭圆用 `object`（2.0）、S 曲线 21 点、长箭头用 `relation`。roughness 在每个顶点叠加偏移，点越多、路径越长越像手抖；`emphasis`（1.6）画在弧线上会出现可见的双线。硬规则：

- 曲线、椭圆、圆环弧、长箭头（>220px）一律用 `curve` 角色（roughness 0.9）；`relation`/`emphasis` 只给短的、需要动作感的箭头。
- 任何 line/arrow 路径 ≤6 个点；弧线按每段约 25° 取点（3–5 段），不得逐度采样；S 曲线 5–6 个关键点即可。
- 大于 60px 的椭圆 roughness ≤1.0（用 `curve`）；抽象信息卡用 `frame`，不用 `object_simple`。
- 不用加粗角色制造“焦点”；焦点靠实心节点、尺寸和位置。

**标准 QA（交付前必跑，均以 exit 0 为通过）：**

1. `python3 scripts/check_strokes.py <scene>`（角色与 token）
2. `python3 scripts/audit_stroke_shapes.py <scene>`（点数／长路径 roughness／大椭圆 roughness）
3. `python3 scripts/audit_overlap_margins.py <scene> [scale]`（分层真实渲染：文字×线、文字×排线、文字×文字像素接触，x=80/1120 安全线，正文到页脚分隔线 ≥12px）
4. `node scripts/audit_cjk_glyphs.mjs <scene>`（所有中文与全角标点为简体中文字形，`rules/cjk_glyphs.md`，v0.6.1）
5. 首次渲染前：`python3 scripts/layout_budget.py <budget.json>`（布局预算，v0.6.0）。
6. 再亲眼看 1x、390px 与 4K 局部（飞轮、大椭圆、长箭头、页脚）。脚本通过不代表成立。
