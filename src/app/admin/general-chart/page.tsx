'use client';

import React, { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { useLanguage } from '@/lib/language-context';
import AdminLayout from '../AdminLayout';
import '../admin.css';
import {
    BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, LabelList,
} from 'recharts';

// ─── Types ───────────────────────────────────────────────────────────────────
interface Campaign {
    _id: string;
    name: string;
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
}

// Timing record per checkpoint
interface TimingRecord {
    bib: string;
    scanTime?: string;
    elapsedTime?: number;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
const CHART_COLORS = {
    bar: '#22c55e',
    barHover: '#16a34a',
    finish: '#22c55e',
    remaining: '#f59e0b',
    zero: '#e5e7eb',
};

const AGE_GROUPS_ORDER = [
    'Under 15', '15-19', '20-24', '25-29', '30-34', '35-39',
    '40-44', '45-49', '50-54', '55-59', '60-64', '65-69', '70+',
];

function getAgeGroupLabel(ag?: string): string {
    if (!ag) return 'N/A';
    return ag;
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

    // ── Load featured campaign ──
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

    // ── Fetch all data ──
    const fetchAll = useCallback(async (silent = false) => {
        if (!campaign?._id) return;
        if (!silent) setRunnersLoading(true);
        try {
            // Fetch runners
            const rRes = await fetch(`/api/runners/passtime?id=${campaign._id}`, { cache: 'no-store' });
            let payload: any = {};
            try { payload = await rRes.json(); } catch { payload = {}; }
            let runnerList: Runner[] = [];
            if (Array.isArray(payload)) runnerList = payload;
            else if (Array.isArray(payload?.data?.data)) runnerList = payload.data.data;
            else if (Array.isArray(payload?.data)) runnerList = payload.data;
            setRunners(runnerList);

            // Fetch timing per checkpoint → build set of bibs that passed each CP
            if (checkpoints.length > 0) {
                const cpResults = await Promise.all(
                    checkpoints.map(async (cp) => {
                        try {
                            const res = await fetch(
                                `/api/timing/checkpoint-by-campaign/${campaign._id}?cp=${encodeURIComponent(cp.name)}`,
                                { cache: 'no-store' }
                            );
                            const records: TimingRecord[] = await res.json();
                            return { cpName: cp.name, bibs: new Set(records.filter(r => r.bib && r.scanTime).map(r => r.bib)) };
                        } catch {
                            return { cpName: cp.name, bibs: new Set<string>() };
                        }
                    })
                );
                const newMap: Record<string, Set<string>> = {};
                for (const { cpName, bibs } of cpResults) {
                    newMap[cpName] = bibs;
                }
                setCpTimingMap(newMap);
            }

            setLastRefresh(new Date());
        } catch (err) {
            console.error('Failed to fetch chart data', err);
        } finally {
            if (!silent) setRunnersLoading(false);
        }
    }, [campaign?._id, checkpoints]);

    useEffect(() => {
        if (campaign?._id && checkpoints.length >= 0) fetchAll(false);
    }, [fetchAll]);

    // ── Auto-refresh every 15s ──
    useEffect(() => {
        if (refreshRef.current) clearInterval(refreshRef.current);
        if (autoRefresh && campaign?._id) {
            refreshRef.current = setInterval(() => fetchAll(true), 15_000);
        }
        return () => { if (refreshRef.current) clearInterval(refreshRef.current); };
    }, [autoRefresh, fetchAll, campaign?._id]);

    // ── Unique categories ──
    const categories = useMemo(() => {
        const cats = new Set<string>();
        runners.forEach(r => { if (r.category) cats.add(r.category); });
        return Array.from(cats).sort();
    }, [runners]);

    // ── Build chart data per category ──
    // For each category:
    //   - For each checkpoint (in order), count how many runners are "currently" at that CP
    //   - "Currently at CP X" = passed CP X but NOT passed the next CP
    //   - Finish = runners with status 'finished'
    const chartDataByCategory = useMemo(() => {
        const result: Record<string, { cpName: string; count: number; total: number }[]> = {};

        for (const cat of categories) {
            const catRunners = runners.filter(r => r.category === cat);
            const totalInCat = catRunners.length;

            // Get checkpoints applicable to this category
            const catCheckpoints = checkpoints.filter(cp => {
                if (!cp.distanceMappings || cp.distanceMappings.length === 0) return true;
                return cp.distanceMappings.includes(cat);
            });

            if (catCheckpoints.length === 0) continue;

            const chartData: { cpName: string; count: number; total: number }[] = [];

            // For each checkpoint, calculate "runners currently at this checkpoint"
            // = runners who have scanned at this CP but NOT scanned at the NEXT CP
            for (let i = 0; i < catCheckpoints.length; i++) {
                const cp = catCheckpoints[i];
                const nextCp = i < catCheckpoints.length - 1 ? catCheckpoints[i + 1] : null;
                const cpBibs = cpTimingMap[cp.name] || new Set<string>();

                // Get bibs of runners in this category who passed this CP
                const catBibsAtCp = catRunners.filter(r => cpBibs.has(r.bib));

                let count: number;
                if (cp.type === 'finish' || cp.name.toLowerCase() === 'finish') {
                    // Finish line: count = runners who passed finish
                    count = catBibsAtCp.length;
                } else if (nextCp) {
                    // Intermediate: passed this CP but NOT yet passed next CP
                    const nextBibs = cpTimingMap[nextCp.name] || new Set<string>();
                    count = catBibsAtCp.filter(r => !nextBibs.has(r.bib)).length;
                } else {
                    // Last non-finish checkpoint with no next — everyone who passed is "at" here
                    count = catBibsAtCp.length;
                }

                chartData.push({
                    cpName: cp.name,
                    count,
                    total: totalInCat,
                });
            }

            result[cat] = chartData;
        }

        return result;
    }, [categories, runners, checkpoints, cpTimingMap]);

    // ── Summary stats ──
    const summaryStats = useMemo(() => {
        const totalRunners = runners.length;
        const started = runners.filter(r => {
            const startBibs = cpTimingMap['START'] || cpTimingMap['Start'] || new Set<string>();
            return startBibs.has(r.bib) || r.status === 'in_progress' || r.status === 'finished';
        }).length;
        const finished = runners.filter(r => r.status === 'finished').length;
        const dnf = runners.filter(r => r.status === 'dnf').length;
        const dns = runners.filter(r => r.status === 'dns').length;
        const dq = runners.filter(r => r.status === 'dq').length;
        const inProgress = runners.filter(r => r.status === 'in_progress').length;

        // Gender breakdown
        const maleFinished = runners.filter(r => r.gender === 'M' && r.status === 'finished').length;
        const femaleFinished = runners.filter(r => r.gender === 'F' && r.status === 'finished').length;
        const maleTotal = runners.filter(r => r.gender === 'M').length;
        const femaleTotal = runners.filter(r => r.gender === 'F').length;

        // Age group breakdown for finishers
        const ageGroupFinishers: Record<string, { male: number; female: number; total: number }> = {};
        runners.forEach(r => {
            const ag = r.ageGroup || 'N/A';
            if (!ageGroupFinishers[ag]) ageGroupFinishers[ag] = { male: 0, female: 0, total: 0 };
        });
        runners.filter(r => r.status === 'finished').forEach(r => {
            const ag = r.ageGroup || 'N/A';
            if (!ageGroupFinishers[ag]) ageGroupFinishers[ag] = { male: 0, female: 0, total: 0 };
            ageGroupFinishers[ag].total++;
            if (r.gender === 'M') ageGroupFinishers[ag].male++;
            else if (r.gender === 'F') ageGroupFinishers[ag].female++;
        });

        return {
            totalRunners, started, finished, dnf, dns, dq, inProgress,
            maleTotal, femaleTotal, maleFinished, femaleFinished,
            ageGroupFinishers,
        };
    }, [runners, cpTimingMap]);

    // ── Age group chart data ──
    const ageGroupChartData = useMemo(() => {
        const data: { ageGroup: string; male: number; female: number; total: number }[] = [];
        const agMap = summaryStats.ageGroupFinishers;
        const allGroups = Object.keys(agMap).sort((a, b) => {
            const ai = AGE_GROUPS_ORDER.indexOf(a);
            const bi = AGE_GROUPS_ORDER.indexOf(b);
            if (ai >= 0 && bi >= 0) return ai - bi;
            if (ai >= 0) return -1;
            if (bi >= 0) return 1;
            return a.localeCompare(b);
        });
        for (const ag of allGroups) {
            const d = agMap[ag];
            if (d.total > 0) {
                data.push({ ageGroup: ag, male: d.male, female: d.female, total: d.total });
            }
        }
        return data;
    }, [summaryStats]);

    // ── Per-category summary ──
    const categorySummary = useMemo(() => {
        const result: Record<string, {
            total: number; started: number; finished: number; inProgress: number;
            dns: number; dnf: number; dq: number;
            maleTotal: number; femaleTotal: number; maleFinished: number; femaleFinished: number;
        }> = {};
        for (const cat of categories) {
            const catRunners = runners.filter(r => r.category === cat);
            const startBibs = cpTimingMap['START'] || cpTimingMap['Start'] || new Set<string>();
            result[cat] = {
                total: catRunners.length,
                started: catRunners.filter(r => startBibs.has(r.bib) || r.status === 'in_progress' || r.status === 'finished').length,
                finished: catRunners.filter(r => r.status === 'finished').length,
                inProgress: catRunners.filter(r => r.status === 'in_progress').length,
                dns: catRunners.filter(r => r.status === 'dns').length,
                dnf: catRunners.filter(r => r.status === 'dnf').length,
                dq: catRunners.filter(r => r.status === 'dq').length,
                maleTotal: catRunners.filter(r => r.gender === 'M').length,
                femaleTotal: catRunners.filter(r => r.gender === 'F').length,
                maleFinished: catRunners.filter(r => r.gender === 'M' && r.status === 'finished').length,
                femaleFinished: catRunners.filter(r => r.gender === 'F' && r.status === 'finished').length,
            };
        }
        return result;
    }, [categories, runners, cpTimingMap]);

    // ─── Custom Tooltip ──────────────────────────────────────────────────────
    const CustomTooltip = ({ active, payload, label }: any) => {
        if (!active || !payload || !payload.length) return null;
        const data = payload[0].payload;
        return (
            <div style={{
                background: 'rgba(15, 23, 42, 0.95)',
                backdropFilter: 'blur(12px)',
                border: '1px solid rgba(255,255,255,0.1)',
                borderRadius: 12,
                padding: '12px 16px',
                boxShadow: '0 8px 32px rgba(0,0,0,0.3)',
            }}>
                <p style={{ margin: 0, fontWeight: 800, color: '#fff', fontSize: 14 }}>{label}</p>
                <p style={{ margin: '4px 0 0', color: '#22c55e', fontWeight: 700, fontSize: 16 }}>
                    {th ? 'อยู่ที่จุดนี้:' : 'Currently here:'} {data.count} {th ? 'คน' : 'runners'}
                </p>
                <p style={{ margin: '2px 0 0', color: '#94a3b8', fontSize: 12 }}>
                    {th ? 'ทั้งหมดในประเภท:' : 'Total in category:'} {data.total}
                </p>
            </div>
        );
    };

    if (loading) {
        return (
            <AdminLayout breadcrumbItems={[{ label: 'General Chart', labelEn: 'General Chart' }]}>
                <div style={{ padding: 40, textAlign: 'center', color: '#94a3b8' }}>
                    {th ? 'กำลังโหลด...' : 'Loading...'}
                </div>
            </AdminLayout>
        );
    }

    if (!campaign) {
        return (
            <AdminLayout breadcrumbItems={[{ label: 'General Chart', labelEn: 'General Chart' }]}>
                <div style={{ padding: 40, textAlign: 'center', color: '#94a3b8' }}>
                    {th ? 'ไม่พบกิจกรรมที่กำลังดำเนินการ' : 'No active campaign found'}
                </div>
            </AdminLayout>
        );
    }

    return (
        <AdminLayout breadcrumbItems={[{ label: 'กราฟสถิติ', labelEn: 'General Chart' }]}>
            {/* ─── Header ─── */}
            <div style={{
                background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)',
                borderRadius: 16,
                padding: '24px 28px',
                marginBottom: 20,
                boxShadow: '0 4px 20px rgba(0,0,0,0.15)',
            }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
                    <div>
                        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 900, color: '#fff', display: 'flex', alignItems: 'center', gap: 10 }}>
                            📊 General Chart
                            <span style={{
                                background: 'rgba(34, 197, 94, 0.15)',
                                color: '#22c55e',
                                padding: '4px 12px',
                                borderRadius: 8,
                                fontSize: 12,
                                fontWeight: 700,
                            }}>
                                LIVE
                            </span>
                        </h1>
                        <p style={{ margin: '6px 0 0', color: '#94a3b8', fontSize: 13 }}>
                            {campaign.name} — {th ? 'สถิติการกระจายตัวของนักวิ่ง ณ แต่ละ Checkpoint' : 'Runner distribution across checkpoints'}
                        </p>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <button
                            onClick={() => fetchAll(false)}
                            disabled={runnersLoading}
                            style={{
                                padding: '8px 16px',
                                borderRadius: 10,
                                border: '1px solid rgba(255,255,255,0.15)',
                                background: 'rgba(255,255,255,0.08)',
                                color: '#fff',
                                fontWeight: 700,
                                fontSize: 13,
                                cursor: 'pointer',
                            }}
                        >
                            {runnersLoading ? '⏳' : '🔄'} {th ? 'รีเฟรช' : 'Refresh'}
                        </button>
                        <label style={{
                            display: 'flex', alignItems: 'center', gap: 6,
                            color: '#94a3b8', fontSize: 12, cursor: 'pointer',
                        }}>
                            <input
                                type="checkbox"
                                checked={autoRefresh}
                                onChange={e => setAutoRefresh(e.target.checked)}
                                style={{ accentColor: '#22c55e' }}
                            />
                            {th ? 'รีเฟรชอัตโนมัติ' : 'Auto-refresh'}
                        </label>
                        {lastRefresh && (
                            <span style={{ color: '#64748b', fontSize: 11, fontFamily: 'monospace' }}>
                                {lastRefresh.toLocaleTimeString('th-TH')}
                            </span>
                        )}
                    </div>
                </div>
            </div>

            {/* ─── Overall Summary Cards ─── */}
            <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
                gap: 12,
                marginBottom: 24,
            }}>
                {[
                    { label: th ? 'ทั้งหมด' : 'Total', value: summaryStats.totalRunners, color: '#3b82f6', icon: '👥', bg: 'rgba(59,130,246,0.08)' },
                    { label: th ? 'ปล่อยตัวแล้ว' : 'Started', value: summaryStats.started, color: '#f59e0b', icon: '🚀', bg: 'rgba(245,158,11,0.08)' },
                    { label: th ? 'กำลังวิ่ง' : 'In Progress', value: summaryStats.inProgress, color: '#8b5cf6', icon: '🏃', bg: 'rgba(139,92,246,0.08)' },
                    { label: th ? 'เข้าเส้นชัย' : 'Finished', value: summaryStats.finished, color: '#22c55e', icon: '🏆', bg: 'rgba(34,197,94,0.08)' },
                    { label: 'DNF', value: summaryStats.dnf, color: '#ef4444', icon: '❌', bg: 'rgba(239,68,68,0.08)' },
                    { label: 'DNS', value: summaryStats.dns, color: '#6b7280', icon: '🚫', bg: 'rgba(107,114,128,0.08)' },
                    { label: 'DQ', value: summaryStats.dq, color: '#ec4899', icon: '⛔', bg: 'rgba(236,72,153,0.08)' },
                ].map(item => (
                    <div key={item.label} style={{
                        background: '#fff',
                        border: '1px solid #e5e7eb',
                        borderRadius: 14,
                        padding: '16px 18px',
                        boxShadow: '0 1px 4px rgba(0,0,0,0.04)',
                        position: 'relative',
                        overflow: 'hidden',
                    }}>
                        <div style={{
                            position: 'absolute', top: 0, left: 0, right: 0, height: 3,
                            background: item.color,
                        }} />
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <div>
                                <span style={{ fontSize: 11, fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                                    {item.label}
                                </span>
                                <div style={{ fontSize: 28, fontWeight: 900, color: item.color, marginTop: 2 }}>
                                    {item.value}
                                </div>
                            </div>
                            <span style={{
                                fontSize: 28, width: 48, height: 48, borderRadius: 12,
                                background: item.bg, display: 'flex', alignItems: 'center', justifyContent: 'center',
                            }}>
                                {item.icon}
                            </span>
                        </div>
                    </div>
                ))}
            </div>

            {/* ─── Gender Summary ─── */}
            <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))',
                gap: 16,
                marginBottom: 24,
            }}>
                {/* Male summary */}
                <div style={{
                    background: '#fff', border: '1px solid #e5e7eb', borderRadius: 14,
                    padding: '20px 24px',
                    boxShadow: '0 1px 4px rgba(0,0,0,0.04)',
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                        <span style={{ fontSize: 22, color: '#3b82f6' }}>♂</span>
                        <span style={{ fontWeight: 800, color: '#1e40af', fontSize: 15 }}>
                            {th ? 'ชาย' : 'Male'}
                        </span>
                    </div>
                    <div style={{ display: 'flex', gap: 16 }}>
                        <div>
                            <div style={{ fontSize: 11, color: '#64748b', fontWeight: 600 }}>{th ? 'ทั้งหมด' : 'Total'}</div>
                            <div style={{ fontSize: 24, fontWeight: 900, color: '#3b82f6' }}>{summaryStats.maleTotal}</div>
                        </div>
                        <div>
                            <div style={{ fontSize: 11, color: '#64748b', fontWeight: 600 }}>{th ? 'จบแล้ว' : 'Finished'}</div>
                            <div style={{ fontSize: 24, fontWeight: 900, color: '#22c55e' }}>{summaryStats.maleFinished}</div>
                        </div>
                        <div>
                            <div style={{ fontSize: 11, color: '#64748b', fontWeight: 600 }}>%</div>
                            <div style={{ fontSize: 24, fontWeight: 900, color: '#0f172a' }}>
                                {summaryStats.maleTotal > 0 ? Math.round((summaryStats.maleFinished / summaryStats.maleTotal) * 100) : 0}%
                            </div>
                        </div>
                    </div>
                </div>
                {/* Female summary */}
                <div style={{
                    background: '#fff', border: '1px solid #e5e7eb', borderRadius: 14,
                    padding: '20px 24px',
                    boxShadow: '0 1px 4px rgba(0,0,0,0.04)',
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                        <span style={{ fontSize: 22, color: '#ec4899' }}>♀</span>
                        <span style={{ fontWeight: 800, color: '#9d174d', fontSize: 15 }}>
                            {th ? 'หญิง' : 'Female'}
                        </span>
                    </div>
                    <div style={{ display: 'flex', gap: 16 }}>
                        <div>
                            <div style={{ fontSize: 11, color: '#64748b', fontWeight: 600 }}>{th ? 'ทั้งหมด' : 'Total'}</div>
                            <div style={{ fontSize: 24, fontWeight: 900, color: '#ec4899' }}>{summaryStats.femaleTotal}</div>
                        </div>
                        <div>
                            <div style={{ fontSize: 11, color: '#64748b', fontWeight: 600 }}>{th ? 'จบแล้ว' : 'Finished'}</div>
                            <div style={{ fontSize: 24, fontWeight: 900, color: '#22c55e' }}>{summaryStats.femaleFinished}</div>
                        </div>
                        <div>
                            <div style={{ fontSize: 11, color: '#64748b', fontWeight: 600 }}>%</div>
                            <div style={{ fontSize: 24, fontWeight: 900, color: '#0f172a' }}>
                                {summaryStats.femaleTotal > 0 ? Math.round((summaryStats.femaleFinished / summaryStats.femaleTotal) * 100) : 0}%
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* ─── Per-Category Bar Charts (runner distribution across CPs) ─── */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
                {categories.map(cat => {
                    const chartData = chartDataByCategory[cat];
                    const summary = categorySummary[cat];
                    if (!chartData || chartData.length === 0) return null;

                    const maxCount = Math.max(...chartData.map(d => d.count), 1);
                    const yDomain = [0, Math.ceil(maxCount * 1.2) || 10];

                    return (
                        <div key={cat} style={{
                            background: '#fff',
                            border: '1px solid #e5e7eb',
                            borderRadius: 16,
                            overflow: 'hidden',
                            boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
                        }}>
                            {/* Category header */}
                            <div style={{
                                padding: '16px 24px',
                                borderBottom: '1px solid #f1f5f9',
                                display: 'flex',
                                justifyContent: 'space-between',
                                alignItems: 'center',
                                flexWrap: 'wrap',
                                gap: 10,
                            }}>
                                <div>
                                    <h2 style={{ margin: 0, fontSize: 18, fontWeight: 900, color: '#0f172a' }}>
                                        {cat}
                                    </h2>
                                    <span style={{ fontSize: 12, color: '#64748b' }}>
                                        {th ? 'จำนวนนักวิ่งที่อยู่ ณ แต่ละ Checkpoint' : 'Runner count currently at each checkpoint'}
                                    </span>
                                </div>
                                <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                                    {[
                                        { label: th ? 'ทั้งหมด' : 'Total', value: summary?.total || 0, color: '#3b82f6' },
                                        { label: th ? 'ปล่อยตัว' : 'Started', value: summary?.started || 0, color: '#f59e0b' },
                                        { label: th ? 'จบ' : 'Finished', value: summary?.finished || 0, color: '#22c55e' },
                                        { label: th ? '♂ จบ' : '♂ Fin', value: summary?.maleFinished || 0, color: '#3b82f6' },
                                        { label: th ? '♀ จบ' : '♀ Fin', value: summary?.femaleFinished || 0, color: '#ec4899' },
                                    ].map(item => (
                                        <div key={item.label} style={{
                                            textAlign: 'center',
                                            padding: '4px 12px',
                                            background: '#f8fafc',
                                            borderRadius: 8,
                                            border: '1px solid #e2e8f0',
                                        }}>
                                            <div style={{ fontSize: 10, color: '#64748b', fontWeight: 600, textTransform: 'uppercase' }}>{item.label}</div>
                                            <div style={{ fontSize: 18, fontWeight: 900, color: item.color }}>{item.value}</div>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            {/* Chart area */}
                            <div style={{ padding: '16px 12px 20px 0' }}>
                                <ResponsiveContainer width="100%" height={280}>
                                    <BarChart
                                        data={chartData}
                                        margin={{ top: 20, right: 20, left: 10, bottom: 5 }}
                                        barCategoryGap="20%"
                                    >
                                        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                                        <XAxis
                                            dataKey="cpName"
                                            tick={{ fill: '#64748b', fontSize: 11, fontWeight: 700 }}
                                            axisLine={{ stroke: '#e2e8f0' }}
                                            tickLine={false}
                                        />
                                        <YAxis
                                            domain={yDomain}
                                            tick={{ fill: '#94a3b8', fontSize: 11 }}
                                            axisLine={false}
                                            tickLine={false}
                                            label={{
                                                value: th ? 'จำนวนคน' : 'Runner Count',
                                                angle: -90,
                                                position: 'insideLeft',
                                                style: { fill: '#94a3b8', fontSize: 12, fontWeight: 600 },
                                                offset: 0,
                                            }}
                                        />
                                        <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(34,197,94,0.06)' }} />
                                        <Bar
                                            dataKey="count"
                                            radius={[6, 6, 0, 0]}
                                            maxBarSize={60}
                                        >
                                            <LabelList
                                                dataKey="count"
                                                position="top"
                                                style={{ fill: '#0f172a', fontWeight: 900, fontSize: 13 }}
                                            />
                                            {chartData.map((entry, index) => {
                                                const isFinish = entry.cpName.toLowerCase() === 'finish';
                                                const hasRunners = entry.count > 0;
                                                let fillColor = '#e5e7eb'; // grey for 0
                                                if (hasRunners && isFinish) fillColor = '#22c55e';
                                                else if (hasRunners) fillColor = '#f59e0b';
                                                return <Cell key={index} fill={fillColor} />;
                                            })}
                                        </Bar>
                                    </BarChart>
                                </ResponsiveContainer>
                            </div>
                        </div>
                    );
                })}
            </div>

            {/* ─── Age Group Finishers Chart ─── */}
            {ageGroupChartData.length > 0 && (
                <div style={{
                    background: '#fff',
                    border: '1px solid #e5e7eb',
                    borderRadius: 16,
                    overflow: 'hidden',
                    boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
                    marginTop: 24,
                }}>
                    <div style={{
                        padding: '16px 24px',
                        borderBottom: '1px solid #f1f5f9',
                    }}>
                        <h2 style={{ margin: 0, fontSize: 18, fontWeight: 900, color: '#0f172a' }}>
                            {th ? '📊 สรุปผู้เข้าเส้นชัยแยกตามกลุ่มอายุ' : '📊 Finishers by Age Group'}
                        </h2>
                        <span style={{ fontSize: 12, color: '#64748b' }}>
                            {th ? 'แยกชาย/หญิง' : 'Male / Female breakdown'}
                        </span>
                    </div>
                    <div style={{ padding: '16px 12px 20px 0' }}>
                        <ResponsiveContainer width="100%" height={320}>
                            <BarChart
                                data={ageGroupChartData}
                                margin={{ top: 20, right: 20, left: 10, bottom: 5 }}
                                barCategoryGap="15%"
                            >
                                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                                <XAxis
                                    dataKey="ageGroup"
                                    tick={{ fill: '#64748b', fontSize: 11, fontWeight: 700 }}
                                    axisLine={{ stroke: '#e2e8f0' }}
                                    tickLine={false}
                                />
                                <YAxis
                                    tick={{ fill: '#94a3b8', fontSize: 11 }}
                                    axisLine={false}
                                    tickLine={false}
                                />
                                <Tooltip
                                    contentStyle={{
                                        background: 'rgba(15,23,42,0.95)',
                                        border: '1px solid rgba(255,255,255,0.1)',
                                        borderRadius: 12,
                                        color: '#fff',
                                        fontSize: 13,
                                    }}
                                    labelStyle={{ fontWeight: 800, marginBottom: 4 }}
                                />
                                <Bar dataKey="male" name={th ? 'ชาย' : 'Male'} fill="#3b82f6" radius={[4, 4, 0, 0]} maxBarSize={40}>
                                    <LabelList dataKey="male" position="top" style={{ fill: '#3b82f6', fontWeight: 800, fontSize: 11 }} />
                                </Bar>
                                <Bar dataKey="female" name={th ? 'หญิง' : 'Female'} fill="#ec4899" radius={[4, 4, 0, 0]} maxBarSize={40}>
                                    <LabelList dataKey="female" position="top" style={{ fill: '#ec4899', fontWeight: 800, fontSize: 11 }} />
                                </Bar>
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                </div>
            )}

            {/* ─── Age Group Table ─── */}
            {ageGroupChartData.length > 0 && (
                <div style={{
                    background: '#fff',
                    border: '1px solid #e5e7eb',
                    borderRadius: 16,
                    overflow: 'hidden',
                    boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
                    marginTop: 16,
                    marginBottom: 24,
                }}>
                    <div style={{ padding: '16px 24px', borderBottom: '1px solid #f1f5f9' }}>
                        <h3 style={{ margin: 0, fontSize: 15, fontWeight: 800, color: '#0f172a' }}>
                            {th ? 'ตารางสรุปผู้เข้าเส้นชัยแยกอายุ' : 'Age Group Finisher Table'}
                        </h3>
                    </div>
                    <div style={{ overflowX: 'auto' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                            <thead>
                                <tr style={{ background: '#f8fafc' }}>
                                    <th style={{ padding: '10px 16px', textAlign: 'left', fontWeight: 700, color: '#475569', borderBottom: '2px solid #e2e8f0' }}>
                                        {th ? 'กลุ่มอายุ' : 'Age Group'}
                                    </th>
                                    <th style={{ padding: '10px 16px', textAlign: 'center', fontWeight: 700, color: '#3b82f6', borderBottom: '2px solid #e2e8f0' }}>
                                        ♂ {th ? 'ชาย' : 'Male'}
                                    </th>
                                    <th style={{ padding: '10px 16px', textAlign: 'center', fontWeight: 700, color: '#ec4899', borderBottom: '2px solid #e2e8f0' }}>
                                        ♀ {th ? 'หญิง' : 'Female'}
                                    </th>
                                    <th style={{ padding: '10px 16px', textAlign: 'center', fontWeight: 700, color: '#0f172a', borderBottom: '2px solid #e2e8f0' }}>
                                        {th ? 'รวม' : 'Total'}
                                    </th>
                                </tr>
                            </thead>
                            <tbody>
                                {ageGroupChartData.map((row, i) => (
                                    <tr key={row.ageGroup} style={{ background: i % 2 === 0 ? '#fff' : '#f8fafc' }}>
                                        <td style={{ padding: '8px 16px', fontWeight: 700, color: '#334155', borderBottom: '1px solid #f1f5f9' }}>
                                            {row.ageGroup}
                                        </td>
                                        <td style={{ padding: '8px 16px', textAlign: 'center', fontWeight: 800, color: '#3b82f6', borderBottom: '1px solid #f1f5f9' }}>
                                            {row.male}
                                        </td>
                                        <td style={{ padding: '8px 16px', textAlign: 'center', fontWeight: 800, color: '#ec4899', borderBottom: '1px solid #f1f5f9' }}>
                                            {row.female}
                                        </td>
                                        <td style={{ padding: '8px 16px', textAlign: 'center', fontWeight: 900, color: '#0f172a', borderBottom: '1px solid #f1f5f9' }}>
                                            {row.total}
                                        </td>
                                    </tr>
                                ))}
                                {/* Total row */}
                                <tr style={{ background: '#f1f5f9' }}>
                                    <td style={{ padding: '10px 16px', fontWeight: 900, color: '#0f172a', borderTop: '2px solid #e2e8f0' }}>
                                        {th ? 'รวมทั้งหมด' : 'Grand Total'}
                                    </td>
                                    <td style={{ padding: '10px 16px', textAlign: 'center', fontWeight: 900, color: '#3b82f6', borderTop: '2px solid #e2e8f0' }}>
                                        {ageGroupChartData.reduce((sum, r) => sum + r.male, 0)}
                                    </td>
                                    <td style={{ padding: '10px 16px', textAlign: 'center', fontWeight: 900, color: '#ec4899', borderTop: '2px solid #e2e8f0' }}>
                                        {ageGroupChartData.reduce((sum, r) => sum + r.female, 0)}
                                    </td>
                                    <td style={{ padding: '10px 16px', textAlign: 'center', fontWeight: 900, color: '#0f172a', borderTop: '2px solid #e2e8f0' }}>
                                        {ageGroupChartData.reduce((sum, r) => sum + r.total, 0)}
                                    </td>
                                </tr>
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {/* Loading overlay */}
            {runnersLoading && (
                <div style={{
                    position: 'fixed', bottom: 20, right: 20, zIndex: 9999,
                    background: 'rgba(15,23,42,0.9)', color: '#fff',
                    padding: '10px 20px', borderRadius: 12,
                    fontSize: 13, fontWeight: 700,
                    boxShadow: '0 8px 32px rgba(0,0,0,0.3)',
                }}>
                    ⏳ {th ? 'กำลังโหลดข้อมูล...' : 'Loading data...'}
                </div>
            )}
        </AdminLayout>
    );
}
