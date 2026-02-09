'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useTheme } from '@/lib/theme-context';
import { useLanguage } from '@/lib/language-context';
import { RunnersList, Runner } from '@/components/RunnerCard';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

// Campaign interface from MongoDB
interface RaceCategory {
    name: string;
    distance: string;
    elevation?: string;
    raceType?: string;
    badgeColor: string;
}

interface Campaign {
    _id: string;
    uuid: string;
    name: string;
    nameTh?: string;
    nameEn?: string;
    eventDate: string;
    eventEndDate?: string;
    location: string;
    locationTh?: string;
    locationEn?: string;
    categories: RaceCategory[];
    status: string;
}

// Runner interface (imported from RunnerCard component)
// Using Runner interface from RunnerCard.tsx which matches MongoDB schema

export default function ResultPage() {
    const { theme } = useTheme();
    const { language } = useLanguage();
    const params = useParams();
    const eventId = params.id as string;

    const [campaign, setCampaign] = useState<Campaign | null>(null);
    const [runners, setRunners] = useState<Runner[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [genderFilter, setGenderFilter] = useState<'ALL' | 'M' | 'F'>('ALL');
    const [searchQuery, setSearchQuery] = useState('');
    const [showGenRank, setShowGenRank] = useState(true);
    const [showCatRank, setShowCatRank] = useState(true);

    // Fetch data on mount
    useEffect(() => {
        if (eventId) {
            fetchData();
        }
    }, [eventId]);

    async function fetchData() {
        try {
            setLoading(true);
            setError(null);

            // Debug: log API URL and event ID
            console.log('Fetching event:', eventId);
            console.log('API URL:', `${API_URL}/campaigns/${eventId}`);

            // Fetch campaign data
            const campaignRes = await fetch(`${API_URL}/campaigns/${eventId}`);
            console.log('Campaign response status:', campaignRes.status);

            if (!campaignRes.ok) {
                const errorText = await campaignRes.text();
                console.error('Campaign error:', errorText);
                throw new Error(language === 'th' ? 'ไม่พบข้อมูลกิจกรรม' : 'Event not found');
            }
            const campaignData = await campaignRes.json();
            console.log('Campaign data:', campaignData);
            setCampaign(campaignData);

            // Fetch runners via public-api (no auth required)
            const runnersRes = await fetch(`${API_URL}/public-api/campaign/getAllParticipantByEvent?id=${eventId}`);
            console.log('Runners response status:', runnersRes.status);

            if (runnersRes.ok) {
                const runnersResponse = await runnersRes.json();
                console.log('Runners data:', runnersResponse);
                // public-api returns { status: {...}, data: { data: [...], total: N } }
                const runnersData = runnersResponse?.data?.data || runnersResponse?.data || [];
                setRunners(runnersData);
            }
        } catch (err: unknown) {
            console.error('Fetch error:', err);
            const errorMessage = err instanceof Error ? err.message : 'Error loading event';
            setError(errorMessage);
        } finally {
            setLoading(false);
        }
    }

    // Format time from milliseconds
    function formatTime(ms: number | undefined): string {
        if (!ms) return '--:--:--';
        const hours = Math.floor(ms / 3600000);
        const minutes = Math.floor((ms % 3600000) / 60000);
        const seconds = Math.floor((ms % 60000) / 1000);
        return `${hours}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    }

    // Format date
    function formatDate(dateString: string): string {
        const date = new Date(dateString);
        return date.toLocaleDateString(language === 'th' ? 'th-TH' : 'en-US', {
            day: 'numeric',
            month: 'short',
            year: 'numeric'
        });
    }

    // Get status color classes
    function getStatusColor(status: string): { text: string; bg: string } {
        switch (status) {
            case 'finished':
                return { text: 'text-green-600', bg: 'bg-green-600' };
            case 'in_progress':
                return { text: 'text-orange-500', bg: 'bg-orange-500' };
            case 'dnf':
                return { text: 'text-red-500', bg: 'bg-red-600' };
            case 'dns':
                return { text: 'text-gray-400', bg: 'bg-gray-400' };
            default:
                return { text: 'text-slate-400', bg: 'bg-slate-400' };
        }
    }

    // Get status label
    function getStatusLabel(status: string): string {
        const labels: Record<string, string> = {
            finished: 'FINISH',
            in_progress: 'RACING',
            dnf: 'DNF',
            dns: 'DNS',
            not_started: 'NOT STARTED'
        };
        return labels[status] || status.toUpperCase();
    }

    // Filter runners
    const filteredRunners = runners.filter(runner => {
        const matchesGender = genderFilter === 'ALL' || runner.gender === genderFilter;
        const matchesSearch = searchQuery === '' ||
            runner.firstName.toLowerCase().includes(searchQuery.toLowerCase()) ||
            runner.lastName.toLowerCase().includes(searchQuery.toLowerCase()) ||
            runner.bib.includes(searchQuery);
        return matchesGender && matchesSearch;
    });

    // Stats
    const stats = {
        started: runners.length,
        racing: runners.filter(r => r.status === 'in_progress').length,
        finished: runners.filter(r => r.status === 'finished').length,
        dnf: runners.filter(r => r.status === 'dnf' || r.status === 'dns').length
    };

    // Loading state
    if (loading) {
        return (
            <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--background)' }}>
                <div className="text-center">
                    <div className="w-12 h-12 border-4 border-green-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
                    <p style={{ color: 'var(--muted-foreground)' }}>
                        {language === 'th' ? 'กำลังโหลด...' : 'Loading...'}
                    </p>
                </div>
            </div>
        );
    }

    // Error state
    if (error || !campaign) {
        return (
            <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--background)' }}>
                <div className="text-center p-8 rounded-xl" style={{ background: 'var(--card)' }}>
                    <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
                        <svg className="h-8 w-8 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                        </svg>
                    </div>
                    <h2 className="text-xl font-semibold mb-2" style={{ color: 'var(--foreground)' }}>
                        {language === 'th' ? 'ไม่พบกิจกรรม' : 'Event Not Found'}
                    </h2>
                    <p className="mb-6" style={{ color: 'var(--muted-foreground)' }}>
                        {error || (language === 'th' ? 'กิจกรรมนี้ไม่มีอยู่ในระบบ' : 'This event does not exist')}
                    </p>
                    <Link href="/" className="text-green-500 hover:text-green-600 font-medium">
                        ← {language === 'th' ? 'กลับหน้าหลัก' : 'Back to Home'}
                    </Link>
                </div>
            </div>
        );
    }

    const displayName = language === 'th' ? (campaign.nameTh || campaign.name) : (campaign.nameEn || campaign.name);
    const displayLocation = language === 'th' ? (campaign.locationTh || campaign.location) : (campaign.location);

    return (
        <div className="min-h-screen text-slate-800 overflow-hidden" style={{ background: theme === 'dark' ? '#0f172a' : '#f8fafc' }}>
            {/* Header */}
            <header className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-700 px-4 py-3 shadow-sm">
                <div className="max-w-full mx-auto flex justify-between items-center">
                    <div className="flex items-center gap-3">
                        <Link href="/" className="text-lg font-black italic text-slate-900 dark:text-white border-r pr-3 border-slate-300 dark:border-slate-600 hover:opacity-80 transition">
                            ACTION <span className="text-green-600 font-bold uppercase not-italic">Live</span>
                        </Link>
                        <div>
                            <h1 className="text-sm font-bold leading-tight text-slate-900 dark:text-white">{displayName}</h1>
                            <p className="text-[10px] text-slate-400 font-medium">
                                {formatDate(campaign.eventDate)} | {displayLocation}
                            </p>
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        {/* Gender Filter */}
                        <div className="flex bg-slate-100 dark:bg-slate-800 p-1 rounded-lg mr-2">
                            <button
                                onClick={() => setGenderFilter('ALL')}
                                className={`px-3 py-1 text-[10px] font-bold rounded-md transition-all ${genderFilter === 'ALL' ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900' : 'text-slate-600 dark:text-slate-400'}`}
                            >
                                {language === 'th' ? 'ทั้งหมด' : 'All'}
                            </button>
                            <button
                                onClick={() => setGenderFilter('M')}
                                className={`px-3 py-1 text-[10px] font-bold rounded-md transition-all ${genderFilter === 'M' ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900' : 'text-slate-600 dark:text-slate-400'}`}
                            >
                                {language === 'th' ? 'ชาย' : 'Male'}
                            </button>
                            <button
                                onClick={() => setGenderFilter('F')}
                                className={`px-3 py-1 text-[10px] font-bold rounded-md transition-all ${genderFilter === 'F' ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900' : 'text-slate-600 dark:text-slate-400'}`}
                            >
                                {language === 'th' ? 'หญิง' : 'Female'}
                            </button>
                        </div>

                        {/* Search */}
                        <div className="relative hidden sm:block">
                            <svg className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                            </svg>
                            <input
                                type="text"
                                placeholder={language === 'th' ? 'BIB หรือ ชื่อ...' : 'BIB or Name...'}
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                className="pl-9 pr-4 py-1.5 bg-slate-100 dark:bg-slate-800 border-none rounded-lg text-xs w-48 outline-none focus:ring-1 focus:ring-green-500 transition-all text-slate-800 dark:text-white"
                            />
                        </div>

                        {/* Column Toggle */}
                        <div className="relative group">
                            <button className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-300 px-3 py-1.5 rounded-lg text-xs font-bold hover:bg-slate-50 dark:hover:bg-slate-700 transition flex items-center gap-2">
                                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                                </svg>
                                {language === 'th' ? 'คอลัมน์' : 'Columns'}
                            </button>
                            <div className="hidden group-hover:block absolute right-0 top-full mt-1 bg-white dark:bg-slate-800 min-w-[160px] shadow-lg border border-slate-200 dark:border-slate-600 rounded-lg z-30 p-2">
                                <p className="text-[10px] font-bold text-slate-400 uppercase mb-2 px-2">
                                    {language === 'th' ? 'ตั้งค่าการแสดงผล' : 'Display Settings'}
                                </p>
                                <label className="flex items-center gap-2 px-2 py-1 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-700 rounded">
                                    <input type="checkbox" checked={showGenRank} onChange={(e) => setShowGenRank(e.target.checked)} />
                                    <span className="text-xs text-slate-700 dark:text-slate-300">Gender Rank</span>
                                </label>
                                <label className="flex items-center gap-2 px-2 py-1 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-700 rounded">
                                    <input type="checkbox" checked={showCatRank} onChange={(e) => setShowCatRank(e.target.checked)} />
                                    <span className="text-xs text-slate-700 dark:text-slate-300">Category Rank</span>
                                </label>
                            </div>
                        </div>
                    </div>
                </div>
            </header>

            {/* Stats Bar */}
            <div className="bg-slate-900 text-slate-400 px-4 py-2">
                <div className="max-w-full mx-auto flex gap-6 text-[11px] font-bold uppercase tracking-wider overflow-x-auto whitespace-nowrap">
                    <div className="flex items-center">
                        <span className="text-slate-500 mr-1">Started:</span>
                        <span className="text-white">{stats.started}</span>
                    </div>
                    <div className="flex items-center">
                        <span className="w-2 h-2 rounded-full bg-orange-500 mr-1.5"></span>
                        Racing: <span className="text-white ml-1">{stats.racing}</span>
                    </div>
                    <div className="flex items-center">
                        <span className="w-2 h-2 rounded-full bg-green-500 mr-1.5"></span>
                        Finished: <span className="text-white ml-1">{stats.finished}</span>
                    </div>
                    <div className="flex items-center">
                        <span className="w-2 h-2 rounded-full bg-red-500 mr-1.5"></span>
                        DNF/DNS: <span className="text-white ml-1">{stats.dnf}</span>
                    </div>
                </div>
            </div>

            {/* Main Table */}
            <main className="p-0 sm:p-4">
                <div className="bg-white dark:bg-slate-800 rounded-none sm:rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 overflow-hidden" style={{ height: 'calc(100vh - 180px)', overflowY: 'auto' }}>
                    <table className="w-full text-left border-collapse">
                        <thead>
                            <tr className="text-[10px] font-bold text-slate-400 uppercase tracking-tighter sticky top-0 bg-white dark:bg-slate-800 z-20 border-b-2 border-slate-100 dark:border-slate-700">
                                <th className="py-3 px-4 text-center w-12">Rank</th>
                                {showGenRank && <th className="py-3 px-2 text-center w-12">Gen</th>}
                                {showCatRank && <th className="py-3 px-2 text-center w-12">Cat</th>}
                                <th className="py-3 px-2">Runner</th>
                                <th className="py-3 px-2 text-center">Gender</th>
                                <th className="py-3 px-2">Status / Last CP</th>
                                <th className="py-3 px-2">Time</th>
                                <th className="py-3 px-2 hidden md:table-cell">Est. Finish</th>
                                <th className="py-3 px-4 text-right">Progress</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-50 dark:divide-slate-700">
                            {filteredRunners.length === 0 ? (
                                <tr>
                                    <td colSpan={9} className="py-12 text-center text-slate-400">
                                        {language === 'th' ? 'ยังไม่มีข้อมูลนักวิ่ง' : 'No runners data yet'}
                                    </td>
                                </tr>
                            ) : (
                                filteredRunners.map((runner, index) => {
                                    const colors = getStatusColor(runner.status);
                                    const rank = runner.overallRank || index + 1;
                                    const totalDistance = 100; // Will be dynamic later

                                    return (
                                        <tr key={runner._id} className="hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors cursor-pointer group border-l-4 border-transparent hover:border-green-500">
                                            <td className="py-3 px-4 text-center">
                                                <span className={`text-base font-black ${rank <= 3 ? (rank === 1 ? 'text-green-600' : 'text-slate-600 dark:text-slate-300') : 'text-slate-300 dark:text-slate-500'}`}>
                                                    {rank}
                                                </span>
                                            </td>
                                            {showGenRank && (
                                                <td className="py-3 px-2 text-center">
                                                    <span className="text-xs font-bold text-slate-500">{runner.genderRank || '-'}</span>
                                                </td>
                                            )}
                                            {showCatRank && (
                                                <td className="py-3 px-2 text-center">
                                                    <span className="text-xs font-bold text-slate-500">{runner.categoryRank || '-'}</span>
                                                </td>
                                            )}
                                            <td className="py-3 px-2">
                                                <div className="flex items-center gap-3">
                                                    <div className="relative">
                                                        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-slate-200 to-slate-300 dark:from-slate-600 dark:to-slate-700 flex items-center justify-center text-xs font-bold text-slate-600 dark:text-slate-200">
                                                            {runner.firstName.charAt(0)}{runner.lastName.charAt(0)}
                                                        </div>
                                                        {runner.status === 'in_progress' && (
                                                            <span className="w-2 h-2 rounded-full bg-green-500 absolute -bottom-0.5 -right-0.5 animate-pulse border border-white"></span>
                                                        )}
                                                    </div>
                                                    <div>
                                                        <span className="block font-bold text-sm text-slate-800 dark:text-white leading-none uppercase">
                                                            {runner.firstName} {runner.lastName}
                                                            <span className="ml-2 bg-slate-700 text-white px-1.5 py-0.5 rounded text-[10px] font-bold">#{runner.bib}</span>
                                                        </span>
                                                        <span className="text-[10px] text-slate-400 font-medium">
                                                            {runner.nationality || '🏃'} | {runner.category || 'Open'}
                                                        </span>
                                                    </div>
                                                </div>
                                            </td>
                                            <td className="py-3 px-2 text-center">
                                                <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${runner.gender === 'M' ? 'text-blue-500 bg-blue-50 dark:bg-blue-900/30' : 'text-pink-500 bg-pink-50 dark:bg-pink-900/30'}`}>
                                                    {runner.gender}
                                                </span>
                                            </td>
                                            <td className="py-3 px-2">
                                                <span className={`block font-bold text-[11px] ${colors.text} leading-none mb-1`}>
                                                    {getStatusLabel(runner.status)}
                                                </span>
                                                <span className="text-[10px] text-slate-400 uppercase font-medium">
                                                    {runner.latestCheckpoint || '-'}
                                                </span>
                                            </td>
                                            <td className="py-3 px-2">
                                                <span className="text-sm font-bold text-slate-900 dark:text-white">
                                                    {formatTime(runner.netTime)}
                                                </span>
                                            </td>
                                            <td className="py-3 px-2 hidden md:table-cell">
                                                <span className={`text-[11px] ${runner.status === 'finished' ? 'text-slate-300' : 'text-blue-500 bg-blue-50 dark:bg-blue-900/30 px-1.5 py-0.5 rounded font-bold'}`}>
                                                    {runner.latestCheckpoint || '--'}
                                                </span>
                                            </td>
                                            <td className="py-3 px-4 text-right">
                                                <div className="flex flex-col items-end">
                                                    <span className="font-bold text-xs text-slate-600 dark:text-slate-300">
                                                        {runner.category || 'Open'}
                                                    </span>
                                                </div>
                                            </td>
                                        </tr>
                                    );
                                })
                            )}
                        </tbody>
                    </table>
                </div>
            </main>

            {/* Footer */}
            <footer className="bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-700 px-4 py-2 fixed bottom-0 w-full flex justify-between items-center z-30">
                <p className="text-[9px] font-bold text-slate-300 uppercase tracking-widest">ACTION TIMING © 2026</p>
                <div className="flex gap-4">
                    <span className="text-[9px] text-green-500 font-bold uppercase animate-pulse">
                        <span className="inline-block w-1.5 h-1.5 rounded-full bg-green-500 mr-1"></span>
                        Connected
                    </span>
                </div>
            </footer>
        </div>
    );
}
