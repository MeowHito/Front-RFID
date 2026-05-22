'use client';

import { useEffect, useState, useRef, useCallback, useLayoutEffect } from 'react';
import { useParams } from 'next/navigation';

function fitNameToWidth(el: HTMLElement | null, baseRem: number, minRem = 1.0) {
    if (!el || !el.parentElement) return;
    el.style.textOverflow = 'clip';
    el.style.fontSize = `${baseRem}rem`;
    const parent = el.parentElement;
    const pStyle = getComputedStyle(parent);
    const limit = parent.clientWidth - parseFloat(pStyle.paddingLeft) - parseFloat(pStyle.paddingRight);
    if (limit <= 0) return;
    let size = baseRem;
    let guard = 60;
    while (el.scrollWidth > limit && size > minRem && guard-- > 0) {
        size -= 0.15;
        el.style.fontSize = `${size}rem`;
    }
}

const A3: Record<string, string> = {
    THA: 'TH', USA: 'US', GBR: 'GB', JPN: 'JP', KOR: 'KR', CHN: 'CN', TWN: 'TW', HKG: 'HK', SGP: 'SG', MYS: 'MY',
    IDN: 'ID', PHL: 'PH', VNM: 'VN', MMR: 'MM', LAO: 'LA', KHM: 'KH', IND: 'IN', AUS: 'AU', NZL: 'NZ', CAN: 'CA',
    DEU: 'DE', FRA: 'FR', ITA: 'IT', ESP: 'ES', NLD: 'NL', CHE: 'CH', SWE: 'SE', NOR: 'NO', DNK: 'DK', FIN: 'FI',
    RUS: 'RU', BRA: 'BR', MEX: 'MX', KEN: 'KE', ETH: 'ET', ZAF: 'ZA', TUR: 'TR', POL: 'PL', ARE: 'AE', SAU: 'SA',
    ISR: 'IL', EGY: 'EG', NGA: 'NG', ARG: 'AR', COL: 'CO', BEL: 'BE', AUT: 'AT', PRT: 'PT', IRL: 'IE', GRC: 'GR',
    UKR: 'UA', CZE: 'CZ', HUN: 'HU', ROU: 'RO', NPL: 'NP', LKA: 'LK', PAK: 'PK', BGD: 'BD', BRN: 'BN', MAC: 'MO',
};
function toFlag(code?: string | null): string {
    if (!code) return '';
    const u = code.trim().toUpperCase();
    const a2 = u.length === 2 ? u : A3[u];
    if (!a2 || a2.length !== 2) return '';
    return String.fromCodePoint(0x1F1E6 + a2.charCodeAt(0) - 65, 0x1F1E6 + a2.charCodeAt(1) - 65);
}

interface Runner {
    _id: string; bib: string; firstName: string; lastName: string;
    firstNameTh?: string; lastNameTh?: string;
    gender: string; category: string; ageGroup?: string; nationality?: string;
    status: string; chipCode?: string; printingCode?: string; rfidTag?: string;
    netTime?: number; gunTime?: number; overallRank?: number;
    team?: string; teamName?: string; shirtSize?: string; age?: number;
    gunPace?: string; netPace?: string; photoUrl?: string;
    wave?: string; medical?: string;
}
interface Campaign { _id: string; name: string; slug?: string; scanningTemplate?: string; scanningBgImage?: string; scanningBgImagePortrait?: string; subtitle?: string; }

export default function Scanning2BySlugPage() {
    const params = useParams();
    const slug = params.slug as string;

    const [campaign, setCampaign] = useState<Campaign | null>(null);
    const [campaignNotFound, setCampaignNotFound] = useState(false);
    const [scanCode, setScanCode] = useState('');
    const [loading, setLoading] = useState(false);
    const [runner, setRunner] = useState<Runner | null>(null);
    const [found, setFound] = useState<boolean | null>(null);
    const [animKey, setAnimKey] = useState(0);
    const [portrait, setPortrait] = useState(false);
    const [isFullscreen, setIsFullscreen] = useState(false);
    const hiddenInputRef = useRef<HTMLInputElement>(null);
    const nameEnRef = useRef<HTMLHeadingElement>(null);
    const nameThRef = useRef<HTMLParagraphElement>(null);
    const orientationCampaignKey = campaign?.slug || slug || campaign?._id || 'default';

    useEffect(() => {
        if (!slug) return;
        (async () => {
            try {
                const res = await fetch(`/api/campaigns/${encodeURIComponent(slug)}?full=true`, { cache: 'no-store' });
                if (res.ok) { setCampaign(await res.json()); }
                else { setCampaignNotFound(true); }
            } catch { setCampaignNotFound(true); }
        })();
    }, [slug]);

    useEffect(() => {
        const sync = () => setIsFullscreen(!!document.fullscreenElement);
        sync();
        document.addEventListener('fullscreenchange', sync);
        return () => document.removeEventListener('fullscreenchange', sync);
    }, []);

    const toggleFullscreen = useCallback(async () => {
        try {
            if (document.fullscreenElement) await document.exitFullscreen();
            else await document.documentElement.requestFullscreen();
        } catch { }
    }, []);

    useEffect(() => {
        if (!orientationCampaignKey) return;
        fetch('/api/scanning-orientation', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ campaign: orientationCampaignKey, orientation: portrait ? 'portrait' : 'landscape' }),
        }).catch(() => {});
    }, [orientationCampaignKey, portrait]);

    useEffect(() => {
        const keepFocus = () => hiddenInputRef.current?.focus();
        keepFocus();
        const interval = setInterval(keepFocus, 500);
        document.addEventListener('click', keepFocus);
        return () => { clearInterval(interval); document.removeEventListener('click', keepFocus); };
    }, []);

    useLayoutEffect(() => {
        if (!runner) return;
        const fit = () => {
            const baseEn = portrait
                ? Math.min(9, Math.max(5, window.innerWidth / 90))
                : Math.min(11, Math.max(6, window.innerWidth / 280));
            const baseTh = portrait
                ? Math.min(4, Math.max(1.4, window.innerWidth / 300))
                : Math.min(4.2, Math.max(2.2, window.innerWidth / 700));
            fitNameToWidth(nameEnRef.current, baseEn, portrait ? 0.8 : 1.4);
            fitNameToWidth(nameThRef.current, baseTh, 0.7);
        };
        fit();
        window.addEventListener('resize', fit);
        return () => window.removeEventListener('resize', fit);
    }, [runner, portrait, animKey]);

    const handleScan = useCallback(async () => {
        const code = scanCode.trim();
        if (!code || loading) return;
        setLoading(true);
        try {
            const p = new URLSearchParams({ campaignId: campaign?._id || '', code });
            const res = await fetch(`/api/runners/lookup?${p.toString()}`);
            const data = await res.json();
            setRunner(data.runner || null);
            setFound(!!data.found);
            setAnimKey(k => k + 1);
        } catch {
            setRunner(null); setFound(false); setAnimKey(k => k + 1);
        } finally {
            setLoading(false); setScanCode('');
        }
    }, [scanCode, loading, campaign]);

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
    const r = runner;
    const nameTh = r ? `${r.firstNameTh || ''} ${r.lastNameTh || ''}`.trim() : '';
    const nameEn = r ? `${r.firstName} ${r.lastName}` : '';
    const distance = r?.category || '-';
    const bibNum = r?.bib || '-';
    const genderLabel = r?.gender === 'M' ? 'Male' : r?.gender === 'F' ? 'Female' : (r?.gender || '-');
    const ageGroupLabel = r?.ageGroup || '-';
    const flag = toFlag(r?.nationality);
    const hasMedical = !!(r?.medical && r.medical.trim() !== '' && r.medical !== 'ไม่มี');

    return (
        <>
            <link href="https://fonts.googleapis.com/css2?family=Prompt:wght@400;600;700;800;900&family=Lexend:wght@300;400;600;700;800;900&display=swap" rel="stylesheet" />
            <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css" />

            <style>{`
                @keyframes s2FadeIn  { from { opacity:0; transform:translateY(28px); } to { opacity:1; transform:translateY(0); } }
                @keyframes s2Progress{ from { width:100%; } to { width:0%; } }
                @keyframes s2Pulse   { 0%,100%{ opacity:1; } 50%{ opacity:0.55; } }

                .s2-card,
                .s2-card * { box-sizing: border-box; }

                /* ── Card shell ── */
                .s2-card {
                    --px: clamp(28px, 5.5vw, 140px);
                    --py: clamp(20px, 5vh,   96px);
                    width:  min(92vw, calc(90vh * 1.795));
                    height: min(90vh, calc(92vw / 1.795));
                    background: #ffffff;
                    border-radius: 10px;
                    display: flex;
                    flex-direction: column;
                    padding: var(--py) var(--px);
                    box-shadow: 0 32px 64px -12px rgba(0,0,0,0.55);
                    position: relative;
                    animation: s2FadeIn 0.55s cubic-bezier(0.16,1,0.3,1);
                    overflow: hidden;
                }
                .s2-card > * { position: relative; z-index: 1; }
                .s2-bg {
                    position: absolute; inset: 0; z-index: 0;
                    background-position: center; background-size: cover;
                    opacity: 0.22; filter: saturate(0.85);
                }
                .s2-progress {
                    position: absolute; top: 0; left: 0; height: 5px;
                    background: #16a34a; border-radius: 10px 10px 0 0;
                    animation: s2Progress 8s linear forwards; z-index: 5;
                }

                /* ── Header ── */
                .s2-header {
                    text-align: center;
                    border-bottom: 1px solid #e2e8f0;
                    padding-bottom: clamp(8px, 2.2vh, 20px);
                    margin-bottom: clamp(10px, 2.8vh, 28px);
                    flex-shrink: 0;
                }
                .s2-event-name {
                    font-family: 'Prompt', sans-serif;
                    font-size: clamp(1.2rem, min(2.8vw, 4.5vh), 2.6rem);
                    font-weight: 800; color: #0f172a; margin: 0;
                    white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
                }

                /* ── Middle: name + bib+dist hero ── */
                .s2-middle {
                    flex: 1; display: flex; flex-direction: column;
                    justify-content: center; min-height: 0;
                    gap: clamp(14px, 3vh, 48px);
                }

                /* Name block */
                .s2-name-block { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
                .s2-status {
                    display: flex; align-items: center; justify-content: center; gap: 10px;
                    font-family: 'Prompt', sans-serif;
                    font-size: clamp(0.72rem, 1.4vw, 1.5rem);
                    font-weight: 700; color: #16a34a;
                    text-transform: uppercase; letter-spacing: 2.5px;
                    margin: 0; padding: clamp(4px, 1vh, 12px) 0;
                    white-space: nowrap;
                }
                .s2-name-en {
                    font-family: 'Prompt', sans-serif;
                    font-size: clamp(2.4rem, min(6.5vw, 11vh), 11rem);
                    font-weight: 800; color: #0f172a;
                    line-height: 1.0; margin: 0;
                    white-space: nowrap; max-width: 100%; overflow: hidden;
                }
                .s2-name-th {
                    font-family: 'Prompt', sans-serif;
                    font-size: clamp(1rem, min(2.2vw, 3.8vh), 3.6rem);
                    font-weight: 400; color: #64748b;
                    text-transform: uppercase; letter-spacing: 1.5px;
                    margin: 0; white-space: nowrap; max-width: 100%; overflow: hidden;
                }

                /* BIB + Distance hero row */
                .s2-hero {
                    display: flex; align-items: stretch;
                    gap: 0;
                    background: rgba(255,255,255,0.26);
                    border-radius: 10px;
                    border: 1px solid rgba(255,255,255,0.6);
                    overflow: hidden;
                    flex-shrink: 0;
                }
                .s2-bib-panel {
                    display: flex; flex-direction: column;
                    align-items: center; justify-content: center;
                    padding: clamp(14px, 2.5vh, 36px) clamp(28px, 4vw, 72px);
                    border-right: 1px solid rgba(255,255,255,0.6);
                    flex: 1; min-width: 0;
                    background: transparent;
                }
                .s2-bib-label {
                    font-family: 'Prompt', sans-serif;
                    font-size: clamp(0.65rem, 1.3vw, 1.1rem);
                    font-weight: 700; color: #64748b;
                    text-transform: uppercase; letter-spacing: 4px;
                    margin: 0 0 clamp(2px, 0.4vh, 6px);
                }
                .s2-bib-num {
                    font-family: 'Prompt', sans-serif;
                    font-size: clamp(3.5rem, min(9vw, 13vh), 13rem);
                    font-weight: 700; color: #0f172a;
                    line-height: 0.9;
                }
                .s2-dist-panel {
                    display: flex; flex-direction: column;
                    align-items: center; justify-content: center;
                    padding: clamp(14px, 2.5vh, 36px) clamp(24px, 4vw, 72px);
                    flex: 1;
                }
                .s2-dist-label {
                    font-family: 'Prompt', sans-serif;
                    font-size: clamp(0.65rem, 1.3vw, 1.1rem);
                    font-weight: 700; color: #94a3b8;
                    text-transform: uppercase; letter-spacing: 4px;
                    margin: 0 0 clamp(2px, 0.4vh, 6px);
                }
                .s2-dist-value {
                    font-family: 'Prompt', sans-serif;
                    font-size: clamp(3.5rem, min(9vw, 13vh), 13rem);
                    font-weight: 800; color: #ef4444;
                    letter-spacing: 2px; white-space: nowrap;
                }

                /* Medical */
                .s2-medical {
                    display: flex; align-items: center; gap: 16px;
                    background: #fef2f2; border: 2px solid #fca5a5;
                    border-radius: 8px; padding: 12px 20px; flex-shrink: 0;
                }
                .s2-medical-icon { font-size: 1.7rem; color: #dc2626; flex-shrink: 0; }
                .s2-medical-label { font-size: 0.78rem; font-weight: 700; color: #991b1b; text-transform: uppercase; letter-spacing: 2px; margin: 0 0 2px; }
                .s2-medical-text  { font-size: 1.05rem; font-weight: 600; color: #dc2626; margin: 0; }

                /* ── Bottom info bar ── */
                .s2-bottom {
                    margin-top: auto;
                    border-top: 1px solid #e2e8f0;
                    padding-top: clamp(8px, 2.4vh, 20px);
                    flex-shrink: 0;
                }
                .s2-info-bar {
                    display: grid; grid-template-columns: repeat(2, 1fr); gap: 0;
                }
                .s2-info-item {
                    text-align: left;
                    padding: clamp(6px, 1.4vh, 10px) clamp(10px, 1.6vw, 18px);
                    border-left: 1px solid #e2e8f0; min-width: 0;
                }
                .s2-info-item:first-child { border-left: none; padding-left: 0; }
                .s2-info-label {
                    font-family: 'Prompt', sans-serif;
                    font-size: clamp(0.62rem, 1.25vw, 1.6rem);
                    font-weight: 600; color: #94a3b8;
                    text-transform: uppercase; letter-spacing: 2px; margin: 0 0 4px;
                }
                .s2-info-value {
                    font-family: 'Prompt', sans-serif;
                    font-size: clamp(1.3rem, min(2.8vw, 4.8vh), 4.2rem);
                    font-weight: 800; color: #0f172a; line-height: 1; margin: 0;
                    white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
                }
                .s2-info-item.hl .s2-info-label { color: #16a34a; }
                .s2-info-item.hl .s2-info-value { color: #16a34a; font-size: clamp(1.45rem, min(3vw, 5.2vh), 4.6rem); }

                /* Seal */
                .s2-seal {
                    position: absolute;
                    bottom: clamp(8px, 1.8vh, 28px); right: clamp(14px, 2.4vw, 48px);
                    font-size: clamp(0.4rem, 0.85vw, 1rem);
                    color: #cbd5e1; font-weight: 700;
                    letter-spacing: clamp(2px, 0.3vw, 4px);
                    text-transform: uppercase; text-align: right;
                    font-family: 'Prompt', sans-serif; line-height: 1.4;
                }
                .s2-seal-mark { color: #94a3b8; }

                /* ── Portrait ── */
                .s2-portrait .s2-card {
                    width: 92vw; height: 94vh;
                    padding: clamp(14px, 2.8vh, 48px) clamp(18px, 4.5vw, 56px) clamp(12px, 2.2vh, 40px);
                }
                .s2-portrait .s2-header {
                    padding-bottom: clamp(8px, 1.6vh, 18px);
                    margin-bottom: clamp(8px, 2vh, 24px);
                }
                .s2-portrait .s2-event-name { font-size: clamp(1.1rem, min(4.8vw, 3.8vh), 2.6rem); }

                /* Portrait middle stacks vertically centered */
                .s2-portrait .s2-middle {
                    align-items: center;
                    gap: clamp(12px, 2.4vh, 36px);
                }

                /* Name panel: full-width card, centered text, soft bg */
                .s2-portrait .s2-name-block {
                    align-items: center; text-align: center; width: 100%;
                    background: rgba(255,255,255,0.55);
                    border-radius: 10px;
                    padding: clamp(12px, 2vh, 28px) clamp(16px, 3.5vw, 40px);
                    min-height: clamp(72px, 9vh, 140px);
                    display: flex; flex-direction: column; justify-content: center;
                }
                .s2-portrait .s2-status { justify-content: center; }
                .s2-portrait .s2-name-en {
                    font-size: clamp(1.8rem, min(9.5vw, 6.5vh), 7.5rem);
                    margin-bottom: 2px;
                }
                .s2-portrait .s2-name-th { font-size: clamp(0.85rem, min(3.2vw, 2.4vh), 2.8rem); }

                /* Hero: full width, 50/50, same sizes */
                .s2-portrait .s2-hero { width: 100%; }
                .s2-portrait .s2-bib-num,
                .s2-portrait .s2-dist-value {
                    font-size: clamp(3rem, min(13vw, 9vh), 9rem);
                }
                .s2-portrait .s2-bib-label,
                .s2-portrait .s2-dist-label {
                    font-size: clamp(0.7rem, min(2.2vw, 1.8vh), 1.4rem);
                    letter-spacing: 3px;
                }

                /* Portrait bottom */
                .s2-portrait .s2-bottom { padding-top: clamp(8px, 1.8vh, 18px); }
                .s2-portrait .s2-info-bar {
                    grid-template-columns: repeat(2,1fr); gap: 1px;
                    background: #e2e8f0; border-radius: 8px; overflow: hidden;
                }
                .s2-portrait .s2-info-item {
                    border-left: none; background: white; text-align: center;
                    padding: clamp(8px, 1.6vh, 14px) clamp(10px, 2vw, 18px);
                }
                .s2-portrait .s2-info-item:first-child { padding-left: clamp(10px, 2vw, 18px); }
                .s2-portrait .s2-info-value { font-size: clamp(1.2rem, min(5vw, 3.8vh), 3.6rem); }
                .s2-portrait .s2-info-item.hl .s2-info-value { font-size: clamp(1.35rem, min(5.5vw, 4.2vh), 4rem); }
                .s2-portrait .s2-medical { align-self: stretch; }

                @media (max-width: 900px), (max-height: 620px) {
                    .s2-card { --px: clamp(16px, 4vw, 36px); --py: clamp(12px, 2.8vh, 24px); width: 94vw; height: 88vh; }
                }
                @media (max-width: 700px) and (orientation: landscape), (max-height: 460px) and (orientation: landscape) {
                    .s2-card { height: 92vh; }
                    .s2-name-th { display: none; }
                    .s2-seal { display: none; }
                }
                @media (max-height: 720px) and (max-width: 900px) {
                    .s2-portrait .s2-card { height: 92vh; }
                    .s2-portrait .s2-name-th { display: none; }
                    .s2-portrait .s2-seal { display: none; }
                }
            `}</style>

            <input ref={hiddenInputRef} value={scanCode}
                onChange={e => setScanCode(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') handleScan(); }}
                style={{ position: 'fixed', top: -100, left: -100, opacity: 0 }} autoFocus />

            {/* Orientation toggle */}
            <button onClick={() => setPortrait(p => !p)} style={{
                position: 'fixed', top: 16, right: 16, zIndex: 100, height: 36,
                padding: '0 14px', borderRadius: 6, border: '1px solid rgba(255,255,255,0.2)',
                background: 'rgba(255,255,255,0.1)', color: '#fff', fontSize: 12, cursor: 'pointer',
                backdropFilter: 'blur(10px)', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 6,
                fontFamily: "'Lexend', sans-serif",
            }}>
                <i className={portrait ? 'fa-solid fa-desktop' : 'fa-solid fa-mobile-screen-button'} />
                {portrait ? 'Toggle Landscape' : 'Toggle Portrait'}
            </button>

            {/* Fullscreen toggle */}
            <button onClick={toggleFullscreen} style={{
                position: 'fixed', left: 16, bottom: 16, zIndex: 100, height: 40,
                padding: '0 16px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.2)',
                background: 'rgba(255,255,255,0.1)', color: '#fff', fontSize: 13, cursor: 'pointer',
                backdropFilter: 'blur(10px)', fontWeight: 800, display: 'flex', alignItems: 'center', gap: 8,
                fontFamily: "'Lexend', sans-serif",
            }}>
                <i className={isFullscreen ? 'fa-solid fa-compress' : 'fa-solid fa-expand'} />
                {isFullscreen ? 'Exit Full Screen' : 'Full Screen'}
            </button>

            {/* Loading */}
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
                <div key={`nf-${animKey}`} style={{
                    position: 'fixed', inset: 0, zIndex: 80, display: 'flex', flexDirection: 'column',
                    alignItems: 'center', justifyContent: 'center',
                    background: '#020617', animation: 's2FadeIn 0.5s ease-out', fontFamily: "'Prompt', sans-serif",
                }}>
                    <div style={{ fontSize: 80, marginBottom: 24 }}>❌</div>
                    <div style={{ fontSize: 36, fontWeight: 900, color: '#ef4444', marginBottom: 8 }}>ไม่พบนักวิ่ง</div>
                    <div style={{ fontSize: 18, color: '#94a3b8' }}>Runner Not Found — สแกนใหม่เพื่อลองอีกครั้ง</div>
                </div>
            )}

            {/* WAITING */}
            {found === null && (
                <div style={{
                    position: 'fixed', inset: 0, zIndex: 70, display: 'flex', flexDirection: 'column',
                    alignItems: 'center', justifyContent: 'center',
                    background: '#020617', fontFamily: "'Prompt', sans-serif",
                }}>
                    <div style={{ fontSize: 80, marginBottom: 24, animation: 's2Pulse 2s ease-in-out infinite' }}>📡</div>
                    <div style={{ fontSize: 36, fontWeight: 900, color: '#fff', marginBottom: 8 }}>รอการสแกน</div>
                    <div style={{ fontSize: 18, color: '#94a3b8' }}>Waiting for RFID scan...</div>
                    <div style={{ fontSize: 14, color: '#64748b', marginTop: 20 }}>{campaignName}</div>
                </div>
            )}

            {/* FOUND */}
            {found && runner && (
                <div key={`a-${animKey}`} className={portrait ? 's2-portrait' : ''} style={{
                    position: 'fixed', inset: 0, zIndex: 60, background: '#0f172a',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontFamily: "'Prompt', sans-serif", overflow: 'hidden',
                }}>
                    <div className="s2-card">
                        <div className="s2-progress" key={`prog-${animKey}`} />
                        {(() => {
                            const bg = portrait
                                ? (campaign?.scanningBgImagePortrait || campaign?.scanningBgImage)
                                : campaign?.scanningBgImage;
                            return bg ? <div className="s2-bg" style={{ backgroundImage: `url(${bg})` }} /> : null;
                        })()}

                        {/* Header */}
                        <div className="s2-header">
                            <h1 className="s2-event-name">{campaignName}</h1>
                        </div>

                        {/* Middle */}
                        <div className="s2-middle">
                            {/* Name */}
                            <div className="s2-name-block">
                                <h2 ref={nameEnRef} className="s2-name-en">{nameEn || nameTh}</h2>
                                {nameTh && nameEn && <p ref={nameThRef} className="s2-name-th">{nameTh}</p>}
                            </div>

                            {/* Status badge — centered between name and hero */}
                            <p className="s2-status">
                                <i className="fa-regular fa-circle-check" />
                                ยืนยันข้อมูล
                                {flag && <span style={{ fontSize: '1.15em', letterSpacing: 0 }}>{flag}</span>}
                            </p>

                            {/* BIB + Distance hero */}
                            <div className="s2-hero">
                                <div className="s2-bib-panel">
                                    <span className="s2-bib-label">BIB</span>
                                    <span className="s2-bib-num">{bibNum}</span>
                                </div>
                                <div className="s2-dist-panel">
                                    <span className="s2-dist-label">Distance</span>
                                    <span className="s2-dist-value">{distance}</span>
                                </div>
                            </div>

                            {/* Medical */}
                            {hasMedical && (
                                <div className="s2-medical">
                                    <div className="s2-medical-icon"><i className="fa-solid fa-triangle-exclamation" /></div>
                                    <div>
                                        <p className="s2-medical-label">⚕ Medical Alert — แจ้งเจ้าหน้าที่</p>
                                        <p className="s2-medical-text">{r?.medical}</p>
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Bottom */}
                        <div className="s2-bottom">
                            <div className="s2-info-bar">
                                <div className="s2-info-item">
                                    <p className="s2-info-label">Gender</p>
                                    <p className="s2-info-value">{genderLabel}</p>
                                </div>
                                <div className="s2-info-item hl">
                                    <p className="s2-info-label">Age Group</p>
                                    <p className="s2-info-value">{ageGroupLabel}</p>
                                </div>
                            </div>
                        </div>

                        <div className="s2-seal">
                            Powered by<br />
                            <span className="s2-seal-mark">ACTION TIMING</span>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}
