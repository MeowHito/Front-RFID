'use client';

import { useState, useEffect, useMemo } from 'react';
import AdminLayout from '@/app/admin/AdminLayout';
import { useLanguage } from '@/lib/language-context';
import { authHeaders } from '@/lib/authHeaders';

interface Runner {
    _id: string;
    bib: string;
    firstName: string;
    lastName: string;
    gender: string;
    ageGroup?: string;
    age?: number;
    status: string;
    netTime?: number;
    gunTime?: number;
    elapsedTime?: number;
    netTimeStr?: string;
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
    disableAgeGroupRanking?: boolean;
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
const TOP_N = 5;

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

    const { maleWinners, femaleWinners } = useMemo(() => {
        const excludedBibs = new Set<string>();
        if (excludeTop > 0) {
            sortedFinishedRunners.slice(0, excludeTop).forEach(r => excludedBibs.add(r.bib));
        }

        const male: Record<string, Runner[]> = {};
        const female: Record<string, Runner[]> = {};
        for (const group of activeAgeGroups) {
            male[group.label] = [];
            female[group.label] = [];
        }

        for (const runner of sortedFinishedRunners) {
            if (excludedBibs.has(runner.bib)) continue;
            const groupLabel = disableAgeGroupRanking ? OVERALL_GROUP.label : resolveAgeGroup(runner, activeAgeGroups);
            const bucket = runner.gender === 'F' ? female : male;
            if (bucket[groupLabel] && bucket[groupLabel].length < TOP_N) {
                bucket[groupLabel].push(runner);
            }
        }

        return { maleWinners: male, femaleWinners: female };
    }, [sortedFinishedRunners, activeAgeGroups, disableAgeGroupRanking, excludeTop]);

    const overallMaleWinners = useMemo(() => {
        return sortedFinishedRunners.filter(r => r.gender !== 'F').slice(0, TOP_N);
    }, [sortedFinishedRunners]);

    const overallFemaleWinners = useMemo(() => {
        return sortedFinishedRunners.filter(r => r.gender === 'F').slice(0, TOP_N);
    }, [sortedFinishedRunners]);

    const previewCategory = campaign?.categories?.find(item => item.name === selectedCategory);
    const campaignPath = campaign?.slug || campaign?._id || '';
    const ageGroupShareUrl = campaignPath ? `${origin}/Result-Winners/${campaignPath}` : '';
    const overallShareUrl = campaignPath ? `${origin}/Overall-Winners/${campaignPath}` : '';

    const renderPreviewColumn = (title: string, headerClass: string, groupClass: string, winners: Record<string, Runner[]>) => (
        <div className="space-y-2">
            <div className={`rounded-lg px-3 py-2 text-center text-xs font-bold text-white ${headerClass}`}>
                {title}
            </div>
            <div className={`grid gap-2 ${disableAgeGroupRanking ? 'grid-cols-1' : 'sm:grid-cols-2 2xl:grid-cols-3'}`}>
                {activeAgeGroups.map(group => {
                    const list = winners[group.label] || [];
                    return (
                        <div key={group.label} className="overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
                            <div className={`px-3 py-1.5 text-center text-[11px] font-bold text-white ${groupClass}`}>
                                {disableAgeGroupRanking ? (language === 'th' ? 'อันดับทั่วไป' : 'Overall ranking') : group.label}
                            </div>
                            <div className="divide-y divide-gray-100">
                                {Array.from({ length: TOP_N }, (_, index) => {
                                    const runner = list[index];
                                    return (
                                        <div key={`${group.label}-${index}`} className="flex items-center gap-2 px-2.5 py-1.5">
                                            <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-gray-100 text-[10px] font-bold text-gray-700">
                                                {index + 1}
                                            </div>
                                            <div className="min-w-0 flex-1 leading-tight">
                                                <p className="truncate text-xs font-semibold text-gray-800">
                                                    {runner ? `${runner.firstName} ${runner.lastName}` : '—'}
                                                </p>
                                                <p className="text-[10px] text-gray-500">
                                                    {runner ? `BIB ${runner.bib}` : (language === 'th' ? 'ไม่มีข้อมูล' : 'No data')}
                                                </p>
                                            </div>
                                            <div className="shrink-0 text-[11px] font-bold text-gray-800">
                                                {runner ? (runner.netTimeStr || formatTime(runner.netTime || runner.gunTime || runner.elapsedTime)) : '-'}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );

    const renderOverallPreviewColumn = (title: string, headerClass: string, runners: Runner[]) => (
        <div className="space-y-2">
            <div className={`rounded-lg px-3 py-2 text-center text-xs font-bold text-white ${headerClass}`}>
                {title}
            </div>
            <div className="overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
                <div className={`px-3 py-1.5 text-center text-[11px] font-bold text-white ${headerClass}`}>
                    {language === 'th' ? 'อันดับ Overall' : 'Overall ranking'}
                </div>
                <div className="divide-y divide-gray-100">
                    {Array.from({ length: TOP_N }, (_, index) => {
                        const runner = runners[index];
                        return (
                            <div key={`overall-${title}-${index}`} className="flex items-center gap-2 px-2.5 py-2">
                                <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-gray-100 text-[10px] font-bold text-gray-700">
                                    {index + 1}
                                </div>
                                <div className="min-w-0 flex-1 leading-tight">
                                    <p className="truncate text-xs font-semibold text-gray-800">
                                        {runner ? `${runner.firstName} ${runner.lastName}` : '—'}
                                    </p>
                                    <p className="text-[10px] text-gray-500">
                                        {runner ? `BIB ${runner.bib}` : (language === 'th' ? 'ไม่มีข้อมูล' : 'No data')}
                                    </p>
                                </div>
                                <div className="shrink-0 text-[11px] font-bold text-gray-800">
                                    {runner ? (runner.netTimeStr || formatTime(runner.netTime || runner.gunTime || runner.elapsedTime)) : '-'}
                                </div>
                            </div>
                        );
                    })}
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
                        className={`rounded-full px-2.5 py-1 text-[11px] font-bold transition-all ${
                            selectedCategory === category.name
                                ? 'bg-slate-800 text-white'
                                : 'border border-gray-300 bg-white text-gray-700 hover:border-gray-400'
                        }`}
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
                <div className={`fixed top-5 right-5 z-50 px-6 py-3 rounded-lg text-white font-semibold shadow-lg ${toast.type === 'success' ? 'bg-green-500' : 'bg-red-500'}`}>
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
                                <span className="rounded-md bg-red-500 px-3 py-1.5 text-[11px] font-bold text-white">
                                    {language === 'th' ? 'อันดับกลุ่มอายุ' : 'Age group winners'}
                                </span>
                                <button
                                    type="button"
                                    onClick={() => handleCopyLink(ageGroupShareUrl)}
                                    className="rounded-md bg-sky-500 px-3 py-1.5 text-[11px] font-bold text-white hover:bg-sky-600"
                                >
                                    {language === 'th' ? 'link share' : 'link share'}
                                </button>
                            </div>

                            <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                                <div className="flex flex-wrap items-center gap-2">
                                    <span className="rounded-md bg-red-500 px-3 py-1.5 text-[11px] font-bold text-white">
                                        {language === 'th' ? 'ตัวเลือก Overall' : 'Overall options'}
                                    </span>
                                    <button
                                        type="button"
                                        onClick={() => updateExcludeTop(0)}
                                        className={`rounded-md border px-3 py-1.5 text-[11px] font-bold transition-all ${
                                            excludeTop === 0
                                                ? 'border-red-500 bg-white text-red-600 shadow-sm'
                                                : 'border-red-200 bg-red-50 text-red-500 hover:border-red-300'
                                        }`}
                                    >
                                        {language === 'th' ? 'ไม่ตัดออก' : 'No exclusion'}
                                    </button>
                                    <div className="flex flex-wrap items-center gap-1.5 rounded-lg border border-violet-200 bg-violet-50 px-2 py-1.5">
                                        <span className="rounded-md bg-violet-500 px-2.5 py-1 text-[11px] font-bold text-white">
                                            {language === 'th' ? 'ตัด Overall' : 'Exclude Overall'}
                                        </span>
                                        <span className="text-[11px] font-bold text-violet-700">
                                            {language === 'th' ? 'ตั้งแต่' : 'From rank'}
                                        </span>
                                        <button
                                            type="button"
                                            onClick={() => updateExcludeTop(excludeTop - 1)}
                                            className="flex h-7 w-7 items-center justify-center rounded-md bg-red-500 text-sm font-bold text-white hover:bg-red-600"
                                            aria-label="Decrease overall exclusion"
                                        >
                                            -
                                        </button>
                                        <input
                                            type="number"
                                            min={0}
                                            value={excludeTop}
                                            onChange={(e) => updateExcludeTop(Number(e.target.value))}
                                            className="h-7 w-14 rounded-md border border-red-300 bg-white text-center text-[11px] font-bold text-red-600 outline-none focus:border-red-500"
                                        />
                                        <button
                                            type="button"
                                            onClick={() => updateExcludeTop(excludeTop + 1)}
                                            className="flex h-7 w-7 items-center justify-center rounded-md bg-red-500 text-sm font-bold text-white hover:bg-red-600"
                                            aria-label="Increase overall exclusion"
                                        >
                                            +
                                        </button>
                                        <span className="rounded-md border border-red-300 bg-white px-2.5 py-1 text-[11px] font-bold text-red-600">
                                            {excludeTop === 0
                                                ? (language === 'th' ? 'ไม่ตัดออก' : 'No exclusion')
                                                : (language === 'th' ? `1-${excludeTop}` : `1-${excludeTop}`)}
                                        </span>
                                    </div>
                                </div>

                                <button
                                    onClick={handleSave}
                                    disabled={saving}
                                    className={`rounded-md px-4 py-1.5 text-[11px] font-bold text-white transition-all ${
                                        saving ? 'bg-gray-400 cursor-wait' : 'bg-red-500 hover:bg-red-600 cursor-pointer'
                                    }`}
                                >
                                    {saving
                                        ? (language === 'th' ? 'กำลังบันทึก...' : 'Saving...')
                                        : (language === 'th' ? 'บันทึก' : 'Save')}
                                </button>
                            </div>

                            <div className="mt-4 rounded-2xl border border-gray-200 bg-[#f8fafc] p-3">
                                <div className="flex flex-wrap items-start justify-between gap-3">
                                    <div>
                                        <h3 className="text-sm font-bold text-gray-800">
                                            {language === 'th' ? 'พรีวิวหน้า Result-Winners' : 'Result-Winners preview'}
                                        </h3>
                                        <p className="mt-1 text-[11px] text-gray-500">
                                            {language === 'th' ? 'เลือกประเภทแล้วดูหน้าที่จะแชร์ได้ทันที' : 'Choose category and preview the shared page instantly'}
                                        </p>
                                    </div>
                                    {previewCategory && (
                                        <div className="rounded-full bg-white px-3 py-1.5 text-[11px] font-semibold text-gray-600 shadow-sm">
                                            {previewCategory.name}{previewCategory.distance ? ` (${previewCategory.distance})` : ''}
                                        </div>
                                    )}
                                </div>

                                <div className="mt-3">{renderCategoryTabs()}</div>

                                <div className="mt-3">
                                    {previewLoading ? (
                                        <div className="rounded-xl border border-dashed border-gray-300 bg-white px-4 py-8 text-center text-sm text-gray-500">
                                            {language === 'th' ? 'กำลังโหลดข้อมูลอันดับ...' : 'Loading ranking data...'}
                                        </div>
                                    ) : !selectedCategory ? (
                                        <div className="rounded-xl border border-dashed border-gray-300 bg-white px-4 py-8 text-center text-sm text-gray-500">
                                            {language === 'th' ? 'ไม่มีประเภทการแข่งขันสำหรับแสดงพรีวิว' : 'No category available for preview'}
                                        </div>
                                    ) : (
                                        <div className="grid gap-3 xl:grid-cols-2">
                                            {renderPreviewColumn(language === 'th' ? 'ผู้ชนะชาย' : 'Male winners', 'bg-blue-600', 'bg-blue-900', maleWinners)}
                                            {renderPreviewColumn(language === 'th' ? 'ผู้ชนะหญิง' : 'Female winners', 'bg-pink-600', 'bg-pink-900', femaleWinners)}
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>

                        <div className="border-t-2 border-sky-300" />

                        <div className="rounded-2xl border border-sky-200 bg-white p-3 shadow-sm">
                            <div className="flex flex-wrap items-center gap-2">
                                <span className="rounded-md bg-amber-400 px-3 py-1.5 text-[11px] font-bold text-gray-900">
                                    {language === 'th' ? 'อันดับ Overall' : 'Overall winners'}
                                </span>
                                <button
                                    type="button"
                                    onClick={() => handleCopyLink(overallShareUrl)}
                                    className="rounded-md bg-sky-500 px-3 py-1.5 text-[11px] font-bold text-white hover:bg-sky-600"
                                >
                                    {language === 'th' ? 'link share' : 'link share'}
                                </button>
                            </div>

                            <div className="mt-4 rounded-2xl border border-gray-200 bg-[#f8fafc] p-3">
                                <div className="flex flex-wrap items-start justify-between gap-3">
                                    <div>
                                        <h3 className="text-sm font-bold text-gray-800">
                                            {language === 'th' ? 'พรีวิวหน้า Overall-Winners' : 'Overall-Winners preview'}
                                        </h3>
                                        <p className="mt-1 text-[11px] text-gray-500">
                                            {language === 'th' ? 'ลิงก์นี้จะแสดงอันดับ Overall แยกชาย/หญิง' : 'This link shows overall male/female rankings'}
                                        </p>
                                    </div>
                                    {previewCategory && (
                                        <div className="rounded-full bg-white px-3 py-1.5 text-[11px] font-semibold text-gray-600 shadow-sm">
                                            {previewCategory.name}{previewCategory.distance ? ` (${previewCategory.distance})` : ''}
                                        </div>
                                    )}
                                </div>

                                <div className="mt-3">{renderCategoryTabs()}</div>

                                <div className="mt-3">
                                    {previewLoading ? (
                                        <div className="rounded-xl border border-dashed border-gray-300 bg-white px-4 py-8 text-center text-sm text-gray-500">
                                            {language === 'th' ? 'กำลังโหลดข้อมูลอันดับ...' : 'Loading ranking data...'}
                                        </div>
                                    ) : !selectedCategory ? (
                                        <div className="rounded-xl border border-dashed border-gray-300 bg-white px-4 py-8 text-center text-sm text-gray-500">
                                            {language === 'th' ? 'ไม่มีประเภทการแข่งขันสำหรับแสดงพรีวิว' : 'No category available for preview'}
                                        </div>
                                    ) : (
                                        <div className="grid gap-3 xl:grid-cols-2">
                                            {renderOverallPreviewColumn(language === 'th' ? 'อันดับชาย' : 'Male overall', 'bg-blue-600', overallMaleWinners)}
                                            {renderOverallPreviewColumn(language === 'th' ? 'อันดับหญิง' : 'Female overall', 'bg-pink-600', overallFemaleWinners)}
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
