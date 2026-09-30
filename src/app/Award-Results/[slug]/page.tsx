'use client';

// Result page of one admin-built award (/admin/award-builder), opened from the
// "Result(demo)" menu on /event/[slug]. Admin only. The ranking is recomputed from
// the live runner pool exactly like the award-builder popup does.

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams, useSearchParams } from 'next/navigation';
import AuthGuard from '@/components/AuthGuard';
import { useLanguage } from '@/lib/language-context';
import {
    computeCustomAward,
    normalizeCustomAwards,
    type CustomAwardRunner,
} from '@/lib/custom-awards';
import CustomAwardResults, { useAwardSplits } from '@/components/CustomAwardResults';
import { ArrowPathIcon, TableCellsIcon } from '@heroicons/react/24/outline';

interface Campaign {
    _id: string;
    slug?: string;
    name: string;
    nameTh?: string;
    nameEn?: string;
    eventDate?: string;
    location?: string;
    locationTh?: string;
    locationEn?: string;
    categories?: { name: string; distance?: string }[];
    genderSplitEnabled?: boolean;
    customAwards?: unknown;
}

const normCat = (v?: string | null) => String(v || '').trim().toLowerCase();

export default function AwardResultsPage() {
    return (
        <AuthGuard requireAdmin>
            <AwardResultsContent />
        </AuthGuard>
    );
}

function AwardResultsContent() {
    const { slug } = useParams<{ slug: string }>();
    const awardId = useSearchParams().get('award') || '';
    const { language } = useLanguage();
    const th = language === 'th';

    const [campaign, setCampaign] = useState<Campaign | null>(null);
    const [runners, setRunners] = useState<CustomAwardRunner[]>([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [error, setError] = useState('');
    const [exporting, setExporting] = useState(false);
    const splits = useAwardSplits();
    const { reset: resetSplits } = splits;

    const load = useCallback(async (isRefresh: boolean) => {
        if (isRefresh) setRefreshing(true); else setLoading(true);
        setError('');
        try {
            const cRes = await fetch(`/api/campaigns/${encodeURIComponent(slug)}`, { cache: 'no-store' });
            if (!cRes.ok) throw new Error('campaign');
            const payload = await cRes.json();
            const data: Campaign | null = payload?.data ?? payload;
            if (!data?._id) throw new Error('campaign');
            setCampaign(data);
            const params = new URLSearchParams({ campaignId: data._id, limit: '50000', skipStatusCounts: 'true' });
            const rRes = await fetch(`/api/runners/paged?${params.toString()}`, { cache: 'no-store' });
            const rData = rRes.ok ? await rRes.json() : null;
            setRunners(Array.isArray(rData?.data) ? rData.data : []);
            resetSplits(true);
        } catch {
            setError(th ? 'ไม่พบข้อมูลกิจกรรม' : 'Event not found');
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, [slug, th, resetSplits]);

    useEffect(() => { void load(false); }, [slug]); // eslint-disable-line react-hooks/exhaustive-deps

    const allAwards = useMemo(() => normalizeCustomAwards(campaign?.customAwards), [campaign?.customAwards]);
    const award = useMemo(() => allAwards.find(a => a.id === awardId) || null, [allAwards, awardId]);

    const groups = useMemo(() => {
        if (!award) return [];
        const pool = runners.filter(r => normCat(r.category) === normCat(award.category));
        return computeCustomAward(pool, award, { genderSplitEnabled: campaign?.genderSplitEnabled !== false, allAwards });
    }, [award, allAwards, runners, campaign?.genderSplitEnabled]);

    const eventName = (th ? campaign?.nameTh : campaign?.nameEn) || campaign?.name || '';
    const categoryRow = award ? campaign?.categories?.find(c => normCat(c.name) === normCat(award.category)) : undefined;
    const eventHref = `/event/${encodeURIComponent(campaign?.slug || slug)}`;

    useEffect(() => {
        document.title = award ? `${award.name} · ${eventName}` : 'Award result';
    }, [award, eventName]);

    const handleDownloadExcel = async () => {
        if (!award) return;
        setExporting(true);
        try {
            await splits.downloadExcel({ award, groups, language: th ? 'th' : 'en', eventName });
        } catch {
            window.alert(th ? 'ดาวน์โหลด Excel ไม่สำเร็จ' : 'Excel download failed');
        } finally {
            setExporting(false);
        }
    };

    if (loading) {
        return <div className="flex min-h-screen items-center justify-center bg-slate-50 text-sm text-gray-400">{th ? 'กำลังโหลด...' : 'Loading...'}</div>;
    }

    if (error || !campaign) {
        return <div className="flex min-h-screen items-center justify-center bg-slate-50 text-sm text-gray-500">{error || (th ? 'ไม่พบข้อมูลกิจกรรม' : 'Event not found')}</div>;
    }

    const empty = groups.every(g => g.runners.length === 0);

    return (
        <div className="min-h-screen bg-slate-50 text-gray-900">
            <div className="mx-auto max-w-6xl p-3 md:p-6">
                <div className="mb-3 flex items-center justify-between gap-2">
                    <Link href={eventHref} className="text-sm font-semibold text-blue-600 hover:underline">
                        ← {th ? 'กลับไปหน้าผลการแข่งขัน' : 'Back to results'}
                    </Link>
                    <span className="rounded-full border border-amber-200 bg-amber-50 px-2.5 py-0.5 text-[11px] font-bold text-amber-700">
                        Result (demo) · {th ? 'เห็นเฉพาะแอดมิน' : 'admin only'}
                    </span>
                </div>

                <div className="overflow-hidden rounded-xl bg-white shadow-sm ring-1 ring-gray-200">
                    <div className="flex flex-wrap items-start justify-between gap-3 bg-slate-900 px-5 py-4 text-white">
                        <h1 className="flex min-w-0 flex-wrap items-baseline gap-x-3 gap-y-1 self-center text-xl font-extrabold md:text-2xl">
                            {award ? (
                                <>
                                    <span className="text-amber-300">{award.category}{categoryRow?.distance ? ` (${categoryRow.distance})` : ''}</span>
                                    <span>{award.name}</span>
                                </>
                            ) : (th ? 'ไม่พบรางวัล' : 'Award not found')}
                        </h1>
                        {award && (
                            <div className="flex shrink-0 items-center gap-2">
                                <button type="button" onClick={() => void load(true)} disabled={refreshing}
                                    className="inline-flex items-center gap-1.5 rounded-md bg-white/10 px-3 py-1.5 text-sm font-semibold text-white hover:bg-white/20 disabled:opacity-50">
                                    <ArrowPathIcon className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
                                    {th ? 'รีเฟรช' : 'Refresh'}
                                </button>
                                <button type="button" onClick={handleDownloadExcel} disabled={exporting || empty}
                                    className="inline-flex items-center gap-1.5 rounded-md bg-emerald-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50">
                                    <TableCellsIcon className="h-4 w-4" />
                                    {exporting ? (th ? 'กำลังสร้างไฟล์...' : 'Building file...') : (th ? 'ดาวน์โหลด Excel' : 'Download Excel')}
                                </button>
                            </div>
                        )}
                    </div>
                    <div className="space-y-5 p-4 md:p-5">
                        {award ? (
                            <CustomAwardResults award={award} groups={groups} th={th} splits={splits} />
                        ) : (
                            <div className="py-10 text-center text-sm text-gray-500">
                                {th ? 'รางวัลนี้ถูกลบหรือไม่มีอยู่แล้ว — สร้าง/แก้ไขรางวัลได้ที่หน้า Award Builder' : 'This award was deleted or does not exist — manage awards on the Award Builder page.'}
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
