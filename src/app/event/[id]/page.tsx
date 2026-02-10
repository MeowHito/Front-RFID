'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useTheme } from '@/lib/theme-context';
import { useLanguage } from '@/lib/language-context';

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

// Runner interface matching MongoDB schema
interface Runner {
    _id: string;
    bib: string;
    firstName: string;
    lastName: string;
    firstNameTh?: string;
    lastNameTh?: string;
    gender: string;
    ageGroup?: string;
    category?: string;
    status: string;
    overallRank?: number;
    genderRank?: number;
    categoryRank?: number;
    latestCheckpoint?: string;
    netTime?: number;
    elapsedTime?: number;
    nationality?: string;
}

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
    const [categoryFilter, setCategoryFilter] = useState('ALL');
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

            // Fetch campaign data via proxy API
            const campaignRes = await fetch(`/api/campaigns/${eventId}`);
            if (!campaignRes.ok) {
                throw new Error(language === 'th' ? 'ไม่พบข้อมูลกิจกรรม' : 'Event not found');
            }
            const campaignData = await campaignRes.json();
            setCampaign(campaignData);

            // Fetch runners via proxy API
            const runnersRes = await fetch(`/api/runners?id=${eventId}`);
            if (runnersRes.ok) {
                const runnersResponse = await runnersRes.json();
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
        const matchesCategory = categoryFilter === 'ALL' || runner.category === categoryFilter;
        const query = searchQuery.toLowerCase();
        const matchesSearch = searchQuery === '' ||
            runner.firstName?.toLowerCase().includes(query) ||
            runner.lastName?.toLowerCase().includes(query) ||
            runner.firstNameTh?.toLowerCase().includes(query) ||
            runner.lastNameTh?.toLowerCase().includes(query) ||
            runner.bib?.includes(searchQuery);
        return matchesGender && matchesSearch && matchesCategory;
    });

    // Stats
    const stats = {
        started: runners.length,
        racing: runners.filter(r => r.status === 'in_progress').length,
        finished: runners.filter(r => r.status === 'finished').length,
        dnf: runners.filter(r => r.status === 'dnf' || r.status === 'dns').length
    };

    // Get unique categories from campaign
    const categories = campaign?.categories || [];

    // Loading state
    if (loading) {
        return (
            <div className="min-h-screen flex items-center justify-center" style={{ background: theme === 'dark' ? '#0f172a' : '#f8fafc' }}>
                <div className="text-center">
                    <div className="w-12 h-12 border-4 border-green-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
                    <p className={theme === 'dark' ? 'text-slate-400' : 'text-slate-500'}>
                        {language === 'th' ? 'กำลังโหลด...' : 'Loading...'}
                    </p>
                </div>
            </div>
        );
    }

    // Error state
    if (error || !campaign) {
        return (
            <div className="min-h-screen flex items-center justify-center" style={{ background: theme === 'dark' ? '#0f172a' : '#f8fafc' }}>
                <div className={`text-center p-8 rounded-xl ${theme === 'dark' ? 'bg-slate-800' : 'bg-white'} shadow-lg`}>
                    <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
                        <svg className="h-8 w-8 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                        </svg>
                    </div>
                    <h2 className={`text-xl font-semibold mb-2 ${theme === 'dark' ? 'text-white' : 'text-slate-900'}`}>
                        {language === 'th' ? 'ไม่พบกิจกรรม' : 'Event Not Found'}
                    </h2>
                    <p className={`mb-6 ${theme === 'dark' ? 'text-slate-400' : 'text-slate-500'}`}>
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

    const isDark = theme === 'dark';

    return (
        <div className="min-h-screen overflow-hidden" style={{ background: isDark ? '#0f172a' : '#f8fafc', color: isDark ? '#e2e8f0' : '#1e293b' }}>

            {/* ═══ Header ═══ */}
            <header className={`${isDark ? 'bg-slate-900 border-slate-700' : 'bg-white border-slate-200'} border-b px-4 py-2 shadow-sm relative z-30`}>
                <div className="max-w-full mx-auto flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <Link href="/" className={`text-lg font-black italic ${isDark ? 'text-white' : 'text-slate-900'} border-r pr-3 ${isDark ? 'border-slate-600' : 'border-slate-300'} hover:opacity-80 transition`}>
                            ACTION <span className="text-green-600 font-bold uppercase not-italic">Live</span>
                        </Link>
                        <div>
                            <h1 className={`text-sm font-bold leading-tight ${isDark ? 'text-white' : 'text-slate-900'}`}>{displayName}</h1>
                            <p className="text-[10px] text-slate-400 font-medium">
                                {formatDate(campaign.eventDate)} | {displayLocation}
                            </p>
                        </div>
                    </div>

                    {/* Stats in header */}
                    <div className="hidden md:flex gap-4 text-[10px] font-bold uppercase tracking-wider items-center px-3 py-1.5">
                        <div className="flex items-center text-slate-500">
                            Started: <span className={`${isDark ? 'text-white' : 'text-slate-900'} ml-1`}>{stats.started}</span>
                        </div>
                        <div className="flex items-center text-green-600">
                            <span className="w-1.5 h-1.5 rounded-full bg-green-500 mr-1.5 animate-pulse"></span>
                            Racing: <span className={`${isDark ? 'text-white' : 'text-slate-900'} ml-1`}>{stats.racing}</span>
                        </div>
                        <div className="flex items-center text-blue-600">
                            <span className="w-1.5 h-1.5 rounded-full bg-blue-500 mr-1.5"></span>
                            Fin: <span className={`${isDark ? 'text-white' : 'text-slate-900'} ml-1`}>{stats.finished}</span>
                        </div>
                        <div className="flex items-center text-red-500">
                            <span className="w-1.5 h-1.5 rounded-full bg-red-500 mr-1.5"></span>
                            DNF: <span className={`${isDark ? 'text-white' : 'text-slate-900'} ml-1`}>{stats.dnf}</span>
                        </div>
                    </div>
                </div>
            </header>

            {/* ═══ Filter / Toolbar Bar ═══ */}
            <div className={`${isDark ? 'bg-slate-900 border-slate-700' : 'bg-white border-slate-200'} border-b px-4 py-2 flex flex-wrap items-center justify-between gap-3`}>
                {/* Distance / Category Filter */}
                <div className="flex items-center gap-3">
                    <span className="text-[10px] font-bold text-slate-400 uppercase whitespace-nowrap hidden sm:inline">
                        {language === 'th' ? 'ระยะ:' : 'Distance:'}
                    </span>
                    <div className="flex gap-2 flex-wrap">
                        <button
                            onClick={() => setCategoryFilter('ALL')}
                            className={`px-4 py-1.5 rounded-full border text-[11px] font-bold shadow-sm transition-all ${categoryFilter === 'ALL'
                                    ? (isDark ? 'bg-white text-slate-900 border-white' : 'bg-slate-900 text-white border-slate-900')
                                    : (isDark ? 'bg-slate-800 text-slate-400 border-slate-600 hover:bg-slate-700' : 'bg-white text-slate-500 border-slate-200 hover:bg-slate-50')
                                }`}
                        >
                            {language === 'th' ? 'ทั้งหมด' : 'ALL'}
                        </button>
                        {categories.map((cat) => (
                            <button
                                key={cat.name}
                                onClick={() => setCategoryFilter(cat.name)}
                                className={`px-4 py-1.5 rounded-full border text-[11px] font-bold shadow-sm transition-all ${categoryFilter === cat.name
                                        ? (isDark ? 'bg-white text-slate-900 border-white' : 'bg-slate-900 text-white border-slate-900')
                                        : (isDark ? 'bg-slate-800 text-slate-400 border-slate-600 hover:bg-slate-700' : 'bg-white text-slate-500 border-slate-200 hover:bg-slate-50')
                                    }`}
                            >
                                {cat.distance || cat.name}
                            </button>
                        ))}
                    </div>
                </div>

                <div className="flex items-center gap-3">
                    {/* Gender Filter */}
                    <div className={`flex ${isDark ? 'bg-slate-800' : 'bg-slate-100'} p-1 rounded-lg`}>
                        {(['ALL', 'M', 'F'] as const).map((g) => (
                            <button
                                key={g}
                                onClick={() => setGenderFilter(g)}
                                className={`px-3 py-1 text-[10px] font-bold rounded-md transition-all whitespace-nowrap ${genderFilter === g
                                        ? (isDark ? 'bg-white text-slate-900' : 'bg-slate-900 text-white')
                                        : (isDark ? 'text-slate-400' : 'text-slate-600')
                                    }`}
                            >
                                {g === 'ALL' ? (language === 'th' ? 'ทั้งหมด' : 'All') :
                                    g === 'M' ? (language === 'th' ? 'ชาย' : 'Male') :
                                        (language === 'th' ? 'หญิง' : 'Female')}
                            </button>
                        ))}
                    </div>

                    {/* Search */}
                    <div className="relative">
                        <svg className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                        </svg>
                        <input
                            type="text"
                            placeholder={language === 'th' ? 'BIB หรือ ชื่อ...' : 'BIB or Name...'}
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className={`pl-9 pr-4 py-1.5 ${isDark ? 'bg-slate-800 text-white placeholder-slate-500' : 'bg-slate-100 text-slate-800 placeholder-slate-400'} border-none rounded-lg text-xs w-48 outline-none focus:ring-2 focus:ring-green-500 transition-all`}
                        />
                    </div>

                    {/* Column Toggle */}
                    <div className="relative group">
                        <button className={`${isDark ? 'bg-slate-800 border-slate-600 text-slate-300 hover:bg-slate-700' : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'} border px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-2`}>
                            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                            </svg>
                            {language === 'th' ? 'คอลัมน์' : 'Columns'}
                        </button>
                        <div className={`hidden group-hover:block absolute right-0 top-full mt-1 ${isDark ? 'bg-slate-800 border-slate-600' : 'bg-white border-slate-200'} min-w-[160px] shadow-lg border rounded-lg z-30 p-2`}>
                            <p className="text-[10px] font-bold text-slate-400 uppercase mb-2 px-2">
                                {language === 'th' ? 'ตั้งค่าการแสดงผล' : 'Display Settings'}
                            </p>
                            <label className={`flex items-center gap-2 px-2 py-1 cursor-pointer ${isDark ? 'hover:bg-slate-700' : 'hover:bg-slate-50'} rounded`}>
                                <input type="checkbox" checked={showGenRank} onChange={(e) => setShowGenRank(e.target.checked)} />
                                <span className={`text-xs ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>Gender Rank</span>
                            </label>
                            <label className={`flex items-center gap-2 px-2 py-1 cursor-pointer ${isDark ? 'hover:bg-slate-700' : 'hover:bg-slate-50'} rounded`}>
                                <input type="checkbox" checked={showCatRank} onChange={(e) => setShowCatRank(e.target.checked)} />
                                <span className={`text-xs ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>Category Rank</span>
                            </label>
                        </div>
                    </div>
                </div>
            </div>

            {/* ═══ Mobile Stats Bar ═══ */}
            <div className="md:hidden bg-slate-900 text-slate-400 px-4 py-2">
                <div className="flex gap-4 text-[10px] font-bold uppercase tracking-wider overflow-x-auto whitespace-nowrap">
                    <div className="flex items-center">
                        <span className="text-slate-500 mr-1">Started:</span>
                        <span className="text-white">{stats.started}</span>
                    </div>
                    <div className="flex items-center">
                        <span className="w-1.5 h-1.5 rounded-full bg-green-500 mr-1 animate-pulse"></span>
                        Racing: <span className="text-white ml-1">{stats.racing}</span>
                    </div>
                    <div className="flex items-center">
                        <span className="w-1.5 h-1.5 rounded-full bg-blue-500 mr-1"></span>
                        Fin: <span className="text-white ml-1">{stats.finished}</span>
                    </div>
                    <div className="flex items-center">
                        <span className="w-1.5 h-1.5 rounded-full bg-red-500 mr-1"></span>
                        DNF: <span className="text-white ml-1">{stats.dnf}</span>
                    </div>
                </div>
            </div>

            {/* ═══ Results Table ═══ */}
            <main className="p-0 sm:p-4" style={{ paddingBottom: '48px' }}>
                <div
                    className={`${isDark ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-200'} rounded-none sm:rounded-xl shadow-sm border overflow-hidden`}
                    style={{ height: 'calc(100vh - 160px)', overflowY: 'auto' }}
                >
                    {/* Mobile card view */}
                    <div className="sm:hidden divide-y divide-slate-100">
                        {filteredRunners.length === 0 ? (
                            <div className={`py-12 text-center ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>
                                <svg className="h-12 w-12 mx-auto mb-3 opacity-30" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.172 16.172a4 4 0 015.656 0M21 12a9 9 0 11-18 0 9 9 0 0118 0zM9 10a1 1 0 11-2 0 1 1 0 012 0zm8 0a1 1 0 11-2 0 1 1 0 012 0z" />
                                </svg>
                                {language === 'th' ? 'ยังไม่มีข้อมูลนักวิ่ง' : 'No runners data yet'}
                            </div>
                        ) : (
                            filteredRunners.map((runner, index) => {
                                const colors = getStatusColor(runner.status);
                                const rank = runner.overallRank || index + 1;
                                return (
                                    <div key={runner._id} className={`px-4 py-3 ${isDark ? 'hover:bg-slate-700/50' : 'hover:bg-green-50'} transition-colors`}>
                                        <div className="flex items-center gap-3">
                                            <span className={`text-lg font-black w-8 text-center ${rank <= 3 ? (rank === 1 ? 'text-green-600' : 'text-slate-500') : 'text-slate-300'}`}>
                                                {rank}
                                            </span>
                                            <div className="relative">
                                                <div className={`w-10 h-10 rounded-full ${isDark ? 'bg-gradient-to-br from-slate-600 to-slate-700' : 'bg-gradient-to-br from-slate-200 to-slate-300'} flex items-center justify-center text-xs font-bold ${isDark ? 'text-slate-200' : 'text-slate-600'}`}>
                                                    {runner.firstName?.charAt(0)}{runner.lastName?.charAt(0)}
                                                </div>
                                                {runner.status === 'in_progress' && (
                                                    <span className="w-2.5 h-2.5 rounded-full bg-green-500 absolute -bottom-0.5 -right-0.5 animate-pulse border-2 border-white"></span>
                                                )}
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-center gap-2">
                                                    <span className={`font-bold text-sm ${isDark ? 'text-white' : 'text-slate-800'} uppercase truncate`}>
                                                        {runner.firstName} {runner.lastName}
                                                    </span>
                                                    <span className="bg-slate-800 text-white px-1.5 py-0.5 rounded text-[9px] font-extrabold tracking-wide border border-slate-600 shrink-0">
                                                        #{runner.bib}
                                                    </span>
                                                </div>
                                                <div className="flex items-center gap-2 text-[10px] text-slate-400 font-medium mt-0.5">
                                                    <span className={`font-bold px-1.5 py-0.5 rounded ${runner.gender === 'M' ? 'text-blue-500 bg-blue-50' : 'text-pink-500 bg-pink-50'}`}>
                                                        {runner.gender}
                                                    </span>
                                                    <span>{runner.nationality || '🏃'}</span>
                                                    <span>{runner.category || 'Open'}</span>
                                                </div>
                                            </div>
                                            <div className="text-right shrink-0">
                                                <span className={`block font-bold text-[11px] ${colors.text}`}>{getStatusLabel(runner.status)}</span>
                                                <span className={`block text-sm font-bold ${isDark ? 'text-white' : 'text-slate-900'} mt-0.5`}>
                                                    {formatTime(runner.netTime)}
                                                </span>
                                            </div>
                                        </div>
                                    </div>
                                );
                            })
                        )}
                    </div>

                    {/* Desktop table view */}
                    <table className="w-full text-left border-collapse hidden sm:table">
                        <thead>
                            <tr className={`text-[10px] font-bold text-slate-400 uppercase tracking-tighter sticky top-0 ${isDark ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-100'} z-20 border-b-2`}>
                                <th className="py-3 px-4 text-center w-12">Rank</th>
                                {showGenRank && <th className="py-3 px-2 text-center w-12">Gen</th>}
                                {showCatRank && <th className="py-3 px-2 text-center w-12">Cat</th>}
                                <th className="py-3 px-2">Runner</th>
                                <th className="py-3 px-2 text-center">Gender</th>
                                <th className="py-3 px-2">Status / Last CP</th>
                                <th className="py-3 px-2">Time</th>
                                <th className="py-3 px-2 hidden lg:table-cell">Category</th>
                                <th className="py-3 px-4 text-right">BIB</th>
                            </tr>
                        </thead>
                        <tbody className={`divide-y ${isDark ? 'divide-slate-700' : 'divide-slate-50'}`}>
                            {filteredRunners.length === 0 ? (
                                <tr>
                                    <td colSpan={9} className={`py-12 text-center ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>
                                        <svg className="h-12 w-12 mx-auto mb-3 opacity-30" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.172 16.172a4 4 0 015.656 0M21 12a9 9 0 11-18 0 9 9 0 0118 0zM9 10a1 1 0 11-2 0 1 1 0 012 0zm8 0a1 1 0 11-2 0 1 1 0 012 0z" />
                                        </svg>
                                        <p className="text-sm font-medium">{language === 'th' ? 'ยังไม่มีข้อมูลนักวิ่ง' : 'No runners data yet'}</p>
                                        <p className="text-xs mt-1">{language === 'th' ? 'ลองปรับตัวกรองหรือคำค้นหา' : 'Try adjusting your filters or search term'}</p>
                                    </td>
                                </tr>
                            ) : (
                                filteredRunners.map((runner, index) => {
                                    const colors = getStatusColor(runner.status);
                                    const rank = runner.overallRank || index + 1;

                                    return (
                                        <tr
                                            key={runner._id}
                                            className={`${isDark ? 'hover:bg-slate-700/50' : 'hover:bg-slate-50'} transition-colors cursor-pointer group border-l-4 border-transparent hover:border-green-500`}
                                        >
                                            {/* Rank */}
                                            <td className="py-3 px-4 text-center">
                                                <span className={`text-base font-black ${rank <= 3 ? (rank === 1 ? 'text-green-600' : (isDark ? 'text-slate-300' : 'text-slate-600')) : (isDark ? 'text-slate-500' : 'text-slate-300')}`}>
                                                    {rank}
                                                </span>
                                            </td>
                                            {/* Gender Rank */}
                                            {showGenRank && (
                                                <td className="py-3 px-2 text-center">
                                                    <span className="text-xs font-bold text-slate-500">{runner.genderRank || '-'}</span>
                                                </td>
                                            )}
                                            {/* Category Rank */}
                                            {showCatRank && (
                                                <td className="py-3 px-2 text-center">
                                                    <span className="text-xs font-bold text-slate-500">{runner.categoryRank || '-'}</span>
                                                </td>
                                            )}
                                            {/* Runner */}
                                            <td className="py-3 px-2">
                                                <div className="flex items-center gap-3">
                                                    <div className="relative">
                                                        <div className={`w-8 h-8 rounded-full ${isDark ? 'bg-gradient-to-br from-slate-600 to-slate-700 text-slate-200' : 'bg-gradient-to-br from-slate-200 to-slate-300 text-slate-600'} flex items-center justify-center text-xs font-bold`}>
                                                            {runner.firstName?.charAt(0)}{runner.lastName?.charAt(0)}
                                                        </div>
                                                        {runner.status === 'in_progress' && (
                                                            <span className="w-2 h-2 rounded-full bg-green-500 absolute -bottom-0.5 -right-0.5 animate-pulse border border-white"></span>
                                                        )}
                                                    </div>
                                                    <div>
                                                        <span className={`block font-bold text-sm ${isDark ? 'text-white' : 'text-slate-800'} leading-none uppercase mb-1`}>
                                                            {runner.firstName} {runner.lastName}
                                                        </span>
                                                        <span className="text-[10px] text-slate-400 font-medium flex items-center gap-1.5">
                                                            {runner.nationality || '🏃'} | {runner.category || 'Open'}
                                                        </span>
                                                    </div>
                                                </div>
                                            </td>
                                            {/* Gender */}
                                            <td className="py-3 px-2 text-center">
                                                <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${runner.gender === 'M' ? (isDark ? 'text-blue-400 bg-blue-900/30' : 'text-blue-500 bg-blue-50') : (isDark ? 'text-pink-400 bg-pink-900/30' : 'text-pink-500 bg-pink-50')}`}>
                                                    {runner.gender}
                                                </span>
                                            </td>
                                            {/* Status / Last CP */}
                                            <td className="py-3 px-2">
                                                <span className={`block font-bold text-[11px] ${colors.text} leading-none mb-1`}>
                                                    {getStatusLabel(runner.status)}
                                                </span>
                                                <span className="text-[10px] text-slate-400 uppercase font-medium">
                                                    {runner.latestCheckpoint || '-'}
                                                </span>
                                            </td>
                                            {/* Time */}
                                            <td className="py-3 px-2">
                                                <span className={`text-sm font-bold ${isDark ? 'text-white' : 'text-slate-900'}`}>
                                                    {formatTime(runner.netTime)}
                                                </span>
                                            </td>
                                            {/* Category */}
                                            <td className="py-3 px-2 hidden lg:table-cell">
                                                <span className={`text-[11px] font-bold px-2 py-0.5 rounded ${isDark ? 'bg-slate-700 text-slate-300' : 'bg-slate-100 text-slate-600'}`}>
                                                    {runner.category || 'Open'}
                                                </span>
                                            </td>
                                            {/* BIB */}
                                            <td className="py-3 px-4 text-right">
                                                <span className="bg-slate-800 text-slate-100 px-2 py-0.5 rounded text-[10px] font-extrabold tracking-wide border border-slate-600 shadow-sm">
                                                    #{runner.bib}
                                                </span>
                                            </td>
                                        </tr>
                                    );
                                })
                            )}
                        </tbody>
                    </table>
                </div>
            </main>

            {/* ═══ Footer ═══ */}
            <footer className={`${isDark ? 'bg-slate-900 border-slate-700' : 'bg-white border-slate-200'} border-t px-4 py-2 fixed bottom-0 w-full flex justify-between items-center z-30`}>
                <p className="text-[9px] font-bold text-slate-300 uppercase tracking-widest">ACTION TIMING © 2026</p>
                <div className="flex gap-4">
                    <span className="text-[9px] text-green-500 font-bold uppercase animate-pulse">
                        <span className="inline-block w-1.5 h-1.5 rounded-full bg-green-500 mr-1"></span>
                        Connected
                    </span>
                </div>
            </footer>

            {/* Custom scrollbar styles */}
            <style jsx>{`
                div::-webkit-scrollbar { width: 4px; }
                div::-webkit-scrollbar-track { background: transparent; }
                div::-webkit-scrollbar-thumb { background: ${isDark ? '#334155' : '#cbd5e1'}; border-radius: 4px; }
                div::-webkit-scrollbar-thumb:hover { background: ${isDark ? '#475569' : '#94a3b8'}; }
            `}</style>
        </div>
    );
}
