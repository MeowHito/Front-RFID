'use client';

import { useEffect, useState, useCallback } from 'react';
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
    kmCumulative?: number;
    cutoffTime?: string;
    distanceMappings?: string[];
}

export default function RouteMappingPage() {
    const { language } = useLanguage();
    const [campaign, setCampaign] = useState<Campaign | null>(null);
    const [categories, setCategories] = useState<RaceCategory[]>([]);
    const [selectedCategory, setSelectedCategory] = useState<string>('');
    const [checkpoints, setCheckpoints] = useState<Checkpoint[]>([]);
    const [loading, setLoading] = useState(true);
    const [loadingCps, setLoadingCps] = useState(false);
    const [saving, setSaving] = useState(false);
    const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
    const [dirtyIds, setDirtyIds] = useState<Set<string>>(new Set());

    // Popup state for selecting checkpoints from inventory per distance
    const [pickerOpen, setPickerOpen] = useState(false);
    const [pickerSelectedIds, setPickerSelectedIds] = useState<Set<string>>(new Set());

    // Drag-and-drop reorder state (per distance view)
    const [dragIdx, setDragIdx] = useState<number | null>(null);
    const [overIdx, setOverIdx] = useState<number | null>(null);

    // Delete confirmation modal state
    const [deleteConfirm, setDeleteConfirm] = useState<{ open: boolean; checkpoint: Checkpoint | null }>({
        open: false,
        checkpoint: null,
    });

    const hasUnsavedChanges = dirtyIds.size > 0;
    const [syncing, setSyncing] = useState(false);

    const showToast = (message: string, type: 'success' | 'error') => {
        setToast({ message, type });
        setTimeout(() => setToast(null), 3000);
    };

    const markDirty = useCallback((cpId: string) => {
        setDirtyIds(prev => { const n = new Set(prev); n.add(cpId); return n; });
    }, []);

    // Sync checkpoints from RaceTiger (pulls actual_distance → kmCumulative)
    const handleSyncFromRaceTiger = async () => {
        if (!campaign?._id) return;
        if (hasUnsavedChanges && !confirm(language === 'th' ? 'มีการเปลี่ยนแปลงที่ยังไม่บันทึก ต้องการ Sync หรือไม่?' : 'Unsaved changes will be overwritten. Sync anyway?')) return;
        setSyncing(true);
        try {
            const res = await fetch(`/api/sync/import-events?id=${campaign._id}`, { method: 'POST' });
            if (!res.ok) throw new Error('Sync failed');
            const result = await res.json();
            const data = result?.data || result;
            const cpCount = data?.checkpoints?.created ?? 0;
            showToast(
                language === 'th'
                    ? `Sync สำเร็จ! Checkpoint ${cpCount > 0 ? `สร้าง ${cpCount} จุด` : 'อัพเดต KM แล้ว'}`
                    : `Sync complete! ${cpCount > 0 ? `${cpCount} checkpoints created` : 'KM updated'}`,
                'success'
            );
            // Reload checkpoints to get updated kmCumulative
            await loadCheckpoints(campaign._id);
        } catch {
            showToast(language === 'th' ? 'Sync ไม่สำเร็จ' : 'Sync failed', 'error');
        } finally {
            setSyncing(false);
        }
    };

    // Load featured campaign
    useEffect(() => {
        async function loadFeatured() {
            try {
                const fRes = await fetch('/api/campaigns/featured', { cache: 'no-store' });
                if (!fRes.ok) throw new Error('No featured');
                const data = await fRes.json();
                if (data && data._id) {
                    setCampaign(data);
                    const cats = data.categories || [];
                    setCategories(cats);
                    if (cats.length > 0) {
                        setSelectedCategory(cats[0].name);
                    }
                }
            } catch {
                setCampaign(null);
            } finally {
                setLoading(false);
            }
        }
        loadFeatured();
    }, []);

    // Load checkpoints when campaign is available
    const loadCheckpoints = useCallback(async (campaignId: string) => {
        setLoadingCps(true);
        try {
            const res = await fetch(`/api/checkpoints/campaign/${campaignId}`, { cache: 'no-store' });
            const json = await res.json();
            const list: Checkpoint[] = Array.isArray(json) ? json : [];
            list.sort((a, b) => a.orderNum - b.orderNum);
            setCheckpoints(list);
            setDirtyIds(new Set());
        } catch {
            setCheckpoints([]);
        } finally {
            setLoadingCps(false);
        }
    }, []);

    useEffect(() => {
        if (campaign?._id) {
            loadCheckpoints(campaign._id);
        }
    }, [campaign, loadCheckpoints]);

    // Local update helper
    const updateCheckpoint = (cpId: string, field: Partial<Checkpoint>) => {
        setCheckpoints(prev => prev.map(cp =>
            cp._id === cpId ? { ...cp, ...field } : cp
        ));
        markDirty(cpId);
    };

    // Toggle distance mapping for a checkpoint
    const toggleDistanceMapping = (cpId: string, categoryName: string) => {
        setCheckpoints(prev => prev.map(cp => {
            if (cp._id !== cpId) return cp;
            const current = cp.distanceMappings || [];
            const has = current.includes(categoryName);
            const updated = has
                ? current.filter(n => n !== categoryName)
                : [...current, categoryName];
            return { ...cp, distanceMappings: updated };
        }));
        markDirty(cpId);
    };

    // Toggle active
    const handleToggle = (cp: Checkpoint) => {
        updateCheckpoint(cp._id, { active: !cp.active });
    };

    // Open delete confirmation modal
    const handleDeleteClick = (cp: Checkpoint) => {
        setDeleteConfirm({ open: true, checkpoint: cp });
    };

    // Confirm delete and execute
    const handleDeleteConfirm = async () => {
        if (!deleteConfirm.checkpoint) return;
        const cp = deleteConfirm.checkpoint;
        setDeleteConfirm({ open: false, checkpoint: null });

        try {
            const res = await fetch(`/api/checkpoints/${cp._id}`, { method: 'DELETE' });
            if (!res.ok) throw new Error('Failed');
            setCheckpoints(prev => prev.filter(c => c._id !== cp._id));
            showToast(language === 'th' ? 'ลบสำเร็จ' : 'Deleted', 'success');
        } catch {
            showToast(language === 'th' ? 'ลบไม่สำเร็จ' : 'Delete failed', 'error');
        }
    };

    // Cancel delete
    const handleDeleteCancel = () => {
        setDeleteConfirm({ open: false, checkpoint: null });
    };

    // Save all dirty checkpoints
    const handleSaveAll = async () => {
        if (!hasUnsavedChanges) {
            showToast(language === 'th' ? 'ไม่มีการเปลี่ยนแปลง' : 'No changes', 'success');
            return;
        }

        // Validate orderNum uniqueness for all checkpoints (not just visible)
        const allCheckpoints = [...checkpoints];
        const orderNums = new Map<number, string>();
        for (const cp of allCheckpoints) {
            if (orderNums.has(cp.orderNum)) {
                const existingId = orderNums.get(cp.orderNum);
                if (existingId !== cp._id) {
                    showToast(
                        language === 'th'
                            ? `ลำดับ ${cp.orderNum} ซ้ำกัน กรุณาแก้ไขก่อนบันทึก`
                            : `Order number ${cp.orderNum} is duplicated. Please fix before saving.`,
                        'error'
                    );
                    setSaving(false);
                    return;
                }
            }
            orderNums.set(cp.orderNum, cp._id);
        }

        if (dirtyIds.size === 0) {
            showToast(language === 'th' ? 'ไม่มีการเปลี่ยนแปลง' : 'No changes', 'success');
            setSaving(false);
            return;
        }

        setSaving(true);
        let ok = 0, fail = 0;
        const savePromises = Array.from(dirtyIds).map(async (cpId) => {
            const cp = checkpoints.find(c => c._id === cpId);
            if (!cp) return { success: false };
            try {
                const payload = {
                    name: cp.name,
                    type: cp.type,
                    orderNum: cp.orderNum,
                    active: cp.active,
                    description: cp.description,
                    readerId: cp.readerId || '',
                    kmCumulative: cp.kmCumulative,
                    cutoffTime: cp.cutoffTime,
                    distanceMappings: cp.distanceMappings || [],
                };
                const res = await fetch(`/api/checkpoints/${cpId}`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload),
                });
                if (!res.ok) {
                    const errorText = await res.text();
                    console.error(`Save failed for ${cpId}:`, errorText, payload);
                    return { success: false };
                }
                return { success: true };
            } catch (err) {
                console.error(`Error saving checkpoint ${cpId}:`, err);
                return { success: false };
            }
        });

        const results = await Promise.all(savePromises);
        ok = results.filter(r => r.success).length;
        fail = results.filter(r => !r.success).length;
        setSaving(false);
        setDirtyIds(new Set());

        // Reload checkpoints from backend after save
        if (campaign?._id) {
            try {
                const res = await fetch(`/api/checkpoints/campaign/${campaign._id}`, { cache: 'no-store' });
                const json = await res.json();
                const list: Checkpoint[] = Array.isArray(json) ? json : [];
                list.sort((a, b) => a.orderNum - b.orderNum);
                setCheckpoints(list);
            } catch (err) {
                console.error('Error reloading checkpoints:', err);
            }
        }

        if (fail === 0) {
            showToast(language === 'th' ? `บันทึกสำเร็จ ${ok} รายการ` : `Saved ${ok} item(s)`, 'success');
        } else {
            showToast(language === 'th' ? `สำเร็จ ${ok}, ล้มเหลว ${fail}` : `Saved ${ok}, failed ${fail}`, 'error');
        }
    };

    // Navigate to checkpoint management page (master inventory)
    const handleManageInventory = () => {
        window.location.href = '/admin/checkpoints';
    };

    // Open popup to pick checkpoints from inventory for the current distance
    const handleOpenPicker = () => {
        if (!selectedCategory) {
            showToast(language === 'th' ? 'กรุณาเลือกระยะทางก่อน' : 'Please select a distance first', 'error');
            return;
        }
        const initial = new Set(
            checkpoints
                .filter(cp => isEnabledForCategory(cp, selectedCategory))
                .map(cp => cp._id)
        );
        setPickerSelectedIds(initial);
        setPickerOpen(true);
    };

    const handleTogglePickerItem = (cpId: string) => {
        setPickerSelectedIds(prev => {
            const next = new Set(prev);
            if (next.has(cpId)) next.delete(cpId); else next.add(cpId);
            return next;
        });
    };

    const handleApplyPickerSelection = async () => {
        if (!selectedCategory) {
            setPickerOpen(false);
            return;
        }
        const currentCategory = selectedCategory;
        const changedIds: string[] = [];
        const updates: Array<{ cp: Checkpoint; newMappings: string[] }> = [];

        // Calculate which checkpoints need to be updated
        checkpoints.forEach(cp => {
            const current = cp.distanceMappings || [];
            const has = current.includes(currentCategory);
            const shouldHave = pickerSelectedIds.has(cp._id);
            if (has !== shouldHave) {
                changedIds.push(cp._id);
                const updated = shouldHave
                    ? [...current, currentCategory]
                    : current.filter(name => name !== currentCategory);
                updates.push({ cp, newMappings: updated });
            }
        });

        if (changedIds.length === 0) {
            showToast(
                language === 'th'
                    ? 'ไม่มีการเปลี่ยนแปลง'
                    : 'No changes',
                'success'
            );
            setPickerOpen(false);
            return;
        }

        // Show saving state
        setSaving(true);
        showToast(
            language === 'th'
                ? `กำลังบันทึก ${changedIds.length} จุด...`
                : `Saving ${changedIds.length} checkpoint(s)...`,
            'success'
        );

        // Save all changed checkpoints to database immediately
        let ok = 0;
        let fail = 0;

        const savePromises = updates.map(async ({ cp, newMappings }) => {
            try {
                const payload = {
                    name: cp.name,
                    type: cp.type,
                    orderNum: cp.orderNum,
                    active: cp.active,
                    description: cp.description,
                    readerId: cp.readerId || '',
                    kmCumulative: cp.kmCumulative,
                    cutoffTime: cp.cutoffTime,
                    distanceMappings: newMappings,
                };
                const res = await fetch(`/api/checkpoints/${cp._id}`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload),
                });
                if (!res.ok) {
                    const errorText = await res.text();
                    console.error(`Save failed for ${cp._id}:`, errorText);
                    return { success: false };
                }
                return { success: true };
            } catch (err) {
                console.error(`Error saving checkpoint ${cp._id}:`, err);
                return { success: false };
            }
        });

        const results = await Promise.all(savePromises);
        ok = results.filter(r => r.success).length;
        fail = results.filter(r => !r.success).length;

        setSaving(false);
        setPickerOpen(false); // Close popup after saving

        // Reload checkpoints from backend to get fresh data
        if (campaign?._id) {
            try {
                const res = await fetch(`/api/checkpoints/campaign/${campaign._id}`, { cache: 'no-store' });
                const json = await res.json();
                const list: Checkpoint[] = Array.isArray(json) ? json : [];
                list.sort((a, b) => a.orderNum - b.orderNum);
                setCheckpoints(list);
                setDirtyIds(new Set()); // Clear dirty flags since we just saved
            } catch (err) {
                console.error('Error reloading checkpoints:', err);
            }
        }

        if (fail === 0) {
            showToast(
                language === 'th'
                    ? `บันทึกสำเร็จ ${ok} จุด`
                    : `Saved ${ok} checkpoint(s) successfully`,
                'success'
            );
        } else {
            showToast(
                language === 'th'
                    ? `บันทึกสำเร็จ ${ok} จุด, ล้มเหลว ${fail} จุด`
                    : `Saved ${ok} checkpoint(s), failed ${fail} checkpoint(s)`,
                'error'
            );
        }
    };

    // Check if checkpoint is enabled for the selected category
    const isEnabledForCategory = (cp: Checkpoint, categoryName: string) => {
        if (!cp.distanceMappings || cp.distanceMappings.length === 0) {
            // If no mappings set, treat as not used for any distance
            return false;
        }
        return cp.distanceMappings.includes(categoryName);
    };

    const visibleCheckpoints = checkpoints.filter(cp =>
        selectedCategory ? isEnabledForCategory(cp, selectedCategory) : false
    );

    // Drag-and-drop handlers for visible checkpoints
    const handleDragStart = (idx: number) => {
        setDragIdx(idx);
    };

    const handleDragOver = (e: any, idx: number) => {
        e.preventDefault();
        setOverIdx(idx);
    };

    const handleDrop = (idx: number) => {
        if (dragIdx === null || dragIdx === idx) {
            setDragIdx(null);
            setOverIdx(null);
            return;
        }

        const visibleSorted = [...visibleCheckpoints].sort((a, b) => a.orderNum - b.orderNum);
        const fromId = visibleSorted[dragIdx]?._id;
        const toId = visibleSorted[idx]?._id;

        if (!fromId || !toId) {
            setDragIdx(null);
            setOverIdx(null);
            return;
        }

        const allSorted = [...checkpoints].sort((a, b) => a.orderNum - b.orderNum);
        const fromIndex = allSorted.findIndex(cp => cp._id === fromId);
        const toIndex = allSorted.findIndex(cp => cp._id === toId);

        if (fromIndex === -1 || toIndex === -1) {
            setDragIdx(null);
            setOverIdx(null);
            return;
        }

        const [moved] = allSorted.splice(fromIndex, 1);
        allSorted.splice(toIndex, 0, moved);

        const updated = allSorted.map((cp, i) => ({ ...cp, orderNum: i + 1 }));
        setCheckpoints(updated);
        setDirtyIds(prev => {
            const next = new Set(prev);
            visibleSorted.forEach(cp => next.add(cp._id));
            return next;
        });

        setDragIdx(null);
        setOverIdx(null);
    };

    const handleDragEnd = () => {
        setDragIdx(null);
        setOverIdx(null);
    };

    const getModeBadgeStyle = (mode: 'rfid' | 'manual') => {
        return mode === 'manual'
            ? { bg: '#fef3c7', text: '#b45309', border: '#fbbf24' }
            : { bg: '#e0f2fe', text: '#0369a1', border: '#38bdf8' };
    };

    const getCampaignDisplayName = () => {
        if (!campaign) return '';
        return language === 'th' ? (campaign.nameTh || campaign.name) : (campaign.nameEn || campaign.name);
    };

    return (
        <AdminLayout
            breadcrumbItems={[
                { label: 'Checkpoint Mapping', labelEn: 'Checkpoint Mapping' }
            ]}
        >
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

            {/* Delete Confirmation Modal */}
            {deleteConfirm.open && deleteConfirm.checkpoint && (
                <div
                    style={{
                        position: 'fixed',
                        inset: 0,
                        background: 'rgba(0,0,0,0.5)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        zIndex: 10000,
                    }}
                    onClick={handleDeleteCancel}
                >
                    <div
                        onClick={e => e.stopPropagation()}
                        style={{
                            background: '#fff',
                            borderRadius: 10,
                            padding: '24px',
                            maxWidth: 400,
                            width: '90%',
                            boxShadow: '0 10px 40px rgba(0,0,0,0.2)',
                        }}
                    >
                        <h3 style={{ margin: '0 0 12px', fontSize: 18, fontWeight: 600, color: '#333' }}>
                            {language === 'th' ? 'ยืนยันการลบ' : 'Confirm Delete'}
                        </h3>
                        <p style={{ margin: '0 0 20px', fontSize: 14, color: '#666', lineHeight: 1.6 }}>
                            {language === 'th'
                                ? `คุณแน่ใจหรือไม่ว่าต้องการลบจุด Checkpoint "${deleteConfirm.checkpoint.name}"?`
                                : `Are you sure you want to delete checkpoint "${deleteConfirm.checkpoint.name}"?`
                            }
                        </p>
                        <p style={{ margin: '0 0 20px', fontSize: 13, color: '#ef4444', fontWeight: 500 }}>
                            {language === 'th'
                                ? '⚠️ การลบนี้ไม่สามารถยกเลิกได้'
                                : '⚠️ This action cannot be undone'
                            }
                        </p>
                        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                            <button
                                onClick={handleDeleteCancel}
                                style={{
                                    padding: '8px 20px',
                                    borderRadius: 6,
                                    border: '1px solid #d1d5db',
                                    background: '#fff',
                                    color: '#4b5563',
                                    fontSize: 14,
                                    fontWeight: 500,
                                    cursor: 'pointer',
                                }}
                            >
                                {language === 'th' ? 'ยกเลิก' : 'Cancel'}
                            </button>
                            <button
                                onClick={handleDeleteConfirm}
                                style={{
                                    padding: '8px 20px',
                                    borderRadius: 6,
                                    border: 'none',
                                    background: '#ef4444',
                                    color: '#fff',
                                    fontSize: 14,
                                    fontWeight: 600,
                                    cursor: 'pointer',
                                }}
                            >
                                {language === 'th' ? 'ลบ' : 'Delete'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Inventory picker popup */}
            {pickerOpen && (
                <div
                    style={{
                        position: 'fixed',
                        inset: 0,
                        background: 'rgba(0,0,0,0.35)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        zIndex: 9998,
                    }}
                    onClick={() => setPickerOpen(false)}
                >
                    <div
                        onClick={e => e.stopPropagation()}
                        style={{
                            width: 'min(700px, 95vw)',
                            maxHeight: '80vh',
                            background: '#fff',
                            borderRadius: 10,
                            boxShadow: '0 18px 45px rgba(0,0,0,0.25)',
                            display: 'flex',
                            flexDirection: 'column',
                            overflow: 'hidden',
                        }}
                    >
                        <div style={{ padding: '12px 18px', borderBottom: '1px solid #e5e7eb', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <div>
                                <h3 style={{ margin: 0, fontSize: 15, fontWeight: 600 }}>
                                    {language === 'th' ? 'เลือกจุด Checkpoint จากคลัง' : 'Select Checkpoints from Inventory'}
                                </h3>
                                <p style={{ margin: '2px 0 0', fontSize: 12, color: '#6b7280' }}>
                                    {selectedCategory
                                        ? (language === 'th'
                                            ? `ระยะที่กำลังตั้งค่า: ${selectedCategory}`
                                            : `Configuring distance: ${selectedCategory}`)
                                        : (language === 'th'
                                            ? 'กรุณาเลือกระยะทางด้านบนก่อน'
                                            : 'Please select a distance above')}
                                </p>
                            </div>
                            <button
                                onClick={() => setPickerOpen(false)}
                                style={{
                                    border: 'none',
                                    background: 'transparent',
                                    cursor: 'pointer',
                                    color: '#6b7280',
                                    padding: 4,
                                }}
                            >
                                ✕
                            </button>
                        </div>

                        <div style={{ padding: '10px 18px', borderBottom: '1px solid #e5e7eb', fontSize: 12, color: '#6b7280' }}>
                            {language === 'th'
                                ? 'ติ๊กเลือกจุดจากคลัง CP หลักที่ต้องการใช้ในระยะนี้ แล้วกดบันทึกด้านล่าง'
                                : 'Tick checkpoints from the master inventory to use for this distance, then click Save below.'}
                        </div>

                        <div style={{ padding: '10px 18px', overflowY: 'auto' }}>
                            {checkpoints.length === 0 ? (
                                <div style={{ textAlign: 'center', padding: 30 }}>
                                    <p style={{ fontSize: 40, margin: '0 0 8px' }}>📍</p>
                                    <p style={{ fontSize: 13, color: '#6b7280', margin: 0 }}>
                                        {language === 'th'
                                            ? 'ยังไม่มีจุด Checkpoint ในคลังสำหรับกิจกรรมนี้'
                                            : 'No checkpoints in inventory for this campaign yet.'}
                                    </p>
                                    <button
                                        onClick={handleManageInventory}
                                        style={{
                                            marginTop: 12,
                                            padding: '7px 18px',
                                            borderRadius: 6,
                                            border: 'none',
                                            background: '#3b82f6',
                                            color: '#fff',
                                            fontSize: 13,
                                            fontWeight: 600,
                                            cursor: 'pointer',
                                        }}
                                    >
                                        {language === 'th' ? 'ไปเพิ่มจุดในคลัง' : 'Go to checkpoint inventory'}
                                    </button>
                                </div>
                            ) : (
                                <table className="data-table" style={{ width: '100%', tableLayout: 'fixed' }}>
                                    <thead>
                                        <tr>
                                            <th style={{ width: 40 }} />
                                            <th style={{ width: 60 }}>{language === 'th' ? 'ลำดับ' : 'Order'}</th>
                                            <th style={{ textAlign: 'left' }}>{language === 'th' ? 'ชื่อจุด' : 'Checkpoint'}</th>
                                            <th style={{ width: 120 }}>{language === 'th' ? 'Timing Method' : 'Timing Method'}</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {checkpoints
                                            .slice()
                                            .sort((a, b) => a.orderNum - b.orderNum)
                                            .map(cp => {
                                                const checked = pickerSelectedIds.has(cp._id);
                                                return (
                                                    <tr key={cp._id} style={checked ? { background: '#eff6ff' } : undefined}>
                                                        <td style={{ textAlign: 'center' }}>
                                                            <input
                                                                type="checkbox"
                                                                checked={checked}
                                                                onChange={() => handleTogglePickerItem(cp._id)}
                                                            />
                                                        </td>
                                                        <td style={{ textAlign: 'center', fontSize: 12 }}>{cp.orderNum}</td>
                                                        <td
                                                            style={{
                                                                textAlign: 'left',
                                                                maxWidth: 320,
                                                                whiteSpace: 'nowrap',
                                                                overflow: 'hidden',
                                                                textOverflow: 'ellipsis',
                                                                fontSize: 13,
                                                                fontWeight: 500,
                                                            }}
                                                            title={cp.name}
                                                        >
                                                            {cp.name}
                                                        </td>
                                                        <td style={{ textAlign: 'center', fontSize: 11 }}>
                                                            {(cp.description === 'manual' || cp.description === 'rfid')
                                                                ? cp.description.toUpperCase()
                                                                : 'RFID'}
                                                        </td>
                                                    </tr>
                                                );
                                            })}
                                    </tbody>
                                </table>
                            )}
                        </div>

                        <div style={{ padding: '10px 18px', borderTop: '1px solid #e5e7eb', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span style={{ fontSize: 12, color: '#6b7280' }}>
                                {language === 'th'
                                    ? `เลือกแล้ว ${pickerSelectedIds.size} จุด`
                                    : `Selected ${pickerSelectedIds.size} checkpoint(s)`}
                            </span>
                            <div style={{ display: 'flex', gap: 8 }}>
                                <button
                                    onClick={() => setPickerOpen(false)}
                                    style={{
                                        padding: '6px 14px',
                                        borderRadius: 6,
                                        border: '1px solid #d1d5db',
                                        background: '#fff',
                                        fontSize: 13,
                                        cursor: 'pointer',
                                        color: '#4b5563',
                                    }}
                                >
                                    {language === 'th' ? 'ยกเลิก' : 'Cancel'}
                                </button>
                                <button
                                    onClick={handleApplyPickerSelection}
                                    disabled={saving}
                                    style={{
                                        padding: '6px 16px',
                                        borderRadius: 6,
                                        border: 'none',
                                        background: saving ? '#9ca3af' : '#16a34a',
                                        color: '#fff',
                                        fontSize: 13,
                                        fontWeight: 600,
                                        cursor: saving ? 'not-allowed' : 'pointer',
                                        opacity: saving ? 0.7 : 1,
                                    }}
                                >
                                    {saving
                                        ? (language === 'th' ? 'กำลังบันทึก...' : 'Saving...')
                                        : (language === 'th' ? 'บันทึกการเลือก' : 'Save selection')
                                    }
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}


            <div className="content-box">
                {loading ? (
                    <div style={{ textAlign: 'center', padding: 30, color: '#999', fontSize: 13 }}>Loading...</div>
                ) : !campaign ? (
                    <div style={{ padding: 24 }}>
                        <p style={{ color: '#666', marginBottom: 8, fontSize: 14 }}>
                            {language === 'th'
                                ? 'ยังไม่ได้เลือกกิจกรรมหลัก กรุณาไปที่หน้าอีเวนต์แล้วกดดาวที่กิจกรรมที่ต้องการตั้งค่า Checkpoint.'
                                : 'No featured event selected. Please go to the Events page and star the campaign you want to configure checkpoints for.'}
                        </p>
                        <a href="/admin/events" style={{
                            display: 'inline-block', marginTop: 4, padding: '6px 16px',
                            borderRadius: 6, background: '#3b82f6', color: '#fff',
                            fontWeight: 600, textDecoration: 'none', fontSize: 13,
                        }}>
                            {language === 'th' ? 'ไปหน้าจัดการอีเวนต์' : 'Go to Events'}
                        </a>
                    </div>
                ) : (
                    <>
                        {/* Filter toolbar */}

                        <div className="filter-toolbar" style={{ display: 'flex', gap: 10, marginBottom: 15, flexWrap: 'wrap', alignItems: 'center' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                <span style={{ fontWeight: 600, fontSize: 13 }}>
                                    {language === 'th' ? 'ระยะทางที่กำลังตั้งค่า:' : 'Configuring distance:'}
                                </span>
                                <select
                                    className="form-input"
                                    value={selectedCategory}
                                    onChange={e => setSelectedCategory(e.target.value)}
                                    style={{ width: 220, fontWeight: 700, borderColor: '#3c8dbc', fontSize: 13, padding: '6px 10px' }}
                                >
                                    {categories.map((cat, i) => (
                                        <option key={`${cat.name}-${i}`} value={cat.name}>
                                            {cat.name}{cat.distance ? ` (${cat.distance})` : ''}
                                        </option>
                                    ))}
                                </select>
                            </div>

                            <button onClick={handleOpenPicker} className="btn btn-query" style={{ background: '#3c8dbc', fontSize: 13, display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="16" /><line x1="8" y1="12" x2="16" y2="12" /></svg>
                                {language === 'th' ? 'ดึงจุด Checkpoint' : 'Pull checkpoints'}

                            </button>
                            <button
                                onClick={handleSyncFromRaceTiger}
                                disabled={syncing}
                                className="btn btn-query"
                                style={{
                                    background: '#f39c12', marginLeft: 'auto', fontSize: 13,
                                    display: 'inline-flex', alignItems: 'center', gap: 5,
                                    opacity: syncing ? 0.7 : 1,
                                    cursor: syncing ? 'not-allowed' : 'pointer',
                                }}
                            >
                                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="23 4 23 10 17 10" /><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" /></svg>
                                {syncing
                                    ? (language === 'th' ? 'กำลัง Sync...' : 'Syncing...')
                                    : (language === 'th' ? 'Sync from RaceTiger' : 'Sync from RaceTiger')
                                }
                            </button>
                            <button
                                onClick={handleSaveAll}
                                disabled={saving || !hasUnsavedChanges || dirtyIds.size === 0}
                                style={{
                                    padding: '6px 14px', borderRadius: 3, border: 'none',
                                    background: (hasUnsavedChanges && dirtyIds.size > 0) ? '#00a65a' : '#aaa', color: '#fff ',
                                    cursor: (hasUnsavedChanges && dirtyIds.size > 0 && !saving) ? 'pointer' : 'not-allowed', fontSize: 13,
                                    display: 'inline-flex', alignItems: 'center', gap: 5,
                                    opacity: saving ? 0.7 : 1,
                                }}
                            >
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                    <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
                                    <polyline points="17 21 17 13 7 13 7 21" />
                                    <polyline points="7 3 7 8 15 8" />
                                </svg>
                                {saving
                                    ? (language === 'th' ? 'กำลังบันทึก...' : 'Saving...')
                                    : (language === 'th' ? 'บันทึกแก้ไขทั้งหมด' : 'Save All Changes')
                                }
                                {hasUnsavedChanges && !saving && (
                                    <span style={{
                                        background: '#fff', color: '#00a65a', borderRadius: '50%',
                                        width: 18, height: 18, fontSize: 11, fontWeight: 700,
                                        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                                    }}>{dirtyIds.size}</span>
                                )}
                            </button>
                        </div>


                        {/* Table */}
                        {loadingCps ? (
                            <div style={{ textAlign: 'center', padding: 30, color: '#999' }}>Loading...</div>
                        ) : checkpoints.length === 0 ? (
                            <div style={{ textAlign: 'center', padding: 40 }}>
                                <p style={{ fontSize: 48, marginBottom: 12 }}>📍</p>
                                <p style={{ color: '#999' }}>
                                    {language === 'th' ? 'ยังไม่มีจุด Checkpoint สำหรับกิจกรรมนี้' : 'No checkpoints for this event'}
                                </p>
                                <button onClick={handleManageInventory} style={{
                                    display: 'inline-block', marginTop: 12, padding: '8px 20px',
                                    borderRadius: 6, background: '#3c8dbc', color: '#fff', border: 'none',
                                    fontWeight: 600, cursor: 'pointer',
                                }}>
                                    {language === 'th' ? 'ไปเพิ่มจุด Checkpoint' : 'Add Checkpoints'}
                                </button>
                            </div>
                        ) : visibleCheckpoints.length === 0 ? (
                            <div style={{ textAlign: 'center', padding: 40 }}>
                                <p style={{ fontSize: 48, marginBottom: 12 }}>🧭</p>
                                <p style={{ color: '#999', marginBottom: 8 }}>
                                    {language === 'th'
                                        ? 'ระยะนี้ยังไม่ได้ดึงจุด Checkpoint มาใช้งาน'
                                        : 'No checkpoints selected from inventory for this distance yet.'}
                                </p>
                                <button
                                    onClick={handleOpenPicker}
                                    style={{
                                        display: 'inline-block',
                                        marginTop: 4,
                                        padding: '8px 20px',
                                        borderRadius: 6,
                                        background: '#3c8dbc',
                                        color: '#fff',
                                        border: 'none',
                                        fontWeight: 600,
                                        cursor: 'pointer',
                                    }}
                                >
                                    {language === 'th' ? 'ดึงจุด Checkpoint' : 'Pull checkpoints'}
                                </button>
                            </div>
                        ) : (
                            <table className="data-table" style={{ tableLayout: 'fixed', width: '100%' }}>
                                <thead>
                                    <tr>
                                        <th style={{ width: 30 }}></th>
                                        <th style={{ width: 50 }}>{language === 'th' ? 'ลำดับ' : 'Order'}</th>
                                        <th
                                            style={{
                                                textAlign: 'left',
                                                width: 260,
                                                maxWidth: 260,
                                            }}
                                        >
                                            {language === 'th' ? 'ชื่อจุด (Checkpoint Name)' : 'Checkpoint Name'}
                                        </th>
                                        <th style={{ width: 90 }}>{language === 'th' ? 'KM สะสม' : 'Cumul. KM'}</th>
                                        <th style={{ width: 190 }}>{language === 'th' ? 'Timing Method / Reader ID' : 'Timing Method / Reader ID'}</th>
                                        <th style={{ width: 160 }}>Cut-off</th>
                                        <th style={{ width: 60 }}>{language === 'th' ? 'ใช้งาน' : 'Active'}</th>
                                        <th style={{ width: 45 }}>{language === 'th' ? 'ลบ' : 'Del'}</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {visibleCheckpoints
                                        .slice()
                                        .sort((a, b) => a.orderNum - b.orderNum)
                                        .map((cp, idx) => {
                                            const isDirty = dirtyIds.has(cp._id);
                                            const isStart = cp.type === 'start';
                                            const isFinish = cp.type === 'finish';
                                            const hasCutoff = cp.cutoffTime && cp.cutoffTime !== '-' && cp.cutoffTime !== '';
                                            const kmHasValue = cp.kmCumulative !== undefined && cp.kmCumulative !== null && cp.kmCumulative > 0;
                                            const mode: 'rfid' | 'manual' =
                                                (cp.description === 'manual' || cp.description === 'rfid') ? cp.description : 'rfid';
                                            const badge = getModeBadgeStyle(mode);

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
                                                        ...(overIdx === idx && dragIdx !== null && dragIdx !== idx
                                                            ? { borderTop: '2px solid #3b82f6' }
                                                            : {}),
                                                        opacity: dragIdx === idx ? 0.5 : 1,
                                                        transition: 'opacity 0.15s',
                                                    }}
                                                >
                                                    <td style={{ textAlign: 'center', cursor: 'grab', userSelect: 'none', width: 30 }} title={language === 'th' ? 'คลิกค้างเพื่อย้ายลำดับ' : 'Hold to drag & reorder'}>
                                                        <svg width="12" height="18" viewBox="0 0 12 18" fill="#999">
                                                            <circle cx="3" cy="3" r="1.5" />
                                                            <circle cx="9" cy="3" r="1.5" />
                                                            <circle cx="3" cy="9" r="1.5" />
                                                            <circle cx="9" cy="9" r="1.5" />
                                                            <circle cx="3" cy="15" r="1.5" />
                                                            <circle cx="9" cy="15" r="1.5" />
                                                        </svg>
                                                    </td>
                                                    <td style={{ textAlign: 'center' }}>{cp.orderNum}</td>
                                                    <td
                                                        style={{
                                                            textAlign: 'left',
                                                            maxWidth: 260,
                                                            whiteSpace: 'nowrap',
                                                            overflow: 'hidden',
                                                            textOverflow: 'ellipsis',
                                                        }}
                                                        title={cp.name}
                                                    >
                                                        {cp.name}
                                                    </td>
                                                    <td>
                                                        <input
                                                            type="number"
                                                            step="0.1"
                                                            className="table-input"
                                                            defaultValue={cp.kmCumulative ?? 0}
                                                            key={`km-${cp._id}-${cp.kmCumulative}`}
                                                            onChange={e => {
                                                                const val = parseFloat(e.target.value) || 0;
                                                                updateCheckpoint(cp._id, { kmCumulative: val });
                                                            }}
                                                            style={{
                                                                width: '100%', padding: '4px 8px', border: '1px solid #ddd',
                                                                borderRadius: 3, fontFamily: 'inherit', fontSize: 13,
                                                                textAlign: 'center',
                                                                color: kmHasValue ? '#3c8dbc' : undefined,
                                                                fontWeight: kmHasValue ? 600 : undefined,
                                                            }}
                                                        />
                                                    </td>
                                                    <td>
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexWrap: 'wrap' }}>
                                                            <select
                                                                value={mode}
                                                                onChange={e => {
                                                                    const newMode = e.target.value as 'rfid' | 'manual';
                                                                    updateCheckpoint(cp._id, {
                                                                        description: newMode,
                                                                        readerId: newMode === 'manual' ? '' : (cp.readerId || ''),
                                                                    });
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
                                                            <input
                                                                type="text"
                                                                placeholder="Reader ID"
                                                                value={cp.readerId || ''}
                                                                onChange={e => updateCheckpoint(cp._id, { readerId: e.target.value })}
                                                                disabled={mode === 'manual'}
                                                                style={{
                                                                    width: 100,
                                                                    padding: '4px 8px',
                                                                    borderRadius: 4,
                                                                    border: '1px solid #d1d5db',
                                                                    fontSize: 12,
                                                                    background: mode === 'manual' ? '#f5f5f5' : '#fff',
                                                                    opacity: mode === 'manual' ? 0.5 : 1,
                                                                }}
                                                            />
                                                        </div>
                                                    </td>
                                                    <td>
                                                        <input
                                                            type="datetime-local"
                                                            className="table-input"
                                                            draggable={false}
                                                            onDragStart={e => e.stopPropagation()}
                                                            onMouseDown={e => e.stopPropagation()}
                                                            value={cp.cutoffTime || ''}
                                                            onChange={e => updateCheckpoint(cp._id, { cutoffTime: e.target.value })}
                                                            title={isStart
                                                                ? (language === 'th' ? 'ถ้าเกินเวลานี้ นักวิ่งที่ยังไม่เริ่ม → DNS' : 'After this time, not-started runners → DNS')
                                                                : (language === 'th' ? 'ถ้าเกินเวลานี้ นักวิ่งที่ยังวิ่งไม่ถึง → DNF' : 'After this time, runners not reached → DNF')
                                                            }
                                                            style={{
                                                                width: '100%', padding: '3px 4px', border: '1px solid #ddd',
                                                                borderRadius: 3, fontFamily: 'inherit', fontSize: 12,
                                                                color: hasCutoff ? '#dd4b39' : '#999',
                                                                fontWeight: hasCutoff ? 600 : 400,
                                                            }}
                                                        />
                                                    </td>
                                                    <td style={{ textAlign: 'center' }}>
                                                        <div
                                                            className={`toggle-sim ${cp.active ? 'on' : ''}`}
                                                            onClick={() => handleToggle(cp)}
                                                            style={{ cursor: 'pointer' }}
                                                        />
                                                    </td>
                                                    <td style={{ textAlign: 'center' }}>
                                                        {(isStart || isFinish) ? (
                                                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#ccc" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                                                <circle cx="12" cy="12" r="10" />
                                                                <line x1="15" y1="9" x2="9" y2="15" />
                                                                <line x1="9" y1="9" x2="15" y2="15" />
                                                            </svg>
                                                        ) : (
                                                            <button
                                                                onClick={() => handleDeleteClick(cp)}
                                                                style={{
                                                                    background: 'none', border: 'none', cursor: 'pointer',
                                                                    color: '#dd4b39', padding: 4,
                                                                }}
                                                                title={language === 'th' ? 'ลบ' : 'Delete'}
                                                            >
                                                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                                                    <polyline points="3 6 5 6 21 6" />
                                                                    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                                                                </svg>
                                                            </button>
                                                        )}
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                </tbody>
                            </table>
                        )}

                        {/* Info box */}
                        <div style={{
                            marginTop: 15, padding: 15, background: '#fcfcfc',
                            border: '1px dashed #d2d6de', borderRadius: 3,
                        }}>
                            <h4 style={{ fontSize: 12, marginBottom: 8, color: '#3c8dbc', display: 'flex', alignItems: 'center', gap: 6 }}>
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 18h6M10 22h4M12 2a7 7 0 0 1 4 12.9V17a1 1 0 0 1-1 1H9a1 1 0 0 1-1-1v-2.1A7 7 0 0 1 12 2z" /></svg>
                                {language === 'th' ? 'วิธีตั้งค่า Checkpoint Mapping' : 'How Checkpoint Mapping Works'}
                            </h4>
                            <ul style={{ fontSize: 11, color: '#666', marginLeft: 20, lineHeight: 1.6 }}>
                                <li><strong>KM {language === 'th' ? 'สะสม' : 'Cumulative'}:</strong> {language === 'th' ? 'ระบุระยะทางจริงที่นักวิ่งของระยะนี้ต้องวิ่งถึงจุดตรวจนั้น ๆ' : 'Specify the actual distance runners in this category must cover to reach this checkpoint.'}</li>
                                <li><strong>{language === 'th' ? 'Timing Method / Reader ID' : 'Timing Method / Reader ID'}:</strong> {language === 'th' ? 'เลือกวิธีจับเวลา (RFID / Manual) และกำหนด Reader ID สำหรับแต่ละจุด' : 'Choose timing method (RFID / Manual) and set Reader ID for each checkpoint.'}</li>
                                <li><strong>Cut-off:</strong> {language === 'th' ? 'กำหนดเวลาตัดตัวนักกีฬา หากเกินเวลานี้สถานะนักกีฬาจะถูกเปลี่ยนเป็น DNF/OTL อัตโนมัติ' : 'Set the cutoff time. Athletes exceeding this time will be automatically marked DNF/OTL.'}</li>
                                <li><strong>{language === 'th' ? 'ดึงจุด Checkpoint' : 'Pull checkpoints'}:</strong> {language === 'th' ? 'เลือกระยะทางด้านบน แล้วกดปุ่ม "ดึงจุด Checkpoint" เพื่อเลือกจุดที่ต้องการใช้ในระยะนั้น จากนั้นจึงบันทึกแผนที่เส้นทาง' : 'Select a distance above, click "Pull checkpoints" to choose which checkpoints to use for that distance, then save the route map.'}</li>
                            </ul>
                        </div>
                    </>
                )}
            </div>
        </AdminLayout>
    );
}
