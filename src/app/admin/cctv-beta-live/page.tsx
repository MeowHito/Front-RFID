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

declare global {
    interface Window { Hls?: any; }
}

function HlsPlayer({ src, label }: { src: string; label: string }) {
    const videoRef = useRef<HTMLVideoElement>(null);
    const [err, setErr] = useState<string | null>(null);

    useEffect(() => {
        const video = videoRef.current;
        if (!video || !src) return;

        // Native HLS (Safari, iOS)
        if (video.canPlayType('application/vnd.apple.mpegurl')) {
            video.src = src;
            return;
        }

        // hls.js for others - load from CDN to avoid adding npm dep here
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
            if (!Hls || !Hls.isSupported()) {
                setErr('HLS not supported');
                return;
            }
            const hls = new Hls({ liveSyncDuration: 2, lowLatencyMode: true });
            hls.loadSource(src);
            hls.attachMedia(video);
            hls.on(Hls.Events.ERROR, (_e: unknown, data: { fatal?: boolean; type?: string }) => {
                if (data.fatal) setErr(`HLS error: ${data.type}`);
            });
            return () => hls.destroy();
        };
        const cleanup = loadHls();
        return () => { void cleanup; };
    }, [src]);

    return (
        <div style={{ background: '#000', borderRadius: 6, overflow: 'hidden', position: 'relative' }}>
            <video ref={videoRef} controls autoPlay muted playsInline style={{ width: '100%', display: 'block', aspectRatio: '16/9' }} />
            <div style={{ position: 'absolute', bottom: 6, left: 6, background: 'rgba(0,0,0,0.7)', color: '#fff', padding: '2px 8px', fontSize: 11, borderRadius: 4 }}>
                {label} {err && <span style={{ color: '#fca5a5' }}>· {err}</span>}
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

    useEffect(() => { load(); const t = setInterval(load, 15000); return () => clearInterval(t); }, [load]);

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
