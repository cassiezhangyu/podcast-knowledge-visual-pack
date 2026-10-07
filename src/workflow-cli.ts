import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { assertCurrentGroundedTranscriptQa } from "./grounded-transcript-qa.js";
type R = Record<string, unknown>;
const args = process.argv.slice(2), index = args.indexOf("--workspace"), workspace = index === -1 ? undefined : args[index + 1];
if (!workspace) { console.error("Usage: npm run workflow:status -- --workspace <episode-workspace>"); process.exit(2); }
const state = (relativePath: string) => {
  const path = join(workspace, relativePath);
  if (!existsSync(path)) return { exists: false, status: "missing" };
  try { const value = JSON.parse(readFileSync(path, "utf8")) as R; return { exists: true, status: String(value.status ?? "present") }; }
  catch { return { exists: true, status: "present" }; }
};
const stages = [
  { id: "intake", artifact: "00-source/episode_metadata.json", pass: ["present"], next: "npm run intake -- <episode-url> --output <workspace> --until transcript --provider-python <mlx-python>" },
  { id: "transcript", artifact: "00-source/grounded_transcript_qa.json", pass: ["pass"], next: "完成或复核 grounded transcript" },
  { id: "content_review", artifact: "01-understanding/content_review_gate.json", pass: ["pass"], next: "生成《内容梳理》后运行 npm run content:gate -- --stage inventory" },
  { id: "content_split", artifact: "01-understanding/content_split_gate.json", pass: ["pass"], next: "用户通过《内容梳理》后生成《内容拆分》，运行 npm run content:gate -- --stage split" },
  { id: "knowledge", artifact: "01-understanding/knowledge_gate.json", pass: ["pass"], next: "完成知识模型与人工语义审核" },
  { id: "editorial", artifact: "01-understanding/editorial_gate.json", pass: ["pass"], next: "完成图片内容规划与人工审核" },
  { id: "visual_reasoning", artifact: "02-visual-plan/visual_gate.json", pass: ["pass"], next: "完成视觉候选、选择与人工艺术指导审核" },
  { id: "construction", artifact: "03-excalidraw/construction_gate.json", pass: ["pass"], next: "提交 construction_spec.json 并运行 npm run construct；打开可编辑 scene 检查后运行 npm run construction:closeout" },
  { id: "render_review", artifact: "04-rendered/render_gate.json", pass: ["pass"], next: "构图前保存参考预检，真实渲染后生成隔离审核输入包；隔离审核 TARGET 后以 --packet 执行 visual:closeout --action submit，用户通过当前页后再 --action approve --user-approved" },
  { id: "public_copy", artifact: "06-delivery/public_copy_gate.json", pass: ["pass"], next: "完成小红书草稿、Humanizer、AI 痕迹检查与忠实度回归" },
  { id: "package", artifact: "06-delivery/package_gate.json", pass: ["pass"], next: "运行 npm run package -- --action assemble，整包审核后再 --action approve" },
];
const report = stages.map((stage) => { const result = { ...stage, ...state(stage.artifact) };
  if (stage.id === "transcript") { try { assertCurrentGroundedTranscriptQa(workspace); } catch { result.status = result.exists ? "invalid_or_stale" : "missing"; } }
  return result;
});
const progressDirectory = join(workspace, "00-source/asr-runs");
let latestProgress: unknown = null;
if (existsSync(progressDirectory)) {
  const paths = readdirSync(progressDirectory).filter(x => x.endsWith(".progress.json")).map(x => join(progressDirectory, x)).sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs);
  if (paths[0]) { try {
    const observation = JSON.parse(readFileSync(paths[0], "utf8"));
    const ageSeconds = (Date.now() - Date.parse(observation.updated_at)) / 1000;
    latestProgress = { ...observation, observation_age_seconds: ageSeconds, observation_state: ["completed", "failed"].includes(observation.status) ? "terminal" : Number.isFinite(ageSeconds) && ageSeconds < 30 ? "recent_heartbeat" : "stale_needs_verification" };
  } catch { latestProgress = { observation_state: "unreadable_needs_verification" }; } }
}
const blocked = report.find((stage) => !stage.pass.includes(stage.status));
process.stdout.write(`${JSON.stringify({ status: blocked ? "in_progress" : "complete", latest_asr_observation: latestProgress, next_stage: blocked?.id ?? null, next_action: blocked?.next ?? null, stages: report.map(({ next, pass, ...stage }) => stage) }, null, 2)}\n`);
