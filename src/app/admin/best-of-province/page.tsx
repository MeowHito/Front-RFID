'use client';

import { useState, useEffect, useMemo } from 'react';
import AdminLayout from '@/app/admin/AdminLayout';
import { useLanguage } from '@/lib/language-context';
import { authHeaders } from '@/lib/authHeaders';
import { THAI_PROVINCES, provinceEnName } from '@/lib/thai-provinces';
import { LinkIcon, ArrowTopRightOnSquareIcon, PlusIcon, XMarkIcon, MagnifyingGlassIcon } from '@heroicons/react/24/outline';

interface BestOfProvince {
    province: string;
    count: number;
}

interface FeaturedCampaignSettings {
    _id: string;
    name: string;
    slug?: string;
    bestOfProvinceEnabled?: boolean;
    bestOfProvinces?: BestOfProvince[];
    categories?: { name: string; distance?: string }[];
}

const MAX_COUNT = 100;

export default function BestOfProvincePage() {
    const { language } = useLanguage();
    const [campaign, setCampaign] = useState<FeaturedCampaignSettings | null>(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [enabled, setEnabled] = useState(false);
    const [provinces, setProvinces] = useState<BestOfProvince[]>([]);
    const [pickerOpen, setPickerOpen] = useState(false);
    const [pickerSearch, setPickerSearch] = useState('');
    const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
    const origin = typeof window !== 'undefined' ? window.location.origin : '';

    useEffect(() => {
        (async () => {
            try {
                const res = await fetch('/api/campaigns/featured');
                if (res.ok) {
                    const data = await res.json();
                    setCampaign(data);
                    setEnabled(!!data?.bestOfProvinceEnabled);
                    setProvinces(Array.isArray(data?.bestOfProvinces)
                        ? data.bestOfProvinces.map((p: BestOfProvince) => ({ province: p.province, count: Math.max(1, Number(p.count) || 1) }))
                        : []);
                }
            } catch { /* */ } finally {
                setLoading(false);
            }
        })();
    }, []);

    const showToast = (message: string, type: 'success' | 'error') => {
        setToast({ message, type });
        setTimeout(() => setToast(null), 3000);
    };

    const usedProvinces = useMemo(() => new Set(provinces.map(p => p.province)), [provinces]);

    const pickerResults = useMemo(() => {
        const q = pickerSearch.trim().toLowerCase();
        return THAI_PROVINCES
            .filter(p => !usedProvinces.has(p.th))
            .filter(p => !q || p.th.includes(q) || p.en.toLowerCase().includes(q));
    }, [pickerSearch, usedProvinces]);

    const addProvince = (th: string) => {
        setProvinces(prev => prev.some(p => p.province === th) ? prev : [...prev, { province: th, count: 1 }]);
        setPickerOpen(false);
        setPickerSearch('');
    };

    const removeProvince = (th: string) => setProvinces(prev => prev.filter(p => p.province !== th));

    const updateCount = (th: string, value: number) => {
        const n = Number.isFinite(value) ? Math.min(MAX_COUNT, Math.max(1, Math.floor(value))) : 1;
        setProvinces(prev => prev.map(p => p.province === th ? { ...p, count: n } : p));
    };

    const handleSave = async () => {
        if (!campaign?._id) return;
        setSaving(true);
        try {
            const res = await fetch(`/api/campaigns/${campaign._id}`, {
                method: 'PUT',
                headers: authHeaders(),
                body: JSON.stringify({
                    bestOfProvinceEnabled: enabled,
                    bestOfProvinces: provinces,
                }),
            });
            showToast(
                res.ok ? (language === 'th' ? 'บันทึกสำเร็จ' : 'Settings saved') : (language === 'th' ? 'บันทึกล้มเหลว' : 'Save failed'),
                res.ok ? 'success' : 'error',
            );
        } catch {
            showToast('Error saving', 'error');
        } finally {
            setSaving(false);
        }
    };

    const campaignPath = campaign?.slug || campaign?._id || '';
    const firstCategory = campaign?.categories?.[0]?.name || '';
    const boardUrl = campaignPath
        ? `${origin}/Best-Of-Winners/${campaignPath}${firstCategory ? `?category=${encodeURIComponent(firstCategory)}` : ''}`
        : '';

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

    return (
        <AdminLayout breadcrumbItems={[{ label: 'Best of จังหวัด', labelEn: 'Best of Province' }]}>
            {toast && (
                <div className={`fixed right-5 top-24 z-50 px-6 py-3 rounded-lg text-white font-semibold shadow-lg ${toast.type === 'success' ? 'bg-green-500' : 'bg-red-500'}`}>
                    {toast.message}
                </div>
            )}

            <div className="mx-auto max-w-screen-lg p-4">
                {loading ? (
                    <div className="py-10 text-center text-sm text-gray-400">
                        {language === 'th' ? 'กำลังโหลด...' : 'Loading...'}
                    </div>
                ) : !campaign ? (
                    <div className="py-10 text-center text-sm text-gray-400">
                        {language === 'th' ? 'ไม่พบแคมเปญที่กดดาว — กรุณากดดาวเลือกกิจกรรมที่ต้องการก่อน' : 'No featured campaign found — please star a campaign first'}
                    </div>
                ) : (
                    <div className="rounded-2xl border border-teal-200 bg-white p-4 shadow-sm">
                        <div className="flex flex-wrap items-center gap-2">
                            <span className="text-[19px] font-bold text-gray-900">
                                {language === 'th' ? 'Best of จังหวัด' : 'Best of Province'}
                            </span>
                            <span className="rounded-full bg-teal-50 px-2.5 py-1 text-[11px] font-bold text-teal-700">
                                {campaign.name}
                            </span>
                            <button
                                type="button"
                                onClick={() => handleCopyLink(boardUrl)}
                                title={language === 'th' ? 'คัดลอกลิงก์บอร์ด' : 'Copy board link'}
                                className="flex items-center justify-center rounded-md bg-sky-500 px-2.5 py-1.5 text-white transition-colors hover:bg-sky-600"
                            >
                                <LinkIcon className="h-4 w-4" />
                            </button>
                            <a
                                href={boardUrl || undefined}
                                target="_blank"
                                rel="noopener noreferrer"
                                title={language === 'th' ? 'เปิดบอร์ดในแท็บใหม่' : 'Open board in new tab'}
                                aria-disabled={!boardUrl}
                                className={`flex items-center justify-center rounded-md px-2.5 py-1.5 text-white transition-colors ${boardUrl ? 'bg-indigo-500 hover:bg-indigo-600' : 'pointer-events-none bg-gray-300'}`}
                            >
                                <ArrowTopRightOnSquareIcon className="h-4 w-4" />
                            </a>
                            <button
                                onClick={handleSave}
                                disabled={saving}
                                className={`ml-auto rounded-md px-4 py-1.5 text-[11px] font-bold text-white transition-all ${saving ? 'cursor-wait bg-gray-400' : 'cursor-pointer bg-green-500 hover:bg-green-600'}`}
                            >
                                {saving ? (language === 'th' ? 'กำลังบันทึก...' : 'Saving...') : (language === 'th' ? 'บันทึก' : 'Save')}
                            </button>
                        </div>

                        {/* Enable toggle */}
                        <div className="mt-4 flex items-center justify-between gap-3 rounded-xl border border-teal-200 bg-teal-50 px-4 py-3">
                            <div>
                                <p className="text-sm font-bold text-teal-900">
                                    {language === 'th' ? 'เปิดใช้รางวัล Best of จังหวัด' : 'Enable Best of Province award'}
                                </p>
                                <p className="mt-0.5 text-[11px] text-teal-700">
                                    {language === 'th'
                                        ? 'ถ้าปิด: จะไม่มีบอร์ด Best Of ขึ้น • ถ้าเปิด: แต่ละจังหวัดจะเป็นบอร์ดแยก (ชาย/หญิง)'
                                        : 'Off: no Best-Of board is shown • On: each province shows its own board (male/female)'}
                                </p>
                            </div>
                            <button
                                type="button"
                                role="switch"
                                aria-checked={enabled}
                                onClick={() => setEnabled(v => !v)}
                                className="relative inline-flex h-7 w-12 shrink-0 items-center rounded-full transition-colors"
                                style={{ backgroundColor: enabled ? '#0d9488' : '#cbd5e1' }}
                            >
                                <span
                                    className="inline-block h-6 w-6 transform rounded-full bg-white shadow transition-transform"
                                    style={{ transform: enabled ? 'translateX(22px)' : 'translateX(2px)' }}
                                />
                            </button>
                        </div>

                        {/* Province list */}
                        <div className={`mt-4 transition-opacity ${enabled ? 'opacity-100' : 'pointer-events-none opacity-40'}`}>
                            <div className="mb-2 flex items-center justify-between">
                                <span className="text-sm font-bold text-gray-800">
                                    {language === 'th' ? `จังหวัด (${provinces.length})` : `Provinces (${provinces.length})`}
                                </span>
                                <button
                                    type="button"
                                    onClick={() => { setPickerOpen(true); setPickerSearch(''); }}
                                    disabled={!enabled}
                                    className="flex items-center gap-1 rounded-lg bg-teal-600 px-3 py-1.5 text-[12px] font-bold text-white transition-colors hover:bg-teal-700 disabled:cursor-not-allowed disabled:bg-gray-300"
                                >
                                    <PlusIcon className="h-4 w-4" />
                                    {language === 'th' ? 'เพิ่มจังหวัด' : 'Add province'}
                                </button>
                            </div>

                            {provinces.length === 0 ? (
                                <div className="rounded-xl border border-dashed border-gray-300 bg-gray-50 px-4 py-8 text-center text-sm text-gray-400">
                                    {language === 'th' ? 'ยังไม่มีจังหวัด — กด "เพิ่มจังหวัด" เพื่อเริ่ม' : 'No provinces yet — click "Add province" to start'}
                                </div>
                            ) : (
                                <div className="space-y-2">
                                    {provinces.map((p) => (
                                        <div key={p.province} className="flex items-center gap-3 rounded-xl border border-gray-200 bg-white px-3 py-2.5">
                                            <div className="min-w-0 flex-1">
                                                <p className="truncate text-sm font-bold text-gray-900">{p.province}</p>
                                                <p className="text-[11px] text-gray-500">{provinceEnName(p.province)}</p>
                                            </div>
                                            <label className="flex items-center gap-1.5 text-[11px] font-bold text-gray-600">
                                                {language === 'th' ? 'เอา' : 'Top'}
                                                <input
                                                    type="number"
                                                    min={1}
                                                    max={MAX_COUNT}
                                                    value={p.count}
                                                    onChange={(e) => updateCount(p.province, e.target.value === '' ? 1 : Number(e.target.value))}
                                                    className="h-9 w-16 rounded-lg border-2 border-teal-300 bg-white text-center font-semibold text-teal-800 outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-100"
                                                    style={{ fontSize: '15px' }}
                                                />
                                                {language === 'th' ? 'คน / เพศ' : '/ gender'}
                                            </label>
                                            <button
                                                type="button"
                                                onClick={() => removeProvince(p.province)}
                                                title={language === 'th' ? 'ลบ' : 'Remove'}
                                                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-gray-400 transition-colors hover:bg-red-50 hover:text-red-500"
                                            >
                                                <XMarkIcon className="h-5 w-5" />
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                )}
            </div>

            {/* Province picker popup */}
            {pickerOpen && (
                <div
                    className="fixed inset-0 z-[60] flex items-start justify-center bg-black/40 p-4 pt-24"
                    onClick={() => setPickerOpen(false)}
                >
                    <div
                        className="flex max-h-[70vh] w-full max-w-md flex-col overflow-hidden rounded-2xl bg-white shadow-2xl"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3">
                            <span className="text-sm font-bold text-gray-900">
                                {language === 'th' ? 'เลือกจังหวัด' : 'Select province'}
                            </span>
                            <button type="button" onClick={() => setPickerOpen(false)} className="text-gray-400 hover:text-gray-600">
                                <XMarkIcon className="h-5 w-5" />
                            </button>
                        </div>
                        <div className="border-b border-gray-100 p-3">
                            <div className="relative">
                                <MagnifyingGlassIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                                <input
                                    autoFocus
                                    value={pickerSearch}
                                    onChange={(e) => setPickerSearch(e.target.value)}
                                    placeholder={language === 'th' ? 'ค้นหาจังหวัด...' : 'Search province...'}
                                    className="w-full rounded-lg border border-gray-200 bg-gray-50 py-2 pl-9 pr-3 text-sm outline-none focus:border-teal-400 focus:bg-white"
                                />
                            </div>
                        </div>
                        <div className="min-h-0 flex-1 overflow-y-auto p-2">
                            {pickerResults.length === 0 ? (
                                <div className="px-3 py-6 text-center text-sm text-gray-400">
                                    {language === 'th' ? 'ไม่พบจังหวัด' : 'No provinces found'}
                                </div>
                            ) : (
                                pickerResults.map((p) => (
                                    <button
                                        key={p.th}
                                        type="button"
                                        onClick={() => addProvince(p.th)}
                                        className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-left transition-colors hover:bg-teal-50"
                                    >
                                        <span className="text-sm font-semibold text-gray-800">{p.th}</span>
                                        <span className="text-[11px] text-gray-400">{p.en}</span>
                                    </button>
                                ))
                            )}
                        </div>
                    </div>
                </div>
            )}
        </AdminLayout>
    );
}
