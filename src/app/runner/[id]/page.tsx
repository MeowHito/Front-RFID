'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
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
    categories?: Array<{ name: string; distance: string; badgeColor: string }>;
    eslipTemplate?: string;
}

interface CheckpointMappingData {
    _id: string;
    checkpointId: { _id: string; name: string; type: string; orderNum?: number; kmCumulative?: number } | string;
    eventId: string;
    orderNum: number;
    distanceFromStart?: number;
    active?: boolean;
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

export default function RunnerProfilePage() {
    const params = useParams();
    const router = useRouter();
    const runnerId = params.id as string;

    const [runner, setRunner] = useState<RunnerData | null>(null);
    const [timings, setTimings] = useState<TimingRecord[]>([]);
    const [campaign, setCampaign] = useState<CampaignData | null>(null);
    const [cpMappings, setCpMappings] = useState<CheckpointMappingData[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

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

    return (
        <div style={{ minHeight: '100vh', background: '#f8fafc', fontFamily: "'Prompt', sans-serif", color: '#1e293b' }}>
            <style>{`
                @import url('https://fonts.googleapis.com/css2?family=Prompt:wght@300;400;500;600;700;800;900&display=swap');
                @keyframes pulseLive { 0% { transform: scale(0.9); opacity: 0.7; } 50% { transform: scale(1.2); opacity: 1; } 100% { transform: scale(0.9); opacity: 0.7; } }
                .live-dot { width: 10px; height: 8px; border-radius: 50%; display: inline-block; animation: pulseLive 1.5s infinite; border: 1.5px solid white; }
                .checkpoint-row:nth-child(even) { background-color: #f8fafc; }
            `}</style>

            {/* HEADER */}
            <header style={{ background: '#fff', borderBottom: '1px solid #e2e8f0', padding: '12px 16px', boxShadow: '0 1px 3px rgba(0,0,0,0.04)', position: 'sticky', top: 0, zIndex: 50 }}>
                <div style={{ maxWidth: 1024, margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
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

            <main style={{ maxWidth: 1024, margin: '0 auto', padding: '16px 16px 40px' }}>
                {/* RUNNER INFO SECTION */}
                <section style={{ display: 'flex', flexWrap: 'wrap', gap: 24, alignItems: 'center', background: '#fff', padding: 24, borderRadius: 16, border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.04)', marginBottom: 24 }}>
                    <div style={{ position: 'relative' }}>
                        <div style={{ width: 96, height: 96, borderRadius: 16, background: '#22c55e', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 32, fontWeight: 800, boxShadow: '0 4px 12px rgba(0,0,0,0.1)', border: '4px solid #fff' }}>
                            {initials}
                        </div>
                        <span style={{ position: 'absolute', bottom: -6, right: -6, background: '#0f172a', color: '#fff', padding: '2px 10px', borderRadius: 8, fontSize: 16, fontWeight: 800, border: '2px solid #fff', boxShadow: '0 0 0 1px #000, 0 4px 6px rgba(0,0,0,0.1)' }}>
                            {runner.bib}
                        </span>
                    </div>

                    <div style={{ flex: 1, minWidth: 200 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
                            <h2 style={{ fontSize: 28, fontWeight: 900, textTransform: 'uppercase', color: '#0f172a', margin: 0 }}>{displayName}</h2>
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

                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                        <button style={{ background: '#0f172a', color: '#fff', padding: '10px 24px', borderRadius: 12, fontWeight: 700, fontSize: 14, border: 'none', cursor: 'pointer' }}>
                            ติดตามนักวิ่ง
                        </button>
                        {isFinished ? (
                            <Link href={`/runner/${runnerId}/eslip`} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, background: '#16a34a', color: '#fff', padding: '10px 24px', borderRadius: 12, fontWeight: 700, fontSize: 14, textDecoration: 'none', border: 'none', cursor: 'pointer' }}>
                                ✅ Finished — ดู E-Slip
                            </Link>
                        ) : (
                            <div style={{ background: '#f1f5f9', color: '#94a3b8', padding: '10px 24px', borderRadius: 12, fontWeight: 700, fontSize: 13, textAlign: 'center', border: '1px solid #e2e8f0' }}>
                                ⏳ ยังวิ่งไม่จบ
                            </div>
                        )}
                    </div>
                </section>

                {/* STATS CARDS */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 16, marginBottom: 24 }}>
                    <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, padding: 16 }}>
                        <p style={{ fontSize: 10, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', marginBottom: 4 }}>Overall Rank</p>
                        <p style={{ fontSize: 24, fontWeight: 900, color: '#0f172a', margin: 0 }}>{runner.overallRank || '-'} {runner.totalFinishers ? <small style={{ fontSize: 12, color: '#94a3b8', fontWeight: 700 }}>/ {runner.totalFinishers}</small> : null}</p>
                    </div>
                    <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, padding: 16 }}>
                        <p style={{ fontSize: 10, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', marginBottom: 4 }}>Gender Rank</p>
                        <p style={{ fontSize: 24, fontWeight: 900, color: '#0f172a', margin: 0 }}>{runner.genderRank || runner.genderNetRank || '-'} {runner.genderFinishers ? <small style={{ fontSize: 12, color: '#94a3b8', fontWeight: 700 }}>/ {runner.genderFinishers}</small> : null}</p>
                    </div>
                    <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, padding: 16 }}>
                        <p style={{ fontSize: 10, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', marginBottom: 4 }}>Category Rank</p>
                        <p style={{ fontSize: 24, fontWeight: 900, color: '#0f172a', margin: 0 }}>{runner.categoryRank || runner.categoryNetRank || '-'}</p>
                    </div>
                    <div style={{ background: isFinished ? '#f0fdf4' : '#fff', border: `1px solid ${isFinished ? '#bbf7d0' : '#e2e8f0'}`, borderRadius: 12, padding: 16 }}>
                        <p style={{ fontSize: 10, fontWeight: 700, color: isFinished ? '#16a34a' : '#94a3b8', textTransform: 'uppercase', marginBottom: 4 }}>{isFinished ? 'Finish Time' : 'Elapsed'}</p>
                        <p style={{ fontSize: 24, fontWeight: 900, color: isFinished ? '#15803d' : '#0f172a', margin: 0 }}>{finishTimeStr}</p>
                    </div>
                </div>

                {/* DISTANCE PROGRESS BAR */}
                {checkpointRows.length > 0 && (() => {
                    const maxDist = checkpointRows.reduce((max, cp) => Math.max(max, cp.distanceFromStart || 0), 0);
                    const totalDist = maxDist || (parseDistanceValue(runner.category) || 0);
                    const currentDist = passedUpToIdx >= 0 && checkpointRows[passedUpToIdx]?.distanceFromStart != null
                        ? checkpointRows[passedUpToIdx].distanceFromStart!
                        : 0;
                    const pct = isFinished ? 100 : (totalDist > 0 ? Math.min(99, Math.round((currentDist / totalDist) * 100)) : 0);
                    return (
                        <div style={{ background: '#fff', borderRadius: 16, border: '1px solid #e2e8f0', padding: 24, marginBottom: 24, boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
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

                {/* CHECKPOINT HISTORY TABLE */}
                <div style={{ background: '#fff', borderRadius: 16, border: '1px solid #e2e8f0', overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
                    <div style={{ padding: '16px 24px', borderBottom: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <h3 style={{ fontWeight: 900, textTransform: 'uppercase', fontSize: 13, letterSpacing: 2, color: '#64748b', margin: 0 }}>Checkpoint History</h3>
                        <span style={{ fontSize: 10, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', fontStyle: 'italic' }}>
                            {campaign?.name || 'Event'}
                        </span>
                    </div>
                    <div style={{ overflowX: 'auto' }}>
                        <table style={{ width: '100%', textAlign: 'left', borderCollapse: 'collapse', minWidth: 600 }}>
                            <thead>
                                <tr style={{ fontSize: 10, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '-0.02em', background: '#f8fafc' }}>
                                    <th style={{ padding: '12px 24px' }}>Checkpoint</th>
                                    <th style={{ padding: '12px 8px' }}>Distance</th>
                                    <th style={{ padding: '12px 8px' }}>Time of Day</th>
                                    <th style={{ padding: '12px 8px' }}>Net Time</th>
                                    <th style={{ padding: '12px 8px' }}>Split</th>
                                    <th style={{ padding: '12px 24px', textAlign: 'right' }}>Pace</th>
                                </tr>
                            </thead>
                            <tbody>
                                {sortedTimings.length > 0 ? sortedTimings.map((record, i) => {
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

                                    return (
                                        <tr key={record._id} className="checkpoint-row" style={{ background: isCurrent ? 'rgba(34,197,94,0.05)' : undefined }}>
                                            <td style={{ padding: '16px 24px', fontWeight: 700, fontSize: 14, color: isFinishCp ? '#0f172a' : isCurrent ? '#16a34a' : isStartCp ? '#94a3b8' : '#16a34a', display: 'flex', alignItems: 'center', gap: 8 }}>
                                                {isCurrent && <span style={{ fontSize: 10, background: '#16a34a', color: '#fff', padding: '1px 6px', borderRadius: 4 }}>Current</span>}
                                                {record.checkpoint}
                                            </td>
                                            <td style={{ padding: '16px 8px', fontSize: 12, fontWeight: 700, color: '#64748b' }}>
                                                {record.distanceFromStart != null ? `${record.distanceFromStart} KM` : '-'}
                                            </td>
                                            <td style={{ padding: '16px 8px', fontSize: 12, color: '#475569' }}>
                                                {formatTimeOfDay(record.scanTime)}
                                            </td>
                                            <td style={{ padding: '16px 8px', fontSize: 12, fontWeight: 900, color: isFinishCp ? '#16a34a' : '#0f172a' }}>
                                                {displayNetTime ? formatTime(displayNetTime) : (isStartCp ? '00:00:00' : '-')}
                                            </td>
                                            <td style={{ padding: '16px 8px', fontSize: 12, fontWeight: 700, color: '#64748b' }}>
                                                {record.splitTime ? formatTime(record.splitTime) : '-'}
                                            </td>
                                            <td style={{ padding: '16px 24px', textAlign: 'right', fontSize: 12, color: '#475569' }}>
                                                {isStartCp ? '--' : segPace}
                                            </td>
                                        </tr>
                                    );
                                }) : checkpointRows.length > 0 ? checkpointRows.map((cp, i) => {
                                    const passed = i <= passedUpToIdx;
                                    const isCurrent = i === passedUpToIdx && !isFinished;
                                    const isFinishCp = cp.type === 'finish';
                                    const isStartCp = cp.type === 'start';
                                    return (
                                        <tr key={`cp-${i}`} className="checkpoint-row" style={{ background: isCurrent ? 'rgba(34,197,94,0.05)' : undefined, opacity: passed ? 1 : 0.4 }}>
                                            <td style={{ padding: '16px 24px', fontWeight: 700, fontSize: 14, display: 'flex', alignItems: 'center', gap: 8, color: passed ? (isFinishCp ? '#0f172a' : '#16a34a') : '#cbd5e1' }}>
                                                {isCurrent && <span style={{ fontSize: 10, background: '#16a34a', color: '#fff', padding: '1px 6px', borderRadius: 4 }}>Current</span>}
                                                {passed && !isCurrent && <span style={{ color: '#22c55e', fontSize: 14 }}>✓</span>}
                                                {!passed && <span style={{ color: '#cbd5e1', fontSize: 14 }}>○</span>}
                                                {cp.name}
                                            </td>
                                            <td style={{ padding: '16px 8px', fontSize: 12, fontWeight: 700, color: passed ? '#64748b' : '#cbd5e1' }}>
                                                {cp.distanceFromStart != null ? `${cp.distanceFromStart} KM` : '-'}
                                            </td>
                                            <td style={{ padding: '16px 8px', fontSize: 12, color: '#cbd5e1' }}>-</td>
                                            <td style={{ padding: '16px 8px', fontSize: 12, fontWeight: 900, color: passed && isFinishCp ? '#16a34a' : passed ? '#0f172a' : '#cbd5e1' }}>
                                                {passed && isFinished && isFinishCp ? finishTimeStr : '-'}
                                            </td>
                                            <td style={{ padding: '16px 8px', fontSize: 12, color: '#cbd5e1' }}>-</td>
                                            <td style={{ padding: '16px 24px', textAlign: 'right', fontSize: 12, color: '#cbd5e1' }}>
                                                {isStartCp ? '--' : '-'}
                                            </td>
                                        </tr>
                                    );
                                }) : (
                                    <tr>
                                        <td colSpan={6} style={{ padding: '48px 24px', textAlign: 'center', color: '#94a3b8', fontSize: 14 }}>
                                            {runner.status === 'not_started' ? 'ยังไม่เริ่มวิ่ง' : 'ไม่มีข้อมูล Checkpoint'}
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            </main>

            <footer style={{ padding: 32, textAlign: 'center', background: '#fff', borderTop: '1px solid #f1f5f9', marginTop: 40 }}>
                <p style={{ fontSize: 10, fontWeight: 700, color: '#cbd5e1', textTransform: 'uppercase', letterSpacing: 3 }}>ACTION TIMING © 2026</p>
            </footer>
        </div>
    );
}
