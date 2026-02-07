'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

interface MenuItem {
    href: string;
    label: string;
    icon: string;
}

interface MenuSection {
    header: string;
    items: MenuItem[];
}

const menuSections: MenuSection[] = [
    {
        header: 'MAIN NAVIGATION',
        items: [
            { href: '/admin/dashboard', label: 'แดชบอร์ด', icon: 'fa-tachometer-alt' },
            { href: '/admin/events', label: 'จัดการอีเวนต์', icon: 'fa-calendar-alt' },
        ]
    },
    {
        header: 'RACE CONFIG',
        items: [
            { href: '/admin/categories', label: 'ประเภทการแข่งขัน', icon: 'fa-layer-group' },
            { href: '/admin/checkpoints', label: 'จุด Checkpoint', icon: 'fa-map-marker-alt' },
            { href: '/admin/courses', label: 'เส้นทาง', icon: 'fa-route' },
        ]
    },
    {
        header: 'PARTICIPANTS',
        items: [
            { href: '/admin/runners', label: 'นักกีฬา', icon: 'fa-running' },
            { href: '/admin/registration', label: 'ลงทะเบียน', icon: 'fa-user-plus' },
            { href: '/admin/bib', label: 'จัดการ BIB', icon: 'fa-id-card' },
        ]
    },
    {
        header: 'RFID & TIMING',
        items: [
            { href: '/admin/rfid-readers', label: 'RFID Readers', icon: 'fa-broadcast-tower' },
            { href: '/admin/timing', label: 'ระบบจับเวลา', icon: 'fa-stopwatch' },
            { href: '/admin/chip-assign', label: 'ผูก Chip กับ BIB', icon: 'fa-link' },
            { href: '/admin/live-monitor', label: 'Live Monitor', icon: 'fa-tv' },
        ]
    },
    {
        header: 'RESULTS & REPORTS',
        items: [
            { href: '/admin/results', label: 'ผลการแข่งขัน', icon: 'fa-trophy' },
            { href: '/admin/certificates', label: 'ใบประกาศนียบัตร', icon: 'fa-certificate' },
            { href: '/admin/reports', label: 'รายงาน', icon: 'fa-chart-bar' },
        ]
    },
    {
        header: 'SYSTEM',
        items: [
            { href: '/admin/users', label: 'ผู้ใช้งาน', icon: 'fa-users-cog' },
            { href: '/admin/settings', label: 'ตั้งค่าระบบ', icon: 'fa-cog' },
            { href: '/admin/logs', label: 'ประวัติการใช้งาน', icon: 'fa-history' },
        ]
    },
];

export default function DashboardSidebar() {
    const pathname = usePathname();

    const isActive = (href: string) => {
        if (href === '/admin/dashboard') return pathname === '/admin/dashboard' || pathname === '/admin';
        return pathname.startsWith(href);
    };

    return (
        <aside className="admin-dashboard-sidebar">
            <ul className="sidebar-menu">
                {menuSections.map((section, sIndex) => (
                    <li key={sIndex}>
                        <div className="menu-header">{section.header}</div>
                        <ul className="sidebar-menu">
                            {section.items.map((item, iIndex) => (
                                <li key={iIndex} className={`menu-item ${isActive(item.href) ? 'active' : ''}`}>
                                    <Link href={item.href}>
                                        <i className={`fas ${item.icon}`}></i>
                                        <span>{item.label}</span>
                                    </Link>
                                </li>
                            ))}
                        </ul>
                    </li>
                ))}
            </ul>
        </aside>
    );
}
