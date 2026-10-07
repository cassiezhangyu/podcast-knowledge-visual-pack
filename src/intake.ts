import { createHash } from "node:crypto";
import { createWriteStream, existsSync, mkdirSync, readFileSync, renameSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, extname, join, relative } from "node:path";
import { Readable } from "node:stream";
import { finished } from "node:stream/promises";
import { ADAPTER_VERSION, AudioManifest, EpisodeMetadata, PipelineError, SourceRef } from "./contracts.js";
import { JsonLogger } from "./logger.js";
import { validateArtifact } from "./validate.js";
import { canonicalizeEpisodeUrl, XiaoyuzhouEpisodeAdapter } from "./xiaoyuzhou-adapter.js";

type FetchLike = typeof fetch;

function writeJson(path: string, value: unknown) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}

function readJson<T>(path: string): T { return JSON.parse(readFileSync(path, "utf8")) as T; }

function hashFile(path: string): string { return createHash("sha256").update(readFileSync(path)).digest("hex"); }

function extension(contentType: string | null, audioUrl: string): string {
  if (contentType?.includes("mpeg")) return ".mp3";
  if (contentType?.includes("mp4") || contentType?.includes("aac")) return ".m4a";
  if (contentType?.includes("ogg")) return ".ogg";
  const candidate = extname(new URL(audioUrl).pathname);
  return /^\.[A-Za-z0-9]{1,5}$/.test(candidate) ? candidate : ".audio";
}

export class AudioAcquirer {
  constructor(private readonly fetchImpl: FetchLike = fetch) {}

  async acquire(metadata: EpisodeMetadata, workspace: string, logger: JsonLogger): Promise<AudioManifest> {
    const sourceDir = join(workspace, "00-source");
    const manifestPath = join(sourceDir, "audio_manifest.json");
    const audioUrl = metadata.episode.audio_candidates[0];
    if (!audioUrl) throw new PipelineError("AUDIO_UNAVAILABLE", "acquire", "No normally public audio URL was found in the episode page.", true, { canonical_url: metadata.source_identity.canonical_url });
    if (existsSync(manifestPath)) {
      const cached = readJson<AudioManifest>(manifestPath);
      try {
        validateArtifact("audio_manifest", cached);
        const assetPath = join(workspace, cached.asset.relative_path);
        if (cached.source_identity.canonical_url === metadata.source_identity.canonical_url && cached.retrieval.audio_url === audioUrl && existsSync(assetPath) && statSync(assetPath).size === cached.asset.byte_length && hashFile(assetPath) === cached.content_identity.sha256) {
          const hit = { ...cached, source_identity: metadata.source_identity, status: "cache_hit" as const };
          writeJson(manifestPath, hit);
          logger.info("audio.cache_hit", { sha256: hit.content_identity.sha256, relative_path: hit.asset.relative_path });
          return hit;
        }
        throw new PipelineError("CACHE_CORRUPT", "cache", "Audio manifest did not match its cached asset.", true, { manifest_path: manifestPath });
      } catch (error) {
        if (error instanceof PipelineError && error.code !== "CACHE_CORRUPT") throw error;
        logger.info("audio.cache_invalid", { reason: error instanceof Error ? error.message : "unknown" });
      }
    }
    logger.info("audio.download_started", { audio_url: audioUrl });
    let response: Response;
    try { response = await this.fetchImpl(audioUrl, { headers: { accept: "audio/*,*/*;q=0.8", "user-agent": "podcast-knowledge-skill/0.2" } }); }
    catch (cause) { throw new PipelineError("AUDIO_DOWNLOAD_FAILED", "acquire", "Audio request failed.", true, { cause: cause instanceof Error ? cause.message : String(cause) }); }
    if (response.status === 401 || response.status === 403) throw new PipelineError("AUDIO_ACCESS_RESTRICTED", "acquire", `Audio request returned HTTP ${response.status}.`, false, { audio_url: audioUrl });
    if (!response.ok || !response.body) throw new PipelineError("AUDIO_DOWNLOAD_FAILED", "acquire", `Audio request returned HTTP ${response.status}.`, true, { audio_url: audioUrl });
    const tempPath = join(sourceDir, "audio", ".download-partial");
    mkdirSync(dirname(tempPath), { recursive: true });
    const hasher = createHash("sha256");
    const output = createWriteStream(tempPath);
    try {
      const stream = Readable.fromWeb(response.body as import("node:stream/web").ReadableStream);
      stream.on("data", (chunk: Buffer) => hasher.update(chunk));
      stream.pipe(output);
      await finished(output);
    } catch (cause) {
      if (existsSync(tempPath)) unlinkSync(tempPath);
      throw new PipelineError("AUDIO_DOWNLOAD_FAILED", "acquire", "Audio stream could not be saved completely.", true, { cause: cause instanceof Error ? cause.message : String(cause) });
    }
    const byteLength = statSync(tempPath).size;
    if (byteLength < 1) { unlinkSync(tempPath); throw new PipelineError("AUDIO_DOWNLOAD_FAILED", "acquire", "Audio response was empty.", true); }
    const sha256 = hasher.digest("hex");
    const mimeType = response.headers.get("content-type");
    const assetPath = join(sourceDir, "audio", `${sha256}${extension(mimeType, audioUrl)}`);
    renameSync(tempPath, assetPath);
    const timestamp = new Date().toISOString();
    const sourceRef: SourceRef = { kind: "audio_download", locator: audioUrl, retrieved_at: timestamp, note: `sha256:${sha256}` };
    const manifest: AudioManifest = {
      schema_version: "1.0", source_identity: metadata.source_identity, status: "acquired",
      content_identity: { sha256 }, asset: { relative_path: relative(workspace, assetPath), byte_length: byteLength, mime_type: mimeType },
      retrieval: { audio_url: audioUrl, retrieved_at: timestamp, http_status: response.status }, source_refs: [sourceRef],
    };
    validateArtifact("audio_manifest", manifest);
    writeJson(manifestPath, manifest);
    logger.info("audio.download_completed", { sha256, bytes: byteLength, relative_path: manifest.asset.relative_path });
    return manifest;
  }
}

export async function runIntake(episodeUrl: string, workspace: string, fetchImpl: FetchLike = fetch): Promise<{ metadata: EpisodeMetadata; manifest: AudioManifest; logger: JsonLogger }> {
  const logger = new JsonLogger();
  const { canonicalUrl } = canonicalizeEpisodeUrl(episodeUrl);
  const metadataPath = join(workspace, "00-source", "episode_metadata.json");
  let metadata: EpisodeMetadata;
  if (existsSync(metadataPath)) {
    metadata = readJson<EpisodeMetadata>(metadataPath);
    validateArtifact("episode_metadata", metadata);
    if (metadata.source_identity.canonical_url !== canonicalUrl || metadata.source_identity.adapter_version !== ADAPTER_VERSION) {
      metadata = await new XiaoyuzhouEpisodeAdapter(fetchImpl).resolve(episodeUrl);
      validateArtifact("episode_metadata", metadata);
      writeJson(metadataPath, metadata);
      logger.info("metadata.refreshed", { canonical_url: metadata.source_identity.canonical_url });
    } else logger.info("metadata.cache_hit", { canonical_url: metadata.source_identity.canonical_url });
  } else {
    metadata = await new XiaoyuzhouEpisodeAdapter(fetchImpl).resolve(episodeUrl);
    validateArtifact("episode_metadata", metadata);
    writeJson(metadataPath, metadata);
    logger.info("metadata.resolved", { canonical_url: metadata.source_identity.canonical_url, episode_id: metadata.episode.id });
  }
  const manifest = await new AudioAcquirer(fetchImpl).acquire(metadata, workspace, logger);
  writeJson(join(workspace, "00-source", "intake.log.json"), logger.events);
  return { metadata, manifest, logger };
}
