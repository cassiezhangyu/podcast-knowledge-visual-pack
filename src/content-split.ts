import { createHash } from "node:crypto";
import { validateArtifact } from "./validate.js";
import type { EpisodeContentInventory } from "./content-inventory.js";

type LogicStep = { source_unit_ids: string[]; detail_ids: string[] };
type SplitModule = { id: string; source_unit_ids: string[]; required_detail_ids: string[]; logic_steps: LogicStep[] };
export type ContentSplit = { episode_content_inventory_sha256: string; module_order: string[]; modules: SplitModule[] };
export type ContentSplitCoverage = {
  episode_content_inventory_sha256: string;
  content_split_sha256: string;
  unit_dispositions: Array<{ source_id: string; module_ids: string[] }>;
  detail_dispositions: Array<{ source_id: string; module_ids: string[]; role: string }>;
};

const hash = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const duplicates = (values: string[]) => [...new Set(values.filter((value, index) => values.indexOf(value) !== index))];

export function assessContentSplit(inventory: EpisodeContentInventory, split: ContentSplit, coverage: ContentSplitCoverage) {
  validateArtifact("episode_content_inventory", inventory);
  validateArtifact("content_split", split);
  validateArtifact("content_split_coverage", coverage);

  const inventoryHash = hash(inventory), splitHash = hash(split);
  const moduleIds = split.modules.map((module) => module.id);
  const moduleIdSet = new Set(moduleIds);
  const unitIds = inventory.content_units.map((unit) => unit.id);
  const unitIdSet = new Set(unitIds);
  const detailIds = inventory.content_units.flatMap((unit) => unit.supporting_details.map((detail) => detail.id));
  const detailIdSet = new Set(detailIds);

  const invalidModuleOrder = duplicates(split.module_order).length > 0
    || split.module_order.length !== moduleIds.length
    || split.module_order.some((id, index) => id !== moduleIds[index]);
  const invalidModuleReferences: string[] = [];
  for (const module of split.modules) {
    for (const id of module.source_unit_ids) if (!unitIdSet.has(id)) invalidModuleReferences.push(`${module.id}:${id}`);
    for (const id of module.required_detail_ids) if (!detailIdSet.has(id)) invalidModuleReferences.push(`${module.id}:${id}`);
    const stepDetails = [...new Set(module.logic_steps.flatMap((item) => item.detail_ids))];
    const stepUnits = [...new Set(module.logic_steps.flatMap((item) => item.source_unit_ids))];
    if (stepDetails.length !== module.required_detail_ids.length || stepDetails.some((id) => !module.required_detail_ids.includes(id))) invalidModuleReferences.push(`${module.id}:detail_contract_mismatch`);
    if (stepUnits.some((id) => !module.source_unit_ids.includes(id))) invalidModuleReferences.push(`${module.id}:unit_contract_mismatch`);
  }

  const dispositionUnitIds = coverage.unit_dispositions.map((item) => item.source_id);
  const dispositionDetailIds = coverage.detail_dispositions.map((item) => item.source_id);
  const missingUnitDispositions = unitIds.filter((id) => !dispositionUnitIds.includes(id));
  const missingDetailDispositions = detailIds.filter((id) => !dispositionDetailIds.includes(id));
  const duplicateUnitDispositions = duplicates(dispositionUnitIds);
  const duplicateDetailDispositions = duplicates(dispositionDetailIds);
  const invalidDispositionReferences: string[] = [];
  for (const item of coverage.unit_dispositions) {
    if (!unitIdSet.has(item.source_id)) invalidDispositionReferences.push(item.source_id);
    for (const id of item.module_ids) if (!moduleIdSet.has(id)) invalidDispositionReferences.push(`${item.source_id}:${id}`);
  }
  for (const item of coverage.detail_dispositions) {
    if (!detailIdSet.has(item.source_id)) invalidDispositionReferences.push(item.source_id);
    if (!item.module_ids.length && item.role !== "program_frame" && item.role !== "program_synthesis" && item.role !== "excluded_with_reason") invalidDispositionReferences.push(`${item.source_id}:no_destination`);
    for (const id of item.module_ids) if (!moduleIdSet.has(id)) invalidDispositionReferences.push(`${item.source_id}:${id}`);
  }

  const identityValid = split.episode_content_inventory_sha256 === inventoryHash
    && coverage.episode_content_inventory_sha256 === inventoryHash
    && coverage.content_split_sha256 === splitHash;
  return {
    pass: identityValid && !invalidModuleOrder && !invalidModuleReferences.length && !missingUnitDispositions.length && !missingDetailDispositions.length && !duplicateUnitDispositions.length && !duplicateDetailDispositions.length && !invalidDispositionReferences.length,
    identityValid,
    invalidModuleOrder,
    invalidModuleReferences,
    missingUnitDispositions,
    missingDetailDispositions,
    duplicateUnitDispositions,
    duplicateDetailDispositions,
    invalidDispositionReferences,
  };
}
