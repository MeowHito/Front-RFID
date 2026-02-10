'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { useLanguage } from '@/lib/language-context';

interface MenuItem {
    href: string;
    label: string;
    labelEn: string;
    icon: string;
    iconColor?: string;
    badge?: string;
}

interface MenuSection {
    header: string;
    headerEn: string;
    items: MenuItem[];
}

const menuSections: MenuSection[] = [
    {
        header: 'MAIN NAVIGATION',
        headerEn: 'MAIN NAVIGATION',
        items: [
            { href: '/admin/events', label: 'จัดการอีเวนต์', labelEn: 'Manage Events', icon: 'calendar-check', iconColor: '' },
            { href: '/admin/events/create', label: 'สร้างกิจกรรมใหม่', labelEn: 'Create New Event', icon: 'circle-plus', iconColor: '#00a65a' },
        ]
    },
    {
        header: 'RACE CONFIG (ตั้งค่าสนาม)',
        headerEn: 'RACE CONFIG',
        items: [
            { href: '/admin/categories', label: 'ประเภทการแข่งขัน', labelEn: 'Race Categories', icon: 'layer-group' },
            { href: '/admin/routes', label: 'เส้นทาง & Cut-off', labelEn: 'Routes & Cut-off', icon: 'map-location-dot' },
        ]
    },
    {
        header: 'PARTICIPANTS (นักกีฬา)',
        headerEn: 'PARTICIPANTS',
        items: [
            { href: '/admin/participants', label: 'ข้อมูลนักกีฬา', labelEn: 'Participants', icon: 'users' },
            { href: '/admin/participants?add=true', label: 'เพิ่มนักกีฬา', labelEn: 'Add Participant', icon: 'user-plus' },
            { href: '/admin/bib-check', label: 'เช็คบิบ', labelEn: 'Check BIB', icon: 'magnifying-glass' },
        ]
    },
    {
        header: 'RFID & TIMING (ระบบจับเวลา)',
        headerEn: 'RFID & TIMING',
        items: [
            { href: '/admin/live-monitor', label: 'Live Monitor', labelEn: 'Live Monitor', icon: 'desktop', iconColor: '#00c0ef', badge: 'LIVE' },
            { href: '/admin/rfid-config', label: 'ตั้งค่าจุดรับสัญญาณ', labelEn: 'Reader Config', icon: 'server' },
            { href: '/admin/chip-mapping', label: 'จับคู่บิบ/ชิป', labelEn: 'BIB/Chip Mapping', icon: 'id-card' },
            { href: '/admin/raw-data', label: 'ข้อมูลดิบ', labelEn: 'Raw Data', icon: 'database' },
        ]
    },
    {
        header: 'RESULTS & REPORTS (รายงาน)',
        headerEn: 'RESULTS & REPORTS',
        items: [
            { href: '/admin/results', label: 'ผลการแข่งขัน', labelEn: 'Results', icon: 'trophy', iconColor: '#f39c12' },
            { href: '/admin/certificates', label: 'ใบประกาศ', labelEn: 'Certificates', icon: 'print' },
            { href: '/admin/export', label: 'ส่งออกข้อมูล', labelEn: 'Export Data', icon: 'file-excel' },
        ]
    },
    {
        header: 'SYSTEM',
        headerEn: 'SYSTEM',
        items: [
            { href: '/admin/settings', label: 'ตั้งค่าระบบ', labelEn: 'System Settings', icon: 'gear' },
        ]
    },
];

// Simple SVG icons mapped by name
function SidebarIcon({ name, color }: { name: string; color?: string }) {
    const style = color ? { color } : {};
    const icons: Record<string, JSX.Element> = {
        'calendar-check': <svg style={style} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="4" width="18" height="18" rx="2" ry="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /><path d="M9 16l2 2 4-4" /></svg>,
        'circle-plus': <svg style={style} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="16" /><line x1="8" y1="12" x2="16" y2="12" /></svg>,
        'layer-group': <svg style={style} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="12 2 2 7 12 12 22 7 12 2" /><polyline points="2 17 12 22 22 17" /><polyline points="2 12 12 17 22 12" /></svg>,
        'map-location-dot': <svg style={style} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" /><circle cx="12" cy="10" r="3" /></svg>,
        'users': <svg style={style} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></svg>,
        'user-plus': <svg style={style} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="8.5" cy="7" r="4" /><line x1="20" y1="8" x2="20" y2="14" /><line x1="23" y1="11" x2="17" y2="11" /></svg>,
        'magnifying-glass': <svg style={style} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>,
        'desktop': <svg style={style} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="2" y="3" width="20" height="14" rx="2" /><line x1="8" y1="21" x2="16" y2="21" /><line x1="12" y1="17" x2="12" y2="21" /></svg>,
        'server': <svg style={style} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="2" y="2" width="20" height="8" rx="2" /><rect x="2" y="14" width="20" height="8" rx="2" /><line x1="6" y1="6" x2="6.01" y2="6" /><line x1="6" y1="18" x2="6.01" y2="18" /></svg>,
        'id-card': <svg style={style} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="2" y="5" width="20" height="14" rx="2" /><line x1="2" y1="10" x2="22" y2="10" /></svg>,
        'database': <svg style={style} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><ellipse cx="12" cy="5" rx="9" ry="3" /><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3" /><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5" /></svg>,
        'trophy': <svg style={style} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6" /><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18" /><path d="M4 22h16" /><path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 19.24 7 20h10c0-.76-.85-1.25-2.03-1.79C14.47 17.98 14 17.55 14 17v-2.34" /><path d="M18 2H6v7a6 6 0 0 0 12 0V2Z" /></svg>,
        'print': <svg style={style} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="6 9 6 2 18 2 18 9" /><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" /><rect x="6" y="14" width="12" height="8" /></svg>,
        'file-excel': <svg style={style} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="10" y1="12" x2="14" y2="18" /><line x1="14" y1="12" x2="10" y2="18" /></svg>,
        'gear': <svg style={style} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" /></svg>,
    };
    return icons[name] || <span>•</span>;
}

export default function AdminSidebar() {
    const pathname = usePathname();
    const { user } = useAuth();
    const { language } = useLanguage();

    const isActive = (href: string) => {
        if (href.includes('?')) {
            return pathname === href.split('?')[0];
        }
        return pathname === href || pathname.startsWith(href + '/');
    };

    return (
        <aside className="main-sidebar">
            <ul className="sidebar-menu">
                {menuSections.map((section, sIdx) => (
                    <div key={sIdx} className="sidebar-section">
                        <span className="sidebar-header">
                            {language === 'th' ? section.header : section.headerEn}
                        </span>
                        {section.items.map((item) => (
                            <li key={item.href} className={isActive(item.href) ? 'active' : ''}>
                                <Link href={item.href}>
                                    <span className="sidebar-icon">
                                        <SidebarIcon name={item.icon} color={item.iconColor} />
                                    </span>
                                    <span>{language === 'th' ? item.label : item.labelEn}</span>
                                    {item.badge && (
                                        <span className="menu-badge">{item.badge}</span>
                                    )}
                                </Link>
                            </li>
                        ))}
                    </div>
                ))}
            </ul>
        </aside>
    );
}
