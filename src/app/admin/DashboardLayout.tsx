'use client';

import { ReactNode } from 'react';
import DashboardHeader from './DashboardHeader';
import DashboardSidebar from './DashboardSidebar';
import './dashboard.css';

interface DashboardLayoutProps {
    children: ReactNode;
}

export default function DashboardLayout({ children }: DashboardLayoutProps) {
    return (
        <>
            {/* Font Awesome CDN */}
            <link
                rel="stylesheet"
                href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css"
            />

            <div className="admin-dashboard">
                <DashboardHeader />
                <DashboardSidebar />
                <main className="admin-dashboard-content">
                    {children}
                </main>
            </div>
        </>
    );
}
