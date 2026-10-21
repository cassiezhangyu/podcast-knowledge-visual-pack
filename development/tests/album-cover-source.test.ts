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

// @ts-ignore
import { checkAlbumCoverFile } from '../../scripts/album-cover-check.mjs';
import { acquireAlbumCover } from '../../scripts/src/intake.js';
import { mkdtempSync as mkd, readFileSync as rf, existsSync as ex } from 'node:fs';
import { tmpdir as td } from 'node:os';
import { join as jn } from 'node:path';
import { createHash as ch } from 'node:crypto';
describe('v0.4.5 抓取时登记专辑封面', () => {
  it('素材 sha256 必须与登记文件一致', () => {
    expect(checkAlbumCoverFile({ record: { asset_sha256: 'a', png_sha256: 'b' }, assetSha256: 'b' }).status).toBe('pass');
    expect(() => checkAlbumCoverFile({ record: { asset_sha256: 'a' }, assetSha256: 'z' })).toThrow('sha256');
    expect(checkAlbumCoverFile({ record: null, assetSha256: 'z' }).status).toBe('not_recorded');
  });
  it('intake 下载专辑封面并记录 sha256，第二次复用', async () => {
    const ws = mkd(jn(td(), 'cover-')); let calls = 0;
    const bytes = Buffer.from('fake-png-bytes');
    const f = (async () => { calls++; return new Response(bytes, { headers: { 'content-type': 'image/png' } }); }) as unknown as typeof fetch;
    const meta: any = { episode: { podcast_cover_url: 'https://image.example/album.png', episode_cover_url: 'https://image.example/ep.png' } };
    const rec: any = await acquireAlbumCover(meta, ws, f);
    expect(rec.source_url).toBe('https://image.example/album.png');
    expect(rec.asset_sha256).toBe(ch('sha256').update(bytes).digest('hex'));
    expect(ex(jn(ws, '00-source/brand/album_art.png'))).toBe(true);
    expect(JSON.parse(rf(jn(ws, '00-source/brand/album_cover.json'), 'utf8')).png_sha256).toBe(rec.asset_sha256);
    await acquireAlbumCover(meta, ws, f); expect(calls).toBe(1);
  });
});
