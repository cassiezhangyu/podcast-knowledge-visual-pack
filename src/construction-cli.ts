import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { PipelineError } from "./contracts.js";
import { construct } from "./construction.js";
const args = process.argv.slice(2), index = args.indexOf("--workspace"), workspace = index === -1 ? undefined : args[index + 1];
const pagesIndex = args.indexOf("--pages"), pages = pagesIndex === -1 ? undefined : args[pagesIndex + 1]?.split(",").filter(Boolean);
if (!workspace || (pagesIndex !== -1 && !pages?.length)) { console.error("Usage: npm run construct -- --workspace <episode-workspace> [--pages page_id,page_id]"); process.exit(2); }
try { process.stdout.write(`${JSON.stringify(await construct(workspace, pages))}\n`); }
catch (error) { const payload = error instanceof PipelineError ? error.toJSON() : { code: "CONSTRUCTION_INVALID", stage: "construction", message: error instanceof Error ? error.message : String(error), recoverable: false }; mkdirSync(join(workspace!, "03-excalidraw"), { recursive: true }); writeFileSync(join(workspace!, "03-excalidraw", "construction.error.json"), `${JSON.stringify(payload, null, 2)}\n`); process.stderr.write(`${JSON.stringify(payload)}\n`); process.exitCode = 1; }
