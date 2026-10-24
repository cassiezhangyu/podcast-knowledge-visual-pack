import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
type R = Record<string, unknown>;
const text = (v: unknown): v is string => typeof v === "string" && v.trim().length > 0;
const key = (r: R) => [r.from_component ?? r.from, r.to_component ?? r.to, r.relation_type];

/** 台账须写明全期共用的载体及各部位对应内容；载体是否成立由用户在框架确认停点判断。 */
export function assertUnifiedCarrier(value: unknown, fail: (message: string) => never): void {
  const c = value as R | undefined;
  if (!c || typeof c !== "object") fail("批准关系台账缺少 unified_carrier（全期放在同一个什么对象或系统上看）");
  if (!text(c!.statement)) fail("unified_carrier.statement 为空");
  if (c!.basis !== "source" && c!.basis !== "synthesis") fail("unified_carrier.basis 须为 source 或 synthesis");
  const parts = c!.parts;
  if (!Array.isArray(parts) || parts.length < 2 || parts.some(p => !p || !text((p as R).part) || !text((p as R).content))) fail("unified_carrier.parts 须至少两项，每项写明 part 与 content");
  if (c!.user_confirmed !== true) fail("unified_carrier 尚未经用户在三案前确认（user_confirmed 须为 true）");
}

/** 只核必要关系的逐条记录与当前绑定；图上语义由隔离首读者判断。 */
export function assertOverviewFrameworkCheck(value: unknown, basisValue: unknown, pageId: string): void {
  const fail = (message: string): never => { throw new Error(`整体框架检查失败：${message}`); };
  const basis = basisValue as R | undefined, check = value as R | undefined;
  if (!basis || !text(basis.path) || !text(basis.sha256)) fail("缺少构图前绑定的批准关系台账");
  const raw = readFileSync(basis!.path as string);
  if (createHash("sha256").update(raw).digest("hex") !== basis!.sha256) fail("批准关系台账已变化");
  const data = JSON.parse(raw.toString()) as R | R[];
  const ledger = Array.isArray(data) ? data : data.overview_relation_ledger ?? data.relations;
  if (!Array.isArray(ledger)) fail("批准关系台账格式无效");
  assertUnifiedCarrier(Array.isArray(data) ? undefined : (data as R).unified_carrier, fail);
  const expected = (ledger as R[]).filter(r => (r.page_id ?? pageId) === pageId).map(key);
  const expectedKeys = expected.map(k => JSON.stringify(k));
  if (!expected.length || expected.some(k => !k.every(text)) || new Set(expectedKeys).size !== expected.length) fail("本页批准关系缺失、重复或标识无效");
  const bound = check?.basis as R | undefined;
  if (!bound || bound.path !== basis!.path || bound.sha256 !== basis!.sha256) fail("整体框架检查缺失或与批准台账绑定不同");
  if (check?.status !== "pass" || !text(check.framework_readback)) fail("整体框架未通过或缺少独立首读复述");
  const rows = check!.relations;
  if (!Array.isArray(rows) || rows.some(r => !r || typeof r !== "object")) fail("缺少必要关系逐条读回");
  const actual = (rows as R[]).map(r => JSON.stringify(key(r)));
  if (actual.length !== expected.length || new Set(actual).size !== actual.length || actual.some(k => !expectedKeys.includes(k))) fail("必要关系读回存在遗漏、重复或额外关系");
  if ((rows as R[]).some(r => r.match !== true || !text(r.observed) || !text(r.visible_evidence))) fail("必要关系未读出、证据缺失或存在误读");
  if (!Array.isArray(check!.missing_relations) || check!.missing_relations.length || !Array.isArray(check!.misread_relations) || check!.misread_relations.length) fail("整体框架仍有未解决缺口或误读");
}
