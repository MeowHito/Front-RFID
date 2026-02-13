'use client';

import { useLanguage } from '@/lib/language-context';
import AdminLayout from './AdminLayout';
import './admin.css';

interface PlaceholderProps {
    icon: string;
    titleTh: string;
    titleEn: string;
    descTh: string;
    descEn: string;
    breadcrumbTh: string;
    breadcrumbEn: string;
}

export default function PlaceholderPage({ icon, titleTh, titleEn, descTh, descEn, breadcrumbTh, breadcrumbEn }: PlaceholderProps) {
    const { language } = useLanguage();

    return (
        <AdminLayout
            breadcrumbItems={[
                { label: breadcrumbTh, labelEn: breadcrumbEn }
            ]}
        >
            <div className="content-box">
                <div className="placeholder-page">
                    <div className="placeholder-icon">{icon}</div>
                    <h2 className="placeholder-title">{language === 'th' ? titleTh : titleEn}</h2>
                    <p className="placeholder-desc">{language === 'th' ? descTh : descEn}</p>
                </div>
            </div>
        </AdminLayout>
    );
}
