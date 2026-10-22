/**
 * Placing AT ONE CHECKPOINT — the order runners reached that point, per distance.
 *
 * /share-live used to show the runner doc's live race position (overallRank etc.), which
 * is wherever the runner is NOW: on the CP1 list a runner already at FINISH showed their
 * finish placing, and the number kept moving after they had passed. This ranks only the
 * reads at the checkpoint being viewed, so a placing never changes once it is shown
 * (unless a late read genuinely slots in ahead).
 *
 * Same convention as live-ranking.ts, applied to the checkpoint's own times:
 *   • overall + gender → GUN time at this checkpoint, per distance
 *   • age group        → NET time at this checkpoint, per distance + gender + age group
 */

export interface CheckpointRead {
    bib?: string;
    category?: string;
    gender?: string;
    ageGroup?: string;
    status?: string;
    scanTime?: string | null;
    gunTime?: number | null;
    netTime?: number | null;
    elapsedTime?: number | null;
}

export interface CheckpointPlacing {
    overall: number;
    gender: number;
    ageGroup: number;
    /** Runners of this distance that have reached the checkpoint so far. */
    ofOverall: number;
}

const STOPPED = new Set(['dnf', 'dns', 'dq']);

export function hasPassedCheckpoint(r: CheckpointRead): boolean {
    return !!r.scanTime && !STOPPED.has(String(r.status || '').trim().toLowerCase());
}

export function distanceKeyOf(r: CheckpointRead): string {
    return String(r.category || '').trim().toUpperCase();
}

function genderKeyOf(r: CheckpointRead): string {
    return String(r.gender || '').trim().toUpperCase();
}

function positive(n?: number | null): number {
    const v = Number(n || 0);
    return Number.isFinite(v) && v > 0 ? v : 0;
}

function scanMsOf(r: CheckpointRead): number {
    const v = r.scanTime ? new Date(r.scanTime).getTime() : NaN;
    return Number.isFinite(v) ? v : Number.POSITIVE_INFINITY;
}

function compareBib(a: CheckpointRead, b: CheckpointRead): number {
    return String(a.bib || '').localeCompare(String(b.bib || ''), undefined, { numeric: true });
}

function median(values: number[]): number | null {
    if (values.length === 0) return null;
    const sorted = [...values].sort((x, y) => x - y);
    return sorted[Math.floor(sorted.length / 2)];
}

/**
 * Keyed by `keyOf(runner)`; only runners that passed the checkpoint get a placing.
 * A read without a gun time (e.g. typed in by staff) is placed by its crossing time,
 * converted onto the gun clock of the other runners of the same distance.
 */
export function computeCheckpointPlacings<T extends CheckpointRead>(
    runners: T[],
    keyOf: (runner: T) => string,
): Map<string, CheckpointPlacing> {
    const byDistance = new Map<string, T[]>();
    for (const r of runners) {
        if (!hasPassedCheckpoint(r)) continue;
        const d = distanceKeyOf(r);
        const list = byDistance.get(d);
        if (list) list.push(r); else byDistance.set(d, [r]);
    }

    const out = new Map<string, CheckpointPlacing>();
    for (const list of byDistance.values()) {
        const gunStart = median(list
            .filter(r => positive(r.gunTime) > 0 && Number.isFinite(scanMsOf(r)))
            .map(r => scanMsOf(r) - positive(r.gunTime)));
        const gunMs = new Map<T, number>();
        const netMs = new Map<T, number>();
        for (const r of list) {
            const gun = positive(r.gunTime) || (gunStart !== null ? scanMsOf(r) - gunStart : scanMsOf(r));
            gunMs.set(r, gun);
            netMs.set(r, positive(r.netTime) || positive(r.elapsedTime) || gun);
        }

        const byGun = [...list].sort((a, b) =>
            (gunMs.get(a)! - gunMs.get(b)!) || (scanMsOf(a) - scanMsOf(b)) || compareBib(a, b));
        const genderCount = new Map<string, number>();
        byGun.forEach((r, i) => {
            const g = genderKeyOf(r);
            genderCount.set(g, (genderCount.get(g) || 0) + 1);
            out.set(keyOf(r), { overall: i + 1, gender: genderCount.get(g)!, ageGroup: 0, ofOverall: list.length });
        });

        const byNet = [...list].sort((a, b) =>
            (netMs.get(a)! - netMs.get(b)!) || (gunMs.get(a)! - gunMs.get(b)!) || compareBib(a, b));
        const ageCount = new Map<string, number>();
        for (const r of byNet) {
            const ag = String(r.ageGroup || '').trim();
            if (!ag) continue;
            const k = `${genderKeyOf(r)}::${ag}`;
            ageCount.set(k, (ageCount.get(k) || 0) + 1);
            out.get(keyOf(r))!.ageGroup = ageCount.get(k)!;
        }
    }
    return out;
}

// Who the announcer should call out by name: the overall front of each distance, the
// gender podium-and-a-bit, and every age-group podium.
export const NOTABLE_OVERALL = 10;
export const NOTABLE_GENDER = 5;
export const NOTABLE_AGE_GROUP = 3;

export function isNotablePlacing(p?: CheckpointPlacing): boolean {
    if (!p) return false;
    return (p.overall > 0 && p.overall <= NOTABLE_OVERALL)
        || (p.gender > 0 && p.gender <= NOTABLE_GENDER)
        || (p.ageGroup > 0 && p.ageGroup <= NOTABLE_AGE_GROUP);
}
