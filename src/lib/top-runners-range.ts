// Top Runners rank range.
//
// The Top Runners board (/Top-Overall-Winners/<campaign>) shows a contiguous
// slice of the overall standings — "ranks 1-20", "ranks 1-50" — per gender.
// Unlike the age-group boards it never skips the Overall winners: rank 1 is
// included whenever `start` is 1, which is the default.
//
// Each race distance carries its own range in
// `topRunnersRangeByCategory`; distances with no entry fall back to
// 1..`overallDisplayCount` (the behavior before ranges existed), so nothing
// changes for a campaign that never configures this.

import { normalizeCategoryName } from './nationality';
import {
    resolveOverallDisplayCount,
    type OverallDisplayCountConfig,
} from './overall-display-count';

export interface TopRunnersRangeEntry {
    category: string;
    start: number;
    end: number;
}

export interface TopRunnersRange {
    start: number;
    end: number;
}

export interface TopRunnersRangeConfig extends OverallDisplayCountConfig {
    topRunnersRangeByCategory?: TopRunnersRangeEntry[];
    /** Distances whose Top Runners board skips the Overall winners (organizers who
     *  don't want the same runner awarded twice). The skipped slots are backfilled,
     *  so the board keeps the row count the range asks for. */
    topRunnersExcludeOverallCategories?: string[];
}

export const MIN_TOP_RUNNERS_RANK = 1;
export const MAX_TOP_RUNNERS_RANK = 1000;

function clampRank(value: unknown, fallback: number): number {
    const num = Math.floor(Number(value));
    if (!Number.isFinite(num) || num <= 0) return fallback;
    return Math.min(MAX_TOP_RUNNERS_RANK, Math.max(MIN_TOP_RUNNERS_RANK, num));
}

/** Normalize a user-entered range: both ends inside 1..1000, `end` never below `start`. */
export function clampTopRunnersRange(start: unknown, end: unknown): TopRunnersRange {
    const s = clampRank(start, MIN_TOP_RUNNERS_RANK);
    const e = clampRank(end, s);
    return { start: s, end: Math.max(s, e) };
}

/** How many rows the range spans (inclusive of both ends). */
export function topRunnersRangeSize(range: TopRunnersRange): number {
    return range.end - range.start + 1;
}

/** The rank range the given distance displays. Falls back to 1..overallDisplayCount. */
export function resolveTopRunnersRange(
    config: TopRunnersRangeConfig | null | undefined,
    category?: string | null,
): TopRunnersRange {
    const fallback: TopRunnersRange = {
        start: MIN_TOP_RUNNERS_RANK,
        end: resolveOverallDisplayCount(config, category),
    };
    const list = config?.topRunnersRangeByCategory;
    if (!Array.isArray(list) || list.length === 0) return fallback;
    const target = normalizeCategoryName(category);
    if (!target) return fallback;
    const match = list.find(entry => normalizeCategoryName(entry?.category) === target);
    if (!match) return fallback;
    return clampTopRunnersRange(match.start, match.end);
}

/** Build the `{ category: range }` map used by the admin editor. */
export function topRunnersRangeMapFromConfig(
    config: TopRunnersRangeConfig | null | undefined,
    categories: string[],
): Record<string, TopRunnersRange> {
    const map: Record<string, TopRunnersRange> = {};
    for (const name of categories) {
        map[name] = resolveTopRunnersRange(config, name);
    }
    return map;
}

/** Serialize the admin editor map back into the stored array form. */
export function topRunnersRangeMapToEntries(
    map: Record<string, TopRunnersRange>,
): TopRunnersRangeEntry[] {
    return Object.entries(map)
        .filter(([category]) => !!category)
        .map(([category, range]) => ({ category, ...clampTopRunnersRange(range?.start, range?.end) }));
}

/** Whether the given distance drops the Overall winners from its Top Runners board. */
export function isTopRunnersExcludeOverall(
    config: TopRunnersRangeConfig | null | undefined,
    category?: string | null,
): boolean {
    const list = config?.topRunnersExcludeOverallCategories;
    if (!Array.isArray(list) || list.length === 0) return false;
    const target = normalizeCategoryName(category);
    if (!target) return false;
    return list.some(name => normalizeCategoryName(name) === target);
}

/** How many leading finishers the board skips: the distance's Overall winners when
 *  the exclusion is on, otherwise none. */
export function resolveTopRunnersCut(
    config: TopRunnersRangeConfig | null | undefined,
    category?: string | null,
): number {
    return isTopRunnersExcludeOverall(config, category)
        ? resolveOverallDisplayCount(config, category)
        : 0;
}

/** Take the configured slice out of an already-sorted standings list.
 *
 *  `cut` drops that many leading finishers (the Overall winners) before the range
 *  is applied, and the range then walks the *remaining* field — so "ranks 1-5" with
 *  a cut of 3 still yields 5 rows, holding the real ranks 4, 5, 6, 7, 8. Ranks
 *  returned are always the runner's true position in `sorted`, never renumbered. */
export function sliceTopRunners<T>(
    sorted: T[],
    range: TopRunnersRange,
    cut = 0,
): { runner: T; rank: number }[] {
    const offset = Math.max(0, cut);
    return sorted
        .slice(offset + range.start - 1, offset + range.end)
        .map((runner, i) => ({ runner, rank: offset + range.start + i }));
}
