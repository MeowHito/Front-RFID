'use client';

import { useState, useEffect, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import { isRunnerFollowed, loadFollowedRunners, saveFollowedRunners, subscribeFollowedRunners, toggleFollowedRunner, type FollowedRunner } from '@/lib/followed-runners';
import { computeAwardsForCategory, computeOverallRanks, formatOverallAwardLabel, type AwardResult } from '@/lib/awards';
import { bestOfProvinceAwardFor } from '@/lib/thai-provinces';
import { isNationalitySplitCategory } from '@/lib/nationality';
import { useLanguage } from '@/lib/language-context';


interface RunnerData {
    _id: string;
    bib: string;
    firstName: string;
    lastName: string;
    firstNameTh?: string;
    lastNameTh?: string;
    gender: string;
    category: string;
    ageGroup?: string;
    age?: number;
    nationality?: string;
    team?: string;
    teamName?: string;
    status: string;
    netTime?: number;
    gunTime?: number;
    elapsedTime?: number;
    netTimeStr?: string;
    gunTimeStr?: string;
    overallRank?: number;
    genderRank?: number;
    categoryRank?: number;
    genderNetRank?: number;
    categoryNetRank?: number;
    ageGroupRank?: number;
    ageGroupNetRank?: number;
    netPace?: string;
    gunPace?: string;
    totalFinishers?: number;
    genderFinishers?: number;
    latestCheckpoint?: string;
}

interface TimingRecord {
    _id: string;
    checkpoint: string;
    scanTime: string;
    splitTime?: number;
    elapsedTime?: number;
    distanceFromStart?: number;
    legDistance?: number;
    netTime?: number;
    gunTime?: number;
    order?: number;
    netPace?: string;
    gunPace?: string;
    splitPace?: string;
}

interface CampaignData {
    _id: string;
    name: string;
    slug?: string;
    eventDate: string;
    location?: string;
    pictureUrl?: string;
    categories?: Array<{ name: string; distance: string; badgeColor: string }>;
    eslipTemplate?: string;
    displayMode?: string;
    isApproveCertificate?: boolean;
    certLayout?: any;
    overallDisplayCount?: number;
    ageGroupDisplayCount?: number;
    bestOfDisplayCount?: number;
    bestOfProvinceEnabled?: boolean;
    bestOfProvinces?: { province: string; count: number }[];
    excludeOverallFromAgeGroup?: number;
    excludeOverallThaiFromAgeGroup?: number;
    excludeOverallForeignFromAgeGroup?: number;
    excludeAgeGroupTop?: number;
    separateOverallNationalityCategories?: string[];
    targetTimeBands?: TargetTimeBandGroup[];
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

/** Find the target-time band (e.g. "sub 45") a runner's finish time falls into,
 *  mirroring the Target-Time-Winners board + E-Slip: minutes = time_ms / 60000,
 *  band is the one where minMinutes <= minutes < maxMinutes for the runner's category. */
function computeTargetBandLabel(runner: RunnerData, campaign: CampaignData | null): string | null {
    if (!campaign?.targetTimeBands?.length || !runner.category) return null;
    const group = campaign.targetTimeBands.find(g => g.category === runner.category);
    if (!group?.bands?.length) return null;
    const ms = runner.netTime || runner.gunTime || 0;
    if (ms <= 0) return null;
    const mins = ms / 60000;
    const band = group.bands.find(b => mins >= b.minMinutes && mins < b.maxMinutes);
    return band?.label ?? null;
}

interface CheckpointMappingData {
    _id: string;
    checkpointId: { _id: string; name: string; type: string; orderNum?: number; kmCumulative?: number } | string;
    eventId: string;
    orderNum: number;
    distanceFromStart?: number;
    active?: boolean;
}

interface RecordingInfo {
    _id: string;
    cameraName: string;
    checkpointName?: string;
    startTime: string;
    endTime?: string | null;
    duration: number;
    fileSize: number;
    recordingStatus?: string;
    /** 'classic' = browser-based /camera page (.webm). 'beta' = Larix/IRL Pro HLS. */
    source?: 'classic' | 'beta';
    /** Beta only: full HLS .m3u8 URL (S3 archive when finalized, else EC2 hot). */
    playbackUrl?: string | null;
    /** Beta only: which playback host the URL points to. */
    playbackSource?: 's3' | 'ec2' | null;
    /** Beta only: 'rtmp' | 'srt'. */
    protocol?: string;
    /** Per-recording seek offset (some sources may differ even at the same scanTime). */
    seekSeconds?: number;
}

interface RunnerHit {
    checkpoint: string;
    scanTime: string;
    elapsedTime: number | null;
    splitTime: number | null;
    recording: RecordingInfo | null;
    /** All recordings that cover this scan, across classic + beta sources. */
    recordings?: RecordingInfo[];
    seekSeconds: number;
}

function formatTime(ms?: number | null): string {
    if (!ms || ms <= 0) return '--:--:--';
    const totalSeconds = Math.floor(ms / 1000);
    const h = Math.floor(totalSeconds / 3600);
    const m = Math.floor((totalSeconds % 3600) / 60);
    const s = totalSeconds % 60;
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

function formatTimeOfDay(dateStr?: string): string {
    if (!dateStr) return '--:--:--';
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return '--:--:--';
    return d.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function normalizeCheckpoint(value?: string | null): string {
    return String(value || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

function formatBytes(bytes?: number | null): string {
    if (!bytes || bytes <= 0) return '--';
    const units = ['B', 'KB', 'MB', 'GB'];
    let value = bytes;
    let unitIndex = 0;
    while (value >= 1024 && unitIndex < units.length - 1) {
        value /= 1024;
        unitIndex += 1;
    }
    return `${value >= 100 || unitIndex === 0 ? value.toFixed(0) : value.toFixed(1)} ${units[unitIndex]}`;
}

function formatDateTime(dateStr?: string | null): string {
    if (!dateStr) return '-';
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return '-';
    const day = d.getDate();
    const month = d.getMonth() + 1;
    const year = d.getFullYear() % 100;
    const hours = d.getHours().toString().padStart(2, '0');
    const minutes = d.getMinutes().toString().padStart(2, '0');
    const seconds = d.getSeconds().toString().padStart(2, '0');
    return `${day}/${month}/${year} ${hours}:${minutes}:${seconds}`;
}

function getFileExtensionFromMimeType(mimeType?: string | null): string {
    const normalized = String(mimeType || '').toLowerCase();
    if (normalized.includes('webm')) return 'webm';
    if (normalized.includes('quicktime')) return 'mov';
    if (normalized.includes('x-matroska')) return 'mkv';
    if (normalized.includes('mp4')) return 'mp4';
    return 'mp4';
}

function getFileNameFromDisposition(disposition?: string | null): string | null {
    if (!disposition) return null;
    const utf8Match = disposition.match(/filename\*=UTF-8''([^;]+)/i);
    if (utf8Match?.[1]) {
        try {
            return decodeURIComponent(utf8Match[1]);
        } catch {
            return utf8Match[1];
        }
    }
    const regularMatch = disposition.match(/filename="?([^";]+)"?/i);
    return regularMatch?.[1] || null;
}

function getStatusLabel(status: string): { text: string; bg: string; color: string } {
    switch (status) {
        case 'finished': return { text: 'Finished', bg: '#dcfce7', color: '#15803d' };
        case 'in_progress': return { text: 'Racing', bg: '#dbeafe', color: '#1d4ed8' };
        case 'dnf': return { text: 'DNF', bg: '#fee2e2', color: '#dc2626' };
        case 'dns': return { text: 'DNS', bg: '#f1f5f9', color: '#64748b' };
        default: return { text: 'Not Started', bg: '#f1f5f9', color: '#64748b' };
    }
}

function parseDistanceValue(value: unknown): number | null {
    const raw = String(value || '').replace(/,/g, '');
    const match = raw.match(/-?\d+(?:\.\d+)?/);
    if (!match) return null;
    const parsed = Number(match[0]);
    return Number.isFinite(parsed) ? parsed : null;
}

function CheckpointCameraIcon({ onClick, size = 22 }: { onClick?: () => void; size?: number }) {
    const icon = (
        <Image src="/Camera.png" alt="มีวิดีโอ CCTV" width={size} height={size} style={{ width: size, height: size, display: 'block', flexShrink: 0, objectFit: 'contain' }} />
    );

    if (!onClick) {
        return (
            <span aria-label="มีวิดีโอ CCTV" title="มีวิดีโอ CCTV" style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                {icon}
            </span>
        );
    }

    return (
        <button
            type="button"
            aria-label="เปิดวิดีโอ CCTV"
            title="เปิดวิดีโอ CCTV"
            onClick={(event) => {
                event.stopPropagation();
                onClick();
            }}
            style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', padding: 0, margin: 0, border: 'none', background: 'transparent', cursor: 'pointer', lineHeight: 0, flexShrink: 0 }}
        >
            {icon}
        </button>
    );
}

function FollowHeartIcon({ filled, size = 16, color }: { filled: boolean; size?: number; color: string }) {
    return (
        <svg viewBox="0 0 24 24" aria-hidden="true" style={{ width: size, height: size, display: 'block' }}>
            <path d="M12 21.35 10.55 20.03C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35Z" fill={filled ? color : 'none'} stroke={color} strokeWidth="2" strokeLinejoin="round" />
        </svg>
    );
}

/** Auto-shrink text to always fit one line within its container */
function FitName({ children, className, style, maxSize = 28 }: { children: string; className?: string; style?: React.CSSProperties; maxSize?: number }) {
    const ref = useRef<HTMLDivElement>(null);
    const frameRef = useRef<number | null>(null);
    useEffect(() => {
        const el = ref.current;
        if (!el) return;
        const fit = () => {
            const width = el.clientWidth;
            if (!width) return;
            let size = maxSize;
            el.style.fontSize = `${size}px`;
            while (el.scrollWidth > width && size > 10) {
                size -= 1;
                el.style.fontSize = `${size}px`;
            }
        };

        const scheduleFit = () => {
            if (frameRef.current !== null) {
                cancelAnimationFrame(frameRef.current);
            }
            frameRef.current = requestAnimationFrame(() => {
                fit();
                frameRef.current = null;
            });
        };

        scheduleFit();
        window.addEventListener('resize', scheduleFit);

        let observer: ResizeObserver | null = null;
        if (typeof ResizeObserver !== 'undefined') {
            observer = new ResizeObserver(() => scheduleFit());
            observer.observe(el);
            if (el.parentElement) observer.observe(el.parentElement);
        }

        return () => {
            window.removeEventListener('resize', scheduleFit);
            observer?.disconnect();
            if (frameRef.current !== null) {
                cancelAnimationFrame(frameRef.current);
                frameRef.current = null;
            }
        };
    }, [children, maxSize]);
    return <div ref={ref} style={{ ...style, whiteSpace: 'nowrap', overflow: 'hidden', width: '100%', minWidth: 0, flex: '1 1 auto', fontSize: maxSize, fontWeight: 900, textTransform: 'uppercase' as const }} className={className}>{children}</div>;
}

export default function RunnerProfilePage() {
    const { language } = useLanguage();
    const params = useParams();
    const router = useRouter();
    const runnerId = params.id as string;

    const [runner, setRunner] = useState<RunnerData | null>(null);
    const [timings, setTimings] = useState<TimingRecord[]>([]);
    const [campaign, setCampaign] = useState<CampaignData | null>(null);
    const [award, setAward] = useState<AwardResult | null>(null);
    const [bestOfProvince, setBestOfProvince] = useState<string | null>(null);
    // Gun-time overall placing computed from the category pool (Overall = gun time),
    // so this matches the /event RANK column instead of the net-time stored rank.
    const [gunOverallRank, setGunOverallRank] = useState<number | null>(null);
    const [cpMappings, setCpMappings] = useState<CheckpointMappingData[]>([]);
    const [checkpointRanks, setCheckpointRanks] = useState<Record<string, number>>({});
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [lookupLoading, setLookupLoading] = useState(false);
    const [lookupLoaded, setLookupLoaded] = useState(false);
    const [runnerHits, setRunnerHits] = useState<RunnerHit[]>([]);
    const [selectedCheckpointKey, setSelectedCheckpointKey] = useState('');
    const [selectedRecordingId, setSelectedRecordingId] = useState<string>('');
    const [preArrivalBufferSeconds, setPreArrivalBufferSeconds] = useState(5);
    const [clipBufferSeconds, setClipBufferSeconds] = useState(10);
    const [clipPreBufferSeconds, setClipPreBufferSeconds] = useState(5);
    const [allowDownload, setAllowDownload] = useState(true);
    const [followedRunners, setFollowedRunners] = useState<FollowedRunner[]>([]);
    const [selectedVideoIsPortrait, setSelectedVideoIsPortrait] = useState(false);
    const [videoDownloadLoading, setVideoDownloadLoading] = useState(false);
    const [videoBuffering, setVideoBuffering] = useState(false);

    useEffect(() => {
        if (!runnerId) return;
        (async () => {
            try {
                setLoading(true);
                // Fetch runner profile and CCTV settings in parallel
                const [runnerRes, settingsRes] = await Promise.allSettled([
                    fetch(`/api/runner/${runnerId}`).then(r => r.json()),
                    fetch('/api/cctv-settings', { cache: 'no-store' }).then(r => r.json()),
                ]);

                // Process runner data
                if (runnerRes.status === 'fulfilled') {
                    const json = runnerRes.value;
                    if (json.status?.code === '200' && json.data) {
                        setRunner(json.data.runner);
                        setTimings(json.data.timingRecords || []);
                        setCampaign(json.data.campaign || null);
                        setCpMappings(json.data.checkpointMappings || []);
                        setCheckpointRanks(json.data.checkpointRanks || {});
                    } else {
                        setError(json.status?.description || 'Runner not found');
                    }
                } else {
                    setError('Failed to load runner');
                }

                // Process CCTV settings
                if (settingsRes.status === 'fulfilled') {
                    const settings = settingsRes.value;
                    const nextValue = Number(settings?.preArrivalBuffer);
                    if (Number.isFinite(nextValue) && nextValue >= 0) {
                        setPreArrivalBufferSeconds(nextValue);
                    }
                    const clipBuf = Number(settings?.clipBufferSeconds);
                    if (Number.isFinite(clipBuf) && clipBuf > 0) {
                        setClipBufferSeconds(clipBuf);
                    }
                    const preBuf = Number(settings?.clipPreBufferSeconds);
                    if (Number.isFinite(preBuf) && preBuf > 0) {
                        setClipPreBufferSeconds(preBuf);
                    }
                    if (typeof settings?.allowDownload === 'boolean') {
                        setAllowDownload(settings.allowDownload);
                    }
                }
            } catch (err: any) {
                setError(err.message || 'Failed to load runner');
            } finally {
                setLoading(false);
            }
        })();
    }, [runnerId]);

    // Compute this runner's AWARD (Overall / Age Group) the same way the public
    // event table and winner boards do — fetch the whole category pool, then run
    // the shared award algorithm and keep only this runner's result.
    useEffect(() => {
        if (!runner || !campaign?._id || !runner.category) { setAward(null); setBestOfProvince(null); setGunOverallRank(null); return; }
        let cancelled = false;
        (async () => {
            try {
                const params = new URLSearchParams({
                    campaignId: campaign._id,
                    category: runner.category,
                    limit: '10000',
                    skipStatusCounts: 'true',
                });
                const res = await fetch(`/api/runners/paged?${params.toString()}`, { cache: 'no-store' });
                if (!res.ok) { if (!cancelled) { setAward(null); setBestOfProvince(null); setGunOverallRank(null); } return; }
                const data = await res.json();
                const pool = Array.isArray(data?.data) ? data.data : [];
                // "Best of Province" — same top-N-per-gender local award as the board.
                const provinceLabel = bestOfProvinceAwardFor(runner._id, pool, !!campaign.bestOfProvinceEnabled, campaign.bestOfProvinces);
                if (!cancelled) setBestOfProvince(provinceLabel);
                const natSplit = isNationalitySplitCategory(campaign.separateOverallNationalityCategories, runner.category);
                const awards = computeAwardsForCategory(pool, {
                    overallDisplayCount: campaign.overallDisplayCount,
                    ageGroupDisplayCount: campaign.ageGroupDisplayCount,
                    excludeOverallFromAgeGroup: campaign.excludeOverallFromAgeGroup,
                    excludeOverallThaiFromAgeGroup: campaign.excludeOverallThaiFromAgeGroup,
                    excludeOverallForeignFromAgeGroup: campaign.excludeOverallForeignFromAgeGroup,
                    separateOverallByNationality: natSplit,
                });
                const overallRanks = computeOverallRanks(pool, { separateByNationality: natSplit });
                if (!cancelled) {
                    setAward(awards.get(runner._id) || null);
                    setGunOverallRank(overallRanks.get(runner._id) || null);
                }
            } catch { if (!cancelled) { setAward(null); setBestOfProvince(null); setGunOverallRank(null); } }
        })();
        return () => { cancelled = true; };
    }, [runner, campaign?._id, campaign?.overallDisplayCount, campaign?.ageGroupDisplayCount, campaign?.bestOfProvinceEnabled, campaign?.bestOfProvinces, campaign?.excludeOverallFromAgeGroup, campaign?.excludeOverallThaiFromAgeGroup, campaign?.excludeOverallForeignFromAgeGroup, campaign?.separateOverallNationalityCategories]);

    useEffect(() => {
        setFollowedRunners(loadFollowedRunners());
        return subscribeFollowedRunners(setFollowedRunners);
    }, []);

    useEffect(() => {
        setLookupLoaded(false);
        setLookupLoading(false);
        setRunnerHits([]);
        setSelectedCheckpointKey('');
        setSelectedVideoIsPortrait(false);
    }, [runnerId]);

    useEffect(() => {
        if (!runnerId) return;
        let cancelled = false;
        (async () => {
            try {
                setLookupLoading(true);
                const res = await fetch(`/api/runner/${runnerId}/cctv`, { cache: 'no-store' });
                const json = await res.json();
                if (cancelled) return;
                if (json.status?.code === '200') {
                    setRunnerHits(Array.isArray(json.data?.hits) ? json.data.hits : []);
                } else {
                    setRunnerHits([]);
                }
            } catch {
                if (!cancelled) setRunnerHits([]);
            } finally {
                if (!cancelled) {
                    setLookupLoaded(true);
                    setLookupLoading(false);
                }
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [runnerId]);

    useEffect(() => {
        if (!selectedCheckpointKey) return;

        const previousOverflow = document.body.style.overflow;
        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                setSelectedCheckpointKey('');
            }
        };

        document.body.style.overflow = 'hidden';
        window.addEventListener('keydown', handleKeyDown);

        return () => {
            document.body.style.overflow = previousOverflow;
            window.removeEventListener('keydown', handleKeyDown);
        };
    }, [selectedCheckpointKey]);

    if (loading) {
        return (
            <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f8fafc', fontFamily: "'Prompt', sans-serif" }}>
                <div style={{ textAlign: 'center' }}>
                    <div style={{ width: 40, height: 40, border: '3px solid #e2e8f0', borderTopColor: '#22c55e', borderRadius: '50%', animation: 'spin 1s linear infinite', margin: '0 auto 16px' }} />
                    <p style={{ color: '#94a3b8', fontSize: 14 }}>กำลังโหลด...</p>
                    <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
                </div>
            </div>
        );
    }

    if (error || !runner) {
        return (
            <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f8fafc', fontFamily: "'Prompt', sans-serif" }}>
                <div style={{ textAlign: 'center', padding: 32, background: '#fff', borderRadius: 16, boxShadow: '0 4px 24px rgba(0,0,0,0.08)', maxWidth: 400 }}>
                    <div style={{ fontSize: 48, marginBottom: 16 }}>😔</div>
                    <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 8, color: '#0f172a' }}>ไม่พบข้อมูลนักวิ่ง</h2>
                    <p style={{ color: '#94a3b8', marginBottom: 16 }}>{error}</p>
                    <button onClick={() => router.back()} style={{ padding: '8px 24px', borderRadius: 8, background: '#22c55e', color: '#fff', fontWeight: 600, border: 'none', cursor: 'pointer' }}>
                        ย้อนกลับ
                    </button>
                </div>
            </div>
        );
    }

    const statusInfo = getStatusLabel(runner.status);
    const genderLabel = runner.gender === 'M' ? 'Male' : runner.gender === 'F' ? 'Female' : runner.gender;
    const distanceVal = parseDistanceValue(runner.category);
    const displayName = language === 'th' && runner.firstNameTh
        ? `${runner.firstNameTh} ${runner.lastNameTh || ''}`.trim()
        : `${runner.firstName} ${runner.lastName}`.trim();

    const isFinished = runner.status === 'finished';

    // Sort timings by scanTime ascending so the table reflects real chronology.
    // `order` is unreliable when admin manually adds a checkpoint (the new record
    // gets a fresh sequence number that may slot in front of RaceTiger-synced rows
    // whose `order` starts at 1000+). Fall back to `order` only when scanTimes tie.
    const sortedTimings = [...timings].sort((a, b) => {
        const ta = a.scanTime ? new Date(a.scanTime).getTime() : 0;
        const tb = b.scanTime ? new Date(b.scanTime).getTime() : 0;
        if (ta !== tb) return ta - tb;
        return (a.order || 0) - (b.order || 0);
    });

    // Build a checkpoint-name → distanceFromStart lookup from the event mappings,
    // since RaceTiger does NOT store per-record distance on the timing entries.
    const cpDistMap = new Map<string, number>();
    for (const m of cpMappings) {
        const cp = typeof m.checkpointId === 'object' ? m.checkpointId : null;
        if (!cp?.name) continue;
        const dist = m.distanceFromStart ?? cp.kmCumulative;
        if (dist != null) cpDistMap.set(cp.name.trim().toLowerCase(), Number(dist));
    }
    const distFor = (cpName?: string): number | null => {
        if (!cpName) return null;
        const v = cpDistMap.get(cpName.trim().toLowerCase());
        return v == null ? null : v;
    };

    // Derive stat values: use runner document fields, fallback to timing records
    const finishTiming = sortedTimings.find(t => t.checkpoint?.toLowerCase().includes('finish'));
    const lastTiming = sortedTimings.length > 0 ? sortedTimings[sortedTimings.length - 1] : null;

    // Finish time: prefer runner fields, fallback to FINISH checkpoint timing
    const finishTime = runner.netTime || runner.gunTime || runner.elapsedTime
        || (finishTiming?.netTime || finishTiming?.elapsedTime || finishTiming?.gunTime)
        || (isFinished && lastTiming ? (lastTiming.netTime || lastTiming.elapsedTime || lastTiming.gunTime) : undefined);
    const finishTimeStr = runner.netTimeStr || runner.gunTimeStr || formatTime(finishTime);
    const targetBandLabel = isFinished ? computeTargetBandLabel(runner, campaign) : null;
    const pace = runner.netPace || runner.gunPace || '-';

    // Overall rank: prefer the gun-time placing computed from the category pool
    // (Overall = gun time — matches the /event RANK column), then the stored field,
    // then the FINISH checkpoint rank.
    const overallRank = gunOverallRank
        || runner.overallRank
        || (finishTiming ? checkpointRanks[finishTiming.checkpoint] : undefined)
        || (isFinished && lastTiming ? checkpointRanks[lastTiming.checkpoint] : undefined)
        || 0;

    // Gender/Category rank: use runner fields (no per-checkpoint gender rank available)
    const genderRank = runner.genderRank || runner.genderNetRank || 0;
    const categoryRank = runner.ageGroupRank || runner.ageGroupNetRank || runner.categoryRank || runner.categoryNetRank || 0;

    const runnerHitMap = new Map(runnerHits.map(hit => [normalizeCheckpoint(hit.checkpoint), hit]));
    const availableVideoCount = runnerHits.filter(hit => hit.recording).length;
    const isFollowedRunner = isRunnerFollowed(followedRunners, runner._id);

    const handleToggleFollow = () => {
        const next = toggleFollowedRunner(followedRunners, {
            runnerId: runner._id,
            eventKey: campaign?.slug || campaign?._id || runnerId,
            eventId: campaign?._id,
            runnerName: displayName,
            bib: runner.bib,
            campaignName: campaign?.name,
            category: runner.category,
            ageGroup: runner.ageGroup,
            gender: runner.gender,
            latestCheckpoint: runner.latestCheckpoint,
            followedAt: Date.now(),
        });

        setFollowedRunners(next);
        saveFollowedRunners(next);
    };

    // Build checkpoint rows from checkpoint mappings (fallback when no timing records)
    const checkpointRows = cpMappings
        .filter(m => typeof m.checkpointId === 'object' && m.checkpointId?.name)
        .sort((a, b) => (a.orderNum || 0) - (b.orderNum || 0))
        .map(m => {
            const cp = m.checkpointId as { _id: string; name: string; type: string; orderNum?: number; kmCumulative?: number };
            return {
                name: cp.name,
                type: cp.type,
                distanceFromStart: m.distanceFromStart ?? cp.kmCumulative ?? undefined,
                orderNum: m.orderNum,
            };
        });

    // Determine which checkpoints the runner has passed (based on latestCheckpoint)
    const latestCpName = runner.latestCheckpoint?.trim().toLowerCase() || '';
    let passedUpToIdx = -1;
    if (latestCpName) {
        passedUpToIdx = checkpointRows.findIndex(cp => cp.name.trim().toLowerCase() === latestCpName);
    }
    if (isFinished) {
        passedUpToIdx = checkpointRows.length - 1; // all checkpoints passed
    }

    // Find latest checkpoint index for timing records
    const latestCpIdx = sortedTimings.length - 1;
    const selectedTiming = selectedCheckpointKey
        ? sortedTimings.find(record => normalizeCheckpoint(record.checkpoint) === selectedCheckpointKey) || null
        : null;
    const selectedFallbackCheckpoint = selectedCheckpointKey
        ? checkpointRows.find(cp => normalizeCheckpoint(cp.name) === selectedCheckpointKey) || null
        : null;
    const selectedHit = selectedCheckpointKey ? runnerHitMap.get(selectedCheckpointKey) || null : null;
    const hasSelectedCheckpoint = selectedCheckpointKey !== '';
    const selectedCheckpointName = selectedTiming?.checkpoint || selectedFallbackCheckpoint?.name || selectedHit?.checkpoint || '';

    // A single timing scan may have multiple recordings (classic CCTV + Beta).
    // Default to the first one; user can switch via the tabs in the modal.
    const availableRecordings: RecordingInfo[] = selectedHit?.recordings?.length
        ? selectedHit.recordings
        : (selectedHit?.recording ? [selectedHit.recording] : []);
    const activeRecording: RecordingInfo | null =
        availableRecordings.find(r => r._id === selectedRecordingId)
        || availableRecordings[0]
        || null;
    const isBetaRecording = activeRecording?.source === 'beta';

    // Clip starts `clipPreBufferSeconds` BEFORE the scan (admin-configured: 5/10/15/20s)
    // and runs for `clipBufferSeconds` in total. The remainder plays AFTER the scan.
    // Example: pre-buffer 5s, duration 15s, scan at 09:00:00 → clip runs 08:59:55 → 09:00:10.
    // If pre-buffer ≥ total duration, the post window collapses to 1s so the scan is still in-frame.
    const seekSec = activeRecording?.seekSeconds ?? selectedHit?.seekSeconds ?? 0;
    const recDuration = activeRecording?.duration || 0;
    const totalLen = Math.max(1, clipBufferSeconds);
    const preLen = Math.min(Math.max(0, clipPreBufferSeconds), totalLen - 1);  // time BEFORE scan
    let clipStart = Math.max(0, seekSec - preLen);
    let clipEnd = clipStart + totalLen;
    // If the window runs past the end of the recording, slide it back so total length is preserved.
    if (recDuration > 0 && clipEnd > recDuration) {
        clipEnd = recDuration;
        clipStart = Math.max(0, clipEnd - totalLen);
    }
    const trimStart = clipStart;
    const trimDuration = Math.max(1, clipEnd - clipStart);

    // BOTH classic and beta go through the same backend trim endpoint. The backend
    // uses ffmpeg stream-copy + fragmented mp4 so playback starts within ~1s — no
    // re-encoding, and view/download share the same cached output.
    const streamUrl = activeRecording
        ? `/api/runner/${runnerId}/cctv/${activeRecording._id}/stream?ss=${trimStart}&t=${trimDuration}`
        : '';
    const downloadUrl = activeRecording && allowDownload
        ? `/api/runner/${runnerId}/cctv/${activeRecording._id}/stream?download=1&ss=${trimStart}&t=${trimDuration}`
        : '';

    const openCheckpointVideo = (checkpointKey: string) => {
        setSelectedVideoIsPortrait(false);
        setVideoBuffering(true);
        setSelectedCheckpointKey(checkpointKey);
        setSelectedRecordingId(''); // reset → first available recording
    };

    const closeCheckpointVideo = () => {
        setSelectedVideoIsPortrait(false);
        setVideoBuffering(false);
        setSelectedCheckpointKey('');
        setSelectedRecordingId('');
    };

    const handleDownloadCheckpointVideo = async () => {
        if (!downloadUrl || !activeRecording) return;
        try {
            setVideoDownloadLoading(true);
            const response = await fetch(downloadUrl, { cache: 'no-store' });
            if (!response.ok) throw new Error('Download failed');

            const blob = await response.blob();
            const contentType = response.headers.get('Content-Type') || blob.type || 'video/mp4';
            const ext = contentType.includes('mp4') ? 'mp4' : contentType.includes('webm') ? 'webm' : 'mp4';
            const dispName = getFileNameFromDisposition(response.headers.get('Content-Disposition'));
            const fallbackName = `runner-${runner?.bib || runnerId}-${normalizeCheckpoint(selectedCheckpointName || 'checkpoint').replace(/\s+/g, '-')}.${ext}`;
            const fileName = dispName || fallbackName;

            // Try Web Share API (mobile: offers "Save to Photos")
            const file = new File([blob], fileName, { type: contentType });
            const nav = navigator as Navigator & { canShare?: (d?: ShareData) => boolean };
            if (typeof nav.share === 'function' && typeof nav.canShare === 'function' && nav.canShare({ files: [file] })) {
                await nav.share({ files: [file], title: fileName });
                return;
            }

            // Fallback: create download link
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = fileName;
            a.style.display = 'none';
            document.body.appendChild(a);
            a.click();
            a.remove();
            setTimeout(() => URL.revokeObjectURL(url), 1000);
        } catch {
            // Final fallback: direct browser download
            const a = document.createElement('a');
            a.href = downloadUrl;
            a.download = '';
            a.rel = 'noopener';
            a.style.display = 'none';
            document.body.appendChild(a);
            a.click();
            setTimeout(() => a.remove(), 500);
        } finally {
            setVideoDownloadLoading(false);
        }
    };

    return (
        <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', background: '#f8fafc', fontFamily: "'Prompt', sans-serif", color: '#1e293b' }}>
            <style>{`
                @import url('https://fonts.googleapis.com/css2?family=Prompt:wght@300;400;500;600;700;800;900&display=swap');
                @keyframes pulseLive { 0% { transform: scale(0.9); opacity: 0.7; } 50% { transform: scale(1.2); opacity: 1; } 100% { transform: scale(0.9); opacity: 0.7; } }
                .live-dot { width: 10px; height: 8px; border-radius: 50%; display: inline-block; animation: pulseLive 1.5s infinite; border: 1.5px solid white; }
                .checkpoint-row:nth-child(even) { background-color: #f8fafc; }
                .runner-modal { width: min(1120px, 100%); height: min(820px, calc(100vh - 32px)); max-height: calc(100vh - 32px); overflow: hidden; display: flex; flex-direction: column; }
                .runner-modal.no-video { width: min(520px, 100%); height: auto; max-height: min(420px, calc(100vh - 32px)); }
                .runner-modal-header { padding: 18px 24px; border-bottom: 1px solid #e2e8f0; display: flex; justify-content: space-between; align-items: flex-start; gap: 16px; }
                .runner-modal-title { margin: 8px 0 0; font-size: 26px; font-weight: 900; color: #0f172a; }
                .runner-modal-body { flex: 1; min-height: 0; display: flex; flex-direction: column; justify-content: center; gap: 8px; padding: 12px 24px 14px; }
                .runner-modal-meta { margin-bottom: 0; font-size: 12px; color: #475569; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
                .runner-modal-video-area { margin-top: 0; display: flex; justify-content: center; align-items: center; flex: 1 1 auto; min-height: 0; }
                .runner-modal-video-shell { width: 100%; overflow: hidden; display: flex; justify-content: center; align-items: center; border-radius: 24px; border: 1px solid #0f172a; background: #020617; box-shadow: 0 20px 50px rgba(15,23,42,0.24); }
                .runner-modal-video-shell.portrait { width: fit-content; max-width: min(380px, 100%); background: transparent; }
                .runner-modal-video { width: 100%; display: block; background: #000; }
                .runner-modal-video.portrait { width: auto; max-width: 100%; height: 100%; max-height: min(62vh, 660px); aspect-ratio: auto; object-fit: contain; }
                .runner-modal-video.landscape { height: auto; max-height: min(58vh, 540px); aspect-ratio: 16 / 9; object-fit: contain; }
                .runner-modal-download-row { margin-top: 0; flex: 0 0 auto; display: flex; justify-content: center; }
                .runner-modal-empty { padding: 28px 24px 30px; text-align: center; }
                .runner-cert-desktop { display: flex; }
                .runner-cert-mobile { display: none !important; }
                @media (max-width: 640px) {
                    .runner-header { padding: 6px 10px !important; }
                    .runner-info-section { padding: 12px !important; gap: 12px !important; }
                    .runner-stats-grid { gap: 8px !important; margin-bottom: 12px !important; }
                    .runner-stat-card { padding: 10px !important; border-radius: 10px !important; }
                    .runner-stat-value { font-size: 18px !important; }
                    .runner-stat-label { font-size: 9px !important; }
                    .runner-main { padding: 10px 10px 24px !important; }
                    .runner-progress-bar { padding: 14px !important; margin-bottom: 12px !important; }
                    .runner-cp-table-header { padding: 10px 14px !important; }
                    .runner-actions { gap: 6px !important; margin-left: 0 !important; align-items: stretch !important; width: 100% !important; }
                    .runner-action-btn { width: 100% !important; padding: 8px 14px !important; font-size: 12px !important; min-width: 0 !important; min-height: 36px !important; border-radius: 10px !important; box-sizing: border-box !important; }
                    .runner-cert-desktop { display: none !important; }
                    .runner-cert-mobile { display: flex !important; }
                    .runner-footer { padding: 16px !important; margin-top: 16px !important; }
                    .runner-modal-overlay { padding: 8px !important; }
                    .runner-modal { width: 100% !important; height: calc(100vh - 16px) !important; max-height: calc(100vh - 16px) !important; border-radius: 20px !important; }
                    .runner-modal.no-video { width: min(400px, 100%) !important; height: auto !important; max-height: none !important; }
                    .runner-modal-header { padding: 14px 16px !important; gap: 12px !important; }
                    .runner-modal-title { margin-top: 4px !important; font-size: 20px !important; line-height: 1.05 !important; }
                    .runner-modal-close { width: 30px !important; height: 30px !important; font-size: 24px !important; }
                    .runner-modal-body { padding: 6px 14px 8px !important; gap: 4px !important; }
                    .runner-modal-meta { font-size: 11px !important; line-height: 1.35 !important; }
                    .runner-modal-video-shell { border-radius: 20px !important; }
                    .runner-modal-video-shell.portrait { width: fit-content !important; max-width: min(270px, calc(100vw - 72px)) !important; }
                    .runner-modal-video.portrait { height: 100% !important; max-height: calc(100vh - 280px) !important; }
                    .runner-modal-video.landscape { max-height: calc(100vh - 280px) !important; }
                    .runner-modal-download-row { margin-top: 0 !important; padding-top: 2px !important; }
                    .runner-modal-download { padding: 9px 18px !important; font-size: 13px !important; border-radius: 10px !important; }
                    .runner-modal-empty { padding: 24px 18px 26px !important; }
                }
            `}</style>

            {/* HEADER */}
            <header className="runner-header" style={{ background: '#fff', borderBottom: '1px solid #e2e8f0', padding: '10px 16px', boxShadow: '0 1px 3px rgba(0,0,0,0.04)', position: 'sticky', top: 0, zIndex: 50 }}>
                <div style={{ maxWidth: 1120, margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        <Link href="/" style={{ display: 'flex', alignItems: 'center', borderRight: '1px solid #e2e8f0', paddingRight: 12, textDecoration: 'none' }}>
                            <Image src="/logo-black.png" alt="ACTION" width={80} height={26} style={{ objectFit: 'contain' }} />
                        </Link>
                        <span style={{ fontSize: 18, fontWeight: 900, fontStyle: 'italic', color: '#0f172a' }}>
                            <span style={{ color: '#22c55e', fontWeight: 700, fontStyle: 'normal', textTransform: 'uppercase' }}>Live</span>
                        </span>
                    </div>
                    <button onClick={() => router.back()} style={{ fontSize: 12, fontWeight: 700, color: '#64748b', background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}>
                        ← กลับหน้าผลการแข่งขัน
                    </button>
                </div>
            </header>

            <main className="runner-main" style={{ flex: '1 0 auto', width: '100%', maxWidth: 1120, margin: '0 auto', padding: '16px 16px 32px' }}>
                {/* RUNNER INFO SECTION */}
                <section className="runner-info-section" style={{ display: 'flex', flexWrap: 'wrap', gap: 16, alignItems: 'center', background: '#fff', padding: 20, borderRadius: 16, border: 'none', boxShadow: 'none', marginBottom: 16 }}>
                    <div style={{ flex: 1, minWidth: 200 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4, minWidth: 0 }}>
                            <FitName style={{ color: '#0f172a' }} maxSize={28}>{displayName}</FitName>
                            {runner.status === 'in_progress' && <span className="live-dot" style={{ background: '#22c55e' }} title="Racing" />}
                        </div>
                        <p style={{ color: '#64748b', fontWeight: 700, fontSize: 14, margin: '4px 0', display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                            {runner.nationality && <span style={{ fontSize: 16 }}>{runner.nationality}</span>}
                            {runner.nationality && ' | '}
                            <span style={{ color: '#94a3b8' }}>BIB Number</span>
                            <span style={{ color: '#0f172a', fontWeight: 750 }}>{runner.bib}</span>
                            {runner.gender === 'F' ? (
                                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: '#db2777', fontWeight: 750 }}>
                                    <span style={{ fontSize: 16, lineHeight: 1 }}>♀</span>Female
                                </span>
                            ) : runner.gender === 'M' ? (
                                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: '#2563eb', fontWeight: 750 }}>
                                    <span style={{ fontSize: 16, lineHeight: 1 }}>♂</span>Male
                                </span>
                            ) : genderLabel}
                            {runner.ageGroup || ''}
                            | <span style={{ color: '#0f172a' }}>{runner.category}</span>
                        </p>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 8 }}>
                            <span style={{ background: statusInfo.bg, color: statusInfo.color, padding: '4px 12px', borderRadius: 20, fontSize: 12, fontWeight: 700, textTransform: 'uppercase' }}>{statusInfo.text}</span>
                            {runner.latestCheckpoint && (
                                <span style={{ background: '#f1f5f9', color: '#475569', padding: '4px 12px', borderRadius: 20, fontSize: 12, fontWeight: 700, textTransform: 'uppercase' }}>Last CP: {runner.latestCheckpoint}</span>
                            )}
                        </div>
                    </div>

                    {/* Desktop-only certificate slot — placed in the empty area to the LEFT of the actions column, matching the design in /admin/eslip2 follow-up spec. Hidden on mobile (cert button moves below E-Slip inside .runner-actions). */}
                    {isFinished && campaign?.isApproveCertificate && (
                        <div className="runner-cert-desktop" style={{ alignItems: 'center', justifyContent: 'center', minWidth: 220 }}>
                            <Link href={`/runner/${runnerId}/certificate`} className="runner-action-btn" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, background: '#2563eb', color: '#fff', padding: '12px 18px', borderRadius: 12, fontWeight: 700, fontSize: 13, textDecoration: 'none', border: 'none', cursor: 'pointer', minWidth: 220, minHeight: 56, width: '100%' }}>
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="12" y1="18" x2="12" y2="12" /><polyline points="9 15 12 18 15 15" /></svg>
                                ดาวน์โหลดใบประกาศ
                            </Link>
                        </div>
                    )}

                    <div className="runner-actions" style={{ display: 'flex', flexDirection: 'column', gap: 6, marginLeft: 'auto', alignItems: 'flex-end' }}>
                        <button
                            className="runner-action-btn"
                            type="button"
                            onClick={handleToggleFollow}
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                gap: 8,
                                background: isFollowedRunner ? '#e11d48' : '#0f172a',
                                color: '#fff',
                                padding: '8px 18px',
                                borderRadius: 10,
                                minWidth: 200,
                                minHeight: 38,
                                border: 'none',
                                cursor: 'pointer',
                                fontWeight: 800,
                                fontSize: 13,
                                width: '100%',
                            }}
                        >
                            <FollowHeartIcon filled={isFollowedRunner} size={16} color="#fff" />
                            <span>{isFollowedRunner ? 'กำลังติดตามนักวิ่ง' : 'ติดตามนักวิ่ง'}</span>
                        </button>
                        {isFinished ? (
                            <>
                                <Link href={`/runner/${runnerId}/eslip`} className="runner-action-btn" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, background: '#16a34a', color: '#fff', padding: '8px 18px', borderRadius: 10, fontWeight: 700, fontSize: 13, textDecoration: 'none', border: 'none', cursor: 'pointer', minWidth: 200, minHeight: 38, width: '100%' }}>
                                    Finished — ดู E-Slip
                                </Link>
                                {campaign?.isApproveCertificate && (
                                    <Link href={`/runner/${runnerId}/certificate`} className="runner-action-btn runner-cert-mobile" style={{ alignItems: 'center', justifyContent: 'center', gap: 6, background: '#2563eb', color: '#fff', padding: '8px 18px', borderRadius: 10, fontWeight: 700, fontSize: 13, textDecoration: 'none', border: 'none', cursor: 'pointer', minWidth: 200, minHeight: 38, width: '100%' }}>
                                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="12" y1="18" x2="12" y2="12" /><polyline points="9 15 12 18 15 15" /></svg>
                                        ดาวน์โหลดใบประกาศ
                                    </Link>
                                )}
                            </>
                        ) : (
                            <div className="runner-action-btn" style={{ background: '#f1f5f9', color: '#94a3b8', padding: '8px 14px', borderRadius: 10, fontWeight: 700, fontSize: 12, textAlign: 'center', border: '1px solid #e2e8f0' }}>
                                ยังไม่จบการแข่งขัน
                            </div>
                        )}
                    </div>
                </section>

                {/* STATS CARDS */}
                {/* Rank cards always stretch to fill the row: 3 equal columns when an age
                    group exists (Overall / Gender / Category), otherwise 2 equal columns
                    (Overall / Gender). Finish Time always spans the full width below. */}
                <div className="runner-stats-grid" style={{ display: 'grid', gridTemplateColumns: `repeat(${runner.ageGroup ? 3 : 2}, 1fr)`, gap: 10, marginBottom: 16 }}>
                    <div className="runner-stat-card" style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, padding: 12 }}>
                        <p className="runner-stat-label" style={{ fontSize: 9, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', marginBottom: 2 }}>Overall Rank</p>
                        <p className="runner-stat-value" style={{ fontSize: 20, fontWeight: 900, color: '#0f172a', margin: 0 }}>{overallRank || '-'} {runner.totalFinishers ? <small style={{ fontSize: 11, color: '#94a3b8', fontWeight: 700 }}>/ {runner.totalFinishers}</small> : null}</p>
                    </div>
                    <div className="runner-stat-card" style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, padding: 12 }}>
                        <p className="runner-stat-label" style={{ fontSize: 9, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', marginBottom: 2 }}>Gender Rank</p>
                        <p className="runner-stat-value" style={{ fontSize: 20, fontWeight: 900, color: '#0f172a', margin: 0 }}>{genderRank || '-'} {runner.genderFinishers ? <small style={{ fontSize: 11, color: '#94a3b8', fontWeight: 700 }}>/ {runner.genderFinishers}</small> : null}</p>
                    </div>
                    {/* Show CATEGORY RANK card only when this runner actually has an age group.
                        If the distance has no age groups configured, the card is hidden entirely. */}
                    {runner.ageGroup ? (
                        <div className="runner-stat-card" style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, padding: 12 }}>
                            <p className="runner-stat-label" style={{ fontSize: 9, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', marginBottom: 2 }}>Age Group Rank</p>
                            <p className="runner-stat-value" style={{ fontSize: 20, fontWeight: 900, color: '#0f172a', margin: 0 }}>{categoryRank || '-'} <small style={{ fontSize: 11, color: '#94a3b8', fontWeight: 700 }}>({runner.ageGroup})</small></p>
                        </div>
                    ) : null}
                    <div className="runner-stat-card" style={{ background: isFinished ? '#f0fdf4' : '#fff', border: `1px solid ${isFinished ? '#bbf7d0' : '#e2e8f0'}`, borderRadius: 12, padding: 12, gridColumn: '1 / -1', textAlign: 'center' }}>
                        <p className="runner-stat-label" style={{ fontSize: 9, fontWeight: 700, color: isFinished ? '#16a34a' : '#94a3b8', textTransform: 'uppercase', marginBottom: 2 }}>{isFinished ? 'Finish Time' : 'Elapsed'}</p>
                        <p className="runner-stat-value" style={{ fontSize: 20, fontWeight: 900, color: isFinished ? '#15803d' : '#0f172a', margin: 0 }}>{finishTimeStr}</p>
                    </div>
                    {/* SUB (target-time band) — the "sub XX" bracket this runner's finish time
                        falls into, mirroring the E-Slip. Spans full width below Finish Time. */}
                    {targetBandLabel && (
                        <div className="runner-stat-card" style={{ background: 'linear-gradient(135deg, #f0f9ff 0%, #e0f2fe 100%)', border: '1px solid #7dd3fc', borderRadius: 12, padding: 12, gridColumn: '1 / -1', textAlign: 'center', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                            <span style={{ fontSize: 18, lineHeight: 1 }}>🎯</span>
                            <div style={{ textAlign: 'left' }}>
                                <p className="runner-stat-label" style={{ fontSize: 9, fontWeight: 700, color: '#0284c7', textTransform: 'uppercase', marginBottom: 2 }}>Target</p>
                                <p className="runner-stat-value" style={{ fontSize: 20, fontWeight: 900, color: '#0369a1', margin: 0, textTransform: 'uppercase' }}>{targetBandLabel}</p>
                            </div>
                        </div>
                    )}
                </div>

                {/* AWARD — the prize this runner earns (Overall / Age Group), computed the
                    same way as the public event table + winner boards. Only shown when the
                    runner actually places into an award slot. Age Group placings also show
                    the runner's age group in parentheses. */}
                {((award && (award.overall || award.ageGroup)) || bestOfProvince) && (() => {
                    // "Best of <province>" leads (when earned), then the Overall / Age-group
                    // award — the two are separated by " | ".
                    const awardParts: string[] = [];
                    if (award?.overall) awardParts.push(formatOverallAwardLabel(award));
                    if (award?.ageGroup) awardParts.push(`Age Group ${award.ageGroup}${runner.ageGroup ? ` (${runner.ageGroup})` : ''}`);
                    const segments: string[] = [];
                    if (bestOfProvince) segments.push(bestOfProvince);
                    if (awardParts.length) segments.push(awardParts.join(', '));
                    return (
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12, marginBottom: 16, padding: '14px 16px', borderRadius: 12, background: 'linear-gradient(135deg, #fffbeb 0%, #fef3c7 100%)', border: '1px solid #fcd34d' }}>
                            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#b45309" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }} aria-hidden="true">
                                <path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6" />
                                <path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18" />
                                <path d="M4 22h16" />
                                <path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22" />
                                <path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22" />
                                <path d="M18 2H6v7a6 6 0 0 0 12 0V2Z" />
                            </svg>
                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}>
                                <span style={{ fontSize: 9, fontWeight: 700, color: '#b45309', textTransform: 'uppercase', letterSpacing: 1, lineHeight: 1.4 }}>Award</span>
                                <span style={{ fontSize: 18, fontWeight: 900, color: '#92400e', lineHeight: 1.2 }}>{segments.join(' | ')}</span>
                            </div>
                        </div>
                    );
                })()}

                {/* DISTANCE PROGRESS BAR — Marathon mode only */}
                {campaign?.displayMode !== 'lab' && checkpointRows.length > 0 && (() => {
                    const maxDist = checkpointRows.reduce((max, cp) => Math.max(max, cp.distanceFromStart || 0), 0);
                    const totalDist = distanceVal || maxDist || 0;
                    const currentDist = passedUpToIdx >= 0 && checkpointRows[passedUpToIdx]?.distanceFromStart != null
                        ? checkpointRows[passedUpToIdx].distanceFromStart!
                        : 0;
                    const pct = isFinished ? 100 : (totalDist > 0 ? Math.min(99, Math.round((currentDist / totalDist) * 100)) : 0);
                    return (
                        <div className="runner-progress-bar" style={{ background: '#fff', borderRadius: 16, border: '1px solid #e2e8f0', padding: 18, marginBottom: 16, boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 12 }}>
                                <h3 style={{ fontWeight: 900, textTransform: 'uppercase', fontSize: 13, letterSpacing: 2, color: '#64748b', margin: 0 }}>Distance Progress</h3>
                                <span style={{ fontSize: 20, fontWeight: 900, color: isFinished ? '#16a34a' : '#0f172a' }}>
                                    {isFinished ? `${totalDist} KM` : `${currentDist} / ${totalDist} KM`}
                                </span>
                            </div>
                            <div style={{ position: 'relative', height: 12, background: '#f1f5f9', borderRadius: 6, overflow: 'hidden' }}>
                                <div style={{
                                    height: '100%', borderRadius: 6, transition: 'width 0.5s ease',
                                    width: `${pct}%`,
                                    background: pct >= 100 ? '#22c55e'
                                        : pct > 75 ? 'linear-gradient(90deg, #334155 0%, #ef4444 33%, #eab308 66%, #22c55e 100%)'
                                            : pct > 50 ? 'linear-gradient(90deg, #334155 0%, #ef4444 50%, #eab308 100%)'
                                                : pct > 25 ? 'linear-gradient(90deg, #334155 0%, #ef4444 100%)'
                                                    : '#334155',
                                }} />
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8, fontSize: 10, fontWeight: 700, color: '#94a3b8' }}>
                                <span>0 KM</span>
                                <span style={{ color: isFinished ? '#16a34a' : '#64748b', fontWeight: 900 }}>{pct}%</span>
                                <span>{totalDist} KM</span>
                            </div>
                        </div>
                    );
                })()}

                {/* CHECKPOINT HISTORY TABLE — Marathon mode only */}
                {campaign?.displayMode !== 'lab' && <div style={{ background: '#fff', borderRadius: 16, border: '1px solid #e2e8f0', overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
                    <div className="runner-cp-table-header" style={{ padding: '12px 18px', borderBottom: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <h3 style={{ fontWeight: 900, textTransform: 'uppercase', fontSize: 12, letterSpacing: 2, color: '#64748b', margin: 0 }}>Checkpoint History</h3>
                        <span style={{ fontSize: 10, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', fontStyle: 'italic' }}>
                            {campaign?.name || 'Event'}
                        </span>
                    </div>
                    <div style={{ overflowX: 'auto' }}>
                        <table style={{ width: '100%', textAlign: 'left', borderCollapse: 'collapse', minWidth: 600 }}>
                            <thead>
                                <tr style={{ fontSize: 9, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '-0.02em', background: '#f8fafc' }}>
                                    <th style={{ padding: '8px 12px', width: '50px' }}>Rank</th>
                                    <th style={{ padding: '8px 12px' }}>Checkpoint</th>
                                    <th style={{ padding: '8px 6px' }}>Dist.</th>
                                    <th style={{ padding: '8px 6px' }}>Time</th>
                                    <th style={{ padding: '8px 6px' }}>Net</th>
                                    <th style={{ padding: '8px 6px' }}>Split</th>
                                    <th style={{ padding: '8px 12px', textAlign: 'right' }}>Pace</th>
                                </tr>
                            </thead>
                            <tbody>
                                {sortedTimings.length > 0 ? sortedTimings.map((record, i) => {
                                    const rowKey = normalizeCheckpoint(record.checkpoint);
                                    const rowHit = runnerHitMap.get(rowKey) || null;
                                    const rowHasVideo = !!rowHit?.recording;
                                    const isSelected = rowKey === selectedCheckpointKey;
                                    const isFinishCp = record.checkpoint?.toLowerCase().includes('finish');
                                    const isStartCp = record.checkpoint?.toLowerCase().includes('start');
                                    const isCurrent = i === latestCpIdx && !isFinished;
                                    const displayNetTime = record.netTime ?? record.elapsedTime;
                                    // RaceTiger does NOT store distance on timing records — look it up
                                    // from the event's checkpoint mappings (which carry kmCumulative).
                                    // Cap at the runner's own category distance so a 50km runner sharing
                                    // a FINISH checkpoint with 100km runners doesn't show 100 KM.
                                    const rawCumDist = record.distanceFromStart ?? distFor(record.checkpoint);
                                    const cumDist = (rawCumDist != null && distanceVal != null && rawCumDist > distanceVal) ? distanceVal : rawCumDist;
                                    const rawPrevCum = i > 0 ? (sortedTimings[i - 1].distanceFromStart ?? distFor(sortedTimings[i - 1].checkpoint)) : null;
                                    const prevCum = (rawPrevCum != null && distanceVal != null && rawPrevCum > distanceVal) ? distanceVal : rawPrevCum;
                                    const segDist = (record.legDistance != null && record.legDistance > 0)
                                        ? Math.round(record.legDistance * 100) / 100
                                        : (cumDist != null && prevCum != null)
                                            ? Math.round((cumDist - prevCum) * 100) / 100
                                            : null;

                                    // Pace: prefer values synced from RaceTiger; fall back to computed.
                                    // Use `cumDist` (record.distanceFromStart OR the event's checkpoint
                                    // mapping kmCumulative) so admin-added checkpoints without a stored
                                    // distance still get a pace.
                                    let segPace = '-';
                                    const importedPace = (record.netPace || record.splitPace || record.gunPace || '').trim();
                                    if (importedPace) {
                                        segPace = `${importedPace} /km`;
                                    } else if (cumDist != null && cumDist > 0 && displayNetTime && displayNetTime > 0) {
                                        const totalMin = displayNetTime / 60000;
                                        const paceMin = totalMin / cumDist;
                                        const pM = Math.floor(paceMin);
                                        const pS = Math.round((paceMin - pM) * 60);
                                        segPace = `${pM}:${pS.toString().padStart(2, '0')} /km`;
                                    }

                                    // Per-checkpoint rank and rank change
                                    const cpRank = checkpointRanks[record.checkpoint] ?? null;
                                    const prevCpName = i > 0 ? sortedTimings[i - 1].checkpoint : null;
                                    const prevRank = prevCpName ? (checkpointRanks[prevCpName] ?? null) : null;
                                    const rankDelta = (cpRank !== null && prevRank !== null) ? prevRank - cpRank : null;

                                    return (
                                        <tr
                                            key={record._id}
                                            className="checkpoint-row"
                                            onClick={() => openCheckpointVideo(rowKey)}
                                            title={rowHasVideo ? 'คลิกเพื่อดูวิดีโอ CCTV' : 'คลิกเพื่อดูรายละเอียด Checkpoint'}
                                            style={{ background: isSelected ? '#eff6ff' : isCurrent ? 'rgba(34,197,94,0.05)' : undefined, cursor: 'pointer' }}
                                        >
                                            <td style={{ padding: '10px 12px', fontWeight: 800, fontSize: 13, color: '#0f172a', whiteSpace: 'nowrap' }}>
                                                {isStartCp ? '-' : cpRank ?? '-'}
                                                {rankDelta !== null && rankDelta !== 0 && (
                                                    <span style={{ fontSize: 10, fontWeight: 700, marginLeft: 3, color: rankDelta > 0 ? '#16a34a' : '#dc2626' }}>
                                                        {rankDelta > 0 ? `▲${rankDelta}` : `▼${Math.abs(rankDelta)}`}
                                                    </span>
                                                )}
                                            </td>
                                            <td style={{ padding: '10px 12px', fontWeight: 700, fontSize: 12, color: isFinishCp ? '#0f172a' : isCurrent ? '#16a34a' : isStartCp ? '#94a3b8' : '#16a34a', display: 'flex', alignItems: 'center', gap: 6 }}>
                                                {isCurrent && <span style={{ fontSize: 10, background: '#16a34a', color: '#fff', padding: '1px 6px', borderRadius: 4 }}>Current</span>}
                                                <span>{record.checkpoint}</span>
                                                {rowHasVideo && <CheckpointCameraIcon onClick={() => openCheckpointVideo(rowKey)} size={24} />}
                                            </td>
                                            <td style={{ padding: '10px 6px', fontSize: 11, fontWeight: 700, color: '#64748b' }}>
                                                {cumDist != null || (segDist != null && segDist > 0) ? (
                                                    <div style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.2 }}>
                                                        {cumDist != null && <span>{cumDist} KM</span>}
                                                        {segDist != null && segDist > 0 && (
                                                            <span style={{ fontSize: 9, fontWeight: 600, color: '#94a3b8' }}>+{segDist} KM</span>
                                                        )}
                                                    </div>
                                                ) : '-'}
                                            </td>
                                            <td style={{ padding: '10px 6px', fontSize: 11, color: '#475569' }}>
                                                {formatTimeOfDay(record.scanTime)}
                                            </td>
                                            <td style={{ padding: '10px 6px', fontSize: 11, fontWeight: 800, color: isFinishCp ? '#16a34a' : '#0f172a' }}>
                                                {displayNetTime ? formatTime(displayNetTime) : (isStartCp ? '00:00:00' : '-')}
                                            </td>
                                            <td style={{ padding: '10px 6px', fontSize: 11, fontWeight: 700, color: '#64748b' }}>
                                                {record.splitTime ? formatTime(record.splitTime) : '-'}
                                            </td>
                                            <td style={{ padding: '10px 12px', textAlign: 'right', fontSize: 11, color: '#475569' }}>
                                                {isStartCp ? '--' : segPace}
                                            </td>
                                        </tr>
                                    );
                                }) : checkpointRows.length > 0 ? checkpointRows.map((cp, i) => {
                                    const rowKey = normalizeCheckpoint(cp.name);
                                    const rowHit = runnerHitMap.get(rowKey) || null;
                                    const rowHasVideo = !!rowHit?.recording;
                                    const isSelected = rowKey === selectedCheckpointKey;
                                    const passed = i <= passedUpToIdx;
                                    const isCurrent = i === passedUpToIdx && !isFinished;
                                    const isFinishCp = cp.type === 'finish';
                                    const isStartCp = cp.type === 'start';
                                    const cpRank = checkpointRanks[cp.name] ?? null;
                                    const prevDist = i > 0 ? checkpointRows[i - 1].distanceFromStart : null;
                                    const segDist = (cp.distanceFromStart != null && prevDist != null)
                                        ? Math.round((cp.distanceFromStart - prevDist) * 100) / 100
                                        : null;
                                    return (
                                        <tr
                                            key={`cp-${i}`}
                                            className="checkpoint-row"
                                            onClick={() => openCheckpointVideo(rowKey)}
                                            title={rowHasVideo ? 'คลิกเพื่อดูวิดีโอ CCTV' : 'คลิกเพื่อดูรายละเอียด Checkpoint'}
                                            style={{ background: isSelected ? '#eff6ff' : isCurrent ? 'rgba(34,197,94,0.05)' : undefined, opacity: passed ? 1 : 0.4, cursor: 'pointer' }}
                                        >
                                            <td style={{ padding: '10px 12px', fontWeight: 800, fontSize: 13, color: passed ? '#0f172a' : '#cbd5e1' }}>
                                                {isStartCp ? '-' : (passed && cpRank ? cpRank : '-')}
                                            </td>
                                            <td style={{ padding: '10px 12px', fontWeight: 700, fontSize: 12, display: 'flex', alignItems: 'center', gap: 6, color: passed ? (isFinishCp ? '#0f172a' : '#16a34a') : '#cbd5e1' }}>
                                                {isCurrent && <span style={{ fontSize: 10, background: '#16a34a', color: '#fff', padding: '1px 6px', borderRadius: 4 }}>Current</span>}
                                                {passed && !isCurrent && <span style={{ color: '#22c55e', fontSize: 14 }}>✓</span>}
                                                {!passed && <span style={{ color: '#cbd5e1', fontSize: 14 }}>○</span>}
                                                <span>{cp.name}</span>
                                                {rowHasVideo && <CheckpointCameraIcon onClick={() => openCheckpointVideo(rowKey)} size={24} />}
                                            </td>
                                            <td style={{ padding: '10px 6px', fontSize: 11, fontWeight: 700, color: passed ? '#64748b' : '#cbd5e1' }}>
                                                {cp.distanceFromStart != null ? (
                                                    <div style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.2 }}>
                                                        <span>{cp.distanceFromStart} KM</span>
                                                        {segDist != null && segDist > 0 && (
                                                            <span style={{ fontSize: 9, fontWeight: 600, color: passed ? '#94a3b8' : '#cbd5e1' }}>+{segDist} KM</span>
                                                        )}
                                                    </div>
                                                ) : '-'}
                                            </td>
                                            <td style={{ padding: '10px 6px', fontSize: 11, color: '#cbd5e1' }}>-</td>
                                            <td style={{ padding: '10px 6px', fontSize: 11, fontWeight: 800, color: passed && isFinishCp ? '#16a34a' : passed ? '#0f172a' : '#cbd5e1' }}>
                                                {passed && isFinished && isFinishCp ? finishTimeStr : '-'}
                                            </td>
                                            <td style={{ padding: '10px 6px', fontSize: 11, color: '#cbd5e1' }}>-</td>
                                            <td style={{ padding: '10px 12px', textAlign: 'right', fontSize: 11, color: '#cbd5e1' }}>
                                                {isStartCp ? '--' : '-'}
                                            </td>
                                        </tr>
                                    );
                                }) : (
                                    <tr>
                                        <td colSpan={7} style={{ padding: '48px 24px', textAlign: 'center', color: '#94a3b8', fontSize: 14 }}>
                                            {runner.status === 'not_started' ? 'ยังไม่เริ่มวิ่ง' : 'ไม่มีข้อมูล Checkpoint'}
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>}

                {campaign?.displayMode !== 'lab' && hasSelectedCheckpoint && (
                    <div
                        onClick={closeCheckpointVideo}
                        className="runner-modal-overlay"
                        style={{ position: 'fixed', inset: 0, zIndex: 120, background: 'rgba(15,23,42,0.72)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
                    >
                        <div
                            onClick={(event) => event.stopPropagation()}
                            className={`runner-modal ${activeRecording ? 'has-video' : 'no-video'}`}
                            style={{ background: '#fff', borderRadius: 24, border: '1px solid rgba(226,232,240,0.9)', boxShadow: '0 24px 80px rgba(15,23,42,0.38)' }}
                        >
                            <div className="runner-modal-header">
                                <div>
                                    <div style={{ fontSize: 11, fontWeight: 900, letterSpacing: 1.6, textTransform: 'uppercase', color: '#64748b' }}>Checkpoint CCTV</div>
                                    <h3 className="runner-modal-title">{selectedCheckpointName || 'Checkpoint Video'}</h3>
                                </div>
                                <button
                                    type="button"
                                    onClick={closeCheckpointVideo}
                                    aria-label="ปิดหน้าต่างวิดีโอ CCTV"
                                    className="runner-modal-close"
                                    style={{ border: 'none', background: 'transparent', color: '#0f172a', width: 36, height: 36, borderRadius: 999, cursor: 'pointer', fontSize: 28, fontWeight: 400, lineHeight: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0 }}
                                >
                                    ✕
                                </button>
                            </div>

                            {lookupLoading || !lookupLoaded ? (
                                <div style={{ padding: '40px 24px', textAlign: 'center', color: '#64748b', fontSize: 14 }}>
                                    กำลังค้นหาวิดีโอ CCTV ที่ตรงกับเวลาผ่านจุดของนักวิ่ง...
                                </div>
                            ) : activeRecording ? (
                                <div className="runner-modal-body">
                                    {/* Source tabs — shown only when both classic + beta recordings exist for this scan */}
                                    {availableRecordings.length > 1 && (
                                        <div style={{ display: 'flex', gap: 6, padding: '0 0 12px', borderBottom: '1px solid #e2e8f0', marginBottom: 12 }}>
                                            {availableRecordings.map((r) => {
                                                const isActive = r._id === activeRecording._id;
                                                const isBeta = r.source === 'beta';
                                                return (
                                                    <button
                                                        key={r._id}
                                                        onClick={() => { setVideoBuffering(true); setSelectedRecordingId(r._id); }}
                                                        style={{
                                                            padding: '6px 14px',
                                                            borderRadius: 8,
                                                            border: isActive ? `2px solid ${isBeta ? '#7c3aed' : '#0ea5e9'}` : '1px solid #e2e8f0',
                                                            background: isActive ? (isBeta ? '#f5f3ff' : '#eff6ff') : '#fff',
                                                            color: isActive ? (isBeta ? '#5b21b6' : '#0c4a6e') : '#475569',
                                                            fontSize: 12,
                                                            fontWeight: 700,
                                                            cursor: 'pointer',
                                                        }}
                                                    >
                                                        {isBeta ? '📱 Mobile (Larix/IRL)' : '📹 CCTV'}
                                                        <span style={{ marginLeft: 6, fontWeight: 400, fontSize: 10, color: isActive ? 'inherit' : '#94a3b8' }}>
                                                            {r.cameraName}
                                                        </span>
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    )}

                                    <div className="runner-modal-meta">
                                        {isBetaRecording && (
                                            <span style={{ display: 'inline-block', marginRight: 8, padding: '2px 8px', borderRadius: 10, background: '#f5f3ff', color: '#7c3aed', fontSize: 10, fontWeight: 700 }}>
                                                BETA · {activeRecording.protocol?.toUpperCase() || 'HLS'}
                                            </span>
                                        )}
                                        กล้อง <strong style={{ color: '#0f172a' }}>{activeRecording.cameraName}</strong> · เวลาในระบบ <strong style={{ color: '#0f172a' }}>{formatTimeOfDay(selectedHit?.scanTime || '')}</strong> · เริ่มไฟล์ <strong style={{ color: '#0f172a' }}>{formatDateTime(activeRecording.startTime)}</strong>
                                    </div>

                                    <div className="runner-modal-video-area">
                                        <div
                                            className={`runner-modal-video-shell ${selectedVideoIsPortrait ? 'portrait' : 'landscape'}`}
                                            style={{ position: 'relative' }}
                                        >
                                        {videoBuffering && (
                                            <div style={{ position: 'absolute', inset: 0, zIndex: 10, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: 'rgba(2,6,23,0.82)', borderRadius: 'inherit', gap: 10 }}>
                                                <div style={{ width: 36, height: 36, border: '3px solid #334155', borderTopColor: '#22c55e', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
                                                <span style={{ color: '#94a3b8', fontSize: 13, fontWeight: 600 }}>กำลังเตรียมวิดีโอ...</span>
                                            </div>
                                        )}
                                        {/* Both classic and beta clips are now served as plain trimmed mp4 from
                                            the backend trim endpoint, so a single <video> works for everything.
                                            The video already starts at the trim window — no manual currentTime seek. */}
                                        <video
                                            key={`${activeRecording._id}-${trimStart}-${trimDuration}`}
                                            src={streamUrl}
                                            controls
                                            preload="auto"
                                            autoPlay
                                            muted
                                            playsInline
                                            controlsList={allowDownload ? undefined : 'nodownload noplaybackrate'}
                                            disablePictureInPicture={!allowDownload}
                                            onContextMenu={(e) => { if (!allowDownload) e.preventDefault(); }}
                                            className={`runner-modal-video ${selectedVideoIsPortrait ? 'portrait' : 'landscape'}`}
                                            onLoadedMetadata={(event) => {
                                                const video = event.currentTarget;
                                                setSelectedVideoIsPortrait(video.videoHeight > video.videoWidth);
                                                video.play().catch(() => { /* autoplay blocked */ });
                                            }}
                                            onCanPlay={() => setVideoBuffering(false)}
                                            onWaiting={() => setVideoBuffering(true)}
                                            onPlaying={() => setVideoBuffering(false)}
                                            onError={() => setVideoBuffering(false)}
                                        />
                                        </div>
                                    </div>

                                    {downloadUrl && (
                                        <div className="runner-modal-download-row">
                                            <button
                                                type="button"
                                                onClick={handleDownloadCheckpointVideo}
                                                disabled={videoDownloadLoading}
                                                className="runner-modal-download"
                                                style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', background: videoDownloadLoading ? '#86efac' : '#16a34a', color: '#fff', padding: '10px 20px', borderRadius: 12, fontWeight: 700, fontSize: 14, textDecoration: 'none', border: 'none', cursor: videoDownloadLoading ? 'wait' : 'pointer' }}
                                            >
                                                {videoDownloadLoading ? 'กำลังเตรียมวิดีโอ...' : 'บันทึกวิดีโอจุดนี้'}
                                            </button>
                                        </div>
                                    )}
                                </div>
                            ) : (
                                <div className="runner-modal-empty">
                                    <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 16 }}>
                                        <Image src="/Camera.png" alt="CCTV" width={56} height={56} style={{ width: 56, height: 56, objectFit: 'contain' }} />
                                    </div>
                                    <div style={{ fontSize: 22, fontWeight: 900, color: '#0f172a' }}>ยังไม่พบวิดีโอ CCTV ของนักวิ่งคนนี้</div>
                                    <p style={{ margin: '10px auto 0', maxWidth: 520, fontSize: 14, color: '#64748b' }}>Checkpoint ที่คุณเลือกยังไม่มีไฟล์วิดีโอที่ตรงกับช่วงเวลาของนักวิ่งคนนี้ในตอนนี้</p>
                                </div>
                            )}
                        </div>
                    </div>
                )}

                {campaign?.displayMode === 'lab' && sortedTimings.length > 1 && (() => {
                    const laps = sortedTimings.map((rec, i) => {
                        const lapNum = i;
                        const lapTimeMs = rec.splitTime || 0;
                        const lapMin = lapTimeMs > 0 ? lapTimeMs / 60000 : 0;
                        // Lap pace (assume ~1 lap distance; user can interpret)
                        let lapPaceStr = '-';
                        if (lapMin > 0) {
                            const pM = Math.floor(lapMin);
                            const pS = Math.round((lapMin - pM) * 60);
                            lapPaceStr = `${pM.toString().padStart(2, '0')}:${pS.toString().padStart(2, '0')}`;
                        }
                        return { lapNum, record: rec, lapTimeMs, lapPaceStr };
                    });
                    const validLapTimes = laps.filter(l => l.lapTimeMs > 0).map(l => l.lapTimeMs);
                    const bestLap = validLapTimes.length > 0 ? Math.min(...validLapTimes) : 0;
                    const avgLap = validLapTimes.length > 0 ? validLapTimes.reduce((a, b) => a + b, 0) / validLapTimes.length : 0;

                    return (
                        <div style={{ background: '#fff', borderRadius: 16, border: '1px solid #e2e8f0', overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.04)', marginTop: 24 }}>
                            <div style={{ padding: '16px 24px', borderBottom: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <h3 style={{ fontWeight: 900, textTransform: 'uppercase', fontSize: 13, letterSpacing: 2, color: '#8b5cf6', margin: 0 }}>
                                    Lap Results
                                </h3>
                                <div style={{ display: 'flex', gap: 16, fontSize: 11, fontWeight: 700, color: '#64748b' }}>
                                    <span>Laps: <strong style={{ color: '#0f172a' }}>{sortedTimings.length}</strong></span>
                                    {bestLap > 0 && <span>Best: <strong style={{ color: '#16a34a' }}>{formatTime(bestLap)}</strong></span>}
                                    {avgLap > 0 && <span>Avg: <strong style={{ color: '#0f172a' }}>{formatTime(Math.round(avgLap))}</strong></span>}
                                </div>
                            </div>
                            <div style={{ overflowX: 'auto' }}>
                                <table style={{ width: '100%', textAlign: 'left', borderCollapse: 'collapse', minWidth: 500 }}>
                                    <thead>
                                        <tr style={{ fontSize: 10, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', background: '#faf5ff' }}>
                                            <th style={{ padding: '12px 24px', width: '8%' }}>Lap</th>
                                            <th style={{ padding: '12px 8px' }}>Pass Time</th>
                                            <th style={{ padding: '12px 8px' }}>Lap Time</th>
                                            <th style={{ padding: '12px 8px' }}>Lap Pace</th>
                                            <th style={{ padding: '12px 8px' }}>Elapsed</th>
                                            <th style={{ padding: '12px 24px', textAlign: 'right' }}>Checkpoint</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {laps.map((lap) => {
                                            const isBest = lap.lapTimeMs > 0 && lap.lapTimeMs === bestLap;
                                            return (
                                                <tr key={lap.lapNum} className="checkpoint-row" style={{ background: isBest ? 'rgba(34,197,94,0.04)' : undefined }}>
                                                    <td style={{ padding: '14px 24px', fontWeight: 800, fontSize: 16, color: '#0f172a' }}>
                                                        {lap.lapNum}
                                                    </td>
                                                    <td style={{ padding: '14px 8px', fontSize: 12, color: '#475569', fontFamily: 'monospace' }}>
                                                        {formatTimeOfDay(lap.record.scanTime)}
                                                    </td>
                                                    <td style={{ padding: '14px 8px', fontSize: 13, fontWeight: 700, fontFamily: 'monospace', color: isBest ? '#16a34a' : '#0f172a' }}>
                                                        {lap.lapTimeMs > 0 ? formatTime(lap.lapTimeMs) : '-'}
                                                        {isBest && <span style={{ marginLeft: 6, fontSize: 9, background: '#dcfce7', color: '#16a34a', padding: '1px 5px', borderRadius: 3, fontWeight: 800 }}>BEST</span>}
                                                    </td>
                                                    <td style={{ padding: '14px 8px', fontSize: 12, fontWeight: 700, fontFamily: 'monospace', color: '#8b5cf6' }}>
                                                        {lap.lapPaceStr}
                                                    </td>
                                                    <td style={{ padding: '14px 8px', fontSize: 12, fontFamily: 'monospace', color: '#64748b' }}>
                                                        {(lap.record.elapsedTime || lap.record.netTime) ? formatTime(lap.record.elapsedTime || lap.record.netTime) : '-'}
                                                    </td>
                                                    <td style={{ padding: '14px 24px', textAlign: 'right', fontSize: 11, color: '#94a3b8', fontWeight: 600 }}>
                                                        {lap.record.checkpoint}
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    );
                })()}
            </main>

            <footer className="runner-footer" style={{ padding: 24, textAlign: 'center', background: '#fff', borderTop: '1px solid #f1f5f9', marginTop: 0 }}>
                <p style={{ fontSize: 10, fontWeight: 700, color: '#cbd5e1', textTransform: 'uppercase', letterSpacing: 3 }}>ACTION TIMING © 2026</p>
            </footer>
        </div>
    );
}
