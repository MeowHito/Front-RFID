'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import AdminLayout from '../AdminLayout';
import { useLanguage } from '@/lib/language-context';
import { authHeaders } from '@/lib/authHeaders';

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
}

interface StorageInfo { totalSize: number; count: number; }

interface RunnerHit {
    checkpoint: string;
    scanTime: string;
    elapsedTime: number | null;
    splitTime: number | null;
    recording: {
        _id: string;
        cameraName: string;
        startTime: string;
        endTime: string;
        duration: number;
        fileSize: number;
    } | null;
    seekSeconds: number;
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
    const [videoLoading, setVideoLoading] = useState(false);
    const [seekTarget, setSeekTarget] = useState<number>(0);
    const [knownDuration, setKnownDuration] = useState<number>(0);
    const videoRef = useRef<HTMLVideoElement>(null);
    const seekAppliedRef = useRef(false);

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

    const load = async () => {
        setLoading(true);
        try {
            const qs = campaignId ? `?campaignId=${campaignId}` : '';
            const [recRes, storRes] = await Promise.all([
                fetch(`/api/cctv-recordings${qs}`, { cache: 'no-store', headers: authHeaders() }),
                fetch(`/api/cctv-recordings/storage${qs}`, { cache: 'no-store', headers: authHeaders() }),
            ]);
            const recData = await recRes.json();
            const storData = await storRes.json();
            setRecordings(Array.isArray(recData) ? recData : []);
            setStorage(storData);
        } catch { setRecordings([]); }
        finally { setLoading(false); }
    };

    useEffect(() => { if (campaignId) load(); }, [campaignId]);

    // Auto-refresh every 10s while any recording is live
    useEffect(() => {
        const hasLive = recordings.some(r => r.recordingStatus === 'recording');
        if (!hasLive) return;
        const interval = setInterval(load, 10000);
        return () => clearInterval(interval);
    }, [recordings]);

    useEffect(() => {
        fetch('/api/campaigns/featured', { cache: 'no-store' })
            .then(r => r.ok ? r.json() : null)
            .then(d => { if (d?._id) { setCampaignId(d._id); setCampaignName(d.name || d.nameTh || ''); } })
            .catch(() => {});
    }, []);

    const searchRunner = async () => {
        if (!bibSearch.trim() || !campaignId) return;
        setLookupLoading(true);
        setLookupDone(false);
        try {
            const res = await fetch(
                `/api/cctv-recordings/runner-lookup?bib=${encodeURIComponent(bibSearch.trim())}&campaignId=${encodeURIComponent(campaignId)}`,
                { headers: authHeaders(), cache: 'no-store' },
            );
            const data = await res.json();
            setRunnerHits(Array.isArray(data) ? data : []);
        } catch { setRunnerHits([]); }
        finally { setLookupLoading(false); setLookupDone(true); }
    };

    const toggleSelect = (id: string) => {
        setSelected(prev => {
            const next = new Set(prev);
            next.has(id) ? next.delete(id) : next.add(id);
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
                await fetch('/api/cctv-recordings', { method: 'DELETE', headers: authHeaders() });
                setSelected(new Set());
            } else if (deleteTarget === 'one' && deleteId) {
                await fetch(`/api/cctv-recordings/${deleteId}`, { method: 'DELETE', headers: authHeaders() });
            }
            setDeleteTarget(null);
            setDeleteId(null);
            setConfirmText('');
            await load();
        } finally { setDeleting(false); }
    };

    const openPlayerWithSeek = useCallback((recId: string, name: string, seek: number, duration?: number) => {
        setPlayingId(recId);
        setPlayingName(name);
        setSeekTarget(seek);
        setKnownDuration(duration || 0);
        seekAppliedRef.current = false;
        setVideoLoading(true);
        // Use stream URL directly so browser can make Range requests for seeking
        const token = typeof window !== 'undefined' ? localStorage.getItem('auth_token') : null;
        const url = `/api/cctv-recordings/${recId}/stream${token ? `?token=${encodeURIComponent(token)}` : ''}`;
        setVideoSrc(url);
        setVideoLoading(false);
    }, []);

    const openPlayer = useCallback((rec: Recording) => {
        openPlayerWithSeek(rec._id, `${rec.cameraName} — ${fmtDate(rec.startTime)}`, 0, rec.duration);
    }, [openPlayerWithSeek]);

    const closePlayer = () => {
        videoRef.current?.pause();
        setVideoSrc(null);
        setPlayingId(null);
        setKnownDuration(0);
        seekAppliedRef.current = false;
    };

    const allSelected = recordings.length > 0 && selected.size === recordings.length;
    const STORAGE_LIMIT = 10 * 1073741824; // 10 GB display cap
    const storagePercent = storage ? Math.min((storage.totalSize / STORAGE_LIMIT) * 100, 100) : 0;

    return (
        <AdminLayout breadcrumbItems={[{ label: 'พื้นที่จัดเก็บวิดีโอ', labelEn: 'Video Storage' }]}>

            {/* ── Runner Video Lookup ── */}
            <div className="bg-white border border-slate-200 rounded-xl p-5 mb-5 shadow-sm">
                <h2 className="text-base font-extrabold text-slate-900 mb-1">
                    🏃 {th ? 'ค้นหาวิดีโอนักวิ่ง' : 'Runner Video Lookup'}
                </h2>
                <p className="text-xs text-slate-400 mb-4">
                    {th
                        ? 'กรอก BIB เพื่อค้นหาวิดีโอตรงจุดที่นักวิ่งวิ่งผ่าน Checkpoint'
                        : 'Enter BIB to find video at the moment the runner passed each checkpoint'}
                </p>
                <div className="flex items-center gap-2 flex-wrap">
                    <input
                        type="text"
                        value={bibSearch}
                        onChange={e => setBibSearch(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && searchRunner()}
                        placeholder={th ? 'หมายเลข BIB...' : 'BIB number...'}
                        className="border-2 border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-blue-400 transition-colors w-36"
                    />
                    {campaignName && (
                        <span className="text-xs bg-blue-50 text-blue-700 font-semibold px-2.5 py-1.5 rounded-lg">
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
                    <span className="text-slate-300">|</span>
                    <label className="flex items-center gap-1.5 text-xs text-slate-500 font-semibold">
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
                <div className="flex items-center gap-2 flex-wrap mt-3 pt-3 border-t border-slate-100">
                    <span className="text-xs font-bold text-slate-500">⏰ {th ? 'ค้นหาตามเวลาจริง' : 'Search by time'}:</span>
                    <input
                        type="datetime-local"
                        step="1"
                        lang="th-TH-u-hc-h23"
                        value={timeSearch}
                        onChange={e => setTimeSearch(e.target.value)}
                        className="border-2 border-slate-200 rounded-lg px-3 py-1.5 text-sm outline-none focus:border-blue-400 transition-colors"
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
                                                    openPlayerWithSeek(rec._id, `${rec.cameraName} — ${th ? 'ใกล้เคียงที่สุด' : 'Nearest'}`, seekSec, rec.duration);
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
                                        onClick={() => openPlayerWithSeek(rec._id, `${rec.cameraName} — ${new Date(timeSearch).toLocaleTimeString('th-TH')}`, seekSec, rec.duration)}
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
                    <div className="mt-4 border border-slate-100 rounded-lg overflow-hidden">
                        <table className="w-full text-sm">
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
                                        <td className="px-3 py-2.5 text-xs text-slate-500">{hit.recording?.cameraName || '—'}</td>
                                        <td className="px-3 py-2.5 text-xs font-mono text-slate-500">{hit.recording ? fmtDuration(Math.max(0, hit.seekSeconds - seekOffsetSec)) : '—'}</td>
                                        <td className="px-3 py-2.5 text-right">
                                            {hit.recording ? (
                                                <button
                                                    onClick={() => openPlayerWithSeek(
                                                        hit.recording!._id,
                                                        `BIB ${bibSearch} — ${hit.checkpoint} — ${fmtTime(hit.scanTime)}`,
                                                        Math.max(0, hit.seekSeconds - seekOffsetSec),
                                                        hit.recording!.duration,
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
                            ↻ {th ? 'รีเฟรช' : 'Refresh'}
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
                        return (
                            <div
                                key={rec._id}
                                className={`bg-white border rounded-xl overflow-hidden shadow-sm transition-all ${isSel ? 'border-blue-400 ring-2 ring-blue-200' : 'border-slate-200 hover:border-slate-300'}`}
                            >
                                {/* Thumbnail area */}
                                <div
                                    className={`relative bg-slate-900 cursor-pointer group ${rec.recordingStatus === 'recording' ? 'ring-2 ring-red-500/60' : ''}`}
                                    style={{ aspectRatio: '16/9' }}
                                    onClick={() => openPlayer(rec)}
                                >
                                    <div className="absolute inset-0 flex flex-col items-center justify-center gap-2">
                                        <div className="text-4xl opacity-20">{rec.recordingStatus === 'recording' ? '🔴' : '📹'}</div>
                                        <span className="text-xs text-slate-400 font-mono">{fmtDuration(rec.duration)}</span>
                                    </div>
                                    {/* LIVE badge */}
                                    {rec.recordingStatus === 'recording' && (
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

                                {/* Card body */}
                                <div className="p-3">
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
                    className="fixed inset-0 z-50 bg-black/90 flex flex-col"
                    onClick={closePlayer}
                >
                    <div
                        className="flex items-center justify-between px-5 py-3 shrink-0"
                        onClick={e => e.stopPropagation()}
                    >
                        <div className="text-white font-bold text-sm truncate max-w-[80%]">{playingName}</div>
                        <button onClick={closePlayer} className="text-white text-2xl leading-none cursor-pointer bg-transparent border-none">✕</button>
                    </div>
                    <div className="flex-1 flex items-center justify-center p-4">
                        {videoLoading && (
                            <div className="text-white text-sm animate-pulse" onClick={e => e.stopPropagation()}>⏳ กำลังโหลดวิดีโอ...</div>
                        )}
                        {videoSrc && (
                            <video
                                ref={videoRef}
                                src={videoSrc}
                                controls
                                autoPlay
                                preload="auto"
                                className="max-w-full max-h-full rounded-lg shadow-2xl"
                                style={{ maxHeight: 'calc(100vh - 80px)' }}
                                onClick={e => e.stopPropagation()}
                                onLoadedMetadata={() => {
                                    const vid = videoRef.current;
                                    if (!vid) return;
                                    // WebM from MediaRecorder often has Infinity duration
                                    // Fix: set a very large currentTime to force the browser to discover the real duration
                                    if (!isFinite(vid.duration) && knownDuration > 0) {
                                        vid.currentTime = 1e101;
                                    }
                                }}
                                onDurationChange={() => {
                                    const vid = videoRef.current;
                                    if (!vid) return;
                                    // After the browser discovers the real duration (from the jump trick),
                                    // apply the seek target
                                    if (isFinite(vid.duration) && !seekAppliedRef.current) {
                                        seekAppliedRef.current = true;
                                        if (seekTarget > 0) {
                                            vid.currentTime = Math.min(seekTarget, vid.duration - 0.5);
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
                                            vid.currentTime = Math.min(seekTarget, vid.duration - 0.5);
                                        }
                                    }
                                }}
                            />
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
