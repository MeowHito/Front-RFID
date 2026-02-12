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

    const hasUnsavedChanges = dirtyIds.size > 0;

    const showToast = (message: string, type: 'success' | 'error') => {
        setToast({ message, type });
        setTimeout(() => setToast(null), 3000);
    };

    const markDirty = useCallback((cpId: string) => {
        setDirtyIds(prev => { const n = new Set(prev); n.add(cpId); return n; });
    }, []);

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

    // Delete checkpoint
    const handleDelete = async (cp: Checkpoint) => {
        if (!confirm(language === 'th' ? `ต้องการลบ "${cp.name}" ?` : `Delete "${cp.name}"?`)) return;
        try {
            const res = await fetch(`/api/checkpoints/${cp._id}`, { method: 'DELETE' });
            if (!res.ok) throw new Error('Failed');
            setCheckpoints(prev => prev.filter(c => c._id !== cp._id));
            showToast(language === 'th' ? 'ลบสำเร็จ' : 'Deleted', 'success');
        } catch {
            showToast(language === 'th' ? 'ลบไม่สำเร็จ' : 'Delete failed', 'error');
        }
    };

    // Save all dirty checkpoints
    const handleSaveAll = async () => {
        if (!hasUnsavedChanges) {
            showToast(language === 'th' ? 'ไม่มีการเปลี่ยนแปลง' : 'No changes', 'success');
            return;
        }
        setSaving(true);
        let ok = 0, fail = 0;
        for (const cpId of dirtyIds) {
            const cp = checkpoints.find(c => c._id === cpId);
            if (!cp) continue;
            try {
                const res = await fetch(`/api/checkpoints/${cpId}`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        name: cp.name,
                        type: cp.type,
                        orderNum: cp.orderNum,
                        active: cp.active,
                        description: cp.description,
                        readerId: cp.readerId,
                        kmCumulative: cp.kmCumulative,
                        cutoffTime: cp.cutoffTime,
                        distanceMappings: cp.distanceMappings || [],
                    }),
                });
                if (!res.ok) throw new Error('Failed');
                ok++;
            } catch { fail++; }
        }
        setSaving(false);
        setDirtyIds(new Set());
        if (fail === 0) {
            showToast(language === 'th' ? `บันทึกสำเร็จ ${ok} รายการ` : `Saved ${ok} item(s)`, 'success');
        } else {
            showToast(language === 'th' ? `สำเร็จ ${ok}, ล้มเหลว ${fail}` : `Saved ${ok}, failed ${fail}`, 'error');
        }
    };

    // Refresh from DB
    const handleRefresh = () => {
        if (campaign?._id) {
            if (hasUnsavedChanges && !confirm(language === 'th' ? 'มีการเปลี่ยนแปลงที่ยังไม่บันทึก ต้องการรีเฟรชหรือไม่?' : 'Unsaved changes will be lost. Refresh?')) return;
            loadCheckpoints(campaign._id);
        }
    };

    // Navigate to checkpoint management page
    const handlePullFromInventory = () => {
        window.location.href = '/admin/checkpoints';
    };

    // Check if checkpoint is enabled for the selected category
    const isEnabledForCategory = (cp: Checkpoint, categoryName: string) => {
        if (!cp.distanceMappings || cp.distanceMappings.length === 0) {
            // If no mappings set, default to all enabled
            return true;
        }
        return cp.distanceMappings.includes(categoryName);
    };

    // Get shared badges for a checkpoint
    const getSharedBadges = (cp: Checkpoint) => {
        if (!categories.length) return [];
        if (!cp.distanceMappings || cp.distanceMappings.length === 0) {
            return categories.map(c => c.name);
        }
        return cp.distanceMappings;
    };

    const getCampaignDisplayName = () => {
        if (!campaign) return '';
        return language === 'th' ? (campaign.nameTh || campaign.name) : (campaign.nameEn || campaign.name);
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

            {/* Page header */}
            <div style={{ marginBottom: 15, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', flexWrap: 'wrap', gap: 10 }}>
                <div>
                    <h2 style={{ fontSize: 18, fontWeight: 500, margin: 0 }}>Checkpoint Mapping</h2>
                    <p style={{ fontSize: 12, color: '#777', margin: '4px 0 0' }}>
                        {language === 'th'
                            ? 'จัดการจุดเช็คพอยท์และผูกความสัมพันธ์เข้ากับประเภทการแข่งขัน'
                            : 'Manage checkpoints and map them to race categories'}
                    </p>
                </div>
                <div style={{ display: 'flex', gap: 5 }}>
                    <button
                        onClick={handlePullFromInventory}
                        style={{
                            padding: '6px 12px', borderRadius: 3, border: '1px solid #ccc',
                            background: '#fff', color: '#333', cursor: 'pointer', fontSize: 13,
                            display: 'inline-flex', alignItems: 'center', gap: 5,
                        }}
                    >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="9 11 12 14 22 4" /><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" /></svg>
                        {language === 'th' ? 'จัดการคลัง CP หลัก' : 'Manage CP Inventory'}
                    </button>
                    <button
                        onClick={handleSaveAll}
                        disabled={saving || !hasUnsavedChanges}
                        style={{
                            padding: '6px 12px', borderRadius: 3, border: 'none',
                            background: hasUnsavedChanges ? '#666' : '#999', color: '#fff',
                            cursor: hasUnsavedChanges ? 'pointer' : 'not-allowed', fontSize: 13,
                            display: 'inline-flex', alignItems: 'center', gap: 5,
                            opacity: saving ? 0.7 : 1,
                        }}
                    >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
                            <polyline points="17 21 17 13 7 13 7 21" />
                            <polyline points="7 3 7 8 15 8" />
                        </svg>
                        {saving ? (language === 'th' ? 'กำลังบันทึก...' : 'Saving...') : (language === 'th' ? 'บันทึกแผนที่เส้นทาง' : 'Save Route Map')}
                        {hasUnsavedChanges && !saving && (
                            <span style={{
                                background: '#fff', color: '#666', borderRadius: '50%',
                                width: 18, height: 18, fontSize: 11, fontWeight: 700,
                                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                            }}>{dirtyIds.size}</span>
                        )}
                    </button>
                </div>
            </div>

            <div className="content-box">
                {loading ? (
                    <div style={{ textAlign: 'center', padding: 40, color: '#999' }}>Loading...</div>
                ) : !campaign ? (
                    <div style={{ textAlign: 'center', padding: 40 }}>
                        <p style={{ fontSize: 48, marginBottom: 12 }}>⭐</p>
                        <p style={{ color: '#999' }}>
                            {language === 'th'
                                ? 'กรุณาเลือกกิจกรรมหลัก (กดดาว) ที่หน้าจัดการอีเวนต์ก่อน'
                                : 'Please select a featured event first from the Events page'}
                        </p>
                        <a href="/admin/events" style={{
                            display: 'inline-block', marginTop: 12, padding: '8px 20px',
                            borderRadius: 6, background: '#3b82f6', color: '#fff',
                            fontWeight: 600, textDecoration: 'none',
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
                            <button onClick={handleRefresh} className="btn btn-query" style={{ fontSize: 13, display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="23 4 23 10 17 10" /><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" /></svg>
                                {language === 'th' ? 'รีเฟรช' : 'Refresh'}
                            </button>
                            <button onClick={handlePullFromInventory} className="btn btn-query" style={{ background: '#3c8dbc', marginLeft: 'auto', fontSize: 13, display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="16" /><line x1="8" y1="12" x2="16" y2="12" /></svg>
                                {language === 'th' ? 'ดึงจุดตรวจจากคลัง' : 'Pull from inventory'}
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
                                <button onClick={handlePullFromInventory} style={{
                                    display: 'inline-block', marginTop: 12, padding: '8px 20px',
                                    borderRadius: 6, background: '#3c8dbc', color: '#fff', border: 'none',
                                    fontWeight: 600, cursor: 'pointer',
                                }}>
                                    {language === 'th' ? 'ไปเพิ่มจุด Checkpoint' : 'Add Checkpoints'}
                                </button>
                            </div>
                        ) : (
                            <table className="data-table" style={{ tableLayout: 'fixed', width: '100%' }}>
                                <thead>
                                    <tr>
                                        <th style={{ width: 50 }}>{language === 'th' ? 'ลำดับ' : 'Order'}</th>
                                        <th style={{ textAlign: 'left' }}>{language === 'th' ? 'ชื่อจุด (Checkpoint Name)' : 'Checkpoint Name'}</th>
                                        <th style={{ width: 90 }}>{language === 'th' ? 'KM สะสม' : 'Cumul. KM'}</th>
                                        <th style={{ width: 120 }}>{language === 'th' ? 'ประเภท' : 'Type'}</th>
                                        <th style={{ width: 160 }}>Cut-off</th>
                                        <th style={{ width: 140, textAlign: 'left' }}>{language === 'th' ? 'ระยะร่วม' : 'Shared'}</th>
                                        <th style={{ width: 60 }}>{language === 'th' ? 'ใช้งาน' : 'Active'}</th>
                                        <th style={{ width: 45 }}>{language === 'th' ? 'ลบ' : 'Del'}</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {checkpoints.map((cp) => {
                                        const isDirty = dirtyIds.has(cp._id);
                                        const shared = getSharedBadges(cp);
                                        const isStart = cp.type === 'start';
                                        const isFinish = cp.type === 'finish';
                                        const hasCutoff = cp.cutoffTime && cp.cutoffTime !== '-' && cp.cutoffTime !== '';
                                        const kmHasValue = cp.kmCumulative !== undefined && cp.kmCumulative !== null && cp.kmCumulative > 0;

                                        return (
                                            <tr key={cp._id} style={isDirty ? { background: '#fffbeb' } : undefined}>
                                                <td style={{ textAlign: 'center' }}>{cp.orderNum}</td>
                                                <td style={{ textAlign: 'left' }}>{cp.name}</td>
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
                                                    <select
                                                        className="table-select"
                                                        value={cp.type}
                                                        onChange={e => updateCheckpoint(cp._id, { type: e.target.value })}
                                                        style={{
                                                            width: '100%', padding: '4px 5px', border: '1px solid #ddd',
                                                            borderRadius: 3, fontFamily: 'inherit', fontSize: 12, cursor: 'pointer',
                                                        }}
                                                    >
                                                        <option value="start">START</option>
                                                        <option value="checkpoint">CHECKPOINT</option>
                                                        <option value="finish">FINISH</option>
                                                    </select>
                                                </td>
                                                <td>
                                                    {isStart ? (
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                                                            <span style={{ color: '#ccc', fontSize: 13 }}>—</span>
                                                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#ccc" strokeWidth="2"><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></svg>
                                                        </div>
                                                    ) : (
                                                        <input
                                                            type="datetime-local"
                                                            className="table-input"
                                                            defaultValue={cp.cutoffTime || ''}
                                                            key={`cutoff-${cp._id}-${cp.cutoffTime}`}
                                                            onChange={e => updateCheckpoint(cp._id, { cutoffTime: e.target.value })}
                                                            style={{
                                                                width: '100%', padding: '3px 4px', border: '1px solid #ddd',
                                                                borderRadius: 3, fontFamily: 'inherit', fontSize: 12,
                                                                color: hasCutoff ? '#dd4b39' : '#999',
                                                                fontWeight: hasCutoff ? 600 : 400,
                                                            }}
                                                        />
                                                    )}
                                                </td>
                                                <td style={{ overflow: 'hidden' }}>
                                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3 }}>
                                                        {categories.length > 0 ? categories.map((cat, i) => {
                                                            const isEnabled = isEnabledForCategory(cp, cat.name);
                                                            return (
                                                                <span
                                                                    key={i}
                                                                    onClick={() => toggleDistanceMapping(cp._id, cat.name)}
                                                                    style={{
                                                                        background: isEnabled ? '#e0f2fe' : '#f3f4f6',
                                                                        color: isEnabled ? '#0369a1' : '#9ca3af',
                                                                        padding: '1px 6px', borderRadius: 8,
                                                                        fontSize: 9, fontWeight: 600,
                                                                        whiteSpace: 'nowrap',
                                                                        display: 'inline-block',
                                                                        cursor: 'pointer',
                                                                        border: isEnabled ? '1px solid #7dd3fc' : '1px solid #e5e7eb',
                                                                        transition: 'all 0.15s',
                                                                        userSelect: 'none',
                                                                    }}
                                                                    title={isEnabled
                                                                        ? (language === 'th' ? `คลิกเพื่อปิดใช้งาน ${cat.name}` : `Click to disable ${cat.name}`)
                                                                        : (language === 'th' ? `คลิกเพื่อเปิดใช้งาน ${cat.name}` : `Click to enable ${cat.name}`)
                                                                    }
                                                                >
                                                                    {cat.name}
                                                                </span>
                                                            );
                                                        }) : (
                                                            <span style={{ color: '#ccc', fontSize: 11 }}>-</span>
                                                        )}
                                                    </div>
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
                                                            onClick={() => handleDelete(cp)}
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
                                {language === 'th' ? 'วิธีจัดการจุดตรวจร่วมกัน (Mapping System)' : 'How Checkpoint Mapping Works'}
                            </h4>
                            <ul style={{ fontSize: 11, color: '#666', marginLeft: 20, lineHeight: 1.6 }}>
                                <li><strong>KM {language === 'th' ? 'สะสม' : 'Cumulative'}:</strong> {language === 'th' ? 'ระบุระยะทางแยกตามระยะทางจริงที่นักวิ่งประเภทนี้ต้องวิ่งถึงจุดตรวจนั้นๆ' : 'Specify the actual distance runners in this category must cover to reach this checkpoint'}</li>
                                <li><strong>{language === 'th' ? 'ประเภทจุด' : 'Point Type'}:</strong> {language === 'th' ? 'กำหนดบทบาทของ CP เฉพาะระยะนี้ (เช่น ระยะสั้นอาจใช้ CP กลางป่าเป็นจุด FINISH ได้)' : 'Define the role of each CP for this distance (e.g., a mid-course CP can serve as FINISH for shorter distances)'}</li>
                                <li><strong>Cut-off:</strong> {language === 'th' ? 'กำหนดเวลาตัดตัวนักกีฬา หากเกินเวลานี้สถานะนักกีฬาจะถูกเปลี่ยนเป็น DNF/OTL อัตโนมัติ' : 'Set the cutoff time. Athletes exceeding this time will be automatically marked DNF/OTL'}</li>
                                <li><strong>{language === 'th' ? 'ระยะร่วม' : 'Shared Distances'}:</strong> {language === 'th' ? 'คลิกที่ชื่อระยะเพื่อเปิด/ปิดการใช้งานจุดนี้สำหรับระยะนั้นๆ แต่ละระยะสามารถเลือกใช้จุดต่างกันได้' : 'Click distance names to toggle checkpoint usage per distance. Each distance can use different checkpoints.'}</li>
                            </ul>
                        </div>
                    </>
                )}
            </div>
        </AdminLayout>
    );
}
