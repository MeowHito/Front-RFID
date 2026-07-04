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
