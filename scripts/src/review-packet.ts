type R = Record<string, any>;
/** 审核包与渲染清单匹配用的页号：优先 manifest_page_id（渲染清单页号），兼容只有 page_id 的旧包。 */
export const packetPageId = (packet: R): string => String(packet.manifest_page_id ?? packet.page_id);

/** 只核逐项证据和绑定，视觉有效性仍由隔离审核者判定。 */
export function assertUserRequirementsCheck(bound: R | undefined, data: R | undefined, result: R | undefined): void {
  if (!bound) {
    if (result) throw new Error("用户条件审核结果缺少对应输入。");
    return;
  }
  const required = data?.required_outcomes;
  if (!Array.isArray(required) || !required.length || !required.every((x: R) => x && ["id", "requirement", "verification"].every((k) => typeof x[k] === "string" && x[k].trim()))) throw new Error("用户验收条件格式不完整。");
  const ids = required.map((x: R) => x.id);
  if (new Set(ids).size !== ids.length) throw new Error("用户验收条件ID重复。");
  if (result?.basis?.path !== bound.path || result?.basis?.sha256 !== bound.sha256) throw new Error("用户条件审核未绑定当前版本。");
  const results = result?.results;
  if (!Array.isArray(results) || results.length !== ids.length || new Set(results.map((x: R) => x?.id)).size !== ids.length || !results.every((x: R) => x && ids.includes(x.id) && x.status === "pass" && typeof x.visible_evidence === "string" && x.visible_evidence.trim())) throw new Error("用户条件未逐项通过或缺少可见证据。");
}
