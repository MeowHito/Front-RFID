'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useEffect, useState, useMemo, useRef, useCallback } from 'react';
import { useParams } from 'next/navigation';

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

interface AgeGroupConfig {
    name: string;
    minAge: number;
    maxAge: number;
    gender: 'male' | 'female';
    active: boolean;
}

interface Campaign {
    _id: string;
    name: string;
    nameTh?: string;
    nameEn?: string;
    slug?: string;
    uuid?: string;
    categories?: { name: string; distance?: string; ageGroups?: AgeGroupConfig[] }[];
    excludeOverallFromAgeGroup?: number;
}

interface AgeGroupBucket {
    label: string;
    min: number;
    max: number;
}

const DEFAULT_AGE_GROUPS: AgeGroupBucket[] = [
    { label: '1-18', min: 0, max: 18 },
    { label: '19-29', min: 19, max: 29 },
    { label: '30-39', min: 30, max: 39 },
    { label: '40-49', min: 40, max: 49 },
    { label: '50-59', min: 50, max: 59 },
    { label: '60+', min: 60, max: 999 },
];

function normalizeAgeGroupLabel(value?: string | null): string {
    return String(value || '')
        .replace(/^[MF]\s*/i, '')
        .replace(/\s*ปี$/i, '')
        .trim();
}

function parseAgeGroupBucket(value?: string | null): AgeGroupBucket | null {
    const label = normalizeAgeGroupLabel(value);
    if (!label) return null;

    const rangeMatch = label.match(/(\d+)\s*-\s*(\d+)/);
    if (rangeMatch) {
        return {
            label,
            min: parseInt(rangeMatch[1]),
            max: parseInt(rangeMatch[2]),
        };
    }

    const underMatch = label.match(/(?:u|under)\s*(\d+)/i);
    if (underMatch) {
        const max = parseInt(underMatch[1]) - 1;
        return {
            label,
            min: 0,
            max: max >= 0 ? max : 0,
        };
    }

    const plusMatch = label.match(/(\d+)\s*\+/);
    if (plusMatch) {
        return {
            label,
            min: parseInt(plusMatch[1]),
            max: 999,
        };
    }

    return null;
}

function buildAgeGroupsFromConfig(ageGroups: AgeGroupConfig[]): AgeGroupBucket[] {
    // Extract unique age ranges (deduplicate male/female pairs)
    const seen = new Map<string, AgeGroupBucket>();
    for (const g of ageGroups) {
        if (!g.active) continue;
        const key = `${g.minAge}-${g.maxAge}`;
        if (!seen.has(key)) {
            const isOpenEnd = g.maxAge >= 99;
            const label = isOpenEnd ? `${g.minAge}+` : `${g.minAge}-${g.maxAge}`;
            seen.set(key, { label, min: g.minAge, max: g.maxAge });
        }
    }
    const buckets = Array.from(seen.values());
    // Sort by minAge ascending
    buckets.sort((a, b) => a.min - b.min);
    return buckets.length > 0 ? buckets : DEFAULT_AGE_GROUPS;
}

function buildAgeGroupsFromRunners(runners: Runner[]): AgeGroupBucket[] {
    const seen = new Map<string, AgeGroupBucket>();
    for (const runner of runners) {
        const bucket = parseAgeGroupBucket(runner.ageGroup);
        if (!bucket) continue;
        const key = bucket.label.toLowerCase();
        if (!seen.has(key)) {
            seen.set(key, bucket);
        }
    }
    return Array.from(seen.values()).sort((a, b) => {
        if (a.min !== b.min) return a.min - b.min;
        if (a.max !== b.max) return a.max - b.max;
        return a.label.localeCompare(b.label, undefined, { numeric: true, sensitivity: 'base' });
    });
}

const TOP_N = 5;

function formatTime(ms: number | undefined | null): string {
    if (ms === undefined || ms === null || ms <= 0) return '-';
    const hours = Math.floor(ms / 3600000);
    const minutes = Math.floor((ms % 3600000) / 60000);
    const seconds = Math.floor((ms % 60000) / 1000);
    return `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

function resolveAgeGroup(runner: Runner, ageGroups: AgeGroupBucket[]): string {
    const ag = normalizeAgeGroupLabel(runner.ageGroup);
    const exactMatch = ageGroups.find(g => normalizeAgeGroupLabel(g.label).toLowerCase() === ag.toLowerCase());
    if (exactMatch) return exactMatch.label;
    // Try to parse age range like "30-39"
    const rangeMatch = ag.match(/(\d+)\s*-\s*(\d+)/);
    if (rangeMatch) {
        const lo = parseInt(rangeMatch[1]);
        for (const g of ageGroups) {
            if (lo >= g.min && lo <= g.max) return g.label;
        }
    }
    // Try from age field
    if (runner.age) {
        for (const g of ageGroups) {
            if (runner.age >= g.min && runner.age <= g.max) return g.label;
        }
    }
    if (ag.toLowerCase().includes('u18') || ag.toLowerCase().includes('under')) return ageGroups[0]?.label || 'Unknown';
    if (ag.includes('+') || ag.includes('60') || ag.includes('70')) return ageGroups[ageGroups.length - 1]?.label || 'Unknown';
    return 'Unknown';
}

const REFRESH_INTERVAL = 15; // seconds

export default function ResultWinnersBySlugPage() {
    const params = useParams();
    const slug = params.slug as string;

    const [campaign, setCampaign] = useState<Campaign | null>(null);
    const [campaignNotFound, setCampaignNotFound] = useState(false);
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

    // Load campaign by slug
    useEffect(() => {
        if (!slug) return;
        (async () => {
            try {
                const res = await fetch(`/api/campaigns/${encodeURIComponent(slug)}`, { cache: 'no-store' });
                if (res.ok) {
                    const data = await res.json();
                    if (data?._id) {
                        setCampaign(data);
                        if (data.categories?.length > 0) {
                            setSelectedCategory(data.categories[0].name);
                        }
                    } else {
                        setCampaignNotFound(true);
                    }
                } else {
                    setCampaignNotFound(true);
                }
            } catch {
                setCampaignNotFound(true);
            } finally {
                setLoading(false);
            }
        })();
    }, [slug]);

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

    // Derive active age groups from selected category's config
    const activeAgeGroups = useMemo(() => {
        const syncedAgeGroups = buildAgeGroupsFromRunners(runners);
        if (syncedAgeGroups.length > 0) return syncedAgeGroups;
        if (!campaign?.categories || !selectedCategory) return DEFAULT_AGE_GROUPS;
        const cat = campaign.categories.find(c => c.name === selectedCategory);
        if (!cat?.ageGroups || cat.ageGroups.length === 0) return DEFAULT_AGE_GROUPS;
        return buildAgeGroupsFromConfig(cat.ageGroups);
    }, [campaign, selectedCategory, runners]);

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
        for (const g of activeAgeGroups) { maleWinners[g.label] = []; femaleWinners[g.label] = []; }

        for (const runner of sorted) {
            if (excludedBibs.has(runner.bib)) continue;
            const ag = resolveAgeGroup(runner, activeAgeGroups);
            const bucket = runner.gender === 'F' ? femaleWinners : maleWinners;
            if (bucket[ag] && bucket[ag].length < TOP_N) {
                bucket[ag].push(runner);
            }
        }
        return { maleWinners, femaleWinners };
    }, [runners, campaign, activeAgeGroups]);

    const rankBg = ['#f59e0b', '#9ca3af', '#92400e', '#e2e8f0', '#e2e8f0'];
    const rankFg = ['#000', '#fff', '#fff', '#475569', '#475569'];

    // Campaign not found
    if (campaignNotFound) {
        return (
            <div style={{
                fontFamily: "'Prompt', 'Inter', sans-serif", background: '#0f172a',
                height: '100vh', display: 'flex', flexDirection: 'column',
                alignItems: 'center', justifyContent: 'center',
            }}>
                <div style={{ fontSize: 80, marginBottom: 24 }}>❌</div>
                <div style={{ fontSize: 28, fontWeight: 900, color: '#ef4444', marginBottom: 8 }}>ไม่พบกิจกรรม</div>
                <div style={{ fontSize: 16, color: '#94a3b8' }}>Campaign Not Found — กรุณาตรวจสอบลิงก์อีกครั้ง</div>
                <div style={{ fontSize: 14, color: '#64748b', marginTop: 20 }}>slug: {slug}</div>
            </div>
        );
    }

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
        <div style={{ display: 'flex', flexDirection: 'column', gap: isMobile ? 8 : '0.6vh', minHeight: 0, flex: 1, overflowY: isMobile ? 'visible' : 'auto', paddingRight: isMobile ? 0 : 4 }}>
            <div style={{ padding: isMobile ? '8px 0' : '0.7vh 0', fontWeight: 900, fontSize: isMobile ? 16 : '2vh', textAlign: 'center', textTransform: 'uppercase', borderRadius: 8, color: 'white', letterSpacing: 2, background: bgHeader, flexShrink: 0 }}>
                {title}
            </div>
            {activeAgeGroups.map(g => {
                const list = winners[g.label] || [];
                // Always render TOP_N rows — fill empties
                const rows = Array.from({ length: TOP_N }, (_, i) => i);
                return (
                    <div key={g.label} style={{ background: 'white', border: '1px solid #e2e8f0', borderRadius: 8, overflow: 'hidden', display: 'flex', flexDirection: 'column', flexShrink: 0, minHeight: isMobile ? 150 : '18vh' }}>
                        <div style={{ background: bgAgeHeader, color: 'white', fontWeight: 800, fontSize: isMobile ? 13 : '1.5vh', padding: isMobile ? '4px 12px' : '0.25vh 12px', textAlign: 'center', flexShrink: 0 }}>
                            {g.label}
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'flex-start', flex: 1, padding: isMobile ? '4px' : '0.25vh 4px', minHeight: 0 }}>
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
