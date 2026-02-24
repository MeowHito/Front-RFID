'use client';

import { useEffect, useState, useCallback } from 'react';
import { useLanguage } from '@/lib/language-context';
import AdminLayout from '../AdminLayout';
import '../admin.css';

interface RaceCategory { name: string; distance?: string; }
interface Campaign { _id: string; name: string; categories?: RaceCategory[]; }
interface Runner {
    _id: string; bib: string; firstName: string; lastName: string; gender: string;
    category: string; ageGroup?: string; nationality?: string; status: string;
    netTime?: number; overallRank?: number; genderRank?: number; ageGroupRank?: number;
    startTime?: string; finishTime?: string; latestCheckpoint?: string;
}

interface Stats {
    status: { _id: string; count: number }[];
    starters: { _id: string; count: number }[];
    finishTimes: { _id: string; count: number }[];
}

function formatTime(ms?: number): string {
    if (!ms || ms <= 0) return '-';
    const totalSec = Math.floor(ms / 1000);
    const h = Math.floor(totalSec / 3600);
    const m = Math.floor((totalSec % 3600) / 60);
    const s = totalSec % 60;
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

const STATUS_LABELS: Record<string, { th: string; en: string; color: string; icon: string }> = {
    not_started: { th: 'ยังไม่เริ่ม', en: 'Not Started', color: '#94a3b8', icon: '⏳' },
    in_progress: { th: 'กำลังวิ่ง', en: 'In Progress', color: '#f59e0b', icon: '🏃' },
    finished: { th: 'เข้าเส้นชัย', en: 'Finished', color: '#22c55e', icon: '🏆' },
    dnf: { th: 'ไม่จบ', en: 'DNF', color: '#ef4444', icon: '❌' },
    dns: { th: 'ไม่ออกวิ่ง', en: 'DNS', color: '#6b7280', icon: '🚫' },
};

export default function ResultsPage() {
    const { language } = useLanguage();
    const [campaign, setCampaign] = useState<Campaign | null>(null);
    const [loading, setLoading] = useState(true);
    const [selectedCategory, setSelectedCategory] = useState('');
    const [genderFilter, setGenderFilter] = useState('all');
    const [statusFilter, setStatusFilter] = useState('finished');
    const [search, setSearch] = useState('');
    const [runners, setRunners] = useState<Runner[]>([]);
    const [total, setTotal] = useState(0);
    const [page, setPage] = useState(1);
    const [runnersLoading, setRunnersLoading] = useState(false);
    const [stats, setStats] = useState<Stats | null>(null);
    const limit = 50;

    useEffect(() => {
        async function loadFeatured() {
            try {
                const res = await fetch('/api/campaigns/featured', { cache: 'no-store' });
                if (!res.ok) throw new Error('No featured');
                const data = await res.json();
                if (data && data._id) {
                    setCampaign(data);
                    if (data.categories?.length > 0) setSelectedCategory(data.categories[0].name);
                }
            } catch { setCampaign(null); }
            finally { setLoading(false); }
        }
        loadFeatured();
    }, []);

    // Fetch runners
    const fetchRunners = useCallback(async () => {
        if (!campaign?._id || !selectedCategory) return;
        setRunnersLoading(true);
        try {
            const params = new URLSearchParams({
                campaignId: campaign._id, category: selectedCategory,
                page: String(page), limit: String(limit),
                sortBy: 'netTime', sortOrder: 'asc',
            });
            if (genderFilter !== 'all') params.append('gender', genderFilter);
            if (statusFilter !== 'all') params.append('runnerStatus', statusFilter);
            if (search) params.append('search', search);
            const res = await fetch(`/api/runners/paged?${params.toString()}`, { cache: 'no-store' });
            if (res.ok) {
                const data = await res.json();
                setRunners(data.data || []);
                setTotal(data.total || 0);
            }
        } catch { setRunners([]); setTotal(0); }
        finally { setRunnersLoading(false); }
    }, [campaign, selectedCategory, page, genderFilter, statusFilter, search]);

    useEffect(() => { fetchRunners(); }, [fetchRunners]);

    // Fetch stats
    useEffect(() => {
        if (!campaign?._id) return;
        async function loadStats() {
            try {
                const res = await fetch(`/api/runners/statistics/${campaign!._id}`, { cache: 'no-store' });
                if (res.ok) setStats(await res.json());
            } catch { /* */ }
        }
        loadStats();
    }, [campaign]);

    const totalPages = Math.ceil(total / limit);

    const statusSummary = stats?.status || [];
    const totalRunners = statusSummary.reduce((s, x) => s + x.count, 0);
    const getStatusCount = (st: string) => statusSummary.find(x => x._id === st)?.count || 0;

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
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 10, marginBottom: 16 }}>
                        {[
                            { key: 'total', label: language === 'th' ? 'ทั้งหมด' : 'Total', count: totalRunners, color: '#3c8dbc', icon: '👥' },
                            ...Object.entries(STATUS_LABELS).map(([key, val]) => ({
                                key, label: language === 'th' ? val.th : val.en, count: getStatusCount(key), color: val.color, icon: val.icon,
                            })),
                        ].map(card => (
                            <div key={card.key} style={{
                                padding: '14px 16px', borderRadius: 10, background: '#fff',
                                border: `2px solid ${card.count > 0 ? card.color + '40' : '#e5e7eb'}`,
                                transition: 'all .2s',
                            }}>
                                <div style={{ fontSize: 22, marginBottom: 2 }}>{card.icon}</div>
                                <div style={{ fontSize: 22, fontWeight: 800, color: card.color }}>{card.count}</div>
                                <div style={{ fontSize: 11, color: '#888', fontWeight: 600 }}>{card.label}</div>
                            </div>
                        ))}
                    </div>

                    {/* Filters */}
                    <div className="content-box" style={{ padding: '12px 16px', marginBottom: 16 }}>
                        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                            <select className="form-input" value={selectedCategory} onChange={e => { setSelectedCategory(e.target.value); setPage(1); }}
                                style={{ width: 200, fontSize: 13, padding: '6px 10px' }}>
                                {(campaign.categories || []).map((cat, i) => (
                                    <option key={`${cat.name}-${i}`} value={cat.name}>{cat.name}{cat.distance ? ` (${cat.distance})` : ''}</option>
                                ))}
                            </select>
                            <select className="form-input" value={genderFilter} onChange={e => { setGenderFilter(e.target.value); setPage(1); }}
                                style={{ width: 100, fontSize: 13, padding: '6px 10px' }}>
                                <option value="all">{language === 'th' ? 'ทุกเพศ' : 'All'}</option>
                                <option value="M">{language === 'th' ? 'ชาย' : 'Male'}</option>
                                <option value="F">{language === 'th' ? 'หญิง' : 'Female'}</option>
                            </select>
                            <select className="form-input" value={statusFilter} onChange={e => { setStatusFilter(e.target.value); setPage(1); }}
                                style={{ width: 140, fontSize: 13, padding: '6px 10px' }}>
                                <option value="all">{language === 'th' ? 'ทุกสถานะ' : 'All Status'}</option>
                                {Object.entries(STATUS_LABELS).map(([key, val]) => (
                                    <option key={key} value={key}>{language === 'th' ? val.th : val.en}</option>
                                ))}
                            </select>
                            <input
                                className="form-input"
                                placeholder={language === 'th' ? '🔍 ค้นหา BIB / ชื่อ...' : '🔍 Search BIB / name...'}
                                value={search}
                                onChange={e => { setSearch(e.target.value); setPage(1); }}
                                style={{ flex: 1, minWidth: 160, fontSize: 13, padding: '6px 10px' }}
                            />
                        </div>
                    </div>

                    {/* Results Table */}
                    <div className="content-box" style={{ padding: 0 }}>
                        {runnersLoading ? (
                            <div style={{ padding: 30, textAlign: 'center', color: '#999' }}>Loading...</div>
                        ) : runners.length === 0 ? (
                            <div style={{ padding: 40, textAlign: 'center' }}>
                                <div style={{ fontSize: 48, marginBottom: 12 }}>🏆</div>
                                <p style={{ color: '#999', fontSize: 14 }}>
                                    {language === 'th' ? 'ไม่พบข้อมูล' : 'No results found'}
                                </p>
                            </div>
                        ) : (
                            <div style={{ overflowX: 'auto' }}>
                                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                                    <thead>
                                        <tr style={{ background: '#f8fafc' }}>
                                            <th style={{ padding: '10px 12px', textAlign: 'center', fontWeight: 700, fontSize: 11, color: '#666', borderBottom: '2px solid #e5e7eb', minWidth: 50 }}>#</th>
                                            <th style={{ padding: '10px 12px', textAlign: 'left', fontWeight: 700, fontSize: 11, color: '#666', borderBottom: '2px solid #e5e7eb' }}>BIB</th>
                                            <th style={{ padding: '10px 12px', textAlign: 'left', fontWeight: 700, fontSize: 11, color: '#666', borderBottom: '2px solid #e5e7eb', minWidth: 180 }}>{language === 'th' ? 'ชื่อ' : 'Name'}</th>
                                            <th style={{ padding: '10px 12px', textAlign: 'center', fontWeight: 700, fontSize: 11, color: '#666', borderBottom: '2px solid #e5e7eb' }}>{language === 'th' ? 'เพศ' : 'Gender'}</th>
                                            <th style={{ padding: '10px 12px', textAlign: 'center', fontWeight: 700, fontSize: 11, color: '#666', borderBottom: '2px solid #e5e7eb' }}>{language === 'th' ? 'กลุ่มอายุ' : 'Age Group'}</th>
                                            <th style={{ padding: '10px 12px', textAlign: 'center', fontWeight: 700, fontSize: 11, color: '#666', borderBottom: '2px solid #e5e7eb' }}>{language === 'th' ? 'เวลา' : 'Time'}</th>
                                            <th style={{ padding: '10px 12px', textAlign: 'center', fontWeight: 700, fontSize: 11, color: '#666', borderBottom: '2px solid #e5e7eb' }}>{language === 'th' ? 'สถานะ' : 'Status'}</th>
                                            <th style={{ padding: '10px 12px', textAlign: 'center', fontWeight: 700, fontSize: 11, color: '#666', borderBottom: '2px solid #e5e7eb' }}>{language === 'th' ? 'อันดับรวม' : 'Overall'}</th>
                                            <th style={{ padding: '10px 12px', textAlign: 'center', fontWeight: 700, fontSize: 11, color: '#666', borderBottom: '2px solid #e5e7eb' }}>{language === 'th' ? 'อันดับเพศ' : 'Gender'}</th>
                                            <th style={{ padding: '10px 12px', textAlign: 'center', fontWeight: 700, fontSize: 11, color: '#666', borderBottom: '2px solid #e5e7eb' }}>{language === 'th' ? 'อันดับอายุ' : 'Age'}</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {runners.map((r, i) => {
                                            const st = STATUS_LABELS[r.status] || STATUS_LABELS.not_started;
                                            return (
                                                <tr key={r._id} style={{ borderBottom: '1px solid #f3f4f6', transition: 'background .15s' }}
                                                    onMouseOver={e => (e.currentTarget.style.background = '#f8fafc')}
                                                    onMouseOut={e => (e.currentTarget.style.background = 'transparent')}>
                                                    <td style={{ padding: '8px 12px', textAlign: 'center', color: '#999', fontSize: 12 }}>{(page - 1) * limit + i + 1}</td>
                                                    <td style={{ padding: '8px 12px', fontWeight: 700 }}>{r.bib}</td>
                                                    <td style={{ padding: '8px 12px' }}>{r.firstName} {r.lastName}</td>
                                                    <td style={{ padding: '8px 12px', textAlign: 'center' }}>
                                                        <span style={{ background: r.gender === 'M' ? '#dbeafe' : '#fce7f3', color: r.gender === 'M' ? '#2563eb' : '#db2777', padding: '2px 8px', borderRadius: 10, fontSize: 11, fontWeight: 600 }}>
                                                            {r.gender}
                                                        </span>
                                                    </td>
                                                    <td style={{ padding: '8px 12px', textAlign: 'center', fontSize: 12 }}>{r.ageGroup || '-'}</td>
                                                    <td style={{ padding: '8px 12px', textAlign: 'center', fontFamily: 'monospace', fontWeight: 600, color: r.netTime ? '#16a34a' : '#999' }}>
                                                        {formatTime(r.netTime)}
                                                    </td>
                                                    <td style={{ padding: '8px 12px', textAlign: 'center' }}>
                                                        <span style={{ background: st.color + '18', color: st.color, padding: '3px 10px', borderRadius: 10, fontSize: 11, fontWeight: 600 }}>
                                                            {st.icon} {language === 'th' ? st.th : st.en}
                                                        </span>
                                                    </td>
                                                    <td style={{ padding: '8px 12px', textAlign: 'center', fontWeight: 700 }}>{r.overallRank || '-'}</td>
                                                    <td style={{ padding: '8px 12px', textAlign: 'center' }}>{r.genderRank || '-'}</td>
                                                    <td style={{ padding: '8px 12px', textAlign: 'center' }}>{r.ageGroupRank || '-'}</td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        )}

                        {/* Pagination */}
                        {totalPages > 1 && (
                            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 8, padding: '12px 16px', borderTop: '1px solid #f3f4f6' }}>
                                <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page <= 1}
                                    style={{ padding: '4px 12px', borderRadius: 4, border: '1px solid #e5e7eb', background: '#fff', cursor: page <= 1 ? 'not-allowed' : 'pointer', fontSize: 12, opacity: page <= 1 ? 0.5 : 1 }}>
                                    ←
                                </button>
                                <span style={{ fontSize: 12, color: '#666' }}>
                                    {page} / {totalPages} ({total} {language === 'th' ? 'รายการ' : 'records'})
                                </span>
                                <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page >= totalPages}
                                    style={{ padding: '4px 12px', borderRadius: 4, border: '1px solid #e5e7eb', background: '#fff', cursor: page >= totalPages ? 'not-allowed' : 'pointer', fontSize: 12, opacity: page >= totalPages ? 0.5 : 1 }}>
                                    →
                                </button>
                            </div>
                        )}
                    </div>
                </>
            )}
        </AdminLayout>
    );
}
