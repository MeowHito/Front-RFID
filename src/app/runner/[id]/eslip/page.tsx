'use client';

import { useState, useEffect, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';


interface RunnerData {
    _id: string;
    bib: string;
    firstName: string;
    lastName: string;
    gender: string;
    category: string;
    ageGroup?: string;
    age?: number;
    nationality?: string;
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
    netPace?: string;
    gunPace?: string;
    totalFinishers?: number;
    genderFinishers?: number;
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
    eventDate: string;
    location?: string;
    eslipTemplate?: string;
    eslipTemplates?: string[];
}

function formatTime(ms?: number | null): string {
    if (!ms || ms <= 0) return '--:--:--';
    const totalSeconds = Math.floor(ms / 1000);
    const h = Math.floor(totalSeconds / 3600);
    const m = Math.floor((totalSeconds % 3600) / 60);
    const s = totalSeconds % 60;
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

function parseDistanceValue(value: unknown): number | null {
    const raw = String(value || '').replace(/,/g, '');
    const match = raw.match(/-?\d+(?:\.\d+)?/);
    if (!match) return null;
    const parsed = Number(match[0]);
    return Number.isFinite(parsed) ? parsed : null;
}

// ==================== TEMPLATE 1: Dark Photo Background ====================
function Template1({ runner, timings, campaign, bgImage, slipRef }: TemplateProps) {
    const displayName = `${runner.firstName} ${runner.lastName}`.trim();
    const genderLabel = runner.gender === 'M' ? 'Male' : 'Female';
    const dist = parseDistanceValue(runner.category);
    const pace = runner.netPace || runner.gunPace || '-';
    const finishTime = runner.netTimeStr || runner.gunTimeStr || formatTime(runner.netTime || runner.gunTime);
    const sortedTimings = [...timings].sort((a, b) => (a.order || 0) - (b.order || 0));
    // Show max 5 checkpoints + finish
    const displayTimings = sortedTimings.slice(-6);

    return (
        <div ref={slipRef} style={{
            width: '100%', maxWidth: 380, minHeight: 760, position: 'relative', borderRadius: 30, overflow: 'hidden',
            backgroundImage: bgImage ? `url(${bgImage})` : 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)',
            backgroundSize: 'cover', backgroundPosition: 'center',
            boxShadow: '0 25px 50px -12px rgba(0,0,0,0.7)',
        }}>
            <div style={{
                position: 'absolute', inset: 0,
                background: 'linear-gradient(180deg, rgba(0,0,0,0.8) 0%, rgba(0,0,0,0.2) 20%, rgba(0,0,0,0.2) 60%, rgba(0,0,0,0.95) 100%)',
                display: 'flex', flexDirection: 'column', justifyContent: 'space-between', padding: '40px 25px 30px',
            }}>
                {/* Header */}
                <div style={{ textAlign: 'center', textShadow: '0 2px 5px rgba(0,0,0,0.8)' }}>
                    <div style={{ fontSize: 18, fontWeight: 900, color: '#fff', textTransform: 'uppercase', letterSpacing: 1 }}>{campaign?.name || 'Race Event'}</div>
                    <div style={{ fontSize: 11, fontWeight: 700, color: '#22c55e', letterSpacing: 1, marginTop: 5 }}>{runner.category} • {campaign?.location || ''}</div>
                    <div style={{ fontSize: 14, fontWeight: 900, fontStyle: 'italic', color: 'rgba(255,255,255,0.6)', marginTop: 15 }}>VERIFIED BY ACTION<span>LIVE</span></div>
                </div>

                {/* Bottom Section */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                    {/* Profile */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 15 }}>
                        <div style={{ width: 64, height: 64, borderRadius: '50%', border: '3px solid #22c55e', background: '#16a34a', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 22, fontWeight: 800, flexShrink: 0 }}>
                            {(runner.firstName?.[0] || '') + (runner.lastName?.[0] || '')}
                        </div>
                        <div style={{ minWidth: 0 }}>
                            <div style={{ fontSize: 22, fontWeight: 900, color: '#fff', lineHeight: 1.15, textTransform: 'uppercase', wordBreak: 'break-word' }}>{displayName}</div>
                            <div style={{ fontSize: 13, fontWeight: 600, color: '#cbd5e1', marginTop: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
                                <span style={{ background: '#fff', color: '#000', fontWeight: 900, borderRadius: 6, padding: '2px 8px', fontSize: 12, flexShrink: 0 }}>{runner.bib}</span>
                                <span style={{ opacity: 0.8 }}>{genderLabel} {runner.ageGroup || ''}</span>
                            </div>
                        </div>
                    </div>

                    {/* Ranks */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
                        {[
                            { label: 'Overall', val: runner.overallRank || '-' },
                            { label: 'Gender', val: runner.genderRank || runner.genderNetRank || '-' },
                            { label: 'Category', val: runner.categoryRank || runner.categoryNetRank || '-' },
                        ].map((r, i) => (
                            <div key={i} style={{ background: 'rgba(255,255,255,0.12)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 12, padding: 10, textAlign: 'center' }}>
                                <div style={{ fontSize: 10, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase' }}>{r.label}</div>
                                <div style={{ fontSize: 18, fontWeight: 900, color: '#fff' }}>{r.val}</div>
                            </div>
                        ))}
                    </div>

                    {/* Stats */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '20px 0', borderTop: '1px solid rgba(255,255,255,0.1)', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
                        <div>
                            <div style={{ fontSize: 11, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase' }}>Distance</div>
                            <div style={{ fontSize: 28, fontWeight: 900, color: '#fff', lineHeight: 1, display: 'flex', alignItems: 'baseline' }}>{dist ?? '-'}<span style={{ fontSize: 15, fontWeight: 700, color: '#cbd5e1', marginLeft: 2 }}>km</span></div>
                        </div>
                        <div style={{ textAlign: 'center' }}>
                            <div style={{ fontSize: 11, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase' }}>Pace</div>
                            <div style={{ fontSize: 28, fontWeight: 900, color: '#fff', lineHeight: 1, display: 'flex', alignItems: 'baseline', justifyContent: 'center' }}>{pace}<span style={{ fontSize: 15, fontWeight: 700, color: '#cbd5e1', marginLeft: 2 }}>/km</span></div>
                        </div>
                        <div style={{ textAlign: 'right' }}>
                            <div style={{ fontSize: 11, fontWeight: 700, color: '#4ade80', textTransform: 'uppercase' }}>Total Time</div>
                            <div style={{ fontSize: 28, fontWeight: 900, color: '#4ade80', lineHeight: 1 }}>{finishTime}</div>
                        </div>
                    </div>

                    {/* Checkpoints */}
                    <div style={{ background: 'rgba(0,0,0,0.3)', borderRadius: 15, padding: 15 }}>
                        <div style={{ fontSize: 10, fontWeight: 800, color: '#4ade80', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 10 }}>Checkpoint Splits</div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                            {displayTimings.map((t, i) => {
                                const isFinish = t.checkpoint?.toLowerCase().includes('finish');
                                const displayNetTime = t.netTime ?? t.elapsedTime;
                                return (
                                    <div key={t._id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingBottom: 4, borderBottom: i < displayTimings.length - 1 ? '1px dashed rgba(255,255,255,0.1)' : 'none' }}>
                                        <span style={{ fontSize: 11, fontWeight: 600, color: isFinish ? '#22c55e' : '#e2e8f0' }}>{t.checkpoint}{t.distanceFromStart ? ` (${t.distanceFromStart}K)` : ''}</span>
                                        <span style={{ fontSize: 12, fontWeight: 800, color: isFinish ? '#22c55e' : '#fff', fontFamily: 'monospace' }}>{displayNetTime ? formatTime(displayNetTime) : '-'}</span>
                                    </div>
                                );
                            })}
                            {displayTimings.length === 0 && (
                                <div style={{ textAlign: 'center', fontSize: 11, color: 'rgba(255,255,255,0.3)', padding: 8 }}>No checkpoint data</div>
                            )}
                        </div>
                    </div>
                    <div style={{ textAlign: 'center', fontSize: 10, color: 'rgba(255,255,255,0.3)', fontWeight: 700, letterSpacing: 2 }}>ACTION TIMING OFFICIAL RESULT</div>
                </div>
            </div>
        </div>
    );
}

// ==================== TEMPLATE 2: Semi-transparent Photo Background ====================
function Template2({ runner, timings, campaign, bgImage, slipRef }: TemplateProps) {
    const displayName = `${runner.firstName} ${runner.lastName}`.trim();
    const genderLabel = runner.gender === 'M' ? 'Male' : 'Female';
    const dist = parseDistanceValue(runner.category);
    const pace = runner.netPace || runner.gunPace || '-';
    const finishTime = runner.netTimeStr || runner.gunTimeStr || formatTime(runner.netTime || runner.gunTime);
    const sortedTimings = [...timings].sort((a, b) => (a.order || 0) - (b.order || 0));
    const displayTimings = sortedTimings.slice(-4);

    return (
        <div ref={slipRef} style={{
            width: '100%', maxWidth: 380, minHeight: 760, position: 'relative', borderRadius: 35, overflow: 'hidden',
            backgroundImage: bgImage ? `url(${bgImage})` : 'linear-gradient(135deg, #1e293b 0%, #334155 100%)',
            backgroundSize: 'cover', backgroundPosition: 'center',
            boxShadow: '0 25px 50px -12px rgba(0,0,0,0.5)',
        }}>
            <div style={{
                position: 'absolute', inset: 0,
                background: 'linear-gradient(to bottom, rgba(0,0,0,0.6) 0%, rgba(0,0,0,0) 25%, rgba(0,0,0,0) 65%, rgba(0,0,0,0.7) 100%)',
                display: 'flex', flexDirection: 'column', justifyContent: 'space-between', padding: '35px 25px',
            }}>
                {/* Header */}
                <div style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: 28, fontWeight: 900, color: '#fff', textTransform: 'uppercase', lineHeight: 1.1, textShadow: '0 2px 4px rgba(0,0,0,0.8)' }}>{campaign?.name || 'Race Event'}</div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: '#4ade80', textTransform: 'uppercase', letterSpacing: 2, marginTop: 8, textShadow: '0 2px 4px rgba(0,0,0,0.8)' }}>{runner.category}</div>
                </div>

                {/* Bottom Panel */}
                <div style={{ background: 'rgba(0,0,0,0.5)', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 25, padding: 20, marginBottom: 5 }}>
                    {/* Rank Tags */}
                    <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
                        {[
                            { label: 'OVERALL', val: runner.overallRank || '-' },
                            { label: 'GENDER', val: runner.genderRank || runner.genderNetRank || '-' },
                            { label: 'CATEGORY', val: runner.categoryRank || runner.categoryNetRank || '-' },
                        ].map((r, i) => (
                            <div key={i} style={{ background: '#16a34a', color: '#fff', fontSize: 10, fontWeight: 800, padding: '3px 10px', borderRadius: 6, boxShadow: '0 2px 4px rgba(0,0,0,0.3)' }}>{r.label} #{r.val}</div>
                        ))}
                    </div>

                    {/* Runner Info */}
                    <div style={{ marginBottom: 16 }}>
                        <h1 style={{ fontSize: 30, fontWeight: 900, color: '#fff', textTransform: 'uppercase', lineHeight: 1, margin: 0, textShadow: '0 2px 4px rgba(0,0,0,0.8)' }}>{displayName}</h1>
                        <p style={{ fontSize: 13, fontWeight: 600, color: '#cbd5e1', margin: '6px 0 0', textShadow: '0 1px 3px rgba(0,0,0,0.8)' }}>BIB {runner.bib} • {genderLabel} {runner.ageGroup || ''}</p>
                    </div>

                    {/* Stats Grid */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, paddingBottom: 15, borderBottom: '1px solid rgba(255,255,255,0.15)' }}>
                        <div style={{ textAlign: 'center' }}>
                            <div style={{ fontSize: 10, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', marginBottom: 4 }}>Distance</div>
                            <div style={{ fontSize: 19, fontWeight: 900, color: '#fff', textShadow: '0 2px 4px rgba(0,0,0,0.5)' }}>{dist ?? '-'}<span style={{ fontSize: 11, color: '#94a3b8', marginLeft: 2 }}>KM</span></div>
                        </div>
                        <div style={{ textAlign: 'center' }}>
                            <div style={{ fontSize: 10, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', marginBottom: 4 }}>Avg Pace</div>
                            <div style={{ fontSize: 19, fontWeight: 900, color: '#fff', textShadow: '0 2px 4px rgba(0,0,0,0.5)' }}>{pace}<span style={{ fontSize: 11, color: '#94a3b8', marginLeft: 2 }}>/K</span></div>
                        </div>
                        <div style={{ textAlign: 'center' }}>
                            <div style={{ fontSize: 10, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', marginBottom: 4 }}>Finish Time</div>
                            <div style={{ fontSize: 19, fontWeight: 900, color: '#4ade80', textShadow: '0 2px 4px rgba(0,0,0,0.5)' }}>{finishTime}</div>
                        </div>
                    </div>

                    {/* Splits */}
                    <div style={{ marginTop: 15, display: 'flex', flexDirection: 'column', gap: 8 }}>
                        {displayTimings.map((t) => {
                            const isFinish = t.checkpoint?.toLowerCase().includes('finish');
                            const netMs = t.netTime ?? t.elapsedTime;
                            return (
                                <div key={t._id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, fontWeight: 600, color: isFinish ? '#4ade80' : '#e2e8f0' }}>
                                    <span style={{ textShadow: '0 1px 3px rgba(0,0,0,0.8)' }}>{t.checkpoint}{t.distanceFromStart ? ` (${t.distanceFromStart}K)` : ''}</span>
                                    <span style={{ fontFamily: 'monospace', fontWeight: 800, color: isFinish ? '#4ade80' : '#fff', textShadow: '0 1px 3px rgba(0,0,0,0.8)' }}>{netMs ? formatTime(netMs) : '-'}</span>
                                </div>
                            );
                        })}
                    </div>

                    <div style={{ textAlign: 'center', fontSize: 9, fontWeight: 700, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: 4, marginTop: 20 }}>Verified Result</div>
                </div>
            </div>
        </div>
    );
}

// ==================== TEMPLATE 3: Clean White Card ====================
function Template3({ runner, timings, campaign, slipRef }: TemplateProps) {
    const displayName = `${runner.firstName} ${runner.lastName}`.trim();
    const genderLabel = runner.gender === 'M' ? 'Male' : 'Female';
    const dist = parseDistanceValue(runner.category);
    const pace = runner.netPace || runner.gunPace || '-';
    const finishTime = runner.netTimeStr || runner.gunTimeStr || formatTime(runner.netTime || runner.gunTime);
    const sortedTimings = [...timings].sort((a, b) => (a.order || 0) - (b.order || 0));
    const displayTimings = sortedTimings.slice(-7);

    return (
        <div ref={slipRef} style={{
            width: '100%', maxWidth: 360, minHeight: 720, background: '#fff', borderRadius: 32, overflow: 'hidden',
            boxShadow: '0 25px 50px -12px rgba(0,0,0,0.15)', border: '1px solid #e2e8f0',
            display: 'flex', flexDirection: 'column',
        }}>
            {/* Header */}
            <div style={{ background: '#f8fafc', padding: '35px 20px 25px', textAlign: 'center', borderBottom: '1px solid #f1f5f9' }}>
                <div style={{ fontSize: 22, fontWeight: 900, color: '#0f172a', textTransform: 'uppercase', lineHeight: 1.1 }}>{campaign?.name || 'Race Event'}</div>
                <div style={{ fontSize: 12, fontWeight: 600, color: '#64748b', marginTop: 4 }}>{runner.category} • {new Date(campaign?.eventDate || '').getFullYear()}</div>
            </div>

            {/* Content */}
            <div style={{ padding: '25px 15px', display: 'flex', flexDirection: 'column', flexGrow: 1, overflow: 'hidden' }}>
                {/* Runner */}
                <div style={{ textAlign: 'center', marginBottom: 20 }}>
                    <div style={{ background: '#0f172a', color: '#fff', padding: '2px 12px', borderRadius: 8, fontSize: 14, fontWeight: 800, display: 'inline-block', marginBottom: 8 }}>{runner.bib}</div>
                    <div style={{ fontSize: 28, fontWeight: 900, textTransform: 'uppercase', color: '#0f172a', lineHeight: 1 }}>{displayName}</div>
                    <div style={{ fontSize: 12, fontWeight: 600, color: '#64748b', marginTop: 4 }}>{runner.category} | {genderLabel} {runner.ageGroup || ''}</div>
                </div>

                {/* Stats Panel */}
                <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 20, padding: '15px 5px', display: 'flex', justifyContent: 'space-around', alignItems: 'center', marginBottom: 20 }}>
                    {[
                        { label: 'Distance', val: `${dist ?? '-'}`, unit: 'KM' },
                        { label: 'Avg Pace', val: pace, unit: '/K' },
                        { label: 'Total Time', val: finishTime, unit: '', isGreen: true },
                    ].map((s, i) => (
                        <div key={i} style={{ flex: 1, textAlign: 'center', position: 'relative' }}>
                            {i < 2 && <div style={{ position: 'absolute', right: 0, top: '20%', height: '60%', width: 1, background: '#f1f5f9' }} />}
                            <div style={{ fontSize: 8, fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase', marginBottom: 4 }}>{s.label}</div>
                            <div style={{ fontSize: 18, fontWeight: 900, color: s.isGreen ? '#16a34a' : '#0f172a', lineHeight: 1 }}>{s.val}{s.unit && <span style={{ fontSize: 10, color: '#94a3b8' }}>{s.unit}</span>}</div>
                        </div>
                    ))}
                </div>

                {/* Rank Grid */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6, marginBottom: 20 }}>
                    {[
                        { label: 'Overall', val: runner.overallRank || '-' },
                        { label: 'Gender', val: runner.genderRank || runner.genderNetRank || '-' },
                        { label: 'Category', val: runner.categoryRank || runner.categoryNetRank || '-' },
                    ].map((r, i) => (
                        <div key={i} style={{ background: '#f8fafc', borderRadius: 12, padding: '10px 4px', textAlign: 'center', border: '1px solid #f1f5f9' }}>
                            <div style={{ fontSize: 16, fontWeight: 900, color: '#0f172a' }}>{r.val}</div>
                            <div style={{ fontSize: 8, fontWeight: 800, color: '#64748b', textTransform: 'uppercase' }}>{r.label}</div>
                        </div>
                    ))}
                </div>

                {/* Checkpoints */}
                <div style={{ background: '#fff', borderRadius: 16, padding: 12, border: '1px solid #f1f5f9', flexGrow: 1, display: 'flex', flexDirection: 'column' }}>
                    <div style={{ fontSize: 10, fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase', marginBottom: 10 }}>Checkpoint Splits</div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                        {displayTimings.map((t) => {
                            const isFinish = t.checkpoint?.toLowerCase().includes('finish');
                            const netMs = t.netTime ?? t.elapsedTime;
                            return (
                                <div key={t._id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8, ...(isFinish ? { background: '#f0fdf4', borderRadius: 4, padding: '2px 4px', marginTop: 4 } : {}) }}>
                                    <span style={{ fontSize: 11, fontWeight: isFinish ? 800 : 600, color: isFinish ? '#15803d' : '#475569', whiteSpace: 'nowrap' }}>{isFinish ? 'FINISH LINE' : t.checkpoint}</span>
                                    <span style={{ flexGrow: 1, borderBottom: '1px dotted #e2e8f0', position: 'relative', top: -4 }} />
                                    <span style={{ fontSize: isFinish ? 14 : 12, fontWeight: 800, color: isFinish ? '#15803d' : '#0f172a', fontFamily: 'monospace', whiteSpace: 'nowrap' }}>{netMs ? formatTime(netMs) : '-'}</span>
                                </div>
                            );
                        })}
                        {displayTimings.length === 0 && (
                            <div style={{ textAlign: 'center', fontSize: 11, color: '#94a3b8', padding: 12 }}>No checkpoint data</div>
                        )}
                    </div>
                </div>

                <div style={{ textAlign: 'center', fontSize: 9, color: '#cbd5e1', marginTop: 'auto', paddingTop: 15, fontWeight: 700, letterSpacing: 2 }}>OFFICIAL RESULT BY ACTION TIMING</div>
            </div>
        </div>
    );
}

interface TemplateProps {
    runner: RunnerData;
    timings: TimingRecord[];
    campaign: CampaignData | null;
    bgImage: string | null;
    slipRef: React.RefObject<HTMLDivElement | null>;
}

export default function ESlipPage() {
    const params = useParams();
    const router = useRouter();
    const runnerId = params.id as string;
    const slipRef = useRef<HTMLDivElement>(null);

    const [runner, setRunner] = useState<RunnerData | null>(null);
    const [timings, setTimings] = useState<TimingRecord[]>([]);
    const [campaign, setCampaign] = useState<CampaignData | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [bgImage, setBgImage] = useState<string | null>(null);
    const [downloading, setDownloading] = useState(false);
    const [activeTemplate, setActiveTemplate] = useState<string>('template2');
    const [availableTemplates, setAvailableTemplates] = useState<string[]>(['template2', 'template1', 'template3']);

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
                    const c = json.data.campaign;
                    setCampaign(c || null);
                    // Set available templates from admin config
                    const adminTemplates = c?.eslipTemplates;
                    if (Array.isArray(adminTemplates) && adminTemplates.length > 0) {
                        setAvailableTemplates(adminTemplates);
                        // Prefer non-white template as default
                        const preferred = adminTemplates.find(t => t !== 'template3') || adminTemplates[0];
                        setActiveTemplate(preferred);
                    } else if (c?.eslipTemplate) {
                        setActiveTemplate(c.eslipTemplate);
                    }
                } else {
                    setError(json.status?.description || 'Runner not found');
                }
            } catch (err: any) {
                setError(err.message || 'Failed to load');
            } finally {
                setLoading(false);
            }
        })();
    }, [runnerId]);

    const handleBgUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        if (file.size > 5 * 1024 * 1024) {
            // Auto-compress large images instead of rejecting
            try {
                const { compressImage } = await import('@/lib/image-utils');
                const compressed = await compressImage(file);
                setBgImage(compressed);
            } catch (err) {
                console.error('Compress error:', err);
                alert('ไม่สามารถบีบอัดรูปภาพได้');
            }
        } else {
            const reader = new FileReader();
            reader.onload = (ev) => setBgImage(ev.target?.result as string);
            reader.readAsDataURL(file);
        }
    };

    const handleDownload = async () => {
        if (!slipRef.current) return;
        setDownloading(true);
        try {
            const html2canvas = (await import('html2canvas')).default;
            const canvas = await html2canvas(slipRef.current, { scale: 3, backgroundColor: activeTemplate === 'template3' ? '#f1f5f9' : '#0f172a', useCORS: true });
            const fileName = `ACTION_ESlip_${runner?.bib || 'runner'}.jpg`;
            const dataUrl = canvas.toDataURL('image/jpeg', 0.95);
            const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);

            if (isMobile) {
                // Mobile: open image directly in new tab for long-press → Save to Photos
                const newTab = window.open('', '_blank');
                if (newTab) {
                    newTab.document.write(`<!DOCTYPE html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><title>E-Slip ${runner?.bib || ''}</title><style>*{margin:0;padding:0;box-sizing:border-box;}body{background:#0f172a;display:flex;justify-content:center;align-items:center;min-height:100vh;flex-direction:column;gap:16px;padding:16px;} img{max-width:100%;border-radius:16px;box-shadow:0 8px 32px rgba(0,0,0,0.5);} .hint{color:#94a3b8;font-size:14px;font-family:'Prompt',sans-serif;text-align:center;padding:8px 20px;background:rgba(255,255,255,0.08);border-radius:12px;line-height:1.6;} .hint b{color:#4ade80;}</style></head><body><img src="${dataUrl}"><div class="hint">📲 <b>กดค้างที่รูป</b> → เลือก <b>"เพิ่มไปยังรูปภาพ"</b><br>เพื่อบันทึกลงแกลเลอรีของคุณ</div></body></html>`);
                    newTab.document.close();
                }
                setDownloading(false);
                return;
            }

            // Desktop: regular file download
            const link = document.createElement('a');
            link.download = fileName;
            link.href = dataUrl;
            link.click();
        } catch (err) { console.error('E-Slip download error:', err); }
        finally { setDownloading(false); }
    };

    if (loading) {
        return (
            <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#0f172a', fontFamily: "'Prompt', sans-serif" }}>
                <div style={{ textAlign: 'center' }}>
                    <div style={{ width: 40, height: 40, border: '3px solid #334155', borderTopColor: '#22c55e', borderRadius: '50%', animation: 'spin 1s linear infinite', margin: '0 auto 16px' }} />
                    <p style={{ color: '#94a3b8', fontSize: 14 }}>กำลังโหลด...</p>
                    <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
                </div>
            </div>
        );
    }

    if (error || !runner) {
        return (
            <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#0f172a', fontFamily: "'Prompt', sans-serif" }}>
                <div style={{ textAlign: 'center', color: '#fff' }}>
                    <p style={{ fontSize: 48, marginBottom: 16 }}>😔</p>
                    <p style={{ color: '#94a3b8' }}>{error || 'ไม่พบข้อมูล'}</p>
                    <button onClick={() => router.back()} style={{ marginTop: 16, padding: '8px 24px', borderRadius: 8, background: '#22c55e', color: '#fff', fontWeight: 600, border: 'none', cursor: 'pointer' }}>ย้อนกลับ</button>
                </div>
            </div>
        );
    }

    if (runner.status !== 'finished') {
        return (
            <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#0f172a', fontFamily: "'Prompt', sans-serif" }}>
                <div style={{ textAlign: 'center', color: '#fff', maxWidth: 400, padding: 32 }}>
                    <p style={{ fontSize: 48, marginBottom: 16 }}>⏳</p>
                    <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 8 }}>นักวิ่งยังไม่จบการแข่งขัน</h2>
                    <p style={{ color: '#94a3b8', marginBottom: 16 }}>E-Slip จะพร้อมใช้งานเมื่อนักวิ่ง Finish แล้วเท่านั้น</p>
                    <button onClick={() => router.back()} style={{ padding: '10px 24px', borderRadius: 12, background: '#22c55e', color: '#fff', fontWeight: 700, border: 'none', cursor: 'pointer' }}>ย้อนกลับ</button>
                </div>
            </div>
        );
    }

    const bgColor = activeTemplate === 'template3' ? '#f1f5f9' : '#0f172a';

    return (
        <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', background: bgColor, fontFamily: "'Prompt', sans-serif" }}>
            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>

            {/* HEADER / NAVBAR */}
            <header style={{ background: activeTemplate === 'template3' ? '#fff' : '#1e293b', borderBottom: `1px solid ${activeTemplate === 'template3' ? '#e2e8f0' : 'rgba(255,255,255,0.1)'}`, padding: '10px 16px', width: '100%', position: 'sticky', top: 0, zIndex: 50 }}>
                <div style={{ maxWidth: 1024, margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        <Link href="/" style={{ display: 'flex', alignItems: 'center', borderRight: `1px solid ${activeTemplate === 'template3' ? '#e2e8f0' : 'rgba(255,255,255,0.2)'}`, paddingRight: 12, textDecoration: 'none' }}>
                            <Image src={activeTemplate === 'template3' ? '/logo-black.png' : '/logo-white.png'} alt="ACTION" width={80} height={26} style={{ objectFit: 'contain' }} />
                        </Link>
                        <span style={{ fontSize: 14, fontWeight: 800, color: '#22c55e', textTransform: 'uppercase' }}>E-Slip</span>
                    </div>
                    <button onClick={() => router.back()} style={{ fontSize: 12, fontWeight: 700, color: activeTemplate === 'template3' ? '#64748b' : '#94a3b8', background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}>
                        ← กลับหน้าผลการแข่งขัน
                    </button>
                </div>
            </header>

            <div style={{ padding: '20px 10px', display: 'flex', flexDirection: 'column', alignItems: 'center', width: '100%' }}>

                {/* Template Selector — show buttons for admin-enabled templates */}
                {availableTemplates.length > 1 && (
                    <div style={{
                        marginBottom: 16, display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'center',
                    }}>
                        {availableTemplates.map(t => {
                            const isActive = activeTemplate === t;
                            const label = t === 'template1' ? '🌙 Dark' : t === 'template2' ? '📷 Photo' : '🤍 White';
                            const isWhiteTheme = activeTemplate === 'template3';
                            return (
                                <button
                                    key={t}
                                    onClick={() => setActiveTemplate(t)}
                                    style={{
                                        padding: '10px 20px', borderRadius: 14, fontSize: 14, fontWeight: 800,
                                        cursor: 'pointer', transition: 'all 0.2s ease',
                                        border: isActive
                                            ? '2px solid #22c55e'
                                            : isWhiteTheme ? '2px solid #e2e8f0' : '2px solid rgba(255,255,255,0.15)',
                                        background: isActive
                                            ? 'linear-gradient(135deg, #16a34a 0%, #22c55e 100%)'
                                            : isWhiteTheme ? 'rgba(0,0,0,0.03)' : 'rgba(255,255,255,0.08)',
                                        color: isActive ? '#fff' : isWhiteTheme ? '#475569' : 'rgba(255,255,255,0.7)',
                                        boxShadow: isActive ? '0 4px 12px rgba(34,197,94,0.4)' : 'none',
                                        transform: isActive ? 'scale(1.05)' : 'scale(1)',
                                        minWidth: 100,
                                    }}
                                >
                                    {label}
                                </button>
                            );
                        })}
                    </div>
                )}

                {/* Render Active Template */}
                {activeTemplate === 'template1' && <Template1 runner={runner} timings={timings} campaign={campaign} bgImage={bgImage} slipRef={slipRef} />}
                {activeTemplate === 'template2' && <Template2 runner={runner} timings={timings} campaign={campaign} bgImage={bgImage} slipRef={slipRef} />}
                {activeTemplate === 'template3' && <Template3 runner={runner} timings={timings} campaign={campaign} bgImage={null} slipRef={slipRef} />}

                {/* Action Buttons */}
                <div style={{ display: 'flex', gap: 12, width: '100%', maxWidth: 380, marginTop: 20 }}>
                    {activeTemplate !== 'template3' && (
                        <>
                            <input type="file" id="eslip-bg" accept="image/*" style={{ display: 'none' }} onChange={handleBgUpload} />
                            <label htmlFor="eslip-bg" style={{ flex: 1, padding: 15, borderRadius: 15, fontWeight: 800, fontSize: 14, textAlign: 'center', cursor: 'pointer', background: '#fff', color: '#000', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 8 }}>
                                📷 เลือกรูปถ่าย
                            </label>
                        </>
                    )}
                    <button onClick={handleDownload} disabled={downloading} style={{
                        flex: 1, padding: 15, borderRadius: 15, fontWeight: 800, fontSize: 14, textAlign: 'center', cursor: downloading ? 'wait' : 'pointer',
                        background: '#16a34a', color: '#fff', border: 'none', opacity: downloading ? 0.7 : 1,
                        display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 8,
                    }}>
                        {downloading ? '⏳ กำลังประมวลผล...' : '📥 บันทึกภาพ'}
                    </button>
                </div>

                {/* Back link */}
                <button onClick={() => router.back()} style={{ marginTop: 20, background: 'none', border: 'none', color: '#64748b', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
                    ← ย้อนกลับ
                </button>
            </div>
        </div>
    );
}
