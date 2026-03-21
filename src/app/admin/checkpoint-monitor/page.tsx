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
    { value: 'in_progress', label_th: 'กำลังวิ่ง', label_en: 'Running', tw: 'bg-amber-50 border-amber-400 text-amber-900' },
    { value: 'finished', label_th: 'เข้าเส้นชัย', label_en: 'Finished', tw: 'bg-green-50 border-green-400 text-green-900' },
    { value: 'dnf', label_th: 'DNF', label_en: 'DNF', tw: 'bg-red-50 border-red-400 text-red-900' },
    { value: 'dns', label_th: 'DNS', label_en: 'DNS', tw: 'bg-slate-100 border-slate-400 text-slate-600' },
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
    const [sortBy, setSortBy] = useState<'arrival' | 'bib' | 'name'>('arrival');
    const [autoRefresh, setAutoRefresh] = useState(true);
    const [lastRefresh, setLastRefresh] = useState(new Date());
    const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);
    const [statusFilter, setStatusFilter] = useState<string | null>(null);
    const [rankDeltas, setRankDeltas] = useState<Map<string, number>>(new Map());
    const intervalRef = useRef<NodeJS.Timeout | null>(null);
    const prevRanksRef = useRef<Map<string, number>>(new Map());

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
            // Compute rank deltas
            const prev = prevRanksRef.current;
            const newDeltas = new Map<string, number>();
            newRunners.forEach(r => {
                if (r.bib && r.overallRank && prev.has(r.bib)) {
                    newDeltas.set(r.bib, prev.get(r.bib)! - r.overallRank);
                }
            });
            const nextPrev = new Map<string, number>();
            newRunners.forEach(r => { if (r.bib && r.overallRank) nextPrev.set(r.bib, r.overallRank); });
            prevRanksRef.current = nextPrev;
            setRankDeltas(newDeltas);
            setRunners(newRunners);
        } catch { setRunners([]); }
        finally {
            setDataLoading(false);
            setLastRefresh(new Date());
        }
    }, [campaign?._id, selectedCp]);

    useEffect(() => { if (campaign?._id && selectedCp) fetchRunners(); }, [campaign?._id, selectedCp, fetchRunners]);

    // Auto-refresh every 10s
    useEffect(() => {
        if (autoRefresh && campaign?._id && selectedCp) {
            intervalRef.current = setInterval(fetchRunners, 10000);
        }
        return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
    }, [autoRefresh, campaign?._id, selectedCp, fetchRunners]);

    // Toast auto-dismiss
    useEffect(() => {
        if (toast) { const t = setTimeout(() => setToast(null), 3000); return () => clearTimeout(t); }
    }, [toast]);

    // Status change handler
    const handleStatusChange = async (runnerId: string, newStatus: string) => {
        try {
            const res = await fetch(`/api/runners/${runnerId}/status`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ status: newStatus, statusCheckpoint: selectedCp, changedBy: 'staff' }),
            });
            if (!res.ok) throw new Error('Failed');
            setRunners(prev => prev.map(r => r._id === runnerId ? { ...r, status: newStatus } : r));
            setToast({ msg: th ? 'อัปเดตสถานะสำเร็จ' : 'Status updated', type: 'success' });
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
        // Status filter
        if (statusFilter) {
            if (statusFilter === 'in_progress') {
                if (r.status && r.status !== 'in_progress') return false;
            } else {
                if (r.status !== statusFilter) return false;
            }
        }
        if (!search) return true;
        const term = search.toLowerCase();
        const name = `${r.firstName} ${r.lastName}`.toLowerCase();
        return r.bib?.toLowerCase().includes(term) || name.includes(term);
    });

    // Sort — default by arrival time (scanTime ascending)
    const sortedRunners = [...filteredRunners].sort((a, b) => {
        if (sortBy === 'bib') return (a.bib || '').localeCompare(b.bib || '', undefined, { numeric: true });
        if (sortBy === 'name') return `${a.firstName} ${a.lastName}`.localeCompare(`${b.firstName} ${b.lastName}`);
        // Default: arrival order (scanTime ascending)
        return new Date(a.scanTime || 0).getTime() - new Date(b.scanTime || 0).getTime();
    });

    const getStatusOpt = (status: string) => STATUS_OPTIONS.find(s => s.value === status) || STATUS_OPTIONS[0];

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
                        <span className="px-4 py-2 rounded-lg bg-green-100 text-green-800 text-[13px] font-bold">
                            {th ? `มาถึงแล้ว` : 'Arrived'}: {runners.length} {th ? 'คน' : 'runners'}
                        </span>
                        {runners.length > 0 && (
                            <>
                                <span className="text-slate-300">|</span>
                                <span className="text-[12px] font-bold text-slate-500">{th ? 'สรุป:' : 'Summary:'}</span>
                                {[
                                    { key: null, label: th ? 'ทั้งหมด' : 'Total', count: runners.length, bg: 'bg-white text-black', bgActive: 'bg-slate-300 text-black' },
                                    { key: 'finished', label: th ? 'เข้าเส้นชัย' : 'Finished', count: runners.filter(r => r.status === 'finished').length, bg: 'text-green-800', bgActive: 'bg-green-600 text-white' },
                                    { key: 'in_progress', label: th ? 'กำลังวิ่ง' : 'Running', count: runners.filter(r => !r.status || r.status === 'in_progress').length, bg: 'text-amber-800', bgActive: 'bg-amber-500 text-white' },
                                    { key: 'dnf', label: 'DNF', count: runners.filter(r => r.status === 'dnf').length, bg: 'text-red-800', bgActive: 'bg-red-600 text-white' },
                                    { key: 'dns', label: 'DNS', count: runners.filter(r => r.status === 'dns').length, bg: 'text-slate-600', bgActive: 'bg-slate-600 text-white' },
                                    { key: 'dq', label: 'DQ', count: runners.filter(r => r.status === 'dq').length, bg: 'text-pink-800', bgActive: 'bg-pink-600 text-white' },
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
                            </>
                        )}
                    </div>
                    <div className="flex items-center gap-2">
                        <div className="relative">
                            <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-slate-400">🔍</span>
                            <input type="text" value={search} onChange={e => setSearch(e.target.value)}
                                placeholder={th ? 'ค้นหา BIB, ชื่อ...' : 'Search BIB, name...'}
                                className="py-2 pr-3 pl-[30px] rounded-[10px] border-[1.5px] border-slate-200 text-[13px] w-[200px] outline-none focus:border-slate-400 transition-colors" />
                        </div>
                        <button onClick={fetchRunners} disabled={dataLoading}
                            className="px-3.5 py-2 rounded-lg border border-slate-200 bg-white text-xs font-semibold cursor-pointer text-slate-600 hover:bg-slate-50 disabled:cursor-not-allowed transition-colors">
                            {dataLoading ? '...' : '🔄'}
                        </button>
                        <label className="flex items-center gap-1 text-[11px] text-slate-400 cursor-pointer">
                            <input type="checkbox" checked={autoRefresh} onChange={e => setAutoRefresh(e.target.checked)}
                                className="accent-green-500" />
                            LIVE
                        </label>
                        <span className="text-[10px] text-slate-300">{lastRefresh.toLocaleTimeString('th-TH')}</span>
                    </div>
                </div>
            </div>

            {/* Runners Table */}
            <div className="bg-white border border-slate-200 rounded-[14px] overflow-hidden shadow-sm">
                <div className="overflow-x-auto max-h-[600px] overflow-y-auto">
                    <table className="w-full border-collapse text-[13px] min-w-[700px]">
                        <thead className="bg-slate-50 sticky top-0 z-10">
                            <tr>
                                <th className="px-2.5 py-3 text-center font-bold text-slate-600 w-[50px]">
                                    <button onClick={() => setSortBy('arrival')}
                                        className={`bg-transparent border-none cursor-pointer font-bold text-xs ${sortBy === 'arrival' ? 'text-green-600' : 'text-slate-600'}`}>
                                        {th ? 'อันดับ' : 'Rank'}
                                    </button>
                                </th>
                                <th className="px-2.5 py-3 text-center font-bold text-slate-600 w-[70px]">
                                    <button onClick={() => setSortBy('bib')}
                                        className={`bg-transparent border-none cursor-pointer font-bold text-xs ${sortBy === 'bib' ? 'text-green-600' : 'text-slate-600'}`}>
                                        BIB
                                    </button>
                                </th>
                                <th className="px-2.5 py-3 text-left font-bold text-slate-600">
                                    <button onClick={() => setSortBy('name')}
                                        className={`bg-transparent border-none cursor-pointer font-bold text-xs ${sortBy === 'name' ? 'text-green-600' : 'text-slate-600'}`}>
                                        {th ? 'นักกีฬา & Rankings' : 'Athlete & Rankings'}
                                    </button>
                                </th>
                                <th className="px-2.5 py-3 text-center font-bold text-slate-600 w-[60px]">Cat.</th>
                                <th className="px-2.5 py-3 text-center font-bold text-slate-600 w-[100px]">
                                    {th ? 'เวลาที่ถึงจุด' : 'Arrival Time'}
                                </th>
                                <th className="px-2.5 py-3 text-center font-bold text-slate-600 w-[100px]">
                                    {th ? 'เวลาสะสม' : 'Elapsed'}
                                </th>
                                <th className="px-2.5 py-3 text-center font-bold text-slate-600 w-[70px]">Pace</th>
                                <th className="px-2.5 py-3 text-center font-bold text-slate-600 w-[140px]">
                                    {th ? 'สถานะ' : 'Status'}
                                </th>
                            </tr>
                        </thead>
                        <tbody>
                            {dataLoading && sortedRunners.length === 0 ? (
                                <tr><td colSpan={8} className="p-10 text-center text-slate-400">{th ? 'กำลังโหลด...' : 'Loading...'}</td></tr>
                            ) : sortedRunners.length === 0 ? (
                                <tr><td colSpan={8} className="p-10 text-center text-slate-400">{th ? 'ยังไม่มีนักกีฬาถึงจุดนี้' : 'No runners arrived at this checkpoint yet'}</td></tr>
                            ) : sortedRunners.map((r, idx) => { const rowKey = r._id ? `${r._id}-${idx}` : `row-${idx}`;
                                const isDnf = ['dnf', 'dns', 'dq'].includes(r.status);
                                const isFinished = r.status === 'finished';
                                const statusOpt = getStatusOpt(r.status);
                                const rowCls = isDnf ? 'bg-red-50' : 'bg-white';
                                return (
                                    <tr key={rowKey} className={`border-b border-slate-100 transition-colors ${rowCls}`}>
                                        <td className="p-2.5 text-center">
                                            <span className={`font-bold text-sm ${isDnf ? 'text-red-600' : 'text-slate-400'}`}>
                                                {isDnf ? '-' : idx + 1}
                                            </span>
                                        </td>
                                        <td className={`p-2.5 text-center font-bold ${isDnf ? 'text-slate-400 line-through' : 'text-slate-700'}`}>
                                            {r.bib}
                                        </td>
                                        <td className="p-2.5">
                                            <div className={`font-semibold text-[13px] ${isDnf ? 'text-red-600' : 'text-slate-900'}`}>
                                                {r.firstName} {r.lastName}
                                            </div>
                                            <div className={`text-[11px] mt-0.5 flex gap-2 ${isDnf ? 'text-red-300' : 'text-slate-400'}`}>
                                                <span>Ovr: <b className={isDnf ? 'text-red-300' : 'text-slate-700'}>{r.overallRank || '-'}</b>{(() => { const d = rankDeltas.get(r.bib); if (d === undefined || d === 0) return r.bib && rankDeltas.size > 0 ? <span className="text-slate-400 ml-0.5">(—)</span> : null; return d > 0 ? <span className="text-green-600 font-bold ml-0.5">(↑{d})</span> : <span className="text-red-500 font-bold ml-0.5">(↓{Math.abs(d)})</span>; })()}</span>
                                                <span>|</span>
                                                <span>Gen: <b className={isDnf ? 'text-red-300' : 'text-slate-700'}>{r.genderRank || '-'}</b></span>
                                                <span>|</span>
                                                <span>Cat: <b className={isDnf ? 'text-red-300' : 'text-slate-700'}>{r.categoryRank || '-'}</b></span>
                                            </div>
                                        </td>
                                        <td className="p-2.5 text-center text-[11px] font-medium text-slate-500">
                                            {r.category || '-'}
                                        </td>
                                        <td className="p-2.5 text-center text-[12px] font-mono text-slate-600">
                                            {r.scanTime ? new Date(r.scanTime).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '-'}
                                        </td>
                                        <td className={`p-2.5 text-center font-bold text-[13px] ${isDnf ? 'text-red-600' : 'text-slate-900'}`}>
                                            {isDnf ? (r.statusCheckpoint ? `Out at ${r.statusCheckpoint}` : '-') : formatMs(r.elapsedTime || r.netTime || r.gunTime)}
                                        </td>
                                        <td className="p-2.5 text-center text-[11px] text-slate-500">
                                            {isDnf ? '-' : (r.netPace || r.gunPace || '-')}
                                        </td>
                                        <td className="p-2.5 text-center">
                                            <select
                                                value={r.status || 'in_progress'}
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
