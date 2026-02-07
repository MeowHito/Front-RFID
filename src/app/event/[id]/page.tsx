'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useParams } from 'next/navigation';
import { useTheme } from '@/lib/theme-context';
import { useLanguage } from '@/lib/language-context';
import CursorSpotlight from '@/components/CursorSpotlight';

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
}

export default function EventDashboardPage() {
    const { theme, toggleTheme } = useTheme();
    const { language, t } = useLanguage();
    const params = useParams();
    const eventId = params.id as string;

    const [campaign, setCampaign] = useState<Campaign | null>(null);
    const [runners, setRunners] = useState<Runner[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const [searchQuery, setSearchQuery] = useState('');
    const [filterStatus, setFilterStatus] = useState('all');
    const [filterGender, setFilterGender] = useState('all');
    const [filterCategory, setFilterCategory] = useState('all');
    const [selectedRunner, setSelectedRunner] = useState<Runner | null>(null);

    const [currentTime, setCurrentTime] = useState(new Date());

    useEffect(() => {
        const timer = setInterval(() => setCurrentTime(new Date()), 1000);
        return () => clearInterval(timer);
    }, []);

    useEffect(() => {
        if (eventId) {
            fetchEventData();
        }
    }, [eventId]);

    async function fetchEventData() {
        try {
            setLoading(true);
            setError(null);

            const [campaignRes, runnersRes] = await Promise.all([
                fetch(`${API_URL}/campaigns/${eventId}`),
                fetch(`${API_URL}/runners?campaignId=${eventId}`)
            ]);

            if (!campaignRes.ok) {
                throw new Error(language === 'th' ? 'ไม่พบข้อมูลกิจกรรม' : 'Event not found');
            }

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

    function getCountryCode(countryCode: string): string {
        if (!countryCode) return 'xx';
        const codeMap: Record<string, string> = {
            'THAILAND': 'TH', 'THAI': 'TH', 'ไทย': 'TH',
            'USA': 'US', 'UNITED STATES': 'US',
            'UK': 'GB', 'JAPAN': 'JP', 'CHINA': 'CN',
            'SINGAPORE': 'SG', 'MALAYSIA': 'MY',
        };
        let code = countryCode.toUpperCase();
        if (codeMap[code]) code = codeMap[code];
        return code.length === 2 ? code : 'xx';
    }

    const filteredRunners = runners.filter(runner => {
        const matchesSearch = searchQuery === '' ||
            runner.firstName.toLowerCase().includes(searchQuery.toLowerCase()) ||
            runner.lastName.toLowerCase().includes(searchQuery.toLowerCase()) ||
            runner.bib.includes(searchQuery);
        const matchesStatus = filterStatus === 'all' || runner.status === filterStatus;
        const matchesGender = filterGender === 'all' || runner.gender === filterGender;
        const matchesCategory = filterCategory === 'all' || runner.category === filterCategory;
        return matchesSearch && matchesStatus && matchesGender && matchesCategory;
    });

    const stats = {
        total: runners.length,
        finished: runners.filter(r => r.status === 'finished').length,
        running: runners.filter(r => r.status === 'in_progress').length,
        dns: runners.filter(r => r.status === 'dns').length,
    };

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
        <div className="min-h-screen" style={{ background: 'var(--background)' }}>
            <CursorSpotlight size={600} />

            {/* Header */}
            <header className="sticky top-0 z-50 glass">
                <div className="max-w-7xl mx-auto px-6 py-3 flex items-center justify-between">
                    <Link href="/" className="flex items-center gap-3">
                        <Image
                            src={theme === 'dark' ? '/logo-white.png' : '/logo-black.png'}
                            alt="RACETIME"
                            width={120}
                            height={40}
                            className="h-10 w-auto"
                        />
                    </Link>

                    <div className="flex items-center gap-4">
                        <div className="flex items-center gap-2 px-4 py-2 glass rounded-full">
                            <span className="relative flex h-2 w-2">
                                <span className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-75" style={{ background: 'var(--success)' }}></span>
                                <span className="relative inline-flex rounded-full h-2 w-2" style={{ background: 'var(--success)' }}></span>
                            </span>
                            <span className="text-sm font-medium" style={{ color: 'var(--success)' }}>Live</span>
                            <span className="text-sm font-mono" style={{ color: 'var(--muted-foreground)' }}>
                                {currentTime.toLocaleTimeString(language === 'th' ? 'th-TH' : 'en-US')}
                            </span>
                        </div>
                        <button onClick={toggleTheme} className="p-2.5 rounded-xl glass">
                            <span className="text-lg">{theme === 'dark' ? '☀️' : '🌙'}</span>
                        </button>
                    </div>
                </div>
            </header>

            <main className="relative z-10 max-w-7xl mx-auto px-6 py-6">
                {/* Event Info Header */}
                <div className="glass rounded-2xl p-6 mb-6">
                    <div className="flex flex-col md:flex-row gap-6">
                        {campaign.pictureUrl && (
                            <div className="w-full md:w-48 h-32 rounded-xl overflow-hidden shrink-0">
                                <img src={campaign.pictureUrl} alt={campaign.name} className="w-full h-full object-cover" />
                            </div>
                        )}
                        <div className="flex-1">
                            <h1 className="text-2xl md:text-3xl font-bold mb-2" style={{ color: 'var(--foreground)' }}>
                                {campaign.name}
                            </h1>
                            <div className="flex flex-wrap gap-4 text-sm" style={{ color: 'var(--muted-foreground)' }}>
                                <span>📍 {campaign.location}</span>
                                <span>📅 {formatDate(campaign.eventDate)}</span>
                            </div>
                            {campaign.categories && campaign.categories.length > 0 && (
                                <div className="flex flex-wrap gap-2 mt-3">
                                    {campaign.categories.map((cat, idx) => (
                                        <span key={idx} className="px-2 py-1 rounded text-xs font-bold text-white" style={{ backgroundColor: cat.badgeColor }}>
                                            {cat.name} - {cat.distance}
                                        </span>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                {/* Stats */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                    <div className="glass rounded-xl p-4 text-center">
                        <div className="text-2xl font-bold" style={{ color: 'var(--foreground)' }}>{stats.total}</div>
                        <div className="text-sm" style={{ color: 'var(--muted-foreground)' }}>
                            {language === 'th' ? 'ผู้เข้าแข่งขัน' : 'Participants'}
                        </div>
                    </div>
                    <div className="glass rounded-xl p-4 text-center">
                        <div className="text-2xl font-bold" style={{ color: 'var(--success)' }}>{stats.finished}</div>
                        <div className="text-sm" style={{ color: 'var(--muted-foreground)' }}>
                            {language === 'th' ? 'จบแล้ว' : 'Finished'}
                        </div>
                    </div>
                    <div className="glass rounded-xl p-4 text-center">
                        <div className="text-2xl font-bold" style={{ color: 'var(--warning)' }}>{stats.running}</div>
                        <div className="text-sm" style={{ color: 'var(--muted-foreground)' }}>
                            {language === 'th' ? 'กำลังวิ่ง' : 'Running'}
                        </div>
                    </div>
                    <div className="glass rounded-xl p-4 text-center">
                        <div className="text-2xl font-bold" style={{ color: 'var(--error)' }}>{stats.dns}</div>
                        <div className="text-sm" style={{ color: 'var(--muted-foreground)' }}>DNS/DNF</div>
                    </div>
                </div>

                {/* Search & Filters */}
                <div className="grid grid-cols-1 md:grid-cols-5 gap-3 mb-6">
                    <div className="md:col-span-2 relative">
                        <svg className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" style={{ color: 'var(--muted-foreground)' }}>
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                        </svg>
                        <input
                            type="text"
                            placeholder={language === 'th' ? 'ค้นหา BIB หรือชื่อ...' : 'Search BIB or Name...'}
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="w-full pl-12 pr-4 py-3 rounded-xl glass focus:outline-none"
                            style={{ color: 'var(--foreground)' }}
                        />
                    </div>
                    <select value={filterCategory} onChange={(e) => setFilterCategory(e.target.value)} className="px-4 py-3 rounded-xl glass" style={{ color: 'var(--foreground)' }}>
                        <option value="all">{language === 'th' ? 'ประเภท: ทั้งหมด' : 'Category: All'}</option>
                        {campaign.categories?.map((cat, idx) => (
                            <option key={idx} value={cat.name}>{cat.name}</option>
                        ))}
                    </select>
                    <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} className="px-4 py-3 rounded-xl glass" style={{ color: 'var(--foreground)' }}>
                        <option value="all">{language === 'th' ? 'สถานะ: ทั้งหมด' : 'Status: All'}</option>
                        <option value="finished">{language === 'th' ? 'จบแล้ว' : 'Finished'}</option>
                        <option value="in_progress">{language === 'th' ? 'กำลังวิ่ง' : 'Running'}</option>
                        <option value="dns">DNS</option>
                        <option value="dnf">DNF</option>
                    </select>
                    <select value={filterGender} onChange={(e) => setFilterGender(e.target.value)} className="px-4 py-3 rounded-xl glass" style={{ color: 'var(--foreground)' }}>
                        <option value="all">{language === 'th' ? 'เพศ: ทั้งหมด' : 'Gender: All'}</option>
                        <option value="M">{language === 'th' ? 'ชาย' : 'Male'}</option>
                        <option value="F">{language === 'th' ? 'หญิง' : 'Female'}</option>
                    </select>
                </div>

                {/* Results Table */}
                <div className="glass rounded-2xl overflow-hidden">
                    <div className="overflow-x-auto">
                        <table className="w-full">
                            <thead>
                                <tr style={{ background: 'var(--card-bg)' }}>
                                    <th className="px-4 py-3 text-left text-sm font-bold" style={{ color: 'var(--foreground)' }}>
                                        {language === 'th' ? 'อันดับ' : 'Rank'}
                                    </th>
                                    <th className="px-4 py-3 text-left text-sm font-bold" style={{ color: 'var(--foreground)' }}>BIB</th>
                                    <th className="px-4 py-3 text-left text-sm font-bold" style={{ color: 'var(--foreground)' }}>
                                        {language === 'th' ? 'ชื่อ-นามสกุล' : 'Full Name'}
                                    </th>
                                    <th className="px-4 py-3 text-left text-sm font-bold" style={{ color: 'var(--foreground)' }}>
                                        {language === 'th' ? 'สัญชาติ' : 'Nationality'}
                                    </th>
                                    <th className="px-4 py-3 text-left text-sm font-bold" style={{ color: 'var(--foreground)' }}>
                                        {language === 'th' ? 'เพศ' : 'Gender'}
                                    </th>
                                    <th className="px-4 py-3 text-left text-sm font-bold" style={{ color: 'var(--foreground)' }}>
                                        {language === 'th' ? 'กลุ่มอายุ' : 'Age Group'}
                                    </th>
                                    <th className="px-4 py-3 text-left text-sm font-bold" style={{ color: 'var(--foreground)' }}>
                                        {language === 'th' ? 'สถานะ' : 'Status'}
                                    </th>
                                    <th className="px-4 py-3 text-left text-sm font-bold" style={{ color: 'var(--foreground)' }}>
                                        {language === 'th' ? 'เวลา' : 'Elapsed Time'}
                                    </th>
                                    <th className="px-4 py-3 text-center text-sm font-bold" style={{ color: 'var(--foreground)' }}>
                                        {language === 'th' ? 'รายละเอียด' : 'Details'}
                                    </th>
                                </tr>
                            </thead>
                            <tbody>
                                {filteredRunners.length === 0 ? (
                                    <tr>
                                        <td colSpan={9} className="px-4 py-8 text-center" style={{ color: 'var(--muted-foreground)' }}>
                                            {language === 'th' ? 'ไม่พบข้อมูลผู้เข้าแข่งขัน' : 'No participants found'}
                                        </td>
                                    </tr>
                                ) : (
                                    filteredRunners.map((runner, idx) => (
                                        <tr key={runner._id} className="border-t" style={{ borderColor: 'var(--border)' }}>
                                            <td className="px-4 py-3">
                                                <span className="font-bold" style={{ color: 'var(--foreground)' }}>
                                                    {runner.overallRank || idx + 1}
                                                </span>
                                            </td>
                                            <td className="px-4 py-3">
                                                <span className="font-mono font-bold px-2 py-1 rounded" style={{ background: 'var(--accent)', color: 'var(--accent-foreground)' }}>
                                                    {runner.bib}
                                                </span>
                                            </td>
                                            <td className="px-4 py-3" style={{ color: 'var(--foreground)' }}>
                                                {language === 'th' && runner.firstNameTh
                                                    ? `${runner.firstNameTh} ${runner.lastNameTh || ''}`
                                                    : `${runner.firstName} ${runner.lastName}`
                                                }
                                            </td>
                                            <td className="px-4 py-3">
                                                <div className="flex items-center gap-2">
                                                    <img
                                                        src={`https://flagcdn.com/w20/${getCountryCode(runner.nationality || '').toLowerCase()}.png`}
                                                        alt=""
                                                        className="w-5 h-auto"
                                                        onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                                                    />
                                                    <span style={{ color: 'var(--muted-foreground)' }}>{runner.nationality || '-'}</span>
                                                </div>
                                            </td>
                                            <td className="px-4 py-3" style={{ color: 'var(--foreground)' }}>
                                                {runner.gender === 'M' ? '👨' : '👩'} {runner.gender}
                                            </td>
                                            <td className="px-4 py-3" style={{ color: 'var(--muted-foreground)' }}>
                                                {runner.ageGroup || '-'}
                                            </td>
                                            <td className="px-4 py-3">
                                                <span className={`px-2 py-1 rounded text-xs font-bold ${
                                                    runner.status === 'finished' ? 'bg-green-500/20 text-green-500' :
                                                    runner.status === 'in_progress' ? 'bg-yellow-500/20 text-yellow-500' :
                                                    'bg-red-500/20 text-red-500'
                                                }`}>
                                                    {runner.status === 'finished' ? (language === 'th' ? 'จบ' : 'Finished') :
                                                     runner.status === 'in_progress' ? (language === 'th' ? 'วิ่ง' : 'Running') :
                                                     runner.status?.toUpperCase() || '-'}
                                                </span>
                                            </td>
                                            <td className="px-4 py-3 font-mono" style={{ color: 'var(--foreground)' }}>
                                                {formatTime(runner.elapsedTime || runner.netTime)}
                                            </td>
                                            <td className="px-4 py-3 text-center">
                                                <button
                                                    onClick={() => setSelectedRunner(runner)}
                                                    className="px-3 py-1 rounded-lg text-sm"
                                                    style={{ background: 'var(--accent)', color: 'var(--accent-foreground)' }}
                                                >
                                                    {language === 'th' ? 'ดู' : 'View'}
                                                </button>
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            </main>

            {/* Runner Details Modal */}
            {selectedRunner && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.5)' }}>
                    <div className="glass rounded-2xl p-6 max-w-lg w-full max-h-[80vh] overflow-y-auto">
                        <div className="flex justify-between items-start mb-4">
                            <h3 className="text-xl font-bold" style={{ color: 'var(--foreground)' }}>
                                {language === 'th' ? 'รายละเอียดนักวิ่ง' : 'Runner Details'}
                            </h3>
                            <button onClick={() => setSelectedRunner(null)} className="text-2xl" style={{ color: 'var(--muted-foreground)' }}>×</button>
                        </div>
                        <div className="space-y-3">
                            <div className="flex justify-between">
                                <span style={{ color: 'var(--muted-foreground)' }}>BIB</span>
                                <span className="font-bold" style={{ color: 'var(--foreground)' }}>{selectedRunner.bib}</span>
                            </div>
                            <div className="flex justify-between">
                                <span style={{ color: 'var(--muted-foreground)' }}>{language === 'th' ? 'ชื่อ' : 'Name'}</span>
                                <span style={{ color: 'var(--foreground)' }}>{selectedRunner.firstName} {selectedRunner.lastName}</span>
                            </div>
                            <div className="flex justify-between">
                                <span style={{ color: 'var(--muted-foreground)' }}>{language === 'th' ? 'ประเภท' : 'Category'}</span>
                                <span style={{ color: 'var(--foreground)' }}>{selectedRunner.category}</span>
                            </div>
                            <div className="flex justify-between">
                                <span style={{ color: 'var(--muted-foreground)' }}>{language === 'th' ? 'กลุ่มอายุ' : 'Age Group'}</span>
                                <span style={{ color: 'var(--foreground)' }}>{selectedRunner.ageGroup}</span>
                            </div>
                            <div className="flex justify-between">
                                <span style={{ color: 'var(--muted-foreground)' }}>{language === 'th' ? 'อันดับรวม' : 'Overall Rank'}</span>
                                <span className="font-bold" style={{ color: 'var(--foreground)' }}>{selectedRunner.overallRank || '-'}</span>
                            </div>
                            <div className="flex justify-between">
                                <span style={{ color: 'var(--muted-foreground)' }}>{language === 'th' ? 'อันดับเพศ' : 'Gender Rank'}</span>
                                <span style={{ color: 'var(--foreground)' }}>{selectedRunner.genderRank || '-'}</span>
                            </div>
                            <div className="flex justify-between">
                                <span style={{ color: 'var(--muted-foreground)' }}>{language === 'th' ? 'เวลาสุทธิ' : 'Net Time'}</span>
                                <span className="font-mono font-bold" style={{ color: 'var(--foreground)' }}>{formatTime(selectedRunner.netTime)}</span>
                            </div>
                            <div className="flex justify-between">
                                <span style={{ color: 'var(--muted-foreground)' }}>{language === 'th' ? 'ทีม' : 'Team'}</span>
                                <span style={{ color: 'var(--foreground)' }}>{selectedRunner.team || selectedRunner.teamName || '-'}</span>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
