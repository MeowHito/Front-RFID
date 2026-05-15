'use client';

import { useState, useEffect, useCallback } from 'react';
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

export default function CctvBetaRecordingsPage() {
    const { language } = useLanguage();
    const th = language === 'th';
    const [selectedCampaign, setSelectedCampaign] = useState('');
    const [items, setItems] = useState<BetaRecording[]>([]);
    const [loading, setLoading] = useState(false);

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

    useEffect(() => { load(); }, [load]);

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
                            {items.map(r => (
                                <tr key={r._id} style={{ borderTop: '1px solid #e5e7eb' }}>
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
                                        {r.s3MasterManifestUrl && (
                                            <a href={r.s3MasterManifestUrl} target="_blank" rel="noreferrer" style={{ marginRight: 8, color: '#2563eb', fontSize: 12 }}>S3</a>
                                        )}
                                        <button onClick={() => handleDelete(r._id)} style={{ background: 'none', border: 'none', color: '#dc2626', cursor: 'pointer', fontSize: 12 }}>Delete</button>
                                    </td>
                                </tr>
                            ))}
                            {items.length === 0 && !loading && (
                                <tr><td colSpan={8} style={{ ...td_, textAlign: 'center', color: '#6b7280', padding: 30 }}>
                                    {th ? 'ยังไม่มีการบันทึก' : 'No recordings yet.'}
                                </td></tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </AdminLayout>
    );
}

const th_: React.CSSProperties = { padding: '10px 12px', fontWeight: 600, fontSize: 12, color: '#374151', textTransform: 'uppercase' };
const td_: React.CSSProperties = { padding: '10px 12px' };
