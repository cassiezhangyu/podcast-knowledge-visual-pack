export const ADAPTER_VERSION = "1.0.2";

export type SourceRef = {
  kind: "input_url" | "html_meta" | "embedded_json" | "http_header" | "audio_download";
  locator: string;
  retrieved_at: string;
  note?: string;
};

export type SourceIdentity = { canonical_url: string; adapter_version: string };

export type EpisodeMetadata = {
  schema_version: "1.0";
  source_identity: SourceIdentity;
  episode: {
    id: string;
    title: string | null;
    podcast_name: string | null;
    published_at: string | null;
    duration_seconds: number | null;
    show_notes: string | null;
    cover_url: string | null;
    audio_candidates: string[];
  };
  source_refs: SourceRef[];
};

export type AudioManifest = {
  schema_version: "1.0";
  source_identity: SourceIdentity;
  status: "acquired" | "cache_hit";
  content_identity: { sha256: string };
  asset: { relative_path: string; byte_length: number; mime_type: string | null };
  retrieval: { audio_url: string; retrieved_at: string; http_status: number };
  source_refs: SourceRef[];
};

export type PipelineErrorCode =
  | "INVALID_EPISODE_URL" | "EPISODE_NOT_FOUND" | "METADATA_INCOMPLETE"
  | "AUDIO_UNAVAILABLE" | "AUDIO_ACCESS_RESTRICTED" | "AUDIO_DOWNLOAD_FAILED"
  | "CACHE_CORRUPT" | "SCHEMA_VALIDATION_FAILED" | "AUDIO_PRECHECK_FAILED"
  | "AUDIO_NO_SPEECH" | "ASR_PROVIDER_UNAVAILABLE" | "ASR_SEGMENT_FAILED"
  | "ASR_PROCESS_ERROR" | "ASR_EXECUTION_INTERRUPTED" | "ASR_CHECKPOINT_CORRUPT"
  | "TRANSCRIPT_GATE_FAILED" | "KNOWLEDGE_INPUT_INVALID" | "KNOWLEDGE_PROVIDER_UNAVAILABLE"
  | "KNOWLEDGE_PROVIDER_FAILED" | "KNOWLEDGE_WINDOW_FAILED" | "KNOWLEDGE_GATE_FAILED"
  | "EDITORIAL_INPUT_INVALID" | "EDITORIAL_PLAN_INVALID" | "EDITORIAL_GATE_FAILED"
  | "VISUAL_INPUT_INVALID" | "VISUAL_CANDIDATES_INVALID" | "VISUAL_SELECTION_INVALID" | "VISUAL_GATE_FAILED"
  | "CONSTRUCTION_INPUT_INVALID" | "CONSTRUCTION_INVALID" | "CONSTRUCTION_GATE_FAILED" | "TEXT_MEASUREMENT_UNAVAILABLE"
  | "BROWSER_NOT_INSTALLED" | "BROWSER_HOST_LAUNCH_BLOCKED" | "BROWSER_LAUNCH_FAILED";

export class PipelineError extends Error {
  constructor(
    public readonly code: PipelineErrorCode,
    public readonly stage: "resolve" | "acquire" | "cache" | "validate" | "preflight" | "segment" | "transcribe" | "clean" | "ground" | "transcript_gate" | "content_review_gate" | "content_split_gate" | "knowledge_prepare" | "knowledge_assemble" | "understand" | "reconcile" | "knowledge_gate" | "editorial_assemble" | "editorial_gate" | "visual_candidates" | "visual_selection" | "visual_gate" | "construction" | "construction_gate" | "render",
    message: string,
    public readonly recoverable: boolean,
    public readonly details?: Record<string, unknown>,
  ) { super(message); }

  toJSON() { return { code: this.code, stage: this.stage, message: this.message, recoverable: this.recoverable, details: this.details }; }
}
