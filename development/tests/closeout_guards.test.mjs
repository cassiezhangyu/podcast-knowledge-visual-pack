import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { assertNoPlaceholders, assertNotBoilerplate, readerJargon } from "../../dist/author-visual-closeout.js";
import { assertSentenceColdRead } from "../../dist/sentence-cold-read.js";
import { assertUnifiedCarrier } from "../../dist/overview-framework-check.js";
import { buildManifests } from "../../dist/render-manifest-cli.js";

const fail = (m) => { throw new Error(m); };

test("占位内容被拒绝，正常证据通过", () => {
  assert.throws(() => assertNoPlaceholders({ checks: { content_coverage: { status: "pass", visible_evidence: "待作者填写" } } }), /占位/);
  assert.throws(() => assertNoPlaceholders({ checks: { a: { items: [{ reason: "TODO" }] } } }), /占位/);
  assertNoPlaceholders({ checks: { content_coverage: { status: "pass", visible_evidence: "管道右端接到包裹" } } });
});

test("同一理由套在多条文字上被拒绝", () => {
  const items = ["第一句比较长的话", "第二句比较长的话", "第三句比较长的话", "第四句比较长的话"].map((text) => ({ text, reason: "白话陈述，无需背景" }));
  assert.throws(() => assertNotBoilerplate({ checks: { sentence_cold_read: { items } } }), /同一句理由/);
  const badges = ["1", "2", "3", "4", "5"].map((text) => ({ text, reason: "编号徽章" }));
  assertNotBoilerplate({ checks: { sentence_cold_read: { items: badges } } });
  assert.throws(() => assertNotBoilerplate({ checks: { a: { visible_evidence: "同一段证据文字" }, b: { visible_evidence: "同一段证据文字" } } }), /共用/);
});

test("统一载体缺失或未确认被拒绝", () => {
  assert.throws(() => assertUnifiedCarrier(undefined, fail), /unified_carrier/);
  const good = { statement: "一条交付流", basis: "synthesis", user_confirmed: true, parts: [{ part: "入口", content: "取舍" }, { part: "管道", content: "卡点" }] };
  assertUnifiedCarrier(good, fail);
  assert.throws(() => assertUnifiedCarrier({ ...good, user_confirmed: false }, fail), /确认/);
});

test("本期术语出现在页面上必须标出并写明解释", () => {
  const ws = mkdtempSync(join(tmpdir(), "pkvp-jargon-"));
  mkdirSync(join(ws, "01-understanding"));
  assert.throws(() => readerJargon(ws), /术语表/);
  writeFileSync(join(ws, "01-understanding/READER_JARGON.json"), JSON.stringify({ kind: "reader_jargon", terms: [{ term: "瓶颈", plain: "最慢的一处" }] }));
  const terms = readerJargon(ws);
  const scene = { elements: [{ type: "text", text: "找瓶颈" }] };
  const base = { status: "pass", metaphor_body_plain: { status: "pass", evidence: "比喻只在主图" }, number_trace: [], label_collision: { status: "pass", findings: [] }, outline_items: [] };
  const plain = { checks: { sentence_cold_read: { ...base, items: [{ text: "找瓶颈", flagged: false, resolution: "plain", reason: "看起来能懂" }] } } };
  assert.throws(() => assertSentenceColdRead(plain, scene, terms), /本期术语“瓶颈”/);
  const explained = { checks: { sentence_cold_read: { ...base, items: [{ text: "找瓶颈", flagged: true, resolution: "explained_on_page", reason: "术语", explanation: "下方写明瓶颈是最慢的一处" }] } } };
  assertSentenceColdRead(explained, scene, terms);
});

test("渲染清单从机械记录生成且哈希真实", () => {
  const ws = mkdtempSync(join(tmpdir(), "pkvp-manifest-"));
  const dir = join(ws, "03-visual/A/render"); mkdirSync(dir, { recursive: true });
  const sha = (b) => createHash("sha256").update(b).digest("hex");
  const art = (name, bytes) => { const p = join(dir, name); writeFileSync(p, bytes); return { path: p, sha256: sha(bytes) }; };
  const scene = art("P01.excalidraw", JSON.stringify({ elements: [{ id: "a", type: "rectangle", x: 0, y: 0, width: 1, height: 1 }] }));
  const current = { scene, png: art("P01.png", "1x"), phone: art("P01-phone.png", "ph"), gray: art("P01-grayscale.png", "g"), delivery: art("P01-hd.png", "hd"), review2x: art("P01@2x.png", "2x") };
  const pre = art("PREFLIGHT.json", "{}");
  const record = join(dir, "MECHANICAL_RENDER_RECORD.json");
  writeFileSync(record, JSON.stringify({ kind: "mechanical_render_record", status: "pass", page_id: "P01", current, preflight: pre, delivery_scale: 2.4 }));
  const { scene: sm, render } = buildManifests(ws, [record], "2026-10-24T00:00:00.000Z");
  assert.equal(render.scene_manifest_sha256, sha(JSON.stringify(sm)));
  assert.equal(render.pages[0].review_png, "03-visual/A/render/P01@2x.png");
  assert.equal(render.pages[0].png_sha256, current.png.sha256);
  writeFileSync(current.png.path, "changed");
  assert.throws(() => buildManifests(ws, [record]), /已变化/);
});
