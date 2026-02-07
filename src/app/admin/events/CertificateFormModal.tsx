'use client';

import { useState, useRef } from 'react';
import { useLanguage } from '@/lib/language-context';
import '../admin.css';

interface CertificateFormModalProps {
    isOpen: boolean;
    onClose: () => void;
    eventId: string;
    eventName: string;
    onSave: (data: CertificateFormData) => void;
}

interface CertificateFormData {
    textColor: 'Dark' | 'Light';
    backgroundImage: string | null;
}

export default function CertificateFormModal({ isOpen, onClose, eventId, eventName, onSave }: CertificateFormModalProps) {
    const { language } = useLanguage();
    const [textColor, setTextColor] = useState<'Dark' | 'Light'>('Light');
    const [backgroundImage, setBackgroundImage] = useState<string | null>(null);
    const [saving, setSaving] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = (event) => {
                setBackgroundImage(event.target?.result as string);
            };
            reader.readAsDataURL(file);
        }
    };

    const handleSave = async () => {
        setSaving(true);
        try {
            await onSave({ textColor, backgroundImage });
            onClose();
        } catch (error) {
            console.error('Failed to save certificate form:', error);
        } finally {
            setSaving(false);
        }
    };

    const handlePreview = () => {
        window.open(`/admin/events/${eventId}/certificate/preview?textColor=${textColor}`, '_blank');
    };

    if (!isOpen) return null;

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal-content certificate-modal" onClick={e => e.stopPropagation()}>
                {/* Header */}
                <div className="modal-header">
                    <h2 className="modal-title">
                        {language === 'th' ? 'แก้ไขแบบฟอร์มใบรับรอง' : 'Edit Certificate Form'}
                    </h2>
                    <button className="modal-close" onClick={onClose}>×</button>
                </div>

                {/* Body */}
                <div className="modal-body">
                    {/* Text Color Selection */}
                    <div className="form-group">
                        <label className="form-label">
                            {language === 'th' ? 'สีข้อความ' : 'Text Color'}
                        </label>
                        <div className="color-toggle-group">
                            <button
                                className={`color-toggle-btn ${textColor === 'Dark' ? 'active' : ''}`}
                                onClick={() => setTextColor('Dark')}
                            >
                                Dark
                            </button>
                            <button
                                className={`color-toggle-btn ${textColor === 'Light' ? 'active' : ''}`}
                                onClick={() => setTextColor('Light')}
                            >
                                Light
                            </button>
                        </div>
                    </div>

                    {/* Background Image Upload */}
                    <div className="form-group">
                        <label className="form-label">
                            {language === 'th'
                                ? 'อัปโหลดภาพพื้นหลัง (ขนาด กว้าง:595 พิกเซล สูง:842 พิกเซล)'
                                : 'Upload Background Image (Size: 595px x 842px)'}
                        </label>
                        <div className="image-upload-area">
                            {backgroundImage ? (
                                <div className="image-preview">
                                    <img src={backgroundImage} alt="Background" />
                                </div>
                            ) : null}
                            <div
                                className="upload-btn-area"
                                onClick={() => fileInputRef.current?.click()}
                            >
                                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                                    <polyline points="17 8 12 3 7 8" />
                                    <line x1="12" y1="3" x2="12" y2="15" />
                                </svg>
                                <span>{language === 'th' ? 'อัปโหลดรูป' : 'Upload Image'}</span>
                            </div>
                            <input
                                ref={fileInputRef}
                                type="file"
                                accept="image/*"
                                style={{ display: 'none' }}
                                onChange={handleImageUpload}
                            />
                        </div>
                    </div>

                    {/* Preview Button */}
                    <button className="btn-outline-primary" onClick={handlePreview}>
                        {language === 'th' ? 'ตัวอย่างใบรับรอง' : 'Certificate Preview'}
                    </button>
                </div>

                {/* Footer */}
                <div className="modal-footer">
                    <button className="btn-secondary" onClick={onClose}>
                        {language === 'th' ? 'ยกเลิก' : 'Cancel'}
                    </button>
                    <button
                        className="btn-primary"
                        onClick={handleSave}
                        disabled={saving}
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
