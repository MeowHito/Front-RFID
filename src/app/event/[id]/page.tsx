'use client';

import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useParams, useRouter } from 'next/navigation';
import { useLanguage } from '@/lib/language-context';
import { useTheme } from '@/lib/theme-context';
import { useAuth } from '@/lib/auth-context';
import { authHeaders } from '@/lib/authHeaders';
import CutoffDateTimePicker from '@/components/CutoffDateTimePicker';

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
    raceFinished?: boolean;
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
    statusCheckpoint?: string;
    statusNote?: string;
    statusChangedBy?: string;
    statusChangedAt?: string;
    scanTime?: string;
    distanceFromStart?: number;
    splitTime?: number;
    // RaceTiger pass-time fields
    chipCode?: string;
    printingCode?: string;
    splitNo?: number;
    splitDesc?: string;
    splitPace?: string;
    gunTimeMs?: number;
    netTimeMs?: number;
    totalGunTime?: number;
    totalNetTime?: number;
    supplement?: string;
    cutOff?: string;
    legTime?: number;
    legPace?: string;
    legDistance?: number;
    lagMs?: number;
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

interface RunnerCameraHit {
    checkpoint?: string;
    recording?: {
        _id?: string;
    } | null;
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
    { key: 'rank', label: 'Rank', w: '3%', mw: '4%', align: 'center', fixed: true },
    { key: 'genRank', label: 'Gen', w: '3%', mw: '4%', align: 'center' },
    { key: 'catRank', label: 'Cat', w: '3%', mw: '4%', align: 'center' },
    { key: 'runner', label: 'Runner', w: '15%', mw: '22%', align: 'left', fixed: true },
    { key: 'sex', label: 'Sex', w: '3%', mw: '5%', align: 'center' },
    { key: 'status', label: 'Status', w: '8%', mw: '8%', align: 'left', fixed: true },
    { key: 'gunTime', label: 'Gun Time', w: '7%', mw: '10%', align: 'center' },
    { key: 'netTime', label: 'Net Time', w: '7%', mw: '10%', align: 'center' },
    { key: 'genNet', label: 'Gen Net', w: '4%', mw: '5%', align: 'center' },
    { key: 'gunPace', label: 'Gun Pace', w: '5%', mw: '8%', align: 'center' },
    { key: 'netPace', label: 'Net Pace', w: '5%', mw: '8%', align: 'center' },
    { key: 'finish', label: 'Finish', w: '4%', mw: '5%', align: 'center' },
    { key: 'genFin', label: 'Gen Fin', w: '4%', mw: '5%', align: 'center' },
    // RaceTiger Pass Time columns
    { key: 'chipCode', label: 'Chip Code', w: '6%', mw: '8%', align: 'center' },
    { key: 'printingCode', label: 'Print Code', w: '5%', mw: '7%', align: 'center' },
    { key: 'splitNo', label: 'Split No', w: '4%', mw: '5%', align: 'center' },
    { key: 'splitName', label: 'Split Name', w: '6%', mw: '8%', align: 'center' },
    { key: 'splitTime', label: 'Split Time', w: '5%', mw: '7%', align: 'center' },
    { key: 'splitPace', label: 'Split Pace', w: '5%', mw: '7%', align: 'center' },
    { key: 'distFromStart', label: 'Distance', w: '5%', mw: '6%', align: 'center' },
    { key: 'gunTimeMs', label: 'Gun(ms)', w: '5%', mw: '7%', align: 'center' },
    { key: 'netTimeMs', label: 'Net(ms)', w: '5%', mw: '7%', align: 'center' },
    { key: 'totalGunTime', label: 'Total Gun', w: '5%', mw: '7%', align: 'center' },
    { key: 'totalNetTime', label: 'Total Net', w: '5%', mw: '7%', align: 'center' },
    { key: 'supplement', label: 'Supplement', w: '5%', mw: '6%', align: 'center' },
    { key: 'cutOff', label: 'Cut-off', w: '4%', mw: '5%', align: 'center' },
    { key: 'legTime', label: 'Leg Time', w: '5%', mw: '7%', align: 'center' },
    { key: 'legPace', label: 'Leg Pace', w: '5%', mw: '7%', align: 'center' },
    { key: 'legDistance', label: 'Leg Dist', w: '5%', mw: '6%', align: 'center' },
    { key: 'lagMs', label: 'Lag MS', w: '4%', mw: '5%', align: 'center' },
    { key: 'nextStation', label: 'Next / ETA', w: '9%', mw: '12%', align: 'center' },
    { key: 'progress', label: 'Progress', w: '8%', mw: '8%', align: 'right', fixed: true, desktopOnly: true },
];
const TOGGLEABLE_KEYS = COL_DEFS.filter(c => !c.fixed).map(c => c.key);
// Default visible toggleable columns (only columns that typically have data from RaceTiger)
const DEFAULT_VISIBLE_KEYS = ['genRank', 'catRank', 'sex', 'gunTime', 'netTime', 'netPace', 'splitTime', 'splitPace', 'distFromStart', 'legTime', 'legPace'];

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

function CheckpointCameraIcon({ dark }: { dark: boolean }) {
    return (
        <span
            aria-label="มีวิดีโอ CCTV"
            title="มีวิดีโอ CCTV"
            style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: 12,
                height: 12,
                borderRadius: 999,
                border: `1px solid ${dark ? 'rgba(96,165,250,0.28)' : '#bfdbfe'}`,
                background: dark ? 'rgba(59,130,246,0.14)' : '#dbeafe',
                color: dark ? '#bfdbfe' : '#1d4ed8',
                flexShrink: 0,
            }}
        >
            <svg viewBox="0 0 24 24" fill="currentColor" style={{ width: 7, height: 7 }}>
                <path d="M4 7.75A2.75 2.75 0 0 1 6.75 5h6.5A2.75 2.75 0 0 1 16 7.75v.8l2.73-1.95A1.5 1.5 0 0 1 21 7.82v8.36a1.5 1.5 0 0 1-2.27 1.22L16 15.45v.8A2.75 2.75 0 0 1 13.25 19h-6.5A2.75 2.75 0 0 1 4 16.25v-8.5Z" />
            </svg>
        </span>
    );
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
    const [runnerCameraAvailability, setRunnerCameraAvailability] = useState<Record<string, Record<string, boolean>>>({});
    const [rankDeltas, setRankDeltas] = useState<Map<string, number>>(new Map());
    const prevRanksRef = useRef<Map<string, number>>(new Map());
    const runnerCameraRequestKeyRef = useRef<Map<string, string>>(new Map());

    // Admin status edit modal
    const [editingRunner, setEditingRunner] = useState<Runner | null>(null);
    const [editStatus, setEditStatus] = useState('');
    const [editCheckpoint, setEditCheckpoint] = useState('');
    const [editNote, setEditNote] = useState('');
    const [editSaving, setEditSaving] = useState(false);
    const [editSaveError, setEditSaveError] = useState<string | null>(null);

    // Checkpoint timing data for edit modal
    const [editCheckpoints, setEditCheckpoints] = useState<{name: string; orderNum: number; type: string}[]>([]);
    const [editTimingRecords, setEditTimingRecords] = useState<{_id?: string; checkpoint: string; scanTime: string; order?: number}[]>([]);
    const [editTimingChanges, setEditTimingChanges] = useState<Record<string, string>>({});
    const [editTimingLoading, setEditTimingLoading] = useState(false);
    const [editTimingSaveMsg, setEditTimingSaveMsg] = useState<string | null>(null);
    const [cpTimingPickerOpen, setCpTimingPickerOpen] = useState<string | null>(null);

    const toApiData = (payload: any) => payload?.data ?? payload;

    // Compute rank deltas: compare current overallRank vs previous refresh
    // Deltas are "sticky" — once set, they persist and don't get overwritten
    function updateRankDeltas(newRunners: Runner[]) {
        const prev = prevRanksRef.current;
        const newRanksMap = new Map<string, number>();
        const newDeltas = new Map<string, number>(rankDeltas); // preserve existing deltas
        newRunners.forEach(r => {
            if (r.bib && r.overallRank && r.overallRank > 0) {
                newRanksMap.set(r.bib, r.overallRank);
                if (!newDeltas.has(r.bib)) {
                    const prevRank = prev.get(r.bib);
                    if (prevRank !== undefined && prevRank > 0) {
                        const delta = prevRank - r.overallRank;
                        if (delta !== 0) newDeltas.set(r.bib, delta);
                    }
                }
            }
        });
        prevRanksRef.current = newRanksMap;
        setRankDeltas(newDeltas);
    }

    // Derive effective status from actual RaceTiger timing data
    function deriveEffectiveStatus(runner: Runner): Runner {
        // Preserve explicit statuses from backend (finished/dq/dnf/dns)
        // Backend already handles DNF correctly (from RaceTiger API or raceFinished=true auto-detection)
        if (['finished', 'dq', 'dnf', 'dns'].includes(runner.status)) return runner;

        const hasGunTime = (runner.gunTime && runner.gunTime > 0) || !!runner.gunTimeStr;
        const hasNetTime = (runner.netTime && runner.netTime > 0) || !!runner.netTimeStr;
        const hasCheckpoint = !!runner.latestCheckpoint && runner.latestCheckpoint.toLowerCase() !== 'start';
        const hasPassedCount = (runner.passedCount ?? 0) > 0;
        const hasElapsed = (runner.elapsedTime && runner.elapsedTime > 0);

        if (hasGunTime || hasNetTime || hasCheckpoint || hasPassedCount || hasElapsed) {
            // Runner has evidence of starting — mark as in_progress
            // Do NOT promote to "finished" based on overallRank — backend live ranking
            // now assigns overallRank to in_progress runners too
            return { ...runner, status: 'in_progress' };
        }

        // No timing data at all → keep original (not_started = DNS)
        return runner;
    }

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

    // Choose API endpoint based on raceFinished flag
    const isRaceFinished = campaign?.raceFinished ?? false;
    const runnersApiUrl = isRaceFinished
        ? `/api/runners?id=${campaign?._id}`
        : `/api/runners/passtime?id=${campaign?._id}`;

    // Auto-refresh runners every 10 seconds (5s for live passtime, 15s for finished)
    useEffect(() => {
        if (!campaign?._id) return;
        const interval = isRaceFinished ? 15_000 : 10_000;
        const refreshInterval = setInterval(async () => {
            try {
                const url = isRaceFinished
                    ? `/api/runners?id=${campaign._id}`
                    : `/api/runners/passtime?id=${campaign._id}`;
                const runnersRes = await fetch(url, { cache: 'no-store' });
                if (runnersRes.ok) {
                    const runnersData = await runnersRes.json().catch(() => ({}));
                    const list = (runnersData?.data?.data as Runner[]) || (runnersData?.data as Runner[]) || (Array.isArray(runnersData) ? runnersData : []);
                    if (Array.isArray(list) && list.length > 0) {
                        const mapped = list.map(deriveEffectiveStatus);
                        updateRankDeltas(mapped);
                        setRunners(mapped);
                        setLastUpdated(new Date());
                    }
                }
            } catch { /* silently retry next interval */ }
        }, interval);
        return () => clearInterval(refreshInterval);
    }, [campaign?._id, isRaceFinished]);

    useEffect(() => {
        setRunnerCameraAvailability({});
        runnerCameraRequestKeyRef.current = new Map();
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

            const usePassTime = !(campaignData.raceFinished ?? false);
            const runnersUrl = usePassTime
                ? `/api/runners/passtime?id=${campaignData._id}`
                : `/api/runners?id=${campaignData._id}`;
            const runnersRes = await fetch(runnersUrl, { cache: 'no-store' });
            if (runnersRes.ok) {
                const runnersData = await runnersRes.json().catch(() => ({}));
                const list = (runnersData?.data?.data as Runner[]) || (runnersData?.data as Runner[]) || (Array.isArray(runnersData) ? runnersData : []);
                const runnerList = (Array.isArray(list) ? list : []).map(deriveEffectiveStatus);
                updateRankDeltas(runnerList);
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
            case 'in_progress': return 'Running';
            case 'dnf': return 'DNF';
            case 'dns': return 'DNS';
            case 'dq': return 'DQ';
            case 'not_started': return 'DNS';
            default: return status?.toUpperCase() || '-';
        }
    }

    function getStatusBgColor(status: string) {
        switch (status) {
            case 'finished': return '#22c55e';
            case 'in_progress': return '#f97316';
            case 'dnf': return '#dc2626';
            case 'dns': return '#dc2626';
            case 'dq': return '#7c2d12';
            default: return '#94a3b8';
        }
    }

    const stats = useMemo(() => ({
        total: runners.length,
        started: runners.filter(r => r.status !== 'not_started' && r.status !== 'dns').length,
        finished: runners.filter(r => r.status === 'finished').length,
        racing: runners.filter(r => r.status === 'in_progress').length,
        dnf: runners.filter(r => r.status === 'dnf' || r.status === 'dns' || r.status === 'dq').length,
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
        const hasSavedAdminCols = Array.isArray(adminCols) && adminCols.length > 0;
        // Rebuild full column order from admin settings
        let fullOrder: string[];
        if (hasSavedAdminCols) {
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
            if (hasSavedAdminCols && !adminCols.includes(key)) return false;
            // When no admin columns configured, use sensible defaults instead of showing all 30+ columns
            if (!hasSavedAdminCols && !DEFAULT_VISIBLE_KEYS.includes(key)) return false;
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
        runners
            .filter(r => !filterCategory || resolveRunnerCategoryKey(r) === filterCategory)
            .forEach(r => {
                counts.ALL++;
                counts[r.status] = (counts[r.status] || 0) + 1;
            });
        return counts;
    }, [runners, filterCategory, resolveRunnerCategoryKey]);

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
                // Group by status: finished FIRST, then in_progress, then DNF/DNS/DQ, then not_started
                const statusOrder: Record<string, number> = { 'finished': 0, 'in_progress': 1, 'dnf': 2, 'dns': 3, 'dq': 4, 'not_started': 5 };
                const statusDiff = (statusOrder[a.status] ?? 6) - (statusOrder[b.status] ?? 6);
                if (statusDiff !== 0) return statusDiff;

                // Within finished group: sort by netTime ASC (fastest first, ms precision)
                if (a.status === 'finished' && b.status === 'finished') {
                    const aNet = a.netTime || a.gunTime || 0;
                    const bNet = b.netTime || b.gunTime || 0;
                    if (aNet > 0 && bNet > 0) return aNet - bNet;
                    if (aNet > 0 && bNet <= 0) return -1;
                    if (aNet <= 0 && bNet > 0) return 1;
                    return 0;
                }

                // Within in_progress group: sort by checkpoint closest to finish DESC, then fastest time ASC
                if (a.status === 'in_progress' && b.status === 'in_progress') {
                    const aPassed = a.passedCount ?? 0;
                    const bPassed = b.passedCount ?? 0;
                    if (aPassed !== bPassed) return bPassed - aPassed; // DESC: more passed = closer to finish

                    // Same checkpoint count: sort by elapsed time ASC (faster = higher rank)
                    const aTime = a.netTime || a.gunTime || a.elapsedTime || 0;
                    const bTime = b.netTime || b.gunTime || b.elapsedTime || 0;
                    if (aTime > 0 && bTime > 0) return aTime - bTime;
                    if (aTime > 0 && bTime <= 0) return -1;
                    if (aTime <= 0 && bTime > 0) return 1;
                }

                // Fallback: by BIB
                return (a.bib || '').localeCompare(b.bib || '', undefined, { numeric: true });
            });
    }, [runners, searchQuery, filterGender, filterCategory, filterStatus, resolveRunnerCategoryKey]);

    // Compute live gender and category ranks from sorted runners
    // These are computed AFTER sorting so rank=position within gender/category group
    const liveRanks = useMemo(() => {
        const genderCounters: Record<string, number> = {};
        const categoryCounters: Record<string, number> = {};
        const ranks = new Map<string, { genRank: number; catRank: number }>();
        for (const runner of filteredRunners) {
            // Rank runners who have passed at least one checkpoint (finished, in_progress, or DNF with progress)
            // Skip DNS/DQ/not_started runners with no checkpoint progress
            if (runner.status === 'not_started' || runner.status === 'dns' || runner.status === 'dq') continue;
            if (runner.status === 'dnf' && !((runner.passedCount ?? 0) > 0)) continue;
            const gender = runner.gender || '_';
            const catKey = resolveRunnerCategoryKey(runner) || '_';
            genderCounters[gender] = (genderCounters[gender] || 0) + 1;
            categoryCounters[catKey] = (categoryCounters[catKey] || 0) + 1;
            ranks.set(runner._id, { genRank: genderCounters[gender], catRank: categoryCounters[catKey] });
        }
        return ranks;
    }, [filteredRunners, resolveRunnerCategoryKey]);

    useEffect(() => {
        if (!campaign?._id || filteredRunners.length === 0) return;

        let cancelled = false;
        const runnersToLoad = filteredRunners.filter((runner) => {
            if (!runner._id) return false;
            if (!runner.scanTime && !runner.latestCheckpoint && !runner.statusCheckpoint) return false;

            const requestKey = [runner.latestCheckpoint || '', runner.statusCheckpoint || '', runner.scanTime || ''].join('|');
            if (runnerCameraRequestKeyRef.current.get(runner._id) === requestKey) return false;
            runnerCameraRequestKeyRef.current.set(runner._id, requestKey);
            return true;
        });

        if (runnersToLoad.length === 0) return;

        (async () => {
            const updates = await Promise.all(runnersToLoad.map(async (runner) => {
                try {
                    const res = await fetch(`/api/runner/${runner._id}/cctv`, { cache: 'no-store' });
                    const payload = await res.json().catch(() => ({}));
                    const hits: RunnerCameraHit[] = payload?.status?.code === '200' && Array.isArray(payload?.data?.hits)
                        ? payload.data.hits
                        : [];

                    const checkpointMap: Record<string, boolean> = {};
                    hits.forEach((hit) => {
                        const key = normalizeComparableText(hit?.checkpoint);
                        if (key && hit?.recording) checkpointMap[key] = true;
                    });

                    return { runnerId: runner._id, checkpointMap, shouldRetry: false };
                } catch {
                    return { runnerId: runner._id, checkpointMap: {}, shouldRetry: true };
                }
            }));

            if (cancelled) return;

            updates.forEach((update) => {
                if (update.shouldRetry) {
                    runnerCameraRequestKeyRef.current.delete(update.runnerId);
                }
            });

            setRunnerCameraAvailability((prev) => {
                const next = { ...prev };
                updates.forEach((update) => {
                    next[update.runnerId] = update.checkpointMap;
                });
                return next;
            });
        })();

        return () => {
            cancelled = true;
        };
    }, [campaign?._id, filteredRunners]);

    const handleViewRunner = (runner: Runner) => {
        router.push(`/runner/${runner._id}`);
    };

    const openStatusEdit = async (runner: Runner, e: React.MouseEvent) => {
        e.stopPropagation(); // Don't navigate to runner page
        setEditingRunner(runner);
        setEditStatus(runner.status);
        setEditCheckpoint(runner.statusCheckpoint || runner.latestCheckpoint || '');
        setEditNote(runner.statusNote || '');
        setEditSaveError(null);
        setEditTimingChanges({});
        setEditTimingSaveMsg(null);

        // Fetch checkpoints and timing records for this runner
        if (campaign?._id && runner.eventId) {
            setEditTimingLoading(true);
            try {
                const [cpRes, trRes] = await Promise.all([
                    fetch(`/api/checkpoints/campaign/${campaign._id}`, { cache: 'no-store' }),
                    fetch(`/api/timing/runner/${runner.eventId}/${runner._id}`, { cache: 'no-store' }),
                ]);
                if (cpRes.ok) {
                    const cpData = await cpRes.json();
                    const cps = (Array.isArray(cpData) ? cpData : cpData?.data || []).map((cp: any) => ({
                        name: cp.name || '',
                        orderNum: cp.orderNum ?? 0,
                        type: cp.type || 'checkpoint',
                    })).sort((a: any, b: any) => a.orderNum - b.orderNum);
                    setEditCheckpoints(cps);
                }
                if (trRes.ok) {
                    const trData = await trRes.json();
                    const records = (Array.isArray(trData) ? trData : trData?.data || []).map((r: any) => ({
                        _id: r._id,
                        checkpoint: r.checkpoint || '',
                        scanTime: r.scanTime || '',
                        order: r.order,
                    }));
                    setEditTimingRecords(records);
                }
            } catch { /* ignore fetch errors */ }
            setEditTimingLoading(false);
        }
    };

    const handleStatusUpdate = async () => {
        if (!editingRunner) return;
        setEditSaving(true);
        setEditSaveError(null);
        try {
            const res = await fetch(`/api/runners/${editingRunner._id}/status`, {
                method: 'PUT',
                headers: authHeaders(),
                body: JSON.stringify({
                    status: editStatus,
                    statusCheckpoint: editCheckpoint || undefined,
                    statusNote: editNote || undefined,
                    changedBy: 'admin',
                }),
            });
            if (!res.ok) {
                let message = language === 'th' ? 'บันทึกข้อมูลไม่สำเร็จ' : 'Failed to save runner status';
                try {
                    const payload = await res.json();
                    const rawMessage = payload?.message || payload?.error;
                    if (Array.isArray(rawMessage)) {
                        message = rawMessage.join(', ');
                    } else if (typeof rawMessage === 'string' && rawMessage.trim()) {
                        message = rawMessage;
                    }
                } catch {
                    try {
                        const text = await res.text();
                        if (text.trim()) message = text;
                    } catch {
                    }
                }
                throw new Error(message);
            }

            setRunners(prev => prev.map(r =>
                r._id === editingRunner._id
                    ? { ...r, status: editStatus, statusCheckpoint: editCheckpoint, statusNote: editNote, statusChangedAt: new Date().toISOString() }
                    : r
            ));
            setEditingRunner(null);
        } catch (err: unknown) {
            setEditSaveError(err instanceof Error ? err.message : (language === 'th' ? 'บันทึกข้อมูลไม่สำเร็จ' : 'Failed to save runner status'));
        } finally {
            setEditSaving(false);
        }
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
                .runner-row.runner-row-danger,
                .runner-row.runner-row-danger:hover { background-color: ${isDark ? 'rgba(254,226,226,0.12)' : '#fee2e2'} !important; border-left-color: #dc2626 !important; }
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
                            <span style={{ fontSize: 18, fontWeight: 900, fontStyle: 'italic', color: themeStyles.text, borderLeft: `1px solid ${themeStyles.border}`, paddingLeft: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
                                <span style={{ color: isRaceFinished ? '#3b82f6' : '#22c55e', fontWeight: 700, fontStyle: 'normal', textTransform: 'uppercase' }}>
                                    {isRaceFinished ? 'Results' : 'Live'}
                                </span>
                                {!isRaceFinished && <span className="live-dot" style={{ background: '#22c55e' }} />}
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
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <span style={{ fontSize: 9, fontWeight: 700, color: themeStyles.textSecondary, textTransform: 'uppercase', letterSpacing: '0.05em', whiteSpace: 'nowrap' }}>
                                STATUS:
                            </span>
                            <div style={{ display: 'flex', background: themeStyles.inputBg, padding: 3, borderRadius: 8 }}>
                                {([
                                    { key: 'ALL', label: language === 'th' ? 'ทั้งหมด' : 'All', color: '#22c55e' },
                                    { key: 'finished', label: 'Finish', color: '#22c55e' },
                                    { key: 'in_progress', label: 'Racing', color: '#f97316' },
                                    { key: 'dnf', label: 'DNF', color: '#ef4444' },
                                    { key: 'dns', label: 'DNS', color: '#ef4444' },
                                    { key: 'not_started', label: 'Wait', color: '#94a3b8' },
                                ] as const).map(s => (
                                    <button
                                        key={s.key}
                                        onClick={() => setFilterStatus(s.key)}
                                        style={{
                                            padding: '4px 10px', fontSize: 10, fontWeight: 700, borderRadius: 6, border: 'none', cursor: 'pointer', transition: 'all 0.2s', whiteSpace: 'nowrap',
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
                </div>
                {/* Status filter moved to header right side */}
            </header>

            {/* ===== FILTER BAR ===== */}
            <div style={{ background: themeStyles.cardBg, borderBottom: `1px solid ${themeStyles.border}`, padding: '8px 16px', display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: isMobile ? 6 : 12 }}>
                {/* Row 1: Distance + More button (mobile) */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', ...(isMobile ? { width: '100%' } : {}) }}>
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
                                flex: 1,
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

                    {/* Mobile toggle — placed on same row as distance */}
                    {isMobile && (
                        <button
                            onClick={() => setShowAllColumns(!showAllColumns)}
                            style={{ background: showAllColumns ? '#22c55e' : themeStyles.cardBg, border: `1px solid ${showAllColumns ? '#22c55e' : themeStyles.border}`, color: showAllColumns ? '#fff' : themeStyles.textMuted, padding: '6px 12px', borderRadius: 8, fontSize: 11, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, whiteSpace: 'nowrap', marginLeft: 'auto' }}
                        >
                            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 3v18M3 12h18" /></svg>
                            {showAllColumns ? (language === 'th' ? 'ย่อ' : 'Less') : (language === 'th' ? 'เพิ่มเติม' : 'More')}
                        </button>
                    )}
                </div>

                {/* Row 2 (mobile): Search input + Gender filter — full width, gender flush right */}
                {isMobile && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%' }}>
                        {/* Search */}
                        <div style={{ position: 'relative', flex: 1, minWidth: 0 }}>
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={themeStyles.textSecondary} strokeWidth="2" style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)' }}>
                                <circle cx="11" cy="11" r="8" /><path d="M21 21l-4.35-4.35" />
                            </svg>
                            <input
                                type="text"
                                placeholder={language === 'th' ? 'BIB หรือ ชื่อ...' : 'BIB or Name...'}
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                style={{ paddingLeft: 30, paddingRight: 10, paddingTop: 6, paddingBottom: 6, background: themeStyles.inputBg, border: 'none', borderRadius: 8, fontSize: 12, width: '100%', outline: 'none', color: themeStyles.text }}
                            />
                        </div>
                        {/* Gender Filter */}
                        <div style={{ display: 'flex', background: themeStyles.inputBg, padding: 3, borderRadius: 8, flexShrink: 0 }}>
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
                    </div>
                )}

                {/* Right controls (desktop only) */}
                {!isMobile && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        {/* Gender Filter — desktop only */}
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
                                style={{ paddingLeft: 30, paddingRight: 16, paddingTop: 6, paddingBottom: 6, background: themeStyles.inputBg, border: 'none', borderRadius: 8, fontSize: 12, width: 180, outline: 'none', color: themeStyles.text }}
                            />
                        </div>

                        {/* Column dropdown */}
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
                    </div>
                )}
            </div>

            {/* ===== TABLE ===== */}
            <main style={{ padding: '0 16px' }}>
                <div className="table-scroll" style={{ background: themeStyles.cardBg, borderRadius: 0, boxShadow: 'none', border: `1px solid ${themeStyles.border}`, borderTop: 'none', borderBottom: 'none', height: 'calc(100vh - 100px)', overflowY: 'auto', overflowX: isMobile && showAllColumns ? 'auto' : 'hidden', paddingBottom: 40 }}>
                    <table style={{ width: isMobile && showAllColumns ? 800 : '100%', textAlign: 'left', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
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
                                    const isFinishCp = (runner.latestCheckpoint || '').toUpperCase().includes('FINISH') || (runner.latestCheckpoint || '').toUpperCase() === 'FIN';
                                    if (runner.status === 'finished' || isFinishCp) {
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
                                            const ratio = Math.round((runner.passedCount! / totalCps) * 100);
                                            progressPct = runner.passedCount! >= totalCps ? 100 : Math.min(99, ratio);
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

                                    const statusCheckpointName = runner.statusCheckpoint || runner.latestCheckpoint || '';
                                    const statusCheckpointKey = normalizeComparableText(statusCheckpointName);
                                    const statusCheckpointHasCamera = !!statusCheckpointKey && !!runnerCameraAvailability[runner._id]?.[statusCheckpointKey];
                                    const statusScanTimeLabel = !isRaceFinished && runner.scanTime
                                        ? (() => {
                                            const d = new Date(runner.scanTime!);
                                            return `${d.getHours().toString().padStart(2,'0')}:${d.getMinutes().toString().padStart(2,'0')}:${d.getSeconds().toString().padStart(2,'0')}.${d.getMilliseconds().toString().padStart(3,'0')}`;
                                        })()
                                        : '';

                                    // Render cell content per column key
                                    const renderCell = (key: string) => {
                                        switch (key) {
                                            case 'rank': {
                                                const hideRank = ['dnf', 'dns', 'dq', 'not_started'].includes(runner.status);
                                                return (
                                                    <td key={key} style={{ padding: isMobile ? '4px 2px' : '6px 8px', textAlign: 'center' }}>
                                                        <span style={{ fontSize: isMobile ? 14 : 16, fontWeight: 900, color: hideRank ? (isDark ? '#64748b' : '#cbd5e1') : (isMobile ? '#0f172a' : (rank <= 3 ? (rank === 1 ? '#22c55e' : isDark ? '#94a3b8' : '#334155') : (isDark ? '#64748b' : '#cbd5e1'))) }}>{hideRank ? '-' : rank}</span>
                                                    </td>
                                                );
                                            }
                                            case 'genRank': {
                                                const hideGenRank = ['dnf', 'dns', 'dq', 'not_started'].includes(runner.status);
                                                const liveGen = liveRanks.get(runner._id)?.genRank;
                                                const displayGenRank = hideGenRank ? '-' : (liveGen || runner.genderRank || '-');
                                                return (
                                                    <td key={key} style={{ padding: isMobile ? '4px 2px' : '6px 6px', textAlign: 'center' }}>
                                                        <span style={{ fontSize: isMobile ? 11 : 12, fontWeight: 700, color: isMobile ? '#0f172a' : themeStyles.textMuted }}>{displayGenRank}</span>
                                                    </td>
                                                );
                                            }
                                            case 'catRank': {
                                                const hideCatRank = ['dnf', 'dns', 'dq', 'not_started'].includes(runner.status);
                                                const liveCat = liveRanks.get(runner._id)?.catRank;
                                                const displayCatRank = hideCatRank ? '-' : (liveCat || runner.categoryRank || '-');
                                                return (
                                                    <td key={key} style={{ padding: isMobile ? '4px 2px' : '6px 6px', textAlign: 'center' }}>
                                                        <span style={{ fontSize: isMobile ? 11 : 12, fontWeight: 700, color: isMobile ? '#0f172a' : themeStyles.textMuted }}>{displayCatRank}</span>
                                                    </td>
                                                );
                                            }
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
                                                                    {(() => { const d = rankDeltas.get(runner.bib); if (!d) return null; return <span style={{ fontSize: isMobile ? 8 : 9, fontWeight: 800, color: d > 0 ? '#16a34a' : '#dc2626' }}>{d > 0 ? `▲${d}` : `▼${Math.abs(d)}`}</span>; })()}
                                                                    {runner.nationality ? `${runner.nationality} | ` : ''}{runner.ageGroup || runner.category}
                                                                </span>
                                                            </div>
                                                        </div>
                                                    </td>
                                                );
                                            case 'sex':
                                                return (
                                                    <td key={key} style={{ padding: '6px 6px', textAlign: 'center', fontSize: 22, fontWeight: 900, color: runner.gender === 'M' ? '#3b82f6' : '#ec4899' }}>
    {runner.gender === 'F' ? '♀' : '♂'}
</td>
                                                );
                                            case 'status':
                                                return (
                                                    <td key={key} style={{ padding: isMobile ? '4px 2px' : '6px 6px' }}>
                                                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, minWidth: 0 }}>
                                                            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4, minWidth: 0 }}>
                                                                <span style={{ display: 'inline-block', padding: isMobile ? '1px 4px' : '2px 8px', borderRadius: 3, fontWeight: 700, fontSize: isMobile ? 8 : 10, color: '#fff', background: getStatusBgColor(runner.status), lineHeight: 1.3 }}>
                                                                    {getStatusLabel(runner.status)}
                                                                </span>
                                                                {statusCheckpointHasCamera && <CheckpointCameraIcon dark={isDark} />}
                                                            </div>
                                                            {isAdmin && !isMobile && (
                                                                <button
                                                                    onClick={(e) => openStatusEdit(runner, e)}
                                                                    title="Edit status"
                                                                    style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 2, fontSize: 15, color: themeStyles.textSecondary, opacity: 0.5, lineHeight: 0.8 }}
                                                                    onMouseEnter={e => (e.currentTarget.style.opacity = '1')}
                                                                    onMouseLeave={e => (e.currentTarget.style.opacity = '0.5')}
                                                                >
                                                                    ✏️
                                                                </button>
                                                            )}
                                                        </div>
                                                        {statusCheckpointName && (
                                                            <div style={{ marginTop: 2, minWidth: 0, overflow: 'hidden' }}>
                                                                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, maxWidth: '100%', minWidth: 0, fontSize: isMobile ? 8 : 9, color: runner.statusCheckpoint ? '#dc2626' : '#1e293b', textTransform: 'uppercase', fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', verticalAlign: 'top' }}>
                                                                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{statusCheckpointName}</span>
                                                                    {runner.statusNote && <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>· {runner.statusNote}</span>}
                                                                    {statusScanTimeLabel && <span style={{ flexShrink: 0 }}>· {statusScanTimeLabel}</span>}
                                                                </span>
                                                            </div>
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
                                            // ===== RaceTiger Pass Time columns =====
                                            case 'chipCode':
                                                return (
                                                    <td key={key} style={{ padding: '6px 4px', textAlign: 'center', fontSize: 10, fontFamily: 'monospace', color: themeStyles.textSecondary }}>
                                                        {runner.chipCode || '-'}
                                                    </td>
                                                );
                                            case 'printingCode':
                                                return (
                                                    <td key={key} style={{ padding: '6px 4px', textAlign: 'center', fontSize: 10, fontFamily: 'monospace', color: themeStyles.textSecondary }}>
                                                        {runner.printingCode || '-'}
                                                    </td>
                                                );
                                            case 'splitNo':
                                                return (
                                                    <td key={key} style={{ padding: '6px 4px', textAlign: 'center', fontSize: 11, fontWeight: 600, color: themeStyles.textMuted }}>
                                                        {runner.splitNo ?? '-'}
                                                    </td>
                                                );
                                            case 'splitName':
                                                return (
                                                    <td key={key} style={{ padding: '6px 4px', textAlign: 'center', fontSize: 10, color: themeStyles.textSecondary }}>
                                                        {runner.splitDesc || '-'}
                                                    </td>
                                                );
                                            case 'splitTime':
                                                return (
                                                    <td key={key} style={{ padding: '6px 4px', textAlign: 'center', fontSize: 11, fontWeight: 600, fontFamily: 'monospace', color: runner.splitTime ? themeStyles.text : themeStyles.textSecondary }}>
                                                        {runner.splitTime ? formatTime(runner.splitTime) : '-'}
                                                    </td>
                                                );
                                            case 'splitPace':
                                                return (
                                                    <td key={key} style={{ padding: '6px 4px', textAlign: 'center', fontSize: 11, fontWeight: 600, fontFamily: 'monospace', color: runner.splitPace ? '#22c55e' : themeStyles.textSecondary }}>
                                                        {runner.splitPace || '-'}
                                                    </td>
                                                );
                                            case 'distFromStart':
                                                return (
                                                    <td key={key} style={{ padding: '6px 4px', textAlign: 'center', fontSize: 11, fontWeight: 600, color: themeStyles.textMuted }}>
                                                        {runner.distanceFromStart ? `${runner.distanceFromStart.toFixed(1)}km` : '-'}
                                                    </td>
                                                );
                                            case 'gunTimeMs':
                                                return (
                                                    <td key={key} style={{ padding: '6px 4px', textAlign: 'center', fontSize: 11, fontWeight: 600, fontFamily: 'monospace', color: runner.gunTimeMs ? themeStyles.text : themeStyles.textSecondary }}>
                                                        {runner.gunTimeMs ? formatTime(runner.gunTimeMs) : '-'}
                                                    </td>
                                                );
                                            case 'netTimeMs':
                                                return (
                                                    <td key={key} style={{ padding: '6px 4px', textAlign: 'center', fontSize: 11, fontWeight: 600, fontFamily: 'monospace', color: runner.netTimeMs ? themeStyles.text : themeStyles.textSecondary }}>
                                                        {runner.netTimeMs ? formatTime(runner.netTimeMs) : '-'}
                                                    </td>
                                                );
                                            case 'totalGunTime':
                                                return (
                                                    <td key={key} style={{ padding: '6px 4px', textAlign: 'center', fontSize: 11, fontWeight: 600, fontFamily: 'monospace', color: runner.totalGunTime ? themeStyles.text : themeStyles.textSecondary }}>
                                                        {runner.totalGunTime ? formatTime(runner.totalGunTime) : '-'}
                                                    </td>
                                                );
                                            case 'totalNetTime':
                                                return (
                                                    <td key={key} style={{ padding: '6px 4px', textAlign: 'center', fontSize: 11, fontWeight: 600, fontFamily: 'monospace', color: runner.totalNetTime ? themeStyles.text : themeStyles.textSecondary }}>
                                                        {runner.totalNetTime ? formatTime(runner.totalNetTime) : '-'}
                                                    </td>
                                                );
                                            case 'supplement':
                                                return (
                                                    <td key={key} style={{ padding: '6px 4px', textAlign: 'center', fontSize: 10, color: themeStyles.textSecondary }}>
                                                        {runner.supplement || '-'}
                                                    </td>
                                                );
                                            case 'cutOff':
                                                return (
                                                    <td key={key} style={{ padding: '6px 4px', textAlign: 'center', fontSize: 10, fontWeight: 600, color: runner.cutOff ? '#dc2626' : themeStyles.textSecondary }}>
                                                        {runner.cutOff || '-'}
                                                    </td>
                                                );
                                            case 'legTime':
                                                return (
                                                    <td key={key} style={{ padding: '6px 4px', textAlign: 'center', fontSize: 11, fontWeight: 600, fontFamily: 'monospace', color: runner.legTime ? themeStyles.text : themeStyles.textSecondary }}>
                                                        {runner.legTime ? formatTime(runner.legTime) : '-'}
                                                    </td>
                                                );
                                            case 'legPace':
                                                return (
                                                    <td key={key} style={{ padding: '6px 4px', textAlign: 'center', fontSize: 11, fontWeight: 600, fontFamily: 'monospace', color: runner.legPace ? '#22c55e' : themeStyles.textSecondary }}>
                                                        {runner.legPace || '-'}
                                                    </td>
                                                );
                                            case 'legDistance':
                                                return (
                                                    <td key={key} style={{ padding: '6px 4px', textAlign: 'center', fontSize: 11, fontWeight: 600, color: themeStyles.textMuted }}>
                                                        {runner.legDistance ? `${runner.legDistance.toFixed(1)}km` : '-'}
                                                    </td>
                                                );
                                            case 'lagMs':
                                                return (
                                                    <td key={key} style={{ padding: '6px 4px', textAlign: 'center', fontSize: 11, fontWeight: 600, fontFamily: 'monospace', color: runner.lagMs ? themeStyles.text : themeStyles.textSecondary }}>
                                                        {runner.lagMs ? formatTime(runner.lagMs) : '-'}
                                                    </td>
                                                );
                                            case 'nextStation': {
                                                // --- Live ETA Countdown with order-based fallback ---
                                                if (runner.status === 'finished') {
                                                    return (
                                                        <td key={key} className="px-1 py-1.5 text-center">
                                                            <span className="text-[11px] font-bold text-green-500">🏁 FINISH</span>
                                                        </td>
                                                    );
                                                }
                                                if (['dnf', 'dns', 'dq', 'not_started'].includes(runner.status || '')) {
                                                    return (
                                                        <td key={key} className="px-1 py-1.5 text-center text-[10px]" style={{ color: themeStyles.textSecondary }}>-</td>
                                                    );
                                                }

                                                // For finished events — ETA is meaningless, show static info only
                                                if (isRaceFinished) {
                                                    const evLookupFin = runner.eventId ? cpDistanceLookup[runner.eventId] : null;
                                                    let nextLabel = '';
                                                    if (evLookupFin) {
                                                        const cpKeyFin = runner.latestCheckpoint?.trim().toLowerCase() || '';
                                                        const cpKeyNormFin = normalizeComparableText(runner.latestCheckpoint);
                                                        let matchedKeyFin = '';
                                                        if (cpKeyFin && evLookupFin.checkpoints[cpKeyFin] !== undefined) matchedKeyFin = cpKeyFin;
                                                        else if (cpKeyNormFin) {
                                                            for (const k of Object.keys(evLookupFin.checkpoints)) {
                                                                if (normalizeComparableText(k) === cpKeyNormFin) { matchedKeyFin = k; break; }
                                                            }
                                                        }
                                                        if (matchedKeyFin) {
                                                            const curOrd = evLookupFin.cpOrders[matchedKeyFin] ?? 0;
                                                            let bestKey = '';
                                                            let bestOrd = Infinity;
                                                            for (const [k, ord] of Object.entries(evLookupFin.cpOrders)) {
                                                                if (ord > curOrd && ord < bestOrd) { bestOrd = ord; bestKey = k; }
                                                            }
                                                            nextLabel = bestKey ? bestKey.toUpperCase() : 'FINISH';
                                                        }
                                                    }
                                                    return (
                                                        <td key={key} className="px-1 py-1.5 text-center">
                                                            {nextLabel ? (
                                                                <div>
                                                                    <div className="text-[10px] font-bold text-blue-500">
                                                                        → {nextLabel}
                                                                    </div>
                                                                    <div className="mt-px text-[8px]" style={{ color: themeStyles.textSecondary }}>
                                                                        {language === 'th' ? 'จบแล้ว' : 'ended'}
                                                                    </div>
                                                                </div>
                                                            ) : (
                                                                <span className="text-[10px]" style={{ color: themeStyles.textSecondary }}>-</span>
                                                            )}
                                                        </td>
                                                    );
                                                }

                                                const evLookupEta = runner.eventId ? cpDistanceLookup[runner.eventId] : null;
                                                let nextCpName = '';
                                                let etaRemainingSec = -1;
                                                let isPastDue = false;

                                                if (evLookupEta) {
                                                    const cpKeyEta = runner.latestCheckpoint?.trim().toLowerCase() || '';
                                                    const cpKeyNormEta = normalizeComparableText(runner.latestCheckpoint);
                                                    let matchedKey = '';
                                                    if (cpKeyEta && evLookupEta.checkpoints[cpKeyEta] !== undefined) {
                                                        matchedKey = cpKeyEta;
                                                    } else if (cpKeyNormEta) {
                                                        for (const k of Object.keys(evLookupEta.checkpoints)) {
                                                            if (normalizeComparableText(k) === cpKeyNormEta) { matchedKey = k; break; }
                                                        }
                                                    }

                                                    if (matchedKey) {
                                                        const currentCpDist = evLookupEta.checkpoints[matchedKey] ?? 0;
                                                        const currentOrder = evLookupEta.cpOrders[matchedKey] ?? 0;
                                                        const totalCps = evLookupEta.totalCheckpoints || 1;

                                                        // Find next checkpoint by order
                                                        let bestNextKey = '';
                                                        let bestNextOrder = Infinity;
                                                        for (const [k, ord] of Object.entries(evLookupEta.cpOrders)) {
                                                            if (ord > currentOrder && ord < bestNextOrder) {
                                                                bestNextOrder = ord;
                                                                bestNextKey = k;
                                                            }
                                                        }
                                                        let nextCpDist = 0;
                                                        if (bestNextKey) {
                                                            nextCpName = bestNextKey.toUpperCase();
                                                            nextCpDist = evLookupEta.checkpoints[bestNextKey] ?? 0;
                                                        } else {
                                                            nextCpName = 'FINISH';
                                                            nextCpDist = evLookupEta.totalDistance || 0;
                                                        }

                                                        // Parse elapsed time from all possible fields
                                                        let elapsedMs = runner.gunTime || runner.elapsedTime || runner.netTime || runner.gunTimeMs || runner.totalGunTime || runner.netTimeMs || runner.totalNetTime || 0;
                                                        // Fallback: parse gunTimeStr like "01:32:17" → ms
                                                        if (!elapsedMs && runner.gunTimeStr) {
                                                            const parts = runner.gunTimeStr.split(':').map(Number);
                                                            if (parts.length === 3) elapsedMs = (parts[0] * 3600 + parts[1] * 60 + parts[2]) * 1000;
                                                            else if (parts.length === 2) elapsedMs = (parts[0] * 60 + parts[1]) * 1000;
                                                        }
                                                        const scanDate = runner.scanTime ? new Date(runner.scanTime) : null;

                                                        // Strategy 1: Distance-based ETA (when checkpoint km data exists)
                                                        if (currentCpDist > 0 && elapsedMs > 0 && nextCpDist > currentCpDist) {
                                                            const elapsedMin = elapsedMs / 60000;
                                                            const paceMinPerKm = elapsedMin / currentCpDist;
                                                            const remainingKm = nextCpDist - currentCpDist;
                                                            const rawEtaMs = paceMinPerKm * remainingKm * 60000;
                                                            const adjustedEtaMs = rawEtaMs * 1.10;

                                                            if (scanDate && !isNaN(scanDate.getTime())) {
                                                                const arrivalTime = scanDate.getTime() + adjustedEtaMs;
                                                                const remainMs = arrivalTime - currentTime.getTime();
                                                                if (remainMs > 0) {
                                                                    etaRemainingSec = Math.floor(remainMs / 1000);
                                                                } else {
                                                                    etaRemainingSec = 0;
                                                                    isPastDue = true;
                                                                }
                                                            } else {
                                                                etaRemainingSec = Math.round(rawEtaMs * 1.10 / 1000);
                                                            }
                                                        }
                                                        // Strategy 2: Order-based fallback (when no km data)
                                                        else if (elapsedMs > 0 && currentOrder > 0) {
                                                            const orderSteps = (bestNextKey ? bestNextOrder : totalCps + 1) - currentOrder;
                                                            const timePerOrder = elapsedMs / currentOrder;
                                                            const rawEtaMs = timePerOrder * orderSteps;
                                                            const adjustedEtaMs = rawEtaMs * 1.10;

                                                            if (scanDate && !isNaN(scanDate.getTime())) {
                                                                const arrivalTime = scanDate.getTime() + adjustedEtaMs;
                                                                const remainMs = arrivalTime - currentTime.getTime();
                                                                if (remainMs > 0) {
                                                                    etaRemainingSec = Math.floor(remainMs / 1000);
                                                                } else {
                                                                    etaRemainingSec = 0;
                                                                    isPastDue = true;
                                                                }
                                                            } else {
                                                                etaRemainingSec = Math.round(adjustedEtaMs / 1000);
                                                            }
                                                        }
                                                    } else if (!runner.latestCheckpoint || runner.latestCheckpoint.toLowerCase() === 'start') {
                                                        let firstCpKey = '';
                                                        let firstOrder = Infinity;
                                                        for (const [k, ord] of Object.entries(evLookupEta.cpOrders)) {
                                                            if (ord > 1 && ord < firstOrder) { firstOrder = ord; firstCpKey = k; }
                                                        }
                                                        if (firstCpKey) nextCpName = firstCpKey.toUpperCase();
                                                    }
                                                }

                                                // Format remaining time as mm:ss or h:mm:ss
                                                let etaDisplay = '';
                                                if (etaRemainingSec > 0) {
                                                    const hrs = Math.floor(etaRemainingSec / 3600);
                                                    const mins = Math.floor((etaRemainingSec % 3600) / 60);
                                                    const secs = etaRemainingSec % 60;
                                                    etaDisplay = hrs > 0
                                                        ? `${hrs}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`
                                                        : `${mins}:${String(secs).padStart(2, '0')}`;
                                                } else if (isPastDue) {
                                                    etaDisplay = language === 'th' ? 'ใกล้ถึงแล้ว!' : 'arriving!';
                                                }

                                                return (
                                                    <td key={key} className="px-1 py-1.5 text-center">
                                                        {nextCpName ? (
                                                            <div>
                                                                <div className="text-[10px] font-bold text-blue-500">
                                                                    → {nextCpName}
                                                                </div>
                                                                {etaDisplay ? (
                                                                    <div className={`mt-px font-bold ${isPastDue ? 'text-[9px] text-orange-500' : 'text-[11px] font-mono'}`}
                                                                        style={{ color: isPastDue ? undefined : themeStyles.text }}>
                                                                        {isPastDue ? etaDisplay : `≈${etaDisplay}`}
                                                                    </div>
                                                                ) : runner.latestCheckpoint ? (
                                                                    <div className="mt-px text-[8px]" style={{ color: themeStyles.textSecondary }}>...</div>
                                                                ) : null}
                                                            </div>
                                                        ) : (
                                                            <span className="text-[10px]" style={{ color: themeStyles.textSecondary }}>-</span>
                                                        )}
                                                    </td>
                                                );
                                            }
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

                                    const isDangerStatus = runner.status === 'dnf' || runner.status === 'dns' || runner.status === 'not_started';
                                    const rowBorderColor = isDangerStatus ? '#dc2626' : 'transparent';
                                    const rowBg = isDangerStatus ? (isDark ? 'rgba(254,226,226,0.12)' : '#fee2e2') : undefined;

                                    return (
                                        <tr
                                            key={runner._id}
                                            className={`runner-row${isDangerStatus ? ' runner-row-danger' : ''}`}
                                            onClick={() => handleViewRunner(runner)}
                                            style={{ cursor: 'pointer', transition: 'all 0.15s', borderBottom: `1px solid ${themeStyles.border}`, borderLeft: `4px solid ${rowBorderColor}`, background: rowBg }}
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
                    Results
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
                        {isRaceFinished ? 'Auto-refresh 15s' : 'Auto-refresh 10s'}
                    </span>
                    <span style={{ fontSize: 10, fontFamily: 'monospace', color: themeStyles.textSecondary }}>
                        {currentTime.toLocaleTimeString(language === 'th' ? 'th-TH' : 'en-US')}
                    </span>
                </div>
            </footer>

            {/* Runner detail now navigated to /runner/[id] page */}

            {/* ===== ADMIN STATUS EDIT MODAL ===== */}
            {editingRunner && (
                <div
                    onClick={() => setEditingRunner(null)}
                    style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                >
                    <div
                        onClick={e => e.stopPropagation()}
                        style={{ background: isDark ? '#1e293b' : '#fff', borderRadius: 12, padding: 24, width: 520, maxWidth: '95vw', maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 20px 60px rgba(0,0,0,0.3)' }}
                    >
                        <div style={{ marginBottom: 16 }}>
                            <h3 style={{ margin: '0 0 8px', fontSize: 14, fontWeight: 700, color: themeStyles.textSecondary, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                {language === 'th' ? 'แก้ไขข้อมูล Runner' : 'Edit Runner'}
                            </h3>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                <span style={{
                                    display: 'inline-flex', alignItems: 'center', gap: 4,
                                    padding: '4px 12px', borderRadius: 6,
                                    background: '#2563eb', color: '#fff',
                                    fontSize: 13, fontWeight: 800, fontFamily: 'monospace', letterSpacing: '0.05em',
                                    flexShrink: 0,
                                }}>
                                    BIB {editingRunner.bib}
                                </span>
                                <span style={{ fontSize: 16, fontWeight: 700, color: themeStyles.text, lineHeight: 1.3 }}>
                                    {editingRunner.firstName} {editingRunner.lastName}
                                </span>
                            </div>
                        </div>

                        <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: themeStyles.textSecondary, marginBottom: 4, textTransform: 'uppercase' }}>
                            {language === 'th' ? 'สถานะ' : 'Status'}
                        </label>
                        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 14 }}>
                            {[
                                { value: 'not_started', label: 'Not Started', color: '#94a3b8' },
                                { value: 'in_progress', label: 'Racing', color: '#f97316' },
                                { value: 'finished', label: 'Finish', color: '#22c55e' },
                                { value: 'dnf', label: 'DNF', color: '#dc2626' },
                                { value: 'dns', label: 'DNS', color: '#dc2626' },
                                { value: 'dq', label: 'DQ', color: '#7c2d12' },
                            ].map(opt => (
                                <button
                                    key={opt.value}
                                    onClick={() => setEditStatus(opt.value)}
                                    style={{
                                        padding: '6px 14px', borderRadius: 6, fontSize: 12, fontWeight: 700, cursor: 'pointer',
                                        border: editStatus === opt.value ? `2px solid ${opt.color}` : '2px solid transparent',
                                        background: editStatus === opt.value ? opt.color : (isDark ? '#334155' : '#f1f5f9'),
                                        color: editStatus === opt.value ? '#fff' : themeStyles.text,
                                        transition: 'all 0.15s',
                                    }}
                                >
                                    {opt.label}
                                </button>
                            ))}
                        </div>

                        <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: themeStyles.textSecondary, marginBottom: 4, textTransform: 'uppercase' }}>
                            {language === 'th' ? 'จุด Checkpoint' : 'Checkpoint'}
                        </label>
                        <input
                            value={editCheckpoint}
                            onChange={e => setEditCheckpoint(e.target.value)}
                            placeholder={language === 'th' ? 'เช่น CP3, FINISH' : 'e.g. CP3, FINISH'}
                            style={{ width: '100%', padding: '8px 12px', borderRadius: 6, border: `1px solid ${themeStyles.border}`, background: isDark ? '#0f172a' : '#fff', color: themeStyles.text, fontSize: 13, marginBottom: 14, boxSizing: 'border-box' }}
                        />

                        <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: themeStyles.textSecondary, marginBottom: 4, textTransform: 'uppercase' }}>
                            {language === 'th' ? 'หมายเหตุ' : 'Note'}
                        </label>
                        <input
                            value={editNote}
                            onChange={e => setEditNote(e.target.value)}
                            placeholder={language === 'th' ? 'เช่น ขาเจ็บ, หลงทาง' : 'e.g. injury, lost route'}
                            style={{ width: '100%', padding: '8px 12px', borderRadius: 6, border: `1px solid ${themeStyles.border}`, background: isDark ? '#0f172a' : '#fff', color: themeStyles.text, fontSize: 13, marginBottom: 14, boxSizing: 'border-box' }}
                        />

                        {/* ===== CHECKPOINT TIMING SECTION ===== */}
                        <div style={{ borderTop: `1px solid ${themeStyles.border}`, paddingTop: 14, marginBottom: 14 }}>
                            <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: themeStyles.textSecondary, marginBottom: 8, textTransform: 'uppercase' }}>
                                {language === 'th' ? 'เวลาเข้าจุด Checkpoint' : 'Checkpoint Times'}
                            </label>
                            {editTimingLoading ? (
                                <div style={{ textAlign: 'center', padding: 16, color: themeStyles.textSecondary, fontSize: 12 }}>
                                    {language === 'th' ? 'กำลังโหลด...' : 'Loading...'}
                                </div>
                            ) : editCheckpoints.length === 0 ? (
                                <div style={{ textAlign: 'center', padding: 12, color: themeStyles.textSecondary, fontSize: 12, background: isDark ? '#0f172a' : '#f9fafb', borderRadius: 6 }}>
                                    {language === 'th' ? 'ไม่พบข้อมูล Checkpoint' : 'No checkpoints found'}
                                </div>
                            ) : (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                                    {editCheckpoints.map((cp, i) => {
                                        const matchedRecord = editTimingRecords.find(r =>
                                            r.checkpoint.toUpperCase() === cp.name.toUpperCase()
                                        );
                                        // Get display value: from pending changes or existing record
                                        const isoValue = editTimingChanges[cp.name] !== undefined
                                            ? editTimingChanges[cp.name]
                                            : (matchedRecord?.scanTime ? (() => {
                                                const d = new Date(matchedRecord.scanTime);
                                                if (isNaN(d.getTime())) return '';
                                                const pad2 = (n: number) => String(n).padStart(2, '0');
                                                return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}T${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
                                            })() : '');
                                        // Format for display as DD/MM/YYYY HH:MM
                                        let displayTime = '';
                                        if (isoValue) {
                                            const m = isoValue.match(/(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/);
                                            if (m) displayTime = `${m[3]}/${m[2]}/${m[1]} ${m[4]}:${m[5]}`;
                                        }
                                        const cpColor = cp.type === 'start' ? '#3b82f6' : cp.type === 'finish' ? '#22c55e' : '#8b5cf6';
                                        const hasChanged = editTimingChanges[cp.name] !== undefined;
                                        return (
                                            <div key={cp.name + i} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                                <span style={{
                                                    display: 'inline-block', padding: '2px 8px', borderRadius: 4,
                                                    fontSize: 10, fontWeight: 700, color: '#fff', background: cpColor,
                                                    minWidth: 60, textAlign: 'center', whiteSpace: 'nowrap',
                                                }}>
                                                    {cp.name}
                                                </span>
                                                <button
                                                    onClick={() => setCpTimingPickerOpen(cp.name)}
                                                    style={{
                                                        flex: 1, padding: '6px 10px', borderRadius: 6,
                                                        border: `1px solid ${hasChanged ? '#8b5cf6' : themeStyles.border}`,
                                                        background: isDark ? '#0f172a' : '#fff',
                                                        color: displayTime ? themeStyles.text : themeStyles.textSecondary,
                                                        fontSize: 12, fontFamily: 'monospace', cursor: 'pointer',
                                                        textAlign: 'left', boxSizing: 'border-box',
                                                        transition: 'all 0.15s',
                                                    }}
                                                >
                                                    {displayTime || (language === 'th' ? 'กดเพื่อตั้งเวลา' : 'Click to set time')}
                                                </button>
                                            </div>
                                        );
                                    })}
                                    {/* Save checkpoint times button */}
                                    {Object.keys(editTimingChanges).length > 0 && (
                                        <button
                                            onClick={async () => {
                                                setEditTimingSaveMsg(null);
                                                let savedCount = 0;
                                                for (const [cpName, isoVal] of Object.entries(editTimingChanges)) {
                                                    if (!isoVal.trim()) continue;
                                                    // Convert ISO to full ISO date string
                                                    const isoDate = new Date(isoVal).toISOString();
                                                    const matchedRecord = editTimingRecords.find(r =>
                                                        r.checkpoint.toUpperCase() === cpName.toUpperCase()
                                                    );
                                                    try {
                                                        if (matchedRecord?._id) {
                                                            await fetch(`/api/timing/${matchedRecord._id}`, {
                                                                method: 'PUT',
                                                                headers: { 'Content-Type': 'application/json' },
                                                                body: JSON.stringify({ scanTime: isoDate }),
                                                            });
                                                            savedCount++;
                                                        } else if (editingRunner?.eventId) {
                                                            await fetch('/api/timing/scan', {
                                                                method: 'POST',
                                                                headers: { 'Content-Type': 'application/json' },
                                                                body: JSON.stringify({
                                                                    eventId: editingRunner.eventId,
                                                                    bib: editingRunner.bib,
                                                                    checkpoint: cpName,
                                                                    scanTime: isoDate,
                                                                    note: 'Admin manual entry',
                                                                }),
                                                            });
                                                            savedCount++;
                                                        }
                                                    } catch { /* ignore individual save errors */ }
                                                }
                                                setEditTimingChanges({});
                                                setEditTimingSaveMsg(
                                                    language === 'th'
                                                        ? `บันทึกเวลา ${savedCount} จุด เรียบร้อย`
                                                        : `Saved ${savedCount} checkpoint time(s)`
                                                );
                                                // Re-fetch timing records
                                                if (editingRunner?.eventId) {
                                                    try {
                                                        const trRes = await fetch(`/api/timing/runner/${editingRunner.eventId}/${editingRunner._id}`, { cache: 'no-store' });
                                                        if (trRes.ok) {
                                                            const trData = await trRes.json();
                                                            const records = (Array.isArray(trData) ? trData : trData?.data || []).map((r: any) => ({
                                                                _id: r._id,
                                                                checkpoint: r.checkpoint || '',
                                                                scanTime: r.scanTime || '',
                                                                order: r.order,
                                                            }));
                                                            setEditTimingRecords(records);
                                                        }
                                                    } catch { /* ignore */ }
                                                }
                                                setTimeout(() => setEditTimingSaveMsg(null), 3000);
                                            }}
                                            style={{
                                                padding: '6px 16px', borderRadius: 6, border: 'none',
                                                background: '#8b5cf6', color: '#fff', fontSize: 12,
                                                fontWeight: 700, cursor: 'pointer', alignSelf: 'flex-end',
                                                marginTop: 4,
                                            }}
                                        >
                                            {language === 'th' ? 'บันทึกเวลา Checkpoint' : 'Save Checkpoint Times'}
                                        </button>
                                    )}
                                    {editTimingSaveMsg && (
                                        <span style={{ fontSize: 11, fontWeight: 600, color: '#22c55e', alignSelf: 'flex-end' }}>
                                            ✓ {editTimingSaveMsg}
                                        </span>
                                    )}
                                </div>
                            )}
                        </div>

                        {editSaveError && (
                            <div style={{ marginBottom: 12, borderRadius: 8, border: '1px solid #fecaca', background: '#fef2f2', padding: '10px 12px', fontSize: 12, fontWeight: 600, color: '#b91c1c' }}>
                                {editSaveError}
                            </div>
                        )}

                        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                            <button
                                onClick={() => setEditingRunner(null)}
                                style={{ padding: '8px 20px', borderRadius: 6, border: `1px solid ${themeStyles.border}`, background: 'transparent', color: themeStyles.text, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}
                            >
                                {language === 'th' ? 'ยกเลิก' : 'Cancel'}
                            </button>
                            <button
                                onClick={handleStatusUpdate}
                                disabled={editSaving}
                                style={{ padding: '8px 24px', borderRadius: 6, border: 'none', background: '#2563eb', color: '#fff', fontSize: 13, fontWeight: 700, cursor: editSaving ? 'not-allowed' : 'pointer', opacity: editSaving ? 0.6 : 1 }}
                            >
                                {editSaving ? '...' : (language === 'th' ? 'บันทึก' : 'Save')}
                            </button>
                        </div>
                    </div>
                </div>
            )}
            {/* ===== CHECKPOINT TIMING DATE/TIME PICKER POPUP ===== */}
            {cpTimingPickerOpen && (() => {
                // Find the ISO value for the checkpoint being edited
                const cpName = cpTimingPickerOpen;
                const matchedRecord = editTimingRecords.find(r =>
                    r.checkpoint.toUpperCase() === cpName.toUpperCase()
                );
                const currentIso = editTimingChanges[cpName] !== undefined
                    ? editTimingChanges[cpName]
                    : (matchedRecord?.scanTime ? (() => {
                        const d = new Date(matchedRecord.scanTime);
                        if (isNaN(d.getTime())) return '';
                        const pad2 = (n: number) => String(n).padStart(2, '0');
                        return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}T${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
                    })() : '');
                return (
                    <CutoffDateTimePicker
                        value={currentIso}
                        onChange={(isoValue) => {
                            if (isoValue) {
                                setEditTimingChanges(prev => ({ ...prev, [cpName]: isoValue }));
                            } else {
                                // Clear was pressed
                                setEditTimingChanges(prev => {
                                    const next = { ...prev };
                                    delete next[cpName];
                                    return next;
                                });
                            }
                        }}
                        onClose={() => setCpTimingPickerOpen(null)}
                    />
                );
            })()}
        </div>
    );
}
