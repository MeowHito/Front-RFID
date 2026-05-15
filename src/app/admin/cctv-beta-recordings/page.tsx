'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import AdminLayout from '../AdminLayout';
import { useLanguage } from '@/lib/language-context';

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

declare global {
    interface Window { Hls?: { isSupported: () => boolean; new (options: { liveSyncDuration: number; lowLatencyMode: boolean }): HlsInstance; Events: { ERROR: string } }; }
}

interface HlsInstance {
    loadSource: (src: string) => void;
    attachMedia: (video: HTMLVideoElement) => void;
    on: (event: string, handler: (_e: unknown, data: { fatal?: boolean; type?: string }) => void) => void;
    destroy: () => void;
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

function getPlaybackUrl(recording: BetaRecording) {
    if (recording.s3MasterManifestUrl) return recording.s3MasterManifestUrl;
    if (!recording.hlsManifestPath) return '';
    if (recording.hlsManifestPath.startsWith('http')) return recording.hlsManifestPath;
    return recording.hlsManifestPath;
}

function HlsPlayer({ src }: { src: string }) {
    const videoRef = useRef<HTMLVideoElement>(null);
    const [err, setErr] = useState<string | null>(null);

    useEffect(() => { setTimeout(() => setErr(null), 0); }, [src]);

    useEffect(() => {
        const video = videoRef.current;
        if (!video || !src) return;

        if (video.canPlayType('application/vnd.apple.mpegurl')) {
            video.src = src;
            return;
        }

        let hls: HlsInstance | null = null;
        let cancelled = false;
        const loadHls = async () => {
            if (!window.Hls) {
                await new Promise<void>((resolve, reject) => {
                    const s = document.createElement('script');
                    s.src = 'https://cdn.jsdelivr.net/npm/hls.js@1.5.15/dist/hls.min.js';
                    s.onload = () => resolve();
                    s.onerror = () => reject(new Error('hls.js load failed'));
                    document.head.appendChild(s);
                });
            }
            const Hls = window.Hls;
            if (cancelled) return;
            if (!Hls || !Hls.isSupported()) {
                setErr('HLS not supported');
                return;
            }
            hls = new Hls({ liveSyncDuration: 4, lowLatencyMode: false });
            hls.loadSource(src);
            hls.attachMedia(video);
            hls.on(Hls.Events.ERROR, (_e: unknown, data: { fatal?: boolean; type?: string }) => {
                if (data.fatal) setErr(`HLS error: ${data.type}`);
            });
        };
        loadHls().catch(e => setErr(e instanceof Error ? e.message : 'Playback error'));
        return () => { cancelled = true; hls?.destroy(); };
    }, [src]);

    return (
        <div style={{ width: '100%' }}>
            <video ref={videoRef} controls autoPlay playsInline style={{ width: '100%', maxHeight: 'calc(100dvh - 150px)', background: '#000', borderRadius: 8 }} />
            {err && <div style={{ color: '#fecaca', fontSize: 12, marginTop: 8 }}>{err}</div>}
        </div>
    );
}

export default function CctvBetaRecordingsPage() {
    const { language } = useLanguage();
    const th = language === 'th';
    const [selectedCampaign, setSelectedCampaign] = useState('');
    const [items, setItems] = useState<BetaRecording[]>([]);
    const [loading, setLoading] = useState(false);
    const [playing, setPlaying] = useState<BetaRecording | null>(null);

    useEffect(() => {
        fetch('/api/campaigns/featured', { cache: 'no-store' })
            .then(r => r.json())
            .then(d => { if (d?._id) setSelectedCampaign(d._id); }).catch(() => {});
    }, []);

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

                {playing && (
                    <div onClick={() => setPlaying(null)} style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,0.86)', display: 'flex', flexDirection: 'column', padding: 16 }}>
                        <div onClick={e => e.stopPropagation()} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', color: '#fff', marginBottom: 12, gap: 12 }}>
                            <div style={{ fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{playing.cameraName} — {new Date(playing.serverIngestStart).toLocaleString()}</div>
                            <button onClick={() => setPlaying(null)} style={{ background: 'transparent', border: 'none', color: '#fff', fontSize: 26, cursor: 'pointer' }}>×</button>
                        </div>
                        <div onClick={e => e.stopPropagation()} style={{ flex: 1, minHeight: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <HlsPlayer src={getPlaybackUrl(playing)} />
                        </div>
                    </div>
                )}
            </div>
        </AdminLayout>
    );
}

const th_: React.CSSProperties = { padding: '10px 12px', fontWeight: 600, fontSize: 12, color: '#374151', textTransform: 'uppercase' };
const td_: React.CSSProperties = { padding: '10px 12px' };
