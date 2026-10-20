import {describe,it,expect} from 'vitest';
import {assertUnfamiliarReaderCheck} from '../../scripts/src/unfamiliar-reader-check.js';
import {validateArtifact} from '../../scripts/src/validate.js';

const reading = () => ({
  status: 'pass', entry_and_path: '先读标题与比较，再看两项并列条件',
  graphic_text_gain: '对照将对象与条件直接配对，减少跨段匹配',
  whole_page_summary: '结论由两项并列条件共同限定，不能读成先后步骤',
  block_readback: [{block: '主对照', observed: '并列条件限定判断', expected: '并列条件限定判断', match: true}],
  summary_matches_approved_content: true, breakpoints: [], repairs: []
});
const provenance = (mode: string, exposure: string) => ({
  ...reading(), review_mode: mode, prior_exposure: exposure,
  readback_scope: '已读旧稿，本轮重新读当前图并复核完整含义；仅作测试数据'
});
const report = (version: string, reader: unknown) => ({
  schema_version: version, kind: 'independent_visual_review', status: 'completed',
  render_manifest_sha256: 'a'.repeat(64), reviewer_context: 'isolated_read_only',
  reviewer_context_id: 'reviewer', reviewed_at: '2026-10-19T00:00:00Z',
  pages: [{page_id: 'P01', png_sha256: 'b'.repeat(64), review_packet_sha256: 'c'.repeat(64),
    verdict: 'TARGET', findings: [], unfamiliar_reader_check: reader}]
});

describe('理解读回的证据范围', () => {
  it('历史记录兼容，新报告缺少披露被拒绝', () => {
    expect(() => validateArtifact('independent_visual_review', report('1.0', reading()))).not.toThrow();
    expect(() => assertUnfamiliarReaderCheck(reading())).not.toThrow();
    expect(() => validateArtifact('independent_visual_review', report('1.1', reading()))).toThrow();
    expect(() => assertUnfamiliarReaderCheck(reading(), true)).toThrow();
  });
  it('知情与不明上下文不能通过改名声称首次读图', () => {
    for (const exposure of ['content_or_draft', 'unknown']) {
      const reader = provenance('first_read', exposure);
      expect(() => assertUnfamiliarReaderCheck(reader, true)).toThrow();
      expect(() => validateArtifact('independent_visual_review', report('1.1', reader))).toThrow();
    }
  });
  it('允许如实标注的知情回归及未接触内容的首次读图', () => {
    for (const [mode, exposure] of [['informed_regression', 'content_or_draft'], ['informed_regression', 'unknown'], ['first_read', 'none']]) {
      const reader = provenance(mode, exposure);
      expect(() => assertUnfamiliarReaderCheck(reader, true)).not.toThrow();
      expect(() => validateArtifact('independent_visual_review', report('1.1', reader))).not.toThrow();
    }
  });
  it('披露完整仍不能越过未解决的理解断点', () => {
    const reader = {...provenance('informed_regression', 'content_or_draft'), breakpoints: ['条件对象仍不明']};
    expect(() => assertUnfamiliarReaderCheck(reader, true)).toThrow();
  });
});
