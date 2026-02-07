'use client';

import { ReactNode } from 'react';
import AdminHeader from './AdminHeader';
import AdminSidebar from './AdminSidebar';
import AdminBreadcrumb from './AdminBreadcrumb';
import AuthGuard from '@/components/AuthGuard';
import './admin.css';

interface AdminLayoutProps {
    children: ReactNode;
    breadcrumbItems?: { label: string; labelEn?: string; href?: string }[];
    pageTitle?: string;
    pageTitleEn?: string;
}

function AdminLayoutContent({ children, breadcrumbItems = [], pageTitle, pageTitleEn }: AdminLayoutProps) {
    return (
        <div className="admin-container">
            <AdminHeader />
            <div className="admin-body">
                <AdminSidebar />
                <main className="admin-main">
                    {breadcrumbItems.length > 0 && (
                        <AdminBreadcrumb items={breadcrumbItems} />
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

export default function AdminLayout({ children, breadcrumbItems, pageTitle, pageTitleEn }: AdminLayoutProps) {
    return (
        <AuthGuard>
            <AdminLayoutContent breadcrumbItems={breadcrumbItems} pageTitle={pageTitle} pageTitleEn={pageTitleEn}>
                {children}
            </AdminLayoutContent>
        </AuthGuard>
    );
}
