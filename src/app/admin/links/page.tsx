'use client';

import { useEffect, useState } from 'react';
import { useLanguage } from '@/lib/language-context';
import AdminLayout from '../AdminLayout';
import '../admin.css';

interface Campaign {
    _id: string;
    name: string;
    nameTh?: string;
    nameEn?: string;
    slug?: string;
    uuid?: string;
}

interface LinkItem {
    id: string;
    label: string;
    labelEn: string;
    description: string;
    descriptionEn: string;
    path: string;
    icon: string;
}

const LINK_ITEMS: LinkItem[] = [
    {
        id: 'result-winners',
        label: 'อันดับกลุ่มอายุ',
        labelEn: 'Age Group Rankings',
        description: 'หน้าแสดงอันดับ Top 5 แยกตามกลุ่มอายุ เพศ และระยะทาง (รีเฟรชอัตโนมัติ)',
        descriptionEn: 'Top 5 winners by age group, gender, and distance (auto-refresh)',
        path: '/Result-Winners',
        icon: '🏆',
    },
];

export default function LinksPage() {
    const { language } = useLanguage();
    const [campaign, setCampaign] = useState<Campaign | null>(null);
    const [copiedId, setCopiedId] = useState<string | null>(null);

    useEffect(() => {
        (async () => {
            try {
                const res = await fetch('/api/campaigns/featured');
                if (res.ok) {
                    const data = await res.json();
                    if (data?._id) setCampaign(data);
                }
            } catch { /* */ }
        })();
    }, []);

    const getFullUrl = (path: string) => {
        if (typeof window === 'undefined') return path;
        return `${window.location.origin}${path}`;
    };

    const handleCopy = async (linkItem: LinkItem) => {
        const url = getFullUrl(linkItem.path);
        try {
            await navigator.clipboard.writeText(url);
            setCopiedId(linkItem.id);
            setTimeout(() => setCopiedId(null), 2500);
        } catch {
            // Fallback
            const input = document.createElement('input');
            input.value = url;
            document.body.appendChild(input);
            input.select();
            document.execCommand('copy');
            document.body.removeChild(input);
            setCopiedId(linkItem.id);
            setTimeout(() => setCopiedId(null), 2500);
        }
    };

    return (
        <AdminLayout breadcrumbItems={[{ label: language === 'th' ? 'ลิงก์แชร์' : 'Share Links' }]}>
            <div style={{ maxWidth: 800, margin: '0 auto' }}>
                {/* Header */}
                <div style={{ marginBottom: 24 }}>
                    <h2 style={{ fontSize: 22, fontWeight: 800, color: '#1e293b', margin: 0 }}>
                        {language === 'th' ? '🔗 ลิงก์สำหรับแชร์' : '🔗 Share Links'}
                    </h2>
                    <p style={{ fontSize: 13, color: '#64748b', marginTop: 4 }}>
                        {language === 'th'
                            ? 'รวมลิงก์หน้าเว็บสำหรับแชร์ให้ผู้เข้าชม คัดลอกลิงก์แล้วนำไปเปิดบนจอโปรเจกเตอร์หรือแชร์ผ่านโซเชียลมีเดีย'
                            : 'Collection of shareable page links for spectators. Copy and open on projector screens or share via social media.'}
                    </p>
                </div>

                {campaign && (
                    <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 10, padding: '10px 16px', marginBottom: 20, display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ fontSize: 16 }}>📌</span>
                        <span style={{ fontSize: 13, color: '#166534', fontWeight: 600 }}>
                            {language === 'th' ? 'กิจกรรมปัจจุบัน: ' : 'Current campaign: '}
                            <strong>{campaign.nameTh || campaign.nameEn || campaign.name}</strong>
                        </span>
                    </div>
                )}

                {/* Link Cards */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                    {LINK_ITEMS.map(item => {
                        const fullUrl = getFullUrl(item.path);
                        const isCopied = copiedId === item.id;
                        return (
                            <div key={item.id} style={{
                                background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12,
                                padding: 20, boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
                                transition: 'box-shadow 0.2s',
                            }}>
                                {/* Title row */}
                                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                                    <span style={{ fontSize: 28 }}>{item.icon}</span>
                                    <div>
                                        <div style={{ fontSize: 16, fontWeight: 800, color: '#1e293b' }}>
                                            {language === 'th' ? item.label : item.labelEn}
                                        </div>
                                        <div style={{ fontSize: 12, color: '#64748b' }}>
                                            {language === 'th' ? item.description : item.descriptionEn}
                                        </div>
                                    </div>
                                </div>

                                {/* URL + Copy */}
                                <div style={{
                                    display: 'flex', alignItems: 'center', gap: 8, marginTop: 12,
                                    background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8,
                                    padding: '8px 12px',
                                }}>
                                    <code style={{
                                        flex: 1, fontSize: 13, color: '#334155', fontFamily: 'monospace',
                                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                                        userSelect: 'all',
                                    }}>
                                        {fullUrl}
                                    </code>
                                    <button
                                        onClick={() => handleCopy(item)}
                                        style={{
                                            padding: '6px 16px', borderRadius: 6, border: 'none',
                                            background: isCopied ? '#22c55e' : '#2563eb',
                                            color: '#fff', fontWeight: 700, fontSize: 12,
                                            cursor: 'pointer', whiteSpace: 'nowrap',
                                            transition: 'background 0.2s',
                                            display: 'flex', alignItems: 'center', gap: 6,
                                        }}
                                    >
                                        {isCopied ? '✓ Copied!' : (language === 'th' ? '📋 คัดลอก' : '📋 Copy')}
                                    </button>
                                </div>

                                {/* Open in new tab */}
                                <div style={{ marginTop: 10, display: 'flex', gap: 8 }}>
                                    <a
                                        href={item.path}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        style={{
                                            fontSize: 12, fontWeight: 600, color: '#2563eb',
                                            textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 4,
                                        }}
                                    >
                                        🔗 {language === 'th' ? 'เปิดในแท็บใหม่' : 'Open in new tab'} ↗
                                    </a>
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>
        </AdminLayout>
    );
}
