'use client';

import { useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { canAccessRoute } from '@/lib/permissions';

interface AuthGuardProps {
    children: React.ReactNode;
    requireAdmin?: boolean;
}

export default function AuthGuard({ children, requireAdmin = false }: AuthGuardProps) {
    const { user, isAuthenticated, isAdmin, isLoading } = useAuth();
    const router = useRouter();
    const pathname = usePathname();
    const [accessDenied, setAccessDenied] = useState(false);

    useEffect(() => {
        if (isLoading) return;

        if (!isAuthenticated) {
            router.push('/login');
            return;
        }

        if (requireAdmin && !isAdmin) {
            router.push('/');
            return;
        }

        // Route-level permission check
        const allowed = canAccessRoute(pathname, user?.role, user?.modulePermissions);
        setAccessDenied(!allowed);
    }, [isAuthenticated, isAdmin, isLoading, requireAdmin, router, pathname, user]);

    if (isLoading) {
        return (
            <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-900 to-slate-900 flex items-center justify-center">
                <div className="w-12 h-12 border-4 border-blue-500/30 border-t-blue-500 rounded-full animate-spin"></div>
            </div>
        );
    }

    if (!isAuthenticated || (requireAdmin && !isAdmin)) {
        return null;
    }

    if (accessDenied) {
        return (
            <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-900 to-slate-900 flex items-center justify-center">
                <div className="text-center p-8 bg-white/10 backdrop-blur rounded-2xl border border-white/20 max-w-md">
                    <div className="text-5xl mb-4">🚫</div>
                    <h2 className="text-xl font-bold text-white mb-2">ไม่มีสิทธิ์เข้าถึง</h2>
                    <p className="text-white/60 mb-6">คุณไม่มีสิทธิ์เข้าถึงหน้านี้ กรุณาติดต่อผู้ดูแลระบบ</p>
                    <button
                        onClick={() => router.push('/admin/profile')}
                        className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
                    >
                        กลับหน้าโปรไฟล์
                    </button>
                </div>
            </div>
        );
    }

    return <>{children}</>;
}
