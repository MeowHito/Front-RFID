'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import { QRCodeCanvas } from 'qrcode.react';

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

export default function BibLinkPage() {
    const { slug } = useParams<{ slug: string }>();
    const router = useRouter();

    const [campaign, setCampaign] = useState<Campaign | null>(null);
    const [loadingCampaign, setLoadingCampaign] = useState(true);
    const [campaignError, setCampaignError] = useState('');

    const [bib, setBib] = useState('');
    const [searching, setSearching] = useState(false);
    const [error, setError] = useState('');
    const [runner, setRunner] = useState<Runner | null>(null);
    const [copied, setCopied] = useState(false);

    const [origin, setOrigin] = useState('');
    const qrWrapRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (typeof window !== 'undefined') setOrigin(window.location.origin);
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

    const handleSearch = useCallback(async (e?: React.FormEvent) => {
        if (e) e.preventDefault();
        const term = bib.trim();
        if (!term || !campaign?._id) return;
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
    }, [bib, campaign]);

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
        setBib('');
        setError('');
        setCopied(false);
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
                    <h1 style={{ fontSize: 24, fontWeight: 800, margin: 0, color: '#0f172a', letterSpacing: 0.2 }}>ค้นหานักกีฬาด้วยเลข BIB</h1>
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

                {/* Result card */}
                {runner && (
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
