import { describe, expect, it } from "vitest";
import { deliveryPageName, scopePages, scopedEditorialPages } from "../../scripts/src/production-scope.js";

const editorial = (scope?: any) => ({ package: { cover: { page_id: "edp_cover_x" }, overview: { page_id: "edp_overview_x" }, overview_continuations: [{ page_id: "edp_overview_x_2" }], deep_dives: [{ page_id: "edp_dd_a" }, { page_id: "edp_dd_b" }], ...(scope ? { production_scope: scope } : {}) } });
const ids = (e: any) => scopedEditorialPages(e).map((p: any) => p.page_id);

describe("导入与打包遵守 production_scope", () => {
  it("full_pack_default：缺省整包，页序不变", () => {
    expect(scopePages(editorial())).toEqual(["cover", "overview", "deep_dive"]);
    expect(ids(editorial())).toEqual(["edp_cover_x", "edp_overview_x", "edp_overview_x_2", "edp_dd_a", "edp_dd_b"]);
  });
  it("overview_only：导入页数=总览及续页", () => { expect(ids(editorial({ pages: ["overview"], source: "user_specified" }))).toEqual(["edp_overview_x", "edp_overview_x_2"]); });
  it("cover_only", () => { expect(ids(editorial({ pages: ["cover"], source: "user_specified" }))).toEqual(["edp_cover_x"]); });
  it("deep_dive_only", () => { expect(ids(editorial({ pages: ["deep_dive"], source: "user_specified" }))).toEqual(["edp_dd_a", "edp_dd_b"]); });
  it("combination：封面+总览", () => { expect(ids(editorial({ pages: ["cover", "overview"], source: "user_specified" }))).toEqual(["edp_cover_x", "edp_overview_x", "edp_overview_x_2"]); });
  it("交付文件名按页面身份，不把首页当封面", () => {
    const e = editorial({ pages: ["overview"], source: "user_specified" });
    expect(deliveryPageName(e, "edp_overview_x", 0)).toBe("01-overview");
    expect(deliveryPageName(e, "edp_overview_x_2", 1)).toBe("01-overview-02");
    expect(deliveryPageName(e, "edp_cover_x", 0)).toBe("00-cover");
    expect(deliveryPageName(e, "edp_dd_a", 1)).toBe("03-a");
  });
});

import { validateArtifact } from "../../scripts/src/validate.js";
describe("单页范围的清单 schema", () => {
  it("overview_only 单页 scene_manifest 通过；空清单仍拒绝", () => {
    const page = { page_id: "edp_overview_x", file: "a.excalidraw", sha256: "a".repeat(64), element_count: 1, source_mappings: [], element_index: [{ id: "e" }], composition_fingerprint: "f" };
    const m: any = { schema_version: "1.0", kind: "scene_manifest", status: "completed", adapter: { package: "@excalidraw/excalidraw", version: "x", format_version: 2 }, pages: [page], created_at: new Date().toISOString() };
    expect(() => validateArtifact("scene_manifest", m)).not.toThrow();
    m.pages = []; expect(() => validateArtifact("scene_manifest", m)).toThrow();
  });
});
