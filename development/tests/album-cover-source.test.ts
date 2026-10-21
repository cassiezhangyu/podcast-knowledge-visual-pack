import { describe, expect, it } from "vitest";
import { validateAlbumCoverSource } from "../../scripts/src/construction.js";
// @ts-ignore
import { checkAlbumCoverSource } from "../../scripts/album-cover-check.mjs";
const md = { episode: { podcast_cover_url: "https://image.xyzcdn.net/ALBUM.jpg", episode_cover_url: "https://image.xyzcdn.net/EP.jpg", cover_url: "https://image.xyzcdn.net/EP.jpg@small" } };
const spec = (u?: string) => [{ page_id: "P01", brand_asset: { relative_path: "a.png", sha256: "0".repeat(64), x: 0, y: 0, width: 1, height: 1, source_url: u } }] as never;
describe("album cover source", () => {
  it("passes album cover", () => { expect(() => validateAlbumCoverSource(spec("https://image.xyzcdn.net/ALBUM.jpg@large"), md)).not.toThrow(); expect(checkAlbumCoverSource({ metadata: md, sourceUrl: "https://image.xyzcdn.net/ALBUM.jpg" }).status).toBe("pass"); });
  it("rejects episode cover", () => { expect(() => validateAlbumCoverSource(spec("https://image.xyzcdn.net/EP.jpg"), md)).toThrow(/单集封面/); expect(() => checkAlbumCoverSource({ metadata: md, sourceUrl: "https://image.xyzcdn.net/EP.jpg" })).toThrow(/单集封面/); });
  it("rejects missing source or metadata", () => { expect(() => validateAlbumCoverSource(spec(undefined), md)).toThrow(); expect(() => validateAlbumCoverSource(spec("x"), { episode: {} })).toThrow(/podcast_cover_url/); });
});
