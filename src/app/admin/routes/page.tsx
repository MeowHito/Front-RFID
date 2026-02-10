'use client';

import { useLanguage } from '@/lib/language-context';
import AdminLayout from '../AdminLayout';
import '../admin.css';

export default function RoutesPage() {
    const { language } = useLanguage();

    return (
        <AdminLayout>
            <div className="admin-breadcrumb">
                <a href="/admin/events" className="breadcrumb-link">Admin</a>
                <span className="breadcrumb-separator">/</span>
                <span className="breadcrumb-current">{language === 'th' ? 'เส้นทาง & Cut-off' : 'Routes & Cut-off'}</span>
            </div>
            <div className="content-box">
                <div className="placeholder-page">
                    <div className="placeholder-icon">🗺️</div>
                    <h2 className="placeholder-title">{language === 'th' ? 'เส้นทาง & Cut-off' : 'Routes & Cut-off'}</h2>
                    <p className="placeholder-desc">{language === 'th' ? 'กำลังพัฒนา — ระบบจัดการเส้นทาง จุดตรวจ และเวลา Cut-off' : 'Coming Soon — Route management, checkpoints, and cut-off times'}</p>
                </div>
            </div>
        </AdminLayout>
    );
}
