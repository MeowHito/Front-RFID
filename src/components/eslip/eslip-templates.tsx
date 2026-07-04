'use client';

import { useState, useEffect, useRef } from 'react';

// ─── Shared E-Slip types ──────────────────────────────────────────────────────

export interface RunnerData {
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
    photoUrl?: string;
}

export interface TimingRecord {
    _id: string;
    checkpoint: string;
    scanTime: string;
    splitTime?: number;
    elapsedTime?: number;
    distanceFromStart?: number;
    netTime?: number;
    gunTime?: number;
    order?: number;
    netPace?: string;
    gunPace?: string;
    splitPace?: string;
}

export interface CampaignData {
    _id: string;
    name: string;
    eventDate: string;
    location?: string;
    slug?: string;
    eslipTemplate?: string;
    eslipTemplates?: string[];
    eslipVisibleFields?: string[];
    eslipMode?: string;
    eslipV2Layout?: ESlipV2Layout;
    slipScanTemplate?: string;
    overallDisplayCount?: number;
    ageGroupDisplayCount?: number;
    excludeOverallFromAgeGroup?: number;
    excludeAgeGroupTop?: number;
    separateOverallNationalityCategories?: string[];
    targetTimeBands?: TargetTimeBandGroup[];
}

export interface TargetTimeBand {
    label: string;
    minMinutes: number;
    maxMinutes: number;
}

export interface TargetTimeBandGroup {
    category: string;
    bands: TargetTimeBand[];
}

/** Find the target-time band (e.g. "sub 45") a runner's finish time falls into,
 *  mirroring the Target-Time-Winners board: minutes = time_ms / 60000, band is
 *  the one where minMinutes <= minutes < maxMinutes for the runner's category. */
export function computeTargetBandLabel(runner: RunnerData, campaign: CampaignData | null): string | null {
    if (!campaign?.targetTimeBands?.length || !runner.category) return null;
    const group = campaign.targetTimeBands.find(g => g.category === runner.category);
    if (!group?.bands?.length) return null;
    const ms = runner.netTime || runner.gunTime || 0;
    if (ms <= 0) return null;
    const mins = ms / 60000;
    const band = group.bands.find(b => mins >= b.minMinutes && mins < b.maxMinutes);
    return band?.label ?? null;
}

// ─── E-Slip V2 types (mirrors admin/eslip2/page.tsx) ──────────────────────────

export type FieldKey =
    | 'eventName' | 'bib' | 'runnerName' | 'firstName' | 'lastName'
    | 'category' | 'distance' | 'gender' | 'ageGroup'
    | 'overallRank' | 'genderRank' | 'categoryRank'
    | 'gunTime' | 'netTime' | 'pace' | 'award' | 'targetBand'
    | 'eventDate' | 'location' | 'static';

export interface ESlipV2Element {
    id: string;
    type?: 'text' | 'image' | 'splits';
    field: FieldKey;
    staticText: string;
    x: number; y: number; width: number; height: number;
    fontSize: number; fontWeight: string; color: string;
    align: 'left' | 'center' | 'right';
    prefix: string; suffix: string;
    backgroundColor: string; borderRadius: number; opacity: number; zIndex: number;
    italic: boolean; uppercase: boolean; letterSpacing: number;
    imageData?: string;
    objectFit?: 'cover' | 'contain' | 'fill';
    header1?: string;
    header2?: string;
    header3?: string;
    rowGap?: number;
    colGap?: number;
}

export interface ESlipV2Layout {
    canvasWidth: number;
    canvasHeight: number;
    background: { type: 'color' | 'image'; color: string; imageData: string; imageOpacity?: number };
    elements: ESlipV2Element[];
}

export function formatTime(ms?: number | null): string {
    if (!ms || ms <= 0) return '--:--:--';
    const totalSeconds = Math.floor(ms / 1000);
    const h = Math.floor(totalSeconds / 3600);
    const m = Math.floor((totalSeconds % 3600) / 60);
    const s = totalSeconds % 60;
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

export function effectiveFinishMs(runner: RunnerData): number | undefined {
    return runner.gunTime || runner.netTime || undefined;
}

export function effectivePace(runner: RunnerData): string {
    if (runner.netPace) return runner.netPace;
    if (runner.gunPace) return runner.gunPace;
    const dist = parseDistanceValue(runner.category);
    const ms = runner.gunTime || runner.netTime;
    if (ms && ms > 0 && dist && dist > 0) {
        const paceMin = (ms / 60000) / dist;
        const pM = Math.floor(paceMin);
        const pS = Math.round((paceMin - pM) * 60);
        return `${pM}:${pS.toString().padStart(2, '0')}`;
    }
    return '-';
}

export function parseDistanceValue(value: unknown): number | null {
    const raw = String(value || '').replace(/,/g, '');
    const match = raw.match(/-?\d+(?:\.\d+)?/);
    if (!match) return null;
    const parsed = Number(match[0]);
    return Number.isFinite(parsed) ? parsed : null;
}

export interface TemplateProps {
    runner: RunnerData;
    timings: TimingRecord[];
    campaign: CampaignData | null;
    bgImage: string | null;
    slipRef: React.RefObject<HTMLDivElement | null>;
    showField: (key: string) => boolean;
    textColorMode?: 'light' | 'dark';
    awardLabel?: string | null;
    targetBandLabel?: string | null;
}

/** Auto-shrink text to always fit one line within its container */
export function FitName({ children, className, style, maxSize = 28 }: { children: string; className?: string; style?: React.CSSProperties; maxSize?: number }) {
    const ref = useRef<HTMLDivElement>(null);
    useEffect(() => {
        const el = ref.current;
        if (!el) return;
        let size = maxSize;
        el.style.fontSize = `${size}px`;
        while (el.scrollWidth > el.clientWidth && size > 12) {
            size--;
            el.style.fontSize = `${size}px`;
        }
    }, [children, maxSize]);
    return <div ref={ref} className={className} style={{ ...style, whiteSpace: 'nowrap', overflow: 'hidden', width: '100%' }}>{children}</div>;
}

// ==================== TEMPLATE 1: Dark Photo Background ====================
export function Template1({ runner, timings, campaign, bgImage, slipRef, showField, awardLabel, targetBandLabel }: TemplateProps) {
    const displayName = `${runner.firstName} ${runner.lastName}`.trim();
    const genderLabel = runner.gender === 'M' ? 'Male' : 'Female';
    const dist = parseDistanceValue(runner.category);
    const pace = effectivePace(runner);
    const gunTimeStr = runner.gunTimeStr || formatTime(effectiveFinishMs(runner));
    const netTimeStr = runner.netTimeStr || formatTime(runner.netTime);
    // Sort by scanTime ascending — order is unreliable when admin manually adds a
    // checkpoint (the new record's `order` may slot in front of RaceTiger-synced rows).
    const sortedTimings = [...timings].sort((a, b) => {
        const ta = a.scanTime ? new Date(a.scanTime).getTime() : 0;
        const tb = b.scanTime ? new Date(b.scanTime).getTime() : 0;
        if (ta !== tb) return ta - tb;
        return (a.order || 0) - (b.order || 0);
    });
    const displayTimings = sortedTimings.slice(-6);

    return (
        <div ref={slipRef} className="w-full max-w-[380px] relative rounded-[30px] overflow-hidden shadow-2xl">
            {/* Background image layer — uses <img> for reliable html-to-image capture */}
            {bgImage && (
                <img
                    src={bgImage}
                    alt=""
                    className="absolute inset-0 w-full h-full object-cover z-0"
                    crossOrigin="anonymous"
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
                            <FitName className="font-black text-white leading-tight uppercase" maxSize={24}>{displayName}</FitName>
                            <div className="text-[13px] font-semibold text-slate-300 mt-2 flex items-center gap-1.5">
                                <span className="bg-white text-black font-black rounded-md px-2 py-0.5 text-xs shrink-0">{runner.bib}</span>
                                <span className="opacity-80">{genderLabel} {runner.ageGroup || ''}</span>
                            </div>
                        </div>
                    </div>

                    {/* Ranks + Times — unified card */}
                    {(showField('overallRank') || showField('genderRank') || showField('categoryRank') || showField('gunTime') || showField('netTime') || (showField('award') && !!awardLabel) || (showField('targetBand') && !!targetBandLabel)) && (
                        <div className="bg-white/10 border border-white/10 rounded-2xl p-4">
                            {/* Top row: Overall / Gender / Category */}
                            {(showField('overallRank') || showField('genderRank') || showField('categoryRank')) && (
                                <div className={`flex justify-center gap-8 ${(showField('gunTime') || showField('netTime')) ? 'pb-3 border-b border-white/10' : ''}`}>
                                    {[
                                        { key: 'overallRank', label: 'Overall', val: runner.overallRank || '-' },
                                        { key: 'genderRank', label: 'Gender', val: runner.genderRank || runner.genderNetRank || '-' },
                                        { key: 'categoryRank', label: 'Category', val: runner.categoryRank || runner.categoryNetRank || '-' },
                                    ].filter(r => showField(r.key)).map((r, i) => (
                                        <div key={i} className="text-center min-w-[60px]">
                                            <div className="text-[10px] font-black text-white uppercase">{r.label}</div>
                                            <div className="text-xl font-black text-white">{r.val}</div>
                                        </div>
                                    ))}
                                </div>
                            )}
                            {/* Bottom row: Gun Time / Net Time */}
                            {(showField('gunTime') || showField('netTime')) && (
                                <div className="flex justify-center gap-8 pt-3">
                                    {showField('gunTime') && <div className="text-center min-w-[80px]">
                                        <div className="text-[10px] font-black text-white uppercase mb-1">Gun Time</div>
                                        <div className="text-xl font-black text-white">{gunTimeStr}</div>
                                    </div>}
                                    {showField('netTime') && <div className="text-center min-w-[80px]">
                                        <div className="text-[10px] font-black text-white uppercase mb-1">Net Time</div>
                                        <div className="text-xl font-black text-green-400">{netTimeStr}</div>
                                    </div>}
                                </div>
                            )}
                            {/* AWARD — placed right below the Net Time row */}
                            {showField('award') && awardLabel && (
                                <div className="flex justify-center pt-3 mt-3 border-t border-amber-300/30">
                                    <div className="text-center">
                                        <div className="text-[10px] font-black text-amber-300 uppercase mb-1 tracking-[2px]">🏆 Award</div>
                                        <div className="text-lg font-black text-amber-300">{awardLabel}</div>
                                    </div>
                                </div>
                            )}
                            {/* SUB (target-time band) — below Award */}
                            {showField('targetBand') && targetBandLabel && (
                                <div className="flex justify-center pt-3 mt-3 border-t border-sky-300/30">
                                    <div className="text-center">
                                        <div className="text-[10px] font-black text-sky-300 uppercase mb-1 tracking-[2px]">🎯 Target</div>
                                        <div className="text-lg font-black text-sky-300 uppercase">{targetBandLabel}</div>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                    {/* Distance / Pace */}
                    {(showField('distance') || showField('pace')) && (
                        <div className="flex justify-around py-3 border-t border-b border-white/10">
                            {showField('distance') && <div className="text-center">
                                <div className="text-[10px] font-bold text-slate-400 uppercase">Distance</div>
                                <div className="text-[22px] font-black text-white leading-snug flex items-baseline justify-center">{dist ?? '-'}<span className="text-[13px] font-bold text-slate-300 ml-0.5">km</span></div>
                            </div>}
                            {showField('pace') && <div className="text-center">
                                <div className="text-[10px] font-bold text-slate-400 uppercase">Pace</div>
                                <div className="text-[22px] font-black text-white leading-snug flex items-baseline justify-center">{pace}<span className="text-[13px] font-bold text-slate-300 ml-0.5">/km</span></div>
                            </div>}
                        </div>
                    )}

                    {/* Checkpoints */}
                    <div className="bg-black/30 rounded-2xl p-4">
                        <div className="text-[10px] font-extrabold text-green-400 uppercase tracking-widest mb-2.5">Checkpoint Splits</div>
                        <div className="flex flex-col gap-2">
                            {displayTimings.map((t, i) => {
                                const isFinish = t.checkpoint?.toLowerCase().includes('finish');
                                const displayNetTime = t.netTime ?? t.elapsedTime;
                                return (
                                    <div key={t._id} className={`flex justify-between items-center pb-1 ${i < displayTimings.length - 1 ? 'border-b border-dashed border-white/10' : ''}`}>
                                        <span className={`text-[11px] whitespace-nowrap ${isFinish ? 'text-green-500' : 'text-slate-200'}`}>{t.checkpoint}{t.distanceFromStart ? ` (${t.distanceFromStart}K)` : ''}</span>
                                        <span className="grow border-b border-dotted border-slate-200 relative -top-1" />
                                        <span className={`font-mono whitespace-nowrap ${isFinish ? 'text-sm font-extrabold text-green-500' : 'text-xs font-extrabold text-white'}`}>{displayNetTime ? formatTime(displayNetTime) : '-'}</span>
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
export function Template2({ runner, timings, campaign, bgImage, slipRef, showField, textColorMode = 'dark', awardLabel, targetBandLabel }: TemplateProps) {
    const displayName = `${runner.firstName} ${runner.lastName}`.trim();
    const genderLabel = runner.gender === 'M' ? 'Male' : 'Female';
    const dist = parseDistanceValue(runner.category);
    const pace = effectivePace(runner);
    const gunTimeStr = runner.gunTimeStr || formatTime(effectiveFinishMs(runner));
    const netTimeStr = runner.netTimeStr || formatTime(runner.netTime);
    // Sort by scanTime ascending — order is unreliable when admin manually adds a
    // checkpoint (the new record's `order` may slot in front of RaceTiger-synced rows).
    const sortedTimings = [...timings].sort((a, b) => {
        const ta = a.scanTime ? new Date(a.scanTime).getTime() : 0;
        const tb = b.scanTime ? new Date(b.scanTime).getTime() : 0;
        if (ta !== tb) return ta - tb;
        return (a.order || 0) - (b.order || 0);
    });
    const displayTimings = sortedTimings.slice(-7);
    const isLightText = textColorMode === 'light';
    const primaryTextClass = isLightText ? 'text-white' : 'text-black';
    const secondaryTextClass = primaryTextClass;
    const mutedTextClass = primaryTextClass;
    const footerTextClass = primaryTextClass;
    const dividerClass = isLightText ? 'bg-white/35' : 'bg-slate-200';
    const dottedBorderClass = isLightText ? 'border-white/35' : 'border-slate-200';
    const finishTextClass = primaryTextClass;
    const normalCheckpointTextClass = primaryTextClass;
    const badgeClass = isLightText ? 'bg-black/65 text-white' : 'bg-white/80 text-slate-900';

    return (
        <div ref={slipRef} className="w-full max-w-[360px] min-h-[720px] relative rounded-[32px] overflow-hidden shadow-xl border border-white/30 flex flex-col">
            {/* Background image layer — uses <img> for reliable html-to-image capture */}
            {bgImage && (
                <img
                    src={bgImage}
                    alt=""
                    className="absolute inset-0 w-full h-full object-cover z-0"
                    crossOrigin="anonymous"
                />
            )}
            {/* Gradient overlay */}
            <div className={`absolute inset-0 z-[1] ${bgImage ? '' : 'bg-gradient-to-br from-slate-300 to-slate-100'}`}
                style={bgImage ? { background: 'linear-gradient(180deg, rgba(255,255,255,0.18) 0%, rgba(255,255,255,0.12) 100%)' } : {}}
            />

            {/* Content */}
            <div className="relative z-[2] flex flex-col grow overflow-hidden">
                {/* Header */}
                {/* Old boxed header: <div className="bg-white/32 backdrop-blur-md px-5 pt-9 pb-6 text-center border-b border-white/50"> */}
                <div className="px-5 pt-9 pb-6 text-center">
                    <FitName className={`font-black uppercase leading-tight text-center ${primaryTextClass}`} maxSize={22}>{campaign?.name || 'Race Event'}</FitName>
                </div>

                {/* Content */}
                <div className="px-4 py-6 flex flex-col grow overflow-hidden">
                    {/* Runner */}
                    <div className="text-center mb-5">
                        <div className={`px-3 py-0.5 rounded-lg text-sm font-extrabold inline-block mb-2 ${badgeClass}`}>BIB {runner.bib}</div>
                        <FitName className={`font-black uppercase leading-none ${primaryTextClass}`} maxSize={28}>{displayName}</FitName>
                        <div className={`text-[14px] font-semibold mt-1 ${secondaryTextClass}`}>{runner.category} | {genderLabel}</div>
                    </div>

                    {/* Gun Time & Net Time */}
                    {(showField('gunTime') || showField('netTime')) && (
                        <div className="flex justify-center gap-2.5 mb-4">
                            {/* Old boxed gun time: <div className="bg-white/50 backdrop-blur-md border border-white/55 rounded-xl py-2.5 px-3 text-center flex-1"> */}
                            {showField('gunTime') && <div className="py-2.5 px-3 text-center flex-1">
                                <div className={`text-[8px] font-extrabold uppercase mb-1 ${mutedTextClass}`}>Gun Time</div>
                                <div className={`text-lg font-black ${primaryTextClass}`}>{gunTimeStr}</div>
                            </div>}
                            {/* Old boxed net time: <div className="bg-green-50/72 backdrop-blur-md border border-green-200/80 rounded-xl py-2.5 px-3 text-center flex-1"> */}
                            {showField('netTime') && <div className="py-2.5 px-3 text-center flex-1">
                                <div className={`text-[8px] font-extrabold uppercase mb-1 ${mutedTextClass}`}>Net Time</div>
                                <div className={`text-lg font-black ${primaryTextClass}`}>{netTimeStr}</div>
                            </div>}
                        </div>
                    )}

                    {/* AWARD — placed right below Net Time */}
                    {showField('award') && awardLabel && (
                        <div className="flex justify-center mb-4">
                            <div className="inline-flex items-center gap-2 rounded-full bg-amber-400/90 px-4 py-1.5 shadow-sm">
                                <span className="text-sm leading-none">🏆</span>
                                <span className="text-[9px] font-extrabold uppercase tracking-[1.5px] text-amber-900">Award</span>
                                <span className="text-sm font-black text-amber-950">{awardLabel}</span>
                            </div>
                        </div>
                    )}

                    {/* SUB (target-time band) — below Award */}
                    {showField('targetBand') && targetBandLabel && (
                        <div className="flex justify-center mb-4">
                            <div className="inline-flex items-center gap-2 rounded-full bg-sky-400/90 px-4 py-1.5 shadow-sm">
                                <span className="text-sm leading-none">🎯</span>
                                <span className="text-[9px] font-extrabold uppercase tracking-[1.5px] text-sky-900">Target</span>
                                <span className="text-sm font-black text-sky-950 uppercase">{targetBandLabel}</span>
                            </div>
                        </div>
                    )}

                    {/* Stats Panel */}
                    {(showField('distance') || showField('pace')) && (
                        <>
                            {/* Old boxed stats: <div className="bg-white/50 backdrop-blur-md border border-white/55 rounded-[20px] px-1 py-4 flex justify-around items-center mb-5"> */}
                            <div className="px-1 py-4 flex justify-around items-center mb-5">
                                {[
                                    { key: 'distance', label: 'Distance', val: `${dist ?? '-'}`, unit: 'KM' },
                                    { key: 'pace', label: 'Avg Pace', val: pace, unit: '/K' },
                                ].filter(s => showField(s.key)).map((s, i) => (
                                    <div key={i} className="flex-1 text-center relative">
                                        {i < 1 && <div className={`absolute right-0 top-[20%] h-[60%] w-px ${dividerClass}`} />}
                                        <div className={`text-[8px] font-extrabold uppercase mb-1 ${mutedTextClass}`}>{s.label}</div>
                                        <div className={`text-lg font-black leading-none ${primaryTextClass}`}>{s.val}<span className={`text-[10px] ${mutedTextClass}`}>{s.unit}</span></div>
                                    </div>
                                ))}
                            </div>
                        </>
                    )}

                    {/* Rank Grid */}
                    {(showField('overallRank') || showField('genderRank') || showField('categoryRank')) && (
                        <>
                            {/* Old boxed rank grid: <div className="bg-white/50 backdrop-blur-md rounded-[20px] border border-white/55 px-1 py-3 mb-5 flex justify-around items-stretch"> */}
                            <div className="px-1 py-3 mb-5 flex justify-around items-stretch">
                                {[
                                    { key: 'overallRank', label: 'Overall', val: runner.overallRank || '-' },
                                    { key: 'genderRank', label: 'Gender', val: runner.genderRank || runner.genderNetRank || '-' },
                                    { key: 'categoryRank', label: 'Category', val: runner.categoryRank || runner.categoryNetRank || '-' },
                                ].filter(r => showField(r.key)).map((r, i, arr) => (
                                    <div key={i} className="flex-1 text-center relative flex flex-col justify-center px-3 py-1.5">
                                        {i < arr.length - 1 && <div className={`absolute right-0 top-[18%] h-[64%] w-px ${dividerClass}`} />}
                                        <div className={`text-base font-black ${primaryTextClass}`}>{r.val}</div>
                                        <div className={`text-[8px] font-extrabold uppercase ${mutedTextClass}`}>{r.label}</div>
                                    </div>
                                ))}
                            </div>
                        </>
                    )}

                    {/* Checkpoints */}
                    {/* Old boxed checkpoints: <div className="bg-white/50 backdrop-blur-md rounded-2xl p-3 border border-white/55 grow flex flex-col"> */}
                    <div className="p-3 grow flex flex-col">
                        <div className={`text-[10px] font-extrabold uppercase mb-2.5 ${mutedTextClass}`}>Checkpoint Splits</div>
                        <div className="flex flex-col gap-1">
                        {displayTimings.map((t) => {
                            const isFinish = t.checkpoint?.toLowerCase().includes('finish');
                            const netMs = t.netTime ?? t.elapsedTime;
                            return (
                                <div key={t._id} className="flex justify-between items-baseline gap-2">
                                    <span className={`text-[11px] whitespace-nowrap ${isFinish ? `font-extrabold ${finishTextClass}` : `font-semibold ${normalCheckpointTextClass}`}`}>{isFinish ? 'FINISH LINE' : t.checkpoint}</span>
                                    <span className={`grow border-b border-dotted relative -top-1 ${dottedBorderClass}`} />
                                    <span className={`font-mono whitespace-nowrap ${isFinish ? `text-sm font-extrabold ${finishTextClass}` : `text-xs font-extrabold ${primaryTextClass}`}`}>{netMs ? formatTime(netMs) : '-'}</span>
                                </div>
                            );
                        })}
                        {displayTimings.length === 0 && (
                            <div className={`text-center text-[11px] py-3 ${mutedTextClass}`}>No checkpoint data</div>
                        )}
                    </div>
                    </div>

                    <div className={`text-center text-[9px] mt-auto pt-4 font-bold tracking-[2px] ${footerTextClass}`}>OFFICIAL RESULT BY ACTION TIMING</div>
                </div>
            </div>
        </div>
    );
}

// ==================== TEMPLATE 3: Clean White Card ====================
export function Template3({ runner, timings, campaign, slipRef, showField, awardLabel, targetBandLabel }: TemplateProps) {
    const displayName = `${runner.firstName} ${runner.lastName}`.trim();
    const genderLabel = runner.gender === 'M' ? 'Male' : 'Female';
    const dist = parseDistanceValue(runner.category);
    const pace = effectivePace(runner);
    const gunTimeStr = runner.gunTimeStr || formatTime(effectiveFinishMs(runner));
    const netTimeStr = runner.netTimeStr || formatTime(runner.netTime);
    // Sort by scanTime ascending — order is unreliable when admin manually adds a
    // checkpoint (the new record's `order` may slot in front of RaceTiger-synced rows).
    const sortedTimings = [...timings].sort((a, b) => {
        const ta = a.scanTime ? new Date(a.scanTime).getTime() : 0;
        const tb = b.scanTime ? new Date(b.scanTime).getTime() : 0;
        if (ta !== tb) return ta - tb;
        return (a.order || 0) - (b.order || 0);
    });
    const displayTimings = sortedTimings.slice(-7);

    return (
        <div ref={slipRef} className="w-full max-w-[360px] min-h-[720px] bg-white rounded-[32px] overflow-hidden shadow-xl border border-slate-200 flex flex-col">
            {/* Header */}
            <div className="bg-slate-50 px-5 pt-9 pb-6 text-center border-b border-slate-100">
                <FitName className="font-black text-slate-900 uppercase leading-tight text-center" maxSize={22}>{campaign?.name || 'Race Event'}</FitName>
            </div>

            {/* Content */}
            <div className="px-4 py-6 flex flex-col grow overflow-hidden">
                {/* Runner */}
                <div className="text-center mb-5">
                    <div className="bg-slate-900 text-white px-3 py-0.5 rounded-lg text-sm font-extrabold inline-block mb-2">BIB {runner.bib}</div>
                    <FitName className="font-black uppercase text-slate-900 leading-none" maxSize={28}>{displayName}</FitName>
                    <div className="text-[14px] font-semibold text-slate-500 mt-1">{runner.category} | {genderLabel}</div>
                </div>

                {/* Gun Time & Net Time */}
                {(showField('gunTime') || showField('netTime')) && (
                    <div className="flex justify-center gap-2.5 mb-4">
                        {showField('gunTime') && <div className="bg-slate-50 border border-slate-200 rounded-xl py-2.5 px-3 text-center flex-1">
                            <div className="text-[8px] font-extrabold text-slate-400 uppercase mb-1">Gun Time</div>
                            <div className="text-lg font-black text-slate-900">{gunTimeStr}</div>
                        </div>}
                        {showField('netTime') && <div className="bg-green-50 border border-green-200 rounded-xl py-2.5 px-3 text-center flex-1">
                            <div className="text-[8px] font-extrabold text-green-600 uppercase mb-1">Net Time</div>
                            <div className="text-lg font-black text-green-600">{netTimeStr}</div>
                        </div>}
                    </div>
                )}

                {/* AWARD — placed right below Net Time */}
                {showField('award') && awardLabel && (
                    <div className="bg-gradient-to-r from-amber-50 to-amber-100 border border-amber-300 rounded-xl py-2.5 px-3 text-center mb-4 flex items-center justify-center gap-2">
                        <span className="text-base leading-none">🏆</span>
                        <div className="text-left leading-tight">
                            <div className="text-[8px] font-extrabold text-amber-600 uppercase tracking-[1.5px]">Award</div>
                            <div className="text-base font-black text-amber-700">{awardLabel}</div>
                        </div>
                    </div>
                )}

                {/* SUB (target-time band) — below Award */}
                {showField('targetBand') && targetBandLabel && (
                    <div className="bg-gradient-to-r from-sky-50 to-sky-100 border border-sky-300 rounded-xl py-2.5 px-3 text-center mb-4 flex items-center justify-center gap-2">
                        <span className="text-base leading-none">🎯</span>
                        <div className="text-left leading-tight">
                            <div className="text-[8px] font-extrabold text-sky-600 uppercase tracking-[1.5px]">Target</div>
                            <div className="text-base font-black text-sky-700 uppercase">{targetBandLabel}</div>
                        </div>
                    </div>
                )}

                {/* Stats Panel */}
                {(showField('distance') || showField('pace')) && (
                    <div className="bg-white border border-slate-200 rounded-[20px] px-1 py-4 flex justify-around items-center mb-5">
                        {[
                            { key: 'distance', label: 'Distance', val: `${dist ?? '-'}`, unit: 'KM' },
                            { key: 'pace', label: 'Avg Pace', val: pace, unit: '/K' },
                        ].filter(s => showField(s.key)).map((s, i) => (
                            <div key={i} className="flex-1 text-center relative">
                                {i < 1 && <div className="absolute right-0 top-[20%] h-[60%] w-px bg-slate-100" />}
                                <div className="text-[8px] font-extrabold text-slate-400 uppercase mb-1">{s.label}</div>
                                <div className="text-lg font-black text-slate-900 leading-none">{s.val}<span className="text-[10px] text-slate-400">{s.unit}</span></div>
                            </div>
                        ))}
                    </div>
                )}

                {/* Rank Grid */}
                {(showField('overallRank') || showField('genderRank') || showField('categoryRank')) && (
                    <div className="flex justify-center gap-1.5 mb-5">
                        {[
                            { key: 'overallRank', label: 'Overall', val: runner.overallRank || '-' },
                            { key: 'genderRank', label: 'Gender', val: runner.genderRank || runner.genderNetRank || '-' },
                            { key: 'categoryRank', label: 'Category', val: runner.categoryRank || runner.categoryNetRank || '-' },
                        ].filter(r => showField(r.key)).map((r, i) => (
                            <div key={i} className="bg-slate-50 rounded-xl py-2.5 px-3 text-center border border-slate-100 min-w-[80px]">
                                <div className="text-base font-black text-slate-900">{r.val}</div>
                                <div className="text-[8px] font-extrabold text-slate-500 uppercase">{r.label}</div>
                            </div>
                        ))}
                    </div>
                )}

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

// ─── E-Slip V2 Renderer ────────────────────────────────────────────────────────

export function resolveFieldValue(field: FieldKey, staticText: string, runner: RunnerData, campaign: CampaignData | null, awardLabel?: string | null, targetBandLabel?: string | null): string {
    const fmt = formatTime;
    switch (field) {
        case 'eventName':   return campaign?.name ?? '';
        case 'bib':         return runner.bib ?? '';
        case 'runnerName':  return `${runner.firstName} ${runner.lastName}`.trim();
        case 'firstName':   return runner.firstName ?? '';
        case 'lastName':    return runner.lastName ?? '';
        case 'category':    return runner.category ?? '';
        case 'distance':    return runner.category ?? '';
        case 'gender':      return runner.gender === 'M' ? 'Male' : 'Female';
        case 'ageGroup':    return runner.ageGroup ?? '';
        case 'overallRank': return String(runner.overallRank ?? '-');
        case 'genderRank':  return String(runner.genderRank ?? runner.genderNetRank ?? '-');
        // Category rank is only meaningful when the runner's distance has age groups.
        // Returning an empty string here makes V2 elements bound to this field render blank
        // (or get skipped by the renderer's blank-check) instead of showing a misleading '-'.
        case 'categoryRank':return runner.ageGroup ? String(runner.categoryRank ?? runner.categoryNetRank ?? '-') : '';
        case 'gunTime':     return runner.gunTimeStr ?? fmt(effectiveFinishMs(runner));
        case 'netTime':     return runner.netTimeStr ?? fmt(runner.netTime);
        case 'pace':        return effectivePace(runner);
        case 'award':       return awardLabel ?? '';
        case 'targetBand':  return targetBandLabel ?? '';
        case 'eventDate':   return campaign?.eventDate ? new Date(campaign.eventDate).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric' }) : '';
        case 'location':    return campaign?.location ?? '';
        case 'static':      return staticText;
        default:            return '';
    }
}

export function paceForTiming(t: TimingRecord): string {
    const imported = (t.netPace || t.splitPace || t.gunPace || '').trim();
    if (imported) return imported;
    const ms = t.netTime ?? t.elapsedTime;
    if (ms && ms > 0 && t.distanceFromStart && t.distanceFromStart > 0) {
        const totalMin = ms / 60000;
        const paceMin = totalMin / t.distanceFromStart;
        const pM = Math.floor(paceMin);
        const pS = Math.round((paceMin - pM) * 60);
        return `${pM}:${pS.toString().padStart(2, '0')}`;
    }
    return '-';
}

export function checkpointLabelFor(t: TimingRecord): string {
    const cp = t.checkpoint || '';
    const isFinish = cp.toLowerCase().includes('finish');
    const name = isFinish ? 'Finish' : cp;
    const km = t.distanceFromStart != null ? ` (${t.distanceFromStart} KM)` : '';
    return `${name}${km}`;
}

export function ESlipV2SplitsTable({ el, timings }: { el: ESlipV2Element; timings: TimingRecord[] }) {
    const sorted = [...timings].sort((a, b) => {
        const ta = a.scanTime ? new Date(a.scanTime).getTime() : 0;
        const tb = b.scanTime ? new Date(b.scanTime).getTime() : 0;
        if (ta !== tb) return ta - tb;
        return (a.order || 0) - (b.order || 0);
    });
    const rows = sorted.filter(t => !((t.checkpoint || '').toLowerCase().includes('start')));

    const gap = el.rowGap ?? 6;
    const cgap = el.colGap ?? 4;
    const cellBase: React.CSSProperties = {
        fontSize: el.fontSize || 13,
        color: el.color || '#000',
        fontWeight: el.fontWeight || '900',
        padding: `${gap}px ${cgap}px`,
        fontFamily: "'Prompt', sans-serif",
        textTransform: el.uppercase ? 'uppercase' : 'none',
        fontStyle: el.italic ? 'italic' : 'normal',
        letterSpacing: el.letterSpacing || 0,
    };
    const headBase: React.CSSProperties = { ...cellBase, padding: `${gap + 2}px ${cgap}px` };

    return (
        <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed', background: 'transparent' }}>
            <thead>
                <tr>
                    <th style={{ ...headBase, textAlign: 'left' }}>{el.header1 || 'CHECKPOINT'}</th>
                    <th style={{ ...headBase, textAlign: 'center' }}>{el.header2 || 'TIME'}</th>
                    <th style={{ ...headBase, textAlign: 'right' }}>{el.header3 || 'PACE'}</th>
                </tr>
            </thead>
            <tbody>
                {rows.length === 0 && (
                    <tr><td colSpan={3} style={{ ...cellBase, textAlign: 'center' }}>No checkpoint data</td></tr>
                )}
                {rows.map(t => {
                    const ms = t.netTime ?? t.elapsedTime;
                    return (
                        <tr key={t._id}>
                            <td style={{ ...cellBase, textAlign: 'left' }}>{checkpointLabelFor(t)}</td>
                            <td style={{ ...cellBase, textAlign: 'center', fontVariantNumeric: 'tabular-nums' }}>{ms ? formatTime(ms) : '-'}</td>
                            <td style={{ ...cellBase, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{paceForTiming(t)}</td>
                        </tr>
                    );
                })}
            </tbody>
        </table>
    );
}

export function ESlipV2Renderer({ layout, runner, campaign, slipRef, timings, awardLabel, targetBandLabel }: {
    layout: ESlipV2Layout;
    runner: RunnerData;
    campaign: CampaignData | null;
    slipRef: React.RefObject<HTMLDivElement | null>;
    timings: TimingRecord[];
    awardLabel?: string | null;
    targetBandLabel?: string | null;
}) {
    const wrapperRef = useRef<HTMLDivElement>(null);
    const [scale, setScale] = useState(1);

    useEffect(() => {
        const update = () => {
            if (!wrapperRef.current) return;
            const w = wrapperRef.current.clientWidth;
            setScale(Math.min(1, w / layout.canvasWidth));
        };
        update();
        const ro = new ResizeObserver(update);
        if (wrapperRef.current) ro.observe(wrapperRef.current);
        return () => ro.disconnect();
    }, [layout.canvasWidth]);

    const imageOpacity = layout.background.imageOpacity ?? 1;
    const isImageBg = layout.background.type === 'image' && !!layout.background.imageData;
    const scaledHeight = layout.canvasHeight * scale;

    return (
        <div
            ref={slipRef}
            style={{
                width: '100%',
                maxWidth: layout.canvasWidth,
                userSelect: 'none',
            }}
        >
        <div
            ref={wrapperRef}
            style={{
                position: 'relative',
                width: '100%',
                height: scaledHeight,
                borderRadius: 20,
                overflow: 'hidden',
                boxShadow: '0 8px 40px rgba(0,0,0,0.5)',
                backgroundColor: isImageBg ? '#000' : layout.background.color,
            }}
        >
            {isImageBg && (
                <div
                    style={{
                        position: 'absolute', inset: 0,
                        backgroundImage: `url(${layout.background.imageData})`,
                        backgroundSize: 'cover',
                        backgroundPosition: 'center',
                        opacity: imageOpacity,
                    }}
                />
            )}
            <div
                style={{
                    position: 'absolute',
                    top: 0, left: 0,
                    width: layout.canvasWidth,
                    height: layout.canvasHeight,
                    transform: `scale(${scale})`,
                    transformOrigin: 'top left',
                }}
            >
            {layout.elements.map(el => {
                const isImage = el.type === 'image';
                const isSplits = el.type === 'splits';
                const text = (isImage || isSplits) ? '' : el.prefix + resolveFieldValue(el.field, el.staticText, runner, campaign, awardLabel, targetBandLabel) + el.suffix;
                return (
                    <div
                        key={el.id}
                        style={{
                            position: 'absolute',
                            left: el.x, top: el.y,
                            width: el.width, height: el.height,
                            fontSize: el.fontSize,
                            fontWeight: el.fontWeight,
                            color: el.color,
                            textAlign: el.align,
                            fontStyle: el.italic ? 'italic' : 'normal',
                            textTransform: el.uppercase ? 'uppercase' : 'none',
                            letterSpacing: el.letterSpacing,
                            backgroundColor: (isImage || isSplits) ? 'transparent' : (el.backgroundColor || 'transparent'),
                            borderRadius: el.borderRadius,
                            opacity: el.opacity,
                            zIndex: el.zIndex,
                            display: 'flex',
                            alignItems: isSplits ? 'stretch' : 'center',
                            justifyContent: isSplits ? 'stretch' : (el.align === 'center' ? 'center' : el.align === 'right' ? 'flex-end' : 'flex-start'),
                            padding: (isImage || isSplits) ? 0 : '0 4px',
                            overflow: 'hidden',
                            whiteSpace: isSplits ? 'normal' : 'nowrap',
                            fontFamily: "'Prompt', sans-serif",
                            boxSizing: 'border-box',
                        }}
                    >
                        {isImage && el.imageData ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                                src={el.imageData}
                                alt=""
                                crossOrigin="anonymous"
                                style={{
                                    width: '100%', height: '100%',
                                    objectFit: el.objectFit || 'cover',
                                    borderRadius: el.borderRadius,
                                }}
                            />
                        ) : isSplits ? (
                            <ESlipV2SplitsTable el={el} timings={timings} />
                        ) : text}
                    </div>
                );
            })}
            </div>
        </div>
        </div>
    );
}
