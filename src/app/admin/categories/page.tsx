'use client';

import { useEffect, useState } from 'react';
import { useLanguage } from '@/lib/language-context';
import AdminLayout from '../AdminLayout';
import '../admin.css';

interface Category {
    name: string;
    distance?: string;
    type?: string;
}

interface Campaign {
    _id: string;
    name: string;
    categories?: Category[];
    startDate?: string;
    endDate?: string;
}

export default function CategoriesPage() {
    const { language } = useLanguage();
    const [campaigns, setCampaigns] = useState<Campaign[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetch('/api/campaigns')
            .then(res => res.json())
            .then(data => {
                const list = Array.isArray(data) ? data : data.data || [];
                setCampaigns(list);
            })
            .catch(() => setCampaigns([]))
            .finally(() => setLoading(false));
    }, []);

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
                        {language === 'th' ? 'ประเภทการแข่งขันทั้งหมด' : 'All Race Categories'}
                    </h2>
                </div>

                {loading ? (
                    <div className="events-loading">Loading...</div>
                ) : campaigns.length === 0 ? (
                    <div className="events-empty">{language === 'th' ? 'ไม่มีข้อมูล' : 'No data'}</div>
                ) : (
                    <table className="data-table">
                        <thead>
                            <tr>
                                <th>#</th>
                                <th>{language === 'th' ? 'ชื่ออีเวนต์' : 'Event'}</th>
                                <th>{language === 'th' ? 'ชื่อประเภท' : 'Category Name'}</th>
                                <th>{language === 'th' ? 'ระยะทาง' : 'Distance'}</th>
                                <th>{language === 'th' ? 'ประเภท' : 'Type'}</th>
                            </tr>
                        </thead>
                        <tbody>
                            {(() => {
                                let idx = 0;
                                return campaigns.flatMap((c) =>
                                    (c.categories || []).map((cat, catIdx) => {
                                        idx++;
                                        return (
                                            <tr key={`${c._id}-${catIdx}-${cat.name}`}>
                                                <td style={{ textAlign: 'center' }}>{idx}</td>
                                                <td>{c.name}</td>
                                                <td style={{ fontWeight: 500 }}>{cat.name}</td>
                                                <td style={{ textAlign: 'center' }}>
                                                    {cat.distance ? (
                                                        <span className="dist-badge bg-blue">{cat.distance}</span>
                                                    ) : '-'}
                                                </td>
                                                <td style={{ textAlign: 'center' }}>
                                                    {cat.type ? (
                                                        <span className={`badge-${cat.type === 'test' ? 'test' : 'real'}`}>{cat.type}</span>
                                                    ) : '-'}
                                                </td>
                                            </tr>
                                        );
                                    })
                                );
                            })()}
                            {campaigns.every(c => !c.categories || c.categories.length === 0) && (
                                <tr>
                                    <td colSpan={5} style={{ textAlign: 'center', padding: 30, color: '#999' }}>
                                        {language === 'th' ? 'ไม่มีประเภทการแข่งขัน' : 'No categories found'}
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                )}
            </div>
        </AdminLayout>
    );
}
