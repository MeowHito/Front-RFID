// Best-Of-Winners eligibility: runners whose free-text address mentions Buriram
// province. There is no structured province field on Runner, so this matches the
// Thai and English spellings as a substring of the address text.

const BURIRAM_TOKENS = ['บุรีรัมย์', 'buriram', 'buri ram'];

/** True when the runner's address indicates residence in Buriram province. */
export function isBuriramAddress(address?: string | null): boolean {
    const value = String(address ?? '').trim().toLowerCase();
    if (!value) return false;
    return BURIRAM_TOKENS.some(token => value.includes(token.toLowerCase()));
}

/** True when any of the given location fields (e.g. province, address) indicates
 * Buriram residence. Used by the "Best of Buriram" local award. */
export function isBuriramLocation(...values: (string | null | undefined)[]): boolean {
    return values.some(v => isBuriramAddress(v));
}

export interface BuriramRankRunner {
    _id: string;
    gender: string;
    status: string;
    netTime?: number;
    gunTime?: number;
    elapsedTime?: number;
    province?: string;
    address?: string;
}

/**
 * "Best of Buriram" winners for a single category pool: the top `topN` fastest
 * male and female finishers whose location indicates Buriram residence. Returns
 * the set of winning runner ids. Mirrors the Best-Of-Winners board logic so the
 * board and the e-slip badge always agree on who is a Buriram winner.
 */
export function computeBuriramWinnerIds(runners: BuriramRankRunner[], topN = 1): Set<string> {
    const n = Math.max(1, topN);
    const eligible = runners.filter(r =>
        r.status === 'finished' &&
        (r.netTime || r.gunTime || r.elapsedTime) &&
        isBuriramLocation(r.province, r.address),
    );
    const sorted = [...eligible].sort((a, b) => {
        const at = a.netTime || a.gunTime || a.elapsedTime || Infinity;
        const bt = b.netTime || b.gunTime || b.elapsedTime || Infinity;
        return at - bt;
    });
    const ids = new Set<string>();
    sorted.filter(r => r.gender !== 'F').slice(0, n).forEach(r => ids.add(r._id));
    sorted.filter(r => r.gender === 'F').slice(0, n).forEach(r => ids.add(r._id));
    return ids;
}
