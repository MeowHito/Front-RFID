// Per-category Overall display count.
//
// Every race distance can award a different number of Overall ranks (e.g. 42K
// top 3, 21K top 5). The campaign stores those overrides in
// `overallDisplayCountByCategory`; `overallDisplayCount` stays as the fallback
// for categories with no entry (the previous, campaign-wide behavior).

import { normalizeCategoryName } from './nationality';

export interface OverallCountByCategoryEntry {
    category: string;
    count: number;
}

export interface OverallDisplayCountConfig {
    overallDisplayCount?: number;
    overallDisplayCountByCategory?: OverallCountByCategoryEntry[];
}

export const DEFAULT_OVERALL_DISPLAY_COUNT = 5;
export const MIN_OVERALL_DISPLAY_COUNT = 1;
export const MAX_OVERALL_DISPLAY_COUNT = 1000;

/** Clamp any user/stored input into the allowed 1..1000 range. */
export function clampOverallDisplayCount(value: unknown): number {
    const num = Math.floor(Number(value));
    if (!Number.isFinite(num) || num <= 0) return DEFAULT_OVERALL_DISPLAY_COUNT;
    return Math.min(MAX_OVERALL_DISPLAY_COUNT, Math.max(MIN_OVERALL_DISPLAY_COUNT, num));
}

/** How many Overall ranks the given category awards. Falls back to the
 *  campaign-wide `overallDisplayCount`, then to 5. */
export function resolveOverallDisplayCount(
    config: OverallDisplayCountConfig | null | undefined,
    category?: string | null,
): number {
    const fallback = clampOverallDisplayCount(config?.overallDisplayCount);
    const list = config?.overallDisplayCountByCategory;
    if (!Array.isArray(list) || list.length === 0) return fallback;
    const target = normalizeCategoryName(category);
    if (!target) return fallback;
    const match = list.find(entry => normalizeCategoryName(entry?.category) === target);
    if (!match || match.count == null || !Number.isFinite(Number(match.count))) return fallback;
    return clampOverallDisplayCount(match.count);
}

/** Build the `{ category: count }` map used by the admin editor. */
export function overallCountMapFromConfig(
    config: OverallDisplayCountConfig | null | undefined,
    categories: string[],
): Record<string, number> {
    const map: Record<string, number> = {};
    for (const name of categories) {
        map[name] = resolveOverallDisplayCount(config, name);
    }
    return map;
}

/** Serialize the admin editor map back into the stored array form. */
export function overallCountMapToEntries(map: Record<string, number>): OverallCountByCategoryEntry[] {
    return Object.entries(map)
        .filter(([category]) => !!category)
        .map(([category, count]) => ({ category, count: clampOverallDisplayCount(count) }));
}
