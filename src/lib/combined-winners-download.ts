// Shared "download every distance in one file" helper for the flat (non
// age-group) winners boards: Overall-Winners, Top-Overall-Winners,
// Best-Of-Winners, Nationality-Winners. Each of those pages already computes
// its own male/female winner list for the *currently selected* distance —
// this fetches every other distance's runners, re-runs that same
// computation per distance, and combines everything into one Excel file
// with each distance printed on its own page.

import { buildWinnersExcel, triggerExcelDownload, type ExcelRunner, type ExcelSection } from './winner-excel';

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
    /** Same winners logic the page already uses for the on-screen display, applied per distance. */
    computeWinners: (runners: T[], categoryName: string) => { maleRunners: T[]; femaleRunners: T[] };
}): Promise<Blob | null> {
    const { campaignId, campaignName, categories, selectedCategory, currentRunners, gender, nameLang, computeWinners } = params;
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
        const { maleRunners, femaleRunners } = computeWinners(runnersForCat, cat.name);
        const distanceSuffix = cat.distance ? ` (${cat.distance})` : '';
        return { categoryLabel: `${cat.name}${distanceSuffix}`, maleRunners, femaleRunners };
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
    computeWinners: (runners: T[], categoryName: string) => { maleRunners: T[]; femaleRunners: T[] };
}): Promise<Blob | null> {
    const { campaignName, selectedCategory, distance, currentRunners, gender, nameLang, computeWinners } = params;
    const { maleRunners, femaleRunners } = computeWinners(currentRunners, selectedCategory);
    const distanceSuffix = distance ? ` (${distance})` : '';
    const sections: ExcelSection[] = [{ categoryLabel: `${selectedCategory}${distanceSuffix}`, maleRunners, femaleRunners }];
    return buildWinnersExcel(campaignName, '', sections, gender, { nameLang });
}

export function triggerSingleDistanceDownload(
    blob: Blob | null,
    campaignName: string,
    filePartLabel: string,
    selectedCategory: string,
    distance: string | undefined,
    gender: 'male' | 'female' | 'both',
) {
    if (!blob) return;
    const suffix = gender === 'male' ? '-Male' : gender === 'female' ? '-Female' : '';
    const distPart = distance ? `-${distance}` : (selectedCategory ? `-${selectedCategory}` : '');
    triggerExcelDownload(blob, `${campaignName || 'winners'}-${filePartLabel}${distPart}${suffix}`);
}
