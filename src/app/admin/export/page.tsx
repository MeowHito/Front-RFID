'use client';

import { useEffect, useState, useCallback } from 'react';
import { useLanguage } from '@/lib/language-context';
import AdminLayout from '../AdminLayout';
import '../admin.css';

interface RaceCategory { name: string; distance?: string; }
interface Campaign { _id: string; name: string; nameTh?: string; nameEn?: string; categories?: RaceCategory[]; }

function formatTime(ms?: number): string {
    if (!ms || ms <= 0) return '-';
    const totalSec = Math.floor(ms / 1000);
    const h = Math.floor(totalSec / 3600);
    const m = Math.floor((totalSec % 3600) / 60);
    const s = totalSec % 60;
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

function escapeCsv(val: string): string {
    if (val.includes(',') || val.includes('"') || val.includes('\n')) {
        return `"${val.replace(/"/g, '""')}"`;
    }
    return val;
}

function downloadCSV(filename: string, headers: string[], rows: string[][]) {
    const csv = '\uFEFF' + [headers.join(','), ...rows.map(r => r.map(c => escapeCsv(c)).join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(link.href);
}

type ExportType = 'runners' | 'results' | 'timing';

export default function ExportPage() {
    const { language } = useLanguage();
    const [campaign, setCampaign] = useState<Campaign | null>(null);
    const [loading, setLoading] = useState(true);
    const [selectedCategory, setSelectedCategory] = useState('all');
    const [exportType, setExportType] = useState<ExportType>('runners');
    const [exporting, setExporting] = useState(false);
    const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
    const [preview, setPreview] = useState<{ headers: string[]; rows: string[][] } | null>(null);

    const showToast = (message: string, type: 'success' | 'error') => {
        setToast({ message, type });
        setTimeout(() => setToast(null), 4000);
    };

    useEffect(() => {
        async function loadFeatured() {
            try {
                const res = await fetch('/api/campaigns/featured', { cache: 'no-store' });
                if (!res.ok) throw new Error('No featured');
                const data = await res.json();
                if (data && data._id) setCampaign(data);
            } catch { setCampaign(null); }
            finally { setLoading(false); }
        }
        loadFeatured();
    }, []);

    const fetchAllRunners = useCallback(async (category: string) => {
        if (!campaign?._id) return [];
        const all: any[] = [];
        let page = 1;
        const limit = 200;
        while (true) {
            const params = new URLSearchParams({ campaignId: campaign._id, page: String(page), limit: String(limit) });
            if (category !== 'all') params.append('category', category);
            const res = await fetch(`/api/runners/paged?${params.toString()}`, { cache: 'no-store' });
            if (!res.ok) break;
            const data = await res.json();
            const items = data.data || [];
            all.push(...items);
            if (items.length < limit || all.length >= (data.total || 0)) break;
            page++;
        }
        return all;
    }, [campaign]);

    const handleExport = useCallback(async (doDownload: boolean) => {
        if (!campaign?._id) return;
        setExporting(true);
        setPreview(null);
        try {
            if (exportType === 'runners') {
                const runners = await fetchAllRunners(selectedCategory);
                if (runners.length === 0) { showToast(language === 'th' ? 'ไม่มีข้อมูลนักกีฬา' : 'No runner data', 'error'); return; }
                const headers = ['BIB', 'FirstName', 'LastName', 'Gender', 'Category', 'AgeGroup', 'Nationality', 'ChipCode', 'RFIDTag', 'Status', 'Team', 'Email', 'Phone'];
                const rows = runners.map((r: any) => [
                    r.bib || '', r.firstName || '', r.lastName || '', r.gender || '', r.category || '',
                    r.ageGroup || '', r.nationality || '', r.chipCode || '', r.rfidTag || '',
                    r.status || '', r.team || r.teamName || '', r.email || '', r.phone || '',
                ]);
                if (doDownload) {
                    const catLabel = selectedCategory === 'all' ? 'all' : selectedCategory.replace(/\s+/g, '_');
                    downloadCSV(`runners-${catLabel}-${new Date().toISOString().slice(0, 10)}.csv`, headers, rows);
                    showToast(language === 'th' ? `ดาวน์โหลด ${runners.length} รายการ` : `Downloaded ${runners.length} records`, 'success');
                } else {
                    setPreview({ headers, rows: rows.slice(0, 20) });
                }
            } else if (exportType === 'results') {
                const runners = await fetchAllRunners(selectedCategory);
                const finished = runners.filter((r: any) => r.status === 'finished' && r.netTime > 0);
                finished.sort((a: any, b: any) => (a.netTime || 0) - (b.netTime || 0));
                if (finished.length === 0) { showToast(language === 'th' ? 'ไม่มีผลการแข่งขัน' : 'No results data', 'error'); return; }
                const headers = ['Rank', 'BIB', 'Name', 'Gender', 'Category', 'AgeGroup', 'GunTime', 'OverallRank', 'GenderRank', 'AgeGroupRank'];
                const rows = finished.map((r: any, i: number) => [
                    String(i + 1), r.bib || '', `${r.firstName || ''} ${r.lastName || ''}`.trim(),
                    r.gender || '', r.category || '', r.ageGroup || '', formatTime(r.netTime),
                    String(r.overallRank || ''), String(r.genderRank || ''), String(r.ageGroupRank || ''),
                ]);
                if (doDownload) {
                    const catLabel = selectedCategory === 'all' ? 'all' : selectedCategory.replace(/\s+/g, '_');
                    downloadCSV(`results-${catLabel}-${new Date().toISOString().slice(0, 10)}.csv`, headers, rows);
                    showToast(language === 'th' ? `ดาวน์โหลด ${finished.length} ผลลัพธ์` : `Downloaded ${finished.length} results`, 'success');
                } else {
                    setPreview({ headers, rows: rows.slice(0, 20) });
                }
            } else if (exportType === 'timing') {
                // Fetch all runners then each runner's timing records
                const runners = await fetchAllRunners(selectedCategory);
                if (runners.length === 0) { showToast(language === 'th' ? 'ไม่มีข้อมูล' : 'No data', 'error'); return; }
                const headers = ['BIB', 'Name', 'Category', 'Checkpoint', 'ScanTime', 'SplitTime', 'ElapsedTime'];
                const rows: string[][] = [];
                // Fetch timing records for the campaign events
                for (const r of runners.slice(0, 500)) {
                    try {
                        const res = await fetch(`/api/timing/runner/${campaign._id}/${r._id}`, { cache: 'no-store' });
                        if (res.ok) {
                            const records = await res.json();
                            for (const rec of records) {
                                rows.push([
                                    r.bib || '', `${r.firstName || ''} ${r.lastName || ''}`.trim(), r.category || '',
                                    rec.checkpoint || '', rec.scanTime ? new Date(rec.scanTime).toLocaleString('th-TH') : '',
                                    formatTime(rec.splitTime), formatTime(rec.elapsedTime),
                                ]);
                            }
                        }
                    } catch { /* skip */ }
                }
                if (rows.length === 0) { showToast(language === 'th' ? 'ไม่มี timing records' : 'No timing records', 'error'); return; }
                if (doDownload) {
                    downloadCSV(`timing-${new Date().toISOString().slice(0, 10)}.csv`, headers, rows);
                    showToast(language === 'th' ? `ดาวน์โหลด ${rows.length} บันทึก` : `Downloaded ${rows.length} records`, 'success');
                } else {
                    setPreview({ headers, rows: rows.slice(0, 20) });
                }
            }
        } catch (err) {
            showToast(language === 'th' ? 'เกิดข้อผิดพลาด' : 'Export failed', 'error');
        } finally {
            setExporting(false);
        }
    }, [campaign, selectedCategory, exportType, fetchAllRunners, language]);

    const exportOptions: { value: ExportType; icon: string; labelTh: string; labelEn: string; descTh: string; descEn: string }[] = [
        { value: 'runners', icon: '👥', labelTh: 'ข้อมูลนักกีฬา', labelEn: 'Participants', descTh: 'BIB, ชื่อ, เพศ, ระยะ, สถานะ, ชิป', descEn: 'BIB, name, gender, category, status, chip' },
        { value: 'results', icon: '🏆', labelTh: 'ผลการแข่งขัน', labelEn: 'Race Results', descTh: 'อันดับ, เวลา, ตำแหน่ง', descEn: 'Rank, time, positions' },
        { value: 'timing', icon: '⏱️', labelTh: 'บันทึกเวลา', labelEn: 'Timing Records', descTh: 'เวลาผ่านจุด CP ทั้งหมด', descEn: 'All checkpoint scan times' },
    ];

    return (
        <AdminLayout breadcrumbItems={[{ label: 'ส่งออกข้อมูล', labelEn: 'Export Data' }]}>
            {toast && (
                <div style={{
                    position: 'fixed', top: 20, right: 20, zIndex: 9999,
                    padding: '12px 24px', borderRadius: 8, color: '#fff', fontWeight: 600,
                    background: toast.type === 'success' ? '#22c55e' : '#ef4444',
                    boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
                }}>{toast.message}</div>
            )}

            {loading ? (
                <div className="content-box" style={{ padding: 30, textAlign: 'center', color: '#999' }}>
                    {language === 'th' ? 'กำลังโหลด...' : 'Loading...'}
                </div>
            ) : !campaign ? (
                <div className="content-box" style={{ padding: 24 }}>
                    <p style={{ color: '#666', fontSize: 14 }}>
                        {language === 'th' ? 'ยังไม่ได้เลือกกิจกรรมหลัก' : 'No featured campaign selected.'}
                    </p>
                    <a href="/admin/events" style={{ display: 'inline-block', marginTop: 8, padding: '6px 16px', borderRadius: 6, background: '#3b82f6', color: '#fff', fontWeight: 600, textDecoration: 'none', fontSize: 13 }}>
                        {language === 'th' ? 'ไปหน้าอีเวนต์' : 'Go to Events'}
                    </a>
                </div>
            ) : (
                <>
                    {/* Export Type Cards */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 12, marginBottom: 16 }}>
                        {exportOptions.map(opt => (
                            <div
                                key={opt.value}
                                onClick={() => { setExportType(opt.value); setPreview(null); }}
                                style={{
                                    padding: '16px 18px', borderRadius: 10, cursor: 'pointer', transition: 'all .2s',
                                    border: exportType === opt.value ? '2px solid #3c8dbc' : '2px solid #e5e7eb',
                                    background: exportType === opt.value ? '#eff6ff' : '#fff',
                                    boxShadow: exportType === opt.value ? '0 2px 8px rgba(60,141,188,0.15)' : 'none',
                                }}
                            >
                                <div style={{ fontSize: 28, marginBottom: 6 }}>{opt.icon}</div>
                                <div style={{ fontWeight: 700, fontSize: 14, color: exportType === opt.value ? '#3c8dbc' : '#222', marginBottom: 2 }}>
                                    {language === 'th' ? opt.labelTh : opt.labelEn}
                                </div>
                                <div style={{ fontSize: 12, color: '#888' }}>
                                    {language === 'th' ? opt.descTh : opt.descEn}
                                </div>
                            </div>
                        ))}
                    </div>

                    {/* Filters & Actions */}
                    <div className="content-box" style={{ padding: '16px 20px', marginBottom: 16 }}>
                        <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                <span style={{ fontWeight: 600, fontSize: 13 }}>
                                    {language === 'th' ? 'ระยะ:' : 'Category:'}
                                </span>
                                <select
                                    className="form-input"
                                    value={selectedCategory}
                                    onChange={e => { setSelectedCategory(e.target.value); setPreview(null); }}
                                    style={{ width: 200, fontSize: 13, padding: '6px 10px' }}
                                >
                                    <option value="all">{language === 'th' ? 'ทั้งหมด' : 'All categories'}</option>
                                    {(campaign.categories || []).map((cat, i) => (
                                        <option key={`${cat.name}-${i}`} value={cat.name}>
                                            {cat.name}{cat.distance ? ` (${cat.distance})` : ''}
                                        </option>
                                    ))}
                                </select>
                            </div>

                            <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
                                <button
                                    onClick={() => handleExport(false)}
                                    disabled={exporting}
                                    style={{
                                        padding: '8px 16px', borderRadius: 6, border: '1px solid #3c8dbc',
                                        background: '#fff', color: '#3c8dbc', fontWeight: 600, fontSize: 13,
                                        cursor: exporting ? 'not-allowed' : 'pointer', opacity: exporting ? 0.7 : 1,
                                        display: 'inline-flex', alignItems: 'center', gap: 5,
                                    }}
                                >
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" /></svg>
                                    {language === 'th' ? 'ดูตัวอย่าง' : 'Preview'}
                                </button>
                                <button
                                    onClick={() => handleExport(true)}
                                    disabled={exporting}
                                    style={{
                                        padding: '8px 16px', borderRadius: 6, border: 'none',
                                        background: '#00a65a', color: '#fff', fontWeight: 600, fontSize: 13,
                                        cursor: exporting ? 'not-allowed' : 'pointer', opacity: exporting ? 0.7 : 1,
                                        display: 'inline-flex', alignItems: 'center', gap: 5,
                                    }}
                                >
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" /></svg>
                                    {exporting
                                        ? (language === 'th' ? 'กำลังดาวน์โหลด...' : 'Exporting...')
                                        : (language === 'th' ? 'ดาวน์โหลด CSV' : 'Download CSV')
                                    }
                                </button>
                            </div>
                        </div>
                    </div>

                    {/* Preview Table */}
                    {preview && (
                        <div className="content-box" style={{ padding: '16px 20px' }}>
                            <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 10, display: 'flex', alignItems: 'center', gap: 8 }}>
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#3c8dbc" strokeWidth="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" /></svg>
                                {language === 'th' ? `ตัวอย่าง (${preview.rows.length} แถว)` : `Preview (${preview.rows.length} rows)`}
                            </div>
                            <div style={{ overflowX: 'auto' }}>
                                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                                    <thead>
                                        <tr>
                                            {preview.headers.map((h, i) => (
                                                <th key={i} style={{ padding: '8px 10px', borderBottom: '2px solid #e5e7eb', textAlign: 'left', fontWeight: 700, fontSize: 11, color: '#666', whiteSpace: 'nowrap', background: '#f8fafc' }}>{h}</th>
                                            ))}
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {preview.rows.map((row, ri) => (
                                            <tr key={ri} style={{ borderBottom: '1px solid #f3f4f6' }}>
                                                {row.map((cell, ci) => (
                                                    <td key={ci} style={{ padding: '6px 10px', fontSize: 12, whiteSpace: 'nowrap' }}>{cell || '-'}</td>
                                                ))}
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                            {preview.rows.length >= 20 && (
                                <div style={{ textAlign: 'center', padding: 8, fontSize: 12, color: '#999' }}>
                                    {language === 'th' ? '... แสดง 20 แถวแรก (ดาวน์โหลดเพื่อดูทั้งหมด)' : '... showing first 20 rows (download for full data)'}
                                </div>
                            )}
                        </div>
                    )}

                    {/* Empty state */}
                    {!preview && !exporting && (
                        <div className="content-box" style={{ padding: 40, textAlign: 'center' }}>
                            <div style={{ fontSize: 48, marginBottom: 12 }}>📊</div>
                            <p style={{ color: '#999', fontSize: 14 }}>
                                {language === 'th'
                                    ? 'เลือกประเภทข้อมูลและกดดูตัวอย่าง หรือดาวน์โหลด CSV'
                                    : 'Select data type and preview or download CSV'}
                            </p>
                        </div>
                    )}
                </>
            )}
        </AdminLayout>
    );
}
