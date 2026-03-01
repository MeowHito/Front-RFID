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

interface TemplateProps {
    runner: RunnerData;
    timings: TimingRecord[];
    campaign: CampaignData | null;
    bgImage: string | null;
    slipRef: React.RefObject<HTMLDivElement | null>;
}

// ==================== TEMPLATE 1: Dark Photo Background ====================
function Template1({ runner, timings, campaign, bgImage, slipRef }: TemplateProps) {
    const displayName = `${runner.firstName} ${runner.lastName}`.trim();
    const genderLabel = runner.gender === 'M' ? 'Male' : 'Female';
    const dist = parseDistanceValue(runner.category);
    const pace = runner.netPace || runner.gunPace || '-';
    const gunTimeStr = runner.gunTimeStr || formatTime(runner.gunTime);
    const netTimeStr = runner.netTimeStr || formatTime(runner.netTime);
    const sortedTimings = [...timings].sort((a, b) => (a.order || 0) - (b.order || 0));
    const displayTimings = sortedTimings.slice(-6);

    return (
        <div ref={slipRef} className="w-full max-w-[380px] relative rounded-[30px] overflow-hidden shadow-2xl">
            {/* Background image layer */}
            {bgImage && (
                <div
                    className="absolute inset-0 bg-cover bg-center z-0"
                    style={{ backgroundImage: `url(${bgImage})` }}
                />
            )}
            {/* Gradient overlay */}
            <div className={`absolute inset-0 z-[1] ${bgImage ? '' : 'bg-gradient-to-br from-slate-900 to-slate-800'}`}
                style={bgImage ? { background: 'linear-gradient(180deg, rgba(0,0,0,0.8) 0%, rgba(0,0,0,0.2) 20%, rgba(0,0,0,0.2) 50%, rgba(0,0,0,0.95) 100%)' } : {}}
            />

            {/* Content */}
            <div className="relative z-[2] flex flex-col justify-between min-h-[760px] px-6 pt-10 pb-7">
                {/* Header */}
                <div className="text-center" style={{ textShadow: '0 2px 5px rgba(0,0,0,0.8)' }}>
                    <div className="text-lg font-black text-white uppercase tracking-wide">{campaign?.name || 'Race Event'}</div>
                    <div className="text-[11px] font-bold text-green-400 tracking-wide mt-1">{runner.category} • {campaign?.location || ''}</div>

                </div>

                {/* Bottom Section */}
                <div className="flex flex-col gap-4">
                    {/* Profile */}
                    <div className="flex items-center gap-4">
                        <div className="w-16 h-16 rounded-full border-[3px] border-green-500 bg-green-600 flex items-center justify-center text-white text-[22px] font-extrabold shrink-0">
                            {(runner.firstName?.[0] || '') + (runner.lastName?.[0] || '')}
                        </div>
                        <div className="min-w-0">
                            <div className="text-[22px] font-black text-white leading-tight uppercase break-words">{displayName}</div>
                            <div className="text-[13px] font-semibold text-slate-300 mt-2 flex items-center gap-1.5">
                                <span className="bg-white text-black font-black rounded-md px-2 py-0.5 text-xs shrink-0">{runner.bib}</span>
                                <span className="opacity-80">{genderLabel} {runner.ageGroup || ''}</span>
                            </div>
                        </div>
                    </div>

                    {/* Ranks + Times — unified card */}
                    <div className="bg-white/10 border border-white/10 rounded-2xl p-4">
                        {/* Top row: Overall / Gender / Category */}
                        <div className="grid grid-cols-3 gap-3 pb-3 border-b border-white/10">
                            {[
                                { label: 'Overall', val: runner.overallRank || '-' },
                                { label: 'Gender', val: runner.genderRank || runner.genderNetRank || '-' },
                                { label: 'Category', val: runner.categoryRank || runner.categoryNetRank || '-' },
                            ].map((r, i) => (
                                <div key={i} className="text-center">
                                    <div className="text-[10px] font-black text-black text-stroke-white uppercase">{r.label}</div>
                                    <div className="text-xl font-black text-white">{r.val}</div>
                                </div>
                            ))}
                        </div>
                        {/* Bottom row: Gun Time / Net Time */}
                        <div className="grid grid-cols-2 gap-3 pt-3">
                            <div className="text-center">
                                <div className="text-[10px] font-black text-black text-stroke-white uppercase mb-1">Gun Time</div>
                                <div className="text-xl font-black text-white font-mono tracking-wide">{gunTimeStr}</div>
                            </div>
                            <div className="text-center">
                                <div className="text-[10px] font-black text-black text-stroke-white uppercase mb-1">Net Time</div>
                                <div className="text-xl font-black text-green-400 font-mono tracking-wide">{netTimeStr}</div>
                            </div>
                        </div>
                    </div>

                    {/* Distance / Pace */}
                    <div className="flex justify-around py-3 border-t border-b border-white/10">
                        <div className="text-center">
                            <div className="text-[10px] font-bold text-slate-400 uppercase">Distance</div>
                            <div className="text-[22px] font-black text-white leading-snug flex items-baseline justify-center">{dist ?? '-'}<span className="text-[13px] font-bold text-slate-300 ml-0.5">km</span></div>
                        </div>
                        <div className="text-center">
                            <div className="text-[10px] font-bold text-slate-400 uppercase">Pace</div>
                            <div className="text-[22px] font-black text-white leading-snug flex items-baseline justify-center">{pace}<span className="text-[13px] font-bold text-slate-300 ml-0.5">/km</span></div>
                        </div>
                    </div>

                    {/* Checkpoints */}
                    <div className="bg-black/30 rounded-2xl p-4">
                        <div className="text-[10px] font-extrabold text-green-400 uppercase tracking-widest mb-2.5">Checkpoint Splits</div>
                        <div className="flex flex-col gap-2">
                            {displayTimings.map((t, i) => {
                                const isFinish = t.checkpoint?.toLowerCase().includes('finish');
                                const displayNetTime = t.netTime ?? t.elapsedTime;
                                return (
                                    <div key={t._id} className={`flex justify-between items-center pb-1 ${i < displayTimings.length - 1 ? 'border-b border-dashed border-white/10' : ''}`}>
                                        <span className={`text-[11px] font-semibold ${isFinish ? 'text-green-500' : 'text-slate-200'}`}>{t.checkpoint}{t.distanceFromStart ? ` (${t.distanceFromStart}K)` : ''}</span>
                                        <span className={`text-xs font-extrabold font-mono ${isFinish ? 'text-green-500' : 'text-white'}`}>{displayNetTime ? formatTime(displayNetTime) : '-'}</span>
                                    </div>
                                );
                            })}
                            {displayTimings.length === 0 && (
                                <div className="text-center text-[11px] text-white/30 py-2">No checkpoint data</div>
                            )}
                        </div>
                    </div>
                    <div className="text-center text-[10px] text-white/30 font-bold tracking-[2px]">ACTION TIMING OFFICIAL RESULT</div>
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
    const gunTimeStr = runner.gunTimeStr || formatTime(runner.gunTime);
    const netTimeStr = runner.netTimeStr || formatTime(runner.netTime);
    const sortedTimings = [...timings].sort((a, b) => (a.order || 0) - (b.order || 0));
    const displayTimings = sortedTimings.slice(-4);

    return (
        <div ref={slipRef} className="w-full max-w-[380px] relative rounded-[35px] overflow-hidden shadow-2xl">
            {/* Background image layer */}
            {bgImage && (
                <div
                    className="absolute inset-0 bg-cover bg-center z-0"
                    style={{ backgroundImage: `url(${bgImage})` }}
                />
            )}
            {/* Gradient overlay */}
            <div className={`absolute inset-0 z-[1] ${bgImage ? '' : 'bg-gradient-to-br from-slate-800 to-slate-600'}`}
                style={bgImage ? { background: 'linear-gradient(to bottom, rgba(0,0,0,0.6) 0%, rgba(0,0,0,0) 25%, rgba(0,0,0,0) 65%, rgba(0,0,0,0.7) 100%)' } : {}}
            />

            {/* Content */}
            <div className="relative z-[2] flex flex-col justify-between min-h-[760px] px-6 py-9">
                {/* Header */}
                <div className="text-center">
                    <div className="text-[28px] font-black text-white uppercase leading-tight" style={{ textShadow: '0 2px 4px rgba(0,0,0,0.8)' }}>{campaign?.name || 'Race Event'}</div>
                    <div className="text-[13px] font-bold text-green-400 uppercase tracking-[2px] mt-2" style={{ textShadow: '0 2px 4px rgba(0,0,0,0.8)' }}>{runner.category}</div>
                </div>

                {/* Bottom Panel */}
                <div className="bg-black/50 border border-white/15 rounded-[25px] p-5 mb-1">
                    {/* Rank Tags */}
                    <div className="flex gap-2 mb-3">
                        {[
                            { label: 'OVERALL', val: runner.overallRank || '-' },
                            { label: 'GENDER', val: runner.genderRank || runner.genderNetRank || '-' },
                            { label: 'CATEGORY', val: runner.categoryRank || runner.categoryNetRank || '-' },
                        ].map((r, i) => (
                            <div key={i} className="bg-green-600 text-white text-[10px] font-extrabold px-2.5 py-0.5 rounded-md shadow-md">{r.label} #{r.val}</div>
                        ))}
                    </div>

                    {/* Runner Info */}
                    <div className="mb-4">
                        <h1 className="text-[30px] font-black text-white uppercase leading-none m-0" style={{ textShadow: '0 2px 4px rgba(0,0,0,0.8)' }}>{displayName}</h1>
                        <p className="text-[13px] font-semibold text-slate-300 mt-1.5" style={{ textShadow: '0 1px 3px rgba(0,0,0,0.8)' }}>BIB {runner.bib} • {genderLabel} {runner.ageGroup || ''}</p>
                    </div>

                    {/* Gun Time & Net Time */}
                    <div className="grid grid-cols-2 gap-2.5 mb-3">
                        <div className="bg-white/5 border border-white/10 rounded-xl py-2.5 px-3 text-center">
                            <div className="text-[10px] font-bold text-slate-400 uppercase mb-1">Gun Time</div>
                            <div className="text-lg font-black text-black text-stroke-white font-mono tracking-wide">{gunTimeStr}</div>
                        </div>
                        <div className="bg-green-500/15 border border-green-500/30 rounded-xl py-2.5 px-3 text-center">
                            <div className="text-[10px] font-bold text-green-400 uppercase mb-1">Net Time</div>
                            <div className="text-lg font-black text-green-400 font-mono tracking-wide">{netTimeStr}</div>
                        </div>
                    </div>

                    {/* Stats Grid */}
                    <div className="grid grid-cols-2 gap-3 pb-4 border-b border-white/15">
                        <div className="text-center">
                            <div className="text-[10px] font-bold text-slate-400 uppercase mb-1">Distance</div>
                            <div className="text-[19px] font-black text-white" style={{ textShadow: '0 2px 4px rgba(0,0,0,0.5)' }}>{dist ?? '-'}<span className="text-[11px] text-slate-400 ml-0.5">KM</span></div>
                        </div>
                        <div className="text-center">
                            <div className="text-[10px] font-bold text-slate-400 uppercase mb-1">Avg Pace</div>
                            <div className="text-[19px] font-black text-white" style={{ textShadow: '0 2px 4px rgba(0,0,0,0.5)' }}>{pace}<span className="text-[11px] text-slate-400 ml-0.5">/K</span></div>
                        </div>
                    </div>

                    {/* Splits */}
                    <div className="mt-4 flex flex-col gap-2">
                        {displayTimings.map((t) => {
                            const isFinish = t.checkpoint?.toLowerCase().includes('finish');
                            const netMs = t.netTime ?? t.elapsedTime;
                            return (
                                <div key={t._id} className={`flex justify-between text-xs font-semibold ${isFinish ? 'text-green-400' : 'text-slate-200'}`}>
                                    <span style={{ textShadow: '0 1px 3px rgba(0,0,0,0.8)' }}>{t.checkpoint}{t.distanceFromStart ? ` (${t.distanceFromStart}K)` : ''}</span>
                                    <span className={`font-mono font-extrabold ${isFinish ? 'text-green-400' : 'text-white'}`} style={{ textShadow: '0 1px 3px rgba(0,0,0,0.8)' }}>{netMs ? formatTime(netMs) : '-'}</span>
                                </div>
                            );
                        })}
                    </div>

                    <div className="text-center text-[9px] font-bold text-white/40 uppercase tracking-[4px] mt-5">Verified Result</div>
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
    const gunTimeStr = runner.gunTimeStr || formatTime(runner.gunTime);
    const netTimeStr = runner.netTimeStr || formatTime(runner.netTime);
    const sortedTimings = [...timings].sort((a, b) => (a.order || 0) - (b.order || 0));
    const displayTimings = sortedTimings.slice(-7);

    return (
        <div ref={slipRef} className="w-full max-w-[360px] min-h-[720px] bg-white rounded-[32px] overflow-hidden shadow-xl border border-slate-200 flex flex-col">
            {/* Header */}
            <div className="bg-slate-50 px-5 pt-9 pb-6 text-center border-b border-slate-100">
                <div className="text-[22px] font-black text-slate-900 uppercase leading-tight">{campaign?.name || 'Race Event'}</div>
                <div className="text-xs font-semibold text-slate-500 mt-1">{runner.category} • {new Date(campaign?.eventDate || '').getFullYear()}</div>
            </div>

            {/* Content */}
            <div className="px-4 py-6 flex flex-col grow overflow-hidden">
                {/* Runner */}
                <div className="text-center mb-5">
                    <div className="bg-slate-900 text-white px-3 py-0.5 rounded-lg text-sm font-extrabold inline-block mb-2">{runner.bib}</div>
                    <div className="text-[28px] font-black uppercase text-slate-900 leading-none">{displayName}</div>
                    <div className="text-xs font-semibold text-slate-500 mt-1">{runner.category} | {genderLabel} {runner.ageGroup || ''}</div>
                </div>

                {/* Gun Time & Net Time */}
                <div className="grid grid-cols-2 gap-2.5 mb-4">
                    <div className="bg-slate-50 border border-slate-200 rounded-xl py-2.5 px-3 text-center">
                        <div className="text-[8px] font-extrabold text-slate-400 uppercase mb-1 ">Gun Time</div>
                        <div className="text-lg font-black text-slate-900 font-mono">{gunTimeStr}</div>
                    </div>
                    <div className="bg-green-50 border border-green-200 rounded-xl py-2.5 px-3 text-center">
                        <div className="text-[8px] font-extrabold text-green-600 uppercase mb-1">Net Time</div>
                        <div className="text-lg font-black text-green-600 font-mono">{netTimeStr}</div>
                    </div>
                </div>

                {/* Stats Panel */}
                <div className="bg-white border border-slate-200 rounded-[20px] px-1 py-4 flex justify-around items-center mb-5">
                    {[
                        { label: 'Distance', val: `${dist ?? '-'}`, unit: 'KM' },
                        { label: 'Avg Pace', val: pace, unit: '/K' },
                    ].map((s, i) => (
                        <div key={i} className="flex-1 text-center relative">
                            {i < 1 && <div className="absolute right-0 top-[20%] h-[60%] w-px bg-slate-100" />}
                            <div className="text-[8px] font-extrabold text-slate-400 uppercase mb-1">{s.label}</div>
                            <div className="text-lg font-black text-slate-900 leading-none">{s.val}<span className="text-[10px] text-slate-400">{s.unit}</span></div>
                        </div>
                    ))}
                </div>

                {/* Rank Grid */}
                <div className="grid grid-cols-3 gap-1.5 mb-5">
                    {[
                        { label: 'Overall', val: runner.overallRank || '-' },
                        { label: 'Gender', val: runner.genderRank || runner.genderNetRank || '-' },
                        { label: 'Category', val: runner.categoryRank || runner.categoryNetRank || '-' },
                    ].map((r, i) => (
                        <div key={i} className="bg-slate-50 rounded-xl py-2.5 px-1 text-center border border-slate-100">
                            <div className="text-base font-black text-slate-900">{r.val}</div>
                            <div className="text-[8px] font-extrabold text-slate-500 uppercase">{r.label}</div>
                        </div>
                    ))}
                </div>

                {/* Checkpoints */}
                <div className="bg-white rounded-2xl p-3 border border-slate-100 grow flex flex-col">
                    <div className="text-[10px] font-extrabold text-slate-400 uppercase mb-2.5">Checkpoint Splits</div>
                    <div className="flex flex-col gap-1">
                        {displayTimings.map((t) => {
                            const isFinish = t.checkpoint?.toLowerCase().includes('finish');
                            const netMs = t.netTime ?? t.elapsedTime;
                            return (
                                <div key={t._id} className={`flex justify-between items-baseline gap-2 ${isFinish ? 'bg-green-50 rounded px-1 py-0.5 mt-1' : ''}`}>
                                    <span className={`text-[11px] whitespace-nowrap ${isFinish ? 'font-extrabold text-green-700' : 'font-semibold text-slate-600'}`}>{isFinish ? 'FINISH LINE' : t.checkpoint}</span>
                                    <span className="grow border-b border-dotted border-slate-200 relative -top-1" />
                                    <span className={`font-mono whitespace-nowrap ${isFinish ? 'text-sm font-extrabold text-green-700' : 'text-xs font-extrabold text-slate-900'}`}>{netMs ? formatTime(netMs) : '-'}</span>
                                </div>
                            );
                        })}
                        {displayTimings.length === 0 && (
                            <div className="text-center text-[11px] text-slate-400 py-3">No checkpoint data</div>
                        )}
                    </div>
                </div>

                <div className="text-center text-[9px] text-slate-300 mt-auto pt-4 font-bold tracking-[2px]">OFFICIAL RESULT BY ACTION TIMING</div>
            </div>
        </div>
    );
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
            const { toJpeg } = await import('html-to-image');
            const dataUrl = await toJpeg(slipRef.current, {
                quality: 0.95,
                pixelRatio: 3,
                backgroundColor: activeTemplate === 'template3' ? '#f1f5f9' : '#0f172a',
            });
            const fileName = `ACTION_ESlip_${runner?.bib || 'runner'}.jpg`;
            const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);

            if (isMobile) {
                const newTab = window.open('', '_blank');
                if (newTab) {
                    newTab.document.write(`<!DOCTYPE html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><title>E-Slip ${runner?.bib || ''}</title><style>*{margin:0;padding:0;box-sizing:border-box;}body{background:#0f172a;display:flex;justify-content:center;align-items:center;min-height:100vh;flex-direction:column;gap:16px;padding:16px;} img{max-width:100%;border-radius:16px;box-shadow:0 8px 32px rgba(0,0,0,0.5);} .hint{color:#94a3b8;font-size:14px;font-family:'Prompt',sans-serif;text-align:center;padding:8px 20px;background:rgba(255,255,255,0.08);border-radius:12px;line-height:1.6;} .hint b{color:#4ade80;}</style></head><body><img src="${dataUrl}"><div class="hint">📲 <b>กดค้างที่รูป</b> → เลือก <b>"เพิ่มไปยังรูปภาพ"</b><br>เพื่อบันทึกลงแกลเลอรีของคุณ</div></body></html>`);
                    newTab.document.close();
                }
                setDownloading(false);
                return;
            }

            const link = document.createElement('a');
            link.download = fileName;
            link.href = dataUrl;
            link.click();
        } catch (err) { console.error('E-Slip download error:', err); }
        finally { setDownloading(false); }
    };

    if (loading) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-slate-900 font-[Prompt]">
                <div className="text-center">
                    <div className="w-10 h-10 border-[3px] border-slate-700 border-t-green-500 rounded-full animate-spin mx-auto mb-4" />
                    <p className="text-slate-400 text-sm">กำลังโหลด...</p>
                </div>
            </div>
        );
    }

    if (error || !runner) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-slate-900 font-[Prompt]">
                <div className="text-center text-white">
                    <p className="text-5xl mb-4">😔</p>
                    <p className="text-slate-400">{error || 'ไม่พบข้อมูล'}</p>
                    <button onClick={() => router.back()} className="mt-4 px-6 py-2 rounded-lg bg-green-500 text-white font-semibold border-none cursor-pointer">ย้อนกลับ</button>
                </div>
            </div>
        );
    }

    if (runner.status !== 'finished') {
        return (
            <div className="min-h-screen flex items-center justify-center bg-slate-900 font-[Prompt]">
                <div className="text-center text-white max-w-[400px] p-8">
                    <p className="text-5xl mb-4">⏳</p>
                    <h2 className="text-xl font-bold mb-2">นักวิ่งยังไม่จบการแข่งขัน</h2>
                    <p className="text-slate-400 mb-4">E-Slip จะพร้อมใช้งานเมื่อนักวิ่ง Finish แล้วเท่านั้น</p>
                    <button onClick={() => router.back()} className="px-6 py-2.5 rounded-xl bg-green-500 text-white font-bold border-none cursor-pointer">ย้อนกลับ</button>
                </div>
            </div>
        );
    }

    const isWhiteTheme = activeTemplate === 'template3';
    const bgColor = isWhiteTheme ? 'bg-slate-100' : 'bg-slate-900';

    return (
        <div className={`min-h-screen flex flex-col items-center ${bgColor} font-[Prompt]`}>
            {/* Header */}
            <header className={`${isWhiteTheme ? 'bg-white border-b border-slate-200' : 'bg-slate-800 border-b border-white/10'} px-4 py-2.5 w-full sticky top-0 z-50`}>
                <div className="max-w-screen-lg mx-auto flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <Link href="/" className={`flex items-center ${isWhiteTheme ? 'border-r border-slate-200' : 'border-r border-white/20'} pr-3 no-underline`}>
                            <Image src={isWhiteTheme ? '/logo-black.png' : '/logo-white.png'} alt="ACTION" width={80} height={26} className="object-contain" />
                        </Link>
                        <span className="text-sm font-extrabold text-green-500 uppercase">E-Slip</span>
                    </div>
                    <button onClick={() => router.back()} className={`text-xs font-bold ${isWhiteTheme ? 'text-slate-500' : 'text-slate-400'} bg-transparent border-none cursor-pointer flex items-center gap-1`}>
                        ← กลับหน้าผลการแข่งขัน
                    </button>
                </div>
            </header>

            <div className="px-2.5 py-5 flex flex-col items-center w-full">
                {/* Template Selector */}
                {availableTemplates.length > 1 && (
                    <div className="mb-4 flex gap-2 flex-wrap justify-center">
                        {availableTemplates.map(t => {
                            const isActive = activeTemplate === t;
                            const label = t === 'template1' ? '🌙 Dark' : t === 'template2' ? '📷 Photo' : '🤍 White';
                            return (
                                <button
                                    key={t}
                                    onClick={() => setActiveTemplate(t)}
                                    className={`px-5 py-2.5 rounded-[14px] text-sm font-extrabold cursor-pointer transition-all duration-200 min-w-[100px]
                                        ${isActive
                                            ? 'bg-gradient-to-br from-green-600 to-green-500 text-white border-2 border-green-500 shadow-lg shadow-green-500/40 scale-105'
                                            : isWhiteTheme
                                                ? 'bg-black/5 text-slate-600 border-2 border-slate-200'
                                                : 'bg-white/10 text-white/70 border-2 border-white/15'
                                        }`}
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
                <div className="flex gap-3 w-full max-w-[380px] mt-5">
                    {activeTemplate !== 'template3' && (
                        <>
                            <input type="file" id="eslip-bg" accept="image/*" className="hidden" onChange={handleBgUpload} />
                            <label htmlFor="eslip-bg" className="flex-1 py-4 rounded-[15px] font-extrabold text-sm text-center cursor-pointer bg-white text-black flex justify-center items-center gap-2">
                                📷 เลือกรูปถ่าย
                            </label>
                        </>
                    )}
                    <button onClick={handleDownload} disabled={downloading}
                        className={`flex-1 py-4 rounded-[15px] font-extrabold text-sm text-center border-none bg-green-600 text-white flex justify-center items-center gap-2 ${downloading ? 'opacity-70 cursor-wait' : 'cursor-pointer'}`}
                    >
                        {downloading ? '⏳ กำลังประมวลผล...' : '📥 บันทึกภาพ'}
                    </button>
                </div>

                {/* Back link */}
                <button onClick={() => router.back()} className="mt-5 bg-transparent border-none text-slate-500 text-[13px] font-semibold cursor-pointer">
                    ← ย้อนกลับ
                </button>
            </div>
        </div>
    );
}
