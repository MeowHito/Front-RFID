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
    tags: string[]; // 'no_bib','dup_bib','no_chip','dup_chip','ready'
}

interface CategoryImportData {
    fileName: string;
    parsedRows: ParsedRow[];
    isDragging: boolean;
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
    age?: number;
    nationality?: string;
    chipCode?: string;
    rfidTag?: string;
    status: string;
    team?: string;
    teamName?: string;
    box?: string;
    shirtSize?: string;
    email?: string;
    phone?: string;
    idNo?: string;
    birthDate?: string;
    emergencyContact?: string;
    emergencyPhone?: string;
    medicalInfo?: string;
    bloodType?: string;
    chronicDiseases?: string;
    address?: string;
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
    const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

    // Tab state: 'import' or a category name
    const [activeTab, setActiveTab] = useState<string>('import');

    // Participants list state
    const [runners, setRunners] = useState<Runner[]>([]);
    const [runnersTotal, setRunnersTotal] = useState(0);
    const [runnersLoading, setRunnersLoading] = useState(false);
    const [listSearch, setListSearch] = useState('');
    const [listPage, setListPage] = useState(1);
    const listLimit = 50;
    const [categoryCounts, setCategoryCounts] = useState<Record<string, number>>({});
    const [listRunnerStatus, setListRunnerStatus] = useState<string[]>([]);
    const [dupBibs, setDupBibs] = useState<string[]>([]);
    const [dupChips, setDupChips] = useState<string[]>([]);

    // Edit modal state
    const [editingRunner, setEditingRunner] = useState<Runner | null>(null);
    const [editForm, setEditForm] = useState<Record<string, string>>({});
    const [savingRunner, setSavingRunner] = useState(false);

    // Per-category import state
    const [categoryImports, setCategoryImports] = useState<Record<string, CategoryImportData>>({});
    const [importing, setImporting] = useState(false);
    const [importingCategory, setImportingCategory] = useState<string>('');
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [uploadTargetCategory, setUploadTargetCategory] = useState<string>('');

    // Options
    const [updateExisting, setUpdateExisting] = useState(false);

    // Import filter buttons (multi-select, push/pop)
    const [importFilters, setImportFilters] = useState<string[]>([]);

    const showToast = (message: string, type: 'success' | 'error') => {
        setToast({ message, type });
        setTimeout(() => setToast(null), type === 'error' ? 6000 : 3000);
    };

    // Load featured campaign + fetch category counts
    useEffect(() => {
        async function loadFeatured() {
            try {
                const res = await fetch('/api/campaigns/featured', { cache: 'no-store' });
                if (!res.ok) throw new Error('No featured');
                const data = await res.json();
                if (data && data._id) {
                    setCampaign(data);
                    // Fetch counts per category, then auto-select first with data
                    const cats: RaceCategory[] = data.categories || [];
                    const counts: Record<string, number> = {};
                    await Promise.all(cats.map(async (cat) => {
                        try {
                            const p = new URLSearchParams({ eventId: data._id, category: cat.name, page: '1', limit: '1' });
                            const r = await fetch(`/api/runners/paged?${p.toString()}`);
                            if (r.ok) {
                                const d = await r.json();
                                counts[cat.name] = d.total || 0;
                            }
                        } catch { /* ignore */ }
                    }));
                    setCategoryCounts(counts);
                    // Auto-select the first category that has data, otherwise stay on import
                    const firstWithData = cats.find(c => (counts[c.name] || 0) > 0);
                    if (firstWithData) setActiveTab(firstWithData.name);
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
            if (listRunnerStatus.length > 0) params.append('runnerStatus', listRunnerStatus.join(','));
            const res = await fetch(`/api/runners/paged?${params.toString()}`, { cache: 'no-store' });
            if (!res.ok) throw new Error('Failed');
            const data = await res.json();
            setRunners(data.data || []);
            setRunnersTotal(data.total || 0);
            setDupBibs(data.dupBibs || []);
            setDupChips(data.dupChips || []);
        } catch {
            setRunners([]);
            setRunnersTotal(0);
        } finally {
            setRunnersLoading(false);
        }
    }, [campaign, activeTab, listSearch, listPage, listRunnerStatus]);

    useEffect(() => {
        if (activeTab !== 'import') fetchRunners();
    }, [activeTab, fetchRunners]);

    // Toggle runner status filter (push/pop, 'ready' clears all others)
    const toggleListRunnerStatus = useCallback((status: string) => {
        setListRunnerStatus(prev => {
            if (status === 'ready') return prev.includes('ready') ? [] : ['ready'];
            let next = prev.filter(f => f !== 'ready');
            if (next.includes(status)) { next = next.filter(f => f !== status); }
            else { next = [...next, status]; }
            return next;
        });
        setListPage(1);
    }, []);

    // Open edit modal for a runner
    const openEditModal = useCallback((runner: Runner) => {
        setEditingRunner(runner);
        setEditForm({
            bib: runner.bib || '',
            firstName: runner.firstName || '',
            lastName: runner.lastName || '',
            firstNameTh: runner.firstNameTh || '',
            lastNameTh: runner.lastNameTh || '',
            gender: runner.gender || 'M',
            category: runner.category || '',
            ageGroup: runner.ageGroup || '',
            nationality: runner.nationality || '',
            chipCode: runner.chipCode || '',
            rfidTag: runner.rfidTag || '',
            team: runner.team || '',
            teamName: runner.teamName || '',
            box: runner.box || '',
            shirtSize: runner.shirtSize || '',
            email: runner.email || '',
            phone: runner.phone || '',
            idNo: runner.idNo || '',
            birthDate: runner.birthDate ? runner.birthDate.substring(0, 10) : '',
            emergencyContact: runner.emergencyContact || '',
            emergencyPhone: runner.emergencyPhone || '',
            medicalInfo: runner.medicalInfo || '',
            bloodType: runner.bloodType || '',
            chronicDiseases: runner.chronicDiseases || '',
            address: runner.address || '',
            status: runner.status || 'not_started',
        });
    }, []);

    // Save all edited fields for a runner
    const handleSaveRunner = useCallback(async () => {
        if (!editingRunner) return;
        setSavingRunner(true);
        try {
            const res = await fetch(`/api/runners/${editingRunner._id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(editForm),
            });
            if (!res.ok) {
                let errMsg = 'Failed';
                try { const e = await res.json(); errMsg = e?.message || e?.error || errMsg; } catch { /* */ }
                throw new Error(typeof errMsg === 'string' ? errMsg : JSON.stringify(errMsg));
            }
            const updated = await res.json();
            setRunners(prev => prev.map(r => r._id === editingRunner._id ? { ...r, ...updated } : r));
            setEditingRunner(null);
            showToast(language === 'th' ? 'บันทึกสำเร็จ' : 'Saved successfully', 'success');
        } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : 'Unknown error';
            showToast(language === 'th' ? `บันทึกไม่สำเร็จ: ${msg}` : `Save failed: ${msg}`, 'error');
        } finally {
            setSavingRunner(false);
        }
    }, [editingRunner, editForm, language]);

    // Delete a runner
    const handleDeleteRunner = useCallback(async () => {
        if (!editingRunner) return;
        const confirmed = window.confirm(
            language === 'th'
                ? `คุณต้องการลบนักกีฬา BIB ${editingRunner.bib} (${editingRunner.firstName} ${editingRunner.lastName}) จริงหรือไม่?`
                : `Are you sure you want to delete BIB ${editingRunner.bib} (${editingRunner.firstName} ${editingRunner.lastName})?`
        );
        if (!confirmed) return;
        setSavingRunner(true);
        try {
            const res = await fetch(`/api/runners/${editingRunner._id}`, { method: 'DELETE' });
            if (!res.ok) {
                let errMsg = 'Failed';
                try { const e = await res.json(); errMsg = e?.message || e?.error || errMsg; } catch { /* */ }
                throw new Error(typeof errMsg === 'string' ? errMsg : JSON.stringify(errMsg));
            }
            setRunners(prev => prev.filter(r => r._id !== editingRunner._id));
            setRunnersTotal(prev => prev - 1);
            // Update category count
            const cat = editingRunner.category || activeTab;
            setCategoryCounts(prev => ({ ...prev, [cat]: Math.max(0, (prev[cat] || 1) - 1) }));
            setEditingRunner(null);
            showToast(language === 'th' ? 'ลบสำเร็จ' : 'Deleted successfully', 'success');
        } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : 'Unknown error';
            showToast(language === 'th' ? `ลบไม่สำเร็จ: ${msg}` : `Delete failed: ${msg}`, 'error');
        } finally {
            setSavingRunner(false);
        }
    }, [editingRunner, activeTab, language]);

    // Parse CSV text and store for a specific category with tag-based validation
    const processCSVForCategory = useCallback((text: string, category: string, fName: string) => {
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

        // First pass: collect data
        const parsed: ParsedRow[] = [];
        const bibCount = new Map<string, number[]>();
        const chipCount = new Map<string, number[]>();

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
            const ageGroup = ageGrpIdx >= 0 ? (r[ageGrpIdx] || '').trim() : '';

            if (bib) {
                if (!bibCount.has(bib)) bibCount.set(bib, []);
                bibCount.get(bib)!.push(i);
            }
            if (chip) {
                if (!chipCount.has(chip)) chipCount.set(chip, []);
                chipCount.get(chip)!.push(i);
            }

            parsed.push({
                rowNum: i,
                bib, firstName, lastName, gender, birthDate, nationality, ageGroup, chipCode: chip,
                tags: [],
            });
        }

        // Second pass: assign tags
        for (const row of parsed) {
            const tags: string[] = [];
            if (!row.bib) tags.push('no_bib');
            else if ((bibCount.get(row.bib)?.length || 0) > 1) tags.push('dup_bib');
            if (!row.chipCode) tags.push('no_chip');
            else if ((chipCount.get(row.chipCode)?.length || 0) > 1) tags.push('dup_chip');
            if (tags.length === 0) tags.push('ready');
            row.tags = tags;
        }

        setCategoryImports(prev => ({
            ...prev,
            [category]: { fileName: fName, parsedRows: parsed, isDragging: false },
        }));
    }, [language]);

    const processFileForCategory = useCallback((file: File, category: string) => {
        const fName = file.name;
        const isXlsx = fName.toLowerCase().endsWith('.xlsx') || fName.toLowerCase().endsWith('.xls');
        if (isXlsx) {
            const reader = new FileReader();
            reader.onload = (ev) => {
                try {
                    const data = new Uint8Array(ev.target?.result as ArrayBuffer);
                    const workbook = XLSX.read(data, { type: 'array' });
                    const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
                    const csvText = XLSX.utils.sheet_to_csv(firstSheet);
                    processCSVForCategory(csvText, category, fName);
                } catch {
                    showToast(language === 'th' ? 'ไม่สามารถอ่านไฟล์ Excel ได้' : 'Cannot read Excel file', 'error');
                }
            };
            reader.readAsArrayBuffer(file);
        } else {
            const reader = new FileReader();
            reader.onload = (ev) => {
                const text = ev.target?.result as string;
                processCSVForCategory(text, category, fName);
            };
            reader.readAsText(file, 'UTF-8');
        }
    }, [processCSVForCategory, language]);

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file || !uploadTargetCategory) return;
        processFileForCategory(file, uploadTargetCategory);
        if (fileInputRef.current) fileInputRef.current.value = '';
    };

    const handleDropForCategory = useCallback((e: React.DragEvent, category: string) => {
        e.preventDefault();
        e.stopPropagation();
        setCategoryImports(prev => ({
            ...prev,
            [category]: { ...(prev[category] || { fileName: '', parsedRows: [] }), isDragging: false },
        }));
        const file = e.dataTransfer.files?.[0];
        if (!file) return;
        const ext = file.name.toLowerCase();
        if (!ext.endsWith('.csv') && !ext.endsWith('.xlsx') && !ext.endsWith('.xls')) {
            showToast(language === 'th' ? 'รองรับเฉพาะไฟล์ CSV และ XLSX' : 'Only CSV and XLSX files are supported', 'error');
            return;
        }
        processFileForCategory(file, category);
    }, [processFileForCategory, language]);

    const handleDragOverForCategory = useCallback((e: React.DragEvent, category: string) => {
        e.preventDefault();
        e.stopPropagation();
        setCategoryImports(prev => ({
            ...prev,
            [category]: { ...(prev[category] || { fileName: '', parsedRows: [] }), isDragging: true },
        }));
    }, []);

    const handleDragLeaveForCategory = useCallback((e: React.DragEvent, category: string) => {
        e.preventDefault();
        e.stopPropagation();
        setCategoryImports(prev => ({
            ...prev,
            [category]: { ...(prev[category] || { fileName: '', parsedRows: [] }), isDragging: false },
        }));
    }, []);

    // Toggle import filter (push/pop, 'ready' clears all others)
    const toggleImportFilter = useCallback((filter: string) => {
        setImportFilters(prev => {
            if (filter === 'ready') return prev.includes('ready') ? [] : ['ready'];
            let next = prev.filter(f => f !== 'ready');
            if (next.includes(filter)) { next = next.filter(f => f !== filter); }
            else { next = [...next, filter]; }
            return next;
        });
    }, []);

    // Import a specific category
    const handleImportCategory = async (category: string) => {
        if (!campaign?._id) return;
        const data = categoryImports[category];
        if (!data || data.parsedRows.length === 0) return;

        setImporting(true);
        setImportingCategory(category);
        try {
            const payload = data.parsedRows.map(r => ({
                eventId: campaign._id,
                bib: r.bib || `AUTO${r.rowNum}`,
                firstName: r.firstName || '-',
                lastName: r.lastName || '-',
                gender: r.gender === 'F' ? 'F' : 'M',
                category,
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
                showToast(language === 'th' ? `นำเข้าไม่สำเร็จ: ${errMsg}` : `Import failed: ${errMsg}`, 'error');
                return;
            }
            const result = await res.json();

            if (result.inserted !== undefined) {
                const parts: string[] = [];
                if (result.inserted > 0) parts.push(language === 'th' ? `เพิ่มใหม่ ${result.inserted}` : `Inserted ${result.inserted}`);
                if (result.updated > 0) parts.push(language === 'th' ? `อัปเดต ${result.updated}` : `Updated ${result.updated}`);
                const errParts = result.errors?.length ? result.errors : [];
                const msg = parts.length > 0 ? parts.join(', ') : (language === 'th' ? 'ไม่มีรายการใหม่' : 'No new records');
                showToast(
                    errParts.length > 0 ? `${msg} | ${errParts.join('; ')}` : msg,
                    (result.inserted > 0 || result.updated > 0) ? 'success' : 'error'
                );
            } else {
                showToast(language === 'th' ? `นำเข้าสำเร็จ ${data.parsedRows.length} รายการ` : `Imported ${data.parsedRows.length} participants`, 'success');
            }
            // Clear this category's import data
            setCategoryImports(prev => { const next = { ...prev }; delete next[category]; return next; });
            // Refresh count
            try {
                const p = new URLSearchParams({ eventId: campaign._id, category, page: '1', limit: '1' });
                const cr = await fetch(`/api/runners/paged?${p.toString()}`);
                if (cr.ok) { const cd = await cr.json(); setCategoryCounts(prev => ({ ...prev, [category]: cd.total || 0 })); }
            } catch { /* ignore */ }
        } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : 'Unknown error';
            showToast(language === 'th' ? `นำเข้าไม่สำเร็จ: ${msg}` : `Import failed: ${msg}`, 'error');
        } finally {
            setImporting(false);
            setImportingCategory('');
        }
    };

    // Helper: filter rows for a category based on active import filters
    const getFilteredRows = useCallback((rows: ParsedRow[]) => {
        if (importFilters.length === 0) return rows;
        return rows.filter(r => importFilters.some(f => r.tags.includes(f)));
    }, [importFilters]);

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
                    {/* Tabs: Import + category tabs that have data */}
                    <div style={{
                        display: 'flex', gap: 6, marginBottom: 20,
                        overflowX: 'auto', flexWrap: 'wrap',
                    }}>
                        <button
                            onClick={() => { setActiveTab('import'); setListSearch(''); setListPage(1); }}
                            style={{
                                padding: '8px 18px', fontSize: 13, fontWeight: activeTab === 'import' ? 700 : 500,
                                border: activeTab === 'import' ? '2px solid #3c8dbc' : '1px solid #bbb',
                                cursor: 'pointer', borderRadius: 6,
                                background: activeTab === 'import' ? '#e8f4fd' : '#fff',
                                color: activeTab === 'import' ? '#3c8dbc' : '#555',
                                transition: '0.15s', whiteSpace: 'nowrap',
                            }}
                        >
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ marginRight: 6, verticalAlign: -2 }}>
                                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                                <polyline points="7 10 12 15 17 10" />
                                <line x1="12" y1="15" x2="12" y2="3" />
                            </svg>
                            {language === 'th' ? 'นำเข้าข้อมูลผู้เข้าแข่งขัน' : 'Import Participants'}
                        </button>
                        {(campaign.categories || []).filter(cat => (categoryCounts[cat.name] || 0) > 0).map((cat, i) => {
                            const isActive = activeTab === cat.name;
                            const count = categoryCounts[cat.name] || 0;
                            return (
                                <button
                                    key={`tab-${cat.name}-${i}`}
                                    onClick={() => { setActiveTab(cat.name); setListSearch(''); setListPage(1); }}
                                    style={{
                                        padding: '8px 18px', fontSize: 13, fontWeight: isActive ? 700 : 500,
                                        border: isActive ? '2px solid #3c8dbc' : '1px solid #bbb',
                                        cursor: 'pointer', borderRadius: 6,
                                        background: isActive ? '#e8f4fd' : '#fff',
                                        color: isActive ? '#3c8dbc' : '#555',
                                        transition: '0.15s', whiteSpace: 'nowrap',
                                        display: 'flex', alignItems: 'center', gap: 5,
                                    }}
                                >
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ verticalAlign: -2 }}>
                                        <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                                        <circle cx="9" cy="7" r="4" />
                                    </svg>
                                    <span style={{ color: '#3c8dbc', fontWeight: 700, fontSize: 12 }}>({count})</span>
                                    {cat.name}{cat.distance ? ` (${cat.distance})` : ''}
                                </button>
                            );
                        })}
                    </div>

                    {/* ===== IMPORT TAB ===== */}
                    {activeTab === 'import' && (<>
                    {/* Hidden file input (shared) */}
                    <input
                        ref={fileInputRef}
                        type="file"
                        accept=".csv,.xlsx,.xls"
                        onChange={handleFileChange}
                        style={{ display: 'none' }}
                    />

                    {/* Per-category sections */}
                    {(campaign.categories || []).map((cat, catIdx) => {
                        const catData = categoryImports[cat.name];
                        const isDrag = catData?.isDragging || false;
                        const catFileName = catData?.fileName || '';
                        const catRows = catData?.parsedRows || [];
                        const filtered = getFilteredRows(catRows);
                        const readyC = catRows.filter(r => r.tags.includes('ready')).length;
                        const isImportingThis = importing && importingCategory === cat.name;

                        return (
                            <div key={`import-${cat.name}-${catIdx}`} style={{
                                background: '#fff', borderRadius: 4, marginBottom: 16,
                                boxShadow: '0 1px 3px rgba(0,0,0,0.1)', overflow: 'hidden',
                                border: '1px solid #e5e7eb',
                            }}>
                                {/* Category header */}
                                <div style={{
                                    padding: '10px 16px', background: '#f8fafc',
                                    borderBottom: '1px solid #e5e7eb',
                                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                                }}>
                                    <div style={{ fontWeight: 700, fontSize: 13, color: '#333', display: 'flex', alignItems: 'center', gap: 8 }}>
                                        <span style={{
                                            background: '#3c8dbc', color: '#fff', padding: '2px 10px',
                                            borderRadius: 4, fontSize: 12,
                                        }}>
                                            {cat.name}
                                        </span>
                                        {cat.distance && <span style={{ color: '#666', fontWeight: 500, fontSize: 12 }}>{cat.distance}</span>}
                                        {catFileName && <span style={{ color: '#888', fontSize: 11, fontWeight: 400 }}>— {catFileName} ({catRows.length} {language === 'th' ? 'รายการ' : 'rows'})</span>}
                                    </div>
                                    {catRows.length > 0 && (
                                        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                                            <button
                                                className="btn"
                                                onClick={() => setCategoryImports(prev => { const n = { ...prev }; delete n[cat.name]; return n; })}
                                                style={{ background: '#6c757d', fontSize: 11, padding: '4px 12px' }}
                                            >
                                                {language === 'th' ? 'ล้าง' : 'Clear'}
                                            </button>
                                            <button
                                                className="btn"
                                                onClick={() => handleImportCategory(cat.name)}
                                                disabled={isImportingThis || catRows.length === 0}
                                                style={{
                                                    background: '#00a65a', fontSize: 11, padding: '4px 14px',
                                                    fontWeight: 700, opacity: isImportingThis ? 0.6 : 1,
                                                }}
                                            >
                                                {isImportingThis
                                                    ? (language === 'th' ? 'กำลังนำเข้า...' : 'Importing...')
                                                    : (language === 'th' ? `นำเข้า (${catRows.length})` : `Import (${catRows.length})`)}
                                            </button>
                                        </div>
                                    )}
                                </div>

                                {/* Drop zone (always visible, compact) */}
                                <div
                                    onClick={() => { setUploadTargetCategory(cat.name); setTimeout(() => fileInputRef.current?.click(), 50); }}
                                    onDrop={e => handleDropForCategory(e, cat.name)}
                                    onDragOver={e => handleDragOverForCategory(e, cat.name)}
                                    onDragLeave={e => handleDragLeaveForCategory(e, cat.name)}
                                    style={{
                                        padding: catRows.length > 0 ? '6px 16px' : '14px 16px',
                                        background: isDrag ? '#e8f5e9' : '#fafbfc',
                                        borderBottom: catRows.length > 0 ? '1px solid #eee' : 'none',
                                        cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8,
                                        transition: '0.2s',
                                    }}
                                >
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={isDrag ? '#00a65a' : '#aaa'} strokeWidth="2">
                                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                                        <polyline points="14 2 14 8 20 8" />
                                    </svg>
                                    <span style={{ fontSize: 12, color: isDrag ? '#00a65a' : '#888' }}>
                                        {isDrag
                                            ? (language === 'th' ? 'วางไฟล์ที่นี่...' : 'Drop here...')
                                            : catFileName
                                                ? (language === 'th' ? 'คลิกเปลี่ยนไฟล์' : 'Click to change file')
                                                : (language === 'th' ? 'ลากไฟล์ CSV/XLSX มาวาง หรือคลิกเลือก' : 'Drag CSV/XLSX here or click to select')}
                                    </span>
                                </div>

                                {/* Preview table (if has rows) */}
                                {catRows.length > 0 && (
                                    <div style={{ padding: '0 0 8px 0' }}>
                                        <div style={{ maxHeight: 320, overflowY: 'auto' }}>
                                            <table className="data-table" style={{ fontSize: 11 }}>
                                                <thead>
                                                    <tr>
                                                        <th style={{ width: 35 }}>#</th>
                                                        <th style={{ width: 70 }}>BIB</th>
                                                        <th>{language === 'th' ? 'ชื่อ-นามสกุล' : 'Name'}</th>
                                                        <th style={{ width: 45 }}>{language === 'th' ? 'เพศ' : 'G'}</th>
                                                        <th style={{ width: 70 }}>{language === 'th' ? 'สัญชาติ' : 'Nat.'}</th>
                                                        <th style={{ width: 140 }}>Chip Code</th>
                                                        <th style={{ width: 120 }}>{language === 'th' ? 'สถานะ' : 'Status'}</th>
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {filtered.map(r => {
                                                        const hasNoBib = r.tags.includes('no_bib');
                                                        const hasDupBib = r.tags.includes('dup_bib');
                                                        const hasNoChip = r.tags.includes('no_chip');
                                                        const hasDupChip = r.tags.includes('dup_chip');
                                                        const isReady = r.tags.includes('ready');
                                                        const rowBg = hasNoBib ? '#fff5f5' : hasDupBib ? '#fffbeb' : undefined;
                                                        return (
                                                            <tr key={r.rowNum} style={{ background: rowBg }}>
                                                                <td style={{ textAlign: 'center', color: '#999' }}>{r.rowNum}</td>
                                                                <td>
                                                                    <span style={{
                                                                        background: hasNoBib ? '#fee2e2' : hasDupBib ? '#fef3c7' : '#eee',
                                                                        padding: '1px 6px', borderRadius: 3, fontFamily: 'monospace',
                                                                        fontWeight: 'bold', fontSize: 11,
                                                                        border: `1px solid ${hasNoBib ? '#f87171' : hasDupBib ? '#fbbf24' : '#ddd'}`,
                                                                        color: hasNoBib ? '#dc2626' : hasDupBib ? '#92400e' : '#333',
                                                                    }}>
                                                                        {r.bib || '—'}
                                                                    </span>
                                                                </td>
                                                                <td>{r.firstName} {r.lastName}</td>
                                                                <td style={{ textAlign: 'center' }}>{r.gender}</td>
                                                                <td style={{ textAlign: 'center' }}>{r.nationality}</td>
                                                                <td>
                                                                    <span style={{
                                                                        fontFamily: 'monospace', fontSize: 10,
                                                                        color: hasNoChip ? '#e68a00' : hasDupChip ? '#92400e' : '#333',
                                                                        fontWeight: (hasNoChip || hasDupChip) ? 600 : 'normal',
                                                                    }}>
                                                                        {r.chipCode || (language === 'th' ? 'ไม่มี' : 'None')}
                                                                    </span>
                                                                </td>
                                                                <td>
                                                                    <div style={{ display: 'flex', gap: 3, flexWrap: 'wrap' }}>
                                                                        {isReady && <span style={{ fontSize: 10, fontWeight: 600, color: '#16a34a', background: '#dcfce7', padding: '1px 6px', borderRadius: 8 }}>{language === 'th' ? 'พร้อม' : 'Ready'}</span>}
                                                                        {hasNoBib && <span style={{ fontSize: 10, fontWeight: 600, color: '#991b1b', background: '#fee2e2', padding: '1px 6px', borderRadius: 8 }}>{language === 'th' ? 'ไม่มีBIB' : 'No BIB'}</span>}
                                                                        {hasDupBib && <span style={{ fontSize: 10, fontWeight: 600, color: '#92400e', background: '#fef3c7', padding: '1px 6px', borderRadius: 8 }}>{language === 'th' ? 'BIBซ้ำ' : 'Dup BIB'}</span>}
                                                                        {hasNoChip && <span style={{ fontSize: 10, fontWeight: 600, color: '#9d174d', background: '#fce7f3', padding: '1px 6px', borderRadius: 8 }}>{language === 'th' ? 'ไม่มีChip' : 'No Chip'}</span>}
                                                                        {hasDupChip && <span style={{ fontSize: 10, fontWeight: 600, color: '#92400e', background: '#fef3c7', padding: '1px 6px', borderRadius: 8 }}>{language === 'th' ? 'Chipซ้ำ' : 'Dup Chip'}</span>}
                                                                    </div>
                                                                </td>
                                                            </tr>
                                                        );
                                                    })}
                                                </tbody>
                                            </table>
                                        </div>
                                        <div style={{ textAlign: 'right', padding: '4px 16px', fontSize: 10, color: '#999' }}>
                                            {language === 'th'
                                                ? `แสดง ${filtered.length} จาก ${catRows.length} | พร้อม ${readyC}`
                                                : `Showing ${filtered.length} of ${catRows.length} | Ready ${readyC}`}
                                        </div>
                                    </div>
                                )}
                            </div>
                        );
                    })}
                    </>)}

                    {/* ===== CATEGORY TAB (one per distance) ===== */}
                    {activeTab !== 'import' && (
                        <div style={{
                            background: '#fff', borderTop: '3px solid #3c8dbc',
                            padding: '16px 20px', borderRadius: 4,
                            boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
                        }}>
                            {/* Toolbar: search + filter buttons + total */}
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
                                        width: 220,
                                    }}
                                />
                                <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                                    {[
                                        { key: 'dup_bib', label: language === 'th' ? 'BIB ซ้ำ' : 'Dup BIB', bg: '#fee2e2', color: '#991b1b', border: '#f87171' },
                                        { key: 'no_bib', label: language === 'th' ? 'ไม่มี BIB' : 'No BIB', bg: '#fee2e2', color: '#991b1b', border: '#f87171' },
                                        { key: 'dup_chip', label: language === 'th' ? 'ChipCode ซ้ำ' : 'Dup Chip', bg: '#fef3c7', color: '#92400e', border: '#fbbf24' },
                                        { key: 'no_chip', label: language === 'th' ? 'ไม่มี ChipCode' : 'No Chip', bg: '#fef3c7', color: '#92400e', border: '#fbbf24' },
                                        { key: 'ready', label: language === 'th' ? 'พร้อม' : 'Ready', bg: '#dcfce7', color: '#166534', border: '#4ade80' },
                                    ].map(f => {
                                        const active = listRunnerStatus.includes(f.key);
                                        return (
                                            <button
                                                key={f.key}
                                                onClick={() => toggleListRunnerStatus(f.key)}
                                                style={{
                                                    padding: '4px 12px', fontSize: 11, fontWeight: active ? 700 : 500,
                                                    border: `1.5px solid ${active ? f.border : '#ddd'}`,
                                                    borderRadius: 4, cursor: 'pointer', transition: '0.15s',
                                                    background: active ? f.bg : '#fff',
                                                    color: active ? f.color : '#888',
                                                    whiteSpace: 'nowrap',
                                                }}
                                            >
                                                {f.label}
                                            </button>
                                        );
                                    })}
                                    {listRunnerStatus.length > 0 && (
                                        <button
                                            onClick={() => { setListRunnerStatus([]); setListPage(1); }}
                                            style={{ padding: '4px 8px', fontSize: 10, border: '1px solid #ddd', borderRadius: 4, background: '#fff', color: '#999', cursor: 'pointer' }}
                                        >
                                            ✕
                                        </button>
                                    )}
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
                                                <th style={{ width: 180 }}>Chip Code</th>
                                                <th style={{ width: 60 }}></th>
                                                <th style={{ width: 110 }}>{language === 'th' ? 'สถานะ' : 'Status'}</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {runners.map((r, idx) => {
                                                const noBib = !r.bib;
                                                const isDupBib = !!r.bib && dupBibs.includes(r.bib);
                                                const noChip = !r.chipCode;
                                                const isDupChip = !!r.chipCode && dupChips.includes(r.chipCode);
                                                const isReady = !noBib && !isDupBib && !noChip && !isDupChip;
                                                return (
                                                <tr key={r._id} style={{ background: (noBib || isDupBib) ? '#fff5f5' : (noChip || isDupChip) ? '#fffbeb' : undefined }}>
                                                    <td style={{ textAlign: 'center', color: '#999' }}>
                                                        {(listPage - 1) * listLimit + idx + 1}
                                                    </td>
                                                    <td>
                                                        <span style={{
                                                            background: noBib ? '#fee2e2' : isDupBib ? '#fef3c7' : '#eee',
                                                            padding: '2px 8px', borderRadius: 4,
                                                            fontFamily: 'monospace', fontWeight: 'bold', fontSize: 12,
                                                            border: `1px solid ${noBib ? '#f87171' : isDupBib ? '#fbbf24' : '#ddd'}`,
                                                            display: 'inline-block', minWidth: 45, textAlign: 'center',
                                                            color: noBib ? '#dc2626' : isDupBib ? '#92400e' : '#333',
                                                        }}>
                                                            {r.bib || '—'}
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
                                                        <span style={{
                                                            fontFamily: 'monospace', fontSize: 11,
                                                            color: noChip ? '#d97706' : isDupChip ? '#92400e' : '#333',
                                                            fontWeight: (noChip || isDupChip) ? 600 : 'normal',
                                                        }}>
                                                            {r.chipCode || (language === 'th' ? 'ไม่มี' : 'None')}
                                                        </span>
                                                    </td>
                                                    <td style={{ textAlign: 'center' }}>
                                                        <button
                                                            onClick={() => openEditModal(r)}
                                                            title={language === 'th' ? 'แก้ไขข้อมูล' : 'Edit'}
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
                                                    </td>
                                                    <td>
                                                        <div style={{ display: 'flex', gap: 3, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                                                            {isReady && <span style={{ fontSize: 10, fontWeight: 600, color: '#16a34a', background: '#dcfce7', padding: '1px 6px', borderRadius: 8 }}>{language === 'th' ? 'พร้อม' : 'Ready'}</span>}
                                                            {noBib && <span style={{ fontSize: 10, fontWeight: 600, color: '#991b1b', background: '#fee2e2', padding: '1px 6px', borderRadius: 8 }}>{language === 'th' ? 'ไม่มีBIB' : 'No BIB'}</span>}
                                                            {isDupBib && <span style={{ fontSize: 10, fontWeight: 600, color: '#991b1b', background: '#fee2e2', padding: '1px 6px', borderRadius: 8 }}>{language === 'th' ? 'BIBซ้ำ' : 'Dup BIB'}</span>}
                                                            {noChip && <span style={{ fontSize: 10, fontWeight: 600, color: '#92400e', background: '#fef3c7', padding: '1px 6px', borderRadius: 8 }}>{language === 'th' ? 'ไม่มีChip' : 'No Chip'}</span>}
                                                            {isDupChip && <span style={{ fontSize: 10, fontWeight: 600, color: '#92400e', background: '#fef3c7', padding: '1px 6px', borderRadius: 8 }}>{language === 'th' ? 'Chipซ้ำ' : 'Dup Chip'}</span>}
                                                        </div>
                                                    </td>
                                                </tr>
                                                );
                                            })}
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
            {/* ===== EDIT RUNNER MODAL ===== */}
            {editingRunner && (
                <div style={{
                    position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
                    background: 'rgba(0,0,0,0.45)', zIndex: 9999,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                }} onClick={() => setEditingRunner(null)}>
                    <div
                        onClick={e => e.stopPropagation()}
                        style={{
                            background: '#fff', borderRadius: 8, width: '95%', maxWidth: 700,
                            maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 8px 30px rgba(0,0,0,0.25)',
                        }}
                    >
                        {/* Modal header */}
                        <div style={{
                            padding: '14px 20px', borderBottom: '1px solid #e5e7eb',
                            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                            background: '#f9fafb', borderRadius: '8px 8px 0 0',
                        }}>
                            <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: '#333' }}>
                                {language === 'th' ? 'แก้ไขข้อมูลนักกีฬา' : 'Edit Participant'} — BIB {editingRunner.bib}
                            </h3>
                            <button onClick={() => setEditingRunner(null)} style={{
                                background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: '#999',
                                lineHeight: 1, padding: '2px 6px',
                            }}>✕</button>
                        </div>

                        {/* Modal body */}
                        <div style={{ padding: '16px 20px' }}>
                            {(() => {
                                const inputStyle: React.CSSProperties = {
                                    width: '100%', padding: '7px 10px', border: '1px solid #ddd',
                                    borderRadius: 4, fontSize: 13, fontFamily: 'inherit',
                                };
                                const labelStyle: React.CSSProperties = {
                                    fontSize: 12, fontWeight: 600, color: '#555', marginBottom: 4, display: 'block',
                                };
                                const cellStyle: React.CSSProperties = { marginBottom: 12 };

                                const fields: { key: string; label: string; labelEn: string; type?: string; options?: { v: string; l: string }[]; colSpan?: number }[] = [
                                    { key: 'bib', label: 'BIB', labelEn: 'BIB' },
                                    { key: 'firstName', label: 'ชื่อ (EN)', labelEn: 'First Name' },
                                    { key: 'lastName', label: 'นามสกุล (EN)', labelEn: 'Last Name' },
                                    { key: 'firstNameTh', label: 'ชื่อ (TH)', labelEn: 'First Name (TH)' },
                                    { key: 'lastNameTh', label: 'นามสกุล (TH)', labelEn: 'Last Name (TH)' },
                                    { key: 'gender', label: 'เพศ', labelEn: 'Gender', type: 'select', options: [{ v: 'M', l: language === 'th' ? 'ชาย' : 'Male' }, { v: 'F', l: language === 'th' ? 'หญิง' : 'Female' }] },
                                    { key: 'category', label: 'ระยะทาง', labelEn: 'Category' },
                                    { key: 'ageGroup', label: 'กลุ่มอายุ', labelEn: 'Age Group' },
                                    { key: 'birthDate', label: 'วันเกิด', labelEn: 'Birth Date', type: 'date' },
                                    { key: 'nationality', label: 'สัญชาติ', labelEn: 'Nationality' },
                                    { key: 'chipCode', label: 'Chip Code', labelEn: 'Chip Code' },
                                    { key: 'rfidTag', label: 'RFID Tag', labelEn: 'RFID Tag' },
                                    { key: 'idNo', label: 'เลขบัตรประชาชน', labelEn: 'ID No.' },
                                    { key: 'status', label: 'สถานะ', labelEn: 'Status', type: 'select', options: [
                                        { v: 'not_started', l: language === 'th' ? 'ยังไม่เริ่ม' : 'Not Started' },
                                        { v: 'in_progress', l: language === 'th' ? 'กำลังแข่ง' : 'In Progress' },
                                        { v: 'finished', l: language === 'th' ? 'เข้าเส้นชัย' : 'Finished' },
                                        { v: 'dnf', l: 'DNF' },
                                        { v: 'dns', l: 'DNS' },
                                    ]},
                                    { key: 'team', label: 'ทีม', labelEn: 'Team' },
                                    { key: 'teamName', label: 'ชื่อทีม', labelEn: 'Team Name' },
                                    { key: 'box', label: 'บ็อกซ์', labelEn: 'Box' },
                                    { key: 'shirtSize', label: 'ไซส์เสื้อ', labelEn: 'Shirt Size' },
                                    { key: 'email', label: 'อีเมล', labelEn: 'Email' },
                                    { key: 'phone', label: 'เบอร์โทร', labelEn: 'Phone' },
                                    { key: 'bloodType', label: 'กรุ๊ปเลือด', labelEn: 'Blood Type' },
                                    { key: 'emergencyContact', label: 'ผู้ติดต่อฉุกเฉิน', labelEn: 'Emergency Contact' },
                                    { key: 'emergencyPhone', label: 'เบอร์ฉุกเฉิน', labelEn: 'Emergency Phone' },
                                    { key: 'chronicDiseases', label: 'โรคประจำตัว', labelEn: 'Chronic Diseases', colSpan: 2 },
                                    { key: 'medicalInfo', label: 'ข้อมูลสุขภาพ', labelEn: 'Medical Info', colSpan: 2 },
                                    { key: 'address', label: 'ที่อยู่', labelEn: 'Address', colSpan: 2 },
                                ];

                                return (
                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 16px' }}>
                                        {fields.map(f => (
                                            <div key={f.key} style={{ ...cellStyle, gridColumn: f.colSpan === 2 ? '1 / -1' : undefined }}>
                                                <label style={labelStyle}>{language === 'th' ? f.label : f.labelEn}</label>
                                                {f.type === 'select' ? (
                                                    <select
                                                        value={editForm[f.key] || ''}
                                                        onChange={e => setEditForm(prev => ({ ...prev, [f.key]: e.target.value }))}
                                                        style={{ ...inputStyle, border: '1px solid #ccc', borderRadius: 4 }}
                                                    >
                                                        {f.options?.map(o => (
                                                            <option key={o.v} value={o.v}>{o.l}</option>
                                                        ))}
                                                    </select>
                                                ) : (
                                                    <input
                                                        type={f.type || 'text'}
                                                        value={editForm[f.key] || ''}
                                                        onChange={e => setEditForm(prev => ({ ...prev, [f.key]: e.target.value }))}
                                                        style={{
                                                            ...inputStyle,
                                                            fontFamily: (f.key === 'chipCode' || f.key === 'rfidTag') ? 'monospace' : 'inherit',
                                                        }}
                                                    />
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                );
                            })()}
                        </div>

                        {/* Modal footer */}
                        <div style={{
                            padding: '12px 20px', borderTop: '1px solid #e5e7eb',
                            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                            background: '#f9fafb', borderRadius: '0 0 8px 8px',
                        }}>
                            <button
                                onClick={handleDeleteRunner}
                                disabled={savingRunner}
                                style={{
                                    padding: '8px 18px', fontSize: 13, border: '1px solid #ef4444',
                                    borderRadius: 4, background: '#fff', color: '#dc2626',
                                    cursor: 'pointer', fontWeight: 600,
                                    opacity: savingRunner ? 0.5 : 1,
                                }}
                            >
                                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ marginRight: 5, verticalAlign: -2 }}>
                                    <polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                                </svg>
                                {language === 'th' ? 'ลบนักกีฬา' : 'Delete'}
                            </button>
                            <div style={{ display: 'flex', gap: 10 }}>
                                <button
                                    onClick={() => setEditingRunner(null)}
                                    style={{
                                        padding: '8px 20px', fontSize: 13, border: '1px solid #ddd',
                                        borderRadius: 4, background: '#fff', color: '#666',
                                        cursor: 'pointer', fontWeight: 600,
                                    }}
                                >
                                    {language === 'th' ? 'ยกเลิก' : 'Cancel'}
                                </button>
                                <button
                                    onClick={handleSaveRunner}
                                    disabled={savingRunner}
                                    style={{
                                        padding: '8px 24px', fontSize: 13, border: 'none',
                                        borderRadius: 4, background: '#00a65a', color: '#fff',
                                        cursor: 'pointer', fontWeight: 700,
                                        opacity: savingRunner ? 0.6 : 1,
                                    }}
                                >
                                    {savingRunner
                                        ? (language === 'th' ? 'กำลังบันทึก...' : 'Saving...')
                                        : (language === 'th' ? 'บันทึก' : 'Save')}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </AdminLayout>
    );
}
