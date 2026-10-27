import { applyErratum } from "./erratum.js";
const args = process.argv.slice(2); const val = (k: string) => { const i = args.indexOf(k); return i === -1 ? undefined : args[i + 1]; };
const all = (k: string) => args.flatMap((a, i) => a === k ? [args[i + 1]] : []);
try {
  const ws = val("--workspace"); if (!ws) throw new Error("用法：npm run erratum:apply -- --workspace <ws> --kind original_word --replace '旧=>新' --confirmed-by Cassie --confirmed-at 2026-10-22T10:00:00+08:00 [--note ...]");
  const replacements = all("--replace").map((r) => { const [o, n] = r.split("=>"); return { old: o, new: n }; });
  const entry = applyErratum(ws, { kind: (val("--kind") ?? "typo") as any, replacements, confirmed_by: val("--confirmed-by") ?? "", confirmed_at: val("--confirmed-at") ?? "", note: val("--note") });
  process.stdout.write(JSON.stringify({ status: "applied", occurrences: entry.occurrences, changed_files: entry.changed_files.length, log: "01-understanding/errata.json" }) + "\n");
} catch (e) { process.stderr.write(JSON.stringify({ code: "ERRATUM_REJECTED", message: e instanceof Error ? e.message : String(e) }) + "\n"); process.exitCode = 1; }
