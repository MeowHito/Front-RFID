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
interface CctvCamera {
    _id: string;
    campaignId: string;
    name: string;
    streamUrl?: string;
    status: string;
    isLiveStreamEnabled: boolean;
    coverageZone?: string;
    resolution: string;
    viewerCount: number;
    checkpointName?: string;
    lastSeenAt?: string;
}

interface RunnerArrival {
    _id: string;
    bib: string;
    checkpoint: string;
    scanTime: string;
    firstName?: string;
    lastName?: string;
    firstNameTh?: string;
    lastNameTh?: string;
    category?: string;
    gender?: string;
}

export default function CctvLivePage() {
    const { language } = useLanguage();
    const th = language === 'th';

    const [cameras, setCameras] = useState<CctvCamera[]>([]);
    const [featuredCampaign, setFeaturedCampaign] = useState<Campaign | null>(null);
    const [selectedCampaign, setSelectedCampaign] = useState('');
    const [liveCameras, setLiveCameras] = useState<LiveCameraInfo[]>([]);
    const socketCctvRef = useRef<Socket | null>(null);
    const [loading, setLoading] = useState(true);
    const [selectedFeed, setSelectedFeed] = useState<CctvCamera | null>(null);
    const [layout, setLayout] = useState<'grid' | 'list'>('grid');
    const [arrivals, setArrivals] = useState<RunnerArrival[]>([]);
    const [preArrivalBuffer, setPreArrivalBuffer] = useState(30);
    const arrivalTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
    // dismissed alerts: key = `${bib}-${checkpoint}-${scanTime}`
    const [dismissed, setDismissed] = useState<Set<string>>(new Set());

    // Load preArrivalBuffer from localStorage
    useEffect(() => {
        try {
            const saved = localStorage.getItem('cctv_settings');
            if (saved) {
                const s = JSON.parse(saved);
                if (s.preArrivalBuffer) setPreArrivalBuffer(s.preArrivalBuffer);
            }
        } catch { /* ignore */ }
    }, []);

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
        });
        socket.on('camera:offline', ({ cameraId }: { cameraId: string }) => {
            setLiveCameras(prev => prev.filter(c => c.cameraId !== cameraId));
        });
        return () => { socket.disconnect(); socketCctvRef.current = null; };
    }, [selectedCampaign]);

    const loadCameras = async () => {
        if (!selectedCampaign) return;
        setLoading(true);
        try {
            const res = await fetch(`/api/cctv-cameras/campaign/${selectedCampaign}`, { cache: 'no-store' });
            const data = await res.json();
            setCameras(Array.isArray(data) ? data.filter((c: CctvCamera) => c.isLiveStreamEnabled) : []);
        } catch { setCameras([]); }
        finally { setLoading(false); }
    };

    useEffect(() => { loadCameras(); }, [selectedCampaign]);

    // Auto-refresh cameras every 15s
    useEffect(() => {
        const interval = setInterval(loadCameras, 15000);
        return () => clearInterval(interval);
    }, [selectedCampaign]);

    // Poll recent arrivals
    const fetchArrivals = useCallback(async () => {
        if (!selectedCampaign) return;
        try {
            const res = await fetch(
                `/api/timing/recent-arrivals/${selectedCampaign}?withinSeconds=${preArrivalBuffer}`,
                { cache: 'no-store' },
            );
            if (!res.ok) return;
            const data = await res.json();
            setArrivals(Array.isArray(data) ? data : []);
        } catch { /* ignore */ }
    }, [selectedCampaign, preArrivalBuffer]);

    useEffect(() => {
        fetchArrivals();
        if (arrivalTimerRef.current) clearInterval(arrivalTimerRef.current);
        arrivalTimerRef.current = setInterval(fetchArrivals, 5000);
        return () => { if (arrivalTimerRef.current) clearInterval(arrivalTimerRef.current); };
    }, [fetchArrivals]);

    // Helpers
    const getArrivalsForCamera = (cam: CctvCamera): RunnerArrival[] => {
        const cpName = (cam.checkpointName || cam.coverageZone || '').toLowerCase().trim();
        if (!cpName) return [];
        return arrivals.filter(a => {
            const key = `${a.bib}-${a.checkpoint}-${a.scanTime}`;
            if (dismissed.has(key)) return false;
            return (a.checkpoint || '').toLowerCase().trim() === cpName;
        });
    };

    const dismissAlert = (a: RunnerArrival, e: React.MouseEvent) => {
        e.stopPropagation();
        const key = `${a.bib}-${a.checkpoint}-${a.scanTime}`;
        setDismissed(prev => new Set(prev).add(key));
    };

    const formatElapsed = (scanTime: string) => {
        const diff = Math.floor((Date.now() - new Date(scanTime).getTime()) / 1000);
        if (diff < 60) return `${diff}s ago`;
        return `${Math.floor(diff / 60)}m ${diff % 60}s ago`;
    };

    const getStatusColor = (status: string) => {
        if (status === 'online') return '#22c55e';
        if (status === 'paused') return '#f59e0b';
        return '#94a3b8';
    };

    const onlineCount = cameras.filter(c => c.status === 'online').length;
    const totalViewers = cameras.reduce((s, c) => s + (c.viewerCount || 0), 0);

    // Unified camera list: live mobile first, then iframe cameras
    type UnifiedCam =
        | { kind: 'live'; data: LiveCameraInfo }
        | { kind: 'iframe'; data: CctvCamera };

    const allCams: UnifiedCam[] = [
        ...liveCameras.map(c => ({ kind: 'live' as const, data: c })),
        ...cameras.map(c => ({ kind: 'iframe' as const, data: c })),
    ];
    const n = allCams.length;
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
                            🔴 {liveCameras.length} Mobile Live
                        </span>
                    )}
                </div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <span style={{ fontSize: 11, color: '#64748b' }}>
                        {n} {th ? 'กล้อง' : 'cam(s)'} · {cols}×{rows}
                    </span>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '4px 10px', borderRadius: 6, background: onlineCount > 0 ? '#f0fdf4' : '#f8fafc', border: `1px solid ${onlineCount > 0 ? '#86efac' : '#e2e8f0'}`, fontSize: 11, fontWeight: 700, color: onlineCount > 0 ? '#166534' : '#94a3b8' }}>
                        <span style={{ width: 6, height: 6, borderRadius: '50%', background: onlineCount > 0 ? '#22c55e' : '#94a3b8', display: 'inline-block', animation: onlineCount > 0 ? 'pulse 2s infinite' : 'none' }} />
                        {onlineCount > 0 ? 'LIVE' : 'STANDBY'}
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
                            {th ? 'เปิดมือถือที่จุด Checkpoint แล้วกด "เริ่มการถ่ายทอดสด"\nหรือเพิ่มกล้องในหน้าจัดการกล้อง' : 'Open /camera on a phone at a checkpoint and tap START\nor add cameras via Camera Management'}
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
                        {allCams.map((entry, idx) => {
                            if (entry.kind === 'live') {
                                const cam = entry.data;
                                return (
                                    <LiveVideoFeed key={`live-${cam.cameraId}`} cam={cam} socket={socketCctvRef.current} th={th} />
                                );
                            }
                            // iframe camera
                            const cam = entry.data;
                            const camArrivals = getArrivalsForCamera(cam);
                            const hasAlert = camArrivals.length > 0;
                            return (
                                <div
                                    key={`iframe-${cam._id}`}
                                    onClick={() => setSelectedFeed(cam)}
                                    style={{
                                        position: 'relative',
                                        background: '#0a0f1a',
                                        overflow: 'hidden',
                                        cursor: 'pointer',
                                        border: hasAlert ? '2px solid #ea580c' : '1px solid #1e293b',
                                        transition: 'border-color 0.15s',
                                        borderRadius: 4,
                                        boxShadow: hasAlert ? '0 0 0 2px rgba(234,88,12,0.3)' : 'none',
                                    }}
                                    onMouseEnter={e => { if (!hasAlert) (e.currentTarget as HTMLDivElement).style.borderColor = '#334155'; }}
                                    onMouseLeave={e => { if (!hasAlert) (e.currentTarget as HTMLDivElement).style.borderColor = '#1e293b'; }}
                                >
                                    {cam.streamUrl ? (
                                        <iframe src={cam.streamUrl} style={{ width: '100%', height: '100%', position: 'absolute', inset: 0, border: 'none' }} allow="autoplay; encrypted-media" allowFullScreen />
                                    ) : (
                                        <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                                            <div style={{ fontSize: 28, opacity: 0.3 }}>📹</div>
                                            <div style={{ fontSize: 10, color: '#334155' }}>{th ? 'ไม่มี Stream URL' : 'No Stream URL'}</div>
                                        </div>
                                    )}

                                    {/* Runner alert */}
                                    {hasAlert && (
                                        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, background: 'rgba(234,88,12,0.95)', zIndex: 10, padding: '6px 8px', maxHeight: 120, overflowY: 'auto' }}>
                                            <div style={{ fontSize: 9, fontWeight: 800, color: '#fff', letterSpacing: 1, marginBottom: 3 }}>
                                                🏃 {th ? 'นักวิ่งถึง CP' : 'RUNNER AT CP'}
                                            </div>
                                            {camArrivals.slice(0, 4).map((a, i) => {
                                                const name = th ? `${a.firstNameTh || a.firstName || ''} ${a.lastNameTh || a.lastName || ''}`.trim() : `${a.firstName || ''} ${a.lastName || ''}`.trim();
                                                return (
                                                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '2px 0', borderBottom: i < camArrivals.length - 1 ? '1px solid rgba(255,255,255,0.15)' : 'none' }}>
                                                        <span style={{ background: '#fff', color: '#ea580c', fontWeight: 900, fontSize: 10, padding: '0 4px', borderRadius: 3, minWidth: 30, textAlign: 'center' }}>#{a.bib}</span>
                                                        <span style={{ color: '#fff', fontSize: 10, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name || '—'}</span>
                                                        <span style={{ color: 'rgba(255,255,255,0.6)', fontSize: 9 }}>{formatElapsed(a.scanTime)}</span>
                                                        <button onClick={e => dismissAlert(a, e)} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.7)', cursor: 'pointer', fontSize: 11, padding: 0, lineHeight: 1 }}>×</button>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    )}

                                    {/* Bottom info */}
                                    <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, background: 'linear-gradient(transparent, rgba(0,0,0,0.85))', padding: '24px 10px 8px' }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
                                            <div>
                                                <div style={{ fontWeight: 700, color: '#fff', fontSize: 12, textTransform: 'uppercase', lineHeight: 1.2 }}>{cam.name}</div>
                                                {cam.checkpointName && <div style={{ fontSize: 9, color: '#94a3b8', marginTop: 1 }}>{cam.checkpointName}</div>}
                                            </div>
                                            <span style={{ width: 7, height: 7, borderRadius: '50%', background: getStatusColor(cam.status), display: 'inline-block', animation: cam.status === 'online' ? 'pulse 2s infinite' : 'none' }} />
                                        </div>
                                    </div>

                                    {/* LIVE badge */}
                                    {cam.status === 'online' && (
                                        <div style={{ position: 'absolute', top: hasAlert ? 'auto' : 6, bottom: hasAlert ? 44 : 'auto', left: 6 }}>
                                            <span style={{ padding: '2px 6px', borderRadius: 4, background: 'rgba(234,88,12,0.9)', color: '#fff', fontSize: 9, fontWeight: 800 }}>🔴 LIVE</span>
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>

            {/* Fullscreen Feed Modal */}
            {selectedFeed && (
                <div style={{ position: 'fixed', inset: 0, zIndex: 20000, background: 'rgba(0,0,0,0.95)', display: 'flex', flexDirection: 'column' }} onClick={() => setSelectedFeed(null)}>
                    <div style={{ padding: '10px 18px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                            <span style={{ color: '#ea580c', fontSize: 10, fontWeight: 700 }}>🔴 LIVE</span>
                            <span style={{ color: '#fff', fontSize: 15, fontWeight: 800 }}>{selectedFeed.name}</span>
                            {selectedFeed.checkpointName && <span style={{ color: '#64748b', fontSize: 12 }}>@ {selectedFeed.checkpointName}</span>}
                        </div>
                        <button onClick={() => setSelectedFeed(null)} style={{ background: 'none', border: 'none', color: '#fff', fontSize: 22, cursor: 'pointer', lineHeight: 1 }}>✕</button>
                    </div>
                    <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 20px 20px' }} onClick={e => e.stopPropagation()}>
                        {selectedFeed.streamUrl ? (
                            <iframe src={selectedFeed.streamUrl} style={{ width: '100%', height: '100%', maxWidth: 1280, borderRadius: 8, border: 'none' }} allow="autoplay; encrypted-media; fullscreen" allowFullScreen />
                        ) : (
                            <div style={{ color: '#475569', textAlign: 'center' }}>
                                <div style={{ fontSize: 56, marginBottom: 12 }}>📹</div>
                                <div style={{ fontSize: 15, fontWeight: 600 }}>{th ? 'ยังไม่มี Stream URL' : 'No Stream URL configured'}</div>
                            </div>
                        )}
                    </div>
                </div>
            )}

            <style jsx>{`
                @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }
            `}</style>
        </AdminLayout>
    );
}

// ── Live Video Feed component (MediaSource Extensions) ──────────────────────
function LiveVideoFeed({ cam, socket, th }: { cam: LiveCameraInfo; socket: Socket | null; th: boolean }) {
    const videoRef = useRef<HTMLVideoElement>(null);
    const msRef = useRef<MediaSource | null>(null);
    const sbRef = useRef<SourceBuffer | null>(null);
    const queueRef = useRef<ArrayBuffer[]>([]);
    const mimeTypeRef = useRef<string>('video/webm;codecs=vp8');
    const watchingRef = useRef(false);

    const appendNext = useCallback(() => {
        if (!sbRef.current || sbRef.current.updating || queueRef.current.length === 0) return;
        try {
            sbRef.current.appendBuffer(queueRef.current.shift()!);
        } catch { /* ignore quota/abort errors */ }
    }, []);

    useEffect(() => {
        if (!socket || !cam.cameraId) return;

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
                // Flush any queued chunks now that SourceBuffer is ready
                appendNext();
            } catch { /* codec not supported */ }
        };

        ms.addEventListener('sourceopen', () => {
            // Wait for first chunk to know the real mimeType before initialising SourceBuffer
            if (mimeTypeRef.current) initSourceBuffer(mimeTypeRef.current);
        });

        const handleChunk = ({ cameraId, chunk, mimeType }: { cameraId: string; chunk: ArrayBuffer; mimeType?: string }) => {
            if (cameraId !== cam.cameraId) return;
            if (mimeType && mimeType !== mimeTypeRef.current) {
                mimeTypeRef.current = mimeType;
                // Initialise SourceBuffer with the real codec on first chunk
                if (!sbRef.current) initSourceBuffer(mimeType);
            }
            const buf = chunk instanceof ArrayBuffer ? chunk : (chunk as any).buffer ?? new Uint8Array(chunk as any).buffer;
            queueRef.current.push(buf);
            appendNext();
        };
        socket.on('camera:chunk', handleChunk);

        return () => {
            socket.off('camera:chunk', handleChunk);
            if (watchingRef.current) { socket.emit('viewer:unwatch', cam.cameraId); watchingRef.current = false; }
            ms.endOfStream?.();
            URL.revokeObjectURL(objUrl);
            sbRef.current = null;
            msRef.current = null;
            queueRef.current = [];
        };
    }, [socket, cam.cameraId, appendNext]);

    return (
        <div style={{ position: 'relative', overflow: 'hidden', background: '#0a0f1a', border: '2px solid #ea580c', borderRadius: 4 }}>
            <video
                ref={videoRef}
                autoPlay
                muted
                playsInline
                style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block', position: 'absolute', inset: 0 }}
            />
            {/* LIVE badge */}
            <div style={{ position: 'absolute', top: 6, left: 6, display: 'flex', gap: 4, zIndex: 5 }}>
                <span style={{ padding: '2px 6px', borderRadius: 4, background: 'rgba(234,88,12,0.9)', color: '#fff', fontSize: 9, fontWeight: 800 }}>
                    🔴 LIVE
                </span>
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
