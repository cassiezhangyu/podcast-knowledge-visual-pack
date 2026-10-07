import { describe, expect, it, vi } from "vitest";
import { PipelineError } from "../src/contracts.js";
import { XiaoyuzhouEpisodeAdapter } from "../src/xiaoyuzhou-adapter.js";

const html = `<!doctype html><html><head>
<meta property="og:title" content="测试节目标题"><meta property="og:site_name" content="测试播客">
<meta property="og:audio" content="https://cdn.example.test/audio.m4a"><meta property="og:image" content="https://cdn.example.test/cover.jpg">
<meta property="article:published_time" content="2026-09-17"><meta property="music:duration" content="123">
<script id="__NEXT_DATA__" type="application/json">{"props":{"pageProps":{"showNotes":"这是节目笔记","enclosure":{"url":"https://cdn.example.test/audio.m4a"}}}}</script>
</head></html>`;

describe("XiaoyuzhouEpisodeAdapter", () => {
  it("resolves semantic metadata and public audio candidates from HTML and embedded JSON", async () => {
    const fetchMock = vi.fn(async () => new Response(html, { status: 200 }));
    const result = await new XiaoyuzhouEpisodeAdapter(fetchMock as typeof fetch).resolve("https://www.xiaoyuzhoufm.com/episode/6a87c3f51352af56ff3999b8?from=share");
    expect(result.source_identity.canonical_url).toBe("https://www.xiaoyuzhoufm.com/episode/6a87c3f51352af56ff3999b8");
    expect(result.episode).toMatchObject({ id: "6a87c3f51352af56ff3999b8", title: "测试节目标题", podcast_name: "测试播客", duration_seconds: 123, show_notes: "这是节目笔记" });
    expect(result.episode.audio_candidates).toEqual(["https://cdn.example.test/audio.m4a"]);
  });

  it("rejects non-episode URLs before network access", async () => {
    const fetchMock = vi.fn();
    await expect(new XiaoyuzhouEpisodeAdapter(fetchMock as typeof fetch).resolve("https://www.xiaoyuzhoufm.com/podcast/abc")).rejects.toMatchObject<Partial<PipelineError>>({ code: "INVALID_EPISODE_URL" });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
