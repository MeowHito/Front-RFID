'use client';

import { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import { useLanguage } from '@/lib/language-context';
import AdminLayout from '../AdminLayout';
import '../admin.css';

interface RaceCategory { name: string; distance?: string; }
interface Campaign { _id: string; name: string; categories?: RaceCategory[]; }

interface PasstimeRunner {
    _id: string;
    bib: string;
    firstName: string;
    lastName: string;
    firstNameTh?: string;
    lastNameTh?: string;
    gender: string;
    category: string;
    ageGroup?: string;
    nationality?: string;
    status: string;
    netTime?: number;
    gunTime?: number;
    overallRank?: number;
    genderRank?: number;
    categoryRank?: number;
    latestCheckpoint?: string;
    passedCount?: number;
    scanTime?: string;
    netTimeStr?: string;
    gunTimeStr?: string;
    netPace?: string;
    gunPace?: string;
    statusCheckpoint?: string;
    statusNote?: string;
}

interface Checkpoint {
    _id: string;
    name: string;
    orderNum?: number;
    type?: string;
}

// Per-bib checkpoint scan times: bib → checkpoint → scanTime (ISO)
type CheckpointTimingMap = Record<string, Record<string, { scanTime: string; elapsedTime?: number; splitTime?: number; netTime?: number }>>;

function formatTime(ms?: number): string {
    if (!ms || ms <= 0) return '-';
    const totalSec = Math.floor(ms / 1000);
    const h = Math.floor(totalSec / 3600);
    const m = Math.floor((totalSec % 3600) / 60);
    const s = totalSec % 60;
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

function formatClockTime(iso?: string): string {
    if (!iso) return '-';
    const d = new Date(iso);
    if (isNaN(d.getTime())) return '-';
    const hh = d.getHours().toString().padStart(2, '0');
    const mm = d.getMinutes().toString().padStart(2, '0');
    const ss = d.getSeconds().toString().padStart(2, '0');
    return `${hh}:${mm}:${ss}`;
}

const STATUS_LABELS: Record<string, { th: string; en: string; color: string; icon: string }> = {
    not_started: { th: 'ยังไม่เริ่ม', en: 'Not Started', color: '#94a3b8', icon: '⏳' },
    in_progress: { th: 'กำลังวิ่ง', en: 'In Progress', color: '#f59e0b', icon: '🏃' },
    finished: { th: 'เข้าเส้นชัย', en: 'Finished', color: '#22c55e', icon: '🏆' },
    dnf: { th: 'ไม่จบ', en: 'DNF', color: '#ef4444', icon: '❌' },
    dns: { th: 'ไม่ออกวิ่ง', en: 'DNS', color: '#6b7280', icon: '🚫' },
};

const AUTO_REFRESH_INTERVAL = 15_000;

export default function ResultsPage() {
    const { language } = useLanguage();
    const [campaign, setCampaign] = useState<Campaign | null>(null);
    const [loading, setLoading] = useState(true);
    const [selectedCategory, setSelectedCategory] = useState('all');
    const [genderFilter, setGenderFilter] = useState('all');
    const [statusFilter, setStatusFilter] = useState('all');
    const [search, setSearch] = useState('');
    const [debouncedSearch, setDebouncedSearch] = useState('');
    const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const [runners, setRunners] = useState<PasstimeRunner[]>([]);
    const [checkpoints, setCheckpoints] = useState<Checkpoint[]>([]);
    const [cpTimingMap, setCpTimingMap] = useState<CheckpointTimingMap>({});
    const [runnersLoading, setRunnersLoading] = useState(false);
    const [lastRefresh, setLastRefresh] = useState<Date | null>(null);
    const [autoRefresh, setAutoRefresh] = useState(true);
    const refreshTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

    // ── Load featured campaign ──
    useEffect(() => {
        (async () => {
            try {
                const res = await fetch('/api/campaigns/featured', { cache: 'no-store' });
                if (!res.ok) throw new Error('No featured');
                const data = await res.json();
                if (data?._id) setCampaign(data);
            } catch { setCampaign(null); }
            finally { setLoading(false); }
        })();
    }, []);

    // ── Load checkpoints when campaign is set ──
    useEffect(() => {
        if (!campaign?._id) return;
        (async () => {
            try {
                const res = await fetch(`/api/checkpoints/campaign/${campaign._id}`, { cache: 'no-store' });
                if (!res.ok) return;
                const data: Checkpoint[] = await res.json();
                const sorted = [...data].sort((a, b) => (a.orderNum ?? 999) - (b.orderNum ?? 999));
                setCheckpoints(sorted);
            } catch { setCheckpoints([]); }
        })();
    }, [campaign?._id]);

    // ── Fetch all runners via passtime API + timing per checkpoint ──
    const fetchAllData = useCallback(async (silent = false) => {
        if (!campaign?._id) return;
        if (!silent) setRunnersLoading(true);
        try {
            // 1) Fetch runners from passtime API
            const runnersRes = await fetch(`/api/runners/passtime?id=${campaign._id}`, { cache: 'no-store' });
            let runnersPayload: any = {};
            try { runnersPayload = await runnersRes.json(); } catch { runnersPayload = {}; }
            // DEBUG: log actual response shape
            console.log('[admin/results] passtime response status:', runnersRes.status, 'payload keys:', runnersPayload ? Object.keys(runnersPayload) : 'null', 'data type:', typeof runnersPayload?.data, 'data.data type:', typeof runnersPayload?.data?.data, 'isArray(data.data):', Array.isArray(runnersPayload?.data?.data), 'isArray(data):', Array.isArray(runnersPayload?.data));
            // Backend successResponse wraps as { status, data: { data: [...], total } }
            let runnerList: PasstimeRunner[] = [];
            if (Array.isArray(runnersPayload)) {
                runnerList = runnersPayload;
            } else if (Array.isArray(runnersPayload?.data?.data)) {
                runnerList = runnersPayload.data.data;
            } else if (Array.isArray(runnersPayload?.data)) {
                runnerList = runnersPayload.data;
            }
            setRunners(runnerList);

            // 2) Fetch timing per checkpoint (parallel)
            if (checkpoints.length > 0) {
                const cpResults = await Promise.all(
                    checkpoints.map(async (cp) => {
                        try {
                            const res = await fetch(`/api/timing/checkpoint-by-campaign/${campaign._id}?cp=${encodeURIComponent(cp.name)}`, { cache: 'no-store' });
                            const records: Array<{ bib: string; scanTime?: string; elapsedTime?: number; splitTime?: number; netTime?: number }> = await res.json();
                            return { cpName: cp.name, records };
                        } catch {
                            return { cpName: cp.name, records: [] };
                        }
                    })
                );
                const newMap: CheckpointTimingMap = {};
                for (const { cpName, records } of cpResults) {
                    for (const rec of records) {
                        if (!rec.bib) continue;
                        if (!newMap[rec.bib]) newMap[rec.bib] = {};
                        newMap[rec.bib][cpName] = {
                            scanTime: rec.scanTime || '',
                            elapsedTime: rec.elapsedTime,
                            splitTime: rec.splitTime,
                            netTime: rec.netTime,
                        };
                    }
                }
                setCpTimingMap(newMap);
            }

            setLastRefresh(new Date());
        } catch (err) {
            console.error('Failed to fetch results data:', err);
        } finally {
            if (!silent) setRunnersLoading(false);
        }
    }, [campaign?._id, checkpoints]);

    // ── Initial load + refresh when deps change ──
    useEffect(() => {
        if (campaign?._id && checkpoints.length >= 0) fetchAllData(false);
    }, [fetchAllData]);

    // ── Auto-refresh ──
    useEffect(() => {
        if (refreshTimerRef.current) clearInterval(refreshTimerRef.current);
        if (autoRefresh && campaign?._id) {
            refreshTimerRef.current = setInterval(() => fetchAllData(true), AUTO_REFRESH_INTERVAL);
        }
        return () => { if (refreshTimerRef.current) clearInterval(refreshTimerRef.current); };
    }, [autoRefresh, fetchAllData, campaign?._id]);

    // ── Debounce search ──
    useEffect(() => {
        if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
        searchTimerRef.current = setTimeout(() => setDebouncedSearch(search), 250);
        return () => { if (searchTimerRef.current) clearTimeout(searchTimerRef.current); };
    }, [search]);

    // ── Filter + sort runners ──
    const filteredRunners = useMemo(() => {
        const safeRunners = Array.isArray(runners) ? runners : [];
        let list = [...safeRunners];

        // Category filter
        if (selectedCategory !== 'all') {
            list = list.filter(r => r.category === selectedCategory);
        }
        // Gender filter
        if (genderFilter !== 'all') {
            list = list.filter(r => (r.gender || '').toUpperCase() === genderFilter.toUpperCase());
        }
        // Status filter
        if (statusFilter !== 'all') {
            list = list.filter(r => r.status === statusFilter);
        }
        // Search filter
        if (debouncedSearch) {
            const q = debouncedSearch.toLowerCase().trim();
            list = list.filter(r =>
                (r.bib || '').toLowerCase().includes(q) ||
                `${r.firstName} ${r.lastName}`.toLowerCase().includes(q) ||
                `${r.firstNameTh || ''} ${r.lastNameTh || ''}`.toLowerCase().includes(q)
            );
        }

        // Sort: finished first (by netTime/gunTime), then in_progress (by passedCount desc), then rest
        list.sort((a, b) => {
            const statusOrder: Record<string, number> = { finished: 0, in_progress: 1, not_started: 2, dnf: 3, dns: 4, dq: 5 };
            const aOrd = statusOrder[a.status] ?? 9;
            const bOrd = statusOrder[b.status] ?? 9;
            if (aOrd !== bOrd) return aOrd - bOrd;
            if (a.status === 'finished' && b.status === 'finished') {
                const aT = a.netTime || a.gunTime || 0;
                const bT = b.netTime || b.gunTime || 0;
                if (aT > 0 && bT > 0) return aT - bT;
                if (aT > 0) return -1;
                if (bT > 0) return 1;
            }
            if (a.status === 'in_progress' && b.status === 'in_progress') {
                const aPassed = a.passedCount ?? 0;
                const bPassed = b.passedCount ?? 0;
                if (aPassed !== bPassed) return bPassed - aPassed;
            }
            return 0;
        });

        return list;
    }, [runners, selectedCategory, genderFilter, statusFilter, debouncedSearch]);

    // ── Status counts from runner list ──
    const statusCounts = useMemo(() => {
        const counts: Record<string, number> = {};
        const safe = Array.isArray(runners) ? runners : [];
        safe.forEach(r => { counts[r.status] = (counts[r.status] || 0) + 1; });
        return counts;
    }, [runners]);
    const totalRunners = Array.isArray(runners) ? runners.length : 0;
    const getStatusCount = (st: string) => statusCounts[st] || 0;

    // ── Unique categories from runners ──
    const categories = useMemo(() => {
        const cats = new Set<string>();
        const safe = Array.isArray(runners) ? runners : [];
        safe.forEach(r => { if (r.category) cats.add(r.category); });
        return Array.from(cats).sort();
    }, [runners]);

    const thStyle = { padding: '8px 10px', textAlign: 'center' as const, fontWeight: 700, fontSize: 11, color: '#555', borderBottom: '2px solid #e5e7eb', whiteSpace: 'nowrap' as const };
    const tdStyle = { padding: '6px 10px', borderBottom: '1px solid #f3f4f6', fontSize: 12 };

    return (
        <AdminLayout breadcrumbItems={[{ label: 'ผลการแข่งขัน', labelEn: 'Results' }]}>
            {loading ? (
                <div className="content-box" style={{ padding: 30, textAlign: 'center', color: '#999' }}>
                    {language === 'th' ? 'กำลังโหลด...' : 'Loading...'}
                </div>
            ) : !campaign ? (
                <div className="content-box" style={{ padding: 24 }}>
                    <p style={{ color: '#666', fontSize: 14 }}>
                        {language === 'th' ? 'ยังไม่ได้เลือกกิจกรรมหลัก' : 'No featured campaign selected.'}
                    </p>
                    <a href="/admin/events" style={{ display: 'inline-block', marginTop: 8, padding: '6px 16px', borderRadius: 6, background: '#3b82f6', color: '#fff', fontWeight: 600, textDecoration: 'none', fontSize: 13 }}>
                        {language === 'th' ? 'ไปหน้าอีเวนต์' : 'Go to Events'}
                    </a>
                </div>
            ) : (
                <>
                    {/* Status Summary Cards */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 10, marginBottom: 16 }}>
                        {[
                            { key: 'total', label: language === 'th' ? 'ทั้งหมด' : 'Total', count: totalRunners, color: '#3c8dbc', icon: '👥' },
                            ...Object.entries(STATUS_LABELS).map(([key, val]) => ({
                                key, label: language === 'th' ? val.th : val.en, count: getStatusCount(key), color: val.color, icon: val.icon,
                            })),
                        ].map(card => (
                            <div key={card.key} style={{
                                padding: '12px 14px', borderRadius: 10, background: '#fff',
                                border: `2px solid ${card.count > 0 ? card.color + '40' : '#e5e7eb'}`,
                                transition: 'all .2s',
                            }}>
                                <div style={{ fontSize: 20, marginBottom: 2 }}>{card.icon}</div>
                                <div style={{ fontSize: 20, fontWeight: 800, color: card.color }}>{card.count}</div>
                                <div style={{ fontSize: 11, color: '#888', fontWeight: 600 }}>{card.label}</div>
                            </div>
                        ))}
                    </div>

                    {/* Filters + refresh controls */}
                    <div className="content-box" style={{ padding: '10px 14px', marginBottom: 14 }}>
                        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                            <select className="form-input" value={selectedCategory} onChange={e => setSelectedCategory(e.target.value)}
                                style={{ width: 180, fontSize: 12, padding: '5px 8px' }}>
                                <option value="all">{language === 'th' ? 'ทุกประเภท' : 'All Categories'}</option>
                                {categories.map(cat => (
                                    <option key={cat} value={cat}>{cat}</option>
                                ))}
                            </select>
                            <select className="form-input" value={genderFilter} onChange={e => setGenderFilter(e.target.value)}
                                style={{ width: 90, fontSize: 12, padding: '5px 8px' }}>
                                <option value="all">{language === 'th' ? 'ทุกเพศ' : 'All'}</option>
                                <option value="M">{language === 'th' ? 'ชาย' : 'M'}</option>
                                <option value="F">{language === 'th' ? 'หญิง' : 'F'}</option>
                            </select>
                            <select className="form-input" value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
                                style={{ width: 130, fontSize: 12, padding: '5px 8px' }}>
                                <option value="all">{language === 'th' ? 'ทุกสถานะ' : 'All Status'}</option>
                                {Object.entries(STATUS_LABELS).map(([key, val]) => (
                                    <option key={key} value={key}>{language === 'th' ? val.th : val.en}</option>
                                ))}
                            </select>
                            <input
                                className="form-input"
                                placeholder={language === 'th' ? '🔍 ค้นหา BIB / ชื่อ...' : '🔍 Search BIB / name...'}
                                value={search}
                                onChange={e => setSearch(e.target.value)}
                                style={{ flex: 1, minWidth: 140, fontSize: 12, padding: '5px 8px' }}
                            />
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginLeft: 'auto' }}>
                                <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: '#666', cursor: 'pointer', userSelect: 'none' }}>
                                    <input type="checkbox" checked={autoRefresh} onChange={e => setAutoRefresh(e.target.checked)} style={{ accentColor: '#3b82f6' }} />
                                    {language === 'th' ? 'รีเฟรชอัตโนมัติ' : 'Auto-refresh'}
                                </label>
                                <button onClick={() => fetchAllData(false)}
                                    style={{ padding: '4px 10px', borderRadius: 4, border: '1px solid #d1d5db', background: '#fff', fontSize: 11, cursor: 'pointer', fontWeight: 600, color: '#3b82f6' }}>
                                    ↻ {language === 'th' ? 'รีเฟรช' : 'Refresh'}
                                </button>
                                {lastRefresh && (
                                    <span style={{ fontSize: 10, color: '#999' }}>
                                        {lastRefresh.toLocaleTimeString()}
                                    </span>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* Main Passtime Table */}
                    <div className="content-box" style={{ padding: 0 }}>
                        {runnersLoading ? (
                            <div style={{ padding: 30, textAlign: 'center', color: '#999' }}>
                                {language === 'th' ? 'กำลังโหลดข้อมูล...' : 'Loading data...'}
                            </div>
                        ) : filteredRunners.length === 0 ? (
                            <div style={{ padding: 40, textAlign: 'center' }}>
                                <div style={{ fontSize: 48, marginBottom: 12 }}>🏆</div>
                                <p style={{ color: '#999', fontSize: 14 }}>
                                    {language === 'th' ? 'ไม่พบข้อมูล' : 'No results found'}
                                </p>
                            </div>
                        ) : (
                            <div style={{ overflowX: 'auto' }}>
                                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                                    <thead>
                                        <tr style={{ background: '#f8fafc' }}>
                                            <th style={{ ...thStyle, minWidth: 36, position: 'sticky', left: 0, background: '#f8fafc', zIndex: 2 }}>#</th>
                                            <th style={{ ...thStyle, minWidth: 54, position: 'sticky', left: 36, background: '#f8fafc', zIndex: 2, textAlign: 'left' }}>BIB</th>
                                            <th style={{ ...thStyle, minWidth: 140, textAlign: 'left' }}>{language === 'th' ? 'ชื่อ' : 'Name'}</th>
                                            <th style={{ ...thStyle, minWidth: 36 }}>{language === 'th' ? 'เพศ' : 'G'}</th>
                                            <th style={{ ...thStyle, minWidth: 70 }}>{language === 'th' ? 'ประเภท' : 'Cat'}</th>
                                            <th style={{ ...thStyle, minWidth: 50 }}>{language === 'th' ? 'สถานะ' : 'Status'}</th>
                                            <th style={{ ...thStyle, minWidth: 36 }}>{language === 'th' ? '#รวม' : '#OA'}</th>
                                            <th style={{ ...thStyle, minWidth: 36 }}>{language === 'th' ? '#เพศ' : '#G'}</th>
                                            <th style={{ ...thStyle, minWidth: 70 }}>{language === 'th' ? 'เวลาสุทธิ' : 'Net Time'}</th>
                                            {checkpoints.map(cp => (
                                                <th key={cp._id} style={{ ...thStyle, minWidth: 80, background: '#eef2ff' }}>
                                                    {cp.name}
                                                </th>
                                            ))}
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {filteredRunners.map((r, idx) => {
                                            const st = STATUS_LABELS[r.status] || STATUS_LABELS.not_started;
                                            const bibTimings = cpTimingMap[r.bib] || {};
                                            return (
                                                <tr key={r._id || `${r.bib}-${idx}`}
                                                    style={{ borderBottom: '1px solid #f3f4f6', transition: 'background .12s' }}
                                                    onMouseOver={e => (e.currentTarget.style.background = '#f8fafc')}
                                                    onMouseOut={e => (e.currentTarget.style.background = 'transparent')}
                                                >
                                                    <td style={{ ...tdStyle, textAlign: 'center', color: '#aaa', fontSize: 11, position: 'sticky', left: 0, background: '#fff', zIndex: 1 }}>{idx + 1}</td>
                                                    <td style={{ ...tdStyle, fontWeight: 700, position: 'sticky', left: 36, background: '#fff', zIndex: 1 }}>{r.bib}</td>
                                                    <td style={{ ...tdStyle, whiteSpace: 'nowrap' }}>
                                                        {language === 'th' && r.firstNameTh ? `${r.firstNameTh} ${r.lastNameTh || ''}` : `${r.firstName} ${r.lastName}`}
                                                    </td>
                                                    <td style={{ ...tdStyle, textAlign: 'center' }}>
                                                        <span style={{ color: r.gender === 'M' ? '#2563eb' : '#db2777', fontWeight: 700, fontSize: 13 }}>
                                                            {r.gender === 'F' ? '♀' : '♂'}
                                                        </span>
                                                    </td>
                                                    <td style={{ ...tdStyle, textAlign: 'center', fontSize: 11 }}>{r.category || '-'}</td>
                                                    <td style={{ ...tdStyle, textAlign: 'center' }}>
                                                        <span style={{
                                                            display: 'inline-block',
                                                            padding: '2px 6px', borderRadius: 4, fontSize: 10, fontWeight: 700,
                                                            color: '#fff', background: st.color, lineHeight: 1.3,
                                                        }}>
                                                            {language === 'th' ? st.th : st.en}
                                                        </span>
                                                    </td>
                                                    <td style={{ ...tdStyle, textAlign: 'center', fontWeight: 700, fontSize: 11 }}>{r.overallRank || '-'}</td>
                                                    <td style={{ ...tdStyle, textAlign: 'center', fontSize: 11 }}>{r.genderRank || '-'}</td>
                                                    <td style={{ ...tdStyle, textAlign: 'center', fontFamily: 'monospace', fontWeight: 600, color: r.netTime ? '#16a34a' : '#aaa' }}>
                                                        {formatTime(r.netTime || r.gunTime)}
                                                    </td>
                                                    {checkpoints.map(cp => {
                                                        const timing = bibTimings[cp.name];
                                                        const hasTiming = Boolean(timing?.scanTime);
                                                        return (
                                                            <td key={cp._id} style={{
                                                                ...tdStyle,
                                                                textAlign: 'center',
                                                                fontFamily: 'monospace',
                                                                fontSize: 11,
                                                                color: hasTiming ? '#0f172a' : '#d1d5db',
                                                                background: hasTiming ? '#f0fdf4' : 'transparent',
                                                                whiteSpace: 'nowrap',
                                                            }}>
                                                                {hasTiming ? (
                                                                    <div>
                                                                        <div style={{ fontWeight: 600 }}>{formatClockTime(timing!.scanTime)}</div>
                                                                        {timing!.elapsedTime && timing!.elapsedTime > 0 && (
                                                                            <div style={{ fontSize: 9, color: '#64748b', marginTop: 1 }}>
                                                                                {formatTime(timing!.elapsedTime)}
                                                                            </div>
                                                                        )}
                                                                    </div>
                                                                ) : '-'}
                                                            </td>
                                                        );
                                                    })}
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        )}

                        {/* Count footer */}
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 14px', borderTop: '1px solid #f3f4f6', fontSize: 11, color: '#888' }}>
                            <span>
                                {language === 'th'
                                    ? `แสดง ${filteredRunners.length} จาก ${totalRunners} คน`
                                    : `Showing ${filteredRunners.length} of ${totalRunners} runners`}
                            </span>
                            <span>
                                {checkpoints.length > 0 && (
                                    language === 'th'
                                        ? `${checkpoints.length} Checkpoint`
                                        : `${checkpoints.length} Checkpoints`
                                )}
                            </span>
                        </div>
                    </div>
                </>
            )}
        </AdminLayout>
    );
}
