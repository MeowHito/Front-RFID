'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import { useParams } from 'next/navigation';
import { QRCodeSVG } from 'qrcode.react';

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
    const [checkInTime, setCheckInTime] = useState('');
    const hiddenInputRef = useRef<HTMLInputElement>(null);

    // Load campaign by slug
    useEffect(() => {
        if (!slug) return;
        (async () => {
            try {
                const res = await fetch(`/api/campaigns/${encodeURIComponent(slug)}`);
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
        const keepFocus = () => hiddenInputRef.current?.focus();
        keepFocus();
        const interval = setInterval(keepFocus, 500);
        document.addEventListener('click', keepFocus);
        return () => { clearInterval(interval); document.removeEventListener('click', keepFocus); };
    }, []);

    // Poll for photo updates when runner exists but has no photo
    useEffect(() => {
        if (!runner || runner.photoUrl || photoUploaded) return;
        const runnerId = (runner as any)._id;
        if (!runnerId) return;
        const interval = setInterval(async () => {
            try {
                const res = await fetch(`/api/runners/${runnerId}`);
                if (res.ok) {
                    const data = await res.json();
                    if (data.photoUrl) {
                        setRunner((prev: any) => prev ? { ...prev, photoUrl: data.photoUrl } : prev);
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
            if (data.found) {
                setCheckInTime(new Date().toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' }));
            }
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
    const waveLabel = r?.wave || '-';
    const shirtLabel = r?.shirtSize || '-';
    const hasMedical = !!(r?.medical && r.medical.trim() !== '' && r.medical !== 'ไม่มี');

    return (
        <>
            <link href="https://fonts.googleapis.com/css2?family=Prompt:wght@400;600;700;800;900&family=Lexend:wght@300;400;600;700;800;900&family=Inter:wght@400;500;600;700;800&family=Roboto+Slab:wght@400;600;700;800;900&display=swap" rel="stylesheet" />
            <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css" />

            <style>{`
                @keyframes scanFadeIn { from { opacity: 0; transform: translateY(30px); } to { opacity: 1; transform: translateY(0); } }
                @keyframes scanProgress { from { width: 100%; } to { width: 0%; } }
                @keyframes scanPulse { 0%,100% { opacity: 1; } 50% { opacity: 0.6; } }
                .ce-card { width: 90vw; height: 90vh; max-width: 1400px; background: #ffffff; color: #0f172a; border-radius: 8px; display: flex; flex-direction: column; padding: 46px 72px; box-shadow: 0 25px 50px -12px rgba(0,0,0,0.5); position: relative; animation: scanFadeIn 0.6s cubic-bezier(0.16, 1, 0.3, 1); overflow: hidden; }
                .ce-progress { position: absolute; top: 0; left: 0; height: 4px; background: #16a34a; border-radius: 8px 8px 0 0; animation: scanProgress 8s linear forwards; z-index: 5; }
                .ce-header { text-align: center; border-bottom: 1px solid #cbd5e1; padding-bottom: 22px; margin-bottom: 26px; flex-shrink: 0; }
                .ce-event-sub { font-family: 'Prompt', sans-serif; font-size: 1rem; font-weight: 600; color: #64748b; text-transform: uppercase; letter-spacing: 6px; margin: 0 0 4px; }
                .ce-event-name { font-family: 'Prompt', sans-serif; font-size: clamp(1.6rem, 3vw, 2.4rem); font-weight: 800; letter-spacing: 1px; color: #0f172a; margin: 0; line-height: 1.15; }
                .ce-medical { display: flex; align-items: center; gap: 16px; background: #fef2f2; border: 2px solid #fca5a5; border-radius: 6px; padding: 13px 22px; margin-bottom: 22px; flex-shrink: 0; }
                .ce-medical-icon { font-size: 1.8rem; color: #dc2626; flex-shrink: 0; }
                .ce-medical-label { font-size: 0.8rem; font-weight: 700; color: #991b1b; text-transform: uppercase; letter-spacing: 2px; margin: 0 0 2px; }
                .ce-medical-text { font-size: 1.1rem; font-weight: 600; color: #dc2626; margin: 0; }
                .ce-middle { flex: 1; display: flex; flex-direction: row; align-items: center; justify-content: center; gap: 72px; min-height: 0; }
                .ce-profile-wrapper { position: relative; flex-shrink: 0; }
                .ce-profile-container { width: 440px; height: 440px; border-radius: 4px; border: 1px solid #cbd5e1; padding: 8px; background: white; box-shadow: 0 10px 15px -3px rgba(0,0,0,0.1); }
                .ce-profile-inner { width: 100%; height: 100%; border-radius: 2px; overflow: hidden; background: #f1f5f9; display: flex; align-items: center; justify-content: center; }
                .ce-profile-img { width: 100%; height: 100%; object-fit: cover; filter: grayscale(20%); }
                .ce-placeholder-svg { width: 72%; height: 72%; opacity: 0.25; }
                .ce-qr-on-frame { position: absolute; bottom: -18px; right: -18px; background: white; padding: 7px; border-radius: 4px; border: 1px solid #cbd5e1; box-shadow: 0 8px 12px rgba(0,0,0,0.1); display: flex; flex-direction: column; align-items: center; }
                .ce-qr-caption { color: #64748b; font-size: 8px; font-weight: 700; text-transform: uppercase; margin-top: 4px; text-align: center; letter-spacing: 1px; font-family: 'Prompt', sans-serif; }
                .ce-runner-info { display: flex; flex-direction: column; justify-content: center; align-items: flex-start; max-width: 58%; }
                .ce-status-badge { color: #16a34a; font-weight: 600; font-size: 1rem; text-transform: uppercase; margin: 0 0 14px; display: flex; align-items: center; gap: 8px; letter-spacing: 2px; font-family: 'Prompt', sans-serif; }
                .ce-runner-name { font-size: clamp(3rem, 5.5vw, 5.2rem); font-weight: 800; line-height: 1.1; margin: 0 0 6px; color: #0f172a; font-family: 'Prompt', sans-serif; }
                .ce-runner-name-en { font-size: clamp(1.2rem, 2vw, 1.9rem); font-weight: 400; color: #64748b; text-transform: uppercase; margin: 0 0 32px; letter-spacing: 2px; font-family: 'Prompt', sans-serif; }
                .ce-bib-group { display: flex; align-items: baseline; gap: 18px; border-left: 4px solid #16a34a; padding-left: 18px; }
                .ce-bib-block { display: flex; align-items: baseline; gap: 10px; }
                .ce-bib-label { font-size: 1rem; font-weight: 700; color: #94a3b8; text-transform: uppercase; letter-spacing: 3px; font-family: 'Prompt', sans-serif; }
                .ce-bib-text { font-family: 'Prompt', sans-serif; font-size: clamp(5rem, 8vw, 7.5rem); font-weight: 700; color: #0f172a; line-height: 0.9; }
                .ce-bib-divider { width: 2px; align-self: stretch; background: #cbd5e1; margin: 8px 4px; }
                .ce-dist-badge { color: #ef4444; font-size: clamp(2.5rem, 4vw, 3.4rem); font-weight: 800; text-transform: uppercase; letter-spacing: 2px; font-family: 'Prompt', sans-serif; }
                .ce-bottom { margin-top: auto; border-top: 1px solid #cbd5e1; padding-top: 22px; flex-shrink: 0; }
                .ce-info-bar { display: grid; grid-template-columns: repeat(2, 1fr); gap: 0; }
                .ce-info-item { text-align: left; padding: 10px 18px; border-left: 1px solid #e2e8f0; }
                .ce-info-item:first-child { border-left: none; padding-left: 0; }
                .ce-info-label { font-size: 1rem; font-weight: 600; color: #94a3b8; text-transform: uppercase; letter-spacing: 2px; margin: 0 0 6px; font-family: 'Prompt', sans-serif; }
                .ce-info-value { font-size: 2.4rem; font-weight: 800; color: #0f172a; line-height: 1; margin: 0; font-family: 'Prompt', sans-serif; }
                .ce-info-item.highlight .ce-info-label { color: #16a34a; }
                .ce-info-item.highlight .ce-info-value { color: #16a34a; font-size: 2.7rem; }
                .ce-seal { position: absolute; bottom: 18px; right: 28px; font-size: 0.62rem; color: #cbd5e1; font-weight: 700; letter-spacing: 4px; text-transform: uppercase; text-align: right; font-family: 'Prompt', sans-serif; line-height: 1.4; }
                .ce-seal-mark { color: #94a3b8; }

                /* Portrait */
                .ce-portrait .ce-card { width: min(88vw, 520px); height: 94vh; padding: 32px 32px 24px; }
                .ce-portrait .ce-header { padding-bottom: 14px; margin-bottom: 16px; }
                .ce-portrait .ce-event-sub { font-size: 0.7rem; letter-spacing: 4px; }
                .ce-portrait .ce-event-name { font-size: clamp(1rem, 4.5vw, 1.4rem); }
                .ce-portrait .ce-middle { flex-direction: column; gap: 20px; align-items: center; justify-content: flex-start; }
                .ce-portrait .ce-profile-container { width: min(70vw, 340px); height: min(70vw, 340px); }
                .ce-portrait .ce-qr-on-frame { bottom: -14px; right: -14px; }
                .ce-portrait .ce-runner-info { align-items: center; text-align: center; max-width: 100%; }
                .ce-portrait .ce-status-badge { justify-content: center; font-size: 0.85rem; margin-bottom: 10px; }
                .ce-portrait .ce-runner-name { font-size: clamp(2rem, 9vw, 3rem); margin-bottom: 4px; }
                .ce-portrait .ce-runner-name-en { font-size: clamp(0.85rem, 3vw, 1.1rem); margin-bottom: 18px; }
                .ce-portrait .ce-bib-group { border-left: none; border-top: 4px solid #16a34a; padding-left: 0; padding-top: 14px; justify-content: center; gap: 12px; }
                .ce-portrait .ce-bib-text { font-size: clamp(4rem, 17vw, 5.5rem); }
                .ce-portrait .ce-bib-label { font-size: 0.75rem; letter-spacing: 2px; }
                .ce-portrait .ce-dist-badge { font-size: 2.1rem; }
                .ce-portrait .ce-info-bar { grid-template-columns: repeat(2, 1fr); gap: 1px; background: #e2e8f0; border-radius: 6px; overflow: hidden; }
                .ce-portrait .ce-info-item { border-left: none; background: white; padding: 14px 16px; text-align: center; }
                .ce-portrait .ce-info-item:first-child { padding-left: 16px; }
                .ce-portrait .ce-info-label { font-size: 0.85rem; letter-spacing: 1.5px; }
                .ce-portrait .ce-info-value { font-size: 1.85rem; }
                .ce-portrait .ce-info-item.highlight .ce-info-value { font-size: 2.15rem; }
                .ce-portrait .ce-medical { padding: 10px 14px; gap: 10px; margin-bottom: 12px; }
                .ce-portrait .ce-medical-icon { font-size: 1.3rem; }
                .ce-portrait .ce-medical-label { font-size: 0.68rem; }
                .ce-portrait .ce-medical-text { font-size: 0.95rem; }
                .ce-portrait .ce-seal { bottom: 8px; right: 12px; font-size: 0.52rem; }
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
                    background: campaign?.scanningBgImage
                        ? `url(${campaign.scanningBgImage}) center/cover no-repeat`
                        : '#0f172a',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontFamily: "'Prompt', sans-serif",
                    overflow: 'hidden',
                }}>
                    {campaign?.scanningBgImage && (
                        <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 0 }} />
                    )}

                    <div className="ce-card">
                        <div className="ce-progress" key={`prog-${animKey}`} />

                        {/* Header */}
                        <div className="ce-header">
                            <h1 className="ce-event-name">{campaignName}</h1>
                        </div>

                        {/* Medical Alert */}
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
                                        {origin && (runner as any)._id ? (
                                            <QRCodeSVG
                                                value={`${origin}/upload/${(runner as any)._id}?slug=${campaign?.slug || ''}`}
                                                size={76} bgColor="#ffffff" fgColor="#0f172a" level="H"
                                            />
                                        ) : (
                                            <div style={{ width: 76, height: 76, background: '#f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                                <i className="fa-solid fa-qrcode" style={{ fontSize: 40, color: '#0f172a' }} />
                                            </div>
                                        )}
                                        <p className="ce-qr-caption">Upload Photo</p>
                                    </div>
                                )}
                            </div>

                            <div className="ce-runner-info">
                                <p className="ce-status-badge">
                                    <i className="fa-regular fa-circle-check" /> ยืนยันข้อมูล
                                    {flag && <span style={{ fontSize: '1.1em', marginLeft: 4 }}>{flag}</span>}
                                </p>
                                <h2 className="ce-runner-name">{nameTh || nameEn}</h2>
                                {nameTh && <h3 className="ce-runner-name-en">{nameEn}</h3>}
                                <div className="ce-bib-group">
                                    <div className="ce-bib-block">
                                        <span className="ce-bib-label">BIB</span>
                                        <span className="ce-bib-text">{bibNum}</span>
                                    </div>
                                    <div className="ce-bib-divider" />
                                    <span className="ce-dist-badge">{distance}</span>
                                </div>
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
