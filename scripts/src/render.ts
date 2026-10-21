import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync, copyFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { PipelineError } from "./contracts.js";
import { validateArtifact } from "./validate.js";
import { validateAlbumArt, validateAlbumCoverSource, type PageSpec } from "./construction.js";

type R = Record<string, unknown>;
const read = <T>(path: string) => JSON.parse(readFileSync(path, "utf8")) as T;
const hashBuffer = (value: Buffer) => createHash("sha256").update(value).digest("hex");
const hashJson = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const fail = (message: string, details?: R): never => { throw new PipelineError("CONSTRUCTION_GATE_FAILED", "construction_gate", message, false, details); };

export async function renderScenes(workspace: string, onlyPages?: string[]) {
  const sourceDir = join(workspace, "03-excalidraw"), out = join(workspace, "04-rendered");
  const manifest = read<R>(join(sourceDir, "scene_manifest.json"));
  const constructionGate = read<R>(join(sourceDir, "construction_gate.json"));
  const constructionPlan = read<R>(join(sourceDir, "construction_plan.json"));
  const constructionSpec = read<R>(join(workspace, "02-visual-plan", "construction_spec.json"));
  validateArtifact("scene_manifest", manifest); validateArtifact("construction_plan", constructionPlan); validateArtifact("construction_gate", constructionGate); validateArtifact("construction_spec", constructionSpec);
  if (constructionGate.construction_plan_sha256 !== hashJson(constructionPlan) || constructionGate.scene_manifest_sha256 !== hashJson(manifest) || (constructionPlan.input as R).construction_spec_sha256 !== hashJson(constructionSpec)) fail("Construction inputs changed after the gate was created.");
  if (!(constructionGate.status === "needs_human_review" || constructionGate.status === "pass")) fail("Construction Gate does not permit rendering.");
  const tokens = read<R>(join(process.cwd(), "design_tokens.json"));
  const brandSettings = (tokens.cover as R)?.brand_asset as R | undefined;
  validateAlbumArt(constructionSpec.pages as PageSpec[], constructionSpec.album_art_policy as string | undefined, brandSettings?.box as { x: number; y: number; width: number; height: number } | undefined);
  if (constructionSpec.album_art_policy) validateAlbumCoverSource(constructionSpec.pages as PageSpec[], read<R>(join(workspace, "00-source", "episode_metadata.json")));
  const pages = (manifest.pages as R[]).filter((page) => !onlyPages || onlyPages.includes(page.page_id as string));
  if (!pages.length || onlyPages?.some((id) => !pages.some((page) => page.page_id === id))) fail("No matching scenes were selected for rendering.");
  mkdirSync(out, { recursive: true }); mkdirSync(join(out, "checks"), { recursive: true });
  const staleError = join(out, "render.error.json");
  if (existsSync(staleError)) unlinkSync(staleError);
  const rendered: R[] = [];
  for (const item of pages) {
    const scenePath = resolve(workspace, item.file as string);
    if (hashBuffer(readFileSync(scenePath)) !== item.sha256) fail("Scene hash differs from scene_manifest.json.", { page_id: item.page_id });
    const spec = (constructionSpec.pages as R[]).find((value) => value.page_id === item.page_id);
    if (!spec || typeof spec.preflight_relative_path !== "string") return fail("正式导出缺少当版绘图前预检。", { page_id: item.page_id });
    const preflightPath = resolve(workspace, spec.preflight_relative_path as string);
    const preflight = read<R>(preflightPath);
    if (preflight.page_id !== item.page_id || preflight.role !== spec.page_kind) fail("预检页面或角色与正式场景不一致。", { page_id: item.page_id });
    const brand = spec.brand_asset as R | undefined;
    if (!brand) return fail("正式导出缺少官方专辑素材。", { page_id: item.page_id });
    const assetPath = resolve(workspace, brand.relative_path as string);
    if (!assetPath.startsWith(`${resolve(workspace)}/`) || hashBuffer(readFileSync(assetPath)) !== brand.sha256) fail("官方素材路径或hash无效。", { page_id: item.page_id });
    const slug = `${String(rendered.length).padStart(2, "0")}-${String(item.page_id).replace(/[^a-zA-Z0-9_-]/g, "-")}`;
    const checked = join(out, "checks", slug);
    const command = [join(process.cwd(), "scripts", "render-scene-checked.mjs"), "--scene", scenePath, "--preflight", preflightPath, "--brand", assetPath, "--output", checked];
    if (spec.page_kind !== "cover") {
      if (typeof spec.outline_regions_relative_path !== "string") fail("正式内页缺少当版提纲区域。", { page_id: item.page_id });
      command.push("--outline-regions", resolve(workspace, spec.outline_regions_relative_path as string));
    }
    const result = spawnSync(process.execPath, command, { cwd: process.cwd(), encoding: "utf8" });
    if (result.error || result.status !== 0) fail("正式导出被统一机械门禁阻断。", { page_id: item.page_id, reason: result.stderr || result.stdout || String(result.error) });
    const mechanicalPath = join(checked, "MECHANICAL_RENDER_RECORD.json");
    const mechanical = read<R>(mechanicalPath), current = mechanical.current as R;
    const destinations = { png: join(out, `${slug}.png`), phone: join(out, `${slug}-phone.png`), gray: join(out, `${slug}-grayscale.png`), delivery: join(out, `${slug}-hd.png`) };
    for (const [key, destination] of Object.entries(destinations)) {
      copyFileSync((current[key] as R).path as string, destination);
      current[key] = { path: resolve(destination), sha256: hashBuffer(readFileSync(destination)) };
    }
    writeFileSync(mechanicalPath, `${JSON.stringify(mechanical, null, 2)}\n`);
    const record: R = { page_id: item.page_id, scene_sha256: item.sha256, png: relative(workspace, destinations.png), png_sha256: (current.png as R).sha256, phone_png: relative(workspace, destinations.phone), phone_png_sha256: (current.phone as R).sha256, grayscale_png: relative(workspace, destinations.gray), grayscale_png_sha256: (current.gray as R).sha256, brand_asset_sha256: brand.sha256 };
    rendered.push(record);
    record.delivery_png = relative(workspace, destinations.delivery);
    record.delivery_png_sha256 = (current.delivery as R).sha256;
    record.delivery_scale = mechanical.delivery_scale;
    writeFileSync(join(out, "checks", `${slug}.md`), `# RENDERED_PAGE_CHECK\n\n- 页面：${item.page_id}\n- 机械记录：checks/${slug}/MECHANICAL_RENDER_RECORD.json\n- 规则到像素：待检查\n- 遮字、压线与越界：待检查\n- 内容差异：待检查\n- 手机阅读：待检查\n- 作者整页质量自检：待检查\n`);
  }
  const renderManifest: R = { schema_version: "1.0", kind: "render_manifest", status: "completed", scene_manifest_sha256: hashJson(manifest), pages: rendered, created_at: new Date().toISOString() };
  validateArtifact("render_manifest", renderManifest);
  const gate: R = { schema_version: "1.0", kind: "render_gate", status: "needs_human_review", render_manifest_sha256: hashJson(renderManifest), checks: [{ name: "same_scene_real_png_export", status: "pass", details: { pages: rendered.length } }, { name: "original_phone_grayscale_review", status: "needs_human_review", details: { check_directory: "04-rendered/checks" } }, { name: "author_self_check", status: "needs_human_review", details: { check_directory: "04-rendered/checks" } }], human_review_required: true, independent_review_required: false };
  validateArtifact("render_gate", gate);
  writeFileSync(join(out, "render_manifest.json"), `${JSON.stringify(renderManifest, null, 2)}\n`);
  writeFileSync(join(out, "render_gate.json"), `${JSON.stringify(gate, null, 2)}\n`);
  return { status: gate.status, pages: rendered.length, output: out };
}
