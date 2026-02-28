'use client';

import { useState, useEffect, useRef } from 'react';
import AdminLayout from '@/app/admin/AdminLayout';
import { useLanguage } from '@/lib/language-context';

// Every column in the event table — same keys, labels, and widths as event/[id]/page.tsx <thead>
// `fixed` = always-on, cannot toggle off or reorder
const TABLE_COLUMNS: { key: string; thLabel: string; thLabelTh: string; width: string; align: 'left' | 'center' | 'right'; fixed?: boolean }[] = [
    { key: 'rank',    thLabel: 'Rank',     thLabelTh: 'อันดับ',      width: '3%',  align: 'center', fixed: true },
    { key: 'genRank', thLabel: 'Gen',      thLabelTh: 'Gen',         width: '3%',  align: 'center' },
    { key: 'catRank', thLabel: 'Cat',      thLabelTh: 'Cat',         width: '3%',  align: 'center' },
    { key: 'runner',  thLabel: 'Runner',   thLabelTh: 'นักวิ่ง',     width: '15%', align: 'left', fixed: true },
    { key: 'sex',     thLabel: 'Sex',      thLabelTh: 'เพศ',         width: '3%',  align: 'center' },
    { key: 'status',  thLabel: 'Status',   thLabelTh: 'สถานะ',       width: '8%',  align: 'left', fixed: true },
    { key: 'gunTime', thLabel: 'Gun Time', thLabelTh: 'Gun Time',    width: '7%',  align: 'center' },
    { key: 'netTime', thLabel: 'Net Time', thLabelTh: 'Net Time',    width: '7%',  align: 'center' },
    { key: 'genNet',  thLabel: 'Gen Net',  thLabelTh: 'Gen Net',     width: '4%',  align: 'center' },
    { key: 'gunPace', thLabel: 'Gun Pace', thLabelTh: 'Gun Pace',    width: '5%',  align: 'center' },
    { key: 'netPace', thLabel: 'Net Pace', thLabelTh: 'Net Pace',    width: '5%',  align: 'center' },
    { key: 'finish',  thLabel: 'Finish',   thLabelTh: 'จบ',          width: '4%',  align: 'center' },
    { key: 'genFin',  thLabel: 'Gen Fin',  thLabelTh: 'Gen Fin',     width: '4%',  align: 'center' },
    { key: 'progress',thLabel: 'Progress', thLabelTh: 'ความคืบหน้า', width: '8%',  align: 'right', fixed: true },
];

const TOGGLEABLE_KEYS = TABLE_COLUMNS.filter(c => !c.fixed).map(c => c.key);

export default function DisplaySettingsPage() {
    const { language } = useLanguage();
    const [campaign, setCampaign] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [selectedCols, setSelectedCols] = useState<string[]>([]);
    const [colOrder, setColOrder] = useState<string[]>(TABLE_COLUMNS.map(c => c.key));
    const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

    const dragKey = useRef<string | null>(null);
    const dragOverKey = useRef<string | null>(null);
    const [draggingKey, setDraggingKey] = useState<string | null>(null);
    const [dropTargetKey, setDropTargetKey] = useState<string | null>(null);

    useEffect(() => { fetchCampaign(); }, []);

    const fetchCampaign = async () => {
        try {
            const res = await fetch('/api/campaigns/featured');
            if (res.ok) {
                const data = await res.json();
                setCampaign(data);
                const saved: string[] = data.displayColumns?.length > 0 ? data.displayColumns : TOGGLEABLE_KEYS;
                setSelectedCols(saved);
                // Reconstruct full column order: fixed columns stay in their natural position,
                // toggleable columns follow the saved order
                rebuildOrder(saved);
            }
        } catch { /* */ } finally { setLoading(false); }
    };

    // Rebuild colOrder from a given selectedCols list
    const rebuildOrder = (selected: string[]) => {
        // The ordered list: fixed columns keep their relative positions,
        // toggleable columns are ordered by `selected` first, then unselected
        const fixedKeys = TABLE_COLUMNS.filter(c => c.fixed).map(c => c.key);
        const toggleOrdered = [
            ...selected.filter(k => TOGGLEABLE_KEYS.includes(k)),
            ...TOGGLEABLE_KEYS.filter(k => !selected.includes(k)),
        ];
        // Merge: walk through TABLE_COLUMNS, but replace toggleable positions with our order
        const result: string[] = [];
        let tIdx = 0;
        for (const col of TABLE_COLUMNS) {
            if (col.fixed) {
                result.push(col.key);
            } else {
                result.push(toggleOrdered[tIdx++]);
            }
        }
        setColOrder(result);
    };

    const showToast = (message: string, type: 'success' | 'error') => {
        setToast({ message, type });
        setTimeout(() => setToast(null), 3000);
    };

    const toggleColumn = (key: string) => {
        setSelectedCols(prev => {
            const next = prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key];
            return next;
        });
    };

    const selectAll = () => setSelectedCols([...TOGGLEABLE_KEYS]);
    const selectNone = () => setSelectedCols([]);

    // Drag handlers — only toggleable columns
    const handleDragStart = (key: string) => {
        dragKey.current = key;
        setDraggingKey(key);
    };
    const handleDragEnter = (key: string) => {
        dragOverKey.current = key;
        setDropTargetKey(key);
    };
    const handleDragEnd = () => {
        const from = dragKey.current;
        const to = dragOverKey.current;
        dragKey.current = null;
        dragOverKey.current = null;
        setDraggingKey(null);
        setDropTargetKey(null);
        if (!from || !to || from === to) return;
        // Only swap if both are toggleable
        if (TABLE_COLUMNS.find(c => c.key === from)?.fixed || TABLE_COLUMNS.find(c => c.key === to)?.fixed) return;
        setColOrder(prev => {
            const arr = [...prev];
            const fi = arr.indexOf(from);
            const ti = arr.indexOf(to);
            if (fi === -1 || ti === -1) return prev;
            // swap
            [arr[fi], arr[ti]] = [arr[ti], arr[fi]];
            return arr;
        });
    };

    const handleSave = async () => {
        if (!campaign?._id) return;
        setSaving(true);
        try {
            // Save only the selected toggleable cols in displayed order
            const orderedSelected = colOrder.filter(k => !TABLE_COLUMNS.find(c => c.key === k)?.fixed && selectedCols.includes(k));
            const res = await fetch(`/api/campaigns/${campaign._id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ displayColumns: orderedSelected }),
            });
            if (res.ok) {
                showToast(language === 'th' ? 'บันทึกสำเร็จ' : 'Settings saved', 'success');
            } else {
                showToast(language === 'th' ? 'บันทึกล้มเหลว' : 'Save failed', 'error');
            }
        } catch {
            showToast('Error saving', 'error');
        } finally { setSaving(false); }
    };

    // Resolve column definition by key
    const colDef = (key: string) => TABLE_COLUMNS.find(c => c.key === key)!;

    // Dummy sample row data for preview
    const sampleData: Record<string, string> = {
        rank: '1', genRank: '1', catRank: '1', runner: 'John Doe', sex: 'M',
        status: 'FINISH', gunTime: '1:23:45', netTime: '1:22:30', genNet: '1',
        gunPace: '5:30', netPace: '5:25', finish: '120', genFin: '55', progress: '100%',
    };

    return (
        <AdminLayout breadcrumbItems={[{ label: 'การแสดงผล', labelEn: 'Display Settings' }]}>
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
                        {language === 'th' ? 'ไม่พบแคมเปญที่กดดาว — กรุณากดดาวเลือกกิจกรรมก่อน' : 'No featured campaign — please star a campaign first'}
                    </div>
                ) : (
                    <>
                        {/* Header info */}
                        <div style={{ marginBottom: 16 }}>
                            <h3 style={{ fontSize: 15, fontWeight: 700, color: '#333', margin: '0 0 4px 0' }}>
                                {language === 'th' ? 'ตั้งค่าคอลัมน์ที่จะแสดงในหน้า Live' : 'Configure columns shown on the Live page'}
                            </h3>
                            <p style={{ fontSize: 12, color: '#888', margin: 0 }}>
                                {language === 'th'
                                    ? 'ติ๊กเปิด/ปิดคอลัมน์ และลากหัวตารางค้างเพื่อย้ายสลับตำแหน่ง (คอลัมน์สีเขียวแสดงเสมอ ย้ายไม่ได้)'
                                    : 'Toggle columns on/off, drag headers to reorder. Green columns are always visible and locked.'}
                            </p>
                            <div style={{ marginTop: 8, padding: '8px 12px', background: '#eff6ff', borderRadius: 6, border: '1px solid #bfdbfe', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                                <i className="fas fa-star" style={{ color: '#f59e0b', fontSize: 12 }} />
                                <span style={{ fontSize: 12, fontWeight: 700, color: '#1e40af' }}>{campaign.name}</span>
                            </div>
                        </div>

                        {/* Quick actions */}
                        <div style={{ display: 'flex', gap: 8, marginBottom: 16, alignItems: 'center' }}>
                            <button className="btn" onClick={selectAll} style={{ background: '#3c8dbc', fontSize: 12, padding: '5px 14px' }}>
                                {language === 'th' ? 'เลือกทั้งหมด' : 'Select All'}
                            </button>
                            <button className="btn" onClick={selectNone} style={{ background: '#6c757d', fontSize: 12, padding: '5px 14px' }}>
                                {language === 'th' ? 'ยกเลิกทั้งหมด' : 'Deselect All'}
                            </button>
                            <span style={{ fontSize: 11, color: '#999', marginLeft: 8 }}>
                                {language === 'th'
                                    ? '* ลากหัวตาราง (สีฟ้า) ค้างเพื่อสลับตำแหน่ง'
                                    : '* Drag blue headers to swap positions'}
                            </span>
                        </div>

                        {/* ===== TABLE PREVIEW ===== */}
                        <div style={{ overflowX: 'auto', border: '1px solid #dee2e6', borderRadius: 8, background: '#fff' }}>
                            <table style={{ width: '100%', minWidth: 900, textAlign: 'left', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
                                {/* Checkbox row */}
                                <thead>
                                    <tr style={{ borderBottom: '1px solid #e5e7eb' }}>
                                        {colOrder.map(key => {
                                            const col = colDef(key);
                                            const isFixed = !!col.fixed;
                                            const isOn = isFixed || selectedCols.includes(key);
                                            return (
                                                <th key={key} style={{ width: col.width, textAlign: col.align, padding: '8px 4px', verticalAlign: 'bottom' }}>
                                                    {isFixed ? (
                                                        <div style={{ display: 'flex', justifyContent: col.align === 'right' ? 'flex-end' : col.align === 'center' ? 'center' : 'flex-start' }}>
                                                            <span style={{ fontSize: 9, fontWeight: 700, color: '#16a34a', background: '#dcfce7', padding: '2px 6px', borderRadius: 4 }}>LOCK</span>
                                                        </div>
                                                    ) : (
                                                        <div style={{ display: 'flex', justifyContent: col.align === 'right' ? 'flex-end' : col.align === 'center' ? 'center' : 'flex-start' }}>
                                                            <input
                                                                type="checkbox"
                                                                checked={isOn}
                                                                onChange={() => toggleColumn(key)}
                                                                style={{ width: 15, height: 15, cursor: 'pointer', accentColor: '#3b82f6' }}
                                                            />
                                                        </div>
                                                    )}
                                                </th>
                                            );
                                        })}
                                    </tr>
                                    {/* Table header row — matching event page style */}
                                    <tr style={{
                                        fontSize: 10, fontWeight: 700, color: '#64748b', textTransform: 'uppercase',
                                        letterSpacing: '-0.02em', background: '#f8fafc', borderBottom: '2px solid #e2e8f0',
                                    }}>
                                        {colOrder.map(key => {
                                            const col = colDef(key);
                                            const isFixed = !!col.fixed;
                                            const isOn = isFixed || selectedCols.includes(key);
                                            const isDraggable = !isFixed;
                                            return (
                                                <th
                                                    key={key}
                                                    draggable={isDraggable}
                                                    onDragStart={() => isDraggable && handleDragStart(key)}
                                                    onDragEnter={() => isDraggable && handleDragEnter(key)}
                                                    onDragEnd={handleDragEnd}
                                                    onDragOver={e => { if (isDraggable) e.preventDefault(); }}
                                                    style={{
                                                        padding: '12px 6px', textAlign: col.align, width: col.width,
                                                        cursor: isDraggable ? 'grab' : 'default',
                                                        opacity: draggingKey === key ? 0.4 : (isOn ? 1 : 0.3),
                                                        background: isFixed ? '#ecfdf5' : (isOn ? '#eff6ff' : '#f8fafc'),
                                                        borderLeft: dropTargetKey === key && draggingKey !== key ? '3px solid #f97316' : (isDraggable ? '1px dashed #cbd5e1' : 'none'),
                                                        borderRight: isDraggable ? '1px dashed #cbd5e1' : 'none',
                                                        transition: 'all 0.2s ease',
                                                        userSelect: 'none',
                                                        position: 'relative',
                                                        transform: draggingKey === key ? 'scale(1.05)' : 'scale(1)',
                                                        boxShadow: draggingKey === key ? '0 8px 25px rgba(0,0,0,0.2)' : 'none',
                                                        zIndex: draggingKey === key ? 100 : 'auto',
                                                    }}
                                                >
                                                    {/* Drag handle icon */}
                                                    {isDraggable && isOn && (
                                                        <div style={{ position: 'absolute', top: 2, right: 2, opacity: 0.4, fontSize: 8 }}>
                                                            ⋮⋮
                                                        </div>
                                                    )}
                                                    <span style={{ color: isFixed ? '#16a34a' : (isOn ? '#1e40af' : '#94a3b8') }}>
                                                        {col.thLabel}
                                                    </span>
                                                </th>
                                            );
                                        })}
                                    </tr>
                                </thead>
                                {/* Sample data rows for visual preview */}
                                <tbody>
                                    {[1, 2, 3].map(rowIdx => (
                                        <tr key={rowIdx} style={{ borderBottom: '1px solid #f1f5f9' }}>
                                            {colOrder.map(key => {
                                                const col = colDef(key);
                                                const isFixed = !!col.fixed;
                                                const isOn = isFixed || selectedCols.includes(key);
                                                let cellContent = sampleData[key] || '-';
                                                if (key === 'rank') cellContent = String(rowIdx);
                                                if (key === 'runner') cellContent = ['John Doe', 'Jane Smith', 'Bob Runner'][rowIdx - 1];
                                                if (key === 'status') {
                                                    const statuses = ['FINISH', 'RACING', 'DNS'];
                                                    const colors = ['#22c55e', '#f97316', '#dc2626'];
                                                    return (
                                                        <td key={key} style={{ padding: '10px 6px', width: col.width, opacity: isOn ? 1 : 0.15 }}>
                                                            <span style={{ display: 'inline-block', padding: '2px 8px', borderRadius: 3, fontWeight: 700, fontSize: 10, color: '#fff', background: colors[rowIdx - 1] }}>
                                                                {statuses[rowIdx - 1]}
                                                            </span>
                                                        </td>
                                                    );
                                                }
                                                if (key === 'progress') {
                                                    const pcts = [100, 60, 0];
                                                    return (
                                                        <td key={key} style={{ padding: '10px 6px', textAlign: 'right', width: col.width, opacity: isOn ? 1 : 0.15 }}>
                                                            <span style={{ fontSize: 11, fontWeight: 700 }}>{pcts[rowIdx - 1]}%</span>
                                                        </td>
                                                    );
                                                }
                                                if (key === 'sex') cellContent = rowIdx === 2 ? 'F' : 'M';
                                                if (key === 'genRank' || key === 'catRank' || key === 'genNet') cellContent = String(rowIdx);
                                                return (
                                                    <td key={key} style={{
                                                        padding: '10px 6px', textAlign: col.align, width: col.width,
                                                        fontSize: 12, fontWeight: key === 'runner' ? 700 : 500,
                                                        color: key === 'runner' ? '#1e293b' : '#64748b',
                                                        fontFamily: ['gunTime', 'netTime', 'gunPace', 'netPace'].includes(key) ? 'monospace' : 'inherit',
                                                        opacity: isOn ? 1 : 0.15,
                                                        whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                                                    }}>
                                                        {cellContent}
                                                    </td>
                                                );
                                            })}
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>

                        <p style={{ fontSize: 11, color: '#aaa', margin: '8px 0 0', fontStyle: 'italic' }}>
                            {language === 'th' ? '* ตัวอย่างข้อมูลจำลอง — คอลัมน์ที่ปิดจะจางลง' : '* Sample preview data — disabled columns are dimmed'}
                        </p>

                        {/* Save */}
                        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 20 }}>
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
                                    : (language === 'th' ? 'บันทึกการตั้งค่า' : 'Save Settings')}
                            </button>
                        </div>
                    </>
                )}
            </div>
        </AdminLayout>
    );
}
