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

interface LinkRow {
    id: string;
    label: string;
    labelEn: string;
    buildUrl: (origin: string) => string;
}

const LINK_ROWS: LinkRow[] = [
    {
        id: 'result-winners',
        label: 'อันดับกลุ่มอายุ (Age Group Rankings)',
        labelEn: 'Age Group Rankings',
        buildUrl: (origin) => `${origin}/Result-Winners`,
    },
];

export default function LinksPage() {
    const { language } = useLanguage();
    const [campaign, setCampaign] = useState<Campaign | null>(null);
    const [loading, setLoading] = useState(true);
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
            finally { setLoading(false); }
        })();
    }, []);

    const origin = typeof window !== 'undefined' ? window.location.origin : '';

    const handleCopy = async (url: string, id: string) => {
        try {
            await navigator.clipboard.writeText(url);
        } catch {
            const input = document.createElement('input');
            input.value = url;
            document.body.appendChild(input);
            input.select();
            document.execCommand('copy');
            document.body.removeChild(input);
        }
        setCopiedId(id);
        setTimeout(() => setCopiedId(null), 2000);
    };

    return (
        <AdminLayout breadcrumbItems={[{ label: language === 'th' ? 'ลิงก์แชร์' : 'Share Links' }]}>
            <div className="max-w-4xl mx-auto">
                {/* Header */}
                <div className="mb-5">
                    <h2 className="text-xl font-extrabold text-slate-800 m-0">
                        {language === 'th' ? '🔗 ลิงก์แชร์' : '🔗 Share Links'}
                    </h2>
                    <p className="text-xs text-slate-500 mt-1">
                        {language === 'th'
                            ? 'ลิงก์สำหรับกิจกรรมที่ตั้งเป็นดาว (Featured) ใน /admin/events — คัดลอกแล้วนำไปเปิดบนจอโปรเจกเตอร์หรือแชร์ได้เลย'
                            : 'Links for the starred (featured) campaign in /admin/events — copy and share on projector or social media'}
                    </p>
                </div>

                {/* Featured campaign badge */}
                {loading ? (
                    <div className="p-5 text-center text-slate-400 text-sm">Loading...</div>
                ) : !campaign ? (
                    <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 mb-5 flex items-center gap-2.5">
                        <span className="text-lg">⚠️</span>
                        <span className="text-sm text-red-800 font-semibold">
                            {language === 'th'
                                ? 'ยังไม่มีกิจกรรมที่ตั้งเป็นดาว — กรุณาไปที่ /admin/events แล้วกดดาวเพื่อเลือกกิจกรรม'
                                : 'No featured campaign — go to /admin/events and star a campaign first'}
                        </span>
                    </div>
                ) : (
                    <>
                        <div className="bg-green-50 border border-green-200 rounded-xl px-4 py-2.5 mb-5 flex items-center gap-2">
                            <span className="text-lg">⭐</span>
                            <span className="text-sm text-green-800 font-semibold">
                                {language === 'th' ? 'กิจกรรมที่เลือก: ' : 'Featured campaign: '}
                                <strong>{campaign.nameTh || campaign.nameEn || campaign.name}</strong>
                            </span>
                        </div>

                        {/* Links Table */}
                        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
                            {/* Desktop table */}
                            <table className="w-full border-collapse text-sm hidden sm:table">
                                <thead>
                                    <tr className="bg-slate-50 border-b-2 border-slate-200">
                                        <th className="px-4 py-2.5 text-left font-bold text-slate-600 w-[30%] whitespace-nowrap">
                                            {language === 'th' ? 'หัวข้อ' : 'Label'}
                                        </th>
                                        <th className="px-4 py-2.5 text-left font-bold text-slate-600">
                                            URL
                                        </th>
                                        <th className="px-4 py-2.5 text-center font-bold text-slate-600 w-[100px]">
                                            {language === 'th' ? 'คัดลอก' : 'Copy'}
                                        </th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {LINK_ROWS.map((row, idx) => {
                                        const url = row.buildUrl(origin);
                                        const isCopied = copiedId === row.id;
                                        return (
                                            <tr key={row.id} className={idx < LINK_ROWS.length - 1 ? 'border-b border-slate-100' : ''}>
                                                <td className="px-4 py-3 font-bold text-slate-800 align-middle">
                                                    {language === 'th' ? row.label : row.labelEn}
                                                </td>
                                                <td className="px-4 py-3 align-middle">
                                                    <div className="flex items-center gap-2">
                                                        <code className="flex-1 text-xs text-slate-700 font-mono bg-slate-50 border border-slate-200 rounded-md px-2.5 py-1.5 overflow-hidden text-ellipsis whitespace-nowrap select-all block">
                                                            {url}
                                                        </code>
                                                        <a href={url} target="_blank" rel="noopener noreferrer"
                                                            className="shrink-0 text-blue-600 text-sm flex items-center hover:text-blue-800"
                                                            title={language === 'th' ? 'เปิดในแท็บใหม่' : 'Open in new tab'}
                                                        >
                                                            ↗
                                                        </a>
                                                    </div>
                                                </td>
                                                <td className="px-4 py-3 text-center align-middle">
                                                    <button
                                                        onClick={() => handleCopy(url, row.id)}
                                                        className={`px-3.5 py-1.5 rounded-md border-none text-white font-bold text-xs cursor-pointer whitespace-nowrap transition-colors min-w-[70px] ${isCopied ? 'bg-green-500' : 'bg-blue-500 hover:bg-blue-600'}`}
                                                    >
                                                        {isCopied ? '✓ Copied!' : '📋 Copy'}
                                                    </button>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>

                            {/* Mobile card layout */}
                            <div className="sm:hidden divide-y divide-slate-100">
                                {LINK_ROWS.map((row) => {
                                    const url = row.buildUrl(origin);
                                    const isCopied = copiedId === row.id;
                                    return (
                                        <div key={row.id} className="p-4 space-y-2">
                                            <div className="font-bold text-sm text-slate-800">
                                                {language === 'th' ? row.label : row.labelEn}
                                            </div>
                                            <code className="block text-xs text-slate-700 font-mono bg-slate-50 border border-slate-200 rounded-md px-2.5 py-1.5 overflow-hidden text-ellipsis whitespace-nowrap select-all">
                                                {url}
                                            </code>
                                            <div className="flex gap-2">
                                                <button
                                                    onClick={() => handleCopy(url, row.id)}
                                                    className={`flex-1 py-2 rounded-md border-none text-white font-bold text-xs cursor-pointer transition-colors ${isCopied ? 'bg-green-500' : 'bg-blue-500 hover:bg-blue-600'}`}
                                                >
                                                    {isCopied ? '✓ Copied!' : '📋 Copy'}
                                                </button>
                                                <a href={url} target="_blank" rel="noopener noreferrer"
                                                    className="px-4 py-2 rounded-md border border-slate-300 text-slate-700 text-xs font-semibold flex items-center gap-1 hover:bg-slate-50"
                                                >
                                                    ↗ {language === 'th' ? 'เปิด' : 'Open'}
                                                </a>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>

                        <p className="text-xs text-slate-400 mt-3">
                            {language === 'th'
                                ? '* ลิงก์เหล่านี้จะแสดงข้อมูลของกิจกรรมที่ตั้งเป็นดาว (⭐) ใน /admin/events เสมอ — เปลี่ยนดาวเมื่อต้องการเปลี่ยนกิจกรรมที่แสดง'
                                : '* These links always show data for the starred (⭐) campaign in /admin/events — change the star to switch campaigns'}
                        </p>
                    </>
                )}
            </div>
        </AdminLayout>
    );
}
