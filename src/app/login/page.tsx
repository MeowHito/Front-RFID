'use client';

import Link from 'next/link';
import Image from 'next/image';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { useTheme } from '@/lib/theme-context';
import CursorSpotlight from '@/components/CursorSpotlight';

export default function LoginPage() {
    const router = useRouter();
    const { theme, toggleTheme } = useTheme();
    const { login, isAuthenticated, isAdmin } = useAuth();
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    const [focusedField, setFocusedField] = useState<string | null>(null);

    useEffect(() => {
        if (isAuthenticated) {
            if (isAdmin) {
                router.push('/admin');
            } else {
                router.push('/');
            }
        }
    }, [isAuthenticated, isAdmin, router]);

    if (isAuthenticated) {
        return null;
    }

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setLoading(true);

        try {
            await login(email, password);
            router.push('/admin');
        } catch (err: unknown) {
            console.error('Login failed:', err);
            const errorMessage = err instanceof Error ? err.message : 'อีเมลหรือรหัสผ่านไม่ถูกต้อง';
            setError(errorMessage);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen flex items-center justify-center px-6" style={{ background: 'var(--background)' }}>
            {/* Cursor Spotlight */}
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
                <div className="text-center mb-10">
                    <Link href="/" className="inline-block scale-hover">
                        <Image
                            src={theme === 'dark' ? '/logo-white.png' : '/logo-black.png'}
                            alt="RACETIME"
                            width={150}
                            height={50}
                            className="mx-auto h-12 w-auto"
                        />
                    </Link>
                    <h1 className="text-2xl font-bold mt-8" style={{ color: 'var(--foreground)' }}>เข้าสู่ระบบ</h1>
                    <p className="mt-2 text-sm" style={{ color: 'var(--muted-foreground)' }}>RACETIME Admin Portal</p>
                </div>

                {/* Login Card */}
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

                    <form onSubmit={handleSubmit} className="space-y-5">
                        <div>
                            <label className="block text-xs uppercase tracking-wider font-medium mb-2" style={{ color: 'var(--muted-foreground)' }}>
                                อีเมล
                            </label>
                            <input
                                type="email"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                onFocus={() => setFocusedField('email')}
                                onBlur={() => setFocusedField(null)}
                                className="w-full px-4 py-3.5 rounded-xl glass focus:outline-none transition-all"
                                style={{
                                    color: 'var(--foreground)',
                                    transform: focusedField === 'email' ? 'scale(1.02)' : 'scale(1)',
                                    borderColor: focusedField === 'email' ? 'var(--accent)' : 'transparent'
                                }}
                                placeholder="admin@example.com"
                                required
                            />
                        </div>

                        <div>
                            <label className="block text-xs uppercase tracking-wider font-medium mb-2" style={{ color: 'var(--muted-foreground)' }}>
                                รหัสผ่าน
                            </label>
                            <input
                                type="password"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                onFocus={() => setFocusedField('password')}
                                onBlur={() => setFocusedField(null)}
                                className="w-full px-4 py-3.5 rounded-xl glass focus:outline-none transition-all"
                                style={{
                                    color: 'var(--foreground)',
                                    transform: focusedField === 'password' ? 'scale(1.02)' : 'scale(1)',
                                    borderColor: focusedField === 'password' ? 'var(--accent)' : 'transparent'
                                }}
                                placeholder="••••••••"
                                required
                            />
                        </div>

                        <button
                            type="submit"
                            disabled={loading}
                            className="w-full py-4 font-semibold rounded-xl btn-glow disabled:opacity-50 disabled:cursor-not-allowed"
                            style={{ background: 'var(--accent)', color: 'var(--accent-foreground)' }}
                        >
                            {loading ? (
                                <span className="flex items-center justify-center gap-3">
                                    <div className="w-5 h-5 border-2 rounded-full animate-spin" style={{ borderColor: 'var(--accent-foreground)', borderTopColor: 'transparent' }}></div>
                                    กำลังเข้าสู่ระบบ...
                                </span>
                            ) : (
                                'เข้าสู่ระบบ'
                            )}
                        </button>
                    </form>

                    {/* Demo Credentials */}
                    <div
                        className="mt-6 p-4 rounded-xl glass scale-hover"
                        style={{ background: 'var(--warning-bg)' }}
                    >
                        <div className="text-xs font-medium mb-2 uppercase tracking-wider" style={{ color: 'var(--warning)' }}>
                            Demo Credentials
                        </div>
                        <div className="text-sm font-mono" style={{ color: 'var(--foreground)' }}>
                            admin@rfidtiming.com / admin123
                        </div>
                    </div>

                    <div className="mt-6 text-center space-y-3">
                        <p className="text-sm" style={{ color: 'var(--muted-foreground)' }}>
                            ยังไม่มีบัญชี?{' '}
                            <Link href="/register" className="font-semibold link-underline" style={{ color: 'var(--accent)' }}>
                                สมัครสมาชิก
                            </Link>
                        </p>
                        <Link
                            href="/"
                            className="text-sm inline-flex items-center gap-2 link-underline"
                            style={{ color: 'var(--muted-foreground)' }}
                        >
                            ← กลับหน้าแรก
                        </Link>
                    </div>
                </div>

                {/* Footer */}
                <div className="text-center mt-8 text-xs" style={{ color: 'var(--muted-foreground)' }}>
                    © 2026 RACETIME. Secure Portal
                </div>
            </div>
        </div>
    );
}
