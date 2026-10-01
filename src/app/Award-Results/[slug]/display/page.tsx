'use client';

// Big-screen board of one admin-built award (/admin/award-builder), opened from the
// screen button on /Award-Results/[slug]. Same ranking as the result page
// (computeCustomAward over the live runner pool); the layout follows the
// "Age Group Awards" board design: on desktop every group fits one viewport, a pager
// and a play loop cycle pages → the same award on the ticked distances, keeping the
// toolbar settings (gender, group, cards, split) exactly as the admin set them.
// Admin only, like the result page.

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import Link from 'next/link';
import { useParams, useSearchParams } from 'next/navigation';
import AuthGuard from '@/components/AuthGuard';
import { useLanguage } from '@/lib/language-context';
import {
    computeCustomAward,
    normalizeCustomAwards,
    personalFieldValue,
    runnerDisplayName,
    runnerNationality,
    type CustomAward,
    type CustomAwardGroup,
    type CustomAwardRunner,
} from '@/lib/custom-awards';
import { buildAwardSignSheet, downloadBlob } from '@/lib/award-sign-sheet';

interface Campaign {
    _id: string;
    slug?: string;
    name: string;
    nameTh?: string;
    nameEn?: string;
    categories?: { name: string; distance?: string }[];
    genderSplitEnabled?: boolean;
    customAwards?: unknown;
}

type Sex = 'male' | 'female' | 'all';

interface BoardRow { id: string; place: number; bib: string; name: string; country: string; time: string }
interface BoardPanel { sex: Sex; rows: BoardRow[] }
interface BoardCard { key: string; title: string; panels: BoardPanel[] }

const normCat = (v?: string | null) => String(v || '').trim().toLowerCase();
const PLAY_SECONDS = 10;
const REFRESH_MS = 60_000;
const GRID_OPTIONS = ['1x1', '1x2', '1x3', '2x1', '2x2', '2x3', '3x2', '3x3', '3x4', '4x2', '4x3', '4x4', '6x2'];
const GRID_STORAGE_KEY = 'award-grid';
// A long list (Top 100) is cut into side-by-side columns: 5 → 1–20, 21–40, … Saved per award.
const SPLIT_OPTIONS = [1, 2, 3, 4, 5, 6, 8];
const SPLIT_STORAGE_PREFIX = 'award-split:';

/** Award groups → board cards: age-group M/F pairs share one card, one panel per gender. */
function buildCards(award: CustomAward, groups: CustomAwardGroup[], lang: 'th' | 'en'): BoardCard[] {
    const timeKey = award.rankBy === 'net' ? 'netTime' : 'gunTime';
    const cards: BoardCard[] = [];
    for (const g of groups) {
        const sex: Sex = g.key.endsWith(':M') ? 'male' : g.key.endsWith(':F') ? 'female' : 'all';
        const cardKey = sex === 'all' ? g.key : g.key.slice(0, -2);
        let card = cards.find(c => c.key === cardKey);
        if (!card) {
            // Age-group keys are "age:<label>" / "age:<label>:M"; the other types show the award name.
            const title = award.type === 'ageGroup' ? cardKey.slice(4) : award.name;
            card = { key: cardKey, title, panels: [] };
            cards.push(card);
        }
        card.panels.push({
            sex,
            rows: g.runners.map(row => ({
                id: row.runner._id,
                place: row.place,
                bib: row.runner.bib || '',
                name: runnerDisplayName(row.runner, lang),
                country: runnerNationality(row.runner),
                time: String(personalFieldValue(timeKey, row, lang) || ''),
            })),
        });
    }
    // Age groups nobody finished in are left out, like the result tables do.
    return award.type === 'ageGroup' ? cards.filter(c => c.panels.some(p => p.rows.length)) : cards;
}

/** Columns × rows that give each card the most room (same scoring as the design). */
function autoGrid(n: number, w: number, h: number): [number, number] {
    if (!w || !h) { const c = Math.min(n, 4); return [c, Math.ceil(n / c)]; }
    let best: [number, number] = [1, n];
    let score = -Infinity;
    for (let c = 1; c <= Math.min(n, 6); c++) {
        const r = Math.ceil(n / c);
        const v = Math.min(w / c / 390, h / r / 190) - (c * r - n) * 0.015;
        if (v > score) { score = v; best = [c, r]; }
    }
    return best;
}

/** How many side-by-side columns one panel's list should flow into to keep rows readable. */
function autoSplit(n: number, w: number, h: number): number {
    if (!w || !h || n <= 1) return 1;
    let best = 1;
    let score = -Infinity;
    for (let c = 1; c <= 8; c++) {
        const r = Math.ceil(n / c);
        const v = Math.min(w / c / 300, h / r / 30) - (c * r - n) * 0.001;
        if (v > score) { score = v; best = c; }
    }
    return best;
}

const chunk = <T,>(list: T[], size: number): T[][] => {
    const out: T[][] = [];
    for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
    return out.length ? out : [[]];
};

export default function AwardDisplayPage() {
    return (
        <AuthGuard requireAdmin>
            <AwardDisplayContent />
        </AuthGuard>
    );
}

function AwardDisplayContent() {
    const { slug } = useParams<{ slug: string }>();
    const initialAwardId = useSearchParams().get('award') || '';
    const { language } = useLanguage();
    const th = language === 'th';
    const lang: 'th' | 'en' = th ? 'th' : 'en';

    const [campaign, setCampaign] = useState<Campaign | null>(null);
    const [runners, setRunners] = useState<CustomAwardRunner[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    const [awardId, setAwardId] = useState(initialAwardId);
    // Frozen on first render: switchAward rewrites ?award=, which useSearchParams follows.
    const [anchorId] = useState(initialAwardId);
    const [search, setSearch] = useState('');
    const [groupFilter, setGroupFilter] = useState('all');
    const [sex, setSex] = useState<Sex>('all');
    const [gridSize, setGridSize] = useState('auto');
    const [splitSize, setSplitSize] = useState('auto');
    const [page, setPage] = useState(0);
    const [skipped, setSkipped] = useState<string[]>([]);
    const [playing, setPlaying] = useState(false);
    const [now, setNow] = useState(0);
    const deadlineRef = useRef(0);
    const [isMobile, setIsMobile] = useState(false);
    const [isFullscreen, setIsFullscreen] = useState(false);
    const boardRef = useRef<HTMLDivElement | null>(null);
    // Set by the play loop so the next distance keeps the split shown now instead of its own saved one.
    const keepSplitRef = useRef(false);
    const [boardSize, setBoardSize] = useState({ w: 0, h: 0 });

    const loadRunners = useCallback(async (campaignId: string) => {
        const params = new URLSearchParams({ campaignId, limit: '50000', skipStatusCounts: 'true' });
        const res = await fetch(`/api/runners/paged?${params.toString()}`, { cache: 'no-store' });
        if (!res.ok) return;
        const data = await res.json();
        if (Array.isArray(data?.data)) setRunners(data.data);
    }, []);

    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                const cRes = await fetch(`/api/campaigns/${encodeURIComponent(slug)}`, { cache: 'no-store' });
                if (!cRes.ok) throw new Error('campaign');
                const payload = await cRes.json();
                const data: Campaign | null = payload?.data ?? payload;
                if (!data?._id) throw new Error('campaign');
                if (cancelled) return;
                setCampaign(data);
                await loadRunners(data._id);
            } catch {
                if (!cancelled) setError(th ? 'ไม่พบข้อมูลกิจกรรม' : 'Event not found');
            } finally {
                if (!cancelled) setLoading(false);
            }
        })();
        return () => { cancelled = true; };
    }, [slug]); // eslint-disable-line react-hooks/exhaustive-deps

    // The board stays up for the whole ceremony — keep the ranking current.
    useEffect(() => {
        if (!campaign?._id) return;
        const id = setInterval(() => { void loadRunners(campaign._id); }, REFRESH_MS);
        return () => clearInterval(id);
    }, [campaign?._id, loadRunners]);

    useEffect(() => {
        const mq = window.matchMedia('(max-width: 700px)');
        const sync = () => setIsMobile(mq.matches);
        sync();
        mq.addEventListener('change', sync);
        const onFs = () => setIsFullscreen(!!document.fullscreenElement);
        document.addEventListener('fullscreenchange', onFs);
        try {
            const saved = localStorage.getItem(GRID_STORAGE_KEY);
            if (saved && (saved === 'auto' || GRID_OPTIONS.includes(saved))) setGridSize(saved);
        } catch { /* storage blocked */ }
        return () => {
            mq.removeEventListener('change', sync);
            document.removeEventListener('fullscreenchange', onFs);
        };
    }, []);

    useEffect(() => {
        const el = boardRef.current;
        if (!el) return;
        const ro = new ResizeObserver(([entry]) => {
            const { width, height } = entry.contentRect;
            setBoardSize(prev => (Math.abs(prev.w - width) < 1 && Math.abs(prev.h - height) < 1 ? prev : { w: width, h: height }));
        });
        ro.observe(el);
        return () => ro.disconnect();
    }, [loading]);

    useEffect(() => {
        if (keepSplitRef.current) { keepSplitRef.current = false; return; }
        let saved = 'auto';
        try { saved = localStorage.getItem(SPLIT_STORAGE_PREFIX + awardId) || 'auto'; } catch { /* storage blocked */ }
        setSplitSize(saved === 'auto' || SPLIT_OPTIONS.includes(Number(saved)) ? saved : 'auto');
    }, [awardId]);

    const allAwards = useMemo(() => normalizeCustomAwards(campaign?.customAwards), [campaign?.customAwards]);
    const award = useMemo(() => allAwards.find(a => a.id === awardId) || null, [allAwards, awardId]);

    // The award the board was opened on; switching distance never moves it, so
    // 10K → 5K → 10K lands back on the same award.
    const anchor = useMemo(() => allAwards.find(a => a.id === anchorId) || award, [allAwards, anchorId, award]);

    // Every distance of the campaign, in its order, with the anchor award's counterpart
    // there — the distance selector and the play loop. Same name first ("Overall Result"
    // on 5K, 10K, 21K…); otherwise the award in the same slot of the Award Builder list
    // among its own kind: 10K "TOP 100" is the 2nd gender award there, so it pairs with
    // 5K's 2nd gender award "TOP 50", never with the 1st one ("Gender Result").
    // Nothing in that slot → none (disabled) rather than repeating another award.
    const siblings = useMemo(() => {
        if (!anchor) return [] as { category: string; award: CustomAward | null }[];
        const names = (campaign?.categories || []).map(c => c.name);
        if (!names.some(n => normCat(n) === normCat(anchor.category))) names.unshift(anchor.category);
        const home = allAwards.filter(a => normCat(a.category) === normCat(anchor.category));
        const sameKind = (a: CustomAward) => a.type === anchor.type && a.nationality === anchor.nationality;
        const sameType = (a: CustomAward) => a.type === anchor.type;
        const kindSlot = home.filter(sameKind).findIndex(a => a.id === anchor.id);
        const typeSlot = home.filter(sameType).findIndex(a => a.id === anchor.id);
        return names.map(category => {
            if (normCat(category) === normCat(anchor.category)) return { category, award: anchor };
            const pool = allAwards.filter(a => normCat(a.category) === normCat(category));
            const match = pool.find(a => normCat(a.name) === normCat(anchor.name))
                || pool.filter(sameKind)[kindSlot]
                || pool.filter(sameType)[typeSlot]
                || null;
            return { category, award: match };
        });
    }, [allAwards, anchor, campaign?.categories]);
    const playlist = useMemo(
        () => siblings.flatMap(s => (s.award && !skipped.includes(s.award.id) ? [s.award] : [])),
        [siblings, skipped],
    );

    const cards = useMemo(() => {
        if (!award) return [];
        const pool = runners.filter(r => normCat(r.category) === normCat(award.category));
        const groups = computeCustomAward(pool, award, { genderSplitEnabled: campaign?.genderSplitEnabled !== false, allAwards });
        return buildCards(award, groups, lang);
    }, [award, allAwards, runners, campaign?.genderSplitEnabled, lang]);

    const gendered = cards.some(c => c.panels.some(p => p.sex !== 'all'));
    // The picked group survives a distance switch; a distance without it shows every group.
    const activeGroup = groupFilter !== 'all' && cards.some(c => c.key === groupFilter) ? groupFilter : 'all';
    const visibleCards = useMemo(() => cards
        .filter(c => activeGroup === 'all' || c.key === activeGroup)
        .map(c => ({ ...c, panels: c.panels.filter(p => sex === 'all' || p.sex === 'all' || p.sex === sex) })),
    [cards, activeGroup, sex]);

    const [cols, rows] = useMemo<[number, number]>(() => {
        const n = Math.max(1, visibleCards.length);
        if (gridSize !== 'auto') {
            const [c, r] = gridSize.split('x').map(Number);
            return [c, r];
        }
        return autoGrid(n, boardSize.w, boardSize.h);
    }, [gridSize, visibleCards.length, boardSize.w, boardSize.h]);

    const capacity = isMobile ? Math.max(1, visibleCards.length) : cols * rows;
    const pageCount = Math.max(1, Math.ceil(visibleCards.length / capacity));
    const safePage = Math.min(page, pageCount - 1);
    const pageCards = isMobile ? visibleCards : visibleCards.slice(safePage * capacity, (safePage + 1) * capacity);
    const longestList = Math.max(0, ...pageCards.flatMap(c => c.panels.map(p => p.rows.length)));
    const split = useMemo(() => {
        if (isMobile) return 1;
        if (splitSize !== 'auto') return Number(splitSize) || 1;
        const panels = Math.max(1, ...pageCards.map(c => c.panels.length));
        // Room for one panel: its share of a grid cell, minus the card bar and gender heading.
        return autoSplit(longestList, boardSize.w / cols / panels - 16, boardSize.h / rows - 54);
    }, [isMobile, splitSize, pageCards, longestList, boardSize.w, boardSize.h, cols, rows]);
    // Every row on the page gets the same height, sized for the longest column shown.
    const rowSlots = Math.max(3, Math.ceil(longestList / split));

    const eventName = (th ? campaign?.nameTh : campaign?.nameEn) || campaign?.name || '';
    const categoryRow = award ? campaign?.categories?.find(c => normCat(c.name) === normCat(award.category)) : undefined;
    const timeLabel = award?.rankBy === 'net' ? 'NET TIME' : 'GUN TIME';
    const resultHref = `/Award-Results/${encodeURIComponent(campaign?.slug || slug)}?award=${encodeURIComponent(awardId)}`;

    useEffect(() => {
        document.title = award ? `${award.category} ${award.name} · ${th ? 'จอแสดงผล' : 'Display'}` : 'Award display';
    }, [award, th]);

    // Gender and group filters stay as set; only the play loop also carries the split over.
    const switchAward = useCallback((id: string, keepSplit = false) => {
        keepSplitRef.current = keepSplit;
        setAwardId(id);
        setPage(0);
        window.history.replaceState(null, '', `?award=${encodeURIComponent(id)}`);
    }, []);

    const pause = () => setPlaying(false);

    // One step of the loop: the next page, then the next ticked distance. The gender,
    // group, cards and split settings are never touched — "ชาย/หญิง side by side" stays
    // side by side, "male only" stays male only.
    const nextFrame = useCallback(() => {
        deadlineRef.current = Date.now() + PLAY_SECONDS * 1000;
        if (!playlist.length) { setPlaying(false); return; }
        const idx = playlist.findIndex(a => a.id === awardId);
        if (idx < 0) { switchAward(playlist[0].id, true); return; }
        if (safePage + 1 < pageCount) { setPage(safePage + 1); return; }
        if (playlist.length > 1) switchAward(playlist[(idx + 1) % playlist.length].id, true);
        else setPage(0);
    }, [playlist, awardId, safePage, pageCount, switchAward]);

    const nextFrameRef = useRef(nextFrame);
    useEffect(() => { nextFrameRef.current = nextFrame; }, [nextFrame]);

    useEffect(() => {
        if (!playing) return;
        const id = setInterval(() => {
            const t = Date.now();
            setNow(t);
            if (t >= deadlineRef.current) nextFrameRef.current();
        }, 250);
        return () => clearInterval(id);
    }, [playing]);

    const startPlay = () => {
        if (playing) { pause(); return; }
        if (!playlist.length) return;
        setSearch('');
        setPage(0);
        if (!playlist.some(a => a.id === awardId)) switchAward(playlist[0].id, true);
        deadlineRef.current = Date.now() + PLAY_SECONDS * 1000;
        setNow(Date.now());
        setPlaying(true);
    };

    const toggleFullscreen = () => {
        if (document.fullscreenElement) void document.exitFullscreen?.();
        else void document.documentElement.requestFullscreen?.().catch(() => {});
    };

    const downloadCard = (card: BoardCard) => {
        if (!award) return;
        const sexLabel = (s: Sex) => (s === 'male' ? 'Male' : s === 'female' ? 'Female' : 'All');
        const panels = card.panels.filter(p => sex === 'all' || p.sex === 'all' || p.sex === sex);
        const mode = award.rankBy === 'net' ? 'Net Time' : 'Gun Time';
        const blob = buildAwardSignSheet(panels.map(p => ({
            sheetName: sexLabel(p.sex),
            title: `${award.category} ${p.sex === 'all' ? '' : `${sexLabel(p.sex)}. `}${award.name}`.replace(/\s+/g, ' ').trim(),
            subtitle: eventName,
            groupLine: award.type === 'ageGroup' ? `รุ่นอายุ ${card.title} · ${mode}` : mode,
            rows: p.rows.map(r => ({ place: r.place, bib: r.bib, name: r.name === '-' ? '' : r.name, time: r.time })),
        })), mode);
        const safe = (v: string) => v.replace(/[^a-zA-Z0-9ก-๙_+-]+/g, '_').replace(/^_+|_+$/g, '');
        const parts = [eventName, award.category, award.name, award.type === 'ageGroup' ? card.title : '', sex === 'all' ? '' : sex]
            .map(safe).filter(Boolean);
        downloadBlob(blob, `${parts.join('_')}.xlsx`);
    };

    if (loading) {
        return <div className="flex min-h-screen items-center justify-center bg-slate-50 text-sm text-gray-400">{th ? 'กำลังโหลด...' : 'Loading...'}</div>;
    }
    if (error || !campaign) {
        return <div className="flex min-h-screen items-center justify-center bg-slate-50 text-sm text-gray-500">{error || (th ? 'ไม่พบข้อมูลกิจกรรม' : 'Event not found')}</div>;
    }

    const q = search.trim().toLowerCase();
    const sexText = (s: Sex) => (s === 'male' ? 'ชาย / Male' : s === 'female' ? 'หญิง / Female' : 'รวมทุกเพศ / All');
    const secondsLeft = Math.max(0, Math.ceil((deadlineRef.current - now) / 1000));
    const countdownText = playing
        ? (th ? `สลับใน ${secondsLeft} วินาที` : `Next in ${secondsLeft}s`)
        : playlist.length
            ? (th ? `สลับทุก ${PLAY_SECONDS} วินาที` : `Every ${PLAY_SECONDS}s`)
            : (th ? 'เลือกระยะอย่างน้อย 1 ระยะ' : 'Pick at least 1 distance');
    const nowShowing = `${award?.category || ''} · ${sex === 'all' ? (th ? 'ทุกเพศ' : 'All') : sexText(sex)}`;

    return (
        <div className="awb">
            <style>{BOARD_CSS}</style>
            <header className="awb-header">
                <div className="awb-brand">ACTION<span style={{ color: 'var(--accent)' }}>.</span></div>
                <small>RACE RESULTS / AWARDS</small>
            </header>

            <main className="awb-main">
                <div className="awb-hero">
                    <div className="awb-eyebrow">{eventName}</div>
                    <h1>
                        {award ? (
                            <>
                                <span className="awb-dist">{award.category}{categoryRow?.distance ? ` (${categoryRow.distance})` : ''}.</span>
                                <span> {award.name}</span>
                            </>
                        ) : (
                            <span>{th ? 'ไม่พบรางวัล' : 'Award not found'}</span>
                        )}
                    </h1>
                </div>

                {award && (
                    <div className="awb-toolbar">
                        {siblings.length > 0 && (
                            <select value={awardId} aria-label={th ? 'เลือกระยะ' : 'Distance'}
                                onChange={e => { pause(); switchAward(e.target.value); }}>
                                {siblings.map(s => (
                                    <option key={s.category} value={s.award?.id || `none:${s.category}`} disabled={!s.award}>
                                        {s.category}{s.award ? (normCat(s.award.name) === normCat(award.name) ? '' : ` · ${s.award.name}`) : (th ? ' (ไม่มีรางวัลนี้)' : ' (no such award)')}
                                    </option>
                                ))}
                            </select>
                        )}
                        <div className="awb-search">
                            <input value={search} onChange={e => { pause(); setPage(0); setSearch(e.target.value); }}
                                aria-label={th ? 'ค้นหาชื่อหรือ BIB' : 'Search name or BIB'}
                                placeholder={th ? 'ค้นหาชื่อนักวิ่ง หรือ BIB' : 'Search runner name or BIB'} />
                        </div>
                        {cards.length > 1 && (
                            <select value={activeGroup} aria-label={th ? 'เลือกกลุ่ม' : 'Group'}
                                onChange={e => { pause(); setPage(0); setGroupFilter(e.target.value); }}>
                                <option value="all">{award.type === 'ageGroup' ? (th ? 'ทุกรุ่นอายุ' : 'All age groups') : (th ? 'ทุกกลุ่ม' : 'All groups')}</option>
                                {cards.map(c => <option key={c.key} value={c.key}>{c.title}</option>)}
                            </select>
                        )}
                        {gendered && (
                            <select value={sex} aria-label={th ? 'เลือกเพศ' : 'Gender'}
                                onChange={e => { pause(); setPage(0); setSex(e.target.value as Sex); }}>
                                <option value="all">{th ? 'ทุกเพศ' : 'All genders'}</option>
                                <option value="male">{th ? 'ชาย' : 'Male'}</option>
                                <option value="female">{th ? 'หญิง' : 'Female'}</option>
                            </select>
                        )}
                        <label className="awb-field">
                            <span>{th ? 'จัดการ์ด' : 'Cards'}</span>
                            <select value={gridSize} title={th ? 'จำนวนการ์ดต่อหน้า (คอลัมน์ × แถว)' : 'Cards per page (columns × rows)'}
                                onChange={e => {
                                    pause(); setPage(0); setGridSize(e.target.value);
                                    try { localStorage.setItem(GRID_STORAGE_KEY, e.target.value); } catch { /* storage blocked */ }
                                }}>
                                <option value="auto">{th ? 'อัตโนมัติ' : 'Auto'}</option>
                                {GRID_OPTIONS.map(o => <option key={o} value={o}>{o.replace('x', ' × ')} {th ? '(คอลัมน์ × แถว)' : '(cols × rows)'}</option>)}
                            </select>
                        </label>
                        <label className="awb-field">
                            <span>{th ? 'แบ่งรายชื่อ' : 'Split list'}</span>
                            <select value={splitSize} title={th ? 'รายชื่อยาว ๆ แบ่งเป็นกี่คอลัมน์ (เช่น 5 = 1–20, 21–40, …)' : 'Columns for a long list (e.g. 5 = 1–20, 21–40, …)'}
                                onChange={e => {
                                    pause(); setSplitSize(e.target.value);
                                    try { localStorage.setItem(SPLIT_STORAGE_PREFIX + awardId, e.target.value); } catch { /* storage blocked */ }
                                }}>
                                <option value="auto">{th ? `อัตโนมัติ (${split} คอลัมน์)` : `Auto (${split} col)`}</option>
                                {SPLIT_OPTIONS.map(n => (
                                    <option key={n} value={String(n)}>
                                        {n === 1
                                            ? (th ? 'ไม่แบ่ง' : 'No split')
                                            : (th ? `${n} คอลัมน์ · ละ ${Math.ceil(longestList / n)} คน` : `${n} cols · ${Math.ceil(longestList / n)} each`)}
                                    </option>
                                ))}
                            </select>
                        </label>
                        <div className="awb-playbar">
                            {siblings.length > 0 && <span className="awb-playbar-label">{th ? 'เล่นวนระยะ' : 'Loop distances'}</span>}
                            {siblings.map(({ category, award: a }) => (
                                <label key={category} className={a ? undefined : 'off'}
                                    title={a ? a.name : (th ? 'ระยะนี้ยังไม่มีรางวัลนี้ — สร้างได้ที่ Award Builder' : 'No such award on this distance — add one in Award Builder')}>
                                    <input type="checkbox" disabled={!a} checked={!!a && !skipped.includes(a.id)}
                                        onChange={e => { if (a) setSkipped(prev => (e.target.checked ? prev.filter(x => x !== a.id) : [...prev, a.id])); }} />
                                    <span>{category}</span>
                                </label>
                            ))}
                            <button type="button" className="awb-play" disabled={!playlist.length} onClick={startPlay}>
                                {playing ? (th ? 'Ⅱ หยุดชั่วคราว' : 'Ⅱ Pause') : (th ? '▶ เล่นวน' : '▶ Play')}
                            </button>
                            <button type="button" onClick={() => { pause(); nextFrame(); }}>{th ? 'ถัดไป ›' : 'Next ›'}</button>
                            <button type="button" onClick={toggleFullscreen}>{isFullscreen ? (th ? 'ออกจากเต็มจอ' : 'Exit full screen') : (th ? '⛶ เต็มจอ' : '⛶ Full screen')}</button>
                            <strong className="awb-now">{nowShowing}</strong>
                            <span className="awb-countdown" aria-live="off">{countdownText}</span>
                        </div>
                    </div>
                )}

                {!isMobile && pageCount > 1 && (
                    <div className="awb-boardinfo">
                        <div className="awb-pager">
                            <button type="button" aria-label={th ? 'หน้าก่อนหน้า' : 'Previous page'} disabled={safePage === 0}
                                onClick={() => { pause(); setPage(safePage - 1); }}>‹</button>
                            <span>{safePage + 1} / {pageCount}</span>
                            <button type="button" aria-label={th ? 'หน้าถัดไป' : 'Next page'} disabled={safePage >= pageCount - 1}
                                onClick={() => { pause(); setPage(safePage + 1); }}>›</button>
                        </div>
                    </div>
                )}

                <div ref={boardRef} className="awb-groups"
                    style={{ '--cols': cols, '--rows': rows, '--n': rowSlots } as CSSProperties}>
                    {!award ? (
                        <div className="awb-empty">{th ? 'รางวัลนี้ถูกลบหรือไม่มีอยู่แล้ว — สร้าง/แก้ไขรางวัลได้ที่หน้า Award Builder' : 'This award was deleted or does not exist — manage awards on the Award Builder page.'}</div>
                    ) : pageCards.length === 0 ? (
                        <div className="awb-empty">{th ? 'ยังไม่มีผู้เข้าเส้นชัยในระยะนี้' : 'No finishers in this distance yet'}</div>
                    ) : pageCards.map(card => (
                        <article key={card.key} className="awb-card">
                            <div className="awb-cardhead">
                                <div className="awb-agehead">
                                    <h2>{card.title}</h2>
                                    <button type="button" className="awb-dl" onClick={() => downloadCard(card)}
                                        aria-label={th ? `ดาวน์โหลดผล ${card.title}` : `Download ${card.title}`}
                                        title={th ? `ดาวน์โหลด Excel ${card.title}` : `Download Excel ${card.title}`}>
                                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M12 3v12m-5-5 5 5 5-5M5 16v5h14v-5" /></svg>
                                    </button>
                                </div>
                                <span>{award.type === 'ageGroup' ? 'AGE GROUP' : award.type === 'gender' ? 'BY GENDER' : 'OVERALL'}</span>
                            </div>
                            <div className="awb-genders" style={{ '--panels': card.panels.length } as CSSProperties}>
                                {card.panels.map(p => {
                                    const shown = q ? p.rows.filter(r => r.name.toLowerCase().includes(q) || r.bib.toLowerCase().includes(q)) : p.rows;
                                    return (
                                        <section key={p.sex} className={`awb-gender ${p.sex}`} aria-label={sexText(p.sex)}>
                                            <h3><span className="awb-dot" /><span>{sexText(p.sex)}</span></h3>
                                            {shown.length ? (
                                                <div className="awb-cols" style={{ '--split': split } as CSSProperties}>
                                                    {chunk(shown, Math.max(1, Math.ceil(p.rows.length / split))).map((col, ci) => (
                                                        <div key={ci} className="awb-col">
                                                            {col.map(r => (
                                                                <div key={r.id} className={`awb-row${r.place === 1 ? ' first' : ''}`}>
                                                                    <span className="awb-rank">{r.place}</span>
                                                                    <div>
                                                                        <div className="awb-name" title={r.name}>{r.name}</div>
                                                                        <div className="awb-meta">
                                                                            <span className="awb-bib">BIB {r.bib}</span>
                                                                            <span>{r.country ? ` · ${r.country}` : ''}</span>
                                                                        </div>
                                                                    </div>
                                                                    <div className="awb-time">
                                                                        <span>{r.time || '—'}</span>
                                                                        <small>{timeLabel}</small>
                                                                    </div>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    ))}
                                                </div>
                                            ) : (
                                                <div className="awb-empty">
                                                    {q ? (th ? 'ไม่พบชื่อหรือ BIB ที่ค้นหา' : 'No matching name or BIB') : (th ? 'ยังไม่มีผู้เข้าเส้นชัย' : 'No finishers yet')}
                                                </div>
                                            )}
                                        </section>
                                    );
                                })}
                            </div>
                        </article>
                    ))}
                </div>

                <footer className="awb-footer">
                    <span>ACTION TIMING · {award?.name || 'Awards'}</span>
                    <Link href={resultHref}>{th ? 'เปิดหน้าผลต้นทาง ↗' : 'Open result page ↗'}</Link>
                </footer>
            </main>
        </div>
    );
}

// Scoped port of the "Age Group Awards" board design (action_age_group.html).
// Desktop (≥701px): the whole board fits the viewport; each gender panel is a size
// container, so rows and text scale with the room the grid gives them — one big card
// on a TV reads as well as a 4×3 grid of age groups. Mobile: cards stack and scroll.
const BOARD_CSS = `
.awb{--ink:#172333;--muted:#687588;--line:#e4e9ef;--accent:#ee9b12;--bg:#f3f5f8;min-height:100vh;background:var(--bg);color:var(--ink);font:15px/1.5 "Noto Sans Thai","Leelawadee UI",Tahoma,system-ui,sans-serif;-webkit-font-smoothing:antialiased}
.awb *{box-sizing:border-box}
.awb button,.awb input,.awb select{font:inherit}
.awb button,.awb select{cursor:pointer}
.awb button:focus-visible,.awb input:focus-visible,.awb select:focus-visible,.awb a:focus-visible{outline:3px solid #196dd0;outline-offset:3px}
.awb-header{background:#fff;border-bottom:1px solid var(--line);padding:15px 20px;display:flex;align-items:center;justify-content:space-between}
.awb-brand{font-size:25px;font-weight:900;letter-spacing:-1.5px}
.awb-header small{color:var(--muted);font-size:11px}
.awb-main{max-width:1600px;margin:auto;padding:25px 16px}
.awb-hero{text-align:center}
.awb-eyebrow{font-size:12px;letter-spacing:2px;font-weight:800;color:#986000;text-transform:uppercase}
.awb h1{font-size:27px;letter-spacing:-1px;margin:8px 0;font-weight:800}
.awb-dist{color:#a56800}
.awb-toolbar{display:flex;gap:8px;flex-wrap:wrap;align-items:center;padding:16px 0}
.awb-toolbar input,.awb-toolbar select{border:1px solid var(--line);border-radius:10px;background:#fff;padding:12px 14px;min-height:46px;color:var(--ink)}
.awb-toolbar select{flex:1;min-width:0}
.awb-toolbar select:disabled{opacity:.6}
.awb-search{flex:1 1 100%}
.awb-search input{width:100%}
.awb-field{display:none}
.awb-playbar label.off{opacity:.4;cursor:not-allowed}
.awb-playbar{flex-basis:100%;display:flex;align-items:center;gap:12px;flex-wrap:wrap;padding:7px 10px;border:1px solid var(--line);border-radius:8px;background:#fff;font-size:13px}
.awb-playbar label{display:flex;align-items:center;gap:4px;cursor:pointer}
.awb-playbar input{width:16px;height:16px;min-height:0;padding:0;accent-color:#ca8309}
.awb-playbar button{border:1px solid var(--line);border-radius:6px;min-height:44px;padding:4px 12px;background:#fff;color:var(--ink)}
.awb-playbar .awb-play{background:#172333;color:#fff}
.awb-play:disabled{opacity:.4}
.awb-now{font-size:14px;font-weight:800;color:#996000}
.awb-countdown{color:var(--muted)}
.awb-boardinfo{display:flex;justify-content:flex-end;margin-bottom:6px}
.awb-pager{display:flex;gap:10px;align-items:center;font-size:12px}
.awb-pager button{background:#fff;border:1px solid var(--line);border-radius:6px;min-width:32px;min-height:28px;color:var(--ink)}
.awb-pager button:disabled{opacity:.35;cursor:default}
.awb-groups{display:grid;grid-template-columns:1fr;gap:22px}
.awb-card{background:#fff;border:1px solid var(--line);border-radius:16px;overflow:hidden;box-shadow:0 4px 20px #20345004}
.awb-cardhead{display:flex;align-items:center;justify-content:space-between;gap:5px;padding:12px 16px;background:#172333;color:#fff}
.awb-cardhead h2{margin:0;font-size:21px;font-weight:800;line-height:1.2}
.awb-cardhead>span{font-size:11px;color:#b5c3d3;white-space:nowrap}
.awb-agehead{display:flex;align-items:center;gap:7px;min-width:0}
.awb-dl{display:inline-flex;align-items:center;justify-content:center;flex:none;color:#dce7f4;background:transparent;border:0;border-radius:4px;padding:2px;width:44px;height:44px}
.awb-dl:hover{background:#ffffff24;color:#fff}
.awb-dl:focus-visible{outline:2px solid #ffc34a!important;outline-offset:1px!important}
.awb-genders{display:grid;grid-template-columns:1fr}
.awb-gender{min-width:0;padding:16px}
.awb-gender+.awb-gender{border-top:1px solid var(--line)}
.awb-gender h3{font-size:15px;margin:0 0 14px;display:flex;align-items:center;gap:8px;font-weight:800}
.awb-dot{flex:none;height:8px;width:8px;border-radius:50%;background:#326fa5}
.awb-gender.female .awb-dot{background:#a95577}
.awb-gender.all .awb-dot{background:#ee9b12}
.awb-gender.male h3{color:#075d9c}
.awb-gender.female h3{color:#a12e64}
.awb-cols{display:grid;grid-template-columns:1fr}
.awb-col{min-width:0}
.awb-row{display:grid;grid-template-columns:30px minmax(0,1fr) auto;align-items:center;gap:10px;padding:15px 0;border-top:1px solid #edf0f4}
.awb-row>div{min-width:0}
.awb-rank{background:#eef1f5;border-radius:8px;height:30px;display:grid;place-items:center;font-weight:800;font-size:13px}
.awb-row.first .awb-rank{background:#fff1cf;color:#93630b}
.awb-name{font-size:16px;font-weight:600;overflow-wrap:anywhere}
.awb-meta{font-size:13px;color:var(--muted);margin-top:3px}
.awb-bib{color:#172333}
.awb-time{font-size:18px;font-weight:800;font-variant-numeric:tabular-nums;text-align:right;white-space:nowrap}
.awb-time small{display:block;font-size:10px;font-weight:400;color:var(--muted)}
.awb-empty{padding:32px;text-align:center;color:var(--muted)}
.awb-footer{margin:32px 0 10px;color:var(--muted);font-size:12px;display:flex;justify-content:space-between;gap:12px}
.awb-footer a{color:#8b5a03}
@media(min-width:701px){
 .awb{height:100vh;overflow:hidden;display:flex;flex-direction:column}
 .awb-header{padding:8px 20px;flex:none}
 .awb-brand{font-size:21px}
 .awb-main{max-width:none;width:100%;padding:12px 20px 8px;flex:1;min-height:0;display:flex;flex-direction:column}
 .awb-hero{flex:none;padding-bottom:3px}
 .awb-eyebrow{font-size:clamp(10px,.8vw,14px)}
 .awb h1{font-size:clamp(22px,2vw,40px);margin:0}
 .awb-toolbar{flex:none;flex-wrap:nowrap;gap:6px;padding:10px 0;min-width:0}
 .awb-toolbar input,.awb-toolbar select{padding:5px 10px;min-height:32px;font-size:12px}
 .awb-toolbar select{flex:0 1 auto;max-width:160px;font-size:11px;padding:5px 7px}
 .awb-search{flex:0 1 175px;min-width:100px;max-width:175px}
 .awb-field{display:flex;align-items:center;gap:6px;flex:none;font-size:11px;color:var(--muted);white-space:nowrap}
 .awb-field+.awb-field{margin-left:10px;padding-left:12px;border-left:1px solid #d5dce5}
 .awb-toolbar .awb-field select{max-width:170px}
 .awb-playbar{flex:0 1 auto;margin-left:auto;padding:4px 0;gap:7px;flex-wrap:nowrap;font-size:11px;border:0;background:transparent;min-width:0}
 .awb-playbar button{min-height:30px;padding:4px 8px;white-space:nowrap;font-size:11px}
 .awb-playbar label,.awb-playbar-label{white-space:nowrap}
 .awb-now{display:none}
 .awb-countdown{font-size:10px;min-width:100px;white-space:nowrap}
 .awb-boardinfo{flex:none}
 .awb-groups{flex:1;min-height:0;grid-template-columns:repeat(var(--cols,4),minmax(0,1fr));grid-template-rows:repeat(var(--rows,3),minmax(0,1fr));gap:8px}
 .awb-groups>.awb-empty{grid-column:1/-1;grid-row:1/-1;align-self:center}
 .awb-card{min-height:0;display:flex;flex-direction:column;border-radius:8px}
 .awb-cardhead{flex:none;padding:4px 9px;min-height:24px}
 .awb-cardhead h2{font-size:clamp(14px,1.3vw,30px)}
 .awb-cardhead>span{font-size:10px}
 .awb-dl{width:25px;height:22px}
 .awb-genders{flex:1;min-height:0;grid-template-columns:repeat(var(--panels,2),minmax(0,1fr));grid-template-rows:minmax(0,1fr)}
 .awb-gender{container-type:size;display:flex;flex-direction:column;padding:4px 8px;overflow:hidden;min-height:0}
 .awb-gender+.awb-gender{border-top:0;border-left:1px solid var(--line)}
 .awb-gender h3{flex:none;font-size:clamp(11px,4.5cqh,22px);line-height:1.6;margin:0;white-space:nowrap;overflow:hidden}
 .awb-dot{width:.45em;height:.45em}
 .awb-cols{flex:1;min-height:0;grid-template-columns:repeat(var(--split,1),minmax(0,1fr));column-gap:14px}
 .awb-col{container-type:size;min-height:0;overflow:hidden}
 .awb-col+.awb-col{border-left:1px solid var(--line);padding-left:14px}
 .awb-row{flex:none;height:calc(100cqh / var(--n,5));font-size:clamp(9px,min(calc(100cqh / var(--n,5) * .3),3.6cqw),48px);grid-template-columns:1.6em minmax(0,1fr) 5.4em;gap:.5em;padding:0;overflow:hidden}
 .awb-rank{width:1.5em;height:1.5em;font-size:.85em;border-radius:4px}
 .awb-name{font-size:1em;line-height:1.25;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
 .awb-meta{font-size:.72em;line-height:1.2;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin-top:.15em}
 .awb-time{font-size:1.08em;line-height:1.2;letter-spacing:-.3px}
 .awb-time small{display:none}
 .awb-gender .awb-empty{flex:1;display:flex;flex-direction:column;justify-content:center;font-size:11px;padding:4px}
 .awb-footer{margin:5px 0 0;font-size:9px;flex:none}
}
@media(min-width:701px) and (max-width:1150px){
 .awb-toolbar{gap:4px}
 .awb-search{flex-basis:120px;min-width:80px}
 .awb-toolbar select{font-size:10px;padding:5px 3px;max-width:125px}
 .awb-playbar{gap:4px}
 .awb-playbar-label{display:none}
 .awb-playbar label{font-size:10px}
 .awb-playbar button{padding:4px 5px;font-size:10px}
 .awb-countdown{min-width:75px;font-size:9px}
}
@media print{.awb-toolbar,.awb-dl{display:none}.awb{background:#fff}}
`;
