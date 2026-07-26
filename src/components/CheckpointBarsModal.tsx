'use client';

/**
 * The two checkpoint bar charts from /admin/general-chart, as a popup for the
 * public results page: how many runners have passed each checkpoint, and how
 * many are still sitting on it split by status.
 *
 * Both are read straight off the scan records — `/api/timing/checkpoint-by-campaign`
 * per checkpoint, the same source the admin page uses — so a runner who skipped
 * a checkpoint is missing from that bar rather than being back-filled. That is
 * why the "passed" series is not monotonic and should not be made so.
 *
 * The scans are only fetched when the sheet is opened; most visitors never open it.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
    BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, LabelList,
} from 'recharts';

export type StatusBucket = 'active' | 'dnf' | 'dq' | 'other';

const STATUS_META: Record<StatusBucket, { th: string; en: string; color: string }> = {
    active: { th: 'ยังอยู่ในเส้นทาง', en: 'On course', color: '#22c55e' },
    dnf: { th: 'DNF (ไม่จบ)', en: 'DNF', color: '#f59e0b' },
    dq: { th: 'DQ (ตัดสิทธิ์)', en: 'DQ', color: '#ef4444' },
    other: { th: 'อื่นๆ (DNS ฯลฯ)', en: 'Other', color: '#94a3b8' },
};

/** in_progress / not_started / finished / blank all still count as "on course". */
function statusBucketOf(status: string): StatusBucket {
    const s = (status || '').toLowerCase();
    if (s === 'dnf') return 'dnf';
    if (s === 'dq') return 'dq';
    if (s === 'dns') return 'other';
    return 'active';
}

/** The little the charts need to know about a runner. */
export interface BarsRunner {
    bib: string;
    status: string;
}

interface Datum {
    cpName: string;
    /** Runners of this distance with a scan at this checkpoint. */
    passed: number;
    /** Runners whose LAST scan is this checkpoint, split by status. */
    count: number;
    active: number;
    dnf: number;
    dq: number;
    other: number;
}

interface Props {
    open: boolean;
    onClose: () => void;
    campaignId: string;
    /** Distance shown in the header, e.g. "10 KM". */
    categoryLabel: string;
    /** Checkpoint names of this distance, already in course order. */
    cpNames: string[];
    /** Runners of this distance only. */
    runners: BarsRunner[];
    th: boolean;
    isDark: boolean;
}

const isFinishName = (v?: string | null) => {
    const upper = String(v || '').trim().toUpperCase();
    return upper.includes('FINISH') || upper === 'FIN';
};

/** Scans keyed by `campaignId::checkpoint`, so reopening the sheet is instant. */
const scanCache = new Map<string, Set<string>>();

export default function CheckpointBarsModal({
    open, onClose, campaignId, categoryLabel, cpNames, runners, th, isDark,
}: Props) {
    const [bibsByCp, setBibsByCp] = useState<Record<string, Set<string>> | null>(null);
    const [loading, setLoading] = useState(false);
    const [failed, setFailed] = useState(false);

    const cpKey = cpNames.join('|');

    useEffect(() => {
        if (!open || !campaignId || !cpNames.length) return;
        let alive = true;
        setLoading(true);
        setFailed(false);
        (async () => {
            try {
                const pairs = await Promise.all(cpNames.map(async (name) => {
                    const key = `${campaignId}::${name}`;
                    const cached = scanCache.get(key);
                    if (cached) return [name, cached] as const;
                    const res = await fetch(
                        `/api/timing/checkpoint-by-campaign/${campaignId}?cp=${encodeURIComponent(name)}`,
                        { cache: 'no-store' },
                    );
                    if (!res.ok) throw new Error(String(res.status));
                    const rows = await res.json();
                    // The endpoint pads its answer with runners who have NO scan
                    // here — DNS, DNF/DQ marked at this checkpoint, and anyone
                    // "incoming" from a previous one. Only a real scanTime counts
                    // as having passed through.
                    const bibs = new Set<string>(
                        (Array.isArray(rows) ? rows : [])
                            .filter((r: { bib?: string; scanTime?: string | null }) => r?.bib && r?.scanTime)
                            .map((r: { bib?: string }) => String(r.bib)),
                    );
                    scanCache.set(key, bibs);
                    return [name, bibs] as const;
                }));
                if (alive) setBibsByCp(Object.fromEntries(pairs));
            } catch {
                if (alive) setFailed(true);
            } finally {
                if (alive) setLoading(false);
            }
        })();
        return () => { alive = false; };
        // cpKey stands in for the array identity, which changes on every render.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open, campaignId, cpKey]);

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

    const [chartHeight, setChartHeight] = useState(240);
    useEffect(() => {
        if (!open) return;
        const measure = () => {
            const w = window.innerWidth;
            setChartHeight(w < 640 ? 200 : 250);
        };
        measure();
        window.addEventListener('resize', measure);
        return () => window.removeEventListener('resize', measure);
    }, [open]);

    const data = useMemo<Datum[]>(() => {
        if (!bibsByCp || !cpNames.length) return [];
        const sets = cpNames.map(n => bibsByCp[n] || new Set<string>());
        // Every runner belongs to the LAST checkpoint they actually scanned, so
        // somebody who missed one is not sent back to the gap behind it.
        const lastIndex = new Map<string, number>();
        for (const r of runners) {
            for (let i = 0; i < sets.length; i++) if (sets[i].has(r.bib)) lastIndex.set(r.bib, i);
        }
        const buckets: Record<StatusBucket, number>[] = cpNames.map(() => ({ active: 0, dnf: 0, dq: 0, other: 0 }));
        for (const r of runners) {
            const i = lastIndex.get(r.bib);
            if (i === undefined) continue;
            buckets[i][statusBucketOf(r.status)]++;
        }
        return cpNames.map((cpName, i) => {
            const b = buckets[i];
            return {
                cpName,
                passed: runners.filter(r => sets[i].has(r.bib)).length,
                count: b.active + b.dnf + b.dq + b.other,
                ...b,
            };
        });
    }, [bibsByCp, cpNames, runners]);

    const onBackdrop = useCallback((e: React.MouseEvent) => {
        if (e.target === e.currentTarget) onClose();
    }, [onClose]);

    if (!open) return null;

    const surface = isDark ? '#0f172a' : '#ffffff';
    const border = isDark ? '#1e293b' : '#e2e8f0';
    const text = isDark ? '#e2e8f0' : '#0f172a';
    const muted = isDark ? '#94a3b8' : '#64748b';
    const grid = isDark ? '#1e293b' : '#f1f5f9';
    const axis = isDark ? '#64748b' : '#94a3b8';

    const maxPassed = data.length ? Math.max(...data.map(d => d.passed), 1) : 1;
    const maxLeft = data.length ? Math.max(...data.map(d => d.count), 1) : 1;
    const many = data.length > 6;
    const axisProps = {
        dataKey: 'cpName',
        tick: { fill: axis, fontSize: 10, fontWeight: 700 },
        axisLine: { stroke: border },
        tickLine: false as const,
        interval: 0 as const,
        angle: many ? -35 : 0,
        textAnchor: (many ? 'end' : 'middle') as 'end' | 'middle',
        height: many ? 50 : 30,
    };

    const tooltipBox = (rows: { label: string; value: number; color?: string }[], title: string) => (
        <div style={{
            background: isDark ? '#020617' : '#fff', border: `1px solid ${border}`, borderRadius: 10,
            padding: '8px 11px', boxShadow: '0 8px 24px rgba(2,6,23,0.18)', fontSize: 11, color: text,
            fontFamily: "'Inter', 'Prompt', sans-serif",
        }}>
            <div style={{ fontWeight: 800, marginBottom: 5 }}>{title}</div>
            {rows.map(r => (
                <div key={r.label} style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 130 }}>
                    {r.color && <span style={{ width: 8, height: 8, borderRadius: 999, background: r.color, display: 'inline-block' }} />}
                    <span style={{ flex: 1, color: muted }}>{r.label}</span>
                    <span style={{ fontWeight: 800 }}>{r.value}</span>
                </div>
            ))}
        </div>
    );

    return (
        <div
            role="dialog"
            aria-modal="true"
            aria-label={th ? 'สรุปจุดเช็คพอยต์' : 'Checkpoint summary'}
            onClick={onBackdrop}
            style={{
                position: 'fixed', inset: 0, zIndex: 200,
                background: 'rgba(2,6,23,0.55)', backdropFilter: 'blur(2px)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                padding: 'max(12px, env(safe-area-inset-top)) 12px max(12px, env(safe-area-inset-bottom))',
                overscrollBehavior: 'contain',
            }}
        >
            <div style={{
                width: 'min(1100px, 100%)', maxHeight: '92dvh',
                display: 'flex', flexDirection: 'column',
                background: surface, border: `1px solid ${border}`, borderRadius: 16,
                boxShadow: '0 24px 60px rgba(2,6,23,0.35)', overflow: 'hidden',
                fontFamily: "'Inter', 'Prompt', sans-serif",
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 12px 12px 16px', borderBottom: `1px solid ${border}` }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 14, fontWeight: 800, color: text }}>
                            📊 {th ? 'สรุปจุดเช็คพอยต์' : 'Checkpoint summary'} · {categoryLabel}
                        </div>
                        <div style={{ fontSize: 11, color: muted, marginTop: 2 }}>
                            {th ? 'จำนวนคนที่ผ่านแต่ละจุด และคนที่ยังค้างอยู่ที่จุดนั้น' : 'How many have passed each checkpoint, and who is still sitting on it'}
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        aria-label={th ? 'ปิด' : 'Close'}
                        style={{
                            width: 32, height: 32, borderRadius: 999, cursor: 'pointer',
                            border: `1px solid ${border}`, background: 'transparent', color: muted,
                            fontSize: 16, lineHeight: 1, flexShrink: 0,
                        }}
                    >
                        ✕
                    </button>
                </div>

                <div style={{ padding: '14px 12px 18px', overflowY: 'auto' }}>
                    {loading && !data.length ? (
                        <div style={{ padding: '48px 0', textAlign: 'center', fontSize: 12, color: muted }}>
                            {th ? 'กำลังโหลด...' : 'Loading…'}
                        </div>
                    ) : failed ? (
                        <div style={{ padding: '48px 0', textAlign: 'center', fontSize: 12, color: '#dc2626' }}>
                            {th ? 'โหลดข้อมูลจุดเช็คพอยต์ไม่สำเร็จ ลองใหม่อีกครั้ง' : 'Could not load the checkpoint scans, please try again'}
                        </div>
                    ) : !data.length ? (
                        <div style={{ padding: '48px 0', textAlign: 'center', fontSize: 12, color: muted }}>
                            {th ? 'ระยะนี้ยังไม่มีจุดเช็คพอยต์' : 'No checkpoints set for this distance'}
                        </div>
                    ) : (
                        <div style={{ display: 'grid', gap: 18, gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))' }}>
                            {/* ── Passed through (cumulative per checkpoint) ── */}
                            <div>
                                <div style={{ fontSize: 12, fontWeight: 800, color: text, marginBottom: 8, paddingLeft: 8 }}>
                                    📊 {th ? 'ผ่านจุดนี้แล้ว (สะสม)' : 'Passed through (cumulative)'}
                                </div>
                                <ResponsiveContainer width="100%" height={chartHeight}>
                                    <BarChart data={data} margin={{ top: 20, right: 16, left: 4, bottom: 5 }} barCategoryGap="25%">
                                        <CartesianGrid strokeDasharray="3 3" stroke={grid} vertical={false} />
                                        <XAxis {...axisProps} />
                                        <YAxis domain={[0, Math.ceil(maxPassed * 1.3) || 10]} tick={{ fill: axis, fontSize: 10 }} axisLine={false} tickLine={false} width={35} />
                                        <Tooltip
                                            cursor={{ fill: 'rgba(59,130,246,0.06)' }}
                                            content={({ active, payload }) => {
                                                const d = active && payload?.length ? payload[0].payload as Datum : null;
                                                return d ? tooltipBox(
                                                    [{ label: th ? 'ผ่านจุดนี้แล้ว' : 'Passed through', value: d.passed, color: '#60a5fa' }],
                                                    d.cpName,
                                                ) : null;
                                            }}
                                        />
                                        <Bar dataKey="passed" radius={[4, 4, 0, 0]} maxBarSize={48} isAnimationActive={false}>
                                            <LabelList dataKey="passed" position="top" style={{ fill: muted, fontWeight: 800, fontSize: 11 }} />
                                            {data.map((entry, idx) => (
                                                <Cell
                                                    key={idx}
                                                    fill={entry.passed === 0 ? border : isFinishName(entry.cpName) ? '#22c55e' : '#60a5fa'}
                                                />
                                            ))}
                                        </Bar>
                                    </BarChart>
                                </ResponsiveContainer>
                            </div>

                            {/* ── Still at this checkpoint, split by status ── */}
                            <div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 8, paddingLeft: 8 }}>
                                    <div style={{ fontSize: 12, fontWeight: 800, color: text }}>
                                        📌 {th ? 'เหลืออยู่ที่จุดนี้ (แยกสถานะ)' : 'Still here (by status)'}
                                    </div>
                                    <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', fontSize: 10, fontWeight: 700, color: muted }}>
                                        {(['active', 'dnf', 'dq', 'other'] as StatusBucket[]).map(b => (
                                            <span key={b} style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                                                <span style={{ width: 7, height: 7, borderRadius: 999, background: STATUS_META[b].color, display: 'inline-block' }} />
                                                {th ? STATUS_META[b].th : STATUS_META[b].en}
                                            </span>
                                        ))}
                                    </div>
                                </div>
                                <ResponsiveContainer width="100%" height={chartHeight}>
                                    <BarChart data={data} margin={{ top: 20, right: 16, left: 4, bottom: 5 }} barCategoryGap="25%">
                                        <CartesianGrid strokeDasharray="3 3" stroke={grid} vertical={false} />
                                        <XAxis {...axisProps} />
                                        <YAxis domain={[0, Math.ceil(maxLeft * 1.3) || 10]} tick={{ fill: axis, fontSize: 10 }} axisLine={false} tickLine={false} width={35} />
                                        <Tooltip
                                            cursor={{ fill: 'rgba(59,130,246,0.06)' }}
                                            content={({ active, payload }) => {
                                                const d = active && payload?.length ? payload[0].payload as Datum : null;
                                                if (!d) return null;
                                                const rows = (['active', 'dnf', 'dq', 'other'] as StatusBucket[])
                                                    .filter(b => d[b] > 0)
                                                    .map(b => ({ label: th ? STATUS_META[b].th : STATUS_META[b].en, value: d[b], color: STATUS_META[b].color }));
                                                rows.push({ label: th ? 'รวมเหลืออยู่' : 'Total remaining', value: d.count, color: undefined as unknown as string });
                                                return tooltipBox(rows, d.cpName);
                                            }}
                                        />
                                        {(['active', 'dnf', 'dq', 'other'] as StatusBucket[]).map((b, bi) => (
                                            <Bar
                                                key={b}
                                                dataKey={b}
                                                name={th ? STATUS_META[b].th : STATUS_META[b].en}
                                                stackId="status"
                                                fill={STATUS_META[b].color}
                                                radius={bi === 3 ? [4, 4, 0, 0] : [0, 0, 0, 0]}
                                                maxBarSize={48}
                                                isAnimationActive={false}
                                            />
                                        ))}
                                    </BarChart>
                                </ResponsiveContainer>
                            </div>
                        </div>
                    )}

                    {!!data.length && (
                        <div style={{ fontSize: 10, color: muted, marginTop: 12, textAlign: 'center', lineHeight: 1.7 }}>
                            {th
                                ? '💡 นับจากการสแกนจริงที่แต่ละจุด — คนที่ข้ามจุดไหนไปจะไม่ถูกนับที่จุดนั้น ตัวเลขจึงไม่จำเป็นต้องลดหลั่นกันเสมอไป · "เหลืออยู่ที่จุดนี้" คือคนที่จุดนั้นเป็นจุดสแกนล่าสุดของเขา'
                                : '💡 Counted from the actual scans at each checkpoint — anyone who skipped one is missing from that bar, so the numbers need not step down evenly · "still here" means that checkpoint is their most recent scan.'}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
