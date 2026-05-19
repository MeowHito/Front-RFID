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
 * Pick the best playback URL for a Beta recording.
 * Priority: S3 archive (cold, durable) → EC2 hot HLS manifest.
 *
 * `hlsManifestPath` may be a relative path like `/hls/{streamKey}/index.m3u8` from
 * the ingest webhook — prepend the playback host so the browser can fetch it.
 */
function getPlaybackUrl(recording: BetaRecording): string {
    if (recording.s3MasterManifestUrl) return recording.s3MasterManifestUrl;
    if (!recording.hlsManifestPath) return '';
    if (recording.hlsManifestPath.startsWith('http')) return recording.hlsManifestPath;
    // NEXT_PUBLIC_CCTV_BETA_PLAYBACK_HOST is set in frontend .env.local
    const host = (process.env.NEXT_PUBLIC_CCTV_BETA_PLAYBACK_HOST || '').replace(/^https?:\/\//, '').replace(/\/$/, '');
    if (!host) return recording.hlsManifestPath; // relative — will fail unless served from same origin
    const p = recording.hlsManifestPath.startsWith('/') ? recording.hlsManifestPath : `/${recording.hlsManifestPath}`;
    return `https://${host}${p}`;
}

export default function CctvBetaRecordingsPage() {
    const { language } = useLanguage();
    const th = language === 'th';
    const [selectedCampaign, setSelectedCampaign] = useState('');
    const [items, setItems] = useState<BetaRecording[]>([]);
    const [loading, setLoading] = useState(false);
    const [playing, setPlaying] = useState<BetaRecording | null>(null);
    // Shared CCTV settings — apply to Beta too (allowDownload + showTimestampOverlay)
    const [allowDownload, setAllowDownload] = useState(true);
    const [showTimestampOverlay, setShowTimestampOverlay] = useState(true);
    const playerWrapperRef = useRef<HTMLDivElement | null>(null);

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
        } finally { setLoading(false); }
    }, [selectedCampaign]);

    useEffect(() => { setTimeout(load, 0); }, [load]);

    const handleDelete = async (id: string) => {
        if (!confirm(th ? 'ลบการบันทึก?' : 'Delete recording?')) return;
        await fetch(`/api/cctv-beta/recordings/${id}`, { method: 'DELETE', headers: authHeaders() });
        load();
    };

    return (
        <AdminLayout>
            <div style={{ padding: 24 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
                    <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700 }}>{th ? 'การบันทึก (Larix Beta)' : 'Recordings (Larix Beta)'}</h1>
                    <span style={{ background: '#f59e0b', color: '#fff', padding: '2px 10px', borderRadius: 12, fontSize: 11, fontWeight: 700 }}>BETA</span>
                </div>

                {loading && <div>Loading…</div>}

                <div style={{ background: '#fff', borderRadius: 8, border: '1px solid #e5e7eb', overflow: 'hidden' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                        <thead>
                            <tr style={{ background: '#f9fafb', textAlign: 'left' }}>
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
                                return (
                                <tr key={r._id} onDoubleClick={() => { if (playbackUrl) setPlaying(r); }} title={playbackUrl ? (th ? 'ดับเบิลคลิกเพื่อเปิดวิดีโอ' : 'Double click to play') : undefined} style={{ borderTop: '1px solid #e5e7eb', cursor: playbackUrl ? 'pointer' : 'default' }}>
                                    <td style={td_}>{r.cameraName}</td>
                                    <td style={td_}>{r.checkpointName || '—'}</td>
                                    <td style={td_}>{new Date(r.serverIngestStart).toLocaleString()}</td>
                                    <td style={td_}>{fmtDur(r.duration)}</td>
                                    <td style={td_}>{fmtSize(r.fileSize)}</td>
                                    <td style={td_}><span style={{ textTransform: 'uppercase', fontSize: 11 }}>{r.protocol}</span></td>
                                    <td style={td_}>
                                        <span style={{
                                            padding: '2px 8px', borderRadius: 10, fontSize: 11, fontWeight: 600, color: '#fff',
                                            background: r.recordingStatus === 'recording' ? '#dc2626'
                                                : r.recordingStatus === 'archived' ? '#16a34a'
                                                : r.recordingStatus === 'error' ? '#7f1d1d' : '#0ea5e9',
                                        }}>{r.recordingStatus}</span>
                                    </td>
                                    <td style={td_}>
                                        {playbackUrl && (
                                            <button onClick={() => setPlaying(r)} style={{ background: 'none', border: 'none', color: '#2563eb', cursor: 'pointer', fontSize: 12, marginRight: 8 }}>Play</button>
                                        )}
                                        {r.s3MasterManifestUrl && (
                                            <a href={r.s3MasterManifestUrl} target="_blank" rel="noreferrer" style={{ marginRight: 8, color: '#2563eb', fontSize: 12 }}>S3</a>
                                        )}
                                        <button onClick={() => handleDelete(r._id)} style={{ background: 'none', border: 'none', color: '#dc2626', cursor: 'pointer', fontSize: 12 }}>Delete</button>
                                    </td>
                                </tr>
                                );
                            })}
                            {items.length === 0 && !loading && (
                                <tr><td colSpan={8} style={{ ...td_, textAlign: 'center', color: '#6b7280', padding: 30 }}>
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
            </div>
        </AdminLayout>
    );
}

const th_: React.CSSProperties = { padding: '10px 12px', fontWeight: 600, fontSize: 12, color: '#374151', textTransform: 'uppercase' };
const td_: React.CSSProperties = { padding: '10px 12px' };
