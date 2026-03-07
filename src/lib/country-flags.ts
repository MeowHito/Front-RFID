/**
 * Convert ISO 3166-1 alpha-2 or alpha-3 country code to flag emoji.
 * RaceTiger stores nationality as alpha-3 (e.g. "THA", "USA", "GBR").
 */

// Alpha-3 → Alpha-2 mapping for common running event nations
const ALPHA3_TO_ALPHA2: Record<string, string> = {
    THA: 'TH', USA: 'US', GBR: 'GB', JPN: 'JP', KOR: 'KR', CHN: 'CN',
    TWN: 'TW', HKG: 'HK', SGP: 'SG', MYS: 'MY', IDN: 'ID', PHL: 'PH',
    VNM: 'VN', MMR: 'MM', LAO: 'LA', KHM: 'KH', IND: 'IN', AUS: 'AU',
    NZL: 'NZ', CAN: 'CA', DEU: 'DE', FRA: 'FR', ITA: 'IT', ESP: 'ES',
    NLD: 'NL', BEL: 'BE', CHE: 'CH', AUT: 'AT', SWE: 'SE', NOR: 'NO',
    DNK: 'DK', FIN: 'FI', RUS: 'RU', BRA: 'BR', MEX: 'MX', ARG: 'AR',
    COL: 'CO', KEN: 'KE', ETH: 'ET', ZAF: 'ZA', NGA: 'NG', EGY: 'EG',
    ISR: 'IL', ARE: 'AE', SAU: 'SA', TUR: 'TR', PAK: 'PK', BGD: 'BD',
    LKA: 'LK', NPL: 'NP', POL: 'PL', CZE: 'CZ', HUN: 'HU', ROU: 'RO',
    UKR: 'UA', PRT: 'PT', IRL: 'IE', GRC: 'GR', BRN: 'BN', MAC: 'MO',
};

function alpha2ToFlag(alpha2: string): string {
    const upper = alpha2.toUpperCase();
    if (upper.length !== 2) return '';
    const cp1 = 0x1F1E6 + upper.charCodeAt(0) - 65;
    const cp2 = 0x1F1E6 + upper.charCodeAt(1) - 65;
    return String.fromCodePoint(cp1, cp2);
}

/**
 * Convert any country code (alpha-2, alpha-3, or common name) to a flag emoji.
 * Returns empty string if unknown.
 */
export function countryToFlag(code: string | undefined | null): string {
    if (!code) return '';
    const upper = code.trim().toUpperCase();
    if (upper.length === 2) return alpha2ToFlag(upper);
    if (upper.length === 3) {
        const a2 = ALPHA3_TO_ALPHA2[upper];
        return a2 ? alpha2ToFlag(a2) : '';
    }
    return '';
}

/**
 * Get flag emoji + code label for display.
 * e.g. "THA" → "🇹🇭 THA"
 */
export function countryFlagLabel(code: string | undefined | null): string {
    if (!code) return '-';
    const flag = countryToFlag(code);
    return flag ? `${flag} ${code.toUpperCase()}` : code.toUpperCase();
}
