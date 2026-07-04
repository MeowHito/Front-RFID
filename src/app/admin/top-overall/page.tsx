'use client';

import { useState, useEffect, useMemo } from 'react';
import AdminLayout from '@/app/admin/AdminLayout';
import { useLanguage } from '@/lib/language-context';
import { authHeaders } from '@/lib/authHeaders';
import { isThaiNationality, isNationalitySplitCategory } from '@/lib/nationality';
import { LinkIcon } from '@heroicons/react/24/outline';

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
    separateOverallNationalityCategories?: string[];
    categories?: { name: string; distance?: string }[];
}

const DEFAULT_TOP_N = 5;
const MIN_TOP_N = 1;
const MAX_TOP_N = 1000;

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
    const [overallDisplayCount, setOverallDisplayCount] = useState<number>(DEFAULT_TOP_N);
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
                setOverallDisplayCount(Math.min(MAX_TOP_N, Math.max(MIN_TOP_N, Number(data?.overallDisplayCount) || DEFAULT_TOP_N)));
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

    // Whether the currently selected category splits Overall by nationality
    const selectedCategorySplit = isNationalitySplitCategory(natSplitCategories, selectedCategory);

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
    const overallShareUrl = campaignPath ? `${origin}/Overall-Winners/${campaignPath}` : '';

    const renderOverallPreviewColumn = (title: string, headerClass: string, runners: Runner[]) => (
        <div className="space-y-0">
            <div className={`overflow-hidden rounded-t-lg ${headerClass}`} style={{ color: '#ffffff' }}>
                <div className="px-3 py-2 text-center text-xs font-bold">
                    {title}
                </div>
                <div className="px-4 py-1.5 text-center text-[11px] font-bold">
                    {language === 'th' ? 'อันดับ Overall' : 'Overall ranking'}
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

    const updateOverallDisplayCount = (value: number) => {
        const normalized = Number.isFinite(value) ? Math.min(MAX_TOP_N, Math.max(MIN_TOP_N, Math.floor(value))) : DEFAULT_TOP_N;
        setOverallDisplayCount(normalized);
    };

    const handleSave = async () => {
        if (!campaign?._id) return;
        setSaving(true);
        try {
            const res = await fetch(`/api/campaigns/${campaign._id}`, {
                method: 'PUT',
                headers: authHeaders(),
                body: JSON.stringify({
                    overallDisplayCount: overallDisplayCount,
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
                { label: 'Top Overall', labelEn: 'Top Overall' }
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
                                {language === 'th' ? 'อันดับ Top Overall' : 'Top Overall'}
                            </span>
                            <button
                                type="button"
                                onClick={() => handleCopyLink(overallShareUrl)}
                                title={language === 'th' ? 'คัดลอกลิงก์' : 'Copy link'}
                                className="flex items-center justify-center rounded-md bg-sky-500 px-2.5 py-1.5 text-white hover:bg-sky-600 transition-colors"
                            >
                                <LinkIcon className="h-4 w-4" />
                            </button>

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

                        <div className="mt-4 rounded-2xl border border-gray-200 bg-[#f8fafc] p-3">
                            <div className="mt-1 grid items-center gap-2 md:grid-cols-[1fr_auto_1fr]">
                                <div className="justify-self-start">{renderCategoryTabs()}</div>
                                <div className="justify-self-center flex items-center gap-1.5 rounded-lg border border-sky-200 bg-sky-50 px-2 py-1.5">
                                    <span className="text-[11px] font-bold" style={{ color: '#0369a1' }}>
                                        {language === 'th' ? 'จำนวน Overall:' : 'Overall count:'}
                                    </span>
                                    <input
                                        type="number"
                                        min={MIN_TOP_N}
                                        max={MAX_TOP_N}
                                        value={overallDisplayCount}
                                        onChange={(e) => updateOverallDisplayCount(e.target.value === '' ? DEFAULT_TOP_N : Number(e.target.value))}
                                        className="h-9 w-20 rounded-lg border-2 border-sky-400 bg-white text-center font-semibold outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-100"
                                        style={{ color: '#0369a1', fontSize: '15px' }}
                                    />
                                    <span className="text-[11px] font-bold" style={{ color: '#0369a1' }}>
                                        {language === 'th' ? `อันดับแรก (1-${MAX_TOP_N})` : `top ranks (1-${MAX_TOP_N})`}
                                    </span>
                                </div>
                                {/* Thai / foreign split toggle — per selected category */}
                                <div className="justify-self-end flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-1.5">
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
                                            ? 'แยกอันดับ Overall ตามสัญชาติ เฉพาะระยะที่เลือก — ถ้าไม่ติ๊กจะรวมไทยและต่างชาติ'
                                            : 'Split Overall by nationality for the selected category — leave off to combine Thai and foreign'}
                                    >
                                        <span
                                            className="inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform"
                                            style={{ transform: selectedCategorySplit ? 'translateX(22px)' : 'translateX(2px)' }}
                                        />
                                    </button>
                                </div>
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
                    </div>
                )}
            </div>
        </AdminLayout>
    );
}
