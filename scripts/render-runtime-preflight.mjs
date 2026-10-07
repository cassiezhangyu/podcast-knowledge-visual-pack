#!/usr/bin/env node
// 使用正式 Excalidraw 浏览器适配器验证当前执行环境能导出真实 PNG。
import { chromium } from "playwright";
import { existsSync, readFileSync, writeFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const fixture = join(root, "examples/positive/e248-cover-accepted-2026-09-22/cover.excalidraw");
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
  writeFileSync(html, `<!doctype html><meta charset="utf-8"><script src="${pathToFileURL(bundle).href}"></script>`);
  browser = await chromium.launch({ headless: true, ...(executablePath ? { executablePath } : {}) });
  const page = await browser.newPage({ viewport: { width: 1280, height: 1800 }, deviceScaleFactor: 1 });
  await page.goto(pathToFileURL(html).href);
  const scene = JSON.parse(readFileSync(fixture, "utf8"));
  const originalUrl = await page.evaluate(async value => window.renderPersistedExcalidrawScene(value), scene);
  const phoneUrl = await page.evaluate(async dataUrl => window.deriveRenderedPng(dataUrl, 390, false), originalUrl);
  const grayUrl = await page.evaluate(async dataUrl => window.deriveRenderedPng(dataUrl, 1200, true), originalUrl);
  const original = dimensions(originalUrl), phone = dimensions(phoneUrl), gray = dimensions(grayUrl);
  if (original.width !== 1200 || original.height !== 1600 || phone.width !== 390 || phone.height !== 520 || gray.width !== 1200 || gray.height !== 1600) {
    throw new Error(`导出尺寸异常：${JSON.stringify({ original, phone })}`);
  }
  const outputIndex = process.argv.indexOf("--output");
  if (outputIndex >= 0) {
    const { mkdirSync } = await import("node:fs");
    const output = resolve(process.argv[outputIndex + 1]); mkdirSync(output, { recursive: true });
    for (const [name, url] of [["original", originalUrl], ["phone", phoneUrl], ["gray", grayUrl]])
      writeFileSync(join(output, `${name}.png`), Buffer.from(url.replace(/^data:image\/png;base64,/, ""), "base64"));
  }
  console.log(JSON.stringify({ status: "pass", browser: executablePath ?? "playwright-bundled", original, phone, gray }));
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
