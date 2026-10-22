'use client';

import { useEffect, useMemo, useState, type ReactNode } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { distanceKeyOf, hasPassedCheckpoint, isNotablePlacing, type CheckpointPlacing } from '@/lib/checkpoint-placings';
import type { FeedEntry } from './useArrivalPacer';

/**
 * Announcer (พิธีกร) screen for /share-live — built to be read aloud from:
 * one big card for the runner to call out now, a feed of who just came through (newest
 * on top, released one at a time by useArrivalPacer), and the leaders at this point.
 * Every placing and time on it is the runner's AT THIS CHECKPOINT.
 */

export interface AnnouncerRunner {
    _id: string;
    bib: string;
    firstName: string;
    lastName: string;
    firstNameTh?: string;
    lastNameTh?: string;
    gender: string;
    category: string;
    ageGroup?: string;
    status: string;
    scanTime?: string;
    gunTime?: number;
    netTime?: number;
    elapsedTime?: number;
    netPace?: string;
    gunPace?: string;
}

export interface DistanceOption { key: string; label: string; color: string; count: number; }

interface Props {
    campaignName: string;
    checkpoints: { _id: string; name: string }[];
    selectedCp: string;
    onSelectCp: (cp: string) => void;
    onShowList: () => void;
    isFinish: boolean;
    isStart: boolean;
    loading: boolean;
    refreshFailed: boolean;
    runners: AnnouncerRunner[];
    runnerByKey: Map<string, AnnouncerRunner>;
    keyOf: (r: AnnouncerRunner) => string;
    placings: Map<string, CheckpointPlacing>;
    feed: FeedEntry[];
    spotlightKey: string | null;
    onPin: (key: string) => void;
    queued: number;
    paused: boolean;
    onTogglePause: () => void;
    onFlush: () => void;
    distances: DistanceOption[];
    distanceFilter: string;
    onDistanceFilter: (key: string) => void;
    notableOnly: boolean;
    onNotableOnly: (on: boolean) => void;
    isVisible: (key: string) => boolean;
    soundButton: ReactNode;
}

const FEED_ROWS = 40;
const LEADERS_PER_GENDER = 5;
const FRESH_MS = 12000;
const MEDALS = ['🥇', '🥈', '🥉'];

function formatDuration(ms?: number): string {
    if (!ms || ms <= 0) return '-';
    const h = Math.floor(ms / 3600000);
    const m = Math.floor((ms % 3600000) / 60000);
    const s = Math.floor((ms % 60000) / 1000);
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function formatClock(iso?: string): string {
    if (!iso) return '-';
    const d = new Date(iso);
    if (!Number.isFinite(d.getTime())) return '-';
    return d.toLocaleTimeString('th-TH', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function displayName(r: AnnouncerRunner): { primary: string; secondary: string } {
    const th = `${r.firstNameTh || ''} ${r.lastNameTh || ''}`.trim();
    const en = `${r.firstName || ''} ${r.lastName || ''}`.trim();
    if (th) return { primary: th, secondary: en && en !== th ? en : '' };
    return { primary: en || `BIB ${r.bib}`, secondary: '' };
}

function genderOf(r: AnnouncerRunner): { label: string; symbol: string; cls: string } {
    const g = String(r.gender || '').trim().toUpperCase();
    if (g === 'F') return { label: 'หญิง', symbol: '♀', cls: 'text-pink-600' };
    if (g === 'M') return { label: 'ชาย', symbol: '♂', cls: 'text-blue-600' };
    return { label: g || '-', symbol: '', cls: 'text-slate-500' };
}

function rankText(n?: number): string {
    if (!n || n <= 0) return '-';
    return n <= 3 ? `${MEDALS[n - 1]} ${n}` : String(n);
}

function DistanceBadge({ option, label, size = 'md' }: { option?: DistanceOption; label: string; size?: 'sm' | 'md' }) {
    return (
        <span
            className={`inline-flex items-center rounded-md font-extrabold tracking-wide text-black ${size === 'sm' ? 'px-1.5 py-px text-[11px]' : 'px-2.5 py-0.5 text-sm sm:text-base'}`}
            style={{ background: option?.color || '#cbd5e1' }}
        >
            {label || '-'}
        </span>
    );
}

function Stat({ label, value, sub, strong }: { label: string; value: string; sub?: string; strong?: boolean }) {
    return (
        <div className={`rounded-xl border px-3 py-2.5 ${strong ? 'border-green-200 bg-green-50' : 'border-slate-200 bg-slate-50'}`}>
            <div className="text-[12px] sm:text-[13px] font-semibold text-slate-500 truncate">{label}</div>
            <div className={`font-black tabular-nums leading-tight ${strong ? 'text-3xl sm:text-4xl text-green-700' : 'text-2xl sm:text-4xl text-slate-900'}`}>{value}</div>
            {sub && <div className="text-[12px] sm:text-sm text-slate-500 tabular-nums">{sub}</div>}
        </div>
    );
}

export default function AnnouncerView(p: Props) {
    const { runners, runnerByKey, keyOf, placings, feed, isVisible, distances, distanceFilter } = p;
    const [now, setNow] = useState(() => Date.now());
    useEffect(() => {
        const id = setInterval(() => setNow(Date.now()), 1000);
        return () => clearInterval(id);
    }, []);

    const [isFullscreen, setIsFullscreen] = useState(false);
    useEffect(() => {
        const onChange = () => setIsFullscreen(!!document.fullscreenElement);
        document.addEventListener('fullscreenchange', onChange);
        return () => document.removeEventListener('fullscreenchange', onChange);
    }, []);
    const toggleFullscreen = () => {
        if (document.fullscreenElement) document.exitFullscreen?.().catch(() => { /* */ });
        else document.documentElement.requestFullscreen?.().catch(() => { /* */ });
    };

    const distanceByKey = useMemo(() => new Map(distances.map(d => [d.key, d])), [distances]);
    const optionOf = (r: AnnouncerRunner) => distanceByKey.get(distanceKeyOf(r));

    const visibleFeed = useMemo(
        () => feed.filter(e => runnerByKey.has(e.key) && isVisible(e.key)).slice(0, FEED_ROWS),
        [feed, runnerByKey, isVisible],
    );
    const spotlightKey = p.spotlightKey && runnerByKey.has(p.spotlightKey) && isVisible(p.spotlightKey)
        ? p.spotlightKey
        : visibleFeed[0]?.key || null;
    const spot = spotlightKey ? runnerByKey.get(spotlightKey) : undefined;
    const spotPlacing = spotlightKey ? placings.get(spotlightKey) : undefined;

    const latestScanMs = useMemo(() => {
        let max = 0;
        for (const r of runners) {
            if (!hasPassedCheckpoint(r)) continue;
            const t = new Date(r.scanTime!).getTime();
            if (Number.isFinite(t) && t > max) max = t;
        }
        return max;
    }, [runners]);
    const agoSec = latestScanMs > 0 ? Math.max(0, Math.round((now - latestScanMs) / 1000)) : null;

    // Leaders at this checkpoint: top N per gender for each distance on screen.
    const leaders = useMemo(() => {
        const groups = new Map<string, { M: AnnouncerRunner[]; F: AnnouncerRunner[] }>();
        for (const r of runners) {
            const pl = placings.get(keyOf(r));
            if (!pl || pl.gender > LEADERS_PER_GENDER) continue;
            const d = distanceKeyOf(r);
            if (distanceFilter && d !== distanceFilter) continue;
            const g = String(r.gender || '').toUpperCase() === 'F' ? 'F' : 'M';
            if (!groups.has(d)) groups.set(d, { M: [], F: [] });
            groups.get(d)![g].push(r);
        }
        const byGender = (a: AnnouncerRunner, b: AnnouncerRunner) =>
            (placings.get(keyOf(a))?.gender || 0) - (placings.get(keyOf(b))?.gender || 0);
        const order = distances.map(d => d.key);
        return [...groups.entries()]
            .sort((a, b) => order.indexOf(a[0]) - order.indexOf(b[0]))
            .map(([key, g]) => ({ key, M: g.M.sort(byGender), F: g.F.sort(byGender) }));
    }, [runners, placings, keyOf, distanceFilter, distances]);

    const passedTotal = distances.reduce((sum, d) => sum + d.count, 0);
    const actionLabel = p.isFinish ? 'เข้าเส้นชัย' : p.isStart ? 'ปล่อยตัว' : `ผ่าน ${p.selectedCp}`;
    const showRanks = !p.isStart;

    return (
        <div className="min-h-screen bg-slate-50 text-slate-900">
            {/* ===== Top banner (same green as the table view) ===== */}
            <header className="sticky top-0 z-20 shadow-lg">
                <div className="bg-gradient-to-r from-green-700 to-emerald-600 px-3 py-2.5 text-white sm:px-5">
                    <div className="mx-auto flex max-w-[1400px] items-center justify-between gap-2 sm:gap-4">
                        <div className="flex min-w-0 items-center gap-2.5">
                            <Link href="/" className="hidden flex-shrink-0 sm:block" title="กลับหน้าแรก">
                                <Image src="/logo-white.png" alt="ACTION" width={72} height={24} style={{ objectFit: 'contain' }} />
                            </Link>
                            <h1 className="m-0 min-w-0 truncate text-[13px] font-extrabold leading-tight sm:border-l sm:border-white/30 sm:pl-2.5 sm:text-base">{p.campaignName}</h1>
                        </div>
                        <div className="flex flex-shrink-0 items-center gap-1.5 sm:gap-2">
                            <button
                                onClick={p.onShowList}
                                className="cursor-pointer whitespace-nowrap rounded-lg border-2 border-white/60 bg-white/10 px-2.5 py-1.5 text-[12px] font-bold text-white hover:bg-white/20 sm:py-2 sm:text-sm"
                                title="ดูรายชื่อทั้งหมดแบบตาราง"
                            >
                                📋<span className="hidden sm:inline"> รายชื่อ</span>
                            </button>
                            <select
                                value={p.selectedCp}
                                onChange={e => p.onSelectCp(e.target.value)}
                                aria-label="เลือกจุด checkpoint"
                                className="max-w-[38vw] cursor-pointer rounded-lg border-2 border-green-400 bg-green-800 px-2 py-1.5 text-[13px] font-bold text-white sm:max-w-none sm:min-w-[180px] sm:px-3.5 sm:py-2 sm:text-sm"
                            >
                                {p.checkpoints.length === 0 && <option value="">No checkpoints</option>}
                                {p.checkpoints.map(cp => <option key={cp._id} value={cp.name}>{cp.name}</option>)}
                            </select>
                        </div>
                    </div>
                </div>

                {/* Filters + live status */}
                <div className="border-b border-slate-200 bg-white/95 backdrop-blur">
                    <div className="mx-auto flex max-w-[1400px] flex-col gap-1.5 px-3 py-2 sm:flex-row sm:items-center sm:gap-2 sm:px-5">
                        <div className="flex min-w-0 items-center gap-1.5 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                            <button
                                onClick={() => p.onDistanceFilter('')}
                                aria-pressed={!p.distanceFilter}
                                className={`flex-shrink-0 cursor-pointer whitespace-nowrap rounded-lg px-2.5 py-1.5 text-xs font-bold sm:text-sm ${!p.distanceFilter ? 'bg-green-600 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'}`}
                            >
                                ทุกระยะ <span className="tabular-nums opacity-80">{passedTotal.toLocaleString()}</span>
                            </button>
                            {p.distances.map(d => {
                                const active = p.distanceFilter === d.key;
                                return (
                                    <button
                                        key={d.key}
                                        onClick={() => p.onDistanceFilter(active ? '' : d.key)}
                                        aria-pressed={active}
                                        className={`flex flex-shrink-0 cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-lg px-2.5 py-1.5 text-xs font-bold sm:text-sm ${active ? 'text-black ring-2 ring-slate-900/10' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'}`}
                                        style={active ? { background: d.color } : undefined}
                                    >
                                        {!active && <span className="h-2.5 w-2.5 rounded-full" style={{ background: d.color }} />}
                                        {d.label} <span className="tabular-nums opacity-70">{d.count.toLocaleString()}</span>
                                    </button>
                                );
                            })}
                            {showRanks && (
                                <button
                                    onClick={() => p.onNotableOnly(!p.notableOnly)}
                                    aria-pressed={p.notableOnly}
                                    title="แสดงเฉพาะ Top 10 รวม · Top 5 ชาย/หญิง · Top 3 รุ่นอายุ"
                                    className={`flex-shrink-0 cursor-pointer whitespace-nowrap rounded-lg px-2.5 py-1.5 text-xs font-bold sm:text-sm ${p.notableOnly ? 'bg-amber-400 text-black' : 'bg-amber-50 text-amber-700 hover:bg-amber-100'}`}
                                >
                                    🏆 เฉพาะติดอันดับ
                                </button>
                            )}
                        </div>
                        <div className="flex flex-shrink-0 items-center gap-2 sm:ml-auto">
                            <div className={`flex items-center gap-1.5 whitespace-nowrap text-[11px] sm:text-xs ${p.refreshFailed ? 'text-red-600' : 'text-slate-500'}`}>
                                <span className={`h-2 w-2 rounded-full ${p.refreshFailed ? 'bg-red-500' : 'sl-live-dot bg-green-500'}`} />
                                {p.refreshFailed
                                    ? 'เชื่อมต่อไม่ได้ — กำลังลองใหม่'
                                    : agoSec !== null
                                        ? <span>ผ่านล่าสุด <b className="tabular-nums text-slate-800">{formatClock(new Date(latestScanMs).toISOString())}</b><span> ({agoSec < 120 ? `${agoSec} วิ` : `${Math.round(agoSec / 60)} นาที`}ที่แล้ว)</span></span>
                                        : 'LIVE'}
                            </div>
                            <div className="ml-auto flex items-center gap-1.5 sm:ml-1">
                                {p.soundButton}
                                <button
                                    onClick={toggleFullscreen}
                                    className="hidden cursor-pointer rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-sm font-bold text-slate-600 hover:bg-slate-50 sm:block"
                                    title={isFullscreen ? 'ออกจากเต็มจอ' : 'เต็มจอ'}
                                >
                                    {isFullscreen ? '🗗' : '⛶'}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            </header>

            <main className={`mx-auto grid max-w-[1400px] gap-3 px-3 py-3 sm:px-5 ${showRanks ? 'lg:grid-cols-[minmax(0,1fr)_380px]' : ''}`}>
                <section className="min-w-0">
                    {/* ===== Spotlight: the runner to call out now ===== */}
                    {spot ? (() => {
                        const name = displayName(spot);
                        const gender = genderOf(spot);
                        const notable = isNotablePlacing(spotPlacing) && showRanks;
                        return (
                            <div
                                key={spotlightKey!}
                                className={`sl-pop overflow-hidden rounded-2xl border shadow-sm ${notable ? 'border-amber-300 bg-gradient-to-br from-amber-50 via-white to-white ring-2 ring-amber-200' : 'border-slate-200 bg-white'}`}
                            >
                                <div className={`h-1.5 ${notable ? 'bg-gradient-to-r from-amber-400 to-yellow-300' : 'bg-gradient-to-r from-green-700 to-emerald-500'}`} />
                                <div className="p-4 sm:p-6">
                                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                                        <span className="text-sm font-extrabold uppercase tracking-wide text-green-700 sm:text-base">{actionLabel}</span>
                                        <span className="text-sm tabular-nums text-slate-500 sm:text-base">{formatClock(spot.scanTime)}</span>
                                        {notable && (
                                            <span className="ml-auto rounded-full bg-amber-400 px-3 py-1 text-xs font-black text-black sm:text-sm">🏆 ติดอันดับ — ควรประกาศ</span>
                                        )}
                                    </div>
                                    <div className="mt-2 flex flex-col gap-1 sm:mt-3 sm:flex-row sm:items-end sm:gap-6">
                                        <div className="flex-shrink-0">
                                            <div className="text-xs font-bold text-slate-400 sm:text-sm">BIB</div>
                                            <div className="text-[56px] font-black leading-none tabular-nums text-slate-900 sm:text-8xl">{spot.bib}</div>
                                        </div>
                                        <div className="min-w-0 flex-1">
                                            <div className="break-words text-[28px] font-extrabold leading-tight text-slate-900 sm:text-5xl">{name.primary}</div>
                                            {name.secondary && <div className="truncate text-base text-slate-500 sm:text-xl">{name.secondary}</div>}
                                            <div className="mt-2 flex flex-wrap items-center gap-2 text-base sm:text-lg">
                                                <DistanceBadge option={optionOf(spot)} label={spot.category} />
                                                <span className={`font-bold ${gender.cls}`}>{gender.symbol} {gender.label}</span>
                                                {spot.ageGroup && <span className="text-slate-600">รุ่น {spot.ageGroup}</span>}
                                            </div>
                                        </div>
                                    </div>
                                    {showRanks && (
                                        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
                                            <Stat label={`อันดับรวม ${spot.category}`} value={rankText(spotPlacing?.overall)} />
                                            <Stat label={`อันดับ${gender.label}`} value={rankText(spotPlacing?.gender)} />
                                            <Stat label={spot.ageGroup ? `อันดับรุ่น ${spot.ageGroup}` : 'อันดับรุ่นอายุ'} value={rankText(spotPlacing?.ageGroup)} />
                                            <Stat
                                                strong
                                                label={p.isFinish ? 'เวลา (Gun)' : `เวลาที่ ${p.selectedCp} (Gun)`}
                                                value={formatDuration(spot.gunTime)}
                                                sub={`Net ${formatDuration(spot.netTime ?? spot.elapsedTime)}${spot.netPace && spot.netPace !== '00:00' ? ` · ${spot.netPace}/km` : ''}`}
                                            />
                                        </div>
                                    )}
                                </div>
                            </div>
                        );
                    })() : (
                        <div className="flex min-h-[220px] flex-col items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-white p-6 text-center">
                            <div className="text-4xl">{p.loading ? '⏳' : '🏁'}</div>
                            <div className="mt-2 text-lg font-bold text-slate-600">{p.loading ? 'กำลังโหลด...' : 'ยังไม่มีนักวิ่งถึงจุดนี้'}</div>
                            {!p.loading && <div className="text-sm text-slate-400">นักวิ่งคนแรกที่ผ่าน {p.selectedCp} จะขึ้นตรงนี้ทันที</div>}
                        </div>
                    )}

                    {/* ===== Queue / pause ===== */}
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                        <button
                            onClick={p.onTogglePause}
                            className={`cursor-pointer rounded-lg px-3 py-2 text-sm font-extrabold shadow-sm ${p.paused ? 'bg-amber-400 text-black' : 'border border-slate-200 bg-white text-slate-700 hover:bg-slate-50'}`}
                            title="กด Space เพื่อหยุด/เล่นต่อ"
                        >
                            {p.paused ? '▶ เล่นต่อ' : '⏸ หยุดรายชื่อ'}
                        </button>
                        <span className="text-sm text-slate-500">
                            {p.paused
                                ? <>หยุดอยู่ — มีนักวิ่งรอขึ้นจอ <b className="tabular-nums text-amber-600">{p.queued}</b> คน</>
                                : p.queued > 0
                                    ? <>กำลังทยอยขึ้นจอทีละคน · รออีก <b className="tabular-nums text-slate-900">{p.queued}</b> คน</>
                                    : 'รายชื่อใหม่จะขึ้นด้านบนทีละคน'}
                        </span>
                        {p.queued > 0 && (
                            <button onClick={p.onFlush} className="ml-auto cursor-pointer rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-700 shadow-sm hover:bg-slate-50">
                                ⏭ ข้ามไปล่าสุด
                            </button>
                        )}
                    </div>

                    {/* ===== Feed ===== */}
                    <div className="mt-3 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                        <div className="flex items-center justify-between border-b border-green-100 bg-green-50 px-3 py-2 text-xs font-bold text-green-800 sm:px-4">
                            <span>เพิ่งผ่าน {p.selectedCp} · ใหม่สุดอยู่บน</span>
                            <span className="font-semibold text-green-700/70">แตะชื่อเพื่อขึ้นการ์ดใหญ่</span>
                        </div>
                        {visibleFeed.length === 0 ? (
                            <div className="p-8 text-center text-slate-400">{p.loading ? 'กำลังโหลด...' : p.notableOnly ? 'ยังไม่มีนักวิ่งติดอันดับผ่านจุดนี้' : 'ยังไม่มีนักวิ่งถึงจุดนี้'}</div>
                        ) : (
                            <ul className="m-0 list-none p-0">
                                {visibleFeed.map(({ key, at }) => {
                                    const r = runnerByKey.get(key)!;
                                    const pl = placings.get(key);
                                    const name = displayName(r);
                                    const gender = genderOf(r);
                                    const notable = showRanks && isNotablePlacing(pl);
                                    const fresh = now - at < FRESH_MS;
                                    const isSpot = key === spotlightKey;
                                    return (
                                        <li
                                            key={key}
                                            onClick={() => p.onPin(key)}
                                            className={`grid cursor-pointer grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 border-b border-slate-100 px-3 py-2.5 last:border-b-0 hover:bg-slate-50 sm:gap-4 sm:px-4 ${fresh ? 'sl-fresh' : ''} ${notable ? 'bg-amber-50' : ''} ${isSpot ? 'shadow-[inset_4px_0_0_#16a34a]' : ''}`}
                                        >
                                            <div className="w-[76px] sm:w-[108px]">
                                                <div className="text-2xl font-black leading-none tabular-nums text-slate-900 sm:text-[32px]">{r.bib}</div>
                                                <div className="mt-1 text-[11px] tabular-nums text-slate-400 sm:text-xs">{formatClock(r.scanTime)}</div>
                                            </div>
                                            <div className="min-w-0">
                                                <div className="flex items-center gap-2">
                                                    <span className="truncate text-lg font-bold text-slate-900 sm:text-2xl">{name.primary}</span>
                                                    {fresh && <span className="flex-shrink-0 rounded bg-green-600 px-1.5 py-px text-[10px] font-black text-white">ใหม่</span>}
                                                </div>
                                                <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-slate-600 sm:text-sm">
                                                    <DistanceBadge size="sm" option={optionOf(r)} label={r.category} />
                                                    <span className={`font-bold ${gender.cls}`}>{gender.symbol} {gender.label}</span>
                                                    {r.ageGroup && <span className="text-slate-500">{r.ageGroup}</span>}
                                                    {notable && <span className="font-bold text-amber-500">🏆</span>}
                                                </div>
                                                {showRanks && (
                                                    <div className="mt-0.5 text-xs text-slate-500 sm:hidden">
                                                        รวม <b className="text-slate-900">{rankText(pl?.overall)}</b>
                                                        <span className="mx-1 text-slate-300">·</span>
                                                        {gender.label} <b className="text-slate-900">{rankText(pl?.gender)}</b>
                                                        {r.ageGroup && <><span className="mx-1 text-slate-300">·</span>รุ่น <b className="text-slate-900">{rankText(pl?.ageGroup)}</b></>}
                                                    </div>
                                                )}
                                            </div>
                                            <div className="text-right">
                                                {showRanks && (
                                                    <div className="hidden text-sm text-slate-500 sm:block">
                                                        รวม <b className="text-slate-900">{rankText(pl?.overall)}</b>
                                                        <span className="mx-1 text-slate-300">·</span>
                                                        {gender.label} <b className="text-slate-900">{rankText(pl?.gender)}</b>
                                                        {r.ageGroup && <><span className="mx-1 text-slate-300">·</span>รุ่น <b className="text-slate-900">{rankText(pl?.ageGroup)}</b></>}
                                                    </div>
                                                )}
                                                {showRanks && <div className="text-lg font-bold tabular-nums text-green-700 sm:text-2xl">{formatDuration(r.gunTime)}</div>}
                                            </div>
                                        </li>
                                    );
                                })}
                            </ul>
                        )}
                    </div>
                </section>

                {/* ===== Leaders at this checkpoint ===== */}
                {showRanks && (
                    <aside className="min-w-0">
                        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm lg:sticky lg:top-[120px]">
                            <div className="bg-gradient-to-r from-green-700 to-emerald-600 px-4 py-2.5 text-white">
                                <div className="text-sm font-extrabold">{p.isFinish ? '🏆 อันดับต้น ณ เส้นชัย' : `🏃 ผู้นำที่ ${p.selectedCp}`}</div>
                                <div className="text-[11px] text-white/80">Top {LEADERS_PER_GENDER} ชาย / หญิง ของแต่ละระยะ · เรียงตาม Gun time ที่จุดนี้</div>
                            </div>
                            {leaders.length === 0 ? (
                                <div className="p-6 text-center text-sm text-slate-400">ยังไม่มีข้อมูล</div>
                            ) : leaders.map(group => (
                                <div key={group.key} className="border-b border-slate-100 px-3 py-2.5 last:border-b-0">
                                    <DistanceBadge size="sm" option={distanceByKey.get(group.key)} label={distanceByKey.get(group.key)?.label || group.key} />
                                    {(['M', 'F'] as const).map(g => group[g].length > 0 && (
                                        <div key={g} className="mt-1.5">
                                            <div className={`text-[11px] font-bold ${g === 'F' ? 'text-pink-600' : 'text-blue-600'}`}>{g === 'F' ? '♀ หญิง' : '♂ ชาย'}</div>
                                            {group[g].map(r => {
                                                const key = keyOf(r);
                                                const pl = placings.get(key);
                                                return (
                                                    <button
                                                        key={key}
                                                        onClick={() => p.onPin(key)}
                                                        className="grid w-full cursor-pointer grid-cols-[34px_58px_minmax(0,1fr)_auto] items-center gap-1.5 rounded-md border-none bg-transparent px-1 py-1 text-left text-sm text-slate-800 hover:bg-slate-50"
                                                    >
                                                        <span className="font-bold tabular-nums">{pl?.gender && pl.gender <= 3 ? MEDALS[pl.gender - 1] : pl?.gender}</span>
                                                        <span className="font-extrabold tabular-nums">{r.bib}</span>
                                                        <span className="truncate">{displayName(r).primary}</span>
                                                        <span className="tabular-nums font-semibold text-green-700">{formatDuration(r.gunTime)}</span>
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    ))}
                                </div>
                            ))}
                        </div>
                    </aside>
                )}
            </main>

            <div className="pb-6 text-center text-xs text-slate-400">Powered by RFID Timing System •</div>

            <style dangerouslySetInnerHTML={{
                __html: `
                @keyframes slFresh { from { background-color: rgba(34, 197, 94, 0.22); } to { background-color: transparent; } }
                @keyframes slPop { from { transform: scale(0.985); opacity: 0.4; } to { transform: none; opacity: 1; } }
                @keyframes slDot { 0%, 100% { opacity: 1; } 50% { opacity: 0.25; } }
                .sl-fresh { animation: slFresh 6s ease-out; }
                .sl-pop { animation: slPop 0.35s ease-out; }
                .sl-live-dot { animation: slDot 1.6s ease-in-out infinite; }
                @media (prefers-reduced-motion: reduce) { .sl-fresh, .sl-pop, .sl-live-dot { animation: none; } }
            `}} />
        </div>
    );
}
