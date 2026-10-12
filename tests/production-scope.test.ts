import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { validateArtifact } from "../src/validate.js";
import { productionScopePages } from "../src/construction.js";

const base = () => JSON.parse(readFileSync(new URL("./fixtures/production-scope-editorial-plan.json", import.meta.url), "utf8"));
const keywords = (plan: unknown) => { try { validateArtifact("editorial_plan", plan); return []; } catch (error: any) { return (error.details?.errors ?? []).map((e: any) => e.keyword); } };
const withScope = (pages: string[] | null, dives: number, targets?: unknown[]) => {
  const plan = base();
  if (pages) plan.package.production_scope = { pages, source: "user_specified", user_words: "test", ...(targets ? { deep_dive_targets: targets } : {}) };
  plan.package.deep_dives = dives ? [{ marker: true }] : [];
  return plan;
};

describe("production_scope 生产范围", () => {
  it("整包默认：未声明范围时仍要求至少一张 Deep Dive", () => {
    const plan = withScope(null, 0);
    expect(keywords(plan)).toContain("minItems");
    expect(productionScopePages(plan)).toEqual(["cover", "overview", "deep_dive"]);
  });
  it("仅总览：允许零 Deep Dive", () => {
    const plan = withScope(["overview"], 0);
    expect(() => validateArtifact("editorial_plan", plan)).not.toThrow();
    expect(productionScopePages(plan)).toEqual(["overview"]);
  });
  it("仅封面：允许零 Deep Dive，但范围外不得混入 Deep Dive", () => {
    expect(() => validateArtifact("editorial_plan", withScope(["cover"], 0))).not.toThrow();
    expect(keywords(withScope(["cover"], 1))).toContain("maxItems");
  });
  it("仅 Deep Dive：范围含 deep_dive 时仍要求至少一张", () => {
    expect(keywords(withScope(["deep_dive"], 0))).toContain("minItems");
    expect(productionScopePages(withScope(["deep_dive"], 0))).toEqual(["deep_dive"]);
  });
  it("定向 Deep Dive：目标须写 topic", () => {
    expect(() => validateArtifact("editorial_plan", withScope(["overview"], 0, [{ topic: "证据", module_ids: ["mod_02"] }]))).not.toThrow();
    expect(() => validateArtifact("editorial_plan", withScope(["overview"], 0, [{ module_ids: ["mod_02"] }]))).toThrow();
  });
  it("未知页面类型被拒绝", () => {
    expect(() => validateArtifact("editorial_plan", withScope(["poster"], 0))).toThrow();
  });
});
