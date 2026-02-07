'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { useLanguage } from '@/lib/language-context';

interface SidebarItem {
    href: string;
    label: string;
    labelEn: string;
}

const menuItems: SidebarItem[] = [
    { href: '/admin/profile', label: 'โปรไฟล์', labelEn: 'Profile' },
    { href: '/admin/account', label: 'บัญชีของฉัน', labelEn: 'My Account' },
    { href: '/admin/events', label: 'อีเวนท์', labelEn: 'Events' },
    { href: '/admin/users', label: 'การตั้งค่าผู้ใช้งาน', labelEn: 'User Settings' },
    { href: '/admin/help', label: 'ศูนย์ช่วยเหลือ', labelEn: 'Help Center' },
];

export default function AdminSidebar() {
    const pathname = usePathname();
    const { user } = useAuth();
    const { language } = useLanguage();

    const isActive = (href: string) => {
        if (href === '/admin') return pathname === '/admin';
        return pathname.startsWith(href);
    };

    return (
        <aside className="admin-sidebar">
            {/* User Profile Section */}
            <div className="sidebar-profile">
                <div className="sidebar-avatar">
                    {user?.avatarUrl ? (
                        <img src={user.avatarUrl} alt="Avatar" />
                    ) : (
                        <div className="avatar-placeholder">
                            <svg width="40" height="40" viewBox="0 0 24 24" fill="none">
                                <rect width="24" height="24" fill="#e0e0e0" />
                                <path d="M12 12C14.21 12 16 10.21 16 8C16 5.79 14.21 4 12 4C9.79 4 8 5.79 8 8C8 10.21 9.79 12 12 12Z" fill="#9e9e9e" />
                                <path d="M12 14C8.13 14 5 17.13 5 21H19C19 17.13 15.87 14 12 14Z" fill="#9e9e9e" />
                            </svg>
                        </div>
                    )}
                </div>
                <div className="sidebar-username">
                    {user?.firstName || 'admin'} {user?.lastName || 'system'}
                </div>
            </div>

            {/* Navigation Menu */}
            <nav className="sidebar-nav">
                {menuItems.map((item) => (
                    <Link
                        key={item.href}
                        href={item.href}
                        className={`sidebar-link ${isActive(item.href) ? 'active' : ''}`}
                    >
                        {language === 'th' ? item.label : item.labelEn}
                    </Link>
                ))}
            </nav>
        </aside>
    );
}
