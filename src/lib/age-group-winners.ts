// Shared age-group winners computation for the public winners boards
// (Result-Winners) — pulled out of the page component so it can be reused
// both for the currently-selected distance (on-screen) and for every
// distance at once when the organizer downloads a combined "all distances"
// Excel file.

import { isThaiNationality, isNationalitySplitCategory } from './nationality';
import { buildCanonicalAgeGroups, canonicalizeAgeGroup, type AgeGroupBucket } from './age-groups';

export interface AgeGroupWinnerRunner {
    _id: string;
    bib: string;
    gender: string;
    ageGroup?: string;
    status: string;
    nationality?: string;
    netTime?: number;
    gunTime?: number;
    elapsedTime?: number;
    ageGroupRank?: number;
}

export interface AgeGroupWinnerConfig {
    ageGroupDisplayCount?: number;
    overallDisplayCount?: number;
    excludeOverallFromAgeGroup?: number;
    excludeOverallThaiFromAgeGroup?: number;
    excludeOverallForeignFromAgeGroup?: number;
    excludeAgeGroupTop?: number;
    separateOverallNationalityCategories?: string[];
}

const DEFAULT_AGE_GROUPS: AgeGroupBucket[] = [
    { label: '1-18', min: 0, max: 18 },
    { label: '19-29', min: 19, max: 29 },
    { label: '30-39', min: 30, max: 39 },
    { label: '40-49', min: 40, max: 49 },
    { label: '50-59', min: 50, max: 59 },
    { label: '60+', min: 60, max: 999 },
];

export function computeAgeGroupWinners<T extends AgeGroupWinnerRunner>(
    runners: T[],
    cfg: AgeGroupWinnerConfig,
    selectedCategory: string,
): { activeAgeGroups: AgeGroupBucket[]; maleWinners: Record<string, T[]>; femaleWinners: Record<string, T[]> } {
    const topN = Math.max(1, Number(cfg.ageGroupDisplayCount) || 5);
    const finished = runners.filter(r => r.status === 'finished' && (r.netTime || r.gunTime || r.elapsedTime));

    const { buckets, canonicalLabelOf } = buildCanonicalAgeGroups(finished.map(r => r.ageGroup));
    const activeAgeGroups = buckets.length > 0 ? buckets : DEFAULT_AGE_GROUPS;

    const excludeOv = Math.max(0, Number(cfg.excludeOverallFromAgeGroup) || 0);
    const excludeAG = Math.max(0, Number(cfg.excludeAgeGroupTop) || 0);
    const excludedBibs = new Set<string>();
    const byTime = (a: T, b: T) =>
        (a.netTime || a.gunTime || a.elapsedTime || Infinity) - (b.netTime || b.gunTime || b.elapsedTime || Infinity);
    if (excludeOv > 0) {
        finished.filter(r => r.gender !== 'F').sort(byTime).slice(0, excludeOv).forEach(r => excludedBibs.add(r.bib));
        finished.filter(r => r.gender === 'F').sort(byTime).slice(0, excludeOv).forEach(r => excludedBibs.add(r.bib));
    }

    const natSplit = isNationalitySplitCategory(cfg.separateOverallNationalityCategories, selectedCategory);
    if (natSplit) {
        const overallTopN = Math.max(1, Number(cfg.overallDisplayCount) || 5);
        const excludeNatCount: Record<'thai' | 'foreign', number> = {
            thai: cfg.excludeOverallThaiFromAgeGroup != null ? Math.max(0, Number(cfg.excludeOverallThaiFromAgeGroup)) : overallTopN,
            foreign: cfg.excludeOverallForeignFromAgeGroup != null ? Math.max(0, Number(cfg.excludeOverallForeignFromAgeGroup)) : overallTopN,
        };
        for (const female of [false, true]) {
            for (const thai of [true, false]) {
                finished
                    .filter(r => (r.gender === 'F') === female && isThaiNationality(r.nationality) === thai)
                    .sort(byTime)
                    .slice(0, excludeNatCount[thai ? 'thai' : 'foreign'])
                    .forEach(r => excludedBibs.add(r.bib));
            }
        }
    }

    // Sort by actual finish time first — RaceTiger's ageGroupRank can be stale
    // or wrong for individual runners (e.g. after a time correction), so it's
    // only used to break ties, never as the primary order.
    const sorted = [...finished].sort((a, b) => {
        const at = a.netTime || a.gunTime || a.elapsedTime || Infinity;
        const bt = b.netTime || b.gunTime || b.elapsedTime || Infinity;
        if (at !== bt) return at - bt;
        const ar = (a.ageGroupRank && a.ageGroupRank > 0) ? a.ageGroupRank : Infinity;
        const br = (b.ageGroupRank && b.ageGroupRank > 0) ? b.ageGroupRank : Infinity;
        return ar - br;
    });

    const maleWinners: Record<string, T[]> = {};
    const femaleWinners: Record<string, T[]> = {};
    for (const g of activeAgeGroups) { maleWinners[g.label] = []; femaleWinners[g.label] = []; }

    for (const runner of sorted) {
        if (excludedBibs.has(runner.bib)) continue;
        // Nationality-split categories: foreigners are not eligible for age-group
        // awards at all (organizer rule) — they only compete in the OVERALL INT ranking.
        if (natSplit && !isThaiNationality(runner.nationality)) continue;
        if (excludeAG > 0 && runner.ageGroupRank && runner.ageGroupRank > 0 && runner.ageGroupRank <= excludeAG) continue;
        const ag = canonicalizeAgeGroup(runner.ageGroup, canonicalLabelOf);
        if (!ag) continue;
        const bucket = runner.gender === 'F' ? femaleWinners : maleWinners;
        if (ag in bucket && bucket[ag].length < topN) bucket[ag].push(runner);
    }
    return { activeAgeGroups, maleWinners, femaleWinners };
}
