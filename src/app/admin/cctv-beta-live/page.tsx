'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import AdminLayout from '../AdminLayout';
import { useLanguage } from '@/lib/language-context';

interface BetaCamera {
    _id: string;
    name: string;
    checkpointName?: string;
    hlsUrl: string;
    status: 'online' | 'offline' | 'publishing';
    streamKey: string;
}

interface HlsInstance {
    loadSource: (src: string) => void;
    attachMedia: (video: HTMLVideoElement) => void;
    on: (event: string, handler: (_e: unknown, data: { fatal?: boolean; type?: string }) => void) => void;
    destroy: () => void;
    startLoad?: () => void;
}

declare global {
    interface Window { Hls?: { isSupported: () => boolean; new (options: { liveSyncDuration: number; lowLatencyMode: boolean }): HlsInstance; Events: { ERROR: string; MANIFEST_PARSED: string }; ErrorTypes?: { NETWORK_ERROR: string; MEDIA_ERROR: string } }; }
}

function HlsPlayer({ src, label }: { src: string; label: string }) {
    const videoRef = useRef<HTMLVideoElement>(null);
    const [err, setErr] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => { const t = setTimeout(() => { setErr(null); setLoading(true); }, 0); return () => clearTimeout(t); }, [src]);

    useEffect(() => {
        const video = videoRef.current;
        if (!video || !src) return;

        const onPlaying = () => { setLoading(false); setErr(null); };
        video.addEventListener('playing', onPlaying);

        // Native HLS (Safari, iOS)
        if (video.canPlayType('application/vnd.apple.mpegurl')) {
            video.src = src;
            video.play().catch(() => {});
            return () => { video.removeEventListener('playing', onPlaying); };
        }

        let hls: HlsInstance | null = null;
        let cancelled = false;
        const loadHls = async () => {
            if (!window.Hls) {
                await new Promise<void>((resolve, reject) => {
                    const existing = document.querySelector<HTMLScriptElement>('script[data-hls-loader="1"]');
                    if (existing) {
                        if (window.Hls) { resolve(); return; }
                        existing.addEventListener('load', () => resolve());
                        existing.addEventListener('error', () => reject(new Error('hls.js load failed')));
                        return;
                    }
                    const s = document.createElement('script');
                    s.src = 'https://cdn.jsdelivr.net/npm/hls.js@1.5.15/dist/hls.min.js';
                    s.async = true;
                    s.dataset.hlsLoader = '1';
                    s.onload = () => resolve();
                    s.onerror = () => reject(new Error('hls.js load failed'));
                    document.head.appendChild(s);
                });
            }
            const Hls = window.Hls;
            if (cancelled) return;
            if (!Hls || !Hls.isSupported()) {
                setErr('HLS not supported');
                setLoading(false);
                return;
            }
            hls = new Hls({ liveSyncDuration: 2, lowLatencyMode: true });
            hls.loadSource(src);
            hls.attachMedia(video);
            hls.on(Hls.Events.MANIFEST_PARSED, () => { video.play().catch(() => {}); });
            hls.on(Hls.Events.ERROR, (_e: unknown, data: { fatal?: boolean; type?: string }) => {
                if (data.fatal) { setErr(`HLS error: ${data.type}`); setLoading(false); }
            });
        };
        loadHls().catch(e => { setErr(e instanceof Error ? e.message : 'Playback error'); setLoading(false); });
        return () => {
            cancelled = true;
            video.removeEventListener('playing', onPlaying);
            try { hls?.destroy(); } catch { /* ignore */ }
        };
    }, [src]);

    return (
        <div style={{ background: '#000', borderRadius: 6, overflow: 'hidden', position: 'relative' }}>
            <video ref={videoRef} controls autoPlay muted playsInline style={{ width: '100%', display: 'block', aspectRatio: '16/9', background: '#000' }} />
            {loading && !err && (
                <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94a3b8', fontSize: 12, pointerEvents: 'none' }}>
                    กำลังเชื่อมต่อ live…
                </div>
            )}
            {err && (
                <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: '#fca5a5', fontSize: 12, background: 'rgba(0,0,0,0.55)', textAlign: 'center', padding: 8 }}>
                    <div style={{ fontSize: 22, marginBottom: 4 }}>⚠️</div>
                    <div>{err}</div>
                </div>
            )}
            <div style={{ position: 'absolute', bottom: 6, left: 6, background: 'rgba(0,0,0,0.7)', color: '#fff', padding: '2px 8px', fontSize: 11, borderRadius: 4 }}>
                {label}
            </div>
        </div>
    );
}

export default function CctvBetaLivePage() {
    const { language } = useLanguage();
    const th = language === 'th';
    const [selectedCampaign, setSelectedCampaign] = useState('');
    const [cameras, setCameras] = useState<BetaCamera[]>([]);

    useEffect(() => {
        fetch('/api/campaigns/featured', { cache: 'no-store' })
            .then(r => r.json())
            .then(d => { if (d?._id) setSelectedCampaign(d._id); }).catch(() => {});
    }, []);

    const load = useCallback(async () => {
        if (!selectedCampaign) return;
        const res = await fetch(`/api/cctv-beta/cameras?campaignId=${selectedCampaign}`, { cache: 'no-store' });
        const data = await res.json();
        setCameras(Array.isArray(data) ? data : []);
    }, [selectedCampaign]);

    useEffect(() => {
        const t = setInterval(load, 15000);
        setTimeout(load, 0);
        return () => clearInterval(t);
    }, [load]);

    const live = cameras.filter(c => c.status === 'publishing');

    return (
        <AdminLayout>
            <div style={{ padding: 24 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
                    <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700 }}>{th ? 'ดูสด (Larix Beta)' : 'Live Feeds (Larix Beta)'}</h1>
                    <span style={{ background: '#f59e0b', color: '#fff', padding: '2px 10px', borderRadius: 12, fontSize: 11, fontWeight: 700 }}>BETA</span>
                    <span style={{ marginLeft: 'auto', fontSize: 12, color: '#6b7280' }}>
                        {th ? `${live.length}/${cameras.length} กล้อง ออนไลน์` : `${live.length}/${cameras.length} cameras online`}
                    </span>
                </div>

                {cameras.length === 0 && (
                    <div style={{ padding: 40, textAlign: 'center', background: '#fff', borderRadius: 8, color: '#6b7280' }}>
                        {th ? 'ยังไม่มีกล้องสำหรับแคมเปญนี้' : 'No cameras for this campaign yet.'}
                    </div>
                )}

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: 12 }}>
                    {cameras.map(cam => (
                        <div key={cam._id} style={{ background: '#fff', padding: 10, borderRadius: 8, border: '1px solid #e5e7eb' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                                <strong style={{ fontSize: 14 }}>{cam.name}</strong>
                                <span style={{ fontSize: 11, color: cam.status === 'publishing' ? '#16a34a' : '#9ca3af' }}>
                                    ● {cam.status}
                                </span>
                            </div>
                            {cam.status === 'publishing' && cam.hlsUrl ? (
                                <HlsPlayer src={cam.hlsUrl} label={cam.checkpointName || cam.name} />
                            ) : (
                                <div style={{ background: '#111827', color: '#6b7280', aspectRatio: '16/9', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 6, fontSize: 12 }}>
                                    {th ? 'ออฟไลน์ — รอ Larix push' : 'Offline — waiting for Larix push'}
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            </div>
        </AdminLayout>
    );
}
