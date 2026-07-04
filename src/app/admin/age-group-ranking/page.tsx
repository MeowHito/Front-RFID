'use client';

import { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import AdminLayout from '@/app/admin/AdminLayout';
import { useLanguage } from '@/lib/language-context';
import { authHeaders } from '@/lib/authHeaders';
import { isThaiNationality, isNationalitySplitCategory } from '@/lib/nationality';
import { LinkIcon, TrophyIcon } from '@heroicons/react/24/outline';

interface Runner {
    _id: string;
    bib: string;
    firstName: string;
    lastName: string;
    gender: string;
    ageGroup?: string;
    age?: number;
    status: string;
    nationality?: string;
    netTime?: number;
    gunTime?: number;
    elapsedTime?: number;
    netTimeStr?: string;
    ageGroupRank?: number;
}

interface AgeGroupConfig {
    name: string;
    minAge: number;
    maxAge: number;
    gender: 'male' | 'female';
    active: boolean;
}

interface AgeGroupBucket {
    label: string;
    min: number;
    max: number;
}

interface FeaturedCampaignSettings {
    _id: string;
    name: string;
    slug?: string;
    excludeOverallFromAgeGroup?: number;
    excludeAgeGroupTop?: number;
    disableAgeGroupRanking?: boolean;
    ageGroupDisplayCount?: number;
    overallDisplayCount?: number;
    excludeOverallThaiFromAgeGroup?: number;
    excludeOverallForeignFromAgeGroup?: number;
    separateOverallNationalityCategories?: string[];
    categories?: { name: string; distance?: string; ageGroups?: AgeGroupConfig[] }[];
}

const DEFAULT_AGE_GROUPS: AgeGroupBucket[] = [
    { label: '1-18', min: 0, max: 18 },
    { label: '19-29', min: 19, max: 29 },
    { label: '30-39', min: 30, max: 39 },
    { label: '40-49', min: 40, max: 49 },
    { label: '50-59', min: 50, max: 59 },
    { label: '60+', min: 60, max: 999 },
];

const OVERALL_GROUP: AgeGroupBucket = { label: 'OVERALL', min: 0, max: 999 };
const DEFAULT_TOP_N = 5;

function normalizeAgeGroupLabel(value?: string | null): string {
    return String(value || '')
        .replace(/^[MF]\s*/i, '')
        .replace(/\s*ปี$/i, '')
        .trim();
}

function parseAgeGroupBucket(value?: string | null): AgeGroupBucket | null {
    const label = normalizeAgeGroupLabel(value);
    if (!label) return null;

    const rangeMatch = label.match(/(\d+)\s*-\s*(\d+)/);
    if (rangeMatch) {
        return {
            label,
            min: parseInt(rangeMatch[1]),
            max: parseInt(rangeMatch[2]),
        };
    }

    const underMatch = label.match(/(?:u|under)\s*(\d+)/i);
    if (underMatch) {
        const max = parseInt(underMatch[1]) - 1;
        return {
            label,
            min: 0,
            max: max >= 0 ? max : 0,
        };
    }

    const plusMatch = label.match(/(\d+)\s*\+/);
    if (plusMatch) {
        return {
            label,
            min: parseInt(plusMatch[1]),
            max: 999,
        };
    }

    return null;
}

function buildAgeGroupsFromConfig(ageGroups: AgeGroupConfig[]): AgeGroupBucket[] {
    const seen = new Map<string, AgeGroupBucket>();
    for (const g of ageGroups) {
        if (!g.active) continue;
        const key = `${g.minAge}-${g.maxAge}`;
        if (!seen.has(key)) {
            const isOpenEnd = g.maxAge >= 99;
            const label = isOpenEnd ? `${g.minAge}+` : `${g.minAge}-${g.maxAge}`;
            seen.set(key, { label, min: g.minAge, max: g.maxAge });
        }
    }
    const buckets = Array.from(seen.values());
    buckets.sort((a, b) => a.min - b.min);
    return buckets.length > 0 ? buckets : DEFAULT_AGE_GROUPS;
}

function buildAgeGroupsFromRunners(runners: Runner[]): AgeGroupBucket[] {
    const seen = new Map<string, AgeGroupBucket>();
    for (const runner of runners) {
        const bucket = parseAgeGroupBucket(runner.ageGroup);
        if (!bucket) continue;
        const key = bucket.label.toLowerCase();
        if (!seen.has(key)) {
            seen.set(key, bucket);
        }
    }
    return Array.from(seen.values()).sort((a, b) => {
        if (a.min !== b.min) return a.min - b.min;
        if (a.max !== b.max) return a.max - b.max;
        return a.label.localeCompare(b.label, undefined, { numeric: true, sensitivity: 'base' });
    });
}

function resolveAgeGroup(runner: Runner, ageGroups: AgeGroupBucket[]): string {
    const ag = normalizeAgeGroupLabel(runner.ageGroup);
    const exactMatch = ageGroups.find(g => normalizeAgeGroupLabel(g.label).toLowerCase() === ag.toLowerCase());
    if (exactMatch) return exactMatch.label;

    const rangeMatch = ag.match(/(\d+)\s*-\s*(\d+)/);
    if (rangeMatch) {
        const lo = parseInt(rangeMatch[1]);
        for (const g of ageGroups) {
            if (lo >= g.min && lo <= g.max) return g.label;
        }
    }

    if (runner.age) {
        for (const g of ageGroups) {
            if (runner.age >= g.min && runner.age <= g.max) return g.label;
        }
    }

    if (ag.toLowerCase().includes('u18') || ag.toLowerCase().includes('under')) return ageGroups[0]?.label || 'Unknown';
    if (ag.includes('+') || ag.includes('60') || ag.includes('70')) return ageGroups[ageGroups.length - 1]?.label || 'Unknown';
    return 'Unknown';
}

function formatTime(ms: number | undefined | null): string {
    if (ms === undefined || ms === null || ms <= 0) return '-';
    const hours = Math.floor(ms / 3600000);
    const minutes = Math.floor((ms % 3600000) / 60000);
    const seconds = Math.floor((ms % 60000) / 1000);
    return `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

export default function AgeGroupRankingPage() {
    const { language } = useLanguage();
    const [campaign, setCampaign] = useState<FeaturedCampaignSettings | null>(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [excludeTop, setExcludeTop] = useState<number>(0);
    const [ageGroupDisplayCount, setAgeGroupDisplayCount] = useState<number>(DEFAULT_TOP_N);
    // Nationality-split categories: how many top Thai / foreign overall winners
    // (per gender) are excluded from age-group awards — independent of the public Overall page's display count.
    const [excludeThaiTop, setExcludeThaiTop] = useState<number>(DEFAULT_TOP_N);
    const [excludeForeignTop, setExcludeForeignTop] = useState<number>(DEFAULT_TOP_N);
    // Category names whose Overall ranking is split into Thai / foreign buckets
    const [natSplitCategories, setNatSplitCategories] = useState<string[]>([]);
    const [selectedCategory, setSelectedCategory] = useState('');
    const [previewRunners, setPreviewRunners] = useState<Runner[]>([]);
    const [previewLoading, setPreviewLoading] = useState(false);
    const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
    const origin = typeof window !== 'undefined' ? window.location.origin : '';
    const disableAgeGroupRanking = false;

    useEffect(() => {
        fetchCampaign();
    }, []);

    const fetchCampaign = async () => {
        try {
            const res = await fetch('/api/campaigns/featured');
            if (res.ok) {
                const data = await res.json();
                setCampaign(data);
                setExcludeTop(Math.max(0, Number(data?.excludeOverallFromAgeGroup) || 0));
                setAgeGroupDisplayCount(Math.max(1, Number(data?.ageGroupDisplayCount) || DEFAULT_TOP_N));
                const overallTopN = Math.max(1, Number(data?.overallDisplayCount) || DEFAULT_TOP_N);
                setExcludeThaiTop(data?.excludeOverallThaiFromAgeGroup != null ? Math.max(0, Number(data.excludeOverallThaiFromAgeGroup)) : overallTopN);
                setExcludeForeignTop(data?.excludeOverallForeignFromAgeGroup != null ? Math.max(0, Number(data.excludeOverallForeignFromAgeGroup)) : overallTopN);
                setNatSplitCategories(Array.isArray(data?.separateOverallNationalityCategories) ? data.separateOverallNationalityCategories : []);
                setSelectedCategory(data?.categories?.[0]?.name || '');
            }
        } catch { /* */ } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (!campaign?._id || !selectedCategory) {
            setPreviewLoading(false);
            setPreviewRunners([]);
            return;
        }

        const loadPreview = async () => {
            setPreviewLoading(true);
            try {
                const params = new URLSearchParams({
                    campaignId: campaign._id,
                    category: selectedCategory,
                    limit: '10000',
                    skipStatusCounts: 'true',
                });
                const res = await fetch(`/api/runners/paged?${params.toString()}`, { cache: 'no-store' });
                if (res.ok) {
                    const data = await res.json();
                    setPreviewRunners(data.data || []);
                } else {
                    setPreviewRunners([]);
                }
            } catch {
                setPreviewRunners([]);
            } finally {
                setPreviewLoading(false);
            }
        };

        loadPreview();
    }, [campaign?._id, selectedCategory]);

    const sortedFinishedRunners = useMemo(() => {
        return [...previewRunners]
            .filter(r => r.status === 'finished' && (r.netTime || r.gunTime || r.elapsedTime))
            .sort((a, b) => {
                const at = a.netTime || a.gunTime || a.elapsedTime || Infinity;
                const bt = b.netTime || b.gunTime || b.elapsedTime || Infinity;
                return at - bt;
            });
    }, [previewRunners]);

    const activeAgeGroups = useMemo(() => {
        if (disableAgeGroupRanking) return [OVERALL_GROUP];
        const syncedAgeGroups = buildAgeGroupsFromRunners(previewRunners);
        if (syncedAgeGroups.length > 0) return syncedAgeGroups;
        if (!campaign?.categories || !selectedCategory) return DEFAULT_AGE_GROUPS;
        const category = campaign.categories.find(item => item.name === selectedCategory);
        if (!category?.ageGroups || category.ageGroups.length === 0) return DEFAULT_AGE_GROUPS;
        return buildAgeGroupsFromConfig(category.ageGroups);
    }, [campaign, selectedCategory, previewRunners, disableAgeGroupRanking]);

    // Whether the currently selected category splits Overall by nationality
    const selectedCategorySplit = isNationalitySplitCategory(natSplitCategories, selectedCategory);

    const toggleNatSplitForSelected = () => {
        if (!selectedCategory) return;
        setNatSplitCategories(prev => prev.some(c => c === selectedCategory)
            ? prev.filter(c => c !== selectedCategory)
            : [...prev, selectedCategory]);
    };

    const { maleWinners, femaleWinners } = useMemo(() => {
        // Exclude top N male + top N female by overall time
        const excludedBibs = new Set<string>();
        if (excludeTop > 0) {
            sortedFinishedRunners.filter(r => r.gender !== 'F').slice(0, excludeTop).forEach(r => excludedBibs.add(r.bib));
            sortedFinishedRunners.filter(r => r.gender === 'F').slice(0, excludeTop).forEach(r => excludedBibs.add(r.bib));
        }
        // Nationality-split categories: top Thai / foreign overall winners (per
        // gender) are excluded from age-group awards, each with its own count
        // (e.g. exclude top 5 Thai but only top 3 foreign).
        if (selectedCategorySplit) {
            for (const female of [false, true]) {
                for (const thai of [true, false]) {
                    sortedFinishedRunners
                        .filter(r => (r.gender === 'F') === female && isThaiNationality(r.nationality) === thai)
                        .slice(0, thai ? excludeThaiTop : excludeForeignTop)
                        .forEach(r => excludedBibs.add(r.bib));
                }
            }
        }

        const male: Record<string, Runner[]> = {};
        const female: Record<string, Runner[]> = {};
        for (const group of activeAgeGroups) {
            male[group.label] = [];
            female[group.label] = [];
        }

        for (const runner of sortedFinishedRunners) {
            if (excludedBibs.has(runner.bib)) continue;
            // Nationality-split categories: foreigners are not eligible for age-group
            // awards at all (organizer rule) — they only compete in the OVERALL INT ranking.
            if (selectedCategorySplit && !isThaiNationality(runner.nationality)) continue;
            const groupLabel = disableAgeGroupRanking ? OVERALL_GROUP.label : resolveAgeGroup(runner, activeAgeGroups);
            const bucket = runner.gender === 'F' ? female : male;
            if (bucket[groupLabel] && bucket[groupLabel].length < ageGroupDisplayCount) {
                bucket[groupLabel].push(runner);
            }
        }

        return { maleWinners: male, femaleWinners: female };
    }, [sortedFinishedRunners, activeAgeGroups, disableAgeGroupRanking, excludeTop, ageGroupDisplayCount, selectedCategorySplit, excludeThaiTop, excludeForeignTop]);

    // Nationality-split overall winners — Thai count follows excludeThaiTop,
    // foreign count follows excludeForeignTop, so display always matches the
    // number of ranks entered for each group.
    const overallByNationality = useMemo(() => {
        const pick = (isFemale: boolean, thai: boolean) =>
            sortedFinishedRunners
                .filter(r => (r.gender === 'F') === isFemale && isThaiNationality(r.nationality) === thai)
                .slice(0, thai ? excludeThaiTop : excludeForeignTop);
        return {
            thaiMale: pick(false, true),
            thaiFemale: pick(true, true),
            foreignMale: pick(false, false),
            foreignFemale: pick(true, false),
        };
    }, [sortedFinishedRunners, excludeThaiTop, excludeForeignTop]);

    const previewCategory = campaign?.categories?.find(item => item.name === selectedCategory);
    const campaignPath = campaign?.slug || campaign?._id || '';
    const ageGroupShareUrl = campaignPath ? `${origin}/Result-Winners/${campaignPath}` : '';

    /* ── Preview column: vertical layout like Result-Winners page ── */
    const renderPreviewColumn = (title: string, headerClass: string, groupClass: string, winners: Record<string, Runner[]>) => (
        <div className="space-y-0">
            <div className={`rounded-t-lg px-3 py-2 text-center text-xs font-bold ${headerClass}`} style={{ color: '#ffffff' }}>
                {title}
            </div>
            <div className="rounded-b-lg border border-gray-200 bg-white overflow-hidden">
                {activeAgeGroups.map((group, gi) => {
                    const list = winners[group.label] || [];
                    const actualList = list.filter(r => !!r);
                    return (
                        <div key={group.label}>
                            {/* Age group header */}
                            <div className={`px-4 py-1.5 text-center text-[11px] font-bold ${groupClass} ${gi > 0 ? 'border-t border-gray-200' : ''}`} style={{ color: '#ffffff' }}>
                                {disableAgeGroupRanking ? (language === 'th' ? 'อันดับทั่วไป' : 'Overall ranking') : group.label}
                            </div>
                            {/* Runners list */}
                            <div className="divide-y divide-gray-100">
                                {actualList.length > 0 ? actualList.map((runner, index) => (
                                    <div key={`${group.label}-${index}`} className="flex items-center gap-2 px-3 py-1.5">
                                        <div className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold text-white ${
                                            index === 0 ? 'bg-yellow-500' : index === 1 ? 'bg-gray-400' : index === 2 ? 'bg-amber-700' : 'bg-gray-300 text-gray-600'
                                        }`} style={index > 2 ? { color: '#4b5563' } : undefined}>
                                            {index + 1}
                                        </div>
                                        <div className="min-w-0 flex-1 leading-tight">
                                            <p className="truncate text-xs font-semibold text-gray-800">
                                                {runner.firstName} {runner.lastName}
                                            </p>
                                            <p className="text-[10px] text-gray-500">BIB {runner.bib}</p>
                                        </div>
                                        <div className="shrink-0 text-[11px] font-bold text-gray-800">
                                            {runner.netTimeStr || formatTime(runner.netTime || runner.gunTime || runner.elapsedTime)}
                                        </div>
                                    </div>
                                )) : (
                                    <div className="px-3 py-3 text-center text-[11px] text-gray-400">
                                        {language === 'th' ? 'ไม่มีข้อมูล' : 'No data'}
                                    </div>
                                )}
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );

    const renderOverallPreviewColumn = (title: string, headerClass: string, runners: Runner[]) => (
        <div className="space-y-0">
            <div className={`rounded-t-lg px-3 py-2 text-center text-xs font-bold ${headerClass}`} style={{ color: '#ffffff' }}>
                {title}
            </div>
            <div className="rounded-b-lg border border-gray-200 bg-white overflow-hidden">
                <div className="divide-y divide-gray-100">
                    {runners.length > 0 ? runners.map((runner, index) => (
                        <div key={`overall-${title}-${index}`} className="flex items-center gap-2 px-3 py-1.5">
                            <div className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold text-white ${
                                index === 0 ? 'bg-yellow-500' : index === 1 ? 'bg-gray-400' : index === 2 ? 'bg-amber-700' : 'bg-gray-300 text-gray-600'
                            }`} style={index > 2 ? { color: '#4b5563' } : undefined}>
                                {index + 1}
                            </div>
                            <div className="min-w-0 flex-1 leading-tight">
                                <p className="truncate text-xs font-semibold text-gray-800">
                                    {runner.firstName} {runner.lastName}
                                </p>
                                <p className="text-[10px] text-gray-500">BIB {runner.bib}</p>
                            </div>
                            <div className="shrink-0 text-[11px] font-bold text-gray-800">
                                {runner.netTimeStr || formatTime(runner.netTime || runner.gunTime || runner.elapsedTime)}
                            </div>
                        </div>
                    )) : (
                        <div className="px-3 py-3 text-center text-[11px] text-gray-400">
                            {language === 'th' ? 'ไม่มีข้อมูล' : 'No data'}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );

    const renderCategoryTabs = () => (
        campaign?.categories && campaign.categories.length > 0 ? (
            <div className="flex flex-wrap gap-1.5">
                {campaign.categories.map(category => (
                    <button
                        key={category.name}
                        type="button"
                        onClick={() => setSelectedCategory(category.name)}
                        className={`rounded-full px-2.5 py-1 text-[11px] font-bold transition-all ${selectedCategory === category.name
                                ? 'bg-orange-600 shadow-md'
                                : 'border border-gray-300 bg-white text-gray-700 hover:border-gray-400'
                            }`}
                        style={selectedCategory === category.name ? { color: '#ffffff' } : undefined}
                    >
                        {category.name}{category.distance ? ` (${category.distance})` : ''}
                    </button>
                ))}
            </div>
        ) : null
    );

    const showToast = (message: string, type: 'success' | 'error') => {
        setToast({ message, type });
        setTimeout(() => setToast(null), 3000);
    };

    const handleCopyLink = async (url: string) => {
        if (!url) return;
        try {
            await navigator.clipboard.writeText(url);
        } catch {
            const input = document.createElement('input');
            input.value = url;
            document.body.appendChild(input);
            input.select();
            document.execCommand('copy');
            document.body.removeChild(input);
        }
        showToast(language === 'th' ? 'คัดลอกลิงก์แล้ว' : 'Link copied', 'success');
    };

    const updateExcludeTop = (value: number) => {
        const normalized = Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
        setExcludeTop(normalized);
    };

    const updateAgeGroupDisplayCount = (value: number) => {
        const normalized = Number.isFinite(value) ? Math.max(1, Math.floor(value)) : DEFAULT_TOP_N;
        setAgeGroupDisplayCount(normalized);
    };

    const updateExcludeThaiTop = (value: number) => {
        const normalized = Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
        setExcludeThaiTop(normalized);
    };

    const updateExcludeForeignTop = (value: number) => {
        const normalized = Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
        setExcludeForeignTop(normalized);
    };

    const handleSave = async () => {
        if (!campaign?._id) return;
        setSaving(true);
        try {
            const res = await fetch(`/api/campaigns/${campaign._id}`, {
                method: 'PUT',
                headers: authHeaders(),
                body: JSON.stringify({
                    excludeOverallFromAgeGroup: excludeTop,
                    disableAgeGroupRanking: false,
                    ageGroupDisplayCount: ageGroupDisplayCount,
                    excludeOverallThaiFromAgeGroup: excludeThaiTop,
                    excludeOverallForeignFromAgeGroup: excludeForeignTop,
                    separateOverallNationalityCategories: natSplitCategories,
                }),
            });
            if (res.ok) {
                showToast(language === 'th' ? 'บันทึกสำเร็จ' : 'Settings saved', 'success');
            } else {
                showToast(language === 'th' ? 'บันทึกล้มเหลว' : 'Save failed', 'error');
            }
        } catch {
            showToast('Error saving', 'error');
        } finally {
            setSaving(false);
        }
    };

    return (
        <AdminLayout
            breadcrumbItems={[
                { label: 'อันดับกลุ่มอายุ', labelEn: 'Age Group Ranking' }
            ]}
        >
            {/* Toast */}
            {toast && (
                <div className={`fixed right-5 top-24 z-50 px-6 py-3 rounded-lg text-white font-semibold shadow-lg ${toast.type === 'success' ? 'bg-green-500' : 'bg-red-500'}`}>
                    {toast.message}
                </div>
            )}

            <div className="mx-auto max-w-screen-2xl p-4">
                {loading ? (
                    <div className="text-center py-10 text-gray-400 text-sm">
                        {language === 'th' ? 'กำลังโหลด...' : 'Loading...'}
                    </div>
                ) : !campaign ? (
                    <div className="text-center py-10 text-gray-400 text-sm">
                        {language === 'th' ? 'ไม่พบแคมเปญที่กดดาว — กรุณากดดาวเลือกกิจกรรมที่ต้องการก่อน' : 'No featured campaign found — please star a campaign first'}
                    </div>
                ) : (
                    <div className="space-y-5 rounded-2xl bg-[#eef1f7] p-4">
                        <div className="rounded-2xl border border-red-200 bg-white p-3 shadow-sm">
                            <div className="flex flex-wrap items-center gap-2">
                                <span className="rounded-md px-3 py-1.5 text-[16px] font-bold text-white">
                                    {language === 'th' ? 'อันดับกลุ่มอายุ' : 'Age group winners'}
                                </span>
                                <button
                                    type="button"
                                    onClick={() => handleCopyLink(ageGroupShareUrl)}
                                    title={language === 'th' ? 'คัดลอกลิงก์' : 'Copy link'}
                                    className="flex items-center justify-center rounded-md bg-sky-500 px-2.5 py-1.5 text-white hover:bg-sky-600 transition-colors"
                                >
                                    <LinkIcon className="h-4 w-4" />
                                </button>
                                <Link
                                    href="/admin/top-overall"
                                    className="ml-auto flex items-center gap-1.5 rounded-md bg-amber-500 px-3 py-1.5 text-[11px] font-bold hover:bg-amber-600 transition-colors"
                                    style={{ color: '#ffffff' }}
                                >
                                    <TrophyIcon className="h-4 w-4" />
                                    Top Overall
                                </Link>
                            </div>

                            <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                                <div className="flex flex-wrap items-center gap-2">
                                    <span className="rounded-md px-3 py-1.5 text-[11px] font-bold" style={{ color: '#374151' }}>
                                        {language === 'th' ? 'ตัวเลือก Overall' : 'Overall options'}
                                    </span>
                                    <button
                                        type="button"
                                        onClick={() => updateExcludeTop(0)}
                                        className="rounded-md border px-3 py-1.5 text-[11px] font-bold transition-all"
                                        style={excludeTop === 0
                                            ? { backgroundColor: '#fef08a', borderColor: '#eab308', color: '#854d0e', boxShadow: '0 1px 2px rgba(0,0,0,0.05)' }
                                            : { backgroundColor: '#ffffff', borderColor: '#d1d5db', color: '#6b7280' }
                                        }
                                    >
                                        {language === 'th' ? 'ไม่ตัดออก' : 'No exclusion'}
                                    </button>
                                    <div className="flex flex-wrap items-center gap-1.5 rounded-lg border border-violet-200 bg-violet-50 px-2 py-1.5">
                                        <span className="text-[11px] font-bold" style={{ color: '#5b21b6' }}>
                                            {language === 'th' ? 'ตัดอันดับ Overall ออก:' : 'Exclude Overall rank:'}
                                        </span>
                                        <input
                                            type="number"
                                            min={0}
                                            value={excludeTop === 0 ? '' : excludeTop}
                                            placeholder="0"
                                            onChange={(e) => updateExcludeTop(e.target.value === '' ? 0 : Number(e.target.value))}
                                            className="h-9 w-20 rounded-lg border-2 border-blue-400 bg-white text-center font-semibold outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                                            style={{ color: '#1d4ed8', fontSize: '15px' }}
                                        />
                                        <span className="text-[11px] font-bold" style={{ color: '#5b21b6' }}>
                                            {language === 'th' ? 'อันดับ' : 'rank(s)'}
                                        </span>
                                    </div>
                                    <div className="flex items-center gap-1.5 rounded-lg border border-sky-200 bg-sky-50 px-2 py-1.5">
                                        <span className="text-[11px] font-bold" style={{ color: '#0369a1' }}>
                                            {language === 'th' ? 'แสดงผลอันดับ:' : 'Display ranks:'}
                                        </span>
                                        <input
                                            type="number"
                                            min={1}
                                            value={ageGroupDisplayCount}
                                            onChange={(e) => updateAgeGroupDisplayCount(e.target.value === '' ? DEFAULT_TOP_N : Number(e.target.value))}
                                            className="h-9 w-20 rounded-lg border-2 border-sky-400 bg-white text-center font-semibold outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-100"
                                            style={{ color: '#0369a1', fontSize: '15px' }}
                                        />
                                        <span className="text-[11px] font-bold" style={{ color: '#0369a1' }}>
                                            {language === 'th' ? 'อันดับแรก / กลุ่มอายุ' : 'top per age group'}
                                        </span>
                                    </div>
                                </div>

                                <button
                                    onClick={handleSave}
                                    disabled={saving}
                                    className={`rounded-md px-4 py-1.5 text-[11px] font-bold text-white transition-all ${saving ? 'bg-gray-400 cursor-wait' : 'bg-green-500 hover:bg-green-600 cursor-pointer'}`}
                                    style={{ color: '#ffffff' }}
                                >
                                    {saving
                                        ? (language === 'th' ? 'กำลังบันทึก...' : 'Saving...')
                                        : (language === 'th' ? 'บันทึก' : 'Save')}
                                </button>
                            </div>

                            <div className="mt-4 rounded-2xl border border-gray-200 bg-[#f8fafc] p-3">
                                <div className="flex flex-wrap items-center gap-2">
                                    <span className="rounded-md px-3 py-1.5 text-[11px] font-bold" style={{ color: '#374151' }}>
                                        {language === 'th' ? 'ตัดผู้ชนะ Overall ไทย/ต่างชาติออกจากกลุ่มอายุ' : 'Exclude Overall Thai/foreign winners from age group'}
                                    </span>
                                    <div className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-1.5">
                                        <span className="text-[11px] font-bold" style={{ color: '#047857' }}>
                                            {language === 'th'
                                                ? `แยกไทย / ต่างชาติ${selectedCategory ? ` (${selectedCategory})` : ''}`
                                                : `Split Thai / foreign${selectedCategory ? ` (${selectedCategory})` : ''}`}
                                        </span>
                                        <button
                                            type="button"
                                            role="switch"
                                            aria-checked={selectedCategorySplit}
                                            onClick={toggleNatSplitForSelected}
                                            disabled={!selectedCategory}
                                            className="relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors"
                                            style={{ backgroundColor: selectedCategorySplit ? '#10b981' : '#cbd5e1', cursor: selectedCategory ? 'pointer' : 'not-allowed' }}
                                            title={language === 'th'
                                                ? 'แยกอันดับ Overall ตามสัญชาติ เฉพาะระยะที่เลือก (ผู้ได้ Overall จะไม่ได้รางวัลกลุ่มอายุ)'
                                                : 'Split Overall by nationality for the selected category only (Overall winners are excluded from age-group awards)'}
                                        >
                                            <span
                                                className="inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform"
                                                style={{ transform: selectedCategorySplit ? 'translateX(22px)' : 'translateX(2px)' }}
                                            />
                                        </button>
                                    </div>
                                    {selectedCategorySplit && (
                                        <>
                                            <div className="flex items-center gap-1.5 rounded-lg border border-violet-200 bg-violet-50 px-2 py-1.5">
                                                <span className="text-[11px] font-bold" style={{ color: '#5b21b6' }}>
                                                    {language === 'th' ? 'คนไทย' : 'Thai'}
                                                </span>
                                                <input
                                                    type="number"
                                                    min={0}
                                                    value={excludeThaiTop}
                                                    onChange={(e) => updateExcludeThaiTop(e.target.value === '' ? 0 : Number(e.target.value))}
                                                    className="h-9 w-16 rounded-lg border-2 border-violet-400 bg-white text-center font-semibold outline-none focus:border-violet-500 focus:ring-2 focus:ring-violet-100"
                                                    style={{ color: '#5b21b6', fontSize: '15px' }}
                                                />
                                                <span className="text-[11px] font-bold" style={{ color: '#5b21b6' }}>
                                                    {language === 'th' ? 'อันดับ' : 'rank(s)'}
                                                </span>
                                            </div>
                                            <div className="flex items-center gap-1.5 rounded-lg border border-indigo-200 bg-indigo-50 px-2 py-1.5">
                                                <span className="text-[11px] font-bold" style={{ color: '#3730a3' }}>
                                                    {language === 'th' ? 'ต่างชาติ' : 'Foreign'}
                                                </span>
                                                <input
                                                    type="number"
                                                    min={0}
                                                    value={excludeForeignTop}
                                                    onChange={(e) => updateExcludeForeignTop(e.target.value === '' ? 0 : Number(e.target.value))}
                                                    className="h-9 w-16 rounded-lg border-2 border-indigo-400 bg-white text-center font-semibold outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
                                                    style={{ color: '#3730a3', fontSize: '15px' }}
                                                />
                                                <span className="text-[11px] font-bold" style={{ color: '#3730a3' }}>
                                                    {language === 'th' ? 'อันดับ' : 'rank(s)'}
                                                </span>
                                            </div>
                                        </>
                                    )}
                                </div>

                                <div className="mt-3">{renderCategoryTabs()}</div>

                                <div className="mt-3" style={{ maxHeight: '600px', overflowY: 'auto' }}>
                                    {previewLoading ? (
                                        <div className="rounded-xl border border-dashed border-gray-300 bg-white px-4 py-8 text-center text-sm text-gray-500">
                                            {language === 'th' ? 'กำลังโหลดข้อมูลอันดับ...' : 'Loading ranking data...'}
                                        </div>
                                    ) : !selectedCategory ? (
                                        <div className="rounded-xl border border-dashed border-gray-300 bg-white px-4 py-8 text-center text-sm text-gray-500">
                                            {language === 'th' ? 'ไม่มีประเภทการแข่งขันสำหรับแสดงพรีวิว' : 'No category available for preview'}
                                        </div>
                                    ) : (
                                        <div className="space-y-4">
                                            {selectedCategorySplit && (
                                                <div>
                                                    <p className="mb-1.5 text-[11px] font-bold uppercase tracking-wide" style={{ color: '#6b7280' }}>
                                                        {language === 'th' ? 'อันดับ Overall (แยกไทย/ต่างชาติ)' : 'Overall ranking (Thai/foreign split)'}
                                                    </p>
                                                    <div className="grid gap-3 xl:grid-cols-2">
                                                        {renderOverallPreviewColumn(language === 'th' ? '♂ OVERALL THA · ชาย' : '♂ OVERALL THA · Male', 'bg-blue-600', overallByNationality.thaiMale)}
                                                        {renderOverallPreviewColumn(language === 'th' ? '♀ OVERALL THA · หญิง' : '♀ OVERALL THA · Female', 'bg-pink-600', overallByNationality.thaiFemale)}
                                                        {renderOverallPreviewColumn(language === 'th' ? '♂ OVERALL INT · ชาย' : '♂ OVERALL INT · Male', 'bg-indigo-600', overallByNationality.foreignMale)}
                                                        {renderOverallPreviewColumn(language === 'th' ? '♀ OVERALL INT · หญิง' : '♀ OVERALL INT · Female', 'bg-fuchsia-600', overallByNationality.foreignFemale)}
                                                    </div>
                                                </div>
                                            )}
                                            <div>
                                                <p className="mb-1.5 text-[11px] font-bold uppercase tracking-wide" style={{ color: '#6b7280' }}>
                                                    {language === 'th' ? 'อันดับกลุ่มอายุ' : 'Age group ranking'}
                                                </p>
                                                <div className="grid gap-3 xl:grid-cols-2">
                                                    {renderPreviewColumn(language === 'th' ? '♂ ผู้ชนะชาย' : '♂ Male winners', 'bg-blue-600', 'bg-blue-900', maleWinners)}
                                                    {renderPreviewColumn(language === 'th' ? '♀ ผู้ชนะหญิง' : '♀ Female winners', 'bg-pink-600', 'bg-pink-900', femaleWinners)}
                                                </div>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </AdminLayout>
    );
}
