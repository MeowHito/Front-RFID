'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import { useLanguage } from '@/lib/language-context';
import AdminLayout from '../AdminLayout';
import '../admin.css';

interface RaceCategory { name: string; distance?: string; }
interface Campaign { _id: string; name: string; categories?: RaceCategory[]; }

interface TimingRecord {
    _id: string; bib: string; checkpoint: string; scanTime: string;
    rfidTag?: string; splitTime?: number; elapsedTime?: number; order?: number;
    runnerId: string;
}

interface StatusCount { _id: string; count: number; }

function formatTime(ms?: number): string {
    if (!ms || ms <= 0) return '-';
    const totalSec = Math.floor(ms / 1000);
    const h = Math.floor(totalSec / 3600);
    const m = Math.floor((totalSec % 3600) / 60);
    const s = totalSec % 60;
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

function timeAgo(dateStr: string): string {
    const diff = Date.now() - new Date(dateStr).getTime();
    if (diff < 60_000) return `${Math.floor(diff / 1000)}s ago`;
    if (diff < 3600_000) return `${Math.floor(diff / 60_000)}m ago`;
    if (diff < 86400_000) return `${Math.floor(diff / 3600_000)}h ago`;
    return new Date(dateStr).toLocaleString('th-TH');
}

const STATUS_CONFIG: Record<string, { th: string; en: string; color: string; icon: string }> = {
    not_started: { th: 'ยังไม่เริ่ม', en: 'Not Started', color: '#94a3b8', icon: '⏳' },
    in_progress: { th: 'กำลังวิ่ง', en: 'Running', color: '#f59e0b', icon: '🏃' },
    finished: { th: 'เข้าเส้นชัย', en: 'Finished', color: '#22c55e', icon: '🏁' },
    dnf: { th: 'ไม่จบ', en: 'DNF', color: '#ef4444', icon: '❌' },
    dns: { th: 'ไม่เริ่ม', en: 'DNS', color: '#6b7280', icon: '🚫' },
};

export default function LiveMonitorPage() {
    const { language } = useLanguage();
    const [campaign, setCampaign] = useState<Campaign | null>(null);
    const [loading, setLoading] = useState(true);
    const [recentScans, setRecentScans] = useState<TimingRecord[]>([]);
    const [statusCounts, setStatusCounts] = useState<StatusCount[]>([]);
    const [scanning, setScanning] = useState(false);
    const [lastRefresh, setLastRefresh] = useState<Date>(new Date());
    const [autoRefresh, setAutoRefresh] = useState(true);
    const intervalRef = useRef<NodeJS.Timeout | null>(null);
    const [selectedCategory, setSelectedCategory] = useState('all');
    const [runnerMap, setRunnerMap] = useState<Record<string, any>>({});

    useEffect(() => {
        async function loadFeatured() {
            try {
                const res = await fetch('/api/campaigns/featured', { cache: 'no-store' });
                if (!res.ok) throw new Error('No featured');
                const data = await res.json();
                if (data && data._id) setCampaign(data);
            } catch { setCampaign(null); }
            finally { setLoading(false); }
        }
        loadFeatured();
    }, []);

    const fetchData = useCallback(async () => {
        if (!campaign?._id) return;
        setScanning(true);
        try {
            // Fetch recent timing records
            const timingRes = await fetch(`/api/timing/event/${campaign._id}`, { cache: 'no-store' });
            if (timingRes.ok) {
                const records = await timingRes.json();
                setRecentScans(records.slice(0, 50));
                // Fetch runner info for the records
                const runnerIds = [...new Set(records.map((r: TimingRecord) => r.runnerId).filter(Boolean))];
                const newMap: Record<string, any> = { ...runnerMap };
                for (const rid of runnerIds) {
                    if (!newMap[rid as string]) {
                        try {
                            const rRes = await fetch(`/api/runners/${rid}`, { cache: 'no-store' });
                            if (rRes.ok) newMap[rid as string] = await rRes.json();
                        } catch { /* skip */ }
                    }
                }
                setRunnerMap(newMap);
            }

            // Fetch status counts
            const statusRes = await fetch(`/api/runners/status/${campaign._id}`, { cache: 'no-store' });
            if (statusRes.ok) {
                const data = await statusRes.json();
                setStatusCounts(Array.isArray(data) ? data : []);
            }
        } catch { /* ignore */ }
        finally {
            setScanning(false);
            setLastRefresh(new Date());
        }
    }, [campaign, runnerMap]);

    // Initial load + auto-refresh
    useEffect(() => { if (campaign?._id) fetchData(); }, [campaign?._id]);

    useEffect(() => {
        if (autoRefresh && campaign?._id) {
            intervalRef.current = setInterval(fetchData, 10000); // 10s
        }
        return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
    }, [autoRefresh, campaign?._id, fetchData]);

    const totalRunners = statusCounts.reduce((s, x) => s + x.count, 0);
    const getCount = (st: string) => statusCounts.find(x => x._id === st)?.count || 0;

    const filteredScans = selectedCategory === 'all'
        ? recentScans
        : recentScans.filter(sc => {
            const runner = runnerMap[sc.runnerId];
            return runner?.category === selectedCategory;
        });

    return (
        <AdminLayout breadcrumbItems={[{ label: 'Live Monitor', labelEn: 'Live Monitor' }]}>
            {loading ? (
                <div className="content-box" style={{ padding: 30, textAlign: 'center', color: '#999' }}>
                    {language === 'th' ? 'กำลังโหลด...' : 'Loading...'}
                </div>
            ) : !campaign ? (
                <div className="content-box" style={{ padding: 24 }}>
                    <p style={{ color: '#666', fontSize: 14 }}>
                        {language === 'th' ? 'ยังไม่ได้เลือกกิจกรรมหลัก' : 'No featured campaign selected.'}
                    </p>
                </div>
            ) : (
                <>
                    {/* Status Cards */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(135px, 1fr))', gap: 10, marginBottom: 16 }}>
                        <div style={{ padding: '16px 14px', borderRadius: 10, background: 'linear-gradient(135deg, #3c8dbc22, #3c8dbc08)', border: '2px solid #3c8dbc30' }}>
                            <div style={{ fontSize: 24, fontWeight: 800, color: '#3c8dbc' }}>{totalRunners}</div>
                            <div style={{ fontSize: 11, color: '#666', fontWeight: 600 }}>{language === 'th' ? '👥 ทั้งหมด' : '👥 Total'}</div>
                        </div>
                        {Object.entries(STATUS_CONFIG).map(([key, cfg]) => (
                            <div key={key} style={{
                                padding: '16px 14px', borderRadius: 10,
                                background: `linear-gradient(135deg, ${cfg.color}12, ${cfg.color}06)`,
                                border: `2px solid ${cfg.color}25`,
                            }}>
                                <div style={{ fontSize: 24, fontWeight: 800, color: cfg.color }}>{getCount(key)}</div>
                                <div style={{ fontSize: 11, color: '#666', fontWeight: 600 }}>{cfg.icon} {language === 'th' ? cfg.th : cfg.en}</div>
                            </div>
                        ))}
                    </div>

                    {/* Progress Bar */}
                    {totalRunners > 0 && (
                        <div style={{ marginBottom: 16, borderRadius: 10, overflow: 'hidden', background: '#e5e7eb', height: 20, position: 'relative' }}>
                            <div style={{ width: `${(getCount('finished') / totalRunners) * 100}%`, height: '100%', background: 'linear-gradient(90deg, #22c55e, #16a34a)', transition: 'width 1s ease', position: 'absolute', left: 0 }} />
                            <div style={{ width: `${((getCount('finished') + getCount('in_progress')) / totalRunners) * 100}%`, height: '100%', background: '#f59e0b60', position: 'absolute', left: 0, zIndex: 0 }} />
                            <div style={{ position: 'absolute', width: '100%', textAlign: 'center', lineHeight: '20px', fontSize: 11, fontWeight: 700, color: '#333', zIndex: 2 }}>
                                {Math.round((getCount('finished') / totalRunners) * 100)}% {language === 'th' ? 'เข้าเส้นชัย' : 'finished'}
                            </div>
                        </div>
                    )}

                    {/* Controls */}
                    <div className="content-box" style={{ padding: '10px 16px', marginBottom: 16 }}>
                        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                            <select className="form-input" value={selectedCategory} onChange={e => setSelectedCategory(e.target.value)}
                                style={{ width: 180, fontSize: 13, padding: '6px 10px' }}>
                                <option value="all">{language === 'th' ? 'ทุกระยะ' : 'All categories'}</option>
                                {(campaign.categories || []).map((cat, i) => (
                                    <option key={`${cat.name}-${i}`} value={cat.name}>{cat.name}</option>
                                ))}
                            </select>
                            <button onClick={fetchData} disabled={scanning}
                                style={{
                                    padding: '6px 14px', borderRadius: 6, border: '1px solid #3c8dbc',
                                    background: '#fff', color: '#3c8dbc', fontWeight: 600, fontSize: 12,
                                    cursor: scanning ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', gap: 4,
                                }}>
                                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ animation: scanning ? 'spin 1s linear infinite' : 'none' }}>
                                    <path d="M21.5 2v6h-6M2.5 22v-6h6M2 11.5a10 10 0 0118.8-4.3M22 12.5a10 10 0 01-18.8 4.2" />
                                </svg>
                                {scanning ? '...' : (language === 'th' ? 'รีเฟรช' : 'Refresh')}
                            </button>
                            <label style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, color: '#666', cursor: 'pointer' }}>
                                <input type="checkbox" checked={autoRefresh} onChange={e => setAutoRefresh(e.target.checked)}
                                    style={{ accentColor: '#22c55e' }} />
                                {language === 'th' ? 'รีเฟรชอัตโนมัติ (10 วินาที)' : 'Auto-refresh (10s)'}
                            </label>
                            <span style={{ marginLeft: 'auto', fontSize: 11, color: '#999' }}>
                                {language === 'th' ? 'อัพเดตล่าสุด:' : 'Last update:'} {lastRefresh.toLocaleTimeString('th-TH')}
                            </span>
                        </div>
                    </div>

                    {/* Recent Scans Feed */}
                    <div className="content-box" style={{ padding: '0' }}>
                        <div style={{ padding: '12px 16px', borderBottom: '1px solid #f3f4f6', display: 'flex', alignItems: 'center', gap: 8 }}>
                            <span style={{ width: 8, height: 8, borderRadius: '50%', background: autoRefresh ? '#22c55e' : '#94a3b8', display: 'inline-block', animation: autoRefresh ? 'pulse-dot 2s infinite' : 'none' }} />
                            <span style={{ fontWeight: 700, fontSize: 14 }}>
                                {language === 'th' ? 'การสแกนล่าสุด' : 'Recent Scans'}
                            </span>
                            <span style={{ fontSize: 11, color: '#999', marginLeft: 4 }}>({filteredScans.length})</span>
                        </div>

                        {filteredScans.length === 0 ? (
                            <div style={{ padding: 40, textAlign: 'center' }}>
                                <div style={{ fontSize: 48, marginBottom: 8 }}>📡</div>
                                <p style={{ color: '#999', fontSize: 14 }}>
                                    {language === 'th' ? 'ยังไม่มีการสแกน' : 'No scans recorded yet'}
                                </p>
                            </div>
                        ) : (
                            <div style={{ maxHeight: 500, overflowY: 'auto' }}>
                                {filteredScans.map((scan, i) => {
                                    const runner = runnerMap[scan.runnerId];
                                    const isFinish = scan.checkpoint?.toUpperCase() === 'FINISH';
                                    const isStart = scan.checkpoint?.toUpperCase() === 'START';
                                    return (
                                        <div key={scan._id} style={{
                                            display: 'flex', alignItems: 'center', gap: 12, padding: '10px 16px',
                                            borderBottom: '1px solid #f3f4f6', transition: 'background .15s',
                                            background: i === 0 ? '#fffde7' : 'transparent',
                                        }}>
                                            {/* Checkpoint badge */}
                                            <div style={{
                                                padding: '4px 10px', borderRadius: 6, fontSize: 11, fontWeight: 700,
                                                background: isFinish ? '#dcfce7' : isStart ? '#dbeafe' : '#f3f4f6',
                                                color: isFinish ? '#16a34a' : isStart ? '#2563eb' : '#666',
                                                minWidth: 60, textAlign: 'center',
                                            }}>
                                                {scan.checkpoint}
                                            </div>
                                            {/* BIB */}
                                            <div style={{ fontWeight: 800, fontSize: 16, color: '#3c8dbc', minWidth: 60, textAlign: 'center' }}>
                                                {scan.bib}
                                            </div>
                                            {/* Runner info */}
                                            <div style={{ flex: 1 }}>
                                                <div style={{ fontWeight: 600, fontSize: 13 }}>
                                                    {runner ? `${runner.firstName || ''} ${runner.lastName || ''}`.trim() : scan.bib}
                                                </div>
                                                <div style={{ fontSize: 11, color: '#999' }}>
                                                    {runner?.category || ''} {runner?.gender || ''}
                                                </div>
                                            </div>
                                            {/* Times */}
                                            <div style={{ textAlign: 'right' }}>
                                                <div style={{ fontSize: 13, fontFamily: 'monospace', fontWeight: 600, color: '#333' }}>
                                                    {formatTime(scan.elapsedTime)}
                                                </div>
                                                <div style={{ fontSize: 11, color: '#999' }}>
                                                    {timeAgo(scan.scanTime)}
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>

                    <style>{`
                        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
                        @keyframes pulse-dot { 0%, 100% { opacity: 1; } 50% { opacity: 0.3; } }
                    `}</style>
                </>
            )}
        </AdminLayout>
    );
}
