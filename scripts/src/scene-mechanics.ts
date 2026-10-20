/** 所有真实导出共用的机械门禁；不判语义、像素碰撞或视觉等级。 */
type R = Record<string, unknown>;
export type SceneForChecks = { elements: readonly R[]; files: R };
export function assertSceneMechanics(scene: SceneForChecks, tokens: R): void {
  const errors: string[] = [];
  const typography = tokens?.typography as R | undefined;
  const sizes = typography?.role_sizes as Record<string, number> | undefined;
  const strong = typography?.strong_inner_roles;
  const roles = (tokens?.stroke as R | undefined)?.role_settings as Record<string, R> | undefined;
  if (!sizes || !Object.keys(sizes).length || !Array.isArray(strong) || !strong.length || !roles || !Object.keys(roles).length) {
    throw new Error("导出被阻断：必须提供完整的当前 design_tokens，不能跳过机械检查。");
  }
  if (!Array.isArray(scene?.elements) || !scene.elements.length || !scene.files || typeof scene.files !== "object" || Array.isArray(scene.files)) {
    throw new Error("导出被阻断：原生场景缺失或无效。");
  }
  if (Object.keys(scene.files).length || scene.elements.some(e => e.type === "image")) errors.push("scene必须image=0、files为空");
  const active = scene.elements.filter(e => !e.isDeleted);
  const texts = active.filter(e => e.type === "text");
  for (const e of active) {
    const id = String(e.id ?? "未知元素"), data = e.customData as R | undefined;
    if (e.type === "text") {
      const role = String(data?.typography_role ?? ""), size = Number(e.fontSize);
      if (!Object.hasOwn(sizes, role) || size !== sizes[role]) errors.push(`${id}: 字号角色缺失或字号不匹配`);
      for (const line of String(e.text ?? "").split("\n")) {
        const estimated = [...line].reduce((sum, char) => sum + size * (/^[\u1100-\u115f\u2329\u232a\u2e80-\ua4cf\uac00-\ud7a3\uf900-\ufaff\ufe10-\ufe19\ufe30-\ufe6f\uff01-\uff60\uffe0-\uffe6]$/u.test(char) ? 1 : /^[\p{L}\p{N}]$/u.test(char) ? .56 : .5), 0);
        if (estimated > Number(e.width) + size * .35) errors.push(`${id}: 单行可能超过声明宽度，先换行或重分空间`);
      }
      if (e.fontFamily !== 2) errors.push(`${id}: 未采用当前system-cjk-sans字体`);
      if (strong.includes(role) && !texts.some(other => other !== e
        && other.text === e.text && other.strokeColor === e.strokeColor && other.fontSize === e.fontSize
        && (other.customData as R | undefined)?.typography_role === role
        && Math.abs(Number(other.x) - Number(e.x)) >= .5 && Math.abs(Number(other.x) - Number(e.x)) <= 1.5
        && Math.abs(Number(other.y) - Number(e.y)) <= .5)) errors.push(`${id}: 强层级缺少约1px同角色重字副本`);
      if (role === "overview_section" && /^[①②③④⑤⑥⑦⑧⑨]/u.test(String(e.text).trim())) errors.push(`${id}: 带编号主入口须按职责使用section_entry`);
      if (/本轮范围|生产范围|只做总览|暂缓|未出页|待出页|后续出页|范围外|不在本轮|production[_ ]scope|deferred|out[_ ]of[_ ]scope|本轮不做|未制作/i.test(String(e.text ?? ""))) errors.push(`${id}: 成图含制作元数据`);
    } else {
      const role = String(data?.stroke_role ?? ""), settings = roles[role];
      if (!settings) errors.push(`${id}: 笔触角色缺失或未知`);
      else for (const [key, value] of Object.entries(settings)) if (e[key] !== value) errors.push(`${id}: ${key}不匹配当前笔触角色`);
    }
    for (const key of ["x", "y", "width", "height"]) if (typeof e[key] !== "number" || !Number.isFinite(e[key])) errors.push(`${id}: ${key}必须为有限数字`);
  }
  // 声明几何用于提前发现风险；真实字形、贴线和留白仍按PNG审核。
  const canvas = tokens.canvas as R | undefined;
  for (const e of texts) {
    if (Number(e.x) < 0 || Number(e.y) < 0 || Number(e.x) + Number(e.width) > Number(canvas?.width) || Number(e.y) + Number(e.height) > Number(canvas?.height)) errors.push(`${e.id}: 文字声明区域越出画布`);
  }
  for (let i = 0; i < texts.length; i++) for (let j = i + 1; j < texts.length; j++) {
    const a = texts[i], b = texts[j];
    const isWeightCopy = a.text === b.text && a.strokeColor === b.strokeColor && a.fontSize === b.fontSize
      && (a.customData as R | undefined)?.typography_role === (b.customData as R | undefined)?.typography_role
      && strong.includes((a.customData as R | undefined)?.typography_role)
      && Math.abs(Number(a.x)-Number(b.x)) >= .5 && Math.abs(Number(a.x)-Number(b.x)) <= 1.5 && Math.abs(Number(a.y)-Number(b.y)) <= .5;
    if (!isWeightCopy && Number(a.x) < Number(b.x)+Number(b.width) && Number(b.x) < Number(a.x)+Number(a.width)
      && Number(a.y) < Number(b.y)+Number(b.height) && Number(b.y) < Number(a.y)+Number(a.height)) errors.push(`${a.id}/${b.id}: 文字声明区域碰撞`);
  }
  if (errors.length) throw new Error(`导出机械检查失败：\n${errors.join("\n")}`);
}
