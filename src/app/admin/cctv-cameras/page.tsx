'use client';

import { useState, useEffect } from 'react';
import { useLanguage } from '@/lib/language-context';
import { useAuth } from '@/lib/auth-context';
import AdminLayout from '../AdminLayout';

interface Campaign { _id: string; name: string; }
interface Checkpoint { _id: string; name: string; kmCumulative?: number; }
interface CctvCamera {
    _id: string;
    campaignId: string;
    checkpointId?: string;
    name: string;
    streamUrl?: string;
    deviceId?: string;
    status: string;
    isLiveStreamEnabled: boolean;
    coverageZone?: string;
    resolution: string;
    viewerCount: number;
    checkpointName?: string;
    lastSeenAt?: string;
    createdAt?: string;
}

export default function CctvCamerasPage() {
    const { language } = useLanguage();
    const { user } = useAuth();
    const th = language === 'th';
    const isAdmin = user?.role === 'admin' || user?.role === 'admin_master';

    const [cameras, setCameras] = useState<CctvCamera[]>([]);
    const [campaigns, setCampaigns] = useState<Campaign[]>([]);
    const [checkpoints, setCheckpoints] = useState<Checkpoint[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedCampaign, setSelectedCampaign] = useState('');
    const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);

    // Modal state
    const [modalOpen, setModalOpen] = useState(false);
    const [editCamera, setEditCamera] = useState<CctvCamera | null>(null);
    const [deleteConfirm, setDeleteConfirm] = useState<CctvCamera | null>(null);
    const [saving, setSaving] = useState(false);

    // Form state
    const [formName, setFormName] = useState('');
    const [formStreamUrl, setFormStreamUrl] = useState('');
    const [formDeviceId, setFormDeviceId] = useState('');
    const [formCheckpointId, setFormCheckpointId] = useState('');
    const [formCoverageZone, setFormCoverageZone] = useState('');
    const [formResolution, setFormResolution] = useState('1080p');
    const [formIsLiveEnabled, setFormIsLiveEnabled] = useState(false);

    // Stats
    const [stats, setStats] = useState({ total: 0, online: 0, offline: 0, totalViewers: 0 });

    // Load campaigns
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

    // Load checkpoints when campaign changes
    useEffect(() => {
        if (!selectedCampaign) return;
        fetch(`/api/checkpoints/campaign/${selectedCampaign}`, { cache: 'no-store' })
            .then(r => r.json())
            .then(data => setCheckpoints(Array.isArray(data) ? data : []))
            .catch(() => setCheckpoints([]));
    }, [selectedCampaign]);

    // Load cameras
    const loadCameras = async () => {
        setLoading(true);
        try {
            const url = selectedCampaign
                ? `/api/cctv-cameras/campaign/${selectedCampaign}`
                : '/api/cctv-cameras';
            const res = await fetch(url, { cache: 'no-store' });
            const data = await res.json();
            setCameras(Array.isArray(data) ? data : []);
            // Compute stats
            const list = Array.isArray(data) ? data : [];
            setStats({
                total: list.length,
                online: list.filter((c: CctvCamera) => c.status === 'online').length,
                offline: list.filter((c: CctvCamera) => c.status !== 'online').length,
                totalViewers: list.reduce((s: number, c: CctvCamera) => s + (c.viewerCount || 0), 0),
            });
        } catch { setCameras([]); }
        finally { setLoading(false); }
    };

    useEffect(() => { if (selectedCampaign) loadCameras(); }, [selectedCampaign]);

    // Toast auto-dismiss
    useEffect(() => {
        if (toast) { const t = setTimeout(() => setToast(null), 3000); return () => clearTimeout(t); }
    }, [toast]);

    const openAddModal = () => {
        setEditCamera(null);
        setFormName('');
        setFormStreamUrl('');
        setFormDeviceId('');
        setFormCheckpointId('');
        setFormCoverageZone('');
        setFormResolution('1080p');
        setFormIsLiveEnabled(false);
        setModalOpen(true);
    };

    const openEditModal = (cam: CctvCamera) => {
        setEditCamera(cam);
        setFormName(cam.name);
        setFormStreamUrl(cam.streamUrl || '');
        setFormDeviceId(cam.deviceId || '');
        setFormCheckpointId(cam.checkpointId || '');
        setFormCoverageZone(cam.coverageZone || '');
        setFormResolution(cam.resolution || '1080p');
        setFormIsLiveEnabled(cam.isLiveStreamEnabled);
        setModalOpen(true);
    };

    const handleSave = async () => {
        if (!formName.trim()) {
            setToast({ msg: th ? 'กรุณาใส่ชื่อกล้อง' : 'Camera name is required', type: 'error' });
            return;
        }
        setSaving(true);
        const cpName = checkpoints.find(c => c._id === formCheckpointId)?.name || '';
        const body = {
            campaignId: selectedCampaign,
            name: formName.trim(),
            streamUrl: formStreamUrl.trim(),
            deviceId: formDeviceId.trim(),
            checkpointId: formCheckpointId || undefined,
            checkpointName: cpName,
            coverageZone: formCoverageZone.trim(),
            resolution: formResolution,
            isLiveStreamEnabled: formIsLiveEnabled,
        };
        try {
            const url = editCamera ? `/api/cctv-cameras/${editCamera._id}` : '/api/cctv-cameras';
            const method = editCamera ? 'PUT' : 'POST';
            const res = await fetch(url, {
                method,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
            });
            if (!res.ok) throw new Error();
            setToast({ msg: th ? (editCamera ? 'แก้ไขสำเร็จ' : 'เพิ่มกล้องสำเร็จ') : (editCamera ? 'Camera updated' : 'Camera added'), type: 'success' });
            setModalOpen(false);
            loadCameras();
        } catch {
            setToast({ msg: th ? 'เกิดข้อผิดพลาด' : 'Error saving camera', type: 'error' });
        } finally { setSaving(false); }
    };

    const handleDelete = async () => {
        if (!deleteConfirm) return;
        try {
            const res = await fetch(`/api/cctv-cameras/${deleteConfirm._id}`, { method: 'DELETE' });
            if (!res.ok) throw new Error();
            setToast({ msg: th ? 'ลบกล้องสำเร็จ' : 'Camera deleted', type: 'success' });
            setDeleteConfirm(null);
            loadCameras();
        } catch {
            setToast({ msg: th ? 'เกิดข้อผิดพลาดในการลบ' : 'Error deleting camera', type: 'error' });
        }
    };

    const handleToggleLive = async (cam: CctvCamera) => {
        const newVal = !cam.isLiveStreamEnabled;
        setCameras(prev => prev.map(c => c._id === cam._id ? { ...c, isLiveStreamEnabled: newVal } : c));
        try {
            const res = await fetch(`/api/cctv-cameras/${cam._id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ isLiveStreamEnabled: newVal }),
            });
            if (!res.ok) throw new Error();
        } catch {
            setCameras(prev => prev.map(c => c._id === cam._id ? { ...c, isLiveStreamEnabled: !newVal } : c));
            setToast({ msg: th ? 'เกิดข้อผิดพลาด' : 'Error updating', type: 'error' });
        }
    };

    const getStatusStyle = (status: string) => {
        if (status === 'online') return { color: '#16a34a', bg: '#f0fdf4', border: '#86efac', label: th ? 'ออนไลน์' : 'Online', dot: '#22c55e' };
        if (status === 'paused') return { color: '#d97706', bg: '#fffbeb', border: '#fcd34d', label: th ? 'หยุดชั่วคราว' : 'Paused', dot: '#f59e0b' };
        return { color: '#64748b', bg: '#f8fafc', border: '#cbd5e1', label: th ? 'ออฟไลน์' : 'Offline', dot: '#94a3b8' };
    };

    return (
        <AdminLayout breadcrumbItems={[{ label: 'CCTV จัดการกล้อง', labelEn: 'CCTV Camera Management' }]}>
            {/* Header */}
            <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 14, padding: '20px 24px', marginBottom: 16, boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
                    <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                            <span style={{ color: '#16a34a', fontSize: 10, fontWeight: 700, letterSpacing: 1 }}>● SYSTEM OPERATIONAL</span>
                        </div>
                        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: '#0f172a' }}>
                            {th ? 'จัดการกล้อง CCTV' : 'CCTV Camera Management'}
                        </h1>
                        <p style={{ margin: '4px 0 0', fontSize: 13, color: '#64748b' }}>
                            {th ? 'ตั้งค่าและจัดการกล้องมือถือที่จุด Checkpoint' : 'Configure and manage mobile cameras at checkpoints'}
                        </p>
                    </div>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                        <select
                            value={selectedCampaign}
                            onChange={e => setSelectedCampaign(e.target.value)}
                            style={{ padding: '8px 12px', borderRadius: 8, border: '1.5px solid #cbd5e1', fontSize: 13, fontWeight: 600, minWidth: 200 }}
                        >
                            {campaigns.map(c => (
                                <option key={c._id} value={c._id}>{c.name}</option>
                            ))}
                        </select>
                        {isAdmin && (
                            <button
                                onClick={openAddModal}
                                style={{ padding: '8px 18px', borderRadius: 8, border: 'none', background: '#ea580c', color: '#fff', fontWeight: 700, fontSize: 13, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}
                            >
                                <span style={{ fontSize: 16 }}>+</span> {th ? 'เพิ่มกล้อง' : 'New Camera'}
                            </button>
                        )}
                    </div>
                </div>
            </div>

            {/* Stats Cards */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, marginBottom: 16 }}>
                {[
                    { label: th ? 'กล้องทั้งหมด' : 'TOTAL CAMERAS', value: stats.total, sub: '', color: '#0f172a' },
                    { label: th ? 'สตรีมที่ใช้งาน' : 'ACTIVE STREAMS', value: stats.online, sub: '', color: '#16a34a' },
                    { label: th ? 'ผู้ชมทั้งหมด' : 'TOTAL VIEWERS', value: stats.totalViewers, sub: '', color: '#ea580c' },
                    { label: th ? 'ออฟไลน์' : 'OFFLINE', value: stats.offline, sub: '', color: '#64748b' },
                ].map((card, i) => (
                    <div key={i} style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, padding: '16px 20px', boxShadow: '0 1px 2px rgba(0,0,0,0.03)' }}>
                        <div style={{ fontSize: 10, fontWeight: 700, color: '#94a3b8', letterSpacing: 1, marginBottom: 4 }}>{card.label}</div>
                        <div style={{ fontSize: 28, fontWeight: 800, color: card.color }}>{card.value}</div>
                    </div>
                ))}
            </div>

            {/* Camera Table */}
            <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 14, overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
                <div style={{ padding: '14px 20px', borderBottom: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: '#0f172a' }}>
                        {th ? 'รายการกล้องที่ใช้งาน' : 'Active Mobile Units'}
                    </h3>
                    <button onClick={loadCameras} style={{ padding: '4px 10px', borderRadius: 6, border: '1px solid #e2e8f0', background: '#fff', fontSize: 12, cursor: 'pointer' }}>🔄</button>
                </div>
                <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                        <thead>
                            <tr style={{ background: '#f8fafc' }}>
                                <th style={{ padding: '10px 16px', textAlign: 'left', fontWeight: 700, color: '#475569', fontSize: 11, letterSpacing: 0.5 }}>
                                    {th ? 'ชื่อกล้อง' : 'CAMERA NAME'}
                                </th>
                                <th style={{ padding: '10px 12px', textAlign: 'left', fontWeight: 700, color: '#475569', fontSize: 11, letterSpacing: 0.5 }}>
                                    {th ? 'สถานะ' : 'STATUS'}
                                </th>
                                <th style={{ padding: '10px 12px', textAlign: 'left', fontWeight: 700, color: '#475569', fontSize: 11, letterSpacing: 0.5 }}>
                                    {th ? 'จุด Checkpoint' : 'CHECKPOINT'}
                                </th>
                                <th style={{ padding: '10px 12px', textAlign: 'center', fontWeight: 700, color: '#475569', fontSize: 11, letterSpacing: 0.5 }}>
                                    {th ? 'ผู้ชม' : 'VIEWERS'}
                                </th>
                                <th style={{ padding: '10px 12px', textAlign: 'center', fontWeight: 700, color: '#475569', fontSize: 11, letterSpacing: 0.5 }}>
                                    LIVE STREAM
                                </th>
                                <th style={{ padding: '10px 12px', textAlign: 'center', fontWeight: 700, color: '#475569', fontSize: 11, letterSpacing: 0.5 }}>
                                    {th ? 'การจัดการ' : 'ACTIONS'}
                                </th>
                            </tr>
                        </thead>
                        <tbody>
                            {loading ? (
                                <tr><td colSpan={6} style={{ padding: 40, textAlign: 'center', color: '#94a3b8' }}>{th ? 'กำลังโหลด...' : 'Loading...'}</td></tr>
                            ) : cameras.length === 0 ? (
                                <tr><td colSpan={6} style={{ padding: 40, textAlign: 'center', color: '#94a3b8' }}>
                                    <div style={{ fontSize: 32, marginBottom: 8 }}>📹</div>
                                    {th ? 'ยังไม่มีกล้องในกิจกรรมนี้' : 'No cameras for this event yet'}
                                </td></tr>
                            ) : cameras.map(cam => {
                                const st = getStatusStyle(cam.status);
                                return (
                                    <tr key={cam._id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                                        <td style={{ padding: '12px 16px' }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                                <div style={{ width: 36, height: 36, borderRadius: 8, background: '#f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16 }}>📹</div>
                                                <div>
                                                    <div style={{ fontWeight: 700, color: '#0f172a', fontSize: 13 }}>{cam.name}</div>
                                                    <div style={{ fontSize: 11, color: '#94a3b8' }}>ID: {cam.deviceId || String(cam._id).slice(-8)}</div>
                                                </div>
                                            </div>
                                        </td>
                                        <td style={{ padding: '12px' }}>
                                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12, fontWeight: 600, color: st.color }}>
                                                <span style={{ width: 7, height: 7, borderRadius: '50%', background: st.dot, display: 'inline-block' }} />
                                                {st.label}
                                            </span>
                                        </td>
                                        <td style={{ padding: '12px', fontSize: 13, color: '#475569' }}>
                                            {cam.checkpointName || cam.coverageZone || '-'}
                                        </td>
                                        <td style={{ padding: '12px', textAlign: 'center' }}>
                                            <span style={{ display: 'inline-block', padding: '2px 10px', borderRadius: 12, background: '#f1f5f9', fontWeight: 700, fontSize: 12, color: '#475569' }}>
                                                {cam.viewerCount}
                                            </span>
                                        </td>
                                        <td style={{ padding: '12px', textAlign: 'center' }}>
                                            <label style={{ position: 'relative', display: 'inline-block', width: 40, height: 22, cursor: isAdmin ? 'pointer' : 'default' }}>
                                                <input
                                                    type="checkbox"
                                                    checked={cam.isLiveStreamEnabled}
                                                    onChange={() => isAdmin && handleToggleLive(cam)}
                                                    disabled={!isAdmin}
                                                    style={{ opacity: 0, width: 0, height: 0 }}
                                                />
                                                <span style={{
                                                    position: 'absolute', inset: 0, borderRadius: 11,
                                                    background: cam.isLiveStreamEnabled ? '#ea580c' : '#cbd5e1',
                                                    transition: 'background 0.2s',
                                                }} />
                                                <span style={{
                                                    position: 'absolute', top: 2, left: cam.isLiveStreamEnabled ? 20 : 2,
                                                    width: 18, height: 18, borderRadius: '50%', background: '#fff',
                                                    transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.15)',
                                                }} />
                                            </label>
                                        </td>
                                        <td style={{ padding: '12px', textAlign: 'center' }}>
                                            {isAdmin && (
                                                <div style={{ display: 'flex', gap: 4, justifyContent: 'center' }}>
                                                    <button onClick={() => openEditModal(cam)} style={{ padding: '4px 8px', borderRadius: 6, border: '1px solid #e2e8f0', background: '#fff', cursor: 'pointer', fontSize: 12 }} title={th ? 'แก้ไข' : 'Edit'}>✏️</button>
                                                    <button onClick={() => setDeleteConfirm(cam)} style={{ padding: '4px 8px', borderRadius: 6, border: '1px solid #fecaca', background: '#fef2f2', cursor: 'pointer', fontSize: 12 }} title={th ? 'ลบ' : 'Delete'}>🗑️</button>
                                                </div>
                                            )}
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
                {cameras.length > 0 && (
                    <div style={{ padding: '10px 20px', borderTop: '1px solid #f1f5f9', fontSize: 12, color: '#94a3b8' }}>
                        {th ? `แสดง ${cameras.length} กล้อง` : `Showing ${cameras.length} cameras`}
                    </div>
                )}
            </div>

            {/* Add/Edit Modal */}
            {modalOpen && (
                <div style={{ position: 'fixed', inset: 0, zIndex: 20000, display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={() => setModalOpen(false)}>
                    <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(4px)' }} />
                    <div style={{ position: 'relative', background: '#fff', borderRadius: 16, width: 480, maxWidth: '95vw', maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 20px 60px rgba(0,0,0,0.15)' }} onClick={e => e.stopPropagation()}>
                        <div style={{ padding: '20px 24px', borderBottom: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <h2 style={{ margin: 0, fontSize: 17, fontWeight: 800, color: '#0f172a' }}>
                                {editCamera ? (th ? 'แก้ไขกล้อง' : 'Edit Camera') : (th ? 'เพิ่มกล้องใหม่' : 'New Camera')}
                            </h2>
                            <button onClick={() => setModalOpen(false)} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: '#94a3b8' }}>×</button>
                        </div>
                        <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 14 }}>
                            {/* Name */}
                            <div>
                                <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#475569', marginBottom: 4 }}>{th ? 'ชื่อกล้อง *' : 'Camera Name *'}</label>
                                <input value={formName} onChange={e => setFormName(e.target.value)} placeholder={th ? 'เช่น CP1 กล้องเหนือ' : 'e.g. CP1 North Camera'} style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1.5px solid #e2e8f0', fontSize: 13, outline: 'none', boxSizing: 'border-box' }} />
                            </div>
                            {/* Checkpoint */}
                            <div>
                                <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#475569', marginBottom: 4 }}>Checkpoint</label>
                                <select value={formCheckpointId} onChange={e => setFormCheckpointId(e.target.value)} style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1.5px solid #e2e8f0', fontSize: 13, boxSizing: 'border-box' }}>
                                    <option value="">{th ? '-- เลือก Checkpoint --' : '-- Select Checkpoint --'}</option>
                                    {checkpoints.map(cp => (
                                        <option key={cp._id} value={cp._id}>{cp.name}{cp.kmCumulative ? ` (${cp.kmCumulative}KM)` : ''}</option>
                                    ))}
                                </select>
                            </div>
                            {/* Stream URL */}
                            <div>
                                <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#475569', marginBottom: 4 }}>Stream URL</label>
                                <input value={formStreamUrl} onChange={e => setFormStreamUrl(e.target.value)} placeholder="https://www.youtube.com/embed/..." style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1.5px solid #e2e8f0', fontSize: 13, outline: 'none', boxSizing: 'border-box' }} />
                                <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 3 }}>
                                    {th ? 'URL สำหรับ embed เช่น YouTube Live, Facebook Live' : 'Embed URL e.g. YouTube Live, Facebook Live'}
                                </div>
                            </div>
                            {/* Device ID */}
                            <div>
                                <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#475569', marginBottom: 4 }}>{th ? 'รหัสอุปกรณ์' : 'Device ID'}</label>
                                <input value={formDeviceId} onChange={e => setFormDeviceId(e.target.value)} placeholder="MCU-XXXX" style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1.5px solid #e2e8f0', fontSize: 13, outline: 'none', boxSizing: 'border-box' }} />
                            </div>
                            {/* Coverage Zone */}
                            <div>
                                <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#475569', marginBottom: 4 }}>{th ? 'โซน/พื้นที่' : 'Coverage Zone'}</label>
                                <input value={formCoverageZone} onChange={e => setFormCoverageZone(e.target.value)} placeholder={th ? 'เช่น ทางเข้าหลัก' : 'e.g. Main Entrance'} style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1.5px solid #e2e8f0', fontSize: 13, outline: 'none', boxSizing: 'border-box' }} />
                            </div>
                            {/* Resolution */}
                            <div style={{ display: 'flex', gap: 12 }}>
                                <div style={{ flex: 1 }}>
                                    <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#475569', marginBottom: 4 }}>{th ? 'ความละเอียด' : 'Resolution'}</label>
                                    <select value={formResolution} onChange={e => setFormResolution(e.target.value)} style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1.5px solid #e2e8f0', fontSize: 13, boxSizing: 'border-box' }}>
                                        <option value="720p">720p</option>
                                        <option value="1080p">1080p</option>
                                        <option value="4K">4K</option>
                                    </select>
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8, paddingTop: 20 }}>
                                    <label style={{ position: 'relative', display: 'inline-block', width: 40, height: 22, cursor: 'pointer' }}>
                                        <input type="checkbox" checked={formIsLiveEnabled} onChange={e => setFormIsLiveEnabled(e.target.checked)} style={{ opacity: 0, width: 0, height: 0 }} />
                                        <span style={{ position: 'absolute', inset: 0, borderRadius: 11, background: formIsLiveEnabled ? '#ea580c' : '#cbd5e1', transition: 'background 0.2s' }} />
                                        <span style={{ position: 'absolute', top: 2, left: formIsLiveEnabled ? 20 : 2, width: 18, height: 18, borderRadius: '50%', background: '#fff', transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.15)' }} />
                                    </label>
                                    <span style={{ fontSize: 12, fontWeight: 600, color: '#475569' }}>Live</span>
                                </div>
                            </div>
                        </div>
                        <div style={{ padding: '16px 24px', borderTop: '1px solid #f1f5f9', display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                            <button onClick={() => setModalOpen(false)} style={{ padding: '8px 18px', borderRadius: 8, border: '1px solid #e2e8f0', background: '#fff', fontWeight: 600, fontSize: 13, cursor: 'pointer', color: '#64748b' }}>{th ? 'ยกเลิก' : 'Cancel'}</button>
                            <button onClick={handleSave} disabled={saving} style={{ padding: '8px 22px', borderRadius: 8, border: 'none', background: '#ea580c', color: '#fff', fontWeight: 700, fontSize: 13, cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.6 : 1 }}>
                                {saving ? '...' : (th ? 'บันทึก' : 'Save')}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Delete Confirmation Modal */}
            {deleteConfirm && (
                <div style={{ position: 'fixed', inset: 0, zIndex: 20000, display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={() => setDeleteConfirm(null)}>
                    <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(4px)' }} />
                    <div style={{ position: 'relative', background: '#fff', borderRadius: 16, width: 360, padding: 24, textAlign: 'center', boxShadow: '0 20px 60px rgba(0,0,0,0.15)' }} onClick={e => e.stopPropagation()}>
                        <div style={{ fontSize: 40, marginBottom: 12 }}>⚠️</div>
                        <h3 style={{ margin: '0 0 8px', fontSize: 16, fontWeight: 800, color: '#0f172a' }}>
                            {th ? 'ยืนยันการลบกล้อง' : 'Delete Camera'}
                        </h3>
                        <p style={{ color: '#64748b', fontSize: 13, marginBottom: 20 }}>
                            <strong>{deleteConfirm.name}</strong>
                        </p>
                        <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
                            <button onClick={() => setDeleteConfirm(null)} style={{ padding: '8px 18px', borderRadius: 8, border: '1px solid #e2e8f0', background: '#fff', fontWeight: 600, fontSize: 13, cursor: 'pointer', color: '#64748b' }}>{th ? 'ยกเลิก' : 'Cancel'}</button>
                            <button onClick={handleDelete} style={{ padding: '8px 18px', borderRadius: 8, border: 'none', background: '#dc2626', color: '#fff', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>{th ? 'ลบกล้อง' : 'Delete'}</button>
                        </div>
                    </div>
                </div>
            )}

            {/* Toast */}
            {toast && (
                <div style={{
                    position: 'fixed', bottom: 24, right: 24, zIndex: 10000,
                    padding: '12px 24px', borderRadius: 14, color: '#fff', fontWeight: 700, fontSize: 13,
                    background: toast.type === 'success' ? '#16a34a' : '#dc2626',
                    boxShadow: '0 10px 25px rgba(0,0,0,0.2)',
                }}>
                    {toast.type === 'success' ? '✅' : '❌'} {toast.msg}
                </div>
            )}
        </AdminLayout>
    );
}
