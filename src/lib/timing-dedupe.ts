// Duplicate-scan filter for checkpoint lists.
//
// A runner can end up with two TimingRecords for the same checkpoint — the RFID
// reader double-reads the tag at the mat, or a RaceTiger sync re-imports a pass
// that was also captured locally. Both rows carry the same time, so the UI shows
// "FINISH LINE" twice (see /runner/[id] history + the e-slip splits).
//
// Two records collapse into one when they share a checkpoint name and their scan
// times fall within `windowMs` (default 60s). That window is wide enough for a
// re-read / re-import but far too narrow to swallow a legitimate second pass on a
// looped course.

function normalizeName(value?: string | null): string {
    return (value || '').trim().toLowerCase();
}

type TimingLike = {
    checkpoint?: string;
    scanTime?: string | Date;
    netTime?: number;
    elapsedTime?: number;
    gunTime?: number;
};

function scanMs(t: TimingLike): number | null {
    if (!t.scanTime) return null;
    const ms = new Date(t.scanTime).getTime();
    return Number.isNaN(ms) ? null : ms;
}

// How much usable data a record carries — the richer of a duplicate pair wins.
function score(t: TimingLike): number {
    let s = 0;
    if (t.netTime != null) s++;
    if (t.elapsedTime != null) s++;
    if (t.gunTime != null) s++;
    if (t.scanTime) s++;
    return s;
}

export function dedupeTimings<T extends TimingLike>(timings: T[], windowMs = 60000): T[] {
    const out: T[] = [];

    for (const record of timings) {
        const name = normalizeName(record.checkpoint);
        const ms = scanMs(record);

        const dupIdx = out.findIndex(prev => {
            if (normalizeName(prev.checkpoint) !== name) return false;
            const prevMs = scanMs(prev);
            // Missing scanTime on either side: fall back to matching elapsed times.
            if (ms == null || prevMs == null) {
                const a = record.netTime ?? record.elapsedTime ?? record.gunTime;
                const b = prev.netTime ?? prev.elapsedTime ?? prev.gunTime;
                return a != null && a === b;
            }
            return Math.abs(prevMs - ms) <= windowMs;
        });

        if (dupIdx === -1) {
            out.push(record);
        } else if (score(record) > score(out[dupIdx])) {
            out[dupIdx] = record;
        }
    }

    return out;
}
