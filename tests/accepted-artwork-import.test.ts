import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { digest, IMPORT_INPUTS, readJson, verifyImportRecord } from "../src/accepted-artwork-import.js";
import { validateArtifact } from "../src/validate.js";
import { createImportFixture } from "./fixtures/accepted-native-import.js";
import Ajv2020 from "ajv/dist/2020.js";

type R = Record<string, any>;
const root = resolve(import.meta.dirname, "..");

let workspace: string;
let record: R;
const save = (path: string, value: unknown) => writeFileSync(path, JSON.stringify(value, null, 2) + "\n");
const mutateRef = (ref: R, mutation: (value: R) => void, rehash = false) => {
  const path = resolve(workspace, ref.path), value = readJson(path);
  mutation(value); save(path, value);
  if (rehash) ref.sha256 = digest(readFileSync(path));
};
const verify = () => verifyImportRecord(workspace, record, false);

// 默认测试完全自包含；真实整包检查通过显式环境变量选择，不随公开仓库分发。
beforeEach(() => {
  workspace = mkdtempSync(join(tmpdir(), "accepted-native-import-test-"));
  record = createImportFixture(workspace);
});
afterEach(() => rmSync(workspace, { recursive: true, force: true }));

describe("已验收原生图导入的独立行为验证", () => {
  it("自包含夹具验证批准绑定，prepare 不等于编辑器通过", () => {
    expect(record.pages).toHaveLength(3);
    expect(() => verifyImportRecord(workspace, record, false)).not.toThrow();
    expect(() => verifyImportRecord(workspace, record)).toThrow(/缺少真实编辑器操作记录/);
  });

  it.runIf(!!process.env.PODCAST_MAP_REAL_IMPORT_ROOT)("显式只读验证本地真实整包", () => {
    const source = process.env.PODCAST_MAP_REAL_IMPORT_ROOT!;
    expect(() => verifyImportRecord(join(source, "workspace"), readJson(join(source, "IMPORT_INPUT.json")), false)).not.toThrow();
  });

  it("冻结导入保留总览续页顺序，错序不能通过", () => {
    record = createImportFixture(workspace, true);
    expect(record.pages).toHaveLength(4);
    expect(verify).not.toThrow();
    [record.pages[2], record.pages[3]] = [record.pages[3], record.pages[2]];
    expect(verify).toThrow(/导入页序/);
  });

  it("真实单案例外和自由箭头可在原生导入中保留", () => {
    expect(record.pages.some((p: R) => p.selection_mode === "authorized_single_case")).toBe(true);
    const arrows = record.pages.flatMap((p: R) => readJson(resolve(workspace, p.artifacts.scene.path)).elements)
      .filter((e: R) => !e.isDeleted && e.type === "arrow" && !e.startBinding && !e.endBinding);
    expect(arrows.length).toBeGreaterThan(0);
    expect(() => verify()).not.toThrow();
  });

  it("导入 CLI 没有编辑器记录只能 prepare，整包不能批准", () => {
    const input = join(workspace, "test-input.json"); save(input, record);
    const result = spawnSync(process.execPath, ["--import", "tsx", join(root, "src/accepted-artwork-import-cli.ts"), "--workspace", workspace, "--input", input], { cwd: root, encoding: "utf8" });
    expect(result.status, result.stderr).toBe(0);
    expect(JSON.parse(result.stdout).status).toBe("needs_editor_review");
    expect(readJson(join(workspace, "03-excalidraw/construction_gate.json")).status).toBe("needs_human_review");
    const packageResult = spawnSync(process.execPath, ["--import", "tsx", join(root, "src/package-cli.ts"), "--workspace", workspace, "--action", "approve"], { cwd: root, encoding: "utf8" });
    expect(packageResult.status).not.toBe(0);
  });

  it("默认制作仍要求三案，单案不会经导入入口放宽默认 schema", () => {
    const schema = readJson(join(root, "schemas/visual_candidates.schema.json"));
    const validate = new Ajv2020({ allErrors: true }).compile({
      ...schema.$defs.page.properties.candidates, $defs: schema.$defs,
    });
    expect(validate([{}])).toBe(false);
    expect(validate.errors?.some(error => error.keyword === "minItems")).toBe(true);
    expect(() => validateArtifact("visual_candidates", record)).toThrow();
  });

  it.each(["scene", "png", "phone", "gray"])("拒绝修改已批准 %s 工件", (key) => {
    const ref = record.pages[0].artifacts[key];
    writeFileSync(resolve(workspace, ref.path), "篡改当前批准资产");
    expect(verify).toThrow(/导入引用已变化/);
  });

  it.each(["gate", "review", "approval", "manifest"])("拒绝改变原 %s 证据", (key) => {
    mutateRef(record.pages[0].proof[key], value => { value.status = "rejected"; });
    expect(verify).toThrow(/导入引用已变化/);
  });

  it.each(["gate", "review", "approval"])("拒绝更新哈希后仍未通过的 %s 证据", (key) => {
    mutateRef(record.pages[0].proof[key], value => {
      if (key === "gate") value.status = "needs_human_review";
      if (key === "review") value.pages[0].verdict = "REJECT-B";
      if (key === "approval") value.status = "pending";
    }, true);
    expect(verify).toThrow();
  });

  it("拒绝无显式授权", () => {
    mutateRef(record.authorization, value => { value.authorized = false; }, true);
    expect(verify).toThrow(/缺少显式原生图导入授权/);
  });
  it("拒绝撤销当前单案例外授权，即使引用哈希更新", () => {
    const page = record.pages.find((p: R) => p.selection_mode === "authorized_single_case");
    mutateRef(page.single_case_authorization, value => { value.authorized = false; }, true);
    expect(verify).toThrow(/单案缺少本页明确例外授权/);
  });
  it("拒绝少页", () => { record.pages.pop(); expect(verify).toThrow(/导入页数/); });
  it("拒绝重复页", () => { record.pages[1] = structuredClone(record.pages[0]); expect(verify).toThrow(/导入页/); });
  it("拒绝重复上游页映射", () => { record.pages[1].source_page_id = record.pages[0].source_page_id; expect(verify).toThrow(/导入页/); });
  it.each(Object.entries(IMPORT_INPUTS))("拒绝改变当前上游 %s", (_key, path) => {
    const value = readJson(join(workspace, path)); value.test_mutation = true; save(join(workspace, path), value);
    expect(verify).toThrow(/导入上游已变化/);
  });
  it("拒绝与用户选择不符的选案标记", () => {
    record.pages[0].selected_case = "B";
    expect(verify).toThrow();
  });
  it("拒绝重新哈希但撤销用户确认的选案证据", () => {
    mutateRef(record.pages[0].selection_approval, value => { value.user_selection_confirmed = false; }, true);
    expect(verify).toThrow();
  });
  it("拒绝将非编辑器文件伪装为全部打开截图及编辑证据", () => {
    const evidencePath = join(workspace, "非编辑器证据.json");
    save(evidencePath, { note: "这是负例假文件，没有发生 UI 操作或截图" });
    const evidence = { path: evidencePath, sha256: digest(readFileSync(evidencePath)) };
    const editor = {
      kind: "native_editor_interaction_review", status: "pass", bound_arrow_count: 0,
      pages: record.pages.map((page: R) => ({ page_id: page.page_id, opened: true, scene_sha256: page.artifacts.scene.sha256, screenshot: evidence })),
      checks: ["edit_text", "move_group_and_object", "edit_free_arrow", "inspect_wrapping_and_collisions", "inspect_hero_and_guardrails"]
        .map(name => ({ name, status: "pass", evidence: [evidence] }))
        .concat([{ name: "move_bound_arrow", status: "not_applicable", evidence: [] }]),
    };
    const editorPath = join(workspace, "伪造编辑器记录.json"); save(editorPath, editor);
    record.editor_review = { path: editorPath, sha256: digest(readFileSync(editorPath)) };
    expect(() => verifyImportRecord(workspace, record, true)).toThrow();
  });
});
