'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import { QRCodeCanvas } from 'qrcode.react';
import { useAuth } from '@/lib/auth-context';
import ThermalReceipt from '@/components/eslip/ThermalReceipt';
import {
    RunnerData,
    TimingRecord,
    CampaignData,
    computeTargetBandLabel,
} from '@/components/eslip/eslip-templates';
import { computeAwardsForCategory, formatAwardLabel } from '@/lib/awards';
import { isNationalitySplitCategory } from '@/lib/nationality';

/** Roles that get the auto-print E-Slip receipt flow instead of the link/QR card. */
const PRINT_ROLES = ['admin_master', 'admin', 'organizer'];

interface Campaign {
    _id: string;
    name: string;
    nameTh?: string;
    nameEn?: string;
    slug?: string;
    eventDate?: string;
}

interface Runner {
    _id: string;
    bib: string;
    firstName?: string;
    lastName?: string;
    firstNameTh?: string;
    lastNameTh?: string;
    category?: string;
    gender?: string;
    nationality?: string;
}

/* ---- inline icons (no emoji) ---- */
const IconSearch = ({ size = 18 }: { size?: number }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" /></svg>
);
const IconCopy = ({ size = 16 }: { size?: number }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /></svg>
);
const IconCheck = ({ size = 16 }: { size?: number }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
);
const IconExternal = ({ size = 16 }: { size?: number }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 3h6v6" /><path d="M10 14 21 3" /><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" /></svg>
);
const IconDownload = ({ size = 16 }: { size?: number }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" /></svg>
);
const IconEye = ({ size = 18 }: { size?: number }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" /><circle cx="12" cy="12" r="3" /></svg>
);
const IconHistory = ({ size = 15 }: { size?: number }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 12a9 9 0 1 0 3-6.7L3 8" /><path d="M3 3v5h5" /><path d="M12 7v5l3 3" /></svg>
);
const IconPrinter = ({ size = 18 }: { size?: number }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 6 2 18 2 18 9" /><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" /><rect x="6" y="14" width="12" height="8" /></svg>
);

export default function BibLinkPage() {
    const { slug } = useParams<{ slug: string }>();
    const router = useRouter();
    const { user } = useAuth();
    const isPrivileged = !!user && PRINT_ROLES.includes(user.role);

    const [campaign, setCampaign] = useState<Campaign | null>(null);
    const [loadingCampaign, setLoadingCampaign] = useState(true);
    const [campaignError, setCampaignError] = useState('');

    const [bib, setBib] = useState('');
    const [searching, setSearching] = useState(false);
    const [error, setError] = useState('');
    const [runner, setRunner] = useState<Runner | null>(null);
    const [copied, setCopied] = useState(false);

    // Admin/organizer E-Slip receipt (58mm thermal) state
    const [slip, setSlip] = useState<{ runner: RunnerData; timings: TimingRecord[]; campaign: CampaignData } | null>(null);
    const [slipAward, setSlipAward] = useState<string | null>(null);
    const [slipTarget, setSlipTarget] = useState<string | null>(null);
    const [pendingPrint, setPendingPrint] = useState(false);
    const [printed, setPrinted] = useState(false);
    const [printHistory, setPrintHistory] = useState<{ bib: string; time: string }[]>([]);

    const [origin, setOrigin] = useState('');
    const qrWrapRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        if (typeof window !== 'undefined') setOrigin(window.location.origin);
    }, []);

    const recordPrint = useCallback((printedBib: string) => {
        setPrinted(true);
        setPrintHistory(h => [
            { bib: printedBib, time: new Date().toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' }) },
            ...h,
        ].slice(0, 5));
    }, []);

    // Auto-open the browser print dialog once the (off-screen) receipt has rendered.
    useEffect(() => {
        if (!slip || !pendingPrint) return;
        setPendingPrint(false);
        const id = setTimeout(() => {
            window.print();
            // window.print() blocks until the dialog closes on most desktop browsers —
            // clear the BIB box right after so the next number can be typed immediately.
            recordPrint(slip.runner.bib);
            setBib('');
            setError('');
            inputRef.current?.focus();
        }, 100);
        return () => clearTimeout(id);
    }, [slip, pendingPrint, recordPrint]);

    // Safety net for browsers where window.print() returns before the dialog closes
    // (mobile Safari/Chrome): reset + refocus once the print dialog is dismissed,
    // so the operator can immediately type the next BIB.
    useEffect(() => {
        const onAfterPrint = () => {
            setBib('');
            setError('');
            setTimeout(() => inputRef.current?.focus(), 100);
        };
        window.addEventListener('afterprint', onAfterPrint);
        return () => window.removeEventListener('afterprint', onAfterPrint);
    }, []);

    // Load campaign by slug (or id)
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

    const runnerUrl = runner ? `${origin}/runner/${runner._id}` : '';
    const runnerName = runner
        ? (`${runner.firstName || ''} ${runner.lastName || ''}`.trim()
            || `${runner.firstNameTh || ''} ${runner.lastNameTh || ''}`.trim()
            || '-')
        : '';

    // Admin/organizer flow: resolve the runner, build a full E-Slip and either
    // auto-print it to the 58mm thermal printer (autoPrint) or show a preview.
    const handlePrintSearch = useCallback(async (term: string, autoPrint = true) => {
        if (!campaign?._id) return;
        setSearching(true);
        setError('');
        setSlip(null);
        setSlipAward(null);
        setSlipTarget(null);
        setPrinted(false);
        try {
            const lookupRes = await fetch(
                `/api/runners/lookup?campaignId=${campaign._id}&code=${encodeURIComponent(term)}`,
                { cache: 'no-store' }
            );
            const lookup = lookupRes.ok ? await lookupRes.json() : null;
            const found = lookup?.runner;
            if (!found?._id) {
                setError(`ไม่พบนักกีฬาเลข BIB "${term}" ในกิจกรรมนี้`);
                return;
            }
            // Full e-slip payload (ranks + checkpoint splits), same shape as /runner/:id/eslip.
            const detailRes = await fetch(`/api/runner/${found._id}`, { cache: 'no-store' });
            const detail = detailRes.ok ? await detailRes.json() : null;
            const r: RunnerData | undefined = detail?.data?.runner;
            if (detail?.status?.code !== '200' || !r) {
                setError(`ไม่พบข้อมูลผลการแข่งขันของ BIB "${term}"`);
                return;
            }
            if (r.status !== 'finished') {
                setError(`BIB ${r.bib} · ${`${r.firstName || ''} ${r.lastName || ''}`.trim()} ยังไม่จบการแข่งขัน — ยังไม่มี E-Slip`);
                return;
            }
            const timings: TimingRecord[] = detail.data.timingRecords || [];
            const c: CampaignData = detail.data.campaign;

            // AWARD (Overall / Age Group) — same algorithm as the e-slip page + winner boards.
            let award: string | null = null;
            if (c?._id && r.category) {
                try {
                    const p = new URLSearchParams({ campaignId: c._id, category: r.category, limit: '10000', skipStatusCounts: 'true' });
                    const poolRes = await fetch(`/api/runners/paged?${p.toString()}`, { cache: 'no-store' });
                    if (poolRes.ok) {
                        const poolData = await poolRes.json();
                        const pool = Array.isArray(poolData?.data) ? poolData.data : [];
                        const awards = computeAwardsForCategory(pool, {
                            overallDisplayCount: c.overallDisplayCount,
                            ageGroupDisplayCount: c.ageGroupDisplayCount,
                            excludeOverallFromAgeGroup: c.excludeOverallFromAgeGroup,
                            excludeOverallThaiFromAgeGroup: c.excludeOverallThaiFromAgeGroup,
                            excludeOverallForeignFromAgeGroup: c.excludeOverallForeignFromAgeGroup,
                            separateOverallByNationality: isNationalitySplitCategory(c.separateOverallNationalityCategories, r.category),
                        });
                        const mine = awards.get(r._id);
                        award = mine ? formatAwardLabel(mine) : null;
                    }
                } catch { /* award is best-effort; slip still prints without it */ }
            }

            setSlipAward(award);
            setSlipTarget(computeTargetBandLabel(r, c));
            setSlip({ runner: r, timings, campaign: c });
            if (autoPrint) setPendingPrint(true);
        } catch {
            setError('เกิดข้อผิดพลาด ลองใหม่อีกครั้ง');
        } finally {
            setSearching(false);
        }
    }, [campaign]);

    const handleSearch = useCallback(async (e?: React.FormEvent) => {
        if (e) e.preventDefault();
        const term = bib.trim();
        if (!term || !campaign?._id) return;

        if (isPrivileged) {
            await handlePrintSearch(term);
            return;
        }

        setSearching(true);
        setError('');
        setRunner(null);
        setCopied(false);
        try {
            const res = await fetch(
                `/api/runners/lookup?campaignId=${campaign._id}&code=${encodeURIComponent(term)}`,
                { cache: 'no-store' }
            );
            if (res.ok) {
                const data = await res.json();
                if (data?.found && data.runner?._id) {
                    setRunner(data.runner);
                    return;
                }
            }
            setError(`ไม่พบนักกีฬาเลข BIB "${term}" ในกิจกรรมนี้`);
        } catch {
            setError('เกิดข้อผิดพลาด ลองใหม่อีกครั้ง');
        } finally {
            setSearching(false);
        }
    }, [bib, campaign, isPrivileged, handlePrintSearch]);

    // Preview-only: fetch the slip but show it on screen instead of printing.
    const handlePreview = useCallback(async () => {
        const term = bib.trim();
        if (!term || searching) return;
        await handlePrintSearch(term, false);
    }, [bib, searching, handlePrintSearch]);

    const handleCopy = async () => {
        if (!runnerUrl) return;
        try {
            await navigator.clipboard.writeText(runnerUrl);
        } catch {
            const input = document.createElement('input');
            input.value = runnerUrl;
            document.body.appendChild(input);
            input.select();
            document.execCommand('copy');
            document.body.removeChild(input);
        }
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    // Compose a padded PNG (white bg + BIB label) from the rendered QR canvas and download it.
    const handleDownloadQr = () => {
        const srcCanvas = qrWrapRef.current?.querySelector('canvas');
        if (!srcCanvas || !runner) return;

        const qrSize = srcCanvas.width;
        const pad = Math.round(qrSize * 0.12);
        const labelH = Math.round(qrSize * 0.22);
        const out = document.createElement('canvas');
        out.width = qrSize + pad * 2;
        out.height = qrSize + pad * 2 + labelH;
        const ctx = out.getContext('2d');
        if (!ctx) return;

        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, out.width, out.height);
        ctx.drawImage(srcCanvas, pad, pad, qrSize, qrSize);
        ctx.fillStyle = '#0f172a';
        ctx.textAlign = 'center';
        ctx.font = `bold ${Math.round(qrSize * 0.11)}px sans-serif`;
        ctx.fillText(`BIB ${runner.bib}`, out.width / 2, qrSize + pad * 2 + Math.round(labelH * 0.55));

        const link = document.createElement('a');
        link.download = `runner-bib-${runner.bib}.png`;
        link.href = out.toDataURL('image/png');
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    const resetSearch = () => {
        setRunner(null);
        setSlip(null);
        setSlipAward(null);
        setSlipTarget(null);
        setPrinted(false);
        setBib('');
        setError('');
        setCopied(false);
        setTimeout(() => inputRef.current?.focus(), 0);
    };

    const genderTag = runner?.gender === 'F'
        ? { label: 'Female', symbol: '♀', color: '#db2777' }
        : runner?.gender === 'M'
            ? { label: 'Male', symbol: '♂', color: '#2563eb' }
            : null;

    if (loadingCampaign) {
        return (
            <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f8fafc', fontFamily: "'Prompt', sans-serif" }}>
                <style>{`@import url('https://fonts.googleapis.com/css2?family=Prompt:wght@300;400;500;600;700;800;900&display=swap'); @keyframes spin { to { transform: rotate(360deg); } }`}</style>
                <div style={{ width: 40, height: 40, border: '3px solid #e2e8f0', borderTopColor: '#22c55e', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
            </div>
        );
    }

    if (campaignError || !campaign) {
        return (
            <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f8fafc', fontFamily: "'Prompt', sans-serif" }}>
                <style>{`@import url('https://fonts.googleapis.com/css2?family=Prompt:wght@300;400;500;600;700;800;900&display=swap');`}</style>
                <div style={{ textAlign: 'center', padding: 32, background: '#fff', borderRadius: 16, boxShadow: '0 4px 24px rgba(0,0,0,0.08)', maxWidth: 400 }}>
                    <p style={{ color: '#ef4444', fontSize: 16, fontWeight: 700, margin: '0 0 16px' }}>{campaignError || 'ไม่พบกิจกรรม'}</p>
                    <Link href="/" style={{ color: '#22c55e', textDecoration: 'none', fontSize: 14, fontWeight: 700 }}>← กลับหน้าแรก</Link>
                </div>
            </div>
        );
    }

    /* ─────────────────────────────────────────────────────────────────────
       ADMIN / ORGANIZER: split-screen "print terminal" — controls on the left,
       a persistent LIVE PREVIEW on the right. No scrolling to see the slip.
       ───────────────────────────────────────────────────────────────────── */
    if (isPrivileged) {
        const disabled = searching || !bib.trim();
        const dateStr = (campaign.eventDate ? new Date(campaign.eventDate) : new Date())
            .toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric' });

        return (
            <div className="esp-root">
                <style>{`
                    @import url('https://fonts.googleapis.com/css2?family=Prompt:wght@300;400;500;600;700;800;900&display=swap');
                    @keyframes spin { to { transform: rotate(360deg); } }
                    @keyframes fadeUp { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
                    .esp-card { animation: fadeUp 0.28s ease both; }
                    .esp-input:focus { border-color: #16a34a !important; box-shadow: 0 0 0 4px rgba(22,163,74,0.14); }
                    .esp-btn:not(:disabled):active { transform: translateY(1px); }
                    .esp-preview-scale { transform: scale(1.42); transform-origin: center top; }
                    @media (max-width: 900px) {
                        .esp-root { flex-direction: column; height: auto; min-height: 100vh; overflow: auto; }
                        .esp-left { width: 100% !important; min-width: 0 !important; max-width: none !important; border-right: none !important; border-bottom: 1px solid #e5e7eb; }
                        .esp-right { width: 100%; padding: 44px 0 60px !important; }
                        .esp-preview-scale { transform: scale(1.2); }
                    }
                    @media print {
                        @page { size: 58mm auto; margin: 0; }
                        html, body { margin: 0 !important; padding: 0 !important; background: #fff !important; }
                        body * { visibility: hidden !important; }
                        .esp-root, .esp-right, .esp-paper, .esp-preview-scale { transform: none !important; }
                        [data-thermal-receipt], [data-thermal-receipt] * { visibility: visible !important; }
                        [data-thermal-receipt] { position: absolute !important; left: 0 !important; top: 0 !important; }
                    }
                `}</style>

                {/* ═══ LEFT — control panel ═══ */}
                <div className="esp-left" style={{ width: '46%', minWidth: 440, maxWidth: 660, display: 'flex', flexDirection: 'column', background: '#fff', borderRight: '1px solid #e5e7eb' }}>
                    {/* Header */}
                    <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 32px', borderBottom: '1px solid #eef1f4' }}>
                        <Link href="/" style={{ display: 'flex', alignItems: 'center', gap: 10, textDecoration: 'none' }}>
                            <Image src="/logo-black.png" alt="ACTION" width={78} height={26} style={{ objectFit: 'contain' }} />
                            <span style={{ fontSize: 15, fontWeight: 800, color: '#0f172a', textTransform: 'uppercase', letterSpacing: 0.3, maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {campaign.nameEn || campaign.name}
                            </span>
                        </Link>
                        <div style={{ textAlign: 'right', lineHeight: 1.35 }}>
                            <div style={{ fontSize: 11, fontWeight: 800, color: '#0f172a' }}>Admin Terminal</div>
                            <div style={{ fontSize: 11, fontWeight: 600, color: '#94a3b8' }}>{dateStr}</div>
                        </div>
                    </header>

                    {/* Body */}
                    <div style={{ flex: 1, overflowY: 'auto', padding: 32, display: 'flex', flexDirection: 'column', gap: 22 }}>
                        {/* Title */}
                        <div>
                            <h1 style={{ fontSize: 30, fontWeight: 900, margin: 0, color: '#0f172a', letterSpacing: 0.2 }}>พิมพ์ใบ E-Slip</h1>
                            <p style={{ fontSize: 14, color: '#64748b', fontWeight: 500, margin: '6px 0 0' }}>
                                กรอกหมายเลข BIB ของนักวิ่งเพื่อพิมพ์ใบรับรองผลการแข่งขัน
                            </p>
                        </div>

                        {/* BIB input + actions */}
                        <form onSubmit={handleSearch} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                            <div style={{ background: '#f1f5f9', borderRadius: 18, padding: 18, border: '1px solid #e2e8f0' }}>
                                <label style={{ display: 'block', fontSize: 11, fontWeight: 800, color: '#94a3b8', letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 10 }}>
                                    BIB Number
                                </label>
                                <input
                                    ref={inputRef}
                                    className="esp-input"
                                    type="text"
                                    inputMode="numeric"
                                    value={bib}
                                    onChange={e => { setBib(e.target.value); setError(''); }}
                                    placeholder="0000"
                                    autoFocus
                                    style={{
                                        width: '100%', padding: '14px 12px', borderRadius: 14,
                                        border: '2px solid #16a34a', background: '#fff',
                                        fontSize: 58, fontWeight: 900, textAlign: 'center', letterSpacing: 4,
                                        outline: 'none', color: '#0f172a', boxSizing: 'border-box',
                                        fontFamily: 'inherit', lineHeight: 1.1,
                                        transition: 'border-color 0.15s, box-shadow 0.15s',
                                    }}
                                />
                            </div>

                            <button
                                type="submit"
                                className="esp-btn"
                                disabled={disabled}
                                style={{
                                    width: '100%', padding: '17px', borderRadius: 16, border: 'none',
                                    background: disabled ? '#cbd5e1' : '#0a7d3c', color: '#fff',
                                    fontWeight: 800, fontSize: 19, cursor: disabled ? 'not-allowed' : 'pointer',
                                    fontFamily: 'inherit', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
                                    boxShadow: disabled ? 'none' : '0 8px 20px rgba(10,125,60,0.22)',
                                    transition: 'background 0.15s, transform 0.05s, box-shadow 0.15s',
                                }}
                            >
                                {searching
                                    ? <><span style={{ width: 18, height: 18, border: '2.5px solid rgba(255,255,255,0.4)', borderTopColor: '#fff', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />กำลังเตรียมใบเสร็จ...</>
                                    : <><IconPrinter size={20} />พิมพ์ใบเสร็จ E-Slip</>}
                            </button>

                            <button
                                type="button"
                                className="esp-btn"
                                onClick={handlePreview}
                                disabled={disabled}
                                style={{
                                    width: '100%', padding: '15px', borderRadius: 16,
                                    border: '2px solid', borderColor: disabled ? '#e2e8f0' : '#0a7d3c',
                                    background: '#fff', color: disabled ? '#cbd5e1' : '#0a7d3c',
                                    fontWeight: 800, fontSize: 16, cursor: disabled ? 'not-allowed' : 'pointer',
                                    fontFamily: 'inherit', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 9,
                                    transition: 'border-color 0.15s, color 0.15s, transform 0.05s',
                                }}
                            >
                                <IconEye size={18} />ดูตัวอย่างก่อนพิมพ์
                            </button>
                        </form>

                        {/* Error */}
                        {error && (
                            <div className="esp-card" style={{ background: '#fef2f2', border: '1px solid #fecaca', color: '#b91c1c', padding: '12px 14px', borderRadius: 12, fontSize: 14, fontWeight: 600, textAlign: 'center' }}>
                                {error}
                            </div>
                        )}

                        {/* Sent-to-printer confirmation */}
                        {printed && (
                            <div className="esp-card" style={{ background: '#ecfdf3', border: '1px solid #bbf7d0', color: '#15803d', padding: '13px 15px', borderRadius: 12, fontSize: 14, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 9 }}>
                                <IconCheck size={17} />ส่งข้อมูลไปยังเครื่องพิมพ์แล้ว — พร้อมรับ BIB ถัดไป
                            </div>
                        )}

                        {/* Print history */}
                        {printHistory.length > 0 && (
                            <div style={{ borderTop: '1px solid #eef1f4', paddingTop: 18 }}>
                                <h3 style={{ fontSize: 12, fontWeight: 800, color: '#64748b', letterSpacing: 1, textTransform: 'uppercase', margin: '0 0 10px' }}>ประวัติการพิมพ์ล่าสุด</h3>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                                    {printHistory.map((h, i) => (
                                        <div key={`${h.bib}-${i}`} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: i === 0 ? '#f1f5f9' : '#f8fafc', border: '1px solid #eef1f4', borderRadius: 12, padding: '11px 14px' }}>
                                            <span style={{ display: 'flex', alignItems: 'center', gap: 9, fontSize: 14, fontWeight: i === 0 ? 800 : 600, color: i === 0 ? '#0f172a' : '#64748b' }}>
                                                <span style={{ color: i === 0 ? '#16a34a' : '#94a3b8', display: 'flex' }}><IconHistory /></span>BIB {h.bib}
                                            </span>
                                            <span style={{ fontSize: 13, fontWeight: 600, color: '#94a3b8' }}>{h.time}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Footer */}
                    <footer style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '11px 32px', borderTop: '1px solid #eef1f4', fontSize: 11, color: '#94a3b8', fontWeight: 600 }}>
                        <span style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                            <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#16a34a' }} />
                            Epson TM-T88VI (Ready)
                        </span>
                        <span>© {new Date().getFullYear()} Action Timing</span>
                    </footer>
                </div>

                {/* ═══ RIGHT — persistent live preview ═══ */}
                <div className="esp-right" style={{ flex: 1, position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 26, overflow: 'hidden', background: '#f2f4f6', padding: '40px 20px' }}>
                    {/* Dotted backdrop */}
                    <div style={{ position: 'absolute', inset: 0, opacity: 0.04, pointerEvents: 'none', backgroundImage: 'radial-gradient(#000 1px, transparent 1px)', backgroundSize: '20px 20px' }} />

                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, fontSize: 12, fontWeight: 800, letterSpacing: 3, textTransform: 'uppercase', color: '#94a3b8', zIndex: 1 }}>
                        <span style={{ width: 32, height: 1, background: '#cbd5e1' }} />Live Preview<span style={{ width: 32, height: 1, background: '#cbd5e1' }} />
                    </div>

                    {slip ? (
                        <div className="esp-card esp-paper" style={{ zIndex: 1, background: '#fff', borderRadius: 6, boxShadow: '0 20px 50px rgba(0,0,0,0.12)', border: '1px solid #e5e7eb', padding: '26px 30px' }}>
                            <div className="esp-preview-scale">
                                <ThermalReceipt
                                    runner={slip.runner}
                                    timings={slip.timings}
                                    campaign={slip.campaign}
                                    awardLabel={slipAward}
                                    targetBandLabel={slipTarget}
                                />
                            </div>
                        </div>
                    ) : (
                        <div style={{ zIndex: 1, textAlign: 'center', color: '#94a3b8', maxWidth: 300, lineHeight: 1.7 }}>
                            <div style={{ width: 66, height: 66, borderRadius: '50%', background: '#e8ebee', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px', color: '#b6bcc4' }}>
                                <IconPrinter size={30} />
                            </div>
                            <div style={{ fontSize: 15, fontWeight: 700, color: '#64748b' }}>ยังไม่มีตัวอย่างใบเสร็จ</div>
                            <div style={{ fontSize: 13, fontWeight: 500, marginTop: 4 }}>กรอกเลข BIB แล้วกดพิมพ์ หรือกด “ดูตัวอย่างก่อนพิมพ์” เพื่อแสดงใบเสร็จที่นี่</div>
                        </div>
                    )}
                </div>
            </div>
        );
    }

    return (
        <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', background: '#f8fafc', fontFamily: "'Prompt', sans-serif", color: '#1e293b' }}>
            <style>{`
                @import url('https://fonts.googleapis.com/css2?family=Prompt:wght@300;400;500;600;700;800;900&display=swap');
                @keyframes spin { to { transform: rotate(360deg); } }
                @keyframes fadeUp { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
                .bl-card { animation: fadeUp 0.28s ease both; }
                .bl-input:focus { border-color: #22c55e !important; box-shadow: 0 0 0 4px rgba(34,197,94,0.12); }
                .bl-btn-primary:not(:disabled):active { transform: translateY(1px); }
            `}</style>

            {/* HEADER */}
            <header style={{ background: '#fff', borderBottom: '1px solid #e2e8f0', padding: '10px 16px', boxShadow: '0 1px 3px rgba(0,0,0,0.04)', position: 'sticky', top: 0, zIndex: 50 }}>
                <div style={{ maxWidth: 560, margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        <Link href="/" style={{ display: 'flex', alignItems: 'center', borderRight: '1px solid #e2e8f0', paddingRight: 12, textDecoration: 'none' }}>
                            <Image src="/logo-black.png" alt="ACTION" width={80} height={26} style={{ objectFit: 'contain' }} />
                        </Link>
                        <span style={{ fontSize: 18, fontWeight: 700, color: '#22c55e', textTransform: 'uppercase' }}>Live</span>
                    </div>
                    <button onClick={() => router.push('/')} style={{ fontSize: 12, fontWeight: 700, color: '#64748b', background: 'none', border: 'none', cursor: 'pointer' }}>
                        ← หน้าแรก
                    </button>
                </div>
            </header>

            <main style={{ flex: '1 0 auto', width: '100%', maxWidth: 480, margin: '0 auto', padding: '24px 16px 48px', display: 'flex', flexDirection: 'column', gap: 16 }}>
                {/* Title */}
                <div style={{ textAlign: 'center' }}>
                    <h1 style={{ fontSize: 24, fontWeight: 800, margin: 0, color: '#0f172a', letterSpacing: 0.2 }}>
                        ค้นหานักกีฬาด้วยเลข BIB
                    </h1>
                    <p style={{ fontSize: 13, color: '#64748b', fontWeight: 600, margin: '6px 0 0' }}>
                        {campaign.nameTh || campaign.nameEn || campaign.name}
                    </p>
                </div>

                {/* Search form */}
                <form onSubmit={handleSearch} style={{ background: '#fff', borderRadius: 16, padding: 20, boxShadow: '0 4px 24px rgba(0,0,0,0.08)' }}>
                    <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#94a3b8', marginBottom: 10, textAlign: 'center', letterSpacing: 1, textTransform: 'uppercase' }}>
                        กรอกเลข BIB นักกีฬา
                    </label>
                    <input
                        ref={inputRef}
                        className="bl-input"
                        type="text"
                        inputMode="numeric"
                        value={bib}
                        onChange={e => { setBib(e.target.value); setError(''); }}
                        placeholder="0000"
                        autoFocus
                        style={{
                            width: '100%',
                            padding: '18px 14px',
                            borderRadius: 14,
                            border: '2px solid #e2e8f0',
                            fontSize: 40,
                            fontWeight: 800,
                            textAlign: 'center',
                            letterSpacing: 6,
                            outline: 'none',
                            color: '#0f172a',
                            boxSizing: 'border-box',
                            fontFamily: 'inherit',
                            transition: 'border-color 0.15s, box-shadow 0.15s',
                        }}
                    />
                    <button
                        type="submit"
                        className="bl-btn-primary"
                        disabled={searching || !bib.trim()}
                        style={{
                            width: '100%',
                            marginTop: 14,
                            padding: '15px',
                            borderRadius: 14,
                            border: 'none',
                            background: searching || !bib.trim() ? '#cbd5e1' : '#22c55e',
                            color: '#fff',
                            fontWeight: 800,
                            fontSize: 16,
                            cursor: searching || !bib.trim() ? 'not-allowed' : 'pointer',
                            fontFamily: 'inherit',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: 8,
                            transition: 'background 0.15s, transform 0.05s',
                        }}
                    >
                        {searching
                            ? <><span style={{ width: 16, height: 16, border: '2.5px solid rgba(255,255,255,0.4)', borderTopColor: '#fff', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />กำลังค้นหา...</>
                            : <><IconSearch />ค้นหา</>}
                    </button>
                </form>

                {/* Error */}
                {error && (
                    <div style={{ background: '#fef2f2', border: '1px solid #fecaca', color: '#b91c1c', padding: '12px 14px', borderRadius: 12, fontSize: 14, fontWeight: 600, textAlign: 'center' }}>
                        {error}
                    </div>
                )}

                {/* Result card (public / non-print roles) */}
                {!isPrivileged && runner && (
                    <div className="bl-card" style={{ background: '#fff', borderRadius: 16, padding: 20, boxShadow: '0 4px 24px rgba(0,0,0,0.08)', display: 'flex', flexDirection: 'column', gap: 18 }}>
                        {/* Runner header */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', background: '#0f172a', color: '#fff', borderRadius: 12, padding: '8px 14px', minWidth: 68 }}>
                                <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: 1, color: '#94a3b8', textTransform: 'uppercase' }}>BIB</span>
                                <span style={{ fontSize: 24, fontWeight: 900, lineHeight: 1.1 }}>{runner.bib}</span>
                            </div>
                            <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ fontWeight: 800, fontSize: 18, color: '#0f172a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{runnerName}</div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginTop: 3 }}>
                                    {runner.category && <span style={{ fontSize: 13, color: '#64748b', fontWeight: 700 }}>{runner.category}</span>}
                                    {genderTag && (
                                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, color: genderTag.color, fontWeight: 700, fontSize: 13 }}>
                                            <span style={{ fontSize: 15, lineHeight: 1 }}>{genderTag.symbol}</span>{genderTag.label}
                                        </span>
                                    )}
                                </div>
                            </div>
                        </div>

                        {/* Link box */}
                        <div>
                            <div style={{ fontSize: 10, fontWeight: 700, color: '#94a3b8', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 6 }}>
                                ลิงก์หน้าผลนักกีฬา
                            </div>
                            <code style={{ display: 'block', fontSize: 12, color: '#334155', fontFamily: 'monospace', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 10, padding: '10px 12px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {runnerUrl}
                            </code>
                        </div>

                        {/* Actions */}
                        <div style={{ display: 'flex', gap: 10 }}>
                            <button
                                onClick={handleCopy}
                                style={{
                                    flex: 1, padding: '13px', borderRadius: 12, border: 'none',
                                    background: copied ? '#16a34a' : '#0f172a', color: '#fff',
                                    fontWeight: 700, fontSize: 14, cursor: 'pointer', fontFamily: 'inherit',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7,
                                    transition: 'background 0.15s',
                                }}
                            >
                                {copied ? <><IconCheck />คัดลอกแล้ว</> : <><IconCopy />คัดลอกลิงก์</>}
                            </button>
                            <a
                                href={runnerUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                style={{
                                    flex: 1, padding: '13px', borderRadius: 12, background: '#2563eb', color: '#fff',
                                    fontWeight: 700, fontSize: 14, textAlign: 'center', textDecoration: 'none', fontFamily: 'inherit',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7,
                                }}
                            >
                                <IconExternal />เปิดลิงก์
                            </a>
                        </div>

                        {/* QR code */}
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14, paddingTop: 16, borderTop: '1px dashed #e2e8f0' }}>
                            <div style={{ fontSize: 12, color: '#64748b', fontWeight: 700 }}>
                                สแกน QR เพื่อเปิดหน้าผลนักกีฬา
                            </div>
                            <div ref={qrWrapRef} style={{ padding: 14, background: '#fff', borderRadius: 16, border: '1px solid #e2e8f0', boxShadow: '0 2px 12px rgba(0,0,0,0.06)' }}>
                                <QRCodeCanvas value={runnerUrl} size={200} level="M" includeMargin={false} />
                            </div>
                            <button
                                onClick={handleDownloadQr}
                                style={{
                                    width: '100%', padding: '13px', borderRadius: 12,
                                    border: '2px solid #22c55e', background: '#f0fdf4', color: '#16a34a',
                                    fontWeight: 700, fontSize: 14, cursor: 'pointer', fontFamily: 'inherit',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7,
                                }}
                            >
                                <IconDownload />ดาวน์โหลด QR Code
                            </button>
                        </div>

                        {/* Search again */}
                        <button
                            onClick={resetSearch}
                            style={{ background: 'transparent', border: 'none', color: '#94a3b8', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}
                        >
                            ค้นหาเลข BIB อื่น
                        </button>
                    </div>
                )}

                {!runner && !error && (
                    <div style={{ color: '#94a3b8', fontSize: 12, fontWeight: 600, textAlign: 'center', marginTop: 4, lineHeight: 1.6 }}>
                        กรอกเลข BIB แล้วกดค้นหา<br />เพื่อรับลิงก์และ QR Code ของนักกีฬาคนนั้น
                    </div>
                )}
            </main>
        </div>
    );
}
