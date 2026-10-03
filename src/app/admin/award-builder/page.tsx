'use client';

import { useState, useEffect, useMemo, useCallback, useRef, type ReactNode } from 'react';
import AdminLayout from '@/app/admin/AdminLayout';
import { useLanguage } from '@/lib/language-context';
import { authHeaders } from '@/lib/authHeaders';
import {
    AWARD_TYPE_OPTIONS,
    ATHLETE_FIELDS,
    DEFAULT_PERSONAL_FIELDS,
    PERSONAL_FIELDS,
    RESULT_FIELDS,
    SPLIT_FIELDS,
    MAX_AWARD_COUNT,
    NATIONALITY_OPTIONS,
    clampAwardCount,
    computeCustomAward,
    newAwardId,
    normalizeCustomAwards,
    type CustomAward,
    type CustomAwardGroup,
    type CustomAwardRunner,
    type CustomAwardType,
    type CustomAwardRankBy,
    type CustomAwardNationality,
} from '@/lib/custom-awards';
import CustomAwardResults, { useAwardSplits } from '@/components/CustomAwardResults';
import {
    ArrowPathIcon,
    TrashIcon,
    XMarkIcon,
    DocumentTextIcon,
    CalendarDaysIcon,
    MapPinIcon,
    ChevronRightIcon,
    TableCellsIcon,
    CheckIcon,
    FunnelIcon,
    PlusIcon,
    Bars3Icon,
    PencilSquareIcon,
    TrophyIcon,
} from '@heroicons/react/24/outline';
import { TrophyIcon as TrophySolidIcon } from '@heroicons/react/24/solid';

interface RaceCategory { name: string; distance?: string; badgeColor?: string; raceType?: string; }

interface Campaign {
    _id: string;
    name: string;
    nameTh?: string;
    nameEn?: string;
    eventDate?: string;
    eventEndDate?: string;
    location?: string;
    locationTh?: string;
    locationEn?: string;
    categories?: RaceCategory[];
    genderSplitEnabled?: boolean;
    customAwards?: unknown;
    logoUrl?: string;
}

interface AwardForm {
    id: string | null;
    category: string;
    type: CustomAwardType;
    name: string;
    count: string;
    rankBy: CustomAwardRankBy;
    nationality: CustomAwardNationality;
    excludeAwardIds: string[];
    personalFields: string[];
    splitFields: string[];
}

const emptyForm = (category: string): AwardForm => ({
    id: null,
    category,
    type: 'overall',
    name: AWARD_TYPE_OPTIONS[0].defaultName,
    count: '3',
    rankBy: 'gun',
    nationality: 'all',
    excludeAwardIds: [],
    personalFields: [...DEFAULT_PERSONAL_FIELDS],
    splitFields: [],
});

const normCat = (v?: string | null) => String(v || '').trim().toLowerCase();

/** Filter chip value meaning "every distance". */
const ALL = '__all__';

/** Give up on a save after this long so the button can never stay on "Saving...". */
const SAVE_TIMEOUT_MS = 30_000;

const formatDateOnly = (value?: string) => {
    if (!value) return '';
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return '';
    return d.toISOString().slice(0, 10);
};


export default function AwardBuilderPage() {
    const { language } = useLanguage();
    const th = language === 'th';

    const [campaign, setCampaign] = useState<Campaign | null>(null);
    const [loading, setLoading] = useState(true);
    const [runners, setRunners] = useState<CustomAwardRunner[]>([]);
    const [runnersLoading, setRunnersLoading] = useState(false);
    const [savedAwards, setSavedAwards] = useState<CustomAward[]>([]);
    const [saving, setSaving] = useState(false);
    const [form, setForm] = useState<AwardForm>(emptyForm(''));
    const [viewing, setViewing] = useState<{ award: CustomAward; groups: CustomAwardGroup[] } | null>(null);
    const splits = useAwardSplits();
    const [exporting, setExporting] = useState(false);
    const [activeTab, setActiveTab] = useState<string>('');
    const nameInputRef = useRef<HTMLInputElement | null>(null);
    const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
    // Drag-to-reorder inside a distance card (saved awards only).
    const [dragId, setDragId] = useState<string | null>(null);
    const [dragOverId, setDragOverId] = useState<string | null>(null);
    const settingsRef = useRef<HTMLDivElement | null>(null);

    const showToast = useCallback((message: string, type: 'success' | 'error') => {
        setToast({ message, type });
        setTimeout(() => setToast(null), 3000);
    }, []);

    // ---- data loading -------------------------------------------------------
    useEffect(() => {
        (async () => {
            try {
                const res = await fetch('/api/campaigns/featured', { cache: 'no-store', headers: authHeaders() });
                if (res.ok) {
                    const data: Campaign | null = await res.json();
                    if (data) {
                        setCampaign(data);
                        setSavedAwards(normalizeCustomAwards(data.customAwards));
                        setForm(emptyForm(data.categories?.[0]?.name || ''));
                    }
                }
            } catch { /* */ } finally {
                setLoading(false);
            }
        })();
    }, []);

    const loadRunners = useCallback(async (campaignId: string) => {
        setRunnersLoading(true);
        try {
            const params = new URLSearchParams({ campaignId, limit: '50000', skipStatusCounts: 'true' });
            const res = await fetch(`/api/runners/paged?${params.toString()}`, { cache: 'no-store' });
            if (res.ok) {
                const data = await res.json();
                setRunners(Array.isArray(data?.data) ? data.data : []);
            } else {
                setRunners([]);
            }
        } catch {
            setRunners([]);
        } finally {
            setRunnersLoading(false);
        }
    }, []);

    useEffect(() => {
        if (campaign?._id) loadRunners(campaign._id);
    }, [campaign?._id, loadRunners]);

    const categories = useMemo(() => campaign?.categories?.filter(c => c?.name) || [], [campaign]);

    const poolFor = useCallback(
        (category: string) => runners.filter(r => normCat(r.category) === normCat(category)),
        [runners],
    );

    const finisherCountFor = useCallback(
        (category: string) => poolFor(category).filter(r => r.status === 'finished' && (r.netTime || r.gunTime || r.elapsedTime)).length,
        [poolFor],
    );

    // ---- form helpers -------------------------------------------------------
    const buildAward = (): CustomAward | null => {
        const category = form.category.trim();
        const name = form.name.trim();
        const count = clampAwardCount(form.count);
        if (!category) { showToast(th ? 'กรุณาเลือกระยะ' : 'Please select a distance', 'error'); return null; }
        if (!name) { showToast(th ? 'กรุณาใส่ชื่อรางวัล' : 'Please enter an award name', 'error'); return null; }
        if (!form.count || Number(form.count) < 1) { showToast(th ? 'จำนวนรางวัลต้องเป็นตัวเลขตั้งแต่ 1 ขึ้นไป' : 'Award count must be a number of at least 1', 'error'); return null; }
        if (form.personalFields.length === 0) { showToast(th ? 'เลือกข้อมูลที่จะแสดงอย่างน้อย 1 อย่าง' : 'Tick at least one column to display', 'error'); return null; }
        return {
            id: form.id || newAwardId(),
            category,
            name,
            type: form.type,
            count,
            rankBy: form.rankBy,
            nationality: form.nationality,
            // Only awards of the same distance can be excluded (the ranking pool is per distance).
            excludeAwardIds: form.excludeAwardIds.filter(id => id !== form.id && savedAwards.some(a => a.id === id && normCat(a.category) === normCat(category))),
            personalFields: PERSONAL_FIELDS.map(f => f.key).filter(k => form.personalFields.includes(k)),
            splitFields: SPLIT_FIELDS.map(f => f.key).filter(k => form.splitFields.includes(k)),
        };
    };

    const loadTemplate = (award: CustomAward) => {
        setForm({
            id: award.id,
            category: award.category,
            type: award.type,
            name: award.name,
            count: String(award.count),
            rankBy: award.rankBy,
            nationality: award.nationality,
            excludeAwardIds: [...award.excludeAwardIds],
            personalFields: [...award.personalFields],
            splitFields: [...award.splitFields],
        });
    };

    const togglePersonal = (key: string) =>
        setForm(f => ({ ...f, personalFields: f.personalFields.includes(key) ? f.personalFields.filter(k => k !== key) : [...f.personalFields, key] }));

    const toggleExclude = (id: string) =>
        setForm(f => ({ ...f, excludeAwardIds: f.excludeAwardIds.includes(id) ? f.excludeAwardIds.filter(x => x !== id) : [...f.excludeAwardIds, id] }));

    const toggleSplit = (key: string) =>
        setForm(f => ({ ...f, splitFields: f.splitFields.includes(key) ? f.splitFields.filter(k => k !== key) : [...f.splitFields, key] }));

    const onTypeChange = (type: CustomAwardType) =>
        setForm(f => {
            const prevDefault = AWARD_TYPE_OPTIONS.find(o => o.value === f.type)?.defaultName;
            const nextDefault = AWARD_TYPE_OPTIONS.find(o => o.value === type)?.defaultName || '';
            // Only replace the name when the admin hasn't typed their own.
            const name = !f.name.trim() || f.name === prevDefault ? nextDefault : f.name;
            return { ...f, type, name };
        });

    // ---- persistence --------------------------------------------------------
    const persist = async (list: CustomAward[]): Promise<boolean> => {
        if (!campaign?._id) return false;
        setSaving(true);
        // `light=1` makes the proxy echo back only the fields we sent. Without it every
        // save downloaded the whole campaign document (~3 MB of base64 images / layouts),
        // which is what made the button sit on "Saving..." on the real server.
        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), SAVE_TIMEOUT_MS);
        try {
            const res = await fetch(`/api/campaigns/${campaign._id}?light=1`, {
                method: 'PUT',
                headers: authHeaders(),
                body: JSON.stringify({ customAwards: list }),
                signal: ctrl.signal,
            });
            if (!res.ok) {
                showToast(th ? `บันทึกล้มเหลว (${res.status})` : `Save failed (${res.status})`, 'error');
                return false;
            }
            return true;
        } catch (e) {
            const timedOut = e instanceof DOMException && e.name === 'AbortError';
            showToast(
                timedOut
                    ? (th ? 'บันทึกนานเกินไป กรุณารีเฟรชหน้าเพื่อตรวจสอบว่าบันทึกสำเร็จหรือไม่' : 'Save timed out. Refresh the page to check whether it went through.')
                    : (th ? 'บันทึกล้มเหลว' : 'Save failed'),
                'error',
            );
            return false;
        } finally {
            clearTimeout(timer);
            setSaving(false);
        }
    };

    // ---- toolbar actions ----------------------------------------------------
    // The form is in "edit" mode only while form.id points at a saved award (pencil /
    // saved chip). Otherwise the main button always creates a brand-new award, so
    // switching the distance after a save and pressing it again adds another one.
    const editingSaved = !!form.id && savedAwards.some(a => a.id === form.id);

    /** Main button: create a new award, or save changes to the one being edited. Saves straight away. */
    const handleCreateOrUpdate = async () => {
        const built = buildAward();
        if (!built) return;
        const award = editingSaved ? built : { ...built, id: newAwardId() };
        // The trophy isn't part of the form — editing an award keeps it.
        const next = editingSaved ? savedAwards.map(a => (a.id === award.id ? { ...award, showOnEvent: a.showOnEvent } : a)) : [...savedAwards, award];
        const ok = await persist(next);
        if (!ok) return;
        setSavedAwards(next);
        // Leave edit mode but keep the ticked settings, so the same award can be made for another distance.
        setForm(f => ({ ...f, id: null }));
        showToast(
            editingSaved ? (th ? 'บันทึกการแก้ไขแล้ว' : 'Changes saved') : (th ? 'สร้างรางวัลแล้ว' : 'Award created'),
            'success',
        );
        // Keep the current distance filter unless it would hide what was just saved.
        if (activeTab && activeTab !== ALL && normCat(activeTab) !== normCat(award.category)) setActiveTab(ALL);
        setTimeout(() => document.getElementById(`award-${award.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 60);
    };

    const handleRefreshField = () => {
        setForm(emptyForm(form.category || categories[0]?.name || ''));
    };

    /** Clear the form (also leaves edit mode). Saved awards are deleted from the list rows. */
    const handleClearForm = () => {
        setForm(emptyForm(form.category || categories[0]?.name || ''));
    };

    // ---- list row actions ---------------------------------------------------
    const scrollToSettings = () => {
        settingsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        setTimeout(() => nameInputRef.current?.focus({ preventScroll: true }), 350);
    };

    /** Pencil on a row: load it into the form and jump back up to edit. */
    const editAward = (award: CustomAward) => {
        loadTemplate(award);
        scrollToSettings();
    };

    /** Trophy on a row: show / stop showing this award's placings in /event's "Awards" column. */
    const toggleShowOnEvent = async (award: CustomAward) => {
        const on = !award.showOnEvent;
        const next = savedAwards.map(a => (a.id === award.id ? { ...a, showOnEvent: on } : a));
        const ok = await persist(next);
        if (!ok) return;
        setSavedAwards(next);
        showToast(
            on
                ? (th ? `แสดง "${award.name}" ในคอลัมน์ Awards แล้ว (เปิดคอลัมน์ Awards ได้ที่หน้า "การแสดงผล")` : `"${award.name}" now shows in the Awards column (switch the column on in Display settings)`)
                : (th ? `เลิกแสดง "${award.name}" ในคอลัมน์ Awards` : `"${award.name}" no longer shows in the Awards column`),
            'success',
        );
    };

    /** Trash on a row: remove the award and persist. */
    const deleteAward = async (award: CustomAward) => {
        const confirmed = window.confirm(th ? `ลบรางวัล "${award.name}" ของระยะ ${award.category} ?` : `Delete "${award.name}" (${award.category})?`);
        if (!confirmed) return;
        // Also drop it from other awards' "skip winners of" lists.
        const next = savedAwards
            .filter(a => a.id !== award.id)
            .map(a => (a.excludeAwardIds.includes(award.id) ? { ...a, excludeAwardIds: a.excludeAwardIds.filter(x => x !== award.id) } : a));
        const ok = await persist(next);
        if (!ok) return;
        setSavedAwards(next);
        setForm(f => ({ ...f, id: f.id === award.id ? null : f.id, excludeAwardIds: f.excludeAwardIds.filter(x => x !== award.id) }));
        showToast(th ? 'ลบรางวัลแล้ว' : 'Award deleted', 'success');
    };

    /** Drop `fromId` onto `toId` (same distance only). Optimistic; rolls back if the save fails. */
    const reorderAwards = async (fromId: string, toId: string) => {
        if (fromId === toId) return;
        const fromIdx = savedAwards.findIndex(a => a.id === fromId);
        const toIdx = savedAwards.findIndex(a => a.id === toId);
        if (fromIdx < 0 || toIdx < 0) return;
        if (normCat(savedAwards[fromIdx].category) !== normCat(savedAwards[toIdx].category)) return;
        const next = savedAwards.filter(a => a.id !== fromId);
        const insertAt = next.findIndex(a => a.id === toId) + (fromIdx < toIdx ? 1 : 0);
        next.splice(insertAt, 0, savedAwards[fromIdx]);
        const prev = savedAwards;
        setSavedAwards(next);
        const ok = await persist(next);
        if (!ok) setSavedAwards(prev);
    };

    // ---- viewing ------------------------------------------------------------
    const openAward = (award: CustomAward) => {
        const groups = computeCustomAward(poolFor(award.category), award, {
            genderSplitEnabled: campaign?.genderSplitEnabled !== false,
            allAwards: savedAwards,
        });
        setViewing({ award, groups });
        splits.reset();
    };

    const handleDownloadExcel = async () => {
        if (!viewing) return;
        setExporting(true);
        try {
            await splits.downloadExcel({
                award: viewing.award,
                groups: viewing.groups,
                language: th ? 'th' : 'en',
                eventName,
            });
        } catch {
            showToast(th ? 'ดาวน์โหลด Excel ไม่สำเร็จ' : 'Excel download failed', 'error');
        } finally {
            setExporting(false);
        }
    };

    // Saved awards grouped per distance card.
    const awardsByCategory = useMemo(() => {
        const map = new Map<string, CustomAward[]>();
        for (const a of savedAwards) {
            const list = map.get(normCat(a.category)) || [];
            list.push(a);
            map.set(normCat(a.category), list);
        }
        return map;
    }, [savedAwards]);

    const typeLabel = (type: CustomAwardType) => {
        const o = AWARD_TYPE_OPTIONS.find(x => x.value === type);
        return o ? (th ? o.labelTh : o.label) : type;
    };

    const eventName = (th ? campaign?.nameTh : campaign?.nameEn) || campaign?.name || '';
    const eventProvince = (th ? campaign?.locationTh : campaign?.locationEn) || campaign?.location || '';
    const eventDate = formatDateOnly(campaign?.eventDate);

    const setAllAthleteFields = (on: boolean) =>
        setForm(f => {
            const athleteKeys = ATHLETE_FIELDS.map(x => x.key);
            const rest = f.personalFields.filter(k => !athleteKeys.includes(k));
            return { ...f, personalFields: on ? [...rest, ...athleteKeys] : rest };
        });

    // ---- render -------------------------------------------------------------
    const categoryLabel = (c: RaceCategory) =>
        `${c.name}${c.distance ? ` (${c.distance})` : ''}${c.raceType ? ` - ${c.raceType}` : ''}`;

    // Results section lists every distance by default; chips narrow it to one.
    const resultFilter = activeTab || ALL;
    const visibleCategories = resultFilter === ALL
        ? categories
        : categories.filter(c => normCat(c.name) === normCat(resultFilter));

    // "+ เพิ่มรางวัลใหม่" on a distance card: fresh form for that distance, cursor in the title.
    const addAwardFor = (category: string) => {
        setForm(emptyForm(category));
        scrollToSettings();
    };

    const awardSubtitle = (a: CustomAward) => {
        const rank = a.rankBy === 'gun' ? 'Gun Time' : 'Net Time';
        const extras: string[] = [];
        if (a.nationality !== 'all') {
            const o = NATIONALITY_OPTIONS.find(x => x.value === a.nationality);
            if (o) extras.push(th ? o.labelTh : o.label);
        }
        const skipped = a.excludeAwardIds.filter(id => savedAwards.some(x => x.id === id)).length;
        if (skipped) extras.push(th ? `ตัดผู้ได้รางวัล ${skipped} รายการ` : `skips ${skipped} award${skipped > 1 ? 's' : ''}`);
        const tail = extras.length ? ` • ${extras.join(' • ')}` : '';
        if (a.type === 'overall') return (th ? `อันดับ 1 - ${a.count} • ${rank}` : `Places 1 - ${a.count} • ${rank}`) + tail;
        return `${typeLabel(a.type)} • ${th ? `${a.count} อันดับ/กลุ่ม` : `${a.count} per group`} • ${rank}${tail}`;
    };

    // Other saved awards of the selected distance whose winners this award can skip.
    // Awards that already skip this one's winners are left out, so two awards can't skip each other.
    const excludeCandidates = savedAwards.filter(a =>
        a.id !== form.id
        && normCat(a.category) === normCat(form.category)
        && !(form.id && a.excludeAwardIds.includes(form.id)));

    const athleteSelected = ATHLETE_FIELDS.filter(f => form.personalFields.includes(f.key)).length;
    const resultSelected = RESULT_FIELDS.filter(f => form.personalFields.includes(f.key)).length;
    const initials = (campaign?.name || 'EV').replace(/[^A-Za-z0-9ก-๙]/g, '').slice(0, 2).toUpperCase();
    const inputCls = 'w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100';
    const labelCls = 'mb-1.5 block text-xs font-medium text-gray-600!';


    return (
        <AdminLayout>
            {toast && (
                <div className={`fixed right-4 top-4 z-[1200] rounded-lg px-4 py-3 text-sm font-semibold text-white! shadow-lg ${toast.type === 'success' ? 'bg-emerald-600' : 'bg-red-600'}`}>
                    {toast.message}
                </div>
            )}

            {/* Header row, then settings on top and results underneath; the page scrolls as one column. */}
            <div className="flex min-h-[calc(100vh-50px)] flex-col bg-slate-50 lg:-m-[15px]">
                {loading ? (
                    <div className="flex flex-1 items-center justify-center p-10 text-gray-400!">{th ? 'กำลังโหลด...' : 'Loading...'}</div>
                ) : !campaign ? (
                    <div className="flex flex-1 items-center justify-center bg-amber-50 p-6 text-sm text-amber-800!">
                        {th ? 'ยังไม่ได้เลือกงานที่กำลังทำ (กดดาวที่งานในหน้า Events ก่อน)' : 'No campaign selected — star one on the Events page first.'}
                    </div>
                ) : (
                    <>
                        {/* ===================== Event header ===================== */}
                        <div className="flex shrink-0 flex-wrap items-center gap-3 border-b border-gray-200 bg-white px-4 py-2 lg:px-5">
                            {campaign.logoUrl ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img src={campaign.logoUrl} alt="" className="h-9 w-9 shrink-0 rounded-lg object-cover" />
                            ) : (
                                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-blue-600 text-sm font-extrabold text-white!">{initials}</div>
                            )}
                            <div className="min-w-0">
                                <div className="flex items-center gap-2">
                                    <h1 className="truncate text-base font-extrabold uppercase tracking-wide text-gray-900!">{eventName}</h1>
                                    <span className="hidden rounded-md border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700! sm:inline">
                                        {th ? 'สร้างรายการรางวัล' : 'Award builder'}
                                    </span>
                                </div>
                                <div className="flex flex-wrap items-center gap-2 text-xs text-gray-500!">
                                    {eventDate && <span className="inline-flex items-center gap-1"><CalendarDaysIcon className="h-3.5 w-3.5" />{eventDate}</span>}
                                    {eventDate && eventProvince && <span className="text-gray-300!">•</span>}
                                    {eventProvince && <span className="inline-flex items-center gap-1"><MapPinIcon className="h-3.5 w-3.5" />{eventProvince}</span>}
                                </div>
                            </div>
                            {savedAwards.length > 0 && (
                                <div className="flex min-w-0 flex-1 items-center gap-1.5 overflow-x-auto whitespace-nowrap px-2">
                                    <span className="shrink-0 text-xs font-semibold text-gray-500!">{th ? 'เทมเพลตที่บันทึก:' : 'Saved:'}</span>
                                    {savedAwards.map(a => (
                                        <button key={a.id} type="button" onClick={() => loadTemplate(a)} title={th ? 'กดเพื่อโหลดมาแก้ไข' : 'Load into the form'}
                                            className={`shrink-0 rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors ${form.id === a.id ? 'border-blue-600 bg-blue-600 text-white!' : 'border-gray-200 bg-gray-50 text-gray-700! hover:border-blue-300 hover:bg-blue-50'}`}>
                                            {a.category} · {a.name}
                                        </button>
                                    ))}
                                </div>
                            )}
                            <span className="ml-auto inline-flex shrink-0 items-center gap-2 rounded-lg border border-gray-200 bg-gray-50 px-3 py-1.5 text-xs text-gray-600!">
                                <span className={`h-2 w-2 rounded-full ${runnersLoading ? 'bg-amber-400' : 'bg-emerald-500'}`} />
                                {th ? 'นักวิ่งทั้งหมด' : 'Runners'}
                                <b className="text-sm text-gray-900!">{runnersLoading ? '...' : runners.length.toLocaleString()}</b>
                                {th ? 'คน' : ''}
                            </span>
                        </div>

                        <div className="flex flex-col gap-3 p-3 lg:px-5 lg:pb-6">
                            {/* ===================== Settings ===================== */}
                            <div ref={settingsRef} className="flex flex-col gap-3">
                                <div className="space-y-3">
                                    {/* Step 1 */}
                                    <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
                                        <StepHeader n={1} title={th ? 'ตั้งเงื่อนไขรางวัล' : 'Award settings'} hint={th ? 'เลือกระยะ ประเภท และจำนวนรางวัล' : 'Distance, type and number of places'} />
                                        <div className="grid grid-cols-2 gap-3 px-4 pb-3 pt-1 md:grid-cols-[1.25fr_1.35fr_1.1fr_0.75fr_1.15fr]">
                                            <label className="block">
                                                <span className={labelCls}>{th ? 'ระยะ' : 'Distance'} <span className="text-red-500!">*</span></span>
                                                <select value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))} className={inputCls}>
                                                    <option value="">--{th ? 'เลือกระยะ' : 'Select'}--</option>
                                                    {categories.map(c => <option key={c.name} value={c.name}>{categoryLabel(c)}</option>)}
                                                </select>
                                            </label>
                                            <label className="block">
                                                <span className={labelCls}>{th ? 'ประเภทรางวัล' : 'Award type'}</span>
                                                <select value={form.type} onChange={e => onTypeChange(e.target.value as CustomAwardType)} className={inputCls}>
                                                    {AWARD_TYPE_OPTIONS.map(o => <option key={o.value} value={o.value}>{th ? o.labelTh : o.label}</option>)}
                                                </select>
                                            </label>
                                            <label className="block">
                                                <span className={labelCls}>{th ? 'ชื่อรางวัล' : 'Award title'}</span>
                                                <input ref={nameInputRef} value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                                                    placeholder="Overall Result" className={inputCls} />
                                            </label>
                                            <label className="block">
                                                <span className={labelCls} title={form.type === 'overall'
                                                    ? (th ? 'อันดับสูงสุด N คนของระยะนี้ (ตัวเลขเท่านั้น)' : 'Top N of this distance (numbers only)')
                                                    : (th ? `N คนต่อกลุ่ม สูงสุด ${MAX_AWARD_COUNT} (ตัวเลขเท่านั้น)` : `N per group, max ${MAX_AWARD_COUNT} (numbers only)`)}>
                                                    {th ? (form.type === 'overall' ? 'จำนวนรางวัล' : 'จำนวน/กลุ่ม') : (form.type === 'overall' ? 'Places' : 'Per group')}
                                                </span>
                                                <div className="relative">
                                                    <input
                                                        value={form.count}
                                                        inputMode="numeric"
                                                        pattern="[0-9]*"
                                                        onChange={e => setForm(f => ({ ...f, count: e.target.value.replace(/\D/g, '').slice(0, 4) }))}
                                                        onBlur={() => setForm(f => ({ ...f, count: f.count ? String(clampAwardCount(f.count)) : '' }))}
                                                        placeholder="3"
                                                        className={`${inputCls} pr-12`} />
                                                    <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-gray-400!">{th ? 'อันดับ' : 'pl.'}</span>
                                                </div>
                                            </label>
                                            <div className="col-span-2 block md:col-span-1">
                                                <span className={labelCls}>{th ? 'จัดอันดับด้วย' : 'Rank by'}</span>
                                                <div className="flex rounded-lg bg-gray-100 p-1">
                                                    {(['gun', 'net'] as CustomAwardRankBy[]).map(v => (
                                                        <button key={v} type="button" onClick={() => setForm(f => ({ ...f, rankBy: v }))}
                                                            className={`flex-1 rounded-md px-2 py-1 text-sm transition ${form.rankBy === v ? 'bg-emerald-600 font-semibold text-white! shadow-sm' : 'text-gray-500! hover:text-gray-700!'}`}>
                                                            {v === 'gun' ? 'Gun Time' : 'Net Time'}
                                                        </button>
                                                    ))}
                                                </div>
                                            </div>
                                        </div>
                                        <div className="grid gap-3 border-t border-dashed border-gray-200 px-4 pb-3 pt-3 md:grid-cols-[minmax(0,0.9fr)_minmax(0,1.6fr)]">
                                            <div>
                                                <span className={labelCls} title={th ? 'อิงจากช่อง COUNTRYREGION (สัญชาติ) ของนักกีฬา — ว่าง = นับเป็นคนไทย' : 'Uses the athlete COUNTRYREGION column — empty counts as Thai'}>
                                                    {th ? 'สัญชาติที่มีสิทธิ์' : 'Eligible nationality'}
                                                </span>
                                                <div className="flex rounded-lg bg-gray-100 p-1">
                                                    {NATIONALITY_OPTIONS.map(o => (
                                                        <button key={o.value} type="button" onClick={() => setForm(f => ({ ...f, nationality: o.value }))}
                                                            className={`flex-1 whitespace-nowrap rounded-md px-2 py-1 text-sm transition ${form.nationality === o.value ? 'bg-emerald-600 font-semibold text-white! shadow-sm' : 'text-gray-500! hover:text-gray-700!'}`}>
                                                            {th ? o.labelTh : o.label}
                                                        </button>
                                                    ))}
                                                </div>
                                            </div>
                                            <div className="min-w-0">
                                                <span className={labelCls}>
                                                    {th ? 'ไม่รวมผู้ที่ได้รางวัลแล้วจาก' : 'Skip runners who already won'}
                                                    <span className="ml-1.5 font-normal text-gray-400!">{th ? 'คนถัดไปจะได้เลื่อนขึ้นมาแทน' : 'the next runner moves up'}</span>
                                                </span>
                                                {excludeCandidates.length > 0 ? (
                                                    <div className="flex flex-wrap gap-1.5">
                                                        {excludeCandidates.map(a => (
                                                            <FieldTile key={a.id} tone="blue" label={a.name} sub={`${a.category} · ${typeLabel(a.type)}`}
                                                                checked={form.excludeAwardIds.includes(a.id)} onChange={() => toggleExclude(a.id)} />
                                                        ))}
                                                    </div>
                                                ) : (
                                                    <div className="rounded-lg border border-dashed border-gray-200 px-3 py-2 text-xs text-gray-400!">
                                                        {form.category
                                                            ? (th ? `ยังไม่มีรางวัลอื่นในระยะ ${form.category} — สร้างรางวัล Overall ก่อน แล้วค่อยมาติ๊กตรงนี้` : `No other award for ${form.category} yet — create the Overall award first`)
                                                            : (th ? 'เลือกระยะก่อน' : 'Pick a distance first')}
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    </div>

                                    {/* Step 2 */}
                                    <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
                                        <StepHeader n={2} title={th ? 'เลือกข้อมูลที่จะแสดงในรายชื่อ' : 'Columns to show'} hint={th ? 'ติ๊กช่องที่ต้องการ แสดงทั้งบนจอและในไฟล์ Excel' : 'Shown on screen and in the Excel file'} />
                                        <div className="space-y-2.5 px-4 pb-3 pt-1">
                                            <FieldGroup
                                                color="bg-blue-600"
                                                title={th ? 'ข้อมูลนักกีฬา' : 'Athlete info'}
                                                note="RaceTiger"
                                                selected={athleteSelected}
                                                total={ATHLETE_FIELDS.length}
                                                th={th}
                                                onAll={() => setAllAthleteFields(true)}
                                                onClear={() => setAllAthleteFields(false)}
                                            >
                                                <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4 xl:grid-cols-5">
                                                    {ATHLETE_FIELDS.map(f => (
                                                        <FieldTile key={f.key} tone="blue" mono label={f.label} sub={th ? f.labelTh : undefined}
                                                            checked={form.personalFields.includes(f.key)} onChange={() => togglePersonal(f.key)} />
                                                    ))}
                                                </div>
                                            </FieldGroup>
                                            <FieldGroup color="bg-emerald-500" title={th ? 'ผลการแข่งขัน' : 'Results'} note="Personal results" selected={resultSelected} total={RESULT_FIELDS.length} th={th}>
                                                <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4">
                                                    {RESULT_FIELDS.map(f => (
                                                        <FieldTile key={f.key} tone="green" label={f.label} sub={th && f.labelTh !== f.label ? f.labelTh : undefined}
                                                            checked={form.personalFields.includes(f.key)} onChange={() => togglePersonal(f.key)} />
                                                    ))}
                                                </div>
                                            </FieldGroup>
                                            <FieldGroup color="bg-violet-500" title={th ? 'เวลารายจุดผ่าน' : 'Split times'} note="Split times" selected={form.splitFields.length} total={SPLIT_FIELDS.length} th={th}>
                                                <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4 xl:grid-cols-6">
                                                    {SPLIT_FIELDS.map(f => (
                                                        <FieldTile key={f.key} tone="purple" label={f.label} title={th ? f.labelTh : f.label}
                                                            checked={form.splitFields.includes(f.key)} onChange={() => toggleSplit(f.key)} />
                                                    ))}
                                                </div>
                                            </FieldGroup>
                                        </div>
                                    </div>
                                </div>

                                {/* Actions — always visible under the settings */}
                                <div className="flex shrink-0 flex-wrap items-center gap-2 rounded-xl border border-gray-200 bg-white px-3 py-2 shadow-sm">
                                    <button type="button" onClick={() => void handleCreateOrUpdate()} disabled={saving}
                                        className={`inline-flex flex-1 items-center justify-center gap-2 rounded-lg px-5 py-2 text-sm font-bold text-white! disabled:opacity-50 sm:flex-none ${editingSaved ? 'bg-blue-600 hover:bg-blue-700' : 'bg-gray-900 hover:bg-gray-800'}`}>
                                        {/* Both icons stay mounted and the label sits in its own <span>: swapping an
                                            icon in front of a bare text node crashed the page ("insertBefore ... not a
                                            child") once a translator/extension had rewrapped that text node. */}
                                        <CheckIcon className={`h-4 w-4 text-white ${editingSaved ? '' : 'hidden'}`} />
                                        <PlusIcon className={`h-4 w-4 text-white ${editingSaved ? 'hidden' : ''}`} />
                                        <span>
                                            {saving
                                                ? (th ? 'กำลังบันทึก...' : 'Saving...')
                                                : editingSaved ? (th ? 'บันทึกการแก้ไข' : 'Save changes') : (th ? 'สร้าง' : 'Create')}
                                        </span>
                                    </button>
                                    {editingSaved && (
                                        <>
                                            <span className="inline-flex min-w-0 items-center gap-1.5 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-700!">
                                                <PencilSquareIcon className="h-4 w-4 shrink-0" />
                                                <span className="truncate">{th ? 'กำลังแก้ไข' : 'Editing'}: <b>{savedAwards.find(a => a.id === form.id)?.category} · {savedAwards.find(a => a.id === form.id)?.name}</b></span>
                                            </span>
                                            <button type="button" onClick={handleClearForm}
                                                className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3.5 py-2 text-sm font-medium text-gray-700! hover:bg-gray-50">
                                                <XMarkIcon className="h-4 w-4" /> {th ? 'ยกเลิกการแก้ไข' : 'Cancel edit'}
                                            </button>
                                        </>
                                    )}
                                    <button type="button" onClick={handleRefreshField}
                                        className="inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-3.5 py-2 text-sm font-medium text-gray-800! hover:bg-gray-50">
                                        <ArrowPathIcon className="h-4 w-4 text-orange-500!" /> {th ? 'รีเฟรช' : 'Refresh'}
                                    </button>
                                    <button type="button" onClick={handleClearForm}
                                        className="ml-auto inline-flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3.5 py-2 text-sm font-medium text-red-600! hover:bg-red-100 disabled:opacity-50">
                                        <TrashIcon className="h-4 w-4" /> {th ? 'ล้างเงื่อนไข' : 'Delete'}
                                    </button>
                                </div>
                            </div>

                            {/* ===================== Results (below the settings) ===================== */}
                            <div className="flex flex-col rounded-xl border border-gray-200 bg-white shadow-sm">
                                <div className="flex shrink-0 flex-wrap items-center gap-2 pr-3">
                                    <StepHeader n={3} title={th ? 'ผลลัพธ์' : 'Results'} hint={savedAwards.length > 0
                                        ? (th ? 'กดชื่อรางวัลเพื่อดูรายชื่อ • ลากที่ขีดเพื่อสลับตำแหน่ง' : 'Click an award to see the winners • drag the handle to reorder')
                                        : (th ? 'ตั้งเงื่อนไขด้านบนแล้วกด "สร้าง" หรือกด "+ เพิ่มรางวัลใหม่" ในระยะที่ต้องการ' : 'Set the award above and press "Create", or use "+ Add award" on a distance')} />
                                </div>

                                {categories.length > 0 && (
                                    <div className="flex shrink-0 flex-wrap items-center gap-1.5 border-b border-gray-100 px-4 pb-2.5">
                                        <FunnelIcon className="h-4 w-4 text-gray-400!" />
                                        {[{ name: ALL, label: th ? 'ทั้งหมด' : 'All' }, ...categories.map(c => ({ name: c.name, label: c.name }))].map(opt => {
                                            const active = opt.name === ALL ? resultFilter === ALL : normCat(opt.name) === normCat(resultFilter);
                                            return (
                                                <button key={opt.name} type="button" onClick={() => setActiveTab(opt.name)}
                                                    className={`rounded-full px-3 py-1 text-xs font-semibold transition ${active ? 'bg-blue-600 text-white!' : 'bg-gray-100 text-gray-600! hover:bg-gray-200'}`}>
                                                    {opt.label}
                                                    {opt.name !== ALL && <span className={active ? 'ml-1 opacity-80' : 'ml-1 text-gray-400!'}>· {finisherCountFor(opt.name)}</span>}
                                                </button>
                                            );
                                        })}
                                    </div>
                                )}

                                <div className="p-3">
                                    {categories.length > 0 ? (
                                        <div className="grid gap-3 md:grid-cols-2">
                                            {visibleCategories.map(c => {
                                                const list = awardsByCategory.get(normCat(c.name)) || [];
                                                return (
                                                    <div key={c.name} className="flex flex-col overflow-hidden rounded-lg border border-gray-200">
                                                        <div className="flex items-center justify-between gap-2 bg-slate-900 px-4 py-2 text-white!">
                                                            <span className="truncate text-sm font-bold">{th ? 'ระยะ' : 'Distance'} {c.name}{c.raceType ? ` (${c.raceType})` : ''}</span>
                                                            <span className="shrink-0 rounded-full bg-white/15 px-2.5 py-0.5 text-[11px] text-white!">
                                                                {th ? `เข้าเส้นชัย ${finisherCountFor(c.name)} คน` : `${finisherCountFor(c.name)} finished`}
                                                            </span>
                                                        </div>
                                                        <div className="flex flex-1 flex-col gap-2 bg-slate-50 p-2.5">
                                                            {list.map(award => {
                                                                const canDrag = list.length > 1;
                                                                const isDragOver = !!dragId && dragId !== award.id && dragOverId === award.id;
                                                                const isEditing = form.id === award.id;
                                                                return (
                                                                    <div key={award.id} id={`award-${award.id}`}
                                                                        onDragOver={e => { if (!dragId || dragId === award.id) return; e.preventDefault(); e.dataTransfer.dropEffect = 'move'; if (dragOverId !== award.id) setDragOverId(award.id); }}
                                                                        onDragLeave={() => { if (dragOverId === award.id) setDragOverId(null); }}
                                                                        onDrop={e => { e.preventDefault(); const from = dragId; setDragId(null); setDragOverId(null); if (from) void reorderAwards(from, award.id); }}
                                                                        className={`flex items-center gap-1 rounded-lg border bg-white py-1.5 pl-1 pr-1.5 transition ${isDragOver ? 'border-blue-500 ring-2 ring-blue-100' : isEditing ? 'border-blue-300 bg-blue-50/30' : 'border-gray-200'} ${dragId === award.id ? 'opacity-40' : ''}`}>
                                                                        {canDrag ? (
                                                                            <span
                                                                                draggable
                                                                                onDragStart={e => { e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', award.id); setDragId(award.id); }}
                                                                                onDragEnd={() => { setDragId(null); setDragOverId(null); }}
                                                                                title={th ? 'ลากเพื่อสลับตำแหน่ง' : 'Drag to reorder'}
                                                                                className="cursor-grab touch-none rounded p-1 text-gray-300! hover:bg-gray-100 hover:text-gray-500! active:cursor-grabbing">
                                                                                <Bars3Icon className="h-4 w-4" />
                                                                            </span>
                                                                        ) : (
                                                                            <span className="w-6 shrink-0" />
                                                                        )}
                                                                        <button type="button" onClick={() => openAward(award)}
                                                                            className="flex min-w-0 flex-1 items-center gap-2.5 rounded-md px-1.5 py-1 text-left transition hover:bg-blue-50/60">
                                                                            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-600!">
                                                                                <DocumentTextIcon className="h-5 w-5" />
                                                                            </span>
                                                                            <span className="min-w-0 flex-1">
                                                                                <span className="block truncate text-sm font-semibold text-gray-900!">{award.name}</span>
                                                                                <span className="block truncate text-xs text-gray-500!">{awardSubtitle(award)}</span>
                                                                            </span>
                                                                            <ChevronRightIcon className="h-4 w-4 shrink-0 text-gray-400!" />
                                                                        </button>
                                                                        <button type="button" onClick={() => editAward(award)} title={th ? 'แก้ไข' : 'Edit'}
                                                                            className={`shrink-0 rounded-md p-1.5 transition hover:bg-blue-50 hover:text-blue-600! ${isEditing ? 'text-blue-600!' : 'text-gray-400!'}`}>
                                                                            <PencilSquareIcon className="h-4 w-4" />
                                                                        </button>
                                                                        <button type="button" onClick={() => void toggleShowOnEvent(award)} disabled={saving}
                                                                            aria-pressed={!!award.showOnEvent}
                                                                            title={award.showOnEvent
                                                                                ? (th ? 'แสดงในคอลัมน์ Awards บนหน้าผล — กดเพื่อเลิกแสดง' : 'Shown in the Awards column on the results page — click to hide')
                                                                                : (th ? 'กดเพื่อแสดงอันดับรางวัลนี้ในคอลัมน์ Awards บนหน้าผล' : 'Show this award\'s placings in the Awards column on the results page')}
                                                                            className={`shrink-0 rounded-md p-1.5 transition hover:bg-amber-50 hover:text-amber-500! disabled:opacity-50 ${award.showOnEvent ? 'text-amber-500!' : 'text-gray-400!'}`}>
                                                                            {award.showOnEvent ? <TrophySolidIcon className="h-4 w-4" /> : <TrophyIcon className="h-4 w-4" />}
                                                                        </button>
                                                                        <button type="button" onClick={() => void deleteAward(award)} disabled={saving} title={th ? 'ลบ' : 'Delete'}
                                                                            className="shrink-0 rounded-md p-1.5 text-gray-400! transition hover:bg-red-50 hover:text-red-600! disabled:opacity-50">
                                                                            <TrashIcon className="h-4 w-4" />
                                                                        </button>
                                                                    </div>
                                                                );
                                                            })}
                                                            <div className={`mt-auto flex items-center gap-2 ${list.length ? 'justify-end' : 'justify-between py-1'}`}>
                                                                {list.length === 0 && <span className="text-sm text-gray-500!">{th ? 'ยังไม่มีรางวัลสำหรับระยะนี้' : 'No award for this distance yet'}</span>}
                                                                <button type="button" onClick={() => addAwardFor(c.name)} className="inline-flex shrink-0 items-center gap-1 text-xs font-semibold text-blue-600! hover:text-blue-700!">
                                                                    <PlusIcon className="h-3.5 w-3.5" /> {th ? 'เพิ่มรางวัลใหม่' : 'Add award'}
                                                                </button>
                                                            </div>
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    ) : (
                                        <div className="px-4 py-10 text-center text-sm text-gray-500!">
                                            {th ? 'งานนี้ยังไม่มีระยะ (เพิ่มระยะในหน้าตั้งค่างานก่อน)' : 'This campaign has no distances yet.'}
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    </>
                )}
            </div>

            {/* ===================== Award list modal ===================== */}
            {viewing && (
                <div className="fixed inset-0 z-[1100] flex items-center justify-center bg-black/50 p-4 md:p-8" onClick={() => setViewing(null)}>
                    <div className="flex max-h-[85vh] w-full max-w-5xl flex-col overflow-hidden rounded-xl bg-white shadow-2xl" onClick={e => e.stopPropagation()}>
                        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-gray-200 bg-slate-900 px-5 py-3 text-white!">
                            <div>
                                <div className="text-xs uppercase tracking-wide opacity-80">{viewing.award.category} · {typeLabel(viewing.award.type)} · {viewing.award.rankBy === 'gun' ? 'Gun Time' : 'Net Time'}
                                    {viewing.award.nationality !== 'all' && ` · ${(() => { const o = NATIONALITY_OPTIONS.find(x => x.value === viewing.award.nationality); return o ? (th ? o.labelTh : o.label) : ''; })()}`}</div>
                                <h3 className="text-xl font-extrabold">{viewing.award.name}</h3>
                                <div className="text-xs opacity-80">{eventName}{eventDate ? ` · ${eventDate}` : ''}</div>
                            </div>
                            <div className="flex shrink-0 items-center gap-2">
                                <button type="button" onClick={handleDownloadExcel} disabled={exporting || viewing.groups.every(g => g.runners.length === 0)}
                                    className="inline-flex items-center gap-1.5 rounded-md bg-emerald-600 px-3 py-1.5 text-sm font-semibold text-white! hover:bg-emerald-700 disabled:opacity-50">
                                    <TableCellsIcon className="h-4 w-4" />
                                    {exporting ? (th ? 'กำลังสร้างไฟล์...' : 'Building file...') : (th ? 'ดาวน์โหลด Excel' : 'Download Excel')}
                                </button>
                                <button type="button" onClick={() => setViewing(null)} className="rounded-full p-1 hover:bg-white/20"><XMarkIcon className="h-6 w-6" /></button>
                            </div>
                        </div>
                        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto p-4 md:p-5">
                            <CustomAwardResults award={viewing.award} groups={viewing.groups} th={th} splits={splits} />
                        </div>
                    </div>
                </div>
            )}
        </AdminLayout>
    );
}

function StepHeader({ n, title, hint }: { n: number; title: string; hint?: string }) {
    return (
        <div className="flex min-w-0 items-center gap-2.5 px-4 pb-1.5 pt-2.5">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-blue-600 text-xs font-bold text-white!">{n}</span>
            <h2 className="shrink-0 text-sm font-bold text-gray-900!">{title}</h2>
            {hint && <span className="truncate text-xs text-gray-400!">{hint}</span>}
        </div>
    );
}

function FieldGroup({ color, title, note, selected, total, th, onAll, onClear, children }: {
    color: string;
    title: string;
    note?: string;
    selected: number;
    total: number;
    th: boolean;
    onAll?: () => void;
    onClear?: () => void;
    children: ReactNode;
}) {
    return (
        <div>
            <div className="mb-1.5 flex items-center gap-2">
                <span className={`h-3.5 w-1 shrink-0 rounded-full ${color}`} />
                <span className="text-xs font-bold text-gray-800!">{title}</span>
                {note && <span className="text-[11px] text-gray-400!">{note}</span>}
                <span className="ml-auto text-[11px] text-gray-500!">{th ? `เลือก ${selected}/${total}` : `${selected}/${total} selected`}</span>
                {onAll && <button type="button" onClick={onAll} className="text-[11px] font-semibold text-blue-600! hover:underline">{th ? 'เลือกทั้งหมด' : 'All'}</button>}
                {onClear && <button type="button" onClick={onClear} className="text-[11px] font-semibold text-gray-500! hover:underline">{th ? 'ล้าง' : 'Clear'}</button>}
            </div>
            {children}
        </div>
    );
}

const TILE_TONES = {
    blue: { on: 'border-blue-500 bg-blue-50 text-blue-700!', accent: 'accent-blue-600' },
    green: { on: 'border-emerald-500 bg-emerald-50 text-emerald-700!', accent: 'accent-emerald-600' },
    purple: { on: 'border-violet-500 bg-violet-50 text-violet-700!', accent: 'accent-violet-600' },
} as const;

function FieldTile({ checked, onChange, label, sub, title, tone, mono }: {
    checked: boolean;
    onChange: () => void;
    label: string;
    /** Thai meaning shown under the code, so admins don't need to know RaceTiger's column names. */
    sub?: string;
    title?: string;
    tone: keyof typeof TILE_TONES;
    mono?: boolean;
}) {
    const t = TILE_TONES[tone];
    return (
        <label title={title || (sub ? `${label} — ${sub}` : label)}
            className={`flex min-w-0 cursor-pointer select-none items-center gap-2 rounded-md border px-2.5 py-0.5 text-xs transition-colors ${checked ? t.on : 'border-gray-200 bg-white text-gray-700! hover:border-gray-300 hover:bg-gray-50'}`}>
            <input type="checkbox" checked={checked} onChange={onChange} className={`h-3.5 w-3.5 shrink-0 cursor-pointer ${t.accent}`} />
            <span className="min-w-0 leading-tight">
                <span className={`block truncate ${checked ? 'font-bold' : 'font-medium'} ${mono ? 'font-mono text-[11px]' : ''}`}>{label}</span>
                {sub && <span className={`block truncate text-[10px] ${checked ? 'opacity-80' : 'text-gray-400!'}`}>{sub}</span>}
            </span>
        </label>
    );
}

