import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { PipelineError } from "./contracts.js";
import { persistVisualSelection } from "./visual.js";
const args = process.argv.slice(2), value = (name: string) => { const index = args.indexOf(name); return index === -1 ? undefined : args[index + 1]; };
const workspace = value("--workspace"), handoff = value("--handoff");
if (!workspace || !handoff) { console.error("Usage: npm run visual:select -- --workspace <episode-workspace> --handoff <current-skill-visual-selection.json> [--force]"); process.exit(2); }
try { const result = persistVisualSelection(workspace, JSON.parse(readFileSync(handoff, "utf8")), args.includes("--force")); process.stdout.write(`${JSON.stringify({ status: result.gate.status, ...result, workspace, artifact: "02-visual-plan/selected_visual_plan.json" })}\n`); }
catch (error) { const payload = error instanceof PipelineError ? error.toJSON() : { code: "VISUAL_SELECTION_INVALID", stage: "visual_selection", message: error instanceof Error ? error.message : String(error), recoverable: false }; mkdirSync(join(workspace, "02-visual-plan"), { recursive: true }); writeFileSync(join(workspace, "02-visual-plan", "visual_selection.error.json"), `${JSON.stringify(payload, null, 2)}\n`); process.stderr.write(`${JSON.stringify(payload)}\n`); process.exitCode = 1; }
