'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useParams, usePathname, useRouter } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';

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
    displayMode?: string;
    isApproveCertificate?: boolean;
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
        endTime: string;
        duration: number;
        fileSize: number;
        recordingStatus?: string;
    } | null;
    seekSeconds: number;
}

interface CheckpointOption {
    key: string;
    name: string;
    type?: string;
    orderNum: number;
    distanceFromStart?: number;
    timing: TimingRecord | null;
    hit: RunnerHit | null;
    passed: boolean;
}

function formatDuration(ms?: number | null): string {
    if (!ms || ms <= 0) return '--:--:--';
    const totalSeconds = Math.floor(ms / 1000);
    const h = Math.floor(totalSeconds / 3600);
    const m = Math.floor((totalSeconds % 3600) / 60);
    const s = totalSeconds % 60;
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

function formatClock(dateStr?: string): string {
    if (!dateStr) return '--:--:--';
    const d = new Date(dateStr);
    if (Number.isNaN(d.getTime())) return '--:--:--';
    return d.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function formatDateTime(dateStr?: string): string {
    if (!dateStr) return '-';
    const d = new Date(dateStr);
    if (Number.isNaN(d.getTime())) return '-';
    return d.toLocaleString('th-TH', {
        year: 'numeric',
        month: 'short',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
    });
}

function formatBytes(bytes?: number): string {
    if (!bytes || bytes <= 0) return '0 B';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function normalizeCheckpoint(value?: string): string {
    return (value || '').trim().toLowerCase();
}

function getStatusStyles(status: string) {
    switch (status) {
        case 'finished':
            return 'bg-emerald-500/15 text-emerald-300 ring-1 ring-emerald-400/25';
        case 'in_progress':
            return 'bg-rose-500/15 text-rose-200 ring-1 ring-rose-400/30 shadow-[0_0_20px_rgba(244,63,94,0.12)]';
        case 'dnf':
            return 'bg-orange-500/15 text-orange-200 ring-1 ring-orange-400/25';
        case 'dns':
            return 'bg-slate-500/15 text-slate-300 ring-1 ring-slate-400/25';
        default:
            return 'bg-slate-500/15 text-slate-300 ring-1 ring-slate-400/25';
    }
}

function getCheckpointBadge(name: string) {
    const key = normalizeCheckpoint(name);
    if (key.includes('start')) return 'bg-emerald-500/15 text-emerald-300 ring-1 ring-emerald-400/25';
    if (key.includes('finish')) return 'bg-rose-500/15 text-rose-200 ring-1 ring-rose-400/30';
    return 'bg-amber-500/15 text-amber-200 ring-1 ring-amber-400/25';
}

export default function RunnerProfileClient() {
    const params = useParams();
    const pathname = usePathname();
    const router = useRouter();
    const runnerId = params.id as string;
    const followSectionRef = useRef<HTMLDivElement>(null);
    const isFollowPage = pathname?.endsWith('/follow') ?? false;

    const [runner, setRunner] = useState<RunnerData | null>(null);
    const [timings, setTimings] = useState<TimingRecord[]>([]);
    const [campaign, setCampaign] = useState<CampaignData | null>(null);
    const [cpMappings, setCpMappings] = useState<CheckpointMappingData[]>([]);
    const [checkpointRanks, setCheckpointRanks] = useState<Record<string, number>>({});
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const [followOpen, setFollowOpen] = useState(isFollowPage);
    const [lookupLoading, setLookupLoading] = useState(false);
    const [lookupLoaded, setLookupLoaded] = useState(false);
    const [runnerHits, setRunnerHits] = useState<RunnerHit[]>([]);
    const [selectedCheckpoint, setSelectedCheckpoint] = useState('');
    const [preArrivalBufferSeconds, setPreArrivalBufferSeconds] = useState(5);

    useEffect(() => {
        if (isFollowPage) {
            setFollowOpen(true);
        }
    }, [isFollowPage]);

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
        if (!runnerId) return;
        (async () => {
            try {
                setLoading(true);
                const res = await fetch(`/api/runner/${runnerId}`, { cache: 'no-store' });
                const json = await res.json();
                if (json.status?.code === '200' && json.data) {
                    setRunner(json.data.runner);
                    setTimings(json.data.timingRecords || []);
                    setCampaign(json.data.campaign || null);
                    setCpMappings(json.data.checkpointMappings || []);
                    setCheckpointRanks(json.data.checkpointRanks || {});
                    setError(null);
                } else {
                    setError(json.status?.description || 'Runner not found');
                }
            } catch (err: any) {
                setError(err?.message || 'Failed to load runner');
            } finally {
                setLoading(false);
            }
        })();
    }, [runnerId]);

    const sortedTimings = useMemo(() => [...timings].sort((a, b) => (a.order || 0) - (b.order || 0)), [timings]);
    const latestCheckpointKey = normalizeCheckpoint(runner?.latestCheckpoint);
    const isFinished = runner?.status === 'finished';

    const checkpointOptions = useMemo<CheckpointOption[]>(() => {
        const timingMap = new Map(sortedTimings.map(record => [normalizeCheckpoint(record.checkpoint), record]));
        const hitMap = new Map(runnerHits.map(hit => [normalizeCheckpoint(hit.checkpoint), hit]));
        const optionMap = new Map<string, CheckpointOption>();

        cpMappings
            .filter(mapping => typeof mapping.checkpointId === 'object' && mapping.checkpointId?.name)
            .sort((a, b) => (a.orderNum || 0) - (b.orderNum || 0))
            .forEach((mapping) => {
                const checkpoint = mapping.checkpointId as { _id: string; name: string; type: string; orderNum?: number; kmCumulative?: number };
                const key = normalizeCheckpoint(checkpoint.name);
                optionMap.set(key, {
                    key,
                    name: checkpoint.name,
                    type: checkpoint.type,
                    orderNum: mapping.orderNum || checkpoint.orderNum || 999,
                    distanceFromStart: mapping.distanceFromStart ?? checkpoint.kmCumulative ?? undefined,
                    timing: timingMap.get(key) || null,
                    hit: hitMap.get(key) || null,
                    passed: false,
                });
            });

        sortedTimings.forEach((record, index) => {
            const key = normalizeCheckpoint(record.checkpoint);
            const existing = optionMap.get(key);
            optionMap.set(key, {
                key,
                name: record.checkpoint,
                type: existing?.type,
                orderNum: existing?.orderNum ?? record.order ?? index + 1,
                distanceFromStart: existing?.distanceFromStart ?? record.distanceFromStart,
                timing: record,
                hit: existing?.hit ?? hitMap.get(key) ?? null,
                passed: true,
            });
        });

        runnerHits.forEach((hit, index) => {
            const key = normalizeCheckpoint(hit.checkpoint);
            const existing = optionMap.get(key);
            optionMap.set(key, {
                key,
                name: existing?.name || hit.checkpoint,
                type: existing?.type,
                orderNum: existing?.orderNum ?? (sortedTimings.length + index + 1),
                distanceFromStart: existing?.distanceFromStart,
                timing: existing?.timing ?? timingMap.get(key) ?? null,
                hit,
                passed: existing?.passed ?? false,
            });
        });

        const ordered = Array.from(optionMap.values()).sort((a, b) => a.orderNum - b.orderNum);
        const latestIndex = latestCheckpointKey
            ? ordered.findIndex(option => option.key === latestCheckpointKey)
            : -1;

        return ordered.map((option, index) => ({
            ...option,
            passed: option.passed || isFinished || (latestIndex >= 0 ? index <= latestIndex : false),
        }));
    }, [cpMappings, sortedTimings, runnerHits, latestCheckpointKey, isFinished]);

    useEffect(() => {
        if (!followOpen || lookupLoaded || lookupLoading || !runnerId) return;
        (async () => {
            try {
                setLookupLoading(true);
                const res = await fetch(`/api/runner/${runnerId}/cctv`, { cache: 'no-store' });
                const json = await res.json();
                if (json.status?.code === '200') {
                    setRunnerHits(Array.isArray(json.data?.hits) ? json.data.hits : []);
                } else {
                    setRunnerHits([]);
                }
            } catch {
                setRunnerHits([]);
            } finally {
                setLookupLoaded(true);
                setLookupLoading(false);
            }
        })();
    }, [followOpen, lookupLoaded, lookupLoading, runnerId]);

    useEffect(() => {
        if (selectedCheckpoint || checkpointOptions.length === 0) return;
        const preferred = checkpointOptions.find(option => option.key === latestCheckpointKey)
            || checkpointOptions.find(option => option.hit?.recording)
            || checkpointOptions.find(option => option.timing)
            || checkpointOptions[0];
        if (preferred) setSelectedCheckpoint(preferred.key);
    }, [checkpointOptions, latestCheckpointKey, selectedCheckpoint]);

    const selectedOption = checkpointOptions.find(option => option.key === selectedCheckpoint) || checkpointOptions[0] || null;
    const selectedTiming = selectedOption?.timing || null;
    const selectedHit = selectedOption?.hit || null;
    const seekOffsetSeconds = preArrivalBufferSeconds;
    const videoSeekSeconds = Math.max(0, (selectedHit?.seekSeconds || 0) - seekOffsetSeconds);
    const streamUrl = selectedHit?.recording
        ? `/api/runner/${runnerId}/cctv/${selectedHit.recording._id}/stream`
        : '';
    const downloadUrl = selectedHit?.recording
        ? `/api/runner/${runnerId}/cctv/${selectedHit.recording._id}/stream?download=1`
        : '';

    const displayName = `${runner?.firstName || ''} ${runner?.lastName || ''}`.trim() || 'Unknown Runner';
    const initials = `${runner?.firstName?.[0] || ''}${runner?.lastName?.[0] || ''}`.toUpperCase() || '?';
    const finishTime = runner?.netTime || runner?.gunTime || runner?.elapsedTime;
    const finishTimeStr = runner?.netTimeStr || runner?.gunTimeStr || formatDuration(finishTime);
    const progressDistance = checkpointOptions.reduce((max, option) => Math.max(max, option.distanceFromStart || 0), 0);
    const currentDistance = selectedOption?.passed ? (selectedOption?.distanceFromStart || 0) : 0;
    const progressPercent = isFinished
        ? 100
        : progressDistance > 0
            ? Math.min(100, Math.round((currentDistance / progressDistance) * 100))
            : 0;

    const openFollowRunner = () => {
        setFollowOpen(true);
        window.setTimeout(() => {
            followSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }, 80);
    };

    if (loading) {
        return (
            <div className="min-h-screen bg-slate-950 text-white flex items-center justify-center px-4">
                <div className="text-center space-y-4">
                    <div className="mx-auto h-12 w-12 rounded-full border-4 border-slate-700 border-t-emerald-400 animate-spin" />
                    <p className="text-sm text-slate-300">กำลังโหลดข้อมูลนักวิ่ง...</p>
                </div>
            </div>
        );
    }

    if (error || !runner) {
        return (
            <div className="min-h-screen bg-slate-950 text-white flex items-center justify-center px-4">
                <div className="w-full max-w-md rounded-3xl border border-white/10 bg-white/5 p-8 text-center shadow-2xl shadow-black/30">
                    <div className="text-5xl mb-4">😔</div>
                    <h1 className="text-2xl font-black">ไม่พบข้อมูลนักวิ่ง</h1>
                    <p className="mt-3 text-sm text-slate-300">{error}</p>
                    <button
                        onClick={() => router.back()}
                        className="mt-6 inline-flex items-center justify-center rounded-xl bg-emerald-500 px-5 py-3 text-sm font-bold text-white transition hover:bg-emerald-600"
                    >
                        ย้อนกลับ
                    </button>
                </div>
            </div>
        );
    }

    if (isFollowPage) {
        return (
            <div className="min-h-screen bg-slate-50 text-slate-800">
                <header className="sticky top-0 z-40 border-b border-slate-200 bg-white/95 backdrop-blur">
                    <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3 sm:px-6 lg:px-8">
                        <div className="flex items-center gap-3">
                            <Link href="/" className="flex items-center border-r border-slate-200 pr-3">
                                <Image src="/logo-black.png" alt="ACTION" width={88} height={28} className="h-7 w-auto" />
                            </Link>
                            <span className="text-3xl font-black uppercase italic leading-none text-emerald-500">Live</span>
                        </div>
                        <button
                            onClick={() => router.push(`/runner/${runnerId}`)}
                            className="text-sm font-bold text-slate-500 transition hover:text-slate-700"
                        >
                            ← กลับหน้าข้อมูลนักวิ่ง
                        </button>
                    </div>
                </header>

                <main className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8">
                    <section className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-[0_8px_30px_rgba(15,23,42,0.06)] sm:p-6">
                        <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
                            <div className="flex items-center gap-4">
                                <div className="relative shrink-0">
                                    <div className="flex h-24 w-24 items-center justify-center rounded-3xl bg-emerald-500 text-3xl font-black text-white shadow-[0_10px_24px_rgba(34,197,94,0.22)] ring-4 ring-white">
                                        {initials}
                                    </div>
                                    <div className="absolute -bottom-2 -right-2 rounded-xl border-2 border-white bg-slate-900 px-3 py-1 text-lg font-black text-white shadow-md">
                                        {runner.bib}
                                    </div>
                                </div>
                                <div className="min-w-0">
                                    <h1 className="truncate text-3xl font-black tracking-tight text-slate-900 sm:text-4xl">{displayName}</h1>
                                    <p className="mt-2 text-sm font-bold text-slate-500">{runner.gender === 'M' ? 'Male' : runner.gender === 'F' ? 'Female' : runner.gender} {runner.ageGroup || ''} | <span className="text-slate-700">{runner.category}</span></p>
                                    <div className="mt-3 flex flex-wrap gap-2">
                                        <span className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-bold uppercase tracking-wide ${runner.status === 'finished' ? 'bg-emerald-100 text-emerald-700' : runner.status === 'in_progress' ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 text-slate-600'}`}>
                                            {runner.status === 'in_progress' ? 'Racing' : runner.status === 'finished' ? 'Finished' : runner.status}
                                        </span>
                                        {runner.latestCheckpoint && (
                                            <span className="inline-flex items-center rounded-full bg-slate-100 px-3 py-1 text-xs font-bold uppercase tracking-wide text-slate-600">
                                                Last CP: {runner.latestCheckpoint}
                                            </span>
                                        )}
                                    </div>
                                </div>
                            </div>
                            <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-5 py-4 text-right">
                                <p className="text-xs font-bold uppercase tracking-[0.25em] text-emerald-600">Follow Runner</p>
                                <p className="mt-2 text-lg font-black text-slate-900">เลือก Checkpoint เพื่อดูวิดีโอ</p>
                            </div>
                        </div>
                    </section>

                    <section className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-[0_8px_30px_rgba(15,23,42,0.06)] sm:p-6">
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                            <div>
                                <p className="text-xs font-black uppercase tracking-[0.25em] text-slate-400">Checkpoint Selection</p>
                                <h2 className="mt-2 text-2xl font-black text-slate-900">เลือกจุด Checkpoint</h2>
                                <p className="mt-2 text-sm text-slate-500">เลือกจุดของกิจกรรมนี้เพื่อเปิดวิดีโอ CCTV ที่ตรงกับช่วงเวลานักวิ่งผ่านจุด</p>
                            </div>
                            <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-500">
                                {lookupLoading ? 'กำลังค้นหาวิดีโอ CCTV...' : lookupLoaded ? `พบวิดีโอ ${runnerHits.filter(hit => hit.recording).length} จุด` : 'กำลังเตรียมข้อมูลจุดตรวจ'}
                            </div>
                        </div>

                        <div className="mt-5 flex flex-wrap gap-3">
                            {checkpointOptions.map((option) => {
                                const isActive = option.key === selectedOption?.key;
                                return (
                                    <button
                                        key={option.key}
                                        onClick={() => setSelectedCheckpoint(option.key)}
                                        className={`rounded-2xl border px-4 py-3 text-left transition ${
                                            isActive
                                                ? 'border-emerald-300 bg-emerald-50 shadow-[0_8px_20px_rgba(34,197,94,0.12)]'
                                                : 'border-slate-200 bg-white hover:border-emerald-200 hover:bg-emerald-50/50'
                                        }`}
                                    >
                                        <div className="flex items-center gap-2">
                                            <span className={`inline-flex rounded-full px-2.5 py-1 text-[10px] font-black uppercase tracking-wide ${option.name.toLowerCase().includes('start') ? 'bg-emerald-100 text-emerald-700' : option.name.toLowerCase().includes('finish') ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-700'}`}>
                                                {option.name}
                                            </span>
                                            {option.hit?.recording && (
                                                <span className="h-2.5 w-2.5 rounded-full bg-emerald-500" />
                                            )}
                                        </div>
                                        <div className="mt-2 text-xs font-semibold text-slate-500">
                                            {option.distanceFromStart != null ? `${option.distanceFromStart} KM` : 'No distance'}
                                        </div>
                                    </button>
                                );
                            })}
                        </div>

                        {!selectedOption && (
                            <div className="mt-6 rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-5 py-8 text-center text-sm font-semibold text-slate-500">
                                ไม่พบข้อมูล Checkpoint สำหรับนักวิ่งคนนี้
                            </div>
                        )}
                    </section>

                    {selectedOption && (
                        <section className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-[0_8px_30px_rgba(15,23,42,0.06)] sm:p-6">
                            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                                <div>
                                    <p className="text-xs font-black uppercase tracking-[0.25em] text-slate-400">CCTV Playback</p>
                                    <h2 className="mt-2 text-2xl font-black text-slate-900">วิดีโอที่จุด {selectedOption.name}</h2>
                                    <p className="mt-2 text-sm text-slate-500">ระบบจะเริ่มวิดีโอก่อนจังหวะที่นักวิ่งผ่านจุดประมาณ {seekOffsetSeconds} วินาที ตามค่าที่ตั้งในหน้า Admin</p>
                                </div>
                                {selectedHit?.recording && (
                                    <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
                                        <div className="flex flex-wrap items-center gap-2">
                                            <span>กล้อง: <span className="font-bold text-slate-900">{selectedHit.recording.cameraName}</span></span>
                                            {selectedHit.recording.recordingStatus === 'recording' && (
                                                <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.2em] text-red-600">
                                                    <span className="h-2 w-2 animate-pulse rounded-full bg-red-500" />
                                                    Live
                                                </span>
                                            )}
                                        </div>
                                        <div className="mt-1 text-xs text-slate-500">เริ่มไฟล์ {formatDateTime(selectedHit.recording.startTime)}</div>
                                    </div>
                                )}
                            </div>

                            {selectedHit?.recording ? (
                                <div className="mt-5 space-y-4">
                                    <div className="overflow-hidden rounded-3xl border border-slate-200 bg-slate-950 shadow-[0_16px_40px_rgba(15,23,42,0.18)]">
                                        <div className="flex items-center justify-between border-b border-white/10 bg-slate-900 px-4 py-3 text-xs font-bold uppercase tracking-[0.22em] text-slate-400">
                                            <span>{selectedOption.name}</span>
                                            <span className={selectedHit.recording.recordingStatus === 'recording' ? 'text-red-400' : 'text-emerald-400'}>
                                                {selectedHit.recording.recordingStatus === 'recording' ? 'LIVE CCTV' : 'CCTV FEED'}
                                            </span>
                                        </div>
                                        <video
                                            key={`${selectedHit.recording._id}-${videoSeekSeconds}`}
                                            src={streamUrl}
                                            controls
                                            preload="metadata"
                                            className="aspect-video w-full bg-black"
                                            onLoadedMetadata={(event) => {
                                                const video = event.currentTarget;
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

                                    <div className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600 sm:flex-row sm:items-center sm:justify-between">
                                        <div className="space-y-1">
                                            <div>เริ่มเล่นที่ตำแหน่ง <span className="font-mono font-black text-slate-900">{formatDuration(videoSeekSeconds * 1000)}</span></div>
                                            <div>ขนาดไฟล์ <span className="font-black text-slate-900">{formatBytes(selectedHit.recording.fileSize)}</span></div>
                                            {selectedHit.recording.recordingStatus === 'recording' && (
                                                <div className="font-semibold text-red-600">กำลังถ่ายทอดสดอยู่ ผู้ใช้สามารถกดดูได้ทันทีโดยไม่ต้องรอปิดกิจกรรม</div>
                                            )}
                                        </div>
                                        <a
                                            href={downloadUrl}
                                            className="inline-flex items-center justify-center rounded-2xl bg-emerald-500 px-5 py-3 text-sm font-black text-white transition hover:bg-emerald-600"
                                        >
                                            ดาวน์โหลดวิดีโอจุดนี้
                                        </a>
                                    </div>
                                </div>
                            ) : (
                                <div className="mt-5 rounded-3xl border border-dashed border-slate-200 bg-slate-50 p-8 text-center">
                                    <div className="text-5xl">🎥</div>
                                    <h3 className="mt-4 text-xl font-black text-slate-900">ยังไม่มีวิดีโอ CCTV สำหรับจุดนี้</h3>
                                    <p className="mt-2 text-sm text-slate-500">
                                        {selectedOption.passed
                                            ? 'นักวิ่งผ่านจุดนี้แล้ว แต่ยังไม่พบไฟล์วิดีโอที่ตรงกับช่วงเวลานี้'
                                            : 'นักวิ่งยังไม่ผ่านจุดนี้ จึงยังไม่มีวิดีโอให้ดู'}
                                    </p>
                                </div>
                            )}
                        </section>
                    )}
                </main>
            </div>
        );
    }

    return (
        <div className="relative min-h-screen overflow-hidden bg-[#04070d] text-slate-100">
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(244,63,94,0.14),transparent_30%),radial-gradient(circle_at_top_right,rgba(249,115,22,0.12),transparent_28%),radial-gradient(circle_at_bottom,rgba(34,197,94,0.08),transparent_34%)]" />
            <div className="pointer-events-none absolute left-0 right-0 top-0 h-72 bg-[linear-gradient(180deg,rgba(255,255,255,0.03),transparent)]" />
            <header className="sticky top-0 z-40 border-b border-white/10 bg-[#050912]/90 backdrop-blur-xl">
                <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3 sm:px-6 lg:px-8">
                    <div className="flex items-center gap-4">
                        <Link href="/" className="flex items-center gap-3 border-r border-white/10 pr-4">
                            <Image src="/logo-black.png" alt="ACTION" width={88} height={28} className="h-7 w-auto rounded bg-white px-2 py-1" />
                            <span className="text-xs font-bold uppercase tracking-[0.35em] text-rose-300">Runner Live</span>
                        </Link>
                        <div className="hidden sm:flex sm:flex-col">
                            <div className="flex items-center gap-3">
                                <span className="inline-flex items-center gap-2 rounded-full border border-rose-400/25 bg-rose-500/10 px-3 py-1 text-[10px] font-black uppercase tracking-[0.3em] text-rose-200">
                                    <span className="h-2 w-2 animate-pulse rounded-full bg-rose-400" />
                                    Live Theme
                                </span>
                                <span className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-400">{campaign?.name || 'Event'}</span>
                            </div>
                            <p className="mt-1 text-sm font-medium text-slate-200">Runner Profile & CCTV Playback</p>
                        </div>
                    </div>
                    <button
                        onClick={() => {
                            if (isFollowPage) {
                                router.push(`/runner/${runnerId}`);
                                return;
                            }
                            router.back();
                        }}
                        className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm font-semibold text-slate-200 transition hover:border-rose-400/30 hover:bg-white/10"
                    >
                        <span>←</span>
                        <span>{isFollowPage ? 'กลับหน้าข้อมูลนักวิ่ง' : 'กลับหน้าก่อนหน้า'}</span>
                    </button>
                </div>
            </header>

            <main className="relative z-10 mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8">
                <section className="overflow-hidden rounded-3xl border border-white/10 bg-linear-to-br from-[#0a0f18] via-[#09111b] to-[#1a1216] shadow-2xl shadow-black/40 ring-1 ring-white/5">
                    <div className="grid gap-6 p-6 lg:grid-cols-[1.4fr,0.8fr] lg:p-8">
                        <div className="space-y-6">
                            <div className="flex flex-wrap items-start gap-5">
                                <div className="relative shrink-0">
                                    <div className="flex h-24 w-24 items-center justify-center rounded-3xl bg-linear-to-br from-rose-500 via-orange-400 to-amber-300 text-3xl font-black text-white shadow-[0_18px_40px_rgba(244,63,94,0.25)] ring-1 ring-white/15">
                                        {initials}
                                    </div>
                                    <div className="absolute -bottom-2 -right-2 rounded-2xl border border-white/20 bg-black/80 px-3 py-1 text-lg font-black text-white shadow-lg">
                                        {runner.bib}
                                    </div>
                                </div>
                                <div className="min-w-0 flex-1 space-y-3">
                                    <div className="flex flex-wrap items-center gap-2">
                                        <h1 className="text-3xl font-black tracking-tight text-white sm:text-4xl">{displayName}</h1>
                                        <span className="inline-flex items-center gap-2 rounded-full border border-rose-400/25 bg-rose-500/10 px-3 py-1 text-[10px] font-black uppercase tracking-[0.3em] text-rose-200">
                                            <span className="h-2 w-2 animate-pulse rounded-full bg-rose-400" />
                                            Live
                                        </span>
                                        <span className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-bold uppercase tracking-wide ${getStatusStyles(runner.status)}`}>
                                            {runner.status === 'in_progress' ? 'Racing' : runner.status === 'finished' ? 'Finished' : runner.status}
                                        </span>
                                        {runner.status === 'in_progress' && <span className="h-3 w-3 animate-pulse rounded-full bg-rose-400 shadow-[0_0_20px_rgba(244,63,94,0.7)]" />}
                                    </div>
                                    <div className="flex flex-wrap gap-2 text-sm text-slate-300">
                                        <span className="rounded-full bg-white/5 px-3 py-1 ring-1 ring-white/10">{runner.category}</span>
                                        {runner.ageGroup && <span className="rounded-full bg-white/5 px-3 py-1 ring-1 ring-white/10">{runner.ageGroup}</span>}
                                        <span className="rounded-full bg-white/5 px-3 py-1 ring-1 ring-white/10">{runner.gender === 'M' ? 'Male' : runner.gender === 'F' ? 'Female' : runner.gender}</span>
                                        {runner.teamName && <span className="rounded-full bg-white/5 px-3 py-1 ring-1 ring-white/10">ทีม {runner.teamName}</span>}
                                        {runner.latestCheckpoint && <span className="rounded-full bg-rose-500/10 px-3 py-1 text-rose-200 ring-1 ring-rose-400/20">ล่าสุด: {runner.latestCheckpoint}</span>}
                                    </div>
                                    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                                        <div className="rounded-2xl border border-white/10 bg-white/5 p-4 backdrop-blur-sm">
                                            <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-slate-400">Overall Rank</p>
                                            <p className="mt-2 text-3xl font-black text-white">{runner.overallRank || '-'}</p>
                                        </div>
                                        <div className="rounded-2xl border border-white/10 bg-white/5 p-4 backdrop-blur-sm">
                                            <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-slate-400">Gender Rank</p>
                                            <p className="mt-2 text-3xl font-black text-white">{runner.genderRank || runner.genderNetRank || '-'}</p>
                                        </div>
                                        <div className="rounded-2xl border border-white/10 bg-white/5 p-4 backdrop-blur-sm">
                                            <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-slate-400">Category Rank</p>
                                            <p className="mt-2 text-3xl font-black text-white">{runner.categoryRank || runner.categoryNetRank || '-'}</p>
                                        </div>
                                        <div className="rounded-2xl border border-rose-400/20 bg-rose-500/10 p-4 shadow-[0_0_24px_rgba(244,63,94,0.08)]">
                                            <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-rose-200">{isFinished ? 'Finish Time' : 'Elapsed'}</p>
                                            <p className="mt-2 text-3xl font-black text-white">{finishTimeStr}</p>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div className="flex flex-col gap-3 rounded-3xl border border-white/10 bg-black/30 p-5 shadow-[0_0_40px_rgba(0,0,0,0.25)]">
                            <div className="space-y-1">
                                <p className="text-xs font-bold uppercase tracking-[0.3em] text-rose-300">Broadcast Controls</p>
                                <h2 className="text-2xl font-black text-white">ติดตามนักวิ่งรายจุด</h2>
                                <p className="text-sm text-slate-300">เลือก Checkpoint เพื่อดูข้อมูลช่วงที่นักวิ่งผ่านจุด พร้อมเปิดวิดีโอ CCTV และดาวน์โหลดได้ทันที</p>
                            </div>
                            {!isFollowPage && (
                                <button
                                    onClick={openFollowRunner}
                                    className="inline-flex items-center justify-center gap-2 rounded-2xl bg-linear-to-r from-rose-500 to-orange-400 px-5 py-3 text-sm font-black text-white transition hover:brightness-110"
                                >
                                    <span className="h-2 w-2 animate-pulse rounded-full bg-white" />
                                    {followOpen ? 'กำลังแสดง Checkpoint ทั้งหมด' : 'ติดตามนักวิ่ง'}
                                </button>
                            )}
                            {isFinished ? (
                                <Link
                                    href={`/runner/${runnerId}/eslip`}
                                    className="inline-flex items-center justify-center rounded-2xl bg-emerald-500 px-5 py-3 text-sm font-black text-white transition hover:bg-emerald-600"
                                >
                                    ✅ Finished — ดู E-Slip
                                </Link>
                            ) : (
                                <div className="rounded-2xl border border-white/10 bg-white/5 px-5 py-3 text-center text-sm font-semibold text-slate-300">
                                    ⏳ ยังวิ่งไม่จบ แต่สามารถติดตามวิดีโอรายจุดได้
                                </div>
                            )}
                            {campaign?.isApproveCertificate && isFinished && (
                                <Link
                                    href={`/runner/${runnerId}/certificate`}
                                    className="inline-flex items-center justify-center rounded-2xl bg-blue-500 px-5 py-3 text-sm font-black text-white transition hover:bg-blue-600"
                                >
                                    ดาวน์โหลดใบประกาศ
                                </Link>
                            )}
                            <div className="rounded-2xl border border-white/10 bg-white/5 p-4 text-sm text-slate-300 backdrop-blur-sm">
                                <div className="flex items-center justify-between gap-3">
                                    <span>ความคืบหน้าระยะ</span>
                                    <span className="font-black text-white">{progressPercent}%</span>
                                </div>
                                <div className="mt-3 h-3 overflow-hidden rounded-full bg-white/10">
                                    <div className="h-full rounded-full bg-linear-to-r from-rose-500 via-orange-400 to-amber-300 transition-all" style={{ width: `${progressPercent}%` }} />
                                </div>
                                <div className="mt-2 flex items-center justify-between text-xs text-slate-400">
                                    <span>{selectedOption?.distanceFromStart != null ? `${selectedOption.distanceFromStart} KM` : 'ยังไม่มีระยะ'}</span>
                                    <span>{progressDistance > 0 ? `${progressDistance} KM` : '—'}</span>
                                </div>
                            </div>
                        </div>
                    </div>
                </section>

                {followOpen && (
                <section ref={followSectionRef} className="rounded-3xl border border-white/10 bg-[#081019]/90 p-5 shadow-2xl shadow-black/30 ring-1 ring-rose-400/10 sm:p-6">
                    <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
                        <div>
                            <p className="text-xs font-bold uppercase tracking-[0.3em] text-rose-300">Runner Follow</p>
                            <h2 className="mt-2 text-2xl font-black text-white">เลือก Checkpoint เพื่อดูช่วงที่นักวิ่งผ่านจุด</h2>
                            <p className="mt-2 text-sm text-slate-300">เมื่อเลือกจุดแล้ว ระบบจะแสดงเวลาผ่านจุด รายละเอียดอันดับ ณ จุดนั้น และวิดีโอ CCTV สำหรับดูหรือบันทึกไฟล์</p>
                        </div>
                        <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-slate-300">
                            {lookupLoading ? 'กำลังค้นหาวิดีโอ CCTV...' : lookupLoaded ? `พบข้อมูลวิดีโอ ${runnerHits.filter(hit => hit.recording).length} จุด` : 'กดติดตามนักวิ่งเพื่อโหลดวิดีโอ'}
                        </div>
                    </div>

                    <div className="mt-5 flex flex-wrap gap-3">
                        {checkpointOptions.map((option) => {
                            const isActive = option.key === selectedOption?.key;
                            return (
                                <button
                                    key={option.key}
                                    onClick={() => setSelectedCheckpoint(option.key)}
                                    className={`group rounded-2xl border px-4 py-3 text-left transition ${
                                        isActive
                                            ? 'border-rose-400 bg-rose-500/15 shadow-lg shadow-rose-950/20'
                                            : 'border-white/10 bg-white/5 hover:border-rose-400/20 hover:bg-white/10'
                                    }`}
                                >
                                    <div className="flex items-center gap-2">
                                        <span className={`inline-flex rounded-full px-2.5 py-1 text-[10px] font-black uppercase tracking-wide ${getCheckpointBadge(option.name)}`}>
                                            {option.name}
                                        </span>
                                        {option.hit?.recording && <span className="inline-flex h-2.5 w-2.5 rounded-full bg-rose-400" />}
                                    </div>
                                    <div className="mt-2 flex items-center gap-2 text-xs text-slate-300">
                                        <span>{option.distanceFromStart != null ? `${option.distanceFromStart} KM` : 'No distance'}</span>
                                        <span>•</span>
                                        <span>{option.passed ? 'ผ่านแล้ว' : 'ยังไม่ผ่าน'}</span>
                                    </div>
                                </button>
                            );
                        })}
                    </div>

                    {selectedOption && (
                        <div className="mt-6 grid gap-6 xl:grid-cols-[0.95fr,1.05fr]">
                            <div className="space-y-6">
                                <div className="rounded-3xl border border-white/10 bg-white/5 p-5 backdrop-blur-sm">
                                    <div className="flex flex-wrap items-start justify-between gap-4">
                                        <div>
                                            <p className="text-xs font-bold uppercase tracking-[0.3em] text-slate-400">Selected Checkpoint</p>
                                            <div className="mt-2 flex items-center gap-3">
                                                <h3 className="text-2xl font-black text-white">{selectedOption.name}</h3>
                                                <span className={`inline-flex rounded-full px-3 py-1 text-xs font-bold ${selectedOption.passed ? 'bg-rose-500/15 text-rose-200 ring-1 ring-rose-400/30' : 'bg-slate-500/15 text-slate-300 ring-1 ring-slate-400/25'}`}>
                                                    {selectedOption.passed ? 'ผ่านจุดนี้แล้ว' : 'ยังไม่ถึงจุดนี้'}
                                                </span>
                                            </div>
                                            <p className="mt-2 text-sm text-slate-300">
                                                {selectedOption.type ? `ประเภทจุด: ${selectedOption.type}` : 'จุดตรวจในกิจกรรมนี้'}
                                                {selectedOption.distanceFromStart != null ? ` • ระยะ ${selectedOption.distanceFromStart} KM` : ''}
                                            </p>
                                        </div>
                                        <div className="rounded-2xl border border-white/10 bg-black/40 px-4 py-3 text-right">
                                            <p className="text-[11px] font-bold uppercase tracking-[0.25em] text-slate-400">Checkpoint Rank</p>
                                            <p className="mt-2 text-3xl font-black text-white">{checkpointRanks[selectedOption.name] || '-'}</p>
                                        </div>
                                    </div>

                                    <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                                        <div className="rounded-2xl border border-white/10 bg-black/35 p-4">
                                            <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-slate-400">เวลาจริง</p>
                                            <p className="mt-2 text-lg font-black text-white">{formatClock(selectedTiming?.scanTime || selectedHit?.scanTime)}</p>
                                        </div>
                                        <div className="rounded-2xl border border-white/10 bg-black/35 p-4">
                                            <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-slate-400">Elapsed</p>
                                            <p className="mt-2 text-lg font-black text-white">{formatDuration(selectedTiming?.elapsedTime || selectedHit?.elapsedTime || undefined)}</p>
                                        </div>
                                        <div className="rounded-2xl border border-white/10 bg-black/35 p-4">
                                            <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-slate-400">Split</p>
                                            <p className="mt-2 text-lg font-black text-white">{formatDuration(selectedTiming?.splitTime || selectedHit?.splitTime || undefined)}</p>
                                        </div>
                                        <div className="rounded-2xl border border-white/10 bg-black/35 p-4">
                                            <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-slate-400">สถานะวิดีโอ</p>
                                            <p className="mt-2 text-lg font-black text-white">{selectedHit?.recording ? 'มีวิดีโอ CCTV' : 'ยังไม่มีวิดีโอ'}</p>
                                        </div>
                                    </div>
                                </div>

                                <div className="rounded-3xl border border-white/10 bg-white/5 p-5 backdrop-blur-sm">
                                    <div className="flex items-center justify-between gap-3">
                                        <div>
                                            <p className="text-xs font-bold uppercase tracking-[0.3em] text-slate-400">Checkpoint Timeline</p>
                                            <h3 className="mt-2 text-xl font-black text-white">ประวัติการผ่านจุดทั้งหมด</h3>
                                        </div>
                                        <div className="rounded-2xl border border-white/10 bg-black/35 px-3 py-2 text-xs text-slate-300">
                                            {campaign?.name || 'Event'}
                                        </div>
                                    </div>
                                    <div className="mt-4 overflow-hidden rounded-2xl border border-white/10">
                                        <div className="overflow-x-auto">
                                            <table className="min-w-full divide-y divide-white/10 text-sm">
                                                <thead className="bg-white/5 text-xs uppercase tracking-wide text-slate-400">
                                                    <tr>
                                                        <th className="px-4 py-3 text-left">Checkpoint</th>
                                                        <th className="px-4 py-3 text-left">Time</th>
                                                        <th className="px-4 py-3 text-left">Elapsed</th>
                                                        <th className="px-4 py-3 text-left">Video</th>
                                                    </tr>
                                                </thead>
                                                <tbody className="divide-y divide-white/10 bg-black/20">
                                                    {checkpointOptions.map((option) => (
                                                        <tr key={`timeline-${option.key}`} className={option.key === selectedOption.key ? 'bg-rose-500/10' : ''}>
                                                            <td className="px-4 py-3">
                                                                <div className="flex items-center gap-2">
                                                                    <span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-black uppercase ${getCheckpointBadge(option.name)}`}>
                                                                        {option.name}
                                                                    </span>
                                                                    <span className={`text-xs ${option.passed ? 'text-rose-200' : 'text-slate-500'}`}>
                                                                        {option.passed ? 'ผ่านแล้ว' : 'รอผ่านจุด'}
                                                                    </span>
                                                                </div>
                                                            </td>
                                                            <td className="px-4 py-3 font-mono text-slate-200">{formatClock(option.timing?.scanTime || option.hit?.scanTime)}</td>
                                                            <td className="px-4 py-3 font-mono text-slate-300">{formatDuration(option.timing?.elapsedTime || option.hit?.elapsedTime || undefined)}</td>
                                                            <td className="px-4 py-3 text-slate-300">{option.hit?.recording ? option.hit.recording.cameraName : '—'}</td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <div className="space-y-6">
                                <div className="rounded-3xl border border-white/10 bg-white/5 p-5 backdrop-blur-sm">
                                    <div className="flex flex-wrap items-start justify-between gap-3">
                                        <div>
                                            <div className="flex items-center gap-2">
                                                <p className="text-xs font-bold uppercase tracking-[0.3em] text-rose-300">CCTV Playback</p>
                                                <span className="inline-flex items-center gap-2 rounded-full border border-rose-400/25 bg-rose-500/10 px-3 py-1 text-[10px] font-black uppercase tracking-[0.3em] text-rose-200">
                                                    <span className="h-2 w-2 animate-pulse rounded-full bg-rose-400" />
                                                    Replay
                                                </span>
                                            </div>
                                            <h3 className="mt-2 text-2xl font-black text-white">วิดีโอช่วงนักวิ่งผ่านจุด</h3>
                                            <p className="mt-2 text-sm text-slate-300">ระบบจะเริ่มวิดีโอก่อนจังหวะที่นักวิ่งผ่านจุดประมาณ {seekOffsetSeconds} วินาที เพื่อให้เห็นภาพก่อนถึงจุด</p>
                                        </div>
                                        {selectedHit?.recording && (
                                            <div className="rounded-2xl border border-white/10 bg-black/35 px-4 py-3 text-sm text-slate-300">
                                                <div>กล้อง: <span className="font-bold text-white">{selectedHit.recording.cameraName}</span></div>
                                                <div className="mt-1 text-xs text-slate-400">เริ่มไฟล์ {formatDateTime(selectedHit.recording.startTime)}</div>
                                            </div>
                                        )}
                                    </div>

                                    {selectedHit?.recording ? (
                                        <div className="mt-5 space-y-4">
                                            <div className="overflow-hidden rounded-3xl border border-rose-400/25 bg-black shadow-[0_20px_60px_rgba(0,0,0,0.45)] ring-1 ring-white/10">
                                                <div className="flex items-center justify-between gap-3 border-b border-white/10 bg-[#070b12] px-4 py-3 text-xs uppercase tracking-[0.25em] text-slate-400">
                                                    <div className="flex items-center gap-3">
                                                        <span className="inline-flex items-center gap-2 rounded-full border border-rose-400/25 bg-rose-500/10 px-2.5 py-1 text-[10px] font-black text-rose-200">
                                                            <span className="h-2 w-2 animate-pulse rounded-full bg-rose-400" />
                                                            Live Replay
                                                        </span>
                                                        <span>{selectedOption.name}</span>
                                                    </div>
                                                    <span className="text-[10px] text-slate-500">CCTV FEED</span>
                                                </div>
                                                <video
                                                    key={`${selectedHit.recording._id}-${videoSeekSeconds}`}
                                                    src={streamUrl}
                                                    controls
                                                    preload="metadata"
                                                    className="aspect-video w-full bg-black"
                                                    onLoadedMetadata={(event) => {
                                                        const video = event.currentTarget;
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
                                            <div className="grid gap-3 sm:grid-cols-2">
                                                <div className="rounded-2xl border border-white/10 bg-black/35 p-4 text-sm text-slate-300">
                                                    <div className="flex items-center justify-between gap-3">
                                                        <span>เริ่มเล่นที่ตำแหน่ง</span>
                                                        <span className="font-mono font-black text-white">{formatDuration(videoSeekSeconds * 1000)}</span>
                                                    </div>
                                                    <div className="mt-2 flex items-center justify-between gap-3">
                                                        <span>ขนาดไฟล์</span>
                                                        <span className="font-black text-white">{formatBytes(selectedHit.recording.fileSize)}</span>
                                                    </div>
                                                </div>
                                                <div className="flex flex-col gap-3 sm:items-end sm:justify-center">
                                                    <a
                                                        href={downloadUrl}
                                                        className="inline-flex items-center justify-center rounded-2xl bg-linear-to-r from-rose-500 to-orange-400 px-5 py-3 text-sm font-black text-white transition hover:brightness-110"
                                                    >
                                                        ดาวน์โหลดวิดีโอจุดนี้
                                                    </a>
                                                    <p className="text-xs text-slate-400">ไฟล์จะถูกดาวน์โหลดจากวิดีโอของ Checkpoint ที่เลือกโดยตรง</p>
                                                </div>
                                            </div>
                                        </div>
                                    ) : (
                                        <div className="mt-5 rounded-3xl border border-dashed border-white/15 bg-black/35 p-8 text-center">
                                            <div className="text-5xl">🎥</div>
                                            <h4 className="mt-4 text-xl font-black text-white">ยังไม่มีวิดีโอ CCTV สำหรับจุดนี้</h4>
                                            <p className="mt-2 text-sm text-slate-300">
                                                {selectedOption.passed
                                                    ? 'นักวิ่งผ่านจุดนี้แล้ว แต่ยังไม่พบไฟล์วิดีโอที่ตรงกับช่วงเวลานี้'
                                                    : 'นักวิ่งยังไม่ผ่านจุดนี้ จึงยังไม่มีวิดีโอให้ดู'}
                                            </p>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    )}
                </section>
                )}
            </main>
        </div>
    );
}
