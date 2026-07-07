// Shared award computation used by the public event table (/event/[id]),
// the runner detail page (/runner/[id]) and the e-slip (/runner/[id]/eslip).
//
// It mirrors /admin/age-group-ranking and the public Overall-Winners /
// Result-Winners boards so every surface shows the same winners:
//   • Overall: top `overallDisplayCount` finishers per gender, ranked by time.
//   • Age group: top `ageGroupDisplayCount` per (gender, age group), after
//     excluding the top `excludeOverallFromAgeGroup` overall per gender.
// A runner can hold BOTH an Overall and an Age-group award at the same time:
//   • If `excludeOverallFromAgeGroup` = 0 (no exclusion) the overall winners are
//     also eligible for their age-group award → e.g. "Overall 1, Age Group 1".
//   • If it is > 0, the top N overall per gender are removed from age-group
//     contention → they keep only their Overall award.

import { isThaiNationality } from './nationality';
import { buildCanonicalAgeGroups, canonicalizeAgeGroup } from './age-groups';

export interface AwardConfig {
    overallDisplayCount?: number;
    ageGroupDisplayCount?: number;
    excludeOverallFromAgeGroup?: number;
    /** When true, the Overall placing is scoped to the runner's nationality group
     *  (Thai vs foreign) and Overall winners are excluded from age-group awards.
     *  The caller decides this per race category (campaign stores the category list). */
    separateOverallByNationality?: boolean;
    /** In nationality-split categories, how many top Thai / foreign overall winners
     *  (per gender) to exclude from age-group awards. Falls back to
     *  `overallDisplayCount` when unset, matching the previous coupled behavior. */
    excludeOverallThaiFromAgeGroup?: number;
    excludeOverallForeignFromAgeGroup?: number;
}

export interface AwardRunnerLike {
    _id: string;
    bib: string;
    gender: string;
    ageGroup?: string;
    status: string;
    netTime?: number;
    gunTime?: number;
    elapsedTime?: number;
    ageGroupRank?: number;
    nationality?: string;
}

// A runner may earn an overall placing, an age-group placing, or both.
// `overallNat` is set only in nationality-split categories: which bucket the
// Overall placing belongs to (renders as "OVERALL THA n" / "OVERALL INT n").
export type AwardResult = { overall?: number; overallNat?: 'thai' | 'foreign'; ageGroup?: number; ageGroupLabel?: string };

/** Strip gender prefix ("M30-39") and Thai "ปี" suffix so labels group consistently. */
export function normalizeAgeGroupLabel(value?: string | null): string {
    return String(value || '').replace(/^[MF]\s*/i, '').replace(/\s*ปี$/i, '').trim();
}

// Ranking convention: Overall placing is decided by GUN time, while Age-group
// placing is decided by NET (chip) time. Each falls back to the other when its own
// time is missing (locally-timed events store only net time).
const gunTimeOf = (r: AwardRunnerLike) => r.gunTime || r.netTime || r.elapsedTime || Infinity;
const netTimeOf = (r: AwardRunnerLike) => r.netTime || r.gunTime || r.elapsedTime || Infinity;

/**
 * Gun-time overall placing across the whole category pool (all finishers combined,
 * both genders). When `separateByNationality` is set, the placing is scoped to the
 * runner's Thai / foreign bucket — matching the /event RANK column and the
 * "OVERALL THA n" / "OVERALL INT n" award. Returns a map of runnerId → rank.
 */
export function computeOverallRanks(
    runners: AwardRunnerLike[],
    opts?: { separateByNationality?: boolean },
): Map<string, number> {
    const finished = runners.filter(r => r.status === 'finished' && (r.netTime || r.gunTime || r.elapsedTime));
    const byGun = [...finished].sort((a, b) => gunTimeOf(a) - gunTimeOf(b));
    const result = new Map<string, number>();
    if (opts?.separateByNationality) {
        const counters: Record<'thai' | 'foreign', number> = { thai: 0, foreign: 0 };
        for (const r of byGun) {
            const key = isThaiNationality(r.nationality) ? 'thai' : 'foreign';
            counters[key] += 1;
            result.set(r._id, counters[key]);
        }
    } else {
        byGun.forEach((r, i) => result.set(r._id, i + 1));
    }
    return result;
}

/**
 * Compute awards for a single race category pool (all runners already share the
 * same distance/category). Returns a map of runnerId → award.
 */
export function computeAwardsForCategory(
    runners: AwardRunnerLike[],
    cfg: AwardConfig,
): Map<string, AwardResult> {
    const map = new Map<string, AwardResult>();
    const overallDisplayCount = Math.max(1, Number(cfg.overallDisplayCount) || 5);
    const ageGroupDisplayCount = Math.max(1, Number(cfg.ageGroupDisplayCount) || 5);
    const excludeOv = Math.max(0, Number(cfg.excludeOverallFromAgeGroup) || 0);
    const separateNat = !!cfg.separateOverallByNationality;
    const excludeNatCount: Record<'thai' | 'foreign', number> = {
        thai: cfg.excludeOverallThaiFromAgeGroup != null ? Math.max(0, Number(cfg.excludeOverallThaiFromAgeGroup)) : overallDisplayCount,
        foreign: cfg.excludeOverallForeignFromAgeGroup != null ? Math.max(0, Number(cfg.excludeOverallForeignFromAgeGroup)) : overallDisplayCount,
    };

    const finished = runners.filter(r => r.status === 'finished' && (r.netTime || r.gunTime || r.elapsedTime));
    // RaceTiger occasionally tags a handful of runners with a differently-shaped
    // age-group label than the rest of the field for the same real bracket (e.g.
    // "0-19" for 2 runners vs "U 19" for 44 others) — fold those into the
    // majority bucket so they don't fragment award slots into one-off buckets.
    const { canonicalLabelOf } = buildCanonicalAgeGroups(finished.map(r => r.ageGroup));
    const ensure = (id: string): AwardResult => {
        let a = map.get(id);
        if (!a) { a = {}; map.set(id, a); }
        return a;
    };

    for (const female of [false, true]) {
        const group = finished.filter(r => (r.gender === 'F') === female);
        // Overall winners are ranked by GUN time; age-group winners by NET time.
        const byGun = [...group].sort((a, b) => gunTimeOf(a) - gunTimeOf(b));

        // Overall winners (per gender). When nationality-split is on, the overall
        // placing is scoped further to the Thai / foreign bucket, so each bucket has
        // its own "OVERALL THA 1..N" / "OVERALL INT 1..N".
        const excludedBibs = new Set<string>();
        if (separateNat) {
            const natCount: Record<'thai' | 'foreign', number> = { thai: 0, foreign: 0 };
            for (const r of byGun) {
                const key = isThaiNationality(r.nationality) ? 'thai' : 'foreign';
                natCount[key] += 1;
                if (natCount[key] <= overallDisplayCount) {
                    const a = ensure(r._id);
                    a.overall = natCount[key];
                    a.overallNat = key;
                }
                // Exclusion count is independently configurable per Thai/foreign bucket
                // (e.g. exclude top 5 Thai but only top 3 foreign from age-group awards).
                if (natCount[key] <= excludeNatCount[key]) excludedBibs.add(r.bib);
            }
        } else {
            byGun.slice(0, overallDisplayCount).forEach((r, i) => {
                ensure(r._id).overall = i + 1;
            });
        }

        // Age-group winners (per gender) — overall winners stay eligible unless the
        // admin chose to exclude the top `excludeOv` overall from age-group prizes
        // (or the category is nationality-split, which always excludes them).
        if (excludeOv > 0) byGun.slice(0, excludeOv).forEach(r => excludedBibs.add(r.bib));

        // Sort by actual NET finish time first — RaceTiger's ageGroupRank can be stale
        // or wrong for individual runners (e.g. after a time correction), so it's
        // only used to break ties, never as the primary order.
        const byAgeRank = [...group].sort((a, b) => {
            const at = netTimeOf(a);
            const bt = netTimeOf(b);
            if (at !== bt) return at - bt;
            const ar = (a.ageGroupRank && a.ageGroupRank > 0) ? a.ageGroupRank : Infinity;
            const br = (b.ageGroupRank && b.ageGroupRank > 0) ? b.ageGroupRank : Infinity;
            return ar - br;
        });

        const bucketCount = new Map<string, number>();
        for (const r of byAgeRank) {
            if (excludedBibs.has(r.bib)) continue;
            // Nationality-split categories: foreigners are not eligible for age-group
            // awards at all (organizer rule) — they only place in the OVERALL INT ranking.
            if (separateNat && !isThaiNationality(r.nationality)) continue;
            const ag = canonicalizeAgeGroup(r.ageGroup, canonicalLabelOf);
            if (!ag) continue;
            const taken = bucketCount.get(ag) || 0;
            if (taken >= ageGroupDisplayCount) continue;
            bucketCount.set(ag, taken + 1);
            const a = ensure(r._id);
            a.ageGroup = taken + 1;
            a.ageGroupLabel = ag;
        }
    }
    return map;
}

/** Label for the Overall part of an award: "Overall 1", or in nationality-split
 *  categories "OVERALL THA 1" / "OVERALL INT 1". */
export function formatOverallAwardLabel(a: AwardResult): string {
    if (!a.overall) return '';
    if (a.overallNat) return `OVERALL ${a.overallNat === 'thai' ? 'THA' : 'INT'} ${a.overall}`;
    return `Overall ${a.overall}`;
}

/** Human label shown in the AWARD column / e-slip, e.g. "Overall 1, Age Group 2". */
export function formatAwardLabel(a: AwardResult | undefined | null): string {
    if (!a) return '';
    const parts: string[] = [];
    if (a.overall) parts.push(formatOverallAwardLabel(a));
    if (a.ageGroup) parts.push(`Age Group ${a.ageGroup}`);
    return parts.join(', ');
}
