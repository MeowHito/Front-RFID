'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import AdminLayout from '../AdminLayout';
import { useLanguage } from '@/lib/language-context';
import HlsPlayer from '@/components/HlsPlayer';

interface BetaRecording {
    _id: string;
    cameraName: string;
    checkpointName?: string;
    streamKey: string;
    serverIngestStart: string;
    serverIngestEnd?: string;
    duration: number;
    fileSize: number;
    /** Backend flag — true when fileSize was estimated from live duration × bitrate
     *  because the recording is still in progress (real size only known after on-unpublish). */
    fileSizeEstimated?: boolean;
    s3MasterManifestUrl?: string;
    hlsManifestPath?: string;
    protocol: 'rtmp' | 'srt';
    recordingStatus: 'recording' | 'completed' | 'archived' | 'error';
}

function authHeaders(): HeadersInit {
    if (typeof window === 'undefined') return {};
    const token = window.localStorage.getItem('auth_token');
    return token ? { Authorization: `Bearer ${token}` } : {};
}

function fmtSize(b: number) {
    if (!b) return '—';
    if (b > 1e9) return (b / 1e9).toFixed(2) + ' GB';
    if (b > 1e6) return (b / 1e6).toFixed(1) + ' MB';
    return (b / 1e3).toFixed(0) + ' KB';
}
function fmtDur(s: number) {
    if (!s) return '—';
    const m = Math.floor(s / 60), sec = s % 60;
    return `${m}m ${sec}s`;
}

/**
 * Resolve the EC2 LL-HLS manifest URL (low-latency, ~1-2s delay) — used for live
 * playback while the stream is still publishing. Returns '' if not resolvable.
 */
function getEc2HlsUrl(recording: BetaRecording): string {
    if (!recording.hlsManifestPath) return '';
    if (recording.hlsManifestPath.startsWith('http')) return recording.hlsManifestPath;
    // NEXT_PUBLIC_CCTV_BETA_PLAYBACK_HOST is set in frontend .env.local
    const host = (process.env.NEXT_PUBLIC_CCTV_BETA_PLAYBACK_HOST || '').replace(/^https?:\/\//, '').replace(/\/$/, '');
    if (!host) return recording.hlsManifestPath; // relative — will fail unless served from same origin
    const p = recording.hlsManifestPath.startsWith('/') ? recording.hlsManifestPath : `/${recording.hlsManifestPath}`;
    return `https://${host}${p}`;
}

/**
 * Pick the best playback URL for a Beta recording.
 *
 * Priority:
 *   • Live (recordingStatus === 'recording')  → EC2 LL-HLS first (fresh ~1s segments).
 *     S3 sync runs every 15s, so its manifest lags up to 15s behind the live edge —
 *     using EC2 directly avoids a stale "live" view.
 *   • Archived (completed/archived/error)    → S3 master manifest (durable, full timeline).
 *   • Fallback: whichever is available.
 */
function getPlaybackUrl(recording: BetaRecording): string {
    const ec2 = getEc2HlsUrl(recording);
    const s3 = recording.s3MasterManifestUrl || '';
    if (recording.recordingStatus === 'recording') {
        return ec2 || s3;
    }
    return s3 || ec2;
}

export default function CctvBetaRecordingsPage() {
    const { language } = useLanguage();
    const th = language === 'th';
    const [selectedCampaign, setSelectedCampaign] = useState('');
    const [items, setItems] = useState<BetaRecording[]>([]);
    const [loading, setLoading] = useState(false);
    const [lastRefresh, setLastRefresh] = useState<Date | null>(null);
    const [playing, setPlaying] = useState<BetaRecording | null>(null);
    // Shared CCTV settings — apply to Beta too (allowDownload + showTimestampOverlay)
    const [allowDownload, setAllowDownload] = useState(true);
    const [showTimestampOverlay, setShowTimestampOverlay] = useState(true);
    const playerWrapperRef = useRef<HTMLDivElement | null>(null);

    // Bulk-select state — Set of recording _ids the admin has ticked
    const [selected, setSelected] = useState<Set<string>>(new Set());

    // Delete confirmation modal — 'one' deletes deleteOneId, 'selected' the ticked Set,
    // 'all' wipes the entire campaign. Mirrors classic /admin/cctv-recordings UX.
    const [deleteMode, setDeleteMode] = useState<'one' | 'selected' | 'all' | null>(null);
    const [deleteOneId, setDeleteOneId] = useState<string | null>(null);
    const [confirmText, setConfirmText] = useState('');
    const [deleting, setDeleting] = useState(false);

    // Time search — admin types/picks a Thailand-local datetime and we ask backend
    // which recording(s) cover it + nearest before/after for context.
    const [timeSearch, setTimeSearch] = useState('');
    const [timeResult, setTimeResult] = useState<{
        covering: BetaRecording[];
        nearestBefore: BetaRecording | null;
        nearestAfter: BetaRecording | null;
    } | null>(null);
    const [timeSearching, setTimeSearching] = useState(false);

    useEffect(() => {
        fetch('/api/campaigns/featured', { cache: 'no-store' })
            .then(r => r.json())
            .then(d => { if (d?._id) setSelectedCampaign(d._id); }).catch(() => {});

        // Load CCTV settings — same source of truth as /admin/cctv-settings
        fetch('/api/cctv-settings', { cache: 'no-store' })
            .then(r => r.ok ? r.json() : null)
            .then(s => {
                if (s && typeof s.allowDownload === 'boolean') setAllowDownload(s.allowDownload);
                if (s && typeof s.showTimestampOverlay === 'boolean') setShowTimestampOverlay(s.showTimestampOverlay);
            })
            .catch(() => {});
    }, []);

    // When the modal opens, try to request browser fullscreen on the player wrapper.
    // Failure is silent — some browsers require a direct user gesture, in which case
    // the user can still hit the fullscreen button in the video controls.
    useEffect(() => {
        if (!playing) return;
        const id = setTimeout(() => {
            const el = playerWrapperRef.current;
            if (el && document.fullscreenEnabled && !document.fullscreenElement) {
                el.requestFullscreen?.().catch(() => { /* user gesture rule — ignore */ });
            }
        }, 50);

        // Esc key closes the player
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {});
                setPlaying(null);
            }
        };
        window.addEventListener('keydown', onKey);
        return () => {
            clearTimeout(id);
            window.removeEventListener('keydown', onKey);
        };
    }, [playing]);

    const load = useCallback(async () => {
        if (!selectedCampaign) return;
        setLoading(true);
        try {
            const res = await fetch(`/api/cctv-beta/recordings?campaignId=${selectedCampaign}`, { cache: 'no-store' });
            const data = await res.json();
            setItems(Array.isArray(data) ? data : []);
            setLastRefresh(new Date());
        } finally { setLoading(false); }
    }, [selectedCampaign]);

    // Quick lookup for the recording-currently-live count → drives the refresh hint copy
    const liveCount = items.filter(r => r.recordingStatus === 'recording').length;

    useEffect(() => { setTimeout(load, 0); }, [load]);

    const openDelete = (mode: 'one' | 'selected' | 'all', id?: string) => {
        setDeleteMode(mode);
        setDeleteOneId(id || null);
        setConfirmText('');
    };

    const handleConfirmedDelete = async () => {
        if (confirmText !== 'ยืนยัน') return;
        setDeleting(true);
        try {
            if (deleteMode === 'one' && deleteOneId) {
                await fetch(`/api/cctv-beta/recordings/${deleteOneId}`, { method: 'DELETE', headers: authHeaders() });
            } else if (deleteMode === 'selected' && selected.size > 0) {
                await fetch('/api/cctv-beta/recordings/bulk-delete', {
                    method: 'POST',
                    headers: authHeaders(),
                    body: JSON.stringify({ ids: Array.from(selected) }),
                });
                setSelected(new Set());
            } else if (deleteMode === 'all' && selectedCampaign) {
                await fetch('/api/cctv-beta/recordings/bulk-delete', {
                    method: 'POST',
                    headers: authHeaders(),
                    body: JSON.stringify({ campaignId: selectedCampaign }),
                });
                setSelected(new Set());
            }
            setDeleteMode(null);
            setDeleteOneId(null);
            setConfirmText('');
            await load();
        } finally {
            setDeleting(false);
        }
    };

    const toggleSelect = (id: string) => {
        setSelected((prev) => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    };

    const toggleSelectAll = () => {
        setSelected((prev) => prev.size === items.length ? new Set() : new Set(items.map(r => r._id)));
    };

    const allSelected = items.length > 0 && selected.size === items.length;

    const searchByTime = async () => {
        if (!timeSearch || !selectedCampaign) return;
        setTimeSearching(true);
        try {
            // datetime-local gives "YYYY-MM-DDTHH:MM" which JS Date parses as local time.
            const at = new Date(timeSearch).toISOString();
            const res = await fetch(
                `/api/cctv-beta/recordings/by-time?campaignId=${encodeURIComponent(selectedCampaign)}&at=${encodeURIComponent(at)}`,
                { headers: authHeaders(), cache: 'no-store' },
            );
            const data = await res.json();
            setTimeResult(data);
        } finally {
            setTimeSearching(false);
        }
    };

    // Build a quick lookup for "is this row also in the time-search result" highlighting.
    const timeHighlightIds = new Set<string>([
        ...(timeResult?.covering || []).map(r => r._id),
        ...(timeResult?.nearestBefore ? [timeResult.nearestBefore._id] : []),
        ...(timeResult?.nearestAfter ? [timeResult.nearestAfter._id] : []),
    ]);

    return (
        <AdminLayout>
            <div style={{ padding: 24 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
                    <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700 }}>{th ? 'การบันทึก (Larix Beta)' : 'Recordings (Larix Beta)'}</h1>
                    <span style={{ background: '#f59e0b', color: '#fff', padding: '2px 10px', borderRadius: 12, fontSize: 11, fontWeight: 700 }}>BETA</span>

                    {/* Live indicator + refresh — pushed right */}
                    <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, alignItems: 'center' }}>
                        {liveCount > 0 && (
                            <span style={{
                                display: 'inline-flex', alignItems: 'center', gap: 6,
                                padding: '4px 12px', borderRadius: 20,
                                background: '#fef2f2', border: '1px solid #fecaca',
                                color: '#dc2626', fontSize: 12, fontWeight: 700,
                            }}>
                                <span style={{
                                    width: 8, height: 8, borderRadius: '50%',
                                    background: '#dc2626',
                                    animation: 'pulse-dot 1.2s ease-in-out infinite',
                                }} />
                                {th ? `กำลังบันทึก ${liveCount} ตัว` : `${liveCount} live`}
                            </span>
                        )}
                        <button
                            onClick={load}
                            disabled={loading}
                            title={lastRefresh ? `${th ? 'รีเฟรชล่าสุด' : 'Last refreshed'}: ${lastRefresh.toLocaleTimeString('en-GB', { timeZone: 'Asia/Bangkok' })}` : undefined}
                            style={{
                                padding: '6px 14px', borderRadius: 6,
                                border: '1px solid #0ea5e9',
                                background: loading ? '#e0f2fe' : '#0ea5e9',
                                color: loading ? '#0c4a6e' : '#fff',
                                fontSize: 12, fontWeight: 700,
                                cursor: loading ? 'wait' : 'pointer',
                            }}
                        >
                            {loading ? '⏳' : '🔄'} {th ? 'รีเฟรช' : 'Refresh'}
                        </button>
                        {lastRefresh && (
                            <span style={{ fontSize: 11, color: '#94a3b8', fontFamily: 'monospace' }}>
                                {lastRefresh.toLocaleTimeString('en-GB', { timeZone: 'Asia/Bangkok' })}
                            </span>
                        )}
                        {selected.size > 0 && (
                            <button
                                onClick={() => openDelete('selected')}
                                style={{ padding: '6px 14px', borderRadius: 6, border: 'none', background: '#dc2626', color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}
                            >
                                🗑️ {th ? `ลบที่เลือก (${selected.size})` : `Delete selected (${selected.size})`}
                            </button>
                        )}
                        {items.length > 0 && (
                            <button
                                onClick={() => openDelete('all')}
                                style={{ padding: '6px 14px', borderRadius: 6, border: '1px solid #fecaca', background: '#fef2f2', color: '#dc2626', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}
                            >
                                {th ? `ลบทั้งหมดของแคมเปญนี้ (${items.length})` : `Delete all in campaign (${items.length})`}
                            </button>
                        )}
                    </div>
                </div>
                <style>{`@keyframes pulse-dot { 0%,100%{opacity:1;transform:scale(1)} 50%{opacity:.45;transform:scale(.8)} }`}</style>

                {/* Time search bar */}
                <div style={{ background: '#fff', padding: 14, borderRadius: 8, border: '1px solid #e5e7eb', marginBottom: 12 }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: '#374151', marginBottom: 8 }}>
                        🕐 {th ? 'ค้นหาตามเวลา (เวลาไทย)' : 'Search by time (Thailand time)'}
                    </div>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                        <input
                            type="datetime-local"
                            value={timeSearch}
                            onChange={(e) => setTimeSearch(e.target.value)}
                            step="1"
                            style={{ padding: '8px 10px', border: '1px solid #cbd5e1', borderRadius: 6, fontSize: 13 }}
                        />
                        <button
                            onClick={searchByTime}
                            disabled={!timeSearch || timeSearching}
                            style={{
                                padding: '8px 16px', borderRadius: 6, border: 'none',
                                background: !timeSearch || timeSearching ? '#cbd5e1' : '#0ea5e9',
                                color: '#fff', fontSize: 12, fontWeight: 700,
                                cursor: !timeSearch || timeSearching ? 'not-allowed' : 'pointer',
                            }}
                        >
                            {timeSearching ? '⏳' : '🔍'} {th ? 'ค้นหา' : 'Search'}
                        </button>
                        {timeResult && (
                            <button
                                onClick={() => { setTimeResult(null); setTimeSearch(''); }}
                                style={{ padding: '8px 12px', borderRadius: 6, border: '1px solid #cbd5e1', background: '#fff', color: '#64748b', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}
                            >
                                {th ? 'ล้าง' : 'Clear'}
                            </button>
                        )}
                    </div>
                    {timeResult && (
                        <div style={{ marginTop: 10, padding: 10, background: '#f0f9ff', borderRadius: 6, fontSize: 12, color: '#0c4a6e' }}>
                            {timeResult.covering.length > 0 ? (
                                <div><b>✅ {th ? 'พบ' : 'Found'} {timeResult.covering.length} {th ? 'คลิปที่ครอบคลุมเวลานี้' : 'recording(s) covering this time'}</b> (highlight ในตาราง)</div>
                            ) : (
                                <div>
                                    <b>❌ {th ? 'ไม่มีคลิปครอบคลุมเวลานี้' : 'No recording covers this exact time'}</b>
                                    {(timeResult.nearestBefore || timeResult.nearestAfter) && (
                                        <div style={{ marginTop: 4, fontSize: 11 }}>
                                            {th ? 'คลิปที่ใกล้ที่สุด:' : 'Nearest:'}
                                            {timeResult.nearestBefore && <> · ก่อนหน้า: <b>{timeResult.nearestBefore.cameraName}</b> ({new Date(timeResult.nearestBefore.serverIngestStart).toLocaleString('th-TH')})</>}
                                            {timeResult.nearestAfter && <> · หลังจาก: <b>{timeResult.nearestAfter.cameraName}</b> ({new Date(timeResult.nearestAfter.serverIngestStart).toLocaleString('th-TH')})</>}
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    )}
                </div>

                {loading && <div>Loading…</div>}

                <div style={{ background: '#fff', borderRadius: 8, border: '1px solid #e5e7eb', overflow: 'hidden' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                        <thead>
                            <tr style={{ background: '#f9fafb', textAlign: 'left' }}>
                                <th style={{ ...th_, width: 36 }}>
                                    <input
                                        type="checkbox"
                                        checked={allSelected}
                                        onChange={toggleSelectAll}
                                        title={allSelected ? (th ? 'เลิกเลือกทั้งหมด' : 'Deselect all') : (th ? 'เลือกทั้งหมด' : 'Select all')}
                                    />
                                </th>
                                <th style={th_}>Camera</th>
                                <th style={th_}>Checkpoint</th>
                                <th style={th_}>{th ? 'เริ่ม' : 'Start'}</th>
                                <th style={th_}>{th ? 'ระยะเวลา' : 'Duration'}</th>
                                <th style={th_}>{th ? 'ขนาด' : 'Size'}</th>
                                <th style={th_}>Protocol</th>
                                <th style={th_}>Status</th>
                                <th style={th_}></th>
                            </tr>
                        </thead>
                        <tbody>
                            {items.map(r => {
                                const playbackUrl = getPlaybackUrl(r);
                                const isHighlighted = timeHighlightIds.has(r._id);
                                const isChecked = selected.has(r._id);
                                return (
                                <tr
                                    key={r._id}
                                    onDoubleClick={() => { if (playbackUrl) setPlaying(r); }}
                                    title={playbackUrl ? (th ? 'ดับเบิลคลิกเพื่อเปิดวิดีโอ' : 'Double click to play') : undefined}
                                    style={{
                                        borderTop: '1px solid #e5e7eb',
                                        cursor: playbackUrl ? 'pointer' : 'default',
                                        background: isHighlighted ? '#fef9c3' : (isChecked ? '#eff6ff' : 'transparent'),
                                    }}
                                >
                                    <td style={{ ...td_, width: 36 }} onClick={(e) => e.stopPropagation()}>
                                        <input
                                            type="checkbox"
                                            checked={isChecked}
                                            onChange={() => toggleSelect(r._id)}
                                            onClick={(e) => e.stopPropagation()}
                                        />
                                    </td>
                                    <td style={td_}>{r.cameraName}</td>
                                    <td style={td_}>{r.checkpointName || '—'}</td>
                                    <td style={td_}>{new Date(r.serverIngestStart).toLocaleString()}</td>
                                    <td style={td_}>
                                        {r.recordingStatus === 'recording' && (
                                            <span style={{ color: '#dc2626', marginRight: 4, fontSize: 10 }}>🔴 LIVE</span>
                                        )}
                                        {fmtDur(r.duration)}
                                    </td>
                                    <td style={td_}>
                                        {r.fileSizeEstimated && (
                                            <span title={th ? 'ขนาดประมาณการจากระยะเวลาไลฟ์ × bitrate มาตรฐาน' : 'Estimated from live duration × default bitrate'}
                                                style={{ color: '#f59e0b', marginRight: 2, fontWeight: 700 }}>~</span>
                                        )}
                                        {fmtSize(r.fileSize)}
                                    </td>
                                    <td style={td_}><span style={{ textTransform: 'uppercase', fontSize: 11 }}>{r.protocol}</span></td>
                                    <td style={td_}>
                                        <span style={{
                                            padding: '2px 8px', borderRadius: 10, fontSize: 11, fontWeight: 600, color: '#fff',
                                            background: r.recordingStatus === 'recording' ? '#dc2626'
                                                : r.recordingStatus === 'archived' ? '#16a34a'
                                                : r.recordingStatus === 'error' ? '#7f1d1d' : '#0ea5e9',
                                            ...(r.recordingStatus === 'recording' ? { animation: 'pulse-dot 1.2s ease-in-out infinite' } : {}),
                                        }}>{r.recordingStatus === 'recording' ? `● ${r.recordingStatus}` : r.recordingStatus}</span>
                                    </td>
                                    <td style={td_}>
                                        {playbackUrl && (
                                            <button onClick={() => setPlaying(r)} style={{ background: 'none', border: 'none', color: '#2563eb', cursor: 'pointer', fontSize: 12, marginRight: 8 }}>Play</button>
                                        )}
                                        {r.s3MasterManifestUrl && (
                                            <a href={r.s3MasterManifestUrl} target="_blank" rel="noreferrer" style={{ marginRight: 8, color: '#2563eb', fontSize: 12 }}>S3</a>
                                        )}
                                        <button onClick={() => openDelete('one', r._id)} style={{ background: 'none', border: 'none', color: '#dc2626', cursor: 'pointer', fontSize: 12 }}>Delete</button>
                                    </td>
                                </tr>
                                );
                            })}
                            {items.length === 0 && !loading && (
                                <tr><td colSpan={9} style={{ ...td_, textAlign: 'center', color: '#6b7280', padding: 30 }}>
                                    {th ? 'ยังไม่มีการบันทึก' : 'No recordings yet.'}
                                </td></tr>
                            )}
                        </tbody>
                    </table>
                </div>

                {playing && (() => {
                    const url = getPlaybackUrl(playing);
                    const isS3 = !!playing.s3MasterManifestUrl && url === playing.s3MasterManifestUrl;
                    const handleClose = () => {
                        if (document.fullscreenElement) {
                            document.exitFullscreen?.().catch(() => { /* ignore */ });
                        }
                        setPlaying(null);
                    };
                    return (
                        <div
                            ref={playerWrapperRef}
                            onClick={handleClose}
                            style={{ position: 'fixed', inset: 0, zIndex: 1000, background: '#000', display: 'flex', flexDirection: 'column' }}
                        >
                            {/* Close button — top-right, always visible */}
                            <button
                                onClick={(e) => { e.stopPropagation(); handleClose(); }}
                                aria-label="Close"
                                title={th ? 'ปิด (Esc)' : 'Close (Esc)'}
                                style={{
                                    position: 'absolute', top: 16, right: 16, zIndex: 20,
                                    width: 44, height: 44, borderRadius: '50%',
                                    background: 'rgba(0,0,0,0.6)', color: '#fff',
                                    border: '2px solid rgba(255,255,255,0.4)',
                                    fontSize: 22, fontWeight: 700, cursor: 'pointer',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    transition: 'all 0.15s',
                                }}
                                onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = '#dc2626'; (e.currentTarget as HTMLButtonElement).style.borderColor = '#dc2626'; }}
                                onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(0,0,0,0.6)'; (e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(255,255,255,0.4)'; }}
                            >
                                ✕
                            </button>

                            {/* Title bar — top-left under timestamp overlay */}
                            <div
                                onClick={e => e.stopPropagation()}
                                style={{ position: 'absolute', top: 16, left: showTimestampOverlay ? 240 : 16, zIndex: 15, color: '#fff', fontSize: 13, padding: '6px 12px', background: 'rgba(0,0,0,0.5)', borderRadius: 6, maxWidth: 'calc(100% - 320px)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                            >
                                <strong>{playing.cameraName}</strong>
                                {playing.checkpointName && <> · 📍 {playing.checkpointName}</>}
                                <span style={{ marginLeft: 10, padding: '2px 8px', borderRadius: 6, background: isS3 ? '#16a34a' : '#0ea5e9', fontSize: 10, fontWeight: 700 }}>
                                    {isS3 ? 'S3 ARCHIVE' : 'EC2 HOT'}
                                </span>
                            </div>

                            <div onClick={e => e.stopPropagation()} style={{ flex: 1, minHeight: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                {url ? (
                                    <HlsPlayer
                                        key={url}
                                        src={url}
                                        showTimestamp={showTimestampOverlay}
                                        allowDownload={allowDownload}
                                        className="w-full h-full object-contain"
                                    />
                                ) : (
                                    <div style={{ color: '#fecaca', textAlign: 'center', fontSize: 14 }}>
                                        {th ? 'ไม่มี playback URL สำหรับการบันทึกนี้' : 'No playback URL available'}
                                    </div>
                                )}
                            </div>

                            {/* Debug strip at bottom */}
                            <div onClick={e => e.stopPropagation()} style={{ background: 'rgba(0,0,0,0.7)', padding: '10px 16px', color: '#cbd5e1', fontSize: 11 }}>
                                <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
                                    <span style={{ fontWeight: 700, color: '#fff' }}>URL:</span>
                                    <span style={{ fontFamily: 'monospace', wordBreak: 'break-all', flex: 1, minWidth: 200 }}>{url || '(no URL)'}</span>
                                    {url && (
                                        <a href={url} target="_blank" rel="noreferrer" style={{ color: '#60a5fa', textDecoration: 'underline', whiteSpace: 'nowrap' }}>
                                            🔗 {th ? 'เปิดในแท็บใหม่' : 'Open in new tab'}
                                        </a>
                                    )}
                                </div>
                            </div>
                        </div>
                    );
                })()}

                {/* Delete confirmation modal */}
                {deleteMode && (
                    <div style={{ position: 'fixed', inset: 0, zIndex: 1100, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
                        <div style={{ background: '#fff', borderRadius: 16, padding: 24, width: '100%', maxWidth: 400, boxShadow: '0 25px 50px rgba(0,0,0,0.25)' }}>
                            <div style={{ textAlign: 'center', marginBottom: 16 }}>
                                <div style={{ fontSize: 36, marginBottom: 8 }}>🗑️</div>
                                <h3 style={{ margin: 0, fontSize: 16, fontWeight: 800, color: '#0f172a' }}>
                                    {deleteMode === 'all'
                                        ? (th ? `ลบทั้งหมด ${items.length} ไฟล์?` : `Delete all ${items.length} recordings?`)
                                        : deleteMode === 'selected'
                                        ? (th ? `ลบที่เลือก ${selected.size} ไฟล์?` : `Delete ${selected.size} selected?`)
                                        : (th ? 'ลบการบันทึกนี้?' : 'Delete this recording?')}
                                </h3>
                                <p style={{ fontSize: 12, color: '#64748b', marginTop: 4 }}>
                                    {th ? 'การลบจะลบเฉพาะ metadata ใน DB เท่านั้น ไฟล์บน S3/EC2 จะถูก prune ตาม lifecycle' : 'Only deletes DB metadata. S3/EC2 files are pruned by lifecycle.'}
                                </p>
                            </div>
                            <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#64748b', marginBottom: 6, textTransform: 'uppercase' }}>
                                {th ? 'พิมพ์ "ยืนยัน" เพื่อยืนยัน' : 'Type "ยืนยัน" to confirm'}
                            </label>
                            <input
                                value={confirmText}
                                onChange={(e) => setConfirmText(e.target.value)}
                                autoFocus
                                style={{
                                    width: '100%', padding: '10px 12px', borderRadius: 8,
                                    border: confirmText === 'ยืนยัน' ? '2px solid #dc2626' : '1.5px solid #cbd5e1',
                                    fontSize: 14, outline: 'none', boxSizing: 'border-box',
                                }}
                            />
                            <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
                                <button
                                    onClick={() => { setDeleteMode(null); setConfirmText(''); }}
                                    disabled={deleting}
                                    style={{ flex: 1, padding: '10px 0', borderRadius: 8, border: '1px solid #cbd5e1', background: '#fff', color: '#64748b', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}
                                >
                                    {th ? 'ยกเลิก' : 'Cancel'}
                                </button>
                                <button
                                    onClick={handleConfirmedDelete}
                                    disabled={deleting || confirmText !== 'ยืนยัน'}
                                    style={{
                                        flex: 1, padding: '10px 0', borderRadius: 8, border: 'none',
                                        background: confirmText === 'ยืนยัน' ? '#dc2626' : '#cbd5e1',
                                        color: '#fff', fontWeight: 700, fontSize: 13,
                                        cursor: deleting ? 'wait' : (confirmText === 'ยืนยัน' ? 'pointer' : 'not-allowed'),
                                    }}
                                >
                                    {deleting ? (th ? 'กำลังลบ...' : 'Deleting...') : (th ? 'ยืนยันลบ' : 'Confirm Delete')}
                                </button>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </AdminLayout>
    );
}

const th_: React.CSSProperties = { padding: '10px 12px', fontWeight: 600, fontSize: 12, color: '#374151', textTransform: 'uppercase' };
const td_: React.CSSProperties = { padding: '10px 12px' };
