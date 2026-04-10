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
    const [disableAgeGroupRanking, setDisableAgeGroupRanking] = useState(false);
    const [selectedCategory, setSelectedCategory] = useState('');
    const [previewRunners, setPreviewRunners] = useState<Runner[]>([]);
    const [previewLoading, setPreviewLoading] = useState(false);
    const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

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
                setDisableAgeGroupRanking(Boolean(data?.disableAgeGroupRanking));
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
        const finished = previewRunners.filter(r => r.status === 'finished' && (r.netTime || r.gunTime || r.elapsedTime));
        const sorted = [...finished].sort((a, b) => {
            const at = a.netTime || a.gunTime || a.elapsedTime || Infinity;
            const bt = b.netTime || b.gunTime || b.elapsedTime || Infinity;
            return at - bt;
        });

        const excludedBibs = new Set<string>();
        if (excludeTop > 0) {
            sorted.slice(0, excludeTop).forEach(r => excludedBibs.add(r.bib));
        }

        const male: Record<string, Runner[]> = {};
        const female: Record<string, Runner[]> = {};
        for (const group of activeAgeGroups) {
            male[group.label] = [];
            female[group.label] = [];
        }

        for (const runner of sorted) {
            if (excludedBibs.has(runner.bib)) continue;
            const groupLabel = disableAgeGroupRanking ? OVERALL_GROUP.label : resolveAgeGroup(runner, activeAgeGroups);
            const bucket = runner.gender === 'F' ? female : male;
            if (bucket[groupLabel] && bucket[groupLabel].length < TOP_N) {
                bucket[groupLabel].push(runner);
            }
        }

        return { maleWinners: male, femaleWinners: female };
    }, [previewRunners, activeAgeGroups, disableAgeGroupRanking, excludeTop]);

    const previewCategory = campaign?.categories?.find(item => item.name === selectedCategory);

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

    const showToast = (message: string, type: 'success' | 'error') => {
        setToast({ message, type });
        setTimeout(() => setToast(null), 3000);
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
                    disableAgeGroupRanking,
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
                <div className={`fixed top-5 right-5 z-[9999] px-6 py-3 rounded-lg text-white font-semibold shadow-lg ${toast.type === 'success' ? 'bg-green-500' : 'bg-red-500'}`}>
                    {toast.message}
                </div>
            )}

            <div className="mx-auto max-w-screen-2xl p-4 lg:h-[calc(100vh-96px)] lg:overflow-hidden">
                {loading ? (
                    <div className="text-center py-10 text-gray-400 text-sm">
                        {language === 'th' ? 'กำลังโหลด...' : 'Loading...'}
                    </div>
                ) : !campaign ? (
                    <div className="text-center py-10 text-gray-400 text-sm">
                        {language === 'th' ? 'ไม่พบแคมเปญที่กดดาว — กรุณากดดาวเลือกกิจกรรมที่ต้องการก่อน' : 'No featured campaign found — please star a campaign first'}
                    </div>
                ) : (
                    <>
                        <div className="grid gap-4 lg:h-full lg:grid-cols-[320px,minmax(0,1fr)] xl:grid-cols-[340px,minmax(0,1fr)]">
                            <div className="space-y-4">
                                <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
                                    <div className="flex items-start justify-between gap-3">
                                        <div className="min-w-0">
                                            <h1 className="flex items-center gap-2 text-lg font-bold text-gray-800">
                                                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" strokeWidth="2"><path d="M12 2l2.09 6.26L20 9.27l-4.91 3.82L16.18 20 12 16.77 7.82 20l1.09-6.91L4 9.27l5.91-1.01L12 2z" /></svg>
                                                {language === 'th' ? 'ตั้งค่าอันดับกลุ่มอายุ' : 'Age Group Ranking'}
                                            </h1>
                                            <p className="mt-1 text-xs leading-5 text-gray-500">
                                                {language === 'th'
                                                    ? 'ตั้งค่าหน้า Result-Winners และดูพรีวิวได้ในหน้านี้เลย'
                                                    : 'Configure Result-Winners and preview it from this single screen'}
                                            </p>
                                        </div>
                                        <div className="rounded-lg border border-blue-200 bg-blue-50 px-2.5 py-2 text-[11px] font-semibold leading-4 text-blue-700">
                                            {language === 'th' ? 'กิจกรรมที่เลือก' : 'Selected'}
                                            <div className="mt-1 max-w-36 truncate text-xs text-blue-900">{campaign.name}</div>
                                        </div>
                                    </div>

                                    <div className="mt-4 space-y-3">
                                        <div>
                                            <p className="mb-1.5 text-xs font-semibold text-gray-700">
                                                {language === 'th' ? 'รูปแบบการแสดงผล' : 'Display mode'}
                                            </p>
                                            <div className="grid grid-cols-2 gap-2">
                                                <button
                                                    type="button"
                                                    onClick={() => setDisableAgeGroupRanking(false)}
                                                    className={`rounded-xl px-3 py-2 text-xs font-bold transition-all ${
                                                        !disableAgeGroupRanking
                                                            ? 'bg-green-600 text-white shadow-sm'
                                                            : 'bg-white text-gray-600 border border-gray-300 hover:border-gray-400'
                                                    }`}
                                                >
                                                    {language === 'th' ? 'ใช้กลุ่มอายุ' : 'Use age groups'}
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => setDisableAgeGroupRanking(true)}
                                                    className={`rounded-xl px-3 py-2 text-xs font-bold transition-all ${
                                                        disableAgeGroupRanking
                                                            ? 'bg-indigo-600 text-white shadow-sm'
                                                            : 'bg-white text-gray-600 border border-gray-300 hover:border-gray-400'
                                                    }`}
                                                >
                                                    {language === 'th' ? 'ไม่ใช้กลุ่มอายุ' : 'No age groups'}
                                                </button>
                                            </div>
                                        </div>

                                        <div className="rounded-xl border border-gray-200 bg-gray-50 p-3">
                                            <div className="flex items-center justify-between gap-3">
                                                <div>
                                                    <p className="text-xs font-bold text-gray-800">
                                                        {language === 'th' ? 'ตัด Overall อันดับ 1 ถึง' : 'Exclude Overall 1 to'}
                                                    </p>
                                                    <p className="mt-1 text-[11px] leading-4 text-gray-500">
                                                        {excludeTop === 0
                                                            ? (language === 'th' ? '0 = ไม่ตัดอันดับ Overall' : '0 = no Overall exclusion')
                                                            : (language === 'th' ? `ซ่อนอันดับ Overall 1-${excludeTop}` : `Hide Overall ranks 1-${excludeTop}`)}
                                                    </p>
                                                </div>

                                                <div className="flex items-center gap-1.5">
                                                    <button
                                                        type="button"
                                                        onClick={() => updateExcludeTop(excludeTop - 1)}
                                                        className="flex h-8 w-8 items-center justify-center rounded-lg border border-gray-300 text-base font-bold text-gray-700 hover:bg-white"
                                                        aria-label="Decrease overall exclusion"
                                                    >
                                                        -
                                                    </button>
                                                    <input
                                                        type="number"
                                                        min={0}
                                                        value={excludeTop}
                                                        onChange={(e) => updateExcludeTop(Number(e.target.value))}
                                                        className="h-8 w-16 rounded-lg border border-gray-300 bg-white text-center text-xs font-bold text-gray-800 outline-none focus:border-green-500"
                                                    />
                                                    <button
                                                        type="button"
                                                        onClick={() => updateExcludeTop(excludeTop + 1)}
                                                        className="flex h-8 w-8 items-center justify-center rounded-lg border border-gray-300 text-base font-bold text-gray-700 hover:bg-white"
                                                        aria-label="Increase overall exclusion"
                                                    >
                                                        +
                                                    </button>
                                                </div>
                                            </div>
                                        </div>

                                        <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-[11px] leading-4 text-amber-800">
                                            <p className="font-bold">{language === 'th' ? 'สรุปการแสดงผล' : 'Display summary'}</p>
                                            <p className="mt-1">
                                                {disableAgeGroupRanking
                                                    ? (language === 'th' ? 'แสดงอันดับทั่วไปแยกชาย/หญิงแทนกลุ่มอายุ' : 'Shows normal male/female rankings instead of age-group sections')
                                                    : (excludeTop === 0
                                                        ? (language === 'th' ? 'ทุกคนยังอยู่ในอันดับกลุ่มอายุตามปกติ' : 'All runners remain in age-group rankings')
                                                        : (language === 'th' ? `ตัด Overall 1-${excludeTop} ออกจากอันดับกลุ่มอายุ` : `Excludes Overall 1-${excludeTop} from age-group rankings`))}
                                            </p>
                                            <p className="mt-1 text-amber-700/90">
                                                {language === 'th' ? 'มีผลเฉพาะหน้า Result-Winners' : 'This only affects the Result-Winners page'}
                                            </p>
                                        </div>

                                        <button
                                            onClick={handleSave}
                                            disabled={saving}
                                            className={`w-full rounded-xl px-4 py-2.5 text-sm font-bold text-white transition-all ${
                                                saving ? 'bg-gray-400 cursor-wait' : 'bg-green-600 hover:bg-green-700 cursor-pointer'
                                            }`}
                                        >
                                            {saving
                                                ? (language === 'th' ? 'กำลังบันทึก...' : 'Saving...')
                                                : (language === 'th' ? '💾 บันทึกการตั้งค่า' : '💾 Save Settings')}
                                        </button>
                                    </div>
                                </div>
                            </div>

                            <div className="flex min-h-0 flex-col rounded-2xl border border-gray-200 bg-gray-50 p-4 shadow-sm">
                                <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                                    <div>
                                        <h3 className="text-sm font-bold text-gray-800">
                                            {language === 'th' ? 'พรีวิวหน้า Result-Winners' : 'Result-Winners preview'}
                                        </h3>
                                        <p className="mt-1 text-[11px] text-gray-500">
                                            {language === 'th'
                                                ? 'เลือกประเภทแล้วดูผลลัพธ์แบบย่อได้ทันที'
                                                : 'Pick a category and preview the compact result instantly'}
                                        </p>
                                    </div>
                                    {previewCategory && (
                                        <div className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-[11px] font-semibold text-gray-600">
                                            {previewCategory.name}{previewCategory.distance ? ` (${previewCategory.distance})` : ''}
                                        </div>
                                    )}
                                </div>

                                {campaign.categories && campaign.categories.length > 0 && (
                                    <div className="mt-3 flex flex-wrap gap-1.5">
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
                                )}

                                <div className="mt-3 min-h-0 flex-1 overflow-y-auto pr-1">
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
                                            {renderPreviewColumn(disableAgeGroupRanking ? (language === 'th' ? 'อันดับชาย' : 'Male ranking') : (language === 'th' ? 'ผู้ชนะชาย' : 'Male winners'), 'bg-blue-600', 'bg-blue-900', maleWinners)}
                                            {renderPreviewColumn(disableAgeGroupRanking ? (language === 'th' ? 'อันดับหญิง' : 'Female ranking') : (language === 'th' ? 'ผู้ชนะหญิง' : 'Female winners'), 'bg-pink-600', 'bg-pink-900', femaleWinners)}
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    </>
                )}
            </div>
        </AdminLayout>
    );
}
