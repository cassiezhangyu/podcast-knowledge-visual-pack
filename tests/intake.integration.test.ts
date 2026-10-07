import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { runIntake } from "../src/intake.js";
import { PipelineError } from "../src/contracts.js";

const workspaces: string[] = [];
const episodeUrl = "https://www.xiaoyuzhoufm.com/episode/6a87c3f51352af56ff3999b8";
function workspace() { const path = mkdtempSync(join(tmpdir(), "podcast-intake-")); workspaces.push(path); return path; }
afterEach(() => workspaces.splice(0).forEach((path) => rmSync(path, { recursive: true, force: true })));

describe("intake integration", () => {
  it("writes validated artifacts, a content hash, and uses both source and content cache on rerun", async () => {
    const fetchMock = vi.fn(async (input: string | URL) => {
      if (String(input) === episodeUrl) return new Response(`<meta property="og:title" content="真实结构测试"><meta property="og:audio" content="https://audio.example.test/e.m4a"><script id="__NEXT_DATA__" type="application/json">{"showNotes":"完整笔记"}</script>`, { status: 200 });
      return new Response(new Uint8Array([1, 2, 3, 4]), { status: 200, headers: { "content-type": "audio/mp4" } });
    });
    const output = workspace();
    const first = await runIntake(episodeUrl, output, fetchMock as typeof fetch);
    expect(first.manifest.status).toBe("acquired");
    expect(first.manifest.content_identity.sha256).toMatch(/^[a-f0-9]{64}$/);
    const metadata = JSON.parse(readFileSync(join(output, "00-source", "episode_metadata.json"), "utf8"));
    const manifest = JSON.parse(readFileSync(join(output, "00-source", "audio_manifest.json"), "utf8"));
    expect(metadata.episode.id).toBe("6a87c3f51352af56ff3999b8");
    expect(manifest.asset.byte_length).toBe(4);
    const second = await runIntake(episodeUrl, output, fetchMock as typeof fetch);
    expect(second.manifest.status).toBe("cache_hit");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("stops with a stable error when the page exposes no normally public audio", async () => {
    const fetchMock = vi.fn(async () => new Response(`<meta property="og:title" content="无音频">`, { status: 200 }));
    await expect(runIntake(episodeUrl, workspace(), fetchMock as typeof fetch)).rejects.toMatchObject<Partial<PipelineError>>({ code: "AUDIO_UNAVAILABLE", stage: "acquire" });
  });

  it("does not bypass an access-restricted audio response", async () => {
    const fetchMock = vi.fn(async (input: string | URL) => String(input) === episodeUrl
      ? new Response(`<meta property="og:audio" content="https://audio.example.test/restricted.m4a">`, { status: 200 })
      : new Response("forbidden", { status: 403 }));
    await expect(runIntake(episodeUrl, workspace(), fetchMock as typeof fetch)).rejects.toMatchObject<Partial<PipelineError>>({ code: "AUDIO_ACCESS_RESTRICTED", stage: "acquire" });
  });
});
