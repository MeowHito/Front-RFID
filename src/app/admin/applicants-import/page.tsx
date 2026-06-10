'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import * as XLSX from 'xlsx';
import { useLanguage } from '@/lib/language-context';
import AdminLayout from '../AdminLayout';
import '../admin.css';

interface Campaign {
    _id: string;
    name: string;
    nameTh?: string;
    nameEn?: string;
    slug?: string;
}

interface ApplicantRow {
    idCard: string;
    bib: string;
    firstName: string;
    lastName: string;
    fullName: string;
    phone: string;
    age: string;
    gender: string;
    ageGroup: string;
    shirtSize: string;
    category: string;
    team: string;
    extra: Record<string, string>;
}

type FieldKey = keyof Omit<ApplicantRow, 'extra'>;

// Header keyword → field. Checked in order, so more specific entries come first.
// `exclude` lets a field bow out for look-alike headers (e.g. "หมายเลขออเดอร์"
// is an order number, not a BIB; "ชื่อทีม"/"ชื่ออีเว้นท์" are not a person's name).
const HEADER_MAP: { field: FieldKey; keywords: string[]; exclude?: string[] }[] = [
    { field: 'idCard', keywords: ['เลขบัตร', 'บัตรประชาชน', 'ประชาชน', 'เลขประจำตัว', 'idcard', 'id card', 'citizen', 'cid', 'national'] },
    { field: 'fullName', keywords: ['ชื่อ-นามสกุล', 'ชื่อ - นามสกุล', 'ชื่อ นามสกุล', 'ชื่อสกุล', 'ชื่อ-สกุล', 'fullname', 'full name'] },
    { field: 'lastName', keywords: ['นามสกุล', 'สกุล', 'lastname', 'last name', 'surname'] },
    { field: 'firstName', keywords: ['ชื่อจริง', 'ชื่อ', 'firstname', 'first name', 'name'], exclude: ['ทีม', 'team', 'อีเว้นท์', 'อีเวนท์', 'event', 'อีเมล'] },
    { field: 'bib', keywords: ['bib', 'บิบ', 'หมายเลข', 'เลขวิ่ง', 'เบอร์วิ่ง', 'เบอร์เสื้อ', 'number', 'no.'], exclude: ['ออเดอร์', 'order', 'โทร'] },
    { field: 'phone', keywords: ['เบอร์โทร', 'เบอร์', 'โทรศัพท์', 'โทร', 'phone', 'mobile', 'tel'], exclude: ['ฉุกเฉิน', 'ติดต่อฉุกเฉิน'] },
    { field: 'ageGroup', keywords: ['กลุ่มอายุ', 'รุ่นอายุ', 'age group', 'agegroup', 'รุ่น'] },
    { field: 'age', keywords: ['อายุ', 'age'] },
    { field: 'gender', keywords: ['เพศ', 'gender', 'sex'] },
    { field: 'shirtSize', keywords: ['ขนาดเสื้อ', 'ไซส์เสื้อ', 'เสื้อ', 'ขนาด', 'shirt', 'size'] },
    { field: 'category', keywords: ['ประเภท', 'ระยะ', 'category', 'distance'] },
    { field: 'team', keywords: ['ทีม', 'กลุ่ม', 'team', 'club'] },
];

function detectField(header: string): FieldKey | null {
    const h = header.toLowerCase().replace(/\s+/g, ' ').trim();
    for (const { field, keywords, exclude } of HEADER_MAP) {
        if (exclude && exclude.some(k => h.includes(k.toLowerCase()))) continue;
        if (keywords.some(k => h.includes(k.toLowerCase()))) return field;
    }
    return null;
}

/**
 * Find the row most likely to be the header. Exported rosters often put a title
 * row (e.g. "ชื่ออีเว้นท์ | 100K") above the real column headers, so we can't
 * blindly assume row 0 — pick the row whose cells map to the most known fields.
 */
function detectHeaderRow(aoa: unknown[][]): number {
    const scan = Math.min(aoa.length, 8);
    let bestIdx = 0;
    let bestScore = -1;
    for (let i = 0; i < scan; i++) {
        const cells = aoa[i] || [];
        let score = 0;
        for (const c of cells) {
            const s = String(c ?? '').trim();
            if (s && detectField(s)) score++;
        }
        if (score > bestScore) { bestScore = score; bestIdx = i; }
    }
    return bestIdx;
}

function blankRow(): ApplicantRow {
    return { idCard: '', bib: '', firstName: '', lastName: '', fullName: '', phone: '', age: '', gender: '', ageGroup: '', shirtSize: '', category: '', team: '', extra: {} };
}

const PREVIEW_COLS: { field: FieldKey; th: string; en: string }[] = [
    { field: 'bib', th: 'BIB', en: 'BIB' },
    { field: 'idCard', th: 'เลขบัตรประชาชน', en: 'ID Card' },
    { field: 'fullName', th: 'ชื่อ-นามสกุล', en: 'Full Name' },
    { field: 'phone', th: 'เบอร์โทร', en: 'Phone' },
    { field: 'age', th: 'อายุ', en: 'Age' },
    { field: 'gender', th: 'เพศ', en: 'Gender' },
    { field: 'ageGroup', th: 'กลุ่มอายุ', en: 'Age Group' },
    { field: 'shirtSize', th: 'ขนาดเสื้อ', en: 'Shirt' },
];

export default function ApplicantsImportPage() {
    const { language } = useLanguage();
    const [campaign, setCampaign] = useState<Campaign | null>(null);
    const [loading, setLoading] = useState(true);
    const [existingCount, setExistingCount] = useState<number | null>(null);
    const [fileName, setFileName] = useState('');
    const [rows, setRows] = useState<ApplicantRow[]>([]);
    const [detectedHeaders, setDetectedHeaders] = useState<{ raw: string; field: FieldKey | null }[]>([]);
    const [mode, setMode] = useState<'replace' | 'append'>('replace');
    const [saving, setSaving] = useState(false);
    const [dragging, setDragging] = useState(false);
    const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const showToast = (message: string, type: 'success' | 'error') => {
        setToast({ message, type });
        setTimeout(() => setToast(null), type === 'error' ? 6000 : 3000);
    };

    const authHeaders = useCallback((): Record<string, string> => {
        const token = typeof window !== 'undefined' ? localStorage.getItem('auth_token') : null;
        const h: Record<string, string> = { 'Content-Type': 'application/json' };
        if (token) h['Authorization'] = `Bearer ${token}`;
        return h;
    }, []);

    const loadCount = useCallback(async (campaignId: string) => {
        try {
            const res = await fetch(`/api/applicants?campaignId=${campaignId}&limit=1`, { headers: authHeaders(), cache: 'no-store' });
            if (res.ok) {
                const data = await res.json();
                setExistingCount(data.total ?? 0);
            }
        } catch { /* */ }
    }, [authHeaders]);

    useEffect(() => {
        (async () => {
            try {
                const res = await fetch('/api/campaigns/featured', { cache: 'no-store' });
                if (res.ok) {
                    const data = await res.json();
                    if (data?._id) {
                        setCampaign(data);
                        loadCount(data._id);
                    }
                }
            } catch { /* */ }
            finally { setLoading(false); }
        })();
    }, [loadCount]);

    // Parse every sheet in the workbook (rosters often split distances across
    // sheets, e.g. 100K / 50K / 25K / 10K) and merge them into one roster.
    // Returns the number of parsed rows so the caller can flag empty files.
    const parseWorkbook = useCallback((workbook: XLSX.WorkBook): number => {
        const allRows: ApplicantRow[] = [];
        const multiSheet = workbook.SheetNames.length > 1;
        let displayMapping: { raw: string; field: FieldKey | null }[] | null = null;

        for (const sheetName of workbook.SheetNames) {
            const sheet = workbook.Sheets[sheetName];
            if (!sheet) continue;
            const aoa = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: '' });
            if (aoa.length === 0) continue;

            const headerIdx = detectHeaderRow(aoa);
            const headers = (aoa[headerIdx] || []).map(h => String(h ?? '').trim());
            const mapping = headers.map(h => ({ raw: h, field: h ? detectField(h) : null }));
            if (!displayMapping) displayMapping = mapping.filter(m => m.raw);

            for (let r = headerIdx + 1; r < aoa.length; r++) {
                const cells = aoa[r] || [];
                if (cells.every(c => String(c ?? '').trim() === '')) continue;
                const row = blankRow();
                headers.forEach((h, ci) => {
                    const field = mapping[ci].field;
                    const str = String(cells[ci] ?? '').trim();
                    if (!str) return;
                    if (field) {
                        // Don't clobber an already-filled field with a second matching column
                        if (!row[field]) (row[field] as string) = str;
                    } else if (h) {
                        row.extra[h] = str;
                    }
                });
                // In multi-sheet exports the sheet name is the distance/category
                if (!row.category && multiSheet) row.category = sheetName.trim();
                // Compose fullName / split if needed
                if (!row.fullName && (row.firstName || row.lastName)) {
                    row.fullName = `${row.firstName} ${row.lastName}`.trim();
                }
                if (row.fullName && !row.firstName && !row.lastName) {
                    const parts = row.fullName.split(/\s+/);
                    row.firstName = parts.shift() || '';
                    row.lastName = parts.join(' ');
                }
                if (row.fullName || row.idCard || row.bib || row.phone) allRows.push(row);
            }
        }

        setDetectedHeaders(displayMapping || []);
        setRows(allRows);
        return allRows.length;
    }, []);

    const processFile = useCallback((file: File) => {
        const name = file.name;
        setFileName(name);
        const reader = new FileReader();
        reader.onload = (ev) => {
            try {
                const data = new Uint8Array(ev.target?.result as ArrayBuffer);
                const workbook = XLSX.read(data, { type: 'array' });
                const count = parseWorkbook(workbook);
                if (count === 0) {
                    showToast(language === 'th' ? 'ไฟล์ว่างเปล่า' : 'Empty file', 'error');
                }
            } catch {
                showToast(language === 'th' ? 'ไม่สามารถอ่านไฟล์ได้' : 'Cannot read file', 'error');
            }
        };
        reader.readAsArrayBuffer(file);
    }, [language, parseWorkbook]);

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) processFile(file);
        if (fileInputRef.current) fileInputRef.current.value = '';
    };

    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault(); e.stopPropagation();
        setDragging(false);
        const file = e.dataTransfer.files?.[0];
        if (!file) return;
        const ext = file.name.toLowerCase();
        if (!ext.endsWith('.csv') && !ext.endsWith('.xlsx') && !ext.endsWith('.xls')) {
            showToast(language === 'th' ? 'รองรับเฉพาะไฟล์ Excel / CSV' : 'Only Excel / CSV files', 'error');
            return;
        }
        processFile(file);
    };

    const handleUpload = async () => {
        if (!campaign?._id || rows.length === 0) return;
        setSaving(true);
        try {
            const payload = {
                campaignId: campaign._id,
                mode,
                rows: rows.map(r => ({
                    idCard: r.idCard, bib: r.bib, firstName: r.firstName, lastName: r.lastName,
                    fullName: r.fullName, phone: r.phone, age: r.age, gender: r.gender,
                    ageGroup: r.ageGroup, shirtSize: r.shirtSize, category: r.category,
                    team: r.team, extra: r.extra,
                })),
            };
            const res = await fetch('/api/applicants/bulk', {
                method: 'POST', headers: authHeaders(), body: JSON.stringify(payload),
            });
            if (!res.ok) {
                const err = await res.json().catch(() => ({}));
                throw new Error(err?.message || err?.error || `HTTP ${res.status}`);
            }
            const data = await res.json();
            showToast(language === 'th' ? `บันทึกสำเร็จ ${data.inserted} รายการ` : `Imported ${data.inserted} rows`, 'success');
            setRows([]);
            setFileName('');
            setDetectedHeaders([]);
            loadCount(campaign._id);
        } catch (e: unknown) {
            const msg = e instanceof Error ? e.message : 'Unknown error';
            showToast(language === 'th' ? `บันทึกไม่สำเร็จ: ${msg}` : `Failed: ${msg}`, 'error');
        } finally {
            setSaving(false);
        }
    };

    const handleClear = async () => {
        if (!campaign?._id) return;
        if (!confirm(language === 'th' ? 'ลบรายชื่อทั้งหมดของกิจกรรมนี้?' : 'Delete all applicants for this campaign?')) return;
        try {
            const res = await fetch(`/api/applicants?campaignId=${campaign._id}`, { method: 'DELETE', headers: authHeaders() });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const data = await res.json();
            showToast(language === 'th' ? `ลบแล้ว ${data.deleted} รายการ` : `Deleted ${data.deleted} rows`, 'success');
            loadCount(campaign._id);
        } catch {
            showToast(language === 'th' ? 'ลบไม่สำเร็จ' : 'Delete failed', 'error');
        }
    };

    const downloadTemplate = () => {
        const ws = XLSX.utils.aoa_to_sheet([
            ['เลขบัตรประชาชน', 'BIB', 'ชื่อ', 'นามสกุล', 'เบอร์โทร', 'อายุ', 'เพศ', 'กลุ่มอายุ', 'ขนาดเสื้อ', 'ประเภท'],
            ['1234567890123', '001', 'ดีใจ', 'ใจดี', '0812345678', '38', 'ชาย', '35-39 ปี', '2XL', '10K'],
        ]);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Applicants');
        XLSX.writeFile(wb, 'applicants-template.xlsx');
    };

    const publicUrl = campaign
        ? `${typeof window !== 'undefined' ? window.location.origin : ''}/applicant-status/${campaign.slug || campaign._id}`
        : '';

    return (
        <AdminLayout breadcrumbItems={[{ label: 'นำเข้ารายชื่อผู้สมัคร', labelEn: 'Import Applicants' }]}>
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

            {loading ? (
                <div className="content-box" style={{ padding: 30, textAlign: 'center', color: '#999' }}>
                    {language === 'th' ? 'กำลังโหลด...' : 'Loading...'}
                </div>
            ) : !campaign ? (
                <div className="content-box" style={{ padding: 24 }}>
                    <p style={{ color: '#666', marginBottom: 8, fontSize: 14 }}>
                        {language === 'th'
                            ? 'ยังไม่ได้เลือกกิจกรรมหลัก กรุณาไปที่หน้าอีเวนต์แล้วกดดาวที่กิจกรรมที่ต้องการ'
                            : 'No featured event. Please go to Events and star a campaign.'}
                    </p>
                    <a href="/admin/events" style={{ display: 'inline-block', marginTop: 4, padding: '6px 16px', borderRadius: 6, background: '#3b82f6', color: '#fff', fontWeight: 600, textDecoration: 'none', fontSize: 13 }}>
                        {language === 'th' ? 'ไปหน้าจัดการอีเวนต์' : 'Go to Events'}
                    </a>
                </div>
            ) : (
                <>
                    {/* Header */}
                    <div className="content-box" style={{ padding: '16px 20px', marginBottom: 16 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
                            <div>
                                <h2 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: '#1e293b' }}>
                                    📋 {language === 'th' ? 'นำเข้ารายชื่อผู้สมัคร (Excel)' : 'Import Applicants (Excel)'}
                                </h2>
                                <p style={{ margin: '4px 0 0', fontSize: 13, color: '#64748b' }}>
                                    {language === 'th' ? 'กิจกรรม: ' : 'Campaign: '}
                                    <strong>{campaign.nameTh || campaign.nameEn || campaign.name}</strong>
                                    {existingCount !== null && (
                                        <span style={{ marginLeft: 8, color: '#0ea5e9', fontWeight: 600 }}>
                                            ({language === 'th' ? 'มีอยู่แล้ว ' : 'existing '}{existingCount.toLocaleString()})
                                        </span>
                                    )}
                                </p>
                            </div>
                            <div style={{ display: 'flex', gap: 8 }}>
                                <button onClick={downloadTemplate} style={{ padding: '8px 14px', borderRadius: 8, border: '1px solid #d1d5db', background: '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 600, color: '#475569' }}>
                                    ⬇️ {language === 'th' ? 'เทมเพลต' : 'Template'}
                                </button>
                                {existingCount ? (
                                    <button onClick={handleClear} style={{ padding: '8px 14px', borderRadius: 8, border: '1px solid #fecaca', background: '#fef2f2', cursor: 'pointer', fontSize: 13, fontWeight: 600, color: '#dc2626' }}>
                                        🗑️ {language === 'th' ? 'ล้างทั้งหมด' : 'Clear all'}
                                    </button>
                                ) : null}
                            </div>
                        </div>
                    </div>

                    {/* Public link */}
                    <div className="content-box" style={{ padding: '14px 20px', marginBottom: 16, background: '#f0f9ff', border: '1px solid #bae6fd' }}>
                        <div style={{ fontSize: 12, fontWeight: 700, color: '#0369a1', marginBottom: 6 }}>
                            🔗 {language === 'th' ? 'ลิงก์หน้าค้นหาสำหรับผู้สมัคร (สาธารณะ)' : 'Public applicant search link'}
                        </div>
                        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                            <code style={{ flex: 1, minWidth: 240, fontSize: 12, fontFamily: 'monospace', background: '#fff', border: '1px solid #bae6fd', borderRadius: 6, padding: '8px 10px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {publicUrl}
                            </code>
                            <button onClick={() => { navigator.clipboard?.writeText(publicUrl); showToast('Copied!', 'success'); }} style={{ padding: '8px 14px', borderRadius: 6, border: 'none', background: '#0ea5e9', color: '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 700 }}>
                                📋 Copy
                            </button>
                            <a href={publicUrl} target="_blank" rel="noopener noreferrer" style={{ padding: '8px 14px', borderRadius: 6, border: '1px solid #bae6fd', background: '#fff', color: '#0369a1', textDecoration: 'none', fontSize: 13, fontWeight: 600 }}>
                                ↗ {language === 'th' ? 'เปิด' : 'Open'}
                            </a>
                        </div>
                    </div>

                    {/* Drop zone */}
                    <div className="content-box" style={{ padding: 24, marginBottom: 16 }}>
                        <div
                            onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
                            onDragLeave={() => setDragging(false)}
                            onDrop={handleDrop}
                            onClick={() => fileInputRef.current?.click()}
                            style={{
                                border: `2px dashed ${dragging ? '#3b82f6' : '#cbd5e1'}`,
                                borderRadius: 12, padding: '36px 20px', textAlign: 'center',
                                cursor: 'pointer', background: dragging ? '#eff6ff' : '#f8fafc',
                                transition: 'all 0.15s',
                            }}
                        >
                            <div style={{ fontSize: 40, marginBottom: 8 }}>📂</div>
                            <div style={{ fontSize: 15, fontWeight: 700, color: '#334155' }}>
                                {fileName || (language === 'th' ? 'ลากไฟล์ Excel มาวาง หรือคลิกเพื่อเลือกไฟล์' : 'Drag an Excel file here or click to choose')}
                            </div>
                            <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 4 }}>
                                {language === 'th' ? 'รองรับ .xlsx .xls .csv — คอลัมน์: เลขบัตรประชาชน, BIB, ชื่อ, นามสกุล, เบอร์โทร, อายุ, เพศ, กลุ่มอายุ, ขนาดเสื้อ' : 'Supports .xlsx .xls .csv'}
                            </div>
                            <input ref={fileInputRef} type="file" accept=".xlsx,.xls,.csv" onChange={handleFileChange} style={{ display: 'none' }} />
                        </div>

                        {/* Detected header mapping */}
                        {detectedHeaders.length > 0 && (
                            <div style={{ marginTop: 16, fontSize: 12, color: '#475569' }}>
                                <strong>{language === 'th' ? 'จับคู่คอลัมน์:' : 'Detected columns:'}</strong>
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 6 }}>
                                    {detectedHeaders.map((h, i) => (
                                        <span key={i} style={{
                                            padding: '3px 10px', borderRadius: 20, fontSize: 11, fontWeight: 600,
                                            background: h.field ? '#dcfce7' : '#f1f5f9',
                                            color: h.field ? '#166534' : '#94a3b8',
                                            border: `1px solid ${h.field ? '#bbf7d0' : '#e2e8f0'}`,
                                        }}>
                                            {h.raw} {h.field ? `→ ${h.field}` : `→ (${language === 'th' ? 'ข้อมูลเพิ่มเติม' : 'extra'})`}
                                        </span>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Preview + actions */}
                    {rows.length > 0 && (
                        <div className="content-box" style={{ padding: 20 }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12, marginBottom: 12 }}>
                                <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: '#1e293b' }}>
                                    {language === 'th' ? `ตัวอย่างข้อมูล ${rows.length.toLocaleString()} รายการ` : `Preview ${rows.length.toLocaleString()} rows`}
                                </h3>
                                <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                                    <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: '#475569', cursor: 'pointer' }}>
                                        <input type="radio" checked={mode === 'replace'} onChange={() => setMode('replace')} />
                                        {language === 'th' ? 'แทนที่ทั้งหมด' : 'Replace all'}
                                    </label>
                                    <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: '#475569', cursor: 'pointer' }}>
                                        <input type="radio" checked={mode === 'append'} onChange={() => setMode('append')} />
                                        {language === 'th' ? 'เพิ่มต่อ' : 'Append'}
                                    </label>
                                    <button onClick={handleUpload} disabled={saving} style={{
                                        padding: '10px 22px', borderRadius: 8, border: 'none',
                                        background: saving ? '#94a3b8' : 'linear-gradient(135deg, #22c55e, #16a34a)',
                                        color: '#fff', fontWeight: 800, fontSize: 15,
                                        cursor: saving ? 'not-allowed' : 'pointer',
                                    }}>
                                        {saving ? (language === 'th' ? 'กำลังบันทึก...' : 'Saving...') : (language === 'th' ? '💾 บันทึกเข้าระบบ' : '💾 Import')}
                                    </button>
                                </div>
                            </div>
                            <div style={{ overflowX: 'auto' }}>
                                <table className="data-table" style={{ width: '100%', fontSize: 13 }}>
                                    <thead>
                                        <tr>
                                            <th>#</th>
                                            {PREVIEW_COLS.map(c => <th key={c.field}>{language === 'th' ? c.th : c.en}</th>)}
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {rows.slice(0, 50).map((r, idx) => (
                                            <tr key={idx}>
                                                <td>{idx + 1}</td>
                                                {PREVIEW_COLS.map(c => (
                                                    <td key={c.field} style={c.field === 'bib' ? { fontWeight: 700, color: '#2563eb' } : undefined}>
                                                        {r[c.field] || '-'}
                                                    </td>
                                                ))}
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                            {rows.length > 50 && (
                                <p style={{ fontSize: 12, color: '#94a3b8', marginTop: 8 }}>
                                    {language === 'th' ? `แสดง 50 รายการแรกจากทั้งหมด ${rows.length.toLocaleString()} รายการ` : `Showing first 50 of ${rows.length.toLocaleString()} rows`}
                                </p>
                            )}
                        </div>
                    )}
                </>
            )}
        </AdminLayout>
    );
}
