import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { PipelineError } from "./contracts.js";
import { persistEditorialHandoff, type EditorialPolicy, type EditorialSemanticHandoff } from "./editorial.js";

const args = process.argv.slice(2);
const value = (name: string) => { const index = args.indexOf(name); return index === -1 ? undefined : args[index + 1]; };
const workspace = value("--workspace"), handoffPath = value("--handoff"), max = value("--max-deep-dive-pages");
if (!workspace || !handoffPath || (max !== undefined && (!/^\d+$/.test(max) || Number(max) < 1))) {
  console.error("Usage: npm run editorial:assemble -- --workspace <episode-workspace> --handoff <current-skill-editorial-result.json> [--focus text] [--audience text] [--max-deep-dive-pages n] [--output-language zh-CN] [--force]");
  process.exit(2);
}
try {
  const policy: Partial<EditorialPolicy> = { focus: value("--focus") ?? null, audience: value("--audience") ?? null, max_deep_dive_pages: max === undefined ? null : Number(max), output_language: value("--output-language") ?? "zh-CN" };
  const result = persistEditorialHandoff(workspace, JSON.parse(readFileSync(handoffPath, "utf8")) as EditorialSemanticHandoff, policy, args.includes("--force"));
  process.stdout.write(`${JSON.stringify({ status: result.gate.status, cache_hit: result.cache_hit, cache_key: result.cache_key, workspace, gate_path: "01-understanding/editorial_gate.json", review_path: "01-understanding/editorial_review.md" })}\n`);
} catch (error) {
  const payload = error instanceof PipelineError ? error.toJSON() : { code: "EDITORIAL_PLAN_INVALID", stage: "editorial_assemble", message: error instanceof Error ? error.message : String(error), recoverable: false };
  mkdirSync(join(workspace, "01-understanding"), { recursive: true });
  writeFileSync(join(workspace, "01-understanding", "editorial.error.json"), `${JSON.stringify(payload, null, 2)}\n`);
  process.stderr.write(`${JSON.stringify(payload)}\n`);
  process.exitCode = 1;
}
