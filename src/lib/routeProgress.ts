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

/** "09:14" — wall-clock hour and minute of a scan. */
export function formatClock(ms: number): string {
    const d = new Date(ms);
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/** Default width of a clump's arrival window, in minutes. Admins can override it
 *  per event (Campaign.profileClusterMinutes) — see clusterMinutesOf. */
export const CLUSTER_WINDOW_MINUTES = 10;
export const CLUSTER_WINDOW_MS = CLUSTER_WINDOW_MINUTES * 60 * 1000;

/** Clamp of what an admin may type: a window under a minute splits every runner
 *  into their own figure, and one over 12 hours swallows a whole race. */
export const CLUSTER_MINUTES_MIN = 1;
export const CLUSTER_MINUTES_MAX = 720;

/** The event's clump window in minutes, falling back to the default. */
export function clusterMinutesOf(value?: number | null): number {
    const n = Number(value);
    if (!Number.isFinite(n) || n <= 0) return CLUSTER_WINDOW_MINUTES;
    return Math.min(CLUSTER_MINUTES_MAX, Math.max(CLUSTER_MINUTES_MIN, Math.round(n)));
}

/**
 * Splits the field into the clumps drawn as amber figures on the profile.
 *
 * Runners are bucketed by the leg they are on — a clump must not straddle a
 * checkpoint, or the figure would stand somewhere none of its members are —
 * then by when they are due at the far end of it. The window opens on the first
 * runner of a clump and runs for `CLUSTER_WINDOW_MS`; whoever is due later than
 * that starts the next clump.
 *
 * Due time rather than scan time is what keeps the picture readable. Two people
 * who scanned 20 minutes apart but run at different speeds are side by side on
 * the graph, and everyone already overdue is due "now" (see how `dueMs` is
 * built at the call sites), so the whole late tail — which all parks on the same
 * spot short of the line — collapses into a single figure instead of a tower of
 * them, one per 10 minutes of lateness.
 */
export function clusterByDueWindow<T>(
    runners: T[],
    at: (r: T) => { legKey: string | number; dueMs?: number },
    windowMs: number = CLUSTER_WINDOW_MS,
): T[][] {
    const byLeg = new Map<string | number, T[]>();
    for (const r of runners) {
        const key = at(r).legKey;
        const list = byLeg.get(key);
        if (list) list.push(r);
        else byLeg.set(key, [r]);
    }

    const chunks: T[][] = [];
    for (const list of Array.from(byLeg.values())) {
        // No usable time at all (never scanned, no estimate) — one clump, no split.
        const timed = list
            .filter(r => !!at(r).dueMs)
            .sort((a, b) => (at(a).dueMs || 0) - (at(b).dueMs || 0));
        const untimed = list.filter(r => !at(r).dueMs);

        let group: T[] = [];
        for (const r of timed) {
            if (group.length && (at(r).dueMs || 0) - (at(group[0]).dueMs || 0) > windowMs) {
                chunks.push(group);
                group = [];
            }
            group.push(r);
        }
        if (group.length) chunks.push(group);
        if (untimed.length) chunks.push(untimed);
    }
    return chunks;
}

/**
 * A category's cut-off as a duration in ms — the organiser types it free-hand,
 * so accept what they actually type: "7ชม.", "2.5 ชม", "30 hrs", "7h 30m",
 * "90 นาที", or a clock-style "07:30".
 *
 * Returns null when there is nothing usable, which every caller reads as "this
 * distance has no cut-off" rather than "the cut-off is zero".
 */
export function parseCutoffMs(cutoff?: string | null): number | null {
    const raw = String(cutoff || '').trim();
    if (!raw || raw === '-') return null;

    // "07:30" / "7:30:00" — hours:minutes(:seconds)
    const clock = raw.match(/^(\d{1,3}):(\d{1,2})(?::(\d{1,2}))?$/);
    if (clock) {
        const h = Number(clock[1]) || 0;
        const m = Number(clock[2]) || 0;
        const s = Number(clock[3] || 0) || 0;
        const ms = ((h * 60 + m) * 60 + s) * 1000;
        return ms > 0 ? ms : null;
    }

    // "7ชม. 30นาที", "30 hrs", "90 min" — every number with its unit, summed.
    // Only numbers that carry a unit count, so a label like "48 ชม. (100M)" is
    // not read as 148 hours.
    let totalMinutes = 0;
    // A bare "m" is deliberately not a minutes alias — it would read the "100M"
    // in a label like "48 ชม. (100M)" as 100 minutes of extra cut-off.
    const unit = /(\d+(?:\.\d+)?)\s*(ชม\.?|ชั่วโมง|hours?|hrs?|h|นาที|น\.|minutes?|mins?)/gi;
    let hit: RegExpExecArray | null;
    while ((hit = unit.exec(raw)) !== null) {
        const value = Number(hit[1]);
        if (!Number.isFinite(value)) continue;
        const suffix = hit[2].toLowerCase();
        totalMinutes += /^(นาที|น\.|min|mins|minute|minutes)$/.test(suffix) ? value : value * 60;
    }
    if (totalMinutes > 0) return totalMinutes * 60000;

    // A bare number on its own is read as hours: that is how cut-offs are written.
    const bare = raw.match(/^(\d+(?:\.\d+)?)$/);
    const hours = bare ? Number(bare[1]) : 0;
    return hours > 0 ? hours * 3600000 : null;
}

/**
 * Wall-clock instant a distance closes: its gun start plus its cut-off. Null
 * whenever either half is missing — most events leave `startTime` blank, and a
 * guessed cut-off would wipe the runners off the chart for no reason.
 */
export function cutoffAtMs(args: {
    /** The event's date, any form `new Date()` accepts. */
    eventDate?: string | Date | null;
    /**
     * Gun start of this distance. Both shapes the admin pages save are accepted:
     * a clock time on the event date ("05:00", "05:00:00") and a whole datetime
     * ("2026-05-23T03:04"), which is what the campaign editor writes.
     */
    startTime?: string | null;
    /** The cut-off as the organiser typed it. */
    cutoff?: string | null;
}): number | null {
    const { eventDate, startTime, cutoff } = args;
    const durationMs = parseCutoffMs(cutoff);
    if (!durationMs) return null;
    const start = String(startTime || '').trim();
    if (!start) return null;

    // A whole datetime stands on its own — the event date is not consulted.
    if (/\d{4}-\d{2}-\d{2}/.test(start)) {
        const at = new Date(start);
        return Number.isNaN(at.getTime()) ? null : at.getTime() + durationMs;
    }

    const clock = start.match(/^(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?$/);
    if (!clock || !eventDate) return null;
    const base = new Date(eventDate);
    if (Number.isNaN(base.getTime())) return null;
    base.setHours(Number(clock[1]) || 0, Number(clock[2]) || 0, Number(clock[3] || 0) || 0, 0);
    return Number.isNaN(base.getTime()) ? null : base.getTime() + durationMs;
}

/**
 * How long the leg ahead should take, from the average pace the runner has held
 * so far — the same sum the Next/ETA column on the public results page runs, so
 * the figure on the profile and the countdown in the table agree.
 *
 * The 10% is the table's own allowance: pace over a whole race sags, so a leg
 * priced at the average pace to date is optimistic.
 */
export const ETA_SLOWDOWN = 1.10;

export function estimatePaceEtaMs(args: {
    /** Time on the clock at the checkpoint just scanned. */
    elapsedMs: number;
    /** Km along the course of that checkpoint. */
    currentKm: number;
    /** Km along the course of the one ahead. */
    nextKm: number;
}): number {
    const { elapsedMs, currentKm, nextKm } = args;
    if (!(elapsedMs > 0) || !(currentKm > 0) || !(nextKm > currentKm)) return 0;
    const msPerKm = elapsedMs / currentKm;
    return msPerKm * (nextKm - currentKm) * ETA_SLOWDOWN;
}
