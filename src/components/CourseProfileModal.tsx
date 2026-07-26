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
import {
    arriveByEta, buildEffortProfile, clusterByDueWindow,
    estimatePaceEtaMs, formatClock, formatCountdown,
} from '@/lib/routeProgress';
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
    /** Display status. `dnf`/`dq`/`dns`/`wait` are out of the race and not drawn. */
    displayStatus: string;
    latestCheckpoint?: string;
    /** Live overall rank, used to order the leaders. */
    rank?: number;
    /** When the last checkpoint scanned them — where the creep starts from. */
    lastPassTime?: string;
    /** Race clock at that scan, in ms — prices the leg ahead at their own pace. */
    elapsedMs?: number;
}

/** Same test the results table uses to decide a runner has crossed the line. */
const isFinishName = (v?: string | null) => {
    const upper = String(v || '').trim().toUpperCase();
    return upper.includes('FINISH') || upper === 'FIN';
};

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
    /** When this distance closes, in epoch ms — null when the event sets no cut-off. */
    cutoffAt?: number | null;
    th: boolean;
    isDark: boolean;
}

/** Same shape as the event page's own comparator, kept local so this drops in anywhere. */
const norm = (v?: string | null) => String(v || '').trim().toLowerCase().replace(/[^a-z0-9ก-๙]+/g, '');

/** Route cache keyed by campaign — the coords array is big, so fetch it once. */
const routeCache = new Map<string, CourseRouteTrack[]>();

const scanMsOf = (v?: string) => {
    const ms = v ? Date.parse(v) : NaN;
    return Number.isFinite(ms) ? ms : undefined;
};

export default function CourseProfileModal({
    open, onClose, campaignId, categoryLabel, categoryKeys, runners, cutoffAt, th, isDark,
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

    /** Climb-aware distance along the track, so the creep eases off on the hills. */
    const effort = useMemo(() => (route ? buildEffortProfile(route.coords) : null), [route]);

    // The positions move with the clock, so tick while the sheet is open.
    const [now, setNow] = useState(() => Date.now());
    useEffect(() => {
        if (!open) return;
        setNow(Date.now());
        const id = setInterval(() => setNow(Date.now()), 1000);
        return () => clearInterval(id);
    }, [open]);

    /**
     * Everyone still in the race, walking from the checkpoint they last scanned
     * toward the next one. The leg is priced exactly the way the Next/ETA column
     * in the results table prices it — average pace to date plus the same 10%
     * allowance — so the figure and the countdown next to the runner's name tell
     * the same story. Nobody is drawn past a checkpoint that has not scanned
     * them: once the estimate runs out they park just short of it.
     *
     * Finishers count: they belong at the FINISH mark, which is what the results
     * table already shows for them, and they stay put. Only runners who are out —
     * DNF, DQ, DNS, or not released yet — are left off.
     */
    const onCourse = useMemo(() => {
        if (!route || !effort || !checkpoints.length) return [];
        const kmByCp = new Map(checkpoints.map(c => [norm(c.name), c.km]));
        const finishMark = checkpoints.find(c => isFinishName(c.name));
        return runners
            .filter(r => r.displayStatus === 'in_progress' || r.displayStatus === 'finished')
            .map(r => {
                const done = r.displayStatus === 'finished' || isFinishName(r.latestCheckpoint);
                const cp = norm(r.latestCheckpoint);
                // A finisher sits on the finish line even when the last scan name
                // is missing or spelled differently from the route's marker.
                const cpKm = done
                    ? (finishMark?.km ?? route.distanceKm)
                    : cp ? kmByCp.get(cp) : 0;   // no scan yet = still at the start
                if (cpKm === undefined) return null;
                const cpName = done
                    ? (finishMark?.name || r.latestCheckpoint || 'FINISH')
                    : (r.latestCheckpoint || checkpoints[0]?.name || '');

                const next = done ? undefined : checkpoints.find(c => c.km > cpKm);
                const scanMs = scanMsOf(r.lastPassTime);
                const etaMs = next
                    ? estimatePaceEtaMs({ elapsedMs: r.elapsedMs || 0, currentKm: cpKm, nextKm: next.km })
                    : 0;
                // Without a scan clock or an estimate there is nothing to walk
                // along, so the figure stays on the checkpoint.
                const moving = !!next && etaMs > 0 && !!scanMs;
                const moved = moving
                    ? arriveByEta(effort, cpKm, next!.km, etaMs, now - scanMs!)
                    : null;

                return {
                    ...r,
                    km: moved ? moved.km : cpKm,
                    cpName,
                    done,
                    scanMs,
                    moving,
                    nextCpName: next?.name,
                    remainingMs: moved ? moved.remainingMs : 0,
                    overdue: !!moved?.overdue,
                    // What the clumps are cut by: when this runner is due at the
                    // next checkpoint. Anyone already late is due "now", so the
                    // whole overdue tail — which all parks on the same spot —
                    // shares one figure instead of one per 10 minutes of lateness.
                    // Finishers have nowhere left to be due: they are all on the
                    // line, so a single figure counts them rather than a tower of
                    // 10-minute windows of finish time.
                    dueMs: done ? 0 : moved ? now + Math.max(0, moved.remainingMs) : (scanMs ?? 0),
                    // A clump must not straddle a checkpoint, or the figure would
                    // stand where none of its members are.
                    legKey: cpKm,
                };
            })
            .filter((r): r is NonNullable<typeof r> => r !== null)
            .sort((a, b) => (b.km - a.km) || ((a.rank ?? Infinity) - (b.rank ?? Infinity)));
    }, [route, effort, checkpoints, runners, now]);

    const finishedCount = onCourse.filter(r => r.done).length;

    // Past the cut-off nobody is still racing, so the course empties: whoever is
    // left has not been swept into DNF yet, and drawing them would say the race
    // is still on.
    const pastCutoff = !!cutoffAt && now > cutoffAt;

    /** Three leaders per gender by name, everyone else bundled into amber clumps. */
    const markers = useMemo<ProfileMarker[]>(() => {
        if (!route || !onCourse.length || pastCutoff) return [];
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
                    note: r.moving && !r.overdue ? `⏱ ${formatCountdown(r.remainingMs)}` : undefined,
                    moving: r.moving && !r.overdue,
                    tooltip: [
                        `${i + 1}. ${r.name}`,
                        `BIB ${r.bib} · ${g === 'M' ? (th ? 'ชาย' : 'Male') : (th ? 'หญิง' : 'Female')}`,
                        r.done
                            ? (th ? `เข้าเส้นชัยแล้ว (${r.km.toFixed(2)} กม.)` : `Finished (${r.km.toFixed(2)} km)`)
                            : `${th ? 'จุดสแกนล่าสุด' : 'Last scan'}: ${r.cpName} (${r.km.toFixed(2)} ${th ? 'กม.' : 'km'})`,
                        r.moving && r.nextCpName
                            ? (r.overdue
                                ? (th
                                    ? `เลยเวลาที่ควรถึง ${r.nextCpName} มา ${formatCountdown(-r.remainingMs)} — รอสแกน`
                                    : `${formatCountdown(-r.remainingMs)} overdue at ${r.nextCpName}`)
                                : (th
                                    ? `ถึง ${r.nextCpName} ในอีก ${formatCountdown(r.remainingMs)}`
                                    : `${formatCountdown(r.remainingMs)} to ${r.nextCpName}`))
                            : '',
                    ].filter(Boolean).join('\n'),
                });
            });
        }

        // One figure per leg per 10 minutes of arrival time: the runners who are
        // travelling together, rather than an arbitrary stretch of course.
        const rest = onCourse.filter(r => !named.has(r.bib));
        for (const chunk of clusterByDueWindow(rest, r => ({ legKey: r.legKey, dueMs: r.dueMs }))) {
            const males = chunk.filter(r => r.gender === 'M').length;
            const females = chunk.filter(r => r.gender === 'F').length;
            const head = chunk[0];
            const km = chunk.reduce((sum, r) => sum + r.km, 0) / chunk.length;
            const scans = chunk.map(r => r.scanMs).filter((ms): ms is number => !!ms);
            const soon = chunk.filter(r => r.moving && !r.overdue).map(r => r.remainingMs);
            const late = chunk.filter(r => r.overdue).map(r => -r.remainingMs);
            out.push({
                key: `c${head.legKey}-${Math.round(head.dueMs / 60000)}-${head.bib}`,
                km,
                tone: 'GROUP',
                label: `≈${chunk.length}${th ? ' คน' : ''}`,
                note: soon.length ? `⏱ ${formatCountdown(Math.min(...soon))}` : undefined,
                moving: chunk.some(r => r.moving && !r.overdue),
                cluster: true,
                tooltip: [
                    head.done
                        ? `${chunk.length} ${th ? 'คนเข้าเส้นชัยแล้ว' : 'runners finished'}`
                        : `${chunk.length} ${th ? 'คนวิ่งมาด้วยกัน' : 'runners travelling together'}`,
                    `♂ ${males} / ♀ ${females}`,
                    head.done
                        ? `${head.cpName} · ${km.toFixed(1)} ${th ? 'กม.' : 'km'}`
                        : `${km.toFixed(1)} ${th ? 'กม.' : 'km'} · ${th ? 'ออกจาก' : 'left'} ${head.cpName}${head.nextCpName ? ` → ${head.nextCpName}` : ''}`,
                    scans.length
                        ? `${th ? (head.done ? 'เข้าเส้นชัยตั้งแต่' : 'สแกนล่าสุด') : (head.done ? 'From' : 'Last scan')} ${formatClock(Math.min(...scans))}${head.done && Math.max(...scans) - Math.min(...scans) >= 60000 ? `–${formatClock(Math.max(...scans))}` : ''}`
                        : (th ? 'ยังไม่มีการสแกน' : 'No scan yet'),
                    late.length === chunk.length && head.nextCpName
                        ? (th
                            ? `เลยเวลาที่ควรถึง ${head.nextCpName} แล้ว ${formatCountdown(Math.min(...late))}–${formatCountdown(Math.max(...late))} — รอสแกน`
                            : `${formatCountdown(Math.min(...late))}–${formatCountdown(Math.max(...late))} overdue at ${head.nextCpName}`)
                        : soon.length && head.nextCpName
                            ? `${th ? 'ถึง' : 'Due at'} ${head.nextCpName} ${th ? 'ในอีก' : 'in'} ${formatCountdown(Math.min(...soon))}`
                            : '',
                ].filter(Boolean).join('\n'),
            });
        }
        return out;
    }, [route, onCourse, th, pastCutoff]);

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
                                <span><Dot color="#f59e0b" />{th ? 'กลุ่มนักวิ่ง (ถึงจุดหน้าห่างกันไม่เกิน 10 นาที)' : 'Runner clumps (due within 10 min)'}</span>
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
                                <span>{th ? 'อยู่บนเส้นทาง' : 'On course'}: <b style={{ color: muted }}>{onCourse.length - finishedCount}</b></span>
                                <span>{th ? 'เข้าเส้นชัยแล้ว' : 'Finished'}: <b style={{ color: muted }}>{finishedCount}</b></span>
                            </div>

                            {pastCutoff && (
                                <div style={{ fontSize: 11, color: '#dc2626', fontWeight: 700, marginTop: 10, textAlign: 'center' }}>
                                    {th
                                        ? `⏹ หมดเวลา cut-off ของ ${categoryLabel} แล้ว (${formatClock(cutoffAt!)}) — ไม่แสดงตุ๊กตานักวิ่งบนเส้นทาง`
                                        : `⏹ ${categoryLabel} closed at ${formatClock(cutoffAt!)} — runners are no longer drawn on the course`}
                                </div>
                            )}

                            <div style={{ fontSize: 10, color: faint, marginTop: 8, textAlign: 'center', lineHeight: 1.7 }}>
                                {th
                                    ? '💡 ตุ๊กตาจะค่อยๆ เดินจากจุดสแกนล่าสุดไปยังจุดถัดไป ตามเวลาเดียวกับช่อง NEXT/ETA ในตาราง (คนที่จบแล้วอยู่ที่ FINISH) · ตุ๊กตาเหลือง 1 ตัว = คนที่จะถึงจุดหน้าห่างกันไม่เกิน 10 นาที ถ้าห่างกว่านั้นจะแยกเป็นตัวถัดไป · คนที่เลยเวลาแล้วยังไม่ถูกสแกนจะรออยู่ก่อนถึงจุดนั้นและรวมเป็นตัวเดียว · แตะเพื่อดูรายละเอียด'
                                    : '💡 Each figure walks from its last scan point toward the next checkpoint on the same estimate as the NEXT/ETA column (finishers sit on FINISH) · one amber figure groups everyone due there within 10 minutes of each other, a longer gap starts the next figure · anyone past due with no scan waits just short of the line as a single figure · tap for details'}
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
