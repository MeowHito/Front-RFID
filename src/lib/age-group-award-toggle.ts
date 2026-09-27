// Per-distance switches around age groups.
//
// Two independent settings feed this module:
//   • `campaign.categories[].ageGroupEnabled === false` (admin/categories) — the
//     distance has NO age groups at all. Runners in it show no age group, no
//     age-group rank and no age-group award anywhere (public table, runner page,
//     e-slips, certificates, bib-check screens, winner boards, ranking menu).
//   • `campaign.ageGroupDisabledCategories` (admin/age-group-ranking) — the
//     distance has age groups but gives no age-group AWARD. Ranks still show.

import { normalizeCategoryName } from './nationality';
import { findRunnerCategory, type RaceCategoryLike } from './category-distance';

export interface AgeGroupCategoryLike extends RaceCategoryLike {
    /** `false` = this distance has no age groups at all (admin/categories switch). */
    ageGroupEnabled?: boolean;
}

export interface AgeGroupAwardConfig {
    /** Distances whose age-group award is switched off. Matched by
     *  `normalizeCategoryName`, like the other per-category lists. */
    ageGroupDisabledCategories?: string[];
    /** The campaign's distances — consulted for the per-distance "no age groups"
     *  switch. Optional so callers that only know the award list still work. */
    categories?: AgeGroupCategoryLike[] | null;
}

/** True when `category` is one of the distances whose age-group award is off. */
export function isAgeGroupDisabledCategory(
    config: AgeGroupAwardConfig | null | undefined,
    category?: string | null,
): boolean {
    const list = config?.ageGroupDisabledCategories;
    if (!Array.isArray(list) || list.length === 0) return false;
    const target = normalizeCategoryName(category);
    if (!target) return false;
    return list.some(c => normalizeCategoryName(c) === target);
}

/** Whether the distance has age groups at all (admin/categories switch). `category`
 *  may be the campaign's category name or a runner's raw `category` string — both
 *  resolve through the same matching the /event tabs use. Unknown → has groups. */
export function categoryHasAgeGroups(
    config: AgeGroupAwardConfig | null | undefined,
    category?: string | null,
): boolean {
    const cats = config?.categories;
    if (!Array.isArray(cats) || cats.length === 0) return true;
    const matched = findRunnerCategory(category, cats) as AgeGroupCategoryLike | null;
    return matched?.ageGroupEnabled !== false;
}

/** Whether this distance gives an age-group award: it must have age groups and
 *  not be on the award-off list. Undefined / empty settings mean on. */
export function isAgeGroupAwardEnabled(
    config: AgeGroupAwardConfig | null | undefined,
    category?: string | null,
): boolean {
    return categoryHasAgeGroups(config, category) && !isAgeGroupDisabledCategory(config, category);
}

/** Fields that describe a runner's age group. Cleared for distances without one. */
export interface AgeGroupRunnerFields {
    category?: string;
    ageGroup?: string;
    ageGroupRank?: number;
    ageGroupNetRank?: number;
    categoryRank?: number;
    categoryNetRank?: number;
}

/** Return the runner with every age-group field blanked when the distance has no
 *  age groups; the same object otherwise (so React state stays referentially
 *  stable when nothing changes). */
export function stripHiddenAgeGroup<T extends AgeGroupRunnerFields>(
    runner: T,
    config: AgeGroupAwardConfig | null | undefined,
): T {
    if (!runner || categoryHasAgeGroups(config, runner.category)) return runner;
    if (runner.ageGroup == null && runner.ageGroupRank == null && runner.ageGroupNetRank == null
        && runner.categoryRank == null && runner.categoryNetRank == null) return runner;
    return { ...runner, ageGroup: undefined, ageGroupRank: undefined, ageGroupNetRank: undefined, categoryRank: undefined, categoryNetRank: undefined };
}

/** `stripHiddenAgeGroup` over a list. Returns the same array when nothing changed. */
export function stripHiddenAgeGroups<T extends AgeGroupRunnerFields>(
    runners: T[],
    config: AgeGroupAwardConfig | null | undefined,
): T[] {
    const cats = config?.categories;
    if (!Array.isArray(cats) || !cats.some(c => c && c.ageGroupEnabled === false)) return runners;
    let changed = false;
    const out = runners.map(r => { const s = stripHiddenAgeGroup(r, config); if (s !== r) changed = true; return s; });
    return changed ? out : runners;
}
