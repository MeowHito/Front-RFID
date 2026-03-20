'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useLanguage } from '@/lib/language-context';
import AdminLayout from '../AdminLayout';

interface Campaign { _id: string; name: string; categories?: { name: string; distance?: string }[]; }
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
    latestCheckpoint?: string;
    netTime?: number;
    gunTime?: number;
    netPace?: string;
    gunPace?: string;
    lastPassTime?: string;
    passedCount?: number;
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

const FILTER_TABS = [
    { key: 'all', label_th: 'ทั้งหมด', label_en: 'All', icon: '', activeCls: 'bg-green-300 text-black', badgeActiveCls: 'text-black' },
    { key: 'passed', label_th: 'ผ่านแล้ว', label_en: 'Passed', icon: '✓', activeCls: 'bg-green-600 text-white', badgeActiveCls: 'bg-white/20 text-white' },
    { key: 'pending', label_th: 'รอ', label_en: 'Pending', icon: '⏳', activeCls: 'bg-amber-600 text-white', badgeActiveCls: 'bg-white/20 text-white' },
    { key: 'dnf_dq', label_th: 'DNF/DQ', label_en: 'DNF/DQ', icon: '⚠', activeCls: 'bg-red-600 text-white', badgeActiveCls: 'bg-white/20 text-white' },
];

function formatMs(ms?: number): string {
    if (!ms || ms <= 0) return '-';
    const totalSec = Math.floor(ms / 1000);
    const h = Math.floor(totalSec / 3600);
    const m = Math.floor((totalSec % 3600) / 60);
    const s = totalSec % 60;
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
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
    const [filter, setFilter] = useState('all');
    const [search, setSearch] = useState('');
    const [sortBy, setSortBy] = useState<'scanTime' | 'bib' | 'name'>('scanTime');
    const [autoRefresh, setAutoRefresh] = useState(true);
    const [lastRefresh, setLastRefresh] = useState(new Date());
    const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);
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

    // Fetch runners for selected checkpoint
    const fetchRunners = useCallback(async () => {
        if (!campaign?._id || !selectedCp) return;
        setDataLoading(true);
        try {
            const params = new URLSearchParams({
                campaignId: campaign._id,
                page: '1',
                limit: '500',
                skipStatusCounts: 'true',
            });
            const res = await fetch(`/api/runners/paged?${params.toString()}`, { cache: 'no-store' });
            if (!res.ok) throw new Error();
            const data = await res.json();
            setRunners(data.data || []);
        } catch { setRunners([]); }
        finally {
            setDataLoading(false);
            setLastRefresh(new Date());
        }
    }, [campaign?._id, selectedCp]);

    useEffect(() => { if (campaign?._id && selectedCp) fetchRunners(); }, [campaign?._id, selectedCp, fetchRunners]);

    // Auto-refresh
    useEffect(() => {
        if (autoRefresh && campaign?._id && selectedCp) {
            intervalRef.current = setInterval(fetchRunners, 15000);
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

    // Share link
    const handleShareLink = () => {
        const url = `${window.location.origin}/admin/checkpoint-monitor?cp=${encodeURIComponent(selectedCp)}`;
        navigator.clipboard.writeText(url).then(() => {
            setToast({ msg: th ? 'คัดลอกลิงก์แล้ว' : 'Link copied!', type: 'success' });
        }).catch(() => {
            setToast({ msg: url, type: 'success' });
        });
    };

    // Filter & search runners
    const filteredRunners = runners.filter(r => {
        if (filter === 'passed') {
            if (!['finished', 'in_progress'].includes(r.status) && !r.latestCheckpoint) return false;
        } else if (filter === 'pending') {
            if (r.status !== 'not_started' && r.latestCheckpoint) return false;
        } else if (filter === 'dnf_dq') {
            if (!['dnf', 'dns', 'dq'].includes(r.status)) return false;
        }
        if (search) {
            const term = search.toLowerCase();
            const name = `${r.firstName} ${r.lastName}`.toLowerCase();
            return r.bib?.toLowerCase().includes(term) || name.includes(term);
        }
        return true;
    });

    // Sort
    const sortedRunners = [...filteredRunners].sort((a, b) => {
        if (sortBy === 'bib') return (a.bib || '').localeCompare(b.bib || '', undefined, { numeric: true });
        if (sortBy === 'name') return `${a.firstName} ${a.lastName}`.localeCompare(`${b.firstName} ${b.lastName}`);
        return (a.overallRank || 9999) - (b.overallRank || 9999);
    });

    // Count per filter
    const countAll = runners.length;
    const countPassed = runners.filter(r => ['finished', 'in_progress'].includes(r.status) || r.latestCheckpoint).length;
    const countPending = runners.filter(r => r.status === 'not_started' && !r.latestCheckpoint).length;
    const countDnf = runners.filter(r => ['dnf', 'dns', 'dq'].includes(r.status)).length;
    const filterCounts: Record<string, number> = { all: countAll, passed: countPassed, pending: countPending, dnf_dq: countDnf };

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
                            📍 Live Checkpoint Monitor
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

                {/* Filter tabs + search */}
                <div className="flex justify-between items-center mt-3.5 border-t border-slate-100 pt-3.5 gap-3 flex-wrap">
                    <div className="flex gap-2 flex-wrap">
                        {FILTER_TABS.map(tab => {
                            const active = filter === tab.key;
                            return (
                                <button key={tab.key} onClick={() => setFilter(tab.key)}
                                    className={`px-4 py-2 rounded-[10px] text-[13px] font-bold cursor-pointer flex items-center gap-1.5 transition-all ${
                                        active ? tab.activeCls : 'border border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                                    }`}>
                                    {tab.icon && <span>{tab.icon}</span>}
                                    <span>{th ? tab.label_th : tab.label_en}</span>
                                    <span className={`px-2 py-0.5 rounded text-[11px] font-extrabold ${
                                        active ? tab.badgeActiveCls : 'bg-slate-100 text-slate-600'
                                    }`}>{filterCounts[tab.key] || 0}</span>
                                </button>
                            );
                        })}
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
                                    <button onClick={() => setSortBy('scanTime')}
                                        className={`bg-transparent border-none cursor-pointer font-bold text-xs ${sortBy === 'scanTime' ? 'text-green-600' : 'text-slate-600'}`}>
                                        No.
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
                                    {th ? 'เวลา' : 'Time'}
                                </th>
                                <th className="px-2.5 py-3 text-center font-bold text-slate-600 w-[70px]">Pace</th>
                                <th className="px-2.5 py-3 text-center font-bold text-slate-600 w-[140px]">
                                    {th ? 'สถานะ' : 'Status'}
                                </th>
                            </tr>
                        </thead>
                        <tbody>
                            {dataLoading && sortedRunners.length === 0 ? (
                                <tr><td colSpan={7} className="p-10 text-center text-slate-400">{th ? 'กำลังโหลด...' : 'Loading...'}</td></tr>
                            ) : sortedRunners.length === 0 ? (
                                <tr><td colSpan={7} className="p-10 text-center text-slate-400">{th ? 'ไม่พบข้อมูลนักกีฬา' : 'No runners found'}</td></tr>
                            ) : sortedRunners.map((r, idx) => {
                                const isDnf = ['dnf', 'dns', 'dq'].includes(r.status);
                                const isFinished = r.status === 'finished';
                                const statusOpt = getStatusOpt(r.status);
                                const rowCls = isDnf ? 'bg-red-50' : isFinished ? 'bg-green-50' : idx === 0 ? 'bg-amber-50' : 'bg-white';
                                return (
                                    <tr key={r._id} className={`border-b border-slate-100 transition-colors ${rowCls}`}>
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
                                        <td className={`p-2.5 text-center font-bold text-[13px] ${isDnf ? 'text-red-600' : 'text-slate-900'}`}>
                                            {isDnf ? (r.statusCheckpoint ? `Out at ${r.statusCheckpoint}` : '-') : formatMs(r.netTime || r.gunTime)}
                                        </td>
                                        <td className="p-2.5 text-center text-[11px] text-slate-500">
                                            {isDnf ? '-' : (r.netPace || r.gunPace || '-')}
                                        </td>
                                        <td className="p-2.5 text-center">
                                            <select
                                                value={r.status}
                                                onChange={e => handleStatusChange(r._id, e.target.value)}
                                                className={`w-full px-2 py-1.5 rounded-md border-[1.5px] text-[11px] font-bold cursor-pointer outline-none ${statusOpt.tw}`}>
                                                <option value="not_started">{th ? 'ยังไม่เริ่ม' : 'Not Started'}</option>
                                                {STATUS_OPTIONS.map(opt => (
                                                    <option key={opt.value} value={opt.value}>{th ? opt.label_th : opt.label_en}</option>
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
