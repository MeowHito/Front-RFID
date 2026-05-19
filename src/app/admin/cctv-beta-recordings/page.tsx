'use client';

import { useState, useEffect, useCallback } from 'react';
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

                {playing && (() => {
                    const url = getPlaybackUrl(playing);
                    const isS3 = !!playing.s3MasterManifestUrl && url === playing.s3MasterManifestUrl;
                    return (
                        <div onClick={() => setPlaying(null)} style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,0.86)', display: 'flex', flexDirection: 'column', padding: 16 }}>
                            <div onClick={e => e.stopPropagation()} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', color: '#fff', marginBottom: 12, gap: 12 }}>
                                <div style={{ fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                    {playing.cameraName} — {new Date(playing.serverIngestStart).toLocaleString()}
                                    <span style={{ marginLeft: 10, padding: '2px 8px', borderRadius: 6, background: isS3 ? '#16a34a' : '#0ea5e9', fontSize: 10, fontWeight: 700 }}>
                                        {isS3 ? 'S3 ARCHIVE' : 'EC2 HOT'}
                                    </span>
                                </div>
                                <button onClick={() => setPlaying(null)} style={{ background: 'transparent', border: 'none', color: '#fff', fontSize: 26, cursor: 'pointer' }}>×</button>
                            </div>

                            <div onClick={e => e.stopPropagation()} style={{ flex: 1, minHeight: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                {url ? (
                                    <HlsPlayer
                                        key={url}
                                        src={url}
                                        className="w-full"
                                    />
                                ) : (
                                    <div style={{ color: '#fecaca', textAlign: 'center', fontSize: 14 }}>
                                        {th ? 'ไม่มี playback URL สำหรับการบันทึกนี้' : 'No playback URL available'}
                                    </div>
                                )}
                            </div>

                            <div onClick={e => e.stopPropagation()} style={{ marginTop: 10, color: '#cbd5e1', fontSize: 11 }}>
                                <div style={{ marginBottom: 4, fontWeight: 700, color: '#fff' }}>{th ? 'ปัญหา? เปิด URL ตรงๆ เพื่อตรวจสอบ:' : 'Trouble? Open the URL directly to debug:'}</div>
                                <div style={{ wordBreak: 'break-all', padding: '6px 10px', background: 'rgba(255,255,255,0.05)', borderRadius: 4, fontFamily: 'monospace' }}>
                                    {url || '(no URL)'}
                                </div>
                                <div style={{ marginTop: 8, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                                    {url && (
                                        <a href={url} target="_blank" rel="noreferrer" style={{ color: '#60a5fa', textDecoration: 'underline' }}>
                                            🔗 {th ? 'เปิด URL ในแท็บใหม่' : 'Open URL in new tab'}
                                        </a>
                                    )}
                                    {playing.s3MasterManifestUrl && playing.hlsManifestPath && (
                                        <span style={{ color: '#94a3b8' }}>
                                            ({th ? 'มี EC2 hot URL ด้วย:' : 'EC2 hot also available:'} {playing.hlsManifestPath})
                                        </span>
                                    )}
                                </div>
                                {isS3 && (
                                    <div style={{ marginTop: 8, padding: 8, background: 'rgba(234,179,8,0.15)', border: '1px solid rgba(234,179,8,0.3)', borderRadius: 4, color: '#fde68a' }}>
                                        💡 {th
                                            ? 'ถ้าวิดีโอเปิดไม่ขึ้น แต่ลิงก์ S3 เปิดในแท็บใหม่ได้: S3 bucket ยังไม่ได้ตั้ง CORS ให้ origin นี้ — ต้องเพิ่ม CORS rule ใน S3 console'
                                            : 'If the video stays blank but the link opens in a new tab: the S3 bucket needs a CORS rule for this origin — add one in the S3 console.'}
                                    </div>
                                )}
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
