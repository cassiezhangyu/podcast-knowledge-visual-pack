import { readFileSync } from "node:fs";
import { registerDeliveryVersions } from "./delivery-versions.js";
const args = process.argv.slice(2); const val = (k: string) => { const i = args.indexOf(k); return i === -1 ? undefined : args[i + 1]; };
try {
  const ws = val("--workspace"), spec = val("--versions");
  if (!ws || !spec) throw new Error("用法：npm run visual:register-versions -- --workspace <ws> --versions <versions.json> --approved-by Cassie --approved-at 2026-10-22 --approval-source sketch_route_selection --route-approval <记录> --user-approved");
  const s = JSON.parse(readFileSync(spec, "utf8"));
  const r = registerDeliveryVersions(ws, { page_id: s.page_id, versions: s.versions, approved_by: val("--approved-by") ?? "", approved_at: val("--approved-at") ?? "", approval_source: (val("--approval-source") ?? "sketch_route_selection") as any, route_approval_record: val("--route-approval"), note: val("--note"), userApproved: args.includes("--user-approved") });
  process.stdout.write(JSON.stringify({ status: r.status, page_id: r.page_id, versions: r.versions.map((v: any) => ({ id: v.version_id, status: v.status, errors: v.errors })) }, null, 2) + "\n");
  if (r.status !== "registered") process.exitCode = 1;
} catch (e) { process.stderr.write(JSON.stringify({ code: "DELIVERY_VERSIONS_REJECTED", message: e instanceof Error ? e.message : String(e) }) + "\n"); process.exitCode = 1; }
