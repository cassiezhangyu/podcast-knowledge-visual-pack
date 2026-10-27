import { createHash } from "node:crypto";
import { PipelineError } from "./contracts.js";
import { validateArtifact } from "./validate.js";
import type { GroundedSpan } from "./knowledge.js";

type CoverageSegment = {
  id: string;
  start_span_id: string;
  end_span_id: string;
  disposition: "semantic" | "context_only" | "non_semantic" | "excluded";
  content_unit_ids: string[];
};

type InventoryAnchor = {
  id: string;
  artifact_sha256: string;
  locator: string;
  audio_sha256: string;
  start_ms: number;
  end_ms: number;
};

type ContentUnit = {
  id: string;
  evidence_anchor_ids: string[];
  supporting_details: Array<{ id: string; importance: "core" | "supporting" | "context"; evidence_anchor_ids: string[] }>;
};

export type EpisodeContentInventory = {
  schema_version: "2.0";
  kind: "episode_content_inventory";
  input: { audio_sha256: string; grounded_transcript_sha256: string };
  evidence_anchors: InventoryAnchor[];
  coverage_segments: CoverageSegment[];
  content_units: ContentUnit[];
};

const hash = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");

export function assessEpisodeContentInventory(
  inventory: EpisodeContentInventory,
  grounded: { spans: GroundedSpan[] },
  expectedAudioSha256: string,
) {
  validateArtifact("episode_content_inventory", inventory);
  const spanIds = grounded.spans.map((span) => span.id);
  const spanPosition = new Map(spanIds.map((id, index) => [id, index]));
  const expanded: string[] = [];
  const invalidSegments: string[] = [];

  for (const segment of inventory.coverage_segments) {
    const start = spanPosition.get(segment.start_span_id);
    const end = spanPosition.get(segment.end_span_id);
    if (start === undefined || end === undefined || start > end) {
      invalidSegments.push(segment.id);
      continue;
    }
    if (segment.disposition === "semantic" && !segment.content_unit_ids.length) invalidSegments.push(segment.id);
    if ((segment.disposition === "non_semantic" || segment.disposition === "excluded") && segment.content_unit_ids.length) invalidSegments.push(segment.id);
    expanded.push(...spanIds.slice(start, end + 1));
  }

  const count = new Map<string, number>();
  for (const id of expanded) count.set(id, (count.get(id) ?? 0) + 1);
  const missingSpanIds = spanIds.filter((id) => !count.has(id));
  const overlappingSpanIds = spanIds.filter((id) => (count.get(id) ?? 0) > 1);
  const outOfOrder = expanded.length !== spanIds.length || expanded.some((id, index) => id !== spanIds[index]);

  const unitIds = new Set(inventory.content_units.map((unit) => unit.id));
  const referencedUnitIds = new Set(inventory.coverage_segments.flatMap((segment) => segment.content_unit_ids));
  const missingUnitReferences = [...referencedUnitIds].filter((id) => !unitIds.has(id));
  const unassignedUnitIds = [...unitIds].filter((id) => !referencedUnitIds.has(id));

  const spansById = new Map(grounded.spans.map((span) => [span.id, span]));
  const groundedHash = hash(grounded);
  const anchorIds = new Set<string>();
  const invalidAnchorIds: string[] = [];
  for (const anchor of inventory.evidence_anchors) {
    const span = spansById.get(anchor.locator);
    if (anchorIds.has(anchor.id) || !span || anchor.artifact_sha256 !== groundedHash || anchor.audio_sha256 !== expectedAudioSha256 || anchor.start_ms !== span.start_ms || anchor.end_ms !== span.end_ms) invalidAnchorIds.push(anchor.id);
    anchorIds.add(anchor.id);
  }

  const danglingEvidenceReferences: string[] = [];
  for (const unit of inventory.content_units) {
    for (const id of unit.evidence_anchor_ids) if (!anchorIds.has(id)) danglingEvidenceReferences.push(`${unit.id}:${id}`);
    for (const detail of unit.supporting_details) {
      if ((detail.importance === "core" || detail.importance === "supporting") && !detail.evidence_anchor_ids.length) danglingEvidenceReferences.push(`${detail.id}:missing_evidence`);
      for (const id of detail.evidence_anchor_ids) if (!anchorIds.has(id)) danglingEvidenceReferences.push(`${detail.id}:${id}`);
    }
  }

  return {
    pass: inventory.input.grounded_transcript_sha256 === groundedHash
      && inventory.input.audio_sha256 === expectedAudioSha256
      && !invalidSegments.length
      && !missingSpanIds.length
      && !overlappingSpanIds.length
      && !outOfOrder
      && !missingUnitReferences.length
      && !unassignedUnitIds.length
      && !invalidAnchorIds.length
      && !danglingEvidenceReferences.length,
    groundedTranscriptSha256: groundedHash,
    invalidSegments,
    missingSpanIds,
    overlappingSpanIds,
    outOfOrder,
    missingUnitReferences,
    unassignedUnitIds,
    invalidAnchorIds,
    danglingEvidenceReferences,
  };
}

export function assertEpisodeContentInventory(
  inventory: EpisodeContentInventory,
  grounded: { spans: GroundedSpan[] },
  expectedAudioSha256: string,
) {
  const assessment = assessEpisodeContentInventory(inventory, grounded, expectedAudioSha256);
  if (!assessment.pass) throw new PipelineError("KNOWLEDGE_INPUT_INVALID", "content_review_gate", "《内容梳理》未通过全文覆盖与证据完整性检查。", false, assessment);
  return assessment;
}
