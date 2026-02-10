'use client';

import { useEffect, useState } from 'react';
import { useLanguage } from '@/lib/language-context';
import api from '@/lib/api';
import AdminLayout from '../AdminLayout';
import '../admin.css';

interface Checkpoint {
    _id: string;
    uuid: string;
    campaignId: string;
    name: string;
    type: string; // 'start' | 'checkpoint' | 'finish'
    orderNum: number;
    active: boolean;
    description?: string;
    location?: string;
}

interface Campaign {
    _id: string;
    name: string;
    nameTh?: string;
    nameEn?: string;
}

export default function ManageCheckpointsPage() {
    const { language } = useLanguage();
    const [campaigns, setCampaigns] = useState<Campaign[]>([]);
    const [selectedCampaignId, setSelectedCampaignId] = useState<string>('');
    const [checkpoints, setCheckpoints] = useState<Checkpoint[]>([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

    // Load campaigns
    useEffect(() => {
        api.get('/campaigns')
            .then(res => {
                const list = Array.isArray(res.data) ? res.data : res.data?.data || [];
                setCampaigns(list);
                if (list.length > 0) {
                    setSelectedCampaignId(list[0]._id);
                }
            })
            .catch(() => setCampaigns([]))
            .finally(() => setLoading(false));
    }, []);

    // Load checkpoints when campaign changes
    useEffect(() => {
        if (!selectedCampaignId) return;
        setLoading(true);
        api.get(`/checkpoints/campaign/${selectedCampaignId}`)
            .then(res => {
                const list = Array.isArray(res.data) ? res.data : [];
                list.sort((a: Checkpoint, b: Checkpoint) => a.orderNum - b.orderNum);
                setCheckpoints(list);
            })
            .catch(() => setCheckpoints([]))
            .finally(() => setLoading(false));
    }, [selectedCampaignId]);

    const showToast = (message: string, type: 'success' | 'error') => {
        setToast({ message, type });
        setTimeout(() => setToast(null), 3000);
    };

    const handleToggleActive = async (checkpoint: Checkpoint) => {
        const newActive = !checkpoint.active;
        // Optimistic update
        setCheckpoints(prev => prev.map(cp =>
            cp._id === checkpoint._id ? { ...cp, active: newActive } : cp
        ));
        try {
            await api.put(`/checkpoints/${checkpoint._id}`, { active: newActive });
            showToast(
                language === 'th'
                    ? `${checkpoint.name} ${newActive ? 'เปิดใช้งาน' : 'ปิดใช้งาน'}แล้ว`
                    : `${checkpoint.name} ${newActive ? 'activated' : 'deactivated'}`,
                'success'
            );
        } catch {
            // Revert
            setCheckpoints(prev => prev.map(cp =>
                cp._id === checkpoint._id ? { ...cp, active: !newActive } : cp
            ));
            showToast(language === 'th' ? 'เกิดข้อผิดพลาด' : 'Error updating', 'error');
        }
    };

    const handleDeleteCheckpoint = async (checkpoint: Checkpoint) => {
        if (!confirm(language === 'th'
            ? `ต้องการลบจุด "${checkpoint.name}" หรือไม่?`
            : `Delete checkpoint "${checkpoint.name}"?`
        )) return;

        try {
            await api.delete(`/checkpoints/${checkpoint._id}`);
            setCheckpoints(prev => prev.filter(cp => cp._id !== checkpoint._id));
            showToast(language === 'th' ? 'ลบสำเร็จ' : 'Deleted successfully', 'success');
        } catch {
            showToast(language === 'th' ? 'เกิดข้อผิดพลาด' : 'Error deleting', 'error');
        }
    };

    const handleSaveOrder = async () => {
        setSaving(true);
        try {
            const updates = checkpoints.map((cp, idx) => ({
                id: cp._id,
                orderNum: idx + 1,
            }));
            await api.put('/checkpoints/bulk/update', updates);
            showToast(language === 'th' ? 'บันทึกลำดับสำเร็จ' : 'Order saved successfully', 'success');
        } catch {
            showToast(language === 'th' ? 'เกิดข้อผิดพลาด' : 'Error saving order', 'error');
        } finally {
            setSaving(false);
        }
    };

    // Drag-to-reorder
    const [dragIdx, setDragIdx] = useState<number | null>(null);

    const handleDragStart = (idx: number) => {
        setDragIdx(idx);
    };

    const handleDragOver = (e: React.DragEvent, idx: number) => {
        e.preventDefault();
        if (dragIdx === null || dragIdx === idx) return;
        const updated = [...checkpoints];
        const [dragged] = updated.splice(dragIdx, 1);
        updated.splice(idx, 0, dragged);
        setCheckpoints(updated);
        setDragIdx(idx);
    };

    const handleDragEnd = () => {
        setDragIdx(null);
    };

    const getTypeBadge = (type: string) => {
        const styles: Record<string, { bg: string; label: string; labelEn: string }> = {
            start: { bg: '#22c55e', label: 'จุดเริ่มต้น', labelEn: 'Start' },
            checkpoint: { bg: '#3b82f6', label: 'จุดตรวจ', labelEn: 'Checkpoint' },
            finish: { bg: '#ef4444', label: 'จุดสิ้นสุด', labelEn: 'Finish' },
        };
        const s = styles[type] || { bg: '#6b7280', label: type, labelEn: type };
        return (
            <span
                className="inline-block px-2 py-0.5 rounded text-xs font-bold text-white"
                style={{ backgroundColor: s.bg }}
            >
                {language === 'th' ? s.label : s.labelEn}
            </span>
        );
    };

    return (
        <AdminLayout>
            {/* Toast */}
            {toast && (
                <div
                    style={{
                        position: 'fixed', top: 20, right: 20, zIndex: 9999,
                        padding: '12px 24px', borderRadius: 8, color: '#fff', fontWeight: 600,
                        background: toast.type === 'success' ? '#22c55e' : '#ef4444',
                        boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
                    }}
                >
                    {toast.message}
                </div>
            )}

            <div className="admin-breadcrumb">
                <a href="/admin/events" className="breadcrumb-link">Admin</a>
                <span className="breadcrumb-separator">/</span>
                <span className="breadcrumb-current">
                    {language === 'th' ? 'จัดการจุด Checkpoint' : 'Manage Checkpoints'}
                </span>
            </div>

            <div className="content-box">
                <div className="events-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
                    <h2 className="events-title">
                        {language === 'th' ? 'จัดการจุด Checkpoint' : 'Manage Checkpoints'}
                    </h2>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                        <select
                            value={selectedCampaignId}
                            onChange={e => setSelectedCampaignId(e.target.value)}
                            style={{
                                padding: '6px 12px', borderRadius: 6, border: '1px solid #555',
                                background: '#1e1e2a', color: '#fff', fontSize: 14,
                            }}
                        >
                            {campaigns.map(c => (
                                <option key={c._id} value={c._id}>
                                    {language === 'th' ? (c.nameTh || c.name) : (c.nameEn || c.name)}
                                </option>
                            ))}
                        </select>
                        <button
                            onClick={handleSaveOrder}
                            disabled={saving}
                            style={{
                                padding: '6px 16px', borderRadius: 6, border: 'none',
                                background: '#3b82f6', color: '#fff', fontWeight: 600, fontSize: 14,
                                cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.7 : 1,
                            }}
                        >
                            {saving
                                ? (language === 'th' ? 'กำลังบันทึก...' : 'Saving...')
                                : (language === 'th' ? 'บันทึกลำดับ' : 'Save Order')}
                        </button>
                    </div>
                </div>

                {loading ? (
                    <div className="events-loading">Loading...</div>
                ) : checkpoints.length === 0 ? (
                    <div className="events-empty" style={{ textAlign: 'center', padding: 40 }}>
                        <p style={{ fontSize: 48, marginBottom: 12 }}>📍</p>
                        <p style={{ color: '#999' }}>
                            {language === 'th' ? 'ยังไม่มีจุด Checkpoint' : 'No checkpoints found'}
                        </p>
                        <a
                            href="/admin/checkpoints/create"
                            style={{
                                display: 'inline-block', marginTop: 12, padding: '8px 20px',
                                borderRadius: 6, background: '#22c55e', color: '#fff',
                                fontWeight: 600, textDecoration: 'none',
                            }}
                        >
                            {language === 'th' ? '+ เพิ่มจุด Checkpoint' : '+ Add Checkpoint'}
                        </a>
                    </div>
                ) : (
                    <table className="data-table">
                        <thead>
                            <tr>
                                <th style={{ width: 40 }}></th>
                                <th style={{ width: 50 }}>{language === 'th' ? 'เปิด/ปิด' : 'Active'}</th>
                                <th style={{ width: 50 }}>#</th>
                                <th>{language === 'th' ? 'ชื่อจุด' : 'Name'}</th>
                                <th>{language === 'th' ? 'ประเภท' : 'Type'}</th>
                                <th style={{ width: 80 }}>{language === 'th' ? 'จัดการ' : 'Actions'}</th>
                            </tr>
                        </thead>
                        <tbody>
                            {checkpoints.map((cp, idx) => (
                                <tr
                                    key={cp._id}
                                    draggable
                                    onDragStart={() => handleDragStart(idx)}
                                    onDragOver={e => handleDragOver(e, idx)}
                                    onDragEnd={handleDragEnd}
                                    style={{
                                        cursor: 'grab',
                                        opacity: dragIdx === idx ? 0.5 : 1,
                                        background: dragIdx === idx ? 'rgba(59,130,246,0.1)' : undefined,
                                    }}
                                >
                                    <td style={{ textAlign: 'center', cursor: 'grab' }}>
                                        <span style={{ fontSize: 16, color: '#888' }}>⠿</span>
                                    </td>
                                    <td style={{ textAlign: 'center' }}>
                                        <label style={{ position: 'relative', display: 'inline-block', width: 36, height: 20, cursor: 'pointer' }}>
                                            <input
                                                type="checkbox"
                                                checked={cp.active}
                                                onChange={() => handleToggleActive(cp)}
                                                style={{ opacity: 0, width: 0, height: 0, position: 'absolute' }}
                                            />
                                            <span style={{
                                                position: 'absolute', inset: 0, borderRadius: 10,
                                                background: cp.active ? '#22c55e' : '#555',
                                                transition: 'background 0.3s',
                                            }} />
                                            <span style={{
                                                position: 'absolute', left: cp.active ? 18 : 2, top: 2,
                                                width: 16, height: 16, borderRadius: '50%',
                                                background: '#fff', transition: 'left 0.3s',
                                                boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
                                            }} />
                                        </label>
                                    </td>
                                    <td style={{ textAlign: 'center', fontWeight: 600 }}>{idx + 1}</td>
                                    <td style={{ fontWeight: 500 }}>{cp.name}</td>
                                    <td>{getTypeBadge(cp.type)}</td>
                                    <td style={{ textAlign: 'center' }}>
                                        <button
                                            onClick={() => handleDeleteCheckpoint(cp)}
                                            style={{
                                                background: 'none', border: 'none', color: '#ef4444',
                                                cursor: 'pointer', fontSize: 16,
                                            }}
                                            title={language === 'th' ? 'ลบ' : 'Delete'}
                                        >
                                            🗑️
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </div>
        </AdminLayout>
    );
}
