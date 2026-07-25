/**
 * Dead-reckoning a runner's position between two checkpoints.
 *
 * A checkpoint only tells us where someone was at the moment they scanned. To
 * draw them moving, we take the speed they have actually been running at and
 * carry them forward from that scan for however long it has been since.
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

export interface Projection {
    /** Where to draw the runner right now, in km along the course. */
    km: number;
    /** Effort km per hour the estimate is based on. */
    speed: number;
    /** True when the estimate ran past the next checkpoint — they are overdue there. */
    capped: boolean;
}

/**
 * Carry a runner forward from their last scan.
 *
 * `speed` is in effort km/h. The result never passes the next checkpoint: a
 * runner cannot be beyond a point they have not scanned at, so once the estimate
 * reaches it they wait there until the scan (or a DNF) says otherwise.
 */
export function projectPosition(
    profile: EffortProfile,
    lastKm: number,
    nextKm: number | undefined,
    speed: number,
    hoursSinceScan: number,
): Projection {
    const limit = nextKm ?? lastKm;
    if (!(speed > 0) || !(hoursSinceScan > 0) || limit <= lastKm) {
        return { km: lastKm, speed: Math.max(0, speed), capped: false };
    }
    const target = effortAtKm(profile, lastKm) + speed * hoursSinceScan;
    const km = kmAtEffort(profile, target);
    if (km >= limit) return { km: limit, speed, capped: true };
    return { km: Math.max(lastKm, km), speed, capped: false };
}

/**
 * Effort km/h from the most recent leg the runner completed, falling back to
 * their average over the whole race so far. Returns 0 when neither is known.
 */
export function paceFrom(
    profile: EffortProfile,
    legKm: { from: number; to: number } | null,
    legMs: number | undefined,
    totalKm: number,
    totalMs: number | undefined,
): number {
    if (legKm && legMs && legMs > 0) {
        const d = effortAtKm(profile, legKm.to) - effortAtKm(profile, legKm.from);
        if (d > 0) return d / (legMs / 3600000);
    }
    if (totalMs && totalMs > 0) {
        const d = effortAtKm(profile, totalKm);
        if (d > 0) return d / (totalMs / 3600000);
    }
    return 0;
}
