'use client';

import { useState, useEffect } from 'react';
import { useLanguage } from '@/lib/language-context';
import AdminLayout from '../AdminLayout';

interface Campaign { _id: string; name: string; }
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

export default function CctvLivePage() {
    const { language } = useLanguage();
    const th = language === 'th';

    const [cameras, setCameras] = useState<CctvCamera[]>([]);
    const [campaigns, setCampaigns] = useState<Campaign[]>([]);
    const [selectedCampaign, setSelectedCampaign] = useState('');
    const [loading, setLoading] = useState(true);
    const [selectedFeed, setSelectedFeed] = useState<CctvCamera | null>(null);
    const [layout, setLayout] = useState<'grid' | 'list'>('grid');

    useEffect(() => {
        fetch('/api/campaigns', { cache: 'no-store' })
            .then(r => r.json())
            .then(data => {
                const list = Array.isArray(data?.data || data) ? (data?.data || data) : [];
                setCampaigns(list);
                if (list.length > 0 && !selectedCampaign) setSelectedCampaign(list[0]._id);
            })
            .catch(() => setCampaigns([]));
    }, []);

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

    // Auto-refresh every 15s
    useEffect(() => {
        const interval = setInterval(loadCameras, 15000);
        return () => clearInterval(interval);
    }, [selectedCampaign]);

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
                        <select
                            value={selectedCampaign}
                            onChange={e => setSelectedCampaign(e.target.value)}
                            style={{ padding: '8px 12px', borderRadius: 8, border: '1.5px solid #cbd5e1', fontSize: 13, fontWeight: 600 }}
                        >
                            {campaigns.map(c => (
                                <option key={c._id} value={c._id}>{c.name}</option>
                            ))}
                        </select>
                    </div>
                </div>
            </div>

            {/* Feed Grid */}
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
                    {cameras.map((cam, idx) => (
                        <div
                            key={cam._id}
                            onClick={() => setSelectedFeed(cam)}
                            style={{
                                background: '#1e293b',
                                borderRadius: 14,
                                overflow: 'hidden',
                                cursor: 'pointer',
                                border: '2px solid transparent',
                                transition: 'border-color 0.2s, transform 0.2s',
                                position: 'relative',
                                minHeight: idx === 0 && cameras.length >= 3 && layout === 'grid' ? 350 : 220,
                                gridRow: idx === 0 && cameras.length >= 3 && layout === 'grid' ? 'span 2' : undefined,
                            }}
                            onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.borderColor = '#ea580c'; }}
                            onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.borderColor = 'transparent'; }}
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
                            <div style={{ position: 'absolute', top: 10, left: 10, display: 'flex', gap: 6 }}>
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
                                <div style={{ position: 'absolute', top: 10, right: 10 }}>
                                    <span style={{ padding: '3px 8px', borderRadius: 6, background: 'rgba(0,0,0,0.6)', color: '#fff', fontSize: 10, fontWeight: 600 }}>
                                        👁 {cam.viewerCount.toLocaleString()} {th ? 'ผู้ชม' : 'VIEWERS'}
                                    </span>
                                </div>
                            )}
                        </div>
                    ))}
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
