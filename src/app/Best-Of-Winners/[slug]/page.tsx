'use client';

import Image from 'next/image';
import Link from 'next/link';
import type { CSSProperties } from 'react';
import { useEffect, useState, useMemo, useRef, useCallback } from 'react';
import { buildWinnersExcel, triggerExcelDownload } from '@/lib/winner-excel';
import { isBuriramAddress } from '@/lib/province';
import { useParams, useSearchParams } from 'next/navigation';

interface Runner {
    _id: string;
    bib: string;
    firstName: string;
    lastName: string;
    gender: string;
    category: string;
    status: string;
    nationality?: string;
    address?: string;
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
    bestOfDisplayCount?: number;
}

const REFRESH_INTERVAL = 10;

function formatTime(ms: number | undefined | null): string {
    if (ms === undefined || ms === null || ms <= 0) return '-';
    const hours = Math.floor(ms / 3600000);
    const minutes = Math.floor((ms % 3600000) / 60000);
    const seconds = Math.floor((ms % 60000) / 1000);
    return `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

// "Best of [event name]" board — the single fastest male and female finisher
// for the selected distance, always top-1 regardless of the campaign's
// overallDisplayCount (which governs the separate Overall-Winners board).
export default function BestOfWinnersBySlugPage() {
    const params = useParams();
    const slug = params.slug as string;
    const searchParams = useSearchParams();
    const categoryFromUrl = searchParams.get('category') || '';

    const [campaign, setCampaign] = useState<Campaign | null>(null);
    const [campaignNotFound, setCampaignNotFound] = useState(false);
    const [selectedCategory, setSelectedCategory] = useState<string>('');
    const [displayedRunners, setDisplayedRunners] = useState<Runner[]>([]);
    const [initialLoading, setInitialLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [countdown, setCountdown] = useState(REFRESH_INTERVAL);
    const refreshTimerRef = useRef<NodeJS.Timeout | null>(null);
    const countdownRef = useRef<NodeJS.Timeout | null>(null);
    const [isMobile, setIsMobile] = useState(false);
    const [autoMode, setAutoMode] = useState(false);
    const [autoCountdown, setAutoCountdown] = useState(5);
    const autoTimerRef = useRef<NodeJS.Timeout | null>(null);
    const autoCountdownRef = useRef<NodeJS.Timeout | null>(null);
    const campaignCategoriesRef = useRef<CampaignCategory[]>([]);
    const displayedCategoryRef = useRef<string>('');
    const [downloading, setDownloading] = useState<string | null>(null);
    const maleColRef = useRef<HTMLDivElement | null>(null);
    const femaleColRef = useRef<HTMLDivElement | null>(null);

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
                            const urlMatch = data.categories.find((c: CampaignCategory) => c.name === categoryFromUrl);
                            setSelectedCategory(urlMatch ? urlMatch.name : data.categories[0].name);
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
                setInitialLoading(false);
            }
        })();
    }, [slug]); // eslint-disable-line react-hooks/exhaustive-deps

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
        } catch { /* keep showing previous data */ } finally {
            setInitialLoading(false);
            setRefreshing(false);
        }
    }, [campaign, selectedCategory]); // eslint-disable-line react-hooks/exhaustive-deps

    useEffect(() => {
        loadRunners(false);
    }, [loadRunners]);

    // Auto-refresh every 10 seconds
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
        campaignCategoriesRef.current = campaign?.categories || [];
    }, [campaign]);

    useEffect(() => {
        if (!autoMode) {
            if (autoTimerRef.current) clearInterval(autoTimerRef.current);
            if (autoCountdownRef.current) clearInterval(autoCountdownRef.current);
            return;
        }
        setAutoCountdown(5);
        autoCountdownRef.current = setInterval(() => {
            setAutoCountdown(prev => (prev <= 1 ? 1 : prev - 1));
        }, 1000);
        autoTimerRef.current = setInterval(() => {
            setAutoCountdown(5);
            setSelectedCategory(prev => {
                const cats = campaignCategoriesRef.current;
                if (!cats.length) return prev;
                const idx = cats.findIndex(c => c.name === prev);
                return cats[(idx + 1) % cats.length].name;
            });
        }, 5000);
        return () => {
            if (autoTimerRef.current) clearInterval(autoTimerRef.current);
            if (autoCountdownRef.current) clearInterval(autoCountdownRef.current);
        };
    }, [autoMode]);

    const topN = Math.max(1, campaign?.bestOfDisplayCount || 1);

    // Best Of Buriram — local-province award: only runners whose address
    // indicates Buriram residence are eligible.
    const { maleWinners, femaleWinners } = useMemo(() => {
        const finished = displayedRunners.filter(r => r.status === 'finished' && (r.netTime || r.gunTime || r.elapsedTime) && isBuriramAddress(r.address));
        const sorted = [...finished].sort((a, b) => {
            const at = a.netTime || a.gunTime || a.elapsedTime || Infinity;
            const bt = b.netTime || b.gunTime || b.elapsedTime || Infinity;
            return at - bt;
        });
        return {
            maleWinners: sorted.filter(r => r.gender !== 'F').slice(0, topN),
            femaleWinners: sorted.filter(r => r.gender === 'F').slice(0, topN),
        };
    }, [displayedRunners, topN]);

    const downloadLandscape = useCallback(async (gender: 'male' | 'female' | 'both' = 'both') => {
        setDownloading('landscape');
        try {
            const blob = await buildWinnersExcel(
                campaign?.name || '',
                selectedCategory,
                [{ maleRunners: maleWinners, femaleRunners: femaleWinners }],
                gender,
            );
            const suffix = gender === 'male' ? '-Male' : gender === 'female' ? '-Female' : '';
            const distance = campaign?.categories?.find(c => c.name === selectedCategory)?.distance || selectedCategory || '';
            const distPart = distance ? `-${distance}` : '';
            if (blob) triggerExcelDownload(blob, `${campaign?.name || 'winners'}${distPart}-BestOf${suffix}`);
        } catch (e) { console.error(e); } finally {
            setDownloading(null);
        }
    }, [campaign, selectedCategory, maleWinners, femaleWinners]);

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

    const rankBg = ['#f59e0b', '#9ca3af', '#92400e', '#e2e8f0', '#e2e8f0'];
    const rankFg = ['#000', '#fff', '#fff', '#475569', '#475569'];

    const renderRunnerRow = (runner: Runner, idx: number) => (
        <div key={runner._id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: isMobile ? '4px 8px' : '0.4vh 10px', borderRadius: 6, background: idx === 0 ? '#fffbeb' : 'transparent', height: isMobile ? 'auto' : '4vh', minHeight: isMobile ? 30 : 30 }}>
            <div style={{ width: isMobile ? 22 : '2.4vh', height: isMobile ? 22 : '2.4vh', minWidth: 18, minHeight: 18, borderRadius: 4, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: isMobile ? 12 : '1.4vh', fontWeight: 900, flexShrink: 0, background: rankBg[idx] || '#e2e8f0', color: rankFg[idx] || '#475569' }}>
                {idx + 1}
            </div>
            <span style={{ fontSize: isMobile ? 12 : '1.55vh', fontWeight: 700, color: '#1e293b', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', flex: 1, textTransform: 'uppercase' }}>
                {`${runner.bib}  ${runner.firstName} ${runner.lastName}`}
            </span>
            <span style={{ fontFamily: 'monospace', fontWeight: 800, fontSize: isMobile ? 11 : '1.5vh', color: '#1e293b', flexShrink: 0, minWidth: isMobile ? 60 : '7vh', textAlign: 'right' }}>
                {runner.gunTimeStr || formatTime(runner.gunTime)}
            </span>
            <span style={{ fontFamily: 'monospace', fontWeight: 800, fontSize: isMobile ? 11 : '1.5vh', color: '#1e293b', flexShrink: 0, minWidth: isMobile ? 60 : '7vh', textAlign: 'right', marginLeft: isMobile ? 10 : 14 }}>
                {runner.netTimeStr || formatTime(runner.netTime)}
            </span>
        </div>
    );

    const renderEmptyRow = (idx: number) => (
        <div key={`empty-${idx}`} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: isMobile ? '4px 8px' : '0.4vh 10px', height: isMobile ? 'auto' : '4vh', minHeight: isMobile ? 30 : 30 }}>
            <div style={{ width: isMobile ? 22 : '2.4vh', height: isMobile ? 22 : '2.4vh', minWidth: 18, minHeight: 18, borderRadius: 4, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: isMobile ? 12 : '1.4vh', fontWeight: 900, flexShrink: 0, background: '#f1f5f9', color: '#cbd5e1' }}>
                {idx + 1}
            </div>
            <span style={{ fontSize: isMobile ? 11 : '1.2vh', color: '#cbd5e1', fontStyle: 'italic', flex: 1 }}>—</span>
            <span style={{ minWidth: isMobile ? 60 : '7vh' }} />
            <span style={{ minWidth: isMobile ? 60 : '7vh', marginLeft: isMobile ? 10 : 14 }} />
        </div>
    );

    const dlIcon = (size = 12) => (
        <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <line x1="8" y1="1" x2="8" y2="11"/><polyline points="4 7 8 11 12 7"/><line x1="2" y1="14" x2="14" y2="14"/>
        </svg>
    );

    const renderColumn = (title: string, bgHeader: string, list: Runner[], colRef: { current: HTMLDivElement | null }, onDownload: () => void) => {
        const dlButtonStyle: CSSProperties = { background: 'rgba(255,255,255,0.18)', border: 'none', borderRadius: 5, cursor: downloading ? 'default' : 'pointer', padding: isMobile ? '3px 6px' : '3px 8px', color: 'white', fontSize: isMobile ? 11 : 12, display: 'flex', alignItems: 'center', gap: 4, fontWeight: 700, flexShrink: 0 };
        return (
        <div ref={el => { colRef.current = el; }} style={{ display: 'flex', flexDirection: 'column', gap: isMobile ? 8 : '0.8vh', minHeight: 0, flex: 1, overflowY: isMobile ? 'visible' : 'auto', paddingRight: isMobile ? 0 : 4 }}>
            <div style={{ padding: isMobile ? '8px 10px' : '0.9vh 10px', fontWeight: 900, fontSize: isMobile ? 16 : '2vh', textTransform: 'uppercase', borderRadius: 8, color: 'white', letterSpacing: 2, background: bgHeader, flexShrink: 0, display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ ...dlButtonStyle, visibility: 'hidden' }} aria-hidden="true">
                    {dlIcon(11)}{!isMobile && <span>Download</span>}
                </span>
                <span style={{ flex: 1, textAlign: 'center', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{title}</span>
                <button data-no-capture onClick={onDownload} disabled={!!downloading} title="Download" style={{ ...dlButtonStyle, opacity: downloading ? 0.5 : 1, transition: 'opacity 0.15s' }}>
                    {dlIcon(11)}{!isMobile && <span>Download</span>}
                </button>
            </div>
            <div style={{ background: 'white', border: '1px solid #e2e8f0', borderRadius: 8, overflow: 'hidden', display: 'flex', flexDirection: 'column', flexShrink: 0, minHeight: isMobile ? 90 : '10vh' }}>
                <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'flex-start', flex: 1, padding: isMobile ? '4px' : '0.35vh 4px', minHeight: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: isMobile ? '2px 10px 3px' : '0.1vh 10px 0.2vh', borderBottom: '1px solid #f1f5f9' }}>
                        <div style={{ width: isMobile ? 22 : '2.4vh', minWidth: 18, flexShrink: 0 }} />
                        <span style={{ fontSize: isMobile ? 9 : '1.1vh', fontWeight: 700, color: '#94a3b8', flex: 1, textTransform: 'uppercase', letterSpacing: 0.5 }}>Name</span>
                        <span style={{ fontSize: isMobile ? 9 : '1.1vh', fontWeight: 700, color: '#94a3b8', flexShrink: 0, minWidth: isMobile ? 60 : '7vh', textAlign: 'right', letterSpacing: 0.5 }}>GunTime</span>
                        <span style={{ fontSize: isMobile ? 9 : '1.1vh', fontWeight: 700, color: '#94a3b8', flexShrink: 0, minWidth: isMobile ? 60 : '7vh', textAlign: 'right', letterSpacing: 0.5, marginLeft: isMobile ? 10 : 14 }}>NetTime</span>
                    </div>
                    {Array.from({ length: topN }, (_, i) => i).map(i => list[i] ? renderRunnerRow(list[i], i) : renderEmptyRow(i))}
                </div>
            </div>
        </div>
        );
    };

    return (
        <div style={{ fontFamily: "'Prompt', 'Inter', sans-serif", background: '#0f172a', height: isMobile ? 'auto' : '100vh', minHeight: '100vh', overflow: isMobile ? 'auto' : 'hidden', display: 'flex', flexDirection: 'column', padding: isMobile ? '8px' : '0.8vh 1vw' }}>
            <style>{`@keyframes pulse { 0%,100% { opacity:1 } 50% { opacity:0.3 } }`}</style>
            <header style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', justifyContent: 'space-between', alignItems: isMobile ? 'stretch' : 'center', padding: isMobile ? '10px 12px' : '0.6vh 1.5vw', background: '#1e293b', borderRadius: 10, marginBottom: isMobile ? 8 : '0.8vh', flexShrink: 0, border: '1px solid #334155', gap: isMobile ? 8 : 0 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Link href="/" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <Image src="/logo-white.png" alt="ACTION" width={120} height={40} style={{ height: isMobile ? 28 : '3.5vh', width: 'auto' }} />
                        <span style={{ color: '#f59e0b', fontWeight: 900, fontSize: isMobile ? 14 : '2vh', letterSpacing: 2, textTransform: 'uppercase' }}>Best Of Buriram {topN}</span>
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
                        <span style={{ fontSize: isMobile ? 11 : '1.3vh', fontWeight: 700, color: '#94a3b8', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: isMobile ? '100%' : '20vw' }}>
                            {campaign.name}
                        </span>
                    )}

                    {campaign && !initialLoading && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                            <button
                                onClick={() => downloadLandscape('both')}
                                disabled={!!downloading}
                                title="Download Best Of Winners (Excel)"
                                style={{ display: 'flex', alignItems: 'center', gap: 5, padding: isMobile ? '5px 10px' : '0.35vh 0.7vw', background: '#1d4ed8', border: '1px solid #2563eb', borderRadius: 7, color: 'white', fontSize: isMobile ? 11 : '1.15vh', fontWeight: 800, cursor: 'pointer', whiteSpace: 'nowrap', opacity: downloading ? 0.6 : 1, transition: 'opacity 0.15s', fontFamily: "'Prompt','Inter',sans-serif" }}
                            >
                                <svg width="11" height="11" viewBox="0 0 16 16" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="8" y1="1" x2="8" y2="11"/><polyline points="4 7 8 11 12 7"/><line x1="2" y1="14" x2="14" y2="14"/></svg>
                                Download
                            </button>
                        </div>
                    )}

                    {campaign?.categories && campaign.categories.length > 0 && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: isMobile ? 6 : '0.4vw', flexWrap: 'wrap' }}>
                            <div style={{ display: 'flex', gap: isMobile ? 6 : '0.4vw', overflowX: 'auto', WebkitOverflowScrolling: 'touch', paddingBottom: isMobile ? 2 : 0 }}>
                                {campaign.categories.map(cat => (
                                    <button
                                        key={cat.name}
                                        onClick={() => { setSelectedCategory(cat.name); setAutoMode(false); }}
                                        style={{ padding: isMobile ? '6px 12px' : '0.4vh 1vw', borderRadius: 6, fontSize: isMobile ? 12 : '1.3vh', fontWeight: 700, border: selectedCategory === cat.name ? '2px solid #f59e0b' : '1px solid #475569', background: selectedCategory === cat.name ? '#f59e0b' : 'transparent', color: selectedCategory === cat.name ? '#1c1917' : '#cbd5e1', cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0 }}
                                    >
                                        {cat.name}{cat.distance ? ` (${cat.distance})` : ''}
                                    </button>
                                ))}
                            </div>
                            {campaign.categories.length > 1 && (
                                <button
                                    onClick={() => setAutoMode(m => !m)}
                                    style={{ display: 'flex', alignItems: 'center', gap: 6, padding: isMobile ? '6px 12px' : '0.4vh 0.8vw', background: autoMode ? '#f59e0b' : 'transparent', border: `1px solid ${autoMode ? '#f59e0b' : '#475569'}`, borderRadius: 6, color: autoMode ? '#1c1917' : '#94a3b8', fontSize: isMobile ? 12 : '1.3vh', fontWeight: 800, cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0, minWidth: isMobile ? 80 : 72, justifyContent: 'center', transition: 'background 0.2s, color 0.2s, border-color 0.2s' }}
                                >
                                    {autoMode ? `⏸ ${autoCountdown}s` : '▶ AUTO'}
                                </button>
                            )}
                        </div>
                    )}
                </div>
            </header>

            {campaign && (
                <div style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', alignItems: 'center', justifyContent: 'center', gap: isMobile ? 4 : '0.8vw', padding: isMobile ? '8px 12px' : '0.5vh 1.5vw', background: '#1e293b', borderRadius: 10, marginBottom: isMobile ? 8 : '0.8vh', border: '1px solid #334155', flexShrink: 0, textAlign: 'center' }}>
                    <span style={{ fontSize: isMobile ? 15 : '2.2vh', fontWeight: 900, color: '#f1f5f9', letterSpacing: 0.5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: isMobile ? '100%' : '55vw' }}>
                        Best Of Buriram
                    </span>
                    {selectedCategory && (
                        <span style={{ display: 'inline-flex', alignItems: 'center', padding: isMobile ? '3px 14px' : '0.2vh 1.2vw', background: '#f59e0b', color: '#1c1917', borderRadius: 999, fontWeight: 900, fontSize: isMobile ? 13 : '1.8vh', letterSpacing: 1, whiteSpace: 'nowrap', flexShrink: 0 }}>
                            {selectedCategory}
                            {campaign.categories?.find(c => c.name === selectedCategory)?.distance
                                ? ` · ${campaign.categories!.find(c => c.name === selectedCategory)!.distance}`
                                : ''}
                        </span>
                    )}
                </div>
            )}

            {/* Show loading only on very first load — never blank the screen on refresh */}
            {initialLoading && displayedRunners.length === 0 ? (
                <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94a3b8', fontSize: isMobile ? 16 : '2vh' }}>
                    Loading...
                </div>
            ) : (
                <div style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', gap: isMobile ? 12 : '1vw', flex: isMobile ? undefined : 1, minHeight: 0, paddingBottom: isMobile ? 16 : 0 }}>
                    {renderColumn('♂ BEST MALE', '#2563eb', maleWinners, maleColRef, () => downloadLandscape('male'))}
                    {renderColumn('♀ BEST FEMALE', '#db2777', femaleWinners, femaleColRef, () => downloadLandscape('female'))}
                </div>
            )}
        </div>
    );
}
