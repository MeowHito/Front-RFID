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
}
interface Campaign { _id: string; name: string; slug?: string; scanningTemplate?: string; }

export default function ScanningBySlugPage() {
    const params = useParams();
    const slug = params.slug as string;

    const [campaign, setCampaign] = useState<Campaign | null>(null);
    const [campaignNotFound, setCampaignNotFound] = useState(false);
    const [template, setTemplate] = useState<'classic' | 'split'>('classic');
    const [scanCode, setScanCode] = useState('');
    const [loading, setLoading] = useState(false);
    const [runner, setRunner] = useState<Runner | null>(null);
    const [found, setFound] = useState<boolean | null>(null);
    const [animKey, setAnimKey] = useState(0);
    const [photoUploaded, setPhotoUploaded] = useState(false);
    const [origin, setOrigin] = useState('');
    const hiddenInputRef = useRef<HTMLInputElement>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    // Load campaign by slug
    useEffect(() => {
        if (!slug) return;
        (async () => {
            try {
                const res = await fetch(`/api/campaigns/${encodeURIComponent(slug)}`);
                if (res.ok) {
                    const data = await res.json();
                    setCampaign(data);
                    if (data.scanningTemplate === 'split') setTemplate('split');
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
            setRunner(data.runner || null);
            setFound(!!data.found);
            setAnimKey(k => k + 1);
        } catch {
            setRunner(null); setFound(false); setAnimKey(k => k + 1);
        } finally {
            setLoading(false); setScanCode('');
        }
    }, [scanCode, loading, campaign]);

    const handlePhotoUpload = () => fileInputRef.current?.click();
    const onFileSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file || !runner) return;
        // TODO: upload file to server, for now just mark as uploaded
        setPhotoUploaded(true);
        e.target.value = '';
    };

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
    const genderLabel = r?.gender === 'M' ? 'Male' : r?.gender === 'F' ? 'Female' : '-';
    const ageGroupLabel = r?.ageGroup || '-';
    const flag = toFlag(r?.nationality);

    return (
        <>
            <link href="https://fonts.googleapis.com/css2?family=Prompt:wght@400;600;700;800;900&family=Exo+2:wght@800;900&display=swap" rel="stylesheet" />
            <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css" />

            <input ref={hiddenInputRef} value={scanCode}
                onChange={e => setScanCode(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') handleScan(); }}
                style={{ position: 'fixed', top: -100, left: -100, opacity: 0 }} autoFocus />

            <input ref={fileInputRef} type="file" accept="image/*" style={{ display: 'none' }}
                onChange={onFileSelected} />

            {/* Template toggle */}
            <button onClick={() => setTemplate(t => t === 'classic' ? 'split' : 'classic')} style={{
                position: 'fixed', top: 16, right: 16, zIndex: 100, height: 36,
                padding: '0 14px', borderRadius: 18, border: '1px solid rgba(255,255,255,0.2)',
                background: 'rgba(0,0,0,0.5)', color: '#94a3b8', fontSize: 11, cursor: 'pointer',
                backdropFilter: 'blur(10px)', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 6,
            }}>
                <i className="fa-solid fa-shuffle" /> {template === 'classic' ? 'Classic' : 'Split'}
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
                    background: '#020617', animation: 'fadeIn 0.5s ease-out', fontFamily: "'Prompt', sans-serif",
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
                    <div style={{ fontSize: 80, marginBottom: 24, animation: 'pulse 2s ease-in-out infinite' }}>📡</div>
                    <div style={{ fontSize: 36, fontWeight: 900, color: '#fff', marginBottom: 8 }}>รอการสแกน</div>
                    <div style={{ fontSize: 18, color: '#94a3b8' }}>Waiting for RFID scan...</div>
                    <div style={{ fontSize: 14, color: '#64748b', marginTop: 20 }}>{campaignName}</div>
                </div>
            )}

            {/* === CLASSIC TEMPLATE === */}
            {found && runner && template === 'classic' && (
                <div key={`c-${animKey}`} style={{
                    position: 'fixed', inset: 0, zIndex: 60,
                    background: 'radial-gradient(circle at center, #1e293b 0%, #020617 100%)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontFamily: "'Prompt', sans-serif", animation: 'fadeIn 0.6s ease-out',
                }}>
                    <div style={{
                        width: '95vw', height: '95vh', maxWidth: 1600,
                        background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.1)',
                        borderRadius: 40, display: 'flex', flexDirection: 'column',
                        padding: '40px 60px', boxShadow: '0 30px 60px rgba(0,0,0,0.5)',
                        backdropFilter: 'blur(20px)', position: 'relative', overflow: 'hidden',
                    }}>
                        {/* Header */}
                        <div style={{ textAlign: 'center', borderBottom: '2px solid rgba(255,255,255,0.1)', paddingBottom: 20, marginBottom: 30 }}>
                            <h1 style={{ fontSize: 'clamp(2rem,4vw,3rem)', fontWeight: 900, textTransform: 'uppercase', letterSpacing: 2, color: '#fff', margin: 0 }}>
                                {campaignName}
                            </h1>
                            <h2 style={{ fontSize: 'clamp(1rem,2vw,1.5rem)', fontWeight: 700, color: '#4ade80', textTransform: 'uppercase', letterSpacing: 4, margin: '4px 0 0' }}>
                                RFID Check-in • Action Timing
                            </h2>
                        </div>

                        {/* Middle */}
                        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 50, padding: '20px 0' }}>
                            {/* Runner photo / QR area — bigger, shifted left */}
                            <div style={{ position: 'relative', flexShrink: 0, marginRight: 10 }}>
                                <div style={{
                                    width: 340, height: 340, borderRadius: 30,
                                    border: '6px solid #4ade80', overflow: 'hidden',
                                    boxShadow: '0 20px 40px rgba(74,222,128,0.2)',
                                    background: '#0f172a', display: 'flex', alignItems: 'center', justifyContent: 'center',
                                }}>
                                    {runner.photoUrl ? (
                                        <img src={runner.photoUrl} alt="runner" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                    ) : (
                                        <div style={{ textAlign: 'center', color: '#4ade80' }}>
                                            <i className="fa-solid fa-person-running" style={{ fontSize: 100, marginBottom: 12 }} />
                                        </div>
                                    )}
                                </div>
                                {/* QR Code / Flag overlay */}
                                {!photoUploaded && !runner.photoUrl ? (
                                    <div style={{
                                        position: 'absolute', bottom: -15, right: -15,
                                        background: '#fff', padding: 10, borderRadius: 16,
                                        border: '4px solid #4ade80', boxShadow: '0 15px 30px rgba(0,0,0,0.5)',
                                        display: 'flex', flexDirection: 'column', alignItems: 'center',
                                    }}>
                                        {origin && (runner as any)._id ? (
                                            <>
                                                <QRCodeSVG
                                                    value={`${origin}/upload/${(runner as any)._id}`}
                                                    size={90}
                                                    bgColor="#ffffff"
                                                    fgColor="#0f172a"
                                                    level="M"
                                                />
                                                <p style={{ color: '#0f172a', fontSize: 10, fontWeight: 900, textTransform: 'uppercase', marginTop: 6 }}>Scan to Upload</p>
                                            </>
                                        ) : (
                                            <>
                                                <div style={{ width: 90, height: 90, background: '#f1f5f9', borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                                    <i className="fa-solid fa-qrcode" style={{ fontSize: 50, color: '#0f172a' }} />
                                                </div>
                                                <p style={{ color: '#0f172a', fontSize: 10, fontWeight: 900, textTransform: 'uppercase', marginTop: 6 }}>Scan to Upload</p>
                                            </>
                                        )}
                                    </div>
                                ) : (
                                    <div style={{
                                        position: 'absolute', bottom: -10, right: -10,
                                        background: '#fff', padding: 6, borderRadius: 12,
                                        border: '3px solid #4ade80', boxShadow: '0 10px 20px rgba(0,0,0,0.4)',
                                        display: 'flex', flexDirection: 'column', alignItems: 'center',
                                    }}>
                                        <div style={{ width: 55, height: 45, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                            <span style={{ fontSize: 28, fontWeight: 900, color: '#0f172a', fontFamily: "'Exo 2', sans-serif", fontStyle: 'italic' }}>{bibNum}</span>
                                        </div>
                                        <p style={{ color: '#64748b', fontSize: 8, fontWeight: 800, textTransform: 'uppercase', marginTop: 2 }}>BIB</p>
                                    </div>
                                )}
                            </div>

                            <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                                <div style={{ color: '#4ade80', fontWeight: 800, fontSize: '1.5rem', textTransform: 'uppercase', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 10 }}>
                                    <i className="fa-solid fa-circle-check" /> Verified Runner
                                    {flag && <span style={{ fontSize: 32 }}>{flag}</span>}
                                </div>
                                <h2 style={{ fontSize: 'clamp(3rem,5vw,5rem)', fontWeight: 900, lineHeight: 1, margin: '0 0 5px', color: '#fff' }}>
                                    {nameTh || nameEn}
                                </h2>
                                {nameTh && (
                                    <h3 style={{ fontSize: 'clamp(1.5rem,2.5vw,2rem)', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', margin: '0 0 30px' }}>{nameEn}</h3>
                                )}
                                <div style={{ display: 'flex', alignItems: 'center', gap: 20, marginTop: nameTh ? 0 : 25 }}>
                                    {/* Distance badge — bigger red box */}
                                    <div style={{
                                        background: '#ef4444', color: '#fff', padding: '14px 36px', borderRadius: 18,
                                        fontSize: '2.8rem', fontWeight: 900, boxShadow: '0 10px 25px rgba(239,68,68,0.4)',
                                        border: '3px solid rgba(255,255,255,0.2)',
                                    }}>{distance}</div>
                                    <div>
                                        <div style={{ fontSize: '1rem', fontWeight: 700, color: '#64748b', letterSpacing: 3, textTransform: 'uppercase' }}>BIB</div>
                                        <div style={{
                                            fontSize: 'clamp(5rem,9vw,8rem)', fontWeight: 900, color: '#fff',
                                            fontStyle: 'italic', lineHeight: 0.85, textShadow: '0 5px 15px rgba(0,0,0,0.5)',
                                            fontFamily: "'Exo 2', sans-serif",
                                        }}>{bibNum}</div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Bottom info bar — 2 items only (no shirt size) */}
                        <div style={{ marginTop: 40 }}>
                            <div style={{
                                display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)',
                                background: 'rgba(255,255,255,0.05)', borderRadius: 30,
                                overflow: 'hidden', border: '1px solid rgba(255,255,255,0.1)',
                            }}>
                                <BarItem label="Gender" value={genderLabel} />
                                <BarItem label="Age Group" value={ageGroupLabel} highlight />
                            </div>
                        </div>

                        <div style={{
                            position: 'absolute', bottom: 0, left: 0, height: 10,
                            background: '#4ade80', borderRadius: '0 0 40px 40px',
                            animation: 'timer 8s linear forwards',
                        }} />
                    </div>
                </div>
            )}

            {/* === SPLIT TEMPLATE === */}
            {found && runner && template === 'split' && (
                <div key={`s-${animKey}`} style={{
                    position: 'fixed', inset: 0, zIndex: 60,
                    background: 'linear-gradient(135deg, #020617 0%, #0f172a 100%)',
                    display: 'flex', flexDirection: 'row',
                    fontFamily: "'Prompt', sans-serif", animation: 'fadeIn 0.8s ease-out',
                }}>
                    {/* Left — runner image area, bigger */}
                    <div style={{ width: '45%', height: '100%', position: 'relative', overflow: 'hidden', background: '#000' }}>
                        <div style={{
                            width: '100%', height: '100%',
                            background: 'linear-gradient(135deg, #1e293b 0%, #0f172a 50%, #020617 100%)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                        }}>
                            {runner.photoUrl ? (
                                <img src={runner.photoUrl} alt="runner" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                            ) : (
                                <div style={{ textAlign: 'center', color: '#4ade80' }}>
                                    <i className="fa-solid fa-person-running" style={{ fontSize: 180, marginBottom: 20 }} />
                                </div>
                            )}
                        </div>
                        <div style={{
                            position: 'absolute', inset: 0,
                            background: 'linear-gradient(to right, rgba(2,6,23,0) 70%, rgba(2,6,23,1) 100%)',
                        }} />
                        {/* QR Code / Flag overlay */}
                        {!photoUploaded && !runner.photoUrl ? (
                            <div style={{
                                position: 'absolute', bottom: 40, left: 40, zIndex: 10,
                                background: '#fff', padding: 12, borderRadius: 16, width: 150,
                                display: 'flex', flexDirection: 'column', alignItems: 'center',
                                border: '4px solid #4ade80', boxShadow: '0 15px 30px rgba(0,0,0,0.5)',
                            }}>
                                {origin && (runner as any)._id ? (
                                    <>
                                        <QRCodeSVG
                                            value={`${origin}/upload/${(runner as any)._id}`}
                                            size={120}
                                            bgColor="#ffffff"
                                            fgColor="#0f172a"
                                            level="M"
                                        />
                                        <p style={{ color: '#0f172a', fontSize: 10, fontWeight: 900, textTransform: 'uppercase', marginTop: 8, textAlign: 'center' }}>
                                            Scan to upload<br />your photo
                                        </p>
                                    </>
                                ) : (
                                    <>
                                        <div style={{ width: 120, height: 120, background: '#f1f5f9', borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                            <i className="fa-solid fa-qrcode" style={{ fontSize: 70, color: '#0f172a' }} />
                                        </div>
                                        <p style={{ color: '#0f172a', fontSize: 10, fontWeight: 900, textTransform: 'uppercase', marginTop: 8, textAlign: 'center' }}>
                                            Scan to upload<br />your photo
                                        </p>
                                    </>
                                )}
                            </div>
                        ) : (
                            <div style={{
                                position: 'absolute', bottom: 40, left: 40, zIndex: 10,
                                background: '#fff', padding: 8, borderRadius: 12, width: 90,
                                display: 'flex', flexDirection: 'column', alignItems: 'center',
                                border: '3px solid #4ade80', boxShadow: '0 10px 20px rgba(0,0,0,0.4)',
                            }}>
                                <div style={{ width: 70, height: 55, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                    <span style={{ fontSize: 36, fontWeight: 900, color: '#0f172a', fontFamily: "'Exo 2', sans-serif", fontStyle: 'italic' }}>{bibNum}</span>
                                </div>
                                <p style={{ color: '#64748b', fontSize: 9, fontWeight: 800, textTransform: 'uppercase', marginTop: 4, textAlign: 'center' }}>BIB</p>
                            </div>
                        )}
                    </div>

                    {/* Right */}
                    <div style={{ width: '55%', display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: '5vh 6vw', zIndex: 5 }}>
                        <div style={{ marginBottom: '4vh', borderLeft: '6px solid #4ade80', paddingLeft: 20 }}>
                            <h2 style={{ fontSize: 'clamp(1.5rem,3vw,2.2rem)', fontWeight: 900, textTransform: 'uppercase', lineHeight: 1.1, color: '#fff', margin: 0 }}>{campaignName}</h2>
                            <p style={{ fontSize: 'clamp(0.9rem,1.5vw,1.2rem)', fontWeight: 700, color: '#4ade80', textTransform: 'uppercase', letterSpacing: 2, marginTop: 4 }}>RFID Check-in • Action Timing</p>
                        </div>

                        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 10, marginBottom: '5vh' }}>
                            <div style={{
                                background: 'rgba(255,255,255,0.04)', borderLeft: '10px solid #4ade80',
                                padding: '15px 50px', transform: 'skewX(-15deg)', borderRadius: 6,
                                boxShadow: '15px 15px 30px rgba(0,0,0,0.3)', zIndex: 2,
                            }}>
                                <div style={{ transform: 'skewX(15deg)' }}>
                                    <p style={{ fontSize: '0.9rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: 6, margin: '0 0 2px' }}>BIB</p>
                                    <h1 style={{
                                        fontSize: 'clamp(6rem,12vw,10rem)', fontWeight: 900, lineHeight: 0.85,
                                        color: '#fff', fontStyle: 'italic', textShadow: '0 4px 10px rgba(0,0,0,0.5)',
                                        fontFamily: "'Exo 2', sans-serif", margin: 0,
                                    }}>{bibNum}</h1>
                                </div>
                            </div>
                            {/* Distance badge — bigger */}
                            <div style={{
                                background: '#ef4444', padding: '10px 34px 10px 48px',
                                transform: 'skewX(-15deg)', borderRadius: 6,
                                marginBottom: 15, marginLeft: -35, zIndex: 1,
                                boxShadow: 'inset 0 0 20px rgba(0,0,0,0.2)',
                                border: '3px solid rgba(255,255,255,0.15)',
                            }}>
                                <div style={{ transform: 'skewX(15deg)' }}>
                                    <span style={{
                                        fontSize: 'clamp(1.8rem,3.5vw,2.5rem)', fontWeight: 900, color: '#fff',
                                        whiteSpace: 'nowrap', fontStyle: 'italic', letterSpacing: 1,
                                    }}>{distance}</span>
                                </div>
                            </div>
                        </div>

                        <div style={{ marginBottom: '4vh' }}>
                            <div style={{ color: '#4ade80', fontWeight: 800, fontSize: '1.2rem', textTransform: 'uppercase', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 10 }}>
                                <i className="fa-solid fa-square-check" style={{ fontSize: 24 }} /> Verified Participant
                                {flag && <span style={{ fontSize: 32 }}>{flag}</span>}
                            </div>
                            <h2 style={{ fontSize: 'clamp(2.5rem,5vw,4rem)', fontWeight: 900, lineHeight: 1.1, color: '#fff', margin: '0 0 5px', textShadow: '0 4px 10px rgba(0,0,0,0.5)' }}>
                                {nameTh || nameEn}
                            </h2>
                            {nameTh && (
                                <h3 style={{ fontSize: 'clamp(1.2rem,2.5vw,1.8rem)', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', margin: 0 }}>{nameEn}</h3>
                            )}
                        </div>

                        {/* Bottom bar — 2 items only (no shirt size) */}
                        <div style={{
                            display: 'flex', alignItems: 'center',
                            background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)',
                            borderRadius: 24, padding: '25px 0', backdropFilter: 'blur(10px)',
                            boxShadow: '0 10px 30px rgba(0,0,0,0.2)',
                        }}>
                            <SplitBarItem label="Gender" value={genderLabel} />
                            <SplitBarItem label="Age Group" value={ageGroupLabel} highlight />
                        </div>
                    </div>

                    <div style={{
                        position: 'absolute', bottom: 0, left: 0, height: 8,
                        background: '#4ade80', width: '100%', animation: 'timer 8s linear forwards', zIndex: 100,
                    }} />
                    <div style={{
                        position: 'absolute', bottom: 20, right: 40, fontSize: 11, fontWeight: 800,
                        color: 'rgba(255,255,255,0.2)', textTransform: 'uppercase', letterSpacing: 4, zIndex: 100,
                    }}>Action Timing System</div>
                </div>
            )}

            <style>{`
                @keyframes fadeIn { from { opacity: 0; transform: scale(0.95); } to { opacity: 1; transform: scale(1); } }
                @keyframes timer { from { width: 100%; } to { width: 0%; } }
                @keyframes pulse { 0%, 100% { transform: scale(1); opacity: 1; } 50% { transform: scale(1.1); opacity: 0.7; } }
                * { font-family: 'Prompt', sans-serif !important; margin: 0; padding: 0; box-sizing: border-box; }
            `}</style>
        </>
    );
}

function BarItem({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
    return (
        <div style={{
            padding: '30px 20px', textAlign: 'center', position: 'relative',
            ...(highlight ? { background: 'rgba(74,222,128,0.1)' } : {}),
        }}>
            <p style={{
                fontSize: '1.2rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: 2,
                marginBottom: 5, color: highlight ? '#4ade80' : '#94a3b8',
            }}>{label}</p>
            <p style={{
                fontSize: highlight ? '4rem' : '3rem', fontWeight: 900, lineHeight: 1,
                color: highlight ? '#4ade80' : '#fff', textTransform: 'uppercase',
                ...(highlight ? { textShadow: '0 0 20px rgba(74,222,128,0.3)' } : {}),
            }}>{value}</p>
        </div>
    );
}

function SplitBarItem({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
    return (
        <div style={{
            flex: 1, textAlign: 'center', position: 'relative',
            ...(highlight ? {
                background: 'rgba(74,222,128,0.06)', borderRadius: 16,
                margin: '0 15px', padding: '15px 0',
                border: '1px solid rgba(74,222,128,0.15)',
            } : {}),
        }}>
            <p style={{
                fontSize: 14, fontWeight: 800, textTransform: 'uppercase', letterSpacing: 2,
                marginBottom: 8, color: highlight ? '#4ade80' : '#64748b',
            }}>{label}</p>
            <p style={{
                fontSize: highlight ? 'clamp(2.5rem,4.5vw,3.5rem)' : 'clamp(1.8rem,3.5vw,2.5rem)',
                fontWeight: 900, lineHeight: 1, color: highlight ? '#4ade80' : '#fff',
                ...(highlight ? { textShadow: '0 0 20px rgba(74,222,128,0.2)' } : {}),
            }}>{value}</p>
        </div>
    );
}
