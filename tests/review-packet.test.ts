import { describe, expect, it } from "vitest";
import { packetPageId } from "../src/review-packet.js";
describe("审核包页号与渲染清单匹配", () => {
  it("优先 manifest_page_id", () => { expect(packetPageId({ page_id: "P01", manifest_page_id: "edp_overview_x" })).toBe("edp_overview_x"); });
  it("旧包只有 page_id 时兼容", () => { expect(packetPageId({ page_id: "edp_overview_x" })).toBe("edp_overview_x"); });
});
