'use client';

import { useEffect, useState, useRef } from 'react';
import { toJpeg } from 'html-to-image';
import { useParams, useSearchParams } from 'next/navigation';

interface Runner {
    bib?: string;
    firstName?: string;
    lastName?: string;
    firstNameTh?: string;
    lastNameTh?: string;
    gender?: string;
    category?: string;
    ageGroup?: string;
    medical?: string;
    eventName?: string;
    campaignName?: string;
}

export default function UploadPhotoPage() {
    const params = useParams();
    const runnerId = params.runnerId as string;

    const searchParams = useSearchParams();
    const campaignSlug = searchParams.get('slug');
    const campaignKey = searchParams.get('campaign') || campaignSlug || 'default';
    const [uploadOrientation, setUploadOrientation] = useState<'portrait' | 'landscape'>(searchParams.get('orientation') === 'portrait' ? 'portrait' : 'landscape');
    const exportWidth = uploadOrientation === 'portrait' ? 1080 : 1920;
    const exportHeight = uploadOrientation === 'portrait' ? 1920 : 1080;

    const [runner, setRunner] = useState<Runner | null>(null);
    const [loading, setLoading] = useState(true);
    const [uploading, setUploading] = useState(false);
    const [success, setSuccess] = useState(false);
    const [error, setError] = useState('');
    const [uploadedPhoto, setUploadedPhoto] = useState<string>('');
    const [campaignName, setCampaignName] = useState('');
    const [campaignBgImage, setCampaignBgImage] = useState('');
    const fileInputRef = useRef<HTMLInputElement>(null);
    const cardRef = useRef<HTMLDivElement>(null);
    const wrapperRef = useRef<HTMLDivElement>(null);
    const [cardScale, setCardScale] = useState(0.22);

    const handleDownload = async () => {
        if (!cardRef.current) return;
        const filename = `BIB${runner?.bib || 'photo'}_${runner?.firstNameTh || runner?.firstName || ''}.jpg`;

        try {
            await document.fonts.ready;

            const opts = {
                quality: 0.92,
                width: exportWidth,
                height: exportHeight,
                pixelRatio: 1,
                cacheBust: true,
                style: { transform: 'none', position: 'relative' as const },
            };

            // First call warms the image cache (fixes base64 images not rendering)
            await toJpeg(cardRef.current, opts).catch(() => {});
            // Second call produces the correct output
            const dataUrl = await toJpeg(cardRef.current, opts);

            const res = await fetch(dataUrl);
            const blob = await res.blob();
            const file = new File([blob], filename, { type: 'image/jpeg' });
            if (typeof navigator !== 'undefined' && navigator.share && navigator.canShare?.({ files: [file] })) {
                try { await navigator.share({ files: [file] }); return; } catch { /* fall through */ }
            }
            const a = document.createElement('a');
            a.href = dataUrl; a.download = filename;
            document.body.appendChild(a); a.click();
            document.body.removeChild(a);
        } catch (err) {
            console.error('Download error', err);
        }
    };

    // Fetch runner info
    useEffect(() => {
        if (!runnerId) return;
        (async () => {
            try {
                const res = await fetch(`/api/runners/${runnerId}`);
                if (res.ok) {
                    const data = await res.json();
                    setRunner(data);
                } else {
                    setError('ไม่พบนักวิ่ง — Runner not found');
                }
            } catch {
                setError('เกิดข้อผิดพลาด — Connection error');
            } finally {
                setLoading(false);
            }
        })();
    }, [runnerId]);

    useEffect(() => {
        if (!campaignSlug) return;
        (async () => {
            try {
                const res = await fetch(`/api/campaigns/${encodeURIComponent(campaignSlug)}?full=true`, { cache: 'no-store' });
                if (res.ok) {
                    const data = await res.json();
                    if (data.name) setCampaignName(data.name);
                    if (data.scanningBgImage) setCampaignBgImage(data.scanningBgImage);
                }
            } catch { /* ignore */ }
        })();
    }, [campaignSlug]);

    useEffect(() => {
        if (!campaignKey) return;
        const syncOrientation = async () => {
            try {
                const res = await fetch(`/api/scanning-orientation?campaign=${encodeURIComponent(campaignKey)}`, { cache: 'no-store' });
                if (!res.ok) return;
                const data = await res.json();
                if (data.orientation === 'portrait' || data.orientation === 'landscape') {
                    setUploadOrientation(data.orientation);
                }
            } catch { /* ignore */ }
        };
        syncOrientation();
        const interval = setInterval(syncOrientation, 1000);
        return () => clearInterval(interval);
    }, [campaignKey]);

    useEffect(() => {
        if (!success) return;
        const compute = () => { if (wrapperRef.current) setCardScale(wrapperRef.current.offsetWidth / exportWidth); };
        compute();
        window.addEventListener('resize', compute);
        return () => window.removeEventListener('resize', compute);
    }, [success, exportWidth]);

    const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        setUploading(true);
        setError('');

        try {
            // Resize image to max 800px and compress
            const base64 = await resizeAndCompress(file, 800, 0.8);

            // Upload to backend
            const res = await fetch(`/api/runners/${runnerId}/photo`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ photo: base64 }),
            });

            if (res.ok) {
                setUploadedPhoto(base64);
                setSuccess(true);
            } else {
                setError('อัปโหลดไม่สำเร็จ — Upload failed');
            }
        } catch {
            setError('เกิดข้อผิดพลาด — Upload error');
        } finally {
            setUploading(false);
        }
    };

    return (
        <>
            <link href="https://fonts.googleapis.com/css2?family=Exo+2:ital,wght@0,700;0,900;1,700;1,900&family=Prompt:wght@400;600;700;800;900&display=swap" rel="stylesheet" />
            <meta name="viewport" content="width=device-width, initial-scale=1" />

            <div style={{
                minHeight: '100vh', display: 'flex', flexDirection: 'column',
                alignItems: 'center', justifyContent: 'center',
                background: 'linear-gradient(135deg, #020617 0%, #0f172a 50%, #1e293b 100%)',
                fontFamily: "'Prompt', sans-serif", padding: 20,
            }}>
                {loading ? (
                    <div style={{ textAlign: 'center' }}>
                        <div style={{
                            width: 50, height: 50,
                            border: '4px solid #334155', borderTopColor: '#4ade80',
                            borderRadius: '50%', animation: 'spin 0.8s linear infinite',
                            margin: '0 auto 20px',
                        }} />
                        <p style={{ color: '#94a3b8', fontSize: 16 }}>กำลังโหลด...</p>
                    </div>
                ) : error && !runner ? (
                    <div style={{ textAlign: 'center' }}>
                        <div style={{ fontSize: 60, marginBottom: 16 }}>❌</div>
                        <p style={{ color: '#ef4444', fontSize: 20, fontWeight: 800 }}>{error}</p>
                    </div>
                ) : success ? (() => {
                    const _eventName = campaignName || runner?.eventName || runner?.campaignName || 'RFID Running Event';
                    const _gl = runner?.gender === 'M' ? 'Male' : runner?.gender === 'F' ? 'Female' : runner?.gender || '-';
                    const _ag = runner?.ageGroup || '-';
                    const _nth = `${runner?.firstNameTh || ''} ${runner?.lastNameTh || ''}`.trim();
                    const _nen = `${runner?.firstName || ''} ${runner?.lastName || ''}`.trim();
                    const _nameMain = _nen || _nth;
                    const _nameSub = _nth && _nen ? _nth : '';
                    const _dist = runner?.category || '';
                    const _bib = String(runner?.bib || '-');
                    const _medical = runner?.medical || '';
                    const _hasMedical = !!(_medical && _medical.trim() !== '' && _medical !== 'ไม่มี');
                    const _isPortrait = uploadOrientation === 'portrait';
                    const _cardWidth = _isPortrait ? 950 : 1728;
                    const _cardHeight = _isPortrait ? 1805 : 972;
                    const _photoSize = _isPortrait ? 630 : 440;
                    return (
                        <div ref={wrapperRef} style={{ width: '100%', maxWidth: _isPortrait ? 360 : 420, animation: 'fadeIn 0.5s ease-out' }}>
                            {/* Scaled 1920×1080 card — exact same layout as scanning page */}
                            <div style={{ position: 'relative', width: '100%', height: Math.round(exportHeight * cardScale), overflow: 'hidden', borderRadius: 14, marginBottom: 14, boxShadow: '0 15px 40px rgba(0,0,0,0.5)', border: '1px solid rgba(74,222,128,0.2)' }}>
                                <div ref={cardRef} style={{ position: 'absolute', top: 0, left: 0, width: exportWidth, height: exportHeight, transformOrigin: '0 0', transform: `scale(${cardScale})` }}>
                                    <div style={{ width: exportWidth, height: exportHeight, background: '#ffffff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: "'Prompt', sans-serif", position: 'relative', overflow: 'hidden' }}>
                                        <div style={{ width: _cardWidth, height: _cardHeight, background: '#ffffff', color: '#0f172a', display: 'flex', flexDirection: 'column', padding: _isPortrait ? '66px 58px 44px' : '66px 88px 54px', position: 'relative', overflow: 'hidden' }}>
                                            <div style={{ position: 'absolute', top: 0, left: 0, height: 4, width: '100%', background: '#16a34a', zIndex: 2 }} />
                                            {campaignBgImage && <div style={{ position: 'absolute', inset: 0, background: `url(${campaignBgImage}) center/cover no-repeat`, opacity: 0.18, zIndex: 0 }} />}
                                            <div style={{ position: 'relative', zIndex: 1, display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
                                            <div style={{ textAlign: 'center', borderBottom: '1px solid #cbd5e1', paddingBottom: _isPortrait ? 26 : 26, marginBottom: _isPortrait ? 30 : (_hasMedical ? 20 : 38), flexShrink: 0 }}>
                                                <div style={{ fontSize: _isPortrait ? 46 : 46, fontWeight: 800, letterSpacing: 1, color: '#0f172a', margin: 0, lineHeight: 1.15 }}>{_eventName}</div>
                                            </div>
                                            {_hasMedical && (
                                                <div style={{ display: 'flex', alignItems: 'center', gap: 16, background: '#fef2f2', border: '2px solid #fca5a5', borderRadius: 6, padding: '14px 24px', marginBottom: 26, flexShrink: 0 }}>
                                                    <div style={{ fontSize: 30, color: '#dc2626', flexShrink: 0 }}>⚠</div>
                                                    <div>
                                                        <p style={{ fontSize: 15, fontWeight: 700, color: '#991b1b', textTransform: 'uppercase', letterSpacing: 2, margin: '0 0 2px' }}>⚕ Medical Alert — แจ้งเจ้าหน้าที่</p>
                                                        <p style={{ fontSize: 22, fontWeight: 600, color: '#dc2626', margin: 0 }}>{_medical}</p>
                                                    </div>
                                                </div>
                                            )}
                                            <div style={{ flex: 1, display: 'flex', flexDirection: _isPortrait ? 'column' : 'row', alignItems: 'center', justifyContent: _isPortrait ? 'flex-start' : 'center', gap: _isPortrait ? 38 : 90, minHeight: 0 }}>
                                                <div style={{ position: 'relative', flexShrink: 0 }}>
                                                    <div style={{ width: _photoSize, height: _photoSize, borderRadius: 4, border: '1px solid #cbd5e1', padding: 8, background: '#ffffff', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)' }}>
                                                        <div style={{ width: '100%', height: '100%', borderRadius: 2, overflow: 'hidden', background: '#f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                                            <img src={uploadedPhoto} alt="runner" style={{ width: '100%', height: '100%', objectFit: 'cover', filter: 'grayscale(20%)' }} />
                                                        </div>
                                                    </div>
                                                </div>
                                                <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: _isPortrait ? 'center' : 'flex-start', textAlign: _isPortrait ? 'center' : 'left', maxWidth: _isPortrait ? '100%' : '58%' }}>
                                                    <p style={{ color: '#16a34a', fontWeight: 600, fontSize: _isPortrait ? 16 : 18, textTransform: 'uppercase', margin: _isPortrait ? '0 0 18px' : '0 0 14px', display: 'flex', alignItems: 'center', gap: 8, letterSpacing: 2 }}>✓ ยืนยันข้อมูล</p>
                                                    <h2 style={{ fontSize: _isPortrait ? 88 : 82, fontWeight: 800, lineHeight: 1.1, margin: '0 0 8px', color: '#0f172a', maxWidth: _isPortrait ? 834 : 1000, whiteSpace: 'nowrap', overflow: 'hidden' }}>{_nameMain}</h2>
                                                    {_nameSub && <h3 style={{ fontSize: _isPortrait ? 34 : 30, fontWeight: 400, color: '#64748b', margin: _isPortrait ? '0 0 34px' : '0 0 32px', letterSpacing: 2, maxWidth: _isPortrait ? 834 : 1000, whiteSpace: 'nowrap', overflow: 'hidden' }}>{_nameSub}</h3>}
                                                    <div style={{ display: 'flex', alignItems: 'stretch', gap: _isPortrait ? 24 : 18, borderLeft: _isPortrait ? 'none' : '4px solid #16a34a', borderTop: _isPortrait ? '4px solid #16a34a' : 'none', paddingLeft: _isPortrait ? 0 : 18, paddingTop: _isPortrait ? 26 : 0 }}>
                                                        <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
                                                            <span style={{ fontSize: 18, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 3 }}>BIB</span>
                                                            <span style={{ fontSize: _isPortrait ? 156 : 124, fontWeight: 700, color: '#0f172a', lineHeight: 0.9 }}>{_bib}</span>
                                                        </div>
                                                        <div style={{ width: 2, alignSelf: 'stretch', background: '#cbd5e1', margin: '8px 4px' }} />
                                                        {_dist && <span style={{ color: '#ef4444', fontSize: _isPortrait ? 62 : 56, fontWeight: 800, textTransform: 'uppercase', letterSpacing: 2, alignSelf: 'center' }}>{_dist}</span>}
                                                    </div>
                                                </div>
                                            </div>
                                            <div style={{ marginTop: 'auto', borderTop: '1px solid #cbd5e1', paddingTop: _isPortrait ? 28 : 24, flexShrink: 0 }}>
                                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 0 }}>
                                                    <div style={{ textAlign: _isPortrait ? 'center' : 'left', padding: _isPortrait ? '18px 20px' : '10px 18px 10px 0', background: _isPortrait ? '#ffffff' : 'transparent' }}>
                                                        <p style={{ fontSize: _isPortrait ? 16 : 18, fontWeight: 600, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 2, margin: '0 0 6px' }}>Gender</p>
                                                        <p style={{ fontSize: _isPortrait ? 54 : 46, fontWeight: 800, color: '#0f172a', lineHeight: 1, margin: 0 }}>{_gl}</p>
                                                    </div>
                                                    <div style={{ textAlign: _isPortrait ? 'center' : 'left', padding: _isPortrait ? '18px 20px' : '10px 18px', borderLeft: _isPortrait ? 'none' : '1px solid #e2e8f0', background: _isPortrait ? '#ffffff' : 'transparent' }}>
                                                        <p style={{ fontSize: _isPortrait ? 16 : 18, fontWeight: 600, color: '#16a34a', textTransform: 'uppercase', letterSpacing: 2, margin: '0 0 6px' }}>Age Group</p>
                                                        <p style={{ fontSize: _isPortrait ? 62 : 52, fontWeight: 800, color: '#16a34a', lineHeight: 1, margin: 0 }}>{_ag}</p>
                                                    </div>
                                                </div>
                                            </div>
                                            <div style={{ position: 'absolute', bottom: 18, right: 28, fontSize: 12, color: '#cbd5e1', fontWeight: 700, letterSpacing: 4, textTransform: 'uppercase', textAlign: 'right', lineHeight: 1.4 }}>
                                                Powered by<br />
                                                <span style={{ color: '#94a3b8' }}>ACTION TIMING</span>
                                            </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                            <button onClick={handleDownload} style={{ width: '100%', padding: '14px 20px', borderRadius: 14, background: 'linear-gradient(135deg, #3b82f6, #2563eb)', color: '#fff', fontSize: 17, fontWeight: 800, border: 'none', cursor: 'pointer', boxShadow: '0 8px 24px rgba(59,130,246,0.35)', marginBottom: 10 }}>💾 ดาวน์โหลดรูป</button>
                            <button onClick={() => { setSuccess(false); setUploadedPhoto(''); if (fileInputRef.current) fileInputRef.current.value = ''; }} style={{ width: '100%', padding: '12px 20px', borderRadius: 14, background: 'rgba(255,255,255,0.08)', color: '#94a3b8', fontSize: 14, fontWeight: 700, border: '1px solid rgba(255,255,255,0.12)', cursor: 'pointer' }}>📸 อัปโหลดรูปใหม่</button>
                        </div>
                    );
                })() : (
                    <div style={{
                        width: '100%', maxWidth: 400, textAlign: 'center',
                        animation: 'fadeIn 0.5s ease-out',
                    }}>
                        {/* Runner info card */}
                        <div style={{
                            background: 'rgba(255,255,255,0.05)', borderRadius: 20,
                            padding: '24px 20px', marginBottom: 24,
                            border: '1px solid rgba(255,255,255,0.1)',
                        }}>
                            <div style={{
                                display: 'inline-block', background: '#ef4444',
                                padding: '6px 20px', borderRadius: 10,
                                fontSize: 14, fontWeight: 800, color: '#fff', marginBottom: 12,
                            }}>
                                {runner?.category || '-'}
                            </div>
                            <div style={{
                                fontSize: 14, fontWeight: 700, color: '#64748b',
                                textTransform: 'uppercase', letterSpacing: 3, marginBottom: 4,
                            }}>BIB</div>
                            <div style={{
                                fontSize: 48, fontWeight: 900, color: '#fff',
                                lineHeight: 1, marginBottom: 12,
                            }}>{runner?.bib || '-'}</div>
                            <p style={{ fontSize: 18, fontWeight: 700, color: '#fff', marginBottom: 4 }}>
                                {runner?.firstNameTh || runner?.firstName} {runner?.lastNameTh || runner?.lastName}
                            </p>
                            {runner?.firstNameTh && (
                                <p style={{ fontSize: 14, color: '#94a3b8' }}>
                                    {runner.firstName} {runner.lastName}
                                </p>
                            )}
                        </div>

                        {/* Upload section */}
                        <input
                            ref={fileInputRef}
                            type="file"
                            accept="image/*"
                            style={{ display: 'none' }}
                            onChange={handleFileSelect}
                        />

                        {error && (
                            <p style={{ color: '#ef4444', fontSize: 14, marginBottom: 12 }}>{error}</p>
                        )}

                        <button
                            onClick={() => fileInputRef.current?.click()}
                            disabled={uploading}
                            style={{
                                width: '100%', padding: '16px 20px', borderRadius: 16,
                                background: uploading ? '#334155' : 'linear-gradient(135deg, #4ade80, #22c55e)',
                                color: uploading ? '#94a3b8' : '#020617',
                                fontSize: 18, fontWeight: 900, border: 'none',
                                cursor: uploading ? 'not-allowed' : 'pointer',
                                boxShadow: uploading ? 'none' : '0 10px 30px rgba(74,222,128,0.3)',
                                transition: 'all 0.3s ease',
                            }}
                        >
                            {uploading ? (
                                <>⏳ กำลังอัปโหลด...</>
                            ) : (
                                <>📸 ถ่ายรูป / เลือกรูป</>
                            )}
                        </button>

                        <p style={{ color: '#64748b', fontSize: 12, marginTop: 16 }}>
                            เลือกรูปจากกล้องหรือแกลเลอรี่
                        </p>
                    </div>
                )}
            </div>

            <style>{`
                @keyframes spin { to { transform: rotate(360deg); } }
                @keyframes fadeIn { from { opacity: 0; transform: scale(0.95); } to { opacity: 1; transform: scale(1); } }
                * { font-family: 'Prompt', sans-serif !important; margin: 0; padding: 0; box-sizing: border-box; }
            `}</style>
        </>
    );
}

/** Resize an image file to max dimension and compress to JPEG base64 */
function resizeAndCompress(file: File, maxSize: number, quality: number): Promise<string> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            const img = new Image();
            img.onload = () => {
                const canvas = document.createElement('canvas');
                let w = img.width;
                let h = img.height;
                if (w > maxSize || h > maxSize) {
                    if (w > h) {
                        h = Math.round((h * maxSize) / w);
                        w = maxSize;
                    } else {
                        w = Math.round((w * maxSize) / h);
                        h = maxSize;
                    }
                }
                canvas.width = w;
                canvas.height = h;
                const ctx = canvas.getContext('2d')!;
                ctx.drawImage(img, 0, 0, w, h);
                resolve(canvas.toDataURL('image/jpeg', quality));
            };
            img.onerror = reject;
            img.src = e.target?.result as string;
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
}
