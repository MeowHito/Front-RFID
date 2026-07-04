'use client';

import { useEffect, useState, useRef, useCallback, ReactNode } from 'react';
import { useParams } from 'next/navigation';
import { QRCodeSVG } from 'qrcode.react';
import { computeAwardsForCategory, formatAwardLabel } from '@/lib/awards';
import { isNationalitySplitCategory } from '@/lib/nationality';
import {
    RunnerData,
    TimingRecord,
    CampaignData,
    computeTargetBandLabel,
    Template2,
    Template3,
} from '@/components/eslip/eslip-templates';

/**
 * Scales its child (a fixed-width E-Slip card) to fill the viewport while
 * preserving aspect ratio — works for portrait & landscape, 1080p → 4K.
 * The card renders at a natural 360px width; we measure its laid-out size
 * (transform doesn't affect offset*) and scale to fit the available box.
 */
function ScaledDisplay({ children, recalcKey }: { children: ReactNode; recalcKey: unknown }) {
    const outerRef = useRef<HTMLDivElement>(null);
    const innerRef = useRef<HTMLDivElement>(null);
    const [scale, setScale] = useState(1);

    useEffect(() => {
        const recalc = () => {
            const outer = outerRef.current, inner = innerRef.current;
            if (!outer || !inner) return;
            const availW = outer.clientWidth * 0.94;
            const availH = outer.clientHeight * 0.94;
            const cw = inner.offsetWidth, ch = inner.offsetHeight;
            if (!cw || !ch) return;
            setScale(Math.max(0.2, Math.min(availW / cw, availH / ch)));
        };
        recalc();
        const ro = new ResizeObserver(recalc);
        if (outerRef.current) ro.observe(outerRef.current);
        if (innerRef.current) ro.observe(innerRef.current);
        window.addEventListener('resize', recalc);
        // Re-measure shortly after content swaps (fonts/images settle).
        const t = setTimeout(recalc, 120);
        return () => { ro.disconnect(); window.removeEventListener('resize', recalc); clearTimeout(t); };
    }, [recalcKey]);

    return (
        <div ref={outerRef} style={{ position: 'fixed', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
            <div ref={innerRef} style={{ width: 360, position: 'relative', transform: `scale(${scale})`, transformOrigin: 'center center', flexShrink: 0 }}>
                {children}
            </div>
        </div>
    );
}

export default function ScanningSlipPage() {
    const params = useParams();
    const slug = params.slug as string;
    const slipRef = useRef<HTMLDivElement>(null);

    const [campaign, setCampaign] = useState<CampaignData | null>(null);
    const [campaignNotFound, setCampaignNotFound] = useState(false);
    const [scanCode, setScanCode] = useState('');
    const [loading, setLoading] = useState(false);
    const [runner, setRunner] = useState<RunnerData | null>(null);
    const [timings, setTimings] = useState<TimingRecord[]>([]);
    const [found, setFound] = useState<boolean | null>(null);
    const [animKey, setAnimKey] = useState(0);
    const [awardLabel, setAwardLabel] = useState<string | null>(null);
    const [targetBandLabel, setTargetBandLabel] = useState<string | null>(null);
    const [photoUrl, setPhotoUrl] = useState<string | null>(null);
    const [origin, setOrigin] = useState('');
    const [isFullscreen, setIsFullscreen] = useState(false);
    const hiddenInputRef = useRef<HTMLInputElement>(null);

    const template = campaign?.slipScanTemplate === 'template2' ? 'template2' : 'template3';
    const isPhoto = template === 'template2';

    // Load campaign by slug (full document — carries slipScanTemplate + e-slip config)
    useEffect(() => {
        if (!slug) return;
        (async () => {
            try {
                const res = await fetch(`/api/campaigns/${encodeURIComponent(slug)}?full=true`, { cache: 'no-store' });
                if (res.ok) setCampaign(await res.json());
                else setCampaignNotFound(true);
            } catch {
                setCampaignNotFound(true);
            }
        })();
    }, [slug]);

    useEffect(() => { setOrigin(window.location.origin); }, []);

    useEffect(() => {
        const syncFullscreen = () => setIsFullscreen(!!document.fullscreenElement);
        syncFullscreen();
        document.addEventListener('fullscreenchange', syncFullscreen);
        return () => document.removeEventListener('fullscreenchange', syncFullscreen);
    }, []);

    const toggleFullscreen = useCallback(async () => {
        try {
            if (document.fullscreenElement) { await document.exitFullscreen(); return; }
            await document.documentElement.requestFullscreen();
        } catch { }
    }, []);

    // Keep the hidden RFID input focused so scans always land.
    useEffect(() => {
        const keepFocus = () => hiddenInputRef.current?.focus();
        keepFocus();
        const interval = setInterval(keepFocus, 500);
        document.addEventListener('click', keepFocus);
        return () => { clearInterval(interval); document.removeEventListener('click', keepFocus); };
    }, []);

    // Compute AWARD (Overall / Age Group) for the scanned runner — same algorithm
    // as the public event table + e-slip page.
    useEffect(() => {
        if (!runner || !campaign?._id || !runner.category) { setAwardLabel(null); return; }
        let cancelled = false;
        (async () => {
            try {
                const p = new URLSearchParams({ campaignId: campaign._id, category: runner.category, limit: '10000', skipStatusCounts: 'true' });
                const res = await fetch(`/api/runners/paged?${p.toString()}`, { cache: 'no-store' });
                if (!res.ok) { if (!cancelled) setAwardLabel(null); return; }
                const data = await res.json();
                const pool = Array.isArray(data?.data) ? data.data : [];
                const awards = computeAwardsForCategory(pool, {
                    overallDisplayCount: campaign.overallDisplayCount,
                    ageGroupDisplayCount: campaign.ageGroupDisplayCount,
                    excludeOverallFromAgeGroup: campaign.excludeOverallFromAgeGroup,
                    excludeOverallThaiFromAgeGroup: campaign.excludeOverallThaiFromAgeGroup,
                    excludeOverallForeignFromAgeGroup: campaign.excludeOverallForeignFromAgeGroup,
                    separateOverallByNationality: isNationalitySplitCategory(campaign.separateOverallNationalityCategories, runner.category),
                });
                const mine = awards.get(runner._id);
                if (!cancelled) setAwardLabel(mine ? formatAwardLabel(mine) : null);
            } catch { if (!cancelled) setAwardLabel(null); }
        })();
        return () => { cancelled = true; };
    }, [runner, campaign]);

    // Poll for the runner's uploaded photo (Photo template only, until one appears).
    useEffect(() => {
        if (!isPhoto || !runner?._id || photoUrl) return;
        const id = runner._id;
        const interval = setInterval(async () => {
            try {
                const res = await fetch(`/api/runners/${id}`, { cache: 'no-store' });
                if (res.ok) {
                    const data = await res.json();
                    if (data.photoUrl) setPhotoUrl(data.photoUrl);
                }
            } catch { /* ignore polling errors */ }
        }, 2000);
        return () => clearInterval(interval);
    }, [isPhoto, runner, photoUrl]);

    const handleScan = useCallback(async () => {
        const code = scanCode.trim();
        if (!code || loading) return;
        setLoading(true);
        setPhotoUrl(null);
        try {
            const lookupParams = new URLSearchParams({ campaignId: campaign?._id || '', code });
            const lookupRes = await fetch(`/api/runners/lookup?${lookupParams.toString()}`);
            const lookup = await lookupRes.json();
            const found = lookup.runner || null;
            if (!found?._id) {
                setRunner(null); setTimings([]); setFound(false); setAnimKey(k => k + 1);
                return;
            }
            // Fetch full e-slip data (ranks + checkpoint splits).
            const detailRes = await fetch(`/api/runner/${found._id}`, { cache: 'no-store' });
            const detail = await detailRes.json();
            if (detail?.status?.code === '200' && detail.data?.runner) {
                const r: RunnerData = detail.data.runner;
                setRunner(r);
                setTimings(detail.data.timingRecords || []);
                setTargetBandLabel(computeTargetBandLabel(r, campaign));
                // Photo template: if the runner already has a photo, show it right
                // away; otherwise leave it null so the QR-upload prompt appears.
                setPhotoUrl(isPhoto ? (found.photoUrl || null) : null);
                setFound(true);
                setAnimKey(k => k + 1);
            } else {
                setRunner(null); setTimings([]); setFound(false); setAnimKey(k => k + 1);
            }
        } catch {
            setRunner(null); setTimings([]); setFound(false); setAnimKey(k => k + 1);
        } finally {
            setLoading(false); setScanCode('');
        }
    }, [scanCode, loading, campaign, isPhoto]);

    const showField = useCallback((key: string) => {
        const vf = campaign?.eslipVisibleFields;
        const hasAgeGroup = !!runner?.ageGroup;
        if (!hasAgeGroup && (key === 'categoryRank' || key === 'ageGroup')) return false;
        return !vf || vf.length === 0 || vf.includes(key);
    }, [campaign, runner]);

    if (campaignNotFound) {
        return (
            <>
                <link href="https://fonts.googleapis.com/css2?family=Prompt:wght@400;600;700;800;900&display=swap" rel="stylesheet" />
                <div style={{ position: 'fixed', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: '#020617', fontFamily: "'Prompt', sans-serif" }}>
                    <div style={{ fontSize: 80, marginBottom: 24 }}>❌</div>
                    <div style={{ fontSize: 36, fontWeight: 900, color: '#ef4444', marginBottom: 8 }}>ไม่พบกิจกรรม</div>
                    <div style={{ fontSize: 18, color: '#94a3b8' }}>Campaign Not Found — กรุณาตรวจสอบลิงก์อีกครั้ง</div>
                    <div style={{ fontSize: 14, color: '#64748b', marginTop: 20 }}>slug: {slug}</div>
                </div>
            </>
        );
    }

    const campaignName = campaign?.name || 'RFID Running Event';
    const showQr = isPhoto && !photoUrl && !!runner?._id && !!origin;
    const bgTone = isPhoto ? '#0f172a' : '#e2e8f0';

    return (
        <>
            <link href="https://fonts.googleapis.com/css2?family=Prompt:wght@400;600;700;800;900&display=swap" rel="stylesheet" />
            <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css" />
            <style>{`
                @keyframes slipFadeIn { from { opacity: 0; transform: translateY(24px); } to { opacity: 1; transform: translateY(0); } }
                @keyframes slipPulse { 0%,100% { opacity: 1; } 50% { opacity: 0.6; } }
            `}</style>

            <input ref={hiddenInputRef} value={scanCode}
                onChange={e => setScanCode(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') handleScan(); }}
                style={{ position: 'fixed', top: -100, left: -100, opacity: 0 }} autoFocus />

            <div style={{ position: 'fixed', inset: 0, background: bgTone, transition: 'background 0.4s' }} />

            {/* Fullscreen toggle */}
            <button onClick={toggleFullscreen} style={{
                position: 'fixed', left: 16, bottom: 16, zIndex: 100, height: 40, padding: '0 16px',
                borderRadius: 8, border: '1px solid rgba(148,163,184,0.35)', background: 'rgba(15,23,42,0.55)',
                color: '#fff', fontSize: 13, cursor: 'pointer', backdropFilter: 'blur(10px)', fontWeight: 800,
                display: 'flex', alignItems: 'center', gap: 8, fontFamily: "'Prompt', sans-serif",
            }}>
                <i className={isFullscreen ? 'fa-solid fa-compress' : 'fa-solid fa-expand'} />
                {isFullscreen ? 'Exit Full Screen' : 'Full Screen'}
            </button>

            {/* Loading */}
            {loading && (
                <div style={{ position: 'fixed', inset: 0, zIndex: 90, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(4px)', fontFamily: "'Prompt', sans-serif" }}>
                    <div style={{ color: '#4ade80', fontSize: 24, fontWeight: 800 }}>
                        <i className="fas fa-spinner fa-spin" style={{ marginRight: 12 }} /> กำลังค้นหา...
                    </div>
                </div>
            )}

            {/* NOT FOUND */}
            {found === false && !runner && (
                <div key={`nf-${animKey}`} style={{ position: 'fixed', inset: 0, zIndex: 80, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: '#020617', animation: 'slipFadeIn 0.5s ease-out', fontFamily: "'Prompt', sans-serif" }}>
                    <div style={{ fontSize: 80, marginBottom: 24 }}>❌</div>
                    <div style={{ fontSize: 36, fontWeight: 900, color: '#ef4444', marginBottom: 8 }}>ไม่พบนักวิ่ง</div>
                    <div style={{ fontSize: 18, color: '#94a3b8' }}>Runner Not Found — สแกนใหม่เพื่อลองอีกครั้ง</div>
                </div>
            )}

            {/* WAITING */}
            {found === null && (
                <div style={{ position: 'fixed', inset: 0, zIndex: 70, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: '#020617', fontFamily: "'Prompt', sans-serif" }}>
                    <div style={{ fontSize: 80, marginBottom: 24, animation: 'slipPulse 2s ease-in-out infinite' }}>🎫</div>
                    <div style={{ fontSize: 36, fontWeight: 900, color: '#fff', marginBottom: 8 }}>รอการสแกน</div>
                    <div style={{ fontSize: 18, color: '#94a3b8' }}>สแกนบิบเพื่อแสดง E-Slip</div>
                    <div style={{ fontSize: 14, color: '#64748b', marginTop: 20 }}>{campaignName}</div>
                </div>
            )}

            {/* NOT FINISHED YET */}
            {found && runner && runner.status !== 'finished' && (
                <div key={`nf2-${animKey}`} style={{ position: 'fixed', inset: 0, zIndex: 80, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: '#020617', animation: 'slipFadeIn 0.5s ease-out', fontFamily: "'Prompt', sans-serif", padding: 24, textAlign: 'center' }}>
                    <div style={{ fontSize: 80, marginBottom: 24, animation: 'slipPulse 2s ease-in-out infinite' }}>⏳</div>
                    <div style={{ fontSize: 34, fontWeight: 900, color: '#fbbf24', marginBottom: 8 }}>ยังไม่จบการแข่งขัน</div>
                    <div style={{ fontSize: 18, color: '#94a3b8' }}>BIB {runner.bib} · {`${runner.firstName} ${runner.lastName}`.trim()}</div>
                    <div style={{ fontSize: 15, color: '#64748b', marginTop: 12 }}>E-Slip จะแสดงเมื่อนักวิ่ง Finish แล้วเท่านั้น</div>
                </div>
            )}

            {/* E-SLIP DISPLAY */}
            {found && runner && runner.status === 'finished' && (
                <ScaledDisplay recalcKey={`${animKey}-${template}-${photoUrl ? 'p' : 'n'}`}>
                    <div key={`slip-${animKey}`} style={{ animation: 'slipFadeIn 0.6s cubic-bezier(0.16,1,0.3,1)', fontFamily: "'Prompt', sans-serif" }}>
                        {isPhoto ? (
                            <Template2 runner={runner} timings={timings} campaign={campaign} slipRef={slipRef} showField={showField} bgImage={photoUrl} textColorMode={photoUrl ? 'light' : 'dark'} awardLabel={awardLabel} targetBandLabel={targetBandLabel} />
                        ) : (
                            <Template3 runner={runner} timings={timings} campaign={campaign} slipRef={slipRef} showField={showField} bgImage={null} awardLabel={awardLabel} targetBandLabel={targetBandLabel} />
                        )}

                        {/* QR — Photo template only, until the runner uploads a photo */}
                        {showQr && (
                            <div style={{ position: 'absolute', bottom: 14, right: 14, background: '#fff', padding: 10, borderRadius: 12, boxShadow: '0 8px 20px rgba(0,0,0,0.35)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
                                <QRCodeSVG
                                    value={`${origin}/scanning-slip/${campaign?.slug || slug}/photo/${runner._id}`}
                                    size={120} bgColor="#ffffff" fgColor="#0f172a" level="H"
                                />
                                <span style={{ fontSize: 10, fontWeight: 800, color: '#0f172a', textTransform: 'uppercase', letterSpacing: 1 }}>สแกนเพื่อใส่รูป</span>
                            </div>
                        )}
                    </div>
                </ScaledDisplay>
            )}
        </>
    );
}
