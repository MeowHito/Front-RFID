'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useParams, useRouter } from 'next/navigation';
import { useLanguage } from '@/lib/language-context';
import { useTheme } from '@/lib/theme-context';
import { useAuth } from '@/lib/auth-context';

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
    displayColumns?: string[];
    displayColumnsLab?: string[];
    displayMode?: string;
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
    eventId?: string;
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
    gunTime?: number;
    netTimeStr?: string;
    gunTimeStr?: string;
    overallRank?: number;
    genderRank?: number;
    genderNetRank?: number;
    ageGroupRank?: number;
    ageGroupNetRank?: number;
    categoryRank?: number;
    categoryNetRank?: number;
    nationality?: string;
    team?: string;
    teamName?: string;
    latestCheckpoint?: string;
    passedCount?: number;
    lapCount?: number;
    bestLapTime?: number;
    avgLapTime?: number;
    lastLapTime?: number;
    lastPassTime?: string;
    isStarted?: boolean;
    gunPace?: string;
    netPace?: string;
    totalFinishers?: number;
    genderFinishers?: number;
}

interface TimingRecord {
    _id: string;
    runnerId: string;
    checkpoint: string;
    scanTime: string;
    splitTime?: number;
    elapsedTime?: number;
    distanceFromStart?: number;
    netTime?: number;
    gunTime?: number;
    order?: number;
}

interface CheckpointMapping {
    _id: string;
    checkpointId: string | { _id: string; name: string; type: string; orderNum?: number; kmCumulative?: number };
    eventId: string;
    orderNum: number;
    distanceFromStart?: number;
    checkpoint?: { name: string; type: string; kmCumulative?: number };
}

// Resolved checkpoint distance info per event
interface CheckpointDistanceLookup {
    [eventId: string]: {
        totalDistance: number;
        totalCheckpoints: number;
        checkpoints: { [cpName: string]: number }; // checkpointName → distanceFromStart (km)
        cpOrders: { [cpName: string]: number }; // checkpointName → orderNum (1-based position)
    };
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

type ColDef = { key: string; label: string; w: string; mw: string; align: 'left' | 'center' | 'right'; fixed?: boolean; desktopOnly?: boolean };

// Marathon column definitions
const COL_DEFS: ColDef[] = [
    { key: 'rank', label: 'Rank', w: '3%', mw: '8%', align: 'center', fixed: true },
    { key: 'genRank', label: 'Gen', w: '3%', mw: '8%', align: 'center' },
    { key: 'catRank', label: 'Cat', w: '3%', mw: '8%', align: 'center' },
    { key: 'runner', label: 'Runner', w: '15%', mw: '30%', align: 'left', fixed: true },
    { key: 'sex', label: 'Sex', w: '3%', mw: '6%', align: 'center' },
    { key: 'status', label: 'Status', w: '8%', mw: '9%', align: 'left', fixed: true },
    { key: 'gunTime', label: 'Gun Time', w: '7%', mw: '16%', align: 'center' },
    { key: 'netTime', label: 'Net Time', w: '7%', mw: '7%', align: 'center' },
    { key: 'genNet', label: 'Gen Net', w: '4%', mw: '4%', align: 'center' },
    { key: 'gunPace', label: 'Gun Pace', w: '5%', mw: '5%', align: 'center' },
    { key: 'netPace', label: 'Net Pace', w: '5%', mw: '5%', align: 'center' },
    { key: 'finish', label: 'Finish', w: '4%', mw: '4%', align: 'center' },
    { key: 'genFin', label: 'Gen Fin', w: '4%', mw: '4%', align: 'center' },
    { key: 'progress', label: 'Progress', w: '8%', mw: '8%', align: 'right', fixed: true, desktopOnly: true },
];
const TOGGLEABLE_KEYS = COL_DEFS.filter(c => !c.fixed).map(c => c.key);

// Lab (lap-based) column definitions
const LAB_COL_DEFS: ColDef[] = [
    { key: 'rank', label: 'Rank', w: '4%', mw: '8%', align: 'center', fixed: true },
    { key: 'runner', label: 'Runner', w: '16%', mw: '32%', align: 'left', fixed: true },
    { key: 'sex', label: 'Sex', w: '4%', mw: '6%', align: 'center' },
    { key: 'laps', label: 'Laps', w: '5%', mw: '8%', align: 'center', fixed: true },
    { key: 'bestLap', label: 'Best Lap', w: '8%', mw: '12%', align: 'center' },
    { key: 'avgLap', label: 'Avg Lap', w: '8%', mw: '12%', align: 'center' },
    { key: 'lastLap', label: 'Last Lap', w: '8%', mw: '12%', align: 'center' },
    { key: 'totalTime', label: 'Total Time', w: '8%', mw: '12%', align: 'center' },
    { key: 'lastPass', label: 'Last Pass', w: '10%', mw: '14%', align: 'center' },
    { key: 'lapPace', label: 'Lap Pace', w: '7%', mw: '10%', align: 'center' },
    { key: 'status', label: 'Status', w: '7%', mw: '9%', align: 'left' },
    { key: 'progress', label: 'Progress', w: '8%', mw: '8%', align: 'right', fixed: true, desktopOnly: true },
];
const LAB_TOGGLEABLE_KEYS = LAB_COL_DEFS.filter(c => !c.fixed).map(c => c.key);

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
    const { theme } = useTheme();
    const { isAdmin } = useAuth();
    const params = useParams();
    const router = useRouter();
    const eventKey = params.id as string;

    const [campaign, setCampaign] = useState<Campaign | null>(null);
    const [runners, setRunners] = useState<Runner[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const [searchQuery, setSearchQuery] = useState('');
    const [filterGender, setFilterGender] = useState('ALL');
    const [filterCategory, setFilterCategory] = useState('');
    const [filterStatus, setFilterStatus] = useState('ALL');
    // Runner detail is now handled by /runner/[id] page

    const [showGenRank, setShowGenRank] = useState(true);
    const [showCatRank, setShowCatRank] = useState(true);
    const [showColDropdown, setShowColDropdown] = useState(false);
    const [showAllColumns, setShowAllColumns] = useState(false);
    const [isMobile, setIsMobile] = useState(false);

    const [currentTime, setCurrentTime] = useState(new Date());
    const [lastUpdated, setLastUpdated] = useState<Date>(new Date());
    const [checkpointMappings, setCheckpointMappings] = useState<CheckpointMapping[]>([]);
    const [totalDistance, setTotalDistance] = useState<number>(0);
    const [cpDistanceLookup, setCpDistanceLookup] = useState<CheckpointDistanceLookup>({});

    const toApiData = (payload: any) => payload?.data ?? payload;

    useEffect(() => {
        const timer = setInterval(() => setCurrentTime(new Date()), 1000);
        return () => clearInterval(timer);
    }, []);

    // Detect mobile viewport
    useEffect(() => {
        const checkMobile = () => setIsMobile(window.innerWidth < 768);
        checkMobile();
        window.addEventListener('resize', checkMobile);
        return () => window.removeEventListener('resize', checkMobile);
    }, []);

    useEffect(() => { if (eventKey) fetchEventData(); }, [eventKey]);

    // Auto-refresh runners every 15 seconds
    useEffect(() => {
        if (!campaign?._id) return;
        const refreshInterval = setInterval(async () => {
            try {
                const runnersRes = await fetch(`/api/runners?id=${campaign._id}`, { cache: 'no-store' });
                if (runnersRes.ok) {
                    const runnersData = await runnersRes.json().catch(() => ({}));
                    const list = (runnersData?.data?.data as Runner[]) || (runnersData?.data as Runner[]) || (Array.isArray(runnersData) ? runnersData : []);
                    if (Array.isArray(list) && list.length > 0) {
                        setRunners(list);
                        setLastUpdated(new Date());
                    }
                }
            } catch { /* silently retry next interval */ }
        }, 15_000);
        return () => clearInterval(refreshInterval);
    }, [campaign?._id]);

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
                const runnerList = Array.isArray(list) ? list : [];
                setRunners(runnerList);

                // Fetch checkpoint mappings per event for distance-based progress
                const uniqueEventIds = Array.from(new Set(runnerList.map(r => r.eventId).filter(Boolean))) as string[];
                const lookup: CheckpointDistanceLookup = {};
                await Promise.all(uniqueEventIds.map(async (evId) => {
                    try {
                        const mapRes = await fetch(`/api/checkpoints/mapping/event/${evId}`, { cache: 'no-store' });
                        if (!mapRes.ok) return;
                        const mapData = await mapRes.json();
                        const mappings: CheckpointMapping[] = Array.isArray(mapData) ? mapData : (mapData?.data || []);
                        const cpMap: { [name: string]: number } = {};
                        const cpOrders: { [name: string]: number } = {};
                        let maxDist = 0;
                        for (const m of mappings) {
                            const cpObj = typeof m.checkpointId === 'object' ? m.checkpointId : null;
                            const cpName = cpObj?.name || '';
                            const dist = m.distanceFromStart ?? cpObj?.kmCumulative ?? 0;
                            if (cpName) {
                                const key = cpName.trim().toLowerCase();
                                cpMap[key] = dist;
                                cpOrders[key] = m.orderNum || 0;
                            }
                            if (dist > maxDist) maxDist = dist;
                        }
                        // Find matching category distance from campaign categories
                        const evCategory = campaignData.categories?.find((c: any) =>
                            String(c.eventId || '') === evId || String(c._id || '') === evId
                        );
                        const catDist = evCategory ? (parseDistanceValue(evCategory.distance || evCategory.name) || 0) : 0;
                        lookup[evId] = {
                            totalDistance: maxDist > 0 ? maxDist : catDist,
                            totalCheckpoints: mappings.length,
                            checkpoints: cpMap,
                            cpOrders,
                        };
                    } catch { /* skip */ }
                }));
                setCpDistanceLookup(lookup);
            }
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : 'Error');
        } finally {
            setLoading(false);
        }
    }

    function formatTime(ms: number | undefined | null): string {
        if (ms === undefined || ms === null || ms < 0) return '-';
        if (ms === 0) return '0:00:00';
        const hours = Math.floor(ms / 3600000);
        const minutes = Math.floor((ms % 3600000) / 60000);
        const seconds = Math.floor((ms % 60000) / 1000);
        return `${hours}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    }

    function formatDate(dateString: string) {
        const date = new Date(dateString);
        return date.toLocaleDateString(language === 'th' ? 'th-TH' : 'en-US', { day: '2-digit', month: 'short', year: 'numeric' });
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
        let cats;
        if (!campaignCategories.length) {
            const runnerCategories = new Set(runners.map(r => r.category).filter(Boolean));
            cats = Array.from(runnerCategories).map(v => ({ key: v, label: v, normalizedName: normalizeComparableText(v), normalizedDistance: normalizeComparableText(v), distanceValue: parseDistanceValue(v) }));
        } else {
            cats = campaignCategories.map((cat, i) => {
                const distance = String(cat?.distance || '').trim();
                const name = String(cat?.name || '').trim();
                const nd = normalizeComparableText(distance);
                const nn = normalizeComparableText(name);
                return { key: `${nd || nn || i + 1}-${i}`, label: distance || name || `Category ${i + 1}`, normalizedDistance: nd, normalizedName: nn, distanceValue: parseDistanceValue(distance || name) };
            }).filter(c => Boolean(c.label));
        }
        // Sort by distance descending
        return cats.sort((a, b) => (b.distanceValue ?? 0) - (a.distanceValue ?? 0));
    }, [campaign, runners, language]);

    // Auto-select first category when categories change and none selected
    useEffect(() => {
        if (categories.length > 0 && (!filterCategory || !categories.find(c => c.key === filterCategory))) {
            setFilterCategory(categories[0].key);
        }
    }, [categories]);

    const resolveRunnerCategoryKey = useCallback((runner: Runner): string => {
        if (!categories.length) return runner.category;
        const rc = normalizeComparableText(runner.category);
        const rd = parseDistanceValue(runner.category);

        // Pass 1: exact normalized match (highest confidence)
        for (const cat of categories) {
            if (rc && (rc === cat.normalizedName || rc === cat.normalizedDistance)) return cat.key;
        }

        // Pass 2: numeric distance match (e.g., "21 KM" matches category with distanceValue 21)
        if (rd !== null) {
            for (const cat of categories) {
                if (cat.distanceValue !== null && Math.abs(rd - cat.distanceValue) < 0.001) return cat.key;
            }
        }

        // Pass 3: substring match only if one side fully contains the other AND
        // the shorter string is at least 3 chars (avoids "5km" matching "15km")
        for (const cat of categories) {
            if (!rc || !cat.normalizedName) continue;
            const shorter = rc.length <= cat.normalizedName.length ? rc : cat.normalizedName;
            const longer = rc.length <= cat.normalizedName.length ? cat.normalizedName : rc;
            if (shorter.length >= 3 && longer.startsWith(shorter)) return cat.key;
        }

        return runner.category;
    }, [categories]);

    // Determine active display mode and column set
    const isLabMode = campaign?.displayMode === 'lab';
    const activeColDefs = isLabMode ? LAB_COL_DEFS : COL_DEFS;
    const activeToggleableKeys = isLabMode ? LAB_TOGGLEABLE_KEYS : TOGGLEABLE_KEYS;

    // Build ordered list of visible columns based on admin displayColumns + mobile
    const visibleColumns = useMemo(() => {
        const adminCols = isLabMode ? campaign?.displayColumnsLab : campaign?.displayColumns;
        // Rebuild full column order from admin settings
        let fullOrder: string[];
        if (adminCols && adminCols.length > 0) {
            const toggleOrdered = [
                ...adminCols.filter((k: string) => activeToggleableKeys.includes(k)),
                ...activeToggleableKeys.filter(k => !adminCols.includes(k)),
            ];
            fullOrder = [];
            let tIdx = 0;
            for (const col of activeColDefs) {
                if (col.fixed) {
                    fullOrder.push(col.key);
                } else {
                    fullOrder.push(toggleOrdered[tIdx++]);
                }
            }
        } else {
            fullOrder = activeColDefs.map(c => c.key);
        }

        // Filter to only visible columns
        return fullOrder.filter(key => {
            const def = activeColDefs.find(c => c.key === key)!;
            if (!def) return false;
            if (def.desktopOnly && isMobile) return false;
            if (def.fixed) return true;
            if (!isLabMode) {
                if (key === 'genRank' && !showGenRank) return false;
                if (key === 'catRank' && !showCatRank) return false;
            }
            if (adminCols && adminCols.length > 0 && !adminCols.includes(key)) return false;
            if (isMobile && !showAllColumns) {
                return isLabMode ? ['laps'].includes(key) : ['gunTime'].includes(key);
            }
            return true;
        });
    }, [isMobile, showAllColumns, campaign?.displayColumns, campaign?.displayColumnsLab, campaign?.displayMode, showGenRank, showCatRank, isLabMode, activeColDefs, activeToggleableKeys]);

    // Compute median finish time per category for real progress estimation
    const categoryMedianTime = useMemo(() => {
        const map: Record<string, number[]> = {};
        runners.forEach(r => {
            if (r.status === 'finished' && (r.netTime || r.gunTime)) {
                const cat = r.category || '_';
                if (!map[cat]) map[cat] = [];
                map[cat].push(r.netTime || r.gunTime || 0);
            }
        });
        const medians: Record<string, number> = {};
        Object.entries(map).forEach(([cat, times]) => {
            const sorted = times.filter(t => t > 0).sort((a, b) => a - b);
            medians[cat] = sorted.length > 0 ? sorted[Math.floor(sorted.length / 2)] : 0;
        });
        return medians;
    }, [runners]);

    // Status counts for filter badges
    const statusCounts = useMemo(() => {
        const counts: Record<string, number> = { ALL: 0, finished: 0, in_progress: 0, not_started: 0, dnf: 0, dns: 0 };
        runners.forEach(r => {
            counts.ALL++;
            counts[r.status] = (counts[r.status] || 0) + 1;
        });
        return counts;
    }, [runners]);

    const filteredRunners = useMemo(() => {
        return runners
            .filter(runner => {
                const matchesSearch = !searchQuery || runner.firstName?.toLowerCase().includes(searchQuery.toLowerCase()) || runner.lastName?.toLowerCase().includes(searchQuery.toLowerCase()) || runner.bib?.includes(searchQuery);
                const matchesGender = filterGender === 'ALL' || runner.gender === filterGender;
                const matchesCategory = !filterCategory || resolveRunnerCategoryKey(runner) === filterCategory;
                const matchesStatus = filterStatus === 'ALL' || runner.status === filterStatus;
                return matchesSearch && matchesGender && matchesCategory && matchesStatus;
            })
            .sort((a, b) => {
                // Primary: runners with netTime first, sorted ascending (fastest = #1)
                const aTime = a.netTime || 0;
                const bTime = b.netTime || 0;
                if (aTime > 0 && bTime > 0) return aTime - bTime;
                if (aTime > 0 && bTime <= 0) return -1;
                if (aTime <= 0 && bTime > 0) return 1;

                // Secondary: runners with gunTime
                const aGun = a.gunTime || a.elapsedTime || 0;
                const bGun = b.gunTime || b.elapsedTime || 0;
                if (aGun > 0 && bGun > 0) return aGun - bGun;
                if (aGun > 0 && bGun <= 0) return -1;
                if (aGun <= 0 && bGun > 0) return 1;

                // Tertiary: status order
                const statusOrder: Record<string, number> = { 'finished': 0, 'in_progress': 1, 'not_started': 2, 'dns': 3, 'dnf': 4 };
                return (statusOrder[a.status] ?? 5) - (statusOrder[b.status] ?? 5);
            });
    }, [runners, searchQuery, filterGender, filterCategory, filterStatus, resolveRunnerCategoryKey]);

    const handleViewRunner = (runner: Runner) => {
        router.push(`/runner/${runner._id}`);
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

    const isDark = theme === 'dark';
    const themeStyles = {
        bg: isDark ? '#0a0a0f' : '#f8fafc',
        cardBg: isDark ? '#18181f' : '#fff',
        text: isDark ? '#f8fafc' : '#1e293b',
        textMuted: isDark ? '#94a3b8' : '#64748b',
        textSecondary: isDark ? '#64748b' : '#94a3b8',
        border: isDark ? 'rgba(255,255,255,0.08)' : '#e2e8f0',
        inputBg: isDark ? '#1e1e26' : '#f1f5f9',
        hoverBg: isDark ? 'rgba(34,197,94,0.1)' : '#f0fdf4',
    };

    return (
        <div style={{ minHeight: '100vh', overflow: 'hidden', background: themeStyles.bg, color: themeStyles.text, fontFamily: "'Inter', 'Prompt', sans-serif" }}>
            <style>{`
                @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&family=Prompt:wght@400;500;600;700&display=swap');
                @keyframes pulseLive { 0% { transform: scale(0.9); opacity: 0.7; } 50% { transform: scale(1.2); opacity: 1; } 100% { transform: scale(0.9); opacity: 0.7; } }
                .live-dot { width: 8px; height: 8px; border-radius: 50%; display: inline-block; animation: pulseLive 1.5s infinite; border: 1.5px solid white; }
                .runner-row:hover { background-color: ${themeStyles.hoverBg} !important; border-left-color: #22c55e !important; }
                .table-scroll::-webkit-scrollbar { display: none; }
                .table-scroll { scrollbar-width: none; }
            `}</style>

            {/* ===== HEADER ===== */}
            <header style={{ background: themeStyles.cardBg, borderBottom: `1px solid ${themeStyles.border}`, padding: '8px 16px', boxShadow: isDark ? '0 1px 3px rgba(0,0,0,0.2)' : '0 1px 3px rgba(0,0,0,0.04)', position: 'relative', zIndex: 30 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', maxWidth: '100%', overflow: 'hidden' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0, flex: 1 }}>
                        <Link href="/" style={{ display: 'flex', alignItems: 'center', gap: 8, textDecoration: 'none', flexShrink: 0 }}>
                            <Image
                                src={theme === 'dark' ? '/logo-white.png' : '/logo-black.png'}
                                alt="Logo"
                                width={isMobile ? 80 : 100}
                                height={isMobile ? 26 : 32}
                                style={{ objectFit: 'contain' }}
                            />
                        </Link>
                        {!isMobile && (
                            <span style={{ fontSize: 18, fontWeight: 900, fontStyle: 'italic', color: themeStyles.text, borderLeft: `1px solid ${themeStyles.border}`, paddingLeft: 12 }}>
                                <span style={{ color: '#22c55e', fontWeight: 700, fontStyle: 'normal', textTransform: 'uppercase' }}>Live</span>
                            </span>
                        )}
                        <div style={{ minWidth: 0 }}>
                            <h1 style={{ fontSize: isMobile ? 12 : 14, fontWeight: 700, lineHeight: 1.2, margin: 0, color: themeStyles.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{campaign.name}</h1>
                            {!isMobile && (
                                <p style={{ fontSize: 10, color: themeStyles.textSecondary, fontWeight: 500, margin: 0 }}>
                                    {formatDate(campaign.eventDate)} | {campaign.location}
                                </p>
                            )}
                        </div>
                    </div>

                    {!isMobile && (
                        <div style={{ display: 'flex', gap: 16, fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', alignItems: 'center', padding: '6px 12px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', color: themeStyles.textMuted }}>
                                Started: <span style={{ color: themeStyles.text, marginLeft: 4 }}>{stats.started}</span>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', color: '#22c55e' }}>
                                <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#22c55e', marginRight: 6 }} />
                                Racing: <span style={{ color: themeStyles.text, marginLeft: 4 }}>{stats.racing}</span>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', color: '#3b82f6' }}>
                                <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#3b82f6', marginRight: 6 }} />
                                Fin: <span style={{ color: themeStyles.text, marginLeft: 4 }}>{stats.finished}</span>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', color: '#ef4444' }}>
                                <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#ef4444', marginRight: 6 }} />
                                DNF: <span style={{ color: themeStyles.text, marginLeft: 4 }}>{stats.dnf}</span>
                            </div>
                        </div>
                    )}
                </div>
                {/* Status Filter — admin only, inside header */}
                {isAdmin && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6, flexWrap: 'wrap' }}>
                        <span style={{ fontSize: 9, fontWeight: 700, color: themeStyles.textSecondary, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                            Status:
                        </span>
                        <div style={{ display: 'flex', background: themeStyles.inputBg, padding: 3, borderRadius: 8, flexWrap: 'wrap' }}>
                            {([
                                { key: 'ALL', label: language === 'th' ? 'ทั้งหมด' : 'All', color: '#22c55e' },
                                { key: 'finished', label: 'Finish', color: '#22c55e' },
                                { key: 'in_progress', label: 'Racing', color: '#f97316' },
                                { key: 'dnf', label: 'DNF', color: '#ef4444' },
                                { key: 'dns', label: 'DNS', color: '#ef4444' },
                                { key: 'not_started', label: language === 'th' ? 'รอ' : 'SD', color: '#94a3b8' },
                            ] as const).map(s => (
                                <button
                                    key={s.key}
                                    onClick={() => setFilterStatus(s.key)}
                                    style={{
                                        padding: isMobile ? '4px 6px' : '4px 10px', fontSize: isMobile ? 9 : 10, fontWeight: 700, borderRadius: 6, border: 'none', cursor: 'pointer', transition: 'all 0.2s', whiteSpace: 'nowrap',
                                        display: 'flex', alignItems: 'center', gap: 4,
                                        ...(filterStatus === s.key
                                            ? { background: s.color, color: '#fff' }
                                            : { background: 'transparent', color: themeStyles.textMuted })
                                    }}
                                >
                                    {s.label}
                                    {statusCounts[s.key] > 0 && (
                                        <span style={{ fontSize: 8, opacity: filterStatus === s.key ? 1 : 0.7 }}>{statusCounts[s.key]}</span>
                                    )}
                                </button>
                            ))}
                        </div>
                    </div>
                )}
            </header>

            {/* ===== FILTER BAR ===== */}
            <div style={{ background: themeStyles.cardBg, borderBottom: `1px solid ${themeStyles.border}`, padding: '8px 16px', display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: isMobile ? 8 : 12 }}>
                {/* Distance filter + Gender filter (on mobile, gender goes after distance) */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 10, fontWeight: 700, color: themeStyles.textSecondary, textTransform: 'uppercase', whiteSpace: 'nowrap' }}>
                        Distance:
                    </span>
                    {isMobile ? (
                        <select
                            value={filterCategory}
                            onChange={e => setFilterCategory(e.target.value)}
                            style={{
                                padding: '6px 28px 6px 10px', borderRadius: 8, fontSize: 12, fontWeight: 700,
                                background: themeStyles.inputBg, color: themeStyles.text,
                                border: `1px solid ${themeStyles.border}`, cursor: 'pointer',
                                appearance: 'auto', WebkitAppearance: 'menulist',
                            }}
                        >
                            {categories.map(cat => (
                                <option key={cat.key} value={cat.key}>{cat.label}</option>
                            ))}
                        </select>
                    ) : (
                        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                            {categories.map(cat => (
                                <button
                                    key={cat.key}
                                    onClick={() => setFilterCategory(cat.key)}
                                    style={{
                                        padding: '6px 14px', borderRadius: 20, fontSize: 11, fontWeight: 700, cursor: 'pointer', transition: 'all 0.2s', border: '1px solid',
                                        ...(filterCategory === cat.key
                                            ? { background: '#22c55e', color: '#fff', borderColor: '#22c55e' }
                                            : { background: themeStyles.cardBg, color: themeStyles.textMuted, borderColor: themeStyles.border })
                                    }}
                                >
                                    {cat.label}
                                </button>
                            ))}
                        </div>
                    )}

                    {/* Gender Filter — on mobile, placed right after distance */}
                    {isMobile && (
                        <div style={{ display: 'flex', background: themeStyles.inputBg, padding: 3, borderRadius: 8 }}>
                            {(['ALL', 'M', 'F'] as const).map(g => (
                                <button
                                    key={g}
                                    onClick={() => setFilterGender(g)}
                                    style={{
                                        padding: '4px 10px', fontSize: 10, fontWeight: 700, borderRadius: 6, border: 'none', cursor: 'pointer', transition: 'all 0.2s', whiteSpace: 'nowrap',
                                        ...(filterGender === g
                                            ? { background: '#22c55e', color: '#fff' }
                                            : { background: 'transparent', color: themeStyles.textMuted })
                                    }}
                                >
                                    {g === 'ALL' ? (language === 'th' ? 'ทั้งหมด' : 'All') : g === 'M' ? (language === 'th' ? 'ชาย' : 'Male') : (language === 'th' ? 'หญิง' : 'Female')}
                                </button>
                            ))}
                        </div>
                    )}

                </div>

                {/* Right controls */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    {/* Gender Filter — desktop only (mobile is above) */}
                    {!isMobile && (
                        <div style={{ display: 'flex', background: themeStyles.inputBg, padding: 3, borderRadius: 8 }}>
                            {(['ALL', 'M', 'F'] as const).map(g => (
                                <button
                                    key={g}
                                    onClick={() => setFilterGender(g)}
                                    style={{
                                        padding: '4px 12px', fontSize: 10, fontWeight: 700, borderRadius: 6, border: 'none', cursor: 'pointer', transition: 'all 0.2s', whiteSpace: 'nowrap',
                                        ...(filterGender === g
                                            ? { background: '#22c55e', color: '#fff' }
                                            : { background: 'transparent', color: themeStyles.textMuted })
                                    }}
                                >
                                    {g === 'ALL' ? (language === 'th' ? 'ทั้งหมด' : 'All') : g === 'M' ? (language === 'th' ? 'ชาย' : 'Male') : (language === 'th' ? 'หญิง' : 'Female')}
                                </button>
                            ))}
                        </div>
                    )}

                    {/* Search */}
                    <div style={{ position: 'relative' }}>
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={themeStyles.textSecondary} strokeWidth="2" style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)' }}>
                            <circle cx="11" cy="11" r="8" /><path d="M21 21l-4.35-4.35" />
                        </svg>
                        <input
                            type="text"
                            placeholder={language === 'th' ? 'BIB หรือ ชื่อ...' : 'BIB or Name...'}
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            style={{ paddingLeft: 30, paddingRight: 16, paddingTop: 6, paddingBottom: 6, background: themeStyles.inputBg, border: 'none', borderRadius: 8, fontSize: 12, width: isMobile ? 130 : 180, outline: 'none', color: themeStyles.text }}
                        />
                    </div>

                    {/* Mobile toggle */}
                    {isMobile && (
                        <button
                            onClick={() => setShowAllColumns(!showAllColumns)}
                            style={{ background: showAllColumns ? '#22c55e' : themeStyles.cardBg, border: `1px solid ${showAllColumns ? '#22c55e' : themeStyles.border}`, color: showAllColumns ? '#fff' : themeStyles.textMuted, padding: '6px 12px', borderRadius: 8, fontSize: 11, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, whiteSpace: 'nowrap' }}
                        >
                            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 3v18M3 12h18" /></svg>
                            {showAllColumns ? 'Less' : 'More'}
                        </button>
                    )}

                    {/* Column dropdown */}
                    {!isMobile && (
                        <div style={{ position: 'relative' }}>
                            <button
                                onClick={() => setShowColDropdown(!showColDropdown)}
                                style={{ background: themeStyles.cardBg, border: `1px solid ${themeStyles.border}`, color: themeStyles.textMuted, padding: '6px 12px', borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}
                            >
                                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" /><rect x="3" y="14" width="7" height="7" /><rect x="14" y="14" width="7" height="7" /></svg>
                                Columns
                            </button>
                            {showColDropdown && (
                                <div style={{ position: 'absolute', right: 0, top: 36, background: themeStyles.cardBg, minWidth: 160, boxShadow: isDark ? '0 8px 16px rgba(0,0,0,0.4)' : '0 8px 16px rgba(0,0,0,0.1)', borderRadius: 8, zIndex: 30, border: `1px solid ${themeStyles.border}`, padding: 8 }}>
                                    <p style={{ fontSize: 10, fontWeight: 700, color: themeStyles.textSecondary, textTransform: 'uppercase', marginBottom: 4, padding: '0 8px' }}>Display</p>
                                    <label style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 8px', fontSize: 12, cursor: 'pointer', color: themeStyles.text }}>
                                        <input type="checkbox" checked={showGenRank} onChange={e => setShowGenRank(e.target.checked)} /> Gender Rank
                                    </label>
                                    <label style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 8px', fontSize: 12, cursor: 'pointer', color: themeStyles.text }}>
                                        <input type="checkbox" checked={showCatRank} onChange={e => setShowCatRank(e.target.checked)} /> Category Rank
                                    </label>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </div>

            {/* ===== TABLE ===== */}
            <main style={{ padding: '0 16px' }}>
                <div className="table-scroll" style={{ background: themeStyles.cardBg, borderRadius: '0 0 12px 12px', boxShadow: isDark ? '0 1px 3px rgba(0,0,0,0.2)' : '0 1px 3px rgba(0,0,0,0.04)', border: `1px solid ${themeStyles.border}`, borderTop: 'none', height: 'calc(100vh - 140px)', overflowY: 'auto', overflowX: isMobile && showAllColumns ? 'auto' : 'hidden' }}>
                    <table style={{ width: isMobile && showAllColumns ? 1200 : '100%', textAlign: 'left', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
                        <thead>
                            <tr style={{ fontSize: 10, fontWeight: 700, color: themeStyles.textSecondary, textTransform: 'uppercase', letterSpacing: '-0.02em', position: 'sticky', top: 0, background: themeStyles.cardBg, zIndex: 20, borderBottom: `2px solid ${themeStyles.border}` }}>
                                {visibleColumns.map(key => {
                                    const def = activeColDefs.find(c => c.key === key)!;
                                    return (
                                        <th key={key} style={{ padding: isMobile ? '6px 4px' : '8px 6px', textAlign: def.align, width: isMobile ? def.mw : def.w }}>
                                            {def.label}
                                        </th>
                                    );
                                })}
                            </tr>
                        </thead>
                        <tbody>
                            {filteredRunners.length === 0 ? (
                                <tr><td colSpan={visibleColumns.length} style={{ padding: '48px 16px', textAlign: 'center', color: '#94a3b8', fontSize: 14 }}>
                                    {language === 'th' ? 'ไม่พบข้อมูลผู้เข้าแข่งขัน' : 'No participants found'}
                                </td></tr>
                            ) : (
                                filteredRunners.map((runner, idx) => {
                                    const rank = idx + 1;
                                    const displayName = language === 'th' && runner.firstNameTh
                                        ? `${runner.firstNameTh} ${runner.lastNameTh || ''}`
                                        : `${runner.firstName} ${runner.lastName}`;
                                    const initials = getInitials(runner.firstName, runner.lastName);
                                    const avatarBg = getAvatarColor(runner.firstName + runner.lastName);
                                    // Calculate progress % based on RaceTiger checkpoint data
                                    let progressPct = 0;
                                    let progressDistKm = 0;
                                    let eventTotalKm = 0;
                                    let progressLabel = '';
                                    if (runner.status === 'finished') {
                                        progressPct = 100;
                                    } else {
                                        // Calculate progress for ALL non-finished statuses
                                        const evLookup = runner.eventId ? cpDistanceLookup[runner.eventId] : null;
                                        const totalCps = evLookup?.totalCheckpoints || 0;

                                        // Helper: try matching latestCheckpoint name to checkpoint mappings (exact + normalized)
                                        const cpKey = runner.latestCheckpoint?.trim().toLowerCase() || '';
                                        const cpKeyNorm = normalizeComparableText(runner.latestCheckpoint);
                                        let matchedCpKey = '';
                                        if (cpKey && evLookup) {
                                            if (evLookup.checkpoints[cpKey] !== undefined) {
                                                matchedCpKey = cpKey;
                                            } else if (cpKeyNorm) {
                                                // Fuzzy match: compare normalized names
                                                for (const k of Object.keys(evLookup.checkpoints)) {
                                                    if (normalizeComparableText(k) === cpKeyNorm) { matchedCpKey = k; break; }
                                                }
                                            }
                                        }

                                        // Method 1: passedCount / totalCheckpoints (from RaceTiger sync)
                                        if ((runner.passedCount ?? 0) > 0 && totalCps > 0) {
                                            progressPct = Math.min(99, Math.round((runner.passedCount! / totalCps) * 100));
                                            progressLabel = `${runner.passedCount}/${totalCps} CP`;
                                        }

                                        // Method 2: distance-based from checkpoint mapping
                                        if (progressPct === 0 && evLookup && matchedCpKey) {
                                            const cpDist = evLookup.checkpoints[matchedCpKey] ?? 0;
                                            const total = evLookup.totalDistance || (parseDistanceValue(runner.category) || 0);
                                            if (cpDist > 0 && total > 0) {
                                                progressPct = Math.min(99, Math.round((cpDist / total) * 100));
                                                progressDistKm = cpDist;
                                                eventTotalKm = total;
                                            }
                                        }

                                        // Method 2.5: order-based from checkpoint mapping (fallback when distance is 0)
                                        if (progressPct === 0 && evLookup && matchedCpKey && totalCps > 0) {
                                            const cpOrder = evLookup.cpOrders[matchedCpKey] ?? 0;
                                            if (cpOrder > 0) {
                                                progressPct = Math.min(99, Math.round((cpOrder / totalCps) * 100));
                                                progressLabel = `${cpOrder}/${totalCps} CP`;
                                            }
                                        }

                                        // Method 3: elapsed time vs median finish time
                                        if (progressPct === 0) {
                                            const elapsed = runner.gunTime || runner.elapsedTime || 0;
                                            const median = categoryMedianTime[runner.category] || 0;
                                            if (elapsed > 0 && median > 0) {
                                                const maxPct = runner.status === 'dnf' ? 90 : runner.status === 'dns' ? 0 : 95;
                                                progressPct = Math.min(maxPct, Math.round((elapsed / median) * 100));
                                            } else if (runner.latestCheckpoint) {
                                                progressPct = runner.status === 'in_progress' ? 50 : 40;
                                            } else if (runner.isStarted || runner.status === 'in_progress') {
                                                progressPct = 5;
                                            }
                                        }
                                    }

                                    // Render cell content per column key
                                    const renderCell = (key: string) => {
                                        switch (key) {
                                            case 'rank':
                                                return (
                                                    <td key={key} style={{ padding: '6px 8px', textAlign: 'center' }}>
                                                        <span style={{ fontSize: 16, fontWeight: 900, color: rank <= 3 ? (rank === 1 ? '#22c55e' : isDark ? '#94a3b8' : '#334155') : (isDark ? '#64748b' : '#cbd5e1') }}>{rank}</span>
                                                    </td>
                                                );
                                            case 'genRank':
                                                return (
                                                    <td key={key} style={{ padding: '6px 6px', textAlign: 'center' }}>
                                                        <span style={{ fontSize: 12, fontWeight: 700, color: themeStyles.textMuted }}>{runner.genderRank || '-'}</span>
                                                    </td>
                                                );
                                            case 'catRank':
                                                return (
                                                    <td key={key} style={{ padding: '6px 6px', textAlign: 'center' }}>
                                                        <span style={{ fontSize: 12, fontWeight: 700, color: themeStyles.textMuted }}>{runner.categoryRank || '-'}</span>
                                                    </td>
                                                );
                                            case 'runner':
                                                return (
                                                    <td key={key} style={{ padding: isMobile ? '4px 4px' : '6px 8px', overflow: 'hidden' }}>
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: isMobile ? 6 : 10 }}>
                                                            {!isMobile && (
                                                                <div style={{ position: 'relative', flexShrink: 0 }}>
                                                                    <div style={{ width: 32, height: 32, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 700, fontSize: 12, background: avatarBg }}>
                                                                        {initials}
                                                                    </div>
                                                                    {runner.status === 'in_progress' && (
                                                                        <span className="live-dot" style={{ background: '#22c55e', position: 'absolute', bottom: -1, right: -1 }} />
                                                                    )}
                                                                </div>
                                                            )}
                                                            <div style={{ overflow: 'hidden' }}>
                                                                <span style={{ display: 'block', fontWeight: 700, fontSize: isMobile ? 11 : 13, color: themeStyles.text, lineHeight: 1, textTransform: 'uppercase', marginBottom: 3, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                                                    {displayName.trim()}
                                                                </span>
                                                                <span style={{ fontSize: isMobile ? 9 : 10, color: themeStyles.textSecondary, fontWeight: 500, display: 'flex', alignItems: 'center', gap: isMobile ? 4 : 6, whiteSpace: 'nowrap' }}>
                                                                    <span style={{ background: '#dc2626', color: '#fff', padding: '1px 6px', borderRadius: 4, fontSize: isMobile ? 9 : 10, fontWeight: 800, letterSpacing: '0.05em', border: '1px solid #dc2626' }}>
                                                                        {runner.bib}
                                                                    </span>
                                                                    {runner.nationality ? `${runner.nationality} | ` : ''}{runner.ageGroup || runner.category}
                                                                </span>
                                                            </div>
                                                        </div>
                                                    </td>
                                                );
                                            case 'sex':
                                                return (
                                                    <td key={key} style={{ padding: '6px 6px', textAlign: 'center', fontSize: 10, fontWeight: 700, color: runner.gender === 'M' ? '#3b82f6' : '#ec4899' }}>
                                                        {runner.gender}
                                                    </td>
                                                );
                                            case 'status':
                                                return (
                                                    <td key={key} style={{ padding: isMobile ? '4px 2px' : '6px 6px' }}>
                                                        <span style={{ display: 'inline-block', padding: isMobile ? '1px 4px' : '2px 8px', borderRadius: 3, fontWeight: 700, fontSize: isMobile ? 8 : 10, color: '#fff', background: getStatusBgColor(runner.status), lineHeight: 1.3 }}>
                                                            {getStatusLabel(runner.status)}
                                                        </span>
                                                        {!isMobile && runner.latestCheckpoint && (
                                                            <span style={{ display: 'block', fontSize: 9, color: themeStyles.textSecondary, textTransform: 'uppercase', fontWeight: 500, marginTop: 2 }}>
                                                                {runner.latestCheckpoint}
                                                            </span>
                                                        )}
                                                    </td>
                                                );
                                            case 'gunTime':
                                                return (
                                                    <td key={key} style={{ padding: isMobile ? '4px 2px' : '6px 6px', textAlign: 'center' }}>
                                                        <span style={{ fontSize: isMobile ? 11 : 12, fontWeight: 700, color: themeStyles.text, fontFamily: 'monospace' }}>
                                                            {runner.gunTimeStr || formatTime(runner.gunTime || runner.elapsedTime)}
                                                        </span>
                                                    </td>
                                                );
                                            case 'netTime':
                                                return (
                                                    <td key={key} style={{ padding: '6px 6px', textAlign: 'center' }}>
                                                        <span style={{ fontSize: 12, fontWeight: 700, color: (runner.netTimeStr || runner.netTime) ? '#22c55e' : themeStyles.textSecondary, fontFamily: 'monospace' }}>
                                                            {runner.netTimeStr || formatTime(runner.netTime)}
                                                        </span>
                                                    </td>
                                                );
                                            case 'genNet':
                                                return (
                                                    <td key={key} style={{ padding: '6px 4px', textAlign: 'center', fontSize: 11, fontWeight: 600, color: themeStyles.textMuted }}>
                                                        {runner.genderNetRank || '-'}
                                                    </td>
                                                );
                                            case 'gunPace':
                                                return (
                                                    <td key={key} style={{ padding: '6px 6px', textAlign: 'center' }}>
                                                        <span style={{ fontSize: 11, fontWeight: 600, color: themeStyles.textMuted, fontFamily: 'monospace' }}>
                                                            {runner.gunPace || '-'}
                                                        </span>
                                                    </td>
                                                );
                                            case 'netPace':
                                                return (
                                                    <td key={key} style={{ padding: '6px 6px', textAlign: 'center' }}>
                                                        <span style={{ fontSize: 11, fontWeight: 600, color: runner.netPace ? '#22c55e' : themeStyles.textSecondary, fontFamily: 'monospace' }}>
                                                            {runner.netPace || '-'}
                                                        </span>
                                                    </td>
                                                );
                                            case 'finish':
                                                return (
                                                    <td key={key} style={{ padding: '6px 4px', textAlign: 'center', fontSize: 11, fontWeight: 600, color: themeStyles.textMuted }}>
                                                        {runner.totalFinishers || '-'}
                                                    </td>
                                                );
                                            case 'genFin':
                                                return (
                                                    <td key={key} style={{ padding: '6px 4px', textAlign: 'center', fontSize: 11, fontWeight: 600, color: themeStyles.textMuted }}>
                                                        {runner.genderFinishers || '-'}
                                                    </td>
                                                );
                                            case 'progress':
                                                return (
                                                    <td key={key} style={{ padding: '6px 8px', textAlign: 'right' }}>
                                                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
                                                            <div style={{ display: 'flex', alignItems: 'baseline', gap: 4, marginBottom: 4 }}>
                                                                <span style={{ fontWeight: 700, fontSize: 11, color: themeStyles.text }}>
                                                                    {progressPct}%
                                                                </span>
                                                                {progressLabel ? (
                                                                    <span style={{ fontSize: 9, color: themeStyles.textSecondary, fontWeight: 500 }}>
                                                                        {progressLabel}
                                                                    </span>
                                                                ) : progressDistKm > 0 && eventTotalKm > 0 ? (
                                                                    <span style={{ fontSize: 9, color: themeStyles.textSecondary, fontWeight: 500 }}>
                                                                        {progressDistKm.toFixed(1)}/{eventTotalKm.toFixed(0)}km
                                                                    </span>
                                                                ) : null}
                                                            </div>
                                                            <div style={{ width: '100%', maxWidth: 80, height: 6, borderRadius: 3, background: isDark ? 'rgba(255,255,255,0.1)' : '#f1f5f9', overflow: 'hidden' }}>
                                                                <div style={{
                                                                    height: '100%',
                                                                    width: `${progressPct}%`,
                                                                    borderRadius: 3,
                                                                    background: progressPct >= 100
                                                                        ? '#22c55e'
                                                                        : progressPct > 75
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
                                                );
                                            // ===== LAB / LAP columns =====
                                            case 'laps':
                                                return (
                                                    <td key={key} style={{ padding: '6px 6px', textAlign: 'center' }}>
                                                        <span style={{ fontSize: 18, fontWeight: 900, color: (runner.lapCount || runner.passedCount || 0) > 0 ? '#8b5cf6' : themeStyles.textSecondary }}>
                                                            {runner.lapCount || runner.passedCount || 0}
                                                        </span>
                                                    </td>
                                                );
                                            case 'bestLap':
                                                return (
                                                    <td key={key} style={{ padding: '6px 6px', textAlign: 'center' }}>
                                                        <span style={{ fontSize: 12, fontWeight: 700, color: runner.bestLapTime ? '#22c55e' : themeStyles.textSecondary, fontFamily: 'monospace' }}>
                                                            {runner.bestLapTime ? formatTime(runner.bestLapTime) : '-'}
                                                        </span>
                                                    </td>
                                                );
                                            case 'avgLap':
                                                return (
                                                    <td key={key} style={{ padding: '6px 6px', textAlign: 'center' }}>
                                                        <span style={{ fontSize: 12, fontWeight: 600, color: runner.avgLapTime ? themeStyles.text : themeStyles.textSecondary, fontFamily: 'monospace' }}>
                                                            {runner.avgLapTime ? formatTime(runner.avgLapTime) : '-'}
                                                        </span>
                                                    </td>
                                                );
                                            case 'lastLap':
                                                return (
                                                    <td key={key} style={{ padding: '6px 6px', textAlign: 'center' }}>
                                                        <span style={{ fontSize: 12, fontWeight: 600, color: runner.lastLapTime ? themeStyles.text : themeStyles.textSecondary, fontFamily: 'monospace' }}>
                                                            {runner.lastLapTime ? formatTime(runner.lastLapTime) : '-'}
                                                        </span>
                                                    </td>
                                                );
                                            case 'totalTime':
                                                return (
                                                    <td key={key} style={{ padding: '6px 6px', textAlign: 'center' }}>
                                                        <span style={{ fontSize: 12, fontWeight: 700, color: themeStyles.text, fontFamily: 'monospace' }}>
                                                            {formatTime(runner.elapsedTime || runner.gunTime)}
                                                        </span>
                                                    </td>
                                                );
                                            case 'lastPass':
                                                return (
                                                    <td key={key} style={{ padding: '6px 6px', textAlign: 'center' }}>
                                                        <span style={{ fontSize: 11, color: runner.lastPassTime ? themeStyles.text : themeStyles.textSecondary, fontFamily: 'monospace' }}>
                                                            {runner.lastPassTime ? new Date(runner.lastPassTime).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '-'}
                                                        </span>
                                                    </td>
                                                );
                                            case 'lapPace': {
                                                const lapsCount = runner.lapCount || runner.passedCount || 0;
                                                const totalMs = runner.elapsedTime || runner.gunTime || 0;
                                                let lapPaceStr = '-';
                                                if (lapsCount > 0 && totalMs > 0) {
                                                    const msPerLap = totalMs / lapsCount;
                                                    const minPerLap = msPerLap / 60000;
                                                    const pM = Math.floor(minPerLap);
                                                    const pS = Math.round((minPerLap - pM) * 60);
                                                    lapPaceStr = `${pM.toString().padStart(2, '0')}:${pS.toString().padStart(2, '0')}`;
                                                }
                                                return (
                                                    <td key={key} style={{ padding: '6px 6px', textAlign: 'center' }}>
                                                        <span style={{ fontSize: 11, fontWeight: 600, color: lapPaceStr !== '-' ? '#8b5cf6' : themeStyles.textSecondary, fontFamily: 'monospace' }}>
                                                            {lapPaceStr}
                                                        </span>
                                                    </td>
                                                );
                                            }
                                            default:
                                                return null;
                                        }
                                    };

                                    return (
                                        <tr
                                            key={runner._id}
                                            className="runner-row"
                                            onClick={() => handleViewRunner(runner)}
                                            style={{ cursor: 'pointer', transition: 'all 0.15s', borderBottom: `1px solid ${themeStyles.border}`, borderLeft: '4px solid transparent' }}
                                        >
                                            {visibleColumns.map(renderCell)}
                                        </tr>
                                    );
                                })
                            )}
                        </tbody>
                    </table>
                </div>
            </main>

            {/* ===== FOOTER ===== */}
            <footer style={{ background: themeStyles.cardBg, borderTop: `1px solid ${themeStyles.border}`, padding: '8px 16px', position: 'fixed', bottom: 0, width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center', zIndex: 30 }}>
                <p style={{ fontSize: 9, fontWeight: 700, color: themeStyles.textSecondary, textTransform: 'uppercase', letterSpacing: '0.1em', margin: 0 }}>
                    ACTION TIMING &copy; 2026
                </p>
                <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
                    <span style={{ fontSize: 9, fontWeight: 700, color: themeStyles.textMuted, textTransform: 'uppercase' }}>
                        {filteredRunners.length} / {runners.length} {language === 'th' ? 'คน' : 'runners'}
                    </span>
                    <span style={{ fontSize: 9, fontWeight: 600, color: themeStyles.textSecondary }}>
                        {language === 'th' ? 'อัพเดทล่าสุด' : 'Updated'}: {lastUpdated.toLocaleTimeString(language === 'th' ? 'th-TH' : 'en-US')}
                    </span>
                    <span style={{ fontSize: 9, fontWeight: 700, color: '#22c55e', textTransform: 'uppercase' }}>
                        <span style={{ display: 'inline-block', width: 5, height: 5, borderRadius: '50%', background: '#22c55e', marginRight: 4, animation: 'pulseLive 1.5s infinite' }} />
                        {language === 'th' ? 'Auto-refresh 15s' : 'Auto-refresh 15s'}
                    </span>
                    <span style={{ fontSize: 10, fontFamily: 'monospace', color: themeStyles.textSecondary }}>
                        {currentTime.toLocaleTimeString(language === 'th' ? 'th-TH' : 'en-US')}
                    </span>
                </div>
            </footer>

            {/* Runner detail now navigated to /runner/[id] page */}
        </div>
    );
}
