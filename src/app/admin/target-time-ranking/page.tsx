'use client';

import { useState, useEffect, useMemo } from 'react';
import AdminLayout from '@/app/admin/AdminLayout';
import { useLanguage } from '@/lib/language-context';
import { authHeaders } from '@/lib/authHeaders';
import { LinkIcon, PlusIcon, TrashIcon } from '@heroicons/react/24/outline';

interface Runner {
    _id: string;
    bib: string;
    firstName: string;
    lastName: string;
    gender: string;
    status: string;
    netTime?: number;
    gunTime?: number;
    elapsedTime?: number;
    netTimeStr?: string;
}

interface TargetTimeBand {
    label: string;
    minMinutes: number;
    maxMinutes: number;
}

interface TargetTimeBandGroup {
    category: string;
    bands: TargetTimeBand[];
}

interface FeaturedCampaignSettings {
    _id: string;
    name: string;
    slug?: string;
    categories?: { name: string; distance?: string }[];
    targetTimeBands?: TargetTimeBandGroup[];
}

const DEFAULT_BANDS: TargetTimeBand[] = [
    { label: 'sub 40', minMinutes: 0, maxMinutes: 40 },
    { label: 'sub 45', minMinutes: 40, maxMinutes: 45 },
    { label: 'sub 50', minMinutes: 45, maxMinutes: 50 },
];

/** Runner's effective finish time in ms (net preferred, then gun, then elapsed) */
function runnerTimeMs(r: Runner): number {
    return r.netTime || r.gunTime || r.elapsedTime || 0;
}

function formatTime(ms: number | undefined | null): string {
    if (ms === undefined || ms === null || ms <= 0) return '-';
    const hours = Math.floor(ms / 3600000);
    const minutes = Math.floor((ms % 3600000) / 60000);
    const seconds = Math.floor((ms % 60000) / 1000);
    return `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

/** Format a minutes value (may be decimal) as mm:ss */
function formatMinutes(min: number): string {
    const totalSec = Math.round(min * 60);
    const mm = Math.floor(totalSec / 60);
    const ss = totalSec % 60;
    return `${mm}:${String(ss).padStart(2, '0')}`;
}

export default function TargetTimeRankingPage() {
    const { language } = useLanguage();
    const [campaign, setCampaign] = useState<FeaturedCampaignSettings | null>(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [selectedCategory, setSelectedCategory] = useState('');
    // bands kept per category in local state until saved
    const [bandsByCategory, setBandsByCategory] = useState<Record<string, TargetTimeBand[]>>({});
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
                const map: Record<string, TargetTimeBand[]> = {};
                for (const g of (data?.targetTimeBands || [])) {
                    if (g?.category) map[g.category] = Array.isArray(g.bands) ? g.bands : [];
                }
                setBandsByCategory(map);
                setSelectedCategory(data?.categories?.[0]?.name || '');
            }
        } catch { /* */ } finally {
            setLoading(false);
        }
    };

    // Load runners for preview when category changes
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

    // Bands for the currently selected category (sorted by lower bound)
    const currentBands = useMemo(() => {
        return bandsByCategory[selectedCategory] || [];
    }, [bandsByCategory, selectedCategory]);

    const sortedFinishedRunners = useMemo(() => {
        return [...previewRunners]
            .filter(r => r.status === 'finished' && runnerTimeMs(r) > 0)
            .sort((a, b) => runnerTimeMs(a) - runnerTimeMs(b));
    }, [previewRunners]);

    // Group runners into bands (all runners shown, ranked by time)
    const runnersByBand = useMemo(() => {
        const result: Record<number, Runner[]> = {};
        currentBands.forEach((_, i) => { result[i] = []; });
        for (const runner of sortedFinishedRunners) {
            const mins = runnerTimeMs(runner) / 60000;
            const idx = currentBands.findIndex(b => mins >= b.minMinutes && mins < b.maxMinutes);
            if (idx >= 0) result[idx].push(runner);
        }
        return result;
    }, [sortedFinishedRunners, currentBands]);

    const campaignPath = campaign?.slug || campaign?._id || '';
    const shareUrl = campaignPath ? `${origin}/Target-Time-Winners/${campaignPath}` : '';

    /* ── Band editor mutations ── */
    const setCurrentBands = (next: TargetTimeBand[]) => {
        setBandsByCategory(prev => ({ ...prev, [selectedCategory]: next }));
    };

    const addBand = () => {
        const last = currentBands[currentBands.length - 1];
        const min = last ? last.maxMinutes : 0;
        const max = min + 5;
        setCurrentBands([...currentBands, { label: `sub ${max}`, minMinutes: min, maxMinutes: max }]);
    };

    const loadDefaultBands = () => {
        setCurrentBands(DEFAULT_BANDS.map(b => ({ ...b })));
    };

    const removeBand = (index: number) => {
        setCurrentBands(currentBands.filter((_, i) => i !== index));
    };

    const updateBand = (index: number, patch: Partial<TargetTimeBand>) => {
        setCurrentBands(currentBands.map((b, i) => i === index ? { ...b, ...patch } : b));
    };

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

    const handleSave = async () => {
        if (!campaign?._id) return;

        // Validate every band of every category
        for (const [cat, bands] of Object.entries(bandsByCategory)) {
            for (const b of bands) {
                if (!b.label || !b.label.trim()) {
                    showToast(language === 'th' ? `กรุณาตั้งชื่อช่วงเวลาให้ครบ (${cat})` : `Please name all bands (${cat})`, 'error');
                    return;
                }
                if (!(b.maxMinutes > b.minMinutes)) {
                    showToast(language === 'th' ? `เวลา "ถึง" ต้องมากกว่า "จาก" (${cat} · ${b.label})` : `"To" must be greater than "From" (${cat} · ${b.label})`, 'error');
                    return;
                }
            }
        }

        // Build the array, keeping only categories that actually have bands
        const targetTimeBands: TargetTimeBandGroup[] = Object.entries(bandsByCategory)
            .filter(([, bands]) => bands.length > 0)
            .map(([category, bands]) => ({
                category,
                bands: [...bands]
                    .sort((a, b) => a.minMinutes - b.minMinutes)
                    .map(b => ({
                        label: b.label.trim(),
                        minMinutes: Number(b.minMinutes) || 0,
                        maxMinutes: Number(b.maxMinutes) || 0,
                    })),
            }));

        setSaving(true);
        try {
            const res = await fetch(`/api/campaigns/${campaign._id}`, {
                method: 'PUT',
                headers: authHeaders(),
                body: JSON.stringify({ targetTimeBands }),
            });
            if (res.ok) {
                showToast(language === 'th' ? 'บันทึกสำเร็จ' : 'Settings saved', 'success');
                // keep local sorted view in sync
                const map: Record<string, TargetTimeBand[]> = {};
                for (const g of targetTimeBands) map[g.category] = g.bands;
                setBandsByCategory(prev => ({ ...prev, ...map }));
            } else {
                showToast(language === 'th' ? 'บันทึกล้มเหลว' : 'Save failed', 'error');
            }
        } catch {
            showToast('Error saving', 'error');
        } finally {
            setSaving(false);
        }
    };

    const renderCategoryTabs = () => (
        campaign?.categories && campaign.categories.length > 0 ? (
            <div className="flex flex-wrap gap-1.5">
                {campaign.categories.map(category => {
                    const count = bandsByCategory[category.name]?.length || 0;
                    return (
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
                            {count > 0 ? ` · ${count}` : ''}
                        </button>
                    );
                })}
            </div>
        ) : null
    );

    return (
        <AdminLayout
            breadcrumbItems={[
                { label: 'อันดับเวลาตามเป้าหมาย', labelEn: 'Target Time Ranking' }
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
                        <div className="rounded-2xl border border-emerald-200 bg-white p-3 shadow-sm">
                            <div className="flex flex-wrap items-center gap-2">
                                <span className="rounded-md bg-emerald-600 px-3 py-1.5 text-[16px] font-bold text-white">
                                    {language === 'th' ? 'อันดับเวลาตามเป้าหมาย' : 'Target time ranking'}
                                </span>
                                <button
                                    type="button"
                                    onClick={() => handleCopyLink(shareUrl)}
                                    title={language === 'th' ? 'คัดลอกลิงก์' : 'Copy link'}
                                    className="flex items-center justify-center rounded-md bg-sky-500 px-2.5 py-1.5 text-white hover:bg-sky-600 transition-colors"
                                >
                                    <LinkIcon className="h-4 w-4" />
                                </button>
                                <button
                                    onClick={handleSave}
                                    disabled={saving}
                                    className={`ml-auto rounded-md px-4 py-1.5 text-[12px] font-bold text-white transition-all ${saving ? 'bg-gray-400 cursor-wait' : 'bg-green-500 hover:bg-green-600 cursor-pointer'}`}
                                    style={{ color: '#ffffff' }}
                                >
                                    {saving
                                        ? (language === 'th' ? 'กำลังบันทึก...' : 'Saving...')
                                        : (language === 'th' ? 'บันทึก' : 'Save')}
                                </button>
                            </div>

                            <p className="mt-2 text-[11px] text-gray-500">
                                {language === 'th'
                                    ? '1) เลือกระยะ → 2) ตั้งช่วงเวลา (sub) → 3) กดบันทึก  ระบบจะแสดงนักกีฬาทุกคนที่ทำเวลาในแต่ละช่วง'
                                    : '1) Pick a category → 2) Define bands (sub) → 3) Save. All runners within each band are shown.'}
                            </p>

                            {/* Category selector */}
                            <div className="mt-3">{renderCategoryTabs()}</div>

                            {/* Band editor */}
                            <div className="mt-3 rounded-2xl border border-gray-200 bg-[#f8fafc] p-3">
                                <div className="flex items-center justify-between">
                                    <span className="text-[12px] font-bold text-gray-700">
                                        {language === 'th' ? `ช่วงเวลา (sub) สำหรับ "${selectedCategory || '-'}"` : `Bands (sub) for "${selectedCategory || '-'}"`}
                                    </span>
                                    <div className="flex items-center gap-1.5">
                                        {currentBands.length === 0 && (
                                            <button
                                                type="button"
                                                onClick={loadDefaultBands}
                                                className="rounded-md border border-gray-300 bg-white px-2.5 py-1 text-[11px] font-bold text-gray-600 hover:border-gray-400"
                                            >
                                                {language === 'th' ? 'ใช้ค่าเริ่มต้น' : 'Use defaults'}
                                            </button>
                                        )}
                                        <button
                                            type="button"
                                            onClick={addBand}
                                            disabled={!selectedCategory}
                                            className="flex items-center gap-1 rounded-md bg-emerald-600 px-2.5 py-1 text-[11px] font-bold text-white hover:bg-emerald-700 disabled:bg-gray-300"
                                        >
                                            <PlusIcon className="h-3.5 w-3.5" />
                                            {language === 'th' ? 'เพิ่มช่วงเวลา' : 'Add band'}
                                        </button>
                                    </div>
                                </div>

                                {currentBands.length === 0 ? (
                                    <div className="mt-3 rounded-xl border border-dashed border-gray-300 bg-white px-4 py-6 text-center text-[12px] text-gray-400">
                                        {language === 'th' ? 'ยังไม่มีช่วงเวลา — กด “เพิ่มช่วงเวลา” หรือ “ใช้ค่าเริ่มต้น”' : 'No bands yet — click "Add band" or "Use defaults"'}
                                    </div>
                                ) : (
                                    <div className="mt-3 space-y-2">
                                        <div className="hidden md:grid grid-cols-[1fr_120px_120px_40px] gap-2 px-1 text-[10px] font-bold uppercase text-gray-400">
                                            <span>{language === 'th' ? 'ชื่อช่วง' : 'Band name'}</span>
                                            <span>{language === 'th' ? 'จาก (นาที)' : 'From (min)'}</span>
                                            <span>{language === 'th' ? 'ถึง (นาที)' : 'To (min)'}</span>
                                            <span />
                                        </div>
                                        {currentBands.map((band, i) => (
                                            <div key={i} className="grid grid-cols-[1fr_120px_120px_40px] gap-2 items-center">
                                                <input
                                                    type="text"
                                                    value={band.label}
                                                    placeholder="sub 45"
                                                    onChange={e => updateBand(i, { label: e.target.value })}
                                                    className="h-9 rounded-lg border-2 border-emerald-300 bg-white px-3 text-[13px] font-semibold text-gray-800 outline-none focus:border-emerald-500"
                                                />
                                                <input
                                                    type="number"
                                                    min={0}
                                                    step="0.5"
                                                    value={band.minMinutes}
                                                    onChange={e => updateBand(i, { minMinutes: e.target.value === '' ? 0 : Number(e.target.value) })}
                                                    className="h-9 rounded-lg border-2 border-sky-300 bg-white text-center text-[13px] font-semibold text-sky-700 outline-none focus:border-sky-500"
                                                />
                                                <input
                                                    type="number"
                                                    min={0}
                                                    step="0.5"
                                                    value={band.maxMinutes}
                                                    onChange={e => updateBand(i, { maxMinutes: e.target.value === '' ? 0 : Number(e.target.value) })}
                                                    className="h-9 rounded-lg border-2 border-sky-300 bg-white text-center text-[13px] font-semibold text-sky-700 outline-none focus:border-sky-500"
                                                />
                                                <button
                                                    type="button"
                                                    onClick={() => removeBand(i)}
                                                    title={language === 'th' ? 'ลบ' : 'Remove'}
                                                    className="flex h-9 w-9 items-center justify-center rounded-lg border border-red-200 bg-red-50 text-red-500 hover:bg-red-100"
                                                >
                                                    <TrashIcon className="h-4 w-4" />
                                                </button>
                                            </div>
                                        ))}
                                        <p className="px-1 text-[10px] text-gray-400">
                                            {language === 'th'
                                                ? 'เช่น sub 40 = จาก 0 ถึง 40 นาที (00:00–39:59), sub 45 = จาก 40 ถึง 45 (40:00–44:59)'
                                                : 'e.g. sub 40 = from 0 to 40 min, sub 45 = from 40 to 45 min'}
                                        </p>
                                    </div>
                                )}
                            </div>

                            {/* Preview table */}
                            <div className="mt-4 rounded-2xl border border-gray-200 bg-[#f8fafc] p-3">
                                <span className="text-[12px] font-bold text-gray-700">
                                    {language === 'th' ? 'ตัวอย่างผลลัพธ์ (รวมทุกเพศ)' : 'Preview (all genders)'}
                                </span>
                                <div className="mt-3" style={{ maxHeight: '600px', overflowY: 'auto' }}>
                                    {previewLoading ? (
                                        <div className="rounded-xl border border-dashed border-gray-300 bg-white px-4 py-8 text-center text-sm text-gray-500">
                                            {language === 'th' ? 'กำลังโหลดข้อมูลอันดับ...' : 'Loading ranking data...'}
                                        </div>
                                    ) : !selectedCategory ? (
                                        <div className="rounded-xl border border-dashed border-gray-300 bg-white px-4 py-8 text-center text-sm text-gray-500">
                                            {language === 'th' ? 'ไม่มีประเภทการแข่งขันสำหรับแสดงพรีวิว' : 'No category available for preview'}
                                        </div>
                                    ) : currentBands.length === 0 ? (
                                        <div className="rounded-xl border border-dashed border-gray-300 bg-white px-4 py-8 text-center text-sm text-gray-500">
                                            {language === 'th' ? 'กรุณาตั้งช่วงเวลาก่อน' : 'Please define bands first'}
                                        </div>
                                    ) : (
                                        <div className="space-y-3">
                                            {currentBands.map((band, i) => {
                                                const list = runnersByBand[i] || [];
                                                return (
                                                    <div key={i} className="rounded-lg border border-gray-200 bg-white overflow-hidden">
                                                        <div className="flex items-center justify-between bg-emerald-700 px-4 py-1.5 text-white">
                                                            <span className="text-[12px] font-bold">{band.label}</span>
                                                            <span className="text-[10px] font-semibold opacity-90">
                                                                {formatMinutes(band.minMinutes)}–{formatMinutes(band.maxMinutes)} · {list.length} {language === 'th' ? 'คน' : 'runners'}
                                                            </span>
                                                        </div>
                                                        <div className="divide-y divide-gray-100">
                                                            {list.length > 0 ? list.map((runner, index) => (
                                                                <div key={runner._id} className="flex items-center gap-2 px-3 py-1.5">
                                                                    <div className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold text-white ${index === 0 ? 'bg-yellow-500' : index === 1 ? 'bg-gray-400' : index === 2 ? 'bg-amber-700' : 'bg-gray-300'
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
                                                                        {runner.netTimeStr || formatTime(runnerTimeMs(runner))}
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
