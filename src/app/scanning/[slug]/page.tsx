'use client';

import { useEffect, useState, useRef, useCallback, useLayoutEffect } from 'react';
import { useParams } from 'next/navigation';
import { QRCodeSVG } from 'qrcode.react';

/** Shrink font-size of `el` until its scrollWidth fits the parent's content width (excluding padding). */
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

// Alpha-3 → Alpha-2 map for flag emoji
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
interface Campaign { _id: string; name: string; slug?: string; scanningTemplate?: string; scanningBgImage?: string; subtitle?: string; }

export default function ScanningBySlugPage() {
    const params = useParams();
    const slug = params.slug as string;

    const [campaign, setCampaign] = useState<Campaign | null>(null);
    const [campaignNotFound, setCampaignNotFound] = useState(false);
    const [scanCode, setScanCode] = useState('');
    const [loading, setLoading] = useState(false);
    const [runner, setRunner] = useState<Runner | null>(null);
    const [found, setFound] = useState<boolean | null>(null);
    const [animKey, setAnimKey] = useState(0);
    const [photoUploaded, setPhotoUploaded] = useState(false);
    const [origin, setOrigin] = useState('');
    const [portrait, setPortrait] = useState(false);
    const [isFullscreen, setIsFullscreen] = useState(false);
    const hiddenInputRef = useRef<HTMLInputElement>(null);
    const nameEnRef = useRef<HTMLHeadingElement>(null);
    const nameThRef = useRef<HTMLHeadingElement>(null);
    const orientationCampaignKey = campaign?.slug || slug || campaign?._id || 'default';

    // Load campaign by slug
    useEffect(() => {
        if (!slug) return;
        (async () => {
            try {
                const res = await fetch(`/api/campaigns/${encodeURIComponent(slug)}?full=true`, { cache: 'no-store' });
                if (res.ok) {
                    const data = await res.json();
                    setCampaign(data);
                } else {
                    setCampaignNotFound(true);
                }
            } catch {
                setCampaignNotFound(true);
            }
        })();
    }, [slug]);

    // Get origin for QR code URL
    useEffect(() => {
        setOrigin(window.location.origin);
    }, []);

    useEffect(() => {
        const syncFullscreen = () => setIsFullscreen(!!document.fullscreenElement);
        syncFullscreen();
        document.addEventListener('fullscreenchange', syncFullscreen);
        return () => document.removeEventListener('fullscreenchange', syncFullscreen);
    }, []);

    const toggleFullscreen = useCallback(async () => {
        try {
            if (document.fullscreenElement) {
                await document.exitFullscreen();
                return;
            }
            await document.documentElement.requestFullscreen();
        } catch { }
    }, []);

    useEffect(() => {
        if (!orientationCampaignKey) return;
        fetch('/api/scanning-orientation', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                campaign: orientationCampaignKey,
                orientation: portrait ? 'portrait' : 'landscape',
            }),
        }).catch(() => {});
    }, [orientationCampaignKey, portrait]);

    useEffect(() => {
        const keepFocus = () => hiddenInputRef.current?.focus();
        keepFocus();
        const interval = setInterval(keepFocus, 500);
        document.addEventListener('click', keepFocus);
        return () => { clearInterval(interval); document.removeEventListener('click', keepFocus); };
    }, []);

    // Auto-fit names to single line: try base size, shrink if overflow
    useLayoutEffect(() => {
        if (!runner) return;
        const fit = () => {
            const baseEn = portrait ? Math.min(7.2, Math.max(4.4, window.innerWidth / 128)) : Math.min(9, Math.max(5.2, window.innerWidth / 360));
            const baseTh = portrait ? Math.min(3.4, Math.max(1.2, window.innerWidth / 360)) : Math.min(3.5, Math.max(2.05, window.innerWidth / 900));
            fitNameToWidth(nameEnRef.current, baseEn, portrait ? 1.35 : 1.4);
            fitNameToWidth(nameThRef.current, baseTh, 0.9);
        };
        fit();
        window.addEventListener('resize', fit);
        return () => window.removeEventListener('resize', fit);
    }, [runner, portrait, animKey]);

    // Poll for photo updates when runner exists but has no photo
    useEffect(() => {
        if (!runner || runner.photoUrl || photoUploaded) return;
        const runnerId = runner._id;
        if (!runnerId) return;
        const interval = setInterval(async () => {
            try {
                const res = await fetch(`/api/runners/${runnerId}`);
                if (res.ok) {
                    const data = await res.json();
                    if (data.photoUrl) {
                        setRunner(prev => prev ? { ...prev, photoUrl: data.photoUrl } : prev);
                        setPhotoUploaded(true);
                    }
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
            const params = new URLSearchParams({ campaignId: campaign?._id || '', code });
            const res = await fetch(`/api/runners/lookup?${params.toString()}`);
            const data = await res.json();
            const foundRunner = data.runner || null;
            if (foundRunner && foundRunner.photoUrl) {
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
            setRunner(null); setFound(false); setAnimKey(k => k + 1);
        } finally {
            setLoading(false); setScanCode('');
        }
    }, [scanCode, loading, campaign]);

    // Campaign not found state
    if (campaignNotFound) {
        return (
            <>
                <link href="https://fonts.googleapis.com/css2?family=Prompt:wght@400;600;700;800;900&display=swap" rel="stylesheet" />
                <div style={{
                    position: 'fixed', inset: 0, display: 'flex', flexDirection: 'column',
                    alignItems: 'center', justifyContent: 'center',
                    background: '#020617', fontFamily: "'Prompt', sans-serif",
                }}>
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
            <link href="https://fonts.googleapis.com/css2?family=Prompt:wght@400;600;700;800;900&family=Lexend:wght@300;400;600;700;800;900&family=Inter:wght@400;500;600;700;800&family=Roboto+Slab:wght@400;600;700;800;900&display=swap" rel="stylesheet" />
            <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css" />

            <style>{`
                @keyframes scanFadeIn { from { opacity: 0; transform: translateY(30px); } to { opacity: 1; transform: translateY(0); } }
                @keyframes scanProgress { from { width: 100%; } to { width: 0%; } }
                @keyframes scanPulse { 0%,100% { opacity: 1; } 50% { opacity: 0.6; } }
                .ce-card, .ce-card * { box-sizing: border-box; }
                .ce-card { --ce-pad-x: clamp(18px, 5vw, 140px); --ce-pad-y: clamp(16px, 5vh, 96px); --ce-gap: clamp(18px, 5vw, 150px); --ce-profile: clamp(220px, min(35vw, 58vh), 780px); width: min(92vw, calc(90vh * 1.795)); height: min(90vh, calc(92vw / 1.795)); background: #ffffff; color: #0f172a; border-radius: 8px; display: flex; flex-direction: column; padding: var(--ce-pad-y) var(--ce-pad-x); box-shadow: 0 25px 50px -12px rgba(0,0,0,0.5); position: relative; animation: scanFadeIn 0.6s cubic-bezier(0.16, 1, 0.3, 1); overflow: hidden; }
                .ce-card > * { position: relative; z-index: 1; }
                .ce-card-bg { position: absolute; inset: 0; z-index: 0; background-position: center; background-size: cover; background-repeat: no-repeat; opacity: 0.25; filter: saturate(0.9); }
                .ce-progress { position: absolute; top: 0; left: 0; height: 4px; background: #16a34a; border-radius: 8px 8px 0 0; animation: scanProgress 8s linear forwards; z-index: 5; }
                .ce-header { text-align: center; border-bottom: 1px solid #cbd5e1; padding-bottom: clamp(8px, 2.6vh, 22px); margin-bottom: clamp(10px, 3vh, 26px); flex-shrink: 0; }
                .ce-event-sub { font-family: 'Prompt', sans-serif; font-size: 1rem; font-weight: 600; color: #64748b; text-transform: uppercase; letter-spacing: 6px; margin: 0 0 4px; }
                .ce-event-name { font-family: 'Prompt', sans-serif; font-size: clamp(1.25rem, min(3.1vw, 5vh), 2.7rem); font-weight: 800; letter-spacing: 1px; color: #0f172a; margin: 0; line-height: 1.12; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
                .ce-medical { display: flex; align-items: center; gap: 16px; background: #fef2f2; border: 2px solid #fca5a5; border-radius: 6px; padding: 13px 22px; margin-top: clamp(10px, 2.6vh, 22px); flex-shrink: 0; }
                .ce-medical-icon { font-size: 1.8rem; color: #dc2626; flex-shrink: 0; }
                .ce-medical-label { font-size: 0.8rem; font-weight: 700; color: #991b1b; text-transform: uppercase; letter-spacing: 2px; margin: 0 0 2px; }
                .ce-medical-text { font-size: 1.1rem; font-weight: 600; color: #dc2626; margin: 0; }
                .ce-middle { flex: 1; display: flex; flex-direction: row; align-items: center; justify-content: center; gap: var(--ce-gap); min-height: 0; }
                .ce-profile-wrapper { position: relative; flex-shrink: 0; }
                .ce-profile-container { width: var(--ce-profile); height: var(--ce-profile); border-radius: 4px; border: 1px solid #cbd5e1; padding: clamp(4px, 1vh, 8px); background: white; box-shadow: 0 10px 15px -3px rgba(0,0,0,0.1); }
                .ce-profile-inner { width: 100%; height: 100%; border-radius: 2px; overflow: hidden; background: #f1f5f9; display: flex; align-items: center; justify-content: center; }
                .ce-profile-img { width: 100%; height: 100%; object-fit: cover; filter: grayscale(20%); }
                .ce-placeholder-svg { width: 72%; height: 72%; opacity: 0.25; }
                .ce-qr-on-frame { position: absolute; bottom: clamp(-22px, -2.4vw, -10px); right: clamp(-22px, -2.4vw, -10px); background: white; padding: clamp(6px, 1.2vw, 10px); border-radius: 6px; border: 1px solid #cbd5e1; box-shadow: 0 8px 16px rgba(0,0,0,0.15); display: flex; flex-direction: column; align-items: center; }
                .ce-qr-caption { color: #64748b; font-size: clamp(8px, 1.1vw, 11px); font-weight: 700; text-transform: uppercase; margin-top: 6px; text-align: center; letter-spacing: 1px; font-family: 'Prompt', sans-serif; }
                .ce-runner-info { display: flex; flex-direction: column; justify-content: center; align-items: flex-start; flex: 1 1 0; min-width: 0; max-width: 58%; }
                .ce-status-badge { color: #16a34a; font-weight: 600; font-size: clamp(0.68rem, 1.5vw, 1.6rem); text-transform: uppercase; margin: 0 0 clamp(6px, 1.8vh, 28px); display: flex; align-items: center; gap: 8px; letter-spacing: 2px; font-family: 'Prompt', sans-serif; white-space: nowrap; }
                .ce-runner-name { font-size: clamp(2rem, min(5.2vw, 9vh), 9rem); font-weight: 800; line-height: 1.05; margin: 0 0 6px; color: #0f172a; font-family: 'Prompt', sans-serif; white-space: nowrap; max-width: 100%; overflow: hidden; text-overflow: ellipsis; }
                .ce-runner-name-en { font-size: clamp(0.9rem, min(2vw, 3.6vh), 3.4rem); font-weight: 400; color: #64748b; text-transform: uppercase; margin: 0 0 clamp(12px, 4vh, 64px); letter-spacing: 2px; font-family: 'Prompt', sans-serif; white-space: nowrap; max-width: 100%; overflow: hidden; text-overflow: ellipsis; }
                .ce-name-panel { width: 100%; }
                .ce-bib-group { display: flex; align-items: center; gap: clamp(8px, 1.8vw, 18px); border-left: clamp(3px, 0.45vw, 4px) solid #16a34a; padding-left: clamp(10px, 1.8vw, 18px); min-width: 0; max-width: 100%; }
                .ce-bib-block { display: flex; align-items: baseline; gap: 10px; }
                .ce-bib-label { font-size: clamp(0.65rem, 1.5vw, 1rem); font-weight: 700; color: #94a3b8; text-transform: uppercase; letter-spacing: 3px; font-family: 'Prompt', sans-serif; }
                .ce-bib-text { font-family: 'Prompt', sans-serif; font-size: clamp(3rem, min(8vw, 13vh), 13rem); font-weight: 700; color: #0f172a; line-height: 0.9; }
                .ce-bib-divider { width: 1px; height: clamp(36px, 10vh, 140px); flex-shrink: 0; background: #cbd5e1; margin: 0 clamp(2px, 0.6vw, 4px); }
                .ce-dist-badge { color: #ef4444; font-size: clamp(1.55rem, min(4vw, 7vh), 6.4rem); font-weight: 800; text-transform: uppercase; letter-spacing: 2px; font-family: 'Prompt', sans-serif; white-space: nowrap; }
                .ce-bottom { margin-top: auto; border-top: 1px solid #cbd5e1; padding-top: clamp(8px, 2.8vh, 22px); flex-shrink: 0; }
                .ce-info-bar { display: grid; grid-template-columns: repeat(2, 1fr); gap: 0; }
                .ce-info-item { text-align: left; padding: clamp(6px, 1.5vh, 10px) clamp(10px, 1.6vw, 18px); border-left: 1px solid #e2e8f0; min-width: 0; }
                .ce-info-item:first-child { border-left: none; padding-left: 0; }
                .ce-info-label { font-size: clamp(0.65rem, 1.35vw, 1.7rem); font-weight: 600; color: #94a3b8; text-transform: uppercase; letter-spacing: 2px; margin: 0 0 6px; font-family: 'Prompt', sans-serif; }
                .ce-info-value { font-size: clamp(1.35rem, min(3vw, 5vh), 4.3rem); font-weight: 800; color: #0f172a; line-height: 1; margin: 0; font-family: 'Prompt', sans-serif; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
                .ce-info-item.highlight .ce-info-label { color: #16a34a; }
                .ce-info-item.highlight .ce-info-value { color: #16a34a; font-size: clamp(1.55rem, min(3.2vw, 5.5vh), 4.8rem); }
                .ce-seal { position: absolute; bottom: clamp(8px, 2vh, 34px); right: clamp(12px, 2.5vw, 56px); font-size: clamp(0.42rem, 0.9vw, 1.1rem); color: #cbd5e1; font-weight: 700; letter-spacing: clamp(2px, 0.35vw, 4px); text-transform: uppercase; text-align: right; font-family: 'Prompt', sans-serif; line-height: 1.4; }
                .ce-seal-mark { color: #94a3b8; }

                @media (max-width: 900px), (max-height: 620px) {
                    .ce-card { --ce-pad-x: clamp(14px, 3.6vw, 34px); --ce-pad-y: clamp(12px, 3vh, 24px); --ce-gap: clamp(14px, 3.5vw, 34px); --ce-profile: clamp(170px, min(34vw, 50vh), 300px); width: 94vw; height: 88vh; }
                    .ce-runner-info { max-width: none; }
                    .ce-qr-on-frame svg { width: clamp(78px, 12vw, 110px); height: clamp(78px, 12vw, 110px); }
                }

                @media (max-width: 700px) and (orientation: landscape), (max-height: 460px) and (orientation: landscape) {
                    .ce-card { --ce-profile: clamp(140px, min(30vw, 46vh), 220px); --ce-gap: 14px; height: 92vh; }
                    .ce-status-badge { letter-spacing: 1px; }
                    .ce-runner-name-en { display: none; }
                    .ce-seal { display: none; }
                }

                /* Portrait */
                .ce-portrait .ce-card { --ce-profile: clamp(190px, min(58vw, 36vh), 560px); width: 92vw; height: 94vh; padding: clamp(16px, 3vh, 64px) clamp(18px, 5vw, 72px) clamp(14px, 2.5vh, 54px); }
                .ce-portrait .ce-header { padding-bottom: clamp(8px, 1.8vh, 30px); margin-bottom: clamp(8px, 2vh, 34px); }
                .ce-portrait .ce-event-sub { font-size: 0.7rem; letter-spacing: 4px; }
                .ce-portrait .ce-event-name { font-size: clamp(1.1rem, 5vw, 3rem); }
                .ce-portrait .ce-middle { flex-direction: column; gap: clamp(10px, 2.4vh, 44px); align-items: center; justify-content: center; }
                .ce-portrait .ce-profile-container { width: var(--ce-profile); height: var(--ce-profile); }
                .ce-portrait .ce-qr-on-frame { bottom: clamp(-14px, -1.8vh, -8px); right: clamp(-14px, -2.5vw, -8px); }
                .ce-portrait .ce-qr-on-frame svg { width: clamp(78px, min(20vw, 13vh), 190px); height: clamp(78px, min(20vw, 13vh), 190px); }
                .ce-portrait .ce-runner-info { align-items: center; text-align: center; max-width: none; width: min(96%, 1080px); min-height: 0; gap: clamp(8px, 1.4vh, 22px); }
                .ce-portrait .ce-name-panel { width: 100%; min-width: 0; min-height: clamp(82px, 10vh, 150px); display: flex; flex-direction: column; align-items: center; justify-content: center; padding: clamp(8px, 1.3vh, 18px) clamp(14px, 3vw, 34px); background: rgba(255,255,255,0.58); border-radius: 8px; }
                .ce-portrait .ce-status-badge { justify-content: center; font-size: clamp(0.68rem, min(2.4vw, 1.7vh), 1.45rem); margin-bottom: clamp(4px, 1.3vh, 20px); }
                .ce-portrait .ce-runner-name { width: 100%; font-size: clamp(1.75rem, min(10.5vw, 6.1vh), 7.2rem); line-height: 1.05; margin-bottom: 4px; max-width: 100%; }
                .ce-portrait .ce-runner-name-en { font-size: clamp(0.72rem, min(2.8vw, 2vh), 2rem); margin-bottom: clamp(8px, 2.2vh, 38px); }
                .ce-portrait .ce-name-panel .ce-runner-name-en { margin-bottom: 0; }
                .ce-portrait .ce-bib-group { width: fit-content; max-width: 100%; border-left: none; border-top: 4px solid #16a34a; padding: clamp(8px, 1.3vh, 18px) clamp(20px, 5vw, 48px); justify-content: center; gap: clamp(12px, 3vw, 38px); background: rgba(255,255,255,0.58); border-radius: 8px; }
                .ce-portrait .ce-bib-block { align-items: baseline; gap: clamp(8px, 1.6vw, 20px); }
                .ce-portrait .ce-bib-text { font-size: clamp(3rem, min(15vw, 8vh), 9rem); }
                .ce-portrait .ce-bib-label { font-size: clamp(1.2rem, 2.5vw, 2.2rem); letter-spacing: 2px; transform: translateY(-8%); }
                .ce-portrait .ce-dist-badge { font-size: clamp(1.35rem, min(6vw, 4.5vh), 4rem); }
                .ce-portrait .ce-info-bar { grid-template-columns: repeat(2, 1fr); gap: 1px; background: #e2e8f0; border-radius: 6px; overflow: hidden; }
                .ce-portrait .ce-info-item { border-left: none; background: white; padding: clamp(8px, 1.8vh, 14px) clamp(10px, 3vw, 16px); text-align: center; }
                .ce-portrait .ce-info-item:first-child { padding-left: 16px; }
                .ce-portrait .ce-info-label { font-size: clamp(0.65rem, min(2.2vw, 1.6vh), 1.5rem); letter-spacing: 1.5px; }
                .ce-portrait .ce-info-value { font-size: clamp(1.2rem, min(5vw, 3.8vh), 3.4rem); }
                .ce-portrait .ce-info-item.highlight .ce-info-value { font-size: clamp(1.35rem, min(5.8vw, 4.2vh), 3.8rem); }
                .ce-portrait .ce-medical { max-width: min(72vw, 520px); align-self: flex-end; padding: clamp(8px, 1.2vh, 14px) clamp(12px, 2vw, 22px); gap: 10px; margin-top: clamp(8px, 1.2vh, 16px); background: #ef4444; border: none; border-radius: 4px; box-shadow: 0 6px 14px rgba(127, 29, 29, 0.22); }
                .ce-portrait .ce-medical-icon { font-size: clamp(1rem, 2vw, 1.45rem); color: white; }
                .ce-portrait .ce-medical-label { font-size: clamp(0.56rem, 1.15vw, 0.9rem); color: white; letter-spacing: 1px; }
                .ce-portrait .ce-medical-text { font-size: clamp(0.75rem, 1.6vw, 1.15rem); color: white; line-height: 1.35; }
                .ce-portrait .ce-seal { bottom: 8px; right: 12px; font-size: 0.52rem; }

                @media (max-height: 720px) and (max-width: 900px) {
                    .ce-portrait .ce-card { --ce-profile: clamp(160px, min(54vw, 32vh), 260px); height: 92vh; }
                    .ce-portrait .ce-qr-caption { display: none; }
                    .ce-portrait .ce-runner-name-en { display: none; }
                    .ce-portrait .ce-bottom { padding-top: clamp(6px, 1.4vh, 10px); }
                    .ce-portrait .ce-seal { display: none; }
                }
            `}</style>

            <input ref={hiddenInputRef} value={scanCode}
                onChange={e => setScanCode(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') handleScan(); }}
                style={{ position: 'fixed', top: -100, left: -100, opacity: 0 }} autoFocus />

            {/* Orientation Toggle */}
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
                    background: '#020617', animation: 'scanFadeIn 0.5s ease-out', fontFamily: "'Prompt', sans-serif",
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
                    <div style={{ fontSize: 80, marginBottom: 24, animation: 'scanPulse 2s ease-in-out infinite' }}>📡</div>
                    <div style={{ fontSize: 36, fontWeight: 900, color: '#fff', marginBottom: 8 }}>รอการสแกน</div>
                    <div style={{ fontSize: 18, color: '#94a3b8' }}>Waiting for RFID scan...</div>
                    <div style={{ fontSize: 14, color: '#64748b', marginTop: 20 }}>{campaignName}</div>
                </div>
            )}

            {/* === CLASSIC ELEGANCE TEMPLATE === */}
            {found && runner && (
                <div key={`a-${animKey}`} className={portrait ? 'ce-portrait' : ''} style={{
                    position: 'fixed', inset: 0, zIndex: 60,
                    background: '#0f172a',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontFamily: "'Prompt', sans-serif",
                    overflow: 'hidden',
                }}>
                    <div className="ce-card">
                        <div className="ce-progress" key={`prog-${animKey}`} />
                        {campaign?.scanningBgImage && (
                            <div className="ce-card-bg" style={{ backgroundImage: `url(${campaign.scanningBgImage})` }} />
                        )}

                        {/* Header */}
                        <div className="ce-header">
                            <h1 className="ce-event-name">{campaignName}</h1>
                        </div>

                        {/* Middle */}
                        <div className="ce-middle">
                            <div className="ce-profile-wrapper">
                                <div className="ce-profile-container">
                                    <div className="ce-profile-inner">
                                        <RunnerPhoto photoUrl={runner.photoUrl} />
                                    </div>
                                </div>

                                {!photoUploaded && !runner.photoUrl && (
                                    <div className="ce-qr-on-frame">
                                        {origin && runner._id ? (
                                            <QRCodeSVG
                                                value={`${origin}/upload/${runner._id}?slug=${campaign?.slug || slug || ''}&campaign=${orientationCampaignKey}&orientation=${portrait ? 'portrait' : 'landscape'}`}
                                                size={portrait ? 110 : 140} bgColor="#ffffff" fgColor="#0f172a" level="H"
                                            />
                                        ) : (
                                            <div style={{ width: portrait ? 110 : 140, height: portrait ? 110 : 140, background: '#f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                                <i className="fa-solid fa-qrcode" style={{ fontSize: 60, color: '#0f172a' }} />
                                            </div>
                                        )}
                                        <p className="ce-qr-caption">Upload Photo</p>
                                    </div>
                                )}
                            </div>

                            <div className="ce-runner-info">
                                <div className="ce-name-panel">
                                    <p className="ce-status-badge">
                                        <i className="fa-regular fa-circle-check" /> ยืนยันข้อมูล
                                        {flag && <span style={{ fontSize: '1.1em', marginLeft: 4 }}>{flag}</span>}
                                    </p>
                                    <h2 ref={nameEnRef} className="ce-runner-name">{nameEn || nameTh}</h2>
                                    {nameTh && nameEn && <h3 ref={nameThRef} className="ce-runner-name-en">{nameTh}</h3>}
                                </div>
                                <div className="ce-bib-group">
                                    <div className="ce-bib-block">
                                        <span className="ce-bib-label">BIB</span>
                                        <span className="ce-bib-text">{bibNum}</span>
                                    </div>
                                    <div className="ce-bib-divider" />
                                    <span className="ce-dist-badge">{distance}</span>
                                </div>
                                {hasMedical && (
                                    <div className="ce-medical">
                                        <div className="ce-medical-icon">
                                            <i className="fa-solid fa-triangle-exclamation" />
                                        </div>
                                        <div>
                                            <p className="ce-medical-label">⚕ Medical Alert — แจ้งเจ้าหน้าที่</p>
                                            <p className="ce-medical-text">{r?.medical}</p>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Bottom */}
                        <div className="ce-bottom">
                            <div className="ce-info-bar">
                                <div className="ce-info-item">
                                    <p className="ce-info-label">Gender</p>
                                    <p className="ce-info-value">{genderLabel}</p>
                                </div>
                                <div className="ce-info-item highlight">
                                    <p className="ce-info-label">Age Group</p>
                                    <p className="ce-info-value">{ageGroupLabel}</p>
                                </div>
                            </div>
                        </div>

                        <div className="ce-seal">
                            Powered by<br />
                            <span className="ce-seal-mark">ACTION TIMING</span>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}

function RunnerPhoto({ photoUrl }: { photoUrl?: string }) {
    const [errored, setErrored] = useState(false);
    const showImage = !!photoUrl && !errored;
    return showImage ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
            src={photoUrl}
            alt="runner"
            className="ce-profile-img"
            onError={() => setErrored(true)}
        />
    ) : (
        <svg viewBox="0 0 120 120" xmlns="http://www.w3.org/2000/svg" className="ce-placeholder-svg">
            <circle cx="60" cy="38" r="22" fill="#475569" />
            <path d="M10 110 C10 78 30 65 60 65 C90 65 110 78 110 110 Z" fill="#475569" />
        </svg>
    );
}
