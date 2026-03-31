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

    return (
        <AdminLayout breadcrumbItems={[{ label: 'CCTV Live Feeds', labelEn: 'CCTV Live Feeds' }]}>
            {/* Header */}
            <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 14, padding: '20px 24px', marginBottom: 16, boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
                    <div>
                        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: '#0f172a' }}>
                            {th ? '📡 ดูกล้องสด' : '📡 Live Monitor View'}
                        </h1>
                        <p style={{ margin: '4px 0 0', fontSize: 13, color: '#64748b' }}>
                            {th ? 'ดูภาพสดจากกล้องที่จุด Checkpoint ต่างๆ' : 'Monitor real-time feeds from checkpoint cameras'}
                        </p>
                    </div>
                    <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 14px', borderRadius: 8, background: '#f0fdf4', border: '1px solid #86efac', fontSize: 12, fontWeight: 700, color: '#166534' }}>
                            ● SYSTEM {onlineCount > 0 ? 'OPTIMAL' : 'STANDBY'}
                        </span>
                        <button
                            onClick={() => setLayout(layout === 'grid' ? 'list' : 'grid')}
                            style={{ padding: '6px 14px', borderRadius: 8, border: '1px solid #e2e8f0', background: '#fff', cursor: 'pointer', fontSize: 12, fontWeight: 600, color: '#475569' }}
                        >
                            {layout === 'grid' ? '▤ Layout' : '▦ Layout'}
                        </button>
                        {featuredCampaign && (
                            <span style={{ padding: '6px 14px', borderRadius: 8, background: '#fef3c7', border: '1.5px solid #fcd34d', fontSize: 13, fontWeight: 700, color: '#92400e' }}>
                                ⭐ {featuredCampaign.name}
                            </span>
                        )}
                    </div>
                </div>
            </div>

            {/* Live Mobile Cameras (Socket.io) */}
            {liveCameras.length > 0 && (
                <div style={{ marginBottom: 20 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                        <span style={{ fontSize: 13, fontWeight: 800, color: '#0f172a' }}>
                            📱 {th ? 'กล้องมือถือ Live' : 'Mobile Live Cameras'}
                        </span>
                        <span style={{ padding: '2px 8px', borderRadius: 10, background: '#fef2f2', border: '1px solid #fecaca', fontSize: 11, fontWeight: 700, color: '#dc2626' }}>
                            🔴 {liveCameras.length} {th ? 'เครื่อง' : 'device(s)'}
                        </span>
                    </div>
                    <div style={{
                        display: 'grid',
                        gridTemplateColumns: liveCameras.length === 1 ? '1fr' : liveCameras.length <= 4 ? 'repeat(2, 1fr)' : 'repeat(3, 1fr)',
                        gap: 14,
                    }}>
                        {liveCameras.map(cam => (
                            <LiveVideoFeed key={cam.cameraId} cam={cam} socket={socketCctvRef.current} th={th} />
                        ))}
                    </div>
                </div>
            )}

            {/* Feed Grid (iframe cameras) */}
            {loading ? (
                <div style={{ padding: 60, textAlign: 'center', color: '#94a3b8', fontSize: 14 }}>
                    {th ? 'กำลังโหลด...' : 'Loading feeds...'}
                </div>
            ) : cameras.length === 0 ? (
                <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 14, padding: 60, textAlign: 'center' }}>
                    <div style={{ fontSize: 48, marginBottom: 12 }}>📡</div>
                    <h3 style={{ margin: '0 0 8px', color: '#0f172a', fontWeight: 700 }}>
                        {th ? 'ยังไม่มี Feed ที่เปิดใช้งาน' : 'No Active Feeds'}
                    </h3>
                    <p style={{ color: '#94a3b8', fontSize: 13 }}>
                        {th ? 'กรุณาเพิ่มกล้องและเปิด Live Stream ในหน้าจัดการกล้อง' : 'Add cameras and enable Live Stream in Camera Management'}
                    </p>
                </div>
            ) : (
                <div style={{
                    display: 'grid',
                    gridTemplateColumns: layout === 'grid'
                        ? (cameras.length <= 2 ? `repeat(${cameras.length}, 1fr)` : cameras.length <= 4 ? 'repeat(2, 1fr)' : 'repeat(3, 1fr)')
                        : '1fr',
                    gap: 16,
                }}>
                    {cameras.map((cam, idx) => {
                        const camArrivals = getArrivalsForCamera(cam);
                        const hasAlert = camArrivals.length > 0;
                        return (
                            <div
                                key={cam._id}
                                onClick={() => setSelectedFeed(cam)}
                                style={{
                                    background: '#1e293b',
                                    borderRadius: 14,
                                    overflow: 'hidden',
                                    cursor: 'pointer',
                                    border: hasAlert ? '2px solid #ea580c' : '2px solid transparent',
                                    transition: 'border-color 0.2s, transform 0.2s',
                                    position: 'relative',
                                    minHeight: idx === 0 && cameras.length >= 3 && layout === 'grid' ? 350 : 220,
                                    gridRow: idx === 0 && cameras.length >= 3 && layout === 'grid' ? 'span 2' : undefined,
                                    boxShadow: hasAlert ? '0 0 0 3px rgba(234,88,12,0.35)' : 'none',
                                }}
                                onMouseEnter={e => { if (!hasAlert) (e.currentTarget as HTMLDivElement).style.borderColor = '#475569'; }}
                                onMouseLeave={e => { if (!hasAlert) (e.currentTarget as HTMLDivElement).style.borderColor = 'transparent'; }}
                            >
                                {/* Stream embed or placeholder */}
                                {cam.streamUrl ? (
                                    <iframe
                                        src={cam.streamUrl}
                                        style={{ width: '100%', height: '100%', position: 'absolute', inset: 0, border: 'none' }}
                                        allow="autoplay; encrypted-media"
                                        allowFullScreen
                                    />
                                ) : (
                                    <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'linear-gradient(135deg, #1e293b, #0f172a)' }}>
                                        <div style={{ textAlign: 'center', color: '#475569' }}>
                                            <div style={{ fontSize: 40, marginBottom: 8 }}>📹</div>
                                            <div style={{ fontSize: 12 }}>{th ? 'ยังไม่มี Stream URL' : 'No Stream URL'}</div>
                                        </div>
                                    </div>
                                )}

                                {/* Runner Arrival Alert Panel */}
                                {hasAlert && (
                                    <div style={{
                                        position: 'absolute', top: 0, left: 0, right: 0,
                                        background: 'linear-gradient(180deg, rgba(234,88,12,0.97) 0%, rgba(234,88,12,0.85) 100%)',
                                        zIndex: 10, padding: '8px 10px',
                                        maxHeight: 140, overflowY: 'auto',
                                    }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                                            <span style={{ fontSize: 10, fontWeight: 800, color: '#fff', letterSpacing: 1 }}>🏃 {th ? 'นักวิ่งถึง Checkpoint' : 'RUNNER AT CHECKPOINT'}</span>
                                            <span style={{ fontSize: 9, color: 'rgba(255,255,255,0.7)', marginLeft: 'auto' }}>{preArrivalBuffer}s window</span>
                                        </div>
                                        {camArrivals.slice(0, 5).map((a, i) => {
                                            const name = th
                                                ? `${a.firstNameTh || a.firstName || ''} ${a.lastNameTh || a.lastName || ''}`.trim()
                                                : `${a.firstName || ''} ${a.lastName || ''}`.trim();
                                            return (
                                                <div key={i} style={{
                                                    display: 'flex', alignItems: 'center', gap: 6,
                                                    padding: '3px 0', borderBottom: i < camArrivals.length - 1 ? '1px solid rgba(255,255,255,0.2)' : 'none',
                                                }}>
                                                    <span style={{ background: '#fff', color: '#ea580c', fontWeight: 900, fontSize: 11, padding: '1px 6px', borderRadius: 4, minWidth: 36, textAlign: 'center' }}>#{a.bib}</span>
                                                    <span style={{ color: '#fff', fontSize: 11, fontWeight: 600, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                        {name || (th ? 'ไม่ระบุชื่อ' : 'Unknown')}
                                                    </span>
                                                    {a.category && <span style={{ color: 'rgba(255,255,255,0.7)', fontSize: 9 }}>{a.category}</span>}
                                                    <span style={{ color: 'rgba(255,255,255,0.6)', fontSize: 9, whiteSpace: 'nowrap' }}>{formatElapsed(a.scanTime)}</span>
                                                    <button
                                                        onClick={(e) => dismissAlert(a, e)}
                                                        style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.7)', cursor: 'pointer', fontSize: 12, padding: '0 2px', lineHeight: 1 }}
                                                        title={th ? 'ปิด' : 'Dismiss'}
                                                    >×</button>
                                                </div>
                                            );
                                        })}
                                        {camArrivals.length > 5 && (
                                            <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.6)', textAlign: 'center', paddingTop: 3 }}>+{camArrivals.length - 5} more</div>
                                        )}
                                    </div>
                                )}

                                {/* Overlay info */}
                                <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, background: 'linear-gradient(transparent, rgba(0,0,0,0.8))', padding: '40px 16px 14px' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
                                        <div>
                                            <div style={{ fontWeight: 800, color: '#fff', fontSize: 15, textTransform: 'uppercase' }}>
                                                {cam.name}
                                            </div>
                                            <div style={{ fontSize: 11, color: '#ea580c', fontWeight: 700, letterSpacing: 0.5 }}>
                                                {cam.status === 'online' ? 'SIGNAL ACTIVE' : cam.status === 'paused' ? 'PAUSED' : 'SIGNAL INACTIVE'}
                                            </div>
                                        </div>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                                            <span style={{
                                                width: 8, height: 8, borderRadius: '50%',
                                                background: getStatusColor(cam.status),
                                                animation: cam.status === 'online' ? 'pulse 2s infinite' : 'none',
                                            }} />
                                        </div>
                                    </div>
                                </div>

                                {/* Top overlay badges */}
                                <div style={{ position: 'absolute', top: hasAlert ? 'auto' : 10, bottom: hasAlert ? 60 : 'auto', left: 10, display: 'flex', gap: 6 }}>
                                    {cam.status === 'online' && (
                                        <span style={{ padding: '3px 8px', borderRadius: 6, background: 'rgba(234,88,12,0.9)', color: '#fff', fontSize: 10, fontWeight: 700, letterSpacing: 0.5 }}>
                                            🔴 LIVE
                                        </span>
                                    )}
                                    {cam.checkpointName && (
                                        <span style={{ padding: '3px 8px', borderRadius: 6, background: 'rgba(0,0,0,0.6)', color: '#fff', fontSize: 10, fontWeight: 600 }}>
                                            {cam.checkpointName}
                                        </span>
                                    )}
                                </div>
                                {cam.viewerCount > 0 && (
                                    <div style={{ position: 'absolute', top: hasAlert ? 'auto' : 10, bottom: hasAlert ? 60 : 'auto', right: 10 }}>
                                        <span style={{ padding: '3px 8px', borderRadius: 6, background: 'rgba(0,0,0,0.6)', color: '#fff', fontSize: 10, fontWeight: 600 }}>
                                            👁 {cam.viewerCount.toLocaleString()} {th ? 'ผู้ชม' : 'VIEWERS'}
                                        </span>
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            )}

            {/* Stats Footer */}
            {cameras.length > 0 && (
                <div style={{ marginTop: 16, display: 'flex', gap: 16, flexWrap: 'wrap' }}>
                    {/* Event Log */}
                    <div style={{ flex: 2, minWidth: 300, background: '#fff', border: '1px solid #e2e8f0', borderRadius: 14, padding: '16px 20px' }}>
                        <h3 style={{ margin: '0 0 12px', fontSize: 14, fontWeight: 800, color: '#0f172a', display: 'flex', alignItems: 'center', gap: 6 }}>
                            📋 {th ? 'บันทึกกิจกรรม' : 'EVENT LOG'}
                        </h3>
                        <div style={{ fontSize: 12, color: '#64748b', fontFamily: 'monospace', display: 'flex', flexDirection: 'column', gap: 6 }}>
                            {cameras.filter(c => c.status === 'online').map(cam => (
                                <div key={cam._id} style={{ padding: '4px 0', borderBottom: '1px solid #f8fafc' }}>
                                    <span style={{ color: '#94a3b8' }}>[{new Date().toLocaleTimeString('th-TH')}]</span>{' '}
                                    <span style={{ color: '#ea580c', fontWeight: 700 }}>{cam.name}</span>{' '}
                                    {th ? 'กำลังสตรีม' : 'streaming'} • {cam.resolution}
                                </div>
                            ))}
                            {cameras.filter(c => c.status === 'online').length === 0 && (
                                <div style={{ color: '#94a3b8', fontStyle: 'italic' }}>{th ? 'ไม่มีกล้องออนไลน์' : 'No cameras online'}</div>
                            )}
                        </div>
                    </div>

                    {/* Node Health */}
                    <div style={{ flex: 1, minWidth: 200, background: '#fff', border: '1px solid #e2e8f0', borderRadius: 14, padding: '16px 20px' }}>
                        <h3 style={{ margin: '0 0 12px', fontSize: 14, fontWeight: 800, color: '#0f172a' }}>
                            {th ? 'สถานะระบบ' : 'SYSTEM STATUS'}
                        </h3>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                            {[
                                { label: th ? 'กล้องออนไลน์' : 'Cameras Online', pct: cameras.length > 0 ? Math.round((onlineCount / cameras.length) * 100) : 0, color: '#22c55e' },
                                { label: th ? 'ผู้ชมทั้งหมด' : 'Total Viewers', pct: 100, color: '#3b82f6', value: totalViewers },
                                { label: th ? 'กล้องทั้งหมด' : 'Total Cameras', pct: 100, color: '#ea580c', value: cameras.length },
                            ].map((item, i) => (
                                <div key={i}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 4 }}>
                                        <span style={{ color: '#475569', fontWeight: 600 }}>{item.label}</span>
                                        <span style={{ color: item.color, fontWeight: 700 }}>{item.value !== undefined ? item.value : `${item.pct}%`}</span>
                                    </div>
                                    {item.value === undefined && (
                                        <div style={{ height: 4, borderRadius: 2, background: '#f1f5f9', overflow: 'hidden' }}>
                                            <div style={{ height: '100%', borderRadius: 2, background: item.color, width: `${item.pct}%`, transition: 'width 0.5s' }} />
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            )}

            {/* Fullscreen Feed Modal */}
            {selectedFeed && (
                <div style={{ position: 'fixed', inset: 0, zIndex: 20000, background: 'rgba(0,0,0,0.9)', display: 'flex', flexDirection: 'column' }} onClick={() => setSelectedFeed(null)}>
                    <div style={{ padding: '12px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div>
                            <span style={{ color: '#ea580c', fontSize: 11, fontWeight: 700 }}>🔴 LIVE</span>
                            <span style={{ color: '#fff', fontSize: 14, fontWeight: 800, marginLeft: 8 }}>{selectedFeed.name}</span>
                            {selectedFeed.checkpointName && <span style={{ color: '#94a3b8', fontSize: 12, marginLeft: 8 }}>@ {selectedFeed.checkpointName}</span>}
                        </div>
                        <button onClick={() => setSelectedFeed(null)} style={{ background: 'none', border: 'none', color: '#fff', fontSize: 24, cursor: 'pointer' }}>×</button>
                    </div>
                    <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }} onClick={e => e.stopPropagation()}>
                        {selectedFeed.streamUrl ? (
                            <iframe
                                src={selectedFeed.streamUrl}
                                style={{ width: '100%', height: '100%', maxWidth: 1200, borderRadius: 12, border: 'none' }}
                                allow="autoplay; encrypted-media; fullscreen"
                                allowFullScreen
                            />
                        ) : (
                            <div style={{ color: '#64748b', textAlign: 'center' }}>
                                <div style={{ fontSize: 64, marginBottom: 16 }}>📹</div>
                                <div style={{ fontSize: 16, fontWeight: 600 }}>{th ? 'ยังไม่มี Stream URL' : 'No Stream URL configured'}</div>
                            </div>
                        )}
                    </div>
                </div>
            )}

            <style jsx>{`
                @keyframes pulse {
                    0%, 100% { opacity: 1; }
                    50% { opacity: 0.4; }
                }
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
        <div style={{ background: '#1e293b', borderRadius: 14, overflow: 'hidden', position: 'relative', minHeight: 240, border: '2px solid #ea580c' }}>
            <video
                ref={videoRef}
                autoPlay
                muted
                playsInline
                style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block', minHeight: 240 }}
            />
            {/* LIVE badge */}
            <div style={{ position: 'absolute', top: 10, left: 10, display: 'flex', gap: 6 }}>
                <span style={{ padding: '3px 8px', borderRadius: 6, background: 'rgba(234,88,12,0.9)', color: '#fff', fontSize: 10, fontWeight: 800, letterSpacing: 0.5 }}>
                    🔴 LIVE
                </span>
                <span style={{ padding: '3px 8px', borderRadius: 6, background: 'rgba(0,0,0,0.6)', color: '#fff', fontSize: 10 }}>
                    📱 Mobile
                </span>
            </div>
            {/* Info bar */}
            <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, background: 'linear-gradient(transparent, rgba(0,0,0,0.85))', padding: '30px 14px 12px' }}>
                <div style={{ fontWeight: 800, color: '#fff', fontSize: 14 }}>{cam.name}</div>
                <div style={{ display: 'flex', gap: 8, marginTop: 3 }}>
                    {cam.checkpointName && (
                        <span style={{ fontSize: 10, color: '#ea580c', fontWeight: 700 }}>{cam.checkpointName}</span>
                    )}
                    {cam.location && (
                        <span style={{ fontSize: 10, color: '#94a3b8' }}>{cam.location}</span>
                    )}
                    {cam.deviceId && (
                        <span style={{ fontSize: 10, color: '#475569' }}>ID: {cam.deviceId}</span>
                    )}
                </div>
            </div>
        </div>
    );
}
