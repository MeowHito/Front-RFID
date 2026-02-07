'use client';

import Link from 'next/link';
import Image from 'next/image';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { useTheme } from '@/lib/theme-context';
import { useLanguage } from '@/lib/language-context';
import CursorSpotlight from '@/components/CursorSpotlight';

export default function RegisterPage() {
    const router = useRouter();
    const { theme, toggleTheme } = useTheme();
    const { language } = useLanguage();
    const { register, isAuthenticated } = useAuth();
    const [formData, setFormData] = useState({
        email: '',
        password: '',
        confirmPassword: '',
        firstName: '',
        lastName: '',
        phone: ''
    });
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    const [focusedField, setFocusedField] = useState<string | null>(null);

    if (isAuthenticated) {
        router.push('/');
        return null;
    }

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setFormData({ ...formData, [e.target.name]: e.target.value });
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');

        // Validate
        if (formData.password !== formData.confirmPassword) {
            setError(language === 'th' ? 'รหัสผ่านไม่ตรงกัน' : 'Passwords do not match');
            return;
        }

        if (formData.password.length < 6) {
            setError(language === 'th' ? 'รหัสผ่านต้องมีอย่างน้อย 6 ตัวอักษร' : 'Password must be at least 6 characters');
            return;
        }

        setLoading(true);

        try {
            await register({
                email: formData.email,
                password: formData.password,
                firstName: formData.firstName,
                lastName: formData.lastName,
                phone: formData.phone
            });
            router.push('/');
        } catch (err: unknown) {
            console.error('Registration failed:', err);
            if (err && typeof err === 'object' && 'response' in err) {
                const axiosError = err as { response?: { data?: { message?: string } } };
                setError(axiosError.response?.data?.message || (language === 'th' ? 'เกิดข้อผิดพลาด กรุณาลองใหม่' : 'An error occurred. Please try again.'));
            } else {
                setError(language === 'th' ? 'เกิดข้อผิดพลาด กรุณาลองใหม่' : 'An error occurred. Please try again.');
            }
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen flex items-center justify-center px-6 py-12" style={{ background: 'var(--background)' }}>
            <CursorSpotlight size={500} />

            <div className="max-w-md w-full relative z-10">
                {/* Theme Toggle */}
                <div className="flex justify-end mb-6">
                    <button
                        onClick={toggleTheme}
                        className="p-2.5 rounded-xl glass scale-hover"
                    >
                        <span className="text-lg">{theme === 'dark' ? '☀️' : '🌙'}</span>
                    </button>
                </div>

                {/* Logo */}
                <div className="text-center mb-8">
                    <Link href="/" className="inline-block scale-hover">
                        <Image
                            src={theme === 'dark' ? '/logo-white.png' : '/logo-black.png'}
                            alt="RACETIME"
                            width={150}
                            height={50}
                            className="mx-auto h-12 w-auto"
                        />
                    </Link>
                    <h1 className="text-2xl font-bold mt-6" style={{ color: 'var(--foreground)' }}>
                        {language === 'th' ? 'สมัครสมาชิก' : 'Create Account'}
                    </h1>
                    <p className="mt-2 text-sm" style={{ color: 'var(--muted-foreground)' }}>
                        {language === 'th' ? 'สร้างบัญชีเพื่อดูผลการแข่งขัน' : 'Create an account to view race results'}
                    </p>
                </div>

                {/* Register Card */}
                <div className="glass rounded-2xl p-8 hover-glow water-drop">
                    {error && (
                        <div
                            className="mb-6 p-4 rounded-xl flex items-center gap-3 text-sm"
                            style={{ background: 'var(--error-bg)', color: 'var(--error)', border: '1px solid var(--error)' }}
                        >
                            <span className="icon-bounce">⚠</span>
                            {error}
                        </div>
                    )}

                    <form onSubmit={handleSubmit} className="space-y-4">
                        {/* Name Row */}
                        <div className="grid grid-cols-2 gap-3">
                            <div>
                                <label className="block text-xs uppercase tracking-wider font-medium mb-2" style={{ color: 'var(--muted-foreground)' }}>
                                    {language === 'th' ? 'ชื่อ' : 'First Name'}
                                </label>
                                <input
                                    type="text"
                                    name="firstName"
                                    value={formData.firstName}
                                    onChange={handleChange}
                                    onFocus={() => setFocusedField('firstName')}
                                    onBlur={() => setFocusedField(null)}
                                    className="w-full px-4 py-3 rounded-xl glass focus:outline-none transition-all"
                                    style={{
                                        color: 'var(--foreground)',
                                        transform: focusedField === 'firstName' ? 'scale(1.02)' : 'scale(1)',
                                    }}
                                    placeholder={language === 'th' ? 'ชื่อ' : 'John'}
                                />
                            </div>
                            <div>
                                <label className="block text-xs uppercase tracking-wider font-medium mb-2" style={{ color: 'var(--muted-foreground)' }}>
                                    {language === 'th' ? 'นามสกุล' : 'Last Name'}
                                </label>
                                <input
                                    type="text"
                                    name="lastName"
                                    value={formData.lastName}
                                    onChange={handleChange}
                                    onFocus={() => setFocusedField('lastName')}
                                    onBlur={() => setFocusedField(null)}
                                    className="w-full px-4 py-3 rounded-xl glass focus:outline-none transition-all"
                                    style={{
                                        color: 'var(--foreground)',
                                        transform: focusedField === 'lastName' ? 'scale(1.02)' : 'scale(1)',
                                    }}
                                    placeholder={language === 'th' ? 'นามสกุล' : 'Doe'}
                                />
                            </div>
                        </div>

                        {/* Email */}
                        <div>
                            <label className="block text-xs uppercase tracking-wider font-medium mb-2" style={{ color: 'var(--muted-foreground)' }}>
                                {language === 'th' ? 'อีเมล' : 'Email'} <span style={{ color: 'var(--error)' }}>*</span>
                            </label>
                            <input
                                type="email"
                                name="email"
                                value={formData.email}
                                onChange={handleChange}
                                onFocus={() => setFocusedField('email')}
                                onBlur={() => setFocusedField(null)}
                                className="w-full px-4 py-3 rounded-xl glass focus:outline-none transition-all"
                                style={{
                                    color: 'var(--foreground)',
                                    transform: focusedField === 'email' ? 'scale(1.02)' : 'scale(1)',
                                }}
                                placeholder="you@example.com"
                                required
                            />
                        </div>

                        {/* Phone */}
                        <div>
                            <label className="block text-xs uppercase tracking-wider font-medium mb-2" style={{ color: 'var(--muted-foreground)' }}>
                                {language === 'th' ? 'เบอร์โทรศัพท์' : 'Phone Number'}
                            </label>
                            <input
                                type="tel"
                                name="phone"
                                value={formData.phone}
                                onChange={handleChange}
                                onFocus={() => setFocusedField('phone')}
                                onBlur={() => setFocusedField(null)}
                                className="w-full px-4 py-3 rounded-xl glass focus:outline-none transition-all"
                                style={{
                                    color: 'var(--foreground)',
                                    transform: focusedField === 'phone' ? 'scale(1.02)' : 'scale(1)',
                                }}
                                placeholder="0812345678"
                            />
                        </div>

                        {/* Password */}
                        <div>
                            <label className="block text-xs uppercase tracking-wider font-medium mb-2" style={{ color: 'var(--muted-foreground)' }}>
                                {language === 'th' ? 'รหัสผ่าน' : 'Password'} <span style={{ color: 'var(--error)' }}>*</span>
                            </label>
                            <input
                                type="password"
                                name="password"
                                value={formData.password}
                                onChange={handleChange}
                                onFocus={() => setFocusedField('password')}
                                onBlur={() => setFocusedField(null)}
                                className="w-full px-4 py-3 rounded-xl glass focus:outline-none transition-all"
                                style={{
                                    color: 'var(--foreground)',
                                    transform: focusedField === 'password' ? 'scale(1.02)' : 'scale(1)',
                                }}
                                placeholder="••••••••"
                                required
                            />
                        </div>

                        {/* Confirm Password */}
                        <div>
                            <label className="block text-xs uppercase tracking-wider font-medium mb-2" style={{ color: 'var(--muted-foreground)' }}>
                                {language === 'th' ? 'ยืนยันรหัสผ่าน' : 'Confirm Password'} <span style={{ color: 'var(--error)' }}>*</span>
                            </label>
                            <input
                                type="password"
                                name="confirmPassword"
                                value={formData.confirmPassword}
                                onChange={handleChange}
                                onFocus={() => setFocusedField('confirmPassword')}
                                onBlur={() => setFocusedField(null)}
                                className="w-full px-4 py-3 rounded-xl glass focus:outline-none transition-all"
                                style={{
                                    color: 'var(--foreground)',
                                    transform: focusedField === 'confirmPassword' ? 'scale(1.02)' : 'scale(1)',
                                }}
                                placeholder="••••••••"
                                required
                            />
                        </div>

                        <button
                            type="submit"
                            disabled={loading}
                            className="w-full py-4 font-semibold rounded-xl btn-glow disabled:opacity-50 disabled:cursor-not-allowed mt-6"
                            style={{ background: 'var(--accent)', color: 'var(--accent-foreground)' }}
                        >
                            {loading ? (
                                <span className="flex items-center justify-center gap-3">
                                    <div className="w-5 h-5 border-2 rounded-full animate-spin" style={{ borderColor: 'var(--accent-foreground)', borderTopColor: 'transparent' }}></div>
                                    {language === 'th' ? 'กำลังสมัคร...' : 'Creating account...'}
                                </span>
                            ) : (
                                language === 'th' ? 'สมัครสมาชิก' : 'Create Account'
                            )}
                        </button>
                    </form>

                    <div className="mt-6 text-center space-y-3">
                        <p className="text-sm" style={{ color: 'var(--muted-foreground)' }}>
                            {language === 'th' ? 'มีบัญชีอยู่แล้ว?' : 'Already have an account?'}{' '}
                            <Link href="/login" className="font-semibold link-underline" style={{ color: 'var(--accent)' }}>
                                {language === 'th' ? 'เข้าสู่ระบบ' : 'Sign in'}
                            </Link>
                        </p>
                        <Link
                            href="/"
                            className="text-sm inline-flex items-center gap-2 link-underline"
                            style={{ color: 'var(--muted-foreground)' }}
                        >
                            ← {language === 'th' ? 'กลับหน้าแรก' : 'Back to home'}
                        </Link>
                    </div>
                </div>

                {/* Footer */}
                <div className="text-center mt-8 text-xs" style={{ color: 'var(--muted-foreground)' }}>
                    © 2026 RACETIME. All rights reserved.
                </div>
            </div>
        </div>
    );
}
