import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { PipelineError } from "./contracts.js";
import { validateArtifact } from "./validate.js";
type R = Record<string, unknown>;
const args = process.argv.slice(2), index = args.indexOf("--workspace"), workspace = index === -1 ? undefined : args[index + 1];
if (!workspace) { console.error("Usage: npm run public-copy:check -- --workspace <episode-workspace>"); process.exit(2); }
const hashText = (value: string) => createHash("sha256").update(value).digest("hex");
const hashJson = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const readJson = <T>(path: string) => JSON.parse(readFileSync(path, "utf8")) as T;
const delivery = join(workspace, "06-delivery");
try {
  const approvalText = readFileSync(join(workspace, "01-understanding", "content_split_human_approval.json"), "utf8");
  const approval = JSON.parse(approvalText) as R; validateArtifact("human_approval", approval);
  const draft = readFileSync(join(delivery, "xiaohongshu-draft.md"), "utf8");
  const final = readFileSync(join(delivery, "xiaohongshu.md"), "utf8");
  const reviewPath = join(delivery, "xiaohongshu-review.md");
  const review = existsSync(reviewPath) ? readFileSync(reviewPath, "utf8") : "";
  const record = readJson<R>(join(delivery, "public_copy_record.json")); validateArtifact("public_copy_record", record);
  const checks = {
    approval: record.content_split_human_approval_sha256 === hashText(approvalText),
    draft: record.draft_sha256 === hashText(draft),
    final: record.final_sha256 === hashText(final),
    review: review.trim().length > 0,
    humanizer: (record.humanizer as R).status === "completed" && (record.humanizer as R).scope === "expression_only",
    aiTrace: record.ai_trace_review === "pass",
    fidelity: record.fidelity_regression === "pass",
  };
  const pass = Object.values(checks).every(Boolean);
  const gate: R = { schema_version: "1.0", kind: "public_copy_gate", status: pass ? "pass" : "fail", public_copy_record_sha256: hashJson(record), checks: Object.entries(checks).map(([name, ok]) => ({ name, status: ok ? "pass" : "fail", details: {} })) };
  validateArtifact("public_copy_gate", gate); mkdirSync(delivery, { recursive: true }); writeFileSync(join(delivery, "public_copy_gate.json"), `${JSON.stringify(gate, null, 2)}\n`);
  if (!pass) throw new PipelineError("KNOWLEDGE_GATE_FAILED", "knowledge_gate", "小红书文案、复核记录或忠实度门禁未通过。", false, checks);
  process.stdout.write(`${JSON.stringify({ status: "pass", gate: "06-delivery/public_copy_gate.json" })}\n`);
} catch (error) {
  const payload = error instanceof PipelineError ? error.toJSON() : { code: "KNOWLEDGE_GATE_FAILED", stage: "knowledge_gate", message: error instanceof Error ? error.message : String(error), recoverable: false };
  mkdirSync(delivery, { recursive: true }); writeFileSync(join(delivery, "public-copy.error.json"), `${JSON.stringify(payload, null, 2)}\n`); process.stderr.write(`${JSON.stringify(payload)}\n`); process.exitCode = 1;
}
