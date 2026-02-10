'use client';

import { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import { useAuth } from '@/lib/auth-context';
import { useLanguage } from '@/lib/language-context';
import { useTheme } from '@/lib/theme-context';

export default function ProfileDropdown() {
    const { user, isAdmin, logout } = useAuth();
    const { language, setLanguage } = useLanguage();
    const { theme, toggleTheme } = useTheme();
    const [open, setOpen] = useState(false);
    const dropdownRef = useRef<HTMLDivElement>(null);

    // Close on outside click
    useEffect(() => {
        const handleClick = (e: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
                setOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClick);
        return () => document.removeEventListener('mousedown', handleClick);
    }, []);

    return (
        <div className="relative" ref={dropdownRef}>
            {/* Profile Button */}
            <button
                onClick={() => setOpen(!open)}
                className="flex items-center gap-2 px-3 py-2 rounded-xl glass scale-hover"
            >
                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white font-bold text-sm overflow-hidden">
                    {user?.avatarUrl ? (
                        <img src={user.avatarUrl} alt="" className="w-full h-full object-cover" />
                    ) : (
                        user?.firstName?.[0] || user?.email?.[0]?.toUpperCase() || 'U'
                    )}
                </div>
                <span className="text-sm font-medium" style={{ color: 'var(--foreground)' }}>
                    {user?.firstName || user?.email?.split('@')[0]}
                </span>
            </button>

            {/* Dropdown Menu */}
            {open && (
                <div
                    className="absolute right-0 mt-2 w-64 glass rounded-xl shadow-lg py-2 z-50"
                    style={{ backdropFilter: 'blur(20px)' }}
                >
                    {/* User Info */}
                    <div className="px-4 py-3 border-b" style={{ borderColor: 'var(--border)' }}>
                        <p className="text-sm font-semibold" style={{ color: 'var(--foreground)' }}>
                            {user?.firstName} {user?.lastName}
                        </p>
                        <p className="text-xs" style={{ color: 'var(--muted-foreground)' }}>
                            {user?.email}
                        </p>
                    </div>

                    {/* Menu Items */}
                    {isAdmin && (
                        <Link
                            href="/admin/events"
                            onClick={() => setOpen(false)}
                            className="flex items-center gap-3 px-4 py-2.5 text-sm hover:bg-white/10 transition-colors"
                            style={{ color: 'var(--foreground)' }}
                        >
                            <span>📋</span>
                            <span>{language === 'th' ? 'จัดการกิจกรรม' : 'Manage Events'}</span>
                        </Link>
                    )}
                    <Link
                        href="/profile"
                        onClick={() => setOpen(false)}
                        className="flex items-center gap-3 px-4 py-2.5 text-sm hover:bg-white/10 transition-colors"
                        style={{ color: 'var(--foreground)' }}
                    >
                        <span>⚙️</span>
                        <span>{language === 'th' ? 'ตั้งค่าโปรไฟล์' : 'Profile Settings'}</span>
                    </Link>

                    {/* Divider */}
                    <div className="my-1 border-t" style={{ borderColor: 'var(--border)' }} />

                    {/* Language Toggle */}
                    <div className="flex items-center justify-between px-4 py-2.5">
                        <div className="flex items-center gap-2">
                            <span className="text-sm">🌐</span>
                            <span className="text-xs font-medium" style={{ color: 'var(--muted-foreground)' }}>
                                Language
                            </span>
                        </div>
                        <div className="flex items-center gap-2">
                            <img
                                src="https://flagcdn.com/w40/th.png"
                                alt="TH"
                                className={`w-5 h-3.5 object-cover rounded transition-opacity ${language === 'th' ? 'opacity-100' : 'opacity-40'}`}
                            />
                            <label className="relative inline-block w-10 h-[22px] cursor-pointer">
                                <input
                                    type="checkbox"
                                    className="sr-only peer"
                                    checked={language === 'en'}
                                    onChange={() => setLanguage(language === 'th' ? 'en' : 'th')}
                                />
                                <span
                                    className="absolute inset-0 rounded-full transition-colors duration-300"
                                    style={{ background: language === 'en' ? '#3b82f6' : '#6b7280' }}
                                />
                                <span
                                    className="absolute left-[3px] top-[3px] w-4 h-4 bg-white rounded-full shadow-md transition-transform duration-300"
                                    style={{ transform: language === 'en' ? 'translateX(18px)' : 'translateX(0)' }}
                                />
                            </label>
                            <img
                                src="https://flagcdn.com/w40/us.png"
                                alt="EN"
                                className={`w-5 h-3.5 object-cover rounded transition-opacity ${language === 'en' ? 'opacity-100' : 'opacity-40'}`}
                            />
                        </div>
                    </div>

                    {/* Theme Toggle */}
                    <div className="flex items-center justify-between px-4 py-2.5">
                        <div className="flex items-center gap-2">
                            <span className="text-sm">{theme === 'dark' ? '🌙' : '☀️'}</span>
                            <span className="text-xs font-medium" style={{ color: 'var(--muted-foreground)' }}>
                                Theme
                            </span>
                        </div>
                        <div className="flex items-center gap-2">
                            <span className={`text-sm transition-opacity ${theme === 'light' ? 'opacity-100' : 'opacity-40'}`}>☀️</span>
                            <label className="relative inline-block w-10 h-[22px] cursor-pointer">
                                <input
                                    type="checkbox"
                                    className="sr-only peer"
                                    checked={theme === 'dark'}
                                    onChange={toggleTheme}
                                />
                                <span
                                    className="absolute inset-0 rounded-full transition-colors duration-300"
                                    style={{ background: theme === 'dark' ? '#6366f1' : '#6b7280' }}
                                />
                                <span
                                    className="absolute left-[3px] top-[3px] w-4 h-4 bg-white rounded-full shadow-md transition-transform duration-300"
                                    style={{ transform: theme === 'dark' ? 'translateX(18px)' : 'translateX(0)' }}
                                />
                            </label>
                            <span className={`text-sm transition-opacity ${theme === 'dark' ? 'opacity-100' : 'opacity-40'}`}>🌙</span>
                        </div>
                    </div>

                    {/* Divider */}
                    <div className="my-1 border-t" style={{ borderColor: 'var(--border)' }} />

                    {/* Logout */}
                    <button
                        onClick={() => { logout(); setOpen(false); }}
                        className="w-full text-left px-4 py-2.5 text-sm hover:bg-white/10 transition-colors"
                        style={{ color: 'var(--error)' }}
                    >
                        {language === 'th' ? 'ออกจากระบบ' : 'Logout'}
                    </button>
                </div>
            )}
        </div>
    );
}
