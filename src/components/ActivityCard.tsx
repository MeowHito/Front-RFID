'use client';
import React from 'react';
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
        <a
            href={link}
            className="block bg-white dark:bg-[#1e1e2a] rounded-lg shadow-md mb-5 transition-all duration-300 ease-out hover:-translate-y-2 hover:shadow-xl focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
            aria-label={`${displayTitle} ${t('card.viewResults')}`}
        >
            {/* ===== MOBILE LAYOUT ===== */}
            <div className="block md:hidden">
                {/* Cover Image: fixed 16:8, image fills entire area */}
                <div className="relative w-full overflow-hidden rounded-t-lg" style={{ aspectRatio: '16/8', minHeight: 0 }}>
                    <img src={imageUrl} alt={displayTitle} className="absolute inset-0 w-full h-full object-cover" />
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
                    <span className="inline-flex items-center px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-md text-gray-700 dark:text-gray-200 font-medium text-sm">
                        {t('card.viewResults')}
                    </span>
                </div>

                {/* Categories Table - Mobile */}
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
            <div className="hidden md:flex md:flex-row" style={{ borderLeft: `5px solid ${color}`, height: 160 }}>
                {/* Left: Cover Image fixed 16:8 — image fills card height (160px → width 320px) */}
                <div className="relative shrink-0 overflow-hidden" style={{ width: 320, height: 160 }}>
                    <img src={imageUrl} alt={displayTitle} className="absolute inset-0 w-full h-full object-cover" style={{ pointerEvents: 'none' }} />
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
                <div className="flex flex-col justify-center px-5 py-3 border-r border-gray-100 dark:border-gray-700 shrink-0" style={{ width: '22%' }}>
                    <h2 className="text-base font-bold mb-1 leading-tight uppercase" style={{ color: color }}>{displayTitle}</h2>
                    <p className="text-[0.75rem] text-gray-700 dark:text-gray-300 font-medium mb-0.5 line-clamp-1">📍 {displayLocation}</p>
                    <p className="text-[0.7rem] text-gray-400 mb-2.5">📅 {date}</p>
                    <span className="inline-flex items-center px-3 py-1 border border-gray-300 dark:border-gray-600 rounded text-gray-700 dark:text-gray-200 font-semibold text-[0.7rem] w-fit">
                        {t('card.viewResults')}
                    </span>
                </div>

                {/* Right: Stats Table - 7 columns */}
                <div className="flex-1 bg-white dark:bg-[#1e1e2a]" style={{ overflow: 'hidden' }}>
                    <div className="px-2 overflow-x-auto overflow-y-auto" style={{ maxHeight: '160px' }}>
                        <table className="w-full border-collapse" style={{ tableLayout: 'auto' }}>
                            <thead className="sticky top-0 bg-white dark:bg-[#1e1e2a] z-10">
                                <tr>
                                    <th className="text-left text-[0.55rem] text-gray-800 dark:text-gray-200 font-bold py-1 pr-2 border-b border-gray-300 dark:border-gray-600 whitespace-nowrap">{t('card.status')}</th>
                                    <th className="text-left text-[0.55rem] text-gray-800 dark:text-gray-200 font-bold py-1 pr-2 border-b border-gray-300 dark:border-gray-600 whitespace-nowrap">{t('card.distance')}</th>
                                    <th className="text-left text-[0.55rem] text-gray-800 dark:text-gray-200 font-bold py-1 pr-2 border-b border-gray-300 dark:border-gray-600 whitespace-nowrap">{t('card.start')}</th>
                                    <th className="text-left text-[0.55rem] text-gray-800 dark:text-gray-200 font-bold py-1 pr-2 border-b border-gray-300 dark:border-gray-600 whitespace-nowrap">{t('card.cutoff')}</th>
                                    <th className="text-center text-[0.55rem] text-gray-800 dark:text-gray-200 font-bold py-1 pr-2 border-b border-gray-300 dark:border-gray-600 whitespace-nowrap">ITRA</th>
                                    <th className="text-center text-[0.55rem] text-gray-800 dark:text-gray-200 font-bold py-1 pr-2 border-b border-gray-300 dark:border-gray-600 whitespace-nowrap">INDEX</th>
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
                                        </td>
                                        <td className="py-1 pr-2 align-middle text-[0.65rem] text-gray-600 dark:text-gray-400 whitespace-nowrap max-w-[100px] truncate">{cat.start}</td>
                                        <td className="py-1 pr-2 align-middle text-[0.7rem] text-gray-600 dark:text-gray-400 whitespace-nowrap">{cat.cutoff || '-'}</td>
                                        <td className="py-1 pr-2 align-middle text-center">
                                            {cat.itra ? (
                                                <span className="inline-flex items-center gap-0.5 px-1 py-0.5 rounded text-[0.45rem] font-bold text-white bg-[#1a237e]">
                                                    💎{cat.itra}
                                                </span>
                                            ) : (
                                                <span className="text-gray-400 text-[0.6rem]">-</span>
                                            )}
                                        </td>
                                        <td className="py-1 pr-2 align-middle text-center">
                                            {cat.index ? (
                                                <span className="inline-flex items-center gap-0.5 px-1 py-0.5 rounded text-[0.45rem] font-bold text-white bg-[#f57f17]">
                                                    ⚡{cat.index}
                                                </span>
                                            ) : (
                                                <span className="text-gray-400 text-[0.6rem]">-</span>
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
        </a>
    );
}