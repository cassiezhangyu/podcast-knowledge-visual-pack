import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { PipelineError } from "./contracts.js";
import { persistKnowledgeModelHandoff, type KnowledgeModelHandoff } from "./knowledge.js";

const args = process.argv.slice(2);
const workspaceIndex = args.indexOf("--workspace"), handoffIndex = args.indexOf("--handoff");
if (workspaceIndex === -1 || !args[workspaceIndex + 1] || handoffIndex === -1 || !args[handoffIndex + 1]) {
  console.error("Usage: npm run knowledge:assemble -- --workspace <episode-workspace> --handoff <current-skill-model-result.json>");
  process.exit(2);
}
const workspace = args[workspaceIndex + 1];
try {
  const handoff = JSON.parse(readFileSync(args[handoffIndex + 1], "utf8")) as KnowledgeModelHandoff;
  const result = persistKnowledgeModelHandoff(workspace, handoff);
  process.stdout.write(`${JSON.stringify({ status: result.gate.status, workspace, cache: result.cache, gate_path: "01-understanding/knowledge_gate.json", review_path: "01-understanding/knowledge_review.md" })}\n`);
} catch (error) {
  const payload = error instanceof PipelineError ? error.toJSON() : { code: "KNOWLEDGE_INPUT_INVALID", stage: "knowledge_assemble", message: error instanceof Error ? error.message : String(error), recoverable: false };
  mkdirSync(join(workspace, "01-understanding"), { recursive: true });
  writeFileSync(join(workspace, "01-understanding", "knowledge.error.json"), `${JSON.stringify(payload, null, 2)}\n`);
  process.stderr.write(`${JSON.stringify(payload)}\n`);
  process.exitCode = 1;
}
