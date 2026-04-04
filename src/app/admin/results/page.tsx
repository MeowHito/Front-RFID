'use client';

import { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import { useLanguage } from '@/lib/language-context';
import { authHeaders } from '@/lib/authHeaders';
import AdminLayout from '../AdminLayout';
import '../admin.css';

interface RaceCategory { name: string; distance?: string; }
interface Campaign { _id: string; name: string; categories?: RaceCategory[]; raceFinished?: boolean; }

interface PasstimeRunner {
    _id: string;
    bib: string;
    firstName: string;
    lastName: string;
    firstNameTh?: string;
    lastNameTh?: string;
    gender: string;
    category: string;
    ageGroup?: string;
    nationality?: string;
    status: string;
    netTime?: number;
    gunTime?: number;
    overallRank?: number;
    genderRank?: number;
    ageGroupRank?: number;
    categoryRank?: number;
    latestCheckpoint?: string;
    passedCount?: number;
    scanTime?: string;
    netTimeStr?: string;
    gunTimeStr?: string;
    netPace?: string;
    gunPace?: string;
    statusCheckpoint?: string;
    statusNote?: string;
    eventId?: string;
    elapsedTime?: number;
    statusChangedAt?: string;
}

interface Checkpoint {
    _id: string;
    name: string;
    orderNum?: number;
    type?: string;
    distanceMappings?: string[];
}

interface EditCheckpoint {
    name: string;
    orderNum: number;
    type: string;
}

interface EditTimingRecord {
    _id?: string;
    checkpoint: string;
    scanTime: string;
    order?: number;
}

// Per-bib checkpoint scan times: bib → checkpoint → scanTime (ISO)
type CheckpointTimingMap = Record<string, Record<string, { scanTime: string; elapsedTime?: number; splitTime?: number; netTime?: number }>>;

function formatTime(ms?: number): string {
    if (!ms || ms <= 0) return '-';
    const totalSec = Math.floor(ms / 1000);
    const h = Math.floor(totalSec / 3600);
    const m = Math.floor((totalSec % 3600) / 60);
    const s = totalSec % 60;
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

function formatClockTime(iso?: string): string {
    if (!iso) return '-';
    const d = new Date(iso);
    if (isNaN(d.getTime())) return '-';
    const hh = d.getHours().toString().padStart(2, '0');
    const mm = d.getMinutes().toString().padStart(2, '0');
    const ss = d.getSeconds().toString().padStart(2, '0');
    return `${hh}:${mm}:${ss}`;
}

const STATUS_LABELS: Record<string, { th: string; en: string; color: string; icon: string }> = {
    not_started: { th: 'ยังไม่เริ่ม', en: 'Not Started', color: '#94a3b8', icon: '⏳' },
    in_progress: { th: 'กำลังวิ่ง', en: 'In Progress', color: '#f59e0b', icon: '🏃' },
    finished: { th: 'เข้าเส้นชัย', en: 'Finished', color: '#22c55e', icon: '🏆' },
    dnf: { th: 'ไม่จบ', en: 'DNF', color: '#ef4444', icon: '❌' },
    dns: { th: 'ไม่ออกวิ่ง', en: 'DNS', color: '#6b7280', icon: '🚫' },
    dq: { th: 'ตัดสิทธิ์', en: 'DQ', color: '#7c2d12', icon: '⛔' },
};

const AUTO_REFRESH_INTERVAL = 15_000;

function deriveEffectiveStatus(runner: PasstimeRunner): PasstimeRunner {
    if (['finished', 'dq', 'dnf', 'dns'].includes(runner.status)) return runner;

    const hasGunTime = (runner.gunTime && runner.gunTime > 0) || !!runner.gunTimeStr;
    const hasNetTime = (runner.netTime && runner.netTime > 0) || !!runner.netTimeStr;
    const hasCheckpoint = !!runner.latestCheckpoint && runner.latestCheckpoint.toLowerCase() !== 'start';
    const hasPassedCount = (runner.passedCount ?? 0) > 0;
    const hasElapsed = (runner.elapsedTime && runner.elapsedTime > 0);

    if (hasGunTime || hasNetTime || hasCheckpoint || hasPassedCount || hasElapsed) {
        return { ...runner, status: 'in_progress' };
    }

    return runner;
}

function toDatetimeLocalValue(iso?: string): string {
    if (!iso) return '';
    const d = new Date(iso);
    if (isNaN(d.getTime())) return '';
    const pad2 = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}T${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

function compareString(a?: string, b?: string): number {
    return (a || '').localeCompare(b || '', undefined, { numeric: true, sensitivity: 'base' });
}

function compareNumberNullable(a?: number, b?: number): number {
    const aValid = typeof a === 'number' && a > 0;
    const bValid = typeof b === 'number' && b > 0;
    if (aValid && bValid) return (a as number) - (b as number);
    if (aValid) return -1;
    if (bValid) return 1;
    return 0;
}

function formatResultTime(ms?: number, raw?: string): string {
    const formatted = formatTime(ms);
    if (formatted !== '-') return formatted;
    return raw && raw.trim() ? raw : '-';
}

export default function ResultsPage() {
    const { language } = useLanguage();
    const [campaign, setCampaign] = useState<Campaign | null>(null);
    const [loading, setLoading] = useState(true);
    const [selectedCategory, setSelectedCategory] = useState('all');
    const [genderFilter, setGenderFilter] = useState('all');
    const [statusFilter, setStatusFilter] = useState('all');
    const [search, setSearch] = useState('');
    const [debouncedSearch, setDebouncedSearch] = useState('');
    const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const [runners, setRunners] = useState<PasstimeRunner[]>([]);
    const [checkpoints, setCheckpoints] = useState<Checkpoint[]>([]);
    const [cpTimingMap, setCpTimingMap] = useState<CheckpointTimingMap>({});
    const [runnersLoading, setRunnersLoading] = useState(false);
    const [lastRefresh, setLastRefresh] = useState<Date | null>(null);
    const [autoRefresh, setAutoRefresh] = useState(true);
    const refreshTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

    const [editingRunner, setEditingRunner] = useState<PasstimeRunner | null>(null);
    const [editStatus, setEditStatus] = useState('');
    const [editCheckpoint, setEditCheckpoint] = useState('');
    const [editNote, setEditNote] = useState('');
    const [editSaveError, setEditSaveError] = useState<string | null>(null);
    const [editSaving, setEditSaving] = useState(false);
    const [editTimingChanges, setEditTimingChanges] = useState<Record<string, string>>({});
    const [editTimingLoading, setEditTimingLoading] = useState(false);
    const [editTimingSaving, setEditTimingSaving] = useState(false);
    const [editTimingSaveMsg, setEditTimingSaveMsg] = useState<string | null>(null);
    const [editCheckpoints, setEditCheckpoints] = useState<EditCheckpoint[]>([]);
    const [editTimingRecords, setEditTimingRecords] = useState<EditTimingRecord[]>([]);

    const [sortBy, setSortBy] = useState('default');
    const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');

    const isRaceFinished = campaign?.raceFinished ?? false;
    const runnersApiUrl = isRaceFinished
        ? `/api/runners?id=${campaign?._id}`
        : `/api/runners/passtime?id=${campaign?._id}`;

    // ── Load featured campaign ──
    useEffect(() => {
        (async () => {
            try {
                const res = await fetch('/api/campaigns/featured', { cache: 'no-store' });
                if (!res.ok) throw new Error('No featured');
                const data = await res.json();
                if (data?._id) setCampaign(data);
            } catch { setCampaign(null); }
            finally { setLoading(false); }
        })();
    }, []);

    // ── Load checkpoints when campaign is set ──
    useEffect(() => {
        if (!campaign?._id) return;
        (async () => {
            try {
                const res = await fetch(`/api/checkpoints/campaign/${campaign._id}`, { cache: 'no-store' });
                if (!res.ok) return;
                const data: Checkpoint[] = await res.json();
                const sorted = [...data].sort((a, b) => (a.orderNum ?? 999) - (b.orderNum ?? 999));
                setCheckpoints(sorted);
            } catch { setCheckpoints([]); }
        })();
    }, [campaign?._id]);

    // ── Fetch all runners via passtime API + timing per checkpoint ──
    const fetchAllData = useCallback(async (silent = false) => {
        if (!campaign?._id) return;
        if (!silent) setRunnersLoading(true);
        try {
            const runnersRes = await fetch(runnersApiUrl, { cache: 'no-store' });
            let runnersPayload: any = {};
            try { runnersPayload = await runnersRes.json(); } catch { runnersPayload = {}; }
            let runnerList: PasstimeRunner[] = [];
            if (Array.isArray(runnersPayload)) {
                runnerList = runnersPayload;
            } else if (Array.isArray(runnersPayload?.data?.data)) {
                runnerList = runnersPayload.data.data;
            } else if (Array.isArray(runnersPayload?.data)) {
                runnerList = runnersPayload.data;
            }
            setRunners((Array.isArray(runnerList) ? runnerList : []).map(deriveEffectiveStatus));

            if (checkpoints.length > 0) {
                const cpResults = await Promise.all(
                    checkpoints.map(async (cp) => {
                        try {
                            const res = await fetch(`/api/timing/checkpoint-by-campaign/${campaign._id}?cp=${encodeURIComponent(cp.name)}`, { cache: 'no-store' });
                            const records: Array<{ bib: string; scanTime?: string; elapsedTime?: number; splitTime?: number; netTime?: number }> = await res.json();
                            return { cpName: cp.name, records };
                        } catch {
                            return { cpName: cp.name, records: [] };
                        }
                    })
                );
                const newMap: CheckpointTimingMap = {};
                for (const { cpName, records } of cpResults) {
                    for (const rec of records) {
                        if (!rec.bib) continue;
                        if (!newMap[rec.bib]) newMap[rec.bib] = {};
                        newMap[rec.bib][cpName] = {
                            scanTime: rec.scanTime || '',
                            elapsedTime: rec.elapsedTime,
                            splitTime: rec.splitTime,
                            netTime: rec.netTime,
                        };
                    }
                }
                setCpTimingMap(newMap);
            }

            setLastRefresh(new Date());
        } catch (err) {
            console.error('Failed to fetch results data:', err);
        } finally {
            if (!silent) setRunnersLoading(false);
        }
    }, [campaign?._id, checkpoints, runnersApiUrl]);

    // ── Initial load + refresh when deps change ──
    useEffect(() => {
        if (campaign?._id && checkpoints.length >= 0) fetchAllData(false);
    }, [fetchAllData]);

    // ── Auto-refresh ──
    useEffect(() => {
        if (refreshTimerRef.current) clearInterval(refreshTimerRef.current);
        if (autoRefresh && campaign?._id) {
            refreshTimerRef.current = setInterval(() => fetchAllData(true), isRaceFinished ? AUTO_REFRESH_INTERVAL : 10_000);
        }
        return () => { if (refreshTimerRef.current) clearInterval(refreshTimerRef.current); };
    }, [autoRefresh, fetchAllData, campaign?._id, isRaceFinished]);

    useEffect(() => {
        if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
        searchTimerRef.current = setTimeout(() => setDebouncedSearch(search), 250);
        return () => { if (searchTimerRef.current) clearTimeout(searchTimerRef.current); };
    }, [search]);

    // ── Filter + sort runners ──
    const filteredRunners = useMemo(() => {
        const safeRunners = Array.isArray(runners) ? runners : [];
        let list = [...safeRunners];

        // Category filter
        if (selectedCategory !== 'all') {
            list = list.filter(r => r.category === selectedCategory);
        }
        // Gender filter
        if (genderFilter !== 'all') {
            list = list.filter(r => (r.gender || '').toUpperCase() === genderFilter.toUpperCase());
        }
        // Status filter
        if (statusFilter !== 'all') {
            list = list.filter(r => r.status === statusFilter);
        }
        // Search filter
        if (debouncedSearch) {
            const q = debouncedSearch.toLowerCase().trim();
            list = list.filter(r =>
                (r.bib || '').toLowerCase().includes(q) ||
                `${r.firstName} ${r.lastName}`.toLowerCase().includes(q) ||
                `${r.firstNameTh || ''} ${r.lastNameTh || ''}`.toLowerCase().includes(q)
            );
        }

        if (sortBy === 'default') {
            // Default sort: by passtime order matching RaceTiger
            // 1. Finished runners sorted by netTime/gunTime (fastest first)
            // 2. In-progress runners sorted by checkpoint progress (most checkpoints passed first), then by elapsed time
            // 3. DNF/DNS/DQ at the end
            list.sort((a, b) => {
                const statusOrder: Record<string, number> = { finished: 0, in_progress: 1, dnf: 2, dns: 3, dq: 4, not_started: 5 };
                const aOrd = statusOrder[a.status] ?? 9;
                const bOrd = statusOrder[b.status] ?? 9;
                if (aOrd !== bOrd) return aOrd - bOrd;
                if (a.status === 'finished' && b.status === 'finished') {
                    // Sort by net time (chip time) ascending — fastest finisher first
                    const aNet = a.netTime || a.gunTime || 0;
                    const bNet = b.netTime || b.gunTime || 0;
                    if (aNet > 0 && bNet > 0 && aNet !== bNet) return aNet - bNet;
                    if (aNet > 0 && bNet <= 0) return -1;
                    if (aNet <= 0 && bNet > 0) return 1;
                    // If both have same time, use scanTime as tiebreaker (earlier finish = better)
                    const aScan = a.scanTime ? new Date(a.scanTime).getTime() : 0;
                    const bScan = b.scanTime ? new Date(b.scanTime).getTime() : 0;
                    if (aScan > 0 && bScan > 0 && aScan !== bScan) return aScan - bScan;
                }
                if (a.status === 'in_progress' && b.status === 'in_progress') {
                    const aPassed = a.passedCount ?? 0;
                    const bPassed = b.passedCount ?? 0;
                    if (aPassed !== bPassed) return bPassed - aPassed;
                    const liveTimeCompare = compareNumberNullable(a.netTime || a.gunTime || a.elapsedTime, b.netTime || b.gunTime || b.elapsedTime);
                    if (liveTimeCompare !== 0) return liveTimeCompare;
                }
                return compareString(a.bib, b.bib);
            });
        } else {
            list.sort((a, b) => {
                let result = 0;
                if (sortBy === 'bib') result = compareString(a.bib, b.bib);
                else if (sortBy === 'name') result = compareString(`${a.firstName} ${a.lastName}`, `${b.firstName} ${b.lastName}`);
                else if (sortBy === 'gender') result = compareString(a.gender, b.gender);
                else if (sortBy === 'category') result = compareString(a.category, b.category);
                else if (sortBy === 'status') {
                    const statusOrder: Record<string, number> = { finished: 0, in_progress: 1, dnf: 2, dns: 3, dq: 4, not_started: 5 };
                    result = (statusOrder[a.status] ?? 9) - (statusOrder[b.status] ?? 9);
                } else if (sortBy === 'overallRank') result = compareNumberNullable(a.overallRank, b.overallRank);
                else if (sortBy === 'genderRank') result = compareNumberNullable(a.genderRank, b.genderRank);
                else if (sortBy === 'ageGroupRank') result = compareNumberNullable(a.ageGroupRank || a.categoryRank, b.ageGroupRank || b.categoryRank);
                else if (sortBy === 'gunTime') result = compareNumberNullable(a.gunTime, b.gunTime);
                else if (sortBy === 'chipTime' || sortBy === 'netTime') result = compareNumberNullable(a.netTime || a.gunTime, b.netTime || b.gunTime);
                else if (sortBy.startsWith('cp:')) {
                    const cpName = sortBy.slice(3);
                    const aTiming = cpTimingMap[a.bib]?.[cpName];
                    const bTiming = cpTimingMap[b.bib]?.[cpName];
                    const aValue = aTiming?.elapsedTime || (aTiming?.scanTime ? new Date(aTiming.scanTime).getTime() : undefined);
                    const bValue = bTiming?.elapsedTime || (bTiming?.scanTime ? new Date(bTiming.scanTime).getTime() : undefined);
                    result = compareNumberNullable(aValue, bValue);
                }
                if (result === 0) result = compareString(a.bib, b.bib);
                return sortDirection === 'asc' ? result : -result;
            });
        }

        return list;
    }, [runners, selectedCategory, genderFilter, statusFilter, debouncedSearch, sortBy, sortDirection, cpTimingMap]);

    // ── Status counts from runner list ──
    const statusCounts = useMemo(() => {
        const counts: Record<string, number> = {};
        const safe = Array.isArray(runners) ? runners : [];
        safe.forEach(r => { counts[r.status] = (counts[r.status] || 0) + 1; });
        return counts;
    }, [runners]);
    const totalRunners = Array.isArray(runners) ? runners.length : 0;
    const getStatusCount = (st: string) => statusCounts[st] || 0;

    // ── Unique categories from runners ──
    const categories = useMemo(() => {
        const cats = new Set<string>();
        const safe = Array.isArray(runners) ? runners : [];
        safe.forEach(r => { if (r.category) cats.add(r.category); });
        return Array.from(cats).sort();
    }, [runners]);

    // ── Filter checkpoints by selected category's distanceMappings ──
    const filteredCheckpoints = useMemo(() => {
        if (selectedCategory === 'all') return checkpoints;
        return checkpoints.filter(cp => {
            // If no distanceMappings defined, show for all categories
            if (!cp.distanceMappings || cp.distanceMappings.length === 0) return true;
            return cp.distanceMappings.includes(selectedCategory);
        });
    }, [checkpoints, selectedCategory]);

    const setColumnSort = useCallback((column: string, direction: 'asc' | 'desc') => {
        setSortBy(column);
        setSortDirection(direction);
    }, []);

    const renderSortableHeader = useCallback((label: string, column: string, extraStyle: Record<string, unknown> = {}) => (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, ...extraStyle }}>
            <span>{label}</span>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 2 }}>
                <button
                    type="button"
                    onClick={() => setColumnSort(column, 'asc')}
                    style={{
                        border: 'none',
                        background: 'transparent',
                        padding: 0,
                        cursor: 'pointer',
                        color: sortBy === column && sortDirection === 'asc' ? '#dc2626' : '#cbd5e1',
                        fontSize: 11,
                        lineHeight: 1,
                        fontWeight: 900,
                    }}
                    aria-label={`Sort ${label} ascending`}
                >
                    ▲
                </button>
                <button
                    type="button"
                    onClick={() => setColumnSort(column, 'desc')}
                    style={{
                        border: 'none',
                        background: 'transparent',
                        padding: 0,
                        cursor: 'pointer',
                        color: sortBy === column && sortDirection === 'desc' ? '#2563eb' : '#cbd5e1',
                        fontSize: 11,
                        lineHeight: 1,
                        fontWeight: 900,
                    }}
                    aria-label={`Sort ${label} descending`}
                >
                    ▼
                </button>
            </span>
        </div>
    ), [setColumnSort, sortBy, sortDirection]);

    const loadEditData = useCallback(async (runner: PasstimeRunner) => {
        setEditingRunner(runner);
        setEditStatus(runner.status);
        setEditCheckpoint(runner.statusCheckpoint || runner.latestCheckpoint || '');
        setEditNote(runner.statusNote || '');
        setEditSaveError(null);
        setEditTimingChanges({});
        setEditTimingSaveMsg(null);

        if (!campaign?._id || !runner.eventId) {
            setEditCheckpoints([]);
            setEditTimingRecords([]);
            return;
        }

        setEditTimingLoading(true);
        try {
            const [cpRes, trRes] = await Promise.all([
                fetch(`/api/checkpoints/campaign/${campaign._id}`, { cache: 'no-store' }),
                fetch(`/api/timing/runner/${runner.eventId}/${runner._id}`, { cache: 'no-store' }),
            ]);

            if (cpRes.ok) {
                const cpData = await cpRes.json();
                const cps = (Array.isArray(cpData) ? cpData : cpData?.data || []).map((cp: any) => ({
                    name: cp.name || '',
                    orderNum: cp.orderNum ?? 0,
                    type: cp.type || 'checkpoint',
                })).sort((a: EditCheckpoint, b: EditCheckpoint) => a.orderNum - b.orderNum);
                setEditCheckpoints(cps);
            } else {
                setEditCheckpoints([]);
            }

            if (trRes.ok) {
                const trData = await trRes.json();
                const records = (Array.isArray(trData) ? trData : trData?.data || []).map((r: any) => ({
                    _id: r._id,
                    checkpoint: r.checkpoint || '',
                    scanTime: r.scanTime || '',
                    order: r.order,
                }));
                setEditTimingRecords(records);
            } else {
                setEditTimingRecords([]);
            }
        } catch {
            setEditCheckpoints([]);
            setEditTimingRecords([]);
        } finally {
            setEditTimingLoading(false);
        }
    }, [campaign?._id]);

    const handleStatusUpdate = useCallback(async () => {
        if (!editingRunner) return;
        setEditSaving(true);
        setEditSaveError(null);
        try {
            const res = await fetch(`/api/runners/${editingRunner._id}/status`, {
                method: 'PUT',
                headers: authHeaders(),
                body: JSON.stringify({
                    status: editStatus,
                    statusCheckpoint: editCheckpoint || undefined,
                    statusNote: editNote || undefined,
                    changedBy: 'admin',
                }),
            });
            if (!res.ok) {
                const payload = await res.json().catch(() => ({}));
                throw new Error(payload?.message || payload?.error || (language === 'th' ? 'บันทึกข้อมูลไม่สำเร็จ' : 'Failed to save runner status'));
            }
            setRunners(prev => prev.map(r => r._id === editingRunner._id
                ? { ...r, status: editStatus, statusCheckpoint: editCheckpoint, statusNote: editNote, statusChangedAt: new Date().toISOString() }
                : r));
            await fetchAllData(true);
            setEditingRunner(null);
        } catch (err: any) {
            setEditSaveError(err?.message || (language === 'th' ? 'บันทึกข้อมูลไม่สำเร็จ' : 'Failed to save runner status'));
        } finally {
            setEditSaving(false);
        }
    }, [editingRunner, editStatus, editCheckpoint, editNote, language, fetchAllData]);

    const handleTimingSave = useCallback(async () => {
        if (!editingRunner) return;
        setEditTimingSaving(true);
        setEditTimingSaveMsg(null);
        try {
            let savedCount = 0;
            for (const [cpName, localValue] of Object.entries(editTimingChanges)) {
                if (!localValue.trim()) continue;
                const isoDate = new Date(localValue).toISOString();
                const matchedRecord = editTimingRecords.find(r => r.checkpoint.toUpperCase() === cpName.toUpperCase());
                if (matchedRecord?._id) {
                    const res = await fetch(`/api/timing/${matchedRecord._id}`, {
                        method: 'PUT',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ scanTime: isoDate }),
                    });
                    if (res.ok) savedCount++;
                } else if (editingRunner.eventId) {
                    const res = await fetch('/api/timing/scan', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            eventId: editingRunner.eventId,
                            bib: editingRunner.bib,
                            checkpoint: cpName,
                            scanTime: isoDate,
                            note: 'Admin manual entry',
                        }),
                    });
                    if (res.ok) savedCount++;
                }
            }

            setEditTimingChanges({});
            setEditTimingSaveMsg(language === 'th' ? `บันทึกเวลา ${savedCount} จุด เรียบร้อย` : `Saved ${savedCount} checkpoint time(s)`);
            await loadEditData(editingRunner);
            await fetchAllData(true);
            setTimeout(() => setEditTimingSaveMsg(null), 3000);
        } finally {
            setEditTimingSaving(false);
        }
    }, [editingRunner, editTimingChanges, editTimingRecords, language, loadEditData, fetchAllData]);

    const thStyle = { padding: '8px 10px', textAlign: 'center' as const, fontWeight: 700, fontSize: 11, color: '#555', borderBottom: '2px solid #e5e7eb', whiteSpace: 'nowrap' as const };
    const tdStyle = { padding: '6px 10px', borderBottom: '1px solid #f3f4f6', fontSize: 12 };

    return (
        <AdminLayout breadcrumbItems={[{ label: 'ผลการแข่งขัน', labelEn: 'Results' }]}>
            {loading ? (
                <div className="content-box" style={{ padding: 30, textAlign: 'center', color: '#999' }}>
                    {language === 'th' ? 'กำลังโหลด...' : 'Loading...'}
                </div>
            ) : !campaign ? (
                <div className="content-box" style={{ padding: 24 }}>
                    <p style={{ color: '#666', fontSize: 14 }}>
                        {language === 'th' ? 'ยังไม่ได้เลือกกิจกรรมหลัก' : 'No featured campaign selected.'}
                    </p>
                    <a href="/admin/events" style={{ display: 'inline-block', marginTop: 8, padding: '6px 16px', borderRadius: 6, background: '#3b82f6', color: '#fff', fontWeight: 600, textDecoration: 'none', fontSize: 13 }}>
                        {language === 'th' ? 'ไปหน้าอีเวนต์' : 'Go to Events'}
                    </a>
                </div>
            ) : (
                <>
                    {/* Status Summary Cards */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 10, marginBottom: 16 }}>
                        {[
                            { key: 'total', label: language === 'th' ? 'ทั้งหมด' : 'Total', count: totalRunners, color: '#3c8dbc', icon: '👥' },
                            ...Object.entries(STATUS_LABELS).map(([key, val]) => ({
                                key, label: language === 'th' ? val.th : val.en, count: getStatusCount(key), color: val.color, icon: val.icon,
                            })),
                        ].map(card => (
                            <div key={card.key} style={{
                                padding: '12px 14px', borderRadius: 10, background: '#fff',
                                border: `2px solid ${card.count > 0 ? card.color + '40' : '#e5e7eb'}`,
                                transition: 'all .2s',
                            }}>
                                <div style={{ fontSize: 20, marginBottom: 2 }}>{card.icon}</div>
                                <div style={{ fontSize: 20, fontWeight: 800, color: card.color }}>{card.count}</div>
                                <div style={{ fontSize: 11, color: '#888', fontWeight: 600 }}>{card.label}</div>
                            </div>
                        ))}
                    </div>

                    {/* Filters + refresh controls */}
                    <div className="content-box" style={{ padding: '10px 14px', marginBottom: 14 }}>
                        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                            <select className="form-input" value={selectedCategory} onChange={e => setSelectedCategory(e.target.value)}
                                style={{ width: 180, fontSize: 12, padding: '5px 8px' }}>
                                <option value="all">{language === 'th' ? 'ทุกประเภท' : 'All Categories'}</option>
                                {categories.map(cat => (
                                    <option key={cat} value={cat}>{cat}</option>
                                ))}
                            </select>
                            <select className="form-input" value={genderFilter} onChange={e => setGenderFilter(e.target.value)}
                                style={{ width: 90, fontSize: 12, padding: '5px 8px' }}>
                                <option value="all">{language === 'th' ? 'ทุกเพศ' : 'All'}</option>
                                <option value="M">{language === 'th' ? 'ชาย' : 'M'}</option>
                                <option value="F">{language === 'th' ? 'หญิง' : 'F'}</option>
                            </select>
                            <select className="form-input" value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
                                style={{ width: 130, fontSize: 12, padding: '5px 8px' }}>
                                <option value="all">{language === 'th' ? 'ทุกสถานะ' : 'All Status'}</option>
                                {Object.entries(STATUS_LABELS).map(([key, val]) => (
                                    <option key={key} value={key}>{language === 'th' ? val.th : val.en}</option>
                                ))}
                            </select>
                            <input
                                className="form-input"
                                placeholder={language === 'th' ? '🔍 ค้นหา BIB / ชื่อ...' : '🔍 Search BIB / name...'}
                                value={search}
                                onChange={e => setSearch(e.target.value)}
                                style={{ flex: 1, minWidth: 140, fontSize: 12, padding: '5px 8px' }}
                            />
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginLeft: 'auto' }}>
                                <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: '#666', cursor: 'pointer', userSelect: 'none' }}>
                                    <input type="checkbox" checked={autoRefresh} onChange={e => setAutoRefresh(e.target.checked)} style={{ accentColor: '#3b82f6' }} />
                                    {language === 'th' ? 'รีเฟรชอัตโนมัติ' : 'Auto-refresh'}
                                </label>
                                <button onClick={() => fetchAllData(false)}
                                    style={{ padding: '4px 10px', borderRadius: 4, border: '1px solid #d1d5db', background: '#fff', fontSize: 11, cursor: 'pointer', fontWeight: 600, color: '#3b82f6' }}>
                                    ↻ {language === 'th' ? 'รีเฟรช' : 'Refresh'}
                                </button>
                                {lastRefresh && (
                                    <span style={{ fontSize: 10, color: '#999' }}>
                                        {lastRefresh.toLocaleTimeString()}
                                    </span>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* Main Passtime Table */}
                    <div className="content-box" style={{ padding: 0 }}>
                        {runnersLoading ? (
                            <div style={{ padding: 30, textAlign: 'center', color: '#999' }}>
                                {language === 'th' ? 'กำลังโหลดข้อมูล...' : 'Loading data...'}
                            </div>
                        ) : filteredRunners.length === 0 ? (
                            <div style={{ padding: 40, textAlign: 'center' }}>
                                <div style={{ fontSize: 48, marginBottom: 12 }}>🏆</div>
                                <p style={{ color: '#999', fontSize: 14 }}>
                                    {language === 'th' ? 'ไม่พบข้อมูล' : 'No results found'}
                                </p>
                            </div>
                        ) : (
                            <div style={{ overflowX: 'auto' }}>
                                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                                    <thead>
                                        <tr style={{ background: '#f8fafc' }}>
                                            <th style={{ ...thStyle, minWidth: 36, position: 'sticky', left: 0, background: '#f8fafc', zIndex: 2 }}>{renderSortableHeader('#', 'default')}</th>
                                            <th style={{ ...thStyle, minWidth: 54, position: 'sticky', left: 36, background: '#f8fafc', zIndex: 2, textAlign: 'left' }}>{renderSortableHeader('BIB', 'bib', { justifyContent: 'flex-start' })}</th>
                                            <th style={{ ...thStyle, minWidth: 140, textAlign: 'left' }}>{renderSortableHeader(language === 'th' ? 'ชื่อ' : 'Name', 'name', { justifyContent: 'flex-start' })}</th>
                                            <th style={{ ...thStyle, minWidth: 36 }}>{renderSortableHeader(language === 'th' ? 'เพศ' : 'G', 'gender')}</th>
                                            <th style={{ ...thStyle, minWidth: 70 }}>{renderSortableHeader(language === 'th' ? 'ประเภท' : 'Cat', 'category')}</th>
                                            <th style={{ ...thStyle, minWidth: 50 }}>{renderSortableHeader(language === 'th' ? 'สถานะ' : 'Status', 'status')}</th>
                                            <th style={{ ...thStyle, minWidth: 36 }}>{renderSortableHeader(language === 'th' ? '#รวม' : '#OA', 'overallRank')}</th>
                                            <th style={{ ...thStyle, minWidth: 36 }}>{renderSortableHeader(language === 'th' ? '#เพศ' : '#G', 'genderRank')}</th>
                                            <th style={{ ...thStyle, minWidth: 52 }}>{renderSortableHeader(language === 'th' ? '#อายุ' : 'AG Rank', 'ageGroupRank')}</th>
                                            <th style={{ ...thStyle, minWidth: 78 }}>{renderSortableHeader('Gun Time', 'gunTime')}</th>
                                            <th style={{ ...thStyle, minWidth: 78 }}>{renderSortableHeader('Chip Time', 'chipTime')}</th>
                                            {filteredCheckpoints.map(cp => (
                                                <th key={cp._id} style={{ ...thStyle, minWidth: 80, background: '#eef2ff' }}>
                                                    {renderSortableHeader(cp.name, `cp:${cp.name}`)}
                                                </th>
                                            ))}
                                            <th style={{ ...thStyle, minWidth: 70 }}>{renderSortableHeader(language === 'th' ? 'จัดการ' : 'Edit', 'default')}</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {filteredRunners.map((r, idx) => {
                                            const st = STATUS_LABELS[r.status] || STATUS_LABELS.not_started;
                                            const bibTimings = cpTimingMap[r.bib] || {};
                                            return (
                                                <tr key={r._id || `${r.bib}-${idx}`}
                                                    style={{ borderBottom: '1px solid #f3f4f6', transition: 'background .12s' }}
                                                    onMouseOver={e => (e.currentTarget.style.background = '#f8fafc')}
                                                    onMouseOut={e => (e.currentTarget.style.background = 'transparent')}
                                                >
                                                    <td style={{ ...tdStyle, textAlign: 'center', color: '#aaa', fontSize: 11, position: 'sticky', left: 0, background: '#fff', zIndex: 1 }}>{idx + 1}</td>
                                                    <td style={{ ...tdStyle, fontWeight: 700, position: 'sticky', left: 36, background: '#fff', zIndex: 1 }}>{r.bib}</td>
                                                    <td style={{ ...tdStyle, whiteSpace: 'nowrap' }}>
                                                        {language === 'th' && r.firstNameTh ? `${r.firstNameTh} ${r.lastNameTh || ''}` : `${r.firstName} ${r.lastName}`}
                                                    </td>
                                                    <td style={{ ...tdStyle, textAlign: 'center' }}>
                                                        <span style={{ color: r.gender === 'M' ? '#2563eb' : '#db2777', fontWeight: 700, fontSize: 13 }}>
                                                            {r.gender === 'F' ? '♀' : '♂'}
                                                        </span>
                                                    </td>
                                                    <td style={{ ...tdStyle, textAlign: 'center', fontSize: 11 }}>{r.category || '-'}</td>
                                                    <td style={{ ...tdStyle, textAlign: 'center' }}>
                                                        <span style={{
                                                            display: 'inline-block',
                                                            padding: '2px 6px', borderRadius: 4, fontSize: 10, fontWeight: 700,
                                                            color: '#fff', background: st.color, lineHeight: 1.3,
                                                        }}>
                                                            {language === 'th' ? st.th : st.en}
                                                        </span>
                                                    </td>
                                                    <td style={{ ...tdStyle, textAlign: 'center', fontWeight: 700, fontSize: 11 }}>{r.overallRank || '-'}</td>
                                                    <td style={{ ...tdStyle, textAlign: 'center', fontSize: 11 }}>{r.genderRank || '-'}</td>
                                                    <td style={{ ...tdStyle, textAlign: 'center', fontSize: 11 }}>{r.ageGroupRank || r.categoryRank || '-'}</td>
                                                    <td style={{ ...tdStyle, textAlign: 'center', fontFamily: 'monospace', fontWeight: 600, color: r.gunTime ? '#f59e0b' : '#aaa' }}>
                                                        {formatResultTime(r.gunTime, r.gunTimeStr)}
                                                    </td>
                                                    <td style={{ ...tdStyle, textAlign: 'center', fontFamily: 'monospace', fontWeight: 600, color: r.netTime ? '#16a34a' : '#aaa' }}>
                                                        {formatResultTime(r.netTime, r.netTimeStr)}
                                                    </td>
                                                    {filteredCheckpoints.map(cp => {
                                                        const timing = bibTimings[cp.name];
                                                        const hasTiming = Boolean(timing?.scanTime);
                                                        return (
                                                            <td key={cp._id} style={{
                                                                ...tdStyle,
                                                                textAlign: 'center',
                                                                fontFamily: 'monospace',
                                                                fontSize: 11,
                                                                color: hasTiming ? '#0f172a' : '#d1d5db',
                                                                background: hasTiming ? '#f0fdf4' : 'transparent',
                                                                whiteSpace: 'nowrap',
                                                            }}>
                                                                {hasTiming ? (
                                                                    <div>
                                                                        <div style={{ fontWeight: 600 }}>{formatClockTime(timing!.scanTime)}</div>
                                                                        {timing!.elapsedTime && timing!.elapsedTime > 0 && (
                                                                            <div style={{ fontSize: 9, color: '#64748b', marginTop: 1 }}>
                                                                                {formatTime(timing!.elapsedTime)}
                                                                            </div>
                                                                        )}
                                                                    </div>
                                                                ) : '-'}
                                                            </td>
                                                        );
                                                    })}
                                                    <td style={{ ...tdStyle, textAlign: 'center' }}>
                                                        <button onClick={() => loadEditData(r)}
                                                            style={{ padding: '4px 10px', borderRadius: 4, border: '1px solid #d1d5db', background: '#fff', fontSize: 11, cursor: 'pointer', fontWeight: 600, color: '#3b82f6' }}>
                                                            ✏️
                                                        </button>
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        )}

                        {/* Count footer */}
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 14px', borderTop: '1px solid #f3f4f6', fontSize: 11, color: '#888' }}>
                            <span>
                                {language === 'th'
                                    ? `แสดง ${filteredRunners.length} จาก ${totalRunners} คน`
                                    : `Showing ${filteredRunners.length} of ${totalRunners} runners`}
                            </span>
                            <span>
                                {filteredCheckpoints.length > 0 && (
                                    language === 'th'
                                        ? `${filteredCheckpoints.length} Checkpoint`
                                        : `${filteredCheckpoints.length} Checkpoints`
                                )}
                            </span>
                        </div>
                    </div>

                    {editingRunner && (
                        <div
                            onClick={() => setEditingRunner(null)}
                            style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                        >
                            <div
                                onClick={e => e.stopPropagation()}
                                style={{ background: '#fff', borderRadius: 12, padding: 24, width: 560, maxWidth: '95vw', maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 20px 60px rgba(0,0,0,0.3)' }}
                            >
                                <div style={{ marginBottom: 16 }}>
                                    <h3 style={{ margin: '0 0 8px', fontSize: 14, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                        {language === 'th' ? 'แก้ไขข้อมูล Runner' : 'Edit Runner'}
                                    </h3>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '4px 12px', borderRadius: 6, background: '#2563eb', color: '#fff', fontSize: 13, fontWeight: 800, fontFamily: 'monospace', letterSpacing: '0.05em', flexShrink: 0 }}>
                                            BIB {editingRunner.bib}
                                        </span>
                                        <span style={{ fontSize: 16, fontWeight: 700, color: '#0f172a', lineHeight: 1.3 }}>
                                            {language === 'th' && editingRunner.firstNameTh
                                                ? `${editingRunner.firstNameTh} ${editingRunner.lastNameTh || ''}`
                                                : `${editingRunner.firstName} ${editingRunner.lastName}`}
                                        </span>
                                    </div>
                                </div>

                                <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#64748b', marginBottom: 4, textTransform: 'uppercase' }}>
                                    {language === 'th' ? 'สถานะ' : 'Status'}
                                </label>
                                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 14 }}>
                                    {[
                                        { value: 'not_started', label: 'Not Started', color: '#94a3b8' },
                                        { value: 'in_progress', label: 'Running', color: '#f97316' },
                                        { value: 'finished', label: 'Finish', color: '#22c55e' },
                                        { value: 'dnf', label: 'DNF', color: '#dc2626' },
                                        { value: 'dns', label: 'DNS', color: '#6b7280' },
                                        { value: 'dq', label: 'DQ', color: '#7c2d12' },
                                    ].map(opt => (
                                        <button
                                            key={opt.value}
                                            type="button"
                                            onClick={() => setEditStatus(opt.value)}
                                            style={{
                                                padding: '6px 14px', borderRadius: 6, fontSize: 12, fontWeight: 700, cursor: 'pointer',
                                                border: editStatus === opt.value ? `2px solid ${opt.color}` : '2px solid transparent',
                                                background: editStatus === opt.value ? opt.color : '#f1f5f9',
                                                color: editStatus === opt.value ? '#fff' : '#0f172a', transition: 'all 0.15s',
                                            }}
                                        >
                                            {opt.label}
                                        </button>
                                    ))}
                                </div>

                                <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#64748b', marginBottom: 4, textTransform: 'uppercase' }}>
                                    {language === 'th' ? 'จุด Checkpoint' : 'Checkpoint'}
                                </label>
                                <input
                                    value={editCheckpoint}
                                    onChange={e => setEditCheckpoint(e.target.value)}
                                    placeholder={language === 'th' ? 'เช่น CP3, FINISH' : 'e.g. CP3, FINISH'}
                                    style={{ width: '100%', padding: '8px 12px', borderRadius: 6, border: '1px solid #cbd5e1', background: '#fff', color: '#0f172a', fontSize: 13, marginBottom: 14, boxSizing: 'border-box' }}
                                />

                                <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#64748b', marginBottom: 4, textTransform: 'uppercase' }}>
                                    {language === 'th' ? 'หมายเหตุ' : 'Note'}
                                </label>
                                <input
                                    value={editNote}
                                    onChange={e => setEditNote(e.target.value)}
                                    placeholder={language === 'th' ? 'เช่น ขาเจ็บ, หลงทาง' : 'e.g. injury, lost route'}
                                    style={{ width: '100%', padding: '8px 12px', borderRadius: 6, border: '1px solid #cbd5e1', background: '#fff', color: '#0f172a', fontSize: 13, marginBottom: 14, boxSizing: 'border-box' }}
                                />

                                <div style={{ borderTop: '1px solid #e2e8f0', paddingTop: 14, marginBottom: 14 }}>
                                    <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#64748b', marginBottom: 8, textTransform: 'uppercase' }}>
                                        {language === 'th' ? 'เวลาเข้าจุด Checkpoint' : 'Checkpoint Times'}
                                    </label>
                                    {editTimingLoading ? (
                                        <div style={{ textAlign: 'center', padding: 16, color: '#64748b', fontSize: 12 }}>
                                            {language === 'th' ? 'กำลังโหลด...' : 'Loading...'}
                                        </div>
                                    ) : editCheckpoints.length === 0 ? (
                                        <div style={{ textAlign: 'center', padding: 12, color: '#64748b', fontSize: 12, background: '#f8fafc', borderRadius: 6 }}>
                                            {language === 'th' ? 'ไม่พบข้อมูล Checkpoint' : 'No checkpoints found'}
                                        </div>
                                    ) : (
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                                            {editCheckpoints.map((cp) => {
                                                const matchedRecord = editTimingRecords.find(r => r.checkpoint.toUpperCase() === cp.name.toUpperCase());
                                                const currentValue = editTimingChanges[cp.name] !== undefined
                                                    ? editTimingChanges[cp.name]
                                                    : toDatetimeLocalValue(matchedRecord?.scanTime);
                                                const cpColor = cp.type === 'start' ? '#3b82f6' : cp.type === 'finish' ? '#22c55e' : '#8b5cf6';
                                                return (
                                                    <div key={cp.name} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                                        <span style={{ display: 'inline-block', padding: '2px 8px', borderRadius: 4, fontSize: 10, fontWeight: 700, color: '#fff', background: cpColor, minWidth: 68, textAlign: 'center', whiteSpace: 'nowrap' }}>
                                                            {cp.name}
                                                        </span>
                                                        <input
                                                            type="datetime-local"
                                                            value={currentValue}
                                                            onChange={e => setEditTimingChanges(prev => ({ ...prev, [cp.name]: e.target.value }))}
                                                            style={{ flex: 1, padding: '6px 10px', borderRadius: 6, border: '1px solid #cbd5e1', background: '#fff', color: '#0f172a', fontSize: 12, fontFamily: 'monospace', boxSizing: 'border-box' }}
                                                        />
                                                    </div>
                                                );
                                            })}
                                            {Object.keys(editTimingChanges).length > 0 && (
                                                <button
                                                    type="button"
                                                    onClick={handleTimingSave}
                                                    disabled={editTimingSaving}
                                                    style={{ padding: '6px 16px', borderRadius: 6, border: 'none', background: '#8b5cf6', color: '#fff', fontSize: 12, fontWeight: 700, cursor: editTimingSaving ? 'not-allowed' : 'pointer', alignSelf: 'flex-end', marginTop: 4, opacity: editTimingSaving ? 0.6 : 1 }}
                                                >
                                                    {editTimingSaving ? (language === 'th' ? 'กำลังบันทึก...' : 'Saving...') : (language === 'th' ? 'บันทึกเวลา Checkpoint' : 'Save Checkpoint Times')}
                                                </button>
                                            )}
                                            {editTimingSaveMsg && (
                                                <span style={{ fontSize: 11, fontWeight: 600, color: '#22c55e', alignSelf: 'flex-end' }}>
                                                    ✓ {editTimingSaveMsg}
                                                </span>
                                            )}
                                        </div>
                                    )}
                                </div>

                                {editSaveError && (
                                    <div style={{ marginBottom: 12, borderRadius: 8, border: '1px solid #fecaca', background: '#fef2f2', padding: '10px 12px', fontSize: 12, fontWeight: 600, color: '#b91c1c' }}>
                                        {editSaveError}
                                    </div>
                                )}

                                <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                                    <button
                                        type="button"
                                        onClick={() => setEditingRunner(null)}
                                        style={{ padding: '8px 20px', borderRadius: 6, border: '1px solid #cbd5e1', background: 'transparent', color: '#0f172a', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}
                                    >
                                        {language === 'th' ? 'ยกเลิก' : 'Cancel'}
                                    </button>
                                    <button
                                        type="button"
                                        onClick={handleStatusUpdate}
                                        disabled={editSaving}
                                        style={{ padding: '8px 24px', borderRadius: 6, border: 'none', background: '#2563eb', color: '#fff', fontSize: 13, fontWeight: 700, cursor: editSaving ? 'not-allowed' : 'pointer', opacity: editSaving ? 0.6 : 1 }}
                                    >
                                        {editSaving ? (language === 'th' ? 'กำลังบันทึก...' : 'Saving...') : (language === 'th' ? 'บันทึกสถานะ' : 'Save Status')}
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}
                </>
            )}
        </AdminLayout>
    );
}
