// Admin-built award lists (/admin/award-builder).
//
// An award is a saved "query": one distance, one grouping (overall / per gender /
// per age group), a place count, the time to rank by, and the columns to show.
// Nothing about the ranking is stored — `computeCustomAward` rebuilds it from the
// live runner pool every time, so the list always reflects the real results.

import { buildCanonicalAgeGroups, canonicalizeAgeGroup } from './age-groups';
import { isThaiNationality } from './nationality';
import { formatTime } from './utils';

export type CustomAwardType = 'overall' | 'gender' | 'ageGroup';
export type CustomAwardRankBy = 'gun' | 'net';
/** Who may win: everyone, Thai runners only, or foreign runners only. */
export type CustomAwardNationality = 'all' | 'thai' | 'foreign';

export interface CustomAward {
    id: string;
    category: string;
    name: string;
    type: CustomAwardType;
    count: number;
    rankBy: CustomAwardRankBy;
    nationality: CustomAwardNationality;
    /** Ids of other awards (same distance) whose winners can't win this one —
     *  e.g. an age-group award that skips the Overall winners, so the next
     *  runner moves up instead. */
    excludeAwardIds: string[];
    personalFields: string[];
    splitFields: string[];
    /** Trophy on /admin/award-builder: this award's placings show in the
     *  "Awards" column on /event/[slug]. */
    showOnEvent?: boolean;
}

export type PersonalFieldGroup = 'athlete' | 'result';

export interface PersonalFieldDef {
    key: string;
    label: string;
    labelTh: string;
    group: PersonalFieldGroup;
}

/**
 * The columns of RaceTiger's athlete import template (Athlete-import-template-en.xlsx)
 * that the organizer wants on award lists, in the template's order. Chip/print codes,
 * ID, blood type, shirt, emergency contact, attribute, home group and PB were left out
 * on request. Keys saved by older templates that are no longer listed are dropped by
 * `normalizeCustomAwards`.
 */
export const ATHLETE_FIELDS: PersonalFieldDef[] = [
    { key: 'raceNo', label: 'RACENO', labelTh: 'ลำดับ (RaceNo)', group: 'athlete' },
    { key: 'bib', label: 'BIB', labelTh: 'BIB', group: 'athlete' },
    { key: 'name', label: 'NAME', labelTh: 'ชื่อ-นามสกุล', group: 'athlete' },
    { key: 'athleteType', label: 'ATHLETETYPE', labelTh: 'ประเภทนักกีฬา', group: 'athlete' },
    { key: 'gender', label: 'GENDER', labelTh: 'เพศ', group: 'athlete' },
    { key: 'phone', label: 'PHONE', labelTh: 'เบอร์โทร', group: 'athlete' },
    { key: 'birthDate', label: 'BIRTHDATE', labelTh: 'วันเกิด', group: 'athlete' },
    { key: 'age', label: 'AGE', labelTh: 'อายุ', group: 'athlete' },
    { key: 'waveName', label: 'WAVENAME', labelTh: 'รอบปล่อยตัว', group: 'athlete' },
    { key: 'categoryName', label: 'CATEGORYNAME', labelTh: 'ระยะ', group: 'athlete' },
    { key: 'category2Name', label: 'CATEGORY2NAME', labelTh: 'กลุ่มอายุ', group: 'athlete' },
    { key: 'teamName', label: 'TEAMNAME', labelTh: 'ทีม', group: 'athlete' },
    { key: 'countryRegion', label: 'COUNTRYREGION', labelTh: 'สัญชาติ', group: 'athlete' },
    { key: 'province', label: 'PROVINCE', labelTh: 'จังหวัด', group: 'athlete' },
    { key: 'city', label: 'CITY', labelTh: 'เมือง/อำเภอ', group: 'athlete' },
    { key: 'clubName', label: 'CLUBNAME', labelTh: 'ชมรม', group: 'athlete' },
    { key: 'firstName', label: 'FIRSTNAME', labelTh: 'ชื่อ', group: 'athlete' },
    { key: 'middleName', label: 'MIDDLENAME', labelTh: 'ชื่อกลาง', group: 'athlete' },
    { key: 'lastName', label: 'LASTNAME', labelTh: 'นามสกุล', group: 'athlete' },
    { key: 'subRace', label: 'SUBRACE', labelTh: 'รายการย่อย', group: 'athlete' },
];

export const RESULT_FIELDS: PersonalFieldDef[] = [
    { key: 'passedCount', label: 'Passed Count', labelTh: 'จำนวนจุดที่ผ่าน', group: 'result' },
    { key: 'finishTime', label: 'Finish Time', labelTh: 'เวลาเข้าเส้นชัย', group: 'result' },
    { key: 'gunTime', label: 'Gun Time', labelTh: 'Gun Time', group: 'result' },
    { key: 'netTime', label: 'Net Time', labelTh: 'Net Time', group: 'result' },
    { key: 'overallPos', label: 'Overall Pos.', labelTh: 'อันดับรวม (Gun)', group: 'result' },
    { key: 'genderPos', label: 'Gender Pos.', labelTh: 'อันดับเพศ (Gun)', group: 'result' },
    { key: 'netOverallPos', label: 'Net Overall Pos.', labelTh: 'อันดับรวม (Net)', group: 'result' },
    { key: 'netGenderPos', label: 'Net Gender Pos.', labelTh: 'อันดับเพศ (Net)', group: 'result' },
];

/** All tickable runner columns, athlete template first. */
export const PERSONAL_FIELDS: PersonalFieldDef[] = [...ATHLETE_FIELDS, ...RESULT_FIELDS];

/** Per-checkpoint columns the admin can tick under "Split times". */
export const SPLIT_FIELDS: { key: string; label: string; labelTh: string }[] = [
    { key: 'tpid', label: 'TPID', labelTh: 'TPID' },
    { key: 'tp', label: 'TP', labelTh: 'TP' },
    { key: 'tpName', label: 'TP Name', labelTh: 'ชื่อจุด' },
    { key: 'passTime', label: 'Pass Time', labelTh: 'เวลาผ่าน' },
    { key: 'gunTime', label: 'Gun Time', labelTh: 'Gun Time' },
    { key: 'netTime', label: 'Net Time', labelTh: 'Net Time' },
    { key: 'netPace', label: 'Net Pace', labelTh: 'Net Pace' },
    { key: 'splitTime', label: 'Split Time', labelTh: 'Split Time' },
    { key: 'splitPace', label: 'Split Pace', labelTh: 'Split Pace' },
    { key: 'legTime', label: 'Leg Time', labelTh: 'Leg Time' },
    { key: 'legPace', label: 'Leg Pace', labelTh: 'Leg Pace' },
];

export const DEFAULT_PERSONAL_FIELDS = ['bib', 'name', 'gender', 'gunTime', 'netTime'];

export const AWARD_TYPE_OPTIONS: { value: CustomAwardType; label: string; labelTh: string; defaultName: string }[] = [
    { value: 'overall', label: 'Overall (everyone)', labelTh: 'รวมทั้งหมด (Overall)', defaultName: 'Overall Result' },
    { value: 'gender', label: 'By gender', labelTh: 'แยกชาย/หญิง (Gender)', defaultName: 'Gender Result' },
    { value: 'ageGroup', label: 'By age group', labelTh: 'แยกกลุ่มอายุ (Age Group)', defaultName: 'Age Group Result' },
];

export const NATIONALITY_OPTIONS: { value: CustomAwardNationality; label: string; labelTh: string }[] = [
    { value: 'all', label: 'All nationalities', labelTh: 'ทุกสัญชาติ' },
    { value: 'thai', label: 'Thai only', labelTh: 'เฉพาะคนไทย' },
    { value: 'foreign', label: 'Foreign only', labelTh: 'เฉพาะต่างชาติ' },
];

export const MAX_AWARD_COUNT = 500;

const PERSONAL_KEYS = new Set(PERSONAL_FIELDS.map(f => f.key));
const SPLIT_KEYS = new Set(SPLIT_FIELDS.map(f => f.key));

export function newAwardId(): string {
    return `aw_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

/** Coerce whatever the campaign document holds into a well-formed award list. */
export function normalizeCustomAwards(raw: unknown): CustomAward[] {
    if (!Array.isArray(raw)) return [];
    const out: CustomAward[] = [];
    for (const item of raw) {
        if (!item || typeof item !== 'object') continue;
        const a = item as Partial<CustomAward>;
        if (!a.category || !a.name) continue;
        out.push({
            id: typeof a.id === 'string' && a.id ? a.id : newAwardId(),
            category: String(a.category),
            name: String(a.name),
            type: a.type === 'gender' || a.type === 'ageGroup' ? a.type : 'overall',
            count: clampAwardCount(a.count),
            rankBy: a.rankBy === 'net' ? 'net' : 'gun',
            nationality: a.nationality === 'thai' || a.nationality === 'foreign' ? a.nationality : 'all',
            excludeAwardIds: Array.isArray(a.excludeAwardIds)
                ? a.excludeAwardIds.filter((x): x is string => typeof x === 'string' && !!x && x !== a.id)
                : [],
            personalFields: Array.isArray(a.personalFields) && a.personalFields.length
                ? a.personalFields.filter((f): f is string => typeof f === 'string' && PERSONAL_KEYS.has(f))
                : [...DEFAULT_PERSONAL_FIELDS],
            splitFields: Array.isArray(a.splitFields)
                ? a.splitFields.filter((f): f is string => typeof f === 'string' && SPLIT_KEYS.has(f))
                : [],
            showOnEvent: a.showOnEvent === true,
        });
    }
    return out;
}

export function clampAwardCount(value: unknown): number {
    const n = Math.floor(Number(value));
    if (!Number.isFinite(n) || n < 1) return 1;
    return Math.min(MAX_AWARD_COUNT, n);
}

// ---------------------------------------------------------------------------
// Ranking
// ---------------------------------------------------------------------------

export interface CustomAwardRunner {
    _id: string;
    eventId?: string;
    bib: string;
    firstName?: string;
    lastName?: string;
    firstNameTh?: string;
    lastNameTh?: string;
    gender: string;
    ageGroup?: string;
    category?: string;
    status: string;
    phone?: string;
    idNo?: string;
    chipCode?: string;
    printingCode?: string;
    athleteId?: string;
    age?: number;
    birthDate?: string | Date;
    bloodType?: string;
    shirtSize?: string;
    team?: string;
    teamName?: string;
    nationality?: string;
    province?: string;
    emergencyContact?: string;
    emergencyPhone?: string;
    /** Raw scalar fields of the RaceTiger BIO row (set by sync). */
    raceTigerBio?: Record<string, string | number | boolean>;
    passedCount?: number;
    netTime?: number;
    gunTime?: number;
    elapsedTime?: number;
    netTimeStr?: string;
    gunTimeStr?: string;
    netPace?: string;
    gunPace?: string;
    finishTime?: string | number | Date;
    lastPassTime?: string | number | Date;
    scanTime?: string | number | Date;
}

export interface RankedAwardRunner {
    runner: CustomAwardRunner;
    /** 1-based place inside its award group. */
    place: number;
    /** Time used for the ranking (ms). */
    rankTime: number;
    // Pool-wide placings (same distance), all four computed here so the columns
    // never depend on possibly-stale synced ranks.
    overallPos: number;
    genderPos: number;
    netOverallPos: number;
    netGenderPos: number;
}

export interface CustomAwardGroup {
    key: string;
    label: string;
    labelTh: string;
    runners: RankedAwardRunner[];
}

export interface ComputeAwardOptions {
    /** `false` on campaigns whose genders race together (dog races etc.) —
     *  the age-group award then takes the whole field, not per gender. */
    genderSplitEnabled?: boolean;
    /** Every saved award of the campaign — needed to resolve `excludeAwardIds`. */
    allAwards?: CustomAward[];
}

/** Nationality as the athlete template has it (COUNTRYREGION), runner field first. */
export function runnerNationality(r: CustomAwardRunner): string {
    return r.nationality || bioValue(r, ['CountryRegion', 'Country', 'Nationality']);
}

function matchesNationality(r: CustomAwardRunner, filter: CustomAwardNationality): boolean {
    if (filter === 'all') return true;
    const thai = isThaiNationality(runnerNationality(r));
    return filter === 'thai' ? thai : !thai;
}

const gunTimeOf = (r: CustomAwardRunner) => r.gunTime || r.netTime || r.elapsedTime || Infinity;
const netTimeOf = (r: CustomAwardRunner) => r.netTime || r.gunTime || r.elapsedTime || Infinity;

const finishMsOf = (r: CustomAwardRunner) => {
    const v = r.finishTime ?? r.scanTime ?? r.lastPassTime;
    if (v == null || v === '') return Infinity;
    const t = typeof v === 'number' ? v : new Date(v).getTime();
    return Number.isFinite(t) && t > 0 ? t : Infinity;
};

const bibCompare = (a: CustomAwardRunner, b: CustomAwardRunner) =>
    String(a.bib || '').localeCompare(String(b.bib || ''), undefined, { numeric: true });

// Same tie-break chain as lib/awards.ts: time, then who crossed the line first, then bib.
const makeComparator = (timeOf: (r: CustomAwardRunner) => number) =>
    (a: CustomAwardRunner, b: CustomAwardRunner) => {
        const t = timeOf(a) - timeOf(b);
        if (t !== 0) return t;
        const f = finishMsOf(a) - finishMsOf(b);
        if (f !== 0) return f;
        return bibCompare(a, b);
    };

const compareByGun = makeComparator(gunTimeOf);
const compareByNet = makeComparator(netTimeOf);

export function isFinisher(r: CustomAwardRunner): boolean {
    return r.status === 'finished' && !!(r.netTime || r.gunTime || r.elapsedTime);
}

function genderKey(g?: string): 'M' | 'F' {
    return String(g || '').toUpperCase().startsWith('F') ? 'F' : 'M';
}

function positionMaps(finishers: CustomAwardRunner[]) {
    const byGun = [...finishers].sort(compareByGun);
    const byNet = [...finishers].sort(compareByNet);
    const overall = new Map<string, number>();
    const gender = new Map<string, number>();
    const netOverall = new Map<string, number>();
    const netGender = new Map<string, number>();
    const gCount: Record<string, number> = { M: 0, F: 0 };
    const ngCount: Record<string, number> = { M: 0, F: 0 };
    byGun.forEach((r, i) => {
        overall.set(r._id, i + 1);
        const g = genderKey(r.gender);
        gCount[g] += 1;
        gender.set(r._id, gCount[g]);
    });
    byNet.forEach((r, i) => {
        netOverall.set(r._id, i + 1);
        const g = genderKey(r.gender);
        ngCount[g] += 1;
        netGender.set(r._id, ngCount[g]);
    });
    return { overall, gender, netOverall, netGender };
}

/**
 * Rank the finishers of ONE distance pool for the given award. Runners passed in
 * must already share the award's category. Returns one group per award bucket
 * (a single group for `overall`, M/F for `gender`, gender × age group for `ageGroup`).
 */
export function computeCustomAward(
    pool: CustomAwardRunner[],
    award: CustomAward,
    opts: ComputeAwardOptions = {},
): CustomAwardGroup[] {
    return computeWithExclusions(pool, award, opts, new Set([award.id]));
}

/** Runner ids that won any of `award.excludeAwardIds` (resolved recursively, cycle-safe). */
function excludedRunnerIds(
    pool: CustomAwardRunner[],
    award: CustomAward,
    opts: ComputeAwardOptions,
    visiting: Set<string>,
): Set<string> {
    const out = new Set<string>();
    if (!award.excludeAwardIds?.length || !opts.allAwards?.length) return out;
    const sameCat = (c: string) => c.trim().toLowerCase() === award.category.trim().toLowerCase();
    for (const id of award.excludeAwardIds) {
        if (visiting.has(id)) continue;
        const other = opts.allAwards.find(a => a.id === id);
        // Only awards of the same distance — `pool` is that distance's runners.
        if (!other || !sameCat(other.category)) continue;
        const groups = computeWithExclusions(pool, other, opts, new Set([...visiting, id]));
        for (const g of groups) for (const row of g.runners) out.add(row.runner._id);
    }
    return out;
}

function computeWithExclusions(
    pool: CustomAwardRunner[],
    award: CustomAward,
    opts: ComputeAwardOptions,
    visiting: Set<string>,
): CustomAwardGroup[] {
    // Pool-wide positions use every finisher; the filters below only decide who can win.
    const allFinishers = pool.filter(isFinisher);
    const excluded = excludedRunnerIds(pool, award, opts, visiting);
    const nationality = award.nationality || 'all';
    const finishers = allFinishers.filter(r => !excluded.has(r._id) && matchesNationality(r, nationality));
    const compare = award.rankBy === 'net' ? compareByNet : compareByGun;
    const timeOf = award.rankBy === 'net' ? netTimeOf : gunTimeOf;
    const pos = positionMaps(allFinishers);
    const count = clampAwardCount(award.count);
    const genderSplit = opts.genderSplitEnabled !== false;

    const decorate = (list: CustomAwardRunner[]): RankedAwardRunner[] =>
        [...list].sort(compare).slice(0, count).map((runner, i) => ({
            runner,
            place: i + 1,
            rankTime: timeOf(runner),
            overallPos: pos.overall.get(runner._id) || 0,
            genderPos: pos.gender.get(runner._id) || 0,
            netOverallPos: pos.netOverall.get(runner._id) || 0,
            netGenderPos: pos.netGender.get(runner._id) || 0,
        }));

    const genderGroups = (list: CustomAwardRunner[], keyPrefix: string, labelPrefix: string, labelPrefixTh: string): CustomAwardGroup[] => {
        const males = list.filter(r => genderKey(r.gender) === 'M');
        const females = list.filter(r => genderKey(r.gender) === 'F');
        return [
            { key: `${keyPrefix}M`, label: `${labelPrefix}Male`, labelTh: `${labelPrefixTh}ชาย`, runners: decorate(males) },
            { key: `${keyPrefix}F`, label: `${labelPrefix}Female`, labelTh: `${labelPrefixTh}หญิง`, runners: decorate(females) },
        ];
    };

    if (award.type === 'overall') {
        return [{ key: 'overall', label: 'Overall', labelTh: 'รวมทั้งหมด', runners: decorate(finishers) }];
    }

    if (award.type === 'gender') {
        return genderGroups(finishers, 'gender:', '', '');
    }

    // Age group: bucket labels are unified across spellings ("30-39" vs "30 - 39").
    const { buckets, canonicalLabelOf } = buildCanonicalAgeGroups(finishers.map(r => r.ageGroup));
    const byBucket = new Map<string, CustomAwardRunner[]>();
    for (const r of finishers) {
        const label = canonicalizeAgeGroup(r.ageGroup, canonicalLabelOf);
        if (!label) continue;
        const list = byBucket.get(label) || [];
        list.push(r);
        byBucket.set(label, list);
    }
    const orderedLabels = buckets.map(b => b.label);
    for (const label of byBucket.keys()) if (!orderedLabels.includes(label)) orderedLabels.push(label);

    const groups: CustomAwardGroup[] = [];
    for (const label of orderedLabels) {
        const list = byBucket.get(label) || [];
        if (genderSplit) {
            groups.push(...genderGroups(list, `age:${label}:`, `${label} · `, `${label} · `));
        } else {
            groups.push({ key: `age:${label}`, label, labelTh: label, runners: decorate(list) });
        }
    }
    return groups;
}

export function runnerDisplayName(r: CustomAwardRunner, language: 'th' | 'en'): string {
    const th = [r.firstNameTh, r.lastNameTh].filter(Boolean).join(' ').trim();
    const en = [r.firstName, r.lastName].filter(Boolean).join(' ').trim();
    if (language === 'th') return th || en || '-';
    return en || th || '-';
}

// ---------------------------------------------------------------------------
// Column values
// ---------------------------------------------------------------------------

const normKey = (k: string) => k.toLowerCase().replace(/[^a-z0-9]+/g, '');

/** First non-empty BIO value whose key matches one of `aliases` (case/underscore-insensitive). */
export function bioValue(r: CustomAwardRunner, aliases: string[]): string {
    const bio = r.raceTigerBio;
    if (!bio) return '';
    const wanted = aliases.map(normKey);
    const byKey = new Map<string, string | number | boolean>();
    for (const [k, v] of Object.entries(bio)) byKey.set(normKey(k), v);
    for (const w of wanted) {
        const v = byKey.get(w);
        if (v !== undefined && v !== null && String(v).trim() !== '') return String(v).trim();
    }
    return '';
}

// RaceTiger's default wave is sent in Chinese.
const WAVE_TRANSLATIONS: Record<string, { th: string; en: string }> = {
    '默认批次': { th: 'รอบปกติ', en: 'Default' },
};

const dateOnly = (v?: string | Date | null) => {
    if (!v) return '';
    const d = new Date(v);
    if (Number.isNaN(d.getTime())) return String(v);
    return d.toISOString().slice(0, 10);
};

const clock = (v?: string | number | Date | null) => {
    if (v == null || v === '') return '';
    const d = new Date(v);
    if (Number.isNaN(d.getTime())) return '';
    return d.toLocaleString('th-TH', { hour12: false, day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' });
};

/**
 * Value of one tickable column for a ranked runner, as plain text/number — shared by
 * the on-screen table and the Excel export so both always show the same thing.
 * Dedicated runner fields win; the raw RaceTiger BIO row fills the columns we have
 * no field for (wave, city, spare chips, club, ...). Empty string = no data.
 */
export function personalFieldValue(key: string, row: RankedAwardRunner, language: 'th' | 'en'): string | number {
    const r = row.runner;
    const th = language === 'th';
    switch (key) {
        case 'raceNo': return bioValue(r, ['RaceNo', 'RaceNumber']) || r.athleteId || bioValue(r, ['AthleteId']);
        case 'bib': return r.bib || '';
        case 'name': return runnerDisplayName(r, language) === '-' ? '' : runnerDisplayName(r, language);
        case 'athleteType': return bioValue(r, ['AthleteType', 'AthleteTypeName', 'Type']);
        case 'gender': {
            const g = String(r.gender || '').toUpperCase();
            if (!g) return '';
            return g.startsWith('F') ? (th ? 'หญิง' : 'F') : (th ? 'ชาย' : 'M');
        }
        case 'phone': return r.phone || bioValue(r, ['Phone', 'Mobile', 'Tel']);
        case 'birthDate': return dateOnly(r.birthDate) || bioValue(r, ['Birthday', 'BirthDate']);
        case 'age': return r.age ?? bioValue(r, ['Age']);
        case 'waveName': {
            const w = bioValue(r, ['WaveName', 'Wave', 'Batch', 'BatchName']);
            const t = WAVE_TRANSLATIONS[w];
            return t ? (th ? t.th : t.en) : w;
        }
        case 'categoryName': return r.category || bioValue(r, ['CategoryName', 'Category', 'EventName']);
        case 'category2Name': return r.ageGroup || bioValue(r, ['Category2Name', 'Category2', 'AgeGroup']);
        case 'teamName': return r.teamName || r.team || bioValue(r, ['TeamName', 'Team']);
        case 'countryRegion': return r.nationality || bioValue(r, ['CountryRegion', 'Country', 'Nationality']);
        case 'province': return r.province || bioValue(r, ['Province', 'State']);
        case 'city': return bioValue(r, ['City', 'CityName']);
        case 'clubName': return bioValue(r, ['ClubName', 'Club']);
        case 'firstName': return (th ? r.firstNameTh || r.firstName : r.firstName || r.firstNameTh) || bioValue(r, ['FirstName']);
        case 'middleName': return bioValue(r, ['MiddleName']);
        case 'lastName': return (th ? r.lastNameTh || r.lastName : r.lastName || r.lastNameTh) || bioValue(r, ['LastName']);
        case 'subRace': return bioValue(r, ['SubRace', 'SubRaceName']);
        case 'passedCount': return r.passedCount ?? '';
        case 'finishTime': return clock(r.finishTime ?? r.lastPassTime);
        case 'netTime': return r.netTime ? formatTime(r.netTime) : (r.netTimeStr || '');
        case 'gunTime': return r.gunTime ? formatTime(r.gunTime) : (r.gunTimeStr || '');
        case 'overallPos': return row.overallPos || '';
        case 'genderPos': return row.genderPos || '';
        case 'netOverallPos': return row.netOverallPos || '';
        case 'netGenderPos': return row.netGenderPos || '';
        default: return '';
    }
}

// ---------------------------------------------------------------------------
// Split columns
// ---------------------------------------------------------------------------

export interface AwardTimingRecord {
    _id: string;
    checkpoint: string;
    order?: number;
    splitNo?: number;
    splitDesc?: string;
    scanTime?: string;
    gunTime?: number;
    netTime?: number;
    gunTimeMs?: number;
    netTimeMs?: number;
    totalGunTime?: number;
    totalNetTime?: number;
    elapsedTime?: number;
    netPace?: string;
    gunPace?: string;
    splitTime?: number;
    splitPace?: string;
    legTime?: number;
    legPace?: string;
}

const msText = (ms?: number) => (ms ? formatTime(ms) : '');

export function splitFieldValue(key: string, rec: AwardTimingRecord): string | number {
    switch (key) {
        case 'tpid': return rec.splitNo ?? rec.order ?? '';
        case 'tp': return rec.checkpoint || '';
        case 'tpName': return rec.splitDesc || rec.checkpoint || '';
        case 'passTime': return clock(rec.scanTime);
        case 'gunTime': return msText(rec.totalGunTime || rec.gunTime || rec.gunTimeMs);
        case 'netTime': return msText(rec.totalNetTime || rec.netTime || rec.netTimeMs || rec.elapsedTime);
        case 'netPace': return rec.netPace || '';
        case 'splitTime': return msText(rec.splitTime);
        case 'splitPace': return rec.splitPace || '';
        case 'legTime': return msText(rec.legTime);
        case 'legPace': return rec.legPace || '';
        default: return '';
    }
}

// ---------------------------------------------------------------------------
// Excel export
// ---------------------------------------------------------------------------

// Split columns that describe the checkpoint itself — in the wide Excel layout the
// checkpoint is already in the column header, so these add nothing.
const CHECKPOINT_IDENTITY_SPLIT_KEYS = new Set(['tpid', 'tp', 'tpName']);

/**
 * One sheet, one row per winner: group, place, the ticked runner columns, then for
 * every checkpoint the ticked split columns ("CP1 Net Time", "CP1 Split Time", ...).
 * `splits` maps runnerId → that runner's timing records (only needed when split
 * columns are ticked).
 */
export async function downloadCustomAwardExcel(opts: {
    award: CustomAward;
    groups: CustomAwardGroup[];
    language: 'th' | 'en';
    eventName: string;
    splits?: Record<string, AwardTimingRecord[]>;
}): Promise<void> {
    const XLSX = await import('xlsx');
    const { award, groups, language, eventName, splits = {} } = opts;
    const th = language === 'th';
    const cols = PERSONAL_FIELDS.filter(f => award.personalFields.includes(f.key));
    const splitCols = SPLIT_FIELDS.filter(f => award.splitFields.includes(f.key) && !CHECKPOINT_IDENTITY_SPLIT_KEYS.has(f.key));

    // Checkpoint order across every winner: by the record's order/split number, first seen wins.
    const cpOrder = new Map<string, number>();
    if (splitCols.length) {
        for (const g of groups) for (const row of g.runners) {
            for (const rec of splits[row.runner._id] || []) {
                const name = String(rec.checkpoint || '').trim();
                if (!name) continue;
                const rank = rec.splitNo ?? rec.order ?? 999;
                if (!cpOrder.has(name) || rank < (cpOrder.get(name) as number)) cpOrder.set(name, rank);
            }
        }
    }
    const checkpoints = [...cpOrder.entries()].sort((a, b) => a[1] - b[1]).map(([n]) => n);

    const showGroup = award.type !== 'overall';
    const header: string[] = [
        ...(showGroup ? [th ? 'กลุ่ม' : 'Group'] : []),
        th ? 'อันดับ' : 'Place',
        ...cols.map(c => c.label),
        ...checkpoints.flatMap(cp => splitCols.map(sc => `${cp} ${sc.label}`)),
    ];

    const rows: (string | number)[][] = [];
    for (const g of groups) {
        for (const row of g.runners) {
            const recByCp = new Map<string, AwardTimingRecord>();
            for (const rec of splits[row.runner._id] || []) {
                const name = String(rec.checkpoint || '').trim();
                if (name && !recByCp.has(name)) recByCp.set(name, rec);
            }
            rows.push([
                ...(showGroup ? [th ? g.labelTh : g.label] : []),
                row.place,
                ...cols.map(c => personalFieldValue(c.key, row, language)),
                ...checkpoints.flatMap(cp => {
                    const rec = recByCp.get(cp);
                    return splitCols.map(sc => (rec ? splitFieldValue(sc.key, rec) : ''));
                }),
            ]);
        }
    }

    const title = [`${eventName} — ${award.category} — ${award.name}`];
    const ws = XLSX.utils.aoa_to_sheet([title, [], header, ...rows]);
    ws['!cols'] = header.map((h, i) => {
        const longest = Math.max(String(h).length, ...rows.map(r => String(r[i] ?? '').length));
        return { wch: Math.min(40, Math.max(6, longest + 2)) };
    });
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, award.name.replace(/[\\/?*[\]:]/g, ' ').slice(0, 31) || 'Award');
    const safe = (v: string) => v.replace(/[\\/:*?"<>|]+/g, ' ').trim();
    XLSX.writeFile(wb, `${safe(award.category)} - ${safe(award.name)} - ${new Date().toISOString().slice(0, 10)}.xlsx`);
}
