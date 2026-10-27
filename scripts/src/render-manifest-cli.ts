#!/usr/bin/env node
/** 从 render-scene-checked 的机械记录生成真实的 scene_manifest 与 render_manifest，不再手写或合成哈希。 */
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { validateArtifact } from "./validate.js";
import { assertRenderedMargins } from "./rendered-margins.js";
type R = Record<string, any>;
const hash = (v: unknown) => createHash("sha256").update(JSON.stringify(v)).digest("hex");
const fileHash = (p: string) => createHash("sha256").update(readFileSync(p)).digest("hex");
const read = (p: string): R => JSON.parse(readFileSync(p, "utf8"));
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

export function buildManifests(workspace: string, recordPaths: string[], now = new Date().toISOString()): { scene: R; render: R } {
  const ws = resolve(workspace), rel = (p: string) => relative(ws, resolve(p));
  if (!recordPaths.length) throw new Error("至少需要一份 MECHANICAL_RENDER_RECORD.json（--record）");
  const records = recordPaths.map(p => ({ path: resolve(p), data: read(p) }));
  const ids = new Set<string>();
  for (const { path, data } of records) {
    if (data.kind !== "mechanical_render_record" || data.status !== "pass") throw new Error("机械记录未通过：" + path);
    assertRenderedMargins(data);
    if (ids.has(data.page_id)) throw new Error("页号重复：" + data.page_id);
    ids.add(data.page_id);
    for (const [key, art] of Object.entries(data.current ?? {}) as [string, R][]) {
      if (fileHash(art.path) !== art.sha256) throw new Error(`机械记录中的 ${key} 已变化，请重新运行 render-scene-checked：${art.path}`);
    }
    for (const key of ["scene", "png", "phone", "gray", "delivery", "review2x"]) if (!data.current?.[key]) throw new Error(`机械记录缺少 ${key}：${path}`);
  }
  const pkg = read(join(root, "package.json"));
  const scenePages = records.map(({ path, data }) => {
    const elements = (read(data.current.scene.path).elements ?? []).filter((e: R) => !e.isDeleted);
    return {
      page_id: data.page_id, file: rel(data.current.scene.path), sha256: data.current.scene.sha256, element_count: elements.length,
      source_mappings: [{ mechanical_render_record: rel(path), preflight: rel(data.preflight.path), meaning: "render-scene-checked 导出的当前 scene" }],
      element_index: elements.map((e: R) => ({ id: e.id, type: e.type, group_ids: e.groupIds ?? [] })),
      composition_fingerprint: hash(elements.map((e: R) => [e.id, e.type, e.x, e.y, e.width, e.height])),
    };
  });
  const scene: R = { schema_version: "1.0", kind: "scene_manifest", status: "completed", adapter: { package: "@excalidraw/excalidraw", version: String(pkg.dependencies?.["@excalidraw/excalidraw"] ?? "unknown"), format_version: 2, mode: "scene_checked_export" }, pages: scenePages, created_at: now };
  const render: R = {
    schema_version: "1.0", kind: "render_manifest", status: "completed", scene_manifest_sha256: hash(scene), created_at: now,
    pages: records.map(({ data }) => {
      const c = data.current;
      const page: R = {
        page_id: data.page_id, scene_sha256: c.scene.sha256,
        png: rel(c.png.path), png_sha256: c.png.sha256, phone_png: rel(c.phone.path), phone_png_sha256: c.phone.sha256,
        grayscale_png: rel(c.gray.path), grayscale_png_sha256: c.gray.sha256,
        delivery_png: rel(c.delivery.path), delivery_png_sha256: c.delivery.sha256, delivery_scale: data.delivery_scale,
        review_png: rel(c.review2x.path), review_png_sha256: c.review2x.sha256, review_scale: 2,
      };
      if (data.brand_asset?.sha256) page.brand_asset_sha256 = data.brand_asset.sha256;
      return page;
    }),
  };
  validateArtifact("scene_manifest", scene);
  validateArtifact("render_manifest", render);
  return { scene, render };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2), value = (k: string) => { const i = args.indexOf(k); return i === -1 ? undefined : args[i + 1]; };
  const records = args.flatMap((a, i) => (a === "--record" && args[i + 1] ? [args[i + 1]] : []));
  const workspace = value("--workspace");
  if (!workspace || !records.length) { console.error("用法：npm run render:manifest -- --workspace <工作区> --record <MECHANICAL_RENDER_RECORD.json> [--record ...]"); process.exit(2); }
  try {
    const { scene, render } = buildManifests(workspace, records);
    for (const [dir, name, data] of [["03-excalidraw", "scene_manifest.json", scene], ["04-rendered", "render_manifest.json", render]] as [string, string, R][]) {
      mkdirSync(join(workspace, dir), { recursive: true });
      writeFileSync(join(workspace, dir, name), JSON.stringify(data, null, 2) + "\n");
    }
    console.log(JSON.stringify({ status: "pass", scene_manifest: "03-excalidraw/scene_manifest.json", render_manifest: "04-rendered/render_manifest.json", pages: render.pages.length }));
  } catch (error) { console.error(JSON.stringify({ status: "fail", message: String((error as Error).message ?? error) })); process.exit(1); }
}
