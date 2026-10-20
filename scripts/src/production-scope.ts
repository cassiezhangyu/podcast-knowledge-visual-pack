type R = Record<string, any>;

/** 用户指定的生产范围；缺省为整包（cover + overview + deep_dive），保持原有行为。 */
export function scopePages(editorial: R): string[] {
  const scope = editorial?.package?.production_scope as R | undefined;
  return scope ? (scope.pages as string[]) : ["cover", "overview", "deep_dive"];
}

/** 当前生产范围内的规划页面（按阅读顺序）。范围外页面只作为暂缓追踪，不计页数。 */
export function scopedEditorialPages(editorial: R): R[] {
  const pkg = editorial.package as R, scope = scopePages(editorial);
  return [
    ...(scope.includes("cover") ? [pkg.cover] : []),
    ...(scope.includes("overview") ? [pkg.overview, ...(pkg.overview_continuations ?? [])] : []),
    ...(scope.includes("deep_dive") ? (pkg.deep_dives ?? []) : []),
  ];
}

/** 交付文件名：按页面身份命名，不按序号假设第一页是封面。 */
export function deliveryPageName(editorial: R, pageId: string, index: number): string {
  const pkg = editorial.package as R;
  if (pkg.cover?.page_id === pageId) return "00-cover";
  if (pkg.overview?.page_id === pageId) return "01-overview";
  const cont = (pkg.overview_continuations ?? []).findIndex((p: R) => p.page_id === pageId);
  if (cont >= 0) return `01-overview-${String(cont + 2).padStart(2, "0")}`;
  return `${String(index + 2).padStart(2, "0")}-${String(pageId).replace(/^edp_dd_/, "")}`;
}
