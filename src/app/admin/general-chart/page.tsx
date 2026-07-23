'use client';

import React, { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { useLanguage } from '@/lib/language-context';
import AdminLayout from '../AdminLayout';
import '../admin.css';
import {
    BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, LabelList, Legend,
    AreaChart, Area,
} from 'recharts';

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
}

interface TimingRecord {
    bib: string;
    scanTime?: string;
    elapsedTime?: number;
}

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

// ─── Course density curve ────────────────────────────────────────────────────
// A smooth area chart: X = the route (each checkpoint stretch), Y = how many
// runners are currently on that stretch. Lets ops see at a glance where the pack
// is densest along the course. Click a point to see who is on that stretch.
function CourseStrip({ cat, data, th, onPick }: {
    cat: string;
    data: SegmentDatum[];
    th: boolean;
    onPick: (cpName: string, runners: SegmentRunner[]) => void;
}) {
    if (!data.length) return null;
    // Segments = the stretch AFTER each checkpoint (last node has no outgoing stretch),
    // so the curve spans only the parts of the course runners can still be on.
    const segments = data.slice(0, -1).map((s, i) => ({
        ...s,
        // "CP1 → CP2" reads as the stretch between two points
        segLabel: data[i + 1] ? `${s.cpName} → ${data[i + 1].cpName}` : s.cpName,
    }));
    if (segments.length === 0) return null;
    const totalOnCourse = segments.reduce((sum, s) => sum + s.count, 0);
    const peak = segments.reduce((m, s) => (s.count > m.count ? s : m), segments[0]);
    const maxVal = Math.max(...segments.map(s => s.count), 1);
    const many = segments.length > 6;
    const gid = `courseGrad-${cat.replace(/[^a-zA-Z0-9]/g, '')}`;

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
                <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
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

            <ResponsiveContainer width="100%" height={230}>
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
            </div>
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

interface SegmentRunner { bib: string; name: string; status: string; gender: string; bucket: StatusBucket; }
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

// ─── Component ───────────────────────────────────────────────────────────────
export default function GeneralChartPage() {
    const { language } = useLanguage();
    const th = language === 'th';

    const [campaign, setCampaign] = useState<Campaign | null>(null);
    const [loading, setLoading] = useState(true);
    const [checkpoints, setCheckpoints] = useState<Checkpoint[]>([]);
    const [runners, setRunners] = useState<Runner[]>([]);
    const [cpTimingMap, setCpTimingMap] = useState<Record<string, Set<string>>>({});
    const [runnersLoading, setRunnersLoading] = useState(false);
    const [lastRefresh, setLastRefresh] = useState<Date | null>(null);
    const [autoRefresh, setAutoRefresh] = useState(true);
    const refreshRef = useRef<ReturnType<typeof setInterval> | null>(null);

    // Which checkpoint segment's runner list is open in the drill-down modal
    const [cpDetail, setCpDetail] = useState<{ cat: string; cpName: string; runners: SegmentRunner[] } | null>(null);

    // ── Load campaign ──
    useEffect(() => {
        (async () => {
            try {
                const res = await fetch('/api/campaigns/featured', { cache: 'no-store' });
                if (!res.ok) throw new Error();
                const data = await res.json();
                if (data?._id) setCampaign(data);
            } catch { setCampaign(null); }
            finally { setLoading(false); }
        })();
    }, []);

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
                            return { cpName: cp.name, bibs: new Set(records.filter(r => r.bib && r.scanTime).map(r => r.bib)) };
                        } catch {
                            return { cpName: cp.name, bibs: new Set<string>() };
                        }
                    })
                );
                const m: Record<string, Set<string>> = {};
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
        const startBibs = cpTimingMap['START'] || cpTimingMap['Start'] || new Set<string>();
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
            const catCps = checkpoints.filter(cp => {
                if (!cp.distanceMappings || cp.distanceMappings.length === 0) return true;
                return cp.distanceMappings.includes(cat);
            });
            if (catCps.length === 0) continue;
            const data: SegmentDatum[] = [];
            for (let i = 0; i < catCps.length; i++) {
                const cp = catCps[i];
                const nextCp = i < catCps.length - 1 ? catCps[i + 1] : null;
                const cpBibs = cpTimingMap[cp.name] || new Set<string>();
                const catBibsAtCp = catRunners.filter(r => cpBibs.has(r.bib));
                let remaining: Runner[];
                if (cp.type === 'finish' || cp.name.toLowerCase() === 'finish') {
                    remaining = catBibsAtCp;
                } else if (nextCp) {
                    const nextBibs = cpTimingMap[nextCp.name] || new Set<string>();
                    remaining = catBibsAtCp.filter(r => !nextBibs.has(r.bib));
                } else {
                    remaining = catBibsAtCp;
                }
                const segRunners: SegmentRunner[] = remaining.map(r => ({
                    bib: r.bib,
                    name: `${r.firstName || ''} ${r.lastName || ''}`.trim() || r.bib,
                    status: r.status,
                    gender: r.gender,
                    bucket: statusBucketOf(r.status),
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
    }, [categories, runners, checkpoints, cpTimingMap]);

    // ── Per-category summary ──
    const catSummary = useMemo(() => {
        const result: Record<string, { total: number; started: number; finished: number; mF: number; fF: number }> = {};
        const startBibs = cpTimingMap['START'] || cpTimingMap['Start'] || new Set<string>();
        for (const cat of categories) {
            const cr = runners.filter(r => r.category === cat);
            result[cat] = {
                total: cr.length,
                started: cr.filter(r => startBibs.has(r.bib) || r.status === 'in_progress' || r.status === 'finished').length,
                finished: cr.filter(r => r.status === 'finished').length,
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
        const startBibs = cpTimingMap['START'] || cpTimingMap['Start'] || new Set<string>();
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
        const startBibs = cpTimingMap['START'] || cpTimingMap['Start'] || new Set<string>();
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
            const catCps = checkpoints.filter(cp => {
                if (!cp.distanceMappings || cp.distanceMappings.length === 0) return true;
                return cp.distanceMappings.includes(cat);
            });
            if (catCps.length === 0) continue;
            const data: { cpName: string; count: number; total: number }[] = [];
            for (const cp of catCps) {
                const cpBibs = cpTimingMap[cp.name] || new Set<string>();
                const count = catRunners.filter(r => cpBibs.has(r.bib)).length;
                data.push({ cpName: cp.name, count, total: catRunners.length });
            }
            result[cat] = data;
        }
        return result;
    }, [categories, runners, checkpoints, cpTimingMap]);

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
                    const maxValPassed = dataPassed ? Math.max(...dataPassed.map(d => d.count), 1) : 1;
                    const maxValCurrent = dataCurrently ? Math.max(...dataCurrently.map(d => d.count), 1) : 1;

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
                                    <div style={{ padding: '12px 16px 4px', fontSize: 12, fontWeight: 800, color: '#3b82f6', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                                        {th ? '📊 ผ่านจุดนี้แล้ว (สะสม)' : '📊 Passed Through (Cumulative)'}
                                    </div>
                                    <div style={{ padding: '4px 0 12px 0' }}>
                                        <ResponsiveContainer width="100%" height={220}>
                                            <BarChart data={dataPassed || []} margin={{ top: 20, right: 16, left: 4, bottom: 5 }} barCategoryGap="25%">
                                                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                                                <XAxis dataKey="cpName" tick={{ fill: '#94a3b8', fontSize: 10, fontWeight: 700 }} axisLine={{ stroke: '#e2e8f0' }} tickLine={false} interval={0} angle={(dataPassed?.length || 0) > 6 ? -35 : 0} textAnchor={(dataPassed?.length || 0) > 6 ? 'end' : 'middle'} height={(dataPassed?.length || 0) > 6 ? 50 : 30} />
                                                <YAxis domain={[0, Math.ceil(maxValPassed * 1.3) || 10]} tick={{ fill: '#cbd5e1', fontSize: 10 }} axisLine={false} tickLine={false} width={35} />
                                                <Tooltip content={<ChartTooltip th={th} />} cursor={{ fill: 'rgba(59,130,246,0.04)' }} />
                                                <Bar dataKey="count" name={th ? 'ผ่านเข้าจุด' : 'Passed Through'} radius={[4, 4, 0, 0]} maxBarSize={48} isAnimationActive={false}>
                                                    <LabelList dataKey="count" position="top" style={{ fill: '#475569', fontWeight: 800, fontSize: 11 }} />
                                                    {(dataPassed || []).map((entry, idx) => {
                                                        const isFinish = entry.cpName.toLowerCase() === 'finish';
                                                        if (entry.count === 0) return <Cell key={idx} fill="#e2e8f0" />;
                                                        if (isFinish) return <Cell key={idx} fill="#22c55e" />;
                                                        return <Cell key={idx} fill="#60a5fa" />;
                                                    })}
                                                </Bar>
                                            </BarChart>
                                        </ResponsiveContainer>
                                    </div>
                                </div>
                                {/* RIGHT: Currently At — split by status, click a bar for the name list */}
                                <div>
                                    <div style={{ padding: '12px 16px 4px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 6 }}>
                                        <span style={{ fontSize: 12, fontWeight: 800, color: '#f59e0b', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                                            {th ? '📌 เหลืออยู่ที่จุดนี้ (แยกสถานะ)' : '📌 Currently At (by status)'}
                                        </span>
                                        <span style={{ display: 'flex', gap: 10, fontSize: 10, fontWeight: 700, color: '#64748b', flexWrap: 'wrap' }}>
                                            {(['active', 'dnf', 'dq', 'other'] as StatusBucket[]).map(b => (
                                                <span key={b} style={{ display: 'inline-flex', alignItems: 'center' }}>
                                                    <span style={styles.legendDot(STATUS_META[b].color)} />{th ? STATUS_META[b].th.split(' ')[0] : STATUS_META[b].en}
                                                </span>
                                            ))}
                                        </span>
                                    </div>
                                    <div style={{ padding: '4px 0 4px 0' }}>
                                        <ResponsiveContainer width="100%" height={220}>
                                            <BarChart data={dataCurrently || []} margin={{ top: 20, right: 16, left: 4, bottom: 5 }} barCategoryGap="25%">
                                                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                                                <XAxis dataKey="cpName" tick={{ fill: '#94a3b8', fontSize: 10, fontWeight: 700 }} axisLine={{ stroke: '#e2e8f0' }} tickLine={false} interval={0} angle={(dataCurrently?.length || 0) > 6 ? -35 : 0} textAnchor={(dataCurrently?.length || 0) > 6 ? 'end' : 'middle'} height={(dataCurrently?.length || 0) > 6 ? 50 : 30} />
                                                <YAxis domain={[0, Math.ceil(maxValCurrent * 1.3) || 10]} tick={{ fill: '#cbd5e1', fontSize: 10 }} axisLine={false} tickLine={false} width={35} />
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
                                                            if (seg && seg.count > 0) setCpDetail({ cat, cpName: seg.cpName, runners: seg.runners });
                                                        }}
                                                    >
                                                        {/* Total label sits on whichever segment is the top-most
                                                            non-zero one, so it always renders on a visible bar. */}
                                                        <LabelList content={(props: any) => {
                                                            const seg = (dataCurrently || [])[props.index] as SegmentDatum | undefined;
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
                                    </div>
                                    <div style={{ textAlign: 'center', fontSize: 10, color: '#94a3b8', paddingBottom: 10 }}>
                                        {th ? '💡 คลิกที่แท่งเพื่อดูรายชื่อคนที่เหลือในจุดนั้น' : '💡 Click a bar to see who is still at that point'}
                                    </div>
                                </div>
                            </div>

                            {/* ─── Course Strip: horizontal route map with runners per segment ─── */}
                            <CourseStrip cat={cat} data={dataCurrently || []} th={th} onPick={(cpName, segRunners) => setCpDetail({ cat, cpName, runners: segRunners })} />
                            {/* Mini summary row */}
                            <div style={{ display: 'flex', gap: 0, borderTop: '1px solid #f1f5f9' }}>
                                {[
                                    { label: th ? 'สมัคร' : 'Registered', value: cs?.total || 0, color: '#64748b' },
                                    { label: th ? 'ปล่อยตัว' : 'Started', value: cs?.started || 0, color: '#f59e0b' },
                                    { label: th ? 'จบ' : 'Finished', value: cs?.finished || 0, color: '#22c55e' },
                                    { label: '♂', value: cs?.mF || 0, color: '#3b82f6' },
                                    { label: '♀', value: cs?.fF || 0, color: '#ec4899' },
                                ].map((s, i) => (
                                    <div key={i} style={{
                                        flex: 1, textAlign: 'center', padding: '10px 6px',
                                        borderRight: i < 4 ? '1px solid #f1f5f9' : undefined,
                                    }}>
                                        <div style={{ fontSize: 9, color: '#94a3b8', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5 }}>{s.label}</div>
                                        <div style={{ fontSize: 16, fontWeight: 900, color: s.color, marginTop: 2 }}>{s.value}</div>
                                    </div>
                                ))}
                            </div>
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
