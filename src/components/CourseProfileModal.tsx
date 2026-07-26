'use client';

/**
 * The 2D course profile from /admin/general-chart, as a popup for the public
 * results page. It shows the GPX line of ONE distance — whichever the results
 * table is filtered to — with the checkpoints marked and the runners still out
 * there drawn on it.
 *
 * Public page, so the positions are simpler than the admin's: a runner stands at
 * the checkpoint they last scanned through, with no dead reckoning toward the
 * next one (that needs the per-leg scan medians only the admin page loads).
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { elevationRange } from '@/lib/routeGeometry';
import type { ProfileMarker } from '@/components/ElevationProfile2D';

// Measures its own container, so keep it off the server render.
const ElevationProfile2D = dynamic(() => import('@/components/ElevationProfile2D'), { ssr: false });

export interface CourseRouteTrack {
    category: string;
    coords: number[][];
    distanceKm: number;
    elevationGainM?: number;
    checkpointMarks?: { name: string; km: number }[];
}

/** The little that the profile needs to know about a runner. */
export interface CourseRunner {
    bib: string;
    name: string;
    /** 'M' / 'F' — anything else is treated as unknown and clumped. */
    gender: string;
    /** Display status: only `in_progress` runners are still on the course. */
    displayStatus: string;
    latestCheckpoint?: string;
    /** Live overall rank, used to order the leaders. */
    rank?: number;
}

interface Props {
    open: boolean;
    onClose: () => void;
    campaignId: string;
    /** Distance shown in the header, e.g. "10 KM". */
    categoryLabel: string;
    /**
     * Names a stored route may be filed under for this distance — the campaign
     * category name and the distance label are both in use across events.
     */
    categoryKeys: string[];
    runners: CourseRunner[];
    th: boolean;
    isDark: boolean;
}

/** Same shape as the event page's own comparator, kept local so this drops in anywhere. */
const norm = (v?: string | null) => String(v || '').trim().toLowerCase().replace(/[^a-z0-9ก-๙]+/g, '');

/** Route cache keyed by campaign — the coords array is big, so fetch it once. */
const routeCache = new Map<string, CourseRouteTrack[]>();

/** Clumps of runners cover this much of the course each. */
const CLUSTER_SPAN_RATIO = 0.03;

export default function CourseProfileModal({
    open, onClose, campaignId, categoryLabel, categoryKeys, runners, th, isDark,
}: Props) {
    const [routes, setRoutes] = useState<CourseRouteTrack[] | null>(() => routeCache.get(campaignId) ?? null);
    const [loading, setLoading] = useState(false);
    const [failed, setFailed] = useState(false);
    const cardRef = useRef<HTMLDivElement | null>(null);

    // Fetch on first open, not on mount — most visitors never open the profile.
    useEffect(() => {
        if (!open || !campaignId) return;
        const cached = routeCache.get(campaignId);
        if (cached) { setRoutes(cached); return; }
        let alive = true;
        setLoading(true);
        setFailed(false);
        (async () => {
            try {
                const res = await fetch(`/api/routes?campaignId=${campaignId}`, { cache: 'no-store' });
                if (!res.ok) throw new Error(String(res.status));
                const data = await res.json();
                const list: CourseRouteTrack[] = Array.isArray(data)
                    ? data.filter(r => r?.category && Array.isArray(r.coords) && r.coords.length > 1)
                    : [];
                routeCache.set(campaignId, list);
                if (alive) setRoutes(list);
            } catch {
                if (alive) setFailed(true);
            } finally {
                if (alive) setLoading(false);
            }
        })();
        return () => { alive = false; };
    }, [open, campaignId]);

    // Esc closes; the page behind must not scroll while the sheet is up.
    useEffect(() => {
        if (!open) return;
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
        window.addEventListener('keydown', onKey);
        const prevOverflow = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        return () => {
            window.removeEventListener('keydown', onKey);
            document.body.style.overflow = prevOverflow;
        };
    }, [open, onClose]);

    // Height follows the viewport: a phone gets a short profile, a desktop a tall one.
    const [chartHeight, setChartHeight] = useState(320);
    useEffect(() => {
        if (!open) return;
        const measure = () => {
            const h = window.innerHeight;
            const w = window.innerWidth;
            // Leave room for the header, the stats row and the note underneath.
            setChartHeight(Math.round(Math.max(200, Math.min(w < 640 ? 300 : 420, h - (w < 640 ? 300 : 320)))));
        };
        measure();
        window.addEventListener('resize', measure);
        window.addEventListener('orientationchange', measure);
        return () => {
            window.removeEventListener('resize', measure);
            window.removeEventListener('orientationchange', measure);
        };
    }, [open]);

    const route = useMemo(() => {
        if (!routes?.length) return null;
        const wanted = categoryKeys.map(norm).filter(Boolean);
        return routes.find(r => wanted.includes(norm(r.category))) ?? null;
    }, [routes, categoryKeys]);

    /** Checkpoints as the organiser positioned them, left to right. */
    const checkpoints = useMemo(() => {
        if (!route) return [];
        return (route.checkpointMarks || [])
            .filter(m => m?.name && Number.isFinite(m.km))
            .map(m => ({ name: m.name, km: Math.max(0, Math.min(route.distanceKm, m.km)) }))
            .sort((a, b) => a.km - b.km);
    }, [route]);

    /** Runners still on the course, placed at the checkpoint they last scanned. */
    const onCourse = useMemo(() => {
        if (!route || !checkpoints.length) return [];
        const kmByCp = new Map(checkpoints.map(c => [norm(c.name), c.km]));
        return runners
            .filter(r => r.displayStatus === 'in_progress')
            .map(r => {
                const cp = norm(r.latestCheckpoint);
                // No scan yet = still at the start line.
                const km = cp ? kmByCp.get(cp) : 0;
                return km === undefined ? null : { ...r, km, cpName: r.latestCheckpoint || checkpoints[0]?.name || '' };
            })
            .filter((r): r is CourseRunner & { km: number; cpName: string } => r !== null)
            .sort((a, b) => (b.km - a.km) || ((a.rank ?? Infinity) - (b.rank ?? Infinity)));
    }, [route, checkpoints, runners]);

    /** Three leaders per gender by name, everyone else bundled into amber clumps. */
    const markers = useMemo<ProfileMarker[]>(() => {
        if (!route || !onCourse.length) return [];
        const out: ProfileMarker[] = [];
        const named = new Set<string>();

        for (const g of ['M', 'F'] as const) {
            onCourse.filter(r => r.gender === g).slice(0, 3).forEach((r, i) => {
                named.add(r.bib);
                out.push({
                    key: `${g}-${r.bib}`,
                    km: r.km,
                    tone: g,
                    label: `#${i + 1}`,
                    sublabel: r.bib,
                    tooltip: [
                        `${i + 1}. ${r.name}`,
                        `BIB ${r.bib} · ${g === 'M' ? (th ? 'ชาย' : 'Male') : (th ? 'หญิง' : 'Female')}`,
                        `${r.km.toFixed(2)} ${th ? 'กม.' : 'km'} · ${r.cpName}`,
                    ].join('\n'),
                });
            });
        }

        const rest = onCourse.filter(r => !named.has(r.bib)).slice().sort((a, b) => a.km - b.km);
        const span = Math.max(0.2, (route.distanceKm || 0) * CLUSTER_SPAN_RATIO);
        let group: typeof rest = [];
        const flush = () => {
            if (!group.length) return;
            const chunk = group;
            group = [];
            const males = chunk.filter(r => r.gender === 'M').length;
            const females = chunk.filter(r => r.gender === 'F').length;
            const avgKm = chunk.reduce((sum, r) => sum + r.km, 0) / chunk.length;
            const lo = chunk[0].km;
            const hi = chunk[chunk.length - 1].km;
            out.push({
                key: `c${chunk[0].bib}-${chunk.length}`,
                km: avgKm,
                tone: 'GROUP',
                label: `≈${chunk.length}${th ? ' คน' : ''}`,
                cluster: true,
                tooltip: [
                    `${th ? 'ประมาณ' : 'about'} ${chunk.length} ${th ? 'คนอยู่ช่วงนี้' : 'runners here'}`,
                    `♂ ${males} / ♀ ${females}`,
                    hi - lo < 0.05
                        ? `${avgKm.toFixed(1)} ${th ? 'กม.' : 'km'}`
                        : `${lo.toFixed(1)}–${hi.toFixed(1)} ${th ? 'กม.' : 'km'}`,
                ].join('\n'),
            });
        };
        for (const r of rest) {
            if (group.length && r.km - group[0].km > span) flush();
            group.push(r);
        }
        flush();
        return out;
    }, [route, onCourse, th]);

    const onBackdrop = useCallback((e: React.MouseEvent) => {
        if (e.target === e.currentTarget) onClose();
    }, [onClose]);

    if (!open) return null;

    const surface = isDark ? '#0f172a' : '#ffffff';
    const border = isDark ? '#1e293b' : '#e2e8f0';
    const text = isDark ? '#e2e8f0' : '#0f172a';
    const muted = isDark ? '#94a3b8' : '#64748b';
    const faint = isDark ? '#64748b' : '#94a3b8';
    const ele = route ? elevationRange(route.coords) : null;

    return (
        <div
            role="dialog"
            aria-modal="true"
            aria-label={th ? 'โปรไฟล์เส้นทาง' : 'Course profile'}
            onClick={onBackdrop}
            style={{
                position: 'fixed', inset: 0, zIndex: 200,
                background: 'rgba(2,6,23,0.55)',
                backdropFilter: 'blur(2px)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: 'max(12px, env(safe-area-inset-top)) 12px max(12px, env(safe-area-inset-bottom))',
                overscrollBehavior: 'contain',
            }}
        >
            <div
                ref={cardRef}
                style={{
                    width: 'min(1040px, 100%)',
                    maxHeight: '92dvh',
                    display: 'flex',
                    flexDirection: 'column',
                    background: surface,
                    border: `1px solid ${border}`,
                    borderRadius: 16,
                    boxShadow: '0 24px 60px rgba(2,6,23,0.35)',
                    overflow: 'hidden',
                    fontFamily: "'Inter', 'Prompt', sans-serif",
                }}
            >
                {/* Header */}
                <div style={{
                    display: 'flex', alignItems: 'center', gap: 10,
                    padding: '12px 12px 12px 16px',
                    borderBottom: `1px solid ${border}`,
                    flexShrink: 0,
                }}>
                    <div style={{ minWidth: 0, flex: 1 }}>
                        <div style={{ fontSize: 13, fontWeight: 900, color: text, letterSpacing: 0.2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            📈 {th ? 'โปรไฟล์เส้นทาง' : 'Course profile'} · {categoryLabel}
                        </div>
                        <div style={{ fontSize: 10.5, color: faint, marginTop: 2 }}>
                            {th ? 'ความสูงตลอดเส้นทาง และตำแหน่งนักวิ่งที่ยังอยู่บนสนาม' : 'Elevation along the course, with the runners still out there'}
                        </div>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        aria-label={th ? 'ปิด' : 'Close'}
                        title={th ? 'ปิด' : 'Close'}
                        style={{
                            flexShrink: 0,
                            width: 34, height: 34,
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            borderRadius: 999,
                            border: `1px solid ${border}`,
                            background: 'transparent',
                            color: muted,
                            cursor: 'pointer',
                        }}
                    >
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                            <path d="M18 6L6 18M6 6l12 12" />
                        </svg>
                    </button>
                </div>

                {/* Body */}
                <div style={{ padding: '12px 12px 16px', overflowY: 'auto', flex: 1 }}>
                    {loading || (!routes && !failed) ? (
                        <div style={{ height: chartHeight, display: 'flex', alignItems: 'center', justifyContent: 'center', color: faint, fontSize: 13 }}>
                            {th ? 'กำลังโหลดเส้นทาง...' : 'Loading route...'}
                        </div>
                    ) : !route ? (
                        <div style={{ height: chartHeight, display: 'flex', alignItems: 'center', justifyContent: 'center', textAlign: 'center', color: faint, fontSize: 12.5, padding: '0 20px', lineHeight: 1.7 }}>
                            {failed
                                ? (th ? 'โหลดเส้นทางไม่สำเร็จ ลองใหม่อีกครั้ง' : 'Could not load the route, please try again')
                                : (th
                                    ? `ยังไม่มีไฟล์เส้นทาง (GPX) ของระยะ ${categoryLabel}`
                                    : `No GPX route uploaded for ${categoryLabel}`)}
                        </div>
                    ) : (
                        <>
                            {/* Legend */}
                            <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap', marginBottom: 8, fontSize: 10.5, color: muted, fontWeight: 700 }}>
                                <span><Dot color="#3b82f6" />{th ? 'ผู้นำชาย 1-2-3' : 'Top 3 male'}</span>
                                <span><Dot color="#ec4899" />{th ? 'ผู้นำหญิง 1-2-3' : 'Top 3 female'}</span>
                                <span><Dot color="#f59e0b" />{th ? 'กลุ่มนักวิ่ง' : 'Runner clumps'}</span>
                            </div>

                            <ElevationProfile2D
                                coords={route.coords}
                                distanceKm={route.distanceKm}
                                checkpoints={checkpoints}
                                markers={markers}
                                th={th}
                                height={chartHeight}
                                dark={isDark}
                            />

                            <div style={{ display: 'flex', gap: 16, justifyContent: 'center', flexWrap: 'wrap', fontSize: 10.5, color: faint, marginTop: 10 }}>
                                <span>{th ? 'ระยะทาง' : 'Distance'}: <b style={{ color: muted }}>{route.distanceKm.toFixed(2)} {th ? 'กม.' : 'km'}</b></span>
                                {!!route.elevationGainM && (
                                    <span>{th ? 'สะสมขึ้น' : 'Elevation gain'}: <b style={{ color: muted }}>▲ {route.elevationGainM.toLocaleString()} m</b></span>
                                )}
                                {ele && (
                                    <span>{th ? 'ความสูง' : 'Elevation'}: <b style={{ color: muted }}>{Math.round(ele.min)} – {Math.round(ele.max)} m</b></span>
                                )}
                                <span>{th ? 'อยู่บนเส้นทาง' : 'On course'}: <b style={{ color: muted }}>{onCourse.length}</b></span>
                            </div>

                            <div style={{ fontSize: 10, color: faint, marginTop: 8, textAlign: 'center', lineHeight: 1.7 }}>
                                {th
                                    ? '💡 ตุ๊กตายืนอยู่ที่จุดสแกนล่าสุดของนักวิ่งคนนั้น · แตะที่ตุ๊กตาเพื่อดูรายละเอียด'
                                    : '💡 Each figure stands at that runner’s last scan point · tap a figure for details'}
                                {!ele && (
                                    <div style={{ marginTop: 4, color: '#f59e0b' }}>
                                        {th
                                            ? '⚠️ ไฟล์ GPX ของระยะนี้ไม่มีข้อมูลความสูง กราฟจึงเป็นเส้นแบน'
                                            : '⚠️ This route carries no elevation data, so the profile stays flat.'}
                                    </div>
                                )}
                            </div>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}

function Dot({ color }: { color: string }) {
    return (
        <span style={{
            display: 'inline-block', width: 7, height: 7, borderRadius: '50%',
            background: color, marginRight: 5, verticalAlign: 'middle',
        }} />
    );
}
