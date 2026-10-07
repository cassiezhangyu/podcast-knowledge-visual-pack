import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { canonical, digest, IMPORT_INPUTS } from "../../src/accepted-artwork-import.js";

// 仅验证导入状态机和防篡改行为；不是实际图片、人工批准或视觉 TARGET 证据。
export function createImportFixture(workspace: string, withContinuation = false) {
  const now = "2026-01-01T00:00:00.000Z";
  const save = (path: string, value: unknown) => {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, JSON.stringify(value, null, 2) + "\n");
    return { path, sha256: digest(readFileSync(path)) };
  };
  const ids = withContinuation ? ["P00", "P01", "P02", "P03"] : ["P00", "P01", "P02"];
  const upstream: Record<string, any> = {};
  for (const [name, path] of Object.entries(IMPORT_INPUTS)) {
    const data = name === "editorial_plan" ? { package: {
      cover: { page_id: "edp_P00" }, overview: { page_id: "edp_P01" }, ...(withContinuation ? { overview_continuations: [{ page_id: "edp_P02" }] } : {}),
      deep_dives: [{ page_id: withContinuation ? "edp_P03" : "edp_P02" }],
    } } : { synthetic_test_fixture: true, kind: name };
    save(join(workspace, path), data); upstream[name] = canonical(data);
  }
  const authorization = save(join(workspace, "fixture-authorization.json"), {
    authorized: true, scope: "accepted_native_artwork_import", note: "测试夹具授权，无真实用户批准含义",
  });
  const pages = ids.map((id, i) => {
    const el = { id: `text-${id}`, type: "text", text: "合成测试文字", x: 20, y: 20, groupIds: [], isDeleted: false };
    const scene = { type: "excalidraw", version: 2, source: "synthetic-test-fixture", elements: [el,
      { id: `arrow-${id}`, type: "arrow", x: 30, y: 60, points: [[0, 0], [40, 0]], groupIds: [], isDeleted: false }], files: {} };
    const sceneRef = save(join(workspace, `03-excalidraw/${id}.excalidraw`), scene);
    sceneRef.path = `03-excalidraw/${id}.excalidraw`;
    const pixels = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRuoAAAAASUVORK5CYII=", "base64");
    const art: Record<string, any> = { scene: sceneRef };
    for (const key of ["png", "phone", "gray"]) {
      const relative = `04-rendered/${id}-${key}.png`; mkdirSync(join(workspace, "04-rendered"), { recursive: true });
      writeFileSync(join(workspace, relative), pixels); art[key] = { path: relative, sha256: digest(pixels) };
    }
    const manifest = { schema_version: "1.0", kind: "render_manifest", status: "completed",
      scene_manifest_sha256: canonical(scene), created_at: now, pages: [{ page_id: id, scene_sha256: art.scene.sha256,
        png: art.png.path, png_sha256: art.png.sha256, phone_png: art.phone.path, phone_png_sha256: art.phone.sha256,
        grayscale_png: art.gray.path, grayscale_png_sha256: art.gray.sha256 }] };
    const review = { schema_version: "1.0", kind: "independent_visual_review", status: "completed",
      render_manifest_sha256: canonical(manifest), reviewer_context: "isolated_read_only", reviewer_context_id: "synthetic-test-only",
      pages: [{ page_id: id, png_sha256: art.png.sha256, review_packet_sha256: canonical({ test: id }), verdict: "TARGET",
        findings: ["仅测试协议，不表示实际图像获得TARGET"] }], reviewed_at: now };
    const approval = { schema_version: "1.0", kind: "human_approval", stage: "visual_page", status: "accepted",
      artifact_hashes: { [id]: art.png.sha256 }, reviewed_by: "synthetic-test-only", reviewed_at: now, note: "合成测试审批" };
    const gate = { schema_version: "1.0", kind: "render_gate", status: "pass", render_manifest_sha256: canonical(manifest),
      checks: [{ name: "independent_visual_review", status: "pass", details: { review_sha256: canonical(review) } },
        { name: "original_phone_grayscale_review", status: "pass", details: { user_approval_sha256: canonical(approval) } }],
      human_review_required: false, independent_review_required: false };
    const proof = Object.fromEntries(Object.entries({ manifest, review, approval, gate }).map(([key, value]) =>
      [key, save(join(workspace, `proof/${id}-${key}.json`), value)]));
    const selection = save(join(workspace, `proof/${id}-selection.json`), { page_id: id, selected_case: "A", user_selection_confirmed: true });
    const single = i === 2 ? { single_case_authorization: save(join(workspace, `proof/${id}-single.json`),
      { authorized: true, allowed_cases: 1, page_ids: [id] }) } : {};
    return { page_id: id, source_page_id: `edp_${id}`, selected_case: "A", selection_mode: i === 2 ? "authorized_single_case" : "accepted_selected_variant",
      selection_approval: selection, artifacts: art, proof, ...single };
  });
  return { schema_version: "1.0", kind: "accepted_artwork_import", status: "completed", authorization,
    adapter_version: "0.18.1", input_hashes: upstream, pages, created_at: now };
}
