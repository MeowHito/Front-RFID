'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { useLanguage } from '@/lib/language-context';
import { useTheme } from '@/lib/theme-context';
import { useAuth } from '@/lib/auth-context';
import { authHeaders } from '@/lib/authHeaders';
import CutoffDateTimePicker from '@/components/CutoffDateTimePicker';
import { getFollowedRunnersForEvent, isRunnerFollowed, loadFollowedRunners, subscribeFollowedRunners, type FollowedRunner } from '@/lib/followed-runners';
import { computeAwardsForCategory, type AwardResult } from '@/lib/awards';
import { isNationalitySplitCategory } from '@/lib/nationality';
import { type AgeGroupBucket, buildCanonicalAgeGroups, canonicalizeAgeGroup, normalizeAgeGroupLabel } from '@/lib/age-groups';
import RankingMenuDropdown from '@/components/RankingMenuDropdown';
import type { RankingMenuVisibility } from '@/lib/rankingMenu';

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
    // Award config (shared with /admin/age-group-ranking + winner pages)
    overallDisplayCount?: number;
    ageGroupDisplayCount?: number;
    bestOfDisplayCount?: number;
    excludeOverallFromAgeGroup?: number;
    excludeOverallThaiFromAgeGroup?: number;
    excludeOverallForeignFromAgeGroup?: number;
    excludeAgeGroupTop?: number;
    separateOverallNationalityCategories?: string[];
    rankingMenuVisibility?: RankingMenuVisibility[];
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
    totalGunTimeMs?: number;
    totalNetTimeMs?: number;
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
    eventId: string;
    scanTime: string;
    splitTime?: number;
    elapsedTime?: number;
    distanceFromStart?: number;
    netTime?: number;
    // ... (rest of the properties remain the same)
}

interface CheckpointMapping {
    _id: string;
    eventId: string;
    orderNum?: number;
    distanceFromStart?: number;
    checkpointId?: {
        _id?: string;
        name?: string;
        type?: string;
        kmCumulative?: number;
    } | string;
}

// Resolved checkpoint distance info per event
interface CheckpointDistanceLookup {
    [eventId: string]: {
        checkpoints: Record<string, number>;
        cpOrders: Record<string, number>;
        totalDistance: number;
        totalCheckpoints: number;
    };
}

type RunnerFilterGender = 'ALL' | 'FOLLOWED' | 'M' | 'F';

function normalizeComparableText(value?: string | null): string {
    return String(value || '').trim().toLowerCase().replace(/[^a-z0-9ก-๙]+/g, '');
}

function parseDistanceValue(value: unknown): number | null {
    const raw = String(value || '').replace(/,/g, '');
    const match = raw.match(/-?\d+(?:\.\d+)?/);
    if (!match) return null;
    const parsed = Number(match[0]);
    return Number.isFinite(parsed) ? parsed : null;
}

function parseElapsedTimeToMs(value?: string | null): number {
    const trimmed = String(value || '').trim();
    if (!trimmed) return 0;
    const parts = trimmed.split(':').map(Number);
    if (parts.some((part) => Number.isNaN(part))) return 0;
    if (parts.length === 3) return (parts[0] * 3600 + parts[1] * 60 + parts[2]) * 1000;
    if (parts.length === 2) return (parts[0] * 60 + parts[1]) * 1000;
    return 0;
}

type ColDef = { key: string; label: string; w: string; mw: string; align: 'left' | 'center' | 'right'; fixed?: boolean; desktopOnly?: boolean };

// Marathon column definitions
const COL_DEFS: ColDef[] = [
    { key: 'rank', label: 'Rank', w: '3%', mw: '4%', align: 'center', fixed: true },
    { key: 'genRank', label: 'Gen', w: '3%', mw: '4%', align: 'center' },
    { key: 'catRank', label: 'Age', w: '6%', mw: '9%', align: 'center' },
    { key: 'award', label: 'Award', w: '7%', mw: '12%', align: 'center' },
    { key: 'runner', label: 'Runner', w: '15%', mw: '22%', align: 'left', fixed: true },
    { key: 'sex', label: 'Sex', w: '3%', mw: '5%', align: 'center' },
    { key: 'status', label: 'Status', w: '8%', mw: '10%', align: 'left', fixed: true },
    { key: 'gunTime', label: 'Gun Time', w: '6%', mw: '6%', align: 'left' },
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
const MARATHON_PUBLIC_DEFAULT_KEYS = ['genRank', 'catRank', 'award', 'sex', 'gunTime', 'netTime', 'distFromStart', 'nextStation'];
// Default visible toggleable columns (only columns that typically have data from RaceTiger)
const DEFAULT_VISIBLE_KEYS = MARATHON_PUBLIC_DEFAULT_KEYS;

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

function formatTime(ms: number | undefined | null): string {
    if (ms === undefined || ms === null || ms < 0) return '-';
    if (ms === 0) return '0:00:00';
    const hours = Math.floor(ms / 3600000);
    const minutes = Math.floor((ms % 3600000) / 60000);
    const seconds = Math.floor((ms % 60000) / 1000);
    return `${hours}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
}

// Parse "HH:MM:SS" or "MM:SS" into milliseconds. Returns null on bad input.
function parseTimeStrToMs(str: string): number | null {
    if (!str || !str.trim()) return null;
    const parts = str.trim().split(':');
    if (parts.length === 3) {
        const h = parseInt(parts[0], 10);
        const m = parseInt(parts[1], 10);
        const s = parseInt(parts[2], 10);
        if (!isNaN(h) && !isNaN(m) && !isNaN(s)) return (h * 3600 + m * 60 + s) * 1000;
    }
    if (parts.length === 2) {
        const m = parseInt(parts[0], 10);
        const s = parseInt(parts[1], 10);
        if (!isNaN(m) && !isNaN(s)) return (m * 60 + s) * 1000;
    }
    return null;
}

function msToHHMMSS(ms?: number): string {
    if (!ms || ms <= 0) return '';
    const totalSec = Math.floor(ms / 1000);
    const h = Math.floor(totalSec / 3600);
    const m = Math.floor((totalSec % 3600) / 60);
    const s = totalSec % 60;
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

function formatDisplayTimeString(value?: string | null, showMilliseconds = false): string {
    const trimmed = String(value || '').trim();
    if (!trimmed) return '';
    return showMilliseconds ? trimmed : trimmed.replace(/(\.\d{1,3})$/, '');
}

function formatStatusScanTime(dateString: string | undefined, showMilliseconds = false): string {
    if (!dateString) return '';
    const d = new Date(dateString);
    if (Number.isNaN(d.getTime())) return '';
    const baseTime = `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}:${d.getSeconds().toString().padStart(2, '0')}`;
    return formatDisplayTimeString(`${baseTime}.${d.getMilliseconds().toString().padStart(3, '0')}`, showMilliseconds);
}

function formatDate(dateString: string, locale: string = 'en-US'): string {
    const date = new Date(dateString);
    return date.toLocaleDateString(locale, { day: '2-digit', month: 'short', year: 'numeric' });
}

function getStatusLabel(status: string): string {
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

function FollowHeartIcon({ filled, size = 14, color }: { filled: boolean; size?: number; color: string }) {
    return (
        <svg viewBox="0 0 24 24" aria-hidden="true" className="block" style={{ width: size, height: size }}>
            <path d="M12 21.35 10.55 20.03C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35Z" fill={filled ? color : 'none'} stroke={color} strokeWidth="2" strokeLinejoin="round" />
        </svg>
    );
}

export default function EventLivePage() {
    const { language } = useLanguage();
    const { theme } = useTheme();
    const { isAdmin, isAuthenticated } = useAuth();
    const params = useParams();
    const router = useRouter();
    const searchParams = useSearchParams();
    const eventKey = params.id as string;

    const catFromUrl = searchParams.get('cat') || '';

    const [campaign, setCampaign] = useState<Campaign | null>(null);
    // ... (rest of the code remains the same)
    const [runners, setRunners] = useState<Runner[]>([]);
    // How many people have saved/downloaded their e-slip (aggregated across all distances)
    const [eslipStats, setEslipStats] = useState<{ totalDownloads: number; uniqueRunners: number } | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const [searchQuery, setSearchQuery] = useState('');
    const [filterGender, setFilterGender] = useState<RunnerFilterGender>('ALL');
    const [filterCategory, setFilterCategory] = useState(catFromUrl);
    const [filterStatus, setFilterStatus] = useState('ALL');
    const [filterAgeGroup, setFilterAgeGroup] = useState('');
    // Admin-only: when on, runners with an incomplete-checkpoint alert (⚠) are pulled to the top
    const [sortAlertsFirst, setSortAlertsFirst] = useState(false);
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
    const [followedRunners, setFollowedRunners] = useState<FollowedRunner[]>([]);

    // Admin status edit modal
    const [editingRunner, setEditingRunner] = useState<Runner | null>(null);
    const [editStatus, setEditStatus] = useState('');
    const [editCheckpoint, setEditCheckpoint] = useState('');
    const [editNote, setEditNote] = useState('');
    const [editGunTime, setEditGunTime] = useState('');
    const [editChipTime, setEditChipTime] = useState('');
    const [editSaving, setEditSaving] = useState(false);
    const [editSaveError, setEditSaveError] = useState<string | null>(null);

    // Checkpoint timing data for edit modal
    const [editCheckpoints, setEditCheckpoints] = useState<{name: string; orderNum: number; type: string}[]>([]);
    const [editTimingRecords, setEditTimingRecords] = useState<{_id?: string; checkpoint: string; scanTime: string; order?: number}[]>([]);
    const [editTimingChanges, setEditTimingChanges] = useState<Record<string, string>>({});
    const [editTimingLoading, setEditTimingLoading] = useState(false);
    const [editTimingSaveMsg, setEditTimingSaveMsg] = useState<string | null>(null);
    const [cpTimingPickerOpen, setCpTimingPickerOpen] = useState<string | null>(null);
    const [clearingCheckpoint, setClearingCheckpoint] = useState<string | null>(null);

    // Manual Status bulk modal
    const [showManualStatusModal, setShowManualStatusModal] = useState(false);
    const [manualSelectedIds, setManualSelectedIds] = useState<Set<string>>(new Set());
    const [manualStatus, setManualStatus] = useState('dnf');
    const [manualCheckpoint, setManualCheckpoint] = useState('');
    const [manualNote, setManualNote] = useState('');
    const [manualSearch, setManualSearch] = useState('');
    const [manualSaving, setManualSaving] = useState(false);
    const [manualSaveError, setManualSaveError] = useState<string | null>(null);
    const [manualSaveSuccess, setManualSaveSuccess] = useState<string | null>(null);
    const [manualCheckpoints, setManualCheckpoints] = useState<{name: string; orderNum: number; type: string}[]>([]);
    const [manualCheckpointsLoading, setManualCheckpointsLoading] = useState(false);
    const [manualSort, setManualSort] = useState<'rank' | 'name' | 'bib'>('rank');
    // Per-runner gun/net time edits inside the bulk Manual Status modal.
    const [manualTimeEdits, setManualTimeEdits] = useState<Record<string, { gun?: string; net?: string }>>({});

    const toApiData = (payload: any) => payload?.data ?? payload;

    function compareStableBibOrder(a: Runner, b: Runner) {
        const bibCompare = (a.bib || '').localeCompare(b.bib || '', undefined, { numeric: true });
        if (bibCompare !== 0) return bibCompare;
        return (a._id || '').localeCompare(b._id || '');
    }

    // Overall placing is decided by GUN time — prefer gun fields, fall back to net
    // (locally-timed events store only net time).
    function getRunnerPrimaryTimeMs(runner: Runner) {
        const candidates = [
            runner.gunTimeMs,
            runner.totalGunTimeMs,
            runner.totalGunTime,
            runner.gunTime,
            runner.netTimeMs,
            runner.totalNetTimeMs,
            runner.totalNetTime,
            runner.netTime,
            runner.elapsedTime,
        ];
        for (const value of candidates) {
            const num = Number(value || 0);
            if (Number.isFinite(num) && num > 0) return num;
        }
        return 0;
    }

    // Gender + age-group placings are decided by NET (chip) time — prefer net fields,
    // fall back to gun.
    function getRunnerNetTimeMs(runner: Runner) {
        const candidates = [
            runner.netTimeMs,
            runner.totalNetTimeMs,
            runner.totalNetTime,
            runner.netTime,
            runner.gunTimeMs,
            runner.totalGunTimeMs,
            runner.totalGunTime,
            runner.gunTime,
            runner.elapsedTime,
        ];
        for (const value of candidates) {
            const num = Number(value || 0);
            if (Number.isFinite(num) && num > 0) return num;
        }
        return 0;
    }

    function getRunnerScanTimeMs(runner: Runner) {
        const time = runner.scanTime ? new Date(runner.scanTime).getTime() : 0;
        return Number.isFinite(time) && time > 0 ? time : 0;
    }

    function compareRunnerRankOrder(a: Runner, b: Runner) {
        // When any category splits Overall by nationality, stored overallRank may be
        // per-nationality and is no longer a valid global sort key — keep the combined
        // table ordered by time and let the rank number come from liveRanks.
        const useStoredRank = !(campaign?.separateOverallNationalityCategories?.length);
        const statusOrder: Record<string, number> = { 'finished': 0, 'in_progress': 1, 'dnf': 2, 'dns': 3, 'dq': 4, 'not_started': 5 };
        const statusDiff = (statusOrder[a.status] ?? 6) - (statusOrder[b.status] ?? 6);
        if (statusDiff !== 0) return statusDiff;

        if (a.status === 'finished' && b.status === 'finished') {
            // Rank all finished runners by overallRank → time → scan time.
            // CP-completeness no longer affects ordering: if a reader missed a scan,
            // an admin edit will recompute the rank back to its rightful position.
            const aRank = a.overallRank ?? 0;
            const bRank = b.overallRank ?? 0;
            if (useStoredRank && aRank > 0 && bRank > 0 && aRank !== bRank) return aRank - bRank;
            const aTime = getRunnerPrimaryTimeMs(a);
            const bTime = getRunnerPrimaryTimeMs(b);
            if (aTime > 0 && bTime > 0 && aTime !== bTime) return aTime - bTime;
            if (aTime > 0 && bTime <= 0) return -1;
            if (aTime <= 0 && bTime > 0) return 1;
            const aScan = getRunnerScanTimeMs(a);
            const bScan = getRunnerScanTimeMs(b);
            if (aScan > 0 && bScan > 0 && aScan !== bScan) return aScan - bScan;
            return compareStableBibOrder(a, b);
        }

        const aRank = a.overallRank ?? 0;
        const bRank = b.overallRank ?? 0;
        if (useStoredRank && aRank > 0 && bRank > 0 && aRank !== bRank) return aRank - bRank;

        if (a.status === 'in_progress' && b.status === 'in_progress') {
            const aPassed = a.passedCount ?? 0;
            const bPassed = b.passedCount ?? 0;
            if (aPassed !== bPassed) return bPassed - aPassed;
            const aTime = getRunnerPrimaryTimeMs(a);
            const bTime = getRunnerPrimaryTimeMs(b);
            if (aTime > 0 && bTime > 0 && aTime !== bTime) return aTime - bTime;
            if (aTime > 0 && bTime <= 0) return -1;
            if (aTime <= 0 && bTime > 0) return 1;
            const aScan = getRunnerScanTimeMs(a);
            const bScan = getRunnerScanTimeMs(b);
            if (aScan > 0 && bScan > 0 && aScan !== bScan) return aScan - bScan;
            return compareStableBibOrder(a, b);
        }

        return compareStableBibOrder(a, b);
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

    function isFinishCheckpointName(value?: string | null): boolean {
        const upper = String(value || '').trim().toUpperCase();
        return upper.includes('FINISH') || upper === 'FIN';
    }

    function resolveCheckpointMatch(eventId: string | undefined, checkpointName: string | undefined) {
        const evLookup = eventId ? cpDistanceLookup[eventId] : null;
        if (!evLookup || !checkpointName) return { key: '', order: 0 };
        const rawKey = checkpointName.trim().toLowerCase();
        if (evLookup.checkpoints[rawKey] !== undefined || evLookup.cpOrders[rawKey] !== undefined) {
            return { key: rawKey, order: evLookup.cpOrders[rawKey] ?? 0 };
        }
        const normalized = normalizeComparableText(checkpointName);
        if (!normalized) return { key: '', order: 0 };
        for (const key of Object.keys(evLookup.cpOrders)) {
            if (normalizeComparableText(key) === normalized) {
                return { key, order: evLookup.cpOrders[key] ?? 0 };
            }
        }
        return { key: '', order: 0 };
    }

    function getRunnerCheckpointMeta(runner: Runner) {
        const evLookup = runner.eventId ? cpDistanceLookup[runner.eventId] : null;
        const latestMatch = resolveCheckpointMatch(runner.eventId, runner.latestCheckpoint);
        const splitMatch = resolveCheckpointMatch(runner.eventId, runner.splitDesc);
        const latestOrder = latestMatch.order || 0;
        const splitOrder = Math.max(splitMatch.order || 0, runner.splitNo || 0);
        const useSplitCheckpoint = !!runner.splitDesc && splitOrder >= latestOrder;
        const checkpointName = useSplitCheckpoint
            ? (runner.splitDesc || runner.latestCheckpoint || runner.statusCheckpoint || '')
            : (runner.latestCheckpoint || runner.splitDesc || runner.statusCheckpoint || '');
        const checkpointKey = useSplitCheckpoint ? splitMatch.key : latestMatch.key;
        const checkpointOrder = useSplitCheckpoint ? splitOrder : latestOrder;
        const totalCheckpoints = evLookup?.totalCheckpoints || 0;
        const completedCpCountRaw = (runner.passedCount ?? 0) > 0 ? (runner.passedCount ?? 0) : checkpointOrder;
        const completedCpCount = totalCheckpoints > 0 ? Math.min(completedCpCountRaw, totalCheckpoints) : completedCpCountRaw;
        return {
            evLookup,
            checkpointName,
            checkpointKey,
            checkpointOrder,
            totalCheckpoints,
            completedCpCount,
            useSplitCheckpoint,
            isFinishLike: runner.status === 'finished' || isFinishCheckpointName(checkpointName) || (checkpointKey ? isFinishCheckpointName(checkpointKey) : false),
        };
    }

    // Mirrors the per-row `showProgressAlert` predicate (see the ⚠ marker): a runner
    // shown as finished/finish-like but whose passed-checkpoint count is still incomplete.
    function runnerHasProgressAlert(runner: Runner) {
        const meta = getRunnerCheckpointMeta(runner);
        const isStoppedStatus = ['dns', 'dnf', 'dq', 'not_started'].includes(runner.status);
        const isFinishLike = runner.status === 'finished' || (meta.isFinishLike && !isStoppedStatus);
        return isFinishLike && meta.totalCheckpoints > 0 && meta.completedCpCount > 0 && meta.completedCpCount < meta.totalCheckpoints;
    }

    useEffect(() => {
        const timer = setInterval(() => setCurrentTime(new Date()), 1000);
        return () => clearInterval(timer);
    }, []);

    useEffect(() => {
        setFollowedRunners(loadFollowedRunners());
        return subscribeFollowedRunners(setFollowedRunners);
    }, []);

    // Detect mobile viewport
    useEffect(() => {
        const checkMobile = () => setIsMobile(window.innerWidth < 768);
        checkMobile();
        window.addEventListener('resize', checkMobile);
        return () => window.removeEventListener('resize', checkMobile);
    }, []);

    useEffect(() => { if (eventKey) fetchEventData(); }, [eventKey]);

    // Load e-slip download stats once the campaign id is known (admin-only, refreshed every 60s).
    useEffect(() => {
        if (!isAdmin) { setEslipStats(null); return; }
        const slug = campaign?.slug || campaign?._id;
        if (!slug) return;
        let cancelled = false;
        const load = async () => {
            try {
                const res = await fetch(`/api/eslip-stats/${slug}`, { cache: 'no-store' });
                if (!res.ok) return;
                const json = await res.json().catch(() => ({}));
                const data = json?.data ?? json;
                if (!cancelled && data && typeof data.totalDownloads === 'number') {
                    setEslipStats({ totalDownloads: data.totalDownloads, uniqueRunners: data.uniqueRunners ?? 0 });
                }
            } catch { /* ignore */ }
        };
        load();
        const t = setInterval(load, 60000);
        return () => { cancelled = true; clearInterval(t); };
    }, [isAdmin, campaign?.slug, campaign?._id]);

    // Choose API endpoint based on raceFinished flag
    const isRaceFinished = campaign?.raceFinished ?? false;
    const runnersApiUrl = isRaceFinished
        ? `/api/runners?id=${campaign?._id}`
        : `/api/runners/passtime?id=${campaign?._id}`;

    // Auto-refresh runners every 10s while the race is live.
    // When raceFinished=true, results are frozen — no polling, no rank recompute.
    // Edits made via the admin panel trigger a full fetchEventData() refresh on their own.
    useEffect(() => {
        if (!campaign?._id) return;
        if (isRaceFinished) return;
        const refreshInterval = setInterval(async () => {
            try {
                const url = `/api/runners/passtime?id=${campaign._id}`;
                const runnersRes = await fetch(url, { cache: 'no-store' });
                if (runnersRes.ok) {
                    const runnersData = await runnersRes.json().catch(() => ({}));
                    const list = (runnersData?.data?.data as Runner[]) || (runnersData?.data as Runner[]) || (Array.isArray(runnersData) ? runnersData : []);
                    if (Array.isArray(list) && list.length > 0) {
                        const mapped = list.map(deriveEffectiveStatus);
                        setRunners(mapped);
                        setLastUpdated(new Date());
                    }
                }
            } catch { /* silently retry next interval */ }
        }, 10_000);
        return () => clearInterval(refreshInterval);
    }, [campaign?._id, isRaceFinished]);

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
                        const totalCheckpoints = Object.values(cpOrders).filter((order) => order > 0).length;
                        lookup[evId] = {
                            checkpoints: cpMap,
                            cpOrders,
                            totalDistance: maxDist > 0 ? maxDist : catDist,
                            totalCheckpoints,
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

    function formatStatusScanTime(dateString: string | undefined, showMilliseconds = isAdmin): string {
        if (!dateString) return '';
        const d = new Date(dateString);
        if (Number.isNaN(d.getTime())) return '';
        const baseTime = `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}:${d.getSeconds().toString().padStart(2, '0')}`;
        return showMilliseconds ? `${baseTime}.${d.getMilliseconds().toString().padStart(3, '0')}` : baseTime;
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
            cats = Array.from(runnerCategories).map(v => ({ key: v, label: v, categoryName: v, normalizedName: normalizeComparableText(v), normalizedDistance: normalizeComparableText(v), distanceValue: parseDistanceValue(v) }));
        } else {
            cats = campaignCategories.map((cat, i) => {
                const distance = String(cat?.distance || '').trim();
                const name = String(cat?.name || '').trim();
                const nd = normalizeComparableText(distance);
                const nn = normalizeComparableText(name);
                return { key: `${nd || nn || i + 1}-${i}`, label: distance || name || `Category ${i + 1}`, categoryName: name, normalizedDistance: nd, normalizedName: nn, distanceValue: parseDistanceValue(distance || name) };
            }).filter(c => Boolean(c.label));
        }
        // Sort by distance descending
        return cats.sort((a, b) => (b.distanceValue ?? 0) - (a.distanceValue ?? 0));
    }, [campaign, runners, language]);

    // Raw campaign.categories[].name for the selected distance — the ranking menu
    // dropdown and its winner-board links key off this, not the derived UI `key`.
    const currentCategoryName = useMemo(() => {
        return categories.find(c => c.key === filterCategory)?.categoryName || '';
    }, [categories, filterCategory]);

    // Sync URL → state on back navigation (catFromUrl changes when browser restores URL)
    useEffect(() => {
        if (catFromUrl && catFromUrl !== filterCategory) {
            setFilterCategory(catFromUrl);
        }
    }, [catFromUrl]);

    // Sync state → URL when user switches category
    useEffect(() => {
        if (!filterCategory) return;
        const current = new URLSearchParams(window.location.search);
        if (current.get('cat') !== filterCategory) {
            current.set('cat', filterCategory);
            router.replace(`?${current.toString()}`, { scroll: false });
        }
    }, [filterCategory]);

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

    // The AWARD column splits the Overall label by nationality ("OVERALL THA n" /
    // "OVERALL INT n") when the campaign marks the category — only the label changes;
    // the combined RANK number is untouched. Award pools are keyed by
    // resolveRunnerCategoryKey(), so map each split runner's raw category name
    // (stored on the campaign) onto its resolved pool key.
    const natSplitAwardKeys = useMemo(() => {
        const set = new Set<string>();
        const splitCats = campaign?.separateOverallNationalityCategories;
        if (!splitCats?.length) return set;
        for (const r of runners) {
            if (isNationalitySplitCategory(splitCats, r.category)) {
                set.add(resolveRunnerCategoryKey(r));
            }
        }
        return set;
    }, [runners, campaign?.separateOverallNationalityCategories, resolveRunnerCategoryKey]);

    // Canonical age-group buckets per resolved category. RaceTiger sometimes tags
    // a handful of individual runners with a differently-shaped age-group label
    // than the rest of the field for the same real bracket (e.g. "0-19" for 2
    // runners vs "U 19" for 44 others, or "50-54" for 2 runners vs "50-59" for
    // 68 others) — computed per category so distances with different bucket
    // granularities (e.g. 5-year vs 10-year bands) never get merged together.
    const ageGroupCanonicalByCategory = useMemo(() => {
        const rawByCategory = new Map<string, Array<string | undefined>>();
        for (const r of runners) {
            const key = resolveRunnerCategoryKey(r);
            const list = rawByCategory.get(key) ?? [];
            list.push(r.ageGroup);
            rawByCategory.set(key, list);
        }
        const result = new Map<string, ReturnType<typeof buildCanonicalAgeGroups>>();
        for (const [key, labels] of rawByCategory) {
            result.set(key, buildCanonicalAgeGroups(labels));
        }
        return result;
    }, [runners, resolveRunnerCategoryKey]);

    const canonicalAgeGroupOf = useCallback((r: Runner): string => {
        const canonical = ageGroupCanonicalByCategory.get(resolveRunnerCategoryKey(r));
        return canonical ? canonicalizeAgeGroup(r.ageGroup, canonical.canonicalLabelOf) : normalizeAgeGroupLabel(r.ageGroup);
    }, [ageGroupCanonicalByCategory, resolveRunnerCategoryKey]);

    // Distinct age groups present in the currently-selected distance, sorted by min age.
    const ageGroupOptions = useMemo(() => {
        if (filterCategory) {
            const canonical = ageGroupCanonicalByCategory.get(filterCategory);
            return canonical ? canonical.buckets.map(b => b.label) : [];
        }
        const seen = new Map<string, AgeGroupBucket>();
        for (const canonical of ageGroupCanonicalByCategory.values()) {
            for (const bucket of canonical.buckets) seen.set(bucket.label.toLowerCase(), bucket);
        }
        return Array.from(seen.values()).sort((a, b) => a.min - b.min || a.max - b.max).map(b => b.label);
    }, [ageGroupCanonicalByCategory, filterCategory]);

    // Reset the age-group filter whenever it no longer applies to the selected distance.
    useEffect(() => {
        if (filterAgeGroup && !ageGroupOptions.includes(filterAgeGroup)) {
            setFilterAgeGroup('');
        }
    }, [ageGroupOptions, filterAgeGroup]);

    const getRunnerCategoryStartDate = useCallback((runner: Runner): Date | null => {
        if (!campaign?.eventDate) return null;
        const categoryList = Array.isArray(campaign.categories) ? campaign.categories : [];
        const runnerCategoryText = normalizeComparableText(runner.category);
        const runnerDistance = parseDistanceValue(runner.category);
        const matchedCategory = categoryList.find((cat) => {
            const normalizedName = normalizeComparableText(cat.name);
            const normalizedDistance = normalizeComparableText(cat.distance);
            const categoryDistance = parseDistanceValue(cat.distance || cat.name);
            if (runnerCategoryText && (runnerCategoryText === normalizedName || runnerCategoryText === normalizedDistance)) return true;
            if (runnerDistance !== null && categoryDistance !== null && Math.abs(runnerDistance - categoryDistance) < 0.001) return true;
            return false;
        }) || categoryList[0];
        const startTime = String(matchedCategory?.startTime || '').trim();
        if (!startTime) return null;
        const baseDate = new Date(campaign.eventDate);
        if (Number.isNaN(baseDate.getTime())) return null;
        const [hours = '0', minutes = '0', seconds = '0'] = startTime.split(':');
        const startDate = new Date(baseDate);
        startDate.setHours(Number(hours) || 0, Number(minutes) || 0, Number(seconds) || 0, 0);
        return Number.isNaN(startDate.getTime()) ? null : startDate;
    }, [campaign?.eventDate, campaign?.categories]);

    // Determine active display mode and column set
    const isLabMode = campaign?.displayMode === 'lab';
    const activeColDefs = isLabMode ? LAB_COL_DEFS : COL_DEFS;
    const activeToggleableKeys = isLabMode ? LAB_TOGGLEABLE_KEYS : TOGGLEABLE_KEYS;

    // Whether the currently-selected distance has any age-group data. If not, we hide
    // the CAT column from the table — the rank value is meaningless without age groups.
    const currentCategoryHasAgeGroups = useMemo(() => {
        return runners.some(r =>
            (!filterCategory || resolveRunnerCategoryKey(r) === filterCategory)
            && !!r.ageGroup
        );
    }, [runners, filterCategory, resolveRunnerCategoryKey]);

    // Award assignment per runner — mirrors /admin/age-group-ranking and the public
    // Overall-Winners / Result-Winners boards so the AWARD column matches what is
    // published there. Awards are computed once per distance (resolved category):
    //   • Overall: top `overallDisplayCount` finishers per gender, ranked by time.
    //   • Age group: top `ageGroupDisplayCount` per (gender, age group), after
    //     excluding the top `excludeOverallFromAgeGroup` overall per gender and any
    //     runner whose RaceTiger ageGroupRank <= `excludeAgeGroupTop`.
    // A runner who earns an Overall award never also receives an Age-group award.
    const awardByRunnerId = useMemo(() => {
        // One award pool per distance (resolved category)
        const byCategory = new Map<string, Runner[]>();
        for (const r of runners) {
            const key = resolveRunnerCategoryKey(r);
            if (!byCategory.has(key)) byCategory.set(key, []);
            byCategory.get(key)!.push(r);
        }
        const map = new Map<string, AwardResult>();
        for (const [key, pool] of byCategory) {
            const cfg = {
                overallDisplayCount: campaign?.overallDisplayCount,
                ageGroupDisplayCount: campaign?.ageGroupDisplayCount,
                excludeOverallFromAgeGroup: campaign?.excludeOverallFromAgeGroup,
                excludeOverallThaiFromAgeGroup: campaign?.excludeOverallThaiFromAgeGroup,
                excludeOverallForeignFromAgeGroup: campaign?.excludeOverallForeignFromAgeGroup,
                // Nationality split is decided per race category (AWARD label only)
                separateOverallByNationality: natSplitAwardKeys.has(key),
            };
            for (const [id, award] of computeAwardsForCategory(pool, cfg)) map.set(id, award);
        }
        return map;
    }, [runners, resolveRunnerCategoryKey, campaign?.overallDisplayCount, campaign?.ageGroupDisplayCount, campaign?.excludeOverallFromAgeGroup, campaign?.excludeOverallThaiFromAgeGroup, campaign?.excludeOverallForeignFromAgeGroup, campaign?.excludeAgeGroupTop, natSplitAwardKeys]);

    // Build ordered list of visible columns based on admin displayColumns + mobile
    const visibleColumns = useMemo(() => {
        const adminCols = isLabMode ? campaign?.displayColumnsLab : campaign?.displayColumns;
        const hasSavedAdminCols = Array.isArray(adminCols) && adminCols.length > 0;
        const defaultToggleKeys = isLabMode ? activeToggleableKeys : DEFAULT_VISIBLE_KEYS;
        const configuredToggleKeys = hasSavedAdminCols
            ? adminCols.filter((key: string) => activeToggleableKeys.includes(key))
            : defaultToggleKeys;
        // Public viewers see the intersection of:
        //   1) MARATHON_PUBLIC_DEFAULT_KEYS — the whitelist of columns ever allowed publicly
        //   2) configuredToggleKeys — what the admin currently has enabled
        // So if the admin turns OFF a column in /admin/display, public viewers ALSO stop
        // seeing it (previously the public list was hardcoded and ignored admin toggles —
        // which is why "Distance" kept showing for non-logged-in users even after admin
        // disabled it).
        const publicToggleKeys = isLabMode
            ? configuredToggleKeys
            : MARATHON_PUBLIC_DEFAULT_KEYS.filter(k => configuredToggleKeys.includes(k));
        const allowedToggleKeys = isAuthenticated ? configuredToggleKeys : publicToggleKeys;
        // Rebuild full column order from admin settings
        let fullOrder: string[];
        if (configuredToggleKeys.length > 0) {
            const toggleOrdered = [
                ...configuredToggleKeys,
                ...activeToggleableKeys.filter(k => !configuredToggleKeys.includes(k)),
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
            if (key === 'progress' && !isAdmin) return false;
            if (def.fixed) return true;
            if (!allowedToggleKeys.includes(key)) return false;
            if (!isLabMode) {
                if (key === 'genRank' && !showGenRank) return false;
                if (key === 'catRank' && !showCatRank) return false;
                // Auto-hide CAT column when the selected distance has no age groups.
                if (key === 'catRank' && !currentCategoryHasAgeGroups) return false;
            }
            if (isMobile && !showAllColumns) {
                return isLabMode ? ['laps'].includes(key) : ['gunTime'].includes(key);
            }
            return true;
        });
    }, [isAdmin, isAuthenticated, isMobile, showAllColumns, campaign?.displayColumns, campaign?.displayColumnsLab, campaign?.displayMode, showGenRank, showCatRank, isLabMode, activeColDefs, activeToggleableKeys, currentCategoryHasAgeGroups]);

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

    // Runners shown in Manual Status modal — filtered by current category + modal search
    const manualModalRunners = useMemo(() => {
        let base = runners;
        if (filterCategory) {
            base = base.filter(r => resolveRunnerCategoryKey(r) === filterCategory);
        }
        if (manualSearch.trim()) {
            const q = manualSearch.trim().toLowerCase();
            base = base.filter(r =>
                r.bib.toLowerCase().includes(q) ||
                `${r.firstName} ${r.lastName}`.toLowerCase().includes(q) ||
                `${r.firstNameTh || ''} ${r.lastNameTh || ''}`.toLowerCase().trim().includes(q)
            );
        }
        return [...base].sort((a, b) => {
            if (manualSort === 'rank') {
                const statusPriority: Record<string, number> = { finished: 0, in_progress: 1, dnf: 2, dq: 3, dns: 4, not_started: 5 };
                const aPrio = statusPriority[a.status] ?? 5;
                const bPrio = statusPriority[b.status] ?? 5;
                if (aPrio !== bPrio) return aPrio - bPrio;
                const aR = a.overallRank ?? 99999;
                const bR = b.overallRank ?? 99999;
                return aR !== bR ? aR - bR : (parseInt(a.bib) || 0) - (parseInt(b.bib) || 0);
            }
            if (manualSort === 'name') {
                const aName = `${a.firstName} ${a.lastName}`.toLowerCase();
                const bName = `${b.firstName} ${b.lastName}`.toLowerCase();
                return aName.localeCompare(bName);
            }
            // bib
            const aN = parseInt(a.bib) || 0;
            const bN = parseInt(b.bib) || 0;
            return aN !== bN ? aN - bN : a.bib.localeCompare(b.bib);
        });
    }, [runners, filterCategory, manualSearch, manualSort, resolveRunnerCategoryKey]);

    const followedRunnersForEvent = useMemo(
        () => getFollowedRunnersForEvent(followedRunners, eventKey, campaign?._id),
        [followedRunners, eventKey, campaign?._id]
    );

    const followedRunnerIds = useMemo(
        () => new Set(followedRunnersForEvent.map((item) => item.runnerId)),
        [followedRunnersForEvent]
    );

    const allRankedRunners = useMemo(() => {
        return [...runners].sort(compareRunnerRankOrder);
    }, [runners, campaign?.separateOverallNationalityCategories]); // eslint-disable-line react-hooks/exhaustive-deps

    const filteredRunners = useMemo(() => {
        const filtered = allRankedRunners
            .filter(runner => {
                const matchesSearch = !searchQuery || runner.firstName?.toLowerCase().includes(searchQuery.toLowerCase()) || runner.lastName?.toLowerCase().includes(searchQuery.toLowerCase()) || runner.bib?.includes(searchQuery);
                const matchesGender = filterGender === 'ALL' || filterGender === 'FOLLOWED' || runner.gender === filterGender;
                const matchesFollowed = filterGender !== 'FOLLOWED' || followedRunnerIds.has(runner._id);
                const matchesCategory = !filterCategory || resolveRunnerCategoryKey(runner) === filterCategory;
                const matchesStatus = filterStatus === 'ALL' || runner.status === filterStatus;
                const matchesAgeGroup = !filterAgeGroup || canonicalAgeGroupOf(runner) === filterAgeGroup;
                return matchesSearch && matchesGender && matchesFollowed && matchesCategory && matchesStatus && matchesAgeGroup;
            });
        // On the collapsed mobile view the RANK slot shows the gender / age-group
        // sub-rank when one of those filters is active — order the rows by NET time
        // (the basis for those ranks) so the numbers read 1 → N ascending.
        const subRankOrder = isMobile && !showAllColumns
            && (filterGender === 'M' || filterGender === 'F' || !!filterAgeGroup);
        let ordered = filtered;
        if (subRankOrder) {
            const statusOrder: Record<string, number> = { finished: 0, in_progress: 1, dnf: 2, dns: 3, dq: 4, not_started: 5 };
            ordered = [...filtered].sort((a, b) => {
                const sd = (statusOrder[a.status] ?? 6) - (statusOrder[b.status] ?? 6);
                if (sd !== 0) return sd;
                const at = getRunnerNetTimeMs(a);
                const bt = getRunnerNetTimeMs(b);
                return (at > 0 ? at : Infinity) - (bt > 0 ? bt : Infinity);
            });
        }
        if (!sortAlertsFirst) return ordered;
        // Stable sort: pull alert (incomplete-checkpoint) runners to the top, keep rank order otherwise.
        return ordered
            .map((runner, i) => ({ runner, i, alert: runnerHasProgressAlert(runner) }))
            .sort((a, b) => (a.alert === b.alert ? a.i - b.i : a.alert ? -1 : 1))
            .map(x => x.runner);
    }, [allRankedRunners, searchQuery, filterGender, followedRunnerIds, filterCategory, filterStatus, filterAgeGroup, resolveRunnerCategoryKey, canonicalAgeGroupOf, sortAlertsFirst, cpDistanceLookup, isMobile, showAllColumns]); // eslint-disable-line react-hooks/exhaustive-deps

    // Compute live overall + gender + category ranks.
    // Ranking convention: Overall (RANK) and Gender (GEN) are decided by GUN time, while
    // Age-group (CAT/AGE) is decided by NET (chip) time. Overall is a single combined
    // list — no gender or nationality split. CAT rank is scoped to gender + ageGroup so
    // M40-49 and F40-49 rank separately.
    const liveRanks = useMemo(() => {
        const rankable = (runner: Runner) => {
            // Rank runners who have passed at least one checkpoint (finished, in_progress, or DNF with progress)
            // Skip DNS/DQ/not_started runners with no checkpoint progress
            if (runner.status === 'not_started' || runner.status === 'dns' || runner.status === 'dq') return false;
            if (runner.status === 'dnf' && !((runner.passedCount ?? 0) > 0)) return false;
            return true;
        };
        const eligible = allRankedRunners.filter(rankable);
        const ranks = new Map<string, { overallRank: number; genRank: number; catRank: number }>();
        for (const runner of eligible) {
            ranks.set(runner._id, { overallRank: 0, genRank: 0, catRank: 0 });
        }

        // Overall (combined) + Gender — by GUN time. `eligible` is already gun-ordered
        // via allRankedRunners, so a single pass assigns both.
        const eventCounters: Record<string, number> = {};
        const genderCounters: Record<string, number> = {};
        for (const runner of eligible) {
            const eventKey = runner.eventId || '_';
            const genderKey = `${eventKey}::${runner.gender || '_'}`;
            eventCounters[eventKey] = (eventCounters[eventKey] || 0) + 1;
            genderCounters[genderKey] = (genderCounters[genderKey] || 0) + 1;
            const entry = ranks.get(runner._id)!;
            entry.overallRank = eventCounters[eventKey];
            entry.genRank = genderCounters[genderKey];
        }

        // Age-group (CAT) — by NET time. Stable sort keeps in-progress runners (no net
        // time yet) in their existing relative order.
        const byNet = [...eligible].sort((a, b) => {
            const at = getRunnerNetTimeMs(a);
            const bt = getRunnerNetTimeMs(b);
            return (at > 0 ? at : Infinity) - (bt > 0 ? bt : Infinity);
        });
        const categoryCounters: Record<string, number> = {};
        for (const runner of byNet) {
            const eventKey = runner.eventId || '_';
            const catKey = `${eventKey}::${runner.gender || '_'}::${canonicalAgeGroupOf(runner) || '_'}`;
            categoryCounters[catKey] = (categoryCounters[catKey] || 0) + 1;
            ranks.get(runner._id)!.catRank = categoryCounters[catKey];
        }
        return ranks;
    }, [allRankedRunners, canonicalAgeGroupOf]);



    const handleViewRunner = (runner: Runner) => {
        router.push(`/runner/${runner._id}`);
    };

    const openStatusEdit = async (runner: Runner, e: React.MouseEvent) => {
        e.stopPropagation(); // Don't navigate to runner page
        setEditingRunner(runner);
        setEditStatus(runner.status);
        setEditCheckpoint(runner.statusCheckpoint || runner.latestCheckpoint || '');
        setEditNote(runner.statusNote || '');
        setEditGunTime(msToHHMMSS(runner.gunTime) || runner.gunTimeStr || '');
        setEditChipTime(msToHHMMSS(runner.netTime) || runner.netTimeStr || '');
        setEditSaveError(null);
        setEditTimingChanges({});
        setEditTimingSaveMsg(null);

        // Fetch checkpoints and timing records for this runner
        if (campaign?._id && runner.eventId) {
            setEditTimingLoading(true);
            try {
                const [cpRes, trRes] = await Promise.all([
                    fetch(`/api/checkpoints/mapping/event/${runner.eventId}`, { cache: 'no-store' }),
                    fetch(`/api/timing/runner/${runner.eventId}/${runner._id}`, { cache: 'no-store' }),
                ]);
                if (cpRes.ok) {
                    const cpData = await cpRes.json();
                    const list = Array.isArray(cpData) ? cpData : cpData?.data || [];
                    const cps = list.map((m: any) => {
                        const cp = typeof m.checkpointId === 'object' && m.checkpointId !== null ? m.checkpointId : null;
                        return {
                            name: cp?.name || '',
                            orderNum: m.orderNum ?? cp?.orderNum ?? 0,
                            type: cp?.type || 'checkpoint',
                        };
                    }).filter((cp: { name: string }) => !!cp.name)
                      .sort((a: { orderNum: number }, b: { orderNum: number }) => a.orderNum - b.orderNum);
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

            // Save gun/net time edits if changed
            const gunMs = parseTimeStrToMs(editGunTime);
            const chipMs = parseTimeStrToMs(editChipTime);
            const originalGunMs = editingRunner.gunTime || 0;
            const originalChipMs = editingRunner.netTime || 0;
            const gunChanged = gunMs !== null && gunMs !== originalGunMs;
            const chipChanged = chipMs !== null && chipMs !== originalChipMs;
            const gunCleared = editGunTime.trim() === '' && originalGunMs > 0;
            const chipCleared = editChipTime.trim() === '' && originalChipMs > 0;
            if (gunChanged || chipChanged || gunCleared || chipCleared) {
                const updateData: Record<string, unknown> = {};
                if (gunChanged) {
                    updateData.gunTime = gunMs;
                    updateData.gunTimeStr = editGunTime.trim();
                } else if (gunCleared) {
                    updateData.gunTime = 0;
                    updateData.gunTimeStr = '';
                }
                if (chipChanged) {
                    updateData.netTime = chipMs;
                    updateData.netTimeStr = editChipTime.trim();
                } else if (chipCleared) {
                    updateData.netTime = 0;
                    updateData.netTimeStr = '';
                }
                try {
                    await fetch(`/api/runners/${editingRunner._id}`, {
                        method: 'PUT',
                        headers: authHeaders(),
                        body: JSON.stringify(updateData),
                    });
                } catch { /* non-fatal */ }
            }

            const updatedGun = gunChanged ? gunMs! : (gunCleared ? 0 : originalGunMs);
            const updatedChip = chipChanged ? chipMs! : (chipCleared ? 0 : originalChipMs);
            setRunners(prev => prev.map(r =>
                r._id === editingRunner._id
                    ? {
                        ...r,
                        status: editStatus,
                        statusCheckpoint: editCheckpoint,
                        statusNote: editNote,
                        statusChangedAt: new Date().toISOString(),
                        gunTime: updatedGun,
                        netTime: updatedChip,
                        gunTimeStr: gunChanged ? editGunTime.trim() : (gunCleared ? '' : r.gunTimeStr),
                        netTimeStr: chipChanged ? editChipTime.trim() : (chipCleared ? '' : r.netTimeStr),
                    }
                    : r
            ));
            setEditingRunner(null);
        } catch (err: unknown) {
            setEditSaveError(err instanceof Error ? err.message : (language === 'th' ? 'บันทึกข้อมูลไม่สำเร็จ' : 'Failed to save runner status'));
        } finally {
            setEditSaving(false);
        }
    };

    const openManualStatusModal = async () => {
        setShowManualStatusModal(true);
        setManualSelectedIds(new Set());
        setManualStatus('dnf');
        setManualCheckpoint('');
        setManualNote('');
        setManualSearch('');
        setManualSaveError(null);
        setManualSaveSuccess(null);
        setManualTimeEdits({});
        // Scope checkpoints to the event of the runners currently shown (matches filterCategory).
        const targetEventId = manualModalRunners[0]?.eventId
            || runners.find(r => !filterCategory || resolveRunnerCategoryKey(r) === filterCategory)?.eventId;
        if (targetEventId) {
            setManualCheckpointsLoading(true);
            try {
                const cpRes = await fetch(`/api/checkpoints/mapping/event/${targetEventId}`, { cache: 'no-store' });
                if (cpRes.ok) {
                    const cpData = await cpRes.json();
                    const list = Array.isArray(cpData) ? cpData : cpData?.data || [];
                    const cps = list.map((m: any) => {
                        const cp = typeof m.checkpointId === 'object' && m.checkpointId !== null ? m.checkpointId : null;
                        return {
                            name: cp?.name || '',
                            orderNum: m.orderNum ?? cp?.orderNum ?? 0,
                            type: cp?.type || 'checkpoint',
                        };
                    }).filter((cp: { name: string }) => !!cp.name)
                      .sort((a: { orderNum: number }, b: { orderNum: number }) => a.orderNum - b.orderNum);
                    setManualCheckpoints(cps);
                }
            } catch { /* ignore */ }
            setManualCheckpointsLoading(false);
        } else {
            setManualCheckpoints([]);
        }
    };

    const handleManualStatusSave = async () => {
        // Gather time edits to commit; valid if any field parses cleanly.
        const timeEditEntries = Object.entries(manualTimeEdits).filter(([, e]) => {
            const gunOk = e.gun !== undefined && parseTimeStrToMs(e.gun) !== null;
            const netOk = e.net !== undefined && parseTimeStrToMs(e.net) !== null;
            const gunClear = e.gun !== undefined && e.gun.trim() === '';
            const netClear = e.net !== undefined && e.net.trim() === '';
            return gunOk || netOk || gunClear || netClear;
        });
        if (manualSelectedIds.size === 0 && timeEditEntries.length === 0) return;
        setManualSaving(true);
        setManualSaveError(null);
        setManualSaveSuccess(null);
        try {
            // 1. Bulk status update for checked runners
            if (manualSelectedIds.size > 0) {
                const updates = [...manualSelectedIds].map(id => ({
                    id,
                    status: manualStatus,
                    statusCheckpoint: manualCheckpoint || undefined,
                    statusNote: manualNote || undefined,
                    changedBy: 'admin',
                }));
                const res = await fetch('/api/runners/bulk-status', {
                    method: 'PUT',
                    headers: authHeaders(),
                    body: JSON.stringify({ runners: updates }),
                });
                if (!res.ok) {
                    let msg = language === 'th' ? 'บันทึกไม่สำเร็จ' : 'Failed to update statuses';
                    try { const j = await res.json(); msg = j.message || j.error || msg; } catch {}
                    throw new Error(msg);
                }
            }

            // 2. Per-runner gun/net time edits
            const timeUpdates: { id: string; data: Record<string, unknown> }[] = [];
            for (const [id, e] of timeEditEntries) {
                const runner = runners.find(r => r._id === id);
                if (!runner) continue;
                const data: Record<string, unknown> = {};
                if (e.gun !== undefined) {
                    if (e.gun.trim() === '') {
                        data.gunTime = 0;
                        data.gunTimeStr = '';
                    } else {
                        const ms = parseTimeStrToMs(e.gun);
                        if (ms !== null && ms !== (runner.gunTime || 0)) {
                            data.gunTime = ms;
                            data.gunTimeStr = e.gun.trim();
                        }
                    }
                }
                if (e.net !== undefined) {
                    if (e.net.trim() === '') {
                        data.netTime = 0;
                        data.netTimeStr = '';
                    } else {
                        const ms = parseTimeStrToMs(e.net);
                        if (ms !== null && ms !== (runner.netTime || 0)) {
                            data.netTime = ms;
                            data.netTimeStr = e.net.trim();
                        }
                    }
                }
                if (Object.keys(data).length > 0) timeUpdates.push({ id, data });
            }
            await Promise.all(timeUpdates.map(u =>
                fetch(`/api/runners/${u.id}`, {
                    method: 'PUT',
                    headers: authHeaders(),
                    body: JSON.stringify(u.data),
                }).catch(() => null)
            ));

            const statusCount = manualSelectedIds.size;
            const timeCount = timeUpdates.length;
            setRunners(prev => prev.map(r => {
                const statusChange = manualSelectedIds.has(r._id);
                const t = timeUpdates.find(u => u.id === r._id);
                if (!statusChange && !t) return r;
                return {
                    ...r,
                    ...(statusChange ? { status: manualStatus, statusCheckpoint: manualCheckpoint, statusNote: manualNote, statusChangedAt: new Date().toISOString() } : {}),
                    ...(t?.data.gunTime !== undefined ? { gunTime: t.data.gunTime as number } : {}),
                    ...(t?.data.gunTimeStr !== undefined ? { gunTimeStr: t.data.gunTimeStr as string } : {}),
                    ...(t?.data.netTime !== undefined ? { netTime: t.data.netTime as number } : {}),
                    ...(t?.data.netTimeStr !== undefined ? { netTimeStr: t.data.netTimeStr as string } : {}),
                };
            }));
            setManualSelectedIds(new Set());
            setManualTimeEdits({});
            const parts: string[] = [];
            if (statusCount > 0) parts.push(language === 'th' ? `${statusCount} คน → ${manualStatus.toUpperCase()}` : `${statusCount} → ${manualStatus.toUpperCase()}`);
            if (timeCount > 0) parts.push(language === 'th' ? `แก้เวลา ${timeCount} คน` : `${timeCount} time edits`);
            setManualSaveSuccess(parts.length > 0
                ? (language === 'th' ? `บันทึกแล้ว: ${parts.join(' · ')}` : `Saved: ${parts.join(' · ')}`)
                : (language === 'th' ? 'บันทึกแล้ว' : 'Saved'));
        } catch (err) {
            setManualSaveError(err instanceof Error ? err.message : (language === 'th' ? 'บันทึกไม่สำเร็จ' : 'Failed to save'));
        } finally {
            setManualSaving(false);
        }
    };

    const handleClearCheckpointTime = async (cpName: string, recordId: string, e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        if (!editingRunner) return;
        if (!window.confirm(language === 'th' ? `ลบเวลา ${cpName} ของนักวิ่งคนนี้ และ sync ข้อมูลจาก RaceTiger ใช่ไหม?` : `Clear ${cpName} time for this runner and re-sync from RaceTiger?`)) return;
        setClearingCheckpoint(cpName);
        setEditTimingSaveMsg(null);
        try {
            // 1. Delete the erroneous timing record
            await fetch(`/api/timing/${recordId}`, {
                method: 'DELETE',
                headers: authHeaders(),
            });
            // 2. Reset this runner's status to in_progress so the finish is removed
            await fetch(`/api/runners/${editingRunner._id}/status`, {
                method: 'PUT',
                headers: authHeaders(),
                body: JSON.stringify({ status: 'in_progress', changedBy: 'admin' }),
            });
            // 3. Trigger full-sync for this campaign in background (fire-and-forget — don't await)
            if (campaign?._id) {
                fetch(`/api/sync/full-sync?id=${campaign._id}`, {
                    method: 'POST',
                    headers: authHeaders(),
                }).catch(() => { /* ignore sync errors */ });
            }
            // 4. Refresh timing records in modal for this runner only
            if (editingRunner.eventId) {
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
            }
            // Update local runner state immediately (status back to in_progress)
            setRunners(prev => prev.map(r =>
                r._id === editingRunner._id ? { ...r, status: 'in_progress' } : r
            ));
            setEditStatus('in_progress');
            setEditTimingChanges(prev => { const next = { ...prev }; delete next[cpName]; return next; });
            setEditTimingSaveMsg(language === 'th' ? `ลบเวลา ${cpName} เรียบร้อย — กำลัง sync จาก RaceTiger...` : `Cleared ${cpName} — syncing from RaceTiger...`);
            setTimeout(() => setEditTimingSaveMsg(null), 5000);
        } catch { /* ignore */ }
        setClearingCheckpoint(null);
    };

    // Loading state
    if (loading) {
        return (
            <div className="flex min-h-screen items-center justify-center bg-slate-50 font-['Inter','Prompt',sans-serif]">
                <div className="text-center">
                    <div className="mx-auto mb-4 h-10 w-10 animate-spin rounded-full border-[3px] border-slate-200 border-t-green-500" />
                    <p className="text-sm text-slate-400">{language === 'th' ? 'กำลังโหลด...' : 'Loading...'}</p>
                    <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
                </div>
            </div>
        );
    }

    if (error || !campaign) {
        return (
            <div className="flex min-h-screen items-center justify-center bg-slate-50 font-['Inter','Prompt',sans-serif]">
                <div className="max-w-[400px] rounded-2xl bg-white p-8 text-center shadow-[0_4px_24px_rgba(0,0,0,0.08)]">
                    <div className="mb-4 text-5xl">😔</div>
                    <h2 className="mb-2 text-xl font-bold text-slate-900">{language === 'th' ? 'ไม่พบข้อมูล' : 'Not Found'}</h2>
                    <p className="mb-4 text-slate-400">{error}</p>
                    <Link href="/" className="inline-block rounded-lg bg-green-500 px-6 py-2 font-semibold text-white no-underline">
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

    // ── Filter bar controls, shared between the mobile (3 rows) and desktop (single row) layouts ──
    const searchBoxEl = (
        <div className={`relative min-w-0 flex-1 ${isMobile ? '' : 'max-w-[340px]'}`}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--muted-foreground)]">
                <circle cx="11" cy="11" r="8" /><path d="M21 21l-4.35-4.35" />
            </svg>
            <input
                type="text"
                placeholder={language === 'th' ? 'ค้นหา BIB หรือ ชื่อ..' : 'Search BIB or Name..'}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full rounded-xl border border-[var(--border)] bg-transparent py-2 pl-[34px] pr-3 text-xs font-medium text-[var(--foreground)] outline-none transition-colors duration-150 placeholder:text-[var(--muted-foreground)] focus:border-[var(--muted-foreground)]"
            />
        </div>
    );

    const genderBoxEl = (
        <div className="flex shrink-0 items-center rounded-full border border-[var(--border)] bg-[var(--card-solid)] p-[3px]">
            {(['ALL', 'M', 'F'] as const).map(g => (
                <button
                    key={g}
                    onClick={() => setFilterGender(g)}
                    className={`cursor-pointer whitespace-nowrap rounded-full border-none py-1 text-[11px] font-bold transition-all duration-200 ${isMobile ? 'px-2.5' : 'px-3'} ${filterGender === g
                        ? 'bg-[var(--foreground)] text-[var(--background)]'
                        : 'bg-transparent text-[var(--muted-foreground)]'}`}
                >
                    {g === 'ALL' ? (language === 'th' ? 'ทั้งหมด' : 'All') : g === 'M' ? (language === 'th' ? 'ชาย' : 'Male') : (language === 'th' ? 'หญิง' : 'Female')}
                </button>
            ))}
            <span aria-hidden className="mx-0.5 h-3.5 w-px shrink-0 bg-[var(--border)]" />
            <button
                onClick={() => setFilterGender('FOLLOWED')}
                aria-label={language === 'th' ? 'แสดงเฉพาะนักกีฬาที่ติดตาม' : 'Show followed runners only'}
                title={language === 'th' ? 'แสดงเฉพาะนักกีฬาที่ติดตาม' : 'Show followed runners only'}
                className={`flex cursor-pointer items-center justify-center rounded-full border-none py-1 transition-all duration-200 ${isMobile ? 'px-2' : 'px-2.5'}`}
                style={{ background: filterGender === 'FOLLOWED' ? (isDark ? 'rgba(225,29,72,0.18)' : '#fff1f2') : 'transparent' }}
            >
                <FollowHeartIcon filled={filterGender === 'FOLLOWED'} size={13} color="#e11d48" />
            </button>
        </div>
    );

    const ageSelectEl = ageGroupOptions.length > 0 ? (
        <select
            value={filterAgeGroup}
            onChange={(e) => setFilterAgeGroup(e.target.value)}
            title={language === 'th' ? 'ช่วงอายุ' : 'Age group'}
            className={`shrink-0 cursor-pointer appearance-none rounded-full border py-1.5 text-[11px] font-bold outline-none transition-all duration-200 ${isMobile ? 'px-3' : 'px-3.5'} ${filterAgeGroup
                ? 'border-[var(--foreground)] bg-[var(--foreground)] text-[var(--background)]'
                : 'border-[var(--border)] bg-transparent text-[var(--muted-foreground)]'}`}
        >
            <option value="">{language === 'th' ? 'ทุกอายุ' : 'All ages'}</option>
            {ageGroupOptions.map(ag => (
                <option key={ag} value={ag}>{language === 'th' ? `อายุ ${ag}` : `Age ${ag}`}</option>
            ))}
        </select>
    ) : null;

    const slidersEl = (
        <div className="relative shrink-0">
            <button
                onClick={() => (isMobile ? setShowAllColumns(!showAllColumns) : setShowColDropdown(!showColDropdown))}
                title={isMobile
                    ? (showAllColumns ? (language === 'th' ? 'ย่อคอลัมน์' : 'Less columns') : (language === 'th' ? 'แสดงคอลัมน์เพิ่มเติม' : 'More columns'))
                    : 'Columns'}
                className={`flex h-[29px] w-[40px] cursor-pointer items-center justify-center rounded-full border transition-all duration-200 ${(isMobile ? showAllColumns : showColDropdown)
                    ? 'border-[var(--foreground)] bg-[var(--foreground)] text-[var(--background)]'
                    : 'border-[var(--border)] bg-transparent text-[var(--muted-foreground)]'}`}
            >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                    <line x1="4" y1="21" x2="4" y2="14" /><line x1="4" y1="10" x2="4" y2="3" />
                    <line x1="12" y1="21" x2="12" y2="12" /><line x1="12" y1="8" x2="12" y2="3" />
                    <line x1="20" y1="21" x2="20" y2="16" /><line x1="20" y1="12" x2="20" y2="3" />
                    <line x1="1" y1="14" x2="7" y2="14" /><line x1="9" y1="8" x2="15" y2="8" /><line x1="17" y1="16" x2="23" y2="16" />
                </svg>
            </button>
            {!isMobile && showColDropdown && (
                <div className="absolute right-0 top-9 z-30 min-w-40 rounded-lg border p-2" style={{ background: themeStyles.cardBg, boxShadow: isDark ? '0 8px 16px rgba(0,0,0,0.4)' : '0 8px 16px rgba(0,0,0,0.1)', borderColor: themeStyles.border }}>
                    <p className="mb-1 px-2 text-[10px] font-bold uppercase" style={{ color: themeStyles.textSecondary }}>Display</p>
                    <label className="flex cursor-pointer items-center gap-2 px-2 py-1 text-xs" style={{ color: themeStyles.text }}>
                        <input type="checkbox" checked={showGenRank} onChange={e => setShowGenRank(e.target.checked)} /> Gender Rank
                    </label>
                    <label className="flex cursor-pointer items-center gap-2 px-2 py-1 text-xs" style={{ color: themeStyles.text }}>
                        <input type="checkbox" checked={showCatRank} onChange={e => setShowCatRank(e.target.checked)} /> Category Rank
                    </label>
                </div>
            )}
        </div>
    );

    // Ranking menu — General / Best of / Nationality / Age Group for the selected distance
    const rankingMenuEl = currentCategoryName ? (
        <RankingMenuDropdown
            campaignId={campaign._id}
            campaignSlugOrId={campaign.slug || campaign._id}
            campaignName={campaign.name}
            categoryName={currentCategoryName}
            overallDisplayCount={campaign.overallDisplayCount}
            excludeOverallThaiFromAgeGroup={campaign.excludeOverallThaiFromAgeGroup}
            excludeOverallForeignFromAgeGroup={campaign.excludeOverallForeignFromAgeGroup}
            ageGroupDisplayCount={campaign.ageGroupDisplayCount}
            bestOfDisplayCount={campaign.bestOfDisplayCount}
            rankingMenuVisibility={campaign.rankingMenuVisibility}
            isAdmin={isAdmin}
            language={language}
            align="right"
            iconOnly={isMobile}
            onSaved={(next) => setCampaign(prev => prev ? { ...prev, rankingMenuVisibility: next } : prev)}
        />
    ) : null;

    // Sort incomplete-checkpoint alerts to the top — admin only
    const adminSortEl = isAdmin ? (
        <button
            onClick={() => setSortAlertsFirst(v => !v)}
            title={language === 'th' ? 'เรียงคนที่ขึ้นแจ้งเตือน (⚠) ขึ้นบนสุด' : 'Sort incomplete-checkpoint alerts to the top'}
            className="flex shrink-0 cursor-pointer items-center gap-1 whitespace-nowrap rounded-full border px-3.5 py-1.5 text-[11px] font-bold transition-all duration-200"
            style={sortAlertsFirst
                ? { background: '#f59e0b', borderColor: '#f59e0b', color: '#fff' }
                : { background: 'transparent', borderColor: themeStyles.border, color: themeStyles.textMuted }}
        >
            <span aria-hidden>⚠</span>
            {language === 'th' ? 'จัดเรียง' : 'Sort'}
        </button>
    ) : null;

    return (
        <div className="min-h-screen overflow-hidden bg-[var(--background)] font-['Inter','Prompt',sans-serif] text-[var(--foreground)]">
            <style>{`
                @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&family=Prompt:wght@400;500;600;700&display=swap');
                @keyframes pulseLive { 0% { transform: scale(0.9); opacity: 0.7; } 50% { transform: scale(1.2); opacity: 1; } 100% { transform: scale(0.9); opacity: 0.7; } }
                .live-dot { width: 8px; height: 8px; border-radius: 50%; display: inline-block; animation: pulseLive 1.5s infinite; border: 1.5px solid white; }
                .runner-row:hover { background-color: ${themeStyles.hoverBg} !important; border-left-color: #22c55e !important; }
                .runner-row.runner-row-danger,
                .runner-row.runner-row-danger:hover { background-color: ${isDark ? 'rgba(254,226,226,0.12)' : '#fee2e2'} !important; border-left-color: #dc2626 !important; }
                ${isMobile ? `.table-scroll::-webkit-scrollbar { display: none; }
                .table-scroll { scrollbar-width: none; }` : ''}
            `}</style>

            {/* ===== HEADER ===== */}
            <header className="relative z-30 border-b border-[var(--border)] bg-[var(--card-solid)] px-4 py-2 shadow-[0_1px_3px_rgba(0,0,0,0.04)] dark:shadow-[0_1px_3px_rgba(0,0,0,0.2)]">
                <div className="flex max-w-full items-center justify-between overflow-hidden">
                    <div className="flex min-w-0 flex-1 items-center gap-3">
                        <button
                            onClick={() => router.back()}
                            title={language === 'th' ? 'ย้อนกลับ' : 'Go back'}
                            className="flex shrink-0 items-center gap-1 rounded-md border border-[var(--border)] bg-transparent px-2.5 py-1 text-[11px] font-semibold text-[var(--muted-foreground)] transition-all duration-200"
                            onMouseEnter={e => { e.currentTarget.style.background = themeStyles.hoverBg; e.currentTarget.style.color = themeStyles.text; }}
                            onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = themeStyles.textMuted; }}
                        >
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M19 12H5"/><path d="M12 19l-7-7 7-7"/></svg>
                            {!isMobile && <span>{language === 'th' ? 'ย้อนกลับ' : 'Back'}</span>}
                        </button>
                        <Link href="/" className="flex shrink-0 items-center gap-2 no-underline">
                            <Image
                                src={theme === 'dark' ? '/logo-white.png' : '/logo-black.png'}
                                alt="Logo"
                                width={isMobile ? 80 : 100}
                                height={isMobile ? 26 : 32}
                                className="object-contain"
                            />
                        </Link>
                        {!isMobile && (
                            <span className="flex items-center gap-2 border-l border-[var(--border)] pl-3 text-[18px] font-black italic text-[var(--foreground)]">
                                <span className={`font-bold not-italic uppercase ${isRaceFinished ? 'text-blue-500' : 'text-green-500'}`}>
                                    {isRaceFinished ? 'Results' : 'Live'}
                                </span>
                                {!isRaceFinished && <span className="live-dot bg-green-500" />}
                            </span>
                        )}
                        <div className="min-w-0">
                            <h1 className={`m-0 overflow-hidden text-ellipsis whitespace-nowrap font-bold leading-[1.2] text-[var(--foreground)] ${isMobile ? 'text-xs' : 'text-sm'}`}>{campaign.name}</h1>
                            {!isMobile && (
                                <p className="m-0 text-[10px] font-medium text-[var(--muted-foreground)]">
                                    {formatDate(campaign.eventDate)} | {campaign.location}
                                </p>
                            )}
                        </div>
                    </div>

                    {/* E-Slip download counter — how many runners saved their e-slip (admin-only) */}
                    {isAdmin && eslipStats && eslipStats.totalDownloads > 0 && (
                        <div
                            title={language === 'th'
                                ? `บันทึก E-Slip ${eslipStats.totalDownloads.toLocaleString()} ครั้ง จาก ${eslipStats.uniqueRunners.toLocaleString()} คน`
                                : `E-Slip saved ${eslipStats.totalDownloads.toLocaleString()} times by ${eslipStats.uniqueRunners.toLocaleString()} runners`}
                            className="mr-1 flex shrink-0 items-center gap-1.5 rounded-full border border-[var(--border)] bg-[var(--card-solid)] px-2.5 py-1"
                        >
                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><path d="M7 10l5 5 5-5" /><path d="M12 15V3" />
                            </svg>
                            <span className="whitespace-nowrap text-[11px] font-extrabold text-[var(--foreground)]">
                                {eslipStats.uniqueRunners.toLocaleString()}
                            </span>
                            {!isMobile && (
                                <span className="whitespace-nowrap text-[9px] font-bold uppercase tracking-[0.05em] text-[var(--muted-foreground)]">
                                    E-Slip
                                </span>
                            )}
                        </div>
                    )}

                    {!isMobile && isAuthenticated && (
                        <div className="flex items-center gap-1.5">
                            <span className="whitespace-nowrap text-[9px] font-bold uppercase tracking-[0.05em] text-[var(--muted-foreground)]">
                                STATUS:
                            </span>
                            <div className="flex rounded-lg bg-[var(--muted)] p-[3px]">
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
                                        className="whitespace-nowrap rounded-md border-none px-2.5 py-1 text-[10px] font-bold transition-all duration-200"
                                        style={filterStatus === s.key
                                            ? { background: s.color, color: '#fff' }
                                            : { background: 'transparent', color: themeStyles.textMuted }}
                                    >
                                        {s.label}
                                        {statusCounts[s.key] > 0 && (
                                            <span className="text-[8px]" style={{ opacity: filterStatus === s.key ? 1 : 0.7 }}>{statusCounts[s.key]}</span>
                                        )}
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}
                    {isAdmin && (
                        <button
                            onClick={openManualStatusModal}
                            title={language === 'th' ? 'แก้ไขสถานะทีละหลายคน' : 'Manual Status — bulk edit runner statuses'}
                            className="ml-1 flex shrink-0 items-center gap-1 rounded-md px-2.5 py-1 text-[11px] font-bold transition-all duration-150"
                            style={{ border: '1.5px solid rgba(249,115,22,0.4)', background: 'rgba(249,115,22,0.08)', color: isDark ? '#fb923c' : '#ea580c' }}
                            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(249,115,22,0.18)'; }}
                            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(249,115,22,0.08)'; }}
                        >
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/>
                                <path d="M15 5l4 4"/>
                            </svg>
                            {!isMobile && <span>Manual Status</span>}
                        </button>
                    )}
                </div>
                {/* Status filter moved to header right side */}
            </header>

            {/* ===== FILTER BAR ===== */}
            <div className="border-b border-[var(--border)] bg-[var(--card-solid)] px-4 py-2.5">
                {isMobile ? (
                    <>
                        {/* Row 1: Search + Distance — half & half */}
                        <div className="flex items-center gap-2">
                            {searchBoxEl}
                            <div className="relative min-w-0 flex-1">
                                <select
                                    value={filterCategory}
                                    onChange={e => setFilterCategory(e.target.value)}
                                    title="Distance"
                                    className="w-full cursor-pointer appearance-none rounded-xl border border-[var(--border)] bg-transparent py-2 pl-3.5 pr-8 text-xs font-bold text-[var(--foreground)] outline-none"
                                >
                                    {categories.map(cat => (
                                        <option key={cat.key} value={cat.key}>{cat.label}</option>
                                    ))}
                                </select>
                                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[var(--muted-foreground)]">
                                    <path d="M6 9l6 6 6-6" />
                                </svg>
                            </div>
                        </div>

                        {/* Row 2: Gender box + Age group + ranking trophy + column toggle — wraps instead of clipping */}
                        <div className="mt-2 flex flex-wrap items-center gap-1.5">
                            {genderBoxEl}
                            {ageSelectEl}
                            <div className="ml-auto flex items-center gap-1">
                                {rankingMenuEl}
                                {slidersEl}
                            </div>
                        </div>

                        {/* Row 3: admin tools */}
                        {adminSortEl && (
                            <div className="mt-2 flex items-center gap-1.5">
                                {adminSortEl}
                            </div>
                        )}
                    </>
                ) : (
                    /* Desktop: all tools on a single row */
                    <div className="flex flex-wrap items-center gap-2.5">
                        {/* Distance segmented control */}
                        <div className="flex shrink-0 items-center gap-2">
                            <span className="text-[10px] font-bold uppercase tracking-[0.05em] text-[var(--muted-foreground)]">KM:</span>
                            <div className="flex flex-wrap rounded-full bg-[var(--muted)] p-[3px]">
                                {categories.map(cat => (
                                    <button
                                        key={cat.key}
                                        onClick={() => setFilterCategory(cat.key)}
                                        className="cursor-pointer whitespace-nowrap rounded-full border-none px-3.5 py-1.5 text-[11px] font-bold transition-all duration-200"
                                        style={filterCategory === cat.key
                                            ? { background: '#22c55e', color: '#fff' }
                                            : { background: 'transparent', color: themeStyles.textMuted }}
                                    >
                                        {cat.label}
                                    </button>
                                ))}
                            </div>
                        </div>
                        {searchBoxEl}
                        {genderBoxEl}
                        {ageSelectEl}
                        {slidersEl}
                        {rankingMenuEl}
                        {adminSortEl}
                    </div>
                )}

            </div>

            {/* ===== TABLE ===== */}
            {/* Full-bleed on mobile (no side gutters) so the results table uses the entire screen width */}
            <main className={isMobile ? 'px-0' : 'px-4'}>
                <div className={`table-scroll ${isMobile ? '' : 'border border-x-[var(--border)]'} border-y-0 bg-[var(--card-solid)] pb-10 ${isMobile && showAllColumns ? 'overflow-x-auto' : 'overflow-x-hidden'} overflow-y-auto`} style={{ height: 'calc(100vh - 100px)' }}>
                    <table className="table-fixed border-collapse text-left" style={{ width: isMobile && showAllColumns ? Math.max(760, visibleColumns.length * 86) : '100%' }}>
                        <thead>
                            <tr className="sticky top-0 z-20 border-b-2 border-[var(--border)] bg-[var(--card-solid)] text-[10px] font-bold uppercase tracking-[-0.02em] text-[var(--muted-foreground)]">
                                {visibleColumns.map(key => {
                                    const def = activeColDefs.find(c => c.key === key)!;
                                    // On collapsed mobile only a handful of columns show, so stretch them to
                                    // fill the full screen width (and give GUN TIME room so it stops clipping).
                                    const collapsedMobile = isMobile && !showAllColumns;
                                    const collapsedW: Record<string, string> = { rank: '13%', runner: '46%', status: '22%', gunTime: '19%', laps: '30%' };
                                    const thWidth = collapsedMobile ? (collapsedW[key] || def.mw) : (isMobile ? def.mw : def.w);
                                    return (
                                        <th key={key} className={isMobile ? 'overflow-hidden text-ellipsis whitespace-nowrap' : ''} style={{ padding: isMobile && key === 'status' ? '6px 4px' : isMobile && key === 'gunTime' ? '6px 1px' : !isMobile && key === 'status' ? '8px 6px' : isMobile ? '6px 4px' : '8px 6px', textAlign: key === 'status' ? 'center' : def.align, width: thWidth }}>
                                            {def.label}
                                        </th>
                                    );
                                })}
                            </tr>
                        </thead>
                        <tbody>
                            {filteredRunners.length === 0 ? (
                                <tr><td colSpan={visibleColumns.length} className="px-4 py-12 text-center text-sm text-slate-400">
                                    {filterGender === 'FOLLOWED'
                                        ? (language === 'th' ? 'ยังไม่มีนักกีฬาที่คุณติดตามในรายการนี้' : 'No followed runners in this event')
                                        : (language === 'th' ? 'ไม่พบข้อมูลผู้เข้าแข่งขัน' : 'No participants found')}
                                </td></tr>
                            ) : (
                                filteredRunners.map((runner, idx) => {
                                    const rank = idx + 1;
                                    const isFollowedRunner = isRunnerFollowed(followedRunnersForEvent, runner._id);
                                    const checkpointMeta = getRunnerCheckpointMeta(runner);
                                    const statusCheckpointName = checkpointMeta.checkpointName;
                                    const checkpointKey = checkpointMeta.checkpointKey;
                                    const checkpointOrder = checkpointMeta.checkpointOrder;
                                    const totalCps = checkpointMeta.totalCheckpoints;
                                    const completedCpCount = checkpointMeta.completedCpCount;
                                    // Calculate progress % based on RaceTiger checkpoint data
                                    let progressPct = 0;
                                    let progressDistKm = 0;
                                    let eventTotalKm = 0;
                                    let progressLabel = '';
                                    // Stopped runners (DNS/DNF/DQ/not_started) must never be treated as
                                    // finish-like for progress/distance, even if RaceTiger sync left
                                    // latestCheckpoint='FINISH' on the Runner doc before status was set.
                                    const isStoppedStatus = ['dns', 'dnf', 'dq', 'not_started'].includes(runner.status);
                                    const isFinishCp = checkpointMeta.isFinishLike && !isStoppedStatus;
                                    const runnerStartDate = getRunnerCategoryStartDate(runner);
                                    if (runner.status === 'finished' || isFinishCp) {
                                        progressPct = 100;
                                        if (totalCps > 0 && completedCpCount > 0) {
                                            progressLabel = `${completedCpCount}/${totalCps} CP`;
                                        }
                                    } else if (['dns', 'not_started'].includes(runner.status)) {
                                        // DNS / not_started = runner never showed up. Progress is always 0%
                                        // regardless of any residual latestCheckpoint/passedCount/splitDesc
                                        // values left on the Runner doc by stale RaceTiger sync data.
                                        progressPct = 0;
                                    } else {
                                        // Calculate progress for ALL non-finished statuses
                                        const evLookup = checkpointMeta.evLookup;

                                        // Helper: try matching latestCheckpoint name to checkpoint mappings (exact + normalized)
                                        const matchedCpKey = checkpointKey;

                                        // Method 1: passedCount / totalCheckpoints (from RaceTiger sync)
                                        if ((runner.passedCount ?? 0) > 0 && totalCps > 0) {
                                            const ratio = Math.round((runner.passedCount! / totalCps) * 100);
                                            progressPct = runner.passedCount! >= totalCps ? 100 : Math.min(99, ratio);
                                            progressLabel = `${runner.passedCount}/${totalCps} CP`;
                                        }

                                        // Method 2: distance-based from checkpoint mapping
                                        if (progressPct === 0 && evLookup && matchedCpKey) {
                                            const cpDist = evLookup.checkpoints[matchedCpKey] ?? 0;
                                            const total = parseDistanceValue(runner.category) || evLookup.totalDistance || 0;
                                            if (cpDist > 0 && total > 0) {
                                                progressPct = Math.min(99, Math.round((cpDist / total) * 100));
                                                progressDistKm = cpDist;
                                                eventTotalKm = total;
                                            }
                                        }

                                        // Method 2.5: order-based from checkpoint mapping (fallback when distance is 0)
                                        if (progressPct === 0 && totalCps > 0 && checkpointOrder > 0) {
                                            const cpOrder = Math.min(checkpointOrder, totalCps);
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
                                            } else if (statusCheckpointName) {
                                                progressPct = runner.status === 'in_progress' ? 50 : 40;
                                            } else if (runner.isStarted || runner.status === 'in_progress') {
                                                progressPct = 5;
                                            }
                                        }
                                    }

                                    const showProgressAlert = progressPct >= 100 && totalCps > 0 && completedCpCount > 0 && completedCpCount < totalCps;
                                    const currentCheckpointTime = String(runner.lastPassTime || runner.scanTime || '').trim();
                                    const statusScanTimeLabel = currentCheckpointTime
                                        ? formatStatusScanTime(currentCheckpointTime, true)
                                        : '';

                                    // Render cell content per column key
                                    const renderCell = (key: string) => {
                                        switch (key) {
                                            case 'rank': {
                                                const hideRank = ['dnf', 'dns', 'dq', 'not_started'].includes(runner.status);
                                                // Use position-based live rank so values are always unique and sequential.
                                                // Falls back to overallRank, then idx+1 if neither is available.
                                                const liveRank = liveRanks.get(runner._id);
                                                // On the collapsed mobile view, when the list is filtered to a single
                                                // gender, show that gender's rank in the RANK slot (matches the GEN column).
                                                // The expanded "More" view keeps the overall rank — it shows GEN separately.
                                                const useGenderRank = isMobile && !showAllColumns && (filterGender === 'M' || filterGender === 'F');
                                                // When an age-group filter is active on collapsed mobile, show the
                                                // age-group (net-time) rank in the RANK slot instead of the overall rank.
                                                const useCatRank = isMobile && !showAllColumns && !useGenderRank && !!filterAgeGroup;
                                                const displayRank = useGenderRank
                                                    ? (liveRank?.genRank || runner.genderRank || rank)
                                                    : useCatRank
                                                    ? (liveRank?.catRank || runner.ageGroupRank || runner.ageGroupNetRank || rank)
                                                    : (liveRank?.overallRank || runner.overallRank || rank);
                                                // All ranks (1 → last) are rendered in the primary text color;
                                                // only DNS/DNF/DQ/not-started fall back to the muted grey "-".
                                                const rankColor = hideRank
                                                    ? (isDark ? '#64748b' : '#cbd5e1')
                                                    : (isDark ? '#f1f5f9' : '#0f172a');
                                                return (
                                                    <td key={key} className={isMobile ? 'px-0.5 py-1 text-center' : 'px-2 py-1.5 text-center'}>
                                                        <span className={isMobile ? 'text-sm font-black' : 'text-base font-black'} style={{ color: rankColor }}>{hideRank ? '-' : displayRank}</span>
                                                    </td>
                                                );
                                            }
                                            case 'genRank': {
                                                const hideGenRank = ['dnf', 'dns', 'dq', 'not_started'].includes(runner.status);
                                                const liveGen = liveRanks.get(runner._id)?.genRank;
                                                const displayGenRank = hideGenRank ? '-' : (liveGen || runner.genderRank || '-');
                                                return (
                                                    <td key={key} className={isMobile ? 'px-0.5 py-1 text-center' : 'px-1.5 py-1.5 text-center'}>
                                                        <span className={isMobile ? 'text-[11px] font-bold' : 'text-xs font-bold'} style={{ color: isMobile ? '#0f172a' : themeStyles.textMuted }}>{displayGenRank}</span>
                                                    </td>
                                                );
                                            }
                                            case 'catRank': {
                                                const hideCatRank = ['dnf', 'dns', 'dq', 'not_started'].includes(runner.status);
                                                const liveCat = liveRanks.get(runner._id)?.catRank;
                                                // Prefer our own live rank (time-ordered, canonical-bucket-scoped) over
                                                // RaceTiger's ageGroupRank/ageGroupNetRank, which can be stale or wrong
                                                // for individual runners after a time correction.
                                                const displayCatRank = hideCatRank ? '-' : (liveCat || runner.ageGroupRank || runner.ageGroupNetRank || '-');
                                                // Age group label sits right after the CAT rank number (same number size,
                                                // age group as a smaller muted suffix), moved here from the runner column.
                                                const catAgeGroup = runner.ageGroup || '';
                                                return (
                                                    <td key={key} className={isMobile ? 'px-0.5 py-1 text-center' : 'px-1.5 py-1.5 text-center'}>
                                                        <span className="inline-flex items-baseline justify-center gap-1 whitespace-nowrap">
                                                            <span className={isMobile ? 'text-[11px] font-bold' : 'text-xs font-bold'} style={{ color: isMobile ? '#0f172a' : themeStyles.textMuted }}>{displayCatRank}</span>
                                                            {catAgeGroup ? (
                                                                <span className={isMobile ? 'text-[9px] font-semibold' : 'text-[10px] font-semibold'} style={{ color: themeStyles.textMuted }}>({catAgeGroup})</span>
                                                            ) : null}
                                                        </span>
                                                    </td>
                                                );
                                            }
                                            case 'award': {
                                                const award = awardByRunnerId.get(runner._id);
                                                const textCls = isMobile ? 'text-[11px] font-bold' : 'text-xs font-bold';
                                                const textColor = isMobile ? '#0f172a' : themeStyles.textMuted;
                                                return (
                                                    <td key={key} className={isMobile ? 'px-0.5 py-1 text-center' : 'px-1.5 py-1.5 text-center'}>
                                                        {award && (award.overall || award.ageGroup) ? (
                                                            <span className="inline-flex flex-col items-center leading-tight whitespace-nowrap">
                                                                {award.overall ? <span className={textCls} style={{ color: textColor }}>{award.overallNat ? `OVERALL ${award.overallNat === 'thai' ? 'THA' : 'INT'}` : 'Overall'} {award.overall}</span> : null}
                                                                {award.ageGroup ? <span className={textCls} style={{ color: textColor }}>Age Group {award.ageGroup}</span> : null}
                                                            </span>
                                                        ) : (
                                                            <span className={textCls} style={{ color: textColor }}>-</span>
                                                        )}
                                                    </td>
                                                );
                                            }
                                            case 'runner':
                                                return (
                                                    <td key={key} className={isMobile ? 'overflow-hidden px-1 py-1' : 'overflow-hidden px-2 py-1.5'}>
                                                        <div className={isMobile ? 'grid min-h-7 overflow-hidden [grid-template-rows:auto_auto] gap-y-[3px]' : 'grid min-h-8 overflow-hidden [grid-template-rows:auto_auto] gap-y-[3px]'}>
                                                            <span className={`flex min-w-0 items-center ${isMobile ? 'gap-1' : 'gap-1.5'}`}>
                                                                <span className={`block min-w-0 flex-1 truncate font-bold uppercase ${isMobile ? 'text-[11px]' : 'text-[13px]'}`} style={{ color: runner.gender === 'F' ? '#be185d' : themeStyles.text, lineHeight: 1.15 }}>
                                                                    {language === 'th' && runner.firstNameTh
                                                                        ? `${runner.firstNameTh} ${runner.lastNameTh || ''}`.trim()
                                                                        : `${runner.firstName} ${runner.lastName}`}
                                                                </span>
                                                            </span>
                                                            <span className={`flex items-center whitespace-nowrap font-semibold ${isMobile ? 'gap-1 text-[9px]' : 'gap-1.5 text-[10px]'}`} style={{ color: themeStyles.text, lineHeight: 1.15 }}>
                                                                <span className={`rounded bg-[#dc2626] px-1.5 py-px font-extrabold tracking-[0.05em] text-white ${isMobile ? 'text-[9px]' : 'text-[10px]'}`}>
                                                                    BIB {runner.bib}
                                                                </span>
                                                                {/* Age group moved to the CAT column; show nationality here, falling back to category when there is no age group. */}
                                                                {runner.nationality ? runner.nationality : ''}{!runner.ageGroup && runner.category ? `${runner.nationality ? ' | ' : ''}${runner.category}` : ''}
                                                            </span>
                                                        </div>
                                                    </td>
                                                );
                                            case 'sex':
                                                return (
                                                    <td key={key} className="px-1.5 py-1.5 text-center text-[22px] font-black" style={{ color: runner.gender === 'M' ? '#3b82f6' : '#ec4899' }}>
                                                        {runner.gender === 'F' ? '♀' : '♂'}
                                                    </td>
                                                );
                                            case 'status': {
                                                const isDnfStatus = runner.status === 'dnf';
                                                const showStatusBadge = !['finished', 'in_progress', 'dnf'].includes(runner.status);
                                                const showFinishCheckpointBadge = !!statusCheckpointName && isFinishCp;
                                                const showInProgressCheckpointBadge = !!statusCheckpointName && runner.status === 'in_progress' && !isFinishCp;
                                                const showDnfChip = isDnfStatus;
                                                const showCheckpointChip = showFinishCheckpointBadge || showInProgressCheckpointBadge || showDnfChip;
                                                const hideCheckpointText = runner.status === 'dns' || runner.status === 'not_started' || isDnfStatus;
                                                const showCheckpointBelow = false;
                                                const inlineStatusCheckpoint = showDnfChip
                                                    ? getStatusLabel(runner.status)
                                                    : !hideCheckpointText && !showCheckpointBelow ? statusCheckpointName : '';
                                                const statusNameColor = showFinishCheckpointBadge
                                                    ? '#166534'
                                                    : showInProgressCheckpointBadge
                                                        ? '#92400e'
                                                        : showDnfChip
                                                            ? '#ffffff'
                                                            : runner.statusCheckpoint ? '#dc2626' : themeStyles.text;
                                                const statusTimeColor = statusCheckpointName ? statusNameColor : themeStyles.text;
                                                return (
                                                    <td key={key} className={isMobile ? 'px-0 py-1 align-top' : 'px-1.5 py-1.5 align-top'}>
                                                        <div className={`${isMobile ? 'min-h-7' : 'min-h-8'} relative grid min-w-0 justify-items-center gap-y-[3px]`} style={{ gridTemplateRows: showCheckpointBelow ? (statusScanTimeLabel ? 'auto auto auto' : 'auto auto') : (statusScanTimeLabel ? 'auto auto' : 'auto') }}>
                                                            <div className="relative flex w-full min-w-0 items-center justify-center gap-1">
                                                                {showStatusBadge && (
                                                                    <span className={`${isMobile ? 'px-1 py-px text-[8px]' : 'px-2 py-0.5 text-[10px]'} inline-block shrink-0 rounded-[3px] font-bold leading-[1.3] text-white`} style={{ background: getStatusBgColor(runner.status) }}>
                                                                        {getStatusLabel(runner.status)}
                                                                    </span>
                                                                )}
                                                                {inlineStatusCheckpoint ? (
                                                                    <span className={`${showCheckpointChip ? 'inline-block' : 'block'} min-w-0 max-w-full ${showCheckpointChip ? 'shrink-0 grow-0 basis-auto' : 'flex-1'} whitespace-nowrap font-bold leading-[1.15] ${showCheckpointChip ? 'overflow-visible text-clip rounded-full' : 'overflow-hidden text-ellipsis'} ${isMobile ? 'text-[9px]' : 'text-[11px]'}`} style={{ color: statusNameColor, background: showFinishCheckpointBadge ? '#dcfce7' : showInProgressCheckpointBadge ? '#fef3c7' : showDnfChip ? '#dc2626' : 'transparent', border: 'none', padding: showCheckpointChip ? (isMobile ? '2px 7px' : '3px 10px') : 0 }}>
                                                                        {inlineStatusCheckpoint}
                                                                        {/* Full note (e.g. the "finished without a START record" reason) is admin-only; public viewers see just the short label like "Auto DQ". */}
                                                                        {!showDnfChip && runner.statusNote ? ` · ${isAdmin ? runner.statusNote : runner.statusNote.split(':')[0].trim()}` : ''}
                                                                    </span>
                                                                ) : null}
                                                                {isFollowedRunner && (
                                                                    <span className={`${isMobile ? 'right-0 h-4 w-4' : isAdmin ? 'right-5 h-[18px] w-[18px]' : 'right-0 h-[18px] w-[18px]'} absolute inline-flex shrink-0 items-center justify-center rounded-full`} title={language === 'th' ? 'กำลังติดตามนักกีฬา' : 'Following runner'}>
                                                                        <FollowHeartIcon filled={true} size={isMobile ? 9 : 10} color="#e11d48" />
                                                                    </span>
                                                                )}
                                                            </div>
                                                            {showCheckpointBelow && statusCheckpointName ? (
                                                                <span className={`${isMobile ? 'text-[9px]' : 'text-[10px]'} block max-w-full overflow-hidden text-ellipsis whitespace-nowrap text-center font-semibold leading-[1.15] text-red-600`}>
                                                                    {statusCheckpointName}
                                                                </span>
                                                            ) : null}
                                                            {isAdmin && !isMobile && (
                                                                <button
                                                                    onClick={(e) => openStatusEdit(runner, e)}
                                                                    title="Edit status"
                                                                    className="absolute right-0 top-0 border-none bg-transparent p-0.5 text-[15px] leading-[0.8] opacity-50 transition-opacity duration-150 hover:opacity-100"
                                                                    style={{ color: themeStyles.textSecondary }}
                                                                >
                                                                    ✏️
                                                                </button>
                                                            )}
                                                            {statusScanTimeLabel && (
                                                                <span className={`${isMobile ? 'text-[9px]' : 'text-[10px]'} block max-w-full overflow-hidden text-ellipsis whitespace-nowrap text-center font-semibold leading-[1.15]`} style={{ color: isDnfStatus ? '#dc2626' : statusTimeColor }}>
                                                                    {statusScanTimeLabel}
                                                                </span>
                                                            )}
                                                        </div>
                                                    </td>
                                                );
                                            }
                                            case 'gunTime':
                                                return (
                                                    <td key={key} className={isMobile ? 'px-0 py-1 text-center' : 'px-1.5 py-1.5 text-left'}>
                                                        <span className={`${isMobile ? 'text-[11px]' : 'text-xs'} font-bold font-mono`} style={{ color: themeStyles.text }}>
                                                            {formatDisplayTimeString(runner.gunTimeStr, isAdmin) || formatTime(runner.gunTime || runner.elapsedTime)}
                                                        </span>
                                                    </td>
                                                );
                                            case 'netTime':
                                                return (
                                                    <td key={key} className="px-1.5 py-1.5 text-center">
                                                        <span className="font-mono text-xs font-bold" style={{ color: (runner.netTimeStr || runner.netTime) ? '#22c55e' : themeStyles.textSecondary }}>
                                                            {formatDisplayTimeString(runner.netTimeStr, isAdmin) || formatTime(runner.netTime)}
                                                        </span>
                                                    </td>
                                                );
                                            case 'genNet':
                                                return (
                                                    <td key={key} className="px-1 py-1.5 text-center text-[11px] font-semibold" style={{ color: themeStyles.textMuted }}>
                                                        {runner.genderNetRank || '-'}
                                                    </td>
                                                );
                                            case 'gunPace':
                                                return (
                                                    <td key={key} className="px-1.5 py-1.5 text-center">
                                                        <span className="font-mono text-[11px] font-semibold" style={{ color: themeStyles.textMuted }}>
                                                            {runner.gunPace || '-'}
                                                        </span>
                                                    </td>
                                                );
                                            case 'netPace':
                                                return (
                                                    <td key={key} className="px-1.5 py-1.5 text-center">
                                                        <span className="font-mono text-[11px] font-semibold" style={{ color: runner.netPace ? '#22c55e' : themeStyles.textSecondary }}>
                                                            {runner.netPace || '-'}
                                                        </span>
                                                    </td>
                                                );
                                            case 'finish':
                                                return (
                                                    <td key={key} className="px-1 py-1.5 text-center text-[11px] font-semibold" style={{ color: themeStyles.textMuted }}>
                                                        {runner.totalFinishers || '-'}
                                                    </td>
                                                );
                                            case 'genFin':
                                                return (
                                                    <td key={key} className="px-1 py-1.5 text-center text-[11px] font-semibold" style={{ color: themeStyles.textMuted }}>
                                                        {runner.genderFinishers || '-'}
                                                    </td>
                                                );
                                            // ===== RaceTiger Pass Time columns =====
                                            case 'chipCode':
                                                return (
                                                    <td key={key} className="px-1 py-1.5 text-center font-mono text-[10px]" style={{ color: themeStyles.textSecondary }}>
                                                        {runner.chipCode || '-'}
                                                    </td>
                                                );
                                            case 'printingCode':
                                                return (
                                                    <td key={key} className="px-1 py-1.5 text-center font-mono text-[10px]" style={{ color: themeStyles.textSecondary }}>
                                                        {runner.printingCode || '-'}
                                                    </td>
                                                );
                                            case 'splitNo':
                                                return (
                                                    <td key={key} className="px-1 py-1.5 text-center text-[11px] font-semibold" style={{ color: themeStyles.textMuted }}>
                                                        {runner.splitNo ?? '-'}
                                                    </td>
                                                );
                                            case 'splitName':
                                                return (
                                                    <td key={key} className="px-1 py-1.5 text-center text-[10px]" style={{ color: themeStyles.textSecondary }}>
                                                        {runner.splitDesc || '-'}
                                                    </td>
                                                );
                                            case 'splitTime':
                                                return (
                                                    <td key={key} className="px-1 py-1.5 text-center font-mono text-[11px] font-semibold" style={{ color: runner.splitTime ? themeStyles.text : themeStyles.textSecondary }}>
                                                        {runner.splitTime ? formatTime(runner.splitTime) : '-'}
                                                    </td>
                                                );
                                            case 'splitPace':
                                                return (
                                                    <td key={key} className="px-1 py-1.5 text-center font-mono text-[11px] font-semibold" style={{ color: runner.splitPace ? '#22c55e' : themeStyles.textSecondary }}>
                                                        {runner.splitPace || '-'}
                                                    </td>
                                                );
                                            case 'distFromStart': {
                                                const runnerCatDist = parseDistanceValue(runner.category);
                                                // Many imports never populate distanceFromStart on the timing
                                                // record itself (RaceTiger only sends the checkpoint name).
                                                // Fall back to the per-event checkpoint mapping so the column
                                                // still reflects the runner's progress.
                                                let rawDist: number | null = runner.distanceFromStart ?? null;
                                                if (rawDist == null || rawDist <= 0) {
                                                    const evLookupDist = checkpointMeta.evLookup;
                                                    if (evLookupDist) {
                                                        if (isFinishCp || runner.status === 'finished') {
                                                            const total = evLookupDist.totalDistance || runnerCatDist || 0;
                                                            if (total > 0) rawDist = total;
                                                        } else if (checkpointKey) {
                                                            const mapped = evLookupDist.checkpoints[checkpointKey];
                                                            if (mapped != null && mapped > 0) rawDist = mapped;
                                                        }
                                                    }
                                                }
                                                const displayDist = rawDist != null
                                                    ? (runnerCatDist != null && rawDist > runnerCatDist ? runnerCatDist : rawDist)
                                                    : null;
                                                return (
                                                    <td key={key} className="px-1 py-1.5 text-center text-[11px] font-semibold" style={{ color: themeStyles.textMuted }}>
                                                        {displayDist != null ? `${displayDist.toFixed(1)}km` : '-'}
                                                    </td>
                                                );
                                            }
                                            case 'gunTimeMs':
                                                return (
                                                    <td key={key} className="px-1 py-1.5 text-center font-mono text-[11px] font-semibold" style={{ color: runner.gunTimeMs ? themeStyles.text : themeStyles.textSecondary }}>
                                                        {runner.gunTimeMs ? formatTime(runner.gunTimeMs) : '-'}
                                                    </td>
                                                );
                                            case 'netTimeMs':
                                                return (
                                                    <td key={key} className="px-1 py-1.5 text-center font-mono text-[11px] font-semibold" style={{ color: runner.netTimeMs ? themeStyles.text : themeStyles.textSecondary }}>
                                                        {runner.netTimeMs ? formatTime(runner.netTimeMs) : '-'}
                                                    </td>
                                                );
                                            case 'totalGunTime':
                                                return (
                                                    <td key={key} className="px-1 py-1.5 text-center font-mono text-[11px] font-semibold" style={{ color: runner.totalGunTime ? themeStyles.text : themeStyles.textSecondary }}>
                                                        {runner.totalGunTime ? formatTime(runner.totalGunTime) : '-'}
                                                    </td>
                                                );
                                            case 'totalNetTime':
                                                return (
                                                    <td key={key} className="px-1 py-1.5 text-center font-mono text-[11px] font-semibold" style={{ color: runner.totalNetTime ? themeStyles.text : themeStyles.textSecondary }}>
                                                        {runner.totalNetTime ? formatTime(runner.totalNetTime) : '-'}
                                                    </td>
                                                );
                                            case 'supplement':
                                                return (
                                                    <td key={key} className="px-1 py-1.5 text-center text-[10px]" style={{ color: themeStyles.textSecondary }}>
                                                        {runner.supplement || '-'}
                                                    </td>
                                                );
                                            case 'cutOff':
                                                return (
                                                    <td key={key} className="px-1 py-1.5 text-center text-[10px] font-semibold" style={{ color: runner.cutOff ? '#dc2626' : themeStyles.textSecondary }}>
                                                        {runner.cutOff || '-'}
                                                    </td>
                                                );
                                            case 'legTime':
                                                return (
                                                    <td key={key} className="px-1 py-1.5 text-center font-mono text-[11px] font-semibold" style={{ color: runner.legTime ? themeStyles.text : themeStyles.textSecondary }}>
                                                        {runner.legTime ? formatTime(runner.legTime) : '-'}
                                                    </td>
                                                );
                                            case 'legPace':
                                                return (
                                                    <td key={key} className="px-1 py-1.5 text-center font-mono text-[11px] font-semibold" style={{ color: runner.legPace ? '#22c55e' : themeStyles.textSecondary }}>
                                                        {runner.legPace || '-'}
                                                    </td>
                                                );
                                            case 'legDistance':
                                                return (
                                                    <td key={key} className="px-1 py-1.5 text-center text-[11px] font-semibold" style={{ color: themeStyles.textMuted }}>
                                                        {runner.legDistance ? `${runner.legDistance.toFixed(1)}km` : '-'}
                                                    </td>
                                                );
                                            case 'lagMs':
                                                return (
                                                    <td key={key} className="px-1 py-1.5 text-center font-mono text-[11px] font-semibold" style={{ color: runner.lagMs ? themeStyles.text : themeStyles.textSecondary }}>
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
                                                    const evLookupFin = checkpointMeta.evLookup;
                                                    let nextLabel = '';
                                                    const matchedKeyFin = checkpointKey;
                                                    if (evLookupFin && matchedKeyFin) {
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

                                                const evLookupEta = checkpointMeta.evLookup;
                                                let nextCpName = '';
                                                let etaRemainingSec = -1;
                                                let isPastDue = false;

                                                if (evLookupEta) {
                                                    const matchedKey = checkpointKey;

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
                                                    } else if (!statusCheckpointName || statusCheckpointName.toLowerCase() === 'start') {
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
                                                                ) : statusCheckpointName ? (
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
                                                    <td key={key} className="px-2 py-1.5 text-right">
                                                        <div className="flex flex-col items-end">
                                                            <div className="mb-1 flex items-baseline gap-1">
                                                                <span className="text-[11px] font-bold" style={{ color: themeStyles.text }}>
                                                                    {progressPct}%
                                                                </span>
                                                                {progressLabel ? (
                                                                    <span className="text-[9px] font-medium" style={{ color: themeStyles.textSecondary }}>
                                                                        {progressLabel}
                                                                    </span>
                                                                ) : progressDistKm > 0 && eventTotalKm > 0 ? (
                                                                    <span className="text-[9px] font-medium" style={{ color: themeStyles.textSecondary }}>
                                                                        {progressDistKm.toFixed(1)}/{eventTotalKm.toFixed(0)}km
                                                                    </span>
                                                                ) : null}
                                                            </div>
                                                            <div className="flex w-full items-center justify-end gap-1">
                                                                {showProgressAlert && (
                                                                    <span className="text-xs leading-none text-amber-500" title={language === 'th' ? 'จำนวน checkpoint ที่ผ่านยังไม่ครบ' : 'Checkpoint count is incomplete'}>
                                                                        ⚠
                                                                    </span>
                                                                )}
                                                                <div className="h-1.5 w-full max-w-20 overflow-hidden rounded-[3px]" style={{ background: isDark ? 'rgba(255,255,255,0.1)' : '#f1f5f9' }}>
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
                                                        </div>
                                                    </td>
                                                );
                                            // ===== LAB / LAP columns =====
                                            case 'laps':
                                                return (
                                                    <td key={key} className="px-1.5 py-1.5 text-center">
                                                        <span className="text-[18px] font-black" style={{ color: (runner.lapCount || runner.passedCount || 0) > 0 ? '#8b5cf6' : themeStyles.textSecondary }}>
                                                            {runner.lapCount || runner.passedCount || 0}
                                                        </span>
                                                    </td>
                                                );
                                            case 'bestLap':
                                                return (
                                                    <td key={key} className="px-1.5 py-1.5 text-center">
                                                        <span className="font-mono text-xs font-bold" style={{ color: runner.bestLapTime ? '#22c55e' : themeStyles.textSecondary }}>
                                                            {runner.bestLapTime ? formatTime(runner.bestLapTime) : '-'}
                                                        </span>
                                                    </td>
                                                );
                                            case 'avgLap':
                                                return (
                                                    <td key={key} className="px-1.5 py-1.5 text-center">
                                                        <span className="font-mono text-xs font-semibold" style={{ color: runner.avgLapTime ? themeStyles.text : themeStyles.textSecondary }}>
                                                            {runner.avgLapTime ? formatTime(runner.avgLapTime) : '-'}
                                                        </span>
                                                    </td>
                                                );
                                            case 'lastLap':
                                                return (
                                                    <td key={key} className="px-1.5 py-1.5 text-center">
                                                        <span className="font-mono text-xs font-semibold" style={{ color: runner.lastLapTime ? themeStyles.text : themeStyles.textSecondary }}>
                                                            {runner.lastLapTime ? formatTime(runner.lastLapTime) : '-'}
                                                        </span>
                                                    </td>
                                                );
                                            case 'totalTime':
                                                return (
                                                    <td key={key} className="px-1.5 py-1.5 text-center">
                                                        <span className="font-mono text-xs font-bold" style={{ color: themeStyles.text }}>
                                                            {formatTime(runner.elapsedTime || runner.gunTime)}
                                                        </span>
                                                    </td>
                                                );
                                            case 'lastPass':
                                                return (
                                                    <td key={key} className="px-1.5 py-1.5 text-center">
                                                        <span className="font-mono text-[11px]" style={{ color: runner.lastPassTime ? themeStyles.text : themeStyles.textSecondary }}>
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
                                                    <td key={key} className="px-1.5 py-1.5 text-center">
                                                        <span className="font-mono text-[11px] font-semibold" style={{ color: lapPaceStr !== '-' ? '#8b5cf6' : themeStyles.textSecondary }}>
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

            {/* Runner detail now navigated to /runner/[id] page */}

            {/* ===== ADMIN STATUS EDIT MODAL ===== */}
            {editingRunner && (
                <div
                    onClick={() => setEditingRunner(null)}
                    className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/50"
                >
                    <div
                        onClick={e => e.stopPropagation()}
                        className="max-h-[90vh] w-[520px] max-w-[95vw] overflow-y-auto rounded-xl p-6 shadow-[0_20px_60px_rgba(0,0,0,0.3)]"
                        style={{ background: isDark ? '#1e293b' : '#fff' }}
                    >
                        <div className="mb-4">
                            <h3 className="mb-2 mt-0 text-sm font-bold uppercase tracking-[0.05em]" style={{ color: themeStyles.textSecondary }}>
                                {language === 'th' ? 'แก้ไขข้อมูล Runner' : 'Edit Runner'}
                            </h3>
                            <div className="flex items-center gap-2.5">
                                <span className="inline-flex shrink-0 items-center gap-1 rounded-md bg-blue-600 px-3 py-1 font-mono text-[13px] font-extrabold tracking-[0.05em] text-white">
                                    BIB {editingRunner.bib}
                                </span>
                                <span className="text-base font-bold leading-[1.3]" style={{ color: themeStyles.text }}>
                                    {editingRunner.firstName} {editingRunner.lastName}
                                </span>
                            </div>
                        </div>

                        <label className="mb-1 block text-[11px] font-bold uppercase" style={{ color: themeStyles.textSecondary }}>
                            {language === 'th' ? 'สถานะ' : 'Status'}
                        </label>
                        <div className="mb-3.5 flex flex-wrap gap-1.5">
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
                                    className="cursor-pointer rounded-md px-3.5 py-1.5 text-xs font-bold transition-all duration-150"
                                    style={{
                                        border: editStatus === opt.value ? `2px solid ${opt.color}` : '2px solid transparent',
                                        background: editStatus === opt.value ? opt.color : (isDark ? '#334155' : '#f1f5f9'),
                                        color: editStatus === opt.value ? '#fff' : themeStyles.text,
                                    }}
                                >
                                    {opt.label}
                                </button>
                            ))}
                        </div>

                        <label className="mb-1 block text-[11px] font-bold uppercase" style={{ color: themeStyles.textSecondary }}>
                            {language === 'th' ? 'จุด Checkpoint' : 'Checkpoint'}
                        </label>
                        <input
                            value={editCheckpoint}
                            onChange={e => setEditCheckpoint(e.target.value)}
                            placeholder={language === 'th' ? 'เช่น CP3, FINISH' : 'e.g. CP3, FINISH'}
                            className="mb-3.5 w-full rounded-md border px-3 py-2 text-[13px] box-border"
                            style={{ borderColor: themeStyles.border, background: isDark ? '#0f172a' : '#fff', color: themeStyles.text }}
                        />

                        <label className="mb-1 block text-[11px] font-bold uppercase" style={{ color: themeStyles.textSecondary }}>
                            {language === 'th' ? 'หมายเหตุ' : 'Note'}
                        </label>
                        <input
                            value={editNote}
                            onChange={e => setEditNote(e.target.value)}
                            placeholder={language === 'th' ? 'เช่น ขาเจ็บ, หลงทาง' : 'e.g. injury, lost route'}
                            className="mb-3.5 w-full rounded-md border px-3 py-2 text-[13px] box-border"
                            style={{ borderColor: themeStyles.border, background: isDark ? '#0f172a' : '#fff', color: themeStyles.text }}
                        />

                        {/* ===== GUN / NET TIME ===== */}
                        <div className="mb-3.5 grid grid-cols-2 gap-3">
                            <div>
                                <label className="mb-1 block text-[11px] font-bold uppercase" style={{ color: themeStyles.textSecondary }}>
                                    ⏱ {language === 'th' ? 'Gun Time' : 'Gun Time'}
                                </label>
                                <input
                                    value={editGunTime}
                                    onChange={e => setEditGunTime(e.target.value)}
                                    placeholder="HH:MM:SS"
                                    inputMode="numeric"
                                    className="w-full rounded-md border px-3 py-2 font-mono text-[13px] box-border"
                                    style={{
                                        borderColor: editGunTime && parseTimeStrToMs(editGunTime) === null ? '#dc2626' : themeStyles.border,
                                        background: isDark ? '#0f172a' : '#fff',
                                        color: themeStyles.text,
                                    }}
                                />
                                {editGunTime && parseTimeStrToMs(editGunTime) === null && (
                                    <div className="mt-1 text-[10px] text-red-500">
                                        {language === 'th' ? 'รูปแบบ: HH:MM:SS' : 'Format: HH:MM:SS'}
                                    </div>
                                )}
                            </div>
                            <div>
                                <label className="mb-1 block text-[11px] font-bold uppercase" style={{ color: themeStyles.textSecondary }}>
                                    🏃 {language === 'th' ? 'Chip Time (Net)' : 'Chip Time (Net)'}
                                </label>
                                <input
                                    value={editChipTime}
                                    onChange={e => setEditChipTime(e.target.value)}
                                    placeholder="HH:MM:SS"
                                    inputMode="numeric"
                                    className="w-full rounded-md border px-3 py-2 font-mono text-[13px] box-border"
                                    style={{
                                        borderColor: editChipTime && parseTimeStrToMs(editChipTime) === null ? '#dc2626' : themeStyles.border,
                                        background: isDark ? '#0f172a' : '#fff',
                                        color: themeStyles.text,
                                    }}
                                />
                                {editChipTime && parseTimeStrToMs(editChipTime) === null && (
                                    <div className="mt-1 text-[10px] text-red-500">
                                        {language === 'th' ? 'รูปแบบ: HH:MM:SS' : 'Format: HH:MM:SS'}
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* ===== CHECKPOINT TIMING SECTION ===== */}
                        <div className="mb-3.5 border-t pt-3.5" style={{ borderTopColor: themeStyles.border }}>
                            <label className="mb-2 block text-[11px] font-bold uppercase" style={{ color: themeStyles.textSecondary }}>
                                {language === 'th' ? 'เวลาเข้าจุด Checkpoint' : 'Checkpoint Times'}
                            </label>
                            {editTimingLoading ? (
                                <div className="p-4 text-center text-xs" style={{ color: themeStyles.textSecondary }}>
                                    {language === 'th' ? 'กำลังโหลด...' : 'Loading...'}
                                </div>
                            ) : editCheckpoints.length === 0 ? (
                                <div className="rounded-md p-3 text-center text-xs" style={{ color: themeStyles.textSecondary, background: isDark ? '#0f172a' : '#f9fafb' }}>
                                    {language === 'th' ? 'ไม่พบข้อมูล Checkpoint' : 'No checkpoints found'}
                                </div>
                            ) : (
                                <div className="flex flex-col gap-1.5">
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
                                        const isClearing = clearingCheckpoint === cp.name;
                                        return (
                                            <div key={cp.name + i} className="flex items-center gap-2">
                                                <span className="inline-block min-w-[60px] whitespace-nowrap rounded px-2 py-0.5 text-center text-[10px] font-bold text-white" style={{ background: cpColor }}>
                                                    {cp.name}
                                                </span>
                                                <button
                                                    onClick={() => setCpTimingPickerOpen(cp.name)}
                                                    className="box-border flex-1 cursor-pointer rounded-md px-2.5 py-1.5 text-left font-mono text-xs transition-all duration-150"
                                                    style={{ border: `1px solid ${hasChanged ? '#8b5cf6' : themeStyles.border}`, background: isDark ? '#0f172a' : '#fff', color: displayTime ? themeStyles.text : themeStyles.textSecondary }}
                                                >
                                                    {displayTime || (language === 'th' ? 'กดเพื่อตั้งเวลา' : 'Click to set time')}
                                                </button>
                                                {matchedRecord?._id && (
                                                    <button
                                                        type="button"
                                                        onClick={(e) => handleClearCheckpointTime(cp.name, matchedRecord._id!, e)}
                                                        disabled={isClearing}
                                                        title={language === 'th' ? 'ลบเวลาและ sync จาก RaceTiger' : 'Clear time & re-sync from RaceTiger'}
                                                        className="flex shrink-0 items-center justify-center rounded-md border-none px-2 py-1.5 text-xs font-bold text-white transition-opacity duration-150"
                                                        style={{ background: '#dc2626', opacity: isClearing ? 0.5 : 1, cursor: isClearing ? 'not-allowed' : 'pointer', minWidth: 28 }}
                                                    >
                                                        {isClearing ? '...' : '🗑'}
                                                    </button>
                                                )}
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
                                            className="mt-1 self-end rounded-md border-none bg-violet-500 px-4 py-1.5 text-xs font-bold text-white"
                                        >
                                            {language === 'th' ? 'บันทึกเวลา Checkpoint' : 'Save Checkpoint Times'}
                                        </button>
                                    )}
                                    {editTimingSaveMsg && (
                                        <span className="self-end text-[11px] font-semibold text-green-500">
                                            ✓ {editTimingSaveMsg}
                                        </span>
                                    )}
                                </div>
                            )}
                        </div>

                        {editSaveError && (
                            <div className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-xs font-semibold text-red-700">
                                {editSaveError}
                            </div>
                        )}

                        <div className="flex justify-end gap-2">
                            <button
                                onClick={() => setEditingRunner(null)}
                                className="rounded-md border bg-transparent px-5 py-2 text-[13px] font-semibold"
                                style={{ borderColor: themeStyles.border, color: themeStyles.text }}
                            >
                                {language === 'th' ? 'ยกเลิก' : 'Cancel'}
                            </button>
                            <button
                                onClick={handleStatusUpdate}
                                disabled={editSaving}
                                className="rounded-md border-none bg-blue-600 px-6 py-2 text-[13px] font-bold text-white"
                                style={{ cursor: editSaving ? 'not-allowed' : 'pointer', opacity: editSaving ? 0.6 : 1 }}
                            >
                                {editSaving ? '...' : (language === 'th' ? 'บันทึก' : 'Save')}
                            </button>
                        </div>
                    </div>
                </div>
            )}
            {/* ===== MANUAL STATUS BULK MODAL ===== */}
            {showManualStatusModal && (
                <div
                    onClick={() => setShowManualStatusModal(false)}
                    className="fixed inset-0 z-[1100] flex items-end justify-center bg-black/60 sm:items-center sm:p-3"
                >
                    <div
                        onClick={e => e.stopPropagation()}
                        className="flex h-[100dvh] w-full flex-col rounded-t-2xl shadow-[0_-8px_40px_rgba(0,0,0,0.3)] sm:h-full sm:max-w-5xl sm:rounded-xl"
                        style={{ background: isDark ? '#1e293b' : '#fff' }}
                    >
                        {/* Modal Header */}
                        <div className="flex shrink-0 items-center justify-between border-b px-5 py-3.5" style={{ borderColor: themeStyles.border }}>
                            <div>
                                <h2 className="m-0 text-sm font-bold" style={{ color: themeStyles.text }}>
                                    {language === 'th' ? 'แก้ไขสถานะนักวิ่งหลายคน' : 'Manual Status — Bulk Edit'}
                                </h2>
                                <p className="m-0 mt-0.5 text-[11px]" style={{ color: themeStyles.textSecondary }}>
                                    {language === 'th' ? `ระยะ: ${filterCategory || 'ทั้งหมด'} · ${manualModalRunners.length} คน` : `Distance: ${filterCategory || 'All'} · ${manualModalRunners.length} runners`}
                                </p>
                            </div>
                            <button
                                onClick={() => setShowManualStatusModal(false)}
                                className="flex h-7 w-7 items-center justify-center rounded-full border-none text-lg font-bold"
                                style={{ background: isDark ? '#334155' : '#f1f5f9', color: themeStyles.textMuted }}
                            >
                                ×
                            </button>
                        </div>

                        {/* Controls */}
                        <div className="shrink-0 border-b px-5 py-3 space-y-2.5" style={{ borderColor: themeStyles.border }}>
                            {/* Search + Sort */}
                            <div className="flex gap-2">
                                <input
                                    type="text"
                                    value={manualSearch}
                                    onChange={e => setManualSearch(e.target.value)}
                                    placeholder={language === 'th' ? 'ค้นหาชื่อหรือเลข BIB...' : 'Search by name or BIB...'}
                                    className="min-w-0 flex-1 rounded-lg border px-3 py-2 text-[13px] outline-none"
                                    style={{ borderColor: themeStyles.border, background: isDark ? '#0f172a' : '#f8fafc', color: themeStyles.text }}
                                />
                                <select
                                    value={manualSort}
                                    onChange={e => setManualSort(e.target.value as 'rank' | 'name' | 'bib')}
                                    className="shrink-0 rounded-lg border px-2 py-2 text-[12px] outline-none"
                                    style={{ borderColor: themeStyles.border, background: isDark ? '#0f172a' : '#f8fafc', color: themeStyles.text }}
                                >
                                    <option value="rank">{language === 'th' ? 'เรียง: อันดับ' : 'Sort: Rank'}</option>
                                    <option value="bib">{language === 'th' ? 'เรียง: BIB' : 'Sort: BIB'}</option>
                                    <option value="name">{language === 'th' ? 'เรียง: ชื่อ' : 'Sort: Name'}</option>
                                </select>
                            </div>

                            {/* Status selector + Select All/Deselect All */}
                            <div className="flex flex-wrap items-center gap-1.5">
                                <span className="shrink-0 text-[10px] font-bold uppercase" style={{ color: themeStyles.textSecondary }}>
                                    {language === 'th' ? 'สถานะ:' : 'Status:'}
                                </span>
                                {[
                                    { value: 'dnf', label: 'DNF', color: '#dc2626' },
                                    { value: 'dns', label: 'DNS', color: '#dc2626' },
                                    { value: 'dq', label: 'DQ', color: '#7c2d12' },
                                    { value: 'in_progress', label: 'Racing', color: '#f97316' },
                                    { value: 'not_started', label: 'Not Started', color: '#94a3b8' },
                                    { value: 'finished', label: 'Finish', color: '#22c55e' },
                                ].map(opt => (
                                    <button
                                        key={opt.value}
                                        onClick={() => setManualStatus(opt.value)}
                                        className="cursor-pointer rounded-md px-3 py-1 text-[11px] font-bold transition-all duration-150"
                                        style={{
                                            border: manualStatus === opt.value ? `2px solid ${opt.color}` : '2px solid transparent',
                                            background: manualStatus === opt.value ? opt.color : (isDark ? '#334155' : '#f1f5f9'),
                                            color: manualStatus === opt.value ? '#fff' : themeStyles.text,
                                        }}
                                    >
                                        {opt.label}
                                    </button>
                                ))}
                                <div className="ml-auto flex items-center gap-1.5">
                                    <button
                                        onClick={() => setManualSelectedIds(new Set(manualModalRunners.map(r => r._id)))}
                                        className="rounded-md border-none px-3 py-1 text-[11px] font-bold"
                                        style={{ background: isDark ? '#334155' : '#e2e8f0', color: themeStyles.text }}
                                    >
                                        {language === 'th' ? `เลือกทั้งหมด (${manualModalRunners.length})` : `All (${manualModalRunners.length})`}
                                    </button>
                                    <button
                                        onClick={() => setManualSelectedIds(new Set())}
                                        className="rounded-md border-none px-3 py-1 text-[11px] font-bold"
                                        style={{ background: isDark ? '#334155' : '#e2e8f0', color: themeStyles.text }}
                                    >
                                        {language === 'th' ? 'ยกเลิก' : 'None'}
                                    </button>
                                    {manualSelectedIds.size > 0 && (
                                        <span className="text-[11px] font-semibold text-orange-500">
                                            {manualSelectedIds.size}
                                        </span>
                                    )}
                                </div>
                            </div>
                        </div>

                        {/* Runner List */}
                        {/* ── Table header (sticky) ── */}
                        <div
                            className="flex shrink-0 items-center gap-2 border-b px-4 py-1.5 text-[10px] font-bold uppercase tracking-[0.05em]"
                            style={{ borderColor: themeStyles.border, background: isDark ? '#0f172a' : '#f8fafc', color: themeStyles.textSecondary, position: 'sticky', top: 0, zIndex: 2 }}
                        >
                            {/* Checkbox placeholder */}
                            <div style={{ width: 18, flexShrink: 0 }} />
                            {/* Rank */}
                            {!isMobile && <div className="w-8 shrink-0 text-center">{language === 'th' ? 'อันดับ' : 'Rank'}</div>}
                            {/* BIB */}
                            <div className="w-10 shrink-0">{language === 'th' ? 'บิบ' : 'BIB'}</div>
                            {/* Runner name */}
                            <div className="min-w-0 flex-1 overflow-hidden">{language === 'th' ? 'นักวิ่ง' : 'Runner'}</div>
                            {/* Desktop-only columns */}
                            {!isMobile && <div className="w-20 shrink-0 text-right">{language === 'th' ? 'เวลาปืน' : 'Gun'}</div>}
                            {!isMobile && <div className="w-20 shrink-0 text-right">{language === 'th' ? 'เวลาชิป' : 'Net'}</div>}
                            {!isMobile && <div className="w-24 shrink-0">{language === 'th' ? 'ความคืบหน้า' : 'Progress'}</div>}
                            {/* Status */}
                            <div className="shrink-0 w-24 text-center">{language === 'th' ? 'สถานะ' : 'Status'}</div>
                        </div>

                        <div className="flex-1 overflow-y-auto">
                            {manualModalRunners.length === 0 ? (
                                <div className="flex h-40 items-center justify-center text-sm" style={{ color: themeStyles.textSecondary }}>
                                    {language === 'th' ? 'ไม่พบนักวิ่ง' : 'No runners found'}
                                </div>
                            ) : (
                                <div>
                                    {manualModalRunners.map(runner => {
                                        const isChecked = manualSelectedIds.has(runner._id);
                                        const statusColor: Record<string, string> = { finished: '#22c55e', in_progress: '#f97316', dnf: '#dc2626', dns: '#dc2626', dq: '#7c2d12', not_started: '#94a3b8' };
                                        const gunStr = formatDisplayTimeString(runner.gunTimeStr) || formatTime(runner.gunTime);
                                        const netStr = formatDisplayTimeString(runner.netTimeStr) || formatTime(runner.netTime);
                                        const cpName = runner.latestCheckpoint || runner.statusCheckpoint || '';

                                        // Progress calculation (same logic as main table)
                                        const checkpointMeta = getRunnerCheckpointMeta(runner);
                                        const { evLookup, checkpointKey, checkpointOrder, totalCheckpoints: totalCps, completedCpCount, isFinishLike: rawIsFinishLike } = checkpointMeta;
                                        // Stopped runners must never inherit a stale "FINISH" latestCheckpoint
                                        const isStoppedStatus = ['dns', 'dnf', 'dq', 'not_started'].includes(runner.status);
                                        const isFinishLike = rawIsFinishLike && !isStoppedStatus;
                                        let progressPct = 0;
                                        let progressDistKm = 0;
                                        let eventTotalKm = 0;
                                        let progressLabel = '';
                                        if (runner.status === 'finished' || isFinishLike) {
                                            progressPct = 100;
                                            if (totalCps > 0 && completedCpCount > 0) progressLabel = `${completedCpCount}/${totalCps} CP`;
                                        } else if (['dns', 'not_started'].includes(runner.status)) {
                                            // DNS = runner never started — always 0%, ignore any stale data
                                            progressPct = 0;
                                        } else {
                                            if ((runner.passedCount ?? 0) > 0 && totalCps > 0) {
                                                const ratio = Math.round((runner.passedCount! / totalCps) * 100);
                                                progressPct = runner.passedCount! >= totalCps ? 100 : Math.min(99, ratio);
                                                progressLabel = `${runner.passedCount}/${totalCps} CP`;
                                            }
                                            if (progressPct === 0 && evLookup && checkpointKey) {
                                                const cpDist = evLookup.checkpoints[checkpointKey] ?? 0;
                                                const total = parseDistanceValue(runner.category) || evLookup.totalDistance || 0;
                                                if (cpDist > 0 && total > 0) {
                                                    progressPct = Math.min(99, Math.round((cpDist / total) * 100));
                                                    progressDistKm = cpDist;
                                                    eventTotalKm = total;
                                                }
                                            }
                                            if (progressPct === 0 && totalCps > 0 && checkpointOrder > 0) {
                                                const cpOrder = Math.min(checkpointOrder, totalCps);
                                                progressPct = Math.min(99, Math.round((cpOrder / totalCps) * 100));
                                                progressLabel = `${cpOrder}/${totalCps} CP`;
                                            }
                                            if (progressPct === 0) {
                                                const elapsed = runner.gunTime || runner.elapsedTime || 0;
                                                const median = categoryMedianTime[runner.category] || 0;
                                                if (elapsed > 0 && median > 0) {
                                                    const maxPct = runner.status === 'dnf' ? 90 : runner.status === 'dns' ? 0 : 95;
                                                    progressPct = Math.min(maxPct, Math.round((elapsed / median) * 100));
                                                } else if (runner.isStarted || runner.status === 'in_progress') {
                                                    progressPct = 5;
                                                }
                                            }
                                        }
                                        const progressBarBg = progressPct >= 100
                                            ? '#22c55e'
                                            : progressPct > 75
                                                ? 'linear-gradient(90deg,#334155 0%,#ef4444 33%,#eab308 66%,#22c55e 100%)'
                                                : progressPct > 50
                                                    ? 'linear-gradient(90deg,#334155 0%,#ef4444 50%,#eab308 100%)'
                                                    : progressPct > 25
                                                        ? 'linear-gradient(90deg,#334155 0%,#ef4444 100%)'
                                                        : '#334155';
                                        const progressSubLabel = progressLabel
                                            ? progressLabel
                                            : progressDistKm > 0 && eventTotalKm > 0
                                                ? `${progressDistKm.toFixed(1)}/${eventTotalKm.toFixed(0)}km`
                                                : '';

                                        return (
                                            <div
                                                key={runner._id}
                                                onClick={() => {
                                                    setManualSelectedIds(prev => {
                                                        const next = new Set(prev);
                                                        if (next.has(runner._id)) next.delete(runner._id);
                                                        else next.add(runner._id);
                                                        return next;
                                                    });
                                                }}
                                                className="flex cursor-pointer items-center gap-2 border-b px-4 py-2 transition-colors"
                                                style={{
                                                    borderColor: themeStyles.border,
                                                    background: isChecked ? (isDark ? 'rgba(249,115,22,0.10)' : 'rgba(249,115,22,0.06)') : 'transparent',
                                                }}
                                                onMouseEnter={e => { if (!isChecked) (e.currentTarget as HTMLElement).style.background = isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.02)'; }}
                                                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = isChecked ? (isDark ? 'rgba(249,115,22,0.10)' : 'rgba(249,115,22,0.06)') : 'transparent'; }}
                                            >
                                                {/* Checkbox */}
                                                <div
                                                    className="shrink-0"
                                                    style={{
                                                        width: 18, height: 18,
                                                        border: isChecked ? '2px solid #f97316' : `2px solid ${themeStyles.border}`,
                                                        background: isChecked ? '#f97316' : 'transparent',
                                                        borderRadius: 4,
                                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                    }}
                                                >
                                                    {isChecked && (
                                                        <svg width="10" height="10" viewBox="0 0 12 12" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                                            <polyline points="2 6 5 9 10 3"/>
                                                        </svg>
                                                    )}
                                                </div>

                                                {/* Rank — desktop only */}
                                                {!isMobile && (
                                                    <div className="w-8 shrink-0 text-center font-mono text-[11px] font-bold" style={{ color: runner.overallRank ? themeStyles.text : themeStyles.textSecondary }}>
                                                        {runner.overallRank || '—'}
                                                    </div>
                                                )}

                                                {/* BIB */}
                                                <span className="w-10 shrink-0 font-mono text-[12px] font-bold" style={{ color: '#3b82f6' }}>
                                                    {runner.bib}
                                                </span>

                                                {/* Name */}
                                                <div className="min-w-0 flex-1 overflow-hidden">
                                                    <div className="truncate text-[12px] font-semibold" style={{ color: themeStyles.text }}>
                                                        {language === 'th' && runner.firstNameTh
                                                            ? `${runner.firstNameTh} ${runner.lastNameTh || ''}`.trim()
                                                            : `${runner.firstName} ${runner.lastName}`}
                                                        {language === 'th' && runner.firstNameTh ? (
                                                            <span className="ml-1 text-[10px] font-normal" style={{ color: themeStyles.textSecondary }}>
                                                                {runner.firstName} {runner.lastName}
                                                            </span>
                                                        ) : (runner.firstNameTh || runner.lastNameTh) && (
                                                            <span className="ml-1 text-[10px] font-normal" style={{ color: themeStyles.textSecondary }}>
                                                                {runner.firstNameTh} {runner.lastNameTh}
                                                            </span>
                                                        )}
                                                    </div>
                                                    <div className="text-[10px]" style={{ color: themeStyles.textSecondary }}>
                                                        {runner.category}{runner.gender ? ` · ${runner.gender}` : ''}{runner.ageGroup ? ` · ${runner.ageGroup}` : ''}
                                                        {/* Mobile: inline timing */}
                                                        {isMobile && gunStr && gunStr !== '-' && <span className="ml-1.5 font-mono" style={{ color: themeStyles.textSecondary }}>G:{gunStr}</span>}
                                                        {isMobile && netStr && netStr !== '-' && <span className="ml-1 font-mono text-green-500">N:{netStr}</span>}
                                                        {isMobile && cpName && <span className="ml-1">📍{cpName}</span>}
                                                    </div>
                                                </div>

                                                {/* Gun Time — desktop editable */}
                                                {!isMobile && (() => {
                                                    const orig = msToHHMMSS(runner.gunTime) || runner.gunTimeStr || '';
                                                    const draft = manualTimeEdits[runner._id]?.gun;
                                                    const val = draft !== undefined ? draft : orig;
                                                    const dirty = draft !== undefined && draft !== orig;
                                                    const invalid = !!val && parseTimeStrToMs(val) === null;
                                                    return (
                                                        <div className="w-20 shrink-0" onClick={e => e.stopPropagation()}>
                                                            <input
                                                                value={val}
                                                                onChange={e => setManualTimeEdits(prev => ({ ...prev, [runner._id]: { ...prev[runner._id], gun: e.target.value } }))}
                                                                placeholder="HH:MM:SS"
                                                                className="w-full rounded border px-1.5 py-0.5 text-right font-mono text-[11px] outline-none box-border"
                                                                style={{
                                                                    borderColor: invalid ? '#dc2626' : dirty ? '#f97316' : themeStyles.border,
                                                                    background: dirty ? (isDark ? 'rgba(249,115,22,0.08)' : 'rgba(249,115,22,0.05)') : (isDark ? '#0f172a' : '#fff'),
                                                                    color: themeStyles.text,
                                                                }}
                                                            />
                                                            <div className="text-[9px] uppercase tracking-wide" style={{ color: themeStyles.textSecondary }}>Gun</div>
                                                        </div>
                                                    );
                                                })()}

                                                {/* Net Time — desktop editable */}
                                                {!isMobile && (() => {
                                                    const orig = msToHHMMSS(runner.netTime) || runner.netTimeStr || '';
                                                    const draft = manualTimeEdits[runner._id]?.net;
                                                    const val = draft !== undefined ? draft : orig;
                                                    const dirty = draft !== undefined && draft !== orig;
                                                    const invalid = !!val && parseTimeStrToMs(val) === null;
                                                    return (
                                                        <div className="w-20 shrink-0" onClick={e => e.stopPropagation()}>
                                                            <input
                                                                value={val}
                                                                onChange={e => setManualTimeEdits(prev => ({ ...prev, [runner._id]: { ...prev[runner._id], net: e.target.value } }))}
                                                                placeholder="HH:MM:SS"
                                                                className="w-full rounded border px-1.5 py-0.5 text-right font-mono text-[11px] outline-none box-border"
                                                                style={{
                                                                    borderColor: invalid ? '#dc2626' : dirty ? '#16a34a' : themeStyles.border,
                                                                    background: dirty ? (isDark ? 'rgba(22,163,74,0.08)' : 'rgba(22,163,74,0.05)') : (isDark ? '#0f172a' : '#fff'),
                                                                    color: dirty || (val && val !== '-') ? (dirty ? '#16a34a' : themeStyles.text) : themeStyles.textSecondary,
                                                                }}
                                                            />
                                                            <div className="text-[9px] uppercase tracking-wide" style={{ color: themeStyles.textSecondary }}>Net</div>
                                                        </div>
                                                    );
                                                })()}

                                                {/* Progress — desktop only */}
                                                {!isMobile && (
                                                    <div className="w-24 shrink-0">
                                                        <div className="mb-0.5 flex items-baseline justify-between gap-1">
                                                            <span className="text-[11px] font-bold" style={{ color: themeStyles.text }}>{progressPct}%</span>
                                                            {progressSubLabel && (
                                                                <span className="truncate text-[9px]" style={{ color: themeStyles.textSecondary }}>{progressSubLabel}</span>
                                                            )}
                                                        </div>
                                                        <div className="h-1.5 w-full overflow-hidden rounded-[3px]" style={{ background: isDark ? 'rgba(255,255,255,0.1)' : '#f1f5f9' }}>
                                                            <div style={{
                                                                height: '100%',
                                                                width: `${progressPct}%`,
                                                                borderRadius: 3,
                                                                background: progressBarBg,
                                                                transition: 'width 0.5s ease',
                                                            }} />
                                                        </div>
                                                    </div>
                                                )}

                                                {/* Status — rich cell like main table */}
                                                {(() => {
                                                    const isDnfSt = runner.status === 'dnf';
                                                    const cpMeta2 = getRunnerCheckpointMeta(runner);
                                                    const stCpName = cpMeta2.checkpointName || cpName;
                                                    const stStopped = ['dns', 'dnf', 'dq', 'not_started'].includes(runner.status);
                                                    const isFinish2 = cpMeta2.isFinishLike && !stStopped;
                                                    const showBadge = !['finished', 'in_progress', 'dnf'].includes(runner.status);
                                                    const showFinishChip = !!stCpName && isFinish2;
                                                    const showInProgChip = !!stCpName && runner.status === 'in_progress' && !isFinish2;
                                                    const chipBg = showFinishChip ? '#dcfce7' : showInProgChip ? '#fef3c7' : isDnfSt ? '#dc2626' : 'transparent';
                                                    const chipColor = showFinishChip ? '#166534' : showInProgChip ? '#92400e' : isDnfSt ? '#fff' : themeStyles.text;
                                                    const chipLabel = isDnfSt ? 'DNF' : (!['dns','not_started'].includes(runner.status) ? stCpName : '');
                                                    const scanTimeStr = String(runner.lastPassTime || runner.scanTime || '').trim();
                                                    const scanLabel = scanTimeStr ? formatStatusScanTime(scanTimeStr, true) : '';
                                                    return (
                                                        <div className="w-24 shrink-0 flex flex-col items-center justify-center gap-0.5 text-center">
                                                            <div className="flex flex-wrap items-center justify-center gap-1">
                                                                {showBadge && (
                                                                    <span className="inline-block shrink-0 rounded-[3px] px-1.5 py-px text-[10px] font-bold leading-[1.3] text-white" style={{ background: getStatusBgColor(runner.status) }}>
                                                                        {getStatusLabel(runner.status)}
                                                                    </span>
                                                                )}
                                                                {chipLabel ? (
                                                                    <span className="inline-block shrink-0 overflow-visible rounded-full px-2 py-px text-[10px] font-bold leading-[1.3]" style={{ background: chipBg, color: chipColor }}>
                                                                        {chipLabel}
                                                                    </span>
                                                                ) : null}
                                                            </div>
                                                            {scanLabel && (
                                                                <div className="truncate text-[9px] font-semibold" style={{ color: isDnfSt ? '#dc2626' : themeStyles.textSecondary }}>
                                                                    {scanLabel}
                                                                </div>
                                                            )}
                                                            {/* Mobile: show on status row too */}
                                                            {isMobile && stCpName && !chipLabel && (
                                                                <div className="truncate text-[9px]" style={{ color: themeStyles.textSecondary }}>{stCpName}</div>
                                                            )}
                                                        </div>
                                                    );
                                                })()}
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>

                        {/* Footer */}
                        <div className="shrink-0 border-t px-5 py-3" style={{ borderColor: themeStyles.border }}>
                            {manualSaveError && (
                                <div className="mb-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-[12px] font-semibold text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-300">
                                    {manualSaveError}
                                </div>
                            )}
                            {manualSaveSuccess && (
                                <div className="mb-2 rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-[12px] font-semibold text-green-700 dark:border-green-800 dark:bg-green-950 dark:text-green-300">
                                    ✓ {manualSaveSuccess}
                                </div>
                            )}
                            {(() => {
                                const timeEditCount = Object.values(manualTimeEdits).filter(e => {
                                    const gunOk = e.gun !== undefined;
                                    const netOk = e.net !== undefined;
                                    return gunOk || netOk;
                                }).length;
                                const canSave = manualSelectedIds.size > 0 || timeEditCount > 0;
                                const summaryParts: string[] = [];
                                if (manualSelectedIds.size > 0) {
                                    summaryParts.push(language === 'th'
                                        ? `เลือก ${manualSelectedIds.size} คน → ${manualStatus.toUpperCase()}`
                                        : `${manualSelectedIds.size} selected → ${manualStatus.toUpperCase()}`);
                                }
                                if (timeEditCount > 0) {
                                    summaryParts.push(language === 'th'
                                        ? `แก้เวลา ${timeEditCount} คน`
                                        : `${timeEditCount} time edits`);
                                }
                                return (
                            <div className="flex items-center justify-between gap-3">
                                <span className="text-[11px]" style={{ color: themeStyles.textSecondary }}>
                                    {summaryParts.length > 0
                                        ? summaryParts.join(' · ')
                                        : (language === 'th' ? 'ยังไม่ได้เลือกนักวิ่งหรือแก้เวลา' : 'No runners selected or time edits')}
                                </span>
                                <div className="flex gap-2">
                                    <button
                                        onClick={() => setShowManualStatusModal(false)}
                                        className="rounded-lg border bg-transparent px-4 py-2 text-[12px] font-semibold"
                                        style={{ borderColor: themeStyles.border, color: themeStyles.text }}
                                    >
                                        {language === 'th' ? 'ปิด' : 'Close'}
                                    </button>
                                    <button
                                        onClick={handleManualStatusSave}
                                        disabled={manualSaving || !canSave}
                                        className="rounded-lg border-none px-5 py-2 text-[12px] font-bold text-white transition-opacity"
                                        style={{
                                            background: !canSave ? '#94a3b8' : '#f97316',
                                            cursor: (manualSaving || !canSave) ? 'not-allowed' : 'pointer',
                                            opacity: (manualSaving || !canSave) ? 0.6 : 1,
                                        }}
                                    >
                                        {manualSaving ? '...' : (language === 'th' ? `บันทึก${manualSelectedIds.size > 0 ? ` (${manualSelectedIds.size})` : ''}` : `Save${manualSelectedIds.size > 0 ? ` (${manualSelectedIds.size})` : ''}`)}
                                    </button>
                                </div>
                            </div>
                                );
                            })()}
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
