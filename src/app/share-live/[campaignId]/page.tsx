'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useSearchParams } from 'next/navigation';

interface Campaign { _id: string; name: string; nameTh?: string; nameEn?: string; categories?: { name: string; distance?: string }[]; }
interface Checkpoint { _id: string; name: string; kmCumulative?: number; }

interface RunnerAtCheckpoint {
    _id: string;
    bib: string;
    firstName: string;
    lastName: string;
    firstNameTh?: string;
    lastNameTh?: string;
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

function formatMs(ms?: number): string {
    if (!ms || ms <= 0) return '-';
    const totalSec = Math.floor(ms / 1000);
    const h = Math.floor(totalSec / 3600);
    const m = Math.floor((totalSec % 3600) / 60);
    const s = totalSec % 60;
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

function getRunnerDedupKey(runner: RunnerAtCheckpoint): string {
    const bib = (runner.bib || '').trim().toLowerCase();
    if (bib) return bib;
    return runner._id || 'unknown-runner';
}

function hasRunnerName(runner: RunnerAtCheckpoint): boolean {
    return !!(runner.firstName || runner.lastName);
}

function getScanTimeValue(scanTime?: string): number {
    if (!scanTime) return Number.POSITIVE_INFINITY;
    const value = new Date(scanTime).getTime();
    return Number.isFinite(value) ? value : Number.POSITIVE_INFINITY;
}

function dedupeRunners(items: RunnerAtCheckpoint[]): RunnerAtCheckpoint[] {
    const deduped = new Map<string, RunnerAtCheckpoint>();
    items.forEach((runner) => {
        const key = getRunnerDedupKey(runner);
        const existing = deduped.get(key);
        if (!existing) { deduped.set(key, runner); return; }
        const existingHasName = hasRunnerName(existing);
        const nextHasName = hasRunnerName(runner);
        if (!existingHasName && nextHasName) {
            const eScan = getScanTimeValue(existing.scanTime);
            const nScan = getScanTimeValue(runner.scanTime);
            deduped.set(key, { ...runner, scanTime: eScan < nScan ? existing.scanTime : runner.scanTime, elapsedTime: existing.elapsedTime || runner.elapsedTime });
            return;
        }
        if (existingHasName && !nextHasName) {
            const eScan = getScanTimeValue(existing.scanTime);
            const nScan = getScanTimeValue(runner.scanTime);
            if (nScan < eScan) deduped.set(key, { ...existing, scanTime: runner.scanTime });
            return;
        }
        const eScan = getScanTimeValue(existing.scanTime);
        const nScan = getScanTimeValue(runner.scanTime);
        if (nScan < eScan) deduped.set(key, { ...existing, ...runner, _id: runner._id || existing._id });
    });
    return Array.from(deduped.values());
}

export default function ShareLiveMonitorPage() {
    const params = useParams();
    const searchParams = useSearchParams();
    const campaignId = params.campaignId as string;
    const cpParam = searchParams.get('cp') || '';

    const [campaign, setCampaign] = useState<Campaign | null>(null);
    const [checkpoints, setCheckpoints] = useState<Checkpoint[]>([]);
    const [selectedCp, setSelectedCp] = useState(cpParam);
    const [runners, setRunners] = useState<RunnerAtCheckpoint[]>([]);
    const [loading, setLoading] = useState(true);
    const [dataLoading, setDataLoading] = useState(false);
    const [search, setSearch] = useState('');
    const [sortBy, setSortBy] = useState<'arrival' | 'bib' | 'name'>('arrival');
    const [autoRefresh, setAutoRefresh] = useState(true);
    const [lastRefresh, setLastRefresh] = useState(new Date());
    const intervalRef = useRef<NodeJS.Timeout | null>(null);

    // Load campaign info
    useEffect(() => {
        if (!campaignId) return;
        (async () => {
            try {
                const res = await fetch(`/api/campaigns/${campaignId}`, { cache: 'no-store' });
                if (res.ok) {
                    const data = await res.json();
                    if (data?._id) setCampaign(data);
                }
            } catch { /* */ }
            finally { setLoading(false); }
        })();
    }, [campaignId]);

    // Load checkpoints
    useEffect(() => {
        if (!campaignId) return;
        fetch(`/api/checkpoints/campaign/${campaignId}`, { cache: 'no-store' })
            .then(r => r.json())
            .then(data => {
                const list = Array.isArray(data) ? data : [];
                setCheckpoints(list);
                if (list.length > 0 && !selectedCp) setSelectedCp(list[0].name);
            })
            .catch(() => setCheckpoints([]));
    }, [campaignId]);

    // Fetch runners
    const fetchRunners = useCallback(async () => {
        if (!campaignId || !selectedCp) return;
        setDataLoading(true);
        try {
            const res = await fetch(`/api/timing/checkpoint-by-campaign/${campaignId}?cp=${encodeURIComponent(selectedCp)}`, { cache: 'no-store' });
            if (!res.ok) throw new Error();
            const data = await res.json();
            setRunners(Array.isArray(data) ? dedupeRunners(data) : []);
        } catch { setRunners([]); }
        finally { setDataLoading(false); setLastRefresh(new Date()); }
    }, [campaignId, selectedCp]);

    useEffect(() => { if (campaignId && selectedCp) fetchRunners(); }, [campaignId, selectedCp, fetchRunners]);

    // Auto-refresh 10s
    useEffect(() => {
        if (autoRefresh && campaignId && selectedCp) {
            intervalRef.current = setInterval(fetchRunners, 10000);
        }
        return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
    }, [autoRefresh, campaignId, selectedCp, fetchRunners]);

    const filteredRunners = runners.filter(r => {
        if (!search) return true;
        const term = search.toLowerCase();
        const name = `${r.firstName} ${r.lastName}`.toLowerCase();
        return r.bib?.toLowerCase().includes(term) || name.includes(term);
    });

    const sortedRunners = [...filteredRunners].sort((a, b) => {
        if (sortBy === 'bib') return (a.bib || '').localeCompare(b.bib || '', undefined, { numeric: true });
        if (sortBy === 'name') return `${a.firstName} ${a.lastName}`.localeCompare(`${b.firstName} ${b.lastName}`);
        return new Date(a.scanTime || 0).getTime() - new Date(b.scanTime || 0).getTime();
    });

    if (loading) {
        return (
            <div className="min-h-screen bg-slate-50 flex items-center justify-center">
                <div className="text-slate-400 text-lg">Loading...</div>
            </div>
        );
    }

    if (!campaign) {
        return (
            <div className="min-h-screen bg-slate-50 flex items-center justify-center">
                <div className="text-center">
                    <div className="text-5xl mb-3">⚠️</div>
                    <div className="text-slate-600 font-bold text-lg">Campaign not found</div>
                    <div className="text-slate-400 text-sm mt-1">ไม่พบกิจกรรมนี้</div>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-slate-50">
            {/* Top Banner */}
            <div className="bg-gradient-to-r from-green-700 to-emerald-600 text-white px-5 py-4 shadow-lg">
                <div className="max-w-6xl mx-auto flex items-center justify-between gap-4 flex-wrap">
                    <div>
                        <h1 className="text-xl font-extrabold m-0 flex items-center gap-2">
                            📍 Live Checkpoint Monitor
                        </h1>
                        <p className="text-green-100 text-sm mt-0.5 font-medium">
                            {campaign.nameTh || campaign.nameEn || campaign.name}
                        </p>
                    </div>
                    <div className="flex items-center gap-2">
                        <span className="text-sm font-bold text-green-100">Checkpoint:</span>
                        <select value={selectedCp} onChange={e => setSelectedCp(e.target.value)}
                            className="px-3.5 py-2 rounded-lg border-2 border-green-400 bg-green-800 text-white text-sm font-bold cursor-pointer min-w-[180px]">
                            {checkpoints.length === 0 && <option value="">No checkpoints</option>}
                            {checkpoints.map(cp => (
                                <option key={cp._id} value={cp.name}>
                                    {cp.name}{cp.kmCumulative ? ` (${cp.kmCumulative}KM)` : ''}
                                </option>
                            ))}
                        </select>
                    </div>
                </div>
            </div>

            {/* Controls */}
            <div className="max-w-6xl mx-auto px-4 mt-4">
                <div className="bg-white border border-slate-200 rounded-xl px-4 py-3 shadow-sm flex justify-between items-center gap-3 flex-wrap">
                    <div className="flex items-center gap-3">
                        <span className="px-4 py-2 rounded-lg bg-green-100 text-green-800 text-sm font-bold">
                            Arrived: {runners.length} runners
                        </span>
                    </div>
                    <div className="flex items-center gap-2">
                        <div className="relative">
                            <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-slate-400">🔍</span>
                            <input type="text" value={search} onChange={e => setSearch(e.target.value)}
                                placeholder="Search BIB, name..."
                                className="py-2 pr-3 pl-[30px] rounded-lg border border-slate-200 text-sm w-[200px] outline-none focus:border-slate-400" />
                        </div>
                        <button onClick={fetchRunners} disabled={dataLoading}
                            className="px-3.5 py-2 rounded-lg border border-slate-200 bg-white text-xs font-semibold cursor-pointer text-slate-600 hover:bg-slate-50 disabled:cursor-not-allowed">
                            {dataLoading ? '...' : '🔄'}
                        </button>
                        <label className="flex items-center gap-1 text-xs text-slate-400 cursor-pointer">
                            <input type="checkbox" checked={autoRefresh} onChange={e => setAutoRefresh(e.target.checked)}
                                className="accent-green-500" />
                            LIVE
                        </label>
                        <span className="text-[10px] text-slate-300">{lastRefresh.toLocaleTimeString('th-TH')}</span>
                    </div>
                </div>
            </div>

            {/* Table */}
            <div className="max-w-6xl mx-auto px-4 mt-3 pb-10">
                <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
                    <div className="overflow-x-auto max-h-[600px] overflow-y-auto">
                        <table className="w-full border-collapse text-sm min-w-[700px]">
                            <thead className="bg-slate-50 sticky top-0 z-10">
                                <tr>
                                    <th className="px-2.5 py-3 text-center font-bold text-slate-600 w-[50px]">
                                        <button onClick={() => setSortBy('arrival')}
                                            className={`bg-transparent border-none cursor-pointer font-bold text-xs ${sortBy === 'arrival' ? 'text-green-600' : 'text-slate-600'}`}>
                                            #
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
                                            Athlete &amp; Rankings
                                        </button>
                                    </th>
                                    <th className="px-2.5 py-3 text-center font-bold text-slate-600 w-[60px]">Cat.</th>
                                    <th className="px-2.5 py-3 text-center font-bold text-slate-600 w-[100px]">Arrival Time</th>
                                    <th className="px-2.5 py-3 text-center font-bold text-slate-600 w-[100px]">Elapsed</th>
                                    <th className="px-2.5 py-3 text-center font-bold text-slate-600 w-[70px]">Pace</th>
                                </tr>
                            </thead>
                            <tbody>
                                {dataLoading && sortedRunners.length === 0 ? (
                                    <tr><td colSpan={7} className="p-10 text-center text-slate-400">Loading...</td></tr>
                                ) : sortedRunners.length === 0 ? (
                                    <tr><td colSpan={7} className="p-10 text-center text-slate-400">No runners arrived at this checkpoint yet</td></tr>
                                ) : sortedRunners.map((r, idx) => {
                                    const rowKey = r._id ? `${r._id}-${idx}` : `row-${idx}`;
                                    const isDnf = ['dnf', 'dns', 'dq'].includes(r.status);
                                    const isFinished = r.status === 'finished';
                                    const rowCls = isDnf ? 'bg-red-50' : isFinished ? 'bg-green-50' : idx === 0 ? 'bg-amber-50' : 'bg-white';
                                    return (
                                        <tr key={rowKey} className={`border-b border-slate-100 ${rowCls}`}>
                                            <td className="p-2.5 text-center">
                                                <span className={`font-bold text-sm ${isDnf ? 'text-red-600' : 'text-slate-400'}`}>
                                                    {isDnf ? '-' : idx + 1}
                                                </span>
                                            </td>
                                            <td className={`p-2.5 text-center font-bold ${isDnf ? 'text-slate-400 line-through' : 'text-slate-700'}`}>
                                                {r.bib}
                                            </td>
                                            <td className="p-2.5">
                                                <div className={`font-semibold text-sm ${isDnf ? 'text-red-600' : 'text-slate-900'}`}>
                                                    {r.firstName} {r.lastName}
                                                </div>
                                                <div className={`text-[11px] mt-0.5 flex gap-2 ${isDnf ? 'text-red-300' : 'text-slate-400'}`}>
                                                    <span>Ovr: <b className={isDnf ? 'text-red-300' : 'text-slate-700'}>{r.overallRank || '-'}</b></span>
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
                                            <td className={`p-2.5 text-center font-bold text-sm ${isDnf ? 'text-red-600' : 'text-slate-900'}`}>
                                                {isDnf ? (r.statusCheckpoint ? `Out at ${r.statusCheckpoint}` : '-') : formatMs(r.elapsedTime || r.netTime || r.gunTime)}
                                            </td>
                                            <td className="p-2.5 text-center text-[11px] text-slate-500">
                                                {isDnf ? '-' : (r.netPace || r.gunPace || '-')}
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                </div>

                {/* Footer */}
                <div className="mt-4 text-center text-xs text-slate-400">
                    Powered by RFID Timing System • Auto-refresh every 10s
                </div>
            </div>
        </div>
    );
}
