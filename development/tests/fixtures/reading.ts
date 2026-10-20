// 合成协议夹具：验证字段与绑定，不代表真实读图或用户验收。
export const reading = () => ({
  status: "pass", entry_and_path: "先看标题和并列条件，再读对应限定",
  graphic_text_gain: "条件与对象相邻，降低跨段来回匹配负担",
  whole_page_summary: "两项并列条件共同限定结论，不构成先后步骤",
  block_readback: [{block: "条件对照", observed: "并列条件限定结论", expected: "并列条件限定结论", match: true}],
  summary_matches_approved_content: true, breakpoints: [], repairs: []
});
