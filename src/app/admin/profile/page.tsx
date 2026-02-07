'use client';

import { useState, useEffect, useRef } from 'react';
import { useAuth } from '@/lib/auth-context';
import { useLanguage } from '@/lib/language-context';
import api from '@/lib/api';
import AdminLayout from '../AdminLayout';

interface ProfileData {
    firstName: string;
    lastName: string;
    gender: string;
    idCard: string;
    birthDate: string;
    phone: string;
    nationality: string;
    bloodType: string;
    healthIssues: string;
    emergencyContactName: string;
    emergencyContactPhone: string;
    address: string;
    avatarUrl: string;
}

export default function ProfilePage() {
    const { user } = useAuth();
    const { language } = useLanguage();
    const [saving, setSaving] = useState(false);
    const [saveMessage, setSaveMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [profile, setProfile] = useState<ProfileData>({
        firstName: '',
        lastName: '',
        gender: '',
        idCard: '',
        birthDate: '',
        phone: '',
        nationality: 'Thai',
        bloodType: '',
        healthIssues: '',
        emergencyContactName: '',
        emergencyContactPhone: '',
        address: '',
        avatarUrl: '',
    });

    useEffect(() => {
        if (user) {
            setProfile(prev => ({
                ...prev,
                firstName: user.firstName || '',
                lastName: user.lastName || '',
                phone: user.phone || '',
                avatarUrl: user.avatarUrl || '',
            }));
        }
    }, [user]);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
        const { name, value } = e.target;
        setProfile(prev => ({ ...prev, [name]: value }));
    };

    const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            // Validate file size (max 5MB)
            if (file.size > 5 * 1024 * 1024) {
                setSaveMessage({
                    type: 'error',
                    text: language === 'th' ? 'ไฟล์ใหญ่เกินไป (สูงสุด 5MB)' : 'File too large (max 5MB)'
                });
                return;
            }

            const reader = new FileReader();
            reader.onload = (event) => {
                const base64 = event.target?.result as string;
                setProfile(prev => ({ ...prev, avatarUrl: base64 }));
                setSaveMessage({
                    type: 'success',
                    text: language === 'th' ? 'อัปโหลดรูปสำเร็จ! อย่าลืมกดบันทึก' : 'Image uploaded! Don\'t forget to save'
                });
            };
            reader.readAsDataURL(file);
        }
    };

    const handleSave = async () => {
        setSaving(true);
        setSaveMessage(null);
        try {
            await api.put(`/users/${user?._id}`, profile);
            setSaveMessage({
                type: 'success',
                text: language === 'th' ? 'บันทึกข้อมูลสำเร็จ!' : 'Profile saved successfully!'
            });
        } catch (error) {
            console.error('Failed to save profile:', error);
            setSaveMessage({
                type: 'error',
                text: language === 'th' ? 'เกิดข้อผิดพลาดในการบันทึก' : 'Failed to save profile'
            });
        } finally {
            setSaving(false);
        }
    };

    const nationalities = ['Thai', 'American', 'British', 'Chinese', 'Japanese', 'Korean', 'Other'];
    const bloodTypes = ['A', 'B', 'AB', 'O'];

    return (
        <AdminLayout
            breadcrumbItems={[
                { label: 'แอดมิน', labelEn: 'Admin', href: '/admin' },
                { label: 'โปรไฟล์', labelEn: 'Profile' }
            ]}
            pageTitle={language === 'th' ? 'จัดการข้อมูลโปรไฟล์ของคุณ' : 'Manage your profile information'}
        >
            <div className="admin-card">
                {/* Section: ข้อมูลส่วนตัว */}
                <div className="admin-form-section">
                    <h2 className="admin-form-title">
                        {language === 'th' ? 'ข้อมูลส่วนตัว' : 'Personal Information'}
                    </h2>

                    {/* Profile Picture */}
                    <div className="admin-form-group" style={{ marginBottom: '24px' }}>
                        <label className="admin-form-label">
                            {language === 'th' ? 'รูปโปรไฟล์' : 'Profile Picture'}
                        </label>
                        <div className="profile-picture-section">
                            <div className="profile-picture-preview">
                                {profile.avatarUrl ? (
                                    <img src={profile.avatarUrl} alt="Avatar" />
                                ) : (
                                    <svg width="80" height="80" viewBox="0 0 80 80" fill="none">
                                        <rect width="80" height="80" fill="#e0e0e0" />
                                        <path d="M40 40C46.07 40 51 35.07 51 29C51 22.93 46.07 18 40 18C33.93 18 29 22.93 29 29C29 35.07 33.93 40 40 40Z" fill="#9e9e9e" />
                                        <path d="M40 46C28.95 46 20 54.95 20 66H60C60 54.95 51.05 46 40 46Z" fill="#9e9e9e" />
                                    </svg>
                                )}
                            </div>
                            <input
                                type="file"
                                ref={fileInputRef}
                                onChange={handleImageUpload}
                                accept="image/*"
                                style={{ display: 'none' }}
                            />
                            <button
                                type="button"
                                className="profile-picture-upload"
                                onClick={() => fileInputRef.current?.click()}
                            >
                                📤 {language === 'th' ? 'อัปโหลดรูป' : 'Upload'}
                            </button>
                        </div>
                    </div>

                    {/* Row 1: ชื่อ, นามสกุล, เพศ */}
                    <div className="admin-form-row">
                        <div className="admin-form-group">
                            <label className="admin-form-label">
                                <span className="required">*</span>
                                {language === 'th' ? 'ชื่อ' : 'First Name'}
                            </label>
                            <input
                                type="text"
                                name="firstName"
                                value={profile.firstName}
                                onChange={handleChange}
                                className="admin-form-input"
                            />
                        </div>
                        <div className="admin-form-group">
                            <label className="admin-form-label">
                                <span className="required">*</span>
                                {language === 'th' ? 'นามสกุล' : 'Last Name'}
                            </label>
                            <input
                                type="text"
                                name="lastName"
                                value={profile.lastName}
                                onChange={handleChange}
                                className="admin-form-input"
                            />
                        </div>
                        <div className="admin-form-group">
                            <label className="admin-form-label">
                                <span className="required">*</span>
                                {language === 'th' ? 'เพศ' : 'Gender'}
                            </label>
                            <select
                                name="gender"
                                value={profile.gender}
                                onChange={handleChange}
                                className="admin-form-select"
                            >
                                <option value="">{language === 'th' ? 'เลือก' : 'Select'}</option>
                                <option value="ชาย">{language === 'th' ? 'ชาย' : 'Male'}</option>
                                <option value="หญิง">{language === 'th' ? 'หญิง' : 'Female'}</option>
                            </select>
                        </div>
                    </div>

                    {/* Row 2: เลขประจำตัวประชาชน, วันเดือนปีเกิด, เบอร์โทรศัพท์ */}
                    <div className="admin-form-row">
                        <div className="admin-form-group">
                            <label className="admin-form-label">
                                {language === 'th' ? 'เลขประจำตัวประชาชน' : 'ID Card'}
                            </label>
                            <input
                                type="text"
                                name="idCard"
                                value={profile.idCard}
                                onChange={handleChange}
                                className="admin-form-input"
                            />
                        </div>
                        <div className="admin-form-group">
                            <label className="admin-form-label">
                                <span className="required">*</span>
                                {language === 'th' ? 'วันเดือนปีเกิด' : 'Birth Date'}
                            </label>
                            <input
                                type="date"
                                name="birthDate"
                                value={profile.birthDate}
                                onChange={handleChange}
                                className="admin-form-input"
                            />
                        </div>
                        <div className="admin-form-group">
                            <label className="admin-form-label">
                                {language === 'th' ? 'เบอร์โทรศัพท์' : 'Phone'}
                            </label>
                            <input
                                type="tel"
                                name="phone"
                                value={profile.phone}
                                onChange={handleChange}
                                className="admin-form-input"
                            />
                        </div>
                    </div>

                    {/* Row 3: สัญชาติ, หมู่เลือด, ปัญหาสุขภาพ */}
                    <div className="admin-form-row">
                        <div className="admin-form-group">
                            <label className="admin-form-label">
                                {language === 'th' ? 'สัญชาติ' : 'Nationality'}
                            </label>
                            <select
                                name="nationality"
                                value={profile.nationality}
                                onChange={handleChange}
                                className="admin-form-select"
                            >
                                {nationalities.map(n => (
                                    <option key={n} value={n}>{n}</option>
                                ))}
                            </select>
                        </div>
                        <div className="admin-form-group">
                            <label className="admin-form-label">
                                {language === 'th' ? 'หมู่เลือด' : 'Blood Type'}
                            </label>
                            <select
                                name="bloodType"
                                value={profile.bloodType}
                                onChange={handleChange}
                                className="admin-form-select"
                            >
                                <option value="">-</option>
                                {bloodTypes.map(b => (
                                    <option key={b} value={b}>{b}</option>
                                ))}
                            </select>
                        </div>
                        <div className="admin-form-group">
                            <label className="admin-form-label">
                                {language === 'th' ? 'ปัญหาสุขภาพ' : 'Health Issues'}
                            </label>
                            <input
                                type="text"
                                name="healthIssues"
                                value={profile.healthIssues}
                                onChange={handleChange}
                                placeholder="-"
                                className="admin-form-input"
                            />
                        </div>
                    </div>
                </div>

                {/* Section: บุคคลที่ติดต่อได้กรณีฉุกเฉิน */}
                <div className="admin-form-section">
                    <h2 className="admin-form-title">
                        {language === 'th' ? 'บุคคลที่ติดต่อได้กรณีฉุกเฉิน' : 'Emergency Contact'}
                    </h2>

                    <div className="admin-form-row two-cols">
                        <div className="admin-form-group">
                            <label className="admin-form-label">
                                {language === 'th' ? 'ชื่อ-นามสกุล' : 'Name'}
                            </label>
                            <input
                                type="text"
                                name="emergencyContactName"
                                value={profile.emergencyContactName}
                                onChange={handleChange}
                                className="admin-form-input"
                            />
                        </div>
                        <div className="admin-form-group">
                            <label className="admin-form-label">
                                {language === 'th' ? 'เบอร์โทรศัพท์' : 'Phone'}
                            </label>
                            <input
                                type="tel"
                                name="emergencyContactPhone"
                                value={profile.emergencyContactPhone}
                                onChange={handleChange}
                                className="admin-form-input"
                            />
                        </div>
                    </div>
                </div>

                {/* Section: สถานที่อยู่อาศัย */}
                <div className="admin-form-section">
                    <h2 className="admin-form-title">
                        {language === 'th' ? 'สถานที่อยู่อาศัย' : 'Address'}
                    </h2>

                    <div className="admin-form-group">
                        <label className="admin-form-label">
                            {language === 'th' ? 'ที่อยู่' : 'Address'}
                        </label>
                        <textarea
                            name="address"
                            value={profile.address}
                            onChange={handleChange}
                            placeholder={language === 'th' ? 'ที่อยู่' : 'Address'}
                            className="admin-form-textarea"
                            rows={3}
                        />
                    </div>
                </div>

                {/* Save Message */}
                {saveMessage && (
                    <div
                        style={{
                            padding: '12px 16px',
                            borderRadius: '8px',
                            marginBottom: '16px',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px',
                            background: saveMessage.type === 'success' ? '#e8f5e9' : '#ffebee',
                            color: saveMessage.type === 'success' ? '#2e7d32' : '#c62828',
                            border: `1px solid ${saveMessage.type === 'success' ? '#c8e6c9' : '#ffcdd2'}`
                        }}
                    >
                        {saveMessage.type === 'success' ? '✓' : '✕'} {saveMessage.text}
                    </div>
                )}

                {/* Save Button */}
                <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                    <button
                        onClick={handleSave}
                        disabled={saving}
                        className="btn-primary"
                        style={{
                            padding: '12px 32px',
                            background: 'linear-gradient(135deg, #0066cc, #0052a3)',
                            color: '#fff',
                            border: 'none',
                            borderRadius: '8px',
                            fontSize: '14px',
                            fontWeight: '600',
                            cursor: saving ? 'not-allowed' : 'pointer',
                            opacity: saving ? 0.7 : 1,
                            transition: 'all 0.2s ease',
                            boxShadow: '0 4px 12px rgba(0, 102, 204, 0.25)'
                        }}
                    >
                        {saving
                            ? (language === 'th' ? 'กำลังบันทึก...' : 'Saving...')
                            : (language === 'th' ? 'บันทึกข้อมูล' : 'Save Changes')
                        }
                    </button>
                </div>
            </div>
        </AdminLayout>
    );
}
