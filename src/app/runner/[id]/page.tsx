'use client';

import { useState, useEffect, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import { isRunnerFollowed, loadFollowedRunners, saveFollowedRunners, subscribeFollowedRunners, toggleFollowedRunner, type FollowedRunner } from '@/lib/followed-runners';


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
    netTime?: number;
    gunTime?: number;
    order?: number;
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
}

interface CheckpointMappingData {
    _id: string;
    checkpointId: { _id: string; name: string; type: string; orderNum?: number; kmCumulative?: number } | string;
    eventId: string;
    orderNum: number;
    distanceFromStart?: number;
    active?: boolean;
}

interface RunnerHit {
    checkpoint: string;
    scanTime: string;
    elapsedTime: number | null;
    splitTime: number | null;
    recording: {
        _id: string;
        cameraName: string;
        checkpointName?: string;
        startTime: string;
        endTime?: string | null;
        duration: number;
        fileSize: number;
        recordingStatus?: string;
    } | null;
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
    useEffect(() => {
        const el = ref.current;
        if (!el) return;
        let size = maxSize;
        el.style.fontSize = `${size}px`;
        while (el.scrollWidth > el.clientWidth && size > 14) {
            size--;
            el.style.fontSize = `${size}px`;
        }
    }, [children, maxSize]);
    return <div ref={ref} style={{ ...style, whiteSpace: 'nowrap', overflow: 'hidden', width: '100%', fontSize: maxSize, fontWeight: 900, textTransform: 'uppercase' as const }} className={className}>{children}</div>;
}

export default function RunnerProfilePage() {
    const params = useParams();
    const router = useRouter();
    const runnerId = params.id as string;

    const [runner, setRunner] = useState<RunnerData | null>(null);
    const [timings, setTimings] = useState<TimingRecord[]>([]);
    const [campaign, setCampaign] = useState<CampaignData | null>(null);
    const [cpMappings, setCpMappings] = useState<CheckpointMappingData[]>([]);
    const [checkpointRanks, setCheckpointRanks] = useState<Record<string, number>>({});
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [lookupLoading, setLookupLoading] = useState(false);
    const [lookupLoaded, setLookupLoaded] = useState(false);
    const [runnerHits, setRunnerHits] = useState<RunnerHit[]>([]);
    const [selectedCheckpointKey, setSelectedCheckpointKey] = useState('');
    const [preArrivalBufferSeconds, setPreArrivalBufferSeconds] = useState(5);
    const [followedRunners, setFollowedRunners] = useState<FollowedRunner[]>([]);
    const [selectedVideoIsPortrait, setSelectedVideoIsPortrait] = useState(false);

    useEffect(() => {
        if (!runnerId) return;
        (async () => {
            try {
                setLoading(true);
                const res = await fetch(`/api/runner/${runnerId}`);
                const json = await res.json();
                if (json.status?.code === '200' && json.data) {
                    setRunner(json.data.runner);
                    setTimings(json.data.timingRecords || []);
                    setCampaign(json.data.campaign || null);
                    setCpMappings(json.data.checkpointMappings || []);
                    setCheckpointRanks(json.data.checkpointRanks || {});
                } else {
                    setError(json.status?.description || 'Runner not found');
                }
            } catch (err: any) {
                setError(err.message || 'Failed to load runner');
            } finally {
                setLoading(false);
            }
        })();
    }, [runnerId]);

    useEffect(() => {
        fetch('/api/cctv-settings', { cache: 'no-store' })
            .then((response) => response.json())
            .then((settings) => {
                const nextValue = Number(settings?.preArrivalBuffer);
                if (Number.isFinite(nextValue) && nextValue >= 0) {
                    setPreArrivalBufferSeconds(nextValue);
                }
            })
            .catch(() => {});
    }, []);

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
    const finishTime = runner.netTime || runner.gunTime || runner.elapsedTime;
    const finishTimeStr = runner.netTimeStr || runner.gunTimeStr || formatTime(finishTime);
    const pace = runner.netPace || runner.gunPace || '-';
    const displayName = `${runner.firstName} ${runner.lastName}`.trim();
    const initials = ((runner.firstName?.[0] || '') + (runner.lastName?.[0] || '')).toUpperCase() || '?';

    const isFinished = runner.status === 'finished';

    // Sort timings by order
    const sortedTimings = [...timings].sort((a, b) => (a.order || 0) - (b.order || 0));
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
    const videoSeekSeconds = Math.max(0, (selectedHit?.seekSeconds || 0) - preArrivalBufferSeconds);
    const streamUrl = selectedHit?.recording
        ? `/api/runner/${runnerId}/cctv/${selectedHit.recording._id}/stream`
        : '';
    const downloadUrl = selectedHit?.recording
        ? `/api/runner/${runnerId}/cctv/${selectedHit.recording._id}/stream?download=1`
        : '';

    const openCheckpointVideo = (checkpointKey: string) => {
        setSelectedVideoIsPortrait(false);
        setSelectedCheckpointKey(checkpointKey);
    };

    const closeCheckpointVideo = () => {
        setSelectedVideoIsPortrait(false);
        setSelectedCheckpointKey('');
    };

    return (
        <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', background: '#f8fafc', fontFamily: "'Prompt', sans-serif", color: '#1e293b' }}>
            <style>{`
                @import url('https://fonts.googleapis.com/css2?family=Prompt:wght@300;400;500;600;700;800;900&display=swap');
                @keyframes pulseLive { 0% { transform: scale(0.9); opacity: 0.7; } 50% { transform: scale(1.2); opacity: 1; } 100% { transform: scale(0.9); opacity: 0.7; } }
                .live-dot { width: 10px; height: 8px; border-radius: 50%; display: inline-block; animation: pulseLive 1.5s infinite; border: 1.5px solid white; }
                .checkpoint-row:nth-child(even) { background-color: #f8fafc; }
                .runner-modal { width: min(1120px, 100%); height: min(820px, calc(100vh - 32px)); max-height: calc(100vh - 32px); overflow: hidden; display: flex; flex-direction: column; }
                .runner-modal-header { padding: 18px 24px; border-bottom: 1px solid #e2e8f0; display: flex; justify-content: space-between; align-items: flex-start; gap: 16px; }
                .runner-modal-title { margin: 8px 0 0; font-size: 26px; font-weight: 900; color: #0f172a; }
                .runner-modal-body { flex: 1; min-height: 0; display: flex; flex-direction: column; justify-content: space-between; gap: 16px; padding: 20px 24px 22px; }
                .runner-modal-meta { margin-bottom: 0; font-size: 12px; color: #475569; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
                .runner-modal-video-area { margin-top: 0; display: flex; justify-content: center; align-items: center; flex: 1; min-height: 0; }
                .runner-modal-video-shell { width: 100%; overflow: hidden; display: flex; justify-content: center; align-items: center; border-radius: 24px; border: 1px solid #0f172a; background: #020617; box-shadow: 0 20px 50px rgba(15,23,42,0.24); }
                .runner-modal-video-shell.portrait { width: fit-content; max-width: min(380px, 100%); background: transparent; }
                .runner-modal-video { width: 100%; display: block; background: #000; }
                .runner-modal-video.portrait { width: auto; max-width: 100%; height: auto; max-height: min(58vh, 620px); aspect-ratio: auto; object-fit: contain; }
                .runner-modal-video.landscape { height: auto; max-height: min(58vh, 540px); aspect-ratio: 16 / 9; object-fit: contain; }
                .runner-modal-download-row { margin-top: 0; display: flex; justify-content: center; }
                @media (max-width: 640px) {
                    .runner-header { padding: 6px 10px !important; }
                    .runner-info-section { padding: 12px !important; gap: 12px !important; }
                    .runner-avatar { width: 56px !important; height: 56px !important; font-size: 20px !important; border-radius: 12px !important; }
                    .runner-bib-badge { font-size: 11px !important; padding: 1px 6px !important; bottom: -4px !important; right: -4px !important; }
                    .runner-stats-grid { gap: 8px !important; margin-bottom: 12px !important; }
                    .runner-stat-card { padding: 10px !important; border-radius: 10px !important; }
                    .runner-stat-value { font-size: 18px !important; }
                    .runner-stat-label { font-size: 9px !important; }
                    .runner-main { padding: 10px 10px 24px !important; }
                    .runner-progress-bar { padding: 14px !important; margin-bottom: 12px !important; }
                    .runner-cp-table-header { padding: 10px 14px !important; }
                    .runner-actions { gap: 6px !important; }
                    .runner-action-btn { padding: 8px 14px !important; font-size: 12px !important; min-width: auto !important; min-height: 36px !important; border-radius: 10px !important; }
                    .runner-footer { padding: 16px !important; margin-top: 16px !important; }
                    .runner-modal-overlay { padding: 8px !important; }
                    .runner-modal { width: 100% !important; height: calc(100vh - 16px) !important; max-height: calc(100vh - 16px) !important; border-radius: 20px !important; }
                    .runner-modal-header { padding: 14px 16px !important; gap: 12px !important; }
                    .runner-modal-title { margin-top: 4px !important; font-size: 20px !important; line-height: 1.05 !important; }
                    .runner-modal-close { width: 30px !important; height: 30px !important; font-size: 24px !important; }
                    .runner-modal-body { padding: 12px 14px 14px !important; gap: 10px !important; }
                    .runner-modal-meta { font-size: 11px !important; line-height: 1.35 !important; }
                    .runner-modal-video-shell { border-radius: 20px !important; }
                    .runner-modal-video-shell.portrait { width: fit-content !important; max-width: min(270px, calc(100vw - 72px)) !important; }
                    .runner-modal-video.portrait { max-height: calc(100vh - 340px) !important; }
                    .runner-modal-video.landscape { max-height: calc(100vh - 320px) !important; }
                    .runner-modal-download { padding: 9px 18px !important; font-size: 13px !important; border-radius: 10px !important; }
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
                <section className="runner-info-section" style={{ display: 'flex', flexWrap: 'wrap', gap: 16, alignItems: 'center', background: '#fff', padding: 20, borderRadius: 16, border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.04)', marginBottom: 16 }}>
                    <div style={{ position: 'relative' }}>
                        <div className="runner-avatar" style={{ width: 72, height: 72, borderRadius: 14, background: '#22c55e', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 26, fontWeight: 800, boxShadow: '0 4px 12px rgba(0,0,0,0.1)', border: '3px solid #fff' }}>
                            {initials}
                        </div>
                        <span className="runner-bib-badge" style={{ position: 'absolute', bottom: -5, right: -5, background: '#0f172a', color: '#fff', padding: '1px 8px', borderRadius: 6, fontSize: 13, fontWeight: 800, border: '2px solid #fff', boxShadow: '0 0 0 1px #000, 0 4px 6px rgba(0,0,0,0.1)' }}>
                            {runner.bib}
                        </span>
                    </div>

                    <div style={{ flex: 1, minWidth: 200 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
                            <FitName style={{ color: '#0f172a' }} maxSize={28}>{displayName}</FitName>
                            {runner.status === 'in_progress' && <span className="live-dot" style={{ background: '#22c55e' }} title="Racing" />}
                        </div>
                        <p style={{ color: '#64748b', fontWeight: 700, fontSize: 14, margin: '4px 0', display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                            {runner.nationality && <span style={{ fontSize: 16 }}>{runner.nationality}</span>}
                            {runner.nationality && ' | '}
                            {genderLabel} {runner.ageGroup || ''} | <span style={{ color: '#0f172a' }}>{runner.category}</span>
                        </p>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 8 }}>
                            <span style={{ background: statusInfo.bg, color: statusInfo.color, padding: '4px 12px', borderRadius: 20, fontSize: 12, fontWeight: 700, textTransform: 'uppercase' }}>{statusInfo.text}</span>
                            {runner.latestCheckpoint && (
                                <span style={{ background: '#f1f5f9', color: '#475569', padding: '4px 12px', borderRadius: 20, fontSize: 12, fontWeight: 700, textTransform: 'uppercase' }}>Last CP: {runner.latestCheckpoint}</span>
                            )}
                        </div>
                    </div>

                    <div className="runner-actions" style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                        <button
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
                            }}
                        >
                            <FollowHeartIcon filled={isFollowedRunner} size={16} color="#fff" />
                            <span>{isFollowedRunner ? 'กำลังติดตามนักวิ่ง' : 'ติดตามนักวิ่ง'}</span>
                        </button>
                        {isFinished ? (
                            <>
                                <Link href={`/runner/${runnerId}/eslip`} className="runner-action-btn" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, background: '#16a34a', color: '#fff', padding: '8px 18px', borderRadius: 10, fontWeight: 700, fontSize: 13, textDecoration: 'none', border: 'none', cursor: 'pointer' }}>
                                    ✅ Finished — ดู E-Slip
                                </Link>
                                {campaign?.isApproveCertificate && (
                                    <Link href={`/runner/${runnerId}/certificate`} className="runner-action-btn" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, background: '#2563eb', color: '#fff', padding: '8px 18px', borderRadius: 10, fontWeight: 700, fontSize: 13, textDecoration: 'none', border: 'none', cursor: 'pointer' }}>
                                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="12" y1="18" x2="12" y2="12" /><polyline points="9 15 12 18 15 15" /></svg>
                                        ดาวน์โหลดใบประกาศ
                                    </Link>
                                )}
                            </>
                        ) : (
                            <div className="runner-action-btn" style={{ background: '#f1f5f9', color: '#94a3b8', padding: '8px 14px', borderRadius: 10, fontWeight: 700, fontSize: 12, textAlign: 'center', border: '1px solid #e2e8f0' }}>
                                ⏳ ยังวิ่งไม่จบ แต่ถ้ามีกล้องใน Checkpoint ก็เปิดดูได้ทันที
                            </div>
                        )}
                    </div>
                </section>

                {/* STATS CARDS */}
                <div className="runner-stats-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10, marginBottom: 16 }}>
                    <div className="runner-stat-card" style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, padding: 12 }}>
                        <p className="runner-stat-label" style={{ fontSize: 9, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', marginBottom: 2 }}>Overall Rank</p>
                        <p className="runner-stat-value" style={{ fontSize: 20, fontWeight: 900, color: '#0f172a', margin: 0 }}>{runner.overallRank || '-'} {runner.totalFinishers ? <small style={{ fontSize: 11, color: '#94a3b8', fontWeight: 700 }}>/ {runner.totalFinishers}</small> : null}</p>
                    </div>
                    <div className="runner-stat-card" style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, padding: 12 }}>
                        <p className="runner-stat-label" style={{ fontSize: 9, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', marginBottom: 2 }}>Gender Rank</p>
                        <p className="runner-stat-value" style={{ fontSize: 20, fontWeight: 900, color: '#0f172a', margin: 0 }}>{runner.genderRank || runner.genderNetRank || '-'} {runner.genderFinishers ? <small style={{ fontSize: 11, color: '#94a3b8', fontWeight: 700 }}>/ {runner.genderFinishers}</small> : null}</p>
                    </div>
                    <div className="runner-stat-card" style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, padding: 12 }}>
                        <p className="runner-stat-label" style={{ fontSize: 9, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', marginBottom: 2 }}>Category Rank</p>
                        <p className="runner-stat-value" style={{ fontSize: 20, fontWeight: 900, color: '#0f172a', margin: 0 }}>{runner.categoryRank || runner.categoryNetRank || '-'}</p>
                    </div>
                    <div className="runner-stat-card" style={{ background: isFinished ? '#f0fdf4' : '#fff', border: `1px solid ${isFinished ? '#bbf7d0' : '#e2e8f0'}`, borderRadius: 12, padding: 12 }}>
                        <p className="runner-stat-label" style={{ fontSize: 9, fontWeight: 700, color: isFinished ? '#16a34a' : '#94a3b8', textTransform: 'uppercase', marginBottom: 2 }}>{isFinished ? 'Finish Time' : 'Elapsed'}</p>
                        <p className="runner-stat-value" style={{ fontSize: 20, fontWeight: 900, color: isFinished ? '#15803d' : '#0f172a', margin: 0 }}>{finishTimeStr}</p>
                    </div>
                </div>

                {/* DISTANCE PROGRESS BAR — Marathon mode only */}
                {campaign?.displayMode !== 'lab' && checkpointRows.length > 0 && (() => {
                    const maxDist = checkpointRows.reduce((max, cp) => Math.max(max, cp.distanceFromStart || 0), 0);
                    const totalDist = maxDist || (parseDistanceValue(runner.category) || 0);
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

                                    // Calculate pace for this segment
                                    let segPace = '-';
                                    if (record.distanceFromStart && record.distanceFromStart > 0 && displayNetTime && displayNetTime > 0) {
                                        const totalMin = displayNetTime / 60000;
                                        const paceMin = totalMin / record.distanceFromStart;
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
                                                {record.distanceFromStart != null ? `${record.distanceFromStart} KM` : '-'}
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
                                                {cp.distanceFromStart != null ? `${cp.distanceFromStart} KM` : '-'}
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
                            className="runner-modal"
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
                            ) : selectedHit?.recording ? (
                                <div className="runner-modal-body">
                                    <div className="runner-modal-meta">
                                        กล้อง <strong style={{ color: '#0f172a' }}>{selectedHit.recording.cameraName}</strong> · เวลาในระบบ <strong style={{ color: '#0f172a' }}>{formatTimeOfDay(selectedHit.scanTime)}</strong> · เริ่มไฟล์ <strong style={{ color: '#0f172a' }}>{formatDateTime(selectedHit.recording.startTime)}</strong>
                                    </div>

                                    <div className="runner-modal-video-area">
                                        <div className={`runner-modal-video-shell ${selectedVideoIsPortrait ? 'portrait' : 'landscape'}`}>
                                        <video
                                            key={`${selectedHit.recording._id}-${videoSeekSeconds}`}
                                            src={streamUrl}
                                            controls
                                            preload="metadata"
                                            className={`runner-modal-video ${selectedVideoIsPortrait ? 'portrait' : 'landscape'}`}
                                            onLoadedMetadata={(event) => {
                                                const video = event.currentTarget;
                                                setSelectedVideoIsPortrait(video.videoHeight > video.videoWidth);
                                                if (Number.isFinite(videoSeekSeconds)) {
                                                    try {
                                                        video.currentTime = videoSeekSeconds;
                                                    } catch {
                                                        return;
                                                    }
                                                }
                                            }}
                                        />
                                        </div>
                                    </div>

                                    <div className="runner-modal-download-row">
                                        <a href={downloadUrl} className="runner-modal-download" style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', background: '#16a34a', color: '#fff', padding: '10px 20px', borderRadius: 12, fontWeight: 700, fontSize: 14, textDecoration: 'none' }}>
                                            บันทึกวิดีโอจุดนี้
                                        </a>
                                    </div>
                                </div>
                            ) : (
                                <div style={{ padding: '40px 24px', textAlign: 'center' }}>
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
