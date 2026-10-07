import * as cheerio from "cheerio";
import { ADAPTER_VERSION, EpisodeMetadata, PipelineError, SourceRef } from "./contracts.js";

type FetchLike = typeof fetch;
const now = () => new Date().toISOString();

export function canonicalizeEpisodeUrl(input: string): { canonicalUrl: string; episodeId: string } {
  let url: URL;
  try { url = new URL(input); } catch { throw new PipelineError("INVALID_EPISODE_URL", "resolve", "Episode URL is not a valid URL.", false); }
  if (!/^(www\.)?xiaoyuzhoufm\.com$/i.test(url.hostname) || !/^\/episode\/([A-Za-z0-9]+)\/?$/.test(url.pathname)) {
    throw new PipelineError("INVALID_EPISODE_URL", "resolve", "URL must be a Xiaoyuzhou episode URL.", false, { input });
  }
  const episodeId = url.pathname.match(/^\/episode\/([A-Za-z0-9]+)\/?$/)?.[1];
  if (!episodeId) throw new PipelineError("INVALID_EPISODE_URL", "resolve", "Episode ID is missing.", false);
  return { canonicalUrl: `https://www.xiaoyuzhoufm.com/episode/${episodeId}`, episodeId };
}

function meta($: cheerio.CheerioAPI, ...keys: string[]): string | null {
  for (const key of keys) {
    const value = $(`meta[property="${key}"], meta[name="${key}"]`).first().attr("content")?.trim();
    if (value) return value;
  }
  return null;
}

function allJsonValues(value: unknown, keys: RegExp, found: string[] = []): string[] {
  if (Array.isArray(value)) for (const item of value) allJsonValues(item, keys, found);
  else if (value && typeof value === "object") {
    for (const [key, child] of Object.entries(value)) {
      if (keys.test(key) && typeof child === "string" && child.trim()) found.push(child.trim());
      allJsonValues(child, keys, found);
    }
  }
  return found;
}

function embeddedValues(html: string, keys: RegExp): string[] {
  const $ = cheerio.load(html);
  const values: string[] = [];
  $("script[type='application/ld+json'], script#__NEXT_DATA__").each((_, node) => {
    try { allJsonValues(JSON.parse($(node).text()), keys, values); } catch { /* non-JSON script is not evidence */ }
  });
  return values;
}

function embeddedDocuments(html: string): unknown[] {
  const $ = cheerio.load(html);
  const documents: unknown[] = [];
  $("script[type='application/ld+json'], script#__NEXT_DATA__").each((_, node) => {
    try { documents.push(JSON.parse($(node).text())); } catch { /* non-JSON script is not evidence */ }
  });
  return documents;
}

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function stringAt(value: unknown, ...keys: string[]): string | null {
  const object = record(value);
  if (!object) return null;
  for (const key of keys) if (typeof object[key] === "string" && object[key].trim()) return object[key].trim();
  return null;
}

function numberAt(value: unknown, ...keys: string[]): number | null {
  const object = record(value);
  if (!object) return null;
  for (const key of keys) {
    const candidate = object[key];
    if (typeof candidate === "number" && Number.isFinite(candidate) && candidate >= 0) return candidate;
    if (typeof candidate === "string") { const parsed = toSeconds(candidate); if (parsed !== null) return parsed; }
  }
  return null;
}

function findEpisode(value: unknown, episodeId: string): Record<string, unknown> | null {
  if (Array.isArray(value)) {
    for (const child of value) { const found = findEpisode(child, episodeId); if (found) return found; }
    return null;
  }
  const object = record(value);
  if (!object) return null;
  const enclosure = record(object.enclosure);
  const mediaSource = record(record(object.media)?.source);
  if ((stringAt(object, "eid", "id") === episodeId || enclosure?.url || mediaSource?.url) && (typeof enclosure?.url === "string" || typeof mediaSource?.url === "string")) return object;
  for (const child of Object.values(object)) { const found = findEpisode(child, episodeId); if (found) return found; }
  return null;
}

function toSeconds(value: string | null): number | null {
  if (!value) return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric >= 0 ? numeric : null;
}

export class XiaoyuzhouEpisodeAdapter {
  constructor(private readonly fetchImpl: FetchLike = fetch) {}

  async resolve(input: string): Promise<EpisodeMetadata> {
    const { canonicalUrl, episodeId } = canonicalizeEpisodeUrl(input);
    const response = await this.fetchImpl(canonicalUrl, { headers: { accept: "text/html,application/xhtml+xml", "user-agent": "podcast-knowledge-skill/0.2" } });
    if (response.status === 404) throw new PipelineError("EPISODE_NOT_FOUND", "resolve", "Episode page was not found.", false, { canonical_url: canonicalUrl });
    if (!response.ok) throw new PipelineError("METADATA_INCOMPLETE", "resolve", `Episode page returned HTTP ${response.status}.`, true, { canonical_url: canonicalUrl });
    const html = await response.text();
    const $ = cheerio.load(html);
    const timestamp = now();
    const embeddedEpisode = embeddedDocuments(html).map((document) => findEpisode(document, episodeId)).find((value): value is Record<string, unknown> => Boolean(value));
    const embeddedPodcast = record(embeddedEpisode?.podcast);
    const embeddedEnclosure = record(embeddedEpisode?.enclosure);
    const embeddedMediaSource = record(record(embeddedEpisode?.media)?.source);
    const audioCandidates = [...new Set([
      stringAt(embeddedEnclosure, "url"), stringAt(embeddedMediaSource, "url"),
      meta($, "og:audio", "twitter:audio"),
      ...embeddedValues(html, /^(audio(url)?|enclosure|media(url)?)$/i),
    ].filter((value): value is string => Boolean(value)).filter((value) => /^https?:\/\//.test(value)))];
    const refs: SourceRef[] = [
      { kind: "input_url", locator: canonicalUrl, retrieved_at: timestamp },
      { kind: "html_meta", locator: canonicalUrl, retrieved_at: timestamp, note: "HTML metadata and structured-data extraction" },
    ];
    if (html.includes("__NEXT_DATA__") || html.includes("application/ld+json")) refs.push({ kind: "embedded_json", locator: canonicalUrl, retrieved_at: timestamp });
    return {
      schema_version: "1.0", source_identity: { canonical_url: canonicalUrl, adapter_version: ADAPTER_VERSION },
      episode: {
        id: episodeId,
        title: stringAt(embeddedEpisode, "title") ?? meta($, "og:title", "twitter:title") ?? ($("title").first().text().trim() || null),
        podcast_name: stringAt(embeddedPodcast, "title") ?? meta($, "og:site_name", "twitter:site"),
        published_at: stringAt(embeddedEpisode, "pubDate", "publishedAt") ?? meta($, "article:published_time", "publish-date", "date"),
        duration_seconds: numberAt(embeddedEpisode, "duration", "durationSeconds") ?? toSeconds(meta($, "music:duration", "og:duration")),
        show_notes: stringAt(embeddedEpisode, "shownotes", "showNotes", "description") ?? embeddedValues(html, /^(showNotes|shownotes|description)$/i)[0] ?? meta($, "og:description", "description"),
        cover_url: stringAt(record(embeddedEpisode?.image), "smallPicUrl", "picUrl", "url") ?? meta($, "og:image", "twitter:image"), audio_candidates: audioCandidates,
      }, source_refs: refs,
    };
  }
}
