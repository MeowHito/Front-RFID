// Shared award computation used by the public event table (/event/[id]),
// the runner detail page (/runner/[id]) and the e-slip (/runner/[id]/eslip).
//
// It mirrors /admin/age-group-ranking and the public Overall-Winners /
// Result-Winners boards so every surface shows the same winners:
//   • Overall: top `overallDisplayCount` finishers per gender, ranked by time.
//   • Age group: top `ageGroupDisplayCount` per (gender, age group), after
//     excluding the top `excludeOverallFromAgeGroup` overall per gender and any
//     runner whose RaceTiger ageGroupRank <= `excludeAgeGroupTop`.
// A runner who earns an Overall award never also receives an Age-group award.

export interface AwardConfig {
    overallDisplayCount?: number;
    ageGroupDisplayCount?: number;
    excludeOverallFromAgeGroup?: number;
    excludeAgeGroupTop?: number;
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
}

export type AwardResult = { type: 'overall' | 'ageGroup'; position: number; ageGroup?: string };

/** Strip gender prefix ("M30-39") and Thai "ปี" suffix so labels group consistently. */
export function normalizeAgeGroupLabel(value?: string | null): string {
    return String(value || '').replace(/^[MF]\s*/i, '').replace(/\s*ปี$/i, '').trim();
}

const timeOf = (r: AwardRunnerLike) => r.netTime || r.gunTime || r.elapsedTime || Infinity;

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
    const excludeAG = Math.max(0, Number(cfg.excludeAgeGroupTop) || 0);

    const finished = runners.filter(r => r.status === 'finished' && (r.netTime || r.gunTime || r.elapsedTime));

    for (const female of [false, true]) {
        const group = finished.filter(r => (r.gender === 'F') === female);
        const byTime = [...group].sort((a, b) => timeOf(a) - timeOf(b));

        // Overall winners (per gender)
        byTime.slice(0, overallDisplayCount).forEach((r, i) => {
            map.set(r._id, { type: 'overall', position: i + 1 });
        });

        // Age-group winners (per gender)
        const excludedBibs = new Set<string>();
        if (excludeOv > 0) byTime.slice(0, excludeOv).forEach(r => excludedBibs.add(r.bib));

        const byAgeRank = [...group].sort((a, b) => {
            const ar = (a.ageGroupRank && a.ageGroupRank > 0) ? a.ageGroupRank : Infinity;
            const br = (b.ageGroupRank && b.ageGroupRank > 0) ? b.ageGroupRank : Infinity;
            if (ar !== br) return ar - br;
            return timeOf(a) - timeOf(b);
        });

        const bucketCount = new Map<string, number>();
        for (const r of byAgeRank) {
            if (map.has(r._id)) continue; // already an Overall winner — never gets age group
            if (excludedBibs.has(r.bib)) continue;
            if (excludeAG > 0 && r.ageGroupRank && r.ageGroupRank > 0 && r.ageGroupRank <= excludeAG) continue;
            const ag = normalizeAgeGroupLabel(r.ageGroup);
            if (!ag) continue;
            const taken = bucketCount.get(ag) || 0;
            if (taken >= ageGroupDisplayCount) continue;
            bucketCount.set(ag, taken + 1);
            map.set(r._id, { type: 'ageGroup', position: taken + 1, ageGroup: ag });
        }
    }
    return map;
}

/** Human label shown in the AWARD column / e-slip, e.g. "Overall 1" or "Age Group 2". */
export function formatAwardLabel(a: AwardResult | undefined | null): string {
    if (!a) return '';
    return `${a.type === 'overall' ? 'Overall' : 'Age Group'} ${a.position}`;
}
