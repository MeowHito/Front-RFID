'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import { useParams } from 'next/navigation';
import {
    BIB_FONT_HREF, BibCanvasView, normalizeLayout,
    type BibCheck2Layout, type BibRunner, type BibCampaign, type Orientation, type RenderContext,
} from '@/lib/bibcheck2';

interface Campaign extends BibCampaign {
    bibCheck2Layout?: unknown;
}

/**
 * Check BIB 2 live display — renders the layout designed in /admin/bib-check-2,
 * letterboxed to fit whatever screen the RFID reader station is plugged into.
 * Scan handling mirrors /scanning/[slug] exactly.
 */
export default function ScanningCustomPage() {
    const params = useParams();
    const slug = params.slug as string;

    const [campaign, setCampaign] = useState<Campaign | null>(null);
    const [campaignNotFound, setCampaignNotFound] = useState(false);
    const [layout, setLayout] = useState<BibCheck2Layout | null>(null);
    const [scanCode, setScanCode] = useState('');
    const [loading, setLoading] = useState(false);
    const [runner, setRunner] = useState<BibRunner | null>(null);
    const [found, setFound] = useState<boolean | null>(null);
    const [animKey, setAnimKey] = useState(0);
    const [photoUploaded, setPhotoUploaded] = useState(false);
    const [origin, setOrigin] = useState('');
    const [orientation, setOrientation] = useState<Orientation>('landscape');
    const [isFullscreen, setIsFullscreen] = useState(false);
    const [viewport, setViewport] = useState({ w: 1280, h: 720 });

    const hiddenInputRef = useRef<HTMLInputElement>(null);
    const orientationCampaignKey = campaign?.slug || slug || campaign?._id || 'default';

    // Load campaign + saved design
    useEffect(() => {
        if (!slug) return;
        (async () => {
            try {
                const res = await fetch(`/api/campaigns/${encodeURIComponent(slug)}?full=true`, { cache: 'no-store' });
                if (!res.ok) { setCampaignNotFound(true); return; }
                const data = await res.json();
                setCampaign(data);
                setLayout(normalizeLayout(data.bibCheck2Layout));
            } catch {
                setCampaignNotFound(true);
            }
        })();
    }, [slug]);

    useEffect(() => { setOrigin(window.location.origin); }, []);

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

    const toggleFullscreen = useCallback(async () => {
        try {
            if (document.fullscreenElement) { await document.exitFullscreen(); return; }
            await document.documentElement.requestFullscreen();
        } catch { /* denied */ }
    }, []);

    // Report orientation so the phone upload page can match it
    useEffect(() => {
        if (!orientationCampaignKey) return;
        const post = () => fetch('/api/scanning-orientation', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ campaign: orientationCampaignKey, orientation }),
        }).catch(() => {});
        post();
        const heartbeat = setInterval(post, 30000);
        const onVisible = () => { if (document.visibilityState === 'visible') post(); };
        document.addEventListener('visibilitychange', onVisible);
        return () => {
            clearInterval(heartbeat);
            document.removeEventListener('visibilitychange', onVisible);
        };
    }, [orientationCampaignKey, orientation]);

    // Keep the invisible input focused so RFID reader keystrokes always land
    useEffect(() => {
        const keepFocus = () => hiddenInputRef.current?.focus();
        keepFocus();
        const interval = setInterval(keepFocus, 500);
        document.addEventListener('click', keepFocus);
        return () => { clearInterval(interval); document.removeEventListener('click', keepFocus); };
    }, []);

    // Poll for a photo upload while the runner has none
    useEffect(() => {
        if (!runner || runner.photoUrl || photoUploaded) return;
        const runnerId = runner._id;
        if (!runnerId) return;
        const interval = setInterval(async () => {
            try {
                const res = await fetch(`/api/runners/${runnerId}`);
                if (!res.ok) return;
                const data = await res.json();
                if (data.photoUrl) {
                    setRunner(prev => (prev ? { ...prev, photoUrl: data.photoUrl } : prev));
                    setPhotoUploaded(true);
                }
            } catch { /* ignore polling errors */ }
        }, 2000);
        return () => clearInterval(interval);
    }, [runner, photoUploaded]);

    const handleScan = useCallback(async () => {
        const code = scanCode.trim();
        if (!code || loading) return;
        setLoading(true);
        setPhotoUploaded(false);
        try {
            const qs = new URLSearchParams({ campaignId: campaign?._id || '', code, checkIn: '1' });
            const res = await fetch(`/api/runners/lookup?${qs.toString()}`);
            const data = await res.json();
            const foundRunner = data.runner || null;
            // Each scan starts with a blank photo slot — clear any stale upload.
            if (foundRunner?.photoUrl) {
                foundRunner.photoUrl = '';
                fetch(`/api/runners/${foundRunner._id}/photo`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ photo: '' }),
                }).catch(() => {});
            }
            setRunner(foundRunner);
            setFound(!!data.found);
            setAnimKey(k => k + 1);
        } catch {
            setRunner(null);
            setFound(false);
            setAnimKey(k => k + 1);
        } finally {
            setLoading(false);
            setScanCode('');
        }
    }, [scanCode, loading, campaign]);

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
        runner,
        campaign,
        qrValue: origin && runner?._id
            ? `${origin}/upload/${runner._id}?slug=${campaign?.slug || slug || ''}&campaign=${orientationCampaignKey}&orientation=${orientation}`
            : '',
        photoUploaded: photoUploaded || !!runner?.photoUrl,
        editor: false,
    };

    return (
        <>
            <link href={BIB_FONT_HREF} rel="stylesheet" />
            <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css" />
            <style>{`
                @keyframes bc2FadeIn { from { opacity: 0; transform: translateY(24px); } to { opacity: 1; transform: translateY(0); } }
                @keyframes bc2Pulse { 0%,100% { opacity: 1; } 50% { opacity: 0.6; } }
                @keyframes spin { to { transform: rotate(360deg); } }
                html, body { margin: 0; padding: 0; overflow: hidden; background: ${layout?.stageColor || '#0f172a'}; }
            `}</style>

            <input ref={hiddenInputRef} value={scanCode}
                onChange={e => setScanCode(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') handleScan(); }}
                style={{ position: 'fixed', top: -100, left: -100, opacity: 0 }} autoFocus />

            <button onClick={() => setOrientation(o => (o === 'landscape' ? 'portrait' : 'landscape'))} style={cornerBtn({ top: 16, right: 16 })}>
                <i className={orientation === 'portrait' ? 'fa-solid fa-desktop' : 'fa-solid fa-mobile-screen-button'} />
                {orientation === 'portrait' ? 'Toggle Landscape' : 'Toggle Portrait'}
            </button>

            <button onClick={toggleFullscreen} style={cornerBtn({ left: 16, bottom: 16 })}>
                <i className={isFullscreen ? 'fa-solid fa-compress' : 'fa-solid fa-expand'} />
                {isFullscreen ? 'Exit Full Screen' : 'Full Screen'}
            </button>

            {loading && (
                <div style={{
                    position: 'fixed', inset: 0, zIndex: 90, display: 'flex', alignItems: 'center', justifyContent: 'center',
                    background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)', fontFamily: "'Prompt', sans-serif",
                }}>
                    <div style={{ color: '#4ade80', fontSize: 24, fontWeight: 800 }}>
                        <i className="fas fa-spinner fa-spin" style={{ marginRight: 12 }} /> กำลังค้นหา...
                    </div>
                </div>
            )}

            {/* NOT FOUND */}
            {found === false && !runner && (
                <div key={`nf-${animKey}`} style={{ ...fullScreenCenter, zIndex: 80, animation: 'bc2FadeIn 0.5s ease-out' }}>
                    <div style={{ fontSize: 80, marginBottom: 24 }}>❌</div>
                    <div style={{ fontSize: 36, fontWeight: 900, color: '#ef4444', marginBottom: 8 }}>ไม่พบนักวิ่ง</div>
                    <div style={{ fontSize: 18, color: '#94a3b8' }}>Runner Not Found — สแกนใหม่เพื่อลองอีกครั้ง</div>
                </div>
            )}

            {/* WAITING */}
            {found === null && (
                <div style={{ ...fullScreenCenter, zIndex: 70 }}>
                    <div style={{ fontSize: 80, marginBottom: 24, animation: 'bc2Pulse 2s ease-in-out infinite' }}>📡</div>
                    <div style={{ fontSize: 36, fontWeight: 900, color: '#fff', marginBottom: 8 }}>รอการสแกน</div>
                    <div style={{ fontSize: 18, color: '#94a3b8' }}>Waiting for RFID scan...</div>
                    <div style={{ fontSize: 14, color: '#64748b', marginTop: 20 }}>{campaign?.name || 'RFID Running Event'}</div>
                </div>
            )}

            {/* DESIGNED CARD */}
            {found && runner && canvas && (
                <div key={`card-${animKey}`} style={{
                    position: 'fixed', inset: 0, zIndex: 60,
                    background: layout?.stageColor || '#0f172a',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    overflow: 'hidden', fontFamily: "'Prompt', sans-serif",
                    animation: 'bc2FadeIn 0.6s cubic-bezier(0.16, 1, 0.3, 1)',
                }}>
                    <div style={{
                        width: canvas.canvasWidth * scale,
                        height: canvas.canvasHeight * scale,
                        overflow: 'hidden',
                        boxShadow: '0 25px 50px -12px rgba(0,0,0,0.5)',
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
        border: '1px solid rgba(255,255,255,0.2)', background: 'rgba(255,255,255,0.1)',
        color: '#fff', fontSize: 12, cursor: 'pointer', backdropFilter: 'blur(10px)',
        fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8,
        fontFamily: "'Lexend', sans-serif",
        ...pos,
    };
}
