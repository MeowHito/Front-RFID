'use client';

import { useEffect, useState, useRef } from 'react';
import { toJpeg } from 'html-to-image';
import { useParams, useSearchParams } from 'next/navigation';

export default function UploadPhotoPage() {
    const params = useParams();
    const runnerId = params.runnerId as string;

    const searchParams = useSearchParams();
    const campaignSlug = searchParams.get('slug');

    const [runner, setRunner] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [uploading, setUploading] = useState(false);
    const [success, setSuccess] = useState(false);
    const [error, setError] = useState('');
    const [uploadedPhoto, setUploadedPhoto] = useState<string>('');
    const [template, setTemplate] = useState<'classic' | 'split'>('classic');
    const [campaignName, setCampaignName] = useState('');
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
                width: 1920,
                height: 1080,
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
                const res = await fetch(`/api/campaigns/${encodeURIComponent(campaignSlug)}`);
                if (res.ok) {
                    const data = await res.json();
                    if (data.scanningTemplate === 'split') setTemplate('split');
                    if (data.name) setCampaignName(data.name);
                }
            } catch { /* ignore */ }
        })();
    }, [campaignSlug]);

    useEffect(() => {
        if (!success) return;
        const compute = () => { if (wrapperRef.current) setCardScale(wrapperRef.current.offsetWidth / 1920); };
        compute();
        window.addEventListener('resize', compute);
        return () => window.removeEventListener('resize', compute);
    }, [success]);

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
                    const _gl = runner?.gender === 'M' ? 'Male' : runner?.gender === 'F' ? 'Female' : runner?.gender || '-';
                    const _ag = runner?.ageGroup || '-';
                    const _nth = runner?.firstNameTh ? `${runner.firstNameTh} ${runner.lastNameTh || ''}`.trim() : `${runner?.firstName || ''} ${runner?.lastName || ''}`.trim();
                    const _nen = runner?.firstNameTh ? `${runner.firstName || ''} ${runner.lastName || ''}`.trim().toUpperCase() : '';
                    const _dist = runner?.category || '';
                    const _bib = String(runner?.bib || '-');
                    return (
                        <div ref={wrapperRef} style={{ width: '100%', maxWidth: 420, animation: 'fadeIn 0.5s ease-out' }}>
                            {/* Scaled 1920×1080 card — exact same layout as scanning page */}
                            <div style={{ position: 'relative', width: '100%', height: Math.round(1080 * cardScale), overflow: 'hidden', borderRadius: 14, marginBottom: 14, boxShadow: '0 15px 40px rgba(0,0,0,0.5)', border: '1px solid rgba(74,222,128,0.2)' }}>
                                <div ref={cardRef} style={{ position: 'absolute', top: 0, left: 0, width: 1920, height: 1080, transformOrigin: '0 0', transform: `scale(${cardScale})` }}>
                                    {template === 'classic' ? (
                                        /* ===== CLASSIC 1920×1080 ===== */
                                        <div style={{ width: 1920, height: 1080, background: 'radial-gradient(circle at center, #1e293b 0%, #020617 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: "'Prompt', sans-serif", position: 'relative' }}>
                                            <div style={{ width: 1824, height: 1026, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 40, display: 'flex', flexDirection: 'column', padding: '40px 60px', boxShadow: '0 30px 60px rgba(0,0,0,0.5)', backdropFilter: 'blur(20px)', position: 'relative', overflow: 'hidden' }}>
                                                {/* Header */}
                                                <div style={{ textAlign: 'center', borderBottom: '2px solid rgba(255,255,255,0.1)', paddingBottom: 20, marginBottom: 30 }}>
                                                    <div style={{ fontSize: 48, fontWeight: 900, textTransform: 'uppercase', letterSpacing: 2, color: '#fff', margin: 0 }}>{campaignName}</div>
                                                    <div style={{ fontSize: 24, fontWeight: 700, color: '#4ade80', textTransform: 'uppercase', letterSpacing: 4, marginTop: 4 }}>RFID Check-in • Action Timing</div>
                                                </div>
                                                {/* Middle */}
                                                <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 50, padding: '20px 0' }}>
                                                    <div style={{ position: 'relative', flexShrink: 0, marginRight: 10 }}>
                                                        <div style={{ width: 340, height: 340, borderRadius: 30, border: '6px solid #4ade80', overflow: 'hidden', boxShadow: '0 20px 40px rgba(74,222,128,0.2)', background: '#0f172a', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                                            <img src={uploadedPhoto} alt="runner" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                                        </div>
                                                        <div style={{ position: 'absolute', bottom: -10, right: -10, background: '#fff', padding: 6, borderRadius: 12, border: '3px solid #4ade80', boxShadow: '0 10px 20px rgba(0,0,0,0.4)', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                                                            <div style={{ width: 55, height: 45, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                                                <span style={{ fontSize: 28, fontWeight: 900, color: '#0f172a', fontFamily: "'Exo 2', sans-serif", fontStyle: 'italic' }}>{_bib}</span>
                                                            </div>
                                                            <p style={{ color: '#64748b', fontSize: 8, fontWeight: 800, textTransform: 'uppercase', marginTop: 2 }}>BIB</p>
                                                        </div>
                                                    </div>
                                                    <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                                                        <div style={{ color: '#4ade80', fontWeight: 800, fontSize: 24, textTransform: 'uppercase', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 10 }}>
                                                            <span>✅</span> Verified Runner
                                                        </div>
                                                        <div style={{ fontSize: 80, fontWeight: 900, lineHeight: 1, margin: '0 0 5px', color: '#fff' }}>{_nth}</div>
                                                        {_nen && <div style={{ fontSize: 32, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', margin: '0 0 30px' }}>{_nen}</div>}
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: 20, marginTop: _nen ? 0 : 25 }}>
                                                            {_dist && <div style={{ background: '#ef4444', color: '#fff', padding: '14px 36px', borderRadius: 18, fontSize: 45, fontWeight: 900, boxShadow: '0 10px 25px rgba(239,68,68,0.4)', border: '3px solid rgba(255,255,255,0.2)' }}>{_dist}</div>}
                                                            <div>
                                                                <div style={{ fontSize: 16, fontWeight: 700, color: '#64748b', letterSpacing: 3, textTransform: 'uppercase' }}>BIB</div>
                                                                <div style={{ fontSize: 128, fontWeight: 900, color: '#fff', fontStyle: 'italic', lineHeight: 0.85, textShadow: '0 5px 15px rgba(0,0,0,0.5)', fontFamily: "'Exo 2', sans-serif" }}>{_bib}</div>
                                                            </div>
                                                        </div>
                                                    </div>
                                                </div>
                                                {/* Bottom bar */}
                                                <div style={{ marginTop: 40 }}>
                                                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', background: 'rgba(255,255,255,0.05)', borderRadius: 30, overflow: 'hidden', border: '1px solid rgba(255,255,255,0.1)' }}>
                                                        <div style={{ padding: '30px 20px', textAlign: 'center' }}>
                                                            <p style={{ fontSize: 19, fontWeight: 800, textTransform: 'uppercase', letterSpacing: 2, marginBottom: 5, color: '#94a3b8' }}>Gender</p>
                                                            <p style={{ fontSize: 48, fontWeight: 900, lineHeight: 1, color: '#fff', textTransform: 'uppercase' }}>{_gl}</p>
                                                        </div>
                                                        <div style={{ padding: '30px 20px', textAlign: 'center', background: 'rgba(74,222,128,0.1)' }}>
                                                            <p style={{ fontSize: 19, fontWeight: 800, textTransform: 'uppercase', letterSpacing: 2, marginBottom: 5, color: '#4ade80' }}>Age Group</p>
                                                            <p style={{ fontSize: 64, fontWeight: 900, lineHeight: 1, color: '#4ade80', textShadow: '0 0 20px rgba(74,222,128,0.3)' }}>{_ag}</p>
                                                        </div>
                                                    </div>
                                                </div>
                                                <div style={{ position: 'absolute', bottom: 0, left: 0, height: 10, background: '#4ade80', borderRadius: '0 0 40px 40px', width: '100%' }} />
                                            </div>
                                        </div>
                                    ) : (
                                        /* ===== SPLIT 1920×1080 ===== */
                                        <div style={{ width: 1920, height: 1080, background: 'linear-gradient(135deg, #020617 0%, #0f172a 100%)', display: 'flex', flexDirection: 'row', fontFamily: "'Prompt', sans-serif", position: 'relative', overflow: 'hidden' }}>
                                            {/* Left — photo */}
                                            <div style={{ width: '45%', height: '100%', position: 'relative', overflow: 'hidden', background: '#000' }}>
                                                <div style={{ width: '100%', height: '100%', background: 'linear-gradient(135deg, #1e293b 0%, #0f172a 50%, #020617 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                                    <img src={uploadedPhoto} alt="runner" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                                </div>
                                                <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to right, rgba(2,6,23,0) 70%, rgba(2,6,23,1) 100%)' }} />
                                                <div style={{ position: 'absolute', bottom: 40, left: 40, zIndex: 10, background: '#fff', padding: 8, borderRadius: 12, width: 90, display: 'flex', flexDirection: 'column', alignItems: 'center', border: '3px solid #4ade80', boxShadow: '0 10px 20px rgba(0,0,0,0.4)' }}>
                                                    <div style={{ width: 70, height: 55, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                                        <span style={{ fontSize: 36, fontWeight: 900, color: '#0f172a', fontFamily: "'Exo 2', sans-serif", fontStyle: 'italic' }}>{_bib}</span>
                                                    </div>
                                                    <p style={{ color: '#64748b', fontSize: 9, fontWeight: 800, textTransform: 'uppercase', marginTop: 4, textAlign: 'center' }}>BIB</p>
                                                </div>
                                            </div>
                                            {/* Right */}
                                            <div style={{ width: '55%', display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: '54px 115px', zIndex: 5 }}>
                                                <div style={{ marginBottom: 43, borderLeft: '6px solid #4ade80', paddingLeft: 20 }}>
                                                    <div style={{ fontSize: 35, fontWeight: 900, textTransform: 'uppercase', lineHeight: 1.1, color: '#fff', margin: 0 }}>{campaignName}</div>
                                                    <p style={{ fontSize: 19, fontWeight: 700, color: '#4ade80', textTransform: 'uppercase', letterSpacing: 2, marginTop: 4 }}>RFID Check-in • Action Timing</p>
                                                </div>
                                                <div style={{ display: 'flex', alignItems: 'flex-end', gap: 10, marginBottom: 54 }}>
                                                    <div style={{ background: 'rgba(255,255,255,0.04)', borderLeft: '10px solid #4ade80', padding: '15px 50px', transform: 'skewX(-15deg)', borderRadius: 6, boxShadow: '15px 15px 30px rgba(0,0,0,0.3)', zIndex: 2 }}>
                                                        <div style={{ transform: 'skewX(15deg)' }}>
                                                            <p style={{ fontSize: 14, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: 6, margin: '0 0 2px' }}>BIB</p>
                                                            <div style={{ fontSize: 160, fontWeight: 900, lineHeight: 0.85, color: '#fff', fontStyle: 'italic', textShadow: '0 4px 10px rgba(0,0,0,0.5)', fontFamily: "'Exo 2', sans-serif", margin: 0 }}>{_bib}</div>
                                                        </div>
                                                    </div>
                                                    {_dist && <div style={{ background: '#ef4444', padding: '10px 34px 10px 48px', transform: 'skewX(-15deg)', borderRadius: 6, marginBottom: 15, marginLeft: -35, zIndex: 1, boxShadow: 'inset 0 0 20px rgba(0,0,0,0.2)', border: '3px solid rgba(255,255,255,0.15)' }}><div style={{ transform: 'skewX(15deg)' }}><span style={{ fontSize: 40, fontWeight: 900, color: '#fff', whiteSpace: 'nowrap', fontStyle: 'italic', letterSpacing: 1 }}>{_dist}</span></div></div>}
                                                </div>
                                                <div style={{ marginBottom: 43 }}>
                                                    <div style={{ color: '#4ade80', fontWeight: 800, fontSize: 19, textTransform: 'uppercase', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 10 }}>
                                                        <span>✅</span> Verified Participant
                                                    </div>
                                                    <div style={{ fontSize: 64, fontWeight: 900, lineHeight: 1.1, color: '#fff', margin: '0 0 5px', textShadow: '0 4px 10px rgba(0,0,0,0.5)' }}>{_nth}</div>
                                                    {_nen && <div style={{ fontSize: 29, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', margin: 0 }}>{_nen}</div>}
                                                </div>
                                                <div style={{ display: 'flex', alignItems: 'center', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 24, padding: '25px 0', backdropFilter: 'blur(10px)', boxShadow: '0 10px 30px rgba(0,0,0,0.2)' }}>
                                                    <div style={{ flex: 1, textAlign: 'center' }}>
                                                        <p style={{ fontSize: 14, fontWeight: 800, textTransform: 'uppercase', letterSpacing: 2, marginBottom: 8, color: '#64748b' }}>Gender</p>
                                                        <p style={{ fontSize: 40, fontWeight: 900, lineHeight: 1, color: '#fff' }}>{_gl}</p>
                                                    </div>
                                                    <div style={{ flex: 1, textAlign: 'center', background: 'rgba(74,222,128,0.06)', borderRadius: 16, margin: '0 15px', padding: '15px 0', border: '1px solid rgba(74,222,128,0.15)' }}>
                                                        <p style={{ fontSize: 14, fontWeight: 800, textTransform: 'uppercase', letterSpacing: 2, marginBottom: 8, color: '#4ade80' }}>Age Group</p>
                                                        <p style={{ fontSize: 56, fontWeight: 900, lineHeight: 1, color: '#4ade80', textShadow: '0 0 20px rgba(74,222,128,0.2)' }}>{_ag}</p>
                                                    </div>
                                                </div>
                                            </div>
                                            <div style={{ position: 'absolute', bottom: 0, left: 0, height: 8, background: '#4ade80', width: '100%', zIndex: 100 }} />
                                            <div style={{ position: 'absolute', bottom: 20, right: 40, fontSize: 11, fontWeight: 800, color: 'rgba(255,255,255,0.2)', textTransform: 'uppercase', letterSpacing: 4, zIndex: 100 }}>Action Timing System</div>
                                        </div>
                                    )}
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
