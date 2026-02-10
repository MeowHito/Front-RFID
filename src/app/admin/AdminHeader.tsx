'use client';

import Link from 'next/link';
import { useLanguage } from '@/lib/language-context';
import { useAuth } from '@/lib/auth-context';
import { useState, useRef, useEffect } from 'react';

export default function AdminHeader() {
    const { language, setLanguage } = useLanguage();
    const { user, logout } = useAuth();
    const [profileOpen, setProfileOpen] = useState(false);
    const dropdownRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        function handleClickOutside(event: MouseEvent) {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
                setProfileOpen(false);
            }
        }
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    return (
        <header className="admin-header">
            <div className="header-left-group">
                <Link href="/" className="brand-logo">
                    ACTION <span className="brand-highlight">ADMIN</span>
                </Link>
                <div className="header-divider"></div>
                <div className="active-event-display">
                    <span className="event-name-header">RFID Timing Manager</span>
                </div>
            </div>

            <div className="header-right-group">
                {/* Status indicators */}
                <div className="header-status">
                    <div className="status-line">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M5 12.55a11 11 0 0 1 14.08 0" /><path d="M1.42 9a16 16 0 0 1 21.16 0" /><path d="M8.53 16.11a6 6 0 0 1 6.95 0" /><line x1="12" y1="20" x2="12.01" y2="20" /></svg>
                        Server: OK
                    </div>
                </div>

                <div className="header-divider"></div>

                {/* Profile Dropdown */}
                <div className="profile-dropdown" ref={dropdownRef}>
                    <button
                        className="profile-btn"
                        onClick={() => setProfileOpen(!profileOpen)}
                    >
                        <img
                            src={user?.avatarUrl || `https://ui-avatars.com/api/?name=${user?.firstName || 'Admin'}+${user?.lastName || 'User'}&background=random`}
                            alt="Avatar"
                            style={{ width: 28, height: 28, borderRadius: '50%' }}
                        />
                        <span>{user?.firstName || 'Admin'}</span>
                        <svg width="10" height="10" viewBox="0 0 12 12" fill="none">
                            <path d="M3 4.5L6 7.5L9 4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                    </button>
                    {profileOpen && (
                        <div className="profile-menu">
                            <div className="profile-menu-header">
                                <div className="profile-avatar">
                                    {user?.avatarUrl ? (
                                        <img src={user.avatarUrl} alt="Avatar" />
                                    ) : (
                                        <span>{user?.firstName?.charAt(0) || 'A'}</span>
                                    )}
                                </div>
                                <div className="profile-info">
                                    <div className="profile-name">{user?.firstName} {user?.lastName}</div>
                                    <div className="profile-email">{user?.email}</div>
                                </div>
                            </div>
                            <div className="profile-menu-divider"></div>
                            <Link href="/admin/profile" className="profile-menu-item" onClick={() => setProfileOpen(false)}>
                                {language === 'th' ? 'แก้ไขโปรไฟล์' : 'Edit Profile'}
                            </Link>
                            <button className="profile-menu-item logout" onClick={logout}>
                                {language === 'th' ? 'ออกจากระบบ' : 'Logout'}
                            </button>
                        </div>
                    )}
                </div>

                {/* Language Selector */}
                <div className="lang-selector">
                    <button className={`lang-btn ${language === 'th' ? 'active' : ''}`} onClick={() => setLanguage('th')}>TH</button>
                    <span className="lang-divider">|</span>
                    <button className={`lang-btn ${language === 'en' ? 'active' : ''}`} onClick={() => setLanguage('en')}>EN</button>
                </div>
            </div>
        </header>
    );
}
