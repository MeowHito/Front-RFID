// Resolve a runner's raw `category` string to the distance label the public
// /event page shows in its "KM:" segmented control — i.e. campaign.categories[].distance
// (e.g. "NST 42"), falling back to the category name. The matching passes mirror
// /event/[id]'s resolveRunnerCategoryKey() so a certificate / e-slip can never
// show a distance label that differs from the results table.
import { normalizeCategoryName } from './nationality';

export interface RaceCategoryLike {
    name?: string;
    distance?: string;
}

function parseDistanceValue(value?: string | null): number | null {
    const match = String(value || '').replace(/,/g, '').match(/-?\d+(?:\.\d+)?/);
    if (!match) return null;
    const parsed = Number(match[0]);
    return Number.isFinite(parsed) ? parsed : null;
}

/** The label shown for a campaign category — distance first, name as fallback. */
export function categoryDistanceLabel(cat?: RaceCategoryLike | null): string {
    return String(cat?.distance || '').trim() || String(cat?.name || '').trim();
}

/** Find the campaign category a runner's raw `category` string belongs to. */
export function findRunnerCategory(
    rawCategory?: string | null,
    categories?: RaceCategoryLike[] | null,
): RaceCategoryLike | null {
    const list = (categories || []).filter(c => c && (c.name || c.distance));
    const rc = normalizeCategoryName(rawCategory);
    if (!list.length || !rc) return null;

    // Pass 1: exact normalized match on either the name or the distance label.
    for (const cat of list) {
        if (rc === normalizeCategoryName(cat.name) || rc === normalizeCategoryName(cat.distance)) return cat;
    }

    // Pass 2: numeric distance match (e.g. "42 KM" → category "NST 42").
    const rd = parseDistanceValue(rawCategory);
    if (rd !== null) {
        for (const cat of list) {
            const cd = parseDistanceValue(cat.distance || cat.name);
            if (cd !== null && Math.abs(cd - rd) < 0.001) return cat;
        }
    }

    // Pass 3: prefix match, only when the shorter side is ≥3 chars so "5km"
    // can't swallow "15km".
    for (const cat of list) {
        const cn = normalizeCategoryName(cat.name);
        if (!cn) continue;
        const shorter = rc.length <= cn.length ? rc : cn;
        const longer = rc.length <= cn.length ? cn : rc;
        if (shorter.length >= 3 && longer.startsWith(shorter)) return cat;
    }

    return null;
}

/**
 * Distance label for a runner: the campaign's own distance name when it can be
 * matched (so it reads exactly like the /event tabs), otherwise the numeric
 * distance embedded in the raw category ("42K Male 30-39" → "42K"), otherwise
 * the raw category as-is.
 */
export function resolveRunnerDistanceLabel(
    rawCategory?: string | null,
    categories?: RaceCategoryLike[] | null,
): string {
    const matched = findRunnerCategory(rawCategory, categories);
    if (matched) {
        const label = categoryDistanceLabel(matched);
        if (label) return label;
    }
    const raw = String(rawCategory || '').trim();
    if (!raw) return '-';
    const m = raw.match(/(\d+(?:\.\d+)?)\s*K/i);
    return m ? `${m[1]}K` : raw;
}
