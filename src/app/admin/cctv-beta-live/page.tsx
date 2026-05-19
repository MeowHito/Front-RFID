'use client';

import { useState, useEffect, useCallback } from 'react';
import AdminLayout from '../AdminLayout';
import { useLanguage } from '@/lib/language-context';
import SharedHlsPlayer from '@/components/HlsPlayer';

interface BetaCamera {
    _id: string;
    name: string;
    checkpointName?: string;
    hlsUrl: string;
    status: 'online' | 'offline' | 'publishing';
    streamKey: string;
}

/**
 * Resolve the live HLS playback URL for a Beta camera.
 *
 * The backend stores `hlsUrl` as a full URL when CCTV_BETA_PLAYBACK_HOST is configured,
 * but may store a relative path (`/hls/{streamKey}/index.m3u8`) otherwise. If the URL
 * doesn't have a scheme, prepend the playback host from a public env var so the browser
 * can fetch it.
 */
function resolveHlsUrl(cam: BetaCamera): string {
    if (!cam.hlsUrl) return '';
    if (/^https?:\/\//.test(cam.hlsUrl)) return cam.hlsUrl;
    const host = (process.env.NEXT_PUBLIC_CCTV_BETA_PLAYBACK_HOST || '')
        .replace(/^https?:\/\//, '')
        .replace(/\/$/, '');
    if (!host) return cam.hlsUrl;
    const p = cam.hlsUrl.startsWith('/') ? cam.hlsUrl : `/${cam.hlsUrl}`;
    return `https://${host}${p}`;
}

/**
 * Per-camera tile with live HLS playback + click-to-debug URL.
 *
 * If the video stays black, click "Show URL" → open in a new tab to verify the
 * manifest is reachable from the browser. Common failures:
 *   - The playback host has no TLS cert or returns CORS-blocked headers
 *   - MediaMTX HLS muxer is disabled in mediamtx.yml
 *   - The phone isn't actually publishing yet (status should be `publishing`)
 */
function CameraTile({ cam, th }: { cam: BetaCamera; th: boolean }) {
    const [showUrl, setShowUrl] = useState(false);
    const url = resolveHlsUrl(cam);

    return (
        <div style={{ background: '#fff', padding: 10, borderRadius: 8, border: '1px solid #e5e7eb' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                <strong style={{ fontSize: 14 }}>{cam.name}</strong>
                <span style={{ fontSize: 11, color: cam.status === 'publishing' ? '#16a34a' : '#9ca3af' }}>
                    ● {cam.status}
                </span>
            </div>

            {cam.status === 'publishing' && url ? (
                <div style={{ background: '#000', borderRadius: 6, overflow: 'hidden', position: 'relative' }}>
                    <SharedHlsPlayer
                        key={url}
                        src={url}
                        className="w-full block bg-black"
                    />
                    <div style={{ position: 'absolute', bottom: 6, left: 6, background: 'rgba(0,0,0,0.7)', color: '#fff', padding: '2px 8px', fontSize: 11, borderRadius: 4 }}>
                        {cam.checkpointName || cam.name}
                    </div>
                </div>
            ) : (
                <div style={{ background: '#111827', color: '#6b7280', aspectRatio: '16/9', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 6, fontSize: 12 }}>
                    {th ? 'ออฟไลน์ — รอ Larix push' : 'Offline — waiting for Larix push'}
                </div>
            )}

            {/* Debug strip — click to inspect the manifest URL */}
            <div style={{ marginTop: 6 }}>
                <button
                    onClick={() => setShowUrl((v) => !v)}
                    style={{
                        fontSize: 10, color: '#64748b', background: 'transparent',
                        border: 'none', cursor: 'pointer', padding: 0,
                    }}
                >
                    {showUrl ? '▾' : '▸'} {th ? 'แสดง URL' : 'Show URL'}
                </button>
                {showUrl && (
                    <div style={{ marginTop: 4, padding: '6px 8px', background: '#f8fafc', borderRadius: 4, fontSize: 10, fontFamily: 'monospace', wordBreak: 'break-all', color: '#475569', border: '1px solid #e2e8f0' }}>
                        {url || <em style={{ color: '#94a3b8' }}>(no playback URL)</em>}
                        {url && (
                            <div style={{ marginTop: 4 }}>
                                <a href={url} target="_blank" rel="noreferrer" style={{ color: '#0ea5e9' }}>
                                    🔗 {th ? 'เปิดในแท็บใหม่' : 'Open in new tab'}
                                </a>
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}

export default function CctvBetaLivePage() {
    const { language } = useLanguage();
    const th = language === 'th';
    const [selectedCampaign, setSelectedCampaign] = useState('');
    const [cameras, setCameras] = useState<BetaCamera[]>([]);
    const [lastRefresh, setLastRefresh] = useState<Date | null>(null);
    const [refreshing, setRefreshing] = useState(false);
    // Auto-refresh toggle — defaults ON so the grid updates as cameras come online
    const [autoRefresh, setAutoRefresh] = useState(true);

    useEffect(() => {
        fetch('/api/campaigns/featured', { cache: 'no-store' })
            .then(r => r.json())
            .then(d => { if (d?._id) setSelectedCampaign(d._id); }).catch(() => {});
    }, []);

    const load = useCallback(async () => {
        if (!selectedCampaign) return;
        setRefreshing(true);
        try {
            const res = await fetch(`/api/cctv-beta/cameras?campaignId=${selectedCampaign}`, { cache: 'no-store' });
            const data = await res.json();
            setCameras(Array.isArray(data) ? data : []);
            setLastRefresh(new Date());
        } finally {
            setRefreshing(false);
        }
    }, [selectedCampaign]);

    // Poll every 5s by default — Beta doesn't have a WebSocket for live events,
    // so we ping the camera-list endpoint to catch status transitions
    // (offline → publishing → offline). 5s is a good balance between responsiveness
    // and load on /api/cctv-beta/cameras.
    useEffect(() => {
        if (!selectedCampaign) return;
        setTimeout(load, 0);
        if (!autoRefresh) return;
        const t = setInterval(load, 5000);
        return () => clearInterval(t);
    }, [load, autoRefresh, selectedCampaign]);

    const live = cameras.filter(c => c.status === 'publishing');

    return (
        <AdminLayout>
            <div style={{ padding: 24 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
                    <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700 }}>{th ? 'ดูสด (Larix Beta)' : 'Live Feeds (Larix Beta)'}</h1>
                    <span style={{ background: '#f59e0b', color: '#fff', padding: '2px 10px', borderRadius: 12, fontSize: 11, fontWeight: 700 }}>BETA</span>
                    <span style={{ fontSize: 12, color: '#6b7280' }}>
                        {th ? `${live.length}/${cameras.length} กล้อง ออนไลน์` : `${live.length}/${cameras.length} cameras online`}
                    </span>

                    {/* Auto-refresh controls — pushed to the right side */}
                    <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 10 }}>
                        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#374151', cursor: 'pointer' }}>
                            <input
                                type="checkbox"
                                checked={autoRefresh}
                                onChange={(e) => setAutoRefresh(e.target.checked)}
                            />
                            {th ? 'Auto-refresh (5s)' : 'Auto-refresh (5s)'}
                        </label>
                        <button
                            onClick={load}
                            disabled={refreshing}
                            style={{
                                padding: '6px 12px', borderRadius: 6, border: '1px solid #cbd5e1',
                                background: refreshing ? '#f1f5f9' : '#fff', color: '#0f172a',
                                fontSize: 12, fontWeight: 700, cursor: refreshing ? 'wait' : 'pointer',
                            }}
                        >
                            {refreshing ? '⏳' : '🔄'} {th ? 'รีเฟรช' : 'Refresh'}
                        </button>
                        {lastRefresh && (
                            <span style={{ fontSize: 11, color: '#94a3b8', fontFamily: 'monospace' }}>
                                {th ? 'อัพเดตล่าสุด:' : 'Last:'} {lastRefresh.toLocaleTimeString('en-GB', { timeZone: 'Asia/Bangkok' })}
                            </span>
                        )}
                        {autoRefresh && (
                            <span style={{
                                width: 8, height: 8, borderRadius: '50%',
                                background: refreshing ? '#f59e0b' : '#22c55e',
                                animation: refreshing ? 'none' : 'pulse 2s infinite',
                            }} />
                        )}
                    </div>
                </div>
                <style>{`@keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.3; } }`}</style>

                {cameras.length === 0 && (
                    <div style={{ padding: 40, textAlign: 'center', background: '#fff', borderRadius: 8, color: '#6b7280' }}>
                        {th ? 'ยังไม่มีกล้องสำหรับแคมเปญนี้' : 'No cameras for this campaign yet.'}
                    </div>
                )}

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: 12 }}>
                    {cameras.map(cam => (
                        <CameraTile key={cam._id} cam={cam} th={th} />
                    ))}
                </div>
            </div>
        </AdminLayout>
    );
}
