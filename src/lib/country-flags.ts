/**
 * Convert ISO 3166-1 alpha-2 or alpha-3 country code to flag emoji.
 * RaceTiger stores nationality as alpha-3 (e.g. "THA", "USA", "GBR").
 *
 * A flag emoji is just the country's two-letter code written with regional
 * indicator symbols, so alpha-3 → alpha-2 → emoji is the whole job — there is
 * no flag artwork to sync or host.
 */

/** ISO 3166-1 alpha-3 → alpha-2. The full list: any nation that enters gets a flag. */
const ALPHA3_TO_ALPHA2: Record<string, string> = {
    AFG: 'AF', ALA: 'AX', ALB: 'AL', DZA: 'DZ', ASM: 'AS', AND: 'AD', AGO: 'AO', AIA: 'AI',
    ATA: 'AQ', ATG: 'AG', ARG: 'AR', ARM: 'AM', ABW: 'AW', AUS: 'AU', AUT: 'AT', AZE: 'AZ',
    BHS: 'BS', BHR: 'BH', BGD: 'BD', BRB: 'BB', BLR: 'BY', BEL: 'BE', BLZ: 'BZ', BEN: 'BJ',
    BMU: 'BM', BTN: 'BT', BOL: 'BO', BES: 'BQ', BIH: 'BA', BWA: 'BW', BVT: 'BV', BRA: 'BR',
    IOT: 'IO', BRN: 'BN', BGR: 'BG', BFA: 'BF', BDI: 'BI',
    CPV: 'CV', KHM: 'KH', CMR: 'CM', CAN: 'CA', CYM: 'KY', CAF: 'CF', TCD: 'TD', CHL: 'CL',
    CHN: 'CN', CXR: 'CX', CCK: 'CC', COL: 'CO', COM: 'KM', COG: 'CG', COD: 'CD', COK: 'CK',
    CRI: 'CR', CIV: 'CI', HRV: 'HR', CUB: 'CU', CUW: 'CW', CYP: 'CY', CZE: 'CZ',
    DNK: 'DK', DJI: 'DJ', DMA: 'DM', DOM: 'DO',
    ECU: 'EC', EGY: 'EG', SLV: 'SV', GNQ: 'GQ', ERI: 'ER', EST: 'EE', SWZ: 'SZ', ETH: 'ET',
    FLK: 'FK', FRO: 'FO', FJI: 'FJ', FIN: 'FI', FRA: 'FR', GUF: 'GF', PYF: 'PF', ATF: 'TF',
    GAB: 'GA', GMB: 'GM', GEO: 'GE', DEU: 'DE', GHA: 'GH', GIB: 'GI', GRC: 'GR', GRL: 'GL',
    GRD: 'GD', GLP: 'GP', GUM: 'GU', GTM: 'GT', GGY: 'GG', GIN: 'GN', GNB: 'GW', GUY: 'GY',
    HTI: 'HT', HMD: 'HM', VAT: 'VA', HND: 'HN', HKG: 'HK', HUN: 'HU',
    ISL: 'IS', IND: 'IN', IDN: 'ID', IRN: 'IR', IRQ: 'IQ', IRL: 'IE', IMN: 'IM', ISR: 'IL',
    ITA: 'IT',
    JAM: 'JM', JPN: 'JP', JEY: 'JE', JOR: 'JO',
    KAZ: 'KZ', KEN: 'KE', KIR: 'KI', PRK: 'KP', KOR: 'KR', KWT: 'KW', KGZ: 'KG',
    LAO: 'LA', LVA: 'LV', LBN: 'LB', LSO: 'LS', LBR: 'LR', LBY: 'LY', LIE: 'LI', LTU: 'LT',
    LUX: 'LU',
    MAC: 'MO', MDG: 'MG', MWI: 'MW', MYS: 'MY', MDV: 'MV', MLI: 'ML', MLT: 'MT', MHL: 'MH',
    MTQ: 'MQ', MRT: 'MR', MUS: 'MU', MYT: 'YT', MEX: 'MX', FSM: 'FM', MDA: 'MD', MCO: 'MC',
    MNG: 'MN', MNE: 'ME', MSR: 'MS', MAR: 'MA', MOZ: 'MZ', MMR: 'MM',
    NAM: 'NA', NRU: 'NR', NPL: 'NP', NLD: 'NL', NCL: 'NC', NZL: 'NZ', NIC: 'NI', NER: 'NE',
    NGA: 'NG', NIU: 'NU', NFK: 'NF', MKD: 'MK', MNP: 'MP', NOR: 'NO',
    OMN: 'OM',
    PAK: 'PK', PLW: 'PW', PSE: 'PS', PAN: 'PA', PNG: 'PG', PRY: 'PY', PER: 'PE', PHL: 'PH',
    PCN: 'PN', POL: 'PL', PRT: 'PT', PRI: 'PR',
    QAT: 'QA',
    REU: 'RE', ROU: 'RO', RUS: 'RU', RWA: 'RW',
    BLM: 'BL', SHN: 'SH', KNA: 'KN', LCA: 'LC', MAF: 'MF', SPM: 'PM', VCT: 'VC', WSM: 'WS',
    SMR: 'SM', STP: 'ST', SAU: 'SA', SEN: 'SN', SRB: 'RS', SYC: 'SC', SLE: 'SL', SGP: 'SG',
    SXM: 'SX', SVK: 'SK', SVN: 'SI', SLB: 'SB', SOM: 'SO', ZAF: 'ZA', SGS: 'GS', SSD: 'SS',
    ESP: 'ES', LKA: 'LK', SDN: 'SD', SUR: 'SR', SJM: 'SJ', SWE: 'SE', CHE: 'CH', SYR: 'SY',
    TWN: 'TW', TJK: 'TJ', TZA: 'TZ', THA: 'TH', TLS: 'TL', TGO: 'TG', TKL: 'TK', TON: 'TO',
    TTO: 'TT', TUN: 'TN', TUR: 'TR', TKM: 'TM', TCA: 'TC', TUV: 'TV',
    UGA: 'UG', UKR: 'UA', ARE: 'AE', GBR: 'GB', USA: 'US', UMI: 'UM', URY: 'UY', UZB: 'UZ',
    VUT: 'VU', VEN: 'VE', VNM: 'VN', VGB: 'VG', VIR: 'VI',
    WLF: 'WF', ESH: 'EH',
    YEM: 'YE',
    ZMB: 'ZM', ZWE: 'ZW',
};

/**
 * IOC codes that differ from ISO 3166-1 (SUI, GER, NED, TPE …). RaceTiger sends
 * ISO, but entry lists imported from elsewhere often carry IOC, so accept both.
 */
const IOC_TO_ALPHA3: Record<string, string> = {
    ALG: 'DZA', ANG: 'AGO', ANT: 'ATG', ARU: 'ABW', ASA: 'ASM', BAH: 'BHS', BAN: 'BGD',
    BAR: 'BRB', BIZ: 'BLZ', BOT: 'BWA', BRU: 'BRN', BUL: 'BGR', BUR: 'BFA', CAM: 'KHM',
    CAY: 'CYM', CGO: 'COG', CHA: 'TCD', CHI: 'CHL', CRC: 'CRI', CRO: 'HRV', DEN: 'DNK',
    ESA: 'SLV', FIJ: 'FJI', GAM: 'GMB', GBS: 'GNB', GEQ: 'GNQ', GER: 'DEU', GRE: 'GRC',
    GRN: 'GRD', GUA: 'GTM', GUI: 'GIN', HAI: 'HTI', HON: 'HND', INA: 'IDN', IRI: 'IRN',
    ISV: 'VIR', IVB: 'VGB', KSA: 'SAU', KUW: 'KWT', LAT: 'LVA', LBA: 'LBY', LES: 'LSO',
    LIB: 'LBN', MAD: 'MDG', MAS: 'MYS', MAW: 'MWI', MGL: 'MNG', MON: 'MCO', MRI: 'MUS',
    MTN: 'MRT', MYA: 'MMR', NCA: 'NIC', NED: 'NLD', NEP: 'NPL', NGR: 'NGA', NIG: 'NER',
    OMA: 'OMN', PAR: 'PRY', PHI: 'PHL', PLE: 'PSE', POR: 'PRT', PUR: 'PRI', RSA: 'ZAF',
    SAM: 'WSM', SEY: 'SYC', SIN: 'SGP', SLO: 'SVN', SOL: 'SLB', SRI: 'LKA', SUD: 'SDN',
    SUI: 'CHE', TAN: 'TZA', TGA: 'TON', TPE: 'TWN', TRI: 'TTO', UAE: 'ARE', URU: 'URY',
    VAN: 'VUT', VIE: 'VNM', ZAM: 'ZMB', ZIM: 'ZWE',
};

/** Spelled-out names that turn up in hand-typed entry lists. */
const NAME_TO_ALPHA2: Record<string, string> = {
    THAILAND: 'TH', ไทย: 'TH', ประเทศไทย: 'TH',
    SINGAPORE: 'SG', MALAYSIA: 'MY', JAPAN: 'JP', CHINA: 'CN', TAIWAN: 'TW',
    LAOS: 'LA', VIETNAM: 'VN', CAMBODIA: 'KH', MYANMAR: 'MM', INDONESIA: 'ID',
    PHILIPPINES: 'PH', INDIA: 'IN', KOREA: 'KR', GERMANY: 'DE', FRANCE: 'FR',
};

/** Reverse of ALPHA3_TO_ALPHA2, built once — used by toAlpha3(). */
const ALPHA2_TO_ALPHA3: Record<string, string> = Object.fromEntries(
    Object.entries(ALPHA3_TO_ALPHA2).map(([alpha3, alpha2]) => [alpha2, alpha3]),
);

function alpha2ToFlag(alpha2: string): string {
    const upper = alpha2.toUpperCase();
    if (upper.length !== 2) return '';
    const cp1 = 0x1F1E6 + upper.charCodeAt(0) - 65;
    const cp2 = 0x1F1E6 + upper.charCodeAt(1) - 65;
    return String.fromCodePoint(cp1, cp2);
}

/** Any accepted spelling → ISO alpha-2, or '' when unrecognised. */
export function toAlpha2(code: string | undefined | null): string {
    const upper = String(code ?? '').trim().toUpperCase();
    if (!upper) return '';
    if (upper.length === 2) return /^[A-Z]{2}$/.test(upper) ? upper : '';
    if (upper.length === 3) {
        const viaIoc = IOC_TO_ALPHA3[upper];
        return ALPHA3_TO_ALPHA2[upper] || (viaIoc ? ALPHA3_TO_ALPHA2[viaIoc] || '' : '');
    }
    return NAME_TO_ALPHA2[upper.replace(/\s+/g, '')] || '';
}

/**
 * Any accepted spelling → ISO 3166-1 alpha-3 ("TH"/"THAILAND"/"THA" → "THA").
 * Result exports (ITRA and friends) require alpha-3, and entry lists carry a mix
 * of alpha-2, IOC codes and spelled-out names. Unrecognised values come back
 * upper-cased and unchanged so nothing silently disappears from an export.
 */
export function toAlpha3(code: string | undefined | null): string {
    const raw = String(code ?? '').trim().toUpperCase();
    if (!raw) return '';
    const alpha2 = toAlpha2(raw);
    return alpha2 ? (ALPHA2_TO_ALPHA3[alpha2] || raw) : raw;
}

/**
 * Convert any country code (alpha-2, alpha-3, or common name) to a flag emoji.
 * Returns empty string if unknown, so callers can fall back to the raw code.
 *
 * Note: Windows ships no flag glyphs, so these render there as the two boxed
 * letters ("TH") rather than a picture. iOS, Android and macOS show the flag.
 */
export function countryToFlag(code: string | undefined | null): string {
    const alpha2 = toAlpha2(code);
    return alpha2 ? alpha2ToFlag(alpha2) : '';
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

/** "Thailand" for "THA" — used for the hover title behind a bare flag. */
export function countryName(code: string | undefined | null, locale = 'en'): string {
    const raw = String(code ?? '').trim().toUpperCase();
    const alpha2 = toAlpha2(code);
    if (!alpha2) return raw;
    try {
        return new Intl.DisplayNames([locale], { type: 'region' }).of(alpha2) || raw;
    } catch {
        return raw;
    }
}
