import { describe, expect, it } from "vitest";
import { verifyScopedRepair } from "../scripts/verify-scoped-visual-repair.mjs";

const scene = (elements: Array<Record<string, unknown>>) => ({
  type: "excalidraw",
  version: 2,
  source: "test",
  elements,
  appState: { viewBackgroundColor: "#ffffff" },
  files: {},
});

describe("scoped visual repair verification", () => {
  it("allows changes and additions inside the declared scope", () => {
    const before = scene([{ id: "stable", x: 1 }, { id: "target-copy", text: "旧" }]);
    const after = scene([{ id: "stable", x: 1 }, { id: "target-copy", text: "新" }, { id: "target-note", text: "边界" }]);
    const result = verifyScopedRepair(before, after, { allowedPrefixes: ["target-"] });

    expect(result.status).toBe("pass");
    expect(result.scope.allowed_changed_ids).toEqual(["target-copy", "target-note"]);
  });

  it("rejects a modification outside the declared scope", () => {
    const before = scene([{ id: "stable", x: 1 }, { id: "target", text: "旧" }]);
    const after = scene([{ id: "stable", x: 2 }, { id: "target", text: "新" }]);
    const result = verifyScopedRepair(before, after, { allowedIds: ["target"] });

    expect(result.status).toBe("fail");
    expect(result.violations.modified).toEqual(["stable"]);
  });

  it("rejects an unauthorized addition or removal", () => {
    const before = scene([{ id: "stable", x: 1 }, { id: "removed", x: 2 }, { id: "target", text: "旧" }]);
    const after = scene([{ id: "stable", x: 1 }, { id: "added", x: 3 }, { id: "target", text: "新" }]);
    const result = verifyScopedRepair(before, after, { allowedIds: ["target"] });

    expect(result.status).toBe("fail");
    expect(result.violations.added).toEqual(["added"]);
    expect(result.violations.removed).toEqual(["removed"]);
  });
});

