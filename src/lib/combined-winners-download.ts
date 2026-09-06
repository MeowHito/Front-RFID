// Shared "download every distance in one file" helper for the flat (non
// age-group) winners boards: Overall-Winners, Top-Overall-Winners,
// Best-Of-Winners, Nationality-Winners. Each of those pages already computes
// its own male/female winner list for the *currently selected* distance —
// this fetches every other distance's runners, re-runs that same
// computation per distance, and combines everything into one Excel file
// with each distance printed on its own page.

import { buildWinnersExcel, triggerExcelDownload, type ExcelRunner, type ExcelSection } from './winner-excel';

// Campaigns with the gender split turned off print ONE block per section instead of
// a male and a female one. The Excel builder's single-gender layout already draws
// exactly that, so those boards reuse it with a neutral bar label/colour and put
// every winner in `maleRunners`.
export const COMBINED_EXCEL_LABEL = '🏅  WINNERS';
export const COMBINED_EXCEL_COLOR = '059669';

function excelArgs(gender: 'male' | 'female' | 'both', nameLang: 'th' | 'en', combined?: boolean) {
    return combined
        ? { gender: 'male' as const, opts: { nameLang, combinedLabel: COMBINED_EXCEL_LABEL, barColor: COMBINED_EXCEL_COLOR } }
        : { gender, opts: { nameLang } };
}

/** Male/Female filename suffix — dropped entirely on combined (no-split) boards. */
function genderFileSuffix(gender: 'male' | 'female' | 'both', combined?: boolean) {
    if (combined) return '';
    return gender === 'male' ? '-Male' : gender === 'female' ? '-Female' : '';
}

export interface CampaignCategoryLike {
    name: string;
    distance?: string;
}

export async function downloadAllDistances<T extends ExcelRunner>(params: {
    campaignId: string;
    campaignName: string;
    categories: CampaignCategoryLike[];
    selectedCategory: string;
    currentRunners: T[];
    gender: 'male' | 'female' | 'both';
    nameLang: 'th' | 'en';
    /** Short label for the filename, e.g. "Overall", "BestOf", "Nationality". */
    filePartLabel: string;
    /** `true` when the campaign has no gender split — prints one combined block per
     *  distance (every winner passed in `maleRunners`) instead of male + female. */
    combined?: boolean;
    /** Same winners logic the page already uses for the on-screen display, applied per distance. */
    computeWinners: (runners: T[], categoryName: string) => { maleRunners: T[]; femaleRunners: T[]; rankOffset?: number };
}): Promise<Blob | null> {
    const { campaignId, campaignName, categories, selectedCategory, currentRunners, gender, nameLang, combined, computeWinners } = params;
    const categoriesToUse = categories.length ? categories : [{ name: selectedCategory, distance: undefined }];

    const sections: ExcelSection[] = await Promise.all(categoriesToUse.map(async (cat): Promise<ExcelSection> => {
        let runnersForCat: T[];
        if (cat.name === selectedCategory) {
            runnersForCat = currentRunners;
        } else {
            const p = new URLSearchParams({ campaignId, category: cat.name, limit: '10000', skipStatusCounts: 'true' });
            const res = await fetch(`/api/runners/paged?${p.toString()}`, { cache: 'no-store' });
            runnersForCat = res.ok ? (await res.json()).data || [] : [];
        }
        const { maleRunners, femaleRunners, rankOffset } = computeWinners(runnersForCat, cat.name);
        const distanceSuffix = cat.distance ? ` (${cat.distance})` : '';
        return { categoryLabel: `${cat.name}${distanceSuffix}`, maleRunners, femaleRunners, rankOffset };
    }));

    return buildWinnersExcel(campaignName, '', sections, gender, { nameLang });
}

export function triggerCombinedDownload(blob: Blob | null, campaignName: string, filePartLabel: string, gender: 'male' | 'female' | 'both') {
    if (!blob) return;
    const suffix = gender === 'male' ? '-Male' : gender === 'female' ? '-Female' : '';
    triggerExcelDownload(blob, `${campaignName || 'winners'}-${filePartLabel}-AllDistances${suffix}`);
}

// Per-board / per-column download: exports ONLY the currently-selected distance,
// not every distance in the campaign. Reuses the runners already loaded on the
// page for the selected category, so it never fetches — and never mixes in other
// distances (e.g. a 21K download must not include 10K rows).
export async function downloadSelectedDistance<T extends ExcelRunner>(params: {
    campaignName: string;
    selectedCategory: string;
    distance?: string;
    currentRunners: T[];
    gender: 'male' | 'female' | 'both';
    nameLang: 'th' | 'en';
    /** `true` when the campaign has no gender split — see `downloadAllDistances`. */
    combined?: boolean;
    computeWinners: (runners: T[], categoryName: string) => { maleRunners: T[]; femaleRunners: T[]; rankOffset?: number };
}): Promise<Blob | null> {
    const { campaignName, selectedCategory, distance, currentRunners, gender, nameLang, combined, computeWinners } = params;
    const { maleRunners, femaleRunners, rankOffset } = computeWinners(currentRunners, selectedCategory);
    const distanceSuffix = distance ? ` (${distance})` : '';
    const sections: ExcelSection[] = [{ categoryLabel: `${selectedCategory}${distanceSuffix}`, maleRunners, femaleRunners, rankOffset }];
    const { gender: g, opts } = excelArgs(gender, nameLang, combined);
    return buildWinnersExcel(campaignName, '', sections, g, opts);
}

export function triggerSingleDistanceDownload(
    blob: Blob | null,
    campaignName: string,
    filePartLabel: string,
    selectedCategory: string,
    distance: string | undefined,
    gender: 'male' | 'female' | 'both',
    combined?: boolean,
) {
    if (!blob) return;
    const suffix = genderFileSuffix(gender, combined);
    const distPart = distance ? `-${distance}` : (selectedCategory ? `-${selectedCategory}` : '');
    triggerExcelDownload(blob, `${campaignName || 'winners'}-${filePartLabel}${distPart}${suffix}`);
}
