'use client';

import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useLanguage } from '@/lib/language-context';
import ImageCropModal from '@/components/ImageCropModal';
import AdminLayout from '../../AdminLayout';

interface RaceCategory {
    name: string;
    distance: string;
    startTime: string;
    cutoff: string;
    elevation: string;
    raceType: string;
    badgeColor: string;
    status: string;
    remoteEventNo?: string;
    itra: number | string;
    utmbIndex: string;
}

interface CreateEventForm {
    name: string;
    shortName: string;
    description: string;
    eventDate: string;
    location: string;
    pictureUrl: string;
    organizerName: string;
    organizerContact: string;
    organizerPhone: string;
    organizerEmail: string;
    organizerWebsite: string;
    eventManager: string;
    themeType: string;
    status: string;
    allowRFIDSync: boolean;
    rfidToken: string;
    raceId: string;
    partnerCode: string;
    raceTigerBaseUrl: string;
    categories: RaceCategory[];
}

const THEME_OPTIONS = [
    { value: 'utmb', label: 'UTMB Series (แดง)', labelEn: 'UTMB Series (Red)' },
    { value: 'trail', label: 'Trail Master (เขียว)', labelEn: 'Trail Master (Green)' },
    { value: 'road', label: 'Road Marathon (น้ำเงิน)', labelEn: 'Road Marathon (Blue)' },
];

function CreateEventForm() {
    const { language } = useLanguage();
    const router = useRouter();
    const searchParams = useSearchParams();
    const editId = searchParams.get('edit');
    const isEdit = !!editId;

    const [saving, setSaving] = useState(false);
    const [toastMessage, setToastMessage] = useState<string | null>(null);
    const [cropModalOpen, setCropModalOpen] = useState(false);
    const [rawImage, setRawImage] = useState<string>('');
    const [loadingEdit, setLoadingEdit] = useState(false);
    const [raceTigerUrl, setRaceTigerUrl] = useState('');

    const normalizeStartTime = (value: string | undefined): string => {
        const raw = (value || '').trim();
        if (!raw) return '';

        // Already in datetime-local format (YYYY-MM-DDThh:mm)
        if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(raw)) {
            return raw.slice(0, 16);
        }

        // Full ISO date with time (e.g. 2025-02-15T06:00:00.000Z)
        const parsed = new Date(raw);
        if (!Number.isNaN(parsed.getTime())) {
            const yyyy = parsed.getFullYear();
            const MM = String(parsed.getMonth() + 1).padStart(2, '0');
            const dd = String(parsed.getDate()).padStart(2, '0');
            const hh = String(parsed.getHours()).padStart(2, '0');
            const mm = String(parsed.getMinutes()).padStart(2, '0');
            return `${yyyy}-${MM}-${dd}T${hh}:${mm}`;
        }

        // Time-only (hh:mm) — no date info
        const m = raw.match(/(\d{1,2}):(\d{2})/);
        if (m) return `${m[1].padStart(2, '0')}:${m[2]}`;

        return '';
    };

    const [form, setForm] = useState<CreateEventForm>({
        name: '',
        shortName: '',
        description: '',
        eventDate: '',
        location: '',
        pictureUrl: '',
        organizerName: '',
        organizerContact: '',
        organizerPhone: '',
        organizerEmail: '',
        organizerWebsite: '',
        eventManager: '',
        themeType: 'utmb',
        status: 'upcoming',
        allowRFIDSync: false,
        rfidToken: '',
        raceId: '',
        partnerCode: '',
        raceTigerBaseUrl: '',
        categories: [],
    });

    // Load campaign data when editing
    useEffect(() => {
        if (!editId) return;
        setLoadingEdit(true);
        fetch(`/api/campaigns/${editId}`)
            .then(res => res.json())
            .then(data => {
                const campaign = data;
                setForm({
                    name: campaign.name || '',
                    shortName: campaign.shortName || '',
                    description: campaign.description || '',
                    eventDate: campaign.eventDate ? campaign.eventDate.slice(0, 10) : '',
                    location: campaign.location || '',
                    pictureUrl: campaign.pictureUrl || '',
                    organizerName: campaign.organizerName || '',
                    organizerContact: campaign.organizerContact || '',
                    organizerPhone: campaign.organizerPhone || '',
                    organizerEmail: campaign.organizerEmail || '',
                    organizerWebsite: campaign.organizerWebsite || '',
                    eventManager: campaign.eventManager || '',
                    themeType: campaign.themeType || 'utmb',
                    status: campaign.status || 'upcoming',
                    allowRFIDSync: campaign.allowRFIDSync ?? false,
                    rfidToken: campaign.rfidToken || '',
                    raceId: campaign.raceId || '',
                    partnerCode: campaign.partnerCode || '',
                    raceTigerBaseUrl: campaign.raceTigerBaseUrl || '',
                    categories: (campaign.categories || []).map((cat: RaceCategory) => ({
                        name: cat.name || '',
                        distance: cat.distance || '',
                        startTime: normalizeStartTime(cat.startTime),
                        cutoff: cat.cutoff || '',
                        elevation: cat.elevation || '',
                        raceType: cat.raceType || '',
                        badgeColor: cat.badgeColor || '#dc2626',
                        status: cat.status || 'live',
                        remoteEventNo: cat.remoteEventNo || '',
                        itra: cat.itra ?? '',
                        utmbIndex: cat.utmbIndex || '',
                    })),
                });
                if (campaign.rfidToken && campaign.raceId) {
                    const base = campaign.raceTigerBaseUrl || 'https://wx.racetigertiming.com';
                    const pc = campaign.partnerCode || '000001';
                    const reconstructed = `${base}/Dif/bio?pc=${pc}&rid=${campaign.raceId}&token=${campaign.rfidToken}&page=1`;
                    setRaceTigerUrl(reconstructed);
                }
            })
            .catch(err => console.error('Failed to load campaign:', err))
            .finally(() => setLoadingEdit(false));
    }, [editId]);

    const updateField = (field: keyof CreateEventForm, value: string | boolean) => {
        setForm(prev => ({ ...prev, [field]: value }));
    };

    // Category management
    const addCategory = () => {
        setForm(prev => ({
            ...prev,
            categories: [...prev.categories, {
                name: '', distance: '', startTime: '', cutoff: '',
                elevation: '', raceType: '', badgeColor: '#dc2626',
                status: 'live', remoteEventNo: '', itra: '', utmbIndex: '',
            }]
        }));
    };

    const removeCategory = (idx: number) => {
        setForm(prev => ({
            ...prev,
            categories: prev.categories.filter((_, i) => i !== idx)
        }));
    };

    const handleRaceTigerUrlPaste = (url: string) => {
        setRaceTigerUrl(url);
        if (!url.trim()) return;
        try {
            const parsed = new URL(url.trim());
            const rid = parsed.searchParams.get('rid');
            const token = parsed.searchParams.get('token');
            const pc = parsed.searchParams.get('pc');
            // Extract base URL (e.g. https://wx.racetigertiming.com)
            const baseUrl = `${parsed.protocol}//${parsed.hostname}`;
            if (rid || token || pc) {
                setForm(prev => ({
                    ...prev,
                    ...(rid ? { raceId: rid } : {}),
                    ...(token ? { rfidToken: token } : {}),
                    ...(pc ? { partnerCode: pc } : {}),
                    raceTigerBaseUrl: baseUrl,
                    allowRFIDSync: true,
                }));
            }
        } catch {
            // not a valid URL, ignore
        }
    };

    const updateCategory = (idx: number, field: keyof RaceCategory, value: string | number) => {
        setForm(prev => ({
            ...prev,
            categories: prev.categories.map((cat, i) =>
                i === idx ? { ...cat, [field]: value } : cat
            )
        }));
    };

    // Image upload — open interactive crop modal
    const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = (ev) => {
                setRawImage(ev.target?.result as string);
                setCropModalOpen(true);
            };
            reader.readAsDataURL(file);
        }
        // Reset input so same file can be selected again
        e.target.value = '';
    };

    // Save
    const handleSave = async () => {
        if (!form.name || !form.eventDate || !form.location) {
            setToastMessage(language === 'th' ? 'กรุณากรอกชื่อ วันที่ และสถานที่' : 'Please fill in name, date, and location');
            setTimeout(() => setToastMessage(null), 3000);
            return;
        }

        if (form.allowRFIDSync && (!form.rfidToken.trim() || !form.raceId.trim())) {
            setToastMessage(language === 'th' ? 'กรุณากรอก RFID Token และ Race ID' : 'Please provide RFID token and Race ID');
            setTimeout(() => setToastMessage(null), 3000);
            return;
        }

        setSaving(true);
        try {
            // Send pictureUrl (base64 is OK — body limit is 10MB)
            const pictureUrl = form.pictureUrl || undefined;
            // Clean up categories: convert itra to number, filter out empty entries
            const cleanCategories = form.categories
                .filter(cat => cat.name || cat.distance) // skip totally empty rows
                .map(cat => ({
                    name: cat.name || 'Unnamed',
                    distance: cat.distance || '0 KM',
                    startTime: cat.startTime || '06:00',
                    cutoff: cat.cutoff || '-',
                    badgeColor: cat.badgeColor || '#dc2626',
                    ...(cat.elevation && { elevation: cat.elevation }),
                    ...(cat.raceType && { raceType: cat.raceType }),
                    ...(cat.status && { status: cat.status }),
                    ...(cat.remoteEventNo?.trim() && { remoteEventNo: cat.remoteEventNo.trim() }),
                    ...(cat.itra && { itra: Number(cat.itra) || undefined }),
                    ...(cat.utmbIndex && { utmbIndex: cat.utmbIndex }),
                }));
            const payload: Record<string, unknown> = {
                name: form.name,
                eventDate: form.eventDate,
            };
            if (form.shortName) payload.shortName = form.shortName;
            if (form.description) payload.description = form.description;
            if (form.location) payload.location = form.location;
            if (pictureUrl) payload.pictureUrl = pictureUrl;
            if (form.organizerName) payload.organizerName = form.organizerName;
            if (form.status) payload.status = form.status;
            payload.allowRFIDSync = form.allowRFIDSync;
            if (form.rfidToken.trim()) payload.rfidToken = form.rfidToken.trim();
            if (form.raceId.trim()) payload.raceId = form.raceId.trim();
            if (form.partnerCode.trim()) payload.partnerCode = form.partnerCode.trim();
            if (form.raceTigerBaseUrl.trim()) payload.raceTigerBaseUrl = form.raceTigerBaseUrl.trim();
            if (cleanCategories.length > 0) payload.categories = cleanCategories;
            // Use API proxy route to work on both localhost and Vercel
            const url = isEdit ? `/api/campaigns/${editId}` : '/api/campaigns';
            const method = isEdit ? 'PUT' : 'POST';
            const res = await fetch(url, {
                method,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            });
            if (!res.ok) {
                const errData = await res.json().catch(() => ({}));
                console.error('Backend error:', errData);
                throw new Error(`Failed: ${res.status}`);
            }
            setToastMessage(language === 'th'
                ? (isEdit ? 'บันทึกการแก้ไขสำเร็จ!' : 'สร้างกิจกรรมสำเร็จ!')
                : (isEdit ? 'Changes saved!' : 'Event created successfully!'));
            setTimeout(() => {
                router.push('/admin/events');
            }, 1500);
        } catch (error) {
            console.error('Failed to save event:', error);
            setToastMessage(language === 'th' ? 'เกิดข้อผิดพลาด' : 'Failed to save event');
        } finally {
            setSaving(false);
            setTimeout(() => setToastMessage(null), 3000);
        }
    };

    if (loadingEdit) {
        return (
            <AdminLayout
                breadcrumbItems={[
                    { label: 'อีเวนท์', labelEn: 'Events', href: '/admin/events' },
                    { label: 'กำลังโหลด...', labelEn: 'Loading...' }
                ]}
                pageTitle=""
            >
                <div className="text-center py-16 text-gray-400">
                    {language === 'th' ? 'กำลังโหลดข้อมูล...' : 'Loading data...'}
                </div>
            </AdminLayout>
        );
    }

    return (
        <AdminLayout
            breadcrumbItems={[
                { label: 'อีเวนท์', labelEn: 'Events', href: '/admin/events' },
                { label: isEdit ? 'แก้ไขกิจกรรม' : 'สร้างกิจกรรมใหม่', labelEn: isEdit ? 'Edit Event' : 'Create New Event' }
            ]}
        >
            <div className="admin-card">
                {/* Page Header */}
                <div className="create-event-header">
                    <h1 className="create-event-title">
                        {language === 'th'
                            ? (isEdit ? 'แก้ไขกิจกรรม' : 'สร้างกิจกรรมใหม่')
                            : (isEdit ? 'Edit Event' : 'Create New Event')
                        }
                    </h1>
                    <div className="create-event-actions">
                        <button className="btn-ce btn-ce-cancel" onClick={() => router.push('/admin/events')}>
                            {language === 'th' ? 'ยกเลิก' : 'Cancel'}
                        </button>
                        <button className="btn-ce btn-ce-save" onClick={handleSave} disabled={saving}>
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
                                <polyline points="17 21 17 13 7 13 7 21" />
                                <polyline points="7 3 7 8 15 8" />
                            </svg>
                            {saving
                                ? (language === 'th' ? 'กำลังบันทึก...' : 'Saving...')
                                : (language === 'th' ? 'บันทึกกิจกรรม' : 'Save Event')
                            }
                        </button>
                    </div>
                </div>

                {/* Card 1: Images & Media (Warning/Yellow) */}
                <div className="ce-card ce-card-warning">
                    <div className="ce-card-header">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#f39c12" strokeWidth="2">
                            <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                            <circle cx="8.5" cy="8.5" r="1.5" />
                            <polyline points="21 15 16 10 5 21" />
                        </svg>
                        <span>{language === 'th' ? 'รูปภาพและสื่อ (Images & Media)' : 'Images & Media'}</span>
                    </div>
                    <div className="ce-form-grid">
                        <div className="ce-form-group">
                            <label className="ce-label">
                                {language === 'th' ? 'ภาพหน้าปกกิจกรรม' : 'Event Cover Image'}
                            </label>
                            <div
                                className="ce-upload-box"
                                onClick={() => document.getElementById('cover-upload')?.click()}
                                style={{ aspectRatio: '16/8', minHeight: 'auto', padding: form.pictureUrl ? 0 : 20 }}
                            >
                                {form.pictureUrl ? (
                                    <img src={form.pictureUrl} alt="Cover" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                ) : (
                                    <>
                                        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#bbb" strokeWidth="2">
                                            <polyline points="16 16 12 12 8 16" />
                                            <line x1="12" y1="12" x2="12" y2="21" />
                                            <path d="M20.39 18.39A5 5 0 0 0 18 9h-1.26A8 8 0 1 0 3 16.3" />
                                        </svg>
                                        <span>{language === 'th' ? 'คลิกอัปโหลดรูปหน้าปก (16:8)' : 'Click to upload cover (16:8)'}</span>
                                    </>
                                )}
                            </div>
                            <input id="cover-upload" type="file" accept="image/*" style={{ display: 'none' }} onChange={handleImageUpload} />
                        </div>

                    </div>
                </div>

                {/* Card 2: General Info (Info/Blue) */}
                <div className="ce-card ce-card-info">
                    <div className="ce-card-header">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#00c0ef" strokeWidth="2">
                            <circle cx="12" cy="12" r="10" />
                            <line x1="12" y1="16" x2="12" y2="12" />
                            <line x1="12" y1="8" x2="12.01" y2="8" />
                        </svg>
                        <span>{language === 'th' ? 'ข้อมูลทั่วไป (General Info)' : 'General Info'}</span>
                    </div>
                    <div className="ce-form-grid">
                        <div className="ce-form-group ce-full">
                            <label className="ce-label">{language === 'th' ? 'ชื่ออีเว้นท์แบบเต็ม' : 'Full Event Name'} *</label>
                            <input
                                type="text"
                                className="ce-input"
                                placeholder={language === 'th' ? 'ระบุชื่อกิจกรรม' : 'Enter event name'}
                                value={form.name}
                                onChange={(e) => updateField('name', e.target.value)}
                            />
                        </div>
                        <div className="ce-form-group">
                            <label className="ce-label">{language === 'th' ? 'ชื่อย่อ' : 'Short Name'}</label>
                            <input
                                type="text"
                                className="ce-input"
                                placeholder={language === 'th' ? 'เช่น DOI2025' : 'e.g. DOI2025'}
                                value={form.shortName}
                                onChange={(e) => updateField('shortName', e.target.value)}
                            />
                        </div>
                        <div className="ce-form-group">
                            <label className="ce-label">{language === 'th' ? 'ประเภทธีม' : 'Theme Type'}</label>
                            <select
                                className="ce-select"
                                value={form.themeType}
                                onChange={(e) => updateField('themeType', e.target.value)}
                            >
                                {THEME_OPTIONS.map(opt => (
                                    <option key={opt.value} value={opt.value}>
                                        {language === 'th' ? opt.label : opt.labelEn}
                                    </option>
                                ))}
                            </select>
                        </div>
                        <div className="ce-form-group">
                            <label className="ce-label">{language === 'th' ? 'วันที่จัดงาน' : 'Event Date'} *</label>
                            <input
                                type="date"
                                className="ce-input"
                                value={form.eventDate}
                                onChange={(e) => updateField('eventDate', e.target.value)}
                            />
                        </div>
                        <div className="ce-form-group">
                            <label className="ce-label">{language === 'th' ? 'สถานที่จัด' : 'Location'} *</label>
                            <input
                                type="text"
                                className="ce-input"
                                placeholder={language === 'th' ? 'ระบุสถานที่/พิกัด' : 'Enter location'}
                                value={form.location}
                                onChange={(e) => updateField('location', e.target.value)}
                            />
                        </div>
                        <div className="ce-form-group ce-full">
                            <label className="ce-label">{language === 'th' ? 'รายละเอียดและวัตถุประสงค์' : 'Description & Objectives'}</label>
                            <textarea
                                className="ce-textarea"
                                placeholder={language === 'th' ? 'ข้อมูลเบื้องต้นของงาน...' : 'Basic event information...'}
                                value={form.description}
                                onChange={(e) => updateField('description', e.target.value)}
                            />
                        </div>
                    </div>
                </div>

                {/* Card 3: Distance Table (Success/Green) */}
                <div className="ce-card ce-card-success">
                    <div className="ce-card-header justify-between">
                        <div className="flex items-center gap-2">
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#00a65a" strokeWidth="2">
                                <line x1="8" y1="6" x2="21" y2="6" />
                                <line x1="8" y1="12" x2="21" y2="12" />
                                <line x1="8" y1="18" x2="21" y2="18" />
                                <line x1="3" y1="6" x2="3.01" y2="6" />
                                <line x1="3" y1="12" x2="3.01" y2="12" />
                                <line x1="3" y1="18" x2="3.01" y2="18" />
                            </svg>
                            <span>{language === 'th' ? 'ข้อมูลตารางระยะทาง' : 'Distance Categories Table'}</span>
                        </div>
                        <button type="button" className="btn-ce-add" onClick={addCategory}>
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                                <line x1="12" y1="5" x2="12" y2="19" />
                                <line x1="5" y1="12" x2="19" y2="12" />
                            </svg>
                            {language === 'th' ? 'เพิ่มแถว' : 'Add Row'}
                        </button>
                    </div>
                    <div className="overflow-x-auto">
                        <table className="ce-distance-table">
                            <thead>
                                <tr>
                                    <th style={{ width: 130 }}>{language === 'th' ? 'Remote Event No' : 'Remote Event No'}</th>
                                    <th style={{ width: 120 }}>{language === 'th' ? 'ระยะทาง' : 'Distance'}</th>
                                    <th style={{ width: 80 }}>Badge</th>
                                    <th style={{ width: 190 }}>{language === 'th' ? 'วันเวลาปล่อยตัว' : 'Start Date & Time'}</th>
                                    <th style={{ width: 100 }}>{language === 'th' ? 'เวลาคัดออฟ' : 'Cutoff'}</th>
                                    <th style={{ width: 90 }}>ITRA Score</th>
                                    <th style={{ width: 100 }}>UTMB Index</th>
                                    <th style={{ width: 120, textAlign: 'right' }}>{language === 'th' ? 'ความสูง' : 'Elevation'}</th>
                                    <th style={{ width: 40 }}></th>
                                </tr>
                            </thead>
                            <tbody>
                                {form.categories.length === 0 ? (
                                    <tr>
                                        <td colSpan={9} className="text-center py-5 text-gray-400">
                                            {language === 'th' ? 'ยังไม่มีประเภท — กดปุ่ม "เพิ่มแถว"' : 'No categories yet — click "Add Row"'}
                                        </td>
                                    </tr>
                                ) : (
                                    form.categories.map((cat, idx) => (
                                        <tr key={idx}>
                                            <td>
                                                <input
                                                    type="text"
                                                    className="ce-input ce-input-sm"
                                                    value={cat.remoteEventNo || ''}
                                                    onChange={(e) => updateCategory(idx, 'remoteEventNo', e.target.value)}
                                                    placeholder={language === 'th' ? 'Project Number' : 'Project Number'}
                                                />
                                            </td>
                                            <td>
                                                <input
                                                    type="text"
                                                    className="ce-input ce-input-sm"
                                                    value={cat.distance}
                                                    onChange={(e) => updateCategory(idx, 'distance', e.target.value)}
                                                    placeholder="175 KM"
                                                />
                                            </td>
                                            <td>
                                                <input
                                                    type="text"
                                                    className="ce-badge-input"
                                                    value={cat.name}
                                                    onChange={(e) => updateCategory(idx, 'name', e.target.value)}
                                                    placeholder="100M"
                                                />
                                            </td>
                                            <td>
                                                <input
                                                    type="datetime-local"
                                                    className="ce-input ce-input-sm"
                                                    value={cat.startTime}
                                                    onChange={(e) => updateCategory(idx, 'startTime', e.target.value)}
                                                />
                                            </td>
                                            <td>
                                                <input
                                                    type="text"
                                                    className="ce-input ce-input-sm"
                                                    value={cat.cutoff}
                                                    onChange={(e) => updateCategory(idx, 'cutoff', e.target.value)}
                                                    placeholder={language === 'th' ? '48 ชม.' : '48 hrs'}
                                                />
                                            </td>
                                            <td>
                                                <input
                                                    type="text"
                                                    className="ce-input ce-input-sm"
                                                    value={cat.itra}
                                                    onChange={(e) => updateCategory(idx, 'itra', e.target.value)}
                                                    placeholder="💎 6"
                                                />
                                            </td>
                                            <td>
                                                <input
                                                    type="text"
                                                    className="ce-input ce-input-sm"
                                                    value={cat.utmbIndex}
                                                    onChange={(e) => updateCategory(idx, 'utmbIndex', e.target.value)}
                                                    placeholder="⚡ 100M"
                                                />
                                            </td>
                                            <td>
                                                <input
                                                    type="text"
                                                    className="ce-input ce-input-sm text-right"
                                                    value={cat.elevation}
                                                    onChange={(e) => updateCategory(idx, 'elevation', e.target.value)}
                                                    placeholder="10,400 m+"
                                                />
                                            </td>
                                            <td className="text-center">
                                                <button
                                                    type="button"
                                                    className="inline-flex items-center justify-center w-7 h-7 rounded text-red-500 hover:bg-red-100 hover:text-red-700 transition-colors"
                                                    onClick={() => removeCategory(idx)}
                                                    title={language === 'th' ? 'ลบแถวนี้' : 'Delete row'}
                                                >
                                                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                                                        <polyline points="3 6 5 6 21 6" />
                                                        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                                                    </svg>
                                                </button>
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>

                {/* Card 4: Organizer (Danger/Red) */}
                <div className="ce-card ce-card-danger">
                    <div className="ce-card-header">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#dd4b39" strokeWidth="2">
                            <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                            <circle cx="9" cy="7" r="4" />
                            <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                            <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                        </svg>
                        <span>{language === 'th' ? 'ผู้จัดงาน' : 'Organizer'}</span>
                    </div>
                    <div className="ce-form-grid">
                        <div className="ce-form-group">
                            <label className="ce-label">{language === 'th' ? 'ออแกไนเซอร์' : 'Organizer'}</label>
                            <input
                                type="text"
                                className="ce-input"
                                placeholder={language === 'th' ? 'ระบุชื่อออแกไนเซอร์' : 'Enter organizer name'}
                                value={form.organizerName}
                                onChange={(e) => updateField('organizerName', e.target.value)}
                            />
                        </div>
                        <div className="ce-form-group">
                            <label className="ce-label">{language === 'th' ? 'ผู้จัดอีเว้นท์' : 'Event Manager'}</label>
                            <input
                                type="text"
                                className="ce-input"
                                placeholder={language === 'th' ? 'ระบุชื่อผู้จัด' : 'Enter event manager'}
                                value={form.eventManager}
                                onChange={(e) => updateField('eventManager', e.target.value)}
                            />
                        </div>
                        <div className="ce-form-group">
                            <label className="ce-label">{language === 'th' ? 'ชื่อผู้ติดต่อ' : 'Contact Name'}</label>
                            <input
                                type="text"
                                className="ce-input"
                                value={form.organizerContact}
                                onChange={(e) => updateField('organizerContact', e.target.value)}
                            />
                        </div>
                        <div className="ce-form-group">
                            <label className="ce-label">{language === 'th' ? 'เบอร์โทรศัพท์' : 'Phone'}</label>
                            <input
                                type="text"
                                className="ce-input"
                                value={form.organizerPhone}
                                onChange={(e) => updateField('organizerPhone', e.target.value)}
                            />
                        </div>
                        <div className="ce-form-group">
                            <label className="ce-label">{language === 'th' ? 'อีเมล' : 'Email'}</label>
                            <input
                                type="email"
                                className="ce-input"
                                value={form.organizerEmail}
                                onChange={(e) => updateField('organizerEmail', e.target.value)}
                            />
                        </div>
                        <div className="ce-form-group">
                            <label className="ce-label">{language === 'th' ? 'เฟสบุ๊ค / เว็บไซต์' : 'Facebook / Website'}</label>
                            <input
                                type="text"
                                className="ce-input"
                                value={form.organizerWebsite}
                                onChange={(e) => updateField('organizerWebsite', e.target.value)}
                            />
                        </div>
                    </div>
                </div>

                {/* Card 5: RFID Sync */}
                <div className="ce-card ce-card-info">
                    <div className="ce-card-header">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#00c0ef" strokeWidth="2">
                            <path d="M2 12a10 10 0 0 1 20 0" />
                            <path d="M5 12a7 7 0 0 1 14 0" />
                            <path d="M8 12a4 4 0 0 1 8 0" />
                            <circle cx="12" cy="16" r="1.5" />
                        </svg>
                        <span>{language === 'th' ? 'เชื่อมต่อ RFID (RaceTiger)' : 'RFID Integration (RaceTiger)'}</span>
                    </div>
                    <div className="ce-form-grid">
                        <div className="ce-form-group ce-full">
                            <label className="ce-label">
                                {language === 'th' ? 'วาง URL จากเว็บ RaceTiger (Auto-fill)' : 'Paste RaceTiger URL (Auto-fill)'}
                            </label>
                            <input
                                type="text"
                                className="ce-input"
                                placeholder="https://rqs.racetigertiming.com/Dif/bio?pc=000001&rid=...&token=...&page=1"
                                value={raceTigerUrl}
                                onPaste={(e) => {
                                    const text = e.clipboardData.getData('text');
                                    handleRaceTigerUrlPaste(text);
                                }}
                                onChange={(e) => handleRaceTigerUrlPaste(e.target.value)}
                            />
                            <div className="text-xs text-gray-500 mt-1.5 flex flex-col gap-1">
                                <span>
                                    {language === 'th'
                                        ? '📋 วาง URL ใดก็ได้จากเว็บ RaceTiger — ระบบจะดึง Race ID, Token และ Partner Code ให้อัตโนมัติ'
                                        : '📋 Paste any URL from RaceTiger — Race ID, Token and Partner Code will be extracted automatically'}
                                </span>
                                <span className="text-gray-400">
                                    {language === 'th' ? 'เมื่อกด "Import Events from RaceTiger" ระบบจะดึงข้อมูลจาก 3 endpoint อัตโนมัติ:' : 'When clicking "Import Events from RaceTiger", the system fetches from 3 endpoints automatically:'}
                                </span>
                                <span className="text-gray-500 pl-2">
                                    {'📁 '}<code className="bg-gray-100 px-1 rounded">/Dif/info</code>
                                    {language === 'th' ? ' → ระยะทาง / ชื่อ Event' : ' → distances / event names'}
                                </span>
                                <span className="text-gray-500 pl-2">
                                    {'🏃 '}<code className="bg-gray-100 px-1 rounded">/Dif/bio</code>
                                    {language === 'th' ? ' → รายชื่อนักวิ่ง (Runners)' : ' → runner list (participants)'}
                                </span>
                                <span className="text-gray-500 pl-2">
                                    {'📍 '}<code className="bg-gray-100 px-1 rounded">/Dif/splitScore</code>
                                    {language === 'th' ? ' → ชื่อ Checkpoint ตามจริง' : ' → real checkpoint names'}
                                </span>
                            </div>
                            {/* Show extracted values immediately after URL is pasted */}
                            {(form.partnerCode || form.raceId || form.rfidToken) && (
                                <div className="mt-2 px-3 py-2 bg-green-50 border border-green-200 rounded-md text-xs flex flex-col gap-1">
                                    <span className="font-bold text-green-700">
                                        ✅ {language === 'th' ? 'ดึงค่าจาก URL สำเร็จ:' : 'Extracted from URL:'}
                                    </span>
                                    {form.raceTigerBaseUrl && (
                                        <span className="text-green-800">
                                            <strong>Base URL:</strong>{' '}
                                            <code className="bg-green-100 px-1.5 rounded font-mono">{form.raceTigerBaseUrl}</code>
                                            <span className="text-gray-500 ml-1.5">
                                                {language === 'th' ? '— server ของ RaceTiger' : '— RaceTiger server'}
                                            </span>
                                        </span>
                                    )}
                                    {form.partnerCode && (
                                        <span className="text-green-800">
                                            <strong>Partner Code (pc):</strong>{' '}
                                            <code className="bg-green-100 px-1.5 rounded font-mono">{form.partnerCode}</code>
                                            <span className="text-gray-500 ml-1.5">
                                                {language === 'th' ? '— รหัสพาร์ทเนอร์ของงานนี้ใน RaceTiger' : "— your event's partner code in RaceTiger"}
                                            </span>
                                        </span>
                                    )}
                                    {form.raceId && (
                                        <span className="text-green-800">
                                            <strong>Race ID (rid):</strong>{' '}
                                            <code className="bg-green-100 px-1.5 rounded font-mono">{form.raceId}</code>
                                        </span>
                                    )}
                                    {form.rfidToken && (
                                        <span className="text-green-800">
                                            <strong>Token:</strong>{' '}
                                            <code className="bg-green-100 px-1.5 rounded font-mono">
                                                {form.rfidToken.length > 20 ? form.rfidToken.slice(0, 20) + '…' : form.rfidToken}
                                            </code>
                                        </span>
                                    )}
                                </div>
                            )}
                        </div>

                        <div className="ce-form-group ce-full">
                            <label className="ce-label flex items-center gap-2">
                                <input
                                    type="checkbox"
                                    checked={form.allowRFIDSync}
                                    onChange={(e) => updateField('allowRFIDSync', e.target.checked)}
                                />
                                <span>{language === 'th' ? 'เปิดใช้งานการซิงค์ RFID สำหรับกิจกรรมนี้' : 'Enable RFID sync for this campaign'}</span>
                            </label>
                        </div>

                        {form.allowRFIDSync && (
                            <>
                                <div className="ce-form-group">
                                    <label className="ce-label">RFID Token *</label>
                                    <input
                                        type="text"
                                        className="ce-input"
                                        placeholder={language === 'th' ? 'ระบุ Event Token จากเว็บจีน' : 'Enter Event Token from RaceTiger'}
                                        value={form.rfidToken}
                                        onChange={(e) => updateField('rfidToken', e.target.value)}
                                    />
                                </div>
                                <div className="ce-form-group">
                                    <label className="ce-label">Race ID *</label>
                                    <input
                                        type="text"
                                        className="ce-input"
                                        placeholder={language === 'th' ? 'ระบุ Race ID จากเว็บจีน' : 'Enter Race ID from RaceTiger'}
                                        value={form.raceId}
                                        onChange={(e) => updateField('raceId', e.target.value)}
                                    />
                                </div>
                                <div className="ce-form-group">
                                    <label className="ce-label">Partner Code (pc)</label>
                                    <input
                                        type="text"
                                        className="ce-input"
                                        placeholder="000001"
                                        value={form.partnerCode}
                                        onChange={(e) => updateField('partnerCode', e.target.value)}
                                    />
                                    <span className="block text-xs text-gray-400 mt-0.5">
                                        {language === 'th'
                                            ? 'ค่า pc จาก URL ของ RaceTiger (ดึงอัตโนมัติเมื่อวาง URL ด้านบน)'
                                            : 'pc value from RaceTiger URL (auto-filled when pasting URL above)'}
                                    </span>
                                </div>
                            </>
                        )}
                    </div>
                </div>

                {/* Toast */}
                {toastMessage && (
                    <div className="toast-container">
                        <div className="toast toast-success">
                            <span className="toast-icon">✓</span>
                            <span className="toast-message">{toastMessage}</span>
                        </div>
                    </div>
                )}

                {/* Image Crop Modal */}
                <ImageCropModal
                    isOpen={cropModalOpen}
                    imageSrc={rawImage}
                    onCrop={(croppedDataUrl) => {
                        setForm(prev => ({ ...prev, pictureUrl: croppedDataUrl }));
                        setCropModalOpen(false);
                    }}
                    onCancel={() => setCropModalOpen(false)}
                />
            </div>
        </AdminLayout>
    );
}

export default function CreateEventPage() {
    return (
        <Suspense fallback={<div style={{ textAlign: 'center', padding: 60, color: '#999' }}>Loading...</div>}>
            <CreateEventForm />
        </Suspense>
    );
}
