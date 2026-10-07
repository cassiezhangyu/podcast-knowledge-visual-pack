#!/usr/bin/env node

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

const sha256 = (value) => createHash("sha256").update(JSON.stringify(value)).digest("hex");

function elementMap(scene) {
  const map = new Map();
  for (const element of scene.elements ?? []) {
    if (!element?.id || map.has(element.id)) {
      throw new Error(`scene contains a missing or duplicate element id: ${element?.id ?? "<missing>"}`);
    }
    map.set(element.id, element);
  }
  return map;
}

function stableEntries(map, isAllowed) {
  return [...map.entries()]
    .filter(([id]) => !isAllowed(id))
    .sort(([left], [right]) => left.localeCompare(right));
}

export function verifyScopedRepair(before, after, options = {}) {
  const allowedIds = new Set(options.allowedIds ?? []);
  const allowedPrefixes = options.allowedPrefixes ?? [];
  if (allowedIds.size === 0 && allowedPrefixes.length === 0) {
    throw new Error("at least one allowed element id or prefix is required");
  }

  const isAllowed = (id) => allowedIds.has(id) || allowedPrefixes.some((prefix) => id.startsWith(prefix));
  const beforeMap = elementMap(before);
  const afterMap = elementMap(after);
  const allIds = new Set([...beforeMap.keys(), ...afterMap.keys()]);
  const unauthorizedAdded = [];
  const unauthorizedRemoved = [];
  const unauthorizedModified = [];
  const allowedChanged = [];

  for (const id of [...allIds].sort()) {
    const left = beforeMap.get(id);
    const right = afterMap.get(id);
    const changed = JSON.stringify(left) !== JSON.stringify(right);
    if (!changed) continue;
    if (isAllowed(id)) {
      allowedChanged.push(id);
    } else if (!left) {
      unauthorizedAdded.push(id);
    } else if (!right) {
      unauthorizedRemoved.push(id);
    } else {
      unauthorizedModified.push(id);
    }
  }

  const beforeStable = stableEntries(beforeMap, isAllowed);
  const afterStable = stableEntries(afterMap, isAllowed);
  const appStateUnchanged = JSON.stringify(before.appState ?? {}) === JSON.stringify(after.appState ?? {});
  const filesUnchanged = JSON.stringify(before.files ?? {}) === JSON.stringify(after.files ?? {});
  const stableElementsUnchanged = sha256(beforeStable) === sha256(afterStable);
  const pass = stableElementsUnchanged && appStateUnchanged && filesUnchanged
    && unauthorizedAdded.length === 0 && unauthorizedRemoved.length === 0 && unauthorizedModified.length === 0;

  return {
    status: pass ? "pass" : "fail",
    scope: {
      allowed_ids: [...allowedIds].sort(),
      allowed_prefixes: [...allowedPrefixes].sort(),
      allowed_changed_ids: allowedChanged,
    },
    checks: {
      stable_elements_unchanged: stableElementsUnchanged,
      app_state_unchanged: appStateUnchanged,
      files_unchanged: filesUnchanged,
      no_unauthorized_changes: unauthorizedAdded.length === 0
        && unauthorizedRemoved.length === 0
        && unauthorizedModified.length === 0,
    },
    violations: {
      added: unauthorizedAdded,
      removed: unauthorizedRemoved,
      modified: unauthorizedModified,
    },
    stable_before_sha256: sha256(beforeStable),
    stable_after_sha256: sha256(afterStable),
    limitations: [
      "scene equality does not prove pixel equality",
      "this check does not validate content truth or visual quality",
    ],
  };
}

function parseArgs(argv) {
  const options = { allowedIds: [], allowedPrefixes: [] };
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    const value = argv[index + 1];
    if (["--before-scene", "--after-scene", "--allow-id", "--allow-prefix"].includes(flag) && !value) {
      throw new Error(`${flag} requires a value`);
    }
    if (flag === "--before-scene") options.beforeScene = value;
    else if (flag === "--after-scene") options.afterScene = value;
    else if (flag === "--allow-id") options.allowedIds.push(value);
    else if (flag === "--allow-prefix") options.allowedPrefixes.push(value);
    else if (flag === "--help") options.help = true;
    else throw new Error(`unknown argument: ${flag}`);
    if (flag !== "--help") index += 1;
  }
  return options;
}

function usage() {
  return [
    "Usage:",
    "  node scripts/verify-scoped-visual-repair.mjs \\",
    "    --before-scene BASE.excalidraw --after-scene CANDIDATE.excalidraw \\",
    "    --allow-id exact-id [--allow-id another-id] [--allow-prefix prefix]",
    "",
    "Every changed, added, or removed element must match an allowed id or prefix.",
    "The command also requires appState and files to remain unchanged.",
  ].join("\n");
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    console.log(usage());
    return;
  }
  if (!options.beforeScene || !options.afterScene) throw new Error("--before-scene and --after-scene are required");
  const before = JSON.parse(readFileSync(options.beforeScene, "utf8"));
  const after = JSON.parse(readFileSync(options.afterScene, "utf8"));
  const result = verifyScopedRepair(before, after, options);
  console.log(JSON.stringify(result, null, 2));
  if (result.status !== "pass") process.exitCode = 1;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 2;
  });
}

