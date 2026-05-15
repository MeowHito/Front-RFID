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
    interface Window { Hls?: { isSupported: () => boolean; new (options: { liveSyncDuration: number; lowLatencyMode: boolean }): { loadSource: (src: string) => void; attachMedia: (video: HTMLVideoElement) => void; on: (event: string, handler: (_e: unknown, data: { fatal?: boolean; type?: string }) => void) => void; destroy: () => void; }; Events: { ERROR: string } }; }
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
        <div style={{ background: '#020617', borderRadius: 8, overflow: 'hidden', position: 'relative', width: '100%' }}>
            <video ref={videoRef} controls autoPlay muted playsInline style={{ width: '100%', maxHeight: 'clamp(150px, 28vh, 240px)', display: 'block', aspectRatio: '16/9', objectFit: 'contain', background: '#020617' }} />
            <div style={{ position: 'absolute', bottom: 6, left: 6, right: 6, background: 'rgba(0,0,0,0.62)', color: '#fff', padding: '2px 8px', fontSize: 11, borderRadius: 4, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
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

    useEffect(() => {
        const t = setInterval(load, 15000);
        setTimeout(load, 0);
        return () => clearInterval(t);
    }, [load]);

    const live = cameras.filter(c => c.status === 'publishing');
    const oneCamera = cameras.length <= 1;

    return (
        <AdminLayout>
            <div style={{ padding: 'clamp(10px, 2vw, 20px)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12, flexWrap: 'wrap' }}>
                    <h1 style={{ margin: 0, fontSize: 'clamp(17px, 2vw, 22px)', fontWeight: 700 }}>{th ? 'ดูสด (Larix Beta)' : 'Live Feeds (Larix Beta)'}</h1>
                    <span style={{ background: '#f59e0b', color: '#fff', padding: '2px 10px', borderRadius: 12, fontSize: 11, fontWeight: 700 }}>BETA</span>
                    <span style={{ marginLeft: 'auto', fontSize: 12, color: '#6b7280', minWidth: 'fit-content' }}>
                        {th ? `${live.length}/${cameras.length} กล้อง ออนไลน์` : `${live.length}/${cameras.length} cameras online`}
                    </span>
                </div>

                {cameras.length === 0 && (
                    <div style={{ padding: 40, textAlign: 'center', background: '#fff', borderRadius: 8, color: '#6b7280' }}>
                        {th ? 'ยังไม่มีกล้องสำหรับแคมเปญนี้' : 'No cameras for this campaign yet.'}
                    </div>
                )}

                <div style={{ minHeight: 'clamp(360px, calc(100dvh - 180px), 760px)', border: '1px solid #d1d5db', background: '#eef2f7', padding: 'clamp(10px, 1.5vw, 18px)', overflow: 'auto' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: oneCamera ? 'minmax(260px, 360px)' : 'repeat(auto-fill, minmax(min(100%, 260px), 1fr))', gap: oneCamera ? 12 : 'clamp(18px, 3vw, 36px)', justifyContent: 'start', alignItems: 'start', maxWidth: oneCamera ? 380 : 1180 }}>
                        {cameras.map(cam => (
                            <div key={cam._id} style={{ background: '#fff', padding: 8, borderRadius: 10, border: '1px solid #e5e7eb', boxShadow: '0 1px 2px rgba(15, 23, 42, 0.05)', width: '100%' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                                    <strong style={{ fontSize: 13, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{cam.name}</strong>
                                    <span style={{ fontSize: 11, color: cam.status === 'publishing' ? '#16a34a' : '#9ca3af', flexShrink: 0 }}>
                                        ● {cam.status}
                                    </span>
                                </div>
                                {cam.status === 'publishing' && cam.hlsUrl ? (
                                    <HlsPlayer src={cam.hlsUrl} label={cam.checkpointName || cam.name} />
                                ) : (
                                    <div style={{ background: '#111827', color: '#6b7280', aspectRatio: '16/9', maxHeight: 'clamp(150px, 28vh, 240px)', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 8, fontSize: 12, textAlign: 'center', padding: 10 }}>
                                        {th ? 'ออฟไลน์ — รอ Larix push' : 'Offline — waiting for Larix push'}
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </AdminLayout>
    );
}
