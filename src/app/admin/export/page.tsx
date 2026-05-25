'use client';

import { useEffect, useState, useCallback } from 'react';
import * as XLSX from 'xlsx';
import { useLanguage } from '@/lib/language-context';
import AdminLayout from '../AdminLayout';
import '../admin.css';

interface RaceCategory { name: string; distance?: string; }
interface Campaign {
    _id: string;
    name: string;
    nameTh?: string;
    nameEn?: string;
    categories?: RaceCategory[];
}

interface Runner {
    _id: string;
    bib?: string;
    firstName?: string;
    lastName?: string;
    firstNameTh?: string;
    lastNameTh?: string;
    gender?: string;
    category?: string;
    ageGroup?: string;
    age?: number;
    birthDate?: string;
    nationality?: string;
    status?: string;
    netTime?: number;
    gunTime?: number;
    netPace?: string;
    gunPace?: string;
    overallRank?: number;
    genderRank?: number;
    ageGroupRank?: number;
}

function calculateAgeGroup(birthDate?: string, gender?: string): string {
    if (!birthDate) return '';
    const birth = new Date(birthDate);
    if (isNaN(birth.getTime())) return '';
    const today = new Date();
    let age = today.getFullYear() - birth.getFullYear();
    const m = today.getMonth() - birth.getMonth();
    if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--;
    const prefix = gender === 'F' ? 'F' : 'M';
    if (age < 18) return `${prefix} U18`;
    if (age < 30) return `${prefix} 18-29`;
    if (age < 40) return `${prefix} 30-39`;
    if (age < 50) return `${prefix} 40-49`;
    if (age < 60) return `${prefix} 50-59`;
    if (age < 70) return `${prefix} 60-69`;
    return `${prefix} 70+`;
}

function resolveAgeGroup(r: Runner): string {
    if (r.ageGroup && r.ageGroup.trim()) return r.ageGroup;
    return calculateAgeGroup(r.birthDate, r.gender);
}

function formatBirthDateCE(iso?: string): string {
    if (!iso) return '';
    const d = new Date(iso);
    if (isNaN(d.getTime())) return '';
    const dd = String(d.getDate()).padStart(2, '0');
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const yyyy = d.getFullYear();
    return `${dd}/${mm}/${yyyy}`;
}

function formatTime(ms?: number): string {
    if (!ms || ms <= 0) return '-';
    const totalSec = Math.floor(ms / 1000);
    const h = Math.floor(totalSec / 3600);
    const m = Math.floor((totalSec % 3600) / 60);
    const s = totalSec % 60;
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

const STATUS_ORDER: Record<string, number> = {
    finished: 0,
    in_progress: 1,
    dnf: 2,
    dq: 3,
    dns: 4,
    not_started: 5,
};

function statusLabel(status?: string): string {
    const s = (status || '').toLowerCase();
    if (s === 'finished') return 'Finished';
    if (s === 'in_progress' || s === 'running') return 'In Progress';
    if (s === 'dnf') return 'DNF';
    if (s === 'dns' || s === 'not_started') return 'DNS';
    if (s === 'dq') return 'DQ';
    return status || '-';
}

function sortRunners(a: Runner, b: Runner): number {
    const sa = STATUS_ORDER[(a.status || '').toLowerCase()] ?? 9;
    const sb = STATUS_ORDER[(b.status || '').toLowerCase()] ?? 9;
    if (sa !== sb) return sa - sb;
    const ta = a.netTime || 0;
    const tb = b.netTime || 0;
    if (ta > 0 && tb > 0) return ta - tb;
    if (ta > 0) return -1;
    if (tb > 0) return 1;
    return (a.bib || '').localeCompare(b.bib || '', undefined, { numeric: true });
}

export default function ExportPage() {
    const { language } = useLanguage();
    const [campaign, setCampaign] = useState<Campaign | null>(null);
    const [loading, setLoading] = useState(true);
    const [selectedCategory, setSelectedCategory] = useState('all');
    const [runners, setRunners] = useState<Runner[]>([]);
    const [fetching, setFetching] = useState(false);
    const [exporting, setExporting] = useState(false);
    const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

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

    const fetchAllRunners = useCallback(async (category: string): Promise<Runner[]> => {
        if (!campaign?._id) return [];
        const all: Runner[] = [];
        let page = 1;
        const limit = 200;
        while (true) {
            const params = new URLSearchParams({ campaignId: campaign._id, page: String(page), limit: String(limit) });
            if (category !== 'all') params.append('category', category);
            const res = await fetch(`/api/runners/paged?${params.toString()}`, { cache: 'no-store' });
            if (!res.ok) break;
            const data = await res.json();
            const items = (data.data || []) as Runner[];
            all.push(...items);
            if (items.length < limit || all.length >= (data.total || 0)) break;
            page++;
        }
        return all;
    }, [campaign]);

    useEffect(() => {
        if (!campaign?._id) return;
        let cancelled = false;
        (async () => {
            setFetching(true);
            try {
                const data = await fetchAllRunners(selectedCategory);
                if (cancelled) return;
                data.sort(sortRunners);
                setRunners(data);
            } catch {
                if (!cancelled) showToast(language === 'th' ? 'โหลดข้อมูลไม่สำเร็จ' : 'Failed to load', 'error');
            } finally {
                if (!cancelled) setFetching(false);
            }
        })();
        return () => { cancelled = true; };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [campaign?._id, selectedCategory, fetchAllRunners]);

    const categoryDistance = (catName: string): string => {
        if (catName === 'all') return '';
        const c = (campaign?.categories || []).find(x => x.name === catName);
        return c?.distance || '';
    };

    const selectedCategoryLabel = (): string => {
        if (selectedCategory === 'all') return language === 'th' ? 'ทุกระยะ' : 'All Distances';
        const dist = categoryDistance(selectedCategory);
        return dist ? `${selectedCategory} (${dist})` : selectedCategory;
    };

    const handleExportExcel = useCallback(async () => {
        if (!campaign?._id || runners.length === 0) {
            showToast(language === 'th' ? 'ไม่มีข้อมูล' : 'No data', 'error');
            return;
        }
        setExporting(true);
        try {
            const eventName = campaign.nameTh || campaign.name || '';
            const distanceLabel = selectedCategoryLabel();
            const titleLine = distanceLabel ? `${eventName} — ${distanceLabel}` : eventName;
            const columns = ['BIB', 'FirstName', 'LastName', 'Gender', 'Category', 'AgeGroup', 'BirthDate (C.E.)', 'Nationality', 'GunTime', 'NetTime', 'Status'];
            const aoa: (string | number)[][] = [];
            // Title row — full event + distance merged across all columns so nothing gets cut off
            aoa.push([titleLine]);
            // Blank spacer
            aoa.push([]);
            // Header
            aoa.push(columns);
            // Data rows
            for (const r of runners) {
                aoa.push([
                    r.bib || '',
                    r.firstName || '',
                    r.lastName || '',
                    r.gender || '',
                    r.category || '',
                    resolveAgeGroup(r) || '',
                    formatBirthDateCE(r.birthDate),
                    r.nationality || '',
                    formatTime(r.gunTime),
                    formatTime(r.netTime),
                    statusLabel(r.status),
                ]);
            }
            const ws = XLSX.utils.aoa_to_sheet(aoa);
            // Column widths
            ws['!cols'] = [
                { wch: 10 }, { wch: 16 }, { wch: 18 }, { wch: 8 },
                { wch: 14 }, { wch: 12 }, { wch: 14 }, { wch: 12 },
                { wch: 12 }, { wch: 12 }, { wch: 12 },
            ];
            // Merge title across all data columns so the event name is never truncated
            ws['!merges'] = ws['!merges'] || [];
            ws['!merges'].push({ s: { r: 0, c: 0 }, e: { r: 0, c: columns.length - 1 } });
            // Bold the title and header rows by setting cell styles (basic xlsx supports cellStyles in pro; keep simple by not requiring styles)
            const wb = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(wb, ws, 'Results');
            const catLabel = selectedCategory === 'all' ? 'all' : selectedCategory.replace(/[^\w\-]+/g, '_');
            const filename = `results-${catLabel}-${new Date().toISOString().slice(0, 10)}.xlsx`;
            XLSX.writeFile(wb, filename);
            showToast(language === 'th' ? `ดาวน์โหลด ${runners.length} รายการ` : `Downloaded ${runners.length} records`, 'success');
        } catch (err) {
            console.error(err);
            showToast(language === 'th' ? 'เกิดข้อผิดพลาด' : 'Export failed', 'error');
        } finally {
            setExporting(false);
        }
    }, [campaign, runners, selectedCategory, language]);

    return (
        <AdminLayout breadcrumbItems={[{ label: 'ผลการแข่งขัน', labelEn: 'Race Results' }]}>
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
                    {/* Header */}
                    <div className="content-box" style={{ padding: '16px 20px', marginBottom: 16 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
                            <div>
                                <div style={{ fontWeight: 700, fontSize: 16, color: '#0f172a' }}>
                                    {campaign.nameTh || campaign.name}
                                </div>
                                <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>
                                    {language === 'th' ? 'ผลการแข่งขันตามผลจริง (รวมทุกสถานะ)' : 'Live race results (all statuses)'}
                                </div>
                            </div>
                            <div style={{ fontSize: 13, color: '#475569' }}>
                                {fetching
                                    ? (language === 'th' ? 'กำลังโหลด...' : 'Loading...')
                                    : `${runners.length} ${language === 'th' ? 'รายการ' : 'records'}`}
                            </div>
                        </div>
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
                                    onChange={e => setSelectedCategory(e.target.value)}
                                    style={{ width: 220, fontSize: 13, padding: '6px 10px' }}
                                >
                                    <option value="all">{language === 'th' ? 'ทุกระยะ' : 'All categories'}</option>
                                    {(campaign.categories || []).map((cat, i) => (
                                        <option key={`${cat.name}-${i}`} value={cat.name}>
                                            {cat.name}{cat.distance ? ` (${cat.distance})` : ''}
                                        </option>
                                    ))}
                                </select>
                            </div>

                            <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
                                <button
                                    onClick={handleExportExcel}
                                    disabled={exporting || fetching || runners.length === 0}
                                    style={{
                                        padding: '9px 18px', borderRadius: 6, border: 'none',
                                        background: '#16a34a', color: '#fff', fontWeight: 700, fontSize: 13,
                                        cursor: exporting || fetching || runners.length === 0 ? 'not-allowed' : 'pointer',
                                        opacity: exporting || fetching || runners.length === 0 ? 0.6 : 1,
                                        display: 'inline-flex', alignItems: 'center', gap: 6,
                                    }}
                                >
                                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" /></svg>
                                    {exporting
                                        ? (language === 'th' ? 'กำลังดาวน์โหลด...' : 'Exporting...')
                                        : (language === 'th' ? 'ดาวน์โหลด Excel' : 'Download Excel')}
                                </button>
                            </div>
                        </div>
                    </div>

                    {/* Results Table */}
                    <div className="content-box" style={{ padding: '16px 20px' }}>
                        {fetching ? (
                            <div style={{ padding: 40, textAlign: 'center', color: '#94a3b8' }}>
                                {language === 'th' ? 'กำลังโหลดข้อมูล...' : 'Loading data...'}
                            </div>
                        ) : runners.length === 0 ? (
                            <div style={{ padding: 40, textAlign: 'center', color: '#94a3b8' }}>
                                {language === 'th' ? 'ไม่มีข้อมูล' : 'No data'}
                            </div>
                        ) : (
                            <div style={{ overflowX: 'auto' }}>
                                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                                    <thead>
                                        <tr>
                                            {['#', 'BIB', 'FirstName', 'LastName', 'Gender', 'Category', 'AgeGroup', 'BirthDate (C.E.)', 'Nationality', 'GunTime', 'NetTime', 'Pace', 'Status'].map((h, i) => (
                                                <th key={i} style={{ padding: '8px 10px', borderBottom: '2px solid #e5e7eb', textAlign: 'left', fontWeight: 700, fontSize: 11, color: '#475569', whiteSpace: 'nowrap', background: '#f8fafc' }}>{h}</th>
                                            ))}
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {runners.slice(0, 500).map((r, i) => {
                                            const s = (r.status || '').toLowerCase();
                                            const statusBg = s === 'finished' ? '#dcfce7'
                                                : s === 'dnf' ? '#fee2e2'
                                                : s === 'dns' || s === 'not_started' ? '#f1f5f9'
                                                : s === 'in_progress' || s === 'running' ? '#dbeafe'
                                                : '#f1f5f9';
                                            const statusColor = s === 'finished' ? '#166534'
                                                : s === 'dnf' ? '#991b1b'
                                                : s === 'in_progress' || s === 'running' ? '#1e40af'
                                                : '#64748b';
                                            return (
                                                <tr key={r._id || i} style={{ borderBottom: '1px solid #f3f4f6' }}>
                                                    <td style={{ padding: '6px 10px', fontSize: 12, color: '#94a3b8' }}>{i + 1}</td>
                                                    <td style={{ padding: '6px 10px', fontSize: 12, fontWeight: 700 }}>{r.bib || '-'}</td>
                                                    <td style={{ padding: '6px 10px', fontSize: 12 }}>{r.firstName || '-'}</td>
                                                    <td style={{ padding: '6px 10px', fontSize: 12 }}>{r.lastName || '-'}</td>
                                                    <td style={{ padding: '6px 10px', fontSize: 12 }}>{r.gender || '-'}</td>
                                                    <td style={{ padding: '6px 10px', fontSize: 12 }}>{r.category || '-'}</td>
                                                    <td style={{ padding: '6px 10px', fontSize: 12 }}>{resolveAgeGroup(r) || '-'}</td>
                                                    <td style={{ padding: '6px 10px', fontSize: 12, fontVariantNumeric: 'tabular-nums' }}>{formatBirthDateCE(r.birthDate) || '-'}</td>
                                                    <td style={{ padding: '6px 10px', fontSize: 12 }}>{r.nationality || '-'}</td>
                                                    <td style={{ padding: '6px 10px', fontSize: 12, fontVariantNumeric: 'tabular-nums' }}>{formatTime(r.gunTime)}</td>
                                                    <td style={{ padding: '6px 10px', fontSize: 12, fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>{formatTime(r.netTime)}</td>
                                                    <td style={{ padding: '6px 10px', fontSize: 12, fontVariantNumeric: 'tabular-nums' }}>{r.netPace || r.gunPace || '-'}</td>
                                                    <td style={{ padding: '6px 10px', fontSize: 11 }}>
                                                        <span style={{ display: 'inline-block', padding: '2px 8px', borderRadius: 12, background: statusBg, color: statusColor, fontWeight: 700 }}>
                                                            {statusLabel(r.status)}
                                                        </span>
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                                {runners.length > 500 && (
                                    <div style={{ textAlign: 'center', padding: 10, fontSize: 12, color: '#94a3b8' }}>
                                        {language === 'th'
                                            ? `... แสดง 500 แถวแรกจาก ${runners.length} แถว (ดาวน์โหลดเพื่อดูทั้งหมด)`
                                            : `... showing first 500 of ${runners.length} rows (download for full data)`}
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                </>
            )}
        </AdminLayout>
    );
}
