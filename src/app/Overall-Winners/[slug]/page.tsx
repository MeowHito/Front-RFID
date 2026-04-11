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
    status: string;
    netTime?: number;
    gunTime?: number;
    elapsedTime?: number;
    netTimeStr?: string;
    gunTimeStr?: string;
}

interface CampaignCategory {
    name: string;
    distance?: string;
}

interface Campaign {
    _id: string;
    name: string;
    nameTh?: string;
    nameEn?: string;
    slug?: string;
    uuid?: string;
    categories?: CampaignCategory[];
}

const TOP_N = 5;
const REFRESH_INTERVAL = 15;

function formatTime(ms: number | undefined | null): string {
    if (ms === undefined || ms === null || ms <= 0) return '-';
    const hours = Math.floor(ms / 3600000);
    const minutes = Math.floor((ms % 3600000) / 60000);
    const seconds = Math.floor((ms % 60000) / 1000);
    return `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

export default function OverallWinnersBySlugPage() {
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

    const loadRunners = useCallback(async (isRefresh = false) => {
        if (!campaign?._id || !selectedCategory) {
            setRunners([]);
            return;
        }
        if (isRefresh) setRefreshing(true); else setLoading(true);
        try {
            const params = new URLSearchParams({
                campaignId: campaign._id,
                category: selectedCategory,
                limit: '10000',
                skipStatusCounts: 'true',
            });
            const res = await fetch(`/api/runners/paged?${params.toString()}`, { cache: 'no-store' });
            if (res.ok) {
                const data = await res.json();
                setRunners(data.data || []);
            }
        } catch {
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, [campaign, selectedCategory]);

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
        }, REFRESH_INTERVAL * 1000);

        return () => {
            if (refreshTimerRef.current) clearInterval(refreshTimerRef.current);
            if (countdownRef.current) clearInterval(countdownRef.current);
        };
    }, [campaign, selectedCategory, loadRunners]);

    const { maleWinners, femaleWinners } = useMemo(() => {
        const finished = runners.filter(r => r.status === 'finished' && (r.netTime || r.gunTime || r.elapsedTime));
        const sorted = [...finished].sort((a, b) => {
            const at = a.netTime || a.gunTime || a.elapsedTime || Infinity;
            const bt = b.netTime || b.gunTime || b.elapsedTime || Infinity;
            return at - bt;
        });

        return {
            maleWinners: sorted.filter(r => r.gender !== 'F').slice(0, TOP_N),
            femaleWinners: sorted.filter(r => r.gender === 'F').slice(0, TOP_N),
        };
    }, [runners]);

    const rankBg = ['#f59e0b', '#9ca3af', '#92400e', '#e2e8f0', '#e2e8f0'];
    const rankFg = ['#000', '#fff', '#fff', '#475569', '#475569'];

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

    const renderRunnerRow = (runner: Runner, idx: number) => (
        <div key={runner._id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: isMobile ? '4px 8px' : '0.4vh 10px', borderRadius: 6, background: idx === 0 ? '#fffbeb' : 'transparent', height: isMobile ? 'auto' : '4vh', minHeight: isMobile ? 30 : 30 }}>
            <div style={{ width: isMobile ? 22 : '2.4vh', height: isMobile ? 22 : '2.4vh', minWidth: 18, minHeight: 18, borderRadius: 4, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: isMobile ? 12 : '1.4vh', fontWeight: 900, flexShrink: 0, background: rankBg[idx] || '#e2e8f0', color: rankFg[idx] || '#475569' }}>
                {idx + 1}
            </div>
            <span style={{ fontSize: isMobile ? 12 : '1.55vh', fontWeight: 700, color: '#1e293b', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', flex: 1, textTransform: 'uppercase' }}>
                {runner.firstName} {runner.lastName}
            </span>
            <span style={{ fontFamily: 'monospace', fontWeight: 800, fontSize: isMobile ? 11 : '1.5vh', color: '#1e293b', flexShrink: 0 }}>
                {runner.netTimeStr || formatTime(runner.netTime || runner.gunTime || runner.elapsedTime)}
            </span>
        </div>
    );

    const renderEmptyRow = (idx: number) => (
        <div key={`empty-${idx}`} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: isMobile ? '4px 8px' : '0.4vh 10px', height: isMobile ? 'auto' : '4vh', minHeight: isMobile ? 30 : 30 }}>
            <div style={{ width: isMobile ? 22 : '2.4vh', height: isMobile ? 22 : '2.4vh', minWidth: 18, minHeight: 18, borderRadius: 4, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: isMobile ? 12 : '1.4vh', fontWeight: 900, flexShrink: 0, background: '#f1f5f9', color: '#cbd5e1' }}>
                {idx + 1}
            </div>
            <span style={{ fontSize: isMobile ? 11 : '1.2vh', color: '#cbd5e1', fontStyle: 'italic' }}>—</span>
        </div>
    );

    const renderColumn = (title: string, bgHeader: string, list: Runner[]) => (
        <div style={{ display: 'flex', flexDirection: 'column', gap: isMobile ? 8 : '0.8vh', minHeight: 0, flex: 1, overflowY: isMobile ? 'visible' : 'auto', paddingRight: isMobile ? 0 : 4 }}>
            <div style={{ padding: isMobile ? '8px 0' : '0.9vh 0', fontWeight: 900, fontSize: isMobile ? 16 : '2vh', textAlign: 'center', textTransform: 'uppercase', borderRadius: 8, color: 'white', letterSpacing: 2, background: bgHeader, flexShrink: 0 }}>
                {title}
            </div>
            <div style={{ background: 'white', border: '1px solid #e2e8f0', borderRadius: 8, overflow: 'hidden', display: 'flex', flexDirection: 'column', flexShrink: 0, minHeight: isMobile ? 180 : '28vh' }}>
                <div style={{ background: bgHeader, opacity: 0.88, color: 'white', fontWeight: 800, fontSize: isMobile ? 13 : '1.5vh', padding: isMobile ? '4px 12px' : '0.35vh 12px', textAlign: 'center', flexShrink: 0 }}>
                    OVERALL RANKING
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'flex-start', flex: 1, padding: isMobile ? '4px' : '0.35vh 4px', minHeight: 0 }}>
                    {Array.from({ length: TOP_N }, (_, i) => i).map(i => list[i] ? renderRunnerRow(list[i], i) : renderEmptyRow(i))}
                </div>
            </div>
        </div>
    );

    return (
        <div style={{ fontFamily: "'Prompt', 'Inter', sans-serif", background: '#0f172a', height: isMobile ? 'auto' : '100vh', minHeight: '100vh', overflow: isMobile ? 'auto' : 'hidden', display: 'flex', flexDirection: 'column', padding: isMobile ? '8px' : '0.8vh 1vw' }}>
            <style>{`@keyframes pulse { 0%,100% { opacity:1 } 50% { opacity:0.3 } }`}</style>
            <header style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', justifyContent: 'space-between', alignItems: isMobile ? 'stretch' : 'center', padding: isMobile ? '10px 12px' : '0.6vh 1.5vw', background: '#1e293b', borderRadius: 10, marginBottom: isMobile ? 8 : '0.8vh', flexShrink: 0, border: '1px solid #334155', gap: isMobile ? 8 : 0 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Link href="/" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <Image src="/logo-white.png" alt="ACTION" width={120} height={40} style={{ height: isMobile ? 28 : '3.5vh', width: 'auto' }} />
                        <span style={{ color: '#38bdf8', fontWeight: 900, fontSize: isMobile ? 14 : '2vh', letterSpacing: 2, textTransform: 'uppercase' }}>Overall Winners</span>
                    </Link>

                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        {refreshing && <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: '#22c55e', animation: 'pulse 0.8s ease-in-out infinite' }} />}
                        <span style={{ fontSize: isMobile ? 10 : '1.1vh', color: '#94a3b8', fontFamily: 'monospace' }}>
                            {refreshing ? 'Updating...' : `Refresh ${countdown}s`}
                        </span>
                    </div>
                </div>

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
                                        border: selectedCategory === cat.name ? '2px solid #38bdf8' : '1px solid #475569',
                                        background: selectedCategory === cat.name ? '#38bdf8' : 'transparent',
                                        color: selectedCategory === cat.name ? '#082f49' : '#cbd5e1',
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

            {loading ? (
                <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94a3b8', fontSize: isMobile ? 16 : '2vh' }}>
                    Loading...
                </div>
            ) : (
                <div style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', gap: isMobile ? 12 : '1vw', flex: isMobile ? undefined : 1, minHeight: 0, paddingBottom: isMobile ? 16 : 0 }}>
                    {renderColumn('♂ MALE OVERALL', '#2563eb', maleWinners)}
                    {renderColumn('♀ FEMALE OVERALL', '#db2777', femaleWinners)}
                </div>
            )}
        </div>
    );
}
