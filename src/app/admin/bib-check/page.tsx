'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import Script from 'next/script';

interface Runner {
    _id: string; bib: string; firstName: string; lastName: string;
    firstNameTh?: string; lastNameTh?: string;
    gender: string; category: string; ageGroup?: string; nationality?: string;
    status: string; chipCode?: string; printingCode?: string; rfidTag?: string;
    netTime?: number; gunTime?: number; overallRank?: number;
    team?: string; teamName?: string; shirtSize?: string; age?: number;
    gunPace?: string; netPace?: string;
}
interface Campaign { _id: string; name: string; }

type TemplateStyle = 'classic' | 'split';

export default function BibCheckPage() {
    const [campaigns, setCampaigns] = useState<Campaign[]>([]);
    const [selectedCampaign, setSelectedCampaign] = useState('');
    const [campaignName, setCampaignName] = useState('');
    const [scanCode, setScanCode] = useState('');
    const [loading, setLoading] = useState(false);
    const [runner, setRunner] = useState<Runner | null>(null);
    const [found, setFound] = useState<boolean | null>(null);
    const [template, setTemplate] = useState<TemplateStyle>('classic');
    const [showSettings, setShowSettings] = useState(true);
    const [animKey, setAnimKey] = useState(0);
    const inputRef = useRef<HTMLInputElement>(null);
    const hiddenInputRef = useRef<HTMLInputElement>(null);

    // Load campaigns
    useEffect(() => {
        fetch('/api/campaigns')
            .then(r => r.json())
            .then(data => {
                const list = Array.isArray(data) ? data : data?.data || [];
                setCampaigns(list);
                if (list.length > 0 && !selectedCampaign) {
                    setSelectedCampaign(list[0]._id);
                    setCampaignName(list[0].name);
                }
            })
            .catch(console.error);
    }, []);

    // Always keep hidden input focused for scanner
    useEffect(() => {
        const keepFocus = () => {
            if (!showSettings && hiddenInputRef.current) {
                hiddenInputRef.current.focus();
            }
        };
        const interval = setInterval(keepFocus, 500);
        document.addEventListener('click', keepFocus);
        return () => { clearInterval(interval); document.removeEventListener('click', keepFocus); };
    }, [showSettings]);

    const formatTime = (ms?: number) => {
        if (!ms || ms <= 0) return '-';
        const totalSec = Math.floor(ms / 1000);
        const h = Math.floor(totalSec / 3600);
        const m = Math.floor((totalSec % 3600) / 60);
        const s = totalSec % 60;
        return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    };

    const handleScan = useCallback(async () => {
        const code = scanCode.trim();
        if (!code || loading) return;
        setLoading(true);
        try {
            const params = new URLSearchParams({ campaignId: selectedCampaign, code });
            const res = await fetch(`/api/runners/lookup?${params.toString()}`);
            const data = await res.json();
            setRunner(data.runner || null);
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
    }, [scanCode, selectedCampaign, loading]);

    // Settings panel (before entering display mode)
    if (showSettings) {
        return (
            <div style={{
                minHeight: '100vh', background: '#0f172a', display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontFamily: "'Prompt', sans-serif",
            }}>
                <div style={{
                    background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)',
                    borderRadius: 24, padding: '48px 48px 40px', width: 500, color: '#fff',
                    backdropFilter: 'blur(20px)', boxShadow: '0 30px 60px rgba(0,0,0,0.4)',
                }}>
                    <div style={{ textAlign: 'center', marginBottom: 32 }}>
                        <div style={{ fontSize: 48, marginBottom: 12 }}>📡</div>
                        <h1 style={{ fontSize: 28, fontWeight: 900, margin: 0 }}>RFID Check-in</h1>
                        <p style={{ color: '#94a3b8', fontSize: 14, marginTop: 6 }}>ตั้งค่าก่อนเริ่มสแกน</p>
                    </div>

                    {/* Campaign */}
                    <label style={{ display: 'block', fontSize: 13, fontWeight: 700, color: '#94a3b8', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 1 }}>
                        กิจกรรม / Campaign
                    </label>
                    <select
                        value={selectedCampaign}
                        onChange={e => {
                            setSelectedCampaign(e.target.value);
                            const c = campaigns.find(c => c._id === e.target.value);
                            setCampaignName(c?.name || '');
                        }}
                        style={{
                            width: '100%', padding: '12px 16px', borderRadius: 10, fontSize: 15,
                            background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.2)',
                            color: '#fff', marginBottom: 24, outline: 'none',
                        }}
                    >
                        {campaigns.map(c => (
                            <option key={c._id} value={c._id} style={{ background: '#1e293b' }}>{c.name}</option>
                        ))}
                    </select>

                    {/* Template */}
                    <label style={{ display: 'block', fontSize: 13, fontWeight: 700, color: '#94a3b8', marginBottom: 10, textTransform: 'uppercase', letterSpacing: 1 }}>
                        Template
                    </label>
                    <div style={{ display: 'flex', gap: 12, marginBottom: 32 }}>
                        {[
                            { key: 'classic' as TemplateStyle, label: 'Classic (Top-Down)', icon: '🎯' },
                            { key: 'split' as TemplateStyle, label: 'Split (Left-Right)', icon: '🖥️' },
                        ].map(t => (
                            <button key={t.key} onClick={() => setTemplate(t.key)}
                                style={{
                                    flex: 1, padding: '16px 12px', borderRadius: 12, cursor: 'pointer',
                                    background: template === t.key ? 'rgba(74,222,128,0.15)' : 'rgba(255,255,255,0.04)',
                                    border: `2px solid ${template === t.key ? '#4ade80' : 'rgba(255,255,255,0.1)'}`,
                                    color: template === t.key ? '#4ade80' : '#94a3b8',
                                    textAlign: 'center', fontSize: 13, fontWeight: 700, transition: 'all 0.2s',
                                }}
                            >
                                <div style={{ fontSize: 28, marginBottom: 6 }}>{t.icon}</div>
                                {t.label}
                            </button>
                        ))}
                    </div>

                    <button
                        onClick={() => setShowSettings(false)}
                        disabled={!selectedCampaign}
                        style={{
                            width: '100%', padding: '14px 0', borderRadius: 12, border: 'none',
                            background: '#4ade80', color: '#0f172a', fontSize: 16, fontWeight: 800,
                            cursor: 'pointer', textTransform: 'uppercase', letterSpacing: 2,
                        }}
                    >
                        เริ่มสแกน / Start Scanning
                    </button>
                </div>
            </div>
        );
    }

    // === FULL SCREEN DISPLAY MODE ===
    const r = runner;
    const nameTh = r ? `${r.firstNameTh || ''} ${r.lastNameTh || ''}`.trim() : '';
    const nameEn = r ? `${r.firstName} ${r.lastName}` : '';
    const distance = r?.category || '-';
    const bibNum = r?.bib || '-';
    const genderLabel = r?.gender === 'M' ? 'Male' : r?.gender === 'F' ? 'Female' : '-';
    const ageGroupLabel = r?.ageGroup || '-';
    const shirtSizeLabel = r?.shirtSize || '-';

    return (
        <>
            <Script src="https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js" strategy="afterInteractive" />
            <link href="https://fonts.googleapis.com/css2?family=Prompt:wght@400;600;700;800;900&family=Exo+2:wght@800;900&display=swap" rel="stylesheet" />
            <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css" />

            {/* Hidden scanner input — always captures keyboard */}
            <input
                ref={hiddenInputRef}
                value={scanCode}
                onChange={e => setScanCode(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') handleScan(); }}
                style={{ position: 'fixed', top: -100, left: -100, opacity: 0 }}
                autoFocus
            />

            {/* Settings gear button */}
            <button onClick={() => setShowSettings(true)} style={{
                position: 'fixed', top: 16, right: 16, zIndex: 100, width: 40, height: 40,
                borderRadius: '50%', border: '1px solid rgba(255,255,255,0.2)',
                background: 'rgba(0,0,0,0.5)', color: '#94a3b8', fontSize: 16, cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                backdropFilter: 'blur(10px)',
            }}>
                <i className="fa-solid fa-gear" />
            </button>

            {/* Loading overlay */}
            {loading && (
                <div style={{
                    position: 'fixed', inset: 0, zIndex: 90, display: 'flex', alignItems: 'center', justifyContent: 'center',
                    background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)',
                }}>
                    <div style={{ color: '#4ade80', fontSize: 24, fontWeight: 800 }}>
                        <i className="fas fa-spinner fa-spin" style={{ marginRight: 12 }} /> กำลังค้นหา...
                    </div>
                </div>
            )}

            {/* NOT FOUND overlay */}
            {found === false && !runner && (
                <div key={`nf-${animKey}`} style={{
                    position: 'fixed', inset: 0, zIndex: 80, display: 'flex', flexDirection: 'column',
                    alignItems: 'center', justifyContent: 'center',
                    background: '#020617', animation: 'fadeIn 0.5s ease-out',
                    fontFamily: "'Prompt', sans-serif",
                }}>
                    <div style={{ fontSize: 80, marginBottom: 24 }}>❌</div>
                    <div style={{ fontSize: 36, fontWeight: 900, color: '#ef4444', marginBottom: 8 }}>ไม่พบนักวิ่ง</div>
                    <div style={{ fontSize: 18, color: '#94a3b8' }}>Runner Not Found — สแกนใหม่เพื่อลองอีกครั้ง</div>
                </div>
            )}

            {/* WAITING STATE */}
            {found === null && (
                <div style={{
                    position: 'fixed', inset: 0, zIndex: 70, display: 'flex', flexDirection: 'column',
                    alignItems: 'center', justifyContent: 'center',
                    background: '#020617', fontFamily: "'Prompt', sans-serif",
                }}>
                    <div style={{ fontSize: 80, marginBottom: 24, animation: 'pulse 2s ease-in-out infinite' }}>📡</div>
                    <div style={{ fontSize: 36, fontWeight: 900, color: '#fff', marginBottom: 8 }}>รอการสแกน</div>
                    <div style={{ fontSize: 18, color: '#94a3b8' }}>Waiting for RFID scan...</div>
                    <div style={{ fontSize: 14, color: '#64748b', marginTop: 20 }}>Campaign: {campaignName}</div>
                </div>
            )}

            {/* === TEMPLATE 1: CLASSIC (Top-Down) === */}
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

                        {/* Middle: Runner Info */}
                        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 60, padding: '20px 0' }}>
                            {/* Profile placeholder with QR */}
                            <div style={{ position: 'relative', flexShrink: 0 }}>
                                <div style={{
                                    width: 300, height: 300, borderRadius: 30,
                                    border: '6px solid #4ade80', overflow: 'hidden',
                                    boxShadow: '0 20px 40px rgba(74,222,128,0.2)',
                                    background: '#0f172a', display: 'flex', alignItems: 'center', justifyContent: 'center',
                                }}>
                                    <div style={{ textAlign: 'center', color: '#4ade80' }}>
                                        <i className="fa-solid fa-running" style={{ fontSize: 80, marginBottom: 12 }} />
                                        <div style={{ fontSize: 14, fontWeight: 700, color: '#94a3b8' }}>BIB {bibNum}</div>
                                    </div>
                                </div>
                                {/* QR corner */}
                                <div style={{
                                    position: 'absolute', bottom: -15, right: -15,
                                    background: '#fff', padding: 10, borderRadius: 16,
                                    border: '4px solid #4ade80', boxShadow: '0 15px 30px rgba(0,0,0,0.5)',
                                    display: 'flex', flexDirection: 'column', alignItems: 'center',
                                }}>
                                    <div style={{ width: 90, height: 90, background: '#f1f5f9', borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                        <i className="fa-solid fa-qrcode" style={{ fontSize: 50, color: '#0f172a' }} />
                                    </div>
                                    <p style={{ color: '#0f172a', fontSize: 10, fontWeight: 900, textTransform: 'uppercase', marginTop: 6 }}>Scan to Upload</p>
                                </div>
                            </div>

                            {/* Name + BIB */}
                            <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                                <div style={{ color: '#4ade80', fontWeight: 800, fontSize: '1.5rem', textTransform: 'uppercase', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 10 }}>
                                    <i className="fa-solid fa-circle-check" /> Verified Runner
                                </div>
                                <h2 style={{ fontSize: 'clamp(3rem,5vw,5rem)', fontWeight: 900, lineHeight: 1, marginBottom: 5, color: '#fff', margin: '0 0 5px' }}>
                                    {nameTh || nameEn}
                                </h2>
                                {nameTh && (
                                    <h3 style={{ fontSize: 'clamp(1.5rem,2.5vw,2rem)', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', margin: '0 0 30px' }}>
                                        {nameEn}
                                    </h3>
                                )}
                                <div style={{ display: 'flex', alignItems: 'center', gap: 20, marginTop: nameTh ? 0 : 25 }}>
                                    <div style={{
                                        background: '#ef4444', color: '#fff', padding: '10px 30px', borderRadius: 15,
                                        fontSize: '2.5rem', fontWeight: 900, boxShadow: '0 10px 20px rgba(239,68,68,0.3)',
                                    }}>
                                        {distance}
                                    </div>
                                    <div style={{
                                        fontSize: 'clamp(5rem,9vw,8rem)', fontWeight: 900, color: '#fff',
                                        fontStyle: 'italic', lineHeight: 0.85, textShadow: '0 5px 15px rgba(0,0,0,0.5)',
                                        fontFamily: "'Exo 2', sans-serif",
                                    }}>
                                        BIB {bibNum}
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Bottom: Info bar */}
                        <div style={{ marginTop: 40 }}>
                            <div style={{
                                display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)',
                                background: 'rgba(255,255,255,0.05)', borderRadius: 30,
                                overflow: 'hidden', border: '1px solid rgba(255,255,255,0.1)',
                            }}>
                                <InfoItem label="Gender" value={genderLabel} />
                                <InfoItem label="Age Group" value={ageGroupLabel} />
                                <InfoItem label="Shirt Size" value={shirtSizeLabel} highlight />
                            </div>
                        </div>

                        {/* Progress bar */}
                        <div style={{
                            position: 'absolute', bottom: 0, left: 0, height: 10,
                            background: '#4ade80', borderRadius: '0 0 40px 40px',
                            animation: 'timer 8s linear forwards',
                        }} />
                    </div>
                </div>
            )}

            {/* === TEMPLATE 2: SPLIT (Left-Right) === */}
            {found && runner && template === 'split' && (
                <div key={`s-${animKey}`} style={{
                    position: 'fixed', inset: 0, zIndex: 60,
                    background: 'linear-gradient(135deg, #020617 0%, #0f172a 100%)',
                    display: 'flex', flexDirection: 'row',
                    fontFamily: "'Prompt', sans-serif", animation: 'fadeIn 0.8s ease-out',
                }}>
                    {/* Left: Runner visual */}
                    <div style={{ width: '45%', height: '100%', position: 'relative', overflow: 'hidden', background: '#000' }}>
                        <div style={{
                            width: '100%', height: '100%',
                            background: 'linear-gradient(135deg, #1e293b 0%, #0f172a 50%, #020617 100%)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                        }}>
                            <div style={{ textAlign: 'center', color: '#4ade80' }}>
                                <i className="fa-solid fa-person-running" style={{ fontSize: 160, marginBottom: 20 }} />
                                <div style={{ fontSize: 28, fontWeight: 900, color: '#fff' }}>BIB {bibNum}</div>
                                <div style={{ fontSize: 16, color: '#94a3b8', marginTop: 8 }}>{distance}</div>
                            </div>
                        </div>
                        {/* Gradient overlay */}
                        <div style={{
                            position: 'absolute', inset: 0,
                            background: 'linear-gradient(to right, rgba(2,6,23,0) 70%, rgba(2,6,23,1) 100%)',
                        }} />
                        {/* QR */}
                        <div style={{
                            position: 'absolute', bottom: 40, left: 40, zIndex: 10,
                            background: '#fff', padding: 12, borderRadius: 16, width: 150,
                            display: 'flex', flexDirection: 'column', alignItems: 'center',
                            border: '4px solid #4ade80', boxShadow: '0 15px 30px rgba(0,0,0,0.5)',
                        }}>
                            <div style={{ width: 120, height: 120, background: '#f1f5f9', borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                <i className="fa-solid fa-qrcode" style={{ fontSize: 70, color: '#0f172a' }} />
                            </div>
                            <p style={{ color: '#0f172a', fontSize: 10, fontWeight: 900, textTransform: 'uppercase', marginTop: 8, textAlign: 'center' }}>
                                Scan to upload<br />your photo
                            </p>
                        </div>
                    </div>

                    {/* Right: Data */}
                    <div style={{ width: '55%', display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: '5vh 6vw', zIndex: 5 }}>
                        {/* Event Header */}
                        <div style={{ marginBottom: '4vh', borderLeft: '6px solid #4ade80', paddingLeft: 20 }}>
                            <h2 style={{ fontSize: 'clamp(1.5rem,3vw,2.2rem)', fontWeight: 900, textTransform: 'uppercase', lineHeight: 1.1, color: '#fff', margin: 0 }}>
                                {campaignName}
                            </h2>
                            <p style={{ fontSize: 'clamp(0.9rem,1.5vw,1.2rem)', fontWeight: 700, color: '#4ade80', textTransform: 'uppercase', letterSpacing: 2, marginTop: 4 }}>
                                RFID Check-in • Action Timing
                            </p>
                        </div>

                        {/* BIB + Distance skewed boxes */}
                        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 10, marginBottom: '5vh' }}>
                            <div style={{
                                background: 'rgba(255,255,255,0.04)', borderLeft: '10px solid #4ade80',
                                padding: '15px 50px', transform: 'skewX(-15deg)', borderRadius: 6,
                                boxShadow: '15px 15px 30px rgba(0,0,0,0.3)', zIndex: 2,
                            }}>
                                <div style={{ transform: 'skewX(15deg)' }}>
                                    <p style={{ fontSize: '1.1rem', fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 6, margin: '0 0 2px' }}>BIB Number</p>
                                    <h1 style={{
                                        fontSize: 'clamp(6rem,12vw,10rem)', fontWeight: 900, lineHeight: 0.85,
                                        color: '#fff', fontStyle: 'italic', textShadow: '0 4px 10px rgba(0,0,0,0.5)',
                                        fontFamily: "'Exo 2', sans-serif", margin: 0,
                                    }}>
                                        {bibNum}
                                    </h1>
                                </div>
                            </div>
                            <div style={{
                                background: '#ef4444', padding: '8px 30px 8px 45px',
                                transform: 'skewX(-15deg)', borderRadius: 6,
                                marginBottom: 15, marginLeft: -35, zIndex: 1,
                                boxShadow: 'inset 0 0 20px rgba(0,0,0,0.2)',
                            }}>
                                <div style={{ transform: 'skewX(15deg)' }}>
                                    <span style={{
                                        fontSize: 'clamp(1.5rem,3vw,2.2rem)', fontWeight: 900, color: '#fff',
                                        whiteSpace: 'nowrap', fontStyle: 'italic', letterSpacing: 1,
                                    }}>
                                        {distance}
                                    </span>
                                </div>
                            </div>
                        </div>

                        {/* Runner name section */}
                        <div style={{ marginBottom: '4vh' }}>
                            <div style={{ color: '#4ade80', fontWeight: 800, fontSize: '1.2rem', textTransform: 'uppercase', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 10 }}>
                                <i className="fa-solid fa-square-check" style={{ fontSize: 24 }} /> Verified Participant
                            </div>
                            <h2 style={{ fontSize: 'clamp(2.5rem,5vw,4rem)', fontWeight: 900, lineHeight: 1.1, color: '#fff', margin: '0 0 5px', textShadow: '0 4px 10px rgba(0,0,0,0.5)' }}>
                                {nameTh || nameEn}
                            </h2>
                            {nameTh && (
                                <h3 style={{ fontSize: 'clamp(1.2rem,2.5vw,1.8rem)', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', margin: 0 }}>
                                    {nameEn}
                                </h3>
                            )}
                        </div>

                        {/* Info bar */}
                        <div style={{
                            display: 'flex', alignItems: 'center',
                            background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)',
                            borderRadius: 24, padding: '25px 0', backdropFilter: 'blur(10px)',
                            boxShadow: '0 10px 30px rgba(0,0,0,0.2)',
                        }}>
                            <SplitInfoItem label="Gender" value={genderLabel} />
                            <SplitInfoItem label="Age Group" value={ageGroupLabel} />
                            <SplitInfoItem label="Shirt Size" value={shirtSizeLabel} highlight />
                        </div>
                    </div>

                    {/* Progress */}
                    <div style={{
                        position: 'absolute', bottom: 0, left: 0, height: 8,
                        background: '#4ade80', width: '100%', animation: 'timer 8s linear forwards', zIndex: 100,
                    }} />
                    <div style={{
                        position: 'absolute', bottom: 20, right: 40, fontSize: 11, fontWeight: 800,
                        color: 'rgba(255,255,255,0.2)', textTransform: 'uppercase', letterSpacing: 4, zIndex: 100,
                    }}>
                        Action Timing System
                    </div>
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

function InfoItem({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
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
                color: highlight ? '#4ade80' : '#fff',
                textTransform: 'uppercase',
                ...(highlight ? { textShadow: '0 0 20px rgba(74,222,128,0.3)' } : {}),
            }}>{value}</p>
        </div>
    );
}

function SplitInfoItem({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
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
