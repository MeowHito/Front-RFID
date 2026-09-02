'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import * as XLSX from 'xlsx';
import { authHeaders } from '@/lib/authHeaders';

export interface CheckedInRunner {
    _id: string;
    bib?: string;
    firstName?: string;
    lastName?: string;
    firstNameTh?: string;
    lastNameTh?: string;
    gender?: string;
    age?: number | null;
    ageGroup?: string;
    category?: string;
    team?: string;
    checkInTime?: string;
    lastCheckInTime?: string;
    checkInCount?: number;
}

type SortKey = 'bib' | 'name' | 'gender' | 'age' | 'ageGroup' | 'category' | 'checkInTime';

const COLUMNS: { key: SortKey; label: string; width?: number; align?: 'left' | 'center' }[] = [
    { key: 'bib', label: 'BIB', width: 90 },
    { key: 'name', label: 'ชื่อ-นามสกุล' },
    { key: 'gender', label: 'เพศ', width: 70, align: 'center' },
    { key: 'age', label: 'อายุ', width: 60, align: 'center' },
    { key: 'ageGroup', label: 'กลุ่มอายุ', width: 110, align: 'center' },
    { key: 'category', label: 'ประเภท', width: 100, align: 'center' },
    { key: 'checkInTime', label: 'เวลาเช็คบิบ', width: 150, align: 'center' },
];

function displayName(r: CheckedInRunner): string {
    const th = `${r.firstNameTh || ''} ${r.lastNameTh || ''}`.trim();
    const en = `${r.firstName || ''} ${r.lastName || ''}`.trim();
    return th || en || '-';
}

function secondaryName(r: CheckedInRunner): string {
    const th = `${r.firstNameTh || ''} ${r.lastNameTh || ''}`.trim();
    const en = `${r.firstName || ''} ${r.lastName || ''}`.trim();
    return th && en ? en : '';
}

function genderLabel(g?: string): string {
    if (g === 'M') return 'ชาย';
    if (g === 'F') return 'หญิง';
    return g || '-';
}

function formatTime(iso?: string): string {
    if (!iso) return '-';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '-';
    return d.toLocaleString('th-TH', {
        day: '2-digit', month: '2-digit', year: '2-digit',
        hour: '2-digit', minute: '2-digit', second: '2-digit',
    });
}

/** Sortable value per column — BIB sorts numerically when it is a number. */
function sortValue(r: CheckedInRunner, key: SortKey): string | number {
    switch (key) {
        case 'bib': {
            const n = Number(r.bib);
            return Number.isFinite(n) && String(r.bib || '').trim() !== '' ? n : Number.MAX_SAFE_INTEGER;
        }
        case 'name': return displayName(r).toLowerCase();
        case 'gender': return genderLabel(r.gender);
        case 'age': return typeof r.age === 'number' ? r.age : -1;
        case 'ageGroup': return r.ageGroup || '';
        case 'category': return r.category || '';
        case 'checkInTime': return r.checkInTime ? new Date(r.checkInTime).getTime() : 0;
    }
}

/**
 * Bib-check counter card + drill-down table. Counts every runner who has been
 * scanned at a scanning screen (those pass checkIn=1 on the lookup call).
 */
export default function CheckedInPanel({ campaignId }: { campaignId: string }) {
    const [runners, setRunners] = useState<CheckedInRunner[]>([]);
    const [loading, setLoading] = useState(true);
    const [open, setOpen] = useState(false);
    const [query, setQuery] = useState('');
    const [sortKey, setSortKey] = useState<SortKey>('checkInTime');
    const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

    const load = useCallback(async () => {
        if (!campaignId) return;
        try {
            const res = await fetch(`/api/runners/checked-in?campaignId=${campaignId}`, {
                headers: authHeaders(), cache: 'no-store',
            });
            if (res.ok) {
                const data = await res.json();
                setRunners(data?.data || []);
            }
        } catch { /* keep whatever we already have */ }
        finally { setLoading(false); }
    }, [campaignId]);

    useEffect(() => { load(); }, [load]);

    // Keep the list fresh while the drill-down is open (stations keep scanning)
    useEffect(() => {
        if (!open) return;
        const id = setInterval(load, 15000);
        return () => clearInterval(id);
    }, [open, load]);

    const toggleSort = (key: SortKey) => {
        if (key === sortKey) {
            setSortDir(d => (d === 'asc' ? 'desc' : 'asc'));
        } else {
            setSortKey(key);
            setSortDir(key === 'checkInTime' ? 'desc' : 'asc');
        }
    };

    const visible = useMemo(() => {
        const q = query.trim().toLowerCase();
        const filtered = q
            ? runners.filter(r =>
                `${r.bib || ''} ${displayName(r)} ${secondaryName(r)} ${r.category || ''} ${r.ageGroup || ''} ${r.team || ''}`
                    .toLowerCase().includes(q))
            : runners;
        const dir = sortDir === 'asc' ? 1 : -1;
        return [...filtered].sort((a, b) => {
            const va = sortValue(a, sortKey);
            const vb = sortValue(b, sortKey);
            if (va < vb) return -1 * dir;
            if (va > vb) return 1 * dir;
            return 0;
        });
    }, [runners, query, sortKey, sortDir]);

    const exportXlsx = () => {
        const header = ['BIB', 'ชื่อ-นามสกุล', 'ชื่อ (อังกฤษ)', 'เพศ', 'อายุ', 'กลุ่มอายุ', 'ประเภท', 'ทีม', 'เวลาเช็คบิบ', 'สแกนล่าสุด', 'จำนวนครั้ง'];
        const body = visible.map(r => [
            r.bib || '', displayName(r), secondaryName(r), genderLabel(r.gender),
            r.age ?? '', r.ageGroup || '', r.category || '', r.team || '',
            formatTime(r.checkInTime), formatTime(r.lastCheckInTime || r.checkInTime), r.checkInCount ?? 1,
        ]);
        const ws = XLSX.utils.aoa_to_sheet([header, ...body]);
        ws['!cols'] = [{ wch: 10 }, { wch: 24 }, { wch: 24 }, { wch: 8 }, { wch: 6 }, { wch: 14 }, { wch: 12 }, { wch: 16 }, { wch: 20 }, { wch: 20 }, { wch: 10 }];
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'CheckedIn');
        XLSX.writeFile(wb, `bib-check-${visible.length}.xlsx`);
    };

    const todayCount = useMemo(() => {
        const today = new Date().toDateString();
        return runners.filter(r => r.checkInTime && new Date(r.checkInTime).toDateString() === today).length;
    }, [runners]);

    return (
        <>
            {/* Counter card */}
            <button
                onClick={() => setOpen(true)}
                style={{
                    display: 'flex', alignItems: 'center', gap: 18, width: '100%', maxWidth: 720,
                    padding: '18px 22px', marginBottom: 24, textAlign: 'left', cursor: 'pointer',
                    borderRadius: 16, border: '1px solid #bfdbfe',
                    background: 'linear-gradient(135deg, #eff6ff 0%, #f0fdf4 100%)',
                    boxShadow: '0 2px 10px rgba(15,23,42,0.05)',
                }}
            >
                <div style={{
                    width: 56, height: 56, borderRadius: 14, flexShrink: 0,
                    background: 'linear-gradient(135deg, #3b82f6, #22c55e)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 26,
                }}>✅</div>
                <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: '#475569', letterSpacing: 0.3 }}>
                        นักกีฬาที่เช็คบิบแล้ว
                        <span style={{ marginLeft: 8, fontSize: 11, fontWeight: 600, color: '#94a3b8' }}>
                            นับรวมทุกหน้าสแกน (Check BIB 1 + 2 + สลิป)
                        </span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginTop: 2 }}>
                        <span style={{ fontSize: 34, fontWeight: 900, color: '#0f172a', lineHeight: 1 }}>
                            {loading ? '—' : runners.length.toLocaleString()}
                        </span>
                        <span style={{ fontSize: 13, color: '#64748b', fontWeight: 600 }}>คน</span>
                        {!loading && todayCount > 0 && (
                            <span style={{ fontSize: 12, fontWeight: 700, color: '#15803d', background: '#dcfce7', padding: '2px 10px', borderRadius: 999 }}>
                                วันนี้ {todayCount.toLocaleString()}
                            </span>
                        )}
                    </div>
                </div>
                <span style={{ fontSize: 13, fontWeight: 700, color: '#1d4ed8', whiteSpace: 'nowrap' }}>
                    ดูรายชื่อ →
                </span>
            </button>

            {/* Drill-down */}
            {open && (
                <div
                    onClick={() => setOpen(false)}
                    style={{
                        position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(15,23,42,0.55)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
                    }}
                >
                    <div
                        onClick={e => e.stopPropagation()}
                        style={{
                            background: '#fff', borderRadius: 18, width: '100%', maxWidth: 1080,
                            maxHeight: '88vh', display: 'flex', flexDirection: 'column', overflow: 'hidden',
                            boxShadow: '0 24px 60px rgba(0,0,0,0.3)', fontFamily: "'Prompt', sans-serif",
                        }}
                    >
                        {/* Modal header */}
                        <div style={{ padding: '18px 22px', borderBottom: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                            <div style={{ flex: 1, minWidth: 200 }}>
                                <h3 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: '#0f172a' }}>
                                    ✅ รายชื่อผู้เช็คบิบแล้ว
                                </h3>
                                <p style={{ margin: '2px 0 0', fontSize: 12, color: '#64748b' }}>
                                    ทั้งหมด {runners.length.toLocaleString()} คน
                                    {query.trim() && ` — แสดง ${visible.length.toLocaleString()} คน`}
                                </p>
                            </div>
                            <input
                                value={query}
                                onChange={e => setQuery(e.target.value)}
                                placeholder="ค้นหา BIB / ชื่อ / ประเภท"
                                style={{
                                    padding: '9px 14px', borderRadius: 10, border: '1px solid #cbd5e1',
                                    fontSize: 13, width: 240, fontFamily: "'Prompt', sans-serif",
                                }}
                            />
                            <button onClick={load} style={{ padding: '9px 14px', borderRadius: 10, border: '1px solid #cbd5e1', background: '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 700, color: '#475569' }}>
                                ↻ รีเฟรช
                            </button>
                            <button onClick={exportXlsx} disabled={visible.length === 0} style={{ padding: '9px 14px', borderRadius: 10, border: 'none', background: visible.length ? '#16a34a' : '#cbd5e1', color: '#fff', cursor: visible.length ? 'pointer' : 'not-allowed', fontSize: 13, fontWeight: 700 }}>
                                📥 Excel
                            </button>
                            <button onClick={() => setOpen(false)} style={{ width: 34, height: 34, borderRadius: '50%', border: 'none', background: '#f1f5f9', color: '#475569', fontSize: 16, fontWeight: 800, cursor: 'pointer' }}>
                                ✕
                            </button>
                        </div>

                        {/* Table */}
                        <div style={{ overflow: 'auto', flex: 1 }}>
                            {visible.length === 0 ? (
                                <div style={{ padding: 60, textAlign: 'center', color: '#94a3b8', fontSize: 14 }}>
                                    {loading ? 'กำลังโหลด...' : 'ยังไม่มีใครเช็คบิบ'}
                                </div>
                            ) : (
                                <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: 0, fontSize: 14 }}>
                                    <thead>
                                        <tr>
                                            <th style={{ position: 'sticky', top: 0, zIndex: 1, background: '#f8fafc', borderBottom: '2px solid #e2e8f0', padding: '12px 10px', width: 56, fontSize: 12, color: '#64748b', textAlign: 'center' }}>#</th>
                                            {COLUMNS.map(col => {
                                                const active = sortKey === col.key;
                                                return (
                                                    <th
                                                        key={col.key}
                                                        onClick={() => toggleSort(col.key)}
                                                        style={{
                                                            position: 'sticky', top: 0, zIndex: 1, background: '#f8fafc',
                                                            borderBottom: '2px solid #e2e8f0', padding: '12px 10px',
                                                            cursor: 'pointer', userSelect: 'none', whiteSpace: 'nowrap',
                                                            width: col.width, textAlign: col.align || 'left',
                                                            fontSize: 13, fontWeight: 800,
                                                            color: active ? '#1d4ed8' : '#334155',
                                                        }}
                                                    >
                                                        {col.label}
                                                        <span style={{ marginLeft: 6, fontSize: 11, color: active ? '#1d4ed8' : '#cbd5e1' }}>
                                                            {active ? (sortDir === 'asc' ? '▲' : '▼') : '⇅'}
                                                        </span>
                                                    </th>
                                                );
                                            })}
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {visible.map((r, i) => (
                                            <tr key={r._id} style={{ background: i % 2 ? '#fbfdff' : '#fff' }}>
                                                <td style={{ padding: '11px 10px', borderBottom: '1px solid #f1f5f9', textAlign: 'center', color: '#94a3b8', fontSize: 12 }}>{i + 1}</td>
                                                <td style={{ padding: '11px 10px', borderBottom: '1px solid #f1f5f9', fontWeight: 800, color: '#1d4ed8', fontSize: 15 }}>{r.bib || '-'}</td>
                                                <td style={{ padding: '11px 10px', borderBottom: '1px solid #f1f5f9' }}>
                                                    <div style={{ fontWeight: 700, color: '#0f172a' }}>{displayName(r)}</div>
                                                    {secondaryName(r) && (
                                                        <div style={{ fontSize: 12, color: '#94a3b8' }}>{secondaryName(r)}</div>
                                                    )}
                                                </td>
                                                <td style={{ padding: '11px 10px', borderBottom: '1px solid #f1f5f9', textAlign: 'center', color: '#475569' }}>{genderLabel(r.gender)}</td>
                                                <td style={{ padding: '11px 10px', borderBottom: '1px solid #f1f5f9', textAlign: 'center', color: '#475569' }}>{r.age ?? '-'}</td>
                                                <td style={{ padding: '11px 10px', borderBottom: '1px solid #f1f5f9', textAlign: 'center', color: '#475569' }}>{r.ageGroup || '-'}</td>
                                                <td style={{ padding: '11px 10px', borderBottom: '1px solid #f1f5f9', textAlign: 'center', fontWeight: 700, color: '#9d4300' }}>{r.category || '-'}</td>
                                                <td style={{ padding: '11px 10px', borderBottom: '1px solid #f1f5f9', textAlign: 'center', color: '#475569', whiteSpace: 'nowrap' }}>
                                                    {formatTime(r.checkInTime)}
                                                    {(r.checkInCount || 0) > 1 && (
                                                        <span title="จำนวนครั้งที่สแกน" style={{ marginLeft: 6, fontSize: 11, fontWeight: 700, color: '#b45309', background: '#fef3c7', padding: '1px 7px', borderRadius: 999 }}>
                                                            ×{r.checkInCount}
                                                        </span>
                                                    )}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}
