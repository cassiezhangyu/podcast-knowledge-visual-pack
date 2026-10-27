import { createHash } from "node:crypto";
import { existsSync, renameSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { assertEpisodeContentInventory, type EpisodeContentInventory } from "./content-inventory.js";
import { assessContentSplit, type ContentSplit, type ContentSplitCoverage } from "./content-split.js";
import { assertCurrentGroundedTranscriptQa } from "./grounded-transcript-qa.js";
import { PipelineError } from "./contracts.js";
import { validateArtifact } from "./validate.js";

type R = Record<string, unknown>;
const args = process.argv.slice(2);
const value = (name: string) => { const index = args.indexOf(name); return index === -1 ? undefined : args[index + 1]; };
const workspace = value("--workspace"), stage = value("--stage"), action = value("--action") ?? "check";
if (!workspace || !["inventory", "split"].includes(stage ?? "") || !["check", "approve"].includes(action)) {
  console.error("Usage: npm run content:gate -- --workspace <episode-workspace> --stage <inventory|split> [--action <check|approve>] [--reviewed-by name] [--note text]");
  process.exit(2);
}
const read = <T>(path: string) => JSON.parse(readFileSync(path, "utf8")) as T;
const hash = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const hashText = (value: string) => createHash("sha256").update(value).digest("hex");
const write = (path: string, data: unknown) => writeFileSync(path, `${JSON.stringify(data, null, 2)}\n`);
const understanding = join(workspace, "01-understanding");

try {
  mkdirSync(understanding, { recursive: true });
  assertCurrentGroundedTranscriptQa(workspace);
  if (stage === "inventory") {
    const inventory = read<EpisodeContentInventory>(join(understanding, "episode_content_inventory.json"));
    const grounded = read<{ spans: R[] }>(join(workspace, "00-source", "transcript_grounded.json"));
    const document = readFileSync(join(understanding, "内容梳理.md"), "utf8");
    const audio = read<R>(join(workspace, "00-source", "audio_manifest.json"));
    const audioSha = ((audio.content_identity as R).sha256 as string);
    const assessment = assertEpisodeContentInventory(inventory, grounded as never, audioSha);
    const hashes = { episode_content_inventory: hash(inventory), content_review_document: hashText(document), grounded_transcript: hash(grounded) };
    let approval: R | undefined;
    if (action === "approve") {
      approval = { schema_version: "1.0", kind: "human_approval", stage: "content_review", status: "accepted", artifact_hashes: hashes, reviewed_by: value("--reviewed-by") ?? "user", reviewed_at: new Date().toISOString(), note: value("--note") ?? "" };
      validateArtifact("human_approval", approval);
      write(join(understanding, "content_review_human_approval.json"), approval);
    }
    const gate: R = { schema_version: "1.0", kind: "content_review_gate", status: approval ? "pass" : "needs_human_review", episode_content_inventory_sha256: hashes.episode_content_inventory, content_review_document_sha256: hashes.content_review_document, grounded_transcript_sha256: hashes.grounded_transcript, checks: [{ name: "whole_transcript_coverage_and_evidence", status: "pass", details: assessment }, { name: "human_content_review", status: approval ? "pass" : "needs_human_review", details: approval ? { approval_sha256: hash(approval) } : { required: true } }], human_review_required: !approval, ...(approval ? { human_review: { approval_sha256: hash(approval) } } : {}) };
    validateArtifact("content_review_gate", gate); write(join(understanding, "content_review_gate.json"), gate);
    process.stdout.write(`${JSON.stringify({ stage, status: gate.status, gate: "01-understanding/content_review_gate.json" })}\n`);
  } else {
    const inventory = read<EpisodeContentInventory>(join(understanding, "episode_content_inventory.json"));
    const split = read<ContentSplit>(join(understanding, "content_split.json"));
    const coverage = read<ContentSplitCoverage>(join(understanding, "content_split_coverage.json"));
    const document = readFileSync(join(understanding, "内容拆分.md"), "utf8");
    const assessment = assessContentSplit(inventory, split, coverage);
    if (!assessment.pass) throw new PipelineError("KNOWLEDGE_INPUT_INVALID", "content_split_gate", "《内容拆分》未通过内容去向与证据完整性检查。", false, assessment);
    const hashes = { episode_content_inventory: hash(inventory), content_split: hash(split), content_split_coverage: hash(coverage), content_split_document: hashText(document) };
    let approval: R | undefined;
    if (action === "approve") {
      const inventoryApproval = read<R>(join(understanding, "content_review_human_approval.json"));
      const inventoryGate = read<R>(join(understanding, "content_review_gate.json"));
      validateArtifact("human_approval", inventoryApproval);
      validateArtifact("content_review_gate", inventoryGate);
      const grounded = read<R>(join(workspace, "00-source", "transcript_grounded.json"));
      const reviewDocument = readFileSync(join(understanding, "内容梳理.md"), "utf8");
      const inventoryHashes = inventoryApproval.artifact_hashes as R;
      if (inventoryGate.status !== "pass" || inventoryGate.episode_content_inventory_sha256 !== hashes.episode_content_inventory || inventoryGate.grounded_transcript_sha256 !== hash(grounded) || inventoryGate.content_review_document_sha256 !== hashText(reviewDocument) || inventoryHashes.episode_content_inventory !== hashes.episode_content_inventory || inventoryHashes.grounded_transcript !== hash(grounded) || inventoryHashes.content_review_document !== hashText(reviewDocument) || (inventoryGate.human_review as R).approval_sha256 !== hash(inventoryApproval)) throw new PipelineError("KNOWLEDGE_INPUT_INVALID", "content_split_gate", "《内容梳理》审批哈希已失效。", false);
      approval = { schema_version: "1.0", kind: "human_approval", stage: "content_split", status: "accepted", artifact_hashes: hashes, reviewed_by: value("--reviewed-by") ?? "user", reviewed_at: new Date().toISOString(), note: value("--note") ?? "" };
      validateArtifact("human_approval", approval);
      write(join(understanding, "content_split_human_approval.json"), approval);
    }
    const gate: R = { schema_version: "1.0", kind: "content_split_gate", status: approval ? "pass" : "needs_human_review", episode_content_inventory_sha256: hashes.episode_content_inventory, content_split_sha256: hashes.content_split, content_split_coverage_sha256: hashes.content_split_coverage, content_split_document_sha256: hashes.content_split_document, checks: [{ name: "complete_content_disposition", status: "pass", details: assessment }, { name: "human_content_split_review", status: approval ? "pass" : "needs_human_review", details: approval ? { approval_sha256: hash(approval) } : { required: true } }], human_review_required: !approval, ...(approval ? { human_review: { approval_sha256: hash(approval) } } : {}) };
    validateArtifact("content_split_gate", gate); write(join(understanding, "content_split_gate.json"), gate);
    process.stdout.write(`${JSON.stringify({ stage, status: gate.status, gate: "01-understanding/content_split_gate.json" })}\n`);
  }
} catch (error) {
  const payload = error instanceof PipelineError ? error.toJSON() : { code: "KNOWLEDGE_INPUT_INVALID", stage: stage === "inventory" ? "content_review_gate" : "content_split_gate", message: error instanceof Error ? error.message : String(error), recoverable: false };
  write(join(understanding, `${stage}.error.json`), payload);
  const gatePath = join(understanding, stage === "inventory" ? "content_review_gate.json" : "content_split_gate.json");
  if (existsSync(gatePath)) renameSync(gatePath, `${gatePath}.invalid-${Date.now()}`);
  process.stderr.write(`${JSON.stringify(payload)}\n`); process.exitCode = 1;
}
