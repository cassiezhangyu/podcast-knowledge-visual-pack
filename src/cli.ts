import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { PipelineError } from "./contracts.js";
import { runIntake } from "./intake.js";
import { applyCorrectionRequest, runTranscript } from "./transcript.js";

function usage(): never { console.error("Usage: npm run intake -- <xiaoyuzhou-episode-url> --output <workspace> --until <audio|transcript> [--provider-python <path>] [--asr-strategy <auto|direct|segmented>] [--asr-environment <stable|bounded>] [--require-segment-resume] [--asr-batch-size <n>] [--correction-request <path>]"); process.exit(2); }
const args = process.argv.slice(2);
const url = args.find((arg) => !arg.startsWith("--"));
const outputIndex = args.indexOf("--output");
const untilIndex = args.indexOf("--until");
const until = untilIndex === -1 ? undefined : args[untilIndex + 1];
const pythonIndex = args.indexOf("--provider-python");
const batchIndex = args.indexOf("--asr-batch-size");
const strategyIndex = args.indexOf("--asr-strategy");
const environmentIndex = args.indexOf("--asr-environment");
const correctionIndex = args.indexOf("--correction-request");
if (!url || outputIndex === -1 || !args[outputIndex + 1] || (until !== "audio" && until !== "transcript")) usage();
const workspace = args[outputIndex + 1];

try {
  await runIntake(url, workspace);
  if (until === "transcript") {
    const pythonPath = pythonIndex === -1 ? process.env.PODCAST_MLX_PYTHON : args[pythonIndex + 1];
    if (!pythonPath) throw new PipelineError("ASR_PROVIDER_UNAVAILABLE", "transcribe", "--provider-python or PODCAST_MLX_PYTHON is required for the local MLX provider.", false);
    const batchSize = batchIndex === -1 ? 1 : Number(args[batchIndex + 1]);
    if (!Number.isSafeInteger(batchSize) || batchSize < 1) usage();
    const strategy = strategyIndex === -1 ? "auto" : args[strategyIndex + 1];
    const environment = environmentIndex === -1 ? "stable" : args[environmentIndex + 1];
    if (strategy !== "auto" && strategy !== "direct" && strategy !== "segmented") usage();
    if (environment !== "stable" && environment !== "bounded") usage();
    const result = await runTranscript(workspace, pythonPath, undefined, { batchSize, strategy, environment, requireSegmentResume: args.includes("--require-segment-resume") });
    if (correctionIndex !== -1) applyCorrectionRequest(workspace, args[correctionIndex + 1]);
    process.stdout.write(`${JSON.stringify({ status: result.status, workspace, ...(result.status === "partial" ? { completed_segments: result.completedSegments, total_segments: result.totalSegments } : {}) })}\n`);
    if (result.status !== "partial") {
      const qa = JSON.parse(readFileSync(join(workspace, "00-source", "grounded_transcript_qa.json"), "utf8"));
      process.stdout.write(`${JSON.stringify({ status: "ok", workspace, transcript_gate: qa.status, semantic_review_required: true })}\n`);
    }
  } else process.stdout.write(`${JSON.stringify({ status: "ok", workspace })}\n`);
} catch (error) {
  const payload = error instanceof PipelineError ? error.toJSON() : { code: "AUDIO_DOWNLOAD_FAILED", stage: "acquire", message: error instanceof Error ? error.message : String(error), recoverable: true };
  mkdirSync(join(workspace, "00-source"), { recursive: true });
  writeFileSync(join(workspace, "00-source", "intake.error.json"), `${JSON.stringify(payload, null, 2)}\n`);
  process.stderr.write(`${JSON.stringify(payload)}\n`);
  process.exitCode = 1;
}
