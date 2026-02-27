'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useEffect, useState, useMemo, useRef } from 'react';

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

export default function ResultWinnersPage() {
    const [campaigns, setCampaigns] = useState<Campaign[]>([]);
    const [selectedCampaignId, setSelectedCampaignId] = useState<string>('');
    const [campaign, setCampaign] = useState<Campaign | null>(null);
    const [selectedCategory, setSelectedCategory] = useState<string>('');
    const [runners, setRunners] = useState<Runner[]>([]);
    const [loading, setLoading] = useState(true);
    const [dropdownOpen, setDropdownOpen] = useState(false);
    const dropdownRef = useRef<HTMLDivElement>(null);

    // Close dropdown on outside click
    useEffect(() => {
        function handleClick(e: MouseEvent) {
            if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) setDropdownOpen(false);
        }
        document.addEventListener('mousedown', handleClick);
        return () => document.removeEventListener('mousedown', handleClick);
    }, []);

    // Load all campaigns
    useEffect(() => {
        async function loadCampaigns() {
            try {
                const res = await fetch('/api/campaigns', { cache: 'no-store' });
                if (res.ok) {
                    const json = await res.json();
                    const list: Campaign[] = json?.data || json || [];
                    setCampaigns(Array.isArray(list) ? list : []);
                    // Auto-select first
                    if (list.length > 0) setSelectedCampaignId(list[0]._id);
                }
            } catch { /* */ } finally { setLoading(false); }
        }
        loadCampaigns();
    }, []);

    // When selectedCampaignId changes, set campaign and auto-select first category
    useEffect(() => {
        if (!selectedCampaignId) return;
        const c = campaigns.find(c => c._id === selectedCampaignId);
        if (c) {
            setCampaign(c);
            if (c.categories && c.categories.length > 0) {
                setSelectedCategory(c.categories[0].name);
            } else {
                setSelectedCategory('');
            }
        }
    }, [selectedCampaignId, campaigns]);

    // Load runners when campaign/category changes
    useEffect(() => {
        if (!campaign?._id || !selectedCategory) { setRunners([]); return; }
        let cancelled = false;
        async function loadRunners() {
            setLoading(true);
            try {
                const params = new URLSearchParams({ campaignId: campaign!._id, category: selectedCategory, limit: '10000' });
                const res = await fetch(`/api/runners/paged?${params.toString()}`, { cache: 'no-store' });
                if (res.ok && !cancelled) {
                    const data = await res.json();
                    setRunners(data.data || []);
                }
            } catch { /* */ } finally { if (!cancelled) setLoading(false); }
        }
        loadRunners();
        return () => { cancelled = true; };
    }, [campaign, selectedCategory]);

    // Build winners per gender per age group
    const { maleWinners, femaleWinners } = useMemo(() => {
        const finished = runners.filter(r => r.status === 'finished' && (r.netTime || r.gunTime));
        const sorted = [...finished].sort((a, b) => {
            const at = a.netTime || a.gunTime || a.elapsedTime || Infinity;
            const bt = b.netTime || b.gunTime || b.elapsedTime || Infinity;
            return at - bt;
        });

        const maleWinners: Record<string, Runner[]> = {};
        const femaleWinners: Record<string, Runner[]> = {};
        for (const g of AGE_GROUPS) { maleWinners[g.label] = []; femaleWinners[g.label] = []; }

        for (const runner of sorted) {
            const ag = resolveAgeGroup(runner);
            const bucket = runner.gender === 'F' ? femaleWinners : maleWinners;
            if (bucket[ag] && bucket[ag].length < TOP_N) {
                bucket[ag].push(runner);
            }
        }
        return { maleWinners, femaleWinners };
    }, [runners]);

    const rankBg = ['#f59e0b', '#9ca3af', '#92400e', '#e2e8f0', '#e2e8f0'];
    const rankFg = ['#000', '#fff', '#fff', '#475569', '#475569'];

    // Render a winners column
    const renderColumn = (title: string, bgHeader: string, bgAgeHeader: string, winners: Record<string, Runner[]>) => (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4vh', minHeight: 0, flex: 1 }}>
            <div style={{ padding: '0.7vh 0', fontWeight: 900, fontSize: '2vh', textAlign: 'center', textTransform: 'uppercase', borderRadius: 8, color: 'white', letterSpacing: 2, background: bgHeader, flexShrink: 0 }}>
                {title}
            </div>
            {AGE_GROUPS.map(g => (
                <div key={g.label} style={{ background: 'white', border: '1px solid #e2e8f0', borderRadius: 8, overflow: 'hidden', display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
                    <div style={{ background: bgAgeHeader, color: 'white', fontWeight: 800, fontSize: '1.6vh', padding: '0.3vh 12px', textAlign: 'center', flexShrink: 0 }}>
                        {g.label}
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-evenly', flex: 1, padding: '0.2vh 6px', minHeight: 0 }}>
                        {(winners[g.label] || []).length > 0 ? (winners[g.label] || []).map((runner, idx) => (
                            <div key={runner._id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '0.2vh 8px', borderRadius: 5, background: idx === 0 ? '#fffbeb' : 'transparent' }}>
                                <div style={{ width: '2.2vh', height: '2.2vh', borderRadius: 4, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.3vh', fontWeight: 900, flexShrink: 0, background: rankBg[idx] || '#e2e8f0', color: rankFg[idx] || '#475569' }}>
                                    {idx + 1}
                                </div>
                                <span style={{ fontSize: '1.4vh', fontWeight: 700, color: '#1e293b', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', flex: 1, textTransform: 'uppercase' }}>
                                    {runner.firstName} {runner.lastName}
                                </span>
                                <span style={{ fontFamily: 'monospace', fontWeight: 800, fontSize: '1.4vh', color: '#1e293b', flexShrink: 0 }}>
                                    {runner.netTimeStr || formatTime(runner.netTime || runner.gunTime)}
                                </span>
                            </div>
                        )) : (
                            <div style={{ textAlign: 'center', fontSize: '1.2vh', color: '#94a3b8' }}>-</div>
                        )}
                    </div>
                </div>
            ))}
        </div>
    );

    return (
        <div style={{ fontFamily: "'Prompt', 'Inter', sans-serif", background: '#0f172a', height: '100vh', overflow: 'hidden', display: 'flex', flexDirection: 'column', padding: '0.8vh 1vw' }}>
            {/* Header */}
            <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.6vh 1.5vw', background: '#1e293b', borderRadius: 10, marginBottom: '0.8vh', flexShrink: 0, border: '1px solid #334155' }}>
                {/* Logo → Home */}
                <Link href="/" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <Image src="/logo-white.png" alt="ACTION" width={120} height={40} style={{ height: '3.5vh', width: 'auto' }} />
                    <span style={{ color: '#22c55e', fontWeight: 900, fontSize: '2vh', letterSpacing: 2, textTransform: 'uppercase' }}>Winners</span>
                </Link>

                <div style={{ display: 'flex', alignItems: 'center', gap: '1.2vw' }}>
                    {/* Campaign Dropdown */}
                    <div ref={dropdownRef} style={{ position: 'relative' }}>
                        <button
                            onClick={() => setDropdownOpen(!dropdownOpen)}
                            style={{ padding: '0.5vh 1.5vw', borderRadius: 8, fontSize: '1.4vh', fontWeight: 700, background: '#334155', color: 'white', border: '1px solid #475569', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8, maxWidth: '25vw', overflow: 'hidden' }}
                        >
                            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{campaign?.name || 'เลือกกิจกรรม'}</span>
                            <span style={{ fontSize: '1vh', opacity: 0.6 }}>▼</span>
                        </button>
                        {dropdownOpen && (
                            <div style={{ position: 'absolute', top: '100%', left: 0, marginTop: 4, background: '#1e293b', border: '1px solid #475569', borderRadius: 8, zIndex: 100, minWidth: '25vw', maxHeight: '40vh', overflowY: 'auto', boxShadow: '0 10px 30px rgba(0,0,0,0.5)' }}>
                                {campaigns.map(c => (
                                    <button
                                        key={c._id}
                                        onClick={() => { setSelectedCampaignId(c._id); setDropdownOpen(false); }}
                                        style={{ display: 'block', width: '100%', textAlign: 'left', padding: '1vh 1.2vw', fontSize: '1.4vh', fontWeight: selectedCampaignId === c._id ? 800 : 500, color: selectedCampaignId === c._id ? '#22c55e' : '#cbd5e1', background: selectedCampaignId === c._id ? '#334155' : 'transparent', border: 'none', cursor: 'pointer', borderBottom: '1px solid #334155' }}
                                    >
                                        {c.name}
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* Distance/Category tabs */}
                    {campaign?.categories && campaign.categories.length > 0 && (
                        <div style={{ display: 'flex', gap: '0.4vw' }}>
                            {campaign.categories.map(cat => (
                                <button
                                    key={cat.name}
                                    onClick={() => setSelectedCategory(cat.name)}
                                    style={{
                                        padding: '0.4vh 1vw', borderRadius: 6, fontSize: '1.3vh', fontWeight: 700,
                                        border: selectedCategory === cat.name ? '2px solid #22c55e' : '1px solid #475569',
                                        background: selectedCategory === cat.name ? '#22c55e' : 'transparent',
                                        color: selectedCategory === cat.name ? '#000' : '#cbd5e1',
                                        cursor: 'pointer', whiteSpace: 'nowrap',
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
                <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94a3b8', fontSize: '2vh' }}>
                    Loading...
                </div>
            ) : (
                <div style={{ display: 'flex', gap: '1vw', flex: 1, minHeight: 0 }}>
                    {renderColumn('♂ MALE WINNERS', '#2563eb', '#1e3a5f', maleWinners)}
                    {renderColumn('♀ FEMALE WINNERS', '#db2777', '#831843', femaleWinners)}
                </div>
            )}
        </div>
    );
}
