/** 只校验阅读诊断是否完整且无未解决断点，理解判断由隔离首读者完成。 */
type R = Record<string, unknown>;
/** 兼容历史记录；新1.1报告必须披露模式与已知上下文，不由字段推断实际理解。 */
export function assertReaderProvenance(value: unknown, required = false): void {
  const v = value as R | undefined;
  const keys = ['review_mode', 'prior_exposure', 'readback_scope'];
  if (!required && (!v || !keys.some(k => k in v))) return;
  if (!v || !['first_read', 'informed_regression'].includes(String(v.review_mode))
    || !['none', 'content_or_draft', 'unknown'].includes(String(v.prior_exposure))
    || typeof v.readback_scope !== 'string' || !v.readback_scope.trim()
    || (v.review_mode === 'first_read' && v.prior_exposure !== 'none')) {
    throw new Error('理解读回缺少有效模式、上下文接触或范围；已知或不明上下文不能声称陌生首读。');
  }
}
export function assertUnfamiliarReaderCheck(value: unknown, requireProvenance = false): void {
  assertReaderProvenance(value, requireProvenance);
  const v = value as R | undefined;
  const texts = ['entry_and_path', 'graphic_text_gain', 'whole_page_summary'];
  if (!v || v.status !== 'pass' || !texts.every(k => typeof v[k] === 'string' && (v[k] as string).trim().length >= 8)
    || v.summary_matches_approved_content !== true || !Array.isArray(v.block_readback) || !v.block_readback.length
    || !v.block_readback.every((b: R) => ['block', 'observed', 'expected'].every(k => typeof b[k] === 'string' && (b[k] as string).trim()) && b.match === true)
    || !Array.isArray(v.breakpoints) || v.breakpoints.length || !Array.isArray(v.repairs)) {
    throw new Error('理解读回检查缺项、未通过或仍有未解决断点。');
  }
}
