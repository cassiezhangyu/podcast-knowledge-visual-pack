// Verifies the top-right brand asset is the PODCAST ALBUM cover, not the episode cover.
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
export const normalizeCoverUrl = u => (typeof u === 'string' && u) ? u.split('?')[0].split('@')[0].trim() : null;
export function findEpisodeMetadata(start) {
  let dir = resolve(start);
  for (let i = 0; i < 8; i++) { const p = join(dir, '00-source', 'episode_metadata.json'); if (existsSync(p)) return p; const up = dirname(dir); if (up === dir) break; dir = up; }
  return null;
}
export function checkAlbumCoverSource({ metadata, sourceUrl }) {
  const ep = metadata?.episode || {};
  const album = normalizeCoverUrl(ep.podcast_cover_url);
  const episodeCovers = [ep.episode_cover_url, ep.cover_url].map(normalizeCoverUrl).filter(Boolean);
  const src = normalizeCoverUrl(sourceUrl);
  if (!album) throw new Error('episode_metadata 缺少 podcast_cover_url（专辑封面）；请重新抓取或补录后再合成');
  if (!src) throw new Error('品牌素材缺少 source_url；无法核对是否为专辑封面');
  if (episodeCovers.includes(src) && src !== album) throw new Error('品牌素材来源是单集封面，不是专辑封面：' + src);
  if (src !== album) throw new Error('品牌素材来源与专辑封面不一致：' + src + ' ≠ ' + album);
  return { status: 'pass', podcast_cover_url: album, source_url: src };
}

/** v0.4.5-local：抓取时登记的专辑封面文件（00-source/brand/album_cover.json）是唯一来源。 */
export function checkAlbumCoverFile({ record, assetSha256 }) {
  if (!record) return { status: 'not_recorded' };
  const allowed = [record.asset_sha256, record.png_sha256].filter(Boolean);
  if (!allowed.includes(assetSha256)) throw new Error('右上角素材不是抓取时登记的专辑封面文件（sha256 不一致）；请用 00-source/brand/album_cover.json 记录的文件');
  return { status: 'pass', sha256: assetSha256, source_url: record.source_url };
}
