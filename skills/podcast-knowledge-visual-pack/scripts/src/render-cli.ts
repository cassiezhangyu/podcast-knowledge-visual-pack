import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { PipelineError } from "./contracts.js";
import { renderScenes } from "./render.js";
const args = process.argv.slice(2), value = (name: string) => { const index = args.indexOf(name); return index === -1 ? undefined : args[index + 1]; };
const workspace = value("--workspace"), pages = value("--pages")?.split(",").filter(Boolean);
if (!workspace) { console.error("Usage: npm run render -- --workspace <episode-workspace> [--pages page_id,page_id]"); process.exit(2); }
try { process.stdout.write(`${JSON.stringify(await renderScenes(workspace, pages))}\n`); }
catch (error) { const payload = error instanceof PipelineError ? error.toJSON() : { code: "CONSTRUCTION_GATE_FAILED", stage: "construction_gate", message: error instanceof Error ? error.message : String(error), recoverable: false }; mkdirSync(join(workspace, "04-rendered"), { recursive: true }); writeFileSync(join(workspace, "04-rendered", "render.error.json"), `${JSON.stringify(payload, null, 2)}\n`); process.stderr.write(`${JSON.stringify(payload)}\n`); process.exitCode = 1; }
