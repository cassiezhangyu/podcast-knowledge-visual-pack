import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { describe, it, expect } from "vitest";
import { assertOverviewFrameworkCheck } from "../../scripts/src/overview-framework-check.js";

describe("总览关系读回", () => {
  it("逐条核对批准关系、当前绑定和可见证据，不能以点齐或摘要代替", () => {
    const dir = mkdtempSync(join(tmpdir(), "framework-"));
    try {
      const path = join(dir, "approved.json");
      const ledger = { overview_relation_ledger: [
        { page_id: "P01", from_component: "收益", to_component: "退出", relation_type: "解释" },
        { page_id: "P01", from_component: "心理", to_component: "执行", relation_type: "约束" },
        { page_id: "P02", from_component: "其他", to_component: "页面", relation_type: "并列" }
      ] };
      const raw = JSON.stringify(ledger); writeFileSync(path, raw);
      const basis = { path, sha256: createHash("sha256").update(raw).digest("hex") };
      const check = { status: "pass", basis, framework_readback: "收益解释退出，心理约束执行。", missing_relations: [], misread_relations: [], relations: ledger.overview_relation_ledger.slice(0, 2).map(r => ({ from: r.from_component, to: r.to_component, relation_type: r.relation_type, observed: "实际读回判断", visible_evidence: "当前图准确文字及位置", match: true })) };
      expect(() => assertOverviewFrameworkCheck(check, basis, "P01")).not.toThrow();
      expect(() => assertOverviewFrameworkCheck({ ...check, relations: check.relations.slice(0, 1) }, basis, "P01")).toThrow();
      expect(() => assertOverviewFrameworkCheck({ ...check, relations: [check.relations[0], check.relations[0]] }, basis, "P01")).toThrow();
      expect(() => assertOverviewFrameworkCheck({ ...check, relations: check.relations.map(r => ({ ...r, visible_evidence: "" })) }, basis, "P01")).toThrow();
      expect(() => assertOverviewFrameworkCheck({ ...check, relations: check.relations.map(r => ({ ...r, match: false })) }, basis, "P01")).toThrow();
      expect(() => assertOverviewFrameworkCheck({ ...check, missing_relations: ["遗漏"] }, basis, "P01")).toThrow();
      expect(() => assertOverviewFrameworkCheck(undefined, basis, "P01")).toThrow();
      writeFileSync(path, "{}");
      expect(() => assertOverviewFrameworkCheck(check, basis, "P01")).toThrow();
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
});
