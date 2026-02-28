'use client';

import { useState, useEffect, useRef } from 'react';
import AdminLayout from '@/app/admin/AdminLayout';
import { useLanguage } from '@/lib/language-context';

type ColDef = { key: string; thLabel: string; thLabelTh: string; width: string; align: 'left' | 'center' | 'right'; fixed?: boolean };

// Marathon columns — same as event/[id]/page.tsx
const MARATHON_COLUMNS: ColDef[] = [
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

// Lab columns — lap-based display
const LAB_COLUMNS: ColDef[] = [
    { key: 'rank',     thLabel: 'Rank',       thLabelTh: 'อันดับ',       width: '4%',  align: 'center', fixed: true },
    { key: 'runner',   thLabel: 'Runner',     thLabelTh: 'นักวิ่ง',      width: '16%', align: 'left', fixed: true },
    { key: 'sex',      thLabel: 'Sex',        thLabelTh: 'เพศ',          width: '4%',  align: 'center' },
    { key: 'laps',     thLabel: 'Laps',       thLabelTh: 'รอบ',          width: '5%',  align: 'center', fixed: true },
    { key: 'bestLap',  thLabel: 'Best Lap',   thLabelTh: 'รอบเร็วสุด',   width: '8%',  align: 'center' },
    { key: 'avgLap',   thLabel: 'Avg Lap',    thLabelTh: 'รอบเฉลี่ย',    width: '8%',  align: 'center' },
    { key: 'lastLap',  thLabel: 'Last Lap',   thLabelTh: 'รอบล่าสุด',    width: '8%',  align: 'center' },
    { key: 'totalTime',thLabel: 'Total Time', thLabelTh: 'เวลารวม',      width: '8%',  align: 'center' },
    { key: 'lastPass', thLabel: 'Last Pass',  thLabelTh: 'ผ่านล่าสุด',   width: '10%', align: 'center' },
    { key: 'lapPace',  thLabel: 'Lap Pace',   thLabelTh: 'Pace/รอบ',     width: '7%',  align: 'center' },
    { key: 'status',   thLabel: 'Status',     thLabelTh: 'สถานะ',        width: '7%',  align: 'left' },
    { key: 'progress', thLabel: 'Progress',   thLabelTh: 'ความคืบหน้า',  width: '8%',  align: 'right', fixed: true },
];

const MARATHON_TOGGLEABLE = MARATHON_COLUMNS.filter(c => !c.fixed).map(c => c.key);
const LAB_TOGGLEABLE = LAB_COLUMNS.filter(c => !c.fixed).map(c => c.key);

type DisplayMode = 'marathon' | 'lab';

export default function DisplaySettingsPage() {
    const { language } = useLanguage();
    const [campaign, setCampaign] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [displayMode, setDisplayMode] = useState<DisplayMode>('marathon');

    // Marathon state
    const [selectedCols, setSelectedCols] = useState<string[]>([]);
    const [colOrder, setColOrder] = useState<string[]>(MARATHON_COLUMNS.map(c => c.key));

    // Lab state
    const [selectedColsLab, setSelectedColsLab] = useState<string[]>([]);
    const [colOrderLab, setColOrderLab] = useState<string[]>(LAB_COLUMNS.map(c => c.key));

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
                // Marathon
                const saved: string[] = data.displayColumns?.length > 0 ? data.displayColumns : MARATHON_TOGGLEABLE;
                setSelectedCols(saved);
                rebuildOrder(saved, MARATHON_COLUMNS, MARATHON_TOGGLEABLE, setColOrder);
                // Lab
                const savedLab: string[] = data.displayColumnsLab?.length > 0 ? data.displayColumnsLab : LAB_TOGGLEABLE;
                setSelectedColsLab(savedLab);
                rebuildOrder(savedLab, LAB_COLUMNS, LAB_TOGGLEABLE, setColOrderLab);
                // Mode
                setDisplayMode(data.displayMode === 'lab' ? 'lab' : 'marathon');
            }
        } catch { /* */ } finally { setLoading(false); }
    };

    const rebuildOrder = (selected: string[], columns: ColDef[], toggleableKeys: string[], setter: (v: string[]) => void) => {
        const toggleOrdered = [
            ...selected.filter(k => toggleableKeys.includes(k)),
            ...toggleableKeys.filter(k => !selected.includes(k)),
        ];
        const result: string[] = [];
        let tIdx = 0;
        for (const col of columns) {
            if (col.fixed) {
                result.push(col.key);
            } else {
                result.push(toggleOrdered[tIdx++]);
            }
        }
        setter(result);
    };

    const showToast = (message: string, type: 'success' | 'error') => {
        setToast({ message, type });
        setTimeout(() => setToast(null), 3000);
    };

    const toggleColumn = (key: string, mode: DisplayMode) => {
        if (mode === 'marathon') {
            setSelectedCols(prev => prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]);
        } else {
            setSelectedColsLab(prev => prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]);
        }
    };

    const selectAll = (mode: DisplayMode) => mode === 'marathon' ? setSelectedCols([...MARATHON_TOGGLEABLE]) : setSelectedColsLab([...LAB_TOGGLEABLE]);
    const selectNone = (mode: DisplayMode) => mode === 'marathon' ? setSelectedCols([]) : setSelectedColsLab([]);

    // Drag handlers — only toggleable columns
    const handleDragStart = (key: string) => {
        dragKey.current = key;
        setDraggingKey(key);
    };
    const handleDragEnter = (key: string) => {
        dragOverKey.current = key;
        setDropTargetKey(key);
    };
    const handleDragEnd = (mode: DisplayMode) => {
        const from = dragKey.current;
        const to = dragOverKey.current;
        dragKey.current = null;
        dragOverKey.current = null;
        setDraggingKey(null);
        setDropTargetKey(null);
        if (!from || !to || from === to) return;
        const columns = mode === 'marathon' ? MARATHON_COLUMNS : LAB_COLUMNS;
        if (columns.find(c => c.key === from)?.fixed || columns.find(c => c.key === to)?.fixed) return;
        const setter = mode === 'marathon' ? setColOrder : setColOrderLab;
        setter(prev => {
            const arr = [...prev];
            const fi = arr.indexOf(from);
            const ti = arr.indexOf(to);
            if (fi === -1 || ti === -1) return prev;
            [arr[fi], arr[ti]] = [arr[ti], arr[fi]];
            return arr;
        });
    };

    const handleSave = async () => {
        if (!campaign?._id) return;
        setSaving(true);
        try {
            const orderedMarathon = colOrder.filter(k => !MARATHON_COLUMNS.find(c => c.key === k)?.fixed && selectedCols.includes(k));
            const orderedLab = colOrderLab.filter(k => !LAB_COLUMNS.find(c => c.key === k)?.fixed && selectedColsLab.includes(k));
            const res = await fetch(`/api/campaigns/${campaign._id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    displayColumns: orderedMarathon,
                    displayColumnsLab: orderedLab,
                    displayMode,
                }),
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

    // Sample data per mode
    const marathonSample: Record<string, string> = {
        rank: '1', genRank: '1', catRank: '1', runner: 'John Doe', sex: 'M',
        status: 'FINISH', gunTime: '1:23:45', netTime: '1:22:30', genNet: '1',
        gunPace: '5:30', netPace: '5:25', finish: '120', genFin: '55', progress: '100%',
    };
    const labSample: Record<string, string> = {
        rank: '1', runner: 'John Doe', sex: 'M', laps: '12',
        bestLap: '0:01:19', avgLap: '0:01:21', lastLap: '0:01:16',
        totalTime: '0:16:40', lastPass: '17:16:40', lapPace: '3:20',
        status: 'FINISH', progress: '100%',
    };

    const renderBox = (mode: DisplayMode) => {
        const isActive = displayMode === mode;
        const columns = mode === 'marathon' ? MARATHON_COLUMNS : LAB_COLUMNS;
        const toggleableKeys = mode === 'marathon' ? MARATHON_TOGGLEABLE : LAB_TOGGLEABLE;
        const currentOrder = mode === 'marathon' ? colOrder : colOrderLab;
        const currentSelected = mode === 'marathon' ? selectedCols : selectedColsLab;
        const sampleData = mode === 'marathon' ? marathonSample : labSample;
        const colDef = (key: string) => columns.find(c => c.key === key)!;
        const borderColor = isActive ? (mode === 'marathon' ? '#3b82f6' : '#8b5cf6') : '#dee2e6';
        const headerBg = isActive ? (mode === 'marathon' ? '#eff6ff' : '#f5f3ff') : '#f8fafc';

        return (
            <div style={{
                border: `2px solid ${borderColor}`, borderRadius: 10, marginBottom: 20,
                opacity: isActive ? 1 : 0.6, transition: 'all 0.3s',
            }}>
                {/* Box header with radio */}
                <div style={{
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    padding: '10px 16px', background: headerBg, borderBottom: `1px solid ${borderColor}`,
                    borderRadius: '8px 8px 0 0',
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ fontSize: 14, fontWeight: 700, color: isActive ? '#1e293b' : '#94a3b8' }}>
                            {mode === 'marathon'
                                ? (language === 'th' ? 'ตั้งค่าคอลัมน์ที่จะแสดงในหน้า Live (Marathon)' : 'Live Column Settings (Marathon)')
                                : (language === 'th' ? 'ตั้งค่าคอลัมน์ที่จะแสดงในหน้า Live (Lab)' : 'Live Column Settings (Lab)')}
                        </span>
                    </div>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
                        <input
                            type="radio"
                            name="displayMode"
                            checked={isActive}
                            onChange={() => setDisplayMode(mode)}
                            style={{ width: 18, height: 18, accentColor: mode === 'marathon' ? '#3b82f6' : '#8b5cf6' }}
                        />
                        <span style={{ fontSize: 12, fontWeight: 700, color: isActive ? (mode === 'marathon' ? '#3b82f6' : '#8b5cf6') : '#94a3b8' }}>
                            {language === 'th' ? 'ใช้โหมดนี้' : 'Active'}
                        </span>
                    </label>
                </div>

                {/* Quick actions */}
                <div style={{ display: 'flex', gap: 8, padding: '10px 16px', alignItems: 'center' }}>
                    <button className="btn" onClick={() => selectAll(mode)} style={{ background: '#3c8dbc', fontSize: 11, padding: '4px 12px' }}>
                        {language === 'th' ? 'เลือกทั้งหมด' : 'Select All'}
                    </button>
                    <button className="btn" onClick={() => selectNone(mode)} style={{ background: '#6c757d', fontSize: 11, padding: '4px 12px' }}>
                        {language === 'th' ? 'ยกเลิกทั้งหมด' : 'Deselect All'}
                    </button>
                    <span style={{ fontSize: 10, color: '#999', marginLeft: 4 }}>
                        {language === 'th' ? '* ลากหัวสีฟ้าเพื่อสลับ' : '* Drag blue headers to swap'}
                    </span>
                </div>

                {/* Table preview */}
                <div style={{ overflowX: 'auto', padding: '0 16px 16px' }}>
                    <table style={{ width: '100%', minWidth: 800, textAlign: 'left', borderCollapse: 'collapse', tableLayout: 'fixed', border: '1px solid #e5e7eb', borderRadius: 6 }}>
                        <thead>
                            <tr style={{ borderBottom: '1px solid #e5e7eb' }}>
                                {currentOrder.map(key => {
                                    const col = colDef(key);
                                    const isFixed = !!col.fixed;
                                    const isOn = isFixed || currentSelected.includes(key);
                                    return (
                                        <th key={key} style={{ width: col.width, textAlign: col.align, padding: '6px 4px' }}>
                                            {isFixed ? (
                                                <div style={{ display: 'flex', justifyContent: col.align === 'right' ? 'flex-end' : col.align === 'center' ? 'center' : 'flex-start' }}>
                                                    <span style={{ fontSize: 8, fontWeight: 700, color: '#16a34a', background: '#dcfce7', padding: '1px 5px', borderRadius: 3 }}>LOCK</span>
                                                </div>
                                            ) : (
                                                <div style={{ display: 'flex', justifyContent: col.align === 'right' ? 'flex-end' : col.align === 'center' ? 'center' : 'flex-start' }}>
                                                    <input type="checkbox" checked={isOn} onChange={() => toggleColumn(key, mode)}
                                                        style={{ width: 14, height: 14, cursor: 'pointer', accentColor: '#3b82f6' }} />
                                                </div>
                                            )}
                                        </th>
                                    );
                                })}
                            </tr>
                            <tr style={{ fontSize: 10, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', background: '#f8fafc', borderBottom: '2px solid #e2e8f0' }}>
                                {currentOrder.map(key => {
                                    const col = colDef(key);
                                    const isFixed = !!col.fixed;
                                    const isOn = isFixed || currentSelected.includes(key);
                                    const isDraggable = !isFixed;
                                    return (
                                        <th key={key} draggable={isDraggable}
                                            onDragStart={() => isDraggable && handleDragStart(key)}
                                            onDragEnter={() => isDraggable && handleDragEnter(key)}
                                            onDragEnd={() => handleDragEnd(mode)}
                                            onDragOver={e => { if (isDraggable) e.preventDefault(); }}
                                            style={{
                                                padding: '10px 5px', textAlign: col.align, width: col.width,
                                                cursor: isDraggable ? 'grab' : 'default',
                                                opacity: draggingKey === key ? 0.4 : (isOn ? 1 : 0.3),
                                                background: isFixed ? '#ecfdf5' : (isOn ? '#eff6ff' : '#f8fafc'),
                                                borderLeft: dropTargetKey === key && draggingKey !== key ? '3px solid #f97316' : (isDraggable ? '1px dashed #cbd5e1' : 'none'),
                                                transition: 'all 0.2s', userSelect: 'none', position: 'relative',
                                            }}>
                                            {isDraggable && isOn && <div style={{ position: 'absolute', top: 1, right: 1, opacity: 0.4, fontSize: 7 }}>⋮⋮</div>}
                                            <span style={{ color: isFixed ? '#16a34a' : (isOn ? '#1e40af' : '#94a3b8') }}>{col.thLabel}</span>
                                        </th>
                                    );
                                })}
                            </tr>
                        </thead>
                        <tbody>
                            {[1, 2, 3].map(rowIdx => (
                                <tr key={rowIdx} style={{ borderBottom: '1px solid #f1f5f9' }}>
                                    {currentOrder.map(key => {
                                        const col = colDef(key);
                                        const isFixed = !!col.fixed;
                                        const isOn = isFixed || currentSelected.includes(key);
                                        let cellContent = sampleData[key] || '-';
                                        if (key === 'rank') cellContent = String(rowIdx);
                                        if (key === 'runner') cellContent = ['John Doe', 'Jane Smith', 'Bob Runner'][rowIdx - 1];
                                        if (key === 'laps') cellContent = String([12, 8, 3][rowIdx - 1]);
                                        if (key === 'sex') cellContent = rowIdx === 2 ? 'F' : 'M';
                                        if (key === 'status') {
                                            const statuses = mode === 'marathon' ? ['FINISH', 'RACING', 'DNS'] : ['FINISH', 'RACING', 'LAP 3'];
                                            const colors = ['#22c55e', '#f97316', mode === 'marathon' ? '#dc2626' : '#3b82f6'];
                                            return (
                                                <td key={key} style={{ padding: '8px 5px', width: col.width, opacity: isOn ? 1 : 0.15 }}>
                                                    <span style={{ display: 'inline-block', padding: '2px 7px', borderRadius: 3, fontWeight: 700, fontSize: 10, color: '#fff', background: colors[rowIdx - 1] }}>
                                                        {statuses[rowIdx - 1]}
                                                    </span>
                                                </td>
                                            );
                                        }
                                        if (key === 'progress') {
                                            const pcts = [100, 60, 25];
                                            return (
                                                <td key={key} style={{ padding: '8px 5px', textAlign: 'right', width: col.width, opacity: isOn ? 1 : 0.15 }}>
                                                    <span style={{ fontSize: 11, fontWeight: 700 }}>{pcts[rowIdx - 1]}%</span>
                                                </td>
                                            );
                                        }
                                        return (
                                            <td key={key} style={{
                                                padding: '8px 5px', textAlign: col.align, width: col.width,
                                                fontSize: 11, fontWeight: key === 'runner' ? 700 : 500,
                                                color: key === 'runner' ? '#1e293b' : '#64748b',
                                                fontFamily: ['gunTime', 'netTime', 'gunPace', 'netPace', 'bestLap', 'avgLap', 'lastLap', 'totalTime', 'lapPace'].includes(key) ? 'monospace' : 'inherit',
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
            </div>
        );
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
                        {/* Campaign badge */}
                        <div style={{ marginBottom: 16 }}>
                            <p style={{ fontSize: 12, color: '#888', margin: '0 0 8px 0' }}>
                                {language === 'th'
                                    ? 'เลือกโหมดการแสดงผล แล้วตั้งค่าคอลัมน์สำหรับแต่ละโหมด — ใช้ได้ทีละ 1 โหมดเท่านั้น'
                                    : 'Select a display mode and configure columns for each — only one mode is active at a time'}
                            </p>
                            <div style={{ padding: '8px 12px', background: '#eff6ff', borderRadius: 6, border: '1px solid #bfdbfe', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                                <i className="fas fa-star" style={{ color: '#f59e0b', fontSize: 12 }} />
                                <span style={{ fontSize: 12, fontWeight: 700, color: '#1e40af' }}>{campaign.name}</span>
                            </div>
                        </div>

                        {/* Marathon Box */}
                        {renderBox('marathon')}

                        {/* Lab Box */}
                        {renderBox('lab')}

                        <p style={{ fontSize: 11, color: '#aaa', margin: '0 0 8px', fontStyle: 'italic' }}>
                            {language === 'th' ? '* ตัวอย่างข้อมูลจำลอง — คอลัมน์ที่ปิดจะจางลง' : '* Sample preview data — disabled columns are dimmed'}
                        </p>

                        {/* Save */}
                        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 12 }}>
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
