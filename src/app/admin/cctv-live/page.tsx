'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useLanguage } from '@/lib/language-context';
import AdminLayout from '../AdminLayout';
import { io, Socket } from 'socket.io-client';

interface Campaign { _id: string; name: string; }

interface LiveCameraInfo {
    cameraId: string;
    socketId: string;
    campaignId: string;
    name: string;
    checkpointId?: string;
    checkpointName?: string;
    location?: string;
    description?: string;
    deviceId?: string;
    connectedAt: string;
}


export default function CctvLivePage() {
    const { language } = useLanguage();
    const th = language === 'th';

    const [featuredCampaign, setFeaturedCampaign] = useState<Campaign | null>(null);
    const [selectedCampaign, setSelectedCampaign] = useState('');
    const [liveCameras, setLiveCameras] = useState<LiveCameraInfo[]>([]);
    const [offlineCameraIds, setOfflineCameraIds] = useState<Set<string>>(new Set());
    const socketCctvRef = useRef<Socket | null>(null);
    const [loading, setLoading] = useState(true);

    // Load featured campaign
    useEffect(() => {
        fetch('/api/campaigns/featured', { cache: 'no-store' })
            .then(r => r.ok ? r.json() : null)
            .then(data => {
                if (data?._id) {
                    setFeaturedCampaign(data);
                    setSelectedCampaign(data._id);
                }
            })
            .catch(() => {});
    }, []);

    // Connect to Socket.io CCTV namespace for live mobile cameras
    useEffect(() => {
        if (!selectedCampaign) return;
        const socketUrl = typeof window !== 'undefined' ? window.location.origin : '';
        const socket = io(`${socketUrl}/cctv`, { path: '/socket.io', transports: ['websocket', 'polling'] });
        socketCctvRef.current = socket;
        socket.on('connect', () => {
            socket.emit('admin:join', selectedCampaign, (res: any) => {
                if (res?.cameras) setLiveCameras(res.cameras);
            });
        });
        socket.on('camera:online', (cam: LiveCameraInfo) => {
            setLiveCameras(prev => {
                const without = prev.filter(c => c.cameraId !== cam.cameraId);
                return [...without, cam];
            });
            setOfflineCameraIds(prev => {
                const next = new Set(prev);
                next.delete(cam.cameraId);
                return next;
            });
        });
        socket.on('camera:offline', ({ cameraId }: { cameraId: string }) => {
            setOfflineCameraIds(prev => new Set(prev).add(cameraId));
            // Remove from list after 30s so the card stays visible briefly
            setTimeout(() => {
                setLiveCameras(prev => prev.filter(c => c.cameraId !== cameraId));
                setOfflineCameraIds(prev => { const next = new Set(prev); next.delete(cameraId); return next; });
            }, 30000);
        });
        return () => { socket.disconnect(); socketCctvRef.current = null; };
    }, [selectedCampaign]);

    useEffect(() => {
        if (selectedCampaign) setLoading(false);
    }, [selectedCampaign]);

    const n = liveCameras.length;
    const cols = n <= 1 ? 1 : n <= 2 ? 2 : n <= 4 ? 2 : n <= 6 ? 3 : n <= 9 ? 3 : 4;
    const rows = n > 0 ? Math.ceil(n / cols) : 1;

    return (
        <AdminLayout breadcrumbItems={[{ label: 'CCTV Live', labelEn: 'CCTV Live' }]}>
            {/* Compact top bar */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8, gap: 10, flexWrap: 'wrap' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={{ fontSize: 15, fontWeight: 800, color: '#0f172a' }}>
                        📡 {th ? 'ดูกล้องสด' : 'Live Monitor'}
                    </span>
                    {featuredCampaign && (
                        <span style={{ padding: '3px 10px', borderRadius: 6, background: '#fef3c7', border: '1px solid #fcd34d', fontSize: 12, fontWeight: 700, color: '#92400e' }}>
                            ⭐ {featuredCampaign.name}
                        </span>
                    )}
                    {liveCameras.length > 0 && (
                        <span style={{ padding: '3px 8px', borderRadius: 6, background: '#fef2f2', border: '1px solid #fecaca', fontSize: 11, fontWeight: 700, color: '#dc2626' }}>
                            🔴 {liveCameras.length} Live
                        </span>
                    )}
                </div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <span style={{ fontSize: 11, color: '#64748b' }}>
                        {n} {th ? 'กล้อง' : 'cam(s)'} · {cols}×{rows}
                    </span>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '4px 10px', borderRadius: 6, background: n > 0 ? '#f0fdf4' : '#f8fafc', border: `1px solid ${n > 0 ? '#86efac' : '#e2e8f0'}`, fontSize: 11, fontWeight: 700, color: n > 0 ? '#166534' : '#94a3b8' }}>
                        <span style={{ width: 6, height: 6, borderRadius: '50%', background: n > 0 ? '#22c55e' : '#94a3b8', display: 'inline-block', animation: n > 0 ? 'pulse 2s infinite' : 'none' }} />
                        {n > 0 ? 'LIVE' : 'STANDBY'}
                    </span>
                </div>
            </div>

            {/* ── CCTV Grid: fixed height, fills screen ── */}
            <div style={{ height: 'calc(100vh - 180px)', background: '#060a0f', borderRadius: 10, overflow: 'hidden', border: '1px solid #1e293b' }}>
                {loading && n === 0 ? (
                    <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#334155', flexDirection: 'column', gap: 10 }}>
                        <div style={{ fontSize: 36 }}>📡</div>
                        <div style={{ fontSize: 13 }}>{th ? 'กำลังโหลด...' : 'Loading feeds...'}</div>
                    </div>
                ) : n === 0 ? (
                    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, color: '#334155' }}>
                        <div style={{ fontSize: 52 }}>📡</div>
                        <div style={{ fontSize: 16, fontWeight: 700, color: '#475569' }}>{th ? 'ยังไม่มีกล้อง Live' : 'No cameras online'}</div>
                        <div style={{ fontSize: 12, color: '#334155', textAlign: 'center' }}>
                            {th ? 'เปิดมือถือที่จุด Checkpoint แล้วกด "เริ่มการถ่ายทอดสด"' : 'Open /camera on a phone at a checkpoint and tap START'}
                        </div>
                    </div>
                ) : (
                    <div style={{
                        display: 'grid',
                        gridTemplateColumns: `repeat(${cols}, 1fr)`,
                        gridTemplateRows: `repeat(${rows}, 1fr)`,
                        height: '100%',
                        gap: 2,
                        padding: 2,
                        boxSizing: 'border-box',
                    }}>
                        {liveCameras.map(cam => {
                            const isOffline = offlineCameraIds.has(cam.cameraId);
                            return (
                                <LiveVideoFeed key={`live-${cam.cameraId}`} cam={cam} socket={socketCctvRef.current} th={th} isOffline={isOffline} />
                            );
                        })}
                    </div>
                )}
            </div>

            <style jsx>{`
                @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }
            `}</style>
        </AdminLayout>
    );
}

// ── Live Video Feed component (MediaSource Extensions) ──────────────────────
function LiveVideoFeed({ cam, socket, th, isOffline }: { cam: LiveCameraInfo; socket: Socket | null; th: boolean; isOffline?: boolean }) {
    const videoRef = useRef<HTMLVideoElement>(null);
    const msRef = useRef<MediaSource | null>(null);
    const sbRef = useRef<SourceBuffer | null>(null);
    const queueRef = useRef<ArrayBuffer[]>([]);
    const mimeTypeRef = useRef<string>('video/webm;codecs=vp8');
    const watchingRef = useRef(false);
    const [feedError, setFeedError] = useState(false);
    const [hasVideo, setHasVideo] = useState(false);

    const safeEndOfStream = useCallback((ms: MediaSource | null) => {
        try {
            if (ms && ms.readyState === 'open') ms.endOfStream();
        } catch { /* ignore InvalidStateError */ }
    }, []);

    const appendNext = useCallback(() => {
        const sb = sbRef.current;
        if (!sb || sb.updating || queueRef.current.length === 0) return;
        try {
            // Trim buffer to prevent memory buildup (keep last 30s)
            if (sb.buffered.length > 0) {
                const end = sb.buffered.end(sb.buffered.length - 1);
                const start = sb.buffered.start(0);
                if (end - start > 60) {
                    try { sb.remove(start, end - 30); return; } catch { /* ignore */ }
                }
            }
            sb.appendBuffer(queueRef.current.shift()!);
        } catch (err: any) {
            // QuotaExceededError — drop oldest data
            if (err?.name === 'QuotaExceededError' && sb.buffered.length > 0) {
                try { sb.remove(sb.buffered.start(0), sb.buffered.start(0) + 10); } catch { /* ignore */ }
            }
        }
    }, []);

    useEffect(() => {
        if (!socket || !cam.cameraId || isOffline) return;
        setFeedError(false);
        setHasVideo(false);

        // Watch this camera
        socket.emit('viewer:watch', cam.cameraId);
        watchingRef.current = true;

        // Set up MediaSource
        if (typeof window === 'undefined' || !('MediaSource' in window)) return;
        const ms = new MediaSource();
        msRef.current = ms;
        const objUrl = URL.createObjectURL(ms);
        if (videoRef.current) videoRef.current.src = objUrl;

        const initSourceBuffer = (mime: string) => {
            if (sbRef.current || !msRef.current || msRef.current.readyState !== 'open') return;
            if (!MediaSource.isTypeSupported(mime)) return;
            try {
                const sb = msRef.current.addSourceBuffer(mime);
                sbRef.current = sb;
                sb.addEventListener('updateend', appendNext);
                appendNext();
            } catch {
                setFeedError(true);
            }
        };

        ms.addEventListener('sourceopen', () => {
            if (mimeTypeRef.current) initSourceBuffer(mimeTypeRef.current);
        });

        ms.addEventListener('sourceended', () => { /* normal end, do nothing */ });
        ms.addEventListener('sourceclose', () => { /* source closed, do nothing */ });

        const handleChunk = ({ cameraId, chunk, mimeType }: { cameraId: string; chunk: ArrayBuffer; mimeType?: string }) => {
            if (cameraId !== cam.cameraId) return;
            if (mimeType && mimeType !== mimeTypeRef.current) {
                mimeTypeRef.current = mimeType;
                if (!sbRef.current) initSourceBuffer(mimeType);
            }
            const buf = chunk instanceof ArrayBuffer ? chunk : (chunk as any).buffer ?? new Uint8Array(chunk as any).buffer;
            queueRef.current.push(buf);
            if (!hasVideo) setHasVideo(true);
            appendNext();
        };
        socket.on('camera:chunk', handleChunk);

        return () => {
            socket.off('camera:chunk', handleChunk);
            if (watchingRef.current) { socket.emit('viewer:unwatch', cam.cameraId); watchingRef.current = false; }
            safeEndOfStream(msRef.current);
            URL.revokeObjectURL(objUrl);
            sbRef.current = null;
            msRef.current = null;
            queueRef.current = [];
        };
    }, [socket, cam.cameraId, isOffline, appendNext, safeEndOfStream]);

    return (
        <div style={{ position: 'relative', overflow: 'hidden', background: '#0a0f1a', border: `2px solid ${isOffline ? '#475569' : '#ea580c'}`, borderRadius: 4, opacity: isOffline ? 0.6 : 1, transition: 'opacity 0.3s, border-color 0.3s' }}>
            <video
                ref={videoRef}
                autoPlay
                muted
                playsInline
                style={{ width: '100%', height: '100%', objectFit: 'contain', display: 'block', position: 'absolute', inset: 0 }}
                onError={() => setFeedError(true)}
            />
            {/* Offline overlay */}
            {isOffline && (
                <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.7)', zIndex: 8 }}>
                    <div style={{ fontSize: 28, marginBottom: 6 }}>📵</div>
                    <div style={{ fontSize: 11, fontWeight: 700, color: '#94a3b8' }}>{th ? 'กล้องออฟไลน์' : 'Camera Offline'}</div>
                    <div style={{ fontSize: 9, color: '#475569', marginTop: 2 }}>{th ? 'รอการเชื่อมต่อใหม่...' : 'Waiting to reconnect...'}</div>
                </div>
            )}
            {/* Error overlay */}
            {feedError && !isOffline && (
                <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.6)', zIndex: 8 }}>
                    <div style={{ fontSize: 24, marginBottom: 4 }}>⚠️</div>
                    <div style={{ fontSize: 10, color: '#f59e0b' }}>{th ? 'ไม่สามารถเล่นวิดีโอได้' : 'Cannot play feed'}</div>
                </div>
            )}
            {/* LIVE / OFFLINE badge */}
            <div style={{ position: 'absolute', top: 6, left: 6, display: 'flex', gap: 4, zIndex: 10 }}>
                {isOffline ? (
                    <span style={{ padding: '2px 6px', borderRadius: 4, background: 'rgba(71,85,105,0.9)', color: '#94a3b8', fontSize: 9, fontWeight: 800 }}>
                        ⚫ OFFLINE
                    </span>
                ) : (
                    <span style={{ padding: '2px 6px', borderRadius: 4, background: 'rgba(234,88,12,0.9)', color: '#fff', fontSize: 9, fontWeight: 800 }}>
                        🔴 LIVE
                    </span>
                )}
                <span style={{ padding: '2px 6px', borderRadius: 4, background: 'rgba(0,0,0,0.6)', color: '#fff', fontSize: 9 }}>
                    📱 Mobile
                </span>
            </div>
            {/* Info bar */}
            <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, background: 'linear-gradient(transparent, rgba(0,0,0,0.85))', padding: '24px 10px 8px', zIndex: 5 }}>
                <div style={{ fontWeight: 700, color: '#fff', fontSize: 12, textTransform: 'uppercase', lineHeight: 1.2 }}>{cam.name}</div>
                <div style={{ display: 'flex', gap: 6, marginTop: 2, flexWrap: 'wrap' }}>
                    {cam.checkpointName && <span style={{ fontSize: 9, color: '#ea580c', fontWeight: 700 }}>{cam.checkpointName}</span>}
                    {cam.location && <span style={{ fontSize: 9, color: '#94a3b8' }}>{cam.location}</span>}
                    {cam.deviceId && <span style={{ fontSize: 9, color: '#475569' }}>ID: {cam.deviceId}</span>}
                </div>
            </div>
        </div>
    );
}
