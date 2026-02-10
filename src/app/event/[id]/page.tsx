'use client';

import { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useParams } from 'next/navigation';
import { useTheme } from '@/lib/theme-context';
import { useLanguage } from '@/lib/language-context';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

interface Campaign {
    _id: string;
    uuid: string;
    name: string;
    shortName?: string;
    description?: string;
    eventDate: string;
    eventEndDate?: string;
    location: string;
    pictureUrl?: string;
    status: string;
    categories: RaceCategory[];
}

interface RaceCategory {
    name: string;
    distance: string;
    startTime: string;
    cutoff: string;
    elevation?: string;
    raceType?: string;
    badgeColor: string;
    status: string;
}

interface Runner {
    _id: string;
    bib: string;
    firstName: string;
    lastName: string;
    firstNameTh?: string;
    lastNameTh?: string;
    gender: string;
    category: string;
    ageGroup: string;
    age?: number;
    status: string;
    netTime?: number;
    elapsedTime?: number;
    overallRank?: number;
    genderRank?: number;
    ageGroupRank?: number;
    categoryRank?: number;
    nationality?: string;
    team?: string;
    teamName?: string;
    latestCheckpoint?: string;
}

interface TimingRecord {
    _id: string;
    runnerId: string;
    checkpoint: string;
    scanTime: string;
    splitTime?: number;
    elapsedTime?: number;
}

export default function EventDashboardPage() {
    const { theme, toggleTheme } = useTheme();
    const { language } = useLanguage();
    const params = useParams();
    const eventId = params.id as string;

    const [campaign, setCampaign] = useState<Campaign | null>(null);
    const [runners, setRunners] = useState<Runner[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const [searchQuery, setSearchQuery] = useState('');
    const [filterGender, setFilterGender] = useState('ALL');
    const [filterCategory, setFilterCategory] = useState('ALL');
    const [selectedRunner, setSelectedRunner] = useState<Runner | null>(null);
    const [runnerTimings, setRunnerTimings] = useState<TimingRecord[]>([]);

    // Column visibility
    const [showGenRank, setShowGenRank] = useState(true);
    const [showCatRank, setShowCatRank] = useState(true);

    const [currentTime, setCurrentTime] = useState(new Date());

    useEffect(() => {
        const timer = setInterval(() => setCurrentTime(new Date()), 1000);
        return () => clearInterval(timer);
    }, []);

    useEffect(() => {
        if (eventId) fetchEventData();
    }, [eventId]);

    async function fetchEventData() {
        try {
            setLoading(true);
            setError(null);

            const [campaignRes, runnersRes] = await Promise.all([
                fetch(`${API_URL}/campaigns/${eventId}`),
                fetch(`${API_URL}/runners?campaignId=${eventId}`)
            ]);

            if (!campaignRes.ok) throw new Error(language === 'th' ? 'ไม่พบข้อมูลกิจกรรม' : 'Event not found');

            const campaignData = await campaignRes.json();
            setCampaign(campaignData);

            if (runnersRes.ok) {
                const runnersData = await runnersRes.json();
                setRunners(runnersData || []);
            }
        } catch (err: unknown) {
            const errorMessage = err instanceof Error ? err.message : 'Error loading event';
            setError(errorMessage);
        } finally {
            setLoading(false);
        }
    }

    async function fetchRunnerTimings(runnerId: string) {
        try {
            const res = await fetch(`${API_URL}/timing/runner/${eventId}/${runnerId}`);
            if (res.ok) {
                const data = await res.json();
                setRunnerTimings(data || []);
            }
        } catch {
            setRunnerTimings([]);
        }
    }

    function formatTime(ms: number | undefined): string {
        if (!ms) return '-';
        const hours = Math.floor(ms / 3600000);
        const minutes = Math.floor((ms % 3600000) / 60000);
        const seconds = Math.floor((ms % 60000) / 1000);
        return `${hours}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    }

    function formatDate(dateString: string) {
        const date = new Date(dateString);
        return date.toLocaleDateString(language === 'th' ? 'th-TH' : 'en-US', {
            day: '2-digit',
            month: 'long',
            year: 'numeric'
        });
    }

    function getStatusColor(status: string) {
        switch (status) {
            case 'finished': return { text: 'var(--success)', bg: 'var(--success)' };
            case 'in_progress': return { text: 'var(--warning)', bg: 'var(--warning)' };
            case 'dnf': return { text: 'var(--error)', bg: 'var(--error)' };
            case 'dns': return { text: 'var(--error)', bg: 'var(--error)' };
            default: return { text: 'var(--muted-foreground)', bg: 'var(--muted-foreground)' };
        }
    }

    function getStatusLabel(status: string) {
        switch (status) {
            case 'finished': return 'FINISH';
            case 'in_progress': return 'RACING';
            case 'dnf': return 'DNF';
            case 'dns': return 'DNS';
            case 'not_started': return language === 'th' ? 'ยังไม่เริ่ม' : 'NOT STARTED';
            default: return status?.toUpperCase() || '-';
        }
    }

    const filteredRunners = useMemo(() => {
        return runners
            .filter(runner => {
                const matchesSearch = searchQuery === '' ||
                    runner.firstName.toLowerCase().includes(searchQuery.toLowerCase()) ||
                    runner.lastName.toLowerCase().includes(searchQuery.toLowerCase()) ||
                    runner.bib.includes(searchQuery);
                const matchesGender = filterGender === 'ALL' || runner.gender === filterGender;
                const matchesCategory = filterCategory === 'ALL' || runner.category === filterCategory;
                return matchesSearch && matchesGender && matchesCategory;
            })
            .sort((a, b) => {
                // Sort by rank (finished first, then in_progress, then others)
                const statusOrder: Record<string, number> = { 'finished': 0, 'in_progress': 1, 'not_started': 2, 'dns': 3, 'dnf': 4 };
                const statusDiff = (statusOrder[a.status] ?? 5) - (statusOrder[b.status] ?? 5);
                if (statusDiff !== 0) return statusDiff;
                if (a.overallRank && b.overallRank) return a.overallRank - b.overallRank;
                return 0;
            });
    }, [runners, searchQuery, filterGender, filterCategory]);

    const stats = useMemo(() => ({
        total: runners.length,
        finished: runners.filter(r => r.status === 'finished').length,
        racing: runners.filter(r => r.status === 'in_progress').length,
        dnf: runners.filter(r => r.status === 'dnf' || r.status === 'dns').length,
    }), [runners]);

    const categories = useMemo(() => {
        const cats = new Set(runners.map(r => r.category));
        return Array.from(cats);
    }, [runners]);

    const handleViewRunner = (runner: Runner) => {
        setSelectedRunner(runner);
        fetchRunnerTimings(runner._id);
    };

    // Theme-based styles
    const isDark = theme === 'dark';

    if (loading) {
        return (
            <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--background)' }}>
                <div className="text-center">
                    <div className="w-16 h-16 glass rounded-2xl flex items-center justify-center mx-auto mb-4">
                        <div className="w-8 h-8 border-3 rounded-full animate-spin" style={{ borderColor: 'var(--border)', borderTopColor: 'var(--accent)' }}></div>
                    </div>
                    <p style={{ color: 'var(--muted-foreground)' }}>
                        {language === 'th' ? 'กำลังโหลดข้อมูล...' : 'Loading...'}
                    </p>
                </div>
            </div>
        );
    }

    if (error || !campaign) {
        return (
            <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--background)' }}>
                <div className="glass p-8 rounded-2xl max-w-md text-center">
                    <div className="text-4xl mb-4">😔</div>
                    <h2 className="text-xl font-semibold mb-2" style={{ color: 'var(--foreground)' }}>
                        {language === 'th' ? 'ไม่พบข้อมูล' : 'Not Found'}
                    </h2>
                    <p className="mb-4" style={{ color: 'var(--muted-foreground)' }}>{error}</p>
                    <Link href="/" className="inline-block py-2 px-4 rounded-xl" style={{ background: 'var(--accent)', color: 'var(--accent-foreground)' }}>
                        {language === 'th' ? 'กลับหน้าแรก' : 'Back to Home'}
                    </Link>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen overflow-hidden" style={{ background: isDark ? '#0f172a' : '#f8fafc', color: isDark ? '#f8fafc' : '#1e293b' }}>
            {/* Header */}
            <header className="px-4 py-2 shadow-sm relative z-30" style={{
                background: isDark ? 'rgba(15,23,42,0.95)' : 'rgba(255,255,255,0.95)',
                borderBottom: `1px solid ${isDark ? 'rgba(255,255,255,0.08)' : '#e2e8f0'}`,
                backdropFilter: 'blur(12px)'
            }}>
                <div className="max-w-full mx-auto flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <Link href="/" className="flex items-center">
                            <Image
                                src={isDark ? '/logo-white.png' : '/logo-black.png'}
                                alt="RACETIME"
                                width={100}
                                height={32}
                                className="h-8 w-auto"
                            />
                        </Link>
                        <div className="border-l pl-3" style={{ borderColor: isDark ? 'rgba(255,255,255,0.1)' : '#e2e8f0' }}>
                            <span className="text-lg font-black italic" style={{ color: isDark ? '#f8fafc' : '#0f172a' }}>
                                RACETIME <span className="font-bold uppercase not-italic" style={{ color: 'var(--success)' }}>Live</span>
                            </span>
                        </div>
                        <div className="hidden sm:block">
                            <h1 className="text-sm font-bold leading-tight" style={{ color: isDark ? '#f8fafc' : '#0f172a' }}>{campaign.name}</h1>
                            <p className="text-[10px] font-medium" style={{ color: isDark ? '#94a3b8' : '#94a3b8' }}>
                                {formatDate(campaign.eventDate)} | {campaign.location}
                            </p>
                        </div>
                    </div>

                    <div className="flex gap-4 text-[10px] font-bold uppercase tracking-wider items-center px-3 py-1.5">
                        <div className="flex items-center" style={{ color: isDark ? '#94a3b8' : '#64748b' }}>
                            Started: <span className="ml-1" style={{ color: isDark ? '#f8fafc' : '#0f172a' }}>{stats.total}</span>
                        </div>
                        <div className="hidden sm:flex items-center" style={{ color: 'var(--success)' }}>
                            <span className="w-1.5 h-1.5 rounded-full mr-1.5" style={{ background: 'var(--success)' }}></span>
                            Racing: <span className="ml-1" style={{ color: isDark ? '#f8fafc' : '#0f172a' }}>{stats.racing}</span>
                        </div>
                        <div className="hidden sm:flex items-center" style={{ color: 'var(--primary)' }}>
                            <span className="w-1.5 h-1.5 rounded-full mr-1.5" style={{ background: 'var(--primary)' }}></span>
                            Fin: <span className="ml-1" style={{ color: isDark ? '#f8fafc' : '#0f172a' }}>{stats.finished}</span>
                        </div>
                        <div className="hidden sm:flex items-center" style={{ color: 'var(--error)' }}>
                            <span className="w-1.5 h-1.5 rounded-full mr-1.5" style={{ background: 'var(--error)' }}></span>
                            DNF: <span className="ml-1" style={{ color: isDark ? '#f8fafc' : '#0f172a' }}>{stats.dnf}</span>
                        </div>
                        <button onClick={toggleTheme} className="p-1.5 rounded-lg" style={{ background: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)' }}>
                            <span className="text-sm">{isDark ? '☀️' : '🌙'}</span>
                        </button>
                    </div>
                </div>
            </header>

            {/* Filter Bar */}
            <div className="px-4 py-2 flex flex-wrap items-center justify-between gap-3" style={{
                background: isDark ? 'rgba(15,23,42,0.9)' : 'rgba(255,255,255,0.9)',
                borderBottom: `1px solid ${isDark ? 'rgba(255,255,255,0.06)' : '#e2e8f0'}`
            }}>
                <div className="flex items-center gap-3">
                    <span className="text-[10px] font-bold uppercase whitespace-nowrap" style={{ color: isDark ? '#64748b' : '#94a3b8' }}>
                        {language === 'th' ? 'ประเภท:' : 'Distance:'}
                    </span>
                    <div className="flex gap-1.5 flex-wrap">
                        <button
                            onClick={() => setFilterCategory('ALL')}
                            className="px-3 py-1 rounded-full text-[11px] font-bold transition-all"
                            style={{
                                background: filterCategory === 'ALL' ? (isDark ? '#f8fafc' : '#1e293b') : 'transparent',
                                color: filterCategory === 'ALL' ? (isDark ? '#0f172a' : '#fff') : (isDark ? '#94a3b8' : '#64748b'),
                                border: `1px solid ${filterCategory === 'ALL' ? (isDark ? '#f8fafc' : '#1e293b') : (isDark ? 'rgba(255,255,255,0.1)' : '#e2e8f0')}`
                            }}
                        >
                            {language === 'th' ? 'ทั้งหมด' : 'ALL'}
                        </button>
                        {categories.map(cat => (
                            <button
                                key={cat}
                                onClick={() => setFilterCategory(cat)}
                                className="px-3 py-1 rounded-full text-[11px] font-bold transition-all"
                                style={{
                                    background: filterCategory === cat ? (isDark ? '#f8fafc' : '#1e293b') : 'transparent',
                                    color: filterCategory === cat ? (isDark ? '#0f172a' : '#fff') : (isDark ? '#94a3b8' : '#64748b'),
                                    border: `1px solid ${filterCategory === cat ? (isDark ? '#f8fafc' : '#1e293b') : (isDark ? 'rgba(255,255,255,0.1)' : '#e2e8f0')}`
                                }}
                            >
                                {cat}
                            </button>
                        ))}
                    </div>
                </div>

                <div className="flex items-center gap-3">
                    {/* Gender Filter */}
                    <div className="flex p-0.5 rounded-lg" style={{ background: isDark ? 'rgba(255,255,255,0.05)' : '#f1f5f9' }}>
                        {(['ALL', 'M', 'F'] as const).map(g => (
                            <button
                                key={g}
                                onClick={() => setFilterGender(g)}
                                className="px-3 py-1 text-[10px] font-bold rounded-md transition-all whitespace-nowrap"
                                style={{
                                    background: filterGender === g ? (isDark ? '#f8fafc' : '#1e293b') : 'transparent',
                                    color: filterGender === g ? (isDark ? '#0f172a' : '#fff') : (isDark ? '#94a3b8' : '#64748b')
                                }}
                            >
                                {g === 'ALL' ? (language === 'th' ? 'ทั้งหมด' : 'All') : g === 'M' ? (language === 'th' ? 'ชาย' : 'Male') : (language === 'th' ? 'หญิง' : 'Female')}
                            </button>
                        ))}
                    </div>

                    {/* Search */}
                    <div className="relative hidden sm:block">
                        <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" style={{ color: isDark ? '#64748b' : '#94a3b8' }}>
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                        </svg>
                        <input
                            type="text"
                            placeholder={language === 'th' ? 'BIB หรือ ชื่อ...' : 'BIB or Name...'}
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="pl-8 pr-4 py-1.5 rounded-lg text-xs w-44 outline-none transition-all"
                            style={{
                                background: isDark ? 'rgba(255,255,255,0.05)' : '#f1f5f9',
                                color: isDark ? '#f8fafc' : '#0f172a',
                                border: 'none'
                            }}
                        />
                    </div>

                    {/* Column Toggle */}
                    <div className="hidden md:flex items-center gap-2">
                        <label className="flex items-center gap-1 cursor-pointer text-[10px]" style={{ color: isDark ? '#94a3b8' : '#64748b' }}>
                            <input type="checkbox" checked={showGenRank} onChange={(e) => setShowGenRank(e.target.checked)} className="w-3 h-3" />
                            Gen
                        </label>
                        <label className="flex items-center gap-1 cursor-pointer text-[10px]" style={{ color: isDark ? '#94a3b8' : '#64748b' }}>
                            <input type="checkbox" checked={showCatRank} onChange={(e) => setShowCatRank(e.target.checked)} className="w-3 h-3" />
                            Cat
                        </label>
                    </div>
                </div>
            </div>

            {/* Results Table */}
            <main className="p-0 sm:p-3">
                <div className="sm:rounded-xl shadow-sm overflow-auto" style={{
                    background: isDark ? 'rgba(15,23,42,0.8)' : '#fff',
                    border: `1px solid ${isDark ? 'rgba(255,255,255,0.06)' : '#e2e8f0'}`,
                    height: 'calc(100vh - 150px)'
                }}>
                    <table className="w-full text-left border-collapse">
                        <thead>
                            <tr className="text-[10px] font-bold uppercase tracking-tighter sticky top-0 z-20" style={{
                                background: isDark ? '#0f172a' : '#fff',
                                color: isDark ? '#64748b' : '#94a3b8',
                                borderBottom: `2px solid ${isDark ? 'rgba(255,255,255,0.06)' : '#f1f5f9'}`
                            }}>
                                <th className="py-3 px-4 text-center w-12">Rank</th>
                                {showGenRank && <th className="py-3 px-2 text-center w-12">Gen</th>}
                                {showCatRank && <th className="py-3 px-2 text-center w-12">Cat</th>}
                                <th className="py-3 px-2">{language === 'th' ? 'นักวิ่ง' : 'Runner'}</th>
                                <th className="py-3 px-2 text-center">{language === 'th' ? 'เพศ' : 'Gender'}</th>
                                <th className="py-3 px-2">{language === 'th' ? 'สถานะ' : 'Status'}</th>
                                <th className="py-3 px-2">{language === 'th' ? 'จุดล่าสุด' : 'Last CP'}</th>
                                <th className="py-3 px-2">{language === 'th' ? 'เวลา' : 'Time'}</th>
                                <th className="py-3 px-4 text-center">{language === 'th' ? 'ดู' : 'View'}</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filteredRunners.length === 0 ? (
                                <tr>
                                    <td colSpan={showGenRank && showCatRank ? 9 : showGenRank || showCatRank ? 8 : 7} className="px-4 py-12 text-center" style={{ color: 'var(--muted-foreground)' }}>
                                        {language === 'th' ? 'ไม่พบข้อมูลผู้เข้าแข่งขัน' : 'No participants found'}
                                    </td>
                                </tr>
                            ) : (
                                filteredRunners.map((runner, idx) => {
                                    const statusColors = getStatusColor(runner.status);
                                    const displayName = language === 'th' && runner.firstNameTh
                                        ? `${runner.firstNameTh} ${runner.lastNameTh || ''}`
                                        : `${runner.firstName} ${runner.lastName}`;
                                    const rank = runner.overallRank || idx + 1;

                                    return (
                                        <tr
                                            key={runner._id}
                                            className="cursor-pointer transition-colors"
                                            onClick={() => handleViewRunner(runner)}
                                            style={{
                                                borderBottom: `1px solid ${isDark ? 'rgba(255,255,255,0.03)' : '#f8fafc'}`,
                                                borderLeft: '4px solid transparent'
                                            }}
                                            onMouseEnter={(e) => {
                                                e.currentTarget.style.background = isDark ? 'rgba(34,197,94,0.05)' : '#f0fdf4';
                                                e.currentTarget.style.borderLeftColor = 'var(--success)';
                                            }}
                                            onMouseLeave={(e) => {
                                                e.currentTarget.style.background = 'transparent';
                                                e.currentTarget.style.borderLeftColor = 'transparent';
                                            }}
                                        >
                                            <td className="py-3 px-4 text-center">
                                                <span className="text-base font-black" style={{
                                                    color: rank <= 3 ? (rank === 1 ? 'var(--success)' : (isDark ? '#f8fafc' : '#334155')) : (isDark ? '#475569' : '#cbd5e1')
                                                }}>
                                                    {rank}
                                                </span>
                                            </td>
                                            {showGenRank && (
                                                <td className="py-3 px-2 text-center">
                                                    <span className="text-xs font-bold" style={{ color: isDark ? '#94a3b8' : '#64748b' }}>
                                                        {runner.genderRank || '-'}
                                                    </span>
                                                </td>
                                            )}
                                            {showCatRank && (
                                                <td className="py-3 px-2 text-center">
                                                    <span className="text-xs font-bold" style={{ color: isDark ? '#94a3b8' : '#64748b' }}>
                                                        {runner.categoryRank || '-'}
                                                    </span>
                                                </td>
                                            )}
                                            <td className="py-3 px-2">
                                                <div className="flex items-center gap-3">
                                                    <div className="relative">
                                                        <div className="w-8 h-8 rounded-full flex items-center justify-center text-white font-bold text-sm"
                                                            style={{ background: 'linear-gradient(135deg, #3b82f6, #8b5cf6)' }}>
                                                            {runner.firstName?.[0] || '?'}
                                                        </div>
                                                        {runner.status === 'in_progress' && (
                                                            <span className="absolute -bottom-0.5 -right-0.5 w-2 h-2 rounded-full animate-pulse" style={{ background: 'var(--success)', border: '1.5px solid white' }}></span>
                                                        )}
                                                    </div>
                                                    <div>
                                                        <span className="block font-bold text-sm leading-none uppercase mb-1" style={{ color: isDark ? '#f8fafc' : '#1e293b' }}>
                                                            {displayName}
                                                        </span>
                                                        <span className="text-[10px] font-medium flex items-center gap-1.5" style={{ color: isDark ? '#64748b' : '#94a3b8' }}>
                                                            <span className="px-1.5 py-0.5 rounded text-[10px] font-black tracking-wider"
                                                                style={{
                                                                    background: isDark ? '#1e293b' : '#0f172a',
                                                                    color: '#f8fafc',
                                                                    border: `1px solid ${isDark ? '#334155' : '#334155'}`
                                                                }}>
                                                                #{runner.bib}
                                                            </span>
                                                            {runner.nationality || ''} | {runner.category}
                                                        </span>
                                                    </div>
                                                </div>
                                            </td>
                                            <td className="py-3 px-2 text-center text-[10px] font-bold" style={{
                                                color: runner.gender === 'M' ? '#3b82f6' : '#ec4899'
                                            }}>
                                                {runner.gender}
                                            </td>
                                            <td className="py-3 px-2">
                                                <span className="block font-bold text-[11px] leading-none mb-1" style={{ color: statusColors.text }}>
                                                    {getStatusLabel(runner.status)}
                                                </span>
                                                <span className="text-[10px] uppercase font-medium" style={{ color: isDark ? '#64748b' : '#94a3b8' }}>
                                                    {runner.latestCheckpoint || '-'}
                                                </span>
                                            </td>
                                            <td className="py-3 px-2">
                                                <span className="text-[10px] uppercase font-medium" style={{ color: isDark ? '#64748b' : '#94a3b8' }}>
                                                    {runner.latestCheckpoint || '-'}
                                                </span>
                                            </td>
                                            <td className="py-3 px-2">
                                                <span className="text-sm font-bold" style={{ color: isDark ? '#f8fafc' : '#0f172a' }}>
                                                    {formatTime(runner.elapsedTime || runner.netTime)}
                                                </span>
                                            </td>
                                            <td className="py-3 px-4 text-center">
                                                <button
                                                    className="px-2 py-1 rounded-lg text-xs font-bold"
                                                    style={{ background: 'var(--accent)', color: 'var(--accent-foreground)' }}
                                                    onClick={(e) => { e.stopPropagation(); handleViewRunner(runner); }}
                                                >
                                                    {language === 'th' ? 'ดู' : 'View'}
                                                </button>
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
            <footer className="px-4 py-2 fixed bottom-0 w-full flex justify-between items-center z-30" style={{
                background: isDark ? 'rgba(15,23,42,0.95)' : 'rgba(255,255,255,0.95)',
                borderTop: `1px solid ${isDark ? 'rgba(255,255,255,0.06)' : '#e2e8f0'}`,
                backdropFilter: 'blur(12px)'
            }}>
                <p className="text-[9px] font-bold uppercase tracking-widest" style={{ color: isDark ? '#334155' : '#cbd5e1' }}>
                    RACETIME &copy; 2026
                </p>
                <div className="flex gap-4 items-center">
                    <span className="text-[9px] font-bold uppercase" style={{ color: isDark ? '#94a3b8' : '#64748b' }}>
                        {filteredRunners.length} / {runners.length} {language === 'th' ? 'คน' : 'runners'}
                    </span>
                    <span className="text-[9px] font-bold uppercase animate-pulse" style={{ color: 'var(--success)' }}>
                        ● Connected
                    </span>
                    <span className="text-[10px] font-mono" style={{ color: isDark ? '#64748b' : '#94a3b8' }}>
                        {currentTime.toLocaleTimeString(language === 'th' ? 'th-TH' : 'en-US')}
                    </span>
                </div>
            </footer>

            {/* Runner Details Modal */}
            {selectedRunner && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.6)' }} onClick={() => setSelectedRunner(null)}>
                    <div className="rounded-2xl p-6 max-w-lg w-full max-h-[80vh] overflow-y-auto" onClick={e => e.stopPropagation()} style={{
                        background: isDark ? '#1e293b' : '#fff',
                        border: `1px solid ${isDark ? 'rgba(255,255,255,0.1)' : '#e2e8f0'}`
                    }}>
                        <div className="flex justify-between items-start mb-4">
                            <h3 className="text-xl font-bold" style={{ color: isDark ? '#f8fafc' : '#0f172a' }}>
                                {language === 'th' ? 'รายละเอียดนักวิ่ง' : 'Runner Details'}
                            </h3>
                            <button onClick={() => setSelectedRunner(null)} className="text-2xl" style={{ color: isDark ? '#94a3b8' : '#64748b' }}>×</button>
                        </div>

                        <div className="space-y-3">
                            {[
                                { label: 'BIB', value: selectedRunner.bib },
                                { label: language === 'th' ? 'ชื่อ' : 'Name', value: `${selectedRunner.firstName} ${selectedRunner.lastName}` },
                                { label: language === 'th' ? 'ประเภท' : 'Category', value: selectedRunner.category },
                                { label: language === 'th' ? 'กลุ่มอายุ' : 'Age Group', value: selectedRunner.ageGroup },
                                { label: language === 'th' ? 'สถานะ' : 'Status', value: getStatusLabel(selectedRunner.status) },
                                { label: language === 'th' ? 'อันดับรวม' : 'Overall Rank', value: selectedRunner.overallRank || '-' },
                                { label: language === 'th' ? 'อันดับเพศ' : 'Gender Rank', value: selectedRunner.genderRank || '-' },
                                { label: language === 'th' ? 'เวลาสุทธิ' : 'Net Time', value: formatTime(selectedRunner.netTime) },
                                { label: language === 'th' ? 'ทีม' : 'Team', value: selectedRunner.team || selectedRunner.teamName || '-' },
                            ].map((item, i) => (
                                <div key={i} className="flex justify-between py-1" style={{ borderBottom: `1px solid ${isDark ? 'rgba(255,255,255,0.05)' : '#f1f5f9'}` }}>
                                    <span style={{ color: isDark ? '#94a3b8' : '#64748b' }}>{item.label}</span>
                                    <span className="font-bold" style={{ color: isDark ? '#f8fafc' : '#0f172a' }}>{item.value}</span>
                                </div>
                            ))}
                        </div>

                        {/* Timing Records */}
                        {runnerTimings.length > 0 && (
                            <div className="mt-4">
                                <h4 className="font-bold text-sm mb-2" style={{ color: isDark ? '#f8fafc' : '#0f172a' }}>
                                    {language === 'th' ? 'บันทึกเวลา' : 'Timing Records'}
                                </h4>
                                <div className="space-y-1">
                                    {runnerTimings.map((record) => (
                                        <div key={record._id} className="flex justify-between text-sm py-1" style={{ borderBottom: `1px solid ${isDark ? 'rgba(255,255,255,0.05)' : '#f1f5f9'}` }}>
                                            <span style={{ color: isDark ? '#94a3b8' : '#64748b' }}>{record.checkpoint}</span>
                                            <span className="font-mono" style={{ color: isDark ? '#f8fafc' : '#0f172a' }}>
                                                {record.elapsedTime ? formatTime(record.elapsedTime) : new Date(record.scanTime).toLocaleTimeString()}
                                            </span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
