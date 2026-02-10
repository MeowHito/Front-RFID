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
                    categories: (campaign.categories || []).map((cat: RaceCategory) => ({
                        name: cat.name || '',
                        distance: cat.distance || '',
                        startTime: cat.startTime || '06:00',
                        cutoff: cat.cutoff || '',
                        elevation: cat.elevation || '',
                        raceType: cat.raceType || '',
                        badgeColor: cat.badgeColor || '#dc2626',
                        status: cat.status || 'wait',
                        itra: cat.itra ?? '',
                        utmbIndex: cat.utmbIndex || '',
                    })),
                });
            })
            .catch(err => console.error('Failed to load campaign:', err))
            .finally(() => setLoadingEdit(false));
    }, [editId]);

    const updateField = (field: keyof CreateEventForm, value: string) => {
        setForm(prev => ({ ...prev, [field]: value }));
    };

    // Category management
    const addCategory = () => {
        setForm(prev => ({
            ...prev,
            categories: [...prev.categories, {
                name: '', distance: '', startTime: '06:00', cutoff: '',
                elevation: '', raceType: '', badgeColor: '#dc2626',
                status: 'wait', itra: '', utmbIndex: '',
            }]
        }));
    };

    const removeCategory = (idx: number) => {
        setForm(prev => ({
            ...prev,
            categories: prev.categories.filter((_, i) => i !== idx)
        }));
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
                    { label: 'แอดมิน', labelEn: 'Admin', href: '/admin' },
                    { label: 'อีเวนท์', labelEn: 'Events', href: '/admin/events' },
                    { label: 'กำลังโหลด...', labelEn: 'Loading...' }
                ]}
                pageTitle=""
            >
                <div style={{ textAlign: 'center', padding: 60, color: '#999' }}>
                    {language === 'th' ? 'กำลังโหลดข้อมูล...' : 'Loading data...'}
                </div>
            </AdminLayout>
        );
    }

    return (
        <AdminLayout
            breadcrumbItems={[
                { label: 'แอดมิน', labelEn: 'Admin', href: '/admin' },
                { label: 'อีเวนท์', labelEn: 'Events', href: '/admin/events' },
                { label: isEdit ? 'แก้ไขกิจกรรม' : 'สร้างกิจกรรมใหม่', labelEn: isEdit ? 'Edit Event' : 'Create New Event' }
            ]}
            pageTitle={language === 'th'
                ? (isEdit ? 'แก้ไขข้อมูลกิจกรรม' : 'กรอกข้อมูลเพื่อสร้างกิจกรรมใหม่ในระบบ')
                : (isEdit ? 'Edit event details' : 'Fill in the details to create a new event')
            }
        >
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
                <div className="ce-card-header" style={{ justifyContent: 'space-between' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
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
                <div style={{ overflowX: 'auto' }}>
                    <table className="ce-distance-table">
                        <thead>
                            <tr>
                                <th style={{ width: 90 }}>{language === 'th' ? 'สถานะ' : 'Status'}</th>
                                <th style={{ width: 120 }}>{language === 'th' ? 'ระยะทาง' : 'Distance'}</th>
                                <th style={{ width: 80 }}>Badge</th>
                                <th style={{ width: 160 }}>{language === 'th' ? 'เวลาปล่อยตัว' : 'Start Time'}</th>
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
                                    <td colSpan={9} style={{ textAlign: 'center', padding: 20, color: '#999' }}>
                                        {language === 'th' ? 'ยังไม่มีประเภท — กดปุ่ม "เพิ่มแถว"' : 'No categories yet — click "Add Row"'}
                                    </td>
                                </tr>
                            ) : (
                                form.categories.map((cat, idx) => (
                                    <tr key={idx}>
                                        <td>
                                            <select
                                                className="ce-select ce-select-sm"
                                                value={cat.status}
                                                onChange={(e) => updateCategory(idx, 'status', e.target.value)}
                                            >
                                                <option value="wait">WAIT</option>
                                                <option value="live">LIVE</option>
                                            </select>
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
                                                className="ce-input ce-input-sm"
                                                style={{ textAlign: 'right' }}
                                                value={cat.elevation}
                                                onChange={(e) => updateCategory(idx, 'elevation', e.target.value)}
                                                placeholder="10,400 m+"
                                            />
                                        </td>
                                        <td style={{ textAlign: 'center' }}>
                                            <button
                                                type="button"
                                                className="ce-delete-btn"
                                                onClick={() => removeCategory(idx)}
                                                title={language === 'th' ? 'ลบ' : 'Delete'}
                                            >
                                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#dd4b39" strokeWidth="2">
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
