'use client';

import Image from 'next/image';
import Link from 'next/link';
import type { CSSProperties } from 'react';
import { useEffect, useLayoutEffect, useState, useMemo, useRef, useCallback } from 'react';
import { downloadSelectedDistance, triggerSingleDistanceDownload } from '@/lib/combined-winners-download';
import NameLangToggle from '@/components/NameLangToggle';
import { useLanguage } from '@/lib/language-context';
import { useAuth } from '@/lib/auth-context';
import { isThaiNationality, isNationalitySplitCategory } from '@/lib/nationality';
import { isGenderSplitEnabled } from '@/lib/gender-split';
import { resolveOverallDisplayCount, type OverallCountByCategoryEntry } from '@/lib/overall-display-count';
import { useParams, useSearchParams } from 'next/navigation';

interface Runner {
    _id: string;
    bib: string;
    firstName: string;
    lastName: string;
    firstNameTh?: string;
    lastNameTh?: string;
    phone?: string;
    gender: string;
    category: string;
    status: string;
    nationality?: string;
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
    overallDisplayCount?: number;
    overallDisplayCountByCategory?: OverallCountByCategoryEntry[];
    overallEnabled?: boolean;
    excludeOverallThaiFromAgeGroup?: number;
    separateOverallNationalityCategories?: string[];
    /** `false` → this event doesn't race the genders separately; the board shows one
     *  combined Overall column instead of MALE + FEMALE. */
    genderSplitEnabled?: boolean;
}

const REFRESH_INTERVAL = 10;

function formatTime(ms: number | undefined | null): string {
    if (ms === undefined || ms === null || ms <= 0) return '-';
    const hours = Math.floor(ms / 3600000);
    const minutes = Math.floor((ms % 3600000) / 60000);
    const seconds = Math.floor((ms % 60000) / 1000);
    return `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

// A name is never allowed to be cut off on this board — the audience reads it from
// across the room, so an ellipsis is worse than a smaller font. Each row measures its
// own name and shrinks only as far as that row needs: short names keep the full size,
// long ones step down (to at most MIN_NAME_SCALE of the base) until the whole name
// fits the column on one line.
const MIN_NAME_SCALE = 0.5;

// Base name size in px. Portrait boards (the vertical kiosk) are narrow relative to
// their height, so the vh-derived base is scaled down before any per-name fitting.
function getNameBasePx(isMobile: boolean, isPortrait: boolean, viewportH: number): number {
    if (isMobile) return 12;
    const base = 1.55 * (viewportH / 100);
    return isPortrait ? base * 0.8 : base;
}

function AutoFitName({ text, basePx, style }: { text: string; basePx: number; style?: CSSProperties }) {
    const boxRef = useRef<HTMLSpanElement | null>(null);
    const textRef = useRef<HTMLSpanElement | null>(null);
    const [fontPx, setFontPx] = useState(basePx);

    useLayoutEffect(() => {
        const fit = () => {
            const box = boxRef.current;
            const el = textRef.current;
            if (!box || !el) return;
            const avail = box.clientWidth;
            if (!avail) return;
            const minPx = Math.max(7, basePx * MIN_NAME_SCALE);
            el.style.fontSize = `${basePx}px`;
            const full = el.getBoundingClientRect().width;
            let next = basePx;
            if (full > avail) {
                // Text width scales roughly linearly with the font size — estimate once,
                // then nudge down for kerning/rounding until it really fits.
                next = Math.max(minPx, Math.floor(basePx * (avail / full) * 10) / 10);
                el.style.fontSize = `${next}px`;
                let guard = 12;
                while (el.getBoundingClientRect().width > avail && next > minPx && guard-- > 0) {
                    next = Math.max(minPx, next - 0.3);
                    el.style.fontSize = `${next}px`;
                }
            }
            setFontPx(next);
        };
        fit();
        const box = boxRef.current;
        if (!box || typeof ResizeObserver === 'undefined') return;
        const ro = new ResizeObserver(fit);
        ro.observe(box);
        return () => ro.disconnect();
    }, [text, basePx]);

    return (
        <span ref={boxRef} style={{ flex: 1, minWidth: 0, overflow: 'hidden', display: 'block' }}>
            <span ref={textRef} style={{ ...style, fontSize: `${fontPx}px`, whiteSpace: 'nowrap', display: 'inline-block' }}>
                {text}
            </span>
        </span>
    );
}

export default function OverallWinnersBySlugPage() {
    const { language, setLanguage } = useLanguage();
    const { isAuthenticated } = useAuth();
    const params = useParams();
    const slug = params.slug as string;
    const searchParams = useSearchParams();
    const categoryFromUrl = searchParams.get('category') || '';

    const [campaign, setCampaign] = useState<Campaign | null>(null);
    const [campaignNotFound, setCampaignNotFound] = useState(false);
    const [selectedCategory, setSelectedCategory] = useState<string>('');
    // displayedRunners always holds the last successfully loaded data — never cleared between refreshes
    const [displayedRunners, setDisplayedRunners] = useState<Runner[]>([]);
    const [initialLoading, setInitialLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [countdown, setCountdown] = useState(REFRESH_INTERVAL);
    const refreshTimerRef = useRef<NodeJS.Timeout | null>(null);
    const countdownRef = useRef<NodeJS.Timeout | null>(null);
    const [isMobile, setIsMobile] = useState(false);
    const [isPortrait, setIsPortrait] = useState(false);
    // Name sizing is measured in px, so the vh base has to follow the real viewport.
    const [viewportH, setViewportH] = useState(1080);
    const [autoMode, setAutoMode] = useState(false);
    const [autoCountdown, setAutoCountdown] = useState(10);
    const autoTimerRef = useRef<NodeJS.Timeout | null>(null);
    const autoCountdownRef = useRef<NodeJS.Timeout | null>(null);
    const campaignCategoriesRef = useRef<CampaignCategory[]>([]);
    const displayedCategoryRef = useRef<string>('');
    const [downloading, setDownloading] = useState<string | null>(null);
    const maleColRef = useRef<HTMLDivElement | null>(null);
    const femaleColRef = useRef<HTMLDivElement | null>(null);
    const [dropdownOpen, setDropdownOpen] = useState(false);
    const dropdownRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const check = () => {
            setIsMobile(window.innerWidth < 768);
            setIsPortrait(window.innerHeight > window.innerWidth);
            setViewportH(window.innerHeight);
        };
        check();
        window.addEventListener('resize', check);
        window.addEventListener('orientationchange', check);
        return () => {
            window.removeEventListener('resize', check);
            window.removeEventListener('orientationchange', check);
        };
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

        const hasExistingData = displayedRunners.length > 0;

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
        const handler = (e: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) setDropdownOpen(false);
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, []);

    useEffect(() => {
        if (!autoMode) {
            if (autoTimerRef.current) clearInterval(autoTimerRef.current);
            if (autoCountdownRef.current) clearInterval(autoCountdownRef.current);
            return;
        }
        setAutoCountdown(10);
        autoCountdownRef.current = setInterval(() => {
            setAutoCountdown(prev => (prev <= 1 ? 1 : prev - 1));
        }, 1000);
        autoTimerRef.current = setInterval(() => {
            setAutoCountdown(10);
            setSelectedCategory(prev => {
                const cats = campaignCategoriesRef.current;
                if (!cats.length) return prev;
                const idx = cats.findIndex(c => c.name === prev);
                return cats[(idx + 1) % cats.length].name;
            });
        }, 10000);
        return () => {
            if (autoTimerRef.current) clearInterval(autoTimerRef.current);
            if (autoCountdownRef.current) clearInterval(autoCountdownRef.current);
        };
    }, [autoMode]);

    // Rank count is configured per distance (admin/top-overall), falling back to the
    // campaign-wide count for distances with no override.
    const topN = resolveOverallDisplayCount(campaign, selectedCategory);
    // Nationality-split categories use the Thai count (set via admin/age-group-ranking's
    // "คนไทย" input), falling back to the distance's overall count. Foreign/international
    // runners are excluded from this page entirely — see /Nationality-Winners for those.
    const thaiTopN = campaign?.excludeOverallThaiFromAgeGroup != null
        ? Math.max(1, Number(campaign.excludeOverallThaiFromAgeGroup) || 5)
        : topN;
    // Nationality split applies per race category — only when the selected category is in the list
    const separateNat = isNationalitySplitCategory(campaign?.separateOverallNationalityCategories, selectedCategory);
    // Events with no gender split (e.g. a dog race) show ONE combined Overall column;
    // `maleWinners` then carries the whole field and `femaleWinners` stays empty.
    const genderSplit = isGenderSplitEnabled(campaign);

    const { maleWinners, femaleWinners } = useMemo(() => {
        const finished = displayedRunners.filter(r => r.status === 'finished' && (r.netTime || r.gunTime || r.elapsedTime));
        const sorted = [...finished].sort((a, b) => {
            const at = a.gunTime || a.netTime || a.elapsedTime || Infinity; // Overall = gun time
            const bt = b.gunTime || b.netTime || b.elapsedTime || Infinity;
            return at - bt;
        });
        if (separateNat) {
            const pick = (isFemale: boolean | null) =>
                sorted.filter(r => (isFemale === null || (r.gender === 'F') === isFemale) && isThaiNationality(r.nationality)).slice(0, thaiTopN);
            return {
                maleWinners: pick(genderSplit ? false : null),
                femaleWinners: genderSplit ? pick(true) : [],
            };
        }
        return {
            maleWinners: (genderSplit ? sorted.filter(r => r.gender !== 'F') : sorted).slice(0, topN),
            femaleWinners: genderSplit ? sorted.filter(r => r.gender === 'F').slice(0, topN) : [],
        };
    }, [displayedRunners, topN, thaiTopN, separateNat, genderSplit]);

    // Exports only the currently-selected distance (not every distance in the campaign).
    // Nationality-split status is evaluated for the selected category since it's configured per category.
    const downloadGroup = useCallback(async (
        _males: Runner[],
        _females: Runner[],
        gender: 'male' | 'female' | 'both' = 'both',
        namePart = '',
    ) => {
        if (!campaign?._id) return;
        setDownloading('landscape');
        try {
            const distance = campaign.categories?.find(c => c.name === selectedCategory)?.distance;
            const blob = await downloadSelectedDistance<Runner>({
                campaignName: campaign.name || '',
                selectedCategory,
                distance,
                currentRunners: displayedRunners,
                gender,
                nameLang: language,
                combined: !genderSplit,
                computeWinners: (runners, categoryName) => {
                    const topNForCat = resolveOverallDisplayCount(campaign, categoryName);
                    const thaiTopNForCat = campaign.excludeOverallThaiFromAgeGroup != null
                        ? Math.max(1, Number(campaign.excludeOverallThaiFromAgeGroup) || 5)
                        : topNForCat;
                    const separateNatForCat = isNationalitySplitCategory(campaign.separateOverallNationalityCategories, categoryName);
                    const finished = runners.filter(r => r.status === 'finished' && (r.netTime || r.gunTime || r.elapsedTime));
                    const sorted = [...finished].sort((a, b) => {
                        const at = a.gunTime || a.netTime || a.elapsedTime || Infinity; // Overall = gun time
                        const bt = b.gunTime || b.netTime || b.elapsedTime || Infinity;
                        return at - bt;
                    });
                    if (separateNatForCat) {
                        const pick = (isFemale: boolean | null) =>
                            sorted.filter(r => (isFemale === null || (r.gender === 'F') === isFemale) && isThaiNationality(r.nationality)).slice(0, thaiTopNForCat);
                        return { maleRunners: pick(genderSplit ? false : null), femaleRunners: genderSplit ? pick(true) : [] };
                    }
                    return {
                        maleRunners: (genderSplit ? sorted.filter(r => r.gender !== 'F') : sorted).slice(0, topNForCat),
                        femaleRunners: genderSplit ? sorted.filter(r => r.gender === 'F').slice(0, topNForCat) : [],
                    };
                },
            });
            triggerSingleDistanceDownload(blob, campaign.name || '', `Overall${namePart}`, selectedCategory, distance, gender, !genderSplit);
        } catch (e) { console.error(e); } finally {
            setDownloading(null);
        }
    }, [campaign, selectedCategory, displayedRunners, language, genderSplit]);

    const downloadLandscape = useCallback((gender: 'male' | 'female' | 'both' = 'both') =>
        downloadGroup(maleWinners, femaleWinners, gender),
        [downloadGroup, maleWinners, femaleWinners]);

    const rankBg = ['#f59e0b', '#9ca3af', '#92400e', '#e2e8f0', '#e2e8f0'];
    const rankFg = ['#000', '#fff', '#fff', '#475569', '#475569'];

    // Events with the Overall award switched off (admin/top-overall) have no board
    // to show — say so instead of rendering an empty ranking.
    if (campaign && campaign.overallEnabled === false) {
        return (
            <div style={{ fontFamily: "'Prompt', 'Inter', sans-serif", background: '#0f172a', height: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                <div style={{ fontSize: 72, marginBottom: 24 }}>🚫</div>
                <div style={{ fontSize: 26, fontWeight: 900, color: '#f59e0b', marginBottom: 8 }}>งานนี้ไม่มีรางวัล Overall</div>
                <div style={{ fontSize: 16, color: '#94a3b8' }}>Overall is turned off for this event</div>
                <div style={{ fontSize: 14, color: '#64748b', marginTop: 20 }}>{campaign.name}</div>
            </div>
        );
    }

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

    const nameBasePx = getNameBasePx(isMobile, isPortrait, viewportH);

    const renderRunnerRow = (runner: Runner, idx: number) => {
        const fullName = language === 'th' && runner.firstNameTh
            ? `${runner.bib}  ${runner.firstNameTh} ${runner.lastNameTh || ''}`
            : `${runner.bib}  ${runner.firstName} ${runner.lastName}`;
        return (
        <div key={runner._id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: isMobile ? '4px 8px' : '0.4vh 10px', borderRadius: 6, background: idx === 0 ? '#fffbeb' : 'transparent', height: isMobile ? 'auto' : '4vh', minHeight: isMobile ? 30 : 30 }}>
            <div style={{ width: isMobile ? 22 : '2.4vh', height: isMobile ? 22 : '2.4vh', minWidth: 18, minHeight: 18, borderRadius: 4, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: isMobile ? 12 : '1.4vh', fontWeight: 900, flexShrink: 0, background: rankBg[idx] || '#e2e8f0', color: rankFg[idx] || '#475569' }}>
                {idx + 1}
            </div>
            <AutoFitName text={fullName} basePx={nameBasePx} style={{ fontWeight: 700, color: '#1e293b', textTransform: 'uppercase' }} />
            <span style={{ fontFamily: 'monospace', fontWeight: 800, fontSize: isMobile ? 11 : '1.5vh', color: '#1e293b', flexShrink: 0, minWidth: isMobile ? 60 : '7vh', textAlign: 'right' }}>
                {runner.gunTimeStr || formatTime(runner.gunTime)}
            </span>
        </div>
        );
    };

    const renderEmptyRow = (idx: number) => (
        <div key={`empty-${idx}`} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: isMobile ? '4px 8px' : '0.4vh 10px', height: isMobile ? 'auto' : '4vh', minHeight: isMobile ? 30 : 30 }}>
            <div style={{ width: isMobile ? 22 : '2.4vh', height: isMobile ? 22 : '2.4vh', minWidth: 18, minHeight: 18, borderRadius: 4, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: isMobile ? 12 : '1.4vh', fontWeight: 900, flexShrink: 0, background: '#f1f5f9', color: '#cbd5e1' }}>
                {idx + 1}
            </div>
            <span style={{ fontSize: isMobile ? 11 : '1.2vh', color: '#cbd5e1', fontStyle: 'italic', flex: 1 }}>—</span>
            <span style={{ minWidth: isMobile ? 60 : '7vh' }} />
        </div>
    );

    const dlIcon = (size = 12) => (
        <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <line x1="8" y1="1" x2="8" y2="11"/><polyline points="4 7 8 11 12 7"/><line x1="2" y1="14" x2="14" y2="14"/>
        </svg>
    );

    const renderColumn = (title: string, bgHeader: string, list: Runner[], colRef: { current: HTMLDivElement | null }, onDownload: () => void, rankCount: number = topN) => {
        const headerFontSize = isMobile ? (separateNat ? 13 : 16) : (separateNat ? '1.5vh' : '2vh');
        const dlButtonStyle: CSSProperties = { background: 'rgba(255,255,255,0.18)', border: 'none', borderRadius: 5, cursor: downloading ? 'default' : 'pointer', padding: isMobile ? '3px 6px' : '3px 8px', color: 'white', fontSize: isMobile ? 11 : 12, display: 'flex', alignItems: 'center', gap: 4, fontWeight: 700, flexShrink: 0 };
        return (
        <div ref={el => { colRef.current = el; }} style={{ display: 'flex', flexDirection: 'column', gap: isMobile ? 8 : '0.8vh', minHeight: 0, flex: 1, overflowY: isMobile ? 'visible' : 'auto', paddingRight: isMobile ? 0 : 4 }}>
            <div style={{ padding: isMobile ? '8px 10px' : '0.9vh 10px', fontWeight: 900, fontSize: headerFontSize, textTransform: 'uppercase', borderRadius: 8, color: 'white', letterSpacing: separateNat ? 1 : 2, background: bgHeader, flexShrink: 0, display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ ...dlButtonStyle, visibility: 'hidden' }} aria-hidden="true">
                    {dlIcon(11)}
                </span>
                <span style={{ flex: 1, textAlign: 'center', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{title}</span>
                <button data-no-capture onClick={onDownload} disabled={!!downloading} title="Download" aria-label="Download" style={{ ...dlButtonStyle, opacity: downloading ? 0.5 : 1, transition: 'opacity 0.15s' }}>
                    {dlIcon(11)}
                </button>
            </div>
            <div style={{ background: 'white', border: '1px solid #e2e8f0', borderRadius: 8, overflow: 'hidden', display: 'flex', flexDirection: 'column', flexShrink: 0, minHeight: isMobile ? 180 : '28vh' }}>
                <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'flex-start', flex: 1, padding: isMobile ? '4px' : '0.35vh 4px', minHeight: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: isMobile ? '2px 10px 3px' : '0.1vh 10px 0.2vh', borderBottom: '1px solid #f1f5f9' }}>
                        <div style={{ width: isMobile ? 22 : '2.4vh', minWidth: 18, flexShrink: 0 }} />
                        <span style={{ fontSize: isMobile ? 9 : '1.1vh', fontWeight: 700, color: '#94a3b8', flex: 1, textTransform: 'uppercase', letterSpacing: 0.5 }}>Name</span>
                        <span style={{ fontSize: isMobile ? 9 : '1.1vh', fontWeight: 700, color: '#94a3b8', flexShrink: 0, minWidth: isMobile ? 60 : '7vh', textAlign: 'right', letterSpacing: 0.5 }}>GunTime</span>
                    </div>
                    {Array.from({ length: rankCount }, (_, i) => i).map(i => list[i] ? renderRunnerRow(list[i], i) : renderEmptyRow(i))}
                </div>
            </div>
        </div>
        );
    };

    return (
        <div style={{ fontFamily: "'Prompt', 'Inter', sans-serif", background: '#0f172a', height: isMobile ? 'auto' : '100vh', minHeight: '100vh', overflow: isMobile ? 'auto' : 'hidden', display: 'flex', flexDirection: 'column', padding: isMobile ? '8px' : '0.8vh 1vw' }}>
            <style>{`@keyframes pulse { 0%,100% { opacity:1 } 50% { opacity:0.3 } }`}</style>
            {/* On mobile, hide the control header for public viewers who are not logged in. */}
            {!(isMobile && !isAuthenticated) && (
            <header style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', justifyContent: 'space-between', alignItems: isMobile ? 'stretch' : 'center', padding: isMobile ? '10px 12px' : '0.6vh 1.5vw', background: '#1e293b', borderRadius: 10, marginBottom: isMobile ? 8 : '0.8vh', flexShrink: 0, border: '1px solid #334155', gap: isMobile ? 8 : 0 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Link href="/" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <Image src="/logo-white.png" alt="ACTION" width={120} height={40} style={{ height: isMobile ? 28 : '3.5vh', width: 'auto' }} />
                    </Link>

                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        {refreshing && <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: '#22c55e', animation: 'pulse 0.8s ease-in-out infinite' }} />}
                        <span style={{ fontSize: isMobile ? 10 : '1.1vh', color: '#94a3b8', fontFamily: 'monospace' }}>
                            {refreshing ? 'Updating...' : `Refresh ${countdown}s`}
                        </span>
                    </div>
                </div>

                <div style={{ display: 'flex', alignItems: isMobile ? 'stretch' : 'center', gap: isMobile ? 6 : '1vw', flexDirection: isMobile ? 'column' : 'row' }}>
                    {/* The event name is printed big on the title bar below — repeating it
                        here only squeezed the ACTION logo, so the header stays controls-only. */}
                    {campaign && !initialLoading && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                            <NameLangToggle value={language} onChange={setLanguage} isMobile={isMobile} />
                            <button
                                onClick={() => downloadLandscape('both')}
                                disabled={!!downloading}
                                title="Download Overall Winners (Excel)"
                                aria-label="Download Overall Winners (Excel)"
                                style={{ display: 'flex', alignItems: 'center', gap: 5, padding: isMobile ? '5px 10px' : '0.35vh 0.7vw', background: '#1d4ed8', border: '1px solid #2563eb', borderRadius: 7, color: 'white', fontSize: isMobile ? 11 : '1.15vh', fontWeight: 800, cursor: 'pointer', whiteSpace: 'nowrap', opacity: downloading ? 0.6 : 1, transition: 'opacity 0.15s', fontFamily: "'Prompt','Inter',sans-serif" }}
                            >
                                <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="8" y1="1" x2="8" y2="11"/><polyline points="4 7 8 11 12 7"/><line x1="2" y1="14" x2="14" y2="14"/></svg>
                            </button>
                        </div>
                    )}

                    {campaign?.categories && campaign.categories.length > 0 && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                            <div ref={dropdownRef} style={{ position: 'relative' }}>
                                <button
                                    onClick={() => setDropdownOpen(d => !d)}
                                    style={{ display: 'flex', alignItems: 'center', gap: 8, padding: isMobile ? '6px 12px' : '0.4vh 0.8vw', background: '#0f172a', border: `1px solid ${dropdownOpen ? '#38bdf8' : '#475569'}`, borderRadius: 8, color: '#f1f5f9', fontSize: isMobile ? 12 : '1.3vh', fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap', fontFamily: "'Prompt', 'Inter', sans-serif" }}
                                >
                                    {selectedCategory
                                        ? `${selectedCategory}${campaign.categories.find(c => c.name === selectedCategory)?.distance ? ` (${campaign.categories.find(c => c.name === selectedCategory)!.distance})` : ''}`
                                        : 'เลือกระยะ'}
                                    <span style={{ fontSize: 10, opacity: 0.6, transform: dropdownOpen ? 'rotate(180deg)' : 'none', display: 'inline-block', transition: 'transform 0.15s' }}>▾</span>
                                </button>
                                {dropdownOpen && (
                                    <div style={{ position: 'absolute', top: 'calc(100% + 4px)', right: 0, background: '#1e293b', border: '1px solid #475569', borderRadius: 8, overflow: 'hidden', zIndex: 100, minWidth: 180, boxShadow: '0 8px 24px rgba(0,0,0,0.5)' }}>
                                        {campaign.categories.map((cat, i) => (
                                            <button
                                                key={cat.name}
                                                onClick={() => { setSelectedCategory(cat.name); setAutoMode(false); setDropdownOpen(false); }}
                                                style={{ display: 'block', width: '100%', textAlign: 'left', padding: '10px 16px', background: selectedCategory === cat.name ? 'rgba(56,189,248,0.15)' : 'transparent', border: 'none', borderBottom: i < campaign.categories!.length - 1 ? '1px solid #334155' : 'none', color: selectedCategory === cat.name ? '#38bdf8' : '#cbd5e1', fontSize: isMobile ? 13 : '1.3vh', fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap', fontFamily: "'Prompt', 'Inter', sans-serif" }}
                                            >
                                                {cat.name}{cat.distance ? ` (${cat.distance})` : ''}
                                            </button>
                                        ))}
                                    </div>
                                )}
                            </div>
                            {campaign.categories.length > 1 && (
                                <button
                                    onClick={() => setAutoMode(m => !m)}
                                    style={{ display: 'flex', alignItems: 'center', gap: 6, padding: isMobile ? '6px 12px' : '0.4vh 0.8vw', background: autoMode ? '#38bdf8' : 'transparent', border: `1px solid ${autoMode ? '#38bdf8' : '#475569'}`, borderRadius: 8, color: autoMode ? '#082f49' : '#94a3b8', fontSize: isMobile ? 12 : '1.3vh', fontWeight: 800, cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0, minWidth: isMobile ? 80 : 72, justifyContent: 'center', transition: 'background 0.2s, color 0.2s, border-color 0.2s' }}
                                >
                                    {autoMode ? `⏸ ${autoCountdown}s` : '▶ AUTO'}
                                </button>
                            )}
                        </div>
                    )}
                </div>
            </header>
            )}

            {!(isMobile && !isAuthenticated) && campaign && (
                <div style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', alignItems: 'center', justifyContent: 'center', gap: isMobile ? 4 : '0.8vw', padding: isMobile ? '8px 12px' : '0.5vh 1.5vw', background: '#1e293b', borderRadius: 10, marginBottom: isMobile ? 8 : '0.8vh', border: '1px solid #334155', flexShrink: 0, textAlign: 'center' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
                        <span style={{ fontSize: isMobile ? 15 : '2.2vh', fontWeight: 900, color: '#f1f5f9', letterSpacing: 0.5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: isMobile ? '100%' : '55vw' }}>
                            {campaign.name}
                        </span>
                        <span style={{ color: '#38bdf8', fontWeight: 900, fontSize: isMobile ? 11 : '1.4vh', letterSpacing: 1.5, textTransform: 'uppercase', whiteSpace: 'nowrap' }}>Overall Winners {topN}</span>
                    </div>
                    {/* Which distance this board is showing — the audience reads it from
                        across the room, so it sits next to the event name, not only in
                        the small selector up in the header. */}
                    {selectedCategory && (
                        <span style={{ display: 'inline-flex', alignItems: 'center', background: '#38bdf8', color: '#082f49', borderRadius: 999, fontWeight: 900, fontSize: isMobile ? 13 : '1.8vh', letterSpacing: 0.5, padding: isMobile ? '3px 14px' : '0.2vh 1.2vw', whiteSpace: 'nowrap', flexShrink: 0 }}>
                            {selectedCategory}{campaign.categories?.find(c => c.name === selectedCategory)?.distance ? ` · ${campaign.categories.find(c => c.name === selectedCategory)!.distance}` : ''}
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
                    {!genderSplit ? (
                        // No gender split — one combined board, held to half the screen
                        // width on desktop so rows keep the size the two-column layout gives them.
                        <div style={{ display: 'flex', flexDirection: 'column', minHeight: 0, flex: isMobile ? undefined : '0 1 50%', width: isMobile ? '100%' : undefined, margin: isMobile ? undefined : '0 auto' }}>
                            {renderColumn(
                                separateNat ? '🏅 OVERALL THA' : '🏅 OVERALL',
                                '#059669', maleWinners, maleColRef,
                                () => downloadGroup(maleWinners, femaleWinners, 'both', separateNat ? '-THA' : ''),
                                separateNat ? thaiTopN : topN,
                            )}
                        </div>
                    ) : separateNat ? (
                        <>
                            {renderColumn('♂ OVERALL THA · MALE', '#2563eb', maleWinners, maleColRef, () => downloadGroup(maleWinners, femaleWinners, 'male', '-THA'), thaiTopN)}
                            {renderColumn('♀ OVERALL THA · FEMALE', '#db2777', femaleWinners, femaleColRef, () => downloadGroup(maleWinners, femaleWinners, 'female', '-THA'), thaiTopN)}
                        </>
                    ) : (
                        <>
                            {renderColumn('♂ MALE OVERALL', '#2563eb', maleWinners, maleColRef, () => downloadLandscape('male'))}
                            {renderColumn('♀ FEMALE OVERALL', '#db2777', femaleWinners, femaleColRef, () => downloadLandscape('female'))}
                        </>
                    )}
                </div>
            )}
        </div>
    );
}
