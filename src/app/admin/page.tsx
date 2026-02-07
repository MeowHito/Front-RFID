'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import AuthGuard from '@/components/AuthGuard';

function AdminIndexContent() {
    const router = useRouter();

    useEffect(() => {
        // Redirect to profile page as the default admin page
        router.replace('/admin/profile');
    }, [router]);

    return (
        <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            minHeight: '100vh',
            background: '#f5f5f5'
        }}>
            <p style={{ color: '#666' }}>กำลังโหลด...</p>
        </div>
    );
}

export default function AdminPage() {
    return (
        <AuthGuard>
            <AdminIndexContent />
        </AuthGuard>
    );
}
