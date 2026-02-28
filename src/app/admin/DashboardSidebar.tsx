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
            { href: '/admin/display', label: 'การแสดงผลคอลัมน์', icon: 'fa-columns' },
        ]
    },
    {
        header: 'PARTICIPANTS',
        items: [
            { href: '/admin/participants', label: 'นักกีฬา / Runners', icon: 'fa-running' },
            { href: '/admin/bib-check', label: 'ตรวจสอบ BIB', icon: 'fa-id-card' },
        ]
    },
    {
        header: 'RFID & TIMING',
        items: [
            { href: '/admin/rfid-config', label: 'RFID Config', icon: 'fa-broadcast-tower' },
            { href: '/admin/chip-mapping', label: 'ผูก Chip กับ BIB', icon: 'fa-link' },
            { href: '/admin/live-monitor', label: 'Live Monitor', icon: 'fa-tv' },
        ]
    },
    {
        header: 'RESULTS & REPORTS',
        items: [
            { href: '/admin/results', label: 'ผลการแข่งขัน', icon: 'fa-trophy' },
            { href: '/admin/certificates', label: 'ใบประกาศนียบัตร', icon: 'fa-certificate' },
            { href: '/admin/eslip', label: 'E-Slip', icon: 'fa-id-badge' },
            { href: '/admin/links', label: 'ลิงก์แชร์', icon: 'fa-share-alt' },
            { href: '/admin/export', label: 'ส่งออกรายงาน', icon: 'fa-file-export' },
        ]
    },
    {
        header: 'SYSTEM',
        items: [
            { href: '/admin/users', label: 'ผู้ใช้งาน', icon: 'fa-users-cog' },
            { href: '/admin/admin-logs', label: 'ประวัติการใช้งาน', icon: 'fa-history' },
            { href: '/admin/settings', label: 'ตั้งค่าระบบ', icon: 'fa-cog' },
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
