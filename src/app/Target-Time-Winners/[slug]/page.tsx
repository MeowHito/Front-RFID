'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useEffect, useState, useMemo, useRef, useCallback } from 'react';
import { useParams } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';

interface Runner {
    _id: string;
    bib: string;
    firstName: string;
    lastName: string;
    gender: string;
    status: string;
    netTime?: number;
    gunTime?: number;
    elapsedTime?: number;
    netTimeStr?: string;
    gunTimeStr?: string;
}

interface TargetTimeBand {
    label: string;
    minMinutes: number;
    maxMinutes: number;
}

interface TargetTimeBandGroup {
    category: string;
    bands: TargetTimeBand[];
}

interface Campaign {
    _id: string;
    name: string;
    slug?: string;
    categories?: { name: string; distance?: string }[];
    targetTimeBands?: TargetTimeBandGroup[];
}

function runnerTimeMs(r: Runner): number {
    return r.netTime || r.gunTime || r.elapsedTime || 0;
}

function formatTime(ms: number | undefined | null): string {
    if (ms === undefined || ms === null || ms <= 0) return '-';
    const hours = Math.floor(ms / 3600000);
    const minutes = Math.floor((ms % 3600000) / 60000);
    const seconds = Math.floor((ms % 60000) / 1000);
    return `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

function formatMinutes(min: number): string {
    const totalSec = Math.round(min * 60);
    const mm = Math.floor(totalSec / 60);
    const ss = totalSec % 60;
    return `${mm}:${String(ss).padStart(2, '0')}`;
}

const REFRESH_INTERVAL = 10;

export default function TargetTimeWinnersBySlugPage() {
    const { isAuthenticated } = useAuth();
    const params = useParams();
    const slug = params.slug as string;

    const [campaign, setCampaign] = useState<Campaign | null>(null);
    const [campaignNotFound, setCampaignNotFound] = useState(false);
    const [selectedCategory, setSelectedCategory] = useState<string>('');
    const [displayedRunners, setDisplayedRunners] = useState<Runner[]>([]);
    const [initialLoading, setInitialLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [countdown, setCountdown] = useState(REFRESH_INTERVAL);
    const [isMobile, setIsMobile] = useState(false);
    const [dropdownOpen, setDropdownOpen] = useState(false);
    const refreshTimerRef = useRef<NodeJS.Timeout | null>(null);
    const countdownRef = useRef<NodeJS.Timeout | null>(null);
    const dropdownRef = useRef<HTMLDivElement>(null);
    const displayedCategoryRef = useRef<string>('');

    useEffect(() => {
        const check = () => setIsMobile(window.innerWidth < 768);
        check();
        window.addEventListener('resize', check);
        return () => window.removeEventListener('resize', check);
    }, []);

    // Categories that have target-time bands configured
    const configuredCategories = useMemo(() => {
        const cats = campaign?.categories || [];
        const withBands = new Set((campaign?.targetTimeBands || []).filter(g => (g.bands?.length || 0) > 0).map(g => g.category));
        return cats.filter(c => withBands.has(c.name));
    }, [campaign]);

    useEffect(() => {
        if (!slug) return;
        (async () => {
            try {
                const res = await fetch(`/api/campaigns/${encodeURIComponent(slug)}`, { cache: 'no-store' });
                if (res.ok) {
                    const data = await res.json();
                    if (data?._id) {
                        setCampaign(data);
                        const firstWithBands = (data.targetTimeBands || []).find((g: TargetTimeBandGroup) => (g.bands?.length || 0) > 0);
                        setSelectedCategory(firstWithBands?.category || data.categories?.[0]?.name || '');
                    } else {
                        setCampaignNotFound(true);
                    }
                } else {
                    setCampaignNotFound(true);
                }
            } catch {
                setCampaignNotFound(true);
            } finally {
                setInitialLoading(false);
            }
        })();
    }, [slug]);

    const loadRunners = useCallback(async (isRefresh = false) => {
        if (!campaign?._id || !selectedCategory) { setDisplayedRunners([]); return; }

        const categoryChanged = displayedCategoryRef.current !== selectedCategory;
        const hasExistingData = displayedRunners.length > 0 && !categoryChanged;

        if (!hasExistingData) setInitialLoading(true);
        if (isRefresh || hasExistingData) setRefreshing(true);

        try {
            const p = new URLSearchParams({ campaignId: campaign._id, category: selectedCategory, limit: '10000', skipStatusCounts: 'true' });
            const res = await fetch(`/api/runners/paged?${p.toString()}`, { cache: 'no-store' });
            if (res.ok) {
                const data = await res.json();
                setDisplayedRunners(data.data || []);
                displayedCategoryRef.current = selectedCategory;
            }
        } catch { /* keep previous data */ } finally {
            setInitialLoading(false);
            setRefreshing(false);
        }
    }, [campaign, selectedCategory]); // eslint-disable-line react-hooks/exhaustive-deps

    useEffect(() => {
        loadRunners(false);
    }, [loadRunners]);

    useEffect(() => {
        if (!campaign?._id || !selectedCategory) return;
        setCountdown(REFRESH_INTERVAL);
        countdownRef.current = setInterval(() => {
            setCountdown(prev => (prev <= 1 ? REFRESH_INTERVAL : prev - 1));
        }, 1000);
        refreshTimerRef.current = setInterval(() => {
            loadRunners(true);
            setCountdown(REFRESH_INTERVAL);
        }, REFRESH_INTERVAL * 1000);
        return () => {
            if (refreshTimerRef.current) clearInterval(refreshTimerRef.current);
            if (countdownRef.current) clearInterval(countdownRef.current);
        };
    }, [campaign, selectedCategory, loadRunners]);

    useEffect(() => {
        const handler = (e: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) setDropdownOpen(false);
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, []);

    const activeBands = useMemo(() => {
        const group = (campaign?.targetTimeBands || []).find(g => g.category === selectedCategory);
        const bands = group?.bands || [];
        return [...bands].sort((a, b) => a.minMinutes - b.minMinutes);
    }, [campaign, selectedCategory]);

    // Group all finished runners (all genders) into bands, ranked by time
    const runnersByBand = useMemo(() => {
        const finished = displayedRunners
            .filter(r => r.status === 'finished' && runnerTimeMs(r) > 0)
            .sort((a, b) => runnerTimeMs(a) - runnerTimeMs(b));
        const result: Runner[][] = activeBands.map(() => []);
        for (const runner of finished) {
            const mins = runnerTimeMs(runner) / 60000;
            const idx = activeBands.findIndex(b => mins >= b.minMinutes && mins < b.maxMinutes);
            if (idx >= 0) result[idx].push(runner);
        }
        return result;
    }, [displayedRunners, activeBands]);

    const rankBg = ['#f59e0b', '#9ca3af', '#92400e'];
    const rankFg = ['#000', '#fff', '#fff'];

    if (campaignNotFound) {
        return (
            <div style={{ fontFamily: "'Prompt', 'Inter', sans-serif", background: '#0f172a', height: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                <div style={{ fontSize: 80, marginBottom: 24 }}>❌</div>
                <div style={{ fontSize: 28, fontWeight: 900, color: '#ef4444', marginBottom: 8 }}>ไม่พบกิจกรรม</div>
                <div style={{ fontSize: 16, color: '#94a3b8' }}>Campaign Not Found — กรุณาตรวจสอบลิงก์อีกครั้ง</div>
                <div style={{ fontSize: 14, color: '#64748b', marginTop: 20 }}>slug: {slug}</div>
            </div>
        );
    }

    const selDistance = (configuredCategories.find(c => c.name === selectedCategory) || campaign?.categories?.find(c => c.name === selectedCategory))?.distance;

    return (
        <div style={{ fontFamily: "'Prompt', 'Inter', sans-serif", background: '#0f172a', minHeight: '100vh', display: 'flex', flexDirection: 'column', padding: isMobile ? '8px' : '0.8vh 1vw' }}>
            <style>{`@keyframes pulse { 0%,100% { opacity:1 } 50% { opacity:0.3 } }`}</style>

            {/* On mobile, hide the control header for public viewers who are not logged in. */}
            {!(isMobile && !isAuthenticated) && (
            <header style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', justifyContent: 'space-between', alignItems: isMobile ? 'stretch' : 'center', padding: isMobile ? '10px 12px' : '0.6vh 1.5vw', background: '#1e293b', borderRadius: 10, marginBottom: isMobile ? 8 : '0.8vh', border: '1px solid #334155', gap: isMobile ? 8 : 0 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Link href="/" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <Image src="/logo-white.png" alt="ACTION" width={120} height={40} style={{ height: isMobile ? 28 : '3.5vh', width: 'auto' }} />
                        <span style={{ color: '#34d399', fontWeight: 900, fontSize: isMobile ? 13 : '1.9vh', letterSpacing: 1.5, textTransform: 'uppercase' }}>Target Time</span>
                    </Link>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        {refreshing && <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: '#34d399', animation: 'pulse 0.8s ease-in-out infinite' }} />}
                        <span style={{ fontSize: isMobile ? 10 : '1.1vh', color: '#94a3b8', fontFamily: 'monospace' }}>
                            {refreshing ? 'Updating...' : `Refresh ${countdown}s`}
                        </span>
                    </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: isMobile ? 6 : '1vw' }}>
                    {campaign && (
                        <span style={{ fontSize: isMobile ? 11 : '1.3vh', fontWeight: 700, color: '#94a3b8', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: isMobile ? '60vw' : '22vw' }}>
                            {campaign.name}
                        </span>
                    )}
                    {configuredCategories.length > 0 && (
                        <div ref={dropdownRef} style={{ position: 'relative' }}>
                            <button
                                onClick={() => setDropdownOpen(d => !d)}
                                style={{ display: 'flex', alignItems: 'center', gap: 8, padding: isMobile ? '6px 12px' : '0.4vh 0.8vw', background: '#0f172a', border: `1px solid ${dropdownOpen ? '#34d399' : '#475569'}`, borderRadius: 8, color: '#f1f5f9', fontSize: isMobile ? 12 : '1.3vh', fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap', fontFamily: "'Prompt', 'Inter', sans-serif" }}
                            >
                                {selectedCategory ? `${selectedCategory}${selDistance ? ` (${selDistance})` : ''}` : 'เลือกระยะ'}
                                <span style={{ fontSize: 10, opacity: 0.6, transform: dropdownOpen ? 'rotate(180deg)' : 'none', display: 'inline-block', transition: 'transform 0.15s' }}>▾</span>
                            </button>
                            {dropdownOpen && (
                                <div style={{ position: 'absolute', top: 'calc(100% + 4px)', right: 0, background: '#1e293b', border: '1px solid #475569', borderRadius: 8, overflow: 'hidden', zIndex: 100, minWidth: 180, boxShadow: '0 8px 24px rgba(0,0,0,0.5)' }}>
                                    {configuredCategories.map((cat, i) => (
                                        <button
                                            key={cat.name}
                                            onClick={() => { setSelectedCategory(cat.name); setDropdownOpen(false); }}
                                            style={{ display: 'block', width: '100%', textAlign: 'left', padding: '10px 16px', background: selectedCategory === cat.name ? 'rgba(52,211,153,0.15)' : 'transparent', border: 'none', borderBottom: i < configuredCategories.length - 1 ? '1px solid #334155' : 'none', color: selectedCategory === cat.name ? '#34d399' : '#cbd5e1', fontSize: isMobile ? 13 : '1.3vh', fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap', fontFamily: "'Prompt', 'Inter', sans-serif" }}
                                        >
                                            {cat.name}{cat.distance ? ` (${cat.distance})` : ''}
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </header>
            )}

            {campaign && (
                <div style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', alignItems: 'center', justifyContent: 'center', gap: isMobile ? 6 : '1.2vw', padding: isMobile ? '10px 16px' : '0.7vh 1.5vw', background: '#1e293b', borderRadius: 10, marginBottom: isMobile ? 8 : '0.8vh', border: '1px solid #334155', textAlign: 'center' }}>
                    <span style={{ fontSize: isMobile ? 15 : '2.2vh', fontWeight: 900, color: '#f1f5f9', letterSpacing: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: isMobile ? '100%' : '50vw' }}>
                        {campaign.name}
                    </span>
                    {selectedCategory && (
                        <span style={{ display: 'inline-flex', alignItems: 'center', background: '#34d399', color: '#052e16', borderRadius: 999, fontWeight: 900, fontSize: isMobile ? 13 : '1.8vh', padding: isMobile ? '3px 14px' : '0.2vh 1.2vw', whiteSpace: 'nowrap' }}>
                            {selectedCategory}{selDistance ? ` · ${selDistance}` : ''}
                        </span>
                    )}
                </div>
            )}

            {initialLoading && displayedRunners.length === 0 ? (
                <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94a3b8', fontSize: isMobile ? 16 : '2vh', minHeight: '40vh' }}>
                    Loading...
                </div>
            ) : activeBands.length === 0 ? (
                <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94a3b8', fontSize: isMobile ? 14 : '1.8vh', minHeight: '40vh', textAlign: 'center', padding: 20 }}>
                    ยังไม่ได้ตั้งช่วงเวลาเป้าหมายสำหรับระยะนี้
                </div>
            ) : (
                <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fill, minmax(320px, 1fr))', gap: isMobile ? 10 : '0.8vw', paddingBottom: 16 }}>
                    {activeBands.map((band, bi) => {
                        const list = runnersByBand[bi] || [];
                        return (
                            <div key={bi} style={{ background: 'white', border: '1px solid #e2e8f0', borderRadius: 10, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
                                <div style={{ background: '#047857', color: 'white', padding: isMobile ? '6px 14px' : '0.5vh 14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                    <span style={{ fontWeight: 900, fontSize: isMobile ? 15 : '1.9vh', textTransform: 'uppercase', letterSpacing: 1 }}>{band.label}</span>
                                    <span style={{ fontSize: isMobile ? 10 : '1.2vh', fontWeight: 700, opacity: 0.9 }}>
                                        {formatMinutes(band.minMinutes)}–{formatMinutes(band.maxMinutes)} · {list.length}
                                    </span>
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '3px 10px', borderBottom: '1px solid #f1f5f9', background: '#f8fafc' }}>
                                    <span style={{ width: 22, flexShrink: 0 }} />
                                    <span style={{ fontSize: isMobile ? 9 : '1.0vh', fontWeight: 700, color: '#94a3b8', flex: 1, textTransform: 'uppercase' }}>Name</span>
                                    <span style={{ fontSize: isMobile ? 9 : '1.0vh', fontWeight: 700, color: '#94a3b8', minWidth: 64, textAlign: 'right' }}>NetTime</span>
                                </div>
                                <div>
                                    {list.length > 0 ? list.map((runner, idx) => (
                                        <div key={runner._id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 10px', borderBottom: '1px solid #f1f5f9', background: idx === 0 ? '#fffbeb' : 'transparent' }}>
                                            <div style={{ width: 22, height: 22, minWidth: 22, borderRadius: 4, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 900, flexShrink: 0, background: rankBg[idx] || '#e2e8f0', color: rankFg[idx] || '#475569' }}>
                                                {idx + 1}
                                            </div>
                                            <span style={{ fontSize: isMobile ? 12 : '1.35vh', fontWeight: 700, color: '#1e293b', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', flex: 1, textTransform: 'uppercase' }}>
                                                {`${runner.bib}  ${runner.firstName} ${runner.lastName}`}
                                            </span>
                                            <span style={{ fontFamily: 'monospace', fontWeight: 800, fontSize: isMobile ? 11 : '1.35vh', color: '#1e293b', flexShrink: 0, minWidth: 64, textAlign: 'right' }}>
                                                {runner.netTimeStr || formatTime(runnerTimeMs(runner))}
                                            </span>
                                        </div>
                                    )) : (
                                        <div style={{ padding: '14px 10px', textAlign: 'center', color: '#cbd5e1', fontSize: 12, fontStyle: 'italic' }}>—</div>
                                    )}
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
