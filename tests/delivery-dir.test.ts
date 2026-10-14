import { mkdtempSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { resolveDeliveryDir } from "../src/delivery-dir.js";

describe("resolveDeliveryDir", () => {
  it("defaults to 06-delivery for new workspaces", () => {
    const ws = mkdtempSync(join(tmpdir(), "pkvp-"));
    expect(resolveDeliveryDir(ws, false)).toBe(join(ws, "06-delivery"));
  });
  it("prefers 06-delivery when both exist", () => {
    const ws = mkdtempSync(join(tmpdir(), "pkvp-")); mkdirSync(join(ws, "06-delivery")); mkdirSync(join(ws, "delivery"));
    expect(resolveDeliveryDir(ws, false)).toBe(join(ws, "06-delivery"));
  });
  it("falls back to legacy delivery/", () => {
    const ws = mkdtempSync(join(tmpdir(), "pkvp-")); mkdirSync(join(ws, "delivery"));
    expect(resolveDeliveryDir(ws, false)).toBe(join(ws, "delivery"));
  });
});
