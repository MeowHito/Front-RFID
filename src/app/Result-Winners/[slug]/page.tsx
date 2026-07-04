'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useEffect, useState, useMemo, useRef, useCallback } from 'react';
import { buildWinnersExcel, triggerExcelDownload, ExcelSection } from '@/lib/winner-excel';
import { isThaiNationality, isNationalitySplitCategory } from '@/lib/nationality';
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
    nationality?: string;
    netTime?: number;
    gunTime?: number;
    elapsedTime?: number;
    netTimeStr?: string;
    gunTimeStr?: string;
    overallRank?: number;
    genderRank?: number;
    categoryRank?: number;
    ageGroupRank?: number;
    ageGroupNetRank?: number;
}

interface Campaign {
    _id: string;
    name: string;
    nameTh?: string;
    nameEn?: string;
    slug?: string;
    uuid?: string;
    categories?: { name: string; distance?: string }[];
    ageGroupDisplayCount?: number;
    overallDisplayCount?: number;
    excludeOverallFromAgeGroup?: number;
    excludeOverallThaiFromAgeGroup?: number;
    excludeOverallForeignFromAgeGroup?: number;
    excludeAgeGroupTop?: number;
    separateOverallNationalityCategories?: string[];
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

const OVERALL_GROUP: AgeGroupBucket = { label: 'OVERALL', min: 0, max: 999 };

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
        return { label, min: parseInt(rangeMatch[1]), max: parseInt(rangeMatch[2]) };
    }

    const underMatch = label.match(/(?:u|under)\s*(\d+)/i);
    if (underMatch) {
        const max = parseInt(underMatch[1]) - 1;
        return { label, min: 0, max: max >= 0 ? max : 0 };
    }

    const plusMatch = label.match(/(\d+)\s*\+/);
    if (plusMatch) {
        return { label, min: parseInt(plusMatch[1]), max: 999 };
    }

    return null;
}


function formatTime(ms: number | undefined | null): string {
    if (ms === undefined || ms === null || ms <= 0) return '-';
    const hours = Math.floor(ms / 3600000);
    const minutes = Math.floor((ms % 3600000) / 60000);
    const seconds = Math.floor((ms % 60000) / 1000);
    return `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}


const REFRESH_INTERVAL = 10;

export default function ResultWinnersBySlugPage() {
    const params = useParams();
    const slug = params.slug as string;

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
    const [autoMode, setAutoMode] = useState(false);
    const [autoCountdown, setAutoCountdown] = useState(5);
    const autoTimerRef = useRef<NodeJS.Timeout | null>(null);
    const autoCountdownRef = useRef<NodeJS.Timeout | null>(null);
    const campaignCategoriesRef = useRef<{ name: string; distance?: string }[]>([]);
    const [ageGroupCategories, setAgeGroupCategories] = useState<{ name: string; distance?: string }[] | null>(null);
    const [dropdownOpen, setDropdownOpen] = useState(false);
    const dropdownRef = useRef<HTMLDivElement>(null);
    const [volume, setVolume] = useState(1);
    const [downloading, setDownloading] = useState<string | null>(null);
    const maleColRef = useRef<HTMLDivElement | null>(null);
    const femaleColRef = useRef<HTMLDivElement | null>(null);
    const maleAgeGroupRefs = useRef<Record<string, HTMLDivElement | null>>({});
    const femaleAgeGroupRefs = useRef<Record<string, HTMLDivElement | null>>({});
    const volumeRef = useRef(1);
    const prevFinishedIdsRef = useRef<Set<string> | null>(null);
    // Track category for which data is currently displayed — clears old data only when category actually changes
    const displayedCategoryRef = useRef<string>('');

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
                        if (data.categories?.length > 0) setSelectedCategory(data.categories[0].name);
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

        // Only show full loading screen when switching to a new category with no data yet
        const categoryChanged = displayedCategoryRef.current !== selectedCategory;
        const hasExistingData = displayedRunners.length > 0 && !categoryChanged;

        if (!hasExistingData) setInitialLoading(true);
        if (isRefresh || hasExistingData) setRefreshing(true);

        try {
            const p = new URLSearchParams({ campaignId: campaign._id, category: selectedCategory, limit: '10000', skipStatusCounts: 'true' });
            const res = await fetch(`/api/runners/paged?${p.toString()}`, { cache: 'no-store' });
            if (res.ok) {
                const data = await res.json();
                const newRunners = data.data || [];
                // Atomically swap — no blank flash between old and new data
                setDisplayedRunners(newRunners);
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

    // Check which categories have any runner with ageGroup set (from RaceTiger)
    useEffect(() => {
        if (!campaign?._id || !campaign.categories?.length) return;
        const campaignId = campaign._id;
        const cats = campaign.categories;
        setAgeGroupCategories(null);
        Promise.all(
            cats.map(async cat => {
                try {
                    const p = new URLSearchParams({ campaignId, category: cat.name, limit: '1', skipStatusCounts: 'true' });
                    const res = await fetch(`/api/runners/paged?${p.toString()}`, { cache: 'no-store' });
                    if (!res.ok) return null;
                    const data = await res.json();
                    return data.data?.[0]?.ageGroup ? cat : null;
                } catch { return null; }
            })
        ).then(results => {
            const filtered = results.filter((c): c is { name: string; distance?: string } => c !== null);
            setAgeGroupCategories(filtered);
            if (filtered.length > 0) {
                setSelectedCategory(prev => filtered.some(c => c.name === prev) ? prev : filtered[0].name);
            }
        });
    }, [campaign?._id]); // eslint-disable-line react-hooks/exhaustive-deps

    useEffect(() => {
        campaignCategoriesRef.current = ageGroupCategories ?? campaign?.categories ?? [];
    }, [campaign, ageGroupCategories]);

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

    useEffect(() => { volumeRef.current = volume; }, [volume]);
    useEffect(() => { prevFinishedIdsRef.current = null; }, [selectedCategory]);

    useEffect(() => {
        const finishedNow = new Set(
            displayedRunners
                .filter(r => r.status === 'finished' && (r.netTime || r.gunTime))
                .map(r => r._id)
        );
        if (prevFinishedIdsRef.current === null) { prevFinishedIdsRef.current = finishedNow; return; }
        const newIds = [...finishedNow].filter(id => !prevFinishedIdsRef.current!.has(id));
        prevFinishedIdsRef.current = finishedNow;
        if (newIds.length === 0) return;
        newIds.forEach((_, i) => {
            setTimeout(() => {
                const audio = new Audio('/paysound.mp3');
                audio.volume = volumeRef.current;
                audio.play().catch(() => {});
            }, i * 400);
        });
    }, [displayedRunners]);

    useEffect(() => {
        const handler = (e: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) setDropdownOpen(false);
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, []);

    const disableAgeGroupRanking = false;
    const topN = Math.max(1, campaign?.ageGroupDisplayCount || 5);

    const activeAgeGroups = useMemo(() => {
        if (disableAgeGroupRanking) return [OVERALL_GROUP];
        const seen = new Map<string, AgeGroupBucket>();
        for (const r of displayedRunners) {
            if (r.status !== 'finished') continue;
            const label = normalizeAgeGroupLabel(r.ageGroup);
            if (!label || seen.has(label)) continue;
            const bucket = parseAgeGroupBucket(label);
            seen.set(label, bucket ?? { label, min: 999, max: 999 });
        }
        const buckets = Array.from(seen.values());
        buckets.sort((a, b) => a.min !== b.min ? a.min - b.min : a.max - b.max);
        return buckets.length > 0 ? buckets : DEFAULT_AGE_GROUPS;
    }, [displayedRunners, disableAgeGroupRanking]);

    const { maleWinners, femaleWinners } = useMemo(() => {
        const finished = displayedRunners.filter(r => r.status === 'finished' && (r.netTime || r.gunTime));

        // Build excluded bibs — top N male + top N female by overall time
        const excludeOv = Math.max(0, campaign?.excludeOverallFromAgeGroup || 0);
        const excludeAG = Math.max(0, campaign?.excludeAgeGroupTop || 0);
        const excludedBibs = new Set<string>();
        const byTime = (a: Runner, b: Runner) =>
            (a.netTime || a.gunTime || a.elapsedTime || Infinity) - (b.netTime || b.gunTime || b.elapsedTime || Infinity);
        if (excludeOv > 0) {
            finished.filter(r => r.gender !== 'F').sort(byTime).slice(0, excludeOv).forEach(r => excludedBibs.add(r.bib));
            finished.filter(r => r.gender === 'F').sort(byTime).slice(0, excludeOv).forEach(r => excludedBibs.add(r.bib));
        }
        // Nationality-split categories: top Thai / foreign overall winners (per gender)
        // are excluded from age-group awards. Each bucket's exclude count is
        // independently configurable, falling back to `overallDisplayCount` if unset.
        if (isNationalitySplitCategory(campaign?.separateOverallNationalityCategories, selectedCategory)) {
            const overallTopN = Math.max(1, campaign?.overallDisplayCount || 5);
            const excludeNatCount: Record<'thai' | 'foreign', number> = {
                thai: campaign?.excludeOverallThaiFromAgeGroup != null ? Math.max(0, campaign.excludeOverallThaiFromAgeGroup) : overallTopN,
                foreign: campaign?.excludeOverallForeignFromAgeGroup != null ? Math.max(0, campaign.excludeOverallForeignFromAgeGroup) : overallTopN,
            };
            for (const female of [false, true]) {
                for (const thai of [true, false]) {
                    finished
                        .filter(r => (r.gender === 'F') === female && isThaiNationality(r.nationality) === thai)
                        .sort(byTime)
                        .slice(0, excludeNatCount[thai ? 'thai' : 'foreign'])
                        .forEach(r => excludedBibs.add(r.bib));
                }
            }
        }

        // Sort by RaceTiger's ageGroupRank; fall back to netTime for runners without a rank yet
        const sorted = [...finished].sort((a, b) => {
            const ar = (a.ageGroupRank && a.ageGroupRank > 0) ? a.ageGroupRank : Infinity;
            const br = (b.ageGroupRank && b.ageGroupRank > 0) ? b.ageGroupRank : Infinity;
            if (ar !== br) return ar - br;
            return (a.netTime || a.gunTime || a.elapsedTime || Infinity) - (b.netTime || b.gunTime || b.elapsedTime || Infinity);
        });

        const maleWinners: Record<string, Runner[]> = {};
        const femaleWinners: Record<string, Runner[]> = {};
        for (const g of activeAgeGroups) { maleWinners[g.label] = []; femaleWinners[g.label] = []; }

        for (const runner of sorted) {
            if (excludedBibs.has(runner.bib)) continue;
            if (excludeAG > 0 && runner.ageGroupRank && runner.ageGroupRank > 0 && runner.ageGroupRank <= excludeAG) continue;
            const ag = disableAgeGroupRanking ? OVERALL_GROUP.label : normalizeAgeGroupLabel(runner.ageGroup);
            if (!ag) continue;
            const bucket = runner.gender === 'F' ? femaleWinners : maleWinners;
            if (ag in bucket && bucket[ag].length < topN) bucket[ag].push(runner);
        }
        return { maleWinners, femaleWinners };
    }, [displayedRunners, activeAgeGroups, disableAgeGroupRanking, topN, campaign, selectedCategory]);

    const downloadSection = useCallback(async (ageGroupLabel: string, gender: 'male' | 'female' | 'both' = 'both') => {
        const key = gender === 'both' ? ageGroupLabel : `${gender}-${ageGroupLabel}`;
        setDownloading(key);
        try {
            const sections: ExcelSection[] = [{
                label: ageGroupLabel === 'OVERALL' ? undefined : ageGroupLabel,
                maleRunners: maleWinners[ageGroupLabel] || [],
                femaleRunners: femaleWinners[ageGroupLabel] || [],
            }];
            const suffix = gender === 'male' ? '-Male' : gender === 'female' ? '-Female' : '';
            const distance = campaign?.categories?.find(c => c.name === selectedCategory)?.distance || selectedCategory || '';
            const distPart = distance ? `-${distance}` : '';
            const blob = await buildWinnersExcel(campaign?.name || '', selectedCategory, sections, gender);
            if (blob) triggerExcelDownload(blob, `${campaign?.name || 'winners'}${distPart}-AgeGroup-${ageGroupLabel}${suffix}`);
        } catch (e) { console.error(e); } finally {
            setDownloading(null);
        }
    }, [campaign, selectedCategory, maleWinners, femaleWinners]);

    const downloadAll = useCallback(async (gender: 'male' | 'female' | 'both' = 'both') => {
        setDownloading(gender === 'both' ? 'all' : `all-${gender}`);
        try {
            const sections: ExcelSection[] = activeAgeGroups.map(g => ({
                label: g.label === 'OVERALL' ? undefined : g.label,
                maleRunners: maleWinners[g.label] || [],
                femaleRunners: femaleWinners[g.label] || [],
            }));
            const suffix = gender === 'male' ? '-Male' : gender === 'female' ? '-Female' : '';
            const distance = campaign?.categories?.find(c => c.name === selectedCategory)?.distance || selectedCategory || '';
            const distPart = distance ? `-${distance}` : '';
            const blob = await buildWinnersExcel(campaign?.name || '', selectedCategory, sections, gender);
            if (blob) triggerExcelDownload(blob, `${campaign?.name || 'winners'}${distPart}-AgeGroup-All${suffix}`);
        } catch (e) { console.error(e); } finally {
            setDownloading(null);
        }
    }, [activeAgeGroups, campaign, selectedCategory, maleWinners, femaleWinners]);

    const rankBg = ['#f59e0b', '#9ca3af', '#92400e', '#e2e8f0', '#e2e8f0'];
    const rankFg = ['#000', '#fff', '#fff', '#475569', '#475569'];

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

    const renderRunnerRow = (runner: Runner, idx: number) => (
        <div key={runner._id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: isMobile ? '4px 8px' : '0.3vh 8px', borderRadius: 5, background: idx === 0 ? '#fffbeb' : 'transparent', height: isMobile ? 'auto' : '2.8vh', minHeight: isMobile ? 28 : 22 }}>
            <div style={{ width: isMobile ? 22 : '2.2vh', height: isMobile ? 22 : '2.2vh', minWidth: 18, minHeight: 18, borderRadius: 4, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: isMobile ? 12 : '1.3vh', fontWeight: 900, flexShrink: 0, background: rankBg[idx] || '#e2e8f0', color: rankFg[idx] || '#475569' }}>
                {idx + 1}
            </div>
            <span style={{ fontSize: isMobile ? 12 : '1.35vh', fontWeight: 700, color: '#1e293b', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', flex: 1, textTransform: 'uppercase' }}>
                {`${runner.bib}  ${runner.firstName} ${runner.lastName}`}
            </span>
            <span style={{ fontFamily: 'monospace', fontWeight: 800, fontSize: isMobile ? 11 : '1.35vh', color: '#1e293b', flexShrink: 0, minWidth: isMobile ? 60 : '6.5vh', textAlign: 'right' }}>
                {runner.gunTimeStr || formatTime(runner.gunTime)}
            </span>
            <span style={{ fontFamily: 'monospace', fontWeight: 800, fontSize: isMobile ? 11 : '1.35vh', color: '#1e293b', flexShrink: 0, minWidth: isMobile ? 60 : '6.5vh', textAlign: 'right', marginLeft: isMobile ? 10 : 14 }}>
                {runner.netTimeStr || formatTime(runner.netTime)}
            </span>
        </div>
    );

    const renderEmptyRow = (idx: number) => (
        <div key={`empty-${idx}`} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: isMobile ? '4px 8px' : '0.3vh 8px', height: isMobile ? 'auto' : '2.8vh', minHeight: isMobile ? 28 : 22 }}>
            <div style={{ width: isMobile ? 22 : '2.2vh', height: isMobile ? 22 : '2.2vh', minWidth: 18, minHeight: 18, borderRadius: 4, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: isMobile ? 12 : '1.3vh', fontWeight: 900, flexShrink: 0, background: '#f1f5f9', color: '#cbd5e1' }}>
                {idx + 1}
            </div>
            <span style={{ fontSize: isMobile ? 11 : '1.2vh', color: '#cbd5e1', fontStyle: 'italic', flex: 1 }}>—</span>
            <span style={{ minWidth: isMobile ? 60 : '6.5vh' }} />
            <span style={{ minWidth: isMobile ? 60 : '6.5vh', marginLeft: isMobile ? 10 : 14 }} />
        </div>
    );

    const dlIcon = (size = 12) => (
        <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <line x1="8" y1="1" x2="8" y2="11"/><polyline points="4 7 8 11 12 7"/><line x1="2" y1="14" x2="14" y2="14"/>
        </svg>
    );

    const renderColumn = (
        title: string,
        bgHeader: string,
        bgAgeHeader: string,
        winners: Record<string, Runner[]>,
        colRef: { current: HTMLDivElement | null },
        ageGroupRefs: { current: Record<string, HTMLDivElement | null> },
        onDownloadAll: () => void,
        onDownloadSingle: (label: string) => void
    ) => (
        <div ref={el => { colRef.current = el; }} style={{ display: 'flex', flexDirection: 'column', gap: isMobile ? 8 : '0.6vh', minHeight: 0, flex: 1, overflowY: isMobile ? 'visible' : 'auto', paddingRight: isMobile ? 0 : 4 }}>
            <div style={{ padding: isMobile ? '8px 0' : '0.7vh 0', fontWeight: 900, fontSize: isMobile ? 16 : '2vh', textTransform: 'uppercase', borderRadius: 8, color: 'white', letterSpacing: 2, background: bgHeader, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative' }}>
                <span>{title}</span>
                <button data-no-capture onClick={onDownloadAll} disabled={!!downloading} title="Download all age groups as one A4 image" style={{ position: 'absolute', right: 8, background: 'rgba(255,255,255,0.18)', border: 'none', borderRadius: 5, cursor: 'pointer', padding: '3px 8px', color: 'white', fontSize: isMobile ? 11 : 12, display: 'flex', alignItems: 'center', gap: 4, fontWeight: 700, opacity: downloading ? 0.5 : 1, transition: 'opacity 0.15s' }}>
                    {dlIcon(11)}{!isMobile && <span>All</span>}
                </button>
            </div>
            {activeAgeGroups.map(g => {
                const list = winners[g.label] || [];
                const rows = Array.from({ length: topN }, (_, i) => i);
                return (
                    <div key={g.label} ref={el => { ageGroupRefs.current[g.label] = el; }} style={{ background: 'white', border: '1px solid #e2e8f0', borderRadius: 8, overflow: 'hidden', display: 'flex', flexDirection: 'column', flexShrink: 0, minHeight: topN >= 5 ? (isMobile ? 150 : '18vh') : 'auto' }}>
                        <div style={{ background: bgAgeHeader, color: 'white', fontWeight: 800, fontSize: isMobile ? 13 : '1.5vh', padding: isMobile ? '4px 12px' : '0.25vh 12px', display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative', flexShrink: 0 }}>
                            <span>{disableAgeGroupRanking ? 'OVERALL RANKING' : g.label}</span>
                            <button data-no-capture onClick={() => onDownloadSingle(g.label)} disabled={!!downloading} title="Download this age group" style={{ position: 'absolute', right: 6, background: 'rgba(255,255,255,0.22)', border: 'none', borderRadius: 3, cursor: 'pointer', padding: '2px 5px', color: 'white', display: 'flex', alignItems: 'center', opacity: downloading ? 0.5 : 1, transition: 'opacity 0.15s' }}>
                                {dlIcon(10)}
                            </button>
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'flex-start', flex: 1, padding: isMobile ? '4px' : '0.25vh 4px', minHeight: 0 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: isMobile ? '2px 8px 3px' : '0.1vh 8px 0.2vh', borderBottom: '1px solid #f1f5f9' }}>
                                <div style={{ width: isMobile ? 22 : '2.2vh', minWidth: 18, flexShrink: 0 }} />
                                <span style={{ fontSize: isMobile ? 9 : '1.0vh', fontWeight: 700, color: '#94a3b8', flex: 1, textTransform: 'uppercase', letterSpacing: 0.5 }}>Name</span>
                                <span style={{ fontSize: isMobile ? 9 : '1.0vh', fontWeight: 700, color: '#94a3b8', flexShrink: 0, minWidth: isMobile ? 60 : '6.5vh', textAlign: 'right', letterSpacing: 0.5 }}>GunTime</span>
                                <span style={{ fontSize: isMobile ? 9 : '1.0vh', fontWeight: 700, color: '#94a3b8', flexShrink: 0, minWidth: isMobile ? 60 : '6.5vh', textAlign: 'right', letterSpacing: 0.5, marginLeft: isMobile ? 10 : 14 }}>NetTime</span>
                            </div>
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
            <header style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', justifyContent: 'space-between', alignItems: isMobile ? 'stretch' : 'center', padding: isMobile ? '10px 12px' : '0.6vh 1.5vw', background: '#1e293b', borderRadius: 10, marginBottom: isMobile ? 8 : '0.8vh', flexShrink: 0, border: '1px solid #334155', gap: isMobile ? 8 : 0 }}>
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

                <div style={{ display: 'flex', alignItems: isMobile ? 'stretch' : 'center', gap: isMobile ? 6 : '1vw', flexDirection: isMobile ? 'column' : 'row' }}>
                    {campaign && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, overflow: 'hidden', flexShrink: 1 }}>
                            <span style={{ fontSize: isMobile ? 11 : '1.3vh', fontWeight: 700, color: '#94a3b8', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: isMobile ? '100%' : '20vw' }}>
                                {campaign.name}
                            </span>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
                                <span style={{ fontSize: isMobile ? 11 : '1.2vh', color: volume === 0 ? '#475569' : '#22c55e' }}>
                                    {volume === 0 ? '🔇' : '🔊'}
                                </span>
                                <input
                                    type="range" min={0} max={1} step={0.05} value={volume}
                                    onChange={e => setVolume(parseFloat(e.target.value))}
                                    style={{ width: isMobile ? 64 : '4.5vw', minWidth: 48, accentColor: '#22c55e', cursor: 'pointer', verticalAlign: 'middle' }}
                                />
                            </div>
                        </div>
                    )}

                    {campaign && !initialLoading && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                            <button
                                onClick={() => downloadAll('both')}
                                disabled={!!downloading}
                                title="Download All Winners (Excel)"
                                style={{ display: 'flex', alignItems: 'center', gap: 5, padding: isMobile ? '5px 10px' : '0.35vh 0.7vw', background: '#1d4ed8', border: '1px solid #2563eb', borderRadius: 7, color: 'white', fontSize: isMobile ? 11 : '1.15vh', fontWeight: 800, cursor: 'pointer', whiteSpace: 'nowrap', opacity: downloading ? 0.6 : 1, transition: 'opacity 0.15s', fontFamily: "'Prompt','Inter',sans-serif" }}
                            >
                                <svg width="11" height="11" viewBox="0 0 16 16" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="8" y1="1" x2="8" y2="11"/><polyline points="4 7 8 11 12 7"/><line x1="2" y1="14" x2="14" y2="14"/></svg>
                                Download All
                            </button>
                        </div>
                    )}

                    {ageGroupCategories !== null && ageGroupCategories.length > 0 && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                            <div ref={dropdownRef} style={{ position: 'relative' }}>
                                <button
                                    onClick={() => setDropdownOpen(d => !d)}
                                    style={{ display: 'flex', alignItems: 'center', gap: 8, padding: isMobile ? '6px 12px' : '0.4vh 0.8vw', background: '#0f172a', border: `1px solid ${dropdownOpen ? '#22c55e' : '#475569'}`, borderRadius: 8, color: '#f1f5f9', fontSize: isMobile ? 12 : '1.3vh', fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap', fontFamily: "'Prompt', 'Inter', sans-serif" }}
                                >
                                    {selectedCategory
                                        ? `${selectedCategory}${ageGroupCategories.find(c => c.name === selectedCategory)?.distance ? ` (${ageGroupCategories.find(c => c.name === selectedCategory)!.distance})` : ''}`
                                        : 'เลือกระยะ'}
                                    <span style={{ fontSize: 10, opacity: 0.6, transform: dropdownOpen ? 'rotate(180deg)' : 'none', display: 'inline-block', transition: 'transform 0.15s' }}>▾</span>
                                </button>
                                {dropdownOpen && (
                                    <div style={{ position: 'absolute', top: 'calc(100% + 4px)', right: 0, background: '#1e293b', border: '1px solid #475569', borderRadius: 8, overflow: 'hidden', zIndex: 100, minWidth: 180, boxShadow: '0 8px 24px rgba(0,0,0,0.5)' }}>
                                        {ageGroupCategories.map((cat, i) => (
                                            <button
                                                key={cat.name}
                                                onClick={() => { setSelectedCategory(cat.name); setAutoMode(false); setDropdownOpen(false); }}
                                                style={{ display: 'block', width: '100%', textAlign: 'left', padding: '10px 16px', background: selectedCategory === cat.name ? 'rgba(34,197,94,0.15)' : 'transparent', border: 'none', borderBottom: i < ageGroupCategories.length - 1 ? '1px solid #334155' : 'none', color: selectedCategory === cat.name ? '#22c55e' : '#cbd5e1', fontSize: isMobile ? 13 : '1.3vh', fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap', fontFamily: "'Prompt', 'Inter', sans-serif" }}
                                            >
                                                {cat.name}{cat.distance ? ` (${cat.distance})` : ''}
                                            </button>
                                        ))}
                                    </div>
                                )}
                            </div>

                            {ageGroupCategories.length > 1 && (
                                <button
                                    onClick={() => setAutoMode(m => !m)}
                                    style={{ display: 'flex', alignItems: 'center', gap: 6, padding: isMobile ? '6px 12px' : '0.4vh 0.8vw', background: autoMode ? '#22c55e' : 'transparent', border: `1px solid ${autoMode ? '#22c55e' : '#475569'}`, borderRadius: 8, color: autoMode ? '#000' : '#94a3b8', fontSize: isMobile ? 12 : '1.3vh', fontWeight: 800, cursor: 'pointer', whiteSpace: 'nowrap', fontFamily: "'Prompt', 'Inter', sans-serif", minWidth: isMobile ? 80 : 72, justifyContent: 'center', transition: 'background 0.2s, color 0.2s, border-color 0.2s' }}
                                >
                                    {autoMode ? `⏸ ${autoCountdown}s` : '▶ AUTO'}
                                </button>
                            )}
                        </div>
                    )}
                </div>
            </header>

            {campaign && (
                <div style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', alignItems: 'center', justifyContent: 'center', gap: isMobile ? 6 : '1.2vw', padding: isMobile ? '10px 16px' : '0.7vh 1.5vw', background: '#1e293b', borderRadius: 10, marginBottom: isMobile ? 8 : '0.8vh', border: '1px solid #334155', flexShrink: 0, textAlign: 'center' }}>
                    <span style={{ fontSize: isMobile ? 15 : '2.2vh', fontWeight: 900, color: '#f1f5f9', letterSpacing: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: isMobile ? '100%' : '50vw' }}>
                        {campaign.name}
                    </span>
                    {selectedCategory && (
                        <span style={{ display: 'inline-flex', alignItems: 'center', background: '#22c55e', color: '#052e16', borderRadius: 999, fontWeight: 900, fontSize: isMobile ? 13 : '1.8vh', padding: isMobile ? '3px 14px' : '0.2vh 1.2vw', whiteSpace: 'nowrap', flexShrink: 0 }}>
                            {selectedCategory}
                            {campaign.categories?.find(c => c.name === selectedCategory)?.distance
                                ? ` · ${campaign.categories.find(c => c.name === selectedCategory)!.distance}`
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
                    {renderColumn(
                        disableAgeGroupRanking ? '♂ MALE RANKING' : '♂ MALE WINNERS', '#2563eb', '#1e3a5f', maleWinners, maleColRef, maleAgeGroupRefs,
                        () => downloadAll('male'),
                        (label) => downloadSection(label, 'male')
                    )}
                    {renderColumn(
                        disableAgeGroupRanking ? '♀ FEMALE RANKING' : '♀ FEMALE WINNERS', '#db2777', '#831843', femaleWinners, femaleColRef, femaleAgeGroupRefs,
                        () => downloadAll('female'),
                        (label) => downloadSection(label, 'female')
                    )}
                </div>
            )}
        </div>
    );
}
