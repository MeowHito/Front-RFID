'use client';

import { useEffect, useState, useCallback } from 'react';
import { useLanguage } from '@/lib/language-context';
import AdminLayout from '../AdminLayout';
import '../admin.css';

interface Campaign {
    _id: string;
    name: string;
    nameTh?: string;
    nameEn?: string;
    categories?: { name: string; distance?: string }[];
}

interface IdCardData {
    cid: string;
    titleTh: string;
    firstNameTh: string;
    lastNameTh: string;
    titleEn: string;
    firstNameEn: string;
    lastNameEn: string;
    birthDate: string;
    gender: string;
    address: string;
}

interface ReaderStatus {
    service: string;
    reader: string | null;
    readerConnected: boolean;
    cardInserted: boolean;
    mockMode: boolean;
}

interface ImportedEntry {
    bib: string;
    firstNameTh: string;
    lastNameTh: string;
    firstNameEn: string;
    lastNameEn: string;
    cid: string;
    category: string;
    gender: string;
    birthDate: string;
    savedAt: string;
}

const READER_SERVICE_URL = 'http://localhost:3005';

function calculateAge(birthDate: string): number {
    if (!birthDate) return 0;
    const birth = new Date(birthDate);
    if (isNaN(birth.getTime())) return 0;
    const today = new Date();
    let age = today.getFullYear() - birth.getFullYear();
    const m = today.getMonth() - birth.getMonth();
    if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--;
    return age;
}

function calculateAgeGroup(birthDate: string, gender: string): string {
    const age = calculateAge(birthDate);
    if (age <= 0) return '';
    const prefix = gender === 'F' ? 'F' : 'M';
    if (age < 18) return `${prefix} U18`;
    if (age < 30) return `${prefix} 18-29`;
    if (age < 40) return `${prefix} 30-39`;
    if (age < 50) return `${prefix} 40-49`;
    if (age < 60) return `${prefix} 50-59`;
    if (age < 70) return `${prefix} 60-69`;
    return `${prefix} 70+`;
}

export default function IdCardImportPage() {
    const { language } = useLanguage();

    // Campaign
    const [campaign, setCampaign] = useState<Campaign | null>(null);
    const [loading, setLoading] = useState(true);

    // Reader state
    const [readerStatus, setReaderStatus] = useState<ReaderStatus | null>(null);
    const [readerChecking, setReaderChecking] = useState(false);

    // Modal state
    const [modalStep, setModalStep] = useState<'waiting' | 'reading' | 'data' | 'error'>('waiting');
    const [cardData, setCardData] = useState<IdCardData | null>(null);
    const [modalError, setModalError] = useState('');

    // Form state
    const [selectedCategory, setSelectedCategory] = useState('');
    const [bibNumber, setBibNumber] = useState('');
    const [saving, setSaving] = useState(false);

    // Imported entries (session history)
    const [importedEntries, setImportedEntries] = useState<ImportedEntry[]>([]);

    // Toast
    const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

    const showToast = (message: string, type: 'success' | 'error') => {
        setToast({ message, type });
        setTimeout(() => setToast(null), type === 'error' ? 6000 : 3000);
    };

    // Load campaign
    useEffect(() => {
        async function loadFeatured() {
            try {
                const res = await fetch('/api/campaigns/featured', { cache: 'no-store' });
                if (!res.ok) throw new Error('No featured');
                const data = await res.json();
                if (data && data._id) {
                    setCampaign(data);
                    if (data.categories?.length > 0) {
                        setSelectedCategory(data.categories[0].name);
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

    // Check reader status
    const checkReaderStatus = useCallback(async () => {
        setReaderChecking(true);
        try {
            const res = await fetch(`${READER_SERVICE_URL}/status`, {
                signal: AbortSignal.timeout(3000),
            });
            if (!res.ok) throw new Error('Service not running');
            const data = await res.json();
            setReaderStatus(data);
        } catch {
            setReaderStatus(null);
        } finally {
            setReaderChecking(false);
        }
    }, []);

    // Poll reader status every 5 seconds
    useEffect(() => {
        checkReaderStatus();
        const interval = setInterval(checkReaderStatus, 5000);
        return () => clearInterval(interval);
    }, [checkReaderStatus]);

    // Read card from reader service
    const readCard = useCallback(async () => {
        setModalStep('reading');
        setCardData(null);
        setModalError('');
        try {
            const res = await fetch(`${READER_SERVICE_URL}/read`, {
                signal: AbortSignal.timeout(15000),
            });
            const result = await res.json();
            if (result.success) {
                setCardData(result.data);
                setModalStep('data');
            } else {
                setModalError(result.error || 'อ่านบัตรไม่สำเร็จ');
                setModalStep('error');
            }
        } catch (err) {
            setModalError(
                language === 'th'
                    ? 'ไม่สามารถเชื่อมต่อกับเครื่องอ่านบัตร กรุณาตรวจสอบว่า ID Card Reader Service กำลังทำงาน'
                    : 'Cannot connect to card reader. Please check that ID Card Reader Service is running.'
            );
            setModalStep('error');
        }
    }, [language]);



    // Save card data to database
    const handleSave = useCallback(async () => {
        if (!campaign?._id || !cardData || !selectedCategory || !bibNumber.trim()) {
            showToast(
                language === 'th'
                    ? 'กรุณากรอก BIB และเลือกประเภทการแข่งขัน'
                    : 'Please enter BIB and select a category',
                'error'
            );
            return;
        }

        setSaving(true);
        try {
            const payload = {
                eventId: campaign._id,
                bib: bibNumber.trim(),
                firstName: cardData.firstNameEn || cardData.firstNameTh,
                lastName: cardData.lastNameEn || cardData.lastNameTh,
                firstNameTh: cardData.firstNameTh,
                lastNameTh: cardData.lastNameTh,
                gender: cardData.gender === 'M' || cardData.gender === 'F' ? cardData.gender : 'M',
                category: selectedCategory,
                idNo: cardData.cid,
                birthDate: cardData.birthDate || undefined,
                nationality: 'THA',
                address: cardData.address || undefined,
                age: calculateAge(cardData.birthDate),
                ageGroup: calculateAgeGroup(cardData.birthDate, cardData.gender),
                status: 'not_started',
                sourceFile: 'id-card-reader',
            };

            const authToken = typeof window !== 'undefined' ? localStorage.getItem('auth_token') : null;
            const headers: Record<string, string> = { 'Content-Type': 'application/json' };
            if (authToken) headers['Authorization'] = `Bearer ${authToken}`;

            const res = await fetch('/api/runners', {
                method: 'POST',
                headers,
                body: JSON.stringify(payload),
            });

            if (!res.ok) {
                let errMsg = `HTTP ${res.status}`;
                try {
                    const errBody = await res.json();
                    if (errBody?.message) {
                        errMsg = Array.isArray(errBody.message) ? errBody.message.join(', ') : errBody.message;
                    }
                } catch { /* */ }
                throw new Error(errMsg);
            }

            // Success
            const entry: ImportedEntry = {
                bib: bibNumber.trim(),
                firstNameTh: cardData.firstNameTh,
                lastNameTh: cardData.lastNameTh,
                firstNameEn: cardData.firstNameEn,
                lastNameEn: cardData.lastNameEn,
                cid: cardData.cid,
                category: selectedCategory,
                gender: cardData.gender,
                birthDate: cardData.birthDate,
                savedAt: new Date().toLocaleTimeString('th-TH'),
            };
            setImportedEntries(prev => [entry, ...prev]);
            showToast(
                language === 'th'
                    ? `บันทึกสำเร็จ: BIB ${bibNumber.trim()} - ${cardData.firstNameTh} ${cardData.lastNameTh}`
                    : `Saved: BIB ${bibNumber.trim()} - ${cardData.firstNameEn} ${cardData.lastNameEn}`,
                'success'
            );
            setCardData(null);
            setBibNumber('');
        } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : 'Unknown error';
            showToast(
                language === 'th' ? `บันทึกไม่สำเร็จ: ${msg}` : `Save failed: ${msg}`,
                'error'
            );
        } finally {
            setSaving(false);
        }
    }, [campaign, cardData, selectedCategory, bibNumber, language]);

    // ─── Render ──────────────────────────────────────────────────

    return (
        <AdminLayout
            breadcrumbItems={[
                { label: 'นำเข้าด้วยบัตรประชาชน', labelEn: 'ID Card Import' }
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
                    {/* Reader Status Banner */}
                    <div className="content-box" style={{ padding: '16px 20px', marginBottom: 16 }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                                <div style={{
                                    width: 12, height: 12, borderRadius: '50%',
                                    background: readerStatus?.readerConnected ? '#22c55e' : readerStatus?.service === 'running' ? '#f59e0b' : '#ef4444',
                                    boxShadow: readerStatus?.readerConnected ? '0 0 8px rgba(34,197,94,0.5)' : 'none',
                                    animation: readerStatus?.readerConnected ? 'pulse 2s infinite' : 'none',
                                }} />
                                <div>
                                    <div style={{ fontWeight: 600, fontSize: 14, color: '#1e293b' }}>
                                        {language === 'th' ? 'สถานะเครื่องอ่านบัตร' : 'Card Reader Status'}
                                    </div>
                                    <div style={{ fontSize: 12, color: '#64748b' }}>
                                        {!readerStatus ? (
                                            language === 'th'
                                                ? '❌ ID Card Reader Service ไม่ทำงาน — กรุณารัน: cd id-card-reader && node server.js'
                                                : '❌ ID Card Reader Service is not running — run: cd id-card-reader && node server.js'
                                        ) : !readerStatus.readerConnected ? (
                                            readerStatus.mockMode
                                                ? (language === 'th' ? '⚠️ โหมดทดสอบ (Mock Mode) — ใช้ข้อมูลตัวอย่าง' : '⚠️ Mock Mode — using sample data')
                                                : (language === 'th' ? '⚠️ ไม่พบเครื่องอ่านบัตร — กรุณาเสียบเครื่องอ่าน' : '⚠️ No reader detected — please connect reader')
                                        ) : readerStatus.cardInserted ? (
                                            language === 'th' ? '✅ พร้อมอ่านบัตร — มีบัตรอยู่ในเครื่องอ่าน' : '✅ Ready — card is in the reader'
                                        ) : (
                                            language === 'th' ? '✅ เครื่องอ่านพร้อม — รอเสียบบัตร' : '✅ Reader ready — waiting for card'
                                        )}
                                    </div>
                                    {readerStatus?.reader && (
                                        <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>
                                            Reader: {readerStatus.reader}
                                        </div>
                                    )}
                                </div>
                            </div>
                            <button
                                onClick={checkReaderStatus}
                                disabled={readerChecking}
                                style={{
                                    padding: '6px 14px', borderRadius: 6, border: '1px solid #d1d5db',
                                    background: '#f8fafc', cursor: 'pointer', fontSize: 12,
                                    color: '#475569', fontWeight: 500,
                                    opacity: readerChecking ? 0.6 : 1,
                                }}
                            >
                                {readerChecking ? '...' : (language === 'th' ? '🔄 ตรวจสอบ' : '🔄 Check')}
                            </button>
                        </div>
                    </div>

                    {/* Main Action Area */}
                    <div className="content-box" style={{ padding: '24px', marginBottom: 16 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 16, flexWrap: 'wrap' }}>
                            <div style={{ flex: 1, minWidth: 200 }}>
                                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#64748b', marginBottom: 4 }}>
                                    {language === 'th' ? 'ประเภทการแข่งขัน' : 'Category'}
                                </label>
                                <select
                                    value={selectedCategory}
                                    onChange={(e) => setSelectedCategory(e.target.value)}
                                    style={{
                                        width: '100%', padding: '8px 12px', borderRadius: 6,
                                        border: '1px solid #d1d5db', fontSize: 14, background: '#fff',
                                    }}
                                >
                                    {(campaign.categories || []).map(cat => (
                                        <option key={cat.name} value={cat.name}>{cat.name}{cat.distance ? ` (${cat.distance})` : ''}</option>
                                    ))}
                                </select>
                            </div>

                            <div style={{ paddingTop: 20 }}>
                                <button
                                    onClick={readCard}
                                    disabled={!readerStatus || modalStep === 'reading'}
                                    style={{
                                        padding: '12px 28px', borderRadius: 8, border: 'none',
                                        background: (readerStatus && modalStep !== 'reading') ? 'linear-gradient(135deg, #3b82f6, #2563eb)' : '#94a3b8',
                                        color: '#fff', fontWeight: 700, fontSize: 15,
                                        cursor: (readerStatus && modalStep !== 'reading') ? 'pointer' : 'not-allowed',
                                        boxShadow: readerStatus ? '0 4px 14px rgba(59,130,246,0.35)' : 'none',
                                        transition: 'all 0.2s',
                                        display: 'flex', alignItems: 'center', gap: 8,
                                    }}
                                >
                                    {modalStep === 'reading' ? (
                                        <>
                                            <div style={{
                                                width: 18, height: 18,
                                                border: '3px solid rgba(255,255,255,0.3)', borderTopColor: '#fff',
                                                borderRadius: '50%', animation: 'spin 1s linear infinite',
                                            }} />
                                            {language === 'th' ? 'กำลังอ่าน...' : 'Reading...'}
                                        </>
                                    ) : (
                                        <>
                                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                                <rect x="2" y="5" width="20" height="14" rx="2" />
                                                <line x1="2" y1="10" x2="22" y2="10" />
                                            </svg>
                                            {language === 'th' ? 'อ่านบัตรประชาชน' : 'Read ID Card'}
                                        </>
                                    )}
                                </button>
                            </div>
                        </div>

                        {!readerStatus && (
                            <div style={{
                                padding: '16px 20px', borderRadius: 8,
                                background: '#fef3c7', border: '1px solid #fde68a',
                                fontSize: 13, color: '#92400e',
                            }}>
                                <strong>{language === 'th' ? '⚠️ ก่อนใช้งาน:' : '⚠️ Before using:'}</strong>
                                <ol style={{ margin: '8px 0 0', paddingLeft: 20 }}>
                                    <li>{language === 'th' ? 'เปิด Terminal / Command Prompt ใหม่' : 'Open a new Terminal / Command Prompt'}</li>
                                    <li style={{ fontFamily: 'monospace', background: '#fef9c3', padding: '2px 6px', borderRadius: 4 }}>
                                        cd id-card-reader &amp;&amp; npm install &amp;&amp; node server.js
                                    </li>
                                    <li>{language === 'th' ? 'เสียบเครื่องอ่านบัตรเข้า USB' : 'Connect card reader via USB'}</li>
                                </ol>
                            </div>
                        )}

                        {/* Error message */}
                        {modalStep === 'error' && (
                            <div style={{
                                padding: '16px 20px', borderRadius: 8, marginTop: 16,
                                background: '#fef2f2', border: '1px solid #fecaca',
                                display: 'flex', alignItems: 'center', gap: 12,
                            }}>
                                <span style={{ fontSize: 24 }}>❌</span>
                                <div style={{ flex: 1 }}>
                                    <div style={{ fontSize: 14, color: '#dc2626', fontWeight: 600 }}>{modalError}</div>
                                    <button
                                        onClick={readCard}
                                        style={{
                                            marginTop: 8, padding: '6px 16px', borderRadius: 6,
                                            border: '1px solid #d1d5db', background: '#fff',
                                            cursor: 'pointer', fontSize: 12, fontWeight: 600, color: '#475569',
                                        }}
                                    >
                                        {language === 'th' ? 'ลองอ่านใหม่' : 'Try Again'}
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* ─── Card Data Display (always visible when data exists) ─── */}
                    <div className="content-box" style={{ padding: '24px', marginBottom: 16 }}>
                        <h3 style={{ margin: '0 0 16px', fontSize: 16, fontWeight: 700, color: '#1e293b', display: 'flex', alignItems: 'center', gap: 8 }}>
                            💳 {language === 'th' ? 'ข้อมูลจากบัตรประชาชน' : 'ID Card Data'}
                        </h3>

                        {!cardData ? (
                            <div style={{
                                textAlign: 'center', padding: '40px 20px',
                                background: '#f8fafc', borderRadius: 12, border: '2px dashed #e2e8f0',
                            }}>
                                <div style={{ fontSize: 48, marginBottom: 12, opacity: 0.5 }}>💳</div>
                                <p style={{ fontSize: 15, color: '#94a3b8', fontWeight: 500 }}>
                                    {modalStep === 'reading'
                                        ? (language === 'th' ? 'กำลังอ่านข้อมูลจากบัตร... กรุณาอย่าถอดบัตรออก' : 'Reading card data... Please do not remove the card')
                                        : (language === 'th' ? 'กดปุ่ม "อ่านบัตรประชาชน" ด้านบนเพื่อเริ่มอ่านข้อมูล' : 'Press "Read ID Card" button above to start reading')
                                    }
                                </p>
                                {modalStep === 'reading' && (
                                    <div style={{
                                        width: 40, height: 40, margin: '16px auto 0',
                                        border: '4px solid #e2e8f0', borderTopColor: '#3b82f6',
                                        borderRadius: '50%', animation: 'spin 1s linear infinite',
                                    }} />
                                )}
                            </div>
                        ) : (
                            <>
                                {/* All data fields in a grid */}
                                <div style={{
                                    background: '#f8fafc', borderRadius: 12, padding: 20,
                                    border: '1px solid #e2e8f0', marginBottom: 20,
                                }}>
                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px 24px' }}>
                                        {/* CID */}
                                        <div style={{ gridColumn: '1 / -1' }}>
                                            <label style={{ fontSize: 11, fontWeight: 600, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                                                {language === 'th' ? 'เลขบัตรประชาชน' : 'Citizen ID'}
                                            </label>
                                            <div style={{ fontSize: 20, fontWeight: 700, color: '#1e40af', fontFamily: 'monospace', letterSpacing: 2, marginTop: 4 }}>
                                                {cardData.cid ? `${cardData.cid.substring(0, 1)}-${cardData.cid.substring(1, 5)}-${cardData.cid.substring(5, 10)}-${cardData.cid.substring(10, 12)}-${cardData.cid.substring(12)}` : '-'}
                                            </div>
                                        </div>

                                        {/* Thai Title */}
                                        <div>
                                            <label style={{ fontSize: 11, fontWeight: 600, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                                                {language === 'th' ? 'คำนำหน้า (ไทย)' : 'Title (TH)'}
                                            </label>
                                            <div style={{ fontSize: 15, fontWeight: 600, color: '#1e293b', marginTop: 2 }}>
                                                {cardData.titleTh || '-'}
                                            </div>
                                        </div>

                                        {/* English Title */}
                                        <div>
                                            <label style={{ fontSize: 11, fontWeight: 600, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                                                {language === 'th' ? 'คำนำหน้า (อังกฤษ)' : 'Title (EN)'}
                                            </label>
                                            <div style={{ fontSize: 15, color: '#475569', marginTop: 2 }}>
                                                {cardData.titleEn || '-'}
                                            </div>
                                        </div>

                                        {/* First Name TH */}
                                        <div>
                                            <label style={{ fontSize: 11, fontWeight: 600, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                                                {language === 'th' ? 'ชื่อ (ไทย)' : 'First Name (TH)'}
                                            </label>
                                            <div style={{ fontSize: 16, fontWeight: 600, color: '#1e293b', marginTop: 2 }}>
                                                {cardData.firstNameTh || '-'}
                                            </div>
                                        </div>

                                        {/* First Name EN */}
                                        <div>
                                            <label style={{ fontSize: 11, fontWeight: 600, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                                                {language === 'th' ? 'ชื่อ (อังกฤษ)' : 'First Name (EN)'}
                                            </label>
                                            <div style={{ fontSize: 15, color: '#475569', marginTop: 2 }}>
                                                {cardData.firstNameEn || '-'}
                                            </div>
                                        </div>

                                        {/* Last Name TH */}
                                        <div>
                                            <label style={{ fontSize: 11, fontWeight: 600, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                                                {language === 'th' ? 'นามสกุล (ไทย)' : 'Last Name (TH)'}
                                            </label>
                                            <div style={{ fontSize: 16, fontWeight: 600, color: '#1e293b', marginTop: 2 }}>
                                                {cardData.lastNameTh || '-'}
                                            </div>
                                        </div>

                                        {/* Last Name EN */}
                                        <div>
                                            <label style={{ fontSize: 11, fontWeight: 600, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                                                {language === 'th' ? 'นามสกุล (อังกฤษ)' : 'Last Name (EN)'}
                                            </label>
                                            <div style={{ fontSize: 15, color: '#475569', marginTop: 2 }}>
                                                {cardData.lastNameEn || '-'}
                                            </div>
                                        </div>

                                        {/* Birth Date */}
                                        <div>
                                            <label style={{ fontSize: 11, fontWeight: 600, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                                                {language === 'th' ? 'วันเกิด' : 'Birth Date'}
                                            </label>
                                            <div style={{ fontSize: 15, color: '#475569', marginTop: 2 }}>
                                                {cardData.birthDate || '-'}
                                                {cardData.birthDate && (
                                                    <span style={{
                                                        fontSize: 12, color: '#3b82f6', marginLeft: 8,
                                                        background: '#eff6ff', padding: '2px 8px', borderRadius: 10, fontWeight: 600,
                                                    }}>
                                                        {language === 'th' ? 'อายุ' : 'Age'} {calculateAge(cardData.birthDate)} {language === 'th' ? 'ปี' : 'yrs'}
                                                    </span>
                                                )}
                                            </div>
                                        </div>

                                        {/* Gender */}
                                        <div>
                                            <label style={{ fontSize: 11, fontWeight: 600, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                                                {language === 'th' ? 'เพศ' : 'Gender'}
                                            </label>
                                            <div style={{ marginTop: 2 }}>
                                                <span style={{
                                                    padding: '4px 14px', borderRadius: 10, fontSize: 13, fontWeight: 600,
                                                    background: cardData.gender === 'M' ? '#dbeafe' : '#fce7f3',
                                                    color: cardData.gender === 'M' ? '#1d4ed8' : '#be185d',
                                                }}>
                                                    {cardData.gender === 'M' ? (language === 'th' ? 'ชาย' : 'Male') : (language === 'th' ? 'หญิง' : 'Female')}
                                                </span>
                                            </div>
                                        </div>

                                        {/* Age Group */}
                                        <div>
                                            <label style={{ fontSize: 11, fontWeight: 600, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                                                {language === 'th' ? 'กลุ่มอายุ' : 'Age Group'}
                                            </label>
                                            <div style={{ fontSize: 14, color: '#475569', marginTop: 2, fontWeight: 600 }}>
                                                {calculateAgeGroup(cardData.birthDate, cardData.gender) || '-'}
                                            </div>
                                        </div>

                                        {/* Address - full width */}
                                        <div style={{ gridColumn: '1 / -1' }}>
                                            <label style={{ fontSize: 11, fontWeight: 600, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                                                {language === 'th' ? 'ที่อยู่' : 'Address'}
                                            </label>
                                            <div style={{ fontSize: 14, color: '#475569', lineHeight: 1.6, marginTop: 2 }}>
                                                {cardData.address || '-'}
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                {/* BIB & Category Input */}
                                <div style={{
                                    display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 20,
                                    background: '#fffbeb', borderRadius: 12, padding: 16, border: '1px solid #fde68a',
                                }}>
                                    <div>
                                        <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#92400e', marginBottom: 4 }}>
                                            {language === 'th' ? 'หมายเลข BIB *' : 'BIB Number *'}
                                        </label>
                                        <input
                                            type="text"
                                            value={bibNumber}
                                            onChange={(e) => setBibNumber(e.target.value)}
                                            placeholder="e.g. 001"
                                            style={{
                                                width: '100%', padding: '10px 14px', borderRadius: 8,
                                                border: '2px solid #f59e0b', fontSize: 18, fontWeight: 700,
                                                outline: 'none', boxSizing: 'border-box',
                                                background: '#fff',
                                            }}
                                            autoFocus
                                        />
                                    </div>
                                    <div>
                                        <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#92400e', marginBottom: 4 }}>
                                            {language === 'th' ? 'ประเภทการแข่งขัน' : 'Category'}
                                        </label>
                                        <select
                                            value={selectedCategory}
                                            onChange={(e) => setSelectedCategory(e.target.value)}
                                            style={{
                                                width: '100%', padding: '10px 14px', borderRadius: 8,
                                                border: '1px solid #d1d5db', fontSize: 14, background: '#fff',
                                                boxSizing: 'border-box',
                                            }}
                                        >
                                            {(campaign?.categories || []).map(cat => (
                                                <option key={cat.name} value={cat.name}>{cat.name}{cat.distance ? ` (${cat.distance})` : ''}</option>
                                            ))}
                                        </select>
                                    </div>
                                </div>

                                {/* Action Buttons */}
                                <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
                                    <button
                                        onClick={() => { setCardData(null); setModalStep('waiting'); setBibNumber(''); }}
                                        style={{
                                            padding: '10px 20px', borderRadius: 8,
                                            border: '1px solid #d1d5db', background: '#fff',
                                            cursor: 'pointer', fontSize: 14, fontWeight: 600,
                                            color: '#475569',
                                        }}
                                    >
                                        {language === 'th' ? '🔄 อ่านใหม่' : '🔄 Read Again'}
                                    </button>
                                    <button
                                        onClick={handleSave}
                                        disabled={saving || !bibNumber.trim()}
                                        style={{
                                            padding: '10px 28px', borderRadius: 8, border: 'none',
                                            background: (!saving && bibNumber.trim())
                                                ? 'linear-gradient(135deg, #22c55e, #16a34a)' : '#94a3b8',
                                            color: '#fff', fontWeight: 700, fontSize: 15,
                                            cursor: (!saving && bibNumber.trim()) ? 'pointer' : 'not-allowed',
                                            boxShadow: (!saving && bibNumber.trim()) ? '0 4px 14px rgba(34,197,94,0.35)' : 'none',
                                            display: 'flex', alignItems: 'center', gap: 8,
                                        }}
                                    >
                                        {saving ? (
                                            <>{language === 'th' ? 'กำลังบันทึก...' : 'Saving...'}</>
                                        ) : (
                                            <>
                                                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                                    <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
                                                    <polyline points="17 21 17 13 7 13 7 21" />
                                                    <polyline points="7 3 7 8 15 8" />
                                                </svg>
                                                {language === 'th' ? 'บันทึก' : 'Save'}
                                            </>
                                        )}
                                    </button>
                                </div>
                            </>
                        )}
                    </div>

                    {/* Imported Entries Table */}
                    {importedEntries.length > 0 && (
                        <div className="content-box" style={{ padding: '20px' }}>
                            <h3 style={{ margin: '0 0 12px', fontSize: 15, fontWeight: 700, color: '#1e293b' }}>
                                {language === 'th'
                                    ? `📋 นำเข้าแล้ว ${importedEntries.length} รายการ (เซสชันนี้)`
                                    : `📋 Imported ${importedEntries.length} entries (this session)`}
                            </h3>
                            <div style={{ overflowX: 'auto' }}>
                                <table className="data-table" style={{ width: '100%', fontSize: 13 }}>
                                    <thead>
                                        <tr>
                                            <th>#</th>
                                            <th>BIB</th>
                                            <th>{language === 'th' ? 'ชื่อ (TH)' : 'Name (TH)'}</th>
                                            <th>{language === 'th' ? 'ชื่อ (EN)' : 'Name (EN)'}</th>
                                            <th>{language === 'th' ? 'เลขบัตร' : 'CID'}</th>
                                            <th>{language === 'th' ? 'ประเภท' : 'Category'}</th>
                                            <th>{language === 'th' ? 'เพศ' : 'Gender'}</th>
                                            <th>{language === 'th' ? 'เวลา' : 'Time'}</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {importedEntries.map((entry, idx) => (
                                            <tr key={idx}>
                                                <td>{importedEntries.length - idx}</td>
                                                <td style={{ fontWeight: 700, color: '#2563eb' }}>{entry.bib}</td>
                                                <td>{entry.firstNameTh} {entry.lastNameTh}</td>
                                                <td>{entry.firstNameEn} {entry.lastNameEn}</td>
                                                <td style={{ fontFamily: 'monospace', fontSize: 12 }}>
                                                    {entry.cid ? `${entry.cid.substring(0, 1)}-${entry.cid.substring(1, 5)}-${entry.cid.substring(5, 10)}-${entry.cid.substring(10, 12)}-${entry.cid.substring(12)}` : '-'}
                                                </td>
                                                <td>{entry.category}</td>
                                                <td>
                                                    <span style={{
                                                        padding: '2px 8px', borderRadius: 10, fontSize: 11, fontWeight: 600,
                                                        background: entry.gender === 'M' ? '#dbeafe' : '#fce7f3',
                                                        color: entry.gender === 'M' ? '#1d4ed8' : '#be185d',
                                                    }}>
                                                        {entry.gender === 'M' ? (language === 'th' ? 'ชาย' : 'Male') : (language === 'th' ? 'หญิง' : 'Female')}
                                                    </span>
                                                </td>
                                                <td style={{ fontSize: 12, color: '#64748b' }}>{entry.savedAt}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}
                </>
            )}

            {/* Inline CSS for animations */}
            <style>{`
                @keyframes spin {
                    to { transform: rotate(360deg); }
                }
                @keyframes pulse {
                    0%, 100% { opacity: 1; }
                    50% { opacity: 0.5; }
                }
            `}</style>
        </AdminLayout>
    );
}
