'use client';

import { useEffect, useState } from 'react';
import { useLanguage } from '@/lib/language-context';
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
    categories?: { name: string; distance?: string }[];
    pictureUrl?: string;
}

export default function ManageCheckpointsPage() {
    const { language } = useLanguage();
    const [campaigns, setCampaigns] = useState<Campaign[]>([]);
    const [selectedCampaignId, setSelectedCampaignId] = useState<string>('');
    const [checkpoints, setCheckpoints] = useState<Checkpoint[]>([]);
    const [loading, setLoading] = useState(true);
    const [loadingCheckpoints, setLoadingCheckpoints] = useState(false);
    const [saving, setSaving] = useState(false);
    const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

    // Load campaigns
    useEffect(() => {
        fetch('/api/campaigns', { cache: 'no-store' })
            .then(res => res.json())
            .then(json => {
                const list = Array.isArray(json) ? json : json?.data || [];
                setCampaigns(list);
            })
            .catch(() => setCampaigns([]))
            .finally(() => setLoading(false));
    }, []);

    // Auto-select featured campaign (starred event) when opening the page
    useEffect(() => {
        if (!campaigns.length || selectedCampaignId) return;
        fetch('/api/campaigns/featured', { cache: 'no-store' })
            .then(res => res.ok ? res.json() : null)
            .then(data => {
                if (data && data._id && campaigns.some(c => c._id === data._id)) {
                    setSelectedCampaignId(data._id);
                }
            })
            .catch(() => undefined);
    }, [campaigns, selectedCampaignId]);

    // Load checkpoints when campaign changes
    useEffect(() => {
        if (!selectedCampaignId) return;
        setLoadingCheckpoints(true);
        fetch(`/api/checkpoints/campaign/${selectedCampaignId}`, { cache: 'no-store' })
            .then(res => res.json())
            .then(json => {
                const list = Array.isArray(json) ? json : [];
                list.sort((a: Checkpoint, b: Checkpoint) => a.orderNum - b.orderNum);
                setCheckpoints(list);
            })
            .catch(() => setCheckpoints([]))
            .finally(() => setLoadingCheckpoints(false));
    }, [selectedCampaignId]);

    const showToast = (message: string, type: 'success' | 'error') => {
        setToast({ message, type });
        setTimeout(() => setToast(null), 3000);
    };

    const handleSelectCampaign = (campaignId: string) => {
        setSelectedCampaignId(campaignId);
    };

    const handleBackToCampaigns = () => {
        setSelectedCampaignId('');
        setCheckpoints([]);
    };

    const getSelectedCampaign = () => campaigns.find(c => c._id === selectedCampaignId);

    const handleToggleActive = async (checkpoint: Checkpoint) => {
        const newActive = !checkpoint.active;
        // Optimistic update
        setCheckpoints(prev => prev.map(cp =>
            cp._id === checkpoint._id ? { ...cp, active: newActive } : cp
        ));
        try {
            const res = await fetch(`/api/checkpoints/${checkpoint._id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ active: newActive }),
            });
            if (!res.ok) throw new Error('Failed to update');
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
            const res = await fetch(`/api/checkpoints/${checkpoint._id}`, { method: 'DELETE' });
            if (!res.ok) throw new Error('Failed to delete');
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
            const res = await fetch('/api/checkpoints', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(updates),
            });
            if (!res.ok) throw new Error('Failed to save order');
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
            <span style={{
                display: 'inline-block', padding: '2px 8px', borderRadius: 4,
                fontSize: 12, fontWeight: 700, color: '#fff', backgroundColor: s.bg,
            }}>
                {language === 'th' ? s.label : s.labelEn}
            </span>
        );
    };

    return (
        <AdminLayout>
            {/* Toast */}
            {toast && (
                <div style={{
                    position: 'fixed', top: 20, right: 20, zIndex: 9999,
                    padding: '12px 24px', borderRadius: 8, color: '#fff', fontWeight: 600,
                    background: toast.type === 'success' ? '#22c55e' : '#ef4444',
                    boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
                }}>
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
                {/* Campaign not selected - show campaign cards */}
                {!selectedCampaignId ? (
                    <>
                        <div className="events-header">
                            <h2 className="events-title">
                                {language === 'th' ? 'เลือกกิจกรรม' : 'Select Campaign'}
                            </h2>
                        </div>

                        {loading ? (
                            <div className="events-loading">Loading...</div>
                        ) : campaigns.length === 0 ? (
                            <div className="events-empty" style={{ textAlign: 'center', padding: 40 }}>
                                <p style={{ color: '#999' }}>{language === 'th' ? 'ไม่มีกิจกรรม' : 'No campaigns found'}</p>
                            </div>
                        ) : (
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16, padding: '8px 0' }}>
                                {campaigns.map(c => (
                                    <div
                                        key={c._id}
                                        onClick={() => handleSelectCampaign(c._id)}
                                        style={{
                                            padding: 20, borderRadius: 12, cursor: 'pointer',
                                            border: '2px solid #d1d5db', background: '#fff', transition: 'all 0.2s',
                                            display: 'flex', flexDirection: 'column', gap: 8,
                                        }}
                                        onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.borderColor = '#3b82f6'; (e.currentTarget as HTMLDivElement).style.background = '#f0f7ff'; (e.currentTarget as HTMLDivElement).style.transform = 'translateY(-2px)'; (e.currentTarget as HTMLDivElement).style.boxShadow = '0 4px 12px rgba(59,130,246,0.15)'; }}
                                        onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.borderColor = '#d1d5db'; (e.currentTarget as HTMLDivElement).style.background = '#fff'; (e.currentTarget as HTMLDivElement).style.transform = 'translateY(0)'; (e.currentTarget as HTMLDivElement).style.boxShadow = 'none'; }}
                                    >
                                        {c.pictureUrl ? (
                                            <img
                                                src={c.pictureUrl}
                                                alt={c.name}
                                                style={{ width: '100%', height: 120, objectFit: 'cover', borderRadius: 8 }}
                                            />
                                        ) : (
                                            <div style={{
                                                width: '100%', height: 80, borderRadius: 8, background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                            }}>
                                                <span style={{ fontSize: 32 }}>🏃</span>
                                            </div>
                                        )}
                                        <h3 style={{ fontWeight: 700, fontSize: 16, color: '#333', margin: 0 }}>
                                            {language === 'th' ? (c.nameTh || c.name) : (c.nameEn || c.name)}
                                        </h3>
                                        <p style={{ color: '#888', fontSize: 13, margin: 0 }}>
                                            {c.categories?.length || 0} {language === 'th' ? 'ระยะทาง' : 'distances'}
                                        </p>
                                    </div>
                                ))}
                            </div>
                        )}
                    </>
                ) : (
                    <>
                        {/* Campaign selected - show checkpoints */}
                        <div className="events-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                                <button
                                    onClick={handleBackToCampaigns}
                                    style={{
                                        padding: '6px 12px', borderRadius: 6, border: '1px solid #d1d5db',
                                        background: '#fff', color: '#374151', fontSize: 13, cursor: 'pointer',
                                        fontWeight: 600,
                                    }}
                                >
                                    ← {language === 'th' ? 'กลับ' : 'Back'}
                                </button>
                                <h2 className="events-title" style={{ margin: 0 }}>
                                    {(() => { const c = getSelectedCampaign(); return language === 'th' ? (c?.nameTh || c?.name) : (c?.nameEn || c?.name); })()}
                                    {' - '}
                                    {language === 'th' ? 'จุด Checkpoint' : 'Checkpoints'} ({checkpoints.length})
                                </h2>
                            </div>
                            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                                <a
                                    href="/admin/checkpoints/create"
                                    style={{
                                        padding: '6px 16px', borderRadius: 6, border: 'none',
                                        background: '#22c55e', color: '#fff', fontWeight: 600, fontSize: 14,
                                        textDecoration: 'none', display: 'inline-block',
                                    }}
                                >
                                    + {language === 'th' ? 'เพิ่มจุด' : 'Add'}
                                </a>
                                {checkpoints.length > 0 && (
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
                                )}
                            </div>
                        </div>

                        {loadingCheckpoints ? (
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
                                                        background: cp.active ? '#22c55e' : '#d1d5db',
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
                    </>
                )}
            </div>
        </AdminLayout>
    );
}
