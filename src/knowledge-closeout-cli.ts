import { PipelineError } from "./contracts.js";
import { finalizeKnowledgeHumanReview } from "./knowledge.js";

const args = process.argv.slice(2);
const workspaceIndex = args.indexOf("--workspace"), reviewedOnIndex = args.indexOf("--reviewed-on");
if (workspaceIndex === -1 || !args[workspaceIndex + 1] || reviewedOnIndex === -1 || !/^\d{4}-\d{2}-\d{2}$/.test(args[reviewedOnIndex + 1])) {
  console.error("Usage: npm run knowledge:closeout -- --workspace <episode-workspace> --reviewed-on YYYY-MM-DD");
  process.exit(2);
}
try {
  const gate = finalizeKnowledgeHumanReview(args[workspaceIndex + 1], args[reviewedOnIndex + 1]);
  process.stdout.write(`${JSON.stringify({ status: gate.status, gate_path: "01-understanding/knowledge_gate.json", human_review: gate.human_review })}\n`);
} catch (error) {
  const payload = error instanceof PipelineError ? error.toJSON() : { code: "KNOWLEDGE_GATE_FAILED", stage: "knowledge_gate", message: error instanceof Error ? error.message : String(error), recoverable: false };
  process.stderr.write(`${JSON.stringify(payload)}\n`);
  process.exitCode = 1;
}
