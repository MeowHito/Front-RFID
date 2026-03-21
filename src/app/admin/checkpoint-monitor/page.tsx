'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useLanguage } from '@/lib/language-context';
import AdminLayout from '../AdminLayout';

interface Campaign { _id: string; name: string; slug?: string; categories?: { name: string; distance?: string }[]; }
interface Checkpoint { _id: string; name: string; kmCumulative?: number; eventId?: string; order?: number; }

interface RunnerAtCheckpoint {
    _id: string;
    bib: string;
    firstName: string;
    lastName: string;
    gender: string;
    category: string;
    status: string;
    overallRank: number;
    genderRank: number;
    categoryRank: number;
    checkpoint?: string;
    scanTime?: string;
    elapsedTime?: number;
    splitTime?: number;
    netTime?: number;
    gunTime?: number;
    netPace?: string;
    gunPace?: string;
    statusNote?: string;
    statusCheckpoint?: string;
}

const STATUS_OPTIONS = [
    { value: 'finished', label_th: 'Finished', label_en: 'Finished', tw: 'bg-green-50 border-green-400 text-green-900' },
    { value: 'in_progress', label_th: 'In Progress', label_en: 'In Progress', tw: 'bg-blue-50 border-blue-400 text-blue-900' },
    { value: 'not_started', label_th: 'Not Started', label_en: 'Not Started', tw: 'bg-slate-50 border-slate-300 text-slate-700' },
    { value: 'dns', label_th: 'DNS', label_en: 'DNS', tw: 'bg-red-50 border-red-400 text-red-900' },
    { value: 'dnf', label_th: 'DNF', label_en: 'DNF', tw: 'bg-red-50 border-red-400 text-red-900' },
    { value: 'dq', label_th: 'DQ', label_en: 'DQ', tw: 'bg-pink-50 border-pink-400 text-pink-900' },
];

function formatMs(ms?: number): string {
    if (!ms || ms <= 0) return '-';
    const totalSec = Math.floor(ms / 1000);
    const h = Math.floor(totalSec / 3600);
    const m = Math.floor((totalSec % 3600) / 60);
    const s = totalSec % 60;
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

function normalizeRunnerText(value?: string): string {
    return (value || '').trim().toLowerCase();
}

function getRunnerScanTimeValue(scanTime?: string): number {
    if (!scanTime) return Number.POSITIVE_INFINITY;
    const value = new Date(scanTime).getTime();
    return Number.isFinite(value) ? value : Number.POSITIVE_INFINITY;
}

function getRunnerDedupKey(runner: RunnerAtCheckpoint): string {
    const bib = normalizeRunnerText(runner.bib);
    if (bib) return bib;
    return runner._id || 'unknown-runner';
}

function hasRunnerName(runner: RunnerAtCheckpoint): boolean {
    return !!(runner.firstName || runner.lastName);
}

function dedupeCheckpointRunners(items: RunnerAtCheckpoint[]): RunnerAtCheckpoint[] {
    const deduped = new Map<string, RunnerAtCheckpoint>();

    items.forEach((runner) => {
        const key = getRunnerDedupKey(runner);
        const existing = deduped.get(key);

        if (!existing) {
            deduped.set(key, runner);
            return;
        }

        const existingHasName = hasRunnerName(existing);
        const nextHasName = hasRunnerName(runner);

        if (!existingHasName && nextHasName) {
            // Replace orphan (no name) with named record, but keep earliest scanTime
            const existingScanTime = getRunnerScanTimeValue(existing.scanTime);
            const nextScanTime = getRunnerScanTimeValue(runner.scanTime);
            deduped.set(key, {
                ...runner,
                scanTime: existingScanTime < nextScanTime ? existing.scanTime : runner.scanTime,
                elapsedTime: existing.elapsedTime || runner.elapsedTime,
            });
            return;
        }

        if (existingHasName && !nextHasName) {
            // Keep existing (has name), use earlier scanTime if this orphan is earlier
            const existingScanTime = getRunnerScanTimeValue(existing.scanTime);
            const nextScanTime = getRunnerScanTimeValue(runner.scanTime);
            if (nextScanTime < existingScanTime) {
                deduped.set(key, { ...existing, scanTime: runner.scanTime });
            }
            return;
        }

        // Both have name or both orphans — keep earliest scanTime
        const existingScanTime = getRunnerScanTimeValue(existing.scanTime);
        const nextScanTime = getRunnerScanTimeValue(runner.scanTime);
        if (nextScanTime < existingScanTime) {
            deduped.set(key, { ...existing, ...runner, _id: runner._id || existing._id });
        }
    });

    return Array.from(deduped.values());
}

function normalizeRunnerStatus(status?: string): string {
    const normalized = (status || '').trim().toLowerCase();
    if (!normalized) return 'not_started';
    return normalized;
}

function getStoppedStatusText(status: string, checkpoint?: string): string {
    if (status === 'dns') return 'DNS';
    if (status === 'dnf') return checkpoint ? `DNF @ ${checkpoint}` : 'DNF';
    if (status === 'dq') return checkpoint ? `DQ @ ${checkpoint}` : 'DQ';
    return '-';
}

export default function CheckpointMonitorPage() {
    const { language } = useLanguage();
    const th = language === 'th';

    const [campaign, setCampaign] = useState<Campaign | null>(null);
    const [checkpoints, setCheckpoints] = useState<Checkpoint[]>([]);
    const [selectedCp, setSelectedCp] = useState('');
    const [runners, setRunners] = useState<RunnerAtCheckpoint[]>([]);
    const [loading, setLoading] = useState(true);
    const [dataLoading, setDataLoading] = useState(false);
    const [search, setSearch] = useState('');
    const [sortBy, setSortBy] = useState<'arrival' | 'bib' | 'name' | 'elapsed' | 'pace'>('arrival');
    const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
    const [lastRefresh, setLastRefresh] = useState(new Date());
    const [currentTime, setCurrentTime] = useState(new Date());
    const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);
    const [statusFilter, setStatusFilter] = useState<string | null>(null);
    const [rankDeltas, setRankDeltas] = useState<Map<string, number>>(new Map());
    const [confirmModal, setConfirmModal] = useState<{ runnerId: string; bib: string; name: string; newStatus: string; label: string } | null>(null);
    const intervalRef = useRef<NodeJS.Timeout | null>(null);

    // Load campaign
    useEffect(() => {
        async function load() {
            try {
                const res = await fetch('/api/campaigns/featured', { cache: 'no-store' });
                if (!res.ok) throw new Error();
                const data = await res.json();
                if (data?._id) setCampaign(data);
            } catch { setCampaign(null); }
            finally { setLoading(false); }
        }
        load();
    }, []);

    // Load checkpoints when campaign loaded
    useEffect(() => {
        if (!campaign?._id) return;
        fetch(`/api/checkpoints/campaign/${campaign._id}`, { cache: 'no-store' })
            .then(r => r.json())
            .then(data => {
                const list = Array.isArray(data) ? data : [];
                setCheckpoints(list);
                if (list.length > 0 && !selectedCp) setSelectedCp(list[0].name);
            })
            .catch(() => setCheckpoints([]));
    }, [campaign?._id]);

    // Fetch runners who arrived at selected checkpoint (via timing records)
    const fetchRunners = useCallback(async () => {
        if (!campaign?._id || !selectedCp) return;
        setDataLoading(true);
        try {
            const res = await fetch(`/api/timing/checkpoint-by-campaign/${campaign._id}?cp=${encodeURIComponent(selectedCp)}`, { cache: 'no-store' });
            if (!res.ok) throw new Error();
            const data = await res.json();
            const newRunners = Array.isArray(data) ? dedupeCheckpointRunners(data) : [];
            // Compute rank deltas: compare arrival position at this CP vs overallRank
            const newDeltas = new Map<string, number>();
            const sorted = [...newRunners].sort((a, b) =>
                new Date(a.scanTime || 0).getTime() - new Date(b.scanTime || 0).getTime()
            );
            sorted.forEach((r, idx) => {
                const arrivalPos = idx + 1;
                if (r.bib && r.overallRank && r.overallRank > 0) {
                    // positive = moved up (arrival pos was worse, overall rank is better)
                    // negative = dropped (arrival pos was better, overall rank is worse)
                    newDeltas.set(r.bib, arrivalPos - r.overallRank);
                }
            });
            setRankDeltas(newDeltas);
            setRunners(newRunners);
        } catch { setRunners([]); }
        finally {
            setDataLoading(false);
            setLastRefresh(new Date());
        }
    }, [campaign?._id, selectedCp]);

    useEffect(() => { if (campaign?._id && selectedCp) fetchRunners(); }, [campaign?._id, selectedCp, fetchRunners]);

    // Auto-refresh every 10s (always on)
    useEffect(() => {
        if (campaign?._id && selectedCp) {
            intervalRef.current = setInterval(fetchRunners, 10000);
        }
        return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
    }, [campaign?._id, selectedCp, fetchRunners]);

    // Live clock — update every second
    useEffect(() => {
        const t = setInterval(() => setCurrentTime(new Date()), 1000);
        return () => clearInterval(t);
    }, []);

    // Toast auto-dismiss
    useEffect(() => {
        if (toast) { const t = setTimeout(() => setToast(null), 3000); return () => clearTimeout(t); }
    }, [toast]);

    // Status change handler — shows custom popup
    const handleStatusChange = (runnerId: string, newStatus: string) => {
        const runner = runners.find(r => r._id === runnerId);
        const statusLabel = STATUS_OPTIONS.find(o => o.value === newStatus)?.label_th || newStatus;
        setConfirmModal({
            runnerId,
            bib: runner?.bib || '',
            name: `${runner?.firstName || ''} ${runner?.lastName || ''}`.trim(),
            newStatus,
            label: statusLabel,
        });
    };

    const confirmStatusChange = async () => {
        if (!confirmModal) return;
        const { runnerId, bib, newStatus, label } = confirmModal;
        setConfirmModal(null);
        try {
            const res = await fetch(`/api/runners/${runnerId}/status`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ status: newStatus, statusCheckpoint: selectedCp, changedBy: 'staff' }),
            });
            if (!res.ok) throw new Error('Failed');
            setRunners(prev => prev.map(r => r._id === runnerId ? { ...r, status: newStatus } : r));
            const bibLabel = bib ? `BIB ${bib}` : '';
            setToast({ msg: th ? `${bibLabel} อัปเดตเป็น ${label} สำเร็จ` : `${bibLabel} updated to ${label}`, type: 'success' });
        } catch {
            setToast({ msg: th ? 'เกิดข้อผิดพลาด' : 'Error updating status', type: 'error' });
        }
    };

    // Share link — uses public share-live page (no admin auth required)
    const handleShareLink = () => {
        const slug = campaign?.slug || campaign?._id;
        const url = slug
            ? `${window.location.origin}/share-live/${slug}?cp=${encodeURIComponent(selectedCp)}`
            : `${window.location.origin}/admin/checkpoint-monitor?cp=${encodeURIComponent(selectedCp)}`;
        navigator.clipboard.writeText(url).then(() => {
            setToast({ msg: th ? 'คัดลอกลิงก์แล้ว' : 'Link copied!', type: 'success' });
        }).catch(() => {
            setToast({ msg: url, type: 'success' });
        });
    };

    // Search filter
    const filteredRunners = runners.filter(r => {
        const runnerStatus = normalizeRunnerStatus(r.status);
        const isStopped = ['dnf', 'dns', 'dq'].includes(runnerStatus);
        if (statusFilter) {
            if (statusFilter === 'passed') {
                // "ผ่านแล้ว" = has scanTime at this checkpoint AND not DNF/DNS/DQ
                if (isStopped || !r.scanTime) return false;
            } else if (statusFilter === 'coming') {
                // "กำลังมา" = not stopped, no scanTime at this checkpoint
                if (isStopped || !!r.scanTime) return false;
            } else if (statusFilter === 'dns' || statusFilter === 'dnf' || statusFilter === 'dq') {
                if (runnerStatus !== statusFilter) return false;
            }
        }
        if (!search) return true;
        const term = search.toLowerCase();
        const name = `${r.firstName} ${r.lastName}`.toLowerCase();
        return r.bib?.toLowerCase().includes(term) || name.includes(term);
    });

    // Sort toggle helper
    const toggleSort = (col: typeof sortBy) => {
        if (sortBy === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
        else { setSortBy(col); setSortDir(col === 'arrival' ? 'desc' : 'asc'); }
    };
    const sortArrow = (col: typeof sortBy) => {
        if (sortBy === col) {
            return sortDir === 'asc'
                ? <span className="ml-0.5 text-[9px] text-green-500">▲</span>
                : <span className="ml-0.5 text-[9px] text-red-500">▼</span>;
        }
        return <span className="ml-0.5 text-[9px] text-slate-300">▲▼</span>;
    };

    // Sort — default by latest arrival first (scanTime descending)
    const sortedRunners = [...filteredRunners].sort((a, b) => {
        let cmp = 0;
        switch (sortBy) {
            case 'bib': cmp = (a.bib || '').localeCompare(b.bib || '', undefined, { numeric: true }); break;
            case 'name': cmp = `${a.firstName} ${a.lastName}`.localeCompare(`${b.firstName} ${b.lastName}`); break;
            case 'elapsed': cmp = (a.elapsedTime || a.netTime || a.gunTime || 0) - (b.elapsedTime || b.netTime || b.gunTime || 0); break;
            case 'pace': cmp = (a.netPace || a.gunPace || 'zz').localeCompare(b.netPace || b.gunPace || 'zz'); break;
            default: cmp = new Date(a.scanTime || 0).getTime() - new Date(b.scanTime || 0).getTime(); break;
        }
        return sortDir === 'asc' ? cmp : -cmp;
    });

    const getStatusOpt = (status: string) => STATUS_OPTIONS.find(s => s.value === normalizeRunnerStatus(status)) || STATUS_OPTIONS[2];

    if (loading) {
        return (
            <AdminLayout breadcrumbItems={[{ label: 'Checkpoint Monitor', labelEn: 'Checkpoint Monitor' }]}>
                <div className="p-10 text-center text-slate-400">{th ? 'กำลังโหลด...' : 'Loading...'}</div>
            </AdminLayout>
        );
    }

    return (
        <AdminLayout breadcrumbItems={[{ label: 'จุดเช็คอิน (Checkpoints)', labelEn: 'Checkpoint Monitor' }]}>
            {/* Header bar */}
            <div className="bg-white border border-slate-200 rounded-[14px] px-5 py-4 mb-4 shadow-sm">
                <div className="flex items-center justify-between gap-4 flex-wrap">
                    <div>
                        <h1 className="text-xl font-extrabold text-slate-900 m-0 flex items-center gap-2.5">
                            Live Checkpoint Monitor
                            <button onClick={handleShareLink}
                                className="px-3 py-1 bg-blue-50 text-blue-600 border border-blue-200 rounded-md text-[11px] font-semibold cursor-pointer flex items-center gap-1 hover:bg-blue-100 transition-colors">
                                🔗 Share Live
                            </button>
                        </h1>
                    </div>
                    <div className="flex items-center gap-2">
                        <span className="text-[13px] font-bold text-slate-600">{th ? 'เลือกจุด:' : 'Checkpoint:'}</span>
                        <select value={selectedCp} onChange={e => setSelectedCp(e.target.value)}
                            className="px-3.5 py-2 rounded-[10px] border-[1.5px] border-blue-800 bg-yellow-100 text-white text-[13px] font-bold cursor-pointer min-w-[200px]">
                            {checkpoints.length === 0 && <option value="">{th ? 'ไม่มีจุดเช็คอิน' : 'No checkpoints'}</option>}
                            {checkpoints.map(cp => (
                                <option key={cp._id} value={cp.name}>
                                    {cp.name}{cp.kmCumulative ? ` (${cp.kmCumulative}KM)` : ''}
                                </option>
                            ))}
                        </select>
                    </div>
                </div>

                {/* Search + info bar */}
                <div className="flex justify-between items-center mt-3.5 border-t border-slate-100 pt-3.5 gap-3 flex-wrap">
                    <div className="flex items-center gap-3 flex-wrap">
                        <span className="text-[12px] font-bold text-slate-500">{th ? 'สรุป:' : 'Summary:'}</span>
                        {[
                            { key: 'passed', label: th ? 'ผ่านแล้ว' : 'Passed', count: runners.filter(r => { const s = normalizeRunnerStatus(r.status); return !['dnf','dns','dq'].includes(s) && !!r.scanTime; }).length, bg: 'text-green-700 border-b-2 border-green-500 bg-green-200 ', bgActive: 'bg-green-600 text-white border-b-0' },
                            { key: 'coming', label: th ? 'กำลังมา' : 'Coming', count: runners.filter(r => { const s = normalizeRunnerStatus(r.status); return !['dnf','dns','dq','finished'].includes(s) && !r.scanTime; }).length, bg: 'text-amber-800 bg-amber-200', bgActive: 'bg-amber-500 text-white' },
                            { key: 'dns', label: 'DNS', count: runners.filter(r => normalizeRunnerStatus(r.status) === 'dns').length, bg: 'text-red-800 bg-red-200', bgActive: 'bg-red-600 text-white' },
                            { key: 'dnf', label: 'DNF', count: runners.filter(r => normalizeRunnerStatus(r.status) === 'dnf').length, bg: 'text-red-800 bg-red-200', bgActive: 'bg-red-600 text-white' },
                            { key: 'dq', label: 'DQ', count: runners.filter(r => normalizeRunnerStatus(r.status) === 'dq').length, bg: 'text-pink-800 bg-pink-200', bgActive: 'bg-pink-600 text-white' },
                        ].map(item => (
                            <button key={item.key ?? 'all'}
                                onClick={() => setStatusFilter(prev => prev === item.key ? null : item.key)}
                                className={`px-2.5 py-1 rounded-md text-[11px] font-bold cursor-pointer border-none transition-all ${
                                    statusFilter === item.key ? item.bgActive : item.bg
                                } hover:opacity-80`}
                            >
                                {item.label}: {item.count}
                            </button>
                        ))}
                    </div>
                    <div className="flex items-center gap-2">
                        <div className="relative">
                            <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-slate-400">🔍</span>
                            <input type="text" value={search} onChange={e => setSearch(e.target.value)}
                                placeholder={th ? 'ค้นหา BIB, ชื่อ...' : 'Search BIB, name...'}
                                className="py-2 pr-3 pl-[30px] rounded-[10px] border-[1.5px] border-slate-200 text-[13px] w-[350px] outline-none focus:border-slate-400 transition-colors" />
                        </div>
                        <button onClick={fetchRunners} disabled={dataLoading}
                            className="px-3.5 py-2 rounded-lg border border-slate-200 bg-white text-xs font-semibold cursor-pointer text-slate-600 hover:bg-slate-50 disabled:cursor-not-allowed transition-colors">
                            {dataLoading ? '...' : '🔄'}
                        </button>
                        <span className="text-[10px] text-slate-400 font-mono">{currentTime.toLocaleTimeString('th-TH')}</span>
                    </div>
                </div>
            </div>

            {/* Runners Table */}
            <div className="bg-white border border-slate-200 rounded-[14px] overflow-hidden shadow-sm">
                <div className="overflow-x-auto max-h-[600px] overflow-y-auto">
                    <table className="w-full border-collapse text-[13px] min-w-[700px]">
                        <thead className="bg-slate-50 sticky top-0 z-10">
                            <tr>
                                <th className="px-2 py-3 text-center font-bold text-slate-600 w-[60px]">
                                    <button onClick={() => toggleSort('bib')}
                                        className={`bg-transparent border-none cursor-pointer font-bold text-xs inline-flex items-center ${sortBy === 'bib' ? 'text-green-600' : 'text-slate-600'}`}>
                                        BIB{sortArrow('bib')}
                                    </button>
                                </th>
                                <th className="px-2 py-3 text-left font-bold text-slate-600">
                                    <button onClick={() => toggleSort('name')}
                                        className={`bg-transparent border-none cursor-pointer font-bold text-xs inline-flex items-center ${sortBy === 'name' ? 'text-green-600' : 'text-slate-600'}`}>
                                        {th ? 'นักกีฬา & Rankings' : 'Athlete & Rankings'}{sortArrow('name')}
                                    </button>
                                </th>
                                <th className="px-1 py-3 text-center font-bold text-slate-600 w-[50px]">Cat.</th>
                                <th className="px-1 py-3 text-center font-bold text-slate-600 w-[85px]">
                                    <button onClick={() => toggleSort('arrival')}
                                        className={`bg-transparent border-none cursor-pointer font-bold text-xs inline-flex items-center ${sortBy === 'arrival' ? 'text-green-600' : 'text-slate-600'}`}>
                                        {th ? 'ถึงจุด' : 'Arrival'}{sortArrow('arrival')}
                                    </button>
                                </th>
                                <th className="px-1 py-3 text-center font-bold text-slate-600 w-[85px]">
                                    <button onClick={() => toggleSort('elapsed')}
                                        className={`bg-transparent border-none cursor-pointer font-bold text-xs inline-flex items-center ${sortBy === 'elapsed' ? 'text-green-600' : 'text-slate-600'}`}>
                                        {th ? 'สะสม' : 'Elapsed'}{sortArrow('elapsed')}
                                    </button>
                                </th>
                                <th className="px-1 py-3 text-center font-bold text-slate-600 w-[65px]">
                                    <button onClick={() => toggleSort('pace')}
                                        className={`bg-transparent border-none cursor-pointer font-bold text-xs inline-flex items-center ${sortBy === 'pace' ? 'text-green-600' : 'text-slate-600'}`}>
                                        Pace{sortArrow('pace')}
                                    </button>
                                </th>
                                <th className="px-1 py-3 text-center font-bold text-slate-600 w-[100px]">
                                    {th ? 'สถานะ' : 'Status'}
                                </th>
                            </tr>
                        </thead>
                        <tbody>
                            {dataLoading && sortedRunners.length === 0 ? (
                                <tr><td colSpan={7} className="p-10 text-center text-slate-400">{th ? 'กำลังโหลด...' : 'Loading...'}</td></tr>
                            ) : sortedRunners.length === 0 ? (
                                <tr><td colSpan={7} className="p-10 text-center text-slate-400">{th ? 'ยังไม่มีนักกีฬาถึงจุดนี้' : 'No runners arrived at this checkpoint yet'}</td></tr>
                            ) : sortedRunners.map((r, idx) => { const rowKey = r._id ? `${r._id}-${idx}` : `row-${idx}`;
                                const runnerStatus = normalizeRunnerStatus(r.status);
                                const isStopped = ['dnf', 'dns', 'dq'].includes(runnerStatus);
                                const statusOpt = getStatusOpt(runnerStatus);
                                const rowCls = isStopped ? 'bg-red-50' : 'bg-white';
                                return (
                                    <tr key={rowKey} className={`border-b border-slate-100 transition-colors ${rowCls}`}>
                                        <td className={`p-2.5 text-center font-bold ${isStopped ? 'text-slate-400' : 'text-slate-700'}`}>
                                            {r.bib}
                                        </td>
                                        <td className="p-2">
                                            <div className={`font-semibold text-[13px] ${isStopped ? 'text-red-600' : 'text-slate-900'}`}>
                                                {r.firstName} {r.lastName}
                                            </div>
                                            <div className={`text-[11px] mt-0.5 ${isStopped ? 'text-red-300' : 'text-slate-400'}`}>
                                                Ovr: <b className={isStopped ? 'text-red-300' : 'text-slate-700'}>{r.overallRank || '-'}</b>{(() => { const d = rankDeltas.get(r.bib); if (d === undefined) return null; if (d === 0) return <span className="text-slate-400 ml-0.5">(—)</span>; return d > 0 ? <span style={{color:'#16a34a',fontWeight:700}} className="ml-0.5">(↑{d})</span> : <span style={{color:'#ef4444',fontWeight:700}} className="ml-0.5">(↓{Math.abs(d)})</span>; })()}
                                                {' | '}Gen: <b className={isStopped ? 'text-red-300' : 'text-slate-700'}>{r.genderRank || '-'}</b>
                                                {' | '}Cat: <b className={isStopped ? 'text-red-300' : 'text-slate-700'}>{r.categoryRank || '-'}</b>
                                            </div>
                                        </td>
                                        <td className="p-2.5 text-center text-[11px] font-medium text-slate-500">
                                            {r.category || '-'}
                                        </td>
                                        <td className="p-2.5 text-center text-[12px] font-mono text-slate-600">
                                            {r.scanTime ? new Date(r.scanTime).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '-'}
                                        </td>
                                        <td className={`p-2.5 text-center font-bold text-[13px] ${isStopped ? 'text-red-600' : 'text-slate-900'}`}>
                                            {isStopped ? getStoppedStatusText(runnerStatus, r.statusCheckpoint) : formatMs(r.elapsedTime || r.netTime || r.gunTime)}
                                        </td>
                                        <td className="p-2.5 text-center text-[11px] text-slate-500">
                                            {isStopped ? '-' : (r.netPace || r.gunPace || '-')}
                                        </td>
                                        <td className="p-2.5 text-center">
                                            <select
                                                value={STATUS_OPTIONS.some(opt => opt.value === runnerStatus) ? runnerStatus : 'in_progress'}
                                                onChange={e => handleStatusChange(r._id, e.target.value)}
                                                className={`px-2 py-1 rounded-md border text-[11px] font-bold cursor-pointer outline-none ${statusOpt.tw}`}
                                            >
                                                {STATUS_OPTIONS.map(opt => (
                                                    <option key={opt.value} value={opt.value}>
                                                        {th ? opt.label_th : opt.label_en}
                                                    </option>
                                                ))}
                                            </select>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            </div>



            {/* Confirmation Modal */}
            {confirmModal && (
                <div className="fixed inset-0 z-[20000] flex items-center justify-center" onClick={() => setConfirmModal(null)}>
                    <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
                    <div
                        className="relative bg-white rounded-2xl shadow-2xl w-[340px] p-6 flex flex-col gap-4"
                        onClick={e => e.stopPropagation()}
                    >
                        {/* Icon */}
                        <div className={`w-12 h-12 rounded-full flex items-center justify-center mx-auto text-2xl ${
                            confirmModal.newStatus === 'dnf' ? 'bg-red-100' :
                            confirmModal.newStatus === 'dq' ? 'bg-pink-100' : 'bg-green-100'
                        }`}>
                            {confirmModal.newStatus === 'dnf' ? '🚫' : confirmModal.newStatus === 'dq' ? '⛔' : '✅'}
                        </div>
                        {/* Text */}
                        <div className="text-center">
                            <p className="font-extrabold text-slate-800 text-[16px]">
                                {th ? 'ยืนยันเปลี่ยนสถานะ' : 'Confirm Status Change'}
                            </p>
                            <p className="text-slate-500 text-sm mt-1">
                                BIB <span className="font-bold text-slate-800">{confirmModal.bib}</span>
                                {confirmModal.name && <> — <span className="text-slate-700">{confirmModal.name}</span></>}
                            </p>
                            <p className="mt-2 text-sm text-slate-500">
                                {th ? 'เปลี่ยนเป็น' : 'Change to'}{' '}
                                <span className={`font-extrabold text-lg ${
                                    confirmModal.newStatus === 'dnf' ? 'text-red-600' :
                                    confirmModal.newStatus === 'dq' ? 'text-pink-600' : 'text-green-600'
                                }`}>
                                    {confirmModal.label}
                                </span>
                            </p>
                        </div>
                        {/* Buttons */}
                        <div className="flex gap-3 mt-1">
                            <button
                                onClick={() => setConfirmModal(null)}
                                className="flex-1 py-2.5 rounded-xl border border-slate-200 text-slate-600 font-semibold text-sm bg-white hover:bg-slate-50 transition-colors cursor-pointer"
                            >
                                {th ? 'ยกเลิก' : 'Cancel'}
                            </button>
                            <button
                                onClick={confirmStatusChange}
                                className={`flex-1 py-2.5 rounded-xl text-white font-bold text-sm transition-colors cursor-pointer border-none ${
                                    confirmModal.newStatus === 'dnf' ? 'bg-red-600 hover:bg-red-700' :
                                    confirmModal.newStatus === 'dq' ? 'bg-pink-600 hover:bg-pink-700' :
                                    'bg-green-600 hover:bg-green-700'
                                }`}
                            >
                                {th ? 'ยืนยัน' : 'Confirm'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Toast */}
            {toast && (
                <div className={`fixed bottom-6 right-6 z-[10000] px-6 py-3.5 rounded-[14px] text-white font-bold text-sm shadow-[0_10px_25px_rgba(0,0,0,0.2)] animate-[slideUp_0.3s_ease-out] ${
                    toast.type === 'success' ? 'bg-green-600' : 'bg-red-600'
                }`}>
                    {toast.type === 'success' ? '✅' : '❌'} {toast.msg}
                </div>
            )}
        </AdminLayout>
    );
}
