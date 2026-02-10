'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useLanguage } from '@/lib/language-context';
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

// Unified checkpoint item (both DB and new)
interface CheckpointItem {
    key: string;        // unique key for React (= _id for DB items, localId for new)
    _id?: string;       // MongoDB _id (if saved in DB)
    name: string;
    type: string;       // rfid | manual | start | finish
    orderNum: number;
    isNew: boolean;     // true = not yet saved to DB
}

const TYPE_OPTIONS = ['rfid', 'manual', 'start', 'finish'];

export default function CreateCheckpointPage() {
    const { language } = useLanguage();
    const [campaigns, setCampaigns] = useState<Campaign[]>([]);
    const [selectedCampaignId, setSelectedCampaignId] = useState<string>('');
    const [selectedCategoryName, setSelectedCategoryName] = useState<string>('');
    const [step, setStep] = useState<'campaign' | 'category' | 'create'>('campaign');

    // Unified checkpoint list (DB + new)
    const [checkpoints, setCheckpoints] = useState<CheckpointItem[]>([]);

    const [saving, setSaving] = useState(false);
    const [autoSaving, setAutoSaving] = useState(false);
    const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
    const [loading, setLoading] = useState(true);
    const [loadingCheckpoints, setLoadingCheckpoints] = useState(false);

    // Drag state
    const [dragIdx, setDragIdx] = useState<number | null>(null);
    const dragOverIdx = useRef<number | null>(null);

    const showToast = (message: string, type: 'success' | 'error') => {
        setToast({ message, type });
        setTimeout(() => setToast(null), 3000);
    };

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

    // Load existing checkpoints from DB
    const loadExistingCheckpoints = useCallback(async (campaignId: string) => {
        setLoadingCheckpoints(true);
        try {
            const res = await fetch(`/api/checkpoints/campaign/${campaignId}`, { cache: 'no-store' });
            if (res.ok) {
                const data = await res.json();
                const list = Array.isArray(data) ? data : [];
                list.sort((a: { orderNum: number }, b: { orderNum: number }) => a.orderNum - b.orderNum);
                const mapped: CheckpointItem[] = list.map((cp: { _id: string; name: string; type: string; description?: string; orderNum: number }) => ({
                    key: cp._id,
                    _id: cp._id,
                    name: cp.name,
                    type: cp.description || cp.type || 'rfid',
                    orderNum: cp.orderNum,
                    isNew: false,
                }));
                setCheckpoints(mapped);
            } else {
                setCheckpoints([]);
            }
        } catch {
            setCheckpoints([]);
        } finally {
            setLoadingCheckpoints(false);
        }
    }, []);

    // --- Auto-save: update existing checkpoint in DB ---
    const saveExistingCheckpoint = async (id: string, data: { type?: string; orderNum?: number }) => {
        try {
            // Map type to backend fields
            const body: Record<string, unknown> = {};
            if (data.type !== undefined) body.description = data.type;
            if (data.orderNum !== undefined) body.orderNum = data.orderNum;
            await fetch(`/api/checkpoints/${id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
            });
        } catch {
            // silent fail - will show toast on bulk save
        }
    };

    // --- Auto-save: bulk update order for all existing checkpoints ---
    const saveOrderToDb = async (items: CheckpointItem[]) => {
        setAutoSaving(true);
        try {
            const existingItems = items.filter(cp => !cp.isNew && cp._id);
            if (existingItems.length === 0) return;
            const updates = existingItems.map(cp => ({
                id: cp._id!,
                orderNum: cp.orderNum,
            }));
            const res = await fetch('/api/checkpoints', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(updates),
            });
            if (res.ok) {
                showToast(language === 'th' ? 'บันทึกลำดับแล้ว' : 'Order saved', 'success');
            }
        } catch {
            showToast(language === 'th' ? 'บันทึกลำดับไม่สำเร็จ' : 'Failed to save order', 'error');
        } finally {
            setAutoSaving(false);
        }
    };

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
        loadExistingCheckpoints(selectedCampaignId);
    };

    // --- Add new checkpoint ---
    const handleAddCheckpoint = () => {
        setCheckpoints(prev => {
            const newOrder = prev.length + 1;
            return [...prev, {
                key: crypto.randomUUID(),
                name: '',
                type: 'rfid',
                orderNum: newOrder,
                isNew: true,
            }];
        });
    };

    // --- Delete checkpoint ---
    const handleDelete = async (item: CheckpointItem) => {
        if (!item.isNew && item._id) {
            // Delete from DB
            try {
                const res = await fetch(`/api/checkpoints/${item._id}`, { method: 'DELETE' });
                if (!res.ok) throw new Error('Failed');
                showToast(language === 'th' ? `ลบ "${item.name}" แล้ว` : `Deleted "${item.name}"`, 'success');
            } catch {
                showToast(language === 'th' ? 'ลบไม่สำเร็จ' : 'Delete failed', 'error');
                return;
            }
        }
        // Remove from list and re-number
        setCheckpoints(prev => {
            const updated = prev.filter(cp => cp.key !== item.key);
            const reNumbered = updated.map((cp, idx) => ({ ...cp, orderNum: idx + 1 }));
            // Save new order for existing items
            const existingChanged = reNumbered.filter(cp => !cp.isNew && cp._id);
            if (existingChanged.length > 0) {
                saveOrderToDb(reNumbered);
            }
            return reNumbered;
        });
    };

    // --- Update name (for new items) ---
    const handleUpdateName = (key: string, name: string) => {
        setCheckpoints(prev => prev.map(cp =>
            cp.key === key ? { ...cp, name } : cp
        ));
    };

    // --- Update type (auto-save for existing) ---
    const handleUpdateType = (key: string, type: string) => {
        setCheckpoints(prev => prev.map(cp => {
            if (cp.key === key) {
                const updated = { ...cp, type };
                // Auto-save for existing DB items
                if (!cp.isNew && cp._id) {
                    saveExistingCheckpoint(cp._id, { type });
                    showToast(language === 'th' ? `อัปเดตประเภท "${cp.name}" แล้ว` : `Updated type for "${cp.name}"`, 'success');
                }
                return updated;
            }
            return cp;
        }));
    };

    // --- Drag & Drop ---
    const handleDragStart = (idx: number) => {
        setDragIdx(idx);
    };

    const handleDragOver = (e: React.DragEvent, idx: number) => {
        e.preventDefault();
        if (dragIdx === null || dragIdx === idx) return;
        dragOverIdx.current = idx;

        setCheckpoints(prev => {
            const updated = [...prev];
            const [dragged] = updated.splice(dragIdx, 1);
            updated.splice(idx, 0, dragged);
            return updated.map((cp, i) => ({ ...cp, orderNum: i + 1 }));
        });
        setDragIdx(idx);
    };

    const handleDragEnd = () => {
        setDragIdx(null);
        dragOverIdx.current = null;
        // Auto-save order to DB
        saveOrderToDb(checkpoints);
    };

    // --- Save new checkpoints to DB ---
    const handleSaveNew = async () => {
        const newItems = checkpoints.filter(cp => cp.isNew);
        if (newItems.length === 0) {
            showToast(language === 'th' ? 'ไม่มีจุดใหม่ที่ต้องบันทึก' : 'No new checkpoints to save', 'error');
            return;
        }
        const emptyName = newItems.find(cp => !cp.name.trim());
        if (emptyName) {
            showToast(language === 'th' ? 'กรุณากรอกชื่อทุกจุดที่เพิ่มใหม่' : 'Please fill in all names', 'error');
            return;
        }

        setSaving(true);
        try {
            const toSave = newItems.map(cp => ({
                campaignId: selectedCampaignId,
                name: cp.name.trim(),
                type: 'checkpoint' as const,
                description: cp.type,
                orderNum: cp.orderNum,
                active: true,
            }));

            const res = await fetch('/api/checkpoints', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(toSave),
            });
            if (!res.ok) throw new Error('Failed');

            showToast(
                language === 'th' ? `บันทึก ${toSave.length} จุดใหม่สำเร็จ` : `Saved ${toSave.length} checkpoints`,
                'success'
            );
            // Reload all from DB
            await loadExistingCheckpoints(selectedCampaignId);
        } catch {
            showToast(language === 'th' ? 'บันทึกไม่สำเร็จ' : 'Save failed', 'error');
        } finally {
            setSaving(false);
        }
    };

    const handleCancel = () => {
        setStep('category');
        setCheckpoints([]);
    };

    const newCount = checkpoints.filter(cp => cp.isNew).length;
    const savedCount = checkpoints.filter(cp => !cp.isNew).length;

    // Type badge color
    const getTypeColor = (type: string) => {
        switch (type) {
            case 'start': return { bg: '#dcfce7', text: '#16a34a', border: '#bbf7d0' };
            case 'finish': return { bg: '#fee2e2', text: '#dc2626', border: '#fecaca' };
            case 'manual': return { bg: '#fef3c7', text: '#d97706', border: '#fde68a' };
            default: return { bg: '#dbeafe', text: '#2563eb', border: '#bfdbfe' }; // rfid
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
                        onClick={() => { setStep('campaign'); setSelectedCampaignId(''); setSelectedCategoryName(''); setCheckpoints([]); }}
                        style={{ padding: '6px 16px', borderRadius: 20, border: 'none', fontWeight: 600, fontSize: 13, cursor: 'pointer', background: step === 'campaign' ? '#3b82f6' : '#333', color: '#fff' }}
                    >
                        1. {language === 'th' ? 'เลือกกิจกรรม' : 'Select Campaign'}
                    </button>
                    <span style={{ color: '#555' }}>→</span>
                    <button
                        onClick={() => { if (selectedCampaignId) { setStep('category'); setCheckpoints([]); } }}
                        disabled={!selectedCampaignId}
                        style={{ padding: '6px 16px', borderRadius: 20, border: 'none', fontWeight: 600, fontSize: 13, cursor: selectedCampaignId ? 'pointer' : 'not-allowed', background: step === 'category' ? '#3b82f6' : '#333', color: '#fff', opacity: selectedCampaignId ? 1 : 0.5 }}
                    >
                        2. {language === 'th' ? 'เลือกระยะทาง' : 'Select Distance'}
                    </button>
                    <span style={{ color: '#555' }}>→</span>
                    <button
                        onClick={() => { if (selectedCategoryName) { setStep('create'); loadExistingCheckpoints(selectedCampaignId); } }}
                        disabled={!selectedCategoryName}
                        style={{ padding: '6px 16px', borderRadius: 20, border: 'none', fontWeight: 600, fontSize: 13, cursor: selectedCategoryName ? 'pointer' : 'not-allowed', background: step === 'create' ? '#3b82f6' : '#333', color: '#fff', opacity: selectedCategoryName ? 1 : 0.5 }}
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
                                    <div key={c._id} onClick={() => handleSelectCampaign(c._id)}
                                        style={{ padding: 20, borderRadius: 12, cursor: 'pointer', border: '2px solid #d1d5db', background: '#fff', transition: 'all 0.2s' }}
                                        onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.borderColor = '#3b82f6'; (e.currentTarget as HTMLDivElement).style.background = '#f0f7ff'; }}
                                        onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.borderColor = '#d1d5db'; (e.currentTarget as HTMLDivElement).style.background = '#fff'; }}
                                    >
                                        <p style={{ fontSize: 28, marginBottom: 8 }}>📋</p>
                                        <h3 style={{ fontWeight: 700, fontSize: 16, marginBottom: 4, color: '#333' }}>
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

                {/* Step 2: Select Distance */}
                {step === 'category' && (
                    <div>
                        <div style={{ marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
                            <span style={{ color: '#888', fontSize: 13 }}>{language === 'th' ? 'กิจกรรม:' : 'Campaign:'}</span>
                            <span style={{ fontWeight: 600, color: '#333' }}>
                                {(() => { const c = getSelectedCampaign(); return language === 'th' ? (c?.nameTh || c?.name) : (c?.nameEn || c?.name); })()}
                            </span>
                        </div>
                        {getSelectedCategories().length === 0 ? (
                            <div className="events-empty" style={{ textAlign: 'center', padding: 40 }}>
                                <p style={{ color: '#999' }}>{language === 'th' ? 'ไม่มีระยะทางในกิจกรรมนี้' : 'No distances found'}</p>
                            </div>
                        ) : (
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 16 }}>
                                {getSelectedCategories().map((cat, idx) => (
                                    <div key={`${cat.name}-${idx}`} onClick={() => handleSelectCategory(cat.name)}
                                        style={{ padding: 20, borderRadius: 12, cursor: 'pointer', border: '2px solid #d1d5db', background: '#fff', transition: 'all 0.2s' }}
                                        onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.borderColor = '#22c55e'; (e.currentTarget as HTMLDivElement).style.background = '#f0fdf4'; }}
                                        onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.borderColor = '#d1d5db'; (e.currentTarget as HTMLDivElement).style.background = '#fff'; }}
                                    >
                                        <p style={{ fontSize: 28, marginBottom: 8 }}>🏃</p>
                                        <h3 style={{ fontWeight: 700, fontSize: 16, marginBottom: 4, color: '#333' }}>{cat.name}</h3>
                                        {cat.distance && <p style={{ color: '#888', fontSize: 13 }}>{cat.distance}</p>}
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                )}

                {/* Step 3: Checkpoint Modal */}
                {step === 'create' && (
                    <div
                        style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}
                        onClick={(e) => { if (e.target === e.currentTarget) handleCancel(); }}
                    >
                        <div style={{ background: '#fff', borderRadius: 12, width: '90%', maxWidth: 780, maxHeight: '85vh', display: 'flex', flexDirection: 'column', boxShadow: '0 20px 60px rgba(0,0,0,0.3)' }}>

                            {/* Modal Header */}
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 24px', borderBottom: '1px solid #e5e7eb' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                    <span style={{ color: '#374151', fontWeight: 600, fontSize: 15 }}>
                                        {(() => { const c = getSelectedCampaign(); return language === 'th' ? (c?.nameTh || c?.name) : (c?.nameEn || c?.name); })()}
                                    </span>
                                    <span style={{ color: '#9ca3af' }}>·</span>
                                    <span style={{ color: '#6b7280', fontSize: 13 }}>{selectedCategoryName}</span>
                                    {autoSaving && (
                                        <span style={{ fontSize: 12, color: '#3b82f6', marginLeft: 8 }}>
                                            {language === 'th' ? '⟳ กำลังบันทึก...' : '⟳ Saving...'}
                                        </span>
                                    )}
                                </div>
                                <button onClick={handleCancel} style={{ background: 'none', border: 'none', fontSize: 22, color: '#9ca3af', cursor: 'pointer', lineHeight: 1, padding: '4px 8px' }}>×</button>
                            </div>

                            {/* Add checkpoint button */}
                            <div style={{ padding: '12px 24px', borderBottom: '1px solid #e5e7eb', textAlign: 'center' }}>
                                <button onClick={handleAddCheckpoint} style={{ background: 'none', border: 'none', color: '#374151', fontWeight: 600, fontSize: 15, cursor: 'pointer', padding: '4px 8px' }}>
                                    + {language === 'th' ? 'เพิ่มจุด Checkpoint' : 'Add Checkpoint'}
                                </button>
                            </div>

                            {/* Table Header */}
                            <div style={{ display: 'grid', gridTemplateColumns: '30px 50px 1fr 130px 40px', padding: '10px 24px', borderBottom: '1px solid #e5e7eb', fontSize: 13, fontWeight: 600, color: '#6b7280', gap: 8 }}>
                                <div></div>
                                <div>{language === 'th' ? 'ลำดับ' : '#'}</div>
                                <div>{language === 'th' ? 'ชื่อจุด Checkpoint' : 'Checkpoint Name'}</div>
                                <div>{language === 'th' ? 'ประเภท' : 'Type'}</div>
                                <div></div>
                            </div>

                            {/* Scrollable list */}
                            <div style={{ flex: 1, overflowY: 'auto', padding: '0 24px' }}>
                                {loadingCheckpoints ? (
                                    <div style={{ padding: '24px 0', textAlign: 'center', color: '#9ca3af' }}>
                                        {language === 'th' ? 'กำลังโหลด...' : 'Loading...'}
                                    </div>
                                ) : checkpoints.length === 0 ? (
                                    <div style={{ padding: '32px 0', textAlign: 'center', color: '#9ca3af' }}>
                                        <p style={{ fontSize: 32, marginBottom: 8 }}>📍</p>
                                        <p>{language === 'th' ? 'ยังไม่มีจุด Checkpoint กดปุ่ม "+" ด้านบนเพื่อเพิ่ม' : 'No checkpoints yet. Click "+" to add.'}</p>
                                    </div>
                                ) : (
                                    checkpoints.map((cp, idx) => {
                                        const typeColor = getTypeColor(cp.type);
                                        return (
                                            <div
                                                key={cp.key}
                                                draggable
                                                onDragStart={() => handleDragStart(idx)}
                                                onDragOver={(e) => handleDragOver(e, idx)}
                                                onDragEnd={handleDragEnd}
                                                style={{
                                                    display: 'grid',
                                                    gridTemplateColumns: '30px 50px 1fr 130px 40px',
                                                    alignItems: 'center',
                                                    padding: '7px 0',
                                                    borderBottom: '1px solid #f3f4f6',
                                                    gap: 8,
                                                    cursor: 'grab',
                                                    opacity: dragIdx === idx ? 0.4 : 1,
                                                    background: dragIdx === idx ? '#eff6ff' : cp.isNew ? '#fefce8' : 'transparent',
                                                    borderRadius: 4,
                                                    transition: 'background 0.15s',
                                                }}
                                            >
                                                {/* Drag handle */}
                                                <div style={{ textAlign: 'center', color: '#9ca3af', fontSize: 16, cursor: 'grab', userSelect: 'none' }}>⠿</div>

                                                {/* Order number */}
                                                <div style={{
                                                    textAlign: 'center', fontWeight: 600, fontSize: 13,
                                                    color: cp.isNew ? '#2563eb' : '#374151',
                                                    background: cp.isNew ? '#eff6ff' : '#f3f4f6',
                                                    borderRadius: 6, padding: '5px 4px',
                                                }}>
                                                    {idx + 1}
                                                </div>

                                                {/* Name */}
                                                <div>
                                                    {cp.isNew ? (
                                                        <input
                                                            type="text"
                                                            value={cp.name}
                                                            onChange={e => handleUpdateName(cp.key, e.target.value)}
                                                            placeholder={language === 'th' ? 'ชื่อจุด เช่น Start, A1, Finish' : 'e.g. Start, A1, Finish'}
                                                            style={{
                                                                width: '100%', padding: '6px 10px', borderRadius: 6,
                                                                border: '1px solid #93c5fd', background: '#fff', color: '#111827',
                                                                fontSize: 14, outline: 'none',
                                                            }}
                                                            onFocus={e => e.target.style.borderColor = '#3b82f6'}
                                                            onBlur={e => e.target.style.borderColor = '#93c5fd'}
                                                        />
                                                    ) : (
                                                        <div style={{ padding: '6px 10px', fontSize: 14, color: '#374151', fontWeight: 500 }}>
                                                            {cp.name}
                                                        </div>
                                                    )}
                                                </div>

                                                {/* Type dropdown (always editable) */}
                                                <div>
                                                    <select
                                                        value={cp.type}
                                                        onChange={e => handleUpdateType(cp.key, e.target.value)}
                                                        style={{
                                                            width: '100%', padding: '6px 8px', borderRadius: 6,
                                                            border: `1px solid ${typeColor.border}`,
                                                            background: typeColor.bg, color: typeColor.text,
                                                            fontSize: 13, fontWeight: 600, outline: 'none',
                                                            cursor: 'pointer', appearance: 'auto',
                                                        }}
                                                    >
                                                        {TYPE_OPTIONS.map(opt => (
                                                            <option key={opt} value={opt}>{opt}</option>
                                                        ))}
                                                    </select>
                                                </div>

                                                {/* Delete button */}
                                                <div style={{ textAlign: 'center' }}>
                                                    <button
                                                        onClick={() => handleDelete(cp)}
                                                        style={{
                                                            width: 26, height: 26, borderRadius: 6,
                                                            border: '1px solid #fca5a5', background: '#fef2f2',
                                                            color: '#ef4444', cursor: 'pointer', fontSize: 13, fontWeight: 700,
                                                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                            lineHeight: 1,
                                                        }}
                                                        title={cp.isNew ? (language === 'th' ? 'ลบ' : 'Remove') : (language === 'th' ? 'ลบจาก DB' : 'Delete from DB')}
                                                    >✕</button>
                                                </div>
                                            </div>
                                        );
                                    })
                                )}
                            </div>

                            {/* Modal Footer */}
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 24px', borderTop: '1px solid #e5e7eb' }}>
                                <div style={{ fontSize: 13, color: '#6b7280' }}>
                                    {language === 'th'
                                        ? `${savedCount} จุดบันทึกแล้ว · ${newCount} จุดใหม่`
                                        : `${savedCount} saved · ${newCount} new`}
                                    {' '}
                                    <span style={{ color: '#9ca3af' }}>
                                        {language === 'th' ? '(ลากเพื่อจัดลำดับ)' : '(drag to reorder)'}
                                    </span>
                                </div>
                                <div style={{ display: 'flex', gap: 12 }}>
                                    <button
                                        onClick={handleCancel}
                                        style={{ padding: '8px 24px', borderRadius: 6, border: '1px solid #d1d5db', background: '#fff', color: '#374151', fontWeight: 600, fontSize: 14, cursor: 'pointer' }}
                                    >
                                        {language === 'th' ? 'ยกเลิก' : 'Cancel'}
                                    </button>
                                    <button
                                        onClick={handleSaveNew}
                                        disabled={saving || newCount === 0}
                                        style={{
                                            padding: '8px 24px', borderRadius: 6, border: 'none',
                                            background: newCount === 0 ? '#93c5fd' : '#3b82f6',
                                            color: '#fff', fontWeight: 600, fontSize: 14,
                                            cursor: (saving || newCount === 0) ? 'not-allowed' : 'pointer',
                                            opacity: saving ? 0.7 : 1,
                                        }}
                                    >
                                        {saving
                                            ? (language === 'th' ? 'กำลังบันทึก...' : 'Saving...')
                                            : newCount > 0
                                                ? (language === 'th' ? `บันทึก ${newCount} จุดใหม่` : `Save ${newCount} new`)
                                                : (language === 'th' ? 'ไม่มีจุดใหม่' : 'No new items')}
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </AdminLayout>
    );
}
