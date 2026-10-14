import { existsSync } from "node:fs";
import { join } from "node:path";

/** Standard delivery folder name. */
export const DELIVERY_DIR = "06-delivery";
/** Older workspaces used a plain `delivery/` folder; still accepted for reading. */
export const LEGACY_DELIVERY_DIR = "delivery";

/**
 * Resolve the delivery folder of a workspace: `06-delivery/` when it exists or
 * when neither exists (new workspaces), otherwise a legacy `delivery/` folder.
 */
export function resolveDeliveryDir(workspace: string, warn = true): string {
  const standard = join(workspace, DELIVERY_DIR), legacy = join(workspace, LEGACY_DELIVERY_DIR);
  if (existsSync(standard) || !existsSync(legacy)) return standard;
  if (warn) process.stderr.write(`[pkvp] 使用旧交付目录 ${legacy}；新工作区请用 ${DELIVERY_DIR}/。\n`);
  return legacy;
}
