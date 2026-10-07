import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { PipelineError } from "./contracts.js";

const require = createRequire(import.meta.url);
const Ajv = require("ajv/dist/2020").default;
const addFormats = require("ajv-formats").default;
const schemaRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "schemas");
const load = (name: string) => JSON.parse(readFileSync(join(schemaRoot, name), "utf8"));
const ajv = addFormats(new Ajv({ allErrors: true, strict: false }));
const sourceRef = load("source_ref.schema.json");
ajv.addSchema(sourceRef, "source_ref.schema.json");

export function validateArtifact(name: "episode_metadata" | "audio_manifest" | "audio_preflight" | "segment_manifest" | "raw_transcript" | "clean_transcript" | "grounded_transcript" | "corrections" | "transcript_qa" | "grounded_transcript_qa" | "asr_checkpoint" | "asr_run_state" | "asr_direct_receipt" | "evidence_anchor" | "episode_content_inventory" | "content_review_gate" | "content_split" | "content_split_coverage" | "content_split_gate" | "human_approval" | "understanding_loss_audit" | "knowledge_human_review" | "knowledge_base" | "knowledge_graph" | "knowledge_gate" | "knowledge_benchmark" | "editorial_plan" | "coverage_matrix" | "editorial_gate" | "visual_candidates" | "selected_visual_plan" | "visual_gate" | "construction_spec" | "construction_plan" | "scene_manifest" | "construction_gate" | "render_manifest" | "render_gate" | "independent_visual_review" | "public_copy_record" | "public_copy_gate" | "delivery_manifest" | "package_gate" | "accepted_artwork_import", value: unknown): void {
  const validate = ajv.compile(load(`${name}.schema.json`));
  if (!validate(value)) {
    throw new PipelineError("SCHEMA_VALIDATION_FAILED", "validate", `${name} failed schema validation`, false, { errors: validate.errors ?? [] });
  }
}
