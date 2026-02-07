'use client';

import Link from 'next/link';
import Image from 'next/image';
import { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { useTheme } from '@/lib/theme-context';
import { useLanguage } from '@/lib/language-context';
import CursorSpotlight from '@/components/CursorSpotlight';

export default function ProfilePage() {
    const router = useRouter();
    const { theme, toggleTheme } = useTheme();
    const { language } = useLanguage();
    const { user, isAuthenticated, isLoading, updateProfile, updateAvatar, updatePassword, logout } = useAuth();
    
    const fileInputRef = useRef<HTMLInputElement>(null);
    const cameraInputRef = useRef<HTMLInputElement>(null);
    
    const [activeTab, setActiveTab] = useState<'profile' | 'password'>('profile');
    const [saving, setSaving] = useState(false);
    const [uploadingAvatar, setUploadingAvatar] = useState(false);
    const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
    
    // Profile form
    const [profileForm, setProfileForm] = useState({
        firstName: '',
        lastName: '',
        username: '',
        phone: ''
    });
    
    // Password form
    const [passwordForm, setPasswordForm] = useState({
        oldPassword: '',
        newPassword: '',
        confirmPassword: ''
    });

    useEffect(() => {
        if (!isLoading && !isAuthenticated) {
            router.push('/login');
        }
    }, [isLoading, isAuthenticated, router]);

    useEffect(() => {
        if (user) {
            setProfileForm({
                firstName: user.firstName || '',
                lastName: user.lastName || '',
                username: user.username || '',
                phone: user.phone || ''
            });
        }
    }, [user]);

    const handleAvatarClick = () => {
        // Show options for file or camera
        if (fileInputRef.current) {
            fileInputRef.current.click();
        }
    };

    const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        // Validate file type
        if (!file.type.startsWith('image/')) {
            setMessage({ type: 'error', text: language === 'th' ? 'กรุณาเลือกไฟล์รูปภาพ' : 'Please select an image file' });
            return;
        }

        // Validate file size (max 5MB)
        if (file.size > 5 * 1024 * 1024) {
            setMessage({ type: 'error', text: language === 'th' ? 'ไฟล์ต้องมีขนาดไม่เกิน 5MB' : 'File must be less than 5MB' });
            return;
        }

        setUploadingAvatar(true);
        setMessage(null);

        try {
            await updateAvatar(file);
            setMessage({ type: 'success', text: language === 'th' ? 'อัพเดทรูปโปรไฟล์สำเร็จ' : 'Profile picture updated successfully' });
        } catch (err) {
            console.error('Avatar upload failed:', err);
            setMessage({ type: 'error', text: language === 'th' ? 'อัพเดทรูปโปรไฟล์ไม่สำเร็จ' : 'Failed to update profile picture' });
        } finally {
            setUploadingAvatar(false);
        }
    };

    const handleProfileSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setSaving(true);
        setMessage(null);

        try {
            await updateProfile(profileForm);
            setMessage({ type: 'success', text: language === 'th' ? 'บันทึกข้อมูลสำเร็จ' : 'Profile updated successfully' });
        } catch (err: any) {
            console.error('Profile update failed:', err);
            const errorMsg = err?.response?.data?.message || (language === 'th' ? 'บันทึกข้อมูลไม่สำเร็จ' : 'Failed to update profile');
            setMessage({ type: 'error', text: errorMsg });
        } finally {
            setSaving(false);
        }
    };

    const handlePasswordSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        
        if (passwordForm.newPassword !== passwordForm.confirmPassword) {
            setMessage({ type: 'error', text: language === 'th' ? 'รหัสผ่านใหม่ไม่ตรงกัน' : 'New passwords do not match' });
            return;
        }

        if (passwordForm.newPassword.length < 6) {
            setMessage({ type: 'error', text: language === 'th' ? 'รหัสผ่านต้องมีอย่างน้อย 6 ตัวอักษร' : 'Password must be at least 6 characters' });
            return;
        }

        setSaving(true);
        setMessage(null);

        try {
            await updatePassword(passwordForm.oldPassword, passwordForm.newPassword);
            setMessage({ type: 'success', text: language === 'th' ? 'เปลี่ยนรหัสผ่านสำเร็จ' : 'Password changed successfully' });
            setPasswordForm({ oldPassword: '', newPassword: '', confirmPassword: '' });
        } catch (err: any) {
            console.error('Password change failed:', err);
            const errorMsg = err?.response?.data?.message || (language === 'th' ? 'เปลี่ยนรหัสผ่านไม่สำเร็จ' : 'Failed to change password');
            setMessage({ type: 'error', text: errorMsg });
        } finally {
            setSaving(false);
        }
    };

    if (isLoading) {
        return (
            <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--background)' }}>
                <div className="w-8 h-8 border-4 rounded-full animate-spin" style={{ borderColor: 'var(--accent)', borderTopColor: 'transparent' }}></div>
            </div>
        );
    }

    if (!user) return null;

    return (
        <div className="min-h-screen" style={{ background: 'var(--background)' }}>
            <CursorSpotlight size={500} />

            {/* Header */}
            <header className="sticky top-0 z-50 glass">
                <div className="max-w-4xl mx-auto px-4 py-3 flex items-center justify-between">
                    <Link href="/" className="flex items-center gap-2">
                        <Image
                            src={theme === 'dark' ? '/logo-white.png' : '/logo-black.png'}
                            alt="RACETIME"
                            width={100}
                            height={32}
                            className="h-8 w-auto"
                        />
                    </Link>
                    <div className="flex items-center gap-2">
                        <button onClick={toggleTheme} className="p-2 rounded-xl glass">
                            <span className="text-base">{theme === 'dark' ? '☀️' : '🌙'}</span>
                        </button>
                        <button
                            onClick={() => { logout(); router.push('/'); }}
                            className="px-3 py-2 text-sm font-medium rounded-xl glass"
                            style={{ color: 'var(--error)' }}
                        >
                            {language === 'th' ? 'ออกจากระบบ' : 'Logout'}
                        </button>
                    </div>
                </div>
            </header>

            {/* Main Content */}
            <main className="max-w-2xl mx-auto px-4 py-8 relative z-10">
                <h1 className="text-2xl font-bold mb-6" style={{ color: 'var(--foreground)' }}>
                    {language === 'th' ? 'ตั้งค่าโปรไฟล์' : 'Profile Settings'}
                </h1>

                {/* Avatar Section */}
                <div className="glass rounded-2xl p-6 mb-6">
                    <div className="flex flex-col sm:flex-row items-center gap-6">
                        {/* Avatar */}
                        <div className="relative">
                            <div 
                                onClick={handleAvatarClick}
                                className="w-28 h-28 sm:w-32 sm:h-32 rounded-full overflow-hidden cursor-pointer relative group"
                                style={{ background: 'var(--muted)' }}
                            >
                                {user.avatarUrl ? (
                                    <img src={user.avatarUrl} alt="Avatar" className="w-full h-full object-cover" />
                                ) : (
                                    <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-blue-500 to-purple-600 text-white text-4xl font-bold">
                                        {user.firstName?.[0] || user.email?.[0]?.toUpperCase() || 'U'}
                                    </div>
                                )}
                                {/* Overlay */}
                                <div className="absolute inset-0 bg-black/50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                                    <span className="text-white text-2xl">📷</span>
                                </div>
                                {uploadingAvatar && (
                                    <div className="absolute inset-0 bg-black/70 flex items-center justify-center">
                                        <div className="w-6 h-6 border-2 border-white rounded-full animate-spin" style={{ borderTopColor: 'transparent' }}></div>
                                    </div>
                                )}
                            </div>
                            {/* Hidden file inputs */}
                            <input
                                ref={fileInputRef}
                                type="file"
                                accept="image/*"
                                className="hidden"
                                onChange={handleFileChange}
                            />
                            <input
                                ref={cameraInputRef}
                                type="file"
                                accept="image/*"
                                capture="user"
                                className="hidden"
                                onChange={handleFileChange}
                            />
                        </div>

                        {/* User Info */}
                        <div className="text-center sm:text-left flex-1">
                            <h2 className="text-xl font-bold" style={{ color: 'var(--foreground)' }}>
                                {user.firstName} {user.lastName}
                            </h2>
                            <p className="text-sm" style={{ color: 'var(--muted-foreground)' }}>{user.email}</p>
                            <p className="text-xs mt-1 px-2 py-0.5 rounded-full inline-block" style={{ background: 'var(--accent)', color: 'var(--accent-foreground)' }}>
                                {user.role}
                            </p>
                            
                            {/* Mobile: Camera/File buttons */}
                            <div className="flex gap-2 mt-4 justify-center sm:justify-start">
                                <button
                                    onClick={() => fileInputRef.current?.click()}
                                    className="px-3 py-2 text-xs font-medium rounded-lg glass"
                                    style={{ color: 'var(--foreground)' }}
                                >
                                    📁 {language === 'th' ? 'เลือกรูป' : 'Choose File'}
                                </button>
                                <button
                                    onClick={() => cameraInputRef.current?.click()}
                                    className="px-3 py-2 text-xs font-medium rounded-lg glass sm:hidden"
                                    style={{ color: 'var(--foreground)' }}
                                >
                                    📷 {language === 'th' ? 'ถ่ายรูป' : 'Take Photo'}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Message */}
                {message && (
                    <div 
                        className="mb-6 p-4 rounded-xl flex items-center gap-3 text-sm"
                        style={{ 
                            background: message.type === 'success' ? 'var(--success-bg)' : 'var(--error-bg)',
                            color: message.type === 'success' ? 'var(--success)' : 'var(--error)',
                            border: `1px solid ${message.type === 'success' ? 'var(--success)' : 'var(--error)'}`
                        }}
                    >
                        <span>{message.type === 'success' ? '✓' : '⚠'}</span>
                        {message.text}
                    </div>
                )}

                {/* Tabs */}
                <div className="flex gap-2 mb-6">
                    <button
                        onClick={() => setActiveTab('profile')}
                        className={`flex-1 py-3 px-4 rounded-xl font-medium text-sm transition-all ${activeTab === 'profile' ? 'btn-glow' : 'glass'}`}
                        style={activeTab === 'profile' ? { background: 'var(--accent)', color: 'var(--accent-foreground)' } : { color: 'var(--foreground)' }}
                    >
                        👤 {language === 'th' ? 'ข้อมูลส่วนตัว' : 'Profile Info'}
                    </button>
                    <button
                        onClick={() => setActiveTab('password')}
                        className={`flex-1 py-3 px-4 rounded-xl font-medium text-sm transition-all ${activeTab === 'password' ? 'btn-glow' : 'glass'}`}
                        style={activeTab === 'password' ? { background: 'var(--accent)', color: 'var(--accent-foreground)' } : { color: 'var(--foreground)' }}
                    >
                        🔒 {language === 'th' ? 'เปลี่ยนรหัสผ่าน' : 'Change Password'}
                    </button>
                </div>

                {/* Profile Form */}
                {activeTab === 'profile' && (
                    <form onSubmit={handleProfileSubmit} className="glass rounded-2xl p-6 space-y-5">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div>
                                <label className="block text-xs uppercase tracking-wider font-medium mb-2" style={{ color: 'var(--muted-foreground)' }}>
                                    {language === 'th' ? 'ชื่อ' : 'First Name'}
                                </label>
                                <input
                                    type="text"
                                    value={profileForm.firstName}
                                    onChange={(e) => setProfileForm({ ...profileForm, firstName: e.target.value })}
                                    className="w-full px-4 py-3 rounded-xl glass focus:outline-none"
                                    style={{ color: 'var(--foreground)' }}
                                />
                            </div>
                            <div>
                                <label className="block text-xs uppercase tracking-wider font-medium mb-2" style={{ color: 'var(--muted-foreground)' }}>
                                    {language === 'th' ? 'นามสกุล' : 'Last Name'}
                                </label>
                                <input
                                    type="text"
                                    value={profileForm.lastName}
                                    onChange={(e) => setProfileForm({ ...profileForm, lastName: e.target.value })}
                                    className="w-full px-4 py-3 rounded-xl glass focus:outline-none"
                                    style={{ color: 'var(--foreground)' }}
                                />
                            </div>
                        </div>

                        <div>
                            <label className="block text-xs uppercase tracking-wider font-medium mb-2" style={{ color: 'var(--muted-foreground)' }}>
                                {language === 'th' ? 'ชื่อผู้ใช้' : 'Username'}
                            </label>
                            <input
                                type="text"
                                value={profileForm.username}
                                onChange={(e) => setProfileForm({ ...profileForm, username: e.target.value })}
                                className="w-full px-4 py-3 rounded-xl glass focus:outline-none"
                                style={{ color: 'var(--foreground)' }}
                            />
                        </div>

                        <div>
                            <label className="block text-xs uppercase tracking-wider font-medium mb-2" style={{ color: 'var(--muted-foreground)' }}>
                                {language === 'th' ? 'เบอร์โทรศัพท์' : 'Phone'}
                            </label>
                            <input
                                type="tel"
                                value={profileForm.phone}
                                onChange={(e) => setProfileForm({ ...profileForm, phone: e.target.value })}
                                className="w-full px-4 py-3 rounded-xl glass focus:outline-none"
                                style={{ color: 'var(--foreground)' }}
                            />
                        </div>

                        <div>
                            <label className="block text-xs uppercase tracking-wider font-medium mb-2" style={{ color: 'var(--muted-foreground)' }}>
                                {language === 'th' ? 'อีเมล' : 'Email'}
                            </label>
                            <input
                                type="email"
                                value={user.email}
                                disabled
                                className="w-full px-4 py-3 rounded-xl glass focus:outline-none opacity-60 cursor-not-allowed"
                                style={{ color: 'var(--foreground)' }}
                            />
                            <p className="text-xs mt-1" style={{ color: 'var(--muted-foreground)' }}>
                                {language === 'th' ? 'ไม่สามารถเปลี่ยนอีเมลได้' : 'Email cannot be changed'}
                            </p>
                        </div>

                        <button
                            type="submit"
                            disabled={saving}
                            className="w-full py-4 font-semibold rounded-xl btn-glow disabled:opacity-50"
                            style={{ background: 'var(--accent)', color: 'var(--accent-foreground)' }}
                        >
                            {saving ? (
                                <span className="flex items-center justify-center gap-2">
                                    <div className="w-5 h-5 border-2 rounded-full animate-spin" style={{ borderColor: 'var(--accent-foreground)', borderTopColor: 'transparent' }}></div>
                                    {language === 'th' ? 'กำลังบันทึก...' : 'Saving...'}
                                </span>
                            ) : (
                                language === 'th' ? 'บันทึกข้อมูล' : 'Save Changes'
                            )}
                        </button>
                    </form>
                )}

                {/* Password Form */}
                {activeTab === 'password' && (
                    <form onSubmit={handlePasswordSubmit} className="glass rounded-2xl p-6 space-y-5">
                        <div>
                            <label className="block text-xs uppercase tracking-wider font-medium mb-2" style={{ color: 'var(--muted-foreground)' }}>
                                {language === 'th' ? 'รหัสผ่านปัจจุบัน' : 'Current Password'}
                            </label>
                            <input
                                type="password"
                                value={passwordForm.oldPassword}
                                onChange={(e) => setPasswordForm({ ...passwordForm, oldPassword: e.target.value })}
                                className="w-full px-4 py-3 rounded-xl glass focus:outline-none"
                                style={{ color: 'var(--foreground)' }}
                                placeholder="••••••••"
                                required
                            />
                        </div>

                        <div>
                            <label className="block text-xs uppercase tracking-wider font-medium mb-2" style={{ color: 'var(--muted-foreground)' }}>
                                {language === 'th' ? 'รหัสผ่านใหม่' : 'New Password'}
                            </label>
                            <input
                                type="password"
                                value={passwordForm.newPassword}
                                onChange={(e) => setPasswordForm({ ...passwordForm, newPassword: e.target.value })}
                                className="w-full px-4 py-3 rounded-xl glass focus:outline-none"
                                style={{ color: 'var(--foreground)' }}
                                placeholder="••••••••"
                                required
                            />
                        </div>

                        <div>
                            <label className="block text-xs uppercase tracking-wider font-medium mb-2" style={{ color: 'var(--muted-foreground)' }}>
                                {language === 'th' ? 'ยืนยันรหัสผ่านใหม่' : 'Confirm New Password'}
                            </label>
                            <input
                                type="password"
                                value={passwordForm.confirmPassword}
                                onChange={(e) => setPasswordForm({ ...passwordForm, confirmPassword: e.target.value })}
                                className="w-full px-4 py-3 rounded-xl glass focus:outline-none"
                                style={{ color: 'var(--foreground)' }}
                                placeholder="••••••••"
                                required
                            />
                        </div>

                        <button
                            type="submit"
                            disabled={saving}
                            className="w-full py-4 font-semibold rounded-xl btn-glow disabled:opacity-50"
                            style={{ background: 'var(--accent)', color: 'var(--accent-foreground)' }}
                        >
                            {saving ? (
                                <span className="flex items-center justify-center gap-2">
                                    <div className="w-5 h-5 border-2 rounded-full animate-spin" style={{ borderColor: 'var(--accent-foreground)', borderTopColor: 'transparent' }}></div>
                                    {language === 'th' ? 'กำลังเปลี่ยน...' : 'Changing...'}
                                </span>
                            ) : (
                                language === 'th' ? 'เปลี่ยนรหัสผ่าน' : 'Change Password'
                            )}
                        </button>
                    </form>
                )}

                {/* Back Link */}
                <div className="text-center mt-8">
                    <Link
                        href="/"
                        className="text-sm inline-flex items-center gap-2"
                        style={{ color: 'var(--muted-foreground)' }}
                    >
                        ← {language === 'th' ? 'กลับหน้าแรก' : 'Back to Home'}
                    </Link>
                </div>
            </main>
        </div>
    );
}
