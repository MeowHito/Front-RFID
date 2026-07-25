/**
 * Dead-reckoning a runner's position between two checkpoints.
 *
 * A checkpoint only tells us where someone was at the moment they scanned. To
 * draw them moving, we work out how long the leg ahead should take them — from
 * how long the rest of the field took on it — and walk them along that timetable
 * from the scan, counting down to their arrival at the next checkpoint.
 *
 * Climb is folded into the distance rather than into the speed: one kilometre of
 * flat road and 100 m of ascent cost about the same (the classic hiking rule of
 * thumb, ~600 m of climb per hour ≈ 6 km/h on the flat). Working in these
 * "effort kilometres" means a runner slows down on a climb and speeds up on a
 * descent without any extra bookkeeping — and on a flat course, or a GPX with no
 * elevation, effort km are just plain km.
 */

/** Cumulative effort distance alongside real distance, sampled at each track point. */
export interface EffortProfile {
    km: number[];
    effort: number[];
}

/** Effort kilometres added per metre of ascent. */
const CLIMB_PENALTY_PER_M = 0.01;

export function buildEffortProfile(coords: number[][], penalty = CLIMB_PENALTY_PER_M): EffortProfile {
    const km: number[] = [];
    const effort: number[] = [];
    let acc = 0;
    let prevKm = coords.length ? coords[0][2] : 0;
    let prevEle: number | null = null;
    for (const c of coords) {
        const d = Math.max(0, c[2] - prevKm);
        const e = typeof c[3] === 'number' && Number.isFinite(c[3]) ? c[3] : null;
        let climb = 0;
        if (e !== null && prevEle !== null && e > prevEle) climb = e - prevEle;
        acc += d + climb * penalty;
        km.push(c[2]);
        effort.push(acc);
        prevKm = c[2];
        if (e !== null) prevEle = e;
    }
    return { km, effort };
}

/** Index of the last sample at or before `value` in a non-decreasing array. */
function lowerIndex(arr: number[], value: number): number {
    let lo = 0;
    let hi = arr.length - 1;
    if (hi < 0) return -1;
    if (value <= arr[0]) return 0;
    if (value >= arr[hi]) return hi;
    while (lo < hi - 1) {
        const mid = (lo + hi) >> 1;
        if (arr[mid] <= value) lo = mid; else hi = mid;
    }
    return lo;
}

function interpolate(from: number[], to: number[], value: number): number {
    const i = lowerIndex(from, value);
    if (i < 0) return 0;
    if (i >= from.length - 1) return to[to.length - 1];
    const span = from[i + 1] - from[i];
    const t = span > 0 ? (value - from[i]) / span : 0;
    return to[i] + (to[i + 1] - to[i]) * t;
}

/** Effort distance at a real distance along the course. */
export function effortAtKm(p: EffortProfile, km: number): number {
    return interpolate(p.km, p.effort, km);
}

/** Real distance at an effort distance — the inverse of {@link effortAtKm}. */
export function kmAtEffort(p: EffortProfile, effort: number): number {
    return interpolate(p.effort, p.km, effort);
}

/** Speed of last resort, for the very first runners of a race with no history yet. */
export const DEFAULT_SPEED_KMH = 7;

/** How far up the leg an overdue runner is parked — short of the line, not on it. */
const OVERDUE_AT = 0.98;

export interface Arrival {
    /** Where to draw them now, in km along the course. */
    km: number;
    /** 0 = just left the checkpoint behind, 1 = due at the next one. */
    progress: number;
    /** How long the whole leg is expected to take. */
    etaMs: number;
    /** Time left before they are due at the next checkpoint; negative once overdue. */
    remainingMs: number;
    overdue: boolean;
}

/**
 * Walk a runner along one leg on a timetable instead of a raw speed: given how
 * long the leg should take them, they cover it evenly and arrive exactly when
 * due. This is what makes the figure creep instead of jumping — it moves even
 * for someone standing on the start line, where there is no previous leg to
 * measure a speed from.
 *
 * Distance is measured in effort km, so the pace eases off on the climbs and
 * picks up on the descents while still arriving on schedule.
 */
export function arriveByEta(
    profile: EffortProfile,
    fromKm: number,
    toKm: number,
    etaMs: number,
    sinceMs: number,
): Arrival {
    const safeEta = etaMs > 0 ? etaMs : 1;
    const raw = sinceMs > 0 ? sinceMs / safeEta : 0;
    const progress = Math.max(0, raw);
    const overdue = progress >= 1;
    const drawn = overdue ? OVERDUE_AT : progress;
    const a = effortAtKm(profile, fromKm);
    const b = effortAtKm(profile, toKm);
    return {
        km: b > a ? kmAtEffort(profile, a + (b - a) * drawn) : fromKm,
        progress,
        etaMs: safeEta,
        remainingMs: safeEta - sinceMs,
        overdue,
    };
}

/**
 * How long this runner should need for the leg ahead.
 *
 * Preference order — the field's own history first, because on a real course the
 * median of everyone who already ran that leg beats any formula:
 *   1. the median time other runners took on this leg, scaled by how this runner
 *      compares with the field on the leg they just finished;
 *   2. their own speed so far, applied to the distance ahead;
 *   3. a plain default speed, for the first runners of a race with no history.
 */
export function estimateLegMs(args: {
    profile: EffortProfile;
    /** Effort distance of the leg ahead. */
    legEffort: number;
    /** Median time the field took on the leg ahead, when anyone has finished it. */
    fieldMedianMs?: number | null;
    /** Median time the field took on the leg just completed. */
    prevFieldMedianMs?: number | null;
    /** How long this runner actually took on the leg just completed. */
    ownPrevLegMs?: number;
    /** Effort distance of the leg just completed. */
    ownPrevLegEffort?: number;
}): number {
    const { legEffort, fieldMedianMs, prevFieldMedianMs, ownPrevLegMs, ownPrevLegEffort } = args;
    if (legEffort <= 0) return 1;

    // 1. field median, personalised by this runner's showing on the last leg
    if (fieldMedianMs && fieldMedianMs > 0) {
        const factor = ownPrevLegMs && prevFieldMedianMs && prevFieldMedianMs > 0
            ? Math.min(3, Math.max(0.33, ownPrevLegMs / prevFieldMedianMs))
            : 1;
        return fieldMedianMs * factor;
    }
    // 2. their own pace on the leg they just ran
    if (ownPrevLegMs && ownPrevLegEffort && ownPrevLegEffort > 0) {
        return (ownPrevLegMs / ownPrevLegEffort) * legEffort;
    }
    // 3. nothing to go on yet
    return (legEffort / DEFAULT_SPEED_KMH) * 3600000;
}

/** "2:05:31" / "12:07" — for a countdown to the next checkpoint. */
export function formatCountdown(ms: number): string {
    const s = Math.max(0, Math.round(ms / 1000));
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = s % 60;
    return h > 0
        ? `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`
        : `${m}:${String(sec).padStart(2, '0')}`;
}
