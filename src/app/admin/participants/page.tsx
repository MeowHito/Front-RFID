'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import { useLanguage } from '@/lib/language-context';
import * as XLSX from 'xlsx';
import AdminLayout from '../AdminLayout';
import '../admin.css';

interface RaceCategory {
    name: string;
    distance?: string;
}

interface Campaign {
    _id: string;
    name: string;
    nameTh?: string;
    nameEn?: string;
    categories?: RaceCategory[];
}

interface ParsedRow {
    rowNum: number;
    bib: string;
    firstName: string;
    lastName: string;
    gender: string;
    birthDate: string;
    nationality: string;
    ageGroup: string;
    chipCode: string;
    status: 'ready' | 'warning' | 'error';
    errorMsg: string;
}

interface Runner {
    _id: string;
    bib: string;
    firstName: string;
    lastName: string;
    firstNameTh?: string;
    lastNameTh?: string;
    gender: string;
    category: string;
    ageGroup?: string;
    nationality?: string;
    chipCode?: string;
    rfidTag?: string;
    status: string;
    team?: string;
    box?: string;
}

function calculateAgeGroup(birthDate: string, gender: string): string {
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

function parseCSV(text: string): string[][] {
    const rows: string[][] = [];
    let current = '';
    let inQuotes = false;
    let row: string[] = [];
    for (let i = 0; i < text.length; i++) {
        const ch = text[i];
        if (inQuotes) {
            if (ch === '"' && text[i + 1] === '"') {
                current += '"';
                i++;
            } else if (ch === '"') {
                inQuotes = false;
            } else {
                current += ch;
            }
        } else {
            if (ch === '"') {
                inQuotes = true;
            } else if (ch === ',') {
                row.push(current.trim());
                current = '';
            } else if (ch === '\n' || ch === '\r') {
                if (ch === '\r' && text[i + 1] === '\n') i++;
                row.push(current.trim());
                if (row.some(c => c)) rows.push(row);
                row = [];
                current = '';
            } else {
                current += ch;
            }
        }
    }
    row.push(current.trim());
    if (row.some(c => c)) rows.push(row);
    return rows;
}

export default function ParticipantsPage() {
    const { language } = useLanguage();
    const [campaign, setCampaign] = useState<Campaign | null>(null);
    const [loading, setLoading] = useState(true);
    const [selectedCategory, setSelectedCategory] = useState<string>('');
    const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

    // Tab state: 'import' or a category name
    const [activeTab, setActiveTab] = useState<string>('import');

    // Participants list state
    const [runners, setRunners] = useState<Runner[]>([]);
    const [runnersTotal, setRunnersTotal] = useState(0);
    const [runnersLoading, setRunnersLoading] = useState(false);
    const [listSearch, setListSearch] = useState('');
    const [listPage, setListPage] = useState(1);
    const [chipStatusFilter, setChipStatusFilter] = useState<string>('');
    const listLimit = 50;

    // Inline chip code editing
    const [editingChipId, setEditingChipId] = useState<string | null>(null);
    const [editingChipValue, setEditingChipValue] = useState<string>('');
    const [savingChip, setSavingChip] = useState(false);

    // CSV state
    const [fileName, setFileName] = useState<string>('');
    const [parsedRows, setParsedRows] = useState<ParsedRow[]>([]);
    const [importing, setImporting] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [isDragging, setIsDragging] = useState(false);

    // Options
    const [checkDupBib, setCheckDupBib] = useState(true);
    const [updateExisting, setUpdateExisting] = useState(false);
    const [autoAgeGroup, setAutoAgeGroup] = useState(true);

    // Search / filter
    const [search, setSearch] = useState('');
    const [statusFilter, setStatusFilter] = useState<string>('');

    const showToast = (message: string, type: 'success' | 'error') => {
        setToast({ message, type });
        setTimeout(() => setToast(null), type === 'error' ? 6000 : 3000);
    };

    // Load featured campaign
    useEffect(() => {
        async function loadFeatured() {
            try {
                const res = await fetch('/api/campaigns/featured', { cache: 'no-store' });
                if (!res.ok) throw new Error('No featured');
                const data = await res.json();
                if (data && data._id) {
                    setCampaign(data);
                    const cats = data.categories || [];
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

    // Fetch runners for participants list tab (activeTab is the category name)
    const fetchRunners = useCallback(async () => {
        if (!campaign?._id || activeTab === 'import') return;
        setRunnersLoading(true);
        try {
            const params = new URLSearchParams({
                eventId: campaign._id,
                category: activeTab,
                page: String(listPage),
                limit: String(listLimit),
            });
            if (listSearch) params.append('search', listSearch);
            if (chipStatusFilter) params.append('chipStatus', chipStatusFilter);
            const res = await fetch(`/api/runners/paged?${params.toString()}`, { cache: 'no-store' });
            if (!res.ok) throw new Error('Failed');
            const data = await res.json();
            setRunners(data.data || []);
            setRunnersTotal(data.total || 0);
        } catch {
            setRunners([]);
            setRunnersTotal(0);
        } finally {
            setRunnersLoading(false);
        }
    }, [campaign, activeTab, listSearch, listPage, chipStatusFilter]);

    useEffect(() => {
        if (activeTab !== 'import') fetchRunners();
    }, [activeTab, fetchRunners]);

    // Save chip code for a runner
    const handleSaveChip = useCallback(async (runnerId: string, chipCode: string) => {
        setSavingChip(true);
        try {
            const res = await fetch(`/api/runners/${runnerId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ chipCode }),
            });
            if (!res.ok) throw new Error('Failed');
            setRunners(prev => prev.map(r => r._id === runnerId ? { ...r, chipCode } : r));
            setEditingChipId(null);
            showToast(language === 'th' ? 'บันทึก ChipCode สำเร็จ' : 'ChipCode saved', 'success');
        } catch {
            showToast(language === 'th' ? 'บันทึกไม่สำเร็จ' : 'Save failed', 'error');
        } finally {
            setSavingChip(false);
        }
    }, [language]);

    const processCSV = useCallback((text: string) => {
        const rows = parseCSV(text);
        if (rows.length < 2) {
            showToast(language === 'th' ? 'ไฟล์ CSV ไม่มีข้อมูล' : 'CSV file is empty', 'error');
            return;
        }

        const header = rows[0].map(h => h.toLowerCase().replace(/\s+/g, ''));
        const bibIdx = header.findIndex(h => h === 'bib' || h === 'bibno' || h === 'bibnumber');
        const fnIdx = header.findIndex(h => h === 'firstname' || h === 'first_name' || h === 'fname' || h === 'name');
        const lnIdx = header.findIndex(h => h === 'lastname' || h === 'last_name' || h === 'lname' || h === 'surname');
        const genderIdx = header.findIndex(h => h === 'gender' || h === 'sex');
        const dobIdx = header.findIndex(h => h === 'birthdate' || h === 'dob' || h === 'birth_date' || h === 'dateofbirth');
        const natIdx = header.findIndex(h => h === 'nationality' || h === 'nat' || h === 'country');
        const chipIdx = header.findIndex(h => h === 'chipcode' || h === 'chip' || h === 'rfid' || h === 'rfidtag' || h === 'chip_code');
        const ageGrpIdx = header.findIndex(h => h === 'agegroup' || h === 'age_group');

        if (bibIdx === -1 || fnIdx === -1) {
            showToast(
                language === 'th'
                    ? 'ไฟล์ CSV ต้องมีคอลัมน์ BIB และ FirstName อย่างน้อย'
                    : 'CSV must have at least BIB and FirstName columns',
                'error'
            );
            return;
        }

        const bibSet = new Map<string, number>();
        const parsed: ParsedRow[] = [];

        for (let i = 1; i < rows.length; i++) {
            const r = rows[i];
            const bib = (r[bibIdx] || '').trim();
            const firstName = (r[fnIdx] || '').trim();
            const lastName = lnIdx >= 0 ? (r[lnIdx] || '').trim() : '';
            const genderRaw = genderIdx >= 0 ? (r[genderIdx] || '').trim().toUpperCase() : '';
            const gender = genderRaw.startsWith('F') ? 'F' : genderRaw.startsWith('M') ? 'M' : '?';
            const birthDate = dobIdx >= 0 ? (r[dobIdx] || '').trim() : '';
            const nationality = natIdx >= 0 ? (r[natIdx] || '').trim() : 'THA';
            const chip = chipIdx >= 0 ? (r[chipIdx] || '').trim() : '';
            let ageGroup = ageGrpIdx >= 0 ? (r[ageGrpIdx] || '').trim() : '';

            if (autoAgeGroup && birthDate && gender !== '?') {
                ageGroup = calculateAgeGroup(birthDate, gender);
            }

            let status: ParsedRow['status'] = 'ready';
            let errorMsg = '';

            if (!bib || !firstName) {
                status = 'error';
                errorMsg = language === 'th' ? 'ข้อมูลไม่ครบ' : 'Missing data';
            } else if (gender === '?') {
                status = 'error';
                errorMsg = language === 'th' ? 'เพศไม่ถูกต้อง' : 'Invalid gender';
            } else if (checkDupBib && bibSet.has(bib)) {
                status = 'error';
                errorMsg = language === 'th' ? `BIB ซ้ำ (แถว ${bibSet.get(bib)})` : `Duplicate BIB (row ${bibSet.get(bib)})`;
            } else if (!chip) {
                status = 'warning';
                errorMsg = language === 'th' ? 'ขาด Chip Code' : 'Missing Chip Code';
            }

            if (status !== 'error') bibSet.set(bib, i);

            parsed.push({
                rowNum: i,
                bib, firstName, lastName, gender, birthDate, nationality, ageGroup, chipCode: chip,
                status, errorMsg,
            });
        }

        setParsedRows(parsed);
    }, [language, checkDupBib, autoAgeGroup]);

    const processFile = useCallback((file: File) => {
        setFileName(file.name);
        const isXlsx = file.name.toLowerCase().endsWith('.xlsx') || file.name.toLowerCase().endsWith('.xls');
        if (isXlsx) {
            const reader = new FileReader();
            reader.onload = (ev) => {
                try {
                    const data = new Uint8Array(ev.target?.result as ArrayBuffer);
                    const workbook = XLSX.read(data, { type: 'array' });
                    const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
                    const csvText = XLSX.utils.sheet_to_csv(firstSheet);
                    processCSV(csvText);
                } catch {
                    showToast(language === 'th' ? 'ไม่สามารถอ่านไฟล์ Excel ได้' : 'Cannot read Excel file', 'error');
                }
            };
            reader.readAsArrayBuffer(file);
        } else {
            const reader = new FileReader();
            reader.onload = (ev) => {
                const text = ev.target?.result as string;
                processCSV(text);
            };
            reader.readAsText(file, 'UTF-8');
        }
    }, [processCSV, language]);

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        processFile(file);
    };

    const handleDrop = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragging(false);
        const file = e.dataTransfer.files?.[0];
        if (!file) return;
        const ext = file.name.toLowerCase();
        if (!ext.endsWith('.csv') && !ext.endsWith('.xlsx') && !ext.endsWith('.xls')) {
            showToast(language === 'th' ? 'รองรับเฉพาะไฟล์ CSV และ XLSX' : 'Only CSV and XLSX files are supported', 'error');
            return;
        }
        processFile(file);
    }, [processFile, language]);

    const handleDragOver = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragging(true);
    }, []);

    const handleDragLeave = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragging(false);
    }, []);

    const handleUpdateChip = (rowNum: number, value: string) => {
        setParsedRows(prev => prev.map(r => {
            if (r.rowNum !== rowNum) return r;
            const updated = { ...r, chipCode: value };
            if (r.status === 'warning' && value.trim()) {
                updated.status = 'ready';
                updated.errorMsg = '';
            } else if (r.status === 'ready' && !value.trim() && !r.errorMsg) {
                updated.status = 'warning';
                updated.errorMsg = language === 'th' ? 'ขาด Chip Code' : 'Missing Chip Code';
            }
            return updated;
        }));
    };

    const handleImport = async () => {
        if (!campaign?._id || !selectedCategory) {
            showToast(language === 'th' ? 'กรุณาเลือกระยะทาง' : 'Please select a distance', 'error');
            return;
        }
        const readyRows = parsedRows.filter(r => r.status === 'ready' || r.status === 'warning');
        if (readyRows.length === 0) {
            showToast(language === 'th' ? 'ไม่มีข้อมูลที่พร้อมนำเข้า' : 'No data ready to import', 'error');
            return;
        }

        setImporting(true);
        try {
            const payload = readyRows.map(r => ({
                eventId: campaign._id,
                bib: r.bib,
                firstName: r.firstName,
                lastName: r.lastName || '-',
                gender: r.gender === 'F' ? 'F' : 'M',
                category: selectedCategory,
                nationality: r.nationality || 'THA',
                birthDate: r.birthDate || undefined,
                ageGroup: r.ageGroup || undefined,
                chipCode: r.chipCode || undefined,
                status: 'not_started',
            }));

            const authToken = typeof window !== 'undefined' ? localStorage.getItem('auth_token') : null;
            const headers: Record<string, string> = { 'Content-Type': 'application/json' };
            if (authToken) headers['Authorization'] = `Bearer ${authToken}`;

            const apiUrl = updateExisting
                ? '/api/runners/bulk?updateExisting=true'
                : '/api/runners/bulk';
            const res = await fetch(apiUrl, {
                method: 'POST',
                headers,
                body: JSON.stringify(payload),
            });

            if (!res.ok) {
                let errMsg = `HTTP ${res.status}`;
                try {
                    const errBody = await res.json();
                    if (errBody?.error) {
                        errMsg = typeof errBody.error === 'string' ? errBody.error : JSON.stringify(errBody.error);
                    } else if (errBody?.message) {
                        errMsg = Array.isArray(errBody.message) ? errBody.message.join(', ') : errBody.message;
                    }
                } catch { /* ignore parse error */ }
                console.error('Import failed:', res.status, errMsg);
                showToast(
                    language === 'th'
                        ? `นำเข้าไม่สำเร็จ: ${errMsg}`
                        : `Import failed: ${errMsg}`,
                    'error'
                );
                return;
            }
            const data = await res.json();

            // Handle new response format { inserted, updated, errors }
            if (data.inserted !== undefined) {
                const parts: string[] = [];
                if (data.inserted > 0) parts.push(language === 'th' ? `เพิ่มใหม่ ${data.inserted}` : `Inserted ${data.inserted}`);
                if (data.updated > 0) parts.push(language === 'th' ? `อัปเดต ${data.updated}` : `Updated ${data.updated}`);
                const errParts = data.errors?.length ? data.errors : [];
                const msg = parts.length > 0 ? parts.join(', ') : (language === 'th' ? 'ไม่มีรายการใหม่' : 'No new records');
                const hasErrors = errParts.length > 0;
                showToast(
                    hasErrors ? `${msg} | ${errParts.join('; ')}` : msg,
                    (data.inserted > 0 || data.updated > 0) ? 'success' : 'error'
                );
            } else {
                const count = Array.isArray(data) ? data.length : readyRows.length;
                showToast(
                    language === 'th'
                        ? `นำเข้าสำเร็จ ${count} รายการ`
                        : `Imported ${count} participants`,
                    'success'
                );
            }
            setParsedRows([]);
            setFileName('');
        } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : 'Unknown error';
            console.error('Import error:', msg);
            showToast(
                language === 'th'
                    ? `นำเข้าไม่สำเร็จ: ${msg}`
                    : `Import failed: ${msg}`,
                'error'
            );
        } finally {
            setImporting(false);
        }
    };

    // Filtered rows
    const filteredRows = parsedRows.filter(r => {
        if (statusFilter && r.status !== statusFilter) return false;
        if (search) {
            const q = search.toLowerCase();
            return r.bib.toLowerCase().includes(q) ||
                r.firstName.toLowerCase().includes(q) ||
                r.lastName.toLowerCase().includes(q) ||
                r.chipCode.toLowerCase().includes(q);
        }
        return true;
    });

    const readyCount = parsedRows.filter(r => r.status === 'ready').length;
    const warningCount = parsedRows.filter(r => r.status === 'warning').length;
    const errorCount = parsedRows.filter(r => r.status === 'error').length;

    return (
        <AdminLayout
            breadcrumbItems={[
                { label: 'ผู้เข้าแข่งขัน', labelEn: 'Participants' }
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
                    {/* Tabs: Import + one per category */}
                    <div style={{
                        display: 'flex', gap: 0, marginBottom: 20, borderBottom: '2px solid #e5e7eb',
                        overflowX: 'auto',
                    }}>
                        <button
                            onClick={() => { setActiveTab('import'); setListSearch(''); setChipStatusFilter(''); setListPage(1); }}
                            style={{
                                padding: '10px 20px', fontSize: 13, fontWeight: activeTab === 'import' ? 700 : 500,
                                border: 'none', cursor: 'pointer', borderRadius: '6px 6px 0 0',
                                background: activeTab === 'import' ? '#fff' : 'transparent',
                                color: activeTab === 'import' ? '#3c8dbc' : '#888',
                                borderBottom: activeTab === 'import' ? '2px solid #3c8dbc' : '2px solid transparent',
                                marginBottom: -2, transition: '0.15s', whiteSpace: 'nowrap',
                            }}
                        >
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ marginRight: 6, verticalAlign: -2 }}>
                                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                                <polyline points="7 10 12 15 17 10" />
                                <line x1="12" y1="15" x2="12" y2="3" />
                            </svg>
                            {language === 'th' ? 'นำเข้าข้อมูล' : 'Import Data'}
                        </button>
                        {(campaign.categories || []).map((cat, i) => {
                            const isActive = activeTab === cat.name;
                            return (
                                <button
                                    key={`tab-${cat.name}-${i}`}
                                    onClick={() => { setActiveTab(cat.name); setListSearch(''); setChipStatusFilter(''); setListPage(1); }}
                                    style={{
                                        padding: '10px 20px', fontSize: 13, fontWeight: isActive ? 700 : 500,
                                        border: 'none', cursor: 'pointer', borderRadius: '6px 6px 0 0',
                                        background: isActive ? '#fff' : 'transparent',
                                        color: isActive ? '#3c8dbc' : '#888',
                                        borderBottom: isActive ? '2px solid #3c8dbc' : '2px solid transparent',
                                        marginBottom: -2, transition: '0.15s', whiteSpace: 'nowrap',
                                    }}
                                >
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ marginRight: 5, verticalAlign: -2 }}>
                                        <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                                        <circle cx="9" cy="7" r="4" />
                                    </svg>
                                    {cat.name}{cat.distance ? ` (${cat.distance})` : ''}
                                </button>
                            );
                        })}
                    </div>

                    {/* ===== IMPORT TAB ===== */}
                    {activeTab === 'import' && (<>
                    {/* Step 1: Import Settings */}
                    <div style={{
                        background: '#fff', borderTop: '3px solid #3c8dbc',
                        padding: '12px 20px', borderRadius: 4, marginBottom: 20,
                        boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
                    }}>
                        <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 10, color: '#444', display: 'flex', alignItems: 'center', gap: 8 }}>
                            <span style={{
                                background: '#3c8dbc', color: 'white', width: 20, height: 20,
                                borderRadius: '50%', display: 'inline-flex', alignItems: 'center',
                                justifyContent: 'center', fontSize: 10,
                            }}>1</span>
                            {language === 'th' ? 'ตั้งค่าการนำเข้า (Import Settings)' : 'Import Settings'}
                        </div>
                        <div style={{ display: 'flex', gap: 20, alignItems: 'center', flexWrap: 'wrap' }}>
                            {/* Distance selector */}
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                <span style={{ fontWeight: 600, fontSize: 12, whiteSpace: 'nowrap', color: '#555' }}>
                                    {language === 'th' ? 'ระยะทาง:' : 'Distance:'}
                                </span>
                                <select
                                    className="form-select"
                                    value={selectedCategory}
                                    onChange={e => setSelectedCategory(e.target.value)}
                                    style={{ minWidth: 220, padding: '6px 10px', fontSize: 13, fontWeight: 500, border: '1px solid #ccc', borderRadius: 4 }}
                                >
                                    {(campaign.categories || []).map((cat, i) => (
                                        <option key={`${cat.name}-${i}`} value={cat.name}>
                                            {cat.name}{cat.distance ? ` - ${cat.distance}` : ''}
                                        </option>
                                    ))}
                                </select>
                            </div>

                            {/* File upload with drag & drop */}
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, minWidth: 300 }}>
                                <span style={{ fontWeight: 600, fontSize: 12, whiteSpace: 'nowrap', color: '#555' }}>
                                    {language === 'th' ? 'ไฟล์:' : 'File:'}
                                </span>
                                <div
                                    onClick={() => fileInputRef.current?.click()}
                                    onDrop={handleDrop}
                                    onDragOver={handleDragOver}
                                    onDragLeave={handleDragLeave}
                                    style={{
                                        border: `2px dashed ${isDragging ? '#00a65a' : '#ccc'}`,
                                        padding: '6px 12px',
                                        background: isDragging ? '#e8f5e9' : '#f9f9f9',
                                        borderRadius: 3, cursor: 'pointer', display: 'flex', alignItems: 'center',
                                        gap: 10, flex: 1, transition: '0.2s',
                                    }}
                                    onMouseEnter={e => { if (!isDragging) { (e.currentTarget).style.borderColor = '#00a65a'; (e.currentTarget).style.background = '#e8f5e9'; } }}
                                    onMouseLeave={e => { if (!isDragging) { (e.currentTarget).style.borderColor = '#ccc'; (e.currentTarget).style.background = '#f9f9f9'; } }}
                                >
                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#00a65a" strokeWidth="2">
                                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                                        <polyline points="14 2 14 8 20 8" />
                                        <line x1="16" y1="13" x2="8" y2="13" />
                                        <line x1="16" y1="17" x2="8" y2="17" />
                                    </svg>
                                    <div style={{ fontWeight: 500, fontSize: 13, color: isDragging ? '#00a65a' : '#333' }}>
                                        {isDragging
                                            ? (language === 'th' ? 'วางไฟล์ที่นี่...' : 'Drop file here...')
                                            : fileName
                                                ? fileName
                                                : (language === 'th' ? 'คลิกเลือกหรือลากไฟล์ CSV, XLSX มาวาง' : 'Click or drag CSV/XLSX file here')
                                        }
                                    </div>
                                    {fileName && !isDragging && (
                                        <small style={{ color: '#888', marginLeft: 'auto' }}>
                                            ({language === 'th' ? 'คลิกเปลี่ยน' : 'click to change'})
                                        </small>
                                    )}
                                </div>
                                <input
                                    ref={fileInputRef}
                                    type="file"
                                    accept=".csv,.xlsx,.xls"
                                    onChange={handleFileChange}
                                    style={{ display: 'none' }}
                                />
                            </div>

                            {/* Checkboxes */}
                            <div style={{
                                display: 'flex', gap: 15, alignItems: 'center', fontSize: 12,
                                marginLeft: 'auto', paddingLeft: 15, borderLeft: '1px solid #eee',
                                whiteSpace: 'nowrap', color: '#555',
                            }}>
                                <label style={{ display: 'flex', alignItems: 'center', gap: 5, cursor: 'pointer' }}>
                                    <input type="checkbox" checked={checkDupBib} onChange={e => setCheckDupBib(e.target.checked)} />
                                    {language === 'th' ? 'เช็ค BIB ซ้ำ' : 'Check dup BIB'}
                                </label>
                                <label style={{ display: 'flex', alignItems: 'center', gap: 5, cursor: 'pointer' }}>
                                    <input type="checkbox" checked={updateExisting} onChange={e => setUpdateExisting(e.target.checked)} />
                                    {language === 'th' ? 'อัปเดตข้อมูลเดิม' : 'Update existing'}
                                </label>
                                <label style={{ display: 'flex', alignItems: 'center', gap: 5, cursor: 'pointer' }}>
                                    <input type="checkbox" checked={autoAgeGroup} onChange={e => setAutoAgeGroup(e.target.checked)} />
                                    Auto Age Group
                                </label>
                            </div>
                        </div>
                    </div>

                    {/* Step 2: Preview */}
                    {parsedRows.length > 0 && (
                        <div style={{
                            background: '#fff', borderRadius: 4,
                            boxShadow: '0 1px 3px rgba(0,0,0,0.1)', padding: 15, marginBottom: 15,
                        }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                                <div style={{ fontWeight: 600, fontSize: 14, color: '#444', display: 'flex', alignItems: 'center', gap: 8 }}>
                                    <span style={{
                                        background: '#3c8dbc', color: 'white', width: 20, height: 20,
                                        borderRadius: '50%', display: 'inline-flex', alignItems: 'center',
                                        justifyContent: 'center', fontSize: 10,
                                    }}>2</span>
                                    {language === 'th'
                                        ? `ตรวจสอบข้อมูล (Preview ${parsedRows.length} รายการ)`
                                        : `Preview (${parsedRows.length} rows)`}
                                </div>
                                <div style={{ fontSize: 12, color: '#666' }}>
                                    {language === 'th' ? 'สถานะ: ' : 'Status: '}
                                    <span style={{ color: '#00a65a', fontWeight: 'bold' }}>{readyCount} {language === 'th' ? 'พร้อม' : 'Ready'}</span>
                                    {warningCount > 0 && (
                                        <>, <span style={{ color: '#e68a00', fontWeight: 'bold' }}>{warningCount} {language === 'th' ? 'ขาด Chip' : 'No Chip'}</span></>
                                    )}
                                    {errorCount > 0 && (
                                        <>, <span style={{ color: '#dd4b39', fontWeight: 'bold' }}>{errorCount} Error</span></>
                                    )}
                                </div>
                            </div>

                            {/* Filter toolbar */}
                            <div style={{
                                display: 'flex', gap: 10, marginBottom: 10, background: '#f4f6f9',
                                padding: '8px 12px', borderRadius: 4, alignItems: 'center', border: '1px solid #eee',
                            }}>
                                <input
                                    type="text"
                                    value={search}
                                    onChange={e => setSearch(e.target.value)}
                                    placeholder={language === 'th' ? 'ค้นหา BIB, ชื่อ หรือ Chip Code...' : 'Search BIB, name or Chip Code...'}
                                    style={{
                                        padding: '6px 10px', border: '1px solid #ccc', borderRadius: 3,
                                        fontSize: 13, width: 280, fontFamily: 'inherit',
                                    }}
                                />
                                <select
                                    className="form-select"
                                    value={statusFilter}
                                    onChange={e => setStatusFilter(e.target.value)}
                                    style={{ width: 180, background: 'white', fontSize: 13 }}
                                >
                                    <option value="">{language === 'th' ? 'สถานะ: ทั้งหมด' : 'Status: All'}</option>
                                    <option value="ready">{language === 'th' ? 'พร้อม (Ready)' : 'Ready'}</option>
                                    <option value="warning">{language === 'th' ? 'ขาด Chip Code' : 'Missing Chip'}</option>
                                    <option value="error">Error</option>
                                </select>
                            </div>

                            {/* Table */}
                            <div style={{ maxHeight: 500, overflowY: 'auto', border: '1px solid #eee', borderRadius: 3 }}>
                                <table className="data-table" style={{ fontSize: 12 }}>
                                    <thead>
                                        <tr>
                                            <th style={{ width: 40 }}>#</th>
                                            <th style={{ width: 80 }}>BIB</th>
                                            <th>{language === 'th' ? 'ชื่อ-นามสกุล' : 'Name'}</th>
                                            <th style={{ width: 60 }}>{language === 'th' ? 'เพศ' : 'Gender'}</th>
                                            <th style={{ width: 90 }}>{language === 'th' ? 'วันเกิด' : 'DOB'}</th>
                                            <th style={{ width: 60 }}>{language === 'th' ? 'สัญชาติ' : 'Nat.'}</th>
                                            <th style={{ width: 80 }}>{language === 'th' ? 'กลุ่มอายุ' : 'Age Grp'}</th>
                                            <th style={{ width: 120 }}>{language === 'th' ? 'สถานะ' : 'Status'}</th>
                                            <th style={{ width: 160 }}>Chip Code (RFID)</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {filteredRows.map((r) => (
                                            <tr
                                                key={r.rowNum}
                                                style={{
                                                    background: r.status === 'error' ? '#fff5f5'
                                                        : r.status === 'warning' ? '#fff9e6' : undefined,
                                                }}
                                            >
                                                <td style={{ textAlign: 'center' }}>{r.rowNum}</td>
                                                <td>
                                                    <span style={{
                                                        background: r.status === 'error' ? '#fff' : '#eee',
                                                        padding: '2px 8px', borderRadius: 4, fontFamily: 'monospace',
                                                        fontWeight: 'bold', border: `1px solid ${r.status === 'error' ? '#dd4b39' : '#ddd'}`,
                                                        fontSize: 12, color: r.status === 'error' ? '#dd4b39' : '#333',
                                                        display: 'inline-block', minWidth: 45, textAlign: 'center',
                                                    }}>
                                                        {r.bib}
                                                    </span>
                                                </td>
                                                <td>{r.firstName} {r.lastName}</td>
                                                <td style={{ textAlign: 'center', color: r.gender === '?' ? 'red' : undefined, fontWeight: r.gender === '?' ? 'bold' : undefined }}>
                                                    {r.gender}
                                                </td>
                                                <td style={{ textAlign: 'center' }}>{r.birthDate || '-'}</td>
                                                <td style={{ textAlign: 'center' }}>{r.nationality}</td>
                                                <td>
                                                    <span style={{ color: r.ageGroup ? '#3c8dbc' : '#ccc' }}>
                                                        {r.ageGroup || '-'}
                                                    </span>
                                                </td>
                                                <td>
                                                    {r.status === 'ready' && (
                                                        <span style={{ color: '#00a65a', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4, fontSize: 11 }}>
                                                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" /><polyline points="22 4 12 14.01 9 11.01" /></svg>
                                                            {language === 'th' ? 'พร้อม' : 'Ready'}
                                                        </span>
                                                    )}
                                                    {r.status === 'warning' && (
                                                        <span style={{ color: '#e68a00', fontWeight: 'bold', fontSize: 11, display: 'flex', alignItems: 'center', gap: 4 }}>
                                                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z" /><line x1="7" y1="7" x2="7.01" y2="7" /></svg>
                                                            {language === 'th' ? 'ขาด Chip' : 'No Chip'}
                                                        </span>
                                                    )}
                                                    {r.status === 'error' && (
                                                        <span style={{ color: '#dd4b39', fontWeight: 'bold', fontSize: 11, display: 'flex', alignItems: 'center', gap: 4 }}>
                                                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" /><line x1="15" y1="9" x2="9" y2="15" /><line x1="9" y1="9" x2="15" y2="15" /></svg>
                                                            {r.errorMsg}
                                                        </span>
                                                    )}
                                                </td>
                                                <td>
                                                    <input
                                                        type="text"
                                                        value={r.chipCode}
                                                        onChange={e => handleUpdateChip(r.rowNum, e.target.value)}
                                                        placeholder={language === 'th' ? 'ระบุรหัสชิป' : 'Chip code'}
                                                        style={{
                                                            width: '100%', border: `1px solid ${r.chipCode ? '#bbf7d0' : '#ddd'}`,
                                                            padding: '4px 8px', fontSize: 12, fontFamily: 'monospace',
                                                            color: '#333', background: r.chipCode ? '#f0fff4' : '#fff',
                                                            borderRadius: 3,
                                                        }}
                                                    />
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                            <div style={{ textAlign: 'right', marginTop: 8, fontSize: 11, color: '#888' }}>
                                *{language === 'th'
                                    ? `แสดง ${filteredRows.length} จาก ${parsedRows.length} รายการ`
                                    : `Showing ${filteredRows.length} of ${parsedRows.length} rows`}
                            </div>
                        </div>
                    )}

                    {/* Action buttons */}
                    {parsedRows.length > 0 && (
                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
                            <button
                                className="btn"
                                onClick={() => { setParsedRows([]); setFileName(''); }}
                                style={{ background: '#6c757d', fontSize: 13 }}
                            >
                                {language === 'th' ? 'ยกเลิก' : 'Cancel'}
                            </button>
                            <button
                                className="btn"
                                onClick={handleImport}
                                disabled={importing || readyCount + warningCount === 0}
                                style={{
                                    background: '#00a65a', width: 220, fontWeight: 600,
                                    fontSize: 13, boxShadow: '0 2px 5px rgba(0,166,90,0.3)',
                                    opacity: importing ? 0.7 : 1,
                                }}
                            >
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ display: 'inline-block', marginRight: 6 }}>
                                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                                    <polyline points="7 10 12 15 17 10" />
                                    <line x1="12" y1="15" x2="12" y2="3" />
                                </svg>
                                {importing
                                    ? (language === 'th' ? 'กำลังนำเข้า...' : 'Importing...')
                                    : (language === 'th'
                                        ? `ยืนยันการนำเข้า (${readyCount + warningCount} รายการ)`
                                        : `Import (${readyCount + warningCount} rows)`)}
                            </button>
                        </div>
                    )}
                    </>)}

                    {/* ===== CATEGORY TAB (one per distance) ===== */}
                    {activeTab !== 'import' && (
                        <div style={{
                            background: '#fff', borderTop: '3px solid #3c8dbc',
                            padding: '16px 20px', borderRadius: 4,
                            boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
                        }}>
                            {/* Toolbar: search + chip status filter buttons + total */}
                            <div style={{
                                display: 'flex', gap: 10, alignItems: 'center', marginBottom: 16,
                                flexWrap: 'wrap',
                            }}>
                                <input
                                    type="text"
                                    value={listSearch}
                                    onChange={e => { setListSearch(e.target.value); setListPage(1); }}
                                    placeholder={language === 'th' ? 'ค้นหา BIB, ชื่อ...' : 'Search BIB, name...'}
                                    style={{
                                        padding: '7px 12px', border: '1px solid #ddd',
                                        borderRadius: 4, fontSize: 13, fontFamily: 'inherit',
                                        width: 240,
                                    }}
                                />
                                <div style={{ display: 'flex', gap: 4 }}>
                                    {[
                                        { key: '', label: language === 'th' ? 'ทั้งหมด' : 'All', icon: null },
                                        { key: 'has', label: language === 'th' ? 'มี ChipCode' : 'Has Chip', icon: '✓' },
                                        { key: 'missing', label: language === 'th' ? 'ขาด ChipCode' : 'No Chip', icon: '!' },
                                    ].map(f => (
                                        <button
                                            key={f.key}
                                            onClick={() => { setChipStatusFilter(f.key); setListPage(1); }}
                                            style={{
                                                padding: '6px 14px', fontSize: 12, fontWeight: chipStatusFilter === f.key ? 700 : 500,
                                                border: `1px solid ${chipStatusFilter === f.key ? '#3c8dbc' : '#ddd'}`,
                                                borderRadius: 4, cursor: 'pointer', transition: '0.15s',
                                                background: chipStatusFilter === f.key ? '#e8f4fd' : '#fff',
                                                color: chipStatusFilter === f.key ? '#3c8dbc' : '#666',
                                                whiteSpace: 'nowrap',
                                            }}
                                        >
                                            {f.icon && <span style={{ marginRight: 4 }}>{f.icon}</span>}
                                            {f.label}
                                        </button>
                                    ))}
                                </div>
                                <div style={{ marginLeft: 'auto', fontSize: 13, color: '#666', whiteSpace: 'nowrap' }}>
                                    {language === 'th' ? `ทั้งหมด ${runnersTotal} คน` : `Total: ${runnersTotal}`}
                                </div>
                            </div>

                            {/* Runners table */}
                            {runnersLoading ? (
                                <div style={{ padding: 40, textAlign: 'center', color: '#999' }}>
                                    {language === 'th' ? 'กำลังโหลด...' : 'Loading...'}
                                </div>
                            ) : runners.length === 0 ? (
                                <div style={{ padding: 40, textAlign: 'center', color: '#999' }}>
                                    {language === 'th' ? 'ไม่พบข้อมูลนักกีฬา' : 'No participants found'}
                                </div>
                            ) : (
                                <>
                                <div style={{ maxHeight: 540, overflowY: 'auto', border: '1px solid #eee', borderRadius: 3 }}>
                                    <table className="data-table" style={{ fontSize: 12 }}>
                                        <thead>
                                            <tr>
                                                <th style={{ width: 40 }}>#</th>
                                                <th style={{ width: 80 }}>BIB</th>
                                                <th>{language === 'th' ? 'ชื่อ-นามสกุล' : 'Name'}</th>
                                                <th style={{ width: 60 }}>{language === 'th' ? 'เพศ' : 'Gender'}</th>
                                                <th style={{ width: 90 }}>{language === 'th' ? 'กลุ่มอายุ' : 'Age Grp'}</th>
                                                <th style={{ width: 70 }}>{language === 'th' ? 'สัญชาติ' : 'Nat.'}</th>
                                                <th style={{ width: 200 }}>Chip Code (RFID)</th>
                                                <th style={{ width: 90 }}>{language === 'th' ? 'สถานะ' : 'Status'}</th>
                                                <th style={{ width: 60 }}></th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {runners.map((r, idx) => (
                                                <tr key={r._id}>
                                                    <td style={{ textAlign: 'center', color: '#999' }}>
                                                        {(listPage - 1) * listLimit + idx + 1}
                                                    </td>
                                                    <td>
                                                        <span style={{
                                                            background: '#eee', padding: '2px 8px', borderRadius: 4,
                                                            fontFamily: 'monospace', fontWeight: 'bold', fontSize: 12,
                                                            border: '1px solid #ddd', display: 'inline-block',
                                                            minWidth: 45, textAlign: 'center',
                                                        }}>
                                                            {r.bib}
                                                        </span>
                                                    </td>
                                                    <td>
                                                        <div style={{ fontWeight: 500 }}>{r.firstName} {r.lastName}</div>
                                                        {(r.firstNameTh || r.lastNameTh) && (
                                                            <div style={{ fontSize: 11, color: '#999' }}>
                                                                {r.firstNameTh} {r.lastNameTh}
                                                            </div>
                                                        )}
                                                    </td>
                                                    <td style={{ textAlign: 'center' }}>
                                                        <span style={{
                                                            color: r.gender === 'F' ? '#ec4899' : '#3b82f6',
                                                            fontWeight: 600,
                                                        }}>
                                                            {r.gender === 'F' ? (language === 'th' ? 'หญิง' : 'F') : (language === 'th' ? 'ชาย' : 'M')}
                                                        </span>
                                                    </td>
                                                    <td>
                                                        <span style={{ color: r.ageGroup ? '#3c8dbc' : '#ccc' }}>
                                                            {r.ageGroup || '-'}
                                                        </span>
                                                    </td>
                                                    <td style={{ textAlign: 'center' }}>{r.nationality || '-'}</td>
                                                    <td>
                                                        {editingChipId === r._id ? (
                                                            <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                                                                <input
                                                                    type="text"
                                                                    value={editingChipValue}
                                                                    onChange={e => setEditingChipValue(e.target.value)}
                                                                    onKeyDown={e => {
                                                                        if (e.key === 'Enter') handleSaveChip(r._id, editingChipValue);
                                                                        if (e.key === 'Escape') setEditingChipId(null);
                                                                    }}
                                                                    autoFocus
                                                                    style={{
                                                                        flex: 1, padding: '3px 6px', fontSize: 12,
                                                                        fontFamily: 'monospace', border: '1px solid #3c8dbc',
                                                                        borderRadius: 3, outline: 'none',
                                                                    }}
                                                                />
                                                                <button
                                                                    onClick={() => handleSaveChip(r._id, editingChipValue)}
                                                                    disabled={savingChip}
                                                                    style={{
                                                                        padding: '3px 8px', fontSize: 11, border: 'none',
                                                                        borderRadius: 3, background: '#00a65a', color: '#fff',
                                                                        cursor: 'pointer', fontWeight: 600, whiteSpace: 'nowrap',
                                                                    }}
                                                                >
                                                                    {savingChip ? '...' : '✓'}
                                                                </button>
                                                                <button
                                                                    onClick={() => setEditingChipId(null)}
                                                                    style={{
                                                                        padding: '3px 8px', fontSize: 11, border: 'none',
                                                                        borderRadius: 3, background: '#eee', color: '#666',
                                                                        cursor: 'pointer', fontWeight: 600,
                                                                    }}
                                                                >
                                                                    ✕
                                                                </button>
                                                            </div>
                                                        ) : (
                                                            <span style={{
                                                                fontFamily: 'monospace', fontSize: 11,
                                                                color: r.chipCode ? '#333' : '#e68a00',
                                                                fontWeight: r.chipCode ? 'normal' : 600,
                                                            }}>
                                                                {r.chipCode || (language === 'th' ? 'ไม่มี' : 'None')}
                                                            </span>
                                                        )}
                                                    </td>
                                                    <td>
                                                        <span style={{
                                                            fontSize: 11, fontWeight: 600, padding: '2px 8px',
                                                            borderRadius: 10, display: 'inline-block',
                                                            background:
                                                                r.status === 'finished' ? '#dcfce7' :
                                                                r.status === 'in_progress' ? '#dbeafe' :
                                                                r.status === 'dnf' ? '#fee2e2' :
                                                                r.status === 'dns' ? '#fef3c7' : '#f3f4f6',
                                                            color:
                                                                r.status === 'finished' ? '#16a34a' :
                                                                r.status === 'in_progress' ? '#2563eb' :
                                                                r.status === 'dnf' ? '#dc2626' :
                                                                r.status === 'dns' ? '#d97706' : '#666',
                                                        }}>
                                                            {r.status === 'not_started' ? (language === 'th' ? 'ยังไม่เริ่ม' : 'Not Started') :
                                                             r.status === 'in_progress' ? (language === 'th' ? 'กำลังแข่ง' : 'In Progress') :
                                                             r.status === 'finished' ? (language === 'th' ? 'เข้าเส้นชัย' : 'Finished') :
                                                             r.status === 'dnf' ? 'DNF' :
                                                             r.status === 'dns' ? 'DNS' : r.status}
                                                        </span>
                                                    </td>
                                                    <td style={{ textAlign: 'center' }}>
                                                        {editingChipId !== r._id && (
                                                            <button
                                                                onClick={() => { setEditingChipId(r._id); setEditingChipValue(r.chipCode || ''); }}
                                                                title={language === 'th' ? 'แก้ไข ChipCode' : 'Edit ChipCode'}
                                                                style={{
                                                                    padding: '3px 8px', fontSize: 11, border: '1px solid #ddd',
                                                                    borderRadius: 3, background: '#fff', color: '#3c8dbc',
                                                                    cursor: 'pointer', fontWeight: 600,
                                                                }}
                                                            >
                                                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ verticalAlign: -1 }}>
                                                                    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                                                                    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                                                                </svg>
                                                            </button>
                                                        )}
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>

                                {/* Pagination */}
                                {runnersTotal > listLimit && (
                                    <div style={{
                                        display: 'flex', justifyContent: 'center', alignItems: 'center',
                                        gap: 8, marginTop: 12,
                                    }}>
                                        <button
                                            className="btn"
                                            disabled={listPage <= 1}
                                            onClick={() => setListPage(p => Math.max(1, p - 1))}
                                            style={{
                                                background: '#fff', color: '#333', border: '1px solid #ddd',
                                                padding: '5px 12px', fontSize: 12, opacity: listPage <= 1 ? 0.4 : 1,
                                            }}
                                        >
                                            ← {language === 'th' ? 'ก่อนหน้า' : 'Prev'}
                                        </button>
                                        <span style={{ fontSize: 12, color: '#666' }}>
                                            {language === 'th'
                                                ? `หน้า ${listPage} / ${Math.ceil(runnersTotal / listLimit)}`
                                                : `Page ${listPage} of ${Math.ceil(runnersTotal / listLimit)}`}
                                        </span>
                                        <button
                                            className="btn"
                                            disabled={listPage >= Math.ceil(runnersTotal / listLimit)}
                                            onClick={() => setListPage(p => p + 1)}
                                            style={{
                                                background: '#fff', color: '#333', border: '1px solid #ddd',
                                                padding: '5px 12px', fontSize: 12,
                                                opacity: listPage >= Math.ceil(runnersTotal / listLimit) ? 0.4 : 1,
                                            }}
                                        >
                                            {language === 'th' ? 'ถัดไป' : 'Next'} →
                                        </button>
                                    </div>
                                )}
                                </>
                            )}
                        </div>
                    )}
                </>
            )}
        </AdminLayout>
    );
}
