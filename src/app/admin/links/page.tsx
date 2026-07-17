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
    buildUrl: (origin: string, campaign?: Campaign | null) => string;
}

const LINK_ROWS: LinkRow[] = [
    {
        id: 'result-winners',
        label: 'อันดับกลุ่มอายุ (Age Group Rankings)',
        labelEn: 'Age Group Rankings',
        buildUrl: (origin, campaign) => `${origin}/Result-Winners/${campaign?.slug || campaign?._id || ''}`,
    },
    {
        id: 'overall-winners',
        label: 'อันดับ Overall (Overall Winners)',
        labelEn: 'Overall Winners',
        buildUrl: (origin, campaign) => `${origin}/Overall-Winners/${campaign?.slug || campaign?._id || ''}`,
    },
    {
        id: 'scanning',
        label: '📡 หน้าสแกน RFID (Scanning)',
        labelEn: '📡 RFID Scanning Display',
        buildUrl: (origin, campaign) => `${origin}/scanning/${campaign?.slug || campaign?._id || ''}`,
    },
    {
        id: 'share-live',
        label: '📍 Share Live Monitor (จุดเช็คอิน)',
        labelEn: '📍 Share Live Checkpoint Monitor',
        buildUrl: (origin, campaign) => `${origin}/share-live/${campaign?._id || ''}`,
    },
    {
        id: 'cctv-camera',
        label: '📹 กล้อง CCTV มือถือ — เปิดบนมือถือที่จุด Checkpoint แล้วกด "เริ่มส่งภาพ"',
        labelEn: '📹 CCTV Mobile Camera — open on phone at Checkpoint, tap "Start Stream"',
        buildUrl: (origin, campaign) => `${origin}/camera/${campaign?.slug || campaign?._id || ''}`,
    },
    {
        id: 'certificate-search',
        label: '🏅 ค้นหาใบประกาศ (BIB / ชื่อ)',
        labelEn: '🏅 Certificate Search (BIB / Name)',
        buildUrl: (origin, campaign) => `${origin}/certificate-search/${campaign?.slug || campaign?._id || ''}`,
    },
    {
        id: 'bib-link',
        label: '🔗 พิมพ์ E-Slip',
        labelEn: '🔗 Print E-Slip',
        buildUrl: (origin, campaign) => `${origin}/bib-link/${campaign?.slug || campaign?._id || ''}`,
    },
    {
        id: 'applicant-status',
        label: '📋 ตรวจสอบข้อมูลการสมัคร (ชื่อ / BIB / เลขบัตร / เบอร์)',
        labelEn: '📋 Applicant Status Check (Name / BIB / ID / Phone)',
        buildUrl: (origin, campaign) => `${origin}/applicant-status/${campaign?.slug || campaign?._id || ''}`,
    },
];

export default function LinksPage() {
    const { language } = useLanguage();
    const [campaign, setCampaign] = useState<Campaign | null>(null);
    const [loading, setLoading] = useState(true);
    const [copiedId, setCopiedId] = useState<string | null>(null);
    const [footerLeft, setFooterLeft] = useState<string | null>(null);
    const [footerRight, setFooterRight] = useState<string | null>(null);

    useEffect(() => {
        setFooterLeft(localStorage.getItem('winner_dl_footer_left'));
        setFooterRight(localStorage.getItem('winner_dl_footer_right'));
    }, []);

    const handleImageUpload = (side: 'left' | 'right', file: File) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            const dataUrl = e.target?.result as string;
            localStorage.setItem(`winner_dl_footer_${side}`, dataUrl);
            if (side === 'left') setFooterLeft(dataUrl);
            else setFooterRight(dataUrl);
        };
        reader.readAsDataURL(file);
    };

    const handleClearImage = (side: 'left' | 'right') => {
        localStorage.removeItem(`winner_dl_footer_${side}`);
        if (side === 'left') setFooterLeft(null);
        else setFooterRight(null);
    };

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
            <div className="w-full">
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
                                        <th className="px-4 py-2.5 text-center font-bold text-slate-600 w-25">
                                            {language === 'th' ? 'คัดลอก' : 'Copy'}
                                        </th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {LINK_ROWS.map((row, idx) => {
                                        const url = row.buildUrl(origin, campaign);
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
                                                        className={`px-3.5 py-1.5 rounded-md border-none text-white font-bold text-xs cursor-pointer whitespace-nowrap transition-colors min-w-18 ${isCopied ? 'bg-green-500' : 'bg-blue-500 hover:bg-blue-600'}`}
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
                                    const url = row.buildUrl(origin, campaign);
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

                {/* Winner Download Footer Images */}
                <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm mt-6">
                    <div className="px-4 py-3 border-b border-slate-100 bg-slate-50 flex items-center gap-2">
                        <span className="text-base">🖼️</span>
                        <div>
                            <h3 className="text-sm font-bold text-slate-800 m-0">
                                {language === 'th' ? 'ตั้งค่ารูปภาพสำหรับ Winner Download' : 'Winner Download Footer Images'}
                            </h3>
                            <p className="text-xs text-slate-500 m-0 mt-0.5">
                                {language === 'th'
                                    ? 'รูปที่แสดงในส่วนล่างของภาพผลการแข่งขันที่ดาวโหลด (ขนาด A4)'
                                    : 'Images shown in the footer of downloaded winner result images (A4 size)'}
                            </p>
                        </div>
                    </div>
                    <div className="p-5 flex gap-6 flex-wrap">
                        {/* Left image */}
                        <div className="flex flex-col gap-2 flex-1 min-w-[200px]">
                            <div className="text-xs font-bold text-slate-600 uppercase tracking-wide">
                                {language === 'th' ? 'มุมซ้ายล่าง' : 'Bottom Left'}
                            </div>
                            {footerLeft ? (
                                <div className="relative w-fit">
                                    {/* eslint-disable-next-line @next/next/no-img-element */}
                                    <img src={footerLeft} alt="footer left" className="h-24 w-auto max-w-[200px] rounded-lg border border-slate-200 object-contain bg-slate-50 p-1" />
                                    <button
                                        onClick={() => handleClearImage('left')}
                                        className="absolute -top-2 -right-2 w-5 h-5 rounded-full bg-red-500 text-white text-xs border-none cursor-pointer flex items-center justify-center font-bold leading-none shadow"
                                    >
                                        ×
                                    </button>
                                </div>
                            ) : (
                                <label className="w-full border-2 border-dashed border-slate-200 rounded-xl h-24 flex flex-col items-center justify-center cursor-pointer hover:border-blue-400 hover:bg-blue-50 transition-colors select-none">
                                    <span className="text-2xl">📷</span>
                                    <span className="text-xs text-slate-400 mt-1">{language === 'th' ? 'คลิกเพื่ออัพโหลด' : 'Click to upload'}</span>
                                    <input type="file" accept="image/*" className="hidden" onChange={e => { if (e.target.files?.[0]) handleImageUpload('left', e.target.files[0]); }} />
                                </label>
                            )}
                        </div>

                        {/* Right image — ผู้จัดงาน */}
                        <div className="flex flex-col gap-2 flex-1 min-w-[200px]">
                            <div className="text-xs font-bold text-slate-600 uppercase tracking-wide">
                                {language === 'th' ? 'มุมขวาล่าง (ผู้จัดงาน)' : 'Bottom Right (Organizer)'}
                            </div>
                            {footerRight ? (
                                <div className="relative w-fit">
                                    {/* eslint-disable-next-line @next/next/no-img-element */}
                                    <img src={footerRight} alt="footer right" className="h-24 w-auto max-w-[200px] rounded-lg border border-slate-200 object-contain bg-slate-50 p-1" />
                                    <button
                                        onClick={() => handleClearImage('right')}
                                        className="absolute -top-2 -right-2 w-5 h-5 rounded-full bg-red-500 text-white text-xs border-none cursor-pointer flex items-center justify-center font-bold leading-none shadow"
                                    >
                                        ×
                                    </button>
                                </div>
                            ) : (
                                <label className="w-full border-2 border-dashed border-slate-200 rounded-xl h-24 flex flex-col items-center justify-center cursor-pointer hover:border-blue-400 hover:bg-blue-50 transition-colors select-none">
                                    <span className="text-2xl">📷</span>
                                    <span className="text-xs text-slate-400 mt-1">{language === 'th' ? 'คลิกเพื่ออัพโหลด' : 'Click to upload'}</span>
                                    <input type="file" accept="image/*" className="hidden" onChange={e => { if (e.target.files?.[0]) handleImageUpload('right', e.target.files[0]); }} />
                                </label>
                            )}
                            <div className="flex items-center gap-2 pt-1">
                                <div className="flex-1 border-b border-dashed border-slate-300" />
                                <span className="text-xs text-slate-400 font-medium">ผู้จัดงาน</span>
                                <div className="flex-1 border-b border-dashed border-slate-300" />
                            </div>
                        </div>
                    </div>
                    <div className="px-5 pb-4">
                        <p className="text-xs text-slate-400">
                            {language === 'th'
                                ? '* รูปเก็บใน browser นี้เท่านั้น (localStorage) — ต้องตั้งค่าใหม่หากเปลี่ยนอุปกรณ์'
                                : '* Images are stored in this browser only (localStorage) — reconfigure when switching devices'}
                        </p>
                    </div>
                </div>
            </div>
        </AdminLayout>
    );
}
