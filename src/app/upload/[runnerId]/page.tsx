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
    const [cardScale, setCardScale] = useState(0.37);

    const handleDownload = async () => {
        if (!cardRef.current) return;
        const filename = `BIB${runner?.bib || 'photo'}_${runner?.firstNameTh || runner?.firstName || ''}.jpg`;
        try {
            const dataUrl = await toJpeg(cardRef.current, { quality: 0.92, pixelRatio: 1 });
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
        const compute = () => { if (wrapperRef.current) setCardScale(wrapperRef.current.offsetWidth / 1080); };
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
            <link href="https://fonts.googleapis.com/css2?family=Prompt:wght@400;600;700;800;900&display=swap" rel="stylesheet" />
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
                            {/* Scaled 1080×540 card — same JSX as scanning page */}
                            <div style={{ position: 'relative', width: '100%', height: Math.round(540 * cardScale), overflow: 'hidden', borderRadius: 14, marginBottom: 14, boxShadow: '0 15px 40px rgba(0,0,0,0.5)', border: '1px solid rgba(74,222,128,0.2)' }}>
                                <div ref={cardRef} style={{ position: 'absolute', top: 0, left: 0, width: 1080, height: 540, transformOrigin: '0 0', transform: `scale(${cardScale})` }}>
                                    {template === 'classic' ? (
                                        <div style={{ width: 1080, height: 540, background: 'radial-gradient(circle at center, #1e293b 0%, #020617 100%)', display: 'flex', flexDirection: 'column', padding: '26px 50px 0 50px', fontFamily: "'Prompt', Arial, sans-serif", position: 'relative', overflow: 'hidden' }}>
                                            <div style={{ textAlign: 'center', borderBottom: '2px solid rgba(255,255,255,0.1)', paddingBottom: 14, marginBottom: 20 }}>
                                                <div style={{ fontSize: 36, fontWeight: 900, textTransform: 'uppercase', letterSpacing: 2, color: '#fff', lineHeight: 1.1 }}>{campaignName}</div>
                                                <div style={{ fontSize: 17, fontWeight: 700, color: '#4ade80', textTransform: 'uppercase', letterSpacing: 4, marginTop: 4 }}>RFID Check-in • Action Timing</div>
                                            </div>
                                            <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 44 }}>
                                                <div style={{ flexShrink: 0 }}>
                                                    <div style={{ width: 220, height: 220, borderRadius: 22, border: '5px solid #4ade80', overflow: 'hidden', background: '#0f172a', boxShadow: '0 15px 35px rgba(74,222,128,0.2)' }}>
                                                        <img src={uploadedPhoto} alt="runner" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                                    </div>
                                                </div>
                                                <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                                                    <div style={{ color: '#4ade80', fontWeight: 800, fontSize: 20, textTransform: 'uppercase', marginBottom: 8 }}>✅ Verified Runner</div>
                                                    <div style={{ fontSize: 60, fontWeight: 900, lineHeight: 1, marginBottom: 4, color: '#fff' }}>{_nth}</div>
                                                    {_nen && <div style={{ fontSize: 24, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', marginBottom: 16 }}>{_nen}</div>}
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: 18, marginTop: _nen ? 0 : 16 }}>
                                                        {_dist && <div style={{ background: '#ef4444', color: '#fff', padding: '12px 28px', borderRadius: 14, fontSize: 38, fontWeight: 900, boxShadow: '0 8px 20px rgba(239,68,68,0.4)', border: '3px solid rgba(255,255,255,0.2)' }}>{_dist}</div>}
                                                        <div>
                                                            <div style={{ fontSize: 14, fontWeight: 700, color: '#64748b', letterSpacing: 3, textTransform: 'uppercase' }}>BIB</div>
                                                            <div style={{ fontSize: 90, fontWeight: 900, color: '#fff', fontStyle: 'italic', lineHeight: 0.85, textShadow: '0 4px 12px rgba(0,0,0,0.4)' }}>{_bib}</div>
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', background: 'rgba(255,255,255,0.05)', overflow: 'hidden', border: '1px solid rgba(255,255,255,0.1)' }}>
                                                <div style={{ padding: '18px 20px', textAlign: 'center' }}>
                                                    <div style={{ fontSize: 14, fontWeight: 800, textTransform: 'uppercase', letterSpacing: 2, marginBottom: 4, color: '#94a3b8' }}>Gender</div>
                                                    <div style={{ fontSize: 28, fontWeight: 900, color: '#fff' }}>{_gl}</div>
                                                </div>
                                                <div style={{ padding: '18px 20px', textAlign: 'center', background: 'rgba(74,222,128,0.1)' }}>
                                                    <div style={{ fontSize: 14, fontWeight: 800, textTransform: 'uppercase', letterSpacing: 2, marginBottom: 4, color: '#4ade80' }}>Age Group</div>
                                                    <div style={{ fontSize: 28, fontWeight: 900, color: '#4ade80' }}>{_ag}</div>
                                                </div>
                                            </div>
                                            <div style={{ position: 'absolute', bottom: 8, right: 18, fontSize: 10, fontWeight: 800, color: 'rgba(255,255,255,0.12)', textTransform: 'uppercase', letterSpacing: 4 }}>Action Timing System</div>
                                        </div>
                                    ) : (
                                        <div style={{ width: 1080, height: 540, background: 'linear-gradient(135deg, #020617 0%, #0f172a 100%)', display: 'flex', flexDirection: 'row', fontFamily: "'Prompt', Arial, sans-serif", position: 'relative', overflow: 'hidden' }}>
                                            <div style={{ width: '45%', height: '100%', position: 'relative', overflow: 'hidden' }}>
                                                <img src={uploadedPhoto} alt="runner" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                                                <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to right, rgba(2,6,23,0) 70%, rgba(2,6,23,1) 100%)' }} />
                                            </div>
                                            <div style={{ width: '55%', display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: '30px 44px' }}>
                                                <div style={{ marginBottom: 22, borderLeft: '6px solid #4ade80', paddingLeft: 18 }}>
                                                    <div style={{ fontSize: 28, fontWeight: 900, textTransform: 'uppercase', color: '#fff', lineHeight: 1.1 }}>{campaignName}</div>
                                                    <div style={{ fontSize: 14, fontWeight: 700, color: '#4ade80', textTransform: 'uppercase', letterSpacing: 2, marginTop: 4 }}>RFID Check-in • Action Timing</div>
                                                </div>
                                                <div style={{ display: 'flex', alignItems: 'flex-end', marginBottom: 22 }}>
                                                    <div style={{ background: 'rgba(255,255,255,0.04)', borderLeft: '10px solid #4ade80', padding: '10px 36px', transform: 'skewX(-15deg)', borderRadius: 6, zIndex: 2 }}>
                                                        <div style={{ transform: 'skewX(15deg)' }}>
                                                            <div style={{ fontSize: 12, fontWeight: 700, color: '#64748b', letterSpacing: 6, textTransform: 'uppercase' }}>BIB</div>
                                                            <div style={{ fontSize: 108, fontWeight: 900, lineHeight: 0.85, color: '#fff', fontStyle: 'italic' }}>{_bib}</div>
                                                        </div>
                                                    </div>
                                                    {_dist && <div style={{ background: '#ef4444', padding: '8px 26px 8px 38px', transform: 'skewX(-15deg)', borderRadius: 6, marginBottom: 12, marginLeft: -28, zIndex: 1, border: '3px solid rgba(255,255,255,0.15)' }}><div style={{ transform: 'skewX(15deg)' }}><div style={{ fontSize: 32, fontWeight: 900, color: '#fff', fontStyle: 'italic' }}>{_dist}</div></div></div>}
                                                </div>
                                                <div style={{ marginBottom: 22 }}>
                                                    <div style={{ color: '#4ade80', fontWeight: 800, fontSize: 16, textTransform: 'uppercase', marginBottom: 10 }}>✅ Verified Participant</div>
                                                    <div style={{ fontSize: 48, fontWeight: 900, lineHeight: 1.1, color: '#fff', marginBottom: 4 }}>{_nth}</div>
                                                    {_nen && <div style={{ fontSize: 22, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase' }}>{_nen}</div>}
                                                </div>
                                                <div style={{ display: 'flex', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 20, overflow: 'hidden' }}>
                                                    <div style={{ flex: 1, padding: '16px 20px', textAlign: 'center' }}>
                                                        <div style={{ fontSize: 12, fontWeight: 800, textTransform: 'uppercase', letterSpacing: 2, color: '#94a3b8', marginBottom: 4 }}>Gender</div>
                                                        <div style={{ fontSize: 26, fontWeight: 900, color: '#fff' }}>{_gl}</div>
                                                    </div>
                                                    <div style={{ flex: 1, padding: '16px 20px', textAlign: 'center', background: 'rgba(74,222,128,0.08)', borderLeft: '1px solid rgba(74,222,128,0.15)' }}>
                                                        <div style={{ fontSize: 12, fontWeight: 800, textTransform: 'uppercase', letterSpacing: 2, color: '#4ade80', marginBottom: 4 }}>Age Group</div>
                                                        <div style={{ fontSize: 28, fontWeight: 900, color: '#4ade80' }}>{_ag}</div>
                                                    </div>
                                                </div>
                                            </div>
                                            <div style={{ position: 'absolute', bottom: 14, right: 22, fontSize: 10, fontWeight: 800, color: 'rgba(255,255,255,0.15)', textTransform: 'uppercase', letterSpacing: 4 }}>Action Timing System</div>
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
