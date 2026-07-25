'use client';

import React, { useEffect, useState, useCallback, useMemo, useRef, useLayoutEffect } from 'react';
import dynamic from 'next/dynamic';
import { useLanguage } from '@/lib/language-context';
import AdminLayout from '../AdminLayout';
import '../admin.css';
import {
    BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, LabelList, Legend,
    AreaChart, Area,
} from 'recharts';
import { resolveCpKm, elevationRange } from '@/lib/routeGeometry';
import { arriveByEta, buildEffortProfile, effortAtKm, estimateLegMs, formatCountdown } from '@/lib/routeProgress';
import type { ProfileMarker } from '@/components/ElevationProfile2D';

// ─── Types ───────────────────────────────────────────────────────────────────
interface Campaign {
    _id: string;
    name: string;
    date?: string;
    location?: string;
    categories?: { name: string; distance?: string }[];
}

interface Checkpoint {
    _id: string;
    name: string;
    orderNum?: number;
    type?: string;
    distanceMappings?: string[];
}

interface Runner {
    _id: string;
    bib: string;
    firstName: string;
    lastName: string;
    gender: string;
    category: string;
    ageGroup?: string;
    status: string;
    latestCheckpoint?: string;
    passedCount?: number;
    gunTime?: number;
    netTime?: number;
    netTimeStr?: string;
    gunTimeStr?: string;
    /** Time on course at the last scan — orders runners sitting on the same stretch. */
    elapsedTime?: number;
    overallRank?: number;
}

interface TimingRecord {
    bib: string;
    scanTime?: string;
    elapsedTime?: number;
}

/** "42 K" / "42k" → "42K", so category names and event names line up. */
const normCat = (s: string) => (s || '').trim().toUpperCase().replace(/\s+/g, '');

/** A GPX course line uploaded for one race category (see /admin/events/create). */
interface RouteTrack {
    category: string;
    coords: number[][];        // [[lat, lng, cumulativeKm], ...]
    distanceKm: number;
    elevationGainM?: number;
    fileName?: string;
    checkpointMarks?: { name: string; km: number }[];
}

// Measures its own container, so keep it off the server render.
const ElevationProfile2D = dynamic(() => import('@/components/ElevationProfile2D'), {
    ssr: false,
    loading: () => (
        <div style={{ height: 340, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94a3b8', fontSize: 13, background: '#f8fafc', borderRadius: 10 }}>
            ...
        </div>
    ),
});

// Leaflet touches the DOM on load, so the map is client-only.
const RouteDensityMap = dynamic(() => import('@/components/RouteDensityMap'), {
    ssr: false,
    loading: () => (
        <div style={{ height: 380, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94a3b8', fontSize: 13, background: '#f8fafc', borderRadius: 10 }}>
            กำลังโหลดแผนที่...
        </div>
    ),
});

// ─── Styles ──────────────────────────────────────────────────────────────────
const styles = {
    // Page wrapper
    page: {
        fontFamily: "'Inter', 'Segoe UI', sans-serif",
        maxWidth: 1200,
        margin: '0 auto',
    } as React.CSSProperties,

    // Hero section
    hero: {
        background: 'linear-gradient(135deg, #0f1b2d 0%, #1a2940 50%, #0d253f 100%)',
        borderRadius: 16,
        padding: '32px 36px',
        marginBottom: 24,
        position: 'relative' as const,
        overflow: 'hidden',
    } as React.CSSProperties,
    heroOverlay: {
        position: 'absolute' as const,
        top: 0, right: 0, bottom: 0,
        width: '40%',
        background: 'linear-gradient(90deg, #0f1b2d 0%, transparent 30%)',
        zIndex: 1,
    } as React.CSSProperties,
    heroBg: {
        position: 'absolute' as const,
        top: 0, right: 0, bottom: 0,
        width: '50%',
        opacity: 0.12,
        backgroundImage: 'url("data:image/svg+xml,%3Csvg width=\'60\' height=\'60\' viewBox=\'0 0 60 60\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Cg fill=\'none\' fill-rule=\'evenodd\'%3E%3Cg fill=\'%23ffffff\' fill-opacity=\'0.15\'%3E%3Cpath d=\'M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z\'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")',
    } as React.CSSProperties,
    heroContent: {
        position: 'relative' as const,
        zIndex: 2,
    } as React.CSSProperties,
    liveBadge: {
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        background: 'rgba(239, 68, 68, 0.15)',
        color: '#ef4444',
        padding: '5px 14px',
        borderRadius: 20,
        fontSize: 11,
        fontWeight: 800,
        letterSpacing: 1.2,
        textTransform: 'uppercase' as const,
        marginBottom: 12,
        border: '1px solid rgba(239, 68, 68, 0.25)',
    } as React.CSSProperties,
    liveDot: {
        width: 7,
        height: 7,
        borderRadius: '50%',
        background: '#ef4444',
        animation: 'pulse 2s infinite',
    } as React.CSSProperties,
    heroTitle: {
        fontSize: 28,
        fontWeight: 900,
        color: '#ffffff',
        margin: '0 0 6px',
        letterSpacing: -0.5,
        lineHeight: 1.2,
    } as React.CSSProperties,
    heroSubtitle: {
        fontSize: 14,
        color: 'rgba(148, 163, 184, 0.9)',
        margin: 0,
        maxWidth: 520,
        lineHeight: 1.5,
    } as React.CSSProperties,
    heroActions: {
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        marginTop: 16,
    } as React.CSSProperties,

    // Stat cards
    statsGrid: {
        display: 'grid',
        gridTemplateColumns: 'repeat(4, 1fr)',
        gap: 16,
        marginBottom: 24,
        marginTop: -40,
        position: 'relative' as const,
        zIndex: 5,
        padding: '0 12px',
    } as React.CSSProperties,
    statCard: {
        background: '#ffffff',
        borderRadius: 14,
        padding: '20px 22px',
        boxShadow: '0 2px 12px rgba(0,0,0,0.06), 0 1px 3px rgba(0,0,0,0.04)',
        border: '1px solid #f1f5f9',
        position: 'relative' as const,
        overflow: 'hidden',
    } as React.CSSProperties,
    statLabel: {
        fontSize: 10,
        fontWeight: 700,
        color: '#94a3b8',
        textTransform: 'uppercase' as const,
        letterSpacing: 1,
        marginBottom: 8,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
    } as React.CSSProperties,
    statValue: {
        fontSize: 32,
        fontWeight: 900,
        color: '#0f172a',
        letterSpacing: -1,
        lineHeight: 1,
    } as React.CSSProperties,
    statSub: {
        fontSize: 12,
        marginTop: 6,
        fontWeight: 600,
    } as React.CSSProperties,
    statIcon: {
        width: 36,
        height: 36,
        borderRadius: 10,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: 16,
    } as React.CSSProperties,

    // Distribution cards
    distGrid: {
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 440px), 1fr))',
        gap: 20,
        marginBottom: 24,
    } as React.CSSProperties,
    distCard: {
        background: '#ffffff',
        borderRadius: 14,
        border: '1px solid #f1f5f9',
        boxShadow: '0 1px 6px rgba(0,0,0,0.04)',
        overflow: 'hidden',
    } as React.CSSProperties,
    distHeader: {
        padding: '18px 22px 0',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
    } as React.CSSProperties,
    distTitle: {
        fontSize: 16,
        fontWeight: 800,
        color: '#0f172a',
        margin: '0 0 4px',
    } as React.CSSProperties,
    distSub: {
        fontSize: 12,
        color: '#94a3b8',
        margin: 0,
    } as React.CSSProperties,
    distBadge: {
        background: '#f0fdf4',
        border: '1px solid #bbf7d0',
        borderRadius: 8,
        padding: '4px 10px',
        textAlign: 'center' as const,
    } as React.CSSProperties,
    distBadgeLabel: {
        fontSize: 9,
        fontWeight: 700,
        color: '#16a34a',
        textTransform: 'uppercase' as const,
        letterSpacing: 0.8,
    } as React.CSSProperties,
    distBadgeValue: {
        fontSize: 18,
        fontWeight: 900,
        color: '#16a34a',
    } as React.CSSProperties,

    // Section card
    sectionCard: {
        background: '#ffffff',
        borderRadius: 14,
        border: '1px solid #f1f5f9',
        boxShadow: '0 1px 6px rgba(0,0,0,0.04)',
        overflow: 'hidden',
        marginBottom: 24,
    } as React.CSSProperties,
    sectionHeader: {
        padding: '20px 24px',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        flexWrap: 'wrap' as const,
        gap: 12,
    } as React.CSSProperties,
    sectionTitle: {
        fontSize: 18,
        fontWeight: 800,
        color: '#0f172a',
        margin: 0,
        display: 'flex',
        alignItems: 'center',
        gap: 8,
    } as React.CSSProperties,
    sectionSub: {
        fontSize: 13,
        color: '#94a3b8',
        margin: '2px 0 0',
    } as React.CSSProperties,

    // Table
    table: {
        width: '100%',
        borderCollapse: 'collapse' as const,
        fontSize: 13,
    } as React.CSSProperties,
    th: {
        padding: '12px 18px',
        textAlign: 'left' as const,
        fontSize: 10,
        fontWeight: 700,
        color: '#94a3b8',
        textTransform: 'uppercase' as const,
        letterSpacing: 1,
        borderBottom: '1px solid #f1f5f9',
    } as React.CSSProperties,
    td: {
        padding: '14px 18px',
        borderBottom: '1px solid #f8fafc',
        color: '#334155',
    } as React.CSSProperties,

    // Legend dots
    legendDot: (color: string) => ({
        display: 'inline-block',
        width: 8,
        height: 8,
        borderRadius: '50%',
        background: color,
        marginRight: 5,
    }) as React.CSSProperties,

    // Status badges
    statusBadge: (bg: string, color: string) => ({
        display: 'inline-flex',
        padding: '3px 10px',
        borderRadius: 12,
        fontSize: 10,
        fontWeight: 800,
        letterSpacing: 0.6,
        textTransform: 'uppercase' as const,
        background: bg,
        color: color,
        border: `1px solid ${color}20`,
    }) as React.CSSProperties,
};

// ─── Custom Tooltip ──────────────────────────────────────────────────────────
function ChartTooltip({ active, payload, label, th }: any) {
    if (!active || !payload?.length) return null;
    const d = payload[0]?.payload;
    return (
        <div style={{
            background: '#fff', borderRadius: 10, padding: '10px 14px',
            boxShadow: '0 4px 20px rgba(0,0,0,0.12)', border: '1px solid #e2e8f0',
            minWidth: 120,
        }}>
            <div style={{ fontWeight: 800, color: '#0f172a', fontSize: 13, marginBottom: 4 }}>{label}</div>
            {payload.map((p: any, i: number) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#475569', marginTop: 2 }}>
                    <span style={{ ...styles.legendDot(p.color || p.fill), marginRight: 4 }} />
                    <span>{p.name || (th ? 'จำนวน' : 'Count')}:</span>
                    <span style={{ fontWeight: 800, color: '#0f172a' }}>{p.value}</span>
                </div>
            ))}
            {d?.total !== undefined && (
                <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 4, paddingTop: 4, borderTop: '1px solid #f1f5f9' }}>
                    {th ? 'ทั้งหมดในประเภท' : 'Category total'}: {d.total}
                </div>
            )}
        </div>
    );
}

// ─── Status Tooltip (for the by-status remaining chart) ──────────────────────
function StatusTooltip({ active, payload, label, th }: any) {
    if (!active || !payload?.length) return null;
    const d = payload[0]?.payload as SegmentDatum;
    if (!d) return null;
    return (
        <div style={{
            background: '#fff', borderRadius: 10, padding: '10px 14px',
            boxShadow: '0 4px 20px rgba(0,0,0,0.12)', border: '1px solid #e2e8f0', minWidth: 150,
        }}>
            <div style={{ fontWeight: 800, color: '#0f172a', fontSize: 13, marginBottom: 6 }}>{label}</div>
            {(['active', 'dnf', 'dq', 'other'] as StatusBucket[]).map(b => (
                d[b] > 0 ? (
                    <div key={b} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#475569', marginTop: 2 }}>
                        <span style={{ ...styles.legendDot(STATUS_META[b].color), marginRight: 4 }} />
                        <span style={{ flex: 1 }}>{th ? STATUS_META[b].th : STATUS_META[b].en}:</span>
                        <span style={{ fontWeight: 800, color: '#0f172a' }}>{d[b]}</span>
                    </div>
                ) : null
            ))}
            <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 6, paddingTop: 6, borderTop: '1px solid #f1f5f9', fontWeight: 700 }}>
                {th ? 'รวมเหลืออยู่' : 'Total remaining'}: {d.count}
            </div>
        </div>
    );
}

// ─── Which panel a monitor window is showing ─────────────────────────────────
export type MonitorPanel = 'passed' | 'current' | 'course';

export interface MonitorRequest {
    panel: MonitorPanel;
    cat: string;
    /**
     * Campaign to show. The monitor screen is public (a display should not have
     * to log in), and "featured campaign" is per-account — so the id travels in
     * the link instead of being looked up again on the other side.
     */
    campaignId?: string;
    /** Course panel only — which of its three views to open on. */
    view?: 'graph' | 'map' | '2d';
}

/** Opens a panel in its own window, sized for whatever monitor it lands on. */
function openMonitor(req: MonitorRequest) {
    const qs = new URLSearchParams({ panel: req.panel, cat: req.cat });
    if (req.campaignId) qs.set('campaign', req.campaignId);
    if (req.view) qs.set('view', req.view);
    window.open(`/monitor/general-chart?${qs.toString()}`, '_blank', 'noopener');
}

/** The little "send this panel to a monitor" button shown on each panel header. */
function MonitorButton({ th, onClick, label }: { th: boolean; onClick: () => void; label?: string }) {
    return (
        <button
            type="button"
            onClick={onClick}
            title={th ? 'เปิดกราฟนี้เต็มจอในหน้าต่างใหม่ (สำหรับจอมอนิเตอร์)' : 'Open this chart full-screen in a new window'}
            style={{
                display: 'inline-flex', alignItems: 'center', gap: 5,
                padding: '3px 9px', fontSize: 10, fontWeight: 800, letterSpacing: 0.3,
                borderRadius: 6, fontFamily: 'inherit', cursor: 'pointer',
                border: '1px solid #e2e8f0', background: '#fff', color: '#64748b',
                whiteSpace: 'nowrap',
            }}
        >
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                <path d="M8 3H5a2 2 0 0 0-2 2v3M16 3h3a2 2 0 0 1 2 2v3M8 21H5a2 2 0 0 1-2-2v-3M16 21h3a2 2 0 0 0 2-2v-3" />
            </svg>
            {label ?? (th ? 'ขึ้นจอ' : 'Monitor')}
        </button>
    );
}

// ─── Checkpoint bar charts ───────────────────────────────────────────────────
// Pulled out of the page body so the monitor window can render exactly the same
// chart at whatever height the screen gives it.

/** The cumulative chart only needs the count per checkpoint. */
interface PassedDatum { cpName: string; count: number; total: number }

function PassedThroughChart({ data, th, height }: { data: PassedDatum[]; th: boolean; height: number }) {
    const maxVal = data.length ? Math.max(...data.map(d => d.count), 1) : 1;
    const many = data.length > 6;
    return (
        <ResponsiveContainer width="100%" height={height}>
            <BarChart data={data} margin={{ top: 20, right: 16, left: 4, bottom: 5 }} barCategoryGap="25%">
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                <XAxis dataKey="cpName" tick={{ fill: '#94a3b8', fontSize: 10, fontWeight: 700 }} axisLine={{ stroke: '#e2e8f0' }} tickLine={false} interval={0} angle={many ? -35 : 0} textAnchor={many ? 'end' : 'middle'} height={many ? 50 : 30} />
                <YAxis domain={[0, Math.ceil(maxVal * 1.3) || 10]} tick={{ fill: '#cbd5e1', fontSize: 10 }} axisLine={false} tickLine={false} width={35} />
                <Tooltip content={<ChartTooltip th={th} />} cursor={{ fill: 'rgba(59,130,246,0.04)' }} />
                <Bar dataKey="count" name={th ? 'ผ่านเข้าจุด' : 'Passed Through'} radius={[4, 4, 0, 0]} maxBarSize={48} isAnimationActive={false}>
                    <LabelList dataKey="count" position="top" style={{ fill: '#475569', fontWeight: 800, fontSize: 11 }} />
                    {data.map((entry, idx) => {
                        const isFinish = entry.cpName.toLowerCase() === 'finish';
                        if (entry.count === 0) return <Cell key={idx} fill="#e2e8f0" />;
                        if (isFinish) return <Cell key={idx} fill="#22c55e" />;
                        return <Cell key={idx} fill="#60a5fa" />;
                    })}
                </Bar>
            </BarChart>
        </ResponsiveContainer>
    );
}

function CurrentlyAtChart({ data, th, height, onPick }: {
    data: SegmentDatum[];
    th: boolean;
    height: number;
    onPick: (seg: SegmentDatum) => void;
}) {
    const maxVal = data.length ? Math.max(...data.map(d => d.count), 1) : 1;
    const many = data.length > 6;
    return (
        <ResponsiveContainer width="100%" height={height}>
            <BarChart data={data} margin={{ top: 20, right: 16, left: 4, bottom: 5 }} barCategoryGap="25%">
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                <XAxis dataKey="cpName" tick={{ fill: '#94a3b8', fontSize: 10, fontWeight: 700 }} axisLine={{ stroke: '#e2e8f0' }} tickLine={false} interval={0} angle={many ? -35 : 0} textAnchor={many ? 'end' : 'middle'} height={many ? 50 : 30} />
                <YAxis domain={[0, Math.ceil(maxVal * 1.3) || 10]} tick={{ fill: '#cbd5e1', fontSize: 10 }} axisLine={false} tickLine={false} width={35} />
                <Tooltip content={<StatusTooltip th={th} />} cursor={{ fill: 'rgba(59,130,246,0.04)' }} />
                {(['active', 'dnf', 'dq', 'other'] as StatusBucket[]).map((b, bi) => (
                    <Bar
                        key={b}
                        dataKey={b}
                        name={th ? STATUS_META[b].th : STATUS_META[b].en}
                        stackId="status"
                        fill={STATUS_META[b].color}
                        radius={bi === 3 ? [4, 4, 0, 0] : [0, 0, 0, 0]}
                        maxBarSize={48}
                        cursor="pointer"
                        isAnimationActive={false}
                        onClick={(d: any) => {
                            const seg = d?.payload as SegmentDatum;
                            if (seg && seg.count > 0) onPick(seg);
                        }}
                    >
                        {/* Total label sits on whichever segment is the top-most
                            non-zero one, so it always renders on a visible bar. */}
                        <LabelList content={(props: any) => {
                            const seg = data[props.index] as SegmentDatum | undefined;
                            if (!seg || seg.count <= 0 || topBucketOf(seg) !== b) return null;
                            return (
                                <text x={props.x + props.width / 2} y={props.y - 6} textAnchor="middle" fill="#475569" fontWeight={800} fontSize={11}>
                                    {seg.count}
                                </text>
                            );
                        }} />
                    </Bar>
                ))}
            </BarChart>
        </ResponsiveContainer>
    );
}

/** Status colour key shown above the "currently at" chart. */
function StatusLegend({ th }: { th: boolean }) {
    return (
        <span style={{ display: 'flex', gap: 10, fontSize: 10, fontWeight: 700, color: '#64748b', flexWrap: 'wrap' }}>
            {(['active', 'dnf', 'dq', 'other'] as StatusBucket[]).map(b => (
                <span key={b} style={{ display: 'inline-flex', alignItems: 'center' }}>
                    <span style={styles.legendDot(STATUS_META[b].color)} />{th ? STATUS_META[b].th.split(' ')[0] : STATUS_META[b].en}
                </span>
            ))}
        </span>
    );
}

// ─── Course density curve ────────────────────────────────────────────────────
// A smooth area chart: X = the route (each checkpoint stretch), Y = how many
// runners are currently on that stretch. Lets ops see at a glance where the pack
// is densest along the course. Click a point to see who is on that stretch.
function CourseStrip({ cat, data, th, route, onPick, legMedianMs, initial, chartHeight, onOpenMonitor }: {
    cat: string;
    data: SegmentDatum[];
    th: boolean;
    /** GPX line for this category, if the organiser uploaded one. */
    route?: RouteTrack;
    /** Median time the field took on each leg, index-aligned with `data`. */
    legMedianMs?: (number | null)[];
    onPick: (cpName: string, runners: SegmentRunner[]) => void;
    /** View to open on — a monitor window inherits what the admin was looking at. */
    initial?: { view?: 'graph' | 'map' | '2d' };
    /** Fixed drawing height; defaults to the sizes used inside the admin page. */
    chartHeight?: number;
    onOpenMonitor?: (state: { view: 'graph' | 'map' | '2d' }) => void;
}) {
    const [view, setView] = useState<'graph' | 'map' | '2d'>(initial?.view ?? 'graph');
    // 2D view: show the leading three of each gender, or the whole field cut into
    // equal-sized groups (the admin picks the size).

    // Segments = the stretch AFTER each checkpoint (last node has no outgoing stretch),
    // so the curve spans only the parts of the course runners can still be on.
    const segments = data.slice(0, -1).map((s, i) => ({
        ...s,
        // "CP1 → CP2" reads as the stretch between two points
        segLabel: data[i + 1] ? `${s.cpName} → ${data[i + 1].cpName}` : s.cpName,
    }));

    const hasRoute = !!route && Array.isArray(route.coords) && route.coords.length > 1;
    // Fall back to the graph if the GPX for this category is later removed.
    const activeView = (view === 'map' || view === '2d') && hasRoute ? view : 'graph';

    // The estimate moves with the clock, so tick while the 2D view is open.
    // Once a second: at running speed that is a fraction of a pixel, which is
    // exactly what makes the figures creep rather than hop.
    const [now, setNow] = useState(() => Date.now());
    useEffect(() => {
        if (activeView !== '2d') return;
        setNow(Date.now());
        const id = setInterval(() => setNow(Date.now()), 1000);
        return () => clearInterval(id);
    }, [activeView]);

    // ── Where every runner currently is, in km along the uploaded line ──
    // A scan only says where someone *was*. From the last scan we work out how
    // long the leg ahead should take them — from the field's median for that leg,
    // adjusted by how they compare with it — and walk them along that timetable,
    // so a figure moves even at the start line where there is no leg behind them
    // to measure a speed from.
    const cpNames = data.map(d => d.cpName);
    const cpKm = hasRoute ? resolveCpKm(cpNames, route!.distanceKm, route!.checkpointMarks) : [];
    const effort = useMemo(
        () => (hasRoute ? buildEffortProfile(route!.coords) : null),
        // The track only changes when a new GPX is uploaded.
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [hasRoute, route?.coords],
    );

    const onCourse = hasRoute && effort
        ? data.flatMap((d, i) => d.runners
            .filter(r => r.bucket === 'active')
            .map(r => {
                const lastKm = cpKm[i] ?? 0;
                const nextKm = cpKm[i + 1];
                const atEnd = i === data.length - 1 || nextKm === undefined || r.status === 'finished';
                const legEffort = atEnd ? 0 : effortAtKm(effort, nextKm) - effortAtKm(effort, lastKm);
                const ownPrevLegMs = i > 0 && r.prevScanMs && r.lastScanMs
                    ? r.lastScanMs - r.prevScanMs
                    : undefined;
                const etaMs = atEnd ? 0 : estimateLegMs({
                    profile: effort,
                    legEffort,
                    fieldMedianMs: legMedianMs?.[i],
                    prevFieldMedianMs: i > 0 ? legMedianMs?.[i - 1] : null,
                    ownPrevLegMs,
                    ownPrevLegEffort: i > 0
                        ? effortAtKm(effort, lastKm) - effortAtKm(effort, cpKm[i - 1] ?? 0)
                        : undefined,
                });
                const moved = atEnd || !r.lastScanMs
                    ? { km: lastKm, progress: 0, etaMs: 0, remainingMs: 0, overdue: false }
                    : arriveByEta(effort, lastKm, nextKm, etaMs, now - r.lastScanMs);
                return {
                    ...r,
                    cpIndex: i,
                    cpName: d.cpName,
                    cpKm: lastKm,
                    nextCpName: data[i + 1]?.cpName,
                    km: moved.km,
                    progress: moved.progress,
                    etaMs: moved.etaMs,
                    remainingMs: moved.remainingMs,
                    overdue: moved.overdue,
                    moving: !atEnd && !!r.lastScanMs,
                    speed: moved.etaMs > 0 ? legEffort / (moved.etaMs / 3600000) : 0,
                    movingSinceMs: r.lastScanMs,
                };
            }))
            // A runner further along the leg is genuinely ahead of one who only
            // just left the same checkpoint, so rank on the estimate first.
            .sort((a, b) => (b.km - a.km)
                || (b.cpIndex - a.cpIndex)
                || ((a.elapsedMs ?? Infinity) - (b.elapsedMs ?? Infinity))
                || (a.bib || '').localeCompare(b.bib || '', undefined, { numeric: true }))
        : [];

    type OnCourseRunner = typeof onCourse[number];

    /** "ถึง A2 ในอีก 12:07" — the countdown driving where the figure stands. */
    const etaNote = (r: OnCourseRunner) => {
        if (!r.moving) return th ? 'อยู่ที่จุดสแกน' : 'at the scan point';
        if (r.overdue) {
            return th
                ? `เลยเวลาที่ควรถึง ${r.nextCpName} มา ${formatCountdown(-r.remainingMs)} — รอสแกน`
                : `${formatCountdown(-r.remainingMs)} overdue at ${r.nextCpName}`;
        }
        return th
            ? `ถึง ${r.nextCpName} ในอีก ${formatCountdown(r.remainingMs)} (${Math.round(r.progress * 100)}% ของช่วง)`
            : `${formatCountdown(r.remainingMs)} to ${r.nextCpName} (${Math.round(r.progress * 100)}% of the leg)`;
    };

    /**
     * Leaders get their own figure; everyone else is bundled into amber clumps.
     * A clump covers a stretch of course rather than a fixed head count, so the
     * marker answers "roughly how many are around here" — which is all a
     * position estimated between two checkpoints can honestly claim.
     */
    const CLUSTER_SPAN_RATIO = 0.03;   // of the course length
    const profileMarkers: ProfileMarker[] = (() => {
        if (!hasRoute) return [];
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
                    // The countdown to the next checkpoint, under the bib.
                    note: r.moving && !r.overdue ? `⏱ ${formatCountdown(r.remainingMs)}` : undefined,
                    moving: r.moving && !r.overdue,
                    tooltip: [
                        `${i + 1}. ${r.name}`,
                        `BIB ${r.bib} · ${g === 'M' ? (th ? 'ชาย' : 'Male') : (th ? 'หญิง' : 'Female')}`,
                        `${th ? 'ประมาณ' : 'approx.'} ${r.km.toFixed(2)} ${th ? 'กม.' : 'km'} (${r.cpName}${r.nextCpName ? ` → ${r.nextCpName}` : ''})`,
                        etaNote(r),
                    ].join('\n'),
                    onClick: () => onPick(r.cpName, data[r.cpIndex]?.runners || []),
                });
            });
        }

        // Sweep the rest of the field along the course, closing a clump as soon
        // as the next runner is more than a clump's width further on.
        const rest = onCourse.filter(r => !named.has(r.bib)).slice().sort((a, b) => a.km - b.km);
        const span = Math.max(0.2, (route?.distanceKm || 0) * CLUSTER_SPAN_RATIO);
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
            const soon = chunk.filter(r => r.moving && !r.overdue).map(r => r.remainingMs);
            const cpNamesHere = Array.from(new Set(chunk.map(r => r.cpName)));
            out.push({
                key: `c${chunk[0].bib}-${chunk.length}`,
                km: avgKm,
                tone: 'GROUP',
                label: `≈${chunk.length} ${th ? 'คน' : ''}`.trim(),
                note: soon.length ? `⏱ ${formatCountdown(Math.min(...soon))}` : undefined,
                moving: chunk.some(r => r.moving && !r.overdue),
                cluster: true,
                tooltip: [
                    `${th ? 'ประมาณ' : 'about'} ${chunk.length} ${th ? 'คนอยู่ช่วงนี้' : 'runners here'}`,
                    `♂ ${males} / ♀ ${females}`,
                    hi - lo < 0.05
                        ? `${avgKm.toFixed(1)} ${th ? 'กม.' : 'km'}`
                        : `${lo.toFixed(1)}–${hi.toFixed(1)} ${th ? 'กม.' : 'km'}`,
                    `${th ? 'ออกจาก' : 'left'} ${cpNamesHere.join(' / ')}`,
                    soon.length
                        ? `${th ? 'คนแรกถึงจุดหน้าในอีก' : 'first due in'} ${formatCountdown(Math.min(...soon))}`
                        : (th ? 'อยู่ที่จุดสแกน' : 'at the scan point'),
                ].join('\n'),
                onClick: () => onPick(
                    chunk[0].cpName,
                    chunk.map(({ bib, name, status, gender, bucket }) => ({ bib, name, status, gender, bucket })),
                ),
            });
        };
        for (const r of rest) {
            if (group.length && r.km - group[0].km > span) flush();
            group.push(r);
        }
        flush();
        return out;
    })();

    if (!data.length || segments.length === 0) return null;
    const totalOnCourse = segments.reduce((sum, s) => sum + s.count, 0);
    const peak = segments.reduce((m, s) => (s.count > m.count ? s : m), segments[0]);
    const maxVal = Math.max(...segments.map(s => s.count), 1);
    const many = segments.length > 6;
    const gid = `courseGrad-${cat.replace(/[^a-zA-Z0-9]/g, '')}`;

    const toggleBtn = (mode: 'map' | 'graph' | '2d', label: string, disabled = false) => (
        <button
            type="button"
            disabled={disabled}
            onClick={() => setView(mode)}
            title={disabled ? (th ? 'ยังไม่ได้อัปโหลดไฟล์ GPX ของระยะนี้ (ตั้งค่าที่หน้าแก้ไขกิจกรรม)' : 'No GPX uploaded for this category') : undefined}
            style={{
                padding: '5px 14px', fontSize: 11, fontWeight: 800, letterSpacing: 0.5,
                borderRadius: 7, fontFamily: 'inherit', textTransform: 'uppercase',
                cursor: disabled ? 'not-allowed' : 'pointer',
                border: `1px solid ${activeView === mode ? '#7c3aed' : '#e2e8f0'}`,
                background: activeView === mode ? '#7c3aed' : '#fff',
                color: disabled ? '#cbd5e1' : activeView === mode ? '#fff' : '#64748b',
                opacity: disabled ? 0.6 : 1,
                transition: 'all 0.15s',
            }}
        >
            {label}
        </button>
    );

    return (
        <div style={{ borderTop: '1px solid #f1f5f9', padding: '16px 12px 18px 4px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6, flexWrap: 'wrap', gap: 8, paddingLeft: 12 }}>
                <div>
                    <div style={{ fontSize: 12, fontWeight: 800, color: '#0f172a', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                        🗺️ {th ? 'ความหนาแน่นนักวิ่งบนเส้นทาง' : 'Runner density along the course'}
                    </div>
                    <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>
                        {th ? 'จำลองว่านักวิ่งกระจุกอยู่ช่วงไหนของเส้นทาง' : 'Where runners are currently bunched up along the route'}
                    </div>
                </div>
                <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                    <div style={{ display: 'flex', gap: 6 }}>
                        {toggleBtn('2d', '2D', !hasRoute)}
                        {toggleBtn('map', 'Map', !hasRoute)}
                        {toggleBtn('graph', th ? 'กราฟ' : 'Graph')}
                    </div>
                    {onOpenMonitor && (
                        <MonitorButton th={th} onClick={() => onOpenMonitor({ view: activeView })} />
                    )}
                    <div style={{ textAlign: 'right' }}>
                        <div style={{ fontSize: 9, color: '#94a3b8', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5 }}>{th ? 'บนเส้นทาง' : 'On course'}</div>
                        <div style={{ fontSize: 16, fontWeight: 900, color: '#7c3aed' }}>{totalOnCourse}</div>
                    </div>
                    {peak.count > 0 && (
                        <div style={{ textAlign: 'right', borderLeft: '1px solid #eef2f7', paddingLeft: 10 }}>
                            <div style={{ fontSize: 9, color: '#94a3b8', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5 }}>{th ? 'หนาแน่นสุด' : 'Peak'}</div>
                            <div style={{ fontSize: 12, fontWeight: 800, color: '#f59e0b' }}>{peak.cpName} · {peak.count}</div>
                        </div>
                    )}
                </div>
            </div>

            {activeView === '2d' && route ? (
                <div style={{ padding: '0 8px 0 12px' }}>
                    {/* One picture: the six leaders by name, the rest as clumps */}
                    <div style={{ display: 'flex', gap: 14, alignItems: 'center', flexWrap: 'wrap', marginBottom: 8, fontSize: 10.5, color: '#64748b', fontWeight: 700 }}>
                        <span><span style={{ ...styles.legendDot('#3b82f6') }} />{th ? 'ผู้นำชาย 1-2-3' : 'Top 3 male'}</span>
                        <span><span style={{ ...styles.legendDot('#ec4899') }} />{th ? 'ผู้นำหญิง 1-2-3' : 'Top 3 female'}</span>
                        <span><span style={{ ...styles.legendDot('#f59e0b') }} />{th ? 'กลุ่มนักวิ่ง (≈ จำนวนคนในช่วงนั้น)' : 'Runner clumps (≈ head count)'}</span>
                    </div>

                    <ElevationProfile2D
                        coords={route.coords}
                        distanceKm={route.distanceKm}
                        checkpoints={cpNames.map((name, i) => ({ name, km: cpKm[i] ?? 0 }))}
                        markers={profileMarkers}
                        th={th}
                        height={chartHeight ?? 360}
                    />

                    <div style={{ display: 'flex', gap: 18, justifyContent: 'center', flexWrap: 'wrap', fontSize: 10.5, color: '#94a3b8', marginTop: 8 }}>
                        <span>{th ? 'ระยะทาง' : 'Distance'}: <b style={{ color: '#475569' }}>{route.distanceKm.toFixed(2)} {th ? 'กม.' : 'km'}</b></span>
                        {!!route.elevationGainM && (
                            <span>{th ? 'สะสมขึ้น' : 'Elevation gain'}: <b style={{ color: '#475569' }}>▲ {route.elevationGainM.toLocaleString()} m</b></span>
                        )}
                        {(() => {
                            const ele = elevationRange(route.coords);
                            return ele ? (
                                <span>{th ? 'ความสูง' : 'Elevation'}: <b style={{ color: '#475569' }}>{Math.round(ele.min)} – {Math.round(ele.max)} m</b></span>
                            ) : null;
                        })()}
                        <span>{th ? 'อยู่บนเส้นทาง' : 'On course'}: <b style={{ color: '#475569' }}>{onCourse.length}</b></span>
                    </div>

                    <div style={{ fontSize: 10, color: '#94a3b8', marginTop: 6, textAlign: 'center' }}>
                        {th
                            ? '💡 ตุ๊กตาน้ำเงิน/ชมพู = ผู้นำ 3 คนแรกของแต่ละเพศ (มีเลข BIB) · ตุ๊กตาเหลือง = กลุ่มนักวิ่งที่เหลือ ป้ายบอกจำนวนคนโดยประมาณในช่วงนั้น · คลิกเพื่อดูรายชื่อ'
                            : '💡 Blue/pink figures are the three leaders of each gender (with bib) · amber figures are the rest of the field, badged with roughly how many are in that stretch · click for names'}
                        <div style={{ marginTop: 3 }}>
                            {th
                                ? '🚶 ตำแหน่งเป็นค่าประมาณ — คำนวณต่อจากจุดสแกนล่าสุดด้วยความเร็วช่วงที่เพิ่งวิ่งมา (คิดความชันด้วย: ขึ้นเขา 100 ม. ≈ วิ่งเพิ่ม 1 กม.) ตุ๊กตาจะค่อยๆ ขยับไปจุดถัดไปเอง และหยุดรอที่จุดนั้นถ้ายังไม่มีการสแกน'
                                : '🚶 Positions are estimates — carried forward from the last scan at the speed of the leg just run, with climb counted (100 m of ascent ≈ 1 extra km). Figures creep toward the next checkpoint and wait there until it scans.'}
                        </div>
                        {!elevationRange(route.coords) && (
                            <div style={{ marginTop: 3, color: '#f59e0b' }}>
                                {/* A recorded climb with no per-point elevation means the file
                                    had one but the route was saved before elevation was stored. */}
                                {route.elevationGainM
                                    ? (th
                                        ? `⚠️ ไฟล์ GPX นี้มีข้อมูลความสูง (สะสมขึ้น ${route.elevationGainM.toLocaleString()} m) แต่เส้นทางถูกบันทึกไว้ก่อนระบบจะเก็บความสูงรายจุด — อัปโหลดไฟล์เดิมซ้ำอีกครั้งที่หน้าแก้ไขกิจกรรม แล้วเส้นความสูงจะขึ้นทันที`
                                        : `⚠️ This GPX does carry elevation (${route.elevationGainM.toLocaleString()} m of climb) but the route was saved before per-point elevation was stored — re-upload the same file on the event edit page.`)
                                    : (th
                                        ? '⚠️ ไฟล์ GPX นี้ไม่มีข้อมูลความสูงเลย (ไม่มีแท็ก <ele>) — กราฟจึงแสดงเป็นเส้นแบน'
                                        : '⚠️ This GPX carries no elevation at all (no <ele> tags), so the profile stays flat.')}
                            </div>
                        )}
                    </div>
                </div>
            ) : activeView === 'map' && route ? (
                <div style={{ padding: '0 8px 0 12px' }}>
                    <RouteDensityMap
                        coords={route.coords}
                        distanceKm={route.distanceKm}
                        cpNames={data.map(d => d.cpName)}
                        segments={segments.map((s, i) => ({
                            from: s.cpName,
                            to: data[i + 1]?.cpName || s.cpName,
                            count: s.count,
                        }))}
                        checkpointMarks={route.checkpointMarks}
                        th={th}
                        height={chartHeight ?? 400}
                        onPickSegment={(i) => {
                            const seg = segments[i];
                            if (seg && seg.count > 0) onPick(seg.cpName, seg.runners);
                        }}
                    />
                    <div style={{ fontSize: 10, color: '#94a3b8', marginTop: 8, textAlign: 'center' }}>
                        {th
                            ? `💡 สีบนเส้นทาง = ความหนาแน่นนักวิ่ง · คลิกที่เส้นเพื่อดูรายชื่อ · ระยะรวม ${route.distanceKm.toFixed(1)} กม.`
                            : `💡 Line colour = runner density · click a stretch for names · total ${route.distanceKm.toFixed(1)} km`}
                    </div>
                </div>
            ) : (
            <>
            <ResponsiveContainer width="100%" height={chartHeight ?? 230}>
                <AreaChart
                    data={segments}
                    margin={{ top: 24, right: 20, left: 0, bottom: many ? 28 : 5 }}
                    onClick={(e: any) => {
                        const p = e?.activePayload?.[0]?.payload as SegmentDatum | undefined;
                        if (p && p.count > 0) onPick(p.cpName, p.runners);
                    }}
                >
                    <defs>
                        <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="#8b5cf6" stopOpacity={0.38} />
                            <stop offset="100%" stopColor="#8b5cf6" stopOpacity={0.02} />
                        </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                    <XAxis
                        dataKey="cpName"
                        tick={{ fill: '#64748b', fontSize: 10, fontWeight: 700 }}
                        axisLine={{ stroke: '#e2e8f0' }}
                        tickLine={false}
                        interval={0}
                        angle={many ? -30 : 0}
                        textAnchor={many ? 'end' : 'middle'}
                        height={many ? 50 : 24}
                    />
                    <YAxis
                        allowDecimals={false}
                        domain={[0, Math.ceil(maxVal * 1.25) || 5]}
                        tick={{ fill: '#94a3b8', fontSize: 10 }}
                        axisLine={false}
                        tickLine={false}
                        width={40}
                    />
                    <Tooltip content={<StatusTooltip th={th} />} cursor={{ stroke: '#c4b5fd', strokeWidth: 1.5 }} />
                    <Area
                        type="monotone"
                        dataKey="count"
                        name={th ? 'อยู่บนเส้นทาง' : 'On course'}
                        stroke="#7c3aed"
                        strokeWidth={3}
                        fill={`url(#${gid})`}
                        dot={{ r: 4, fill: '#7c3aed', strokeWidth: 2, stroke: '#fff', cursor: 'pointer' }}
                        activeDot={{ r: 6, fill: '#7c3aed', strokeWidth: 2, stroke: '#fff', cursor: 'pointer' }}
                        isAnimationActive={false}
                    >
                        <LabelList dataKey="count" position="top" style={{ fill: '#7c3aed', fontWeight: 800, fontSize: 11 }} formatter={(v: any) => v > 0 ? v : ''} />
                    </Area>
                </AreaChart>
            </ResponsiveContainer>

            <div style={{ fontSize: 10, color: '#94a3b8', marginTop: 8, textAlign: 'center' }}>
                {th
                    ? '💡 แกนล่าง = ช่วงเส้นทาง (จากจุดนั้นไปจุดถัดไป) · แกนซ้าย = จำนวนคนที่อยู่ในช่วงนั้น · คลิกที่จุดเพื่อดูรายชื่อ'
                    : '💡 X = course stretch (from each point onward) · Y = runners on that stretch · click a point for names'}
                {!hasRoute && (
                    <div style={{ marginTop: 3, color: '#cbd5e1' }}>
                        {th
                            ? 'อยากดูแบบแผนที่จริง? อัปโหลดไฟล์ GPX ของระยะนี้ที่หน้าแก้ไขกิจกรรม'
                            : 'Want the real map view? Upload this category\'s GPX on the event edit page.'}
                    </div>
                )}
            </div>
            </>
            )}
        </div>
    );
}

// ─── Age Group Status Label ──────────────────────────────────────────────────
function getAgeGroupStatus(count: number, avgCount: number): { label: string; bg: string; color: string } {
    const ratio = avgCount > 0 ? count / avgCount : 0;
    if (ratio > 1.5) return { label: 'HIGH VOLUME', bg: '#dbeafe', color: '#1d4ed8' };
    if (ratio > 1.1) return { label: 'ELITE FOCUS', bg: '#fce7f3', color: '#be185d' };
    if (ratio > 0.7) return { label: 'STABLE', bg: '#f1f5f9', color: '#475569' };
    return { label: 'GROWTH', bg: '#ecfdf5', color: '#059669' };
}

function formatTimeMs(ms?: number): string {
    if (!ms || ms <= 0) return '-';
    const h = Math.floor(ms / 3600000);
    const m = Math.floor((ms % 3600000) / 60000);
    const s = Math.floor((ms % 60000) / 1000);
    return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

function formatPace(ms?: number, distKm?: number): string {
    if (!ms || ms <= 0 || !distKm || distKm <= 0) return '-';
    const totalMin = ms / 60000;
    const paceMin = totalMin / distKm;
    const min = Math.floor(paceMin);
    const sec = Math.round((paceMin - min) * 60);
    return `${min}'${sec.toString().padStart(2, '0')}" /km`;
}

function formatCount(n: number): string {
    if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
    return n.toString();
}

// ─── Status buckets for "remaining at checkpoint" colour-coding ────────────────
// Runners sitting between a checkpoint and the next one are split by their status
// so operations can tell who is genuinely still on course vs already DNF / DQ.
type StatusBucket = 'active' | 'dnf' | 'dq' | 'other';
const STATUS_META: Record<StatusBucket, { th: string; en: string; color: string }> = {
    active: { th: 'ยังอยู่ในเส้นทาง', en: 'On course', color: '#22c55e' },
    dnf: { th: 'DNF (ไม่จบ)', en: 'DNF', color: '#f59e0b' },
    dq: { th: 'DQ (ตัดสิทธิ์)', en: 'DQ', color: '#ef4444' },
    other: { th: 'อื่นๆ (DNS ฯลฯ)', en: 'Other', color: '#94a3b8' },
};
function statusBucketOf(status: string): StatusBucket {
    const s = (status || '').toLowerCase();
    if (s === 'dnf') return 'dnf';
    if (s === 'dq') return 'dq';
    if (s === 'dns') return 'other';
    // in_progress / not_started / finished / blank → still counts as "on course"
    return 'active';
}
// The visually top-most non-zero segment of a stacked bar (bottom→top order),
// so the total label can sit on a bar that actually gets rendered.
function topBucketOf(d: { active: number; dnf: number; dq: number; other: number }): StatusBucket | null {
    const order: StatusBucket[] = ['active', 'dnf', 'dq', 'other'];
    let top: StatusBucket | null = null;
    for (const b of order) if (d[b] > 0) top = b;
    return top;
}

interface SegmentRunner {
    bib: string;
    name: string;
    status: string;
    gender: string;
    bucket: StatusBucket;
    /** Time on course at the last scan, used to order runners on the same stretch. */
    elapsedMs?: number;
    /** Epoch ms of the scan at the checkpoint they are standing on. */
    lastScanMs?: number;
    /** Epoch ms of the scan at the checkpoint before it, when they passed one. */
    prevScanMs?: number;
}
interface SegmentDatum {
    cpName: string;
    count: number;
    total: number;
    active: number;
    dnf: number;
    dq: number;
    other: number;
    runners: SegmentRunner[];
    distance?: string;
}

// ─── Monitor screen ──────────────────────────────────────────────────────────

/** Viewport size, so the chart can fill whatever screen it is thrown onto. */
function useViewport() {
    const [size, setSize] = useState({ w: 1280, h: 720 });
    useLayoutEffect(() => {
        const measure = () => setSize({ w: window.innerWidth, h: window.innerHeight });
        measure();
        window.addEventListener('resize', measure);
        return () => window.removeEventListener('resize', measure);
    }, []);
    return size;
}

/**
 * A single panel filling the screen, for a display next to the finish line.
 * Everything it needs comes from the parent, which is already polling; this only
 * decides how big to draw and keeps a clock on screen.
 */
function MonitorScreen({ req, th, campaign, loading, current, passed, route, legMedianMs, lastRefresh }: {
    req: MonitorRequest;
    th: boolean;
    campaign: Campaign | null;
    loading: boolean;
    current: SegmentDatum[];
    passed: PassedDatum[];
    route?: RouteTrack;
    legMedianMs?: (number | null)[];
    lastRefresh: Date | null;
}) {
    const { w, h } = useViewport();
    const [clock, setClock] = useState('');
    useEffect(() => {
        const tick = () => setClock(new Date().toLocaleTimeString(th ? 'th-TH' : 'en-GB', { hour12: false }));
        tick();
        const id = setInterval(tick, 1000);
        return () => clearInterval(id);
    }, [th]);

    const HEADER = 74;
    const FOOTER = 34;
    const chartHeight = Math.max(220, h - HEADER - FOOTER - 24);

    const title = req.panel === 'passed'
        ? (th ? '📊 ผ่านจุดนี้แล้ว (สะสม)' : '📊 Passed Through (Cumulative)')
        : req.panel === 'current'
            ? (th ? '📌 เหลืออยู่ที่จุดนี้ (แยกสถานะ)' : '📌 Currently At (by status)')
            : (th ? '🗺️ ความหนาแน่นนักวิ่งบนเส้นทาง' : '🗺️ Runner density along the course');

    const toggleFullscreen = () => {
        if (document.fullscreenElement) document.exitFullscreen().catch(() => { });
        else document.documentElement.requestFullscreen().catch(() => { });
    };

    return (
        <div style={{
            minHeight: '100vh', background: '#fff', fontFamily: "'Inter', 'Segoe UI', sans-serif",
            display: 'flex', flexDirection: 'column',
        }}>
            <style>{`@keyframes pulse{0%,100%{opacity:1}50%{opacity:.3}}`}</style>
            <div style={{
                height: HEADER, flexShrink: 0, display: 'flex', alignItems: 'center', gap: 16,
                padding: '0 24px', borderBottom: '1px solid #f1f5f9', background: '#fcfcfd',
            }}>
                <div style={{
                    background: '#7c3aed', color: '#fff', fontWeight: 900, fontSize: 20,
                    padding: '6px 16px', borderRadius: 10, letterSpacing: 0.5,
                }}>{req.cat}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 20, fontWeight: 900, color: '#0f172a', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {title}
                    </div>
                    <div style={{ fontSize: 12, color: '#94a3b8', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {campaign?.name || (loading ? (th ? 'กำลังโหลด...' : 'Loading...') : (th ? 'ไม่พบกิจกรรม' : 'No campaign'))}
                    </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11, fontWeight: 800, color: '#22c55e' }}>
                    <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#22c55e', animation: 'pulse 2s infinite' }} />
                    LIVE
                </div>
                <div style={{ fontSize: 26, fontWeight: 900, color: '#0f172a', fontVariantNumeric: 'tabular-nums' }}>{clock}</div>
                <button
                    type="button"
                    onClick={toggleFullscreen}
                    title={th ? 'เต็มจอ' : 'Fullscreen'}
                    style={{
                        border: '1px solid #e2e8f0', background: '#fff', color: '#64748b', borderRadius: 8,
                        padding: '7px 9px', cursor: 'pointer', display: 'inline-flex', fontFamily: 'inherit',
                    }}
                >
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                        <path d="M8 3H5a2 2 0 0 0-2 2v3M16 3h3a2 2 0 0 1 2 2v3M8 21H5a2 2 0 0 1-2-2v-3M16 21h3a2 2 0 0 0 2-2v-3" />
                    </svg>
                </button>
            </div>

            <div style={{ flex: 1, padding: '12px 20px 0' }}>
                {!campaign && !loading ? (
                    <div style={{ padding: 60, textAlign: 'center', color: '#94a3b8' }}>
                        {th ? 'ไม่พบกิจกรรม' : 'No campaign found'}
                    </div>
                ) : req.panel === 'passed' ? (
                    <PassedThroughChart data={passed} th={th} height={chartHeight} />
                ) : req.panel === 'current' ? (
                    <>
                        <div style={{ display: 'flex', justifyContent: 'flex-end', paddingRight: 12 }}>
                            <StatusLegend th={th} />
                        </div>
                        <CurrentlyAtChart data={current} th={th} height={chartHeight - 20} onPick={() => { }} />
                    </>
                ) : (
                    <CourseStrip
                        cat={req.cat}
                        data={current}
                        th={th}
                        route={route}
                        legMedianMs={legMedianMs}
                        onPick={() => { }}
                        initial={{ view: req.view }}
                        // The strip draws its own header and hints above the chart.
                        chartHeight={Math.max(220, chartHeight - 120)}
                    />
                )}
            </div>

            <div style={{
                height: FOOTER, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
                gap: 14, fontSize: 11, color: '#cbd5e1', borderTop: '1px solid #f8fafc',
            }}>
                <span>{th ? 'อัปเดตอัตโนมัติทุก 15 วินาที' : 'Auto-refreshes every 15s'}</span>
                {lastRefresh && <span>· {th ? 'ล่าสุด' : 'last'} {lastRefresh.toLocaleTimeString(th ? 'th-TH' : 'en-GB', { hour12: false })}</span>}
                <span>· {w}×{h}</span>
            </div>
        </div>
    );
}

// ─── Component ───────────────────────────────────────────────────────────────
/**
 * The statistics page. With `monitor` set it drops the admin chrome and renders
 * that one panel full-screen instead — that is what /monitor/general-chart mounts,
 * so a display screen shows exactly the same chart without logging in.
 */
export function GeneralChartView({ monitor }: { monitor?: MonitorRequest }) {
    const { language } = useLanguage();
    const th = language === 'th';

    const [campaign, setCampaign] = useState<Campaign | null>(null);
    const [loading, setLoading] = useState(true);
    const [checkpoints, setCheckpoints] = useState<Checkpoint[]>([]);
    /** GPX course lines keyed by race category — powers the MAP view. */
    const [routes, setRoutes] = useState<Record<string, RouteTrack>>({});
    const [runners, setRunners] = useState<Runner[]>([]);
    /** checkpoint name → bib → scan time (ms). The times drive the 2D dead reckoning. */
    const [cpTimingMap, setCpTimingMap] = useState<Record<string, Map<string, number>>>({});
    const [runnersLoading, setRunnersLoading] = useState(false);
    const [lastRefresh, setLastRefresh] = useState<Date | null>(null);
    const [autoRefresh, setAutoRefresh] = useState(true);
    const refreshRef = useRef<ReturnType<typeof setInterval> | null>(null);

    // Which checkpoint segment's runner list is open in the drill-down modal
    const [cpDetail, setCpDetail] = useState<{ cat: string; cpName: string; runners: SegmentRunner[] } | null>(null);

    // ── Load campaign ──
    // A monitor link carries its campaign id, because "featured" is per-account
    // and the monitor screen is not logged in as anybody.
    const wantedCampaignId = monitor?.campaignId;
    useEffect(() => {
        (async () => {
            try {
                const url = wantedCampaignId
                    ? `/api/campaigns/${wantedCampaignId}`
                    : '/api/campaigns/featured';
                const res = await fetch(url, { cache: 'no-store' });
                if (!res.ok) throw new Error();
                const data = await res.json();
                if (data?._id) setCampaign(data);
            } catch { setCampaign(null); }
            finally { setLoading(false); }
        })();
    }, [wantedCampaignId]);

    // ── Load checkpoints ──
    useEffect(() => {
        if (!campaign?._id) return;
        (async () => {
            try {
                const res = await fetch(`/api/checkpoints/campaign/${campaign._id}`, { cache: 'no-store' });
                if (!res.ok) return;
                const data: Checkpoint[] = await res.json();
                setCheckpoints([...data].sort((a, b) => (a.orderNum ?? 999) - (b.orderNum ?? 999)));
            } catch { setCheckpoints([]); }
        })();
    }, [campaign?._id]);

    // ── Per-category checkpoint order ──
    // Checkpoint.orderNum is one shared, campaign-wide sequence, but a trail
    // race's distances can visit the same checkpoints in a different order (or
    // skip some). CheckpointMapping.orderNum is recorded per Event — i.e. per
    // distance — so pull it in and prefer it over the shared order wherever a
    // category has one, the same way /admin/events/create backfills GPX marks.
    const [catCpOrder, setCatCpOrder] = useState<Record<string, string[]>>({});
    useEffect(() => {
        if (!campaign?._id) return;
        let cancelled = false;
        (async () => {
            try {
                const evRes = await fetch(`/api/events/by-campaign/${campaign._id}`, { cache: 'no-store' });
                if (!evRes.ok) return;
                const events: { _id: string; name?: string; distance?: number }[] = await evRes.json();
                if (!Array.isArray(events)) return;

                const perEvent = await Promise.all(events.map(async (ev) => {
                    try {
                        const res = await fetch(`/api/checkpoints/mapping/event/${ev._id}`, { cache: 'no-store' });
                        if (!res.ok) return null;
                        const maps: { orderNum?: number; checkpointId?: { name?: string } | string }[] = await res.json();
                        if (!Array.isArray(maps) || !maps.length) return null;
                        const list = maps
                            .map(m => ({
                                name: ((typeof m.checkpointId === 'object' && m.checkpointId ? m.checkpointId.name : '') || '').trim(),
                                order: m.orderNum ?? 999,
                            }))
                            .filter(m => m.name)
                            .sort((a, b) => a.order - b.order)
                            .map(m => m.name);
                        return list.length ? { ev, list } : null;
                    } catch { return null; }
                }));

                if (cancelled) return;
                const next: Record<string, string[]> = {};
                for (const entry of perEvent) {
                    if (!entry) continue;
                    const keys = [entry.ev.name, entry.ev.distance ? `${entry.ev.distance}K` : ''];
                    for (const k of keys) {
                        const key = normCat(k || '');
                        if (key && !next[key]) next[key] = entry.list;
                    }
                }
                setCatCpOrder(next);
            } catch { /* per-category order stays unavailable; campaign-wide order still works */ }
        })();
        return () => { cancelled = true; };
    }, [campaign?._id]);

    /** This category's checkpoints, in its own distance order when known. */
    const catCpsFor = useCallback((cat: string): Checkpoint[] => {
        const base = checkpoints.filter(cp => !cp.distanceMappings?.length || cp.distanceMappings.includes(cat));
        const order = catCpOrder[normCat(cat)];
        if (!order?.length) return base;
        const byName = new Map(base.map(cp => [cp.name, cp]));
        const ordered: Checkpoint[] = [];
        for (const name of order) {
            const cp = byName.get(name);
            if (cp) { ordered.push(cp); byName.delete(name); }
        }
        // Anything not covered by the mapping (e.g. a CP added since it was last
        // generated) still shows, appended in the shared campaign-wide order.
        for (const cp of base) if (byName.has(cp.name)) ordered.push(cp);
        return ordered;
    }, [checkpoints, catCpOrder]);

    // ── Load GPX course lines (one per category, optional) ──
    useEffect(() => {
        if (!campaign?._id) return;
        (async () => {
            try {
                const res = await fetch(`/api/routes?campaignId=${campaign._id}`, { cache: 'no-store' });
                if (!res.ok) return;
                const data = await res.json();
                if (!Array.isArray(data)) return;
                const byCat: Record<string, RouteTrack> = {};
                for (const r of data as RouteTrack[]) {
                    if (r?.category && Array.isArray(r.coords) && r.coords.length > 1) byCat[r.category] = r;
                }
                setRoutes(byCat);
            } catch { setRoutes({}); }
        })();
    }, [campaign?._id]);

    // ── Fetch all ──
    const fetchAll = useCallback(async (silent = false) => {
        if (!campaign?._id) return;
        if (!silent) setRunnersLoading(true);
        try {
            const rRes = await fetch(`/api/runners/passtime?id=${campaign._id}`, { cache: 'no-store' });
            let payload: any = {};
            try { payload = await rRes.json(); } catch { payload = {}; }
            let list: Runner[] = [];
            if (Array.isArray(payload)) list = payload;
            else if (Array.isArray(payload?.data?.data)) list = payload.data.data;
            else if (Array.isArray(payload?.data)) list = payload.data;
            setRunners(list);

            if (checkpoints.length > 0) {
                const cpResults = await Promise.all(
                    checkpoints.map(async (cp) => {
                        try {
                            const res = await fetch(`/api/timing/checkpoint-by-campaign/${campaign._id}?cp=${encodeURIComponent(cp.name)}`, { cache: 'no-store' });
                            const records: TimingRecord[] = await res.json();
                            // Keep the scan time, not just the bib: the 2D view needs to know
                            // how long ago someone left this checkpoint.
                            const bibs = new Map<string, number>();
                            for (const r of records) {
                                if (!r.bib || !r.scanTime) continue;
                                const t = new Date(r.scanTime).getTime();
                                if (!Number.isFinite(t)) continue;
                                // A checkpoint can be scanned twice (in/out) — the first
                                // scan is the arrival, which is what a position is based on.
                                const prev = bibs.get(r.bib);
                                if (prev === undefined || t < prev) bibs.set(r.bib, t);
                            }
                            return { cpName: cp.name, bibs };
                        } catch {
                            return { cpName: cp.name, bibs: new Map<string, number>() };
                        }
                    })
                );
                const m: Record<string, Map<string, number>> = {};
                for (const { cpName, bibs } of cpResults) m[cpName] = bibs;
                setCpTimingMap(m);
            }
            setLastRefresh(new Date());
        } catch (err) { console.error('Chart fetch error', err); }
        finally { if (!silent) setRunnersLoading(false); }
    }, [campaign?._id, checkpoints]);

    useEffect(() => { if (campaign?._id && checkpoints.length >= 0) fetchAll(false); }, [fetchAll]);

    useEffect(() => {
        if (refreshRef.current) clearInterval(refreshRef.current);
        if (autoRefresh && campaign?._id) refreshRef.current = setInterval(() => fetchAll(true), 15000);
        return () => { if (refreshRef.current) clearInterval(refreshRef.current); };
    }, [autoRefresh, fetchAll, campaign?._id]);

    // ── Categories ──
    const categories = useMemo(() => {
        const cats = new Set<string>();
        runners.forEach(r => { if (r.category) cats.add(r.category); });
        return Array.from(cats).sort();
    }, [runners]);

    // ── Summary stats ──
    const summary = useMemo(() => {
        const total = runners.length;
        const startBibs = cpTimingMap['START'] || cpTimingMap['Start'] || new Map<string, number>();
        const started = runners.filter(r => startBibs.has(r.bib) || r.status === 'in_progress' || r.status === 'finished').length;
        const finished = runners.filter(r => r.status === 'finished').length;
        const inProgress = runners.filter(r => r.status === 'in_progress').length;
        const dnf = runners.filter(r => r.status === 'dnf').length;
        const dns = runners.filter(r => r.status === 'dns').length;
        const dq = runners.filter(r => r.status === 'dq').length;
        const finishRate = total > 0 ? ((finished / total) * 100).toFixed(1) : '0.0';

        // Avg finish time
        const finishTimes = runners.filter(r => r.status === 'finished' && ((r.netTime && r.netTime > 0) || (r.gunTime && r.gunTime > 0))).map(r => r.netTime || r.gunTime || 0);
        const avgFinishTime = finishTimes.length > 0 ? finishTimes.reduce((a, b) => a + b, 0) / finishTimes.length : 0;

        // Best finish time
        const bestFinishTime = finishTimes.length > 0 ? Math.min(...finishTimes) : 0;

        const maleTotal = runners.filter(r => r.gender === 'M').length;
        const femaleTotal = runners.filter(r => r.gender === 'F').length;
        const maleFinished = runners.filter(r => r.gender === 'M' && r.status === 'finished').length;
        const femaleFinished = runners.filter(r => r.gender === 'F' && r.status === 'finished').length;

        return { total, started, finished, inProgress, dnf, dns, dq, finishRate, avgFinishTime, bestFinishTime, maleTotal, femaleTotal, maleFinished, femaleFinished };
    }, [runners, cpTimingMap]);

    // ── Chart data per category (with per-status breakdown + runner lists) ──
    const chartDataByCategory = useMemo(() => {
        const result: Record<string, SegmentDatum[]> = {};
        for (const cat of categories) {
            const catRunners = runners.filter(r => r.category === cat);
            const catCps = catCpsFor(cat);
            if (catCps.length === 0) continue;
            const data: SegmentDatum[] = [];
            for (let i = 0; i < catCps.length; i++) {
                const cp = catCps[i];
                const nextCp = i < catCps.length - 1 ? catCps[i + 1] : null;
                const cpBibs = cpTimingMap[cp.name] || new Map<string, number>();
                const catBibsAtCp = catRunners.filter(r => cpBibs.has(r.bib));
                let remaining: Runner[];
                if (cp.type === 'finish' || cp.name.toLowerCase() === 'finish') {
                    remaining = catBibsAtCp;
                } else if (nextCp) {
                    const nextBibs = cpTimingMap[nextCp.name] || new Map<string, number>();
                    remaining = catBibsAtCp.filter(r => !nextBibs.has(r.bib));
                } else {
                    remaining = catBibsAtCp;
                }
                const prevBibs = i > 0 ? cpTimingMap[catCps[i - 1].name] : undefined;
                const segRunners: SegmentRunner[] = remaining.map(r => ({
                    bib: r.bib,
                    name: `${r.firstName || ''} ${r.lastName || ''}`.trim() || r.bib,
                    status: r.status,
                    gender: r.gender,
                    bucket: statusBucketOf(r.status),
                    elapsedMs: r.elapsedTime || r.netTime || r.gunTime || undefined,
                    // The last two scans give the speed of the leg they just ran,
                    // which is what the 2D view carries forward.
                    lastScanMs: cpBibs.get(r.bib),
                    prevScanMs: prevBibs?.get(r.bib),
                })).sort((a, b) => (a.bib || '').localeCompare(b.bib || '', undefined, { numeric: true }));
                const by = (b: StatusBucket) => segRunners.filter(r => r.bucket === b).length;
                data.push({
                    cpName: cp.name,
                    count: segRunners.length,
                    total: catRunners.length,
                    active: by('active'),
                    dnf: by('dnf'),
                    dq: by('dq'),
                    other: by('other'),
                    runners: segRunners,
                    distance: (cp as any).distance || (cp as any).distanceKm || undefined,
                });
            }
            result[cat] = data;
        }
        return result;
    }, [categories, runners, catCpsFor, cpTimingMap]);

    // ── How long the field actually takes on each leg ──
    // The median of everyone who has already run a leg is the best available
    // guess for how long the runners still on it will need, so the 2D view uses
    // it to pace the figures between checkpoints.
    const legMediansByCategory = useMemo(() => {
        const result: Record<string, (number | null)[]> = {};
        for (const cat of categories) {
            const catRunners = runners.filter(r => r.category === cat);
            const catCps = catCpsFor(cat);
            const medians: (number | null)[] = [];
            for (let i = 0; i < catCps.length - 1; i++) {
                const a = cpTimingMap[catCps[i].name];
                const b = cpTimingMap[catCps[i + 1].name];
                const durations: number[] = [];
                if (a && b) {
                    for (const r of catRunners) {
                        const ta = a.get(r.bib);
                        const tb = b.get(r.bib);
                        if (ta && tb && tb > ta) durations.push(tb - ta);
                    }
                }
                durations.sort((x, y) => x - y);
                medians.push(durations.length ? durations[Math.floor(durations.length / 2)] : null);
            }
            result[cat] = medians;
        }
        return result;
    }, [categories, runners, catCpsFor, cpTimingMap]);

    // ── Per-category summary ──
    const catSummary = useMemo(() => {
        const result: Record<string, { total: number; started: number; finished: number; dns: number; dnf: number; dq: number; mF: number; fF: number }> = {};
        const startBibs = cpTimingMap['START'] || cpTimingMap['Start'] || new Map<string, number>();
        for (const cat of categories) {
            const cr = runners.filter(r => r.category === cat);
            result[cat] = {
                total: cr.length,
                started: cr.filter(r => startBibs.has(r.bib) || r.status === 'in_progress' || r.status === 'finished').length,
                finished: cr.filter(r => r.status === 'finished').length,
                dns: cr.filter(r => r.status === 'dns').length,
                dnf: cr.filter(r => r.status === 'dnf').length,
                dq: cr.filter(r => r.status === 'dq').length,
                mF: cr.filter(r => r.gender === 'M' && r.status === 'finished').length,
                fF: cr.filter(r => r.gender === 'F' && r.status === 'finished').length,
            };
        }
        return result;
    }, [categories, runners, cpTimingMap]);

    // ── Age group data ──
    const ageGroupData = useMemo(() => {
        const groups: Record<string, { registered: number; male: number; female: number; total: number; bestTime: number; times: number[] }> = {};
        runners.forEach(r => {
            const ag = r.ageGroup || 'N/A';
            if (!groups[ag]) groups[ag] = { registered: 0, male: 0, female: 0, total: 0, bestTime: Infinity, times: [] };
            groups[ag].registered++;
        });
        runners.filter(r => r.status === 'finished').forEach(r => {
            const ag = r.ageGroup || 'N/A';
            if (!groups[ag]) groups[ag] = { registered: 0, male: 0, female: 0, total: 0, bestTime: Infinity, times: [] };
            groups[ag].total++;
            if (r.gender === 'M') groups[ag].male++;
            else if (r.gender === 'F') groups[ag].female++;
            const t = r.netTime || r.gunTime || 0;
            if (t > 0) {
                groups[ag].times.push(t);
                if (t < groups[ag].bestTime) groups[ag].bestTime = t;
            }
        });

        const allGroups = Object.keys(groups).sort((a, b) => {
            const numA = parseInt(a); const numB = parseInt(b);
            if (!isNaN(numA) && !isNaN(numB)) return numA - numB;
            return a.localeCompare(b);
        });

        const avgFinished = allGroups.length > 0 ? allGroups.reduce((s, g) => s + groups[g].total, 0) / allGroups.length : 0;

        return allGroups.map(ag => ({
            ageGroup: ag,
            ...groups[ag],
            bestTime: groups[ag].bestTime === Infinity ? 0 : groups[ag].bestTime,
            avgTime: groups[ag].times.length > 0 ? groups[ag].times.reduce((a, b) => a + b, 0) / groups[ag].times.length : 0,
            status: getAgeGroupStatus(groups[ag].total, avgFinished),
        }));
    }, [runners]);

    const ageChartData = useMemo(() =>
        ageGroupData.filter(d => d.total > 0).map(d => ({
            ageGroup: d.ageGroup,
            male: d.male,
            female: d.female,
        })),
        [ageGroupData]
    );

    // ── Runner count by status (Starters / Finishers / DNF / DNS / DQ) ──
    const statusChartData = useMemo(() => {
        const startBibs = cpTimingMap['START'] || cpTimingMap['Start'] || new Map<string, number>();
        const starters = runners.filter(r => startBibs.has(r.bib) || r.status === 'in_progress' || r.status === 'finished' || r.status === 'dnf');
        const finishers = runners.filter(r => r.status === 'finished');
        const dnfRunners = runners.filter(r => r.status === 'dnf');
        const dnsRunners = runners.filter(r => r.status === 'dns');
        const dqRunners = runners.filter(r => r.status === 'dq');
        return [
            { name: th ? 'ปล่อยตัว' : 'Starters', male: starters.filter(r => r.gender === 'M').length, female: starters.filter(r => r.gender === 'F').length, total: starters.length },
            { name: th ? 'จบ' : 'Finishers', male: finishers.filter(r => r.gender === 'M').length, female: finishers.filter(r => r.gender === 'F').length, total: finishers.length },
            { name: 'DNF', male: dnfRunners.filter(r => r.gender === 'M').length, female: dnfRunners.filter(r => r.gender === 'F').length, total: dnfRunners.length },
            { name: 'DNS', male: dnsRunners.filter(r => r.gender === 'M').length, female: dnsRunners.filter(r => r.gender === 'F').length, total: dnsRunners.length },
            { name: 'DQ', male: dqRunners.filter(r => r.gender === 'M').length, female: dqRunners.filter(r => r.gender === 'F').length, total: dqRunners.length },
        ];
    }, [runners, cpTimingMap, th]);

    // ── Starters by age group ──
    const startersByAgeData = useMemo(() => {
        const startBibs = cpTimingMap['START'] || cpTimingMap['Start'] || new Map<string, number>();
        const starters = runners.filter(r => startBibs.has(r.bib) || r.status === 'in_progress' || r.status === 'finished' || r.status === 'dnf');
        const groups: Record<string, { male: number; female: number }> = {};
        starters.forEach(r => {
            const ag = r.ageGroup || 'N/A';
            if (!groups[ag]) groups[ag] = { male: 0, female: 0 };
            if (r.gender === 'M') groups[ag].male++;
            else if (r.gender === 'F') groups[ag].female++;
        });
        return Object.keys(groups).sort((a, b) => {
            const numA = parseInt(a); const numB = parseInt(b);
            if (!isNaN(numA) && !isNaN(numB)) return numA - numB;
            return a.localeCompare(b);
        }).map(ag => ({ ageGroup: ag, male: groups[ag].male, female: groups[ag].female, total: groups[ag].male + groups[ag].female }));
    }, [runners, cpTimingMap]);

    // ── Chart data per category — PASSED THROUGH (cumulative) ──
    const chartDataByCategoryPassedThrough = useMemo(() => {
        const result: Record<string, { cpName: string; count: number; total: number }[]> = {};
        for (const cat of categories) {
            const catRunners = runners.filter(r => r.category === cat);
            const catCps = catCpsFor(cat);
            if (catCps.length === 0) continue;
            const data: { cpName: string; count: number; total: number }[] = [];
            for (const cp of catCps) {
                const cpBibs = cpTimingMap[cp.name] || new Map<string, number>();
                const count = catRunners.filter(r => cpBibs.has(r.bib)).length;
                data.push({ cpName: cp.name, count, total: catRunners.length });
            }
            result[cat] = data;
        }
        return result;
    }, [categories, runners, catCpsFor, cpTimingMap]);

    // ── Monitor window: one panel, no chrome, sized to the screen ──
    if (monitor) {
        return (
            <MonitorScreen
                req={monitor}
                th={th}
                campaign={campaign}
                loading={loading}
                current={chartDataByCategory[monitor.cat] || []}
                passed={chartDataByCategoryPassedThrough[monitor.cat] || []}
                route={routes[monitor.cat]}
                legMedianMs={legMediansByCategory[monitor.cat]}
                lastRefresh={lastRefresh}
            />
        );
    }

    if (loading) {
        return (
            <AdminLayout breadcrumbItems={[{ label: 'General Chart', labelEn: 'General Chart' }]}>
                <div style={{ padding: 60, textAlign: 'center', color: '#94a3b8', fontSize: 14 }}>
                    {th ? 'กำลังโหลด...' : 'Loading...'}
                </div>
            </AdminLayout>
        );
    }

    if (!campaign) {
        return (
            <AdminLayout breadcrumbItems={[{ label: 'General Chart', labelEn: 'General Chart' }]}>
                <div style={{ padding: 60, textAlign: 'center', color: '#94a3b8' }}>
                    {th ? 'ไม่พบกิจกรรม' : 'No campaign found'}
                </div>
            </AdminLayout>
        );
    }

    return (
        <AdminLayout breadcrumbItems={[{ label: 'กราฟสถิติ', labelEn: 'General Chart' }]}>
            {/* Pulse animation */}
            <style>{`@keyframes pulse{0%,100%{opacity:1}50%{opacity:.3}}`}</style>

            <div style={styles.page}>

                {/* ─── Runner Count by Status ─── */}
                <div style={styles.distGrid} className="gc-dist-grid">
                    {/* Status Chart: Starters / Finishers / DNF / DNS / DQ */}
                    <div style={styles.distCard}>
                        <div style={styles.distHeader}>
                            <div>
                                <h3 style={styles.distTitle}>{th ? 'สถานะนักวิ่ง' : 'Runner Count by Status'}</h3>
                                <p style={styles.distSub}>{th ? 'จำนวนผู้เข้าแข่งขันแยกตามสถานะ และเพศ' : 'Participant counts by status, split by gender'}</p>
                            </div>
                        </div>
                        <div style={{ padding: '8px 4px 16px 0' }}>
                            <ResponsiveContainer width="100%" height={280}>
                                <BarChart data={statusChartData} margin={{ top: 20, right: 16, left: 4, bottom: 5 }} barCategoryGap="25%">
                                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                                    <XAxis dataKey="name" tick={{ fill: '#64748b', fontSize: 11, fontWeight: 700 }} axisLine={{ stroke: '#e2e8f0' }} tickLine={false} />
                                    <YAxis tick={{ fill: '#cbd5e1', fontSize: 10 }} axisLine={false} tickLine={false} width={40} />
                                    <Tooltip content={<ChartTooltip th={th} />} cursor={{ fill: 'rgba(59,130,246,0.04)' }} />
                                    <Legend wrapperStyle={{ fontSize: 11, fontWeight: 700 }} />
                                    <Bar dataKey="male" name={th ? 'ชาย (MALE)' : 'MALE'} stackId="a" fill="#3b82f6" radius={[0, 0, 0, 0]} isAnimationActive={false}>
                                        <LabelList dataKey="male" position="inside" style={{ fill: '#fff', fontWeight: 800, fontSize: 11 }} formatter={(v: any) => v > 0 ? v : ''} />
                                    </Bar>
                                    <Bar dataKey="female" name={th ? 'หญิง (FEMALE)' : 'FEMALE'} stackId="a" fill="#22c55e" radius={[4, 4, 0, 0]} isAnimationActive={false}>
                                        <LabelList dataKey="total" position="top" style={{ fill: '#0f172a', fontWeight: 900, fontSize: 12 }} />
                                        <LabelList dataKey="female" position="inside" style={{ fill: '#fff', fontWeight: 800, fontSize: 11 }} formatter={(v: any) => v > 0 ? v : ''} />
                                    </Bar>
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                    </div>

                    {/* Starters by Age Group */}
                    <div style={styles.distCard}>
                        <div style={styles.distHeader}>
                            <div>
                                <h3 style={styles.distTitle}>{th ? 'ผู้เข้าแข่งขันแยกตามกลุ่มอายุ' : 'Starters by Age'}</h3>
                                <p style={styles.distSub}>{th ? 'จำนวนผู้ออกวิ่งแยกตามช่วงอายุ และเพศ' : 'Starters broken down by age group and gender'}</p>
                            </div>
                        </div>
                        <div style={{ padding: '8px 4px 16px 0' }}>
                            <ResponsiveContainer width="100%" height={280}>
                                <BarChart data={startersByAgeData} margin={{ top: 20, right: 16, left: 4, bottom: 5 }} barCategoryGap="20%">
                                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                                    <XAxis dataKey="ageGroup" tick={{ fill: '#64748b', fontSize: 10, fontWeight: 700 }} axisLine={{ stroke: '#e2e8f0' }} tickLine={false} interval={0} />
                                    <YAxis tick={{ fill: '#cbd5e1', fontSize: 10 }} axisLine={false} tickLine={false} width={40} />
                                    <Tooltip content={<ChartTooltip th={th} />} cursor={{ fill: 'rgba(59,130,246,0.04)' }} />
                                    <Legend wrapperStyle={{ fontSize: 11, fontWeight: 700 }} />
                                    <Bar dataKey="male" name={th ? 'ชาย (MALE)' : 'MALE'} stackId="a" fill="#3b82f6" radius={[0, 0, 0, 0]} isAnimationActive={false}>
                                        <LabelList dataKey="male" position="inside" style={{ fill: '#fff', fontWeight: 800, fontSize: 10 }} formatter={(v: any) => v > 0 ? v : ''} />
                                    </Bar>
                                    <Bar dataKey="female" name={th ? 'หญิง (FEMALE)' : 'FEMALE'} stackId="a" fill="#22c55e" radius={[4, 4, 0, 0]} isAnimationActive={false}>
                                        <LabelList dataKey="total" position="top" style={{ fill: '#0f172a', fontWeight: 900, fontSize: 11 }} />
                                        <LabelList dataKey="female" position="inside" style={{ fill: '#fff', fontWeight: 800, fontSize: 10 }} formatter={(v: any) => v > 0 ? v : ''} />
                                    </Bar>
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                    </div>
                </div>

                {/* ─── Checkpoint Distribution Charts per Category (Dual: Passed Through + Currently At) ─── */}
                {categories.map(cat => {
                    const dataCurrently = chartDataByCategory[cat];
                    const dataPassed = chartDataByCategoryPassedThrough[cat];
                    const cs = catSummary[cat];
                    if ((!dataCurrently || dataCurrently.length === 0) && (!dataPassed || dataPassed.length === 0)) return null;

                    return (
                        <div key={cat} style={{ ...styles.sectionCard, marginBottom: 24 }}>
                            <div style={styles.sectionHeader}>
                                <div>
                                    <h2 style={styles.sectionTitle}>
                                        <span style={{ fontSize: 18 }}>📍</span>
                                        {cat} — {th ? 'การกระจายตัวนักวิ่งตามจุด Checkpoint' : 'Checkpoint Distribution'}
                                    </h2>
                                    <p style={styles.sectionSub}>{th ? 'เปรียบเทียบจำนวนนักวิ่งที่ผ่านแต่ละจุด กับจำนวนที่เหลืออยู่ปัจจุบัน' : 'Comparing cumulative pass-through vs runners currently remaining at each checkpoint'}</p>
                                </div>
                                <div style={styles.distBadge}>
                                    <div style={styles.distBadgeLabel}>TOTAL</div>
                                    <div style={styles.distBadgeValue}>{cs?.total?.toLocaleString() || 0}</div>
                                </div>
                            </div>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 0 }}>
                                {/* LEFT: Passed Through (cumulative) */}
                                <div style={{ borderRight: '1px solid #f1f5f9' }}>
                                    <div style={{ padding: '12px 16px 4px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                                        <span style={{ fontSize: 12, fontWeight: 800, color: '#3b82f6', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                                            {th ? '📊 ผ่านจุดนี้แล้ว (สะสม)' : '📊 Passed Through (Cumulative)'}
                                        </span>
                                        <MonitorButton th={th} onClick={() => openMonitor({ panel: 'passed', cat, campaignId: campaign._id })} />
                                    </div>
                                    <div style={{ padding: '4px 0 12px 0' }}>
                                        <PassedThroughChart data={dataPassed || []} th={th} height={220} />
                                    </div>
                                </div>
                                {/* RIGHT: Currently At — split by status, click a bar for the name list */}
                                <div>
                                    <div style={{ padding: '12px 16px 4px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 6 }}>
                                        <span style={{ fontSize: 12, fontWeight: 800, color: '#f59e0b', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                                            {th ? '📌 เหลืออยู่ที่จุดนี้ (แยกสถานะ)' : '📌 Currently At (by status)'}
                                        </span>
                                        <span style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                                            <StatusLegend th={th} />
                                            <MonitorButton th={th} onClick={() => openMonitor({ panel: 'current', cat, campaignId: campaign._id })} />
                                        </span>
                                    </div>
                                    <div style={{ padding: '4px 0 4px 0' }}>
                                        <CurrentlyAtChart
                                            data={dataCurrently || []}
                                            th={th}
                                            height={220}
                                            onPick={(seg) => setCpDetail({ cat, cpName: seg.cpName, runners: seg.runners })}
                                        />
                                    </div>
                                    <div style={{ textAlign: 'center', fontSize: 10, color: '#94a3b8', paddingBottom: 10 }}>
                                        {th ? '💡 คลิกที่แท่งเพื่อดูรายชื่อคนที่เหลือในจุดนั้น' : '💡 Click a bar to see who is still at that point'}
                                    </div>
                                </div>
                            </div>

                            {/* ─── Course Strip: horizontal route map with runners per segment ─── */}
                            <CourseStrip
                                cat={cat}
                                data={dataCurrently || []}
                                th={th}
                                route={routes[cat]}
                                legMedianMs={legMediansByCategory[cat]}
                                onPick={(cpName, segRunners) => setCpDetail({ cat, cpName, runners: segRunners })}
                                onOpenMonitor={(state) => openMonitor({ panel: 'course', cat, campaignId: campaign._id, ...state })}
                            />
                            {/* Mini summary row */}
                            {(() => {
                                const cells = [
                                    { label: th ? 'สมัคร' : 'Registered', value: cs?.total || 0, color: '#64748b' },
                                    { label: th ? 'ปล่อยตัว' : 'Started', value: cs?.started || 0, color: '#f59e0b' },
                                    { label: 'DNS', value: cs?.dns || 0, color: '#94a3b8' },
                                    { label: th ? 'จบ' : 'Finished', value: cs?.finished || 0, color: '#22c55e' },
                                    { label: 'DNF', value: cs?.dnf || 0, color: '#f59e0b' },
                                    { label: 'DQ', value: cs?.dq || 0, color: '#ef4444' },
                                    { label: '♂', value: cs?.mF || 0, color: '#3b82f6' },
                                    { label: '♀', value: cs?.fF || 0, color: '#ec4899' },
                                ];
                                return (
                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 0, borderTop: '1px solid #f1f5f9' }}>
                                        {cells.map((s, i) => (
                                            <div key={i} style={{
                                                flex: '1 1 12.5%', minWidth: 70, textAlign: 'center', padding: '10px 6px',
                                                borderRight: i < cells.length - 1 ? '1px solid #f1f5f9' : undefined,
                                            }}>
                                                <div style={{ fontSize: 9, color: '#94a3b8', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5 }}>{s.label}</div>
                                                <div style={{ fontSize: 16, fontWeight: 900, color: s.color, marginTop: 2 }}>{s.value}</div>
                                            </div>
                                        ))}
                                    </div>
                                );
                            })()}
                        </div>
                    );
                })}

                {/* ─── Age Group Summary Chart ─── */}
                {ageChartData.length > 0 && (
                    <div style={styles.sectionCard}>
                        <div style={styles.sectionHeader}>
                            <div>
                                <h2 style={styles.sectionTitle}>
                                    <span style={{ fontSize: 18 }}>📊</span>
                                    {th ? 'Age Group Summary' : 'Age Group Summary'}
                                </h2>
                                <p style={styles.sectionSub}>
                                    {th ? 'จำนวนผู้เข้าเส้นชัยแยกกลุ่มอายุ' : 'Comparison of participants finishing across key age brackets.'}
                                </p>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 14, fontSize: 12, fontWeight: 600, color: '#475569' }}>
                                <span><span style={styles.legendDot('#3b82f6')} />MALE</span>
                                <span><span style={styles.legendDot('#ec4899')} />FEMALE</span>
                            </div>
                        </div>
                        <div style={{ padding: '8px 12px 20px 0' }}>
                            <ResponsiveContainer width="100%" height={280}>
                                <BarChart data={ageChartData} margin={{ top: 10, right: 20, left: 10, bottom: 5 }} barCategoryGap="30%">
                                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                                    <XAxis dataKey="ageGroup" tick={{ fill: '#64748b', fontSize: 11, fontWeight: 700 }} axisLine={{ stroke: '#e2e8f0' }} tickLine={false} />
                                    <YAxis tick={{ fill: '#cbd5e1', fontSize: 11 }} axisLine={false} tickLine={false} />
                                    <Tooltip content={<ChartTooltip th={th} />} cursor={{ fill: 'rgba(59,130,246,0.04)' }} />
                                    <Bar dataKey="male" name={th ? 'ชาย' : 'Male'} fill="#3b82f6" radius={[4, 4, 0, 0]} maxBarSize={36} isAnimationActive={false}>
                                        <LabelList dataKey="male" position="top" style={{ fill: '#3b82f6', fontWeight: 800, fontSize: 10 }} />
                                    </Bar>
                                    <Bar dataKey="female" name={th ? 'หญิง' : 'Female'} fill="#ec4899" radius={[4, 4, 0, 0]} maxBarSize={36} isAnimationActive={false}>
                                        <LabelList dataKey="female" position="top" style={{ fill: '#ec4899', fontWeight: 800, fontSize: 10 }} />
                                    </Bar>
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                    </div>
                )}

                {/* ─── Age Group Breakdown Table ─── */}
                {ageGroupData.length > 0 && (
                    <div style={styles.sectionCard}>
                        <div style={styles.sectionHeader}>
                            <div>
                                <h2 style={{ ...styles.sectionTitle, fontSize: 16 }}>
                                    {th ? 'Age Group Breakdown' : 'Age Group Breakdown'}
                                </h2>
                                <p style={styles.sectionSub}>
                                    {th ? 'รายละเอียดสถิติแยกตามกลุ่มอายุ' : 'Detailed performance and registration metrics per bracket.'}
                                </p>
                            </div>
                        </div>
                        <div style={{ overflowX: 'auto' }}>
                            <table style={styles.table}>
                                <thead>
                                    <tr>
                                        <th style={styles.th}>{th ? 'กลุ่มอายุ' : 'AGE BRACKET'}</th>
                                        <th style={{ ...styles.th, textAlign: 'center' }}>{th ? 'สมัคร' : 'REGISTERED'}</th>
                                        <th style={{ ...styles.th, textAlign: 'center' }}>{th ? 'จบ' : 'FINISHED'}</th>
                                        <th style={{ ...styles.th, textAlign: 'center' }}>{th ? 'เวลาดีที่สุด' : 'TOP FINISH TIME'}</th>
                                        <th style={{ ...styles.th, textAlign: 'center' }}>{th ? 'สถานะ' : 'STATUS'}</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {ageGroupData.map((row, i) => (
                                        <tr key={row.ageGroup} style={{ background: i % 2 === 0 ? '#fff' : '#fafbfc', transition: 'background 0.15s' }}
                                            onMouseEnter={e => (e.currentTarget.style.background = '#f0f4ff')}
                                            onMouseLeave={e => (e.currentTarget.style.background = i % 2 === 0 ? '#fff' : '#fafbfc')}
                                        >
                                            <td style={{ ...styles.td, fontWeight: 800, color: '#0f172a' }}>
                                                <div>{row.ageGroup}</div>
                                                <div style={{ fontSize: 11, color: '#94a3b8', fontWeight: 500 }}>
                                                    ♂ {row.male} · ♀ {row.female}
                                                </div>
                                            </td>
                                            <td style={{ ...styles.td, textAlign: 'center', fontWeight: 700, color: '#334155' }}>
                                                {row.registered.toLocaleString()}
                                            </td>
                                            <td style={{ ...styles.td, textAlign: 'center', fontWeight: 800, color: '#0f172a' }}>
                                                {row.total}
                                            </td>
                                            <td style={{ ...styles.td, textAlign: 'center', fontWeight: 800, color: '#ef4444', fontFamily: 'monospace' }}>
                                                {row.bestTime > 0 ? formatTimeMs(row.bestTime) : '-'}
                                            </td>
                                            <td style={{ ...styles.td, textAlign: 'center' }}>
                                                <span style={styles.statusBadge(row.status.bg, row.status.color)}>
                                                    {row.status.label}
                                                </span>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}
            </div>

            {/* ─── Mobile responsive styles ─── */}
            <style>{`
                .gc-stats-grid {
                    display: grid !important;
                    grid-template-columns: repeat(4, 1fr) !important;
                    gap: 16px !important;
                    margin-bottom: 24px !important;
                    margin-top: -40px !important;
                    position: relative !important;
                    z-index: 5 !important;
                    padding: 0 12px !important;
                }
                .gc-stat-card {
                    min-width: 0 !important;
                }
                @media (max-width: 900px) {
                    .gc-stats-grid {
                        grid-template-columns: repeat(2, 1fr) !important;
                        margin-top: -28px !important;
                        gap: 10px !important;
                        padding: 0 8px !important;
                    }
                }
                @media (max-width: 520px) {
                    .gc-stats-grid {
                        grid-template-columns: 1fr 1fr !important;
                        margin-top: -20px !important;
                        gap: 8px !important;
                        padding: 0 4px !important;
                    }
                    .gc-stat-card {
                        padding: 14px 14px !important;
                    }
                    .gc-dist-grid {
                        grid-template-columns: 1fr !important;
                    }
                }
            `}</style>

            {/* ─── Runners-remaining-at-checkpoint drill-down modal ─── */}
            {cpDetail && (
                <div
                    onClick={() => setCpDetail(null)}
                    style={{
                        position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.5)', zIndex: 10000,
                        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
                    }}
                >
                    <div
                        onClick={e => e.stopPropagation()}
                        style={{
                            background: '#fff', borderRadius: 14, width: '100%', maxWidth: 560,
                            maxHeight: '86vh', display: 'flex', flexDirection: 'column',
                            boxShadow: '0 20px 60px rgba(0,0,0,0.3)', overflow: 'hidden',
                        }}
                    >
                        {/* header */}
                        <div style={{ padding: '18px 22px', borderBottom: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
                            <div>
                                <h3 style={{ margin: 0, fontSize: 16, fontWeight: 900, color: '#0f172a' }}>
                                    {cpDetail.cat} — {cpDetail.cpName}
                                </h3>
                                <p style={{ margin: '3px 0 0', fontSize: 12, color: '#94a3b8' }}>
                                    {th ? 'คนที่ยังเหลืออยู่ในช่วงนี้' : 'Runners still in this segment'}: <strong style={{ color: '#f59e0b' }}>{cpDetail.runners.length}</strong>
                                </p>
                            </div>
                            <button onClick={() => setCpDetail(null)} style={{ background: 'none', border: 'none', fontSize: 22, cursor: 'pointer', color: '#94a3b8', lineHeight: 1 }}>✕</button>
                        </div>
                        {/* status summary chips */}
                        <div style={{ display: 'flex', gap: 8, padding: '12px 22px', borderBottom: '1px solid #f8fafc', flexWrap: 'wrap' }}>
                            {(['active', 'dnf', 'dq', 'other'] as StatusBucket[]).map(b => {
                                const n = cpDetail.runners.filter(r => r.bucket === b).length;
                                if (n === 0) return null;
                                return (
                                    <span key={b} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12, fontWeight: 700, color: '#334155', background: '#f8fafc', border: '1px solid #eef2f7', borderRadius: 8, padding: '4px 10px' }}>
                                        <span style={styles.legendDot(STATUS_META[b].color)} />
                                        {th ? STATUS_META[b].th : STATUS_META[b].en}: {n}
                                    </span>
                                );
                            })}
                        </div>
                        {/* list */}
                        <div style={{ overflowY: 'auto', padding: '6px 0' }}>
                            {cpDetail.runners.length === 0 ? (
                                <div style={{ padding: 30, textAlign: 'center', color: '#94a3b8', fontSize: 13 }}>
                                    {th ? 'ไม่มีคนเหลือในจุดนี้' : 'No runners remaining here'}
                                </div>
                            ) : (
                                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                                    <tbody>
                                        {cpDetail.runners.map((r, i) => (
                                            <tr key={r.bib + i} style={{ borderBottom: '1px solid #f8fafc' }}>
                                                <td style={{ padding: '9px 22px', width: 4 }}>
                                                    <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: STATUS_META[r.bucket].color }} />
                                                </td>
                                                <td style={{ padding: '9px 8px', fontWeight: 800, color: '#0f172a', fontFamily: 'monospace', width: 70 }}>{r.bib}</td>
                                                <td style={{ padding: '9px 8px', color: '#334155' }}>
                                                    {r.gender === 'F' ? '♀ ' : r.gender === 'M' ? '♂ ' : ''}{r.name}
                                                </td>
                                                <td style={{ padding: '9px 22px', textAlign: 'right' }}>
                                                    <span style={{ fontSize: 10, fontWeight: 800, textTransform: 'uppercase', color: STATUS_META[r.bucket].color }}>
                                                        {r.status || (th ? '—' : '—')}
                                                    </span>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* Loading indicator */}
            {runnersLoading && (
                <div style={{
                    position: 'fixed', bottom: 20, right: 20, zIndex: 9999,
                    background: '#0f172a', color: '#fff',
                    padding: '10px 20px', borderRadius: 10,
                    fontSize: 13, fontWeight: 700,
                    boxShadow: '0 8px 32px rgba(0,0,0,0.2)',
                    display: 'flex', alignItems: 'center', gap: 8,
                }}>
                    <div style={{ width: 14, height: 14, border: '2px solid rgba(255,255,255,0.2)', borderTopColor: '#fff', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
                    {th ? 'กำลังโหลด...' : 'Loading...'}
                </div>
            )}
            <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
        </AdminLayout>
    );
}

/** Route entry: the admin page is the view with no monitor request. */
export default function GeneralChartPage() {
    return <GeneralChartView />;
}
