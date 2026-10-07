#!/usr/bin/env node
// 在同一宿主权限和浏览器路径下依次构建、真实导出预检、正式渲染。
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
if (!args.includes("--workspace")) {
  console.error("Usage: npm run render:checked -- --workspace <episode-workspace> [--pages page_id,page_id]");
  process.exit(2);
}

const env = { ...process.env };
const macChrome = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
if (!env.PODCAST_MAP_CHROME_PATH && process.platform === "darwin" && existsSync(macChrome)) {
  env.PODCAST_MAP_CHROME_PATH = macChrome;
}

for (const [name, command, commandArgs] of [
  ["build", "npm", ["run", "build"]],
  ["render:preflight", process.execPath, [join(root, "scripts/render-runtime-preflight.mjs")]],
  ["render", process.execPath, [join(root, "dist/render-cli.js"), ...args]],
]) {
  console.log(`[render:checked] ${name}; browser=${env.PODCAST_MAP_CHROME_PATH ?? "playwright-bundled"}`);
  const result = spawnSync(command, commandArgs, { cwd: root, env, stdio: "inherit" });
  if (result.error) {
    console.error(result.error.message);
    process.exit(1);
  }
  if (result.status !== 0) process.exit(result.status ?? 1);
}
