'use client';

import { useState, useRef, useEffect } from 'react';
import { useLanguage } from '@/lib/language-context';
import '../admin.css';

// Race category type
interface RaceCategory {
    name: string;
    distance: string;
    startTime: string;
    cutoff: string;
    elevation?: string;
    raceType?: string;
    badgeColor: string;
    status: string;
    itra?: number;
    utmbIndex?: string;
}

// Campaign data interface
interface CampaignData {
    _id?: string;
    name: string;
    nameTh?: string;
    nameEn?: string;
    shortName?: string;
    description?: string;
    eventDate: string;
    eventEndDate?: string;
    location: string;
    locationTh?: string;
    locationEn?: string;
    pictureUrl?: string;
    organizerName?: string;
    status: string;
    categories: RaceCategory[];
}

interface EventDetailsModalProps {
    isOpen: boolean;
    onClose: () => void;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    event: any | null;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    onSave: (data: any) => void;
}

const BADGE_COLORS = ['#dc2626'];
const RACE_TYPES = ['Funrun', 'Micro Marathon', 'Mini Marathon', 'Half Marathon', 'Marathon'];

export default function EventDetailsModal({ isOpen, onClose, event, onSave }: EventDetailsModalProps) {
    const { language } = useLanguage();
    const [formData, setFormData] = useState<CampaignData>({
        name: '',
        nameTh: '',
        nameEn: '',
        shortName: '',
        description: '',
        eventDate: '',
        eventEndDate: '',
        location: '',
        locationTh: '',
        locationEn: '',
        pictureUrl: '',
        organizerName: '',
        status: 'upcoming',
        categories: []
    });
    const [saving, setSaving] = useState(false);
    const [saveMessage, setSaveMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
    const [categoryAddedNotification, setCategoryAddedNotification] = useState<string | null>(null);
    const pictureInputRef = useRef<HTMLInputElement>(null);

    // Sync campaign data when modal opens
    useEffect(() => {
        if (isOpen) {
            if (event) {
                setFormData({
                    _id: event._id || '',
                    name: event.name || '',
                    nameTh: event.nameTh || '',
                    nameEn: event.nameEn || '',
                    shortName: event.shortName || '',
                    description: event.description || '',
                    eventDate: event.eventDate ? event.eventDate.split('T')[0] : '',
                    eventEndDate: event.eventEndDate ? event.eventEndDate.split('T')[0] : '',
                    location: event.location || '',
                    locationTh: event.locationTh || '',
                    locationEn: event.locationEn || '',
                    pictureUrl: event.pictureUrl || '',
                    organizerName: event.organizerName || '',
                    status: event.status || 'upcoming',
                    categories: event.categories || []
                });
            } else {
                // New campaign - reset form
                setFormData({
                    name: '',
                    nameTh: '',
                    nameEn: '',
                    shortName: '',
                    description: '',
                    eventDate: '',
                    eventEndDate: '',
                    location: '',
                    locationTh: '',
                    locationEn: '',
                    pictureUrl: '',
                    organizerName: '',
                    status: 'upcoming',
                    categories: []
                });
            }
            setSaveMessage(null);
        }
    }, [isOpen, event]);

    const handleInputChange = (field: keyof CampaignData, value: string) => {
        setFormData(prev => ({ ...prev, [field]: value }));
    };

    const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = (event) => {
                setFormData(prev => ({ ...prev, pictureUrl: event.target?.result as string }));
            };
            reader.readAsDataURL(file);
        }
    };

    // Category management
    const addCategory = () => {
        const newCategory: RaceCategory = {
            name: '',
            distance: '',
            startTime: '06:00',
            cutoff: '',
            elevation: '',
            raceType: '',
            badgeColor: '#dc2626',
            status: 'wait'
        };
        setFormData(prev => {
            const newCategories = [...prev.categories, newCategory];
            const count = newCategories.length;
            const msg = language === 'th'
                ? `เพิ่มประเภทแล้ว ${count} รายการ`
                : `${count} ${count === 1 ? 'category' : 'categories'} added`;
            setCategoryAddedNotification(msg);

            // Auto-hide notification after 2.5 seconds
            setTimeout(() => setCategoryAddedNotification(null), 2500);

            return { ...prev, categories: newCategories };
        });
    };

    const removeCategory = (index: number) => {
        setFormData(prev => ({
            ...prev,
            categories: prev.categories.filter((_, i) => i !== index)
        }));
    };

    const updateCategory = (index: number, field: keyof RaceCategory, value: string | number) => {
        setFormData(prev => ({
            ...prev,
            categories: prev.categories.map((cat, i) =>
                i === index ? { ...cat, [field]: value } : cat
            )
        }));
    };

    const handleSave = async () => {
        setSaving(true);
        setSaveMessage(null);
        try {
            // Pass data to parent for save
            await onSave(formData);

            setSaveMessage({
                type: 'success',
                text: language === 'th' ? 'บันทึกข้อมูลเรียบร้อยแล้ว!' : 'Campaign saved successfully!'
            });

            // Close modal after 1.5 seconds
            setTimeout(() => {
                onClose();
            }, 1500);
        } catch (error) {
            console.error('Failed to save campaign:', error);
            setSaveMessage({
                type: 'error',
                text: language === 'th' ? 'เกิดข้อผิดพลาดในการบันทึก' : 'Failed to save campaign'
            });
        } finally {
            setSaving(false);
        }
    };

    if (!isOpen) return null;

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal-content event-details-modal" onClick={e => e.stopPropagation()} style={{ maxWidth: '800px', maxHeight: '90vh', overflow: 'auto' }}>
                {/* Header */}
                <div className="modal-header">
                    <h2 className="modal-title">
                        {event
                            ? (language === 'th' ? 'แก้ไขกิจกรรม' : 'Edit Campaign')
                            : (language === 'th' ? 'สร้างกิจกรรมใหม่' : 'Create New Campaign')
                        }
                    </h2>
                    <button className="modal-close" onClick={onClose}>×</button>
                </div>

                {/* Body */}
                <div className="modal-body event-form-body">
                    {/* Banner Image */}
                    <div className="form-group">
                        <label className="form-label">
                            {language === 'th' ? 'ภาพหน้าปกกิจกรรม' : 'Campaign Banner Image'}
                        </label>
                        <div
                            className="image-upload-box"
                            onClick={() => pictureInputRef.current?.click()}
                            style={{ height: '150px', width: '100%' }}
                        >
                            {formData.pictureUrl ? (
                                <img src={formData.pictureUrl} alt="Banner" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                            ) : (
                                <span className="upload-placeholder">+ {language === 'th' ? 'อัปโหลดรูป' : 'Upload Image'}</span>
                            )}
                        </div>
                        <input
                            ref={pictureInputRef}
                            type="file"
                            accept="image/*"
                            style={{ display: 'none' }}
                            onChange={handleImageUpload}
                        />
                    </div>

                    {/* Campaign Name (Main - Required) */}
                    <div className="form-group">
                        <label className="form-label">
                            <span className="required">*</span>
                            {language === 'th' ? 'ชื่อกิจกรรม (หลัก)' : 'Campaign Name (Main)'}
                        </label>
                        <input
                            type="text"
                            className="admin-form-input"
                            value={formData.name}
                            onChange={(e) => handleInputChange('name', e.target.value)}
                            placeholder="DOI INTHANON BY UTMB"
                        />
                    </div>

                    {/* Bilingual Names */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                        <div className="form-group">
                            <label className="form-label">
                                {language === 'th' ? 'ชื่อกิจกรรม (ภาษาไทย)' : 'Campaign Name (Thai)'}
                            </label>
                            <input
                                type="text"
                                className="admin-form-input"
                                value={formData.nameTh}
                                onChange={(e) => handleInputChange('nameTh', e.target.value)}
                                placeholder="ดอยอินทนนท์ โดย UTMB"
                            />
                        </div>
                        <div className="form-group">
                            <label className="form-label">
                                {language === 'th' ? 'ชื่อกิจกรรม (ภาษาอังกฤษ)' : 'Campaign Name (English)'}
                            </label>
                            <input
                                type="text"
                                className="admin-form-input"
                                value={formData.nameEn}
                                onChange={(e) => handleInputChange('nameEn', e.target.value)}
                                placeholder="DOI INTHANON BY UTMB"
                            />
                        </div>
                    </div>

                    {/* Two columns: Date & Location */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                        {/* Event Date */}
                        <div className="form-group">
                            <label className="form-label">
                                <span className="required">*</span>
                                {language === 'th' ? 'วันที่เริ่มกิจกรรม' : 'Start Date'}
                            </label>
                            <input
                                type="date"
                                className="admin-form-input"
                                value={formData.eventDate}
                                onChange={(e) => handleInputChange('eventDate', e.target.value)}
                            />
                        </div>

                        {/* Event End Date */}
                        <div className="form-group">
                            <label className="form-label">
                                {language === 'th' ? 'วันที่สิ้นสุด' : 'End Date'}
                            </label>
                            <input
                                type="date"
                                className="admin-form-input"
                                value={formData.eventEndDate}
                                onChange={(e) => handleInputChange('eventEndDate', e.target.value)}
                            />
                        </div>
                    </div>

                    {/* Location (Main - Required) */}
                    <div className="form-group">
                        <label className="form-label">
                            <span className="required">*</span>
                            {language === 'th' ? 'สถานที่จัด (หลัก)' : 'Location (Main)'}
                        </label>
                        <input
                            type="text"
                            className="admin-form-input"
                            value={formData.location}
                            onChange={(e) => handleInputChange('location', e.target.value)}
                            placeholder="ดอยอินทนนท์, เชียงใหม่"
                        />
                    </div>

                    {/* Bilingual Locations */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                        <div className="form-group">
                            <label className="form-label">
                                {language === 'th' ? 'สถานที่ (ภาษาไทย)' : 'Location (Thai)'}
                            </label>
                            <input
                                type="text"
                                className="admin-form-input"
                                value={formData.locationTh}
                                onChange={(e) => handleInputChange('locationTh', e.target.value)}
                                placeholder="ดอยอินทนนท์, เชียงใหม่"
                            />
                        </div>
                        <div className="form-group">
                            <label className="form-label">
                                {language === 'th' ? 'สถานที่ (ภาษาอังกฤษ)' : 'Location (English)'}
                            </label>
                            <input
                                type="text"
                                className="admin-form-input"
                                value={formData.locationEn}
                                onChange={(e) => handleInputChange('locationEn', e.target.value)}
                                placeholder="Doi Inthanon, Chiang Mai"
                            />
                        </div>
                    </div>

                    {/* Status */}
                    <div className="form-group">
                        <label className="form-label">
                            {language === 'th' ? 'สถานะ' : 'Status'}
                        </label>
                        <select
                            className="admin-form-select"
                            value={formData.status}
                            onChange={(e) => handleInputChange('status', e.target.value)}
                        >
                            <option value="upcoming">{language === 'th' ? 'กำลังจะมา' : 'Upcoming'}</option>
                            <option value="live">{language === 'th' ? 'กำลังดำเนินการ' : 'Live'}</option>
                            <option value="finished">{language === 'th' ? 'จบแล้ว' : 'Finished'}</option>
                        </select>
                    </div>

                    {/* Categories Section */}
                    <div className="form-group">
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem', gap: '1rem' }}>
                            <label className="form-label" style={{ margin: 0 }}>
                                {language === 'th' ? 'ประเภทการแข่งขัน' : 'Race Categories'}
                            </label>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                                {categoryAddedNotification && (
                                    <span style={{
                                        padding: '4px 12px',
                                        background: '#16a34a',
                                        color: '#fff',
                                        borderRadius: '4px',
                                        fontSize: '12px',
                                        fontWeight: 'bold',
                                        animation: 'fadeInOut 2.5s ease-in-out'
                                    }}>
                                        ✓ {categoryAddedNotification}
                                    </span>
                                )}
                                <button
                                    type="button"
                                    onClick={addCategory}
                                    style={{
                                        padding: '4px 12px',
                                        background: '#16a34a',
                                        color: '#fff',
                                        border: 'none',
                                        borderRadius: '4px',
                                        cursor: 'pointer',
                                        transition: 'transform 0.15s ease'
                                    }}
                                    onMouseDown={(e) => (e.currentTarget.style.transform = 'scale(0.95)')}
                                    onMouseUp={(e) => (e.currentTarget.style.transform = 'scale(1)')}
                                    onMouseLeave={(e) => (e.currentTarget.style.transform = 'scale(1)')}
                                >
                                    + {language === 'th' ? 'เพิ่มประเภท' : 'Add Category'}
                                </button>
                            </div>
                        </div>

                        {formData.categories.length === 0 ? (
                            <div style={{ padding: '2rem', textAlign: 'center', background: '#f3f4f6', borderRadius: '8px', color: '#6b7280' }}>
                                {language === 'th' ? 'ยังไม่มีประเภทการแข่งขัน - คลิกปุ่มเพิ่มประเภท' : 'No categories yet - click Add Category'}
                            </div>
                        ) : (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                                {formData.categories.map((cat, idx) => (
                                    <div key={idx} style={{
                                        padding: '1rem',
                                        border: `2px solid ${cat.badgeColor}`,
                                        borderRadius: '8px',
                                        background: '#fafafa'
                                    }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
                                            <span style={{
                                                padding: '2px 8px',
                                                background: cat.badgeColor,
                                                color: '#fff',
                                                borderRadius: '4px',
                                                fontSize: '12px',
                                                fontWeight: 'bold'
                                            }}>
                                                {language === 'th' ? 'ประเภท' : 'Category'} #{idx + 1}
                                            </span>
                                            <button
                                                type="button"
                                                onClick={() => removeCategory(idx)}
                                                style={{
                                                    padding: '2px 8px',
                                                    background: '#dc2626',
                                                    color: '#fff',
                                                    border: 'none',
                                                    borderRadius: '4px',
                                                    cursor: 'pointer',
                                                    fontSize: '12px'
                                                }}
                                            >
                                                {language === 'th' ? 'ลบ' : 'Remove'}
                                            </button>
                                        </div>

                                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.5rem' }}>
                                            {/* Name */}
                                            <input
                                                type="text"
                                                className="admin-form-input"
                                                value={cat.name}
                                                onChange={(e) => updateCategory(idx, 'name', e.target.value)}
                                                placeholder={language === 'th' ? 'ชื่อ (100M, 50K)' : 'Name (100M, 50K)'}
                                            />

                                            {/* Distance */}
                                            <input
                                                type="text"
                                                className="admin-form-input"
                                                value={cat.distance}
                                                onChange={(e) => updateCategory(idx, 'distance', e.target.value)}
                                                placeholder={language === 'th' ? 'ระยะทาง (175 KM)' : 'Distance (175 KM)'}
                                            />

                                            {/* Start Time */}
                                            <input
                                                type="time"
                                                className="admin-form-input"
                                                value={cat.startTime}
                                                onChange={(e) => updateCategory(idx, 'startTime', e.target.value)}
                                            />

                                            {/* Cutoff */}
                                            <input
                                                type="text"
                                                className="admin-form-input"
                                                value={cat.cutoff}
                                                onChange={(e) => updateCategory(idx, 'cutoff', e.target.value)}
                                                placeholder={language === 'th' ? 'คัทออฟ (48ชม.)' : 'Cutoff (48hrs)'}
                                            />

                                            {/* Elevation OR Race Type */}
                                            <input
                                                type="text"
                                                className="admin-form-input"
                                                value={cat.elevation}
                                                onChange={(e) => updateCategory(idx, 'elevation', e.target.value)}
                                                placeholder={language === 'th' ? 'ความสูง (10,400 m+)' : 'Elevation (10,400 m+)'}
                                            />

                                            {/* Race Type (for non-trail) */}
                                            <select
                                                className="admin-form-select"
                                                value={cat.raceType || ''}
                                                onChange={(e) => updateCategory(idx, 'raceType', e.target.value)}
                                            >
                                                <option value="">{language === 'th' ? 'ประเภท (Trail)' : 'Type (Trail)'}</option>
                                                {RACE_TYPES.map(rt => (
                                                    <option key={rt} value={rt}>{rt}</option>
                                                ))}
                                            </select>

                                            {/* Status */}
                                            <select
                                                className="admin-form-select"
                                                value={cat.status}
                                                onChange={(e) => updateCategory(idx, 'status', e.target.value)}
                                            >
                                                <option value="wait">{language === 'th' ? 'รอ' : 'Wait'}</option>
                                                <option value="live">{language === 'th' ? 'Live' : 'Live'}</option>
                                                <option value="finished">{language === 'th' ? 'จบ' : 'Finished'}</option>
                                            </select>

                                            {/* ITRA Points */}
                                            <input
                                                type="number"
                                                className="admin-form-input"
                                                value={cat.itra || ''}
                                                onChange={(e) => updateCategory(idx, 'itra', e.target.value ? Number(e.target.value) : '')}
                                                placeholder="ITRA (e.g. 6)"
                                                min="0"
                                            />

                                            {/* UTMB Index */}
                                            <input
                                                type="text"
                                                className="admin-form-input"
                                                value={cat.utmbIndex || ''}
                                                onChange={(e) => updateCategory(idx, 'utmbIndex', e.target.value)}
                                                placeholder="INDEX (e.g. 100M)"
                                            />

                                            {/* Badge Color - fixed red */}
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                                <span style={{ fontSize: '12px' }}>{language === 'th' ? 'สีแถบ:' : 'Badge:'}</span>
                                                <div style={{
                                                    width: '20px',
                                                    height: '20px',
                                                    borderRadius: '50%',
                                                    background: '#dc2626',
                                                    border: '2px solid #000'
                                                }} />
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>

                {/* Save Message */}
                {saveMessage && (
                    <div className={`modal-message ${saveMessage.type}`}>
                        {saveMessage.type === 'success' ? '✓' : '✕'} {saveMessage.text}
                    </div>
                )}

                {/* Footer */}
                <div className="modal-footer">
                    <button className="btn-secondary" onClick={onClose} disabled={saving}>
                        {language === 'th' ? 'ยกเลิก' : 'Cancel'}
                    </button>
                    <button
                        className="btn-primary"
                        onClick={handleSave}
                        disabled={saving || !formData.name || !formData.eventDate || !formData.location}
                    >
                        {saving
                            ? (language === 'th' ? 'กำลังบันทึก...' : 'Saving...')
                            : (language === 'th' ? 'บันทึก' : 'Save')
                        }
                    </button>
                </div>
            </div>
        </div>
    );
}
