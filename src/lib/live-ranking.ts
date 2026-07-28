/**
 * Live ranking — the single source of truth for RANK / GEN / AGE placings.
 *
 * Ranking convention (see MEMORY: project_ranking_gun_vs_net):
 *   • RANK (Overall, combined — no gender/nationality split) → GUN time
 *   • GEN  (gender)                                          → GUN time
 *   • AGE  (age group, scoped to gender + ageGroup)          → NET (chip) time
 *
 * The public results page (/event/[id]) and the admin export page both run these
 * functions so their numbers can never disagree. The stored RaceTiger ranks
 * (overallRank / genderRank / ageGroupRank) are NOT used as the primary key —
 * RaceTiger sends a net-based rank while the table displays gun time, which put
 * slower runners above faster ones.
 */

export interface RankableRunner {
    _id: string;
    bib?: string;
    eventId?: string;
    gender?: string;
    ageGroup?: string;
    category?: string;
    status: string;
    passedCount?: number;
    scanTime?: string;
    latestCheckpoint?: string;
    overallRank?: number;
    netTime?: number;
    gunTime?: number;
    elapsedTime?: number;
    netTimeStr?: string;
    gunTimeStr?: string;
    netTimeMs?: number;
    gunTimeMs?: number;
    totalNetTime?: number;
    totalGunTime?: number;
    totalNetTimeMs?: number;
    totalGunTimeMs?: number;
}

export interface LiveRank {
    overallRank: number;
    genRank: number;
    catRank: number;
}

const STATUS_ORDER: Record<string, number> = {
    finished: 0,
    in_progress: 1,
    dnf: 2,
    dns: 3,
    dq: 4,
    not_started: 5,
};

function firstPositive(candidates: Array<number | undefined>): number {
    for (const value of candidates) {
        const num = Number(value || 0);
        if (Number.isFinite(num) && num > 0) return num;
    }
    return 0;
}

/** Overall placing is decided by GUN time — prefer gun fields, fall back to net
 *  (locally-timed events store only net time). */
export function getRunnerPrimaryTimeMs(runner: RankableRunner): number {
    return firstPositive([
        runner.gunTimeMs,
        runner.totalGunTimeMs,
        runner.totalGunTime,
        runner.gunTime,
        runner.netTimeMs,
        runner.totalNetTimeMs,
        runner.totalNetTime,
        runner.netTime,
        runner.elapsedTime,
    ]);
}

/** Age-group placings are decided by NET (chip) time — prefer net fields, fall back to gun. */
export function getRunnerNetTimeMs(runner: RankableRunner): number {
    return firstPositive([
        runner.netTimeMs,
        runner.totalNetTimeMs,
        runner.totalNetTime,
        runner.netTime,
        runner.gunTimeMs,
        runner.totalGunTimeMs,
        runner.totalGunTime,
        runner.gunTime,
        runner.elapsedTime,
    ]);
}

export function getRunnerScanTimeMs(runner: RankableRunner): number {
    const time = runner.scanTime ? new Date(runner.scanTime).getTime() : 0;
    return Number.isFinite(time) && time > 0 ? time : 0;
}

export function compareStableBibOrder(a: RankableRunner, b: RankableRunner): number {
    const bibCompare = (a.bib || '').localeCompare(b.bib || '', undefined, { numeric: true });
    if (bibCompare !== 0) return bibCompare;
    return (a._id || '').localeCompare(b._id || '');
}

/**
 * Overall (GUN-time) running order.
 *
 * `useStoredRank` must be false whenever any category splits Overall by
 * nationality — the stored overallRank is then per-nationality and no longer a
 * valid global sort key, so the combined table stays ordered by time and the
 * rank number comes from computeLiveRanks().
 */
export function makeCompareRunnerRankOrder(useStoredRank: boolean) {
    return function compareRunnerRankOrder(a: RankableRunner, b: RankableRunner): number {
        const statusDiff = (STATUS_ORDER[a.status] ?? 6) - (STATUS_ORDER[b.status] ?? 6);
        if (statusDiff !== 0) return statusDiff;

        if (a.status === 'finished' && b.status === 'finished') {
            // Rank all finished runners by GUN time → scan time, and only fall back to
            // the stored overallRank when neither runner has a usable time.
            // CP-completeness does not affect ordering: if a reader missed a scan,
            // an admin edit will recompute the time back to its rightful position.
            const aTime = getRunnerPrimaryTimeMs(a);
            const bTime = getRunnerPrimaryTimeMs(b);
            if (aTime > 0 && bTime > 0 && aTime !== bTime) return aTime - bTime;
            if (aTime > 0 && bTime <= 0) return -1;
            if (aTime <= 0 && bTime > 0) return 1;
            if (aTime <= 0 && bTime <= 0) {
                const aStored = a.overallRank ?? 0;
                const bStored = b.overallRank ?? 0;
                if (useStoredRank && aStored > 0 && bStored > 0 && aStored !== bStored) return aStored - bStored;
            }
            const aScan = getRunnerScanTimeMs(a);
            const bScan = getRunnerScanTimeMs(b);
            if (aScan > 0 && bScan > 0 && aScan !== bScan) return aScan - bScan;
            return compareStableBibOrder(a, b);
        }

        const aRank = a.overallRank ?? 0;
        const bRank = b.overallRank ?? 0;
        const bothInProgress = a.status === 'in_progress' && b.status === 'in_progress';
        if (!bothInProgress && useStoredRank && aRank > 0 && bRank > 0 && aRank !== bRank) return aRank - bRank;

        if (a.status === 'in_progress' && b.status === 'in_progress') {
            const aPassed = a.passedCount ?? 0;
            const bPassed = b.passedCount ?? 0;
            if (aPassed !== bPassed) return bPassed - aPassed;
            const aTime = getRunnerPrimaryTimeMs(a);
            const bTime = getRunnerPrimaryTimeMs(b);
            if (aTime > 0 && bTime > 0 && aTime !== bTime) return aTime - bTime;
            if (aTime > 0 && bTime <= 0) return -1;
            if (aTime <= 0 && bTime > 0) return 1;
            const aScan = getRunnerScanTimeMs(a);
            const bScan = getRunnerScanTimeMs(b);
            if (aScan > 0 && bScan > 0 && aScan !== bScan) return aScan - bScan;
            return compareStableBibOrder(a, b);
        }

        return compareStableBibOrder(a, b);
    };
}

/**
 * Age-group (AGE) running order — NET time, but course progress decides first: a
 * runner who has passed more checkpoints is ahead of one who has passed fewer,
 * however small the latter's split time is (a runner 20s past START is not
 * leading the race). Used by BOTH the AGE rank counter and the mobile row order
 * under an age-group filter, so the numbers and the rows can never disagree.
 */
export function compareRunnerNetRankOrder(a: RankableRunner, b: RankableRunner): number {
    const statusDiff = (STATUS_ORDER[a.status] ?? 6) - (STATUS_ORDER[b.status] ?? 6);
    if (statusDiff !== 0) return statusDiff;

    if (a.status === 'in_progress' && b.status === 'in_progress') {
        const aPassed = a.passedCount ?? 0;
        const bPassed = b.passedCount ?? 0;
        if (aPassed !== bPassed) return bPassed - aPassed;
    }

    const aTime = getRunnerNetTimeMs(a);
    const bTime = getRunnerNetTimeMs(b);
    if (aTime > 0 && bTime > 0 && aTime !== bTime) return aTime - bTime;
    if (aTime > 0 && bTime <= 0) return -1;
    if (aTime <= 0 && bTime > 0) return 1;
    const aScan = getRunnerScanTimeMs(a);
    const bScan = getRunnerScanTimeMs(b);
    if (aScan > 0 && bScan > 0 && aScan !== bScan) return aScan - bScan;
    return compareStableBibOrder(a, b);
}

/** Derive effective status from actual RaceTiger timing data. */
export function deriveEffectiveStatus<T extends RankableRunner>(runner: T): T {
    // Preserve explicit statuses from backend (finished/dq/dnf/dns) — the backend
    // already handles DNF from the RaceTiger API / raceFinished auto-detection.
    if (['finished', 'dq', 'dnf', 'dns'].includes(runner.status)) return runner;

    const hasGunTime = (runner.gunTime && runner.gunTime > 0) || !!runner.gunTimeStr;
    const hasNetTime = (runner.netTime && runner.netTime > 0) || !!runner.netTimeStr;
    const hasCheckpoint = !!runner.latestCheckpoint && runner.latestCheckpoint.toLowerCase() !== 'start';
    const hasPassedCount = (runner.passedCount ?? 0) > 0;
    const hasElapsed = (runner.elapsedTime && runner.elapsedTime > 0);

    if (hasGunTime || hasNetTime || hasCheckpoint || hasPassedCount || hasElapsed) {
        // Evidence of starting → in_progress. Do NOT promote to "finished" based on
        // overallRank — backend live ranking assigns overallRank to in_progress too.
        return { ...runner, status: 'in_progress' };
    }

    // No timing data at all → keep original (not_started = DNS)
    return runner;
}

/** Runners eligible for a placing: DNS/DQ/not_started never rank, and DNF only
 *  ranks once it has checkpoint progress. */
export function isRankableRunner(runner: RankableRunner): boolean {
    if (runner.status === 'not_started' || runner.status === 'dns' || runner.status === 'dq') return false;
    if (runner.status === 'dnf' && !((runner.passedCount ?? 0) > 0)) return false;
    return true;
}

/**
 * Compute live overall + gender + age-group ranks, keyed by runner `_id`.
 *
 * @param rankOrdered runners already sorted by makeCompareRunnerRankOrder (gun order)
 * @param ageGroupOf  canonical age-group label for a runner (labels vary per distance)
 */
export function computeLiveRanks<T extends RankableRunner>(
    rankOrdered: T[],
    ageGroupOf: (runner: T) => string,
): Map<string, LiveRank> {
    const eligible = rankOrdered.filter(isRankableRunner);
    const ranks = new Map<string, LiveRank>();
    for (const runner of eligible) {
        ranks.set(runner._id, { overallRank: 0, genRank: 0, catRank: 0 });
    }

    // Overall (combined) + Gender — by GUN time. `eligible` is already gun-ordered,
    // so a single pass assigns both.
    const eventCounters: Record<string, number> = {};
    const genderCounters: Record<string, number> = {};
    for (const runner of eligible) {
        const eventKey = runner.eventId || '_';
        const genderKey = `${eventKey}::${runner.gender || '_'}`;
        eventCounters[eventKey] = (eventCounters[eventKey] || 0) + 1;
        genderCounters[genderKey] = (genderCounters[genderKey] || 0) + 1;
        const entry = ranks.get(runner._id)!;
        entry.overallRank = eventCounters[eventKey];
        entry.genRank = genderCounters[genderKey];
    }

    // Age-group (AGE) — by NET time, progress-ordered first (see compareRunnerNetRankOrder).
    // Only count runners that will actually display an age-group rank: DNF/DNS/DQ/
    // not_started render '-' for AGE, yet a DNF-with-progress runner can carry a bogus
    // small net time (a partial leg time) that sorts to the front of its bucket and
    // pushes every finisher +1.
    const hidesCatRank = (status: string) => ['dnf', 'dns', 'dq', 'not_started'].includes(status);
    const byNet = [...eligible].sort(compareRunnerNetRankOrder);
    const categoryCounters: Record<string, number> = {};
    for (const runner of byNet) {
        if (hidesCatRank(runner.status)) continue;
        const eventKey = runner.eventId || '_';
        const catKey = `${eventKey}::${runner.gender || '_'}::${ageGroupOf(runner) || '_'}`;
        categoryCounters[catKey] = (categoryCounters[catKey] || 0) + 1;
        ranks.get(runner._id)!.catRank = categoryCounters[catKey];
    }

    return ranks;
}
