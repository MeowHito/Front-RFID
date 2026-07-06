// Canonical list of Thailand's 77 provinces (Thai + RTGS English name), plus a
// free-text matcher used by the "Best of Province" award. Config stores the Thai
// name (`th`) as the canonical key; runner.province / address from RaceTiger is
// free-text, so matching is done by substring against Thai + English tokens.

export interface ThaiProvince {
    /** Canonical Thai name — the value persisted in campaign.bestOfProvinces[].province */
    th: string;
    /** RTGS English name (for the picker label + English data matching) */
    en: string;
}

export const THAI_PROVINCES: ThaiProvince[] = [
    { th: 'กระบี่', en: 'Krabi' },
    { th: 'กรุงเทพมหานคร', en: 'Bangkok' },
    { th: 'กาญจนบุรี', en: 'Kanchanaburi' },
    { th: 'กาฬสินธุ์', en: 'Kalasin' },
    { th: 'กำแพงเพชร', en: 'Kamphaeng Phet' },
    { th: 'ขอนแก่น', en: 'Khon Kaen' },
    { th: 'จันทบุรี', en: 'Chanthaburi' },
    { th: 'ฉะเชิงเทรา', en: 'Chachoengsao' },
    { th: 'ชลบุรี', en: 'Chon Buri' },
    { th: 'ชัยนาท', en: 'Chai Nat' },
    { th: 'ชัยภูมิ', en: 'Chaiyaphum' },
    { th: 'ชุมพร', en: 'Chumphon' },
    { th: 'เชียงราย', en: 'Chiang Rai' },
    { th: 'เชียงใหม่', en: 'Chiang Mai' },
    { th: 'ตรัง', en: 'Trang' },
    { th: 'ตราด', en: 'Trat' },
    { th: 'ตาก', en: 'Tak' },
    { th: 'นครนายก', en: 'Nakhon Nayok' },
    { th: 'นครปฐม', en: 'Nakhon Pathom' },
    { th: 'นครพนม', en: 'Nakhon Phanom' },
    { th: 'นครราชสีมา', en: 'Nakhon Ratchasima' },
    { th: 'นครศรีธรรมราช', en: 'Nakhon Si Thammarat' },
    { th: 'นครสวรรค์', en: 'Nakhon Sawan' },
    { th: 'นนทบุรี', en: 'Nonthaburi' },
    { th: 'นราธิวาส', en: 'Narathiwat' },
    { th: 'น่าน', en: 'Nan' },
    { th: 'บึงกาฬ', en: 'Bueng Kan' },
    { th: 'บุรีรัมย์', en: 'Buri Ram' },
    { th: 'ปทุมธานี', en: 'Pathum Thani' },
    { th: 'ประจวบคีรีขันธ์', en: 'Prachuap Khiri Khan' },
    { th: 'ปราจีนบุรี', en: 'Prachin Buri' },
    { th: 'ปัตตานี', en: 'Pattani' },
    { th: 'พระนครศรีอยุธยา', en: 'Phra Nakhon Si Ayutthaya' },
    { th: 'พะเยา', en: 'Phayao' },
    { th: 'พังงา', en: 'Phangnga' },
    { th: 'พัทลุง', en: 'Phatthalung' },
    { th: 'พิจิตร', en: 'Phichit' },
    { th: 'พิษณุโลก', en: 'Phitsanulok' },
    { th: 'เพชรบุรี', en: 'Phetchaburi' },
    { th: 'เพชรบูรณ์', en: 'Phetchabun' },
    { th: 'แพร่', en: 'Phrae' },
    { th: 'ภูเก็ต', en: 'Phuket' },
    { th: 'มหาสารคาม', en: 'Maha Sarakham' },
    { th: 'มุกดาหาร', en: 'Mukdahan' },
    { th: 'แม่ฮ่องสอน', en: 'Mae Hong Son' },
    { th: 'ยโสธร', en: 'Yasothon' },
    { th: 'ยะลา', en: 'Yala' },
    { th: 'ร้อยเอ็ด', en: 'Roi Et' },
    { th: 'ระนอง', en: 'Ranong' },
    { th: 'ระยอง', en: 'Rayong' },
    { th: 'ราชบุรี', en: 'Ratchaburi' },
    { th: 'ลพบุรี', en: 'Lopburi' },
    { th: 'ลำปาง', en: 'Lampang' },
    { th: 'ลำพูน', en: 'Lamphun' },
    { th: 'เลย', en: 'Loei' },
    { th: 'ศรีสะเกษ', en: 'Si Sa Ket' },
    { th: 'สกลนคร', en: 'Sakon Nakhon' },
    { th: 'สงขลา', en: 'Songkhla' },
    { th: 'สตูล', en: 'Satun' },
    { th: 'สมุทรปราการ', en: 'Samut Prakan' },
    { th: 'สมุทรสงคราม', en: 'Samut Songkhram' },
    { th: 'สมุทรสาคร', en: 'Samut Sakhon' },
    { th: 'สระแก้ว', en: 'Sa Kaeo' },
    { th: 'สระบุรี', en: 'Saraburi' },
    { th: 'สิงห์บุรี', en: 'Sing Buri' },
    { th: 'สุโขทัย', en: 'Sukhothai' },
    { th: 'สุพรรณบุรี', en: 'Suphan Buri' },
    { th: 'สุราษฎร์ธานี', en: 'Surat Thani' },
    { th: 'สุรินทร์', en: 'Surin' },
    { th: 'หนองคาย', en: 'Nong Khai' },
    { th: 'หนองบัวลำภู', en: 'Nong Bua Lam Phu' },
    { th: 'อ่างทอง', en: 'Ang Thong' },
    { th: 'อำนาจเจริญ', en: 'Amnat Charoen' },
    { th: 'อุดรธานี', en: 'Udon Thani' },
    { th: 'อุตรดิตถ์', en: 'Uttaradit' },
    { th: 'อุทัยธานี', en: 'Uthai Thani' },
    { th: 'อุบลราชธานี', en: 'Ubon Ratchathani' },
];

const PROVINCE_BY_TH = new Map<string, ThaiProvince>(THAI_PROVINCES.map(p => [p.th, p]));

/** English name for a canonical Thai province name (falls back to the Thai name). */
export function provinceEnName(th: string): string {
    return PROVINCE_BY_TH.get(th)?.en ?? th;
}

// Build substring-match tokens for a province: Thai name + English (spaced +
// unspaced), lowercased. Latin tokens shorter than 4 chars (e.g. "nan", "tak")
// are skipped to avoid false positives; the Thai token still matches Thai data.
function provinceTokens(p: ThaiProvince): string[] {
    const tokens = new Set<string>();
    tokens.add(p.th);
    const en = p.en.toLowerCase().trim();
    if (en.length >= 4) tokens.add(en);
    const enNoSpace = en.replace(/\s+/g, '');
    if (enNoSpace.length >= 4) tokens.add(enNoSpace);
    return [...tokens];
}

const TOKENS_BY_TH = new Map<string, string[]>(THAI_PROVINCES.map(p => [p.th, provinceTokens(p)]));

/**
 * True when any of the given free-text location values (e.g. runner.province,
 * runner.address) indicates residence in the given canonical Thai province.
 * Mirrors the substring approach of the legacy Buriram matcher, generalized.
 */
export function matchesProvince(canonicalTh: string, ...values: (string | null | undefined)[]): boolean {
    const tokens = TOKENS_BY_TH.get(canonicalTh) ?? [String(canonicalTh || '').trim()].filter(Boolean);
    if (tokens.length === 0) return false;
    const normValues = values.map(v => String(v ?? '').trim().toLowerCase()).filter(Boolean);
    if (normValues.length === 0) return false;
    return normValues.some(val => tokens.some(tok => val.includes(tok.toLowerCase())));
}

export interface ProvinceAwardRunner {
    _id: string;
    gender: string;
    status: string;
    netTime?: number;
    gunTime?: number;
    elapsedTime?: number;
    province?: string;
    address?: string;
}

export interface ProvinceConfig {
    province: string;
    count: number;
}

/**
 * "Best of Province" award label for a single runner, or null if not a winner.
 * For each configured province, the top `count` fastest male and female finishers
 * residing there win. Mirrors the Best-Of-Winners board so the board, e-slip and
 * certificate badges always agree. The label uses the English province name to match
 * the existing "Best of Buriram" convention (e.g. "Best of Rayong").
 *
 * @param pool all runners in the runner's category (the ranking pool)
 */
export function bestOfProvinceAwardFor(
    runnerId: string,
    pool: ProvinceAwardRunner[],
    enabled: boolean,
    provinces: ProvinceConfig[] | undefined | null,
): string | null {
    if (!enabled || !Array.isArray(provinces) || provinces.length === 0) return null;
    const timeMs = (r: ProvinceAwardRunner) => r.netTime || r.gunTime || r.elapsedTime || Infinity;
    for (const cfg of provinces) {
        if (!cfg?.province) continue;
        const n = Math.max(1, Number(cfg.count) || 1);
        const sorted = pool
            .filter(r => r.status === 'finished' && (r.netTime || r.gunTime || r.elapsedTime) && matchesProvince(cfg.province, r.province, r.address))
            .sort((a, b) => timeMs(a) - timeMs(b));
        const winners = new Set<string>();
        sorted.filter(r => r.gender !== 'F').slice(0, n).forEach(r => winners.add(r._id));
        sorted.filter(r => r.gender === 'F').slice(0, n).forEach(r => winners.add(r._id));
        if (winners.has(runnerId)) return `Best of ${provinceEnName(cfg.province)}`;
    }
    return null;
}
