'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useSearchParams } from 'next/navigation';

interface Campaign { _id: string; name: string; slug?: string; nameTh?: string; nameEn?: string; categories?: { name: string; distance?: string }[]; }
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
    splitNo?: number;
    distanceFromStart?: number;
}

function formatMs(ms?: number): string {
    if (ms === undefined || ms === null) return '-';
    if (ms < 0) return '-';
    const h = Math.floor(ms / 3600000);
    const m = Math.floor((ms % 3600000) / 60000);
    const s = Math.floor((ms % 60000) / 1000);
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
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
    const [sortBy, setSortBy] = useState<'arrival' | 'bib' | 'name' | 'elapsed' | 'pace'>('arrival');
    const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
    const [lastRefresh, setLastRefresh] = useState(new Date());
    const [currentTime, setCurrentTime] = useState(new Date());
    const [statusFilter, setStatusFilter] = useState<string | null>('passed');
    const [rankDeltas, setRankDeltas] = useState<Map<string, number>>(new Map());
    const intervalRef = useRef<NodeJS.Timeout | null>(null);
    const prevRanksRef = useRef<Map<string, number>>(new Map());

    // ===== TTS Announcer State =====
    const [soundEnabled, setSoundEnabled] = useState(false);
    const [isSpeaking, setIsSpeaking] = useState(false);
    const announcedBibsRef = useRef<Set<string>>(new Set());
    const ttsQueueRef = useRef<string[]>([]);
    const ttsSpeakingRef = useRef(false);
    const ttsAudioRef = useRef<HTMLAudioElement | null>(null);
    const prevRunnerBibsRef = useRef<Set<string>>(new Set());
    const isFirstLoadRef = useRef(true);

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
            const newRunners = Array.isArray(data) ? dedupeRunners(data) : [];
            // Compute rank deltas: compare current overallRank vs previous refresh
            // Deltas are "sticky" — once set, they persist and don't get overwritten
            const prev = prevRanksRef.current;
            const newRanksMap = new Map<string, number>();
            newRunners.forEach(r => {
                if (r.bib && r.overallRank && r.overallRank > 0) {
                    newRanksMap.set(r.bib, r.overallRank);
                }
            });
            setRankDeltas(existing => {
                const merged = new Map<string, number>(existing);
                newRunners.forEach(r => {
                    if (r.bib && r.overallRank && r.overallRank > 0 && !merged.has(r.bib)) {
                        const prevRank = prev.get(r.bib);
                        if (prevRank !== undefined && prevRank > 0) {
                            const delta = prevRank - r.overallRank;
                            if (delta !== 0) merged.set(r.bib, delta);
                        }
                    }
                });
                return merged;
            });
            prevRanksRef.current = newRanksMap;
            setRunners(newRunners);
        } catch { setRunners([]); }
        finally { setDataLoading(false); setLastRefresh(new Date()); }
    }, [campaignId, selectedCp]);

    useEffect(() => { if (campaignId && selectedCp) fetchRunners(); }, [campaignId, selectedCp, fetchRunners]);

    // Auto-refresh 10s (always on)
    useEffect(() => {
        if (campaignId && selectedCp) {
            intervalRef.current = setInterval(fetchRunners, 10000);
        }
        return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
    }, [campaignId, selectedCp, fetchRunners]);

    // Live clock
    useEffect(() => {
        const t = setInterval(() => setCurrentTime(new Date()), 1000);
        return () => clearInterval(t);
    }, []);

    // ===== TTS: Speak text via Gemini API with browser fallback =====
    const speakText = useCallback((text: string): Promise<void> => {
        return new Promise<void>(async (resolve) => {
            setIsSpeaking(true);
            ttsSpeakingRef.current = true;
            try {
                const res = await fetch('/api/tts/speak', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ text, voice: 'Kore' }),
                });
                if (!res.ok) throw new Error('TTS API failed');
                const data = await res.json();
                if (!data.audio) throw new Error('No audio data');
                const audioSrc = `data:${data.mimeType || 'audio/mp3'};base64,${data.audio}`;
                const audio = new Audio(audioSrc);
                audio.volume = 1.0;
                ttsAudioRef.current = audio;
                audio.onended = () => { setIsSpeaking(false); ttsSpeakingRef.current = false; ttsAudioRef.current = null; resolve(); };
                audio.onerror = () => { setIsSpeaking(false); ttsSpeakingRef.current = false; ttsAudioRef.current = null; resolve(); };
                audio.play().catch(() => { setIsSpeaking(false); ttsSpeakingRef.current = false; ttsAudioRef.current = null; resolve(); });
            } catch {
                // Fallback to browser SpeechSynthesis
                try {
                    const utterance = new SpeechSynthesisUtterance(text);
                    const voices = window.speechSynthesis?.getVoices?.() || [];
                    const thVoice = voices.find(v => v.lang.startsWith('th'));
                    if (thVoice) utterance.voice = thVoice;
                    utterance.lang = 'th-TH';
                    utterance.rate = 1.0;
                    utterance.onend = () => { setIsSpeaking(false); ttsSpeakingRef.current = false; resolve(); };
                    utterance.onerror = () => { setIsSpeaking(false); ttsSpeakingRef.current = false; resolve(); };
                    window.speechSynthesis.speak(utterance);
                } catch {
                    setIsSpeaking(false); ttsSpeakingRef.current = false; resolve();
                }
            }
        });
    }, []);

    // ===== TTS: Process queue =====
    const processQueue = useCallback(async () => {
        if (ttsSpeakingRef.current || ttsQueueRef.current.length === 0) return;
        const text = ttsQueueRef.current.shift()!;
        await speakText(text);
        if (ttsQueueRef.current.length > 0) {
            setTimeout(() => processQueue(), 300);
        }
    }, [speakText]);

    // ===== TTS: Detect new runners and announce =====
    useEffect(() => {
        if (!soundEnabled) return;

        // Get bibs of runners who have scanTime (actually passed this checkpoint)
        const currentBibs = new Set(
            runners
                .filter(r => r.scanTime && r.bib)
                .map(r => r.bib)
        );

        // On first load, just record the bibs without announcing
        if (isFirstLoadRef.current) {
            isFirstLoadRef.current = false;
            prevRunnerBibsRef.current = currentBibs;
            announcedBibsRef.current = new Set(currentBibs);
            return;
        }

        // Find newly arrived runners (bibs in current but not previously announced)
        const newArrivals = runners.filter(r => {
            if (!r.scanTime || !r.bib) return false;
            return !announcedBibsRef.current.has(r.bib);
        });

        if (newArrivals.length === 0) return;

        // Mark as announced and queue speech
        const updatedAnnounced = new Set(announcedBibsRef.current);
        for (const runner of newArrivals) {
            updatedAnnounced.add(runner.bib);
            const name = `${runner.firstNameTh || runner.firstName || ''} ${runner.lastNameTh || runner.lastName || ''}`.trim();
            const displayName = name || `BIB ${runner.bib}`;
            const cpName = selectedCp || 'checkpoint';
            const isFinish = cpName.toUpperCase() === 'FINISH';

            let announcement: string;
            if (isFinish) {
                announcement = `หมายเลข ${runner.bib} คุณ${displayName} เข้าเส้นชัยแล้วครับ`;
            } else {
                announcement = `หมายเลข ${runner.bib} คุณ${displayName} ผ่านจุด ${cpName} แล้วครับ`;
            }

            ttsQueueRef.current.push(announcement);
        }
        announcedBibsRef.current = updatedAnnounced;
        prevRunnerBibsRef.current = currentBibs;
        processQueue();
    }, [runners, soundEnabled, selectedCp, processQueue]);

    // ===== TTS: Reset announced bibs when checkpoint changes =====
    useEffect(() => {
        announcedBibsRef.current = new Set();
        prevRunnerBibsRef.current = new Set();
        isFirstLoadRef.current = true;
        ttsQueueRef.current = [];
        if (ttsAudioRef.current) {
            ttsAudioRef.current.pause();
            ttsAudioRef.current = null;
        }
        setIsSpeaking(false);
        ttsSpeakingRef.current = false;
    }, [selectedCp]);

    // ===== TTS: Toggle sound =====
    const toggleSound = useCallback(() => {
        setSoundEnabled(prev => {
            if (prev) {
                // Turning off — stop everything
                ttsQueueRef.current = [];
                if (ttsAudioRef.current) {
                    ttsAudioRef.current.pause();
                    ttsAudioRef.current = null;
                }
                window.speechSynthesis?.cancel?.();
                setIsSpeaking(false);
                ttsSpeakingRef.current = false;
            } else {
                // Turning on — mark current runners as already announced so we only announce NEW ones
                const currentBibs = new Set(
                    runners
                        .filter(r => r.scanTime && r.bib)
                        .map(r => r.bib)
                );
                announcedBibsRef.current = new Set(currentBibs);
                prevRunnerBibsRef.current = new Set(currentBibs);
                isFirstLoadRef.current = false;
            }
            return !prev;
        });
    }, [runners]);

    const filteredRunners = runners.filter(r => {
        const runnerStatus = normalizeRunnerStatus(r.status);
        const isStopped = ['dnf', 'dns', 'dq'].includes(runnerStatus);
        if (statusFilter) {
            if (statusFilter === 'passed') {
                if (isStopped || !r.scanTime) return false;
            } else if (statusFilter === 'coming') {
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
                            Live Checkpoint Monitor
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
                <div className="bg-white border border-slate-200 rounded-xl px-3 py-2.5 shadow-sm flex justify-between items-center gap-2 flex-wrap">
                    <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-[11px] font-bold text-slate-400">สรุป:</span>
                        {[
                            { key: 'passed', label: 'ผ่าน', count: runners.filter(r => { const s = normalizeRunnerStatus(r.status); return !['dnf','dns','dq'].includes(s) && !!r.scanTime; }).length, bg: 'text-green-700 border-b-2 border-green-500 bg-green-200', bgActive: 'bg-green-600 text-white border-b-0' },
                            { key: 'coming', label: 'มา', count: runners.filter(r => { const s = normalizeRunnerStatus(r.status); return !['dnf','dns','dq','finished'].includes(s) && !r.scanTime; }).length, bg: 'text-amber-800 bg-amber-200', bgActive: 'bg-amber-500 text-white' },
                            { key: 'dns', label: 'DNS', count: runners.filter(r => normalizeRunnerStatus(r.status) === 'dns').length, bg: 'text-red-800 bg-red-200', bgActive: 'bg-red-600 text-white' },
                            { key: 'dnf', label: 'DNF', count: runners.filter(r => normalizeRunnerStatus(r.status) === 'dnf').length, bg: 'text-red-800 bg-red-200', bgActive: 'bg-red-600 text-white' },
                            { key: 'dq', label: 'DQ', count: runners.filter(r => normalizeRunnerStatus(r.status) === 'dq').length, bg: 'text-pink-800 bg-pink-200', bgActive: 'bg-pink-600 text-white' },
                        ].map(item => (
                            <button key={item.key ?? 'all'}
                                onClick={() => setStatusFilter(prev => prev === item.key ? null : item.key)}
                                className={`px-1.5 py-0.5 rounded text-[10px] font-bold cursor-pointer border-none transition-all ${
                                    statusFilter === item.key ? item.bgActive : item.bg
                                } hover:opacity-80`}
                            >
                                {item.label} {item.count}
                            </button>
                        ))}
                    </div>
                    <div className="flex items-center gap-2">
                        <div className="relative">
                            <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-slate-400">🔍</span>
                            <input type="text" value={search} onChange={e => setSearch(e.target.value)}
                                placeholder="ค้นหา BIB, ชื่อ..."
                                className="py-1.5 pr-3 pl-[30px] rounded-[10px] border-[1.5px] border-slate-200 text-[12px] w-full sm:w-[250px] outline-none focus:border-slate-400 transition-colors" />
                        </div>
                        <button onClick={fetchRunners} disabled={dataLoading}
                            className="px-3.5 py-2 rounded-lg border border-slate-200 bg-white text-xs font-semibold cursor-pointer text-slate-600 hover:bg-slate-50 disabled:cursor-not-allowed transition-colors">
                            {dataLoading ? '...' : '🔄'}
                        </button>
                        <span className="text-[10px] text-slate-400 font-mono">{currentTime.toLocaleTimeString('th-TH')}</span>
                    </div>
                </div>
            </div>

            {/* Table */}
            <div className="max-w-6xl mx-auto px-4 mt-3 pb-10">
                <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
                    <div className="overflow-x-auto">
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
                                            นักกีฬา & Rankings{sortArrow('name')}
                                        </button>
                                    </th>
                                    <th className="px-1 py-3 text-center font-bold text-slate-600 w-[50px]">Cat.</th>
                                    <th className="px-1 py-3 text-center font-bold text-slate-600 w-[85px]">
                                        <button onClick={() => toggleSort('arrival')}
                                            className={`bg-transparent border-none cursor-pointer font-bold text-xs inline-flex items-center ${sortBy === 'arrival' ? 'text-green-600' : 'text-slate-600'}`}>
                                            เวลาที่มาถึง{sortArrow('arrival')}
                                        </button>
                                    </th>
                                    <th className="px-1 py-3 text-center font-bold text-slate-600 w-[85px]">
                                        <button onClick={() => toggleSort('elapsed')}
                                            className={`bg-transparent border-none cursor-pointer font-bold text-xs inline-flex items-center ${sortBy === 'elapsed' ? 'text-green-600' : 'text-slate-600'}`}>
                                            Net time{sortArrow('elapsed')}
                                        </button>
                                    </th>
                                    <th className="px-1 py-3 text-center font-bold text-slate-600 w-[65px]">
                                        <button onClick={() => toggleSort('pace')}
                                            className={`bg-transparent border-none cursor-pointer font-bold text-xs inline-flex items-center ${sortBy === 'pace' ? 'text-green-600' : 'text-slate-600'}`}>
                                            Pace{sortArrow('pace')}
                                        </button>
                                    </th>
                                </tr>
                            </thead>
                            <tbody>
                                {dataLoading && sortedRunners.length === 0 ? (
                                    <tr><td colSpan={8} className="p-10 text-center text-slate-400">กำลังโหลด...</td></tr>
                                ) : sortedRunners.length === 0 ? (
                                    <tr><td colSpan={8} className="p-10 text-center text-slate-400">ยังไม่มีนักกีฬาถึงจุดนี้</td></tr>
                                ) : sortedRunners.map((r, idx) => {
                                    const rowKey = r._id ? `${r._id}-${idx}` : `row-${idx}`;
                                    const runnerStatus = normalizeRunnerStatus(r.status);
                                    const isStopped = ['dnf', 'dns', 'dq'].includes(runnerStatus);
                                    const rowCls = isStopped ? 'bg-red-50' : 'bg-white';
                                    return (
                                        <tr key={rowKey} className={`border-b border-slate-100 ${rowCls}`}>
                                            <td className={`p-2.5 text-center font-bold ${isStopped ? 'text-slate-400' : 'text-slate-700'}`}>
                                                {r.bib}
                                            </td>
                                            <td className="p-2">
                                                <div className={`font-semibold text-[13px] ${isStopped ? 'text-red-600' : 'text-slate-900'} flex items-center gap-1`}>
                                                    <span style={{ color: r.gender === 'F' ? '#ec4899' : '#3b82f6', fontSize: 14 }}>{r.gender === 'F' ? '♀' : '♂'}</span>
                                                    {r.firstName} {r.lastName}
                                                </div>
                                                <div className={`text-[11px] mt-0.5 ${isStopped ? 'text-red-300' : 'text-slate-400'}`}>
                                                    <span style={{ color: isStopped ? '#86efac' : '#166534', fontWeight: 600 }}>Ovr:</span>{' '}
                                                    <span style={{ color: isStopped ? '#4ade80' : '#15803d', fontWeight: 700 }}>{r.overallRank || '-'}</span>
                                                    {(() => { const d = rankDeltas.get(r.bib); if (d === undefined || d === 0) return r.bib && rankDeltas.size > 0 ? <span style={{color:'#94a3b8'}} className="ml-0.5">(—)</span> : null; return d > 0 ? <span style={{color:'#16a34a',fontWeight:700}} className="ml-0.5">(-{d})</span> : <span style={{color:'#dc2626',fontWeight:700}} className="ml-0.5">(+{Math.abs(d)})</span>; })()}
                                                    <span className="mx-1">|</span>
                                                    <span style={{ color: isStopped ? '#c4b5fd' : '#7c3aed', fontWeight: 600 }}>Gen:</span>{' '}
                                                    <span style={{ color: isStopped ? '#a78bfa' : '#6d28d9', fontWeight: 700 }}>{r.genderRank || '-'}</span>
                                                    <span className="mx-1">|</span>
                                                    <span style={{ color: isStopped ? '#93c5fd' : '#2563eb', fontWeight: 600 }}>Cat:</span>{' '}
                                                    <span style={{ color: isStopped ? '#60a5fa' : '#1d4ed8', fontWeight: 700 }}>{r.categoryRank || '-'}</span>
                                                </div>
                                            </td>
                                            <td className="p-2.5 text-center text-[11px] font-medium text-slate-500">
                                                {r.category || '-'}
                                            </td>
                                            <td className="p-2.5 text-center text-[13px] font-bold text-black"> 
                                                {r.scanTime
                                                    ? (() => { const d = new Date(r.scanTime); const hh = d.getHours().toString().padStart(2,'0'); const mm = d.getMinutes().toString().padStart(2,'0'); const ss = d.getSeconds().toString().padStart(2,'0'); const ms = d.getMilliseconds().toString().padStart(3,'0'); return `${hh}:${mm}:${ss}.${ms}`; })()
                                                    : (!isStopped && r.statusCheckpoint)
                                                        ? <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-amber-50 text-amber-700 text-[10px] font-bold border border-amber-200">⏳ จาก {r.statusCheckpoint}</span>
                                                        : '-'}
                                            </td>
                                            <td className={`p-2.5 text-center text-md ${isStopped ? 'text-red-600' : !r.scanTime && !isStopped ? 'text-amber-600 font-bold' : 'text-slate-900'}`}>
                                                {isStopped
                                                    ? getStoppedStatusText(runnerStatus, r.statusCheckpoint)
                                                    : !r.scanTime
                                                        ? 'กำลังมา'
                                                        : formatMs(r.netTime ?? r.elapsedTime ?? (r.scanTime ? 0 : undefined))}
                                            </td>
                                            <td className="p-2.5 text-center text-[11px] text-slate-500">
                                                {isStopped ? '-' : (r.netPace || r.gunPace || '-')}
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
                    Powered by RFID Timing System • 
                </div>
            </div>

            {/* ===== Floating Speaker Toggle Button ===== */}
            <button
                onClick={toggleSound}
                title={soundEnabled ? 'ปิดเสียงประกาศ' : 'เปิดเสียงประกาศ'}
                className="fixed bottom-6 right-6 z-50 w-14 h-14 rounded-full shadow-xl flex items-center justify-center transition-all duration-300 border-2 cursor-pointer"
                style={{
                    background: soundEnabled
                        ? 'linear-gradient(135deg, #22c55e 0%, #16a34a 100%)'
                        : 'linear-gradient(135deg, #64748b 0%, #475569 100%)',
                    borderColor: soundEnabled ? '#15803d' : '#334155',
                    boxShadow: soundEnabled
                        ? '0 4px 20px rgba(34, 197, 94, 0.4)'
                        : '0 4px 15px rgba(0,0,0,0.2)',
                }}
            >
                {soundEnabled ? (
                    /* Speaker ON icon */
                    <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" fill="white" />
                        <path d="M15.54 8.46a5 5 0 010 7.07" />
                        <path d="M19.07 4.93a10 10 0 010 14.14" />
                    </svg>
                ) : (
                    /* Speaker OFF icon with red strikethrough */
                    <svg width="26" height="26" viewBox="0 0 24 24" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" fill="white" stroke="white" />
                        <line x1="23" y1="9" x2="17" y2="15" stroke="#ef4444" strokeWidth="2.5" />
                        <line x1="17" y1="9" x2="23" y2="15" stroke="#ef4444" strokeWidth="2.5" />
                    </svg>
                )}
                {/* Speaking pulse indicator */}
                {isSpeaking && soundEnabled && (
                    <span
                        className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-yellow-400 border-2 border-white"
                        style={{ animation: 'pulse 1s infinite' }}
                    />
                )}
            </button>

            {/* Pulse animation keyframes */}
            <style dangerouslySetInnerHTML={{ __html: `
                @keyframes pulse {
                    0%, 100% { transform: scale(1); opacity: 1; }
                    50% { transform: scale(1.3); opacity: 0.7; }
                }
            `}} />
        </div>
    );
}
