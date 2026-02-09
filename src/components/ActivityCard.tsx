'use client';
import React from 'react';
import Link from 'next/link';
import { useLanguage } from '@/lib/language-context';

interface EventCategory {
    name: string;      // e.g. 100M
    distance: string;  // e.g. 175 KM
    start: string;     // e.g. 10:00
    cutoff: string;    // e.g. 48 ชม.
    elevation?: string; // e.g. 10,400 m+
    type?: string;     // Alternate for elevation
    badgeColor: string;
    status: 'live' | 'wait' | 'finished';
    itra?: number | string; // e.g. 6
    index?: string;         // e.g. 100M or M
}

interface ActivityCardProps {
    id: string;
    title: string;
    titleTh?: string;
    titleEn?: string;
    location: string;
    locationTh?: string;
    locationEn?: string;
    date: string;
    imageUrl: string;
    color: string;
    categories: EventCategory[];
    link: string;
    status?: {
        label: string;
        state: 'open' | 'closed' | 'live';
    };
    countdown?: {
        days: string;
        hours: string;
        mins: string;
        secs: string;
    };
}

export default function ActivityCard({
    id,
    title,
    titleTh,
    titleEn,
    location,
    locationTh,
    locationEn,
    date,
    imageUrl,
    color,
    categories,
    link,
    status,
    countdown
}: ActivityCardProps) {
    const { language, t } = useLanguage();

    const displayTitle = language === 'th'
        ? (titleTh || title)
        : (titleEn || title);

    const displayLocation = language === 'th'
        ? (locationTh || location)
        : (locationEn || location);

    return (
        <Link href={link} className="block">
            <div className="bg-white dark:bg-[#1e1e2a] rounded-lg shadow-md border border-gray-200 dark:border-[#3a3a4a] overflow-hidden mb-5 transition-all hover:shadow-lg cursor-pointer">
                {/* ===== MOBILE LAYOUT ===== */}
                <div className="block md:hidden">
                    {/* Cover Image 16:9 */}
                    <div className="relative w-full" style={{ aspectRatio: '16/9' }}>
                        <img src={imageUrl} alt={displayTitle} className="w-full h-full object-cover" />
                        {countdown && (
                            <div className="absolute top-3 left-3 bg-black/75 text-white px-2 py-1.5 rounded-md flex items-center gap-0.5 backdrop-blur-sm">
                                <div className="text-center px-1.5 border-r border-white/30">
                                    <span className="block text-sm font-bold leading-tight">{countdown.days}</span>
                                    <span className="block text-[0.55rem] opacity-80">{t('card.days')}</span>
                                </div>
                                <div className="text-center px-1.5 border-r border-white/30">
                                    <span className="block text-sm font-bold leading-tight">{countdown.hours}</span>
                                    <span className="block text-[0.55rem] opacity-80">{t('card.hours')}</span>
                                </div>
                                <div className="text-center px-1.5 border-r border-white/30">
                                    <span className="block text-sm font-bold leading-tight">{countdown.mins}</span>
                                    <span className="block text-[0.55rem] opacity-80">{t('card.mins')}</span>
                                </div>
                                <div className="text-center px-1.5">
                                    <span className="block text-sm font-bold leading-tight">{countdown.secs}</span>
                                    <span className="block text-[0.55rem] opacity-80">{t('card.secs')}</span>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Event Info */}
                    <div className="px-4 pt-5 pb-4">
                        <h2 className="text-xl font-bold mb-2 uppercase tracking-wide" style={{ color: color }}>{displayTitle}</h2>
                        <p className="text-sm text-gray-600 dark:text-gray-300 mb-0.5">📍 {displayLocation}</p>
                        <p className="text-sm text-gray-400 mb-4">📅 {date}</p>
                        <span
                            className="inline-flex items-center px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-md text-gray-700 dark:text-gray-200 font-medium text-sm hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                        >
                            {t('card.viewResults')}
                        </span>
                    </div>

                    {/* Categories Table  Mobile */}
                    <div className="border-t border-gray-100 dark:border-gray-700">
                        <div className="overflow-x-auto overflow-y-auto max-h-[280px]">
                            <table className="w-full text-xs min-w-[550px]">
                                <thead className="sticky top-0 bg-white dark:bg-[#1e1e2a] z-10">
                                    <tr className="border-b-2 border-gray-300 dark:border-gray-600">
                                        <th className="text-left py-2.5 px-3 font-bold text-gray-800 dark:text-gray-200 text-[0.7rem] whitespace-nowrap">{t('card.status')}</th>
                                        <th className="text-left py-2.5 px-2 font-bold text-gray-800 dark:text-gray-200 text-[0.7rem] whitespace-nowrap">{t('card.distance')}</th>
                                        <th className="text-center py-2.5 px-2 font-bold text-gray-800 dark:text-gray-200 text-[0.7rem] whitespace-nowrap">{t('card.start')}</th>
                                        <th className="text-center py-2.5 px-2 font-bold text-gray-800 dark:text-gray-200 text-[0.7rem] whitespace-nowrap">{t('card.cutoff')}</th>
                                        <th className="text-center py-2.5 px-2 font-bold text-gray-800 dark:text-gray-200 text-[0.7rem] whitespace-nowrap">ITRA</th>
                                        <th className="text-center py-2.5 px-2 font-bold text-gray-800 dark:text-gray-200 text-[0.7rem] whitespace-nowrap">INDEX</th>
                                        <th className="text-right py-2.5 px-3 font-bold text-gray-800 dark:text-gray-200 text-[0.7rem] whitespace-nowrap">{t('card.typeElev')}</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {categories.map((cat, idx) => (
                                        <tr key={idx} className="border-b border-gray-100 dark:border-gray-700 last:border-0">
                                            <td className="py-2.5 px-3 align-middle">
                                                {cat.status === 'live' ? (
                                                    <span className="inline-block bg-red-600 text-white text-[0.6rem] font-bold px-1.5 py-0.5 rounded">LIVE</span>
                                                ) : cat.status === 'finished' ? (
                                                    <span className="text-sm">🥇</span>
                                                ) : (
                                                    <span className="text-gray-400 text-sm">⏳</span>
                                                )}
                                            </td>
                                            <td className="py-2.5 px-2 align-middle whitespace-nowrap">
                                                <span className="font-medium text-gray-800 dark:text-gray-200 text-sm">{cat.distance}</span>
                                                <span className="ml-1.5 text-[0.55rem] font-bold px-1 py-0.5 rounded text-white" style={{ backgroundColor: cat.badgeColor }}>{cat.name}</span>
                                            </td>
                                            <td className="py-2.5 px-2 align-middle text-center text-sm text-gray-600 dark:text-gray-400">{cat.start}</td>
                                            <td className="py-2.5 px-2 align-middle text-center text-sm text-gray-600 dark:text-gray-400">{cat.cutoff || '-'}</td>
                                            <td className="py-2.5 px-2 align-middle text-center">
                                                {cat.itra ? (
                                                    <span className="px-1.5 py-0.5 rounded text-[0.55rem] font-bold text-white bg-[#1a237e]">💎{cat.itra}</span>
                                                ) : (
                                                    <span className="text-gray-400">-</span>
                                                )}
                                            </td>
                                            <td className="py-2.5 px-2 align-middle text-center">
                                                {cat.index ? (
                                                    <span className="px-1.5 py-0.5 rounded text-[0.55rem] font-bold text-white bg-[#f57f17]">⚡{cat.index}</span>
                                                ) : (
                                                    <span className="text-gray-400">-</span>
                                                )}
                                            </td>
                                            <td className="py-2.5 px-3 align-middle text-right text-sm text-gray-600 dark:text-gray-400">{cat.elevation || cat.type || '-'}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>

                {/* ===== DESKTOP LAYOUT ===== */}
                <div className="hidden md:flex md:flex-row transition-all duration-300 hover:shadow-xl" style={{ borderLeft: `5px solid ${color}`, height: '180px' }}>
                    {/* Left: Cover Image 16:9 with countdown */}
                    <div className="relative shrink-0" style={{ width: '32%', maxWidth: '300px' }}>
                        <div style={{ aspectRatio: '16/9', width: '100%', overflow: 'hidden' }}>
                            <img src={imageUrl} alt={displayTitle} className="w-full h-full object-cover" />
                        </div>
                        {countdown && (
                            <div className="absolute top-2 left-2 bg-black/70 text-white p-1 rounded flex items-center gap-0.5 backdrop-blur-sm z-10">
                                <div className="text-center px-1.5 border-r border-white/30 min-w-[28px]">
                                    <span className="block text-xs font-bold leading-3">{countdown.days}</span>
                                    <span className="block text-[0.45rem] opacity-90 leading-3">{t('card.days')}</span>
                                </div>
                                <div className="text-center px-1.5 border-r border-white/30 min-w-[28px]">
                                    <span className="block text-xs font-bold leading-3">{countdown.hours}</span>
                                    <span className="block text-[0.45rem] opacity-90 leading-3">{t('card.hours')}</span>
                                </div>
                                <div className="text-center px-1.5 border-r border-white/30 min-w-[28px]">
                                    <span className="block text-xs font-bold leading-3">{countdown.mins}</span>
                                    <span className="block text-[0.45rem] opacity-90 leading-3">{t('card.mins')}</span>
                                </div>
                                <div className="text-center px-1.5 min-w-[28px]">
                                    <span className="block text-xs font-bold leading-3">{countdown.secs}</span>
                                    <span className="block text-[0.45rem] opacity-90 leading-3">{t('card.secs')}</span>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Middle: Event Details */}
                    <div className="flex flex-col justify-center px-5 py-4 border-r border-gray-100 dark:border-gray-700 shrink-0" style={{ width: '24%' }}>
                        <h2 className="text-base font-bold mb-1.5 leading-tight uppercase" style={{ color: color }}>{displayTitle}</h2>
                        <p className="text-[0.75rem] text-gray-700 dark:text-gray-300 font-medium mb-0.5 line-clamp-1">📍 {displayLocation}</p>
                        <p className="text-[0.7rem] text-gray-400 mb-3">📅 {date}</p>
                        <span className="inline-flex items-center px-4 py-1.5 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-700 dark:text-gray-200 font-semibold text-[0.7rem] hover:bg-gray-50 dark:hover:bg-gray-700 hover:scale-[1.02] transition-all w-fit">
                            {t('card.viewResults')}
                        </span>
                    </div>

                    {/* Right: Stats Table - 5 columns */}
                    <div className="flex-1 bg-white dark:bg-[#1e1e2a]">
                        <div className="h-full px-2 overflow-y-auto" style={{ maxHeight: '140px' }}>
                            <table className="w-full border-collapse" style={{ tableLayout: 'fixed' }}>
                                <colgroup>
                                    <col style={{ width: '10%' }} />
                                    <col style={{ width: '20%' }} />
                                    <col style={{ width: '12%' }} />
                                    <col style={{ width: '38%' }} />
                                    <col style={{ width: '20%' }} />
                                </colgroup>
                                <thead className="sticky top-0 bg-white dark:bg-[#1e1e2a] z-10">
                                    <tr>
                                        <th className="text-left text-[0.55rem] text-gray-800 dark:text-gray-200 font-bold py-1 pr-2 border-b border-gray-300 dark:border-gray-600 whitespace-nowrap">{t('card.status')}</th>
                                        <th className="text-left text-[0.55rem] text-gray-800 dark:text-gray-200 font-bold py-1 pr-2 border-b border-gray-300 dark:border-gray-600 whitespace-nowrap">{t('card.distance')}</th>
                                        <th className="text-left text-[0.55rem] text-gray-800 dark:text-gray-200 font-bold py-1 pr-2 border-b border-gray-300 dark:border-gray-600 whitespace-nowrap">{t('card.start')}</th>
                                        <th className="text-left text-[0.55rem] text-gray-800 dark:text-gray-200 font-bold py-1 pr-2 border-b border-gray-300 dark:border-gray-600 whitespace-nowrap">{t('card.cutoff')} / {t('card.itra')} / {t('card.index')}</th>
                                        <th className="text-left text-[0.55rem] text-gray-800 dark:text-gray-200 font-bold py-1 border-b border-gray-300 dark:border-gray-600 whitespace-nowrap">{t('card.typeElev')}</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {categories.map((cat, idx) => (
                                        <tr key={idx} className="border-b border-gray-100 dark:border-gray-800 last:border-0">
                                            <td className="py-1 pr-2 align-middle">
                                                {cat.status === 'live' ? (
                                                    <span className="inline-block bg-red-600 text-white text-[0.45rem] font-bold px-1 py-0.5 rounded" style={{ animation: 'pulse-text 1.5s ease-in-out infinite' }}>LIVE</span>
                                                ) : cat.status === 'finished' ? (
                                                    <span className="text-[0.7rem]">🥇</span>
                                                ) : (
                                                    <span className="text-gray-400 text-[0.7rem]">🕒</span>
                                                )}
                                            </td>
                                            <td className="py-1 pr-2 align-middle whitespace-nowrap">
                                                <span className="text-[0.7rem] font-normal text-gray-800 dark:text-gray-200">{cat.distance}</span>
                                                <span className="ml-1 text-[0.45rem] font-normal px-1 py-0.5 rounded text-white" style={{ backgroundColor: cat.badgeColor || '#dc2626' }}>{cat.name}</span>
                                            </td>
                                            <td className="py-1 pr-2 align-middle text-[0.7rem] text-gray-600 dark:text-gray-400 whitespace-nowrap">{cat.start}</td>
                                            <td className="py-1 pr-2 align-middle whitespace-nowrap">
                                                <span className="text-[0.7rem] text-gray-600 dark:text-gray-400">{cat.cutoff || '-'}</span>
                                                {cat.itra && (
                                                    <span className="ml-1 inline-flex items-center gap-0.5 px-1 py-0.5 rounded text-[0.45rem] font-bold text-white bg-[#1a237e]">
                                                        💎 {cat.itra}
                                                    </span>
                                                )}
                                                {cat.index && (
                                                    <span className="ml-1 inline-flex items-center gap-0.5 px-1 py-0.5 rounded text-[0.45rem] font-bold text-white bg-[#f57f17]">
                                                        ⚡ {cat.index}
                                                    </span>
                                                )}
                                            </td>
                                            <td className="py-1 align-middle text-[0.7rem] text-gray-600 dark:text-gray-400 whitespace-nowrap">
                                                {cat.elevation || cat.type || '-'}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            </div>
        </Link>
    );
}