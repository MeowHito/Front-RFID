'use client';

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import { computeCheckpointPlacings, distanceKeyOf, hasPassedCheckpoint, isNotablePlacing } from '@/lib/checkpoint-placings';
import AnnouncerView, { type DistanceOption } from './AnnouncerView';
import { useArrivalPacer } from './useArrivalPacer';

interface Campaign { _id: string; name: string; slug?: string; nameTh?: string; nameEn?: string; categories?: { name: string; distance?: string }[]; }
interface Checkpoint { _id: string; name: string; type?: string; kmCumulative?: number; }

// The `slim=1` row from checkpoint-by-campaign (backend slimCheckpointRows) — empty fields
// are left out, and `_id` only comes when the row has no BIB.
interface RunnerAtCheckpoint {
    _id?: string;
    bib: string;
    firstName: string;
    lastName: string;
    firstNameTh?: string;
    lastNameTh?: string;
    gender: string;
    category: string;
    ageGroup?: string;
    status: string;
    scanTime?: string;
    elapsedTime?: number;
    netTime?: number;
    gunTime?: number;
    netPace?: string;
    gunPace?: string;
    statusCheckpoint?: string;
}

const REFRESH_MS = 10000;
const ROW_PAGE_SIZE = 200;
// A notable runner (or one tapped by the announcer) stays in the big card this long even
// while others keep arriving underneath.
const SPOTLIGHT_HOLD_NOTABLE_MS = 8000;
const SPOTLIGHT_HOLD_PINNED_MS = 15000;
const DISTANCE_COLORS = ['#a78bfa', '#38bdf8', '#34d399', '#fb923c', '#f472b6', '#facc15', '#2dd4bf', '#f87171'];

type ViewMode = 'mc' | 'list';

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

function getRunnerDedupKey(runner: { bib?: string; _id?: string }): string {
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
    const viewParam: ViewMode = searchParams.get('view') === 'list' ? 'list' : 'mc';

    const [campaign, setCampaign] = useState<Campaign | null>(null);
    const [checkpoints, setCheckpoints] = useState<Checkpoint[]>([]);
    const [selectedCp, setSelectedCp] = useState(cpParam);
    const [runners, setRunners] = useState<RunnerAtCheckpoint[]>([]);
    const [loading, setLoading] = useState(true);
    const [dataLoading, setDataLoading] = useState(false);
    const [search, setSearch] = useState('');
    const [sortBy, setSortBy] = useState<'arrival' | 'bib' | 'name' | 'elapsed' | 'pace'>('arrival');
    const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
    // Always one summary chip selected — this page never shows passed and not-yet-passed mixed.
    const [statusFilter, setStatusFilter] = useState<string>('passed');
    const intervalRef = useRef<NodeJS.Timeout | null>(null);
    // The checkpoint whose list `runners` currently holds — '' until its first answer lands,
    // so the arrival pacer never mistakes another checkpoint's list for news.
    const [loadedCp, setLoadedCp] = useState('');
    const [view, setView] = useState<ViewMode>(viewParam);
    const [distanceFilter, setDistanceFilter] = useState('');
    const [notableOnly, setNotableOnly] = useState(false);
    const [paused, setPaused] = useState(false);
    const [spotlightKey, setSpotlightKey] = useState<string | null>(null);
    const spotlightHoldUntilRef = useRef(0);
    // Auto-refresh bookkeeping: one request at a time, and drop answers for a checkpoint
    // that is no longer selected.
    const inFlightRef = useRef(false);
    const selectedCpRef = useRef(selectedCp);
    selectedCpRef.current = selectedCp;
    const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
    const [refreshFailed, setRefreshFailed] = useState(false);
    // Rendering all ~3,000 rows every 10 s froze slow phones — draw them in pages instead.
    const [visibleCount, setVisibleCount] = useState(ROW_PAGE_SIZE);

    // ===== TTS Announcer State =====
    const [soundEnabled, setSoundEnabled] = useState(false);
    const [isSpeaking, setIsSpeaking] = useState(false);
    const ttsQueueRef = useRef<string[]>([]);
    const ttsSpeakingRef = useRef(false);
    const ttsAudioRef = useRef<HTMLAudioElement | null>(null);
    const soundEnabledRef = useRef(soundEnabled);
    soundEnabledRef.current = soundEnabled;

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
                // Reads are stored under the exact checkpoint name — "?cp=finish" would find nobody.
                const canonical = list.find((c: Checkpoint) => c.name.toUpperCase() === selectedCp.toUpperCase());
                if (canonical && canonical.name !== selectedCp) setSelectedCp(canonical.name);
            })
            .catch(() => setCheckpoints([]));
    }, [campaignId]);

    // Fetch runners
    const fetchRunners = useCallback(async (background = false) => {
        if (!campaignId || !selectedCp) return;
        if (background && (inFlightRef.current || document.hidden)) return;
        const cp = selectedCp;
        inFlightRef.current = true;
        if (!background) setDataLoading(true);
        try {
            const res = await fetch(`/api/timing/checkpoint-by-campaign/${campaignId}?cp=${encodeURIComponent(cp)}&strict=1&slim=1`, {
                // Revalidate instead of no-store: between syncs the list has not changed and
                // the browser gets an empty 304 back and reuses the copy it already has.
                cache: 'no-cache',
            });
            if (!res.ok) throw new Error();
            const data = await res.json();
            if (selectedCpRef.current !== cp) return;
            const newRunners = Array.isArray(data) ? dedupeRunners(data) : [];
            setRunners(newRunners);
            setLoadedCp(cp);
            setLastUpdated(new Date());
            setRefreshFailed(false);
        } catch {
            // A failed auto-refresh keeps the list on screen; only a fresh load empties it.
            if (selectedCpRef.current === cp) {
                if (!background) setRunners([]);
                setRefreshFailed(true);
            }
        } finally {
            inFlightRef.current = false;
            if (!background) setDataLoading(false);
        }
    }, [campaignId, selectedCp]);

    useEffect(() => { if (campaignId && selectedCp) fetchRunners(); }, [campaignId, selectedCp, fetchRunners]);

    // Auto-refresh every 10 s while the tab is visible; catch up as soon as it is shown again.
    useEffect(() => {
        if (!campaignId || !selectedCp) return;
        intervalRef.current = setInterval(() => fetchRunners(true), REFRESH_MS);
        const onVisible = () => { if (!document.hidden) fetchRunners(true); };
        document.addEventListener('visibilitychange', onVisible);
        return () => {
            if (intervalRef.current) clearInterval(intervalRef.current);
            document.removeEventListener('visibilitychange', onVisible);
        };
    }, [campaignId, selectedCp, fetchRunners]);

    // Back to the first page whenever the list being looked at changes.
    useEffect(() => { setVisibleCount(ROW_PAGE_SIZE); }, [selectedCp, statusFilter, search, sortBy, sortDir]);

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

    // ===== TTS: Stop and forget everything when the checkpoint changes =====
    useEffect(() => {
        ttsQueueRef.current = [];
        if (ttsAudioRef.current) {
            ttsAudioRef.current.pause();
            ttsAudioRef.current = null;
        }
        setIsSpeaking(false);
        ttsSpeakingRef.current = false;
    }, [selectedCp]);

    // ===== TTS: Toggle sound =====
    // Only runners released by the pacer from now on are announced, so turning it on mid-race
    // never reads out the backlog.
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
            }
            return !prev;
        });
    }, []);

    // ===== Per-checkpoint derived data =====
    const cpDoc = checkpoints.find(c => c.name === selectedCp);
    const isFinishCp = String(cpDoc?.type || '').toLowerCase() === 'finish' || selectedCp.toUpperCase() === 'FINISH';
    const isStartCp = String(cpDoc?.type || '').toLowerCase() === 'start' || selectedCp.toUpperCase() === 'START';
    const isCurrentList = loadedCp === selectedCp;

    const runnerByKey = useMemo(() => new Map(runners.map(r => [getRunnerDedupKey(r), r])), [runners]);
    // Placing AT this checkpoint (not the runner's live race position) — see checkpoint-placings.ts.
    const placings = useMemo(() => computeCheckpointPlacings(runners, getRunnerDedupKey), [runners]);
    const arrivals = useMemo(() => {
        if (!isCurrentList) return null;
        return runners
            .filter(hasPassedCheckpoint)
            .sort((a, b) => getScanTimeValue(a.scanTime) - getScanTimeValue(b.scanTime))
            .map(getRunnerDedupKey);
    }, [runners, isCurrentList]);

    const distances = useMemo<DistanceOption[]>(() => {
        const counts = new Map<string, number>();
        const labels = new Map<string, string>();
        for (const r of runners) {
            if (!hasPassedCheckpoint(r)) continue;
            const k = distanceKeyOf(r);
            counts.set(k, (counts.get(k) || 0) + 1);
            if (!labels.has(k)) labels.set(k, r.category || '-');
        }
        const order = (campaign?.categories || []).map(c => String(c.name || '').trim().toUpperCase());
        const keys = [...counts.keys()].sort((a, b) => {
            const ia = order.indexOf(a), ib = order.indexOf(b);
            return (ia < 0 ? 999 : ia) - (ib < 0 ? 999 : ib) || a.localeCompare(b);
        });
        return keys.map(k => {
            const i = order.indexOf(k);
            return {
                key: k,
                label: labels.get(k) || k,
                color: DISTANCE_COLORS[(i < 0 ? keys.indexOf(k) : i) % DISTANCE_COLORS.length],
                count: counts.get(k) || 0,
            };
        });
    }, [runners, campaign?.categories]);

    // What the announcer screen shows; the table view hides nothing, so its TTS follows everyone.
    const isVisible = useCallback((key: string) => {
        if (view !== 'mc') return true;
        const r = runnerByKey.get(key);
        if (!r) return false;
        if (distanceFilter && distanceKeyOf(r) !== distanceFilter) return false;
        if (notableOnly && !isStartCp && !isNotablePlacing(placings.get(key))) return false;
        return true;
    }, [view, runnerByKey, distanceFilter, notableOnly, isStartCp, placings]);

    const runnerByKeyRef = useRef(runnerByKey);
    runnerByKeyRef.current = runnerByKey;
    const placingsRef = useRef(placings);
    placingsRef.current = placings;
    const isFinishRef = useRef(isFinishCp);
    isFinishRef.current = isFinishCp;

    const showInSpotlight = useCallback((key: string, mode: 'arrival' | 'pinned') => {
        const now = Date.now();
        const notable = isNotablePlacing(placingsRef.current.get(key));
        // A runner worth calling out keeps the big card for a few seconds; ordinary
        // arrivals behind them still stream into the feed.
        if (mode === 'arrival' && !notable && now < spotlightHoldUntilRef.current) return;
        setSpotlightKey(key);
        spotlightHoldUntilRef.current = mode === 'pinned'
            ? now + SPOTLIGHT_HOLD_PINNED_MS
            : notable ? now + SPOTLIGHT_HOLD_NOTABLE_MS : 0;
    }, []);

    const announce = useCallback((key: string) => {
        const runner = runnerByKeyRef.current.get(key);
        if (!runner) return;
        const placing = placingsRef.current.get(key);
        const notable = isNotablePlacing(placing);
        // Speech is slower than a finish funnel — announce everyone while it keeps up,
        // and only the placed runners once it falls behind.
        if (ttsQueueRef.current.length >= 2 && !notable) return;
        if (ttsQueueRef.current.length >= 6) ttsQueueRef.current.shift();
        const name = `${runner.firstNameTh || runner.firstName || ''} ${runner.lastNameTh || runner.lastName || ''}`.trim();
        const displayName = name || `BIB ${runner.bib}`;
        const cpName = selectedCpRef.current || 'checkpoint';
        const genderLabel = String(runner.gender || '').toUpperCase() === 'F' ? 'หญิง' : 'ชาย';
        const placed = notable && placing && placing.gender > 0 ? ` อันดับ ${placing.gender} ${genderLabel} ${runner.category || ''}`.trimEnd() : '';
        const announcement = isFinishRef.current
            ? `หมายเลข ${runner.bib} คุณ${displayName} เข้าเส้นชัยแล้วครับ${placed}`
            : `หมายเลข ${runner.bib} คุณ${displayName} ผ่านจุด ${cpName} แล้วครับ${placed}`;
        ttsQueueRef.current.push(announcement);
        processQueue();
    }, [processQueue]);

    const viewRef = useRef(view);
    viewRef.current = view;
    const handleReveal = useCallback((key: string) => {
        if (viewRef.current === 'mc') showInSpotlight(key, 'arrival');
        if (soundEnabledRef.current) announce(key);
    }, [showInSpotlight, announce]);

    const pacer = useArrivalPacer(arrivals, `${campaignId}::${selectedCp}`, { isVisible, paused, onReveal: handleReveal });

    useEffect(() => {
        setSpotlightKey(null);
        spotlightHoldUntilRef.current = 0;
        setPaused(false);
    }, [selectedCp]);

    const changeCheckpoint = (cp: string) => {
        if (cp === selectedCp) return;
        // Never leave the previous checkpoint's runners on screen under the new name.
        setRunners([]);
        setLoadedCp('');
        setSelectedCp(cp);
    };

    // Keep the address bar shareable: it always reopens this checkpoint in this view.
    useEffect(() => {
        if (!selectedCp) return;
        const url = new URL(window.location.href);
        url.searchParams.set('cp', selectedCp);
        if (view === 'list') url.searchParams.set('view', 'list'); else url.searchParams.delete('view');
        if (url.href !== window.location.href) window.history.replaceState(window.history.state, '', url.href);
    }, [selectedCp, view]);

    // Announcer screen: Space pauses the feed, and the screen must not sleep mid-race.
    useEffect(() => {
        if (view !== 'mc') return;
        const onKey = (e: KeyboardEvent) => {
            if (e.code !== 'Space') return;
            const el = e.target as HTMLElement | null;
            if (el && (el.tagName === 'INPUT' || el.tagName === 'SELECT' || el.tagName === 'TEXTAREA' || el.tagName === 'BUTTON' || el.isContentEditable)) return;
            e.preventDefault();
            setPaused(v => !v);
        };
        window.addEventListener('keydown', onKey);
        let lock: { release: () => Promise<void> } | null = null;
        const requestLock = async () => {
            try {
                const wl = (navigator as Navigator & { wakeLock?: { request: (t: 'screen') => Promise<{ release: () => Promise<void> }> } }).wakeLock;
                if (wl && !document.hidden) lock = await wl.request('screen');
            } catch { /* not supported / denied */ }
        };
        const onVisible = () => { if (!document.hidden) requestLock(); };
        requestLock();
        document.addEventListener('visibilitychange', onVisible);
        return () => {
            window.removeEventListener('keydown', onKey);
            document.removeEventListener('visibilitychange', onVisible);
            lock?.release().catch(() => { /* */ });
        };
    }, [view]);

    // Memoized: the arrival pacer re-renders the page about once a second.
    const sortedRunners = useMemo(() => runners.filter(r => {
        const runnerStatus = normalizeRunnerStatus(r.status);
        const isStopped = ['dnf', 'dns', 'dq'].includes(runnerStatus);
        if (statusFilter === 'passed') {
            if (isStopped || !r.scanTime) return false;
        } else if (statusFilter === 'coming') {
            // Same rule as the "มา" count — a finished runner with no read here is not on their way.
            if (isStopped || runnerStatus === 'finished' || !!r.scanTime) return false;
        } else if (statusFilter === 'dns' || statusFilter === 'dnf' || statusFilter === 'dq') {
            if (runnerStatus !== statusFilter) return false;
        }
        if (!search) return true;
        const term = search.toLowerCase();
        const name = `${r.firstName} ${r.lastName}`.toLowerCase();
        return r.bib?.toLowerCase().includes(term) || name.includes(term);
    }).sort((a, b) => {
        let cmp = 0;
        switch (sortBy) {
            case 'bib': cmp = (a.bib || '').localeCompare(b.bib || '', undefined, { numeric: true }); break;
            case 'name': cmp = `${a.firstName} ${a.lastName}`.localeCompare(`${b.firstName} ${b.lastName}`); break;
            case 'elapsed': cmp = (a.elapsedTime || a.netTime || a.gunTime || 0) - (b.elapsedTime || b.netTime || b.gunTime || 0); break;
            case 'pace': cmp = (a.netPace || a.gunPace || 'zz').localeCompare(b.netPace || b.gunPace || 'zz'); break;
            default: cmp = new Date(a.scanTime || 0).getTime() - new Date(b.scanTime || 0).getTime(); break;
        }
        return sortDir === 'asc' ? cmp : -cmp;
    }), [runners, statusFilter, search, sortBy, sortDir]);

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

    const renderSoundButton = () => (
        <button
            onClick={toggleSound}
            title={soundEnabled ? 'ปิดเสียงประกาศ' : 'เปิดเสียงประกาศ'}
            className="relative px-2.5 py-2 rounded-lg border text-xs font-semibold cursor-pointer transition-all"
            style={{
                background: soundEnabled
                    ? 'linear-gradient(135deg, #22c55e 0%, #16a34a 100%)'
                    : '#fff',
                borderColor: soundEnabled ? '#15803d' : '#e2e8f0',
                color: soundEnabled ? '#fff' : '#64748b',
            }}
        >
            {soundEnabled ? (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" fill="white" />
                    <path d="M15.54 8.46a5 5 0 010 7.07" />
                    <path d="M19.07 4.93a10 10 0 010 14.14" />
                </svg>
            ) : (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" fill="#94a3b8" stroke="#94a3b8" />
                    <line x1="23" y1="9" x2="17" y2="15" stroke="#ef4444" strokeWidth="2.5" />
                    <line x1="17" y1="9" x2="23" y2="15" stroke="#ef4444" strokeWidth="2.5" />
                </svg>
            )}
            {isSpeaking && soundEnabled && (
                <span className="absolute -top-1 -right-1 w-3 h-3 rounded-full bg-yellow-400 border border-white animate-pulse" />
            )}
        </button>
    );

    if (view === 'mc') {
        return (
            <AnnouncerView
                campaignName={campaign.nameTh || campaign.nameEn || campaign.name}
                checkpoints={checkpoints}
                selectedCp={selectedCp}
                onSelectCp={changeCheckpoint}
                onShowList={() => setView('list')}
                isFinish={isFinishCp}
                isStart={isStartCp}
                loading={!isCurrentList && !refreshFailed}
                refreshFailed={refreshFailed}
                runners={runners}
                runnerByKey={runnerByKey}
                keyOf={getRunnerDedupKey}
                placings={placings}
                feed={pacer.feed}
                spotlightKey={spotlightKey}
                onPin={key => showInSpotlight(key, 'pinned')}
                queued={pacer.queued}
                paused={paused}
                onTogglePause={() => setPaused(v => !v)}
                onFlush={pacer.flush}
                distances={distances}
                distanceFilter={distanceFilter}
                onDistanceFilter={setDistanceFilter}
                notableOnly={notableOnly}
                onNotableOnly={setNotableOnly}
                isVisible={isVisible}
                soundButton={renderSoundButton()}
            />
        );
    }

    return (
        <div className="min-h-screen bg-slate-50">
            {/* Top Banner */}
            <div className="bg-gradient-to-r from-green-700 to-emerald-600 text-white px-3 sm:px-5 py-2.5 shadow-lg">
                <div className="max-w-6xl mx-auto flex items-center justify-between gap-2 sm:gap-4">
                    <div className="flex items-center gap-2.5 min-w-0">
                        {/* Logo */}
                        <Link href="/" className="flex-shrink-0" title="กลับหน้าแรก">
                            <Image
                                src="/logo-white.png"
                                alt="ACTION"
                                width={72}
                                height={24}
                                style={{ objectFit: 'contain' }}
                            />
                        </Link>
                        {/* Campaign name */}
                        <h1 className="border-l border-white/30 pl-2.5 text-[13px] sm:text-base font-extrabold m-0 leading-tight truncate">
                            {campaign.nameTh || campaign.nameEn || campaign.name}
                        </h1>
                    </div>
                    <div className="flex items-center gap-1.5 sm:gap-2 flex-shrink-0">
                        <button
                            onClick={() => setView('mc')}
                            title="หน้าจอสำหรับพิธีกร: นักวิ่งที่เพิ่งผ่าน ขึ้นทีละคน ตัวใหญ่"
                            className="whitespace-nowrap px-2.5 py-1.5 sm:py-2 rounded-lg border-2 border-white/60 bg-white/10 text-white text-[12px] sm:text-sm font-bold cursor-pointer hover:bg-white/20"
                        >
                            📣<span className="hidden sm:inline"> โหมดพิธีกร</span>
                        </button>
                        <select value={selectedCp} onChange={e => changeCheckpoint(e.target.value)}
                            className="flex-shrink-0 px-2 sm:px-3.5 py-1.5 sm:py-2 rounded-lg border-2 border-green-400 bg-green-800 text-white text-[13px] sm:text-sm font-bold cursor-pointer max-w-[34vw] sm:max-w-none sm:min-w-[180px]">
                            {checkpoints.length === 0 && <option value="">No checkpoints</option>}
                            {checkpoints.map(cp => (
                                <option key={cp._id} value={cp.name}>
                                    {cp.name}
                                </option>
                            ))}
                        </select>
                    </div>
                </div>
            </div>

            {/* Controls */}
            <div className="max-w-6xl mx-auto px-2 sm:px-4 mt-3">
                <div className="bg-white border border-slate-200 rounded-xl px-2 sm:px-3 py-2 shadow-sm flex items-center gap-2 flex-nowrap">
                    <div className="flex items-center gap-1.5 flex-nowrap overflow-x-auto min-w-0 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                        <span className="hidden sm:inline text-[11px] font-bold text-slate-400 flex-shrink-0">สรุป:</span>
                        {[
                            { key: 'passed', label: 'ผ่าน', count: runners.filter(r => { const s = normalizeRunnerStatus(r.status); return !['dnf', 'dns', 'dq'].includes(s) && !!r.scanTime; }).length, bg: 'text-green-700 border-b-2 border-green-500 bg-green-200', bgActive: 'bg-green-600 text-white border-b-0' },
                            { key: 'coming', label: 'มา', count: runners.filter(r => { const s = normalizeRunnerStatus(r.status); return !['dnf', 'dns', 'dq', 'finished'].includes(s) && !r.scanTime; }).length, bg: 'text-amber-800 bg-amber-200', bgActive: 'bg-amber-500 text-white' },
                            { key: 'dns', label: 'DNS', count: runners.filter(r => normalizeRunnerStatus(r.status) === 'dns').length, bg: 'text-red-800 bg-red-200', bgActive: 'bg-red-600 text-white' },
                            { key: 'dnf', label: 'DNF', count: runners.filter(r => normalizeRunnerStatus(r.status) === 'dnf').length, bg: 'text-red-800 bg-red-200', bgActive: 'bg-red-600 text-white' },
                            { key: 'dq', label: 'DQ', count: runners.filter(r => normalizeRunnerStatus(r.status) === 'dq').length, bg: 'text-pink-800 bg-pink-200', bgActive: 'bg-pink-600 text-white' },
                        ].map(item => (
                            <button key={item.key ?? 'all'}
                                onClick={() => setStatusFilter(prev => (prev === item.key ? 'passed' : item.key))}
                                className={`flex-shrink-0 whitespace-nowrap min-h-[32px] px-2 sm:px-3 py-1.5 rounded-lg text-[11px] sm:text-[12px] font-bold cursor-pointer border-none transition-all ${statusFilter === item.key ? item.bgActive : item.bg
                                    } hover:opacity-80`}
                            >
                                {item.label} {item.count}
                            </button>
                        ))}
                    </div>
                    <div className="flex items-center gap-1.5 sm:gap-2 flex-shrink-0 ml-auto">
                        <div className="relative">
                            <span className="absolute left-2 top-1/2 -translate-y-1/2 text-[11px] text-slate-400">🔍</span>
                            <input type="text" value={search} onChange={e => setSearch(e.target.value)}
                                placeholder="ค้นหา BIB, ชื่อ..."
                                className="py-1.5 pr-2 pl-[26px] rounded-[10px] border-[1.5px] border-slate-200 text-[12px] w-[110px] sm:w-[250px] outline-none focus:border-slate-400 transition-colors" />
                        </div>
                        {renderSoundButton()}
                    </div>
                </div>
            </div>

            {/* Table */}
            <div className="max-w-6xl mx-auto px-2 sm:px-4 mt-3 pb-10">
                <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
                    <div className="overflow-x-auto">
                        <table className="w-full border-collapse text-[12px] sm:text-[13px] min-w-[620px] sm:min-w-[700px]">
                            <thead className="bg-slate-50 sticky top-0 z-10">
                                <tr>
                                    <th className="px-2 py-3 text-center font-bold text-slate-600 w-[60px]">
                                        <button onClick={() => toggleSort('bib')}
                                            className={`bg-transparent border-none cursor-pointer font-bold text-xs inline-flex items-center ${sortBy === 'bib' ? 'text-green-600' : 'text-slate-600'}`}>
                                            BIB{sortArrow('bib')}
                                        </button>
                                    </th>
                                    <th className="pl-2 pr-0.5 py-3 text-left font-bold text-slate-600">
                                        <button onClick={() => toggleSort('name')}
                                            className={`bg-transparent border-none cursor-pointer font-bold text-xs inline-flex items-center ${sortBy === 'name' ? 'text-green-600' : 'text-slate-600'}`}>
                                            นักกีฬา{sortArrow('name')}
                                        </button>
                                    </th>
                                    <th className="pl-0.5 pr-0.5 py-3 text-center font-bold text-slate-600 w-[40px]">Rank</th>
                                    <th className="pl-0.5 pr-0.5 py-3 text-center font-bold text-slate-600 w-[40px]">Gen</th>
                                    <th className="pl-0.5 pr-0.5 py-3 text-center font-bold text-slate-600 w-[40px]">Cat</th>
                                    <th className="px-1 py-3 text-center font-bold text-slate-600 w-[50px]">ประเภท</th>
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
                                    <tr><td colSpan={9} className="p-10 text-center text-slate-400">กำลังโหลด...</td></tr>
                                ) : sortedRunners.length === 0 ? (
                                    <tr><td colSpan={9} className="p-10 text-center text-slate-400">ยังไม่มีนักกีฬาถึงจุดนี้</td></tr>
                                ) : sortedRunners.slice(0, visibleCount).map((r) => {
                                    // Stable per runner (the list is deduped by BIB) — an index in the key
                                    // made React rebuild every row whenever a new arrival landed on top.
                                    const rowKey = getRunnerDedupKey(r);
                                    const placing = placings.get(rowKey);
                                    const runnerStatus = normalizeRunnerStatus(r.status);
                                    const isStopped = ['dnf', 'dns', 'dq'].includes(runnerStatus);
                                    const rowCls = isStopped ? 'bg-red-50' : 'bg-white';
                                    return (
                                        <tr key={rowKey} className={`border-b border-slate-100 ${rowCls}`}>
                                            <td className={`p-2.5 text-center font-bold ${isStopped ? 'text-slate-400' : 'text-slate-700'}`}>
                                                {r.bib}
                                            </td>
                                            <td className="pl-2 pr-0.5 py-2">
                                                <div className={`font-semibold text-[13px] ${isStopped ? 'text-red-600' : 'text-slate-900'} flex items-center gap-1 flex-wrap`}>
                                                    <span style={{ color: r.gender === 'F' ? '#ec4899' : '#3b82f6', fontSize: 14 }}>{r.gender === 'F' ? '♀' : '♂'}</span>
                                                    <span>{r.firstName} {r.lastName}</span>
                                                </div>
                                            </td>
                                            <td className="pl-0.5 pr-0.5 py-2.5 text-center">
                                                <div className="inline-flex flex-col items-center leading-tight">
                                                    <span className={`text-sm font-black ${isStopped ? 'text-slate-400' : 'text-emerald-700'}`}>{placing?.overall || '-'}</span>
                                                </div>
                                            </td>
                                            <td className={`pl-0.5 pr-0.5 py-2.5 text-center text-xs font-bold ${isStopped ? 'text-slate-400' : 'text-violet-700'}`}>
                                                {placing?.gender || '-'}
                                            </td>
                                            <td className={`pl-0.5 pr-0.5 py-2.5 text-center text-xs font-bold ${isStopped ? 'text-slate-400' : 'text-blue-700'}`}>
                                                {placing?.ageGroup || '-'}
                                            </td>
                                            <td className="p-2 sm:p-2.5 text-center text-[11px] font-medium text-slate-500">
                                                {r.category || '-'}
                                            </td>
                                            <td className="p-2 sm:p-2.5 text-center text-[13px] font-bold text-black">
                                                {r.scanTime
                                                    ? (() => { const d = new Date(r.scanTime); const hh = d.getHours().toString().padStart(2, '0'); const mm = d.getMinutes().toString().padStart(2, '0'); const ss = d.getSeconds().toString().padStart(2, '0'); const ms = d.getMilliseconds().toString().padStart(3, '0'); return `${hh}:${mm}:${ss}.${ms}`; })()
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
                                            <td className="p-2 sm:p-2.5 text-center text-[11px] text-slate-500">
                                                {isStopped ? '-' : (r.netPace || r.gunPace || '-')}
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                </div>

                {sortedRunners.length > visibleCount && (
                    <div className="mt-3 text-center">
                        <button
                            onClick={() => setVisibleCount(n => n + ROW_PAGE_SIZE)}
                            className="px-4 py-2 rounded-lg border border-slate-200 bg-white text-[13px] font-bold text-slate-600 cursor-pointer hover:bg-slate-50"
                        >
                            แสดงเพิ่ม ({visibleCount.toLocaleString()} / {sortedRunners.length.toLocaleString()} คน)
                        </button>
                    </div>
                )}

                <div className={`mt-3 text-center text-[11px] ${refreshFailed ? 'text-red-500' : 'text-slate-400'}`}>
                    {refreshFailed
                        ? 'เชื่อมต่อไม่ได้ชั่วคราว — กำลังลองใหม่อัตโนมัติ'
                        : 'อัปเดตอัตโนมัติทุก 10 วินาที'}
                    {lastUpdated && ` · ล่าสุด ${lastUpdated.toLocaleTimeString('th-TH', { hour12: false })}`}
                </div>

                {/* Footer */}
                <div className="mt-4 text-center text-xs text-slate-400">
                    Powered by RFID Timing System •
                </div>
            </div>

        </div>
    );
}
