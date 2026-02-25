'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useLanguage } from '@/lib/language-context';

interface Campaign {
    _id: string;
    uuid: string;
    slug?: string;
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

interface CheckpointMapping {
    _id: string;
    checkpointId: string;
    eventId: string;
    orderNum: number;
    distanceFromStart?: number;
    checkpoint?: { name: string; type: string; kmCumulative?: number };
}

function normalizeComparableText(value: unknown): string {
    return String(value || '').trim().toLowerCase().replace(/[^a-z0-9ก-๙]+/g, '');
}

function parseDistanceValue(value: unknown): number | null {
    const raw = String(value || '').replace(/,/g, '');
    const match = raw.match(/-?\d+(?:\.\d+)?/);
    if (!match) return null;
    const parsed = Number(match[0]);
    return Number.isFinite(parsed) ? parsed : null;
}

const AVATAR_COLORS = [
    '#ef4444', '#f97316', '#eab308', '#22c55e', '#06b6d4',
    '#3b82f6', '#8b5cf6', '#ec4899', '#f43f5e', '#14b8a6',
];

function getAvatarColor(name: string): string {
    let hash = 0;
    for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
    return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

function getInitials(firstName: string, lastName: string): string {
    return ((firstName?.[0] || '') + (lastName?.[0] || '')).toUpperCase() || '?';
}

export default function EventLivePage() {
    const { language } = useLanguage();
    const params = useParams();
    const eventKey = params.id as string;

    const [campaign, setCampaign] = useState<Campaign | null>(null);
    const [runners, setRunners] = useState<Runner[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const [searchQuery, setSearchQuery] = useState('');
    const [filterGender, setFilterGender] = useState('ALL');
    const [filterCategory, setFilterCategory] = useState('ALL');
    const [selectedRunner, setSelectedRunner] = useState<Runner | null>(null);
    const [runnerTimings, setRunnerTimings] = useState<TimingRecord[]>([]);

    const [showGenRank, setShowGenRank] = useState(true);
    const [showCatRank, setShowCatRank] = useState(true);
    const [showColDropdown, setShowColDropdown] = useState(false);

    const [currentTime, setCurrentTime] = useState(new Date());
    const [checkpointMappings, setCheckpointMappings] = useState<CheckpointMapping[]>([]);
    const [totalDistance, setTotalDistance] = useState<number>(0);

    const toApiData = (payload: any) => payload?.data ?? payload;

    useEffect(() => {
        const timer = setInterval(() => setCurrentTime(new Date()), 1000);
        return () => clearInterval(timer);
    }, []);

    useEffect(() => { if (eventKey) fetchEventData(); }, [eventKey]);

    async function fetchEventData() {
        try {
            setLoading(true);
            setError(null);

            const campaignRes = await fetch(`/api/campaigns/${eventKey}`, { cache: 'no-store' });
            if (!campaignRes.ok) throw new Error(language === 'th' ? 'ไม่พบข้อมูลกิจกรรม' : 'Event not found');

            const campaignData = toApiData(await campaignRes.json().catch(() => ({}))) as Campaign;
            if (!campaignData?._id) throw new Error(language === 'th' ? 'ไม่พบข้อมูลกิจกรรม' : 'Event not found');
            setCampaign(campaignData);

            const runnersRes = await fetch(`/api/runners?id=${campaignData._id}`, { cache: 'no-store' });
            if (runnersRes.ok) {
                const runnersData = await runnersRes.json().catch(() => ({}));
                const list = (runnersData?.data?.data as Runner[]) || (runnersData?.data as Runner[]) || (Array.isArray(runnersData) ? runnersData : []);
                setRunners(Array.isArray(list) ? list : []);
            }
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : 'Error');
        } finally {
            setLoading(false);
        }
    }

    async function fetchRunnerTimings(runnerId: string) {
        if (!campaign?._id) { setRunnerTimings([]); return; }
        try {
            const res = await fetch(`/api/timing/runner/${campaign._id}/${runnerId}`, { cache: 'no-store' });
            if (res.ok) { setRunnerTimings(await res.json() || []); } else { setRunnerTimings([]); }
        } catch { setRunnerTimings([]); }
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
        return date.toLocaleDateString(language === 'th' ? 'th-TH' : 'en-US', { day: '2-digit', month: 'short', year: 'numeric' });
    }

    function getStatusColor(status: string) {
        switch (status) {
            case 'finished': return '#22c55e';
            case 'in_progress': return '#f97316';
            case 'dnf': return '#ef4444';
            case 'dns': return '#ef4444';
            default: return '#94a3b8';
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

    function getStatusBgColor(status: string) {
        switch (status) {
            case 'finished': return '#22c55e';
            case 'in_progress': return '#f97316';
            case 'dnf': return '#dc2626';
            case 'dns': return '#dc2626';
            default: return '#94a3b8';
        }
    }

    const stats = useMemo(() => ({
        total: runners.length,
        started: runners.filter(r => r.status !== 'not_started' && r.status !== 'dns').length,
        finished: runners.filter(r => r.status === 'finished').length,
        racing: runners.filter(r => r.status === 'in_progress').length,
        dnf: runners.filter(r => r.status === 'dnf' || r.status === 'dns').length,
    }), [runners]);

    const categories = useMemo(() => {
        const campaignCategories = Array.isArray(campaign?.categories) ? campaign.categories : [];
        if (!campaignCategories.length) {
            const runnerCategories = new Set(runners.map(r => r.category).filter(Boolean));
            return Array.from(runnerCategories).map(v => ({ key: v, label: v, normalizedName: normalizeComparableText(v), normalizedDistance: normalizeComparableText(v), distanceValue: parseDistanceValue(v) }));
        }
        return campaignCategories.map((cat, i) => {
            const distance = String(cat?.distance || '').trim();
            const name = String(cat?.name || '').trim();
            const nd = normalizeComparableText(distance);
            const nn = normalizeComparableText(name);
            return { key: `${nd || nn || i + 1}-${i}`, label: distance || name || `Category ${i + 1}`, normalizedDistance: nd, normalizedName: nn, distanceValue: parseDistanceValue(distance || name) };
        }).filter(c => Boolean(c.label));
    }, [campaign, runners, language]);

    const resolveRunnerCategoryKey = useCallback((runner: Runner): string => {
        if (!categories.length) return runner.category;
        const rc = normalizeComparableText(runner.category);
        const rd = parseDistanceValue(runner.category);
        for (const cat of categories) {
            if (rc && (rc === cat.normalizedName || rc === cat.normalizedDistance || rc.includes(cat.normalizedName) || rc.includes(cat.normalizedDistance) || cat.normalizedName.includes(rc) || cat.normalizedDistance.includes(rc))) return cat.key;
            if (rd !== null && cat.distanceValue !== null && Math.abs(rd - cat.distanceValue) < 0.001) return cat.key;
        }
        return runner.category;
    }, [categories]);

    const filteredRunners = useMemo(() => {
        return runners
            .filter(runner => {
                const matchesSearch = !searchQuery || runner.firstName?.toLowerCase().includes(searchQuery.toLowerCase()) || runner.lastName?.toLowerCase().includes(searchQuery.toLowerCase()) || runner.bib?.includes(searchQuery);
                const matchesGender = filterGender === 'ALL' || runner.gender === filterGender;
                const matchesCategory = filterCategory === 'ALL' || resolveRunnerCategoryKey(runner) === filterCategory;
                return matchesSearch && matchesGender && matchesCategory;
            })
            .sort((a, b) => {
                const statusOrder: Record<string, number> = { 'finished': 0, 'in_progress': 1, 'not_started': 2, 'dns': 3, 'dnf': 4 };
                const sd = (statusOrder[a.status] ?? 5) - (statusOrder[b.status] ?? 5);
                if (sd !== 0) return sd;
                if (a.overallRank && b.overallRank) return a.overallRank - b.overallRank;
                return 0;
            });
    }, [runners, searchQuery, filterGender, filterCategory, resolveRunnerCategoryKey]);

    const handleViewRunner = (runner: Runner) => {
        setSelectedRunner(runner);
        fetchRunnerTimings(runner._id);
    };

    // Loading state
    if (loading) {
        return (
            <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f8fafc', fontFamily: "'Inter', 'Prompt', sans-serif" }}>
                <div style={{ textAlign: 'center' }}>
                    <div style={{ width: 40, height: 40, border: '3px solid #e2e8f0', borderTopColor: '#22c55e', borderRadius: '50%', animation: 'spin 1s linear infinite', margin: '0 auto 16px' }} />
                    <p style={{ color: '#94a3b8', fontSize: 14 }}>{language === 'th' ? 'กำลังโหลด...' : 'Loading...'}</p>
                    <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
                </div>
            </div>
        );
    }

    if (error || !campaign) {
        return (
            <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f8fafc', fontFamily: "'Inter', 'Prompt', sans-serif" }}>
                <div style={{ textAlign: 'center', padding: 32, background: '#fff', borderRadius: 16, boxShadow: '0 4px 24px rgba(0,0,0,0.08)', maxWidth: 400 }}>
                    <div style={{ fontSize: 48, marginBottom: 16 }}>😔</div>
                    <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 8, color: '#0f172a' }}>{language === 'th' ? 'ไม่พบข้อมูล' : 'Not Found'}</h2>
                    <p style={{ color: '#94a3b8', marginBottom: 16 }}>{error}</p>
                    <Link href="/" style={{ display: 'inline-block', padding: '8px 24px', borderRadius: 8, background: '#22c55e', color: '#fff', fontWeight: 600, textDecoration: 'none' }}>
                        {language === 'th' ? 'กลับหน้าแรก' : 'Back'}
                    </Link>
                </div>
            </div>
        );
    }

    return (
        <div style={{ minHeight: '100vh', overflow: 'hidden', background: '#f8fafc', color: '#1e293b', fontFamily: "'Inter', 'Prompt', sans-serif" }}>
            <style>{`
                @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&family=Prompt:wght@400;500;600;700&display=swap');
                @keyframes pulseLive { 0% { transform: scale(0.9); opacity: 0.7; } 50% { transform: scale(1.2); opacity: 1; } 100% { transform: scale(0.9); opacity: 0.7; } }
                .live-dot { width: 8px; height: 8px; border-radius: 50%; display: inline-block; animation: pulseLive 1.5s infinite; border: 1.5px solid white; }
                .runner-row:hover { background-color: #f0fdf4 !important; border-left-color: #22c55e !important; }
                .table-scroll::-webkit-scrollbar { display: none; }
                .table-scroll { scrollbar-width: none; }
            `}</style>

            {/* ===== HEADER ===== */}
            <header style={{ background: '#fff', borderBottom: '1px solid #e2e8f0', padding: '8px 16px', boxShadow: '0 1px 3px rgba(0,0,0,0.04)', position: 'relative', zIndex: 30 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', maxWidth: '100%' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        <span style={{ fontSize: 18, fontWeight: 900, fontStyle: 'italic', color: '#0f172a', borderRight: '1px solid #e2e8f0', paddingRight: 12 }}>
                            ACTION <span style={{ color: '#22c55e', fontWeight: 700, fontStyle: 'normal', textTransform: 'uppercase' }}>Live</span>
                        </span>
                        <div>
                            <h1 style={{ fontSize: 14, fontWeight: 700, lineHeight: 1.2, margin: 0, color: '#0f172a' }}>{campaign.name}</h1>
                            <p style={{ fontSize: 10, color: '#94a3b8', fontWeight: 500, margin: 0 }}>
                                {formatDate(campaign.eventDate)} | {campaign.location}
                            </p>
                        </div>
                    </div>

                    <div style={{ display: 'flex', gap: 16, fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', alignItems: 'center', padding: '6px 12px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', color: '#64748b' }}>
                            Started: <span style={{ color: '#0f172a', marginLeft: 4 }}>{stats.started}</span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', color: '#22c55e' }}>
                            <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#22c55e', marginRight: 6 }} />
                            Racing: <span style={{ color: '#0f172a', marginLeft: 4 }}>{stats.racing}</span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', color: '#3b82f6' }}>
                            <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#3b82f6', marginRight: 6 }} />
                            Fin: <span style={{ color: '#0f172a', marginLeft: 4 }}>{stats.finished}</span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', color: '#ef4444' }}>
                            <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#ef4444', marginRight: 6 }} />
                            DNF: <span style={{ color: '#0f172a', marginLeft: 4 }}>{stats.dnf}</span>
                        </div>
                    </div>
                </div>
            </header>

            {/* ===== FILTER BAR ===== */}
            <div style={{ background: '#fff', borderBottom: '1px solid #e2e8f0', padding: '8px 16px', display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                {/* Distance filter */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={{ fontSize: 10, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>
                        {language === 'th' ? 'ประเภท:' : 'Distance:'}
                    </span>
                    <div style={{ display: 'flex', gap: 6 }}>
                        <button
                            onClick={() => setFilterCategory('ALL')}
                            style={{
                                padding: '6px 14px', borderRadius: 20, fontSize: 11, fontWeight: 700, cursor: 'pointer', transition: 'all 0.2s', border: '1px solid',
                                ...(filterCategory === 'ALL'
                                    ? { background: '#1e293b', color: '#fff', borderColor: '#1e293b' }
                                    : { background: '#fff', color: '#64748b', borderColor: '#e2e8f0' })
                            }}
                        >
                            {language === 'th' ? 'ทั้งหมด' : 'ALL'}
                        </button>
                        {categories.map(cat => (
                            <button
                                key={cat.key}
                                onClick={() => setFilterCategory(cat.key)}
                                style={{
                                    padding: '6px 14px', borderRadius: 20, fontSize: 11, fontWeight: 700, cursor: 'pointer', transition: 'all 0.2s', border: '1px solid',
                                    ...(filterCategory === cat.key
                                        ? { background: '#1e293b', color: '#fff', borderColor: '#1e293b' }
                                        : { background: '#fff', color: '#64748b', borderColor: '#e2e8f0' })
                                }}
                            >
                                {cat.label}
                            </button>
                        ))}
                    </div>
                </div>

                {/* Right controls */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    {/* Gender Filter */}
                    <div style={{ display: 'flex', background: '#f1f5f9', padding: 3, borderRadius: 8 }}>
                        {(['ALL', 'M', 'F'] as const).map(g => (
                            <button
                                key={g}
                                onClick={() => setFilterGender(g)}
                                style={{
                                    padding: '4px 12px', fontSize: 10, fontWeight: 700, borderRadius: 6, border: 'none', cursor: 'pointer', transition: 'all 0.2s', whiteSpace: 'nowrap',
                                    ...(filterGender === g
                                        ? { background: '#1e293b', color: '#fff' }
                                        : { background: 'transparent', color: '#64748b' })
                                }}
                            >
                                {g === 'ALL' ? (language === 'th' ? 'ทั้งหมด' : 'All') : g === 'M' ? (language === 'th' ? 'ชาย' : 'Male') : (language === 'th' ? 'หญิง' : 'Female')}
                            </button>
                        ))}
                    </div>

                    {/* Search */}
                    <div style={{ position: 'relative' }}>
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2" style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)' }}>
                            <circle cx="11" cy="11" r="8" /><path d="M21 21l-4.35-4.35" />
                        </svg>
                        <input
                            type="text"
                            placeholder={language === 'th' ? 'BIB หรือ ชื่อ...' : 'BIB or Name...'}
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            style={{ paddingLeft: 30, paddingRight: 16, paddingTop: 6, paddingBottom: 6, background: '#f1f5f9', border: 'none', borderRadius: 8, fontSize: 12, width: 180, outline: 'none', color: '#0f172a' }}
                        />
                    </div>

                    {/* Column dropdown */}
                    <div style={{ position: 'relative' }}>
                        <button
                            onClick={() => setShowColDropdown(!showColDropdown)}
                            style={{ background: '#fff', border: '1px solid #e2e8f0', color: '#64748b', padding: '6px 12px', borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}
                        >
                            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" /><rect x="3" y="14" width="7" height="7" /><rect x="14" y="14" width="7" height="7" /></svg>
                            {language === 'th' ? 'คอลัมน์' : 'Columns'}
                        </button>
                        {showColDropdown && (
                            <div style={{ position: 'absolute', right: 0, top: 36, background: '#fff', minWidth: 160, boxShadow: '0 8px 16px rgba(0,0,0,0.1)', borderRadius: 8, zIndex: 30, border: '1px solid #e2e8f0', padding: 8 }}>
                                <p style={{ fontSize: 10, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', marginBottom: 4, padding: '0 8px' }}>Display</p>
                                <label style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 8px', fontSize: 12, cursor: 'pointer' }}>
                                    <input type="checkbox" checked={showGenRank} onChange={e => setShowGenRank(e.target.checked)} /> Gender Rank
                                </label>
                                <label style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 8px', fontSize: 12, cursor: 'pointer' }}>
                                    <input type="checkbox" checked={showCatRank} onChange={e => setShowCatRank(e.target.checked)} /> Category Rank
                                </label>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* ===== TABLE ===== */}
            <main style={{ padding: '0 16px' }}>
                <div className="table-scroll" style={{ background: '#fff', borderRadius: '0 0 12px 12px', boxShadow: '0 1px 3px rgba(0,0,0,0.04)', border: '1px solid #e2e8f0', borderTop: 'none', height: 'calc(100vh - 140px)', overflowY: 'auto' }}>
                    <table style={{ width: '100%', textAlign: 'left', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
                        <thead>
                            <tr style={{ fontSize: 10, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '-0.02em', position: 'sticky', top: 0, background: '#fff', zIndex: 20, borderBottom: '2px solid #f1f5f9' }}>
                                <th style={{ padding: '12px 12px', textAlign: 'center', width: '4%' }}>Rank</th>
                                {showGenRank && <th style={{ padding: '12px 6px', textAlign: 'center', width: '3.5%' }}>Gen</th>}
                                {showCatRank && <th style={{ padding: '12px 6px', textAlign: 'center', width: '3.5%' }}>Cat</th>}
                                <th style={{ padding: '12px 8px', width: '22%' }}>{language === 'th' ? 'นักวิ่ง' : 'Runner'}</th>
                                <th style={{ padding: '12px 6px', textAlign: 'center', width: '4%' }}>{language === 'th' ? 'เพศ' : 'Gender'}</th>
                                <th style={{ padding: '12px 8px', width: '12%' }}>{language === 'th' ? 'สถานะ / จุดล่าสุด' : 'Status / Last CP'}</th>
                                <th style={{ padding: '12px 8px', width: '12%' }}>{language === 'th' ? 'จุดถัดไป / คาดการณ์' : 'Next CP / Prediction'}</th>
                                <th style={{ padding: '12px 8px', width: '8%' }}>{language === 'th' ? 'เวลา' : 'Time'}</th>
                                <th style={{ padding: '12px 8px', width: '8%' }}>{language === 'th' ? 'คาดเวลาจบ' : 'Est. Finish'}</th>
                                <th style={{ padding: '12px 12px', textAlign: 'right', width: '10%' }}>Progress</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filteredRunners.length === 0 ? (
                                <tr><td colSpan={showGenRank && showCatRank ? 10 : showGenRank || showCatRank ? 9 : 8} style={{ padding: '48px 16px', textAlign: 'center', color: '#94a3b8', fontSize: 14 }}>
                                    {language === 'th' ? 'ไม่พบข้อมูลผู้เข้าแข่งขัน' : 'No participants found'}
                                </td></tr>
                            ) : (
                                filteredRunners.map((runner, idx) => {
                                    const rank = runner.overallRank || idx + 1;
                                    const displayName = language === 'th' && runner.firstNameTh
                                        ? `${runner.firstNameTh} ${runner.lastNameTh || ''}`
                                        : `${runner.firstName} ${runner.lastName}`;
                                    const initials = getInitials(runner.firstName, runner.lastName);
                                    const avatarBg = getAvatarColor(runner.firstName + runner.lastName);
                                    const statusColor = getStatusColor(runner.status);

                                    // Calculate progress percentage
                                    let progressPct = 0;
                                    if (runner.status === 'finished') {
                                        progressPct = 100;
                                    } else if (runner.status === 'in_progress') {
                                        // Estimate from checkpoint position or elapsed time
                                        progressPct = runner.latestCheckpoint ? 50 : 10; // Default estimate
                                    } else if (runner.status === 'dnf') {
                                        progressPct = runner.latestCheckpoint ? 40 : 0;
                                    }

                                    // Progress bar color based on percentage with gradient
                                    const getProgressColor = (pct: number) => {
                                        if (pct <= 25) return '#334155'; // dark/black
                                        if (pct <= 50) return '#ef4444'; // red
                                        if (pct <= 75) return '#eab308'; // yellow/amber
                                        return '#22c55e'; // green
                                    };
                                    const progressColor = getProgressColor(progressPct);

                                    // Est. finish (placeholder based on status)
                                    const estFinish = runner.status === 'finished' ? '--:--:--'
                                        : runner.status === 'in_progress' ? (runner.netTime ? `~ ${formatTime(runner.netTime)}` : '-')
                                            : '--:--';

                                    return (
                                        <tr
                                            key={runner._id}
                                            className="runner-row"
                                            onClick={() => handleViewRunner(runner)}
                                            style={{ cursor: 'pointer', transition: 'all 0.15s', borderBottom: '1px solid #f8fafc', borderLeft: '4px solid transparent' }}
                                        >
                                            {/* Rank */}
                                            <td style={{ padding: '12px 12px', textAlign: 'center' }}>
                                                <span style={{ fontSize: 16, fontWeight: 900, color: rank <= 3 ? (rank === 1 ? '#22c55e' : '#334155') : '#cbd5e1' }}>{rank}</span>
                                            </td>
                                            {/* Gen Rank */}
                                            {showGenRank && (
                                                <td style={{ padding: '12px 6px', textAlign: 'center' }}>
                                                    <span style={{ fontSize: 12, fontWeight: 700, color: '#64748b' }}>{runner.genderRank || '-'}</span>
                                                </td>
                                            )}
                                            {/* Cat Rank */}
                                            {showCatRank && (
                                                <td style={{ padding: '12px 6px', textAlign: 'center' }}>
                                                    <span style={{ fontSize: 12, fontWeight: 700, color: '#64748b' }}>{runner.categoryRank || '-'}</span>
                                                </td>
                                            )}
                                            {/* Runner */}
                                            <td style={{ padding: '12px 8px', overflow: 'hidden' }}>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                                    <div style={{ position: 'relative', flexShrink: 0 }}>
                                                        <div style={{ width: 32, height: 32, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 700, fontSize: 12, background: avatarBg }}>
                                                            {initials}
                                                        </div>
                                                        {runner.status === 'in_progress' && (
                                                            <span className="live-dot" style={{ background: '#22c55e', position: 'absolute', bottom: -1, right: -1 }} />
                                                        )}
                                                    </div>
                                                    <div style={{ overflow: 'hidden' }}>
                                                        <span style={{ display: 'block', fontWeight: 700, fontSize: 13, color: '#0f172a', lineHeight: 1, textTransform: 'uppercase', marginBottom: 3, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                                            {displayName.trim()}
                                                        </span>
                                                        <span style={{ fontSize: 10, color: '#94a3b8', fontWeight: 500, display: 'flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap' }}>
                                                            <span style={{
                                                                background: '#0f172a', color: '#f8fafc', padding: '1px 6px', borderRadius: 4, fontSize: 10, fontWeight: 800, letterSpacing: '0.05em', border: '1px solid #334155'
                                                            }}>
                                                                #{runner.bib}
                                                            </span>
                                                            {runner.nationality ? `${runner.nationality} | ` : ''}{runner.ageGroup || runner.category}
                                                        </span>
                                                    </div>
                                                </div>
                                            </td>
                                            {/* Gender */}
                                            <td style={{ padding: '12px 6px', textAlign: 'center', fontSize: 10, fontWeight: 700, color: runner.gender === 'M' ? '#3b82f6' : '#ec4899' }}>
                                                {runner.gender}
                                            </td>
                                            {/* Status / Last CP */}
                                            <td style={{ padding: '12px 8px' }}>
                                                <span style={{ display: 'inline-block', padding: '2px 8px', borderRadius: 4, fontWeight: 700, fontSize: 10, color: '#fff', background: getStatusBgColor(runner.status), lineHeight: 1.4, marginBottom: 3 }}>
                                                    {getStatusLabel(runner.status)}
                                                </span>
                                                <span style={{ display: 'block', fontSize: 10, color: '#94a3b8', textTransform: 'uppercase', fontWeight: 500, marginTop: 2 }}>
                                                    {runner.latestCheckpoint || '-'}
                                                </span>
                                            </td>
                                            {/* Next CP / Prediction */}
                                            <td style={{ padding: '12px 8px' }}>
                                                {runner.status === 'in_progress' ? (
                                                    <>
                                                        <span style={{ display: 'block', fontWeight: 700, fontSize: 11, color: '#0f172a', lineHeight: 1, marginBottom: 3 }}>
                                                            {runner.latestCheckpoint ? '→ Next' : '→ START'}
                                                        </span>
                                                        <span style={{ fontSize: 10, color: '#3b82f6', fontWeight: 600 }}>
                                                            {runner.elapsedTime ? `~${formatTime(Math.round(runner.elapsedTime * 1.15))}` : '-'}
                                                        </span>
                                                    </>
                                                ) : runner.status === 'finished' ? (
                                                    <span style={{ fontSize: 10, color: '#22c55e', fontWeight: 700 }}>✓ DONE</span>
                                                ) : (
                                                    <span style={{ fontSize: 10, color: '#94a3b8' }}>-</span>
                                                )}
                                            </td>
                                            {/* Time */}
                                            <td style={{ padding: '12px 8px' }}>
                                                <span style={{ fontSize: 14, fontWeight: 700, color: '#0f172a' }}>
                                                    {formatTime(runner.elapsedTime || runner.netTime)}
                                                </span>
                                            </td>
                                            {/* Est. Finish */}
                                            <td style={{ padding: '12px 8px' }}>
                                                <span style={{ fontSize: 11, fontWeight: 700, color: runner.status === 'in_progress' ? '#3b82f6' : '#94a3b8' }}>
                                                    {estFinish}
                                                </span>
                                            </td>
                                            {/* Progress */}
                                            <td style={{ padding: '12px 12px', textAlign: 'right' }}>
                                                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
                                                    <span style={{ fontWeight: 700, fontSize: 11, color: '#334155', marginBottom: 4 }}>
                                                        {progressPct}%
                                                    </span>
                                                    <div style={{ width: '100%', maxWidth: 80, height: 6, borderRadius: 3, background: '#f1f5f9', overflow: 'hidden' }}>
                                                        <div style={{
                                                            height: '100%',
                                                            width: `${progressPct}%`,
                                                            borderRadius: 3,
                                                            background: progressPct > 75
                                                                ? 'linear-gradient(90deg, #334155 0%, #ef4444 33%, #eab308 66%, #22c55e 100%)'
                                                                : progressPct > 50
                                                                    ? 'linear-gradient(90deg, #334155 0%, #ef4444 50%, #eab308 100%)'
                                                                    : progressPct > 25
                                                                        ? 'linear-gradient(90deg, #334155 0%, #ef4444 100%)'
                                                                        : '#334155',
                                                            transition: 'width 0.5s ease',
                                                        }} />
                                                    </div>
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

            {/* ===== FOOTER ===== */}
            <footer style={{ background: '#fff', borderTop: '1px solid #e2e8f0', padding: '8px 16px', position: 'fixed', bottom: 0, width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center', zIndex: 30 }}>
                <p style={{ fontSize: 9, fontWeight: 700, color: '#cbd5e1', textTransform: 'uppercase', letterSpacing: '0.1em', margin: 0 }}>
                    ACTION TIMING &copy; 2026
                </p>
                <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
                    <span style={{ fontSize: 9, fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>
                        {filteredRunners.length} / {runners.length} {language === 'th' ? 'คน' : 'runners'}
                    </span>
                    <span style={{ fontSize: 9, fontWeight: 700, color: '#22c55e', textTransform: 'uppercase' }}>
                        <span style={{ display: 'inline-block', width: 5, height: 5, borderRadius: '50%', background: '#22c55e', marginRight: 4, animation: 'pulseLive 1.5s infinite' }} />
                        Connected
                    </span>
                    <span style={{ fontSize: 10, fontFamily: 'monospace', color: '#94a3b8' }}>
                        {currentTime.toLocaleTimeString(language === 'th' ? 'th-TH' : 'en-US')}
                    </span>
                </div>
            </footer>

            {/* ===== RUNNER DETAIL MODAL ===== */}
            {selectedRunner && (
                <div style={{ position: 'fixed', inset: 0, zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)' }} onClick={() => setSelectedRunner(null)}>
                    <div style={{ background: '#fff', borderRadius: 16, padding: 24, maxWidth: 480, width: '100%', maxHeight: '80vh', overflowY: 'auto', boxShadow: '0 24px 48px rgba(0,0,0,0.15)' }} onClick={e => e.stopPropagation()}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                                <div style={{ width: 48, height: 48, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 800, fontSize: 18, background: getAvatarColor(selectedRunner.firstName + selectedRunner.lastName) }}>
                                    {getInitials(selectedRunner.firstName, selectedRunner.lastName)}
                                </div>
                                <div>
                                    <h3 style={{ fontSize: 18, fontWeight: 800, margin: 0, color: '#0f172a', textTransform: 'uppercase' }}>
                                        {selectedRunner.firstName} {selectedRunner.lastName}
                                    </h3>
                                    <span style={{ background: '#0f172a', color: '#f8fafc', padding: '2px 8px', borderRadius: 4, fontSize: 11, fontWeight: 800 }}>
                                        BIB #{selectedRunner.bib}
                                    </span>
                                </div>
                            </div>
                            <button onClick={() => setSelectedRunner(null)} style={{ fontSize: 24, color: '#94a3b8', background: 'none', border: 'none', cursor: 'pointer', padding: 4 }}>×</button>
                        </div>

                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 16 }}>
                            {[
                                { label: language === 'th' ? 'สถานะ' : 'Status', value: getStatusLabel(selectedRunner.status), color: getStatusColor(selectedRunner.status) },
                                { label: language === 'th' ? 'ประเภท' : 'Category', value: selectedRunner.category },
                                { label: language === 'th' ? 'กลุ่มอายุ' : 'Age Group', value: selectedRunner.ageGroup || '-' },
                                { label: language === 'th' ? 'เพศ' : 'Gender', value: selectedRunner.gender === 'M' ? (language === 'th' ? 'ชาย' : 'Male') : (language === 'th' ? 'หญิง' : 'Female') },
                                { label: language === 'th' ? 'อันดับรวม' : 'Overall Rank', value: selectedRunner.overallRank || '-' },
                                { label: language === 'th' ? 'อันดับเพศ' : 'Gender Rank', value: selectedRunner.genderRank || '-' },
                                { label: language === 'th' ? 'เวลาสุทธิ' : 'Net Time', value: formatTime(selectedRunner.netTime) },
                                { label: language === 'th' ? 'ทีม' : 'Team', value: selectedRunner.team || selectedRunner.teamName || '-' },
                            ].map((item, i) => (
                                <div key={i} style={{ padding: '8px 10px', borderRadius: 8, background: '#f8fafc' }}>
                                    <div style={{ fontSize: 10, color: '#94a3b8', fontWeight: 600, marginBottom: 2 }}>{item.label}</div>
                                    <div style={{ fontSize: 13, fontWeight: 700, color: (item as any).color || '#0f172a' }}>{String(item.value)}</div>
                                </div>
                            ))}
                        </div>

                        {/* Timing Records */}
                        {runnerTimings.length > 0 && (
                            <div>
                                <h4 style={{ fontSize: 13, fontWeight: 700, marginBottom: 8, color: '#0f172a' }}>
                                    {language === 'th' ? '⏱ บันทึกเวลา' : '⏱ Timing Records'}
                                </h4>
                                <div style={{ borderRadius: 8, overflow: 'hidden', border: '1px solid #e2e8f0' }}>
                                    {runnerTimings.map((record, i) => (
                                        <div key={record._id} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 12px', fontSize: 12, background: i % 2 === 0 ? '#f8fafc' : '#fff' }}>
                                            <span style={{ color: '#64748b', fontWeight: 600 }}>{record.checkpoint}</span>
                                            <span style={{ fontFamily: 'monospace', fontWeight: 700, color: '#0f172a' }}>
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
