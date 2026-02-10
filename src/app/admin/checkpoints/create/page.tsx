'use client';

import { useEffect, useState } from 'react';
import { useLanguage } from '@/lib/language-context';
import api from '@/lib/api';
import AdminLayout from '../../AdminLayout';
import '../../admin.css';

interface RaceCategory {
    name: string;
    distance?: string;
    startTime?: string;
}

interface Campaign {
    _id: string;
    name: string;
    nameTh?: string;
    nameEn?: string;
    categories?: RaceCategory[];
}

interface NewCheckpoint {
    id: string;
    name: string;
    type: 'start' | 'checkpoint' | 'finish';
    orderNum: number;
}

export default function CreateCheckpointPage() {
    const { language } = useLanguage();
    const [campaigns, setCampaigns] = useState<Campaign[]>([]);
    const [selectedCampaignId, setSelectedCampaignId] = useState<string>('');
    const [selectedCategoryName, setSelectedCategoryName] = useState<string>('');
    const [step, setStep] = useState<'campaign' | 'category' | 'create'>('campaign');
    const [newCheckpoints, setNewCheckpoints] = useState<NewCheckpoint[]>([
        { id: crypto.randomUUID(), name: 'START', type: 'start', orderNum: 1 },
    ]);
    const [saving, setSaving] = useState(false);
    const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
    const [loading, setLoading] = useState(true);

    const showToast = (message: string, type: 'success' | 'error') => {
        setToast({ message, type });
        setTimeout(() => setToast(null), 3000);
    };

    // Load campaigns
    useEffect(() => {
        api.get('/campaigns')
            .then(res => {
                const list = Array.isArray(res.data) ? res.data : res.data?.data || [];
                setCampaigns(list);
            })
            .catch(() => setCampaigns([]))
            .finally(() => setLoading(false));
    }, []);

    const getSelectedCampaign = () => campaigns.find(c => c._id === selectedCampaignId);
    const getSelectedCategories = () => getSelectedCampaign()?.categories || [];

    const handleSelectCampaign = (campaignId: string) => {
        setSelectedCampaignId(campaignId);
        setSelectedCategoryName('');
        setStep('category');
    };

    const handleSelectCategory = (catName: string) => {
        setSelectedCategoryName(catName);
        setStep('create');
    };

    const handleAddCheckpoint = () => {
        const nextOrder = newCheckpoints.length + 1;
        setNewCheckpoints(prev => [
            ...prev,
            {
                id: crypto.randomUUID(),
                name: `CP${nextOrder - 1}`,
                type: 'checkpoint',
                orderNum: nextOrder,
            },
        ]);
    };

    const handleRemoveCheckpoint = (id: string) => {
        setNewCheckpoints(prev => {
            const updated = prev.filter(cp => cp.id !== id);
            return updated.map((cp, idx) => ({ ...cp, orderNum: idx + 1 }));
        });
    };

    const handleUpdateCheckpoint = (id: string, field: keyof NewCheckpoint, value: string | number) => {
        setNewCheckpoints(prev => prev.map(cp =>
            cp.id === id ? { ...cp, [field]: value } : cp
        ));
    };

    const handleSave = async () => {
        if (newCheckpoints.length === 0) {
            showToast(language === 'th' ? 'กรุณาเพิ่มจุด Checkpoint' : 'Please add checkpoints', 'error');
            return;
        }

        const emptyName = newCheckpoints.find(cp => !cp.name.trim());
        if (emptyName) {
            showToast(language === 'th' ? 'กรุณากรอกชื่อทุกจุด' : 'Please fill in all names', 'error');
            return;
        }

        setSaving(true);
        try {
            const checkpointsToSave = newCheckpoints.map(cp => ({
                campaignId: selectedCampaignId,
                name: cp.name.trim(),
                type: cp.type,
                orderNum: cp.orderNum,
                active: true,
            }));

            await api.post('/checkpoints/bulk', checkpointsToSave);
            showToast(
                language === 'th'
                    ? `บันทึก ${checkpointsToSave.length} จุดสำเร็จ`
                    : `Saved ${checkpointsToSave.length} checkpoints successfully`,
                'success'
            );

            setNewCheckpoints([
                { id: crypto.randomUUID(), name: 'START', type: 'start', orderNum: 1 },
            ]);
        } catch {
            showToast(language === 'th' ? 'เกิดข้อผิดพลาดในการบันทึก' : 'Error saving checkpoints', 'error');
        } finally {
            setSaving(false);
        }
    };

    return (
        <AdminLayout>
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
                <a href="/admin/checkpoints" className="breadcrumb-link" style={{ cursor: 'pointer' }}>
                    {language === 'th' ? 'จัดการจุด Checkpoint' : 'Checkpoints'}
                </a>
                <span className="breadcrumb-separator">/</span>
                <span className="breadcrumb-current">
                    {language === 'th' ? 'เพิ่มจุด Checkpoint' : 'Add Checkpoints'}
                </span>
            </div>

            <div className="content-box">
                <div className="events-header">
                    <h2 className="events-title">
                        {language === 'th' ? 'เพิ่มจุด Checkpoint' : 'Add Checkpoints'}
                    </h2>
                </div>

                {/* Step indicator */}
                <div style={{ display: 'flex', gap: 8, marginBottom: 24, padding: '0 4px', alignItems: 'center', flexWrap: 'wrap' }}>
                    <button
                        onClick={() => { setStep('campaign'); setSelectedCampaignId(''); setSelectedCategoryName(''); }}
                        style={{
                            padding: '6px 16px', borderRadius: 20, border: 'none', fontWeight: 600,
                            fontSize: 13, cursor: 'pointer',
                            background: step === 'campaign' ? '#3b82f6' : '#333', color: '#fff',
                        }}
                    >
                        1. {language === 'th' ? 'เลือกกิจกรรม' : 'Select Campaign'}
                    </button>
                    <span style={{ color: '#555' }}>→</span>
                    <button
                        onClick={() => { if (selectedCampaignId) setStep('category'); }}
                        disabled={!selectedCampaignId}
                        style={{
                            padding: '6px 16px', borderRadius: 20, border: 'none', fontWeight: 600,
                            fontSize: 13, cursor: selectedCampaignId ? 'pointer' : 'not-allowed',
                            background: step === 'category' ? '#3b82f6' : '#333',
                            color: '#fff', opacity: selectedCampaignId ? 1 : 0.5,
                        }}
                    >
                        2. {language === 'th' ? 'เลือกระยะทาง' : 'Select Distance'}
                    </button>
                    <span style={{ color: '#555' }}>→</span>
                    <button
                        onClick={() => { if (selectedCategoryName) setStep('create'); }}
                        disabled={!selectedCategoryName}
                        style={{
                            padding: '6px 16px', borderRadius: 20, border: 'none', fontWeight: 600,
                            fontSize: 13, cursor: selectedCategoryName ? 'pointer' : 'not-allowed',
                            background: step === 'create' ? '#3b82f6' : '#333',
                            color: '#fff', opacity: selectedCategoryName ? 1 : 0.5,
                        }}
                    >
                        3. {language === 'th' ? 'สร้างจุด' : 'Create Points'}
                    </button>
                </div>

                {/* Step 1: Select Campaign */}
                {step === 'campaign' && (
                    <div>
                        {loading ? (
                            <div className="events-loading">Loading...</div>
                        ) : campaigns.length === 0 ? (
                            <div className="events-empty" style={{ textAlign: 'center', padding: 40 }}>
                                <p style={{ color: '#999' }}>{language === 'th' ? 'ไม่มีกิจกรรม' : 'No campaigns found'}</p>
                            </div>
                        ) : (
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16 }}>
                                {campaigns.map(c => (
                                    <div
                                        key={c._id}
                                        onClick={() => handleSelectCampaign(c._id)}
                                        style={{
                                            padding: 20, borderRadius: 12, cursor: 'pointer',
                                            border: '2px solid #333', background: '#1a1a2e', transition: 'all 0.2s',
                                        }}
                                        onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.borderColor = '#3b82f6'; (e.currentTarget as HTMLDivElement).style.background = '#1e1e3a'; }}
                                        onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.borderColor = '#333'; (e.currentTarget as HTMLDivElement).style.background = '#1a1a2e'; }}
                                    >
                                        <p style={{ fontSize: 28, marginBottom: 8 }}>📋</p>
                                        <h3 style={{ fontWeight: 700, fontSize: 16, marginBottom: 4, color: '#fff' }}>
                                            {language === 'th' ? (c.nameTh || c.name) : (c.nameEn || c.name)}
                                        </h3>
                                        <p style={{ color: '#888', fontSize: 13 }}>
                                            {c.categories?.length || 0} {language === 'th' ? 'ระยะทาง' : 'distances'}
                                        </p>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                )}

                {/* Step 2: Select Distance (from campaign.categories) */}
                {step === 'category' && (
                    <div>
                        <div style={{ marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
                            <span style={{ color: '#888', fontSize: 13 }}>{language === 'th' ? 'กิจกรรม:' : 'Campaign:'}</span>
                            <span style={{ fontWeight: 600, color: '#fff' }}>
                                {(() => { const c = getSelectedCampaign(); return language === 'th' ? (c?.nameTh || c?.name) : (c?.nameEn || c?.name); })()}
                            </span>
                        </div>

                        {getSelectedCategories().length === 0 ? (
                            <div className="events-empty" style={{ textAlign: 'center', padding: 40 }}>
                                <p style={{ color: '#999' }}>
                                    {language === 'th' ? 'ไม่มีระยะทางในกิจกรรมนี้' : 'No distances found for this campaign'}
                                </p>
                            </div>
                        ) : (
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 16 }}>
                                {getSelectedCategories().map((cat, idx) => (
                                    <div
                                        key={`${cat.name}-${idx}`}
                                        onClick={() => handleSelectCategory(cat.name)}
                                        style={{
                                            padding: 20, borderRadius: 12, cursor: 'pointer',
                                            border: '2px solid #333', background: '#1a1a2e', transition: 'all 0.2s',
                                        }}
                                        onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.borderColor = '#22c55e'; (e.currentTarget as HTMLDivElement).style.background = '#1e1e3a'; }}
                                        onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.borderColor = '#333'; (e.currentTarget as HTMLDivElement).style.background = '#1a1a2e'; }}
                                    >
                                        <p style={{ fontSize: 28, marginBottom: 8 }}>🏃</p>
                                        <h3 style={{ fontWeight: 700, fontSize: 16, marginBottom: 4, color: '#fff' }}>
                                            {cat.name}
                                        </h3>
                                        {cat.distance && (
                                            <p style={{ color: '#888', fontSize: 13 }}>{cat.distance}</p>
                                        )}
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                )}

                {/* Step 3: Create Checkpoints */}
                {step === 'create' && (
                    <div>
                        <div style={{ marginBottom: 16, display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
                            <div>
                                <span style={{ color: '#888', fontSize: 13 }}>{language === 'th' ? 'กิจกรรม:' : 'Campaign:'}</span>{' '}
                                <span style={{ fontWeight: 600, color: '#fff' }}>
                                    {(() => { const c = getSelectedCampaign(); return language === 'th' ? (c?.nameTh || c?.name) : (c?.nameEn || c?.name); })()}
                                </span>
                            </div>
                            <div>
                                <span style={{ color: '#888', fontSize: 13 }}>{language === 'th' ? 'ระยะทาง:' : 'Distance:'}</span>{' '}
                                <span style={{ fontWeight: 600, color: '#22c55e' }}>{selectedCategoryName}</span>
                            </div>
                        </div>

                        <table className="data-table" style={{ marginBottom: 16 }}>
                            <thead>
                                <tr>
                                    <th style={{ width: 60 }}>{language === 'th' ? 'ลำดับ' : 'Order'}</th>
                                    <th>{language === 'th' ? 'ชื่อจุด' : 'Name'}</th>
                                    <th style={{ width: 160 }}>{language === 'th' ? 'ประเภท' : 'Type'}</th>
                                    <th style={{ width: 60 }}></th>
                                </tr>
                            </thead>
                            <tbody>
                                {newCheckpoints.map((cp, idx) => (
                                    <tr key={cp.id}>
                                        <td style={{ textAlign: 'center', fontWeight: 700, color: '#fff' }}>{idx + 1}</td>
                                        <td>
                                            <input
                                                type="text"
                                                value={cp.name}
                                                onChange={e => handleUpdateCheckpoint(cp.id, 'name', e.target.value)}
                                                placeholder={language === 'th' ? 'ชื่อจุด เช่น START, CP1' : 'Name e.g. START, CP1'}
                                                style={{
                                                    width: '100%', padding: '6px 10px', borderRadius: 6,
                                                    border: '1px solid #444', background: '#1e1e2a', color: '#fff', fontSize: 14,
                                                }}
                                            />
                                        </td>
                                        <td>
                                            <select
                                                value={cp.type}
                                                onChange={e => handleUpdateCheckpoint(cp.id, 'type', e.target.value)}
                                                style={{
                                                    width: '100%', padding: '6px 10px', borderRadius: 6,
                                                    border: '1px solid #444', background: '#1e1e2a', color: '#fff', fontSize: 14,
                                                }}
                                            >
                                                <option value="start">{language === 'th' ? 'จุดเริ่มต้น (Start)' : 'Start'}</option>
                                                <option value="checkpoint">{language === 'th' ? 'จุดตรวจ - RFID' : 'Checkpoint - RFID'}</option>
                                                <option value="finish">{language === 'th' ? 'จุดสิ้นสุด (Finish)' : 'Finish'}</option>
                                            </select>
                                        </td>
                                        <td style={{ textAlign: 'center' }}>
                                            {newCheckpoints.length > 1 && (
                                                <button
                                                    onClick={() => handleRemoveCheckpoint(cp.id)}
                                                    style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: 16 }}
                                                    title={language === 'th' ? 'ลบ' : 'Remove'}
                                                >
                                                    ✕
                                                </button>
                                            )}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>

                        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                            <button
                                onClick={handleAddCheckpoint}
                                style={{
                                    padding: '8px 20px', borderRadius: 8, border: '2px dashed #555',
                                    background: 'transparent', color: '#aaa', fontWeight: 600, cursor: 'pointer', fontSize: 14,
                                }}
                            >
                                + {language === 'th' ? 'เพิ่มจุด Checkpoint' : 'Add Checkpoint'}
                            </button>
                            <button
                                onClick={handleSave}
                                disabled={saving}
                                style={{
                                    padding: '8px 24px', borderRadius: 8, border: 'none',
                                    background: '#22c55e', color: '#fff', fontWeight: 700,
                                    cursor: saving ? 'not-allowed' : 'pointer',
                                    opacity: saving ? 0.7 : 1, fontSize: 14,
                                }}
                            >
                                {saving ? (language === 'th' ? 'กำลังบันทึก...' : 'Saving...') : (language === 'th' ? '💾 บันทึก' : '💾 Save')}
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </AdminLayout>
    );
}
