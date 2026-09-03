'use client';

import { useState, useEffect, useMemo } from 'react';
import AdminLayout from '@/app/admin/AdminLayout';
import { useLanguage } from '@/lib/language-context';
import { authHeaders } from '@/lib/authHeaders';
import { isThaiNationality, isNationalitySplitCategory } from '@/lib/nationality';
import {
    DEFAULT_OVERALL_DISPLAY_COUNT,
    MAX_OVERALL_DISPLAY_COUNT,
    MIN_OVERALL_DISPLAY_COUNT,
    clampOverallDisplayCount,
    overallCountMapFromConfig,
    overallCountMapToEntries,
    type OverallCountByCategoryEntry,
} from '@/lib/overall-display-count';
import {
    MAX_TOP_RUNNERS_RANK,
    MIN_TOP_RUNNERS_RANK,
    clampTopRunnersRange,
    isTopRunnersExcludeOverall,
    resolveTopRunnersRange,
    sliceTopRunners,
    topRunnersRangeMapFromConfig,
    topRunnersRangeMapToEntries,
    type TopRunnersRange,
    type TopRunnersRangeEntry,
} from '@/lib/top-runners-range';
import { LinkIcon, ArrowTopRightOnSquareIcon } from '@heroicons/react/24/outline';

interface Runner {
    _id: string;
    bib: string;
    firstName: string;
    lastName: string;
    gender: string;
    status: string;
    nationality?: string;
    netTime?: number;
    gunTime?: number;
    elapsedTime?: number;
    netTimeStr?: string;
}

interface FeaturedCampaignSettings {
    _id: string;
    name: string;
    slug?: string;
    overallDisplayCount?: number;
    overallDisplayCountByCategory?: OverallCountByCategoryEntry[];
    topRunnersRangeByCategory?: TopRunnersRangeEntry[];
    topRunnersExcludeOverallCategories?: string[];
    bestOfDisplayCount?: number;
    separateOverallNationalityCategories?: string[];
    categories?: { name: string; distance?: string }[];
}

const DEFAULT_TOP_N = DEFAULT_OVERALL_DISPLAY_COUNT;
const MIN_TOP_N = MIN_OVERALL_DISPLAY_COUNT;
const MAX_TOP_N = MAX_OVERALL_DISPLAY_COUNT;

function formatTime(ms: number | undefined | null): string {
    if (ms === undefined || ms === null || ms <= 0) return '-';
    const hours = Math.floor(ms / 3600000);
    const minutes = Math.floor((ms % 3600000) / 60000);
    const seconds = Math.floor((ms % 60000) / 1000);
    return `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

export default function TopOverallPage() {
    const { language } = useLanguage();
    const [campaign, setCampaign] = useState<FeaturedCampaignSettings | null>(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    // Overall rank count is configured per race distance ("42K top 3, 21K top 5").
    const [overallCountByCategory, setOverallCountByCategory] = useState<Record<string, number>>({});
    // Top Runners shows a rank *range* (e.g. 1-20), also per distance.
    const [topRunnersRanges, setTopRunnersRanges] = useState<Record<string, TopRunnersRange>>({});
    // Distances whose Top Runners board drops the Overall winners.
    const [topRunnersCutCategories, setTopRunnersCutCategories] = useState<string[]>([]);
    const [bestOfDisplayCount, setBestOfDisplayCount] = useState<number>(1);
    const [natSplitCategories, setNatSplitCategories] = useState<string[]>([]);
    const [selectedCategory, setSelectedCategory] = useState('');
    const [previewRunners, setPreviewRunners] = useState<Runner[]>([]);
    const [previewLoading, setPreviewLoading] = useState(false);
    const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
    const origin = typeof window !== 'undefined' ? window.location.origin : '';

    useEffect(() => {
        fetchCampaign();
    }, []);

    const fetchCampaign = async () => {
        try {
            const res = await fetch('/api/campaigns/featured');
            if (res.ok) {
                const data = await res.json();
                setCampaign(data);
                const categoryNames: string[] = Array.isArray(data?.categories)
                    ? data.categories.map((c: { name: string }) => c?.name).filter(Boolean)
                    : [];
                setOverallCountByCategory(overallCountMapFromConfig(data, categoryNames));
                setTopRunnersRanges(topRunnersRangeMapFromConfig(data, categoryNames));
                setTopRunnersCutCategories(Array.isArray(data?.topRunnersExcludeOverallCategories) ? data.topRunnersExcludeOverallCategories : []);
                setBestOfDisplayCount(Math.max(1, Number(data?.bestOfDisplayCount) || 1));
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
                const at = a.gunTime || a.netTime || a.elapsedTime || Infinity; // Overall = gun time
                const bt = b.gunTime || b.netTime || b.elapsedTime || Infinity;
                return at - bt;
            });
    }, [previewRunners]);

    // Whether the currently selected category splits Overall by nationality
    const selectedCategorySplit = isNationalitySplitCategory(natSplitCategories, selectedCategory);

    // Rank count of the distance currently being previewed/edited.
    const overallDisplayCount = clampOverallDisplayCount(
        overallCountByCategory[selectedCategory] ?? campaign?.overallDisplayCount,
    );

    // Rank range of the distance currently being previewed/edited.
    const topRunnersRange = topRunnersRanges[selectedCategory]
        ?? resolveTopRunnersRange(campaign, selectedCategory);

    // How many leading finishers this distance's Top Runners board skips. The cut
    // always equals the distance's Overall award count, so the two settings stay
    // in step when the admin changes the Overall count.
    const selectedCategoryCutsOverall = isTopRunnersExcludeOverall(
        { topRunnersExcludeOverallCategories: topRunnersCutCategories },
        selectedCategory,
    );
    const topRunnersCut = selectedCategoryCutsOverall ? overallDisplayCount : 0;

    const toggleTopRunnersCutForSelected = () => {
        if (!selectedCategory) return;
        setTopRunnersCutCategories(prev => prev.some(c => c === selectedCategory)
            ? prev.filter(c => c !== selectedCategory)
            : [...prev, selectedCategory]);
    };

    const toggleNatSplitForSelected = () => {
        if (!selectedCategory) return;
        setNatSplitCategories(prev => prev.some(c => c === selectedCategory)
            ? prev.filter(c => c !== selectedCategory)
            : [...prev, selectedCategory]);
    };

    const overallMaleWinners = useMemo(() => {
        return sortedFinishedRunners.filter(r => r.gender !== 'F').slice(0, overallDisplayCount);
    }, [sortedFinishedRunners, overallDisplayCount]);

    const overallFemaleWinners = useMemo(() => {
        return sortedFinishedRunners.filter(r => r.gender === 'F').slice(0, overallDisplayCount);
    }, [sortedFinishedRunners, overallDisplayCount]);

    // Top Runners preview — the plain rank slice, no nationality split, matching
    // what /Top-Overall-Winners renders.
    const topRunnersPreview = useMemo(() => ({
        male: sliceTopRunners(sortedFinishedRunners.filter(r => r.gender !== 'F'), topRunnersRange, topRunnersCut),
        female: sliceTopRunners(sortedFinishedRunners.filter(r => r.gender === 'F'), topRunnersRange, topRunnersCut),
    }), [sortedFinishedRunners, topRunnersRange.start, topRunnersRange.end, topRunnersCut]); // eslint-disable-line react-hooks/exhaustive-deps

    // Nationality-split overall winners (top N per gender × Thai/foreign group).
    const overallByNationality = useMemo(() => {
        const pick = (isFemale: boolean, thai: boolean) =>
            sortedFinishedRunners
                .filter(r => (r.gender === 'F') === isFemale && isThaiNationality(r.nationality) === thai)
                .slice(0, overallDisplayCount);
        return {
            thaiMale: pick(false, true),
            thaiFemale: pick(true, true),
            foreignMale: pick(false, false),
            foreignFemale: pick(true, false),
        };
    }, [sortedFinishedRunners, overallDisplayCount]);

    const campaignPath = campaign?.slug || campaign?._id || '';
    const topOverallShareUrl = campaignPath
        ? `${origin}/Top-Overall-Winners/${campaignPath}${selectedCategory ? `?category=${encodeURIComponent(selectedCategory)}` : ''}`
        : '';

    const renderOverallPreviewColumn = (title: string, headerClass: string, runners: Runner[]) => (
        <div className="space-y-0">
            <div className={`overflow-hidden rounded-t-lg ${headerClass}`} style={{ color: '#ffffff' }}>
                <div className="px-3 py-2 text-center text-xs font-bold">
                    {title}
                </div>
                <div className="px-4 py-1.5 text-center text-[11px] font-bold">
                    {language === 'th' ? `อันดับ 1-${overallDisplayCount}` : `Rank 1-${overallDisplayCount}`}
                </div>
            </div>
            <div className="rounded-b-lg border border-t-0 border-gray-200 bg-white overflow-hidden">
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

    const renderTopRunnersPreviewColumn = (title: string, headerClass: string, rows: { runner: Runner; rank: number }[]) => (
        <div className="space-y-0">
            <div className={`overflow-hidden rounded-t-lg ${headerClass}`} style={{ color: '#ffffff' }}>
                <div className="px-3 py-2 text-center text-xs font-bold">{title}</div>
                <div className="px-4 py-1.5 text-center text-[11px] font-bold">
                    {language === 'th'
                        ? `อันดับ ${topRunnersCut + topRunnersRange.start}-${topRunnersCut + topRunnersRange.end}`
                        : `Ranks ${topRunnersCut + topRunnersRange.start}-${topRunnersCut + topRunnersRange.end}`}
                </div>
            </div>
            <div className="rounded-b-lg border border-t-0 border-gray-200 bg-white overflow-hidden">
                <div className="divide-y divide-gray-100">
                    {rows.length > 0 ? rows.map(({ runner, rank }) => (
                        <div key={`tr-${title}-${rank}`} className="flex items-center gap-2 px-3 py-1.5">
                            <div className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold text-white ${
                                rank === 1 ? 'bg-yellow-500' : rank === 2 ? 'bg-gray-400' : rank === 3 ? 'bg-amber-700' : 'bg-gray-300 text-gray-600'
                            }`} style={rank > 3 ? { color: '#4b5563' } : undefined}>
                                {rank}
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
                        {/* Each distance carries its own Overall rank count */}
                        <span
                            className={`ml-1.5 rounded-full px-1.5 py-px text-[10px] font-extrabold ${selectedCategory === category.name ? 'bg-white/25' : 'bg-sky-100'}`}
                            style={selectedCategory === category.name ? { color: '#ffffff' } : { color: '#0369a1' }}
                        >
                            {clampOverallDisplayCount(overallCountByCategory[category.name] ?? campaign?.overallDisplayCount)}
                        </span>
                        {/* …and its own Top Runners rank range */}
                        <span
                            className={`ml-1 rounded-full px-1.5 py-px text-[10px] font-extrabold ${selectedCategory === category.name ? 'bg-white/25' : 'bg-violet-100'}`}
                            style={selectedCategory === category.name ? { color: '#ffffff' } : { color: '#6d28d9' }}
                        >
                            {(() => {
                                const r = topRunnersRanges[category.name] ?? resolveTopRunnersRange(campaign, category.name);
                                const cut = isTopRunnersExcludeOverall({ topRunnersExcludeOverallCategories: topRunnersCutCategories }, category.name)
                                    ? clampOverallDisplayCount(overallCountByCategory[category.name] ?? campaign?.overallDisplayCount)
                                    : 0;
                                return `${cut + r.start}-${cut + r.end}`;
                            })()}
                        </span>
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

    // Only the selected distance's count changes — other distances keep theirs.
    const updateOverallDisplayCount = (value: number) => {
        if (!selectedCategory) return;
        const normalized = clampOverallDisplayCount(value);
        setOverallCountByCategory(prev => ({ ...prev, [selectedCategory]: normalized }));
    };

    // Only the selected distance's range changes — other distances keep theirs.
    const updateTopRunnersRange = (patch: Partial<TopRunnersRange>) => {
        if (!selectedCategory) return;
        setTopRunnersRanges(prev => {
            const current = prev[selectedCategory] ?? topRunnersRange;
            const next = { ...current, ...patch };
            // Only clamp the edited end here; forcing end >= start on every
            // keystroke would fight the user while they retype the start.
            return { ...prev, [selectedCategory]: next };
        });
    };

    // Clamp on blur so `end >= start` is enforced once the user is done typing.
    const commitTopRunnersRange = () => {
        if (!selectedCategory) return;
        setTopRunnersRanges(prev => ({
            ...prev,
            [selectedCategory]: clampTopRunnersRange(prev[selectedCategory]?.start, prev[selectedCategory]?.end),
        }));
    };

    const updateBestOfDisplayCount = (value: number) => {
        const normalized = Number.isFinite(value) ? Math.max(1, Math.floor(value)) : 1;
        setBestOfDisplayCount(normalized);
    };

    const handleSave = async () => {
        if (!campaign?._id) return;
        setSaving(true);
        try {
            const res = await fetch(`/api/campaigns/${campaign._id}`, {
                method: 'PUT',
                headers: authHeaders(),
                body: JSON.stringify({
                    // Per-distance counts; the campaign-wide value stays the fallback
                    // for any distance without its own entry.
                    overallDisplayCountByCategory: overallCountMapToEntries(overallCountByCategory),
                    overallDisplayCount: clampOverallDisplayCount(campaign.overallDisplayCount),
                    topRunnersRangeByCategory: topRunnersRangeMapToEntries(topRunnersRanges),
                    topRunnersExcludeOverallCategories: topRunnersCutCategories,
                    bestOfDisplayCount: bestOfDisplayCount,
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
                { label: 'Top Runners', labelEn: 'Top Runners' }
            ]}
        >
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
                    <div className="rounded-2xl border border-sky-200 bg-white p-3 shadow-sm">
                        <div className="flex flex-wrap items-center gap-2">
                            <span className="px-3 py-1.5 text-[19px] font-bold text-gray-900">
                                {language === 'th' ? 'อันดับ Top Runners' : 'Top Runners'}
                            </span>
                            <button
                                type="button"
                                onClick={() => handleCopyLink(topOverallShareUrl)}
                                title={language === 'th' ? 'คัดลอกลิงก์' : 'Copy link'}
                                className="flex items-center justify-center rounded-md bg-sky-500 px-2.5 py-1.5 text-white hover:bg-sky-600 transition-colors"
                            >
                                <LinkIcon className="h-4 w-4" />
                            </button>
                            <a
                                href={topOverallShareUrl || undefined}
                                target="_blank"
                                rel="noopener noreferrer"
                                title={language === 'th' ? 'เปิดในแท็บใหม่' : 'Open in new tab'}
                                aria-disabled={!topOverallShareUrl}
                                className={`flex items-center justify-center rounded-md px-2.5 py-1.5 text-white transition-colors ${topOverallShareUrl ? 'bg-indigo-500 hover:bg-indigo-600' : 'bg-gray-300 pointer-events-none'}`}
                            >
                                <ArrowTopRightOnSquareIcon className="h-4 w-4" />
                            </a>

                            <button
                                onClick={handleSave}
                                disabled={saving}
                                className={`ml-auto rounded-md px-4 py-1.5 text-[11px] font-bold text-white transition-all ${saving ? 'bg-gray-400 cursor-wait' : 'bg-green-500 hover:bg-green-600 cursor-pointer'}`}
                                style={{ color: '#ffffff' }}
                            >
                                {saving
                                    ? (language === 'th' ? 'กำลังบันทึก...' : 'Saving...')
                                    : (language === 'th' ? 'บันทึก' : 'Save')}
                            </button>
                        </div>

                        <div className="mt-3 flex flex-wrap items-center gap-2">
                            <div className="flex items-center gap-1.5 rounded-lg border border-amber-200 bg-amber-50 px-2 py-1.5">
                                <span className="text-[11px] font-bold" style={{ color: '#92400e' }}>
                                    {language === 'th'
                                        ? `Best Of ${campaign?.name || ''} กี่อันดับ:`
                                        : `Best Of ${campaign?.name || ''} — top ranks:`}
                                </span>
                                <input
                                    type="number"
                                    min={1}
                                    value={bestOfDisplayCount}
                                    onChange={(e) => updateBestOfDisplayCount(e.target.value === '' ? 1 : Number(e.target.value))}
                                    className="h-9 w-20 rounded-lg border-2 border-amber-400 bg-white text-center font-semibold outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-100"
                                    style={{ color: '#92400e', fontSize: '15px' }}
                                />
                                <span className="text-[11px] font-bold" style={{ color: '#92400e' }}>
                                    {language === 'th' ? 'อันดับแรก / เพศ' : 'top per gender'}
                                </span>
                            </div>
                        </div>

                        <div className="mt-4 rounded-2xl border border-gray-200 bg-[#f8fafc] p-3">
                            {/* Distances first, then the settings for whichever one is selected —
                                the two boards are named on their own cards so "Overall" and
                                "Top Runners" can never be read as the same number. */}
                            <div>{renderCategoryTabs()}</div>

                            <div className="mt-3 grid gap-3 lg:grid-cols-2">
                                {/* Board 1 — the Overall award */}
                                <div className="rounded-xl border-2 border-sky-300 bg-sky-50 p-3">
                                    <div className="flex items-baseline gap-2">
                                        <span className="text-[15px] font-extrabold" style={{ color: '#0369a1' }}>
                                            🏆 {language === 'th' ? 'รางวัล Overall' : 'Overall award'}
                                        </span>
                                        <span className="text-[12px] font-bold text-gray-500">
                                            {selectedCategory || '—'}
                                        </span>
                                    </div>
                                    <p className="mt-0.5 text-[11px] text-gray-500">
                                        {language === 'th'
                                            ? 'ผู้ที่ได้รางวัล Overall — ใช้กับหน้า Overall / ใบเซอร์ / e-slip'
                                            : 'Overall award winners — used by the Overall board, certificates and e-slips'}
                                    </p>
                                    <div className="mt-2 flex flex-wrap items-center gap-2">
                                        <span className="text-[13px] font-bold" style={{ color: '#0369a1' }}>
                                            {language === 'th' ? 'ให้รางวัล' : 'Award the top'}
                                        </span>
                                        <input
                                            type="number"
                                            min={MIN_TOP_N}
                                            max={MAX_TOP_N}
                                            value={overallDisplayCount}
                                            disabled={!selectedCategory}
                                            onChange={(e) => updateOverallDisplayCount(e.target.value === '' ? DEFAULT_TOP_N : Number(e.target.value))}
                                            title={language === 'th'
                                                ? 'จำนวนอันดับ Overall (ผู้ได้รางวัล) ของระยะที่เลือก — แต่ละระยะตั้งค่าแยกกันได้'
                                                : 'Overall (award) rank count for the selected distance — each distance is configured separately'}
                                            className="h-11 w-24 rounded-lg border-2 border-sky-400 bg-white text-center font-extrabold outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-100 disabled:opacity-50"
                                            style={{ color: '#0369a1', fontSize: '20px' }}
                                        />
                                        <span className="text-[13px] font-bold" style={{ color: '#0369a1' }}>
                                            {language === 'th' ? `อันดับแรก / เพศ  (1-${MAX_TOP_N})` : `ranks per gender  (1-${MAX_TOP_N})`}
                                        </span>
                                    </div>
                                </div>

                                {/* Board 2 — the Top Runners listing */}
                                <div className="rounded-xl border-2 border-violet-300 bg-violet-50 p-3">
                                    <div className="flex items-baseline gap-2">
                                        <span className="text-[15px] font-extrabold" style={{ color: '#6d28d9' }}>
                                            📋 {language === 'th' ? 'บอร์ด Top Runners' : 'Top Runners board'}
                                        </span>
                                        <span className="text-[12px] font-bold text-gray-500">
                                            {selectedCategory || '—'}
                                        </span>
                                    </div>
                                    <p className="mt-0.5 text-[11px] text-gray-500">
                                        {language === 'th'
                                            ? 'รายชื่อที่โชว์บนหน้า Top Runners — ไม่ใช่รางวัล'
                                            : 'The list shown on the Top Runners board — not an award'}
                                    </p>
                                    <div className="mt-2 flex flex-wrap items-center gap-2">
                                        <span className="text-[13px] font-bold" style={{ color: '#6d28d9' }}>
                                            {language === 'th' ? 'แสดงอันดับที่' : 'Show ranks'}
                                        </span>
                                        <input
                                            type="number"
                                            min={MIN_TOP_RUNNERS_RANK}
                                            max={MAX_TOP_RUNNERS_RANK}
                                            value={topRunnersRange.start}
                                            disabled={!selectedCategory}
                                            onChange={(e) => updateTopRunnersRange({ start: e.target.value === '' ? MIN_TOP_RUNNERS_RANK : Number(e.target.value) })}
                                            onBlur={commitTopRunnersRange}
                                            className="h-11 w-20 rounded-lg border-2 border-violet-400 bg-white text-center font-extrabold outline-none focus:border-violet-500 focus:ring-2 focus:ring-violet-100 disabled:opacity-50"
                                            style={{ color: '#6d28d9', fontSize: '20px' }}
                                        />
                                        <span className="text-[13px] font-bold" style={{ color: '#6d28d9' }}>
                                            {language === 'th' ? 'ถึง' : 'to'}
                                        </span>
                                        <input
                                            type="number"
                                            min={MIN_TOP_RUNNERS_RANK}
                                            max={MAX_TOP_RUNNERS_RANK}
                                            value={topRunnersRange.end}
                                            disabled={!selectedCategory}
                                            onChange={(e) => updateTopRunnersRange({ end: e.target.value === '' ? MIN_TOP_RUNNERS_RANK : Number(e.target.value) })}
                                            onBlur={commitTopRunnersRange}
                                            className="h-11 w-20 rounded-lg border-2 border-violet-400 bg-white text-center font-extrabold outline-none focus:border-violet-500 focus:ring-2 focus:ring-violet-100 disabled:opacity-50"
                                            style={{ color: '#6d28d9', fontSize: '20px' }}
                                        />
                                        <span className="text-[13px] font-bold" style={{ color: '#6d28d9' }}>
                                            {language === 'th'
                                                ? `= ${topRunnersRange.end - topRunnersRange.start + 1} คน / เพศ`
                                                : `= ${topRunnersRange.end - topRunnersRange.start + 1} per gender`}
                                        </span>
                                    </div>
                                    {/* Drop the Overall winners so the same runner isn't listed twice */}
                                    <div className="mt-2 flex flex-wrap items-center gap-2 rounded-lg bg-white/70 px-2 py-1.5">
                                        <button
                                            type="button"
                                            role="switch"
                                            aria-checked={selectedCategoryCutsOverall}
                                            onClick={toggleTopRunnersCutForSelected}
                                            disabled={!selectedCategory}
                                            className="relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors"
                                            style={{ backgroundColor: selectedCategoryCutsOverall ? '#7c3aed' : '#cbd5e1', cursor: selectedCategory ? 'pointer' : 'not-allowed' }}
                                            title={language === 'th'
                                                ? 'ตัดคนที่ได้รางวัล Overall ออกจากบอร์ดนี้ แล้วดึงคนถัดไปมาเติมจนครบจำนวนแถว'
                                                : 'Drop the Overall winners from this board and backfill from further down the field'}
                                        >
                                            <span
                                                className="inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform"
                                                style={{ transform: selectedCategoryCutsOverall ? 'translateX(22px)' : 'translateX(2px)' }}
                                            />
                                        </button>
                                        <span className="text-[13px] font-bold" style={{ color: '#6d28d9' }}>
                                            {language === 'th' ? 'ตัดคนที่ได้รางวัล Overall ออก' : 'Drop the Overall winners'}
                                        </span>
                                        <span className="text-[11px] font-semibold text-gray-500">
                                            {selectedCategoryCutsOverall
                                                ? (language === 'th'
                                                    ? `ข้าม ${overallDisplayCount} คนแรก → เริ่มที่อันดับ ${topRunnersCut + topRunnersRange.start}`
                                                    : `skips the first ${overallDisplayCount} → starts at rank ${topRunnersCut + topRunnersRange.start}`)
                                                : (language === 'th' ? 'ปิดอยู่ — รวมผู้ได้ Overall ด้วย' : 'off — Overall winners included')}
                                        </span>
                                    </div>
                                </div>
                            </div>

                            {/* Thai / foreign split toggle — per selected category, Overall board only */}
                            <div className="mt-3 flex flex-wrap items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-1.5">
                                <span className="text-[12px] font-bold" style={{ color: '#047857' }}>
                                    {language === 'th'
                                        ? `แยกไทย / ต่างชาติ (เฉพาะรางวัล Overall)${selectedCategory ? ` — ${selectedCategory}` : ''}`
                                        : `Split Thai / foreign (Overall award only)${selectedCategory ? ` — ${selectedCategory}` : ''}`}
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
                                        ? 'แยกอันดับ Overall ตามสัญชาติ เฉพาะระยะที่เลือก — ถ้าไม่ติ๊กจะรวมไทยและต่างชาติ'
                                        : 'Split Overall by nationality for the selected category — leave off to combine Thai and foreign'}
                                >
                                    <span
                                        className="inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform"
                                        style={{ transform: selectedCategorySplit ? 'translateX(22px)' : 'translateX(2px)' }}
                                    />
                                </button>
                            </div>

                            <div className="mt-3" style={{ maxHeight: '600px', overflowY: 'auto' }}>
                                {previewLoading ? (
                                    <div className="rounded-xl border border-dashed border-gray-300 bg-white px-4 py-8 text-center text-sm text-gray-500">
                                        {language === 'th' ? 'กำลังโหลดข้อมูลอันดับ...' : 'Loading ranking data...'}
                                    </div>
                                ) : !selectedCategory ? (
                                    <div className="rounded-xl border border-dashed border-gray-300 bg-white px-4 py-8 text-center text-sm text-gray-500">
                                        {language === 'th' ? 'ไม่มีประเภทการแข่งขันสำหรับแสดงพรีวิว' : 'No category available for preview'}
                                    </div>
                                ) : selectedCategorySplit ? (
                                    <div className="grid gap-3 xl:grid-cols-2">
                                        {renderOverallPreviewColumn(language === 'th' ? '♂ OVERALL THA · ชาย' : '♂ OVERALL THA · Male', 'bg-blue-600', overallByNationality.thaiMale)}
                                        {renderOverallPreviewColumn(language === 'th' ? '♀ OVERALL THA · หญิง' : '♀ OVERALL THA · Female', 'bg-pink-600', overallByNationality.thaiFemale)}
                                        {renderOverallPreviewColumn(language === 'th' ? '♂ OVERALL INT · ชาย' : '♂ OVERALL INT · Male', 'bg-indigo-600', overallByNationality.foreignMale)}
                                        {renderOverallPreviewColumn(language === 'th' ? '♀ OVERALL INT · หญิง' : '♀ OVERALL INT · Female', 'bg-fuchsia-600', overallByNationality.foreignFemale)}
                                    </div>
                                ) : (
                                    <div className="grid gap-3 xl:grid-cols-2">
                                        {renderOverallPreviewColumn(language === 'th' ? '♂ อันดับชาย' : '♂ Male overall', 'bg-blue-600', overallMaleWinners)}
                                        {renderOverallPreviewColumn(language === 'th' ? '♀ อันดับหญิง' : '♀ Female overall', 'bg-pink-600', overallFemaleWinners)}
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Separate preview: the Top Runners board is never split by
                            nationality, so it gets its own section. */}
                        <div className="mt-4 rounded-2xl border border-violet-200 bg-violet-50/40 p-3">
                            <div className="mb-2 text-[13px] font-bold" style={{ color: '#6d28d9' }}>
                                {language === 'th'
                                    ? `พรีวิว Top Runners — อันดับ ${topRunnersCut + topRunnersRange.start}-${topRunnersCut + topRunnersRange.end}${selectedCategory ? ` (${selectedCategory})` : ''}`
                                    : `Top Runners preview — ranks ${topRunnersCut + topRunnersRange.start}-${topRunnersCut + topRunnersRange.end}${selectedCategory ? ` (${selectedCategory})` : ''}`}
                            </div>
                            <div style={{ maxHeight: '600px', overflowY: 'auto' }}>
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
                                        {renderTopRunnersPreviewColumn(language === 'th' ? '♂ TOP RUNNERS · ชาย' : '♂ TOP RUNNERS · Male', 'bg-blue-600', topRunnersPreview.male)}
                                        {renderTopRunnersPreviewColumn(language === 'th' ? '♀ TOP RUNNERS · หญิง' : '♀ TOP RUNNERS · Female', 'bg-pink-600', topRunnersPreview.female)}
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </AdminLayout>
    );
}
