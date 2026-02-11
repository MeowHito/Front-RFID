'use client';

import { useEffect, useState } from 'react';
import { useLanguage } from '@/lib/language-context';
import AdminLayout from '../AdminLayout';
import '../admin.css';

interface Category {
    name: string;
    distance?: string;
    raceType?: string;
}

interface Campaign {
    _id: string;
    name: string;
    categories?: Category[];
}

export default function CategoriesPage() {
    const { language } = useLanguage();
    const [campaign, setCampaign] = useState<Campaign | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetch('/api/campaigns/featured', { cache: 'no-store' })
            .then(res => res.ok ? res.json() : null)
            .then(data => {
                setCampaign(data && data._id ? data : null);
            })
            .catch(() => setCampaign(null))
            .finally(() => setLoading(false));
    }, []);

    const hasCategories = !!campaign && Array.isArray(campaign.categories) && campaign.categories.length > 0;

    return (
        <AdminLayout>
            <div className="admin-breadcrumb">
                <a href="/admin/events" className="breadcrumb-link">Admin</a>
                <span className="breadcrumb-separator">/</span>
                <span className="breadcrumb-current">{language === 'th' ? 'ประเภทการแข่งขัน' : 'Race Categories'}</span>
            </div>

            <div className="content-box">
                <div className="events-header">
                    <h2 className="events-title">
                        {language === 'th' ? 'ประเภทการแข่งขัน (Event หลัก)' : 'Race Categories (Featured Event)'}
                    </h2>
                </div>

                {loading ? (
                    <div className="events-loading">
                        {language === 'th' ? 'กำลังโหลด...' : 'Loading...'}
                    </div>
                ) : !campaign ? (
                    <div className="events-empty" style={{ padding: 40, textAlign: 'center' }}>
                        <p style={{ marginBottom: 8 }}>
                            {language === 'th'
                                ? 'ยังไม่ได้เลือกกิจกรรมหลัก'
                                : 'No featured event selected yet.'}
                        </p>
                        <p style={{ fontSize: 13, color: '#777' }}>
                            {language === 'th'
                                ? 'กรุณาไปที่หน้า \"จัดการอีเวนต์\" และกดไอคอนถ้วยรางวัลสีทอง เพื่อเลือกกิจกรรมหลัก'
                                : 'Go to \"Manage Events\" and click the gold trophy icon to choose the main event.'}
                        </p>
                    </div>
                ) : !hasCategories ? (
                    <div className="events-empty" style={{ padding: 40, textAlign: 'center' }}>
                        <p style={{ marginBottom: 8 }}>
                            {language === 'th'
                                ? `กิจกรรม \"${campaign.name}\" ยังไม่มีประเภทการแข่งขัน`
                                : `Event \"${campaign.name}\" has no race categories yet.`}
                        </p>
                    </div>
                ) : (
                    <table className="data-table">
                        <thead>
                            <tr>
                                <th>#</th>
                                <th>{language === 'th' ? 'ชื่อประเภท' : 'Category Name'}</th>
                                <th>{language === 'th' ? 'ระยะทาง' : 'Distance'}</th>
                                <th>{language === 'th' ? 'ประเภท' : 'Type'}</th>
                            </tr>
                        </thead>
                        <tbody>
                            {campaign.categories!.map((cat, idx) => (
                                <tr key={`${campaign._id}-${idx}-${cat.name}`}>
                                    <td style={{ textAlign: 'center' }}>{idx + 1}</td>
                                    <td style={{ fontWeight: 500 }}>{cat.name}</td>
                                    <td style={{ textAlign: 'center' }}>
                                        {cat.distance ? (
                                            <span className="dist-badge bg-blue">{cat.distance}</span>
                                        ) : '-'}
                                    </td>
                                    <td style={{ textAlign: 'center' }}>
                                        {cat.raceType || '-'}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </div>
        </AdminLayout>
    );
}
