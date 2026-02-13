'use client';

import { useState, useEffect, useRef } from 'react';
import { useAuth } from '@/lib/auth-context';
import { useLanguage } from '@/lib/language-context';
import AdminLayout from '../AdminLayout';

interface ProfileData {
    firstName: string;
    lastName: string;
    username: string;
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
    const { user, updateProfile, updateAvatar, refreshUser } = useAuth();
    const { language } = useLanguage();
    const [saving, setSaving] = useState(false);
    const [uploadingAvatar, setUploadingAvatar] = useState(false);
    const [saveMessage, setSaveMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [profile, setProfile] = useState<ProfileData>({
        firstName: '',
        lastName: '',
        username: '',
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
    const [previewUrl, setPreviewUrl] = useState<string>('');

    // Load user data from DB on mount
    useEffect(() => {
        const loadProfile = async () => {
            if (!user?.uuid) return;
            try {
                // Refresh from DB
                await refreshUser();
            } catch (err) {
                console.error('Failed to load profile:', err);
            }
        };
        loadProfile();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Sync user data to form
    useEffect(() => {
        if (user) {
            setProfile(prev => ({
                ...prev,
                firstName: user.firstName || '',
                lastName: user.lastName || '',
                username: user.username || '',
                phone: user.phone || '',
                avatarUrl: user.avatarUrl || '',
            }));
            setPreviewUrl(user.avatarUrl || '');
        }
    }, [user]);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
        const { name, value } = e.target;
        setProfile(prev => ({ ...prev, [name]: value }));
    };

    const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        // Validate file size (max 5MB)
        if (file.size > 5 * 1024 * 1024) {
            setSaveMessage({
                type: 'error',
                text: language === 'th' ? 'ไฟล์ใหญ่เกินไป (สูงสุด 5MB)' : 'File too large (max 5MB)',
            });
            return;
        }

        // Validate file type
        const validTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
        if (!validTypes.includes(file.type)) {
            setSaveMessage({
                type: 'error',
                text: language === 'th' ? 'รองรับเฉพาะไฟล์ JPEG, PNG, GIF, WebP' : 'Only JPEG, PNG, GIF, WebP supported',
            });
            return;
        }

        // Show preview immediately
        const reader = new FileReader();
        reader.onload = (event) => {
            setPreviewUrl(event.target?.result as string);
        };
        reader.readAsDataURL(file);

        // Upload to server
        setUploadingAvatar(true);
        setSaveMessage(null);
        try {
            await updateAvatar(file);
            setSaveMessage({
                type: 'success',
                text: language === 'th' ? 'อัปโหลดรูปโปรไฟล์สำเร็จ!' : 'Profile picture uploaded!',
            });
        } catch (error) {
            console.error('Failed to upload avatar:', error);
            setSaveMessage({
                type: 'error',
                text: language === 'th' ? 'อัปโหลดรูปไม่สำเร็จ กรุณาลองใหม่' : 'Upload failed. Please try again.',
            });
            // Revert preview
            setPreviewUrl(user?.avatarUrl || '');
        } finally {
            setUploadingAvatar(false);
            // Reset file input
            if (fileInputRef.current) {
                fileInputRef.current.value = '';
            }
        }
    };

    const handleRemoveAvatar = async () => {
        setUploadingAvatar(true);
        setSaveMessage(null);
        try {
            await updateProfile({ avatarUrl: '' } as any);
            setPreviewUrl('');
            setProfile(prev => ({ ...prev, avatarUrl: '' }));
            setSaveMessage({
                type: 'success',
                text: language === 'th' ? 'ลบรูปโปรไฟล์แล้ว' : 'Profile picture removed',
            });
        } catch (error) {
            console.error('Failed to remove avatar:', error);
        } finally {
            setUploadingAvatar(false);
        }
    };

    const handleSave = async () => {
        setSaving(true);
        setSaveMessage(null);
        try {
            await updateProfile({
                firstName: profile.firstName,
                lastName: profile.lastName,
                username: profile.username,
                phone: profile.phone,
            });
            setSaveMessage({
                type: 'success',
                text: language === 'th' ? 'บันทึกข้อมูลสำเร็จ!' : 'Profile saved successfully!',
            });
        } catch (error) {
            console.error('Failed to save profile:', error);
            setSaveMessage({
                type: 'error',
                text: language === 'th' ? 'เกิดข้อผิดพลาดในการบันทึก' : 'Failed to save profile',
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
                { label: 'โปรไฟล์', labelEn: 'Profile' },
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
                        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                            <div style={{
                                width: '100px',
                                height: '100px',
                                borderRadius: '50%',
                                overflow: 'hidden',
                                border: '3px solid #e0e0e0',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                flexShrink: 0,
                                position: 'relative',
                                /* Use a checkerboard pattern for transparent images */
                                backgroundImage: previewUrl
                                    ? 'linear-gradient(45deg, #ccc 25%, transparent 25%), linear-gradient(-45deg, #ccc 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #ccc 75%), linear-gradient(-45deg, transparent 75%, #ccc 75%)'
                                    : 'none',
                                backgroundSize: '10px 10px',
                                backgroundPosition: '0 0, 0 5px, 5px -5px, -5px 0px',
                                backgroundColor: previewUrl ? '#f0f0f0' : '#e0e0e0',
                            }}>
                                {uploadingAvatar && (
                                    <div style={{
                                        position: 'absolute',
                                        inset: 0,
                                        background: 'rgba(0,0,0,0.5)',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        zIndex: 2,
                                        borderRadius: '50%',
                                    }}>
                                        <div style={{
                                            width: '24px',
                                            height: '24px',
                                            border: '3px solid #fff',
                                            borderTopColor: 'transparent',
                                            borderRadius: '50%',
                                            animation: 'spin 1s linear infinite',
                                        }} />
                                    </div>
                                )}
                                {previewUrl ? (
                                    <img
                                        src={previewUrl}
                                        alt="Avatar"
                                        style={{
                                            width: '100%',
                                            height: '100%',
                                            objectFit: 'cover',
                                        }}
                                    />
                                ) : (
                                    <svg width="50" height="50" viewBox="0 0 80 80" fill="none">
                                        <path d="M40 40C46.07 40 51 35.07 51 29C51 22.93 46.07 18 40 18C33.93 18 29 22.93 29 29C29 35.07 33.93 40 40 40Z" fill="#9e9e9e" />
                                        <path d="M40 46C28.95 46 20 54.95 20 66H60C60 54.95 51.05 46 40 46Z" fill="#9e9e9e" />
                                    </svg>
                                )}
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                <input
                                    type="file"
                                    ref={fileInputRef}
                                    onChange={handleImageUpload}
                                    accept="image/jpeg,image/png,image/gif,image/webp"
                                    style={{ display: 'none' }}
                                />
                                <button
                                    type="button"
                                    onClick={() => fileInputRef.current?.click()}
                                    disabled={uploadingAvatar}
                                    style={{
                                        padding: '8px 16px',
                                        background: 'linear-gradient(135deg, #0066cc, #0052a3)',
                                        color: '#fff',
                                        border: 'none',
                                        borderRadius: '6px',
                                        fontSize: '13px',
                                        fontWeight: '600',
                                        cursor: uploadingAvatar ? 'not-allowed' : 'pointer',
                                        opacity: uploadingAvatar ? 0.6 : 1,
                                        fontFamily: "'Prompt', sans-serif",
                                    }}
                                >
                                    {uploadingAvatar
                                        ? (language === 'th' ? 'กำลังอัปโหลด...' : 'Uploading...')
                                        : (language === 'th' ? 'เปลี่ยนรูปโปรไฟล์' : 'Change Photo')
                                    }
                                </button>
                                {previewUrl && (
                                    <button
                                        type="button"
                                        onClick={handleRemoveAvatar}
                                        disabled={uploadingAvatar}
                                        style={{
                                            padding: '6px 12px',
                                            background: '#fff',
                                            color: '#c62828',
                                            border: '1px solid #ffcdd2',
                                            borderRadius: '6px',
                                            fontSize: '12px',
                                            cursor: uploadingAvatar ? 'not-allowed' : 'pointer',
                                            fontFamily: "'Prompt', sans-serif",
                                        }}
                                    >
                                        {language === 'th' ? 'ลบรูป' : 'Remove Photo'}
                                    </button>
                                )}
                                <p style={{ fontSize: '11px', color: '#888', margin: 0 }}>
                                    {language === 'th'
                                        ? 'รองรับ JPG, PNG, GIF, WebP (สูงสุด 5MB) - PNG โปร่งใสรองรับ'
                                        : 'JPG, PNG, GIF, WebP (max 5MB) - Transparent PNG supported'}
                                </p>
                            </div>
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

                    {/* Row 2: Username, วันเดือนปีเกิด, เบอร์โทรศัพท์ */}
                    <div className="admin-form-row">
                        <div className="admin-form-group">
                            <label className="admin-form-label">
                                {language === 'th' ? 'ชื่อผู้ใช้' : 'Username'}
                            </label>
                            <input
                                type="text"
                                name="username"
                                value={profile.username}
                                onChange={handleChange}
                                className="admin-form-input"
                                placeholder={language === 'th' ? 'ชื่อผู้ใช้' : 'Username'}
                            />
                        </div>
                        <div className="admin-form-group">
                            <label className="admin-form-label">
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

                {/* Email display (read-only) */}
                <div className="admin-form-section">
                    <div className="admin-form-group">
                        <label className="admin-form-label">
                            {language === 'th' ? 'อีเมล' : 'Email'}
                        </label>
                        <input
                            type="email"
                            value={user?.email || ''}
                            disabled
                            className="admin-form-input"
                            style={{ backgroundColor: '#f5f5f5', cursor: 'not-allowed' }}
                        />
                        <small style={{ color: '#888', fontSize: '11px' }}>
                            {language === 'th' ? 'ไม่สามารถเปลี่ยนอีเมลได้' : 'Email cannot be changed'}
                        </small>
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
                            border: `1px solid ${saveMessage.type === 'success' ? '#c8e6c9' : '#ffcdd2'}`,
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
                            boxShadow: '0 4px 12px rgba(0, 102, 204, 0.25)',
                            fontFamily: "'Prompt', sans-serif",
                        }}
                    >
                        {saving
                            ? (language === 'th' ? 'กำลังบันทึก...' : 'Saving...')
                            : (language === 'th' ? 'บันทึกข้อมูล' : 'Save Changes')
                        }
                    </button>
                </div>
            </div>

            <style jsx>{`
                @keyframes spin {
                    from { transform: rotate(0deg); }
                    to { transform: rotate(360deg); }
                }
            `}</style>
        </AdminLayout>
    );
}
