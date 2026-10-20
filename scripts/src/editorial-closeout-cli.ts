import { PipelineError } from "./contracts.js";
import { finalizeEditorialHumanReview } from "./editorial.js";

const args = process.argv.slice(2);
const value = (name: string) => { const index = args.indexOf(name); return index === -1 ? undefined : args[index + 1]; };
const workspace = value("--workspace"), reviewedOn = value("--reviewed-on");
if (!workspace || !reviewedOn || !/^\d{4}-\d{2}-\d{2}$/.test(reviewedOn)) {
  console.error("Usage: npm run editorial:closeout -- --workspace <episode-workspace> --reviewed-on YYYY-MM-DD");
  process.exit(2);
}
try {
  const gate = finalizeEditorialHumanReview(workspace, reviewedOn);
  process.stdout.write(`${JSON.stringify({ status: gate.status, gate_path: "01-understanding/editorial_gate.json", human_review: gate.human_review })}\n`);
} catch (error) {
  const payload = error instanceof PipelineError ? error.toJSON() : { code: "EDITORIAL_GATE_FAILED", stage: "editorial_gate", message: error instanceof Error ? error.message : String(error), recoverable: false };
  process.stderr.write(`${JSON.stringify(payload)}\n`);
  process.exitCode = 1;
}
