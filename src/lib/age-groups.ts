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

/**
 * The age-group labels a given race distance actually uses, most-used spelling
 * per bracket, ordered youngest first.
 *
 * The same real bracket is spelled differently per distance ("30 - 39" on 25K,
 * "30-39" on 15K), so /admin/participants offers the labels belonging to the
 * distance being edited — picking a foreign spelling would strand the runner in
 * a bracket of one. Input is the per-label usage counts from
 * `GET /runners/age-groups`. Labels that don't parse as a bracket are kept at
 * the end rather than dropped, so nothing in use becomes unselectable.
 */
export function buildAgeGroupOptions(raw: { label: string; count: number }[] | undefined): string[] {
    if (!raw || raw.length === 0) return [];
    // Reuse the results page's own bucketing so the offered labels are exactly the
    // brackets a runner can land in — this drops one-off variants that merely
    // overlap a real bracket ("20-29" alongside a dominant "Under 29"), which the
    // results page would fold away anyway, leaving the picker no dead choices.
    const labels = raw.flatMap(entry => Array(Math.max(1, entry.count)).fill(entry.label) as string[]);
    const { buckets } = buildCanonicalAgeGroups(labels);
    const dominant = buckets.map(b => b.label);

    // Labels that aren't brackets at all are invisible to the canonicalizer but are
    // still in use, so keep them selectable at the end rather than dropping them.
    const unparsed = raw
        .filter(entry => !parseAgeGroupBucket(entry.label))
        .sort((a, b) => b.count - a.count)
        .map(entry => entry.label);
    return [...dominant, ...unparsed];
}

/**
 * The option a runner of `age` belongs to, so a birth-date edit can auto-select one.
 *
 * Falls back to the highest bracket starting at or below `age` when nothing
 * contains it, because RaceTiger's own brackets leave gaps: "Under 29" parses as
 * 0-28 and the next bracket starts at 30, so a 29-year-old matches nothing
 * literally but plainly belongs in "Under 29". Ages below every bracket land in
 * the youngest one. Returns '' only when no option parses as a bracket at all.
 */
export function matchAgeGroupOption(age: number, options: string[]): string {
    const parsed = options
        .map(label => ({ label, bucket: parseAgeGroupBucket(label) }))
        .filter((entry): entry is { label: string; bucket: AgeGroupBucket } => entry.bucket !== null)
        .sort((a, b) => a.bucket.min - b.bucket.min);
    if (parsed.length === 0) return '';

    const contained = parsed.find(entry => age >= entry.bucket.min && age <= entry.bucket.max);
    if (contained) return contained.label;

    let fallback = '';
    for (const entry of parsed) {
        if (entry.bucket.min <= age) fallback = entry.label;
    }
    return fallback || parsed[0].label;
}

/**
 * Re-spell an age-group label into the equivalent label used by another distance,
 * matching on the real bracket rather than the string ("50 - 59" → "50-59").
 * Returns '' when that distance has no equivalent bracket, so the caller can fall
 * back to deriving one from the birth date instead of carrying a stale label over.
 */
export function remapAgeGroupToOptions(current: string, options: string[]): string {
    if (!current || options.length === 0) return current;
    if (options.includes(current)) return current;
    const bucket = parseAgeGroupBucket(current);
    if (!bucket) return current;
    const exact = options.find(o => {
        const b = parseAgeGroupBucket(o);
        return b && b.min === bucket.min && b.max === bucket.max;
    });
    return exact || '';
}

/** Maps one raw ageGroup string to its canonical label using a lookup built by `buildCanonicalAgeGroups`. */
export function canonicalizeAgeGroup(raw: string | undefined | null, canonicalLabelOf: Map<string, string>): string {
    const bucket = parseAgeGroupBucket(raw);
    if (!bucket) return normalizeAgeGroupLabel(raw);
    return canonicalLabelOf.get(bucket.label.toLowerCase()) ?? bucket.label;
}
