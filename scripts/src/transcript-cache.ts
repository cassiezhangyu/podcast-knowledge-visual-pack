import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
/** v0.4.7-local：缓存的转写可用＝grounded_transcript.json 与 grounded_transcript_qa.json 都在且 QA 不是 fail。 */
export function cachedTranscriptReady(workspace: string): boolean {
  const g = join(workspace, "00-source", "grounded_transcript.json"), q = join(workspace, "00-source", "grounded_transcript_qa.json");
  if (!existsSync(g) || !existsSync(q)) return false;
  try { return JSON.parse(readFileSync(q, "utf8")).status !== "fail"; } catch { return false; }
}
