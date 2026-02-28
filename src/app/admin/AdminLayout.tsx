'use client';

import { ReactNode, useState, useEffect } from 'react';
import { usePathname } from 'next/navigation';
import AdminHeader from './AdminHeader';
import AdminSidebar from './AdminSidebar';
import AdminBreadcrumb from './AdminBreadcrumb';
import AuthGuard from '@/components/AuthGuard';
import './admin.css';

interface AdminLayoutProps {
    children: ReactNode;
    breadcrumbItems?: { label: string; labelEn?: string; href?: string }[];
    breadcrumbRight?: ReactNode;
    pageTitle?: string;
    pageTitleEn?: string;
}

function AdminLayoutContent({ children, breadcrumbItems = [], breadcrumbRight, pageTitle, pageTitleEn }: AdminLayoutProps) {
    const [sidebarOpen, setSidebarOpen] = useState(false);
    const pathname = usePathname();

    // Close sidebar on route change (mobile)
    useEffect(() => {
        setSidebarOpen(false);
    }, [pathname]);

    return (
        <div className="admin-container">
            <AdminHeader onToggleSidebar={() => setSidebarOpen(!sidebarOpen)} />
            {/* Mobile overlay */}
            {sidebarOpen && (
                <div className="sidebar-overlay" onClick={() => setSidebarOpen(false)} />
            )}
            <div className="admin-body">
                <div className={`sidebar-wrapper ${sidebarOpen ? 'open' : ''}`}>
                    <AdminSidebar />
                </div>
                <main className="admin-main">
                    {breadcrumbItems.length > 0 && (
                        <AdminBreadcrumb items={breadcrumbItems} rightContent={breadcrumbRight} />
                    )}
                    {pageTitle && (
                        <div className="admin-page-header">
                            <h1 className="admin-page-title">{pageTitle}</h1>
                        </div>
                    )}
                    <div className="admin-content">
                        {children}
                    </div>
                </main>
            </div>
        </div>
    );
}

export default function AdminLayout({ children, breadcrumbItems, breadcrumbRight, pageTitle, pageTitleEn }: AdminLayoutProps) {
    return (
        <AuthGuard>
            <AdminLayoutContent breadcrumbItems={breadcrumbItems} breadcrumbRight={breadcrumbRight} pageTitle={pageTitle} pageTitleEn={pageTitleEn}>
                {children}
            </AdminLayoutContent>
        </AuthGuard>
    );
}
