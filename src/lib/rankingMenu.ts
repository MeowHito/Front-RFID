// Visibility helpers for the results-page ranking menu (General / Best of /
// Nationality / Age Group), configured per race category. A category missing
// from the campaign's `rankingMenuVisibility` array defaults every item to
// visible — admins opt a distance OUT, not in.

import { normalizeCategoryName } from './nationality';

export interface RankingMenuVisibility {
    category: string;
    topOverall?: boolean;
    general?: boolean;
    bestOf?: boolean;
    nationality?: boolean;
    ageGroup?: boolean;
}

export type RankingMenuItemKey = 'topOverall' | 'general' | 'bestOf' | 'nationality' | 'ageGroup';

export interface RankingMenuFlags {
    topOverall: boolean;
    general: boolean;
    bestOf: boolean;
    nationality: boolean;
    ageGroup: boolean;
}

const ALL_VISIBLE: RankingMenuFlags = { topOverall: true, general: true, bestOf: true, nationality: true, ageGroup: true };

/** Resolved visibility flags for one category — missing entry/fields default to true. */
export function getRankingMenuVisibility(
    list: RankingMenuVisibility[] | undefined | null,
    category?: string | null,
): RankingMenuFlags {
    const target = normalizeCategoryName(category);
    if (!target || !Array.isArray(list)) return { ...ALL_VISIBLE };
    const entry = list.find(e => normalizeCategoryName(e.category) === target);
    if (!entry) return { ...ALL_VISIBLE };
    return {
        topOverall: entry.topOverall !== false,
        general: entry.general !== false,
        bestOf: entry.bestOf !== false,
        nationality: entry.nationality !== false,
        ageGroup: entry.ageGroup !== false,
    };
}

/** Returns a new array with `category`'s entry replaced/merged with `patch`. */
export function withRankingMenuVisibility(
    list: RankingMenuVisibility[] | undefined | null,
    category: string,
    patch: Partial<RankingMenuFlags>,
): RankingMenuVisibility[] {
    const target = normalizeCategoryName(category);
    const next = Array.isArray(list) ? [...list] : [];
    const idx = next.findIndex(e => normalizeCategoryName(e.category) === target);
    const current = idx >= 0 ? next[idx] : { category };
    const merged: RankingMenuVisibility = { ...current, category, ...patch };
    if (idx >= 0) next[idx] = merged; else next.push(merged);
    return next;
}
