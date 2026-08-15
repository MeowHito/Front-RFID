'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import * as XLSX from 'xlsx';
import { useLanguage } from '@/lib/language-context';
import { buildCanonicalAgeGroups, canonicalizeAgeGroup, normalizeAgeGroupLabel } from '@/lib/age-groups';
import { toAlpha3 } from '@/lib/country-flags';
import {
    computeLiveRanks,
    deriveEffectiveStatus,
    getRunnerNetTimeMs,
    getRunnerPrimaryTimeMs,
    makeCompareRunnerRankOrder,
    type LiveRank,
} from '@/lib/live-ranking';
import AdminLayout from '../AdminLayout';
import '../admin.css';

interface RaceCategory { name: string; distance?: string; }
interface Campaign {
    _id: string;
    name: string;
    nameTh?: string;
    nameEn?: string;
    categories?: RaceCategory[];
    raceFinished?: boolean;
    separateOverallNationalityCategories?: string[];
}

interface Runner {
    _id: string;
    eventId?: string;
    bib?: string;
    firstName?: string;
    lastName?: string;
    firstNameTh?: string;
    lastNameTh?: string;
    gender?: string;
    category?: string;
    ageGroup?: string;
    age?: number;
    birthDate?: string;
    nationality?: string;
    status: string;
    passedCount?: number;
    latestCheckpoint?: string;
    scanTime?: string;
    netTime?: number;
    gunTime?: number;
    elapsedTime?: number;
    netTimeStr?: string;
    gunTimeStr?: string;
    netTimeMs?: number;
    gunTimeMs?: number;
    totalNetTime?: number;
    totalGunTime?: number;
    totalNetTimeMs?: number;
    totalGunTimeMs?: number;
    netPace?: string;
    gunPace?: string;
    overallRank?: number;
    genderRank?: number;
    ageGroupRank?: number;
}

// 5-year band to match RaceTiger's scheme (e.g. "20-24", "25-29") — see
// admin/participants calculateAgeGroup for the canonical version of this logic.
function calculateAgeGroup(birthDate?: string): string {
    if (!birthDate) return '';
    const birth = new Date(birthDate);
    if (isNaN(birth.getTime())) return '';
    const today = new Date();
    let age = today.getFullYear() - birth.getFullYear();
    const m = today.getMonth() - birth.getMonth();
    if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--;
    if (age <= 0) return '';
    if (age < 20) return 'U 19';
    if (age >= 70) return '70 +';
    const lo = Math.floor(age / 5) * 5;
    return `${lo}-${lo + 4}`;
}

function resolveAgeGroup(r: Runner): string {
    if (r.ageGroup && r.ageGroup.trim()) return r.ageGroup;
    return calculateAgeGroup(r.birthDate);
}

function formatBirthDateCE(iso?: string): string {
    if (!iso) return '';
    const d = new Date(iso);
    if (isNaN(d.getTime())) return '';
    const dd = String(d.getDate()).padStart(2, '0');
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const yyyy = d.getFullYear();
    return `${dd}/${mm}/${yyyy}`;
}

/** ISO 8601 date (YYYY-MM-DD) — the format the CSV results template expects. */
function formatBirthDateIso(iso?: string): string {
    if (!iso) return '';
    const d = new Date(iso);
    if (isNaN(d.getTime())) return '';
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function msToHHMMSS(ms: number): string {
    const totalSec = Math.floor(ms / 1000);
    const h = Math.floor(totalSec / 3600);
    const m = Math.floor((totalSec % 3600) / 60);
    const s = totalSec % 60;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function formatTime(ms?: number, fallback?: string): string {
    if (ms && ms > 0) return msToHHMMSS(ms);
    // Fall back to the *Str fields — RaceTiger occasionally provides the
    // formatted time string without a parseable millisecond count, and we
    // want those still to appear in the export instead of "-".
    return fallback && fallback.trim() ? fallback.trim() : '-';
}

function statusLabel(status?: string): string {
    const s = (status || '').toLowerCase();
    if (s === 'finished') return 'Finished';
    if (s === 'in_progress' || s === 'running') return 'In Progress';
    if (s === 'dnf') return 'DNF';
    if (s === 'dns' || s === 'not_started') return 'DNS';
    if (s === 'dq') return 'DQ';
    return status || '-';
}

/** birthDate & friends, keyed by runner id — the public results payload leaves them out. */
async function fetchProfiles(campaignId: string): Promise<Map<string, Runner>> {
    const byId = new Map<string, Runner>();
    let page = 1;
    const limit = 500;
    while (true) {
        const params = new URLSearchParams({ campaignId, page: String(page), limit: String(limit) });
        const res = await fetch(`/api/runners/paged?${params.toString()}`, { cache: 'no-store' });
        if (!res.ok) break;
        const data = await res.json();
        const items = (data.data || []) as Runner[];
        for (const item of items) byId.set(String(item._id), item);
        if (items.length < limit || byId.size >= (data.total || 0)) break;
        page++;
    }
    return byId;
}

/** What goes in the CSV template's "Ranking" cell — a placing, or why there isn't one. */
function rankingCell(r: Runner, rank: number): string | number {
    const s = (r.status || '').toLowerCase();
    if (s === 'dnf') return 'DNF';
    if (s === 'dns' || s === 'not_started') return 'DNS';
    if (s === 'dq') return 'DQ';
    return rank > 0 ? rank : '';
}

export default function ExportPage() {
    const { language } = useLanguage();
    const [campaign, setCampaign] = useState<Campaign | null>(null);
    const [loading, setLoading] = useState(true);
    const [selectedCategory, setSelectedCategory] = useState('all');
    const [runners, setRunners] = useState<Runner[]>([]);
    const [fetching, setFetching] = useState(false);
    const [exporting, setExporting] = useState(false);
    const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

    const showToast = (message: string, type: 'success' | 'error') => {
        setToast({ message, type });
        setTimeout(() => setToast(null), 4000);
    };

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

    /**
     * Pull the WHOLE campaign from the same endpoint the public results page uses,
     * so ranks here are computed over exactly the same rows. `/api/runners/paged`
     * alone is not enough: it drops eventId, passedCount and the gun/net *Ms
     * fields the ranking needs, which is why this page used to disagree with
     * /event/[slug] (a finisher showing "-" for Overall, gender ranks off by one).
     * The paged call is still made, for the profile fields (birthDate) that the
     * public payload leaves out.
     */
    const fetchAllRunners = useCallback(async (): Promise<Runner[]> => {
        if (!campaign?._id) return [];
        const rankUrl = campaign.raceFinished
            ? `/api/runners?id=${campaign._id}`
            : `/api/runners/passtime?id=${campaign._id}`;

        const [rankRes, profiles] = await Promise.all([
            fetch(rankUrl, { cache: 'no-store' }),
            fetchProfiles(campaign._id),
        ]);
        if (!rankRes.ok) throw new Error('Failed to load results');
        const payload = await rankRes.json().catch(() => ({}));
        const list: Runner[] = payload?.data?.data || payload?.data || (Array.isArray(payload) ? payload : []);
        if (!Array.isArray(list)) return [];

        return list.map(r => {
            const profile = profiles.get(String(r._id));
            return deriveEffectiveStatus({
                ...r,
                birthDate: r.birthDate || profile?.birthDate,
                ageGroup: r.ageGroup || profile?.ageGroup,
                nationality: r.nationality || profile?.nationality,
            });
        });
    }, [campaign]);

    const reloadRunners = useCallback(async () => {
        if (!campaign?._id) return;
        setFetching(true);
        try {
            setRunners(await fetchAllRunners());
        } catch {
            showToast(language === 'th' ? 'โหลดข้อมูลไม่สำเร็จ' : 'Failed to load', 'error');
        } finally {
            setFetching(false);
        }
    }, [campaign?._id, fetchAllRunners, language]);

    useEffect(() => {
        if (!campaign?._id) return;
        let cancelled = false;
        (async () => {
            setFetching(true);
            try {
                const data = await fetchAllRunners();
                if (!cancelled) setRunners(data);
            } catch {
                if (!cancelled) showToast(language === 'th' ? 'โหลดข้อมูลไม่สำเร็จ' : 'Failed to load', 'error');
            } finally {
                if (!cancelled) setFetching(false);
            }
        })();
        return () => { cancelled = true; };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [campaign?._id, fetchAllRunners]);

    // Re-fetch whenever the tab is refocused so admin status/CP edits made in
    // /admin/results show up here without a manual refresh.
    useEffect(() => {
        if (!campaign?._id) return;
        const onFocus = () => { reloadRunners(); };
        const onVisible = () => { if (document.visibilityState === 'visible') reloadRunners(); };
        window.addEventListener('focus', onFocus);
        document.addEventListener('visibilitychange', onVisible);
        return () => {
            window.removeEventListener('focus', onFocus);
            document.removeEventListener('visibilitychange', onVisible);
        };
    }, [campaign?._id, reloadRunners]);

    // ── Ranking (identical to /event/[slug] — see @/lib/live-ranking) ──────────
    // Age-group labels vary per distance ("40-49" vs "M40-49" vs "40 - 49"), so
    // canonicalise them per category exactly as the public page does.
    const canonicalAgeGroupOf = useMemo(() => {
        const rawByCategory = new Map<string, string[]>();
        for (const r of runners) {
            const key = r.category || '';
            if (!rawByCategory.has(key)) rawByCategory.set(key, []);
            rawByCategory.get(key)!.push(r.ageGroup || '');
        }
        const canonicalByCategory = new Map<string, ReturnType<typeof buildCanonicalAgeGroups>>();
        for (const [key, labels] of rawByCategory) canonicalByCategory.set(key, buildCanonicalAgeGroups(labels));
        return (r: Runner): string => {
            const canonical = canonicalByCategory.get(r.category || '');
            return canonical ? canonicalizeAgeGroup(r.ageGroup, canonical.canonicalLabelOf) : normalizeAgeGroupLabel(r.ageGroup);
        };
    }, [runners]);

    // Ordered over the WHOLE campaign — ranks are per event, so filtering by
    // distance afterwards keeps the numbers the public page shows.
    const rankedRunners = useMemo(() => {
        const compare = makeCompareRunnerRankOrder(!(campaign?.separateOverallNationalityCategories?.length));
        return [...runners].sort(compare);
    }, [runners, campaign?.separateOverallNationalityCategories]);

    // Pooled by category — the same key the distance filter below uses — so a runner
    // whose category was moved without moving eventId still ranks inside the distance
    // it is exported under (matches /event/[id]).
    const liveRanks = useMemo(
        () => computeLiveRanks(rankedRunners, canonicalAgeGroupOf, (r) => r.category || r.eventId || '_'),
        [rankedRunners, canonicalAgeGroupOf],
    );

    const rankOf = useCallback(
        (r: Runner): LiveRank => liveRanks.get(r._id) || { overallRank: 0, genRank: 0, catRank: 0 },
        [liveRanks],
    );

    const visibleRunners = useMemo(
        () => (selectedCategory === 'all' ? rankedRunners : rankedRunners.filter(r => r.category === selectedCategory)),
        [rankedRunners, selectedCategory],
    );

    const categoryDistance = (catName: string): string => {
        if (catName === 'all') return '';
        const c = (campaign?.categories || []).find(x => x.name === catName);
        return c?.distance || '';
    };

    const selectedCategoryLabel = (): string => {
        if (selectedCategory === 'all') return language === 'th' ? 'ทุกระยะ' : 'All Distances';
        const dist = categoryDistance(selectedCategory);
        return dist ? `${selectedCategory} (${dist})` : selectedCategory;
    };

    const categoryFileLabel = () =>
        selectedCategory === 'all' ? 'all' : selectedCategory.replace(/[^\w\-]+/g, '_');

    const handleExportExcel = useCallback(async () => {
        if (!campaign?._id || visibleRunners.length === 0) {
            showToast(language === 'th' ? 'ไม่มีข้อมูล' : 'No data', 'error');
            return;
        }
        setExporting(true);
        try {
            const eventName = campaign.nameTh || campaign.name || '';
            const distanceLabel = selectedCategoryLabel();
            const titleLine = distanceLabel ? `${eventName} — ${distanceLabel}` : eventName;
            const columns = ['Overall', 'Gender Rank', 'AgeGroup Rank', 'BIB', 'FirstName', 'LastName', 'Gender', 'Category', 'AgeGroup', 'BirthDate (C.E.)', 'Nationality', 'GunTime', 'NetTime', 'Status'];
            const aoa: (string | number)[][] = [];
            // Title row — full event + distance merged across all columns so nothing gets cut off
            aoa.push([titleLine]);
            // Blank spacer
            aoa.push([]);
            // Header
            aoa.push(columns);
            // Data rows
            for (const r of visibleRunners) {
                const rank = rankOf(r);
                aoa.push([
                    rank.overallRank || '',
                    rank.genRank || '',
                    rank.catRank || '',
                    r.bib || '',
                    r.firstName || '',
                    r.lastName || '',
                    r.gender || '',
                    r.category || '',
                    resolveAgeGroup(r) || '',
                    formatBirthDateCE(r.birthDate),
                    r.nationality || '',
                    formatTime(getRunnerPrimaryTimeMs(r), r.gunTimeStr),
                    formatTime(getRunnerNetTimeMs(r), r.netTimeStr),
                    statusLabel(r.status),
                ]);
            }
            const ws = XLSX.utils.aoa_to_sheet(aoa);
            // Column widths — match the column order above
            ws['!cols'] = [
                { wch: 8 },  { wch: 12 }, { wch: 13 }, { wch: 10 }, { wch: 16 }, { wch: 18 }, { wch: 8 },
                { wch: 14 }, { wch: 12 }, { wch: 14 }, { wch: 12 },
                { wch: 12 }, { wch: 12 }, { wch: 12 },
            ];
            // Merge title across all data columns so the event name is never truncated
            ws['!merges'] = ws['!merges'] || [];
            ws['!merges'].push({ s: { r: 0, c: 0 }, e: { r: 0, c: columns.length - 1 } });
            const wb = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(wb, ws, 'Results');
            const filename = `results-${categoryFileLabel()}-${new Date().toISOString().slice(0, 10)}.xlsx`;
            XLSX.writeFile(wb, filename);
            showToast(language === 'th' ? `ดาวน์โหลด ${visibleRunners.length} รายการ` : `Downloaded ${visibleRunners.length} records`, 'success');
        } catch (err) {
            console.error(err);
            showToast(language === 'th' ? 'เกิดข้อผิดพลาด' : 'Export failed', 'error');
        } finally {
            setExporting(false);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [campaign, visibleRunners, rankOf, selectedCategory, language]);

    /**
     * CSV in the standard results-submission template:
     *   Ranking, Time, Family Name, First Name, Gender, Birthdate, Nationality
     * One file per distance — pick the distance above before downloading.
     * Time is the GUN time, the same basis the Ranking column is placed on.
     */
    const handleExportCsv = useCallback(() => {
        if (visibleRunners.length === 0) {
            showToast(language === 'th' ? 'ไม่มีข้อมูล' : 'No data', 'error');
            return;
        }
        const headers = ['Ranking', 'Time', 'Family Name', 'First Name', 'Gender', 'Birthdate', 'Nationality'];
        const escapeCell = (val: unknown): string => {
            const s = val === null || val === undefined ? '' : String(val);
            return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
        };

        const rows: string[] = [headers.join(',')];
        for (const r of visibleRunners) {
            const gunMs = getRunnerPrimaryTimeMs(r);
            const finished = (r.status || '').toLowerCase() === 'finished';
            rows.push([
                rankingCell(r, rankOf(r).overallRank),
                // Non-finishers leave Time blank — a partial split time is not a result.
                finished ? (gunMs > 0 ? msToHHMMSS(gunMs) : (r.gunTimeStr || '').trim()) : '',
                r.lastName || r.lastNameTh || '',
                r.firstName || r.firstNameTh || '',
                (r.gender || '').toUpperCase(),
                formatBirthDateIso(r.birthDate),
                toAlpha3(r.nationality),
            ].map(escapeCell).join(','));
        }

        // BOM so Excel opens the file as UTF-8 (Thai names in the fallback columns)
        const blob = new Blob(['﻿' + rows.join('\r\n')], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `results-${categoryFileLabel()}-${new Date().toISOString().slice(0, 10)}.csv`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
        showToast(language === 'th' ? `ดาวน์โหลด ${visibleRunners.length} รายการ` : `Downloaded ${visibleRunners.length} records`, 'success');
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [visibleRunners, rankOf, selectedCategory, language]);

    const actionsDisabled = exporting || fetching || visibleRunners.length === 0;

    return (
        <AdminLayout breadcrumbItems={[{ label: 'ผลการแข่งขัน', labelEn: 'Race Results' }]}>
            {toast && (
                <div style={{
                    position: 'fixed', top: 20, right: 20, zIndex: 9999,
                    padding: '12px 24px', borderRadius: 8, color: '#fff', fontWeight: 600,
                    background: toast.type === 'success' ? '#22c55e' : '#ef4444',
                    boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
                }}>{toast.message}</div>
            )}

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
                    {/* Header */}
                    <div className="content-box" style={{ padding: '16px 20px', marginBottom: 16 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
                            <div>
                                <div style={{ fontWeight: 700, fontSize: 16, color: '#0f172a' }}>
                                    {campaign.nameTh || campaign.name}
                                </div>
                                <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>
                                    {language === 'th'
                                        ? 'ผลการแข่งขันตามผลจริง (รวมทุกสถานะ) — อันดับตรงกับหน้าผลการแข่งขันสาธารณะ'
                                        : 'Live race results (all statuses) — ranks match the public results page'}
                                </div>
                            </div>
                            <div style={{ fontSize: 13, color: '#475569' }}>
                                {fetching
                                    ? (language === 'th' ? 'กำลังโหลด...' : 'Loading...')
                                    : `${visibleRunners.length} ${language === 'th' ? 'รายการ' : 'records'}`}
                            </div>
                        </div>
                    </div>

                    {/* Filters & Actions */}
                    <div className="content-box" style={{ padding: '16px 20px', marginBottom: 16 }}>
                        <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                <span style={{ fontWeight: 600, fontSize: 13 }}>
                                    {language === 'th' ? 'ระยะ:' : 'Category:'}
                                </span>
                                <select
                                    className="form-input"
                                    value={selectedCategory}
                                    onChange={e => setSelectedCategory(e.target.value)}
                                    style={{ width: 220, fontSize: 13, padding: '6px 10px' }}
                                >
                                    <option value="all">{language === 'th' ? 'ทุกระยะ' : 'All categories'}</option>
                                    {(campaign.categories || []).map((cat, i) => (
                                        <option key={`${cat.name}-${i}`} value={cat.name}>
                                            {cat.name}{cat.distance ? ` (${cat.distance})` : ''}
                                        </option>
                                    ))}
                                </select>
                            </div>

                            <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
                                <button
                                    onClick={reloadRunners}
                                    disabled={fetching || !campaign?._id}
                                    title={language === 'th' ? 'ดึงข้อมูลล่าสุด' : 'Reload latest data'}
                                    style={{
                                        padding: '9px 14px', borderRadius: 6, border: '1px solid #cbd5e1',
                                        background: '#fff', color: '#0f172a', fontWeight: 600, fontSize: 13,
                                        cursor: fetching ? 'wait' : 'pointer', opacity: fetching ? 0.6 : 1,
                                        display: 'inline-flex', alignItems: 'center', gap: 6,
                                    }}
                                >
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="23 4 23 10 17 10" /><polyline points="1 20 1 14 7 14" /><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" /></svg>
                                    {language === 'th' ? 'รีเฟรช' : 'Refresh'}
                                </button>
                                <button
                                    onClick={handleExportCsv}
                                    disabled={actionsDisabled}
                                    title={language === 'th'
                                        ? 'CSV ตามเทมเพลตส่งผล: Ranking, Time, Family Name, First Name, Gender, Birthdate, Nationality'
                                        : 'CSV in the results template: Ranking, Time, Family Name, First Name, Gender, Birthdate, Nationality'}
                                    style={{
                                        padding: '9px 18px', borderRadius: 6, border: '1px solid #16a34a',
                                        background: '#fff', color: '#15803d', fontWeight: 700, fontSize: 13,
                                        cursor: actionsDisabled ? 'not-allowed' : 'pointer',
                                        opacity: actionsDisabled ? 0.6 : 1,
                                        display: 'inline-flex', alignItems: 'center', gap: 6,
                                    }}
                                >
                                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" /></svg>
                                    {language === 'th' ? 'ดาวน์โหลด CSV' : 'Download CSV'}
                                </button>
                                <button
                                    onClick={handleExportExcel}
                                    disabled={actionsDisabled}
                                    style={{
                                        padding: '9px 18px', borderRadius: 6, border: 'none',
                                        background: '#16a34a', color: '#fff', fontWeight: 700, fontSize: 13,
                                        cursor: actionsDisabled ? 'not-allowed' : 'pointer',
                                        opacity: actionsDisabled ? 0.6 : 1,
                                        display: 'inline-flex', alignItems: 'center', gap: 6,
                                    }}
                                >
                                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" /></svg>
                                    {exporting
                                        ? (language === 'th' ? 'กำลังดาวน์โหลด...' : 'Exporting...')
                                        : (language === 'th' ? 'ดาวน์โหลด Excel' : 'Download Excel')}
                                </button>
                            </div>
                        </div>
                        <div style={{ marginTop: 10, fontSize: 12, color: '#64748b' }}>
                            {language === 'th'
                                ? 'CSV = เทมเพลตส่งผล (Ranking / Time / Family Name / First Name / Gender / Birthdate / Nationality) — เลือกระยะก่อนดาวน์โหลด 1 ไฟล์ต่อ 1 ระยะ'
                                : 'CSV = results template (Ranking / Time / Family Name / First Name / Gender / Birthdate / Nationality) — pick a distance first, one file per distance.'}
                        </div>
                    </div>

                    {/* Results Table */}
                    <div className="content-box" style={{ padding: '16px 20px' }}>
                        {fetching ? (
                            <div style={{ padding: 40, textAlign: 'center', color: '#94a3b8' }}>
                                {language === 'th' ? 'กำลังโหลดข้อมูล...' : 'Loading data...'}
                            </div>
                        ) : visibleRunners.length === 0 ? (
                            <div style={{ padding: 40, textAlign: 'center', color: '#94a3b8' }}>
                                {language === 'th' ? 'ไม่มีข้อมูล' : 'No data'}
                            </div>
                        ) : (
                            <div style={{ overflowX: 'auto' }}>
                                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                                    <thead>
                                        <tr>
                                            {['Overall', 'Gender Rank', 'AgeGroup Rank', 'BIB', 'FirstName', 'LastName', 'Gender', 'Category', 'AgeGroup', 'BirthDate (C.E.)', 'Nationality', 'GunTime', 'NetTime', 'Pace', 'Status'].map((h, i) => (
                                                <th key={i} style={{ padding: '8px 10px', borderBottom: '2px solid #e5e7eb', textAlign: 'left', fontWeight: 700, fontSize: 11, color: '#475569', whiteSpace: 'nowrap', background: '#f8fafc' }}>{h}</th>
                                            ))}
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {visibleRunners.slice(0, 500).map((r, i) => {
                                            const s = (r.status || '').toLowerCase();
                                            const rank = rankOf(r);
                                            const statusBg = s === 'finished' ? '#dcfce7'
                                                : s === 'dnf' ? '#fee2e2'
                                                : s === 'dns' || s === 'not_started' ? '#f1f5f9'
                                                : s === 'in_progress' || s === 'running' ? '#dbeafe'
                                                : '#f1f5f9';
                                            const statusColor = s === 'finished' ? '#166534'
                                                : s === 'dnf' ? '#991b1b'
                                                : s === 'in_progress' || s === 'running' ? '#1e40af'
                                                : '#64748b';
                                            return (
                                                <tr key={r._id || i} style={{ borderBottom: '1px solid #f3f4f6' }}>
                                                    <td style={{ padding: '6px 10px', fontSize: 12, fontVariantNumeric: 'tabular-nums', fontWeight: 700, color: '#0f172a' }}>{rank.overallRank || '-'}</td>
                                                    <td style={{ padding: '6px 10px', fontSize: 12, fontVariantNumeric: 'tabular-nums', color: '#475569' }}>{rank.genRank || '-'}</td>
                                                    <td style={{ padding: '6px 10px', fontSize: 12, fontVariantNumeric: 'tabular-nums', color: '#475569' }}>{rank.catRank || '-'}</td>
                                                    <td style={{ padding: '6px 10px', fontSize: 12, fontWeight: 700 }}>{r.bib || '-'}</td>
                                                    <td style={{ padding: '6px 10px', fontSize: 12 }}>{r.firstName || '-'}</td>
                                                    <td style={{ padding: '6px 10px', fontSize: 12 }}>{r.lastName || '-'}</td>
                                                    <td style={{ padding: '6px 10px', fontSize: 12 }}>{r.gender || '-'}</td>
                                                    <td style={{ padding: '6px 10px', fontSize: 12 }}>{r.category || '-'}</td>
                                                    <td style={{ padding: '6px 10px', fontSize: 12 }}>{resolveAgeGroup(r) || '-'}</td>
                                                    <td style={{ padding: '6px 10px', fontSize: 12, fontVariantNumeric: 'tabular-nums' }}>{formatBirthDateCE(r.birthDate) || '-'}</td>
                                                    <td style={{ padding: '6px 10px', fontSize: 12 }}>{r.nationality || '-'}</td>
                                                    <td style={{ padding: '6px 10px', fontSize: 12, fontVariantNumeric: 'tabular-nums' }}>{formatTime(getRunnerPrimaryTimeMs(r), r.gunTimeStr)}</td>
                                                    <td style={{ padding: '6px 10px', fontSize: 12, fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>{formatTime(getRunnerNetTimeMs(r), r.netTimeStr)}</td>
                                                    <td style={{ padding: '6px 10px', fontSize: 12, fontVariantNumeric: 'tabular-nums' }}>{r.netPace || r.gunPace || '-'}</td>
                                                    <td style={{ padding: '6px 10px', fontSize: 11 }}>
                                                        <span style={{ display: 'inline-block', padding: '2px 8px', borderRadius: 12, background: statusBg, color: statusColor, fontWeight: 700 }}>
                                                            {statusLabel(r.status)}
                                                        </span>
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                                {visibleRunners.length > 500 && (
                                    <div style={{ textAlign: 'center', padding: 10, fontSize: 12, color: '#94a3b8' }}>
                                        {language === 'th'
                                            ? `... แสดง 500 แถวแรกจาก ${visibleRunners.length} แถว (ดาวน์โหลดเพื่อดูทั้งหมด)`
                                            : `... showing first 500 of ${visibleRunners.length} rows (download for full data)`}
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                </>
            )}
        </AdminLayout>
    );
}
