'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import {
    BIB_FONT_HREF, BibCanvasView, normalizeLayout, defaultFinishTimeLayout,
    type BibCheck2Layout, type BibRunner, type BibCampaign, type Orientation, type RenderContext,
} from '@/lib/bibcheck2';

interface Campaign extends BibCampaign {
    finishTimeLayout?: unknown;
}

/** What the clock shows before anyone has been scanned. */
const IDLE_RUNNER: BibRunner = { gunTimeStr: '00:00:00', netTimeStr: '00:00:00' };

/**
 * Finish Time display — renders the banner designed in /admin/finish-time,
 * letterboxed to the screen. Scan (RFID reader / barcode / typed bib + Enter)
 * → that runner's BIB and Gun Time fill the design. Unlike Check BIB this does
 * NOT stamp a check-in.
 *
 * `?hold=N` returns to the idle banner N seconds after a scan (default: stay
 * until the next scan).
 */
export default function FinishTimePage() {
    const params = useParams();
    const searchParams = useSearchParams();
    const slug = params.slug as string;
    const holdSeconds = Math.max(0, Number(searchParams.get('hold')) || 0);

    const [campaign, setCampaign] = useState<Campaign | null>(null);
    const [campaignNotFound, setCampaignNotFound] = useState(false);
    const [layout, setLayout] = useState<BibCheck2Layout | null>(null);
    const [scanCode, setScanCode] = useState('');
    const [loading, setLoading] = useState(false);
    const [runner, setRunner] = useState<BibRunner | null>(null);
    const [notice, setNotice] = useState<{ text: string; tone: 'error' | 'warn' } | null>(null);
    const [animKey, setAnimKey] = useState(0);
    const [orientation, setOrientation] = useState<Orientation>('landscape');
    const [isFullscreen, setIsFullscreen] = useState(false);
    const [viewport, setViewport] = useState({ w: 1280, h: 720 });
    const [controlsVisible, setControlsVisible] = useState(true);

    const hiddenInputRef = useRef<HTMLInputElement>(null);
    const noticeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const holdTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

    // Load campaign + saved design
    useEffect(() => {
        if (!slug) return;
        (async () => {
            try {
                const res = await fetch(`/api/campaigns/${encodeURIComponent(slug)}?full=true`, { cache: 'no-store' });
                if (!res.ok) { setCampaignNotFound(true); return; }
                const data = await res.json();
                setCampaign(data);
                setLayout(normalizeLayout(data.finishTimeLayout, defaultFinishTimeLayout()));
            } catch {
                setCampaignNotFound(true);
            }
        })();
    }, [slug]);

    // Track viewport so the canvas can be scaled to fit
    useEffect(() => {
        const update = () => setViewport({ w: window.innerWidth, h: window.innerHeight });
        update();
        window.addEventListener('resize', update);
        window.addEventListener('orientationchange', update);
        return () => {
            window.removeEventListener('resize', update);
            window.removeEventListener('orientationchange', update);
        };
    }, []);

    useEffect(() => {
        const syncFullscreen = () => setIsFullscreen(!!document.fullscreenElement);
        syncFullscreen();
        document.addEventListener('fullscreenchange', syncFullscreen);
        return () => document.removeEventListener('fullscreenchange', syncFullscreen);
    }, []);

    // Corner buttons hide after 3 s without mouse movement — the screen is a banner.
    useEffect(() => {
        let t: ReturnType<typeof setTimeout>;
        const show = () => {
            setControlsVisible(true);
            clearTimeout(t);
            t = setTimeout(() => setControlsVisible(false), 3000);
        };
        show();
        window.addEventListener('mousemove', show);
        window.addEventListener('touchstart', show);
        return () => {
            clearTimeout(t);
            window.removeEventListener('mousemove', show);
            window.removeEventListener('touchstart', show);
        };
    }, []);

    const toggleFullscreen = useCallback(async () => {
        try {
            if (document.fullscreenElement) { await document.exitFullscreen(); return; }
            await document.documentElement.requestFullscreen();
        } catch { /* denied */ }
    }, []);

    // Keep the invisible input focused so RFID reader keystrokes always land
    useEffect(() => {
        const keepFocus = () => hiddenInputRef.current?.focus();
        keepFocus();
        const interval = setInterval(keepFocus, 500);
        document.addEventListener('click', keepFocus);
        return () => { clearInterval(interval); document.removeEventListener('click', keepFocus); };
    }, []);

    useEffect(() => () => {
        if (noticeTimer.current) clearTimeout(noticeTimer.current);
        if (holdTimer.current) clearTimeout(holdTimer.current);
    }, []);

    const flashNotice = useCallback((text: string, tone: 'error' | 'warn') => {
        setNotice({ text, tone });
        if (noticeTimer.current) clearTimeout(noticeTimer.current);
        noticeTimer.current = setTimeout(() => setNotice(null), 3500);
    }, []);

    const handleScan = useCallback(async () => {
        const code = scanCode.trim();
        if (!code || loading) return;
        setLoading(true);
        try {
            // No checkIn=1 — showing a finish time must not count as a bib check-in.
            const qs = new URLSearchParams({ campaignId: campaign?._id || '', code });
            const res = await fetch(`/api/runners/lookup?${qs.toString()}`, { cache: 'no-store' });
            const data = await res.json();
            const found: BibRunner | null = data?.found ? data.runner : null;
            if (!found) {
                // Keep the last runner on screen; just say this scan didn't match.
                flashNotice(`ไม่พบนักวิ่ง "${code}" — Runner not found`, 'error');
                return;
            }
            setRunner(found);
            setAnimKey(k => k + 1);
            if (!(found.gunTime && found.gunTime > 0) && !found.gunTimeStr) {
                flashNotice(`BIB ${found.bib || code} ยังไม่มีเวลาเข้าเส้นชัย`, 'warn');
            } else {
                setNotice(null);
            }
            if (holdTimer.current) clearTimeout(holdTimer.current);
            if (holdSeconds > 0) {
                holdTimer.current = setTimeout(() => setRunner(null), holdSeconds * 1000);
            }
        } catch {
            flashNotice('ค้นหาไม่สำเร็จ ลองสแกนใหม่อีกครั้ง', 'error');
        } finally {
            setLoading(false);
            setScanCode('');
        }
    }, [scanCode, loading, campaign, flashNotice, holdSeconds]);

    if (campaignNotFound) {
        return (
            <>
                <link href={BIB_FONT_HREF} rel="stylesheet" />
                <div style={fullScreenCenter}>
                    <div style={{ fontSize: 80, marginBottom: 24 }}>❌</div>
                    <div style={{ fontSize: 36, fontWeight: 900, color: '#ef4444', marginBottom: 8 }}>ไม่พบกิจกรรม</div>
                    <div style={{ fontSize: 18, color: '#94a3b8' }}>Campaign Not Found — กรุณาตรวจสอบลิงก์อีกครั้ง</div>
                    <div style={{ fontSize: 14, color: '#64748b', marginTop: 20 }}>slug: {slug}</div>
                </div>
            </>
        );
    }

    const canvas = layout ? layout[orientation] : null;
    const scale = canvas
        ? Math.min(viewport.w / canvas.canvasWidth, viewport.h / canvas.canvasHeight)
        : 1;

    const ctx: RenderContext = {
        runner: runner || IDLE_RUNNER,
        campaign,
        qrValue: '',
        photoUploaded: !!runner?.photoUrl,
        editor: false,
    };

    const controlStyle = { opacity: controlsVisible ? 1 : 0, pointerEvents: controlsVisible ? 'auto' : 'none', transition: 'opacity 0.3s' } as const;

    return (
        <>
            <link href={BIB_FONT_HREF} rel="stylesheet" />
            <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css" />
            <style>{`
                @keyframes ftPop { from { opacity: 0.2; transform: scale(0.985); } to { opacity: 1; transform: scale(1); } }
                @keyframes ftDrop { from { opacity: 0; transform: translate(-50%, -12px); } to { opacity: 1; transform: translate(-50%, 0); } }
                html, body { margin: 0; padding: 0; overflow: hidden; background: ${layout?.stageColor || '#000'}; cursor: ${controlsVisible ? 'default' : 'none'}; }
            `}</style>

            <input ref={hiddenInputRef} value={scanCode}
                onChange={e => setScanCode(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') handleScan(); }}
                style={{ position: 'fixed', top: -100, left: -100, opacity: 0 }} autoFocus />

            <button onClick={() => setOrientation(o => (o === 'landscape' ? 'portrait' : 'landscape'))} style={{ ...cornerBtn({ top: 16, right: 16 }), ...controlStyle }}>
                <i className={orientation === 'portrait' ? 'fa-solid fa-desktop' : 'fa-solid fa-mobile-screen-button'} />
                {orientation === 'portrait' ? 'Toggle Landscape' : 'Toggle Portrait'}
            </button>

            <button onClick={toggleFullscreen} style={{ ...cornerBtn({ left: 16, bottom: 16 }), ...controlStyle }}>
                <i className={isFullscreen ? 'fa-solid fa-compress' : 'fa-solid fa-expand'} />
                {isFullscreen ? 'Exit Full Screen' : 'Full Screen'}
            </button>

            <div style={{ ...cornerBtn({ right: 16, bottom: 16 }), ...controlStyle, cursor: 'default' }}>
                <i className={loading ? 'fas fa-spinner fa-spin' : 'fa-solid fa-barcode'} />
                {loading ? 'กำลังค้นหา...' : runner ? `BIB ${runner.bib || '-'}` : 'รอการสแกน'}
            </div>

            {notice && (
                <div style={{
                    position: 'fixed', top: 24, left: '50%', transform: 'translateX(-50%)', zIndex: 110,
                    padding: '12px 22px', borderRadius: 12, fontFamily: "'Prompt', sans-serif", fontSize: 20, fontWeight: 800,
                    color: '#fff', background: notice.tone === 'error' ? 'rgba(220,38,38,0.92)' : 'rgba(217,119,6,0.92)',
                    boxShadow: '0 10px 30px rgba(0,0,0,0.35)', animation: 'ftDrop 0.25s ease-out', whiteSpace: 'nowrap',
                }}>
                    {notice.text}
                </div>
            )}

            {!canvas ? (
                <div style={fullScreenCenter}>
                    <div style={{ color: '#94a3b8', fontSize: 20 }}>กำลังโหลด...</div>
                </div>
            ) : (
                <div style={{
                    position: 'fixed', inset: 0,
                    background: layout?.stageColor || '#000',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    overflow: 'hidden', fontFamily: "'Prompt', sans-serif",
                }}>
                    <div key={`card-${animKey}`} style={{
                        width: canvas.canvasWidth * scale,
                        height: canvas.canvasHeight * scale,
                        overflow: 'hidden',
                        animation: animKey ? 'ftPop 0.45s cubic-bezier(0.16, 1, 0.3, 1)' : undefined,
                    }}>
                        <div style={{ transform: `scale(${scale})`, transformOrigin: 'top left' }}>
                            <BibCanvasView canvas={canvas} ctx={ctx} />
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}

const fullScreenCenter: React.CSSProperties = {
    position: 'fixed', inset: 0, display: 'flex', flexDirection: 'column',
    alignItems: 'center', justifyContent: 'center',
    background: '#020617', fontFamily: "'Prompt', sans-serif",
};

function cornerBtn(pos: React.CSSProperties): React.CSSProperties {
    return {
        position: 'fixed', zIndex: 100, height: 38, padding: '0 14px', borderRadius: 8,
        border: '1px solid rgba(255,255,255,0.2)', background: 'rgba(0,0,0,0.45)',
        color: '#fff', fontSize: 12, cursor: 'pointer', backdropFilter: 'blur(10px)',
        fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8,
        fontFamily: "'Lexend', sans-serif",
        ...pos,
    };
}
