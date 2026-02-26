'use client';

import { useState, useEffect } from 'react';
import AdminLayout from '@/app/admin/AdminLayout';
import { useLanguage } from '@/lib/language-context';

// All available column keys and labels
const ALL_COLUMNS = [
    { key: 'genRank', label: 'Gender Rank', labelTh: 'อันดับเพศ' },
    { key: 'catRank', label: 'Category Rank', labelTh: 'อันดับประเภท' },
    { key: 'sex', label: 'Sex', labelTh: 'เพศ' },
    { key: 'gunTime', label: 'Gun Time', labelTh: 'เวลาปืน' },
    { key: 'netTime', label: 'Net Time', labelTh: 'เวลาสุทธิ' },
    { key: 'genNet', label: 'Gender Net Rank', labelTh: 'จัดเพศสุทธิ' },
    { key: 'gunPace', label: 'Gun Pace', labelTh: 'เพสปืน' },
    { key: 'netPace', label: 'Net Pace', labelTh: 'เพสสุทธิ' },
    { key: 'finish', label: 'Total Finishers', labelTh: 'จบทั้งหมด' },
    { key: 'genFin', label: 'Gender Finishers', labelTh: 'จบ/เพศ' },
];

// Always-on columns (cannot be toggled off)
const ALWAYS_ON = ['rank', 'runner', 'status', 'progress'];

export default function DisplaySettingsPage() {
    const { language } = useLanguage();
    const [campaign, setCampaign] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [selectedCols, setSelectedCols] = useState<string[]>([]);
    const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

    useEffect(() => {
        fetchCampaign();
    }, []);

    const fetchCampaign = async () => {
        try {
            const res = await fetch('/api/campaigns/featured');
            if (res.ok) {
                const data = await res.json();
                setCampaign(data);
                // If displayColumns is set, use it; otherwise start with all columns selected
                setSelectedCols(data.displayColumns?.length > 0 ? data.displayColumns : ALL_COLUMNS.map(c => c.key));
            }
        } catch {
            /* */
        } finally {
            setLoading(false);
        }
    };

    const showToast = (message: string, type: 'success' | 'error') => {
        setToast({ message, type });
        setTimeout(() => setToast(null), 3000);
    };

    const toggleColumn = (key: string) => {
        setSelectedCols(prev => prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]);
    };

    const selectAll = () => setSelectedCols(ALL_COLUMNS.map(c => c.key));
    const selectNone = () => setSelectedCols([]);

    const handleSave = async () => {
        if (!campaign?._id) return;
        setSaving(true);
        try {
            const res = await fetch(`/api/campaigns/${campaign._id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ displayColumns: selectedCols }),
            });
            if (res.ok) {
                showToast(language === 'th' ? 'บันทึกสำเร็จ' : 'Settings saved', 'success');
            } else {
                showToast(language === 'th' ? 'บันทึกล้มเหลว' : 'Save failed', 'error');
            }
        } catch {
            showToast('Error saving', 'error');
        } finally {
            setSaving(false);
        }
    };

    return (
        <AdminLayout
            breadcrumbItems={[
                { label: 'การแสดงผล', labelEn: 'Display Settings' }
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

            <div className="content-box">
                {loading ? (
                    <div style={{ textAlign: 'center', padding: 30, color: '#999', fontSize: 13 }}>
                        {language === 'th' ? 'กำลังโหลด...' : 'Loading...'}
                    </div>
                ) : !campaign ? (
                    <div style={{ textAlign: 'center', padding: 30, color: '#999', fontSize: 13 }}>
                        {language === 'th' ? 'ไม่พบแคมเปญ' : 'No campaign found'}
                    </div>
                ) : (
                    <>
                        <div style={{ marginBottom: 16 }}>
                            <h3 style={{ fontSize: 15, fontWeight: 700, color: '#333', margin: '0 0 4px 0' }}>
                                {language === 'th' ? 'ตั้งค่าคอลัมน์ที่จะแสดงในหน้า Live' : 'Configure columns shown on the Live page'}
                            </h3>
                            <p style={{ fontSize: 12, color: '#888', margin: 0 }}>
                                {language === 'th'
                                    ? 'เลือกคอลัมน์ที่ต้องการให้ผู้ใช้เห็นในตารางผลการแข่งขัน  (Rank, Runner, Status, Progress จะแสดงเสมอ)'
                                    : 'Select which columns users can see in the results table. Rank, Runner, Status, and Progress are always visible.'}
                            </p>
                        </div>

                        {/* Quick actions */}
                        <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
                            <button
                                className="btn"
                                onClick={selectAll}
                                style={{ background: '#3c8dbc', fontSize: 12, padding: '5px 14px' }}
                            >
                                {language === 'th' ? 'เลือกทั้งหมด' : 'Select All'}
                            </button>
                            <button
                                className="btn"
                                onClick={selectNone}
                                style={{ background: '#6c757d', fontSize: 12, padding: '5px 14px' }}
                            >
                                {language === 'th' ? 'ยกเลิกทั้งหมด' : 'Deselect All'}
                            </button>
                        </div>

                        {/* Always-on columns */}
                        <div style={{ marginBottom: 16 }}>
                            <div style={{ fontSize: 11, fontWeight: 700, color: '#999', textTransform: 'uppercase', marginBottom: 8 }}>
                                {language === 'th' ? 'คอลัมน์หลัก (แสดงเสมอ)' : 'Core Columns (Always Shown)'}
                            </div>
                            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                                {ALWAYS_ON.map(key => (
                                    <div key={key} style={{
                                        padding: '8px 16px', borderRadius: 6,
                                        background: '#e8f5e9', color: '#2e7d32', fontSize: 12,
                                        fontWeight: 700, border: '1px solid #c8e6c9',
                                    }}>
                                        ✓ {key.charAt(0).toUpperCase() + key.slice(1)}
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* Toggleable columns */}
                        <div style={{ marginBottom: 24 }}>
                            <div style={{ fontSize: 11, fontWeight: 700, color: '#999', textTransform: 'uppercase', marginBottom: 8 }}>
                                {language === 'th' ? 'คอลัมน์ที่สามารถเปิด/ปิดได้' : 'Toggleable Columns'}
                            </div>
                            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                                {ALL_COLUMNS.map(col => {
                                    const isSelected = selectedCols.includes(col.key);
                                    return (
                                        <label
                                            key={col.key}
                                            style={{
                                                display: 'inline-flex', alignItems: 'center', gap: 6,
                                                padding: '5px 10px', borderRadius: 4, cursor: 'pointer',
                                                background: isSelected ? '#e3f2fd' : '#f8f9fa',
                                                border: `1px solid ${isSelected ? '#90caf9' : '#e5e7eb'}`,
                                                transition: 'all 0.2s', whiteSpace: 'nowrap',
                                            }}
                                        >
                                            <input
                                                type="checkbox"
                                                checked={isSelected}
                                                onChange={() => toggleColumn(col.key)}
                                                style={{ width: 13, height: 13, cursor: 'pointer' }}
                                            />
                                            <span style={{ fontSize: 11, fontWeight: 600, color: isSelected ? '#1565c0' : '#555' }}>
                                                {language === 'th' ? col.labelTh : col.label}
                                            </span>
                                        </label>
                                    );
                                })}
                            </div>
                        </div>

                        {/* Save */}
                        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                            <button
                                className="btn"
                                onClick={handleSave}
                                disabled={saving}
                                style={{
                                    background: '#00a65a', fontSize: 13, padding: '8px 28px',
                                    fontWeight: 700, opacity: saving ? 0.6 : 1,
                                }}
                            >
                                {saving
                                    ? (language === 'th' ? 'กำลังบันทึก...' : 'Saving...')
                                    : (language === 'th' ? '💾 บันทึกการตั้งค่า' : '💾 Save Settings')}
                            </button>
                        </div>
                    </>
                )}
            </div>
        </AdminLayout>
    );
}
