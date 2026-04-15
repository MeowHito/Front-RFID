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
    eslipVisibleFields?: string[];
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
    showField: (key: string) => boolean;
    textColorMode?: 'light' | 'dark';
}

/** Auto-shrink text to always fit one line within its container */
function FitName({ children, className, style, maxSize = 28 }: { children: string; className?: string; style?: React.CSSProperties; maxSize?: number }) {
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
function Template1({ runner, timings, campaign, bgImage, slipRef, showField }: TemplateProps) {
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
                    {(showField('overallRank') || showField('genderRank') || showField('categoryRank') || showField('gunTime') || showField('netTime')) && (
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
function Template2({ runner, timings, campaign, bgImage, slipRef, showField, textColorMode = 'dark' }: TemplateProps) {
    const displayName = `${runner.firstName} ${runner.lastName}`.trim();
    const genderLabel = runner.gender === 'M' ? 'Male' : 'Female';
    const dist = parseDistanceValue(runner.category);
    const pace = runner.netPace || runner.gunPace || '-';
    const gunTimeStr = runner.gunTimeStr || formatTime(runner.gunTime);
    const netTimeStr = runner.netTimeStr || formatTime(runner.netTime);
    const sortedTimings = [...timings].sort((a, b) => (a.order || 0) - (b.order || 0));
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
function Template3({ runner, timings, campaign, slipRef, showField }: TemplateProps) {
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
    const [activeTemplate, setActiveTemplate] = useState<string>('template3');
    const [availableTemplates, setAvailableTemplates] = useState<string[]>(['template3', 'template2']);
    const [photoTextColor, setPhotoTextColor] = useState<'light' | 'dark'>('dark');

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
                        const filtered = adminTemplates.filter((t: string) => t !== 'template1');
                        const sorted = (filtered.length > 0 ? filtered : ['template2', 'template3']).sort((a: string, b: string) => {
                            if (a === 'template3') return -1;
                            if (b === 'template3') return 1;
                            return 0;
                        });
                        setAvailableTemplates(sorted);
                        setActiveTemplate(sorted.includes('template3') ? 'template3' : sorted[0] || 'template3');
                    } else {
                        setAvailableTemplates(['template3', 'template2']);
                        setActiveTemplate('template3');
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
        const input = e.currentTarget;
        const file = input.files?.[0];
        input.value = '';
        if (!file) return;
        try {
            let dataUrl: string;
            if (file.size > 5 * 1024 * 1024) {
                const { compressImage } = await import('@/lib/image-utils');
                dataUrl = await compressImage(file);
            } else {
                dataUrl = await new Promise<string>((resolve, reject) => {
                    const reader = new FileReader();
                    reader.onload = () => resolve(reader.result as string);
                    reader.onerror = () => reject(reader.error);
                    reader.readAsDataURL(file);
                });
            }
            setBgImage(null);
            requestAnimationFrame(() => setBgImage(dataUrl));
        } catch (err) {
            console.error('Background image upload error:', err);
            alert('ไม่สามารถอัปโหลดรูปภาพได้');
        }
    };

    const [previewImage, setPreviewImage] = useState<string | null>(null);

    const handleDownload = async () => {
        if (!slipRef.current) return;
        setDownloading(true);
        try {
            const { toJpeg } = await import('html-to-image');
            const opts = {
                quality: 0.95,
                pixelRatio: 3,
                backgroundColor: activeTemplate === 'template3' ? '#f1f5f9' : '#0f172a',
                cacheBust: true,
            };
            // Safari/iOS needs a double-render: first pass primes image loading, second captures correctly
            await toJpeg(slipRef.current, opts).catch(() => {});
            const dataUrl = await toJpeg(slipRef.current, opts);
            const fileName = `ACTION_ESlip_${runner?.bib || 'runner'}.jpg`;
            const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);

            if (isMobile && typeof navigator.share === 'function') {
                try {
                    const res = await fetch(dataUrl);
                    const blob = await res.blob();
                    const imageFile = new File([blob], fileName, { type: blob.type || 'image/jpeg' });
                    const shareData: ShareData = { files: [imageFile] };
                    if (navigator.canShare?.(shareData)) {
                        await navigator.share(shareData);
                        return;
                    }
                } catch (shareErr: any) {
                    if (shareErr?.name === 'AbortError') return;
                    console.warn('Share API failed, falling back to preview:', shareErr);
                }
            }

            if (isMobile) {
                setPreviewImage(dataUrl);
                return;
            }

            const link = document.createElement('a');
            link.download = fileName;
            link.href = dataUrl;
            link.click();
        } catch (err) {
            console.error('E-Slip download error:', err);
        } finally {
            setDownloading(false);
        }
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
                            const label = t === 'template2' ? '📷 Photo' : '🤍 Default';
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
                {activeTemplate === 'template2' && (
                    <div className="mb-4 max-w-[380px] rounded-[16px] bg-[#121a2c] border border-white/10 px-3 py-2.5">
                        <div className="flex items-center gap-2.5">
                            <div className="text-[10px] font-extrabold uppercase tracking-[1.2px] text-white/75 shrink-0">Choose Text Color</div>
                            <button
                                type="button"
                                onClick={() => setPhotoTextColor('dark')}
                                className={` rounded-xl border text-left px-2.5 py-2 transition-all cursor-pointer ${photoTextColor === 'dark' ? 'bg-[#1a2439] border-white/18 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.05)]' : 'bg-white/3 border-white/8'}`}
                            >
                                <div className="flex items-center gap-2.5">
                                    <span className="w-7 h-7 rounded-full bg-black border border-white/10 shrink-0" />

                                </div>
                            </button>
                            <button
                                type="button"
                                onClick={() => setPhotoTextColor('light')}
                                className={` rounded-xl border text-left px-2.5 py-2 transition-all cursor-pointer ${photoTextColor === 'light' ? 'bg-white border-white shadow-[0_0_0_1px_rgba(255,255,255,0.35)]' : 'bg-white/3 border-white/8'}`}
                            >
                                <div className="flex items-center gap-2.5">
                                    <span className="w-7     h-7 rounded-full bg-white border border-white/20 shrink-0" />
                                    
                                </div>
                            </button>
                        </div>
                    </div>
                )}

                {/* Render Active Template */}
                {(() => {
                    const vf = campaign?.eslipVisibleFields;
                    const showField = (key: string) => !vf || vf.length === 0 || vf.includes(key);
                    const common = { runner, timings, campaign, slipRef, showField };
                    if (activeTemplate === 'template1') return <Template1 {...common} bgImage={bgImage} />;
                    if (activeTemplate === 'template2') return <Template2 {...common} bgImage={bgImage} textColorMode={photoTextColor} />;
                    return <Template3 {...common} bgImage={null} />;
                })()}

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

            {/* Mobile preview overlay */}
            {previewImage && (
                <div className="fixed inset-0 z-[100] bg-slate-900/95 flex flex-col items-center justify-center p-4 gap-4">
                    <img src={previewImage} alt="E-Slip" className="max-w-full max-h-[75vh] rounded-2xl shadow-2xl" />
                    <div className="text-center text-slate-300 text-sm bg-white/10 rounded-xl px-5 py-2.5 leading-relaxed">
                        📲 <b className="text-green-400">กดค้างที่รูป</b> → เลือก <b className="text-green-400">&quot;บันทึกรูปภาพ&quot;</b><br />เพื่อบันทึกลงแกลเลอรีของคุณ
                    </div>
                    <button onClick={() => setPreviewImage(null)} className="mt-2 px-8 py-3 rounded-xl bg-white/10 text-white font-bold text-sm border border-white/20 cursor-pointer">
                        ✕ ปิด
                    </button>
                </div>
            )}
        </div>
    );
}
