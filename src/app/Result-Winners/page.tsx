'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useEffect, useState, useMemo, useRef, useCallback } from 'react';

interface Runner {
    _id: string;
    bib: string;
    firstName: string;
    lastName: string;
    gender: string;
    category: string;
    ageGroup?: string;
    age?: number;
    status: string;
    netTime?: number;
    gunTime?: number;
    elapsedTime?: number;
    netTimeStr?: string;
    gunTimeStr?: string;
    overallRank?: number;
    genderRank?: number;
    categoryRank?: number;
}

interface Campaign {
    _id: string;
    name: string;
    nameTh?: string;
    nameEn?: string;
    slug?: string;
    uuid?: string;
    categories?: { name: string; distance?: string }[];
    excludeOverallFromAgeGroup?: number;
}

const AGE_GROUPS = [
    { label: '1-18 ปี', min: 0, max: 18 },
    { label: '19-29 ปี', min: 19, max: 29 },
    { label: '30-39 ปี', min: 30, max: 39 },
    { label: '40-49 ปี', min: 40, max: 49 },
    { label: '50-59 ปี', min: 50, max: 59 },
    { label: '60+ ปี', min: 60, max: 999 },
];

const TOP_N = 5;

function formatTime(ms: number | undefined | null): string {
    if (ms === undefined || ms === null || ms <= 0) return '-';
    const hours = Math.floor(ms / 3600000);
    const minutes = Math.floor((ms % 3600000) / 60000);
    const seconds = Math.floor((ms % 60000) / 1000);
    return `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

function resolveAgeGroup(runner: Runner): string {
    const ag = (runner.ageGroup || '').replace(/^[MF]\s*/i, '').trim();
    // Try to parse age range like "30-39"
    const rangeMatch = ag.match(/(\d+)\s*-\s*(\d+)/);
    if (rangeMatch) {
        const lo = parseInt(rangeMatch[1]);
        for (const g of AGE_GROUPS) {
            if (lo >= g.min && lo <= g.max) return g.label;
        }
    }
    // Try from age field
    if (runner.age) {
        for (const g of AGE_GROUPS) {
            if (runner.age >= g.min && runner.age <= g.max) return g.label;
        }
    }
    // Try numeric in ageGroup
    const numMatch = ag.match(/(\d+)/);
    if (numMatch) {
        const n = parseInt(numMatch[1]);
        for (const g of AGE_GROUPS) {
            if (n >= g.min && n <= g.max) return g.label;
        }
    }
    if (ag.toLowerCase().includes('u18') || ag.toLowerCase().includes('under')) return AGE_GROUPS[0].label;
    if (ag.includes('+') || ag.includes('60') || ag.includes('70')) return AGE_GROUPS[5].label;
    return 'Unknown';
}

const REFRESH_INTERVAL = 15; // seconds

export default function ResultWinnersPage() {
    const [campaign, setCampaign] = useState<Campaign | null>(null);
    const [selectedCategory, setSelectedCategory] = useState<string>('');
    const [runners, setRunners] = useState<Runner[]>([]);
    const [loading, setLoading] = useState(true);
    const [countdown, setCountdown] = useState(REFRESH_INTERVAL);
    const [refreshing, setRefreshing] = useState(false);
    const refreshTimerRef = useRef<NodeJS.Timeout | null>(null);
    const countdownRef = useRef<NodeJS.Timeout | null>(null);
    const [isMobile, setIsMobile] = useState(false);

    useEffect(() => {
        const check = () => setIsMobile(window.innerWidth < 768);
        check();
        window.addEventListener('resize', check);
        return () => window.removeEventListener('resize', check);
    }, []);

    // Load featured campaign automatically
    useEffect(() => {
        (async () => {
            try {
                const res = await fetch('/api/campaigns/featured', { cache: 'no-store' });
                if (res.ok) {
                    const data = await res.json();
                    if (data?._id) {
                        setCampaign(data);
                        if (data.categories?.length > 0) {
                            setSelectedCategory(data.categories[0].name);
                        }
                    }
                }
            } catch { /* */ } finally { setLoading(false); }
        })();
    }, []);

    // Load runners — called on campaign/category change + auto-refresh
    const loadRunners = useCallback(async (isRefresh = false) => {
        if (!campaign?._id || !selectedCategory) { setRunners([]); return; }
        if (isRefresh) setRefreshing(true); else setLoading(true);
        try {
            const params = new URLSearchParams({ campaignId: campaign._id, category: selectedCategory, limit: '10000' });
            const res = await fetch(`/api/runners/paged?${params.toString()}`, { cache: 'no-store' });
            if (res.ok) {
                const data = await res.json();
                setRunners(data.data || []);
            }
        } catch { /* */ } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, [campaign, selectedCategory]);

    // Initial load + re-load on campaign/category change
    useEffect(() => {
        loadRunners(false);
    }, [loadRunners]);

    // Auto-refresh every 15 seconds
    useEffect(() => {
        if (!campaign?._id || !selectedCategory) return;
        setCountdown(REFRESH_INTERVAL);

        // Countdown ticker
        countdownRef.current = setInterval(() => {
            setCountdown(prev => (prev <= 1 ? REFRESH_INTERVAL : prev - 1));
        }, 1000);

        // Data refresh
        refreshTimerRef.current = setInterval(() => {
            loadRunners(true);
        }, REFRESH_INTERVAL * 1000);

        return () => {
            if (refreshTimerRef.current) clearInterval(refreshTimerRef.current);
            if (countdownRef.current) clearInterval(countdownRef.current);
        };
    }, [campaign, selectedCategory, loadRunners]);

    // Build winners per gender per age group
    const { maleWinners, femaleWinners } = useMemo(() => {
        const finished = runners.filter(r => r.status === 'finished' && (r.netTime || r.gunTime));
        const sorted = [...finished].sort((a, b) => {
            const at = a.netTime || a.gunTime || a.elapsedTime || Infinity;
            const bt = b.netTime || b.gunTime || b.elapsedTime || Infinity;
            return at - bt;
        });

        // Exclude top N overall winners from age group rankings if configured
        const excludeN = campaign?.excludeOverallFromAgeGroup || 0;
        const excludedBibs = new Set<string>();
        if (excludeN > 0) {
            // Top N overall = first N in sorted list (regardless of gender)
            sorted.slice(0, excludeN).forEach(r => excludedBibs.add(r.bib));
        }

        const maleWinners: Record<string, Runner[]> = {};
        const femaleWinners: Record<string, Runner[]> = {};
        for (const g of AGE_GROUPS) { maleWinners[g.label] = []; femaleWinners[g.label] = []; }

        for (const runner of sorted) {
            if (excludedBibs.has(runner.bib)) continue;
            const ag = resolveAgeGroup(runner);
            const bucket = runner.gender === 'F' ? femaleWinners : maleWinners;
            if (bucket[ag] && bucket[ag].length < TOP_N) {
                bucket[ag].push(runner);
            }
        }
        return { maleWinners, femaleWinners };
    }, [runners, campaign]);

    const rankBg = ['#f59e0b', '#9ca3af', '#92400e', '#e2e8f0', '#e2e8f0'];
    const rankFg = ['#000', '#fff', '#fff', '#475569', '#475569'];

    // Render a single runner row
    const renderRunnerRow = (runner: Runner, idx: number) => (
        <div key={runner._id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: isMobile ? '4px 8px' : '0.3vh 8px', borderRadius: 5, background: idx === 0 ? '#fffbeb' : 'transparent', height: isMobile ? 'auto' : '2.8vh', minHeight: isMobile ? 28 : 22 }}>
            <div style={{ width: isMobile ? 22 : '2.2vh', height: isMobile ? 22 : '2.2vh', minWidth: 18, minHeight: 18, borderRadius: 4, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: isMobile ? 12 : '1.3vh', fontWeight: 900, flexShrink: 0, background: rankBg[idx] || '#e2e8f0', color: rankFg[idx] || '#475569' }}>
                {idx + 1}
            </div>
            <span style={{ fontSize: isMobile ? 12 : '1.35vh', fontWeight: 700, color: '#1e293b', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', flex: 1, textTransform: 'uppercase' }}>
                {runner.firstName} {runner.lastName}
            </span>
            <span style={{ fontFamily: 'monospace', fontWeight: 800, fontSize: isMobile ? 11 : '1.35vh', color: '#1e293b', flexShrink: 0 }}>
                {runner.netTimeStr || formatTime(runner.netTime || runner.gunTime)}
            </span>
        </div>
    );

    // Render an empty placeholder row
    const renderEmptyRow = (idx: number) => (
        <div key={`empty-${idx}`} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: isMobile ? '4px 8px' : '0.3vh 8px', height: isMobile ? 'auto' : '2.8vh', minHeight: isMobile ? 28 : 22 }}>
            <div style={{ width: isMobile ? 22 : '2.2vh', height: isMobile ? 22 : '2.2vh', minWidth: 18, minHeight: 18, borderRadius: 4, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: isMobile ? 12 : '1.3vh', fontWeight: 900, flexShrink: 0, background: '#f1f5f9', color: '#cbd5e1' }}>
                {idx + 1}
            </div>
            <span style={{ fontSize: isMobile ? 11 : '1.2vh', color: '#cbd5e1', fontStyle: 'italic' }}>—</span>
        </div>
    );

    // Render a winners column
    const renderColumn = (title: string, bgHeader: string, bgAgeHeader: string, winners: Record<string, Runner[]>) => (
        <div style={{ display: 'flex', flexDirection: 'column', gap: isMobile ? 8 : '0.4vh', minHeight: 0, flex: 1 }}>
            <div style={{ padding: isMobile ? '8px 0' : '0.7vh 0', fontWeight: 900, fontSize: isMobile ? 16 : '2vh', textAlign: 'center', textTransform: 'uppercase', borderRadius: 8, color: 'white', letterSpacing: 2, background: bgHeader, flexShrink: 0 }}>
                {title}
            </div>
            {AGE_GROUPS.map(g => {
                const list = winners[g.label] || [];
                // Always render TOP_N rows — fill empties
                const rows = Array.from({ length: TOP_N }, (_, i) => i);
                return (
                    <div key={g.label} style={{ background: 'white', border: '1px solid #e2e8f0', borderRadius: 8, overflow: 'hidden', display: 'flex', flexDirection: 'column', flex: isMobile ? undefined : 1, minHeight: 0 }}>
                        <div style={{ background: bgAgeHeader, color: 'white', fontWeight: 800, fontSize: isMobile ? 13 : '1.5vh', padding: isMobile ? '4px 12px' : '0.25vh 12px', textAlign: 'center', flexShrink: 0 }}>
                            {g.label}
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', flex: isMobile ? undefined : 1, padding: isMobile ? '4px' : '0.15vh 4px', minHeight: 0 }}>
                            {rows.map(i => list[i] ? renderRunnerRow(list[i], i) : renderEmptyRow(i))}
                        </div>
                    </div>
                );
            })}
        </div>
    );

    return (
        <div style={{ fontFamily: "'Prompt', 'Inter', sans-serif", background: '#0f172a', height: isMobile ? 'auto' : '100vh', minHeight: '100vh', overflow: isMobile ? 'auto' : 'hidden', display: 'flex', flexDirection: 'column', padding: isMobile ? '8px' : '0.8vh 1vw' }}>
            <style>{`@keyframes pulse { 0%,100% { opacity:1 } 50% { opacity:0.3 } }`}</style>
            {/* Header */}
            <header style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', justifyContent: 'space-between', alignItems: isMobile ? 'stretch' : 'center', padding: isMobile ? '10px 12px' : '0.6vh 1.5vw', background: '#1e293b', borderRadius: 10, marginBottom: isMobile ? 8 : '0.8vh', flexShrink: 0, border: '1px solid #334155', gap: isMobile ? 8 : 0 }}>
                {/* Top row: Logo + refresh */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Link href="/" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <Image src="/logo-white.png" alt="ACTION" width={120} height={40} style={{ height: isMobile ? 28 : '3.5vh', width: 'auto' }} />
                        <span style={{ color: '#22c55e', fontWeight: 900, fontSize: isMobile ? 14 : '2vh', letterSpacing: 2, textTransform: 'uppercase' }}>Winners</span>
                    </Link>

                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        {refreshing && <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: '#22c55e', animation: 'pulse 0.8s ease-in-out infinite' }} />}
                        <span style={{ fontSize: isMobile ? 10 : '1.1vh', color: '#94a3b8', fontFamily: 'monospace' }}>
                            {refreshing ? 'Updating...' : `Refresh ${countdown}s`}
                        </span>
                    </div>
                </div>

                {/* Bottom row on mobile: Campaign name + category tabs */}
                <div style={{ display: 'flex', alignItems: isMobile ? 'stretch' : 'center', gap: isMobile ? 6 : '1vw', flexDirection: isMobile ? 'column' : 'row' }}>
                    {campaign && (
                        <span style={{ fontSize: isMobile ? 11 : '1.3vh', fontWeight: 700, color: '#94a3b8', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: isMobile ? '100%' : '25vw' }}>
                            {campaign.name}
                        </span>
                    )}

                    {campaign?.categories && campaign.categories.length > 0 && (
                        <div style={{ display: 'flex', gap: isMobile ? 6 : '0.4vw', overflowX: 'auto', WebkitOverflowScrolling: 'touch', paddingBottom: isMobile ? 2 : 0 }}>
                            {campaign.categories.map(cat => (
                                <button
                                    key={cat.name}
                                    onClick={() => setSelectedCategory(cat.name)}
                                    style={{
                                        padding: isMobile ? '6px 12px' : '0.4vh 1vw', borderRadius: 6, fontSize: isMobile ? 12 : '1.3vh', fontWeight: 700,
                                        border: selectedCategory === cat.name ? '2px solid #22c55e' : '1px solid #475569',
                                        background: selectedCategory === cat.name ? '#22c55e' : 'transparent',
                                        color: selectedCategory === cat.name ? '#000' : '#cbd5e1',
                                        cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0,
                                    }}
                                >
                                    {cat.name}{cat.distance ? ` (${cat.distance})` : ''}
                                </button>
                            ))}
                        </div>
                    )}
                </div>
            </header>

            {/* Content */}
            {loading ? (
                <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94a3b8', fontSize: isMobile ? 16 : '2vh' }}>
                    Loading...
                </div>
            ) : (
                <div style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', gap: isMobile ? 12 : '1vw', flex: isMobile ? undefined : 1, minHeight: 0, paddingBottom: isMobile ? 16 : 0 }}>
                    {renderColumn('♂ MALE WINNERS', '#2563eb', '#1e3a5f', maleWinners)}
                    {renderColumn('♀ FEMALE WINNERS', '#db2777', '#831843', femaleWinners)}
                </div>
            )}
        </div>
    );
}
