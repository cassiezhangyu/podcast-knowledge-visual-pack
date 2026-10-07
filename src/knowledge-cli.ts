import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { PipelineError } from "./contracts.js";
import { prepareKnowledgeBenchmark } from "./knowledge.js";

const args = process.argv.slice(2);
const index = args.indexOf("--workspace");
if (index === -1 || !args[index + 1]) { console.error("Usage: npm run knowledge:prepare -- --workspace <episode-workspace>"); process.exit(2); }
const workspace = args[index + 1];
try {
  const result = prepareKnowledgeBenchmark(workspace);
  process.stdout.write(`${JSON.stringify({ status: "prepared", workspace, cache: result.cache, window_count: result.windowCount, benchmark_path: "01-understanding/knowledge_provider_benchmark.json", full_golden_allowed: result.benchmark.evaluation.full_golden_allowed })}\n`);
}
catch (error) {
  const payload = error instanceof PipelineError ? error.toJSON() : { code: "KNOWLEDGE_INPUT_INVALID", stage: "knowledge_prepare", message: error instanceof Error ? error.message : String(error), recoverable: false };
  mkdirSync(join(workspace, "01-understanding"), { recursive: true }); writeFileSync(join(workspace, "01-understanding", "knowledge.error.json"), `${JSON.stringify(payload, null, 2)}\n`); process.stderr.write(`${JSON.stringify(payload)}\n`); process.exitCode = 1;
}
