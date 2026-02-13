'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
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
    readerId?: string;
    location?: string;
    distanceMappings?: string[];
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
    const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
    const [saving, setSaving] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const [editingId, setEditingId] = useState<string | null>(null);
    const [editName, setEditName] = useState('');
    const [editOrder, setEditOrder] = useState<number>(1);
    const [editModeType, setEditModeType] = useState<'rfid' | 'manual'>('rfid');
    const [editReaderId, setEditReaderId] = useState('');

    // Track unsaved changes: set of checkpoint IDs that have been modified locally
    const [dirtyIds, setDirtyIds] = useState<Set<string>>(new Set());
    // Snapshot of checkpoints as last saved from/to database
    const savedCheckpointsRef = useRef<Checkpoint[]>([]);

    // New rows added inline (not yet in database)
    interface NewRow { localId: string; name: string; type: string; orderNum: number; description: string; readerId: string; active: boolean; }
    const [newRows, setNewRows] = useState<NewRow[]>([]);

    // Drag-and-drop reorder state
    const [dragIdx, setDragIdx] = useState<number | null>(null);
    const [overIdx, setOverIdx] = useState<number | null>(null);

    const hasUnsavedChanges = dirtyIds.size > 0 || newRows.length > 0;

    // Drag-and-drop handlers
    const handleDragStart = (idx: number) => {
        setDragIdx(idx);
    };
    const handleDragOver = (e: React.DragEvent, idx: number) => {
        e.preventDefault();
        setOverIdx(idx);
    };
    const handleDrop = (idx: number) => {
        if (dragIdx === null || dragIdx === idx) {
            setDragIdx(null);
            setOverIdx(null);
            return;
        }
        const sorted = checkpoints.slice().sort((a, b) => a.orderNum - b.orderNum);
        const [moved] = sorted.splice(dragIdx, 1);
        sorted.splice(idx, 0, moved);
        // Reassign orderNum for all and mark them dirty
        const updated = sorted.map((cp, i) => ({ ...cp, orderNum: i + 1 }));
        setCheckpoints(updated);
        setDirtyIds(prev => {
            const next = new Set(prev);
            updated.forEach(cp => next.add(cp._id));
            return next;
        });
        setDragIdx(null);
        setOverIdx(null);
    };
    const handleDragEnd = () => {
        setDragIdx(null);
        setOverIdx(null);
    };

    // Load campaigns and featured in parallel (one less round-trip)
    useEffect(() => {
        let cancelled = false;
        Promise.all([
            fetch('/api/campaigns', { cache: 'no-store' }).then(r => r.json()),
            fetch('/api/campaigns/featured', { cache: 'no-store' }).then(r => r.ok ? r.json() : null),
        ])
            .then(([json, featured]) => {
                if (cancelled) return;
                const list = Array.isArray(json) ? json : json?.data || [];
                setCampaigns(list);
                if (featured?._id && list.some((c: Campaign) => c._id === featured._id)) {
                    setSelectedCampaignId(featured._id);
                }
            })
            .catch(() => { if (!cancelled) setCampaigns([]); })
            .finally(() => { if (!cancelled) setLoading(false); });
        return () => { cancelled = true; };
    }, []);

    // Load checkpoints when campaign changes
    useEffect(() => {
        if (!selectedCampaignId) return;
        setLoadingCheckpoints(true);
        setDirtyIds(new Set());
        fetch(`/api/checkpoints/campaign/${selectedCampaignId}`, { cache: 'no-store' })
            .then(res => res.json())
            .then(json => {
                const list = Array.isArray(json) ? json : [];
                list.sort((a: Checkpoint, b: Checkpoint) => a.orderNum - b.orderNum);
                setCheckpoints(list);
                savedCheckpointsRef.current = JSON.parse(JSON.stringify(list));
            })
            .catch(() => { setCheckpoints([]); savedCheckpointsRef.current = []; })
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
        if (hasUnsavedChanges) {
            if (!confirm(language === 'th'
                ? 'คุณมีการเปลี่ยนแปลงที่ยังไม่ได้บันทึก ต้องการออกโดยไม่บันทึกหรือไม่?'
                : 'You have unsaved changes. Leave without saving?'
            )) return;
        }
        setSelectedCampaignId('');
        setCheckpoints([]);
        setDirtyIds(new Set());
        setNewRows([]);
    };

    const getSelectedCampaign = () => campaigns.find(c => c._id === selectedCampaignId);

    // Mark a checkpoint as dirty (locally modified, not yet saved)
    const markDirty = useCallback((cpId: string) => {
        setDirtyIds(prev => {
            const next = new Set(prev);
            next.add(cpId);
            return next;
        });
    }, []);

    const handleToggleActive = (checkpoint: Checkpoint) => {
        const newActive = !checkpoint.active;
        setCheckpoints(prev => prev.map(cp =>
            cp._id === checkpoint._id ? { ...cp, active: newActive } : cp
        ));
        markDirty(checkpoint._id);
    };

    const openEditRow = (cp: Checkpoint) => {
        setEditingId(cp._id);
        setEditName(cp.name);
        setEditOrder(cp.orderNum || 1);
        const mode = (cp.description === 'manual' || cp.description === 'rfid') ? cp.description : 'rfid';
        setEditModeType(mode);
        setEditReaderId(cp.readerId || '');
    };

    const cancelEditRow = () => {
        setEditingId(null);
    };

    // Save row edit locally (not to database yet)
    const handleSaveRow = () => {
        if (!editingId) return;

        const trimmedName = editName.trim();
        if (!trimmedName) {
            showToast(language === 'th' ? 'กรุณาระบุชื่อจุด Checkpoint' : 'Please enter checkpoint name', 'error');
            return;
        }

        const newOrder = Number(editOrder) || 1;

        setCheckpoints(prev =>
            prev
                .map(cp =>
                    cp._id === editingId
                        ? { ...cp, name: trimmedName, orderNum: newOrder, description: editModeType, readerId: editReaderId || undefined }
                        : cp
                )
                .sort((a, b) => a.orderNum - b.orderNum)
        );
        markDirty(editingId);
        setEditingId(null);
    };

    const handleDeleteCheckpoint = async (checkpoint: Checkpoint) => {
        const confirmMessage = language === 'th'
            ? `คุณแน่ใจหรือไม่ว่าต้องการลบจุด Checkpoint "${checkpoint.name}"?\n\nการลบนี้ไม่สามารถยกเลิกได้`
            : `Are you sure you want to delete checkpoint "${checkpoint.name}"?\n\nThis action cannot be undone.`;
        
        if (!confirm(confirmMessage)) return;

        try {
            const res = await fetch(`/api/checkpoints/${checkpoint._id}`, { method: 'DELETE' });
            if (!res.ok) throw new Error('Failed to delete');
            setCheckpoints(prev => prev.filter(cp => cp._id !== checkpoint._id));
            showToast(language === 'th' ? 'ลบสำเร็จ' : 'Deleted successfully', 'success');
        } catch {
            showToast(language === 'th' ? 'เกิดข้อผิดพลาด' : 'Error deleting', 'error');
        }
    };

    const getModeBadgeStyle = (mode: 'rfid' | 'manual') => {
        return mode === 'manual'
            ? { bg: '#fef3c7', text: '#b45309', border: '#fbbf24' }
            : { bg: '#e0f2fe', text: '#0369a1', border: '#38bdf8' };
    };

    // Add a new empty row inline
    const handleAddNewRow = () => {
        const nextOrder = checkpoints.length + newRows.length + 1;
        setNewRows(prev => [...prev, {
            localId: crypto.randomUUID(),
            name: '',
            type: 'checkpoint',
            orderNum: nextOrder,
            description: 'rfid',
            readerId: '',
            active: true,
        }]);
    };

    const handleUpdateNewRow = (localId: string, field: Partial<NewRow>) => {
        setNewRows(prev => prev.map(r => r.localId === localId ? { ...r, ...field } : r));
    };

    const handleRemoveNewRow = (localId: string) => {
        setNewRows(prev => prev.filter(r => r.localId !== localId));
    };

    // Update a field locally (no API call) and mark dirty
    const handleLocalUpdate = (cpId: string, field: Partial<Checkpoint>) => {
        setCheckpoints(prev => prev.map(cp =>
            cp._id === cpId ? { ...cp, ...field } : cp
        ));
        markDirty(cpId);
    };

    // Save ALL changes to the database (dirty existing + new rows)
    const handleSaveAll = async () => {
        if (!hasUnsavedChanges) {
            showToast(language === 'th' ? 'ไม่มีการเปลี่ยนแปลง' : 'No changes to save', 'success');
            return;
        }

        // Validate new rows have names
        const emptyNew = newRows.find(r => !r.name.trim());
        if (emptyNew) {
            showToast(language === 'th' ? 'กรุณากรอกชื่อจุด Checkpoint ใหม่ให้ครบ' : 'Please fill in all new checkpoint names', 'error');
            return;
        }

        setSaving(true);
        let successCount = 0;
        let errorCount = 0;

        // Validate orderNum uniqueness
        const orderNums = new Map<number, string>();
        for (const cp of checkpoints) {
            if (orderNums.has(cp.orderNum) && orderNums.get(cp.orderNum) !== cp._id) {
                showToast(
                    language === 'th'
                        ? `ลำดับ ${cp.orderNum} ซ้ำกัน กรุณาแก้ไขก่อนบันทึก`
                        : `Order number ${cp.orderNum} is duplicated. Please fix before saving.`,
                    'error'
                );
                setSaving(false);
                return;
            }
            orderNums.set(cp.orderNum, cp._id);
        }
        for (const row of newRows) {
            if (orderNums.has(row.orderNum)) {
                showToast(
                    language === 'th'
                        ? `ลำดับ ${row.orderNum} ซ้ำกัน กรุณาแก้ไขก่อนบันทึก`
                        : `Order number ${row.orderNum} is duplicated. Please fix before saving.`,
                    'error'
                );
                setSaving(false);
                return;
            }
            orderNums.set(row.orderNum, 'new');
        }

        // 1) PUT dirty existing checkpoints
        for (const cpId of dirtyIds) {
            const cp = checkpoints.find(c => c._id === cpId);
            if (!cp) continue;
            try {
                const res = await fetch(`/api/checkpoints/${cpId}`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        name: cp.name, orderNum: cp.orderNum, active: cp.active,
                        description: cp.description, readerId: cp.readerId || '',
                    }),
                });
                if (!res.ok) throw new Error('Failed');
                successCount++;
            } catch { errorCount++; }
        }

        // 2) POST new rows as a batch array
        if (newRows.length > 0) {
            const toCreate = newRows.map(row => ({
                campaignId: selectedCampaignId,
                name: row.name.trim(),
                type: 'checkpoint',
                orderNum: row.orderNum,
                active: row.active,
                description: row.description,
                readerId: row.readerId || '',
            }));
            try {
                const res = await fetch('/api/checkpoints', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(toCreate),
                });
                if (!res.ok) throw new Error('Failed');
                successCount += newRows.length;
            } catch {
                errorCount += newRows.length;
            }
        }

        setSaving(false);

        // Reload from backend to get fresh data
        if (selectedCampaignId) {
            setLoadingCheckpoints(true);
            try {
                const res = await fetch(`/api/checkpoints/campaign/${selectedCampaignId}`, { cache: 'no-store' });
                const json = await res.json();
                const list = Array.isArray(json) ? json : [];
                list.sort((a: Checkpoint, b: Checkpoint) => a.orderNum - b.orderNum);
                setCheckpoints(list);
                savedCheckpointsRef.current = JSON.parse(JSON.stringify(list));
            } catch { /* ignore */ }
            setLoadingCheckpoints(false);
        }
        setDirtyIds(new Set());
        setNewRows([]);

        if (errorCount === 0) {
            showToast(language === 'th' ? `บันทึกสำเร็จ ${successCount} รายการ` : `Saved ${successCount} item(s)`, 'success');
        } else {
            showToast(language === 'th' ? `สำเร็จ ${successCount}, ล้มเหลว ${errorCount}` : `Saved ${successCount}, failed ${errorCount}`, 'error');
        }
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
                    {language === 'th' ? 'สร้างจุด Checkpoint' : 'Manage Checkpoints'}
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

                        {loadingCheckpoints ? (
                            <div className="events-loading">Loading...</div>
                        ) : (checkpoints.length === 0 && newRows.length === 0) ? (
                            <div className="events-empty" style={{ textAlign: 'center', padding: 40 }}>
                                <p style={{ fontSize: 48, marginBottom: 12 }}>📍</p>
                                <p style={{ color: '#999' }}>
                                    {language === 'th' ? 'ยังไม่มีจุด Checkpoint' : 'No checkpoints found'}
                                </p>
                                <button
                                    onClick={handleAddNewRow}
                                    style={{
                                        display: 'inline-block', marginTop: 12, padding: '8px 20px',
                                        borderRadius: 6, background: '#22c55e', color: '#fff', border: 'none',
                                        fontWeight: 600, cursor: 'pointer', fontSize: 14,
                                    }}
                                >
                                    {language === 'th' ? '+ เพิ่มจุด Checkpoint' : '+ Add Checkpoint'}
                                </button>
                            </div>
                        ) : (
                            <>
                                {/* Search toolbar inside selected campaign */}
                                <div className="filter-toolbar" style={{ marginBottom: 10, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                                    <input
                                        type="text"
                                        className="form-input"
                                        placeholder={language === 'th' ? 'ค้นหาจุดเช็คพอยท์...' : 'Search checkpoints...'}
                                        style={{ width: 260 }}
                                        value={searchTerm}
                                        onChange={e => setSearchTerm(e.target.value)}
                                    />
                                    <button
                                        className="btn btn-query"
                                        type="button"
                                        onClick={() => { /* filter is live */ }}
                                    >
                                        {language === 'th' ? 'ค้นหา' : 'Search'}
                                    </button>
                                    <button
                                        className="btn btn-add"
                                        type="button"
                                        onClick={handleAddNewRow}
                                    >
                                        {language === 'th' ? 'เพิ่มจุดใหม่' : 'Add New'}
                                    </button>
                                    <button
                                        type="button"
                                        onClick={handleSaveAll}
                                        disabled={saving || !hasUnsavedChanges}
                                        style={{
                                            display: 'inline-flex', alignItems: 'center', gap: 6,
                                            padding: '6px 18px', borderRadius: 6, border: 'none',
                                            background: hasUnsavedChanges ? '#3b82f6' : '#9ca3af',
                                            color: '#fff', fontWeight: 600, fontSize: 13,
                                            cursor: hasUnsavedChanges ? 'pointer' : 'not-allowed',
                                            opacity: saving ? 0.7 : 1,
                                            marginLeft: 'auto',
                                        }}
                                    >
                                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                            <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
                                            <polyline points="17 21 17 13 7 13 7 21" />
                                            <polyline points="7 3 7 8 15 8" />
                                        </svg>
                                        {saving
                                            ? (language === 'th' ? 'กำลังบันทึก...' : 'Saving...')
                                            : (language === 'th'
                                                ? `บันทึกทั้งหมด${hasUnsavedChanges ? ` (${dirtyIds.size + newRows.length})` : ''}`
                                                : `Save All${hasUnsavedChanges ? ` (${dirtyIds.size + newRows.length})` : ''}`)
                                        }
                                    </button>
                                </div>

                                <table className="data-table">
                                    <thead>
                                        <tr>
                                            <th style={{ width: 40 }}>#</th>
                                            <th style={{ width: 60 }}>{language === 'th' ? 'ลำดับ' : 'Order'}</th>
                                            <th style={{ textAlign: 'left' }}>{language === 'th' ? 'ชื่อจุดเช็คพอยท์' : 'Checkpoint Name'}</th>
                                            <th style={{ width: 260 }}>{language === 'th' ? 'Timing Method / Reader ID' : 'Timing Method / Reader ID'}</th>
                                            <th>{language === 'th' ? 'ใช้งานร่วมกับ' : 'Used With'}</th>
                                            <th style={{ width: 90 }}>{language === 'th' ? 'สถานะ' : 'Status'}</th>
                                            <th style={{ width: 140 }}>Tools</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {checkpoints
                                            .slice()
                                            .sort((a, b) => a.orderNum - b.orderNum)
                                            .filter(cp =>
                                                !searchTerm ||
                                                cp.name.toLowerCase().includes(searchTerm.toLowerCase())
                                            )
                                            .map((cp, idx) => {
                                                const isEditing = editingId === cp._id;
                                                const displayMode: 'rfid' | 'manual' =
                                                    (cp.description === 'manual' || cp.description === 'rfid')
                                                        ? cp.description
                                                        : 'rfid';
                                                const badge = getModeBadgeStyle(isEditing ? editModeType : displayMode);
                                                const isDirty = dirtyIds.has(cp._id);
                                                return (
                                                    <tr
                                                        key={cp._id}
                                                        draggable
                                                        onDragStart={() => handleDragStart(idx)}
                                                        onDragOver={(e) => handleDragOver(e, idx)}
                                                        onDrop={() => handleDrop(idx)}
                                                        onDragEnd={handleDragEnd}
                                                        style={{
                                                            ...(isDirty ? { background: '#fffbeb' } : {}),
                                                            ...(overIdx === idx && dragIdx !== null && dragIdx !== idx ? { borderTop: '2px solid #3b82f6' } : {}),
                                                            opacity: dragIdx === idx ? 0.5 : 1,
                                                            transition: 'opacity 0.15s',
                                                        }}
                                                    >
                                                        <td>
                                                            <span style={{ color: '#aaa', fontSize: 16, cursor: 'grab' }}>⋮⋮</span>
                                                        </td>
                                                        <td>{isEditing ? (
                                                            <input
                                                                type="number"
                                                                value={editOrder}
                                                                onChange={e => setEditOrder(Number(e.target.value))}
                                                                style={{
                                                                    width: 48,
                                                                    padding: '4px 6px',
                                                                    borderRadius: 4,
                                                                    border: '1px solid #d1d5db',
                                                                    textAlign: 'center',
                                                                }}
                                                            />
                                                        ) : (
                                                            <span>{cp.orderNum}</span>
                                                        )}</td>
                                                        <td style={{ textAlign: 'left' }}>
                                                            {isEditing ? (
                                                                <input
                                                                    type="text"
                                                                    value={editName}
                                                                    onChange={e => setEditName(e.target.value)}
                                                                    style={{
                                                                        width: '100%',
                                                                        padding: '4px 8px',
                                                                        borderRadius: 4,
                                                                        border: '1px solid #d1d5db',
                                                                        fontSize: 13,
                                                                    }}
                                                                />
                                                            ) : (
                                                                <strong>{cp.name}</strong>
                                                            )}
                                                        </td>
                                                        <td>
                                                            <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexWrap: 'wrap' }}>
                                                                <select
                                                                    value={isEditing ? editModeType : displayMode}
                                                                    onChange={e => {
                                                                        const newMode = e.target.value as 'rfid' | 'manual';
                                                                        if (isEditing) {
                                                                            setEditModeType(newMode);
                                                                            if (newMode === 'manual') setEditReaderId('');
                                                                        } else {
                                                                            handleLocalUpdate(cp._id, {
                                                                                description: newMode,
                                                                                readerId: newMode === 'manual' ? '' : cp.readerId,
                                                                            });
                                                                        }
                                                                    }}
                                                                    style={{
                                                                        padding: '4px 8px',
                                                                        borderRadius: 6,
                                                                        border: `1px solid ${badge.border}`,
                                                                        background: badge.bg,
                                                                        color: badge.text,
                                                                        fontSize: 12,
                                                                        fontWeight: 600,
                                                                        cursor: 'pointer',
                                                                        minWidth: 80,
                                                                    }}
                                                                >
                                                                    <option value="rfid">RFID</option>
                                                                    <option value="manual">Manual</option>
                                                                </select>
                                                                {isEditing ? (
                                                                    <input
                                                                        type="text"
                                                                        className="form-input"
                                                                        placeholder="Reader ID"
                                                                        value={editReaderId}
                                                                        onChange={e => setEditReaderId(e.target.value)}
                                                                        disabled={editModeType === 'manual'}
                                                                        style={{
                                                                            width: 100,
                                                                            padding: '4px 8px',
                                                                            borderRadius: 4,
                                                                            border: '1px solid #d1d5db',
                                                                            fontSize: 12,
                                                                            background: editModeType === 'manual' ? '#f5f5f5' : '#fff',
                                                                            opacity: editModeType === 'manual' ? 0.5 : 1,
                                                                        }}
                                                                    />
                                                                ) : (
                                                                    <input
                                                                        type="text"
                                                                        className="form-input"
                                                                        placeholder={displayMode === 'manual' ? '-' : 'Reader ID'}
                                                                        value={cp.readerId || ''}
                                                                        disabled={displayMode === 'manual'}
                                                                        onChange={e => handleLocalUpdate(cp._id, { readerId: e.target.value })}
                                                                        style={{
                                                                            width: 100,
                                                                            padding: '4px 8px',
                                                                            borderRadius: 4,
                                                                            border: '1px solid #d1d5db',
                                                                            fontSize: 12,
                                                                            background: displayMode === 'manual' ? '#f5f5f5' : '#fff',
                                                                            opacity: displayMode === 'manual' ? 0.5 : 1,
                                                                        }}
                                                                    />
                                                                )}
                                                            </div>
                                                        </td>
                                                        <td>
                                                            {/* ใช้งานร่วมกับ – แสดงระยะทางที่ถูกเลือกจากหน้า Checkpoint Mapping */}
                                                            {cp.distanceMappings && cp.distanceMappings.length > 0 ? (
                                                                <>
                                                                    {cp.distanceMappings.map((name, i) => (
                                                                        <span
                                                                            key={`${cp._id}-dist-${i}`}
                                                                            style={{
                                                                                background: '#e5f3ff',
                                                                                padding: '2px 5px',
                                                                                borderRadius: 3,
                                                                                fontSize: 10,
                                                                                marginRight: 3,
                                                                                color: '#0369a1',
                                                                            }}
                                                                        >
                                                                            {name}
                                                                        </span>
                                                                    ))}
                                                                </>
                                                            ) : (
                                                                <span style={{ fontSize: 11, color: '#999' }}>-</span>
                                                            )}
                                                        </td>
                                                        <td>
                                                            <div className={`toggle-sim ${cp.active ? 'on' : ''}`} onClick={() => handleToggleActive(cp)} />
                                                        </td>
                                                        <td>
                                                            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 6 }}>
                                                                {isEditing ? (
                                                                    <>
                                                                        <button
                                                                            onClick={handleSaveRow}
                                                                            style={{
                                                                                display: 'inline-flex', alignItems: 'center', gap: 4,
                                                                                padding: '4px 10px', borderRadius: 4, border: 'none',
                                                                                background: '#22c55e', color: '#fff',
                                                                                cursor: 'pointer', fontSize: 12, fontWeight: 600,
                                                                            }}
                                                                            title={language === 'th' ? 'บันทึก' : 'Save'}
                                                                        >
                                                                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                                                                <polyline points="20 6 9 17 4 12" />
                                                                            </svg>
                                                                            {language === 'th' ? 'บันทึก' : 'Save'}
                                                                        </button>
                                                                        <button
                                                                            onClick={cancelEditRow}
                                                                            style={{
                                                                                display: 'inline-flex', alignItems: 'center', gap: 4,
                                                                                padding: '4px 10px', borderRadius: 4,
                                                                                border: '1px solid #d1d5db', background: '#fff', color: '#6b7280',
                                                                                cursor: 'pointer', fontSize: 12, fontWeight: 600,
                                                                            }}
                                                                            title={language === 'th' ? 'ยกเลิก' : 'Cancel'}
                                                                        >
                                                                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                                                                <line x1="18" y1="6" x2="6" y2="18" />
                                                                                <line x1="6" y1="6" x2="18" y2="18" />
                                                                            </svg>
                                                                            {language === 'th' ? 'ยกเลิก' : 'Cancel'}
                                                                        </button>
                                                                    </>
                                                                ) : (
                                                                    <>
                                                                        <button
                                                                            onClick={() => openEditRow(cp)}
                                                                            style={{
                                                                                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                                                                                width: 30, height: 30, borderRadius: 6,
                                                                                border: '1px solid #d1d5db', background: '#f9fafb',
                                                                                cursor: 'pointer', color: '#3b82f6',
                                                                            }}
                                                                            title={language === 'th' ? 'แก้ไข' : 'Edit'}
                                                                        >
                                                                            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                                                                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                                                                                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                                                                            </svg>
                                                                        </button>
                                                                        <button
                                                                            onClick={() => handleDeleteCheckpoint(cp)}
                                                                            style={{
                                                                                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                                                                                width: 30, height: 30, borderRadius: 6,
                                                                                border: '1px solid #fecaca', background: '#fef2f2',
                                                                                cursor: 'pointer', color: '#ef4444',
                                                                            }}
                                                                            title={language === 'th' ? 'ลบ' : 'Delete'}
                                                                        >
                                                                            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                                                                <polyline points="3 6 5 6 21 6" />
                                                                                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                                                                                <line x1="10" y1="11" x2="10" y2="17" />
                                                                                <line x1="14" y1="11" x2="14" y2="17" />
                                                                            </svg>
                                                                        </button>
                                                                    </>
                                                                )}
                                                            </div>
                                                        </td>
                                                    </tr>
                                                );
                                            })}
                                        {/* New rows (not yet saved) */}
                                        {newRows.map((row) => (
                                            <tr key={row.localId} style={{ background: '#fefce8' }}>
                                                <td>
                                                    <span style={{ color: '#f59e0b', fontSize: 12, fontWeight: 700 }}>NEW</span>
                                                </td>
                                                <td>
                                                    <input
                                                        type="number"
                                                        value={row.orderNum}
                                                        onChange={e => handleUpdateNewRow(row.localId, { orderNum: Number(e.target.value) })}
                                                        style={{ width: 48, padding: '4px 6px', borderRadius: 4, border: '1px solid #fbbf24', textAlign: 'center', background: '#fffbeb' }}
                                                    />
                                                </td>
                                                <td style={{ textAlign: 'left' }}>
                                                    <input
                                                        type="text"
                                                        value={row.name}
                                                        onChange={e => handleUpdateNewRow(row.localId, { name: e.target.value })}
                                                        placeholder={language === 'th' ? 'ชื่อจุด เช่น CP1, Start...' : 'e.g. CP1, Start...'}
                                                        style={{ width: '100%', padding: '4px 8px', borderRadius: 4, border: '1px solid #fbbf24', fontSize: 13, background: '#fffbeb' }}
                                                        autoFocus
                                                    />
                                                </td>
                                                <td>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                                                        <select
                                                            value={row.description}
                                                            onChange={e => handleUpdateNewRow(row.localId, { description: e.target.value, readerId: e.target.value === 'manual' ? '' : row.readerId })}
                                                            style={{
                                                                padding: '4px 8px', borderRadius: 6,
                                                                border: '1px solid #fbbf24', background: '#fffbeb',
                                                                fontSize: 12, fontWeight: 600, cursor: 'pointer', minWidth: 80,
                                                            }}
                                                        >
                                                            <option value="rfid">RFID</option>
                                                            <option value="manual">Manual</option>
                                                        </select>
                                                        <input
                                                            type="text"
                                                            placeholder="Reader ID"
                                                            value={row.readerId}
                                                            onChange={e => handleUpdateNewRow(row.localId, { readerId: e.target.value })}
                                                            disabled={row.description === 'manual'}
                                                            style={{
                                                                width: 100, padding: '4px 8px', borderRadius: 4,
                                                                border: '1px solid #fbbf24', fontSize: 12, background: '#fffbeb',
                                                                opacity: row.description === 'manual' ? 0.5 : 1,
                                                            }}
                                                        />
                                                    </div>
                                                </td>
                                                <td>
                                                    <span style={{ fontSize: 11, color: '#999' }}>-</span>
                                                </td>
                                                <td>
                                                    <div
                                                        className={`toggle-sim ${row.active ? 'on' : ''}`}
                                                        onClick={() => handleUpdateNewRow(row.localId, { active: !row.active })}
                                                    />
                                                </td>
                                                <td>
                                                    <div style={{ display: 'flex', justifyContent: 'center' }}>
                                                        <button
                                                            onClick={() => handleRemoveNewRow(row.localId)}
                                                            style={{
                                                                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                                                                width: 30, height: 30, borderRadius: 6,
                                                                border: '1px solid #fecaca', background: '#fef2f2',
                                                                cursor: 'pointer', color: '#ef4444',
                                                            }}
                                                            title={language === 'th' ? 'ลบ' : 'Remove'}
                                                        >
                                                            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                                                <line x1="18" y1="6" x2="6" y2="18" />
                                                                <line x1="6" y1="6" x2="18" y2="18" />
                                                            </svg>
                                                        </button>
                                                    </div>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </>
                        )}
                    </>
                )}
            </div>
        </AdminLayout>
    );
}
