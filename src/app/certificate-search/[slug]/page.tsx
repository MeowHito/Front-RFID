'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';

interface Campaign {
    _id: string;
    name: string;
    nameTh?: string;
    nameEn?: string;
    slug?: string;
    eventDate?: string;
    isApproveCertificate?: boolean;
}

interface Runner {
    _id: string;
    bib: string;
    firstName: string;
    lastName: string;
    firstNameTh?: string;
    lastNameTh?: string;
    category?: string;
    status: string;
    netTime?: number;
}

function formatTime(ms?: number): string {
    if (!ms || ms <= 0) return '-';
    const s = Math.floor(ms / 1000);
    return `${Math.floor(s / 3600).toString().padStart(2, '0')}:${Math.floor((s % 3600) / 60).toString().padStart(2, '0')}:${(s % 60).toString().padStart(2, '0')}`;
}

export default function CertificateSearchPage() {
    const { slug } = useParams<{ slug: string }>();
    const router = useRouter();
    const [campaign, setCampaign] = useState<Campaign | null>(null);
    const [loadingCampaign, setLoadingCampaign] = useState(true);
    const [campaignError, setCampaignError] = useState('');
    const [query, setQuery] = useState('');
    const [searching, setSearching] = useState(false);
    const [results, setResults] = useState<Runner[]>([]);
    const [error, setError] = useState('');
    const [searched, setSearched] = useState(false);

    useEffect(() => {
        if (!slug) return;
        let cancelled = false;
        (async () => {
            try {
                const res = await fetch(`/api/campaigns/${slug}`, { cache: 'no-store' });
                if (!res.ok) {
                    if (!cancelled) setCampaignError('ไม่พบกิจกรรม');
                    return;
                }
                const data = await res.json();
                if (!cancelled) setCampaign(data);
            } catch {
                if (!cancelled) setCampaignError('โหลดข้อมูลกิจกรรมไม่สำเร็จ');
            } finally {
                if (!cancelled) setLoadingCampaign(false);
            }
        })();
        return () => { cancelled = true; };
    }, [slug]);

    const handleSearch = useCallback(async (e?: React.FormEvent) => {
        if (e) e.preventDefault();
        const term = query.trim();
        if (!term || !campaign?._id) return;
        setSearching(true);
        setError('');
        setSearched(true);
        setResults([]);
        try {
            // 1) Try BIB exact lookup first (handles purely numeric / single code).
            const lookupRes = await fetch(`/api/runners/lookup?campaignId=${campaign._id}&code=${encodeURIComponent(term)}`, { cache: 'no-store' });
            if (lookupRes.ok) {
                const data = await lookupRes.json();
                if (data?.found && data.runner?._id) {
                    router.push(`/runner/${data.runner._id}/certificate`);
                    return;
                }
            }

            // 2) Fallback to search by name (or partial BIB) via paged endpoint.
            const params = new URLSearchParams({
                campaignId: campaign._id,
                search: term,
                page: '1',
                limit: '20',
                runnerStatus: 'finished',
                sortBy: 'netTime',
                sortOrder: 'asc',
            });
            const pageRes = await fetch(`/api/runners/paged?${params.toString()}`, { cache: 'no-store' });
            if (!pageRes.ok) {
                setError('ค้นหาไม่สำเร็จ ลองใหม่อีกครั้ง');
                return;
            }
            const pageData = await pageRes.json();
            const list: Runner[] = pageData?.data || [];
            if (list.length === 0) {
                setError(`ไม่พบนักวิ่งสำหรับ "${term}"`);
                return;
            }
            if (list.length === 1) {
                router.push(`/runner/${list[0]._id}/certificate`);
                return;
            }
            setResults(list);
        } catch {
            setError('เกิดข้อผิดพลาด ลองใหม่อีกครั้ง');
        } finally {
            setSearching(false);
        }
    }, [query, campaign, router]);

    if (loadingCampaign) {
        return (
            <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#0f172a' }}>
                <p style={{ color: '#94a3b8', fontSize: 16 }}>Loading...</p>
            </div>
        );
    }

    if (campaignError || !campaign) {
        return (
            <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: '#0f172a', padding: 24, gap: 12 }}>
                <p style={{ color: '#ef4444', fontSize: 16, fontWeight: 700 }}>{campaignError || 'ไม่พบกิจกรรม'}</p>
                <Link href="/" style={{ color: '#60a5fa', textDecoration: 'underline', fontSize: 14 }}>← กลับหน้าแรก</Link>
            </div>
        );
    }

    if (!campaign.isApproveCertificate) {
        return (
            <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: '#0f172a', padding: 24, gap: 12 }}>
                <p style={{ color: '#f59e0b', fontSize: 16, fontWeight: 700 }}>กิจกรรมนี้ยังไม่เปิดให้ดาวน์โหลดใบประกาศ</p>
                <Link href="/" style={{ color: '#60a5fa', textDecoration: 'underline', fontSize: 14 }}>← กลับหน้าแรก</Link>
            </div>
        );
    }

    return (
        <div style={{ minHeight: '100vh', background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)', padding: '24px 16px', fontFamily: "'Sarabun', sans-serif" }}>
            <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Sarabun:wght@400;600;700;800&display=swap" />

            <div style={{ maxWidth: 540, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 16 }}>
                {/* Heading */}
                <div style={{ textAlign: 'center', color: '#fff', marginTop: 24 }}>
                    <div style={{ fontSize: 38, marginBottom: 8 }}>🏅</div>
                    <h1 style={{ fontSize: 22, fontWeight: 800, margin: 0, letterSpacing: 0.5 }}>ค้นหาใบประกาศ</h1>
                    <p style={{ fontSize: 13, color: '#94a3b8', margin: '6px 0 0' }}>
                        {campaign.nameTh || campaign.nameEn || campaign.name}
                    </p>
                </div>

                {/* Search form */}
                <form onSubmit={handleSearch} style={{ background: '#fff', borderRadius: 16, padding: 18, boxShadow: '0 12px 40px rgba(0,0,0,0.35)' }}>
                    <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#475569', marginBottom: 6, letterSpacing: 0.3 }}>
                        ใส่เลข BIB หรือชื่อนักวิ่ง
                    </label>
                    <div style={{ display: 'flex', gap: 8 }}>
                        <input
                            type="text"
                            value={query}
                            onChange={e => setQuery(e.target.value)}
                            placeholder="เช่น 1234 หรือ สมชาย"
                            autoFocus
                            style={{
                                flex: 1,
                                padding: '12px 14px',
                                borderRadius: 10,
                                border: '1.5px solid #e2e8f0',
                                fontSize: 16,
                                outline: 'none',
                                fontFamily: 'inherit',
                            }}
                        />
                        <button
                            type="submit"
                            disabled={searching || !query.trim()}
                            style={{
                                padding: '12px 18px',
                                borderRadius: 10,
                                border: 'none',
                                background: searching || !query.trim() ? '#94a3b8' : '#2563eb',
                                color: '#fff',
                                fontWeight: 700,
                                fontSize: 14,
                                cursor: searching || !query.trim() ? 'not-allowed' : 'pointer',
                                whiteSpace: 'nowrap',
                            }}
                        >
                            {searching ? '⏳' : '🔍 ค้นหา'}
                        </button>
                    </div>
                    <p style={{ fontSize: 11, color: '#94a3b8', margin: '8px 0 0' }}>
                        ใส่เลข BIB จะค้นหาทันที — ใส่ชื่อจะแสดงรายการให้เลือก
                    </p>
                </form>

                {/* Error / no result */}
                {error && (
                    <div style={{ background: '#fef2f2', border: '1px solid #fecaca', color: '#b91c1c', padding: '12px 14px', borderRadius: 10, fontSize: 13, fontWeight: 600 }}>
                        {error}
                    </div>
                )}

                {/* Results list (multiple matches) */}
                {results.length > 0 && (
                    <div style={{ background: '#fff', borderRadius: 16, padding: 8, boxShadow: '0 8px 24px rgba(0,0,0,0.25)' }}>
                        <div style={{ padding: '8px 10px 4px', fontSize: 11, fontWeight: 700, color: '#64748b', letterSpacing: 0.5, textTransform: 'uppercase' }}>
                            พบ {results.length} รายการ — กดเพื่อดูใบประกาศ
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                            {results.map(r => {
                                const name = `${r.firstName || ''} ${r.lastName || ''}`.trim() || (r.firstNameTh ? `${r.firstNameTh} ${r.lastNameTh ?? ''}`.trim() : '-');
                                return (
                                    <button
                                        key={r._id}
                                        onClick={() => router.push(`/runner/${r._id}/certificate`)}
                                        style={{
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: 10,
                                            padding: '10px 12px',
                                            borderRadius: 10,
                                            border: '1px solid #e2e8f0',
                                            background: '#f8fafc',
                                            cursor: 'pointer',
                                            textAlign: 'left',
                                            fontFamily: 'inherit',
                                        }}
                                    >
                                        <div style={{
                                            minWidth: 48,
                                            padding: '4px 8px',
                                            background: '#1e3a8a',
                                            color: '#fff',
                                            borderRadius: 6,
                                            fontWeight: 800,
                                            fontSize: 13,
                                            textAlign: 'center',
                                        }}>
                                            {r.bib}
                                        </div>
                                        <div style={{ flex: 1, minWidth: 0 }}>
                                            <div style={{ fontWeight: 700, fontSize: 14, color: '#0f172a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</div>
                                            <div style={{ fontSize: 11, color: '#64748b' }}>{r.category || ''} · {formatTime(r.netTime)}</div>
                                        </div>
                                        <span style={{ color: '#94a3b8', fontSize: 18 }}>›</span>
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                )}

                {!searched && (
                    <div style={{ color: '#94a3b8', fontSize: 12, textAlign: 'center', marginTop: 4 }}>
                        ระบบจะนำคุณไปยังใบประกาศโดยอัตโนมัติเมื่อพบนักวิ่ง
                    </div>
                )}
            </div>
        </div>
    );
}
