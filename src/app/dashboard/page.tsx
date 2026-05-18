'use client';

import { useState, useEffect, Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import Image from 'next/image';
import { useTheme } from '@/lib/theme-context';
import CursorSpotlight from '@/components/CursorSpotlight';

// Wrapper component to handle useSearchParams with Suspense
function DashboardContent() {
    return <DashboardPageInner />;
}

export default function DashboardPage() {
    return (
        <Suspense fallback={
            <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--background)' }}>
                <div className="text-center">
                    <div className="w-16 h-16 glass rounded-2xl flex items-center justify-center mx-auto mb-4 float-animation">
                        <div className="w-8 h-8 border-3 rounded-full animate-spin" style={{ borderColor: 'var(--border)', borderTopColor: 'var(--accent)' }}></div>
                    </div>
                    <p style={{ color: 'var(--muted-foreground)' }}>กำลังโหลด...</p>
                </div>
            </div>
        }>
            <DashboardContent />
        </Suspense>
    );
}

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

interface Event {
    _id: string;
    uuid: string;
    name: string;
    date: string;
    category: string;
    distance: number;
    status: string;
    location: string;
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
    email?: string;
    phone?: string;
    emergencyContact?: string;
    emergencyPhone?: string;
    bloodType?: string;
    shirtSize?: string;
    startTime?: string;
    finishTime?: string;
}

interface Stats {
    campaigns: number;
    events: number;
    runners: number;
    finished: number;
}

function DashboardPageInner() {
    const { theme, toggleTheme } = useTheme();
    const searchParams = useSearchParams();
    const eventIdParam = searchParams.get('eventId');
    const [events, setEvents] = useState<Event[]>([]);
    const [runners, setRunners] = useState<Runner[]>([]);
    const [selectedEvent, setSelectedEvent] = useState<string>('');
    const [stats, setStats] = useState<Stats>({ campaigns: 0, events: 0, runners: 0, finished: 0 });
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const [searchQuery, setSearchQuery] = useState('');
    const [filterStatus, setFilterStatus] = useState('all');
    const [filterGender, setFilterGender] = useState('all');
    const [filterAgeGroup, setFilterAgeGroup] = useState('all');
    const [selectedRunner, setSelectedRunner] = useState<Runner | null>(null);

    useEffect(() => {
        fetchData();
    }, []);

    useEffect(() => {
        if (selectedEvent) {
            fetchRunners(selectedEvent);
        }
    }, [selectedEvent]);

    async function fetchData() {
        try {
            setLoading(true);
            setError(null);

            const [campaignsRes, eventsRes] = await Promise.all([
                fetch(`${API_URL}/campaigns`),
                fetch(`${API_URL}/events`),
            ]);

            if (!campaignsRes.ok || !eventsRes.ok) {
                throw new Error('Failed to fetch data from backend');
            }

            const campaignsData = await campaignsRes.json();
            const eventsData = await eventsRes.json();

            const campaignsList = campaignsData.data || campaignsData || [];
            const eventsList = eventsData || [];

            setEvents(eventsList);

            if (eventsList.length > 0) {
                // Check if eventIdParam is valid
                const targetEvent = eventsList.find((e: any) => e._id === eventIdParam);
                setSelectedEvent(targetEvent ? targetEvent._id : eventsList[0]._id);
            }

            setStats(prev => ({
                ...prev,
                campaigns: campaignsList.length,
                events: eventsList.length,
            }));

        } catch (err: unknown) {
            const errorMessage = err instanceof Error ? err.message : 'Error connecting to backend';
            setError(errorMessage);
        } finally {
            setLoading(false);
        }
    }

    async function fetchRunners(eventId: string) {
        try {
            const res = await fetch(`${API_URL}/runners?eventId=${eventId}`);
            if (!res.ok) throw new Error('Failed to fetch runners');

            const data = await res.json();
            setRunners(data || []);

            const finished = (data || []).filter((r: Runner) => r.status === 'finished').length;
            setStats(prev => ({
                ...prev,
                runners: data?.length || 0,
                finished,
            }));
        } catch (err) {
            console.error('Error fetching runners:', err);
        }
    }

    function formatTime(ms: number | undefined): string {
        if (!ms) return '-';
        const hours = Math.floor(ms / 3600000);
        const minutes = Math.floor((ms % 3600000) / 60000);
        const seconds = Math.floor((ms % 60000) / 1000);
        return `${hours}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    }

    // Get 2-letter country code for FlagCDN
    function getCountryCode(countryCode: string): string {
        if (!countryCode) return 'xx';
        // Handle common country names
        const codeMap: Record<string, string> = {
            'THAILAND': 'TH', 'THAI': 'TH', 'ไทย': 'TH',
            'USA': 'US', 'UNITED STATES': 'US', 'AMERICA': 'US',
            'UK': 'GB', 'UNITED KINGDOM': 'GB', 'BRITAIN': 'GB', 'ENGLAND': 'GB',
            'JAPAN': 'JP', 'CHINA': 'CN', 'KOREA': 'KR', 'SINGAPORE': 'SG',
            'MALAYSIA': 'MY', 'INDONESIA': 'ID', 'VIETNAM': 'VN', 'PHILIPPINES': 'PH',
            'AUSTRALIA': 'AU', 'GERMANY': 'DE', 'FRANCE': 'FR', 'ITALY': 'IT',
            'SPAIN': 'ES', 'NETHERLANDS': 'NL', 'RUSSIA': 'RU', 'INDIA': 'IN',
            'BRAZIL': 'BR', 'CANADA': 'CA', 'MEXICO': 'MX', 'SWEDEN': 'SE',
            'SWITZERLAND': 'CH', 'AUSTRIA': 'AT', 'BELGIUM': 'BE', 'DENMARK': 'DK',
            'NORWAY': 'NO', 'FINLAND': 'FI', 'POLAND': 'PL', 'PORTUGAL': 'PT',
            'IRELAND': 'IE', 'NEW ZEALAND': 'NZ', 'SOUTH AFRICA': 'ZA',
            'MYANMAR': 'MM', 'LAOS': 'LA', 'CAMBODIA': 'KH', 'TAIWAN': 'TW',
            'HONG KONG': 'HK', 'NEPAL': 'NP', 'SRI LANKA': 'LK', 'BANGLADESH': 'BD',
        };
        let code = countryCode.toUpperCase();
        if (codeMap[code]) {
            code = codeMap[code];
        }
        return code.length === 2 ? code : 'xx';
    }

    const ageGroups = [...new Set(runners.map(r => r.ageGroup).filter(Boolean))];

    const filteredRunners = runners.filter(runner => {
        const matchesSearch = searchQuery === '' ||
            runner.firstName.toLowerCase().includes(searchQuery.toLowerCase()) ||
            runner.lastName.toLowerCase().includes(searchQuery.toLowerCase()) ||
            runner.bib.includes(searchQuery);

        const matchesStatus = filterStatus === 'all' || runner.status === filterStatus;
        const matchesGender = filterGender === 'all' || runner.gender === filterGender;
        const matchesAgeGroup = filterAgeGroup === 'all' || runner.ageGroup === filterAgeGroup;

        return matchesSearch && matchesStatus && matchesGender && matchesAgeGroup;
    });

    const [currentTime, setCurrentTime] = useState(new Date());
    useEffect(() => {
        const timer = setInterval(() => setCurrentTime(new Date()), 1000);
        return () => clearInterval(timer);
    }, []);

    const selectedEventData = events.find(e => e._id === selectedEvent);

    if (loading) {
        return (
            <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--background)' }}>
                <div className="text-center">
                    <div className="w-16 h-16 glass rounded-2xl flex items-center justify-center mx-auto mb-4 float-animation">
                        <div className="w-8 h-8 border-3 rounded-full animate-spin" style={{ borderColor: 'var(--border)', borderTopColor: 'var(--accent)' }}></div>
                    </div>
                    <p style={{ color: 'var(--muted-foreground)' }}>กำลังโหลดข้อมูล...</p>
                </div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--background)' }}>
                <div className="glass hover-glow p-8 rounded-2xl max-w-md">
                    <div className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4 icon-bounce" style={{ background: 'var(--error-bg)' }}>
                        <span className="text-2xl">⚠️</span>
                    </div>
                    <h2 className="text-xl font-semibold mb-2 text-center" style={{ color: 'var(--foreground)' }}>Connection Error</h2>
                    <p className="mb-4 text-center" style={{ color: 'var(--muted-foreground)' }}>{error}</p>
                    <button
                        onClick={fetchData}
                        className="w-full py-3 font-bold rounded-xl btn-glow"
                        style={{ background: 'var(--accent)', color: 'var(--accent-foreground)' }}
                    >
                        ลองใหม่
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen" style={{ background: 'var(--background)' }}>
            {/* Cursor Spotlight */}
            <CursorSpotlight size={600} />

            {/* Header */}
            <header className="sticky top-0 z-50 glass">
                <div className="max-w-7xl mx-auto px-6 py-3 flex items-center justify-between">
                    <Link href="/" className="flex items-center gap-3 scale-hover">
                        <Image
                            src={theme === 'dark' ? '/logo-white.png' : '/logo-black.png'}
                            alt="RACETIME"
                            width={120}
                            height={40}
                            className="h-10 w-auto"
                        />
                    </Link>

                    <div className="flex items-center gap-4">
                        {/* Live indicator */}
                        <div className="flex items-center gap-2 px-4 py-2 glass rounded-full water-drop">
                            <span className="relative flex h-2 w-2">
                                <span className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-75" style={{ background: 'var(--success)' }}></span>
                                <span className="relative inline-flex rounded-full h-2 w-2" style={{ background: 'var(--success)' }}></span>
                            </span>
                            <span className="text-sm font-medium" style={{ color: 'var(--success)' }}>Live</span>
                            <span className="text-sm font-mono" style={{ color: 'var(--muted-foreground)' }}>
                                {currentTime.toLocaleTimeString('th-TH')}
                            </span>
                        </div>

                        {/* Theme Toggle */}
                        <button
                            onClick={toggleTheme}
                            className="p-2.5 rounded-xl glass scale-hover"
                            title={theme === 'dark' ? 'Light Mode' : 'Dark Mode'}
                        >
                            <span className="text-lg">{theme === 'dark' ? '☀️' : '🌙'}</span>
                        </button>
                    </div>
                </div>
            </header>

            <main className="relative z-10 max-w-7xl mx-auto px-6 py-6">
                {/* Title */}
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
                    <h1 className="text-2xl font-bold" style={{ color: 'var(--foreground)' }}>
                        {selectedEventData?.name || 'Race Results'}
                    </h1>
                </div>

                {/* Search & Filters */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-6 gap-3 mb-6">
                    {/* Search */}
                    <div className="lg:col-span-2 relative group">
                        <svg className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 transition-colors group-focus-within:text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" style={{ color: 'var(--muted-foreground)' }}>
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                        </svg>
                        <input
                            type="text"
                            placeholder="Search BIB or Name"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="w-full pl-12 pr-4 py-3 rounded-xl glass focus:outline-none transition-all focus:scale-[1.02]"
                            style={{ color: 'var(--foreground)' }}
                        />
                    </div>

                    {/* Event Type */}
                    <select
                        value={selectedEvent}
                        onChange={(e) => setSelectedEvent(e.target.value)}
                        className="px-4 py-3 rounded-xl glass appearance-none cursor-pointer focus:outline-none scale-hover"
                        style={{ color: 'var(--foreground)' }}
                    >
                        {events.map(event => (
                            <option key={event._id} value={event._id}>
                                {event.category || event.name} {event.distance && `${event.distance}K`}
                            </option>
                        ))}
                    </select>

                    {/* Status Filter */}
                    <select
                        value={filterStatus}
                        onChange={(e) => setFilterStatus(e.target.value)}
                        className="px-4 py-3 rounded-xl glass appearance-none cursor-pointer focus:outline-none scale-hover"
                        style={{ color: 'var(--foreground)' }}
                    >
                        <option value="all">Status: All</option>
                        <option value="finished">Finished</option>
                        <option value="in_progress">Running</option>
                        <option value="dns">DNS</option>
                        <option value="dnf">DNF</option>
                    </select>

                    {/* Gender Filter */}
                    <select
                        value={filterGender}
                        onChange={(e) => setFilterGender(e.target.value)}
                        className="px-4 py-3 rounded-xl glass appearance-none cursor-pointer focus:outline-none scale-hover"
                        style={{ color: 'var(--foreground)' }}
                    >
                        <option value="all">Gender: All</option>
                        <option value="M">Male (M)</option>
                        <option value="F">Female (F)</option>
                    </select>

                    {/* Age Group Filter */}
                    <select
                        value={filterAgeGroup}
                        onChange={(e) => setFilterAgeGroup(e.target.value)}
                        className="px-4 py-3 rounded-xl glass appearance-none cursor-pointer focus:outline-none scale-hover"
                        style={{ color: 'var(--foreground)' }}
                    >
                        <option value="all">Age Group: All</option>
                        {ageGroups.map(group => (
                            <option key={group} value={group}>{group}</option>
                        ))}
                    </select>
                </div>

                {/* Results Table */}
                <div className="glass rounded-2xl overflow-hidden hover-glow">
                    <div className="px-6 py-4 flex items-center justify-between" style={{ borderBottom: '1px solid var(--border)' }}>
                        <h2 className="text-lg font-semibold" style={{ color: 'var(--foreground)' }}>Race Results</h2>
                        <span className="text-sm px-3 py-1 rounded-full" style={{ background: 'var(--accent-light)', color: 'var(--accent)' }}>
                            {filteredRunners.length} of {runners.length} runners
                        </span>
                    </div>

                    <div className="overflow-x-auto">
                        <table className="w-full">
                            <thead>
                                <tr style={{ background: 'var(--muted)' }}>
                                    <th className="px-6 py-4 text-left text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--muted-foreground)' }}>Rank</th>
                                    <th className="px-6 py-4 text-left text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--muted-foreground)' }}>BIB</th>
                                    <th className="px-6 py-4 text-left text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--muted-foreground)' }}>Full Name</th>
                                    <th className="px-6 py-4 text-left text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--muted-foreground)' }}>Nationality</th>
                                    <th className="px-6 py-4 text-left text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--muted-foreground)' }}>Gender</th>
                                    <th className="px-6 py-4 text-left text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--muted-foreground)' }}>Age Group</th>
                                    <th className="px-6 py-4 text-left text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--muted-foreground)' }}>Status</th>
                                    <th className="px-6 py-4 text-right text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--muted-foreground)' }}>Elapsed Time</th>
                                    <th className="px-6 py-4 text-center text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--muted-foreground)' }}>Details</th>
                                </tr>
                            </thead>
                            <tbody>
                                {filteredRunners.length === 0 ? (
                                    <tr>
                                        <td colSpan={10} className="px-6 py-16 text-center" style={{ color: 'var(--muted-foreground)' }}>
                                            <div className="float-animation inline-block mb-4 text-4xl">🏃</div>
                                            <p>{runners.length === 0 ? 'ยังไม่มีนักวิ่งใน Event นี้' : 'ไม่พบผลลัพธ์ตามเงื่อนไขที่เลือก'}</p>
                                        </td>
                                    </tr>
                                ) : (
                                    filteredRunners.map((runner, index) => {
                                        const rank = runner.overallRank || index + 1;
                                        const isTopThree = rank <= 3 && runner.status === 'finished';

                                        return (
                                            <tr
                                                key={runner._id}
                                                className="row-highlight cursor-pointer"
                                                style={{ borderBottom: '1px solid var(--border)' }}
                                            >
                                                <td className="px-6 py-4">
                                                    <div className="flex items-center gap-2">
                                                        {isTopThree && (
                                                            <span className="text-xl icon-bounce inline-block">
                                                                {rank === 1 ? '🥇' : rank === 2 ? '🥈' : '🥉'}
                                                            </span>
                                                        )}
                                                        <span className="font-bold" style={{ color: isTopThree ? 'var(--accent)' : 'var(--foreground)' }}>
                                                            {rank}
                                                        </span>
                                                    </div>
                                                </td>
                                                <td className="px-6 py-4">
                                                    <span className="font-mono font-bold px-3 py-1.5 rounded-lg glass scale-hover inline-block" style={{ color: 'var(--foreground)' }}>
                                                        {runner.bib}
                                                    </span>
                                                </td>
                                                <td className="px-6 py-4">
                                                    <span className="font-medium link-underline" style={{ color: 'var(--primary)' }}>
                                                        {runner.firstName} {runner.lastName}
                                                    </span>
                                                </td>
                                                <td className="px-6 py-4 text-center">
                                                    {runner.nationality ? (
                                                        <div className="flex justify-center" title={runner.nationality}>
                                                            <img
                                                                src={`https://flagcdn.com/w40/${getCountryCode(runner.nationality).toLowerCase()}.png`}
                                                                alt={runner.nationality}
                                                                className="h-6 w-auto rounded shadow-sm"
                                                            />
                                                        </div>
                                                    ) : (
                                                        <span style={{ color: 'var(--muted-foreground)' }}>-</span>
                                                    )}
                                                </td>
                                                <td className="px-6 py-4">
                                                    <span style={{ color: runner.gender === 'M' ? '#3b82f6' : '#ec4899' }}>
                                                        {runner.gender === 'M' ? 'ชาย Male (M)' : 'หญิง Female (F)'}
                                                    </span>
                                                </td>
                                                <td className="px-6 py-4" style={{ color: 'var(--foreground)' }}>
                                                    {runner.ageGroup || '-'}
                                                </td>
                                                <td className="px-6 py-4">
                                                    <span
                                                        className="px-3 py-1.5 text-sm font-medium rounded-full scale-hover inline-block"
                                                        style={{
                                                            background: runner.status === 'finished' ? 'var(--success-bg)' :
                                                                runner.status === 'in_progress' ? 'var(--primary-bg)' :
                                                                    runner.status === 'dnf' ? 'var(--error-bg)' : 'var(--muted)',
                                                            color: runner.status === 'finished' ? 'var(--success)' :
                                                                runner.status === 'in_progress' ? 'var(--primary)' :
                                                                    runner.status === 'dnf' ? 'var(--error)' : 'var(--muted-foreground)'
                                                        }}
                                                    >
                                                        {runner.status === 'finished' ? 'Finished' :
                                                            runner.status === 'in_progress' ? 'Running' :
                                                                runner.status === 'dnf' ? 'DNF' :
                                                                    runner.status === 'dns' ? 'DNS' : 'FINISH'}
                                                    </span>
                                                </td>
                                                <td className="px-6 py-4 text-right">
                                                    <span className="font-mono font-bold" style={{ color: 'var(--accent)' }}>
                                                        {formatTime(runner.netTime)}
                                                    </span>
                                                </td>
                                                <td className="px-6 py-4 text-center">
                                                    <button
                                                        onClick={() => setSelectedRunner(runner)}
                                                        className="inline-flex items-center gap-2 px-4 py-2 text-sm rounded-lg glass scale-hover"
                                                        style={{ color: 'var(--primary)' }}
                                                    >
                                                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                                                        </svg>
                                                        View Details
                                                    </button>
                                                </td>
                                            </tr>
                                        );
                                    })
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>

                {/* Quick Stats */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-6">
                    {[
                        { icon: '🏃', label: 'Total Runners', value: stats.runners },
                        { icon: '🏆', label: 'Finished', value: stats.finished },
                        { icon: '⏱️', label: 'In Progress', value: runners.filter(r => r.status === 'in_progress').length },
                        { icon: '📊', label: 'Completion', value: stats.runners > 0 ? `${Math.round((stats.finished / stats.runners) * 100)}%` : '0%' },
                    ].map((stat, idx) => (
                        <div
                            key={idx}
                            className="glass p-5 rounded-2xl interactive-card water-drop"
                        >
                            <div className="flex items-center gap-4">
                                <span className="text-3xl icon-bounce">{stat.icon}</span>
                                <div>
                                    <div className="text-2xl font-bold" style={{ color: 'var(--foreground)' }}>{stat.value}</div>
                                    <div className="text-sm" style={{ color: 'var(--muted-foreground)' }}>{stat.label}</div>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            </main>

            {/* Runner Detail Modal */}
            {selectedRunner && (
                <div
                    className="fixed inset-0 z-[100] flex items-center justify-center p-4"
                    onClick={() => setSelectedRunner(null)}
                >
                    {/* Backdrop with blur */}
                    <div
                        className="absolute inset-0"
                        style={{
                            background: 'rgba(0, 0, 0, 0.5)',
                            backdropFilter: 'blur(8px)',
                            WebkitBackdropFilter: 'blur(8px)'
                        }}
                    />

                    {/* Modal Content */}
                    <div
                        className="relative w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-3xl"
                        style={{
                            background: theme === 'dark' ? 'rgba(24, 24, 32, 0.4)' : 'rgba(255, 255, 255, 0.4)',
                            backdropFilter: 'blur(24px)',
                            WebkitBackdropFilter: 'blur(24px)',
                            border: '1px solid rgba(255, 255, 255, 0.15)',
                            boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5), inset 0 1px 0 rgba(255, 255, 255, 0.1)'
                        }}
                        onClick={(e) => e.stopPropagation()}
                    >
                        {/* Header */}
                        <div className="sticky top-0 flex items-center justify-between p-6 rounded-t-3xl" style={{
                            background: theme === 'dark' ? 'rgba(24, 24, 32, 0.6)' : 'rgba(255, 255, 255, 0.6)',
                            backdropFilter: 'blur(20px)',
                            WebkitBackdropFilter: 'blur(20px)',
                            borderBottom: '1px solid rgba(255, 255, 255, 0.1)'
                        }}>
                            <div className="flex items-center gap-4">
                                <div
                                    className="w-16 h-16 rounded-2xl flex items-center justify-center font-bold text-2xl"
                                    style={{ background: 'var(--accent)', color: 'var(--accent-foreground)' }}
                                >
                                    {selectedRunner.bib}
                                </div>
                                <div>
                                    <h2 className="text-2xl font-bold" style={{ color: 'var(--foreground)' }}>
                                        {selectedRunner.firstName} {selectedRunner.lastName}
                                    </h2>
                                    {(selectedRunner.firstNameTh || selectedRunner.lastNameTh) && (
                                        <p style={{ color: 'var(--muted-foreground)' }}>
                                            {selectedRunner.firstNameTh} {selectedRunner.lastNameTh}
                                        </p>
                                    )}
                                </div>
                            </div>
                            <button
                                onClick={() => setSelectedRunner(null)}
                                className="p-2 rounded-xl glass scale-hover"
                            >
                                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" style={{ color: 'var(--foreground)' }}>
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                </svg>
                            </button>
                        </div>

                        {/* Content */}
                        <div className="p-6 space-y-6">
                            {/* Status & Time */}
                            <div className="grid grid-cols-2 gap-4">
                                <div className="glass p-4 rounded-2xl text-center">
                                    <div className="text-sm mb-2" style={{ color: 'var(--muted-foreground)' }}>Status</div>
                                    <span
                                        className="px-4 py-2 text-lg font-semibold rounded-full inline-block"
                                        style={{
                                            background: selectedRunner.status === 'finished' ? 'var(--success-bg)' :
                                                selectedRunner.status === 'in_progress' ? 'var(--primary-bg)' :
                                                    selectedRunner.status === 'dnf' ? 'var(--error-bg)' : 'var(--muted)',
                                            color: selectedRunner.status === 'finished' ? 'var(--success)' :
                                                selectedRunner.status === 'in_progress' ? 'var(--primary)' :
                                                    selectedRunner.status === 'dnf' ? 'var(--error)' : 'var(--muted-foreground)'
                                        }}
                                    >
                                        {selectedRunner.status === 'finished' ? '✅ Finished' :
                                            selectedRunner.status === 'in_progress' ? '🏃 Running' :
                                                selectedRunner.status === 'dnf' ? '❌ DNF' :
                                                    selectedRunner.status === 'dns' ? '⏸️ DNS' : selectedRunner.status}
                                    </span>
                                </div>
                                <div className="glass p-4 rounded-2xl text-center">
                                    <div className="text-sm mb-2" style={{ color: 'var(--muted-foreground)' }}>Net Time</div>
                                    <div className="text-3xl font-mono font-bold" style={{ color: 'var(--accent)' }}>
                                        {formatTime(selectedRunner.netTime)}
                                    </div>
                                </div>
                            </div>

                            {/* Rankings */}
                            <div className="glass p-4 rounded-2xl">
                                <div className="text-sm mb-3 font-semibold" style={{ color: 'var(--muted-foreground)' }}>Rankings</div>
                                <div className="grid grid-cols-4 gap-4 text-center">
                                    <div>
                                        <div className="text-2xl font-bold" style={{ color: 'var(--foreground)' }}>
                                            {selectedRunner.overallRank || '-'}
                                        </div>
                                        <div className="text-xs" style={{ color: 'var(--muted-foreground)' }}>Overall</div>
                                    </div>
                                    <div>
                                        <div className="text-2xl font-bold" style={{ color: 'var(--foreground)' }}>
                                            {selectedRunner.genderRank || '-'}
                                        </div>
                                        <div className="text-xs" style={{ color: 'var(--muted-foreground)' }}>Gender</div>
                                    </div>
                                    <div>
                                        <div className="text-2xl font-bold" style={{ color: 'var(--foreground)' }}>
                                            {selectedRunner.ageGroupRank || '-'}
                                        </div>
                                        <div className="text-xs" style={{ color: 'var(--muted-foreground)' }}>Age Group</div>
                                    </div>
                                    <div>
                                        <div className="text-2xl font-bold" style={{ color: 'var(--foreground)' }}>
                                            {selectedRunner.categoryRank || '-'}
                                        </div>
                                        <div className="text-xs" style={{ color: 'var(--muted-foreground)' }}>Category</div>
                                    </div>
                                </div>
                            </div>

                            {/* Personal Info */}
                            <div className="glass p-4 rounded-2xl">
                                <div className="text-sm mb-3 font-semibold" style={{ color: 'var(--muted-foreground)' }}>Personal Information</div>
                                <div className="grid grid-cols-2 gap-4">
                                    <div className="flex items-center gap-3">
                                        <span className="text-xl">🏷️</span>
                                        <div>
                                            <div className="text-xs" style={{ color: 'var(--muted-foreground)' }}>Category</div>
                                            <div className="font-semibold" style={{ color: 'var(--foreground)' }}>{selectedRunner.category}</div>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-3">
                                        <span className="text-xl">{selectedRunner.gender === 'M' ? '👨' : '👩'}</span>
                                        <div>
                                            <div className="text-xs" style={{ color: 'var(--muted-foreground)' }}>Gender</div>
                                            <div className="font-semibold" style={{ color: 'var(--foreground)' }}>
                                                {selectedRunner.gender === 'M' ? 'Male' : 'Female'}
                                            </div>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-3">
                                        <span className="text-xl">📅</span>
                                        <div>
                                            <div className="text-xs" style={{ color: 'var(--muted-foreground)' }}>Age Group</div>
                                            <div className="font-semibold" style={{ color: 'var(--foreground)' }}>{selectedRunner.ageGroup || '-'}</div>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-3">
                                        <span className="text-xl">🎂</span>
                                        <div>
                                            <div className="text-xs" style={{ color: 'var(--muted-foreground)' }}>Age</div>
                                            <div className="font-semibold" style={{ color: 'var(--foreground)' }}>{selectedRunner.age || '-'}</div>
                                        </div>
                                    </div>
                                    {selectedRunner.nationality && (
                                        <div className="flex items-center gap-3">
                                            <img
                                                src={`https://flagcdn.com/w40/${getCountryCode(selectedRunner.nationality).toLowerCase()}.png`}
                                                alt={selectedRunner.nationality}
                                                className="h-5 w-auto rounded shadow-sm"
                                            />
                                            <div>
                                                <div className="text-xs" style={{ color: 'var(--muted-foreground)' }}>Nationality</div>
                                                <div className="font-semibold" style={{ color: 'var(--foreground)' }}>{selectedRunner.nationality}</div>
                                            </div>
                                        </div>
                                    )}
                                    {(selectedRunner.team || selectedRunner.teamName) && (
                                        <div className="flex items-center gap-3">
                                            <span className="text-xl">👥</span>
                                            <div>
                                                <div className="text-xs" style={{ color: 'var(--muted-foreground)' }}>Team</div>
                                                <div className="font-semibold" style={{ color: 'var(--foreground)' }}>{selectedRunner.teamName || selectedRunner.team}</div>
                                            </div>
                                        </div>
                                    )}
                                    {selectedRunner.shirtSize && (
                                        <div className="flex items-center gap-3">
                                            <span className="text-xl">👕</span>
                                            <div>
                                                <div className="text-xs" style={{ color: 'var(--muted-foreground)' }}>Shirt Size</div>
                                                <div className="font-semibold" style={{ color: 'var(--foreground)' }}>{selectedRunner.shirtSize}</div>
                                            </div>
                                        </div>
                                    )}
                                    {selectedRunner.bloodType && (
                                        <div className="flex items-center gap-3">
                                            <span className="text-xl">🩸</span>
                                            <div>
                                                <div className="text-xs" style={{ color: 'var(--muted-foreground)' }}>Blood Type</div>
                                                <div className="font-semibold" style={{ color: 'var(--foreground)' }}>{selectedRunner.bloodType}</div>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* Contact Info (if available) */}
                            {(selectedRunner.email || selectedRunner.phone) && (
                                <div className="glass p-4 rounded-2xl">
                                    <div className="text-sm mb-3 font-semibold" style={{ color: 'var(--muted-foreground)' }}>Contact Information</div>
                                    <div className="space-y-3">
                                        {selectedRunner.email && (
                                            <div className="flex items-center gap-3">
                                                <span className="text-xl">📧</span>
                                                <div style={{ color: 'var(--foreground)' }}>{selectedRunner.email}</div>
                                            </div>
                                        )}
                                        {selectedRunner.phone && (
                                            <div className="flex items-center gap-3">
                                                <span className="text-xl">📱</span>
                                                <div style={{ color: 'var(--foreground)' }}>{selectedRunner.phone}</div>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            )}

                            {/* Emergency Contact (if available) */}
                            {(selectedRunner.emergencyContact || selectedRunner.emergencyPhone) && (
                                <div className="glass p-4 rounded-2xl" style={{ borderColor: 'var(--warning)', borderWidth: '1px' }}>
                                    <div className="text-sm mb-3 font-semibold flex items-center gap-2" style={{ color: 'var(--warning)' }}>
                                        <span>⚠️</span> Emergency Contact
                                    </div>
                                    <div className="space-y-2">
                                        {selectedRunner.emergencyContact && (
                                            <div style={{ color: 'var(--foreground)' }}>Name: {selectedRunner.emergencyContact}</div>
                                        )}
                                        {selectedRunner.emergencyPhone && (
                                            <div style={{ color: 'var(--foreground)' }}>Phone: {selectedRunner.emergencyPhone}</div>
                                        )}
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
