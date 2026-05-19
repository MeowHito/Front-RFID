'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import AdminLayout from '../AdminLayout';
import { useLanguage } from '@/lib/language-context';
import { authHeaders } from '@/lib/authHeaders';
import { io, Socket } from 'socket.io-client';
import HlsPlayer, { CctvTimestampOverlay } from '@/components/HlsPlayer';

interface Recording {
    _id: string;
    cameraId: string;
    cameraName: string;
    campaignId: string;
    checkpointName?: string;
    location?: string;
    deviceId?: string;
    startTime: string;
    endTime?: string;
    duration: number;
    fileSize: number;
    fileName: string;
    mimeType: string;
    recordingStatus: string;
    /** 'classic' = browser-based /camera page (.webm file). 'beta' = Larix/IRL Pro HLS. */
    source?: 'classic' | 'beta';
    /** Beta only: full HLS .m3u8 URL when available. */
    playbackUrl?: string | null;
    /** Beta only: 'rtmp' | 'srt'. */
    protocol?: string;
}

interface StorageInfo { totalSize: number; count: number; }

interface RunnerHit {
    checkpoint: string;
    scanTime: string;
    elapsedTime: number | null;
    splitTime: number | null;
    recording: {
        _id: string;
        cameraId: string;
        cameraName: string;
        startTime: string;
        endTime: string;
        duration: number;
        fileSize: number;
        recordingStatus?: string;
        source?: 'classic' | 'beta';
        playbackUrl?: string | null;
        protocol?: string;
    } | null;
    seekSeconds: number;
    /** Which pipeline this hit came from. */
    source?: 'classic' | 'beta';
}

function fmtMs(ms: number | null) {
    if (!ms) return '—';
    const totalSec = Math.floor(ms / 1000);
    const h = Math.floor(totalSec / 3600);
    const m = Math.floor((totalSec % 3600) / 60);
    const s = totalSec % 60;
    return h > 0
        ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
        : `${m}:${String(s).padStart(2, '0')}`;
}

function fmtTime(iso: string) {
    return new Date(iso).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function fmtBytes(b: number) {
    if (b < 1024) return `${b} B`;
    if (b < 1048576) return `${(b / 1024).toFixed(1)} KB`;
    if (b < 1073741824) return `${(b / 1048576).toFixed(1)} MB`;
    return `${(b / 1073741824).toFixed(2)} GB`;
}

function fmtDuration(s: number) {
    const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), ss = s % 60;
    return h > 0
        ? `${h}:${String(m).padStart(2, '0')}:${String(ss).padStart(2, '0')}`
        : `${String(m).padStart(2, '0')}:${String(ss).padStart(2, '0')}`;
}

function fmtDate(iso: string) {
    const d = new Date(iso);
    return d.toLocaleDateString('th-TH', { day: '2-digit', month: 'short', year: '2-digit' })
        + ' ' + d.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' });
}

function isLiveRecording(rec: { recordingStatus?: string; endTime?: string | null }) {
    return String(rec.recordingStatus || '').trim().toLowerCase() === 'recording' || !rec.endTime;
}

export default function CctvRecordingsPage() {
    const { language } = useLanguage();
    const th = language === 'th';

    const [recordings, setRecordings] = useState<Recording[]>([]);
    const [storage, setStorage] = useState<StorageInfo | null>(null);
    const [loading, setLoading] = useState(true);
    const [selected, setSelected] = useState<Set<string>>(new Set());

    // Player modal
    const [playingId, setPlayingId] = useState<string | null>(null);
    const [playingName, setPlayingName] = useState('');
    const [videoSrc, setVideoSrc] = useState<string | null>(null);
    const [liveCameraId, setLiveCameraId] = useState<string | null>(null);
    const [videoLoading, setVideoLoading] = useState(false);
    const [seekTarget, setSeekTarget] = useState<number>(0);
    const videoRef = useRef<HTMLVideoElement>(null);
    const seekAppliedRef = useRef(false);
    const playerWrapperRef = useRef<HTMLDivElement>(null);

    // CCTV settings — applies to BOTH classic and Beta playback
    const [allowDownload, setAllowDownload] = useState(true);
    const [showTimestampOverlay, setShowTimestampOverlay] = useState(true);

    // Runner lookup
    const [bibSearch, setBibSearch] = useState('');
    const [campaignId, setCampaignId] = useState('');
    const [campaignName, setCampaignName] = useState('');
    const [runnerHits, setRunnerHits] = useState<RunnerHit[]>([]);
    const [lookupLoading, setLookupLoading] = useState(false);
    const [lookupDone, setLookupDone] = useState(false);
    const [seekOffsetSec, setSeekOffsetSec] = useState(5);

    // Time search
    const [timeSearch, setTimeSearch] = useState('');
    const [timeResults, setTimeResults] = useState<Recording[]>([]);
    const [timeSearchDone, setTimeSearchDone] = useState(false);
    const [nearestRecs, setNearestRecs] = useState<{ rec: Recording; diffMs: number; relation: 'before' | 'after' }[]>([]);

    // Delete modal
    const [deleteTarget, setDeleteTarget] = useState<'one' | 'all' | null>(null);
    const [deleteId, setDeleteId] = useState<string | null>(null);
    const [confirmText, setConfirmText] = useState('');
    const [deleting, setDeleting] = useState(false);

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const qs = campaignId ? `?campaignId=${campaignId}` : '';
            // Pull from BOTH pipelines in parallel:
            //   classic = browser-based /camera page → .webm files on disk
            //   beta    = Larix / IRL Pro → HLS segments on EC2/S3
            const [recRes, storRes, betaRecRes, betaStorRes] = await Promise.allSettled([
                fetch(`/api/cctv-recordings${qs}`, { cache: 'no-store', headers: authHeaders() }),
                fetch(`/api/cctv-recordings/storage${qs}`, { cache: 'no-store', headers: authHeaders() }),
                fetch(`/api/cctv-beta/recordings${qs}`, { cache: 'no-store', headers: authHeaders() }),
                fetch(`/api/cctv-beta/recordings/storage${qs}`, { cache: 'no-store', headers: authHeaders() }),
            ]);

            const classicRecs: Recording[] = recRes.status === 'fulfilled' && recRes.value.ok
                ? (await recRes.value.json().catch(() => []))
                : [];
            const classicStor = storRes.status === 'fulfilled' && storRes.value.ok
                ? (await storRes.value.json().catch(() => ({ totalSize: 0, count: 0 })))
                : { totalSize: 0, count: 0 };
            const betaRecsRaw: any[] = betaRecRes.status === 'fulfilled' && betaRecRes.value.ok
                ? (await betaRecRes.value.json().catch(() => []))
                : [];
            const betaStor = betaStorRes.status === 'fulfilled' && betaStorRes.value.ok
                ? (await betaStorRes.value.json().catch(() => ({ totalSize: 0, count: 0 })))
                : { totalSize: 0, count: 0 };

            // Normalize Beta docs into the Recording shape used by this page.
            // Beta schema uses serverIngestStart/End and ObjectId cameraId.
            const betaRecs: Recording[] = (Array.isArray(betaRecsRaw) ? betaRecsRaw : []).map((b: any) => ({
                _id: String(b._id),
                cameraId: String(b.cameraId || ''),
                cameraName: b.cameraName || '(beta camera)',
                campaignId: String(b.campaignId || ''),
                checkpointName: b.checkpointName,
                startTime: b.serverIngestStart,
                endTime: b.serverIngestEnd,
                duration: Number(b.duration) || 0,
                fileSize: Number(b.fileSize) || 0,
                fileName: `${b.streamKey || b._id}.m3u8`,
                mimeType: 'application/vnd.apple.mpegurl',
                recordingStatus: b.recordingStatus,
                source: 'beta',
                playbackUrl: b.s3MasterManifestUrl || b.hlsManifestPath || null,
                protocol: b.protocol,
            }));

            const annotatedClassic: Recording[] = (Array.isArray(classicRecs) ? classicRecs : [])
                .map((r: any) => ({ ...r, source: 'classic' as const }));

            // Sort by start time DESC so newest appears first regardless of source
            const merged = [...annotatedClassic, ...betaRecs].sort(
                (a, b) => new Date(b.startTime).getTime() - new Date(a.startTime).getTime(),
            );

            setRecordings(merged);
            setStorage({
                totalSize: (classicStor?.totalSize || 0) + (betaStor?.totalSize || 0),
                count: (classicStor?.count || 0) + (betaStor?.count || 0),
            });
        } catch { setRecordings([]); }
        finally { setLoading(false); }
    }, [campaignId]);

    useEffect(() => { if (campaignId) load(); }, [campaignId, load]);

    // Auto-refresh while any recording is still live, so the UI doesn't act on
    // a stale `recordingStatus === 'recording'` (which would route playback
    // through the live socket viewer instead of the file stream).
    useEffect(() => {
        if (!campaignId) return;
        const hasLive = recordings.some(isLiveRecording);
        if (!hasLive) return;
        const t = setInterval(() => { load(); }, 10000);
        return () => clearInterval(t);
    }, [campaignId, recordings, load]);

    useEffect(() => {
        fetch('/api/campaigns/featured', { cache: 'no-store' })
            .then(r => r.ok ? r.json() : null)
            .then(d => { if (d?._id) { setCampaignId(d._id); setCampaignName(d.name || d.nameTh || ''); } })
            .catch(() => {});

        // Load CCTV settings (allowDownload + showTimestampOverlay) and apply to player
        fetch('/api/cctv-settings', { cache: 'no-store' })
            .then(r => r.ok ? r.json() : null)
            .then(s => {
                if (s && typeof s.allowDownload === 'boolean') setAllowDownload(s.allowDownload);
                if (s && typeof s.showTimestampOverlay === 'boolean') setShowTimestampOverlay(s.showTimestampOverlay);
            })
            .catch(() => {});
    }, []);

    // Auto-request browser fullscreen + Esc-to-close when player opens
    useEffect(() => {
        if (!playingId) return;
        const id = setTimeout(() => {
            const el = playerWrapperRef.current;
            if (el && document.fullscreenEnabled && !document.fullscreenElement) {
                el.requestFullscreen?.().catch(() => { /* needs user gesture — silent */ });
            }
        }, 50);
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {});
                closePlayer();
            }
        };
        window.addEventListener('keydown', onKey);
        return () => {
            clearTimeout(id);
            window.removeEventListener('keydown', onKey);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [playingId]);

    const searchRunner = async () => {
        if (!bibSearch.trim() || !campaignId) return;
        setLookupLoading(true);
        setLookupDone(false);
        try {
            const bib = encodeURIComponent(bibSearch.trim());
            const cid = encodeURIComponent(campaignId);
            const [classicRes, betaRes] = await Promise.allSettled([
                fetch(`/api/cctv-recordings/runner-lookup?bib=${bib}&campaignId=${cid}`,
                    { headers: authHeaders(), cache: 'no-store' }),
                fetch(`/api/cctv-beta/recordings/runner-lookup?bib=${bib}&campaignId=${cid}`,
                    { headers: authHeaders(), cache: 'no-store' }),
            ]);

            const classicHits: RunnerHit[] = classicRes.status === 'fulfilled' && classicRes.value.ok
                ? (await classicRes.value.json().catch(() => []))
                : [];
            const betaHits: RunnerHit[] = betaRes.status === 'fulfilled' && betaRes.value.ok
                ? (await betaRes.value.json().catch(() => []))
                : [];

            const annotated = [
                ...(Array.isArray(classicHits) ? classicHits : []).map((h: any) => ({
                    ...h,
                    source: 'classic' as const,
                    recording: h.recording ? { ...h.recording, source: 'classic' as const } : null,
                })),
                ...(Array.isArray(betaHits) ? betaHits : []).map((h: any) => ({
                    ...h,
                    source: 'beta' as const,
                    recording: h.recording ? { ...h.recording, source: 'beta' as const } : null,
                })),
            ];

            // Order by scanTime so the runner's path through checkpoints reads chronologically.
            // Same checkpoint may now appear twice (one per source) — that's intentional.
            annotated.sort((a, b) => new Date(a.scanTime).getTime() - new Date(b.scanTime).getTime());
            setRunnerHits(annotated);
        } catch { setRunnerHits([]); }
        finally { setLookupLoading(false); setLookupDone(true); }
    };

    const toggleSelect = (id: string) => {
        setSelected(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    };

    const toggleAll = () => {
        setSelected(prev => prev.size === recordings.length ? new Set() : new Set(recordings.map(r => r._id)));
    };

    const openDelete = (id: string | null, kind: 'one' | 'all') => {
        setDeleteId(id);
        setDeleteTarget(kind);
        setConfirmText('');
    };

    const handleDelete = async () => {
        if (confirmText !== 'ยืนยัน') return;
        setDeleting(true);
        try {
            if (deleteTarget === 'all') {
                // Delete-all only affects classic recordings (.webm files on disk).
                // Beta recordings live on EC2/S3 and must be removed via their own admin tooling.
                await fetch('/api/cctv-recordings', { method: 'DELETE', headers: authHeaders() });
                setSelected(new Set());
            } else if (deleteTarget === 'one' && deleteId) {
                // Route to the right endpoint based on the recording's source.
                const target = recordings.find(r => r._id === deleteId);
                const url = target?.source === 'beta'
                    ? `/api/cctv-beta/recordings/${deleteId}`
                    : `/api/cctv-recordings/${deleteId}`;
                await fetch(url, { method: 'DELETE', headers: authHeaders() });
            }
            setDeleteTarget(null);
            setDeleteId(null);
            setConfirmText('');
            await load();
        } finally { setDeleting(false); }
    };

    const openPlayerWithSeek = useCallback((rec: { _id: string; cameraId: string; recordingStatus?: string; endTime?: string | null; source?: 'classic' | 'beta'; playbackUrl?: string | null }, name: string, seek: number) => {
        const isLive = isLiveRecording(rec);
        setPlayingId(rec._id);
        setPlayingName(name);
        setSeekTarget(seek);
        seekAppliedRef.current = false;
        setVideoLoading(true);
        setLiveCameraId(isLive ? rec.cameraId : null);
        if (isLive && rec.source !== 'beta') {
            // Classic live: use socket viewer (existing behavior)
            setVideoSrc(null);
            setVideoLoading(false);
            return;
        }
        if (rec.source === 'beta') {
            // Beta: HLS manifest URL goes straight into the player (HlsPlayer / native HLS).
            setVideoSrc(rec.playbackUrl || null);
            setVideoLoading(false);
            return;
        }
        // Classic completed: use stream URL so browser can make Range requests for seeking
        const token = typeof window !== 'undefined' ? localStorage.getItem('auth_token') : null;
        const url = `/api/cctv-recordings/${rec._id}/stream${token ? `?token=${encodeURIComponent(token)}` : ''}`;
        setVideoSrc(url);
        setVideoLoading(false);
    }, []);

    const openPlayer = useCallback((rec: Recording) => {
        openPlayerWithSeek(rec, `${rec.cameraName} — ${fmtDate(rec.startTime)}`, 0);
    }, [openPlayerWithSeek]);

    const closePlayer = () => {
        videoRef.current?.pause();
        setVideoSrc(null);
        setLiveCameraId(null);
        setPlayingId(null);
        seekAppliedRef.current = false;
    };

    const allSelected = recordings.length > 0 && selected.size === recordings.length;
    const STORAGE_LIMIT = 10 * 1073741824; // 10 GB display cap
    const storagePercent = storage ? Math.min((storage.totalSize / STORAGE_LIMIT) * 100, 100) : 0;

    return (
        <AdminLayout breadcrumbItems={[{ label: 'พื้นที่จัดเก็บวิดีโอ', labelEn: 'Video Storage' }]}>

            {/* ── Runner Video Lookup ── */}
            <div className="bg-white border border-slate-200 rounded-xl p-4 sm:p-5 mb-5 shadow-sm">
                <h2 className="text-base font-extrabold text-slate-900 mb-1">
                    🏃 {th ? 'ค้นหาวิดีโอนักวิ่ง' : 'Runner Video Lookup'}
                </h2>
                <p className="text-xs text-slate-400 mb-4">
                    {th
                        ? 'กรอก BIB เพื่อค้นหาวิดีโอตรงจุดที่นักวิ่งวิ่งผ่าน Checkpoint'
                        : 'Enter BIB to find video at the moment the runner passed each checkpoint'}
                </p>
                <div className="flex items-stretch sm:items-center gap-2 flex-col sm:flex-row sm:flex-wrap">
                    <input
                        type="text"
                        value={bibSearch}
                        onChange={e => setBibSearch(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && searchRunner()}
                        placeholder={th ? 'หมายเลข BIB...' : 'BIB number...'}
                        className="border-2 border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-blue-400 transition-colors w-full sm:w-36"
                    />
                    {campaignName && (
                        <span className="text-xs bg-blue-50 text-blue-700 font-semibold px-2.5 py-1.5 rounded-lg inline-flex items-center">
                            {campaignName}
                        </span>
                    )}
                    <button
                        onClick={searchRunner}
                        disabled={lookupLoading || !bibSearch.trim() || !campaignId}
                        className={`px-4 py-2 text-sm font-bold rounded-lg transition-all cursor-pointer border-none ${
                            lookupLoading || !bibSearch.trim() || !campaignId
                                ? 'bg-slate-100 text-slate-300 cursor-not-allowed'
                                : 'bg-blue-600 text-white hover:bg-blue-700'
                        }`}
                    >
                        {lookupLoading ? 'กำลังค้นหา...' : (th ? 'ค้นหา' : 'Search')}
                    </button>
                    <span className="hidden sm:inline text-slate-300">|</span>
                    <label className="flex items-center gap-1.5 text-xs text-slate-500 font-semibold flex-wrap">
                        {th ? 'ถอยหลัง' : 'Rewind'}
                        <input
                            type="number"
                            min={0}
                            max={120}
                            value={seekOffsetSec}
                            onChange={e => setSeekOffsetSec(Math.max(0, Math.min(120, Number(e.target.value) || 0)))}
                            className="border-2 border-slate-200 rounded-lg px-2 py-1.5 text-sm outline-none focus:border-blue-400 w-16 text-center"
                        />
                        {th ? 'วินาที' : 'sec'}
                    </label>
                </div>

                {/* Time-based search */}
                <div className="flex items-stretch sm:items-center gap-2 flex-col sm:flex-row sm:flex-wrap mt-3 pt-3 border-t border-slate-100">
                    <span className="text-xs font-bold text-slate-500">⏰ {th ? 'ค้นหาตามเวลาจริง' : 'Search by time'}:</span>
                    <input
                        type="datetime-local"
                        step="1"
                        lang="th-TH-u-hc-h23"
                        value={timeSearch}
                        onChange={e => setTimeSearch(e.target.value)}
                        className="border-2 border-slate-200 rounded-lg px-3 py-1.5 text-sm outline-none focus:border-blue-400 transition-colors w-full sm:w-auto"
                        style={{ colorScheme: 'light' }}
                    />
                    <button
                        onClick={() => {
                            if (!timeSearch) return;
                            const ts = new Date(timeSearch).getTime();
                            const matched = recordings.filter(r => {
                                const st = new Date(r.startTime).getTime();
                                const et = r.endTime ? new Date(r.endTime).getTime() : Date.now();
                                return st <= ts && ts <= et;
                            });
                            setTimeResults(matched);
                            setTimeSearchDone(true);

                            // Find nearest recordings when no exact match
                            if (matched.length === 0 && recordings.length > 0) {
                                const sorted = recordings
                                    .map(r => {
                                        const st = new Date(r.startTime).getTime();
                                        const et = r.endTime ? new Date(r.endTime).getTime() : Date.now();
                                        if (ts < st) return { rec: r, diffMs: st - ts, relation: 'after' as const };
                                        if (ts > et) return { rec: r, diffMs: ts - et, relation: 'before' as const };
                                        return { rec: r, diffMs: 0, relation: 'after' as const };
                                    })
                                    .sort((a, b) => a.diffMs - b.diffMs)
                                    .slice(0, 3);
                                setNearestRecs(sorted);
                            } else {
                                setNearestRecs([]);
                            }
                        }}
                        disabled={!timeSearch}
                        className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all cursor-pointer border-none ${
                            !timeSearch ? 'bg-slate-100 text-slate-300 cursor-not-allowed' : 'bg-emerald-600 text-white hover:bg-emerald-700'
                        }`}
                    >
                        {th ? 'ค้นหา' : 'Search'}
                    </button>
                </div>

                {/* Results */}
                {lookupDone && runnerHits.length === 0 && (
                    <div className="mt-4 text-sm text-slate-400 text-center py-4">
                        {th ? `ไม่พบข้อมูล BIB "${bibSearch}"` : `No records found for BIB "${bibSearch}"`}
                    </div>
                )}
                {/* Time search results */}
                {timeSearchDone && timeResults.length === 0 && (
                    <div className="mt-4 border border-amber-200 rounded-lg overflow-hidden">
                        <div className="bg-amber-50 px-4 py-3 text-sm text-amber-800 font-semibold">
                            ⚠️ {th
                                ? `ไม่พบวิดีโอที่ครอบคลุมเวลา ${new Date(timeSearch).toLocaleString('th-TH', { hour12: false })}`
                                : `No recordings cover ${new Date(timeSearch).toLocaleString('en-GB', { hour12: false })}`}
                        </div>
                        {nearestRecs.length > 0 && (
                            <div className="px-4 py-3">
                                <p className="text-xs font-bold text-slate-500 mb-2">
                                    {th ? `วิดีโอที่ใกล้เคียงที่สุด (${nearestRecs.length} รายการ):` : `Nearest recordings (${nearestRecs.length}):`}
                                </p>
                                {nearestRecs.map(({ rec, diffMs, relation }) => {
                                    const diffSec = Math.floor(diffMs / 1000);
                                    const diffMin = Math.floor(diffSec / 60);
                                    const diffH = Math.floor(diffMin / 60);
                                    const diffLabel = diffH > 0
                                        ? `${diffH} ${th ? 'ชั่วโมง' : 'hr'} ${diffMin % 60} ${th ? 'นาที' : 'min'}`
                                        : diffMin > 0
                                            ? `${diffMin} ${th ? 'นาที' : 'min'} ${diffSec % 60} ${th ? 'วินาที' : 'sec'}`
                                            : `${diffSec} ${th ? 'วินาที' : 'sec'}`;
                                    const relationLabel = relation === 'before'
                                        ? (th ? 'จบไปแล้วก่อนหน้า' : 'ended before')
                                        : (th ? 'เริ่มหลังจาก' : 'starts after');
                                    return (
                                        <div key={rec._id} className="flex items-center justify-between py-2 border-t border-slate-100 first:border-t-0">
                                            <div className="flex-1 min-w-0">
                                                <span className="font-bold text-sm text-slate-800">{rec.cameraName}</span>
                                                {rec.checkpointName && (
                                                    <span className="ml-2 text-xs bg-orange-100 text-orange-700 font-bold px-1.5 py-0.5 rounded">{rec.checkpointName}</span>
                                                )}
                                                <div className="text-xs text-slate-500 mt-0.5">
                                                    {new Date(rec.startTime).toLocaleString('th-TH', { hour12: false })}
                                                    {rec.endTime && <> → {new Date(rec.endTime).toLocaleTimeString('th-TH', { hour12: false })}</>}
                                                    <span className="ml-1 text-slate-400">({fmtDuration(rec.duration)})</span>
                                                    <span className="ml-1 text-slate-400">• {fmtBytes(rec.fileSize)}</span>
                                                </div>
                                                <div className="text-xs mt-0.5">
                                                    <span className={`font-semibold ${relation === 'before' ? 'text-orange-600' : 'text-blue-600'}`}>
                                                        {relationLabel} {diffLabel}
                                                    </span>
                                                </div>
                                            </div>
                                            <button
                                                onClick={() => {
                                                    const seekSec = relation === 'before'
                                                        ? Math.max(0, rec.duration - seekOffsetSec)
                                                        : 0;
                                                    openPlayerWithSeek(rec, `${rec.cameraName} — ${th ? 'ใกล้เคียงที่สุด' : 'Nearest'}`, seekSec);
                                                }}
                                                className="text-xs font-bold text-amber-600 hover:text-amber-800 cursor-pointer bg-transparent border-none ml-3 shrink-0"
                                            >
                                                ▶ {th ? 'ดูวิดีโอ' : 'Watch'}
                                            </button>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                )}
                {timeResults.length > 0 && (
                    <div className="mt-4 border border-emerald-100 rounded-lg overflow-hidden">
                        <div className="bg-emerald-50 px-3 py-2 text-xs font-bold text-emerald-700">
                            {th ? `พบ ${timeResults.length} วิดีโอตรงเวลา ${new Date(timeSearch).toLocaleString('th-TH')}` : `Found ${timeResults.length} recording(s) at ${new Date(timeSearch).toLocaleString()}`}
                        </div>
                        {timeResults.map(rec => {
                            const seekSec = Math.max(0, Math.floor((new Date(timeSearch).getTime() - new Date(rec.startTime).getTime()) / 1000) - seekOffsetSec);
                            return (
                                <div key={rec._id} className="flex items-center justify-between px-3 py-2.5 border-t border-emerald-100 hover:bg-emerald-50/50">
                                    <div>
                                        <span className="font-bold text-sm text-slate-800">{rec.cameraName}</span>
                                        {rec.checkpointName && (
                                            <span className="ml-2 text-xs bg-orange-100 text-orange-700 font-bold px-1.5 py-0.5 rounded">{rec.checkpointName}</span>
                                        )}
                                        <span className="ml-2 text-xs text-slate-400">{fmtDate(rec.startTime)} — {fmtDuration(rec.duration)}</span>
                                    </div>
                                    <button
                                        onClick={() => openPlayerWithSeek(rec, `${rec.cameraName} — ${new Date(timeSearch).toLocaleTimeString('th-TH')}`, seekSec)}
                                        className="text-xs font-bold text-emerald-600 hover:text-emerald-800 cursor-pointer bg-transparent border-none"
                                    >
                                        ▶ {th ? 'ดูตรงเวลา' : 'Watch at time'} ({fmtDuration(seekSec)})
                                    </button>
                                </div>
                            );
                        })}
                    </div>
                )}

                {runnerHits.length > 0 && (
                    <div className="mt-4 border border-slate-100 rounded-lg overflow-x-auto">
                        <table className="w-full min-w-[720px] text-sm">
                            <thead>
                                <tr className="bg-slate-50 text-left">
                                    <th className="px-3 py-2 font-bold text-slate-600 text-xs uppercase">{th ? 'จุดตรวจ' : 'Checkpoint'}</th>
                                    <th className="px-3 py-2 font-bold text-slate-600 text-xs uppercase">{th ? 'เวลาจริง' : 'Real Time'}</th>
                                    <th className="px-3 py-2 font-bold text-slate-600 text-xs uppercase">{th ? 'Elapsed' : 'Elapsed'}</th>
                                    <th className="px-3 py-2 font-bold text-slate-600 text-xs uppercase">{th ? 'กล้อง' : 'Camera'}</th>
                                    <th className="px-3 py-2 font-bold text-slate-600 text-xs uppercase">{th ? 'ตำแหน่งวิดีโอ' : 'Seek'}</th>
                                    <th className="px-3 py-2"></th>
                                </tr>
                            </thead>
                            <tbody>
                                {runnerHits.map((hit, i) => (
                                    <tr key={i} className={`border-t border-slate-100 ${hit.recording ? 'hover:bg-blue-50/50' : 'opacity-60'}`}>
                                        <td className="px-3 py-2.5 font-bold text-slate-800">
                                            <span className={`inline-block px-2 py-0.5 rounded text-xs font-bold ${
                                                hit.checkpoint === 'START' ? 'bg-green-100 text-green-700'
                                                : hit.checkpoint === 'FINISH' ? 'bg-red-100 text-red-700'
                                                : 'bg-orange-100 text-orange-700'
                                            }`}>{hit.checkpoint}</span>
                                        </td>
                                        <td className="px-3 py-2.5 text-slate-700 font-mono text-xs">{fmtTime(hit.scanTime)}</td>
                                        <td className="px-3 py-2.5 text-slate-500 font-mono text-xs">{fmtMs(hit.elapsedTime)}</td>
                                        <td className="px-3 py-2.5 text-xs text-slate-500">
                                            {hit.recording ? (
                                                <span className="inline-flex items-center gap-1.5">
                                                    {hit.source === 'beta' || hit.recording.source === 'beta' ? (
                                                        <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-purple-100 text-purple-700 uppercase">📱 Beta</span>
                                                    ) : (
                                                        <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-sky-100 text-sky-700 uppercase">📹 CCTV</span>
                                                    )}
                                                    {hit.recording.cameraName}
                                                </span>
                                            ) : '—'}
                                        </td>
                                        <td className="px-3 py-2.5 text-xs font-mono text-slate-500">{hit.recording ? fmtDuration(Math.max(0, hit.seekSeconds - seekOffsetSec)) : '—'}</td>
                                        <td className="px-3 py-2.5 text-right">
                                            {hit.recording ? (
                                                <button
                                                    onClick={() => openPlayerWithSeek(
                                                        hit.recording!,
                                                        `BIB ${bibSearch} — ${hit.checkpoint} — ${fmtTime(hit.scanTime)}`,
                                                        Math.max(0, hit.seekSeconds - seekOffsetSec),
                                                    )}
                                                    className="text-xs font-bold text-blue-600 hover:text-blue-800 cursor-pointer bg-transparent border-none"
                                                >
                                                    ▶ {th ? 'ดูวิดีโอ' : 'Watch'}
                                                </button>
                                            ) : (
                                                <span className="text-xs text-slate-300">{th ? 'ไม่มีวิดีโอ' : 'No video'}</span>
                                            )}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            {/* ── Storage bar ── */}
            <div className="bg-white border border-slate-200 rounded-xl p-5 mb-5 shadow-sm">
                <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
                    <div>
                        <div className="flex items-center gap-2 flex-wrap">
                            <h1 className="text-lg font-extrabold text-slate-900 m-0">
                                🗄️ {th ? 'พื้นที่จัดเก็บวิดีโอ CCTV' : 'CCTV Video Storage'}
                            </h1>
                            {campaignName && (
                                <span className="text-xs font-bold text-amber-800 bg-amber-100 border border-amber-300 px-2.5 py-0.5 rounded-lg">
                                    ⭐ {campaignName}
                                </span>
                            )}
                        </div>
                        <p className="text-xs text-slate-400 mt-0.5">
                            {th ? 'แสดงเฉพาะวิดีโอของกิจกรรมที่เลือก' : 'Showing recordings for the selected campaign only'}
                        </p>
                    </div>
                    <div className="flex gap-2 items-center flex-wrap">
                        <span className="text-xs font-semibold text-slate-500 bg-slate-100 px-3 py-1.5 rounded-lg">
                            {storage?.count ?? 0} {th ? 'ไฟล์' : 'files'}
                        </span>
                        <span className="text-xs font-bold text-slate-700 bg-slate-100 px-3 py-1.5 rounded-lg">
                            {storage ? fmtBytes(storage.totalSize) : '—'}
                        </span>
                        <button
                            onClick={load}
                            className="text-xs font-semibold text-slate-600 border border-slate-200 px-3 py-1.5 rounded-lg hover:bg-slate-50 transition-colors cursor-pointer"
                        >
                            ↻ {th ? 'รีเฟรชเอง' : 'Manual refresh'}
                        </button>
                    </div>
                </div>
                <div className="w-full bg-slate-100 rounded-full h-2.5 overflow-hidden">
                    <div
                        className="h-full rounded-full transition-all duration-700"
                        style={{
                            width: `${storagePercent}%`,
                            background: storagePercent > 80 ? '#ef4444' : storagePercent > 50 ? '#f59e0b' : '#22c55e',
                        }}
                    />
                </div>
                <p className="text-[10px] text-slate-400 mt-1.5 text-right">
                    {storage ? fmtBytes(storage.totalSize) : '0 B'} / 10 GB {th ? '(แสดงผล)' : '(display limit)'}
                </p>
            </div>

            {/* ── Toolbar ── */}
            <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
                <div className="flex items-center gap-3">
                    <label className="flex items-center gap-2 cursor-pointer select-none">
                        <input
                            type="checkbox"
                            checked={allSelected}
                            onChange={toggleAll}
                            className="w-4 h-4 accent-slate-700 cursor-pointer"
                        />
                        <span className="text-sm font-semibold text-slate-700">
                            {allSelected ? (th ? 'ยกเลิกเลือกทั้งหมด' : 'Deselect All') : (th ? 'เลือกทั้งหมด' : 'Select All')}
                        </span>
                    </label>
                    {selected.size > 0 && (
                        <span className="text-xs bg-blue-100 text-blue-700 font-bold px-2 py-0.5 rounded-full">
                            {selected.size} {th ? 'เลือกแล้ว' : 'selected'}
                        </span>
                    )}
                </div>
                {recordings.length > 0 && (
                    <button
                        onClick={() => openDelete(null, 'all')}
                        className="text-xs font-bold text-red-600 border border-red-200 px-3 py-1.5 rounded-lg hover:bg-red-50 transition-colors cursor-pointer"
                    >
                        🗑️ {th ? 'ลบทั้งหมด' : 'Delete All'}
                    </button>
                )}
            </div>

            {/* ── Recording grid ── */}
            {loading ? (
                <div className="flex items-center justify-center py-20 text-slate-400 flex-col gap-3">
                    <div className="text-4xl">📹</div>
                    <div className="text-sm">{th ? 'กำลังโหลด...' : 'Loading...'}</div>
                </div>
            ) : recordings.length === 0 ? (
                <div className="bg-white border border-slate-200 rounded-xl p-16 text-center shadow-sm">
                    <div className="text-5xl mb-4">🎬</div>
                    <h3 className="text-base font-bold text-slate-700 mb-2">
                        {th ? 'ยังไม่มีวิดีโอ' : 'No recordings yet'}
                    </h3>
                    <p className="text-sm text-slate-400">
                        {th ? 'เริ่มถ่ายทอดสดจากหน้า /camera เพื่อบันทึกวิดีโออัตโนมัติ' : 'Start a live stream from /camera to record automatically'}
                    </p>
                </div>
            ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                    {recordings.map(rec => {
                        const isSel = selected.has(rec._id);
                        const isLive = isLiveRecording(rec);
                        return (
                            <div
                                key={rec._id}
                                className={`bg-white border rounded-xl overflow-hidden shadow-sm transition-all ${isSel ? 'border-blue-400 ring-2 ring-blue-200' : 'border-slate-200 hover:border-slate-300'}`}
                            >
                                {/* Thumbnail area */}
                                <div
                                    className={`relative bg-slate-900 cursor-pointer group ${isLive ? 'ring-2 ring-red-500/60' : ''}`}
                                    style={{ aspectRatio: '16/9' }}
                                    onClick={() => openPlayer(rec)}
                                >
                                    <div className="absolute inset-0 flex flex-col items-center justify-center gap-2">
                                        <div className="text-4xl opacity-20">{isLive ? '🔴' : '📹'}</div>
                                        <span className="text-xs text-slate-400 font-mono">{fmtDuration(rec.duration)}</span>
                                    </div>
                                    {/* LIVE badge */}
                                    {isLive && (
                                        <div className="absolute top-2 left-10 flex items-center gap-1.5 bg-red-600 text-white text-[10px] font-extrabold px-2.5 py-0.5 rounded-full animate-pulse">
                                            <span className="w-1.5 h-1.5 bg-white rounded-full inline-block" /> REC
                                        </div>
                                    )}
                                    {/* Play overlay */}
                                    <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-black/30">
                                        <div className="w-12 h-12 bg-white/90 rounded-full flex items-center justify-center shadow-lg">
                                            <span className="text-slate-900 text-xl ml-0.5">▶</span>
                                        </div>
                                    </div>
                                    {/* Select checkbox */}
                                    <div className="absolute top-2 left-2" onClick={e => { e.stopPropagation(); toggleSelect(rec._id); }}>
                                        <input
                                            type="checkbox"
                                            checked={isSel}
                                            onChange={() => toggleSelect(rec._id)}
                                            className="w-4 h-4 accent-blue-600 cursor-pointer"
                                        />
                                    </div>
                                    {/* File size badge */}
                                    <div className="absolute top-2 right-2 bg-black/50 text-white text-[10px] font-bold px-2 py-0.5 rounded-full">
                                        {fmtBytes(rec.fileSize)}
                                    </div>
                                </div>

                                {/* Card body — double-click anywhere to play */}
                                <div
                                    className="p-3"
                                    onDoubleClick={() => openPlayer(rec)}
                                    title={th ? 'ดับเบิลคลิกเพื่อเปิดวิดีโอ' : 'Double-click to play'}
                                    style={{ cursor: 'pointer' }}
                                >
                                    <div className="flex items-center gap-2 mb-1">
                                        {rec.source === 'beta' ? (
                                            <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-purple-100 text-purple-700 uppercase tracking-wider">
                                                📱 Beta
                                            </span>
                                        ) : (
                                            <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-sky-100 text-sky-700 uppercase tracking-wider">
                                                📹 CCTV
                                            </span>
                                        )}
                                        {rec.protocol && (
                                            <span className="text-[9px] font-bold text-slate-400 uppercase">{rec.protocol}</span>
                                        )}
                                    </div>
                                    <div className="font-bold text-sm text-slate-800 truncate">{rec.cameraName}</div>
                                    {rec.checkpointName && (
                                        <div className="text-xs text-orange-600 font-semibold mt-0.5 truncate">📍 {rec.checkpointName}</div>
                                    )}
                                    {rec.location && (
                                        <div className="text-xs text-slate-400 truncate">{rec.location}</div>
                                    )}
                                    <div className="text-xs text-slate-400 mt-1.5 flex items-center gap-1.5">
                                        <span>🕐</span>
                                        <span>{fmtDate(rec.startTime)}</span>
                                    </div>
                                    <div className="flex items-center justify-between mt-3 pt-2.5 border-t border-slate-100">
                                        <button
                                            onClick={() => openPlayer(rec)}
                                            className="flex items-center gap-1.5 text-xs font-bold text-blue-600 hover:text-blue-800 transition-colors cursor-pointer"
                                        >
                                            ▶ {th ? 'เล่นวิดีโอ' : 'Play'}
                                        </button>
                                        <button
                                            onClick={() => openDelete(rec._id, 'one')}
                                            className="text-xs font-bold text-red-500 hover:text-red-700 transition-colors cursor-pointer"
                                        >
                                            🗑️ {th ? 'ลบ' : 'Delete'}
                                        </button>
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}

            {/* ── Video Player Modal ── */}
            {playingId && (
                <div
                    ref={playerWrapperRef}
                    className="fixed inset-0 z-50 bg-black flex flex-col"
                    onClick={() => { if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {}); closePlayer(); }}
                >
                    {/* Big X close button — top-right, always visible */}
                    <button
                        onClick={e => { e.stopPropagation(); if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {}); closePlayer(); }}
                        aria-label="Close"
                        title={th ? 'ปิด (Esc)' : 'Close (Esc)'}
                        style={{
                            position: 'absolute', top: 16, right: 16, zIndex: 60,
                            width: 44, height: 44, borderRadius: '50%',
                            background: 'rgba(0,0,0,0.6)', color: '#fff',
                            border: '2px solid rgba(255,255,255,0.4)',
                            fontSize: 22, fontWeight: 700, cursor: 'pointer',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            transition: 'all 0.15s',
                        }}
                        onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = '#dc2626'; (e.currentTarget as HTMLButtonElement).style.borderColor = '#dc2626'; }}
                        onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(0,0,0,0.6)'; (e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(255,255,255,0.4)'; }}
                    >✕</button>

                    {/* Title — under the timestamp overlay if shown */}
                    <div
                        className="text-white font-bold text-xs truncate"
                        style={{ position: 'absolute', top: 18, left: showTimestampOverlay ? 240 : 16, zIndex: 55, padding: '6px 12px', background: 'rgba(0,0,0,0.5)', borderRadius: 6, maxWidth: 'calc(100% - 320px)' }}
                        onClick={e => e.stopPropagation()}
                    >
                        {playingName}
                    </div>

                    <div className="flex-1 flex items-center justify-center p-2 sm:p-4 min-h-0 relative" onClick={e => e.stopPropagation()}>
                        {videoLoading && (
                            <div className="text-white text-sm animate-pulse absolute z-10" onClick={e => e.stopPropagation()}>⏳ กำลังโหลดวิดีโอ...</div>
                        )}
                        {videoSrc && (videoSrc.includes('.m3u8') ? (
                            <HlsPlayer
                                key={videoSrc}
                                src={videoSrc}
                                startSeconds={seekTarget}
                                showTimestamp={showTimestampOverlay}
                                allowDownload={allowDownload}
                                className="w-full h-full object-contain bg-black"
                            />
                        ) : (
                            <div style={{ position: 'relative', width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <video
                                ref={videoRef}
                                src={videoSrc}
                                controls
                                autoPlay
                                preload="auto"
                                playsInline
                                controlsList={allowDownload ? undefined : 'nodownload noplaybackrate'}
                                disablePictureInPicture={!allowDownload}
                                onContextMenu={e => { if (!allowDownload) e.preventDefault(); }}
                                className="w-full h-full rounded-lg shadow-2xl bg-black"
                                style={{ maxHeight: 'calc(100dvh - 80px)', objectFit: 'contain' }}
                                onClick={e => e.stopPropagation()}
                                onLoadedMetadata={() => {
                                    const vid = videoRef.current;
                                    if (!vid) return;
                                    if (seekTarget > 0 && isFinite(vid.duration) && !seekAppliedRef.current) {
                                        seekAppliedRef.current = true;
                                        vid.currentTime = Math.min(seekTarget, Math.max(0, vid.duration - 0.5));
                                    }
                                }}
                                onDurationChange={() => {
                                    const vid = videoRef.current;
                                    if (!vid) return;
                                    if (isFinite(vid.duration) && !seekAppliedRef.current) {
                                        seekAppliedRef.current = true;
                                        if (seekTarget > 0) {
                                            vid.currentTime = Math.min(seekTarget, Math.max(0, vid.duration - 0.5));
                                        }
                                    }
                                }}
                                onLoadedData={() => {
                                    const vid = videoRef.current;
                                    if (!vid) return;
                                    // Fallback: if duration is finite and seek hasn't been applied yet
                                    if (isFinite(vid.duration) && !seekAppliedRef.current) {
                                        seekAppliedRef.current = true;
                                        if (seekTarget > 0) {
                                            vid.currentTime = Math.min(seekTarget, Math.max(0, vid.duration - 0.5));
                                        }
                                    }
                                }}
                                onCanPlay={() => setVideoLoading(false)}
                                onWaiting={() => setVideoLoading(true)}
                                onPlaying={() => setVideoLoading(false)}
                            />
                            {showTimestampOverlay && <CctvTimestampOverlay />}
                            </div>
                        ))}
                        {liveCameraId && (
                            <LiveRecordingFeed cameraId={liveCameraId} />
                        )}
                    </div>
                </div>
            )}

            {/* ── Delete Confirm Modal ── */}
            {deleteTarget && (
                <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6" onClick={e => e.stopPropagation()}>
                        <div className="text-center mb-5">
                            <div className="text-4xl mb-3">🗑️</div>
                            <h3 className="text-base font-extrabold text-slate-900 mb-1">
                                {deleteTarget === 'all'
                                    ? (th ? `ลบวิดีโอทั้งหมด ${recordings.length} ไฟล์` : `Delete all ${recordings.length} recordings?`)
                                    : (th ? 'ลบวิดีโอนี้?' : 'Delete this recording?')}
                            </h3>
                            <p className="text-xs text-slate-400">
                                {th ? 'การลบไม่สามารถย้อนกลับได้' : 'This action cannot be undone'}
                            </p>
                        </div>

                        <label className="block text-xs font-bold text-slate-600 mb-1.5 uppercase tracking-wide">
                            {th ? 'พิมพ์ "ยืนยัน" เพื่อยืนยัน' : 'Type "ยืนยัน" to confirm'}
                        </label>
                        <input
                            type="text"
                            value={confirmText}
                            onChange={e => setConfirmText(e.target.value)}
                            placeholder="ยืนยัน"
                            className="w-full border-2 border-slate-200 rounded-lg px-3 py-2.5 text-sm outline-none focus:border-red-400 transition-colors mb-4"
                            autoFocus
                        />

                        <div className="flex gap-2.5">
                            <button
                                onClick={() => { setDeleteTarget(null); setConfirmText(''); }}
                                className="flex-1 py-2.5 border border-slate-200 text-slate-600 text-sm font-semibold rounded-lg hover:bg-slate-50 transition-colors cursor-pointer"
                            >
                                {th ? 'ยกเลิก' : 'Cancel'}
                            </button>
                            <button
                                onClick={handleDelete}
                                disabled={confirmText !== 'ยืนยัน' || deleting}
                                className={`flex-1 py-2.5 text-sm font-bold rounded-lg transition-all cursor-pointer ${confirmText === 'ยืนยัน' && !deleting ? 'bg-red-600 text-white hover:bg-red-700' : 'bg-slate-100 text-slate-300 cursor-not-allowed'}`}
                            >
                                {deleting ? (th ? 'กำลังลบ...' : 'Deleting...') : (th ? '🗑️ ลบ' : '🗑️ Delete')}
                            </button>
                        </div>
                    </div>
                </div>
            )}

        </AdminLayout>
    );
}

function LiveRecordingFeed({ cameraId }: { cameraId: string }) {
    const videoRef = useRef<HTMLVideoElement>(null);
    const mediaSourceRef = useRef<MediaSource | null>(null);
    const sourceBufferRef = useRef<SourceBuffer | null>(null);
    const socketRef = useRef<Socket | null>(null);
    const queueRef = useRef<Uint8Array[]>([]);
    const mimeTypeRef = useRef('video/webm;codecs=vp8');
    const [segmentVersion, setSegmentVersion] = useState(0);

    const appendNext = useCallback(() => {
        const sourceBuffer = sourceBufferRef.current;
        if (!sourceBuffer || sourceBuffer.updating || queueRef.current.length === 0) return;
        try {
            if (queueRef.current.length > 30) queueRef.current.splice(0, queueRef.current.length - 30);
            if (sourceBuffer.buffered.length > 0) {
                const end = sourceBuffer.buffered.end(sourceBuffer.buffered.length - 1);
                const start = sourceBuffer.buffered.start(0);
                if (end - start > 60) {
                    sourceBuffer.remove(start, end - 30);
                    return;
                }
            }
            sourceBuffer.appendBuffer(queueRef.current.shift()!);
        } catch (err: unknown) {
            if (err instanceof DOMException && err.name === 'QuotaExceededError' && sourceBuffer.buffered.length > 0) {
                try { sourceBuffer.remove(sourceBuffer.buffered.start(0), sourceBuffer.buffered.start(0) + 10); } catch { }
            }
        }
    }, []);

    useEffect(() => {
        if (typeof window === 'undefined' || !('MediaSource' in window)) return;
        const socketUrl = window.location.origin;
        const socket = io(`${socketUrl}/cctv`, { path: '/socket.io', transports: ['websocket', 'polling'] });
        const mediaSource = new MediaSource();
        const objectUrl = URL.createObjectURL(mediaSource);
        socketRef.current = socket;
        mediaSourceRef.current = mediaSource;
        if (videoRef.current) videoRef.current.src = objectUrl;

        const initSourceBuffer = (mimeType: string) => {
            if (sourceBufferRef.current || mediaSource.readyState !== 'open') return;
            if (!MediaSource.isTypeSupported(mimeType)) return;
            const sourceBuffer = mediaSource.addSourceBuffer(mimeType);
            sourceBufferRef.current = sourceBuffer;
            sourceBuffer.addEventListener('updateend', appendNext);
            sourceBuffer.addEventListener('updateend', () => {
                const video = videoRef.current;
                if (!video || sourceBuffer.buffered.length === 0) return;
                const liveEdge = sourceBuffer.buffered.end(sourceBuffer.buffered.length - 1);
                if (liveEdge - video.currentTime > 8) video.currentTime = Math.max(0, liveEdge - 2);
                video.play().catch(() => {});
            });
            appendNext();
        };

        const normalizeChunk = (chunk: ArrayBuffer | Uint8Array | number[]) => {
            if (chunk instanceof ArrayBuffer) return new Uint8Array(chunk);
            if (chunk instanceof Uint8Array) return chunk;
            return Uint8Array.from(chunk);
        };

        const handleChunk = ({ cameraId: incomingCameraId, chunk, mimeType }: { cameraId: string; chunk: ArrayBuffer | Uint8Array | number[]; mimeType?: string }) => {
            if (incomingCameraId !== cameraId) return;
            if (mimeType && mimeType !== mimeTypeRef.current) mimeTypeRef.current = mimeType;
            if (!sourceBufferRef.current && mediaSource.readyState === 'open') initSourceBuffer(mimeTypeRef.current);
            queueRef.current.push(normalizeChunk(chunk));
            appendNext();
        };

        const handleSegmentRestart = ({ cameraId: incomingCameraId }: { cameraId: string }) => {
            if (incomingCameraId !== cameraId) return;
            setSegmentVersion(v => v + 1);
        };

        mediaSource.addEventListener('sourceopen', () => initSourceBuffer(mimeTypeRef.current));
        socket.on('camera:chunk', handleChunk);
        socket.on('camera:segment-restart', handleSegmentRestart);
        socket.on('connect', () => socket.emit('viewer:watch', cameraId));

        return () => {
            socket.off('camera:chunk', handleChunk);
            socket.off('camera:segment-restart', handleSegmentRestart);
            socket.emit('viewer:unwatch', cameraId);
            socket.disconnect();
            socketRef.current = null;
            sourceBufferRef.current = null;
            mediaSourceRef.current = null;
            queueRef.current = [];
            URL.revokeObjectURL(objectUrl);
        };
    }, [appendNext, cameraId, segmentVersion]);

    return (
        <video
            ref={videoRef}
            controls
            autoPlay
            muted
            playsInline
            className="w-full h-full rounded-lg shadow-2xl bg-black"
            style={{ maxHeight: 'calc(100dvh - 80px)', objectFit: 'contain' }}
        />
    );
}
