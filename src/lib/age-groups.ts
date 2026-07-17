// Shared age-group bucket parsing/canonicalization, used by every surface that
// groups runners into age brackets: /event/[id], /Result-Winners/[slug],
// /admin/age-group-ranking, and awards.ts.
//
// RaceTiger sometimes tags a handful of individual runners with a differently
// -shaped age-group string than the rest of the field for the same real bracket
// (e.g. "0-19" for 2 runners vs "U 19" for the other 44; "50-54" for 2 runners
// vs "50-59" for the other 68; "M 40-49" instead of "40-49"). Treating every
// literal string as its own bucket fragments filters/boards with near-duplicate
// one-off entries and silently drops those runners from the real bracket's
// ranking and awards. `buildCanonicalAgeGroups` folds minority label variants
// into whichever majority ("dominant") bucket they overlap the most.

export interface AgeGroupBucket {
    label: string;
    min: number;
    max: number;
}

/** Strip gender prefix ("M30-39") and Thai "ปี" suffix so labels group consistently. */
export function normalizeAgeGroupLabel(value?: string | null): string {
    return String(value || '')
        .replace(/^[MF]\s*/i, '')
        .replace(/\s*ปี$/i, '')
        .trim();
}

export function parseAgeGroupBucket(value?: string | null): AgeGroupBucket | null {
    const label = normalizeAgeGroupLabel(value);
    if (!label) return null;

    const rangeMatch = label.match(/(\d+)\s*-\s*(\d+)/);
    if (rangeMatch) {
        return { label, min: parseInt(rangeMatch[1]), max: parseInt(rangeMatch[2]) };
    }

    const underMatch = label.match(/(?:u|under)\s*(\d+)/i);
    if (underMatch) {
        const max = parseInt(underMatch[1]) - 1;
        return { label, min: 0, max: max >= 0 ? max : 0 };
    }

    const plusMatch = label.match(/(\d+)\s*\+/);
    if (plusMatch) {
        return { label, min: parseInt(plusMatch[1]), max: 999 };
    }

    // "60&Over", "60 & Up", "60 and over", "60 ขึ้นไป", "Over 60"
    const overMatch = label.match(/(\d+)\s*(?:&|and\b)?\s*(?:over|up|ขึ้นไป)/i)
        || label.match(/\b(?:over|above)\s*(\d+)/i);
    if (overMatch) {
        return { label, min: parseInt(overMatch[1]), max: 999 };
    }

    return null;
}

const overlapAmount = (a: AgeGroupBucket, b: AgeGroupBucket) => Math.min(a.max, b.max) - Math.max(a.min, b.min);

/**
 * Given every runner's raw ageGroup string for a category, returns the
 * canonical (majority) buckets and a lookup to map any raw label — including
 * minority variants — to its canonical label.
 */
export function buildCanonicalAgeGroups(rawLabels: Array<string | undefined | null>): {
    buckets: AgeGroupBucket[];
    canonicalLabelOf: Map<string, string>;
} {
    const stats = new Map<string, { bucket: AgeGroupBucket; count: number }>();
    for (const raw of rawLabels) {
        const bucket = parseAgeGroupBucket(raw);
        if (!bucket) continue;
        const key = bucket.label.toLowerCase();
        const existing = stats.get(key);
        if (existing) existing.count += 1;
        else stats.set(key, { bucket, count: 1 });
    }

    const entries = Array.from(stats.values()).sort((a, b) => b.count - a.count);

    // A bucket is "dominant" if it doesn't overlap any bucket already accepted
    // as dominant (walking from most- to least-populated), i.e. it isn't just a
    // smaller/rarer variant of an already-established real bracket.
    const dominant: { bucket: AgeGroupBucket; count: number }[] = [];
    for (const entry of entries) {
        const overlapsExisting = dominant.some(d => overlapAmount(entry.bucket, d.bucket) >= 0);
        if (!overlapsExisting) dominant.push(entry);
    }

    const canonicalLabelOf = new Map<string, string>();
    for (const entry of entries) {
        const key = entry.bucket.label.toLowerCase();
        if (dominant.includes(entry)) {
            canonicalLabelOf.set(key, entry.bucket.label);
            continue;
        }
        let best: AgeGroupBucket | null = null;
        let bestOverlap = -Infinity;
        for (const d of dominant) {
            const overlap = overlapAmount(entry.bucket, d.bucket);
            if (overlap > bestOverlap) { bestOverlap = overlap; best = d.bucket; }
        }
        canonicalLabelOf.set(key, best ? best.label : entry.bucket.label);
    }

    const buckets = dominant.map(d => d.bucket).sort((a, b) => a.min - b.min || a.max - b.max);
    return { buckets, canonicalLabelOf };
}

/** Maps one raw ageGroup string to its canonical label using a lookup built by `buildCanonicalAgeGroups`. */
export function canonicalizeAgeGroup(raw: string | undefined | null, canonicalLabelOf: Map<string, string>): string {
    const bucket = parseAgeGroupBucket(raw);
    if (!bucket) return normalizeAgeGroupLabel(raw);
    return canonicalLabelOf.get(bucket.label.toLowerCase()) ?? bucket.label;
}
