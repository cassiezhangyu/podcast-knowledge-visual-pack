import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, extname, join, relative, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { chromium } from "playwright";
import { PipelineError } from "./contracts.js";
import { validateArtifact } from "./validate.js";
import { validateAlbumArt, type PageSpec } from "./construction.js";

type R = Record<string, unknown>;
const read = <T>(path: string) => JSON.parse(readFileSync(path, "utf8")) as T;
const hashBuffer = (value: Buffer) => createHash("sha256").update(value).digest("hex");
const hashJson = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const pngBuffer = (dataUrl: string) => Buffer.from(dataUrl.replace(/^data:image\/png;base64,/, ""), "base64");
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
  const pages = (manifest.pages as R[]).filter((page) => !onlyPages || onlyPages.includes(page.page_id as string));
  if (!pages.length || onlyPages?.some((id) => !pages.some((page) => page.page_id === id))) fail("No matching scenes were selected for rendering.");
  mkdirSync(out, { recursive: true }); mkdirSync(join(out, "checks"), { recursive: true });
  const staleError = join(out, "render.error.json");
  if (existsSync(staleError)) unlinkSync(staleError);
  const html = join(out, ".render-runtime.html");
  const browserBundle = join(process.cwd(), "dist", "excalidraw-preview-browser.js");
  writeFileSync(html, `<!doctype html><meta charset="utf-8"><body><script src="${pathToFileURL(browserBundle).href}"></script></body>`);
  const macChrome = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
  const executablePath = process.env.PODCAST_MAP_CHROME_PATH
    || (process.platform === "darwin" && existsSync(macChrome) ? macChrome : undefined);
  let browser;
  try {
    browser = await chromium.launch({ headless: true, ...(executablePath ? { executablePath } : {}) });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const code = message.includes("Executable doesn't exist") ? "BROWSER_NOT_INSTALLED"
      : /SIGABRT|MachPortRendezvousServer|bootstrap_check_in.*Permission denied/.test(message) ? "BROWSER_HOST_LAUNCH_BLOCKED"
        : "BROWSER_LAUNCH_FAILED";
    if (existsSync(html)) unlinkSync(html);
    throw new PipelineError(code, "render", `Browser launch failed before Excalidraw export. Run render:checked in an environment that permits browser startup. ${message.split("\n")[0]}`, false, { browser: executablePath ?? "playwright-bundled" });
  }
  const rendered: R[] = [];
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 1800 }, deviceScaleFactor: 1 });
    await page.goto(pathToFileURL(html).href);
    for (const item of pages) {
      const scenePath = join(workspace, item.file as string);
      const sceneText = readFileSync(scenePath, "utf8"), scene = JSON.parse(sceneText) as R;
      if (hashBuffer(Buffer.from(sceneText)) !== item.sha256) fail("Scene hash differs from scene_manifest.json.", { page_id: item.page_id });
      if ((scene.elements as R[]).some((element) => element.type === "image") || Object.keys((scene.files as R) ?? {}).length) fail("Rendered scene contains forbidden embedded bitmap data.", { page_id: item.page_id });
      let originalUrl = await page.evaluate(async (value) => (window as unknown as { renderPersistedExcalidrawScene: (scene: R) => Promise<string> }).renderPersistedExcalidrawScene(value), scene);
      const pageSpec = (constructionSpec.pages as R[]).find((spec) => spec.page_id === item.page_id);
      const brand = pageSpec?.brand_asset as R | undefined;
      let brandHash: string | undefined;
      if (brand) {
        const assetPath = resolve(workspace, brand.relative_path as string), workspaceRoot = `${resolve(workspace)}/`;
        if (!assetPath.startsWith(workspaceRoot)) fail("Brand asset must stay inside the episode workspace.", { page_id: item.page_id });
        const asset = readFileSync(assetPath); brandHash = hashBuffer(asset);
        if (brandHash !== brand.sha256) fail("Brand asset hash differs from construction_spec.json.", { page_id: item.page_id });
        const extension = extname(assetPath).toLowerCase();
        if (![".png", ".jpg", ".jpeg"].includes(extension)) fail("Brand asset must be PNG or JPEG.", { page_id: item.page_id, extension });
        const mime = extension === ".jpg" || extension === ".jpeg" ? "image/jpeg" : "image/png";
        const assetDataUrl = `data:${mime};base64,${asset.toString("base64")}`;
        const box = { x: brand.x as number, y: brand.y as number, width: brand.width as number, height: brand.height as number };
        originalUrl = await page.evaluate(async ({ baseDataUrl, assetDataUrl, box }) => (window as unknown as { composeBrandAsset: (base: string, asset: string, box: R) => Promise<string> }).composeBrandAsset(baseDataUrl, assetDataUrl, box), { baseDataUrl: originalUrl, assetDataUrl, box });
      }
      const phoneUrl = await page.evaluate(async ({ dataUrl, width }) => (window as unknown as { deriveRenderedPng: (url: string, width: number, grayscale: boolean) => Promise<string> }).deriveRenderedPng(dataUrl, width, false), { dataUrl: originalUrl, width: 390 });
      const grayscaleUrl = await page.evaluate(async ({ dataUrl, width }) => (window as unknown as { deriveRenderedPng: (url: string, width: number, grayscale: boolean) => Promise<string> }).deriveRenderedPng(dataUrl, width, true), { dataUrl: originalUrl, width: 1200 });
      const original = pngBuffer(originalUrl), phone = pngBuffer(phoneUrl), grayscale = pngBuffer(grayscaleUrl);
      const slug = `${String(rendered.length).padStart(2, "0")}-${String(item.page_id).replace(/[^a-zA-Z0-9_-]/g, "-")}`;
      const originalPath = join(out, `${slug}.png`), phonePath = join(out, `${slug}-phone.png`), grayscalePath = join(out, `${slug}-grayscale.png`);
      writeFileSync(originalPath, original); writeFileSync(phonePath, phone); writeFileSync(grayscalePath, grayscale);
      const record: R = { page_id: item.page_id, scene_sha256: item.sha256, png: relative(workspace, originalPath), png_sha256: hashBuffer(original), phone_png: relative(workspace, phonePath), phone_png_sha256: hashBuffer(phone), grayscale_png: relative(workspace, grayscalePath), grayscale_png_sha256: hashBuffer(grayscale), ...(brandHash ? { brand_asset_sha256: brandHash } : {}) };
      rendered.push(record);
      writeFileSync(join(out, "checks", `${slug}.md`), `# RENDERED_PAGE_CHECK\n\n- Page: ${item.page_id}\n- Scene SHA-256: ${item.sha256}\n- 原尺寸 PNG SHA-256: ${record.png_sha256}\n- 390px PNG SHA-256: ${record.phone_png_sha256}\n- 灰度 PNG SHA-256: ${record.grayscale_png_sha256}\n\n## 仍需人工填写\n\n- 规则到像素：待检查\n- 遮字、压线与越界：待检查\n- 内容差异：待检查\n- 手机阅读：待检查\n- 独立视觉审核：待检查\n`);
    }
  } finally { await browser.close(); if (existsSync(html)) unlinkSync(html); }
  const renderManifest: R = { schema_version: "1.0", kind: "render_manifest", status: "completed", scene_manifest_sha256: hashJson(manifest), pages: rendered, created_at: new Date().toISOString() };
  validateArtifact("render_manifest", renderManifest);
  const gate: R = { schema_version: "1.0", kind: "render_gate", status: "needs_human_review", render_manifest_sha256: hashJson(renderManifest), checks: [{ name: "same_scene_real_png_export", status: "pass", details: { pages: rendered.length } }, { name: "original_phone_grayscale_review", status: "needs_human_review", details: { check_directory: "04-rendered/checks" } }, { name: "independent_visual_review", status: "needs_human_review", details: { required_verdict: "TARGET" } }], human_review_required: true, independent_review_required: true };
  validateArtifact("render_gate", gate);
  writeFileSync(join(out, "render_manifest.json"), `${JSON.stringify(renderManifest, null, 2)}\n`);
  writeFileSync(join(out, "render_gate.json"), `${JSON.stringify(gate, null, 2)}\n`);
  return { status: gate.status, pages: rendered.length, output: out };
}
