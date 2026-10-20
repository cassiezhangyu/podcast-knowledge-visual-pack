#!/usr/bin/env node
// 使用正式 Excalidraw 浏览器适配器验证当前执行环境能导出真实 PNG。
import { launchZh, newZhPage, ZH_HTML_HEAD } from "./lib/zh_browser.mjs";
import { auditRenderedGeometry } from "./lib/rendered-geometry.mjs";
import { existsSync, readFileSync, writeFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const bundle = join(root, "dist/excalidraw-preview-browser.js");
const temp = mkdtempSync(join(tmpdir(), "podcast-render-preflight-"));
const macChrome = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const executablePath = process.env.PODCAST_MAP_CHROME_PATH
  || (process.platform === "darwin" && existsSync(macChrome) ? macChrome : undefined);
let browser;

function dimensions(dataUrl) {
  const png = Buffer.from(dataUrl.replace(/^data:image\/png;base64,/, ""), "base64");
  if (png.toString("hex", 0, 8) !== "89504e470d0a1a0a") throw new Error("导出结果不是 PNG");
  return { width: png.readUInt32BE(16), height: png.readUInt32BE(20), bytes: png.length };
}

try {
  const html = join(temp, "preview.html");
  writeFileSync(html, `${ZH_HTML_HEAD}<script src="${pathToFileURL(bundle).href}"></script>`);
  browser = await launchZh({ ...(executablePath ? { executablePath } : {}) });
  const page = await newZhPage(browser, { viewport: { width: 1280, height: 1800 }, deviceScaleFactor: 1 });
  await page.goto(pathToFileURL(html).href);
  const tokens = JSON.parse(readFileSync(join(root, "design_tokens.json"), "utf8"));
  // 环境预检使用有完整角色的最小原生探针，不把历史参考图当生产场景绕过校验。
  const base = { x: 0, y: 0, width: 1200, height: 1600, angle: 0, strokeColor: "#FFFFFF", backgroundColor: "#FFFFFF", fillStyle: "solid", opacity: 100, seed: 1, version: 1, versionNonce: 1, isDeleted: false, groupIds: [], boundElements: null, updated: 1, link: null, locked: false };
  const scene = { elements: [
    { ...base, id: "probe-canvas", type: "rectangle", ...tokens.stroke.role_settings.fill_only, customData: { stroke_role: "fill_only" } },
    { ...base, id: "probe-text", type: "text", x: 80, y: 80, width: 600, height: 30, strokeColor: "#273348", backgroundColor: "transparent", strokeWidth: 1, roughness: 0, text: "真实渲染环境预检", originalText: "真实渲染环境预检", fontFamily: 2, fontSize: tokens.typography.role_sizes.body, lineHeight: 1.25, textAlign: "left", verticalAlign: "top", containerId: null, autoResize: false, customData: { typography_role: "body" } }
  ], appState: { viewBackgroundColor: "#FFFFFF", exportBackground: true }, files: {} };
  const originalUrl = await page.evaluate(async ({ scene, tokens }) => window.renderPersistedExcalidrawScene(scene, tokens), { scene, tokens });
  const phoneUrl = await page.evaluate(async dataUrl => window.deriveRenderedPng(dataUrl, 390, false), originalUrl);
  const grayUrl = await page.evaluate(async dataUrl => window.deriveRenderedPng(dataUrl, 1200, true), originalUrl);
  const deliveryUrl = await page.evaluate(async ({scene,tokens}) => window.renderPersistedExcalidrawScene(scene,tokens,tokens.export.scale), {scene,tokens});
  const original = dimensions(originalUrl), phone = dimensions(phoneUrl), gray = dimensions(grayUrl), delivery = dimensions(deliveryUrl);
  if (delivery.width !== tokens.export.delivery_size[0] || delivery.height !== tokens.export.delivery_size[1]) throw new Error("高清重渲尺寸异常");
  const cleanGeometry = await page.evaluate(auditRenderedGeometry,{scene,tokens});
  if (cleanGeometry.findings.length) throw new Error("无碰撞探针产生像素误报");
  const crossedScene = {...scene,elements:[...scene.elements,{...base,id:"probe-cross-line",type:"line",x:80,y:95,width:600,height:0,points:[[0,0],[600,0]],strokeColor:"#273348",backgroundColor:"transparent",...tokens.stroke.role_settings.connector,customData:{stroke_role:"connector"}}]};
  const crossedGeometry = await page.evaluate(auditRenderedGeometry,{scene:crossedScene,tokens});
  if (!crossedGeometry.findings.some(f=>f.kind==="text_line_contact")) throw new Error("像素诊断未发现穿字线条");
  if (original.width !== 1200 || original.height !== 1600 || phone.width !== 390 || phone.height !== 520 || gray.width !== 1200 || gray.height !== 1600) {
    throw new Error(`导出尺寸异常：${JSON.stringify({ original, phone })}`);
  }
  const outputIndex = process.argv.indexOf("--output");
  if (outputIndex >= 0) {
    const { mkdirSync } = await import("node:fs");
    const output = resolve(process.argv[outputIndex + 1]); mkdirSync(output, { recursive: true });
    writeFileSync(join(output,"probe.excalidraw"),JSON.stringify(scene,null,2)+"\n");
    writeFileSync(join(output,"geometry-probes.json"),JSON.stringify({clean:cleanGeometry,crossed:crossedGeometry},null,2)+"\n");
    for (const [name, url] of [["original", originalUrl], ["phone", phoneUrl], ["gray", grayUrl], ["delivery", deliveryUrl]])
      writeFileSync(join(output, `${name}.png`), Buffer.from(url.replace(/^data:image\/png;base64,/, ""), "base64"));
  }
  console.log(JSON.stringify({ status: "pass", browser: executablePath ?? "playwright-bundled", original, phone, gray, delivery, pixel_diagnostic_controls: "pass" }));
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  const kind = message.includes("Executable doesn't exist") ? "BROWSER_NOT_INSTALLED"
    : /SIGABRT|MachPortRendezvousServer|bootstrap_check_in.*Permission denied/.test(message) ? "BROWSER_HOST_LAUNCH_BLOCKED"
      : "EXCALIDRAW_EXPORT_FAILED";
  console.error(JSON.stringify({ status: "fail", kind, browser: executablePath ?? "playwright-bundled", message: message.split("\n")[0] }));
  process.exitCode = 1;
} finally {
  if (browser) await browser.close();
  rmSync(temp, { recursive: true, force: true });
}
