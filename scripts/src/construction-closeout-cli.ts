import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { PipelineError } from "./contracts.js";
import { validateArtifact } from "./validate.js";

type R = Record<string, unknown>;
const args = process.argv.slice(2), value = (name: string) => { const index = args.indexOf(name); return index === -1 ? undefined : args[index + 1]; };
const workspace = value("--workspace"), reviewedBy = value("--reviewed-by") ?? "user";
if (!workspace) { console.error("Usage: npm run construction:closeout -- --workspace <episode-workspace> [--reviewed-by name] [--note text]"); process.exit(2); }
const read = <T>(path: string) => JSON.parse(readFileSync(path, "utf8")) as T;
const hashJson = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const hashBuffer = (value: Buffer) => createHash("sha256").update(value).digest("hex");

try {
  const output = join(workspace, "03-excalidraw");
  const plan = read<R>(join(output, "construction_plan.json"));
  const manifest = read<R>(join(output, "scene_manifest.json"));
  const existingGate = read<R>(join(output, "construction_gate.json"));
  validateArtifact("construction_plan", plan); validateArtifact("scene_manifest", manifest); validateArtifact("construction_gate", existingGate);
  if (existingGate.construction_plan_sha256 !== hashJson(plan) || existingGate.scene_manifest_sha256 !== hashJson(manifest)) throw new PipelineError("CONSTRUCTION_GATE_FAILED", "construction_gate", "Construction review inputs changed after construction.", false);
  const artifactHashes: R = { construction_plan: hashJson(plan), scene_manifest: hashJson(manifest) };
  for (const page of manifest.pages as R[]) {
    const current = hashBuffer(readFileSync(join(workspace, page.file as string)));
    if (current !== page.sha256) throw new PipelineError("CONSTRUCTION_GATE_FAILED", "construction_gate", "Editable scene changed after scene_manifest.json.", false, { page_id: page.page_id });
    artifactHashes[String(page.page_id)] = current;
  }
  const approval: R = { schema_version: "1.0", kind: "human_approval", stage: "construction", status: "accepted", artifact_hashes: artifactHashes, reviewed_by: reviewedBy, reviewed_at: new Date().toISOString(), note: value("--note") ?? "" };
  validateArtifact("human_approval", approval); writeFileSync(join(output, "construction_human_approval.json"), `${JSON.stringify(approval, null, 2)}\n`);
  const checks = (existingGate.checks as R[]).filter((check) => check.name !== "human_construction_review");
  checks.push({ name: "human_construction_review", status: "pass", details: { approval_sha256: hashJson(approval), required_checks: ["open_all_scenes", "edit_text", "move_group_and_object", "move_bound_arrow", "inspect_wrapping_and_collisions", "inspect_hero_and_guardrails"] } });
  const gate: R = { ...existingGate, status: "pass", checks, human_review_required: false };
  validateArtifact("construction_gate", gate); writeFileSync(join(output, "construction_gate.json"), `${JSON.stringify(gate, null, 2)}\n`);
  process.stdout.write(`${JSON.stringify({ status: "pass", pages: (manifest.pages as R[]).length, gate: "03-excalidraw/construction_gate.json" })}\n`);
} catch (error) {
  const payload = error instanceof PipelineError ? error.toJSON() : { code: "CONSTRUCTION_GATE_FAILED", stage: "construction_gate", message: error instanceof Error ? error.message : String(error), recoverable: false };
  process.stderr.write(`${JSON.stringify(payload)}\n`); process.exitCode = 1;
}
